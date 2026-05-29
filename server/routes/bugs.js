// 缺陷管理 API 路由
const express = require('express');
const router = express.Router();
const bugService = require('../services/bug-service');
const { collection } = require('../db/connection');

/**
 * POST /api/bugs/clarify
 * AI 澄清缺陷（多轮对话）
 * Body: { projectId, bugDescription, modelId, userMessage?, conversationHistory? }
 */
router.post('/clarify', async (req, res, next) => {
  try {
    const { projectId, bugDescription, modelId, userMessage, conversationHistory } = req.body;
    if (!projectId) return res.status(400).json({ error: 'MISSING_PROJECT_ID' });
    if (!bugDescription) return res.status(400).json({ error: 'MISSING_BUG_DESCRIPTION' });
    if (!modelId) return res.status(400).json({ error: 'MISSING_MODEL_ID' });

    const result = await bugService.processBugReport(
      projectId, bugDescription, modelId, userMessage, conversationHistory
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/bugs
 * 直接创建缺陷（跳过澄清，用于 verify 失败等自动场景）
 * Body: { projectId, title, description, severity, source?, sourceTaskId?, linkedRequirementId? }
 */
router.post('/', (req, res, next) => {
  try {
    const { projectId, title, description, severity, source, sourceTaskId, linkedRequirementId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'MISSING_PROJECT_ID' });
    if (!title) return res.status(400).json({ error: 'MISSING_TITLE' });

    const task = bugService.createBugDirect(projectId, {
      title, description: description || '', severity: severity || 'major',
      source: source || 'manual', sourceTaskId: sourceTaskId || '',
      linkedRequirementId: linkedRequirementId || '',
    });
    res.status(201).json({ task, message: '缺陷任务已创建' });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/bugs?projectId=xxx&status=xxx
 * 列出缺陷（type='bug' 的 task）
 */
router.get('/', (req, res, next) => {
  try {
    const { projectId, status } = req.query;
    if (!projectId) return res.status(400).json({ error: 'MISSING_PROJECT_ID' });

    const bugs = bugService.listBugs(projectId, status || null);
    res.json(bugs);
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/bugs/stats?projectId=xxx
 * 缺陷统计
 */
router.get('/stats', (req, res, next) => {
  try {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: 'MISSING_PROJECT_ID' });

    const tasks = collection('tasks').find(t => t.project_id === projectId && t.type === 'bug');
    const open = tasks.filter(t => t.status === 'backlog').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const resolved = tasks.filter(t => t.status === 'review' || t.status === 'done').length;
    const critical = tasks.filter(t => t.bug_severity === 'critical' && t.status !== 'done' && t.status !== 'archived').length;

    res.json({
      total: tasks.length,
      open, inProgress, resolved, critical,
      bySeverity: {
        critical: tasks.filter(t => t.bug_severity === 'critical').length,
        major: tasks.filter(t => t.bug_severity === 'major').length,
        minor: tasks.filter(t => t.bug_severity === 'minor').length,
        trivial: tasks.filter(t => t.bug_severity === 'trivial').length,
      },
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/bugs/board?projectId=xxx
 * 看板视图（按 status 分组）
 */
router.get('/board', (req, res, next) => {
  try {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: 'MISSING_PROJECT_ID' });

    const bugs = bugService.listBugs(projectId, null);
    const board = {
      open: bugs.filter(b => b.status === 'backlog'),
      in_progress: bugs.filter(b => b.status === 'in_progress'),
      resolved: bugs.filter(b => b.status === 'review'),
      closed: bugs.filter(b => b.status === 'done'),
      archived: bugs.filter(b => b.status === 'archived'),
    };
    res.json(board);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
