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
// v0.38 新增（2026-09-06，借鉴 oneglanse competitors[] 字段）：
//   - calculateCompetitors() 统计每个竞品在回答中的出现次数 + 情感倾向
//   - 输出到 components.competitors[]，供前端展示"谁和你在同一篇回答里出现"
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
const GEO_ACCURACY = require('./geo-accuracy-judge'); // v0.36: 描述准确率判定（异步 LLM，缓存到 scores 表）
const GEO_PERCEPTION = require('./geo-perception-judge'); // v0.38: 品牌感知 + 风险信号（异步 LLM，缓存到 scores 表）

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

// v0.38: 竞品共现分析（借鉴 oneglanse BrandAnalysisResult.competitors[]）
// 统计每个竞品在回答中出现的次数 + 情感倾向
// 返回 [{name, domain, mentions, sentiment, rankPosition, isRecommended}]
function calculateCompetitors(brand, responses, allBrands) {
  if (!responses || responses.length === 0) return [];
  const selfTerms = new Set(getMatchTerms(brand).map(t => t.toLowerCase()));
  // 构建竞品映射：competitorId -> { name, domain, terms, mentions, sentimentScore }
  const compMap = {};
  for (const b of allBrands) {
    if (b.id === (typeof brand === 'string' ? brand : brand.id)) continue;
    const terms = getMatchTerms(b).map(t => t.toLowerCase()).filter(Boolean);
    if (terms.length === 0) continue;
    // 排除与自家品牌同名的竞品（防重复）
    const hasOverlap = terms.some(t => selfTerms.has(t));
    if (hasOverlap) continue;
    compMap[b.id] = {
      id: b.id,
      name: b.name || b.domain || b.id,
      domain: b.domain || null,
      terms,
      mentions: 0,
      sentimentScore: 0,
      hasRecommendedKeyword: false,
    };
  }
  if (Object.keys(compMap).length === 0) return [];

  // 遍历所有自然发现回答
  for (const r of responses) {
    const text = getResponseText(r).toLowerCase();
    if (!text) continue;
    for (const [compId, comp] of Object.entries(compMap)) {
      const isMentioned = comp.terms.some(t => t && text.includes(t));
      if (!isMentioned) continue;
      comp.mentions++;
      // 情感分析（复用 calculateContextScore 的 detectSentiment 逻辑）
      const t = text.slice(Math.max(0, text.indexOf(comp.terms[0]) - 100),
                          Math.min(text.length, text.indexOf(comp.terms[0]) + 200));
      const sent = detectSentiment(t);
      comp.sentimentScore += sent;
      // 推荐词检测
      const recKeywords = ['推荐', '首选', 'best', 'recommended', 'top', '领先', '优秀'];
      if (recKeywords.some(kw => t.includes(kw))) comp.hasRecommendedKeyword = true;
    }
  }

  // 转为数组，计算归一化指标
  return Object.values(compMap)
    .filter(c => c.mentions > 0)
    .map(c => ({
      name: c.name,
      domain: c.domain,
      mentions: c.mentions,
      // visibility: 提及率（相对于总回答数）
      visibility: Math.round((c.mentions / responses.length) * 1000) / 1000,
      // sentiment: 平均情感分（-1 到 1 → 0 到 100）
      sentiment: Math.round(((c.sentimentScore / c.mentions) + 1) * 50),
      // isRecommended: 是否曾被推荐
      isRecommended: c.hasRecommendedKeyword,
      // rankPosition: 简化版（首次出现位置，当前只有 mentions 计数）
      rankPosition: null,
    }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 5); // 最多返回前 5 个竞品
}

// 4. 引擎一致性
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

// === v0.34 新指标：首位推荐率 / AI 引用占比 / 行业分位 ===

// 商业意图关键词（中英文 + 大小写不敏感）
const COMMERCIAL_INTENT_KEYWORDS = [
  '哪家', '推荐', '对比', '排行', 'top', '哪个', '选', 'best', 'recommend',
  'vs', 'alternative', 'alternatives', 'review', 'first', '选哪家'
];

// 列表首位标记（识别"排名/Top N/编号列表"型回答）
const LIST_MARKERS = [
  /第一名/, /\btop\s*1\b/i, /^1[\.\):：]/m, /^\(?1[\.\)]/m, /①/, /首推/
];

// 判断 query 是否为商业意图（双轨：systemTags 已标 + 关键词兜底）
// v0.34: 复用 v0.31 inferIntentAndTags 已写入的 intent:comparative 标签；
// 旧 query 未标时用关键词兜底，避免新指标首跑数据为空
function isCommercialIntent(brand, query) {
  if (!query) return false;
  const tags = (query.systemTags || query.tags || []);
  if (tags.some(t => typeof t === 'string' && t.startsWith('intent:comparative'))) return true;
  const lower = String(query.prompt || '').toLowerCase();
  return COMMERCIAL_INTENT_KEYWORDS.some(k => lower.includes(k.toLowerCase()));
}

// 首位判定两路径
// 路径 1: 列表结构识别（前 200 字含 Top1/第一名/① 等 + 品牌出现在前 100 字符）
// 路径 2: 兜底——回答前半段（前 50%）出现品牌
// 关键：必须传完整 brand 对象（v0.30 坑 #36：字符串退化会让 getMatchTerms 只返回 [name]，跳过 aliases）
function judgeTop1(brand, text) {
  if (!text) return false;
  const terms = getMatchTerms(brand).map(t => t.toLowerCase()).filter(Boolean);
  if (terms.length === 0) return false;
  const lower = text.toLowerCase();
  // 找品牌最早出现位置
  let earliest = -1;
  for (const t of terms) {
    const idx = lower.indexOf(t);
    if (idx >= 0 && (earliest < 0 || idx < best(earliest, idx))) earliest = idx;
  }
  if (earliest < 0) return false;
  const head = text.slice(0, 200);
  const hasListStructure = LIST_MARKERS.some(re => re.test(head));
  if (hasListStructure) return earliest < 100;
  return earliest / text.length < 0.5;
}
// Math.min 别名
function best(a, b) { return Math.min(a, b); }

// 1. 首位推荐率（商业意图子集 + 首位判定）
// 返回 { ok, rate, sampleSize, commercialQueryCount, byEngine }
// 样本 < 20 商业意图 query 时标 INSUFFICIENT_SAMPLES（UI 应灰显）
function calculateTop1Rate(brand, responses, queries) {
  if (!responses || !queries) return { ok: false, reason: 'NO_DATA' };
  const commQueries = queries.filter(q => isCommercialIntent(brand, q));
  if (commQueries.length < 20) {
    return { ok: false, reason: 'INSUFFICIENT_SAMPLES', sampleSize: commQueries.length, threshold: 20 };
  }
  const cQueryIds = new Set(commQueries.map(q => q.id));
  const cResponses = responses.filter(r => r.query_id && cQueryIds.has(r.query_id) && !r.error);
  if (cResponses.length === 0) return { ok: false, reason: 'NO_DATA' };
  let top1Count = 0;
  const byEngine = {};
  for (const r of cResponses) {
    const text = getResponseText(r);
    if (!text) continue;
    const isTop1 = judgeTop1(brand, text);
    if (isTop1) top1Count += 1;
    const eng = r.engine || 'unknown';
    if (!byEngine[eng]) byEngine[eng] = { total: 0, top1: 0 };
    byEngine[eng].total += 1;
    if (isTop1) byEngine[eng].top1 += 1;
  }
  const rate = top1Count / cResponses.length;
  const byEngineRate = {};
  for (const [e, v] of Object.entries(byEngine)) {
    byEngineRate[e] = v.total > 0 ? Math.round((v.top1 / v.total) * 1000) / 1000 : null;
  }
  return {
    ok: true,
    rate: Math.round(rate * 1000) / 1000,
    sampleSize: cResponses.length,
    commercialQueryCount: commQueries.length,
    byEngine: byEngineRate,
  };
}

// 2. AI 引用占比（基于 geo_responses.citations 字段 + v0.33 citation-extractor 分类）
// 品牌相关判定：
//   - type='brand-site' → 直接算
//   - 其他 type → URL/title/domain 含 brand.aliases（复用 getMatchTerms 防自指 + 防竞品撞名）
function calculateCitationShare(brand, responses) {
  if (!responses || responses.length === 0) return { ok: false, reason: 'NO_DATA' };
  const selfTerms = new Set(getMatchTerms(brand).map(t => t.toLowerCase()));
  let totalCitations = 0, brandCitations = 0;
  const brandDomains = new Set();
  let responsesWithCitations = 0;
  // 有效 response 数（排除 error）作为 coverage 分母
  let validResponses = 0;
  for (const r of responses) {
    if (r.error) continue;
    validResponses += 1;
    const citations = Array.isArray(r.citations) ? r.citations : [];
    if (citations.length === 0) continue;
    responsesWithCitations += 1;
    for (const c of citations) {
      totalCitations += 1;
      const isBrandSite = c && (c.type === 'brand-site' || (brand.domain && c.domain === brand.domain));
      const matchText = ((c && c.url) || '') + ' ' + ((c && c.title) || '') + ' ' + ((c && c.domain) || '');
      const lower = matchText.toLowerCase();
      const matchesBrand = isBrandSite || [...selfTerms].some(t => t && lower.includes(t));
      if (matchesBrand) {
        brandCitations += 1;
        const dom = (c && c.domain) || (brand.domain || '');
        if (dom) brandDomains.add(dom);
      }
    }
  }
  if (totalCitations === 0) {
    return { ok: false, reason: 'NO_CITATIONS', coverage: validResponses > 0 ? 0 : 0 };
  }
  const share = brandCitations / totalCitations;
  return {
    ok: true,
    share: Math.round(share * 1000) / 1000,
    brandCitations,
    totalCitations,
    brandDomainCount: brandDomains.size,
    coverage: validResponses > 0 ? Math.round((responsesWithCitations / validResponses) * 1000) / 1000 : 0,
  };
}

// 3. 行业分位（基于 geo_brands.industry 字段 + 同行业品牌库）
// 行业样本 < 8 时返回 INSUFFICIENT_SAMPLES（避免少样本瞎报百分位）
function calculateIndustryPercentile(brand, metric = 'score', options = {}) {
  if (!brand || !brand.industry) return { ok: false, reason: 'NO_INDUSTRY' };
  const lookbackDays = options.lookbackDays || 30;
  const allBrands = GEO_STORE.listBrands().filter(b => b.industry === brand.industry && b.status !== 'deleted');
  if (allBrands.length < 8) {
    return { ok: false, reason: 'INSUFFICIENT_SAMPLES', sampleSize: allBrands.length, threshold: 8, industry: brand.industry };
}
  const items = [];
  for (const b of allBrands) {
    // v0.44: 传 _skipIndustryPercentile=true 打破无限递归
    // 原 bug: calculateCiteAbilityScore 内部又调 calculateIndustryPercentile → calculateCiteAbilityScore → ...
    // ranking 触发：computeIndustryRanking → calculateCiteAbilityScore（无 skip）→ calculateIndustryPercentile
    //             → calculateCiteAbilityScore（有 skip，下面 if 守卫阻断再调）→ 终止
    const s = calculateCiteAbilityScore(b, { lookbackDays, _skipIndustryPercentile: true });
    let v = null;
    if (s.ok) {
      if (metric === 'score') v = s.score;
      else if (s.components && metric in s.components) v = s.components[metric];
    }
    if (v != null) items.push({ brand: b, value: v });
  }
  if (items.length < 8) {
    return { ok: false, reason: 'INSUFFICIENT_VALID', sampleSize: items.length, threshold: 8, industry: brand.industry };
  }
  items.sort((a, b) => a.value - b.value);
  const myIdx = items.findIndex(it => it.brand.id === brand.id);
  if (myIdx < 0) return { ok: false, reason: 'SELF_NOT_FOUND' };
  const percentile = myIdx / (items.length - 1);
  const values = items.map(it => it.value);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    ok: true,
    industry: brand.industry,
    metric,
    sampleSize: items.length,
    percentile: Math.round(percentile * 1000) / 1000,
    rank: myIdx + 1,
    myValue: items[myIdx].value,
    median: values[Math.floor(values.length / 2)],
    mean: Math.round((sum / values.length) * 100) / 100,
    min: values[0],
    max: values[values.length - 1],
    top3: items.slice(-3).reverse().map(it => ({ id: it.brand.id, name: it.brand.name, value: it.value })),
  };
}

// === 综合分 ===

function calculateCiteAbilityScore(brand, options = {}) {
  const brandId = typeof brand === 'string' ? brand : brand.id;
  const brandName = typeof brand === 'string' ? brand : (brand.name || brand.domain || brandId);
  const lookbackDays = options.lookbackDays || 30;
  // v0.44: 递归守卫 — calculateIndustryPercentile 调本函数时传 true，避免再嵌套调 calculateIndustryPercentile
  // 修复 /api/geo/ranking 返回 500「Maximum call stack size exceeded」的根因
  const skipIndustryPercentile = options._skipIndustryPercentile === true;

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

// v0.37: 各引擎聚合（被引用 vs 未引用 + 比例）—— 平台覆盖度视图数据源
    const coverageDetail = {};
    for (const r of allResponses) {
      if (!r.engine) continue;
      if (!coverageDetail[r.engine]) coverageDetail[r.engine] = { total: 0, mentioned: 0 };
      coverageDetail[r.engine].total += 1;
      if (isMentioned(brand, getResponseText(r))) coverageDetail[r.engine].mentioned += 1;
    }
    const coverageList = Object.entries(coverageDetail).map(([e, s]) => ({
      engine: e,
      total: s.total,
      mentioned: s.mentioned,
      rate: s.total > 0 ? Math.round((s.mentioned / s.total) * 1000) / 1000 : 0,
    })).sort((a, b) => b.rate - a.rate);
    components.coverage_detail = coverageList;
    components.coverage_engine_count = coverageList.length;
    components.coverage_avg_rate = coverageList.length > 0
      ? Math.round((coverageList.reduce((sum, x) => sum + x.rate, 0) / coverageList.length) * 1000) / 1000
      : 0;

    // v0.36: 描述准确率（v0.34 算法 + LLM-as-judge 异步判定 + 缓存）
    // 同步路径只读缓存（避免让 calculateCiteAbilityScore 变 async）
    const accCached = GEO_ACCURACY.getCachedAccuracy(brandId);
    if (accCached && accCached.accuracy_rate != null) {
      components.accuracy_rate = accCached.accuracy_rate;
      components.accuracy_correct = accCached.correct;
      components.accuracy_misleading = accCached.misleading;
      components.accuracy_sample_size = accCached.sample_size;
      components.accuracy_computed_at = accCached.computed_at;
      components.accuracy_issues = (accCached.issues || []).slice(0, 3);
    }

    // v0.38: 品牌感知 + 风险信号（oneglanse perception[] + risks[] 借鉴）
    // 同步路径只读缓存（避免让 calculateCiteAbilityScore 变 async）
    try {
      const perceptionCached = GEO_PERCEPTION.getCachedPerceptionRisks(brandId);
      if (perceptionCached && perceptionCached.coreClaims != null) {
        components.perception_core_claims = perceptionCached.coreClaims;
        components.perception_differentiators = perceptionCached.differentiators;
        components.perception_best_known_for = perceptionCached.bestKnownFor;
        components.perception_pricing = perceptionCached.pricingPerception;
        components.perception_risks = perceptionCached.risks;
        components.perception_sample_size = perceptionCached.sample_size;
        components.perception_computed_at = perceptionCached.computed_at;
      }
    } catch (_) { /* 感知分析失败不影响主评分 */ }

    // v0.34: 三个新指标（首位推荐率 / AI 引用占比 / 行业分位）
    const top1 = calculateTop1Rate(brand, allResponses, allQueries);
    if (top1.ok) {
      components.top1_rate = top1.rate;
      components.top1_sample_size = top1.sampleSize;
      components.top1_by_engine = top1.byEngine;
    }
    const citation = calculateCitationShare(brand, allResponses);
    if (citation.ok) {
      components.citation_share = citation.share;
      components.citation_brand_count = citation.brandCitations;
      components.citation_total_count = citation.totalCitations;
      components.citation_brand_domains = citation.brandDomainCount;
      components.citation_coverage = citation.coverage;
}
    if (brand.industry && !skipIndustryPercentile) {
      const ind = calculateIndustryPercentile(brand, 'score');
      if (ind.ok) {
        components.industry_percentile = ind.percentile;
        components.industry_rank = ind.rank;
        components.industry_sample_size = ind.sampleSize;
        components.industry_median = ind.median;
        components.industry_mean = ind.mean;
      }
    }

    // v0.38: 竞品共现分析（借鉴 oneglanse competitors[]，2026-09-06）
    try {
      const allBrandsForComp = GEO_STORE.listBrands().filter(b => b.status !== 'deleted');
      const competitors = calculateCompetitors(brand, naturalRuns, allBrandsForComp);
      if (competitors.length > 0) {
        components.competitors = competitors;
        components.competitors_count = competitors.length;
      }
    } catch (_) { /* 拉取竞品列表失败不影响主评分 */ }
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
    // v0.34: 新指标（测试用 _internal 暴露）
    isCommercialIntent,
    judgeTop1,
    calculateTop1Rate,
    calculateCitationShare,
    calculateIndustryPercentile,
    // v0.38: 竞品共现分析
    calculateCompetitors,
    getMatchTerms,
    normalizeAliases,
  },
};