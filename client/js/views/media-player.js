// ACMS 视频播放器 · 简单原生 <video> + 自定义控件
// v0.1 · 套游戏中心集成模式（acms-game-center-integration §2）
// - viewLoader 复用守卫（切走再切回不重建 video，进度保留）
// - 双上下文（w.$c 自动 scope，主窗口 + 浮窗共用同一 loader）
// - 关闭时 ACMSWin 自动清理 w.$c.innerHTML=''，video 元素被 GC
// - 不引入 video.js 等任何依赖
(function () {
  'use strict';

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    var m = Math.floor(s / 60);
    s = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function loader(w) {
    if (!w || w.dead) return;
    // 复用守卫：ACMSWin 重新激活窗口时会再调 loader，不加会重建 video → 进度丢失
    if (w.$c.querySelector('.mp-frame')) return;

    w.$c.innerHTML = '';
    w.$c.style.cssText = 'padding:0;overflow:hidden;background:#000;position:relative;';

    w.$c.innerHTML =
      '<div class="mp-frame">' +
        '<video class="mp-video" controls preload="metadata"></video>' +
        '<div class="mp-controls">' +
          '<button class="mp-play" title="播放/暂停">▶</button>' +
          '<input type="range" class="mp-progress" min="0" max="1000" value="0" step="1">' +
          '<span class="mp-time">00:00 / 00:00</span>' +
          '<select class="mp-rate" title="倍速">' +
            '<option value="0.5">0.5x</option>' +
            '<option value="1" selected>1x</option>' +
            '<option value="1.5">1.5x</option>' +
            '<option value="2">2x</option>' +
          '</select>' +
          '<button class="mp-fullscreen" title="全屏">⛶</button>' +
        '</div>' +
      '</div>';

    var $video = w.$c.querySelector('.mp-video');
    var $play = w.$c.querySelector('.mp-play');
    var $progress = w.$c.querySelector('.mp-progress');
    var $time = w.$c.querySelector('.mp-time');
    var $rate = w.$c.querySelector('.mp-rate');
    var $fs = w.$c.querySelector('.mp-fullscreen');

    // 从 _mp_open_file 接收文件（套 image-editor 的 _fb_open_file 模式）
    // file-app-registry.openFileWith 调用顺序：先设 _mp_open_file → 再 open window → loader 读
    var pending = window._mp_open_file;
    if (pending && pending.src) {
      $video.src = pending.src;
      if (pending.name) {
        w.setTitle && w.setTitle('🎬 ' + pending.name);
      }
      window._mp_open_file = null;
    }

    // 播放/暂停
    $play.addEventListener('click', function () {
      if ($video.paused) {
        $video.play().catch(function () { /* 用户可能没交互 */ });
      } else {
        $video.pause();
      }
    });

    // video 状态同步按钮 + 进度
    $video.addEventListener('play', function () { $play.textContent = '⏸'; });
    $video.addEventListener('pause', function () { $play.textContent = '▶'; });
    $video.addEventListener('ended', function () { $play.textContent = '▶'; });
    $video.addEventListener('loadedmetadata', function () {
      $time.textContent = '00:00 / ' + fmtTime($video.duration);
    });
    $video.addEventListener('timeupdate', function () {
      if (!$progress.dragging && $video.duration) {
        $progress.value = Math.floor(($video.currentTime / $video.duration) * 1000);
      }
      $time.textContent = fmtTime($video.currentTime) + ' / ' + fmtTime($video.duration);
    });

    // 进度条拖动
    $progress.addEventListener('input', function () {
      $progress.dragging = true;
      if ($video.duration) {
        $video.currentTime = ($progress.value / 1000) * $video.duration;
      }
    });
    $progress.addEventListener('change', function () { $progress.dragging = false; });
    $progress.addEventListener('mouseup', function () { $progress.dragging = false; });

    // 倍速
    $rate.addEventListener('change', function () {
      $video.playbackRate = parseFloat($rate.value) || 1;
    });

    // 全屏
    $fs.addEventListener('click', function () {
      var el = w.$c.querySelector('.mp-frame');
      if (!el) return;
      var req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (req) req.call(el);
    });
  }

  // 🆕 v0.66 App-as-Tool 接入点（当前只 open 一个，agentTools 待后续 Stage 接入）
  window.mediaPlayerAPI = {
    open: function (url, name) {
      window._mp_open_file = { src: url, name: name || '' };
      if (window.ACMSWin) {
        window.ACMSWin.open('media-player', { w: 1000, h: 700, title: '🎬 ' + (name || '视频'), instanceId: url });
        return { ok: true };
      }
      return { ok: false, error: 'ACMSWin not ready' };
    },
  };

  function init() {
    if (typeof ACMSWin !== 'undefined' && ACMSWin.registerViewLoader) {
      ACMSWin.registerViewLoader('media-player', loader);
    }
    if (window.ACMS && window.ACMS.registerPackage) {
      window.ACMS.registerPackage('media-player', {
        title: '视频播放器',
        icon: '🎬',
        category: '工具',
        defaultSize: { w: 1000, h: 700 },
        loader: loader,
      });
    }
  }

  // 兜底轮询：ACMSWin 可能还没定义（脚本顺序）
  if (typeof ACMSWin !== 'undefined') init();
  else {
    var t = setInterval(function () {
      if (typeof ACMSWin !== 'undefined') {
        clearInterval(t);
        init();
      }
    }, 100);
    setTimeout(function () { clearInterval(t); }, 5000);
  }
})();
