// 任务数据存储 (JSON 版)
const { collection } = require('../db/connection');
const { v4: uuidv4 } = require('uuid');

class TaskStore {
  create({ projectId, parentId = '', title, description = '', type = 'coding', priority = 3,
           requiredSkills = {}, estimatedHours = 0, dependsOn = [], wikiContext = '', linkedWiki = [] }) {
    const id = `T-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();
    const task = {
      id, project_id: projectId, parent_id: parentId, title, description, type, priority,
      status: 'backlog', blocked: (dependsOn && dependsOn.length > 0) ? 1 : 0,
      block_reason: (dependsOn && dependsOn.length > 0) ? '等待前置任务完成' : '', depends_on: JSON.stringify(dependsOn),
      depended_by: '[]', sibling_ids: '[]', required_skills: JSON.stringify(requiredSkills),
      estimated_hours: estimatedHours, actual_hours: 0, assigned_to: '', assigned_at: '',
      assigned_role: 'executor', progress: 0, progress_note: '', last_progress_update: '',
      wiki_context: wikiContext, linked_wiki: JSON.stringify(linkedWiki),
      execution_log: '[]', submissions: '[]', reviews: '[]', artifacts: '{}',
      version: 1, created_at: now, updated_at: now, completed_at: '',
    };
    collection('tasks').insert(task);

    // 维护反向依赖: 在每个前置任务的 depended_by 中加入自己
    if (dependsOn && dependsOn.length > 0) {
      for (const depId of dependsOn) {
        const dep = this.getById(depId);
        if (dep) {
          const depBy = JSON.parse(dep.depended_by || '[]');
          if (!depBy.includes(id)) {
            depBy.push(id);
            this.update(depId, { depended_by: JSON.stringify(depBy) });
          }
        }
      }
    }

    if (parentId) {
      const reqs = collection('requirements');
      const parent = reqs.findOne(r => r.id === parentId);
      if (parent) {
        const taskIds = JSON.parse(parent.task_ids || '[]');
        taskIds.push(id);
        reqs.update(r => r.id === parentId, { task_ids: JSON.stringify(taskIds), updated_at: now });
      }
    }
    return task;
  }

  getById(id) { return collection('tasks').findOne(t => t.id === id) || null; }

  // 通用更新
  update(id, updates) {
    const now = new Date().toISOString();
    return collection('tasks').update(t => t.id === id, { ...updates, updated_at: now });
  }

  list({ projectId, parentId, status, assignedTo, limit = 100, offset = 0 } = {}) {
    let tasks = collection('tasks').all();
    if (projectId) tasks = tasks.filter(t => t.project_id === projectId);
    if (parentId) tasks = tasks.filter(t => t.parent_id === parentId);
    if (status) tasks = tasks.filter(t => t.status === status);
    if (assignedTo) tasks = tasks.filter(t => t.assigned_to === assignedTo);
    tasks.sort((a, b) => (a.priority || 99) - (b.priority || 99));
    return tasks.slice(offset, offset + limit);
  }

  getBoard(projectId, parentId) {
    const tasks = this.list({ projectId, parentId, limit: 500 });
    const board = { backlog: [], in_progress: [], review: [], done: [], archived: [], frozen: [] };
    for (const t of tasks) {
      if (board[t.status]) board[t.status].push(t);
    }
    return board;
  }

  transition(id, targetStatus, actor = {}) {
    const task = this.getById(id);
    if (!task) return { error: 'TASK_NOT_FOUND' };
    const VALID = {
      backlog: ['in_progress', 'archived'], in_progress: ['review', 'backlog', 'archived', 'frozen'],
      review: ['done', 'in_progress', 'archived', 'frozen'], done: ['archived'], archived: ['backlog'],
      frozen: ['backlog', 'in_progress'],
    };
    if (!VALID[task.status]?.includes(targetStatus)) {
      return { error: 'INVALID_TRANSITION', from: task.status, to: targetStatus };
    }
    const now = new Date().toISOString();
    const updates = { status: targetStatus, updated_at: now };
    if (targetStatus === 'in_progress' && actor.id) { updates.assigned_to = actor.id; updates.assigned_at = now; }
    if (targetStatus === 'done') updates.completed_at = now;
    if (targetStatus === 'backlog') { updates.assigned_to = ''; updates.assigned_at = ''; }
    const result = collection('tasks').update(t => t.id === id, updates);

    // 任务完成 → 自动解阻塞依赖它的任务
    if (targetStatus === 'done') {
      this._autoUnblockDependents(id);
    }

    return result;
  }

  _autoUnblockDependents(doneTaskId) {
    const doneTask = this.getById(doneTaskId);
    if (!doneTask) return;
    const dependedBy = JSON.parse(doneTask.depended_by || '[]');
    for (const depId of dependedBy) {
      const dep = this.getById(depId);
      if (!dep || dep.blocked !== 1) continue;
      // 检查该任务的所有依赖是否都已满足
      if (this.areDependenciesMet(depId)) {
        this.update(depId, { blocked: 0, block_reason: '' });
        console.log(`[TaskStore] 自动解阻塞: ${depId}（依赖 ${doneTaskId} 已完成）`);
      }
    }
  }

  claim(id, agentId) {
    const task = this.getById(id);
    if (!task || task.status !== 'backlog') return { error: 'TASK_ALREADY_CLAIMED' };
    const now = new Date().toISOString();
    return collection('tasks').update(t => t.id === id && t.status === 'backlog', {
      status: 'in_progress', assigned_to: agentId, assigned_at: now, updated_at: now
    }) || { error: 'TASK_ALREADY_CLAIMED' };
  }

  updateProgress(id, { progress, note = '' }) {
    const now = new Date().toISOString();
    const task = this.getById(id);
    const log = JSON.parse(task.execution_log || '[]');
    log.push({ time: Date.now(), agentId: task.assigned_to, action: 'progress_update', note });
    return collection('tasks').update(t => t.id === id, {
      progress, progress_note: note, last_progress_update: now,
      execution_log: JSON.stringify(log), updated_at: now
    });
  }

  submit(id, { agentId, files = [], diff = '', testResult = {}, notes = '' }) {
    const now = new Date().toISOString();
    const task = this.getById(id);
    const submissions = JSON.parse(task.submissions || '[]');
    submissions.push({ submittedAt: now, submittedBy: agentId, files, diff, testResult, notes });
    collection('tasks').update(t => t.id === id, { submissions: JSON.stringify(submissions), updated_at: now });
    return this.transition(id, 'review', { id: agentId });
  }

  review(id, { verdict, feedback = '', reviewedBy = '' }) {
    const now = new Date().toISOString();
    const task = this.getById(id);
    const reviews = JSON.parse(task.reviews || '[]');
    reviews.push({ reviewedAt: now, reviewedBy, verdict, feedback });
    collection('tasks').update(t => t.id === id, { reviews: JSON.stringify(reviews), updated_at: now });
    if (verdict === 'approved') return this.transition(id, 'done');
    if (verdict === 'rejected') return this.transition(id, 'in_progress');
    return task;
  }

  areDependenciesMet(id) {
    const task = this.getById(id);
    const dependsOn = JSON.parse(task.depends_on || '[]');
    if (dependsOn.length === 0) return true;
    for (const depId of dependsOn) {
      const dep = this.getById(depId);
      if (!dep || dep.status !== 'done') return false;
    }
    return true;
  }

  detectCycle(id, newDependsOn) {
    const visited = new Set();
    const stack = [...newDependsOn];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === id) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      const task = this.getById(current);
      if (task) stack.push(...JSON.parse(task.depends_on || '[]'));
    }
    return false;
  }
}

module.exports = new TaskStore();
