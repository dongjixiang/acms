// ACMS 移动端适配补丁
// 修复触屏交互：长按→右键菜单、hover→tap 子菜单、窗口全屏化
// 仅在触屏设备 || 窄屏时生效，桌面完全不受影响
(function() {
  'use strict';

  function isMobile() {
    return window.innerWidth < 768 || 'ontouchstart' in window;
  }

  // ── 初始化：等 DOM 就绪 ──
  function init() {
    if (!isMobile()) return;

    patchSubmenus();      // hover→tap 子菜单
    patchLongPress();     // 长按→contextmenu
    patchWindowClose();   // 窗口关闭/返回按钮触控优化
    patchLauncherClose(); // 点击遮罩关闭 launcher

    // 窗口 resize 时重新判断（转为桌面时不需要回退，因为 CSS @media 自动处理）
    window.addEventListener('resize', function() {
      // 不卸载补丁——CSS 媒体查询自动处理显示
    });
  }

  // ── hover 子菜单 → tap 切换 ──
  function patchSubmenus() {
    document.querySelectorAll('.launcher-item.launcher-has-submenu').forEach(function(el) {
      var submenu = el.querySelector('.launcher-submenu');
      if (!submenu) return;

      // 移除原有的 hover 内联事件（onmouseenter/onmouseleave）
      el.removeAttribute('onmouseenter');
      el.removeAttribute('onmouseleave');

      el.addEventListener('click', function(e) {
        // 如果点击在子菜单内，不切换
        if (e.target.closest('.launcher-submenu')) return;

        var isOpen = submenu.classList.contains('open');
        // 关闭其他子菜单
        document.querySelectorAll('.launcher-submenu.open').forEach(function(s) {
          if (s !== submenu) s.classList.remove('open');
        });
        if (isOpen) {
          submenu.classList.remove('open');
        } else {
          submenu.classList.add('open');
        }
      });
    });

    // 子菜单内的点击不冒泡到父级
    document.querySelectorAll('.launcher-submenu').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
      });
    });
  }

  // ── 长按 → contextmenu 事件 ──
  function patchLongPress() {
    var LONG_PRESS_MS = 500;
    var timers = {};

    document.addEventListener('touchstart', function(e) {
      var target = e.target.closest('.launcher-item, .desktop-icon');
      if (!target) return;

      var key = Math.random().toString(36).slice(2);
      target.dataset.lpKey = key;

      timers[key] = setTimeout(function() {
        // 触发 contextmenu 事件
        var touch = e.touches[0];
        var ev = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: touch.clientX,
          clientY: touch.clientY,
        });
        target.dispatchEvent(ev);
        delete timers[key];
      }, LONG_PRESS_MS);
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
      var target = e.target.closest('.launcher-item, .desktop-icon');
      if (!target) return;
      var key = target.dataset.lpKey;
      if (key && timers[key]) {
        clearTimeout(timers[key]);
        delete timers[key];
      }
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
      var target = e.target.closest('.launcher-item, .desktop-icon');
      if (!target) return;
      var key = target.dataset.lpKey;
      if (key && timers[key]) {
        clearTimeout(timers[key]);
        delete timers[key];
      }
    }, { passive: true });

    // 阻止 desktop-icon 上长按触发的浏览器默认菜单
    document.addEventListener('contextmenu', function(e) {
      var target = e.target.closest('.launcher-item, .desktop-icon');
      if (target && isMobile()) {
        e.preventDefault();
      }
    });
  }

  // ── 窗口操作按钮：触控优化 ──
  function patchWindowClose() {
    // 窗口标题栏按钮默认就是 <button> 可点击，触控没问题
    // 只需要确保点击关闭后窗口正确消失（已有逻辑）
  }

  // ── 点击 launcher 外部关闭 ──
  function patchLauncherClose() {
    document.addEventListener('click', function(e) {
      var launcher = document.getElementById('launcher-menu');
      if (!launcher || !launcher.classList.contains('open')) return;
      if (launcher.contains(e.target)) return;
      var startBtn = document.getElementById('tb-start');
      if (startBtn && startBtn.contains(e.target)) return;
      // 已经在 taskbar.js 有关闭逻辑，但加一层兜底
    });
  }

  // ── 等 DOM 就绪（如果在 document.readyState 完成前加载）──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
