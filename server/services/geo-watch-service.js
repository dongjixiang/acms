// ACMS GEO 竞品 Watch 服务（v0.11 — Phase 4）
// 用途：对比焦点品牌 vs 竞品的 cite-ability 评分，记录变化，生成对比报告
// 路径：server/services/geo-watch-service.js
//
// MVP 设计（纯 DB 计算，不调 LLM → 快且省 token）：
//   - runWatch: 对比评分 + 提及率 + 差距 → 存 last_result（含变化检测）
//   - runAllWatches: 所有 enabled watch 顺序跑（cron 集成）
//   - generateWatchReport: markdown 对比报告
//   - 变化告警: score 变化超过阈值（默认 5 分）时，result.changes 标记

const GEO_STORE = require('./geo-store');
const SCORING = require('./geo-scoring');

const CHANGE_THRESHOLD = 5; // 评分变化超过 5 分算「明显变化」

function brandLabel(brandId) {
  const b = GEO_STORE.getBrand(brandId);
  return b ? b.name : brandId;
}

// 跑单个 watch：对比评分 + 差距 + 变化检测
async function runWatch(watchId) {
  const watch = GEO_STORE.getWatch(watchId);
  if (!watch) return { ok: false, error: 'WATCH_NOT_FOUND', message: `watch ${watchId} 不存在` };
  if (!watch.enabled) return { ok: false, error: 'WATCH_DISABLED', message: 'watch 已停用，先启用再跑' };

  const allIds = [watch.focus_brand_id, ...watch.competitor_ids].filter(Boolean);
  if (allIds.length < 2) {
    return { ok: false, error: 'NEED_COMPETITORS', message: '至少需要 1 个竞品品牌才能对比' };
  }

  const compare = SCORING.compareBrands(allIds, { lookbackDays: 30 });
  const focus = compare.brands.find(b => b.brand_id === watch.focus_brand_id) || null;
  const competitors = compare.brands.filter(b => b.brand_id !== watch.focus_brand_id);

  // 与上次结果对比（变化检测）
  const prev = watch.last_result || null;
  const prevScores = {};
  if (prev && Array.isArray(prev.brands)) {
    prev.brands.forEach(b => { if (b.brand_id) prevScores[b.brand_id] = b.score; });
  }

  const changes = [];
  if (prevScores[watch.focus_brand_id] != null && focus && focus.score != null) {
    const delta = Math.round((focus.score - prevScores[watch.focus_brand_id]) * 100) / 100;
    if (Math.abs(delta) >= CHANGE_THRESHOLD) {
      changes.push({
        type: delta > 0 ? 'up' : 'down',
        brand_id: watch.focus_brand_id,
        brand_name: brandLabel(watch.focus_brand_id),
        from: prevScores[watch.focus_brand_id],
        to: focus.score,
        delta,
      });
    }
  }
  for (const c of competitors) {
    if (prevScores[c.brand_id] != null && c.score != null) {
      const delta = Math.round((c.score - prevScores[c.brand_id]) * 100) / 100;
      if (Math.abs(delta) >= CHANGE_THRESHOLD) {
        changes.push({
          type: delta > 0 ? 'up' : 'down',
          brand_id: c.brand_id,
          brand_name: brandLabel(c.brand_id),
          from: prevScores[c.brand_id],
          to: c.score,
          delta,
        });
      }
    }
  }

  const brandsOut = compare.brands.map(b => ({
    brand_id: b.brand_id,
    brand_name: b.brand_name || brandLabel(b.brand_id),
    ok: b.ok,
    error: b.error || '',
    score: b.score != null ? b.score : null,
    grade: b.grade || '',
    mention_rate: b.components?.mention_rate != null ? Math.round(b.components.mention_rate * 1000) / 1000 : null,
  }));

  const focusScore = focus && focus.score != null ? focus.score : null;
  const competitorsWithGap = competitors.map(c => ({
    brand_id: c.brand_id,
    brand_name: c.brand_name || brandLabel(c.brand_id),
    score: c.score != null ? c.score : null,
    grade: c.grade || '',
    gap: focusScore != null && c.score != null ? Math.round((focusScore - c.score) * 100) / 100 : null, // 正=领先 负=落后
  }));

  const result = {
    ok: true,
    watch_id: watchId,
    focus_brand_id: watch.focus_brand_id,
    focus_brand_name: brandLabel(watch.focus_brand_id),
    focus_score: focusScore,
    focus_grade: focus ? focus.grade : '',
    competitors: competitorsWithGap,
    leader: compare.leader,
    changes,
    computed_at: new Date().toISOString(),
  };

  GEO_STORE.setWatchLastRun(watchId, result);
  return result;
}

// 跑所有 enabled watch（cron 集成入口）
async function runAllWatches() {
  const watches = GEO_STORE.listWatches().filter(w => w.enabled);
  const results = [];
  for (const w of watches) {
    try {
      const r = await runWatch(w.id);
      results.push({ watch_id: w.id, ok: r.ok, error: r.error || '', focus: r.focus_brand_name || '', changes: (r.changes || []).length });
    } catch (e) {
      results.push({ watch_id: w.id, ok: false, error: e.message });
    }
  }
  return { ok: true, total: watches.length, results };
}

// 生成 markdown 对比报告
function generateWatchReport(watchId) {
  const watch = GEO_STORE.getWatch(watchId);
  if (!watch) return `# 竞品 Watch\n\nwatch ${watchId} 不存在`;
  const r = watch.last_result;
  const focus = brandLabel(watch.focus_brand_id);
  if (!r || !r.ok) {
    return `# 竞品 Watch — ${focus}\n\n还没有运行结果。先「跑一次」生成对比。`;
  }

  const lines = [];
  lines.push(`# 竞品 Watch — ${focus}`);
  lines.push('');
  lines.push(`- 焦点品牌: **${r.focus_brand_name}** — ${r.focus_score != null ? r.focus_score + ' 分 (' + r.focus_grade + ')' : '无数据'}`);
  lines.push(`- 领先者: ${r.leader || '—'}`);
  lines.push(`- 更新时间: ${r.computed_at}`);
  lines.push('');
  lines.push('## 评分对比');
  lines.push('');
  lines.push('| 品牌 | 评分 | 等级 | 与焦点差距 |');
  lines.push('|---|---|---|---|');
  for (const c of r.competitors) {
    const gapStr = c.gap == null ? '—' : (c.gap >= 0 ? `领先 ${c.gap}` : `落后 ${Math.abs(c.gap)}`);
    lines.push(`| ${c.brand_name} | ${c.score != null ? c.score : '无数据'} | ${c.grade || '—'} | ${gapStr} |`);
  }
  lines.push('');
  if (r.changes && r.changes.length) {
    lines.push('## 变化告警');
    lines.push('');
    for (const ch of r.changes) {
      lines.push(`- 🔺 ${ch.brand_name}: ${ch.from} → ${ch.to}（${ch.delta > 0 ? '+' : ''}${ch.delta}）`);
    }
    lines.push('');
  } else {
    lines.push('_最近一次运行无显著变化（|Δ| < 5 分）。_');
    lines.push('');
  }
  return lines.join('\n');
}

module.exports = {
  runWatch,
  runAllWatches,
  generateWatchReport,
  CHANGE_THRESHOLD,
};
