// ACMS 辅助手段注册表（v0.3.3 多轮对话式澄清 Phase 2）
// 每种辅助手段都是独立的 service + 独立的前端组件
// 注册到 ASSISTS map 后，路由器 + 路由层统一调用
//
// L3：支持 apps/ 目录自动扫描 + 传统手动注册双模式

// ── 手动注册（向后兼容） ──
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
const useCase = require('./use-case');
const healthCheck = require('./health-check');
const music = require('./music');
const video = require('./video');
const imageGen = require('./image-gen');
const clean = require('./clean');
const screenplay = require('./screenplay');
const documentGen = require('./document-gen');
const sendEmail = require('./send-email');

const ASSISTS = {
  decision_tree: decisionTree,
  scenarios: scenarios,
  diagnosis: diagnosis,
  tradeoff: tradeoff,
  arch: arch,
  visual: visual,
  competitive: competitive,
  reference: reference,
  pains: pains,
  stakeholders: stakeholders,
  risks: risks,
  assumptions: assumptions,
  use_case: useCase,
  health_check: healthCheck,
  music: music,
  video: video,
  image_gen: imageGen,
  clean: clean,
  screenplay: screenplay,
  document_gen: documentGen,
  send_email: sendEmail,
};

// ── L3: 自动扫描 apps/ 目录注册 ──
try {
  const appManager = require('../app-manager');
  const appServices = appManager.registerAll();
  // 合并到 ASSISTS（app 优先，同名覆盖）
  Object.assign(ASSISTS, appServices);
  console.log(`[assists] 📦 总计 ${Object.keys(ASSISTS).length} 个辅助手段`);
} catch (e) {
  console.warn('[assists] ⚠️  app-manager 加载跳过:', e.message);
}

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
