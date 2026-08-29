// ACMS GEO Reporter Agent（v0.1 — Phase 1 Week 4）
// 用途：从 GEO 数据生成 Markdown 周报/月报
// 路径：server/services/geo-reporter-agent.js
//
// 输出：标准 Markdown 格式报告
//   - 头部：报告期 + brand info + 综合分
//   - 核心指标：cite-ability score + grade + 各维度
//   - 引擎拆解：每个引擎的 mention rate + 趋势
//   - 关键发现：content gaps + recommendations
//   - 附录：原始数据统计
//
// 调用：
//   - generateWeeklyReport(brandId) → Markdown 字符串
//   - generateComparisonReport(brandIds[]) → 多品牌对比 Markdown

const GEO_STORE = require('./geo-store');
const SCORING = require('./geo-scoring');
const PROMPT_REPORT = require('./geo-prompt-report'); // v0.26: 代表 prompt 算法（借鉴 elmo）

function generateWeeklyReport(brandId, options = {}) {
  const { week = null, includeRawStats = true } = options;
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return `# 错误\n\n品牌 ${brandId} 不存在`;

  const score = SCORING.calculateCiteAbilityScore(brand);
  if (!score.ok) return `# GEO 报告 — ${brand.name}\n\n错误: ${score.message}`;

  // v0.26: 拉 watch 竞品（用作 selectRepresentativePrompts 的 competitors）
  let watchCompetitors = [];
  try {
    const watches = GEO_STORE.listWatches ? GEO_STORE.listWatches() : [];
    const myWatches = watches.filter(w => w.focus_brand_id === brandId);
    const allBrands = GEO_STORE.listBrands();
    for (const w of myWatches) {
      for (const cid of (w.competitor_ids || [])) {
        const b = allBrands.find(x => x.id === cid);
        if (b && b.name) watchCompetitors.push({ name: b.name, domain: b.domain || '' });
      }
    }
  } catch (_) { /* 拉取失败不阻塞周报主体 */ }

  const weekStr = week || currentWeek();
  const md = [];

  // Header
  md.push(`# GEO 周报 — ${brand.name}`);
  md.push(`**报告期**: ${weekStr}  `);
  md.push(`**域名**: ${brand.domain}  `);
  md.push(`**生成时间**: ${new Date().toISOString()}  `);
  md.push('');

  // 综合分（v0.26 C3: 新指标）
  md.push(`## 综合分：${score.score} / 100（${score.grade}）`);
  md.push('');
  md.push('| 维度 | 分数 | 权重 |');
  md.push('|------|------|------|');
  for (const [dim, val] of Object.entries(score.components)) {
    const w = score.weights[dim];
    const wStr = w != null ? `${(w * 100).toFixed(0)}%` : '—（参考指标）';
    const valStr = val == null ? '—' : `${(val * 100).toFixed(0)}%`;
    md.push(`| ${labelOf(dim)} | ${valStr} | ${wStr} |`);
  }
  md.push('');
  // v0.26 C3: 指标口径说明
  md.push(`> **指标口径（v0.26 重定义）**：综合分基于**自然发现**（非品牌词查询）计算 — 用户搜行业词时品牌被 AI 主动提及的可见性。自然提及率 50% + 自然SoV 20% + 位置 15% + 上下文 15%。品牌词查询单独看（品牌搜索提及率 ${score.components.branded_mention_rate == null ? '—' : (score.components.branded_mention_rate * 100).toFixed(0) + '%'}，占比 ${score.components.branded_ratio == null ? '—' : (score.components.branded_ratio * 100).toFixed(0) + '%'}）。`);
  md.push('');

  // v0.23: 行业地位（排名/指数/分位）
  try {
    const ranking = require('./geo-ranking');
    const rk = ranking.computeIndustryRanking(brandId, { lookbackDays: 30 });
    if (rk.ok) {
      md.push(`## 🏆 行业地位`);
      md.push('');
      md.push(`- **行业排名**: 第 ${rk.rank} / ${rk.total} 名（基准池：${rk.industry}）`);
      md.push(`- **行业指数**: ${rk.index ?? '—'}（行业中位数 = ${rk.median_score ?? '—'}，指数 >100 领先行业典型水平）`);
      md.push(`- **分位**: P${rk.percentile ?? '—'}（超过 ${rk.percentile ?? 0}% 同行）`);
      if (rk.delta_vs_median != null) md.push(`- **vs 行业平均**: ${rk.delta_vs_median >= 0 ? '+' : ''}${rk.delta_vs_median} 分`);
      if (rk.sov != null) md.push(`- **SoV 提及份额**: ${rk.sov}%（第 ${rk.sov_rank} 名）`);
      md.push('');
      md.push('| 排名 | 品牌 | 分数 | 等级 |');
      md.push('|------|------|------|------|');
      rk.pool.slice(0, 8).forEach((p, i) => {
        const focus = p.brand_id === brandId ? ' ⭐' : '';
        md.push(`| ${i + 1} | ${p.name}${focus} | ${p.score ?? '—'} | ${p.grade || '—'} |`);
      });
      md.push('');
    }
  } catch (e) { /* 行业排名失败不影响周报主体 */ }

  // 引擎拆解
  md.push(`## 引擎拆解（${score.engines_used.length} 个引擎）`);
  md.push('');
  md.push('| 引擎 | 响应数 | 提及数 | 提及率 |');
  md.push('|------|--------|--------|--------|');
  for (const eng of score.engines_used) {
    const rs = GEO_STORE.listResponses({ brand_id: brandId, engine: eng });
    const mentioned = rs.filter(r => SCORING._internal.isMentioned(brand.name, r.raw_answer || r.text || '')).length;
    const rate = rs.length > 0 ? (mentioned / rs.length * 100).toFixed(0) : 0;
    md.push(`| ${eng} | ${rs.length} | ${mentioned} | ${rate}% |`);
  }
  md.push('');

  // v0.26: 代表 prompt 表现（借鉴 elmo selectRepresentativePrompts）— 引擎拆解后、关键发现前
  md.push(PROMPT_REPORT.generateRepresentativePromptsSection(brandId, { competitors: watchCompetitors }));

  // v0.26: 内容缺口（借鉴 elmo findContentGaps）— 数据驱动的优化建议，紧跟代表 prompt
  md.push(PROMPT_REPORT.generateContentGapsSection(brandId, { competitors: watchCompetitors }));

  // 关键发现
  const insights = generateInsights(brand, score);
  if (insights.length > 0) {
    md.push(`## 关键发现`);
    md.push('');
    for (const i of insights) {
      md.push(`- **${i.priority}** [${i.type}] ${i.title}`);
      md.push(`  ${i.detail}`);
      md.push('');
    }
  }

  // 附录：原始统计
  if (includeRawStats) {
    md.push(`## 附录：原始统计`);
    md.push('');
    md.push(`- 数据样本: ${score.sample_size} 条响应`);
    md.push(`- 覆盖引擎: ${score.engines_used.join(', ')}`);
    md.push(`- 查 询 库: ${GEO_STORE.listQueries(brandId).length} 条`);
    md.push(`- 评分快照: ${score.computed_at}`);
    md.push('');
  }

  md.push('---');
  md.push('*本报告由 ACMS GEO 应用自动生成。*');

  return md.join('\n');
}

function generateComparisonReport(brandIds, options = {}) {
  const compare = SCORING.compareBrands(brandIds, options);
  if (!compare.ok || !compare.brands || compare.brands.length === 0) {
    return '# 错误\n\n没有可对比的品牌数据';
  }

  const md = [];
  md.push('# GEO 多品牌对比报告');
  md.push(`**生成时间**: ${new Date().toISOString()}`);
  md.push('');
  md.push(`**品牌数**: ${compare.total}  `);
  md.push(`**领先者**: 🏆 ${compare.leader}`);
  md.push('');
  md.push('| 排名 | 品牌 | 综合分 | 等级 | mention_rate | position_score | engine_consistency |');
  md.push('|------|------|--------|------|--------------|----------------|--------------------|');
  compare.brands.forEach((b, idx) => {
    if (!b.ok || b.score === undefined) {
      md.push(`| ${idx + 1} | ${b.brand_name} | ❌ ${b.error || 'NO_DATA'} | - | - | - | - |`);
      return;
    }
    md.push(`| ${idx + 1} | ${b.brand_name} | ${b.score} | ${b.grade} | ${(b.components.mention_rate * 100).toFixed(0)}% | ${(b.components.position_score * 100).toFixed(0)}% | ${(b.components.engine_consistency * 100).toFixed(0)}% |`);
  });
  md.push('');
  md.push('---');
  md.push('*本报告由 ACMS GEO 应用自动生成。*');
  return md.join('\n');
}

function generateInsights(brand, score) {
  const recs = [];
  if (score.components.mention_rate < 0.5) {
    recs.push({
      priority: '🔴 HIGH',
      type: 'LOW_MENTION_RATE',
      title: '提及率偏低',
      detail: `当前 mention_rate ${(score.components.mention_rate * 100).toFixed(0)}%。建议:1) 增加高质量 FAQ;2) 行业内容投放;3) llms.txt 优化。`,
    });
  }
  if (score.components.engine_consistency < 0.6) {
    recs.push({
      priority: '🟡 MEDIUM',
      type: 'ENGINE_INCONSISTENCY',
      title: '引擎一致性差',
      detail: `一致性仅 ${(score.components.engine_consistency * 100).toFixed(0)}%。建议分析低提及引擎的内容偏好，针对性补充。`,
    });
  }
  if (score.score >= 80) {
    recs.push({
      priority: '🟢 GOOD',
      type: 'EXCELLENT',
      title: 'GEO 表现优秀',
      detail: `综合分 ${score.score}（${score.grade}）。继续保持内容更新频率和结构化数据。`,
    });
  } else if (score.score < 40) {
    recs.push({
      priority: '🔴 URGENT',
      type: 'CRITICAL',
      title: '需要立即优化',
      detail: `综合分仅 ${score.score}。建议优先:1) 创建/更新 llms.txt;2) 添加 Schema.org;3) 重写核心内容加入 FAQ。`,
    });
  }
  return recs;
}

function currentWeek() {
  const now = new Date();
  const start = new Date(now.getUTCFullYear(), 0, 1);
  const days = Math.floor((now - start) / 86400000);
  const weekNum = Math.ceil((days + start.getDay() + 1) / 7);
  return `${now.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function labelOf(dim) {
  const labels = {
    mention_rate: '自然提及率',
    position_score: '位置分',
    context_score: '上下文分',
    engine_consistency: '引擎一致性',
    freshness: '时效性',
    sov_natural: '自然SoV',
    branded_mention_rate: '品牌搜索提及率',
    branded_ratio: '品牌词占比',
  };
  return labels[dim] || dim;
}

module.exports = {
  generateWeeklyReport,
  generateComparisonReport,
  currentWeek,
};