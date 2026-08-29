// ACMS GEO 行业排名/指数（v0.23）
// 用途：计算品牌在「行业基准池」内的排名 + 相对指数（行业=100）
// 路径：server/services/geo-ranking.js
//
// 设计（多多拍板 B+A）：
//   - 基准池 = 同 industry 品牌（status active）∪ 该品牌 Watch 竞品
//   - 排名 = 按 cite-ability 综合分降序的位次
//   - 基准分 = 池内综合分中位数（抗离群）
//   - 指数 = 品牌分 ÷ 基准分 × 100（100=行业平均，>100 领先）
//   - 分位 = 超过池内百分之多少的品牌（P75 = 比 75% 同行强）
//   - SoV 份额 = 池内提及率归一化份额（曝光率语义）

const GEO_STORE = require('./geo-store');
const SCORING = require('./geo-scoring');

function median(values) {
  const arr = values.filter(v => v != null).sort((a, b) => a - b);
  if (!arr.length) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

/**
 * 计算品牌行业地位
 * @param {string} brandId - 焦点品牌
 * @param {object} options - { lookbackDays }
 */
function computeIndustryRanking(brandId, options = {}) {
  const lookbackDays = options.lookbackDays || 30;
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return { ok: false, error: 'BRAND_NOT_FOUND', message: `品牌 ${brandId} 不存在` };

  // 1. 基准池：同行业品牌 + Watch 竞品
  const allBrands = GEO_STORE.listBrands().filter(b => b.status === 'active');
  const watch = GEO_STORE.listWatches().find(w => w.focus_brand_id === brandId);
  const watchCompetitorIds = watch ? (watch.competitor_ids || []) : [];
  const industry = brand.industry || '';

  const poolIds = new Set();
  if (industry) {
    allBrands.filter(b => b.industry === industry && b.id !== brandId).forEach(b => poolIds.add(b.id));
  }
  watchCompetitorIds.forEach(id => {
    const b = GEO_STORE.getBrand(id);
    if (b && b.status === 'active') poolIds.add(id);
  });
  // 兜底：池为空且没有行业 → 用全部品牌（至少能出排名）
  if (poolIds.size === 0 && allBrands.length > 1) {
    allBrands.filter(b => b.id !== brandId).forEach(b => poolIds.add(b.id));
  }

  // 2. 分数
  const pool = [];
  for (const id of [brandId, ...poolIds]) {
    const b = GEO_STORE.getBrand(id);
    if (!b) continue;
    const score = SCORING.calculateCiteAbilityScore(b, { lookbackDays });
    const sovRate = score.ok && score.components ? score.components.mention_rate : null;
    pool.push({
      brand_id: id,
      name: b.name,
      domain: b.domain,
      industry: b.industry || '',
      ok: score.ok,
      score: score.ok ? score.score : null,
      grade: score.ok ? score.grade : '',
      mention_rate: sovRate,
    });
  }
  const scored = pool.filter(p => p.score != null);
  if (scored.length === 0) {
    return { ok: false, error: 'NO_DATA', message: '基准池内没有任何品牌有评分数据（先跑跟踪）', brand_id: brandId };
  }

  // 3. 排名
  scored.sort((a, b) => b.score - a.score);
  const focus = scored.find(p => p.brand_id === brandId) || null;
  const rank = focus ? scored.indexOf(focus) + 1 : null;

  // 4. 基准分（中位数，含焦点品牌在内——指数衡量相对池内典型水平）
  const medianScore = median(scored.map(p => p.score));
  const index = focus && focus.score != null && medianScore ? Math.round((focus.score / medianScore) * 1000) / 10 : null;
  const deltaVsMedian = focus && focus.score != null && medianScore != null ? Math.round((focus.score - medianScore) * 100) / 100 : null;

  // 5. 分位
  const percentile = focus && scored.length > 1 ? Math.round((scored.filter(p => p.score < focus.score).length / (scored.length - 1)) * 100) : null;

  // 6. SoV 份额（提及率归一化）
  const withRate = scored.filter(p => p.mention_rate != null);
  let sov = null;
  let sovRank = null;
  if (withRate.length) {
    const totalRate = withRate.reduce((s, p) => s + p.mention_rate, 0);
    if (totalRate > 0) {
      const sovList = withRate.map(p => ({ ...p, sov: (p.mention_rate / totalRate) * 100 })).sort((a, b) => b.sov - a.sov);
      sov = sovList.find(p => p.brand_id === brandId)?.sov || 0;
      sovRank = sovList.findIndex(p => p.brand_id === brandId) + 1;
    }
  }

  return {
    ok: true,
    brand_id: brandId,
    brand_name: brand.name,
    industry: industry || '未设置行业（当前使用基准池：' + (watchCompetitorIds.length ? `Watch 竞品 ${watchCompetitorIds.length} 个` : '全部品牌') + '）',
    rank,
    total: scored.length,
    median_score: medianScore,
    score: focus ? focus.score : null,
    grade: focus ? focus.grade : '',
    index,
    delta_vs_median: deltaVsMedian,
    percentile,
    sov: sov != null ? Math.round(sov * 10) / 10 : null,
    sov_rank: sovRank,
    pool: scored.map(p => ({ brand_id: p.brand_id, name: p.name, score: p.score, grade: p.grade, industry: p.industry })),
    note: '指数 = 品牌综合分 ÷ 行业中位数 × 100（100 = 行业典型水平，>100 领先）',
  };
}

module.exports = { computeIndustryRanking, median };
