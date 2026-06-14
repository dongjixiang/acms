// 系统管理 API
const express = require('express');
const router = express.Router();
const { collection } = require('../db/connection');
const eventBus = require('../services/event-bus');
const os = require('os');

// 系统状态
router.get('/status', (req, res) => {
  const projCount = collection('projects').count();
  const reqCount = collection('requirements').count();
  const taskCount = collection('tasks').count();
  const agentCount = collection('agents').count();
  const eventCount = collection('events').count();

  res.json({
    uptime: Math.floor(process.uptime()),
    memory: { used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB', total: Math.round(os.totalmem() / 1024 / 1024) + 'MB' },
    node: process.version,
    platform: os.platform() + ' ' + os.arch(),
    counts: { projects: projCount, requirements: reqCount, tasks: taskCount, agents: agentCount, events: eventCount },
  });
});

// 审计日志
router.get('/events', (req, res) => {
  const { type, limit } = req.query;
  res.json(eventBus.query({ type, limit: parseInt(limit) || 50 }));
});

// 数据管理：备份
router.post('/backup', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const src = path.join(__dirname, '..', '..', 'data', 'acms.json');
  const bak = path.join(__dirname, '..', '..', 'data', `acms-backup-${Date.now()}.json`);
  try {
    fs.copyFileSync(src, bak);
    res.json({ success: true, backup: bak });
  } catch (e) { res.status(500).json({ error: 'BACKUP_FAILED', message: e.message }); }
});

// 数据管理：清理
router.post('/cleanup', (req, res) => {
  const { type } = req.body;
  let count = 0;
  if (type === 'events') {
    const before = collection('events').count();
    // 只保留最近1000条
    const events = collection('events').all();
    if (events.length > 1000) {
      events.sort((a, b) => b.timestamp - a.timestamp);
      const toRemove = events.slice(1000);
      for (const e of toRemove) collection('events').remove(ev => ev.id === e.id);
      count = toRemove.length;
    }
  } else if (type === 'abandoned') {
    const reqs = collection('requirements').find(r => r.status === 'abandoned');
    for (const r of reqs) collection('requirements').remove(rr => rr.id === r.id);
    count = reqs.length;
  }
  res.json({ success: true, cleaned: count, type });
});

// Token 用量统计
router.get('/token-stats', (req, res) => {
  const tracker = require('../services/token-tracker');
  const projectId = req.query.projectId;
  if (projectId) {
    return res.json(tracker.getProjectStats(projectId));
  }
  res.json(tracker.getGlobalStats());
});

// Token 调用明细
router.get('/token-logs', (req, res) => {
  const tracker = require('../services/token-tracker');
  const projectId = req.query.projectId || '';
  const limit = parseInt(req.query.limit) || 20;
  res.json(tracker.getLogs(projectId, limit));
});

// v0.3.6：默认思路模型配置
router.get('/default-gen-model', (req, res) => {
  const modelStore = require('../stores/model-store');
  const m = modelStore.getDefaultGenModel();
  res.json({ id: m?.id || null, name: m?.name || null });
});

router.post('/default-gen-model', (req, res) => {
  const { modelId } = req.body;
  const modelStore = require('../stores/model-store');
  if (modelId) {
    const m = modelStore.getById(modelId);
    if (!m) return res.status(404).json({ error: 'MODEL_NOT_FOUND' });
  }
  modelStore.setDefaultGenModel(modelId || '');
  res.json({ success: true, modelId: modelId || null });
});

module.exports = router;
