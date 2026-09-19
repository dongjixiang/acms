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
const reqStore = require('../stores/requirement-store');  // 🆕 v0.117cc: getOrCreateSessionRequirement 需要（漏 import 导致 SESSION_REQ_NOT_FOUND）

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

  // ═══ v0.22.51：自由对话的工具结果卡片存在「隐藏 requirement 的 supplement_history」═══
  //   清理必须一起覆盖，否则卡片永远清不掉（用户点「清理成功」但卡片仍在 = toast 骗人），
  //   而且这些僵尸卡片会在水位线错位时被当成新消息重新刷进聊天框。
  //   映射：mode='all' / 'system' / 'ai' → 清空全部卡片（卡片条目 role 都是 system）
  //         mode='selected' + cardIndices → 精确删除
  //         mode='user' / 'assistant'      → 卡片不动
  //   只读查找隐藏 requirement（不去 getOrCreate，避免给没用过工具的会话凭空建记录）
  let cardsRemoved = 0;
  let cardsRemaining = 0;
  try {
    const mem = collection('buddy_memory').findOne(m => m.key === 'session_req:' + sessionId);
    const sessionReq = mem ? reqStore.getById(mem.value) : null;
    if (sessionReq) {
      let hist = [];
      try { hist = JSON.parse(sessionReq.supplement_history || '[]'); } catch { hist = []; }
      if (Array.isArray(hist)) {
        let keep = hist;
        if (mode === 'all' || mode === 'system' || mode === 'ai') {
          keep = [];
        } else if (mode === 'selected') {
          const rm = new Set((Array.isArray(opts.cardIndices) ? opts.cardIndices : [])
            .map(n => parseInt(n, 10))
            .filter(n => Number.isInteger(n) && n >= 0 && n < hist.length));
          keep = hist.filter((_, i) => !rm.has(i));
        }
        cardsRemoved = hist.length - keep.length;
        cardsRemaining = keep.length;
        if (cardsRemoved > 0) {
          reqStore.update(sessionReq.id, { supplement_history: JSON.stringify(keep) });
        }
      }
    }
  } catch (e) {
    console.warn('[chat-sessions] 清理工具卡片失败:', e.message);
  }

  const totalRemoved = removed + cardsRemoved;
  return {
    entries_removed: totalRemoved,
    messages_removed: removed,
    cards_removed: cardsRemoved,
    history_remaining: keepIndices.length,
    cards_remaining: cardsRemaining,
    note: `已清理 ${label} 共 ${totalRemoved} 条记录（💬 文字 ${removed} · 🧩 卡片 ${cardsRemoved}）${keepIndices.length + cardsRemaining > 0 ? `，剩余 ${keepIndices.length + cardsRemaining} 条` : ''}`,
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

// ── v0.121 对话工作区窗口上下文 ──
//   前端 file-picker 打开/选中窗口时注册（POST /:id/ctx）；
//   chat-intent 拼 prompt 时读 active 那条，只注入"当前选中窗口"的引用（正文按需 read_window_content 读）
function upsertWindowCtx(sessionId, ctx) {
  if (!sessionId || !ctx || !ctx.windowId) return null;
  const col = collection('chat_window_ctx');
  // v0.121k 治本：窗口 id 是 per-页面 的计数器（aw-1/aw-2…），页面刷新后重新从 0 数 →
  //   新窗口会复用旧 id，而旧会话的同 id 记录还留在表里。
  //   getWindowById 用 findOne 只按 window_id 查 → 命中旧记录 →
  //   AI 读到的是**上一个会话的文件**（实测：sprties/README.md 被读成《星星的故事》）。
  //   所以注册时必须把同 window_id 的其它会话记录清掉（这个 id 现在归当前会话了）。
  try { col.remove(r => r.window_id === ctx.windowId && r.session_id !== sessionId); } catch (e) {}
  const where = r => r.session_id === sessionId && r.window_id === ctx.windowId;
  const doc = {
    session_id: sessionId,
    window_id: ctx.windowId,
    view: ctx.view || null,
    name: ctx.name || null,
    file_path: ctx.filePath || null,
    file_id: ctx.fileId || null,
    inject_mode: ctx.injectMode === 'full' ? 'full' : 'ref',   // v0.121d: ref(引用+按需) | full(直接带正文)
    active: 1,
    updated_at: nowIso(),
  };
  if (col.findOne(where)) col.update(where, doc);
  else col.insert(doc);
  // 同一会话只保留一个 active
  col.update(r => r.session_id === sessionId && r.window_id !== ctx.windowId, { active: 0 });
  return doc;
}

function getActiveWindow(sessionId) {
  try { return collection('chat_window_ctx').findOne(r => r.session_id === sessionId && r.active === 1) || null; }
  catch (e) { return null; }
}

function getWindowByIdInSession(sessionId, windowId) {
  try {
    return collection('chat_window_ctx').findOne(r => r.session_id === sessionId && r.window_id === windowId) || null;
  } catch (e) { return null; }
}

function getWindowById(windowId) {
  try { return collection('chat_window_ctx').findOne(r => r.window_id === windowId) || null; }
  catch (e) { return null; }
}

function clearWindowCtx(sessionId) {
  try { collection('chat_window_ctx').remove(r => r.session_id === sessionId); } catch (e) {}
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
  // v0.121 对话工作区窗口上下文
  upsertWindowCtx,
  getActiveWindow,
  getWindowById,
  getWindowByIdInSession,
  clearWindowCtx,
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