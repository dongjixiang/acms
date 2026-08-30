// ACMS GEO — Onboarding 向导后端（v0.26 C7 完整版 — 借鉴 elmo onboarding/analyze.ts）
// 路径：server/services/geo-onboarding.js
//
// 借鉴 elmo analyze.ts 设计：
//   1. analyzeBrand(brandId)：一次 LLM 调用（带品牌网站上下文）返回 5 类产出
//      - brandName（规范化 — nike.com/golf → "Nike Golf"）
//      - additionalDomains（地区域名/备用拼写）
//      - aliases（缩写/母公司名/常见错拼 — mention 检测用）
//      - competitors（直接竞品，带 domains + aliases）
//      - suggestedPrompts（短搜索片段 + 品牌定制 tags）
//   2. applyOnboarding(brandId, data)：把 review 后的结果批量落库
//      - brand 更新（name/aliases/additionalDomains）
//      - watch 创建（竞品）
//      - prompts 创建
//
// 差异（ACMS 简化）：
//   - elmo 用 worker + 轮询（~1 分钟）；我们用同步 agent-runtime 调用（10-30 秒，前端 loading）
//   - elmo 竞品是独立 competitors 表；我们复用 watch 系统（focus_brand + competitor_ids）

const GEO_STORE = require('./geo-store');

// =====================================================================
// LLM Prompt（借鉴 elmo analyze.ts 的 Zod schema + TAG_GUIDANCE）
// =====================================================================

function buildAnalyzePrompt(brand) {
  const lines = [];
  lines.push(`# 品牌 GEO 分析`);
  lines.push('');
  lines.push(`## 品牌信息`);
  lines.push(`- 名称: ${brand.name}`);
  lines.push(`- 域名: ${brand.domain}`);
  if (brand.industry) lines.push(`- 行业: ${brand.industry}`);
  lines.push('');
  lines.push(`## 分析目标`);
  lines.push(`分析该品牌，输出 5 类信息：`);
  lines.push('');
  lines.push(`### 1. brandName（规范化品牌名）`);
  lines.push(`- 用普通文本，不要 markdown/链接`);
  lines.push(`- 必须可搜索（mention 检测是子串匹配）`);
  lines.push(`- 不要加法律后缀（Inc./Ltd.）`);
  lines.push(`- 子品牌/产品线/区域分支 → 用该子品牌名（nike.com/golf → "Nike Golf"）`);
  lines.push(`- 没有子品牌就用域名主体（nike.com → "Nike"）`);
  lines.push('');
  lines.push(`### 2. additionalDomains（其他公开域名）`);
  lines.push(`- 地区 ccTLD、备用拼写、母公司网站`);
  lines.push(`- 只写 hostname（无协议、无 www、无路径）`);
  lines.push(`- 不含主域名本身`);
  lines.push(`- 不确定就空数组`);
  lines.push('');
  lines.push(`### 3. aliases（用户常用的其他名称）`);
  lines.push(`- 缩写、母公司名、常见错拼`);
  lines.push(`- 跳过含规范名子串的变体（子串匹配已经覆盖）`);
  lines.push(`- 如 Nike 的 "Converse"（子公司名）`);
  lines.push(`- 没有就空数组`);
  lines.push('');
  lines.push(`### 4. competitors（直接竞品）`);
  lines.push(`- 最多 6 个：卖类似产品给类似受众的公司`);
  lines.push(`- 每个含：name（公司名）、domains（该公司全部域名 — 至少 1 个，hostname 格式）、aliases（常用别名）`);
  lines.push(`- 不确定就空数组`);
  lines.push('');
  lines.push(`### 5. suggestedPrompts（建议的 AI 搜索跟踪查询）`);
  lines.push(`- 生成 8-12 个「用户会在 AI 搜索引擎（ChatGPT/DeepSeek/Perplexity 等）里真实输入的查询片段」`);
  lines.push(`- **不是完整句子** — 简短搜索片段（12 字以内），像用户在搜索框输入的样子`);
  lines.push(`- 不包含句号、问号、感叹号`);
  lines.push(`- 覆盖多种用户视角：想了解的、想购买的、想对比的、想找案例的、想了解行业的`);
  lines.push(`- 约 70% 不含品牌名（测自然发现 — 用户搜行业词时品牌被不被 AI 主动提及）`);
  lines.push(`- 约 30% 含品牌名（测品牌搜索覆盖）`);
  lines.push('');
  lines.push(`### tags（每个 prompt 附带 1-3 个）`);
  lines.push(`- tags 描述「这个 prompt 是关于什么的」（产品类别、用户分群、子特性、竞品名）`);
  lines.push(`- 不要按用户意图分（对比/评估/购买 这种 tag 对大部分 prompt 都适用，没有区分度）`);
  lines.push(`- 全部 prompt 共享一个小的词表（不超过 5 个不同 tag）`);
  lines.push(`- 优先单个词；只有单个词无法表达时才用多词（小写，连字符连接）`);
  lines.push(`- 每个 tag 只描述一个维度`);
  lines.push(`- 不要用「品牌」「非品牌」作为 tag（系统自动计算这个分类）`);
  lines.push('');
  lines.push(`## 输出 JSON 格式`);
  lines.push(`{"brandName":"...","additionalDomains":["..."],"aliases":["..."],"competitors":[{"name":"...","domains":["..."],"aliases":["..."]}],"suggestedPrompts":[{"prompt":"...","tags":["..."]}]}`);
  return lines.join('\n');
}

// =====================================================================
// analyzeBrand — LLM 分析
// =====================================================================

/**
 * @param {Object} brand - {id, name, domain, industry}
 * @returns {Promise<{ok: true, data: {...}} | {ok: false, error, message}>}
 */
async function analyzeBrand(brand) {
  const runtime = require('./agent-runtime');
  const prompt = buildAnalyzePrompt(brand);

  try {
    const result = await runtime.execute({
      messages: [
        { role: 'system', content: '你是一名 GEO（Generative Engine Optimization）专家，擅长品牌分析和用户查询生成。严格输出 JSON（不要 markdown 代码块）。' },
        { role: 'user', content: prompt },
      ],
      toolNames: [],
      maxRounds: 1,
      caller: 'geo-onboarding',
      maxTokens: 4000,
      temperature: 0.5,
    });

    const rawContent = result.content || '';
    const parsed = parseAnalyzeOutput(rawContent);
    if (!parsed.ok) return parsed;
    return { ok: true, data: parsed.data };
  } catch (e) {
    return { ok: false, error: 'LLM_CALL_FAILED', message: e.message };
  }
}

/**
 * 解析 LLM 输出（JSON 优先，容错 fallback）
 */
function parseAnalyzeOutput(raw) {
  let jsonText = String(raw || '').trim();
  jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = jsonText.indexOf('{');
  const end = jsonText.lastIndexOf('}');
  if (start >= 0 && end > start) jsonText = jsonText.slice(start, end + 1);

  try {
    const parsed = JSON.parse(jsonText);
    const data = {
      brandName: typeof parsed.brandName === 'string' ? parsed.brandName.trim() : '',
      additionalDomains: Array.isArray(parsed.additionalDomains) ? parsed.additionalDomains.slice(0, 10).map(String) : [],
      aliases: Array.isArray(parsed.aliases) ? parsed.aliases.slice(0, 10).map(String) : [],
      competitors: Array.isArray(parsed.competitors)
        ? parsed.competitors.slice(0, 6).map(c => ({
            name: typeof c?.name === 'string' ? c.name.trim() : '',
            domains: Array.isArray(c?.domains) ? c.domains.slice(0, 5).map(String) : [],
            aliases: Array.isArray(c?.aliases) ? c.aliases.slice(0, 5).map(String) : [],
          })).filter(c => c.name && c.domains.length > 0)
        : [],
      suggestedPrompts: Array.isArray(parsed.suggestedPrompts)
        ? parsed.suggestedPrompts.slice(0, 12).map(p => ({
            prompt: typeof p?.prompt === 'string' ? p.prompt.trim() : '',
            tags: Array.isArray(p?.tags) ? p.tags.slice(0, 3).map(String) : [],
          })).filter(p => p.prompt)
        : [],
    };
    if (!data.brandName && data.suggestedPrompts.length === 0) {
      throw new Error('empty result');
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: 'PARSE_FAILED', message: `LLM 输出解析失败: ${e.message}。原始: ${raw.slice(0, 100)}` };
  }
}

// =====================================================================
// applyOnboarding — 保存 review 结果
// =====================================================================

/**
 * @param {string} brandId
 * @param {Object} data - { brandName, additionalDomains, aliases, competitors, suggestedPrompts }
 * @returns {{ok, brand, watch, prompts_count}}
 */
function applyOnboarding(brandId, data = {}) {
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return { ok: false, error: 'BRAND_NOT_FOUND' };

  const results = { ok: true, brand: null, watch: null, prompts_count: 0, competitors_created: 0 };

  // 1. brand 更新（name / aliases / additionalDomains 存 settings）
  // v0.30: aliases 双写到顶层 + settings（兼容老读取路径 + 顶层别名主路径）
  const brandUpdates = {};
  if (data.brandName && data.brandName.trim() && data.brandName.trim() !== brand.name) {
    brandUpdates.name = data.brandName.trim();
  }
  const settings = { ...(brand.settings || {}) };
  if (Array.isArray(data.additionalDomains)) settings.additional_domains = data.additionalDomains;
  if (Array.isArray(data.aliases)) settings.aliases = data.aliases;
  brandUpdates.settings = settings;
  if (Array.isArray(data.aliases)) brandUpdates.aliases = data.aliases;
  GEO_STORE.updateBrand(brandId, brandUpdates);
  results.brand = { id: brandId, name: brandUpdates.name || brand.name, settings, aliases: data.aliases || [] };

  // 2. competitors → watch（复用 watch 系统：focus=当前 brand，全部竞品加入 competitor_ids）
  if (Array.isArray(data.competitors) && data.competitors.length > 0) {
    try {
      // 竞品名先转成 watch 能认的 ID（匹配现有 brands；没有的用 name 占位 — watch 系统支持 name 吗？看 store 实现）
      // 简单版：直接创建 watch 记录，competitor_ids 用竞品名
      const existingWatch = GEO_STORE.listWatches().find(w => w.focus_brand_id === brandId);
      const compIds = data.competitors.map(c => c.name);
      if (existingWatch) {
        GEO_STORE.updateWatch(existingWatch.id, { competitor_ids: [...new Set([...(existingWatch.competitor_ids || []), ...compIds])] });
        results.watch = { id: existingWatch.id, updated: true, competitor_ids: [...new Set([...(existingWatch.competitor_ids || []), ...compIds])] };
      } else {
        const watch = GEO_STORE.createWatch({
          focus_brand_id: brandId,
          competitor_ids: compIds,
          enabled: true,
        });
        results.watch = { id: watch.id, created: true, competitor_ids: compIds };
      }
      results.competitors_created = data.competitors.length;
    } catch (e) {
      results.watch_error = e.message;
    }
  }

  // 3. prompts 创建（source='onboarding'）
  if (Array.isArray(data.suggestedPrompts) && data.suggestedPrompts.length > 0) {
    let created = 0;
    for (const p of data.suggestedPrompts) {
      if (!p.prompt) continue;
      const systemTags = GEO_STORE.computeSystemTags
        ? GEO_STORE.computeSystemTags(p.prompt, results.brand?.name || brand.name)
        : (p.prompt.toLowerCase().includes((results.brand?.name || brand.name).toLowerCase()) ? ['branded'] : ['unbranded']);
      GEO_STORE.createQuery({
        brand_id: brandId,
        prompt: p.prompt,
        category: 'custom',
        engine_targets: ['deepseek', 'openai', 'claude', 'perplexity', 'gemini', 'grok'],
        tags: p.tags || [],
        source: 'onboarding',
        systemTags,
      });
      created++;
    }
    results.prompts_count = created;
  }

  return results;
}

// =====================================================================
// inferAliases — v0.30 轻量别名推断（不跑完整 onboarding）
// =====================================================================
//
// 用例：老品牌已经创建但没跑过 onboarding、aliases 字段为空
//       → POST /api/geo/brands/:id/infer-aliases 一次 LLM 调用补齐
// 与 analyzeBrand 的区别：
//   - analyzeBrand 输出 5 类（brandName/additionalDomains/aliases/competitors/prompts），~4000 tokens
//   - inferAliases 只输出 aliases，~500 tokens，省 80% token
// 输出：aliases 数组（≤6 条），落库到 brand.aliases（写入端自动过 normalizeAliases 清洗）

function buildInferAliasesPrompt(brand) {
  return [
    '# 别名推断（仅输出 JSON）',
    '',
    `品牌名: ${brand.name}`,
    `域名: ${brand.domain}`,
    brand.industry ? `行业: ${brand.industry}` : '',
    '',
    '## 任务',
    '推断该品牌在 AI 搜索回答里"用户/AI 实际使用"的其他名称（缩写、母公司名、常见错拼、英文名）。',
    '',
    '## 要求',
    '- 3-6 个最常用的别名',
    '- 跳过与主名有子串关系的（"中展" ⊂ "中展集团" — 子串匹配已覆盖）',
    '- 跳过通用词（公司/集团/Co/Ltd/AI/IT 等）',
    '- 输出 JSON 数组，不要 markdown',
    '',
    '## 输出格式',
    '["别名1", "别名2", "别名3"]',
  ].filter(Boolean).join('\n');
}

/**
 * @param {Object} brand - brand 对象（id/name/domain/industry）
 * @returns {Promise<{ok: true, aliases: string[]} | {ok: false, error, message}>}
 */
async function inferAliases(brand) {
  const runtime = require('./agent-runtime');
  const prompt = buildInferAliasesPrompt(brand);

  try {
    const result = await runtime.execute({
      messages: [
        { role: 'system', content: '你是 GEO 专家。严格输出 JSON 数组（不要 markdown 代码块、不要任何解释）。' },
        { role: 'user', content: prompt },
      ],
      toolNames: [],
      maxRounds: 1,
      caller: 'geo-onboarding-infer-aliases',
      maxTokens: 500,
      temperature: 0.3,
    });

    const raw = String(result.content || '').trim();
    // 解析 JSON 数组（容错：去 markdown + 取 [...] 段）
    let jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const start = jsonText.indexOf('[');
    const end = jsonText.lastIndexOf(']');
    if (start >= 0 && end > start) jsonText = jsonText.slice(start, end + 1);
    const parsed = JSON.parse(jsonText);
    const aliases = Array.isArray(parsed)
      ? parsed.slice(0, 6).map(s => String(s || '').trim()).filter(Boolean)
      : [];
    if (aliases.length === 0) {
      return { ok: false, error: 'EMPTY_RESULT', message: 'LLM 未返回任何别名' };
    }
    return { ok: true, aliases };
  } catch (e) {
    return { ok: false, error: 'LLM_CALL_FAILED', message: e.message };
  }
}

module.exports = {
  buildAnalyzePrompt,
  analyzeBrand,
  parseAnalyzeOutput,
  applyOnboarding,
  // v0.30: 轻量别名推断（独立调用，补齐老品牌 aliases）
  buildInferAliasesPrompt,
  inferAliases,
};
