// ACMS 辅助手段注册表（v0.3.3 多轮对话式澄清 Phase 2）
// 每种辅助手段都是独立的 service + 独立的前端组件
// 注册到 ASSISTS map 后，路由器 + 路由层统一调用
//
// 字段约定（每个 assist 写回到 requirement 自己的字段，避免互相冲突）：
//   assist_decision_tree: { generated_at, tree, used, status }
//   assist_scenarios:      { generated_at, scenarios, picked, status }
//   assist_diagnosis:      { generated_at, issues, status }
//   assist_tradeoff:       { generated_at, dimensions, picks, status }
//   assist_arch:           { generated_at, modules, status }
//   assist_visual:         复用 insight_previews（status/variants 写到 insight_previews 字段）
//
// 每个 service 必须暴露：name / runAssistJob(reqId, opts) / getAssist(reqId)

const decisionTree = require('./decision-tree');
const scenarios = require('./scenarios');
const diagnosis = require('./diagnosis');
const tradeoff = require('./tradeoff');
const arch = require('./arch');
const visual = require('./visual');

const ASSISTS = {
  decision_tree: decisionTree,
  scenarios: scenarios,
  diagnosis: diagnosis,
  tradeoff: tradeoff,
  arch: arch,
  visual: visual,  // v0.3.3 B+++：作为第 6 种辅助手段接入路由器
};

const ASSIST_METHODS = Object.keys(ASSISTS);

function getAssist(method) {
  return ASSISTS[method] || null;
}

function getAllAssists() {
  return Object.entries(ASSISTS).map(([method, svc]) => ({
    method,
    name: svc.name,
    field: svc.field || `assist_${method}`,
  }));
}

module.exports = { ASSISTS, ASSIST_METHODS, getAssist, getAllAssists };
