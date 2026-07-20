// ACMS · 自由对话会话路由（v0.55 多窗口 + 历史持久化 + 回收站）
//   - POST   /api/chat-sessions                       新建空会话（默认 "对话 N"）
//   - GET    /api/chat-sessions                       列表（默认排除已删）
//   - GET    /api/chat-sessions/:id                  详情
//   - GET    /api/chat-sessions/:id/messages         消息历史（按 ts asc）
//   - PATCH  /api/chat-sessions/:id                  改标题（同时 title_auto=0）
//   - DELETE /api/chat-sessions/:id                  软删（deleted_at = now）
//   - POST   /api/chat-sessions/:id/restore          恢复 deleted_at = null
//   - DELETE /api/chat-sessions/:id/purge            硬删（含所有 messages）
//   - GET    /api/chat-sessions/recycle-bin/list      回收站列表（7 天内未过期）
//   - GET    /api/chat-sessions/recycle-bin/count     回收站数量（启动菜单 badge）
//
// 设计要点：
//   - session_id 用 uuid-ish 字符串（`sess-${hex}`），防枚举
//   - 软删：deleted_at 标记；7 天后清理任务硬删
//   - 默认标题：`对话 N`（N = project 下未删 session 数 + 1）
//   - 标题自动生成：`对话 N · 首句前 10 字`（由 chat-intent.js 在首条 user message 后触发）
//   - 不绑 user_id（ACMS 当前单用户场景，多用户场景 v2.0 再加）

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { collection } = require('../db/connection');

const RECYCLE_DAYS = 7; // 回收站保留天数

// ── 工具函数 ──
function newSessionId() {
  return 'sess-' + crypto.randomBytes(8).toString('hex');
}

function nowIso() {
  return new Date().toISOString();
}

// 计算默认序号 N（project 下未删 session 数 + 1）
function nextTitleN(projectId) {
  const sessions = collection('chat_sessions').find(s =>
    s.project_id === projectId && !s.deleted_at
  );
  return sessions.length + 1;
}

// ── 路由 ──

// POST /api/chat-sessions
// body: { project_id?: string, title?: string }
router.post('/', (req, res) => {
  try {
    const { project_id = null, title } = req.body || {};
    const id = newSessionId();
    const session = {
      id,
      project_id,
      title: title || `对话 ${nextTitleN(project_id)}`,
      title_auto: 1,
      created_at: nowIso(),
      updated_at: nowIso(),
      deleted_at: null,
    };
    collection('chat_sessions').insert(session);
    res.json({ session });
  } catch (e) {
    console.error('[chat-sessions] POST / error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

// GET /api/chat-sessions?project_id=&include_deleted=
router.get('/', (req, res) => {
  try {
    const { project_id, include_deleted } = req.query;
    let sessions = collection('chat_sessions').all();
    if (project_id !== undefined) {
      sessions = sessions.filter(s => s.project_id === project_id);
    }
    if (!include_deleted || include_deleted === 'false') {
      sessions = sessions.filter(s => !s.deleted_at);
    }
    sessions.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    res.json({ sessions });
  } catch (e) {
    console.error('[chat-sessions] GET / error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

// GET /api/chat-sessions/:id  （详情；不含 messages，前端按需单独拉）
router.get('/:id', (req, res) => {
  try {
    const session = collection('chat_sessions').findOne(s => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'NOT_FOUND' });
    const msgCount = collection('chat_messages').count(m => m.session_id === req.params.id);
    res.json({ session, message_count: msgCount });
  } catch (e) {
    console.error('[chat-sessions] GET /:id error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

// GET /api/chat-sessions/:id/messages
router.get('/:id/messages', (req, res) => {
  try {
    const messages = collection('chat_messages')
      .find(m => m.session_id === req.params.id)
      .sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
    res.json({ messages });
  } catch (e) {
    console.error('[chat-sessions] GET /:id/messages error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

// PATCH /api/chat-sessions/:id
// body: { title }
router.patch('/:id', (req, res) => {
  try {
    const { title } = req.body || {};
    if (typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'INVALID_TITLE' });
    }
    const updated = collection('chat_sessions').update(
      s => s.id === req.params.id,
      { title: title.trim(), title_auto: 0, updated_at: nowIso() }
    );
    if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ session: updated });
  } catch (e) {
    console.error('[chat-sessions] PATCH /:id error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

// DELETE /api/chat-sessions/:id  → 软删
router.delete('/:id', (req, res) => {
  try {
    const updated = collection('chat_sessions').update(
      s => s.id === req.params.id,
      { deleted_at: nowIso(), updated_at: nowIso() }
    );
    if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ session: updated, soft_deleted: true });
  } catch (e) {
    console.error('[chat-sessions] DELETE /:id error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

// POST /api/chat-sessions/:id/restore  → 恢复
router.post('/:id/restore', (req, res) => {
  try {
    const updated = collection('chat_sessions').update(
      s => s.id === req.params.id,
      { deleted_at: null, updated_at: nowIso() }
    );
    if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ session: updated, restored: true });
  } catch (e) {
    console.error('[chat-sessions] POST /:id/restore error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

// DELETE /api/chat-sessions/:id/purge  → 硬删（含所有 messages）
router.delete('/:id/purge', (req, res) => {
  try {
    const messagesCol = collection('chat_messages');
    messagesCol.remove(m => m.session_id === req.params.id);
    const removed = collection('chat_sessions').remove(s => s.id === req.params.id);
    if (!removed) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ purged: true });
  } catch (e) {
    console.error('[chat-sessions] DELETE /:id/purge error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

// GET /api/chat-sessions/recycle-bin/list?project_id=
// 列出 7 天内未过期的已删 session
router.get('/recycle-bin/list', (req, res) => {
  try {
    const { project_id } = req.query;
    const cutoff = Date.now() - RECYCLE_DAYS * 24 * 60 * 60 * 1000;
    let sessions = collection('chat_sessions').find(s => s.deleted_at && new Date(s.deleted_at).getTime() > cutoff);
    if (project_id !== undefined) {
      sessions = sessions.filter(s => s.project_id === project_id);
    }
    sessions.sort((a, b) => (b.deleted_at || '').localeCompare(a.deleted_at || ''));
    // 计算剩余天数（前端显示）
    const enriched = sessions.map(s => ({
      ...s,
      days_remaining: Math.max(0, Math.ceil((new Date(s.deleted_at).getTime() + RECYCLE_DAYS * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000))),
    }));
    res.json({ sessions: enriched });
  } catch (e) {
    console.error('[chat-sessions] GET /recycle-bin/list error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

// GET /api/chat-sessions/recycle-bin/count
router.get('/recycle-bin/count', (req, res) => {
  try {
    const cutoff = Date.now() - RECYCLE_DAYS * 24 * 60 * 60 * 1000;
    const count = collection('chat_sessions').count(s => s.deleted_at && new Date(s.deleted_at).getTime() > cutoff);
    res.json({ count });
  } catch (e) {
    console.error('[chat-sessions] GET /recycle-bin/count error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

module.exports = router;