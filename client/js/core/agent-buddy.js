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
    happy:     { face: '◕‿◕', css: 'fc-happy',      label: '开心' },
    thinking:  { face: '◔_◔', css: 'fc-thinking',   label: '思考' },
    surprised: { face: '⊙_⊙', css: 'fc-surprised',  label: '惊讶' },
    excited:   { face: '≧◡≦', css: 'fc-excited',    label: '兴奋' },
    caring:    { face: '◕︵◕', css: 'fc-caring',     label: '担心' },
    awkward:   { face: '◕▽◕', css: 'fc-awkward',    label: '尴尬' },
    sleepy:    { face: '◕_◕', css: 'fc-sleepy',     label: '困了' },
    confused:  { face: '◔_◕', css: 'fc-confused',   label: '疑惑' },
    lol:       { face: '≧▽≦', css: 'fc-lol',        label: '大笑' },
    love:      { face: '♥‿♥', css: 'fc-love',       label: '喜欢' },
    wink:      { face: '◕‿◕', css: 'fc-wink',       label: '眨眼' },
    determined:{ face: '◕_◕', css: 'fc-determined', label: '认真' },
    idea:      { face: '◕‿◕', css: 'fc-idea',       label: '有主意' },
    content:   { face: '◕‿◕', css: 'fc-content',    label: '安心' },
    // v0.79: 场景化表情
    success:   { face: '◕‿◕✨', css: 'fc-success',   label: '成功' },  // 工具调用成功
    error:     { face: '◕‿◕💥', css: 'fc-error',     label: '失败' },  // 工具调用失败
    searching: { face: '◔‿◔', css: 'fc-searching',   label: '搜索' },  // 搜索中
    creating:  { face: '⚒‿⚒', css: 'fc-creating',   label: '创作' },  // 生成内容
    working:   { face: '◕‿◕⚙', css: 'fc-working',    label: '工作中' }, // 执行中
    waiting:   { face: '◕_◕', css: 'fc-waiting',     label: '等待' },   // 等待确认
    celebrate: { face: '🎉‿🎉', css: 'fc-celebrate',  label: '庆祝' },  // 任务完成
    worried:   { face: '◕︶◕', css: 'fc-worried',     label: '担心' },   // 异常检测
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
  var _streamSpeed = 30;           // v0.80: 流式速度（ms/块）
  var _streamPaused = false;       // v0.80: 流式暂停状态
  var _streamDone = false;         // v0.80: 流式完成状态
  var _streamAbortController = null; // v0.80: 流式中止控制器

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
        '<span class="ap-mode-badge" id="ap-mode-badge" title="点我切换检索模式">🔍</span>' +
        '<button class="ap-stream-btn" id="ap-stream-pause" title="暂停/继续流式">⏸</button>' +
        '<button class="ap-stream-btn" id="ap-stream-speed" title="调节速度">⚡</button>' +
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

    // v0.80: 流式控制按钮
    var pauseBtn = _panelEl.querySelector('#ap-stream-pause');
    var speedBtn = _panelEl.querySelector('#ap-stream-speed');

    // 暴露给全局供按钮调用
    window.buddyStreamPause = function() {
      _streamPaused = true;
    };
    window.buddyStreamResume = function() {
      _streamPaused = false;
    };
    window.buddyStreamSetSpeed = function(speed) {
      _streamSpeed = Math.max(10, Math.min(100, speed));
    };
    window.buddyStreamStop = function() {
      if (_streamAbortController) {
        _streamAbortController.abort();
      }
      _streamDone = true;
      _streamPaused = false;
      if (pauseBtn) {
        pauseBtn.textContent = '⏸';
        pauseBtn.title = '暂停流式';
      }
    };

    if (pauseBtn) {
      pauseBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (_streamPaused) {
          window.buddyStreamResume();
          _streamPaused = false;
          pauseBtn.textContent = '⏸';
          pauseBtn.title = '暂停流式';
        } else {
          window.buddyStreamPause();
          _streamPaused = true;
          pauseBtn.textContent = '▶';
          pauseBtn.title = '继续流式';
        }
      });
    }
    if (speedBtn) {
      var speeds = [10, 20, 30, 50, 100];
      var speedIndex = 2; // 默认 30ms
      speedBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        speedIndex = (speedIndex + 1) % speeds.length;
        var ms = speeds[speedIndex];
        window.buddyStreamSetSpeed(ms);
        speedBtn.title = '速度: ' + ms + 'ms';
        speedBtn.textContent = ms <= 20 ? '⚡' : ms <= 50 ? '🔥' : '🐢';
      });
    }

    _panelEl.addEventListener('transitionend', function(e) {
      if (e.propertyName === 'opacity' && !_panelEl.classList.contains('open')) {
        _panelEl.style.display = 'none';
      }
    });

    // v0.62: 小吉专属拖拽 + 8 向缩放（不接 ACMSWin，独一无二的小吉窗口）
    _initPanelDragAndResize(_panelEl);

    // v0.74: 检索模式切换（面板创建后才能找到 badge 元素）
    _initToolRetrieverUI();

    return _panelEl;
  }

  function renderMessage(text) {
    var container = document.querySelector('#ap-messages');
    if (!container) return;
    var div = document.createElement('div');
    div.className = 'ap-msg ap-msg-buddy';
    // v0.66: 使用 renderMarkdown 渲染 MD 样式
    var mdFn = typeof renderMarkdown === 'function' ? renderMarkdown : function(t) { return escHtml(t); };
    div.innerHTML = '<span class="ap-msg-text">' + mdFn(text) + '</span>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  var _actionPollers = {};

function renderActionCard(action) {
    if (!action || !action.requirementId) return;
    var container = document.querySelector('#ap-messages');
    if (!container) return;
    var id = 'ap-action-' + action.requirementId;
    // v0.101 fix: 每次动作一张独立卡片，追加到消息流底部（聊天向下）。
    //   v0.112 旧逻辑「清掉其他 req 的卡片 + 复用同 req 卡片」依赖后端容器复用：
    //   后端复用容器时 requirementId 不变 → 卡片永远更新历史位置那张 → 新内容渲染到上面（多多反馈）。
    //   现在后端每次动作新建容器（requirementId 唯一）→ 这里直接 append 新卡片，历史卡片保留在上方作为聊天记录。
    // 🆕 修复（2026-08-23 第三次）：回归 v0.114n 原则 — 按实际时间自然顺序
    //   不再固定位置（既不在 text 之前也不在 text 之后），而是按 SSE 事件到达顺序自然插入
    //   实时位置策略：insertBefore streamBubble（跟 tool-card 一致，先发生显示在前面）
    //   polling update 时不移动 DOM 位置（updateActionCard 只改 innerHTML）
    var card = document.getElementById(id);
    if (!card) {
      card = document.createElement('div');
      card.id = id;
      card.className = 'ap-action-card';
    }
    card.dataset.requirementId = action.requirementId;
    card.dataset.mode = action.mode || 'conversational_action';
    // 实时插入：先发生显示在前面（v0.114n）
    // 找到当前流式 bubble 作为锚点；流式 bubble 已被 finalize（id 清空）→ fallback appendChild
    var streamBubble = document.getElementById('ap-stream-bubble');
    if (streamBubble) {
      container.insertBefore(card, streamBubble);
    } else {
      container.appendChild(card);
    }
    // v0.112 fix: renderActionCard 后自动滚到底，让最新结果可见（之前 scrollTop=0 卡太高 1118px → 只能看到顶部标题）
    container.scrollTop = container.scrollHeight;
    updateActionCard(card, action.status || {}, action);
    // v0.76: 如果 tool 返回了 _action（如 enter_project），执行前端动作
    if (action._action && action._action.enterProject) {
      setTimeout(function() {
        if (typeof enterProject === 'function') {
          enterProject({ id: action._action.enterProject, name: action._action.enterProject.replace('proj_', '') });
        }
      }, 800);
    }
    // v0.79: 处理 _action: 'enter_project'（create_project / create_requirement 返回）
    if (action._action === 'enter_project' && action._actionArg) {
      setTimeout(function() {
        var projId = action._actionArg.projectId;
        var projName = action._actionArg.projectName || projId.replace('proj_', '');
        var openView = action._actionArg.openView;
        if (typeof enterProject === 'function') {
          enterProject({ id: projId, name: projName });
          // 如果需要打开特定视图，延迟后再打开
          if (openView) {
            setTimeout(function() {
              if (window.ACMSWin && ACMSWin.open) {
                ACMSWin.open(openView);
              }
            }, 500);
          }
        }
      }, 800);
    }
    // v0.94 (P5): 处理 _action.officeV3（Office V3 文档编辑：Word/PPT/Excel）
    if (action._action && action._action.officeV3) {
      setTimeout(function() { runOfficeV3Action(action._action.officeV3, action.requirementId); }, 600);
    }
    startActionPolling(action.requirementId);
  }

  // v0.94 (P5): 执行 Office V3 编辑动作并渲染结果卡（auto-applied + [撤销]）
  //   oa 两种形态：
  //   1) 意图模式 { kind, instruction }（server 路由产出，参数需前端组装文档摘要后调生成器）
  //   2) 精确模式 { kind, op, blockIdx/newText/operations }（生成器或外部调用产出，直接执行）
  function runOfficeV3Action(oa, requirementId) {
    if (typeof window.OfficeV3 === 'undefined' || !window.OfficeV3.runAction) {
      showOfficeV3Result('❌ Office V3 未加载（请刷新后重试）', null, requirementId);
      return;
    }
    if (oa && oa.instruction) {
      // 意图模式：组装当前文档摘要 → /api/agent-buddy/office-action 生成精确参数 → 执行
      var ctx = buildOfficeDocContext(oa.kind);
      if (!ctx) {
        showOfficeV3Result('❌ 没有打开的 ' + officeKindName(oa.kind) + ' 文档，请先在 Office 中打开要编辑的文件', null, requirementId);
        return;
      }
      showOfficeV3Result('⏳ 小吉正在委托 Word专家…', null, requirementId);
      // v0.97: 通过 Agent Registry 委托给 Word 专家
      fetch('/api/agents/agent-xiaoji/call', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          toAgentId: ctx.kind === 'word' ? 'agent-word-expert' : 'agent-general',
          instruction: oa.instruction,
          context: { docContext: ctx.doc }
        })
      })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (!data || !data.ok || !data.result || !data.result.action) {
            showOfficeV3Result('❌ ' + ((data && data.error) || '生成编辑动作失败'), null, requirementId);
            return;
          }
          var action = data.result.action;
          try {
            Promise.resolve(window.OfficeV3.runAction(action)).then(function (res) {
              if (res && res.ok) {
                showOfficeV3Result('✅ ' + (res.summary || '已应用'), res, requirementId);
              } else {
                showOfficeV3Result('❌ ' + ((res && res.error) || '执行失败'), null, requirementId);
              }
            }).catch(function (err2) {
              showOfficeV3Result('❌ ' + err2.message, null, requirementId);
            });
          } catch (err) {
            showOfficeV3Result('❌ ' + err.message, null, requirementId);
          }
        })
        .catch(function(err) {
          showOfficeV3Result('❌ ' + err.message, null, requirementId);
        });
      return;
    }
    // 精确模式：直接执行
    try {
      var res2 = window.OfficeV3.runAction(oa || {});
      if (res2 && res2.ok) {
        showOfficeV3Result('✅ ' + (res2.summary || '已应用'), res2, requirementId);
      } else {
        showOfficeV3Result('❌ ' + ((res2 && res2.error) || '执行失败'), null, requirementId);
      }
    } catch (err) {
      showOfficeV3Result('❌ ' + err.message, null, requirementId);
    }
  }

  // 组装当前打开的 OfficeV3 文档摘要（供生成器 LLM 定位编辑目标）
  // 返回 { kind, doc }；kind 为实际找到的实例类型（可能不同于请求 kind，用于兜底）
  function buildOfficeDocContext(kind) {
    var targetKind = kind;
    var st = window.OfficeV3.getState && window.OfficeV3.getState();
    var instances = (st && st.instances) || {};
    var keys = Object.keys(instances);
    if (kind === 'xlsx') {
      // GenOffice sheets-ui 优先（iframe 内 __sheetsDebug.snapshot 读打开时解析的 cells）
      var st2 = window.OfficeV3.getState && window.OfficeV3.getState();
      var insts2 = (st2 && st2.instances) || {};
      var k2 = Object.keys(insts2);
      for (var j2 = 0; j2 < k2.length; j2++) {
        var ed2 = insts2[k2[j2]].editor;
        if (ed2 && ed2.kind === 'sheets-ui' && ed2.iframe && ed2.iframe.contentWindow) {
          var sWin = ed2.iframe.contentWindow;
          if (sWin.__sheetsDebug && typeof sWin.__sheetsDebug.snapshot === 'function') {
            var sids = sWin.__sheetsDebug.listSessions();
            if (sids && sids.length) {
              var snap = sWin.__sheetsDebug.snapshot(sids[0], 5, 12, 10);
              if (snap && snap.sheets && snap.sheets.length) {
                return { kind: 'xlsx', doc: { sheets: snap.sheets } };
              }
            }
          }
        }
      }
      if (typeof window.XlsxAI !== 'undefined' && window.XlsxAI.getSnapshot) {
        var snap = window.XlsxAI.getSnapshot();
        if (snap && snap.sheets && snap.sheets.length) {
          var sheets = snap.sheets.slice(0, 5).map(function(s) {
            var rows = [];
            for (var r = 1; r <= 12; r++) {
              var row = [];
              for (var c = 0; c < 10; c++) {
                var addr = String.fromCharCode(65 + c) + r;
                var cell = s.cells[addr];
                row.push(cell ? (cell.v != null ? cell.v : (cell.f || '')) : '');
              }
              rows.push(row);
            }
            return { id: s.id, name: s.name, rows: rows };
          });
          return { kind: 'xlsx', doc: { sheets: sheets } };
        }
      }
    }
    // word / slides：优先指定 kind，找不到则用任意已打开文档兜底
    var ed = null;
    for (var i = 0; i < keys.length; i++) {
      var e = instances[keys[i]].editor;
      if (e && (e.kind === targetKind || (targetKind === 'word' && e.kind === 'word-ui'))) { ed = e; break; }
    }
    if (!ed) {
      for (var j = 0; j < keys.length; j++) {
        var e2 = instances[keys[j]].editor;
        if (e2 && (e2.kind === 'word' || e2.kind === 'word-ui' || e2.kind === 'slides' || e2.kind === 'xlsx')) { ed = e2; break; }
      }
    }
    if (!ed) return null;
    if (ed.kind === 'word') {
      var blocks = (ed.parsed && ed.parsed.blocks || []).slice(0, 40).map(function(b, idx) {
        return { i: idx, text: (b.runs || []).map(function(r) { return r.text || ''; }).join('') };
      });
      return { kind: 'word', doc: { blocks: blocks } };
    }
    // P132: GenOffice Word UI（iframe 内 Tiptap）——摘要从 Tiptap doc 收集
    if (ed.kind === 'word-ui' && ed.iframe) {
      try {
        var gwin = ed.iframe.contentWindow;
        var gdoc = gwin && gwin.document ? gwin.document.querySelector('[contenteditable="true"]') : null;
        var gedit = gdoc && gdoc.editor;
        if (gedit) {
          var gblocks = [];
          // v0.96.8: 选区支持——读编辑器 selection，标注选中的 block
          var gsel = gedit.state.selection;
          var gFrom = gsel && !gsel.empty ? gsel.from : -1;
          var gTo = gsel && !gsel.empty ? gsel.to : -1;
          gedit.state.doc.content.forEach(function (node, nodeOffset) {
            var n = node.type.name;
            if (n === 'docParagraph' || n === 'docHeading' || n === 'docListItem') {
              var b = { i: gblocks.length, text: node.textContent.slice(0, 200), type: n };
              var attrs = node.attrs || {};
              if (n === 'docHeading') b.level = attrs.level != null ? attrs.level : 1;
              if (n === 'docListItem') b.kind = attrs.kind || 'bullet';
              if (attrs.align) b.align = attrs.align;
              if (attrs.indentFirstLine) b.indentFirstLine = attrs.indentFirstLine;
              // 段内 marks 聚合（整段是否有加粗/斜体/下划线/删除线）
              var hasM = { bold: false, italic: false, underline: false, strike: false };
              var gTextStyle = null;
              node.content && node.content.forEach(function (tn) {
                if (!tn.marks) return;
                tn.marks.forEach(function (m) {
                  var mn = m.type && m.type.name;
                  if (mn === 'bold') hasM.bold = true;
                  else if (mn === 'italic') hasM.italic = true;
                  else if (mn === 'underline') hasM.underline = true;
                  else if (mn === 'strike') hasM.strike = true;
                  else if (mn === 'docTextStyle') {
                    // v0.96.9: docTextStyle 聚合（字号/颜色/字体/高亮）——排版指令需要感知
                    var gta = m.attrs || {};
                    gTextStyle = gTextStyle || {};
                    if (gta.sizeHalfPoints != null) gTextStyle.sizeHalfPoints = gta.sizeHalfPoints;
                    if (gta.color) gTextStyle.color = gta.color;
                    if (gta.font) gTextStyle.font = gta.font;
                    if (gta.highlight) gTextStyle.highlight = gta.highlight;
                  }
                });
              });
              if (hasM.bold || hasM.italic || hasM.underline || hasM.strike) b.marks = hasM;
              if (gTextStyle) b.textStyle = gTextStyle;
              // 选区覆盖检测：block [offset, offset+nodeSize] 与选区 [from,to] 有交集即选中
              if (gFrom >= 0 && gTo > gFrom) {
                var gEnd = nodeOffset + node.nodeSize;
                if (gEnd > gFrom && nodeOffset < gTo) b.selected = true;
              }
              gblocks.push(b);
            }
          });
          // v0.96.9: 选中文字原文（精确字符级）
          var gSelText = '';
          if (gFrom >= 0 && gTo > gFrom) {
            try { gSelText = gedit.state.doc.textBetween(gFrom, gTo, '\n'); } catch (e) { /* ignore */ }
          }
          var gdoc = { blocks: gblocks.slice(0, 40) };
          if (gSelText) gdoc.selectionText = gSelText.slice(0, 500);
          if (gblocks.length) return { kind: 'word', doc: gdoc };
        }
      } catch (e) {
        console.warn('[agent-buddy] GenOffice word 摘要失败:', e.message);
      }
    }
    if (ed.kind === 'slides' && ed.opened && ed.opened.deck) {
      var slide = ed.opened.deck.slides[ed.slideIdx] || {};
      var els = (slide.elements || []).filter(function(el) { return el.text; });
      var texts = els.slice(0, 20).map(function(el, idx) {
        return { i: idx, text: (el.text.paragraphs || []).map(function(p) {
          return (p.runs || []).map(function(r) { return r.text || ''; }).join('');
        }).join('\n') };
      });
      return { kind: 'slides', doc: { slideIdx: ed.slideIdx, texts: texts } };
    }
    if (ed.kind === 'xlsx' && typeof window.XlsxAI !== 'undefined' && window.XlsxAI.getSnapshot) {
      var snap2 = window.XlsxAI.getSnapshot();
      if (snap2 && snap2.sheets && snap2.sheets.length) {
        var sheets2 = snap2.sheets.slice(0, 5).map(function(s) {
          var rows = [];
          for (var r = 1; r <= 12; r++) {
            var row = [];
            for (var c = 0; c < 10; c++) {
              var addr = String.fromCharCode(65 + c) + r;
              var cell = s.cells[addr];
              row.push(cell ? (cell.v != null ? cell.v : (cell.f || '')) : '');
            }
            rows.push(row);
          }
          return { id: s.id, name: s.name, rows: rows };
        });
        return { kind: 'xlsx', doc: { sheets: sheets2 } };
      }
    }
    return null;
  }

  function officeKindName(kind) {
    return kind === 'xlsx' ? 'Excel' : kind === 'slides' ? 'PPT' : 'Word';
  }

  function showOfficeV3Result(text, res, requirementId) {
    var container = document.querySelector('#ap-messages');
    if (!container) return;
    // 同 requirementId 复用同一张卡（⏳ 分析中 → ✅ 结果 原位更新，不叠卡）
    var div = null;
    if (requirementId) {
      div = container.querySelector('.ap-office-result[data-requirement-id="' + requirementId + '"]');
    }
    if (!div) {
      div = document.createElement('div');
      div.className = 'ap-action-card ap-office-result';
      div.dataset.requirementId = requirementId || '';
      container.appendChild(div);
    }
    var undoBtn = (res && typeof res.undo === 'function')
      ? '<button class="ap-btn ap-office-undo">↩ 撤销</button>' : '';
    div.innerHTML = '<div class="ap-office-result-head">📄 Office V3</div>'
      + '<div class="ap-office-result-body">' + escHtml(text) + '</div>'
      + (undoBtn ? '<div class="ap-office-result-actions">' + undoBtn + '</div>' : '');
    container.scrollTop = container.scrollHeight;
    var btn = div.querySelector('.ap-office-undo');
    if (btn) btn.addEventListener('click', function () {
      var r;
      try { r = res.undo(); } catch (e) { r = { ok: false, error: e.message }; }
      var body = div.querySelector('.ap-office-result-body');
      if (body) body.textContent = (r && r.ok) ? '↩ 已撤销' : ('↩ ' + ((r && r.error) || '撤销失败'));
      btn.disabled = true;
    });
  }

  function actionStatusMeta(status) {
    var map = {
      pending: ['○', '等待'], running: ['◌', '执行中'], done: ['✓', '完成'],
      failed: ['!', '失败'], skipped: ['–', '跳过'], sending: ['◌', '发送中']
    };
    return map[status] || ['○', status || '等待'];
  }

function imagePreviewUrl(requirementId, state) {
    var img = state && state.assistImage;
    if (!img || img.status !== 'done') return '';
    var planSteps = state.plan && state.plan.steps || [];
    var imageStep = planSteps.find(function(s) { return s.tool === 'generate_image' && s.result; });
    var fileIds = imageStep && imageStep.result && imageStep.result.file_ids || [];
    var first = fileIds[0];
    var fid = typeof first === 'string' ? first : first && first.id;
    if (fid) return '/api/chat/upload/' + encodeURIComponent(fid) + '/raw';
    // v0.73: 优先用本地 workspace_path（含 projectSlug 前缀，解决 CDN CORS 问题）
    var localPath = img.workspace_path || (img.options && img.options[0] && img.options[0].workspace_path) || '';
    // v0.101 diag: 记录实际走的分支 + 实际请求 URL（排查 404 / plan_step 路径无前缀）
    console.log('[image:url-resolved]', {
      reqId: requirementId,
      assistImage_status: img.status,
      has_imageStep: !!imageStep,
      imageStep_asset_path: imageStep && imageStep.result && imageStep.result.asset_path,
      workspace_path: img.workspace_path,
      options0_workspace_path: img.options && img.options[0] && img.options[0].workspace_path,
      resolved_localPath: localPath,
      final_url: localPath ? '/api/files/asset?path=' + encodeURIComponent(localPath) : (img.image_url_output || '(cdn-fallback)')
    });
    if (localPath) return '/api/files/asset?path=' + encodeURIComponent(localPath);
    return img.image_url_output || (img.options && img.options[0] && img.options[0].image_url_output) || '';
  }

  // v0.75: 从 plan steps 中收集所有 generate_image step 的图片 URL（多图场景）
  function stepImageUrls(state) {
    var planSteps = state.plan && state.plan.steps || [];
    var urls = [];
    planSteps.forEach(function(step) {
      if (step.tool !== 'generate_image' || step.status !== 'done') return;
      var r = step.result;
      if (!r) return;
      // 优先 file_ids
      if (Array.isArray(r.file_ids) && r.file_ids.length > 0) {
        var fid = r.file_ids[0];
        var id = typeof fid === 'string' ? fid : fid && fid.id;
        if (id) { urls.push('/api/chat/upload/' + encodeURIComponent(id) + '/raw'); return; }
      }
      // asset_path（CORS-safe）
      if (r.asset_path) { urls.push('/api/files/asset?path=' + encodeURIComponent(r.asset_path)); return; }
      // CDN URL fallback
      if (r.image_url_output) { urls.push(r.image_url_output); return; }
    });
    return urls;
  }

function isNonPlanTerminal(state) {
  var plan = state && state.plan;
  if (plan && Array.isArray(plan.steps) && plan.steps.length > 0) {
    return ['done', 'failed', 'partial_failed'].indexOf(plan.status) >= 0;
  }
    var img = state && state.assistImage;
    var imgSearch = state && state.assistImageSearch;
    var music = state && state.assistMusic;
    var email = state && state.assistEmail;
    var video = state && state.assistVideo;
    // v0.113 fix: 异步任务进行中（generating/running/pending）→ 不是终态，
    //   即使 planStatus='done'（fire-forget 工具先写 done，结果 10-60s 后才到）。
    //   之前 planStatus 短路在最前 → 图片生成中就被判终态 → 轮询提前停 → 图片卡片永不更新。
    if (img && ['generating', 'running', 'pending'].indexOf(img.status) >= 0) return false;
    if (music && ['generating', 'running', 'pending'].indexOf(music.status) >= 0) return false;
    if (email && ['sending', 'pending'].indexOf(email.status) >= 0) return false;
    // v0.113b: video 状态机含 queued（任务创建后 60-300s 才完成）——漏了它又会被 planStatus 短路判终态
    if (video && ['queued', 'generating', 'running', 'pending', 'processing', 'rendering'].indexOf(video.status) >= 0) return false;
    // 最后才认 planStatus（信息型 single_action 如 fetch_url，无 assist_* 字段）
    if (state && state.planStatus === 'done') return true;
    return (img && ['done', 'failed'].indexOf(img.status) >= 0)
        || (imgSearch && Array.isArray(imgSearch.images) && imgSearch.images.length > 0)
        || (music && ['done', 'failed'].indexOf(music.status) >= 0)
        || (email && ['done', 'failed'].indexOf(email.status) >= 0)
        || (video && ['done', 'failed'].indexOf(video.status) >= 0);
  }

  function updateActionCard(card, state, action) {
    if (!card) return;
    var plan = state.plan || {};
    var steps = Array.isArray(plan.steps) ? plan.steps : [];
    var mode = action && action.mode || 'conversational_action';
    var summary = plan.summary
      // v1.0 (Phase 9): 终态时 summary 显示"✅ 已完成"（治 single_action 卡片一直显示"小吉正在执行"）
      || (isNonPlanTerminal(state) ? '✅ 动作已完成' : (mode === 'conversational_action' ? '小吉正在连续执行' : '小吉正在执行'));

    // 无 plan steps 时，检查 assistImage / assistImageSearch / assistMusic / assistEmail 独立状态（single_action 模式）
    var img = state && state.assistImage;
    var imgSearch = state && state.assistImageSearch;
    var music = state && state.assistMusic;
    var email = state && state.assistEmail;
    var video = state && state.assistVideo;
    var stepsHtml;
    if (steps.length) {
      stepsHtml = steps.map(function(step) {
        var meta = actionStatusMeta(step.status);
        var label = step.tool === 'generate_image' ? '生成图片'
          : step.tool === 'send_email' ? '准备邮件'
          : step.tool === 'document_gen' ? '生成文档'
          : step.tool === 'web_research' || step.tool === 'web_search' ? '搜索资料'
          : step.tool;
        return '<div class="ap-action-step ap-step-' + escHtml(step.status || 'pending') + '">'
          + '<span class="ap-action-step-icon">' + meta[0] + '</span>'
          + '<span class="ap-action-step-label">' + escHtml(label || '步骤') + '</span>'
          + '<span class="ap-action-step-state">' + escHtml(meta[1]) + '</span></div>';
      }).join('');
    } else if (img && img.status === 'done') {
      stepsHtml = '<div class="ap-action-step ap-step-done">'
        + '<span class="ap-action-step-icon">✓</span>'
        + '<span class="ap-action-step-label">生成图片</span>'
        + '<span class="ap-action-step-state">完成</span></div>';
    } else if (img && img.status === 'failed') {
      console.log('[AC-DEBUG] 图片生成失败:', img.error);
      stepsHtml = '<div class="ap-action-step ap-step-failed">'
        + '<span class="ap-action-step-icon">!</span>'
        + '<span class="ap-action-step-label">生成图片</span>'
        + '<span class="ap-action-step-state">失败：' + escHtml(img.error || '未知错误') + '</span></div>';
      // 失败时加大号错误提示，不让用户空等
      stepsHtml += '<div class="ap-action-result ap-result-failed" style="margin-top:6px;padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;color:#b91c1c;font-size:12px;line-height:1.5">'
        + '⚠️ ' + escHtml(img.error || '图片生成失败，请重试') + '</div>';
    } else if (img && (img.status === 'generating' || img.status === 'running' || img.status === 'pending')) {
      stepsHtml = '<div class="ap-action-step ap-step-running">'
        + '<span class="ap-action-step-icon">◌</span>'
        + '<span class="ap-action-step-label">生成图片</span>'
        + '<span class="ap-action-step-state">生成中…</span></div>';
    } else if (music && music.status === 'done') {
      stepsHtml = '<div class="ap-action-step ap-step-done">'
        + '<span class="ap-action-step-icon">✓</span>'
        + '<span class="ap-action-step-label">找歌</span>'
        + '<span class="ap-action-step-state">完成</span></div>';
    } else if (music && music.status === 'failed') {
      stepsHtml = '<div class="ap-action-step ap-step-failed">'
        + '<span class="ap-action-step-icon">!</span>'
        + '<span class="ap-action-step-label">找歌</span>'
        + '<span class="ap-action-step-state">失败：' + escHtml(music.error || '未找到') + '</span></div>';
    } else if (music && (music.status === 'generating' || music.status === 'running' || music.status === 'pending')) {
      stepsHtml = '<div class="ap-action-step ap-step-running">'
        + '<span class="ap-action-step-icon">◌</span>'
        + '<span class="ap-action-step-label">找歌</span>'
        + '<span class="ap-action-step-state">搜索中…</span></div>';
    } else {
      // v1.0 (Phase 9): 区分终态与非终态 — 治 single_action (web_search/热点新闻) 卡片永远显示"正在准备动作…"
      //   根因: planStatus='done' 但 plan={} 无 steps → 走 else → 无条件"正在准备动作…"
      //   修复: planStatus='done' 或 plan.status='done' 时显示"✅ 已完成"
      var _doneNoSteps = (state && state.planStatus === 'done')
        || (state && state.plan && state.plan.status === 'done');
      stepsHtml = _doneNoSteps
        ? '<div class="ap-action-step ap-step-done"><span class="ap-action-step-icon">✓</span><span class="ap-action-step-label">动作</span><span class="ap-action-step-state">已完成</span></div>'
        : '<div class="ap-action-empty">正在准备动作…</div>';
    }

    var planSteps = (state.plan && state.plan.steps || []);
    var genImgSteps = planSteps.filter(function(s) { return s.tool === 'generate_image' && s.status === 'done'; });
    var imageHtml = '';
    if (genImgSteps.length > 1) {
      // v0.75: 多图场景 — 从 plan steps 取每一张图
      var imgUrls = stepImageUrls(state);
      imageHtml = '<div class="ap-action-imggrid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px">'
        + imgUrls.map(function(url) {
            return '<div class="ap-action-imgitem" style="display:inline-block"><img src="' + escHtml(url) + '" alt="生成图片" draggable="true" data-imgurl="' + escHtml(url) + '" style="width:100%;max-height:180px;object-fit:cover;border-radius:6px;border:1px solid var(--border,rgba(0,0,0,.08))"></div>';
          }).join('')
        + '</div>';
    } else {
      var imageUrl = imagePreviewUrl(card.dataset.requirementId, state);
      imageHtml = imageUrl ? '<img class="ap-action-image" src="' + escHtml(imageUrl) + '" alt="生成图片" draggable="true" data-imgurl="' + escHtml(imageUrl) + '">' : '';
    }
    var musicHtml = '';
    if (music && music.status === 'done') {
      var musicCard = {
        type: 'music_card',
        song: music.song || '',
        artist: music.artist || '',
        playable: (music.playable_sources || []).filter(function(s) { return s && s.url; }),
        platforms: (music.sources || []).map(function(s) {
          return { name: s.platform || '', icon: s.icon || '\ud83d\udd17', url: s.url || '' };
        }),
      };
      var renderFn = window.renderMusicBubble;
      if (typeof renderFn === 'function') {
        musicHtml = '<div class="ap-music-result">' + renderFn(JSON.stringify(musicCard)) + '</div>';
      } else {
        // fallback: simple links
        musicHtml = '<div class="ap-action-sources">'
          + (music.sources || []).map(function(s) {
              return '<a class="ap-action-source" href="' + escHtml(s.url || '#') + '" target="_blank" rel="noopener">'
                + (s.icon || '\ud83d\udd17') + ' ' + escHtml(s.platform || '平台') + '</a>';
            }).join('')
          + '</div>';
      }
    }
    
    var imgSearchHtml = '';
    if (imgSearch && Array.isArray(imgSearch.images) && imgSearch.images.length > 0) {
      imgSearchHtml = '<div class="ap-action-imggrid">'
        + imgSearch.images.map(function(img) {
            var thumb = escHtml(img.thumb || img.url || '');
            var link = escHtml(img.url || img.thumb || '');
            var title = escHtml(img.title || '');
            return '<a class="ap-action-imgitem" href="' + link + '" target="_blank" rel="noopener" title="' + title + '">'
              + '<img src="' + thumb + '" alt="' + title + '" loading="lazy" draggable="true" data-imgurl="' + thumb + '"></a>';
          }).join('')
        + '</div>';
    }

    // v0.79: 工具调用详情摘要
    var toolSummaryHtml = '';
    if (steps.length > 0) {
      var toolDetails = steps.map(function(step) {
        var statusIcon = step.status === 'done' ? '✓' : (step.status === 'failed' ? '✗' : '◌');
        var toolName = step.tool || 'unknown';
        var resultSummary = '';
        if (step.result) {
          var r = step.result;
          if (r.asset_path) resultSummary = '→ ' + r.asset_path.split('/').pop();
          else if (r.file_ids && r.file_ids.length > 0) resultSummary = '→ ' + r.file_ids.length + ' 个文件';
          else if (r.url) resultSummary = '→ ' + r.url.slice(0, 40) + (r.url.length > 40 ? '...' : '');
          else resultSummary = '→ ok';
        }
        return '<div class="ap-tool-detail">'
          + '<span class="ap-tool-status">' + statusIcon + '</span>'
          + '<span class="ap-tool-name">' + escHtml(toolName) + '</span>'
          + '<span class="ap-tool-result">' + escHtml(resultSummary) + '</span>'
          + '</div>';
      }).join('');
      toolSummaryHtml = '<div class="ap-tool-summary">' + toolDetails + '</div>';
    }

    var pending = state.pendingEmail;
    var emailHtml = '';
    if (pending) {
      var attachments = Array.isArray(pending.attachments) ? pending.attachments : [];
      emailHtml = '<div class="ap-action-email">'
        + '<div><b>📧 待发送邮件</b></div>'
        + '<div class="ap-action-email-line">收件人：' + escHtml(pending.to || '待补充') + '</div>'
        + '<div class="ap-action-email-line">主题：' + escHtml(pending.subject || '待补充') + '</div>'
        + (attachments.length ? '<div class="ap-action-email-line">附件：' + attachments.length + ' 个</div>' : '')
        + '<button class="ap-action-send" data-action="send-email">确认发送</button>'
        + '</div>';
    } else if (email && email.status === 'done') {
      emailHtml = '<div class="ap-action-result ap-result-done">✓ 邮件已发送到 ' + escHtml(email.to || '') + '</div>';
    } else if (email && email.status === 'failed') {
      emailHtml = '<div class="ap-action-result ap-result-failed">! 邮件发送失败：' + escHtml(email.error || '未知错误') + '</div>';
    }

    // video: 视频生成卡片
    var videoHtml = '';
    if (video) {
      if (video.status === 'done' && video.video_url) {
        videoHtml = '<div class="ap-action-video">'
          + '<video controls style="width:100%;max-width:360px;border-radius:6px;margin:4px 0;background:#000" src="' + escHtml(video.video_url) + '"></video>'
          + '<div style="margin-top:4px"><a href="' + escHtml(video.video_url) + '" target="_blank" rel="noopener" style="font-size:12px;color:var(--primary,#3b82f6)">🔗 打开原视频</a></div>'
          + '</div>';
      } else if (video.status === 'failed') {
        videoHtml = '<div class="ap-action-result ap-result-failed">! 视频生成失败：' + escHtml(video.error || '未知错误') + '</div>';
      } else if (video.status === 'done' && !video.video_url) {
        videoHtml = '<div class="ap-action-step ap-step-running">'
          + '<span class="ap-action-step-icon">◌</span>'
          + '<span class="ap-action-step-label">生成视频</span>'
          + '<span class="ap-action-step-state">生成中…（预计 60-300 秒）</span>'
          + '</div>';
      } else {
        videoHtml = '<div class="ap-action-step ap-step-pending">'
          + '<span class="ap-action-step-icon">○</span>'
          + '<span class="ap-action-step-label">生成视频</span>'
          + '<span class="ap-action-step-state">等待中…</span>'
          + '</div>';
      }
    }

    var terminal = ['done', 'failed'].indexOf(plan.status) >= 0
      || isNonPlanTerminal(state);

    // v0.79: 进度条
    var progressHtml = '';
    if (steps.length > 0) {
      var doneCount = steps.filter(function(s) { return s.status === 'done'; }).length;
      var failCount = steps.filter(function(s) { return s.status === 'failed'; }).length;
      var total = steps.length;
      var pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
      var statusText = failCount > 0 ? '部分失败 (' + failCount + ')' : (doneCount === total ? '完成' : '进行中');
      progressHtml = '<div class="ap-action-progress">'
        + '<div class="ap-action-progress-bar" style="width:' + pct + '%"></div>'
        + '<div class="ap-action-progress-info">' + doneCount + '/' + total + ' 步骤完成 · ' + statusText + '</div>'
        + '</div>';
    }

    card.innerHTML = '<div class="ap-action-head"><span>⚡</span><b>' + escHtml(summary) + '</b>'
      + '<span class="ap-action-mode">' + escHtml(mode) + '</span></div>'
      + progressHtml
      + '<div class="ap-action-steps">' + stepsHtml + '</div>' + imageHtml + musicHtml + imgSearchHtml + emailHtml + videoHtml
      + '<button class="ap-action-trace" data-action="toggle-trace">▼ 查看执行详情</button>'
      + toolSummaryHtml
      + '<div class="ap-action-trace-body" hidden>' + escHtml(JSON.stringify({ planStatus: state.planStatus, plan: plan, assistImage: img, assistMusic: music, assistEmail: email, assistVideo: video }, null, 2)) + '</div>';
    // 🆕 修复（2026-08-23）：根据 plan 整体状态给 card 加 status class（让 CSS border-left 色生效）
    var allDone = steps.length > 0 && steps.every(function(s) { return s.status === 'done' || s.status === 'skipped'; });
    var anyFailed = steps.some(function(s) { return s.status === 'failed'; });
    card.classList.remove('is-running', 'is-done', 'is-failed');
    if (anyFailed) card.classList.add('is-failed');
    else if (allDone) card.classList.add('is-done');
    else if (steps.length > 0) card.classList.add('is-running');
    // v0.112 fix: updateActionCard 内容更新后也滚到底（进度条更新 / 音乐完成 / 图片完成时让最新结果可见）
    // v0.101.1 fix: container 未定义 bug —— v0.112 把滚动语句插在 innerHTML 拼接链中间，
    //   导致 ①ReferenceError: container is not defined（updateActionCard 无此局部变量）
    //   ②trace-body 被切出拼接链，执行详情按钮点开为空。
    //   修复：滚动移到拼接链之后，用 card.closest 安全获取容器（兼容浮窗/主窗口双上下文 P88）。
    var scrollContainer = card.closest('#ap-messages') || document.querySelector('#ap-messages');
    if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;

    var sendBtn = card.querySelector('[data-action="send-email"]');
    if (sendBtn) sendBtn.onclick = function(e) { e.stopPropagation(); sendActionEmail(card.dataset.requirementId, card, sendBtn); };
    var traceBtn = card.querySelector('[data-action="toggle-trace"]');
    if (traceBtn) traceBtn.onclick = function(e) {
      e.stopPropagation();
      var body = card.querySelector('.ap-action-trace-body');
      body.hidden = !body.hidden;
      traceBtn.textContent = body.hidden ? '▼ 查看执行详情' : '▲ 收起执行详情';
    };

    // v0.79: 根据行动状态自动设置表情
    updateFaceForAction(state, plan);

    if (terminal && _actionPollers[card.dataset.requirementId]) {
      clearInterval(_actionPollers[card.dataset.requirementId]);
      delete _actionPollers[card.dataset.requirementId];
    }
  }

  function startActionPolling(requirementId) {
    if (_actionPollers[requirementId]) return;
    var attempts = 0;
    _actionPollers[requirementId] = setInterval(function() {
      attempts++;
      fetch('/api/agent-buddy/action/' + encodeURIComponent(requirementId), { headers: getAuthHeaders() })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var card = document.getElementById('ap-action-' + requirementId);
          if (card && data && data.state) updateActionCard(card, data.state, { mode: card.dataset.mode || 'conversational_action' });
          if (card && data && data.state && (data.state.planStatus === 'done' || isNonPlanTerminal(data.state))) {
            // v0.73: planStatus='done' 时图片可能还在后台生成，必须等到真正终态才停轮询
            if (!isNonPlanTerminal(data.state)) return;
            clearInterval(_actionPollers[requirementId]);
            delete _actionPollers[requirementId];
          }
        })
        .catch(function() {});
      if (attempts >= 150) {
        clearInterval(_actionPollers[requirementId]);
        delete _actionPollers[requirementId];
      }
    }, 2000);
  }

  function sendActionEmail(requirementId, card, button) {
    button.disabled = true;
    button.textContent = '发送中…';
    setFace('working');  // v0.79: 发送邮件时设置表情
    fetch('/api/agent-buddy/action/' + encodeURIComponent(requirementId) + '/send-email', {
      method: 'POST', headers: getAuthHeaders(), body: '{}'
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data && data.state) updateActionCard(card, data.state, { mode: 'conversational_action' });
      if (!data || !data.ok) throw new Error(data && (data.message || data.error) || '发送失败');
      setFace('success');  // v0.79: 发送成功
    }).catch(function(e) {
      button.disabled = false;
      button.textContent = '重试发送';
      renderMessage('邮件没有发出去：' + e.message);
      setFace('error');  // v0.79: 发送失败
    });
  }

  // v0.79: 根据行动状态自动设置表情
  function updateFaceForAction(state, plan) {
    if (!state || !plan) return;
    var steps = Array.isArray(plan.steps) ? plan.steps : [];
    var hasRunning = steps.some(function(s) { return s.status === 'running' || s.status === 'pending'; });
    var hasFailed = steps.some(function(s) { return s.status === 'failed'; });
    var allDone = steps.length > 0 && steps.every(function(s) { return s.status === 'done'; });
    var planStatus = state.planStatus;

    if (hasFailed) {
      setFace('error');
    } else if (allDone && planStatus === 'done') {
      setFace('celebrate');
    } else if (hasRunning) {
      // 根据当前执行的工具类型设置表情
      var currentStep = steps.find(function(s) { return s.status === 'running'; });
      if (currentStep) {
        var tool = currentStep.tool || '';
        if (tool.indexOf('search') >= 0 || tool.indexOf('web_') >= 0) {
          setFace('searching');
        } else if (tool.indexOf('generate') >= 0 || tool.indexOf('image') >= 0) {
          setFace('creating');
        } else {
          setFace('working');
        }
      } else {
        setFace('working');
      }
    } else if (planStatus === 'done') {
      setFace('success');
    }
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

  // v0.96/0.114m: 操作日志条 — 展示小吉后台执行的工具调用
  // v0.114n: 日志插到流式回复气泡之前（工具先执行 → 先显示日志，回复后到），
  //   按实际时间自然顺序排列；不再 append 到末尾（否则日志在回复下面很别扭）
  var _opLogEntries = [];
  function renderOpLog(msg) {
    var container = document.querySelector('#ap-messages');
    if (!container) return;
    // 移除旧的 thinking 占位（如果有）
    var thinkEl = document.getElementById('ap-msg-thinking');
    if (thinkEl) thinkEl.remove();
    // 去重：相同消息不重复追加
    var last = _opLogEntries[_opLogEntries.length - 1];
    if (last === msg) return;
    _opLogEntries.push(msg);
    var div = document.createElement('div');
    div.className = 'ap-op-log';
    div.innerHTML = '<span style="opacity:.75">🔧</span> ' + escHtml(msg);
    // 插入位置：流式气泡之前（自然顺序：日志在回复上边）；
    //   气泡未创建时 append（此时没有回复，日志就是当前最新内容）
    var streamBubble = document.getElementById('ap-stream-bubble');
    if (streamBubble && streamBubble.parentNode === container) {
      container.insertBefore(div, streamBubble);
    } else {
      container.appendChild(div);
    }
    container.scrollTop = container.scrollHeight;
  }

  // v0.114l: 清空操作日志（下一轮消息发送前调用）
  function clearOpLogs() {
    _opLogEntries = [];
    var els = document.querySelectorAll('.ap-op-log');
    els.forEach(function(el) { el.remove(); });
  }

  // ── 对话记忆 ──

  function saveChatMemory(userMsg, buddyReply) {
    // v0.79: 拒绝空消息 — 否则会污染 history 导致上游 API 报 "No user query found in messages"
    var u = (userMsg == null ? '' : String(userMsg));
    var b = (buddyReply == null ? '' : String(buddyReply));
    if (!u.trim() && !b.trim()) return;

    var mem = _userMemory.chatMemory || [];
    if (u.trim()) mem.push({ role: 'user', text: u.slice(0, 200) });
    if (b.trim()) mem.push({ role: 'buddy', text: b.slice(0, 200) });
    if (mem.length > 10) mem.splice(0, mem.length - 10);
    _userMemory.chatMemory = mem;
    saveMemory();

    // v0.79: 同步到服务端（fire-and-forget）
    syncChatToServer(userMsg, buddyReply);

    // 每 4 轮对话（8 条消息）触发一次性格总结
    if (mem.length >= 8 && mem.length % 8 < 2) {
      updatePersonality();
    }
  }

  // v0.79: 同步聊天到服务端
  function syncChatToServer(userMsg, buddyReply) {
    try {
      var headers = getAuthHeaders();
      headers['Content-Type'] = 'application/json';
      // v0.79: 拒绝空消息 — 否则会污染 history 导致上游 API 报 "No user query found in messages"
      var u = userMsg == null ? '' : String(userMsg);
      var b = buddyReply == null ? '' : String(buddyReply);
      if (u.trim()) {
        fetch('/api/agent-buddy/chat-history', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ role: 'user', text: u }),
        }).catch(function() {});
      }
      if (b.trim()) {
        // 发送小吉回复（延迟一点，避免并发问题）
        setTimeout(function() {
          fetch('/api/agent-buddy/chat-history', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ role: 'buddy', text: b }),
          }).catch(function() {});
        }, 100);
      }
    } catch(e) {}
  }

  // v0.79: 加载历史摘要（启动时调用一次）
  function loadChatHistorySummary() {
    fetch('/api/agent-buddy/chat-history', {
      headers: getAuthHeaders(),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok && data.summary) {
        _userMemory.chatSummary = data.summary;
        saveMemory();
      }
    })
    .catch(function() {});
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
    } else if (type === 'enter_project') {
      // v0.79: 切换到指定项目并打开视图
      if (typeof enterProject === 'function') {
        enterProject({ id: param, name: param.replace('proj_', '') });
      }
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
    // v0.114p: 工具调用已内嵌流式文本，无需清独立日志条
    // 🆕 P1 方案B（卡片化）：清空上一轮 SSE 工具卡片状态
    if (window.ACMSQwenToolCard) window.ACMSQwenToolCard.reset();
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
      // v0.88: 当前项目 ID（代码执行域需要定位 workspace）
      currentProjectId: (window.App && App.currentProjectId) || undefined,
      loginCount: _userMemory.loginCount || 0,
      totalQuestions: _userMemory.totalQuestions || 0,
      knownViews: (_userMemory.knownViews || []).slice(-8),
      userName: getBuddyUserName(),
      packages: _knownPackages.map(function(p) { return p.name + '(' + p.title + ')'; }),
      history: (_userMemory.chatMemory || []).slice(-6),
      personality: _userMemory.personality || undefined,
    };

    // 调后端（v0.66: 支持流式 SSE，v0.80: 暂停/继续/速度调节/错误重试）
    var isStreaming = true;
    var streamUrl = '/api/agent-buddy/chat?stream=1';
    var streamSpeed = _streamSpeed;  // 使用模块级变量
    var streamPaused = _streamPaused;
    var streamDone = false;          // 局部变量，避免与模块级冲突
    var accumulated = '';            // v0.80: 提升作用域，供 finalizeStream 使用
    var actionData = null;           // v0.80: 提升作用域，供 finalizeStream 使用
    var streamAbortController = null;
    var streamRetryCount = 0;
    var MAX_RETRY = 3;

    // ── v0.102: Qwen 内核审批轮询（ask 模式）──
    // 后端 can_use_tool 审批挂起 → 前端轮询发现 → showConfirm → POST 决策
    var approvalPollTimer = null;
    var seenApprovals = {};
    function startApprovalPolling() {
      stopApprovalPolling();
      approvalPollTimer = setInterval(function() {
        fetch('/api/qwen/approvals/pending', { headers: getAuthHeaders() })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            var list = (data && data.approvals) || [];
            list.forEach(function(ap) {
              if (!ap || seenApprovals[ap.approvalId]) return;
              seenApprovals[ap.approvalId] = true;
              handleApprovalPrompt(ap);
            });
          })
          .catch(function() { /* 轮询失败忽略 */ });
      }, 1500);
    }
    function stopApprovalPolling() {
      if (approvalPollTimer) { clearInterval(approvalPollTimer); approvalPollTimer = null; }
    }
    function handleApprovalPrompt(ap) {
      // 🆕 P1 方案B（卡片化）：tool-card 已通过 SSE await_approval 渲染按钮，
      //   用户从卡片点 ✅/❌ → CustomEvent 'qwen:tool-card:decision' 走 onToolCardDecision
      //   approvalPolls 不再弹 showConfirm 兜底（避免重复弹窗）。
      //   仅当 tool-card 缺失（race condition: SSE 还没到但审批已挂起）才回退到弹窗。
      if (ap.toolUseId) {
        // 已有 toolUseId（P1 后端补的） → SSE 应已渲染按钮；标记 seenApprovals 防再处理
        return;
      }
      // v0.114i: ask_user_question → 问题表单（模型期望用户回答，不是 allow/deny）
      if (ap.isUserQuestion && ap.questions && ap.questions.length > 0) {
        handleUserQuestion(ap);
        return;
      }
      var toolName = ap.toolName || '未知工具';
      var input = ap.input || {};
      var desc = toolName;
      if (input.file_path) desc += ' → ' + input.file_path;
      else if (input.command) desc += ' → ' + String(input.command).slice(0, 80);
      else if (input.url) desc += ' → ' + String(input.url).slice(0, 80);
      else if (input.content && typeof input.content === 'string') desc += '（内容 ' + input.content.length + ' 字符）';
      showConfirm(desc + '\n\n是否允许小吉执行这个操作？', {
        title: '🔧 工具审批', confirmText: '允许', cancelText: '拒绝', type: 'info',
      }).then(function(allow) {
        fetch('/api/qwen/approvals/' + ap.approvalId, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ decision: allow ? 'allow' : 'deny' }),
        }).catch(function() {});
      });
    }

    // v0.114i/k: ask_user_question 问题表单 —— 渲染每个问题（选项单选/多选 + Other 自由输入），
    //   收集 answers 提交（{ '0': '回答1', '1': '...' }，多选用 ", " 连接），取消则 deny
    //   v0.114k: ① 左对齐 ② 问题加粗、选项字号小于问题 ③ 补 Other 自由输入 + multiSelect 多选
    function handleUserQuestion(ap) {
      var questions = ap.questions || [];
      var overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      var qHtml = questions.map(function(q, i) {
        var multi = !!q.multiSelect;
        var inputName = multi ? ('uq_' + i + '[]') : ('uq_' + i);
        var opts = (q.options || []).map(function(o, oi) {
          return '<label style="display:block;margin:5px 0;cursor:pointer;font-size:12.5px;text-align:left;color:var(--text2)">'
            + '<input type="' + (multi ? 'checkbox' : 'radio') + '" name="' + inputName + '" value="' + escHtml(o) + '"' + (oi === 0 ? '' : '') + ' style="vertical-align:middle;margin-right:6px"> '
            + escHtml(o) + '</label>';
        }).join('');
        // CLI 自动提供 Other 自由输入（源码实证：users will always be able to select "Other"）
        opts += '<label style="display:block;margin:5px 0;cursor:pointer;font-size:12.5px;text-align:left;color:var(--text2)">'
          + '<input type="' + (multi ? 'checkbox' : 'radio') + '" name="' + inputName + '" value="__qwen_other__" style="vertical-align:middle;margin-right:6px"> '
          + 'Other（自定义）</label>';
        return '<div style="margin-bottom:16px;text-align:left">'
          + '<div style="font-weight:700;margin-bottom:3px;font-size:14px">' + escHtml(q.header || ('问题 ' + (i + 1))) + '</div>'
          + '<div style="color:var(--text1);margin-bottom:8px;font-size:13px;font-weight:600">' + escHtml(q.question || '') + '</div>'
          + opts
          + '<input type="text" class="prompt-input" data-other="' + i + '" placeholder="选择 Other 时输入自定义回答..." style="width:100%;margin-top:6px;display:none">'
          + '</div>';
      }).join('');
      overlay.innerHTML = '<div class="confirm-dialog prompt-dialog" style="max-width:480px">'
        + '<h3 style="text-align:left">🤔 小吉需要确认</h3>'
        + '<div style="max-height:55vh;overflow:auto;text-align:left">' + qHtml + '</div>'
        + '<div class="confirm-actions" style="justify-content:flex-start">'
        + '<button class="btn-back confirm-cancel">取消</button>'
        + '<button class="confirm-btn btn-accept confirm-submit">提交回答</button>'
        + '</div></div>';
      document.body.appendChild(overlay);

      var cancelBtn = overlay.querySelector('.confirm-cancel');
      var submitBtn = overlay.querySelector('.confirm-submit');

      // Other 选中时显示自由输入框
      questions.forEach(function(q, i) {
        var otherInput = overlay.querySelector('input[data-other="' + i + '"]');
        if (!otherInput) return;
        var inputName = (q.multiSelect ? ('uq_' + i + '[]') : ('uq_' + i));
        overlay.querySelectorAll('input[name="' + inputName + '"]').forEach(function(inp) {
          inp.addEventListener('change', function() {
            var others = overlay.querySelectorAll('input[name="' + inputName + '"]');
            var otherChecked = false;
            others.forEach(function(o) { if (o.value === '__qwen_other__' && o.checked) otherChecked = true; });
            otherInput.style.display = otherChecked ? 'block' : 'none';
          });
        });
      });

      function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }

      cancelBtn.addEventListener('click', function() {
        close();
        fetch('/api/qwen/approvals/' + ap.approvalId, {
          method: 'POST', headers: getAuthHeaders(),
          body: JSON.stringify({ decision: 'deny' }),
        }).catch(function() {});
      });
      submitBtn.addEventListener('click', function() {
        var answers = {};
        questions.forEach(function(q, i) {
          var inputName = (q.multiSelect ? ('uq_' + i + '[]') : ('uq_' + i));
          var checked = overlay.querySelectorAll('input[name="' + inputName + '"]:checked');
          var otherInput = overlay.querySelector('input[data-other="' + i + '"]');
          var values = [];
          checked.forEach(function(c) {
            if (c.value === '__qwen_other__') {
              var custom = (otherInput && otherInput.value.trim()) || '';
              if (custom) values.push(custom);
            } else {
              values.push(c.value);
            }
          });
          // 单选但 Other 未填 → 空；多选合并 ", "（CLI 协议：answers 多选用 ", " 连接）
          answers[q.answerKey || String(i)] = values.join(', ');
        });
        close();
        fetch('/api/qwen/approvals/' + ap.approvalId, {
          method: 'POST', headers: getAuthHeaders(),
          body: JSON.stringify({ decision: 'allow', answers: answers }),
        }).catch(function() {});
      });
// Esc 关闭 = 取消
      var escHandler = function(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); } };
      document.addEventListener('keydown', escHandler);
    }

    // 🆕 P1 方案B（卡片化）：tool-card 按钮点击 → 查 approval list → POST 决策
    //   agent-buddy 的 approvalPolls 已在 handleApprovalPrompt 里跳过弹窗（避免重复），
    //   真正决策走这个 listener
    function onToolCardDecision(e) {
      var detail = e && e.detail;
      if (!detail) return;
      var toolUseId = detail.toolUseId;
      if (!toolUseId) return;
      // 实时查最新 pending list（确保 approvalId 准确）
      fetch('/api/qwen/approvals/pending', { headers: getAuthHeaders() })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var list = (data && data.approvals) || [];
          var ap = null;
          for (var i = 0; i < list.length; i++) {
            if (list[i].toolUseId === toolUseId) { ap = list[i]; break; }
          }
          if (!ap) return;  // 已被 settle（list 不再含）
          seenApprovals[ap.approvalId] = true;  // 标记防止 approvalPolls 再弹窗
          var body = { decision: detail.allow ? 'allow' : 'deny' };
          if (detail.answers) body.answers = detail.answers;
          return fetch('/api/qwen/approvals/' + ap.approvalId, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(body),
          });
        })
        .catch(function() { /* 静默失败 */ });
    }
    document.addEventListener('qwen:tool-card:decision', onToolCardDecision);

    function startStream(retryMsg) {
      streamAbortController = new AbortController();
      var signal = streamAbortController.signal;

      fetch(streamUrl, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ message: text, context: context }),
        signal: signal,
      })
      .then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || '请求失败'); });
        return handleStream(r);
      })
      .catch(function(err) {
        if (err.name === 'AbortError') return;  // 用户主动取消
        if (streamRetryCount < MAX_RETRY && !streamDone) {
          streamRetryCount++;
          console.warn('[buddy-stream] 读取错误，重试 ' + streamRetryCount + '/' + MAX_RETRY + ':', err.message);
          setTimeout(startStream, 1000);  // 1 秒后重试
        } else {
          console.warn('[buddy-stream] 读取错误:', err);
          streamDone = true;
          _streamDone = true;
          finalizeStream();
        }
      });
    }

function handleStream(r) {
      var reader = r.body.getReader();
      var decoder = new TextDecoder();
      // accumulated 和 actionData 已在 sendMessage 作用域声明，这里不再重复声明
      streamDone = false;
      _streamDone = false;
      var lastProcessTime = Date.now();
      // 🆕 修复（2026-08-23）：assistant 文本按"间隔事件"分段成独立气泡
      //   text → text → 累积到同一 bubble
      //   text → tool_card → text → 分 3 段：bubble1 + tool_card + bubble2
      //   progress 不再 append 到 accumulated（v0.114p 反转）—— 工具摘要走 tool_card 路径
      var _lastBubbleEvent = null;  // 'text' | 'tool_card' | 'thinking' | null

      function processStream() {
        if (streamDone || streamPaused) return;

        var timeout = streamSpeed - (Date.now() - lastProcessTime);
        if (timeout < 0) timeout = 0;

        setTimeout(function() {
          if (streamDone || streamPaused) return;

          reader.read().then(function(result) {
            if (result.done) {
              streamDone = true;
              finalizeStream();
              return;
            }
            lastProcessTime = Date.now();
            var text = decoder.decode(result.value, { stream: true });
            // 解析 SSE 事件
            var lines = text.split('\n');
            for (var li = 0; li < lines.length; li++) {
              var line = lines[li].trim();
              if (!line || !line.startsWith('data: ')) continue;
              try {
                var evt = JSON.parse(line.slice(6));
                if (evt.type === 'text') {
                  // 🆕 修复：text chunk 在 tool_card/thinking/progress 后到达 → finalize 旧 bubble + 创建新 bubble
                  if (_lastBubbleEvent !== null && _lastBubbleEvent !== 'text') {
                    finalizeCurrentBubble();
                    accumulated = '';
                  }
                  accumulated += evt.chunk || '';
                  updateStreamMessage(accumulated);
                  _lastBubbleEvent = 'text';
                } else if (evt.type === 'action') {
                  actionData = evt;
                } else if (evt.type === 'speed') {
                  streamSpeed = Math.max(10, Math.min(100, evt.speed || 30));
                } else if (evt.type === 'progress') {
                  // 🆕 v0.114p 反转（2026-08-23）：progress 不再 append 到 assistant 文本流
                  //   —— 工具摘要走 tool_card 独立卡片路径（避免与 assistant 文本挤在同一气泡）
                  //   progress 仍可作为"事件信号"影响 _lastBubbleEvent（让后续 text 触发新 bubble）
                  if (_lastBubbleEvent === 'text') {
                    finalizeCurrentBubble();
                    accumulated = '';
                  }
                  _lastBubbleEvent = 'progress';
                } else if (evt.type === 'action') {
                  // 🆕 修复（2026-08-23 第三次）：action 事件实时渲染（不等 finalize），
                  //   按 v0.114n insertBefore streamBubble（先发生显示在前面）
                  //   同时作为 bubble 边界：后续 text chunk 创建新 bubble（按时间穿插）
                  if (_lastBubbleEvent === 'text') {
                    finalizeCurrentBubble();
                    accumulated = '';
                  }
                  actionData = evt;
                  if (evt.action && evt.action.requirementId) {
                    renderActionCard(evt.action);
                  }
                  _lastBubbleEvent = 'action';
                } else if (evt.type === 'tool_card') {
                  // 🆕 修复：tool_card 到达 → finalize 当前 assistant bubble
                  if (_lastBubbleEvent === 'text') {
                    finalizeCurrentBubble();
                    accumulated = '';
                  }
                  if (window.ACMSQwenToolCard) window.ACMSQwenToolCard.handleToolCard(evt);
                  _lastBubbleEvent = 'tool_card';
                } else if (evt.type === 'thinking') {
                  // thinking 不需要影响 bubble 分段（仅折叠卡片）
                  if (window.ACMSQwenToolCard) window.ACMSQwenToolCard.handleThinking(evt.text);
                  _lastBubbleEvent = 'thinking';
                }
              } catch(e) { /* 跳过解析失败的 SSE 行 */ }
            }
            processStream();
          }).catch(function(err) {
            if (err.name === 'AbortError') return;
            console.warn('[buddy-stream] 读取错误:', err);
            streamDone = true;
            finalizeStream();
          });
        }, timeout);
      }

      processStream();
    }

    // 🆕 修复（2026-08-23）：把当前流式 bubble 转静态（去 cursor + 清 id），下次 text chunk 创建新 bubble
    function finalizeCurrentBubble() {
      var msgEl = document.getElementById('ap-stream-bubble');
      if (!msgEl) return;
      var textSpan = msgEl.querySelector('.ap-msg-text');
      if (textSpan) {
        // 移除光标子元素（保留 md 渲染结果：strong/code/emoji）
        var cursor = textSpan.querySelector('.ap-cursor');
        if (cursor && cursor.parentNode) cursor.parentNode.removeChild(cursor);
        // 直接用现有 innerHTML（避免重新跑 md 渲染丢结构）
        msgEl.innerHTML = '<span class="ap-msg-text">' + textSpan.innerHTML + '</span>';
      }
      msgEl.id = '';  // 移除临时 ID，下次 text chunk 找不到就创建新 bubble
    }

    function updateStreamMessage(text) {
      removeThinking();
      // v0.96: 不清除 op logs — 让操作日志条保留在流式文字上方，等 finalizeStream 再清
      var cleanText = text.replace(/【face:\w+】/g, '').replace(/【action:[^:]+:[^】]+】/g, '').trim();
      var mdFn = typeof renderMarkdown === 'function' ? renderMarkdown : function(t) { return escHtml(t); };
      var container = document.querySelector('#ap-messages');
      if (!container) return;

      // 使用固定元素（避免流式期间反复创建）
      var msgEl = document.getElementById('ap-stream-bubble');
      if (!msgEl) {
        msgEl = document.createElement('div');
        msgEl.id = 'ap-stream-bubble';
        msgEl.className = 'ap-msg ap-msg-buddy';
        // 🆕 修复：append 到 #ap-messages 末尾（tool_card/thinkings 是 insertBefore streamBubble 实现的，
        //   所以新 bubble 自然在它们之后；streamBubble 元素 ID 在 finalizeCurrentBubble 时被清空）
        container.appendChild(msgEl);
      }
      msgEl.innerHTML = '<span class="ap-msg-text">' + mdFn(cleanText) + '<span class="ap-cursor">|</span></span>';
      container.scrollTop = container.scrollHeight;
    }

    function finalizeStream() {
      stopApprovalPolling();  // v0.102: 停止审批轮询
      // 🆕 P1 方案B（卡片化）：卸载 tool-card 决策监听（避免多轮对话累积 listener）
      try { document.removeEventListener('qwen:tool-card:decision', onToolCardDecision); } catch (e) {}
      removeThinking();
      // 🆕 修复（2026-08-23）：finalize 最后一个 bubble（如果还有 streamBubble 没 finalize）
      var lastBubble = document.getElementById('ap-stream-bubble');
      if (lastBubble) finalizeCurrentBubble();
      var raw = accumulated || '嗯… 我没听清，能再说一遍吗？';
      // 移除流式标记，保留气泡
      var msgEl = document.getElementById('ap-stream-bubble');
      var container = document.querySelector('#ap-messages');
      if (msgEl) {
        var cleanText = raw.replace(/【face:\w+】/g, '').replace(/【action:[^:]+:[^】]+】/g, '').trim();
        var mdFn = typeof renderMarkdown === 'function' ? renderMarkdown : function(t) { return escHtml(t); };
        msgEl.innerHTML = '<span class="ap-msg-text">' + mdFn(cleanText) + '</span>';
        msgEl.id = '';  // 移除临时 ID，变成普通气泡
      }
      if (container) container.scrollTop = container.scrollHeight;
      executeActions(raw);
var faceMatch = raw.match(/【face:(\w+)】/);
      if (faceMatch) setFace(faceMatch[1]);
      var reply = raw.replace(/【[^】]+】/g, '').trim();
      // 🆕 修复（2026-08-23 第三次）：SSE handler 已实时渲染 Action Card（按 v0.114n 位置），
      //   finalize 不再调 renderActionCard 避免重复 / 位置覆盖
      // if (actionData && actionData.action && actionData.action.requirementId) renderActionCard(actionData.action);
      _chatHistory.push({ role: 'buddy', text: reply });
      addScore('toast-fire');
      saveChatMemory(text, reply);
    }

    startApprovalPolling();  // v0.102: 启动审批轮询（Qwen ask 模式）
    startStream();
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

    // v0.66: 图片拖拽 — 从 action card 拖图片到应用图标
    document.addEventListener('dragstart', function(e) {
      var img = e.target;
      if (img.tagName !== 'IMG' || !img.hasAttribute('data-imgurl')) return;
      var url = img.getAttribute('data-imgurl') || img.src || '';
      if (url) {
        e.dataTransfer.setData('text/plain', url);
        e.dataTransfer.setData('application/acms-image', url);
        e.dataTransfer.effectAllowed = 'copy';
        // 半透明拖拽预览
        if (img.style) img.style.opacity = '0.5';
        setTimeout(function() { img.style.opacity = ''; }, 0);
      }
    });

    // 全局放置目标：图片拖到任意 .launcher-item / .desktop-icon 上打开对应应用
    document.addEventListener('dragover', function(e) {
      var target = e.target.closest('.launcher-item, .desktop-icon, .oo-editor-img, #img-editor-mount');
      if (target && e.dataTransfer.types.includes('application/acms-image')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        target.classList.add('drag-over');
      }
    });
    document.addEventListener('dragleave', function(e) {
      var target = e.target.closest('.launcher-item, .desktop-icon');
      if (target) target.classList.remove('drag-over');
    });
    document.addEventListener('drop', function(e) {
      var target = e.target.closest('.launcher-item, .desktop-icon, .oo-editor-img, #img-editor-mount');
      if (!target) return;
      var imgUrl = e.dataTransfer.getData('application/acms-image') || e.dataTransfer.getData('text/plain');
      if (!imgUrl) return;
      e.preventDefault();
      if (target.classList) target.classList.remove('drag-over');
      // v0.75: CDN URL 转本地代理（tui-image-editor canvas 需要 CORS）
      if (imgUrl.indexOf('platform-outputs.agnes-ai.space') >= 0 || (imgUrl.indexOf('://') >= 0 && imgUrl.indexOf('/api/') !== 0)) {
        imgUrl = '/api/files/proxy-image?url=' + encodeURIComponent(imgUrl);
      }
      // 直接拖到图片编辑器窗口 → 用 reloadImage
      if (target.classList.contains('oo-editor-img') || target.id === 'img-editor-mount') {
        if (typeof window.__activeImageEditorReload === 'function') {
          window.__activeImageEditorReload(imgUrl);
        }
        return;
      }
      // 存拖拽图片 URL
      window._dragImageUrl = imgUrl;
      console.log('[DRAG-DEBUG] _dragImageUrl 已设置:', imgUrl.slice(0, 120));
      // 如果是 desktop-icon，直接触发 click（onClick 会自动消费 _dragImageUrl）
      if (target.classList.contains('desktop-icon')) {
        target.click();
        return;
      }
      // 从 launcher item 解析要打开的应用名
      var onclickAttr = target.getAttribute('onclick') || '';
      var match = onclickAttr.match(/launchView\(['"]([^'"]+)['"]\)/);
      if (match) {
        window._dragImageUrl = imgUrl;
        console.log('[DRAG-DEBUG] launchView 将打开:', match[1]);
        launchView(match[1]);
        return;
      }
      match = onclickAttr.match(/launchAssistTool\(['"]([^'"]+)['"]/);
      if (match) {
        window._dragImageUrl = imgUrl;
        launchAssistTool(match[1]);
        return;
      }
      // 兜底：检查 data-app 属性
      var appName = target.getAttribute('data-app') || target.getAttribute('data-view') || '';
      if (appName) {
        window._dragImageUrl = imgUrl;
        launchView(appName);
      }
    });

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

    // v0.64: Agent 事件主动通知 — 任务失败/完成时自动弹面板
    var _agentEventNames = ['acms:task.failed', 'acms:task.completed', 'acms:task.review_rejected'];
    _agentEventNames.forEach(function(evName) {
      window.addEventListener(evName, function(e) {
        var payload = e.detail || {};
        var taskId = payload.taskId || payload.target?.id || '';
        var status = payload.status || '';
        var summary = payload.summary || payload.error || payload.progressNote || '';

        // 构建通知消息
        var msg = '';
        if (evName === 'acms:task.failed') {
          msg = '⚠️ 任务 ' + taskId + ' 执行失败';
          if (summary) msg += ': ' + String(summary).slice(0, 100);
          addScore('task-failed', 10);
        } else if (evName === 'acms:task.completed') {
          msg = '✅ 任务 ' + taskId + ' 已完成';
          addScore('task-completed', 5);
        } else if (evName === 'acms:task.review_rejected') {
          msg = '🔄 任务 ' + taskId + ' 被驳回';
          if (summary) msg += ': ' + String(summary).slice(0, 100);
          addScore('task-rejected', 8);
        }

        if (msg) {
          openPanel({ message: msg });
        }
      });
    });

    // P2: Agent 事件通知 — 任务失败/完成时自动弹面板
  }

  /** 初始化检索模式切换 badge */
  function _initToolRetrieverUI() {
    var badge = document.getElementById('ap-mode-badge');
    if (!badge) return;

    // 查询当前模式并更新 UI
    fetch('/api/agent-buddy/tool-retriever/status', { headers: getAuthHeaders() })
      .then(function(r) { return r.json(); })
      .then(function(s) {
        _updateModeBadge(badge, s.mode);
      })
      .catch(function() { /* 静默 */ });

    // 点击切换
    badge.addEventListener('click', function(e) {
      e.stopPropagation();
      var current = badge.getAttribute('data-mode') || 'keyword';
      var next = current === 'keyword' ? 'bge' : 'keyword';

      fetch('/api/agent-buddy/tool-retriever/mode', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ mode: next }),
      })
      .then(function(r) { return r.json(); })
      .then(function(result) {
        if (result.ok || result.mode) {
          _updateModeBadge(badge, result.mode || next);
          // 在聊天流中提示切换成功
          var container = document.querySelector('#ap-messages');
          if (container) {
            var div = document.createElement('div');
            div.className = 'ap-msg ap-msg-buddy';
            div.innerHTML = '<span class="ap-msg-text" style="font-size:12px;color:#999">🔧 已切换到 <strong>' + (result.mode || next) + '</strong> 检索模式</span>';
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
          }
        }
      })
      .catch(function() {});
    });
  }

  function _updateModeBadge(badge, mode) {
    badge.setAttribute('data-mode', mode);
    if (mode === 'keyword') {
      badge.textContent = '🔍';
      badge.title = '关键词模式，点我切换';
    } else {
      badge.textContent = '🧠';
      badge.title = '语义模式 (BGE)，点我切换';
    }
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
