// ACMS appRuntime REST API（v0.59+）
// 配合 services/app-runtime.js 使用：
//   - POST /api/app-runtime/open       { url, w?, h? } → { sessionId, url, w, h }
//   - POST /api/app-runtime/close      { sessionId }    → { ok }
//   - GET  /api/app-runtime/sessions                   → { sessions: [...] }
//
// 设计：会话由前端 WS 路径持有；HTTP 只做 create / list / destroy。
// 鉴权跟其它 /api/* 一致 — 全局 authMiddleware 自动罩住。

const express = require('express');
const router = express.Router();
const appRuntime = require('../services/app-runtime');

// ── 打开（创建 session） ──
// ── Native shell：直接打开可见 Chromium app 窗口 ──
router.post('/native-shell/open', async (req, res) => {
  const { appId, url, w, h } = req.body || {};
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'NO_URL' });
  if (url.length > 2048) return res.status(400).json({ error: 'URL_TOO_LONG' });
  try {
    const shell = await appRuntime.openNativeShell({ appId, url, w, h });
    res.json({ ok: true, shell });
  } catch (e) {
    console.error('[app-runtime] native-shell/open 失败:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/native-shell/close', async (req, res) => {
  const { appId } = req.body || {};
  if (!appId) return res.status(400).json({ error: 'NO_APP_ID' });
  const closed = await appRuntime.closeNativeShell(String(appId));
  res.json({ ok: true, closed });
});

router.get('/native-shells', (req, res) => {
  res.json({ shells: appRuntime.listNativeShells() });
});

router.post('/open', async (req, res) => {
  const { url, w, h } = req.body || {};
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'NO_URL' });
  // 简单 URL 校验（不是协议头也允许，后面会在 service 内补 http://）
  if (url.length > 2048) return res.status(400).json({ error: 'URL_TOO_LONG' });

  try {
    const session = await appRuntime.openSession({
      url,
      w: Math.min(Math.max(parseInt(w) || 1024, 320), 3840),
      h: Math.min(Math.max(parseInt(h) || 700, 240), 2160),
    });
    res.json({ ok: true, session });
  } catch (e) {
    console.error('[app-runtime] /open 失败:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── 关闭 ──
router.post('/close', async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: 'NO_SESSION_ID' });
  if (!appRuntime.hasSession(sessionId)) return res.json({ ok: true, alreadyClosed: true });
  await appRuntime.closeSession(sessionId);
  res.json({ ok: true });
});

// ── 远程输入：单次事件转发（远程预览 canvas 用）──
router.post('/input', async (req, res) => {
  const { sessionId, type, ...event } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: 'NO_SESSION_ID' });
  if (!type) return res.status(400).json({ error: 'NO_EVENT_TYPE' });
  try {
    const rsp = await appRuntime.input(sessionId, { type, ...event });
    if (rsp && rsp.error) return res.status(400).json(rsp);
    res.json(rsp || { ok: true });
  } catch (e) {
    console.error('[app-runtime] /input 失败:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── 列表（调试 / 状态查询） ──
router.get('/sessions', (req, res) => {
  res.json({ sessions: appRuntime.listSessions() });
});

module.exports = router;
