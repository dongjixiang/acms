// ACMS Web 机器人视图 v0.7.1 —— 浏览器智能体（CDP 精准控制 + AI 决策 + 求助暂停）
// ============================================================
// v0.2 重构（多多要求）：不是手动操作台，是智能体。
//   用户给一个目标（自然语言）→ LLM 自主规划 → 操作真实浏览器 →
//   观察调整 → 达成 → 中文总结。执行过程实时可视化（步骤时间线 + 截图）。
//
// 布局：
//   顶部：目标输入（大）+ 🤖 执行 + 状态条
//   中部：左 = 实时预览大图（最新截图自动跟随） 右 = 步骤时间线
//   底部：完成总结区
//   辅助：URL 手动打开（调试兜底，折叠）
//
// 后端：POST /api/browser-agent/task → GET /task/:id/stream (SSE)
// 主题：跟随 ACMS 三主题（var(--xxx)）

(function () {
  'use strict';

  const AK_VALUE = (typeof window !== 'undefined' && window.AK) || 'dev-key-001';
  let _es = null;          // 当前 EventSource
  let _taskId = null;
  let _stepCount = 0;

  const CSS = `
  <style>
    .bc2-root { display:flex; flex-direction:column; height:100%; box-sizing:border-box;
      background:var(--bg,#1a1d23); color:var(--text,#e8e8e8); font-size:13px; padding:10px; gap:8px; overflow:hidden; }
    .bc2-goal { display:flex; gap:8px; align-items:flex-end; }
    .bc2-goal textarea { flex:1; min-height:44px; max-height:90px; resize:vertical; background:var(--bg2,#23262e);
      color:var(--text,#e8e8e8); border:1px solid var(--border,#333); border-radius:8px; padding:8px 12px;
      font-size:13px; outline:none; font-family:inherit; }
    .bc2-goal textarea:focus { border-color:var(--accent,#4f8cff); }
    .bc2-btn { background:var(--bg2,#23262e); color:var(--text,#e8e8e8); border:1px solid var(--border,#333);
      border-radius:8px; padding:8px 16px; font-size:13px; cursor:pointer; white-space:nowrap; }
    .bc2-btn:hover { border-color:var(--accent,#4f8cff); }
    .bc2-btn.primary { background:var(--accent,#4f8cff); color:#fff; border-color:transparent; }
    .bc2-btn:disabled { opacity:.45; cursor:not-allowed; }
    .bc2-status { font-size:11px; color:var(--text2,#999); min-height:14px; }
    .bc2-main { flex:1; display:flex; gap:8px; min-height:0; }
    .bc2-preview { flex:2; background:var(--bg2,#23262e); border:1px solid var(--border,#333);
      border-radius:8px; overflow:hidden; position:relative; display:flex; align-items:center; justify-content:center; }
    .bc2-preview img { max-width:100%; max-height:100%; object-fit:contain; display:block; }
    .bc2-ph { color:var(--text2,#777); font-size:12px; padding:20px; text-align:center; }
    .bc2-timeline { flex:1.2; background:var(--bg2,#23262e); border:1px solid var(--border,#333);
      border-radius:8px; padding:8px; overflow-y:auto; font-size:12px; line-height:1.55; }
    .bc2-step { border-bottom:1px dashed var(--border,#333); padding:6px 2px; }
    .bc2-step:last-child { border-bottom:none; }
    .bc2-step .hd { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
    .bc2-chip { background:var(--bg3,#2a2e38); border:1px solid var(--border,#444); border-radius:4px;
      padding:1px 6px; font-size:10px; color:var(--accent,#7aa8ff); white-space:nowrap; }
    .bc2-step .msg { color:var(--text,#e8e8e8); font-size:12px; margin-top:3px; }
    .bc2-step img { margin-top:5px; max-width:180px; max-height:110px; border-radius:4px;
      border:1px solid var(--border,#333); cursor:pointer; }
    .bc2-done { background:var(--bg2,#23262e); border:1px solid var(--border,#333); border-radius:8px;
      padding:10px 12px; max-height:140px; overflow-y:auto; font-size:12px; line-height:1.65; white-space:pre-wrap; }
    .bc2-done b { color:var(--green,#4caf50); }
    .bc2-tools { display:flex; gap:6px; align-items:center; flex-wrap:wrap; border-top:1px solid var(--border,#333); padding-top:6px; }
    .bc2-tools input { flex:1; min-width:160px; background:var(--bg2,#23262e); color:var(--text,#e8e8e8);
      border:1px solid var(--border,#333); border-radius:6px; padding:5px 10px; font-size:12px; outline:none; }
    .bc2-example { color:var(--text2,#999); font-size:11px; cursor:pointer; border-bottom:1px dotted var(--text2,#999); }
  </style>`;

  function el(id, root) { return (root || document).querySelector('#' + id); }

  async function api(method, path, body) {
    const res = await fetch('/api/browser-agent' + path + '?api_key=' + AK_VALUE, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  function render(w) {
    const root = w.$c || document;
    root.innerHTML = CSS + `
    <div class="bc2-root">
      <div class="bc2-goal">
        <textarea id="bc2-goal" placeholder="给我一个目标，我来自动完成。例如：&#10;· 去 DeepSeek（开启联网搜索）查一下深圳95号汽油今天的价格&#10;· 打开 GitHub 搜一下 crawl4ai 项目，把它的 star 数和最近更新时间告诉我&#10;· 去 cn.bing.com 搜索「GEO AI可见性」，把前 5 条结果的标题和链接列出来"></textarea>
        <button class="bc2-btn primary" id="bc2-run">🤖 执行</button>
        <button class="bc2-btn" id="bc2-clear" title="清空时间线">清空</button>
      </div>
      <div class="bc2-status" id="bc2-status">就绪 —— 浏览器智能体：给目标，它自己想办法达成（浏览器全局唯一，与小吉/GEO 共用）</div>
      <div class="bc2-main">
        <div class="bc2-preview" id="bc2-preview">
          <img id="bc2-live" src="" alt="" style="display:none;max-width:100%;max-height:100%;object-fit:contain">
          <div class="bc2-ph" id="bc2-live-ph">🟢 实时画面（WebSocket 帧流）—— 连接中…</div>
        </div>
        <div class="bc2-timeline" id="bc2-timeline">
          <div class="bc2-ph">步骤时间线 —— 智能体每步操作（打开页面 / 点击 / 输入 / 读取）都会显示在这里</div>
        </div>
      </div>
      <div class="bc2-done" id="bc2-done" style="display:none"></div>
      <div class="bc2-help" id="bc2-help" style="display:none">
        <div style="font-weight:bold;color:var(--accent,#7aa8ff);margin-bottom:4px">⏸ 需要你的帮助</div>
        <div id="bc2-help-q" style="font-size:12px;line-height:1.6;margin-bottom:6px;white-space:pre-wrap"></div>
        <div style="display:flex;gap:6px">
          <input id="bc2-help-input" class="bc2-input" placeholder="输入你的帮助/回复，Enter 发送……">
          <button class="bc2-btn primary" id="bc2-help-send">回复并继续</button>
        </div>
      </div>
      <div class="bc2-tools">
        <input id="bc2-url" placeholder="手动打开 URL（调试兜底；打开后实时画面自动显示）">
        <button class="bc2-btn" id="bc2-open">打开</button>
        <span style="opacity:.5">|</span>
        <input id="bc2-kbd" placeholder="👆 画面可直接点击/滚动；这里手动输入文本（Enter 输入+回车）">
        <button class="bc2-btn" id="bc2-kbd-send">输入</button>
        <button class="bc2-btn" id="bc2-kbd-enter" title="发送 Enter 键">↵ 回车</button>
        <span class="bc2-example" id="bc2-ex">示例</span>
      </div>
    </div>`;

    bindEvents(root);
    connectCDP(root); // CDP 双向控制（screencast 帧流 + Input 注入；失败降级 stream）
    refreshViewport(root); // 视口尺寸（画面点击映射 fallback）
    bindLivePreview(root); // 双向控制：画面点击/滚动/悬停
    setStatus(root, '就绪 —— 👆 可在画面上直接点击/滚动操作，或给目标让智能体自动做');
  }

  function setStatus(root, msg) {
    const s = el('bc2-status', root);
    if (s) s.textContent = msg;
  }

  function logStep(root, step) {
    const box = el('bc2-timeline', root);
    if (!box) return;
    _stepCount++;
    const t = new Date(step.ts || Date.now()).toLocaleTimeString('zh-CN', { hour12: false });
    const div = document.createElement('div');
    div.className = 'bc2-step';
    const tools = (step.toolNames || []).map((n) => `<span class="bc2-chip">${n}</span>`).join('');
    div.innerHTML = `<div class="hd"><span style="opacity:.55">#${step.round}</span><span style="opacity:.55">${t}</span>${tools}</div><div class="msg">${esc(step.message || '')}</div>`;
    if (step.screenshot) {
      const img = document.createElement('img');
      img.src = shotUrl(step.screenshot) + '&ts=' + Date.now();
      img.title = '点击看大图';
      // 截图是异步落盘的，撞上未生成时自动重试（最多 3 次）
      let retry = 0;
      img.onerror = () => {
        if (retry < 3) { retry++; setTimeout(() => { img.src = shotUrl(step.screenshot) + '&ts=' + Date.now(); }, 1200 * retry); }
      };
      img.onclick = () => { el('bc2-preview', root).innerHTML = `<img src="${shotUrl(step.screenshot)}&ts=${Date.now()}">`; };
      div.appendChild(img);
    }
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    // 主预览由实时帧流接管（stream），时间线缩略图保留截图作为步骤证据
  }

  function showDone(root, result) {
    const box = el('bc2-done', root);
    box.style.display = 'block';
    const status = result.status === 'done' ? '✅ 目标已达成' : '❌ 执行失败';
    box.innerHTML = `<b>${status}</b>（${_stepCount} 步）\n${esc(result.content || result.error || '')}`;
    setStatus(root, `${status}，用时 ${_stepCount} 步`);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 截图 URL 统一补 api_key（🔴 2026-08-31：task-runner 推送的 URL 不带 key → img 401 破图）
  function shotUrl(p) {
    if (!p) return p;
    return p + (p.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + encodeURIComponent(AK_VALUE);
  }

  // ── 准实时画面：agent-browser WebSocket 帧流（stream enable）──
  // 连接 ws://127.0.0.1:<port>/?maxFps=N → 发 config → 收 {"data":"<base64 JPEG>"}
  // 帧流自动反映 agent 操作（session 级实时画面），无需每步截图
  let _ws = null;
  let _streamRetry = 0;
  let _noFrameT = 0; // 连上但无图片帧的起始时间（浏览器未打开页面时提示）
  let _viewport = null; // 浏览器视口尺寸（画面点击坐标映射用）

  async function refreshViewport(root) {
    try {
      const s = await api('GET', '/status');
      if (s.viewport) _viewport = s.viewport;
    } catch (e) { /* 非关键 */ }
  }

  // 画面点击/滚轮 → 视口坐标映射（CDP viewport 优先，fallback /status viewport）
  function mapImgCoord(e) {
    const live = el('bc2-live');
    if (!live) return null;
    const vp = _cdp.viewport || _viewport;
    if (!vp) return null;
    const rect = live.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const scale = Math.min(rect.width / vp.width, rect.height / vp.height);
    const dispW = vp.width * scale;
    const dispH = vp.height * scale;
    const offX = (rect.width - dispW) / 2;
    const offY = (rect.height - dispH) / 2;
    const x = Math.round((e.clientX - rect.left - offX) / scale);
    const y = Math.round((e.clientY - rect.top - offY) / scale);
    return { x, y };
  }

  // CDP 真实点击（与智能体同一浏览器；fallback 到 /mouse API）
  function clickAt(x, y) {
    if (_cdp.sessionId) {
      cdpSend('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      cdpSend('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      return true;
    }
    return false;
  }

  function moveTo(x, y) {
    if (_cdp.sessionId) {
      cdpSend('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      return true;
    }
    return false;
  }

  function wheelAt(dy) {
    if (_cdp.sessionId) {
      cdpSend('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 0, y: 0, deltaX: 0, deltaY: dy });
      return true;
    }
    return false;
  }

  function bindLivePreview(root) {
    const live = el('bc2-live', root);
    if (!live) return;
    // 点击 → CDP 真实点击（fallback /mouse API）
    live.addEventListener('click', (e) => {
      const c = mapImgCoord(e);
      if (!c) return;
      if (clickAt(c.x, c.y)) { setStatus(root, `👆 已点击 (${c.x}, ${c.y})`); }
      else {
        api('POST', '/mouse', { x: c.x, y: c.y, action: 'click' }).then((r) => {
          if (r.ok) setStatus(root, `👆 已点击 (${c.x}, ${c.y})`);
        }).catch(() => {});
      }
    });
    // 滚轮 → CDP 平滑滚动（fallback /mouse wheel）
    live.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dy = e.deltaY > 0 ? 300 : -300;
      if (!wheelAt(dy)) api('POST', '/mouse', { action: 'wheel', dy }).catch(() => {});
    }, { passive: false });
    // 鼠标移动 → CDP 悬停（fallback /mouse move）
    let _mvT = 0;
    live.addEventListener('mousemove', (e) => {
      const now = Date.now();
      if (now - _mvT < 100) return;
      _mvT = now;
      const c = mapImgCoord(e);
      if (!c) return;
      if (!moveTo(c.x, c.y)) api('POST', '/mouse', { x: c.x, y: c.y, action: 'move' }).catch(() => {});
    });
  }

  function showLiveFrame(root, b64) {
    const live = el('bc2-live', root);
    const ph = el('bc2-live-ph', root);
    if (!live) return;
    live.src = 'data:image/jpeg;base64,' + b64;
    live.style.display = 'block';
    if (ph) ph.style.display = 'none';
  }

  // ── CDP 双向控制（v0.7，替代纯看模式）──
  // 前端直连 agent-browser 的 CDP：screencast 帧流 + Input 事件注入
  //  = 和智能体同一个浏览器实例，精确点击/悬停/滚轮/中文输入
  //
  // 🆕 v0.7.1 修复「精准控制静默降级」：
  //   旧版：一次失败 → fallbackStream 永久降级（鼠标点不准用户不知道为啥）
  //   新版：
  //     1. 后端 /cdp-info 主动 bootstrap（拿不到 URL 时 open about:blank 兜底）
  //     2. 前端失败重试 3 次（800/1600/2400ms），不再一次失败就放弃
  //     3. 状态条明确告诉用户是「精准已就绪 / 重试中 / 降级只看」
  //     4. fallbackStream 后状态条明示「点击/输入可能不精准」（零容忍"toast 骗人"）
  let _cdp = { ws: null, sessionId: null, viewport: null, reqId: 0, pending: new Map(), attempting: false };
  let _cdpRetry = 0;
  const CDP_MAX_RETRY = 3;
  let _streamFallbackActive = false; // 已放弃 CDP 降级到 stream；后续只重试 stream，不再尝试 CDP

  function cdpSend(method, params) {
    return new Promise((resolve) => {
      if (!_cdp.ws || _cdp.ws.readyState !== 1) return resolve(null);
      const id = ++_cdp.reqId;
      _cdp.pending.set(id, resolve);
      try {
        _cdp.ws.send(JSON.stringify({ id, method, params: params || {}, ...(_cdp.sessionId ? { sessionId: _cdp.sessionId } : {}) }));
      } catch (e) { resolve(null); }
    });
  }

  async function connectCDP(root) {
    // 防止重入：上一次还没 attempt 完，别开第二个
    if (_cdp.attempting) return;
    // 已降级 stream → 不再尝试 CDP
    if (_streamFallbackActive) { fallbackStream(root); return; }
    _cdp.attempting = true;
    let ws = null;
    let initialized = false; // 是否成功初始化（startScreencast 跑完）

    try {
      if (_cdpRetry === 0) setStatus(root, '🔗 正在建立 CDP 精准控制…');
      else setStatus(root, `⚠️ CDP 重试中（${_cdpRetry}/${CDP_MAX_RETRY}）…`);
      const r = await api('GET', '/cdp-info');
      // 🆕 v0.7.1：后端返回 bootstrapped=true 说明它刚自动拉起了 daemon，告知用户
      if (r.bootstrapped && _cdpRetry === 0) {
        setStatus(root, '🚀 浏览器 daemon 未启动，后端已自动拉起 about:blank 占位；建立 CDP 精准控制…');
      }
      if (!r.wsUrl) throw new Error('无 CDP URL' + (r.error ? ' — ' + r.error : ''));
      ws = new WebSocket(r.wsUrl);
      _cdp.ws = ws;

      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch (err) { return; }
        if (msg.id && _cdp.pending.has(msg.id)) { _cdp.pending.get(msg.id)(msg.result); _cdp.pending.delete(msg.id); return; }
        if (msg.method === 'Page.screencastFrame') {
          const m = msg.params.metadata || {};
          if (m.deviceWidth) _cdp.viewport = { width: m.deviceWidth, height: m.deviceHeight };
          showLiveFrame(root, msg.params.data);
          _noFrameT = 0;
          if (_cdp.ws && _cdp.ws.readyState === 1) {
            try { _cdp.ws.send(JSON.stringify({ method: 'Page.screencastFrameAck', params: { sessionId: msg.params.sessionId }, sessionId: _cdp.sessionId })); } catch (err) {}
          }
        }
      };

      ws.onopen = async () => {
        try {
          const targets = await cdpSend('Target.getTargets');
          const list = (targets && targets.targetInfos) || [];
          let page = list.find((t) => t.type === 'page' && !t.url.startsWith('chrome://')) || list.find((t) => t.type === 'page');
          if (!page) {
            // 🆕 v0.7.1：CDP 通了但没 page → 主动拉起 about:blank 占位（不再静默失败）
            setStatus(root, '🔗 CDP 已连但无 page，自动拉起 about:blank 占位…');
            try {
              await api('POST', '/open', { url: 'about:blank' });
              await new Promise((r2) => setTimeout(r2, 700));
              const targets2 = await cdpSend('Target.getTargets');
              const list2 = (targets2 && targets2.targetInfos) || [];
              page = list2.find((t) => t.type === 'page' && !t.url.startsWith('chrome://')) || list2.find((t) => t.type === 'page');
            } catch (e2) { /* 拉起失败 → 下面抛 NO_PAGE */ }
            if (!page) throw new Error('无 page target（拉起 about:blank 也失败）');
          }
          const attached = await cdpSend('Target.attachToTarget', { targetId: page.targetId, flatten: true });
          if (!attached) throw new Error('attach 失败');
          _cdp.sessionId = attached.sessionId;
          await cdpSend('Page.enable', {});
          await cdpSend('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 1 });
          initialized = true;
          _cdpRetry = 0; // 成功清零
          setStatus(root, '🟢 CDP 双向控制已连接 —— 画面可直接点击/悬停/滚动/输入（与智能体同一浏览器）');
        } catch (err) {
          console.log('[browser-console] CDP init 失败:', err.message);
          try { ws.close(); } catch (e2) {} // 触发 onclose → scheduleCdpRetry
        }
      };

      ws.onclose = () => {
        const wasInit = initialized;
        _cdp.ws = null; _cdp.sessionId = null; _cdp.viewport = null;
        _cdp.attempting = false;
        if (_streamFallbackActive) return; // 已降级，不再尝试 CDP
        scheduleCdpRetry(root, wasInit ? 'CDP 已连后断开' : 'CDP 初始化失败或连接被拒');
      };

      ws.onerror = () => { try { ws.close(); } catch (e) {} };
    } catch (e) {
      if (ws) { try { ws.close(); } catch (e2) {} }
      _cdp.ws = null; _cdp.sessionId = null; _cdp.viewport = null;
      _cdp.attempting = false;
      scheduleCdpRetry(root, e.message);
    }
  }

  // CDP 重试调度：失败 N 次 → 降级 stream，并明示「降级只看」
  function scheduleCdpRetry(root, reason) {
    if (_cdpRetry >= CDP_MAX_RETRY) {
      setStatus(root, `🟡 CDP 精准控制失败（${reason}，已重试 ${CDP_MAX_RETRY} 次）—— 已降级为「只看」流模式：画面可看，点击/输入可能不精准`);
      _streamFallbackActive = true;
      fallbackStream(root);
      return;
    }
    _cdpRetry++;
    const delay = 800 * _cdpRetry;
    setTimeout(() => {
      // 已被新连接接手 / 已降级 stream → 跳过
      if (_cdp.ws || _cdp.attempting || _streamFallbackActive) return;
      connectCDP(root);
    }, delay);
  }

  // 降级：agent-browser stream（只看不控）
  async function fallbackStream(root) {
    try {
      const r = await api('GET', '/stream-info');
      if (!r.wsUrl) { setStatus(root, '⚠️ 实时画面不可用 —— CDP 和 stream 都没拿到，请刷新页面或检查 daemon'); return; }
      const ws = new WebSocket(r.wsUrl);
      _ws = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'config', maxFps: 5 }));
        _streamRetry = 0;
        _noFrameT = 0;
        // 🆕 v0.7.1：明示降级后果（零容忍"toast 骗人"）
        setStatus(root, '🟡 降级 stream 帧流已连接 —— 画面可看，但点击/输入走的是非原子 CLI 路径，可能不精准');
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg && typeof msg.data === 'string' && msg.data.indexOf('/9j/') === 0) { showLiveFrame(root, msg.data); _noFrameT = 0; }
        } catch (err) {}
      };
      ws.onclose = () => { _ws = null; scheduleReconnect(root); };
      ws.onerror = () => { try { ws.close(); } catch (e) {} };
    } catch (e) { scheduleReconnect(root); }
  }

  // 🆕 v0.7.1：只重试 stream（CDP 路径由 scheduleCdpRetry 接管）
  // 旧版会调 connectCDP —— 现在 stream 是降级路径，不再尝试 CDP
  function scheduleReconnect(root) {
    if (_streamFallbackActive && _streamRetry >= 6) {
      setStatus(root, '🟡 实时画面（stream）连接失败（已重试 6 次）—— 可刷新页面或重新打开 Web 机器人');
      return;
    }
    const delay = Math.min(8000, 1000 * Math.pow(2, _streamRetry));
    _streamRetry++;
    setTimeout(() => { if (_ws && _ws.readyState === 1) return; fallbackStream(root); }, delay);
  }

  function submitGoal(root) {
    const goal = el('bc2-goal', root).value.trim();
    if (!goal) { setStatus(root, '先输入目标'); return; }
    if (_es) { _es.close(); _es = null; }

    // 清 UI（主预览交给实时帧流，不动它）
    el('bc2-timeline', root).innerHTML = '<div class="bc2-ph">执行中…</div>';
    el('bc2-done', root).style.display = 'none';
    _stepCount = 0;
    el('bc2-run', root).disabled = true;
    setStatus(root, '🤖 启动智能体…');

    api('POST', '/task', { goal })
      .then((r) => {
        _taskId = r.taskId;
        setStatus(root, `任务 ${_taskId} 已启动，订阅进度…`);
        // SSE 订阅
        _es = new EventSource('/api/browser-agent/task/' + _taskId + '/stream?api_key=' + AK_VALUE);
        _es.addEventListener('step', (e) => {
          try { logStep(root, JSON.parse(e.data)); } catch (err) {}
        });
        _es.addEventListener('done', (e) => {
          try {
            const result = JSON.parse(e.data);
            showDone(root, result);
          } catch (err) {}
          el('bc2-run', root).disabled = false;
          _es.close(); _es = null;
        });
        // ⏸ 需要用户帮助：显示求助面板，回复后任务继续
        _es.addEventListener('waiting_user', (e) => {
          try {
            const info = JSON.parse(e.data);
            showHelp(root, info.question || '需要你的帮助');
          } catch (err) {}
        });
        _es.addEventListener('error', (e) => {
          // EventSource 重连机制：done 会先到，这里兜底
          if (_es) { _es.close(); _es = null; }
          el('bc2-run', root).disabled = false;
          setStatus(root, '进度流中断（任务可能已完成，可点「清空」后重试）');
        });
      })
      .catch((err) => {
        el('bc2-run', root).disabled = false;
        setStatus(root, '启动失败: ' + err.message);
      });
  }

  // 求助面板
  function showHelp(root, question) {
    const box = el('bc2-help', root);
    if (!box) return;
    el('bc2-help-q', root).textContent = question;
    box.style.display = 'block';
    el('bc2-help-input', root).value = '';
    setStatus(root, '⏸ 智能体需要你的帮助，请回复后继续');
    setTimeout(() => el('bc2-help-input', root).focus(), 50);
  }

  function hideHelp(root) {
    const box = el('bc2-help', root);
    if (box) box.style.display = 'none';
  }

  function sendHelpReply(root) {
    const input = el('bc2-help-input', root);
    const msg = input.value.trim();
    if (!msg || !_taskId) return;
    api('POST', '/task/' + _taskId + '/reply', { message: msg })
      .then((r) => {
        hideHelp(root);
        el('bc2-run', root).disabled = true;
        setStatus(root, '🤖 已收到你的帮助，智能体继续执行…');
        // SSE 已在（同一 taskId 的 stream 还开着）—— resume 的 step/done 会继续推
      })
      .catch((err) => setStatus(root, '回复发送失败: ' + err.message));
  }

  function bindEvents(root) {
    el('bc2-run', root).addEventListener('click', () => submitGoal(root));
    el('bc2-goal', root).addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitGoal(root);
    });
    // 求助回复（Enter 发送）
    el('bc2-help-send', root).addEventListener('click', () => sendHelpReply(root));
    el('bc2-help-input', root).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendHelpReply(root);
    });
    el('bc2-clear', root).addEventListener('click', () => {
      if (_es) { _es.close(); _es = null; }
      el('bc2-timeline', root).innerHTML = '<div class="bc2-ph">步骤时间线已清空</div>';
      el('bc2-done', root).style.display = 'none';
      el('bc2-run', root).disabled = false;
      _stepCount = 0;
      setStatus(root, '就绪');
    });
    // 辅助：手动打开（打开后实时帧流自动显示页面，无需手动截图）
    el('bc2-open', root).addEventListener('click', async () => {
      const url = el('bc2-url', root).value.trim();
      if (!url) return;
      try {
        const r = await api('POST', '/open', { url });
        setStatus(root, '已打开: ' + (r.title || url) + '（实时画面自动更新）');
        refreshViewport(root);
      } catch (err) { setStatus(root, '打开失败: ' + err.message); }
    });
    // 手动键盘输入（点击画面定位光标后；CDP insertText 支持中文）
    const sendKbd = async (withEnter) => {
      const input = el('bc2-kbd', root);
      const text = input.value;
      if (!text) return;
      try {
        if (_cdp.sessionId) {
          // CDP：insertText 直接插入（中文完美），Enter 用真实按键事件
          if (text) await cdpSend('Input.insertText', { text });
          if (withEnter) {
            await cdpSend('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
            await cdpSend('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
          }
        } else {
          await api('POST', '/keyboard', { text });
          if (withEnter) await api('POST', '/press', { key: 'Enter' });
        }
        input.value = '';
        setStatus(root, '⌨️ 已输入' + (withEnter ? ' + 回车' : ''));
      } catch (err) { setStatus(root, '输入失败: ' + err.message); }
    };
    el('bc2-kbd-send', root).addEventListener('click', () => sendKbd(false));
    el('bc2-kbd-enter', root).addEventListener('click', () => sendKbd(true));
    el('bc2-kbd', root).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); sendKbd(true); }
    });
    // 示例填充
    const EXAMPLES = [
      '去 DeepSeek（开启联网搜索）查一下深圳95号汽油今天的价格',
      '打开 GitHub 搜索 crawl4ai，把 star 数和最近更新时间告诉我',
      '去 cn.bing.com 搜索「GEO AI 可见性」，列出前 5 条结果的标题和链接',
      '打开 chat.deepseek.com 问它：用一句话介绍你自己',
    ];
    let exIdx = 0;
    el('bc2-ex', root).addEventListener('click', () => {
      el('bc2-goal', root).value = EXAMPLES[exIdx % EXAMPLES.length];
      exIdx++;
      setStatus(root, '示例已填入（Ctrl+Enter 执行）');
    });
  }

  // 注册（P166）
  if (typeof ACMS !== 'undefined' && ACMS.registerPackage) {
    ACMS.registerPackage('browser-console', {
      title: 'Web机器人',
      icon: '🦾',
      category: '应用',
      defaultSize: { w: 1100, h: 760 },
      loader: function (w) { render(w); },
    });
  } else if (typeof ACMSWin !== 'undefined' && ACMSWin.registerViewLoader) {
    ACMSWin.registerViewLoader('browser-console', function (w) { render(w); });
  }

  if (typeof window !== 'undefined') {
    window.openBrowserConsole = function () {
      if (window.ACMSWin) {
        if (!ACMSWin.isActive()) ACMSWin.enable();
        ACMSWin.open('browser-console', { w: 1100, h: 760, title: 'Web机器人' });
      }
    };
  }
})();
