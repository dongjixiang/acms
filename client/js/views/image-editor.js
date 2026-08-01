// ACMS 图片浏览器/编辑器 — 基于 TOAST UI Image Editor (MIT)
// 功能: 打开/查看/裁剪/旋转/翻转/绘图/文字/滤镜/AI

(function (root) {
  'use strict';

  var IMG_EDITOR_PATH = '/client/lib/tui-image-editor';

  function openImageEditor(w, fileId, fileName, initialSrc) {
    // 加载 CSS
    if (!document.querySelector('#tui-ie-css')) {
      var link = document.createElement('link');
      link.id = 'tui-ie-css';
      link.rel = 'stylesheet';
      link.href = IMG_EDITOR_PATH + '/tui-image-editor.min.css';
      document.head.appendChild(link);
    }

    var _currentFileName = fileName || '未命名.png';

    // 窗口标题栏显示文件名
    if (window.ACMSWin && ACMSWin.setTitle) {
      ACMSWin.setTitle(w, _currentFileName);
    }

    // 渲染 UI — AI 面板在右侧（2026-07-27 从底部改到侧面）
    w.$c.innerHTML =
      '<div class="oo-editor oo-editor-img" style="display:flex;flex-direction:column;height:100%">' +
        '<div class="code-menu-bar" style="display:flex;background:var(--bg2,#f0f0f0);border-bottom:1px solid var(--office-divider,#ddd);flex-shrink:0">' +
          '<div class="code-menu-item" data-menu="file" style="position:relative;padding:5px 16px;cursor:pointer;font-size:13px;user-select:none">📄 文件' +
            '<div class="code-menu-dropdown" style="display:none;position:absolute;top:100%;left:0;z-index:9999;background:var(--bg,#fff);border:1px solid var(--office-divider,#ddd);border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,0.15);min-width:180px;padding:6px 0">' +
              '<div class="code-menu-dropdown-item" data-action="open-img">📂 打开图片</div>' +
              '<div class="code-menu-dropdown-item" data-action="save-img">💾 保存</div>' +
              '<div class="code-menu-divider" style="height:1px;background:var(--office-divider,#ddd);margin:4px 8px"></div>' +
              '<div class="code-menu-dropdown-item" data-action="reset-img">🔄 重置</div>' +
            '</div>' +
          '</div>' +
          '<div class="code-menu-item" data-menu="view" style="position:relative;padding:5px 16px;cursor:pointer;font-size:13px;user-select:none">🔍 查看' +
            '<div class="code-menu-dropdown" style="display:none;position:absolute;top:100%;left:0;z-index:9999;background:var(--bg,#fff);border:1px solid var(--office-divider,#ddd);border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,0.15);min-width:160px;padding:6px 0">' +
              '<div class="code-menu-dropdown-item" data-action="zoom-in">🔍+ 放大</div>' +
              '<div class="code-menu-dropdown-item" data-action="zoom-out">🔍− 缩小</div>' +
              '<div class="code-menu-dropdown-item" data-action="zoom-fit">📐 适应窗口</div>' +
              '<div class="code-menu-dropdown-item" data-action="zoom-100">🔢 100%</div>' +
            '</div>' +
          '</div>' +
          '<div class="code-menu-item" data-menu="filter" style="position:relative;padding:5px 16px;cursor:pointer;font-size:13px;user-select:none">🎨 滤镜' +
            '<div class="code-menu-dropdown" style="display:none;position:absolute;top:100%;left:0;z-index:9999;background:var(--bg,#fff);border:1px solid var(--office-divider,#ddd);border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,0.15);min-width:160px;padding:6px 0">' +
              '<div class="code-menu-dropdown-item" data-action="filter-grayscale">◐ 灰度</div>' +
              '<div class="code-menu-dropdown-item" data-action="filter-sepia">🟫 怀旧</div>' +
              '<div class="code-menu-dropdown-item" data-action="filter-invert">◑ 反色</div>' +
              '<div class="code-menu-dropdown-item" data-action="filter-blur">🌫️ 模糊</div>' +
              '<div class="code-menu-dropdown-item" data-action="filter-sharpen">✨ 锐化</div>' +
              '<div class="code-menu-dropdown-item" data-action="filter-emboss">🔲 浮雕</div>' +
              '<div class="code-menu-divider" style="height:1px;background:var(--office-divider,#ddd);margin:4px 8px"></div>' +
              '<div class="code-menu-dropdown-item" data-action="filter-reset">🔄 重置滤镜</div>' +
            '</div>' +
          '</div>' +
          '<div class="code-menu-item" data-action="open-ai-panel" style="position:relative;padding:5px 16px;cursor:pointer;font-size:13px;user-select:none;font-weight:600;color:var(--accent,#0ea89d)">⚡ AI助手</div>' +
          '<div style="flex:1"></div>' +
        '</div>' +
        '<div class="oo-editor-body" style="display:flex;flex:1;min-height:0">' +
          '<div id="img-editor-mount" style="flex:1;min-height:0;overflow:auto;background:var(--bg,#1a1a2e)"></div>' +
          '<div id="img-ai-panel" style="display:none;flex-shrink:0;width:360px;overflow:auto;background:var(--bg2,#f5f5f7);border-left:1px solid var(--office-divider,#ddd);padding:8px;font-size:13px"></div>' +
        '</div>' +
      '</div>';

    var mountEl = w.$c.querySelector('#img-editor-mount');
    var aiPanel = w.$c.querySelector('#img-ai-panel');
    var imageEditor = null;

    // ─── 加载 tui-image-editor ───
    function loadEditor(src, callback) {
      console.log('[IMG-LOAD] loadEditor src:', src ? src.slice(0, 80) : 'null/empty', 'colorPicker loaded:', !!window['tui-color-picker']);
      // 先确保 tui-color-picker 已加载
      if (!window['tui-color-picker']) {
        var cpLink = document.createElement('link');
        cpLink.rel = 'stylesheet';
        cpLink.href = IMG_EDITOR_PATH + '/tui-color-picker.css';
        document.head.appendChild(cpLink);
        // tui-color-picker 用 define() (AMD), Monaco loader 拦截了 define
        // 方案: 用 fetch 获取源码 + eval 执行（绕过 AMD loader）
        fetch(IMG_EDITOR_PATH + '/tui-color-picker.min.js').then(function(r){return r.text();}).then(function(code){
          // 保存原 define，临时屏蔽 Monaco loader 的 define
          var savedDefine = window.define;
          window.define = undefined;
          try { (new Function(code))(); } catch(e) { console.warn('[ImageEditor] color-picker eval error:', e); }
          window.define = savedDefine;
          loadMainEditor(src, callback);
        }).catch(function(){
          mountEl.innerHTML = '<div style="padding:40px;text-align:center;color:#a00">❌ 颜色选择器加载失败</div>';
        });
      } else {
        loadMainEditor(src, callback);
      }
    }

    function loadMainEditor(src, callback) {
      console.log('[IMG-MAIN] loadMainEditor src:', src ? src.slice(0, 80) : 'null/empty', 'tui.ImageEditor ready:', !!(window.tui && window.tui.ImageEditor && typeof window.tui.ImageEditor === 'function'));
      if (window.tui && window.tui.ImageEditor && typeof window.tui.ImageEditor === 'function') {
        initEditor(src);
        if (callback) callback();
        return;
      }
      // tui-image-editor 也用 define()，fetch + eval 绕过 AMD loader
      fetch(IMG_EDITOR_PATH + '/tui-image-editor.min.js').then(function(r){return r.text();}).then(function(code){
        var savedDefine = window.define;
        window.define = undefined;
        try { (new Function(code))(); } catch(e) { console.warn('[ImageEditor] main eval error:', e); }
        window.define = savedDefine;
        initEditor(src);
        if (callback) callback();
      }).catch(function(){
        mountEl.innerHTML = '<div style="padding:40px;text-align:center;color:#a00">❌ 图片编辑器加载失败</div>';
      });
    }

    function initEditor(src) {
      console.log('[IMG-INIT] initEditor called with src:', src ? src.slice(0, 80) : 'null/empty');
      // 不用占位图 — 留空让用户打开文件
      imageEditor = new window.tui.ImageEditor(mountEl, {
        includeUI: {
          loadImage: { path: src || '', name: 'image' },
          theme: {
            'menu.normal.backgroundColor': '#2a2a3e',
            'menu.active.backgroundColor': '#446995',
            'menu.hover.backgroundColor': '#3a3a5e',
            'submenu.normal.backgroundColor': '#1a1a2e',
            'submenu.active.backgroundColor': '#446995',
            'submenu-label.color': '#ccc',
          },
          menu: ['crop', 'flip', 'rotate', 'draw', 'shape', 'icon', 'text', 'mask', 'filter'],
          initMenu: '',        // 默认不打开任何子菜单
          uiSize: { width: '100%', height: '100%' },
        },
        cssMaxWidth: 9999,
        cssMaxHeight: 9999,
        selectionStyle: { cornerSize: 8, rotatingPointOffset: 20 },
        // v0.73: 允许缩放到 10%（默认 minZoom=1 只能放大不能缩小到比原图小）
        minZoom: 0.1,
      });

      // JS 移除内置标题栏 + 溢出处理 + zoomOut 按钮劫持
      setTimeout(function () {
        var hdr = mountEl.querySelector('.tui-image-editor-header');
        if (hdr) hdr.style.display = 'none';
        var logo = mountEl.querySelector('.tui-image-editor-header-logo');
        if (logo) logo.style.display = 'none';
        var btns = mountEl.querySelector('.tui-image-editor-header-buttons');
        if (btns) btns.style.display = 'none';
        // 确保 tui 内部容器 overflow 可滚动，放大到超出画布时能拖动查看
        var mainArea = mountEl.querySelector('.tui-image-editor-main');
        if (mainArea) mainArea.style.overflow = 'auto';
        var wrapArea = mountEl.querySelector('.tui-image-editor-wrap');
        if (wrapArea) wrapArea.style.overflow = 'auto';
        // 劫持 tui zoomIn/zoomOut 按钮 — 走 doZoom 绕过 _centerPoints 撤销栈
        var zoomInBtn = mountEl.querySelector('.tie-btn-zoomIn');
        if (zoomInBtn) {
          zoomInBtn.style.display = '';
          zoomInBtn.addEventListener('click', function(e) {
            e.stopImmediatePropagation();
            e.preventDefault();
            _aiZoomLevel = Math.min((_aiZoomLevel || 1) * 1.2, 5);
            doZoom(_aiZoomLevel);
          });
        }
        var zoomOutBtn = mountEl.querySelector('.tie-btn-zoomOut');
        if (zoomOutBtn) {
          zoomOutBtn.style.display = '';
          zoomOutBtn.addEventListener('click', function(e) {
            e.stopImmediatePropagation();
            e.preventDefault();
            _aiZoomLevel = Math.max((_aiZoomLevel || 1) * 0.8, 0.1);
            doZoom(_aiZoomLevel);
          });
        }
        // 劫持 hand 按钮 — 自定义拖拽平移（绕过 tui zoomLevel<=1 无法移动的限制）
        var handBtn = mountEl.querySelector('.tie-btn-hand');
        var _panStart = null;
        if (handBtn) {
          handBtn.style.display = '';
          handBtn.addEventListener('click', function(e) {
            e.stopImmediatePropagation();
            e.preventDefault();
            _handActive = !_handActive;
            handBtn.classList.toggle('tui-image-editor-button', _handActive);
            try {
              var c = imageEditor._graphics && imageEditor._graphics.getCanvas();
              if (c) {
                c.selection = !_handActive;
                c.defaultCursor = _handActive ? 'grab' : 'default';
                if (_handActive) {
                  c.on('mouse:down', function(opt) {
                    if (!_handActive) return;
                    _panStart = { x: opt.e.clientX, y: opt.e.clientY };
                    c.defaultCursor = 'grabbing';
                    var onMove = function(o) {
                      if (!_panStart) return;
                      var dx = o.e.clientX - _panStart.x;
                      var dy = o.e.clientY - _panStart.y;
                      c.relativePan({ x: dx, y: dy });
                      _panStart = { x: o.e.clientX, y: o.e.clientY };
                    };
                    var onUp = function() {
                      c.off('mouse:move', onMove);
                      c.off('mouse:up', onUp);
                      _panStart = null;
                      if (_handActive) c.defaultCursor = 'grab';
                    };
                    c.on('mouse:move', onMove);
                    c.on('mouse:up', onUp);
                  });
                } else {
                  c.off('mouse:down');
                }
              }
            } catch(ex) { console.warn('[HAND]', ex); }
          });
        }
        // 安装默认框选放大（hand 关闭时拖拽=选择区域放大）
        setTimeout(function() { setupZoomDrag(); }, 500);
        // v0.68: tui help-menu 渲染后注入 zoom display（确保按钮旁立即可见）
        try { ensureZoomDisplay(); updateZoomDisplay(_aiZoomLevel || 1); } catch(e) {}
      }, 200);

      // 激活内置按钮事件 (initCanvas 里只在 loadImage.path 有值时才调用 activeMenuEvent)
      if (imageEditor && imageEditor.ui && typeof imageEditor.ui.activeMenuEvent === 'function') {
        setTimeout(function () {
          try { imageEditor.ui.activeMenuEvent(); } catch(e) { console.warn('[IMG-ERR] activeMenuEvent:', e); }
        }, 300);
      }

      // v0.79 debug: URL 加 ?aiDebug=1 时暴露 IE 给 image-editor-debug.js 使用
      //   默认关闭，prod 不感知；类似 console.log 风格的小诊断钩子
      try {
        if (window.location && window.location.search && window.location.search.indexOf('aiDebug=1') >= 0) {
          window.imageEditorAPI.__ie = imageEditor;
        }
      } catch(e){}

      // 监听 tui 图片加载结果（注意：实测 tui 3.15.3 无 'loadImage' 事件可 fire，
      //   此回调基本不触发——初始化 fit 由下方就绪轮询兜底，reload 由 loadImageSafe.then 兜底）
      imageEditor.on('loadImage', function(result) {
        console.log('[IMG-LOADED] tui loadImage 完成:', result ? (result.newWidth+'x'+result.newHeight) : 'no result');
        // v0.68: tui 重置 help-menu 时 zoom display 也可能被清，重新插入
        try { ensureZoomDisplay(); updateZoomDisplay(_aiZoomLevel || 1); } catch(e) {}
      });
      imageEditor.on('error', function(err) {
        console.warn('[IMG-ERR] tui error:', err && err.message ? err.message : err);
      });

      // v0.79: 初始化路径 fit + 居中（就绪轮询兜底）
      //   includeUI loadImage.path 是 tui 内部异步加载，无 'loadImage' 事件可监听；
      //   且容器（.tui-image-editor，display:inline-block）宽度 = canvas buffer 尺寸，
      //   大图会溢出 main 视口（wrap overflow:auto）→ viewport 保持 zoom 1 时
      //   main 只显示图左上角（拖图到图片应用「只展现最左边一部分」）。
      //   轮询 canvasImage 就绪后 fit 一次（幂等，reload 路径由 loadImageSafe.then 独立兜底）。
      var _initFitDone = false;
      var _initFitTimer = setInterval(function() {
        try {
          if (_initFitDone || !imageEditor) return;
          var _fitImg = imageEditor._graphics && imageEditor._graphics.canvasImage;
          if (_fitImg && _fitImg.width && _fitImg.height) {
            _initFitDone = true;
            clearInterval(_initFitTimer);
            setTimeout(function() { try { fitAndCenter(); } catch(e) {} }, 80);
          }
        } catch(e) {}
      }, 250);
      // 15s 兜底：无论如何停止轮询，避免窗口常驻泄漏
      setTimeout(function() { clearInterval(_initFitTimer); }, 15000);
    }

    // v0.78: 统一图片加载入口 —— 根治 fabric6 getBoundingRect 含 viewport transform 的 buffer 污染
    //   tui adjustCanvasDimension 用 canvasImage.getBoundingRect() 设置 canvas buffer 尺寸，
    //   但 fabric 6 的 getBoundingRect() 默认返回「viewport 变换后的屏幕尺寸」：
    //   若当前 zoom ≠ 1（fit/缩放后），buffer = 图片尺寸 × 当前zoom → 画布尺寸错误。
    //   后果①：再打开另一张图，图显示不全/画布不重画；
    //   后果②：AI 图生图送整 buffer → 图居中、四周透明/黑框。
    //   修法：loadImageFromURL 前强制重置 viewport 为 identity，让 buffer = 图片实际尺寸；
    //   加载完成后由 fitAndCenter 重新适配窗口（所有调用点都有 fitAndCenter）。
    function loadImageSafe(url, name) {
      if (!imageEditor) return Promise.resolve();
      resetViewportBeforeLoad();
      return imageEditor.loadImageFromURL(url, name);
    }

    // v0.78: loadImageFromFile 同样走 tui adjustCanvasDimension，加载前也要重置 viewport
    function resetViewportBeforeLoad() {
      try {
        var c0 = imageEditor._graphics && imageEditor._graphics.getCanvas();
        if (c0) {
          c0.setViewportTransform([1, 0, 0, 1, 0, 0]);
          c0.requestRenderAll();
        }
      } catch(e) {}
    }

    // v0.79: 送图给 AI 用 canvasImage._element 的原图 1:1 像素
    //   根因：tui 用 canvas.setBackgroundImage 把图作为 fabric 背景层；
    //         fabric Canvas.toDataURL() 序列化时**不包含 BackgroundImage**，
    //         输出空 buffer → LLM 看到 95% 黑/透明（原 image-editor-debug.js 实测
    //         dark_percent=95.20%, alpha_avg=12）。
    //   修法：直接读 canvasImage._element（fabric Image 持有的 HTMLImageElement，
    //         其 src 是用户原图 URL，1:1 像素、零缩放、完全绕开 fabric viewport /
    //         buffer / BackgroundImage 序列化复杂性）。
    //   fallback 链：canvasImage._element → fabric.toCanvasElement() 含 BG →
    //   saveCanvasSnapshot 兜底（用户编辑后的画布，crop + 绘图文）。
    //   返回 { dataUrl, width, height }。
    function cropCanvasToImage() {
      try {
        var ie = imageEditor;
        var img = ie._graphics && ie._graphics.canvasImage;
        if (!img || !img.width || !img.height) {
          return { dataUrl: window.imageEditorAPI.saveCanvasSnapshot(ie), width: 0, height: 0 };
        }

        // 主路径：HTMLImageElement._element → 用户原始图 1:1 像素
        var htmlImg = (img.getElement && img.getElement()) || img._element || null;
        if (htmlImg && (htmlImg.tagName === 'IMG') && htmlImg.naturalWidth) {
          var w = img.width, h = img.height;
          var tmp = document.createElement('canvas');
          tmp.width = w; tmp.height = h;
          var tctx = tmp.getContext('2d');
          tctx.clearRect(0, 0, w, h);
          tctx.drawImage(htmlImg, 0, 0, w, h);
          var dataUrl = tmp.toDataURL('image/png');
          if (dataUrl && dataUrl.length > 100) {
            return { dataUrl: dataUrl, width: w, height: h };
          }
        }

        // fallback 1：fabric 6 toCanvasElement (multiplier=1, 含 backgroundImage)
        var c = ie._graphics && ie._graphics.getCanvas();
        if (c) {
          var canvasEl = (typeof c.toCanvasElement === 'function')
            ? c.toCanvasElement(1)
            : (c.lowerCanvasEl || c.getElement());
          if (canvasEl) {
            var fb = canvasEl.toDataURL('image/png');
            if (fb && fb.length > 100) {
              return { dataUrl: fb, width: img.width, height: img.height };
            }
          }
        }
      } catch(e) {
        console.warn('[AI] cropCanvasToImage:', e);
      }
      // fallback 2：整 buffer（用户编辑后的画布状态最完整，可能有 shapes/text 覆盖）
      return { dataUrl: window.imageEditorAPI.saveCanvasSnapshot(imageEditor), width: 0, height: 0 };
    }

    // v0.73: 暴露图片重载函数（供拖拽到已打开的编辑器窗口时使用）
    // v0.78: 增加 name 参数（文件浏览器「打开方式」路径传文件名）；加载成功后同步窗口标题 + 清空旧图编辑状态
    function reloadImage(url, name) {
      if (!imageEditor || !url) return;
      // v0.75: CDN URL 走本地代理（tui-image-editor canvas 需要 CORS 头）
      var imgUrl = url;
      if (imgUrl.indexOf('platform-outputs.agnes-ai.space') >= 0 || imgUrl.indexOf('://') >= 0 && imgUrl.indexOf('/api/') !== 0) {
        imgUrl = '/api/files/proxy-image?url=' + encodeURIComponent(imgUrl);
      }
      console.log('[IMG-RELOAD] 重新加载图片:', imgUrl.slice(0, 80), 'name:', name || '');
      var imgName = name || imgUrl.split('/').pop() || 'image';
      loadImageSafe(imgUrl, imgName).then(function() {
        console.log('[IMG-RELOAD] 加载成功');
        // 新图 = 新编辑会话：清空旧图的 undo 栈与 AI 快照历史
        try { if (typeof imageEditor.clearUndoStack === 'function') imageEditor.clearUndoStack(); } catch(e) {}
        if (_aiHistory && _aiHistory.length) { _aiHistory = []; try { updateAIUI(); } catch(e) {} }
        if (name && window.ACMSWin && ACMSWin.setTitle) ACMSWin.setTitle(w, name);
        // 适应窗口 + 居中（v0.68：fit + viewportCenterObject 替代单纯 zoomToPoint）
        setTimeout(function() {
          try { fitAndCenter(); } catch(e) {}
        }, 100);
      }).catch(function(e) {
        console.warn('[IMG-RELOAD] 加载失败:', e);
      });
    }
    // 挂到窗口元素上，供 ACMSWin.open 复用窗口时调用
    w.reloadImage = reloadImage;
    // 也挂到全局，供拖拽到窗口内容区时直接调用
    window.__activeImageEditorReload = reloadImage;
    // 窗口关闭时清理全局引用
    w.onClose = w.onClose || function() {
      if (window.__activeImageEditorReload === reloadImage) window.__activeImageEditorReload = null;
    };

    // 默认加载空白图片供用户打开文件
    // v0.66: 支持拖拽传入图片（window._dragImageUrl）
    var src = initialSrc || (window._dragImageUrl || null);
    console.log('[IMG-EDIT] initialSrc:', initialSrc ? initialSrc.slice(0, 80) : null, '_dragImageUrl:', window._dragImageUrl ? window._dragImageUrl.slice(0, 80) : null, '→ src:', src ? src.slice(0, 80) : null);
    if (src === window._dragImageUrl) { window._dragImageUrl = null; console.log('[IMG-EDIT] _dragImageUrl 已消费'); }
    loadEditor(src);

    // ─── 菜单事件（支持 dropdown + 直接 action）───
    w.$c.querySelectorAll('.code-menu-item').forEach(function (item) {
      item.onclick = function (e) {
        e.stopPropagation();
        var dd = this.querySelector('.code-menu-dropdown');
        var action = this.dataset.action;
        if (dd) {
          // 有下拉菜单：切换显示
          w.$c.querySelectorAll('.code-menu-dropdown').forEach(function (d) { if (d !== dd) d.style.display = 'none'; });
          dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
        } else if (action === 'open-ai-panel') {
          // AI 助手直接动作
          toggleAIPanel();
        }
      };
    });
    w.$c.addEventListener('mousedown', function (e) {
      if (!e.target.closest('.code-menu-item')) {
        w.$c.querySelectorAll('.code-menu-dropdown').forEach(function (d) { d.style.display = 'none'; });
      }
    });

    w.$c.querySelectorAll('.code-menu-dropdown-item').forEach(function (item) {
      item.onclick = function (e) {
        e.stopPropagation();
        w.$c.querySelectorAll('.code-menu-dropdown').forEach(function (d) { d.style.display = 'none'; });
        var action = this.dataset.action;
        if (!imageEditor && action !== 'open-img') { toast('编辑器未就绪', 'warning'); return; }

        switch (action) {
          case 'open-img':
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp';
            input.onchange = function () {
              var file = input.files && input.files[0];
              if (!file) return;
              _currentFileName = file.name;
              if (window.ACMSWin && ACMSWin.setTitle) {
                ACMSWin.setTitle(w, _currentFileName);
              }
              if (imageEditor) {
                // 方法1: 直接传 File 对象 (避免 dataURL 体积过大)
                try {
                  resetViewportBeforeLoad();
                  imageEditor.loadImageFromFile(file).then(function (result) {
                    toast('已加载 ' + file.name, 'success');
                    // 适应窗口 + 居中（v0.68）
                    setTimeout(function() { try { fitAndCenter(); } catch(e) {} }, 100);
                  }).catch(function (err) {
                    console.log('[ImageEditor] loadImageFromFile FAILED:', err, 'file=', file.name);
                    // 方法2: 回退 dataURL
                    console.warn('[ImageEditor] loadImageFromFile failed, trying dataURL', err);
                    var r2 = new FileReader();
                    r2.onload = function (ev) {
                      loadImageSafe(ev.target.result, file.name)
                        .then(function () { toast('已加载 ' + file.name, 'success'); })
                        .catch(function (e2) { toast('加载失败: ' + e2.message, 'error'); });
                    };
                    r2.readAsDataURL(file);
                  });
                } catch(e) {
                  toast('加载失败: ' + e.message, 'error');
                }
              } else {
                loadEditor(null);
                // 编辑器加载后再打开
                var checkReady = setInterval(function () {
                  if (imageEditor) {
                    clearInterval(checkReady);
                    resetViewportBeforeLoad();
                    imageEditor.loadImageFromFile(file)
                      .then(function (result) {
                        toast('已加载 ' + file.name, 'success');
                        // 适应窗口 + 居中（v0.68）
                        setTimeout(function() { try { fitAndCenter(); } catch(e) {} }, 100);
                      })
                      .catch(function () { /* ignore */ });
                  }
                }, 200);
              }
            };
            input.click();
            break;
          case 'save-img':
            var dataURL = imageEditor.toDataURL();
            var name = _currentFileName || 'image.png';
            var link = document.createElement('a');
            link.href = dataURL;
            link.download = name;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            toast('已导出 ' + name, 'success');
            break;
          case 'reset-img':
            if (imageEditor) loadImageSafe(imageEditor.getCurrentImageUrl(), 'image');
            break;
          // Filters
          case 'filter-grayscale': imageEditor.applyFilter('grayscale'); break;
          case 'filter-sepia': imageEditor.applyFilter('sepia'); break;
          case 'filter-invert': imageEditor.applyFilter('invert'); break;
          case 'filter-blur': imageEditor.applyFilter('blur'); break;
          case 'filter-sharpen': imageEditor.applyFilter('sharpen'); break;
          case 'filter-emboss': imageEditor.applyFilter('emboss'); break;
          case 'filter-reset': imageEditor.applyFilter('removeAll'); break;
          // AI 助手 — 打开统一面板
          case 'open-ai-panel': toggleAIPanel(); break;
          // View/Zoom — 通过 doZoom 统一入口
          case 'zoom-in':
            if (imageEditor) {
              _aiZoomLevel = Math.min((_aiZoomLevel || 1) * 1.2, 5);
              doZoom(_aiZoomLevel);
            }
            break;
          case 'zoom-out':
            if (imageEditor) {
              _aiZoomLevel = Math.max((_aiZoomLevel || 1) * 0.8, 0.1);
              doZoom(_aiZoomLevel);
            }
            break;
          case 'zoom-fit':
            if (imageEditor) {
              // v0.68: fit + 居中（替代单纯 doZoom — 现在图始终在可视区中心）
              fitAndCenter();
            }
            break;
          case 'zoom-100':
            if (imageEditor) doZoom(1);
            break;
        }
      };
    });

    // ─── AI 助手面板（统一入口：模式标签切换）───
    var _aiOpen = false;
    var _aiBusy = false;
    var _aiHistory = [];     // [{dataUrl, ts, label}] 限 10
    var _aiResult = null;
    var _aiZoomLevel = 1;     // 手动跟踪 zoom 级别
    var _handActive = false;  // hand 模式激活标志（框选放大和 hand 互斥）
    var _aiMode = 'edit'; // describe | enhance | generate | edit
    var _aiRefUpload = null; // 用户上传的参考图 dataURL（多图生图）

    // zoom 统一入口：设 fabric zoom + 同步 ZOOM 组件级别（hand 模式检查用）
    function doZoom(level) {
      _aiZoomLevel = level;
      try {
        var _zc = imageEditor._graphics && imageEditor._graphics.getCanvas();
        if (_zc) {
          var _r = mountEl.getBoundingClientRect();
          _zc.zoomToPoint({ x: _r.width / 2, y: _r.height / 2 }, level);
          _zc.requestRenderAll();
        }
        var _zcomp = imageEditor._graphics && imageEditor._graphics.getComponent('zoom');
        if (_zcomp) _zcomp.zoomLevel = level;
      } catch(e) { console.warn('[ZOOM] doZoom:', e); }
      updateZoomDisplay(level);
    }

    // v0.68: fit + center — 加载图片时用
    //   1. 计算 fit zoom（按 mainEl 屏幕像素）
    //   2. setZoom(level)
    //   3. 手算 panX, panY 让 obj 视觉中心 = mainEl 屏幕中心（不用 viewportCenterObject —
    //      tui canvas DOM 的 CSS max-height: 600 可能超过 mainEl 实际高度（502），
    //      而 viewportCenterObject 用 drawing buffer center (500, 300) 当目标，结果偏下 ~50px）
    //   4. requestRenderAll
    //
    // 关于 imageEditor.getCanvasImage() 不可用：
    //   - tui 内部把 getCanvasImage 定义在 Component prototype，靠 mixin 到 ImageEditor.prototype
    //   - 但 includeUI 模式下 invoker 包装后，prototype chain 上该方法不可枚举
    //   - 直接用 imageEditor._graphics.canvasImage（Graphics 实例属性，line 57467 初始化）
    function fitAndCenter() {
      try {
        var c = imageEditor._graphics && imageEditor._graphics.getCanvas();
        if (!c) return;
        var img = (imageEditor._graphics && imageEditor._graphics.canvasImage)
                  || c.getActiveObject()
                  || (c._objects && c._objects[0])
                  || null;
        if (!img || !img.width || !img.height) return;

        // 主区 = 屏幕可视区
        var mainEl = mountEl.querySelector('.tui-image-editor-main') || mountEl;
        var mainRect = mainEl.getBoundingClientRect();

        var level = Math.min(mainRect.width / img.width, mainRect.height / img.height);
        if (!(level > 0)) return;
        // v0.80: 小图不放大。tui canvas buffer = 图片原始尺寸，viewport zoom > 1 时
        //   图渲染尺寸超出 buffer → 被 buffer 裁剪（300x200 图 fit 2.51 倍只显示左上角）。
        //   fit 语义 = 完整显示：图比窗口小时保持 100% 居中；放大留给 zoom-in 按钮。
        if (level > 1) level = 1;

        // v0.80: level = 1（小图 100%）时图占满 buffer（centerObject 后居中），
        //   容器（.tui-image-editor inline-block）在 main 内 text-align:center 居中 →
        //   viewport 保持 identity 即可（panX/panY = 0），任何 pan 都会把图推出 buffer。
        if (level >= 1) {
          c.setViewportTransform([1, 0, 0, 1, 0, 0]);
          c.requestRenderAll();
          var zc1 = imageEditor._graphics.getComponent('zoom');
          if (zc1) zc1.zoomLevel = 1;
          _aiZoomLevel = 1;
          updateZoomDisplay(1);
          return;
        }

        c.setZoom(level);

        // 手算 panX / panY 让 obj 几何中心 屏幕位置 = main 中心 屏幕位置
        //   fabric vpt 后: screen.x = canvasRect.left + (objDbuf.x * level + panX) * (canvasRect.width / c.width)
        //   canvasRect.left 通常 == mainRect.left（canvas DOM 在 main 内 absolute left:0）
        //   要: 屏幕 center = mainRect.left + mainRect.width/2
        //   → panX = (mainRect.width / 2) * (c.width / canvasRect.width) - objCenterX * level
        var canvasRect = c.upperCanvasEl.getBoundingClientRect();
        if (canvasRect.width <= 0 || canvasRect.height <= 0) return;

        // obj originX/originY 多数为 'left'/'top'（tui 创建 Image 默认）
        var objCenterX = (img.left || 0) + img.width * (img.scaleX || 1) / 2;
        var objCenterY = (img.top  || 0) + img.height * (img.scaleY || 1) / 2;

        var panX = (canvasRect.width  / 2) - objCenterX * level;
        var panY = (canvasRect.height / 2) - objCenterY * level;

        c.setViewportTransform([level, 0, 0, level, panX, panY]);
        c.requestRenderAll();

        // 同步 tui ZOOM 组件（hand 模式检查 zoomLevel <= 1.0 时不响应拖动）
        var zc = imageEditor._graphics.getComponent('zoom');
        if (zc) zc.zoomLevel = level;

        _aiZoomLevel = level;
        updateZoomDisplay(level);
      } catch(e) { console.warn('[ZOOM] fitAndCenter:', e); }
    }

    // v0.68.1: zoom input — 在 tui 内置工具栏 .tie-btn-zoomIn 按钮右边显示当前 %
    //   - 通过在 .tui-image-editor-help-menu 内插入 <input class="ief-zoom-input">
    //   - help-menu 整个 ul 容器 CSS 已变 bar，统一深色背景（v0.68.1）
    //   - 所有 zoom 路径（doZoom / fitAndCenter / 框选放大 / 手势缩放）通过 updateZoomDisplay(level) 同步
    //   - 用户编辑：input change → 把 pct/100 当 zoom level 调 doZoom；editing flag 防止 updateZoomDisplay 重置输入
    var _zoomEditing = false;  // 用户编辑中不覆盖 input

    function ensureZoomDisplay() {
      if (!mountEl) return null;
      var helpMenu = mountEl.querySelector('.tui-image-editor-help-menu');
      if (!helpMenu) return null;
      var existing = helpMenu.querySelector('.ief-zoom-input');
      if (existing) return existing;
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'ief-zoom-input';
      input.value = Math.round((_aiZoomLevel || 1) * 100) + '%';
      input.title = '当前缩放比例（可手动修改）';
      input.setAttribute('aria-label', '缩放比例');

      // 绑定编辑事件
      input.addEventListener('focus', function() { _zoomEditing = true; });
      input.addEventListener('blur',  function() { _zoomEditing = false; });
      // change 事件：blur 之前的最终值；input 事件：每次按键
      input.addEventListener('change', function() { applyZoomFromInput(input); });
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); input.blur(); }
      });
      // focus 全选 — 点一下就全选输入框
      input.addEventListener('mouseup', function(e) {
        // 让 click 选中 — 但 mouseup 默认是放 cursor，setTimeout delay 才能 select
        e.preventDefault();
        input.select();
      });

      // 插入到 .tie-btn-zoomIn 后面（"Zoom In 按钮的右边"）
      var zoomInBtn = helpMenu.querySelector('.tie-btn-zoomIn');
      if (zoomInBtn && zoomInBtn.parentNode === helpMenu) {
        if (zoomInBtn.nextSibling) {
          helpMenu.insertBefore(input, zoomInBtn.nextSibling);
        } else {
          helpMenu.appendChild(input);
        }
      } else {
        var zoomOutBtn = helpMenu.querySelector('.tie-btn-zoomOut');
        if (zoomOutBtn) helpMenu.insertBefore(input, zoomOutBtn);
        else helpMenu.appendChild(input);
      }
      return input;
    }

    function applyZoomFromInput(input) {
      if (!imageEditor) return;
      var raw = (input.value || '').trim().replace(/%/g, '').replace(/x/gi, '');
      var pct = parseFloat(raw);
      if (!isFinite(pct) || pct <= 0) {
        // 非法输入：恢复当前 zoom
        input.value = Math.round((_aiZoomLevel || 1) * 100) + '%';
        return;
      }
      // clamp 到 [10, 500]
      pct = Math.max(10, Math.min(pct, 500));
      var level = pct / 100;
      _aiZoomLevel = level;
      doZoom(level);  // doZoom → updateZoomDisplay → 但 _zoomEditing 在 blur 时已 false，所以安全覆盖
    }

    function updateZoomDisplay(level) {
      if (typeof level !== 'number' || !isFinite(level)) return;
      var pct = Math.round(level * 100);
      var label = pct + '%';
      var input = mountEl && mountEl.querySelector('.ief-zoom-input');
      if (input) {
        if (input.value !== label && !_zoomEditing) input.value = label;
      } else {
        // 第一次插入
        ensureZoomDisplay();
      }
    }

    // 默认框选放大：在画布拖拽=选择区域自动放大（hand 模式激活时不触发）
    //   v0.83 修复（2026-08-01）：
    //     1. mr 改用 mainEl 而非 mountEl（mount 含 help-menu + controls toolbar，尺寸 ≠ 画布可视区）
    //     2. zoom level = mainEl 屏幕像素 / 选区屏幕像素（选区屏幕像素 = fabric 像素 × current zoom）
    //        旧公式 mr.width/w 把 mount 维度直接除以 fabric 像素，包含 toolbar 像素误差
    //     3. 改用 setViewportTransform + 手算 panX/panY（跟 fitAndCenter 同算法）
    //        zoomToPoint 仅保持指定点屏幕位置不变，但不让选区中心 = mainEl 中心 → 图偏到屏幕外
    //        用户报告「图不知道跑到哪里去了」就是 pan 没校准所致
    function setupZoomDrag() {
      try {
        var c = imageEditor._graphics && imageEditor._graphics.getCanvas();
        if (!c) return;
        var _sd = null;
        c.on('mouse:down', function(opt) {
          if (opt.target || _handActive) return; // 点到对象或 hand 模式不触发
          _sd = c.getPointer(opt.e);
        });
        c.on('mouse:up', function(opt) {
          if (!_sd || _handActive) return;
          var p = c.getPointer(opt.e);
          var sx = _sd.x, sy = _sd.y;
          var w = Math.abs(p.x - sx), h = Math.abs(p.y - sy);
          _sd = null;
          if (w < 10 || h < 10) return;

          // 主区 = 屏幕可视区（非 mount，因为 mount 含 help-menu / controls toolbar）
          var mainEl = mountEl.querySelector('.tui-image-editor-main') || mountEl;
          var mainRect = mainEl.getBoundingClientRect();

          // zoom level = mainEl 屏幕像素 / 选区屏幕像素
          //   选区屏幕像素 = 选区 fabric 像素 × 当前 viewport zoom
          var currentZoom = c.getZoom() || 1;
          var wScreen = w * currentZoom;
          var hScreen = h * currentZoom;
          var level = Math.max(Math.min(Math.min(mainRect.width / wScreen, mainRect.height / hScreen), 5), 0.1);

          // 手动 pan：让选区中心（fabric 坐标）屏幕位置 = mainEl 屏幕中心
          //   跟 fitAndCenter 同一算法（见 references/fit-and-center-formula.md）
          var canvasRect = c.upperCanvasEl.getBoundingClientRect();
          if (canvasRect.width <= 0 || canvasRect.height <= 0) {
            // 退化路径：canvas DOM 还没布局，用 setZoom 而不算 pan
            c.setZoom(level);
          } else {
            var objCenterX = sx + w / 2;
            var objCenterY = sy + h / 2;
            // v0.83 fix: 用 canvasRect.{width,height}/2（不是 mainRect.{width,height}/2）
            //   tui canvas DOM 在 main 内居中（左右各有 (mainRect.width - canvasRect.width)/2 边距）
            //   fabric 6 setZoom/setViewportTransform 不改 canvas DOM CSS size，
            //   canvasRect.width 固定，obj 屏幕中心 = canvasRect.left + (obj.x * level + panX) * (canvasRect.width / c.width)
            //   实测 mainRect=998, canvasRect=800 → 用 mainRect/2 会让图偏右 ~99px
            var panX = (canvasRect.width / 2) - objCenterX * level;
            var panY = (canvasRect.height / 2) - objCenterY * level;
            c.setViewportTransform([level, 0, 0, level, panX, panY]);
          }
          c.requestRenderAll();

          _aiZoomLevel = level;
          // 同步 ZOOM 组件（hand 模式检查 zoomLevel 时需要，否则 hand 拖不动）
          var zc = imageEditor._graphics.getComponent('zoom');
          if (zc) zc.zoomLevel = level;
          updateZoomDisplay(level);
        });
      } catch(e) { console.warn('[ZOOM-DRAG] setup:', e); }
    }
    var AI_MODES = [
      { id: 'describe', icon: '📖', label: '描述' },
      { id: 'enhance',  icon: '✨', label: '增强' },
      { id: 'generate', icon: '🎨', label: '文生图' },
      { id: 'edit',     icon: '🖼️', label: '图生图' },
    ];

    function toggleAIPanel() {
      _aiOpen = !_aiOpen;
      aiPanel.style.display = _aiOpen ? 'block' : 'none';
      if (_aiOpen) renderAIPanel();
    }

    function openAIPanel(mode) {
      _aiMode = mode;
      _aiOpen = true;
      aiPanel.style.display = 'block';
      renderAIPanel();
    }

    function renderAIPanel() {
      // 检测是否有图
      var hasImage = false;
      try {
        if (imageEditor && imageEditor.getImageName && imageEditor.getImageName()) hasImage = true;
      } catch(e) {}
      if (!hasImage) try {
        if (imageEditor && imageEditor.getCanvas) {
          var c = imageEditor.getCanvas();
          if (c && c.width > 0 && c.height > 0) hasImage = true;
        }
      } catch(e) {}

      // ① 渲染面板骨架（标题 + 模式标签栏）
      var tabsHtml = AI_MODES.map(function(m) {
        var active = m.id === _aiMode ? ' background:var(--accent,#0ea89d);color:#fff' : ' background:var(--bg,#fff);color:var(--text,#333)';
        return '<span class="ai-mode-tab" data-mode="' + m.id + '" style="display:inline-flex;align-items:center;gap:3px;padding:4px 10px;border:1px solid var(--border,#ddd);border-radius:4px;cursor:pointer;font-size:11px;' + active + '">' + m.icon + ' ' + m.label + '</span>';
      }).join('');

      aiPanel.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            tabsHtml +
            '<button onclick="toggleAIPanel()" style="padding:2px 8px;border:1px solid var(--border,#ddd);border-radius:3px;cursor:pointer;font-size:11px;background:transparent;color:var(--text2,#888)">✕</button>' +
          '</div>' +
        '</div>' +
        '<div id="ai-content" style="font-size:12px;color:var(--text,#333)"></div>';

      // 绑定模式切换事件
      aiPanel.querySelectorAll('.ai-mode-tab').forEach(function(tab) {
        tab.onclick = function(e) {
          e.stopPropagation();
          _aiMode = this.getAttribute('data-mode');
          renderAIPanel(); // 重新渲染
        };
      });

      // ② 渲染当前模式内容
      renderModeContent(hasImage);
    }

    function renderModeContent(hasImage) {
      var contentEl = document.getElementById('ai-content');
      if (!contentEl) return;

      switch (_aiMode) {
        case 'describe': renderDescribe(contentEl); break;
        case 'enhance': renderEnhance(contentEl, hasImage); break;
        case 'generate': renderGenerateEdit(contentEl, hasImage, false); break;
        case 'edit': renderGenerateEdit(contentEl, hasImage, true); break;
      }
    }

    function renderDescribe(contentEl) {
      if (!imageEditor) { contentEl.innerHTML = '<div style="color:var(--text2,#888)">请先打开图片</div>'; return; }
      contentEl.innerHTML = '<div style="color:var(--text2,#888)">⏳ 分析中...</div>';
      var dataURL = imageEditor.toDataURL();
      fetch('/api/chat/detect-and-respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': (window.ACMSConfig && window.ACMSConfig.apiKey) || 'dev-key-001' },
        body: JSON.stringify({
          reqId: '_img_editor',
          text: '请描述这张图片的内容、色调、构图，用中文回答。图片为 base64 dataURL，前缀: ' + dataURL.slice(0, 100) + '...',
        }),
      }).then(function (r) { return r.json(); }).then(function (data) {
        var answer = data && (data.aiReply || data.content || data.message || data.text || data.reply) || '无响应';
        contentEl.innerHTML = '<div style="line-height:1.6;padding:4px 0">' + escHtml(answer) + '</div>';
      }).catch(function (e) { contentEl.innerHTML = '<div style="color:#a00">❌ ' + e.message + '</div>'; });
    }

    function renderEnhance(contentEl, hasImage) {
      if (!hasImage) { contentEl.innerHTML = '<div style="color:var(--text2,#888)">请先打开图片</div>'; return; }
      contentEl.innerHTML =
        '<div style="margin-bottom:6px">一键提升图片亮度、对比度、饱和度</div>' +
        '<button id="ai-enhance-btn" style="padding:5px 14px;background:var(--accent,#0ea89d);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600">✨ 执行增强</button>' +
        '<div id="ai-enhance-result" style="margin-top:6px;color:var(--text2,#888)"></div>';
      document.getElementById('ai-enhance-btn').onclick = function() {
        var resultEl = document.getElementById('ai-enhance-result');
        imageEditor.applyFilter('brightness', { brightness: 10 });
        setTimeout(function () {
          imageEditor.applyFilter('contrast', { contrast: 10 });
        }, 200);
        setTimeout(function () {
          imageEditor.applyFilter('saturation', { saturation: 10 });
          resultEl.innerHTML = '<span style="color:#080">✅ 已应用亮度+10、对比度+10、饱和度+10</span>';
        }, 400);
      };
    }

    function renderGenerateEdit(contentEl, hasImage, isEdit) {
      var effectiveMode = isEdit && hasImage ? 'edit' : 'generate';
      var hint = effectiveMode === 'edit' ? '输入修改意见（如"改成夜景"、"去背景电线"）' : '输入图片描述（如"一只橘猫在窗台"）';
      var placeholder = effectiveMode === 'edit' ? '改成夜景 / 加个月亮 / 去背景电线' : '一只橘猫在窗台，阳光透过窗帘';

      var refThumb = '';
      if (effectiveMode === 'edit') {
        refThumb = '<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center">' +
          '<span style="font-size:11px;color:var(--text2,#888)">参考图：</span>' +
          (_aiRefUpload
            ? '<img src="' + _aiRefUpload + '" style="width:50px;height:50px;object-fit:cover;border-radius:3px;border:1px solid var(--accent,#0ea89d)">' +
              '<button id="ai-remove-ref" style="padding:1px 6px;font-size:11px;border:1px solid var(--border,#ddd);border-radius:3px;cursor:pointer;background:transparent">✕</button>'
            : '<span style="font-size:11px;color:var(--text2,#888)">（画布当前图）</span>') +
          '<input type="file" id="ai-ref-upload-input" accept="image/png,image/jpeg,image/webp" style="display:none">' +
          '<button id="ai-ref-upload-btn" style="padding:2px 8px;font-size:11px;border:1px solid var(--border,#ddd);border-radius:3px;cursor:pointer;background:transparent">📁 上传参考图</button>' +
        '</div>';
      }

      contentEl.innerHTML = refThumb +
        '<div style="margin-bottom:6px;color:var(--text2,#888)">' + hint + '</div>' +
        '<textarea id="ai-prompt" placeholder="' + escHtml(placeholder) + '" style="width:100%;min-height:50px;padding:6px;border:1px solid var(--border,#ddd);border-radius:4px;font-size:12px;font-family:inherit;box-sizing:border-box;resize:vertical"></textarea>' +
        '<div style="display:flex;gap:6px;margin-top:6px;align-items:center">' +
          '<button id="ai-gen-btn" style="padding:5px 14px;background:var(--accent,#0ea89d);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600">✨ 生成</button>' +
          '<span id="ai-status" style="flex:1;font-size:11px;color:var(--text2,#888)">就绪</span>' +
          '<button id="ai-undo-btn" style="padding:5px 10px;border:1px solid var(--border,#ddd);border-radius:4px;cursor:pointer;font-size:11px;background:transparent" disabled>↩ 撤销</button>' +
        '</div>' +
        '<div id="ai-candidates" style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"></div>' +
        '<div id="ai-history" style="margin-top:8px;font-size:11px;color:var(--text2,#888)"></div>';

      document.getElementById('ai-gen-btn').onclick = function() { runAIGenerate(effectiveMode === 'edit'); };
      document.getElementById('ai-undo-btn').onclick = aiUndo;
      // 上传参考图
      var uploadInput = document.getElementById('ai-ref-upload-input');
      var uploadBtn = document.getElementById('ai-ref-upload-btn');
      if (uploadInput && uploadBtn) {
        uploadBtn.onclick = function() { uploadInput.click(); };
        uploadInput.onchange = function() {
          var f = uploadInput.files && uploadInput.files[0];
          if (!f) return;
          var r = new FileReader();
          r.onload = function(ev) { _aiRefUpload = ev.target.result; renderAIPanel(); };
          r.readAsDataURL(f);
        };
      }
      // 移除参考图
      var removeBtn = document.getElementById('ai-remove-ref');
      if (removeBtn) {
        removeBtn.onclick = function() { _aiRefUpload = null; renderAIPanel(); };
      }
      updateAIUI();
      setTimeout(function() { var p = document.getElementById('ai-prompt'); if (p) p.focus(); }, 50);
    }

    function updateAIUI() {
      var genBtn = document.getElementById('ai-gen-btn');
      if (genBtn) { genBtn.disabled = _aiBusy; genBtn.textContent = _aiBusy ? '⏳ 生成中...' : '✨ 生成'; }
      var undoBtn = document.getElementById('ai-undo-btn');
      if (undoBtn) undoBtn.disabled = (_aiHistory.length === 0);
      var histEl = document.getElementById('ai-history');
      if (histEl) {
        if (_aiHistory.length === 0) {
          histEl.innerHTML = '📜 历史：空';
        } else {
          histEl.innerHTML = '📜 历史 (' + _aiHistory.length + '/10)：' +
            _aiHistory.map(function(h, i) {
              return '<img src="' + h.dataUrl + '" data-ai-idx="' + i + '" style="width:40px;height:40px;object-fit:cover;border:1px solid var(--border,#ddd);border-radius:3px;margin-right:3px;cursor:pointer;vertical-align:middle">';
            }).join('');
          var imgs = histEl.querySelectorAll('img[data-ai-idx]');
          Array.prototype.forEach.call(imgs, function(img) {
            img.onclick = function() { aiRestoreAt(parseInt(img.getAttribute('data-ai-idx'))); };
          });
        }
      }
    }

    function pushHistory(label) {
      if (!imageEditor) return;
      var dataUrl = window.imageEditorAPI.saveCanvasSnapshot(imageEditor);
      if (!dataUrl) return;
      _aiHistory.push({ dataUrl: dataUrl, ts: Date.now(), label: label });
      while (_aiHistory.length > 10) _aiHistory.shift();
    }

    // 多图生图：合成上传参考图 + 当前画布
    // v0.77: 返回 { dataUrl, width, height }，让 runAIGenerate 知道 output 目标尺寸
    function compositeRefWithCanvas() {
      return new Promise(function(resolve) {
        // 无上传参考图：返回画布当前内容 + 图片实际尺寸（v0.78: 裁剪到图片区域，不送整 buffer 防黑框）
        if (!_aiRefUpload || !imageEditor) {
          var crop0 = cropCanvasToImage();
          resolve({ dataUrl: crop0.dataUrl, width: crop0.width, height: crop0.height });
          return;
        }
        try {
          var c = imageEditor._graphics && imageEditor._graphics.getCanvas();
          if (!c) {
            var snap2 = window.imageEditorAPI.saveCanvasSnapshot(imageEditor);
            resolve({ dataUrl: snap2, width: 0, height: 0 });
            return;
          }
          // v0.78: 以图片实际区域为合成底（不是整 buffer）
          var crop1 = cropCanvasToImage();
          var cw = crop1.width || c.getWidth(), ch = crop1.height || c.getHeight();
          // 限制最大尺寸防止 dataURL 过大，但保留足够细节
          var MAX_SIZE = 2048;
          if (cw > MAX_SIZE || ch > MAX_SIZE) {
            var ratio = Math.min(MAX_SIZE / cw, MAX_SIZE / ch);
            cw = Math.round(cw * ratio); ch = Math.round(ch * ratio);
          }
          var img = new Image();
          img.onload = function() {
            try {
              var offscreen = document.createElement('canvas');
              offscreen.width = cw; offscreen.height = ch;
              var ctx = offscreen.getContext('2d');
              // 上传图铺满背景（居中缩放裁剪填满）
              var scale = Math.max(cw / img.width, ch / img.height);
              var dx = (cw - img.width * scale) / 2, dy = (ch - img.height * scale) / 2;
              ctx.drawImage(img, dx, dy, img.width * scale, img.height * scale);
              // 画布当前内容（裁剪到图片区域）直接叠上去（不透明），让AI同时看到两者
              if (crop1.dataUrl && crop1.dataUrl.length > 100) {
                var cur = new Image();
                cur.onload = function() { try { ctx.drawImage(cur, 0, 0, cw, ch); finish(); } catch(e) { finish(); } };
                cur.onerror = function() { finish(); };
                cur.src = crop1.dataUrl;
              } else {
                ctx.drawImage(c.getElement(), 0, 0, cw, ch);
                finish();
              }
              function finish() {
                // 用 PNG 无损输出
                var dataUrl = offscreen.toDataURL('image/png');
                if (!dataUrl || dataUrl === 'data:,' || dataUrl.length < 100) {
                  console.warn('[AI] composite invalid, fallback');
                  var snap3 = cropCanvasToImage();
                  resolve({ dataUrl: snap3.dataUrl, width: snap3.width || cw, height: snap3.height || ch });
                } else {
                  console.log('[AI] composite PNG size:', (dataUrl.length / 1024).toFixed(0) + 'KB', cw + 'x' + ch);
                  // v0.77: 传出合成后的画布尺寸（实际 input 比例）
                  resolve({ dataUrl: dataUrl, width: cw, height: ch });
                }
              }
            } catch(e) { console.warn('[AI] composite draw:', e); var snap4 = cropCanvasToImage(); resolve({ dataUrl: snap4.dataUrl, width: snap4.width || cw, height: snap4.height || ch }); }
          };
          img.onerror = function() { var snap5 = cropCanvasToImage(); resolve({ dataUrl: snap5.dataUrl, width: snap5.width || cw, height: snap5.height || ch }); };
          img.src = _aiRefUpload;
        } catch(e) { console.warn('[AI] compositeRef:', e); var snap6 = cropCanvasToImage(); resolve({ dataUrl: snap6.dataUrl, width: snap6.width, height: snap6.height }); }
      });
    }

    async function runAIGenerate(isEdit) {
      if (_aiBusy || !imageEditor) return;
      var promptEl = document.getElementById('ai-prompt');
      var statusEl = document.getElementById('ai-status');
      if (!promptEl || !statusEl) return;
      var prompt = promptEl.value.trim();
      if (!prompt) { statusEl.innerHTML = '<span style="color:#c00">⚠️ 请输入内容</span>'; return; }

      _aiBusy = true;
      updateAIUI();
      statusEl.textContent = '⏳ 生成中...';

      var dataUrl = null, targetW = 0, targetH = 0;
      if (isEdit) {
        // v0.77: compositeRefWithCanvas 现在返回 { dataUrl, width, height }，用于自动选 Agnes ratio 档位
        var ref = _aiRefUpload
          ? await compositeRefWithCanvas()
          : cropCanvasToImage();
        dataUrl = ref.dataUrl;
        targetW = ref.width;
        targetH = ref.height;
      }

      try {
        var result;
        if (dataUrl) {
          // v0.77: 把 targetW/targetH 传给后端，让 coreGenerate 自动选最近 ratio 档位
          //   （输出图比例 = 原图比例；分辨率按 input 像素总数选 1K/2K/3K/4K）
          result = await window.imageEditorAPI.aiEdit(prompt, dataUrl, 4, { targetWidth: targetW, targetHeight: targetH });
        } else {
          result = await window.imageEditorAPI.aiGenerate(prompt, 4);
        }
        if (!result || !result.ok) {
          statusEl.innerHTML = '<span style="color:#c00">❌ ' + escHtml((result && result.error ? result.error : '生成失败')) + '</span>';
          return;
        }
        _aiResult = result;
        renderCandidates(result.options || []);
        statusEl.innerHTML = '<span style="color:#080">✅ ' + (result.options ? result.options.length : 0) + ' 张</span>';
      } catch (e) {
        statusEl.innerHTML = '<span style="color:#c00">❌ ' + escHtml(e.message) + '</span>';
      } finally {
        _aiBusy = false;
        updateAIUI();
      }
    }

    function renderCandidates(options) {
      var el = document.getElementById('ai-candidates');
      if (!el) return;
      if (!options || options.length === 0) { el.innerHTML = ''; return; }
      el.innerHTML = options.map(function(opt, i) {
        return '<div data-ai-cand="' + i + '" style="position:relative;cursor:pointer;border:2px solid transparent;border-radius:4px;overflow:hidden" title="点击应用">' +
          '<img src="' + escHtml(opt.image_url_output) + '" style="width:80px;height:80px;object-fit:cover;display:block">' +
          '<span style="position:absolute;top:1px;left:2px;background:rgba(0,0,0,0.6);color:#fff;font-size:9px;padding:1px 4px;border-radius:2px">#' + (i + 1) + '</span>' +
        '</div>';
      }).join('');
      Array.prototype.forEach.call(el.querySelectorAll('[data-ai-cand]'), function(node) {
        node.onclick = function() { applyCandidate(parseInt(node.getAttribute('data-ai-cand'))); };
        node.onmouseenter = function() { node.style.borderColor = 'var(--accent,#0ea89d)'; };
        node.onmouseleave = function() { node.style.borderColor = 'transparent'; };
      });
    }

    function applyCandidate(idx) {
      if (!_aiResult || !_aiResult.options) return;
      var opt = _aiResult.options[idx];
      if (!opt) return;
      pushHistory('候选 #' + (idx + 1));
      var loadUrl = opt.workspace_path
        ? '/api/files/asset?path=' + encodeURIComponent(opt.workspace_path)
        : opt.image_url_output;
      loadImageSafe(loadUrl, 'ai_' + (idx + 1) + '.png').then(function(result) {
        // 等 tui 内部布局完成后 fit + 居中（v0.68）
        setTimeout(function() { try { fitAndCenter(); } catch(e) { console.warn('[AI] 缩放失败:', e); } }, 100);
      }).catch(function(e) { console.warn('[AI] 加载候选失败:', e); });
    }

    function aiUndo() {
      if (_aiHistory.length === 0) return;
      _aiHistory.pop();
      if (_aiHistory.length > 0) aiRestoreSnapshot(_aiHistory[_aiHistory.length - 1].dataUrl);
      else loadImageSafe('', 'blank').catch(function(){});
      updateAIUI();
    }

    function aiRestoreAt(idx) {
      if (idx < 0 || idx >= _aiHistory.length) return;
      aiRestoreSnapshot(_aiHistory[idx].dataUrl);
      _aiHistory = _aiHistory.slice(0, idx + 1);
      updateAIUI();
    }

    function aiRestoreSnapshot(dataUrl) {
      if (!dataUrl) return;
      loadImageSafe(dataUrl, 'snapshot').then(function(result) {
        // v0.68: fit + 居中
        setTimeout(function() { try { fitAndCenter(); } catch(e) { console.warn('[AI] 恢复快照缩放失败:', e); } }, 100);
      }).catch(function(e) { console.warn('[AI] 恢复快照失败:', e); });
    }

    // 暴露 toggle 给内联 onclick（aiPanel HTML 里的关闭按钮用）
    window.toggleAIPanel = toggleAIPanel;
  }

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // v0.66 PR2: 暴露 imageEditorAPI 给小吉/chat 流调用
  //   复用 /api/files 接口读取原始图片 → Canvas 处理 → /api/files/upload 保存
  //   不引入新依赖（纯浏览器 Canvas API）
  function fileToDataURL(url) {
    return fetch(url).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    }).then(function(blob) {
      return new Promise(function(resolve, reject) {
        var fr = new FileReader();
        fr.onload = function() { resolve({ dataUrl: fr.result, size: blob.size, mime: blob.type }); };
        fr.onerror = function() { reject(new Error('FileReader failed')); };
        fr.readAsDataURL(blob);
      });
    });
  }

  function loadImage(dataUrl) {
    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.onload = function() { resolve(img); };
      img.onerror = function() { reject(new Error('Image decode failed')); };
      img.src = dataUrl;
    });
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise(function(resolve) {
      canvas.toBlob(function(blob) {
        resolve(blob);
      }, mime, quality);
    });
  }

  function blobToBase64(blob) {
    return new Promise(function(resolve, reject) {
      var fr = new FileReader();
      fr.onload = function() {
        var s = fr.result;
        // data:image/png;base64,XXXXX → XXXXX
        var idx = s.indexOf(',');
        resolve(idx >= 0 ? s.slice(idx + 1) : s);
      };
      fr.onerror = function() { reject(new Error('blobToBase64 failed')); };
      fr.readAsDataURL(blob);
    });
  }

  function inferFormat(path) {
    var m = (path || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : 'png';
  }

  function inferMime(format) {
    var f = (format || '').toLowerCase();
    if (f === 'jpg' || f === 'jpeg') return 'image/jpeg';
    if (f === 'webp') return 'image/webp';
    if (f === 'gif') return 'image/gif';
    return 'image/png';
  }

  function buildOutputName(srcPath, suffix, targetFormat) {
    var baseName = (srcPath || '').split(/[\\\/]/).pop() || 'image';
    var dotIdx = baseName.lastIndexOf('.');
    var stem = dotIdx > 0 ? baseName.slice(0, dotIdx) : baseName;
    var fmt = targetFormat || inferFormat(srcPath);
    return stem + suffix + '.' + fmt;
  }

  function uploadOutput(srcPath, outputName, blob, outputPath) {
    return blobToBase64(blob).then(function(b64) {
      var apiPath = (window.api ? window.api : null);
      // 用 api() 上传（带 X-API-Key + JWT）
      var dir = srcPath.replace(/[\\\/][^\\\/]+$/, '');
      var saveDir = outputPath || dir;
      return fetch('/api/files/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': (window.AK || 'dev-key-001'),
          'Authorization': 'Bearer ' + (localStorage.getItem('acms-token') || ''),
        },
        body: JSON.stringify({ path: saveDir, fileName: outputName, content: b64 }),
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(e) { throw new Error(e.message || 'HTTP ' + r.status); });
        return r.json();
      });
    });
  }

  root.imageEditorAPI = {
    // 同步 RPC：读图片元数据
    getInfo: function(path) {
      if (!path) return Promise.resolve({ ok: false, error: 'INVALID_ARGS', message: '需要 path' });
      return fileToDataURL('/api/files?path=' + encodeURIComponent(path) + '&raw=1')
        .then(function(r) { return loadImage(r.dataUrl).then(function(img) {
          return { ok: true, path: path, width: img.naturalWidth, height: img.naturalHeight, format: inferFormat(path), size: r.size, mime: r.mime };
        }); })
        .catch(function(e) { return { ok: false, error: 'GET_INFO_FAILED', message: e.message }; });
    },

    // 异步：缩放图片 → 保存为新文件
    resize: function(path, width, height, opts) {
      opts = opts || {};
      if (!path || !width || !height) return Promise.resolve({ ok: false, error: 'INVALID_ARGS', message: '需要 path/width/height' });
      var suffix = opts.suffix || ('_resized_' + width + 'x' + height);
      var outputPath = opts.outputPath;
      return fileToDataURL('/api/files?path=' + encodeURIComponent(path) + '&raw=1')
        .then(function(r) { return loadImage(r.dataUrl); })
        .then(function(img) {
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(width));
          canvas.height = Math.max(1, Math.round(height));
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvasToBlob(canvas, inferMime(inferFormat(path)), 0.92);
        })
        .then(function(blob) {
          var outputName = buildOutputName(path, suffix);
          return uploadOutput(path, outputName, blob, outputPath);
        })
        .then(function(info) { return { ok: true, outputPath: (outputPath || path.replace(/[\\\/][^\\\/]+$/, '')) + '/' + info.name, width: width, height: height }; })
        .catch(function(e) { return { ok: false, error: 'RESIZE_FAILED', message: e.message }; });
    },

    // 异步：裁剪图片（(x, y, w, h) 是源图坐标系）
    crop: function(path, x, y, width, height, opts) {
      opts = opts || {};
      if (!path || x == null || y == null || !width || !height) return Promise.resolve({ ok: false, error: 'INVALID_ARGS', message: '需要 path/x/y/width/height' });
      var suffix = opts.suffix || ('_cropped_' + width + 'x' + height);
      var outputPath = opts.outputPath;
      return fileToDataURL('/api/files?path=' + encodeURIComponent(path) + '&raw=1')
        .then(function(r) { return loadImage(r.dataUrl); })
        .then(function(img) {
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(width));
          canvas.height = Math.max(1, Math.round(height));
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, Math.round(x), Math.round(y), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
          return canvasToBlob(canvas, inferMime(inferFormat(path)), 0.92);
        })
        .then(function(blob) {
          var outputName = buildOutputName(path, suffix);
          return uploadOutput(path, outputName, blob, outputPath);
        })
        .then(function(info) { return { ok: true, outputPath: (outputPath || path.replace(/[\\\/][^\\\/]+$/, '')) + '/' + info.name, width: width, height: height }; })
        .catch(function(e) { return { ok: false, error: 'CROP_FAILED', message: e.message }; });
    },

    // 异步：格式转换
    convert: function(path, targetFormat, opts) {
      opts = opts || {};
      if (!path || !targetFormat) return Promise.resolve({ ok: false, error: 'INVALID_ARGS', message: '需要 path/targetFormat' });
      var suffix = opts.suffix || ('_converted.' + targetFormat);
      var outputPath = opts.outputPath;
      var mime = inferMime(targetFormat);
      return fileToDataURL('/api/files?path=' + encodeURIComponent(path) + '&raw=1')
        .then(function(r) { return loadImage(r.dataUrl); })
        .then(function(img) {
          var canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          var ctx = canvas.getContext('2d');
          // JPG/WebP 不支持透明 → 白底
          if (mime === 'image/jpeg' || mime === 'image/webp') {
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(img, 0, 0);
          return canvasToBlob(canvas, mime, 0.92);
        })
        .then(function(blob) {
          var outputName = buildOutputName(path, suffix, targetFormat);
          return uploadOutput(path, outputName, blob, outputPath);
        })
        .then(function(info) { return { ok: true, outputPath: (outputPath || path.replace(/[\\\/][^\\\/]+$/, '')) + '/' + info.name, format: targetFormat }; })
        .catch(function(e) { return { ok: false, error: 'CONVERT_FAILED', message: e.message }; });
    },

    // v0.66 PR2: AI 文生图（无源图）
    aiGenerate: function(prompt, n, opts) {
      opts = opts || {};
      if (!prompt) return Promise.resolve({ ok: false, error: 'INVALID_ARGS', message: '需要 prompt' });
      var count = n || 4;
      return fetch('/api/image-tools/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': (window.AK || 'dev-key-001') },
        body: JSON.stringify({ prompt: prompt, n: count, size: opts.size || '1024x1024' }),
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(e) { throw new Error(e.message || 'HTTP ' + r.status); });
        return r.json();
      }).catch(function(e) {
        return { ok: false, error: e.message };
      });
    },

    // v0.66 PR2: AI 图生图（基于当前画布或传入 referenceImage）
    // v0.77: opts.targetWidth/targetHeight 透传给后端 → coreGenerate 自动选 ratio 档位
    aiEdit: function(prompt, referenceImage, n, opts) {
      opts = opts || {};
      if (!prompt || !referenceImage) return Promise.resolve({ ok: false, error: 'INVALID_ARGS', message: '需要 prompt 和 referenceImage' });
      var count = n || 4;
      var body = { prompt: prompt, referenceImage: referenceImage, n: count };
      if (opts.size) body.size = opts.size;
      if (opts.targetWidth) body.targetWidth = opts.targetWidth;
      if (opts.targetHeight) body.targetHeight = opts.targetHeight;
      return fetch('/api/image-tools/ai-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': (window.AK || 'dev-key-001') },
        body: JSON.stringify(body),
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(e) { throw new Error(e.message || 'HTTP ' + r.status); });
        return r.json();
      }).catch(function(e) {
        return { ok: false, error: e.message };
      });
    },

    // v0.66 PR2: 保存画布快照（dataURL）
    saveCanvasSnapshot: function(canvasInst) {
      if (!canvasInst) return null;
      if (typeof canvasInst.toDataURL === 'function') return canvasInst.toDataURL('image/png');
      var canvas = (typeof canvasInst.getCanvas === 'function') ? canvasInst.getCanvas() : canvasInst;
      if (canvas && typeof canvas.toDataURL === 'function') return canvas.toDataURL('image/png');
      return null;
    },

    // v0.66 PR2: 从快照恢复画布
    restoreCanvasSnapshot: function(canvasInst, dataUrl) {
      if (!canvasInst || !dataUrl) return Promise.resolve(false);
      var canvas = (typeof canvasInst.getCanvas === 'function') ? canvasInst.getCanvas() : canvasInst;
      if (!canvas || typeof canvas.getContext !== 'function') return Promise.resolve(false);
      return new Promise(function(resolve) {
        var img = new Image();
        img.onload = function() {
          var ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          resolve(true);
        };
        img.onerror = function() { resolve(false); };
        img.src = dataUrl;
      });
    },
  };

  root.openImageEditor = openImageEditor;
  root.ImageEditorApp = { open: openImageEditor };

})(window);
