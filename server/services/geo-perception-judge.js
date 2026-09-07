// ACMS GEO Perception & Risks Judge（v0.1 — Phase B，借鉴 oneglanse analysisPrompt.ts）
// 路径：server/services/geo-perception-judge.js
//
// 目的：对单个品牌的自然发现回答，用 LLM-as-judge 分析：
//   1. perception：品牌在 AI 回答里的"叙事画像"
//      - coreClaims[]：品牌被反复提及的核心主张（≤5 条）
//      - differentiators[]：品牌被当作差异化优势的点（≤5 条）
//      - bestKnownFor：品牌最被认可的特征（字符串或 null）
//      - pricingPerception：premium / mid_range / budget / free / not_mentioned
//   2. risks：需要品牌方关注的风险信号
//      - items[]：每条 severity=critical|warning|info
//
// 设计（与 geo-accuracy-judge.js 对齐）：
//   - 抽样 10 条自然发现回答（不足时补商业意图样本）
//   - 每条调 LLM 判定 perception + risks
//   - 结果聚合后写入 geo_scores 表 dimension='perception_risks'，7 天内复用
//   - 异步触发，不阻塞主评分（calculateCiteAbilityScore 读缓存）
//
// 借鉴 oneglanse：
//   - packages/services/src/analysis/analysisPrompt.ts 的 441 行 prompt
//   - 但简化为仅 perception + risks 两个维度（不加 geoScore/sentiment 等）
//
// v0.1 备注（2026-09-06）：
//   - 初次实现，prompt 需根据实际输出质量调整
//   - 借鉴 oneglanse ANTI-INFLATION MANDATE：LLM 容易过度打分，需强制保守

const GEO_STORE = require('./geo-store');
const { callLLM } = require('./llm-adapter');
const modelStore = require('../stores/model-store');

const SAMPLE_SIZE = 10;
const CACHE_DAYS = 7;

// perception + risks 的系统 prompt（借鉴 oneglanse analysisPrompt.ts）
const PERCEPTION_RISKS_SYSTEM_PROMPT = `你是 GEO 品牌感知分析师。你的任务：分析 AI 回答里关于品牌的叙事画像和风险信号。

## 绝对规则
1. ZERO HALLUCINATION：每个字段必须 trace 到原文；无原文支撑 → 保守默认值
2. QUOTE-OR-DEFAULT：先 mentally quote 原文，再打分；不确定 → 降级
3. ANTI-INFLATION：LLM 会过度打分，"maybe" 算 "no"，宁可保守
4. ANALYZE STATEMENTS ONLY：只分析陈述句，忽略疑问句

## 输入
- 品牌摘要：{name}（别名：{aliases}，行业：{industry}）
- 抽样回答：{count} 条自然发现回答（用户搜行业词时 AI 的回答）

## 输出 JSON schema
{
  "coreClaims": ["最多5条，品牌被反复提及的核心主张，每条 ≤ 30 字"],
  "differentiators": ["最多5条，品牌被当作差异化优势的点"],
  "bestKnownFor": "品牌最被认可的特征（字符串或 null）",
  "pricingPerception": "premium | mid_range | budget | free | not_mentioned",
  "risks": [
    {
      "severity": "critical | warning | info",
      "type": "outdated_info | negative_association | competitor_advantage | low_visibility | unclear_positioning",
      "description": "≤ 50 字简述"
    }
  ]
}

## 输出规则
- 只输出 JSON，不要任何其他文字
- 如果回答里完全没有品牌信息，coreClaims/differentiators 返回空数组，pricingPerception 返回 "not_mentioned"
- risks.items 可以为空数组`;

function buildPerceptionRisksPrompt(brand, responseTexts) {
  const brandSummary = {
    name: brand.name,
    domain: brand.domain,
    aliases: brand.aliases || [],
    industry: brand.industry || '',
  };
  // 截断每条回答（每条最多 1000 字符，总共最多 5000 字符）
  const truncated = responseTexts
    .slice(0, SAMPLE_SIZE)
    .map(t => String(t || '').slice(0, 1000))
    .join('\n\n');
  return JSON.stringify({
    brand: brandSummary,
    sample_count: responseTexts.length,
    responses: truncated,
  });
}

function findChatModel() {
  const models = modelStore.list();
  const candidate = models.find(m => m.status === 'active' && (m.capabilities || []).includes('text'));
  return candidate || models.find(m => m.status === 'active') || null;
}

async function analyzeOne(brand, responseTexts, modelId) {
  try {
    const r = await callLLM(modelId, [
      { role: 'system', content: PERCEPTION_RISKS_SYSTEM_PROMPT },
      { role: 'user', content: buildPerceptionRisksPrompt(brand, responseTexts) },
    ], { temperature: 0, jsonMode: true, maxTokens: 1500 });

    if (!r || !r.content) {
      return { error: 'EMPTY_RESPONSE', raw: null };
    }

    let obj = null;
    try {
      obj = JSON.parse(r.content);
    } catch (_) {
      // fallback: 提取文本中第一个 { ... }
      const m = String(r.content).match(/\{[\s\S]*?\}/);
      if (m) {
        try { obj = JSON.parse(m[0]); } catch (_) { /* keep null */ }
      }
    }

    if (!obj || typeof obj !== 'object') {
      return { error: 'PARSE_FAILED', raw: r.content.slice(0, 200) };
    }

    // 验证 schema（宽松校验：允许部分字段缺失）
    const validated = {
      coreClaims: Array.isArray(obj.coreClaims) ? obj.coreClaims.slice(0, 5) : [],
      differentiators: Array.isArray(obj.differentiators) ? obj.differentiators.slice(0, 5) : [],
      bestKnownFor: (typeof obj.bestKnownFor === 'string' && obj.bestKnownFor) ? obj.bestKnownFor : null,
      pricingPerception: ['premium', 'mid_range', 'budget', 'free', 'not_mentioned'].includes(obj.pricingPerception)
        ? obj.pricingPerception
        : 'not_mentioned',
      risks: Array.isArray(obj.risks)
        ? obj.risks
            .filter(r => r && typeof r === 'object')
            .map(r => ({
              severity: ['critical', 'warning', 'info'].includes(r.severity) ? r.severity : 'info',
              type: r.type || 'unclear_positioning',
              description: (typeof r.description === 'string' && r.description) ? r.description.slice(0, 50) : '未分类风险',
            }))
            .slice(0, 10)
        : [],
    };

    return { ok: true, data: validated, raw: r.content };
  } catch (e) {
    return { error: 'LLM_ERROR', message: e.message || 'unknown' };
  }
}

function getNaturalResponseIds(brandId, allQueries) {
  // 拉所有 natural（unbranded）query 的 response ids
  const naturalQueryIds = allQueries
    .filter(q => {
      if (!q) return false;
      // branded 判定逻辑与 geo-scoring.js 对齐
      const terms = (q.brandTerms || []).map(t => t.toLowerCase()).filter(Boolean);
      if (terms.length === 0) return true; // 无 brandTerms 视为自然发现
      const lower = String(q.prompt || '').toLowerCase();
      return !terms.some(t => lower.includes(t));
    })
    .map(q => q.id)
    .filter(Boolean);

  if (naturalQueryIds.length === 0) {
    // fallback：返回所有 query ids（用全部数据）
    return allQueries.map(q => q.id).filter(Boolean);
  }
  return naturalQueryIds;
}

async function analyzePerceptionAndRisks(brandId, options = {}) {
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return { ok: false, error: 'BRAND_NOT_FOUND' };

  // 缓存命中（非 force 时复用 7 天内数据）
  if (!options.force) {
    const cached = getCachedPerceptionRisks(brandId);
    if (cached) return cached;
  }

  const model = findChatModel();
  if (!model) {
    return { ok: false, error: 'NO_LLM_MODEL', message: '系统未配置 LLM 模型' };
  }

  const allResponses = GEO_STORE.listResponses({ brand_id: brandId }).filter(r => !r.error);
  const allQueries = GEO_STORE.listQueries(brandId);
  const naturalQueryIds = getNaturalResponseIds(brandId, allQueries);

  // 过滤出 natural 回答
  const naturalResponses = allResponses.filter(r => r.query_id && naturalQueryIds.includes(r.query_id));
  if (naturalResponses.length === 0) {
    return { ok: false, error: 'NO_DATA', message: '没有自然发现回答（先跑 tracker）' };
  }

  // 取最近 SAMPLE_SIZE 条
  const samples = naturalResponses
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, SAMPLE_SIZE);

  const responseTexts = samples.map(r => r.text || r.raw_answer || '');
  const result = await analyzeOne(brand, responseTexts, model.id);

  if (!result.ok) {
    return { ok: false, error: result.error, message: result.message || result.raw };
  }

  const computedAt = new Date().toISOString();
  const cacheResult = {
    ok: true,
    cached: false,
    coreClaims: result.data.coreClaims,
    differentiators: result.data.differentiators,
    bestKnownFor: result.data.bestKnownFor,
    pricingPerception: result.data.pricingPerception,
    risks: result.data.risks,
    sample_size: samples.length,
    model_used: model.id,
    computed_at: computedAt,
  };

  // 写入缓存（geo_scores 表 dimension='perception_risks'）
  try {
    GEO_STORE.createScore({
      brand_id: brandId,
      dimension: 'perception_risks',
      score: 1, // placeholder，实际数据存在 details 里
      details: cacheResult,
    });
  } catch (_) { /* 缓存写入失败不影响主流程 */ }

  return cacheResult;
}

function getCachedPerceptionRisks(brandId) {
  let scores;
  try {
    scores = GEO_STORE.listScores({ brand_id: brandId, dimension: 'perception_risks' });
  } catch (_) { return null; }
  if (!scores || scores.length === 0) return null;
  const latest = scores[0];
  if (!latest || !latest.computed_at) return null;
  const age = Date.now() - new Date(latest.computed_at).getTime();
  if (age > CACHE_DAYS * 24 * 60 * 60 * 1000) return null;
  const details = latest.details || {};
  return {
    ok: true,
    cached: true,
    coreClaims: details.coreClaims || [],
    differentiators: details.differentiators || [],
    bestKnownFor: details.bestKnownFor || null,
    pricingPerception: details.pricingPerception || 'not_mentioned',
    risks: details.risks || [],
    sample_size: details.sample_size,
    model_used: details.model_used,
    computed_at: details.computed_at,
  };
}

module.exports = {
  analyzePerceptionAndRisks,
  getCachedPerceptionRisks,
  SAMPLE_SIZE,
  CACHE_DAYS,
  _internal: {
    analyzeOne,
    findChatModel,
    buildPerceptionRisksPrompt,
    PERCEPTION_RISKS_SYSTEM_PROMPT,
  },
};
