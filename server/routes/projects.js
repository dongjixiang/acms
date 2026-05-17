// 项目 API 路由
const express = require('express');
const router = express.Router();
const projectStore = require('../stores/project-store');
const reqStore = require('../stores/requirement-store');
const taskStore = require('../stores/task-store');
const eventBus = require('../services/event-bus');

// 创建项目
router.post('/', (req, res) => {
  const { name, slug, description, wikiVaultPath, wikiDocsPath } = req.body;
  if (!name) return res.status(400).json({ error: 'MISSING_NAME' });
  const project = projectStore.create({ name, slug, description, wikiVaultPath, wikiDocsPath });
  res.status(201).json(project);
});

// 项目列表
router.get('/', (req, res) => {
  res.json(projectStore.list());
});

// 项目详情
router.get('/:id', (req, res) => {
  const project = projectStore.getById(req.params.id);
  if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });

  const members = projectStore.getMembers(req.params.id);
  const environments = projectStore.getEnvironments(req.params.id);
  const repos = projectStore.getRepos(req.params.id);
  const configs = projectStore.getAllConfigs(req.params.id);
  const reqStats = reqStore.getStats(req.params.id);

  res.json({ ...project, members, environments, repos, configs, reqStats });
});

// 更新项目
router.patch('/:id', (req, res) => {
  const project = projectStore.update(req.params.id, req.body);
  if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });
  res.json(project);
});

// 添加成员
router.post('/:id/members', (req, res) => {
  projectStore.addMember(req.params.id, req.body);
  res.json({ success: true });
});

// 添加环境
router.post('/:id/environments', (req, res) => {
  const rowId = projectStore.addEnvironment(req.params.id, req.body);
  res.status(201).json({ id: rowId });
});

// 添加仓库
router.post('/:id/repos', (req, res) => {
  const rowId = projectStore.addRepo(req.params.id, req.body);
  res.status(201).json({ id: rowId });
});

// 设置配置
router.post('/:id/configs', (req, res) => {
  projectStore.setConfig(req.params.id, req.body);
  res.json({ success: true });
});

// 删除配置
router.delete('/:id/configs/:key', (req, res) => {
  const { collection } = require('../db/connection');
  collection('project_configs').remove(c => c.project_id === req.params.id && c.key === req.params.key);
  res.json({ success: true });
});

// 删除项目（级联删除关联数据）
router.delete('/:id', (req, res) => {
  const { collection } = require('../db/connection');
  const project = projectStore.getById(req.params.id);
  if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });

  collection('project_members').remove(m => m.project_id === req.params.id);
  collection('project_environments').remove(e => e.project_id === req.params.id);
  collection('project_repos').remove(r => r.project_id === req.params.id);
  collection('project_configs').remove(c => c.project_id === req.params.id);
  collection('requirements').remove(r => r.project_id === req.params.id);
  collection('tasks').remove(t => t.project_id === req.params.id);
  collection('clarification_threads').remove(c => {
    const req = collection('requirements').findOne(r => r.id === c.requirement_id);
    return !req || req.project_id === req.params.id;
  });
  collection('projects').remove(p => p.id === req.params.id);
  res.json({ success: true, message: `项目 ${project.name} 已删除` });
});

module.exports = router;
