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

  var _score = 0;
  var _currentState = STATES[0];
  var _greetingDone = false;       // 本次登录是否已问候过
  var _chatHistory = [];           // [{ role: 'buddy'|'user', text }]
  var _currentView = '';
  var _panelOpen = false;
  var _panelEl = null;
  var _avatarEl = null;
  var _decayTimer = null;
  var _actionTimer = null;         // 重复操作检测定时器

  // ── 工具函数 ──

  function today() {
    return new Date().toISOString().slice(0, 10);
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

    _score = clamp(_score + value, 0, 120);
    updateState();
  }

  function resetScore() {
    _score = 0;
    _scoreMap = {};
    // 重置重复操作计数
    _recentActions = [];
    updateState();
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

    // 状态变了才更新 UI
    if (oldState.name !== _currentState.name || oldState.dot !== _currentState.dot) {
      renderAvatar();
    }
  }

  // ── L2：上下文感知 ──

  function setCurrentView(viewName) {
    _currentView = viewName || '';
  }

  function recordAction(actionName) {
    var now = Date.now();
    _recentActions.push({ time: now, action: actionName });
    if (_recentActions.length > 10) _recentActions.shift();

    // 重复操作检测：3 次相同操作在 5 分钟内
    checkRepeat(actionName);
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
          '<span class="ap-msg-icon">◕‿◕</span>' +
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

    return _panelEl;
  }

  function renderMessage(text) {
    var container = document.querySelector('#ap-messages');
    if (!container) return;
    var div = document.createElement('div');
    div.className = 'ap-msg ap-msg-buddy';
    div.innerHTML = '<span class="ap-msg-icon">◕‿◕</span><span class="ap-msg-text">' + escHtml(text) + '</span>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
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
    div.innerHTML = '<span class="ap-msg-icon">◕‿◕</span><span class="ap-msg-text">…</span>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function removeThinking() {
    var el = document.getElementById('ap-msg-thinking');
    if (el) el.remove();
  }

  // ── L5：聊天发送 ──

  function sendMessage(text) {
    renderUserMessage(text);
    renderThinking();

    _chatHistory.push({ role: 'user', text: text });

    // Focus 输入框
    var input = document.getElementById('ap-input');
    if (input) setTimeout(function() { input.focus(); }, 100);

    var context = {
      currentView: _currentView || undefined,
    };

    // 调后端
    fetch('/api/agent-buddy/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify({ message: text, context: context }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      removeThinking();
      var reply = data.reply || '嗯… 我没听清，能再说一遍吗？';
      renderMessage(reply);
      _chatHistory.push({ role: 'buddy', text: reply });
      // 每次聊天加分 +2（累积）
      addScore('toast-fire');
    })
    .catch(function(err) {
      removeThinking();
      var fallback = getLocalReply(text);
      if (fallback) {
        renderMessage(fallback);
        _chatHistory.push({ role: 'buddy', text: fallback });
      } else {
        renderMessage('我好像网络开小差了… 你再跟我说一遍？');
        _chatHistory.push({ role: 'buddy', text: '（网络异常）' });
      }
    });
  }

  // 本地兜底回复（API 不可用时）
  function getLocalReply(text) {
    var t = text.toLowerCase();
    if (t.indexOf('你是谁') !== -1 || t.indexOf('你叫什么') !== -1 || t.indexOf('你是') !== -1) {
      return '我是小吉，ACMS 的系统助手～ 我一直在平台里看着，随时可以帮你！';
    }
    if (t.indexOf('能做') !== -1 || t.indexOf('你会') !== -1 || t.indexOf('功能') !== -1 || t.indexOf('help') !== -1) {
      return '我了解 ACMS 的所有功能哦～ 你可以问我「怎么看缺陷」「怎么创建需求」「什么是看板」等等。我还可以在你看到新功能的时候提醒你！';
    }
    if (t.indexOf('你好') !== -1 || t.indexOf('hi') !== -1 || t.indexOf('hello') !== -1) {
      return '你好呀～ 有什么需要帮忙的吗？';
    }
    return null;
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

    panel.style.display = 'block';
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
      if (panel && !panel.classList.contains('open')) panel.style.display = 'none';
    }, 250);
  }

  function togglePanel(entry) {
    if (_panelOpen) closePanel();
    else openPanel(entry);
  }

  function renderAvatar() {
    if (!_avatarEl) return;
    _avatarEl.textContent = _currentState.face;
    // 更新 CSS state class
    STATES.forEach(function(s) {
      _avatarEl.classList.toggle(s.css, _currentState.name === s.name);
    });
    // 更新 dot color（通过修改 title 不用额外元素）
    var dotColors = { green: '🟢', yellow: '🟡', orange: '🟠', red: '🔴' };
    var dot = dotColors[_currentState.dot] || '🟢';
    _avatarEl.title = dot + ' ' + _currentState.greeting;
  }

  function ensureAvatar() {
    if (_avatarEl) return _avatarEl;
    var tray = document.getElementById('tb-tray');
    if (!tray) return null;

    _avatarEl = document.createElement('div');
    _avatarEl.id = 'tb-agent-buddy';
    _avatarEl.className = 'tray-item clickable ab-avatar ' + _currentState.css;
    _avatarEl.textContent = _currentState.face;
    _avatarEl.title = '🟢 我在呢～';
    _avatarEl.addEventListener('click', function(e) {
      e.stopPropagation();
      // 检查是否有待展示的消息类型
      togglePanel();
    });

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

  // ── 问候系统 ──

  function checkGreeting() {
    var userData = null;
    try { userData = JSON.parse(localStorage.getItem('acms-user') || '{}'); } catch(e) {}
    var name = (userData && userData.username) || '伙伴';

    // 判断是否是第一次见（从未存过问候日期）
    var firstVisit = !localStorage.getItem('acms-buddy-greeting-date');
    var msg = '';
    if (firstVisit) {
      msg = name + '你好～ 我是小吉，ACMS 的平台助手。我刚诞生，还有很多需要了解你。不过我会慢慢学会的，以后请多指教。';
    } else {
      // 根据上下文生成问候
      var viewHint = _currentView ? ' 你上次在看「' + _currentView + '」' : '';
      msg = '欢迎回来 ' + name + '～' + viewHint + '。有什么需要帮忙的吗？可以试着问我问题哦。';
    }

    // 保存问候日期（仅标记已来过，不影响每次问候）
    localStorage.setItem('acms-buddy-greeting-date', today());
    _greetingDone = true;

    // 加分：登录问候
    addScore('login-greeting');

    // 延迟展示问候（让 UI 先加载完）
    setTimeout(function() {
      openPanel({ message: msg });
    }, 800);
  }

  // ── 外部事件集成 ──

  function onNewPackage(name, config) {
    // 新包注册 → 判断是否"新功能未体验"
    // 简单策略：不是启动时批量注册的（延迟 < 5秒的）才是新功能
    // 所以这里先加分数，但不展开
    addScore('new-package');
  }

  function onToast(msg, type) {
    // 异常错误 → error-spike
    if (type === 'error') {
      addScore('error-spike');
    }
    addScore('toast-fire');
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
