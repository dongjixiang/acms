// 仪表盘视图 — v0.46 PM Dashboard 4 张卡
// 依赖: core/state.js, core/utils.js, js/api.js

// 渲染 "🔴 Live Tasks" 卡片 - v0.46
function renderLiveCard(data) {
  if (!data) return '<div style="color:var(--text2);padding:12px">Live 数据加载中...</div>';

  const summary = data.summary || {};
  const tasks = data.tasks || [];
  const totalActive = summary.totalActive || 0;
  const stuck = summary.stuck || 0;

  // 头部颜色: 有 stuck 任务红色
  const headerColor = stuck > 0 ? 'var(--danger, #ef4444)' : totalActive > 0 ? 'var(--success, #10b981)' : 'var(--text2)';
  const headerIcon = stuck > 0 ? '🔴' : totalActive > 0 ? '🟢' : '⚪';

  // 任务列表
  const tasksHtml = tasks.length === 0
    ? '<div style="color:var(--text2);font-size:12px;padding:12px;text-align:center">✨ 当前无活动任务</div>'
    : tasks.map(t => {
        const stuckClass = t.isStuck ? 'pm-live-stuck' : '';
        const stuckBadge = t.isStuck
          ? `<span class="pm-live-badge pm-live-badge-danger">⚠️ 卡住 ${t.idleMin}min</span>`
          : `<span class="pm-live-badge">${t.status === 'review' ? '👀 review' : '🔄 running'}</span>`;
        return `
        <div class="pm-live-task ${stuckClass}" onclick="openTask('${t.id}')">
          <div class="pm-live-task-header">
            <span class="pm-live-task-title">${escHtml(t.title || t.id)}</span>
            ${stuckBadge}
          </div>
          <div class="pm-live-task-meta">
            <span title="执行 agent">🤖 ${escHtml(t.assignedTo || '?')}</span>
            <span title="轮次">🔁 R${t.estimatedRound}</span>
            <span title="进度">📊 ${t.progress}%</span>
            <span title="已耗时">⏱️ ${t.elapsedMin}min</span>
          </div>
          ${t.lastAction ? `<div class="pm-live-task-action" title="${escHtml(t.lastAction)}">📝 ${escHtml(t.lastAction.slice(0, 60))}${t.lastAction.length > 60 ? '...' : ''}</div>` : ''}
        </div>`;
      }).join('');

  return `
    <div class="pm-card pm-card-live">
      <div class="pm-card-header">
        <span class="pm-card-icon">${headerIcon}</span>
        <span class="pm-card-title">实时活动</span>
        <span class="pm-live-summary" style="color:${headerColor}">${totalActive} 活跃${stuck > 0 ? ` · ${stuck} 卡住` : ''}</span>
        <span class="pm-live-pulse" title="每 5 秒刷新">●</span>
      </div>
      <div class="pm-live-task-list">${tasksHtml}</div>
      <div class="pm-live-footer">
        <span class="pm-live-ts">更新于 ${fmtDate(data.ts) || new Date(data.ts).toLocaleTimeString()}</span>
        <button class="pm-live-refresh" onclick="loadLiveTasks()" title="手动刷新">🔄</button>
      </div>
    </div>`;
}

let _liveTimer = null;

async function loadLiveTasks() {
  if (!App.currentProjectId) return;
  try {
    const resp = await fetch(
      `/api/dashboard/live?projectId=${App.currentProjectId}`,
      { headers: { 'X-API-Key': 'dev-key-001' } }
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const el = document.getElementById('pm-live');
    if (el) el.innerHTML = renderLiveCard(data);
  } catch (e) {
    const el = document.getElementById('pm-live');
    if (el) el.innerHTML = `<div class="pm-card"><div style="color:var(--danger);padding:12px">Live 加载失败: ${escHtml(e.message)}</div></div>`;
  }
}

function startLivePolling() {
  // 清理旧 timer 避免重复
  if (_liveTimer) clearInterval(_liveTimer);
  // 立即跑一次, 然后每 5 秒一次
  loadLiveTasks();
  _liveTimer = setInterval(loadLiveTasks, 5000);
}

function stopLivePolling() {
  if (_liveTimer) { clearInterval(_liveTimer); _liveTimer = null; }
}

// ────────────────────────────────────────────────────────────
// v0.46 Git Status 卡片 — Workspace git 状态可视化
// ────────────────────────────────────────────────────────────

// 警告颜色: 绿=OK, 黄=WARN, 红=DANGER
function gitStatusColor(warning) {
  if (!warning) return 'var(--success, #10b981)';
  if (['NOT_A_GIT_REPO', 'COMMIT_FAILING'].includes(warning)) return 'var(--danger, #ef4444)';
  return 'var(--warn, #f59e0b)';  // WORKSPACE_GITIGNORED / UNCOMMITTED_CHANGES
}

function gitStatusIcon(warning, isGitRepo) {
  if (!isGitRepo) return '⚠️';
  if (!warning) return '✅';
  if (['NOT_A_GIT_REPO', 'COMMIT_FAILING'].includes(warning)) return '🔴';
  return '🟡';
}

function renderGitStatusCard(data) {
  if (!data) return '<div style="color:var(--text2);padding:12px">Git 状态加载中...</div>';

  const isRepo = data.isGitRepo;
  const color = gitStatusColor(data.warning);
  const icon = gitStatusIcon(data.warning, isRepo);

  if (!isRepo) {
    return `
      <div class="pm-card pm-card-git" style="border-left:3px solid ${color}">
        <div class="pm-card-header">
          <span class="pm-card-icon">${icon}</span>
          <span class="pm-card-title">Git 状态</span>
          <span class="pm-git-summary" style="color:${color}">不是 git 仓库</span>
        </div>
        <div class="pm-git-warning">
          <div class="pm-git-warning-msg">${escHtml(data.warningMsg || 'workspace 不是 git 仓库')}</div>
          ${data.suggestion ? `<div class="pm-git-suggestion">💡 ${escHtml(data.suggestion)}</div>` : ''}
        </div>
        <div class="pm-git-footer">
          <span class="pm-git-ws">📁 ${escHtml(data.workspacePath || '')}</span>
        </div>
      </div>`;
  }

  // 正常 git repo 渲染
  const lc = data.lastCommit;
  const uc = data.uncommittedFiles || 0;
  const cs = data.recentCommitStats || {};
  const csPct = cs.successRate;
  const csColor = csPct == null ? 'var(--text2)' : csPct >= 80 ? 'var(--success)' : csPct >= 50 ? 'var(--warn)' : 'var(--danger)';
  const sampleHtml = (data.uncommittedSample || []).map(s =>
    `<div class="pm-git-uc-row" title="${escHtml(s)}">${escHtml(s)}</div>`).join('') || '';

  return `
    <div class="pm-card pm-card-git" style="border-left:3px solid ${color}">
      <div class="pm-card-header">
        <span class="pm-card-icon">${icon}</span>
        <span class="pm-card-title">Git 状态</span>
        <span class="pm-git-summary" style="color:${color}">
          ${data.warning ? '⚠️ ' + escHtml(data.warning) : '✅ 正常'}
        </span>
        <button class="pm-git-refresh" onclick="loadGitStatus()" title="刷新">🔄</button>
      </div>

      <div class="pm-git-grid">
        <div class="pm-git-cell">
          <div class="pm-git-label">🌿 Branch</div>
          <div class="pm-git-value">${escHtml(data.branch || '—')}</div>
        </div>
        <div class="pm-git-cell">
          <div class="pm-git-label">📝 Last commit</div>
          <div class="pm-git-value">
            ${lc ? `<code>${escHtml(lc.short || '')}</code> ${escHtml((lc.subject || '').slice(0, 40))}` : '—'}
          </div>
          ${lc ? `<div class="pm-git-sub">by ${escHtml(lc.author || '?')} · ${escHtml((lc.date || '').slice(0, 10))}</div>` : ''}
        </div>
        <div class="pm-git-cell">
          <div class="pm-git-label">📂 Uncommitted</div>
          <div class="pm-git-value" style="color:${uc > 0 ? 'var(--warn)' : 'var(--success)'}">${uc} 个文件</div>
        </div>
        <div class="pm-git-cell">
          <div class="pm-git-label">📊 Commit 成功率</div>
          <div class="pm-git-value" style="color:${csColor}">${csPct == null ? '—' : csPct + '%'}</div>
          ${cs.total > 0 ? `<div class="pm-git-sub">${cs.success}/${cs.total} 成功</div>` : ''}
        </div>
      </div>

      ${data.warning ? `
        <div class="pm-git-warning">
          <div class="pm-git-warning-msg">⚠️ ${escHtml(data.warningMsg || '')}</div>
          ${data.suggestion ? `<div class="pm-git-suggestion">💡 ${escHtml(data.suggestion)}</div>` : ''}
        </div>
      ` : ''}

      ${uc > 0 && sampleHtml ? `
        <details class="pm-git-uc-details">
          <summary>未提交文件示例 (${uc})</summary>
          <div class="pm-git-uc-list">${sampleHtml}</div>
        </details>
      ` : ''}

      <div class="pm-git-footer">
        <span class="pm-git-ws" title="${escHtml(data.workspacePath || '')}">📁 ${escHtml((data.workspacePath || '').split(/[/\\]/).slice(-2).join('/'))}</span>
        <span class="pm-git-ts">更新于 ${fmtDate(data.ts) || new Date(data.ts).toLocaleTimeString()}</span>
      </div>
    </div>`;
}

async function loadGitStatus() {
  if (!App.currentProjectId) return;
  try {
    const resp = await fetch(
      `/api/projects/${App.currentProjectId}/git-status`,
      { headers: { 'X-API-Key': 'dev-key-001' } }
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const el = document.getElementById('pm-git');
    if (el) el.innerHTML = renderGitStatusCard(data);
  } catch (e) {
    const el = document.getElementById('pm-git');
    if (el) el.innerHTML = `<div class="pm-card"><div style="color:var(--danger);padding:12px">Git 状态加载失败: ${escHtml(e.message)}</div></div>`;
  }
}

// 渲染 4 张 PM Dashboard 卡片 (来自 /api/dashboard/stats)
// 卡 1: 本周健康度 (任务总数 / 完成 / 失败 / 成功率)
// 卡 2: 效率指标 (已完成数 / 平均轮次 / 平均耗时)
// 卡 3: 成本统计 (本周 token / 模型分布 Top 3)
// 卡 4: 异常 Top 3 (失败率最高 agent / 最近失败原因)
function renderPmCards(stats) {
  if (!stats) return '<div class="empty" style="padding:12px">Dashboard 数据加载中...</div>';

  const c1 = stats.card1_health || {};
  const c2 = stats.card2_efficiency || {};
  const c3 = stats.card3_cost || {};
  const c4 = stats.card4_anomalies || {};

  // 卡 1: 健康度 (绿/黄/红根据成功率)
  const srColor = c1.successRate == null ? 'var(--text2)'
    : c1.successRate >= 80 ? 'var(--success, #10b981)'
    : c1.successRate >= 50 ? 'var(--warn, #f59e0b)'
    : 'var(--danger, #ef4444)';
  const card1 = `
    <div class="pm-card pm-card-1">
      <div class="pm-card-header">
        <span class="pm-card-icon">📊</span>
        <span class="pm-card-title">${stats.weekRange?.label || '本周'}健康度</span>
      </div>
      <div class="pm-card-main">
        <div class="pm-card-big-num" style="color:${srColor}">${c1.successRate == null ? '—' : c1.successRate + '%'}</div>
        <div class="pm-card-label">成功率</div>
      </div>
      <div class="pm-card-detail">
        <span title="已完成">✅ ${c1.completed || 0}</span>
        <span title="进行中">🔄 ${c1.inProgress || 0}</span>
        <span title="失败">❌ ${c1.failed || 0}</span>
        <span title="总数">📦 ${c1.total || 0}</span>
      </div>
    </div>`;

  // 卡 2: 项目概览 (合并原 stat-row 需求/任务 + 原效率指标)
  //   4 个数据点: 需求 (总数/活跃) + 任务 (总数/完成) + 平均轮次 + 平均耗时
  const card2 = `
    <div class="pm-card pm-card-2">
      <div class="pm-card-header">
        <span class="pm-card-icon">⚡</span>
        <span class="pm-card-title">项目概览</span>
      </div>
      <div class="pm-card-main">
        <div class="pm-card-big-num">${c2.avgRounds == null ? '—' : c2.avgRounds}</div>
        <div class="pm-card-label">平均轮次/任务</div>
      </div>
      <div class="pm-card-detail pm-card-detail-2col">
        <div class="pm-detail-row">
          <span title="需求总数">📋 ${c2.reqTotal || 0}</span>
          <span title="活跃需求" style="color:var(--accent)">(${c2.reqActive || 0} 活跃)</span>
        </div>
        <div class="pm-detail-row">
          <span title="任务总数">🎯 ${c2.taskTotal || 0}</span>
          <span title="完成任务" style="color:var(--success, #10b981)">(${c2.taskDone || 0} 完成)</span>
        </div>
        <div class="pm-detail-row">
          <span title="本周完成任务数">✅ ${c2.doneCount || 0}</span>
          <span title="平均耗时" style="color:var(--text2)">⏱️ ${c2.avgDurationMin == null ? '—' : c2.avgDurationMin + ' min'}</span>
        </div>
      </div>
    </div>`;

  // 卡 3: Token 用量 (本周大数字 + 累计小数字 + 模型分布)
  const modelsHtml = (c3.topModels || []).map(m =>
    `<div class="pm-cost-row">
       <span class="pm-cost-name">${escHtml(m.model)}</span>
       <span class="pm-cost-bar"><span style="width:${m.pct}%"></span></span>
       <span class="pm-cost-pct">${m.pct}%</span>
     </div>`).join('') || '<div style="color:var(--text2);font-size:11px">无 token 记录</div>';
  const cumTokens = c3.cumulativeTokens || 0;
  const weekPct = cumTokens > 0 ? Math.round((c3.totalTokens || 0) / cumTokens * 100) : 0;
  const card3 = `
    <div class="pm-card pm-card-3">
      <div class="pm-card-header">
        <span class="pm-card-icon">💰</span>
        <span class="pm-card-title">Token 用量</span>
      </div>
      <div class="pm-card-main">
        <div class="pm-card-big-num">${_fmtToken(c3.totalTokens || 0)}</div>
        <div class="pm-card-label">本周 · ≈ $${c3.totalCost || 0}</div>
      </div>
      <div class="pm-card-cost-list">
        <div class="pm-cost-summary">累计 ${_fmtToken(cumTokens)} · 占 ${weekPct}% · 累计 ≈ $${c3.cumulativeCost || 0}</div>
        ${modelsHtml}
      </div>
    </div>`;

  // 卡 4: 异常 Top 3
  const agentsHtml = (c4.worstAgents || []).map(a =>
    `<div class="pm-anomaly-row">
       <span class="pm-anomaly-agent">${escHtml(a.agent)}</span>
       <span class="pm-anomaly-rate" style="color:${a.successRate < 50 ? 'var(--danger)' : a.successRate < 80 ? 'var(--warn)' : 'var(--success)'}">${a.successRate}%</span>
       <span class="pm-anomaly-detail">${a.completed}/${a.total}</span>
     </div>`).join('') || '<div style="color:var(--text2);font-size:11px">数据不足</div>';

  const failsHtml = (c4.recentFails || []).map(f =>
    `<div class="pm-fail-row" title="${escHtml(f.reason)}">
       <span class="pm-fail-title">${escHtml(f.title)}</span>
       <span class="pm-fail-reason">${escHtml(f.reason.slice(0, 80))}${f.reason.length > 80 ? '...' : ''}</span>
     </div>`).join('') || '<div style="color:var(--text2);font-size:11px">本周无失败 🎉</div>';

  const card4 = `
    <div class="pm-card pm-card-4">
      <div class="pm-card-header">
        <span class="pm-card-icon">⚠️</span>
        <span class="pm-card-title">异常 Top 3</span>
      </div>
      <div class="pm-card-section">
        <div class="pm-section-label">失败率最高的 agent</div>
        <div class="pm-anomaly-list">${agentsHtml}</div>
      </div>
      <div class="pm-card-section">
        <div class="pm-section-label">最近失败原因</div>
        <div class="pm-fail-list">${failsHtml}</div>
      </div>
    </div>`;

  return card1 + card2 + card3 + card4;
}

// 把 Live 卡片插到 4 张卡后面 (独立一行, 整行宽度)
function renderPmCardsWithLive(stats) {
  return renderPmCards(stats);
}

async function loadPmDashboard() {
  if (!App.currentProjectId) return;
  try {
    const resp = await fetch(
      `/api/dashboard/stats?projectId=${App.currentProjectId}&weeksAgo=0`,
      { headers: { 'X-API-Key': 'dev-key-001' } }
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const stats = await resp.json();
    const el = document.getElementById('pm-cards');
    if (el) el.innerHTML = renderPmCardsWithLive(stats);
  } catch (e) {
    const el = document.getElementById('pm-cards');
    if (el) el.innerHTML = `<div class="empty" style="padding:12px;color:var(--danger)">Dashboard 加载失败: ${e.message}</div>`;
  }
}

async function loadDashboard() {
  if (!App.currentProjectId) return;
  try {
    // v0.46: 加载 PM Dashboard 4 张卡 + 启动 Live 轮询 + Git Status
    await loadPmDashboard();
    startLivePolling();
    loadGitStatus();  // Git 状态不需要轮询, 手动刷新即可

    const reqs = await Requirements.list({ projectId: App.currentProjectId, limit: 200 });
    const tasks = await Tasks.list({ projectId: App.currentProjectId, limit: 200 });

    document.getElementById('dash-name').textContent = '📊 ' + escHtml(App.currentProject?.name || '') + ' — 仪表盘';
    // v0.46: stat-row 整个删除 (需求/任务已合并到 PM 卡 2 "项目概览", Token 已合并到 PM 卡 3)

    const recentReqs = reqs.slice(0, 5);
    document.getElementById('dash-reqs').innerHTML = recentReqs.length
      ? recentReqs.map(r => '<div class="dash-item" onclick="openRequirement(\'' + r.id + '\')">' + App.statusLabels[r.status] + ' ' + escHtml(r.title) + ' <span style="color:var(--text2);font-size:11px">' + r.id + '</span></div>').join('')
      : '<div class="empty" style="padding:12px">暂无需求</div>';

    const activeTasks = tasks.filter(t => t.status === 'in_progress').slice(0, 5);
    document.getElementById('dash-tasks').innerHTML = activeTasks.length
      ? activeTasks.map(t => '<div class="dash-item" onclick="openTask(\'' + t.id + '\')">🔄 ' + escHtml(t.title) + ' <span style="color:var(--text2);font-size:11px">' + (t.progress || 0) + '%</span></div>').join('')
      : '<div class="empty" style="padding:12px">无进行中任务</div>';

    // v0.46: sidebar mini-stats 用 reqs/tasks 直接算 (不需要单独变量)
    const sidebarActive = reqs.filter(r => !['done', 'abandoned'].includes(r.status)).length;
    const sidebarTaskDone = tasks.filter(t => t.status === 'done').length;
    document.getElementById('sidebar-stats').innerHTML = '📊 需求: ' + reqs.length + ' (' + sidebarActive + '活跃)<br>📌 任务: ' + tasks.length + ' (' + sidebarTaskDone + '完成)';

    // Token 调用明细（独立面板）
    try {
      const logResp = await fetch('/api/admin/token-logs?projectId=' + App.currentProjectId + '&limit=10', { headers: { 'X-API-Key': 'dev-key-001' } });
      const logs = await logResp.json();
      let logHtml = '';
      if (logs.length === 0) {
        logHtml = '<div style="color:var(--text2);font-size:12px;padding:12px;text-align:center">暂无记录。<br>执行 AI 澄清、文档生成、任务分解后会出现。</div>';
      } else {
        logHtml = '<details open><summary style="cursor:pointer;font-weight:bold;color:var(--accent);font-size:12px">最近 ' + logs.length + ' 次调用</summary>';
        logHtml += '<div style="margin-top:8px;max-height:240px;overflow-y:auto">';
        const callerLabels = { clarify: '💬 澄清', generateDoc: '📝 文档', decompose: '🔧 分解' };
        logs.forEach(l => {
          const label = callerLabels[l.caller] || l.caller || '🤖';
          logHtml += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px;border-bottom:1px solid var(--border)">';
          logHtml += '<span>' + label + ' <span style="color:var(--text2)">' + escHtml(l.model) + '</span></span>';
          logHtml += '<span style="color:var(--accent)">↑' + _fmtToken(l.promptTokens) + ' ↓' + _fmtToken(l.completionTokens) + ' =' + _fmtToken(l.totalTokens) + '</span>';
          logHtml += '<span style="color:var(--text2)">' + fmtDate(l.time) + '</span>';
          logHtml += '</div>';
        });
        logHtml += '</div></details>';
      }
      document.getElementById('dash-token-logs').innerHTML = logHtml;
    } catch (e) { /* */ }
  } catch (e) { /* */ }
}

function _fmtToken(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}