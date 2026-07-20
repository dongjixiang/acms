// ACMS — 桌面右键菜单
// 依赖: ACMSWin, ACMSWallpaper
// 右键 #acms-desktop 弹出上下文菜单
(function() {
  'use strict';

  var MENU_ID = 'acms-desktop-context-menu';

  // ── 菜单定义 ──
  var menuItems = [];

  function buildMenuItems() {
    menuItems = [
      {
        id: 'refresh',
        label: '刷新桌面',
        icon: '🔄',
        action: function() {
          // 重新应用壁纸
          if (window.ACMSWallpaper) {
            var w = ACMSWallpaper.get();
            if (w && w.url) {
              ACMSWallpaper.set(w.url, w.style).catch(function() {});
              return;
            }
          }
          // 无壁纸时简单重新渲染桌面图标
          if (window.ACMSWin && typeof ACMSWin._renderDesktopIcons === 'function') {
            ACMSWin._renderDesktopIcons();
          }
        },
      },
      null, // separator
      {
        id: 'wallpaper',
        label: '更换壁纸',
        icon: '🖼',
        children: [
          { id: 'wp-presets', label: '选择预设', icon: '🎨', action: function() { openWallpaperDialog(); } },
          null,
          { id: 'wp-upload', label: '上传图片…', icon: '📁', action: function() { triggerWallpaperUpload(); } },
          null,
          { id: 'wp-reset', label: '恢复默认', icon: '🗑', action: function() { if (window.ACMSWallpaper) ACMSWallpaper.reset(); } },
        ],
      },
      {
        id: 'wallpaper-style',
        label: '壁纸缩放',
        icon: '🔲',
        children: function() {
          var currentStyle = (window.ACMSWallpaper && ACMSWallpaper.getStyle()) || 'cover';
          var styles = [
            { id: 'cover',   label: '填充铺满', icon: currentStyle === 'cover'   ? '●' : '○' },
            { id: 'contain', label: '适应',     icon: currentStyle === 'contain' ? '●' : '○' },
            { id: 'fill',    label: '拉伸',     icon: currentStyle === 'fill'    ? '●' : '○' },
          ];
          return styles.map(function(s) {
            return {
              id: 'ws-' + s.id,
              label: s.label,
              icon: s.icon,
              action: function() { if (window.ACMSWallpaper) ACMSWallpaper.setStyle(s.id); },
            };
          });
        },
      },
      null, // separator
      {
        id: 'auto-arrange',
        label: '自动排列',
        icon: function() {
          var on = localStorage.getItem('acms-desktop-auto-arrange') !== 'false';
          return on ? '☑' : '☐';
        },
        action: function() {
          if (typeof window.toggleDesktopAutoArrange === 'function') {
            window.toggleDesktopAutoArrange();
          }
        },
      },
      null, // separator
      {
        id: 'new-chat',
        label: '新建对话',
        icon: '💬',
        action: function() {
          if (typeof window.createNewChatWindow === 'function') {
            window.createNewChatWindow();
          }
        },
      },
      {
        id: 'file-manager',
        label: '文件浏览器',
        icon: '📂',
        action: function() {
          if (window.ACMSWin) {
            if (!ACMSWin.isActive()) ACMSWin.enable();
            ACMSWin.open('file-manager', { w: 720, h: 500 });
          }
        },
      },
      {
        id: 'web-browser',
        label: '浏览器',
        icon: '🌐',
        action: function() {
          if (typeof window.openWebBrowser === 'function') {
            window.openWebBrowser();
          }
        },
      },
      null, // separator
      {
        id: 'display-settings',
        label: '显示设置',
        icon: '⚙️',
        children: [
          { id: 'ds-theme', label: '切换主题', icon: '🎨', action: function() { cycleTheme(); } },
        ],
      },
      null, // separator
      {
        id: 'admin',
        label: '系统管理',
        icon: '⚙️',
        adminOnly: true,
        action: function() {
          if (typeof window.launchAdmin === 'function') {
            window.launchAdmin();
          } else if (window.ACMSWin) {
            if (!ACMSWin.isActive()) ACMSWin.enable();
            ACMSWin.open('admin', { w: 720, h: 520 });
          }
        },
      },
      null, // separator
      {
        id: 'logout',
        label: '退出登录',
        icon: '🚪',
        action: function() {
          if (typeof window.doLogout === 'function') {
            window.doLogout();
          }
        },
      },
    ];
  }

  // ── 主题切换 ──
  function cycleTheme() {
    if (typeof App !== 'undefined' && App.toggleTheme) {
      App.toggleTheme();
      return;
    }
    var themes = ['dark', 'light', 'cream'];
    var current = document.documentElement.getAttribute('data-theme') || 'dark';
    var next = themes[(themes.indexOf(current) + 1) % themes.length];
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('acms-theme', next);
  }

  // ── 壁纸对话框 ──
  function openWallpaperDialog() {
    if (typeof window.showWallpaperDialog === 'function') {
      window.showWallpaperDialog();
      return;
    }
    // fallback: 打开壁纸设置窗口
    if (window.ACMSWin) {
      if (!ACMSWin.isActive()) ACMSWin.enable();
      ACMSWin.open('wallpaper', { w: 480, h: 400, title: '壁纸设置' });
    }
  }

  // ── 上传壁纸 ──
  function triggerWallpaperUpload() {
    var input = document.getElementById('acms-wp-upload-input');
    if (!input) {
      input = document.createElement('input');
      input.id = 'acms-wp-upload-input';
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', function(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(ev) {
          var dataUrl = ev.target.result;
          if (window.ACMSWallpaper) {
            ACMSWallpaper.set(dataUrl, 'cover').catch(function(err) {
              console.warn('[DesktopContextMenu] 壁纸设置失败:', err.message);
              if (typeof toast === 'function') toast('壁纸设置失败', 'error');
            });
          }
        };
        reader.readAsDataURL(file);
        input.value = '';
      });
    }
    input.click();
  }

  // ── 创建菜单 DOM ──
  function createMenu(x, y) {
    removeMenu();

    buildMenuItems();

    // 检查管理员权限
    var isAdmin = false;
    try {
      var user = JSON.parse(localStorage.getItem('acms-user') || '{}');
      isAdmin = user.role === 'admin';
    } catch (e) {}

    var menu = document.createElement('div');
    menu.id = MENU_ID;
    menu.className = 'acms-context-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    var html = '';
    menuItems.forEach(function(item) {
      if (item === null) {
        html += '<div class="acms-cm-separator"></div>';
        return;
      }
      // 管理员检查
      if (item.adminOnly && !isAdmin) return;

      var hasChildren = item.children || (typeof item.children === 'function');
      var itemClass = 'acms-cm-item' + (hasChildren ? ' has-submenu' : '');
      // 支持动态图标（函数）
      var iconStr = (typeof item.icon === 'function') ? item.icon() : item.icon;
      var iconHtml = iconStr ? '<span class="acms-cm-icon">' + iconStr + '</span>' : '';
      var arrowHtml = hasChildren ? '<span class="acms-cm-arrow">▸</span>' : '';

      html += '<div class="' + itemClass + '" data-id="' + item.id + '">' +
        iconHtml +
        '<span class="acms-cm-label">' + item.label + '</span>' +
        arrowHtml +
        '</div>';

      if (hasChildren) {
        html += '<div class="acms-cm-submenu" data-parent="' + item.id + '">';
        var children = typeof item.children === 'function' ? item.children() : item.children;
        if (children && children.length) {
          children.forEach(function(child) {
            if (child === null) {
              html += '<div class="acms-cm-separator"></div>';
              return;
            }
            var childIconStr = (typeof child.icon === 'function') ? child.icon() : child.icon;
            html += '<div class="acms-cm-item" data-id="' + child.id + '" data-parent="' + item.id + '">' +
              (childIconStr ? '<span class="acms-cm-icon">' + childIconStr + '</span>' : '') +
              '<span class="acms-cm-label">' + child.label + '</span>' +
              '</div>';
          });
        }
        html += '</div>';
      }
    });

    menu.innerHTML = html;

    // 绑定事件（委托）
    menu.addEventListener('click', function(e) {
      var itemEl = e.target.closest('.acms-cm-item');
      if (!itemEl) return;
      // 有子菜单的点击不关闭
      if (itemEl.classList.contains('has-submenu')) return;
      var id = itemEl.dataset.id;
      var parentId = itemEl.dataset.parent;
      // 查找并执行 action
      if (parentId) {
        var parentItem = findItem(parentId);
        if (parentItem && parentItem.children) {
          var children = typeof parentItem.children === 'function' ? parentItem.children() : parentItem.children;
          var child = children.find(function(c) { return c && c.id === id; });
          if (child && child.action) {
            removeMenu();
            child.action();
          }
        }
      } else {
        var item = findItem(id);
        if (item && item.action) {
          removeMenu();
          item.action();
        }
      }
    });

    // 子菜单 hover 显示 — 延迟 200ms + 防止间隙丢失 + 视口适配
    var hoverTimers = {};
    var SUBMENU_DELAY = 200;

    menu.querySelectorAll('.acms-cm-item.has-submenu').forEach(function(itemEl) {
      var id = itemEl.dataset.id;
      var sub = menu.querySelector('.acms-cm-submenu[data-parent="' + id + '"]');
      if (!sub) return;

      // 子菜单 z-index 高于父菜单
      sub.style.zIndex = 10000;

      // 父项 mouseenter：延迟 200ms 后显示子菜单
      itemEl.addEventListener('mouseenter', function() {
        // 隐藏其他子菜单
        menu.querySelectorAll('.acms-cm-submenu.show').forEach(function(s) {
          if (s !== sub) s.classList.remove('show');
        });
        if (hoverTimers[id]) clearTimeout(hoverTimers[id]);
        hoverTimers[id] = setTimeout(function() {
          sub.classList.add('show');
          // 子菜单视口适配
          fitSubmenuToViewport(sub, itemEl);
        }, SUBMENU_DELAY);
      });

      // 父项 mouseleave：仅取消延迟，不隐藏子菜单（让鼠标能滑入右侧子菜单）
      itemEl.addEventListener('mouseleave', function() {
        if (hoverTimers[id]) clearTimeout(hoverTimers[id]);
      });

      // 子菜单 mouseenter：保持显示
      sub.addEventListener('mouseenter', function() {
        if (hoverTimers[id]) clearTimeout(hoverTimers[id]);
        sub.classList.add('show');
      });

      // 子菜单 mouseleave：隐藏
      sub.addEventListener('mouseleave', function() {
        if (hoverTimers[id]) clearTimeout(hoverTimers[id]);
        sub.classList.remove('show');
      });
    });

    // 子菜单视口适配
    function fitSubmenuToViewport(sub, parentItem) {
      requestAnimationFrame(function() {
        var subRect = sub.getBoundingClientRect();
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        // 右侧超出视口 → 翻转到父项左侧
        if (subRect.right > vw) {
          sub.style.left = 'auto';
          sub.style.right = (vw - parentItem.getBoundingClientRect().left) + 'px';
        }
        // 底部超出视口 → 从底部向上展开
        if (subRect.bottom > vh) {
          sub.style.top = 'auto';
          sub.style.bottom = '0';
        }
      });
    }

    document.body.appendChild(menu);

    // 边界检测：如果菜单超出视口，翻转
    var rect = menu.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    if (rect.right > vw) {
      menu.style.left = Math.max(0, vw - rect.width - 8) + 'px';
    }
    if (rect.bottom > vh) {
      menu.style.top = Math.max(0, vh - rect.height - 8) + 'px';
    }
  }

  // ── 全局闭包：点击菜单外部自动关闭 ──
  function installGlobalClose() {
    if (window._ctxMenuCloseInstalled) return;
    window._ctxMenuCloseInstalled = true;
    document.addEventListener('mousedown', function(e) {
      var menu = document.getElementById(MENU_ID);
      if (!menu) return;
      if (menu.contains(e.target)) return;
      menu.remove();
    });
    document.addEventListener('contextmenu', function(e) {
      var menu = document.getElementById(MENU_ID);
      if (!menu) return;
      if (menu.contains(e.target)) return;
      menu.remove();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        var menu = document.getElementById(MENU_ID);
        if (menu) menu.remove();
      }
    });
  }
  installGlobalClose();

  function removeMenu() {
    var menu = document.getElementById(MENU_ID);
    if (menu) menu.remove();
  }

  function findItem(id) {
    for (var i = 0; i < menuItems.length; i++) {
      if (menuItems[i] && menuItems[i].id === id) return menuItems[i];
    }
    return null;
  }

  // ── 初始化：绑定桌面右键事件 ──
  function init() {
    // 监听 DOM 变化，确保 #acms-desktop 存在后绑定事件
    var desktop = document.getElementById('acms-desktop');
    if (desktop) {
      bindDesktop(desktop);
      return;
    }
    // 如果桌面还未创建（window-manager 可能尚未初始化），等待
    var observer = new MutationObserver(function() {
      var d = document.getElementById('acms-desktop');
      if (d) {
        bindDesktop(d);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function bindDesktop(desktop) {
    // 监听 document 级别的 contextmenu
    document.addEventListener('contextmenu', function(e) {
      // 排除：窗口、桌面图标、任务栏、启动菜单
      if (e.target.closest('.acms-window')) return;
      if (e.target.closest('.desktop-icon')) return;
      if (e.target.closest('#taskbar')) return;
      if (e.target.closest('#launcher-menu')) return;
      // 排除 #tb-theme-popup（主题浮层）
      if (e.target.closest('#tb-theme-popup')) return;

      e.preventDefault();
      e.stopPropagation();

      var x = e.clientX;
      var y = e.clientY;
      createMenu(x, y);
    });

    // 阻止桌面区域的浏览器默认右键菜单
    document.addEventListener('mousedown', function(e) {
      if (e.button !== 2) return;
      if (e.target.closest('.acms-window')) return;
      if (e.target.closest('.desktop-icon')) return;
      if (e.target.closest('#taskbar')) return;
      if (e.target.closest('#launcher-menu')) return;
      e.preventDefault();
    });
  }

  // ── 暴露全局函数供 taskbar 🎨 浮层 inline onclick 调用 ──
  window.triggerWallpaperUpload = triggerWallpaperUpload;
  window.openWallpaperDialog = openWallpaperDialog;

  // ── 公开 API ──
  window.ACMSDesktopContextMenu = {
    init: init,
    show: function(x, y) { createMenu(x, y); },
    hide: removeMenu,
  };

  // 自动初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
