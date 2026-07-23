// ACMS 内部浏览器窗口 — 地址栏 + iframe 预览（v0.59：被 X-Frame 限时可切到 native-app）
// 注册为 ACMSWin.registerViewLoader('web-browser', loader)
(function() {
  'use strict';

  var historyStack = [];
  var currentUrl = '';
  var browsingWindow = null;
  // v0.61：renderer ∈ { 'iframe', 'preview' }。preview 走内联 Canvas + appRuntime WS。
  var renderer = 'iframe';
  var preview = null; // { sessionId, ws, ctx, scaleX, scaleY, dead, firstFrameTimer, reconnectTimer, queue, drawing, img }

  function showPreviewFailure(msg) {
    var el = document.getElementById('wb-preview-failure');
    var txt = document.getElementById('wb-preview-failure-text');
    if (txt) txt.textContent = msg || '远程预览（实验）— 未能建立首帧';
    if (el) el.style.display = 'flex';
  }
  function hidePreviewFailure() {
    var el = document.getElementById('wb-preview-failure');
    if (el) el.style.display = 'none';
  }

  // ── 远程预览（实验）内联渲染器 ──
  function startRemotePreview(url) {
    stopRemotePreview();
    hidePreviewFailure();
    var canvas = document.getElementById('wb-remote-canvas');
    if (!canvas) return;
    var ctx2d = canvas.getContext('2d');
    if (ctx2d) ctx2d.fillStyle = '#1e1e1e';
    var rect = canvas.getBoundingClientRect();
    if (rect.width > 0) {
      canvas.width = Math.max(1, Math.round(rect.width));
      canvas.height = Math.max(1, Math.round(rect.height));
    }
    setStatus('正在启动远程预览…');

    var state = {
      sessionId: null, ws: null, canvas: canvas, ctx: ctx2d,
      scaleX: 1, scaleY: 1, dead: false,
      queue: [], drawing: false, img: null,
      firstFrameTimer: null, reconnectTimer: null,
    };
    preview = state;

    // 5 秒内未收到首帧 → 失败卡
    state.firstFrameTimer = setTimeout(function () {
      if (state.dead) return;
      if (state.queue.length === 0) {
        showPreviewFailure('远程预览（实验）— 5 秒内未收到首帧（页面可能不兼容远程预览）');
        setStatus('远程预览无响应');
      }
    }, 5000);

    function connectWS() {
      if (state.dead || !state.sessionId) return;
      var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      var ws = new WebSocket(proto + '//' + location.host + '/ws/app-runtime/' + state.sessionId);
      state.ws = ws;
      ws.onopen = function () { setStatus('远程预览已连接'); };
      ws.onmessage = function (ev) {
        if (state.dead) return;
        var msg = null;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (msg.type === 'frame') {
          drawFrame(msg.data, msg.metadata);
        } else if (msg.type === 'navigated') {
          var input = document.getElementById('wb-url');
          if (input && msg.url) input.value = msg.url;
          setStatus('已跳转 ' + msg.url);
        } else if (msg.type === 'error') {
          setStatus('远程预览错误: ' + msg.message);
        } else if (msg.type === 'closed') {
          showPreviewFailure('远程预览（实验）— 服务端已关闭');
        }
      };
      ws.onclose = function () {
        if (state.dead) return;
        setStatus('远程预览连接断开，3 秒后重连…');
        state.reconnectTimer = setTimeout(connectWS, 3000);
      };
      ws.onerror = function () { setStatus('远程预览连接错误'); };
    }

    function drawFrame(data, metadata) {
      state.queue.push({ data: data, metadata: metadata });
      if (state.queue.length > 3) state.queue.shift();
      if (state.firstFrameTimer) { clearTimeout(state.firstFrameTimer); state.firstFrameTimer = null; }
      if (state.drawing) return;
      state.drawing = true;
      var item = state.queue.shift();
      // 真正的输入桥接见后文：本函数只负责渲染帧，不要在此发起 fetch。
      var img = new Image();
      state.img = img;
      img.onload = function () {
        if (state.dead) { state.drawing = false; return; }
        var rect2 = state.canvas.getBoundingClientRect();
        if (rect2.width > 0) {
          state.canvas.width = Math.max(1, Math.round(rect2.width));
          state.canvas.height = Math.max(1, Math.round(rect2.height));
        }
        state.ctx.fillStyle = '#fff';
        state.ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);
        var dw = (item.metadata && item.metadata.deviceWidth) || img.width;
        var dh = (item.metadata && item.metadata.deviceHeight) || img.height;
        if (rect2.width > 0) { state.scaleX = dw / rect2.width; state.scaleY = dh / rect2.height; }
        state.ctx.drawImage(img, 0, 0, state.canvas.width, state.canvas.height);
        state.drawing = false;
        if (state.queue.length > 0) requestAnimationFrame(function () {
          if (state.dead) return;
          var next = state.queue.shift();
          var i2 = new Image();
          state.img = i2;
          i2.onload = img.onload;
          i2.onerror = function () { state.drawing = false; };
          i2.src = 'data:image/jpeg;base64,' + next.data;
          state.drawing = true;
        });
      };
      img.onerror = function () { state.drawing = false; };
      img.src = 'data:image/jpeg;base64,' + item.data;
    }

    // 远程预览 canvas 接收鼠标/滚轮/键盘并转发到后端 /api/app-runtime/input。
    // 文字输入走隐藏 textarea + compositionend；控制键走 keydown/keyup。
    var $ime = document.createElement('textarea');
    $ime.setAttribute('aria-label', '远程预览文字输入');
    $ime.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;opacity:0';
    if (canvas.parentNode) canvas.parentNode.appendChild($ime);
    var composing = false, ignoreNextInput = false, lastMoveTs = 0;
    function focusIme() { try { $ime.focus({ preventScroll: true }); } catch (e) { $ime.focus(); } }
    function sendInput(event) {
      if (state.dead || !state.sessionId) return;
      fetch('/api/app-runtime/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify(Object.assign({ sessionId: state.sessionId }, event)),
      }).catch(function () {});
    }
    function kb(e, type) {
      if (e.isComposing || composing || e.key === 'Process' || e.keyCode === 229) return;
      var printable = e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (printable) return;
      e.preventDefault();
      sendInput({ type: type, key: e.key, code: e.code });
    }
    $ime.addEventListener('compositionstart', function () { composing = true; });
    $ime.addEventListener('compositionend', function (e) {
      composing = false;
      var text = e.data || $ime.value;
      if (text) sendInput({ type: 'type', text: text });
      $ime.value = '';
      ignoreNextInput = true;
      setTimeout(function () { ignoreNextInput = false; }, 0);
    });
    $ime.addEventListener('input', function () {
      if (composing || ignoreNextInput) return;
      var text = $ime.value;
      if (text) sendInput({ type: 'type', text: text });
      $ime.value = '';
    });
    $ime.addEventListener('keydown', function (e) { kb(e, 'keydown'); });
    $ime.addEventListener('keyup', function (e) { kb(e, 'keyup'); });
    canvas.addEventListener('mousemove', function (e) {
      var now = Date.now();
      if (now - lastMoveTs < 32) return;
      lastMoveTs = now;
      var sx = state.scaleX || 1, sy = state.scaleY || 1;
      sendInput({ type: 'mousemove', x: Math.round(e.offsetX * sx), y: Math.round(e.offsetY * sy) });
    });
    canvas.addEventListener('mousedown', function (e) {
      e.preventDefault(); focusIme();
      var sx = state.scaleX || 1, sy = state.scaleY || 1;
      sendInput({ type: 'mousedown', x: Math.round(e.offsetX * sx), y: Math.round(e.offsetY * sy), button: e.button });
    });
    canvas.addEventListener('mouseup', function (e) {
      e.preventDefault();
      var sx = state.scaleX || 1, sy = state.scaleY || 1;
      sendInput({ type: 'mouseup', x: Math.round(e.offsetX * sx), y: Math.round(e.offsetY * sy), button: e.button });
    });
    canvas.addEventListener('click', function (e) { e.preventDefault(); focusIme(); });
    canvas.addEventListener('dblclick', function (e) { e.preventDefault(); });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      sendInput({ type: 'wheel', dx: e.deltaX, dy: e.deltaY });
    });
    state._ime = $ime;
    // 远端页面用 navigated 事件推回地址栏时，地址栏已被 connectWS 内的 onmessage 覆盖；这里只补充点击态
    function disposeIme() { try { if ($ime && $ime.parentNode) $ime.parentNode.removeChild($ime); } catch (e) {} }
    var _origDead = state.dead;
    Object.defineProperty(state, 'dead', { configurable: true, get: function () { return _origDead; }, set: function (v) { if (v) disposeIme(); _origDead = v; } });

    var apiKey = (window.ACMSConfig && window.ACMSConfig.apiKey) || 'dev-key-001';
    fetch('/api/app-runtime/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ url: url, w: 1024, h: 700 }),
    }).then(function (r) { return r.json(); }).then(function (resp) {
      if (state.dead) return;
      if (!resp || !resp.session) {
        showPreviewFailure('远程预览（实验）启动失败: ' + ((resp && resp.error) || 'unknown'));
        setStatus('远程预览启动失败');
        return;
      }
      state.sessionId = resp.session.sessionId;
      connectWS();
    }).catch(function (e) {
      if (state.dead) return;
      showPreviewFailure('远程预览（实验）启动失败: ' + e.message);
      setStatus('远程预览启动失败');
    });
  }

  function stopRemotePreview() {
    if (!preview) return;
    preview.dead = true;
    if (preview.firstFrameTimer) clearTimeout(preview.firstFrameTimer);
    if (preview.reconnectTimer) clearTimeout(preview.reconnectTimer);
    try { if (preview.ws) preview.ws.close(); } catch (e) {}
    var sid = preview.sessionId;
    preview = null;
    if (sid) {
      fetch('/api/app-runtime/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ sessionId: sid }),
      }).catch(function () {});
    }
  }

  // ── 渲染 ──
  function render(w) {
    if (w.dead) return;
    browsingWindow = w;

    var html = '';
    // 工具栏
    html += '<div style="display:flex;align-items:center;gap:4px;padding:6px 8px;border-bottom:1px solid var(--border);flex-shrink:0">';
    html += '<button class="wb-btn" onclick="window.WB_goBack()" title="后退" id="wb-back" style="opacity:0.4">◀</button>';
    html += '<button class="wb-btn" onclick="window.WB_goForward()" title="前进" id="wb-forward" style="opacity:0.4">▶</button>';
    html += '<button class="wb-btn" onclick="window.WB_refresh()" title="刷新">↻</button>';
    html += '<input id="wb-url" type="text" placeholder="输入 URL 或搜索…" value="' + escHtml(currentUrl) + '" style="flex:1;min-width:0;padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:12px;font-family:inherit;outline:none" onkeydown="if(event.key===\'Enter\')window.WB_go(this.value)">';
    html += '<button class="wb-btn" onclick="window.WB_go(document.getElementById(\'wb-url\').value)" title="前往">前往</button>';
    html += '<button class="wb-btn" onclick="window.WB_openExternal()" title="在系统浏览器中打开" style="font-size:14px">↗</button>';
    // v0.61：远程预览（实验）切换 — 在当前浏览器窗口内联启动 remote preview，不再开新窗口
    var previewBtnStyle = 'padding:4px 8px;border-radius:4px;border:1px solid ' + (renderer === 'preview' ? 'var(--accent);background:var(--accent);color:var(--window-bg)' : 'var(--border);background:transparent;color:var(--text2)') + ';cursor:pointer;font-size:13px';
    html += '<button class="wb-btn" id="wb-preview-toggle" onclick="window.WB_togglePreview()" title="在当前窗口用「远程预览（实验）」渲染当前 URL（绕过 X-Frame / CSP）" style="' + previewBtnStyle + '">🪟</button>';
    html += '</div>';

    // iframe 区域
    html += '<div id="wb-container" style="flex:1;position:relative;background:#fff">';
    if (currentUrl) {
      if (renderer === 'preview') {
        // v0.61：远程预览（实验）— 在当前浏览器窗口内联渲染，避免再开新窗口
        html += '<div id="wb-preview" style="position:absolute;inset:0;display:flex;flex-direction:column;background:#1e1e1e">'
          + '<canvas id="wb-remote-canvas" tabindex="0" style="flex:1;width:100%;height:100%;display:block;background:#fff;outline:none"></canvas>'
          + '<div id="wb-preview-failure" style="display:none;position:absolute;inset:0;background:rgba(20,20,20,0.92);color:#fff;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center">'
          +   '<div style="font-size:36px">⚠️</div>'
          +   '<div id="wb-preview-failure-text" style="font-size:13px;max-width:360px">远程预览（实验）— 未能建立首帧</div>'
          +   '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">'
          +     '<button class="wb-btn" onclick="window.WB_backToIframe()" style="padding:6px 14px;background:transparent;color:#fff;border:1px solid #555;border-radius:6px;cursor:pointer">返回 iframe</button>'
          +     '<button class="wb-btn" onclick="window.WB_openExternal()" style="padding:6px 14px;background:var(--accent);color:var(--window-bg);border:none;border-radius:6px;cursor:pointer">↗ 系统浏览器打开</button>'
          +   '</div>'
          + '</div>'
          + '</div>';
      } else {
        html += '<iframe id="wb-iframe" src="' + escHtml(currentUrl) + '" style="width:100%;height:100%;border:none" sandbox="allow-scripts allow-same-origin allow-forms" onerror="window.WB_showFallback()"></iframe>';
      }
    } else {
      html += '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text2);font-size:14px;flex-direction:column;gap:8px">' +
        '<div style="font-size:48px">🌐</div>' +
        '<div>在地址栏输入网址开始浏览</div>' +
        '<div style="font-size:11px;color:var(--text3)">支持预览 HTML 文件、文档站等</div>' +
        '</div>';
    }
    html += '<div id="wb-blocked" style="display:none;position:absolute;inset:0;background:var(--bg);flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px">' +
      '<div style="font-size:40px">🚫</div>' +
      '<div style="font-size:14px;color:var(--text);text-align:center">该页面禁止在 iframe 中显示</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">' +
        '<button class="wb-btn" onclick="window.WB_togglePreview()" style="padding:6px 14px;background:var(--accent);color:var(--window-bg);border:none;border-radius:6px;cursor:pointer">🪟 远程预览（实验）</button>' +
        '<button class="wb-btn" onclick="window.WB_openExternal()" style="padding:6px 14px;background:transparent;color:var(--text);border:1px solid var(--border);border-radius:6px;cursor:pointer">↗ 系统浏览器打开</button>' +
      '</div>' +
      '</div>';
    html += '</div>';

    // 状态栏
    html += '<div id="wb-status" style="padding:2px 8px;font-size:10px;color:var(--text2);border-top:1px solid var(--border);flex-shrink:0">就绪</div>';

    w.$c.innerHTML = html;
    w.$c.style.display = 'flex';
    w.$c.style.flexDirection = 'column';
  }

  // ── 导航 ──
  function go(url) {
    if (!url || !url.trim()) return;
    url = url.trim();
    // 没有协议头则补 http://
    if (!/^https?:\/\//i.test(url)) {
      url = 'http://' + url;
    }
    var input = document.getElementById('wb-url');
    if (input) input.value = url;

    if (currentUrl) historyStack.push(currentUrl);
    currentUrl = url;

    var container = document.getElementById('wb-container');
    if (!container) return;
    container.innerHTML = '<iframe id="wb-iframe" src="' + escHtml(url) + '" style="width:100%;height:100%;border:none" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>' +
      '<div id="wb-blocked" style="display:none;position:absolute;inset:0;background:var(--bg);flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px">' +
      '<div style="font-size:40px">🚫</div>' +
      '<div style="font-size:14px;color:var(--text);text-align:center">该页面禁止在 iframe 中显示</div>' +
      '<button class="wb-btn" onclick="window.WB_openExternal()" style="padding:6px 16px;background:var(--accent);color:var(--window-bg);border:none;border-radius:6px;cursor:pointer">↗ 在系统浏览器中打开</button>' +
      '</div>';

    setStatus('加载 ' + url + ' …');
    updateNavBtns();

    // 检测 iframe 是否被屏蔽
    var iframe = document.getElementById('wb-iframe');
    if (iframe) {
      iframe.addEventListener('load', function() {
        setStatus('完成');
      });
      // 某些浏览器在 X-Frame-Options 拒绝时触发 error 事件
      iframe.addEventListener('error', function() {
        showBlocked();
      });
      // 兜底：2 秒后检查
      setTimeout(function() {
        try {
          if (iframe.contentDocument || iframe.contentWindow) {
            // 如果能访问，说明加载正常
          }
        } catch(e) {
          // 跨域或屏蔽
          showBlocked();
        }
      }, 2000);
    }
  }

  function showBlocked() {
    var blocked = document.getElementById('wb-blocked');
    if (blocked) blocked.style.display = 'flex';
    setStatus('该页面禁止在 iframe 中显示');
  }

  function setStatus(msg) {
    var el = document.getElementById('wb-status');
    if (el) el.textContent = msg;
  }

  function updateNavBtns() {
    var back = document.getElementById('wb-back');
    var fwd = document.getElementById('wb-forward');
    if (back) back.style.opacity = historyStack.length > 0 ? '1' : '0.4';
    if (fwd) fwd.style.opacity = '0.4'; // 暂不支持前进
  }

  function goBack() {
    if (historyStack.length === 0) return;
    var url = historyStack.pop();
    currentUrl = url;
    var input = document.getElementById('wb-url');
    if (input) input.value = url;
    var container = document.getElementById('wb-container');
    if (container) {
      container.innerHTML = '<iframe id="wb-iframe" src="' + escHtml(url) + '" style="width:100%;height:100%;border:none" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>' +
        '<div id="wb-blocked" style="display:none;position:absolute;inset:0;background:var(--bg);flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px">' +
        '<div style="font-size:40px">🚫</div>' +
        '<div style="font-size:14px;color:var(--text);text-align:center">该页面禁止在 iframe 中显示</div>' +
        '<button class="wb-btn" onclick="window.WB_openExternal()" style="padding:6px 16px;background:var(--accent);color:var(--window-bg);border:none;border-radius:6px;cursor:pointer">↗ 在系统浏览器中打开</button>' +
        '</div>';
    }
    setStatus('就绪');
    updateNavBtns();
  }

  function refresh() {
    if (currentUrl) go(currentUrl);
  }

  function openExternal() {
    var url = document.getElementById('wb-url');
    if (url && url.value.trim()) {
      window.open(url.value.trim(), '_blank');
    }
  }

  // v0.61：远程预览（实验）切换 — 在当前浏览器窗口内联渲染，不开新窗口
  function togglePreview() {
    var url = (currentUrl || '').trim();
    if (!url) { setStatus('请先在地址栏输入 URL'); return; }
    if (renderer === 'preview') {
      stopRemotePreview();
      renderer = 'iframe';
      if (browsingWindow) render(browsingWindow);
      setStatus('已返回 iframe 预览');
    } else {
      renderer = 'preview';
      if (browsingWindow) render(browsingWindow);
      startRemotePreview(url);
    }
  }

  function backToIframe() {
    stopRemotePreview();
    renderer = 'iframe';
    if (browsingWindow) render(browsingWindow);
    setStatus('已返回 iframe 预览');
  }

  // ── 辅助 ──
  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── 全局函数 ──
  window.WB_go = function(url) { go(url); };
  window.WB_goBack = goBack;
  window.WB_goForward = function() {};
  window.WB_refresh = refresh;
  window.WB_openExternal = openExternal;
  window.WB_togglePreview = togglePreview;
  window.WB_backToIframe = backToIframe;
  window.WB_stopPreview = stopRemotePreview;
  window.WB_showFallback = showBlocked;

  // v0.61：关窗前清理远程预览会话，避免僵尸 Chromium
  window.addEventListener('beforeunload', function () { try { stopRemotePreview(); } catch (e) {} });

  // 启动浏览器窗口
  window.openWebBrowser = function() {
    if (window.ACMSWin) {
      if (!ACMSWin.isActive()) ACMSWin.enable();
      ACMSWin.open('web-browser', { w: 820, h: 560, title: '🌐 浏览器' });
    }
  };

  // ── 注册 viewLoader ──
  if (window.ACMSWin) {
    // v0.58 包注册
    if (window.ACMS && ACMS.registerPackage) {
      ACMS.registerPackage('web-browser', {
        title: '浏览器', icon: '🌐', category: '工具',
        defaultSize: { w: 820, h: 560 },
        loader: function(w) {
          render(w);
          var opts = arguments[1] || {};
          if (opts && opts.url) {
            go(opts.url);
          }
        }
      });
    } else {
      ACMSWin.registerViewLoader('web-browser', function(w) {
        render(w);
        var opts = arguments[1] || {};
        if (opts && opts.url) {
          go(opts.url);
        }
      });
    }
  }

})();
