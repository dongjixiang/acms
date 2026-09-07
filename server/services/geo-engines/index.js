// ACMS GEO 引擎工厂（v0.2 — Phase B: 新增国内 DOM 派 provider）
// 用途：注册和管理 AI 搜索引擎适配器
// 路径：server/services/geo-engines/index.js
//
// v0.2 变更（2026-09-06）：
//   - 新增 doubao（豆包，字节跳动）— DOM 驱动，借鉴 oneglanse ProviderConfig 模式
//   - 新增 yuanbao（腾讯元宝）— DOM 驱动，借鉴 oneglanse AI Overview 模式（搜索 → AI 摘要）
//   - 新增 types.js（ProviderConfig 接口定义，借鉴 oneglanse types.ts）
//
// 当前支持：deepseek / openai / claude / perplexity / google / copilot / grok / minimax
//           deepseek-web / doubao / yuanbao

const ENGINES = {
  deepseek: require('./deepseek'),
  openai: require('./openai'),         // Phase 1 Week 1
  claude: require('./claude'),         // Phase 1 Week 1
  perplexity: require('./perplexity'), // Phase 1 Week 1（带 citations）
  google: require('./google'),         // Phase 1 Week 2 — Gemini
  copilot: require('./copilot'),       // Phase 1 Week 2 — Microsoft Copilot
  grok: require('./grok'),             // Phase 1 Week 2 — xAI Grok
  minimax: require('./minimax'),       // v0.27 — MiniMax（OpenAI 兼容协议）
  'deepseek-web': require('./deepseek-web'), // v0.1 — DeepSeek 网页版（browser-agent 自动化，原生智能搜索）
  doubao: require('./doubao'),         // v0.1 — 豆包（字节跳动，DOM 驱动）
  yuanbao: require('./yuanbao'),       // v0.1 — 腾讯元宝（DOM 驱动）
  // Phase 1 Week 2+: google_ai_mode（特殊 — web scraping，Google 反爬严，待评估）
};

function getEngine(name) {
  return ENGINES[name] || null;
}

function listEngines() {
  return Object.keys(ENGINES);
}

function getEngineInfo(name) {
  const eng = ENGINES[name];
  if (!eng) return null;
  return {
    name: eng.name,
    models: eng.models || [],
    defaultModel: eng.defaultModel,
    endpoint: eng.endpoint,
    capability: eng.capability || { search: 'none' },
  };
}

module.exports = {
  getEngine,
  listEngines,
  getEngineInfo,
  ENGINES,
};