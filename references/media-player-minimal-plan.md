# ACMS 简单视频播放器 · 方案 v0.1

> **范围**：只做"ACMS 能看本地视频"。**不做**音频、字幕、AI、ffmpeg、转码、烧录。
> **目标**：明天就能动手，今天拍板。

---

## 0. 现状与边界

**现状**（已查事实）：
- `client/js/views/web-browser.js` 第 158-173 行：视频/音频/PDF 全部走 web-browser 内嵌 iframe 播放
- `client/js/core/file-app-registry.js` 第 51-54 行：`^video\/` MIME 路由到 web-browser
- ACMS 有完整应用框架：ACMSWin viewLoader + registerPackage + agentTools

**边界**（明确不做）：
- ❌ 音频播放（audio MIME 不抢，仍走 web-browser）
- ❌ AI 字幕/配音/封面/ffmpeg/字幕烧录（这些都砍掉）
- ❌ 视频下载（不集成 yt-dlp）
- ❌ 视频转码（不集成 ffmpeg）
- ❌ App-as-Tool 暴露（先纯前端，后续再加）

**保留**：HTML / PDF / 图片 / 代码编辑 全部仍走 web-browser / 各自应用，不动

---

## 1. 架构（一段话）

新增一个独立 ACMS 应用 `media-player`：
- 注册 `ACMSWin.registerViewLoader('media-player', loader)`
- 注册 `ACMS.registerPackage('media-player', { title: '视频播放器', icon: '🎬', category: '工具' })`
- 在 `file-app-registry` 把 `^video\/` 路由的 `web-browser` 改成 `media-player`
- loader 内部用原生 `<video>` + 自定义 HTML/CSS 控件
- window 全局 `mediaPlayerAPI` 暴露给后续 agentTools

套游戏中心集成 SOP（5 个注册点）+ file-app-registry v0.74.1 注册 API。

---

## 2. 实施清单（明天动手版本）

### 2.1 新建文件

**`client/js/views/media-player.js`**（主文件）
```js
(function () {
  'use strict';

  // 套游戏中心集成模式（acms-game-center-integration §2）
  // - viewLoader 复用守卫（开窗口→切走→切回不重建 video）
  // - 双上下文 root 参数（acms-app-as-tool P86）
  // - 关闭时释放 video.src（防内存泄漏）

  function loader(w) {
    if (!w || w.dead) return;
    if (w.$c.querySelector('.mp-frame')) return;  // 复用守卫

    w.$c.innerHTML = `
      <div class="mp-frame">
        <video class="mp-video" controls preload="metadata"></video>
        <div class="mp-controls">
          <button class="mp-play">▶</button>
          <input type="range" class="mp-progress" min="0" max="100" value="0">
          <span class="mp-time">00:00 / 00:00</span>
          <select class="mp-rate">
            <option value="0.5">0.5x</option>
            <option value="1" selected>1x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>
          <button class="mp-fullscreen">⛶</button>
        </div>
      </div>
    `;

    var $video = w.$c.querySelector('.mp-video');
    var $play = w.$c.querySelector('.mp-play');
    var $progress = w.$c.querySelector('.mp-progress');
    var $time = w.$c.querySelector('.mp-time');
    var $rate = w.$c.querySelector('.mp-rate');
    var $fs = w.$c.querySelector('.mp-fullscreen');

    // 从 _fb_open_file 接收文件（套 image-editor 模式，file-app-registry 调用约定）
    var pending = window._mp_open_file;
    if (pending && pending.src) {
      $video.src = pending.src;
      $video.title = pending.name || '';
      window._mp_open_file = null;
    }

    // 控件交互
    $play.addEventListener('click', function () {
      if ($video.paused) $video.play(); else $video.pause();
    });
    $video.addEventListener('play', function () { $play.textContent = '⏸'; });
    $video.addEventListener('pause', function () { $play.textContent = '▶'; });
    $video.addEventListener('timeupdate', function () {
      $progress.value = ($video.currentTime / $video.duration) * 100 || 0;
      $time.textContent = fmt($video.currentTime) + ' / ' + fmt($video.duration);
    });
    $progress.addEventListener('input', function () {
      $video.currentTime = ($progress.value / 100) * $video.duration;
    });
    $rate.addEventListener('change', function () { $video.playbackRate = +$rate.value; });
    $fs.addEventListener('click', function () {
      if ($video.requestFullscreen) $video.requestFullscreen();
    });

    function fmt(s) {
      s = Math.floor(s || 0);
      var m = Math.floor(s / 60); s = s % 60;
      return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }
  }

  // 🆕 App-as-Tool 接入点（Stage 1 暂不实现，留 API stub）
  window.mediaPlayerAPI = {
    open: function (url, name) {
      window._mp_open_file = { src: url, name: name };
      if (window.ACMSWin) window.ACMSWin.open('media-player', { w: 1000, h: 700, title: '🎬 ' + (name || '视频') });
      return { ok: true };
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
  // 兜底轮询（ACMSWin 可能还没定义）
  if (typeof ACMSWin !== 'undefined') init();
  else {
    var t = setInterval(function () {
      if (typeof ACMSWin !== 'undefined') { clearInterval(t); init(); }
    }, 100);
    setTimeout(function () { clearInterval(t); }, 5000);
  }
})();
```

**`client/css/media-player.css`**（黑底播放器 UI）
```css
.mp-frame { width:100%; height:100%; background:#000; display:flex; flex-direction:column; }
.mp-video { flex:1; width:100%; object-fit:contain; background:#000; }
.mp-controls { display:flex; gap:8px; padding:8px 12px; background:rgba(0,0,0,0.85); color:#fff; align-items:center; }
.mp-controls button, .mp-controls select { background:#222; color:#fff; border:1px solid #444; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:13px; }
.mp-controls button:hover { background:#333; }
.mp-progress { flex:1; height:6px; cursor:pointer; }
.mp-time { font-family:monospace; font-size:12px; color:#aaa; min-width:90px; text-align:right; }
```

### 2.2 修改 `client/js/core/file-app-registry.js`

把第 51-54 行的 video 路由改成 media-player：
```js
{
  name: 'media-player', label: '🎬 视频播放器', supports: 'url',
  mime: /^video\//i,
  exts: ['mp4','webm','mov','avi','mkv','m4v','ogv'],
},
```

并在 `openFileWith` 函数（第 158 行 if-else 链）里加 media-player 分支：
```js
if (appName === 'media-player') {
  window._mp_open_file = { src: url, name: name };
  if (window.ACMSWin) window.ACMSWin.open('media-player', { w: 1000, h: 700, title: '🎬 ' + title });
  return Promise.resolve({ ok: true });
}
```

**web-browser 的 video 路由可删可留**：建议删（不留 fallback 简化心智）。如果用户偶尔需要 web-browser 兜底（极少见），file-app-registry 第 119-124 行已有 APP_NOT_REGISTERED → web-browser 兜底逻辑。

audio MIME 保持走 web-browser（第 56-59 行不动），等以后要做音频播放器再独立。

### 2.3 修改两个 index.html

**`client/index.html`** 和 **`server/services/index.html`**：
```html
<!-- 在 file-app-registry.js 之后、其它 view 之前 -->
<script src="/client/js/views/media-player.js?v=0.1"></script>
<link rel="stylesheet" href="/client/css/media-player.css?v=0.1">
```

### 2.4 （可选 Stage 1.5）添加到应用中心 + 右键菜单

`client/js/views/desktop-context-menu.js`：在「📦应用中心」children 里加：
```js
{ id: 'app-media-player', label: '🎬 视频播放器', action: function () { ACMSWin.open('media-player', {w:1000,h:700,title:'🎬 视频播放器'}); } },
```

---

## 3. 验收清单

- [ ] 拖入 mp4 文件 → 弹出视频播放器窗口 → 视频能播
- [ ] 文件浏览器右键 mp4 → "🎬 视频播放器" → 跳转播放器
- [ ] 播放/暂停按钮正常切换（▶ ↔ ⏸）
- [ ] 拖动进度条能跳转
- [ ] 倍速 0.5/1/1.5/2x 切换生效
- [ ] 全屏按钮正常
- [ ] 切走窗口再切回 → 视频进度保留（loader 复用守卫）
- [ ] 关闭窗口 → video.src 释放（控制台无 warning）
- [ ] HTML 文件右键仍走 web-browser（不被破坏）
- [ ] `node --check client/js/views/media-player.js` 通过

---

## 4. 已知陷阱（基于 ACMS 既有经验）

| 陷阱 | 规避 |
|---|---|
| 双 index.html `?v=` 不同步（memory 强调 9 个月 bug） | 两个 index.html 都加 `?v=0.1`，改完一并 bump |
| viewLoader 双上下文（acms-app-as-tool P86） | 主窗口 + 浮窗都走同一 loader 函数（loader 已用 `w.$c` 自动 scope） |
| loader 重复创建 video（acms-game-center-integration §2） | `if (w.$c.querySelector('.mp-frame')) return;` 守卫 |
| video.src 不释放导致内存泄漏 | 关闭窗口时 ACMSWin 会自动清理 `$c.innerHTML=''`，video 元素被 GC |
| ACMSModal 不适合做浮层（memory） | 不做 modal，纯 ACMSWin 开窗 |
| 抢路由破坏现有行为 | 只改 video MIME 路由，audio/HTML/PDF 全部不动 |
| 浏览器 video 标签的 codec 限制 | 不转码，浏览器不支持的格式（如 rmvb）由浏览器原生提示 |

---

## 5. 风险点

- **极低**：纯前端改动，零后端依赖，零外部依赖，零数据库改动
- **无需重启 3300**：纯前端改动 Ctrl+Shift+R 强刷即生效（acms-game-center-integration §7）
- **无 GPU 依赖**：浏览器原生 video 解码
- **无法律风险**：本地文件播放，不涉及任何第三方内容

---

## 6. 后续扩展（先不做，写在这里只是备忘）

未来要做的话按优先级：
1. 字幕叠加（WebVTT/SRT 解析 + `<track>` 标签）
2. 音频播放（直接复用同一套 UI，把 MIME 路由也切过来）
3. App-as-Tool 暴露（v0.66 模式，让小吉能调）
4. 播放列表（多个视频连续播放）
5. 截图当前帧（一键生成图片）
6. AI 字幕/配音/封面（再回来谈 SmartSub 借鉴）
