// 质量度量服务 — 计算 + 存储 + 阈值触发
const reqStore = require('../stores/requirement-store');
const { collection } = require('../db/connection');

// 改进触发阈值
const TRIGGERS = {
  avgClarifyRounds: { threshold: 4, window: 10 },   // 近 10 个需求，平均 ≥ 4 轮
  firstPassRate:    { threshold: 0.6, window: 10 }, // 近 10 个评审，首次通过率 ≤ 60%
  flowCoverageDips: { threshold: 2, window: 5 },    // 近 5 个拆分，≥ 2 次流程覆盖不足
};

/**
 * 计算单个需求的质量指标
 */
function calculateMetrics(requirement) {
  const srs = typeof requirement.srs === 'string' ? JSON.parse(requirement.srs) : (requirement.srs || {});
  const refinement = typeof requirement.refinement === 'string' ? JSON.parse(requirement.refinement) : (requirement.refinement || {});
  const reviewReport = typeof requirement.review_report === 'string' ? JSON.parse(requirement.review_report) : (requirement.review_report || {});
  const flowCoverage = typeof requirement.flow_coverage === 'string' ? JSON.parse(requirement.flow_coverage) : (requirement.flow_coverage || {});
  const changeLog = typeof requirement.change_log === 'string' ? JSON.parse(requirement.change_log) : (requirement.change_log || []);
  const childIds = JSON.parse(requirement.child_ids || '[]');
  const approval = typeof requirement.approval === 'string' ? JSON.parse(requirement.approval) : (requirement.approval || {});

  // 1. 澄清效率
  const clarifyRounds = refinement.roundsToClarify || 0;

  // 2. 评审评分
  const reviewScore = reviewReport.score || 0;
  const reviewPassed = reviewReport.passed !== false;

  // 3. 流程覆盖率
  const flowPct = flowCoverage.covers && flowCoverage.flowMap
    ? Math.round((flowCoverage.covers.length / (flowCoverage.flowMap[0] || '').split('→').length) * 100)
    : 0;

  // 4. 变更频率
  const changeCount = changeLog.filter(c => c.stage === 'child-approved' || c.stage === 'change_requested').length;

  // 5. 父子偏差（有父需求时）
  let parentDeviation = null;
  if (requirement.parent_id) {
    try {
      const parent = reqStore.getById(requirement.parent_id);
      if (parent) {
        const parentSrs = typeof parent.srs === 'string' ? JSON.parse(parent.srs) : (parent.srs || {});
        const childSrs = srs;
        // 简单偏差：子 scopeIn 在父 scopeIn 中无法匹配的比例
        const unmatched = (childSrs.scopeIn || []).filter(cs =>
          !(parentSrs.scopeIn || []).some(ps => cs.includes(ps.substring(0, 8)))
        );
        parentDeviation = childSrs.scopeIn.length > 0
          ? Math.round((unmatched.length / childSrs.scopeIn.length) * 100)
          : 0;
      }
    } catch (e) { /* 跳过 */ }
  }

  return {
    id: requirement.id, title: requirement.title, status: requirement.status,
    clarifyRounds, reviewScore, reviewPassed,
    flowCoveragePct: flowPct, changeCount, parentDeviation,
    hasChildren: childIds.length > 0,
    projectId: requirement.project_id,
  };
}

/**
 * 计算项目的聚合指标
 */
function calculateProjectMetrics(projectId) {
  const reqs = collection('requirements').find(r => r.project_id === projectId);
  const completed = reqs.filter(r => r.status === 'done' || r.status === 'in_execution' || r.status === 'approved');
  const metrics = completed.map(r => calculateMetrics(r));

  const total = metrics.length;
  if (total === 0) return null;

  const avgRounds = metrics.reduce((s, m) => s + m.clarifyRounds, 0) / total;
  const avgScore = metrics.reduce((s, m) => s + m.reviewScore, 0) / total;
  const passCount = metrics.filter(m => m.reviewPassed).length;
  const avgFlow = metrics.reduce((s, m) => s + m.flowCoveragePct, 0) / total;
  const avgChanges = metrics.reduce((s, m) => s + m.changeCount, 0) / total;
  const deviations = metrics.filter(m => m.parentDeviation !== null && m.parentDeviation > 30);
  const highRound = metrics.filter(m => m.clarifyRounds >= 4);
  const lowFlow = metrics.filter(m => m.flowCoveragePct < 60);

  return {
    projectId,
    totalReqs: total,
    metrics: {
      avgClarifyRounds: Math.round(avgRounds * 10) / 10,
      firstPassRate: Math.round((passCount / total) * 100),
      avgFlowCoverage: Math.round(avgFlow),
      avgChangeCount: Math.round(avgChanges * 10) / 10,
      parentDeviationRate: deviations.length > 0 ? Math.round((deviations.length / total) * 100) : 0,
    },
    flags: {
      highRoundCount: highRound.length,
      lowFlowCount: lowFlow.length,
      deviationCount: deviations.length,
    },
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * 检查是否需要触发改进
 */
function checkImprovementTriggers(projectMetrics) {
  if (!projectMetrics) return [];

  const triggers = [];
  const m = projectMetrics.metrics;

  if (m.avgClarifyRounds >= TRIGGERS.avgClarifyRounds.threshold) {
    triggers.push({
      type: 'HIGH_CLARIFY_ROUNDS',
      severity: 'warning',
      title: `平均澄清轮数 ${m.avgClarifyRounds}（阈值 ${TRIGGERS.avgClarifyRounds.threshold}）`,
      detail: `需求平均需要 ${m.avgClarifyRounds} 轮才能澄清完成，说明领域 Skill 首轮遗漏较多`,
      suggestedAction: '补充领域 Skill 的首轮必问清单，减少来回往返',
    });
  }

  if (m.firstPassRate < TRIGGERS.firstPassRate.threshold * 100) {
    triggers.push({
      type: 'LOW_FIRST_PASS_RATE',
      severity: 'warning',
      title: `首次评审通过率 ${m.firstPassRate}%（阈值 ${TRIGGERS.firstPassRate.threshold * 100}%）`,
      detail: '评审首次通过率低，说明澄清阶段有系统性盲区',
      suggestedAction: '强化 Clarify prompt 的 Self-Review 规则，确保 readyForReview 前完成自审查',
    });
  }

  if (projectMetrics.flags.lowFlowCount >= TRIGGERS.flowCoverageDips.threshold) {
    triggers.push({
      type: 'LOW_FLOW_COVERAGE',
      severity: 'warning',
      title: `${projectMetrics.flags.lowFlowCount} 个需求的流程覆盖率 < 60%`,
      detail: '流程覆盖率低，说明拆分或澄清时遗漏了用户操作路径的节点',
      suggestedAction: '加强流程地图门控，确保拆分时每个节点都有子需求覆盖',
    });
  }

  if (projectMetrics.flags.deviationCount > 0) {
    triggers.push({
      type: 'PARENT_DEVIATION',
      severity: 'info',
      title: `${projectMetrics.flags.deviationCount} 个子需求与父需求存在偏差（>30%）`,
      detail: '子需求 scopeIn 偏离父需求，说明父子同步机制需要强化',
      suggestedAction: '检查父子同步的「三个同步点」是否生效',
    });
  }

  return triggers;
}

/**
 * 持久化指标并返回触发信号
 */
function persistAndCheck(projectId) {
  const metrics = calculateProjectMetrics(projectId);
  if (!metrics) return null;

  // 持久化到单独的 metrics 集合
  const metricsColl = collection('metrics');
  const existing = metricsColl.find(m => m.projectId === projectId);
  if (existing.length > 0) {
    metricsColl.update(m => m.projectId === projectId, { ...metrics, updatedAt: new Date().toISOString() });
  } else {
    metricsColl.insert({ ...metrics, createdAt: new Date().toISOString() });
  }

  const triggers = checkImprovementTriggers(metrics);
  return { metrics, triggers };
}

module.exports = { calculateMetrics, calculateProjectMetrics, checkImprovementTriggers, persistAndCheck };
