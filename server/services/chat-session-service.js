// ACMS · 自由对话会话服务（v0.55.1 抽出）
// 所有 chat_sessions / chat_messages 的数据访问都集中在这里。
// 路由层（routes/chat-sessions.js + routes/chat-intent.js free 模式）只做 HTTP 解析 + 调这里。
//
// 公共 API：
//   listSessions(projectId, includeDeleted)     → Session[]
//   createSession(projectId, title?)             → Session
//   getSession(sessionId)                        → Session | null
//   getSessionMessages(sessionId)                → Message[]
//   updateSessionTitle(sessionId, title)         → Session | null
//   softDeleteSession(sessionId)                 → Session | null
//   restoreSession(sessionId)                    → Session | null
//   purgeSession(sessionId)                      → boolean
//   getRecycleBin(projectId)                     → Session[] (含 days_remaining)
//   getRecycleBinCount()                         → number
//
//   appendMessage(sessionId, role, content, meta?)         → Message
//   loadHistoryForLLM(sessionId, limit?)                    → { role, content }[]
//   isFirstUserMessage(sessionId)                           → boolean
//   generateAutoTitle(sessionId, firstUserMsg, currentTitle) → string
//
//   cleanupExpired()                            → number  (硬删数量，cron 用)
//   extractTitleN(title)                        → number
//   newSessionId()                              → string

const crypto = require('crypto');
const { collection } = require('../db/connection');

const RECYCLE_DAYS = 7;
const HISTORY_LIMIT_FOR_LLM = 20;

// ── ID / 时间 ──

function newSessionId() {
  return 'sess-' + crypto.randomBytes(8).toString('hex');
}

function nowIso() {
  return new Date().toISOString();
}

// ── Session CRUD ──

function nextTitleN(projectId) {
  const sessions = listSessions(projectId, false);
  return sessions.length + 1;
}

function listSessions(projectId, includeDeleted) {
  let all = collection('chat_sessions').all();
  if (projectId !== undefined && projectId !== null) {
    all = all.filter(s => s.project_id === projectId);
  }
  if (!includeDeleted) {
    all = all.filter(s => !s.deleted_at);
  }
  return all.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

function createSession(projectId, title) {
  const id = newSessionId();
  const session = {
    id,
    project_id: projectId || null,
    title: (title && title.trim()) || `对话 ${nextTitleN(projectId)}`,
    title_auto: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
  };
  collection('chat_sessions').insert(session);
  return session;
}

function getSession(sessionId) {
  return collection('chat_sessions').findOne(s => s.id === sessionId) || null;
}

function getSessionMessages(sessionId) {
  return collection('chat_messages')
    .find(m => m.session_id === sessionId)
    .sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
}

function updateSessionTitle(sessionId, title) {
  const trimmed = (title || '').trim();
  if (!trimmed) return null;
  return collection('chat_sessions').update(
    s => s.id === sessionId,
    { title: trimmed, title_auto: 0, updated_at: nowIso() }
  );
}

function softDeleteSession(sessionId) {
  return collection('chat_sessions').update(
    s => s.id === sessionId,
    { deleted_at: nowIso(), updated_at: nowIso() }
  );
}

function restoreSession(sessionId) {
  return collection('chat_sessions').update(
    s => s.id === sessionId,
    { deleted_at: null, updated_at: nowIso() }
  );
}

function purgeSession(sessionId) {
  collection('chat_messages').remove(m => m.session_id === sessionId);
  return collection('chat_sessions').remove(s => s.id === sessionId);
}

// ── 回收站 ──

function getRecycleBin(projectId) {
  const cutoff = Date.now() - RECYCLE_DAYS * 24 * 60 * 60 * 1000;
  let sessions = collection('chat_sessions').find(
    s => s.deleted_at && new Date(s.deleted_at).getTime() > cutoff
  );
  if (projectId !== undefined && projectId !== null) {
    sessions = sessions.filter(s => s.project_id === projectId);
  }
  sessions.sort((a, b) => (b.deleted_at || '').localeCompare(a.deleted_at || ''));
  return sessions.map(s => ({
    ...s,
    days_remaining: Math.max(0, Math.ceil(
      (new Date(s.deleted_at).getTime() + RECYCLE_DAYS * 24 * 60 * 60 * 1000 - Date.now())
      / (24 * 60 * 60 * 1000)
    )),
  }));
}

function getRecycleBinCount() {
  const cutoff = Date.now() - RECYCLE_DAYS * 24 * 60 * 60 * 1000;
  return collection('chat_sessions').count(
    s => s.deleted_at && new Date(s.deleted_at).getTime() > cutoff
  );
}

function cleanupExpired() {
  const cutoff = Date.now() - RECYCLE_DAYS * 24 * 60 * 60 * 1000;
  const expired = collection('chat_sessions').find(
    s => s.deleted_at && new Date(s.deleted_at).getTime() <= cutoff
  );
  if (expired.length === 0) return 0;
  const messagesCol = collection('chat_messages');
  let purged = 0;
  for (const s of expired) {
    messagesCol.remove(m => m.session_id === s.id);
    if (collection('chat_sessions').remove(x => x.id === s.id)) purged++;
  }
  return purged;
}

// ── Messages ──

function appendMessage(sessionId, role, content, meta) {
  const msg = {
    session_id: sessionId,
    role,
    content: content || '',
    attachments_json: null,
    meta_json: meta ? JSON.stringify(meta) : null,
    ts: nowIso(),
  };
  collection('chat_messages').insert(msg);
  // 顺手更新 session.updated_at（保持列表排序按最近活跃）
  collection('chat_sessions').update(
    s => s.id === sessionId,
    { updated_at: nowIso() }
  );
  return msg;
}

function loadHistoryForLLM(sessionId, limit) {
  const lim = limit || HISTORY_LIMIT_FOR_LLM;
  const all = getSessionMessages(sessionId);
  return all.slice(-lim).map(m => ({ role: m.role, content: m.content }));
}

function isFirstUserMessage(sessionId) {
  const msgs = collection('chat_messages').find(m => m.session_id === sessionId);
  return !msgs.some(m => m.role === 'user');
}

// ── 标题自动生成 ──

function extractTitleN(title) {
  if (typeof title !== 'string') return 1;
  const m = title.match(/^对话\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}

function generateAutoTitle(firstUserMsg, currentTitle) {
  const trimmed = (firstUserMsg || '').trim().replace(/^@\s*/, '');
  const first10 = trimmed.slice(0, 10);
  const truncated = trimmed.length > 10;
  return `对话 ${extractTitleN(currentTitle)} · ${first10}${truncated ? '…' : ''}`;
}

// ── 导出 ──

module.exports = {
  // ID / 时间
  newSessionId,
  nowIso,
  // Session CRUD
  nextTitleN,
  listSessions,
  createSession,
  getSession,
  getSessionMessages,
  updateSessionTitle,
  softDeleteSession,
  restoreSession,
  purgeSession,
  // Recycle bin
  getRecycleBin,
  getRecycleBinCount,
  cleanupExpired,
  // Messages
  appendMessage,
  loadHistoryForLLM,
  isFirstUserMessage,
  // Title
  extractTitleN,
  generateAutoTitle,
  // Constants (供测试或上层使用)
  RECYCLE_DAYS,
  HISTORY_LIMIT_FOR_LLM,
};