// 需求 API 路由（精简版 — 业务逻辑在 services/requirement-service.js）
const express = require('express');
const router = express.Router();
const reqStore = require('../stores/requirement-store');
const eventBus = require('../services/event-bus');
const reqService = require('../services/requirement-service');

// 创建需求
router.post('/', (req, res, next) => {
  try {
    const { projectId, title, description, priority, tags, deadline } = req.body;
    if (!projectId || !title) return res.status(400).json({ error: 'MISSING_FIELDS' });
    const requirement = reqStore.create({ projectId, title, description, priority, tags, deadline, createdBy: req.agentId || 'user' });
    eventBus.emit('requirement.created', { projectId, actor: { id: req.agentId || 'user', type: 'human' }, target: { type: 'requirement', id: requirement.id }, payload: { requirement } });
    res.status(201).json(requirement);
  } catch (e) { next(e); }
});

// 需求列表
router.get('/', (req, res) => {
  const { projectId, status, limit, offset } = req.query;
  res.json(reqStore.list({ projectId, status, limit: parseInt(limit) || 50, offset: parseInt(offset) || 0 }));
});

// 需求详情
router.get('/:id', (req, res) => {
  const requirement = reqStore.getById(req.params.id);
  if (!requirement) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
  res.json({ ...requirement, clarifications: reqStore.getClarifications(req.params.id) });
});

// 状态转换
router.post('/:id/transition', (req, res, next) => {
  try {
    const result = reqStore.transition(req.params.id, req.body.targetStatus, { id: req.agentId || 'user', type: req.agentId ? 'agent' : 'human' });
    if (result.error) return res.status(400).json(result);
    eventBus.emit(`requirement.${req.body.targetStatus === 'approved' ? 'approved' : 'status_changed'}`, { projectId: result.project_id, actor: { id: req.agentId || 'user', type: 'human' }, target: { type: 'requirement', id: result.id }, payload: { requirement: result } });
    res.json(result);
  } catch (e) { next(e); }
});

// 澄清对话
router.post('/:id/clarify', (req, res) => {
  const { question, agentId } = req.body;
  if (!question) return res.status(400).json({ error: 'MISSING_QUESTION' });
  reqStore.addClarificationQuestion(req.params.id, { question, askedBy: agentId || req.agentId || 'analyst' });
  reqStore.addClarification(req.params.id, { role: 'agent', agentId: agentId || req.agentId, content: question });
  res.json({ message: '澄清问题已添加' });
});

router.post('/:id/answer', (req, res) => {
  const { questionIndex, answer, role } = req.body;
  reqStore.answerClarification(req.params.id, questionIndex, answer);
  reqStore.addClarification(req.params.id, { role: role || 'user', content: answer });
  res.json({ success: true });
});

// SRS
router.patch('/:id/srs', (req, res) => {
  const requirement = reqStore.updateSrs(req.params.id, req.body);
  if (!requirement) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
  res.json(requirement);
});

// 审核流程（使用 service）
router.post('/:id/submit-review', async (req, res, next) => {
  try { res.json(await reqService.submitForReview(req.params.id, req.agentId || 'analyst')); } catch (e) { next(e); }
});

router.post('/:id/approve', async (req, res, next) => {
  try { res.json(await reqService.approve(req.params.id)); } catch (e) { next(e); }
});

router.post('/:id/reject', async (req, res, next) => {
  try { res.json(await reqService.reject(req.params.id, req.body.reason)); } catch (e) { next(e); }
});

// 分解（使用 service）
router.post('/:id/decompose', async (req, res, next) => {
  try { res.status(201).json(await reqService.decompose(req.params.id, req.body.tasks, req.agentId)); } catch (e) { next(e); }
});

// 统计
router.get('/stats/:projectId', (req, res) => {
  res.json(reqStore.getStats(req.params.projectId));
});

// 删除需求
router.delete('/:id', (req, res) => {
  const requirement = reqStore.getById(req.params.id);
  if (!requirement) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
  const { collection } = require('../db/connection');
  collection('clarification_threads').remove(c => c.requirement_id === req.params.id);
  // 删除关联任务
  const taskIds = JSON.parse(requirement.task_ids || '[]');
  for (const tid of taskIds) collection('tasks').remove(t => t.id === tid);
  collection('requirements').remove(r => r.id === req.params.id);
  res.json({ success: true, message: `需求 ${requirement.title} 已删除` });
});

module.exports = router;
