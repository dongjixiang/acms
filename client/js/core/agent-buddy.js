// ACMS Agent Buddy (v0.59)
// 系统人格化 Agent — 计分驱动临场感，引导用户交互
//
// 设计:
//   L1 身份：UserContext 汇聚（偏好/习惯/认知）
//   L2 上下文：当前视图追踪 + 最近操作缓存
//   L3 临场感：登录问候 + 状态灯 + 计数表情
//   L4 时机：计分引擎（事件→积分→行为）
//
// API:
//   ACMS.Buddy.score        → 当前分数
//   ACMS.Buddy.state        → 当前状态 ('idle'|'curious'|'urgent'|'critical')
//   ACMS.Buddy.addScore(e)  → 按事件类型加分
//   ACMS.Buddy.resetScore() → 用户交互后归零
//   ACMS.Buddy.togglePanel()-> 切换消息面板
//   ACMS.Buddy.setView(n)   → 通知她当前视图
//   ACMS.Buddy.recordAction(a) → 记录最近操作

(function() {
  'use strict';

  // ── 配置 ──

  var STATES = [
    { name: 'idle',     maxScore: 15, face: '◕‿◕',   css: 'ab-idle',     dot: 'green', greeting: '我在呢～' },
    { name: 'curious',  maxScore: 45, face: '◕‿◕✧',  css: 'ab-curious',  dot: 'yellow',  greeting: '诶… 我有话说' },
    { name: 'urgent',   maxScore: 75, face: '◕‿◕⚡',  css: 'ab-urgent',   dot: 'orange', greeting: '你看看这个？' },
    { name: 'critical', maxScore: 999,face: '◕‿◕🔥',  css: 'ab-critical', dot: 'red',    greeting: '快点点我！' },
  ];

  var SCORE_DECAY_PER_HOUR = 3;
  var DECAY_INTERVAL_MS = 10 * 60 * 1000;  // 每 10 分钟衰减一次

  // 事件→分数映射
  var SCORE_MAP = {
    'new-package':     15,  // 新功能未体验
    'repeat-action':   10,  // 同一操作重复 3+ 次
    'pending-review':   5,  // 待审核任务堆积
    'error-spike':     10,  // 短时错误增加
    'system-update':    8,  // ACMS 版本更新
    'page-stuck':       5,  // 同页超时未操作
    'toast-fire':       2,  // 任意 toast (日常累积)
    'login-greeting':   18, // 每天首次登录问候
  };

  // ── 内部状态 ──

  var FACES = {
    happy:     { face: '◕‿◕', css: 'fc-happy',     label: '开心' },
    thinking:  { face: '◔_◔', css: 'fc-thinking',  label: '思考' },
    surprised: { face: '⊙_⊙', css: 'fc-surprised', label: '惊讶' },
    excited:   { face: '≧◡≦', css: 'fc-excited',   label: '兴奋' },
    caring:    { face: '◕︵◕', css: 'fc-caring',    label: '担心' },
    awkward:   { face: '◕▽◕', css: 'fc-awkward',   label: '尴尬' },
    sleepy:    { face: '◕_◕', css: 'fc-sleepy',    label: '困了' },
    confused:  { face: '◔_◕', css: 'fc-confused',  label: '疑惑' },
    lol:       { face: '≧▽≦', css: 'fc-lol',       label: '大笑' },
    love:      { face: '♥‿♥', css: 'fc-love',      label: '喜欢' },
    wink:      { face: '◕‿◕', css: 'fc-wink',      label: '眨眼' },
    determined:{ face: '◕_◕', css: 'fc-determined',label: '认真' },
    idea:      { face: '◕‿◕', css: 'fc-idea',      label: '有主意' },
    content:   { face: '◕‿◕', css: 'fc-content',   label: '安心' },
  };

  var _score = 0;
  var _currentFace = '◕‿◕';
  var _currentState = STATES[0];
  var _greetingDone = false;       // 本次登录是否已问候过
  var _chatHistory = [];           // [{ role: 'buddy'|'user', text }]
  var _currentView = '';
  var _panelOpen = false;
  var _panelEl = null;
  var _avatarEl = null;
  var _decayTimer = null;
  var _actionTimer = null;         // 重复操作检测定时器
  var _scoreMap = {};              // 当前活跃加分项 { key: timestamp }
  var _recentActions = [];         // 最近 10 条操作 { time, action }
  var _scoreEvents = [];           // 最近加分事件 [{ type, time }]
  var _proactiveCooldown = 0;      // 主动弹出冷却时间戳
  var _proactiveTimer = null;      // 主动检查定时器
  var _knownPackages = [];         // [{ name, title, icon, category }]

  // ── L1：用户记忆（小吉知道什么）──

  var MEMORY_KEY = 'acms-buddy-memory';

  function loadMemory() {
    try {
      var raw = localStorage.getItem(MEMORY_KEY);
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return {
      firstSeen: new Date().toISOString(),
      loginCount: 0,
      totalQuestions: 0,
      knownViews: [],
      lastView: '',
      daysActive: {},
      chatMemory: [],  // [{ role: 'user'|'buddy', text }] 最近 10 条
      personality: '',  // LLM 总结的性格认知
    };
  }

  function saveMemory() {
    try {
      localStorage.setItem(MEMORY_KEY, JSON.stringify(_userMemory));
    } catch(e) { console.warn('[Buddy] memory save failed:', e); }
  }

  var _userMemory = loadMemory();

  function getMemorySummary() {
    var m = _userMemory;
    var parts = [];
    if (m.loginCount > 0) parts.push('见过 ' + m.loginCount + ' 次');
    if (m.totalQuestions > 0) parts.push('聊过 ' + m.totalQuestions + ' 个话题');
    var views = m.knownViews || [];
    if (views.length > 0) parts.push('看过 ' + views.join('、'));
    return parts.join('；') || '还不了解';
  }

  function recordUserView(viewName) {
    if (!viewName) return;
    _userMemory.lastView = viewName;
    if (_userMemory.knownViews.indexOf(viewName) === -1) {
      _userMemory.knownViews.push(viewName);
      if (_userMemory.knownViews.length > 20) _userMemory.knownViews.shift();
    }
    saveMemory();
  }

  // ── 工具函数 ──

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function getBuddyUserName() {
    try {
      var u = JSON.parse(localStorage.getItem('acms-user') || '{}');
      return u.username || '伙伴';
    } catch(e) { return '伙伴'; }
  }

  // v0.61: 获取认证头（优先用 JWT token，fallback 到 API Key）
  function getAuthHeaders() {
    var token = null;
    try { token = localStorage.getItem('acms-token'); } catch(e) {}
    if (token) return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
    return { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' };
  }

  function getState(score) {
    for (var i = 0; i < STATES.length; i++) {
      if (score <= STATES[i].maxScore) return STATES[i];
    }
    return STATES[STATES.length - 1];
  }

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  // ── L2 全局操作解析（v0.61，零侵入，捕获阶段自动钩）──

  var _lastActionTimes = {};

  function getSemanticAction(el) {
    if (!el || !el.tagName) return null;
    // 1. data-action / data-act 属性（语义最明确）
    var da = el.getAttribute('data-action') || el.getAttribute('data-act');
    if (da) return 'act:' + da;
    // 2. onclick 属性中的函数名
    var onclick = el.getAttribute('onclick');
    if (onclick) {
      var m = onclick.match(/(\w+)\s*\(/);
      if (m) return 'click:' + m[1];
    }
    // 3. class 推断（常见 ACMS 组件）
    var cls = typeof el.className === 'string' ? el.className : '';
    if (cls.includes('req-card') || cls.includes('task-card')) return 'click:card';
    if (cls.includes('launcher-item')) return 'click:launcher';
    if (cls.includes('tray-item') || cls.includes('tb-')) return 'click:taskbar';
    if (cls.includes('aw-') && cls.includes('control')) return 'click:window-btn';
    // 4. 有文本的按钮（兜底）
    if (el.tagName === 'BUTTON' || el.tagName === 'A') {
      var text = (el.textContent || '').trim().slice(0, 24);
      if (!text || /^[🔢.…●]{1,3}$/.test(text)) return null;
      return 'btn:' + text;
    }
    return null;
  }

  // ── L4：计分引擎 ──

  function addScore(eventKey, optionalValue) {
    var value = (optionalValue !== undefined ? optionalValue : SCORE_MAP[eventKey]) || 0;
    if (value <= 0) return;

    // 防刷：同一事件 5 分钟内不重复加（部分事件除外）
    var now = Date.now();
    if (eventKey !== 'toast-fire' && eventKey !== 'pending-review') {
      var last = _scoreMap[eventKey];
      if (last && (now - last) < 5 * 60 * 1000) return;
    }
    _scoreMap[eventKey] = now;

    // 记录分数事件（用于主动弹出消息生成）
    _scoreEvents.push({ type: eventKey, time: now });
    if (_scoreEvents.length > 10) _scoreEvents.shift();

    _score = clamp(_score + value, 0, 120);
    updateState();
  }

  function resetScore() {
    _score = 0;
    _scoreMap = {};
    _scoreEvents = [];
    _recentActions = [];
    _proactiveCooldown = Date.now() + 120 * 1000; // 归零后 2 分钟内不主动弹出
    updateState();
  }

  // ── L4：主动弹出（分数驱动）──

  function startProactive() {
    stopProactive();
    _proactiveTimer = setInterval(checkProactive, 15 * 1000); // 每 15 秒检查
  }

  function stopProactive() {
    if (_proactiveTimer) { clearInterval(_proactiveTimer); _proactiveTimer = null; }
  }

  function checkProactive() {
    // 面板开着的时候不主动弹
    if (_panelOpen) return;
    // 冷却中不弹
    if (Date.now() < _proactiveCooldown) return;
    // 分数不够不弹
    if (_score < 40) return;

    // 找到最重要的最近事件来生成消息
    var msg = getMessageForScore();
    if (!msg) return;

    // 冷却 5 分钟
    _proactiveCooldown = Date.now() + 5 * 60 * 1000;

    // 设置关心的表情
    setFace('caring');

    // 弹出面板
    openPanel({ message: msg });
  }

  function getMessageForScore() {
    // 按优先级从最近事件中找消息
    var events = _scoreEvents.slice().reverse();
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      var age = Date.now() - e.time;
      if (age > 10 * 60 * 1000) continue; // 超过 10 分钟的事件不处理

      var userName = getBuddyUserName();

      if (e.type === 'new-package') {
        return '我注意到系统有新功能上线了，要不要看看？';
      }
      if (e.type === 'repeat-action') {
        return '你好像重复了好几次同样的操作，要不要我帮你看看有没有更快的办法？';
      }
      if (e.type === 'error-spike') {
        return '最近好像出了点错，要我检查一下吗？';
      }
      if (e.type === 'pending-review') {
        return '有待审核的任务等着你哦，要去看看吗？';
      }
    }

    // 没有特别事件但分数高
    if (_score >= 70) {
      return '好像有事想跟你说，你忙完记得点我～';
    }
    return null;
  }

  // ── 衰减 ──

  function decay() {
    if (_score <= 0) return;
    _score = clamp(_score - SCORE_DECAY_PER_HOUR * (DECAY_INTERVAL_MS / 3600000), 0, 120);
    updateState();
  }

  function startDecay() {
    stopDecay();
    _decayTimer = setInterval(decay, DECAY_INTERVAL_MS);
  }

  function stopDecay() {
    if (_decayTimer) { clearInterval(_decayTimer); _decayTimer = null; }
  }

  // ── 状态更新 ──

  function updateState() {
    var oldState = _currentState;
    _currentState = getState(_score);

    // 更新注视指示灯
    updateWatchDot();

    // 状态变了且不在对话中 → 更新头像表情匹配状态
    if (oldState.name !== _currentState.name) {
      if (!_panelOpen && !_chatHistory.length) {
        setFace('happy');
      }
    }
  }

  function updateWatchDot() {
    var dot = document.getElementById('ab-watch-dot');
    if (!dot) return;
    var colors = { idle: 'var(--green)', curious: 'var(--accent3)', urgent: '#e67e22', critical: 'var(--accent2)' };
    dot.style.background = colors[_currentState.name] || colors.idle;
    dot.className = 'ab-watch-dot';
    if (_currentState.name === 'curious' || _currentState.name === 'urgent') dot.classList.add('pulse');
    if (_currentState.name === 'critical') dot.classList.add('flash');
    dot.title = _currentState.greeting;
  }

  // ── L2：上下文感知 ──

  function setCurrentView(viewName) {
    _currentView = viewName || '';
    if (viewName) recordUserView(viewName);
  }

  function recordAction(actionName) {
    var now = Date.now();
    _recentActions.push({ time: now, action: actionName });
    if (_recentActions.length > 10) _recentActions.shift();

    // 重复操作检测：3 次相同操作在 5 分钟内
    checkRepeat(actionName);

    // v0.61: L2 动作上报 — fire-and-forget 到后端，让小吉跨会话知道用户行为
    _reportAction(actionName);
  }

  function _reportAction(actionName) {
    if (!actionName) return;
    var view = _currentView || 'unknown';
    fetch('/api/agent-buddy/context', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ view: view, action: actionName, ts: Date.now() }),
    }).catch(function() { /* fire-and-forget，不阻塞 */ });
  }

  function checkRepeat(actionName) {
    var window = 5 * 60 * 1000;
    var now = Date.now();
    var count = 0;
    for (var i = _recentActions.length - 1; i >= 0; i--) {
      if (_recentActions[i].action === actionName && (now - _recentActions[i].time) < window) {
        count++;
      } else {
        break; // 只检查最新的连续同类型操作
      }
    }
    if (count >= 3) {
      // 连续 3 次相同操作 → 可疑，给分但不重复触发
      _score = clamp(_score + SCORE_MAP['repeat-action'], 0, 120);
      updateState();
    }
  }

  // ── L3：UI 渲染 ──

  function ensurePanel() {
    if (_panelEl && _panelEl.parentNode) return _panelEl;
    _panelEl = document.createElement('div');
    _panelEl.id = 'agent-panel';
    _panelEl.className = 'agent-panel';
    _panelEl.innerHTML =
      '<div class="ap-header">' +
        '<span class="ap-avatar">◕‿◕</span>' +
        '<span class="ap-title">小吉</span>' +
        '<button class="ap-close">✕</button>' +
      '</div>' +
      '<div class="ap-messages" id="ap-messages">' +
        '<div class="ap-msg ap-msg-buddy">' +
          '<span class="ap-msg-text">hi～ 我一直在呢</span>' +
        '</div>' +
      '</div>' +
      '<div class="ap-score-bar"><div class="ap-score-fill"></div></div>' +
      '<div class="ap-input-row">' +
        '<input type="text" class="ap-input" id="ap-input" placeholder="问小吉问题..." autocomplete="off">' +
        '<button class="ap-send-btn" id="ap-send-btn">➤</button>' +
      '</div>';
    document.body.appendChild(_panelEl);

    // 关闭按钮
    var closeBtn = _panelEl.querySelector('.ap-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closePanel();
      });
    }

    // 点击外部关闭
    _panelEl.addEventListener('click', function(e) { e.stopPropagation(); });

    // 输入框回车发送
    var input = _panelEl.querySelector('#ap-input');
    var sendBtn = _panelEl.querySelector('#ap-send-btn');
    if (input && sendBtn) {
      function doSend() {
        var text = input.value.trim();
        if (!text) return;
        input.value = '';
        sendMessage(text);
      }
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); doSend(); }
      });
      sendBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        doSend();
      });
    }

    _panelEl.addEventListener('transitionend', function(e) {
      if (e.propertyName === 'opacity' && !_panelEl.classList.contains('open')) {
        _panelEl.style.display = 'none';
      }
    });

    // v0.62: 小吉专属拖拽 + 8 向缩放（不接 ACMSWin，独一无二的小吉窗口）
    _initPanelDragAndResize(_panelEl);

    return _panelEl;
  }

  function renderMessage(text) {
    var container = document.querySelector('#ap-messages');
    if (!container) return;
    var div = document.createElement('div');
    div.className = 'ap-msg ap-msg-buddy';
    div.innerHTML = '<span class="ap-msg-text">' + escHtml(text) + '</span>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  // ════════════════════════════════════════════════════════════
  // v0.62: 小吉专属拖拽 + 8 向缩放（不接 ACMSWin，独一无二的小吉窗口）
  // 设计动机：ACMSWin 是「标准窗口」，小吉是「独一无二」的浮层面板
  //          → 不共用窗口系统，自己实现一套简洁的 drag/resize
  // 持久化：localStorage acms-agent-panel-state = {x, y, w, h}
  // ════════════════════════════════════════════════════════════

  var PANEL_STATE_KEY = 'acms-agent-panel-state';
  var PANEL_MIN_W = 200;
  var PANEL_MIN_H = 280;

  function _loadPanelState() {
    try {
      var raw = localStorage.getItem(PANEL_STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function _savePanelState(panelEl) {
    try {
      var rect = panelEl.getBoundingClientRect();
      localStorage.setItem(PANEL_STATE_KEY, JSON.stringify({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        w: Math.round(rect.width),
        h: Math.round(rect.height)
      }));
    } catch (e) { /* silent */ }
  }

  function _applyPanelSavedState(panelEl) {
    var s = _loadPanelState();
    if (!s) return;
    // 首次恢复：把初始的 right/bottom 定位转成 top/left
    panelEl.style.right = 'auto';
    panelEl.style.bottom = 'auto';
    panelEl.style.left = s.x + 'px';
    panelEl.style.top = s.y + 'px';
    if (s.w) panelEl.style.width = s.w + 'px';
    if (s.h) panelEl.style.height = s.h + 'px';
  }

  function _injectResizeHandles(panelEl) {
    ['n','s','e','w','ne','nw','se','sw'].forEach(function(d) {
      var h = document.createElement('div');
      h.className = 'ap-rz ap-rz-' + d;
      h.dataset.d = d;
      panelEl.appendChild(h);
    });
  }

  function _initPanelDragAndResize(panelEl) {
    _injectResizeHandles(panelEl);

    // ── 拖拽：header mousedown ──
    var header = panelEl.querySelector('.ap-header');
    if (header) {
      header.addEventListener('mousedown', function(e) {
        if (e.target.closest('.ap-close')) return; // 关闭按钮不触发拖拽
        e.preventDefault();
        // 首次拖拽：把 right/bottom 默认定位转成 top/left
        if (panelEl.style.right !== 'auto') {
          var r0 = panelEl.getBoundingClientRect();
          panelEl.style.right = 'auto';
          panelEl.style.bottom = 'auto';
          panelEl.style.left = r0.left + 'px';
          panelEl.style.top = r0.top + 'px';
        }
        var r = panelEl.getBoundingClientRect();
        var dx = e.clientX - r.left;
        var dy = e.clientY - r.top;
        panelEl.classList.add('dragging');
        function mv(ev) {
          var x = Math.max(0, Math.min(window.innerWidth - 40, ev.clientX - dx));
          var y = Math.max(0, Math.min(window.innerHeight - 30, ev.clientY - dy));
          panelEl.style.left = x + 'px';
          panelEl.style.top = y + 'px';
        }
        function up() {
          document.removeEventListener('mousemove', mv);
          document.removeEventListener('mouseup', up);
          panelEl.classList.remove('dragging');
          _savePanelState(panelEl);
        }
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
      });
    }

    // ── 8 向缩放：.ap-rz mousedown ──
    panelEl.querySelectorAll('.ap-rz').forEach(function(h) {
      h.addEventListener('mousedown', function(e) {
        e.stopPropagation();
        e.preventDefault();
        var dir = h.dataset.d;
        var r = panelEl.getBoundingClientRect();
        var sx = e.clientX, sy = e.clientY;
        var sw = r.width, sh = r.height, sl = r.left, st = r.top;
        panelEl.classList.add('resizing');
        function mv(ev) {
          var dx = ev.clientX - sx, dy = ev.clientY - sy;
          var nw = sw, nh = sh, nl = sl, nt = st;
          if (dir.indexOf('e') !== -1) nw = Math.max(PANEL_MIN_W, sw + dx);
          if (dir.indexOf('s') !== -1) nh = Math.max(PANEL_MIN_H, sh + dy);
          if (dir.indexOf('w') !== -1) { nw = Math.max(PANEL_MIN_W, sw - dx); nl = sl + (sw - nw); }
          if (dir.indexOf('n') !== -1) { nh = Math.max(PANEL_MIN_H, sh - dy); nt = st + (sh - nh); }
          panelEl.style.width = nw + 'px';
          panelEl.style.height = nh + 'px';
          panelEl.style.left = nl + 'px';
          panelEl.style.top = nt + 'px';
        }
        function up() {
          document.removeEventListener('mousemove', mv);
          document.removeEventListener('mouseup', up);
          panelEl.classList.remove('resizing');
          _savePanelState(panelEl);
        }
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
      });
    });
  }

  function renderUserMessage(text) {
    var container = document.querySelector('#ap-messages');
    if (!container) return;
    var div = document.createElement('div');
    div.className = 'ap-msg ap-msg-user';
    div.innerHTML = '<span class="ap-msg-text">' + escHtml(text) + '</span>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function renderThinking() {
    var container = document.querySelector('#ap-messages');
    if (!container) return;
    var div = document.createElement('div');
    div.className = 'ap-msg ap-msg-buddy ap-msg-thinking';
    div.id = 'ap-msg-thinking';
    div.innerHTML = '<span class="ap-msg-text">…</span>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function removeThinking() {
    var el = document.getElementById('ap-msg-thinking');
    if (el) el.remove();
  }

  // ── 对话记忆 ──

  function saveChatMemory(userMsg, buddyReply) {
    var mem = _userMemory.chatMemory || [];
    mem.push({ role: 'user', text: userMsg.slice(0, 200) });
    mem.push({ role: 'buddy', text: buddyReply.slice(0, 200) });
    if (mem.length > 10) mem.splice(0, mem.length - 10);
    _userMemory.chatMemory = mem;
    saveMemory();

    // 每 4 轮对话（8 条消息）触发一次性格总结
    if (mem.length >= 8 && mem.length % 8 < 2) {
      updatePersonality();
    }
  }

  // ── 性格总结 ──

  function updatePersonality() {
    var mem = _userMemory.chatMemory || [];
    if (mem.length < 4) return;

    var historyText = mem.map(function(m) {
      return (m.role === 'user' ? '用户' : '小吉') + '：' + m.text;
    }).join('\n');

    var oldPersonality = _userMemory.personality || '还没有了解';

      fetch('/api/agent-buddy/chat', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message: '__personality__',
        context: {
          oldPersonality: oldPersonality,
          history: historyText.slice(0, 1000),
        },
      }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.reply) {
        var clean = data.reply.replace(/【[^】]+】/g, '').trim();
        if (clean && clean.length < 200) {
          _userMemory.personality = clean;
          saveMemory();
        }
      }
    })
    .catch(function() {});
  }

  // ── 动作执行（演示能力）──

  function executeActions(text) {
    var match = text.match(/【action:([^:]+):([^】]+)】/);
    if (!match) return;
    var type = match[1];
    var param = match[2];

    if (type === 'open_view') {
      if (window.ACMSWin && ACMSWin.open) {
        ACMSWin.open(param);
      }
    } else if (type === 'highlight') {
      highlightElement(param);
    }
  }

  function highlightElement(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add('ab-highlight');
    setTimeout(function() {
      el.classList.remove('ab-highlight');
    }, 3000);
  }

  // ── L5：聊天发送 ──

  function sendMessage(text) {
    renderUserMessage(text);
    renderThinking();

    _chatHistory.push({ role: 'user', text: text });

    // 递增问题计数
    _userMemory.totalQuestions = (_userMemory.totalQuestions || 0) + 1;
    saveMemory();

    // Focus 输入框
    var input = document.getElementById('ap-input');
    if (input) setTimeout(function() { input.focus(); }, 100);

    var context = {
      currentView: _currentView || undefined,
      loginCount: _userMemory.loginCount || 0,
      totalQuestions: _userMemory.totalQuestions || 0,
      knownViews: (_userMemory.knownViews || []).slice(-8),
      userName: getBuddyUserName(),
      packages: _knownPackages.map(function(p) { return p.name + '(' + p.title + ')'; }),
      history: (_userMemory.chatMemory || []).slice(-6),
      personality: _userMemory.personality || undefined,
    };

    // 调后端
    fetch('/api/agent-buddy/chat', {
      method: 'POST',
        headers: getAuthHeaders(),
      body: JSON.stringify({ message: text, context: context }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      removeThinking();
      var raw = data.reply || '嗯… 我没听清，能再说一遍吗？';
      // 从回复中提取并执行动作和表情标记，然后从显示文本中去除
      executeActions(raw);
      var faceMatch = raw.match(/【face:(\w+)】/);
      if (faceMatch) setFace(faceMatch[1]);
      // 清除所有标记后展示纯文本
      var reply = raw.replace(/【[^】]+】/g, '').trim();
      renderMessage(reply);
      _chatHistory.push({ role: 'buddy', text: reply });
      addScore('toast-fire');

      // 保存到长期记忆
      saveChatMemory(text, reply);
    })
    .catch(function(err) {
      removeThinking();
      renderMessage('我网络开小差了… 你再跟我说一遍？');
      _chatHistory.push({ role: 'buddy', text: '（网络异常）' });
      saveChatMemory(text, '（网络异常）');
    });
  }

  function renderScoreBar() {
    var fill = document.querySelector('#agent-panel .ap-score-fill');
    var label = document.querySelector('#agent-panel .ap-score-label');
    if (!fill) return;
    var pct = Math.min((_score / 120) * 100, 100);
    fill.style.width = pct + '%';
    fill.style.background = _currentState.dot === 'green' ? 'var(--green, #6bff6b)' :
                            _currentState.dot === 'yellow' ? 'var(--accent3, #ffd93d)' :
                            _currentState.dot === 'orange' ? 'var(--accent2, #e67e22)' :
                            'var(--accent2, #e74c3c)';
    if (label) {
      var hints = [];
      if (_score <= 15) hints.push('一切安好');
      else if (_score <= 45) hints.push('有事情想说说');
      else if (_score <= 75) hints.push('可能有件事需要你注意');
      else hints.push('好像有重要的事');
      label.textContent = hints[0];
    }
  }

  function openPanel(entry) {
    var panel = ensurePanel();
    if (_panelOpen) { closePanel(); return; }
    _panelOpen = true;

    // 清空旧消息（保留最新一条问候或对话）
    var container = document.querySelector('#ap-messages');
    if (container) container.innerHTML = '';

    var msg = entry && entry.message;
    if (msg) renderMessage(msg);
    else renderMessage('hi～ 我一直在呢');

    renderScoreBar();

    // 让 .open class 的 display:flex 接管（不要 inline 写 block，否则 specificity 压过 CSS）
    panel.style.display = '';
    // v0.62: 恢复上次拖拽/缩放保存的位置（display:block 后才能正确 getBoundingClientRect）
    _applyPanelSavedState(panel);
    // 强迫回流后加 open class 触发过渡
    panel.offsetHeight;
    panel.classList.add('open');

    // 点击她之后分数归零 (但保留问候标记)
    resetScore();
  }

  function closePanel() {
    var panel = document.getElementById('agent-panel');
    if (!panel || !_panelOpen) return;
    _panelOpen = false;
    panel.classList.remove('open');
    // transitionend 会把 display 设为 none
    setTimeout(function() {
      if (panel && !panel.classList.contains('open')) panel.style.removeProperty('display');
    }, 250);
  }

  function togglePanel(entry) {
    if (_panelOpen) closePanel();
    else openPanel(entry);
  }

  function renderAvatar() {
    if (!_avatarEl) return;
    _avatarEl.textContent = _currentFace;
    // 更新表情 CSS class
    for (var key in FACES) {
      _avatarEl.classList.toggle(FACES[key].css, FACES[key].face === _currentFace);
    }
    // 也更新面板头像
    var headerAvatar = document.querySelector('.ap-avatar');
    if (headerAvatar) headerAvatar.textContent = _currentFace;
  }

  function setFace(faceType) {
    var entry = FACES[faceType];
    if (!entry) return;
    if (_currentFace === entry.face) return; // 没变化就不动
    _currentFace = entry.face;
    animateFaceChange(_avatarEl);
    animateFaceChange(document.querySelector('.ap-avatar'));
    // 更新 CSS class
    if (_avatarEl) {
      for (var key in FACES) {
        _avatarEl.classList.toggle(FACES[key].css, FACES[key].face === _currentFace);
      }
    }
  }

  function animateFaceChange(el) {
    if (!el) return;
    el.style.animation = 'none';
    el.offsetHeight; // force reflow
    el.style.animation = 'fc-pop 0.35s ease';
    el.textContent = _currentFace;
  }

  function ensureAvatar() {
    if (_avatarEl) return _avatarEl;
    var tray = document.getElementById('tb-tray');
    if (!tray) return null;

    _avatarEl = document.createElement('div');
    _avatarEl.id = 'tb-agent-buddy';
    _avatarEl.className = 'tray-item clickable ab-avatar fc-happy';
    _avatarEl.textContent = _currentFace;
    _avatarEl.title = '🟢 我在呢～';
    _avatarEl.addEventListener('click', function(e) {
      e.stopPropagation();
      togglePanel();
    });

    // 注视指示灯
    var dot = document.createElement('span');
    dot.id = 'ab-watch-dot';
    dot.className = 'ab-watch-dot';
    dot.title = '我在呢～';
    _avatarEl.appendChild(dot);

    // 插在主题按钮之前 (🎨 之前)
    var themeBtn = document.getElementById('tb-theme-btn');
    if (themeBtn) {
      tray.insertBefore(_avatarEl, themeBtn);
    } else {
      var notifBtn = document.getElementById('tb-notif-btn');
      if (notifBtn) {
        tray.insertBefore(_avatarEl, notifBtn);
      } else {
        tray.appendChild(_avatarEl);
      }
    }

    return _avatarEl;
  }

  // ── v0.61：诞生仪式（首次登录）──

  function runBirthRitual() {
    _userMemory.birthdayDone = true;
    saveMemory();
    addScore('login-greeting');

    // 任务栏头像 bounce-in 动画（800ms）
    if (_avatarEl) {
      _avatarEl.classList.remove('ab-face-transition');
      _avatarEl.classList.add('ab-birthday');
    }
    setFace('excited');

    setTimeout(function() {
      openPanel({ message: '……' });

      // 表情过渡序列（500ms = 5×100ms）
      var faces = ['thinking', 'awkward', 'surprised', 'excited', 'happy'];
      var transitionEl = function(face, idx) {
        setTimeout(function() {
          setFace(face);
          // 每次切换加过渡动画 class
          if (_avatarEl) {
            _avatarEl.classList.remove('ab-face-transition');
            _avatarEl.offsetHeight; // force reflow
            _avatarEl.classList.add('ab-face-transition');
          }
          if (idx === faces.length - 1) {
            // 最后清除过渡 class
            setTimeout(function() {
              if (_avatarEl) _avatarEl.classList.remove('ab-birthday', 'ab-face-transition');
            }, 200);
          }
        }, idx * 100);
      };
      for (var i = 0; i < faces.length; i++) {
        transitionEl(faces[i], i);
      }

      // 过渡结束后调用正常问候 API（在最后 face 后延迟 500ms）
      setTimeout(function() {
        if (_panelOpen) doGreetingAPI();
      }, faces.length * 100 + 500);

    }, 800);
  }

  function setFaceWithTransition(faceType) {
    // 与 setFace 等价但确保过渡动画被触发
    var entry = FACES[faceType];
    if (!entry) return;
    _currentFace = entry.face;
    if (_avatarEl) {
      _avatarEl.textContent = _currentFace;
    }
    var headerAvatar = document.querySelector('.ap-avatar');
    if (headerAvatar) headerAvatar.textContent = _currentFace;
  }

  // 抽离通用问候 API 调用（诞生日 + 正常登录共用）
  function doGreetingAPI() {
    var context = {
      greeting: true,
      userName: getBuddyUserName(),
      loginCount: _userMemory.loginCount || 0,
      totalQuestions: _userMemory.totalQuestions || 0,
      knownViews: (_userMemory.knownViews || []).slice(-8),
      lastView: _userMemory.lastView || '',
      packages: _knownPackages.map(function(p) { return p.name + '(' + p.title + ')'; }),
      history: (_userMemory.chatMemory || []).slice(-4),
      personality: _userMemory.personality || undefined,
    };

    fetch('/api/agent-buddy/chat', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ message: '__greeting__', context: context }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var raw = data && data.reply ? data.reply : '欢迎回来～';
      var faceMatch = raw.match(/【face:(\w+)】/);
      if (faceMatch) setFace(faceMatch[1]);
      var reply = raw.replace(/【[^】]+】/g, '').trim();
      var container = document.querySelector('#ap-messages');
      if (container) container.innerHTML = '';
      renderMessage(reply);
    })
    .catch(function() {
      var container = document.querySelector('#ap-messages');
      if (container) container.innerHTML = '';
      renderMessage(getBuddyUserName() + ' 欢迎回来～');
    });

    // 5 秒超时兜底
    setTimeout(function() {
      var msgs = document.querySelector('#ap-messages');
      if (msgs && msgs.children.length === 1 && msgs.children[0].textContent.trim() === '……') {
        msgs.innerHTML = '';
        renderMessage('欢迎回来～有什么需要帮忙的吗？');
      }
    }, 5000);
  }

  // ── 问候系统（记忆驱动 + 首次诞生仪式）──

  function checkGreeting() {
    var userData = null;
    try { userData = JSON.parse(localStorage.getItem('acms-user') || '{}'); } catch(e) {}
    var name = (userData && userData.username) || '伙伴';

    // 递增登录次数
    _userMemory.loginCount = (_userMemory.loginCount || 0) + 1;
    var d = today();
    _userMemory.daysActive = _userMemory.daysActive || {};
    _userMemory.daysActive[d] = true;
    saveMemory();

    _greetingDone = true;

    // v0.61: 首次登录 → 诞生仪式
    //   birthdayDone 防止 localStorage 清空后重复触发（清除后重新触发可接受）
    if (_userMemory.loginCount === 1 && !_userMemory.birthdayDone) {
      runBirthRitual();
      return;
    }

    addScore('login-greeting');

    // 正常问候（v0.59 保持）
    setTimeout(function() {
      setFace('happy');
      openPanel({ message: '……' });
      doGreetingAPI();
    }, 800);
  }

  // ── 外部事件集成 ──

  function onNewPackage(name, config) {
    if (!name) return;
    // 记住这个包
    var exists = false;
    for (var i = 0; i < _knownPackages.length; i++) {
      if (_knownPackages[i].name === name) { exists = true; break; }
    }
    if (!exists) {
      _knownPackages.push({
        name: name,
        title: config && (config.title || config.name || name),
        icon: (config && config.icon) || '📦',
        category: (config && config.category) || '',
      });
    }
    // 延迟判断：启动后 5 秒内注册的不算新功能（批量初始化）
    if (Date.now() - (_startTime || Date.now()) > 5000) {
      addScore('new-package');
    }
  }

  var _startTime = Date.now();

  function onToast(msg, type) {
    // 异常错误 → error-spike
    if (type === 'error') {
      addScore('error-spike');
    }
    addScore('toast-fire');

    // v0.61: toast 作为操作记录的补充源（关键操作完成后必有 toast）
    if (msg && type) {
      recordAction('toast:' + type + ':' + (msg.slice(0, 30) || ''));
    }
  }

  // ── 初始化 ──

  function init() {
    // 确保 tray 存在
    var tray = document.getElementById('tb-tray');
    if (!tray) {
      // 等 DOM 加载
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      }
      return;
    }

    // 创建 avatar
    ensureAvatar();

    // 初始化注视指示灯
    updateWatchDot();

    // 开启衰减
    startDecay();

    // 订阅包注册事件
    if (window.ACMS && ACMS.onPackageRegistered) {
      ACMS.onPackageRegistered(onNewPackage);
    }

    // Hook toast
    var origToast = window.toast;
    if (typeof origToast === 'function') {
      window.toast = function(msg, type) {
        origToast(msg, type);
        onToast(msg, type);
      };
    }

    // Wire up view tracking：轻量包裹 ACMSWin.open，不打补丁到核心
    if (window.ACMSWin && ACMSWin.open) {
      var origOpen = ACMSWin.open;
      ACMSWin.open = function(viewName, opts) {
        setCurrentView(viewName);
        return origOpen.call(ACMSWin, viewName, opts);
      };
    }

    // 检查问候
    setTimeout(function() {
      checkGreeting();
    }, 1500);

    // 启动主动弹出检查（15 秒后开始，给问候留时间）
    setTimeout(function() {
      startProactive();
    }, 5000);

    // v0.61: 全局 click 捕获监听（AOP 零侵入——所有操作自动记录）
    //   捕获阶段执行，在视图自己的 handler 之前被拦截
    //   同一操作 5 秒节流，避免重复记录
    setTimeout(function() {
      document.addEventListener('click', function(e) {
        var action = getSemanticAction(e.target);
        if (!action) return;
        var now = Date.now();
        if (_lastActionTimes[action] && (now - _lastActionTimes[action]) < 5000) return;
        _lastActionTimes[action] = now;
        recordAction(action);
      }, true);
    }, 2000); // 等 UI 稳定后再挂监听
  }

  // ── 暴露 API ──

  var API = {
    score: 0,  // 只读 getter 在下方
    state: 'idle',
    addScore: function(eventKey, val) { addScore(eventKey, val); },
    resetScore: function() { resetScore(); },
    togglePanel: function(entry) { togglePanel(entry); },
    setView: function(viewName) { setCurrentView(viewName); },
    recordAction: function(actionName) { recordAction(actionName); },
    getPanelOpen: function() { return _panelOpen; },
  };

  // 让 score 和 state 成为只读属性
  Object.defineProperty(API, 'score', { get: function() { return _score; }, enumerable: true });
  Object.defineProperty(API, 'state', { get: function() { return _currentState.name; }, enumerable: true });

  // 挂到全局
  window.ACMS = window.ACMS || {};
  ACMS.Buddy = API;

  // 初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
