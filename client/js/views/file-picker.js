// ACMS · 通用文件选择器（v0.1）
// 路径：client/js/views/file-picker.js
//
// 用途：自由对话 / 需求对话的「📁 文件」入口 —— 弹层选文件 → 用对应 ACMS 应用打开
//
// 用法：
//   const picked = await window.ACMSFilePicker.pick();   // {path,name,ext,type} | null
//   await window.ACMSFilePicker.openFile(picked);
//   或一步到位（按钮入口）：
//   chatOpenFilePicker('__free__')
//
// 依赖：file-app-registry.js（ACMSFileApps）、acms-modal.js（ACMSModal）、api.js（api/API_KEY）
//
// 设计说明（踩坑预防）：
//   1. 选中状态存闭包变量 state.sel，不跨 modal 销毁边界读 DOM
//      （modal cleanup 会同步 removeChild，await 之后再查 DOM 必为 null — 见 acms-modal-overlay-pitfalls P52）
//   2. ACMSModal 没暴露 close，用 beforeCleanup 改写返回值实现「双击直开」
//      （acms-modal.js: value = ret 后再 resolve，所以 beforeCleanup 可以替换 value）
//   3. 列表动态重渲染 → 事件委托绑在列表容器上（P178 模式），不逐行 addEventListener

(function () {
  'use strict';

  var AK = (typeof API_KEY !== 'undefined' && API_KEY) ? API_KEY : 'dev-key-001';

  // ── 小工具 ──
  function extOf(name) {
    var s = String(name || '');
    var d = s.lastIndexOf('.');
    return (d < 0 || d === s.length - 1) ? '' : s.slice(d + 1).toLowerCase();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  function fmtTime(iso) {
    try {
      var d = new Date(iso), now = new Date();
      var p = function (x) { return (x < 10 ? '0' : '') + x; };
      if (isNaN(d.getTime())) return '';
      var hm = p(d.getHours()) + ':' + p(d.getMinutes());
      if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
      return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + hm;
    } catch (e) { return ''; }
  }

  function toastMsg(msg, type) {
    if (typeof toast === 'function') { try { toast(msg, type || 'info'); return; } catch (e) {} }
    console.log('[file-picker]', msg);
  }

  // 文件是否"可直接用 ACMS 应用打开"（用于给不匹配的文件加灰标记）
  function appsFor(item) {
    if (!window.ACMSFileApps) return [];
    try { return window.ACMSFileApps.getAppsForFile(item.name, '', { hasPath: true }) || []; }
    catch (e) { return []; }
  }

  // ── 弹层 CSS（用 ACMS 三主题变量，跟随主题切换）──
  var CSS = '' +
    // v0.121i: 固定宽度 —— ACMSModal 只设了 min/max-width 没设 width，弹层是 shrink-to-fit，
    //   文件名一长弹层就变宽；而 overlay 是居中的 → 位置跟着左右跳（实测被用户抓到）
    '.acms-fp{display:flex;flex-direction:column;gap:10px;min-height:380px;width:min(880px,86vw);box-sizing:border-box}' +
    '.acms-fp .fp-bar{display:flex;align-items:center;gap:8px}' +
    '.acms-fp .fp-up{width:30px;height:30px;flex:0 0 auto;border:1px solid var(--border);background:var(--bg3);' +
      'color:var(--text2);border-radius:7px;cursor:pointer;font-size:13px;line-height:1}' +
    '.acms-fp .fp-up:hover{border-color:var(--accent);color:var(--accent)}' +
    '.acms-fp .fp-up:disabled{opacity:.35;cursor:default}' +
    '.acms-fp .fp-root{height:30px;padding:0 10px;flex:0 0 auto;border:1px solid var(--border);background:var(--bg3);' +
      'color:var(--text2);border-radius:7px;cursor:pointer;font-size:12px}' +
    '.acms-fp .fp-root:hover{border-color:var(--accent);color:var(--accent)}' +
    '.acms-fp .fp-path{flex:1;min-width:0;font-size:12px;color:var(--text2);background:var(--bg3);' +
      'border:1px solid var(--border);border-radius:7px;padding:6px 10px;white-space:nowrap;overflow:hidden;' +
      'text-overflow:ellipsis;direction:rtl;text-align:left}' +
    '.acms-fp .fp-search{width:190px;flex:0 0 auto;height:30px;background:var(--bg3);border:1px solid var(--border);' +
      'border-radius:7px;color:var(--text);padding:0 10px;font-size:12px;outline:none;font-family:inherit}' +
    '.acms-fp .fp-search:focus{border-color:var(--accent)}' +
    '.acms-fp .fp-list{flex:1;min-height:300px;max-height:44vh;overflow-y:auto;border:1px solid var(--border);' +
      'border-radius:9px;background:var(--bg3);padding:5px}' +
    '.acms-fp .fp-row{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:7px;cursor:pointer;' +
      'font-size:13px;color:var(--text)}' +
    '.acms-fp .fp-row:hover{background:var(--bg4)}' +
    '.acms-fp .fp-row.sel{background:rgba(78,205,196,.16);box-shadow:inset 0 0 0 1px var(--accent)}' +
    '.acms-fp .fp-ic{width:18px;flex:0 0 auto;text-align:center;font-size:14px}' +
    '.acms-fp .fp-nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.acms-fp .fp-sz{flex:0 0 auto;width:74px;text-align:right;font-size:11px;color:var(--text3)}' +
    '.acms-fp .fp-tm{flex:0 0 auto;width:82px;text-align:right;font-size:11px;color:var(--text3)}' +
    '.acms-fp .fp-tag{flex:0 0 auto;font-size:10px;padding:1px 6px;border-radius:999px;' +
      'background:rgba(78,205,196,.15);color:var(--accent)}' +
    '.acms-fp .fp-none{flex:0 0 auto;font-size:10px;color:var(--text3)}' +
    '.acms-fp .fp-empty{padding:26px;text-align:center;color:var(--text3);font-size:12.5px}' +
    '.acms-fp .fp-foot{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text2);min-height:18px}' +
    '.acms-fp .fp-foot b{color:var(--accent);font-weight:600}' +
    '.acms-fp .fp-hint{color:var(--text3);font-size:11px;margin-left:auto}';

  // ── 主入口：pick() → Promise<item|null> ──
  function pick(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var state = { cur: opts.startPath || '', parent: null, entries: [], sel: null, q: '' };
      var settled = false;

      var html =
        '<style>' + CSS + '</style>' +
        '<div class="acms-fp" id="acms-fp">' +
          '<div class="fp-bar">' +
            '<button class="fp-up" id="fp-up" title="上一层">⬆</button>' +
            '<button class="fp-root" id="fp-root" title="回到工作区根目录">🏠 工作区</button>' +
            '<span class="fp-path" id="fp-path" title="">/</span>' +
            '<input class="fp-search" id="fp-search" placeholder="在当前目录筛选…">' +
          '</div>' +
          '<div class="fp-list" id="fp-list"></div>' +
          '<div class="fp-foot"><span id="fp-sel">未选择文件</span>' +
            '<span class="fp-hint">双击文件直接打开 · 双击文件夹进入</span></div>' +
        '</div>';

      var promise = window.ACMSModal.show({
        title: '📁 打开文件',
        size: 'xl',
        html: html,
        root: opts.root || undefined,
        actions: [
          { label: '取消', value: null, className: 'acms-modal-btn' },
          { label: '打开', value: 'OPEN', className: 'acms-modal-btn acms-modal-btn-primary' },
        ],
        // beforeCleanup 可改写返回值（acms-modal.js: value = ret → resolve(value)）
        beforeCleanup: function (value) {
          if (value === 'OPEN') return state.sel;   // 交给调用方；null 表示没选
          return null;
        },
      });

      // ACMSModal 在 Promise executor 内同步构造 DOM → 这里同步查得到
      var root = document.getElementById('acms-fp');
      if (!root) { resolve(null); return; }

      var listEl = document.getElementById('fp-list');
      var pathEl = document.getElementById('fp-path');
      var upEl = document.getElementById('fp-up');
      var selEl = document.getElementById('fp-sel');
      var searchEl = document.getElementById('fp-search');

      function closeWithSel() {
        var pb = document.querySelector('.acms-modal-overlay .acms-modal-btn-primary');
        if (pb) pb.click();
      }

      function render() {
        pathEl.textContent = state.cur || '/';
        pathEl.title = state.cur || '/';
        upEl.disabled = !state.parent;

        var q = state.q.toLowerCase();
        var rows = state.entries.filter(function (e) {
          return !q || String(e.name).toLowerCase().indexOf(q) >= 0;
        });

        if (!rows.length) {
          listEl.innerHTML = '<div class="fp-empty">' +
            (state.entries.length ? '没有匹配「' + esc(state.q) + '」的文件' : '这个目录是空的') + '</div>';
          return;
        }

        listEl.innerHTML = rows.map(function (e, i) {
          var isDir = e.type === 'dir';
          var app = isDir ? null : appsFor(e);
          var tag = '';
          if (!isDir) {
            tag = app.length
              ? '<span class="fp-tag">' + esc(String(app[0].label || '').replace(/^[^\u4e00-\u9fa5A-Za-z]+/, '') || app[0].name) + '</span>'
              : '<span class="fp-none">无应用</span>';
          }
          return '<div class="fp-row" data-i="' + i + '" data-name="' + esc(e.name) + '">' +
            '<span class="fp-ic">' + (isDir ? '📁' : (e.icon || '📄')) + '</span>' +
            '<span class="fp-nm">' + esc(e.name) + '</span>' +
            (isDir ? '' : '<span class="fp-sz">' + fmtSize(e.size) + '</span>') +
            '<span class="fp-tm">' + fmtTime(e.mtime) + '</span>' +
            (isDir ? '' : tag) +
          '</div>';
        }).join('');
      }

      function markSel(name) {
        listEl.querySelectorAll('.fp-row').forEach(function (r) {
          r.classList.toggle('sel', r.getAttribute('data-name') === name);
        });
      }

      function load(p) {
        var url = '/api/files' + (p ? '?path=' + encodeURIComponent(p) : '');
        return api('GET', url.replace(/^\/api/, '')).then(function (r) {
          state.cur = r.currentPath || '';
          state.parent = r.parentPath || null;
          state.entries = r.entries || [];
          state.sel = null;
          selEl.textContent = '未选择文件';
          render();
        }).catch(function (e) {
          listEl.innerHTML = '<div class="fp-empty">读取失败：' + esc((e && e.message) || '未知错误') + '</div>';
        });
      }

      // ── 事件（委托 + 闭包状态）──
      listEl.addEventListener('click', function (e) {
        var row = e.target.closest('.fp-row');
        if (!row) return;
        var name = row.getAttribute('data-name');
        var it = state.entries.filter(function (x) { return String(x.name) === name; })[0];
        if (!it) return;
        if (it.type === 'dir') { return; }        // 单击文件夹不进去，等双击
        state.sel = { path: (state.cur.replace(/\/$/, '') + '/' + it.name), name: it.name, type: 'file', ext: extOf(it.name) };
        selEl.innerHTML = '已选：<b>' + esc(it.name) + '</b>';
        markSel(name);
      });

      listEl.addEventListener('dblclick', function (e) {
        var row = e.target.closest('.fp-row');
        if (!row) return;
        var name = row.getAttribute('data-name');
        var it = state.entries.filter(function (x) { return String(x.name) === name; })[0];
        if (!it) return;
        if (it.type === 'dir') { load((state.cur.replace(/\/$/, '') + '/' + it.name)); return; }
        state.sel = { path: (state.cur.replace(/\/$/, '') + '/' + it.name), name: it.name, type: 'file', ext: extOf(it.name) };
        closeWithSel();                            // 双击文件 = 打开
      });

      upEl.addEventListener('click', function () { if (state.parent) load(state.parent); });
      document.getElementById('fp-root').addEventListener('click', function () { load(''); });

      var tmr = null;
      searchEl.addEventListener('input', function () {
        clearTimeout(tmr);
        var v = searchEl.value;
        tmr = setTimeout(function () { state.q = v; render(); }, 120);
      });

      // 结果（modal 关闭后 resolve；state.sel 活在闭包里，不依赖 DOM）
      promise.then(function (v) {
        if (settled) return;
        settled = true;
        resolve(v && v.path ? v : null);
      });

      load(state.cur);
    });
  }

  // ── v0.121: 打开后把窗口吸附进对话流（坐标跟随，不 reparent）──
  function _winById(id) {
    if (!window.ACMSWin || !ACMSWin.getWindows) return null;
    var ws = ACMSWin.getWindows();
    for (var i = 0; i < ws.length; i++) { if (ws[i].id === id) return ws[i]; }
    return null;
  }

  function _winIds() {
    if (!window.ACMSWin || !ACMSWin.getWindows) return [];
    return ACMSWin.getWindows().map(function (w) { return w.id; });
  }

  // 刚才 openFileWith 新开出来的窗口（用前后 diff 拿引用，避免改 registry 的每个分支）
  function _newWinSince(ids) {
    if (!window.ACMSWin || !ACMSWin.getWindows) return null;
    var ws = ACMSWin.getWindows();
    for (var i = ws.length - 1; i >= 0; i--) { if (ids.indexOf(ws[i].id) < 0) return ws[i]; }
    return null;
  }

  // 找可见的对话消息流
  //   P88：主窗口的 hidden 模板里也有一份 chat-stream-msgs，必须挑可见的那份
  function _visibleStream() {
    var list = document.querySelectorAll('[id^="chat-stream-msgs"]');
    for (var i = 0; i < list.length; i++) { if (list[i].offsetParent !== null) return list[i]; }
    return null;
  }

  // 按 reqId 精确取所属对话的消息流（多对话窗口同时开时，_visibleStream 会嵌错窗）
  function _streamFor(reqId) {
    if (!reqId) return null;
    var list = document.querySelectorAll('[id="chat-stream-msgs-' + reqId + '"]');
    for (var i = 0; i < list.length; i++) { if (list[i].offsetParent !== null) return list[i]; }
    return null;
  }

  // 在消息流末尾插槽位 → 窗口吸附过去；窗口被拖走时槽位露出，充当"归位占位"
  function dockIntoChat(w, item, reqId) {
    if (!w || !window.ACMSWin || !ACMSWin.dockTo) return false;
    var stream = _streamFor(reqId) || _visibleStream();
    if (!stream) return false;
    var slot = document.createElement('div');
    slot.className = 'chat-dock-slot';
    slot.id = 'chat-dock-slot-' + w.id;
    slot.innerHTML = esc(item.name) + ' · 已浮出 <button type="button">回到对话</button>';
    slot.querySelector('button').addEventListener('click', function () {
      ACMSWin.dockTo(w, slot, { mode: 'embed' });
    });
    stream.appendChild(slot);
    w._chatDockSlot = slot;
    try { ACMSWin.dockTo(w, slot, { mode: 'embed' }); } catch (e) { return false; }
    _injectPinBtn(w, stream);
    _bindCtxPick(w, stream);
    setActiveCtx(stream, w);
    stream.scrollTop = stream.scrollHeight;
    // 窗口关闭 → 槽位一起清掉，别留孤儿占位
    var prevClose = w.onClose;
    w.onClose = function () {
      try { slot.remove(); } catch (e) {}
      if (typeof prevClose === 'function') { try { prevClose(); } catch (e) {} }
    };
    return true;
  }

  // ── v0.121: 钉住工作区（顶部 / 右侧，默认右侧）──
  //   工作区容器在对话面板模板里（index.html 自由对话 + idea-panel.js 需求对话两处都有）
  //   钉住 = 把窗口 dock 到工作区里的槽位（工作区在滚动容器外 → 不随对话滚动）
  var PIN_KEY = 'acms-chat-pin-place';

  function _pinPlace() {
    try { return localStorage.getItem(PIN_KEY) === 'top' ? 'top' : 'side'; } catch (e) { return 'side'; }
  }

  function _hostWinOfStream(stream) {
    var n = stream, ws = (window.ACMSWin && ACMSWin.getWindows) ? ACMSWin.getWindows() : [];
    while (n && n !== document.body) {
      if (n.classList && n.classList.contains('acms-window')) {
        for (var i = 0; i < ws.length; i++) { if (ws[i].el === n) return ws[i]; }
        return null;
      }
      n = n.parentElement;
    }
    return null;
  }

  function _pinBody(stream, place) {
    var host = _hostWinOfStream(stream);
    if (!host || !host.$c) return null;
    return host.$c.querySelector('.chat-pin-zone-' + place + ' .chat-pin-body');
  }

  // 哪个工作区有内容就显示哪个（空的不占地方）
  function _showPinZone(stream, place) {
    var host = _hostWinOfStream(stream);
    if (!host || !host.$c) return;
    ['top', 'side'].forEach(function (p) {
      var z = host.$c.querySelector('.chat-pin-zone-' + p);
      if (!z) return;
      var body = z.querySelector('.chat-pin-body');
      var has = !!(body && body.children.length);
      z.style.display = (has && p === (place || _pinPlace())) ? 'flex' : 'none';
    });
  }

  function _syncPinBtn(w, pinned) {
    var b = w.el.querySelector('.aw-btn-pin');
    if (b) b.classList.toggle('active', !!pinned);
  }

  // 标题栏加 📌（只给内嵌窗口加，不影响其它窗口的通用行为）
  function _injectPinBtn(w, stream) {
    var ctl = w.el.querySelector('.aw-controls');
    if (!ctl || ctl.querySelector('.aw-btn-pin')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'aw-btn aw-btn-pin';
    b.title = '钉到工作区（不随对话滚动）';
    b.textContent = '📌';
    b.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (w._dock && w._dock.mode === 'pin') unpin(w, stream);
      else pinTo(stream, w);
    });
    // v0.121c: ⧉ 变浮窗（原型里每个窗口都有，之前只能靠拖标题栏这个隐式手势）
    var f = document.createElement('button');
    f.type = 'button';
    f.className = 'aw-btn aw-btn-float';
    f.title = '脱离对话变浮窗（可自由移动）';
    f.textContent = '⧉';
    f.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    f.addEventListener('click', function (e) {
      e.stopPropagation();
      if (window.ACMSWin && ACMSWin.undock) ACMSWin.undock(w);
      if (w._chatDockSlot && w._chatDockSlot.parentNode) { /* 槽位留着当归位占位 */ }
      _syncPinBtn(w, false);
      _showPinZone(stream, _pinPlace());
    });
    ctl.insertBefore(f, ctl.firstChild);
    ctl.insertBefore(b, ctl.firstChild);
  }

  // 点窗口任意处 → 它成为对话上下文
  function _bindCtxPick(w, stream) {
    if (w._ctxBound) return;
    w._ctxBound = true;
    w.el.addEventListener('mousedown', function () { setActiveCtx(stream, w); }, true);
  }

  function pinTo(stream, w, place) {
    place = place || _pinPlace();
    var body = _pinBody(stream, place);
    if (!body || !window.ACMSWin || !ACMSWin.dockTo) return false;
    // v0.121h: 记住钉住前的形态 —— 取消钉住要回到那个形态，
    //   不能无脑内嵌（浮窗→钉住→取消 会跑到消息流末尾变成"新窗口"，实测踩到）
    if (!w._prePinMode) w._prePinMode = (w._dock && w._dock.mode) ? w._dock.mode : 'float';
    var slot = document.getElementById('chat-pin-slot-' + w.id);
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'chat-dock-slot';
      slot.id = 'chat-pin-slot-' + w.id;
      slot.innerHTML = '📌 ' + esc(w.st.titleOverride || w.st.title || '窗口') +
        ' · 已钉住 <button type="button">取消钉住</button>';
      // 沿用用户在内嵌态拖出来的尺寸（别一钉就跳回默认）
      if (w._userDockSize) {
        slot.style.width = 'min(' + w._userDockSize.w + 'px, 100%)';
        slot.style.height = w._userDockSize.h + 'px';
      }
      slot.querySelector('button').addEventListener('click', function () { unpin(w, stream); });
      body.appendChild(slot);
    }
    try { ACMSWin.dockTo(w, slot, { mode: 'pin' }); } catch (e) { return false; }
    // 消息流里原来那个槽位留着当"归位占位"
    _showPinZone(stream, place);
    _syncPinBtn(w, true);
    _refreshEmbedTools();
    return true;
  }

  function unpin(w, stream) {
    if (!w || !w._dock) return;
    var slot = document.getElementById('chat-pin-slot-' + w.id);
    var preMode = w._prePinMode || 'embed';
    w._prePinMode = null;
    ACMSWin.undock(w);          // undock 会把 _dockHome（钉住前的位置/尺寸）还回来
    if (slot) slot.remove();
    _syncPinBtn(w, false);
    _showPinZone(stream, _pinPlace());
    var reqId = (stream.getAttribute('id') || '').replace('chat-stream-msgs-', '');

    if (preMode === 'embed') {
      // 钉之前就嵌在对话里 → 回到消息流
      dockIntoChat(w, { name: w.st.titleOverride || w.st.title || '窗口', path: null }, reqId);
    } else {
      // 钉之前是浮窗 → 留在浮窗原位（位置已由 undock 恢复），
      //   顺带清掉消息流里那个归位占位（窗口已经不在对话里了）
      var oldSlot = w._chatDockSlot;
      if (oldSlot && oldSlot.parentNode) oldSlot.remove();
      w._chatDockSlot = null;
      if (window.ACMSWin && ACMSWin.syncDock) { try { ACMSWin.syncDock(w); } catch (e) {} }
    }
  }

  // ── v0.121g: 面板右上角常驻开关（对齐原型顶栏的两组 seg）──
  //   把选中态刷到所有 .chat-embed-tools 上（窗口是动态克隆的，可能同时存在多份）
  function _refreshEmbedTools() {
    var pp = _pinPlace(), im = _injectMode();
    document.querySelectorAll('.chat-embed-tools').forEach(function (box) {
      box.querySelectorAll('[data-seg="pin"] button').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-v') === pp);
      });
      box.querySelectorAll('[data-seg="inject"] button').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-v') === im);
      });
    });
  }

  // 钉住位置：顶部 / 右侧（已钉住的窗口跟着迁到新工作区）
  window.chatSetPinPlace = function (reqId, place) {
    place = place === 'top' ? 'top' : 'side';
    try { localStorage.setItem(PIN_KEY, place); } catch (e) {}
    var stream = _streamFor(reqId) || _visibleStream();
    if (stream && window.ACMSWin && ACMSWin.getWindows) {
      ACMSWin.getWindows().forEach(function (w) {
        if (w._dock && w._dock.mode === 'pin') {
          var old = document.getElementById('chat-pin-slot-' + w.id);
          if (old) old.remove();
          pinTo(stream, w, place);
        }
      });
      _showPinZone(stream, place);
    }
    _refreshEmbedTools();
  };

  // 上下文注入：引用+按需 / 全文
  window.chatSetInjectMode = function (reqId, mode) {
    mode = mode === 'full' ? 'full' : 'ref';
    try { localStorage.setItem(INJECT_KEY, mode); } catch (e) {}
    var stream = _streamFor(reqId) || _visibleStream();
    var w = (_activeCtx && _activeCtx.windowId) ? _winById(_activeCtx.windowId) : null;
    if (stream && w) setActiveCtx(stream, w);   // 重新注册（后端按会话记模式）
    else _refreshEmbedTools();
  };

  // 工作区头部的 ⇄（保留作快捷方式）—— 在两个位置间切换
  window.chatPinSwitch = function (reqId) {
    chatSetPinPlace(reqId, _pinPlace() === 'top' ? 'side' : 'top');
  };

  // 启动时同步选中态（窗口模板是动态克隆的，多打两次保证命中）
  setTimeout(_refreshEmbedTools, 700);
  setTimeout(_refreshEmbedTools, 2200);

  // ── v0.121: 选中窗口 = 对话上下文 ──
  //   点窗口 → 输入框上方出现 chip + 注册到后端（后端拼 prompt 时把"当前选中窗口"写进系统上下文）
  //   注册走 /api/chat/session-ctx，避免改 chat.js 的发送路径（那是兄弟 agent 的高频改动文件）
  var _activeCtx = null;
  var INJECT_KEY = 'acms-chat-inject-mode';
  function _injectMode() {
    try { return localStorage.getItem(INJECT_KEY) === 'full' ? 'full' : 'ref'; } catch (e) { return 'ref'; }
  }

  function _streamIdOf(stream) {
    return (stream.getAttribute('id') || '').replace('chat-stream-msgs-', '');
  }

  function renderCtxChip(stream, info) {
    var host = _hostWinOfStream(stream);
    if (!host || !host.$c) return;
    var inp = host.$c.querySelector('.chat-stream-input');
    if (!inp) return;
    var bar = inp.querySelector('.chat-ctx-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'chat-ctx-bar';
      inp.insertBefore(bar, inp.firstChild);
    }
    if (!info) { bar.innerHTML = ''; bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    var _m = _injectMode();
    // v0.121g: 注入模式开关移到面板右上角的常驻控件（跟原型一致，这里只留关联对象本身）
    var _modeTag = _m === 'full' ? '全文' : '引用';
    bar.innerHTML = '<span class="chat-ctx-chip" title="后续提问会自动关联这个窗口；注入方式在右上角切换">🔗 <b>' +
      esc(info.name) + '</b><span class="chat-ctx-tag">' + _modeTag + '</span>' +
      '<span class="chat-ctx-x" title="取消关联">✕</span></span>';
    bar.querySelector('.chat-ctx-x').addEventListener('click', function (e) {
      e.stopPropagation();
      _activeCtx = null;
      renderCtxChip(stream, null);
      try { api('POST', '/chat-sessions/' + _streamIdOf(stream) + '/ctx', { ctx: null }); } catch (err) {}
    });
  }

  function setActiveCtx(stream, w) {
    if (!stream || !w) return;
    var info = {
      windowId: w.id,
      view: w.view,
      name: w.st.titleOverride || w.st.title || '窗口',
      filePath: (w._dockItem && w._dockItem.path) || null,
      fileId: w._fileId || null,
      injectMode: _injectMode(),
    };
    _activeCtx = info;
    renderCtxChip(stream, info);
    _refreshEmbedTools();
    try { api('POST', '/chat-sessions/' + _streamIdOf(stream) + '/ctx', { ctx: info }); } catch (e) {}
  }

  // ── 用匹配的 ACMS 应用打开 ──
  function openFile(item, opts) {
    opts = opts || {};
    if (!item || !item.path) return Promise.resolve({ ok: false, reason: 'no-item' });
    var url = '/api/files?path=' + encodeURIComponent(item.path) + '&raw=1&api_key=' + encodeURIComponent(AK);
    var apps = appsFor(item);

    if (!apps.length) {
      // 与 file-app-registry 对齐：无匹配应用时不做静默失败
      toastMsg('没有可打开「' + item.name + '」的 ACMS 应用', 'info');
      return Promise.resolve({ ok: false, reason: 'no-app' });
    }

    var app = apps[0];
    var _idsBefore = _winIds();
    return window.ACMSFileApps.openFileWith(app.name, {
      url: url, name: item.name, filePath: item.path, mime: '',
    }).then(function (r) {
      if (r && r.ok) {
        // v0.121: 打开后直接吸附进对话流（对话里打开文件，而不是满屏飘一个浮窗）
        var _w = _newWinSince(_idsBefore);
        if (_w) { _w._dockItem = item; _w._fileId = (r && r.fileId) || null; }
        var docked = _w ? dockIntoChat(_w, item, opts.reqId) : false;
        if (docked) toastMsg('已在对话里打开 ' + item.name, 'success');
        else toastMsg('已用 ' + (app.label || app.name) + ' 打开', 'success');
      } else if (r && r.reason === 'needs-download') {
        toastMsg('该类型暂不支持直接打开，请先下载到本地', 'info');
      } else {
        toastMsg('打开失败：' + ((r && (r.reason || r.error)) || '未知原因'), 'error');
      }
      return r;
    }).catch(function (e) {
      toastMsg('打开失败：' + ((e && e.message) || '未知错误'), 'error');
      return { ok: false, reason: 'throw', error: e && e.message };
    });
  }

  // ── 一步到位：选 → 开 ──
  function pickAndOpen(opts) {
    opts = opts || {};
    return pick(opts).then(function (it) {
      if (!it) return null;
      return openFile(it, { reqId: opts.reqId }).then(function (r) { return { item: it, result: r }; });
    });
  }

  window.ACMSFilePicker = {
    pick: pick,
    openFile: openFile,
    pickAndOpen: pickAndOpen,
  };

  // 对话辅助工具条按钮入口（index.html / idea-panel.js 都调这个）
  //   reqId 暂时只用于日志与未来把窗口绑定到会话，不影响本函数行为
  window.chatOpenFilePicker = function (reqId) {
    return pickAndOpen({ reqId: reqId }).then(function (r) {
      if (r && r.result && r.result.ok) {
        console.log('[file-picker] opened for session:', reqId, r.item.path);
      }
      return r;
    });
  };
})();
