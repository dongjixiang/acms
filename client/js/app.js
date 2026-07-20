// ACMS v0.3 — 应用入口（精简版）
// 模块加载顺序: core → views → 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 检查登录态
  var token = localStorage.getItem('acms-token');
  if (!token) {
    window.location.href = '/client/login.html';
    return;
  }
  // 主题初始化最先执行，避免闪烁
  App.initTheme();
  I18n.init().then(() => {
    initApp();
  });
});

function initApp() {
  // 显示桌面（view-workspace 初始 display:none，先可见再激活桌面）
  var ws = document.getElementById('view-workspace');
  if (ws) ws.style.display = 'block';
  // 立即激活 ACMSWin 桌面（DOMContentLoaded 时 window-manager.js 已加载）
  // 同步执行，不 setTimeout，避免中间态闪现
  if (window.ACMSWin && !ACMSWin.isActive()) ACMSWin.enable();
  // 事件绑定
  setTimeout(function() {
    var sf = document.getElementById('status-filter');
    if (sf) sf.addEventListener('change', loadRequirements);
    var kf = document.getElementById('kanban-req-filter');
    if (kf) kf.addEventListener('change', refreshKanban);
  }, 100);
  setupSettingsTabs();
  connectWebSocket();
  // v0.56：桌面图标管理初始化（替代旧 registerDesktopRecycleIcon）
  if (typeof setupDesktopIcons === 'function') setupDesktopIcons();
}

// v0.55→v0.56：保留兼容性 shim（desktop-icons.js 已接管图标管理）
function registerDesktopRecycleIcon() {
  // 如果 desktop-icons.js 已初始化，不重复注册
  if (window.ACMSWin && typeof ACMSWin.getPinnedIcons === 'function') {
    var pinned = ACMSWin.getPinnedIcons();
    var hasRecycle = pinned.some(function(p) { return p.id === 'chat-recycle'; });
    if (hasRecycle) return;
  }
  // fallback：旧逻辑
  if (!window.ACMSWin || !ACMSWin.registerDesktopIcon) return;
  ACMSWin.registerDesktopIcon({
    id: 'chat-recycle',
    icon: '🗑',
    label: '回收站',
    badge: 0,
    onClick: function() {
      if (typeof window.openChatRecycleBin === 'function') {
        window.openChatRecycleBin();
      }
    },
  });
}

// ===== 项目列表（从启动菜单调用） =====
window.showProjectList = function() {
    // 直接调用 launchProjects() 走窗口逻辑
    if (typeof window.launchProjects === 'function') {
      window.launchProjects();
    }
  };

// ===== WebSocket =====
function connectWebSocket() {
  try {
    App.ws = new WebSocket(App.WS_URL);
    function setStatus(online) {
      var el = document.getElementById('connection-status');
      if (!el) return;
      el.className = online ? 'status-online' : 'status-offline';
      el.textContent = online ? '● 在线' : '● 离线';
    }
    App.ws.onopen = () => setStatus(true);
    App.ws.onclose = () => {
      setStatus(false);
      setTimeout(connectWebSocket, 3000);
    };
    App.ws.onmessage = (e) => {
      try {
        var m = JSON.parse(e.data);
        if (['task.created', 'task.claimed', 'task.submitted', 'task.completed'].includes(m.type)) {
          if (typeof refreshKanban === 'function') refreshKanban();
        }
      } catch (err) {}
    };
  } catch (e) { /* */ }
}
