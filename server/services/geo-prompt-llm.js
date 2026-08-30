// ACMS GEO — LLM 自动生成 prompts（v0.29 — 借鉴 elmo analyze.ts + Profound Parrot Problem）
// 路径：server/services/geo-prompt-llm.js
//
// v0.29 升级（多多报「问出品牌概率太低」）：
//   - 注入结构化句式（elmo analyze.ts 的 schema）：
//     unbranded: best X / X for [persona] / X alternatives / where to find X / top X / X 推荐
//     branded:   X 怎么样 / X alternatives / X vs [竞品] / is X worth it / X review / X 收费
//   - 注入 Profound Parrot Problem：~50% AI 回答含 unsolicited Editorial content（best/top/review）
//     → 把「best/top/recommended/review」类句式作为自然发现核心窗口
//   - 强制 unbranded 70% / branded 30%，同句式变体上限 2 条避免同义反复
//   - 新增 `replace` 选项（先清旧 queries 再生成 — 避免模板累积膨胀）
//
// 借鉴 elmo 设计：
//   - promptSchema: 'Short search-style fragment, lowercase, under ~12 words.
//     NOT a full sentence — the kind of thing people actually type into ChatGPT.'
//   - TAG_GUIDANCE: tags 描述 "WHAT a prompt is about"（产品类别/用户分群/子特性/竞品名）
//     不是 "WHAT the user wants to do"（compare/evaluate/buy）
//     1-5 个共享词表；1-3 tag/prompt；不用 branded/unbranded（系统自动算）

const GEO_STORE = require('./geo-store');

// 结构化句式骨架（生成时把 [category] / [persona] / [场景] 等替换为品牌实际行业词）
const UNBRANDED_PATTERNS = [
  // (句式 id, 中文模板, 触发场景)
  ['best',       'best [产品/服务]',           'best-for'],
  ['for-persona','[产品/服务] for [目标客户]', 'best-for'],
  ['alt',        '[产品/服务] alternatives',  'alternative'],
  ['where',      'where to find [产品/服务]', 'discovery'],
  ['top',        'top [产品/服务] 2026',      'best-for'],
  ['recommend',  '[产品/服务] 推荐',          'editorial'],
  ['which',      '[产品/服务] 哪家好',        'editorial'],
  ['where-loc',  '上海 [产品/服务] 公司',     'discovery'],
];

const BRANDED_PATTERNS = [
  ['intro',     '[brand] 怎么样',          'brand-intro'],
  ['alt',       '[brand] alternatives',    'alternative'],
  ['vs',        '[brand] vs [竞品]',       'comparison'],
  ['worth',     'is [brand] worth it',    'brand-intro'],
  ['review',    '[brand] review',         'editorial'],
  ['pricing',   '[brand] 收费',           'brand-intro'],
];

// 生成 prompt 的提示词（v0.29 — 注入结构化句式 + Profound buyer-intent 维度）
function buildLlmPrompt(brand) {
  const lines = [];
  lines.push(`# 生成 AI 搜索跟踪 Prompts（v0.29 — 结构化句式版）`);
  lines.push('');
  lines.push(`## 品牌信息`);
  lines.push(`- 名称: ${brand.name}`);
  if (brand.domain) lines.push(`- 域名: ${brand.domain}`);
  if (brand.industry) lines.push(`- 行业: ${brand.industry}`);
  lines.push('');
  lines.push(`## 一句话目标`);
  lines.push(`模拟一个想了解/比较/采购「${brand.name || '[品牌]'}」（${brand.industry || '[行业]'}）的潜在用户，在 ChatGPT / DeepSeek / Perplexity / Gemini 里真实会敲什么样的查询。把最可能在 AI 回答里触发「品牌自然推荐」的问题提炼出来。`);
  lines.push('');
  lines.push(`## 硬性约束（不满足 → 输出无效）`);
  lines.push(`1. **形态**：每个 prompt ≤12 字（或 ≤8 词英文），**不是完整问句** — 是用户在搜索框直接敲的片段`);
  lines.push(`2. **句号/问号/感叹号全去掉**`);
  lines.push(`3. **数量 12-16 个**：unbranded 70%（8-11 个）+ branded 30%（3-5 个）`);
  lines.push(`4. **生成行业词**：根据 [行业] 填具体类别词。例如「会展服务」→ 展台搭建/展览设计/会展公司；「SaaS 工具」→ CRM/项目管理/团队协作`);
  lines.push('');
  lines.push(`## Unbranded 句式（必须覆盖 ≥5 种不同结构 — 借鉴 elmo schema）`);
  lines.push(`\`\`\``);
  for (const [, tpl, ctx] of UNBRANDED_PATTERNS) {
    lines.push(`[${ctx.padEnd(11)}]  ${tpl}`);
  }
  lines.push(`\`\`\``);
  lines.push(`【关键】上述句式至少命中 5 种结构，每种变体 ≤2 条。**禁止**生成一堆只换词的同义反复（如「展会公司 / 展览公司 / 展台公司」这种）。`);
  lines.push('');
  lines.push(`## Branded 句式（3-5 个，全部含「${brand.name || '[brand]'}」）`);
  lines.push(`\`\`\``);
  for (const [, tpl, ctx] of BRANDED_PATTERNS) {
    lines.push(`[${ctx.padEnd(13)}]  ${tpl.replace('[brand]', brand.name || '[brand]')}`);
  }
  lines.push(`\`\`\``);
  lines.push(`【关键】branded 至少覆盖「怎么样 / alternatives / vs 竞品 / worth it」中的 2 种 — 这些是用户决策时刻的真问题。`);
  lines.push('');
  lines.push(`## Profound Parrot 提示（自然发现核心窗口）`);
  lines.push(`研究表明 ~50% AI 回复会主动塞「对比/观点/推荐」类 Editorial content（用户没问）。`);
  lines.push(`因此 best/top/recommended/review 类句式**是最容易触发品牌自然被提及**的形态 — 必须重点覆盖。`);
  lines.push('');
  lines.push(`## Tags（每个 prompt 1-3 个）`);
  lines.push(`- 描述「prompt 是关于什么的」：产品类别 / 用户分群 / 子特性 / 地域 / 竞品名`);
  lines.push(`- 全集合共享 ≤5 个不同 tag，便于过滤`);
  lines.push(`- **不要**按用户意图分（compare/evaluate/buy — 这种 tag 没区分度）`);
  lines.push(`- 优先单词；多词小写连字符（multi-word）`);
  lines.push(`- 不写「branded/unbranded」— 系统自动算`);
  lines.push('');
  lines.push(`## 输出（严格 JSON，无 markdown 块）`);
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
 * @param {Object} options
 * @param {Array<string>} options.engine_targets - 引擎清单
 * @param {boolean} options.replace - v0.29：先清空品牌已有的 ai_generated/template/onboarding 来源 queries 再生成（避免累积膨胀）。legacy/manual 不会被删。
 * @returns {Promise<{ok, count, queries, source, replaced}>}
 */
async function generateAndPersistPrompts(brandId, options = {}) {
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return { ok: false, error: 'BRAND_NOT_FOUND', message: `Brand ${brandId} 不存在` };

  let replaced = 0;
  // v0.29: replace 模式 — 先清掉 auto-generated（LLM 之前生成的）+ template（硬模板）+ onboarding 三类
  // 保留 legacy（v0.26 完整问句迁移产物 — 让 cleanupLegacyQueries 处理）+ manual（用户手填）
  if (options.replace) {
    try {
      const existing = (typeof GEO_STORE.listQueries === 'function')
        ? GEO_STORE.listQueries(brandId)
        : [];
      const removable = existing.filter(q =>
        ['ai_generated', 'template', 'onboarding'].includes(q.source) || !q.source
      );
      const removableIds = removable.map(q => q.id);
      if (removableIds.length > 0 && typeof GEO_STORE.deleteQueries === 'function') {
        replaced = GEO_STORE.deleteQueries(removableIds, { cascade: true });
      }
    } catch (e) {
      console.warn('[geo-prompt-llm] replace 模式清理旧 queries 失败（继续生成）:', e.message);
    }
  }

  const genResult = await generatePromptsWithLLM(brand);
  if (!genResult.ok) return { ...genResult, replaced };

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
  return { ok: true, count: created.length, queries: created, source: 'ai_generated', replaced };
}

module.exports = {
  buildLlmPrompt,
  generatePromptsWithLLM,
  parseLlmOutput,
  generateAndPersistPrompts,
};
