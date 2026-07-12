// 任务数据存储 (JSON 版)
const { collection } = require('../db/connection');
const { v4: uuidv4 } = require('uuid');

class TaskStore {
  create({ projectId, parentId = '', title, description = '', type = 'coding', priority = 3,
           requiredSkills = {}, estimatedHours = 0, dependsOn = [], dependsContract = [],
           wikiContext = '', linkedWiki = [], autoReview = false }) {
    const id = `T-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();
    const task = {
      id, project_id: projectId, parent_id: parentId, title, description, type, priority,
      status: 'backlog', blocked: (dependsOn && dependsOn.length > 0) ? 1 : 0,
      block_reason: (dependsOn && dependsOn.length > 0) ? '等待前置任务完成' : '',
      depends_on: JSON.stringify(dependsOn),
      depends_contract: JSON.stringify(dependsContract),
      depended_by: '[]', sibling_ids: '[]', required_skills: JSON.stringify(requiredSkills),
      estimated_hours: estimatedHours, actual_hours: 0, assigned_to: '', assigned_at: '',
      assigned_role: 'executor', progress: 0, progress_note: '', last_progress_update: '',
      auto_review: autoReview ? 1 : 0, review_status: '',
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
    // v0.X fix: 加入 failed 桶 — 之前 failed 任务被静默丢弃，看板/面板都看不到
    // 也加 unknown 桶兜底，防止未来再加新状态时再次出现"静默丢失"
    const board = { backlog: [], in_progress: [], review: [], done: [], archived: [], frozen: [], failed: [], unknown: [], escalated: [] };
    for (const t of tasks) {
      const bucket = board[t.status] !== undefined ? t.status : 'unknown';
      board[bucket].push(t);
    }
    return board;
  }

  transition(id, targetStatus, actor = {}) {
    const task = this.getById(id);
    if (!task) return { error: 'TASK_NOT_FOUND' };
    const VALID = {
      backlog: ['in_progress', 'archived'], in_progress: ['review', 'backlog', 'archived', 'frozen'],
      review: ['done', 'in_progress', 'archived', 'frozen'],
      // P0 v0.X: escalated 状态 — 连续 3 次 reject 后自动转入，需 PM 手工解锁
      //   PM 可以从 escalated 拉回 backlog 重新分配，或直接归档放弃
      escalated: ['backlog', 'archived'],
      done: ['archived'], archived: ['backlog'], frozen: ['backlog', 'in_progress'],
      // v0.X fix: failed 任务 PM 可以拉回 backlog 重跑，或归档放弃
      failed: ['backlog', 'archived'],
    };
    if (!VALID[task.status]?.includes(targetStatus)) {
      return { error: 'INVALID_TRANSITION', from: task.status, to: targetStatus };
    }
    const now = new Date().toISOString();
    const updates = { status: targetStatus, updated_at: now };
    if (targetStatus === 'in_progress' && actor.id) { updates.assigned_to = actor.id; updates.assigned_at = now; }
    if (targetStatus === 'done') updates.completed_at = now;
    if (targetStatus === 'backlog') { updates.assigned_to = ''; updates.assigned_at = ''; }
    // v0.37 fix: 离开 in_progress 时清零 progress/progress_note/execution_log
    //   之前 in_progress → review / backlog / failed / frozen 都残留 progress=8%，前端 tooltip 看着像"还在跑"
    //   review → in_progress (驳回重做) 不触发此分支，因为 task.status 此时是 review
    //   claim() backlog → in_progress 也走另一条路且 progress 本就 0（transition 已清）
    if (task.status === 'in_progress' && targetStatus !== 'in_progress') {
      updates.progress = 0;
      updates.progress_note = '';
      updates.execution_log = '[]';
      updates.last_progress_update = '';
    }
    const result = collection('tasks').update(t => t.id === id, updates);

    // 任务完成 → 自动解阻塞依赖它的任务
    if (targetStatus === 'done') {
      this._autoUnblockDependents(id);
    }
    // v0.X fix: failed → backlog（PM 重新激活失败任务）→ 解阻塞所有依赖
    // 场景：T-MRDO0ECU failed 阻塞了 268/269/270 三个 backlog 任务
    // PM 把 failed 拉回 backlog 重跑后，依赖任务应该能继续推进
    // 注意：这里直接清 blocked 标志，不调 _autoUnblockDependents（那个会要求依赖任务真 done 才解锁）
    // PM 明确"重激活"是意图信号，应该让依赖任务从 blocked UI 中解放出来
    if (task.status === 'failed' && targetStatus === 'backlog') {
      const reactivated = this.getById(id);
      const dependedBy = JSON.parse(reactivated?.depended_by || '[]');
      for (const depId of dependedBy) {
        const dep = this.getById(depId);
        if (dep && dep.blocked === 1) {
          this.update(depId, { blocked: 0, block_reason: '' });
          console.log(`[TaskStore] PM 重激活失败任务 ${id} → 解阻塞依赖 ${depId}`);
        }
      }
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

    // P0 v0.X: 连续 reject 熔断 — 计数已达 3 次 → 自动 escalate，PM 需手工解锁
    //   治"agent-acms-self 反复认领-提交-驳回 死循环"
    //   计数规则：只数 user/reviewer 手动驳回，不数 auto-review（auto 已通过 reviewReport 自己处理）
    const ESCALATE_THRESHOLD = 3;
    let updateExtra = {};
    if (verdict === 'rejected' && reviewedBy !== 'agent-reviewer-001') {
      const manualRejects = reviews.filter(r => r.verdict === 'rejected' && r.reviewedBy !== 'agent-reviewer-001').length;
      updateExtra.rejected_count = manualRejects;
      if (manualRejects >= ESCALATE_THRESHOLD) {
        updateExtra.status = 'escalated';
        updateExtra.escalated_at = now;
        updateExtra.escalate_reason = `连续 ${manualRejects} 次手动驳回，需要 PM 介入`;
      }
    }

    collection('tasks').update(t => t.id === id, { reviews: JSON.stringify(reviews), updated_at: now, ...updateExtra });

    // P0 v0.X: escalated 状态走 transition 之外的直写路径（status 已被 updateExtra 改了）
    //   其它情况走原来的 transition 状态机
    if (updateExtra.status === 'escalated') {
      return this.getById(id);
    }
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
