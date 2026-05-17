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

    document.getElementById('dash-name').textContent = `📊 ${escHtml(App.currentProject?.name || '')} — 仪表盘`;
    document.getElementById('dash-stats').innerHTML = `
      <div class="stat-card"><div class="num">${total}</div><div class="label">需求总数</div></div>
      <div class="stat-card"><div class="num">${active}</div><div class="label">活跃需求</div></div>
      <div class="stat-card"><div class="num">${tasks.length}</div><div class="label">任务总数</div></div>
      <div class="stat-card"><div class="num">${taskDone}</div><div class="label">已完成任务</div></div>`;

    const recentReqs = reqs.slice(0, 5);
    document.getElementById('dash-reqs').innerHTML = recentReqs.length
      ? recentReqs.map(r => `<div class="dash-item" onclick="openRequirement('${r.id}')">${App.statusLabels[r.status]} ${escHtml(r.title)} <span style="color:var(--text2);font-size:11px">${r.id}</span></div>`).join('')
      : '<div class="empty" style="padding:12px">暂无需求</div>';

    const activeTasks = tasks.filter(t => t.status === 'in_progress').slice(0, 5);
    document.getElementById('dash-tasks').innerHTML = activeTasks.length
      ? activeTasks.map(t => `<div class="dash-item" onclick="openTask('${t.id}')">🔄 ${escHtml(t.title)} <span style="color:var(--text2);font-size:11px">${t.progress || 0}%</span></div>`).join('')
      : '<div class="empty" style="padding:12px">无进行中任务</div>';

    document.getElementById('sidebar-stats').innerHTML = `📊 需求: ${total} (${active}活跃)<br>📌 任务: ${tasks.length} (${taskDone}完成)`;
  } catch (e) { /* */ }
}
