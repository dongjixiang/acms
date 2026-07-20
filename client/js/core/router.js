// 路由 — 页面/视图切换
// 依赖: core/state.js, core/utils.js

// 顶层页面切换（项目列表 ↔ 工作空间 ↔ 系统管理）
function showView(id) {
  // 隐藏所有顶层页面
  const pages = ['view-workspace', 'view-admin', 'view-improvements'];
  pages.forEach(pid => {
    const el = document.getElementById(pid);
    if (el) el.style.display = 'none';
  });
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

function goToProjects() {
  App.currentProjectId = null; App.currentProject = null;
  // 更新任务栏项目 pill
  if (typeof updateProjectPill === 'function') updateProjectPill();
  // 桌面模式：打开项目列表窗口
  if (window.ACMSWin) {
    if (!ACMSWin.isActive()) ACMSWin.enable();
    ACMSWin.open('projects', { w: 720, h: 500 });
  }
  App.closeSidebar();
}

function enterProject(proj) {
  App.currentProjectId = proj.id; App.currentProject = proj;
  // 更新任务栏项目 pill
  if (typeof updateProjectPill === 'function') updateProjectPill();
  showView('view-workspace');
  setupWorkspaceNav();
  // 启用桌面模式（L2）
  if (window.ACMSWin) {
    ACMSWin.enable();
    setTimeout(function() { ACMSWin.open('dashboard', { w: 700, h: 460 }); }, 200);
  } else {
    showWorkspaceView('dashboard');
  }
  if (typeof loadDashboard === 'function') loadDashboard();
}

// 工作空间内视图切换
function showWorkspaceView(name) {
  // 桌面模式：通过 ACMSWin 打开窗口
  if (window.ACMSWin && ACMSWin.isActive()) {
    ACMSWin.open(name);
    document.querySelectorAll('#sidebar .nav-btn').forEach(function(b) { b.classList.remove('active'); });
    var sb = document.querySelector('#sidebar [data-view="' + name + '"]');
    if (sb) sb.classList.add('active');
    App.closeSidebar();
    return;
  }
  // 传统模式（无桌面时降级）
  document.querySelectorAll('#content .view').forEach(v => v.classList.remove('active'));
  var el = document.getElementById('view-' + name);
  if (el) el.classList.add('active');
  document.querySelectorAll('#sidebar .nav-btn').forEach(b => b.classList.remove('active'));
  var navBtn = document.querySelector('#sidebar [data-view="' + name + '"]');
  if (navBtn) navBtn.classList.add('active');
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
