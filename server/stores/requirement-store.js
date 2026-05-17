// 需求数据存储 (JSON 版)
const { collection } = require('../db/connection');
const { v4: uuidv4 } = require('uuid');
const { canTransition, getNextStatuses, getGateErrors, shouldAutoAbandon } = require('../services/state-machine');

class RequirementStore {
  create({ projectId, title, description = '', priority = 3, tags = [], deadline = '', createdBy = '' }) {
    const id = `REQ-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();
    const req = {
      id, project_id: projectId, title, description, structured_description: '',
      priority, tags: JSON.stringify(tags), deadline, status: 'idea', phase: '孵化',
      refinement: JSON.stringify({ thread: [], clarifications: [], suggestionCount: 0, roundsToClarify: 0, readyForReview: false }),
      srs: JSON.stringify({ scopeIn: [], scopeOut: [], acceptanceCriteria: [], technicalConstraints: [], summary: '' }),
      approval: JSON.stringify({ submittedAt: null, submittedBy: null, approvedAt: null, approvedBy: null, rejections: [] }),
      current_version: 1, change_history: '[]', wiki_path: '', wiki_synced: 0, last_wiki_sync: '',
      task_ids: '[]', progress: 0, created_by: createdBy, participants: '[]',
      created_at: now, updated_at: now, completed_at: '',
    };
    collection('requirements').insert(req);
    return req;
  }

  getById(id) { return collection('requirements').findOne(r => r.id === id) || null; }

  list({ projectId, status, limit = 50, offset = 0 } = {}) {
    let reqs = collection('requirements').all();
    if (projectId) reqs = reqs.filter(r => r.project_id === projectId);
    if (status) reqs = reqs.filter(r => r.status === status);
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

    return this.update(id, updates);
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
    this.update(id, { srs: JSON.stringify(merged), structured_description: srs.description || req.structured_description });
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
}

module.exports = new RequirementStore();
