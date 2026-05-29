// 需求 API 路由（精简版 — 业务逻辑在 services/requirement-service.js）
const express = require('express');
const router = express.Router();
const reqStore = require('../stores/requirement-store');
const eventBus = require('../services/event-bus');
const reqService = require('../services/requirement-service');

// 创建需求
router.post('/', (req, res, next) => {
  try {
    const { projectId, title, description, priority, tags, deadline, parentId } = req.body;
    if (!projectId || !title) return res.status(400).json({ error: 'MISSING_FIELDS' });
    const requirement = reqStore.create({ projectId, title, description, priority, tags, deadline, createdBy: req.agentId || 'user', parentId: parentId || null });
    eventBus.emit('requirement.created', { projectId, actor: { id: req.agentId || 'user', type: 'human' }, target: { type: 'requirement', id: requirement.id }, payload: { requirement } });
    res.status(201).json(requirement);
  } catch (e) { next(e); }
});

// 需求列表
router.get('/', (req, res) => {
  const { projectId, status, parentId, rootOnly, limit, offset } = req.query;
  res.json(reqStore.list({
    projectId, status,
    parentId: parentId || undefined,
    rootOnly: rootOnly === 'true',
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0
  }));
});

// 需求详情
router.get('/:id', (req, res) => {
  const requirement = reqStore.getById(req.params.id);
  if (!requirement) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
  res.json({ ...requirement, clarifications: reqStore.getClarifications(req.params.id) });
});

// 状态转换 — 切换到 approved 时检查具体性
router.post('/:id/transition', (req, res, next) => {
  try {
    // 具体性门控: approved 前检查模糊表达
    if (req.body.targetStatus === 'approved') {
      const requirement = reqStore.getById(req.params.id);
      if (requirement) {
        const validator = require('../services/concreteness-validator');
        const result = validator.validateRequirement(requirement);
        if (!result.passed) {
          return res.status(400).json({
            error: 'VAGUE_REQUIREMENT',
            message: '需求包含模糊表达，无法审批通过。请先澄清以下问题：',
            warnings: result.warnings.filter(w => w.severity === 'error').slice(0, 5),
            allWarnings: result.warnings,
          });
        }
      }
    }
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

// 通用字段更新（deadline, title 等）
router.patch('/:id', (req, res) => {
  const { deadline, title, description, priority, tags } = req.body;
  const updates = {};
  if (deadline !== undefined) updates.deadline = deadline;
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (priority !== undefined) updates.priority = priority;
  if (tags !== undefined) updates.tags = JSON.stringify(tags);
  const requirement = reqStore.update(req.params.id, updates);
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

  // 如果有子需求，将它们改为根需求（解除父子关系）
  const childIds = JSON.parse(requirement.child_ids || '[]');
  for (const cid of childIds) {
    collection('requirements').update(r => r.id === cid, { parent_id: null });
  }

  // 如果有父需求，从父需求的 child_ids 中移除自己
  if (requirement.parent_id) {
    const parent = reqStore.getById(requirement.parent_id);
    if (parent) {
      const pcids = JSON.parse(parent.child_ids || '[]').filter(id => id !== req.params.id);
      collection('requirements').update(r => r.id === requirement.parent_id, { child_ids: JSON.stringify(pcids) });
    }
  }

  collection('clarification_threads').remove(c => c.requirement_id === req.params.id);
  // 删除关联任务（两路兜底：task_ids 登记 + parent_id 指向）
  const taskIds = JSON.parse(requirement.task_ids || '[]');
  for (const tid of taskIds) collection('tasks').remove(t => t.id === tid);
  // 兜底：删除所有 parent_id 指向本需求的任务（防止登记遗漏的孤任务）
  const orphanTasks = collection('tasks').find(t => t.parent_id === req.params.id);
  for (const t of orphanTasks) collection('tasks').remove(t2 => t2.id === t.id);
  collection('requirements').remove(r => r.id === req.params.id);
  res.json({ success: true, message: `需求 ${requirement.title} 已删除`, deletedTasks: taskIds.length + orphanTasks.length });
});

// 需求拆分（创建子需求）
router.post('/:id/split', (req, res, next) => {
  try {
    const { children } = req.body;
    if (!children || !Array.isArray(children) || children.length === 0) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: '需要提供 children 数组' });
    }
    const result = reqStore.split(req.params.id, children);
    eventBus.emit('requirement.split', { projectId: result.parent.project_id, actor: { id: req.agentId || 'user', type: 'human' }, target: { type: 'requirement', id: req.params.id }, payload: { parent: result.parent, children: result.children } });
    res.status(201).json(result);
  } catch (e) { next(e); }
});

// 获取子需求
router.get('/:id/children', (req, res) => {
  const children = reqStore.findChildren(req.params.id);
  res.json(children);
});

// 获取需求进度（聚合子需求进度）
router.get('/:id/progress', (req, res) => {
  const progress = reqStore.getProgress(req.params.id);
  res.json(progress);
});

module.exports = router;
