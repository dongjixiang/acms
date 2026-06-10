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
  _baseFields(data) {
    const now = new Date().toISOString();
    return {
      project_id: data.projectId || '',
      source_task_id: data.sourceTaskId || '',
      source_type: data.sourceType || 'bug',      // bug | clarify | postmortem | idea
      source_user_id: data.sourceUserId || '',
      source_user_name: data.sourceUserName || '',
      source_role: data.sourceRole || '',         // PM | tech | agent:<name> | system | anonymous
      source_context: data.sourceContext || '',   // 自由文本：来源会话/触发点/灵感来源
      severity: data.severity || 'major',
      root_cause: JSON.stringify(data.rootCause || {}),
      summary: data.summary || '',
      improvements: JSON.stringify(data.improvements || []),
      status: 'pending',           // pending | approved | declined | merged
      task_id: '',                 // 审核通过后创建的改进任务 ID
      feedback: '',
      merged_into: '',             // 合并到哪个报告 ID（仅 merged 状态使用）
      related_ids: JSON.stringify(data.relatedIds || []), // 合并来源列表
      created_at: now,
      updated_at: now,
    };
  }

  create(data) {
    const id = `IMP-${Date.now().toString(36).toUpperCase()}`;
    const report = { id, ...this._baseFields(data) };
    collection('improvement_reports').insert(report);
    console.log(`[ImprovementReport] 创建 ${id} [${report.source_type}] [${report.source_role || 'anonymous'}] ${report.summary?.substring(0, 60)}`);
    return report;
  }

  /**
   * 创建一条想法（idea 来源）
   * @param {object} data
   * @param {string} data.title - 想法标题
   * @param {string} data.content - 想法详细内容
   * @param {string} data.summary - 一句话摘要（可选，没传就从 content 截）
   * @param {string} data.sourceUserId / sourceUserName / sourceRole / sourceContext
   * @param {Array}  data.improvements - AI 预分析的改进建议
   */
  createIdea(data) {
    const summary = data.summary || (data.content || '').substring(0, 80) || data.title || '';
    return this.create({
      ...data,
      summary,
      sourceType: 'idea',
      severity: data.severity || 'minor', // 想法默认 minor，严重程度由审核时判断
    });
  }

  /**
   * 列出想法（source_type=idea）
   * @param {object} opts
   * @param {string} opts.status - 状态过滤
   * @param {string} opts.sourceUserId - 来源用户过滤
   * @param {string} opts.sourceRole - 来源角色过滤
   */
  listIdeas({ status, sourceUserId, sourceRole } = {}) {
    let reports = collection('improvement_reports').find(r => r.source_type === 'idea');
    if (status) reports = reports.filter(r => r.status === status);
    if (sourceUserId) reports = reports.filter(r => r.source_user_id === sourceUserId);
    if (sourceRole) reports = reports.filter(r => r.source_role === sourceRole);
    reports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return reports.map(r => ({
      ...r,
      improvements: (() => { try { return JSON.parse(r.improvements || '[]'); } catch { return []; } })(),
      root_cause: (() => { try { return JSON.parse(r.root_cause || '{}'); } catch { return {}; } })(),
    }));
  }

  /**
   * 合并多条 idea 为一条新报告
   * @param {string[]} sourceIds - 被合并的 idea ID 列表
   * @param {object}  mergedData - 合并后报告的字段（title/summary/improvements/sourceUserId...）
   * @returns {object} { report, merged: number, sources: [...] }
   */
  mergeIdeas(sourceIds, mergedData) {
    if (!Array.isArray(sourceIds) || sourceIds.length < 2) {
      return { error: 'NEED_AT_LEAST_TWO_IDS' };
    }
    const sources = sourceIds.map(id => this.getById(id)).filter(Boolean);
    if (sources.length !== sourceIds.length) {
      return { error: 'SOME_IDS_NOT_FOUND' };
    }
    if (sources.some(s => s.source_type !== 'idea')) {
      return { error: 'ONLY_IDEAS_CAN_BE_MERGED' };
    }
    if (sources.some(s => s.status !== 'pending')) {
      return { error: 'ONLY_PENDING_CAN_BE_MERGED', statuses: sources.map(s => s.status) };
    }

    const now = new Date().toISOString();
    // 收集所有改进建议去重
    const allImprovements = [];
    const seen = new Set();
    for (const s of sources) {
      let imps = [];
      try { imps = JSON.parse(s.improvements || '[]'); } catch {}
      for (const imp of imps) {
        const key = (imp.suggestion || imp.issue || '').substring(0, 50);
        if (!seen.has(key)) { seen.add(key); allImprovements.push(imp); }
      }
    }

    const newReport = this.create({
      ...mergedData,
      sourceType: 'idea',
      severity: mergedData.severity || 'major',
      relatedIds: sourceIds,
      improvements: mergedData.improvements?.length ? mergedData.improvements : allImprovements,
      sourceContext: mergedData.sourceContext ||
        `合并自 ${sourceIds.length} 条想法: ${sourceIds.join(', ')}`,
    });

    // 标记源 idea 为 merged
    for (const id of sourceIds) {
      collection('improvement_reports').update(r => r.id === id, {
        status: 'merged',
        merged_into: newReport.id,
        updated_at: now,
      });
    }

    console.log(`[ImprovementReport] 合并 ${sourceIds.length} → ${newReport.id}`);
    return { report: newReport, merged: sourceIds.length, sources };
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
