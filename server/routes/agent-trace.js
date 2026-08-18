// Agent 运行追踪 API — v0.101 (2026-08-18)
// 配套 server/services/agent-trace.js
// 端点：
//   GET    /api/agent-trace/config        → { enabled } 开关状态
//   POST   /api/agent-trace/config        → { enabled } 开关切换
//   GET    /api/agent-trace               → 追踪列表（最近 N 条，轻量）
//   GET    /api/agent-trace/:id           → 单条完整 JSON
//   GET    /api/agent-trace/:id/report    → 自包含 HTML 报告
//   DELETE /api/agent-trace/:id           → 删除
const express = require('express');
const router = express.Router();
const traceSvc = require('../services/agent-trace');

// 开关状态
router.get('/config', (req, res) => {
  res.json(traceSvc.getConfig());
});

// 开关切换
router.post('/config', (req, res) => {
  const enabled = !!req.body.enabled;
  const newVal = traceSvc.setTraceEnabled(enabled);
  res.json({ success: true, enabled: newVal });
});

// 追踪列表
router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 20;
  res.json({ traces: traceSvc.listTraces(limit) });
});

// 单条 JSON（完整）
router.get('/:id', (req, res) => {
  const trace = traceSvc.getTrace(req.params.id);
  if (!trace) return res.status(404).json({ error: 'TRACE_NOT_FOUND', message: '追踪记录不存在: ' + req.params.id });
  res.json(trace);
});

// HTML 报告
router.get('/:id/report', (req, res) => {
  const trace = traceSvc.getTrace(req.params.id);
  if (!trace) return res.status(404).json({ error: 'TRACE_NOT_FOUND', message: '追踪记录不存在: ' + req.params.id });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(traceSvc.renderHtml(trace));
});

// 删除
router.delete('/:id', (req, res) => {
  const trace = traceSvc.getTrace(req.params.id);
  if (!trace) return res.status(404).json({ error: 'TRACE_NOT_FOUND', message: '追踪记录不存在: ' + req.params.id });
  traceSvc.deleteTrace(req.params.id);
  res.json({ success: true, id: req.params.id });
});

module.exports = router;
