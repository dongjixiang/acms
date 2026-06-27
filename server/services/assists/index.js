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
//   assist_risks:          { generated_at, items, summary, status }
//
// 每个 service 必须暴露：name / runAssistJob(reqId, opts) / getAssist(reqId)

const decisionTree = require('./decision-tree');
const scenarios = require('./scenarios');
const diagnosis = require('./diagnosis');
const tradeoff = require('./tradeoff');
const arch = require('./arch');
const visual = require('./visual');
const competitive = require('./competitive');
const reference = require('./reference');
const pains = require('./pains');
const stakeholders = require('./stakeholders');
const risks = require('./risks');
const assumptions = require('./assumptions');
const useCase = require('./use-case'); // v0.13：方法论驱动的"整理"（Use Case 工具）
const healthCheck = require('./health-check'); // v0.13 B4：需求体检 — 6 维度评分 + 可驳回
const music = require('./music'); // v0.19：音乐播放辅助 — 找免费播放源链接

const ASSISTS = {
  decision_tree: decisionTree,
  scenarios: scenarios,
  diagnosis: diagnosis,
  tradeoff: tradeoff,
  arch: arch,
  visual: visual,  // v0.3.3 B+++：作为第 6 种辅助手段接入路由器
  competitive: competitive, // v0.3.6：竞品分析
  reference: reference, // v0.3.6：借鉴卡片 — 参考产品/服务，选灵感方向
  pains: pains, // v0.4：痛点溯源 — 挖掘需求描述中的隐藏痛点
  stakeholders: stakeholders, // v0.4：干系人地图 — 识别需求涉及的相关干系人
  risks: risks, // v0.4：风险预警 — 扫描需求描述中的潜在风险
  assumptions: assumptions, // v0.4：假设清单 — 提取需求描述中的隐藏假设
  use_case: useCase, // v0.13：方法论驱动整理（ECSR + 5 要素 + 假设清单）
  health_check: healthCheck, // v0.13 B4：需求体检 — 6 维度评分
  music: music, // v0.19：音乐播放 — 找免费播放源链接
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
