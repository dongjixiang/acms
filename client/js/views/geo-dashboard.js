// ACMS GEO 应用 — 仪表盘逻辑（v0.2 — Phase 1 Week 5，真实数据）
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

      // 引擎状态网格
      renderEngineGrid(enginesRes.data?.engines || {});

      // KPI 2: 综合分（选品牌时算）
      await loadOverviewScore(brands);

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

  // === 雷达图（SVG，5 维度）===
  function renderRadar(components) {
    const container = _byId('geo-radar-container');
    if (!container) return;
    if (!components) {
      container.innerHTML = '<div class="geo-dim-empty">选择品牌后查看雷达图</div>';
      return;
    }

    const dims = ['mention_rate', 'position_score', 'context_score', 'engine_consistency', 'freshness'];
    const labels = { mention_rate: '提及率', position_score: '位置分', context_score: '上下文分', engine_consistency: '一致性', freshness: '时效性' };
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
    // 数据多边形
    const dataPts = dims.map((d, i) => {
      const v = Math.max(0, Math.min(1, components[d] || 0));
      return point(i, v * R).join(',');
    }).join(' ');
    svg += `<polygon points="${dataPts}" fill="rgba(99,102,241,0.25)" stroke="#6366f1" stroke-width="2"/>`;
    // 数据点
    dims.forEach((d, i) => {
      const v = Math.max(0, Math.min(1, components[d] || 0));
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
  }

  function renderDimGrid(components) {
    const grid = _byId('geo-dim-grid');
    if (!grid) return;
    if (!components) {
      grid.innerHTML = '<div class="geo-dim-empty">选择品牌后查看</div>';
      return;
    }
    const labels = {
      mention_rate: '提及率',
      position_score: '位置分',
      context_score: '上下文分',
      engine_consistency: '引擎一致性',
      freshness: '时效性',
    };
    grid.innerHTML = Object.entries(components).map(([k, v]) => `
      <div class="geo-dim-card">
        <div class="geo-dim-label">${labels[k] || k}</div>
        <div class="geo-dim-bar"><div class="geo-dim-fill" style="width:${(v * 100).toFixed(0)}%"></div></div>
        <div class="geo-dim-value">${(v * 100).toFixed(0)}%</div>
      </div>
    `).join('');
  }

  function renderEngineGrid(engines) {
    const grid = _byId('geo-engine-grid');
    if (!grid) return;
    grid.innerHTML = Object.entries(engines).map(([name, info]) => `
      <div class="geo-engine-card ${info.configured ? 'geo-engine-ok' : 'geo-engine-warn'}">
        <div class="geo-engine-icon">${info.configured ? '✅' : '⚠️'}</div>
        <div class="geo-engine-name">${name}</div>
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
      tbody.innerHTML = '<tr><td colspan="5" class="geo-empty-cell">暂无品牌。点击右上"➕ 新建品牌"开始。</td></tr>';
      return;
    }
    tbody.innerHTML = brands.map(b => `
      <tr data-brand-id="${b.id}">
        <td><strong>${esc(b.name)}</strong></td>
        <td>${esc(b.domain)}</td>
        <td><span class="geo-badge geo-badge-${b.status === 'active' ? 'ok' : 'gray'}">${b.status}</span></td>
        <td>${(b.created_at || '').slice(0, 19).replace('T', ' ')}</td>
        <td>
          <button class="geo-btn geo-btn-sm" onclick="GEODashboard.selectBrand('${b.id}')">📊</button>
          <button class="geo-btn geo-btn-sm" onclick="GEODashboard.deleteBrand('${b.id}', '${esc(b.name)}')">🗑️</button>
        </td>
      </tr>
    `).join('');
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
    await loadOverview();
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
    const result = await showModal({
      title: '➕ 新建品牌',
      message: '添加一个要追踪 GEO 表现的品牌。',
      fields: [
        { name: 'name', label: '品牌名称', placeholder: '例如：MiniMax', required: true },
        { name: 'domain', label: '域名', placeholder: '例如：minimax.com', required: true },
      ],
    });
    if (!result || !result.name || !result.domain) return;
    setStatus('创建中...', 'loading');
    const r = await api('POST', '/api/geo/brands', { name: result.name, domain: result.domain });
    if (r.data?.ok) {
      setStatus(`已创建: ${r.data.brand.name}`, 'success');
      notify(`🏢 品牌「${r.data.brand.name}」已创建`, 'success');
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

  // === Tab 4: 追踪记录 ===
  async function loadTracks() {
    setStatus('加载追踪记录...', 'loading');
    try {
      const url = currentBrandId
        ? `/api/geo/responses?brand_id=${currentBrandId}&engine=${_byId('geo-track-engine-filter')?.value || ''}`
        : `/api/geo/responses?engine=${_byId('geo-track-engine-filter')?.value || ''}`;
      const r = await api('GET', url);
      const responses = r.data?.responses || [];
      renderTrackTable(responses);
      setStatus(`已加载 ${responses.length} 条记录`, 'success');
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
    tbody.innerHTML = responses.slice(0, 100).map(r => {
      const dt = new Date(r.ts || 0).toLocaleString('zh-CN', { hour12: false });
      const status = r.error ? `<span class="geo-badge geo-badge-err">❌ ${esc(r.error)}</span>` : '<span class="geo-badge geo-badge-ok">✅ OK</span>';
      const summary = (r.raw_answer || '').slice(0, 80);
      return `
        <tr>
          <td>${dt}</td>
          <td>${esc(r.brand_name || r.brand_id)}</td>
          <td><span class="geo-badge geo-badge-${r.engine}">${esc(r.engine)}</span></td>
          <td title="${esc(r.raw_answer || '')}">${esc(summary)}${summary.length >= 80 ? '...' : ''}</td>
          <td>${status}</td>
          <td>${r.latency_ms || 0}ms</td>
          <td>${r.usage?.total_tokens || 0}</td>
          <td>${esc((r.raw_answer || '').slice(0, 60))}</td>
        </tr>
      `;
    }).join('');
  }

  async function runTracker() {
    if (!currentBrandId) {
      alert('请先在顶部下拉选择一个品牌');
      return;
    }
    setStatus('跑跟踪中（可能 10-60 秒）...', 'loading');
    const r = await api('POST', '/api/geo/tracker/run', { brand_id: currentBrandId });
    if (r.data?.ok) {
      setStatus(`跟踪完成: ${r.data.success_count}/${r.data.tasks_run} 成功`, 'success');
      notify(`🔍 跟踪完成: ${r.data.success_count}/${r.data.tasks_run} 成功`, 'success');
      await loadTracks();
    } else {
      setStatus('跟踪失败: ' + (r.data?.error || r.status), 'error');
    }
  }

  // === Tab 3: 提问模板 ===
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
      emptyEl.style.display = 'none';
      tableEl.style.display = '';
      const cats = { brand_intro: '🏷️ 品牌', product: '🛠️ 产品', comparison: '⚖️ 对比', pricing: '💰 价格', use_case: '💡 场景', industry: '📈 行业', custom: '✏️ 自定义' };
      tbody.innerHTML = queries.slice(0, 100).map(q => `
        <tr>
          <td><span class="geo-badge geo-badge-gray">${esc(cats[q.category] || q.category)}</span></td>
          <td>${esc(q.prompt)}</td>
          <td>${(q.engine_targets || []).map(e => `<span class="geo-badge geo-badge-${e}">${esc(e)}</span>`).join(' ')}</td>
        </tr>
      `).join('');
      setStatus(`已加载 ${queries.length} 条模板`, 'success');
    } catch (e) {
      setStatus('提问模板加载失败: ' + e.message, 'error');
    }
  }

  async function generateQueries() {
    if (!currentBrandId) {
      alert('请先选择品牌');
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
      const snapshots = r.data?.snapshots || [];
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

  // === Tab 8: 设置 ===
  async function loadSettings() {
    setStatus('加载设置...', 'loading');
    try {
      // 引擎状态
      const [enginesRes, cronRes] = await Promise.all([
        api('GET', '/api/geo/engines'),
        api('GET', '/api/geo/cron/status'),
      ]);
      renderEngineGrid(enginesRes.data?.engines || {}, _byId('geo-settings-engine-grid'));

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

      setStatus('设置已加载', 'success');
    } catch (e) {
      setStatus('设置加载失败: ' + e.message, 'error');
    }
  }

  function renderEngineCheckGrid(settings) {
    const grid = _byId('geo-engine-check-grid');
    if (!grid) return;
    const all = settings.all_engines || [];
    const selected = settings.engine_whitelist || [];
    const labels = {
      deepseek: 'DeepSeek', openai: 'OpenAI', claude: 'Claude', perplexity: 'Perplexity',
      google: 'Gemini', copilot: 'Copilot', grok: 'Grok', google_ai_mode: 'AI Mode',
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
      alert('请输入 URL');
      return;
    }
    setStatus('生成中...', 'loading');
    const r = await api('POST', '/api/geo/llms-txt/generate', { url });
    if (r.data?.ok) {
      setStatus(`已生成: ${r.data.saved_path}`, 'success');
      await loadLLMS();
    } else {
      alert('生成失败: ' + (r.data?.error || r.data?.message || r.status));
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
      alert('请先选择品牌');
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

  // === 通用 ===
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
      link.href = '/client/css/geo-dashboard.css?v=0.7';
      document.head.appendChild(link);
    }

    fetch('/client/views/geo-dashboard.html?v=0.7')
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
        currentBrandId = select.value;
        const meta = _byId('geo-brand-meta');
        if (meta) {
          const opt = select.options[select.selectedIndex];
          meta.textContent = opt && opt.value ? `(${opt.text})` : '';
        }
        loadOverview();
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

    // 跑跟踪按钮
    const runTrackBtn = _byId('geo-track-run-btn');
    if (runTrackBtn) {
      const handler = () => runTracker();
      runTrackBtn.addEventListener('click', handler);
      cleanupFns.push(() => runTrackBtn.removeEventListener('click', handler));
    }

    // 引擎过滤
    const engineFilter = _byId('geo-track-engine-filter');
    if (engineFilter) {
      const handler = () => loadTracks();
      engineFilter.addEventListener('change', handler);
      cleanupFns.push(() => engineFilter.removeEventListener('change', handler));
    }

    // llms.txt 生成按钮
    const llmsBtn = _byId('geo-llms-generate-btn');
    if (llmsBtn) {
      const handler = () => generateLLMS();
      llmsBtn.addEventListener('click', handler);
      cleanupFns.push(() => llmsBtn.removeEventListener('click', handler));
    }

    // 提问模板生成按钮
    const qGenBtn = _byId('geo-queries-generate-btn');
    if (qGenBtn) {
      const handler = () => generateQueries();
      qGenBtn.addEventListener('click', handler);
      cleanupFns.push(() => qGenBtn.removeEventListener('click', handler));
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

  if (typeof window !== 'undefined') {
    window.GEODashboard = {
      switchTab, loadOverview, loadBrands, loadTracks, loadLLMS,
      loadQueries, loadScores, loadSnapshots, loadSettings,
      generateQueries, exportData,
      generateOptimization, applyRecommendation,
      saveTrackInterval, saveEngineWhitelist, resetEngineWhitelist,
      selectBrand, deleteBrand, runTracker, generateLLMS,
    };
  }
})();