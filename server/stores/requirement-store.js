// 需求数据存储 (JSON 版)
const { collection } = require('../db/connection');
const { v4: uuidv4 } = require('uuid');
const { canTransition, getNextStatuses, getGateErrors, shouldAutoAbandon } = require('../services/state-machine');

class RequirementStore {
  create({ projectId, title, description = '', priority = 3, tags = [], deadline = '', createdBy = '', parentId = null, archSpec = null, interfaceContracts = null, srs = null, flowCoverage = null, status = null, role = null, changeLog = null, userRole = null }) {
    const id = `REQ-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();
    const req = {
      id, project_id: projectId, title, description, structured_description: '',
      priority, tags: JSON.stringify(tags), deadline, status: status || 'idea', phase: status === 'clarifying' ? '澄清' : '孵化',
      parent_id: parentId || null, child_ids: '[]',
      refinement: JSON.stringify({ thread: [], clarifications: [], suggestionCount: 0, roundsToClarify: 0, readyForReview: false }),
      srs: srs || JSON.stringify({ scopeIn: [], scopeOut: [], acceptanceCriteria: [], technicalConstraints: [], summary: '' }),
      approval: JSON.stringify({ submittedAt: null, submittedBy: null, approvedAt: null, approvedBy: null, rejections: [] }),
      current_version: 1, change_history: '[]', wiki_path: '', wiki_synced: 0, last_wiki_sync: '',
      task_ids: '[]', progress: 0, created_by: createdBy, participants: '[]',
      arch_spec: archSpec ? JSON.stringify(archSpec) : '{}',
      interface_contracts: interfaceContracts ? JSON.stringify(interfaceContracts) : '[]',
      role: role || 'normal',
      flow_coverage: flowCoverage || '{}',
      review_report: '{}',
      coverage_report: '{}',
      aggregate_coverage_report: '{}',
      change_log: changeLog || '[]',
      // v0.13：方法论驱动的"整理"功能 — 存储 5 要素结构化数据
      structured_requirements: 'null',
      structured_requirements_history: '[]',
      // 30 文档「角色感知」：提交需求时的用户角色（PM/技术/设计/...），影响澄清 prompt + 列表展示
      user_role: userRole || '',
      created_at: now, updated_at: now, completed_at: '',
    };
    collection('requirements').insert(req);
    if (parentId) this.addChild(parentId, id);
    return req;
  }

  getById(id) { return collection('requirements').findOne(r => r.id === id) || null; }

  list({ projectId, status, parentId, rootOnly = false, limit = 50, offset = 0 } = {}) {
    let reqs = collection('requirements').all();
    if (projectId) reqs = reqs.filter(r => r.project_id === projectId);
    if (status) reqs = reqs.filter(r => r.status === status);
    if (rootOnly) reqs = reqs.filter(r => !r.parent_id);
    if (parentId !== undefined) reqs = reqs.filter(r => r.parent_id === parentId);
    reqs.sort((a, b) => (a.priority || 99) - (b.priority || 99));
    return reqs.slice(offset, offset + limit);
  }

  update(id, updates) {
    const now = new Date().toISOString();
    return collection('requirements').update(r => r.id === id, { ...updates, updated_at: now });
  }

  transition(id, targetStatus, actor = {}) {
    const req = this.getById(id);
    if (!req) return { error: 'REQ_NOT_FOUND' };
    if (!canTransition(req.status, targetStatus)) {
      return { error: 'INVALID_TRANSITION', from: req.status, to: targetStatus, allowed: getNextStatuses(req.status) };
    }
    if (targetStatus === 'review') {
      const gate = getGateErrors(req);
      if (!gate.passed) return { error: 'GATE_FAILED', errors: gate.errors };
    }

    const updates = { status: targetStatus };
    const now = new Date().toISOString();

    if (targetStatus === 'approved') {
      updates.phase = '执行';
      const approval = JSON.parse(req.approval || '{}');
      approval.approvedAt = now;
      approval.approvedBy = actor.id || 'user';
      updates.approval = JSON.stringify(approval);
    } else if (targetStatus === 'in_execution') {
      updates.phase = '执行';
    } else if (targetStatus === 'done') {
      updates.phase = '完成';
      updates.completed_at = now;
    }

    const updated = this.update(id, updates);

    // 子需求完成时，检查父需求是否所有子需求都已完成 → 自动完成父需求
    if (targetStatus === 'done' && req.parent_id) {
      this._checkParentCompletion(req.parent_id);
    }

    return updated;
  }

  addClarification(id, { role, agentId = '', content }) {
    const now = Date.now();
    collection('clarification_threads').insert({ requirement_id: id, role, agent_id: agentId, content, time: now });
    const req = this.getById(id);
    const refinement = JSON.parse(req.refinement || '{}');
    refinement.thread = refinement.thread || [];
    refinement.thread.push({ role, agentId, content, time: now });
    if (role === 'agent') refinement.roundsToClarify = (refinement.roundsToClarify || 0) + 1;
    this.update(id, { refinement: JSON.stringify(refinement) });
    return refinement;
  }

  addClarificationQuestion(id, { question, askedBy }) {
    const req = this.getById(id);
    const refinement = JSON.parse(req.refinement || '{}');
    refinement.clarifications = refinement.clarifications || [];
    refinement.clarifications.push({ question, askedBy, status: 'pending', answer: null, answeredAt: null });
    this.update(id, { refinement: JSON.stringify(refinement) });
    return refinement;
  }

  answerClarification(id, questionIndex, answer) {
    const req = this.getById(id);
    const refinement = JSON.parse(req.refinement || '{}');
    if (!refinement.clarifications || !refinement.clarifications[questionIndex]) return null;
    refinement.clarifications[questionIndex].status = 'answered';
    refinement.clarifications[questionIndex].answer = answer;
    refinement.clarifications[questionIndex].answeredAt = Date.now();
    this.update(id, { refinement: JSON.stringify(refinement) });
    return refinement;
  }

  getClarifications(id) {
    return collection('clarification_threads').find(c => c.requirement_id === id).sort((a, b) => a.time - b.time);
  }

  updateSrs(id, srs) {
    const req = this.getById(id);
    const currentSrs = JSON.parse(req.srs || '{}');
    const merged = { ...currentSrs, ...srs };
    // 优先 srs.description，其次 merged.summary（LLM 标准字段），保留旧值兜底
    this.update(id, { srs: JSON.stringify(merged), structured_description: srs.description || merged.summary || req.structured_description });
    return this.getById(id);
  }

  submitForReview(id, agentId) {
    const now = new Date().toISOString();
    const req = this.getById(id);
    const approval = JSON.parse(req.approval || '{}');
    approval.submittedAt = now;
    approval.submittedBy = agentId;
    this.update(id, { approval: JSON.stringify(approval) });

    const refinement = JSON.parse(req.refinement || '{}');
    refinement.readyForReview = true;
    this.update(id, { refinement: JSON.stringify(refinement) });

    return this.transition(id, 'review', { id: agentId, type: 'agent' });
  }

  checkAndAbandon() {
    const reqs = collection('requirements').find(r => r.status === 'idea' || r.status === 'clarifying');
    for (const req of reqs) {
      if (shouldAutoAbandon(req)) {
        this.transition(req.id, 'abandoned');
        console.log(`[ReqStore] Auto-abandoned ${req.id}`);
      }
    }
  }

  getStats(projectId) {
    const reqs = collection('requirements').find(r => r.project_id === projectId);
    const byStatus = {};
    reqs.forEach(r => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });
    const active = reqs.filter(r => r.status !== 'done' && r.status !== 'abandoned').length;
    return { byStatus, total: reqs.length, active };
  }

  // ===== 父子层级方法 =====

  findChildren(parentId) {
    return collection('requirements').find(r => r.parent_id === parentId);
  }

  findRootReqs(projectId) {
    return this.list({ projectId, rootOnly: true });
  }

  addChild(parentId, childId) {
    const parent = this.getById(parentId);
    if (!parent) return;
    const childIds = JSON.parse(parent.child_ids || '[]');
    if (!childIds.includes(childId)) {
      childIds.push(childId);
      this.update(parentId, { child_ids: JSON.stringify(childIds) });
    }
  }

  getProgress(reqId) {
    const children = this.findChildren(reqId);
    if (!children.length) {
      const req = this.getById(reqId);
      return { total: 0, done: 0, percent: req && req.status === 'done' ? 100 : 0, isParent: false };
    }
    const done = children.filter(c => c.status === 'done').length;
    return { total: children.length, done, percent: Math.round((done / children.length) * 100), isParent: true };
  }

  split(parentId, children) {
    const parent = this.getById(parentId);
    if (!parent) throw Object.assign(new Error('父需求不存在'), { status: 404, code: 'PARENT_NOT_FOUND' });

    const parentArchSpec = JSON.parse(parent.arch_spec || '{}');

    const created = [];
    for (const child of children) {
      const req = this.create({
        projectId: parent.project_id,
        title: child.title,
        description: child.description || '',
        priority: parent.priority,
        parentId, // 这会自动调用 addChild
        createdBy: parent.created_by,
        archSpec: parentArchSpec,  // 继承父的架构宪法
        interfaceContracts: child.interfaceContracts || [], // 可预填
      });
      created.push(req);
    }

    // 父需求转入 in_execution（如果当前是 approved 或 review）
    if (parent.status === 'approved' || parent.status === 'review') {
      this.transition(parentId, 'in_execution');
    }

    return { parent: this.getById(parentId), children: created };
  }

  /** 更新需求的架构宪法 */
  updateArchSpec(id, archSpec) {
    return this.update(id, { arch_spec: JSON.stringify(archSpec) });
  }

  /** 更新需求的接口契约 */
  updateInterfaceContracts(id, contracts) {
    return this.update(id, { interface_contracts: JSON.stringify(contracts) });
  }

  _checkParentCompletion(parentId) {
    const children = this.findChildren(parentId);
    if (children.length === 0) return;
    const allDone = children.every(c => c.status === 'done');
    if (allDone) {
      const parent = this.getById(parentId);
      if (parent && parent.status !== 'done') {
        this.transition(parentId, 'done');
        console.log(`[ReqStore] Auto-completed parent ${parentId} (all ${children.length} children done)`);
      }
    }
  }
}

module.exports = new RequirementStore();
