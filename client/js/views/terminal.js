// ACMS — 终端窗口 (xterm.js + WebSocket)
// 通用 bash 终端，支持快捷方式启动特定命令
// 注册: ACMSWin.registerViewLoader('terminal', loader)
// 启动: ACMSWin.open('terminal', { w: 820, h: 500, title: '💻 终端' })
// 带命令: ACMSWin.open('terminal', { w: 820, h: 500, title: '💻 cmd', opts: { cmd: 'hermes', cwd: '~' } })
(function() {
  'use strict';

  var WS_PORT = 3302;
  var WS_PATH = '/';
  var TERM_LAUNCHER_KEY = 'acms-terminal-launchers';

  // ── 预设 emoji 列表 ──
  var EMOJI_PRESETS = [
    '🤖', '💻', '🔧', '🐍', '🖥️', '☁️', '🐳', '📦',
    '🔗', '⚡', '🛠️', '📡', '🔬', '🎮', '📊', '🗄️',
    '🌐', '🔑', '🕸️', '🧪', '⚙️', '📁', '🔄', '🚀',
  ];

  // ── 状态栏获取 hostname ──
  function getHostname() {
    return window.location.hostname || 'localhost';
  }

  // ── 简写路径 ──
  function shortenPath(p) {
    if (!p) return '~';
    // Windows 路径简写
    var home = '/c/Users/swede';
    if (p.indexOf(home) === 0) return '~' + p.slice(home.length);
    return p;
  }

  // ── 创建终端窗口 ──
  function createTerminalWindow(opts) {
    if (window.ACMSWin) {
      if (!ACMSWin.isActive()) ACMSWin.enable();
      var title = '💻 ' + (opts && opts.label ? opts.label : '终端');
      ACMSWin.open('terminal', { w: 820, h: 500, title: title, opts: opts || {} });
    }
  }

  // ── 打开通用终端 ──
  window.openTerminal = function() {
    createTerminalWindow(null);
  };

  // ── 通过快捷方式打开 ──
  window.openTerminalLauncher = function(id) {
    var launchers = getTerminalLaunchers();
    var launcher = launchers.find(function(l) { return l.id === id; });
    if (launcher) {
      createTerminalWindow({
        cmd: launcher.cmd,
        cwd: launcher.cwd || '~',
        label: launcher.label || launcher.cmd,
      });
    }
  };

  // ── 获取已保存的快捷方式 ──
  function getTerminalLaunchers() {
    try {
      var data = localStorage.getItem(TERM_LAUNCHER_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function saveTerminalLaunchers(arr) {
    localStorage.setItem(TERM_LAUNCHER_KEY, JSON.stringify(arr));
  }

  // ── 创建快捷方式的内联表单卡片 ──
  function showCreateLauncherForm() {
    // 移除已有的表单
    var existing = document.getElementById('term-launcher-form-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'term-launcher-form-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;';

    var formContent = buildFormHTML();
    overlay.innerHTML = formContent;
    document.body.appendChild(overlay);

    // 绑定事件
    var form = overlay.querySelector('.term-lf-form');
    if (!form) return;

    // Emoji 选择
    var emojiInput = form.querySelector('.term-lf-emoji-input');
    var emojiGrid = form.querySelector('.term-lf-emoji-grid');
    var selectedEmoji = '💻';

    emojiInput.addEventListener('click', function() {
      emojiGrid.style.display = emojiGrid.style.display === 'none' ? 'grid' : 'none';
    });

    emojiGrid.querySelectorAll('.term-lf-emoji').forEach(function(el) {
      el.addEventListener('click', function() {
        selectedEmoji = el.textContent;
        emojiInput.value = selectedEmoji;
        emojiGrid.style.display = 'none';
        // 高亮选中
        emojiGrid.querySelectorAll('.term-lf-emoji').forEach(function(e) { e.classList.remove('selected'); });
        el.classList.add('selected');
      });
    });

    // 点击外部关闭 emoji 面板
    document.addEventListener('click', function closeEmoji(e) {
      var eg = document.getElementById('term-lf-emoji-grid');
      if (eg && !eg.contains(e.target) && e.target !== emojiInput) {
        eg.style.display = 'none';
      }
      document.removeEventListener('click', closeEmoji);
    });

    // 取消
    form.querySelector('.term-lf-cancel').addEventListener('click', function() {
      overlay.remove();
    });

    // 创建
    form.querySelector('.term-lf-create').addEventListener('click', function() {
      var name = form.querySelector('.term-lf-name').value.trim();
      var cmd = form.querySelector('.term-lf-cmd').value.trim();
      var cwd = form.querySelector('.term-lf-cwd').value.trim() || '~';

      if (!name) { toast('请输入名称', 'error'); return; }
      if (!cmd) { toast('请输入启动命令', 'error'); return; }

      var launchers = getTerminalLaunchers();
      var newItem = {
        id: 'term-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        icon: selectedEmoji,
        label: name,
        cmd: cmd,
        cwd: cwd,
        createdAt: Date.now(),
      };
      launchers.push(newItem);
      saveTerminalLaunchers(launchers);

      overlay.remove();
      if (typeof toast === 'function') toast('已创建终端快捷方式「' + name + '」', 'success');

      // 同步到桌面图标
      syncDesktopIcons();
    });

    // Enter 提交
    form.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.querySelector('.term-lf-create').click();
      }
      if (e.key === 'Escape') {
        overlay.remove();
      }
    });

    // 聚焦到名称输入
    setTimeout(function() {
      var ni = form.querySelector('.term-lf-name');
      if (ni) ni.focus();
    }, 100);
  }

  function buildFormHTML() {
    var emojis = EMOJI_PRESETS.map(function(e) {
      return '<span class="term-lf-emoji" data-e="' + e + '">' + e + '</span>';
    }).join('');

    return '<div class="term-lf-form" style="background:var(--window-bg,#fff);border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,0.25);padding:24px;width:400px;max-width:90vw;color:var(--text,#333);font-size:14px;font-family:inherit">' +
      '<div style="font-size:16px;font-weight:600;margin-bottom:16px">🆕 新建终端启动器</div>' +

      '<label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text2,#888)">名称</label>' +
      '<input class="term-lf-name" type="text" placeholder="例如: Hermes Agent" style="width:100%;padding:8px 10px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--bg,#f5f5f5);color:var(--text,#333);font-size:13px;margin-bottom:12px;box-sizing:border-box;outline:none">' +

      '<label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text2,#888)">图标</label>' +
      '<div style="position:relative;margin-bottom:12px">' +
        '<input class="term-lf-emoji-input" type="text" readonly value="💻" style="width:100%;padding:8px 10px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--bg,#f5f5f5);color:var(--text,#333);font-size:18px;cursor:pointer;box-sizing:border-box;outline:none">' +
        '<div class="term-lf-emoji-grid" id="term-lf-emoji-grid" style="display:none;position:absolute;top:100%;left:0;background:var(--window-bg,#fff);border:1px solid var(--border,#ddd);border-radius:8px;padding:8px;z-index:100;box-shadow:0 4px 16px rgba(0,0,0,0.15);width:280px;grid-template-columns:repeat(8,1fr);gap:2px;margin-top:4px">' +
          emojis +
        '</div>' +
      '</div>' +

      '<label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text2,#888)">启动命令 <span style="color:var(--accent2,#e74c3c)">*</span></label>' +
      '<input class="term-lf-cmd" type="text" placeholder="例如: hermes" style="width:100%;padding:8px 10px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--bg,#f5f5f5);color:var(--text,#333);font-size:13px;margin-bottom:16px;box-sizing:border-box;outline:none;font-family:monospace">' +

      '<label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text2,#888)">工作目录（可选）</label>' +
      '<input class="term-lf-cwd" type="text" placeholder="留空默认 ~" style="width:100%;padding:8px 10px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--bg,#f5f5f5);color:var(--text,#333);font-size:13px;margin-bottom:20px;box-sizing:border-box;outline:none;font-family:monospace">' +

      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button class="term-lf-cancel" style="padding:8px 20px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--bg,#f5f5f5);color:var(--text,#333);cursor:pointer;font-size:13px">取消</button>' +
        '<button class="term-lf-create" style="padding:8px 20px;border:none;border-radius:6px;background:var(--accent,#0ea89d);color:var(--window-bg,#fff);cursor:pointer;font-size:13px;font-weight:600">创建</button>' +
      '</div>' +
    '</div>';
  }

  // ── 将终端快捷方式同步到桌面图标 ──
  function syncDesktopIcons() {
    var launchers = getTerminalLaunchers();
    if (launchers.length === 0) return;

    // 从 localStorage 读取已固定的桌面图标
    var pinned = [];
    try {
      var data = localStorage.getItem('acms-desktop-pinned');
      if (data) pinned = JSON.parse(data);
    } catch (e) { pinned = []; }

    // 删除旧的终端快捷方式条目
    pinned = pinned.filter(function(p) { return p.id.indexOf('term-') !== 0; });

    // 添加新的
    launchers.forEach(function(l) {
      pinned.push({
        id: l.id,
        icon: l.icon || '💻',
        label: l.label,
        actionType: 'terminal',
        actionValue: l.cmd,
        cwd: l.cwd || '~',
      });
    });

    localStorage.setItem('acms-desktop-pinned', JSON.stringify(pinned));

    // 触发桌面图标刷新
    if (typeof refreshDesktopIcons === 'function') {
      refreshDesktopIcons();
    } else if (window.ACMSWin && typeof ACMSWin._replaceDesktopIcons === 'function') {
      // 兜底：直接触发重新渲染
      var evt = new CustomEvent('desktop-icons-changed');
      window.dispatchEvent(evt);
    }
  }

  // ── 暴露创建函数 ──
  window.createTerminalLauncher = showCreateLauncherForm;

  // ─────────────────────────────────────────────
  // viewLoader 注册 — 终端窗口视图
  // ─────────────────────────────────────────────
  function registerTerminalView() {
    if (!window.ACMSWin) {
      setTimeout(registerTerminalView, 100);
      return;
    }

    ACMSWin.registerViewLoader('terminal', function(w) {
      if (w.dead) return;

      var opts = (arguments[1] && arguments[1].opts) || {};
      var cmd = opts.cmd || '';
      var initialCwd = opts.cwd || '~';
      var label = opts.label || '终端';

      // ── 渲染 DOM ──
      var statusHtml = '<div id="term-statusbar" style="display:flex;align-items:center;gap:8px;padding:2px 10px;font-size:11px;color:var(--text2,#999);background:var(--bg,#1e1e1e);border-bottom:1px solid #333;flex-shrink:0;font-family:monospace">' +
        '<span style="color:#4ecdc4">●</span>' +
        '<span id="term-status-text">连接中...</span>' +
        '</div>';

      var containerHtml = '<div id="term-container" style="flex:1;background:#1e1e1e;overflow:hidden"></div>';

      w.$c.innerHTML = statusHtml + containerHtml;
      w.$c.style.display = 'flex';
      w.$c.style.flexDirection = 'column';
      w.$c.style.background = '#1e1e1e';

      var statusEl = document.getElementById('term-status-text');
      var containerEl = document.getElementById('term-container');
      if (!containerEl) return;

      // ── 检查 xterm.js 是否加载 ──
      if (typeof Terminal === 'undefined') {
        if (statusEl) statusEl.textContent = 'xterm.js 未加载，请刷新页面';
        containerEl.innerHTML = '<div style="color:#e74c3c;padding:20px;text-align:center">xterm.js 未加载。<br>请确保 index.html 中已添加 xterm CDN 引用。</div>';
        return;
      }

      // ── 初始化 xterm ──
      var term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: 13,
        fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
        lineHeight: 1.3,
        allowTransparency: true,
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#d4d4d4',
          selectionBackground: '#264f78',
          black: '#1e1e1e', red: '#f44747', green: '#4ec9b0',
          yellow: '#dcdcaa', blue: '#569cd6', magenta: '#c586c0',
          cyan: '#4fc1ff', white: '#d4d4d4',
          brightBlack: '#808080', brightRed: '#f44747', brightGreen: '#4ec9b0',
          brightYellow: '#dcdcaa', brightBlue: '#569cd6', brightMagenta: '#c586c0',
          brightCyan: '#4fc1ff', brightWhite: '#ffffff',
        },
      });

      term.open(containerEl);

      // ── 内联 FitAddon 功能（CDN 的 ESM/UMD 不稳定，直接实现） ──
      function fitTerminal() {
        if (!term || !term.element || !term.element.parentElement) return;
        try {
          var core = term._core;
          var dims = core._renderService.dimensions;
          if (!dims || dims.css.cell.width === 0 || dims.css.cell.height === 0) return;
          var parentStyle = window.getComputedStyle(term.element.parentElement);
          var parentH = parseInt(parentStyle.getPropertyValue('height'));
          var parentW = parseInt(parentStyle.getPropertyValue('width'));
          if (!parentH || !parentW) return;
          var termStyle = window.getComputedStyle(term.element);
          var padTop = parseInt(termStyle.getPropertyValue('padding-top')) || 0;
          var padBottom = parseInt(termStyle.getPropertyValue('padding-bottom')) || 0;
          var padRight = parseInt(termStyle.getPropertyValue('padding-right')) || 0;
          var padLeft = parseInt(termStyle.getPropertyValue('padding-left')) || 0;
          var scrollBarW = core.viewport ? core.viewport.scrollBarWidth : 0;
          var availH = parentH - padTop - padBottom;
          var availW = parentW - padLeft - padRight - scrollBarW;
          var cols = Math.max(2, Math.floor(availW / dims.css.cell.width));
          var rows = Math.max(1, Math.floor(availH / dims.css.cell.height));
          if (term.rows !== rows || term.cols !== cols) {
            term.resize(cols, rows);
          }
        } catch(e) { /* ignore fit errors */ }
      }

      fitTerminal();

      // ── 连接 WebSocket ──
      var wsUrl = 'ws://' + getHostname() + ':' + WS_PORT + WS_PATH;
      if (initialCwd && initialCwd !== '~') {
        wsUrl += '?cwd=' + encodeURIComponent(initialCwd);
      }

      var ws = new WebSocket(wsUrl);
      var connected = false;
      var commandSent = false;
      var hostname = getHostname();

      ws.onopen = function() {
        connected = true;
        if (statusEl) statusEl.textContent = '已连接 | ' + hostname;
        term.focus();

        // 如果有启动命令，等待 shell 就绪后发送
        if (cmd && !commandSent) {
          // 简单的等待提示就绪
          setTimeout(function() {
            if (!commandSent && ws.readyState === 1) {
              ws.send(cmd + '\r');
              commandSent = true;
            }
          }, 1000);
        }
      };

      ws.onmessage = function(ev) {
        term.write(ev.data);
      };

      ws.onclose = function() {
        connected = false;
        if (statusEl) statusEl.textContent = '已断开';
      };

      ws.onerror = function() {
        if (statusEl) statusEl.textContent = '连接失败';
      };

      // ── 终端输入 → WebSocket ──
      term.onData(function(data) {
        if (ws.readyState === 1) {
          ws.send(data);
        }
      });

      // ── 窗口大小变化 → resize ──
      var ro = new ResizeObserver(function() {
        try { fitTerminal(); } catch(e) {}
        if (connected) {
          try {
            ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
          } catch(e) {}
        }
      });
      ro.observe(containerEl);

      // 初始 resize
      setTimeout(function() {
        try {
          fitTerminal();
          if (connected) {
            ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
          }
        } catch(e) {}
      }, 200);

      // ── 窗口关闭 → 清理 ──
      // 监听窗口 destroy
      var origDestroy = w.destroy;
      w.destroy = function() {
        try {
          ro.disconnect();
          term.dispose();
          ws.close();
        } catch(e) {}
        if (origDestroy) origDestroy.call(w);
      };

      // 也监听 w.onDestroy (ACMSWin 习惯)
      var origOnDestroy = w.onDestroy;
      w.onDestroy = function() {
        try {
          ro.disconnect();
          term.dispose();
          ws.close();
        } catch(e) {}
        if (origOnDestroy) origOnDestroy.call(w);
      };
    });
  }

  // ── 初始化 ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerTerminalView);
  } else {
    registerTerminalView();
  }

})();
