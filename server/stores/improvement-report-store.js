// 自我改进报告存储
const { collection } = require('../db/connection');
const { v4: uuidv4 } = require('uuid');
const taskStore = require('./task-store');

class ImprovementReportStore {
  /**
   * 创建改进报告
   * @param {object} data
   * @param {string} data.projectId - 来源项目 ID
   * @param {string} data.sourceTaskId - 来源任务 ID（如 bug task）
   * @param {string} data.sourceType - 来源类型: bug | clarify | postmortem
   * @param {string} data.severity - 严重级别: critical | major | minor
   * @param {object} data.rootCause - 根因分析 { surface, deep, preventable }
   * @param {string} data.summary - 摘要
   * @param {Array} data.improvements - 改进建议列表 [{ dimension, issue, suggestion, priority }]
   */
  create(data) {
    const id = `IMP-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();
    const report = {
      id,
      project_id: data.projectId || '',
      source_task_id: data.sourceTaskId || '',
      source_type: data.sourceType || 'bug',
      severity: data.severity || 'major',
      root_cause: JSON.stringify(data.rootCause || {}),
      summary: data.summary || '',
      improvements: JSON.stringify(data.improvements || []),
      status: 'pending',           // pending | approved | declined
      task_id: '',                 // 审核通过后创建的改进任务 ID
      feedback: '',
      created_at: now,
      updated_at: now,
    };
    collection('improvement_reports').insert(report);
    console.log(`[ImprovementReport] 创建 ${id}: ${data.summary?.substring(0, 60)}`);
    return report;
  }

  getById(id) {
    return collection('improvement_reports').findOne(r => r.id === id) || null;
  }

  list(status) {
    let reports = collection('improvement_reports').all();
    reports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (status) reports = reports.filter(r => r.status === status);
    // 增强：附加来源任务标题
    return reports.map(r => {
      let sourceTaskTitle = '';
      if (r.source_task_id) {
        const task = collection('tasks').findOne(t => t.id === r.source_task_id);
        if (task) sourceTaskTitle = task.title || '';
      }
      return { ...r, sourceTaskTitle, improvements: r.improvements, root_cause: r.root_cause };
    });
  }

  /**
   * 审核改进报告
   * @param {string} id - 报告ID
   * @param {string} verdict - approved | declined
   * @param {string} feedback - 审核反馈
   * @returns {object} { report, task } — 如果通过则同时返回创建的 task
   */
  review(id, { verdict, feedback = '' }) {
    const report = this.getById(id);
    if (!report) return { error: 'REPORT_NOT_FOUND' };
    if (report.status !== 'pending') return { error: 'ALREADY_REVIEWED', status: report.status };

    const now = new Date().toISOString();
    let task = null;

    if (verdict === 'approved') {
      // 在自我改进项目下创建任务
      const selfImpProject = collection('projects').findOne(p => p.system_project === 1);
      if (!selfImpProject) return { error: 'SELF_IMPROVEMENT_PROJECT_NOT_FOUND' };

      const improvements = JSON.parse(report.improvements || '[]');
      const title = `🔄 ${report.summary?.substring(0, 60) || '自我改进任务'}`;
      const desc = [
        `## 🔄 自我改进任务`,
        ``,
        `**来源**: ${report.source_type} (${report.source_task_id})`,
        `**严重级别**: ${report.severity}`,
        ``,
        `### 摘要`,
        report.summary || '',
        ``,
        `### 根因分析`,
        (() => {
          try {
            const rc = JSON.parse(report.root_cause || '{}');
            return `- 表层: ${rc.surface || ''}\n- 深层: ${rc.deep || ''}\n- 可预防: ${rc.preventable || ''}`;
          } catch { return report.root_cause || ''; }
        })(),
        ``,
        `### 改进建议`,
        improvements.map((imp, i) =>
          `**建议${i+1} (${imp.dimension || ''}) [${imp.priority || 'medium'}]**:\n${imp.suggestion || imp.issue || ''}`
        ).join('\n\n'),
        ``,
        `### 反馈`,
        feedback || '',
      ].join('\n');

      task = taskStore.create({
        projectId: selfImpProject.id,
        parentId: '',
        title,
        description: desc,
        type: 'improvement',
        priority: report.severity === 'critical' ? 1 : (report.severity === 'major' ? 2 : 3),
        estimatedHours: 4,
        requiredSkills: { coding: 1.0 },
      });

      // 标记改进报告的 task_id
      collection('improvement_reports').update(r => r.id === id, {
        status: 'approved',
        task_id: task.id,
        feedback,
        updated_at: now,
      });

      console.log(`[ImprovementReport] ${id} → 已批准, 创建任务 ${task.id}`);
    } else {
      collection('improvement_reports').update(r => r.id === id, {
        status: 'declined',
        feedback,
        updated_at: now,
      });
      console.log(`[ImprovementReport] ${id} → 已忽略`);
    }

    return { report: this.getById(id), task };
  }

  /** 获取自我改进项目的看板数据 */
  getBoard() {
    const selfImpProject = collection('projects').findOne(p => p.system_project === 1);
    if (!selfImpProject) return {};
    return taskStore.getBoard(selfImpProject.id);
  }
}

module.exports = new ImprovementReportStore();
