// ACMS — 桌面图标框选工具条 (v0.60)
// 依赖: ACMSWin (window-manager.js + desktop-icons.js)
// 订阅 onSelectionChange → 选中 ≥2 时显示工具条；<2 隐藏
// 工具条能力:
//   左对齐 / 顶对齐 / 横分 / 纵分 / 网格化 — 改 x/y 后 refreshDesktopIcons + 保留 selection
//   批量删除 — confirm 后循环 unpinDesktopIcon
(function() {
  'use strict';

  var TOOLBAR_ID = 'acms-marquee-toolbar';

  // ── 工具条 DOM ──
  function ensureToolbar() {
    var tb = document.getElementById(TOOLBAR_ID);
    if (tb) return tb;
    tb = document.createElement('div');
    tb.id = TOOLBAR_ID;
    tb.className = 'acms-marquee-toolbar hidden';
    tb.innerHTML =
      '<span class="amt-count" id="amt-count">0</span>' +
      '<span class="amt-divider"></span>' +
      '<button class="amt-btn" data-action="align-left" title="左对齐 (整组平移到全局最左)">⊞ 左对齐</button>' +
      '<button class="amt-btn" data-action="align-top" title="顶对齐 (整组平移到全局最顶)">⊟ 顶对齐</button>' +
      '<button class="amt-btn" data-action="distribute-x" title="横向均分 (按 y 分组, 组内 x 等距)">⌗ 横分</button>' +
      '<button class="amt-btn" data-action="distribute-y" title="纵向均分 (按 x 分组, 组内 y 等距)">⊟ 纵分</button>' +
      '<button class="amt-btn" data-action="grid" title="网格化 (重排为 4 列网格)">▦ 网格</button>' +
      '<span class="amt-divider"></span>' +
      '<button class="amt-btn amt-danger" data-action="delete" title="批量删除选中">🗑 删除</button>' +
      '<button class="amt-btn amt-cancel" data-action="cancel" title="取消选择">✕</button>';
    document.body.appendChild(tb);
    bindToolbarEvents(tb);
    return tb;
  }

  function bindToolbarEvents(tb) {
    tb.addEventListener('click', function(e) {
      var btn = e.target.closest('.amt-btn');
      if (!btn) return;
      var action = btn.dataset.action;
      var ids = currentSelection();
      if (!ids || ids.length === 0) return;
      if (action === 'cancel') {
        if (window.ACMSWin && typeof ACMSWin.clearSelection === 'function') {
          ACMSWin.clearSelection();
        }
      } else if (action === 'delete') {
        doDeleteSelected(ids);
      } else if (action.indexOf('align-') === 0 || action === 'grid') {
        doAlign(action, ids);
      }
    });
  }

  function currentSelection() {
    if (window.ACMSWin && typeof ACMSWin.getSelection === 'function') {
      return ACMSWin.getSelection();
    }
    return [];
  }

  // ── 显示/隐藏 ──
  function show(ids) {
    if (!ids || ids.length < 2) return hide();
    var tb = ensureToolbar();
    var counter = tb.querySelector('#amt-count');
    if (counter) counter.textContent = '选中 ' + ids.length;
    tb.classList.remove('hidden');
    positionToolbar(tb, ids);
  }

  function hide() {
    var tb = document.getElementById(TOOLBAR_ID);
    if (tb) tb.classList.add('hidden');
  }

  function positionToolbar(tb, ids) {
    var rects = ids.map(function(id) {
      var el = document.querySelector('.desktop-icon[data-icon-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
      return el ? el.getBoundingClientRect() : null;
    }).filter(Boolean);
    if (rects.length === 0) return;
    var minX = Math.min.apply(null, rects.map(function(r) { return r.left; }));
    var maxX = Math.max.apply(null, rects.map(function(r) { return r.right; }));
    var minY = Math.min.apply(null, rects.map(function(r) { return r.top; }));
    var maxY = Math.max.apply(null, rects.map(function(r) { return r.bottom; }));
    var tbRect = tb.getBoundingClientRect();
    var tbLeft = Math.max(8, Math.min(window.innerWidth - tbRect.width - 8, (minX + maxX) / 2 - tbRect.width / 2));
    var tbTop = maxY + 12;
    // 视口底部放不下就翻到上方
    if (tbTop + tbRect.height + 8 > window.innerHeight) {
      tbTop = Math.max(8, minY - tbRect.height - 8);
    }
    tb.style.left = tbLeft + 'px';
    tb.style.top = tbTop + 'px';
  }

  // ── 4 种对齐算法（与 demo 一致的语义：整组平移，行内不重叠）──
  function groupBy(items, axis, tolerance) {
    var sorted = items.slice().sort(function(a, b) { return a[axis] - b[axis]; });
    var groups = [], cur = [];
    sorted.forEach(function(c) {
      if (cur.length === 0 || Math.abs(c[axis] - cur[0][axis]) <= tolerance) {
        cur.push(c);
      } else {
        groups.push(cur);
        cur = [c];
      }
    });
    if (cur.length > 0) groups.push(cur);
    return groups;
  }

  function doAlign(mode, ids) {
    if (!window.ACMSWin || !ACMSWin.getPinnedIcons) return;
    var pinned = ACMSWin.getPinnedIcons();
    if (!pinned || pinned.length === 0) return;
    // 用 map 索引，便于 o(1) 通过 id 找项
    var byId = {};
    pinned.forEach(function(p) { byId[p.id] = p; });
    var items = ids.map(function(id) { return byId[id]; }).filter(Boolean);
    if (items.length < 2) return;

    if (mode === 'align-left') {
      var rows = groupBy(items, 'y', 40);
      var anchor_x = Math.min.apply(null, items.map(function(c) { return c.x; }));
      rows.forEach(function(row) {
        if (row.length === 0) return;
        var row_min = Math.min.apply(null, row.map(function(c) { return c.x; }));
        var delta = anchor_x - row_min;
        row.forEach(function(c) { c.x += delta; });
      });
    } else if (mode === 'align-top') {
      var cols = groupBy(items, 'x', 40);
      var anchor_y = Math.min.apply(null, items.map(function(c) { return c.y; }));
      cols.forEach(function(col) {
        if (col.length === 0) return;
        var col_min = Math.min.apply(null, col.map(function(c) { return c.y; }));
        var delta = anchor_y - col_min;
        col.forEach(function(c) { c.y += delta; });
      });
    } else if (mode === 'distribute-x') {
      // 按 y 分组，组内沿 x 等距（min~max 之间均分）
      var groupsY = {};
      items.forEach(function(c) {
        var key = c.y;
        if (!groupsY[key]) groupsY[key] = [];
        groupsY[key].push(c);
      });
      Object.keys(groupsY).forEach(function(y) {
        var group = groupsY[y].sort(function(a, b) { return a.x - b.x; });
        if (group.length < 2) return;
        var minX = group[0].x;
        var maxX = group[group.length - 1].x;
        var step = (maxX - minX) / (group.length - 1);
        group.forEach(function(c, i) { c.x = Math.round(minX + i * step); });
      });
    } else if (mode === 'distribute-y') {
      var groupsX = {};
      items.forEach(function(c) {
        var key = c.x;
        if (!groupsX[key]) groupsX[key] = [];
        groupsX[key].push(c);
      });
      Object.keys(groupsX).forEach(function(x) {
        var group = groupsX[x].sort(function(a, b) { return a.y - b.y; });
        if (group.length < 2) return;
        var minY = group[0].y;
        var maxY = group[group.length - 1].y;
        var step = (maxY - minY) / (group.length - 1);
        group.forEach(function(c, i) { c.y = Math.round(minY + i * step); });
      });
    } else if (mode === 'grid') {
      // 按 y 排序分组，再按 x 排序，按顺序填入 4 列网格
      var sorted = items.slice().sort(function(a, b) {
        if (Math.abs(a.y - b.y) < 10) return a.x - b.x;
        return a.y - b.y;
      });
      var COLS = 4, GAP_X = 110, GAP_Y = 130;
      var startX = Math.min.apply(null, items.map(function(c) { return c.x; }));
      var startY = Math.min.apply(null, items.map(function(c) { return c.y; }));
      sorted.forEach(function(c, i) {
        var col = i % COLS;
        var row = Math.floor(i / COLS);
        c.x = startX + col * GAP_X;
        c.y = startY + row * GAP_Y;
      });
    }

    // 持久化 + 重渲染（保留 selection）
    localStorage.setItem('acms-desktop-pinned', JSON.stringify(pinned));
    if (typeof ACMSWin.refreshDesktopIcons === 'function') {
      ACMSWin.refreshDesktopIcons();
    }
    // 视觉反馈
    flashToast('✨ 已应用对齐');
    // 保持 selection（refreshDesktopIcons 会重渲染 DOM，需要重新应用 selected class）
    setTimeout(function() {
      var cur = currentSelection();
      cur.forEach(function(id) {
        var el = document.querySelector('.desktop-icon[data-icon-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
        if (el) el.classList.add('selected');
      });
      // 重定位工具条
      show(cur);
    }, 0);
  }

  // ── 批量删除（暴露给工具条 + 键盘 Delete 公用）──
  function doDeleteSelected(ids) {
    if (!window.ACMSWin) return;
    var n = ids.length;
    var msg = '确认删除 ' + n + ' 个桌面图标？';
    var ok;
    if (typeof window.showConfirm === 'function') {
      ok = window.showConfirm(msg, { title: '批量删除', danger: true });
    } else {
      ok = window.confirm(msg);
    }
    if (!ok) return;
    // 先清 selection（避免删除过程中 selection 变化触发工具条跳动）
    if (typeof ACMSWin.clearSelection === 'function') {
      ACMSWin.clearSelection();
    }
    // 从 localStorage 一次性移除（避免多次 refreshDesktopIcons 性能开销）
    var pinned = ACMSWin.getPinnedIcons ? ACMSWin.getPinnedIcons() : [];
    var setIds = {};
    ids.forEach(function(id) { setIds[id] = true; });
    var remain = pinned.filter(function(p) { return !setIds[p.id]; });
    localStorage.setItem('acms-desktop-pinned', JSON.stringify(remain));
    if (typeof ACMSWin.refreshDesktopIcons === 'function') {
      ACMSWin.refreshDesktopIcons();
    }
    flashToast('🗑 已删除 ' + n + ' 个图标');
  }

  // 暴露给 window 供 toolbar/键盘删除复用
  window.acmsDeleteSelectedIcons = doDeleteSelected;

  // ── Toast ──
  function flashToast(msg) {
    if (typeof window.toast === 'function') {
      window.toast(msg);
    } else {
      var d = document.createElement('div');
      d.className = 'acms-toast';
      d.textContent = msg;
      d.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:rgba(34,34,34,0.95);color:#fff;padding:10px 18px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.4);z-index:999999;font-size:13px;pointer-events:none';
      document.body.appendChild(d);
      setTimeout(function() { d.remove(); }, 1800);
    }
  }

  // ── 初始化：等 ACMSWin 就绪后订阅 onSelectionChange ──
  function init() {
    if (!window.ACMSWin || typeof ACMSWin.onSelectionChange !== 'function') {
      // 等 50ms 重试
      setTimeout(init, 50);
      return;
    }
    ACMSWin.onSelectionChange(function(ids) {
      if (ids.length >= 2) show(ids);
      else hide();
    });
    // 把删除函数注入 ACMSWin，让 Delete/Backspace 键复用同一份逻辑
    if (typeof ACMSWin.setDeleteHandler === 'function' && typeof window.acmsDeleteSelectedIcons === 'function') {
      ACMSWin.setDeleteHandler(window.acmsDeleteSelectedIcons);
    }
    // 初始化时根据现有 selection 决定显示/隐藏
    var cur = ACMSWin.getSelection();
    if (cur.length >= 2) show(cur);
    else hide();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    window.addEventListener('DOMContentLoaded', init);
  }
})();
