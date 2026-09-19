// ACMS GEO 月报服务（v0.1 — Phase 1 Week 6 补充）
// 用途：自动生成 GEO 月报（聚合当月所有周报 + 跨周趋势）
// 路径：server/services/geo-monthly-report.js
//
// 输出：
//   - Markdown 月报（含月度汇总 + 周对比 + 关键发现）
//   - 自动写文件到 data/geo/reports/monthly_<brand>_<YYYY-MM>.md
//   - 可选：调 PDF 生成器输出 PDF 版本
//
// v0.47+：月报复用 weekly 的 overview sections（引擎状态/品牌对比/趋势/金卡/Zero-Click/引擎拆解/
//   行业地位/代表prompt/引用源/触发问题/情感/行动归因/数据缺口/AI 优化建议），
//   在末尾追加月度独有内容（月度趋势 + 周对比 + 月内数据统计）。

const GEO_STORE = require('./geo-store');
const SCORING = require('./geo-scoring');
const REPORTER = require('./geo-reporter-agent');
const PROMPT_REPORT = require('./geo-prompt-report'); // v0.26: 代表 prompt 算法（借鉴 elmo）
const path = require('path');
const fs = require('fs').promises;

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'data', 'geo', 'reports');

function currentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function weeksInMonth(monthStr) {
  // 计算给定月份的所有 ISO 周
  const [year, month] = monthStr.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weeks = [];
  let weekNum = 1;
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(Date.UTC(year, month - 1, day));
    const startOfYear = new Date(Date.UTC(year, 0, 1));
    const dayOfYear = Math.ceil((d - startOfYear) / 86400000) + 1;
    const wn = Math.ceil((dayOfYear + startOfYear.getUTCDay()) / 7);
    const weekStr = `${year}-W${String(wn).padStart(2, '0')}`;
    if (!weeks.includes(weekStr)) weeks.push(weekStr);
  }
  return weeks;
}

function generateMonthlyReport(brandId, options = {}) {
  const { month = null, includeWeeklyComparison = true } = options;
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return `# 错误\n\n品牌 ${brandId} 不存在`;

  const targetMonth = month || currentMonth();
  const weeks = weeksInMonth(targetMonth);

  // 拉所有 snapshots 在目标月内
  const allSnapshots = GEO_STORE.listSnapshots(brandId)
    .filter(s => s.week && s.week.startsWith(targetMonth.substring(0, 4)));

  // 计算当月汇总
  const currentScore = SCORING.calculateCiteAbilityScore(brand);
  if (!currentScore.ok) return `# GEO 月报 — ${brand.name}\n\n错误: ${currentScore.message}`;

  const md = [];
  md.push(`# GEO 月报 — ${brand.name}（${targetMonth}）`);
  md.push(`**报告期**: ${targetMonth}（共 ${weeks.length} 周）  `);
  md.push(`**域名**: ${brand.domain}  `);
  md.push(`**行业**: ${brand.industry || '未设置'}  `);
  md.push(`**生成时间**: ${new Date().toISOString()}  `);
  md.push('');

  // 月报顶部 KPI（直接用当前分 = 月末综合分）
  md.push(`## 月末综合分：${currentScore.score}（${currentScore.grade}）`);
  md.push('');
  md.push('| 维度 | 月末分 | 条形 |');
  md.push('|------|--------|------|');
  for (const [dim, val] of Object.entries(currentScore.components)) {
    const valStr = val == null ? '—' : `${(val * 100).toFixed(0)}%`;
    md.push(`| ${labelOf(dim)} | ${valStr} | ${REPORTER.bar(val, 16)} |`);
  }
  md.push('');
  md.push(`> **指标口径（v0.26 重定义）**：综合分基于**自然发现**（非品牌词查询）计算 — 用户搜行业词时品牌被 AI 主动提及的可见性。自然提及率 50% + 自然SoV 20% + 位置 15% + 上下文 15%。`);
  md.push('');

  // 月度独有的"周对比"（v0.47+ 把这条放在 overview sections 之前，给月报一个独立的纵向视角）
  if (includeWeeklyComparison && allSnapshots.length > 0) {
    md.push(`## 周对比（${allSnapshots.length} 个快照）`);
    md.push('');
    md.push('| 周 | 综合分 | mention_rate | position_score | engine_consistency | 条形 |');
    md.push('|----|--------|--------------|----------------|--------------------|------|');
    const max = Math.max(...allSnapshots.map(s => s.summary_json?.score || 0), 1);
    allSnapshots.forEach(snap => {
      const summary = snap.summary_json || {};
      const c = summary.components || {};
      const sc = summary.score || 0;
      md.push(`| ${snap.week} | ${sc || '—'} | ${REPORTER.pct(c.mention_rate)} | ${REPORTER.pct(c.position_score)} | ${REPORTER.pct(c.engine_consistency)} | ${REPORTER.bar(sc / max, 14, { filled: '█', empty: '░', percent: false })} ${sc > 0 ? Math.round(sc / max * 100) + '%' : '—'} |`);
    });
    md.push('');
  }

  // v0.47+：复用 weekly 报告的全部 overview sections
  md.push('---');
  md.push('## 以下为当月综合快照（含与周报一致的完整 overview）');
  md.push('');
  // 直接复用 weekly 报告的全量 markdown（除头部重写 + 关键发现）
  // 简化策略：调用 generateWeeklyReport 但只取 section 内容（手动拼接）
  // 因为 weekly 报告有自己头部 + 序号，我们直接重写每月一份完整 markdown。
  // 这里直接复用 buildXxxSection：
  try { md.push(REPORTER.buildEngineStatusSection()); } catch (_) {}
  try { md.push(REPORTER.buildBrandComparisonSection(brandId)); } catch (_) {}
  try { md.push(REPORTER.buildTrendSection(brandId)); } catch (_) {}
  try { md.push(REPORTER.buildHighlightCardsSection(currentScore)); } catch (_) {}
  try { md.push(REPORTER.buildZeroClickNarrativeSection(currentScore)); } catch (_) {}

  // 引擎拆解（复用 reporter 内联逻辑的最简版）
  md.push(`## 引擎拆解（${currentScore.engines_used.length} 个引擎）`);
  md.push('');
  md.push('| 引擎 | 响应数 | 提及数 | 提及率 | 条形 |');
  md.push('|------|--------|--------|--------|------|');
  for (const eng of currentScore.engines_used) {
    const rs = GEO_STORE.listResponses({ brand_id: brandId, engine: eng });
    const mentioned = rs.filter(r => SCORING._internal.isMentioned(brand.name, r.raw_answer || r.text || '')).length;
    const rate = rs.length > 0 ? (mentioned / rs.length) : 0;
    md.push(`| ${eng} | ${rs.length} | ${mentioned} | ${(rate * 100).toFixed(0)}% | ${REPORTER.bar(rate, 14)} |`);
  }
  md.push('');

  try { md.push(REPORTER.buildIndustryRankingSection(brandId)); } catch (_) {}

  // v0.26: 代表 prompt 表现（借鉴 elmo selectRepresentativePrompts）
  let monthlyWatchCompetitors = [];
  try {
    const watches = GEO_STORE.listWatches ? GEO_STORE.listWatches() : [];
    const myWatches = watches.filter(w => w.focus_brand_id === brandId);
    const allBrands = GEO_STORE.listBrands();
    for (const w of myWatches) {
      for (const cid of (w.competitor_ids || [])) {
        const b = allBrands.find(x => x.id === cid);
        if (b && b.name) monthlyWatchCompetitors.push({ name: b.name, domain: b.domain || '' });
      }
    }
  } catch (_) { /* 拉取失败不阻塞 */ }
  md.push(PROMPT_REPORT.generateRepresentativePromptsSection(brandId, { competitors: monthlyWatchCompetitors }));

  try { md.push(REPORTER.buildCitationSourceSection(brandId)); } catch (_) {}
  try { md.push(REPORTER.buildQueryTriggerSection(brandId)); } catch (_) {}
  try { md.push(REPORTER.buildSentimentSection(brandId)); } catch (_) {}
  try { md.push(REPORTER.buildAttributionSection(brandId)); } catch (_) {}

  // v0.26: 内容缺口（借鉴 elmo findContentGaps）— 月报也展示
  md.push(PROMPT_REPORT.generateContentGapsSection(brandId, { competitors: monthlyWatchCompetitors }));

  // v0.47+: AI 优化建议（多多重点要求）
  try { md.push(REPORTER.buildOpportunitiesSection(brandId)); } catch (_) {}

  // 关键发现（基于当前分）
  md.push(`## 月度关键发现`);
  md.push('');
  const insights = generateMonthlyInsights(brand, currentScore, allSnapshots);
  insights.forEach(i => {
    md.push(`- **${i.priority}** [${i.type}] ${i.title}`);
    md.push(`  ${i.detail}`);
    md.push('');
  });

  // 数据统计
  const totalResponses = GEO_STORE.listResponses({ brand_id: brandId })
    .filter(r => r.ts && new Date(r.ts).toISOString().startsWith(targetMonth.substring(0, 7)))
    .length;
  md.push(`## 月度数据统计`);
  md.push('');
  md.push(`- 总响应数: ${totalResponses}`);
  md.push(`- 周快照数: ${allSnapshots.length}`);
  md.push(`- 查 询 库: ${GEO_STORE.listQueries(brandId).length} 条`);
  md.push(`- 已配置引擎: ${currentScore.engines_used.length} 个（${currentScore.engines_used.join(', ')}）`);
  md.push('');

  md.push('---');
  md.push('*本报告由 ACMS GEO 应用自动生成。*');

  return md.join('\n');
}

function generateMonthlyInsights(brand, currentScore, snapshots) {
  const insights = [];
  // 趋势分析（vs 上周）
  if (snapshots.length >= 2) {
    const last = snapshots[snapshots.length - 1].summary_json;
    const prev = snapshots[snapshots.length - 2].summary_json;
    if (last?.score != null && prev?.score != null) {
      const delta = last.score - prev.score;
      if (Math.abs(delta) >= 5) {
        insights.push({
          priority: delta > 0 ? '🟢 POSITIVE' : '🔴 REGRESSION',
          type: 'TREND',
          title: `周环比 ${delta > 0 ? '上升' : '下降'} ${Math.abs(delta).toFixed(1)} 分`,
          detail: `上周 ${prev.score} → 本周 ${last.score}（${delta > 0 ? '提升' : '下滑'}）`,
        });
      }
    }
  }

  // 综合建议
  if (currentScore.score < 50) {
    insights.push({
      priority: '🔴 URGENT',
      type: 'LOW_SCORE',
      title: 'GEO 综合分偏低',
      detail: `当前 ${currentScore.score}（${currentScore.grade}）。建议优先:1) 创建/更新 llms.txt;2) 补充 FAQ 内容;3) 增加高质量外部引用。`,
    });
  } else if (currentScore.score >= 80) {
    insights.push({
      priority: '🟢 EXCELLENT',
      type: 'HIGH_SCORE',
      title: 'GEO 表现优秀',
      detail: `${currentScore.score}（${currentScore.grade}）。继续保持内容更新频率和结构化数据。`,
    });
  }

  // mention_rate 警告
  if (currentScore.components.mention_rate < 0.3) {
    insights.push({
      priority: '🔴 HIGH',
      type: 'LOW_MENTION',
      title: '品牌提及率过低',
      detail: `仅 ${(currentScore.components.mention_rate * 100).toFixed(0)}% 的查询结果中包含品牌。建议增加品牌曝光内容（行业文章、新闻稿、合作伙伴）。`,
    });
  }

  return insights;
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

function pct(v) {
  if (v == null) return '—';
  return `${(v * 100).toFixed(0)}%`;
}

async function saveMonthlyReport(brandId, options = {}) {
  const md = generateMonthlyReport(brandId, options);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const month = options.month || currentMonth();
  const brandSlug = (GEO_STORE.getBrand(brandId)?.name || 'all').replace(/[^a-z0-9]/gi, '_');
  const filename = `monthly_${brandSlug}_${month}.md`;
  const savedPath = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(savedPath, md, 'utf-8');
  return { ok: true, saved_path: savedPath, bytes: md.length, month };
}

module.exports = {
  generateMonthlyReport,
  saveMonthlyReport,
  currentMonth,
  weeksInMonth,
};