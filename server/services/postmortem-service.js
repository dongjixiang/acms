// Post-Mortem Analyzer — 自我改进引擎
// 分析项目任务和缺陷数据，产出质量报告和改进建议

const { collection } = require('../db/connection');

class PostMortemService {

  /** 分析一个项目的全部数据 */
  analyze(projectId) {
    const tasks = collection('tasks').find(t => t.project_id === projectId);
    const bugs = collection('tasks').find(t => t.project_id === projectId && t.type === 'bug');

    const metrics = this._computeMetrics(tasks, bugs);
    const issues = this._detectIssues(tasks, bugs);
    const suggestions = this._generateSuggestions(issues, metrics);

    return {
      projectId,
      analyzedAt: new Date().toISOString(),
      summary: {
        totalTasks: tasks.length,
        totalBugs: bugs.length,
        ...metrics,
        issuesFound: issues.length,
        suggestionsCount: suggestions.length,
      },
      metrics,
      issues: issues.slice(0, 15),
      suggestions,
    };
  }

  // ========== 指标计算 ==========

  _computeMetrics(tasks, bugs) {
    const normalTasks = tasks.filter(t => t.type !== 'bug');

    // 首次通过率
    const reviewed = normalTasks.filter(t => t.status === 'done' || t.status === 'review');
    const submissions = [];
    for (const t of reviewed) {
      const subs = this._parse(t.submissions);
      if (subs.length > 0) submissions.push(subs);
    }
    const firstPass = submissions.filter(s => s.length === 1).length;
    const firstPassRate = submissions.length > 0
      ? Math.round((firstPass / submissions.length) * 100)
      : 100;

    // 平均返工次数
    const avgRework = submissions.length > 0
      ? +(submissions.reduce((s, arr) => s + arr.length, 0) / submissions.length).toFixed(1)
      : 1;

    // 审核通过率
    const reviews = [];
    for (const t of normalTasks) {
      for (const r of this._parse(t.reviews)) {
        reviews.push(r);
      }
    }
    const approved = reviews.filter(r => r.verdict === 'approved').length;
    const reviewApproveRate = reviews.length > 0
      ? Math.round((approved / reviews.length) * 100)
      : 100;

    // 拒绝原因聚类
    const rejectionReasons = {};
    for (const r of reviews) {
      if (r.verdict !== 'approved' && r.feedback) {
        const words = this._extractKeywords(r.feedback);
        for (const w of words) {
          rejectionReasons[w] = (rejectionReasons[w] || 0) + 1;
        }
      }
    }

    // 任务类型通过率
    const byType = {};
    for (const t of normalTasks) {
      const type = t.type || 'unknown';
      if (!byType[type]) byType[type] = { total: 0, approved: 0, rejected: 0 };
      byType[type].total++;
      const taskReviews = this._parse(t.reviews);
      const lastReview = taskReviews[taskReviews.length - 1];
      if (lastReview) {
        if (lastReview.verdict === 'approved') byType[type].approved++;
        else byType[type].rejected++;
      }
    }

    // 缺陷统计
    const bugStats = {
      total: bugs.length,
      open: bugs.filter(b => b.status === 'backlog' || b.status === 'in_progress').length,
      resolved: bugs.filter(b => b.status === 'done').length,
      bySeverity: {
        critical: bugs.filter(b => b.bug_severity === 'critical').length,
        major: bugs.filter(b => b.bug_severity === 'major').length,
        minor: bugs.filter(b => b.bug_severity === 'minor').length,
        trivial: bugs.filter(b => b.bug_severity === 'trivial').length,
      },
      bySource: {
        manual: bugs.filter(b => b.bug_source === 'manual').length,
        verify_failure: bugs.filter(b => b.bug_source === 'verify_failure').length,
        review_rejection: bugs.filter(b => b.bug_source === 'review_rejection').length,
      },
    };

    // 接口断裂检测
    let contractBreaks = 0;
    for (const t of normalTasks) {
      const contract = this._parse(t.depends_contract);
      if (contract.length > 0) {
        const taskReviews = this._parse(t.reviews);
        const rejected = taskReviews.filter(r => r.verdict !== 'approved');
        if (rejected.length > 0) contractBreaks++;
      }
    }

    return {
      firstPassRate,
      avgRework,
      reviewApproveRate,
      rejectionReasons: Object.entries(rejectionReasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, v]) => ({ reason: k, count: v })),
      byType,
      bugStats,
      contractBreaks,
    };
  }

  // ========== 问题检测 ==========

  _detectIssues(tasks, bugs) {
    const issues = [];
    const normalTasks = tasks.filter(t => t.type !== 'bug');

    // 1. 验收标准缺失检测
    const noAcceptance = normalTasks.filter(t => {
      const desc = t.description || '';
      return !desc.includes('npm test') && !desc.includes('npm run') &&
             !desc.includes('node --check') && !desc.includes('npx ');
    });
    if (noAcceptance.length > 0) {
      issues.push({
        type: 'MISSING_ACCEPTANCE_CRITERIA',
        severity: 'high',
        title: `${noAcceptance.length} 个任务缺少可自动化验收标准`,
        detail: noAcceptance.map(t => t.title || t.id).join('、'),
        suggestion: '修改 DECOMPOSE_PROMPT 强化验收自动化要求',
      });
    }

    // 2. 返工过多检测
    const highRework = normalTasks.filter(t => {
      return this._parse(t.submissions).length >= 3;
    });
    if (highRework.length > 0) {
      issues.push({
        type: 'HIGH_REWORK',
        severity: 'medium',
        title: `${highRework.length} 个任务返工超过 3 次`,
        detail: highRework.map(t => {
          const subs = this._parse(t.submissions);
          const reasons = subs.slice(1).map(s => s.notes?.substring(0, 60) || '').join(' | ');
          return `${t.title}: ${subs.length}次提交 → ${reasons}`;
        }),
        suggestion: '检查这些任务是否粒度太粗、描述不清晰或验收标准有歧义',
      });
    }

    // 3. 缺陷-任务关联分析
    const bugsWithTask = bugs.filter(b => b.source_task_id);
    if (bugsWithTask.length > 0) {
      const byTask = {};
      for (const b of bugsWithTask) {
        byTask[b.source_task_id] = (byTask[b.source_task_id] || 0) + 1;
      }
      const worst = Object.entries(byTask).sort((a, b) => b[1] - a[1]).slice(0, 3);
      issues.push({
        type: 'BUG_HOTSPOT',
        severity: 'high',
        title: `缺陷集中在 ${worst.length} 个任务上`,
        detail: worst.map(([tid, count]) => {
          const task = normalTasks.find(t => t.id === tid);
          return `${tid} (${task?.title || '?'}): ${count} 个关联缺陷`;
        }),
        suggestion: '对这些任务增加单元测试覆盖率，检查接口契约是否完整',
      });
    }

    // 4. 接口契约断裂
    const contractTasks = normalTasks.filter(t => {
      const c = this._parse(t.depends_contract);
      return c.length > 0;
    });
    for (const t of contractTasks) {
      const reviews = this._parse(t.reviews);
      const rejected = reviews.filter(r => r.verdict !== 'approved');
      if (rejected.length > 0) {
        const contract = this._parse(t.depends_contract);
        issues.push({
          type: 'CONTRACT_BREAK',
          severity: 'high',
          title: `任务 ${t.id} 依赖的接口契约未兑现`,
          detail: contract.map(c => `${c.file}: ${c.contract}`),
          suggestion: '重新审查接口定义任务，确保所有契约字段都存在',
        });
      }
    }

    // 5. 严重缺陷未解决
    const criticalBugs = bugs.filter(b => b.bug_severity === 'critical' && b.status !== 'done');
    if (criticalBugs.length > 0) {
      issues.push({
        type: 'CRITICAL_BUGS_OPEN',
        severity: 'critical',
        title: `${criticalBugs.length} 个严重缺陷仍未修复`,
        detail: criticalBugs.map(b => `${b.id}: ${b.title}`),
        suggestion: '优先处理严重缺陷，考虑回滚相关功能或紧急修复',
      });
    }

    // 6. 审核反馈模式
    const allReviews = [];
    for (const t of normalTasks) {
      for (const r of this._parse(t.reviews)) {
        allReviews.push({ taskId: t.id, taskTitle: t.title, ...r });
      }
    }
    const rejected = allReviews.filter(r => r.verdict !== 'approved');
    if (rejected.length > 0) {
      const patterns = this._clusterFeedback(rejected.map(r => r.feedback || ''));
      if (patterns.length > 0) {
        issues.push({
          type: 'REVIEW_PATTERN',
          severity: 'medium',
          title: '审核反馈中的重复模式',
          detail: patterns.map(p => `${p.pattern} (出现 ${p.count} 次)`),
          suggestion: '在任务创建时自动注入这些检查项',
        });
      }
    }

    return issues;
  }

  // ========== 生成建议 ==========

  _generateSuggestions(issues, metrics) {
    const suggestions = [];

    // 首次通过率低 → 提示词问题
    if (metrics.firstPassRate < 70) {
      suggestions.push({
        target: 'DECOMPOSE_PROMPT',
        action: '强化任务描述清晰度和验收标准的具体性',
        reason: `首次通过率仅 ${metrics.firstPassRate}%，表示分解出的任务质量偏低`,
      });
    }

    // 特定类型通过率低 → 技能匹配问题
    for (const [type, stats] of Object.entries(metrics.byType)) {
      const rate = stats.total > 0 ? Math.round(stats.approved / stats.total * 100) : 100;
      if (rate < 60 && stats.total >= 2) {
        suggestions.push({
          target: `skill-store (${type} 类任务)`,
          action: `重新评估 ${type} 类任务的技能匹配权重，当前通过率仅 ${rate}%`,
          reason: `${type} 类型 ${stats.total} 个任务中仅有 ${stats.approved} 个通过审核`,
        });
      }
    }

    // 缺陷高发 → 质量门禁
    if (metrics.bugStats.total > 0) {
      suggestions.push({
        target: 'review route',
        action: '在审核阶段增加缺陷密度检查：如果 source_task_id 指向的任务已有关联缺陷，自动增加测试要求',
        reason: `${metrics.bugStats.total} 个缺陷中 ${metrics.bugStats.open} 个仍未解决`,
      });
    }

    // 接口契约断裂
    if (metrics.contractBreaks > 0) {
      suggestions.push({
        target: 'acms-worker skill',
        action: '强化 Step 2 的 depends_contract 验证：Worker 必须在写代码前逐条确认前置接口契约已兑现',
        reason: `发现 ${metrics.contractBreaks} 处依赖契约未兑现`,
      });
    }

    return suggestions;
  }

  // ========== 工具函数 ==========

  _parse(field) {
    if (!field) return [];
    if (Array.isArray(field)) return field;
    try { return JSON.parse(field); } catch { return []; }
  }

  _extractKeywords(text) {
    const patterns = ['测试', '接口', '类型', '字段', '依赖', 'ownerId', '缺失',
      '不规范', '格式', 'lint', '语法', '性能', '内存', '泄漏', '测试覆盖率',
      '缺少', '遗漏', '未实现', '不完整'];
    return patterns.filter(p => text.includes(p));
  }

  _clusterFeedback(feedbacks) {
    const patterns = [
      { regex: /测试|test|spec/, label: '缺少测试' },
      { regex: /接口|interface|contract|字段|ownerId/, label: '接口/数据模型问题' },
      { regex: /lint|格式|style|规范/, label: '代码规范问题' },
      { regex: /性能|performance|慢|卡/, label: '性能问题' },
      { regex: /未实现|遗漏|不完整|缺失/, label: '功能不完整' },
    ];

    return patterns.map(p => {
      const count = feedbacks.filter(f => p.regex.test(f)).length;
      return count > 0 ? { pattern: p.label, count } : null;
    }).filter(Boolean).sort((a, b) => b.count - a.count);
  }
}

module.exports = new PostMortemService();
