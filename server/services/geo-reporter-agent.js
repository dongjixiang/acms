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

// === 维度白名单（v0.47+ 修复：components 里还含 coverage_detail/industry_rank/accuracy_* 等
//   v0.34+ 金卡 metadata，不该渲染在「维度表」里） ===
const DIM_KEYS = [
  // 主维度（有权重）
  'mention_rate', 'sov_natural', 'position_score', 'context_score',
  // 参考维度（无权重）
  'engine_consistency', 'freshness', 'branded_mention_rate', 'branded_ratio',
];

// === Unicode 条形图辅助（PDF 渲染时无 SVG，用块字符画进度条）===
function bar(value, width = 20, opts = {}) {
  if (value == null || isNaN(value)) return '—'.padEnd(width + 4);
  const v = Math.max(0, Math.min(1, value));
  const filled = Math.round(v * width);
  const empty = width - filled;
  const ch = opts.filled || '█';
  const eCh = opts.empty || '░';
  const num = opts.percent ? ` ${(v * 100).toFixed(0)}%` : ` ${v.toFixed(2)}`;
  return ch.repeat(filled) + eCh.repeat(empty) + num;
}

// === ASCII 折线趋势图（用 ◼ 和 ◻ 渲染多系列）===
function sparkline(points, width = 40, height = 8) {
  if (!points || points.length === 0) return '(暂无数据)';
  if (points.length === 1) {
    // 单点：画一个垂直短线（多行 ◼）标记当前值
    return '◼\n'.repeat(height);
  }
  const max = Math.max(...points, 1);
  // 按 width 等距采样
  const step = Math.max(1, Math.floor(points.length / width));
  const sampled = [];
  for (let i = 0; i < points.length && sampled.length < width; i += step) sampled.push(points[i]);
  const rows = [];
  for (let row = height - 1; row >= 0; row--) {
    const threshold = (row + 1) / height;
    let line = '';
    for (const v of sampled) {
      line += v / max >= threshold ? '◼' : ' ';
    }
    rows.push(line);
  }
  return rows.join('\n');
}

// === 百分比格式化（0.45 → "45%"，null → "—"）===
function pct(v) {
  if (v == null) return '—';
  return `${(v * 100).toFixed(0)}%`;
}

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
  md.push(`**行业**: ${brand.industry || '未设置'}  `);
  md.push(`**生成时间**: ${new Date().toISOString()}  `);
  md.push('');

  // 1. 综合分 + 维度网格（v0.26 C3: 新指标）
  md.push(`## 1. 综合分：${score.score} / 100（${score.grade}）`);
  md.push('');
  md.push('| 维度 | 分数 | 条形 | 权重 |');
  md.push('|------|------|------|------|');
  // v0.47+ 修复：只渲染真实维度（不渲染 coverage_*/industry_*/accuracy_* 等 metadata）
  for (const dim of DIM_KEYS) {
    if (!(dim in score.components)) continue;
    const val = score.components[dim];
    const w = score.weights[dim];
    const wStr = w != null ? `${(w * 100).toFixed(0)}%` : '—（参考指标）';
    const valStr = val == null ? '—' : `${(val * 100).toFixed(0)}%`;
    md.push(`| ${labelOf(dim)} | ${valStr} | ${bar(val, 16, { percent: true })} | ${wStr} |`);
  }
  md.push('');
  // v0.26 C3: 指标口径说明
  md.push(`> **指标口径（v0.26 重定义）**：综合分基于**自然发现**（非品牌词查询）计算 — 用户搜行业词时品牌被 AI 主动提及的可见性。自然提及率 50% + 自然SoV 20% + 位置 15% + 上下文 15%。品牌词查询单独看（品牌搜索提及率 ${score.components.branded_mention_rate == null ? '—' : (score.components.branded_mention_rate * 100).toFixed(0) + '%'}，占比 ${score.components.branded_ratio == null ? '—' : (score.components.branded_ratio * 100).toFixed(0) + '%'}）。`);
  md.push('');

  // 2. 引擎状态（v0.46+: 配置状态 + 联网能力位）
  try {
    md.push(buildEngineStatusSection());
  } catch (e) { /* 引擎状态失败不阻塞 */ }

  // 3. 品牌对比（按行业分组条形）
  try {
    md.push(buildBrandComparisonSection(brandId));
  } catch (e) { /* 对比失败不阻塞 */ }

  // 4. 趋势图（snapshots 折线）
  try {
    md.push(buildTrendSection(brandId));
  } catch (e) { /* 趋势失败不阻塞 */ }

  // 5. v0.34 三大金卡 + v0.36/37/38 进阶卡（Top1 / Citation / Industry / Accuracy / Competitors / Perception / Coverage）
  try {
    md.push(buildHighlightCardsSection(score));
  } catch (e) { /* 高亮卡失败不阻塞 */ }

  // 6. Zero-Click 叙事（被推荐 / 被看到 / 被引用）
  try {
    md.push(buildZeroClickNarrativeSection(score));
  } catch (e) { /* Zero-Click 失败不阻塞 */ }

  // 7. 引擎拆解（按引擎 mention rate 分布）
  md.push(`## 7. 引擎拆解（${score.engines_used.length} 个引擎）`);
  md.push('');
  md.push('| 引擎 | 响应数 | 提及数 | 提及率 | 条形 |');
  md.push('|------|--------|--------|--------|------|');
  for (const eng of score.engines_used) {
    const rs = GEO_STORE.listResponses({ brand_id: brandId, engine: eng });
    const mentioned = rs.filter(r => SCORING._internal.isMentioned(brand.name, r.raw_answer || r.text || '')).length;
    const rate = rs.length > 0 ? (mentioned / rs.length) : 0;
    md.push(`| ${eng} | ${rs.length} | ${mentioned} | ${(rate * 100).toFixed(0)}% | ${bar(rate, 14)} |`);
  }
  md.push('');

  // 8. 行业地位（排名/指数/分位）
  try {
    md.push(buildIndustryRankingSection(brandId));
  } catch (e) { /* 行业排名失败不影响周报主体 */ }

  // 9. v0.26: 代表 prompt 表现（借鉴 elmo selectRepresentativePrompts）
  md.push(PROMPT_REPORT.generateRepresentativePromptsSection(brandId, { competitors: watchCompetitors }));

  // 10. 引用源分析（按 category + domain）
  try {
    md.push(buildCitationSourceSection(brandId));
  } catch (e) { /* 引用源失败不阻塞 */ }

  // 11. 触发问题（按 query 聚合 mention_rate）
  try {
    md.push(buildQueryTriggerSection(brandId));
  } catch (e) { /* 触发问题失败不阻塞 */ }

  // 12. 情感分析（正面/中性/负面）
  try {
    md.push(buildSentimentSection(brandId));
  } catch (e) { /* 情感失败不阻塞 */ }

  // 13. 行动归因（每周 score 变化 + 对应任务）
  try {
    md.push(buildAttributionSection(brandId));
  } catch (e) { /* 归因失败不阻塞 */ }

  // 14. v0.26: 数据驱动内容缺口（已存在）— 给优化建议铺底
  md.push(PROMPT_REPORT.generateContentGapsSection(brandId, { competitors: watchCompetitors }));

  // 15. AI 优化建议（v0.47+：从 geo_opportunities 缓存库读取，多多重点要求）
  try {
    md.push(buildOpportunitiesSection(brandId));
  } catch (e) { /* 建议库读取失败不阻塞 */ }

  // 16. 关键发现（基于当前分）
  const insights = generateInsights(brand, score);
  if (insights.length > 0) {
    md.push(`## 16. 关键发现`);
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

// === 各 section 构造函数（统一前缀 buildXxxSection） ===

function buildEngineStatusSection() {
  let status = {};
  let capabilities = {};
  try {
    const geoConfig = require('./geo-config');
    status = geoConfig.getProviderStatus ? geoConfig.getProviderStatus() : {};
  } catch (_) { /* 引擎配置不可用不阻塞 */ }
  try {
    const geoEngines = require('./geo-engines');
    for (const name of Object.keys(geoEngines.ENGINES || {})) {
      try {
        const info = geoEngines.getEngineInfo(name);
        capabilities[name] = info?.capability || { search: 'none' };
      } catch (_) {
        capabilities[name] = { search: 'none' };
      }
    }
  } catch (_) { /* ENGINES 模块不可用不阻塞 */ }
  const md = [`## 2. 引擎状态`];
  md.push('');
  if (Object.keys(status).length === 0) {
    md.push('_（引擎配置信息不可用）_');
    md.push('');
    return md.join('\n');
  }
  md.push('| 引擎 | 配置 | 模型 | 联网能力 |');
  md.push('|------|------|------|---------|');
  for (const [name, info] of Object.entries(status)) {
    const conf = info.configured ? '✅ 已配置' : '⚠️ 未配置';
    const model = info.model_name || '—';
    const cap = capabilities[name] || {};
    let search = '🧠 裸模型';
    if (cap.search === 'native') search = '🔍 联网';
    else if (cap.search === 'planned') search = '⏳ 待改造';
    md.push(`| ${name} | ${conf} | ${model} | ${search} |`);
  }
  md.push('');
  return md.join('\n');
}

function buildBrandComparisonSection(currentBrandId) {
  const brands = GEO_STORE.listBrands();
  if (brands.length === 0) return '';
  const ids = brands.map(b => b.id).join(',');
  const cmp = SCORING.compareBrands ? SCORING.compareBrands(brands.map(b => b.id)) : null;
  const md = [`## 3. 品牌对比（按行业分组）`];
  md.push('');
  if (!cmp || !cmp.ok || !cmp.brands || cmp.brands.length === 0) {
    md.push('_暂无评分数据。跑一次跟踪后显示对比。_\n');
    return md.join('\n');
  }
  const scoreMap = new Map(cmp.brands.map(b => [b.brand_id || b.id, b]));
  const enriched = brands.map(b => {
    const s = scoreMap.get(b.id);
    return { name: b.name, industry: b.industry || '（未设置）', score: s?.score ?? null, grade: s?.grade || '', id: b.id };
  }).filter(b => b.score != null);
  if (enriched.length === 0) {
    md.push('_暂无评分数据。_\n');
    return md.join('\n');
  }
  // 按行业分组
  const groups = new Map();
  for (const b of enriched) {
    if (!groups.has(b.industry)) groups.set(b.industry, []);
    groups.get(b.industry).push(b);
  }
  const max = Math.max(...enriched.map(b => b.score), 1);
  for (const [ind, list] of groups) {
    list.sort((a, b) => b.score - a.score);
    md.push(`### ${ind}（${list.length} 个品牌）`);
    md.push('');
    md.push('| 排名 | 品牌 | 综合分 | 等级 | 条形 |');
    md.push('|------|------|--------|------|------|');
    list.forEach((b, i) => {
      const focus = b.id === currentBrandId ? ' ⭐' : '';
      md.push(`| ${i + 1} | ${b.name}${focus} | ${b.score} | ${b.grade} | ${bar(b.score / max, 20, { filled: '█', empty: '░', percent: false })} ${(b.score / max * 100).toFixed(0)}% |`);
    });
    md.push('');
  }
  return md.join('\n');
}

function buildTrendSection(brandId) {
  const allSnaps = GEO_STORE.listSnapshots(brandId);
  if (!allSnaps || allSnaps.length === 0) return '';
  // 按周去重（保留最新）
  const byWeek = new Map();
  for (const s of allSnaps) {
    if (!s.week) continue;
    const cur = byWeek.get(s.week);
    if (!cur || (s.computed_at || '') > (cur.computed_at || '')) byWeek.set(s.week, s);
  }
  const sorted = Array.from(byWeek.values()).sort((a, b) => a.week.localeCompare(b.week));
  if (sorted.length === 0) return '';
  const md = [`## 4. 综合分趋势（${sorted.length} 个周快照）`];
  md.push('');
  // 取 score 序列画 sparkline
  const scores = sorted.map(s => s.summary_json?.score ?? 0).filter(s => s > 0);
  if (scores.length > 0) {
    md.push('```');
    md.push(sparkline(scores, 50, 8));
    md.push('```');
    md.push('');
  }
  md.push('| 周 | 综合分 | mention_rate | position_score | engine_consistency |');
  md.push('|----|--------|--------------|----------------|--------------------|');
  sorted.forEach(s => {
    const sum = s.summary_json || {};
    const c = sum.components || {};
    md.push(`| ${s.week} | ${sum.score ?? '—'} | ${pct(c.mention_rate)} | ${pct(c.position_score)} | ${pct(c.engine_consistency)} |`);
  });
  md.push('');
  return md.join('\n');
}

function buildHighlightCardsSection(score) {
  if (!score || !score.ok || !score.components) return '';
  const c = score.components;
  const md = [`## 5. 关键指标卡（v0.34/36/37/38 金卡）`];
  md.push('');

  // Top1 首位推荐率
  md.push('### ★ 首位推荐率（商业意图问题中，AI 第一个点名品牌的比例）');
  md.push('');
  if (c.top1_rate != null) {
    md.push(`- **首位推荐率**: ${(c.top1_rate * 100).toFixed(1)}%`);
    md.push(`- **样本**: ${c.top1_sample_size || 0} 条商业意图回答`);
    md.push(`- **定性**: ${c.top1_rate >= 0.5 ? '🟢 领先' : c.top1_rate >= 0.3 ? '🔵 健康' : '⚠️ 待提升'}`);
    if (c.top1_by_engine) {
      md.push('');
      md.push('| 引擎 | 首位率 |');
      md.push('|------|--------|');
      for (const [k, v] of Object.entries(c.top1_by_engine)) {
        if (v != null) md.push(`| ${k} | ${(v * 100).toFixed(0)}% |`);
      }
    }
  } else {
    md.push('_样本不足（需要 ≥ 20 条商业意图回答）_');
  }
  md.push('');

  // Citation AI 引用占比
  md.push('### 🔗 AI 引用占比');
  md.push('');
  if (c.citation_share != null) {
    md.push(`- **引用占比**: ${(c.citation_share * 100).toFixed(1)}%`);
    md.push(`- **品牌被引**: ${c.citation_brand_count || 0} 次 / 总 ${c.citation_total_count || 0} 次`);
    md.push(`- **跨域数**: ${c.citation_brand_domains || 0}`);
    md.push(`- **覆盖度**: ${c.citation_coverage != null ? (c.citation_coverage * 100).toFixed(0) + '%' : '—'}`);
    md.push(`- **定性**: ${c.citation_share >= 0.3 ? '🟢 健康' : c.citation_share >= 0.15 ? '🔵 一般' : '⚠️ 待提升'}`);
  } else {
    md.push('_无引用数据（需要响应中含 citations 字段）_');
  }
  md.push('');

  // Industry Percentile
  md.push('### 🏆 行业分位');
  md.push('');
  if (c.industry_percentile != null) {
    md.push(`- **分位**: 前 ${Math.round((1 - c.industry_percentile) * 100)}%`);
    md.push(`- **排名**: 第 ${c.industry_rank} / ${c.industry_sample_size} 个${c.industry ? c.industry + ' ' : ''}品牌`);
    md.push(`- **行业中位数**: ${(c.industry_median || 0).toFixed(1)}`);
    md.push(`- **行业均值**: ${(c.industry_mean || 0).toFixed(1)}`);
    md.push(`- **定性**: ${c.industry_percentile <= 0.25 ? '🟢 领先' : c.industry_percentile <= 0.5 ? '🔵 中等' : '⚠️ 落后'}`);
  } else {
    md.push('_样本不足（需要 ≥ 8 个同行业样本）_');
  }
  md.push('');

  // Accuracy 准确率
  md.push('### 🧠 描述准确率（LLM-as-judge 抽样）');
  md.push('');
  if (c.accuracy_rate != null) {
    md.push(`- **准确率**: ${(c.accuracy_rate * 100).toFixed(1)}%`);
    md.push(`- **样本**: ${c.accuracy_correct || 0} 正确 / ${c.accuracy_misleading || 0} misleading（共 ${(c.accuracy_correct || 0) + (c.accuracy_misleading || 0)} 条）`);
    md.push(`- **判定时间**: ${c.accuracy_computed_at ? new Date(c.accuracy_computed_at).toLocaleDateString('zh-CN') : '—'}`);
    md.push(`- **定性**: ${c.accuracy_rate >= 0.8 ? '🟢 健康' : c.accuracy_rate >= 0.5 ? '🔵 一般' : '⚠️ 警示'}`);
    if ((c.accuracy_issues || []).length > 0) {
      md.push('');
      md.push('**错例摘要：**');
      md.push('');
      for (const it of c.accuracy_issues.slice(0, 3)) {
        md.push(`- [${it.engine || '?'}] ${it.issue || ''}`);
      }
    }
  } else {
    md.push('_未抽样。GEO 总览页点击「🧠 抽样判定」用 LLM 判定 20 条回答（30-60 秒）_');
  }
  md.push('');

  // Competitors 竞品共现
  md.push('### 🤝 竞品共现（AI 提到品牌时同时提到的竞品）');
  md.push('');
  const comps = c.competitors || [];
  if (comps.length > 0) {
    md.push('| # | 竞品 | 域名 | 情感 | 提及 | 推荐 |');
    md.push('|---|------|------|------|------|------|');
    comps.slice(0, 8).forEach((cp, i) => {
      const sent = cp.sentiment != null ? (cp.sentiment >= 60 ? '🟢 正面' : cp.sentiment >= 40 ? '🟡 中性' : '🔴 负面') : '—';
      const rec = cp.isRecommended ? '⭐' : '';
      md.push(`| ${i + 1} | ${cp.name || '?'} | ${cp.domain || '—'} | ${sent} (${cp.sentiment || 0}) | ${cp.mentions || 0} | ${rec} |`);
    });
  } else {
    md.push('_暂无竞品共现数据（需要先有竞品品牌 + 自然发现回答）_');
  }
  md.push('');

  // Perception 品牌感知
  md.push('### 💎 品牌感知');
  md.push('');
  if (c.perception_core_claims != null) {
    md.push(`- **定价感知**: ${c.perception_pricing || '—'}`);
    md.push(`- **最被认可**: ${c.perception_best_known_for || '未识别'}`);
    md.push('');
    if ((c.perception_core_claims || []).length > 0) {
      md.push('**核心主张：**');
      md.push('');
      c.perception_core_claims.slice(0, 5).forEach(cl => md.push(`- ${cl}`));
      md.push('');
    }
    if ((c.perception_differentiators || []).length > 0) {
      md.push('**差异化优势：**');
      md.push('');
      c.perception_differentiators.slice(0, 5).forEach(d => md.push(`- ${d}`));
      md.push('');
    }
    if ((c.perception_risks || []).length > 0) {
      md.push('**风险信号：**');
      md.push('');
      c.perception_risks.slice(0, 5).forEach(r => md.push(`- [${r.severity || 'info'}] ${r.description || ''}`));
      md.push('');
    }
  } else {
    md.push('_未分析。GEO 总览页点击「🧠 触发感知分析」（30-60 秒）_');
  }
  md.push('');

  // Coverage 平台覆盖度
  md.push('### 🌐 平台覆盖度（每个 AI 引擎的提及率）');
  md.push('');
  const detail = c.coverage_detail || [];
  if (detail.length > 0) {
    const avg = c.coverage_avg_rate;
    md.push(`- **引擎数**: ${c.coverage_engine_count || detail.length} 个`);
    md.push(`- **平均提及率**: ${avg != null ? (avg * 100).toFixed(1) + '%' : '—'}`);
    md.push('');
    md.push('| 引擎 | 提及率 | 条形 |');
    md.push('|------|--------|------|');
    detail.forEach(it => {
      md.push(`| ${it.engine || it.name || '?'} | ${(it.rate * 100).toFixed(0)}% | ${bar(it.rate, 16)} |`);
    });
  } else {
    md.push('_暂无平台覆盖数据_');
  }
  md.push('');

  return md.join('\n');
}

function buildZeroClickNarrativeSection(score) {
  if (!score || !score.ok || !score.components) return '';
  const c = score.components;
  const md = [`## 6. 零点击决策叙事（v0.35 — 用户已经做了决定但没点链接）`];
  md.push('');
  const naturalSample = score.natural_sample_size || 0;

  md.push('### 卡 1 · 被首次推荐');
  md.push('');
  if (c.top1_rate != null && c.top1_sample_size) {
    const top1Count = Math.round(c.top1_sample_size * c.top1_rate);
    md.push(`- **次数**: ${top1Count} 次`);
    md.push(`- **首位率**: ${(c.top1_rate * 100).toFixed(1)}%`);
    md.push(`- **样本**: ${c.top1_sample_size} 条商业意图回答`);
  } else {
    md.push('_样本不足（需要 ≥ 20 条商业意图回答）_');
  }
  md.push('');

  md.push('### 卡 2 · 用户看到你');
  md.push('');
  if (c.mention_rate != null && naturalSample > 0) {
    const seenCount = Math.round(naturalSample * c.mention_rate);
    md.push(`- **次数**: ${seenCount} 次`);
    md.push(`- **自然样本**: ${naturalSample} 条`);
    md.push(`- **提及率**: ${(c.mention_rate * 100).toFixed(1)}%`);
  } else {
    md.push('_样本不足_');
  }
  md.push('');

  md.push('### 卡 3 · 被 AI 引用');
  md.push('');
  if (c.citation_brand_count != null && c.citation_total_count) {
    md.push(`- **次数**: ${c.citation_brand_count} 次`);
    md.push(`- **占比**: ${c.citation_share != null ? (c.citation_share * 100).toFixed(1) + '%' : '—'}`);
    md.push(`- **总引用**: ${c.citation_total_count} 次 · 跨 ${c.citation_brand_domains || 0} 域`);
  } else {
    md.push('_无引用数据_');
  }
  md.push('');
  return md.join('\n');
}

function buildIndustryRankingSection(brandId) {
  const ranking = require('./geo-ranking');
  const rk = ranking.computeIndustryRanking(brandId, { lookbackDays: 30 });
  if (!rk.ok) return '';
  const md = [`## 8. 🏆 行业地位`];
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
  return md.join('\n');
}

function buildCitationSourceSection(brandId) {
  let classifier;
  try { classifier = require('./geo-citation-classifier'); } catch (_) { return ''; }
  const responses = GEO_STORE.listResponses({ brand_id: brandId });
  if (responses.length === 0) return '';
  const allBrands = GEO_STORE.listBrands();
  const brandDomains = allBrands
    .map(b => (b.domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase())
    .filter(Boolean);
  let result;
  try {
    result = classifier.rollupCitations(responses, brandDomains);
  } catch (_) { return ''; }
  if (!result || !result.total_citations) return '';
  const md = [`## 10. 引用源分析（共 ${result.total_citations} 次引用）`];
  md.push('');
  const catLabels = result.category_labels || {};
  const catOrder = ['brand', 'editorial', 'reviews', 'social', 'forum', 'ecommerce', 'reference', 'institutional', 'other'];
  const cats = catOrder
    .map(c => ({ key: c, label: catLabels[c] || c, count: result.category_tally?.[c] || 0 }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);
  if (cats.length > 0) {
    md.push('### 来源类型分布');
    md.push('');
    md.push('| 类型 | 次数 | 条形 |');
    md.push('|------|------|------|');
    const maxCat = Math.max(...cats.map(c => c.count), 1);
    cats.forEach(c => {
      md.push(`| ${c.label} | ${c.count} | ${bar(c.count / maxCat, 18, { filled: '█', empty: '░', percent: false })} |`);
    });
    md.push('');
  }
  const domains = (result.domains || []).slice(0, 12);
  if (domains.length > 0) {
    md.push('### Top 来源域名');
    md.push('');
    md.push('| # | 域名 | 次数 | 类型 |');
    md.push('|---|------|------|------|');
    const maxDom = Math.max(...domains.map(d => d.count), 1);
    domains.forEach((dm, i) => {
      md.push(`| ${i + 1} | ${dm.domain} | ${dm.count} | ${catLabels[dm.category] || dm.category || '—'} |`);
    });
    md.push('');
  }
  return md.join('\n');
}

function buildQueryTriggerSection(brandId) {
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return '';
  const responses = GEO_STORE.listResponses({ brand_id: brandId });
  const queries = GEO_STORE.listQueries(brandId);
  if (responses.length === 0) return '';
  const qMap = {};
  queries.forEach(q => { if (q.id) qMap[q.id] = q.prompt || q.text || ''; });
  const brandName = (brand.name || '').toLowerCase();
  const brandDomain = (brand.domain || '').toLowerCase();
  const groups = {};
  responses.forEach(resp => {
    const qid = resp.query_id || 'unknown';
    if (!groups[qid]) groups[qid] = { total: 0, mentioned: 0, error: 0 };
    const g = groups[qid];
    g.total++;
    if (resp.error) { g.error++; return; }
    const text = (resp.raw_answer || '').toLowerCase();
    if (brandName && text.includes(brandName)) g.mentioned++;
    else if (brandDomain && text.includes(brandDomain)) g.mentioned++;
  });
  const rows = Object.entries(groups)
    .map(([qid, g]) => ({
      qid,
      prompt: qMap[qid] || '(模板已删)',
      total: g.total,
      mentioned: g.mentioned,
      rate: g.total - g.error > 0 ? g.mentioned / (g.total - g.error) : 0,
    }))
    .filter(g => g.total > 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 10);
  if (rows.length === 0) return '';
  const md = [`## 11. 触发问题 Top 10（按 mention_rate 排序）`];
  md.push('');
  md.push('| # | Prompt | 提及率 | 条形 | 响应 |');
  md.push('|---|--------|--------|------|------|');
  const max = Math.max(...rows.map(r => r.rate), 0.01);
  rows.forEach((r, i) => {
    const prompt = r.prompt.length > 40 ? r.prompt.slice(0, 40) + '…' : r.prompt;
    md.push(`| ${i + 1} | ${prompt} | ${(r.rate * 100).toFixed(0)}% | ${bar(r.rate / max, 14, { filled: '█', empty: '░', percent: false })} | ${r.total}（提及 ${r.mentioned}）|`);
  });
  md.push('');
  return md.join('\n');
}

function buildSentimentSection(brandId) {
  let sentiment;
  try { sentiment = require('./geo-sentiment'); } catch (_) { return ''; }
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return '';
  const responses = GEO_STORE.listResponses({ brand_id: brandId });
  if (responses.length === 0) return '';
  let result;
  try {
    result = sentiment.aggregateSentiment(responses, brand.name);
  } catch (_) { return ''; }
  if (!result || !result.mentioned_count) return '';
  const md = [`## 12. 情感分析（共 ${result.mentioned_count} 次提及）`];
  md.push('');
  const dist = result.distribution || {};
  const total = result.mentioned_count;
  md.push('| 情感 | 次数 | 占比 | 条形 |');
  md.push('|------|------|------|------|');
  ['positive', 'neutral', 'negative'].forEach(k => {
    const c = dist[k] || 0;
    const p = c / total;
    const label = k === 'positive' ? '👍 正面' : k === 'neutral' ? '😐 中性' : '👎 负面';
    const tip = k === 'positive' ? 'AI 正面推荐（推荐/最佳/优秀等词）' : k === 'neutral' ? '仅提及无褒贬' : 'AI 负面评价（差/贵/不如等词）';
    md.push(`| ${label}（${tip}）| ${c} | ${(p * 100).toFixed(0)}% | ${bar(p, 16)} |`);
  });
  md.push('');
  if ((result.samples || []).length > 0) {
    md.push('### 样例（最近 8 条）');
    md.push('');
    md.push('| 情感 | 引擎 | 上下文 |');
    md.push('|------|------|--------|');
    result.samples.slice(0, 8).forEach(s => {
      const icon = s.sentiment === 'positive' ? '👍' : s.sentiment === 'negative' ? '👎' : '😐';
      const ctx = (s.context || '').slice(0, 60);
      md.push(`| ${icon} ${s.sentiment} | ${s.engine || '?'} | ${ctx}${ctx.length >= 60 ? '…' : ''} |`);
    });
    md.push('');
  }
  return md.join('\n');
}

function buildAttributionSection(brandId) {
  let taskStore;
  try { taskStore = require('../stores/task-store'); } catch (_) { return ''; }
  const allSnaps = GEO_STORE.listSnapshots(brandId);
  if (!allSnaps || allSnaps.length === 0) return '';
  // 按周去重
  const byWeek = new Map();
  for (const s of allSnaps) {
    const cur = byWeek.get(s.week);
    if (!cur || (s.computed_at || '') > (cur.computed_at || '')) byWeek.set(s.week, s);
  }
  const snapshots = Array.from(byWeek.values()).sort((a, b) => a.week.localeCompare(b.week));
  if (snapshots.length === 0) return '';
  // 简化版：直接展示每周 score + score_delta + 任务数（复用路由里的 weekOf + 任务归周逻辑）
  let allTasks = [];
  try { allTasks = taskStore.list({ limit: 500 }); } catch (_) {}
  const geoTasks = allTasks.filter(t => {
    try {
      const arts = JSON.parse(t.artifacts || '{}');
      return arts.geo && arts.geo.brand_id === brandId;
    } catch (_) { return false; }
  });
  const weekOf = ts => {
    const d = new Date(ts);
    const onejan = new Date(d.getFullYear(), 0, 1);
    const wk = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(wk).padStart(2, '0')}`;
  };
  const tasksByWeek = {};
  for (const t of geoTasks) {
    const ts = t.assigned_at || t.created_at || t.id?.match(/_(\d{8,})/)?.[1];
    const tDate = ts ? new Date(typeof ts === 'number' && String(ts).length <= 10 ? ts * 1000 : ts) : null;
    if (!tDate) continue;
    const w = weekOf(tDate);
    if (!tasksByWeek[w]) tasksByWeek[w] = [];
    tasksByWeek[w].push(t);
  }
  const md = [`## 13. 行动→影响归因（每周动作与分数变化）`];
  md.push('');
  md.push('| 周 | 综合分 | 变化 | 任务数 | 任务明细 |');
  md.push('|----|--------|------|--------|---------|');
  const typeIcons = { 'geo-audit': '🔍', 'geo-optimize': '✨', 'geo-report': '📊', 'geo-track': '🔄' };
  for (let i = 0; i < snapshots.length; i++) {
    const s = snapshots[i];
    const score = s.summary_json?.score;
    const prevScore = i > 0 ? snapshots[i - 1].summary_json?.score : null;
    const delta = (score != null && prevScore != null) ? score - prevScore : null;
    const tasks = tasksByWeek[s.week] || [];
    const taskTxt = tasks.length > 0
      ? tasks.slice(0, 3).map(t => `${typeIcons[t.type] || '📌'} ${(t.title || '').slice(0, 22)}${(t.title || '').length > 22 ? '…' : ''}`).join(' / ') + (tasks.length > 3 ? ` / +${tasks.length - 3}` : '')
      : '—';
    const deltaStr = delta == null ? '—' : (delta >= 0 ? `▲ +${delta}` : `▼ ${delta}`);
    md.push(`| ${s.week} | ${score ?? '—'} | ${deltaStr} | ${tasks.length} | ${taskTxt} |`);
  }
  md.push('');
  if (geoTasks.length === 0) {
    md.push('> ℹ️ 还没有 GEO 任务记录。在 GEO 总览页「✨ 生成建议」一键落地 Kanban 任务后，这里会出现「动作 → 分数变化」对照。\n');
  }
  return md.join('\n');
}

function buildOpportunitiesSection(brandId) {
  // v0.47+：同时读两路建议——
  //   路径 1（geo_optimization_cache）= LLM 实时分析 / ✨ 生成建议按钮 / 含 actions
  //   路径 2（geo_opportunities）= 持久化 / 含 relatedPrompts/sustain_type
  //   两路互补，PDF 不主动调 LLM（保持 < 10s 生成）
  const source1 = readOptimizerCache(brandId);  // { analysis, recommendations, ... }
  const source2 = readOpportunitiesCache(brandId);  // { summary, opportunities, risks, contentGaps }

  const has1 = source1 && source1.recommendations && source1.recommendations.length > 0;
  const has2 = source2 && source2.opportunities && source2.opportunities.length > 0;
  const contentGaps = source2?.contentGaps || [];

  if (!has1 && !has2 && (!contentGaps || contentGaps.length === 0)) {
    const md = [`## 15. AI 优化建议（v0.47+ 多多重点要求）`];
    md.push('');
    md.push('> ⚠️ **尚未生成建议**。打开 GEO 总览页点击「✨ 生成建议」按钮，AI 会基于近 30 天数据生成 10 条可执行优化建议（30-60 秒）。生成后会缓存在 `geo_optimization_cache` 表，下次 PDF 周报自动包含。\n');
    return md.join('\n');
  }

  const md = [`## 15. AI 优化建议`];
  md.push('');
  const sources = [];
  if (source1) sources.push(`✨ LLM 实时分析（${source1.recommendations?.length || 0} 条，${source1.ageDays} 天前生成）`);
  if (source2) sources.push(`📚 持久化机会库（${source2.opportunities?.length || 0} 条，${source2.ageDays} 天前生成）`);
  if (sources.length > 0) md.push(`> 数据源：${sources.join(' · ')}\n`);

  // AI 分析摘要（来自路径 1）
  if (source1 && source1.analysis) {
    md.push('### AI 现状分析');
    md.push('');
    md.push(source1.analysis);
    md.push('');
  }

  // 路径 1：optimize 推荐（含 actions）
  if (has1) {
    md.push('### 🤖 LLM 实时优化建议（含具体行动项）');
    md.push('');
    const priorityEmoji = { HIGH: '🔴', MEDIUM: '🟡', LOW: '🟢' };
    const typeLabels = {
      CONTENT: '内容', FAQ: 'FAQ', SCHEMA: '结构化数据',
      LLMS: 'llms.txt', CITATION: '外部引用', AUTHORITY: '权威性', STRATEGY: '策略',
    };
    md.push('| # | 优先级 | 类型 | 标题 | 为什么 | 行动项 |');
    md.push('|---|--------|------|------|--------|--------|');
    source1.recommendations.slice(0, 10).forEach((r, i) => {
      const prio = priorityEmoji[r.priority] || '⚪';
      const type = typeLabels[r.type] || r.type || '—';
      const title = (r.title || '').slice(0, 50);
      const detail = (r.detail || '').slice(0, 80);
      const actions = (r.actions || []).slice(0, 2).map(a => a.slice(0, 30)).join(' / ') || '—';
      md.push(`| ${i + 1} | ${prio} ${r.priority || ''} | ${type} | ${title} | ${detail} | ${actions} |`);
    });
    md.push('');
    // 展开详细 actions
    md.push('#### 行动项展开');
    md.push('');
    source1.recommendations.slice(0, 10).forEach((r, i) => {
      if (!r.actions || r.actions.length === 0) return;
      md.push(`**${i + 1}. ${r.title || '（无标题）'}**`);
      md.push('');
      r.actions.slice(0, 5).forEach((a) => {
        // 去前缀数字 "1. xxx" → "- xxx"（统一用 markdown 列表渲染）
        const cleaned = a.replace(/^\s*\d+\.\s*/, '').trim();
        md.push(`- ${cleaned}`);
      });
      md.push('');
    });
  }

  // 路径 2：持久化机会库（含 relatedPrompts / sustain_type）
  if (has2) {
    const summary = source2.summary || [];
    const risks = source2.risks || [];
    if (summary.length > 0) {
      md.push('### 📋 核心洞察（持久化）');
      md.push('');
      summary.slice(0, 5).forEach(s => md.push(`- ${s}`));
      md.push('');
    }
    md.push('### 💡 优化机会（持久化）');
    md.push('');
    md.push('| # | 类别 | 标题 | 为什么 | 可持续 | 难度 |');
    md.push('|---|------|------|--------|--------|------|');
    const catIcons = { creation: '🆕 新建', 'existing-content': '✏️ 优化', outreach: '🤝 外联', social: '💬 社区' };
    const sustainLabels = { asset: '🎯 资产型', continuous: '🔁 持续型', hybrid: '🔀 混合' };
    const diffLabels = { 'wide-open': '🟢 易突破', contested: '🟡 竞争', 'locked-in': '🔴 难突破' };
    source2.opportunities.slice(0, 10).forEach((o, i) => {
      const cat = catIcons[o.category] || o.category || '—';
      const sus = sustainLabels[o.sustain_type] || '—';
      const dif = diffLabels[o.difficulty] || '—';
      const title = (o.title || '').slice(0, 50);
      const why = (o.why || '').slice(0, 80);
      md.push(`| ${i + 1} | ${cat} | ${title} | ${why} | ${sus} | ${dif} |`);
    });
    md.push('');
    source2.opportunities.slice(0, 10).forEach((o, i) => {
      md.push(`**${i + 1}. ${o.title || '（无标题）'}**`);
      md.push('');
      md.push(`- **类别**: ${catIcons[o.category] || o.category || '—'}`);
      md.push(`- **为什么做**: ${o.why || '—'}`);
      if (o.relatedPrompts && o.relatedPrompts.length > 0) {
        md.push(`- **关联 prompt**: ${o.relatedPrompts.slice(0, 3).map(p => typeof p === 'string' ? p : (p.text || '')).join(' / ')}`);
      }
      md.push(`- **可持续性**: ${sustainLabels[o.sustain_type] || '—'}（${o.sustain_note || '—'}）`);
      md.push(`- **难度**: ${diffLabels[o.difficulty] || '—'}`);
      md.push('');
    });
    if (risks.length > 0) {
      md.push('### ⚠️ 风险提示');
      md.push('');
      risks.slice(0, 5).forEach(r => md.push(`- ⚠️ ${r}`));
      md.push('');
    }
  }

  // 数据驱动内容缺口（两路都可能带）
  if (contentGaps.length > 0) {
    md.push('### 🕳️ 数据驱动内容缺口（竞品被提但品牌未提）');
    md.push('');
    md.push('| # | Prompt | 类别 | 竞品提及数 |');
    md.push('|---|--------|------|------------|');
    contentGaps.slice(0, 8).forEach((g, i) => {
      const prompt = (g.prompt || g.promptValue || '').slice(0, 60);
      const cat = g.category || '—';
      const cc = g.competitorsMentioned ? g.competitorsMentioned.length : (g.competitorCount || 0);
      md.push(`| ${i + 1} | ${prompt} | ${cat} | ${cc} |`);
    });
    md.push('');
  }

  return md.join('\n');
}

// === 路径 1：optimizer-agent 持久化缓存（✨ 生成建议按钮落盘）===
function readOptimizerCache(brandId) {
  try {
    const records = GEO_STORE.collection('geo_optimization_cache')
      .find(doc => doc.brand_id === brandId)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 1);
    if (!records || records.length === 0) return null;
    const r = records[0];
    const ageMs = Date.now() - new Date(r.created_at || 0).getTime();
    const ageDays = Math.round(ageMs / 86400000);
    return { ...r.output, ageDays, cacheCreatedAt: r.created_at };
  } catch (_) { return null; }
}

// === 路径 2：opportunities 持久化缓存（智能推荐面板落盘）===
function readOpportunitiesCache(brandId) {
  try {
    const opps = require('./geo-opportunities');
    const records = opps.listOpportunities(brandId, 1);
    if (!records || records.length === 0) return null;
    const r = records[0];
    const data = r.data || {};
    const ageMs = Date.now() - new Date(r.created_at || 0).getTime();
    const ageDays = Math.round(ageMs / 86400000);
    return { ...data, ageDays, cacheCreatedAt: r.created_at };
  } catch (_) { return null; }
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

  // 主对比表（带条形）
  md.push('## 1. 综合分排名');
  md.push('');
  md.push('| 排名 | 品牌 | 综合分 | 等级 | 自然提及率 | 位置分 | 引擎一致性 | 条形 |');
  md.push('|------|------|--------|------|------------|--------|------------|------|');
  const max = Math.max(...compare.brands.filter(b => b.ok).map(b => b.score || 0), 1);
  compare.brands.forEach((b, idx) => {
    if (!b.ok || b.score === undefined) {
      md.push(`| ${idx + 1} | ${b.brand_name} | ❌ ${b.error || 'NO_DATA'} | - | - | - | - | - |`);
      return;
    }
    const c = b.components || {};
    md.push(`| ${idx + 1} | ${b.brand_name} | ${b.score} | ${b.grade} | ${pct(c.mention_rate)} | ${pct(c.position_score)} | ${pct(c.engine_consistency)} | ${bar(b.score / max, 16, { filled: '█', empty: '░', percent: false })} ${(b.score / max * 100).toFixed(0)}% |`);
  });
  md.push('');

  // 每个品牌的 AI 优化建议（v0.47+ 多多重点要求 — 对比报告也要带）
  md.push('## 2. AI 优化建议（每个品牌）');
  md.push('');
  compare.brands.forEach((b, idx) => {
    if (!b.ok || !b.brand_id) return;
    md.push(`### ${idx + 1}. ${b.brand_name}`);
    md.push('');
    try {
      md.push(buildOpportunitiesSection(b.brand_id));
    } catch (_) {
      md.push('_优化建议读取失败_');
    }
    md.push('');
  });

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
  // v0.47+ 单 section 函数（给月报复用 + 未来单 section 调试用）
  buildEngineStatusSection,
  buildBrandComparisonSection,
  buildTrendSection,
  buildHighlightCardsSection,
  buildZeroClickNarrativeSection,
  buildIndustryRankingSection,
  buildCitationSourceSection,
  buildQueryTriggerSection,
  buildSentimentSection,
  buildAttributionSection,
  buildOpportunitiesSection,
  bar,
  sparkline,
  pct,
};