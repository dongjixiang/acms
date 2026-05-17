// WebSocket 服务
const WebSocket = require('ws');
const eventBus = require('../services/event-bus');

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('[WS] Client connected');
    eventBus.addWsClient(ws);

    ws.on('close', () => {
      console.log('[WS] Client disconnected');
      eventBus.removeWsClient(ws);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      } catch (e) { /* ignore */ }
    });

    ws.send(JSON.stringify({ type: 'connected', message: 'ACMS WebSocket 已连接' }));
  });

  // 定期心跳
  setInterval(() => {
    wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    });
  }, 30000);

  return wss;
}

module.exports = { setupWebSocket };
