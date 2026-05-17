// 需求业务逻辑 — 从 routes 中提取
const reqStore = require('../stores/requirement-store');
const taskStore = require('../stores/task-store');
const eventBus = require('./event-bus');

const service = {
  // 分解需求为任务
  async decompose(requirementId, tasks, actorId) {
    const requirement = reqStore.getById(requirementId);
    if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404, code: 'REQ_NOT_FOUND' });
    if (requirement.status !== 'approved') throw Object.assign(new Error('只有已确认的需求才能分解'), { status: 400, code: 'REQ_NOT_APPROVED' });
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) throw Object.assign(new Error('请提供任务列表'), { status: 400, code: 'MISSING_TASKS' });

    const created = [];
    for (const t of tasks) {
      const task = taskStore.create({
        projectId: requirement.project_id, parentId: requirement.id,
        title: t.title, description: t.description || '', type: t.type || 'coding',
        priority: t.priority || requirement.priority, requiredSkills: t.requiredSkills || {},
        estimatedHours: t.estimatedHours || 0, dependsOn: t.dependsOn || [],
        wikiContext: requirement.wiki_path || '',
        linkedWiki: [{ page: requirement.wiki_path || '', role: 'parent', autoLoad: true }, ...(t.linkedWiki || [])],
      });
      created.push(task);
    }

    reqStore.transition(requirementId, 'in_execution');

    eventBus.emit('requirement.decomposed', {
      projectId: requirement.project_id,
      actor: { id: actorId || 'planner', type: 'agent' },
      target: { type: 'requirement', id: requirement.id },
      payload: { requirement, taskCount: created.length },
    });

    for (const task of created) {
      eventBus.emit('task.created', {
        projectId: requirement.project_id,
        actor: { id: actorId || 'planner', type: 'agent' },
        target: { type: 'task', id: task.id }, payload: { task },
      });
    }

    return { tasks: created, count: created.length };
  },

  // 提交审核
  async submitForReview(requirementId, agentId) {
    const result = reqStore.submitForReview(requirementId, agentId);
    if (result.error) throw Object.assign(new Error(result.error), { status: 400, code: result.error });
    eventBus.emit('requirement.review_submitted', {
      projectId: result.project_id,
      actor: { id: agentId, type: 'agent' },
      target: { type: 'requirement', id: result.id },
      payload: { requirement: result },
    });
    return result;
  },

  // 确认需求
  async approve(requirementId) {
    const result = reqStore.transition(requirementId, 'approved', { id: 'user', type: 'human' });
    if (result.error) throw Object.assign(new Error(result.error), { status: 400, code: result.error });

    const projectStore = require('../stores/project-store');
    const wikiService = require('./wiki-service');
    const project = projectStore.getById(result.project_id);
    if (project && project.wiki_vault_path) {
      const content = wikiService.generateRequirementPage(result);
      const pagePath = `docs/需求/${result.id}-${result.title.replace(/[/\\?%*:|"<>]/g, '-')}.md`;
      wikiService.writePage(project.wiki_vault_path, pagePath, content);
      reqStore.update(result.id, { wiki_path: pagePath, wiki_synced: 1, last_wiki_sync: new Date().toISOString() });
    }

    eventBus.emit('requirement.approved', {
      projectId: result.project_id, actor: { id: 'user', type: 'human' },
      target: { type: 'requirement', id: result.id }, payload: { requirement: result },
    });
    return result;
  },

  // 驳回需求
  async reject(requirementId, reason) {
    const requirement = reqStore.getById(requirementId);
    if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404, code: 'REQ_NOT_FOUND' });

    const approval = JSON.parse(requirement.approval || '{}');
    approval.rejections = approval.rejections || [];
    approval.rejections.push({ reason: reason || '未提供原因', time: new Date().toISOString() });
    reqStore.update(requirementId, { approval: JSON.stringify(approval) });

    const result = reqStore.transition(requirementId, 'clarifying');
    if (result.error) throw Object.assign(new Error(result.error), { status: 400, code: result.error });
    return result;
  },
};

module.exports = service;
