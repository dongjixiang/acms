// ACMS GEO 评分服务（v0.1 — Phase 1 Week 3，v0.26 C3 重定义）
// 用途：cite-ability score + 多维度 GEO 评分
// 路径：server/services/geo-scoring.js
//
// v0.26 C3 重设计背景（多多：目前分析出来的指标看着都有问题）：
//   - 旧版把所有 query 混在一起算 → branded（品牌搜索）和 unbranded（自然发现）信号混合
//   - 旧版 position 用字符位置 → 回答越长越吃亏
//   - 旧版 context 只看长度 → "被推荐" vs "被批评" 无差别
//   - 旧版没有 SoV → 没体现"占 AI 引擎心智份额"
//
// 新算法（借鉴 elmo report-metrics.ts）：
//   1. 按 query 分层计算（branded / unbranded 分离）
//   2. unbranded（自然发现）是核心指标 — 用户搜行业词时品牌被不被 AI 主动提及
//   3. branded（品牌搜索覆盖）是次要指标 — 用户搜品牌时 AI 给的信息
//   4. position 用相对位置（第一次出现序号倒数）
//   5. context 加入情感信号（推荐词 / 批评词）
//   6. 新增 sov_natural（unbranded 里品牌 vs 竞品的份额）
//
// 综合分 = visibility_natural × 0.5 + sov_natural × 0.2 + position_natural × 0.15 + context_natural × 0.15
//
// 旧 5 维接口保留（components.mention_rate 等 = unbranded 版本），新增：
//   sov_natural          - 自然发现 SoV（品牌提及 / (品牌+竞品) 提及）
//   branded_mention_rate - 品牌搜索提及率（branded query 里品牌被提的概率）
//   branded_ratio        - branded query 占全部 query 比例

const GEO_STORE = require('./geo-store');

// === 评分维度工具函数 ===

// 提取响应里的文本（兼容 r.text 和 r.raw_answer 两种字段）
function getResponseText(r) {
  return r.text || r.raw_answer || '';
}

// 1. 提及率
function calculateMentionRate(brand, responses) {
  if (!responses || responses.length === 0) return 0;
  const mentioned = responses.filter(r => isMentioned(brand, getResponseText(r))).length;
  return mentioned / responses.length;
}

// v0.26 C3: 相对位置分（品牌第一次出现的词序号倒数 — 回答长短不偏）
// 0 = 第一个词就是品牌 → 1.0；第 5 个词 → 0.2
function calculatePositionScore(brand, responses) {
  const positions = responses
    .filter(r => isMentioned(brand, getResponseText(r)))
    .map(r => getBrandRelativePosition(brand, getResponseText(r)));
  if (positions.length === 0) return 0;
  const avgPosition = positions.reduce((a, b) => a + b, 0) / positions.length;
  return Math.max(0, Math.min(1, avgPosition));
}

// v0.26 C3: 上下文分（长度 + 情感信号）
// 长度分：50 字内 0.5 / 50-150 字 0.8 / 150+ 字 1.0
// 情感分：推荐词 +0.3 / 批评词 -0.3
function calculateContextScore(brand, responses) {
  const contexts = responses
    .filter(r => isMentioned(brand, getResponseText(r)))
    .map(r => extractBrandContext(brand, getResponseText(r)));
  if (contexts.length === 0) return 0;
  let total = 0;
  for (const ctx of contexts) {
    const len = ctx.length;
    const lenScore = len < 50 ? 0.5 : len < 150 ? 0.8 : 1.0;
    const sentiment = detectSentiment(ctx);
    total += Math.max(0, Math.min(1, lenScore + sentiment));
  }
  return total / contexts.length;
}

// 情感检测（中英文推荐词/批评词）
function detectSentiment(text) {
  const t = String(text || '').toLowerCase();
  const pos = ['推荐', '首选', '领先', '优秀', '最好', '值得', '好评', 'best', 'recommended', 'leading', 'top', 'great', 'excellent'];
  const neg = ['差', '不好', '不要', '坑', '问题', '投诉', '贵', '失望', 'bad', 'worst', 'poor', 'avoid', 'complaint'];
  let score = 0;
  for (const w of pos) if (t.includes(w)) { score += 0.3; break; }
  for (const w of neg) if (t.includes(w)) { score -= 0.3; break; }
  return score;
}

// v0.26 C3: SoV（自然发现份额）
// 每个 query 跑出来的回答里，品牌被提及的次数 vs 竞品被提及的次数
function calculateSoV(brand, responses, competitorNames) {
  if (!responses || responses.length === 0) return null;
  const text = responses.map(getResponseText).join('\n').toLowerCase();
  const brandMentions = isMentioned(brand, text) ? 1 : 0;
  // 竞品提及（每个 query 统计一次 — 回答里出现就算）
  let competitorMentions = 0;
  for (const comp of competitorNames || []) {
    if (comp && text.includes(comp.toLowerCase())) competitorMentions += 1;
  }
  const total = brandMentions + competitorMentions;
  if (total === 0) return null;
  return brandMentions / total;
}

// 4. 引擎一致性（多引擎提及率的 stdDev，越低越一致）
function calculateEngineConsistency(brand, responses) {
  if (!responses || responses.length === 0) return 0;
  // 按引擎分组
  const byEngine = {};
  for (const r of responses) {
    if (!r.engine) continue;
    if (!byEngine[r.engine]) byEngine[r.engine] = [];
    byEngine[r.engine].push(r);
  }
  const engines = Object.keys(byEngine);
  if (engines.length === 0) return 0;
  if (engines.length === 1) return null; // v0.26 C3: 只有 1 个引擎 → 无一致性数据（不算 1.0）

  // 每个引擎的提及率
  const rates = engines.map(e => calculateMentionRate(brand, byEngine[e]));
  // stdDev
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  const variance = rates.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rates.length;
  const stdDev = Math.sqrt(variance);
  // 一致性 = 1 - stdDev（max stdDev = 0.5，min = 0）
  return Math.max(0, Math.min(1, 1 - stdDev * 2));
}

// 5. 时效性（最近 30 天响应占比）
function calculateFreshness(responses, daysWindow = 30) {
  if (!responses || responses.length === 0) return 0;
  const now = Date.now();
  const cutoff = now - daysWindow * 24 * 60 * 60 * 1000;
  const recent = responses.filter(r => r.ts && r.ts >= cutoff).length;
  return recent / responses.length;
}

// v0.26 C3: 判断 query 是否 branded（含品牌名 — 系统自动算）
function isBrandedPrompt(promptText, brand) {
  const brandName = (typeof brand === 'string' ? brand : (brand.name || brand.domain || '')).toLowerCase();
  if (!brandName) return false;
  return String(promptText || '').toLowerCase().includes(brandName);
}

// v0.26 C3: 按 query 分层计算（核心新算法）
// 返回 { natural: {...}, branded: {...}, queryStats: [...] }
function computeLayeredMetrics(brand, responses, queries) {
  const brandName = typeof brand === 'string' ? brand : (brand.name || brand.domain || '');
  const allResponses = responses || [];
  const allQueries = queries || [];

  // 按 query_id 分组 responses
  const byQuery = {};
  for (const r of allResponses) {
    if (!r.query_id) continue;
    if (!byQuery[r.query_id]) byQuery[r.query_id] = [];
    byQuery[r.query_id].push(r);
  }

  const queryStats = [];
  for (const q of allQueries) {
    const runs = byQuery[q.id] || [];
    if (runs.length === 0) continue;
    const branded = isBrandedPrompt(q.prompt, brandName);
    const mentioned = runs.filter(r => isMentioned(brandName, getResponseText(r))).length;
    const mentionRate = mentioned / runs.length;
    queryStats.push({
      id: q.id,
      prompt: q.prompt || '',
      branded,
      runs: runs.length,
      mentioned,
      mentionRate,
    });
  }

  const natural = queryStats.filter(s => !s.branded);
  const brandedQ = queryStats.filter(s => s.branded);

  // natural 聚合
  const naturalRuns = allResponses.filter(r => {
    const q = allQueries.find(x => x.id === r.query_id);
    return q && !isBrandedPrompt(q.prompt, brandName);
  });
  // branded 聚合
  const brandedRuns = allResponses.filter(r => {
    const q = allQueries.find(x => x.id === r.query_id);
    return q && isBrandedPrompt(q.prompt, brandName);
  });

  // natural 指标（核心）
  const naturalMentionRate = naturalRuns.length > 0
    ? naturalRuns.filter(r => isMentioned(brandName, getResponseText(r))).length / naturalRuns.length
    : null;
  const naturalPosition = naturalRuns.length > 0 ? calculatePositionScore(brandName, naturalRuns) : null;
  const naturalContext = naturalRuns.length > 0 ? calculateContextScore(brandName, naturalRuns) : null;
  const naturalConsistency = naturalRuns.length > 0 ? calculateEngineConsistency(brandName, naturalRuns) : null;
  const naturalFreshness = naturalRuns.length > 0 ? calculateFreshness(naturalRuns) : null;

  // natural SoV：竞品名单 = 所有其他 brands（从 store 拉）
  let competitorNames = [];
  try {
    const allBrands = GEO_STORE.listBrands();
    competitorNames = allBrands
      .filter(b => b.id !== (typeof brand === 'string' ? brand : brand.id))
      .map(b => b.name)
      .filter(Boolean);
  } catch (_) { /* 拉取失败 → SoV 只算品牌自身 */ }
  const naturalSoV = naturalRuns.length > 0 ? calculateSoV(brandName, naturalRuns, competitorNames) : null;

  // branded 指标（次要）
  const brandedMentionRate = brandedRuns.length > 0
    ? brandedRuns.filter(r => isMentioned(brandName, getResponseText(r))).length / brandedRuns.length
    : null;
  const brandedRatio = queryStats.length > 0 ? brandedQ.length / queryStats.length : 0;

  return {
    queryStats,
    natural: {
      mentionRate: naturalMentionRate,
      positionScore: naturalPosition,
      contextScore: naturalContext,
      consistency: naturalConsistency,
      freshness: naturalFreshness,
      sov: naturalSoV,
      sampleSize: naturalRuns.length,
    },
    branded: {
      mentionRate: brandedMentionRate,
      ratio: brandedRatio,
      sampleSize: brandedRuns.length,
    },
  };
}

// === 综合分 ===

function calculateCiteAbilityScore(brand, options = {}) {
  const brandId = typeof brand === 'string' ? brand : brand.id;
  const brandName = typeof brand === 'string' ? brand : (brand.name || brand.domain || brandId);
  const lookbackDays = options.lookbackDays || 30;

  // 从 store 拉响应数据
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const allResponses = GEO_STORE.listResponses({ brand_id: brandId })
    .filter(r => !r.error && r.ts >= cutoff);
  const allQueries = GEO_STORE.listQueries(brandId);

  if (allResponses.length === 0) {
    return {
      ok: false,
      error: 'NO_DATA',
      message: `没有 ${brandName} 的最近 ${lookbackDays} 天响应数据。请先跑 GEO 跟踪（tracker agent）生成数据。`,
      brand_id: brandId,
      brand_name: brandName,
    };
  }

  // v0.26 C3: 分层计算（核心新算法）
  const layered = computeLayeredMetrics(brand, allResponses, allQueries);
  const N = layered.natural;

  // 综合分：natural 指标（unbranded 才是真实可见性）
  //   mention_rate × 0.5 + sov × 0.2 + position × 0.15 + context × 0.15
  // 没有 natural 数据时 fallback 到全部数据（旧逻辑兼容）
  let totalScore;
  const components = {};

  if (N.mentionRate != null) {
    const sovComponent = N.sov != null ? N.sov : 0;
    const posComponent = N.positionScore != null ? N.positionScore : 0;
    const ctxComponent = N.contextScore != null ? N.contextScore : 0;
    totalScore = (
      N.mentionRate * 0.5 +
      sovComponent * 0.2 +
      posComponent * 0.15 +
      ctxComponent * 0.15
    ) * 100;
    components.mention_rate = Math.round(N.mentionRate * 1000) / 1000;
    components.position_score = posComponent != null ? Math.round(posComponent * 1000) / 1000 : 0;
    components.context_score = ctxComponent != null ? Math.round(ctxComponent * 1000) / 1000 : 0;
    components.engine_consistency = N.consistency != null ? Math.round(N.consistency * 1000) / 1000 : null;
    components.freshness = N.freshness != null ? Math.round(N.freshness * 1000) / 1000 : null;
    components.sov_natural = N.sov != null ? Math.round(N.sov * 1000) / 1000 : null;
    components.branded_mention_rate = layered.branded.mentionRate != null ? Math.round(layered.branded.mentionRate * 1000) / 1000 : null;
    components.branded_ratio = Math.round(layered.branded.ratio * 1000) / 1000;
  } else {
    // fallback：全部数据（旧算法）
    const mentionRate = calculateMentionRate(brandName, allResponses);
    const positionScore = calculatePositionScore(brandName, allResponses);
    const contextScore = calculateContextScore(brandName, allResponses);
    const consistency = calculateEngineConsistency(brandName, allResponses);
    const freshness = calculateFreshness(allResponses, lookbackDays);
    totalScore = (
      mentionRate * 0.5 +
      (calculateSoV(brandName, allResponses, []) ?? 0) * 0.2 +
      positionScore * 0.15 +
      contextScore * 0.15
    ) * 100;
    components.mention_rate = Math.round(mentionRate * 1000) / 1000;
    components.position_score = Math.round(positionScore * 1000) / 1000;
    components.context_score = Math.round(contextScore * 1000) / 1000;
    components.engine_consistency = consistency != null ? Math.round(consistency * 1000) / 1000 : null;
    components.freshness = Math.round(freshness * 1000) / 1000;
    components.sov_natural = null;
    components.branded_mention_rate = null;
    components.branded_ratio = 0;
  }

  // 引擎使用情况
  const enginesUsed = [...new Set(allResponses.map(r => r.engine).filter(Boolean))];

  return {
    ok: true,
    brand_id: brandId,
    brand_name: brandName,
    score: Math.round(totalScore * 100) / 100,
    grade: getGrade(totalScore),
    components,
    weights: {
      mention_rate: 0.5,
      sov_natural: 0.2,
      position_score: 0.15,
      context_score: 0.15,
    },
    sample_size: allResponses.length,
    natural_sample_size: layered.natural.sampleSize,
    branded_sample_size: layered.branded.sampleSize,
    engines_used: enginesUsed,
    lookback_days: lookbackDays,
    computed_at: new Date().toISOString(),
  };
}

// === 工具函数 ===

function isMentioned(brand, text) {
  if (!text || !brand) return false;
  const escaped = brand.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.toLowerCase().includes(brand.toLowerCase());
}

// 获取品牌在文本中的位置（0-1, 0 = 最开始）
function getBrandPosition(brand, text) {
  const lower = text.toLowerCase();
  const brandLower = brand.toLowerCase();
  const idx = lower.indexOf(brandLower);
  if (idx < 0) return 1; // 找不到 → 末尾
  return idx / text.length;
}

// v0.26 C3: 相对位置分 — 品牌第一次出现的词序号倒数（回答长短不偏）
// 词序号 0（第一个词）= 1.0；第 5 个词 = 0.2；第 10 个词 = 0.1
function getBrandRelativePosition(brand, text) {
  const lower = text.toLowerCase();
  const brandLower = brand.toLowerCase();
  const idx = lower.indexOf(brandLower);
  if (idx < 0) return 0;
  // 计算品牌出现位置之前有几个词
  const before = text.slice(0, idx);
  const wordCount = before.split(/\s+/).filter(Boolean).length;
  return 1 / (wordCount + 1);
}

// 提取品牌上下文（前后各 50 字）
function extractBrandContext(brand, text) {
  const lower = text.toLowerCase();
  const brandLower = brand.toLowerCase();
  const idx = lower.indexOf(brandLower);
  if (idx < 0) return '';
  const start = Math.max(0, idx - 50);
  const end = Math.min(text.length, idx + brandLower.length + 50);
  return text.slice(start, end);
}

// 评分等级
function getGrade(score) {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

// === 快照摘要（用于周报） ===

function generateSnapshotSummary(brandId, week) {
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return null;

  const score = calculateCiteAbilityScore(brand);
  if (!score.ok) return score;

  const snapshot = GEO_STORE.createSnapshot({
    brand_id: brandId,
    week,
    summary_json: {
      score: score.score,
      grade: score.grade,
      components: score.components,
      engines_used: score.engines_used,
      sample_size: score.sample_size,
    },
  });

  // 同时保存每个维度为独立 score 记录（便于时间序列分析）
  // v0.26 C3: null 值（无数据 — engine_consistency 单引擎/sov_natural 无竞品/branded 无查询）跳过，不创建 score 记录
  for (const [dim, val] of Object.entries(score.components)) {
    if (val == null) continue;
    GEO_STORE.createScore({
      brand_id: brandId,
      dimension: dim,
      score: val,
      snapshot_id: snapshot.id,
      details: { engines: score.engines_used, sample_size: score.sample_size },
    });
  }

  return {
    ok: true,
    snapshot,
    score,
  };
}

// === 跨品牌对比 ===

function compareBrands(brandIds, options = {}) {
  const results = brandIds.map(id => {
    const brand = GEO_STORE.getBrand(id);
    if (!brand) return { brand_id: id, ok: false, error: 'BRAND_NOT_FOUND' };
    return calculateCiteAbilityScore(brand, options);
  });
  // 按 score 排序
  results.sort((a, b) => (b.score || 0) - (a.score || 0));
  return {
    ok: true,
    brands: results,
    leader: results[0]?.brand_name || null,
    total: results.length,
  };
}

module.exports = {
  calculateCiteAbilityScore,
  generateSnapshotSummary,
  compareBrands,
  // 内部工具（测试用）
  _internal: {
    isMentioned,
    getBrandPosition,
    getBrandRelativePosition,
    extractBrandContext,
    calculateMentionRate,
    calculatePositionScore,
    calculateContextScore,
    calculateEngineConsistency,
    calculateFreshness,
    detectSentiment,
    isBrandedPrompt,
    computeLayeredMetrics,
    calculateSoV,
  },
};