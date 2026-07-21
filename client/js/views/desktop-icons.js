// ACMS — 桌面图标管理模块 (v0.56)
// 依赖: ACMSWin (window-manager.js)
// 功能：
//   1. 右键 .launcher-item → 固定/取消固定到桌面
//   2. localStorage 'acms-desktop-pinned' 持久化
//   3. 首次使用自动添加默认图标
//   4. openDesktopIconManager() 管理窗口
(function() {
  'use strict';

  var STORAGE_KEY = 'acms-desktop-pinned';
  var AUTO_ARRANGE_KEY = 'acms-desktop-auto-arrange';

  // ── 默认图标（首次使用时写入） ──
  var DEFAULT_PINNED = [
    { id: 'chat-recycle', icon: '🗑', label: '回收站', actionType: 'function', actionValue: 'openChatRecycleBin' },
    { id: 'projects',     icon: '📦', label: '项目管理', actionType: 'function', actionValue: 'launchProjects' },
    { id: 'requirements', icon: '📋', label: '需求管理', actionType: 'viewName', actionValue: 'requirements' },
    { id: 'kanban',       icon: '📌', label: '任务看板', actionType: 'viewName', actionValue: 'kanban' },
  ];

  // ─────────────────────────────────────────────
  // 辅助：从 .launcher-item DOM 元素解析动作
  // ─────────────────────────────────────────────
  function parseLauncherAction(el) {
    var id = el.id || '';
    var onclickAttr = el.getAttribute('onclick') || '';

    // 特殊情况：新建对话
    if (id === 'launcher-new-chat') {
      return { actionType: 'function', actionValue: 'createNewChatWindow' };
    }
    // 特殊情况：新建项目
    if (id === 'launcher-new-project') {
      return { actionType: 'function', actionValue: 'openProjectsWindowWithNewForm' };
    }

    // launchView('xxx') → actionType='viewName', actionValue=视图名
    // 注意：view name 可能含 '-'（如 file-manager），所以用 [^']+ 而不是 \w+
    var viewMatch = onclickAttr.match(/launchView\s*\(\s*'([^']+)'\s*\)/);
    if (viewMatch) {
      return { actionType: 'viewName', actionValue: viewMatch[1] };
    }

    // ACMSWin.open('viewname', ...) → actionType='viewName', actionValue=viewname
    var winOpenMatch = onclickAttr.match(/ACMSWin\.open\s*\(\s*'([^']+)'/);
    if (winOpenMatch) {
      return { actionType: 'viewName', actionValue: winOpenMatch[1] };
    }

    // 否则取函数名部分：funcName(...) → actionType='function', actionValue='funcName'
    var fnMatch = onclickAttr.match(/(\w+)\s*\(/);
    if (fnMatch) {
      return { actionType: 'function', actionValue: fnMatch[1] };
    }

    return null;
  }

  // ─────────────────────────────────────────────
  // 从 actionType/actionValue 构建 onClick 函数
  // ─────────────────────────────────────────────
  function buildOnClick(actionType, actionValue, extra) {
    extra = extra || {};
    if (actionType === 'viewName') {
      return function() {
        if (window.ACMSWin) {
          if (!ACMSWin.isActive()) ACMSWin.enable();
          ACMSWin.open(actionValue);
        }
      };
    }
    if (actionType === 'terminal') {
      return function() {
        if (typeof window.openTerminalLauncher === 'function') {
          // 从 pinned items 找到完整的条目（含 cwd）
          var pinned = getPinned() || [];
          var item = pinned.find(function(p) { return p.actionValue === actionValue && p.actionType === 'terminal'; });
          var id = (item && item.id) || ('term-' + actionValue.replace(/[^a-zA-Z0-9]/g, '-'));
          window.openTerminalLauncher(id);
        } else if (window.ACMSWin) {
          if (!ACMSWin.isActive()) ACMSWin.enable();
          ACMSWin.open('terminal', {
            w: 820, h: 500, title: '💻 ' + actionValue,
            opts: { cmd: actionValue, cwd: extra.cwd || '~', label: actionValue },
          });
        }
      };
    }
    if (actionType === 'function') {
      return function() {
        if (typeof window[actionValue] === 'function') {
          window[actionValue]();
        }
      };
    }
    return function() {};
  }

  // ─────────────────────────────────────────────
  // localStorage 读写
  // ─────────────────────────────────────────────
  function getPinned() {
    try {
      var data = localStorage.getItem(STORAGE_KEY);
      if (data) return JSON.parse(data);
    } catch (e) { /* ignore */ }
    return null;
  }

  function savePinned(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  // ── 自动排列状态 ──
  function isAutoArrange() {
    return localStorage.getItem(AUTO_ARRANGE_KEY) !== 'false';
  }

  function setAutoArrange(on) {
    localStorage.setItem(AUTO_ARRANGE_KEY, on ? 'true' : 'false');
  }

  // ─────────────────────────────────────────────
  // 刷新桌面图标：读取 localStorage → 构建 spec（含 x/y 位置）→ 调用 ACMSWin._replaceDesktopIcons
  // ─────────────────────────────────────────────
  function refreshDesktopIcons() {
    var pinned = getPinned();
    if (!pinned || pinned.length === 0) {
      // 首次使用：写入默认图标
      pinned = DEFAULT_PINNED.slice();
      savePinned(pinned);
    }

    // 如果自动排列开启，计算网格位置
    if (isAutoArrange()) {
      var startX = 20, startY = 20;
      var colGap = 100, rowGap = 110;
      var cols = Math.max(1, Math.floor((window.innerWidth - 40) / colGap));
      pinned.forEach(function(item, idx) {
        var col = idx % cols;
        var row = Math.floor(idx / cols);
        item.x = startX + col * colGap;
        item.y = startY + row * rowGap;
      });
      savePinned(pinned);
    } else {
      // 非自动排列：补齐缺失的 x/y（首次或迁移旧数据）
      pinned.forEach(function(item, idx) {
        if (typeof item.x !== 'number') {
          item.x = 20 + idx * 100;
          item.y = 20 + Math.floor(idx / 4) * 110;
        }
      });
    }

    var specs = pinned.map(function(item) {
      return {
        id: item.id,
        icon: item.icon,
        label: item.label,
        x: item.x,
        y: item.y,
        onClick: buildOnClick(item.actionType, item.actionValue, item),
      };
    });

    if (window.ACMSWin && typeof ACMSWin._replaceDesktopIcons === 'function') {
      ACMSWin._replaceDesktopIcons(specs);
      // 注册自由拖拽位置持久化回调
      if (typeof ACMSWin._onDesktopIconMoved === 'function') {
        ACMSWin._onDesktopIconMoved(function(id, x, y) {
          var pinned = getPinned();
          if (!pinned) return;
          var found = false;
          pinned.forEach(function(p) {
            if (p.id === id) {
              p.x = Math.round(x);
              p.y = Math.round(y);
              found = true;
            }
          });
          if (found) savePinned(pinned);
        });
      }
    }
  }

  // ─────────────────────────────────────────────
  // 扩展 ACMSWin：pinLauncherItem / unpinDesktopIcon / getPinnedIcons
  // ─────────────────────────────────────────────
  function extendACMSWin() {
    if (!window.ACMSWin) return;
    var Win = window.ACMSWin;

    // spec = { id, icon, label, actionType, actionValue }
    Win.pinLauncherItem = function(spec) {
      var pinned = getPinned();
      if (!pinned) pinned = [];
      // 去重
      var exists = pinned.some(function(p) { return p.id === spec.id; });
      if (exists) return;
      pinned.push(spec);
      savePinned(pinned);
      refreshDesktopIcons();
    };

    Win.unpinDesktopIcon = function(id) {
      var pinned = getPinned();
      if (!pinned) return;
      pinned = pinned.filter(function(p) { return p.id !== id; });
      savePinned(pinned);
      refreshDesktopIcons();
    };

    Win.getPinnedIcons = function() {
      return getPinned() || [];
    };
  }

  // ─────────────────────────────────────────────
  // 右键 .launcher-item → 弹出固定/移除菜单
  // ─────────────────────────────────────────────
  function bindLauncherContextMenu() {
    // 使用事件委托监听所有 .launcher-item 的 contextmenu
    document.addEventListener('contextmenu', function(e) {
      var item = e.target.closest('.launcher-item');
      if (!item) return;
      // 忽略退出登录
      var onclickAttr = item.getAttribute('onclick') || '';
      if (onclickAttr.indexOf('doLogout') !== -1) return;

      e.preventDefault();
      e.stopPropagation();

      // 移除已有菜单
      var old = document.getElementById('acms-launcher-pin-menu');
      if (old) old.remove();

      // 获取图标信息
      var iconEl = item.querySelector('.li-icon');
      var labelEl = item.querySelector('.li-label');
      var icon = iconEl ? iconEl.textContent : '📄';
      var label = labelEl ? labelEl.textContent : item.textContent.trim();

      // 生成唯一 id（基于 label 做 slug）
      var id = 'pinned-' + label.replace(/[\s\/]+/g, '-').toLowerCase();
      var action = parseLauncherAction(item);

      // 检查是否已固定
      var pinned = getPinned() || [];
      var alreadyPinned = pinned.some(function(p) { return p.id === id; });

      // 创建弹出菜单
      var menu = document.createElement('div');
      menu.id = 'acms-launcher-pin-menu';
      menu.style.cssText =
        'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY +
        'px;background:var(--bg2);border:1px solid var(--border);' +
        'border-radius:8px;padding:4px;z-index:100000;' +
        'box-shadow:0 4px 16px rgba(0,0,0,0.4);min-width:140px;';

      var option = document.createElement('div');
      option.style.cssText =
        'padding:6px 12px;cursor:pointer;font-size:13px;border-radius:6px;' +
        'display:flex;align-items:center;gap:6px;white-space:nowrap;';
      option.textContent = alreadyPinned ? '❌ 从桌面移除' : '📌 固定到桌面';
      option.addEventListener('mouseenter', function() {
        this.style.background = 'var(--bg3)';
      });
      option.addEventListener('mouseleave', function() {
        this.style.background = 'transparent';
      });
      option.addEventListener('click', function() {
        if (window.ACMSWin) {
          if (alreadyPinned) {
            ACMSWin.unpinDesktopIcon(id);
          } else if (action) {
            ACMSWin.pinLauncherItem({
              id: id,
              icon: icon,
              label: label,
              actionType: action.actionType,
              actionValue: action.actionValue,
            });
          }
        }
        menu.remove();
      });
      menu.appendChild(option);

      // 点击其他地方关闭菜单
      var closeMenu = function(ev) {
        if (!menu.contains(ev.target)) {
          menu.remove();
          document.removeEventListener('mousedown', closeMenu);
        }
      };
      setTimeout(function() {
        document.addEventListener('mousedown', closeMenu);
      }, 0);

      document.body.appendChild(menu);
    });
  }

  // ─────────────────────────────────────────────
  // 桌面图标管理窗口
  // ─────────────────────────────────────────────
  /**
   * openDesktopIconManager - 打开桌面图标管理窗口
   * 两列布局：左列已固定图标（可移除），右列可固定启动项（可添加）
   */
  window.openDesktopIconManager = function openDesktopIconManager() {
    if (!window.ACMSWin) return;
    if (!ACMSWin.isActive()) ACMSWin.enable();
    ACMSWin.open('desktop-icons-manager', { w: 480, h: 420, title: '桌面图标管理' });
  };

  // ── 注册视图加载器 ──
  // 在 ACMSWin 就绪后注册，兼容脚本加载顺序
  function registerManagerLoader() {
    if (!window.ACMSWin) {
      // 还没加载，等 window-manager 加载后通过队列注册
      if (!window._viewLoaderQueue) window._viewLoaderQueue = [];
      window._viewLoaderQueue.push({ view: 'desktop-icons-manager', loader: managerLoader });
      return;
    }
    ACMSWin.registerViewLoader('desktop-icons-manager', managerLoader);
  }

  function managerLoader(w) {
    if (w.dead) return;
    renderManagerContent(w);
  }

  function renderManagerContent(w) {
    var pinned = getPinned() || [];
    // 所有可固定的启动项
    var allItems = collectPinnableItems();
    // 已固定的 id 集合
    var pinnedIds = {};
    pinned.forEach(function(p) { pinnedIds[p.id] = true; });

    var html = '<div style="display:flex;gap:12px;height:100%;padding:8px">';

    // ── 左列：已固定的桌面图标 ──
    html += '<div style="flex:1;overflow-y:auto;border-right:1px solid var(--border);padding-right:8px">';
    html += '<div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:8px">📌 已固定的桌面图标</div>';
    if (pinned.length === 0) {
      html += '<div style="font-size:12px;color:var(--text3);padding:8px">暂无固定图标</div>';
    } else {
      pinned.forEach(function(p) {
        html += '<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;">';
        html += '<span>' + p.icon + '</span>';
        html += '<span style="flex:1;font-size:13px">' + escHtml(p.label) + '</span>';
        html += '<button class="btn-small btn-reject" style="font-size:10px;padding:2px 6px" data-unpin-id="' + escAttr(p.id) + '">✕</button>';
        html += '</div>';
      });
    }
    html += '</div>';

    // ── 右列：可固定的启动项 ──
    html += '<div style="flex:1;overflow-y:auto;padding-left:4px">';
    html += '<div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:8px">➕ 可固定的启动项</div>';
    if (allItems.length === 0) {
      html += '<div style="font-size:12px;color:var(--text3);padding:8px">无可固定项</div>';
    } else {
      allItems.forEach(function(item) {
        var already = pinnedIds[item.id];
        html += '<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;' +
          (already ? 'opacity:0.4' : '') + '">';
        html += '<span>' + item.icon + '</span>';
        html += '<span style="flex:1;font-size:13px">' + escHtml(item.label) + '</span>';
        if (!already) {
          html += '<button class="btn-small btn-accept" style="font-size:10px;padding:2px 6px" ' +
            'data-pin-icon="' + escAttr(item.icon) + '" ' +
            'data-pin-label="' + escAttr(item.label) + '" ' +
            'data-pin-id="' + escAttr(item.id) + '" ' +
            'data-pin-type="' + escAttr(item.actionType) + '" ' +
            'data-pin-value="' + escAttr(item.actionValue) + '">+</button>';
        }
        html += '</div>';
      });
    }
    html += '</div>';

    html += '</div>'; // end flex

    w.$c.innerHTML = html;
    w.$c.style.overflow = 'hidden';

    // 绑定事件
    // 移除按钮
    w.$c.querySelectorAll('[data-unpin-id]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.dataset.unpinId;
        if (window.ACMSWin && typeof ACMSWin.unpinDesktopIcon === 'function') {
          ACMSWin.unpinDesktopIcon(id);
          // 重新渲染当前窗口
          renderManagerContent(w);
        }
      });
    });

    // 固定按钮
    w.$c.querySelectorAll('[data-pin-id]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (window.ACMSWin && typeof ACMSWin.pinLauncherItem === 'function') {
          ACMSWin.pinLauncherItem({
            id: btn.dataset.pinId,
            icon: btn.dataset.pinIcon,
            label: btn.dataset.pinLabel,
            actionType: btn.dataset.pinType,
            actionValue: btn.dataset.pinValue,
          });
          renderManagerContent(w);
        }
      });
    });
  }

  // ── 收集所有可固定的启动项 ──
  function collectPinnableItems() {
    var items = [];
    var launcherItems = document.querySelectorAll('#launcher-menu .launcher-item');

    // 检查当前用户角色
    var isAdmin = false;
    try {
      var userData = JSON.parse(localStorage.getItem('acms-user') || '{}');
      if (userData.role === 'admin') isAdmin = true;
    } catch (e) { /* ignore */ }

    launcherItems.forEach(function(el) {
      var onclickAttr = el.getAttribute('onclick') || '';
      // 忽略 logut
      if (onclickAttr.indexOf('doLogout') !== -1) return;
      // 忽略带有子菜单的容器项（如 "对话" 本身，子菜单项单独处理）
      if (el.classList.contains('launcher-has-submenu')) return;
      // 非管理员隐藏系统管理
      if (!isAdmin && onclickAttr.indexOf('launchAdmin') !== -1) return;

      var iconEl = el.querySelector('.li-icon');
      var labelEl = el.querySelector('.li-label');
      var icon = iconEl ? iconEl.textContent : '📄';
      var label = labelEl ? labelEl.textContent.trim() : '';
      if (!label) return;

      var action = parseLauncherAction(el);
      if (!action) return;

      var id = 'pinned-' + label.replace(/[\s\/]+/g, '-').toLowerCase();

      items.push({
        id: id,
        icon: icon,
        label: label,
        actionType: action.actionType,
        actionValue: action.actionValue,
      });
    });

    // 额外收集子菜单中的可固定项（对话子菜单）
    var subItems = document.querySelectorAll('#launcher-chat-submenu .launcher-item');
    subItems.forEach(function(el) {
      var onclickAttr = el.getAttribute('onclick') || '';
      var iconEl = el.querySelector('.li-icon');
      var labelEl = el.querySelector('.li-label');
      var icon = iconEl ? iconEl.textContent : '📄';
      var label = labelEl ? labelEl.textContent.trim() : '';
      if (!label) return;

      var action = parseLauncherAction(el);
      if (!action) return;

      var id = 'pinned-' + label.replace(/[\s\/]+/g, '-').toLowerCase();

      items.push({
        id: id,
        icon: icon,
        label: label,
        actionType: action.actionType,
        actionValue: action.actionValue,
      });
    });

    return items;
  }

  // ── HTML 转义 ──
  function escHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escAttr(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
              .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─────────────────────────────────────────────
  // 对外初始化入口
  // ─────────────────────────────────────────────
  /**
   * setupDesktopIcons - 初始化桌面图标管理
   * 在 app.js initApp() 末尾调用
   * 1. 扩展 ACMSWin API（pinLauncherItem / unpinDesktopIcon / getPinnedIcons）
   * 2. 从 localStorage 读取并注册已固定图标
   * 3. 绑定右键菜单到 launcher-item
   * 4. 注册 desktop-icons-manager 视图加载器
   */
  window.setupDesktopIcons = function setupDesktopIcons() {
    extendACMSWin();
    refreshDesktopIcons();
    bindLauncherContextMenu();
    registerManagerLoader();
  };

  /**
   * toggleDesktopAutoArrange - 切换桌面图标自动排列
   * 暴露为全局函数，供上下文菜单调用
   */
  window.toggleDesktopAutoArrange = function toggleDesktopAutoArrange() {
    var on = !isAutoArrange();
    setAutoArrange(on);
    // refreshDesktopIcons 会根据自动排列状态决定是否重新计算网格
    refreshDesktopIcons();
  };

  // ── 监听外部触发的桌面图标刷新事件（来自 terminal.js syncDesktopIcons） ──
  window.addEventListener('desktop-icons-changed', function() {
    refreshDesktopIcons();
  });

})();
