// ACMS Task Router — v1
// 只负责把 Kanban task 分到最小必要执行模式。
// 当前先采用确定性安全路由，LLM intent router / workspace probe 可在此模块内继续接入。

const HIGH_RISK_PATTERNS = [
  /删除|清空|迁移|权限|认证|鉴权|支付|密码|密钥/i,
  /数据库|schema|migration|production|线上/i,
  /接口|API|后端|前端|页面|组件|路由/i,
  /重构|架构|全局|批量替换|兼容/i,
  /部署|发布|上线|回滚/i,
];

const DATA_PATTERNS = [
  /补充|追加|新增|增加|填充|补全|更新/i,
  /数据|事件|词条|记录|seed|fixture|mock/i,
];

function textOf(task) {
  return [task && task.title, task && task.description, task && task.actual_behavior]
    .filter(Boolean).join('\n');
}

function classify(task) {
  const text = textOf(task);
  const riskMatches = HIGH_RISK_PATTERNS
    .filter(re => re.test(text))
    .map(re => re.source);

  if (riskMatches.length > 0) {
    return {
      mode: 'full-pipeline',
      reason: '命中高风险/代码影响信号，保留完整 Planner→Coder→Tester→Reviewer 流水线',
      risk: 'high',
      confidence: 1,
      riskMatches,
    };
  }

  const looksLikeData = DATA_PATTERNS.every(re => re.test(text))
    || /历史事件|翻译词条|静态数据|测试数据|配置数据/i.test(text);

  if (looksLikeData) {
    return {
      mode: 'lightweight',
      reason: '识别为低风险数据补充；使用轻量执行器，不启动完整 multi-role Planner',
      risk: 'low',
      confidence: 0.85,
      riskMatches: [],
    };
  }

  return {
    mode: 'full-pipeline',
    reason: '无法安全证明是低风险轻量任务，保守使用完整流水线',
    risk: 'medium',
    confidence: 0.55,
    riskMatches: [],
  };
}

function buildRouterRecord(task, decision) {
  return {
    version: 'v1-deterministic',
    source: 'task-router',
    input: {
      type: task && task.type || '',
      title: task && task.title || '',
      description: task && task.description || '',
    },
    decision,
    decided_at: new Date().toISOString(),
  };
}

module.exports = { classify, buildRouterRecord, HIGH_RISK_PATTERNS, DATA_PATTERNS };
