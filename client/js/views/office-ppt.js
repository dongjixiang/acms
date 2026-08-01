// ACMS PPT 编辑器 — 依赖 office-common.js (escHtml, showCtxMenu)

// ===== PPT 编辑器（v0.62.3 状态栏 + 布局选择器）=====
// 新增：底部状态栏（当前 / 总页数）
// 新增：布局下拉（cover / content / blank）影响编辑区视觉
// 保留：缩略图侧边栏 / 标题+正文编辑 / +添加页 / 删除 / 保存
// 升级：showPrompt 替代 prompt()
// ACMS PPT 编辑器 v0.64 — 富文本编辑 + 字体格式
// 对标 OnlyOffice PPT Home tab 字体控制组
// 核心改进：contenteditable div + execCommand + HTML schema

function openPptEditor(w, fileId, fileName) {
  var _pptFileId = fileId || null;
  var _pptIsServerFile = !!fileId;
  var _savedFileId = null; // 保存后返回的 fileId

  // v0.64: schema 改为 HTML 内容（title 和 content 都存 innerHTML）
  var slides = [{
    title: '<h1 style="font-size:28px;color:#333">PPT 标题</h1>',
    content: '<p style="font-size:16px;color:#555">第一页正文</p><p style="font-size:16px;color:#555">支持<b>粗体</b>、<i>斜体</i>、<u>下划线</u></p><p style="font-size:16px;color:#555">- 项目 A</p><p style="font-size:16px;color:#555">- 项目 B</p>',
    layout: 'content',
    transition: { type: 'none', direction: 'from-right', duration: 500 },
    animations: []
  }];
  var cur = 0;

  // ─── HTML 内容兼容旧纯文本 schema ───
  function normalizeContent(raw) {
    if (typeof raw !== 'string') return '';
    // 已经是 HTML（含标签）→ 直接返回
    if (raw.indexOf('<') === 0 || raw.indexOf('&lt;') >= 0 || raw.indexOf('&amp;') >= 0) return raw;
    // 纯文本 → 转 HTML（保留换行，转义特殊字符）
    return raw.split('\n').map(function(line) {
      if (line.trim() === '') return '<p></p>';
      return '<p>' + escHtml(line) + '</p>';
    }).join('\n');
  }

  function loadPptFromServer() {
    if (!fileId) return;
    render();
    var loadEl = document.createElement('div');
    loadEl.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:14px';
    loadEl.textContent = '⏳ 正在加载 ' + (fileName || 'PPT') + '...';
    w.$c.querySelector('.oo-editor-pptx')?.replaceWith(loadEl);
    fetch('/api/office/load/' + encodeURIComponent(fileId))
      .then(function (r) { return r.json(); })
      .then(function (resp) {
        if (!resp.ok) {
          loadEl.innerHTML = '<div style="color:#a00">❌ 加载失败：' + (resp.error || '未知') + '</div>';
          return;
        }
        loadEl.remove();
        if (resp.text && resp.text.indexOf('SCHEMA:') === 0) {
          try {
            var schemaData = JSON.parse(resp.text.slice(7));
            if (schemaData.slides && Array.isArray(schemaData.slides)) {
              // 规范化内容：纯文本 → HTML
              slides = schemaData.slides.map(function(s) {
                return {
                  title: normalizeContent(s.title),
                  content: normalizeContent(s.content),
                  layout: s.layout || 'content',
                  transition: s.transition || { type: 'none', direction: 'from-right', duration: 500 },
                  animations: s.animations || []
                };
              });
              cur = 0;
              toast('已加载 ' + (fileName || 'PPT') + '（' + slides.length + ' 页）', 'success');
            }
          } catch (e) { /* 降级用默认 */ }
        }
        render();
      })
      .catch(function (e) {
        loadEl.innerHTML = '<div style="color:#a00">❌ 网络错误：' + e.message + '</div>';
      });
  }

  // ─── applyLayout：适配 contenteditable div ───
  function applyLayout(layout, titleEl, contentEl) {
    if (!titleEl || !contentEl) return;
    titleEl.style.cssText = 'width:100%;font-weight:600;border:none;outline:none;border-bottom:2px solid #e0e0e0;margin-bottom:16px;padding:8px 4px;background:transparent;font-family:inherit;min-height:40px';
    contentEl.style.cssText = 'width:100%;flex:1;min-height:200px;border:none;outline:none;font-size:15px;line-height:1.7;padding:8px 4px;background:transparent;resize:vertical;font-family:inherit;min-height:150px';
    if (layout === 'cover') {
      titleEl.style.cssText += 'font-size:36px;text-align:center;border-bottom:none;margin-bottom:8px;min-height:50px';
      contentEl.placeholder = '副标题（可选）';
    } else if (layout === 'blank') {
      titleEl.style.cssText += 'font-size:20px;border-bottom:none;margin-bottom:8px;min-height:30px';
      titleEl.style.display = 'none'; // 空白布局隐藏标题
      contentEl.placeholder = '正文或图片说明';
    } else { // content
      titleEl.style.cssText += 'font-size:22px;border-bottom:2px solid #e0e0e0;margin-bottom:16px;min-height:40px';
      titleEl.style.display = '';
      contentEl.placeholder = '正文内容（支持换行）';
    }
  }

  // ─── pptOps ───
  var pptOps = {
    addSlide: function () {
      slides.push({
        title: '<h1 style="font-size:28px;color:#333">新页面</h1>',
        content: '<p style="font-size:16px;color:#555">新页面正文</p>',
        layout: 'content',
        transition: { type: 'none', direction: 'from-right', duration: 500 },
        animations: []
      });
      cur = slides.length - 1;
      markPptDirty();
      render();
    },
    delSlide: function () {
      if (slides.length <= 1) { toast('至少保留一页', 'warning'); return; }
      slides.splice(cur, 1);
      if (cur >= slides.length) cur = slides.length - 1;
      markPptDirty();
      render();
    },
    setLayout: function (layout) {
      slides[cur].layout = layout;
      markPptDirty();
      var titleEl = w.$c.querySelector('#ppt-title');
      var contentEl = w.$c.querySelector('#ppt-content');
      if (titleEl && contentEl) applyLayout(layout, titleEl, contentEl);
      updateThumb();
      updateStatus();
      if (window._pptRibbon) {
        window._pptRibbon.setButtonActive('design', 'layout-' + layout, true);
        ['content','cover','blank'].forEach(function (l) {
          if (l !== layout) window._pptRibbon.setButtonActive('design', 'layout-' + l, false);
        });
      }
    },
    save: function () { savePpt(); },
    getCurrentTransition: function () {
      var s = slides[cur];
      return s.transition || { type: 'none', direction: 'from-right', duration: 500 };
    },
    setTransition: function (opts) {
      var s = slides[cur];
      if (!s.transition) s.transition = { type: 'none', direction: 'from-right', duration: 500 };
      if (opts.type) s.transition.type = opts.type;
      if (opts.direction) s.transition.direction = opts.direction;
      if (opts.duration) s.transition.duration = opts.duration;
      markPptDirty();
      if (window._pptRibbon) {
        ['none','fade','push','wipe','dissolve','zoom'].forEach(function(t){
          window._pptRibbon.setButtonActive('transit', 'transit-' + t, t === s.transition.type);
        });
        ['from-right','from-left','from-top','from-bottom'].forEach(function(d){
          window._pptRibbon.setButtonActive('transit', 'dir-' + d.replace('from-',''), d === s.transition.direction);
        });
        [{id:'dur-fast',v:300},{id:'dur-med',v:500},{id:'dur-slow',v:1000}].forEach(function(d){
          window._pptRibbon.setButtonActive('transit', d.id, d.v === s.transition.duration);
        });
      }
    },
    applyToAll: function () {
      var t = slides[cur].transition || { type: 'none', direction: 'from-right', duration: 500 };
      slides.forEach(function (s) { s.transition = JSON.parse(JSON.stringify(t)); });
      markPptDirty();
      if (typeof toast === 'function') toast('已应用到全部 ' + slides.length + ' 页', 'success');
    },
    // ─── Animations ───
    _animState: { target: 'title', type: 'fade', trigger: 'onClick', duration: 500 },
    _getAnim: function () {
      var s = slides[cur];
      if (!s.animations) s.animations = [];
      return s.animations;
    },
    setAnimTarget: function (target) {
      pptOps._animState.target = target;
      if (window._pptRibbon) {
        ['title','content'].forEach(function(t){ window._pptRibbon.setButtonActive('animate', 'anim-' + t, t === target); });
      }
    },
    setAnimEffect: function (type) {
      pptOps._animState.type = type;
      var anims = pptOps._getAnim();
      var target = pptOps._animState.target;
      var existing = null;
      anims.forEach(function(a){ if (a.target === target) existing = a; });
      if (existing) { existing.type = type; existing.duration = pptOps._animState.duration; existing.trigger = pptOps._animState.trigger; }
      else { anims.push({ target: target, type: type, trigger: pptOps._animState.trigger, duration: pptOps._animState.duration }); }
      markPptDirty();
      if (window._pptRibbon) {
        ['fade','fly-in','zoom','bounce'].forEach(function(t){ window._pptRibbon.setButtonActive('animate', 'anim-' + t, t === type); });
      }
      toast('动画已添加: ' + (target === 'title' ? '标题' : '正文') + ' → ' + type, 'info');
    },
    setAnimTrigger: function (trigger) {
      pptOps._animState.trigger = trigger;
      if (window._pptRibbon) {
        ['onClick','auto'].forEach(function(t){ window._pptRibbon.setButtonActive('animate', 'trig-' + t.replace('onClick','click').replace('auto','auto'), t === trigger); });
      }
    },
    setAnimDuration: function (duration) {
      pptOps._animState.duration = duration;
      var anims = pptOps._getAnim();
      anims.forEach(function(a){ if (a.target === pptOps._animState.target) a.duration = duration; });
      markPptDirty();
      if (window._pptRibbon) {
        [{id:'anim-dur-fast',v:300},{id:'anim-dur-med',v:500},{id:'anim-dur-slow',v:1000}].forEach(function(d){
          window._pptRibbon.setButtonActive('animate', d.id, d.v === duration);
        });
      }
    },
    startSlideshow: function () {
      var oldOverlay = document.getElementById('ppt-slideshow-overlay');
      if (oldOverlay) oldOverlay.parentNode.removeChild(oldOverlay);
      var overlay = document.createElement('div');
      overlay.id = 'ppt-slideshow-overlay';
      overlay.className = 'ppt-slideshow-overlay';
      document.body.appendChild(overlay);
      var slideIdx = cur;
      function renderSlide(idx) {
        var s = slides[idx];
        if (!s) return;
        var trans = s.transition || { type: 'none', direction: 'from-right', duration: 500 };
        var layoutClass = s.layout === 'cover' ? 'ppt-sls-cover' : (s.layout === 'blank' ? 'ppt-sls-blank' : 'ppt-sls-content');
        function animFor(target) {
          var a = (s.animations || []).find(function(x){ return x.target === target; });
          return a || { type: 'fade', duration: 500, trigger: 'onClick' };
        }
        var titleHtml = s.title ? '<div class="ppt-sls-title" style="animation:ppt-elem-' + (animFor('title').type) + ' ' + (animFor('title').duration) + 'ms ease">' + s.title + '</div>' : '';
        var contentHtml = s.content ? '<div class="ppt-slideshow-content" style="animation:ppt-elem-' + (animFor('content').type) + ' ' + (animFor('content').duration) + 'ms ease">' + s.content + '</div>' : '';
        overlay.innerHTML =
          '<div class="ppt-slideshow-slide ' + layoutClass + '" style="animation:ppt-trans-' + trans.type + ' ' + trans.duration + 'ms ease">' +
            '<div class="ppt-slideshow-slide-inner">' + titleHtml + contentHtml + '</div>' +
            '<div class="ppt-slideshow-nav">' +
              '<button id="ppt-sls-prev" class="ppt-sls-nav-btn" ' + (idx <= 0 ? 'disabled' : '') + '>\u25C0</button>' +
              '<span class="ppt-sls-page">' + (idx+1) + ' / ' + slides.length + '</span>' +
              '<button id="ppt-sls-next" class="ppt-sls-nav-btn" ' + (idx >= slides.length-1 ? 'disabled' : '') + '>\u25B6</button>' +
              '<button id="ppt-sls-close" class="ppt-sls-nav-btn" style="margin-left:auto">\u2715 \u9000\u51FA</button>' +
            '</div>' +
          '</div>';
        document.getElementById('ppt-sls-next').onclick = function () { slideIdx = Math.min(slideIdx+1, slides.length-1); renderSlide(slideIdx); };
        document.getElementById('ppt-sls-prev').onclick = function () { slideIdx = Math.max(slideIdx-1, 0); renderSlide(slideIdx); };
        document.getElementById('ppt-sls-close').onclick = function () {
          overlay.parentNode.removeChild(overlay);
          document.removeEventListener('keydown', onKey);
        };
      }
      function onKey(e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
          e.preventDefault(); slideIdx = Math.min(slideIdx+1, slides.length-1); renderSlide(slideIdx);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault(); slideIdx = Math.max(slideIdx-1, 0); renderSlide(slideIdx);
        } else if (e.key === 'Escape') {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          document.removeEventListener('keydown', onKey);
        }
      }
      document.addEventListener('keydown', onKey);
      renderSlide(slideIdx);
    },
    undo: function () { pptUndo(); },
    redo: function () { pptRedo(); },
    // ─── v0.64: 字体格式操作 ───
    execFormat: function (cmd, value) {
      document.execCommand(cmd, false, value || null);
      // 同步到 schema（contenteditable 的 input 事件已处理）
      syncCurrentSlide();
    },
    setFontSize: function (size) {
      document.execCommand('fontSize', false, size); // 1-7
      syncCurrentSlide();
    },
    setFontFamily: function (family) {
      document.execCommand('fontName', false, family);
      syncCurrentSlide();
    },
    setFontColor: function (color) {
      document.execCommand('foreColor', false, color);
      syncCurrentSlide();
    },
    setAlign: function (align) {
      var cmd = align === 'left' ? 'justifyLeft' : (align === 'center' ? 'justifyCenter' : (align === 'right' ? 'justifyRight' : 'justifyFull'));
      document.execCommand(cmd, false, null);
      syncCurrentSlide();
    },
    // 应用格式到选区（用于按钮激活状态同步）
    getSelectedFormat: function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) return {};
      var fmt = {};
      fmt.bold = document.queryCommandState('bold');
      fmt.italic = document.queryCommandState('italic');
      fmt.underline = document.queryCommandState('underline');
      var fontSize = document.queryCommandValue('fontSize');
      if (fontSize) fmt.fontSize = fontSize;
      var fontName = document.queryCommandValue('fontName');
      if (fontName) fmt.fontName = fontName.replace(/"/g, '');
      var foreColor = document.queryCommandValue('foreColor');
      if (foreColor) fmt.foreColor = foreColor;
      return fmt;
    }
  };

  function syncCurrentSlide() {
    var titleEl = w.$c.querySelector('#ppt-title');
    var contentEl = w.$c.querySelector('#ppt-content');
    if (titleEl) slides[cur].title = titleEl.innerHTML;
    if (contentEl) slides[cur].content = contentEl.innerHTML;
    updateThumb();
    markPptDirty();
  }

  function markPptDirty() {
    var dot = w.$c.querySelector('#ppt-modified-dot');
    if (dot) { dot.classList.add('is-dirty'); dot.classList.remove('is-saved'); dot.title = '已修改未保存'; }
  }

  // ─── Undo/Redo ───
  var pptUndoStack = [];
  var pptRedoStack = [];
  function pptSnapshot() { return JSON.parse(JSON.stringify({ slides: slides, cur: cur })); }
  function pptPushUndo() {
    pptUndoStack.push(pptSnapshot());
    if (pptUndoStack.length > 30) pptUndoStack.shift();
    pptRedoStack = [];
  }
  function pptRestoreState(s) {
    slides.length = 0;
    s.slides.forEach(function(sl){ slides.push(sl); });
    cur = s.cur;
    render();
  }
  function pptUndo() {
    if (pptUndoStack.length < 2) return;
    pptRedoStack.push(pptSnapshot());
    pptRestoreState(pptUndoStack[pptUndoStack.length - 1]);
    markPptDirty();
  }
  function pptRedo() {
    if (!pptRedoStack.length) return;
    pptUndoStack.push(pptSnapshot());
    var s = pptRedoStack.pop();
    pptRestoreState(s);
    markPptDirty();
  }

  if (fileId) {
    loadPptFromServer();
  } else {
    render();
  }

  // ─── render() ───
  function render() {
    var h = '<div class="oo-editor oo-editor-pptx" style="display:flex;flex-direction:column;height:100%">';
    // 标题栏
    h += '<div class="oo-titlebar">';
    h += '<span class="oo-titlebar-icon">\ud83d\udcfa</span>';
    h += '<div class="oo-titlebar-name">';
    h += '<input id="ppt-title-input" value="' + escHtml(fileName || '未命名.pptx') + '" placeholder="未命名.pptx">';
    h += '<span id="ppt-modified-dot" class="oo-modified-dot" title="未修改"></span>';
    h += '</div>';
    h += '<div class="oo-titlebar-actions">';
    h += '<button class="oo-titlebar-btn" id="ppt-download-btn" title="下载 .pptx 文件" style="display:none">\ud83d\udce5 下载</button>';
    h += '<button class="oo-titlebar-btn primary" id="ppt-save-btn">\ud83d\udcbe 保存</button>';
    h += '</div>';
    h += '</div>';
    // Ribbon
    h += '<div id="ppt-ribbon-host" style="flex-shrink:0"></div>';
    // 缩略图栏
    h += '<div id="ppt-thumbs" style="display:flex;gap:8px;padding:10px;background:var(--office-toolbar-bg);border-bottom:1px solid var(--office-divider);overflow-x:auto;flex-shrink:0">';
    slides.forEach(function(s, i) {
      var layoutTag = s.layout === 'cover' ? '\ud83d\udcc4' : (s.layout === 'blank' ? '\u2b1c' : '\ud83d\udcc3');
      var activeCls = i === cur ? ' is-active' : '';
      h += '<div class="ppt-thumb' + activeCls + '" data-i="' + i + '" draggable="true">';
      h += '<div class="ppt-thumb-icon">' + layoutTag + '</div>';
      h += '<div class="ppt-thumb-title">' + escHtml((s.title || '').replace(/<[^>]+>/g, '').slice(0, 10)) + '</div>';
      h += '<div class="ppt-thumb-page">' + (i+1) + '/' + slides.length + '</div>';
      h += '</div>';
    });
    h += '</div>';
    // 编辑区
    var s = slides[cur] || { title: '', content: '', layout: 'content' };
    h += '<div style="flex:1;padding:20px;overflow:auto;display:flex;justify-content:center">';
    h += '<div class="ppt-slide-paper" style="max-width:800px;width:100%;padding:40px;display:flex;flex-direction:column">';
    // v0.64: contenteditable div 替代 input/textarea
    h += '<div id="ppt-title" class="ppt-editor-content" contenteditable="true" style="width:100%;font-weight:600;border:none;outline:none;border-bottom:2px solid #e0e0e0;margin-bottom:16px;padding:8px 4px;background:transparent;font-family:inherit;min-height:40px">' + (s.title || '') + '</div>';
    h += '<div id="ppt-content" class="ppt-editor-content" contenteditable="true" style="width:100%;flex:1;min-height:250px;border:none;outline:none;font-size:15px;line-height:1.7;padding:8px 4px;background:transparent;resize:vertical;font-family:inherit">' + (s.content || '') + '</div>';
    h += '</div></div>';
    // 状态栏
    h += '<div id="ppt-status" class="oo-statusbar" style="justify-content:space-between">';
    h += '<span>第 ' + (cur+1) + ' / ' + slides.length + ' 页</span>';
    h += '<span>' + (s.layout === 'cover' ? '封面' : (s.layout === 'blank' ? '空白' : '内容页')) + ' 布局</span>';
    h += '</div>';
    h += '</div>';

    w.$c.innerHTML = h;

    // ─── v0.64: Ribbon（新增 Home tab 字体格式组）──
    if (window.ACMSRibbon) {
      window._pptRibbon = window.ACMSRibbon.create(w.$c.querySelector('#ppt-ribbon-host'), {
        tabs: [
          {
            id: 'home', label: '\ud83c\udfe0 Home',
            groups: [
              { title: '历史', buttons: [
                { id: 'undo', icon: '\u21a9', label: '撤销', action: pptOps.undo },
                { id: 'redo', icon: '\u21aa', label: '重做', action: pptOps.redo },
              ]},
              { title: '幻灯片', buttons: [
                { id: 'add-slide', icon: '\u2795', label: '添加', action: pptOps.addSlide },
                { id: 'del-slide', icon: '\u2796', label: '删除', action: pptOps.delSlide },
              ]},
              // v0.64: 字体格式组（对标 OO Home tab）
              { title: '字体', buttons: [
                { id: 'fmt-bold', icon: 'B', label: '粗体', large: true,
                  action: function(){ pptOps.execFormat('bold'); },
                  active: function(){ return document.queryCommandState('bold'); } },
                { id: 'fmt-italic', icon: 'I', label: '斜体', large: true,
                  action: function(){ pptOps.execFormat('italic'); },
                  active: function(){ return document.queryCommandState('italic'); } },
                { id: 'fmt-underline', icon: 'U', label: '下划线', large: true,
                  action: function(){ pptOps.execFormat('underline'); },
                  active: function(){ return document.queryCommandState('underline'); } },
              ]},
              { title: '字号', buttons: [
                { id: 'ppt-font-size', type: 'select', value: '3',
                  options: [
                    { value: '1', label: '10' }, { value: '2', label: '12' },
                    { value: '3', label: '14' }, { value: '4', label: '16' },
                    { value: '5', label: '18' }, { value: '6', label: '24' },
                    { value: '7', label: '32' }, { value: '8', label: '48' },
                  ],
                  action: function(val){ pptOps.setFontSize(val); } },
              ]},
              { title: '字体', buttons: [
                { id: 'ppt-font-family', type: 'select', value: 'sans',
                  options: [
                    { value: 'sans', label: 'Sans' },
                    { value: 'serif', label: 'Serif' },
                    { value: 'mono', label: 'Mono' },
                    { value: 'cn', label: '宋体' },
                  ],
                  action: function(val) {
                    var families = {
                      'sans': 'Arial, Helvetica, sans-serif',
                      'serif': 'Georgia, Times New Roman, serif',
                      'mono': 'Consolas, Monaco, monospace',
                      'cn': '宋体, SimSun, serif',
                    };
                    pptOps.setFontFamily(families[val] || 'sans');
                  } },
              ]},
              { title: '颜色', buttons: [
                { id: 'color-text', icon: '\ud83c\udfa8', label: '字体颜色',
                  action: function(){
                    var picker = document.createElement('input');
                    picker.type = 'color'; picker.value = '#000000';
                    picker.onchange = function(){ pptOps.setFontColor(this.value); };
                    picker.click();
                  } },
                { id: 'color-bg', icon: '\ud83d\udd8c', label: '背景颜色',
                  action: function(){
                    var picker = document.createElement('input');
                    picker.type = 'color'; picker.value = '#ffffff';
                    picker.onchange = function(){ pptOps.execFormat('hiliteColor', this.value); };
                    picker.click();
                  } },
              ]},
              { title: '对齐', buttons: [
                { id: 'align-left', icon: '\u250c', label: '左对齐', action: function(){ pptOps.setAlign('left'); } },
                { id: 'align-center', icon: '\u2500', label: '居中', action: function(){ pptOps.setAlign('center'); } },
                { id: 'align-right', icon: '\u2510', label: '右对齐', action: function(){ pptOps.setAlign('right'); } },
                { id: 'align-justify', icon: '\u2500', label: '两端对齐', action: function(){ pptOps.setAlign('justify'); } },
              ]},
            ],
          },
          {
            id: 'insert', label: '\u2795 Insert',
            groups: [
              { title: '插入', buttons: [
                { id: 'ins-text', icon: '📝', label: '文本框', action: function(){
                  slides[cur].content += (slides[cur].content ? '<p></p>' : '') + '<p>新文本框</p>';
                  markPptDirty();
                  render();
                  var contentEl = w.$c.querySelector('#ppt-content');
                  if (contentEl) { contentEl.focus(); }
                } },
                { id: 'ins-image', icon: '🖼️', label: '图片', action: function(){
                  var input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
                  input.onchange = function () {
                    var file = input.files && input.files[0];
                    if (!file) return;
                    var reader = new FileReader();
                    reader.onload = function (e) {
                      slides[cur].content += (slides[cur].content ? '<p></p>' : '') + '<img src="' + e.target.result + '" style="max-width:100%;height:auto">';
                      markPptDirty();
                      render();
                    };
                    reader.readAsDataURL(file);
                  };
                  input.click();
                } },
                { id: 'ins-line', icon: '─', label: '分隔线', action: function(){
                  slides[cur].content += '<hr style="border:none;border-top:1px solid #ccc;margin:16px 0">';
                  markPptDirty();
                  render();
                } },
                { id: 'ins-table', icon: '⊞', label: '表格', action: function(){
                  var ribbonHost = w.$c.querySelector('#ppt-ribbon-host');
                  if (window.ACMS && window.ACMS.TablePicker && ribbonHost) {
                    window.ACMS.TablePicker.create(ribbonHost.querySelector('[data-btn-id="ins-table"]'), function (rows, cols) {
                      var tableHtml = '<table style="border-collapse:collapse;width:100%;margin:12px 0">';
                      // 表头
                      tableHtml += '<thead><tr>';
                      for (var ci = 0; ci < cols; ci++) {
                        tableHtml += '<th style="border:1px solid #999;background:var(--office-accent-soft,#dde4ee);padding:8px;font-weight:600">列' + (ci + 1) + '</th>';
                      }
                      tableHtml += '</tr></thead>';
                      // 表体
                      tableHtml += '<tbody>';
                      for (var ri = 0; ri < rows; ri++) {
                        tableHtml += '<tr>';
                        for (var ci2 = 0; ci2 < cols; ci2++) {
                          tableHtml += '<td style="border:1px solid #ccc;padding:8px;min-width:80px"> </td>';
                        }
                        tableHtml += '</tr>';
                      }
                      tableHtml += '</tbody></table>';
                      slides[cur].content += (slides[cur].content ? '<p></p>' : '') + tableHtml;
                      markPptDirty();
                      render();
                      toast('已插入 ' + rows + '×' + cols + ' 表格', 'info');
                    });
                  } else {
                    // Fallback: 直接插入 3x3 表格
                    var tableHtml = '<table style="border-collapse:collapse;width:100%;margin:12px 0">';
                    tableHtml += '<thead><tr>';
                    for (var ci = 0; ci < 3; ci++) tableHtml += '<th style="border:1px solid #999;background:var(--office-accent-soft,#dde4ee);padding:8px;font-weight:600">列' + (ci + 1) + '</th>';
                    tableHtml += '</tr></thead><tbody>';
                    for (var ri = 0; ri < 3; ri++) {
                      tableHtml += '<tr>';
                      for (var ci2 = 0; ci2 < 3; ci2++) tableHtml += '<td style="border:1px solid #ccc;padding:8px;min-width:80px"> </td>';
                      tableHtml += '</tr>';
                    }
                    tableHtml += '</tbody></table>';
                    slides[cur].content += (slides[cur].content ? '<p></p>' : '') + tableHtml;
                    markPptDirty();
                    render();
                    toast('已插入 3×3 表格', 'info');
                  }
                } },
              ]},
            ],
          },
          {
            id: 'design', label: '\ud83c\udfa8 Design',
            groups: [
              { title: '布局', buttons: [
                { id: 'layout-content', icon: '\ud83d\udcc3', label: '内容', large: true,
                  action: function(){ pptOps.setLayout('content'); }, active: s.layout === 'content' },
                { id: 'layout-cover', icon: '\ud83d\udcc4', label: '封面', large: true,
                  action: function(){ pptOps.setLayout('cover'); }, active: s.layout === 'cover' },
                { id: 'layout-blank', icon: '\u2b1c', label: '空白', large: true,
                  action: function(){ pptOps.setLayout('blank'); }, active: s.layout === 'blank' },
              ]},
            ],
          },
          {
            id: 'transit', label: '\ud83c\udfac Transitions',
            groups: [
              { title: '效果', buttons: [
                { id: 'transit-none', icon: '\ud83d\udeab', label: '无', action: function(){ pptOps.setTransition({ type: 'none' }); } },
                { id: 'transit-fade', icon: '\ud83c\udf2b\ufe0f', label: '淡入', action: function(){ pptOps.setTransition({ type: 'fade' }); } },
                { id: 'transit-push', icon: '\ud83d\udc49', label: '推动', action: function(){ pptOps.setTransition({ type: 'push' }); } },
                { id: 'transit-wipe', icon: '\ud83e\uddf9', label: '擦除', action: function(){ pptOps.setTransition({ type: 'wipe' }); } },
                { id: 'transit-dissolve',icon: '\ud83d\udca7', label: '溶解', action: function(){ pptOps.setTransition({ type: 'dissolve' }); } },
                { id: 'transit-zoom', icon: '\ud83d\udd0d', label: '缩放', action: function(){ pptOps.setTransition({ type: 'zoom' }); } },
              ]},
              { title: '方向', buttons: [
                { id: 'dir-right', icon: '\u2192', label: '右', action: function(){ pptOps.setTransition({ direction: 'from-right' }); } },
                { id: 'dir-left', icon: '\u2190', label: '左', action: function(){ pptOps.setTransition({ direction: 'from-left' }); } },
                { id: 'dir-top', icon: '\u2191', label: '上', action: function(){ pptOps.setTransition({ direction: 'from-top' }); } },
                { id: 'dir-bottom',icon: '\u2193', label: '下', action: function(){ pptOps.setTransition({ direction: 'from-bottom' }); } },
              ]},
              { title: '时长', buttons: [
                { id: 'dur-fast', icon: '\u26a1', label: '快', action: function(){ pptOps.setTransition({ duration: 300 }); } },
                { id: 'dur-med', icon: '\u23f8\ufe0f', label: '中', action: function(){ pptOps.setTransition({ duration: 500 }); }, active: true },
                { id: 'dur-slow', icon: '\ud83d\udc22', label: '慢', action: function(){ pptOps.setTransition({ duration: 1000 }); } },
              ]},
              { title: '操作', buttons: [
                { id: 'apply-all', icon: '\ud83d\udccb', label: '应用到全部', action: pptOps.applyToAll },
                { id: 'slideshow', icon: '\u25b6\ufe0f', label: '开始放映', large: true, action: pptOps.startSlideshow },
              ]},
            ],
          },
          {
            id: 'animate', label: '\ud83d\udcab Animations',
            groups: [
              { title: '目标', buttons: [
                { id: 'anim-title', icon: '\ud83d\udcdd', label: '标题', action: function(){ pptOps.setAnimTarget('title'); } },
                { id: 'anim-content', icon: '\ud83d\udcc4', label: '正文', action: function(){ pptOps.setAnimTarget('content'); } },
              ]},
              { title: '效果', buttons: [
                { id: 'anim-fade', icon: '\ud83c\udf2b\ufe0f', label: '淡入', action: function(){ pptOps.setAnimEffect('fade'); } },
                { id: 'anim-fly', icon: '\u2708\ufe0f', label: '飞入', action: function(){ pptOps.setAnimEffect('fly-in'); } },
                { id: 'anim-zoom', icon: '\ud83d\udd0d', label: '缩放', action: function(){ pptOps.setAnimEffect('zoom'); } },
                { id: 'anim-bounce', icon: '\ud83d\udc51', label: '弹入', action: function(){ pptOps.setAnimEffect('bounce'); } },
              ]},
              { title: '触发', buttons: [
                { id: 'trig-click', icon: '\ud83d\udc46', label: '点击', action: function(){ pptOps.setAnimTrigger('onClick'); }, active: true },
                { id: 'trig-auto', icon: '\u23f5', label: '自动', action: function(){ pptOps.setAnimTrigger('auto'); } },
              ]},
              { title: '时长', buttons: [
                { id: 'anim-dur-fast', icon: '\u26a1', label: '快', action: function(){ pptOps.setAnimDuration(300); } },
                { id: 'anim-dur-med', icon: '\u23f8\ufe0f', label: '中', action: function(){ pptOps.setAnimDuration(500); }, active: true },
                { id: 'anim-dur-slow', icon: '\ud83d\udc22', label: '慢', action: function(){ pptOps.setAnimDuration(1000); } },
              ]},
            ],
          },
        ],
        active: 'home',
      });
    }

    // ─── v0.64: 编辑同步（contenteditable div）──
    var titleEl = w.$c.querySelector('#ppt-title');
    var contentEl = w.$c.querySelector('#ppt-content');
    applyLayout(s.layout, titleEl, contentEl);
    if (s.layout === 'blank') {
      titleEl.style.display = 'none';
    }
    // v0.64: input 事件同步到 schema
    titleEl.oninput = function() { slides[cur].title = this.innerHTML; updateThumb(); markPptDirty(); };
    contentEl.oninput = function() { slides[cur].content = this.innerHTML; markPptDirty(); };

    // ─── v0.66: 图片/表格 resize 机制 ───
    var _pptResizeState = null; // { wrap, target, handle, startX, startY, startW, startH, startLeft, startTop }

    function _pptDeselect() {
      if (!_pptResizeState) return;
      var wrap = _pptResizeState.wrap;
      if (!wrap || !wrap.parentNode) { _pptResizeState = null; return; }
      // unwrap: 把元素提出来，保留内联样式
      var el = wrap.firstChild;
      if (el) {
        // 保留 width/height 到元素自身 style
        var w = wrap.style.width;
        var h = wrap.style.height;
        if (w) el.style.width = w;
        if (h) el.style.height = h;
        wrap.parentNode.replaceChild(el, wrap);
      } else {
        wrap.remove();
      }
      _pptResizeState = null;
    }

    function _pptCreateWrap(el) {
      // 移除已有 wrap（如果重复点击）
      _pptDeselect();
      var wrap = document.createElement('div');
      wrap.className = 'ppt-obj-wrap';
      // 初始尺寸来自元素
      var ow = el.offsetWidth || 200;
      var oh = el.offsetHeight || 150;
      wrap.style.width = ow + 'px';
      wrap.style.height = oh + 'px';
      el.style.width = ow + 'px';
      el.style.height = oh + 'px';
      wrap.appendChild(el);
      // 8 个 resize handle
      ['nw','n','ne','e','se','s','sw','w'].forEach(function(dir) {
        var h = document.createElement('div');
        h.className = 'ppt-resize-handle h-' + dir;
        h.dataset.dir = dir;
        wrap.appendChild(h);
      });
      // 尺寸标签
      var label = document.createElement('div');
      label.className = 'ppt-size-label';
      label.textContent = ow + '×' + oh;
      wrap.appendChild(label);
      el.parentNode.replaceChild(wrap, el);
      _pptResizeState = { wrap: wrap, target: el, label: label, startX: 0, startY: 0, startW: ow, startH: oh };
    }

    if (contentEl) {
      contentEl.addEventListener('mousedown', function (e) {
        // 如果点的是 resize handle，不处理（让 handle 的 mousedown 处理）
        if (e.target.classList.contains('ppt-resize-handle')) return;
        // 如果点的是 wrap 内部但非 img/table，deselect
        var target = e.target;
        var isImg = target.tagName === 'IMG';
        var isTable = target.tagName === 'TABLE';
        // 检查是否在 wrap 内（但点的是 wrap 本身或文字）
        var wrap = target.closest('.ppt-obj-wrap');
        if (wrap) {
          // 点的是 wrap 内的文字区域 → deselect
          if (!isImg && !isTable) {
            _pptDeselect();
            return;
          }
        }
        if (isImg || isTable) {
          e.preventDefault();
          _pptCreateWrap(target);
        } else {
          _pptDeselect();
        }
      });

      // handle mousedown → 开始 resize
      contentEl.addEventListener('mousedown', function (e) {
        var handle = e.target.closest('.ppt-resize-handle');
        if (!handle || !_pptResizeState || _pptResizeState.wrap !== handle.closest('.ppt-obj-wrap')) return;
        e.preventDefault();
        e.stopPropagation();
        var s = _pptResizeState;
        var wrap = s.wrap;
        var el = s.target;
        var dir = handle.dataset.dir;
        var rect = wrap.getBoundingClientRect();
        s.startX = e.clientX;
        s.startY = e.clientY;
        s.startW = rect.width;
        s.startH = rect.height;
        s.startLeft = rect.left;
        s.startTop = rect.top;

        function onMove(ev) {
          ev.preventDefault();
          var dx = ev.clientX - s.startX;
          var dy = ev.clientY - s.startY;
          var newW = s.startW, newH = s.startH;
          if (dir.indexOf('e') !== -1) newW = Math.max(40, s.startW + dx);
          if (dir.indexOf('w') !== -1) { newW = Math.max(40, s.startW - dx); }
          if (dir.indexOf('s') !== -1) newH = Math.max(20, s.startH + dy);
          if (dir.indexOf('n') !== -1) { newH = Math.max(20, s.startH - dy); }
          wrap.style.width = newW + 'px';
          wrap.style.height = newH + 'px';
          el.style.width = newW + 'px';
          el.style.height = newH + 'px';
          s.label.textContent = Math.round(newW) + '×' + Math.round(newH);
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          markPptDirty();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      // 点击外部 → deselect
      document.addEventListener('mousedown', function (e) {
        if (!contentEl.contains(e.target) && !_pptResizeState) return;
        if (contentEl.contains(e.target)) return;
        _pptDeselect();
      });
    }
    // v0.64: 点击缩略图时同步当前 slide
    var dragSrcIdx = -1;
    w.$c.querySelectorAll('.ppt-thumb').forEach(function(el) {
      el.onclick = function() {
        if (titleEl) slides[cur].title = titleEl.innerHTML;
        if (contentEl) slides[cur].content = contentEl.innerHTML;
        cur = parseInt(this.dataset.i);
        render();
      };
      // 拖拽排序
      el.ondragstart = function (e) {
        dragSrcIdx = parseInt(this.dataset.i);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(dragSrcIdx));
        this.style.opacity = '0.4';
      };
      el.ondragend = function () {
        this.style.opacity = '';
        w.$c.querySelectorAll('.ppt-thumb').forEach(function(t){ t.style.borderColor = ''; });
      };
      el.ondragover = function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        w.$c.querySelectorAll('.ppt-thumb').forEach(function(t){ t.style.borderColor = ''; });
        this.style.borderColor = 'var(--office-primary, #446995)';
        this.style.borderWidth = '2px';
      };
      el.ondragleave = function () {
        this.style.borderColor = '';
      };
      el.ondrop = function (e) {
        e.preventDefault();
        var fromIdx = dragSrcIdx;
        var toIdx = parseInt(this.dataset.i);
        if (fromIdx === toIdx) return;
        var item = slides.splice(fromIdx, 1)[0];
        slides.splice(toIdx, 0, item);
        cur = toIdx;
        markPptDirty();
        render();
      };
      // 缩略图右键菜单
      el.oncontextmenu = function (e) {
        e.preventDefault();
        e.stopPropagation();
        var idx = parseInt(this.dataset.i);
        showCtxMenu([
          { label: '\u2795 \u65b0\u5efa\u5e7b\u706f\u7247', action: function () {
            slides.splice(idx + 1, 0, { title: '<h1 style="font-size:28px;color:#333">\u65b0\u9875\u9762</h1>', content: '<p>\u65b0\u9875\u9762\u6b63\u6587</p>', layout: 'content', transition: { type: 'none', direction: 'from-right', duration: 500 }, animations: [] });
            cur = idx + 1; markPptDirty(); render();
          }},
          { label: '\ud83d\udccb \u590d\u5236\u5e7b\u706f\u7247', action: function () {
            var copy = JSON.parse(JSON.stringify(slides[idx]));
            slides.splice(idx + 1, 0, copy);
            cur = idx + 1; markPptDirty(); render();
          }},
          { label: '\u2716 \u5220\u9664', action: function () {
            if (slides.length <= 1) return toast('\u81f3\u5c11\u4fdd\u7559\u4e00\u9875', 'warning');
            slides.splice(idx, 1);
            if (cur >= slides.length) cur = slides.length - 1;
            markPptDirty(); render();
          }},
          '-',
          { label: '\u53d6\u6d88', action: function () {} },
        ], e.clientX, e.clientY);
      };
    });

    function updateThumb() {
      var thumbs = w.$c.querySelectorAll('.ppt-thumb');
      if (thumbs[cur]) {
        var t = thumbs[cur].querySelector('div:nth-child(2)');
        if (t) t.textContent = (slides[cur].title || '').replace(/<[^>]+>/g, '').slice(0, 10);
      }
    }
    function updateStatus() {
      var bar = w.$c.querySelector('#ppt-status');
      if (!bar) return;
      var lbl = slides[cur].layout === 'cover' ? '\u5c01\u9762' : (slides[cur].layout === 'blank' ? '\u7a7a\u767d' : '\u5185\u5bb9\u9875');
      bar.innerHTML = '<span>\u7b2c ' + (cur+1) + ' / ' + slides.length + ' \u9875</span><span>' + lbl + ' \u5e03\u5c40</span>';
    }

    function savePpt() {
      // 保存前同步当前 slide 内容
      if (titleEl) slides[cur].title = titleEl.innerHTML;
      if (contentEl) slides[cur].content = contentEl.innerHTML;
      var currentName = (w.$c.querySelector('#ppt-title-input').value || '').trim() || '演示';
      var p;
      if (typeof showPrompt === 'function') {
        p = Promise.resolve(showPrompt({
          title: '保存 PPT 演示',
          message: '输入文件名（.pptx 后缀自动加）',
          defaultValue: currentName.replace(/\.pptx$/i, ''),
          multiline: false,
          minLength: 1,
        }));
      } else {
        p = Promise.resolve(prompt('文件名：', '演示.pptx') || '演示.pptx');
      }
      return p.then(function(name) {
        if (!name) return;
        name = String(name).trim();
        if (!name.toLowerCase().endsWith('.pptx')) name += '.pptx';
        return fetch('/api/office/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
          body: JSON.stringify({
            type: 'pptx',
            name: name,
            data: { title: name.replace(/\.pptx$/, ''), slides: slides },
            _schema: { type: 'pptx', name: name, data: { slides: slides } },
          }),
        }).then(function(r){ return r.json(); }).then(function(r){
          if (r.ok) {
            // 保存成功后记录 fileId，启用下载按钮
            _savedFileId = r.fileId;
            var dlBtn = w.$c.querySelector('#ppt-download-btn');
            if (dlBtn) dlBtn.style.display = '';
            toast('已保存 ✅ ' + name + ' (' + r.size + ' bytes)', 'success');
            var dot = w.$c.querySelector('#ppt-modified-dot');
            if (dot) { dot.classList.remove('is-dirty'); dot.classList.add('is-saved'); dot.title = '已保存'; setTimeout(function(){ dot.classList.remove('is-saved'); }, 1200); }
          }
          else toast('保存失败: ' + (r.error || '未知'), 'error');
        }).catch(function(e){ toast('保存失败: ' + e.message, 'error'); });
      });
    }

    // 下载 PPT 为 .pptx 文件
    function downloadPptx(name) {
      if (!name) name = (w.$c.querySelector('#ppt-title-input').value || '').trim() || '演示.pptx';
      if (!name.toLowerCase().endsWith('.pptx')) name += '.pptx';
      var url = '/api/office/download/' + encodeURIComponent(_savedFileId) + '/' + encodeURIComponent(name);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      toast('已下载 ' + name, 'success');
    }

    var saveBtn = w.$c.querySelector('#ppt-save-btn');
    if (saveBtn) saveBtn.onclick = function () { savePpt(); };
    var dlBtn = w.$c.querySelector('#ppt-download-btn');
    if (dlBtn) dlBtn.onclick = function () { downloadPptx(); };
  }

  setTimeout(function () { pptPushUndo(); }, 100);
  if (!fileId) render();
}

// ─── v0.64: 公式选择器函数库（学 OO FormulaDialog.js）───
var XLSX_FORMULAS = [
  // 数学
  { cat: '数学', fn: 'SUM', args: 'number1, [number2], ...', desc: '对所有参数求和' },
  { cat: '数学', fn: 'AVERAGE', args: 'number1, [number2], ...', desc: '计算平均值' },
  { cat: '数学', fn: 'COUNT', args: 'value1, [value2], ...', desc: '统计数字个数' },
  { cat: '数学', fn: 'COUNTA', args: 'value1, [value2], ...', desc: '统计非空单元格数' },
  { cat: '数学', fn: 'MAX', args: 'number1, [number2], ...', desc: '返回最大值' },
  { cat: '数学', fn: 'MIN', args: 'number1, [number2], ...', desc: '返回最小值' },
  { cat: '数学', fn: 'ROUND', args: 'number, decimals', desc: '四舍五入到指定位数' },
  { cat: '数学', fn: 'ABS', args: 'number', desc: '返回绝对值' },
  { cat: '数学', fn: 'SQRT', args: 'number', desc: '返回平方根' },
  { cat: '数学', fn: 'POWER', args: 'number, power', desc: '返回数字的幂' },
  // 逻辑
  { cat: '逻辑', fn: 'IF', args: 'condition, value_if_true, [value_if_false]', desc: '条件判断' },
  { cat: '逻辑', fn: 'AND', args: 'condition1, [condition2], ...', desc: '所有条件为真返回真' },
  { cat: '逻辑', fn: 'OR', args: 'condition1, [condition2], ...', desc: '任一条件为真返回真' },
  // 文本
  { cat: '文本', fn: 'LEFT', args: 'text, num_chars', desc: '从左侧提取字符' },
  { cat: '文本', fn: 'RIGHT', args: 'text, num_chars', desc: '从右侧提取字符' },
  { cat: '文本', fn: 'MID', args: 'text, start, num_chars', desc: '从中间提取字符' },
  { cat: '文本', fn: 'LEN', args: 'text', desc: '返回字符串长度' },
  { cat: '文本', fn: 'UPPER', args: 'text', desc: '转为大写' },
  { cat: '文本', fn: 'LOWER', args: 'text', desc: '转为小写' },
  { cat: '文本', fn: 'TRIM', args: 'text', desc: '去除首尾空格' },
  // 日期
  { cat: '日期', fn: 'TODAY', args: '', desc: '返回当前日期' },
  { cat: '日期', fn: 'NOW', args: '', desc: '返回当前日期时间' },
  { cat: '日期', fn: 'YEAR', args: 'serial_number', desc: '返回年份' },
  { cat: '日期', fn: 'MONTH', args: 'serial_number', desc: '返回月份' },
  { cat: '日期', fn: 'DAY', args: 'serial_number', desc: '返回日期' },
  // 统计
  { cat: '统计', fn: 'COUNTIF', args: 'range, criteria', desc: '条件计数' },
  { cat: '统计', fn: 'SUMIF', args: 'range, criteria, [sum_range]', desc: '条件求和' },
  { cat: '统计', fn: 'AVERAGEIF', args: 'range, criteria, [average_range]', desc: '条件平均值' },
  // 查找
  { cat: '查找', fn: 'VLOOKUP', args: 'lookup_value, table_array, col_index, [range_lookup]', desc: '垂直查找' },
  { cat: '查找', fn: 'HLOOKUP', args: 'lookup_value, table_array, row_index, [range_lookup]', desc: '水平查找' },
];
var XLSX_FORMULA_CATS = [];
(function() {
  var catMap = {};
  XLSX_FORMULAS.forEach(function(f) {
    if (!catMap[f.cat]) catMap[f.cat] = [];
    catMap[f.cat].push(f);
  });
  XLSX_FORMULA_CATS = Object.keys(catMap).map(function(c) { return { name: c, funcs: catMap[c] }; });
})();

function renderFormulaCategories(filter) {
  var catList = w.$c.querySelector('#xfd-category-list');
  var funcList = w.$c.querySelector('#xfd-function-list');
  if (!catList || !funcList) return;
  // 过滤函数
  var filtered = filter ? XLSX_FORMULAS.filter(function(f) {
    return f.fn.toLowerCase().indexOf(filter.toLowerCase()) !== -1 ||
           f.desc.indexOf(filter) !== -1;
  }) : XLSX_FORMULAS;
  // 按分类分组
  var catMap = {};
  filtered.forEach(function(f) {
    if (!catMap[f.cat]) catMap[f.cat] = [];
    catMap[f.cat].push(f);
  });
  var cats = Object.keys(catMap);
  // 渲染分类列表
  catList.innerHTML = cats.map(function(c, i) {
    return '<div class="xfd-category-item' + (i === 0 ? ' is-active' : '') + '" data-cat="' + c + '">' + c + '</div>';
  }).join('');
  // 默认选中第一个分类
  if (cats.length > 0) {
    renderFuncList(catMap[cats[0]], cats[0]);
  }
  // 分类点击
  catList.querySelectorAll('.xfd-category-item').forEach(function(el) {
    el.onclick = function() {
      catList.querySelectorAll('.xfd-category-item').forEach(function(e) { e.classList.remove('is-active'); });
      this.classList.add('is-active');
      renderFuncList(catMap[this.dataset.cat], this.dataset.cat);
    };
  });
  function renderFuncList(funcs, catName) {
    funcList.innerHTML = funcs.map(function(f, i) {
      return '<div class="xfd-func-item" data-fn="' + f.fn + '" data-args="' + f.args + '">' +
        '<div class="xfd-func-name">' + f.fn + '</div>' +
        '<div class="xfd-func-args">(' + f.args + ')</div>' +
        '<div class="xfd-func-desc">' + f.desc + '</div>' +
        '</div>';
    }).join('');
    funcList.querySelectorAll('.xfd-func-item').forEach(function(el) {
      el.onclick = function() {
        funcList.querySelectorAll('.xfd-func-item').forEach(function(e) { e.classList.remove('is-active'); });
        this.classList.add('is-active');
        var preview = w.$c.querySelector('#xfd-preview');
        if (preview) preview.textContent = this.dataset.fn + '(' + this.dataset.args + ') — ' + (XLSX_FORMULAS.find(function(f){return f.fn===this.dataset.fn;})||{}).desc || '';
      };
    });
  }
}

function filterFormulaFunctions(query) {
  renderFormulaCategories(query);
}

function insertFormulaWithArgs(fnName, args) {
  if (!sel.start) return toast('请先选中单元格', 'warning');
  var r = sel.start[0], c = sel.start[1];
  var formula = '=' + fnName + '(' + args + ')';
  data[r][c] = formula;
  markDirty();
  // 同步显示
  var cellEl = w.$c.querySelector('.xlsx-cell[data-r="' + r + '"][data-c="' + c + '"]');
  if (cellEl) cellEl.textContent = formula;
  updateFormulaBar();
  toast('已插入 ' + fnName, 'success');
}

// ─── 注册全局函数供 PKG 调用 =====
window.openWordEditor = openWordEditor;
window.openExcelEditor = openExcelEditor;
window.openPptEditor = openPptEditor;

