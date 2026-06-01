// 自我改进 API 路由
const express = require('express');
const router = express.Router();
const reportStore = require('../stores/improvement-report-store');

// 获取自我改进项目信息
router.get('/project', (req, res) => {
  const { collection } = require('../db/connection');
  const proj = collection('projects').findOne(p => p.system_project === 1);
  if (!proj) return res.status(404).json({ error: 'SELF_IMPROVEMENT_PROJECT_NOT_FOUND' });
  // 补充项目的任务统计
  const taskStore = require('../stores/task-store');
  const board = taskStore.getBoard(proj.id);
  const totalTasks = Object.values(board).reduce((s, arr) => s + (arr?.length || 0), 0);
  const inProgress = board.in_progress?.length || 0;
  const done = board.done?.length || 0;
  res.json({ ...proj, taskStats: { total: totalTasks, inProgress, done } });
});

// 获取改进报告列表
router.get('/reports', (req, res) => {
  const { status } = req.query;
  const reports = reportStore.list(status || null);
  res.json(reports);
});

// 获取单个报告
router.get('/reports/:id', (req, res) => {
  const report = reportStore.getById(req.params.id);
  if (!report) return res.status(404).json({ error: 'REPORT_NOT_FOUND' });
  // 解析 JSON 字段
  res.json({
    ...report,
    improvements: (() => { try { return JSON.parse(report.improvements || '[]'); } catch { return []; } })(),
    root_cause: (() => { try { return JSON.parse(report.root_cause || '{}'); } catch { return {}; } })(),
  });
});

// 审核改进报告
router.post('/reports/:id/review', (req, res) => {
  const { verdict, feedback } = req.body;
  if (!verdict || !['approved', 'declined'].includes(verdict)) {
    return res.status(400).json({ error: 'INVALID_VERDICT', message: 'verdict 必须为 approved 或 declined' });
  }
  const result = reportStore.review(req.params.id, { verdict, feedback: feedback || '' });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// 获取自我改进项目的任务看板
router.get('/board', (req, res) => {
  const board = reportStore.getBoard();
  res.json(board);
});

module.exports = router;
