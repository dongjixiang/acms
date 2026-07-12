// 路由 — 页面/视图切换
// 依赖: core/state.js, core/utils.js

// 顶层页面切换（项目列表 ↔ 工作空间 ↔ 系统管理）
function showView(id) {
  // 隐藏所有顶层页面
  const pages = ['view-projects', 'view-workspace', 'view-admin', 'view-improvements'];
  pages.forEach(pid => {
    const el = document.getElementById(pid);
    if (el) el.style.display = 'none';
  });
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

function goToProjects() {
  App.currentProjectId = null; App.currentProject = null;
  document.getElementById('current-project').textContent = '';
  document.getElementById('header-title').innerHTML = '🤖 智能体协同管理系统 <span class="version">v0.3</span>';
  showView('view-projects');
  App.closeSidebar();
  if (typeof loadProjects === 'function') loadProjects();
}

function enterProject(proj) {
  App.currentProjectId = proj.id; App.currentProject = proj;
  document.getElementById('current-project').textContent = `📦 ${escHtml(proj.name)}`;
  document.getElementById('header-title').innerHTML = `<img src="/client/img/logo.png" alt="ACMS" class="header-logo"> ${escHtml(proj.name)} <span class="version">v0.3</span>`;
  showView('view-workspace');
  setupWorkspaceNav();
  showWorkspaceView('dashboard');
  if (typeof loadDashboard === 'function') loadDashboard();
}

// 工作空间内视图切换
function showWorkspaceView(name) {
  document.querySelectorAll('#content .view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(`view-${name}`);
  if (el) el.classList.add('active');
  document.querySelectorAll('#sidebar .nav-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`#sidebar [data-view="${name}"]`);
  if (btn) btn.classList.add('active');
  // 移动端：导航后关闭 sidebar
  App.closeSidebar();
}

function setupWorkspaceNav() {
  document.querySelectorAll('#sidebar .nav-btn:not(.nav-back)').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      showWorkspaceView(view);
      if (view === 'dashboard' && typeof loadDashboard === 'function') loadDashboard();
      if (view === 'requirements' && typeof loadRequirements === 'function') loadRequirements();
      if (view === 'kanban' && typeof refreshKanban === 'function') refreshKanban();
      if (view === 'bugs' && typeof loadBugView === 'function') loadBugView();
      if (view === 'knowledge' && typeof loadKnowledgeView === 'function') loadKnowledgeView();
      if (view === 'delivery' && typeof loadDelivery === 'function') loadDelivery();
      if (view === 'agents' && typeof loadAgentsView === 'function') loadAgentsView();
      if (view === 'settings' && typeof loadSettings === 'function') loadSettings();
    });
  });
}
