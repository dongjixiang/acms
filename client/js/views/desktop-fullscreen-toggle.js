// ACMS — 桌面右上角全屏切换按钮（v0.67）
// 依赖: #acms-desktop（由 window-manager.js 在 enable() 时创建）
// 功能:
//   - 在桌面右上角放一个透明的全屏切换按钮
//   - 鼠标移动到按钮 AABB 附近 → 淡入显示；且只有该位置没被 .acms-window 覆盖时才显示
//   - 点击 → toggleFullscreen()（切到/退出浏览器全屏）
//   - 监听 fullscreenchange → 同步图标（⛶ ⇄ 🗗）
//   - 仅在桌面模式 ACMSWin.isActive() 生效；非桌面模式不响应
//
// 设计要点（为何这样写）：
//   - 默认 opacity:0 + pointer-events:none → 鼠标 hover 到按钮位置但被窗体覆盖时，
//     鼠标"穿透"按钮（pointer-events:none）落到下层窗体，被窗体 mousedown 截走 → 自然无效
//   - z-index:95（桌面图标 51 之上，窗口 100 之下）→ 物理层级就保证：
//     被窗体覆盖时 elementFromPoint(中心) ≠ button → 不加 .show，hover 不显示，点击不响应
//   - mousemove 监听 rAF 节流避免抖动；hit-test 用 elementFromPoint 检测覆盖
(function() {
  'use strict';

  var BTN_ID = 'acms-fullscreen-toggle';
  var HOVER_PAD = 24;        // 鼠标距离按钮多远开始显示
  var HIDE_DELAY_MS = 600;   // 鼠标离开后延时隐藏，避免快速进出按钮时闪烁

  var btn = null;
  var hideTimer = null;
  var lastMoveTs = 0;
  var lastClientX = -1;
  var lastClientY = -1;

  // ── 创建按钮（创建一次，复用） ──
  function createBtn() {
    var b = document.createElement('button');
    b.id = BTN_ID;
    b.setAttribute('type', 'button');
    b.setAttribute('aria-label', '切换全屏');
    b.title = '全屏 / 恢复';
    b.innerHTML = '<span class="aft-icon">⛶</span>';
    b.addEventListener('click', onClick);
    // 阻止桌面 click handler 串扰（桌面空白 click 会触发 tb-start.click() → 启动菜单）
    b.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    return b;
  }

  // ── 注入按钮到 #acms-desktop（找不到就空返回） ──
  function ensureBtn() {
    if (btn && btn.isConnected) return btn;
    var desktop = document.getElementById('acms-desktop');
    if (!desktop) return null;
    var existing = document.getElementById(BTN_ID);
    btn = existing || createBtn();
    if (!btn.isConnected) desktop.appendChild(btn);
    return btn;
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    toggleFullscreen();
    // 点击后立即隐藏 — 全屏切换通常伴随重新布局，立即隐藏避免视觉残留
    if (btn) btn.classList.remove('show');
  }

  function toggleFullscreen() {
    var isFs = !!(document.fullscreenElement ||
                  document.webkitFullscreenElement ||
                  document.mozFullScreenElement ||
                  document.msFullscreenElement);
    if (!isFs) {
      var el = document.documentElement;
      var req = el.requestFullscreen || el.webkitRequestFullscreen ||
                el.mozRequestFullScreen || el.msRequestFullscreen;
      if (req) {
        try { req.call(el); } catch (e) { /* 无 user gesture / 已处于全屏 */ }
      }
    } else {
      var exit = document.exitFullscreen || document.webkitExitFullscreen ||
                 document.mozCancelFullScreen || document.msExitFullscreen;
      if (exit) {
        try { exit.call(document); } catch (e) {}
      }
    }
  }

  function updateIcon() {
    if (!btn) return;
    var icon = btn.querySelector('.aft-icon');
    if (!icon) return;
    var isFs = !!(document.fullscreenElement ||
                  document.webkitFullscreenElement ||
                  document.mozFullScreenElement ||
                  document.msFullscreenElement);
    icon.textContent = isFs ? '🗗' : '⛶';
    btn.title = isFs ? '恢复窗口' : '全屏显示';
  }

  // ── 命中检测 ──
  // 鼠标是否在按钮 AABB（含 HOVER_PAD）内？
  // 是 → 该 AABB 是否与任何 .acms-window 重叠（被窗体覆盖）？
  //   不重叠 → 加 .show（按钮可见 + 可点）
  //   重叠 → 不显示（保持透明；下层窗体 z 100+ > 按钮 z 95，mouse 自然穿透到窗体）
  //
  // 用 windows[] 数组 + getBoundingClientRect 检测，比 elementFromPoint 更可靠：
  //   - elementFromPoint 在 pointer-events:none 时跳过按钮，会导致没覆盖时也不显示
  //   - 遍历 windows[] 直接看几何重叠，不依赖 z-index / pointer-events 计算
  function getWindowsArray() {
    // 从闭包私有 windows[] 拿；window-manager 没暴露数组接口，用 querySelectorAll 替代
    // （acms-window 数据源唯一，DOM 才是 ground truth；性能上不会成为热路径）
    return document.querySelectorAll('.acms-window');
  }

  function rectsOverlap(a, b) {
    return !(a.right <= b.left || a.left >= b.right ||
             a.bottom <= b.top || a.top >= b.bottom);
  }

  function isCoveredByWindow(btnRect) {
    var wins = getWindowsArray();
    for (var i = 0; i < wins.length; i++) {
      var w = wins[i];
      // 跳过最小化 / 已关的窗口
      if (w.style.display === 'none' || w.classList.contains('aw-min') || w.classList.contains('minimized')) continue;
      var wr = w.getBoundingClientRect();
      // 完全不可见（高度塌陷）的窗口忽略（P11 等遗留状态）
      if (wr.width === 0 || wr.height === 0) continue;
      if (rectsOverlap(btnRect, wr)) return true;
    }
    return false;
  }

  function updateVisibility(clientX, clientY) {
    var b = ensureBtn();
    if (!b) return;

    // 不在桌面模式 → 隐藏
    if (!(window.ACMSWin && ACMSWin.isActive && ACMSWin.isActive())) {
      b.classList.remove('show');
      return;
    }

    var r = b.getBoundingClientRect();
    var x1 = r.left - HOVER_PAD, x2 = r.right + HOVER_PAD;
    var y1 = r.top - HOVER_PAD, y2 = r.bottom + HOVER_PAD;

    var inAabb = clientX >= x1 && clientX <= x2 &&
                 clientY >= y1 && clientY <= y2;

    if (inAabb) {
      // 鼠标靠近按钮：检查按钮区域是否被任一活动窗体覆盖
      if (!isCoveredByWindow(r)) {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        b.classList.add('show');
        return;
      }
      // 被覆盖 → 走延迟隐藏
    }

    // 鼠标不在 AABB / 被覆盖 → 延时隐藏
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function() {
      if (btn) btn.classList.remove('show');
      hideTimer = null;
    }, HIDE_DELAY_MS);
  }

  // ── rAF 节流的 mousemove 处理 ──
  function onMouseMove(e) {
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    var now = Date.now();
    if (now - lastMoveTs < 16) return; // ~60fps 节流
    lastMoveTs = now;
    updateVisibility(e.clientX, e.clientY);
  }

  function init() {
    ensureBtn();
    updateIcon();

    document.addEventListener('mousemove', onMouseMove, { passive: true });

    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(function(ev) {
      document.addEventListener(ev, updateIcon);
    });

    // 监听桌面模式切换：enable/disable 时 desktop 可能被重建，按钮状态可能要重算
    document.addEventListener('acms:desktop-shown', function() {
      ensureBtn();
      if (lastClientX >= 0) updateVisibility(lastClientX, lastClientY);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露全局供调试 / 命令面板 / 小吉工具调用
  window.acmsToggleDesktopFullscreen = toggleFullscreen;
})();
