// ACMS L2 — 窗口管理器（v0.55 支持多实例窗口 + 桌面图标）
// 低耦合：不 monkey-patch，通过 ACMSWin API 被 router.js 调用
// 视图内容：通过 registerViewLoader 注册，window-manager 无 view 特定逻辑
//
// v0.55 关键改动：
//   - open() 支持 opts.instanceId（联合去重 key = (view, instanceId)）
//   - 默认窗口标题可被 setTitle() 覆盖（任务栏 + 标题栏都用 w.st.titleOverride）
//   - 5+ 窗口温和堆叠算法（防止飘出屏幕）
//   - registerDesktopIcon() API：渲染桌面右下角应用图标（回收站等全局入口）

(function() {
  'use strict';

  var windows = [];
  var winCount = 0;
  var nextZ = 100;
  var lastFocused = null;
  var desktop = null;
  var desktopShown = false;

  // 默认视图标签（无 instanceId 时用）— v0.58 从包注册表动态读取
  // 未注册到 package-registry 的内部视图（dashboard/delivery/agents/reports/settings等）用静态 fallback
  var _labelFallback = {
    dashboard:       { icon: '📊', label: '仪表盘' },
    delivery:        { icon: '📦', label: '交付管理' },
    agents:          { icon: '🤖', label: '智能体' },
    reports:         { icon: '📊', label: '项目报告' },
    settings:        { icon: '⚙️', label: '项目设置' },
    'agent-activity':{ icon: '🤖', label: 'Agent 活动' },
  };
  function getLabel(viewName) {
    // 优先从包注册表读取
    if (window.ACMS && ACMS.getPackage) {
      var pkg = ACMS.getPackage(viewName);
      if (pkg) return { icon: pkg.icon, label: pkg.title };
    }
    // 未注册的 fallback
    var fallback = _labelFallback[viewName];
    if (fallback) return fallback;
    return { icon: '📄', label: viewName };
  }
  var viewLoaders = {};
  // 注：桌面图标渲染由 desktop-icons.js 接管，window-manager 只提供底层 _replaceDesktopIcons / _onDesktopIconMoved API

  // ── 注册视图加载器 ──
  function registerViewLoader(viewName, loaderFn) {
    viewLoaders[viewName] = loaderFn;
  }

  // ── 桌面 ──
  function ensureDesktop() {
    if (desktop && !document.body.contains(desktop)) {
      desktop = null;
    }
    if (desktop) return desktop;
    var ws = document.getElementById('view-workspace');
    if (!ws) return null;
    desktop = document.getElementById('acms-desktop');
    if (desktop) return desktop;
    desktop = document.createElement('div');
    desktop.id = 'acms-desktop';
    ws.appendChild(desktop);
    bindDesktopClick(desktop);
    return desktop;
  }

  function bindDesktopClick(d) {
    d.addEventListener('click', function(e) {
      if (e.target === d || e.target.id === 'desktop-icons' || e.target.id === 'desktop-icons-inner') {
        var btn = document.getElementById('tb-start');
        if (btn) btn.click();
      }
    });
  }

  // ── 温和堆叠算法（v0.55 防 5+ 窗口飘出屏幕）──
  // 1-12 个错开堆叠，13-24 在第 13 个偏移 20px 重新错开，依此类推
  function calcStackPos(n, winW, winH) {
    var vw = window.innerWidth || 1280;
    var vh = window.innerHeight || 720;
    var maxOffsetX = Math.max(40, vw - winW - 40);
    var maxOffsetY = Math.max(40, vh - winH - 80);
    var stepX = Math.min(28, Math.floor((maxOffsetX - 40) / 12));
    var stepY = Math.min(18, Math.floor((maxOffsetY - 40) / 12));
    var cycle = Math.floor(n / 12);
    var inCycle = n % 12;
    return {
      x: 40 + inCycle * stepX + cycle * 20,
      y: 40 + inCycle * stepY + cycle * 20,
    };
  }

  // ── 打开窗口 ──
  function open(viewName, opts) {
    opts = opts || {};
    var info = getLabel(viewName);
    var d = ensureDesktop();
    if (!d) return null;

    // v0.55：联合去重 key = (view, instanceId)
    var existing = find(viewName, opts.instanceId);
    if (existing) {
      if (existing.st.min) toggleMin(existing);
      focus(existing);
      return existing;
    }

    var n = windows.length;
    var ww = opts.w || 600;
    var wh = opts.h || 400;
    var pos = calcStackPos(n, ww, wh);

    var w = {
      id: 'aw-' + (++winCount),
      view: viewName,
      instanceId: opts.instanceId || null,  // v0.55
      st: {
        icon: info.icon,
        title: opts.title || info.label,    // 初始标题（可被 setTitle 覆盖）
        titleOverride: opts.title || null,  // v0.55 用户自定义标题（任务栏 + 标题栏优先显示）
        min: false, max: false, z: nextZ++,
        x: pos.x, y: pos.y,
        w: ww, h: wh,
        rx: 0, ry: 0, rw: 0, rh: 0,
      },
      el: null, $c: null, dead: false,
      onClose: opts.onClose || null,  // v0.55 关窗回调（chat 用：通知后端 / 刷新列表）
    };

    var el = document.createElement('div');
    el.className = 'acms-window';
    el.id = w.id;
    var displayTitle = w.st.titleOverride || w.st.title;
    el.innerHTML =
      '<div class="aw-titlebar" title="双击编辑标题">' +
        '<span class="aw-icon">' + info.icon + '</span>' +
        '<span class="aw-title">' + displayTitle + '</span>' +
        '<div class="aw-controls">' +
          '<button class="aw-btn aw-btn-min" data-act="min"></button>' +
          '<button class="aw-btn aw-btn-max" data-act="max"></button>' +
          '<button class="aw-btn aw-btn-close" data-act="close"></button>' +
        '</div>' +
      '</div>' +
      '<div class="aw-content"></div>' +
      '<div class="aw-rz" data-d="n"></div><div class="aw-rz" data-d="ne"></div>' +
      '<div class="aw-rz" data-d="e"></div><div class="aw-rz" data-d="se"></div>' +
      '<div class="aw-rz" data-d="s"></div><div class="aw-rz" data-d="sw"></div>' +
      '<div class="aw-rz" data-d="w"></div><div class="aw-rz" data-d="nw"></div>';
    el.style.cssText = 'left:' + w.st.x + 'px;top:' + w.st.y +
      'px;width:' + w.st.w + 'px;height:' + w.st.h + 'px;z-index:' + w.st.z;

    w.el = el;
    w.$c = el.querySelector('.aw-content');
    d.appendChild(el);
    windows.push(w);

    loadContent(w, opts);
    bindEvents(w);
    focus(w);
    syncTb();
    return w;
  }

  // v0.55：联合去重 (view, instanceId)；instanceId null 表示单实例视图（dashboard 等）
  function find(viewName, instanceId) {
    for (var i = 0; i < windows.length; i++) {
      var w = windows[i];
      if (w.dead) continue;
      if (w.view !== viewName) continue;
      // instanceId 匹配：null/null 视为相等；string/string 严格相等
      if ((w.instanceId || null) === (instanceId || null)) return w;
    }
    return null;
  }

  // ── 内容加载（通用：先查注册加载器，无则走 DOM 克隆） ──
  function loadContent(w, opts) {
    w.$c.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2)">⏳ 加载中...</div>';

    var loader = viewLoaders[w.view];
    if (loader) {
      Promise.resolve(loader(w, opts)).catch(function(e) {
        if (!w.dead) w.$c.innerHTML = '<div style="padding:40px;text-align:center;color:var(--accent2)">加载失败</div>';
      });
      return;
    }

    // 无注册加载器 → 标准 DOM 克隆（从 #view-{name} 隐藏模板）
    var src = document.getElementById('view-' + w.view);
    if (src) {
      var loadFn = window['load' + w.view.charAt(0).toUpperCase() + w.view.slice(1)];
      if (typeof loadFn === 'function') {
        Promise.resolve(loadFn()).then(function() {
          if (w.dead) return;
          if (!document.body.contains(src)) { w.$c.innerHTML = ''; return; }
          w.$c.innerHTML = src.innerHTML;
          w.$c.style.display = '';
        }).catch(function() {
          if (!w.dead) { w.$c.innerHTML = src.innerHTML; w.$c.style.display = ''; }
        });
      } else {
        w.$c.innerHTML = src.innerHTML;
        w.$c.style.display = '';
      }
      return;
    }
    w.$c.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text2)">暂无内容</div>';
  }

  // ── 窗口操作 ──
  function focus(w) {
    if (lastFocused && lastFocused !== w) lastFocused.el.classList.remove('aw-focused');
    w.el.classList.add('aw-focused');
    w.st.z = nextZ++;
    w.el.style.zIndex = w.st.z;
    lastFocused = w;
    syncTb();
  }

  function toggleMin(w) {
    w.st.min = !w.st.min;
    w.el.classList.toggle('aw-min', w.st.min);
    syncTb();
    if (!w.st.min) focus(w);
  }

  function toggleMax(w) {
    if (w.st.max) {
      w.el.classList.remove('aw-max');
      w.el.style.left = w.st.rx + 'px'; w.el.style.top = w.st.ry + 'px';
      w.el.style.width = w.st.rw + 'px'; w.el.style.height = w.st.rh + 'px';
      w.st.max = false;
    } else {
      w.st.rx = w.st.x; w.st.ry = w.st.y; w.st.rw = w.st.w; w.st.rh = w.st.h;
      w.el.classList.add('aw-max');
      w.el.style.width = ''; w.el.style.height = '';
      w.el.style.left = ''; w.el.style.top = '';
      w.st.max = true;
    }
    syncTb();
  }

  function close(w) {
    if (w.dead) return;
    w.dead = true;
    // v0.55：关窗回调（chat 用：通知 launcher 刷新列表 + 桌面回收站 badge）
    try { if (typeof w.onClose === 'function') w.onClose(); } catch (e) { console.warn('[ACMSWin.close] onClose error:', e.message); }
    w.el.remove();
    var i = windows.indexOf(w);
    if (i !== -1) windows.splice(i, 1);
    if (lastFocused === w) lastFocused = windows.length ? windows[windows.length - 1] : null;
    syncTb();
  }

  function closeAll() {
    windows.slice().forEach(function(w) { if (!w.dead) { try { if (typeof w.onClose === 'function') w.onClose(); } catch (e) {} w.el.remove(); w.dead = true; } });
    windows = [];
    lastFocused = null;
    syncTb();
  }

  // v0.55：设置窗口自定义标题（标题栏 + 任务栏同步更新）
  function setTitle(w, title) {
    if (!w || w.dead) return;
    w.st.titleOverride = title;
    var tEl = w.el.querySelector('.aw-title');
    if (tEl) tEl.textContent = title;
    syncTb();
  }

  function getTitle(w) {
    return w.st.titleOverride || w.st.title;
  }

  // ── 桌面模式 ──
  function enable() {
    var ws = document.getElementById('view-workspace');
    // 关掉现有窗口，但保留桌面 DOM（不 remove desktop）
    closeAll();
    var d = ensureDesktop();
    if (!d) return;
    var layout = document.getElementById('main-layout');
    if (layout) layout.style.display = 'none';
    if (ws) ws.classList.add('desktop-mode');
    var header = document.getElementById('header');
    if (header) header.style.display = 'none';
    d.style.display = 'block';
    desktopShown = true;
    // 桌面图标由 desktop-icons.js 监听此事件后自己调用 _replaceDesktopIcons 渲染
    document.dispatchEvent(new CustomEvent('acms:desktop-shown'));
  }

  function disable() {
    var layout = document.getElementById('main-layout');
    if (layout) layout.style.display = '';
    var ws = document.getElementById('view-workspace');
    if (ws) ws.classList.remove('desktop-mode');
    var header = document.getElementById('header');
    if (header) header.style.display = '';
    if (desktop) desktop.style.display = 'none';
    desktopShown = false;
    closeAll();
  }

  function isActive() { return desktopShown; }

  // ── 事件 ──
  function bindEvents(w) {
    var tb = w.el.querySelector('.aw-titlebar');
    tb.addEventListener('mousedown', function(e) {
      if (e.target.closest('.aw-controls')) return;
      if (w.st.max) return;
      focus(w);
      var r = w.el.getBoundingClientRect();
      var dx = e.clientX - r.left, dy = e.clientY - r.top;
      function mv(ev) {
        var l = Math.max(0, ev.clientX - dx), t = Math.max(0, ev.clientY - dy);
        w.el.style.left = l + 'px'; w.el.style.top = t + 'px';
        w.st.x = l; w.st.y = t;
      }
      function up() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });

    // v0.55：双击标题栏 → 编辑（仅 chat 窗口有意义，其他视图忽略）
    tb.addEventListener('dblclick', function(e) {
      if (e.target.closest('.aw-controls')) return;
      if (typeof w.onTitleEdit === 'function') w.onTitleEdit();
    });

    w.el.querySelectorAll('.aw-rz').forEach(function(h) {
      h.addEventListener('mousedown', function(e) {
        e.stopPropagation();
        focus(w);
        var dir = h.dataset.d;
        var r = w.el.getBoundingClientRect();
        var sx = e.clientX, sy = e.clientY;
        var sw = r.width, sh = r.height, sl = r.left, st = r.top;
        function mv(ev) {
          var dx = ev.clientX - sx, dy = ev.clientY - sy;
          var nw = sw, nh = sh, nl = sl, nt = st;
          if (dir.indexOf('e') !== -1) nw = Math.max(300, sw + dx);
          if (dir.indexOf('w') !== -1) { nw = Math.max(300, sw - dx); nl = sl + (sw - nw); }
          if (dir.indexOf('s') !== -1) nh = Math.max(200, sh + dy);
          if (dir.indexOf('n') !== -1) { nh = Math.max(200, sh - dy); nt = st + (sh - nh); }
          w.el.style.width = nw + 'px'; w.el.style.height = nh + 'px';
          w.el.style.left = nl + 'px'; w.el.style.top = nt + 'px';
          w.st.w = nw; w.st.h = nh; w.st.x = nl; w.st.y = nt;
        }
        function up() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
      });
    });

    w.el.querySelectorAll('.aw-btn').forEach(function(b) {
      b.addEventListener('mousedown', function(e) { e.stopPropagation(); });
      b.addEventListener('click', function(e) {
        e.stopPropagation();
        var a = b.dataset.act;
        if (a === 'close') close(w);
        else if (a === 'min') toggleMin(w);
        else if (a === 'max') toggleMax(w);
      });
    });

    w.el.addEventListener('mousedown', function() { focus(w); });
  }

  function syncTb() {
    var c = document.getElementById('tb-windows');
    if (!c) return;
    c.innerHTML = '';
    windows.forEach(function(w) {
      if (w.dead) return;
      var info = getLabel(w.view);
      // v0.55：优先用 titleOverride（customTitle）
      var displayLabel = w.st.titleOverride || info.label;
      var b = document.createElement('button');
      b.className = 'tb-window-btn' + (w === lastFocused ? ' active' : '') + (w.st.min ? ' min' : '');
      b.innerHTML = '<span class="tbw-icon">' + info.icon + '</span> ' + displayLabel;
      b.title = displayLabel;
      b.addEventListener('click', function() {
        if (w.st.min) toggleMin(w); else toggleMin(w);
        focus(w);
      });
      c.appendChild(b);
    });
  }

  // v0.55 抽离后：window-manager 只暴露底层 _replaceDesktopIcons / updateDesktopIconBadge API
  //   - desktop-icons.js 通过 _replaceDesktopIcons 管理 spec 数组 + localStorage
  //   - 任意模块（如 taskbar.js 刷新回收站 badge）通过 updateDesktopIconBadge 直接改 DOM

  // v0.56：替换全部桌面图标（供 desktop-icons.js 调用）
  function replaceDesktopIcons(specs) {
    renderDesktopIcons(specs || []);
  }

  // 直接更新 DOM badge（不重渲染整图标，避免覆盖 desktop-icons.js 的 spec）
  function updateDesktopIconBadge(id, badge) {
    if (!window.CSS || !CSS.escape) {
      // 老浏览器 fallback：粗暴用 querySelectorAll + 遍历
      var all = document.querySelectorAll('.desktop-icon');
      for (var i = 0; i < all.length; i++) {
        if (all[i].dataset.iconId === id) {
          applyBadgeToIcon(all[i], badge);
          return;
        }
      }
      return;
    }
    var el = document.querySelector('.desktop-icon[data-icon-id="' + CSS.escape(id) + '"]');
    if (!el) return;
    applyBadgeToIcon(el, badge);
  }

  function applyBadgeToIcon(el, badge) {
    var badgeEl = el.querySelector('.di-badge');
    var n = badge && badge > 0 ? badge : 0;
    if (n > 0) {
      if (badgeEl) {
        badgeEl.textContent = n;
      } else {
        badgeEl = document.createElement('div');
        badgeEl.className = 'di-badge';
        badgeEl.textContent = n;
        el.appendChild(badgeEl);
      }
    } else if (badgeEl) {
      badgeEl.remove();
    }
  }

  function renderDesktopIcons(specs) {
    var c = document.getElementById('desktop-icons');
    if (!c) return;
    if (!desktopShown) { c.innerHTML = ''; return; }
    c.innerHTML = '';
    var inner = document.createElement('div');
    inner.id = 'desktop-icons-inner';
    specs.forEach(function(icon, idx) {
      var div = document.createElement('div');
      div.className = 'desktop-icon';
      div.title = icon.label;
      div.dataset.iconId = icon.id;  // v0.56：updateDesktopIconBadge 通过此查找
      div.dataset.idx = idx;
      var x = (typeof icon.x === 'number') ? icon.x : (20 + idx * 100);
      var y = (typeof icon.y === 'number') ? icon.y : (20 + Math.floor(idx / 4) * 110);
      div.style.left = x + 'px';
      div.style.top = y + 'px';
      var badgeHtml = '';
      if (icon.badge && icon.badge > 0) {
        badgeHtml = '<div class="di-badge">' + icon.badge + '</div>';
      }
      div.innerHTML = '<div class="di-emoji">' + icon.icon + '</div>'
                    + '<div class="di-label">' + icon.label + '</div>'
                    + badgeHtml;
      div.addEventListener('click', function(e) {
        e.stopPropagation();
        if (div._wasDragged) { div._wasDragged = false; return; }
        if (typeof icon.onClick === 'function') icon.onClick();
      });
      // ── 右键图标 → 移除快捷方式 ──
      div.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        e.stopPropagation();
        // 移除已有的图标右键菜单
        var old = document.getElementById('di-context-menu');
        if (old) old.remove();
        var menu = document.createElement('div');
        menu.id = 'di-context-menu';
        menu.style.cssText = 'position:fixed;z-index:100000;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:4px;min-width:140px;box-shadow:0 4px 16px rgba(0,0,0,0.3);font-size:13px';
        var item = document.createElement('div');
        item.textContent = '❌ 从桌面移除';
        item.style.cssText = 'padding:6px 10px;border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:6px;color:var(--accent2)';
        item.addEventListener('mouseenter', function() { item.style.background = 'var(--bg3)'; });
        item.addEventListener('mouseleave', function() { item.style.background = 'transparent'; });
        menu.appendChild(item);
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        document.body.appendChild(menu);
        // 点击移除
        item.addEventListener('click', function() {
          menu.remove();
          if (window.ACMSWin && typeof ACMSWin.unpinDesktopIcon === 'function') {
            ACMSWin.unpinDesktopIcon(icon.id);
          }
        });
        // 点击外部关闭
        function closeMenu(ev) {
          if (!menu.contains(ev.target)) {
            menu.remove();
            document.removeEventListener('mousedown', closeMenu);
          }
        }
        setTimeout(function() { document.addEventListener('mousedown', closeMenu); }, 0);
      });
      // ── 鼠标拖拽（自由摆放）──
      (function(iconData, el) {
        var dragStartX, dragStartY, startMouseX, startMouseY, dragThreshold = 5;
        var isDragging = false;
        el.addEventListener('mousedown', function(e) {
          if (e.button !== 0) return;
          e.stopPropagation();
          startMouseX = e.clientX;
          startMouseY = e.clientY;
          dragStartX = parseInt(el.style.left, 10) || 0;
          dragStartY = parseInt(el.style.top, 10) || 0;
          isDragging = false;
          function onMove(ev) {
            var dx = ev.clientX - startMouseX;
            var dy = ev.clientY - startMouseY;
            if (!isDragging) {
              if (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold) {
                isDragging = true;
                el._wasDragged = true;
                el.classList.add('dragging');
                // 拖拽时自动关掉自动排列，下次 refresh 不会覆盖用户位置
                localStorage.setItem('acms-desktop-auto-arrange', 'false');
              } else {
                return;
              }
            }
            var l = Math.max(0, dragStartX + dx);
            var t = Math.max(0, dragStartY + dy);
            el.style.left = l + 'px';
            el.style.top = t + 'px';
            iconData.x = l;
            iconData.y = t;
          }
          function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (isDragging) {
              el.classList.remove('dragging');
              // 通知 desktop-icons.js 持久化位置
              if (typeof _onDesktopIconMoved === 'function') {
                _onDesktopIconMoved(iconData.id, iconData.x, iconData.y);
              }
            } else {
              // 视为点击（已在 click 事件处理）
            }
          }
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      })(icon, div);
      inner.appendChild(div);
    });
    c.appendChild(inner);
  }

  // 拖拽移动回调（由 desktop-icons.js 设置，持久化 x/y 到 localStorage）
  var _onDesktopIconMoved = null;

  // ── 处理预注册队列（在 window-manager.js 加载前注册的 loader）──
  if (window._viewLoaderQueue) {
    window._viewLoaderQueue.forEach(function(item) {
      viewLoaders[item.view] = item.loader;
    });
    window._viewLoaderQueue = null;
  }

  // ── 暴露 API ──
  window.ACMSWin = {
    open: open,
    close: close,
    closeAll: closeAll,
    focus: focus,
    minimize: toggleMin,
    maximize: toggleMax,
    enable: enable,
    disable: disable,
    isActive: function() { return desktopShown; },
    registerViewLoader: registerViewLoader,
    setTitle: setTitle,            // v0.55
    getTitle: getTitle,            // v0.55
    onTitleEdit: function(w, fn) { w.onTitleEdit = fn; },  // v0.55
    onWindowClose: function(w, fn) { w.onClose = fn; },    // v0.55（实际是 open 时传 opts.onClose，这里补一个 setter）
    _replaceDesktopIcons: replaceDesktopIcons,              // v0.56 底层 API（由 desktop-icons.js 调用）
    updateDesktopIconBadge: updateDesktopIconBadge,        // v0.55 保留（直接更新 DOM，taskbar.js 刷回收站 badge 用）
    _onDesktopIconMoved: function(fn) { _onDesktopIconMoved = fn; },  // v0.57：自由拖拽位置持久化回调
  };
})();