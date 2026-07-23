const WebSocket = require('ws'), http = require('http');
function api(m, p, b) {
  return new Promise((r, j) => {
    const q = http.request({ host: 'localhost', port: 3300, path: p, method: m, headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => r(JSON.parse(d)));
    });
    q.on('error', j);
    if (b) q.write(JSON.stringify(b));
    q.end();
  });
}
(async () => {
  const o = await api('POST', '/api/app-runtime/open', { url: 'https://www.deepseek.com', w: 1024, h: 700 });
  const sid = o.session.sessionId;
  const ws = new WebSocket(`ws://localhost:3300/ws/app-runtime/${sid}`);
  let frames = 0, errors = [], navigates = 0;
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); setTimeout(() => j(new Error('connect timeout')), 5000); });
  ws.on('message', m => {
    const msg = JSON.parse(m.toString());
    if (msg.type === 'frame') frames++;
    else if (msg.type === 'error') errors.push(msg.message);
    else if (msg.type === 'navigated') navigates++;
  });
  await new Promise(r => setTimeout(r, 6000));
  console.log('after 6s on https://www.deepseek.com: frames=', frames, 'navigates=', navigates, 'errors=', errors);
  // Try common DeepSeek start-chat links
  const targets = [
    'https://chat.deepseek.com/',
    'https://chat.deepseek.com/sign_in',
  ];
  for (const t of targets) {
    const nav = await api('POST', '/api/app-runtime/input', { sessionId: sid, type: 'navigate', url: t });
    console.log('navigate', t, '->', JSON.stringify(nav).slice(0, 200));
    await new Promise(r => setTimeout(r, 3000));
  }
  console.log('after navigates: frames=', frames, 'navigates=', navigates, 'errors=', errors);
  ws.close();
  await api('POST', '/api/app-runtime/close', { sessionId: sid });
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
