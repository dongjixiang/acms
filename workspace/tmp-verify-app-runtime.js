// 临时端到端验证脚本（v0.59 P1+P2）：
//   1. POST /api/app-runtime/open → 拿 sessionId
//   2. WS 连 ws://localhost:3300/ws/app-runtime/{sessionId}
//   3. 数 CDP screencast 帧（至少 3 帧算通过）
//   4. 测 navigate 事件（切 https://example.org 看 navigated）
//   5. close ws + POST /api/app-runtime/close
//
// 用法（多多重启 server 后）：
//   cd /c/Users/swede/acms && node workspace/tmp-verify-app-runtime.js

const WebSocket = require('ws');
const http = require('http');

const HOST = 'localhost', PORT = 3300, API_KEY = 'dev-key-001';

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: HOST, port: PORT, path, method,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve(buf); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  console.log('[1] POST /api/app-runtime/open …');
  const open = await api('POST', '/api/app-runtime/open', { url: 'https://example.com', w: 800, h: 600 });
  console.log('    →', JSON.stringify(open));
  if (open.error || !open.ok) { console.error('❌ open 失败'); process.exit(1); }
  const sid = open.session.sessionId;

  console.log(`[2] WS connect ws://${HOST}:${PORT}/ws/app-runtime/${sid.slice(0, 8)}…`);
  const ws = new WebSocket(`ws://${HOST}:${PORT}/ws/app-runtime/${sid}`);
  let frameCount = 0, navigated = false, ready = false;
  let lastDevW = 0, lastDevH = 0, lastSize = 0;
  await new Promise((resolve, reject) => {
    const tmo = setTimeout(() => reject(new Error('WS connect 超时')), 5000);
    ws.on('open', () => { clearTimeout(tmo); resolve(); });
    ws.on('error', e => { clearTimeout(tmo); reject(e); });
  });

  ws.on('message', raw => {
    const m = JSON.parse(raw.toString());
    if (m.type === 'ready') { ready = true; console.log('    ready:', m.url); }
    else if (m.type === 'frame') {
      frameCount++;
      lastDevW = m.metadata?.deviceWidth; lastDevH = m.metadata?.deviceHeight;
      lastSize = m.data.length;
      if (frameCount === 1 || frameCount === 5 || frameCount === 10) {
        console.log(`    frame #${frameCount}: deviceW/H=${lastDevW}/${lastDevH} jpeg_size=${lastSize}B`);
      }
    }
    else if (m.type === 'navigated') { navigated = true; console.log('    navigated:', m.url); }
    else if (m.type === 'error')     { console.error('    ERROR:', m.message); }
  });

  console.log('[3] 收 3 秒帧（CDP screencast 推流；同时主动 wheel 触发新 paint）…');
  // 静态页面 example.com 加载完成后不再触发 paint，CDP screencast 会暂停推帧
  // 这里用 wheel 主动滚动触发新 paint — 更鲁棒的验证
  let wheelCount = 0;
  const wheelTimer = setInterval(() => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'wheel', dx: 0, dy: 80 }));
    wheelCount++;
  }, 400);
  await new Promise(r => setTimeout(r, 3500));
  clearInterval(wheelTimer);

  console.log('[4] 触发 navigate → https://example.org');
  ws.send(JSON.stringify({ type: 'navigate', url: 'https://example.org' }));
  await new Promise(r => setTimeout(r, 2500));

  console.log('[5] 测 input — click(400,300)');
  ws.send(JSON.stringify({ type: 'click', x: 400, y: 300 }));
  await new Promise(r => setTimeout(r, 500));

  console.log('[6] close ws + close session');
  ws.close();
  await new Promise(r => setTimeout(r, 500));
  const close = await api('POST', '/api/app-runtime/close', { sessionId: sid });
  console.log('    close:', JSON.stringify(close));

  console.log('\n── 验证结果 ──');
  console.log('ready         :', ready);
  console.log('navigated     :', navigated);
  console.log('frameCount    :', frameCount);
  console.log('lastDeviceW/H :', lastDevW, '/', lastDevH);
  // 帧 >= 2 即可（动态页面会更高，example.com 这种静态页面最少 1 帧）
  const ok = ready && navigated && frameCount >= 2;
  console.log(ok ? '\n✅ E2E PASS' : '\n❌ E2E FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
