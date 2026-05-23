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
    if (tab === 'tab-workspace') {
      loadWorkspaceTab();
    }
    if (tab === 'tab-skills') {
      loadSkillsTab();
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

// ===== 工作区 tab =====
async function loadWorkspaceTab() {
  if (!App.currentProjectId) return;
  try {
    const resp = await fetch(`/api/workspace/files/${App.currentProjectId}`, { headers: { 'X-API-Key': 'dev-key-001' } });
    const data = await resp.json();
    document.getElementById('workspace-path').textContent = '📁 ' + (data.workspacePath || '');

    const files = data.files || [];
    if (!files.length) {
      document.getElementById('workspace-files').innerHTML = '<div class="empty" style="padding:12px">工作区为空。创建需求并生成文档后，文件会自动出现在这里。</div>';
      return;
    }

    // 按目录分组
    const byDir = {};
    files.forEach(f => {
      const dir = f.path.includes('/') ? f.path.substring(0, f.path.lastIndexOf('/')) : '/';
      if (!byDir[dir]) byDir[dir] = [];
      byDir[dir].push(f);
    });

    const sizeUnits = ['B', 'KB', 'MB'];
    const fmtSize = (s) => { let i = 0; while (s > 1024 && i < 2) { s /= 1024; i++; } return s.toFixed(1) + ' ' + sizeUnits[i]; };

    let html = '';
    for (const [dir, items] of Object.entries(byDir)) {
      html += `<div style="font-weight:bold;color:var(--accent);margin-top:12px;font-size:13px">📁 ${dir === '/' ? '根目录' : dir}</div>`;
      items.forEach(f => {
        const icon = f.type === '.md' ? '📝' : f.type === '.docx' ? '📄' : '📦';
        html += `<div class="config-row" style="padding-left:16px;font-size:13px">
          <span>${icon} ${escHtml(f.name)}</span>
          <span style="font-size:11px;color:var(--text2)">${fmtSize(f.size)} · ${fmtDate(f.modified)}</span>
        </div>`;
      });
    }
    document.getElementById('workspace-files').innerHTML = html;

    // 自动初始化工作区（如果不存在）
    if (!files.length) {
      fetch(`/api/workspace/init/${App.currentProjectId}`, { method: 'POST', headers: { 'X-API-Key': 'dev-key-001' } });
    }
  } catch (e) { document.getElementById('workspace-files').innerHTML = '<div style="color:var(--accent2)">加载失败: ' + escHtml(e.message) + '</div>'; }
}

// ===== 技能管理 tab =====
async function loadSkillsTab() {
  try {
    const resp = await fetch('/api/skills', { headers: { 'X-API-Key': 'dev-key-001' } });
    const skills = await resp.json();
    const container = document.getElementById('skills-list');
    if (!skills.length) {
      container.innerHTML = '<div class="empty" style="padding:12px">暂无技能。使用上方表单添加第一个技能（如 skill-python-testing）。</div>';
      return;
    }
    container.innerHTML = skills.map(s => {
      const exec = safeParse(s.execution);
      const matchOn = safeParse(s.match_on);
      return `<div class="agent-card" style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong>${escHtml(s.name)}</strong>
            <span style="font-size:11px;color:var(--text2);margin-left:8px">${escHtml(s.id)} · ${s.category}</span>
          </div>
          <button class="btn-small btn-reject" onclick="deleteSkill('${s.id}')">🗑</button>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">
          匹配: type=${(matchOn.taskType||[]).join(',')} tags=${(matchOn.tags||[]).join(',')}
          | 步骤: ${(exec.steps||[]).length} 步
        </div>
      </div>`;
    }).join('');
  } catch(e) { document.getElementById('skills-list').innerHTML = '<div style="color:var(--accent2)">加载失败</div>'; }
}

async function addSkill() {
  const id = document.getElementById('skill-id').value.trim();
  const name = document.getElementById('skill-name').value.trim();
  if (!id || !name) return toast('请填写技能ID和名称', 'error');
  try {
    await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify({ id, name, category: 'general' })
    });
    toast('技能已添加 ✅', 'success');
    document.getElementById('skill-id').value = '';
    document.getElementById('skill-name').value = '';
    loadSkillsTab();
  } catch(e) { toast('添加失败: ' + e.message, 'error'); }
}

async function deleteSkill(id) {
  if (!confirm('确认删除此技能？')) return;
  try {
    await fetch(`/api/skills/${id}`, { method: 'DELETE', headers: { 'X-API-Key': 'dev-key-001' } });
    toast('技能已删除', 'success');
    loadSkillsTab();
  } catch(e) { toast('删除失败: ' + e.message, 'error'); }
}
