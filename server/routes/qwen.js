// ============================================================
// routes/qwen.js — Qwen Code 内核 HTTP API（Phase B2）
// ============================================================
// 端点：
//   GET  /api/qwen/status            — 会话池状态 + 待审批数
//   POST /api/qwen/chat              — 对话 { userId, prompt, cwd, modelId, timeoutMs, approvalMode }
//   POST /api/qwen/release           — 释放会话 { userId }
//   POST /api/qwen/interrupt         — 🆕 v0.119 中断当前 turn { userId? }
//   POST /api/qwen/continue          — 🆕 v0.119 续转被中断 turn { userId? }
//   POST /api/qwen/config            — 运行配置（开关/并发/空闲回收，持久化 system_configs）
//   GET  /api/qwen/approvals/pending — 待审批列表 ?userId=
//   POST /api/qwen/approvals/:id     — 审批决策 { decision: 'allow'|'deny' }
// ============================================================
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const qwenManager = require('../services/qwen-manager');

// GET /api/qwen/status
router.get('/status', authMiddleware, (req, res) => {
  const m = qwenManager.getManager();
  const stats = m.getStats();
  const userId = req.user && (req.user.id || req.user.userId);
  const pending = qwenManager.listPendingApprovals(userId || undefined);
  res.json({
    ok: true,
    enabled: qwenManager.getConfig().enabled,
    config: qwenManager.getConfig(),
    pendingApprovals: pending.length,
    ...stats,
  });
});

// POST /api/qwen/chat
router.post('/chat', authMiddleware, async (req, res) => {
  const { userId, prompt, cwd, modelId, timeoutMs, approvalMode } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId 必填' });
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt 必填' });
  }
  if (!qwenManager.getConfig().enabled) {
    return res.status(403).json({ error: 'Qwen 内核未启用（POST /api/qwen/config 开启）' });
  }
  try {
    const result = await qwenManager.chat(userId, prompt, {
      cwd: cwd || undefined,
      modelId: modelId || undefined,
      timeoutMs: timeoutMs || undefined,
      approvalMode: approvalMode || undefined,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/qwen/approvals/pending
router.get('/approvals/pending', authMiddleware, (req, res) => {
  const userId = req.query.userId || (req.user && (req.user.id || req.user.userId));
  res.json({ ok: true, approvals: qwenManager.listPendingApprovals(userId || undefined) });
});

// POST /api/qwen/approvals/:id
router.post('/approvals/:id', authMiddleware, (req, res) => {
  const body = req.body || {};
  const decision = body.decision || '';
  const allowed = decision === 'allow' || decision === 'allowed' || decision === true;
  // v0.114i: ask_user_question 场景前端提交 answers（{ '0': '回答1', '1': '...' }）
  const answers = (body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers))
    ? body.answers : null;
  const payload = answers ? { allowed, answers } : allowed;
  // 🆕 v0.115b: alwaysAllow=true → 本会话内此类操作自动通过（settleApproval 记录到会话集合）
  const done = qwenManager.settleApproval(req.params.id, payload, body.alwaysAllow ? { alwaysAllow: true } : undefined);
  if (!done) return res.status(404).json({ error: '审批不存在或已处理' });
  res.json({ ok: true, decision: allowed ? 'allow' : 'deny', answered: !!answers, alwaysAllow: !!body.alwaysAllow });
});

// POST /api/qwen/release
router.post('/release', authMiddleware, async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId 必填' });
  try {
    await qwenManager.getManager().release(userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 🆕 v0.119：中断当前 turn（按 userId 找 session → control_request {subtype:"interrupt"}）
//   适用于 free chat 和小吉（小吉 session 按 userId 共享；free chat sessionId 也是 userId 维度）
//   返回 {ok, sessionId, reason}：ok=false + reason='no_session' 表示 session 已 idle reaped
router.post('/interrupt', authMiddleware, async (req, res) => {
  const userId = (req.body && req.body.userId) || (req.user && (req.user.id || req.user.userId));
  if (!userId) return res.status(400).json({ error: 'userId 必填' });
  try {
    const r = await qwenManager.interrupt(userId);
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 🆕 v0.119：续转被中断的 turn（按 userId 找 session → control_request {subtype:"continue_last_turn"}）
//   CLI 会扫 history 末态自动判断：interrupted_prompt → 重发用户 input；interrupted_turn → 合成失败 tool_result
router.post('/continue', authMiddleware, async (req, res) => {
  const userId = (req.body && req.body.userId) || (req.user && (req.user.id || req.user.userId));
  if (!userId) return res.status(400).json({ error: 'userId 必填' });
  try {
    const r = await qwenManager.continueLastTurn(userId);
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/qwen/config
router.post('/config', authMiddleware, (req, res) => {
  const { enabled, maxSessions, idleTimeoutMs } = req.body || {};
  res.json({ ok: true, config: qwenManager.setConfig({ enabled, maxSessions, idleTimeoutMs }) });
});

// B6b: 人设读写
router.get('/persona', authMiddleware, (req, res) => {
  res.json({ ok: true, ...qwenManager.getPersonaForEdit() });
});
router.post('/persona', authMiddleware, (req, res) => {
  const { persona } = req.body || {};
  res.json({ ok: true, ...qwenManager.setPersona(persona) });
});

module.exports = router;
