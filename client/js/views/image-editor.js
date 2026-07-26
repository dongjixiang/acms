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

    // 渲染 UI
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
          '<div class="code-menu-item" data-menu="ai" style="position:relative;padding:5px 16px;cursor:pointer;font-size:13px;user-select:none;font-weight:600">🤖 AI' +
            '<div class="code-menu-dropdown" style="display:none;position:absolute;top:100%;left:0;z-index:9999;background:var(--bg,#fff);border:1px solid var(--office-divider,#ddd);border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,0.15);min-width:160px;padding:6px 0">' +
              '<div class="code-menu-dropdown-item" data-action="ai-describe">📖 描述图片</div>' +
              '<div class="code-menu-dropdown-item" data-action="ai-enhance">✨ 智能增强</div>' +
              '<div class="code-menu-dropdown-item" data-action="ai-upscale">🔍 放大</div>' +
            '</div>' +
          '</div>' +
          '<div style="flex:1"></div>' +
        '</div>' +
        '<div id="img-editor-mount" style="flex:1;min-height:0;overflow:auto;background:var(--bg,#1a1a2e)"></div>' +
        '<div id="img-ai-panel" style="display:none;flex-shrink:0;max-height:150px;overflow:auto;background:var(--bg2,#f5f5f7);border-top:1px solid var(--office-divider,#ddd);padding:8px;font-size:13px"></div>' +
      '</div>';

    var mountEl = w.$c.querySelector('#img-editor-mount');
    var aiPanel = w.$c.querySelector('#img-ai-panel');
    var imageEditor = null;

    // ─── 加载 tui-image-editor ───
    function loadEditor(src, callback) {
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
          initMenu: 'draw',
          uiSize: { width: '100%', height: '100%' },
        },
        cssMaxWidth: 9999,
        cssMaxHeight: 9999,
        selectionStyle: { cornerSize: 8, rotatingPointOffset: 20 },
      });

      // JS 移除内置标题栏 (比 CSS 可靠)
      setTimeout(function () {
        var hdr = mountEl.querySelector('.tui-image-editor-header');
        if (hdr) hdr.style.display = 'none';
        var logo = mountEl.querySelector('.tui-image-editor-header-logo');
        if (logo) logo.style.display = 'none';
        var btns = mountEl.querySelector('.tui-image-editor-header-buttons');
        if (btns) btns.style.display = 'none';
      }, 200);

      // 激活内置按钮事件 (initCanvas 里只在 loadImage.path 有值时才调用 activeMenuEvent)
      if (imageEditor && imageEditor.ui && typeof imageEditor.ui.activeMenuEvent === 'function') {
        setTimeout(function () {
          try { imageEditor.ui.activeMenuEvent(); } catch(e) {}
        }, 300);
      }
    }

    // 默认加载空白图片供用户打开文件
    loadEditor(initialSrc || null);

    // ─── 菜单事件 ───
    w.$c.querySelectorAll('.code-menu-item').forEach(function (item) {
      item.onclick = function (e) {
        e.stopPropagation();
        var dd = this.querySelector('.code-menu-dropdown');
        if (!dd) return;
        // close others
        w.$c.querySelectorAll('.code-menu-dropdown').forEach(function (d) { if (d !== dd) d.style.display = 'none'; });
        dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
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
                        var cx = cw / 2;
                        var cy = ch / 2;
                        imageEditor.zoom({ x: cx, y: cy, zoomLevel: zoomLevel });
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
                          if (zl > 0) imageEditor.zoom({ x: mRect.width/2, y: mRect.height/2, zoomLevel: zl });
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
          // AI
          case 'ai-describe': runAIDescribe(); break;
          case 'ai-enhance': runAIEnhance(); break;
          case 'ai-upscale': toast('AI 放大（即将支持）', 'info'); break;
          // View/Zoom
          case 'zoom-in': if (imageEditor) imageEditor.zoom('in'); break;
          case 'zoom-out': if (imageEditor) imageEditor.zoom('out'); break;
          case 'zoom-fit': if (imageEditor) imageEditor.zoom('fit'); break;
          case 'zoom-100': if (imageEditor) imageEditor.zoom('100%'); break;
        }
      };
    });

    // ─── AI 描述 ───
    function runAIDescribe() {
      if (!imageEditor) return;
      var dataURL = imageEditor.toDataURL();
      aiPanel.style.display = 'block';
      aiPanel.innerHTML = '<div style="padding:4px;color:var(--text2,#888)">⏳ AI 正在分析图片...</div>';
      fetch('/api/chat/detect-and-respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': (window.ACMSConfig && window.ACMSConfig.apiKey) || 'dev-key-001' },
        body: JSON.stringify({
          reqId: '_img_editor',
          text: '请描述这张图片的内容、色调、构图，用中文回答。图片为 base64 dataURL，前缀: ' + dataURL.slice(0, 100) + '... (完整图片数据未发送，只描述你知道的)',
        }),
      }).then(function (r) { return r.json(); }).then(function (data) {
        var answer = data && (data.aiReply || data.content || data.message || data.text || data.reply) || '无响应';
        aiPanel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-weight:600">🤖 AI 描述</span><button style="padding:2px 8px;border:1px solid var(--office-divider,#ccc);border-radius:3px;cursor:pointer;font-size:11px;background:transparent" onclick="this.parentNode.parentNode.style.display=\'none\'">✕ 关闭</button></div><div style="color:var(--text,#333);line-height:1.6">' + escHtml(answer) + '</div>';
      }).catch(function (e) { aiPanel.innerHTML = '<div style="color:#a00">❌ ' + e.message + '</div>'; });
    }

    // ─── AI 增强（亮度+对比度+饱和度） ───
    function runAIEnhance() {
      if (!imageEditor) return;
      // 自动增强: 调高亮度/对比度/饱和度
      imageEditor.applyFilter('brightness', { brightness: 10 });
      setTimeout(function () {
        imageEditor.applyFilter('contrast', { contrast: 10 });
      }, 200);
      setTimeout(function () {
        imageEditor.applyFilter('saturation', { saturation: 10 });
        toast('✨ 已自动增强', 'success');
      }, 400);
    }

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
      if (!path || x == null || y == null || !width || !height) {
        return Promise.resolve({ ok: false, error: 'INVALID_ARGS', message: '需要 path/x/y/width/height' });
      }
      var suffix = opts.suffix || ('_cropped_' + Math.round(x) + '_' + Math.round(y) + '_' + Math.round(width) + 'x' + Math.round(height));
      var outputPath = opts.outputPath;
      return fileToDataURL('/api/files?path=' + encodeURIComponent(path) + '&raw=1')
        .then(function(r) { return loadImage(r.dataUrl); })
        .then(function(img) {
          // 边界 clamp 到源图范围
          var sx = Math.max(0, Math.round(x));
          var sy = Math.max(0, Math.round(y));
          var sw = Math.min(Math.round(width), img.naturalWidth - sx);
          var sh = Math.min(Math.round(height), img.naturalHeight - sy);
          if (sw <= 0 || sh <= 0) throw new Error('裁剪区域超出图片边界');
          var canvas = document.createElement('canvas');
          canvas.width = sw;
          canvas.height = sh;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
          return canvasToBlob(canvas, inferMime(inferFormat(path)), 0.92);
        })
        .then(function(blob) {
          var outputName = buildOutputName(path, suffix);
          return uploadOutput(path, outputName, blob, outputPath);
        })
        .then(function(info) { return { ok: true, outputPath: (outputPath || path.replace(/[\\\/][^\\\/]+$/, '')) + '/' + info.name }; })
        .catch(function(e) { return { ok: false, error: 'CROP_FAILED', message: e.message }; });
    },

    // 异步：转格式（png/jpg/webp/gif）
    convert: function(path, targetFormat, opts) {
      opts = opts || {};
      if (!path || !targetFormat) return Promise.resolve({ ok: false, error: 'INVALID_ARGS', message: '需要 path/targetFormat' });
      var suffix = opts.suffix || ('_converted');
      var outputPath = opts.outputPath;
      return fileToDataURL('/api/files?path=' + encodeURIComponent(path) + '&raw=1')
        .then(function(r) { return loadImage(r.dataUrl); })
        .then(function(img) {
          var canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          var ctx = canvas.getContext('2d');
          // JPG 不支持透明，填白底
          if (inferMime(targetFormat) === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(img, 0, 0);
          return canvasToBlob(canvas, inferMime(targetFormat), 0.92);
        })
        .then(function(blob) {
          var outputName = buildOutputName(path, suffix, targetFormat);
          return uploadOutput(path, outputName, blob, outputPath);
        })
        .then(function(info) { return { ok: true, outputPath: (outputPath || path.replace(/[\\\/][^\\\/]+$/, '')) + '/' + info.name, format: targetFormat }; })
        .catch(function(e) { return { ok: false, error: 'CONVERT_FAILED', message: e.message }; });
    },
  };

  root.openImageEditor = openImageEditor;
  root.ImageEditorApp = { open: openImageEditor };

})(window);
