// 任务 API 路由
const express = require('express');
const router = express.Router();
const taskStore = require('../stores/task-store');
const eventBus = require('../services/event-bus');

// 创建任务
router.post('/', (req, res) => {
  const { projectId, parentId, title, description, type, priority, requiredSkills, estimatedHours, dependsOn, wikiContext, linkedWiki } = req.body;
  if (!projectId || !title) return res.status(400).json({ error: 'MISSING_FIELDS' });

  // 依赖环检测
  if (dependsOn && dependsOn.length > 0) {
    const cycle = taskStore.detectCycle(null, dependsOn);
    if (cycle) return res.status(400).json({ error: 'CIRCULAR_DEPENDENCY', message: '检测到依赖环' });
  }

  const task = taskStore.create({ projectId, parentId, title, description, type, priority, requiredSkills, estimatedHours, dependsOn, wikiContext, linkedWiki });

  eventBus.emit('task.created', {
    projectId, actor: { id: req.agentId || 'system', type: 'agent' },
    target: { type: 'task', id: task.id }, payload: { task },
  });

  res.status(201).json(task);
});

// 任务列表/看板
router.get('/', (req, res) => {
  const { projectId, parentId, status, assignedTo, board, limit, offset } = req.query;
  if (board === 'true') {
    return res.json(taskStore.getBoard(projectId, parentId));
  }
  res.json(taskStore.list({ projectId, parentId, status, assignedTo, limit: parseInt(limit) || 100, offset: parseInt(offset) || 0 }));
});

// 任务详情
router.get('/:id', (req, res) => {
  const task = taskStore.getById(req.params.id);
  if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
  res.json(task);
});

// 认领任务
router.post('/:id/claim', (req, res) => {
  const { agentId } = req.body;
  const claimId = agentId || req.agentId;
  if (!claimId) return res.status(400).json({ error: 'MISSING_AGENT_ID' });

  // 检查依赖
  if (!taskStore.areDependenciesMet(req.params.id)) {
    return res.status(400).json({ error: 'TASK_BLOCKED', message: '前置依赖未完成' });
  }

  const result = taskStore.claim(req.params.id, claimId);
  if (result.error) return res.status(409).json(result);

  eventBus.emit('task.claimed', {
    projectId: result.project_id, actor: { id: claimId, type: 'agent' },
    target: { type: 'task', id: result.id }, payload: { task: result },
  });

  res.json(result);
});

// 更新进度
router.post('/:id/progress', (req, res) => {
  const { progress, note } = req.body;
  if (progress === undefined) return res.status(400).json({ error: 'MISSING_PROGRESS' });
  const task = taskStore.updateProgress(req.params.id, { progress, note });
  if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
  res.json(task);
});

// 提交成果
router.post('/:id/submit', (req, res) => {
  const { agentId, files, diff, testResult, notes } = req.body;
  const result = taskStore.submit(req.params.id, { agentId: agentId || req.agentId, files, diff, testResult, notes });
  if (result.error) return res.status(400).json(result);

  eventBus.emit('task.submitted', {
    projectId: result.project_id, actor: { id: agentId || req.agentId, type: 'agent' },
    target: { type: 'task', id: result.id }, payload: { task: result },
  });

  res.json(result);
});

// 审核
router.post('/:id/review', (req, res) => {
  const { verdict, feedback, reviewedBy } = req.body;
  if (!verdict || !['approved', 'rejected'].includes(verdict)) return res.status(400).json({ error: 'INVALID_VERDICT' });

  const result = taskStore.review(req.params.id, { verdict, feedback, reviewedBy: reviewedBy || 'user' });
  if (result.error) return res.status(400).json(result);

  eventBus.emit(verdict === 'approved' ? 'task.completed' : 'task.review_rejected', {
    projectId: result.project_id, actor: { id: reviewedBy || 'user', type: 'human' },
    target: { type: 'task', id: result.id }, payload: { task: result, verdict, feedback },
  });

  res.json(result);
});

// 释放任务
router.post('/:id/release', (req, res) => {
  const result = taskStore.transition(req.params.id, 'backlog');
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

module.exports = router;
