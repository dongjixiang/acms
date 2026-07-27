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
      }, 200);

      // 激活内置按钮事件 (initCanvas 里只在 loadImage.path 有值时才调用 activeMenuEvent)
      if (imageEditor && imageEditor.ui && typeof imageEditor.ui.activeMenuEvent === 'function') {
        setTimeout(function () {
          try { imageEditor.ui.activeMenuEvent(); } catch(e) { console.warn('[IMG-ERR] activeMenuEvent:', e); }
        }, 300);
      }

      // 监听 tui 图片加载结果
      imageEditor.on('loadImage', function(result) {
        console.log('[IMG-LOADED] tui loadImage 完成:', result ? (result.newWidth+'x'+result.newHeight) : 'no result');
      });
      imageEditor.on('error', function(err) {
        console.warn('[IMG-ERR] tui error:', err && err.message ? err.message : err);
      });
    }

    // v0.73: 暴露图片重载函数（供拖拽到已打开的编辑器窗口时使用）
    function reloadImage(url) {
      if (!imageEditor || !url) return;
      console.log('[IMG-RELOAD] 重新加载图片:', url.slice(0, 80));
      var name = url.split('/').pop() || 'image';
      imageEditor.loadImageFromURL(url, name).then(function() {
        console.log('[IMG-RELOAD] 加载成功');
        // 适应窗口
        setTimeout(function() {
          try {
            var rect = mountEl.getBoundingClientRect();
            var img = imageEditor.getCanvasImage();
            if (img) {
              var zl = Math.min(rect.width / img.width, rect.height / img.height);
              if (zl > 0) { doZoom(zl); }
            }
          } catch(e) {}
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
                  imageEditor.loadImageFromFile(file).then(function (result) {
                    toast('已加载 ' + file.name, 'success');
                    // 手动计算 zoom 适配窗口 (resizeEditor 会读取 cssMaxWidth=9999 导致编辑器溢出)
                    try {
                      var mountRect = mountEl.getBoundingClientRect();
                      var cw = mountRect.width;
                      var ch = mountRect.height;
                      var iw = result.newWidth;
                      var ih = result.newHeight;
                      if (cw > 0 && ch > 0 && iw > 0 && ih > 0) {
                          var zoomLevel = Math.min(cw / iw, ch / ih);
                          doZoom(zoomLevel);
                       }
                    } catch(e) {}
                  }).catch(function (err) {
                    console.log('[ImageEditor] loadImageFromFile FAILED:', err, 'file=', file.name);
                    // 方法2: 回退 dataURL
                    console.warn('[ImageEditor] loadImageFromFile failed, trying dataURL', err);
                    var r2 = new FileReader();
                    r2.onload = function (ev) {
                      imageEditor.loadImageFromURL(ev.target.result, file.name)
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
                    imageEditor.loadImageFromFile(file)
                      .then(function (result) {
                        toast('已加载 ' + file.name, 'success');
                        try {
                          var mRect = mountEl.getBoundingClientRect();
                          var zl = Math.min(mRect.width / result.newWidth, mRect.height / result.newHeight);
                          if (zl > 0) doZoom(zl);
                        } catch(e) {}
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
            if (imageEditor) imageEditor.loadImageFromURL(imageEditor.getCurrentImageUrl(), 'image');
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
              var img = imageEditor.getCanvasImage();
              if (img && img.width > 0 && img.height > 0) {
                var rect = mountEl.getBoundingClientRect();
                doZoom(Math.min(rect.width / img.width, rect.height / img.height));
              }
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
    var _aiMode = 'describe'; // describe | enhance | generate | edit

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
    }

    // 默认框选放大：在画布拖拽=选择区域自动放大（hand 模式激活时不触发）
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
          var mr = mountEl.getBoundingClientRect();
          var cx = (sx + p.x) / 2, cy = (sy + p.y) / 2;
          _aiZoomLevel = Math.max(Math.min(Math.min(mr.width / w, mr.height / h), 5), 0.1);
          c.zoomToPoint({ x: cx, y: cy }, _aiZoomLevel);
          c.requestRenderAll();
          var zc = imageEditor._graphics.getComponent('zoom');
          if (zc) zc.zoomLevel = _aiZoomLevel;
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
          '<span style="font-weight:600">⚡ AI助手</span>' +
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

      contentEl.innerHTML =
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

      var dataUrl = null;
      if (isEdit) dataUrl = window.imageEditorAPI.saveCanvasSnapshot(imageEditor);

      try {
        var result = dataUrl
          ? await window.imageEditorAPI.aiEdit(prompt, dataUrl, 4)
          : await window.imageEditorAPI.aiGenerate(prompt, 4);
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
      imageEditor.loadImageFromURL(loadUrl, 'ai_' + (idx + 1) + '.png').then(function(result) {
        // 等 tui 内部布局完成后缩放，确保图片完整可见
        setTimeout(function() {
          try {
            var rect = mountEl.getBoundingClientRect();
            var iw = result && result.newWidth;
            var ih = result && result.newHeight;
            if (!iw || !ih) {
              var img = imageEditor.getCanvasImage();
              if (img) { iw = img.width; ih = img.height; }
            }
            if (iw > 0 && ih > 0 && rect.width > 0 && rect.height > 0) {
              var zl = Math.min(rect.width / iw, rect.height / ih);
              if (zl > 0) { doZoom(zl); }
            }
          } catch(e) { console.warn('[AI] 缩放失败:', e); }
        }, 100);
      }).catch(function(e) { console.warn('[AI] 加载候选失败:', e); });
    }

    function aiUndo() {
      if (_aiHistory.length === 0) return;
      _aiHistory.pop();
      if (_aiHistory.length > 0) aiRestoreSnapshot(_aiHistory[_aiHistory.length - 1].dataUrl);
      else imageEditor.loadImageFromURL('', 'blank').catch(function(){});
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
      imageEditor.loadImageFromURL(dataUrl, 'snapshot').then(function(result) {
        setTimeout(function() {
          try {
            var rect = mountEl.getBoundingClientRect();
            var iw = result && result.newWidth;
            var ih = result && result.newHeight;
            if (!iw || !ih) {
              var img = imageEditor.getCanvasImage();
              if (img) { iw = img.width; ih = img.height; }
            }
            if (iw > 0 && ih > 0 && rect.width > 0 && rect.height > 0) {
              var zl = Math.min(rect.width / iw, rect.height / ih);
              if (zl > 0) { doZoom(zl); }
            }
          } catch(e) { console.warn('[AI] 恢复快照缩放失败:', e); }
        }, 100);
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
    aiEdit: function(prompt, referenceImage, n, opts) {
      opts = opts || {};
      if (!prompt || !referenceImage) return Promise.resolve({ ok: false, error: 'INVALID_ARGS', message: '需要 prompt 和 referenceImage' });
      var count = n || 4;
      return fetch('/api/image-tools/ai-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': (window.AK || 'dev-key-001') },
        body: JSON.stringify({ prompt: prompt, referenceImage: referenceImage, n: count, size: opts.size || '1024x1024' }),
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
