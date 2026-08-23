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

// v0.58.5: 用户主动清空回收站（不等过期）— 硬删所有 deleted_at 非空的会话及其消息
function purgeAllSessions() {
  const sessions = collection('chat_sessions').find(s => s.deleted_at);
  if (sessions.length === 0) return 0;
  const messagesCol = collection('chat_messages');
  let purged = 0;
  for (const s of sessions) {
    messagesCol.remove(m => m.session_id === s.id);
    if (collection('chat_sessions').remove(x => x.id === s.id)) purged++;
  }
  return purged;
}

// v0.117：清理会话消息（自由对话补"清理"功能，类比 requirement clean）
//   session 没有 supplement_history 字段，聊条存在 chat_messages 表
//   按 mode（all/user/assistant/system/ai/selected）删 role 匹配的记录
//   selected 模式按 indices（chat_messages 数组下标）精确删除
function cleanSessionMessages(sessionId, opts = {}) {
  const session = getSession(sessionId);
  if (!session) return { error: 'NOT_FOUND' };

  const mode = opts.mode || 'all';
  const all = getSessionMessages(sessionId);
  let removed = 0;
  let keepIndices;
  let label;

  if (mode === 'selected' && Array.isArray(opts.indices) && opts.indices.length > 0) {
    const removeIdxSet = new Set(opts.indices.map(Number).filter(i => i >= 0 && i < all.length));
    keepIndices = all.map((_, i) => i).filter(i => !removeIdxSet.has(i));
    removed = removeIdxSet.size;
    label = `选中条目 ${opts.indices.length} 条`;
  } else {
    const rolesToRemove = {
      all: ['user', 'assistant', 'system'],
      user: ['user'],
      assistant: ['assistant'],
      system: ['system'],
      ai: ['assistant', 'system'],
    };
    const targets = rolesToRemove[mode];
    if (!targets) return { error: `未知清理模式: ${mode}`, entries_removed: 0 };
    keepIndices = all.map((m, i) => (targets.includes(m.role) ? -1 : i)).filter(i => i >= 0);
    removed = all.length - keepIndices.length;
    label = { all: '全部', user: '用户', assistant: 'AI 回答', system: '系统参考', ai: 'AI 回答+系统参考' }[mode] || mode;
  }

  // 按 (session_id, ts) 删除 chat_messages 记录（保证唯一性）
  const messagesCol = collection('chat_messages');
  for (let i = 0; i < all.length; i++) {
    if (!keepIndices.includes(i)) {
      const m = all[i];
      messagesCol.remove(x => x.session_id === sessionId && x.ts === m.ts);
    }
  }

  // 更新 session.updated_at
  collection('chat_sessions').update(
    s => s.id === sessionId,
    { updated_at: nowIso() }
  );

  return {
    entries_removed: removed,
    history_remaining: keepIndices.length,
    note: `已清理 ${label} 共 ${removed} 条对话记录${keepIndices.length > 0 ? `，剩余 ${keepIndices.length} 条` : ''}`,
  };
}

// v0.117d：自由对话 session → 创建隐藏 requirement（共享 chat-intent.js 逻辑）
//   让 /requirements/:id/assist/:method + /stream 接受 sess-xxx 自动 resolve
//   → connectAssistStream 在自由对话模式可直接复用主流程 SSE 流式卡片
//   不重复 chat-intent.js:21 的实现（避免回归），新写一份独立函数
function getOrCreateSessionRequirement(sessionId) {
  if (!sessionId) return null;
  try {
    const { collection } = require('../db/connection');
    const mem = collection('buddy_memory').findOne(m => m.key === 'session_req:' + sessionId);
    if (mem) {
      const existing = reqStore.getById(mem.value);
      if (existing) return existing;
    }
    const projectSlug = 'agent-buddy-actions';
    const projectStore = require('../stores/project-store');
    let project = collection('projects').findOne(p => p.slug === projectSlug);
    if (!project) {
      project = projectStore.create({
        name: '小吉动作记录', slug: projectSlug,
        description: '小吉即时聊天动作的隐藏运行容器。',
        owner: 'system',
      });
      collection('projects').update(p => p.id === project.id, { system_project: 1 });
      project = collection('projects').findOne(p => p.id === project.id) || project;
    }
    const req = reqStore.create({
      projectId: project.id,
      title: '自由对话会话 · ' + sessionId,
      description: '自由对话会话的隐藏运行容器（音乐/视频/图片等辅助工具）。',
      createdBy: 'system', status: 'idea', role: 'system',
    });
    reqStore.update(req.id, { chat_mode: 'free', system_record: 1 });
    const value = req.id;
    if (mem) {
      collection('buddy_memory').update(m => m.key === 'session_req:' + sessionId, { value, updated_at: new Date().toISOString() });
    } else {
      collection('buddy_memory').insert({ key: 'session_req:' + sessionId, user_id: 'system', value, updated_at: new Date().toISOString() });
    }
    return reqStore.getById(req.id);
  } catch (e) {
    console.warn('[chat-session-service.getOrCreateSessionRequirement] 失败:', e.message);
    return null;
  }
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
  purgeAllSessions,
  // Messages
  appendMessage,
  loadHistoryForLLM,
  isFirstUserMessage,
  cleanSessionMessages,  // v0.117: 自由对话清理消息
  getOrCreateSessionRequirement,  // v0.117d: 自由对话 → hidden REQ 解析（供 requirements.js 路由用）
  // Title
  extractTitleN,
  generateAutoTitle,
  // Constants (供测试或上层使用)
  RECYCLE_DAYS,
  HISTORY_LIMIT_FOR_LLM,
};