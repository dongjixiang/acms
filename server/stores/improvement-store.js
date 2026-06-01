// 自我改进报告存储
const { collection } = require('../db/connection');
const { v4: uuidv4 } = require('uuid');

class ImprovementStore {
  create({ projectId, title, source, sourceProject = '', sourceTaskId = '',
           severity = 'major', rootCause = {}, improvements = [], summary = '' }) {
    const id = `IR-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();
    const report = {
      id, project_id: projectId, title, source, source_project: sourceProject,
      source_task_id: sourceTaskId, severity, status: 'pending',
      root_cause: JSON.stringify(rootCause),
      improvements: JSON.stringify(improvements),
      summary, task_id: '', created_at: now, updated_at: now,
    };
    collection('improvement_reports').insert(report);
    return report;
  }

  getById(id) {
    return collection('improvement_reports').findOne(r => r.id === id) || null;
  }

  list({ projectId, status, limit = 100, offset = 0 } = {}) {
    let reports = collection('improvement_reports').all();
    if (projectId) reports = reports.filter(r => r.project_id === projectId);
    if (status) reports = reports.filter(r => r.status === status);
    reports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return reports.slice(offset, offset + limit);
  }

  update(id, updates) {
    const now = new Date().toISOString();
    return collection('improvement_reports').update(r => r.id === id, { ...updates, updated_at: now });
  }

  /** 审核通过：创建任务并标记 */
  approve(id, taskId) {
    return this.update(id, { status: 'approved', task_id: taskId });
  }

  /** 忽略 */
  decline(id) {
    return this.update(id, { status: 'declined' });
  }
}

module.exports = new ImprovementStore();
