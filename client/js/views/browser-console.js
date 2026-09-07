// ACMS Web 机器人视图 v1.6.6 —— 引擎可切换：内置(agent-browser) ⇄ 远程预览(稳定 Puppeteer 同屏)
// ============================================================
// v1.6.6（2026-09-07）：右侧步骤面板可折叠（◀/▶，localStorage 记忆）—— 收起后画面最大化，
//   浏览体验对齐「浏览器应用」（画面实测 578px → ~918px 全宽）。
// v1.6.5（2026-09-07 修复）：主画面 img 加 width/height:100% + min-width:0（flex min-width:auto
//   撑爆容器 → 右侧被裁一条）；object-fit:contain 等比完整显示。
// v1.6.4（2026-09-07）：底部加 ◀后退/▶前进/⟳刷新 导航键（远程预览模式可用，CLI 禁用）。
// v1.6.3（2026-09-07）：浏览器应用同款「直接输入」—— 点画面后隐藏 IME textarea 桥，
//   直接打字即上屏（中文 IME 合成 end 整段 / 英文 input 即发；控制键转发）。⌨️ 浮层保留备用。
// v1.6.2（2026-09-07 修复）：点画面时清空本地焦点（否则打字被底部目标框吃掉）；
//   ⌨️ 浮层 Enter=直接上屏、Esc=关闭、打开时自动抢占焦点。
// v1.6.1（2026-09-07 修复）：主画面全链路按住-拖动-松开（百度滑块验证不再拖整图）；
//   恢复 ⌨️ 键盘浮层（点画面输入框落位 → 打字上屏/回车/退格/Tab/Esc）。
// v1.6（多多拍板 2026-09-07）：给 Web机器人加「远程预览」模式 —— agent 驱动 app-runtime 稳定
//   Puppeteer 会话（人与 agent 同一浏览器同一画面），主画面 = 实时帧流；人可随时 ⏹停止 /
//   上手操作（点击/滚轮/悬停走 /api/app-runtime/input）/ 给新指示（interrupt）；
//   web_* 动作经 puppeteer-driver 落到该会话。CLI 内置引擎行为不变（无 appSessionId 时）。
// v1.5（多多要求）：
//   - 布局：左栏会话列表 + 主区（左静态截图 / 右 340px 固定面板：执行步骤&对话流混排）
//   - 删除浮动抽屉对话流 / mini 气泡 / chat-toggle 按钮 —— 对话流并入右侧固定面板
//   - 删除 Puppeteer / 手动 URL / 重启远程浏览器 / 键盘输入 按钮及相关功能
//   - 帧流全部移除：主画面显示最近一步静态截图（CDP 仅用于点击/键盘操控）
//   - 气泡 ACMS chat-bubble 浅色风格（tool 气泡浅色，适配 ACMS 浅色主题）
//   - CDP 精准控制保留：鼠标点击/悬停/滚动/键盘输入绑定到静态截图（坐标等比映射）
//   - 会话 localStorage 持久化 + 多轮对话 + SSE 步骤进度（后端 session/*）
// 主题：跟随 ACMS 三主题（var(--xxx)）
(function () {
  'use strict';

  const AK_VALUE = (typeof window !== 'undefined' && window.AK) || 'dev-key-001';
  let _es = null;
  let _currentTaskId = null;
  let _stepCount = 0;

  // ── 会话存储（localStorage） ──
  const LS_KEY = 'web-robot-sessions-v1';
  let _sessions = []; // [{id, title, createdAt, updatedAt, messageCount}]
  let _currentSessionId = null;
  let _currentMessages = []; // 当前会话的消息（in-memory）

  // ── v1.6 引擎模式：内置(CLI agent-browser) ⇄ 远程预览(稳定 app-runtime Puppeteer 同屏) ──
  const PP_LS_KEY = 'wb-engine-mode-v1';          // 'cli' | 'pp'
  const PP_SESSION_LS_KEY = 'wb-pp-app-session-v1';
  function loadEngineMode() {
    try { return localStorage.getItem(PP_LS_KEY) === 'pp'; } catch (e) { return false; }
  }
  let _ppMode = loadEngineMode();                 // true = 远程预览（Puppeteer）模式
  let _pp = { appSessionId: null, ws: null, ready: false, viewport: null, lastUrl: '', ensurePromise: null };

  const CSS = `
  <style>
    /* Web 机器人 v1.0 — 最大化画面 + 抽屉对话 + 固定输入条 */
    .wb-shell { display:flex; flex-direction:column; height:100%; box-sizing:border-box;
      background:var(--bg,#1a1d23); color:var(--text,#e8e8e8); font-size:13px; overflow:hidden; }
    .wb-topbar { display:flex; align-items:center; gap:8px; padding:8px 12px;
      border-bottom:1px solid var(--border,#333); flex-shrink:0; background:var(--bg2,#23262e); }
    .wb-title { font-weight:600; font-size:14px; }
    /* v1.1 健康检查状态灯（顶部）：v1.5 起检测 ws+session+Chrome 响应 ping */
    .wb-health { display:flex; align-items:center; gap:5px; padding:3px 8px; border-radius:10px;
      cursor:pointer; font-size:11px; user-select:none; background:#2a2e38; color:#c8ccd4;
      border:1px solid transparent; flex-shrink:0; transition:background .15s; }
    .wb-health:hover { background:#3a3e48; }
    .wb-health-dot { width:8px; height:8px; border-radius:50%; background:#666; display:inline-block; flex-shrink:0; transition:background .2s; }
    .wb-health-text { font-weight:500; }
    .wb-health.gray   .wb-health-dot { background:#666; }
    .wb-health.green  .wb-health-dot { background:#22c55e; box-shadow:0 0 6px #22c55e; }
    .wb-health.yellow .wb-health-dot { background:#eab308; box-shadow:0 0 4px #eab308; }
    .wb-health.red    .wb-health-dot { background:#ef4444; box-shadow:0 0 6px #ef4444; animation: wb-pulse-red 1.2s ease-in-out infinite; }
    .wb-health.green  .wb-health-text { color:#22c55e; }
    .wb-health.yellow .wb-health-text { color:#eab308; }
    .wb-health.red    .wb-health-text { color:#ef4444; }
    @keyframes wb-pulse-red { 0%,100% { box-shadow:0 0 4px #ef4444; } 50% { box-shadow:0 0 12px #ef4444; } }
    .wb-status { font-size:11px; color:var(--text2,#999); flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .wb-btn { background:var(--bg2,#23262e); color:var(--text,#e8e8e8); border:1px solid var(--border,#444);
      border-radius:6px; padding:4px 10px; font-size:12px; cursor:pointer; white-space:nowrap; }
    .wb-btn:hover { border-color:var(--accent,#4f8cff); }
    .wb-btn-mini { background:transparent; border:1px solid var(--border,#333); border-radius:6px;
      padding:4px 8px; font-size:14px; cursor:pointer; color:var(--text); line-height:1; }
    .wb-btn-mini:disabled { opacity:.35; cursor:not-allowed; }
    .wb-btn-mini:hover:not(:disabled) { border-color:var(--accent); }
    .wb-btn-primary { background:var(--accent,#4f8cff); color:#fff; border:none; border-radius:6px;
      padding:6px 16px; font-size:13px; cursor:pointer; font-weight:500; white-space:nowrap; }
    .wb-btn.on { background:var(--accent,#4f8cff); color:#fff; border-color:var(--accent,#4f8cff); }
    .wb-btn-primary:disabled { opacity:.45; cursor:not-allowed; }

    .wb-body { display:flex; flex:1; min-height:0; min-width:0; }

    /* 主区（column：main 在上 + bottombar 在底固定） */
    .wb-content { flex:1; display:flex; flex-direction:column; min-width:0; min-height:0; }
    .wb-main { flex:1; display:flex; min-width:0; min-height:0; position:relative; }

    /* 左栏：会话列表 */
    .wb-sidebar { width:180px; flex-shrink:0; border-right:1px solid var(--border,#333);
      display:flex; flex-direction:column; background:var(--bg2,#23262e); }
    .wb-sidebar-header { padding:8px 12px; font-size:11px; color:var(--text2,#999);
      border-bottom:1px solid var(--border); flex-shrink:0; font-weight:500; }
    .wb-session-list { flex:1; overflow-y:auto; padding:4px; }
    .wb-session-item { padding:8px 10px; border-radius:6px; cursor:pointer; margin-bottom:4px;
      font-size:12px; position:relative; transition:background .12s; }
    .wb-session-item:hover { background:var(--bg3,#2a2e38); }
    .wb-session-item.active { background:var(--accent,#4f8cff); color:#fff; }
    .wb-session-item.active .wb-session-item-meta { color:rgba(255,255,255,.8); }
    .wb-session-item-title { font-weight:500; margin-bottom:2px; overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; padding-right:18px; }
    .wb-session-item-meta { font-size:10px; opacity:.7; display:flex; gap:6px; }
    .wb-session-item-del { position:absolute; top:6px; right:6px; opacity:0; transition:opacity .15s;
      cursor:pointer; padding:1px 6px; border-radius:3px; background:transparent; border:none; color:inherit; font-size:14px; line-height:1; }
    .wb-session-item:hover .wb-session-item-del { opacity:.6; }
    .wb-session-item-del:hover { background:rgba(255,80,80,.4); opacity:1; }
    .wb-session-empty { padding:20px 10px; text-align:center; color:var(--text2,#777); font-size:11px; line-height:1.6; }
    .wb-sidebar-footer { padding:6px; border-top:1px solid var(--border); flex-shrink:0; }

    /* 主区 — 左静态截图 + 右「执行步骤&对话」固定面板（v1.5） */
    .wb-preview { flex:1; background:var(--bg2,#23262e); display:flex; align-items:center;
      justify-content:center; position:relative; overflow:hidden; min-width:0; }
    .wb-preview img { width:100%; height:100%; min-width:0; min-height:0; object-fit:contain; display:block; }
    /* v1.6.5: 上面 img 必须 width/height:100% + min-width:0 —— flex item 对图片默认
       min-width:auto=原始像素宽(1100+)，会把容器撑爆导致右侧被 overflow:hidden 裁掉一条 */
    .wb-preview-ph { color:var(--text2,#777); font-size:13px; padding:20px; text-align:center; line-height:1.6; }
    .wb-steps { flex:0 0 340px; min-width:280px; max-width:440px; border-left:1px solid var(--border,#333);
      background:var(--bg,#1a1d23); display:flex; flex-direction:column; overflow:hidden; transition:flex-basis .18s ease, min-width .18s ease; }
    /* v1.6.6: 右侧面板可折叠 —— 收起后画面最大化（浏览器应用式浏览） */
    .wb-steps.collapsed { flex:0 0 26px; min-width:26px; max-width:26px; }
    .wb-steps.collapsed .wb-steps-body { display:none; }
    .wb-steps.collapsed .wb-steps-header { flex-direction:column; padding:6px 0; justify-content:flex-start; gap:8px; }
    .wb-steps.collapsed .wb-steps-title,
    .wb-steps.collapsed .wb-steps-progress { display:none; }
    .wb-steps-header { padding:8px 12px; font-size:12px; color:var(--text2,#999); font-weight:600;
      border-bottom:1px solid var(--border); flex-shrink:0; display:flex; justify-content:space-between; align-items:center; }
    .wb-steps-body { flex:1; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:8px; }
    .wb-steps-empty { color:#888; font-size:11px; padding:16px 6px; text-align:center; line-height:1.6; }

    /* v1.5: ACMS chat-bubble 风格（浅色主题友好）—— 与主聊天流一致 */
    .wb-msg { display:flex; gap:8px; align-items:flex-start; max-width:94%; font-size:13px; line-height:1.55; animation:wb-msg-in .18s ease; }
    .wb-msg.user { align-self:flex-end; flex-direction:row-reverse; }
    .wb-msg.assistant, .wb-msg.tool { align-self:flex-start; }
    .wb-msg .wb-msg-avatar { width:28px; height:28px; border-radius:50%; flex-shrink:0;
      display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600; margin-top:2px; }
    .wb-msg.user .wb-msg-avatar { background:var(--accent,#0ea89d); color:#fff; }
    .wb-msg.assistant .wb-msg-avatar { background:linear-gradient(135deg,var(--accent,#0ea89d),var(--blue,#4b8fd4)); color:#fff; }
    .wb-msg.tool .wb-msg-avatar { background:var(--bg3,#e8eaed); color:var(--text); border:1px solid var(--border); font-size:10px; }
    .wb-msg .wb-msg-inner { flex:1; min-width:0; padding:8px 12px; border-radius:12px; word-break:break-word; }
    .wb-msg.user .wb-msg-inner { background:var(--accent,#0ea89d); color:#fff; border-top-right-radius:4px; }
    .wb-msg.assistant .wb-msg-inner { background:var(--bg3,#eceef1); color:var(--text); border:1px solid var(--border,#ddd); border-top-left-radius:4px; }
    .wb-msg.tool .wb-msg-inner { background:var(--bg3,#f2f3f5); color:var(--text); border:1px solid var(--border,#ddd); border-radius:10px; font-size:12px; }
    .wb-msg.waiting { align-self:stretch; max-width:100%; background:#fff3cd; color:#856404;
      border:1px solid #ffc107; border-radius:10px; padding:8px 12px; font-size:12px; }
    .wb-msg-bubble-name { font-size:10px; opacity:.65; margin-bottom:3px; font-weight:600; display:flex; align-items:center; gap:5px; }
    .wb-msg-meta { font-size:10px; opacity:.6; margin-top:4px; }
    @keyframes wb-msg-in { from { opacity:0; transform:translateY(4px);} to { opacity:1; transform:none;} }
    .wb-help { display:flex; gap:6px; margin-top:8px; }
    .wb-help input { flex:1; min-width:0; padding:6px 10px; border:1px solid #856404;
      border-radius:4px; background:#fff; color:#333; font-size:12px; outline:none; }

    /* v1.6.1: 主画面 = 同屏操控面（禁原生拖图/选中；打字走 ⌨️ 浮层） */
    #wb-last-shot { user-select:none; -webkit-user-drag:none; cursor:crosshair; }
    /* 底部固定：工具栏 + 输入条 */
    .wb-bottombar { padding:8px 12px; border-top:1px solid var(--border);
      display:flex; gap:6px; align-items:center; background:var(--bg2,#23262e);
      flex-shrink:0; min-height:56px; box-sizing:border-box; }
    .wb-input { flex:1; min-width:0; padding:8px 12px; border:1px solid var(--border);
      border-radius:6px; background:var(--bg3,#2a2e38); color:var(--text); font-size:13px;
      outline:none; resize:none; height:38px; max-height:80px; font-family:inherit; line-height:1.4; }
    .wb-input:focus { border-color:var(--accent); }
    .wb-badge { background:var(--accent); color:#fff; border-radius:8px;
      padding:0 6px; font-size:10px; margin-left:2px; font-weight:600; }
  </style>`;

  // ── 工具函数 ──
  function openImagePreview(url) {
    // 点击缩略图放大预览（简单覆盖层，不依赖外部组件，符合多多零容忍规则）
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
    overlay.innerHTML = `<img src="${url}" style="max-width:92vw;max-height:88vh;border-radius:8px;border:2px solid #4f8cff;box-shadow:0 12px 40px rgba(0,0,0,.7);object-fit:contain;display:block;" onclick="event.stopPropagation()" alt="放大截图">`;
    overlay.onclick = () => overlay.remove();
    document.body.appendChild(overlay);
  }
  function el(id, root) { return (root || document).querySelector('#' + id); }

  async function api(method, path, body) {
    const res = await fetch('/api/browser-agent' + path + '?api_key=' + AK_VALUE, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // v1.1 修复：抛错时带 status（前端 loadSessionMessages 区分 404 vs 网络错误）
      const err = new Error(data.error || ('HTTP ' + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function shotUrl(p) {
    if (!p) return p;
    return p + (p.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + encodeURIComponent(AK_VALUE);
  }
  function shortId() { return 'ws-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function agoText(dt) {
    const diff = Date.now() - dt.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    return Math.floor(diff / 86400000) + ' 天前';
  }

  // ═══════════════════════════════════════════════════════
  // v1.6 远程预览（Puppeteer app-runtime）引擎
  //  agent 的 web_* 动作经 puppeteer-driver 驱动同一 app-runtime 会话，
  //  前端只负责：建/复用会话 → 收实时帧上主画面 → 人工输入转发到该会话
  // ═══════════════════════════════════════════════════════
  function ppHeaders() { return { 'Content-Type': 'application/json', 'X-API-Key': AK_VALUE }; }
  async function ppApi(method, path, body) {
    const res = await fetch('/api/app-runtime' + path + '?api_key=' + encodeURIComponent(AK_VALUE), {
      method, headers: ppHeaders(), body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }
  function ppActive() { return _ppMode && !!_pp.appSessionId; }
  // 复用/新建 app-runtime 会话（幂等）。ACMS 重启后旧 appSessionId 已失效 → 自动新建。
  function ensureAppSession(root) {
    if (_pp.ensurePromise) return _pp.ensurePromise;
    _pp.ensurePromise = (async () => {
      let sid = null;
      try { sid = localStorage.getItem(PP_SESSION_LS_KEY); } catch (e) {}
      if (sid) {
        try {
          const lst = await ppApi('GET', '/sessions');
          const arr = (lst && lst.sessions) || (Array.isArray(lst) ? lst : []);
          const alive = arr.some(s => (s.sessionId || s.id) === sid);
          if (!alive) sid = null;
        } catch (e) { sid = null; }
      }
      if (!sid) {
        const r = await ppApi('POST', '/open', { url: 'about:blank', w: 1100, h: 700 });
        sid = (r && r.session && r.session.sessionId) || (r && r.sessionId);
        if (!sid) throw new Error('app-runtime 会话创建失败');
        try { localStorage.setItem(PP_SESSION_LS_KEY, sid); } catch (e) {}
      }
      _pp.appSessionId = sid;
      if (!_pp.viewport) _pp.viewport = { width: 1100, height: 700 };
      connectPpStream(root);
      return sid;
    })().finally(() => { _pp.ensurePromise = null; });
    return _pp.ensurePromise;
  }
  function connectPpStream(root) {
    if (!_pp.appSessionId) return;
    try { if (_pp.ws) { _pp.ws.onclose = null; _pp.ws.close(); } } catch (e) {}
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(proto + '//' + location.host + '/ws/app-runtime/' + _pp.appSessionId);
    _pp.ws = ws;
    ws.onopen = () => {
      _pp.ready = true;
      setStatus(root, '🖥 远程预览已连接（实时同屏）—— 底部输入目标即可开始');
      healthCheck(root);
    };
    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.type === 'frame' && msg.data && _ppMode) {
        showPpFrame(root, msg.data, msg.metadata);
      } else if (msg.type === 'navigated' && msg.url) {
        _pp.lastUrl = msg.url;
        if (_ppMode) setStatus(root, '🌐 ' + String(msg.url).slice(0, 90));
      } else if (msg.type === 'error') {
        if (_ppMode) setStatus(root, '远程预览错误: ' + (msg.message || ''));
      } else if (msg.type === 'closed' || msg.type === 'idle-closed') {
        _pp.ready = false;
        if (_ppMode) setStatus(root, '⚠️ 远程预览会话已关闭' + (msg.reason === 'idle-timeout' ? '（闲置超时）—— 重新发消息会自动重建' : ''));
        healthCheck(root);
      }
    };
    ws.onclose = () => {
      _pp.ready = false;
      if (_pp.ws === ws) _pp.ws = null;
      if (_ppMode) healthCheck(root);
    };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }
  function showPpFrame(root, b64, metadata) {
    const img = el('wb-last-shot', root);
    const ph = el('wb-preview-ph', root);
    if (!img) return;
    if (metadata && metadata.deviceWidth) _pp.viewport = { width: metadata.deviceWidth, height: metadata.deviceHeight };
    img.src = 'data:image/jpeg;base64,' + b64;
    img.style.display = 'block';
    if (ph) ph.style.display = 'none';
  }
  // 人工直接操控（远程预览模式）：与 agent 同一 Puppeteer 会话
  function ppSendInput(ev) {
    if (!_pp.appSessionId) return Promise.reject(new Error('无远程预览会话'));
    return ppApi('POST', '/input', Object.assign({ sessionId: _pp.appSessionId }, ev))
      .then(r => { if (r && r.error) throw new Error(r.error); return r; });
  }
  function setModeUi(root) {
    const btn = el('wb-mode', root);
    if (!btn) return;
    btn.textContent = _ppMode ? '🖥 远程预览 ●' : '🖥 远程预览';
    btn.classList.toggle('on', _ppMode);
    btn.title = _ppMode
      ? '当前：远程预览（稳定 Puppeteer，画面实时同屏，人可接管/停止/给指示）。点击切回内置引擎'
      : '当前：内置引擎（agent-browser daemon）。点击切换「远程预览」—— 稳定 Puppeteer 会话，画面同屏实时';
    // v1.6.4: 导航键（后退/前进/刷新）仅远程预览可用（CLI 引擎无历史 API）
    const nav = ['wb-back', 'wb-forward', 'wb-reload'];
    nav.forEach((id) => { const b = el(id, root); if (b) b.disabled = !_ppMode; });
  }
  async function togglePpMode(root) {
    if (_es) {
      setStatus(root, '任务执行中：先 ⏹ 停止（或等它完成）再切换引擎');
      return;
    }
    _ppMode = !_ppMode;
    try { localStorage.setItem(PP_LS_KEY, _ppMode ? 'pp' : 'cli'); } catch (e) {}
    setModeUi(root);
    if (_ppMode) {
      // 进入远程预览：断开 CLI CDP 链（避免两套浏览器状态混淆）
      try { if (_cdp.ws) _cdp.ws.close(); } catch (e) {}
      _cdp.ws = null; _cdp.sessionId = null;
      _pp.appSessionId = null; _pp.ready = false;
      setStatus(root, '🖥 正在启动远程预览（Puppeteer 同屏）…');
      ensureAppSession(root).then(() => {
        if (_pp.ws && _pp.ws.readyState === 1) setStatus(root, '🖥 远程预览已连接 —— 可以给目标了');
      }).catch(err => setStatus(root, '远程预览启动失败: ' + err.message));
    } else {
      // 退出远程预览：断开帧流；服务端会话保留（闲置 30min 自动回收），下次开启可复用登录态
      try { if (_pp.ws) _pp.ws.close(); } catch (e) {}
      _pp.ws = null; _pp.ready = false;
      try { if (_imeTa) _imeTa.blur(); } catch (e) {} // v1.6.3: 让出页面输入焦点
      connectCDP(root);
      refreshViewport(root);
      setStatus(root, '⚙️ 已切回内置引擎（agent-browser）');
    }
    healthCheck(root);
  }
  // 统一确认弹层（P50b：禁用 window.confirm —— ACMS 风格遮罩）
  function askConfirm(title, desc, okLabel) {
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;';
      ov.innerHTML = '<div style="background:var(--bg2,#23262e);color:var(--text,#e8e8e8);border:1px solid var(--border,#4a4e58);border-radius:10px;padding:18px 22px;min-width:300px;max-width:440px;box-shadow:0 12px 40px rgba(0,0,0,.6);font-size:13px;">' +
        '<div style="font-weight:600;font-size:14px;margin-bottom:8px;">' + esc(title) + '</div>' +
        '<div style="color:var(--text2,#9aa0a6);margin-bottom:16px;line-height:1.5;">' + esc(desc) + '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:10px;">' +
        '<button data-v="0" style="padding:6px 14px;border-radius:6px;border:1px solid var(--border,#4a4e58);background:transparent;color:var(--text,#e8e8e8);cursor:pointer;">取消</button>' +
        '<button data-v="1" style="padding:6px 14px;border-radius:6px;border:none;background:#e74c3c;color:#fff;cursor:pointer;">' + esc(okLabel || '确认') + '</button>' +
        '</div></div>';
      const done = (v) => { try { ov.remove(); } catch (e) {} resolve(v); };
      ov.addEventListener('click', (e) => { if (e.target === ov) done(false); });
      ov.querySelectorAll('button[data-v]').forEach(b => b.addEventListener('click', () => done(b.dataset.v === '1')));
      document.body.appendChild(ov);
    });
  }

  // ── Render 入口 ──
  function render(w) {
    const root = w.$c || document;
    root.innerHTML = CSS + `
    <div class="wb-shell">
      <header class="wb-topbar">
        <span class="wb-title">🦾 Web机器人</span>
        <span class="wb-health gray" id="wb-health" title="点击查看详细检测"><span class="wb-health-dot" id="wb-health-dot"></span><span class="wb-health-text" id="wb-health-text">检测中</span></span>
        <span class="wb-status" id="wb-status">就绪</span>
        <button class="wb-btn" id="wb-new" title="新建会话">+ 新会话</button>
        <button class="wb-btn" id="wb-mode" title="切换引擎：内置(agent-browser) ⇄ 远程预览(稳定 Puppeteer 同屏)">🖥 远程预览</button>
        <button class="wb-btn" id="wb-settings" title="设置">⚙️</button>
      </header>
      <div class="wb-body">
        <aside class="wb-sidebar">
          <div class="wb-sidebar-header">会话</div>
          <div class="wb-session-list" id="wb-session-list"></div>
          <div class="wb-sidebar-footer">
            <button class="wb-btn-mini" id="wb-clear-all" title="清空所有会话">🗑 清空全部</button>
          </div>
        </aside>
        <div class="wb-content">
        <main class="wb-main">
          <div class="wb-preview" id="wb-preview">
            <img id="wb-last-shot" src="" alt="最后截图" draggable="false"
              style="display:none;user-select:none;-webkit-user-drag:none;cursor:crosshair;touch-action:none">
            <div class="wb-preview-ph" id="wb-preview-ph">🖥️ Web 机器人<br>执行中自动更新步骤截图<br><span style="font-size:11px;opacity:.7">画面可点击 / 按住拖动（滑块验证）/ 滚轮操控 · 打字请点 ⌨️</span></div>
          </div>
          <!-- v1.5: 右侧固定面板 —— 对话流 + 执行步骤（替代抽屉浮窗） -->
          <div class="wb-steps" id="wb-steps">
            <div class="wb-steps-header"><span class="wb-steps-title">📋 执行步骤 &amp; 对话</span><span class="wb-steps-progress" id="wb-steps-progress" style="font-size:10px;color:#4f8cff;">等待开始</span><button class="wb-btn-mini" id="wb-steps-toggle" title="折叠/展开右侧面板（折叠后画面最大化，像浏览器应用）" style="font-size:11px;padding:2px 6px;">◀</button></div>
            <div class="wb-steps-body" id="wb-steps-list"><div class="wb-steps-empty">等待智能体开始执行…<br>对话与每轮操作（工具调用、截图、描述）会在此显示</div></div>
          </div>
        </main>
          <div class="wb-bottombar">
            <button class="wb-btn-mini" id="wb-back" title="◀ 后退（远程预览模式可用）">◀</button>
            <button class="wb-btn-mini" id="wb-forward" title="▶ 前进（远程预览模式可用）">▶</button>
            <button class="wb-btn-mini" id="wb-reload" title="⟳ 刷新（远程预览模式可用）">⟳</button>
            <button class="wb-btn-mini" id="wb-screenshot" title="截图">📷</button>
            <button class="wb-btn-mini" id="wb-stop" title="停止">⏹</button>
            <button class="wb-btn-mini" id="wb-clear-conv" title="清空当前对话">🗑</button>
            <button class="wb-btn-mini" id="wb-keys" title="键盘输入 —— 先点画面里的输入框让光标落位，再打字上屏">⌨️</button>
            <textarea class="wb-input" id="wb-input" placeholder="输入目标或继续问（Enter 发送 / Shift+Enter 换行）…" rows="1"></textarea>
            <button class="wb-btn-primary" id="wb-send">发送</button>
          </div>
        </div>
      </div>
    </div>`;

    bindEvents(root);
    setModeUi(root);
    if (_ppMode) {
      // v1.6: 远程预览引擎 —— 建/复用 app-runtime Puppeteer 会话（主画面 = 实时帧流）
      ensureAppSession(root).catch(e => setStatus(root, '远程预览浏览器启动失败: ' + e.message));
    } else {
      connectCDP(root);
      refreshViewport(root);
    }
    bindPreviewControls(root);
    initSessionStore(root);
    applyStepsCollapsed(root); // v1.6.6
    startHealthCheck(root); // v1.1 健康检查：启动状态灯定时检测
    setStatus(root, _ppMode
      ? '🖥 远程预览模式 —— 给目标它自动做；画面实时同屏，可随时 ⏹停止 / 上手操作 / 给新指示'
      : '就绪 —— 🦾 给目标它自动做；多轮对话有上下文；顶栏可切换「远程预览」引擎');
  }

  function setStatus(root, msg) {
    const s = el('wb-status', root);
    if (s) s.textContent = msg;
  }

  // v1.6.6: 右侧面板折叠状态（localStorage 记忆；收起后画面最大化）
  function applyStepsCollapsed(root) {
    const steps = el('wb-steps', root);
    const btn = el('wb-steps-toggle', root);
    let collapsed = false;
    try { collapsed = localStorage.getItem('wb-steps-collapsed') === '1'; } catch (e) {}
    if (steps) steps.classList.toggle('collapsed', collapsed);
    if (btn) btn.textContent = collapsed ? '▶' : '◀';
  }

  // ── 会话管理 ──
  function loadSessions() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveSessions() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(_sessions)); } catch (e) {}
  }
  function createSession(title) {
    const id = shortId();
    const now = Date.now();
    const sess = { id, title: title || '新会话', createdAt: now, updatedAt: now, messageCount: 0 };
    _sessions.unshift(sess);
    saveSessions();
    return id;
  }
  function initSessionStore(root) {
    _sessions = loadSessions();
    if (_sessions.length === 0) {
      _currentSessionId = createSession('新会话');
    } else {
      _currentSessionId = _sessions[0].id;
    }
    _currentMessages = []; // 阶段 4 从后端拉
    renderSessionList(root);
    renderPanel(root);
  }
  function switchSession(root, sessionId) {
    if (_currentSessionId === sessionId) return;
    if (_es) { _es.close(); _es = null; _currentTaskId = null; }
    _currentSessionId = sessionId;
    renderSessionList(root);
    setStatus(root, '已切换会话，加载历史对话…');
    el('wb-send', root).disabled = false;
    // 异步拉历史 messages（前端 localStorage 有但后端可能已丢；404 走空对话兜底）
    loadSessionMessages(root, sessionId);
  }
  async function deleteSession(root, sessionId) {
    const ok = await askConfirm('删除会话', '删除这个会话？对话历史将从列表中移除（服务端记录同步删除）。', '删除');
    if (!ok) return;
    _sessions = _sessions.filter(s => s.id !== sessionId);
    saveSessions();
    if (_currentSessionId === sessionId) {
      if (_es) { _es.close(); _es = null; _currentTaskId = null; }
      if (_sessions.length > 0) {
        _currentSessionId = _sessions[0].id;
      } else {
        _currentSessionId = createSession('新会话');
      }
      _currentMessages = [];
    }
    renderSessionList(root);
    renderPanel(root);
    setStatus(root, '已删除会话');
  }
  function renderSessionList(root) {
    const box = el('wb-session-list', root);
    if (!box) return;
    if (_sessions.length === 0) {
      box.innerHTML = '<div class="wb-session-empty">还没有会话<br><br>点击右上"+ 新会话"</div>';
      return;
    }
    box.innerHTML = _sessions.map(s => {
      const active = s.id === _currentSessionId ? ' active' : '';
      const dt = new Date(s.updatedAt);
      return `<div class="wb-session-item${active}" data-sid="${s.id}">
        <button class="wb-session-item-del" data-del="${s.id}" title="删除">×</button>
        <div class="wb-session-item-title">${esc(s.title)}</div>
        <div class="wb-session-item-meta">${agoText(dt)} · ${s.messageCount} 条</div>
      </div>`;
    }).join('');
    box.querySelectorAll('.wb-session-item').forEach(item => {
      const sid = item.dataset.sid;
      item.addEventListener('click', (e) => {
        if (e.target.dataset.del) return;
        switchSession(root, sid);
      });
    });
    box.querySelectorAll('.wb-session-item-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSession(root, btn.dataset.del);
      });
    });
  }

  // ── 对话流 ──
  function appendMessage(root, msg) {
    _currentMessages.push(msg);
    renderPanel(root);
    const sess = _sessions.find(s => s.id === _currentSessionId);
    if (sess) {
      sess.messageCount = _currentMessages.length;
      sess.updatedAt = Date.now();
      saveSessions();
    }
  }
  function renderMessageHtml(m) {
    const ts = m.ts ? new Date(m.ts).toLocaleTimeString('zh-CN', { hour12: false }) : '';
    if (m.role === 'user') {
      return `<div class="wb-msg user"><div class="wb-msg-avatar">我</div><div class="wb-msg-inner"><div class="wb-msg-bubble-name">我 · ${ts}</div><div style="color:inherit;">${esc(m.content || '')}</div></div></div>`;
    } else if (m.role === 'assistant') {
      const meta = m.tools ? `<div class="wb-msg-meta">🔧 ${m.tools.length} 个工具调用 · ${m.rounds || ''} 步</div>` : '';
      return `<div class="wb-msg assistant"><div class="wb-msg-avatar">🦾</div><div class="wb-msg-inner"><div class="wb-msg-bubble-name">Web机器人 · ${ts}</div><div>${esc(m.content || '')}</div>${meta}</div></div>`;
    } else if (m.role === 'tool') {
      const desc = esc((m.content || '').slice(0, 200)) + ((m.content || '').length > 200 ? '…' : '');
      const shotHtml = m.screenshot ? `<img src="${shotUrl(m.screenshot)}" onclick="openImagePreview('${shotUrl(m.screenshot)}');event.stopPropagation();" style="max-width:120px;max-height:70px;border-radius:4px;margin-top:4px;border:1px solid var(--border,#ccc);object-fit:contain;display:block;cursor:zoom-in;" alt="步骤截图 - 点击放大" onerror="this.style.display='none'">` : '';
      const metaLine = m.round ? `<span style="font-size:9px;background:#4f8cff;color:#fff;padding:1px 4px;border-radius:4px;margin-left:4px;">R${m.round}</span>` : '';
      return `<div class="wb-msg tool"><div class="wb-msg-avatar">🔧</div><div class="wb-msg-inner"><div class="wb-msg-bubble-name">🔧 ${esc(m.tool || 'step')} · ${ts} ${metaLine}</div><div>${desc}</div>${shotHtml}</div></div>`;
    } else if (m.role === 'waiting') {
      return `<div class="wb-msg waiting"><div style="font-weight:600;margin-bottom:4px;">⏸ 需要你的帮助 · ${ts}</div>${esc(m.content || '')}<div class="wb-help"><input id="wb-help-input" placeholder="回复 A/B/C 或自定义指令…" /><button class="wb-btn-primary" id="wb-help-send">回复并继续</button></div></div>`;
    }
    return '';
  }

  // v1.5: 右侧固定面板渲染 —— 对话消息(user/assistant/waiting 气泡) + 执行步骤(tool 卡片) 混排
  function renderPanel(root, sessionId) {
    const list = el('wb-steps-list', root);
    const progress = el('wb-steps-progress', root);
    if (!list) return;
    if (_currentMessages.length === 0) {
      list.innerHTML = '<div class="wb-steps-empty">还没有对话<br><br>底部输入框发个目标试试：<br>"去 DeepSeek 查深圳95油价"</div>';
      if (progress) progress.textContent = '等待开始';
      return;
    }
    const steps = _currentMessages.filter(m => m.role === 'tool');
    const lastStep = steps[steps.length - 1];
    if (steps.length === 0) {
      // 只有对话、还没有步骤 → 直接渲染消息气泡
      list.innerHTML = _currentMessages.map(renderMessageHtml).join('');
      if (progress) progress.textContent = '等待开始';
      list.scrollTop = list.scrollHeight;
      return;
    }
    // 有执行步骤 → 更新进度条
    const roundInfo = lastStep.round ? `第 ${lastStep.round} 轮` : '';
    const maxInfo = lastStep.maxRounds ? ` / 最多 ${lastStep.maxRounds}` : '';
    if (progress) progress.textContent = roundInfo + maxInfo || `已执行 ${steps.length} 步`;

    // 混排：按 _currentMessages 顺序输出（user/assistant/waiting → 气泡；tool → 步骤卡）
    let html = '';
    for (const m of _currentMessages) {
      if (m.role === 'tool') {
        const toolText = esc(m.tool || 'step');
        const desc = esc((m.fullMessage || m.content || '').slice(0, 300)) + ((m.fullMessage || m.content || '').length > 300 ? '…' : '');
        const roundTag = m.round ? `<span style="font-size:9px;background:#4f8cff;color:#fff;padding:1px 5px;border-radius:4px;margin-left:4px;">R${m.round}</span>` : '';
        const shotHtml = m.screenshot ? `<img src="${shotUrl(m.screenshot)}" onclick="openImagePreview('${shotUrl(m.screenshot)}');event.stopPropagation();" style="max-width:130px;max-height:80px;border-radius:4px;margin-top:4px;border:1px solid var(--border,#ccc);object-fit:contain;cursor:zoom-in;display:block;" alt="步骤截图 - 点击放大" onerror="this.style.display='none'">` : '';
        html += `<div class="wb-msg tool"><div class="wb-msg-avatar">🔧</div><div class="wb-msg-inner">` +
          `<div class="wb-msg-bubble-name">🔧 ${toolText}${roundTag}<span style="margin-left:auto;opacity:.6">${m.ts ? new Date(m.ts).toLocaleTimeString('zh-CN', { hour12: false }) : ''}</span></div>` +
          `<div style="font-size:12px;line-height:1.45;color:var(--text);">${desc}</div>${shotHtml}</div></div>`;
      } else {
        html += renderMessageHtml(m);
      }
    }
    list.innerHTML = html;
    list.scrollTop = list.scrollHeight;

    // v1.5: 最新带截图的步骤 → 更新主画面静态截图（v1.6: 远程预览模式主画面是实时帧流，不被覆盖）
    const lastWithShot = steps.slice().reverse().find(s => s.screenshot || s.screenshotPath);
    const shot = lastWithShot && (lastWithShot.screenshot || lastWithShot.screenshotPath);
    if (shot && !ppActive()) showLastScreenshot(root, shotUrl(shot));
  }

  // ── 发送消息（阶段4 接 task-runner session/*） ──
  async function sendMessage(root) {
    const input = el('wb-input', root);
    const text = (input.value || '').trim();
    if (!text) return;
    if (_es) { _es.close(); _es = null; _currentTaskId = null; }

    if (_ppMode) {
      // v1.6 远程预览：先确保 Puppeteer 会话活着（ACMS 重启后自动重建），再发目标
      setStatus(root, '🔌 检查远程预览会话…');
      el('wb-send', root).disabled = true;
      try { await ensureAppSession(root); }
      catch (e) {
        el('wb-send', root).disabled = false;
        setStatus(root, '远程预览浏览器启动失败：' + e.message);
        appendMessage(root, { role: 'assistant', content: '⚠️ 远程预览启动失败：' + e.message, ts: Date.now() });
        return;
      }
    }

    appendMessage(root, { role: 'user', content: text, ts: Date.now() });
    input.value = '';
    input.style.height = '38px';

    // 首条消息 → 自动取标题（前30字）
    const sess = _sessions.find(s => s.id === _currentSessionId);
    if (sess && sess.messageCount === 1) {
      sess.title = text.slice(0, 30) + (text.length > 30 ? '…' : '');
      renderSessionList(root);
    }

    setStatus(root, _ppMode ? '🤖 启动智能体（远程预览引擎）…' : '🤖 启动智能体…');
    el('wb-send', root).disabled = true;

    // 决定调用哪个端点：首个 turn 用 /session/start，后续用 /session/:id/turn
    const isFirstTurn = _currentMessages.length === 1; // appendMessage 后 count = 1 表示这是首条
    const url = isFirstTurn
      ? '/session/start'
      : '/session/' + encodeURIComponent(_currentSessionId) + '/turn';

    api('POST', url, {
      sessionId: _currentSessionId, message: text, title: sess ? sess.title : undefined,
      appSessionId: _ppMode ? _pp.appSessionId : undefined,
    })
      .then((r) => {
        if (!r || !r.ok) throw new Error(r && r.error || '启动失败');
        _currentTaskId = r.taskId || ('ws-' + Date.now().toString(36));
        setStatus(root, `会话 ${_currentSessionId} 启动，订阅进度…`);
        subscribeSessionSSE(root, _currentSessionId);
      })
      .catch((err) => {
        el('wb-send', root).disabled = false;
        setStatus(root, '启动失败: ' + err.message);
        appendMessage(root, { role: 'assistant', content: '⚠️ 启动失败：' + err.message, ts: Date.now() });
      });
  }

  // ── SSE 订阅会话进度 ──
  function subscribeSessionSSE(root, sessionId) {
    if (_es) { _es.close(); _es = null; }
    _es = new EventSource('/api/browser-agent/session/' + encodeURIComponent(sessionId) + '/stream?api_key=' + AK_VALUE);

    _es.addEventListener('step', (e) => {
      try {
        const step = JSON.parse(e.data);
        const toolNames = step.toolNames || [];
        // 完整保存步骤信息（含截图、轮次、工具名、完整内容），用于步骤时间线渲染
        appendMessage(root, {
          role: 'tool',
          tool: (toolNames.join(', ') || 'step') + (step.round ? ' · 第' + step.round + '轮' : ''),
          content: (step.message || '').slice(0, 300) + (step.message && step.message.length > 300 ? '…' : ''),
          ts: step.ts || Date.now(),
          // 扩展字段：完整执行链路可视化
          round: step.round || null,
          maxRounds: step.maxRounds || null,
          screenshot: step.screenshot || step.screenshotPath || null,
          fullMessage: step.message || '',
        });
        // 更新步骤时间线面板（实时渲染每轮操作）
        renderPanel(root, sessionId);
      } catch (err) { /* ignore */ }
    });

    _es.addEventListener('waiting_user', (e) => {
      try {
        const info = JSON.parse(e.data);
        appendMessage(root, {
          role: 'waiting',
          content: info.question || '需要你的帮助',
          ts: Date.now(),
        });
        setStatus(root, '⏸ 智能体需要你的帮助，请在右侧面板回复');
      } catch (err) {}
    });

    _es.addEventListener('done', (e) => {
      try {
        const result = JSON.parse(e.data);
        const finalStatus = result.status || 'done';
        const statusText = finalStatus === 'error' ? '❌ 执行失败' : '✅ 目标已达成';
        setStatus(root, `${statusText}，会话可继续提问`);
        // 完整执行链路可视化：在 assistant 消息中附加执行总结（轮次、工具、截图证据）
        const toolSteps = _currentMessages.filter(m => m.role === 'tool');
        const summaryParts = [];
        if (toolSteps.length > 0) summaryParts.push(`🔧 执行了 ${toolSteps.length} 步工具操作`);
        const lastTool = toolSteps[toolSteps.length - 1];
        if (lastTool && lastTool.round) summaryParts.push(`第 ${lastTool.round} 轮完成`);
        const shots = toolSteps.filter(s => s.screenshot || s.screenshotPath).length;
        if (shots > 0) summaryParts.push(`📷 生成 ${shots} 张步骤截图`);
        const fullContent = (result.content || (finalStatus === 'error' ? (result.error || '执行出错') : '（无内容）')) + (summaryParts.length > 0 ? '\n\n【执行总结】' + summaryParts.join(' · ') : '');
        appendMessage(root, {
          role: 'assistant',
          content: fullContent,
          ts: Date.now(),
          rounds: lastTool ? lastTool.round : null,
          maxRounds: lastTool ? lastTool.maxRounds : null,
          toolCount: toolSteps.length,
          screenshotCount: shots,
        });
        const progressEl = el('wb-steps-progress', root);
        if (progressEl) progressEl.textContent = finalStatus === 'error' ? '❌ 执行中止' : `✅ 完成 · 共 ${toolSteps.length} 步`;
        renderPanel(root, _currentSessionId);
      } catch (err) {}
      el('wb-send', root).disabled = false;
      if (_es) { _es.close(); _es = null; }
      _currentTaskId = null;
    });

    _es.addEventListener('error', (e) => {
      // EventSource 自动重连，但 done 后会推 closed。这里兜底：若不是 waiting_user 状态，提示用户
      // 不直接 close，因为浏览器会自动重连
      if (_es && _es.readyState === EventSource.CLOSED) {
        el('wb-send', root).disabled = false;
        setStatus(root, '进度流断开 —— 可刷新页面或继续发新消息');
      }
    });
  }

  // ── 求助回复（waiting_user） ──
  function sendHelpReply(root, reply) {
    if (!_currentSessionId || !reply) return;
    // 移除当前 waiting 气泡（隐藏 help）
    for (let i = _currentMessages.length - 1; i >= 0; i--) {
      if (_currentMessages[i].role === 'waiting') {
        _currentMessages[i].resolved = true;
        break;
      }
    }
    appendMessage(root, { role: 'user', content: '[回复] ' + reply, ts: Date.now() });
    setStatus(root, '🤖 已收到你的回复，智能体继续…');
    api('POST', '/session/' + encodeURIComponent(_currentSessionId) + '/reply', {
      message: reply,
      appSessionId: _ppMode ? _pp.appSessionId : undefined,
    })
      .then((r) => {
        if (r && r.ok) {
          // resume 后 SSE 复用同一 stream（taskId 没变），新的 step/done 会继续推
        } else {
          setStatus(root, '回复失败: ' + (r && r.error || 'unknown'));
          el('wb-send', root).disabled = false;
        }
      })
      .catch((err) => {
        setStatus(root, '回复失败: ' + err.message);
        el('wb-send', root).disabled = false;
      });
  }

  // ── 拉会话历史 messages（切会话时） ──
  async function loadSessionMessages(root, sessionId) {
    try {
      const r = await api('GET', '/session/' + encodeURIComponent(sessionId) + '/messages');
      _currentMessages = r.messages || [];
      // 标记 active session（给 ACMS 跨视图联动用）
      try { localStorage.setItem('web-robot-active-session', sessionId); } catch (e) {}
    } catch (e) {
      // 会话不存在（前端 localStorage 有，后端重启丢）— v1.1 修复：明确提示 + 清理脏数据
      _currentMessages = [];
      // 🆕 区分 404（服务端丢失）vs 其他错误（网络/CDP 等）
      const is404 = e && (e.status === 404 || (e.message || '').includes('会话不存在'));
      if (is404) {
        setStatus(root, '⚠️ 此会话内容已被服务端丢弃（重启内存清空或从未成功通信）—— 已从历史列表移除');
        // 自动从 localStorage 删掉这个脏会话（避免下次再 404）
        _sessions = _sessions.filter(s => s.id !== sessionId);
        saveSessions();
        renderSessionList(root);
        // 切到第一个剩下的会话（如果有）
        if (_sessions.length > 0 && _currentSessionId === sessionId) {
          _currentSessionId = _sessions[0].id;
          renderSessionList(root);
          renderPanel(root);
          // 递归加载第一个会话的消息
          return loadSessionMessages(root, _currentSessionId);
        } else if (_sessions.length === 0) {
          // 一个会话都不剩了 → 新建一个
          _currentSessionId = createSession('新会话');
          _currentMessages = [];
          renderSessionList(root);
          renderPanel(root);
        }
      } else {
        setStatus(root, '❌ 加载历史失败：' + (e.message || '网络错误'));
      }
    }
    renderPanel(root);
  }

  // ── 事件绑定 ──
  function bindEvents(root) {
    el('wb-health', root).addEventListener('click', async () => {
      // v1.1 点击状态灯：立即跑一次完整检测 + 显示 4 维度详情到状态条
      const r = await healthCheck(root);
      if (r) {
        const lines = [
          `ws=${r.wsOpen ? '✅' : '❌'} session=${r.hasSession ? '✅' : '❌'} ping=${r.pingOk ? '✅' : '❌'}`,
          r.title,
        ];
        setStatus(root, '🩺 ' + lines.join(' | '));
        // 10s 后回到正常轮询状态
        setTimeout(() => healthCheck(root), 10000);
      }
    });
    el('wb-new', root).addEventListener('click', () => {
      const sid = createSession('新会话');
      _currentSessionId = sid;
      _currentMessages = [];
      renderSessionList(root);
      renderPanel(root);
      setStatus(root, '已创建新会话');
      el('wb-input', root).focus();
    });
    // v1.6: 引擎切换 —— 内置(agent-browser) ⇄ 远程预览(稳定 Puppeteer 同屏)
    el('wb-mode', root).addEventListener('click', () => togglePpMode(root));

    const doSend = () => sendMessage(root);
    el('wb-send', root).addEventListener('click', doSend);
    const input = el('wb-input', root);
    input.addEventListener('focus', () => {
      // v1.6.3: 用户要点底部框给智能体发消息 → 让出页面输入焦点（隐藏 IME 框 blur）
      try { if (_imeTa) _imeTa.blur(); } catch (e) { /* ignore */ }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    });
    // textarea 自动撑高
    input.addEventListener('input', () => {
      input.style.height = '38px';
      input.style.height = Math.min(80, input.scrollHeight) + 'px';
    });

    el('wb-clear-all', root).addEventListener('click', async () => {
      const ok = await askConfirm('清空所有会话', '清空所有会话？此操作不可恢复。', '清空');
      if (!ok) return;
      _sessions = [];
      saveSessions();
      _currentSessionId = createSession('新会话');
      _currentMessages = [];
      renderSessionList(root);
      renderPanel(root);
      setStatus(root, '已清空所有会话');
    });
    el('wb-clear-conv', root).addEventListener('click', async () => {
      const ok = await askConfirm('清空当前对话', '清空当前会话的对话？右侧面板将重置。', '清空');
      if (!ok) return;
      _currentMessages = [];
      renderPanel(root);
      const sess = _sessions.find(s => s.id === _currentSessionId);
      if (sess) { sess.messageCount = 0; saveSessions(); renderSessionList(root); }
      setStatus(root, '已清空当前对话');
    });
    // v1.6.6: 折叠/展开右侧步骤面板
    el('wb-steps-toggle', root).addEventListener('click', () => {
      const steps = el('wb-steps', root);
      const btn = el('wb-steps-toggle', root);
      if (!steps) return;
      const nowCollapsed = !steps.classList.contains('collapsed');
      steps.classList.toggle('collapsed', nowCollapsed);
      if (btn) btn.textContent = nowCollapsed ? '▶' : '◀';
      try { localStorage.setItem('wb-steps-collapsed', nowCollapsed ? '1' : '0'); } catch (e) {}
      setStatus(root, nowCollapsed ? '右侧面板已收起 —— 画面最大化（再点 ▶ 展开）' : '右侧面板已展开');
    });
    // v1.6.1: ⌨️ 键盘浮层 —— 直接给同屏浏览器输入文字/按键
    el('wb-keys', root).addEventListener('click', () => openKeysModal(root));
    // v1.6.4: 导航键（仅远程预览模式；setModeUi 控制 disabled）
    const navDo = (type, doneMsg) => {
      if (!ppActive()) { setStatus(root, '导航键仅远程预览模式可用'); return; }
      ppSendInput({ type }).then(() => setStatus(root, doneMsg)).catch(err => setStatus(root, String(doneMsg || type) + ' 失败: ' + err.message));
    };
    el('wb-back', root).addEventListener('click', () => navDo('back', '◀ 后退'));
    el('wb-forward', root).addEventListener('click', () => navDo('forward', '▶ 前进'));
    el('wb-reload', root).addEventListener('click', () => navDo('reload', '⟳ 已刷新页面'));
    el('wb-screenshot', root).addEventListener('click', async () => {
      if (_ppMode) {
        setStatus(root, '🖥 远程预览为实时同屏画面 —— 每步执行会自动在右侧留截图证据');
        return;
      }
      try {
        const r = await api('POST', '/screenshot', {});
        setStatus(root, '📷 截图已存：' + (r.path || ''));
      } catch (e) { setStatus(root, '截图失败：' + e.message); }
    });
    el('wb-stop', root).addEventListener('click', () => {
      // v1.6: 真正请求停止 —— interrupt（Agent 当前动作结束后暂停进 waiting_user，
      // 人在右侧面板回复新指示后继续；不再假装停止只关 SSE）
      if (_es && _currentSessionId) {
        setStatus(root, '⏹ 已请求停止，Agent 将在当前动作结束后暂停…可在右侧面板回复新指示');
        api('POST', '/session/' + encodeURIComponent(_currentSessionId) + '/interrupt', {}).catch(() => {});
      } else {
        setStatus(root, '当前没有正在执行的任务');
      }
    });
    el('wb-settings', root).addEventListener('click', () => {
      // v1.1 设置面板：模型 / CDP / 浮窗显式颜色（替代暂未实现的 alert）
      const currentModel = (window.ACMSConfig && window.ACMSConfig.defaultModel) || '系统默认';
      const cdpRetry = (window._cdp && window._cdp.maxRetry) ? window._cdp.maxRetry : 3;
      const panelHtml = `<div style="position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()"><div style="background:#23262e;color:#e8e8e8;border:1px solid #4a4e58;border-radius:10px;padding:20px;width:420px;max-width:90vw;box-shadow:0 12px 40px rgba(0,0,0,.6);font-size:13px;" onclick="event.stopPropagation()"><h3 style="margin:0 0 14px;font-size:15px;font-weight:600;color:#fff;">⚙️ Web机器人 设置</h3><div style="margin-bottom:12px;"><label style="display:block;font-weight:600;color:#c8ccd4;margin-bottom:4px;font-size:12px;">模型策略</label><select id="wb-set-model" style="width:100%;padding:6px 10px;background:#1a1d24;color:#e8e8e8;border:1px solid #4a4e58;border-radius:6px;font-size:12px;outline:none;"><option value="default" ${(currentModel==='系统默认')?'selected':''}>系统默认（跟随 ACMS 设置）</option><option value="deepseek" ${(currentModel==='deepseek')?'selected':''}>DeepSeek</option><option value="minimax" ${(currentModel==='minimax')?'selected':''}>MiniMax</option></select><div style="font-size:10px;color:#9aa0a6;margin-top:4px;">多多拍板：任务型 agent 优先跟随系统默认生成模型（v0.2）</div></div><div style="margin-bottom:12px;"><label style="display:block;font-weight:600;color:#c8ccd4;margin-bottom:4px;font-size:12px;">CDP 双向控制</label><div style="display:flex;gap:10px;align-items:center;font-size:12px;color:#c8ccd4;"><label><input type="checkbox" id="wb-set-cdp" checked> 启用精准控制</label><span>重试 <span id="wb-set-cdp-retry">${cdpRetry}</span> 次</span></div><div style="font-size:10px;color:#9aa0a6;margin-top:4px;">CDP 失败后仅展示步骤截图，无法直接操控</div></div><div style="margin-bottom:16px;"><label style="display:block;font-weight:600;color:#c8ccd4;margin-bottom:6px;font-size:12px;">浮窗预览与颜色</label><div style="display:flex;gap:8px;flex-wrap:wrap;"><label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;"><input type="checkbox" id="wb-set-explicit-color" checked> 浮窗显式颜色（不依赖 var()）</label></div><div style="font-size:10px;color:#9aa0a6;margin-top:4px;">P118 教训：浮窗根不继承 data-theme，必须显式写颜色值</div></div><div style="display:flex;gap:8px;justify-content:flex-end;border-top:1px solid #333;padding-top:12px;margin-top:4px;"><button onclick="this.closest('[style*=&quot;position:fixed&quot;]').remove()" style="padding:5px 14px;background:#333;border:1px solid #555;border-radius:6px;color:#e8e8e8;font-size:12px;cursor:pointer;">取消</button><button onclick="const m=document.getElementById('wb-set-model').value;const c=document.getElementById('wb-set-cdp').checked;const r=document.getElementById('wb-set-cdp-retry').textContent;const p=document.getElementById('wb-set-pulse').checked;const ec=document.getElementById('wb-set-explicit-color').checked;window._wbSettings={model:m,cdpEnabled:c,cdpRetry:parseInt(r)||3,pulse:p,explicitColor:ec};if(window.ACMSConfig)window.ACMSConfig.defaultModel=(m==='default')?'系统默认':m;(window.ACMSModal&&window.ACMSModal.show?window.ACMSModal.show({title:'设置已保存',message:'已保存：模型='+m+', CDP='+c+', 重试='+r+', pulse='+p+', 显式色='+ec,actions:[{label:'确定',value:'OK',className:'acms-modal-btn-primary'}]}).catch(function(){}):0);this.closest('[style*=&quot;position:fixed&quot;]').remove();" style="padding:5px 14px;background:#4f8cff;border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:500;cursor:pointer;">保存</button></div></div></div>`;
      const overlay = document.createElement('div');
      overlay.innerHTML = panelHtml;
      document.body.appendChild(overlay);
    });

    // ── 事件委托：waiting_user 气泡的 help 回复按钮 + 输入框 ──
    const panelEl = el('wb-steps-list', root);
    if (panelEl) {
      panelEl.addEventListener('click', (e) => {
        const btn = e.target.closest('#wb-help-send');
        if (!btn) return;
        const input = btn.parentElement && btn.parentElement.querySelector('#wb-help-input');
        if (!input) return;
        const reply = (input.value || '').trim();
        if (!reply) return;
        input.value = '';
        sendHelpReply(root, reply);
      });
      panelEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const input = e.target.closest('#wb-help-input');
        if (!input) return;
        e.preventDefault();
        const btn = input.parentElement && input.parentElement.querySelector('#wb-help-send');
        if (btn) btn.click();
      });
    }
  }

  // ===========================================================
  // CDP 双向控制（v1.5：删帧流，仅保留 ws+session 控制链）
  // ===========================================================
  let _viewport = null;
  let _cdp = { ws: null, sessionId: null, viewport: null, reqId: 0, pending: new Map(), attempting: false };
  let _cdpRetry = 0;
  const CDP_MAX_RETRY = 3;
  // v1.1 健康检查：v1.5 起检测 ws+session+Chrome ping
  let _lastPingOk = 0;
  let _lastPingSent = 0;
  let _lastPingLatency = 0;
  let _healthTimer = null;
  const HEALTH_INTERVAL_MS = 5000;   // 状态灯每 5s 轮询
  const PING_OK_VALID_MS = 10000;    // 最近 10s ping 成功算「Chrome 响应」

  // v1.5: 显示最近一步静态截图（替代 v1.0 实时帧流）
  function showLastScreenshot(root, urlOrDataUrl) {
    const img = el('wb-last-shot', root);
    const ph = el('wb-preview-ph', root);
    if (!img || !urlOrDataUrl) return;
    if (img.src === urlOrDataUrl) return;
    img.src = urlOrDataUrl;
    img.style.display = 'block';
    if (ph) ph.style.display = 'none';
  }

  async function refreshViewport(root) {
    try {
      const s = await api('GET', '/status');
      if (s.viewport) _viewport = s.viewport;
    } catch (e) { /* 非关键 */ }
  }

  function mapImgCoord(e) {
    const live = el('wb-last-shot');
    if (!live) return null;
    // v1.6: 远程预览模式用 app-runtime 会话 viewport；内置引擎用 CDP/status viewport
    const vp = ppActive() ? _pp.viewport : (_cdp.viewport || _viewport);
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

  function clickAt(x, y) {
    if (_cdp.sessionId) {
      // v1.0 修复：React/SPA 需要 mouseMoved 预热 + 串行链（学 ACMS 浏览器 page.mouse.move+down+up）
      cdpSendSerial('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      cdpSendSerial('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      cdpSendSerial('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      return true;
    }
    return false;
  }
  function moveTo(x, y) {
    if (_cdp.sessionId) { cdpSendSerial('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); return true; }
    return false;
  }
  function wheelAt(dy) {
    if (_cdp.sessionId) { cdpSendSerial('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 0, y: 0, deltaX: 0, deltaY: dy }); return true; }
    return false;
  }

  // ── 键盘输入：CDP 精准（Input.insertText / dispatchKeyEvent） / 降级（后端 keyboard type）──
  // v1.0 修复：v0.5 删了 v1.0 补回 + 走串行链
  async function keyboardTypeText(text, opts = {}) {
    const t = String(text || '');
    if (!t && !opts.key) return;
    if (_cdp.sessionId) {
      if (t) await cdpSendSerial('Input.insertText', { text: t });
      if (opts.key) {
        const k = KEY_MAP[opts.key] || KEY_MAP[opts.key.toLowerCase()];
        if (k) {
          await cdpSendSerial('Input.dispatchKeyEvent', { type: 'keyDown', ...k });
          await cdpSendSerial('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
        }
      }
      return { ok: true, mode: 'cdp' };
    }
    // 降级模式：调后端 keyboard type（agent-browser keyboard type "text"）
    if (t) {
      const r = await api('POST', '/keyboard', { text: t });
      return { ok: !!(r && r.ok !== false), mode: 'fallback' };
    }
    return { ok: false, mode: 'fallback', error: '降级模式不支持单独按键（无 CDP）' };
  }
  const KEY_MAP = {
    enter:    { windowsVirtualKeyCode: 13, key: 'Enter',    code: 'Enter' },
    backspace:{ windowsVirtualKeyCode:  8, key: 'Backspace', code: 'Backspace' },
    tab:      { windowsVirtualKeyCode:  9, key: 'Tab',      code: 'Tab' },
    escape:   { windowsVirtualKeyCode: 27, key: 'Escape',   code: 'Escape' },
    esc:      { windowsVirtualKeyCode: 27, key: 'Escape',   code: 'Escape' },
  };

  // v1.5: 静态截图上的操控（点击/滚轮/悬停 —— 坐标按 viewport 等比映射）
  // v1.6: 远程预览模式下同一画面转发到 app-runtime（与 agent 同一 Puppeteer 会话）
  // v1.6.1: 按住-拖动-松开 全链路转发（百度滑块验证等），禁 ACMS 侧 img 原生拖拽；
  //         document 级 move/up（拖出画面不丢事件）；CLI 无 CDP 时退化为点按补发 click
  let _ctrl = null;          // 当前活跃操控面 { img, root }
  let _docCtrlBound = false; // document 级监听只绑一次（多窗口/重渲染不重复）
  let _imeTa = null;         // v1.6.3 隐藏 IME textarea（浏览器应用同款「直接输入」桥）
  function _toVp(e) {
    if (!_ctrl || !_ctrl.img) return null;
    const vp = ppActive() ? _pp.viewport : (_cdp.viewport || _viewport);
    if (!vp) return null;
    const img = _ctrl.img;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const scale = Math.min(rect.width / vp.width, rect.height / vp.height);
    const dispW = vp.width * scale, dispH = vp.height * scale;
    const offX = (rect.width - dispW) / 2, offY = (rect.height - dispH) / 2;
    const x = Math.max(0, Math.min(vp.width - 1, Math.round((e.clientX - rect.left - offX) / scale)));
    const y = Math.max(0, Math.min(vp.height - 1, Math.round((e.clientY - rect.top - offY) / scale)));
    return { x, y };
  }
  function bindPreviewControls(root) {
    const img = el('wb-last-shot', root);
    if (!img) return;
    _ctrl = { img, root, dragging: false, moved: false, sx: 0, sy: 0 };
    img.addEventListener('dragstart', (e) => e.preventDefault()); // 双保险：禁拖走主图

    // v1.6.3: 「浏览器应用」同款直接输入 —— 隐藏 IME textarea 桥：
    //   点画面 → 焦点进隐藏框 → 直接打字：中文 IME 合成 end 后整段上屏、英文 input 即发；
    //   控制键（Enter/Backspace/Tab/Esc…）keydown/keyup 转发。参考 web-browser.js 远程预览。
    let $ime = null;
    let imeComposing = false, imeIgnoreNext = false;
    _imeTa = null;
    function focusIme() {
      try { if ($ime && $ime.focus) $ime.focus({ preventScroll: true }); }
      catch (e) { try { if ($ime) $ime.focus(); } catch (e2) { /* ignore */ } }
    }
    (function initImeBridge() {
      $ime = document.createElement('textarea');
      $ime.setAttribute('aria-label', 'Web机器人页面输入');
      $ime.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;opacity:0;border:none;outline:none;background:transparent';
      const parent = img.parentNode || document.body;
      parent.appendChild($ime);
      _imeTa = $ime;
      const send = (ev) => { if (ppActive() && _pp.appSessionId) ppSendInput(ev).catch(() => {}); };
      function kb(e, type) {
        if (e.isComposing || imeComposing || e.key === 'Process' || e.keyCode === 229) return;
        const printable = e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
        if (printable) return; // 单字符交给 input / compositionend
        e.preventDefault();
        send({ type: type, key: e.key, code: e.code });
      }
      $ime.addEventListener('compositionstart', () => { imeComposing = true; });
      $ime.addEventListener('compositionend', (e) => {
        imeComposing = false;
        const text = e.data || $ime.value;
        if (text) send({ type: 'type', text });
        $ime.value = '';
        imeIgnoreNext = true;
        setTimeout(() => { imeIgnoreNext = false; }, 0);
      });
      $ime.addEventListener('input', () => {
        if (imeComposing || imeIgnoreNext) return;
        const text = $ime.value;
        if (text) send({ type: 'type', text });
        $ime.value = '';
      });
      $ime.addEventListener('keydown', (e) => kb(e, 'keydown'));
      $ime.addEventListener('keyup', (e) => kb(e, 'keyup'));
    })();

    img.addEventListener('mousedown', (e) => {
      e.preventDefault(); // 关键：阻止浏览器把「按住拖动」当图片拖拽
      // v1.6.2: 把本地焦点从底部「目标/继续问」输入框挪走 —— 否则用户点完画面直接打字，
      //         按键会被底部框吃掉（页面输入框的光标在远程 Puppeteer 侧，本地焦点必须清空）
      try {
        const ae = document.activeElement;
        if (ae && (ae.id === 'wb-input' || ae.id === 'wb-keys-text')) { ae.blur(); }
      } catch (_e) { /* ignore */ }
      if (ppActive()) focusIme(); // v1.6.3: 点画面 → 「直接打字」模式（焦点进隐藏 IME 框，中文合成即上屏）
      if (e.button !== 0 && e.button !== 2 && e.button !== 1) return;
      const c = _toVp(e); if (!c) return;
      _ctrl.dragging = true; _ctrl.moved = false; _ctrl.sx = c.x; _ctrl.sy = c.y;
      const btnName = e.button === 2 ? 'right' : (e.button === 1 ? 'middle' : 'left');
      if (ppActive()) {
        ppSendInput({ type: 'mousedown', x: c.x, y: c.y, button: btnName }).catch(() => {});
      } else if (_cdp.sessionId) {
        cdpSendSerial('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
        cdpSendSerial('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: btnName, clickCount: 1 });
      }
      setStatus(root, `👇 按住 (${c.x}, ${c.y})${e.button !== 0 ? '（' + (e.button === 2 ? '右键' : '中键') + '）' : ''} —— 可拖动（滑块/选区），松开释放`);
    });

    let _dT = 0;
    const onMove = (e) => { // 拖动中：document 级转发（拖出画面不丢）
      if (!_ctrl || !_ctrl.dragging) return;
      const now0 = Date.now(); if (now0 - _dT < 24) return; _dT = now0; // 拖动节流 ~40Hz（滑块足够）
      const c = _toVp(e); if (!c) return;
      if (Math.abs(c.x - _ctrl.sx) + Math.abs(c.y - _ctrl.sy) > 3) _ctrl.moved = true;
      if (ppActive()) ppSendInput({ type: 'mousemove', x: c.x, y: c.y }).catch(() => {});
      else if (_cdp.sessionId) cdpSendSerial('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
    };
    let _hvT = 0;
    const onImgMove = (e) => { // 非拖动：hover 悬停转发（100ms 节流，页面 hover 菜单可用）
      if (_ctrl && _ctrl.dragging) return;
      const now = Date.now(); if (now - _hvT < 100) return; _hvT = now;
      const c = _toVp(e); if (!c) return;
      if (ppActive()) ppSendInput({ type: 'mousemove', x: c.x, y: c.y }).catch(() => {});
      else if (_cdp.sessionId) cdpMoveThrottled(c.x, c.y);
    };
    const onUp = (e) => {
      if (!_ctrl || !_ctrl.dragging) return;
      _ctrl.dragging = false;
      const c = _toVp(e) || { x: _ctrl.sx, y: _ctrl.sy };
      const btnName = e.button === 2 ? 'right' : (e.button === 1 ? 'middle' : 'left');
      if (ppActive()) {
        ppSendInput({ type: 'mouseup', x: c.x, y: c.y, button: btnName }).catch(() => {});
        setStatus((_ctrl && _ctrl.root) || root, _ctrl.moved ? `🖐 拖动完成 (${_ctrl.sx},${_ctrl.sy}) → (${c.x},${c.y})` : `👆 已点击 (${c.x}, ${c.y}) —— 直接打字即输入页面（中文 OK）；发消息给智能体请点底部输入框`);
      } else if (_cdp.sessionId) {
        cdpSendSerial('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: btnName, clickCount: 1 });
        setStatus((_ctrl && _ctrl.root) || root, _ctrl.moved ? `🖐 拖动完成 (${_ctrl.sx},${_ctrl.sy}) → (${c.x},${c.y})` : `👆 已点击 (${c.x}, ${c.y})`);
      } else if (!_ctrl.moved) {
        // 内置引擎降级（无 CDP）：down 无法模拟，mouseup 时补发一次 click
        api('POST', '/mouse', { x: c.x, y: c.y, action: 'click' }).then((r) => {
          if (r.ok) setStatus((_ctrl && _ctrl.root) || root, `👆 已点击 (${c.x}, ${c.y})`);
        }).catch(() => {});
      }
    };
    const onBlur = () => { if (_ctrl) { _ctrl.dragging = false; _ctrl.moved = false; } };

    img.addEventListener('mousemove', onImgMove);
    img.addEventListener('mouseleave', () => { /* 拖出画面由 document 级 onMove 接管 */ });
    if (!_docCtrlBound) {
      _docCtrlBound = true;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      window.addEventListener('blur', onBlur);
    }

    img.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dx = Math.round(e.deltaX), dy = Math.round(e.deltaY);
      if (ppActive()) ppSendInput({ type: 'wheel', dx, dy }).catch(() => {});
      else if (_cdp.sessionId) cdpSendSerial('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 0, y: 0, deltaX: dx, deltaY: dy });
      else api('POST', '/mouse', { action: 'wheel', dy: e.deltaY > 0 ? 300 : -300 }).catch(() => {});
    }, { passive: false });
  }

  // ── ⌨️ 键盘浮层（v1.6.1 恢复）：先点画面里的输入框 → 打字 → 上屏/回车/退格
  function openKeysModal(root) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;';
    ov.innerHTML = '<div style="background:var(--bg2,#23262e);color:var(--text,#e8e8e8);border:1px solid var(--border,#4a4e58);border-radius:10px;padding:18px 20px;width:480px;max-width:92vw;box-shadow:0 12px 40px rgba(0,0,0,.6);font-size:13px;">' +
      '<div style="font-weight:600;font-size:14px;margin-bottom:6px;">⌨️ 键盘输入（' + (_ppMode ? '🖥 远程预览同屏浏览器' : '内置浏览器') + '）</div>' +
      '<div style="font-size:11px;color:var(--text2,#9aa0a6);margin-bottom:10px;line-height:1.6;">' +
      '· 底部那条输入框是给 <b>智能体</b> 的「目标/继续问」，不会进页面。<br>' +
      '· 给<b>页面</b>打字：先在画面里点一下目标输入框（光标落位）→ 在本窗打字 → 按 <b>Enter 直接上屏</b>（或点「输入文字」）。<br>' +
      '· 支持中文/emoji；Shift+Enter 换行。' + (_ppMode ? '也可以直接发目标给智能体，让它帮你填。' : '') + '</div>' +
      '<textarea id="wb-keys-text" rows="2" placeholder="在这里打字，Enter 上屏…" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border,#4a4e58);border-radius:6px;background:#1a1d24;color:#e8e8e8;font-size:13px;outline:none;resize:none;margin-bottom:10px;"></textarea>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
      '<button data-k="type" style="padding:6px 14px;border:none;border-radius:6px;background:var(--accent,#4f8cff);color:#fff;font-size:12px;cursor:pointer;font-weight:500;">输入文字 ↵</button>' +
      '<button data-k="enter" style="padding:6px 12px;border:1px solid var(--border,#4a4e58);border-radius:6px;background:transparent;color:var(--text,#e8e8e8);font-size:12px;cursor:pointer;">↵ 仅回车</button>' +
      '<button data-k="backspace" style="padding:6px 12px;border:1px solid var(--border,#4a4e58);border-radius:6px;background:transparent;color:var(--text,#e8e8e8);font-size:12px;cursor:pointer;">⌫ 退格</button>' +
      '<button data-k="tab" style="padding:6px 12px;border:1px solid var(--border,#4a4e58);border-radius:6px;background:transparent;color:var(--text,#e8e8e8);font-size:12px;cursor:pointer;">⇥ Tab</button>' +
      '<span style="flex:1"></span>' +
      '<button data-k="close" style="padding:6px 14px;border:none;border-radius:6px;background:#333;color:#e8e8e8;font-size:12px;cursor:pointer;">关闭 Esc</button>' +
      '</div></div>';
    const done = () => { try { ov.remove(); } catch (e) {} };
    ov.addEventListener('click', (e) => { if (e.target === ov) done(); });
    ov.querySelectorAll('button[data-k]').forEach((b) => {
      b.addEventListener('click', () => {
        const k = b.dataset.k;
        if (k === 'close') { done(); return; }
        const ta = ov.querySelector('#wb-keys-text');
        const text = ta ? (ta.value || '') : '';
        if (k === 'type') {
          if (!text.trim()) { if (ta) ta.focus(); return; }
          keysSendText(root, text);
          if (ta) ta.value = '';
          if (ta) ta.focus();
        } else {
          keysSendKey(root, k);
          if (ta) ta.focus();
        }
      });
    });
    // v1.6.2: Enter=上屏（不清空光标），Shift+Enter=换行；Esc=关闭
    const ta0 = ov.querySelector('#wb-keys-text');
    if (ta0) {
      ta0.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); done(); return; }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const typeBtn = ov.querySelector('button[data-k="type"]');
          if (typeBtn) typeBtn.click();
        }
      });
    }
    document.body.appendChild(ov);
    // 抢占本地焦点：底部「目标」框 / 页面隐藏 IME 框 blur → 本窗 textarea focus
    try {
      const ae = document.activeElement;
      if (ae && (ae.id === 'wb-input' || ae === _imeTa)) ae.blur();
      if (_imeTa) _imeTa.blur();
    } catch (_e) { /* ignore */ }
    if (ta0) setTimeout(() => ta0.focus(), 50);
  }
  function keysSendText(root, text) {
    const t = String(text || '');
    if (!t) return;
    if (ppActive()) {
      ppSendInput({ type: 'type', text: t })
        .then(() => setStatus(root, '⌨️ 已输入：' + t.slice(0, 20) + (t.length > 20 ? '…' : '')))
        .catch(err => setStatus(root, '输入失败: ' + err.message));
      return;
    }
    if (_cdp.sessionId) {
      cdpSendSerial('Input.insertText', { text: t })
        .then(() => setStatus(root, '⌨️ 已输入：' + t.slice(0, 20)));
      return;
    }
    api('POST', '/keyboard', { text: t }).then(() => setStatus(root, '⌨️ 已输入')).catch(err => setStatus(root, '输入失败: ' + err.message));
  }
  function keysSendKey(root, key) {
    if (ppActive()) {
      // app-runtime 键盘通道用 CDP code 名（Enter/Backspace/Tab/Escape…）
      const KEY_CODE = { enter: 'Enter', backspace: 'Backspace', tab: 'Tab', esc: 'Escape', escape: 'Escape',
        arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown' };
      const code = KEY_CODE[String(key).toLowerCase()] || key;
      ppSendInput({ type: 'keydown', code }).then(() => ppSendInput({ type: 'keyup', code })).catch(() => {});
      setStatus(root, `⌨️ 已按键：${key}`);
      return;
    }
    if (_cdp.sessionId) {
      const k = KEY_MAP[key] || KEY_MAP[key.toLowerCase()];
      if (k) {
        cdpSendSerial('Input.dispatchKeyEvent', { type: 'keyDown', ...k });
        cdpSendSerial('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
      }
      return;
    }
    api('POST', '/press', { key }).catch(() => {});
  }

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

  // v1.0 修复：输入事件串行链 + mousemove 32ms 节流（学 ACMS 浏览器 app-runtime._inputQueue 模式）
  //  根因：agent-browser CLI daemon 每次 spawn 进程，并发 Input.dispatchMouseEvent 互相阻塞
  //  修法：所有鼠标/键盘事件走串行 Promise 链 + mousemove 高频节流只保留最新坐标
  let _inputChain = Promise.resolve();
  let _lastMoveTs = 0;
  let _pendingMove = null;
  let _moveScheduled = false;
  function cdpSendSerial(method, params) {
    if (!_cdp.ws || _cdp.ws.readyState !== 1) return Promise.resolve(null);
    const p = _inputChain.then(() => cdpSend(method, params));
    _inputChain = p.catch(() => {}); // 错误不打断链
    return p;
  }
  function cdpMoveThrottled(x, y) {
    const now = Date.now();
    if (now - _lastMoveTs < 32) {
      _pendingMove = { x, y };
      if (_moveScheduled) return;
      _moveScheduled = true;
      setTimeout(() => {
        _moveScheduled = false;
        const m = _pendingMove; _pendingMove = null;
        if (m && _cdp.sessionId) cdpSendSerial('Input.dispatchMouseEvent', { type: 'mouseMoved', x: m.x, y: m.y });
      }, 32);
      return;
    }
    _lastMoveTs = now;
    if (_cdp.sessionId) cdpSendSerial('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  }
  // 重置串行链（CDP 断线时调用，防止 pending 任务堆积）
  function resetInputChain() { _inputChain = Promise.resolve(); _lastMoveTs = 0; _pendingMove = null; }

  async function connectCDP(root) {
    if (_cdp.attempting) return;
    _cdp.attempting = true;
    let ws = null;
    let initialized = false;

    try {
      if (_cdpRetry === 0) setStatus(root, '🔗 正在建立 CDP 精准控制…');
      else setStatus(root, `⚠️ CDP 重试中（${_cdpRetry}/${CDP_MAX_RETRY}）…`);
      const r = await api('GET', '/cdp-info');
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
      };

      ws.onopen = async () => {
        try {
          const targets = await cdpSend('Target.getTargets');
          const list = (targets && targets.targetInfos) || [];
          let page = list.find((t) => t.type === 'page' && !t.url.startsWith('chrome://')) || list.find((t) => t.type === 'page');
          if (!page) {
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
          initialized = true;
          _cdpRetry = 0;
          setStatus(root, '🟢 CDP 双向控制已连接 —— 静态截图可直接点击/悬停/滚动/输入（与智能体同一浏览器）');
          healthCheck(root); // v1.1 立即更新状态灯
        } catch (err) {
          console.log('[browser-console] CDP init 失败:', err.message);
          try { ws.close(); } catch (e2) {}
        }
      };

      ws.onclose = () => {
        const wasInit = initialized;
        _cdp.ws = null; _cdp.sessionId = null; _cdp.viewport = null;
        _cdp.attempting = false;
        resetInputChain(); // v1.0 修复：CDP 断时清空 pending 串行任务
        healthCheck(root); // v1.1 立即更新状态灯
        scheduleCdpRetry(root, wasInit ? 'CDP 已连后断开' : 'CDP 初始化失败或连接被拒');
      };

      ws.onerror = () => { try { ws.close(); } catch (e) {} };
    } catch (e) {
      if (ws) { try { ws.close(); } catch (e2) {} }
      _cdp.ws = null; _cdp.sessionId = null; _cdp.viewport = null;
      _cdp.attempting = false;
      resetInputChain(); // v1.0 修复：异常路径也清空 pending
      scheduleCdpRetry(root, e.message);
    }
  }

  function scheduleCdpRetry(root, reason) {
    if (_cdpRetry >= CDP_MAX_RETRY) {
      setStatus(root, `🟡 CDP 精准控制失败（${reason}，已重试 ${CDP_MAX_RETRY} 次）—— 仅展示智能体步骤截图，无法直接操控浏览器`);
      return;
    }
    _cdpRetry++;
    const delay = 800 * _cdpRetry;
    setTimeout(() => {
      if (_cdp.ws || _cdp.attempting) return;
      connectCDP(root);
    }, delay);
  }

  // ===========================================================
  // v1.1 健康检查状态灯（v1.5：ws+session+Chrome ping）
  // ===========================================================

  async function healthCheck(root) {
    const box = el('wb-health', root);
    const txt = el('wb-health-text', root);
    if (!box) return;
    const now = Date.now();
    // v1.6: 远程预览模式 —— 健康 = app-runtime Puppeteer 会话 WS 活着（不检测 CLI daemon）
    if (_ppMode) {
      const wsOpen = !!(_pp.ws && _pp.ws.readyState === 1) && !!_pp.appSessionId;
      const level = wsOpen ? 'green' : 'red';
      const text = wsOpen ? '远程预览' : '预览断';
      box.className = 'wb-health ' + level;
      if (txt) txt.textContent = text;
      box.title = wsOpen
        ? '远程预览 Puppeteer 会话已连接（同屏实时；右上可点详情）'
        : '远程预览会话未连接 —— 重新发消息会自动重建；或切回内置引擎';
      return { level, text, title: box.title, wsOpen, hasSession: wsOpen, pingOk: wsOpen };
    }
    // 维度 1: ws 状态
    const wsOpen = !!(_cdp.ws && _cdp.ws.readyState === 1);
    // 维度 2: page session
    const hasSession = !!_cdp.sessionId;
    // 维度 3: 主动 ping（Runtime.evaluate 1+1）—— 测 Chrome 真响应
    let pingOk = (_lastPingOk > 0 && (now - _lastPingOk) < PING_OK_VALID_MS);
    if (wsOpen && hasSession && (_lastPingSent === 0 || now - _lastPingSent > HEALTH_INTERVAL_MS)) {
      _lastPingSent = now;
      const t0 = Date.now();
      try {
        const pingPromise = cdpSend('Runtime.evaluate', { expression: '1+1', returnByValue: true });
        const pingTimeout = new Promise((r) => setTimeout(() => r({ result: { exceptionDetails: { text: 'timeout' } } }), 2000));
        const r = await Promise.race([pingPromise, pingTimeout]);
        pingOk = !!(r && r.result && r.result.result && r.result.result.value === 2);
        if (pingOk) { _lastPingOk = now; _lastPingLatency = Date.now() - t0; }
      } catch (e) { pingOk = false; }
    }
    // 综合判定（4 档，v1.5 无帧维度）
    let level = 'gray', text = '检测中', title = '';
    if (!wsOpen) {
      level = 'red'; text = 'CDP 断';
      title = 'WebSocket 未连接';
    } else if (!hasSession) {
      level = 'yellow'; text = '初始化';
      title = 'CDP 已连但 page session 还没建立';
    } else if (!pingOk) {
      level = 'red'; text = 'Chrome 无响应';
      title = 'Runtime.evaluate ping 失败 — daemon 可能卡死';
    } else {
      level = 'green'; text = '健康';
      title = `ws=open session=ok ping=${_lastPingLatency}ms`;
    }
    box.className = 'wb-health ' + level;
    if (txt) txt.textContent = text;
    box.title = title;
    return { level, text, title, wsOpen, hasSession, pingOk };
  }
  function startHealthCheck(root) {
    if (_healthTimer) clearInterval(_healthTimer);
    // 立即跑一次
    healthCheck(root);
    _healthTimer = setInterval(() => healthCheck(root), HEALTH_INTERVAL_MS);
  }
  function stopHealthCheck() {
    if (_healthTimer) { clearInterval(_healthTimer); _healthTimer = null; }
  }

  // ===========================================================
  // 注册
  // ===========================================================
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