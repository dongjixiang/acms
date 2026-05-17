// ACMS 服务入口（只负责启动）
const http = require('http');
const app = require('./app');
const config = require('./config');
const { setupWebSocket } = require('./handlers/websocket');

console.log('[ACMS] 智能体协同管理系统 v0.3.0');

// HTTP API
const httpServer = http.createServer(app);
httpServer.listen(config.port, () => {
  console.log(`[ACMS] HTTP API: http://localhost:${config.port}`);
  console.log(`[ACMS] Web UI:  http://localhost:${config.port}/client/index.html`);
});

// WebSocket
const wsServer = http.createServer();
setupWebSocket(wsServer);
wsServer.listen(config.wsPort, () => {
  console.log(`[ACMS] WebSocket: ws://localhost:${config.wsPort}`);
});

// 定期任务：检查过期需求 + 饥饿降级
setInterval(() => {
  try { require('./stores/requirement-store').checkAndAbandon(); } catch (e) { /* */ }
  try { require('./services/agent-stats-service').checkAndDegrade(); } catch (e) { /* */ }
}, 10 * 60 * 1000);

console.log('[ACMS] 启动完成 ✅');
