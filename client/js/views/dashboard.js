// 仪表盘视图
// 依赖: core/state.js, core/utils.js, js/api.js

async function loadDashboard() {
  if (!App.currentProjectId) return;
  try {
    const reqs = await Requirements.list({ projectId: App.currentProjectId, limit: 200 });
    const tasks = await Tasks.list({ projectId: App.currentProjectId, limit: 200 });
    const total = reqs.length;
    const active = reqs.filter(r => !['done', 'abandoned'].includes(r.status)).length;
    const taskDone = tasks.filter(t => t.status === 'done').length;

    // Token 用量
    let tokenText = '—';
    try {
      const tokenResp = await fetch('/api/admin/token-stats?projectId=' + App.currentProjectId, { headers: { 'X-API-Key': 'dev-key-001' } });
      const tokenData = await tokenResp.json();
      tokenText = _fmtToken(tokenData.totalTokens || 0);
    } catch (e) { /* */ }

    document.getElementById('dash-name').textContent = '📊 ' + escHtml(App.currentProject?.name || '') + ' — 仪表盘';
    document.getElementById('dash-stats').innerHTML =
      '<div class="stat-card"><div class="num">' + total + '</div><div class="label">需求总数</div></div>' +
      '<div class="stat-card"><div class="num">' + active + '</div><div class="label">活跃需求</div></div>' +
      '<div class="stat-card"><div class="num">' + tasks.length + '</div><div class="label">任务总数</div></div>' +
      '<div class="stat-card"><div class="num">' + taskDone + '</div><div class="label">已完成任务</div></div>' +
      '<div class="stat-card" style="border-left:3px solid var(--accent)"><div class="num">' + tokenText + '</div><div class="label">🤖 Token 用量</div></div>';

    const recentReqs = reqs.slice(0, 5);
    document.getElementById('dash-reqs').innerHTML = recentReqs.length
      ? recentReqs.map(r => '<div class="dash-item" onclick="openRequirement(\'' + r.id + '\')">' + App.statusLabels[r.status] + ' ' + escHtml(r.title) + ' <span style="color:var(--text2);font-size:11px">' + r.id + '</span></div>').join('')
      : '<div class="empty" style="padding:12px">暂无需求</div>';

    const activeTasks = tasks.filter(t => t.status === 'in_progress').slice(0, 5);
    document.getElementById('dash-tasks').innerHTML = activeTasks.length
      ? activeTasks.map(t => '<div class="dash-item" onclick="openTask(\'' + t.id + '\')">🔄 ' + escHtml(t.title) + ' <span style="color:var(--text2);font-size:11px">' + (t.progress || 0) + '%</span></div>').join('')
      : '<div class="empty" style="padding:12px\">无进行中任务</div>';

    document.getElementById('sidebar-stats').innerHTML = '📊 需求: ' + total + ' (' + active + '活跃)<br>📌 任务: ' + tasks.length + ' (' + taskDone + '完成)<br>🤖 Token: ' + tokenText;

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
