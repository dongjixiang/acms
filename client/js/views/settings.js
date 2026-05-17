// 项目设置视图 — 环境/仓库/配置/成员
// 依赖: core/state.js, core/utils.js, js/api.js

function setupSettingsTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const tabEl = document.getElementById(btn.dataset.tab);
      if (tabEl) tabEl.classList.add('active');
      loadSettingsTab(btn.dataset.tab);
    };
  });
}

async function loadSettings() {
  if (!App.currentProjectId) return;
  try { App.currentProject = await Projects.get(App.currentProjectId); } catch (e) { /* */ }
  loadSettingsTab('tab-envs');
}

async function loadSettingsTab(tab) {
  if (!App.currentProjectId) return;
  try {
    const proj = await Projects.get(App.currentProjectId);
    if (tab === 'tab-envs') {
      document.getElementById('envs-list').innerHTML = (proj.environments || []).map(e => `<div class="config-row"><span class="key">${escHtml(e.name)}</span><span class="val">${escHtml(e.url)}</span><span style="font-size:11px;color:var(--text2)">${e.type}</span></div>`).join('') || '<div class="empty" style="padding:12px">暂无环境</div>';
    }
    if (tab === 'tab-repos') {
      document.getElementById('repos-list').innerHTML = (proj.repos || []).map(r => `<div class="config-row"><span class="key">${escHtml(r.name)}</span><span class="val">${escHtml(r.url)}</span><span style="font-size:11px;color:var(--text2)">${r.type} · ${r.default_branch}</span></div>`).join('') || '<div class="empty" style="padding:12px">暂无仓库</div>';
    }
    if (tab === 'tab-configs') {
      document.getElementById('configs-list').innerHTML = (proj.configs || []).map(c => `<div class="config-row"><span class="key">${escHtml(c.key)}</span><span class="val">${escHtml(c.value)}</span><span style="font-size:11px;color:var(--text2)">${c.category}</span></div>`).join('') || '<div class="empty" style="padding:12px">暂无配置</div>';
    }
    if (tab === 'tab-members') {
      document.getElementById('members-list').innerHTML = (proj.members || []).map(m => `<div class="config-row"><span class="key">${m.member_type === 'agent' ? '🤖' : '👤'} ${escHtml(m.member_id)}</span><span class="val">${m.member_role}</span></div>`).join('') || '<div class="empty" style="padding:12px">暂无成员</div>';
    }
  } catch (e) { /* */ }
}

async function addEnv() {
  const n = document.getElementById('env-name').value.trim(), u = document.getElementById('env-url').value.trim();
  if (!n || !u) return toast('请填写完整', 'error');
  try { await fetch(`/api/projects/${App.currentProjectId}/environments`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' }, body: JSON.stringify({ name: n, url: u }) }); toast('环境已添加', 'success'); loadSettingsTab('tab-envs'); } catch (e) { toast('失败: ' + e.message, 'error'); }
}

async function addRepo() {
  const n = document.getElementById('repo-name').value.trim(), u = document.getElementById('repo-url').value.trim();
  if (!n || !u) return toast('请填写完整', 'error');
  try { await fetch(`/api/projects/${App.currentProjectId}/repos`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' }, body: JSON.stringify({ name: n, url: u }) }); toast('仓库已添加', 'success'); loadSettingsTab('tab-repos'); } catch (e) { toast('失败: ' + e.message, 'error'); }
}

async function addConfig() {
  const k = document.getElementById('cfg-key').value.trim(), v = document.getElementById('cfg-value').value.trim();
  if (!k || !v) return toast('请填写完整', 'error');
  try { await fetch(`/api/projects/${App.currentProjectId}/configs`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' }, body: JSON.stringify({ key: k, value: v }) }); toast('配置已添加', 'success'); loadSettingsTab('tab-configs'); } catch (e) { toast('失败: ' + e.message, 'error'); }
}

async function addMember() {
  const id = document.getElementById('member-id').value.trim(), t = document.getElementById('member-type').value;
  if (!id) return toast('请输入成员ID', 'error');
  try { await fetch(`/api/projects/${App.currentProjectId}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' }, body: JSON.stringify({ memberId: id, memberType: t }) }); toast('成员已添加', 'success'); loadSettingsTab('tab-members'); } catch (e) { toast('失败: ' + e.message, 'error'); }
}
