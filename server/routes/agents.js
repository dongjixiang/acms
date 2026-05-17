// 智能体 API 路由 — 增强版
const express = require('express');
const router = express.Router();
const agentStore = require('../stores/agent-store');
const taskStore = require('../stores/task-store');
const reqStore = require('../stores/requirement-store');
const projectStore = require('../stores/project-store');
const wikiService = require('../services/wiki-service');
const eventBus = require('../services/event-bus');

// ===== 注册/管理 =====

router.post('/register', (req, res) => {
  const { id, name, type, roles, skills, endpoint } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'MISSING_FIELDS', message: 'id 和 name 是必填项' });
  const agent = agentStore.register({ id, name, type, roles, skills, endpoint, authToken: req.headers['x-api-key'] || '' });
  eventBus.emit('agent.registered', { actor: { id, type: 'agent', name }, target: { type: 'agent', id }, payload: { agent } });
  res.status(201).json(agent);
});

router.get('/', (req, res) => {
  res.json(agentStore.list({ status: req.query.status, type: req.query.type }));
});

router.patch('/:id/status', (req, res) => {
  const agent = agentStore.updateStatus(req.params.id, req.body.status);
  if (!agent) return res.status(404).json({ error: 'AGENT_NOT_FOUND' });
  res.json(agent);
});

// ===== 智能体专属任务视图 =====

// 我的任务（已认领+进行中+待审核）
router.get('/:id/tasks', (req, res) => {
  const agent = agentStore.getById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'AGENT_NOT_FOUND' });
  const assigned = taskStore.list({ assignedTo: req.params.id, limit: 200 });
  const roles = JSON.parse(agent.roles || '[]');
  // 如果智能体有 reviewer 角色，也返回待审核任务
  let reviewTasks = [];
  if (roles.includes('reviewer')) {
    reviewTasks = taskStore.list({ status: 'review', limit: 50 });
  }
  res.json({ agent: { id: agent.id, name: agent.name, type: agent.type, roles }, assigned, reviewQueue: reviewTasks });
});

// 任务上下文注入（智能体认领任务时获取完整上下文）
router.get('/:id/context/:taskId', (req, res) => {
  const task = taskStore.getById(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });

  const context = {
    task: {
      id: task.id, title: task.title, description: task.description,
      type: task.type, priority: task.priority, status: task.status,
      requiredSkills: JSON.parse(task.required_skills || '{}'),
      estimatedHours: task.estimated_hours,
      dependsOn: JSON.parse(task.depends_on || '[]'),
      linkedWiki: JSON.parse(task.linked_wiki || '[]'),
    },
  };

  // 注入父需求摘要
  if (task.parent_id) {
    const parent = reqStore.getById(task.parent_id);
    if (parent) {
      const srs = JSON.parse(parent.srs || '{}');
      context.parentRequirement = {
        id: parent.id, title: parent.title,
        summary: srs.summary || parent.description?.substring(0, 200) || '',
        acceptanceCriteria: srs.acceptanceCriteria || [],
        wikiPath: parent.wiki_path || '',
      };
    }
  }

  // 注入项目环境信息
  if (task.project_id) {
    const project = projectStore.getById(task.project_id);
    if (project) {
      context.project = {
        id: project.id, name: project.name,
        environments: projectStore.getEnvironments(task.project_id).map(e => ({ name: e.name, url: e.url })),
        repos: projectStore.getRepos(task.project_id).map(r => ({ name: r.name, url: r.url, defaultBranch: r.default_branch })),
      };
    }
  }

  res.json(context);
});

// ===== 技能匹配 =====

router.get('/:id/match-tasks', (req, res) => {
  const agent = agentStore.getById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'AGENT_NOT_FOUND' });

  const allTasks = taskStore.list({ status: 'backlog', limit: 100 });
  const skills = JSON.parse(agent.skills || '{}');
  const matches = [];

  for (const task of allTasks) {
    const required = JSON.parse(task.required_skills || '{}');
    if (Object.keys(required).length === 0) {
      matches.push({ taskId: task.id, title: task.title, score: 1, matchNote: '无技能要求，通用任务' });
      continue;
    }
    let score = 0, matched = 0;
    for (const [skill, level] of Object.entries(required)) {
      const al = skills[skill] || 0;
      if (al >= level) { score += al - level + 1; matched++; }
      else { score -= (level - al) * 2; }
    }
    if (matched === Object.keys(required).length) score += 5;
    if (score > 0) matches.push({ taskId: task.id, title: task.title, score: Math.round(score * 10) / 10, requiredSkills: required, type: task.type, priority: task.priority });
  }

  matches.sort((a, b) => b.score - a.score);
  res.json(matches.slice(0, 10));
});

// ===== 事件通知 =====

// 智能体订阅事件（WebSocket 处理）
router.post('/:id/subscribe', (req, res) => {
  const agent = agentStore.getById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'AGENT_NOT_FOUND' });

  const roles = JSON.parse(agent.roles || '[]');
  const subscriptions = [];

  // 按角色自动订阅相关事件
  if (roles.includes('analyst')) {
    subscriptions.push('requirement.created');
  }
  if (roles.includes('planner')) {
    subscriptions.push('requirement.approved');
    subscriptions.push('requirement.decomposed');
  }
  if (roles.includes('executor')) {
    subscriptions.push('task.created');
  }
  if (roles.includes('reviewer')) {
    subscriptions.push('task.submitted');
  }

  res.json({ agentId: req.params.id, roles, subscriptions });
});

// 获取最近通知
router.get('/:id/notifications', (req, res) => {
  const agent = agentStore.getById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'AGENT_NOT_FOUND' });

  const roles = JSON.parse(agent.roles || '[]');
  const relevantTypes = [];
  if (roles.includes('analyst')) relevantTypes.push('requirement.created');
  if (roles.includes('planner')) relevantTypes.push('requirement.approved');
  if (roles.includes('executor')) relevantTypes.push('task.created');
  if (roles.includes('reviewer')) relevantTypes.push('task.submitted');

  const events = eventBus.query({ limit: 20 }).filter(e => relevantTypes.includes(e.type));
  res.json(events);
});

// ===== 统计 =====
router.get('/:id/stats', (req, res, next) => {
  try {
    const statsService = require('../services/agent-stats-service');
    res.json(statsService.getStats(req.params.id));
  } catch (e) { next(e); }
});

module.exports = router;
