// v0.59 P2 补强端到端验证：
//   P2-2：多 WS 广播（同 session 多客户端都收到帧）
//   P2-3：pause / resume（停 / 重启 screencast）
//   P2-4：idle timeout（无 input 自动关 + idle-closed 广播）
//
// 前置：server 已经重启加载新代码（service / handler）
// 用法：
//   APP_RUNTIME_IDLE_MS=4000 node workspace/tmp-verify-p2-extra.js
// （4 秒 idle 就关，正常使用别加此 env，默认 30 分钟）

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

const log = (label, ok, detail) => console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
const header = s => console.log(`\n──── ${s} ────`);

(async () => {
  // 标记各 ws 收到的事件
  const ws1 = { frames: 0, navigated: 0, errors: [] };
  const ws2 = { frames: 0, navigated: 0, errors: [] };
  const idleState = { closedFrame: null, sessionAfter: null };

  header('Setup');
  const open = await api('POST', '/api/app-runtime/open', { url: 'https://example.com', w: 800, h: 600 });
  if (!open.ok) { console.error('open 失败:', open); process.exit(1); }
  const sid = open.session.sessionId;
  console.log('  session:', sid.slice(0, 8));

  // ── P2-2: 多 WS 广播 ──
  header('P2-2 多 WS 广播');
  const w1 = new WebSocket(`ws://${HOST}:${PORT}/ws/app-runtime/${sid}`);
  const w2 = new WebSocket(`ws://${HOST}:${PORT}/ws/app-runtime/${sid}`);
  await Promise.all([new Promise(r => w1.on('open', r)), new Promise(r => w2.on('open', r))]);

  w1.on('message', raw => {
    const m = JSON.parse(raw.toString());
    if (m.type === 'frame') ws1.frames++;
    else if (m.type === 'navigated') ws1.navigated++;
    else if (m.type === 'error') ws1.errors.push(m.message);
  });
  w2.on('message', raw => {
    const m = JSON.parse(raw.toString());
    if (m.type === 'frame') ws2.frames++;
    else if (m.type === 'navigated') ws2.navigated++;
    else if (m.type === 'error') ws2.errors.push(m.message);
  });

  // 收 2 秒基线帧（两个 ws 都应收到同样的帧数）
  await new Promise(r => setTimeout(r, 2000));
  // navigate — 两个 ws 都收到
  w1.send(JSON.stringify({ type: 'navigate', url: 'https://example.org' }));
  await new Promise(r => setTimeout(r, 2000));

  log('ws1 frames > 0', ws1.frames > 0, `count=${ws1.frames}`);
  log('ws2 frames > 0', ws2.frames > 0, `count=${ws2.frames}`);
  log('ws1 navigated', ws1.navigated > 0, `count=${ws1.navigated}`);
  log('ws2 navigated', ws2.navigated > 0, `count=${ws2.navigated}`);
  const p2_2_ok = ws1.frames > 0 && ws2.frames > 0 && ws1.navigated > 0 && ws2.navigated > 0;
  console.log('  P2-2:', p2_2_ok ? 'PASS' : 'FAIL');

  // ── P2-3: pause / resume ──
  header('P2-3 pause / resume');
  // 重置计数
  const ws1Before = ws1.frames;
  const ws2Before = ws2.frames;
  // 暂停
  w1.send(JSON.stringify({ type: 'pause' }));
  await new Promise(r => setTimeout(r, 1000));
  // 滚动触发不应该推到（应不再触发 paint）；先试着 navigate 一下
  w1.send(JSON.stringify({ type: 'navigate', url: 'https://example.com' }));
  await new Promise(r => setTimeout(r, 1500));
  const ws1AfterPause = ws1.frames;
  const ws2AfterPause = ws2.frames;

  // 重启
  w1.send(JSON.stringify({ type: 'resume' }));
  await new Promise(r => setTimeout(r, 100));
  await new Promise(r => setTimeout(r, 2500));
  const ws1AfterResume = ws1.frames;
  const ws2AfterResume = ws2.frames;
  console.log(`  frames before/after pause/after resume: ws1=${ws1Before}/${ws1AfterPause}/${ws1AfterResume} ws2=${ws2Before}/${ws2AfterPause}/${ws2AfterResume}`);
  // pause 之后帧应该停下来（数量基本不变）；resume 之后帧应该 +N
  const paused_works = (ws1AfterPause - ws1Before) <= 2 && (ws2AfterPause - ws2Before) <= 2;
  const resumed_works = ws1AfterResume > ws1AfterPause + 1 && ws2AfterResume > ws2AfterPause + 1;
  log('paused stops frames', paused_works, `ws1 +${ws1AfterPause - ws1Before}, ws2 +${ws2AfterPause - ws2Before}`);
  log('resumed pushes frames', resumed_works, `ws1 +${ws1AfterResume - ws1AfterPause}, ws2 +${ws2AfterResume - ws2AfterPause}`);
  const p2_3_ok = paused_works && resumed_works;
  console.log('  P2-3:', p2_3_ok ? 'PASS' : 'FAIL');

  // ── P2-4: idle timeout ──
  header('P2-4 idle timeout（需要 APP_RUNTIME_IDLE_MS 已设）');
  // 监听任意 ws 的 idle-closed 帧
  let idleClosedSeen = false;
  const idleHandler = raw => {
    const m = JSON.parse(raw.toString());
    if (m.type === 'idle-closed') {
      idleClosedSeen = true;
      idleState.closedFrame = m;
    }
  };
  w1.on('message', idleHandler);

  console.log(`  APP_RUNTIME_IDLE_MS=${process.env.APP_RUNTIME_IDLE_MS || '(unset, default 30min)'} → 等待 idle 时长的 1.2 倍…`);
  const idleMs = Number(process.env.APP_RUNTIME_IDLE_MS) || 30 * 60 * 1000;
  const waitMs = Math.min(idleMs * 1.3 + 1000, 8000); // 最多等 8 秒（否则验证跑太久）
  await new Promise(r => setTimeout(r, waitMs));

  // 查 sessions API
  const sessions = await api('GET', '/api/app-runtime/sessions');
  const stillAlive = (sessions.sessions || []).some(s => s.sessionId === sid);

  log('idle-closed frame received', idleClosedSeen, idleState.closedFrame ? `${idleState.closedFrame.reason} ${idleState.closedFrame.idleMinutes}m` : '');
  log('session auto-closed', !stillAlive, stillAlive ? 'session 仍在' : 'session 已消失');
  const p2_4_ok = idleClosedSeen && !stillAlive;
  console.log('  P2-4:', p2_4_ok ? 'PASS' : 'FAIL');

  // 收尾
  w1.removeListener('message', idleHandler);
  try { w1.close(); } catch {}
  try { w2.close(); } catch {}
  await new Promise(r => setTimeout(r, 500));
  // session 可能已自动关，保险再 close 一次
  await api('POST', '/api/app-runtime/close', { sessionId: sid });

  // 总报告
  console.log('\n══════ 总报告 ══════');
  console.log('  P2-2 (多 WS 广播) :', p2_2_ok ? '✅ PASS' : '❌ FAIL');
  console.log('  P2-3 (pause/resume):', p2_3_ok ? '✅ PASS' : '❌ FAIL');
  console.log('  P2-4 (idle timeout):', p2_4_ok ? '✅ PASS' : '❌ FAIL');
  process.exit((p2_2_ok && p2_3_ok && p2_4_ok) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
