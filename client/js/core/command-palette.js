// ACMS Command Palette (v0.58)
// Ctrl+K / Cmd+K → 弹出命令面板，搜索和执行任何 ACMS 操作
//
// 架构：
//   ACMS.registerCommand(id, config) — 注册命令
//   ACMS.commandPalette.open() — 手动打开
//   ACMS.commandPalette.close() — 手动关闭
//
// 命令格式：
//   { id, title, icon, category, shortcut, keywords, handler }
//   - handler(context) 接收 { activePackage, activeProject }
//
// 自动注册：
//   - 每个已注册的包自动生成 "打开 X" 命令
//   - package-registry 的 onPackageRegistered 会同步注册
//
// 实现：
//   - 简单 DOM 操作，不依赖任何外部库
//   - 延迟创建 DOM（首次打开时生成）
//   - 事件绑定使用内联方法，匹配 ACMS 现有风格

(function() {
  'use strict';

  var commands = {};        // id → config
  var commandList = [];      // 有序列表
  var dom = null;            // DOM 元素（懒创建）
  var isOpen = false;
  var selectedIdx = -1;
  var currentResults = [];
  var KEY = {
    CTRL_K: 75,
    ESC: 27,
    ENTER: 13,
    UP: 38,
    DOWN: 40,
    N: 78,
    P: 80
  };

  // ── 注册命令 ──
  function registerCommand(id, config) {
    if (!id || !config) return;
    if (commands[id]) {
      console.warn('[CMD] 重复注册: ' + id);
      return;
    }
    var entry = {
      id: id,
      title: config.title || id,
      icon: config.icon || '▶',
      category: config.category || '其他',
      shortcut: config.shortcut || '',
      keywords: config.keywords || [],
      handler: config.handler || null,
      group: config.group || 0,         // 排序权重（越小越前）
    };
    commands[id] = entry;
    commandList.push(entry);
  }

  // ── 获取命令 ──
  function getCommand(id) { return commands[id] || null; }
  function getAllCommands() { return commandList; }

  // ── 搜索命令 ──
  function searchCommands(query) {
    if (!query) return commandList;
    var q = query.toLowerCase().trim();

    // 先精确匹配前缀（标题拼音/英文开头匹配），再模糊
    var scored = [];
    commandList.forEach(function(c) {
      var title = c.title.toLowerCase();
      var kw = c.keywords.some(function(k) { return k.toLowerCase().indexOf(q) !== -1; });
      var idMatch = c.id.toLowerCase().indexOf(q) !== -1;
      var titleMatch = title.indexOf(q) !== -1;

      var score = 0;
      if (title === q) score = 100;            // 完全匹配
      else if (title.indexOf(q) === 0) score = 80; // 前缀匹配
      else if (titleMatch) score = 60;          // 子串匹配
      else if (idMatch) score = 40;
      else if (kw) score = 20;

      if (score > 0) scored.push({ cmd: c, score: score });
    });

    // 按分数降序，同分按 group 升序
    scored.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return (a.cmd.group || 0) - (b.cmd.group || 0);
    });
    return scored.map(function(s) { return s.cmd; });
  }

  // ── 自动注册包打开命令 ──
  function registerOpenCommand(pkgName, pkgConfig) {
    var id = 'open.' + pkgName;
    if (commands[id]) return; // 已注册
    var title = pkgConfig.title || pkgName;
    registerCommand(id, {
      title: '打开 ' + title,
      icon: pkgConfig.icon || '📦',
      category: '窗口',
      keywords: ['打开', 'open', title, pkgName],
      group: 10,
      handler: function() {
        if (window.ACMSWin) {
          if (!ACMSWin.isActive()) ACMSWin.enable();
          var size = pkgConfig.defaultSize || { w: 800, h: 520 };
          ACMSWin.open(pkgName, { w: size.w, h: size.h, title: title });
        }
      }
    });
  }

  // ── 监听包注册 ──
  if (window.ACMS && ACMS.onPackageRegistered) {
    ACMS.onPackageRegistered(registerOpenCommand);
  }
  // 已有的包补注册
  if (window.ACMS && ACMS.getAllPackages) {
    var existing = ACMS.getAllPackages();
    existing.forEach(function(p) { registerOpenCommand(p.name, p); });
  }

  // ════════════════════════════════════════
  // UI
  // ════════════════════════════════════════

  function ensureDOM() {
    if (dom) return dom;

    dom = document.createElement('div');
    dom.id = 'acms-command-palette';
    dom.style.cssText =
      'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;' +
      'display:none;align-items:flex-start;justify-content:center;' +
      'padding-top:12vh;background:rgba(0,0,0,0.3);' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

    // 半透明背景点击关闭
    dom.addEventListener('click', function(e) {
      if (e.target === dom) close();
    });

    // 面板容器
    var panel = document.createElement('div');
    panel.style.cssText =
      'width:560px;max-width:90vw;max-height:60vh;' +
      'background:var(--bg2,#1e1e2e);border:1px solid var(--border,#333);' +
      'border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,0.4);' +
      'display:flex;flex-direction:column;overflow:hidden';

    // 搜索框
    var inputWrapper = document.createElement('div');
    inputWrapper.style.cssText =
      'display:flex;align-items:center;padding:12px 16px;' +
      'border-bottom:1px solid var(--border,#333);gap:8px';

    var searchIcon = document.createElement('span');
    searchIcon.textContent = '🔍';
    searchIcon.style.cssText = 'font-size:16px;flex-shrink:0';

    var input = document.createElement('input');
    input.id = 'acms-cmd-input';
    input.type = 'text';
    input.placeholder = '搜索命令或窗口...';
    input.style.cssText =
      'flex:1;border:none;outline:none;background:transparent;' +
      'color:var(--text,#eee);font-size:16px;line-height:1.4';

    input.addEventListener('input', function() { onInput(); });
    input.addEventListener('keydown', function(e) { onKeydown(e); });
    input.addEventListener('blur', function() {
      // 延迟关，让点击结果项的事件先触发
      setTimeout(function() {
        // 如果鼠标点到结果项，input blur 先触发但不要关
      }, 150);
    });

    inputWrapper.appendChild(searchIcon);
    inputWrapper.appendChild(input);
    panel.appendChild(inputWrapper);

    // 结果列表
    var list = document.createElement('div');
    list.id = 'acms-cmd-list';
    list.style.cssText =
      'flex:1;overflow-y:auto;padding:4px 0;' +
      'max-height:45vh';

    var empty = document.createElement('div');
    empty.id = 'acms-cmd-empty';
    empty.style.cssText =
      'padding:32px;text-align:center;color:var(--text2,#888);font-size:13px';
    empty.textContent = '无匹配结果';
    empty.style.display = 'none';

    panel.appendChild(list);
    panel.appendChild(empty);

    // 事件委托（list 已在 DOM 中）
    setupListClick();
    dom.appendChild(panel);
    document.body.appendChild(dom);

    // 阻止 Esc 冒泡（避免跟其他全局快捷键冲突）
    dom.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        close();
        e.preventDefault();
        e.stopPropagation();
      }
    });

    return dom;
  }

  // ── 输入事件 ──
  function onInput() {
    var input = document.getElementById('acms-cmd-input');
    if (!input) return;
    var query = input.value;
    var results = searchCommands(query);
    currentResults = results;
    selectedIdx = results.length > 0 ? 0 : -1;
    renderResults(results);
  }

  // ── 键盘事件 ──
  function onKeydown(e) {
    var key = e.keyCode || e.which;

    if (key === KEY.UP || (key === KEY.P && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      if (currentResults.length === 0) return;
      selectedIdx = (selectedIdx - 1 + currentResults.length) % currentResults.length;
      renderResults(currentResults);
      scrollToSelected();
      return;
    }

    if (key === KEY.DOWN || (key === KEY.N && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      if (currentResults.length === 0) return;
      selectedIdx = (selectedIdx + 1) % currentResults.length;
      renderResults(currentResults);
      scrollToSelected();
      return;
    }

    if (key === KEY.ENTER) {
      e.preventDefault();
      executeSelected();
      return;
    }

    if (key === KEY.ESC) {
      close();
      e.preventDefault();
      return;
    }
  }

  // ── 渲染结果 ──
  function renderResults(results) {
    var list = document.getElementById('acms-cmd-list');
    var empty = document.getElementById('acms-cmd-empty');
    if (!list) return;

    list.innerHTML = '';
    if (results.length === 0) {
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    // 按分类分组
    var groups = {};
    results.forEach(function(cmd, idx) {
      var cat = cmd.category || '其他';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({ cmd: cmd, idx: idx });
    });

    var catOrder = ['窗口', '操作', '系统', '其他'];
    var sortedCats = Object.keys(groups).sort(function(a, b) {
      var ai = catOrder.indexOf(a);
      var bi = catOrder.indexOf(b);
      if (ai === -1) ai = 99;
      if (bi === -1) bi = 99;
      return ai - bi;
    });

    sortedCats.forEach(function(cat) {
      var items = groups[cat];
      // 分类标题
      var header = document.createElement('div');
      header.style.cssText =
        'padding:6px 16px 4px;font-size:11px;color:var(--text2,#888);' +
        'text-transform:uppercase;letter-spacing:0.5px;font-weight:600';
      header.textContent = cat;
      list.appendChild(header);

      items.forEach(function(item) {
        var cmd = item.cmd;
        var div = document.createElement('div');
        var isSelected = item.idx === selectedIdx;
        div.style.cssText =
          'padding:8px 16px;display:flex;align-items:center;gap:10px;cursor:pointer;' +
          (isSelected ? 'background:var(--accent,#0ea89d);color:#fff;' : 'color:var(--text,#eee);') +
          'font-size:14px;transition:background 0.1s';

        // 图标
        var iconSpan = document.createElement('span');
        iconSpan.textContent = cmd.icon || '▶';
        iconSpan.style.cssText = 'font-size:16px;flex-shrink:0;width:24px;text-align:center';

        // 标题
        var titleSpan = document.createElement('span');
        titleSpan.style.cssText = 'flex:1';
        titleSpan.textContent = cmd.title;

        // 快捷键
        var shortcutSpan = null;
        if (cmd.shortcut) {
          shortcutSpan = document.createElement('span');
          shortcutSpan.style.cssText =
            'font-size:11px;color:' + (isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text2,#666)') + ';' +
            'background:' + (isSelected ? 'rgba(255,255,255,0.15)' : 'var(--bg3,#2a2a3e)') + ';' +
            'padding:2px 6px;border-radius:4px;font-family:monospace';
          shortcutSpan.textContent = cmd.shortcut;
        }

        div.appendChild(iconSpan);
        div.appendChild(titleSpan);
        if (shortcutSpan) div.appendChild(shortcutSpan);

        div.dataset.idx = item.idx;
        // 内联 onclick（最可靠的 ACMS 风格，避免一切闭包/委托问题）
        div.setAttribute('onclick', 'ACMS.commandPalette.__exec(' + item.idx + ')');
        // hover 高亮
        div.addEventListener('mouseenter', function() {
          selectedIdx = item.idx;
          renderResults(currentResults);
        });
        list.appendChild(div);
      });
    });
  }

  // ── 事件委托：点击结果项 ──
  function setupListClick() {
    var list = document.getElementById('acms-cmd-list');
    if (!list) { console.warn('[CMD] setupListClick: list not found'); return; }
    // 移除旧委托（如果有）
    list.onclick = null;
    list.addEventListener('click', function(e) {
      console.log('[CMD] list click', e.target, e.target.dataset);
      // 向上查找带 data-idx 的最近元素
      var target = e.target;
      while (target && target !== list) {
        if (target.dataset && target.dataset.idx !== undefined) {
          var idx = parseInt(target.dataset.idx, 10);
          if (!isNaN(idx) && idx >= 0 && idx < currentResults.length) {
            e.preventDefault();
            e.stopPropagation();
            executeCommand(currentResults[idx]);
          }
          return;
        }
        target = target.parentNode;
      }
    });
  }

  // ── 滚动到选中项 ──
  function scrollToSelected() {
    var list = document.getElementById('acms-cmd-list');
    if (!list) return;
    var selected = list.querySelector('[data-idx="' + selectedIdx + '"]');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  // ── 执行选中 ──
  function executeSelected() {
    if (selectedIdx < 0 || selectedIdx >= currentResults.length) return;
    executeCommand(currentResults[selectedIdx]);
  }

  function executeCommand(cmd) {
    if (!cmd) return;
    close();
    if (typeof cmd.handler === 'function') {
      // 异步 handler 也支持
      try {
        var result = cmd.handler();
        if (result && typeof result.then === 'function') {
          result.catch(function(err) { console.warn('[CMD] 执行失败:', cmd.id, err); });
        }
      } catch(e) {
        console.warn('[CMD] 执行异常:', cmd.id, e);
      }
    }
  }

  // ── 打开面板 ──
  function open() {
    if (isOpen) {
      // 已经打开则聚焦到输入框
      var inp = document.getElementById('acms-cmd-input');
      if (inp) inp.focus();
      return;
    }
    ensureDOM();
    dom.style.display = 'flex';
    isOpen = true;
    selectedIdx = -1;
    currentResults = [];
    // 清空搜索框并显示所有命令
    var input = document.getElementById('acms-cmd-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    onInput(); // 触发全量显示
  }

  // ── 关闭面板 ──
  function close() {
    if (!isOpen) return;
    if (dom) dom.style.display = 'none';
    isOpen = false;
    // 恢复焦点到 body（避免焦点仍在输入框）
    if (document.activeElement && document.activeElement.id === 'acms-cmd-input') {
      document.activeElement.blur();
    }
  }

  // ── 全局快捷键 ──
  function onGlobalKeydown(e) {
    var key = e.keyCode || e.which;
    var meta = e.ctrlKey || e.metaKey;

    // Ctrl+K / Cmd+K
    if (meta && key === KEY.CTRL_K) {
      e.preventDefault();
      e.stopPropagation();
      if (isOpen) close();
      else open();
      return;
    }

    // 面板打开时 Esc 由面板自己处理
  }

  // ── 注册系统命令 ──
  function registerSystemCommands() {
    // 切换主题
    registerCommand('theme.cycle', {
      title: '切换主题',
      icon: '🎨',
      category: '系统',
      shortcut: '',
      keywords: ['主题', 'theme', '换肤', '切换主题'],
      group: 20,
      handler: function() {
        if (window.App && typeof App.toggleTheme === 'function') {
          App.toggleTheme();
        }
      }
    });

    // 显示帮助
    registerCommand('system.help', {
      title: '快捷键帮助',
      icon: '❓',
      category: '系统',
      keywords: ['帮助', 'help', '快捷键', 'shortcut'],
      group: 99,
      handler: function() {
        showHelpDialog();
      }
    });

    // 打开桌面
    registerCommand('desktop.toggle', {
      title: '切换桌面模式',
      icon: '🖥',
      category: '系统',
      keywords: ['桌面', 'desktop', '桌面模式'],
      group: 30,
      handler: function() {
        if (window.ACMSWin) {
          if (ACMSWin.isActive()) ACMSWin.disable();
          else ACMSWin.enable();
        }
      }
    });
  }

  // ── 帮助对话框 ──
  function showHelpDialog() {
    var overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;top:0;left:0;right:0;bottom:0;z-index:100000;' +
      'background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center';
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });

    var box = document.createElement('div');
    box.style.cssText =
      'background:var(--bg2,#1e1e2e);border:1px solid var(--border,#333);' +
      'border-radius:12px;padding:24px;width:480px;max-width:90vw;' +
      'box-shadow:0 8px 40px rgba(0,0,0,0.4);color:var(--text,#eee)';

    box.innerHTML =
      '<h2 style="margin:0 0 16px 0;font-size:18px">⌨️ 快捷键</h2>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:13px">' +
      '  <div><kbd style="background:var(--bg3,#2a2a3e);padding:2px 8px;border-radius:4px;font-family:monospace">Ctrl+K</kbd></div>' +
      '  <div style="color:var(--text2,#888)">打开命令面板</div>' +
      '  <div><kbd style="background:var(--bg3,#2a2a3e);padding:2px 8px;border-radius:4px;font-family:monospace">↑↓</kbd> <kbd style="background:var(--bg3,#2a2a3e);padding:2px 8px;border-radius:4px;font-family:monospace">Ctrl+P/N</kbd></div>' +
      '  <div style="color:var(--text2,#888)">导航命令列表</div>' +
      '  <div><kbd style="background:var(--bg3,#2a2a3e);padding:2px 8px;border-radius:4px;font-family:monospace">Enter</kbd></div>' +
      '  <div style="color:var(--text2,#888)">执行选中命令</div>' +
      '  <div><kbd style="background:var(--bg3,#2a2a3e);padding:2px 8px;border-radius:4px;font-family:monospace">Esc</kbd></div>' +
      '  <div style="color:var(--text2,#888)">关闭面板</div>' +
      '</div>' +
      '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border,#333);font-size:12px;color:var(--text2,#888)">' +
      '输入命令名或窗口名快速搜索。可搜索中文、英文、关键词。' +
      '</div>' +
      '<div style="margin-top:16px;text-align:right">' +
      '  <button class="btn-primary" onclick="this.closest(\'div[style]\').parentElement.remove()">知道了</button>' +
      '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  // ════════════════════════════════════════
  // 启动
  // ════════════════════════════════════════

  // 注册系统命令（在包加载之后，确保 category 顺序合理）
  registerSystemCommands();

  // 全局键盘监听
  document.addEventListener('keydown', onGlobalKeydown);

  // ── 暴露 API ──
  window.ACMS = window.ACMS || {};
  ACMS.registerCommand = registerCommand;
  ACMS.getCommand = getCommand;
  ACMS.getAllCommands = getAllCommands;
  ACMS.searchCommands = searchCommands;
  ACMS.commandPalette = {
    open: open,
    close: close,
    isOpen: function() { return isOpen; },
    // 内联 onclick 回调（由 setAttribute('onclick', ...) 调用）
    __exec: function(idx) {
      close();
      if (idx >= 0 && idx < currentResults.length) {
        executeCommand(currentResults[idx]);
      }
    },
  };
})();
