// ACMS 游戏中心 — 坦克大战 3D (TANK FRONT) v1.0
//   独立 iframe 加载：游戏是 Three.js ESM + importmap，与主页面 DOM/样式完全隔离
//   three@0.160.0 已本地化到 /client/games/tank-3d/vendor/three.module.js（不再依赖 unpkg CDN）
//   游戏 canvas 响应式（读 window.innerWidth/innerHeight + resize 监听）→ 窗口可自由缩放/最大化
(function () {
  'use strict';

  var GAME_BASE = '/client/games/tank-3d/';
  var GAME_VER = '1.0.0';
  var DEFAULT_SIZE = { w: 1000, h: 680 };

  function loader(w) {
    if (!w || w.dead) return;
    // 复用守卫：窗口被重新激活时不要重建 iframe（否则游戏进度丢失）
    if (w.$c.querySelector('.acms-tank3d-frame')) return;

    w.$c.innerHTML = '';
    w.$c.style.cssText = 'padding:0;overflow:hidden;background:#0b0d10;position:relative;';

    var frame = document.createElement('iframe');
    frame.className = 'acms-tank3d-frame';
    frame.src = GAME_BASE + 'index.html?v=' + GAME_VER;
    frame.title = '坦克大战 3D';
    frame.setAttribute('allow', 'autoplay; fullscreen; gamepad');
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#0b0d10;';
    w.$c.appendChild(frame);

    // 点进窗口后把键盘焦点交给 iframe（WASD/方向键在游戏内生效）
    var focusGame = function () {
      try { frame.contentWindow.focus(); } catch (e) {}
    };
    frame.addEventListener('load', focusGame);
    w.$c.addEventListener('mousedown', focusGame);

    w._tank3dFrame = frame;
  }

  // ── 注册视图 + 包（包用于命令面板/应用列表）──
  function init() {
    if (typeof ACMSWin !== 'undefined' && ACMSWin.registerViewLoader) {
      ACMSWin.registerViewLoader('game-tank3d', loader);
    }
    if (window.ACMS && window.ACMS.registerPackage) {
      window.ACMS.registerPackage('game-tank3d', {
        title: '坦克大战 3D',
        icon: '🛡️',
        category: '娱乐',
        defaultSize: DEFAULT_SIZE,
        loader: loader
      });
    }
  }

  // 供游戏中心/右键菜单共用的打开函数
  window.openTank3D = function () {
    if (typeof ACMSWin === 'undefined') return null;
    if (!ACMSWin.isActive()) ACMSWin.enable();
    return ACMSWin.open('game-tank3d', {
      w: DEFAULT_SIZE.w,
      h: DEFAULT_SIZE.h,
      title: '坦克大战 3D'
    });
  };

  if (typeof ACMSWin !== 'undefined') {
    init();
  } else {
    var t = setInterval(function () {
      if (typeof ACMSWin !== 'undefined') { clearInterval(t); init(); }
    }, 100);
    setTimeout(function () { clearInterval(t); }, 5000);
  }
})();
