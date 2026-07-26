// WebSocket 服务
// v0.66: 支持 app-tool 注册（app_tools:register）和结果回传（app_tool:result）
const WebSocket = require('ws');
const eventBus = require('../services/event-bus');
const appToolsRegistry = require('../services/app-tools-registry');

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  // v0.66: 注入 wsSender（app-tools-registry.invokeClientAppTool 用）
  // ACMS 单 ws 一对一策略：找任意 open 的 ws 推送
  appToolsRegistry.setWsSender((userId, msg) => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(msg));
          return { ok: true };
        } catch (e) {
          return { ok: false, error: 'SEND_FAILED', message: e.message };
        }
      }
    }
    return { ok: false, error: 'NO_CLIENT', message: 'No open WS client' };
  });

  wss.on('connection', (ws) => {
    console.log('[WS] Client connected');
    eventBus.addWsClient(ws);

    ws.on('close', () => {
      console.log('[WS] Client disconnected');
      eventBus.removeWsClient(ws);
    });

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (e) {
        return;
      }

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      // v0.66: 客户端注册 app-tool 元数据
      if (msg.type === 'app_tools:register') {
        const result = appToolsRegistry.registerClientAppTools(msg.appId, msg.tools || []);
        ws.send(JSON.stringify({
          type: 'app_tools:register_ack',
          appId: msg.appId,
          ...result,
        }));
        return;
      }

      // v0.66: 客户端回传 app-tool 执行结果
      if (msg.type === 'app_tool:result' && msg.reqId) {
        const resolved = appToolsRegistry.resolveClientResult(msg.reqId, msg.payload || {});
        if (!resolved) {
          console.warn(`[WS] app_tool:result for unknown reqId=${msg.reqId}`);
        }
        return;
      }
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