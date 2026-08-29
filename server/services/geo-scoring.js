// ACMS GEO 评分服务（v0.1 — Phase 1 Week 3）
// 用途：cite-ability score + 多维度 GEO 评分
// 路径：server/services/geo-scoring.js
//
// 核心算法：基于 Princeton KDD 2024 论文 "GEO: Generative Engine Optimization" 的简化版本
//   综合分 = mention_rate × 0.4 + position_score × 0.2 + context_score × 0.2 + engine_consistency × 0.2
//
// 评分维度（5 个）：
//   1. mention_rate      - 提及率（被引用的 query 占总 query 的比例）
//   2. position_score    - 位置分（被引用时在 AI 答案中的位置，越靠前越高）
//   3. context_score     - 上下文分（被引用时的描述长度/质量）
//   4. engine_consistency - 引擎一致性（多引擎是否一致提及该品牌）
//   5. freshness         - 时效性（最近 30 天 vs 历史）
//
// 输出：0-100 分 + 各维度明细 + sample_size + engines_used

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

// 2. 位置分（0-1，越靠前越高）
function calculatePositionScore(brand, responses) {
  const positions = responses
    .filter(r => isMentioned(brand, getResponseText(r)))
    .map(r => getBrandPosition(brand, getResponseText(r)));
  if (positions.length === 0) return 0;
  const avgPosition = positions.reduce((a, b) => a + b, 0) / positions.length;
  // 位置分 = 1 - avgPositionNormalized（位置 0 = 1.0，位置 1 = 0.0）
  return Math.max(0, Math.min(1, 1 - avgPosition));
}

// 3. 上下文分（被引用时的描述长度，200 字 = 满分）
function calculateContextScore(brand, responses) {
  const contexts = responses
    .filter(r => isMentioned(brand, getResponseText(r)))
    .map(r => extractBrandContext(brand, getResponseText(r)).length);
  if (contexts.length === 0) return 0;
  const avgLength = contexts.reduce((a, b) => a + b, 0) / contexts.length;
  return Math.min(avgLength / 200, 1);
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
  if (engines.length === 1) return 1.0; // 只有 1 个引擎 → 完全一致（无法比较）

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

// === 综合分 ===

function calculateCiteAbilityScore(brand, options = {}) {
  const brandId = typeof brand === 'string' ? brand : brand.id;
  const brandName = typeof brand === 'string' ? brand : (brand.name || brand.domain || brandId);
  const lookbackDays = options.lookbackDays || 30;

  // 从 store 拉响应数据
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const allResponses = GEO_STORE.listResponses({ brand_id: brandId })
    .filter(r => !r.error && r.ts >= cutoff);

  if (allResponses.length === 0) {
    return {
      ok: false,
      error: 'NO_DATA',
      message: `没有 ${brandName} 的最近 ${lookbackDays} 天响应数据。请先跑 GEO 跟踪（tracker agent）生成数据。`,
      brand_id: brandId,
      brand_name: brandName,
    };
  }

  const mentionRate = calculateMentionRate(brandName, allResponses);
  const positionScore = calculatePositionScore(brandName, allResponses);
  const contextScore = calculateContextScore(brandName, allResponses);
  const consistency = calculateEngineConsistency(brandName, allResponses);
  const freshness = calculateFreshness(allResponses, lookbackDays);

  // 综合分（按权重）
  const totalScore = (
    mentionRate * 0.4 +
    positionScore * 0.2 +
    contextScore * 0.2 +
    consistency * 0.2
  ) * 100;

  // 引擎使用情况
  const enginesUsed = [...new Set(allResponses.map(r => r.engine).filter(Boolean))];

  return {
    ok: true,
    brand_id: brandId,
    brand_name: brandName,
    score: Math.round(totalScore * 100) / 100,
    grade: getGrade(totalScore),
    components: {
      mention_rate: Math.round(mentionRate * 1000) / 1000,
      position_score: Math.round(positionScore * 1000) / 1000,
      context_score: Math.round(contextScore * 1000) / 1000,
      engine_consistency: Math.round(consistency * 1000) / 1000,
      freshness: Math.round(freshness * 1000) / 1000,
    },
    weights: {
      mention_rate: 0.4,
      position_score: 0.2,
      context_score: 0.2,
      engine_consistency: 0.2,
    },
    sample_size: allResponses.length,
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
  for (const [dim, val] of Object.entries(score.components)) {
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
    extractBrandContext,
    calculateMentionRate,
    calculatePositionScore,
    calculateContextScore,
    calculateEngineConsistency,
    calculateFreshness,
  },
};