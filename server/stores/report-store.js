// 项目报告存储 — CRUD
const { collection } = require('../db/connection');
const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '..', '..', 'workspaces');

class ReportStore {
  /** 创建报告记录 */
  create({ projectId, title, type = 'comprehensive', template = 'comprehensive',
           params = {}, contentHtml = '', summary = '', filePath = '' }) {
    const id = `RPT-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();
    const report = {
      id, project_id: projectId, title, type, template,
      params: JSON.stringify(params),
      content_html: contentHtml,
      summary,
      file_path: filePath,
      created_at: now, updated_at: now,
    };
    collection('reports').insert(report);
    return report;
  }

  /** 按项目列出报告 */
  list(projectId, { limit = 50 } = {}) {
    let reports = collection('reports').all();
    if (projectId) reports = reports.filter(r => r.project_id === projectId);
    reports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return reports.slice(0, limit);
  }

  /** 获取单条报告 */
  getById(id) {
    return collection('reports').findOne(r => r.id === id) || null;
  }

  /** 更新报告 */
  update(id, updates) {
    const now = new Date().toISOString();
    return collection('reports').update(r => r.id === id, { ...updates, updated_at: now });
  }

  /** 删除报告（文件 + 记录） */
  remove(id) {
    const report = this.getById(id);
    if (report && report.file_path) {
      try {
        const fullPath = path.join(REPORTS_DIR, report.file_path);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } catch (e) { /* */ }
    }
    return collection('reports').remove(r => r.id === id);
  }

  /** 清理项目所有报告 */
  removeByProject(projectId) {
    const reports = this.list(projectId, { limit: 1000 });
    for (const r of reports) this.remove(r.id);
    return reports.length;
  }
}

module.exports = new ReportStore();
