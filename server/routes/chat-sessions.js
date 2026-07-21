// ACMS · 自由对话会话路由（v0.55.1 thin 层）
// 只做 HTTP 解析 + 调 service 层。所有数据访问逻辑在 services/chat-session-service.js。
//
//   - POST   /api/chat-sessions                       新建空会话
//   - GET    /api/chat-sessions                       列表
//   - GET    /api/chat-sessions/:id                  详情
//   - GET    /api/chat-sessions/:id/messages         消息历史
//   - PATCH  /api/chat-sessions/:id                  改标题
//   - DELETE /api/chat-sessions/:id                  软删
//   - POST   /api/chat-sessions/:id/restore          恢复
//   - DELETE /api/chat-sessions/:id/purge            硬删
//   - GET    /api/chat-sessions/recycle-bin/list     回收站列表
//   - GET    /api/chat-sessions/recycle-bin/count    回收站数量

const express = require('express');
const router = express.Router();
const svc = require('../services/chat-session-service');

router.post('/', (req, res) => {
  try {
    const { project_id = null, title } = req.body || {};
    const session = svc.createSession(project_id, title);
    res.json({ session });
  } catch (e) {
    console.error('[chat-sessions] POST / error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

router.get('/', (req, res) => {
  try {
    const { project_id, include_deleted } = req.query;
    const sessions = svc.listSessions(
      project_id !== undefined ? project_id : undefined,
      include_deleted === 'true'
    );
    res.json({ sessions });
  } catch (e) {
    console.error('[chat-sessions] GET / error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const session = svc.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'NOT_FOUND' });
    const messages = svc.getSessionMessages(req.params.id);
    res.json({ session, message_count: messages.length });
  } catch (e) {
    console.error('[chat-sessions] GET /:id error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

router.get('/:id/messages', (req, res) => {
  try {
    const messages = svc.getSessionMessages(req.params.id);
    res.json({ messages });
  } catch (e) {
    console.error('[chat-sessions] GET /:id/messages error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const { title } = req.body || {};
    if (typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'INVALID_TITLE' });
    }
    const updated = svc.updateSessionTitle(req.params.id, title);
    if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ session: updated });
  } catch (e) {
    console.error('[chat-sessions] PATCH /:id error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const updated = svc.softDeleteSession(req.params.id);
    if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ session: updated, soft_deleted: true });
  } catch (e) {
    console.error('[chat-sessions] DELETE /:id error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

router.post('/:id/restore', (req, res) => {
  try {
    const updated = svc.restoreSession(req.params.id);
    if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ session: updated, restored: true });
  } catch (e) {
    console.error('[chat-sessions] POST /:id/restore error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

router.delete('/:id/purge', (req, res) => {
  try {
    const removed = svc.purgeSession(req.params.id);
    if (!removed) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ purged: true });
  } catch (e) {
    console.error('[chat-sessions] DELETE /:id/purge error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

router.get('/recycle-bin/list', (req, res) => {
  try {
    const { project_id } = req.query;
    const sessions = svc.getRecycleBin(
      project_id !== undefined ? project_id : undefined
    );
    res.json({ sessions });
  } catch (e) {
    console.error('[chat-sessions] GET /recycle-bin/list error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

router.get('/recycle-bin/count', (req, res) => {
  try {
    res.json({ count: svc.getRecycleBinCount() });
  } catch (e) {
    console.error('[chat-sessions] GET /recycle-bin/count error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

// v0.58.5: 一键清空回收站（用户主动操作，不等过期）
router.delete('/recycle-bin/purge-all', (req, res) => {
  try {
    const purged = svc.purgeAllSessions();
    res.json({ purged: true, count: purged });
  } catch (e) {
    console.error('[chat-sessions] DELETE /recycle-bin/purge-all error:', e);
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

module.exports = router;