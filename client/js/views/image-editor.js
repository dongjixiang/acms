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
          // v0.66 PR3: AI 助手 toggle 按钮（toolbar 右侧）
          '<div class="code-menu-item" data-action="toggle-ai-assistant" style="position:relative;padding:5px 16px;cursor:pointer;font-size:13px;user-select:none;font-weight:600;color:var(--accent,#0ea89d)">✨ AI 助手 <span id="ai-assistant-toggle-icon" style="font-size:10px;margin-left:4px">▼</span></div>' +
        '</div>' +
        '<div id="img-editor-mount" style="flex:1;min-height:0;overflow:auto;background:var(--bg,#1a1a2e)"></div>' +
        '<div id="img-ai-panel" style="display:none;flex-shrink:0;max-height:360px;overflow:auto;background:var(--bg2,#f5f5f7);border-top:1px solid var(--office-divider,#ddd);padding:8px;font-size:13px"></div>' +
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
      fetch(IMG_EDITOR_PATH + '/tui-image-editor.min.js').then(function(r){return r.text();}).then(function(code){
        // 保存原 define，临时屏蔽 Monaco loader 的 define
        var savedDefine = window.define;
        window.define = undefined;
        try { (new Function(code))(); } catch(e) { console.warn('[ImageEditor] main editor eval error:', e); }
        window.define = savedDefine;
        initEditor(src, callback);
      }).catch(function(){
        mountEl.innerHTML = '<div style="padding:40px;text-align:center;color:#a00">❌ 图片编辑器加载失败</div>';
      });
    }

    function initEditor(src, callback) {
      console.log('[IMG-INIT] initEditor called with src:', src ? src.slice(0, 80) : 'null/empty');
      if (!(window.tui && window.tui.ImageEditor)) {
        mountEl.innerHTML = '<div style="padding:40px;text-align:center;color:#a00">❌ tui.ImageEditor 未加载</div>';
        return;
      }
      try {
        // v0.63 修复：彩蛋黑底 + 灰白主题适配 dark theme
        var theme = (typeof getThemeMode === 'function') ? getThemeMode() : (document.documentElement.getAttribute('data-theme') || 'dark');
        var themeConfig = (theme === 'dark' || theme === 'cream') ? {
          'menu.backgroundColor': '#1a1a2e',
          'menu.color': '#e8e8e8',
          'menu.hoverBackgroundColor': '#252540',
          'menu.activeColor': '#5b8c5a',
          'menu.activeBackgroundColor': '#252540',
          'menu.borderColor': '#252540',
          'submenu.backgroundColor': '#1a1a2e',
          'submenu.color': '#e8e8e8',
          'submenu.hoverBackgroundColor': '#252540',
          'submenu.activeColor': '#5b8c5a',
          'submenu.activeBackgroundColor': '#252540',
          'submenu.borderColor': '#252540',
          'submenu.shadowColor': 'rgba(0,0,0,0.4)',
          'range.backgroundColor': '#252540',
          'range.color': '#e8e8e8',
          'range.borderColor': '#252540',
          'range.pointColor': '#5b8c5a',
          'range.disabled.pointColor': '#555',
          'range.barColor': '#5b8c5a',
          'range.disabled.barColor': '#555',
        } : {};

        imageEditor = new window.tui.ImageEditor(mountEl, {
          includeUI: {
            loadImage: { path: src || null, name: _currentFileName },
            theme: themeConfig,
            menu: ['resize', 'crop', 'flip', 'rotate', 'draw', 'shape', 'icon', 'text', 'mask', 'filter'],
            initMenu: 'filter',
            uiSize: { width: '100%', height: 'auto' },
            menuBarPosition: 'bottom',
          },
          cssMaxWidth: 700,
          cssMaxHeight: 500,
          selectionStyle: { cornerSize: 8, rotatingPointOffset: 20 }
        });

        // 默认激活 filter 菜单（让用户看到工具栏）
        setTimeout(function() {
          try { imageEditor.ui.activeMenuEvent(); } catch(e) { console.warn('[IMG-ERR] activeMenuEvent:', e); }
        }, 100);

        // 监听 tui 图片加载结果
        imageEditor.on('loadImage', function(result) {
          console.log('[IMG-LOADED] tui loadImage 完成:', result ? (result.newWidth+'x'+result.newHeight) : 'no result');
        });
        imageEditor.on('error', function(err) {
          console.warn('[IMG-ERR] tui error:', err && err.message ? err.message : err);
        });
      } catch (e) {
        console.error('[IMG-INIT-ERR]', e);
        mountEl.innerHTML = '<div style="padding:40px;text-align:center;color:#a00">❌ 编辑器初始化失败: ' + escHtml(e.message) + '</div>';
        return;
      }

      // 默认加载空白图片供用户打开文件
      var src = initialSrc || (window._dragImageUrl || null);
      console.log('[IMG-EDIT] initialSrc:', initialSrc ? initialSrc.slice(0, 80) : null, '_dragImageUrl:', window._dragImageUrl ? window._dragImageUrl.slice(0, 80) : null, '→ src:', src ? src.slice(0, 80) : null);
      if (src === window._dragImageUrl) { window._dragImageUrl = null; console.log('[IMG-EDIT] _dragImageUrl 已消费'); }
      loadEditor(src);

      // ─── 菜单事件 ───
      w.$c.querySelectorAll('.code-menu-item').forEach(function (item) {
        item.onclick = function (e) {
          e.stopPropagation();
          var menuName = item.dataset.menu;
          var action = item.dataset.action;
          // 切换 dropdown
          if (menuName) {
            var dropdown = item.querySelector('.code-menu-dropdown');
            var wasOpen = dropdown && dropdown.style.display !== 'none';
            w.$c.querySelectorAll('.code-menu-dropdown').forEach(function (d) { d.style.display = 'none'; });
            if (!wasOpen && dropdown) dropdown.style.display = 'block';
          } else if (action === 'toggle-ai-assistant') {
            // v0.66 PR3: 切换 AI 助手 panel
            window.imageAiAssistant.toggle(imageEditor, aiPanel, w);
          } else if (action) {
            // 关闭所有 dropdown
            w.$c.querySelectorAll('.code-menu-dropdown').forEach(function (d) { d.style.display = 'none'; });
            handleAction(action);
          }
        };
      });

      // 点击外部关闭 dropdown
      document.addEventListener('click', function closeDropdowns(e) {
        if (!w.$c.contains(e.target)) {
          w.$c.querySelectorAll('.code-menu-dropdown').forEach(function (d) { d.style.display = 'none'; });
        }
      });

      // ─── 操作路由 ───
      function handleAction(action) {
        switch (action) {
          case 'open-img': openFilePicker(); break;
          case 'save-img': saveCurrent(); break;
          case 'reset-img': resetImage(); break;
          case 'filter-grayscale': imageEditor.applyFilter('Grayscale'); break;
          case 'filter-sepia': imageEditor.applyFilter('Sepia'); break;
          case 'filter-invert': imageEditor.applyFilter('Invert'); break;
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
      }

      // ─── 文件操作 ───
      function openFilePicker() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = function() {
          if (input.files && input.files[0]) {
            var file = input.files[0];
            _currentFileName = file.name;
            if (window.ACMSWin && ACMSWin.setTitle) {
              ACMSWin.setTitle(w, _currentFileName);
            }
            var reader = new FileReader();
            reader.onload = function(ev) {
              if (imageEditor && typeof imageEditor.loadImageFromURL === 'function') {
                imageEditor.loadImageFromURL(ev.target.result);
              }
            };
            reader.readAsDataURL(file);
          }
        };
        input.click();
      }

      function saveCurrent() {
        if (!imageEditor) return;
        try {
          var dataURL = imageEditor.toDataURL();
          if (!dataURL) { toast('保存失败：未加载图片', 'error'); return; }
          var a = document.createElement('a');
          a.href = dataURL;
          a.download = _currentFileName;
          a.click();
          toast('💾 已下载 ' + _currentFileName, 'success');
        } catch (e) {
          toast('保存失败: ' + e.message, 'error');
        }
      }

      function resetImage() {
        if (!imageEditor) return;
        if (imageEditor.clearObjects) imageEditor.clearObjects();
        toast('🔄 已清除', 'success');
      }

      // ─── AI 描述（现有功能，保留）──
      function runAIDescribe() {
        if (!imageEditor) { toast('请先打开图片', 'error'); return; }
        var dataURL = imageEditor.toDataURL();
        aiPanel.style.display = 'block';
        aiPanel.innerHTML = '<div style="padding:4px;color:var(--text2,#888)">⏳ AI 正在分析图片...</div>';
        fetch('/api/chat/detect-and-respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: [{ type: 'text', text: '请用 50 字以内描述这张图片的内容和风格' }] }],
            images: [dataURL]
          })
        }).then(function(r){ return r.json(); }).then(function(data){
          var answer = (data && data.reply) || (data && data.aiReply) || (data && data.answer) || (data && data.content) || JSON.stringify(data);
          aiPanel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-weight:600">🤖 AI 描述</span><button style="padding:2px 8px;border:1px solid var(--office-divider,#ccc);border-radius:3px;cursor:pointer;font-size:11px;background:transparent" onclick="this.parentNode.parentNode.style.display=\'none\'">✕ 关闭</button></div><div style="color:var(--text,#333);line-height:1.6">' + escHtml(answer) + '</div>';
        }).catch(function (e) { aiPanel.innerHTML = '<div style="color:#a00">❌ ' + e.message + '</div>'; });
      }

      // ─── AI 增强（现有功能，保留）──
      function runAIEnhance() {
        if (!imageEditor) return;
        imageEditor.applyFilter('brightness', { brightness: 10 });
        setTimeout(function () {
          imageEditor.applyFilter('contrast', { contrast: 10 });
        }, 200);
        setTimeout(function () {
          imageEditor.applyFilter('saturation', { saturation: 10 });
          toast('✨ 已自动增强', 'success');
        }, 400);
      }

      if (typeof callback === 'function') callback();
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // v0.66 PR3: AI 修改助手 singleton（独立 IIFE，避免作用域混乱）
  // 通过 window.imageAiAssistant.toggle(imageEditor, aiPanel, w) 接入
  // ──────────────────────────────────────────────────────────────────
  (function() {
    var _open = false;
    var _mode = 'edit';      // 'generate' | 'edit' — 自动检测（有图就 edit）
    var _history = [];      // [{dataUrl, ts, label}] 限 10 条
    var _busy = false;
    var _currentResult = null;
    var HISTORY_MAX = 10;
    var _ctx = null;        // { imageEditor, aiPanel, w }

    function setStatus(panel, text, color) {
      var el = panel.querySelector('#ai-assistant-status');
      if (el) { el.textContent = text; if (color) el.style.color = color; }
    }

    function detectMode(imageEditor) {
      // 启发式：是否有 currentSrc / getImageName 返回非空
      try {
        if (imageEditor.getImageName && imageEditor.getImageName()) return 'edit';
      } catch (e) {}
      try {
        if (imageEditor.getCanvas) {
          var c = imageEditor.getCanvas();
          if (c && c.width > 0 && c.height > 0) return 'edit';
        }
      } catch (e) {}
      return 'generate';
    }

    function renderPanel() {
      if (!_ctx) return;
      var panel = _ctx.aiPanel;
      var editor = _ctx.imageEditor;

      if (!editor) {
        panel.innerHTML = '<div style="color:var(--text2,#888)">⚠️ 请先打开图片</div>';
        return;
      }

      _mode = detectMode(editor);
      var modeLabel = _mode === 'edit' ? '🖼️ 当前图改图' : '🎨 从头生成';
      var modeHint = _mode === 'edit' ? '输入修改意见（如"改成夜景"）' : '输入图片描述（如"一只橘猫在窗台"）';
      var placeholder = _mode === 'edit' ? '改成夜景 / 加个月亮 / 去背景电线' : '一只橘猫在窗台，阳光透过窗帘';

      panel.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<span style="font-weight:600">✨ AI 修改助手</span>' +
          '<div>' +
            '<span style="font-size:11px;padding:2px 8px;background:var(--accent,#0ea89d);color:#fff;border-radius:10px;margin-right:8px">' + modeLabel + '</span>' +
            '<button id="ai-assistant-close" style="padding:2px 8px;border:1px solid var(--office-divider,#ccc);border-radius:3px;cursor:pointer;font-size:11px;background:transparent">✕ 关闭</button>' +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:6px;font-size:11px;color:var(--text2,#888)">' + modeHint + '</div>' +
        '<textarea id="ai-assistant-prompt" placeholder="' + escHtml(placeholder) + '" style="width:100%;min-height:50px;padding:6px;border:1px solid var(--office-divider,#ccc);border-radius:4px;font-size:13px;font-family:inherit;box-sizing:border-box;resize:vertical"></textarea>' +
        '<div style="display:flex;gap:6px;margin-top:6px;align-items:center">' +
          '<button id="ai-assistant-generate" style="padding:5px 14px;background:var(--accent,#0ea89d);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600">✨ 重新生成</button>' +
          '<span id="ai-assistant-status" style="flex:1;font-size:11px;color:var(--text2,#888)">就绪</span>' +
          '<button id="ai-assistant-undo" style="padding:5px 10px;border:1px solid var(--office-divider,#ccc);border-radius:4px;cursor:pointer;font-size:12px;background:transparent" disabled>↩️ 撤销</button>' +
        '</div>' +
        '<div id="ai-assistant-candidates" style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap"></div>' +
        '<div id="ai-assistant-history" style="margin-top:10px;font-size:11px;color:var(--text2,#888)"></div>';

      // 事件绑定
      panel.querySelector('#ai-assistant-close').onclick = function() { window.imageAiAssistant.toggle(); };
      panel.querySelector('#ai-assistant-generate').onclick = runGenerate;
      panel.querySelector('#ai-assistant-undo').onclick = undoLast;
      updateUI();
    }

    function updateUI() {
      if (!_ctx) return;
      var panel = _ctx.aiPanel;
      var genBtn = panel.querySelector('#ai-assistant-generate');
      if (genBtn) {
        genBtn.disabled = _busy;
        genBtn.textContent = _busy ? '⏳ 生成中...' : '✨ 重新生成';
      }
      var undoBtn = panel.querySelector('#ai-assistant-undo');
      if (undoBtn) undoBtn.disabled = (_history.length === 0);
      // history 区
      var histEl = panel.querySelector('#ai-assistant-history');
      if (histEl) {
        if (_history.length === 0) {
          histEl.innerHTML = '📜 历史：' + (_busy ? '生成中...' : '空（点击"重新生成"开始）');
        } else {
          histEl.innerHTML = '📜 历史 (' + _history.length + '/' + HISTORY_MAX + ')：' +
            _history.map(function(h, i) {
              return '<img src="' + h.dataUrl + '" data-idx="' + i + '" title="' + escHtml(h.label || '') + ' · ' + new Date(h.ts).toLocaleTimeString() + '" style="width:48px;height:48px;object-fit:cover;border:1px solid var(--office-divider,#ccc);border-radius:3px;margin-right:4px;cursor:pointer;vertical-align:middle">';
            }).join('') +
            ' <span style="font-size:10px;color:var(--text2,#aaa)">点击缩略图回到那一步</span>';
          var imgs = histEl.querySelectorAll('img[data-idx]');
          Array.prototype.forEach.call(imgs, function(img) {
            img.onclick = function() { restoreAt(parseInt(img.getAttribute('data-idx'))); };
          });
        }
      }
    }

    function pushHistory(label) {
      if (!_ctx || !_ctx.imageEditor) return;
      var dataUrl = window.imageEditorAPI.saveCanvasSnapshot(_ctx.imageEditor);
      if (!dataUrl) return;
      _history.push({ dataUrl: dataUrl, ts: Date.now(), label: label });
      while (_history.length > HISTORY_MAX) _history.shift();
    }

    async function runGenerate() {
      if (_busy || !_ctx) return;
      var panel = _ctx.aiPanel;
      var promptEl = panel.querySelector('#ai-assistant-prompt');
      var prompt = promptEl ? promptEl.value.trim() : '';
      if (!prompt) { setStatus(panel, '⚠️ 请输入修改意见', '#c00'); return; }

      _busy = true;
      updateUI();
      setStatus(panel, '⏳ 生成中（Agnes API 调用 4 次）...', '#888');

      var dataUrl = null;
      if (_mode === 'edit' && _ctx.imageEditor) {
        dataUrl = window.imageEditorAPI.saveCanvasSnapshot(_ctx.imageEditor);
      }

      try {
        var result;
        if (dataUrl) {
          result = await window.imageEditorAPI.aiEdit(prompt, dataUrl, 4);
        } else {
          result = await window.imageEditorAPI.aiGenerate(prompt, 4);
        }
        if (!result || !result.ok) {
          setStatus(panel, '❌ 生成失败：' + (result && result.error ? result.error : 'unknown'), '#c00');
          return;
        }
        _currentResult = result;
        renderCandidates(result.options || []);
        setStatus(panel, '✅ 生成 ' + (result.options ? result.options.length : 0) + ' 张候选，点击应用', '#0a0');
      } catch (e) {
        setStatus(panel, '❌ 异常：' + e.message, '#c00');
      } finally {
        _busy = false;
        updateUI();
      }
    }

    function renderCandidates(options) {
      if (!_ctx) return;
      var el = _ctx.aiPanel.querySelector('#ai-assistant-candidates');
      if (!el) return;
      if (!options || options.length === 0) {
        el.innerHTML = '<div style="color:var(--text2,#888);font-size:11px">无候选</div>';
        return;
      }
      el.innerHTML = options.map(function(opt, i) {
        return '<div data-idx="' + i + '" style="position:relative;cursor:pointer;border:2px solid transparent;border-radius:4px;overflow:hidden;transition:border-color 0.15s" title="点击应用候选 ' + (i + 1) + '">' +
          '<img src="' + escHtml(opt.image_url_output) + '" style="width:96px;height:96px;object-fit:cover;display:block">' +
          '<span style="position:absolute;top:2px;left:4px;background:rgba(0,0,0,0.6);color:#fff;font-size:10px;padding:1px 5px;border-radius:3px">#' + (i + 1) + '</span>' +
        '</div>';
      }).join('');
      Array.prototype.forEach.call(el.querySelectorAll('[data-idx]'), function(node) {
        node.onclick = function() { applyCandidate(parseInt(node.getAttribute('data-idx'))); };
        node.onmouseenter = function() { node.style.borderColor = 'var(--accent,#0ea89d)'; };
        node.onmouseleave = function() { node.style.borderColor = 'transparent'; };
      });
    }

    function applyCandidate(idx) {
      if (!_ctx || !_currentResult || !_currentResult.options) return;
      var opt = _currentResult.options[idx];
      if (!opt) return;
      pushHistory('应用候选 #' + (idx + 1));
      // 加载候选图到画布（TOAST UI setImage 或 fallback canvas）
      var editor = _ctx.imageEditor;
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() {
        if (typeof editor.setImage === 'function') {
          editor.setImage(opt.image_url_output, opt.mime || 'image/png');
        } else if (typeof editor.loadImageFromURL === 'function') {
          editor.loadImageFromURL(opt.image_url_output);
        } else {
          var canvas = editor.getCanvas ? editor.getCanvas() : null;
          if (canvas) {
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
          }
        }
        setStatus(_ctx.aiPanel, '✅ 已应用候选 #' + (idx + 1) + '（' + escHtml(opt.asset_path || '') + '）', '#0a0');
      };
      img.onerror = function() {
        setStatus(_ctx.aiPanel, '❌ 候选图加载失败', '#c00');
      };
      img.src = opt.image_url_output;
    }

    async function undoLast() {
      if (_history.length === 0) return;
      var last = _history.pop();
      var ok = await window.imageEditorAPI.restoreCanvasSnapshot(_ctx.imageEditor, last.dataUrl);
      if (ok) {
        setStatus(_ctx.aiPanel, '↩️ 已撤销：' + escHtml(last.label || ''), '#888');
      } else {
        setStatus(_ctx.aiPanel, '❌ 撤销失败', '#c00');
      }
      updateUI();
    }

    async function restoreAt(idx) {
      if (idx < 0 || idx >= _history.length) return;
      var snap = _history[idx];
      var ok = await window.imageEditorAPI.restoreCanvasSnapshot(_ctx.imageEditor, snap.dataUrl);
      if (ok) {
        // 删掉 idx 之后的所有历史（回到 idx 之前的"当前"）
        _history = _history.slice(0, idx);
        setStatus(_ctx.aiPanel, '↩️ 已回到历史 #' + (idx + 1) + '：' + escHtml(snap.label || ''), '#888');
      } else {
        setStatus(_ctx.aiPanel, '❌ 还原失败', '#c00');
      }
      updateUI();
    }

    // 暴露 API
    window.imageAiAssistant = {
      toggle: function(imageEditor, aiPanel, w) {
        // v0.66 PR3 fix: null 保护（缺参数或空 panel 不 crash）
        if (!aiPanel) {
          console.warn('[imageAiAssistant] toggle: aiPanel is required');
          return;
        }
        _ctx = { imageEditor: imageEditor || (_ctx && _ctx.imageEditor), aiPanel: aiPanel, w: w || (_ctx && _ctx.w) };
        _open = !_open;
        if (_open) {
          aiPanel.style.display = 'block';
          renderPanel();
          var icon = w && w.$c && w.$c.querySelector('#ai-assistant-toggle-icon');
          if (icon) icon.textContent = '▲';
        } else {
          aiPanel.style.display = 'none';
          var icon2 = w && w.$c && w.$c.querySelector('#ai-assistant-toggle-icon');
          if (icon2) icon2.textContent = '▼';
        }
      },
      isOpen: function() { return _open; },
      getHistoryLength: function() { return _history.length; },
      // 测试用：暴露内部状态
      _state: function() { return { open: _open, mode: _mode, busy: _busy, historyCount: _history.length }; }
    };
  })();

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── v0.66 PR2: 暴露 imageEditorAPI 给小吉/chat 流调用 ───
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

    // v0.66 PR2: AI 文生图（无源图，直接生成）
    aiGenerate: function(prompt, count, opts) {
      opts = opts || {};
      if (!prompt) return Promise.resolve({ ok: false, error: 'INVALID_ARGS', message: '需要 prompt' });
      var n = Math.max(1, Math.min(6, parseInt(count) || 4));
      var projectSlug = opts.projectSlug || 'image-tools';
      var size = opts.size || '1024x1024';
      return fetch('/api/image-tools/ai-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': (window.AK || 'dev-key-001'),
          'Authorization': 'Bearer ' + (localStorage.getItem('acms-token') || ''),
        },
        body: JSON.stringify({ prompt: prompt, n: n, projectSlug: projectSlug, size: size }),
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(e) { throw new Error(e.message || ('HTTP_' + r.status)); });
        return r.json();
      }).catch(function(e) { return { ok: false, error: 'AI_GENERATE_FAILED', message: e.message }; });
    },

    // v0.66 PR2: AI 图生图（基于当前画布或传入的 referenceImage）
    aiEdit: function(prompt, sourceDataUrl, count, opts) {
      opts = opts || {};
      if (!prompt) return Promise.resolve({ ok: false, error: 'INVALID_ARGS', message: '需要 prompt' });
      if (!sourceDataUrl) return Promise.resolve({ ok: false, error: 'INVALID_ARGS', message: '需要 referenceImage (canvas dataUrl 或 http URL)' });
      var n = Math.max(1, Math.min(6, parseInt(count) || 4));
      var projectSlug = opts.projectSlug || 'image-tools';
      var size = opts.size || '1024x1024';
      return fetch('/api/image-tools/ai-edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': (window.AK || 'dev-key-001'),
          'Authorization': 'Bearer ' + (localStorage.getItem('acms-token') || ''),
        },
        body: JSON.stringify({
          prompt: prompt,
          referenceImage: sourceDataUrl,
          n: n,
          projectSlug: projectSlug,
          size: size,
        }),
      }).then(function(r) {
        if (!r.ok) return r.json().then(function(e) { throw new Error(e.message || ('HTTP_' + r.status)); });
        return r.json();
      }).catch(function(e) { return { ok: false, error: 'AI_EDIT_FAILED', message: e.message }; });
    },

    // v0.66 PR2: 保存当前画布快照
    saveCanvasSnapshot: function(canvasInst) {
      if (!canvasInst) return null;
      if (typeof canvasInst.getCanvas === 'function') {
        var c = canvasInst.getCanvas();
        if (c && typeof c.toDataURL === 'function') return c.toDataURL('image/png');
      }
      if (typeof canvasInst.toDataURL === 'function') return canvasInst.toDataURL('image/png');
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