// ACMS v0.3 — 应用入口（精简版）
// 模块加载顺序: core → views → 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 主题初始化最先执行，避免闪烁
  App.initTheme();
  I18n.init().then(() => {
    initApp();
  });
});

function initApp() {
  // 显示首页
  document.getElementById('view-projects').style.display = 'block';
  // 事件绑定
  document.getElementById('status-filter')?.addEventListener('change', loadRequirements);
  document.getElementById('kanban-req-filter')?.addEventListener('change', refreshKanban);
  setupSettingsTabs();
  // 启动
  connectWebSocket();
  loadProjects();
}

// ===== WebSocket =====
function connectWebSocket() {
  try {
    App.ws = new WebSocket(App.WS_URL);
    App.ws.onopen = () => {
      document.getElementById('connection-status').className = 'status-online';
      document.getElementById('connection-status').textContent = '● 在线';
    };
    App.ws.onclose = () => {
      document.getElementById('connection-status').className = 'status-offline';
      document.getElementById('connection-status').textContent = '● 离线';
      setTimeout(connectWebSocket, 3000);
    };
    App.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (['task.created', 'task.claimed', 'task.submitted', 'task.completed'].includes(m.type)) {
        if (typeof refreshKanban === 'function') refreshKanban();
      }
    };
  } catch (e) { /* */ }
}
