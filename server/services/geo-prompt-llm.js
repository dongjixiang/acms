// ACMS GEO — LLM 自动生成 prompts（v0.26 C2a — 借鉴 elmo onboarding/analyze.ts）
// 路径：server/services/geo-prompt-llm.js
//
// 用途：输入品牌信息（name/domain/industry）→ LLM 生成 8-12 个短搜索片段 prompts + tags
// 借鉴 elmo 设计：
//   - promptSchema: 'Short search-style fragment, lowercase, under ~12 words.
//     NOT a full sentence — the kind of thing people actually type into ChatGPT.'
//   - TAG_GUIDANCE: tags 描述 "WHAT a prompt is about"（产品类别/用户分群/子特性/竞品名）
//     不是 "WHAT the user wants to do"（compare/evaluate/buy）
//     1-5 个共享词表；1-3 tag/prompt；不用 branded/unbranded（系统自动算）

const GEO_STORE = require('./geo-store');

// 生成 prompt 的提示词（借鉴 elmo promptSchema + TAG_GUIDANCE 中文版）
function buildLlmPrompt(brand) {
  const lines = [];
  lines.push(`# 生成 AI 搜索跟踪 Prompts`);
  lines.push('');
  lines.push(`## 品牌信息`);
  lines.push(`- 名称: ${brand.name}`);
  if (brand.domain) lines.push(`- 域名: ${brand.domain}`);
  if (brand.industry) lines.push(`- 行业: ${brand.industry}`);
  lines.push('');
  lines.push(`## 要求`);
  lines.push(`- 生成 8-12 个「用户会在 AI 搜索引擎（ChatGPT/DeepSeek/Perplexity 等）里真实输入的查询片段」`);
  lines.push(`- **不是完整句子** — 是简短搜索片段（12 字以内），像用户在搜索框输入的样子`);
  lines.push(`- 不包含句号、问号、感叹号`);
  lines.push(`- 覆盖多种用户视角：想了解的、想购买的、想对比的、想找案例的、想了解行业的`);
  lines.push(`- 大多数（约 70%）不要包含品牌名 — 这些测「自然发现」（用户搜行业词时品牌是否被 AI 主动提及）`);
  lines.push(`- 少数（约 30%）可以包含品牌名 — 这些测「品牌搜索覆盖」（用户搜品牌时 AI 给的信息）`);
  lines.push('');
  lines.push(`## 每个 prompt 附带 1-3 个 tags`);
  lines.push(`- tags 描述「这个 prompt 是关于什么的」（产品类别、用户分群、子特性、竞品名）`);
  lines.push(`- **不要**按用户意图分（对比/评估/购买 这种 tag 对大部分 prompt 都适用，没有区分度）`);
  lines.push(`- 全部 prompt 共享一个小的词表（不超过 5 个不同 tag）`);
  lines.push(`- 优先单个词；只有单个词无法表达时才用多词（小写，用连字符连接）`);
  lines.push(`- 每个 tag 只描述一个维度，不要融合两个概念`);
  lines.push(`- 不要用「品牌」「非品牌」作为 tag — 系统会自动计算这个分类`);
  lines.push('');
  lines.push(`## 输出 JSON 格式`);
  lines.push(`{"prompts": [{"prompt": "搜索片段", "tags": ["tag1", "tag2"]}]}`);
  return lines.join('\n');
}

/**
 * 调 LLM 生成 prompts（复用 agent-runtime）
 * @param {Object} brand - {id, name, domain, industry}
 * @returns {Promise<{ok: true, prompts: Array<{prompt, tags}>} | {ok: false, error, message}>}
 */
async function generatePromptsWithLLM(brand) {
  const runtime = require('./agent-runtime');
  const prompt = buildLlmPrompt(brand);

  try {
    const result = await runtime.execute({
      messages: [
        { role: 'system', content: '你是一名 GEO（Generative Engine Optimization）专家，擅长生成用户真实输入的 AI 搜索查询。严格输出 JSON（不要 markdown 代码块）。' },
        { role: 'user', content: prompt },
      ],
      toolNames: [],
      maxRounds: 1,
      caller: 'geo-prompt-llm',
      maxTokens: 2000,
      temperature: 0.5,
    });

    const rawContent = result.content || '';
    const parsed = parseLlmOutput(rawContent);

    if (!parsed.ok) return parsed;
    // 限制数量
    parsed.prompts = parsed.prompts.slice(0, 12);
    return parsed;
  } catch (e) {
    return {
      ok: false,
      error: 'LLM_CALL_FAILED',
      message: e.message,
    };
  }
}

/**
 * 解析 LLM 输出（JSON 优先，fallback 到固定模板）
 */
function parseLlmOutput(raw) {
  let jsonText = String(raw || '').trim();
  // 去掉 markdown 代码块
  jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  // 找 { 到 }
  const start = jsonText.indexOf('{');
  const end = jsonText.lastIndexOf('}');
  if (start >= 0 && end > start) {
    jsonText = jsonText.slice(start, end + 1);
  }
  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed.prompts)) throw new Error('no prompts array');
    const prompts = parsed.prompts
      .filter(p => p && typeof p.prompt === 'string' && p.prompt.trim())
      .map(p => ({
        prompt: p.prompt.trim(),
        tags: Array.isArray(p.tags) ? p.tags.slice(0, 3).map(t => String(t)) : [],
      }));
    if (prompts.length === 0) throw new Error('empty prompts');
    return { ok: true, prompts };
  } catch (e) {
    return {
      ok: false,
      error: 'PARSE_FAILED',
      message: `LLM 输出解析失败: ${e.message}。原始输出: ${raw.slice(0, 100)}`,
      prompts: [],
    };
  }
}

/**
 * LLM 生成 → 直接持久化到 geo_queries
 * @param {string} brandId
 * @returns {Promise<{ok, count, queries, source}>}
 */
async function generateAndPersistPrompts(brandId, options = {}) {
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return { ok: false, error: 'BRAND_NOT_FOUND', message: `Brand ${brandId} 不存在` };

  const genResult = await generatePromptsWithLLM(brand);
  if (!genResult.ok) return genResult;

  const created = [];
  for (const item of genResult.prompts) {
    const systemTags = GEO_STORE.computeSystemTags
      ? GEO_STORE.computeSystemTags(item.prompt, brand.name)
      : (item.prompt.toLowerCase().includes(brand.name.toLowerCase()) ? ['branded'] : ['unbranded']);
    const q = GEO_STORE.createQuery({
      brand_id: brandId,
      prompt: item.prompt,
      category: 'custom', // LLM 生成的不落固定 category，用 tags 分类
      engine_targets: options.engine_targets || ['deepseek', 'openai', 'claude', 'perplexity', 'gemini', 'grok'],
      tags: item.tags,
      source: 'ai_generated',
      systemTags,
    });
    created.push(q);
  }
  return { ok: true, count: created.length, queries: created, source: 'ai_generated' };
}

module.exports = {
  buildLlmPrompt,
  generatePromptsWithLLM,
  parseLlmOutput,
  generateAndPersistPrompts,
};
