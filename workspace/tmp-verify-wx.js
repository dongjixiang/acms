// v0.59 appRuntime 真·微信网页版验证：开 session → 收帧 → 看扫码二维码是不是出来了
const WebSocket = require('ws');
const http = require('http');

const HOST = 'localhost', PORT = 3300, API_KEY = 'dev-key-001';
function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: HOST, port: PORT, path, method,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY } }, res => {
      let buf = ''; res.on('data', c => buf += c); res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve(buf); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body)); req.end();
  });
}

(async () => {
  console.log('[1] /api/app-runtime/open → https://wx.qq.com  (1024x700)');
  const open = await api('POST', '/api/app-runtime/open', { url: 'https://wx.qq.com', w: 1024, h: 700 });
  console.log('    →', JSON.stringify(open));
  if (open.error || !open.ok) { console.error('❌ open 失败'); process.exit(1); }
  const sid = open.session.sessionId;

  const ws = new WebSocket(`ws://${HOST}:${PORT}/ws/app-runtime/${sid}`);
  let frameCount = 0, navigated = false, ready = false;
  let frames = []; // 收集前几帧，转 base64 写到文件供肉眼检查

  await new Promise((resolve, reject) => {
    const tmo = setTimeout(() => reject(new Error('WS connect 超时')), 5000);
    ws.on('open', () => { clearTimeout(tmo); resolve(); });
    ws.on('error', e => { clearTimeout(tmo); reject(e); });
  });
  console.log('[2] WS connected');

  ws.on('message', raw => {
    const m = JSON.parse(raw.toString());
    if (m.type === 'ready')      { ready = true; console.log('    ready:', m.url); }
    else if (m.type === 'frame') {
      frameCount++;
      if (frames.length < 5) frames.push(m.data);
      if (frameCount === 1 || frameCount === 5 || frameCount === 10) {
        console.log(`    frame #${frameCount}: deviceW/H=${m.metadata?.deviceWidth}/${m.metadata?.deviceHeight} jpeg_size=${m.data.length}B`);
      }
    }
    else if (m.type === 'navigated') { navigated = true; console.log('    navigated:', m.url); }
    else if (m.type === 'error')     { console.error('    ERROR:', m.message); }
  });

  console.log('[3] 收 8 秒帧（微信打开首页 / 跳转）…');
  await new Promise(r => setTimeout(r, 8000));

  // 写 5 帧到本地，用 v0.59 appRuntime frame viewer 看
  const fs = require('fs');
  const path = require('path');
  const dumpDir = path.join(process.cwd(), 'tmp-app-runtime-wx-frames');
  fs.mkdirSync(dumpDir, { recursive: true });
  frames.forEach((d, i) => {
    fs.writeFileSync(path.join(dumpDir, `frame-${i+1}.jpg`), Buffer.from(d, 'base64'));
  });
  console.log(`[3+] 写了 ${frames.length} 帧到 ${dumpDir}/`);

  console.log('[4] 取页面 title + body 摘要');
  ws.send(JSON.stringify({ type: 'exec', code: '({title: document.title, bodyClass: document.body && document.body.className, qrPresent: !!document.querySelector(\'img[src*="qrcode"], .qrcode img\'), loginUrl: location.href})' }));
  await new Promise(r => setTimeout(r, 2000));

  console.log('[5] close ws + close session');
  ws.close();
  await new Promise(r => setTimeout(r, 500));
  const close = await api('POST', '/api/app-runtime/close', { sessionId: sid });
  console.log('    close:', JSON.stringify(close));

  console.log('\n── 结果 ──');
  console.log('ready         :', ready);
  console.log('navigated     :', navigated);
  console.log('frameCount    :', frameCount);
  const ok = ready && frameCount >= 1;
  console.log(ok ? '\n✅ wx.qq.com 渲染链路 PASS' : '\n❌ FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
