// 技能 API 路由
const express = require('express');
const router = express.Router();
const skillStore = require('../stores/skill-store');

// 技能列表
router.get('/', (req, res) => {
  const skills = skillStore.list(req.query.category);
  res.json(skills);
});

// 技能详情
router.get('/:id', (req, res) => {
  const skill = skillStore.getById(req.params.id);
  if (!skill) return res.status(404).json({ error: 'SKILL_NOT_FOUND' });
  res.json(skill);
});

// 创建技能
router.post('/', (req, res) => {
  const { id, name, description, category, matchOn, execution, taskTemplate } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'MISSING_FIELDS' });
  const skill = skillStore.create({ id, name, description, category, matchOn, execution, taskTemplate });
  res.status(201).json(skill);
});

// 更新技能
router.patch('/:id', (req, res) => {
  const result = skillStore.update(req.params.id, req.body);
  if (!result) return res.status(404).json({ error: 'SKILL_NOT_FOUND' });
  res.json(skillStore.getById(req.params.id));
});

// 删除技能
router.delete('/:id', (req, res) => {
  const result = skillStore.remove(req.params.id);
  if (!result) return res.status(404).json({ error: 'SKILL_NOT_FOUND' });
  res.json({ success: true });
});

// 匹配：为任务推荐 Skill
router.get('/match/:taskId', (req, res) => {
  const { collection } = require('../db/connection');
  const task = collection('tasks').findOne(t => t.id === req.params.taskId);
  if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
  const matches = skillStore.matchForTask(task);
  res.json(matches);
});

module.exports = router;
