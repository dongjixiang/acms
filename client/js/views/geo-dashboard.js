// ACMS GEO 应用 — 仪表盘逻辑（v0.31 — Yao Open Prompts 借鉴版）
// 路径：client/js/views/geo-dashboard.js
//
// 4 个 active tab 数据加载：
//   Tab 1 总览     → 4 个 KPI + 5 维度明细 + 8 引擎状态
//   Tab 2 品牌管理 → 表格 CRUD（增删改查 + 弹窗表单）
//   Tab 4 追踪记录 → 数据表格（支持引擎过滤）
//   Tab 7 llms.txt → 文件列表 + 生成按钮
//   其他 4 个 tab  → 占位
//
// 关键陷阱（P88/P96/P147）：
//   - 所有 DOM 操作走 _byId helper（避免 document.getElementById 浮窗错位）
//   - fetch 用 _byId('foo') 取到的是 w.$c 浮窗内的元素（live ref）
//   - 写操作后用 ACMSWin.refreshView('geo-dashboard') 同步浮窗
//   - 全量渲染入口用 document.getElementById 强制写 hidden 模板

(function () {
  'use strict';

  // === 全局 GEO cron 通知（v0.9 — Phase 4）===
  // 脚本加载即监听（不管 GEO 窗口是否打开）；后端 cron 完成 → eventBus → WS → app.js 广播 acms:geo.cron.done
  function globalNotify(title, desc, type) {
    try {
      if (window.ACMS && window.ACMS.Notif && typeof window.ACMS.Notif.add === 'function') {
        window.ACMS.Notif.add({ icon: '🌐', title: title, desc: desc || '', type: type || 'info' });
      }
    } catch (_) { /* 通知失败不影响主流程 */ }
  }
  window.addEventListener('acms:geo.cron.done', function (e) {
    var d = e.detail || {};
    globalNotify(d.title || '🌐 GEO 任务完成', d.desc || '', d.type || 'info');
  });
  window.addEventListener('acms:geo.report.done', function (e) {
    var d = e.detail || {};
    globalNotify(d.title || '📊 GEO 报告已生成', d.desc || '', d.type || 'info');
  });

  const VIEW_NAME = 'geo-dashboard';
  let wRef = null;
  let cleanupFns = [];
  let currentBrandId = ''; // '' = 所有品牌
  let enginesStatusCache = null; // 引擎状态缓存（避免重复拉）

  function _byId(id) {
    if (wRef && wRef.$c) {
      const el = wRef.$c.querySelector('#' + id);
      if (el) return el;
    }
    return document.getElementById(id);
  }

  function setStatus(text, type = 'info') {
    const el = _byId('geo-status');
    if (el) {
      el.textContent = text;
      el.dataset.type = type;
    }
  }

  function switchTab(tabName) {
    (wRef?.$c || document).querySelectorAll('.geo-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });
    (wRef?.$c || document).querySelectorAll('.geo-pane').forEach((p) => {
      p.classList.toggle('active', p.id === 'geo-pane-' + tabName);
    });
    // 切到某 tab 时触发数据加载
    if (tabName === 'overview') loadOverview();
    else if (tabName === 'brand') loadBrands();
    else if (tabName === 'track') loadTracks();
    else if (tabName === 'queries') loadQueries();
    else if (tabName === 'scores') loadScores();
    else if (tabName === 'snapshots') loadSnapshots();
    else if (tabName === 'watch') loadWatches();
    else if (tabName === 'llms') loadLLMS();
    else if (tabName === 'settings') loadSettings();
  }

  // === API helper ===
  const AK_VALUE = (typeof window !== 'undefined' && window.AK) || 'dev-key-001';
  async function api(method, path, body) {
    const url = path + (path.includes('?') ? '&' : '?') + 'api_key=' + AK_VALUE;
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  }

  // === Tab 1: 总览 ===
  async function loadOverview() {
    setStatus('加载总览...', 'loading');
    try {
      // 4 个 KPI + 引擎状态并行拉
      const [brandsRes, enginesRes, healthRes] = await Promise.all([
        api('GET', '/api/geo/brands'),
        api('GET', '/api/geo/engines'),
        api('GET', '/api/geo/health'),
      ]);

      const brands = brandsRes.data?.brands || [];
      const configuredEngines = Object.values(enginesRes.data?.engines || {}).filter(e => e.configured).length;
      const totalEngines = Object.keys(enginesRes.data?.engines || {}).length;

      // v0.14: 总览也要填充品牌下拉（之前只在 Tab2 loadBrands 时填，总览首开 select 为空）
      populateBrandSelector(brands);

      // KPI 1: 活跃品牌数
      const kpiBrands = _byId('geo-kpi-brands')?.querySelector('.geo-kpi-value');
      if (kpiBrands) kpiBrands.textContent = brands.filter(b => b.status === 'active').length;

      // KPI 3: 总响应数（用 health 数据）
      // 注意：health 当前不返回 responses count，从 /api/geo/responses 算
      // 简化：先显示 — 等选品牌再算
      const kpiResponses = _byId('geo-kpi-responses')?.querySelector('.geo-kpi-value');
      if (kpiResponses) kpiResponses.textContent = '—';

      // KPI 4: 已配置引擎
      const kpiEngines = _byId('geo-kpi-engines')?.querySelector('.geo-kpi-value');
      const kpiEnginesSub = _byId('geo-kpi-engines')?.querySelector('.geo-kpi-sub');
      if (kpiEngines) kpiEngines.textContent = `${configuredEngines}/${totalEngines}`;
      if (kpiEnginesSub) kpiEnginesSub.textContent = configuredEngines === totalEngines ? '全部就绪' : '需配置';

      // 引擎状态网格（v0.25: 附联网搜索能力位）
      renderEngineGrid(enginesRes.data?.engines || {}, enginesRes.data?.capabilities || {});

      // KPI 2: 综合分（选品牌时算）
      await loadOverviewScore(brands);

      // v0.13: 综合分趋势折线（多品牌快照）
      loadTrendChart(brands);

      // v0.14: 引用源分析 + 触发问题分析（当前品牌）
      loadSourceAnalysis(brands);
      loadQueryTrigger(brands);

      // v0.17: 行动→影响归因（当前品牌）
      loadAttribution(brands);

      // v0.19: 情感分析（当前品牌）
      loadSentiment(brands);

      // v0.23: 行业排名/指数（当前品牌）
      loadRanking(brands);

      setStatus('总览已加载', 'success');
    } catch (e) {
      setStatus('总览加载失败: ' + e.message, 'error');
    }
  }

  async function loadOverviewScore(brands) {
    const kpiScore = _byId('geo-kpi-score');
    const kpiScoreValue = kpiScore?.querySelector('.geo-kpi-value');
    const kpiScoreSub = kpiScore?.querySelector('.geo-kpi-sub');

    // 品牌对比条形图（总览固定显示所有品牌）
    renderBrandComparison(brands);

    if (currentBrandId) {
      const r = await api('GET', `/api/geo/score/${currentBrandId}`);
      if (r.data?.ok) {
        if (kpiScoreValue) kpiScoreValue.textContent = `${r.data.score} (${r.data.grade})`;
        if (kpiScoreSub) kpiScoreSub.textContent = `${r.data.engines_used.length} 引擎 / ${r.data.sample_size} 响应`;
        renderDimGrid(r.data.components);
        renderRadar(r.data.components);
      } else {
        if (kpiScoreValue) kpiScoreValue.textContent = '—';
        if (kpiScoreSub) kpiScoreSub.textContent = r.data?.message?.slice(0, 50) || '无数据';
        renderDimGrid(null);
        renderRadar(null);
      }
    } else {
      // 多品牌概览
      if (kpiScoreValue) kpiScoreValue.textContent = '—';
      if (kpiScoreSub) kpiScoreSub.textContent = `选择品牌查看 (${brands.length} 个可用)`;
      renderDimGrid(null);
      renderRadar(null);
    }
  }

  // === 雷达图（SVG，6 维度 — v0.26 C3 加 SoV）===
  function renderRadar(components) {
    const container = _byId('geo-radar-container');
    if (!container) return;
    if (!components) {
      container.innerHTML = '<div class="geo-dim-empty">选择品牌后查看雷达图</div>';
      return;
    }

    // v0.26 C3: 6 维（新增 sov_natural — 自然发现 SoV）
    const dims = ['mention_rate', 'position_score', 'context_score', 'engine_consistency', 'freshness', 'sov_natural'];
    const labels = { mention_rate: '自然提及率', position_score: '位置分', context_score: '上下文分', engine_consistency: '一致性', freshness: '时效性', sov_natural: '自然SoV' };
    const size = 280, cx = size / 2, cy = size / 2, R = 100;

    const angle = (i) => (Math.PI * 2 * i / dims.length) - Math.PI / 2;
    const point = (i, r) => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];

    let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
    // 网格（5 层）
    for (let layer = 1; layer <= 5; layer++) {
      const pts = dims.map((_, i) => point(i, R * layer / 5).join(',')).join(' ');
      svg += `<polygon points="${pts}" fill="none" stroke="var(--geo-border)" stroke-width="0.5"/>`;
    }
    // 对角线
    dims.forEach((_, i) => {
      const [x, y] = point(i, R);
      svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--geo-border)" stroke-width="0.5"/>`;
    });
    // 数据多边形（null 值视为 0 — engine_consistency 单引擎时为 null）
    const dataPts = dims.map((d, i) => {
      const v = Math.max(0, Math.min(1, components[d] ?? 0));
      return point(i, v * R).join(',');
    }).join(' ');
    svg += `<polygon points="${dataPts}" fill="rgba(99,102,241,0.25)" stroke="#6366f1" stroke-width="2"/>`;
    // 数据点
    dims.forEach((d, i) => {
      const v = Math.max(0, Math.min(1, components[d] ?? 0));
      const [x, y] = point(i, v * R);
      svg += `<circle cx="${x}" cy="${y}" r="3" fill="#8b5cf6"/>`;
    });
    // 标签
    dims.forEach((d, i) => {
      const [x, y] = point(i, R + 24);
      svg += `<text x="${x}" y="${y}" text-anchor="middle" font-size="11" fill="var(--geo-text-2)">${labels[d]}</text>`;
      const [vx, vy] = point(i, R + 38);
      svg += `<text x="${vx}" y="${vy}" text-anchor="middle" font-size="11" font-weight="bold" fill="var(--geo-text)">${Math.round((components[d] || 0) * 100)}%</text>`;
    });
    svg += '</svg>';
    container.innerHTML = svg;
  }

  // === 品牌综合分对比（条形图）===
  async function renderBrandComparison(brands) {
    const container = _byId('geo-compare-container');
    if (!container) return;
    if (!brands || brands.length === 0) {
      container.innerHTML = '<div class="geo-dim-empty">暂无品牌。到「🏢 品牌管理」创建。</div>';
      return;
    }

    // 拉所有品牌的分数（对比）
    const ids = brands.map(b => b.id).join(',');
    let scores = [];
    try {
      const r = await api('GET', '/api/geo/score?brand_ids=' + ids);
      if (r.data?.ok) scores = r.data.brands || [];
    } catch (_) { /* 单个失败不阻塞 */ }

    if (scores.length === 0) {
      container.innerHTML = '<div class="geo-dim-empty">暂无评分数据。跑一次跟踪后显示对比。</div>';
      return;
    }

    const max = Math.max(...scores.map(b => b.score || 0), 1);
    container.innerHTML = scores.map(b => {
      const hasScore = b.score != null;
      const pct = hasScore ? Math.max(4, Math.round((b.score / max) * 100)) : 4;
      return `
        <div class="geo-bar-row">
          <div class="geo-bar-label" title="${esc(b.brand_name || '')}">${esc(b.brand_name || '?')}</div>
          <div class="geo-bar-track">
            <div class="geo-bar-fill${hasScore ? '' : ' geo-bar-fill-empty'}" style="width:${pct}%"></div>
          </div>
          <div class="geo-bar-value">${hasScore ? b.score + ' (' + b.grade + ')' : '无数据'}</div>
        </div>
      `;
    }).join('');

    // v0.13: Share of Voice（各品牌提及率归一化份额）
    renderSoV(scores);
  }

  // === Share of Voice（v0.13 — 差距分析 P0）===
  // SoV = 品牌 mention_rate / 所有品牌 mention_rate 之和
  // v0.26: 升级 — 借鉴 elmo share-of-voice-donut.tsx，donut 环形图（CSS conic-gradient）+ TopN + Others bucket
  const SOV_BRAND_COLOR = '#6366f1';   // 品牌色（与雷达图一致）
  const SOV_OTHERS_COLOR = '#94a3b8';  // 灰色
  const SOV_PALETTE = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']; // 竞品色（不重复品牌色）
  const SOV_DONUT_TOPN = 6;

  function renderSoV(scores) {
    const container = _byId('geo-sov-container');
    if (!container) return;
    const withMention = scores.filter(b => b.ok && b.components && b.components.mention_rate != null);
    if (withMention.length < 2) {
      container.innerHTML = '<div class="geo-dim-empty">需要至少 2 个品牌有提及数据才能计算份额（多品牌跑跟踪后显示）</div>';
      return;
    }
    const total = withMention.reduce((s, b) => s + b.components.mention_rate, 0);
    if (total <= 0) {
      container.innerHTML = '<div class="geo-dim-empty">所有品牌提及率均为 0（先跑跟踪收集回答）</div>';
      return;
    }
    // 按份额降序
    const rows = withMention
      .map(b => ({
        id: b.brand_id,
        name: b.brand_name || b.brand_id,
        rate: b.components.mention_rate,
        share: (b.components.mention_rate / total) * 100,
        isFocus: currentBrandId ? b.brand_id === currentBrandId : false,
      }))
      .sort((a, b) => b.share - a.share);
    // 没选品牌时 top1 视为焦点（让 donut 有「主品牌」高亮）
    if (!currentBrandId) rows[0].isFocus = true;

    // === v0.26 donut 部分 ===
    const slices = [];
    let acc = 0, shown = 0, others = 0;
    // 焦点品牌优先放第一段（视觉上突出）
    const focusRow = rows.find(r => r.isFocus);
    const otherRows = rows.filter(r => !r.isFocus);
    if (focusRow) {
      slices.push({ name: focusRow.name, value: focusRow.share, color: SOV_BRAND_COLOR, isFocus: true });
      acc += focusRow.share;
    }
    for (const r of otherRows) {
      if (r.share <= 0) continue;
      if (shown < SOV_DONUT_TOPN) {
        slices.push({ name: r.name, value: r.share, color: SOV_PALETTE[shown % SOV_PALETTE.length], isFocus: false });
        shown++;
      } else {
        others += r.share;
      }
    }
    if (others > 0) slices.push({ name: `其他 ${rows.length - shown - 1} 个`, value: others, color: SOV_OTHERS_COLOR, isFocus: false });

    // 构造 conic-gradient（"color start% end%, color start% end%, ..."）
    let gradStops = '', cur = 0;
    for (const s of slices) {
      const next = cur + s.value;
      const seg = `${s.color} ${cur.toFixed(2)}% ${next.toFixed(2)}%`;
      gradStops = gradStops ? gradStops + ', ' + seg : seg;
      cur = next;
    }
    // 焦点品牌的中心数字
    const focusShare = focusRow ? focusRow.share.toFixed(1) : '0';
    const focusRate = focusRow ? (focusRow.rate * 100).toFixed(1) : '0';
    const legendHtml = slices.map(s => `
      <div style="display:flex;align-items:center;gap:6px;font-size:12px;line-height:1.4;margin-bottom:3px">
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${s.color};flex-shrink:0"></span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(s.name)}">${esc(s.name)}</span>
        <span style="font-variant-numeric:tabular-nums;color:var(--geo-text-2)">${s.value.toFixed(1)}%</span>
      </div>
    `).join('');
    const donutHtml = `
      <div class="geo-sov-donut-wrap" style="display:flex;gap:24px;align-items:center;flex-wrap:wrap;margin-bottom:18px;padding:14px;background:var(--geo-bg-soft,rgba(255,255,255,0.03));border-radius:8px">
        <div style="position:relative;width:180px;height:180px;flex-shrink:0">
          <div style="width:180px;height:180px;border-radius:50%;background:conic-gradient(${gradStops || '#94a3b8 0% 100%'})" title="Share of Voice 各品牌提及份额"></div>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:100px;height:100px;border-radius:50%;background:var(--bg2,#ffffff);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
            <div style="font-size:22px;font-weight:700;color:${SOV_BRAND_COLOR};line-height:1.1">${focusShare}%</div>
            <div style="font-size:10px;color:var(--geo-text-2);margin-top:2px">${focusRow ? esc(focusRow.name) : '无焦点'}</div>
            <div style="font-size:10px;color:var(--geo-text-2);opacity:.7;margin-top:1px" title="焦点品牌在所有 AI 引擎中被提及的原始比率">提及率 ${focusRate}%</div>
          </div>
        </div>
        <div style="flex:1;min-width:200px;max-width:340px">
          <div style="font-size:11px;color:var(--geo-text-2);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">📊 品牌份额（图例）${createInfoTip('Share of Voice 各品牌在被 AI 引擎提及时的相对占比（基于各品牌 30 天提及率归一化）。份额越高 = 在 AI 引擎里占的心智越大。\n\n焦点品牌（⭐）固定在 donut 第一段。TopN=6 个竞品，超过的合并为「其他」。')}</div>
          ${legendHtml}
        </div>
      </div>
    `;

    // === 水平条形图（保留原版，用户已习惯）===
    const maxShare = rows[0].share;
    const barsHtml = `
      <div style="font-size:11px;color:var(--geo-text-2);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">📋 详细份额（条形对比）</div>
      ${rows.map(r => `
        <div class="geo-bar-row">
          <div class="geo-bar-label geo-tip" data-tip="${esc(r.name)} 的提及率 ${(r.rate * 100).toFixed(1)}%${r.isFocus ? '（当前焦点品牌）' : ''}">
            ${r.isFocus ? '<strong>⭐</strong> ' : ''}${esc(r.name)}
          </div>
          <div class="geo-bar-track">
            <div class="geo-bar-fill geo-sov-fill" style="width:${Math.max(4, Math.round((r.share / maxShare) * 100))}%;${r.isFocus ? 'background:' + SOV_BRAND_COLOR + ';' : ''}"></div>
          </div>
          <div class="geo-bar-value">${r.share.toFixed(1)}%</div>
        </div>
      `).join('')}
    `;

    container.innerHTML = donutHtml + barsHtml;
  }

  // === 综合分趋势折线图（v0.13 — SVG 多品牌）===
  // v0.26: 借鉴 elmo lookback-selector.tsx，加时间范围 segmented control（1w/1m/3m/6m/1y/all）
  const LOOKBACK_OPTIONS = [
    { value: '1w', label: '1w', weeks: 1 },
    { value: '1m', label: '1mo', weeks: 4 },
    { value: '3m', label: '3mo', weeks: 13 },
    { value: '6m', label: '6mo', weeks: 26 },
    { value: '1y', label: '1yr', weeks: 52 },
    { value: 'all', label: 'all', weeks: 999 },
  ];
  let _lookback = '3m'; // 全局状态

  function applyLookback(snaps) {
    const opt = LOOKBACK_OPTIONS.find(o => o.value === _lookback) || LOOKBACK_OPTIONS[2];
    return _lookback === 'all' ? snaps : snaps.slice(-opt.weeks);
  }

  // 渲染 segmented control 到指定容器
  function renderLookbackSelector(targetId, onChange) {
    const el = _byId(targetId);
    if (!el) return;
    const btns = LOOKBACK_OPTIONS.map(o => `
      <button type="button" class="geo-lookback-btn${o.value === _lookback ? ' active' : ''}" data-lookback="${o.value}" title="最近 ${o.weeks >= 999 ? '全部' : o.weeks + ' 周'}">${o.label}</button>
    `).join('');
    el.innerHTML = `<div style="display:flex;align-items:center;gap:6px"><span style="font-size:12px;color:var(--geo-text-2,#888)">📅 时间范围</span>${createInfoTip('切换趋势图显示的周数范围。\n• 1w = 最近 1 周\n• 1mo = 最近 1 个月（4 周）\n• 3mo = 最近 3 个月（13 周，默认）\n• 6mo = 最近半年（26 周）\n• 1yr = 最近一年（52 周）\n• all = 全部历史快照\n\n切换时趋势图会按选定时段重新拉取并渲染。')}<div class="geo-lookback" role="group" aria-label="时间范围">${btns}</div></div>`;
    el.querySelectorAll('.geo-lookback-btn').forEach(btn => {
      btn.onclick = () => {
        const v = btn.dataset.lookback;
        if (v === _lookback) return;
        _lookback = v;
        // 更新 active 态
        el.querySelectorAll('.geo-lookback-btn').forEach(b => b.classList.toggle('active', b.dataset.lookback === v));
        if (onChange) onChange();
      };
    });
  }

  // v0.26: 通用 Filter Bar（借鉴 elmo filter-bar.tsx）
  // filters: [{ key, label, icon?, type: 'single'|'multi', value, options: [{value, label}], placeholder?, onChange }]
  // 返回 { getValue(key), setValue(key, val), refresh() }
  function renderGeoFilterBar(targetId, filters) {
    const container = _byId(targetId);
    if (!container) return null;
    const state = {}; // key → current value
    filters.forEach(f => { state[f.key] = f.value !== undefined ? f.value : (f.type === 'multi' ? [] : ''); });

    function renderChip(f) {
      const v = state[f.key];
      let label = f.label;
      let active = false, badge = '';
      // v0.27: label 不再拼接 icon（icon 由 .geo-filter-icon span 单独渲染，避免「🔍🔍 引擎」双图标）
      if (f.type === 'multi') {
        const arr = Array.isArray(v) ? v : [];
        active = arr.length > 0;
        if (arr.length === 1) {
          const opt = f.options.find(o => o.value === arr[0]);
          if (opt) label = `${f.label}: ${opt.label}`;
        } else if (arr.length > 1) {
          label = `${f.label}: ${arr.length}`;
          badge = arr.length;
        }
      } else {
        const opt = f.options.find(o => o.value === v);
        active = !!v && v !== '' && v !== 'all';
        if (opt) label = `${f.label}: ${opt.label}`;
      }
      const badgeHtml = badge ? `<span class="geo-filter-badge">${badge}</span>` : '';
      return `<button type="button" class="geo-filter-chip${active ? ' active' : ''}" data-filter-key="${f.key}"><span class="geo-filter-icon">${f.icon || ''}</span><span>${esc(label)}</span>${badgeHtml}<span style="opacity:.5;font-size:10px">▾</span></button>`;
    }

    function renderDropdown(f) {
      const v = state[f.key];
      const isMulti = f.type === 'multi';
      const items = f.options.map(opt => {
        const selected = isMulti ? (Array.isArray(v) && v.includes(opt.value)) : (v === opt.value);
        return `<div class="geo-filter-dropdown-item${selected ? ' selected' : ''}" data-filter-key="${f.key}" data-opt-value="${esc(opt.value)}" data-opt-label="${esc(opt.label)}">${esc(opt.label)}</div>`;
      }).join('');
      const clearHtml = isMulti && Array.isArray(v) && v.length > 0 ? `<div style="border-bottom:1px solid var(--geo-border);padding:4px 12px"><button type="button" class="geo-filter-clear" data-filter-clear="${f.key}">清除选择</button></div>` : '';
      return `<div class="geo-filter-dropdown" data-dropdown-for="${f.key}">${clearHtml}${items}</div>`;
    }

    container.classList.add('geo-filter-bar');
    container.innerHTML = filters.map(renderChip).join('') + filters.map(renderDropdown).join('');

    function closeAllDropdowns() {
      container.querySelectorAll('.geo-filter-dropdown.open').forEach(d => d.classList.remove('open'));
    }

    function refresh() {
      const openKeys = new Set();
      container.querySelectorAll('.geo-filter-dropdown.open').forEach(d => openKeys.add(d.dataset.dropdownFor));
      container.innerHTML = filters.map(renderChip).join('') + filters.map(renderDropdown).join('');
      rebindEvents();
      openKeys.forEach(k => container.querySelector('[data-dropdown-for="' + k + '"]')?.classList.add('open'));
    }

    function rebindEvents() {
      container.querySelectorAll('.geo-filter-chip').forEach(chip => {
        chip.onclick = (e) => {
          e.stopPropagation();
          const key = chip.dataset.filterKey;
          const dd = container.querySelector('[data-dropdown-for="' + key + '"]');
          if (!dd) return;
          const isOpen = dd.classList.contains('open');
          closeAllDropdowns();
          if (!isOpen) {
            const rect = chip.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            dd.style.top = (rect.bottom - containerRect.top + 4) + 'px';
            dd.style.left = (rect.left - containerRect.left) + 'px';
            dd.classList.add('open');
          }
        };
      });
      container.querySelectorAll('.geo-filter-dropdown-item').forEach(item => {
        item.onclick = (e) => {
          e.stopPropagation();
          const key = item.dataset.filterKey;
          const optValue = item.dataset.optValue;
          const f = filters.find(x => x.key === key);
          if (!f) return;
          if (f.type === 'multi') {
            const arr = Array.isArray(state[key]) ? [...state[key]] : [];
            const idx = arr.indexOf(optValue);
            if (idx >= 0) arr.splice(idx, 1); else arr.push(optValue);
            state[key] = arr;
          } else {
            state[key] = optValue;
            closeAllDropdowns();
          }
          if (f.onChange) f.onChange(state[key], key);
          refresh();
        };
      });
      container.querySelectorAll('.geo-filter-clear').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const key = btn.dataset.filterClear;
          const f = filters.find(x => x.key === key);
          if (!f) return;
          state[key] = f.type === 'multi' ? [] : '';
          if (f.onChange) f.onChange(state[key], key);
          closeAllDropdowns();
          refresh();
        };
      });
    }
    rebindEvents();

    // 点外部关闭
    setTimeout(() => {
      const offClick = (e) => {
        if (!container.contains(e.target)) closeAllDropdowns();
      };
      document.addEventListener('click', offClick);
      if (cleanupFns) cleanupFns.push(() => document.removeEventListener('click', offClick));
    }, 0);

    return {
      getValue: (key) => state[key],
      setValue: (key, val) => {
        state[key] = val;
        refresh();
      },
      refresh,
    };
  }

  async function loadTrendChart(brands) {
    const container = _byId('geo-trend-container');
    if (!container) return;
    if (!brands || brands.length === 0) {
      container.innerHTML = '<div class="geo-dim-empty">暂无品牌</div>';
      return;
    }
    container.innerHTML = '<div class="geo-dim-empty">加载趋势...</div>';

    // v0.26: 渲染 lookback selector（切换时重渲染本图）
    renderLookbackSelector('geo-trend-lookback', () => loadTrendChart(brands));

    // 拉每个品牌的快照（API 一次返回所有，前端按 lookback 截取）
    const series = [];
    await Promise.all(brands.map(async (b) => {
      try {
        const r = await api('GET', `/api/geo/snapshots?brand_id=${b.id}`);
        let rawSnaps = applyLookback(r.data?.snapshots || []);
        // v0.27: 按周去重（同周重复快照只保留最新一份）
        const byWeek = new Map();
        for (const s of rawSnaps) {
          const cur = byWeek.get(s.week);
          if (!cur || (s.computed_at || '') > (cur.computed_at || '')) byWeek.set(s.week, s);
        }
        const snaps = Array.from(byWeek.values());
        const pts = snaps
          .filter(s => s.summary_json && s.summary_json.score != null)
          .map(s => ({ week: s.week, score: s.summary_json.score }))
          .sort((a, b) => a.week.localeCompare(b.week));
        if (pts.length) series.push({ name: b.name, color: pickColor(series.length), pts });
      } catch (_) { /* 单品牌失败跳过 */ }
    }));

    if (series.length === 0) {
      container.innerHTML = '<div class="geo-dim-empty">暂无快照数据。每周六 cron 自动生成，或跑跟踪后手动生成。</div>';
      return;
    }

    // 所有周（排序去重）
    const allWeeks = [...new Set(series.flatMap(s => s.pts.map(p => p.week)))].sort();
    const W = 720, H = 220, padL = 40, padR = 16, padT = 14, padB = 28;
    const iw = W - padL - padR, ih = H - padT - padB;
    const maxScore = Math.max(...series.flatMap(s => s.pts.map(p => p.score)), 80);
    const y = v => padT + ih * (1 - v / maxScore);
    const x = i => padL + (allWeeks.length === 1 ? iw / 2 : (iw * i) / (allWeeks.length - 1));

    let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    // 网格 + Y 轴标签（0/25/50/75/100）
    for (let g = 0; g <= 4; g++) {
      const val = (maxScore * g / 4);
      const gy = y(val);
      svg += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="var(--geo-border)" stroke-width="0.5" stroke-dasharray="4 4"/>`;
      svg += `<text x="${padL - 6}" y="${gy + 4}" text-anchor="end" font-size="10" fill="var(--geo-text-2)">${Math.round(val)}</text>`;
    }
    // X 轴周标签（隔一个显示防重叠）
    allWeeks.forEach((wk, i) => {
      if (allWeeks.length > 8 && i % 2 === 1) return;
      svg += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--geo-text-2)">${wk.slice(2)}</text>`;
    });
    // 折线 + 点 + 预测（v0.17: 简单线性回归外推 2 周虚线）
    series.forEach(s => {
      const ptsStr = s.pts.map(p => {
        const idx = allWeeks.indexOf(p.week);
        return `${x(idx)},${y(p.score)}`;
      }).join(' ');
      svg += `<polyline points="${ptsStr}" fill="none" stroke="${s.color}" stroke-width="2"/>`;
      s.pts.forEach(p => {
        const idx = allWeeks.indexOf(p.week);
        svg += `<circle cx="${x(idx)}" cy="${y(p.score)}" r="3" fill="${s.color}"/>`;
      });
      // 线性回归预测（最后 3 点）
      if (s.pts.length >= 3) {
        const pts = s.pts.slice(-3);
        const n = pts.length;
        let sx = 0, sy = 0, sxy = 0, sxx = 0;
        pts.forEach((p, i) => {
          sx += i; sy += p.score; sxy += i * p.score; sxx += i * i;
        });
        const slope = n * sxy - sx * sy !== 0 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : 0;
        const intercept = (sy - slope * sx) / n;
        const lastIdx = allWeeks.indexOf(pts[n - 1].week);
        const lastScore = pts[n - 1].score;
        const pred1 = Math.max(0, Math.min(maxScore, slope * (n - 1) + intercept));
        const pred2 = Math.max(0, Math.min(maxScore, slope * (n) + intercept));
        const predX1 = x(Math.min(allWeeks.length - 1, lastIdx + 1));
        const predX2 = x(Math.min(allWeeks.length - 1, lastIdx + 2));
        if (lastIdx + 1 <= allWeeks.length - 1 && pred1 !== lastScore) {
          svg += `<line x1="${x(lastIdx)}" y1="${y(lastScore)}" x2="${predX1}" y2="${y(pred1)}" stroke="${s.color}" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.7"/>`;
        }
        if (lastIdx + 2 <= allWeeks.length - 1) {
          svg += `<line x1="${predX1}" y1="${y(pred1)}" x2="${predX2}" y2="${y(pred2)}" stroke="${s.color}" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.7"/>`;
          svg += `<circle cx="${predX2}" cy="${y(pred2)}" r="3" fill="${s.color}" opacity="0.6"/>`;
        }
      }
    });
    // 图例
    let lx = padL;
    series.forEach(s => {
      svg += `<rect x="${lx}" y="${padT - 10}" width="10" height="10" fill="${s.color}" rx="2"/>`;
      svg += `<text x="${lx + 14}" y="${padT - 1}" font-size="10" fill="var(--geo-text)">${esc(s.name)}</text>`;
      lx += 14 + s.name.length * 11 + 16;
    });
    // v0.23: 行业平均线（每周所有品牌分数均值，虚线灰色）
    if (series.length >= 2) {
      const avgPts = allWeeks.map((wk, i) => {
        const vals = series.map(s => s.pts.find(p => p.week === wk)?.score).filter(v => v != null);
        return { x: x(i), y: y(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null) };
      }).filter(p => p.y != null);
      if (avgPts.length >= 2) {
        svg += `<polyline points="${avgPts.map(p => p.x + ',' + p.y).join(' ')}" fill="none" stroke="#888" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.6"/>`;
        // 图例追加行业平均
        svg += `<rect x="${lx + 4}" y="${padT - 10}" width="10" height="10" fill="#888" rx="2" opacity="0.7"/>`;
        svg += `<text x="${lx + 18}" y="${padT - 1}" font-size="10" fill="var(--geo-text)">行业平均</text>`;
      }
    }
    svg += '</svg>';
    container.innerHTML = svg;
  }

  function pickColor(i) {
    const palette = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
    return palette[i % palette.length];
  }

  // === 行动→影响归因（v0.17 — Sitepoint 分析 P0）===
  async function loadAttribution(brands) {
    const container = _byId('geo-attr-container');
    if (!container) return;
    if (!currentBrandId) {
      container.innerHTML = '<div class="geo-dim-empty">选择品牌后查看「行动 → 影响」对照（哪些动作带来了分数变化）</div>';
      return;
    }
    container.innerHTML = '<div class="geo-dim-empty">加载中...</div>';
    try {
      const r = await api('GET', '/api/geo/attribution?brand_id=' + currentBrandId);
      if (r.status === 404) {
        container.innerHTML = '<div class="geo-dim-empty">后端尚未重启（/api/geo/attribution 端点未生效）。重启 ACMS 后显示「行动 → 影响」对照。</div>';
        return;
      }
      const d = r.data || {};
      const rows = d.rows || [];
      if (!rows.length) {
        container.innerHTML = '<div class="geo-dim-empty">暂无快照数据，无法归因。每周六 cron 跑完后自动出现。</div>';
        return;
      }
      const typeIcons = { 'geo-audit': '🔍', 'geo-optimize': '✨', 'geo-report': '📊', 'geo-track': '🔄' };
      let html = '<table class="geo-table" style="font-size:12px"><thead><tr><th class="geo-tip" data-tip="ISO 周">周</th><th class="geo-tip" data-tip="该周综合分">综合分</th><th class="geo-tip" data-tip="与上一周的变化（正=提升）">变化</th><th class="geo-tip" data-tip="该周创建/执行的 GEO 任务数">动作</th><th>任务明细</th></tr></thead><tbody>';
      rows.forEach(row => {
        const deltaCls = row.score_delta == null ? '' : (row.score_delta >= 0 ? 'color:var(--geo-ok,#4ade80)' : 'color:var(--geo-danger,#f66)');
        const deltaTxt = row.score_delta == null ? '—' : (row.score_delta >= 0 ? '▲ +' + row.score_delta : '▼ ' + row.score_delta);
        const taskTxt = row.task_count
          ? row.tasks.slice(0, 3).map(t => `${typeIcons[t.type] || '📌'} ${esc(t.title.length > 22 ? t.title.slice(0, 22) + '…' : t.title)}`).join('<br>') + (row.task_count > 3 ? `<br>… 共 ${row.task_count} 项` : '')
          : '<span style="opacity:.5">无动作</span>';
        html += `<tr>
          <td>${esc(row.week)}</td>
          <td><strong>${row.score != null ? row.score : '—'}</strong></td>
          <td style="${deltaCls};font-weight:600">${deltaTxt}</td>
          <td>${row.task_count || 0}</td>
          <td style="font-size:11px;opacity:.9">${taskTxt}</td>
        </tr>`;
      });
      html += '</tbody></table>';
      if (!d.has_tasks) {
        html += '<div style="margin-top:6px;font-size:12px;opacity:.7">ℹ️ 还没有 GEO 任务记录——在「✨ 生成建议」里一键落地 Kanban 任务后，这里会出现「动作 → 分数变化」对照</div>';
      }
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = `<div class="geo-dim-empty">加载失败: ${esc(e.message)}</div>`;
    }
  }

  // === 情感分析（v0.19 — P2 规则版）===
  async function loadSentiment(brands) {
    const container = _byId('geo-sentiment-container');
    if (!container) return;
    if (!currentBrandId) {
      container.innerHTML = '<div class="geo-dim-empty">选择品牌后查看 AI 引擎提及该品牌时的情感分布</div>';
      return;
    }
    container.innerHTML = '<div class="geo-dim-empty">加载中...</div>';
    try {
      const r = await api('GET', '/api/geo/sentiment?brand_id=' + currentBrandId);
      if (r.status === 404) {
        container.innerHTML = '<div class="geo-dim-empty">后端尚未重启（/api/geo/sentiment 端点未生效）。重启 ACMS 后显示情感分析。</div>';
        return;
      }
      const d = r.data || {};
      if (!d.mentioned_count) {
        container.innerHTML = '<div class="geo-dim-empty">' + esc(d.message || '暂无数据') + '</div>';
        return;
      }
      const dist = d.distribution || {};
      const total = d.mentioned_count;
      const pct = k => Math.round(((dist[k] || 0) / total) * 100);
      const colors = { positive: 'var(--geo-ok,#4ade80)', neutral: 'var(--geo-text-2,#999)', negative: 'var(--geo-danger,#f66)' };
      const icons = { positive: '👍', neutral: '😐', negative: '👎' };
      let html = `<div style="font-size:12px;opacity:.85;margin-bottom:8px">共 ${total} 次提及</div>`;
      ['positive', 'neutral', 'negative'].forEach(k => {
        const p = pct(k);
        html += `
          <div class="geo-bar-row">
            <div class="geo-bar-label geo-tip" data-tip="${k === 'positive' ? 'AI 引擎正面推荐品牌（推荐/最佳/优秀等词）' : k === 'neutral' ? '仅提及品牌，无明确褒贬' : 'AI 引擎负面评价品牌（差/贵/不如等词）'}">${icons[k]} ${k === 'positive' ? '正面' : k === 'neutral' ? '中性' : '负面'}</div>
            <div class="geo-bar-track">
              <div class="geo-bar-fill" style="width:${Math.max(4, p)}%;background:${colors[k]}"></div>
            </div>
            <div class="geo-bar-value">${p}%</div>
          </div>`;
      });
      html += `<div style="margin-top:8px;font-size:12px" class="geo-tip" data-tip="基于词表规则的判定结果，可升级 LLM 版本提高精度">${esc(d.message || '')}</div>`;
      // 样例
      if ((d.samples || []).length) {
        html += '<div style="font-size:12px;opacity:.85;margin:10px 0 4px">样例（最近 8 条）</div>';
        html += d.samples.map(s => {
          const c = colors[s.sentiment] || '#888';
          return `<div style="font-size:11px;margin:2px 0;border-left:3px solid ${c};padding-left:8px;opacity:.85">${icons[s.sentiment] || '•'} [${esc(s.engine || '')}] ${esc(s.context || '')}…</div>`;
        }).join('');
      }
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = `<div class="geo-dim-empty">加载失败: ${esc(e.message)}</div>`;
    }
  }

  // === 引用源分析（v0.16 — 移植 elmo 分类体系，后端 rollup）===
  async function loadSourceAnalysis(brands) {
    const container = _byId('geo-source-container');
    if (!container) return;
    if (!currentBrandId) {
      container.innerHTML = '<div class="geo-dim-empty">选择品牌后查看该品牌的引用源分布</div>';
      return;
    }
    container.innerHTML = '<div class="geo-dim-empty">加载中...</div>';
    try {
      const r = await api('GET', '/api/geo/citations?brand_id=' + currentBrandId);
      const d = r.data || {};
      if (!d.total_citations) {
        container.innerHTML = '<div class="geo-dim-empty">暂无引用源数据。配置 Perplexity 等返回 citations 的引擎后，或 AI 回答含链接时自动统计。</div>';
        return;
      }
      // 类别分布条
      const catLabels = d.category_labels || {};
      const catOrder = ['brand', 'editorial', 'reviews', 'social', 'forum', 'ecommerce', 'reference', 'institutional', 'other'];
      const cats = catOrder
        .map(c => ({ key: c, label: catLabels[c] || c, count: d.category_tally?.[c] || 0 }))
        .filter(c => c.count > 0)
        .sort((a, b) => b.count - a.count);
      const maxCat = Math.max(...cats.map(c => c.count), 1);
      let html = '<div style="font-size:12px;opacity:.85;margin-bottom:8px">来源类型分布（共 ' + d.total_citations + ' 次引用）</div>';
      html += cats.map(c => `
        <div class="geo-bar-row">
          <div class="geo-bar-label geo-tip" data-tip="${c.label} 类来源被引用 ${c.count} 次">${c.label}</div>
          <div class="geo-bar-track">
            <div class="geo-bar-fill geo-cat-${c.key}" style="width:${Math.max(4, Math.round((c.count / maxCat) * 100))}%"></div>
          </div>
          <div class="geo-bar-value">${c.count}</div>
        </div>`).join('');
      // 域名列表（分类徽章）
      const domains = d.domains || [];
      if (domains.length) {
        html += '<div style="font-size:12px;opacity:.85;margin:10px 0 6px">Top 来源域名</div>';
        html += domains.slice(0, 12).map(dm => `
          <div class="geo-bar-row">
            <div class="geo-bar-label geo-tip" data-tip="${esc(dm.exampleTitle || dm.domain)}（${dm.count} 次）">${esc(dm.domain)} <span class="geo-cat-badge geo-cat-${dm.category}">${catLabels[dm.category] || dm.category}</span></div>
            <div class="geo-bar-track">
              <div class="geo-bar-fill" style="width:${Math.max(4, Math.round((dm.count / Math.max(...domains.slice(0, 12).map(x => x.count), 1)) * 100))}%"></div>
            </div>
            <div class="geo-bar-value">${dm.count}</div>
          </div>`).join('');
      }
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = `<div class="geo-dim-empty">加载失败: ${esc(e.message)}</div>`;
    }
  }

  // === 触发问题分析（v0.14 — 差距分析 P1）===
  // 按 query 聚合提及率：哪些提问触发了品牌被 AI 提及
  async function loadQueryTrigger(brands) {
    const container = _byId('geo-querytrigger-container');
    if (!container) return;
    if (!currentBrandId) {
      container.innerHTML = '<div class="geo-dim-empty">选择品牌后查看该品牌的触发问题分布</div>';
      return;
    }
    container.innerHTML = '<div class="geo-dim-empty">加载中...</div>';
    try {
      const brand = brands.find(b => b.id === currentBrandId);
      const [r, qRes] = await Promise.all([
        api('GET', `/api/geo/responses?brand_id=${currentBrandId}`),
        api('GET', '/api/geo/queries?brand_id=' + currentBrandId),
      ]);
      const responses = r.data?.responses || [];
      const qMap = {};
      (qRes.data?.queries || []).forEach(q => { if (q.id) qMap[q.id] = q.prompt || q.text || ''; });

      const brandName = (brand?.name || '').toLowerCase();
      const brandDomain = (brand?.domain || '').toLowerCase();
      // 按 query 分组
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
      if (rows.length === 0) {
        container.innerHTML = '<div class="geo-dim-empty">暂无数据。跑一次跟踪后分析。</div>';
        return;
      }
      const max = Math.max(...rows.map(g => g.rate), 0.01);
      container.innerHTML = rows.map(g => `
        <div class="geo-bar-row">
          <div class="geo-bar-label geo-tip" data-tip="${esc(g.prompt)}">${esc(g.prompt.slice(0, 34))}${g.prompt.length > 34 ? '...' : ''}</div>
          <div class="geo-bar-track">
            <div class="geo-bar-fill ${g.rate > 0 ? 'geo-trigger-fill' : 'geo-bar-fill-empty'}" style="width:${Math.max(4, Math.round((g.rate / max) * 100))}%"></div>
          </div>
          <div class="geo-bar-value">${(g.rate * 100).toFixed(0)}%</div>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = `<div class="geo-dim-empty">加载失败: ${esc(e.message)}</div>`;
    }
  }

  function renderDimGrid(components) {
    const grid = _byId('geo-dim-grid');
    if (!grid) return;
    if (!components) {
      grid.innerHTML = '<div class="geo-dim-empty">选择品牌后查看</div>';
      return;
    }
    // v0.26 C3: 新指标（自然发现分层）
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
    const tips = {
      mention_rate: '自然提及率：品牌名出现在「非品牌词」AI 回答中的比例（用户搜行业词时你被不被提）。50% 权重，核心指标',
      position_score: '位置分：品牌在回答中第一次出现的相对位置（词序号倒数）。越靠前 = 越容易被用户看到。15% 权重',
      context_score: '上下文分：品牌被提及时的上下文质量（「推荐」「最佳」= 高分；泛泛提及 = 低分；「差」「问题」= 扣分）。15% 权重',
      engine_consistency: '一致性：品牌在所有引擎中被一致提及的程度。只有 1 个引擎时无数据（null）',
      freshness: '时效性：最近 30 天内响应占比。越近 = 越高分',
      sov_natural: '自然 SoV：自然发现场景下品牌 vs 竞品的提及份额（品牌提及数 / (品牌+竞品) 提及数）。20% 权重',
      branded_mention_rate: '品牌搜索提及率：用户搜品牌名时，AI 回答里品牌被提的概率（品牌搜索覆盖）',
      branded_ratio: '品牌词占比：branded query 占全部 query 的比例',
    };
    grid.innerHTML = Object.entries(components).map(([k, v]) => `
      <div class="geo-dim-card geo-tip" data-tip="${tips[k] || labels[k] || k}">
        <div class="geo-dim-label">${labels[k] || k}</div>
        <div class="geo-dim-bar"><div class="geo-dim-fill${v == null ? ' geo-dim-fill-empty' : ''}" style="width:${v == null ? 0 : (v * 100).toFixed(0)}%"></div></div>
        <div class="geo-dim-value">${v == null ? '—' : (v * 100).toFixed(0) + '%'}</div>
      </div>
    `).join('');
  }

  function renderEngineGrid(engines, capabilities, gridEl) {
    const grid = gridEl || _byId('geo-engine-grid');
    if (!grid) return;
    const capMap = capabilities || {};
    const capBadge = (name) => {
      const s = capMap[name]?.search;
      if (s === 'native') return '<span class="geo-badge geo-badge-search" title="引擎自带联网搜索，回答基于实时检索">🔍 联网</span>';
      if (s === 'planned') return '<span class="geo-badge geo-badge-llm" title="官方支持联网搜索但适配器待改造，当前为裸模型回答">🧠 裸模型</span>';
      return '<span class="geo-badge geo-badge-llm" title="官方 API 无联网搜索参数，回答来自模型记忆">🧠 裸模型</span>';
    };
    grid.innerHTML = Object.entries(engines).map(([name, info]) => `
      <div class="geo-engine-card ${info.configured ? 'geo-engine-ok' : 'geo-engine-warn'} geo-tip" data-tip="${info.configured ? `已配置 ${info.model_name || ''}，可直接查询` : `未配置 API Key。去「系统管理 → AI 模型管理」添加 ${name} 的模型后自动生效`}">
        <div class="geo-engine-icon">${info.configured ? '✅' : '⚠️'}</div>
        <div class="geo-engine-name">${name} ${capBadge(name)}</div>
        <div class="geo-engine-status">${info.configured ? (info.model_name || 'OK') : '未配置'}</div>
      </div>
    `).join('');
  }

  // === Tab 2: 品牌管理 ===
  async function loadBrands() {
    setStatus('加载品牌...', 'loading');
    try {
      const r = await api('GET', '/api/geo/brands');
      const brands = r.data?.brands || [];
      renderBrandTable(brands);
      populateBrandSelector(brands);
      setStatus(`已加载 ${brands.length} 个品牌`, 'success');
    } catch (e) {
      setStatus('品牌加载失败: ' + e.message, 'error');
    }
  }

  function renderBrandTable(brands) {
    const tbody = _byId('geo-brand-tbody');
    if (!tbody) return;
    if (brands.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="geo-empty-cell">暂无品牌。点击右上"➕ 新建品牌"开始。</td></tr>';
      return;
    }
    tbody.innerHTML = brands.map(b => `
      <tr data-brand-id="${b.id}">
        <td><strong>${esc(b.name)}</strong></td>
        <td>${esc(b.domain)}</td>
        <td>${b.industry ? esc(b.industry) : '<span style="opacity:.45">—</span>'} <button class="geo-btn geo-btn-sm" title="设置行业（用于行业排名）" onclick="GEODashboard.editBrandIndustry('${b.id}', '${esc(b.industry || '')}')">🏷️</button></td>
        <td><span class="geo-badge geo-badge-${b.status === 'active' ? 'ok' : 'gray'}">${b.status}</span></td>
        <td>${(b.created_at || '').slice(0, 19).replace('T', ' ')}</td>
        <td>
          <button class="geo-btn geo-btn-sm" onclick="GEODashboard.selectBrand('${b.id}')">📊</button>
          <button class="geo-btn geo-btn-sm" onclick="GEODashboard.deleteBrand('${b.id}', '${esc(b.name)}')">🗑️</button>
        </td>
      </tr>
    `).join('');
  }

  async function editBrandIndustry(brandId, currentIndustry) {
    const result = await showModal({
      title: '🏷️ 设置行业',
      message: '行业用于计算「行业排名/指数」（同行业品牌自动成基准池）。例如：AI 工具 / 会展服务 / 教育培训',
      fields: [{ name: 'industry', label: '行业', type: 'text', value: currentIndustry || '' }],
      confirmText: '保存',
    });
    const industry = result?.industry;
    if (industry === undefined) return;
    const r = await api('PATCH', `/api/geo/brands/${brandId}`, { industry: industry.trim() });
    if (r.ok || r.data?.ok) {
      setStatus('行业已更新', 'success');
      await loadBrands();
    } else {
      setStatus('更新失败', 'error');
    }
  }

  function populateBrandSelector(brands) {
    const select = _byId('geo-brand-select');
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = '<option value="">— 所有品牌 —</option>' +
      brands.map(b => `<option value="${b.id}">${esc(b.name)} (${esc(b.domain)})</option>`).join('');
    select.value = currentValue || '';
  }

  async function selectBrand(brandId) {
    currentBrandId = brandId;
    switchTab('overview');
    // v0.30: 显隐别名编辑按钮 — 默认 disabled（灰色 + tooltip 提示），选具体品牌才启用
    // 选「所有品牌」时按钮可见但不可点（让用户知道功能存在 + 知道怎么启用）
    const aliasBtn = _byId('geo-brand-alias-btn');
    if (aliasBtn) {
      if (brandId) {
        aliasBtn.disabled = false;
        aliasBtn.title = '编辑当前品牌别名（缩写/常用名）';
        aliasBtn.dataset.brandId = brandId;
      } else {
        aliasBtn.disabled = true;
        aliasBtn.title = '请先在左侧选一个具体品牌，再点 ✎ 别名 编辑别名（缩写/常用名）';
        aliasBtn.dataset.brandId = '';
      }
    }
    await loadOverview();
  }

  // v0.30: 编辑当前品牌别名（治「一个品牌多个名字漏匹配」 — 用户随时补别名）
  async function editBrandAliases() {
    const aliasBtn = _byId('geo-brand-alias-btn');
    const brandId = aliasBtn?.dataset.brandId;
    if (!brandId) return;
    // 拉最新 brand（含 aliases）
    setStatus('加载品牌信息...', 'loading');
    const r = await api('GET', `/api/geo/brands/${brandId}`);
    if (!r.data?.ok) {
      setStatus('加载失败: ' + (r.data?.error || r.status), 'error');
      return;
    }
    const brand = r.data.brand;
    const currentAliases = Array.isArray(brand.aliases) ? brand.aliases : [];

    // html 模式：自己渲染 textarea + 实时预览（清洗后的别名）
    // 用 actions 区分按钮（v0.27 坑：ACMSModal 不支持 textarea 字段，必须自己读 DOM）
    const safeName = esc(brand.name);
    const initialText = currentAliases.join('、');
    const html = `
      <div class="geo-alias-edit">
        <div class="geo-alias-edit-hint">
          <strong>${safeName}</strong> 的其他常用名称。<br>
          例如品牌「中展集团」可填：<code>中展</code> <code>CIEC</code> <code>中展股份</code>。<br>
          用于 AI 引擎回答里的 mention 检测（治「AI 只提简称/全称」的漏匹配）。
        </div>
        <textarea id="geo-alias-edit-input" class="geo-alias-edit-textarea"
          placeholder="多个别名用「、」或「,」分隔">${esc(initialText)}</textarea>
        <div class="geo-alias-edit-preview" id="geo-alias-edit-preview">
          保存后将以 <strong id="geo-alias-edit-count">${currentAliases.length}</strong> 个别名参与评分
        </div>
        <div class="geo-alias-edit-actions">
          <button class="geo-btn geo-btn-sm" data-action="ai" style="margin-right:auto">🧠 AI 推断</button>
          <span style="font-size:11px;color:var(--geo-text-2)">≤6 条，去重 + 子串压扁</span>
        </div>
      </div>
    `;
    const result = await showModal({
      title: '✎ 编辑品牌别名',
      html,
      size: 'md',
      actions: [
        { label: '取消', value: null, className: 'geo-btn' },
        { label: '保存', value: 'SAVE', className: 'geo-btn geo-btn-primary' },
      ],
    });

    // AI 推断按钮（在 modal 内部触发 — 弹回新模态覆盖在原模态上）
    if (result !== null) {
      // 走 ai 按钮的会在 result 之前自己处理；result 走 SAVE 或 null
    }
    if (result !== 'SAVE') {
      // 检查是否 AI 推断按钮触发了关闭（result === null 但 AI 已处理过）
      // 通过 DOM 检查 _aliasAiApplied 标记避免重做
      if (window._aliasAiApplied && window._aliasAiApplied[brandId]) {
        delete window._aliasAiApplied[brandId];
      }
      return;
    }

    // 读 DOM 拿 textarea 内容（ACMSModal html 模式不会回传字段值，必须自己读）
    const root = wRef?.$c || document;
    const input = root.querySelector('#geo-alias-edit-input');
    if (!input) return;
    const raw = input.value || '';
    // 多种分隔符兼容（、 , ，）
    const aliases = raw.split(/[、,,，]/).map(s => s.trim()).filter(Boolean);

    // 乐观更新本地预览 + 实际保存
    setStatus('保存别名...', 'loading');
    const saveRes = await api('PATCH', `/api/geo/brands/${brandId}`, { aliases });
    if (saveRes.data?.ok) {
      const saved = Array.isArray(saveRes.data.brand?.aliases) ? saveRes.data.brand.aliases : [];
      setStatus(`已保存 ${saved.length} 个别名`, 'success');
      notify(`✎ ${brand.name} 别名已更新 (${saved.length} 条)`, 'success');
      // 重新渲染 overview（mention_rate 立即反映新别名）
      await loadOverview();
    } else {
      setStatus('保存失败: ' + (saveRes.data?.error || saveRes.status), 'error');
      notify('✎ 别名保存失败', 'error');
    }
  }

  // v0.30: AI 推断别名（轻量 LLM 调用 — POST /api/geo/brands/:id/infer-aliases）
  // modal 内「🧠 AI 推断」按钮触发
  async function inferAliasesViaAI() {
    const aliasBtn = _byId('geo-brand-alias-btn');
    const brandId = aliasBtn?.dataset.brandId;
    if (!brandId) return;
    setStatus('AI 推断别名中...', 'loading');
    const root = wRef?.$c || document;
    const input = root.querySelector('#geo-alias-edit-input');
    const preview = root.querySelector('#geo-alias-edit-preview');
    const countEl = root.querySelector('#geo-alias-edit-count');
    const r = await api('POST', `/api/geo/brands/${brandId}/infer-aliases`);
    if (r.data?.ok) {
      const inferred = r.data.inferred || [];
      const existing = (input.value || '').split(/[、,,，]/).map(s => s.trim()).filter(Boolean);
      // 合并去重 — 用户已有 + AI 新增
      const merged = [...new Set([...existing, ...inferred])];
      if (input) input.value = merged.join('、');
      if (preview) preview.innerHTML = `AI 已推断 <strong>${inferred.length}</strong> 个新别名（合并后共 <strong id="geo-alias-edit-count">${merged.length}</strong> 条，已写入下方输入框，点击「保存」生效）`;
      setStatus(`AI 推断 ${inferred.length} 个别名`, 'success');
      notify(`🧠 ${inferred.length} 个新别名已填入（点击保存生效）`, 'success');
    } else {
      setStatus('AI 推断失败: ' + (r.data?.error || r.status), 'error');
      notify('🧠 AI 推断失败: ' + (r.data?.message || r.data?.error || ''), 'error');
    }
  }

  async function deleteBrand(brandId, name) {
    const result = await showModal({
      title: '🗑️ 删除品牌',
      message: `确认删除品牌「${name}」？\n\n这会级联删除所有关联的 queries / responses / scores / snapshots。\n此操作不可撤销。`,
      fields: [],
      actions: [
        { label: '取消', value: null, className: 'geo-btn' },
        { label: '确认删除', value: 'DELETE', className: 'geo-btn geo-btn-primary' },
      ],
    });
    if (result !== 'DELETE') return;
    setStatus('删除中...', 'loading');
    const r = await api('DELETE', `/api/geo/brands/${brandId}`);
    if (r.ok) {
      setStatus('已删除', 'success');
      await loadBrands();
    } else {
      setStatus('删除失败: ' + (r.data?.error || r.status), 'error');
    }
  }

  async function createBrand() {
    // v0.26 C7: 加「自动生成 prompts」选项（简化版 onboarding — 创建后 LLM 自动生成短查询）
    const result = await showModal({
      title: '➕ 新建品牌',
      message: '添加一个要追踪 GEO 表现的品牌。',
      fields: [
        { name: 'name', label: '品牌名称', placeholder: '例如：MiniMax', required: true },
        { name: 'domain', label: '域名', placeholder: '例如：minimax.com', required: true },
        { name: 'auto_generate', label: '自动生成提问模板', type: 'checkbox' },
      ],
    });
    if (!result || !result.name || !result.domain) return;
    setStatus('创建中...', 'loading');
    const r = await api('POST', '/api/geo/brands', {
      name: result.name,
      domain: result.domain,
      auto_generate_prompts: !!result.auto_generate,
    });
    if (r.data?.ok) {
      setStatus(`已创建: ${r.data.brand.name}`, 'success');
      notify(`🏢 品牌「${r.data.brand.name}」已创建`, 'success');
      // v0.26 C7: 提示 AI 生成结果
      const autoGen = r.data.auto_generated_prompts;
      if (autoGen?.ok) {
        notify(`🧠 已自动生成 ${autoGen.count} 个提问模板`, 'success');
      } else if (autoGen && !autoGen.ok) {
        notify(`🧠 自动生成模板失败: ${autoGen.error}`, 'warning');
      }
      await loadBrands();
    } else {
      await showModal({
        title: '❌ 创建失败',
        message: r.data?.error || '未知错误',
        fields: [],
        actions: [{ label: '关闭', value: null, className: 'geo-btn' }],
      });
    }
  }

  // v0.26 C7 完整版: Onboarding 向导（借鉴 elmo analyze/apply + 三段式 Review）
  // 流程：选品牌 → Analyze（LLM 10-30 秒 loading）→ Review（品牌/竞品/模板三段式编辑）→ Apply（保存+提示）
  async function openOnboardingWizard() {
    // 1. 选品牌
    const brandsRes = await api('GET', '/api/geo/brands');
    const brands = brandsRes.data?.brands || [];
    if (brands.length === 0) {
      await showModal({ title: '提示', message: '还没有品牌。先点「➕ 新建品牌」创建。' });
      return;
    }
    const pick = await showModal({
      title: '🚀 Onboarding 向导',
      message: '选择要分析的品牌（LLM 自动识别品牌别名、竞品和提问模板，约 10-30 秒）：',
      fields: [
        {
          name: 'brand_id', label: '品牌', required: true, type: 'select',
          value: currentBrandId || brands[0]?.id || '',
          options: brands.map(b => ({ value: b.id, label: `${b.name} (${b.domain})` })),
        },
      ],
      actions: [
        { label: '取消', value: null },
        { label: '开始分析', value: 'SUBMIT', className: 'acms-modal-btn acms-modal-btn-primary' },
      ],
    });
    if (!pick?.brand_id) return;

    // 2. Analyze（loading）
    setStatus('🧠 分析品牌中（10-30 秒）...', 'loading');
    const analyzeRes = await api('POST', '/api/geo/onboarding/analyze', { brand_id: pick.brand_id });
    if (!analyzeRes.data?.ok) {
      setStatus('分析失败: ' + (analyzeRes.data?.message || analyzeRes.data?.error || ''), 'error');
      return;
    }
    setStatus('分析完成，请确认', 'success');
    const data = analyzeRes.data.data;
    const brand = brands.find(b => b.id === pick.brand_id);

    // 3. Review（三段式 html modal）
    const reviewHtml = buildOnboardingReviewHtml(brand, data);
    await showModal({
      title: `🚀 Onboarding 向导 — ${brand?.name || ''}`,
      html: reviewHtml,
      size: 'xl',
    });

    // 4. 绑定 Apply
    const applyBtn = (wRef?.$c || document).querySelector('#geo-onboarding-apply-btn');
    if (applyBtn) {
      applyBtn.onclick = async () => {
        const collected = collectOnboardingForm(pick.brand_id);
        setStatus('保存中...', 'loading');
        const r = await api('POST', '/api/geo/onboarding/apply', { brand_id: pick.brand_id, data: collected });
        if (r.data?.ok) {
          setStatus(`✅ 已保存: ${r.data.prompts_count} 个模板 + ${r.data.competitors_created} 个竞品`, 'success');
          notify('🚀 Onboarding 完成', 'success');
          // 关闭 modal + 刷新
          document.querySelector('.acms-modal-overlay')?.remove();
          await loadBrands();
          if (currentBrandId === pick.brand_id) await loadOverview();
          switchTab('queries');
          loadQueries();
        } else {
          setStatus('保存失败: ' + (r.data?.error || ''), 'error');
        }
      };
    }
  }

  // 构造三段式 Review HTML
  function buildOnboardingReviewHtml(brand, data) {
    const brandName = data.brandName || brand?.name || '';
    const aliases = (data.aliases || []).join(', ');
    const addDomains = (data.additionalDomains || []).join(', ');
    // 竞品行（checkbox + name + domains 可编辑）
    const compRows = (data.competitors || []).map((c, i) => `
      <div class="geo-obo-row" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed var(--geo-border,#333)">
        <input type="checkbox" class="geo-obo-comp-check" data-idx="${i}" checked style="accent-color:#6366f1">
        <input class="geo-obo-comp-name" data-idx="${i}" value="${esc(c.name)}" style="flex:1;min-width:0;background:var(--bg,rgba(255,255,255,.05));border:1px solid var(--geo-border,#555);border-radius:4px;padding:4px 8px;color:var(--geo-text,#eee);font-size:12px">
        <input class="geo-obo-comp-domain" data-idx="${i}" value="${esc((c.domains || []).join('、'))}" title="域名（、分隔）" placeholder="域名" style="flex:1.2;min-width:0;background:var(--bg,rgba(255,255,255,.05));border:1px solid var(--geo-border,#555);border-radius:4px;padding:4px 8px;color:var(--geo-text,#eee);font-size:12px">
      </div>
    `).join('') || '<div style="color:var(--geo-text-2,#888);font-size:12px;padding:8px 0">未识别到竞品</div>';
    // prompts 行（checkbox + 文本 + tags 可编辑）
    const promptRows = (data.suggestedPrompts || []).map((p, i) => `
      <div class="geo-obo-row" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed var(--geo-border,#333)">
        <input type="checkbox" class="geo-obo-prompt-check" data-idx="${i}" checked style="accent-color:#6366f1">
        <input class="geo-obo-prompt-text" data-idx="${i}" value="${esc(p.prompt)}" style="flex:2;min-width:0;background:var(--bg,rgba(255,255,255,.05));border:1px solid var(--geo-border,#555);border-radius:4px;padding:4px 8px;color:var(--geo-text,#eee);font-size:12px">
        <input class="geo-obo-prompt-tags" data-idx="${i}" value="${esc((p.tags || []).join('、'))}" placeholder="标签（、分隔）" title="标签（、分隔）" style="flex:1;min-width:0;background:var(--bg,rgba(255,255,255,.05));border:1px solid var(--geo-border,#555);border-radius:4px;padding:4px 8px;color:var(--geo-text,#eee);font-size:12px">
      </div>
    `).join('') || '<div style="color:var(--geo-text-2,#888);font-size:12px;padding:8px 0">未识别到模板</div>';

    return `
      <div style="display:flex;flex-direction:column;gap:16px;font-size:13px">
        <div style="background:var(--bg,rgba(255,255,255,.04));border:1px solid var(--geo-border,#333);border-radius:8px;padding:12px">
          <div style="font-weight:600;margin-bottom:8px">📄 品牌信息</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--geo-text-2,#888)">规范化名称
              <input id="geo-obo-name" value="${esc(brandName)}" style="width:160px;background:var(--bg,rgba(255,255,255,.05));border:1px solid var(--geo-border,#555);border-radius:4px;padding:4px 8px;color:var(--geo-text,#eee);font-size:12px">
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--geo-text-2,#888)">域名（只读）
              <input value="${esc(brand?.domain || '')}" readonly style="width:160px;background:var(--bg,rgba(255,255,255,.02));border:1px solid var(--geo-border,#333);border-radius:4px;padding:4px 8px;color:var(--geo-text-2,#888);font-size:12px">
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--geo-text-2,#888)">别名（、分隔 — mention 检测用）
              <input id="geo-obo-aliases" value="${esc(aliases)}" placeholder="中展、CIEC" style="width:220px;background:var(--bg,rgba(255,255,255,.05));border:1px solid var(--geo-border,#555);border-radius:4px;padding:4px 8px;color:var(--geo-text,#eee);font-size:12px">
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--geo-text-2,#888)">其他域名（、分隔）
              <input id="geo-obo-domains" value="${esc(addDomains)}" placeholder="ciec.cn" style="width:200px;background:var(--bg,rgba(255,255,255,.05));border:1px solid var(--geo-border,#555);border-radius:4px;padding:4px 8px;color:var(--geo-text,#eee);font-size:12px">
            </label>
          </div>
        </div>
        <div style="background:var(--bg,rgba(255,255,255,.04));border:1px solid var(--geo-border,#333);border-radius:8px;padding:12px">
          <div style="font-weight:600;margin-bottom:4px">🏢 竞品（LLM 自动识别）</div>
          <div style="font-size:11px;color:var(--geo-text-2,#888);margin-bottom:6px">勾选 = 加入 Watch 对比；名称/域名可编辑</div>
          ${compRows}
        </div>
        <div style="background:var(--bg,rgba(255,255,255,.04));border:1px solid var(--geo-border,#333);border-radius:8px;padding:12px">
          <div style="font-weight:600;margin-bottom:4px">💬 提问模板（LLM 建议 ${(data.suggestedPrompts || []).length} 个）</div>
          <div style="font-size:11px;color:var(--geo-text-2,#888);margin-bottom:6px">勾选 = 加入模板库；文本/标签可编辑。短搜索片段（用户真实输入风格）</div>
          ${promptRows}
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;align-items:center">
          <button type="button" class="geo-btn" onclick="document.querySelector('.acms-modal-overlay')?.remove()">取消</button>
          <button type="button" class="geo-btn geo-btn-primary" id="geo-onboarding-apply-btn">🚀 开始跟踪（${(data.suggestedPrompts || []).length} 个模板）</button>
        </div>
      </div>
    `;
  }

  // 收集 Review 表单 → apply 数据
  function collectOnboardingForm(brandId) {
    const root = wRef?.$c || document;
    const name = root.querySelector('#geo-obo-name')?.value.trim() || '';
    const aliases = (root.querySelector('#geo-obo-aliases')?.value || '').split(/[，,、]/).map(s => s.trim()).filter(Boolean);
    const addDomains = (root.querySelector('#geo-obo-domains')?.value || '').split(/[，,、]/).map(s => s.trim()).filter(Boolean);
    // 竞品
    const competitors = [];
    root.querySelectorAll('.geo-obo-comp-check').forEach(cb => {
      if (!cb.checked) return;
      const i = cb.dataset.idx;
      const name = root.querySelector(`.geo-obo-comp-name[data-idx="${i}"]`)?.value.trim() || '';
      const domains = (root.querySelector(`.geo-obo-comp-domain[data-idx="${i}"]`)?.value || '').split(/[，,、]/).map(s => s.trim()).filter(Boolean);
      if (name) competitors.push({ name, domains, aliases: [] });
    });
    // prompts
    const suggestedPrompts = [];
    root.querySelectorAll('.geo-obo-prompt-check').forEach(cb => {
      if (!cb.checked) return;
      const i = cb.dataset.idx;
      const prompt = root.querySelector(`.geo-obo-prompt-text[data-idx="${i}"]`)?.value.trim() || '';
      const tags = (root.querySelector(`.geo-obo-prompt-tags[data-idx="${i}"]`)?.value || '').split(/[，,、]/).map(s => s.trim()).filter(Boolean);
      if (prompt) suggestedPrompts.push({ prompt, tags });
    });
    return { brandName: name, additionalDomains: addDomains, aliases, competitors, suggestedPrompts };
  }

  // === Tab 4: 追踪记录 ===
  let _trackResponses = []; // v0.13: 缓存当前追踪记录（回答快照浏览用）
  let _queryMap = {};       // query_id → prompt 文本
  let _brandMap = {};       // v0.27: brand_id → brand 对象（responses 只存 brand_id，渲染品牌名/域名/高亮用映射）
  let _trackEngineFilter = ''; // v0.26: 引擎 filter 值（来自 geo-filter-bar 组件）

  // v0.26: 初始化 Track Tab 引擎 filter bar（chip 风格，替代原 <select>）
  function renderTrackFilterBar() {
    const engineOptions = [
      { value: '', label: '所有引擎' },
      { value: 'deepseek', label: 'deepseek' },
      { value: 'deepseek-web', label: 'deepseek-web 🔍' }, // v0.1: 网页版引擎（browser-agent）
      { value: 'openai', label: 'openai' },
      { value: 'claude', label: 'claude' },
      { value: 'perplexity', label: 'perplexity' },
      { value: 'gemini', label: 'gemini' },
      { value: 'copilot', label: 'copilot' },
      { value: 'grok', label: 'grok' },
      { value: 'minimax', label: 'minimax' },
    ];
    renderGeoFilterBar('geo-track-engine-filterbar', [
      {
        key: 'engine',
        label: '引擎',
        icon: '🔍',
        type: 'single',
        value: _trackEngineFilter,
        options: engineOptions,
        onChange: (val) => {
          _trackEngineFilter = val;
          loadTracks();
        },
      },
    ]);
  }

  async function loadTracks() {
    // v0.26: 确保 filter bar 已渲染（首次进 Tab 时）
    renderTrackFilterBar();
    setStatus('加载追踪记录...', 'loading');
    try {
      const url = currentBrandId
        ? `/api/geo/responses?brand_id=${currentBrandId}&engine=${_trackEngineFilter}`
        : `/api/geo/responses?engine=${_trackEngineFilter}`;
      const [r, qRes, bRes] = await Promise.all([
        api('GET', url),
        api('GET', '/api/geo/queries' + (currentBrandId ? '?brand_id=' + currentBrandId : '')),
        api('GET', '/api/geo/brands'),
      ]);
      _trackResponses = r.data?.responses || [];
      _queryMap = {};
      (qRes.data?.queries || []).forEach(q => { if (q.id) _queryMap[q.id] = q.prompt || q.text || ''; });
      _brandMap = {};
      (bRes.data?.brands || []).forEach(b => { if (b.id) _brandMap[b.id] = b; });
      renderTrackTable(_trackResponses);
      setStatus(`已加载 ${_trackResponses.length} 条记录`, 'success');
    } catch (e) {
      setStatus('追踪记录加载失败: ' + e.message, 'error');
    }
  }

  function renderTrackTable(responses) {
    const tbody = _byId('geo-track-tbody');
    if (!tbody) return;
    if (responses.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="geo-empty-cell">暂无数据。点击"▶ 跑一次跟踪"开始。</td></tr>';
      return;
    }
    tbody.innerHTML = responses.slice(0, 100).map((r, i) => {
      const dt = new Date(r.ts || 0).toLocaleString('zh-CN', { hour12: false });
      const status = r.error ? `<span class="geo-badge geo-badge-err">❌ ${esc(r.error)}</span>` : '<span class="geo-badge geo-badge-ok">✅ OK</span>';
      const langMap = { zh: '中文', en: 'EN', th: 'ไทย', ja: '日', ko: '한', vi: 'VI', id: 'ID', ms: 'MS', fr: 'FR', de: 'DE', es: 'ES', ru: 'RU', ar: 'AR', pt: 'PT' };
      const langLabel = langMap[r.language] || r.language || 'zh';
      // v0.25: 引擎联网能力徽章（native=🔍 真联网 / 其余=🧠 裸模型）
      // v0.26: Claude + OpenAI 升级到 web_search tool → native（之前 planned）
      const engineCap = { perplexity: 'native', deepseek: 'none', openai: 'native', google: 'planned', claude: 'native', grok: 'planned', copilot: 'none', 'deepseek-web': 'native' };
      const capMark = engineCap[r.engine] === 'native' ? ' 🔍' : ' 🧠';
      const queryText = _queryMap[r.query_id] || r.query || '(模板已删)';
      const answerText = r.raw_answer || '';
      return `
        <tr>
          <td>${dt}</td>
          <td>${esc(_brandMap[r.brand_id]?.name || r.brand_name || r.brand_id)}</td>
          <td><span class="geo-badge geo-badge-${r.engine}">${esc(r.engine)}${capMark}</span></td>
          <td><span class="geo-lang-badge" title="语言: ${esc(r.language || 'zh')}">${esc(langLabel)}</span></td>
          <td title="${esc(queryText)}">${esc(queryText.slice(0, 60))}${queryText.length > 60 ? '...' : ''}</td>
          <td>${status}</td>
          <td>${r.latency_ms || 0}ms</td>
          <td>${r.usage?.total_tokens || 0}</td>
          <td><a href="javascript:void(0)" class="geo-track-open" data-idx="${i}" title="点击查看完整回答">${esc(answerText.slice(0, 40))}${answerText.length > 40 ? '... 🔍' : ''}</a></td>
        </tr>
      `;
    }).join('');
  }

  // v0.13: 回答快照浏览（弹窗显示完整 AI 回答 + 元数据）
  // v0.26: 升级 — 借鉴 elmo text-highlighter，高亮品牌名（蓝）/品牌域名（绿）
  // v0.26: 升级 — 借鉴 elmo fanout-sections.tsx，底部加 Query Fan-out 段（仅当 r.web_queries > 0 时显示）
  async function viewResponseDetail(idx) {
    const r = _trackResponses[idx];
    if (!r) return;
    const meta = [
      `🕐 ${new Date(r.ts || 0).toLocaleString('zh-CN', { hour12: false })}`,
      `🤖 引擎: ${r.engine || '—'}${r.model ? ' / ' + r.model : ''}`,
      `⏱ 耗时: ${r.latency_ms || 0}ms`,
      `🔢 Tokens: ${r.usage?.total_tokens || 0}`,
      r.error ? `❌ 错误: ${r.error}` : '✅ 成功',
      r.query_id ? `# ${r.query_id}` : '',
    ].filter(Boolean).join('　');
    const qText = _queryMap[r.query_id] || r.query || '（模板已删）';
    const answer = r.raw_answer || '（空）';
    // v0.27: 品牌名/域名从 brandMap 取（responses 只存 brand_id，后端不存 name/domain）
    const brand = _brandMap[r.brand_id] || {};
    const brandName = brand.name || r.brand_name || '';
    const brandDomain = brand.domain || r.brand_domain || '';
    // 构造高亮列表：品牌名（蓝）、品牌域名（绿）
    const highlights = [];
    if (brandName && brandName.trim()) {
      highlights.push({
        text: brandName,
        style: 'background:#dbeafe;color:#1e3a8a;padding:0 2px;border-radius:2px;font-weight:600',
      });
    }
    if (brandDomain && brandDomain.trim()) {
      highlights.push({
        text: brandDomain,
        style: 'background:#dcfce7;color:#14532d;padding:0 2px;border-radius:2px',
      });
    }
    // v0.27: 完整回答按 Markdown 渲染（复用 ACMS 全局 renderMarkdown，md-content 样式排版）
    //   先 renderMarkdown 得到已转义的 HTML，再对品牌名/域名做高亮（安全替换，品牌名不含 HTML 特殊字符）
    let answerHtml;
    if (typeof renderMarkdown === 'function') {
      answerHtml = renderMarkdown(answer.slice(0, 12000));
      for (const h of highlights) {
        const safe = esc(String(h.text));
        if (!safe.trim()) continue;
        const re = new RegExp('(' + safe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        answerHtml = answerHtml.replace(re, `<mark style="${h.style}">$1</mark>`);
      }
    } else {
      answerHtml = highlightText(answer.slice(0, 12000), highlights);
    }
    // 拼接完整 HTML（meta + 提问 + 完整回答 + Query Fan-out + 预览按钮）
    const body = `
      <div style="font-size:12px;opacity:.7;margin-bottom:10px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">${esc(meta)}${createInfoTip('元信息：本次追踪的时间、AI 引擎、耗时、token 消耗。点击摘要可查看完整 AI 回答。')}</div>
      <div style="background:var(--bg,rgba(255,255,255,0.04));border-left:3px solid var(--accent1,#0ea89d);padding:8px 12px;border-radius:0 6px 6px 0;margin-bottom:12px">
        <div style="font-size:11px;opacity:.6;margin-bottom:4px">【提问】</div>
        <div style="font-size:13px;line-height:1.5">${esc(qText)}</div>
      </div>
      <div style="font-size:11px;opacity:.6;margin-bottom:4px">【完整回答】${answer.length > 12000 ? '（已截断到 12000 字）' : ''}</div>
      <div class="md-content" style="font-size:13px;line-height:1.65;max-height:60vh;overflow-y:auto">${answerHtml}</div>
      <div id="geo-fanout-section" data-prompt="${esc(qText)}" data-raw='${esc(JSON.stringify(r.web_queries || []))}'></div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--geo-border,#333);display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button type="button" id="geo-fanout-preview-btn" class="geo-btn geo-btn-sm" style="font-size:11px" title="前端 mock 数据预览 fanout 组件（不写入数据库）">🧪 注入预览 web_queries（仅前端）</button>
        <span style="font-size:11px;opacity:.6">v0.26 借鉴 elmo fanout-sections</span>
      </div>
    `;
    await showModal({
      title: `📄 AI 回答快照 — ${esc(brandName || r.brand_id)}`,
      html: body,
      size: 'xl',
    });
    // 渲染 fanout section（如果在 modal 里的元素能找到）
    const fanoutEl = (wRef?.$c || document).querySelector('#geo-fanout-section');
    if (fanoutEl) {
      renderFanoutSection(fanoutEl, qText, r.web_queries || []);
      // 绑定预览按钮
      const previewBtn = (wRef?.$c || document).querySelector('#geo-fanout-preview-btn');
      if (previewBtn) {
        previewBtn.onclick = () => {
          const mockQueries = generateMockWebQueries(qText, r.engine);
          renderFanoutSection(fanoutEl, qText, mockQueries, true);
          previewBtn.textContent = '🔄 重新生成预览';
        };
      }
    }
  }

  // v0.26: Query Fan-out 分析函数（借鉴 elmo fanout-sections.tsx）
  function normTok(w) {
    return String(w || '').toLowerCase().replace(/[^\w一-龥]/g, '');
  }

  function extractKeywords(prompt) {
    return new Set(
      String(prompt || '').split(/\s+/).filter(Boolean)
        .map(normTok)
        .filter(w => w.length > 1)
    );
  }

  function analyzeFanout(queries, prompt) {
    const keywords = extractKeywords(prompt);
    const counter = new Map();
    for (const q of queries) {
      const t = String(q || '').toLowerCase().trim();
      if (t.length >= 3) counter.set(t, (counter.get(t) || 0) + 1);
    }
    const variations = [...counter.entries()]
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count);
    const queryWords = new Map();
    for (const v of variations) {
      for (const w of v.query.split(/\s+/).filter(Boolean)) {
        const t = normTok(w);
        if (t && t.length > 1) queryWords.set(t, (queryWords.get(t) || 0) + 1);
      }
    }
    const total = variations.length || 1;
    const added = [], preserved = [];
    const queryWordsSet = new Set(queryWords.keys());
    for (const [w, c] of queryWords) {
      const share = Math.round((c / total) * 100);
      if (keywords.has(w)) preserved.push({ word: w, count: c, share });
      else added.push({ word: w, count: c, share });
    }
    const dropped = [];
    for (const kw of keywords) {
      if (!queryWordsSet.has(kw)) dropped.push({ word: kw, count: 0, share: 0 });
    }
    added.sort((a, b) => b.count - a.count);
    preserved.sort((a, b) => b.count - a.count);
    return { variations, added: added.slice(0, 12), preserved: preserved.slice(0, 12), dropped: dropped.slice(0, 12), keywords };
  }

  // 渲染 fanout section（挂在 geo-fanout-section 容器里）
  function renderFanoutSection(container, prompt, queries, isPreview = false) {
    if (!container) return;
    if (!queries || queries.length === 0) {
      container.innerHTML = `
        <div class="geo-fanout" style="margin-top:16px">
          <div class="geo-fanout-header">
            <div class="geo-fanout-title">
              🛰️ Query Fan-out
              <span class="geo-fanout-pill">v0.26</span>
              ${isPreview ? '' : '<span class="geo-fanout-preview-badge">无数据</span>'}
            </div>
          </div>
          <div class="geo-fanout-empty">
            📭 该 AI 引擎未返回 grounding 时的搜索 query 列表<br>
            <span style="font-size:11px">（Perplexity 公开 API 不暴露 search query 文本；OpenAI/Claude 当前走裸 LLM，未启用 web_search 工具）</span><br>
            <span style="font-size:11px;margin-top:6px;display:inline-block">💡 点击下方「🧪 注入预览」按钮可看组件效果</span>
          </div>
        </div>
      `;
      return;
    }
    const f = analyzeFanout(queries, prompt);
    const keywordSet = f.keywords;
    const variationsHtml = f.variations.map(v => {
      const segs = v.query.split(/\s+/).filter(Boolean).map(w => {
        const t = normTok(w);
        return t && keywordSet.has(t)
          ? `<span class="kw">${esc(w)}</span>`
          : `<span class="non-kw">${esc(w)}</span>`;
      }).join(' ');
      return `
        <div class="geo-fanout-variation">
          <div class="geo-fanout-variation-text">${segs}</div>
          <div class="geo-fanout-variation-count" title="该 query 出现次数">${v.count}×</div>
        </div>
      `;
    }).join('');
    const renderCol = (title, items, type) => {
      if (items.length === 0) return `<div class="geo-fanout-words-col ${type}"><div class="geo-fanout-words-title">${title}</div><div style="font-size:11px;color:var(--geo-text-2,#888);padding:4px">（无）</div></div>`;
      return `<div class="geo-fanout-words-col ${type}">
        <div class="geo-fanout-words-title">${title}</div>
        ${items.map(w => `<span class="geo-fanout-word">${esc(w.word)}<span class="share">${w.share || 0}%</span></span>`).join('')}
      </div>`;
    };
    container.innerHTML = `
      <div class="geo-fanout">
        <div class="geo-fanout-header">
          <div class="geo-fanout-title">
            🛰️ Query Fan-out
            <span class="geo-fanout-pill">${queries.length} queries</span>
            ${isPreview ? '<span class="geo-fanout-preview-badge">预览数据</span>' : ''}
            ${createInfoTip('Query Fan-out：AI 引擎在生成回答时，**内部**会跑多次 web 搜索（grounding）。这些搜索 query 通常与用户原始 prompt 不同 — 引擎会改写、加词、减词。\n\n通过对比 prompt vs 引擎改写后的 queries，可以看到：\n• Added（加的）：AI 引擎为了找更好答案主动加的词（如年份、对比、限定词）\n• Preserved（保留的）：从 prompt 留下来的核心词\n• Dropped（丢的）：prompt 里有但 AI 没用的词\n\n**当前限制**：大多数 AI 引擎 API 不向客户端返回这些 queries（Perplexity 公开 API 只返 citations URL；OpenAI/Claude 当前走裸 LLM，未启用 web_search 工具）。本组件已就绪，引擎升级 grounding 后自动有数据。')}
          </div>
        </div>
        <div style="font-size:11px;color:var(--geo-text-2,#888);margin-bottom:8px">AI 引擎在 grounding 时跑了哪些 web 搜索（prompt 关键词<span style="color:var(--geo-text,#eee);font-weight:600">加粗</span>）</div>
        ${variationsHtml}
        <div class="geo-fanout-words">
          ${renderCol('➕ Added 引擎加的', f.added, 'added')}
          ${renderCol('✓ Preserved 保留的', f.preserved, 'preserved')}
          ${renderCol('✗ Dropped 引擎丢的', f.dropped, 'dropped')}
        </div>
        <div class="geo-fanout-note">
          ℹ️ 数据基础：AI 引擎在生成回答时内部跑的 web search queries。当前大多数引擎（OpenAI Chat Completions、Claude Messages、Perplexity Chat Completions）不向 API 返回这些 queries；只有启用 web_search 工具（OpenAI Responses API / Claude web_search_20250305）或使用 Scraper API 才能拿到。
        </div>
      </div>
    `;
  }

  // v0.26: Mock web_queries 生成（仅前端预览，不写入数据库）
  // 基于 prompt 关键词 + 引擎特性生成 5-10 个变体 query
  function generateMockWebQueries(prompt, engine) {
    const p = String(prompt || '').trim();
    if (!p) return [];
    // 拆 prompt 关键词
    const words = p.split(/\s+/).filter(w => w.length > 1);
    const base = words.slice(0, Math.min(5, words.length)).join(' ');
    // 不同引擎典型改写模式
    const patterns = {
      perplexity: [
        `${base} 2026`,
        `${base} 评测`,
        `${base} vs 替代品`,
        `best ${base}`,
        `${base} review`,
        `${base} 对比`,
        `what is ${base}`,
        `${base} 2026 推荐`,
      ],
      openai: [
        `${base} official`,
        `${base} 官网`,
        `${base} 介绍`,
        `tell me about ${base}`,
        `${base} 怎么选`,
      ],
      claude: [
        `${base} 分析`,
        `${base} 详细`,
        `${base} 历史`,
        `explain ${base}`,
        `${base} 比较`,
      ],
      deepseek: [
        `${base} 价格`,
        `${base} 怎么样`,
        `${base} 推荐`,
        `${base} 深度`,
      ],
    };
    const engineKey = (engine || 'openai').toLowerCase();
    const pool = patterns[engineKey] || patterns.openai;
    // 返回 5-7 个 mock queries（每个出现 1-3 次）
    const out = [];
    const picks = pool.slice(0, 5 + Math.floor(Math.random() * 3));
    for (const q of picks) {
      const count = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) out.push(q);
    }
    return out;
  }

  async function runTracker() {
    if (!currentBrandId) {
      await showModal({ title: '提示', message: '请先在顶部下拉选择一个品牌' });
      return;
    }
    const language = _byId('geo-track-language-select')?.value || 'zh';
    const rag = _byId('geo-track-rag-check')?.checked || false;

    // v0.32: 收集「本次跑」勾选的提问 id 列表（空 = 全 enabled，向后兼容）
    const chosenIds = Array.from(document.querySelectorAll('.geo-q-runnow:checked'))
      .map(cb => cb.dataset.qid)
      .filter(Boolean);
    const userChoiceMode = chosenIds.length > 0;

    const modeLabel = userChoiceMode
      ? `（语言: ${language}${rag ? ' + 🔍检索增强' : ''}，手工选 ${chosenIds.length} 条提问）`
      : `（语言: ${language}${rag ? ' + 🔍检索增强' : ''}，跑全部启用模板，可能 10-60 秒）`;

    setStatus(`跑跟踪中${modeLabel}...`, 'loading');

    const r = await api('POST', '/api/geo/tracker/run', {
      brand_id: currentBrandId,
      language,
      rag,
      query_ids: userChoiceMode ? chosenIds : undefined, // 不传 = 后端走全 enabled 路径
    });

    if (r.data?.ok) {
      // v0.32: 反馈跳过数（disabled / missing）
      let skipSuffix = '';
      const sr = r.data.skip_report;
      if (sr && sr.chosen > 0) {
        const parts = [];
        if (sr.skipped_disabled > 0) parts.push(`${sr.skipped_disabled} 条已停用`);
        if (sr.skipped_missing > 0) parts.push(`${sr.skipped_missing} 条不属于本品牌`);
        if (parts.length > 0) skipSuffix = `（跳过 ${parts.join(' + ')}）`;
      }
      const msg = `跟踪完成: ${r.data.success_count}/${r.data.tasks_run} 成功${skipSuffix}`;
      setStatus(msg, 'success');
      notify(`🔍 ${msg}`, 'success');
      await loadTracks();
    } else {
      // 错误也透出后端 message（如 NO_QUERIES_RUNNABLE 的友好提示）
      const tail = r.data?.message ? ` — ${r.data.message}` : '';
      setStatus('跟踪失败: ' + (r.data?.error || r.status) + tail, 'error');
    }
  }

  // === Tab 3: 提问模板 ===
  let _queriesAllData = [];        // v0.26: 缓存所有 query（filter 用）
  let _queriesCategoryFilter = 'all'; // v0.26: 'all' | category 名
  let _queriesIntentFilter = 'all';   // v0.31: 'all' | informational|comparative|implementation|troubleshooting

  async function loadQueries() {
    setStatus('加载提问模板...', 'loading');
    try {
      const emptyEl = _byId('geo-queries-empty');
      const tableEl = _byId('geo-queries-table');
      const tbody = _byId('geo-queries-tbody');
      if (!emptyEl || !tableEl || !tbody) return;

      if (!currentBrandId) {
        emptyEl.style.display = '';
        tableEl.style.display = 'none';
        emptyEl.textContent = '选择品牌后查看该品牌的提问模板';
        setStatus('请先选择品牌', 'info');
        return;
      }

      const r = await api('GET', `/api/geo/queries?brand_id=${currentBrandId}`);
      const queries = r.data?.queries || [];
      if (queries.length === 0) {
        emptyEl.style.display = '';
        tableEl.style.display = 'none';
        emptyEl.textContent = '该品牌暂无提问模板。点击右上「✨ 生成模板」自动生成 24 条（4角色×6类）。';
        setStatus('无模板', 'info');
        return;
      }
      _queriesAllData = queries; // v0.26: 缓存
      renderQueriesFilterBar();    // v0.26: 渲染 filter bar
      applyQueriesFilters();       // v0.26: 应用过滤 + 渲染

      // v0.31: 意图分布统计
      renderIntentDistribution(queries);

      // v0.24: 模板健康度（触发率判定）
      loadQueriesHealth();
    } catch (e) {
      setStatus('提问模板加载失败: ' + e.message, 'error');
    }
  }

  // v0.26: 渲染 queries filter bar（按 category 过滤）
  // v0.31: 增加意图过滤 + 覆盖率统计
  function renderQueriesFilterBar() {
    const cats = { brand_intro: '🏷️ 品牌', product: '🛠️ 产品', comparison: '⚖️ 对比', pricing: '💰 价格', use_case: '💡 场景', industry: '📈 行业', custom: '✏️ 自定义' };
    // 从 _queriesAllData 统计有数据的 category
    const presentCats = new Set(_queriesAllData.map(q => q.category).filter(Boolean));
    const options = [{ value: 'all', label: '全部' }];
    for (const [k, label] of Object.entries(cats)) {
      if (presentCats.has(k)) options.push({ value: k, label });
    }
    const fb = _byId('geo-queries-filterbar');
    if (fb) fb.style.display = '';
    renderGeoFilterBar('geo-queries-filterbar', [
      {
        key: 'category', label: '类别', icon: '🏷️', type: 'single',
        value: _queriesCategoryFilter, options,
        onChange: (v) => { _queriesCategoryFilter = v; applyQueriesFilters(); },
      },
      {
        key: 'intent', label: '意图', icon: '🎯', type: 'single',
        value: _queriesIntentFilter,
        options: [
          { value: 'all', label: '全部' },
          { value: 'informational', label: 'ℹ️ 信息型' },
          { value: 'comparative', label: '⚖️ 比较型' },
          { value: 'implementation', label: '🔧 实施型' },
          { value: 'troubleshooting', label: '⚠️ 排错型' },
        ],
        onChange: (v) => { _queriesIntentFilter = v; applyQueriesFilters(); },
      },
    ]);
  }

  // v0.31: 渲染意图分布统计（环形进度条）
  function renderIntentDistribution(queries) {
    const container = _byId('geo-intent-dist');
    if (!container) return;
    if (!queries || queries.length === 0) {
      container.innerHTML = '';
      return;
    }
    const intentMap = { informational: 0, comparative: 0, implementation: 0, troubleshooting: 0, branded: 0 };
    for (const q of queries) {
      // v0.31: 优先从 tags 读取 intent:xxx 格式（后端 inferIntentAndTags 写入）
      const intentTag = (q.tags || []).find(t => /^intent:(informational|comparative|implementation|troubleshooting)$/.test(t));
      let intent = intentTag ? intentTag.replace('intent:', '') : null;
      // fallback: 从 tags 关键词推断（兼容旧数据）
      if (!intent) {
        const tagStr = (q.tags || []).join(' ').toLowerCase();
        if (tagStr.includes('informational') || tagStr.includes('best-for') || tagStr.includes('editorial') || tagStr.includes('discovery'))
          intent = 'informational';
        else if (tagStr.includes('comparative') || tagStr.includes('comparison') || tagStr.includes('alternative'))
          intent = 'comparative';
        else if (tagStr.includes('implementation') || tagStr.includes('how-to'))
          intent = 'implementation';
        else if (tagStr.includes('troubleshooting') || tagStr.includes('risk'))
          intent = 'troubleshooting';
        else intent = 'informational';
      }
      if (intent === 'branded' || (q.systemTags || []).includes('branded'))
        intentMap['branded']++;
      else if (intentMap.hasOwnProperty(intent))
        intentMap[intent]++;
    }
    const total = queries.length;
    const unbranded = total - intentMap['branded'];
    const colors = { informational: '#6366f1', comparative: '#f59e0b', implementation: '#10b981', troubleshooting: '#ef4444' };
    const labels = { informational: '信息型', comparative: '比较型', implementation: '实施型', troubleshooting: '排错型' };
    const rows = Object.entries(intentMap)
      .filter(([k]) => k !== 'branded')
      .map(([k, v]) => {
        const pct = unbranded > 0 ? (v / unbranded * 100).toFixed(0) : 0;
        const color = colors[k] || '#888';
        return `<div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-bottom:2px">
          <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></span>
          <span style="width:52px;opacity:.7">${labels[k] || k}</span>
          <div style="flex:1;height:6px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${color};border-radius:3px"></div>
          </div>
          <span style="width:28px;text-align:right;opacity:.8">${v}</span>
        </div>`;
      }).join('');
    container.innerHTML = `
      <div style="font-size:11px;opacity:.5;margin-bottom:4px">四类意图覆盖（unbranded ${unbranded} 条 / 总计 ${total} 条）</div>
      ${rows}
      <div style="font-size:10px;opacity:.4;margin-top:3px">branded ${intentMap['branded']} 条</div>
    `;
  }

  // v0.26: 按 category + intent filter 过滤 + 渲染
  function applyQueriesFilters() {
    let filtered = _queriesAllData;
    if (_queriesCategoryFilter !== 'all') {
      filtered = filtered.filter(q => q.category === _queriesCategoryFilter);
    }
    if (_queriesIntentFilter !== 'all') {
      filtered = filtered.filter(q => {
        // v0.31: 优先从 tags 读取 intent:xxx 格式
        const intentTag = (q.tags || []).find(t => t === `intent:${_queriesIntentFilter}`);
        if (intentTag) return true;
        // fallback: 从 tags 关键词推断（兼容旧数据）
        const tagStr = (q.tags || []).join(' ').toLowerCase();
        let intent = 'informational';
        if (tagStr.includes('comparative') || tagStr.includes('comparison') || tagStr.includes('alternative'))
          intent = 'comparative';
        else if (tagStr.includes('implementation') || tagStr.includes('how-to'))
          intent = 'implementation';
        else if (tagStr.includes('troubleshooting') || tagStr.includes('risk'))
          intent = 'troubleshooting';
        return intent === _queriesIntentFilter;
      });
    }
    renderQueriesTable(filtered);
  }

  // v0.26 C4: 抽 renderQueriesTable（启用列 + 标签列）
  function renderQueriesTable(queries) {
    const tableEl = _byId('geo-queries-table');
    const emptyEl = _byId('geo-queries-empty');
    const tbody = _byId('geo-queries-tbody');
    if (!tbody) return;
    if (queries.length === 0) {
      tableEl.style.display = 'none';
      const runnowBar = _byId('geo-queries-runnow-bar');
      if (runnowBar) runnowBar.style.display = 'none'; // v0.32: 没数据时隐 helper bar
      if (emptyEl) {
        emptyEl.style.display = '';
        emptyEl.textContent = '该类别下没有模板';
      }
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    tableEl.style.display = '';
    const runnowBar = _byId('geo-queries-runnow-bar');
    if (runnowBar) runnowBar.style.display = ''; // v0.32: 有数据时显 helper bar
    updateRunNowCount();
    const cats = { brand_intro: '🏷️ 品牌', product: '🛠️ 产品', comparison: '⚖️ 对比', pricing: '💰 价格', use_case: '💡 场景', industry: '📈 行业', custom: '✏️ 自定义' };
    // v0.26 C4: systemTags 徽章（branded/unbranded 自动算）
    const sysTagMap = { branded: '🔵 品牌词', unbranded: '🟢 自然', 'high-performing': '⭐ 高表现', 'low-performing': '⚠️ 低表现' };
    tbody.innerHTML = queries.slice(0, 200).map(q => `
      <tr style="${q.enabled === false ? 'opacity:.55' : ''}">
        <td><input type="checkbox" class="geo-q-enable" data-qid="${esc(q.id)}" ${q.enabled !== false ? 'checked' : ''} title="启用/停用（停用后跑跟踪默认跳过）"></td>
        <td><input type="checkbox" class="geo-q-runnow" data-qid="${esc(q.id)}" title="本次跑跟踪只跑勾上的（不勾任何 = 跑全部启用）"></td>
        <td><span class="geo-badge geo-badge-gray">${esc(cats[q.category] || q.category)}</span></td>
        <td>${esc(q.prompt)}
          ${(q.systemTags || []).map(t => `<span class="geo-cat-badge" style="background:rgba(99,102,241,.15);color:#818cf8">${sysTagMap[t] || esc(t)}</span>`).join('')}
        </td>
        <td>${(q.tags || []).map(t => `<span class="geo-badge geo-badge-gray" style="font-size:10px">${esc(t)}</span>`).join(' ') || '<span style="opacity:.35">—</span>'}</td>
        <td>${(q.engine_targets || []).map(e => `<span class="geo-badge geo-badge-${e}">${esc(e)}</span>`).join(' ')}</td>
        <td style="width:40px;text-align:center">
          <button type="button" class="geo-btn geo-btn-sm geo-q-del" data-qid="${esc(q.id)}" data-prompt="${esc(q.prompt.slice(0, 30))}" title="删除该模板（级联删除关联追踪记录）">🗑️</button>
        </td>
      </tr>
    `).join('');
    // v0.26 C4: 绑定启用开关
    tbody.querySelectorAll('.geo-q-enable').forEach(cb => {
      cb.addEventListener('change', () => {
        toggleQueryEnabled(cb.dataset.qid, cb.checked);
      });
    });
    // v0.32: 绑定「本次跑」checkbox —— 仅触发 count 更新（不调 API，无后端写入）
    tbody.querySelectorAll('.geo-q-runnow').forEach(cb => {
      cb.addEventListener('change', updateRunNowCount);
    });
    // v0.26: 绑定删除按钮
    tbody.querySelectorAll('.geo-q-del').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteQueryTemplate(btn.dataset.qid, btn.dataset.prompt);
      });
    });
  }

  // v0.32: helper bar 计数函数（每次勾动 / 渲染 / filter 都重算）
  function updateRunNowCount() {
    const all = document.querySelectorAll('.geo-q-runnow');
    const picked = document.querySelectorAll('.geo-q-runnow:checked');
    const el = _byId('geo-q-runnow-count');
    if (el) el.textContent = `已选 ${picked.length} / 可见 ${all.length}`;
  }

  // v0.26: 删除单条模板（确认 + 级联删 responses）
  async function deleteQueryTemplate(qid, promptPreview) {
    const confirm = await showModal({
      title: '🗑️ 删除提问模板',
      message: `确认删除「${promptPreview || qid}」？\n\n这会同时删除该模板的所有追踪记录（responses）。\n此操作不可撤销。`,
      actions: [
        { label: '取消', value: null },
        { label: '删除', value: 'DELETE', className: 'acms-modal-btn' },
      ],
    });
    if (confirm !== 'DELETE') return;
    setStatus('删除中...', 'loading');
    try {
      const r = await api('DELETE', `/api/geo/queries/${qid}`);
      if (r.data?.ok) {
        setStatus(`已删除 #${qid.slice(0, 8)}（含关联追踪记录）`, 'success');
        loadQueries();
      } else {
        setStatus('删除失败: ' + (r.data?.error || ''), 'error');
      }
    } catch (e) {
      setStatus('删除失败: ' + e.message, 'error');
    }
  }

  // v0.26: 批量清理历史 legacy 模板（完整问句 — 指标失真根源）
  async function cleanupLegacyTemplates() {
    if (!currentBrandId) {
      await showModal({ title: '提示', message: '请先选择品牌（清理作用于所有品牌的历史模板）' });
      return;
    }
    const confirm = await showModal({
      title: '🧹 清理历史模板',
      message: `确认清理所有 legacy 完整问句模板？\n\n作用范围：所有品牌的旧版完整问句（如「请介绍 X 公司，重点说明商业模式...」）。\n同时级联删除关联的追踪记录。\n\n保留：短搜索片段模板（v0.26 新版）。\n\n⚠️ 清理后品牌可能没有可用模板 — 之后用「🧠 AI 生成」重新生成。`,
      actions: [
        { label: '取消', value: null },
        { label: '确认清理', value: 'CLEAN', className: 'acms-modal-btn' },
      ],
    });
    if (confirm !== 'CLEAN') return;
    setStatus('清理中...', 'loading');
    try {
      const r = await api('DELETE', '/api/geo/queries/legacy');
      if (r.data?.ok) {
        setStatus(`✅ 清理 ${r.data.removed} 条 legacy 模板（涉及 ${(r.data.brand_ids || []).join(', ')}）`, 'success');
        loadQueries();
        if (currentBrandId) loadOverview();
      } else {
        setStatus('清理失败: ' + (r.data?.error || ''), 'error');
      }
    } catch (e) {
      setStatus('清理失败: ' + e.message, 'error');
    }
  }

  // v0.26 C4: 单条启用/停用
  async function toggleQueryEnabled(qid, enabled) {
    try {
      const r = await api('PATCH', `/api/geo/queries/${qid}`, { enabled });
      if (r.data?.ok) {
        setStatus(`已${enabled ? '启用' : '停用'} #${qid.slice(0, 8)}`, 'success');
        loadQueries(); // 刷新（更新 systemTags/显示）
      } else {
        setStatus('更新失败: ' + (r.data?.error || ''), 'error');
      }
    } catch (e) {
      setStatus('更新失败: ' + e.message, 'error');
    }
  }

  // v0.29: LLM 自动生成 prompts（升级 — 加 replace 开关 + 新句式说明）
  async function generateQueriesAI() {
    if (!currentBrandId) {
      await showModal({ title: '提示', message: '请先选择品牌' });
      return;
    }
    const result = await showModal({
      title: '🧠 AI 生成提问模板（v0.29 结构化句式版）',
      message: `LLM 会按 elmo/Profound 最佳实践生成 12-16 个真实搜索片段：
• 70% unbranded（best X / X for [persona] / alternatives / where to find X 等结构化句式）
• 30% branded（X 怎么样 / X alternatives / X vs 竞品 / is X worth it）`,
      fields: [
        {
          name: 'replace',
          label: '清空旧模板后再生成（避免累积膨胀）',
          type: 'checkbox',
          placeholder: '勾选后先删除现有 ai_generated/template/onboarding 来源模板再生成新批',
          checked: true,
        },
      ],
      actions: [
        { label: '取消', value: null },
        { label: '生成', value: 'GO', className: 'acms-modal-btn acms-modal-btn-primary' },
      ],
    });
    if (result !== 'GO' && result?.action !== 'GO') return;
    const replace = !!(result && typeof result === 'object' ? result.replace : true);
    // 兼容旧版 modal（resolve 'GO' 字符串）— 也走 replace，因为多多的根因就是累积
    const shouldReplace = (result && typeof result === 'object') ? replace : true;
    setStatus(`LLM 生成中（10-30 秒）${shouldReplace ? '，将先清空旧模板' : ''}...`, 'loading');
    try {
      const r = await api('POST', '/api/geo/queries/ai-generate', { brand_id: currentBrandId, replace: shouldReplace });
      if (r.data?.ok) {
        const replaceNote = shouldReplace && r.data.replaced ? `（先清空了 ${r.data.replaced} 条旧模板）` : '';
        setStatus(`✅ AI 生成 ${r.data.count} 个模板${replaceNote}`, 'success');
        loadQueries();
      } else {
        setStatus('AI 生成失败: ' + (r.data?.message || r.data?.error || ''), 'error');
      }
    } catch (e) {
      setStatus('AI 生成失败: ' + e.message, 'error');
    }
  }

  // v0.26 C1c: 批量导入（textarea 粘贴多行）
  async function importBulkQueries() {
    if (!currentBrandId) {
      await showModal({ title: '提示', message: '请先选择品牌' });
      return;
    }
    const result = await showModal({
      title: '📥 批量导入提问模板',
      message: '每行一条 prompt（粘贴后自动去重 + 报告跳过原因）：',
      fields: [
        { name: 'text', label: 'Prompts', required: true, placeholder: '展览设计公司 行业排名\n展台设计 价格多少\n...' },
      ],
      actions: [
        { label: '取消', value: null },
        { label: '导入', value: 'SUBMIT', className: 'acms-modal-btn acms-modal-btn-primary' },
      ],
    });
    if (!result?.text) return;
    setStatus('导入中...', 'loading');
    try {
      const r = await api('POST', '/api/geo/queries/bulk', { brand_id: currentBrandId, text: result.text });
      if (r.data?.ok) {
        const skipInfo = r.data.skipped_desc ? `（${r.data.skipped_desc}）` : '';
        setStatus(`✅ 导入 ${r.data.count} 条${skipInfo}`, 'success');
        loadQueries();
      } else {
        setStatus('导入失败: ' + (r.data?.error || ''), 'error');
      }
    } catch (e) {
      setStatus('导入失败: ' + e.message, 'error');
    }
  }

  // v0.24: 模板健康度——判定 24 个模板够不够、哪些无效
  async function loadQueriesHealth() {
    const container = _byId('geo-queries-health');
    if (!container) return;
    if (!currentBrandId) return;
    try {
      const r = await api('GET', '/api/geo/queries/health?brand_id=' + currentBrandId);
      if (r.status === 404 || !r.data?.ok) {
        container.style.display = 'none';
        return;
      }
      const d = r.data;
      container.style.display = '';
      const catIcons = { brand_intro: '🏷️', product: '🛠️', comparison: '⚖️', pricing: '💰', use_case: '💡', industry: '📈', general: '📄' };
      const catHtml = Object.entries(d.by_category || {}).map(([k, v]) => `${catIcons[k] || '•'} ${k}: ${v}条`).join('　');
      const healthPct = d.total ? Math.round((d.triggered / d.total) * 100) : 0;
      const healthColor = healthPct >= 70 ? 'var(--geo-ok,#4ade80)' : (healthPct >= 40 ? 'var(--geo-warn,#e8a33d)' : 'var(--geo-danger,#f66)');
      let html = `
        <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
          <div style="text-align:center;padding:8px 14px;background:var(--geo-bg-2,#111);border-radius:8px;border:1px solid var(--geo-border,#333)">
            <div style="font-size:11px;opacity:.7">模板总数</div>
            <div style="font-size:20px;font-weight:700">${d.total}</div>
          </div>
          <div style="text-align:center;padding:8px 14px;background:var(--geo-bg-2,#111);border-radius:8px;border:1px solid var(--geo-border,#333)">
            <div style="font-size:11px;opacity:.7">有效触发</div>
            <div style="font-size:20px;font-weight:700;color:${healthColor}">${d.triggered}/${d.total}</div>
          </div>
          <div style="text-align:center;padding:8px 14px;background:var(--geo-bg-2,#111);border-radius:8px;border:1px solid var(--geo-border,#333)">
            <div style="font-size:11px;opacity:.7">触发率</div>
            <div style="font-size:20px;font-weight:700;color:${healthColor}">${healthPct}%</div>
          </div>
          <div style="text-align:center;padding:8px 14px;background:var(--geo-bg-2,#111);border-radius:8px;border:1px solid var(--geo-border,#333)" class="geo-tip" data-tip="跑过跟踪但回答里没提到品牌 = 真无效模板，建议调整措辞">
            <div style="font-size:11px;opacity:.7">跑过未触发</div>
            <div style="font-size:20px;font-weight:700;color:${d.zero_trigger ? 'var(--geo-warn,#e8a33d)' : 'var(--geo-ok,#4ade80)'}">${d.zero_trigger}</div>
          </div>
          <div style="text-align:center;padding:8px 14px;background:var(--geo-bg-2,#111);border-radius:8px;border:1px solid var(--geo-border,#333)" class="geo-tip" data-tip="还没跑过跟踪的模板（跑一次后自动判定）">
            <div style="font-size:11px;opacity:.7">未跑过</div>
            <div style="font-size:20px;font-weight:700;opacity:.7">${d.unrun || 0}</div>
          </div>
          <div style="font-size:12px;opacity:.85">${catHtml}</div>
        </div>`;
      if (d.zero_trigger_list && d.zero_trigger_list.length) {
        html += `<div style="font-size:12px;opacity:.9;margin-bottom:4px">🔴 0 触发模板（建议调整或删除）：</div>`;
        html += d.zero_trigger_list.slice(0, 6).map(q => `<div style="font-size:11px;opacity:.8;margin:2px 0;border-left:2px solid var(--geo-danger,#f66);padding-left:8px">${esc(q.prompt)}</div>`).join('');
        if (d.zero_trigger_list.length > 6) html += `<div style="font-size:11px;opacity:.5">… 还有 ${d.zero_trigger_list.length - 6} 条</div>`;
      } else if (d.total > 0) {
        html += `<div style="font-size:12px;color:var(--geo-ok,#4ade80)">✅ 所有模板都能触发品牌提及</div>`;
      }
      html += `<div style="margin-top:6px;font-size:11px;opacity:.6" class="geo-tip" data-tip="${esc(d.note || '')}">💡 ${esc(d.note || '')}</div>`;
      container.innerHTML = html;
    } catch (e) {
      container.style.display = 'none';
    }
  }

  async function generateQueries() {
    if (!currentBrandId) {
      await showModal({ title: '提示', message: '请先选择品牌' });
      return;
    }
    setStatus('生成模板中...', 'loading');
    const r = await api('POST', '/api/geo/queries/generate', { brand_id: currentBrandId, persist: true });
    if (r.data?.ok) {
      setStatus(`已生成 ${r.data.count} 条模板`, 'success');
      await loadQueries();
    } else {
      setStatus('生成失败: ' + (r.data?.error || r.status), 'error');
    }
  }

  // === Tab 5: 评分历史 ===
  async function loadScores() {
    setStatus('加载评分...', 'loading');
    try {
      const emptyEl = _byId('geo-scores-empty');
      const tableEl = _byId('geo-scores-table');
      const tbody = _byId('geo-scores-tbody');
      if (!emptyEl || !tableEl || !tbody) return;

      if (!currentBrandId) {
        emptyEl.style.display = '';
        tableEl.style.display = 'none';
        emptyEl.textContent = '选择品牌后查看评分记录（最近 20 条）';
        setStatus('请先选择品牌', 'info');
        return;
      }

      const r = await api('GET', `/api/geo/scores?brand_id=${currentBrandId}`);
      const scores = r.data?.scores || [];
      if (scores.length === 0) {
        emptyEl.style.display = '';
        tableEl.style.display = 'none';
        emptyEl.textContent = '暂无评分记录。去「🔍 追踪记录」tab 跑一次跟踪，或等 cronjob 自动生成。';
        setStatus('无评分', 'info');
        return;
      }
      emptyEl.style.display = 'none';
      tableEl.style.display = '';
      const dims = { mention_rate: '提及率', position_score: '位置分', context_score: '上下文分', engine_consistency: '引擎一致性', freshness: '时效性' };
      tbody.innerHTML = scores.slice(0, 20).map(s => `
        <tr>
          <td>${(s.computed_at || '').slice(0, 19).replace('T', ' ')}</td>
          <td>${esc(dims[s.dimension] || s.dimension)}</td>
          <td><strong>${(s.score * 100).toFixed(0)}%</strong></td>
          <td>${s.snapshot_id ? '📊' : '—'}</td>
        </tr>
      `).join('');
      setStatus(`已加载 ${scores.length} 条评分`, 'success');
    } catch (e) {
      setStatus('评分加载失败: ' + e.message, 'error');
    }
  }

  // === Tab 6: 周快照 ===
  async function loadSnapshots() {
    setStatus('加载快照...', 'loading');
    try {
      const emptyEl = _byId('geo-snapshots-empty');
      const tableEl = _byId('geo-snapshots-table');
      const tbody = _byId('geo-snapshots-tbody');
      if (!emptyEl || !tableEl || !tbody) return;

      if (!currentBrandId) {
        emptyEl.style.display = '';
        tableEl.style.display = 'none';
        emptyEl.textContent = '选择品牌后查看周快照（分数趋势）';
        setStatus('请先选择品牌', 'info');
        return;
      }

      const r = await api('GET', `/api/geo/snapshots?brand_id=${currentBrandId}`);
      let snapshots = r.data?.snapshots || [];
      // v0.27: 按周去重（历史重复数据兜底）— 同一周只保留最新一份
      const byWeek = new Map();
      for (const s of snapshots) {
        const cur = byWeek.get(s.week);
        if (!cur || (s.computed_at || '') > (cur.computed_at || '')) byWeek.set(s.week, s);
      }
      snapshots = Array.from(byWeek.values());
      if (snapshots.length === 0) {
        emptyEl.style.display = '';
        tableEl.style.display = 'none';
        emptyEl.textContent = '暂无周快照。跑一次跟踪（「🔍 追踪记录」→ ▶ 跑一次跟踪）会自动生成。';
        setStatus('无快照', 'info');
        return;
      }
      emptyEl.style.display = 'none';
      tableEl.style.display = '';
      tbody.innerHTML = snapshots.map(s => {
        const summary = s.summary_json || {};
        return `
        <tr>
          <td><strong>${esc(s.week)}</strong></td>
          <td>${summary.score != null ? summary.score : '—'}</td>
          <td>${esc(summary.grade || '—')}</td>
          <td>${summary.components?.mention_rate != null ? (summary.components.mention_rate * 100).toFixed(0) + '%' : '—'}</td>
          <td>${summary.components?.position_score != null ? (summary.components.position_score * 100).toFixed(0) + '%' : '—'}</td>
          <td>${summary.components?.engine_consistency != null ? (summary.components.engine_consistency * 100).toFixed(0) + '%' : '—'}</td>
          <td>${(s.computed_at || '').slice(0, 19).replace('T', ' ')}</td>
        </tr>
      `;
      }).join('');
      setStatus(`已加载 ${snapshots.length} 个快照`, 'success');
    } catch (e) {
      setStatus('快照加载失败: ' + e.message, 'error');
    }
  }

  // === Tab 6b: 竞品 Watch（v0.11）===
  let _watchBrandsCache = [];
  let _watchAllData = [];     // v0.26: 缓存所有 watch（filter bar 用）
  let _watchStatusFilter = 'all'; // v0.26: 'all' | 'enabled' | 'disabled'
  let _watchFocusFilter = '';  // v0.26: '' = 所有焦点品牌，否则 brand_id

  async function loadWatches() {
    const listEl = _byId('geo-watch-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="geo-dim-empty">加载中...</div>';
    try {
      const [watchesRes, brandsRes] = await Promise.all([
        api('GET', '/api/geo/watch'),
        api('GET', '/api/geo/brands'),
      ]);
      const watches = watchesRes.data?.watches || [];
      _watchBrandsCache = brandsRes.data?.brands || [];
      _watchAllData = watches; // v0.26: 缓存给 filter 用
      fillWatchForm(_watchBrandsCache);
      renderWatchFilterBar();
      applyWatchFilters();
    } catch (e) {
      listEl.innerHTML = `<div class="geo-dim-empty">加载失败: ${esc(e.message)}</div>`;
    }
  }

  // v0.26: 渲染 watch filter bar（状态 + 焦点品牌）
  function renderWatchFilterBar() {
    const statusOptions = [
      { value: 'all', label: '全部' },
      { value: 'enabled', label: '✅ 已启用' },
      { value: 'disabled', label: '⏸ 已禁用' },
    ];
    const focusOptions = [{ value: '', label: '所有焦点品牌' }].concat(
      _watchBrandsCache.map(b => ({ value: b.id, label: b.name || b.id }))
    );
    renderGeoFilterBar('geo-watch-filterbar', [
      {
        key: 'status', label: '状态', icon: '🔘', type: 'single',
        value: _watchStatusFilter, options: statusOptions,
        onChange: (v) => { _watchStatusFilter = v; applyWatchFilters(); },
      },
      {
        key: 'focus', label: '焦点', icon: '🎯', type: 'single',
        value: _watchFocusFilter, options: focusOptions,
        onChange: (v) => { _watchFocusFilter = v; applyWatchFilters(); },
      },
    ]);
  }

  // v0.26: 按 filter bar 值过滤 watches
  function applyWatchFilters() {
    let filtered = _watchAllData;
    if (_watchStatusFilter === 'enabled') filtered = filtered.filter(w => w.enabled);
    else if (_watchStatusFilter === 'disabled') filtered = filtered.filter(w => !w.enabled);
    if (_watchFocusFilter) filtered = filtered.filter(w => w.focus_brand_id === _watchFocusFilter);
    renderWatches(filtered, _watchBrandsCache);
  }

  function fillWatchForm(brands) {
    const sel = _byId('geo-watch-focus-select');
    if (sel && brands.length) {
      sel.innerHTML = brands.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
    }
    const cb = _byId('geo-watch-competitor-checkbox');
    if (cb) {
      cb.innerHTML = brands.map(b => `
        <label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer">
          <input type="checkbox" value="${b.id}"> ${esc(b.name)}
        </label>`).join('');
    }
  }

  function renderWatches(watches, brands) {
    const listEl = _byId('geo-watch-list');
    if (!listEl) return;
    const nameOf = id => (brands.find(b => b.id === id)?.name) || id;
    if (!watches.length) {
      listEl.innerHTML = '<div class="geo-dim-empty">还没有监控。点击「➕ 新建监控」选择焦点品牌和竞品。</div>';
      return;
    }
    listEl.innerHTML = watches.map(w => {
      const r = w.last_result;
      const compNames = (w.competitor_ids || []).map(nameOf).join('、') || '（无）';
      return `
      <div class="geo-watch-card" style="border:1px solid var(--geo-border,#333);border-radius:8px;padding:12px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <strong>👁 ${esc(nameOf(w.focus_brand_id))}</strong>
            <span style="opacity:.7;font-size:12px"> vs ${esc(compNames)}</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <label style="font-size:12px;cursor:pointer"><input type="checkbox" data-watch-toggle="${w.id}" ${w.enabled ? 'checked' : ''}> 启用</label>
            <button class="geo-btn" data-watch-run="${w.id}">▶️ 跑一次</button>
            <button class="geo-btn" data-watch-report="${w.id}">📄 报告</button>
            <button class="geo-btn" data-watch-delete="${w.id}" style="color:var(--geo-danger,#f66)">🗑</button>
          </div>
        </div>
        ${r ? `
        <div style="margin-top:8px;font-size:13px;display:flex;gap:16px;flex-wrap:wrap">
          <span>焦点: <strong>${r.focus_score != null ? r.focus_score : '无数据'}</strong> ${esc(r.focus_grade || '')}</span>
          <span>领先者: ${esc(r.leader || '—')}</span>
          <span style="opacity:.7">${new Date(r.computed_at).toLocaleString('zh-CN')}</span>
        </div>
        ${(r.changes || []).length ? `<div style="margin-top:6px;font-size:12px;color:var(--geo-warn,#e8a33d)">${r.changes.map(c => `${c.type === 'up' ? '🔺' : '🔻'} ${esc(c.brand_name)} ${c.delta > 0 ? '+' : ''}${c.delta}`).join('　')}</div>` : ''}`
        : '<div style="margin-top:8px;font-size:12px;opacity:.6">还未运行</div>'}
      </div>`;
    }).join('');
  }

  function toggleWatchForm(show) {
    const form = _byId('geo-watch-form');
    if (form) form.style.display = show ? '' : 'none';
    const createBtn = _byId('geo-watch-create-btn');
    if (createBtn) createBtn.style.display = show ? 'none' : '';
    if (show) fillWatchForm(_watchBrandsCache);
  }

  async function saveWatch() {
    const focus = _byId('geo-watch-focus-select')?.value;
    if (!focus) {
      setStatus('请选择焦点品牌', 'error');
      return;
    }
    const cbRoot = _byId('geo-watch-competitor-checkbox');
    const competitorIds = cbRoot ? Array.from(cbRoot.querySelectorAll('input:checked')).map(i => i.value) : [];
    if (!competitorIds.length) {
      setStatus('至少选 1 个竞品', 'error');
      return;
    }
    const enabled = _byId('geo-watch-enabled-check')?.checked ?? true;
    setStatus('创建监控...', 'loading');
    const r = await api('POST', '/api/geo/watch', { focus_brand_id: focus, competitor_ids: competitorIds, enabled });
    if (r.data?.ok) {
      setStatus('监控已创建', 'success');
      notify(`👁 竞品监控已创建`, 'success');
      toggleWatchForm(false);
      await loadWatches();
    } else {
      setStatus('创建失败: ' + (r.data?.error || r.data?.message || r.status), 'error');
    }
  }

  async function updateWatchEnabled(id, enabled) {
    const r = await api('PUT', '/api/geo/watch/' + id, { enabled });
    if (r.data?.ok) {
      setStatus(enabled ? '已启用' : '已停用', 'success');
    } else {
      setStatus('更新失败', 'error');
      await loadWatches(); // 回滚 UI
    }
  }

  async function runOneWatch(id) {
    setStatus('跑竞品对比...', 'loading');
    const r = await api('POST', `/api/geo/watch/${id}/run`);
    if (r.data?.ok) {
      const ch = r.data.changes || [];
      setStatus(`对比完成（${r.data.competitors.length} 个竞品）${ch.length ? `，${ch.length} 处变化` : ''}`, 'success');
      notify(`👁 竞品对比完成: ${r.data.focus_brand_name}`, 'success');
      await loadWatches();
    } else {
      setStatus('对比失败: ' + (r.data?.message || r.data?.error || r.status), 'error');
    }
  }

  async function runAllWatches() {
    setStatus('跑全部监控...', 'loading');
    const r = await api('POST', '/api/geo/watch/run-all');
    if (r.data?.ok) {
      setStatus(`完成 ${r.data.total} 组监控`, 'success');
      await loadWatches();
    } else {
      setStatus('失败: ' + (r.data?.error || r.status), 'error');
    }
  }

  async function deleteWatchFlow(id) {
    const result = await showModal({
      title: '🗑 删除监控',
      message: '确定删除这个竞品监控？（历史结果一并清除）',
      actions: [
        { label: '取消', value: null },
        { label: '删除', value: 'DELETE', className: 'acms-modal-btn' },
      ],
    });
    if (result !== 'DELETE') return;
    const r = await api('DELETE', '/api/geo/watch/' + id);
    if (r.data?.ok) {
      setStatus('已删除', 'success');
      await loadWatches();
    } else {
      setStatus('删除失败', 'error');
    }
  }

  async function viewWatchReport(id) {
    setStatus('加载报告...', 'loading');
    const r = await api('GET', `/api/geo/watch/${id}/report`);
    if (r.status === 200 && r.data) {
      const md = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
      await showModal({ title: '📄 竞品 Watch 报告', message: md.slice(0, 4000) });
      setStatus('报告已加载', 'success');
    } else {
      setStatus('报告加载失败', 'error');
    }
  }

  // === 拓词工作台（v0.20 — 借鉴 GEORank）===
  let _kwResult = null; // 最近一次展开结果缓存

  async function expandKeywordsWorkbench() {
    if (!currentBrandId) {
      await showModal({ title: '提示', message: '请先在顶栏选择品牌（拓词结果要导入到该品牌的模板库）' });
      return;
    }
    const input = _byId('geo-kw-seeds-input')?.value || '';
    const seeds = input.split(/[\n,，、]+/).map(s => s.trim()).filter(Boolean);
    if (!seeds.length) {
      await showModal({ title: '提示', message: '请输入至少一个种子词' });
      return;
    }
    const profile = _byId('geo-kw-profile-select')?.value || undefined;
    const resultEl = _byId('geo-kw-result');
    if (resultEl) resultEl.innerHTML = '<div class="geo-dim-empty">🚀 展开中...</div>';
    const r = await api('POST', '/api/geo/keywords/expand', { seeds, profile });
    if (r.status === 404) {
      if (resultEl) resultEl.innerHTML = '<div class="geo-dim-empty">后端尚未重启（/api/geo/keywords/expand 端点未生效）。重启 ACMS 后可用拓词工作台。</div>';
      return;
    }
    if (!r.data?.ok) {
      if (resultEl) resultEl.innerHTML = `<div class="geo-dim-empty">展开失败: ${esc(r.data?.error || r.data?.message || r.status)}</div>`;
      return;
    }
    _kwResult = r.data;
    renderKwResult(r.data);
  }

  function renderKwResult(data) {
    const resultEl = _byId('geo-kw-result');
    if (!resultEl) return;
    const dimIcons = { semantic: '🔤', scenario: '🏷️', commercial: '💰', ranking: '🏆', review: '⭐', brand: '🏢', question: '❓', technical: '🔧' };
    let html = `<div style="font-size:12px;opacity:.85;margin-bottom:6px">画像: <strong>${esc(data.profile_name)}</strong>（${esc(data.profile)}）· 共 ${data.total} 个关键词</div>`;
    html += `<div style="margin-bottom:6px"><button class="geo-btn" id="geo-kw-select-all-btn">☑️ 全选</button> <button class="geo-btn geo-btn-primary" id="geo-kw-import-btn">📥 导入勾选为模板（${data.total}）</button> <span class="geo-settings-hint">导入后可在「跑跟踪」中使用</span></div>`;
    data.dimensions.forEach(dim => {
      if (!dim.keywords.length) return;
      html += `
        <div style="margin-top:8px">
          <div style="font-size:12px;font-weight:600;margin-bottom:4px">${dimIcons[dim.key] || '•'} ${esc(dim.name)}（${dim.keywords.length}）</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">${dim.keywords.map(kw => `<label class="geo-kw-item" style="display:flex;align-items:center;gap:4px;font-size:12px;border:1px solid var(--geo-border,#333);border-radius:12px;padding:2px 8px;cursor:pointer"><input type="checkbox" class="geo-kw-check" value="${esc(kw)}" data-cat="${dim.category}"> ${esc(kw)}</label>`).join('')}</div>
        </div>`;
    });
    resultEl.innerHTML = html;
    // 绑定全选 + 导入
    const selAll = _byId('geo-kw-select-all-btn');
    if (selAll) selAll.addEventListener('click', () => {
      resultEl.querySelectorAll('.geo-kw-check').forEach(c => c.checked = true);
    });
    const importBtn = _byId('geo-kw-import-btn');
    if (importBtn) importBtn.addEventListener('click', importSelectedKeywords);
  }

  async function importSelectedKeywords() {
    const resultEl = _byId('geo-kw-result');
    if (!resultEl || !_kwResult) return;
    const checked = Array.from(resultEl.querySelectorAll('.geo-kw-check:checked'))
      .map(c => ({ keyword: c.value, category: c.dataset.cat || 'general' }));
    if (!checked.length) {
      await showModal({ title: '提示', message: '请先勾选要导入的关键词' });
      return;
    }
    setStatus(`导入 ${checked.length} 个模板...`, 'loading');
    const r = await api('POST', '/api/geo/queries/import', { brand_id: currentBrandId, keywords: checked });
    if (r.data?.ok) {
      setStatus(`已导入 ${r.data.imported}/${checked.length} 个模板（去重后）`, 'success');
      notify(`📥 拓词导入 ${r.data.imported} 个模板`, 'success');
      await loadQueries();
    } else {
      setStatus('导入失败: ' + (r.data?.error || r.status), 'error');
    }
  }

  // === GEO 工具（v0.21 — 借鉴 GEORank tools 模块）===
  async function runGeoTool(kind) {
    const brief = _byId('geo-tools-brief-input')?.value?.trim();
    if (!brief) {
      await showModal({ title: '提示', message: '请先输入品牌信息 brief（名称/官网/业务描述）' });
      return;
    }
    const out = _byId('geo-tools-output');
    const hint = _byId('geo-tools-hint');
    if (out) out.textContent = '⏳ 生成中...（约 3-10 秒，消耗 LLM token）';
    if (hint) hint.textContent = '';
    const labels = { jsonld: 'JSON-LD', titles: 'GEO 标题', kb: '知识库草稿' };
    const r = await api('POST', '/api/geo/tools/' + kind, { brief });
    if (r.status === 404) {
      if (out) out.textContent = '后端尚未重启（/api/geo/tools 端点未生效）。重启 ACMS 后可用。';
      return;
    }
    if (r.data?.ok) {
      if (out) out.textContent = r.data.text || '（空输出）';
      if (hint) hint.textContent = `${labels[kind] || kind} 已生成（${r.data.model || ''}，${(r.data.text || '').length} 字符）`;
      notify(`🛠 ${labels[kind] || kind} 已生成`, 'success');
    } else {
      if (out) out.textContent = '生成失败: ' + (r.data?.message || r.data?.error || r.status);
    }
  }

  // === 竞品自动推荐（v0.22）===
  let _suggestCandidates = []; // 推荐结果缓存

  async function suggestCompetitorsFlow() {
    const focus = _byId('geo-watch-focus-select')?.value;
    if (!focus) {
      setStatus('请先选择焦点品牌', 'error');
      return;
    }
    const listEl = _byId('geo-watch-suggest-list');
    if (listEl) {
      listEl.style.display = '';
      listEl.innerHTML = '<div class="geo-dim-empty" style="font-size:12px">⏳ AI 正在分析行业竞品...（约 5-15 秒，消耗 LLM token）</div>';
    }
    const r = await api('POST', '/api/geo/competitors/suggest', { brand_id: focus });
    if (r.status === 404) {
      if (listEl) listEl.innerHTML = '<div class="geo-dim-empty" style="font-size:12px">后端尚未重启（/api/geo/competitors/suggest 端点未生效）。重启 ACMS 后可用。</div>';
      return;
    }
    if (!r.data?.ok) {
      if (listEl) listEl.innerHTML = `<div class="geo-dim-empty" style="font-size:12px">推荐失败: ${esc(r.data?.message || r.data?.error || r.status)}</div>`;
      return;
    }
    _suggestCandidates = r.data.candidates || [];
    renderSuggestCandidates(r.data);
  }

  function renderSuggestCandidates(data) {
    const listEl = _byId('geo-watch-suggest-list');
    if (!listEl) return;
    if (!_suggestCandidates.length) {
      listEl.innerHTML = '<div class="geo-dim-empty" style="font-size:12px">没有找到候选竞品。可手动勾选或添加品牌后重试。</div>';
      return;
    }
    let html = `<div style="font-size:12px;opacity:.85;margin-bottom:6px">推荐 ${data.total} 个候选竞品（${esc(data.note || '')}）— 勾选后「创建所选」会自动建品牌并加入监控</div>`;
    html += _suggestCandidates.map((c, i) => `
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;padding:3px 0;cursor:pointer;${c.already_exists ? 'opacity:.5' : ''}">
        <input type="checkbox" class="geo-suggest-check" value="${i}" ${c.already_exists ? '' : (c.source === 'answer' ? '' : 'checked')}>
        <span>${esc(c.name)}${c.domain ? ` <span style="opacity:.6">(${esc(c.domain)})</span>` : ''}</span>
        ${c.industry ? `<span style="opacity:.6;font-size:11px">[${esc(c.industry)}]</span>` : ''}
        ${c.already_exists ? '<span style="color:var(--geo-warn,#e8a33d)">已存在</span>' : ''}
        ${c.why ? `<span style="opacity:.5">— ${esc(c.why)}</span>` : ''}
        <span style="opacity:.4;font-size:10px">[${c.source === 'llm' ? 'AI 推荐' : '回答提取'}]</span>
      </label>`).join('');
    html += `<div style="margin-top:8px"><button class="geo-btn geo-btn-primary" id="geo-suggest-create-btn">➕ 创建所选（${_suggestCandidates.filter((c) => !c.already_exists && c.source === 'llm').length}）</button> <button class="geo-btn" id="geo-suggest-close-btn">收起</button> <span class="geo-settings-hint">AI 推荐已勾选；「回答提取」候选默认不勾选，手动挑</span></div>`;
    listEl.innerHTML = html;
    const createBtn = _byId('geo-suggest-create-btn');
    if (createBtn) createBtn.addEventListener('click', createSuggestedCompetitors);
    const closeBtn = _byId('geo-suggest-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => { listEl.style.display = 'none'; });
  }

  async function createSuggestedCompetitors() {
    const listEl = _byId('geo-watch-suggest-list');
    if (!listEl) return;
    const focus = _byId('geo-watch-focus-select')?.value;
    const checked = Array.from(listEl.querySelectorAll('.geo-suggest-check:checked')).map(c => _suggestCandidates[parseInt(c.value, 10)]);
    const toCreate = checked.filter(c => c && !c.already_exists);
    if (!toCreate.length) {
      setStatus('没有可创建的新竞品', 'info');
      return;
    }
    setStatus(`创建 ${toCreate.length} 个竞品品牌...`, 'loading');
    const created = [];
    for (const c of toCreate) {
      try {
        // v0.27: 自动创建竞品时带上 AI 推断的行业（同焦点品牌细分赛道），行业排名/指数基准池直接可用
        const r = await api('POST', '/api/geo/brands', { name: c.name, domain: c.domain || (c.name + '.com'), industry: c.industry || '' });
        if (r.data?.ok) created.push(r.data.brand);
      } catch (_) { /* 单条失败跳过 */ }
    }
    // 加入当前 watch 表单的竞品勾选
    const cbRoot = _byId('geo-watch-competitor-checkbox');
    if (cbRoot && created.length) {
      const existing = new Set(Array.from(cbRoot.querySelectorAll('input:checked')).map(i => i.value));
      created.forEach(b => {
        if (!existing.has(b.id)) {
          const label = document.createElement('label');
          label.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer';
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.value = b.id;
          input.checked = true;
          label.appendChild(input);
          label.appendChild(document.createTextNode(' ' + b.name));
          cbRoot.appendChild(label);
        }
      });
    }
    setStatus(`已创建 ${created.length} 个竞品品牌并勾选，点击「💾 创建」完成监控`, 'success');
    notify(`👁 已自动创建 ${created.length} 个竞品品牌`, 'success');
    if (listEl) listEl.style.display = 'none';
    // 刷新品牌下拉（Tab2 下次加载会更新；这里同步填充下拉缓存）
    const brandsRes = await api('GET', '/api/geo/brands');
    _watchBrandsCache = brandsRes.data?.brands || [];
  }

  // === 行业排名/指数（v0.23）===
  async function loadRanking(brands) {
    const container = _byId('geo-rank-container');
    if (!container) return;
    if (!currentBrandId) {
      container.innerHTML = '<div class="geo-dim-empty">选择品牌后查看其在行业基准池内的排名和指数</div>';
      return;
    }
    container.innerHTML = '<div class="geo-dim-empty">加载中...</div>';
    try {
      const r = await api('GET', '/api/geo/ranking?brand_id=' + currentBrandId);
      if (r.status === 404) {
        container.innerHTML = '<div class="geo-dim-empty">后端尚未重启（/api/geo/ranking 端点未生效）。重启 ACMS 后显示。</div>';
        return;
      }
      const d = r.data || {};
      if (!d.ok) {
        container.innerHTML = '<div class="geo-dim-empty">' + esc(d.message || d.error || '暂无数据') + '</div>';
        return;
      }
      const idxColor = d.index != null ? (d.index >= 100 ? 'var(--geo-ok,#4ade80)' : 'var(--geo-warn,#e8a33d)') : 'inherit';
      const deltaTxt = d.delta_vs_median == null ? '—' : (d.delta_vs_median >= 0 ? '+' + d.delta_vs_median : String(d.delta_vs_median));
      let html = `
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
          <div class="geo-rank-medal" style="text-align:center;padding:10px 18px;background:var(--geo-bg-2,#111);border-radius:10px;border:1px solid var(--geo-border,#333)">
            <div style="font-size:11px;opacity:.7">行业排名</div>
            <div style="font-size:26px;font-weight:800">第 ${d.rank}<span style="font-size:14px">/${d.total}</span></div>
            <div style="font-size:11px;opacity:.6">${esc(d.industry || '')}</div>
          </div>
          <div style="text-align:center;padding:10px 18px;background:var(--geo-bg-2,#111);border-radius:10px;border:1px solid var(--geo-border,#333)">
            <div style="font-size:11px;opacity:.7">行业指数</div>
            <div style="font-size:26px;font-weight:800;color:${idxColor}">${d.index ?? '—'}</div>
            <div style="font-size:11px;opacity:.6">行业中位数=${d.median_score ?? '—'}</div>
          </div>
          <div style="text-align:center;padding:10px 18px;background:var(--geo-bg-2,#111);border-radius:10px;border:1px solid var(--geo-border,#333)">
            <div style="font-size:11px;opacity:.7">分位</div>
            <div style="font-size:26px;font-weight:800">P${d.percentile ?? '—'}</div>
            <div style="font-size:11px;opacity:.6">超过 ${d.percentile ?? 0}% 同行</div>
          </div>
          <div style="text-align:center;padding:10px 18px;background:var(--geo-bg-2,#111);border-radius:10px;border:1px solid var(--geo-border,#333)">
            <div style="font-size:11px;opacity:.7">vs 行业平均</div>
            <div style="font-size:26px;font-weight:800;color:${d.delta_vs_median >= 0 ? 'var(--geo-ok,#4ade80)' : 'var(--geo-warn,#e8a33d)'}">${deltaTxt}</div>
            <div style="font-size:11px;opacity:.6">${d.sov != null ? `SoV ${d.sov}% (第${d.sov_rank}名)` : 'SoV 暂无'}</div>
          </div>
        </div>`;
      // 池内排名表（前 6 + 焦点）
      const pool = d.pool || [];
      html += '<div style="font-size:12px;opacity:.85;margin-bottom:4px">基准池排名</div><table class="geo-table" style="font-size:12px"><thead><tr><th style="width:40px">#</th><th>品牌</th><th style="width:70px">行业</th><th style="width:60px">分数</th><th style="width:50px">等级</th></tr></thead><tbody>';
      pool.slice(0, 8).forEach((p, i) => {
        const isFocus = p.brand_id === currentBrandId;
        html += `<tr style="${isFocus ? 'background:var(--geo-bg-2,#111);font-weight:700' : ''}"><td>${i + 1}</td><td>${esc(p.name)}${isFocus ? ' ⭐' : ''}</td><td style="opacity:.7">${esc(p.industry || '—')}</td><td>${p.score ?? '—'}</td><td>${esc(p.grade || '')}</td></tr>`;
      });
      if (pool.length > 8) html += `<tr><td colspan="5" style="opacity:.5;text-align:center">… 共 ${pool.length} 个品牌</td></tr>`;
      html += '</tbody></table>';
      html += `<div style="margin-top:6px;font-size:11px;opacity:.6" class="geo-tip" data-tip="${esc(d.note || '')}">💡 ${esc(d.note || '')}</div>`;
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = `<div class="geo-dim-empty">加载失败: ${esc(e.message)}</div>`;
    }
  }

  // === Tab 8: 设置 ===
  async function loadSettings() {
    setStatus('加载设置...', 'loading');
    try {
      // 引擎状态
      const [enginesRes, cronRes] = await Promise.all([
        api('GET', '/api/geo/engines'),
        api('GET', '/api/geo/cron/status'),
      ]);
      renderEngineGrid(enginesRes.data?.engines || {}, enginesRes.data?.capabilities || {}, _byId('geo-settings-engine-grid'));

      // cron 状态
      const cronEl = _byId('geo-cron-status-value');
      if (cronEl) {
        const status = cronRes.data?.status;
        if (status) {
          const running = status.running ? '运行中' : '未启动';
          const schedule = status.schedule || '—';
          const lastRun = status.last_run ? new Date(status.last_run).toLocaleString('zh-CN') : '从未';
          const nextRun = status.next_run ? new Date(status.next_run).toLocaleString('zh-CN') : '—';
          cronEl.innerHTML = `调度: ${esc(schedule)}<br>状态: ${running}<br>上次: ${esc(lastRun)}<br>下次: ${esc(nextRun)}`;
        } else {
          cronEl.textContent = 'Cronjob 未启动（ACMS 重启后自动）';
        }
      }

      // 导出提示
      const hint = _byId('geo-export-hint');
      if (hint) hint.textContent = currentBrandId ? `将导出当前品牌的数据` : `将导出所有品牌（未选品牌时）`;

      // 调度设置（Phase 3 #3）
      const settingsRes = await api('GET', '/api/geo/settings');
      const settings = settingsRes.data?.settings;
      if (settings) {
        const intervalInput = _byId('geo-track-interval-input');
        if (intervalInput) intervalInput.value = settings.track_interval_days || 7;
        renderEngineCheckGrid(settings);
      }

      // 推送配置（v0.11）
      await loadPushConfig();

      setStatus('设置已加载', 'success');
    } catch (e) {
      setStatus('设置加载失败: ' + e.message, 'error');
    }
  }

  // === Tab 8 补充：推送配置（v0.11）===
  async function loadPushConfig() {
    try {
      const r = await api('GET', '/api/geo/push/config');
      const cfg = r.data || {};
      const emailInput = _byId('geo-push-email-input');
      const webhookInput = _byId('geo-push-webhook-input');
      if (emailInput) emailInput.value = (cfg.email_to || []).join(', ');
      if (webhookInput) webhookInput.value = cfg.webhook_url || '';
      const hint = _byId('geo-push-hint');
      if (hint) hint.textContent = `当前: ${cfg.email_configured ? 'Email ✅' : 'Email 未配'} / ${cfg.webhook_configured ? 'Webhook ✅' : 'Webhook 未配'}`;
    } catch (e) {
      /* 推送配置加载失败不阻断 */
    }
  }

  async function savePushConfig() {
    const email = _byId('geo-push-email-input')?.value.trim() || '';
    const webhook = _byId('geo-push-webhook-input')?.value.trim() || '';
    setStatus('保存推送配置...', 'loading');
    const r = await api('POST', '/api/geo/push/config', { email_to: email, webhook_url: webhook });
    if (r.data?.ok) {
      setStatus('推送配置已保存', 'success');
      notify(`📤 推送配置已保存`, 'success');
      const hint = _byId('geo-push-hint');
      if (hint) hint.textContent = `当前: ${r.data.email_configured ? 'Email ✅' : 'Email 未配'} / ${r.data.webhook_configured ? 'Webhook ✅' : 'Webhook 未配'}`;
    } else {
      setStatus('保存失败: ' + (r.data?.error || r.status), 'error');
    }
  }

  async function testPushMonthly() {
    if (!currentBrandId) {
      setStatus('请先选择品牌', 'error');
      return;
    }
    setStatus('测试推送月报...', 'loading');
    const r = await api('POST', '/api/geo/push/monthly', { brand_id: currentBrandId, includePdf: true });
    if (r.data?.ok) {
      const parts = [
        r.data.email?.sent ? `Email ✅` : `Email ${r.data.email?.skipped ? '(未配置，跳过)' : '❌'}`,
        r.data.webhook?.sent ? `Webhook ✅` : `Webhook ${r.data.webhook?.skipped ? '(未配置，跳过)' : '❌'}`,
      ];
      setStatus('测试推送完成: ' + parts.join(' / '), 'success');
      notify(`📤 测试推送完成: ${parts.join(' / ')}`, 'success');
    } else {
      setStatus('推送失败: ' + (r.data?.error || r.data?.message || r.status), 'error');
    }
  }

  // === Tab 8 补充：报告生成（v0.11）===
  function requireBrand() {
    if (!currentBrandId) {
      setStatus('请先在顶栏选择品牌', 'error');
      return false;
    }
    return true;
  }

  async function generateWeeklyMD() {
    if (!requireBrand()) return;
    setStatus('生成周报 (MD)...', 'loading');
    const r = await api('GET', `/api/geo/report/weekly/${currentBrandId}`);
    if (r.status === 200 && r.data) {
      const md = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
      const hint = _byId('geo-report-hint');
      if (hint) hint.textContent = `周报已生成（${md.length} 字符）`;
      notify(`📊 周报已生成（${md.length} 字符）`, 'success');
      setStatus('周报已生成', 'success');
      await showModal({ title: '📄 GEO 周报 (Markdown)', message: md.slice(0, 3000), textarea: true });
    } else {
      setStatus('周报生成失败: ' + r.status, 'error');
    }
  }

  // v0.29: PDF 报告生成 — 触发浏览器原生下载（修多多「PDF 找不到」toast 骗人 bug）
  async function generateReportPdf(type) {
    if (!requireBrand()) return;
    setStatus(`生成${type} PDF...`, 'loading');
    let r;
    if (type === 'weekly') r = await api('POST', '/api/geo/report/pdf/weekly', { brand_id: currentBrandId });
    else if (type === 'monthly') r = await api('POST', '/api/geo/report/pdf/monthly', { brand_id: currentBrandId });
    else if (type === 'monthly_persist') r = await api('POST', '/api/geo/report/monthly', { brand_id: currentBrandId, persist: true });
    if (r.data?.ok) {
      // v0.29: 触发浏览器原生下载（之前只 toast 路径，多多「PDF 找不到」根因）
      const filename = r.data.saved_path ? String(r.data.saved_path).split(/[\\/]/).pop() : null;
      if (filename) {
        window.open(`/api/geo/reports/download/${encodeURIComponent(filename)}`, '_blank');
      }
      setStatus(`📥 已开始下载: ${filename || (type === 'weekly' ? '周报' : '月报')} PDF`, 'success');
      notify(`📥 ${type === 'weekly' ? '周报' : '月报'} PDF 下载已开始`, 'success');
    } else {
      setStatus(`生成失败: ${r.data?.error || r.data?.message || r.status}`, 'error');
    }
  }

  async function generateComparisonPdf() {
    const brands = await api('GET', '/api/geo/brands');
    const list = (brands.data?.brands || []).filter(b => b.status === 'active');
    if (list.length < 2) {
      setStatus('对比报告需要至少 2 个品牌', 'error');
      return;
    }
    const result = await showModal({
      title: '⚖️ 生成对比 PDF',
      message: `将对比以下 ${list.length} 个品牌：\n` + list.map(b => `• ${b.name}`).join('\n'),
      actions: [
        { label: '取消', value: null },
        { label: '生成', value: 'SUBMIT', className: 'acms-modal-btn' },
      ],
    });
    if (result !== 'SUBMIT') return;
    setStatus('生成对比 PDF...', 'loading');
    const r = await api('POST', '/api/geo/report/pdf/comparison', { brand_ids: list.map(b => b.id) });
    if (r.data?.ok) {
      // v0.29: 同样触发浏览器下载（之前同样漏掉 — 同 bug）
      const filename = r.data.saved_path ? String(r.data.saved_path).split(/[\\/]/).pop() : null;
      if (filename) {
        window.open(`/api/geo/reports/download/${encodeURIComponent(filename)}`, '_blank');
      }
      setStatus(`📥 对比 PDF 已开始下载: ${filename || 'ok'}`, 'success');
      notify(`📥 对比 PDF 下载已开始（${list.length} 品牌）`, 'success');
    } else {
      setStatus(`生成失败: ${r.data?.error || r.data?.message || r.status}`, 'error');
    }
  }

  // === Tab 1：审计（v0.11）===
  async function runAudit() {
    if (!requireBrand()) return;
    setStatus('跑审计中（含 LLM 分析，约 5-15 秒）...', 'loading');
    const r = await api('POST', '/api/geo/audit', { brand_id: currentBrandId });
    if (r.data?.ok) {
      renderAudit(r.data);
      setStatus('审计完成', 'success');
      notify(`🔍 审计完成: ${r.data.score?.grade || ''} ${r.data.score?.score != null ? r.data.score.score + '分' : ''}`, 'success');
    } else {
      setStatus('审计失败: ' + (r.data?.message || r.data?.error || r.status), 'error');
    }
  }

  function renderAudit(a) {
    const container = _byId('geo-audit-container');
    if (!container) return;
    container.style.display = '';
    const sc = a.score || {};
    const comps = sc.components || {};
    const recs = a.recommendations || [];
    container.innerHTML = `
      <div class="geo-opt-card">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>🔍 审计结果 — ${esc(a.brand_name || currentBrandId)}</strong>
          <span style="font-size:20px;font-weight:700">${sc.score != null ? sc.score + ' 分' : '—'} <span class="geo-grade">${esc(sc.grade || '')}</span></span>
        </div>
        <div style="margin-top:6px;font-size:13px;opacity:.85">
          提及率 ${comps.mention_rate != null ? (comps.mention_rate * 100).toFixed(0) + '%' : '—'} ·
          位置分 ${comps.position_score != null ? (comps.position_score * 100).toFixed(0) + '%' : '—'} ·
          上下文 ${comps.context_score != null ? (comps.context_score * 100).toFixed(0) + '%' : '—'} ·
          引擎一致性 ${comps.engine_consistency != null ? (comps.engine_consistency * 100).toFixed(0) + '%' : '—'} ·
          新鲜度 ${comps.freshness != null ? (comps.freshness * 100).toFixed(0) + '%' : '—'}
        </div>
        ${recs.length ? `<div style="margin-top:8px"><strong>建议（${recs.length} 条）：</strong><ul style="margin:6px 0 0 18px;font-size:13px">${recs.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
        ${a.llms_txt_status ? `<div style="margin-top:8px;font-size:12px;opacity:.75">llms.txt: ${a.llms_txt_status.has_llms_txt ? '存在' : '缺失'}${a.llms_txt_status.valid ? ' · 有效' : ''}</div>` : ''}
        ${a.third_party_signals ? `<div style="margin-top:8px;font-size:12px" class="geo-tip" data-tip="第三方引用（媒体/论坛/评测/社交）是 AI 可见性的强信号，比外链相关性强 3 倍（Ahrefs 2025）"><span style="opacity:.75">第三方提及信号:</span> <strong>${Math.round((a.third_party_signals.score || 0) * 100)}%</strong> <span style="opacity:.7">${esc(a.third_party_signals.message || '')}</span></div>` : ''}
        ${a.robots_txt ? `<div style="margin-top:6px;font-size:12px;color:${a.robots_txt.status === 'ok' ? 'var(--geo-ok,#4ade80)' : 'var(--geo-warn,#e8a33d)'}" class="geo-tip" data-tip="检查 GPTBot/ClaudeBot/PerplexityBot/Google-Extended 等 AI 爬虫是否被 robots.txt 屏蔽">🤖 ${esc(a.robots_txt.message || '')}</div>` : ''}
      </div>`;
  }

  function renderEngineCheckGrid(settings) {
    const grid = _byId('geo-engine-check-grid');
    if (!grid) return;
    const all = settings.all_engines || [];
    const selected = settings.engine_whitelist || [];
    const labels = {
      deepseek: 'DeepSeek', openai: 'OpenAI', claude: 'Claude', perplexity: 'Perplexity',
      google: 'Gemini', copilot: 'Copilot', grok: 'Grok', google_ai_mode: 'AI Mode',
      'deepseek-web': 'DeepSeek 网页版 🔍', minimax: 'MiniMax',
    };
    grid.innerHTML = all.map(name => `
      <label class="geo-check-item">
        <input type="checkbox" value="${name}" ${selected.includes(name) ? 'checked' : ''}>
        <span>${labels[name] || name}</span>
      </label>
    `).join('');
  }

  async function saveTrackInterval() {
    const input = _byId('geo-track-interval-input');
    if (!input) return;
    const days = parseInt(input.value, 10);
    if (isNaN(days) || days < 1 || days > 90) {
      setStatus('频率必须是 1-90 天', 'error');
      return;
    }
    const r = await api('POST', '/api/geo/settings', { track_interval_days: days });
    if (r.data?.ok) {
      setStatus(`已保存: 每 ${days} 天自动跟踪`, 'success');
    } else {
      setStatus('保存失败: ' + (r.data?.error || r.status), 'error');
    }
  }

  async function saveEngineWhitelist() {
    const grid = _byId('geo-engine-check-grid');
    if (!grid) return;
    const selected = [];
    grid.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => selected.push(cb.value));
    const r = await api('POST', '/api/geo/settings', { engine_whitelist: selected });
    if (r.data?.ok) {
      setStatus(`已保存: ${selected.length} 个引擎`, 'success');
    } else {
      setStatus('保存失败: ' + (r.data?.error || r.status), 'error');
    }
  }

  async function resetEngineWhitelist() {
    const grid = _byId('geo-engine-check-grid');
    if (!grid) return;
    grid.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true; });
    await saveEngineWhitelist();
  }

  async function exportData(type, format) {
    setStatus('导出中...', 'loading');
    const fmt = format || 'xlsx';
    const url = `/api/geo/export?type=${type}&format=${fmt}` + (currentBrandId ? `&brand_id=${currentBrandId}` : '');
    // 用 a 标签下载
    const a = document.createElement('a');
    a.href = url + '&api_key=' + AK_VALUE;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus('导出已开始（浏览器下载）', 'success');
    notify(`📤 导出 ${type === 'responses' ? '追踪记录' : '评分'} (${fmt.toUpperCase()}) 已开始`, 'info');
  }

  // === Tab 7: llms.txt ===
  async function loadLLMS() {
    setStatus('加载 llms.txt...', 'loading');
    try {
      const r = await api('GET', '/api/geo/health');
      const dir = r.data?.llms_txt_dir;
      const statusDiv = _byId('geo-llms-status');
      const listEl = _byId('geo-llms-list');
      if (statusDiv) {
        statusDiv.innerHTML = `
          <div class="geo-info-card">
            <div class="geo-info-label">存储目录</div>
            <div class="geo-info-value">${esc(dir || '—')}</div>
          </div>
          <div class="geo-info-card">
            <div class="geo-info-label">使用方式</div>
            <div class="geo-info-value">小吉对话：「用 generate_llms_txt 给 example.com 生成 llms.txt」</div>
          </div>
        `;
      }
      // 简化列表 — 客户端无法直接列目录，仅显示健康信息
      if (listEl) listEl.innerHTML = '<li class="geo-empty">查看服务器目录：' + esc(dir || '—') + '</li>';
      setStatus('已加载', 'success');
    } catch (e) {
      setStatus('llms.txt 加载失败: ' + e.message, 'error');
    }
  }

  async function generateLLMS() {
    const url = _byId('geo-llms-url-input')?.value?.trim();
    if (!url) {
      await showModal({ title: '提示', message: '请输入 URL' });
      return;
    }
    setStatus('生成中...', 'loading');
    const r = await api('POST', '/api/geo/llms-txt/generate', { url });
    if (r.data?.ok) {
      setStatus(`已生成: ${r.data.saved_path}`, 'success');
      await loadLLMS();
    } else {
      setStatus(`生成失败: ${r.data?.error || r.data?.message || r.status}`, 'error');
      await showModal({ title: '❌ 生成失败', message: r.data?.error || r.data?.message || r.status || '未知错误' });
    }
  }

  // === Modal 弹窗（v0.6: 使用通用组件 ACMSModal，替代内嵌 showModal）===
  async function showModal(options) {
    if (window.ACMSModal && typeof window.ACMSModal.show === 'function') {
      return window.ACMSModal.show({ ...options, root: wRef?.$c });
    }
    // fallback: ACMSModal 未加载时返回 null（调用方按取消处理）
    console.warn('[geo-dashboard] ACMSModal 未加载，modal 操作被取消');
    return null;
  }

  // === 通知中心集成（Phase 4）===
  function notify(title, type) {
    try {
      if (window.ACMS && window.ACMS.Notif && typeof window.ACMS.Notif.add === 'function') {
        window.ACMS.Notif.add({ icon: '🌐', title, desc: '', type: type || 'info' });
      }
    } catch (e) { /* 通知失败不影响主流程 */ }
  }

  // === AI 优化建议（Phase 3 #6）===
  let lastOptimizeResult = null;

  async function generateOptimization() {
    if (!currentBrandId) {
      await showModal({ title: '提示', message: '请先选择品牌' });
      return;
    }
    const container = _byId('geo-opt-container');
    const btn = _byId('geo-optimize-btn');
    const refreshBtn = _byId('geo-optimize-refresh-btn');
    if (!container) return;

    setStatus('AI 分析中（5-10 秒）...', 'loading');
    if (btn) btn.disabled = true;
    container.innerHTML = '<div class="geo-dim-empty">⏳ AI 正在分析 GEO 数据...（首次约 5-10 秒）</div>';

    try {
      const r = await api('POST', '/api/geo/optimize', { brand_id: currentBrandId });
      if (r.data?.ok) {
        lastOptimizeResult = r.data;
        renderOptimization(r.data);
        if (refreshBtn) refreshBtn.style.display = '';
        setStatus('AI 建议已生成', 'success');
        notify(`🤖 AI 优化建议已生成（${(r.data.recommendations || []).length} 条）`, 'success');
      } else {
        container.innerHTML = `<div class="geo-dim-empty">❌ 生成失败: ${esc(r.data?.error || r.data?.message || r.status)}</div>`;
        setStatus('生成失败', 'error');
      }
    } catch (e) {
      container.innerHTML = `<div class="geo-dim-empty">❌ 生成失败: ${esc(e.message)}</div>`;
      setStatus('生成失败', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function renderOptimization(data) {
    const container = _byId('geo-opt-container');
    if (!container) return;

    const recs = data.recommendations || [];
    const priorityEmoji = { HIGH: '🔴', MEDIUM: '🟡', LOW: '🟢' };
    const typeLabels = { CONTENT: '内容', FAQ: 'FAQ', SCHEMA: '结构化数据', LLMS: 'llms.txt', CITATION: '外部引用', AUTHORITY: '权威性', STRATEGY: '策略' };

    let html = `
      <div class="geo-info-card">
        <div class="geo-info-label">AI 分析（${esc(data.model_used || 'LLM')} / ${(data.duration_ms || 0) / 1000}s）</div>
        <div class="geo-info-value">${esc(data.analysis || '')}</div>
      </div>
    `;

    if (recs.length === 0) {
      html += '<div class="geo-dim-empty">⚠️ AI 未返回结构化建议（可能输出格式异常）。点击「🔄 重新生成」重试。</div>';
    } else {
      html += `<div class="geo-opt-list">`;
      recs.forEach((r, i) => {
        html += `
          <div class="geo-opt-item">
            <div class="geo-opt-header">
              <span class="geo-opt-priority">${priorityEmoji[r.priority] || '⚪'} ${esc(r.priority || '')}</span>
              <span class="geo-opt-type geo-badge geo-badge-gray">${typeLabels[r.type] || esc(r.type)}</span>
              <span class="geo-opt-title">${esc(r.title)}</span>
              <button class="geo-btn geo-btn-sm geo-opt-apply" data-rec-index="${i}" title="转为 Kanban 任务">📌 建任务</button>
            </div>
            <div class="geo-opt-detail">${esc(r.detail || '')}</div>
            ${(r.actions || []).length ? `<div class="geo-opt-actions"><strong>行动项:</strong><br>${r.actions.map((a, ai) => `${ai + 1}. ${esc(a)}`).join('<br>')}</div>` : ''}
          </div>
        `;
      });
      html += '</div>';
    }

    container.innerHTML = html;

    // 绑定「建任务」按钮
    container.querySelectorAll('.geo-opt-apply').forEach(btn => {
      btn.onclick = () => applyRecommendation(btn.dataset.recIndex);
    });
  }

  async function applyRecommendation(index) {
    if (!lastOptimizeResult) return;
    setStatus('创建 Kanban 任务...', 'loading');
    const r = await api('POST', '/api/geo/optimize/apply', {
      brand_id: currentBrandId,
      recommendation_index: Number(index),
    });
    if (r.data?.ok) {
      setStatus(`已创建任务: ${r.data.task.title}`, 'success');
      notify(`📌 GEO 任务已创建: ${r.data.task.title}`, 'success');
      await showModal({
        title: '📌 任务已创建',
        message: `已创建 Kanban 任务:\n${r.data.task.title}\n\n到「任务看板」拖到 in_progress 即可自动执行。`,
        fields: [],
        actions: [{ label: '关闭', value: null, className: 'geo-btn' }],
      });
    } else {
      setStatus('创建失败: ' + (r.data?.error || r.status), 'error');
    }
  }

  // === v0.33: Opportunities 智能推荐面板 ===
  async function loadOpportunities(brandId, forceRefresh = false) {
    const container = _byId('geo-opp-content');
    if (!container) return;

    const bid = brandId || currentBrandId;
    if (!bid) {
      container.innerHTML = '<div class="geo-dim-empty">请先选择一个品牌</div>';
      return;
    }

    container.innerHTML = '<div class="geo-opp-loading">AI 正在分析数据生成推荐...</div>';

    try {
      // 先获取已有数据
      const listR = await api('GET', `/api/geo/opportunities/${bid}?limit=1`);
      const existing = listR.data?.opportunities || [];

      let record;
      if (existing.length > 0 && !forceRefresh) {
        record = existing[0];
      } else {
        const genR = await api('POST', '/api/geo/opportunities/generate', {
          brand_id: bid,
          lookbackDays: 30,
          force_refresh: forceRefresh,
        });
        if (!genR.data?.ok) throw new Error(genR.data?.error || '生成失败');
        record = genR.data.data;
      }

      const data = record.data || {};
      renderOpportunitiesPanel(data, record);
      notify('💡 智能推荐已生成', 'success');
    } catch (e) {
      container.innerHTML = `<div class="geo-dim-empty">❌ 生成失败: ${esc(e.message)}</div>`;
    }
  }

  function renderOpportunitiesPanel(data, record) {
    const container = _byId('geo-opp-content');
    if (!container) return;

    const { summary = [], opportunities = [], risks = [], contentGaps = [] } = data;
    const generatedAt = record?.created_at ? new Date(record.created_at).toLocaleString('zh-CN') : '';

    let html = '';

    // Summary
    if (summary.length > 0) {
      html += `<div class="geo-opp-summary"><h4>📋 核心洞察</h4><ul>${summary.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>`;
    }

    // Opportunities
    if (opportunities.length > 0) {
      html += '<div class="geo-opp-list">';
      for (const opp of opportunities) {
        const catLabel = { creation: '新建内容', 'existing-content': '优化现有', outreach: '外部引用', social: '社区曝光' }[opp.category] || opp.category;
        const diffLabel = { 'wide-open': '容易突破', contested: '有一定竞争', 'locked-in': '难以突破' }[opp.difficulty] || opp.difficulty;
        const diffClass = opp.difficulty || 'contested';

        html += `
          <div class="geo-opp-card">
            <div class="geo-opp-card-header">
              <h4 class="geo-opp-card-title">${esc(opp.title || '')}</h4>
              <span class="geo-opp-category ${esc(opp.category || '')}">${esc(catLabel)}</span>
            </div>
            <p class="geo-opp-card-why">${esc(opp.why || '')}</p>
            <div class="geo-opp-card-meta">
              <span class="geo-opp-difficulty ${diffClass}">🎯 ${esc(diffLabel)}</span>
              ${(opp.relatedPrompts || []).length > 0 ? `<span>关联 ${opp.relatedPrompts.length} 个 prompt</span>` : ''}
            </div>
            ${(opp.relatedPrompts || []).length > 0 ? `
              <div class="geo-opp-related-prompts">
                <strong>关联 Prompt:</strong><br>
                ${(opp.relatedPrompts || []).map(p => esc(p.text || p)).join('<br>')}
              </div>
            ` : ''}
          </div>
        `;
      }
      html += '</div>';
    } else {
      html += '<div class="geo-dim-empty">暂无推荐机会（可能需要更多数据）</div>';
    }

    // Content Gaps
    if (contentGaps && contentGaps.length > 0) {
      html += `
        <div class="geo-opp-gaps">
          <h4>🔴 内容缺口（竞品被提但品牌未提）</h4>
          ${contentGaps.map(g => `
            <div class="geo-opp-gap-item">
              <div class="geo-opp-gap-prompt">${esc(g.prompt || '')}</div>
              <div class="geo-opp-gap-meta">${g.runs || 0} 次追踪 · ${esc(g.category || '')}</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Risks
    if (risks && risks.length > 0) {
      html += `
        <div class="geo-opp-risks">
          <h4>⚠️ 风险提示</h4>
          <ul>${risks.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
        </div>
      `;
    }

    // 生成时间
    html += `<div style="margin-top:16px;font-size:11px;color:var(--geo-text-2);text-align:right">${generatedAt}</div>`;

    container.innerHTML = html;
  }

  // === 通用 ===
  // v0.26: 文本高亮工具（借鉴 elmo text-highlighter.tsx）
  // 先 escape 整个 text，再用循环正则 replace 包裹 <mark> — 避免 XSS + 多次替换安全
  // highlights: [{ text: '...', className?: '...', style?: '...' }]
  function highlightText(text, highlights) {
    if (!text) return '';
    if (!highlights || highlights.length === 0) return esc(text);
    let out = esc(text);
    for (const h of highlights) {
      if (!h || !h.text) continue;
      const safe = esc(String(h.text));
      if (!safe.trim()) continue;
      const re = new RegExp('(' + safe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      const style = h.style || 'background:#fef08a;color:#854d0e;padding:0 2px;border-radius:2px';
      const className = h.className ? ` class="${h.className}"` : '';
      out = out.replace(re, `<mark${className} style="${style}">$1</mark>`);
    }
    return out;
  }

  // v0.26: InfoTip 工具（借鉴 elmo InfoTip 极简模式）— 显式 ℹ️ 小图标 + hover tooltip
  // 用法：createInfoTip('这里是说明文字') → 返回 <span class="geo-info-tip" data-tip="...">i</span>
  // content 必须先经 esc() 避免 XSS（已自动处理）
  function createInfoTip(content) {
    if (!content) return '';
    const safe = esc(String(content));
    return `<span class="geo-info-tip" data-tip="${safe}">i</span>`;
  }

  function esc(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // === Loader ===
  function loader(w) {
    cleanupFns.forEach(fn => { try { fn(); } catch (_) {} });
    cleanupFns = [];
    wRef = w;

    if (!document.getElementById('geo-dashboard-css')) {
      const link = document.createElement('link');
      link.id = 'geo-dashboard-css';
      link.rel = 'stylesheet';
      link.href = '/client/css/geo-dashboard.css?v=0.33';
      document.head.appendChild(link);
    }

      fetch('/client/views/geo-dashboard.html?v=0.33')
      .then(r => r.text())
      .then(html => {
        if (w.$c) w.$c.innerHTML = html;
        bindEvents();
        loadOverview(); // 默认显示总览
        setStatus('就绪 — Phase 1 Week 5', 'success');
      })
      .catch(e => {
        if (w.$c) w.$c.innerHTML = `<div style="padding:20px;color:#f55">加载失败: ${e.message}</div>`;
      });
  }

  function bindEvents() {
    const tabs = (wRef?.$c || document).querySelectorAll('.geo-tab');
    tabs.forEach(tab => {
      const handler = () => switchTab(tab.dataset.tab);
      tab.addEventListener('click', handler);
      cleanupFns.push(() => tab.removeEventListener('click', handler));
    });

    // 品牌选择器
    const select = _byId('geo-brand-select');
    if (select) {
      const handler = () => {
        // v0.30 修复：之前是 inline 写（设 currentBrandId + meta + loadOverview），绕过了 selectBrand
        // 导致 selectBrand 里的「aliasBtn 启用/禁用」逻辑永远不执行。
        // 统一走 selectBrand —— 它封装了所有切换品牌的副作用（启用 aliasBtn + meta + loadOverview + switchTab）
        selectBrand(select.value);
      };
      select.addEventListener('change', handler);
      cleanupFns.push(() => select.removeEventListener('change', handler));
    }

    // 刷新按钮
    const refresh = _byId('geo-refresh-btn');
    if (refresh) {
      const handler = () => {
        const active = (wRef?.$c || document).querySelector('.geo-tab.active')?.dataset.tab || 'overview';
        switchTab(active);
      };
      refresh.addEventListener('click', handler);
      cleanupFns.push(() => refresh.removeEventListener('click', handler));
    }

    // 品牌新建按钮
    const createBtn = _byId('geo-brand-create-btn');
    if (createBtn) {
      const handler = () => createBrand();
      createBtn.addEventListener('click', handler);
      cleanupFns.push(() => createBtn.removeEventListener('click', handler));
    }

    // v0.30: 别名编辑按钮（治「一个品牌多个名字漏匹配」）
    const aliasBtn = _byId('geo-brand-alias-btn');
    if (aliasBtn) {
      const handler = () => {
        if (aliasBtn.disabled) return;  // 防御 — 浏览器 native 不会触发，但保险
        editBrandAliases();
      };
      aliasBtn.addEventListener('click', handler);
      cleanupFns.push(() => aliasBtn.removeEventListener('click', handler));
    }

    // v0.30: 别名编辑 modal 内部「🧠 AI 推断」按钮 — 用 document 委托
    // （ACMSModal html 模式渲染在 overlay 容器中，mount 时尚未在 DOM；用事件冒泡）
    const aiInferHandler = (e) => {
      const target = e.target;
      if (target && target.dataset && target.dataset.action === 'ai') {
        e.preventDefault();
        e.stopPropagation();
        inferAliasesViaAI();
      }
    };
    document.addEventListener('click', aiInferHandler);
    cleanupFns.push(() => document.removeEventListener('click', aiInferHandler));

    // 跑跟踪按钮
    const runTrackBtn = _byId('geo-track-run-btn');
    if (runTrackBtn) {
      const handler = () => runTracker();
      runTrackBtn.addEventListener('click', handler);
      cleanupFns.push(() => runTrackBtn.removeEventListener('click', handler));
    }

    // v0.32: helper bar 三按钮（仅 init 一次性绑 —— 按钮 DOM 持久存在）
    const runnowAllBtn = _byId('geo-q-runnow-all-btn');
    if (runnowAllBtn) {
      const h = () => {
        document.querySelectorAll('.geo-q-runnow').forEach(cb => { cb.checked = true; });
        updateRunNowCount();
      };
      runnowAllBtn.addEventListener('click', h);
      cleanupFns.push(() => runnowAllBtn.removeEventListener('click', h));
    }
    const runnowNoneBtn = _byId('geo-q-runnow-none-btn');
    if (runnowNoneBtn) {
      const h = () => {
        document.querySelectorAll('.geo-q-runnow').forEach(cb => { cb.checked = false; });
        updateRunNowCount();
      };
      runnowNoneBtn.addEventListener('click', h);
      cleanupFns.push(() => runnowNoneBtn.removeEventListener('click', h));
    }
    const runnowEnabledBtn = _byId('geo-q-runnow-enabled-btn');
    if (runnowEnabledBtn) {
      // 「仅启用」= 勾上所有 .geo-q-enable 同行的「本次跑」checkbox。
      // 通过 sibling 关系：找到同一行 tr 内的两个 checkbox。
      const h = () => {
        document.querySelectorAll('.geo-q-runnow').forEach(cb => {
          const tr = cb.closest('tr');
          const enableCb = tr ? tr.querySelector('.geo-q-enable') : null;
          cb.checked = !!(enableCb && enableCb.checked);
        });
        updateRunNowCount();
      };
      runnowEnabledBtn.addEventListener('click', h);
      cleanupFns.push(() => runnowEnabledBtn.removeEventListener('click', h));
    }

    // 引擎过滤（v0.26: 由 geo-filter-bar 组件内部 onChange 触发 loadTracks，无需在此绑定）
    // 旧的 <select id="geo-track-engine-filter"> 已替换为 <div id="geo-track-engine-filterbar">
    // 见 renderTrackFilterBar() 与 loadTracks() 里的 _trackEngineFilter 状态

    // llms.txt 生成按钮
    const llmsBtn = _byId('geo-llms-generate-btn');
    if (llmsBtn) {
      const handler = () => generateLLMS();
      llmsBtn.addEventListener('click', handler);
      cleanupFns.push(() => llmsBtn.removeEventListener('click', handler));
    }

    // 提问模板生成按钮（旧版 4×6 完整问句）
    const qGenBtn = _byId('geo-queries-generate-btn');
    if (qGenBtn) {
      const handler = () => generateQueries();
      qGenBtn.addEventListener('click', handler);
      cleanupFns.push(() => qGenBtn.removeEventListener('click', handler));
    }

    // v0.26 C7 完整版: Onboarding 向导按钮
    const oboBtn = _byId('geo-onboarding-btn');
    if (oboBtn) {
      const handler = () => openOnboardingWizard();
      oboBtn.addEventListener('click', handler);
      cleanupFns.push(() => oboBtn.removeEventListener('click', handler));
    }

    // v0.26 C4: AI 生成按钮（LLM 短查询）
    const qAiBtn = _byId('geo-queries-ai-btn');
    if (qAiBtn) {
      const handler = () => generateQueriesAI();
      qAiBtn.addEventListener('click', handler);
      cleanupFns.push(() => qAiBtn.removeEventListener('click', handler));
    }

    // v0.26 C4: 批量导入按钮
    const qBulkBtn = _byId('geo-queries-bulk-btn');
    if (qBulkBtn) {
      const handler = () => importBulkQueries();
      qBulkBtn.addEventListener('click', handler);
      cleanupFns.push(() => qBulkBtn.removeEventListener('click', handler));
    }

    // v0.26: 清理历史模板按钮
    const qCleanBtn = _byId('geo-queries-cleanup-btn');
    if (qCleanBtn) {
      const handler = () => cleanupLegacyTemplates();
      qCleanBtn.addEventListener('click', handler);
      cleanupFns.push(() => qCleanBtn.removeEventListener('click', handler));
    }

    // 评分刷新按钮
    const scoresRefresh = _byId('geo-scores-refresh-btn');
    if (scoresRefresh) {
      const handler = () => loadScores();
      scoresRefresh.addEventListener('click', handler);
      cleanupFns.push(() => scoresRefresh.removeEventListener('click', handler));
    }

    // 快照刷新按钮
    const snapsRefresh = _byId('geo-snapshots-refresh-btn');
    if (snapsRefresh) {
      const handler = () => loadSnapshots();
      snapsRefresh.addEventListener('click', handler);
      cleanupFns.push(() => snapsRefresh.removeEventListener('click', handler));
    }

    // 导出按钮
    const exportResponses = _byId('geo-export-responses-btn');
    if (exportResponses) {
      const handler = () => exportData('responses', 'xlsx');
      exportResponses.addEventListener('click', handler);
      cleanupFns.push(() => exportResponses.removeEventListener('click', handler));
    }
    const exportScores = _byId('geo-export-scores-btn');
    if (exportScores) {
      const handler = () => exportData('scores', 'xlsx');
      exportScores.addEventListener('click', handler);
      cleanupFns.push(() => exportScores.removeEventListener('click', handler));
    }
    const exportResponsesCsv = _byId('geo-export-responses-csv-btn');
    if (exportResponsesCsv) {
      const handler = () => exportData('responses', 'csv');
      exportResponsesCsv.addEventListener('click', handler);
      cleanupFns.push(() => exportResponsesCsv.removeEventListener('click', handler));
    }
    const exportScoresCsv = _byId('geo-export-scores-csv-btn');
    if (exportScoresCsv) {
      const handler = () => exportData('scores', 'csv');
      exportScoresCsv.addEventListener('click', handler);
      cleanupFns.push(() => exportScoresCsv.removeEventListener('click', handler));
    }

    // AI 优化建议按钮
    const optBtn = _byId('geo-optimize-btn');
    if (optBtn) {
      const handler = () => generateOptimization();
      optBtn.addEventListener('click', handler);
      cleanupFns.push(() => optBtn.removeEventListener('click', handler));
    }
    const optRefresh = _byId('geo-optimize-refresh-btn');
    if (optRefresh) {
      const handler = () => generateOptimization();
      optRefresh.addEventListener('click', handler);
      cleanupFns.push(() => optRefresh.removeEventListener('click', handler));
    }

    // 调度设置按钮
    const saveInterval = _byId('geo-save-interval-btn');
    if (saveInterval) {
      const handler = () => saveTrackInterval();
      saveInterval.addEventListener('click', handler);
      cleanupFns.push(() => saveInterval.removeEventListener('click', handler));
    }
    const saveWhitelist = _byId('geo-save-whitelist-btn');
    if (saveWhitelist) {
      const handler = () => saveEngineWhitelist();
      saveWhitelist.addEventListener('click', handler);
      cleanupFns.push(() => saveWhitelist.removeEventListener('click', handler));
    }
    const resetWhitelist = _byId('geo-reset-whitelist-btn');
    if (resetWhitelist) {
      const handler = () => resetEngineWhitelist();
      resetWhitelist.addEventListener('click', handler);
      cleanupFns.push(() => resetWhitelist.removeEventListener('click', handler));
    }

    // v0.11: 审计按钮
    const auditBtn = _byId('geo-audit-btn');
    if (auditBtn) {
      const handler = () => runAudit();
      auditBtn.addEventListener('click', handler);
      cleanupFns.push(() => auditBtn.removeEventListener('click', handler));
    }

    // v0.11: 报告生成按钮
    const bindBtn = (id, fn) => {
      const el = _byId(id);
      if (!el) return;
      const h = fn;
      el.addEventListener('click', h);
      cleanupFns.push(() => el.removeEventListener('click', h));
    };
    bindBtn('geo-report-weekly-btn', () => generateWeeklyMD());
    bindBtn('geo-report-weekly-pdf-btn', () => generateReportPdf('weekly'));
    bindBtn('geo-report-monthly-btn', () => generateReportPdf('monthly_persist'));
    bindBtn('geo-report-monthly-pdf-btn', () => generateReportPdf('monthly'));
    bindBtn('geo-report-comparison-pdf-btn', () => generateComparisonPdf());

    // v0.11: 推送配置按钮
    bindBtn('geo-push-save-btn', () => savePushConfig());
    bindBtn('geo-push-test-btn', () => testPushMonthly());

    // v0.20: 拓词工作台
    bindBtn('geo-kw-expand-btn', () => expandKeywordsWorkbench());

    // v0.21: GEO 工具（JSON-LD / 标题 / 知识库）
    bindBtn('geo-tools-jsonld-btn', () => runGeoTool('jsonld'));
    bindBtn('geo-tools-titles-btn', () => runGeoTool('titles'));
    bindBtn('geo-tools-kb-btn', () => runGeoTool('kb'));

    // v0.33: Opportunities 智能推荐面板
    const oppPanel = _byId('geo-opp-panel');
    const oppContent = _byId('geo-opp-content');
    const oppRefreshBtn = _byId('geo-opp-refresh-btn');
    const oppCloseBtn = _byId('geo-opp-close-btn');

    if (oppCloseBtn) {
      oppCloseBtn.addEventListener('click', () => {
        oppPanel?.classList.remove('open');
        setTimeout(() => oppPanel?.style.setProperty('display', 'none'), 250);
      });
      cleanupFns.push(() => oppCloseBtn.removeEventListener('click', () => {}));
    }

    if (oppRefreshBtn) {
      oppRefreshBtn.addEventListener('click', () => loadOpportunities(currentBrandId, true));
      cleanupFns.push(() => oppRefreshBtn.removeEventListener('click', () => {}));
    }

    // 在品牌选择器 change 时自动关闭面板
    const brandSelect = _byId('geo-brand-select');
    if (brandSelect) {
      brandSelect.addEventListener('change', () => {
        if (oppPanel?.classList.contains('open')) {
          oppPanel.classList.remove('open');
          setTimeout(() => oppPanel?.style.setProperty('display', 'none'), 250);
        }
      });
      cleanupFns.push(() => brandSelect.removeEventListener('change', () => {}));
    }

    // v0.33: Opportunities 触发按钮
    const oppTriggerBtn = _byId('geo-opp-trigger-btn');
    if (oppTriggerBtn) {
      oppTriggerBtn.addEventListener('click', () => {
        if (currentBrandId) {
          window.toggleOpportunitiesPanel(currentBrandId);
        } else {
          alert('请先选择一个品牌');
        }
      });
      cleanupFns.push(() => oppTriggerBtn.removeEventListener('click', () => {}));
    }
    bindBtn('geo-watch-create-btn', () => toggleWatchForm(true));
    bindBtn('geo-watch-cancel-btn', () => toggleWatchForm(false));
    bindBtn('geo-watch-save-btn', () => saveWatch());
    bindBtn('geo-watch-run-all-btn', () => runAllWatches());
    bindBtn('geo-watch-suggest-btn', () => suggestCompetitorsFlow());

    // v0.11: Watch 列表事件委托（只在窗口实例绑一次，root 销毁即失效）
    const watchRoot = wRef?.$c || document;
    if (!watchRoot._geoWatchBound) {
      watchRoot._geoWatchBound = true;
      watchRoot.addEventListener('change', function (e) {
        const t = e.target;
        if (t && t.dataset && t.dataset.watchToggle) updateWatchEnabled(t.dataset.watchToggle, t.checked);
      });
      watchRoot.addEventListener('click', function (e) {
        const runBtn = e.target.closest ? e.target.closest('[data-watch-run]') : null;
        const delBtn = e.target.closest ? e.target.closest('[data-watch-delete]') : null;
        const repBtn = e.target.closest ? e.target.closest('[data-watch-report]') : null;
        const openBtn = e.target.closest ? e.target.closest('.geo-track-open') : null;
        if (runBtn) runOneWatch(runBtn.dataset.watchRun);
        else if (delBtn) deleteWatchFlow(delBtn.dataset.watchDelete);
        else if (repBtn) viewWatchReport(repBtn.dataset.watchReport);
        else if (openBtn) viewResponseDetail(parseInt(openBtn.dataset.idx, 10));
      });
    }
  }

  // === 注册 ===
  // v0.4.1: 改用 ACMS.registerPackage 走 PKG 系统（launchView 需要 defaultSize/title/icon）
  //   registerPackage 内部自动 ACMSWin.registerViewLoader + labels + 命令面板 + _viewLoaderQueue 入队防御
  //   这样「辅助工具」子菜单 launchView('geo-dashboard') 能打开正确尺寸窗口
  if (window.ACMS && typeof window.ACMS.registerPackage === 'function') {
    ACMS.registerPackage(VIEW_NAME, {
      title: 'GEO 仪表盘',
      icon: '🌐',
      category: '工具',
      defaultSize: { w: 1200, h: 800 },
      loader: loader,
    });
  } else if (typeof ACMSWin !== 'undefined' && ACMSWin.registerViewLoader) {
    // fallback: ACMS registry 未加载时直接注册 ACMSWin loader
    ACMSWin.registerViewLoader(VIEW_NAME, loader);
  }

  // v0.33: 暴露 Opportunities 接口到全局
  if (typeof window !== 'undefined') {
    window.toggleOpportunitiesPanel = function (brandId) {
      const panel = _byId('geo-opp-panel');
      if (!panel) return;
      if (panel.classList.contains('open')) {
        panel.classList.remove('open');
        setTimeout(() => panel.style.setProperty('display', 'none'), 250);
      } else {
        panel.style.setProperty('display', 'flex');
        setTimeout(() => panel.classList.add('open'), 10);
        loadOpportunities(brandId || currentBrandId);
      }
    };
  }

})();