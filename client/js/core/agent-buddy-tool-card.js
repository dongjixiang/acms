// ============================================================
// agent-buddy-tool-card.js — Qwen 内核工具调用卡片渲染（P1 方案B）
// ============================================================
// 职责：把后端 SSE `tool_card` 事件（6 phase）+ `thinking` 事件 渲染成 ACMS 卡片
//   - 与 v0.114p 行为兼容：progress 仍内嵌进 assistant 流式气泡（一行引用块）
//   - 新增：每个 tool_use 一张独立卡片，状态机 ⏳ → ✅ / ❌ / 🚫
//   - ask_user_question 渲染成内嵌问题表单（沿用 v0.114k UI 规范）
//   - 审批按钮 click 触发 CustomEvent 'qwen:tool-card:decision'，由 agent-buddy.js 监听并 POST
//
// 设计原则：
//   - 沿用 v0.114n 教训：先发生的显示在前面，卡片插入到 #ap-stream-bubble 之前
//   - 沿用 v0.18 极简偏好：默认折叠详情，状态徽章清晰可见
//   - 不破坏现有 ap-tool-summary / ap-action-* 样式命名空间
// ============================================================
(function () {
  'use strict';

  // ============ State ============
  var _cards = Object.create(null);  // tool_use_id → card state
  var _thinkingText = '';
  var _thinkingEl = null;
  var _container = null;
  var _apInsertedAt = 0;  // 调试计数
  // 🆕 P2：多工具合并 group（同一轮 3+ 工具调用时合并容器，避免堆 10 张卡）
  // 🆕 v0.114v：group 按"轮次"划分 —— reset() 不再删历史卡片（聊天流向下原则），
  //   新轮次 startGroup 重置 group 状态 → 新一轮卡片独立分组，历史卡片/group 保留。
  var _groupEl = null;          // group 容器 DOM（当前轮）
  var _groupIds = [];           // 当前 group 内的 tool_use_id 列表
  var GROUP_THRESHOLD = 3;      // 超过此数启动 group
  // 🆕 v0.114v：当前轮次内已渲染的独立卡片数（不跨轮累计）
  var _roundCardCount = 0;
  // 🆕 v0.115a：当前"回复段"号（reset=新轮次、onReplyStart=回复开始 时递增；
  //   卡片创建时打标，group 迁移只迁同段 —— 回复前的工具一组，回复后的工具新一组）
  var _segment = 0;

  function getContainer() {
    // 🆕 v0.117k: 只在 _container 为 null 时 fallback，不检查 isConnected
    //   之前：自由对话窗口被隐藏时 isConnected=false → fallback 到 #ap-messages → 卡片渲染到错误位置
    //   修复：保留用户设置的容器，即使暂时不在 DOM 中也继续用
    if (!_container) _container = document.querySelector('#ap-messages');
    return _container;
  }

  // 在流式气泡之前插入（v0.114n 教训：先发生的显示在前面）
  function insertBeforeStreamBubble(el) {
    var container = getContainer();
    if (!container) return false;
    // 🆕 v0.117j: 在容器内查找锚点，不是全局 document.getElementById
    //   自由对话窗口有自己的 #ap-stream-bubble，不能用小吉面板的
    var streamBubble = container.querySelector('#ap-stream-bubble');
    if (streamBubble && streamBubble.parentNode === container) {
      // 🆕 v0.117t: 使用 insertBefore 但检查是否已有同级元素
      //   如果有多个卡片，第二个及以后的应该插入到前一个卡片后面
      var prevEl = el.previousElementSibling;
      if (prevEl && prevEl !== streamBubble && prevEl !== streamBubble?.previousElementSibling) {
        // 有前一个兄弟元素（不是锚点），插入到它后面
        container.insertBefore(el, streamBubble);
      } else {
        // 没有前一个兄弟或前一个是锚点，直接插入到锚点前
        container.insertBefore(el, streamBubble);
      }
    } else {
      container.appendChild(el);
    }
    _apInsertedAt++;
    container.scrollTop = container.scrollHeight;
    return true;
  }

  // ============ Main entry: handleToolCard (6 phase) ============
  function handleToolCard(evt) {
    var phase = evt && evt.phase;
    if (!phase) return;
    var toolUseId = evt.tool_use_id;
    if (!toolUseId) return;

    try {
      switch (phase) {
        case 'start':               return phaseStart(evt);
        case 'await_approval':      return phaseAwaitApproval(evt);
        case 'input_complete':      return phaseInputComplete(evt);
        case 'result':              return phaseResult(evt);
        case 'approval_decided':    return phaseApprovalDecided(evt);
        default:
          // 忽略未知 phase
      }
    } catch (e) {
      console.warn('[tool-card] handleToolCard 异常:', e.message, evt);
    }
  }

  // phase: start — 工具开始执行（auto 模式无审批，直接进入 pending）
  // 🆕 P2：超过 GROUP_THRESHOLD 张时合并 group 容器
  function phaseStart(evt) {
    if (_cards[evt.tool_use_id]) return;  // 已有（await_approval 可能先到）
    var el = createCardEl(evt.tool_name, evt.tool_use_id);
    _cards[evt.tool_use_id] = {
      el: el,
      toolUseId: evt.tool_use_id,
      toolName: evt.tool_name,
      status: 'pending',
      input: null,
      output: null,
      isError: false,
      segment: _segment,  // 🆕 v0.115a：标记回复段（group 迁移/计数只认同段）
    };
    paintHead(_cards[evt.tool_use_id]);
    insertCardEl(el, evt.tool_use_id);
  }

  // 🆕 v0.115a：按"回复段"分组的智能插入（多多规则：回复前的连续工具可合并 group；
  //   回复文本出现后（onReplyStart 封存旧 group），再调用的多个工具开新 group）
  function insertCardEl(el, toolUseId) {
    var container = getContainer();
    if (!container) return;
    _roundCardCount++;  // 只计当前回复段（onReplyStart/reset 归零）
    var totalCards = _roundCardCount;

    if (totalCards >= GROUP_THRESHOLD) {
      // 触发 group：把当前回复段已有卡片（含当前）打包到 group 容器
      if (!_groupEl) {
        _groupEl = createGroupEl(totalCards);
        var streamBubble = document.getElementById('ap-stream-bubble');
        container.insertBefore(_groupEl, streamBubble || null);
        // 迁移当前回复段已渲染的独立卡片（只迁同段，历史段卡片/group 保留原位）
        var groupBody = _groupEl.querySelector('.ap-tool-group-body');
        for (var k in _cards) {
          if (_cards[k] && _cards[k].el && _cards[k].el !== el
              && _cards[k].el.parentNode === container
              && _cards[k].segment === _segment) {
            groupBody.appendChild(_cards[k].el);
            _groupIds.push(k);
          }
        }
        // thinking 卡移到 group 上方（视觉顺序：thinking 最上，group 中，stream bubble 下）
        if (_thinkingEl && _thinkingEl.parentNode === container) {
          container.insertBefore(_thinkingEl, _groupEl);
        }
      }
      _groupEl.querySelector('.ap-tool-group-body').appendChild(el);
      _groupIds.push(toolUseId);
      updateGroupHead();
    } else {
      insertBeforeStreamBubble(el);
    }
    container.scrollTop = container.scrollHeight;
  }

  // 🆕 v0.115a：Agent 回复开始（SSE text 事件）→ 封存当前 group。
  //   多多规则：回复前的一批工具合并为一个 group；回复出现后新调用的多个工具开新 group。
  //   幂等：本回复段无工具时 no-op（纯文本回复不会产生空段）。
  function onReplyStart() {
    if (_roundCardCount === 0 && !_groupEl) return;
    _segment++;
    _roundCardCount = 0;
    _groupEl = null;   // 封存（DOM 保留在聊天流），新回复段独立分组
    _groupIds = [];
  }

  function createGroupEl(initialCount) {
    var group = document.createElement('div');
    group.className = 'ap-tool-group';
    // 🆕 A3（2026-08-23）：group head 加状态徽章（避免用户不知道 group 内有 awaiting 卡片）
    group.innerHTML = '<div class="ap-tool-group-head" data-action="toggle-group">'
      + '<span class="ap-tool-group-toggle">▶</span>'
      + '<span class="ap-tool-group-title">🔧 工具调用</span>'
      + '<span class="ap-tool-group-stats"></span>'
      + '</div>'
      + '<div class="ap-tool-group-body" style="display:none"></div>';
    var head = group.querySelector('.ap-tool-group-head');
    head.addEventListener('click', function () {
      var body = group.querySelector('.ap-tool-group-body');
      var hidden = body.style.display === 'none';
      body.style.display = hidden ? 'block' : 'none';
      head.querySelector('.ap-tool-group-toggle').textContent = hidden ? '▼' : '▶';
      // 🆕 v0.114w：group 展开后滚到可见（group 在底部时展开内容展示不全）
      if (hidden) scrollCardIntoView(group);
    });
    return group;
  }

  function updateGroupHead() {
    if (!_groupEl) return;
    var total = _groupIds.length;
    var awaitingCount = 0, failedCount = 0, doneCount = 0;
    // 🆕 v0.114v：只统计当前 group 内的卡片（_groupIds），不统计历史轮卡片
    for (var gi = 0; gi < _groupIds.length; gi++) {
      var gc = _cards[_groupIds[gi]];
      if (!gc) continue;
      if (gc.status === 'awaiting') awaitingCount++;
      else if (gc.status === 'failed' || gc.status === 'denied') failedCount++;
      else if (gc.status === 'done' || gc.status === 'allowed') doneCount++;
    }
    var stats = [];
    if (awaitingCount > 0) stats.push('<span class="ap-tool-group-stat-awaiting">⏳ ' + awaitingCount + ' 待审批</span>');
    if (doneCount > 0) stats.push('<span class="ap-tool-group-stat-done">✅ ' + doneCount + '</span>');
    if (failedCount > 0) stats.push('<span class="ap-tool-group-stat-failed">❌ ' + failedCount + ' 失败</span>');
    var statsEl = _groupEl.querySelector('.ap-tool-group-stats');
    if (statsEl) statsEl.innerHTML = stats.join(' ');
    // 总数小字
    var titleEl = _groupEl.querySelector('.ap-tool-group-title');
    if (titleEl) titleEl.textContent = '🔧 工具调用 (' + total + ')';
  }

  // phase: await_approval — 工具等待审批（ask 模式）
  function phaseAwaitApproval(evt) {
    var card = _cards[evt.tool_use_id];
    if (!card) {
      phaseStart({ tool_use_id: evt.tool_use_id, tool_name: evt.tool_name });
      card = _cards[evt.tool_use_id];
    }
    card.input = evt.input || {};
    card.permissionSuggestions = evt.permission_suggestions || [];
    card.isUserQuestion = !!evt.is_user_question;
    card.questions = evt.questions || [];
    card.status = 'awaiting';
    paintHead(card);
    paintInput(card);
    paintApproval(card);
  }

  // phase: input_complete — input 流结束（input 完整 JSON）
  function phaseInputComplete(evt) {
    var card = _cards[evt.tool_use_id];
    if (!card) {
      phaseStart({ tool_use_id: evt.tool_use_id, tool_name: evt.tool_name });
      card = _cards[evt.tool_use_id];
    }
    card.input = evt.input || {};
    // 🆕 v0.117m: 确保 body 已创建（paintHead 会重画 body，但保留 innerHTML）
    if (card.status === 'pending') {
      paintHead(card);
      // 调试：检查 body 是否存在
      var debugBody = card.el.querySelector('.ap-tool-card-body');
      console.log('[debug] phaseInputComplete: body exists:', !!debugBody, 'input:', JSON.stringify(card.input).slice(0, 100));
      paintInput(card);
      // 调试：检查 body 内容
      if (debugBody) {
        console.log('[debug] after paintInput: body.innerHTML length:', debugBody.innerHTML.length);
      }
    }
  }

  // phase: result — 工具执行结果
  function phaseResult(evt) {
    var card = _cards[evt.tool_use_id];
    if (!card) {
      // 没 start 也兜底（理论上不应该）
      phaseStart({ tool_use_id: evt.tool_use_id, tool_name: 'unknown' });
      card = _cards[evt.tool_use_id];
    }
    card.output = evt.content || '';
    card.isError = !!evt.is_error;
    card.status = card.isError ? 'failed' : 'done';
    // 🆕 v0.117m: 先 paintHead 确保 body 存在，再 paintOutput 填充内容
    paintHead(card);
    // 调试：检查 body 是否存在
    var debugBody = card.el.querySelector('.ap-tool-card-body');
    console.log('[debug] phaseResult: body exists:', !!debugBody, 'output length:', card.output?.length, 'isError:', card.isError);
    paintOutput(card);
    // 调试：检查 body 内容
    if (debugBody) {
      console.log('[debug] after paintOutput: body.innerHTML length:', debugBody.innerHTML.length);
      console.log('[debug] body.innerHTML:', debugBody.innerHTML.slice(0, 200));
    }
  }

  // phase: approval_decided — 审批决策（ask 模式）
  function phaseApprovalDecided(evt) {
    var card = _cards[evt.tool_use_id];
    if (!card) return;
    card.status = evt.allowed ? 'allowed' : 'denied';
    paintHead(card);
    // 锁掉审批按钮（决策区移除）
    var btnArea = card.el.querySelector('.ap-tool-card-decision');
    if (btnArea && btnArea.parentNode) btnArea.parentNode.removeChild(btnArea);
  }

  // ============ Thinking handler ============
  function handleThinking(text) {
    if (!text) return;
    _thinkingText += text;
    var container = getContainer();
    if (!container) return;
    if (!_thinkingEl) {
      _thinkingEl = document.createElement('div');
      _thinkingEl.className = 'ap-thinking-card';
      _thinkingEl.innerHTML = '<div class="ap-thinking-head">💭 思考过程 <span class="ap-thinking-toggle" data-action="toggle">▼</span></div>'
        + '<pre class="ap-thinking-body" style="display:none"></pre>';
      insertBeforeStreamBubble(_thinkingEl);
      // 折叠按钮
      var toggleBtn = _thinkingEl.querySelector('.ap-thinking-toggle');
      toggleBtn.addEventListener('click', function () {
        var body = _thinkingEl.querySelector('.ap-thinking-body');
        var hidden = body.style.display === 'none';
        body.style.display = hidden ? 'block' : 'none';
        toggleBtn.textContent = hidden ? '▲' : '▼';
        // 🆕 v0.114w：展开后滚到可见
        if (hidden) scrollCardIntoView(_thinkingEl);
      });
    }
    _thinkingEl.querySelector('.ap-thinking-body').textContent = _thinkingText;
  }

  // ============ Reset ============
  function reset() {
    // 🆕 v0.115a：按回复段划分 —— reset 只做轮次边界（新对话轮次），
    //   回复段边界由 onReplyStart（SSE text 事件）控制；历史卡片/group 全部保留。
    _segment++;
    _roundCardCount = 0;
    _groupEl = null;          // 本轮 group 容器已封存（保留 DOM），新轮独立 group
    _groupIds = [];
    // thinking 卡片：每轮重建（思考过程是临时态，不保留）
    if (_thinkingEl && _thinkingEl.parentNode) _thinkingEl.parentNode.removeChild(_thinkingEl);
    _thinkingEl = null;
    _thinkingText = '';
  }

  // ============ DOM helpers ============
  function createCardEl(toolName, toolUseId) {
    var el = document.createElement('div');
    el.className = 'ap-tool-card ap-tool-status-pending';
    el.setAttribute('data-tool-use-id', toolUseId);
    el.setAttribute('data-tool-name', toolName || '');
    return el;
  }

function paintHead(card) {
    var statusMap = {
      pending: '⏳', awaiting: '❓', allowed: '✅', done: '✅', failed: '❌', denied: '🚫',
    };
    var statusLabel = {
      pending: '执行中', awaiting: '等待审批', allowed: '已允许', done: '完成', failed: '失败', denied: '已拒绝',
    };
    var icon = statusMap[card.status] || '⏳';
    var label = statusLabel[card.status] || card.status;
    card.el.className = 'ap-tool-card ap-tool-status-' + card.status;

    // 🆕 P2：保留 body innerHTML（重画 head 不丢 body 内容）
    var existingBody = card.el.querySelector('.ap-tool-card-body');
    var preservedBodyHtml = (existingBody && existingBody.innerHTML) || '';

    // 🆕 A2 修复（2026-08-23）：awaiting 卡片 head 内嵌快捷审批按钮
    //   —— 不依赖 body 展开，group 折叠时也能点（解决"多次调用时没法审批"）
    // 🆕 v0.115b：加 ⏩"全部允许" —— 本会话内此类操作自动通过（后端记入会话自动放行集合）
    var headActionsHtml = '';
    if (card.status === 'awaiting' && !card.isUserQuestion) {
      headActionsHtml = '<span class="ap-tool-card-head-actions">'
        + '<button class="ap-tool-card-btn ap-tool-card-allow ap-tool-card-head-btn" data-action="allow" data-tool-use-id="' + escHtml(card.toolUseId) + '" title="允许执行一次">✅</button>'
        + '<button class="ap-tool-card-btn ap-tool-card-always ap-tool-card-head-btn" data-action="always-allow" data-tool-use-id="' + escHtml(card.toolUseId) + '" title="本会话内此类操作自动通过（不再询问）">⏩</button>'
        + '<button class="ap-tool-card-btn ap-tool-card-deny ap-tool-card-head-btn" data-action="deny" data-tool-use-id="' + escHtml(card.toolUseId) + '" title="拒绝执行">❌</button>'
        + '</span>';
    }

    // 🆕 P2：head 加 ▶/▼ 折叠按钮（v0.18 极简偏好：默认折叠，看详情点开）
    card.el.innerHTML = '<div class="ap-tool-card-head">'
      + '<span class="ap-tool-card-toggle" data-action="toggle">▶</span>'
      + '<span class="ap-tool-card-icon">' + icon + '</span>'
      + '<span class="ap-tool-card-name">' + escHtml(card.toolName) + '</span>'
      + '<span class="ap-tool-card-label">' + label + '</span>'
      + (card.isError ? '<span class="ap-tool-card-err">错误</span>' : '')
      + headActionsHtml
      + '</div>'
      + '<div class="ap-tool-card-body" style="display:none"></div>';

    // 还原 body 内容
    if (preservedBodyHtml) {
      card.el.querySelector('.ap-tool-card-body').innerHTML = preservedBodyHtml;
    }

    // 🆕 P2：失败/审批态自动展开 body（避免用户看不到错误或审批按钮）
    if (card.status === 'failed' || card.status === 'awaiting') {
      setBodyVisible(card, true);
    }

    // 🆕 A1 修复（2026-08-23）：awaiting 卡片触发所在 group 自动展开
    //   —— 即便用户没手动展开 group，group 内有审批时也能看到卡片
    if (card.status === 'awaiting') {
      ensureGroupVisible(card);
    }
    // 🆕 A3（2026-08-23）：任何状态变更后刷新 group head 状态徽章（done/failed/awaiting）
    if (_groupEl) updateGroupHead();

    // 绑定 head 内审批按钮（CustomEvent 触发器）
    var headBtns = card.el.querySelectorAll('.ap-tool-card-head-btn');
    headBtns.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();  // 阻止 head 点击折叠
        var action = btn.getAttribute('data-action');
        var toolUseId = btn.getAttribute('data-tool-use-id');
        // 🆕 v0.115b：always-allow = 允许 + 本会话内此类操作自动通过
        var detail = { toolUseId: toolUseId, allow: (action === 'allow' || action === 'always-allow') };
        if (action === 'always-allow') detail.alwaysAllow = true;
        // 锁按钮（防双击）
        headBtns.forEach(function (b) { b.disabled = true; });
        document.dispatchEvent(new CustomEvent('qwen:tool-card:decision', { detail: detail }));
      });
    });

    // 绑定折叠按钮
    var toggleBtn = card.el.querySelector('.ap-tool-card-toggle');
    if (toggleBtn) {
      toggleBtn.style.cursor = 'pointer';
      toggleBtn.title = '点击展开/折叠';
      toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var body = card.el.querySelector('.ap-tool-card-body');
        var hidden = body.style.display === 'none';
        console.log('[debug] toggle click: hidden=', hidden, 'bodyExists=', !!body);
        setBodyVisible(card, hidden);
        // 验证展开后 body 高度
        setTimeout(() => {
          if (body) {
            console.log('[debug] after setBodyVisible: body display=', body.style.display, 'height=', body.offsetHeight);
          }
          const cardRect = card.el.getBoundingClientRect();
          console.log('[debug] card height after toggle:', cardRect.height);
        }, 50);
      });
    }
    // 点 head 也能折叠/展开（除了 toggle / head-btn 按钮）
    var head = card.el.querySelector('.ap-tool-card-head');
    head.addEventListener('click', function (e) {
      if (!e || !e.target) return;
      var t = e.target;
      // head-btn 已 stopPropagation 自处理；这里兜底
      if (typeof t.closest === 'function' && t.closest('.ap-tool-card-head-btn')) return;
      if (t.classList && t.classList.contains('ap-tool-card-toggle')) return;
      var body = card.el.querySelector('.ap-tool-card-body');
      var hidden = body.style.display === 'none';
      setBodyVisible(card, hidden);
    });
  }

  // 🆕 A1（2026-08-23）：确保 card 所在的 group body 可见（含 awaiting 时自动展开）
  // 🆕 v0.114w：展开 group 后滚到卡片可见 —— group 展开会改变卡片位置，
  //   之前 setBodyVisible 的滚动基于折叠态算的位置不准，这里以展开后为准。
  function ensureGroupVisible(card) {
    // 找到 card.el 的最近 group 祖先
    var parent = card.el && card.el.parentNode;
    while (parent && parent.nodeType === 1 && parent.classList &&
           !parent.classList.contains('ap-tool-group-body') && !parent.classList.contains('ap-tool-card')) {
      parent = parent.parentNode;
    }
    if (!parent || !parent.classList || !parent.classList.contains('ap-tool-group-body')) return;  // 不在 group 内
    var groupEl = parent.parentNode;  // .ap-tool-group
    if (!groupEl) return;
    var body = parent;  // .ap-tool-group-body
    if (body.style.display === 'none') {
      body.style.display = 'block';
      var head = groupEl.querySelector('.ap-tool-group-head');
      if (head) {
        var t = head.querySelector('.ap-tool-group-toggle');
        if (t) t.textContent = '▼';
      }
    }
    // 🆕 v0.114w：group body 已展开 → 滚动到卡片可见（覆盖底部展示不全）
    scrollCardIntoView(card.el);
  }

  // 🆕 P2：body 显示/隐藏 helper（统一管理 ▶/▼ + body display）
  // 🆕 v0.114w：展开后自动滚动到卡片可见 —— 卡片在对话流底部时，
  //   展开的 body 可能超出容器可视区（用户实报"扩展出来的内容展示不全"）。
  function setBodyVisible(card, visible) {
    var body = card.el.querySelector('.ap-tool-card-body');
    var toggleBtn = card.el.querySelector('.ap-tool-card-toggle');
    if (!body) return;
    body.style.display = visible ? 'block' : 'none';
    if (toggleBtn) toggleBtn.textContent = visible ? '▼' : '▶';
    if (visible) {
      // 🆕 v0.117p: 展开后添加短暂的高亮效果，帮助用户注意到卡片已展开
      card.el.style.boxShadow = '0 0 0 2px rgba(78, 205, 196, 0.5)';
      setTimeout(() => { card.el.style.boxShadow = ''; }, 500);
      scrollCardIntoView(card.el);
      // 🆕 v0.117s: 展开后滚动到卡片底部，确保气泡可见
      setTimeout(() => {
        var container = getContainer();
        if (container) {
          // 直接滚到容器底部（最可靠）
          container.scrollTop = container.scrollHeight;
        }
      }, 200);
    }
  }

  // 🆕 v0.114w：把卡片滚到聊天容器可视区内（底部时也能看到完整展开内容）
  function scrollCardIntoView(cardEl) {
    try {
      var container = getContainer();
      if (!container || !cardEl) return;
      var cardRect = cardEl.getBoundingClientRect();
      var contRect = container.getBoundingClientRect();
      // 卡片下边缘超出容器可视区 → 滚动让卡片底部可见（留 12px 呼吸）
      if (cardRect.bottom > contRect.bottom - 12) {
        container.scrollTop += (cardRect.bottom - contRect.bottom) + 12;
      }
      // 卡片上边缘在可视区上方 → 滚动回顶部
      else if (cardRect.top < contRect.top) {
        container.scrollTop += (cardRect.top - contRect.top);
      }
    } catch (e) { /* 滚动失败忽略 */ }
  }

  function paintInput(card) {
    var body = card.el.querySelector('.ap-tool-card-body');
    if (!body || !card.input) return;
    var html = '<div class="ap-tool-card-section">'
      + '<div class="ap-tool-card-section-head">📥 参数</div>'
      + renderInputByType(card.toolName, card.input)
      + '</div>';
    // 如果已经有 decision 区，插在它前面
    var decisionArea = body.querySelector('.ap-tool-card-decision');
    if (decisionArea) {
      decisionArea.insertAdjacentHTML('beforebegin', html);
    } else {
      body.insertAdjacentHTML('beforeend', html);
    }
  }

  function paintOutput(card) {
    var body = card.el.querySelector('.ap-tool-card-body');
    if (!body) return;
    if (card.output) {
      var truncated = card.output.length > 800 ? card.output.slice(0, 800) + '\n…(截断，原长度 ' + card.output.length + ')' : card.output;
      var rendered = null;
      // 🆕 P2：MCP acms_* 工具结构化渲染（替代通用 JSON）
      if (card.toolName && /^mcp__/.test(card.toolName)) {
        var mcpName = card.toolName.replace(/^mcp__[^_]+__/, '').toLowerCase();
        rendered = renderMcpAcmsOutput(mcpName, card.output);
      }
      var outHtml = rendered || '<pre class="ap-tool-card-output">' + escHtml(truncated) + '</pre>';
      body.insertAdjacentHTML('beforeend',
        '<div class="ap-tool-card-section">'
        + '<div class="ap-tool-card-section-head">' + (card.isError ? '⚠️ 错误详情' : '📤 输出') + '</div>'
        + outHtml
        + '</div>');
    }
  }

  function paintApproval(card) {
    var body = card.el.querySelector('.ap-tool-card-body');
    if (!body) return;
    var html = '<div class="ap-tool-card-decision">';
    if (card.isUserQuestion && card.questions && card.questions.length) {
      html += renderUserQuestionForm(card);
    } else if (card.status !== 'awaiting') {
      // 🆕 A2（2026-08-23）：awaiting 卡片 head 已有审批按钮，body 不重复
      html += '<div class="ap-tool-card-decision-buttons">'
        + '<button class="ap-tool-card-btn ap-tool-card-allow" data-action="allow" data-tool-use-id="' + escHtml(card.toolUseId) + '">✅ 允许</button>'
        + '<button class="ap-tool-card-btn ap-tool-card-deny" data-action="deny" data-tool-use-id="' + escHtml(card.toolUseId) + '">❌ 拒绝</button>'
        + '</div>';
    }
    html += '</div>';
    body.insertAdjacentHTML('beforeend', html);
    bindApprovalButtons(card);
    // 🆕 P2：ask_user_question Other 实时显示输入框
    if (card.isUserQuestion) bindUserQuestionOtherToggle(card);
  }

  // ============ 工具样式分发 ============
  function renderInputByType(toolName, input) {
    var t = String(toolName || '').toLowerCase();
    var inSafe = function (s, max) { return escHtml(truncate(String(s == null ? '' : s), max || 500)); };

    if (/^(read|read_file|cat)$/.test(t)) {
      return '<div class="ap-tool-card-path">' + inSafe(input.file_path || input.path || '') + '</div>';
    }
    if (/^(write|write_file|create_file)$/.test(t)) {
      var wp = input.file_path || input.path || '';
      var wc = input.content || '';
      return '<div class="ap-tool-card-path">' + inSafe(wp) + '</div>'
        + '<pre class="ap-tool-card-code">' + inSafe(wc, 800) + '</pre>';
    }
    if (/^(edit|edit_file|multi_edit_file|modify_file|replace_in_file)$/.test(t)) {
      var ep = input.file_path || input.path || '';
      var oldStr = input.old_string || input.oldText || '';
      var newStr = input.new_string || input.newText || (input.edits && input.edits[0] && input.edits[0].new_string) || '';
      return '<div class="ap-tool-card-path">' + inSafe(ep) + '</div>'
        + renderSimpleDiff(oldStr, newStr);
    }
    if (/^(bash|run_shell_command|shell|exec)$/.test(t)) {
      return '<pre class="ap-tool-card-code">' + inSafe(input.command || input.cmd || '') + '</pre>';
    }
    if (/^(glob|grep|search|list_files|list_dir|list_directory)$/.test(t)) {
      var pat = input.pattern || input.query || input.glob_pattern || '';
      var pth = input.path || input.dir || '';
      return '<code class="ap-tool-card-pattern">' + inSafe(pat) + '</code>'
        + (pth ? ' <span class="ap-tool-card-path">in ' + inSafe(pth) + '</span>' : '');
    }
    if (/^(web_fetch|fetch_url|webfetch)$/.test(t)) {
      var url = input.url || '';
      return '<a class="ap-tool-card-url" href="' + escAttr(url) + '" target="_blank" rel="noopener">' + inSafe(url, 200) + '</a>';
    }
    if (/^(web_search|websearch)$/.test(t)) {
      return '<code class="ap-tool-card-pattern">' + inSafe(input.query || input.search_query || '') + '</code>';
    }
    if (/^mcp__/.test(t)) {
      var mcpName = t.replace(/^mcp__[^_]+__/, '');
      // 🆕 P2：MCP acms_* 友好渲染（针对常见 4 类：web_search / web_fetch / task_list / task_get）
      var mcpHtml = renderMcpAcmsInput(mcpName, input);
      if (mcpHtml) return mcpHtml;
      // 通用 fallback（其他 acms_* 工具走 JSON）
      return '<div class="ap-tool-card-mcp-name">🔌 ' + escHtml(mcpName) + '</div>'
        + '<pre class="ap-tool-card-json">' + escHtml(JSON.stringify(input, null, 2).slice(0, 1000)) + '</pre>';
    }
    return '<pre class="ap-tool-card-json">' + escHtml(JSON.stringify(input, null, 2).slice(0, 1000)) + '</pre>';
  }

  // 🆕 P2：MCP acms_* 工具专用 input 渲染
  function renderMcpAcmsInput(mcpName, input) {
    if (mcpName === 'acms_web_search') {
      var q = input.query || input.search_query || '';
      return '<div class="ap-tool-card-mcp-name">🔍 搜索</div>'
        + '<code class="ap-tool-card-pattern">' + escHtml(q) + '</code>';
    }
    if (mcpName === 'acms_web_fetch' || mcpName === 'acms_fetch_url') {
      var u = input.url || '';
      return '<div class="ap-tool-card-mcp-name">🌐 抓取</div>'
        + '<a class="ap-tool-card-url" href="' + escAttr(u) + '" target="_blank" rel="noopener">' + escHtml(u) + '</a>';
    }
    if (mcpName === 'acms_task_list') {
      var proj = input.project_id || input.projectId || '';
      var status = input.status || '';
      var html = '<div class="ap-tool-card-mcp-name">📋 任务列表</div>';
      if (proj) html += '<div class="ap-tool-card-path">project: ' + escHtml(proj) + '</div>';
      if (status) html += '<div class="ap-tool-card-path">status: ' + escHtml(status) + '</div>';
      return html;
    }
    if (mcpName === 'acms_task_get') {
      var tid = input.task_id || input.taskId || '';
      return '<div class="ap-tool-card-mcp-name">📄 任务详情</div>'
        + '<code class="ap-tool-card-pattern">' + escHtml(tid) + '</code>';
    }
    if (mcpName === 'acms_email_send') {
      var to = input.to || '';
      var subj = input.subject || '';
      return '<div class="ap-tool-card-mcp-name">📧 发邮件</div>'
        + '<div class="ap-tool-card-path">→ ' + escHtml(to) + '</div>'
        + '<div class="ap-tool-card-path">主题: ' + escHtml(subj) + '</div>';
    }
    if (mcpName === 'acms_workspace_read_file' || mcpName === 'acms_workspace_write_file') {
      var p = input.file_path || input.path || '';
      var op = mcpName === 'acms_workspace_read_file' ? '📖 读文件' : '✏️ 写文件';
      return '<div class="ap-tool-card-mcp-name">' + op + '</div>'
        + '<div class="ap-tool-card-path">' + escHtml(p) + '</div>';
    }
    return null;  // 不认识 → 调用方走通用 JSON fallback
  }

  // 🆕 P2：MCP acms_* 工具专用 output 渲染（paintOutput 调用）
  function renderMcpAcmsOutput(mcpName, content) {
    // content 是 string；尝试 JSON.parse 拿结构化结果
    var parsed = null;
    try { parsed = JSON.parse(content); } catch (e) { /* 非 JSON */ }
    if (!parsed) return null;

    if (mcpName === 'acms_web_search' && parsed.results && Array.isArray(parsed.results)) {
      var html = '<div class="ap-tool-card-mcp-result">';
      parsed.results.slice(0, 5).forEach(function (r) {
        if (typeof r === 'string') {
          html += '<div class="ap-tool-card-search-item">• ' + escHtml(r.slice(0, 200)) + '</div>';
        } else if (r && r.title) {
          html += '<div class="ap-tool-card-search-item">'
            + '<a href="' + escAttr(r.url || '#') + '" target="_blank" rel="noopener">'
            + escHtml(r.title) + '</a>'
            + (r.snippet ? '<div class="ap-tool-card-search-snippet">' + escHtml(String(r.snippet).slice(0, 200)) + '</div>' : '')
            + '</div>';
        }
      });
      if (parsed.results.length > 5) html += '<div class="ap-tool-card-search-more">还有 ' + (parsed.results.length - 5) + ' 条...</div>';
      html += '</div>';
      return html;
    }
    if (mcpName === 'acms_task_list' && parsed.tasks && Array.isArray(parsed.tasks)) {
      var html = '<div class="ap-tool-card-mcp-result">';
      html += '<div class="ap-tool-card-task-count">共 ' + parsed.tasks.length + ' 个任务</div>';
      parsed.tasks.slice(0, 5).forEach(function (t) {
        html += '<div class="ap-tool-card-task-item">'
          + '<span class="ap-tool-card-task-status">' + escHtml(t.status || '?') + '</span> '
          + escHtml(t.title || t.id || '?')
          + '</div>';
      });
      if (parsed.tasks.length > 5) html += '<div class="ap-tool-card-task-more">还有 ' + (parsed.tasks.length - 5) + ' 个...</div>';
      html += '</div>';
      return html;
    }
    return null;
  }

  // ============ 简易 diff（D3 决策）============
  function renderSimpleDiff(oldStr, newStr) {
    var oldLines = String(oldStr || '').split('\n');
    var newLines = String(newStr || '').split('\n');
    var html = '<pre class="ap-tool-card-diff">';
    for (var i = 0; i < oldLines.length; i++) {
      html += '<span class="ap-diff-del">- ' + escHtml(oldLines[i]) + '</span>\n';
    }
    for (var j = 0; j < newLines.length; j++) {
      html += '<span class="ap-diff-add">+ ' + escHtml(newLines[j]) + '</span>\n';
    }
    html += '</pre>';
    return html;
  }

  // ============ ask_user_question 表单（v0.114k UI 规范）============
  function renderUserQuestionForm(card) {
    var qs = card.questions || [];
    var html = '<div class="ap-tool-card-questions">';
    qs.forEach(function (q, i) {
      var multi = !!q.multiSelect;
      var inputName = multi ? ('tcuq_' + i + '[]') : ('tcuq_' + i);
      var opts = (q.options || []).map(function (o) {
        var label = (typeof o === 'string') ? o : (o.label || o.value || '');
        return '<label class="ap-tool-card-q-opt">'
          + '<input type="' + (multi ? 'checkbox' : 'radio') + '" name="' + inputName + '" value="' + escAttr(label) + '">'
          + ' <span>' + escHtml(label) + '</span></label>';
      }).join('');
      // CLI 自动提供 Other（v0.114k 实证）
      opts += '<label class="ap-tool-card-q-opt ap-tool-card-q-other">'
        + '<input type="' + (multi ? 'checkbox' : 'radio') + '" name="' + inputName + '" value="__qwen_other__">'
        + ' Other（自定义）</label>';
      html += '<div class="ap-tool-card-q-block">'
        + '<div class="ap-tool-card-q-header">' + escHtml(q.header || ('问题 ' + (i + 1))) + '</div>'
        + '<div class="ap-tool-card-q-question">' + escHtml(q.question || '') + '</div>'
        + '<div class="ap-tool-card-q-opts">' + opts + '</div>'
        + '<input type="text" class="ap-tool-card-q-other-input" data-other="' + i + '" placeholder="选择 Other 时输入自定义回答..." style="display:none">'
        + '</div>';
    });
    html += '<div class="ap-tool-card-decision-buttons">'
      + '<button class="ap-tool-card-btn ap-tool-card-deny" data-action="deny" data-tool-use-id="' + escHtml(card.toolUseId) + '">取消</button>'
      + '<button class="ap-tool-card-btn ap-tool-card-allow" data-action="allow-uq" data-tool-use-id="' + escHtml(card.toolUseId) + '">提交回答</button>'
      + '</div>';
    html += '</div>';
    return html;
  }

  // 🆕 P2：ask_user_question Other 选中时实时显示输入框（v0.114k 缺失补丁）
  function bindUserQuestionOtherToggle(card) {
    (card.questions || []).forEach(function (q, i) {
      var inputName = (q.multiSelect ? ('tcuq_' + i + '[]') : ('tcuq_' + i));
      var otherInput = card.el.querySelector('.ap-tool-card-q-other-input[data-other="' + i + '"]');
      if (!otherInput) return;
      // 监听所有 input[type=radio|checkbox] in this question
      var inputs = card.el.querySelectorAll('input[name="' + inputName + '"]');
      inputs.forEach(function (inp) {
        inp.addEventListener('change', function () {
          // 检查是否选中了 Other（任一 checked 的 input value === __qwen_other__）
          var othersChecked = false;
          inputs.forEach(function (o) {
            if (o.value === '__qwen_other__' && o.checked) othersChecked = true;
          });
          otherInput.style.display = othersChecked ? 'block' : 'none';
          if (othersChecked) otherInput.focus();
        });
      });
    });
  }

  // ============ 审批按钮 click → CustomEvent ============
  function bindApprovalButtons(card) {
    var buttons = card.el.querySelectorAll('.ap-tool-card-btn');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var action = btn.getAttribute('data-action');
        var toolUseId = btn.getAttribute('data-tool-use-id');
        var detail = { toolUseId: toolUseId };
        if (action === 'allow-uq') {
          // ask_user_question：收集 answers
          var answers = {};
          (card.questions || []).forEach(function (q, i) {
            var inputName = (q.multiSelect ? ('tcuq_' + i + '[]') : ('tcuq_' + i));
            var checked = card.el.querySelectorAll('input[name="' + inputName + '"]:checked');
            var otherInput = card.el.querySelector('.ap-tool-card-q-other-input[data-other="' + i + '"]');
            var values = [];
            checked.forEach(function (c) {
              if (c.value === '__qwen_other__') {
                var custom = (otherInput && otherInput.value.trim()) || '';
                if (custom) values.push(custom);
              } else {
                values.push(c.value);
              }
            });
            answers[q.answerKey || String(i)] = values.join(', ');
          });
          detail.allow = true;
          detail.answers = answers;
        } else {
          detail.allow = (action === 'allow');
        }
        // 锁掉按钮（防双击）
        buttons.forEach(function (b) { b.disabled = true; });
        // 触发全局事件，由 agent-buddy.js 监听 + 调 /api/qwen/approvals/:id
        document.dispatchEvent(new CustomEvent('qwen:tool-card:decision', { detail: detail }));
      });
    });
  }

  // ============ utils ============
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escAttr(s) { return escHtml(s); }
  function truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

// ============ Expose ============
  window.ACMSQwenToolCard = {
    handleToolCard: handleToolCard,
    handleThinking: handleThinking,
    reset: reset,
    onReplyStart: onReplyStart,   // 🆕 v0.115a：Agent 回复开始 → 封存当前 group（回复段分组）
    setContainer: function (c) { _container = c; },  // 🆕 v0.117f：自由对话窗口容器（#chat-stream-msgs-sess-xxx）也能渲染工具卡片
    debugCount: function () { return _apInsertedAt; },
  };
})();