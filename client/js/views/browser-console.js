// ACMS Web 机器人视图 v1.0 —— 多轮会话 + 最大化画面 + 抽屉对话流
// ============================================================
// v1.0 重构（多多要求）：
//   - 布局：左栏会话列表 + 主区最大化画面（92% 高）+ 抽屉式对话流 + 固定底部输入条（48px）
//   - 会话：localStorage 持久化会话索引（id/title/createdAt/updatedAt/messageCount），支持多轮对话
//   - mini 气泡：右下角浮窗，对话流收起时显示最新 1 条消息摘要，新消息 pulse 动画
//   - 保留 v0.7.1 的 CDP 精准控制 + 重试 3 次 + 降级 stream 逻辑（所有 connectCDP/CDP_Send/bindLivePreview）
//
// 后端：阶段 3 接 /api/browser-agent/session/*（task-runner 多轮 + session 持久化）
// 当前（阶段1+2）：前端 UI + localStorage 会话管理 + mock 消息流，CDP/stream 真实联通
// 主题：跟随 ACMS 三主题（var(--xxx)）

(function () {
  'use strict';

  const AK_VALUE = (typeof window !== 'undefined' && window.AK) || 'dev-key-001';
  let _es = null;
  let _currentTaskId = null;
  let _stepCount = 0;
  let _drawerOpen = false;

  // ── 会话存储（localStorage） ──
  const LS_KEY = 'web-robot-sessions-v1';
  let _sessions = []; // [{id, title, createdAt, updatedAt, messageCount}]
  let _currentSessionId = null;
  let _currentMessages = []; // 当前会话的消息（in-memory）

  const CSS = `
  <style>
    /* Web 机器人 v1.0 — 最大化画面 + 抽屉对话 + 固定输入条 */
    .wb-shell { display:flex; flex-direction:column; height:100%; box-sizing:border-box;
      background:var(--bg,#1a1d23); color:var(--text,#e8e8e8); font-size:13px; overflow:hidden; }
    .wb-topbar { display:flex; align-items:center; gap:8px; padding:8px 12px;
      border-bottom:1px solid var(--border,#333); flex-shrink:0; background:var(--bg2,#23262e); }
    .wb-title { font-weight:600; font-size:14px; }
    .wb-status { font-size:11px; color:var(--text2,#999); flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .wb-btn { background:var(--bg2,#23262e); color:var(--text,#e8e8e8); border:1px solid var(--border,#444);
      border-radius:6px; padding:4px 10px; font-size:12px; cursor:pointer; white-space:nowrap; }
    .wb-btn:hover { border-color:var(--accent,#4f8cff); }
    .wb-btn-mini { background:transparent; border:1px solid var(--border,#333); border-radius:6px;
      padding:4px 8px; font-size:14px; cursor:pointer; color:var(--text); line-height:1; }
    .wb-btn-mini:hover { border-color:var(--accent); }
    .wb-btn-primary { background:var(--accent,#4f8cff); color:#fff; border:none; border-radius:6px;
      padding:6px 16px; font-size:13px; cursor:pointer; font-weight:500; white-space:nowrap; }
    .wb-btn-primary:disabled { opacity:.45; cursor:not-allowed; }

    .wb-body { display:flex; flex:1; min-height:0; min-width:0; }

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

    /* 主区 */
    .wb-main { flex:1; display:flex; min-width:0; min-height:0; position:relative; }
    .wb-preview { flex:1; background:var(--bg2,#23262e); display:flex; align-items:center;
      justify-content:center; position:relative; overflow:hidden; }
    .wb-preview img { max-width:100%; max-height:100%; object-fit:contain; display:block; }
    .wb-preview-ph { color:var(--text2,#777); font-size:13px; padding:20px; text-align:center; line-height:1.6; }

    /* mini 气泡（右下浮窗） */
    .wb-mini-bubble { position:absolute; right:12px; bottom:12px; max-width:300px;
      background:rgba(20,20,20,.94); color:#fff; border-radius:10px; padding:10px 14px;
      font-size:12px; cursor:pointer; box-shadow:0 6px 18px rgba(0,0,0,.4);
      border:1px solid rgba(255,255,255,.12); z-index:4; transition:transform .2s; }
    .wb-mini-bubble:hover { transform:translateY(-2px); }
    .wb-mini-bubble.pulse { animation:wb-pulse 1.2s ease-in-out 2; }
    @keyframes wb-pulse { 0%,100% { box-shadow:0 6px 18px rgba(0,0,0,.4); }
      50% { box-shadow:0 6px 22px rgba(79,140,255,.9); } }
    .wb-mini-content { margin-bottom:6px; line-height:1.45; overflow:hidden;
      text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; }
    .wb-mini-toggle { background:transparent; border:1px solid rgba(255,255,255,.25);
      color:#fff; border-radius:4px; padding:3px 10px; font-size:11px; cursor:pointer; }

    /* 抽屉：对话流（默认收起，右侧滑入） */
    .wb-drawer { position:absolute; right:0; top:0; bottom:0; width:340px;
      background:var(--bg2,#23262e); border-left:1px solid var(--border,#333);
      transform:translateX(100%); transition:transform .25s cubic-bezier(.4,.2,.2,1);
      display:flex; flex-direction:column; z-index:5; box-shadow:-4px 0 12px rgba(0,0,0,.3); }
    .wb-drawer.open { transform:translateX(0); }
    .wb-drawer-header { padding:10px 14px; font-size:13px; font-weight:600;
      border-bottom:1px solid var(--border); display:flex; justify-content:space-between;
      align-items:center; flex-shrink:0; background:var(--bg2); }
    .wb-drawer-messages { flex:1; overflow-y:auto; padding:14px;
      display:flex; flex-direction:column; gap:10px; }
    .wb-drawer-empty { text-align:center; color:var(--text2,#777); padding:40px 12px;
      font-size:12px; line-height:1.7; }
    .wb-msg { padding:8px 12px; border-radius:10px; font-size:12px; line-height:1.55;
      max-width:88%; word-break:break-word; }
    .wb-msg.user { background:var(--accent,#4f8cff); color:#fff; align-self:flex-end; border-bottom-right-radius:2px; }
    .wb-msg.assistant { background:var(--bg3,#2a2e38); color:var(--text); align-self:flex-start;
      border:1px solid var(--border,#444); border-bottom-left-radius:2px; }
    .wb-msg.tool { background:rgba(255,255,255,.04); border:1px dashed var(--border);
      color:var(--text2); font-family:monospace; font-size:11px; max-width:95%; align-self:flex-start; }
    .wb-msg.waiting { background:#fff3cd; color:#856404; border:1px solid #ffc107;
      align-self:stretch; max-width:100%; }
    .wb-msg-bubble-name { font-size:10px; opacity:.7; margin-bottom:4px; font-weight:600; }
    .wb-msg-meta { font-size:10px; opacity:.6; margin-top:4px; }
    .wb-help { display:flex; gap:6px; margin-top:8px; }
    .wb-help input { flex:1; min-width:0; padding:6px 10px; border:1px solid #856404;
      border-radius:4px; background:#fff; color:#333; font-size:12px; outline:none; }

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
  function el(id, root) { return (root || document).querySelector('#' + id); }

  async function api(method, path, body) {
    const res = await fetch('/api/browser-agent' + path + '?api_key=' + AK_VALUE, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
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

  // ── Render 入口 ──
  function render(w) {
    const root = w.$c || document;
    root.innerHTML = CSS + `
    <div class="wb-shell">
      <header class="wb-topbar">
        <span class="wb-title">🦾 Web机器人</span>
        <span class="wb-status" id="wb-status">就绪</span>
        <button class="wb-btn" id="wb-new" title="新建会话">+ 新会话</button>
        <button class="wb-btn" id="wb-settings" title="设置">⚙️</button>
        <button class="wb-btn wb-chat-toggle" id="wb-chat-toggle" title="展开/收起对话流">
          💬 <span class="wb-badge" id="wb-msg-badge" style="display:none">0</span>
          <span id="wb-chat-arrow">▶</span>
        </button>
      </header>
      <div class="wb-body">
        <aside class="wb-sidebar">
          <div class="wb-sidebar-header">会话</div>
          <div class="wb-session-list" id="wb-session-list"></div>
          <div class="wb-sidebar-footer">
            <button class="wb-btn-mini" id="wb-clear-all" title="清空所有会话">🗑 清空全部</button>
          </div>
        </aside>
        <main class="wb-main">
          <div class="wb-preview" id="wb-preview">
            <img id="wb-live" src="" alt="" style="display:none">
            <div class="wb-preview-ph" id="wb-live-ph">🟢 实时画面（WebSocket 帧流）<br>连接中…</div>
          </div>
          <div class="wb-mini-bubble" id="wb-mini-bubble" style="display:none">
            <div class="wb-mini-content" id="wb-mini-content"></div>
            <button class="wb-btn-mini" id="wb-mini-toggle">展开对话 ▶</button>
          </div>
          <aside class="wb-drawer" id="wb-drawer">
            <div class="wb-drawer-header">
              💬 对话流
              <button class="wb-btn-mini" id="wb-drawer-close" title="收起">◀ 收起</button>
            </div>
            <div class="wb-drawer-messages" id="wb-drawer-messages"></div>
          </aside>
          <div class="wb-bottombar">
            <button class="wb-btn-mini" id="wb-screenshot" title="截图">📷</button>
            <button class="wb-btn-mini" id="wb-stop" title="停止">⏹</button>
            <button class="wb-btn-mini" id="wb-clear-conv" title="清空当前对话">🗑</button>
            <button class="wb-btn-mini" id="wb-open-url" title="手动打开 URL">🔗</button>
            <textarea class="wb-input" id="wb-input" placeholder="输入目标或继续问（Enter 发送 / Shift+Enter 换行）…" rows="1"></textarea>
            <button class="wb-btn-primary" id="wb-send">发送</button>
          </div>
        </main>
      </div>
    </div>`;

    bindEvents(root);
    connectCDP(root);
    refreshViewport(root);
    bindLivePreview(root);
    initSessionStore(root);
    setStatus(root, '就绪 —— 🦾 给目标它自动做；多轮对话有上下文（阶段1+2：前端布局+会话管理，后端联调待阶段4）');
  }

  function setStatus(root, msg) {
    const s = el('wb-status', root);
    if (s) s.textContent = msg;
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
    renderDrawerMessages(root);
    updateBadge(root);
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
  function deleteSession(root, sessionId) {
    if (!confirm('删除这个会话？')) return;
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
    renderDrawerMessages(root);
    updateBadge(root);
    updateMiniBubble(root);
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
    renderDrawerMessages(root);
    updateBadge(root);
    updateMiniBubble(root);
    const box = el('wb-drawer-messages', root);
    if (box) box.scrollTop = box.scrollHeight;
    const sess = _sessions.find(s => s.id === _currentSessionId);
    if (sess) {
      sess.messageCount = _currentMessages.length;
      sess.updatedAt = Date.now();
      saveSessions();
    }
  }
  function renderDrawerMessages(root) {
    const box = el('wb-drawer-messages', root);
    if (!box) return;
    if (_currentMessages.length === 0) {
      box.innerHTML = '<div class="wb-drawer-empty">还没有对话<br><br>底部输入框发个目标试试：<br>"去 DeepSeek 查深圳95油价"</div>';
      return;
    }
    box.innerHTML = _currentMessages.map(renderMessageHtml).join('');
  }
  function renderMessageHtml(m) {
    const ts = m.ts ? new Date(m.ts).toLocaleTimeString('zh-CN', { hour12: false }) : '';
    if (m.role === 'user') {
      return `<div class="wb-msg user"><div class="wb-msg-bubble-name">我 · ${ts}</div>${esc(m.content || '')}</div>`;
    } else if (m.role === 'assistant') {
      const meta = m.tools ? `<div class="wb-msg-meta">🔧 ${m.tools.length} 个工具调用 · ${m.rounds || ''} 步</div>` : '';
      return `<div class="wb-msg assistant"><div class="wb-msg-bubble-name">🦾 Web机器人 · ${ts}</div>${esc(m.content || '')}${meta}</div>`;
    } else if (m.role === 'tool') {
      return `<div class="wb-msg tool"><div class="wb-msg-bubble-name">🔧 ${esc(m.tool || '')} · ${ts}</div>${esc((m.content || '').slice(0, 200))}</div>`;
    } else if (m.role === 'waiting') {
      return `<div class="wb-msg waiting"><div class="wb-msg-bubble-name">⏸ 需要你的帮助 · ${ts}</div>${esc(m.content || '')}<div class="wb-help"><input id="wb-help-input" placeholder="回复 A/B/C 或自定义指令…" /><button class="wb-btn-primary" id="wb-help-send">回复并继续</button></div></div>`;
    }
    return '';
  }
  function updateBadge(root) {
    const badge = el('wb-msg-badge', root);
    if (!badge) return;
    const n = _currentMessages.length;
    if (n === 0) { badge.style.display = 'none'; return; }
    badge.style.display = 'inline-block';
    badge.textContent = n;
  }
  function updateMiniBubble(root) {
    const bubble = el('wb-mini-bubble', root);
    if (!bubble) return;
    if (_currentMessages.length === 0 || _drawerOpen) {
      bubble.style.display = 'none';
      return;
    }
    const last = _currentMessages[_currentMessages.length - 1];
    let preview = '';
    if (last.role === 'user') preview = '💬 我：' + (last.content || '').slice(0, 80);
    else if (last.role === 'assistant') preview = '🤖 ' + (last.content || '').slice(0, 80);
    else if (last.role === 'tool') preview = '🔧 ' + (last.tool || '');
    else if (last.role === 'waiting') preview = '⏸ 等待你的帮助';
    el('wb-mini-content', root).textContent = preview;
    bubble.style.display = 'block';
    bubble.classList.remove('pulse');
    setTimeout(() => bubble.classList.add('pulse'), 30);
  }
  function toggleDrawer(root, force) {
    const drawer = el('wb-drawer', root);
    if (!drawer) return;
    if (typeof force === 'boolean') _drawerOpen = force;
    else _drawerOpen = !_drawerOpen;
    if (_drawerOpen) drawer.classList.add('open');
    else drawer.classList.remove('open');
    const arrow = el('wb-chat-arrow', root);
    if (arrow) arrow.textContent = _drawerOpen ? '◀' : '▶';
    updateMiniBubble(root);
  }

  // ── 发送消息（阶段4 接 task-runner session/*） ──
  function sendMessage(root) {
    const input = el('wb-input', root);
    const text = (input.value || '').trim();
    if (!text) return;
    if (_es) { _es.close(); _es = null; _currentTaskId = null; }

    appendMessage(root, { role: 'user', content: text, ts: Date.now() });
    input.value = '';
    input.style.height = '38px';

    // 首条消息 → 自动取标题（前30字）
    const sess = _sessions.find(s => s.id === _currentSessionId);
    if (sess && sess.messageCount === 1) {
      sess.title = text.slice(0, 30) + (text.length > 30 ? '…' : '');
      renderSessionList(root);
    }

    setStatus(root, '🤖 启动智能体…');
    el('wb-send', root).disabled = true;

    // 决定调用哪个端点：首个 turn 用 /session/start，后续用 /session/:id/turn
    const isFirstTurn = _currentMessages.length === 1; // appendMessage 后 count = 1 表示这是首条
    const url = isFirstTurn
      ? '/session/start'
      : '/session/' + encodeURIComponent(_currentSessionId) + '/turn';

    api('POST', url, { sessionId: _currentSessionId, message: text, title: sess ? sess.title : undefined })
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
        // 工具调用摘要气泡
        const toolNames = step.toolNames || [];
        if (toolNames.length > 0 || (step.message && step.message.trim())) {
          appendMessage(root, {
            role: 'tool',
            tool: toolNames.join(', ') || 'step',
            content: (step.message || '').slice(0, 200) + (step.message && step.message.length > 200 ? '…' : ''),
            ts: step.ts || Date.now(),
          });
        }
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
        setStatus(root, '⏸ 智能体需要你的帮助，请在对话流面板回复');
      } catch (err) {}
    });

    _es.addEventListener('done', (e) => {
      try {
        const result = JSON.parse(e.data);
        // done 触发时 assistant 最终内容已通过 appendMessage(role=assistant) 记录（来自 sessionStore）
        // 这里只更新状态 + 关闭 SSE + 启用发送按钮
        const finalStatus = result.status || 'done';
        const statusText = finalStatus === 'error' ? '❌ 执行失败' : '✅ 目标已达成';
        setStatus(root, `${statusText}，会话可继续提问`);
        appendMessage(root, {
          role: 'assistant',
          content: result.content || (finalStatus === 'error' ? (result.error || '执行出错') : '（无内容）'),
          ts: Date.now(),
        });
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
    api('POST', '/session/' + encodeURIComponent(_currentSessionId) + '/reply', { message: reply })
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
    } catch (e) {
      // 会话不存在（前端 localStorage 有，后端重启丢）— 显示空对话
      _currentMessages = [];
    }
    renderDrawerMessages(root);
    updateBadge(root);
    updateMiniBubble(root);
  }

  // ── 事件绑定 ──
  function bindEvents(root) {
    el('wb-new', root).addEventListener('click', () => {
      const sid = createSession('新会话');
      _currentSessionId = sid;
      _currentMessages = [];
      renderSessionList(root);
      renderDrawerMessages(root);
      updateBadge(root);
      updateMiniBubble(root);
      setStatus(root, '已创建新会话');
      el('wb-input', root).focus();
    });

    el('wb-chat-toggle', root).addEventListener('click', () => toggleDrawer(root));
    el('wb-mini-toggle', root).addEventListener('click', (e) => { e.stopPropagation(); toggleDrawer(root, true); });
    el('wb-drawer-close', root).addEventListener('click', () => toggleDrawer(root, false));
    el('wb-mini-bubble', root).addEventListener('click', (e) => {
      if (e.target.id === 'wb-mini-toggle') return;
      toggleDrawer(root, true);
    });

    const doSend = () => sendMessage(root);
    el('wb-send', root).addEventListener('click', doSend);
    const input = el('wb-input', root);
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

    el('wb-clear-all', root).addEventListener('click', () => {
      if (!confirm('清空所有会话？此操作不可恢复。')) return;
      _sessions = [];
      saveSessions();
      _currentSessionId = createSession('新会话');
      _currentMessages = [];
      renderSessionList(root);
      renderDrawerMessages(root);
      updateBadge(root);
      updateMiniBubble(root);
      setStatus(root, '已清空所有会话');
    });
    el('wb-clear-conv', root).addEventListener('click', () => {
      if (!confirm('清空当前会话的对话？')) return;
      _currentMessages = [];
      renderDrawerMessages(root);
      updateBadge(root);
      updateMiniBubble(root);
      const sess = _sessions.find(s => s.id === _currentSessionId);
      if (sess) { sess.messageCount = 0; saveSessions(); renderSessionList(root); }
      setStatus(root, '已清空当前对话');
    });
    el('wb-screenshot', root).addEventListener('click', async () => {
      try {
        const r = await api('POST', '/screenshot', {});
        setStatus(root, '📷 截图已存：' + (r.path || ''));
      } catch (e) { setStatus(root, '截图失败：' + e.message); }
    });
    el('wb-stop', root).addEventListener('click', () => {
      if (_es) { _es.close(); _es = null; _currentTaskId = null; }
      setStatus(root, '⏹ 已停止当前任务');
    });
    el('wb-open-url', root).addEventListener('click', async () => {
      const url = prompt('输入要打开的 URL：');
      if (!url) return;
      try {
        await api('POST', '/open', { url });
        setStatus(root, '已打开：' + url);
        refreshViewport(root);
      } catch (e) { setStatus(root, '打开失败：' + e.message); }
    });
    el('wb-settings', root).addEventListener('click', () => {
      alert('设置（v1.0 暂未实现）\n后续：CDP 选项 / 模型选择 / 主题');
    });

    // ── 事件委托：waiting_user 气泡的 help 回复按钮 + 输入框 ──
    const drawer = el('wb-drawer-messages', root);
    if (drawer) {
      drawer.addEventListener('click', (e) => {
        const btn = e.target.closest('#wb-help-send');
        if (!btn) return;
        const input = btn.parentElement && btn.parentElement.querySelector('#wb-help-input');
        if (!input) return;
        const reply = (input.value || '').trim();
        if (!reply) return;
        input.value = '';
        sendHelpReply(root, reply);
      });
      drawer.addEventListener('keydown', (e) => {
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
  // CDP / Stream 双向控制（v0.7.1 完整保留）
  // ===========================================================
  let _ws = null;
  let _streamRetry = 0;
  let _noFrameT = 0;
  let _viewport = null;
  let _cdp = { ws: null, sessionId: null, viewport: null, reqId: 0, pending: new Map(), attempting: false };
  let _cdpRetry = 0;
  const CDP_MAX_RETRY = 3;
  let _streamFallbackActive = false;

  function showLiveFrame(root, b64) {
    const live = el('wb-live', root);
    const ph = el('wb-live-ph', root);
    if (!live) return;
    live.src = 'data:image/jpeg;base64,' + b64;
    live.style.display = 'block';
    if (ph) ph.style.display = 'none';
  }

  async function refreshViewport(root) {
    try {
      const s = await api('GET', '/status');
      if (s.viewport) _viewport = s.viewport;
    } catch (e) { /* 非关键 */ }
  }

  function mapImgCoord(e) {
    const live = el('wb-live');
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

  function clickAt(x, y) {
    if (_cdp.sessionId) {
      cdpSend('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      cdpSend('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      return true;
    }
    return false;
  }
  function moveTo(x, y) {
    if (_cdp.sessionId) { cdpSend('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); return true; }
    return false;
  }
  function wheelAt(dy) {
    if (_cdp.sessionId) { cdpSend('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 0, y: 0, deltaX: 0, deltaY: dy }); return true; }
    return false;
  }

  function bindLivePreview(root) {
    const live = el('wb-live', root);
    if (!live) return;
    live.addEventListener('click', (e) => {
      const c = mapImgCoord(e);
      if (!c) return;
      if (clickAt(c.x, c.y)) setStatus(root, `👆 已点击 (${c.x}, ${c.y})`);
      else api('POST', '/mouse', { x: c.x, y: c.y, action: 'click' }).then((r) => {
        if (r.ok) setStatus(root, `👆 已点击 (${c.x}, ${c.y})`);
      }).catch(() => {});
    });
    live.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dy = e.deltaY > 0 ? 300 : -300;
      if (!wheelAt(dy)) api('POST', '/mouse', { action: 'wheel', dy }).catch(() => {});
    }, { passive: false });
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
    if (_cdp.attempting) return;
    if (_streamFallbackActive) { fallbackStream(root); return; }
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
          _cdpRetry = 0;
          setStatus(root, '🟢 CDP 双向控制已连接 —— 画面可直接点击/悬停/滚动/输入（与智能体同一浏览器）');
        } catch (err) {
          console.log('[browser-console] CDP init 失败:', err.message);
          try { ws.close(); } catch (e2) {}
        }
      };

      ws.onclose = () => {
        const wasInit = initialized;
        _cdp.ws = null; _cdp.sessionId = null; _cdp.viewport = null;
        _cdp.attempting = false;
        if (_streamFallbackActive) return;
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
      if (_cdp.ws || _cdp.attempting || _streamFallbackActive) return;
      connectCDP(root);
    }, delay);
  }

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

  function scheduleReconnect(root) {
    if (_streamFallbackActive && _streamRetry >= 6) {
      setStatus(root, '🟡 实时画面（stream）连接失败（已重试 6 次）—— 可刷新页面或重新打开 Web 机器人');
      return;
    }
    const delay = Math.min(8000, 1000 * Math.pow(2, _streamRetry));
    _streamRetry++;
    setTimeout(() => { if (_ws && _ws.readyState === 1) return; fallbackStream(root); }, delay);
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