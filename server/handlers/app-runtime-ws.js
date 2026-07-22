// ACMS appRuntime WebSocket 处理器（v0.59+）
// 路径：/ws/app-runtime/{sessionId}
//
// 协议：
//   server → client:
//     { type: 'ready', sessionId }            首帧确认
//     { type: 'frame', data: <base64 jpeg>,   CDP screencast 帧
//       metadata: { deviceWidth, deviceHeight, ... } }
//     { type: 'navigated', url }              页面 URL 变化（含初始化）
//     { type: 'closed' }                      后端主动关闭
//     { type: 'error', message }              错误提示
//
//   client → server: 任意 appRuntime.input() 支持的 event（见 services/app-runtime.js）
//
// 设计要点：
//   - 不阻塞主 httpServer upgrade（用 noServer + 自管 handleUpgrade）
//   - 收到首帧 'ready' 之前不推流，避免前端 onmessage 时序错位
//   - 一帧一 ack：CDP 要求每个 Page.screencastFrame 都用 sessionId 回 Page.screencastFrameAck
//   - WS 关闭时 detach 而非 closeSession —— 页面可能换浏览器/刷 tab 再连

const WebSocket = require('ws');
const appRuntime = require('../services/app-runtime');

const PREFIX = '/ws/app-runtime/';

function setupAppRuntimeWS(httpServer) {
  const wss = new WebSocket.Server({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    try {
      if (!req.url || !req.url.startsWith(PREFIX)) return; // 不是我们的，交给其它 handler
      const sessionId = decodeURIComponent(req.url.slice(PREFIX.length).split('?')[0]);
      if (!sessionId || !appRuntime.hasSession(sessionId)) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req, sessionId));
    } catch (e) {
      console.error('[ws/app-runtime] upgrade 失败:', e.message);
      try { socket.destroy(); } catch {}
    }
  });

  wss.on('connection', async (ws, req, sessionId) => {
    console.log(`[ws/app-runtime] 连接 session ${sessionId.slice(0, 8)}`);
    const session = appRuntime.sessions.get(sessionId);
    if (!session) {
      try { ws.close(1011, 'SESSION_GONE'); } catch {}
      return;
    }
    // 多 ws 注册（同一 session 可被多个客户端订阅）
    appRuntime.attach(sessionId, ws);
    // 引用：service 内部对 _broadcast 仍要拿到 session 对象
    const s = session;

    // 通知当前导航 URL（前端拿来显示标题栏）
    safeSend(ws, { type: 'ready', sessionId, url: s.url });

    // ── CDP screencast：start & 推帧 ──
    const ensureCdp = async () => {
      if (s.cdp && s.screencastOn) return s.cdp;
      if (!s.cdp) {
        s.cdp = await s.page.target().createCDPSession();
        await s.cdp.send('Page.enable');
        // 全局导航事件：所有 ws 都能收到
        s.cdp.on('Page.frameNavigated', ({ frame }) => {
          if (frame.parentId) return; // 只要 main frame
          appRuntime._broadcast(s, { type: 'navigated', url: frame.url });
        });
        // 全局错误
        s.cdp.on('error', err => {
          console.warn(`[ws/app-runtime] CDP 错误: ${err.message}`);
          appRuntime._broadcast(s, { type: 'error', message: 'CDP: ' + err.message });
        });
        // 全局帧推送
        s.cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId: cdpSid }) => {
          s.lastFrameAt = Date.now();
          appRuntime._broadcast(s, {
            type: 'frame', data,
            metadata: {
              deviceWidth: metadata.deviceWidth,
              deviceHeight: metadata.deviceHeight,
              offsetX: metadata.offsetX || 0,
              offsetY: metadata.offsetY || 0,
              scrollOffsetX: metadata.scrollOffsetX || 0,
              scrollOffsetY: metadata.scrollOffsetY || 0,
              timestamp: metadata.timestamp,
            },
          });
          try { await s.cdp.send('Page.screencastFrameAck', { sessionId: cdpSid }); } catch {}
        });
      }
      await s.cdp.send('Page.startScreencast', {
        format: 'jpeg', quality: 75, everyNthFrame: 1,
      });
      s.screencastOn = true;
      return s.cdp;
    };

    const stopScreencast = async () => {
      if (!s.cdp || !s.screencastOn) return;
      try { await s.cdp.send('Page.stopScreencast'); } catch {}
      s.screencastOn = false;
    };

    // 首次连接 → 启动 screencast
    ensureCdp().catch(err => {
      console.error('[ws/app-runtime] screencast 启动失败:', err.message);
      safeSend(ws, { type: 'error', message: 'screencast 启动失败: ' + err.message });
    });

    // 收到用户 input 事件
    ws.on('message', async (raw) => {
      let event;
      try { event = JSON.parse(raw.toString()); } catch { return; }
      if (!event || typeof event !== 'object') return;
      if (event.type === 'ping') return safeSend(ws, { type: 'pong' });

      // pause / resume 由 handler 直接处理（避免 input() 阻塞其它类型消息）
      if (event.type === 'pause') {
        await stopScreencast();
        return;
      }
      if (event.type === 'resume') {
        await ensureCdp().catch(e => safeSend(ws, { type: 'error', message: 'resume: ' + e.message }));
        return;
      }

      const rsp = await appRuntime.input(sessionId, event);
      // 出错只回这一个客户端（不广播风暴）
      if (rsp && rsp.error && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'error', message: rsp.error })); } catch {}
      } else if (event.type === 'navigate' && rsp?.navigated) {
        appRuntime._broadcast(s, { type: 'navigated', url: rsp.url || event.url });
      }
    });

    ws.on('close', () => {
      console.log(`[ws/app-runtime] 断开 session ${sessionId.slice(0, 8)}`);
      appRuntime.detach(sessionId, ws);
      // 如果这个 session 已经没有 ws 在听，并且 paused 状态，可以停 screencast 省资源
      // 但 pause/resume 的语义是用户主动控制，这里不自动停，留给用户
    });

    ws.on('error', err => console.warn('[ws/app-runtime] socket error:', err.message));
  });

  return wss;
}

function safeSend(ws, msg) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try { ws.send(JSON.stringify(msg)); } catch {}
}

module.exports = { setupAppRuntimeWS, PREFIX };
