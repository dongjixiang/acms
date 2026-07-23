// ACMS 通知中心 (v0.58)
// 持久化通知历史，自动集成 toast + 任务栏 🔔 badge + 通知面板
//
// 数据存储：localStorage key 'acms-notifications'
// 结构：[{ id, icon, title, desc, type, time, read }]
// 上限 50 条，超出时删除最旧的已读通知
//
// API:
//   ACMS.Notif.add({icon, title, desc, type})  → 新增通知
//   ACMS.Notif.getAll()                          → 全部（新在前）
//   ACMS.Notif.getUnreadCount()                 → 未读数
//   ACMS.Notif.markRead(id)                     → 标为已读
//   ACMS.Notif.markAllRead()                    → 全部已读
//   ACMS.Notif.remove(id)                       → 删除单条
//   ACMS.Notif.clearAll()                       → 清空全部
//   ACMS.Notif.toggle()                         → 切换面板

(function() {
  'use strict';

  var STORAGE_KEY = 'acms-notifications';
  var MAX_NOTIFS = 50;
  var _changeListeners = [];
  var _panelOpen = false;

  // ── 数据层 ──

  function loadAll() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e) {
      return [];
    }
  }

  function saveAll(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch(e) {
      console.warn('[Notif] 保存失败:', e);
    }
  }

  // ── 通知类型 → 图标 ──
  var TYPE_ICONS = {
    success: '✅',
    error:   '❌',
    warning: '⚠️',
    info:    '💡',
    agent:   '🤖',
    review:  '👀',
    system:  '⚙️',
  };

  function getIconForType(type, fallbackIcon) {
    return fallbackIcon || TYPE_ICONS[type] || '💬';
  }

  // ── 相对时间 ──
  function relativeTime(iso) {
    var diff = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return mins + ' 分钟前';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + ' 小时前';
    var days = Math.floor(hours / 24);
    if (days < 30) return days + ' 天前';
    return new Date(iso).toLocaleDateString('zh-CN');
  }

  // ── 添加通知 ──
  function add(opts) {
    var list = loadAll();
    var entry = {
      id: 'n' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      icon: getIconForType(opts.type, opts.icon),
      title: opts.title || '',
      desc: opts.desc || '',
      type: opts.type || 'info',
      time: new Date().toISOString(),
      read: false,
    };
    list.unshift(entry);  // 新通知在开头

    // 超量裁剪：优先删已读
    if (list.length > MAX_NOTIFS) {
      var unread = list.filter(function(n) { return !n.read; });
      if (unread.length <= MAX_NOTIFS) {
        list = list.slice(0, MAX_NOTIFS);
      } else {
        // 未读已经超过上限，保留最新的 MAX_NOTIFS
        list = unread.slice(0, MAX_NOTIFS);
      }
    }

    saveAll(list);
    notifyChange();
    return entry;
  }

  // ── 获取 ──
  function getAll() { return loadAll(); }

  function getUnreadCount() {
    return loadAll().filter(function(n) { return !n.read; }).length;
  }

  // ── 标为已读 ──
  function markRead(id) {
    var list = loadAll();
    var changed = false;
    list.forEach(function(n) {
      if (n.id === id && !n.read) {
        n.read = true;
        changed = true;
      }
    });
    if (changed) { saveAll(list); notifyChange(); }
  }

  function markAllRead() {
    var list = loadAll();
    var changed = false;
    list.forEach(function(n) {
      if (!n.read) { n.read = true; changed = true; }
    });
    if (changed) { saveAll(list); notifyChange(); }
  }

  // ── 删除 ──
  function remove(id) {
    var list = loadAll().filter(function(n) { return n.id !== id; });
    saveAll(list);
    notifyChange();
  }

  function clearAll() {
    saveAll([]);
    notifyChange();
  }

  // ── 面板切换 ──
  function open() {
    _panelOpen = true;
    var panel = document.getElementById('notif-panel');
    if (panel) panel.classList.add('open');
    // 打开时自动全部已读
    markAllRead();
    // 更新 badge
    updateBadge();
  }

  function close() {
    _panelOpen = false;
    var panel = document.getElementById('notif-panel');
    if (panel) panel.classList.remove('open');
  }

  function toggle() {
    if (_panelOpen) close();
    else open();
  }

  // ── 渲染 ──
  function render() {
    var list = document.getElementById('notif-list');
    if (!list) return;
    var notifs = loadAll();

    list.innerHTML = '';

    if (notifs.length === 0) {
      list.innerHTML = '<div class="notif-empty">暂无通知</div>';
      renderClearAllBtn(false);
      return;
    }

    notifs.forEach(function(n) {
      var div = document.createElement('div');
      div.className = 'notif-entry' + (n.read ? '' : ' notif-unread');
      div.dataset.nid = n.id;

      div.innerHTML =
        '<span class="ne-icon">' + (n.icon || '💬') + '</span>' +
        '<div class="ne-body">' +
          '<div class="ne-title">' + escHtml(n.title) + '</div>' +
          '<div class="ne-desc">' + escHtml(n.desc || '') + '</div>' +
          '<div class="ne-time">' + relativeTime(n.time) + '</div>' +
        '</div>' +
        '<button class="ne-dismiss" title="忽略">✕</button>';

      // 点击通知主体 → 标为已读（已读则忽略）
      var body = div.querySelector('.ne-body');
      body.addEventListener('click', function(e) {
        e.stopPropagation();
        if (!n.read) {
          markRead(n.id);
          div.classList.remove('notif-unread');
          updateBadge();
        }
      });

      // 点击 ✕ 删除
      var dismiss = div.querySelector('.ne-dismiss');
      dismiss.addEventListener('click', function(e) {
        e.stopPropagation();
        remove(n.id);
        // if list becomes empty, show empty state
        if (loadAll().length === 0) render();
      });

      list.appendChild(div);
    });

    renderClearAllBtn(true);
  }

  function renderClearAllBtn(show) {
    var panel = document.getElementById('notif-panel');
    if (!panel) return;
    var existing = panel.querySelector('.notif-actions');
    if (existing) existing.remove();

    if (show) {
      var actions = document.createElement('div');
      actions.className = 'notif-actions';
      actions.innerHTML = '<button class="notif-clear-all">清空全部</button>';
      actions.querySelector('.notif-clear-all').addEventListener('click', function() {
        clearAll();
        render();
      });
      panel.appendChild(actions);
    }
  }

  // ── Badge 更新 ──
  function updateBadge() {
    var count = getUnreadCount();
    var badge = document.getElementById('tb-notif-count');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = 'inline';
    } else {
      badge.textContent = '0';
      badge.style.display = 'none';
    }
  }

  // ── 变化通知 ──
  function notifyChange() {
    render();
    updateBadge();
    _changeListeners.forEach(function(fn) {
      try { fn(); } catch(e) { console.warn('[Notif] listener error:', e); }
    });
  }

  function onChange(fn) {
    if (typeof fn === 'function') _changeListeners.push(fn);
  }

  // ── 集成 toast ──
  function hookToast() {
    var origToast = window.toast;
    if (typeof origToast !== 'function') {
      // toast 可能还没加载，等一会
      var check = setInterval(function() {
        if (typeof window.toast === 'function') {
          clearInterval(check);
          doHook(window.toast);
        }
      }, 200);
      // 最多等 10 秒
      setTimeout(function() { clearInterval(check); }, 10000);
    } else {
      doHook(origToast);
    }
  }

  function doHook(origToast) {
    window.toast = function(msg, type) {
      // 调原 toast（浮层显示）
      origToast(msg, type);
      // 同步写入通知中心
      var notifType = type || 'info';
      add({
        title: msg,
        icon: TYPE_ICONS[notifType] || '',
        type: notifType,
      });
    };
  }

  // ── 系统命令注册：打开通知中心 ──
  function registerCommand() {
    if (window.ACMS && ACMS.registerCommand) {
      ACMS.registerCommand('notification.open', {
        title: '打开通知中心',
        icon: '🔔',
        category: '系统',
        keywords: ['通知', 'notification', 'notif'],
        group: 30,
        handler: function() { toggle(); },
      });
    }
  }

  // ════════════════════════════════════════
  // 初始化
  // ════════════════════════════════════════

  function init() {
    // 首次加载：迁移旧 localStorage 标记（如果有旧 mock 数据）
    var oldFlag = localStorage.getItem('acms-notif-last');
    if (oldFlag && loadAll().length === 0) {
      localStorage.removeItem('acms-notif-last');
    }

    // 初始渲染
    render();
    updateBadge();

    // 集成 toast
    hookToast();

    // 注册命令
    registerCommand();
  }

  // 暴露 API
  window.ACMS = window.ACMS || {};
  ACMS.Notif = {
    add: add,
    getAll: getAll,
    getUnreadCount: getUnreadCount,
    markRead: markRead,
    markAllRead: markAllRead,
    remove: remove,
    clearAll: clearAll,
    open: open,
    close: close,
    toggle: toggle,
    onChange: onChange,
    render: render,
  };

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
