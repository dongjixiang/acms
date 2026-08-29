// ACMS GEO LLM 工具（v0.21 — 借鉴 GEORank tools 模块，Apache-2.0）
// 用途：JSON-LD 生成 / GEO 标题生成 / GEO 知识库草稿（复用 DeepSeek modelStore key）
// 路径：server/services/geo-llm-tools.js
//
// 借鉴点（GEORank dist/tools.js）：
//   - 输入 brief → LLM 生成输出的工具模式（原版调用前端 AI，我们复用 GEO 引擎 adapter）
//   - JSON-LD prompt：优先 Organization + WebSite，不编造客户/价格/证书
//   - GEO 标题 prompt：8 个标题，适合 AI 答案引用/比较页/解释页/采购页
//   - 知识库 prompt：品牌简介/能力/FAQ/关键事实（仅限输入），不编造

const ENGINES = require('./geo-engines');

const TIMEOUT_MS = 60000;

async function generate(prompt, { temperature = 0.5, maxTokens = 2000 } = {}) {
  const eng = ENGINES.getEngine('deepseek');
  if (!eng) return { ok: false, error: 'NO_ENGINE', message: 'DeepSeek 引擎未注册' };
  const r = await eng.query(prompt, { temperature, max_tokens: maxTokens });
  if (!r.ok) return r;
  // v0.24 修复：adapter 成功返回字段是 text（不是 raw_answer，那是 tracker 存库用的）
  const outText = r.text || r.raw_answer || '';
  if (!outText.trim()) {
    return { ok: false, error: 'EMPTY_RESPONSE', message: '模型返回了空内容（finish_reason=' + (r.finish_reason || '?') + '），请重试', engine: r.engine, model: r.model };
  }
  return { ok: true, text: outText, engine: r.engine, model: r.model, latency_ms: r.latency_ms };
}

const PROMPTS = {
  jsonld: (brief) => `你是 GEO 结构化数据专家。为以下品牌生成 JSON-LD，优先包含 Organization 和 WebSite 两种 schema；字段缺失时根据输入合理补齐，但不要编造具体客户、价格或证书。输出纯 JSON 代码块。

品牌信息：
${brief}`,
  titles: (brief) => `你是 GEO 内容策略专家。根据输入返回 Markdown，包含：
1. 核心关键词（3-5 个）
2. 目标用户（一句话）
3. 8 个 GEO 标题建议（编号列表）——标题要适合 AI 答案引用、比较页、解释页和采购页
4. 使用建议（如何选标题 + 发布到哪里）

输入：
${brief}`,
  kb: (brief) => `你是 GEO 知识库专家。为以下品牌生成 GEO 知识库草稿（Markdown），包含：
1. 品牌简介（100 字内）
2. 核心能力/产品（列表）
3. 常见问题 Q&A（5-8 条，面向 AI 引擎可能被问到的）
4. 关键事实（仅限输入中提供的信息，不要编造）
5. 适合 AI 引用的段落（2-3 段，含具体数据与第三方背书）

品牌信息：
${brief}`,
};

async function generateJsonLD(brief) {
  return generate(PROMPTS.jsonld(brief), { temperature: 0.3 });
}

async function generateTitles(brief) {
  return generate(PROMPTS.titles(brief), { temperature: 0.7, maxTokens: 1500 });
}

async function generateKB(brief) {
  return generate(PROMPTS.kb(brief), { temperature: 0.5, maxTokens: 3000 });
}

module.exports = { generate, generateJsonLD, generateTitles, generateKB, PROMPTS };
