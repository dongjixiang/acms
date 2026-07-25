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

    // 渲染 UI
    w.$c.innerHTML =
      '<div class="oo-editor oo-editor-img" style="display:flex;flex-direction:column;height:100%">' +
        '<div class="oo-titlebar">' +
          '<span class="oo-titlebar-icon">🖼️</span>' +
          '<div class="oo-titlebar-name">' +
            '<input id="img-title-input" value="' + escHtml(fileName || '未命名.png') + '" placeholder="未命名.png" style="background:transparent;border:none;outline:none;font-size:13px;color:var(--text,#333)">' +
          '</div>' +
          '<div class="oo-titlebar-actions">' +
            '<button class="img-btn primary" id="img-save-btn" style="font-size:12px;padding:4px 12px;border:1px solid var(--office-primary,#446995);border-radius:3px;background:var(--office-primary,#446995);color:#fff;cursor:pointer">💾 保存</button>' +
          '</div>' +
        '</div>' +
        '<div class="code-menu-bar" style="display:flex;background:var(--bg2,#f0f0f0);border-bottom:1px solid var(--office-divider,#ddd);flex-shrink:0">' +
          '<div class="code-menu-item" data-menu="file" style="position:relative;padding:5px 16px;cursor:pointer;font-size:13px;user-select:none" onmouseenter="this.style.background=\'var(--office-tab-hover-bg,rgba(0,0,0,0.05))\'" onmouseleave="this.style.background=\'transparent\'">📄 文件' +
            '<div class="code-menu-dropdown" style="display:none;position:absolute;top:100%;left:0;z-index:9999;background:var(--bg,#fff);border:1px solid var(--office-divider,#ddd);border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,0.15);min-width:180px;padding:6px 0">' +
              '<div class="code-menu-dropdown-item" data-action="open-img">📂 打开图片</div>' +
              '<div class="code-menu-dropdown-item" data-action="save-img">💾 保存</div>' +
              '<div class="code-menu-divider" style="height:1px;background:var(--office-divider,#ddd);margin:4px 8px"></div>' +
              '<div class="code-menu-dropdown-item" data-action="reset-img">🔄 重置</div>' +
            '</div>' +
          '</div>' +
          '<div class="code-menu-item" data-menu="view" style="position:relative;padding:5px 16px;cursor:pointer;font-size:13px;user-select:none" onmouseenter="this.style.background=\'var(--office-tab-hover-bg,rgba(0,0,0,0.05))\'" onmouseleave="this.style.background=\'transparent\'">🔍 查看' +
            '<div class="code-menu-dropdown" style="display:none;position:absolute;top:100%;left:0;z-index:9999;background:var(--bg,#fff);border:1px solid var(--office-divider,#ddd);border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,0.15);min-width:160px;padding:6px 0">' +
              '<div class="code-menu-dropdown-item" data-action="zoom-in">🔍+ 放大</div>' +
              '<div class="code-menu-dropdown-item" data-action="zoom-out">🔍− 缩小</div>' +
              '<div class="code-menu-dropdown-item" data-action="zoom-fit">📐 适应窗口</div>' +
              '<div class="code-menu-dropdown-item" data-action="zoom-100">🔢 100%</div>' +
            '</div>' +
          '</div>' +
          '<div class="code-menu-item" data-menu="filter" style="position:relative;padding:5px 16px;cursor:pointer;font-size:13px;user-select:none" onmouseenter="this.style.background=\'var(--office-tab-hover-bg,rgba(0,0,0,0.05))\'" onmouseleave="this.style.background=\'transparent\'">🎨 滤镜' +
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
          '<div class="code-menu-item" data-menu="ai" style="position:relative;padding:5px 16px;cursor:pointer;font-size:13px;user-select:none" onmouseenter="this.style.background=\'var(--office-tab-hover-bg,rgba(0,0,0,0.05))\'" onmouseleave="this.style.background=\'transparent\';font-weight:600">🤖 AI' +
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
        var cpScript = document.createElement('script');
        cpScript.src = IMG_EDITOR_PATH + '/tui-color-picker.min.js';
        cpScript.onload = function () { loadMainEditor(src, callback); };
        cpScript.onerror = function () { mountEl.innerHTML = '<div style="padding:40px;text-align:center;color:#a00">❌ 颜色选择器加载失败</div>'; };
        document.head.appendChild(cpScript);
      } else {
        loadMainEditor(src, callback);
      }
    }

    function loadMainEditor(src, callback) {
      if (window.tui && window.tui.ImageEditor) {
        initEditor(src);
        if (callback) callback();
        return;
      }
      var script = document.createElement('script');
      script.src = IMG_EDITOR_PATH + '/tui-image-editor.min.js';
      script.onload = function () {
        initEditor(src);
        if (callback) callback();
      };
      script.onerror = function () {
        mountEl.innerHTML = '<div style="padding:40px;text-align:center;color:#a00">❌ 图片编辑器加载失败</div>';
      };
      document.head.appendChild(script);
    }

    function initEditor(src) {
      // 生成空白占位图 (避免 dataURL base64 解析失败)
      var canvas = document.createElement('canvas');
      canvas.width = 100; canvas.height = 80;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#2a2a3e';
      ctx.fillRect(0, 0, 100, 80);
      ctx.fillStyle = '#888';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('打开图片', 50, 45);
      var blankImg = canvas.toDataURL();
      canvas = null;

      imageEditor = new window.tui.ImageEditor(mountEl, {
        includeUI: {
          loadImage: { path: src || blankImg, name: 'image' },
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
    }

    // 默认加载空白图片供用户打开文件
    loadEditor(null);

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
              w.$c.querySelector('#img-title-input').value = file.name;
              if (imageEditor) {
                // 方法1: 直接传 File 对象 (避免 dataURL 体积过大)
                try {
                  imageEditor.loadImageFromFile(file).then(function () {
                    toast('已加载 ' + file.name, 'success');
                  }).catch(function (err) {
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
                      .then(function () { toast('已加载 ' + file.name, 'success'); })
                      .catch(function () { /* ignore */ });
                  }
                }, 200);
              }
            };
            input.click();
            break;
          case 'save-img':
            var dataURL = imageEditor.toDataURL();
            var name = (w.$c.querySelector('#img-title-input').value || '').trim() || 'image.png';
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

    // ─── 保存按钮 ───
    w.$c.querySelector('#img-save-btn').onclick = function () {
      if (!imageEditor) { toast('编辑器未就绪', 'warning'); return; }
      var dataURL = imageEditor.toDataURL();
      var name = (w.$c.querySelector('#img-title-input').value || '').trim() || 'image.png';
      // 始终下载到本地 (图片编辑器目前只支持打开本地文件)
      var link = document.createElement('a');
      link.href = dataURL;
      link.download = name;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      URL.revokeObjectURL(dataURL);
      toast('已下载 ' + name, 'success');
    };
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  root.openImageEditor = openImageEditor;
  root.ImageEditorApp = { open: openImageEditor };

})(window);
