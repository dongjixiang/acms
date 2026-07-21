// 智能体协同视图 — 注册、任务、匹配、上下文
// 依赖: core/state.js, core/utils.js, js/api.js

async function loadAgentsView() { await loadAgentList(); await refreshAgentSelect(); }

async function loadAgentList() {
  try {
    const agents = await Agents.list();
    const container = document.getElementById('agent-list');
    if (!agents.length) { container.innerHTML = '<div class="empty">暂无智能体，请注册</div>'; return; }
    container.innerHTML = agents.map(a => {
      const skills = safeParse(a.skills), roles = safeParse(a.roles);
      return `<div class="agent-card">
        <div class="head"><span style="font-weight:bold">🤖 ${escHtml(a.name)}</span><span class="status-badge ${a.status === 'online' ? 'badge-done' : 'badge-clarifying'}">${a.status}</span></div>
        <div style="font-size:12px;color:var(--text2)">${escHtml(a.type)} | 角色: ${roles.join(',') || '未定义'}</div>
        <div class="skills">${Object.entries(skills).map(([k, v]) => `<span class="skill-tag">${k}:${v}</span>`).join('')}</div>
        <div style="margin-top:6px;display:flex;gap:6px">
          <button class="btn-small" onclick="showAgentDetail('${a.id}')">📋 任务</button>
          <button class="btn-small" onclick="loadMatchTasksFor('${a.id}')">🎯 匹配</button>
          <button class="btn-small" onclick="loadAgentContext('${a.id}')">📡 订阅</button>
          <button class="btn-small" onclick="showAgentStats('${a.id}')">📊 绩效</button>
        </div></div>`;
    }).join('');
  } catch (e) { toast('加载失败: ' + e.message, 'error'); }
}

async function refreshAgentSelect() {
  try {
    const agents = await Agents.list();
    const sel = document.getElementById('match-agent-select');
    if (sel) sel.innerHTML = '<option value="">选择智能体...</option>' + agents.map(a => `<option value="${a.id}">${escHtml(a.name)} (${a.type})</option>`).join('');
  } catch (e) { /* */ }
}

async function registerAgent() {
  const id = document.getElementById('reg-agent-id').value.trim();
  const name = document.getElementById('reg-agent-name').value.trim();
  if (!id || !name) return toast('请填写ID和名称', 'error');
  const roles = prompt('角色 (逗号分隔):', 'executor');
  const skillsStr = prompt('技能 (JSON):', '{"coding":1.5}');
  try {
    await Agents.register({ id, name, type: roles?.split(',')[0]?.trim() || 'general', roles: roles?.split(',').map(s => s.trim()) || [], skills: JSON.parse(skillsStr || '{}') });
    toast('智能体已注册', 'success'); loadAgentsView();
  } catch (e) { toast('注册失败: ' + e.message, 'error'); }
}

async function showAgentDetail(agentId) {
  try {
    const resp = await api('GET', `/agents/${agentId}/tasks`);
    const tasks = resp.assigned || [], reviews = resp.reviewQueue || [];
    let html = `<h3 style="margin-top:16px">📋 ${escHtml(resp.agent.name)} 的任务</h3>`;
    html += tasks.length ? tasks.map(t => `<div class="dash-item">${t.status === 'in_progress' ? '🔄' : '👀'} ${escHtml(t.title)} <span style="color:var(--text2)">${t.progress || 0}%</span></div>`).join('') : '<div class="empty">暂无任务</div>';
    if (reviews.length) html += `<h3 style="margin-top:12px">👁 审核队列</h3>` + reviews.map(t => `<div class="dash-item">📝 ${escHtml(t.title)}</div>`).join('');
    const panel = document.querySelector('#view-agents .dash-panel:last-child');
    if (panel) panel.innerHTML = html;
  } catch (e) { toast('加载失败: ' + e.message, 'error'); }
}

async function loadMatchTasksFor(agentId) {
  const sel = document.getElementById('match-agent-select');
  if (sel) sel.value = agentId;
  if (!agentId) return;
  try {
    const matches = await api('GET', `/agents/${agentId}/match-tasks`);
    const container = document.getElementById('match-results');
    if (!matches.length) { container.innerHTML = '<div class="empty">没有匹配的任务</div>'; return; }
    container.innerHTML = `<h4 style="margin-bottom:8px">找到 ${matches.length} 个匹配任务</h4>` + matches.map(m => `
      <div class="agent-card" style="margin-bottom:6px;cursor:pointer" onclick="openTaskInWindow('${m.taskId}')">
        <div style="display:flex;justify-content:space-between"><span>${escHtml(m.title)}</span><span style="color:var(--accent);font-weight:bold">⭐ ${m.score}</span></div>
        <div class="skills">${Object.entries(m.requiredSkills || {}).map(([k, v]) => `<span class="skill-tag">${k}:${v}</span>`).join('') || '无技能要求'}</div>
      </div>`).join('');
  } catch (e) { toast('匹配失败: ' + e.message, 'error'); }
}

async function loadAgentContext(agentId) {
  try {
    const resp = await api('GET', `/agents/${agentId}/subscribe`);
    const notifications = await api('GET', `/agents/${agentId}/notifications`);
    let html = `<h3 style="margin-top:16px">📡 ${agentId} 事件订阅</h3>`;
    html += `<div style="font-size:12px;color:var(--text2);margin:8px 0">角色: ${resp.roles.join(', ')}</div>`;
    html += `<div style="font-size:12px;margin:8px 0">订阅: ${resp.subscriptions.map(s => `<span class="skill-tag">${s}</span>`).join(' ')}</div>`;
    html += `<h4 style="margin-top:12px">📬 通知 (${notifications.length})</h4>`;
    html += notifications.length ? notifications.slice(0, 5).map(n => `<div class="dash-item" style="font-size:11px">📨 ${n.type} @ ${new Date(n.timestamp).toLocaleTimeString('zh-CN', {hour12:false})}</div>`).join('') : '<div class="empty">暂无</div>';
    const panel = document.querySelector('#view-agents .dash-panel:last-child');
    if (panel) panel.innerHTML = html;
  } catch (e) { toast('加载失败: ' + e.message, 'error'); }
}

async function showAgentStats(agentId) {
  try {
    const s = await api('GET', `/agents/${agentId}/stats`);
    let html = `<h3 style="margin-top:16px">📊 ${escHtml(s.agent.name)} 绩效</h3>`;
    html += `<div class="stats-row" style="grid-template-columns:repeat(4,1fr);margin-top:12px">
      <div class="stat-card"><div class="num">${s.stats.totalCompleted}</div><div class="label">完成任务</div></div>
      <div class="stat-card"><div class="num">${s.stats.successRate}%</div><div class="label">成功率</div></div>
      <div class="stat-card"><div class="num">${s.stats.avgCompletionHours}h</div><div class="label">平均耗时</div></div>
      <div class="stat-card"><div class="num">${s.stats.inProgress}</div><div class="label">进行中</div></div>
    </div>`;
    if (s.recentTasks.length) {
      html += `<h4 style="margin-top:12px">最近完成</h4>`;
      html += s.recentTasks.map(t => `<div class="dash-item">✅ ${escHtml(t.title)} <span style="color:var(--text2)">${t.estimatedHours}h → ${t.actualHours}h</span></div>`).join('');
    }
    const panel = document.querySelector('#view-agents .dash-panel:last-child');
    if (panel) panel.innerHTML = html;
  } catch (e) { toast('加载失败: ' + e.message, 'error'); }
}
