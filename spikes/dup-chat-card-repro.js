// ============================================================
// dup-chat-card-repro.js — 真浏览器行为复现：「选中剧本后聊天流渲染出 2 遍」
//
//   用途：这是 v0.22.87 那个 bug 的**行为级**回归（定性靠它，不靠推理）。
//     单测（server/__tests__/test-chat-card-dedup.js）只能断言代码里有守卫，
//     这个脚本把真实页面里的真实函数跑一遍，数 DOM 里有几张剧本卡。
//
//   机制（复现的真实时序）：
//     ① 轮询器已在跑（会话打开状态，histCount 基线 = 旧历史长度）
//     ② 用户点「选择这个剧本」→ 服务端往 supplement_history 追加一条 screenplay_result
//     ③ selectScreenplay 立刻调 refreshScreenplayChatCard（补一张无指纹卡 = 老 bug 的那张）
//     ④ 轮询 tick（3s）→ 增量路径渲染同一条目（= 老 bug 的第二张）
//     期望：1 张。老代码：2 张（一张 data-at=''，一张带时间戳）。
//
//   跑法：node spikes/dup-chat-card-repro.js
//     · 需要本地服务在 3300（ACMS 自己起好的那个）
//     · 会自动拉起 headless Chrome（--remote-debugging-port=9333）、guest 登录、跑完自动退出
//     · 退出码 0 = 通过（1 张），1 = 复现到 bug（2 张）/ 环境问题
// ============================================================
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = parseInt(process.env.CDP_PORT || '9333', 10);
const BASE = process.env.ACMS_BASE || 'http://localhost:3300';

function findChrome() {
  const cands = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch {} }
  return null;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function wsUrlForPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('拿不到 CDP page webSocketDebuggerUrl（Chrome 没起来？端口被占？）');
}

let _id = 0;
function evaluate(wsUrl, expression, awaitPromise = true) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const myId = ++_id;
    const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('Runtime.evaluate 超时')); }, 90000);
    ws.onopen = () => ws.send(JSON.stringify({ id: myId, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise } }));
    ws.onmessage = (ev) => {
      // ⚠️ Node ≥18 原生 WebSocket（undici）回调收到的是 MessageEvent（.data），
      //    不是裸字符串 —— 直接 JSON.parse(ev) 会静默 return → 表现为「Runtime.evaluate 超时」
      const raw = (ev && ev.data !== undefined) ? ev.data : ev;
      let msg; try { msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString()); } catch { return; }
      if (msg.id !== myId) return;
      clearTimeout(timer);
      ws.close();
      if (msg.result && msg.result.exceptionDetails) {
        return reject(new Error('页面内 JS 抛错: ' + JSON.stringify(msg.result.exceptionDetails.exception || msg.result.exceptionDetails)));
      }
      resolve(msg.result && msg.result.result ? msg.result.result.value : undefined);
    };
    ws.onerror = (e) => { clearTimeout(timer); reject(new Error('WS 错误: ' + (e.message || e))); };
  });
}

// ---- 复现用的 harness（在页面里跑真实函数，数据是假但结构等同真卡） ----
//   mode 由 argv[2] 选择：
//     （默认）select  = 选中剧本：补卡 + 轮询增量，两条路径抢同一张卡
//     video          = 生成视频：卡片被「删旧+推新」重写（换新 at，落到历史尾部）+ 追加 video_done
//     multi          = 3 个不同 idea 的剧本卡并存，重写其中一张不能误删别的
//
//   ⚠️ 确定性：**不靠 sleep 猜 tick**——把 window.setInterval 拦下来收集 tick 回调，
//      自己 await 每一轮。（早前版本靠 sleep 等 3s tick，负向对照出现「同一份代码两次结果不同」
//      的假象：水位 histCount 落在改动前后会走不同分支。）
const MODE = ['video', 'multi'].indexOf(process.argv[2]) >= 0 ? process.argv[2] : 'select';

const HARNESS_SELECT = `(async () => {
  const one = { title: '诗仙的顿悟', scenes: [1,2,3,4,5].map(i => ({ idx:i, shot: i===1?'全景建立镜头':(i===5?'特写':'中景'), desc:'第'+i+'场画面' })), full_text: '李白独游庐山，见瀑布飞泻，挥毫写下千古绝唱。' };
  const sp = { status:'done', idea:'望庐山瀑布', target_seconds:30, picked:0, picked_at:new Date().toISOString(), art_style:'photorealistic', screenplays:[one], assets:{characters:{},scenes:{}}, scene_videos:{}, scene_frames:{}, video_opts:null, project_id:null, warnings:[] };
  const entryText = JSON.stringify({ type:'screenplay_card', idea:'望庐山瀑布', target_seconds:30, picked_idx:0, total:3, screenplay: one, art_style:'photorealistic', assets:{characters:{},scenes:{}}, scene_videos:{}, project_id:null });
  const hist = [];
  window.api = async (m, p) => {
    if (/\\/assist(\\?|$)/.test(p)) return { assists: { screenplay: sp } };
    if (/supplement-history/.test(p)) return { history: hist.slice() };
    if (/thinking-brief/.test(p)) return {};
    return {};
  };
  const cid = 'DUPREPRO' + Date.now();
  const c = document.createElement('div'); c.id = 'chat-stream-msgs-' + cid; document.body.appendChild(c);
  // 每轮手动驱动：重新挂桩 → 注册轮询 → await 最新那一轮（水印 histCount 存在 _chatState 里，跨轮保留）
  // 自证：记录每个气泡由谁渲染 + 抓回被测代码文本验证版本（避免"跑的不是这份代码"的假结论）
  const rendered = [];
  const _rcb = window.renderChatBubble;
  window.renderChatBubble = function (cc, ee) { if (ee) rendered.push((ee.source || '-') + '@' + (ee.at || '')); return _rcb(cc, ee); };

  const runTick = async () => {
    const local = []; const _si = window.setInterval;
    window.setInterval = (fn) => { local.push(fn); return 0; };
    startChatPolling(cid);
    window.setInterval = _si;
    if (!local.length) throw new Error('没抓到 tick 回调');
    await local[0]();
  };
  await runTick();                                           // 第一轮：初始历史（空）
  hist.push({ at: '2026-09-25T14:08:24.061Z', role:'system', source:'screenplay_result', text: entryText });  // ② 服务端写入新卡
  await refreshScreenplayChatCard(cid);                      // ③ 即时刷新（补卡）
  await runTick();                                           // ④ 下一轮轮询（增量）
  const bubbles = c.querySelectorAll('.chat-bubble[data-source="screenplay_result"]');
  const titles = [...c.querySelectorAll('.assist-section-title')].map(e => e.textContent.trim());
  const codeTxt = await (await fetch('/client/js/views/requirements/chat.js')).text();
  const out = { mode:'select', bubbleCount: bubbles.length, ats: [...bubbles].map(b => b.dataset.at), titles: titles, rendered: rendered, hasStaleFix: /撤掉同卡旧版本/.test(codeTxt), steps: steps };
  c.remove();
  return JSON.stringify(out);
})()`;

// 生成视频这条链路：卡片「删旧+推新」重写（新 at，落到历史尾部）+ 追加 video_done
const HARNESS_VIDEO = `(async () => {
  const one = { title: '诗仙的顿悟', scenes: [1,2,3].map(i => ({ idx:i, shot:'中景', desc:'第'+i+'场' })), full_text: '李白独游庐山' };
  const mkCard = (vids) => JSON.stringify({ type:'screenplay_card', idea:'望庐山瀑布', target_seconds:30, picked_idx:0, total:3, screenplay: one, art_style:'photorealistic', assets:{characters:{},scenes:{}}, scene_videos: vids||{}, project_id:null });
  const mkVideo = () => JSON.stringify({ prompt: '场景位置：瀑布前观景台。镜头：近景。动作：李白点头。' });
  const sp = { status:'done', idea:'望庐山瀑布', target_seconds:30, picked:0, picked_at:new Date().toISOString(), art_style:'photorealistic', screenplays:[one], assets:{characters:{},scenes:{}}, scene_videos:{}, scene_frames:{}, video_opts:null, project_id:null, warnings:[] };
  const hist = [];
  window.api = async (m, p) => {
    if (/\\/assist(\\?|$)/.test(p)) return { assists: { screenplay: sp } };
    if (/supplement-history/.test(p)) return { history: hist.slice() };
    if (/thinking-brief/.test(p)) return {};
    return {};
  };
  const cid = 'VIDREPRO' + Date.now();
  const c = document.createElement('div'); c.id = 'chat-stream-msgs-' + cid; document.body.appendChild(c);
  // ① 初始历史：一条旧 video_done + 剧本卡
  hist.push({ at:'2026-09-25T14:20:00.000Z', role:'system', source:'video_done', text: mkVideo() });
  hist.push({ at:'2026-09-25T14:08:24.061Z', role:'system', source:'screenplay_result', text: mkCard({}) });
  // 每轮手动驱动：重新挂桩 → 注册轮询 → await 最新那一轮（水印 histCount 存在 _chatState 里，跨轮保留）
  // 自证：记录每个气泡由谁渲染 + 抓回被测代码文本验证版本（避免"跑的不是这份代码"的假结论）
  const rendered = [];
  const _rcb = window.renderChatBubble;
  window.renderChatBubble = function (cc, ee) { if (ee) rendered.push((ee.source || '-') + '@' + (ee.at || '')); return _rcb(cc, ee); };

  const runTick = async () => {
    const local = []; const _si = window.setInterval;
    window.setInterval = (fn) => { local.push(fn); return 0; };
    startChatPolling(cid);
    window.setInterval = _si;
    if (!local.length) throw new Error('没抓到 tick 回调');
    await local[0]();
  };
  const snap = (tag) => ({ tag: tag, hist: hist.length, bubbles: [...c.querySelectorAll('.chat-bubble')].map(b => (b.dataset.source || '-') + '@' + (b.dataset.at || '')) });
  const steps = [];
  await runTick();                                           // 首轮渲染：1 张卡
  const before = c.querySelectorAll('.chat-bubble[data-source="screenplay_result"]').length;
  steps.push(snap('afterTick1'));
  // ② 生成视频：服务端「删旧剧本卡 → push 新剧本卡（新 at）」+ 追加 video_done（历史 +1）
  hist.splice(1, 1);
  hist.push({ at:'2026-09-25T14:45:54.047Z', role:'system', source:'video_done', text: mkVideo() });
  hist.push({ at:'2026-09-25T14:46:11.256Z', role:'system', source:'screenplay_result', text: mkCard({ '0': { video_url:'https://cdn/v0.mp4' } }) });
  steps.push(snap('afterMutate'));
  await refreshScreenplayChatCard(cid);                      // ③ 生成完的即时刷新（就地更新，保留旧 data-at）
  steps.push(snap('afterRefresh'));
  await runTick();                                           // ④ 下一轮轮询（条数 +1 → 增量路径）
  steps.push(snap('final'));
  const bubbles = c.querySelectorAll('.chat-bubble[data-source="screenplay_result"]');
  const codeTxt = await (await fetch('/client/js/views/requirements/chat.js')).text();
  const out = { mode:'video', beforeVideo: before, bubbleCount: bubbles.length, ats: [...bubbles].map(b => b.dataset.at), titles: [...c.querySelectorAll('.assist-section-title')].map(e => e.textContent.trim()), rendered: rendered, hasStaleFix: /撤掉同卡旧版本/.test(codeTxt), steps: steps };
  c.remove();
  return JSON.stringify(out);
})()`;

// 多卡并存：同一会话 3 个不同 idea 的剧本卡（服务端语义允许）→ 重写其中一张时
// 绝不能把另外两张也清掉（逻辑身份去重只对"同 idea"生效）
const HARNESS_MULTI = `(async () => {
  const one = { title: '诗仙的顿悟', scenes: [1,2].map(i => ({ idx:i, shot:'中景', desc:'第'+i+'场' })), full_text: 'x' };
  const mkCard = (idea, extra) => JSON.stringify(Object.assign({ type:'screenplay_card', idea: idea, target_seconds:30, picked_idx:0, total:3, screenplay: one, art_style:'photorealistic', assets:{characters:{},scenes:{}}, scene_videos:{}, project_id:null }, extra || {}));
  const sp = { status:'done', idea:'望庐山瀑布', target_seconds:30, picked:0, picked_at:new Date().toISOString(), art_style:'photorealistic', screenplays:[one], assets:{characters:{},scenes:{}}, scene_videos:{}, scene_frames:{}, video_opts:null, project_id:null, warnings:[] };
  const hist = [];
  window.api = async (m, p) => {
    if (/\\/assist(\\?|$)/.test(p)) return { assists: { screenplay: sp } };
    if (/supplement-history/.test(p)) return { history: hist.slice() };
    if (/thinking-brief/.test(p)) return {};
    return {};
  };
  const cid = 'MULTIREPRO' + Date.now();
  const c = document.createElement('div'); c.id = 'chat-stream-msgs-' + cid; document.body.appendChild(c);
  hist.push({ at:'2026-09-25T12:34:17.516Z', role:'system', source:'screenplay_result', text: mkCard('关关雎鸠') });
  hist.push({ at:'2026-09-25T13:51:00.881Z', role:'system', source:'screenplay_result', text: mkCard('饮湖上初晴后雨') });
  hist.push({ at:'2026-09-25T14:08:24.061Z', role:'system', source:'screenplay_result', text: mkCard('望庐山瀑布') });
  // 每轮手动驱动：重新挂桩 → 注册轮询 → await 最新那一轮（水印 histCount 存在 _chatState 里，跨轮保留）
  // 自证：记录每个气泡由谁渲染 + 抓回被测代码文本验证版本（避免"跑的不是这份代码"的假结论）
  const rendered = [];
  const _rcb = window.renderChatBubble;
  window.renderChatBubble = function (cc, ee) { if (ee) rendered.push((ee.source || '-') + '@' + (ee.at || '')); return _rcb(cc, ee); };

  const runTick = async () => {
    const local = []; const _si = window.setInterval;
    window.setInterval = (fn) => { local.push(fn); return 0; };
    startChatPolling(cid);
    window.setInterval = _si;
    if (!local.length) throw new Error('没抓到 tick 回调');
    await local[0]();
  };
  await runTick();
  const three = c.querySelectorAll('.chat-bubble[data-source="screenplay_result"]').length;
  // 生成视频 → 只重写「望庐山瀑布」这一张（删旧 + 推新到尾部）+ 追加 video_done
  hist.splice(2, 1);
  hist.push({ at:'2026-09-25T14:45:54.047Z', role:'system', source:'video_done', text: JSON.stringify({ prompt: '镜头：近景' }) });
  hist.push({ at:'2026-09-25T14:46:11.256Z', role:'system', source:'screenplay_result', text: mkCard('望庐山瀑布', { scene_videos: { '0': { video_url:'https://cdn/v0.mp4' } } }) });
  await runTick();
  const bubbles = c.querySelectorAll('.chat-bubble[data-source="screenplay_result"]');
  const codeTxt = await (await fetch('/client/js/views/requirements/chat.js')).text();
  const out = { mode:'multi', hasStaleFix: /撤掉同卡旧版本/.test(codeTxt), beforeRewrite: three, bubbleCount: bubbles.length, ats: [...bubbles].map(b => b.dataset.at), cardKeys: [...bubbles].map(b => (b.dataset.cardKey || '').replace('screenplay_result|idea:', '')) };
  c.remove();
  return JSON.stringify(out);
})()`;

const HARNESS = MODE === 'video' ? HARNESS_VIDEO : (MODE === 'multi' ? HARNESS_MULTI : HARNESS_SELECT);

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.error('✗ 找不到 Chrome/Edge，可设 CHROME_PATH 环境变量'); process.exit(1); }
  const profile = path.join(os.tmpdir(), 'dup-card-prof-' + Date.now());
  console.log('启动 headless Chrome…', chrome);
  const proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    BASE + '/client/login.html',
  ], { stdio: 'ignore', detached: false });

  try {
    const ws = await wsUrlForPage();
    // guest 登录（ACMS 自带）—— 页面刚起来时偶发 Failed to fetch（同源请求抢跑），重试 3 次
    let login;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        login = await evaluate(ws, `(async () => {
          const r = await fetch('${BASE}/api/auth/guest', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ clientId: 'dup-repro-' + Date.now() }) });
          const d = await r.json();
          if (!d.token) return 'GUEST_FAIL: ' + JSON.stringify(d).slice(0,120);
          localStorage.setItem('acms-token', d.token);
          localStorage.setItem('acms-user', JSON.stringify(d.user || {}));
          return 'OK ' + (d.user && d.user.username);
        })()`);
        break;
      } catch (e) {
        if (attempt === 3) throw e;
        console.log('  guest 登录第 ' + attempt + ' 次失败（' + e.message + '），重试…');
        await sleep(1000);
      }
    }
    if (String(login).startsWith('GUEST_FAIL')) throw new Error(login);
    console.log('guest 登录:', login);

    await evaluate(ws, `location.href = '${BASE}/client/index.html'`, false);
    // 等页面把前端 JS 全加载完
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        const r = await evaluate(ws, `JSON.stringify({ a: typeof window.refreshScreenplayChatCard, b: typeof window.startChatPolling, c: !!(window.ACMSScreenplayCard && window.ACMSScreenplayCard.renderDetail) })`);
        const j = JSON.parse(r || '{}');
        if (j.a === 'function' && j.b === 'function' && j.c) { ready = true; break; }
      } catch {}
      await sleep(500);
    }
    if (!ready) throw new Error('页面 JS 没就绪（refreshScreenplayChatCard/startChatPolling/ACMSScreenplayCard 没挂上）');

    console.log('跑复现 harness（真实函数 + 真实时序）mode=' + MODE + '…');
    const res = JSON.parse(await evaluate(ws, HARNESS));
    console.log('\n结果:', JSON.stringify(res, null, 2));
    // 判定：select/video 模式 = 最终只该有 1 张卡；multi 模式 = 3 张不同 idea 的卡都要在
    const expect = MODE === 'multi' ? 3 : 1;
    const pass = res.bubbleCount === expect;
    if (pass) {
      console.log(`\n✅ 通过：剧本卡 ${res.bubbleCount} 张（期望 ${expect}，mode=${MODE}）`);
      if (res.ats && !res.ats[0]) console.log('   ⚠️ 提醒：有一张的 data-at 是空串（指纹没打上），轮询去重会失效');
      process.exit(0);
    } else {
      console.log(`\n❌ 失败：渲染了 ${res.bubbleCount} 张（期望 ${expect}）→ bug 复现（mode=${MODE}）`);
      process.exit(1);
    }
  } catch (e) {
    console.error('✗ 复现脚本出错:', e.message);
    process.exit(1);
  } finally {
    try { proc.kill(); } catch {}
    try { execSync(`rm -rf "${profile}"`, { stdio: 'ignore' }); } catch {}
  }
})();
