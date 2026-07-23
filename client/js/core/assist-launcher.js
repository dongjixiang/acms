// ACMS 辅助工具浮动窗口 — 视图加载函数（v0.61）
//
// 被 index.html IIFE 的 PKG('assist-free', ...) loader 调用
// 定义全局 window.loadAssistFreeView(root, opts)
//
// 依赖：card-renderer.js（ACMS.CardRenderer）

(function() {
  'use strict';

  // ── 视图加载器（全局，被 PKG loader 调用）──

  window.loadAssistFreeView = function(root, opts) {
    if (!root) return;

    var method = opts && opts.method;

    root.innerHTML =
      '<div style="display:flex;flex-direction:column;height:100%;padding:12px;gap:8px">' +
        // 快捷入口
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px" class="af-shortcuts">' +
          '<button class="af-btn" data-hint="生成图片" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg2);cursor:pointer;font-size:12px">🎨 生图</button>' +
          '<button class="af-btn" data-hint="播放音乐" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg2);cursor:pointer;font-size:12px">🎵 音乐</button>' +
          '<button class="af-btn" data-hint="搜索信息" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg2);cursor:pointer;font-size:12px">🔍 搜索</button>' +
          '<button class="af-btn" data-hint="生成文档" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg2);cursor:pointer;font-size:12px">📄 文档</button>' +
          '<button class="af-btn" data-hint="发邮件" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg2);cursor:pointer;font-size:12px">📧 邮件</button>' +
        '</div>' +
        // 结果容器
        '<div id="af-results" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:4px 0"></div>' +
        // 输入行
        '<div style="display:flex;gap:6px;flex-shrink:0">' +
          '<input id="af-input" type="text" placeholder="输入你的需求…" style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);color:var(--text);font-size:13px;outline:none" autocomplete="off">' +
          '<button id="af-send" style="padding:8px 16px;border-radius:8px;border:none;background:var(--accent1, #0ea89d);color:#fff;cursor:pointer;font-size:13px;font-weight:bold">➤</button>' +
        '</div>' +
      '</div>';

    var input = root.querySelector('#af-input');
    var sendBtn = root.querySelector('#af-send');
    var results = root.querySelector('#af-results');

    if (!input || !sendBtn || !results) return;

    // 如果传了 method hint，预填输入框并自动发送
    if (method) {
      var hintText = {
        'generate_image': '帮我生成一张图',
        'play_music': '播放一首歌',
        'web_search': '搜索一下',
        'web_research': '调研一下',
        'document_gen': '帮我生成一个文档',
        'send_email': '帮我发一封邮件',
        'play_video': '帮我做一个视频',
        'fetch_url': '帮我抓取一个网页',
      }[method] || '';
      if (hintText) {
        input.value = hintText + ' ';
        setTimeout(function() { input.focus(); input.select(); }, 100);
      }
    } else {
      input.focus();
    }

    function doSend() {
      var text = input.value.trim();
      if (!text) return;
      input.value = '';
      sendToAssist(text, results);
    }

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); doSend(); }
    });
    sendBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      doSend();
    });

    // 快捷按钮点击
    root.addEventListener('click', function(e) {
      var btn = e.target.closest('.af-btn');
      if (!btn) return;
      var hint = btn.getAttribute('data-hint');
      if (hint) {
        input.value = hint + ' ';
        input.focus();
      }
    });
  };

  // ── 后端调用 ──

  function sendToAssist(text, resultsContainer) {
    addUserBubble(resultsContainer, text);
    addLoadingBubble(resultsContainer);

    var headers = { 'Content-Type': 'application/json' };
    var token = null;
    try { token = localStorage.getItem('acms-token'); } catch(e) {}
    if (token) headers['Authorization'] = 'Bearer ' + token;
    else headers['X-API-Key'] = 'dev-key-001';

    fetch('/api/assist-free/detect', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ text: text }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      removeLoading(resultsContainer);
      var reply = data.reply || '完成～';
      var cards = data.cards || [];

      addBuddyBubble(resultsContainer, reply);

      cards.forEach(function(c) {
        addCardToContainer(resultsContainer, c.type, c.payload);
      });
    })
    .catch(function() {
      removeLoading(resultsContainer);
      addBuddyBubble(resultsContainer, '网络开小差了，再试一次？');
    });
  }

  // ── DOM 辅助 ──

  function addUserBubble(container, text) {
    var div = document.createElement('div');
    div.style.cssText = 'align-self:flex-end;max-width:80%;padding:6px 12px;border-radius:12px 12px 4px 12px;background:var(--accent1,#0ea89d);color:#fff;font-size:13px';
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function addBuddyBubble(container, text) {
    var div = document.createElement('div');
    div.style.cssText = 'align-self:flex-start;max-width:80%;padding:6px 12px;border-radius:12px 12px 12px 4px;background:var(--bg3,rgba(255,255,255,0.06));color:var(--text);font-size:13px;line-height:1.4';
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function addLoadingBubble(container) {
    var div = document.createElement('div');
    div.id = 'af-loading';
    div.style.cssText = 'align-self:flex-start;padding:6px 12px;border-radius:12px;background:var(--bg3,rgba(255,255,255,0.06));color:var(--text3);font-size:13px';
    div.textContent = '⏳ 处理中...';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function removeLoading() {
    var el = document.getElementById('af-loading');
    if (el) el.remove();
  }

  function addCardToContainer(container, type, payload) {
    if (!window.ACMS || !ACMS.CardRenderer) return;
    var cardEl = ACMS.CardRenderer.renderCard(type, payload);
    if (!cardEl) return;
    cardEl.style.marginTop = '4px';
    container.appendChild(cardEl);
    container.scrollTop = container.scrollHeight;
  }
})();