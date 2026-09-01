// ACMS GEO 引擎工厂（v0.1 — Phase 0）
// 用途：注册和管理 AI 搜索引擎适配器
// 路径：server/services/geo-engines/index.js
//
// 当前支持：deepseek（Phase 0）
// Phase 1 待加：openai / anthropic / perplexity / google / copilot / grok / google_ai_mode

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