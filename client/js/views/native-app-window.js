// ACMS 「本地应用」窗口（v0.59+）— 显示 Puppeteer CDP screencast 推流
//
// 用法：
//   ACMSWin.open('native-app', { sessionId, url, title, icon });
//   或通过 helper：
//   window.openNativeApp(url, { title, icon, w, h });
//
// 协议：
//   - 后端 REST  → POST /api/app-runtime/open → { sessionId }
//   - 后端 WS    → ws://<host>/ws/app-runtime/{sessionId}
//     onmessage  → { type: 'frame', data: <base64 jpeg>, metadata }  /  'ready' / 'navigated' / 'error' / 'closed'
//     send       → { type: 'mousemove' | 'mousedown' | 'mouseup' | 'click' | 'keydown' | 'type' | 'wheel'
//                       | 'navigate' | 'back' | 'forward' | 'reload' | 'resize' | 'exec', ... }
//   - 后端 REST  → POST /api/app-runtime/close → 关 session
//
// 设计要点：
//   - canvas 显示（不直接嵌 iframe，避免被目标页 X-Frame / window.top 检测拒绝）
//   - 鼠标坐标转换：CSS px → device px（按 metadata.deviceWidth 比例）
//   - WS 断线 3s 自动重连
//   - 窗口关闭 → 关 WS + close session（不依赖 beforeunload）
//   - canvas 永远 tabIndex=0 接收键盘；点窗口任意位置 .focus()

(function () {
  'use strict';

  // ── 全局 helper：任何地方都能"打开一个外部 URL 当本地应用" ──
  // 取代之前 web-browser 自动 fallback 的复杂流程
  async function openNativeApp(url, options) {
    options = options || {};
    var resp = await fetch('/api/app-runtime/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': (window.ACMSConfig && window.ACMSConfig.apiKey) || 'dev-key-001' },
      body: JSON.stringify({
        url: url,
        w: options.w || 1024,
        h: options.h || 700,
      }),
    }).then(function (r) { return r.json(); }).catch(function (e) { return { error: e.message }; });
    if (!resp || resp.error || !resp.session) {
      alert('打开本地应用失败: ' + (resp && resp.error || 'unknown'));
      return null;
    }
    var session = resp.session;
    if (window.ACMSWin && ACMSWin.open) {
      ACMSWin.open('native-app', {
        w: session.w, h: session.h,
        title: options.title || url,
        sessionId: session.sessionId,
        url: session.url,
      });
    } else {
      console.warn('[native-app] ACMSWin 不可用，无法开窗');
    }
    return session;
  }
  window.openNativeApp = openNativeApp;

  // ── 主渲染函数（注册到 package-registry）──
  function render(w, opts) {
    opts = opts || {};
    var sessionId = opts.sessionId;

    // 渲染骨架
    w.$c.innerHTML = ''
      + '<div class="na-root" style="position:absolute;inset:0;background:#1e1e1e;overflow:hidden">'
      +   '<canvas class="na-canvas" tabindex="0" style="width:100%;height:100%;display:block;cursor:default;outline:none"></canvas>'
      +   '<textarea class="na-ime-input" aria-label="本地应用文字输入" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" style="position:absolute;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none"></textarea>'
      +   '<div class="na-toolbar" style="position:absolute;top:6px;right:6px;display:flex;gap:4px;z-index:5;opacity:0.35;transition:opacity .15s" '
      +     'onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0.35">'
      +     '<button class="na-btn" data-act="back" title="后退" style="background:rgba(0,0,0,0.5);color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:14px;line-height:1">‹</button>'
      +     '<button class="na-btn" data-act="forward" title="前进" style="background:rgba(0,0,0,0.5);color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:14px;line-height:1">›</button>'
      +     '<button class="na-btn" data-act="reload" title="刷新" style="background:rgba(0,0,0,0.5);color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:14px;line-height:1">↻</button>'
      +     '<button class="na-btn" data-act="url" title="转到 URL" style="background:rgba(0,0,0,0.5);color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:13px;line-height:1">URL</button>'
      +   '</div>'
      +   '<div class="na-status" style="position:absolute;bottom:0;left:0;right:0;padding:3px 10px;font-size:11px;color:rgba(255,255,255,0.7);background:rgba(0,0,0,0.55);font-family:monospace;display:flex;justify-content:space-between;gap:12px">'
      +     '<span class="na-status-text">启动中…</span>'
      +     '<span class="na-status-url" style="opacity:0.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>'
      +   '</div>'
      + '</div>';
    w.$c.style.overflow = 'hidden';
    w.$c.style.background = '#1e1e1e';

    var $root = w.$c.querySelector('.na-root');
    var $canvas = w.$c.querySelector('.na-canvas');
    var $ime = w.$c.querySelector('.na-ime-input');
    var $status = w.$c.querySelector('.na-status-text');
    var $url = w.$c.querySelector('.na-status-url');
    var ctx = $canvas.getContext('2d');

    if (!sessionId) {
      $status.textContent = '错误: 无 sessionId';
      return;
    }

    var ws = null;
    var reconnectTimer = null;
    var scaleX = 1, scaleY = 1;   // CSS px → device px
    var lastFrameAt = 0;
    var containerRect = null;
    var closed = false;
    var imgQueue = [];          // 接帧节流：只保留最新一帧
    var drawing = false;

    var canvasWidth = 0, canvasHeight = 0;

    function syncCanvasSize(rect) {
      var width = Math.max(1, Math.round(rect.width));
      var height = Math.max(1, Math.round(rect.height));
      if (canvasWidth === width && canvasHeight === height) return;
      canvasWidth = width;
      canvasHeight = height;
      $canvas.width = width;
      $canvas.height = height;
    }

    // ── 自适应 viewport 同步给后端 ──
    function reportSize() {
      var rect = $canvas.getBoundingClientRect();
      containerRect = rect;
      syncCanvasSize(rect);
      // 等比映射 deviceWidth → CSS width；deviceHeight → CSS height
      // 但 page 不需严格等比（page 端独立 viewport）
      send({ type: 'resize', w: Math.round(rect.width), h: Math.round(rect.height) });
    }
    try {
      var ro = new ResizeObserver(function () { reportSize(); });
      ro.observe($canvas);
    } catch (e) {
      window.addEventListener('resize', reportSize);
    }

    function setStatus(text) { $status.textContent = text; }
    function setUrl(text) { $url.textContent = text || ''; }

    // ── 节流绘制：HTTP 来的 jpeg 帧堆栈，新帧覆盖旧的，画完再读下一帧 ──
    function drawLoop() {
      if (drawing) return;
      if (imgQueue.length === 0) return;
      drawing = true;
      var item = imgQueue.shift();
      var img = new Image();
      img.onload = function () {
        var rect = $canvas.getBoundingClientRect();
        syncCanvasSize(rect);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        // deviceWidth / deviceHeight (CDP screencast metadata) → CSS rect
        var dw = item.metadata && item.metadata.deviceWidth || img.width;
        var dh = item.metadata && item.metadata.deviceHeight || img.height;
        if (rect.width > 0 && rect.height > 0) {
          scaleX = dw / rect.width;
          scaleY = dh / rect.height;
          ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
        }
        lastFrameAt = Date.now();
        drawing = false;
        if (imgQueue.length > 0) requestAnimationFrame(drawLoop);
      };
      img.onerror = function () {
        drawing = false;
        if (imgQueue.length > 0) requestAnimationFrame(drawLoop);
      };
      img.src = 'data:image/jpeg;base64,' + item.data;
    }

    function onFrame(data, metadata) {
      imgQueue.push({ data: data, metadata: metadata });
      if (imgQueue.length > 3) imgQueue.shift();   // 限制堆积：丢老帧不丢新帧
      drawLoop();
    }

    // ── WebSocket ──
    function connect() {
      var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      var wsUrl = proto + '//' + location.host + '/ws/app-runtime/' + sessionId;
      setStatus('连接中…');
      try {
        ws = new WebSocket(wsUrl);
      } catch (e) { setStatus('连接失败: ' + e.message); return; }

      ws.onopen = function () {
        setStatus('已连接 · 渲染中');
      };
      ws.onclose = function () {
        if (closed) return;
        setStatus('连接断开，3s 后重连…');
        reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = function () {
        setStatus('连接错误');
      };
      ws.onmessage = function (ev) {
        var msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === 'ready') {
          setStatus('已连接');
          setUrl(msg.url || '');
          reportSize();
        } else if (msg.type === 'frame') {
          onFrame(msg.data, msg.metadata);
        } else if (msg.type === 'navigated') {
          setUrl(msg.url || '');
        } else if (msg.type === 'error') {
          setStatus('错误: ' + msg.message);
        } else if (msg.type === 'closed') {
          setStatus('已关闭');
        } else if (msg.type === 'pong') { /* keepalive */ }
      };
    }

    function send(event) {
      if (!ws || ws.readyState !== 1) return;
      // 坐标转换：CSS px → device px（仅鼠标类；键盘直接转）
      if (event.type === 'mousemove' || event.type === 'mousedown' || event.type === 'mouseup' ||
          event.type === 'click' || event.type === 'dblclick') {
        // scaleX 已在前一帧 drawImage 算出：device = css * scale
        var dx = Math.round(event.x * scaleX);
        var dy = Math.round(event.y * scaleY);
        var payload = { type: event.type, x: dx, y: dy };
        if (event.button !== undefined) payload.button = event.button;
        ws.send(JSON.stringify(payload));
        return;
      }
      ws.send(JSON.stringify(event));
    }

    // ── 鼠标事件（绑到 canvas）──
    var dragging = false, lastMoveTs = 0;
    $canvas.addEventListener('mousemove', function (e) {
      var now = Date.now();
      if (now - lastMoveTs < 16) return;          // 节流 ~60fps
      lastMoveTs = now;
      send({ type: 'mousemove', x: e.offsetX, y: e.offsetY });
    });
    $canvas.addEventListener('mousedown', function (e) {
      e.preventDefault(); $canvas.focus();
      send({ type: 'mousedown', x: e.offsetX, y: e.offsetY, button: e.button });
    });
    $canvas.addEventListener('mouseup', function (e) {
      e.preventDefault();
      send({ type: 'mouseup', x: e.offsetX, y: e.offsetY, button: e.button });
    });
    $canvas.addEventListener('click', function (e) {
      e.preventDefault();
      $canvas.focus();
    });
    $canvas.addEventListener('dblclick', function (e) {
      e.preventDefault();
    });
    $canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      send({ type: 'wheel', dx: e.deltaX, dy: e.deltaY });
    });
    $canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      send({ type: 'mousedown', x: e.offsetX, y: e.offsetY, button: 2 });
      send({ type: 'mouseup', x: e.offsetX, y: e.offsetY, button: 2 });
    });

    // ── 键盘 + IME ──
    // 控制键走 keydown/up；文字（含中文、emoji）由真实 textarea 接收后走 type。
    var composing = false;
    var ignoreNextInput = false;

    function focusIme() {
      try { $ime.focus({ preventScroll: true }); } catch (e) { $ime.focus(); }
    }

    function kb(e, type) {
      if (e.isComposing || composing || e.key === 'Process' || e.keyCode === 229) return;
      var printable = e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (printable) return; // textarea 的 input 事件负责提交，避免同一字符发两次
      e.preventDefault();
      send({ type: type, key: e.key, code: e.code });
    }

    $ime.addEventListener('compositionstart', function () { composing = true; });
    $ime.addEventListener('compositionend', function (e) {
      composing = false;
      var text = e.data || $ime.value;
      if (text) send({ type: 'type', text: text });
      $ime.value = '';
      ignoreNextInput = true;
      setTimeout(function () { ignoreNextInput = false; }, 0);
    });
    $ime.addEventListener('input', function () {
      if (composing || ignoreNextInput) return;
      var text = $ime.value;
      if (text) send({ type: 'type', text: text });
      $ime.value = '';
    });
    $ime.addEventListener('keydown', function (e) { kb(e, 'keydown'); });
    $ime.addEventListener('keyup', function (e) { kb(e, 'keyup'); });

    // Canvas 保留键盘监听作兼容；正常点击后焦点转给 IME textarea。
    $canvas.addEventListener('keydown', function (e) { kb(e, 'keydown'); });
    $canvas.addEventListener('keyup', function (e) { kb(e, 'keyup'); });

    // 点窗口页面区域后让系统输入法附着到真实可编辑元素。
    $canvas.addEventListener('click', focusIme);

    // ── 工具栏 ──
    $root.querySelector('.na-btn[data-act=back]').onclick = function () { send({ type: 'back' }); };
    $root.querySelector('.na-btn[data-act=forward]').onclick = function () { send({ type: 'forward' }); };
    $root.querySelector('.na-btn[data-act=reload]').onclick = function () { send({ type: 'reload' }); };
    $root.querySelector('.na-btn[data-act=url]').onclick = async function () {
      var cur = ($url.textContent || '').trim();
      var u = window.showPrompt ? await window.showPrompt('转到 URL', cur) : window.prompt('转到 URL', cur);
      if (u) send({ type: 'navigate', url: u });
    };

    // ── 窗口关闭：清理 WS + 关 session ──
    var origClose = w.onClose;
    w.onClose = function () {
      closed = true;
      try { if (reconnectTimer) clearTimeout(reconnectTimer); } catch {}
      try { if (ws) ws.close(); } catch {}
      // 关 session（fire and forget — 服务端会清理 BrowserContext）
      fetch('/api/app-runtime/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': (window.ACMSConfig && window.ACMSConfig.apiKey) || 'dev-key-001' },
        body: JSON.stringify({ sessionId: sessionId }),
      }).catch(function () {});
      if (typeof origClose === 'function') origClose();
    };

    // ── 启动 ──
    connect();

    // ── 窗口可见性联动（v0.59 P2-3）── 最小化/被遮挡 → 停 screencast 省 CPU；恢复 → 重启
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) send({ type: 'pause' });
      else send({ type: 'resume' });
    });

    // ResizeObserver 顺手把当前宽高推给后端，保证 screencast 截图跟 canvas 同步
    // （handler 端会把 deviceWidth/Height 推回给前端用于坐标换算）
  }

  // ── 注册到包系统 ──
  if (window.ACMS && ACMS.registerPackage) {
    ACMS.registerPackage('native-app', {
      title: '本地应用',
      icon: '🪟',
      category: '工具',
      description: '把外部网页装进「本地应用壳」(Puppeteer CDP 流推送)',
      defaultSize: { w: 1024, h: 700 },
      loader: render,
    });
  } else if (window.ACMSWin) {
    ACMSWin.registerViewLoader('native-app', render);
  }
})();
