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
const { getMatchTerms, normalizeAliases } = require('./geo-match');

// === 评分维度工具函数 ===

// 提取响应里的文本（兼容 r.text 和 r.raw_answer 两种字段）
function getResponseText(r) {
  return r.text || r.raw_answer || '';
}

// === 别名匹配（v0.30 — 治「一个品牌多个名字漏匹配」）===
// 工具函数在 ./geo-match.js：ALIAS_STOPWORDS / normalizeAliases / getMatchTerms

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
// v0.30 fix: 原算法 brandMentions 恒为 0/1，导致 SoV 严重失真（1/8=0.125 vs 真实 41/44=0.93）
// 改为：按回答条数统计（每个 response 独立计数，不聚合）
function calculateSoV(brand, responses, competitorNames) {
  if (!responses || responses.length === 0) return null;
  let brandHitCount = 0;
  let totalWithEither = 0;
  for (const r of responses) {
    const text = getResponseText(r).toLowerCase();
    const hasBrand = isMentioned(brand, text);
    const hasComp = competitorNames && competitorNames.some(c => c && text.includes(c.toLowerCase()));
    if (hasBrand || hasComp) {
      totalWithEither += 1;
      if (hasBrand) brandHitCount += 1;
    }
  }
  if (totalWithEither === 0) return null;
  return brandHitCount / totalWithEither;
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
// v0.30: 遍历别名（"中展" 也能让 prompt "中展怎么样" 判定为 branded）
function isBrandedPrompt(promptText, brand) {
  const terms = getMatchTerms(brand).map(t => t.toLowerCase()).filter(Boolean);
  if (terms.length === 0) return false;
  const lower = String(promptText || '').toLowerCase();
  return terms.some(t => lower.includes(t));
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
    const branded = isBrandedPrompt(q.prompt, brand);
    const mentioned = runs.filter(r => isMentioned(brand, getResponseText(r))).length;
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
    return q && !isBrandedPrompt(q.prompt, brand);
  });
  // branded 聚合
  const brandedRuns = allResponses.filter(r => {
    const q = allQueries.find(x => x.id === r.query_id);
    return q && isBrandedPrompt(q.prompt, brand);
  });

  // natural 指标（核心）
  // v0.30 fix: 传完整 brand 对象（含 aliases），不能用 brandName 字符串 — 否则 getMatchTerms 只返回 [name]，跳过分词匹配
  const naturalMentionRate = naturalRuns.length > 0
    ? naturalRuns.filter(r => isMentioned(brand, getResponseText(r))).length / naturalRuns.length
    : null;
  const naturalPosition = naturalRuns.length > 0 ? calculatePositionScore(brand, naturalRuns) : null;
  const naturalContext = naturalRuns.length > 0 ? calculateContextScore(brand, naturalRuns) : null;
  const naturalConsistency = naturalRuns.length > 0 ? calculateEngineConsistency(brand, naturalRuns) : null;
  const naturalFreshness = naturalRuns.length > 0 ? calculateFreshness(naturalRuns) : null;

  // natural SoV：竞品名单 = 所有其他 brands（从 store 拉）
  // v0.30: 竞品名也要展开别名（"振威" 命中算竞品；品牌自己的别名要排除，防自指）
  let competitorTerms = [];
  try {
    const allBrands = GEO_STORE.listBrands();
    const selfMatchTerms = new Set(getMatchTerms(brand).map(t => t.toLowerCase()));
    competitorTerms = allBrands
      .filter(b => b.id !== (typeof brand === 'string' ? brand : brand.id))
      .flatMap(b => getMatchTerms(b).map(t => t.toLowerCase()))
      // 过滤掉"其实是品牌自身别名"的竞品名（防自指 + 防重复计数）
      .filter(t => t && !selfMatchTerms.has(t));
  } catch (_) { /* 拉取失败 → SoV 只算品牌自身 */ }
  const naturalSoV = naturalRuns.length > 0 ? calculateSoV(brand, naturalRuns, competitorTerms) : null;

  // branded 指标（次要）
  const brandedMentionRate = brandedRuns.length > 0
    ? brandedRuns.filter(r => isMentioned(brand, getResponseText(r))).length / brandedRuns.length
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
    const mentionRate = calculateMentionRate(brand, allResponses);
    const positionScore = calculatePositionScore(brand, allResponses);
    const contextScore = calculateContextScore(brand, allResponses);
    const consistency = calculateEngineConsistency(brand, allResponses);
    const freshness = calculateFreshness(allResponses, lookbackDays);
    totalScore = (
      mentionRate * 0.5 +
      (calculateSoV(brand, allResponses, []) ?? 0) * 0.2 +
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

// v0.30: 遍历 brand.name + aliases 任一命中即算 mention
function isMentioned(brand, text) {
  if (!text) return false;
  const terms = getMatchTerms(brand);
  if (terms.length === 0) return false;
  const lower = text.toLowerCase();
  return terms.some(t => t && lower.includes(t.toLowerCase()));
}

// 获取品牌在文本中的位置（0-1, 0 = 最开始）— 遍历别名取最早命中位置
function getBrandPosition(brand, text) {
  const lower = text.toLowerCase();
  const terms = getMatchTerms(brand).map(t => t.toLowerCase()).filter(Boolean);
  if (terms.length === 0) return 1;
  let earliest = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx >= 0 && (earliest < 0 || idx < earliest)) earliest = idx;
  }
  if (earliest < 0) return 1; // 找不到 → 末尾
  return earliest / text.length;
}

// v0.26 C3: 相对位置分 — 品牌第一次出现的词序号倒数（回答长短不偏）
// v0.30: 遍历别名取最早命中位置（让"中展"命中也能拿到合理分）
// 词序号 0（第一个词）= 1.0；第 5 个词 = 0.2；第 10 个词 = 0.1
function getBrandRelativePosition(brand, text) {
  const lower = text.toLowerCase();
  const terms = getMatchTerms(brand).map(t => t.toLowerCase()).filter(Boolean);
  if (terms.length === 0) return 0;
  let earliest = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx >= 0 && (earliest < 0 || idx < earliest)) earliest = idx;
  }
  if (earliest < 0) return 0;
  // v0.30 fix: 用字符位置比例代替词计数 — 英文按空格分词，中文按字符比例
  // 原因：split(/\s+/) 对纯中文会把整段算成1词（position 虚高）；按字符数又对英文过长（position 虚低）
  // 统一方案：品牌在回答文本中的相对位置 = earliest / text.length（0=开头, 1=末尾）
  // 再映射到 score：1 - relativePosition（开头=1.0，末尾=0.0）
  const before = text.slice(0, earliest);
  const wordCount = text.length > 0 ? earliest / text.length : 0;
  return 1 - wordCount;
}

// 提取品牌上下文（前后各 50 字）— 遍历别名取最早命中位置
function extractBrandContext(brand, text) {
  const lower = text.toLowerCase();
  const terms = getMatchTerms(brand);
  if (terms.length === 0) return '';
  let earliest = -1;
  let matchLen = 0;
  for (const term of terms) {
    const termLower = term.toLowerCase();
    const idx = lower.indexOf(termLower);
    if (idx >= 0 && (earliest < 0 || idx < earliest)) {
      earliest = idx;
      matchLen = termLower.length;
    }
  }
  if (earliest < 0) return '';
  const start = Math.max(0, earliest - 50);
  const end = Math.min(text.length, earliest + matchLen + 50);
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
  // v0.30: 别名匹配工具（外部也用得到 — 比如 audit agent / 高亮匹配）
  getMatchTerms,
  normalizeAliases,
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
    getMatchTerms,
    normalizeAliases,
  },
};