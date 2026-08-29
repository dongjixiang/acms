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

function generateWeeklyReport(brandId, options = {}) {
  const { week = null, includeRawStats = true } = options;
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return `# 错误\n\n品牌 ${brandId} 不存在`;

  const score = SCORING.calculateCiteAbilityScore(brand);
  if (!score.ok) return `# GEO 报告 — ${brand.name}\n\n错误: ${score.message}`;

  const weekStr = week || currentWeek();
  const md = [];

  // Header
  md.push(`# GEO 周报 — ${brand.name}`);
  md.push(`**报告期**: ${weekStr}  `);
  md.push(`**域名**: ${brand.domain}  `);
  md.push(`**生成时间**: ${new Date().toISOString()}  `);
  md.push('');

  // 综合分
  md.push(`## 综合分：${score.score} / 100（${score.grade}）`);
  md.push('');
  md.push('| 维度 | 分数 | 权重 |');
  md.push('|------|------|------|');
  for (const [dim, val] of Object.entries(score.components)) {
    const w = score.weights[dim];
    const wStr = w != null ? `${(w * 100).toFixed(0)}%` : '—（参考指标）';
    md.push(`| ${labelOf(dim)} | ${(val * 100).toFixed(0)}% | ${wStr} |`);
  }
  md.push('');

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
    mention_rate: '提及率',
    position_score: '位置分',
    context_score: '上下文分',
    engine_consistency: '引擎一致性',
    freshness: '时效性',
  };
  return labels[dim] || dim;
}

module.exports = {
  generateWeeklyReport,
  generateComparisonReport,
  currentWeek,
};