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

// ── 启动时：自动创建 ACMS 自我改进项目 ──
try {
  const { collection } = require('./db/connection');
  const existing = collection('projects').findOne(p => p.slug === 'acms-self-improvement');
  if (!existing) {
    const projectStore = require('./stores/project-store');
    projectStore.create({
      name: 'ACMS自我改进', slug: 'acms-self-improvement',
      description: '系统自我改进报告与任务管理。隐藏项目，仅通过「自我改进」入口访问。',
    });
    collection('projects').update(p => p.slug === 'acms-self-improvement', { system_project: 1 });
    console.log('[ACMS] ✅ 自动创建「ACMS自我改进」项目');
  } else if (!existing.system_project) {
    collection('projects').update(p => p.slug === 'acms-self-improvement', { system_project: 1 });
  }
} catch (e) { console.error('[ACMS] 创建系统项目失败:', e.message); }

// 定期任务：检查过期需求 + 饥饿降级
setInterval(() => {
  try { require('./stores/requirement-store').checkAndAbandon(); } catch (e) { /* */ }
  try { require('./services/agent-stats-service').checkAndDegrade(); } catch (e) { /* */ }
}, 10 * 60 * 1000);

// 每日自动归档：已完成任务按项目配置天数自动归档
setInterval(() => {
  try { require('./services/auto-archive-service').autoArchive(); } catch (e) { /* */ }
}, 24 * 60 * 60 * 1000);

console.log('[ACMS] 启动完成 ✅');
