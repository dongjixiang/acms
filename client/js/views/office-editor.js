// ACMS Office 编辑器 — Word / Excel / PPT 统一前端
// 不依赖外部 CDN，纯原生实现

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ─── 右键菜单组件 (学 OO DocumentHolderExt 模式) ───
var activeCtxMenu = null;
function showCtxMenu(items, x, y) {
  if (activeCtxMenu) { document.body.removeChild(activeCtxMenu); activeCtxMenu = null; }
  var menu = document.createElement('div');
  menu.className = 'oo-ctx-menu';
  menu.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;z-index:99999;' +
    'background:var(--bg,#fff);border:1px solid var(--border,#ddd);border-radius:4px;' +
    'box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:4px 0;min-width:120px;';
  items.forEach(function (item) {
    if (item === '-') {
      menu.appendChild(document.createElement('hr'));
      return;
    }
    var btn = document.createElement('button');
    btn.textContent = item.label;
    btn.style.cssText = 'display:block;width:100%;padding:6px 16px;border:none;background:transparent;' +
      'text-align:left;font-size:13px;cursor:pointer;color:var(--text,#333);';
    btn.onmouseenter = function () { this.style.background = 'var(--office-tab-hover-bg,rgba(0,0,0,0.05))'; };
    btn.onmouseleave = function () { this.style.background = 'transparent'; };
    btn.onclick = function (e) {
      e.stopPropagation();
      item.action();
      if (activeCtxMenu) { document.body.removeChild(activeCtxMenu); activeCtxMenu = null; }
    };
    menu.appendChild(btn);
  });
  function closeMenu(e) {
    if (menu && !menu.contains(e.target)) {
      if (activeCtxMenu) { document.body.removeChild(activeCtxMenu); activeCtxMenu = null; }
      document.removeEventListener('mousedown', closeMenu);
    }
  }
  setTimeout(function () { document.addEventListener('mousedown', closeMenu); }, 0);
  document.body.appendChild(menu);
  activeCtxMenu = menu;
}
// 阻止浏览器默认右键菜单
document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

// ===== Word 编辑器（v0.62.5 OO 风格标题栏 + 块编辑器）=====
// 改用自研 office-doc-editor 替代 Quill
// 依赖：window.OfficeDoc + window.OfficeDocEditor（由 index.html 在 office-editor.js 之前加载）
// v0.62.4: 支持 (w, fileId, name) 加载现有 .docx
// v0.62.5: OO 风格标题栏（学 OO FileMenu.js 设计）— 文件名 + ●已修改点 + 右上角保存按钮
function openWordEditor(w, fileId, fileName) {
  console.log('[Word] openWordEditor called', { fileId, fileName });
  // 容器 = 整个 PKG 内容区，套 .oo-editor 类（让主题色生效）
  w.$c.innerHTML = '<div class="oo-editor oo-editor-word" style="height:100%;display:flex;flex-direction:column"></div>';
  var host = w.$c.querySelector('.oo-editor');

  // v0.62.5: instance 提到 closure 顶层（saveWordDoc + Ribbon 都要用）
  var instance = null;

  // OO 风格标题栏（学 OO FileMenu.js 模式：图标 + 文件名 + ●已修改点 + 右上角按钮）
  var titlebar = document.createElement('div');
  titlebar.className = 'oo-titlebar';
  var docTitle = fileName || '未命名.docx';
  titlebar.innerHTML =
    '<span class="oo-titlebar-icon">📝</span>' +
    '<div class="oo-titlebar-name">' +
      '<input id="word-title-input" value="' + escHtml(docTitle) + '" placeholder="未命名.docx">' +
      '<span id="word-modified-dot" class="oo-modified-dot" title="已修改未保存"></span>' +
    '</div>' +
    '<div class="oo-titlebar-actions">' +
      '<button class="oo-titlebar-btn" id="word-export-md-btn" title="导出 Markdown">📄 .md</button>' +
      '<button class="oo-titlebar-btn primary" id="word-save-btn">💾 保存</button>' +
    '</div>';
  host.appendChild(titlebar);

  // v0.62.6: SearchBar (学 OO SearchBar.js 260行 — 浮动查找/替换)
  var searchBar = document.createElement('div');
  searchBar.id = 'word-search-bar';
  searchBar.className = 'oo-searchbar';
  searchBar.style.display = 'none';
  searchBar.innerHTML =
    '<div class="oo-searchbar-inner">' +
      '<input id="ws-search-input" type="search" placeholder="查找..." autocomplete="off">' +
      '<span id="ws-search-count" class="oo-searchbar-count">0/0</span>' +
      '<button id="ws-search-prev" class="oo-searchbar-btn" title="上一个">\u25B2</button>' +
      '<button id="ws-search-next" class="oo-searchbar-btn" title="下一个">\u25BC</button>' +
      '<button id="ws-search-toggle-replace" class="oo-searchbar-btn" title="替换">\u21B5</button>' +
      '<button id="ws-search-close" class="oo-searchbar-btn" title="关闭 (Esc)">\u2715</button>' +
    '</div>' +
    '<div id="ws-replace-row" class="oo-searchbar-replace" style="display:none">' +
      '<input id="ws-replace-input" type="text" placeholder="替换为...">' +
      '<button id="ws-replace-one" class="oo-searchbar-btn">替换</button>' +
      '<button id="ws-replace-all" class="oo-searchbar-btn">全部替换</button>' +
    '</div>';
  host.appendChild(searchBar);

  // 搜索状态
  var searchState = { query: '', matches: [], currentIdx: -1, replaceMode: false };

  // ●已修改点控制函数（外部可调）
  function setDirty(isDirty) {
    var dot = host.querySelector('#word-modified-dot');
    if (!dot) return;
    if (isDirty === null) {
      dot.classList.remove('is-dirty');
      dot.classList.add('is-saved');
      dot.title = '已保存';
      setTimeout(function () { dot.classList.remove('is-saved'); }, 1200);
    } else if (isDirty) {
      dot.classList.add('is-dirty');
      dot.classList.remove('is-saved');
      dot.title = '已修改未保存';
    } else {
      dot.classList.remove('is-dirty', 'is-saved');
      dot.title = '未修改';
    }
  }
  // 标题输入框修改 → 立刻显示已修改点
  host.querySelector('#word-title-input').addEventListener('input', function () {
    setDirty(true);
  });

  // 编辑器 mount 区
  var editorHost = document.createElement('div');
  editorHost.id = 'word-editor-mount';
  editorHost.style.cssText = 'flex:1;min-height:0;overflow:auto;background:#fafaf6';
  host.appendChild(editorHost);

  // v0.62.5: Ribbon 挂载点（在 editorHost 之前）
  var ribbonHost = document.createElement('div');
  ribbonHost.id = 'word-ribbon-host';
  ribbonHost.style.cssText = 'flex-shrink:0';
  host.insertBefore(ribbonHost, editorHost);

  // v0.62.5 PR-W2.3: Word 状态栏 (页码 + 字数 + 缩放) — 学 OO statusbar.less
  var statusbarEl = document.createElement('div');
  statusbarEl.className = 'oo-statusbar';
  statusbarEl.id = 'word-statusbar';
  statusbarEl.style.cssText = 'justify-content:space-between; padding:4px 12px';
  statusbarEl.innerHTML =
    '<span style="display:flex;align-items:center;gap:16px">' +
      '<span id="ws-pages" title="页码">第 1 / 1 页</span>' +
      '<span id="ws-words" title="字数">0 字</span>' +
      '<span id="ws-blocks" title="块数">0 块</span>' +
    '</span>' +
    '<span style="display:flex;align-items:center;gap:6px">' +
      '<button id="ws-zoom-out" class="oo-statusbar-btn" title="缩小">−</button>' +
      '<input id="ws-zoom" class="oo-statusbar-namebox" type="number" min="50" max="200" value="100" title="缩放 (%)">' +
      '<span style="font-size:11px;color:var(--text2,#888)">%</span>' +
      '<button id="ws-zoom-in" class="oo-statusbar-btn" title="放大">+</button>' +
    '</span>';
  host.appendChild(statusbarEl);

  // 更新字数/块数 (从 instance.getDocument() 算)
  function updateWordStatusbar() {
    if (!instance) return;
    var doc = instance.getDocument();
    var blocks = doc.blocks || [];
    var wordCount = 0;
    blocks.forEach(function (b) {
      if (b.content) {
        // 简单字数统计: 中文字符按 1 字, 英文单词按空格分
        var s = b.content.replace(/\*\*|__|`/g, '');  // 去掉 markdown 符号
        // 中文字符数
        var cn = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
        // 英文单词数 (粗略)
        var en = (s.match(/[a-zA-Z]+/g) || []).length;
        wordCount += cn + en;
      }
    });
    var pagesEl = statusbarEl.querySelector('#ws-pages');
    var wordsEl = statusbarEl.querySelector('#ws-words');
    var blocksEl = statusbarEl.querySelector('#ws-blocks');
    if (pagesEl) pagesEl.textContent = '第 1 / 1 页';
    if (wordsEl) wordsEl.textContent = wordCount + ' 字';
    if (blocksEl) blocksEl.textContent = blocks.length + ' 块';
  }
  updateWordStatusbar();

  // 缩放按钮 (PR-W2.3 状态栏) — 改 editorHost 字体大小
  function setWordZoom(pct) {
    pct = Math.max(50, Math.min(200, parseInt(pct) || 100));
    var zoomEl = statusbarEl.querySelector('#ws-zoom');
    if (zoomEl) zoomEl.value = pct;
    if (editorHost) editorHost.style.fontSize = (15 * pct / 100) + 'px';
  }
  statusbarEl.querySelector('#ws-zoom-in').onclick = function () {
    var v = parseInt(statusbarEl.querySelector('#ws-zoom').value) || 100;
    setWordZoom(v + 10);
  };
  statusbarEl.querySelector('#ws-zoom-out').onclick = function () {
    var v = parseInt(statusbarEl.querySelector('#ws-zoom').value) || 100;
    setWordZoom(v - 10);
  };
  statusbarEl.querySelector('#ws-zoom').onchange = function () {
    setWordZoom(this.value);
  };
  // 把 updateWordStatusbar 挂到 instance.onChange (mountBlockEditor 已有 onChange)
  // 这里用一个 MutationObserver 监听 doc.blocks DOM 变化
  var statusObs = new MutationObserver(updateWordStatusbar);
  statusObs.observe(editorHost, { childList: true, subtree: true, characterData: true });

  // 检查依赖是否加载（office-doc.js + office-doc-converter.js 必须在 office-editor.js 之前）
  if (!window.OfficeDoc || !window.OfficeDocEditor) {
    editorHost.innerHTML = '<div style="padding:24px;color:#a00">❌ 块编辑器未加载<br><br>请确认 client/index.html 在 office-editor.js 之前加载了：<br><br>&lt;script src="/client/js/core/office-doc.js"&gt;&lt;/script&gt;<br>&lt;script src="/client/js/core/office-doc-converter.js"&gt;&lt;/script&gt;</div>';
    return;
  }

  // 初始化 doc（空或从 fileId 加载）
  var doc = window.OfficeDoc.makeDocument({ title: fileName || 'untitled' });
  if (fileId) {
    // 显示 loading
    editorHost.innerHTML = '<div style="padding:40px;text-align:center;color:#888">⏳ 正在加载 ' + fileName + '...</div>';
    fetch('/api/office/load/' + encodeURIComponent(fileId))
      .then(function (r) { return r.json(); })
      .then(function (resp) {
        editorHost.innerHTML = '';
        if (!resp.ok) {
          editorHost.innerHTML = '<div style="padding:24px;color:#a00">❌ 加载失败：' + (resp.error || '未知') + '<br>fileId: ' + fileId + '</div>';
          return;
        }
        // v0.62.4: 简单转换 — 把提取的纯文本按行拆 paragraph（不做复杂 block 映射）
        if (resp.text) {
          var lines = resp.text.split('\n').filter(function (l) { return l.trim(); });
          if (lines.length === 0) {
            doc.blocks.push(window.OfficeDoc.paragraph(''));
          } else {
            lines.forEach(function (line) {
              // 简单检测：# 开头 → heading
              var h = line.match(/^(#{1,6})\s+(.+)$/);
              if (h) {
                doc.blocks.push(window.OfficeDoc.heading(h[2], h[1].length));
              } else {
                doc.blocks.push(window.OfficeDoc.paragraph(line));
              }
            });
          }
        } else {
          doc.blocks.push(window.OfficeDoc.paragraph(''));
        }
        mountBlockEditor();
      })
      .catch(function (e) {
        editorHost.innerHTML = '<div style="padding:24px;color:#a00">❌ 网络错误：' + e.message + '</div>';
      });
  } else {
    mountBlockEditor();
  }

function mountBlockEditor() {
  console.log('[Word] mountBlockEditor called, OfficeDocEditor=', typeof window.OfficeDocEditor);
  // v0.62.2: 空 doc 自动加 1 个 paragraph（mountEditor 内部已处理）
    // v0.62.6: Undo/Redo stack (学 OO 的 asc_getCanUndo/Redo 模式)
    var undoStack = [];
    var redoStack = [];
    var undoMax = 50;
    var undoDebounce = null;
    var undoInitialPushed = false;
    function snapshotDoc() { return JSON.parse(JSON.stringify(instance.getDocument())); }
    function pushUndo() {
      if (!undoInitialPushed) { undoStack.push(snapshotDoc()); undoInitialPushed = true; }
      undoStack.push(snapshotDoc());
      if (undoStack.length > undoMax) undoStack.shift();
      redoStack = [];
      updateUndoButtons();
    }
    function undo() {
      if (undoStack.length < 2) return; // 至少保留初始状态
      redoStack.push(undoStack.pop());  // 当前状态进 redo
      var prev = undoStack[undoStack.length - 1]; // 上一个状态
      // 恢复 doc
      var doc = instance.getDocument();
      doc.blocks = prev.blocks;
      doc.meta = prev.meta;
      instance.rerender();
      setDirty(true);
      updateUndoButtons();
    }
    function redo() {
      if (!redoStack.length) return;
      undoStack.push(snapshotDoc()); // 当前状态进 undo
      var next = redoStack.pop();
      var doc = instance.getDocument();
      doc.blocks = next.blocks;
      doc.meta = next.meta;
      instance.rerender();
      setDirty(true);
      updateUndoButtons();
    }
    function updateUndoButtons() {
      if (window._wordRibbon) {
        window._wordRibbon.setButtonActive('home', 'undo', undoStack.length > 1);
        window._wordRibbon.setButtonActive('home', 'redo', redoStack.length > 0);
      }
    }

    instance = window.OfficeDocEditor.mountEditor(editorHost, doc, {
      onChange: function () {
        setDirty(true);
        if (undoDebounce) clearTimeout(undoDebounce);
        undoDebounce = setTimeout(function () { pushUndo(); }, 300);
      }
    });
    // 初始状态入栈
    setTimeout(function () { undoStack.push(snapshotDoc()); undoInitialPushed = true; }, 100);
    w._officeDocInstance = instance;

    // Ctrl+Z / Ctrl+Y
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) { redo(); return; }
        undo();
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        redo();
        e.preventDefault();
      }
    });

// v0.62.5: Word Ribbon 操作集合（学 OO FileMenu.js 的 Home/Insert/Format 结构）
    // PR-W2: 加 inline format toggle + block formatting setter
    var wordOps = {
      setType: function (type, attrs) {
        var cur = instance.getCurrentBlockId();
        if (cur) instance.changeBlockType(cur, type);
        else instance.addBlock(type, attrs || null);
      },
      insertAfter: function (type, attrs, content) {
        var cur = instance.getCurrentBlockId();
        instance.addBlock(type, attrs || null, content || '', cur);
      },
      deleteCurrent: function () {
        var cur = instance.getCurrentBlockId();
        if (!cur) return toast('请先把光标放在某个块里', 'warning');
        instance.deleteBlock(cur);
      },
      // PR-W2: inline 格式 (toggle **bold** 等)
      toggleInline: function (marker) {
        var cur = instance.getCurrentBlockId();
        if (!cur) return toast('请先把光标放在某个块里', 'warning');
        instance.toggleInlineFormat(cur, marker);
      },
      // PR-W2: 块级 formatting (对齐/字号/字体)
      setAlign: function (align) {
        var cur = instance.getCurrentBlockId();
        if (!cur) return toast('请先把光标放在某个块里', 'warning');
        instance.setBlockFormatting(cur, { align: align });
      },
      setFontSize: function (size) {
        var cur = instance.getCurrentBlockId();
        if (!cur) return;
        instance.setBlockFormatting(cur, { fontSize: size });
      },
      setFontFamily: function (family) {
        var cur = instance.getCurrentBlockId();
        if (!cur) return;
        instance.setBlockFormatting(cur, { fontFamily: family });
      },
      exportMd: function () {
        var d = instance.getDocument();
        var md = window.OfficeDocConverter.documentToMarkdown(d);
        var baseName = (titlebar.querySelector('#word-title-input').value || '未命名').replace(/\.docx$/i, '');
        var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = baseName + '.md';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('已导出 ' + baseName + '.md', 'success');
      },
      exportDocx: function () {
        if (typeof window.docx === 'undefined') {
          toast('docx 包未加载，降级为 .md', 'warning');
          return wordOps.exportMd();
        }
        var d = instance.getDocument();
        var p = window.OfficeDocConverter.blocksToDocxBuffer(d.blocks, window.docx);
        if (!p) { toast('导出失败', 'error'); return; }
        Promise.resolve(p).then(function (buf) {
          var baseName = (titlebar.querySelector('#word-title-input').value || '未命名').replace(/\.docx$/i, '');
          var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = baseName + '.docx';
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast('已导出 ' + baseName + '.docx', 'success');
        });
      },
      // v0.62.6: Undo/Redo
      undo: function () { undo(); },
      redo: function () { redo(); },
      // v0.62.7: Layout (学 OO Layout tab)
      setMargin: function (size) {
        var mount = editorHost.querySelector('.ode-editor-flow');
        if (!mount) return;
        var margins = { narrow: '24px 48px', normal: '40px 64px', moderate: '60px 80px', wide: '80px 120px' };
        mount.style.padding = margins[size] || margins.normal;
        if (window._wordRibbon) {
          Object.keys(margins).forEach(function(k){ window._wordRibbon.setButtonActive('layout', 'margin-' + k, k === size); });
        }
      },
      setOrientation: function (orient) {
        var mount = editorHost.querySelector('.ode-editor-flow');
        if (!mount) return;
        if (orient === 'landscape') { mount.style.maxWidth = '1100px'; }
        else { mount.style.maxWidth = '880px'; }
        if (window._wordRibbon) {
          ['portrait','landscape'].forEach(function(o){ window._wordRibbon.setButtonActive('layout', 'orient-' + o, o === orient); });
        }
      },
      insertPageBreak: function () {
        var mount = editorHost.querySelector('.ode-editor-flow');
        if (!mount) return;
        var pb = document.createElement('div');
        pb.className = 'ode-page-break';
        pb.innerHTML = '<hr style="border:none;border-top:1px dashed var(--office-divider,#ddd);margin:16px 0"><div style="text-align:center;font-size:11px;color:var(--text2,#999)">— 分页符 —</div>';
        // Insert at cursor position or append
        var sel = window.getSelection();
        if (sel.rangeCount) {
          var node = sel.getFocusNode();
          if (node && mount.contains(node)) {
            var block = node.closest('[data-bid]');
            if (block) {
              block.parentNode.insertBefore(pb, block.nextSibling);
              return;
            }
          }
        }
        mount.appendChild(pb);
      },
    };

    // v0.62.5: Ribbon 挂载 — 学 OO TabBar.js + FileMenu.js 的 Home/Insert/Format 结构
    if (window.ACMSRibbon) {
      window._wordRibbon = window.ACMSRibbon.create(w.$c.querySelector('#word-ribbon-host'), {
        tabs: [
          {
            id: 'home', label: '🏠 Home',
            groups: [
              { title: '历史', buttons: [
                { id: 'undo', icon: '↩', label: '撤销', action: wordOps.undo },
                { id: 'redo', icon: '↪', label: '重做', action: wordOps.redo },
              ]},
              { title: '格式', buttons: [
                { id: 'bold',      icon: 'B',   label: '粗体', action: function(){ wordOps.toggleInline('bold'); } },
                { id: 'italic',    icon: 'I',   label: '斜体', action: function(){ wordOps.toggleInline('italic'); } },
                { id: 'underline', icon: 'U',   label: '下划线', action: function(){ wordOps.toggleInline('underline'); } },
                { id: 'inline-code', icon: '</>', label: '代码', action: function(){ wordOps.toggleInline('code'); } },
              ]},
              { title: '字号', buttons: [
                { id: 'fs-12', icon: '12', label: '12', action: function(){ wordOps.setFontSize(12); } },
                { id: 'fs-14', icon: '14', label: '14', action: function(){ wordOps.setFontSize(14); } },
                { id: 'fs-16', icon: '16', label: '16', action: function(){ wordOps.setFontSize(16); } },
                { id: 'fs-18', icon: '18', label: '18', action: function(){ wordOps.setFontSize(18); } },
                { id: 'fs-24', icon: '24', label: '24', action: function(){ wordOps.setFontSize(24); } },
              ]},
              { title: '字体', buttons: [
                { id: 'ff-sans',  icon: 'Aa', label: 'Sans',  action: function(){ wordOps.setFontFamily('sans'); } },
                { id: 'ff-serif', icon: 'Aa', label: 'Serif', action: function(){ wordOps.setFontFamily('serif'); } },
                { id: 'ff-mono',  icon: 'Aa', label: 'Mono',  action: function(){ wordOps.setFontFamily('mono'); } },
              ]},
              { title: '对齐', buttons: [
                { id: 'align-left',    icon: '⬅', label: '左',   action: function(){ wordOps.setAlign('left'); } },
                { id: 'align-center',  icon: '↔', label: '中',   action: function(){ wordOps.setAlign('center'); } },
                { id: 'align-right',   icon: '➡', label: '右',   action: function(){ wordOps.setAlign('right'); } },
                { id: 'align-justify', icon: '☰', label: '两端', action: function(){ wordOps.setAlign('justify'); } },
              ]},
              { title: '样式', buttons: [
                { id: 'h1',     icon: 'H1',     label: '标题1',  action: function(){ wordOps.setType('heading', {level:1}); } },
                { id: 'h2',     icon: 'H2',     label: '标题2',  action: function(){ wordOps.setType('heading', {level:2}); } },
                { id: 'h3',     icon: 'H3',     label: '标题3',  action: function(){ wordOps.setType('heading', {level:3}); } },
                { id: 'para',   icon: '¶',      label: '正文',   action: function(){ wordOps.setType('paragraph'); } },
                { id: 'quote',  icon: '❝',      label: '引用',   action: function(){ wordOps.setType('quote'); } },
                { id: 'code',   icon: '</>',    label: '代码',   action: function(){ wordOps.setType('code'); } },
              ]},
              { title: '列表', buttons: [
                { id: 'bullet',  icon: '•',   label: '项目',   action: function(){ wordOps.setType('bulletList'); } },
                { id: 'ordered', icon: '1.',  label: '编号',   action: function(){ wordOps.setType('orderedList'); } },
                { id: 'todo',    icon: '☑',   label: '待办',   action: function(){ wordOps.setType('todo'); } },
              ]},
              { title: '元素', buttons: [
                { id: 'divider', icon: '─',  label: '分割线', action: function(){ wordOps.insertAfter('divider'); } },
              ]},
              { title: '保存', buttons: [
                { id: 'save', icon: '💾', label: '保存', large: true, action: function(){ saveWordDoc(); } },
              ]},
            ],
          },
          {
            id: 'insert', label: '➕ Insert',
            groups: [
              { title: '媒体', buttons: [
                { id: 'image', icon: '🖼️', label: '图片', action: function(){
                  var input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
                  input.onchange = function () {
                    var file = input.files && input.files[0];
                    if (!file) return;
                    var reader = new FileReader();
                    reader.onload = function (e) {
                      wordOps.insertAfter('image', { src: e.target.result, alt: file.name });
                    };
                    reader.readAsDataURL(file);
                  };
                  input.click();
                }},
              ]},
              { title: '表格', buttons: [
                { id: 'table', icon: '⊞', label: '表格', action: function(){
                  if (window.ACMS && window.ACMS.TablePicker) {
                    window.ACMS.TablePicker.create(ribbonHost.querySelector('[data-btn-id="table"]'), function (rows, cols) {
                      var headers = [];
                      for (var ci = 0; ci < cols; ci++) headers.push('列' + (ci + 1));
                      var rowsData = [];
                      for (var ri = 0; ri < rows; ri++) {
                        var row = [];
                        for (var ci2 = 0; ci2 < cols; ci2++) row.push('');
                        rowsData.push(row);
                      }
                      wordOps.insertAfter('table', { headers: headers, rows: rowsData }, '');
                      toast('已插入 ' + rows + '×' + cols + ' 表格（双击单元格编辑）', 'info');
                    });
                  } else {
                    wordOps.insertAfter('table', {}, '');
                    toast('表格已插入（双击单元格编辑）', 'info');
                  }
                }},
              ]},
            ],
          },
          {
            id: 'layout', label: '📐 Layout',
            groups: [
              { title: '边距', buttons: [
                { id: 'margin-normal',  icon: '📄', label: '普通', action: function(){ wordOps.setMargin('normal'); } },
                { id: 'margin-narrow',  icon: '📃', label: '窄',   action: function(){ wordOps.setMargin('narrow'); } },
                { id: 'margin-wide',    icon: '📑', label: '宽',   action: function(){ wordOps.setMargin('wide'); } },
              ]},
              { title: '方向', buttons: [
                { id: 'orient-portrait',  icon: '📄', label: '纵向', action: function(){ wordOps.setOrientation('portrait'); } },
                { id: 'orient-landscape', icon: '📁', label: '横向', action: function(){ wordOps.setOrientation('landscape'); } },
              ]},
              { title: '分页', buttons: [
                { id: 'page-break', icon: '➖', label: '分页符', action: wordOps.insertPageBreak },
              ]},
            ],
          },
          {
            id: 'format', label: '📤 Format',
            groups: [
              { title: '导出', buttons: [
                { id: 'export-md',   icon: '📄', label: '.md',   large: true, action: wordOps.exportMd },
                { id: 'export-docx', icon: '📘', label: '.docx', large: true, action: wordOps.exportDocx },
              ]},
              { title: '操作', buttons: [
                { id: 'del-block', icon: '🗑', label: '删块', action: wordOps.deleteCurrent },
              ]},
            ],
          },
        ],
        active: 'home',
      });
    }
  }

  // v0.62.5: Word 保存函数（Ribbon "保存" 按钮 + 标题栏 "保存" 按钮共用）
  function saveWordDoc() {
    if (typeof showPrompt !== 'function') {
      toast('showPrompt 未加载，无法输入文件名', 'error');
      return Promise.resolve();
    }
    var currentName = (titlebar.querySelector('#word-title-input').value || '').trim() || '文档';
    return Promise.resolve(showPrompt({
      title: '保存 Word 文档',
      message: '输入文件名（.docx 后缀自动加）',
      placeholder: '文档',
      defaultValue: currentName.replace(/\.docx$/i, ''),
      multiline: false,
      minLength: 1,
    })).then(function (name) {
      if (!name) return;
      name = String(name).trim();
      if (!name.toLowerCase().endsWith('.docx')) name += '.docx';
      var d = instance.getDocument();
      var payload = {
        type: 'docx',
        name: name,
        data: {
          title: d.meta.title,
          blocks: d.blocks,
          content: window.OfficeDocConverter.documentToMarkdown(d),
        }
      };
      return fetch('/api/office/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
        body: JSON.stringify(payload),
      }).then(function (r) { return r.json(); }).then(function (r) {
        if (r.ok) { toast('已保存 ✅ ' + name + ' (' + r.size + ' bytes)', 'success'); setDirty(null); }
        else toast('保存失败: ' + (r.error || '未知错误'), 'error');
      }).catch(function (e) { toast('保存失败: ' + e.message, 'error'); });
    });
  }

  // 保存按钮：showPrompt 拿文件名（避免 browser dialog），send blocks 到 /api/office/save
  titlebar.querySelector('#word-save-btn').onclick = async function() {
    if (typeof showPrompt !== 'function') {
      toast('showPrompt 未加载，无法输入文件名', 'error');
      return;
    }
    // v0.62.5: 用标题输入框当前值作为默认文件名（OO 模式：标题即文件名）
    var currentName = (titlebar.querySelector('#word-title-input').value || '').trim() || '文档';
    var name = await showPrompt({
      title: '保存 Word 文档',
      message: '输入文件名（.docx 后缀自动加）',
      placeholder: '文档',
      defaultValue: currentName.replace(/\.docx$/i, ''),
      multiline: false,
      minLength: 1,
    });
    if (!name) return; // 用户取消
    name = String(name).trim();
    if (!name.toLowerCase().endsWith('.docx')) name += '.docx';

    var d = instance.getDocument();
    var payload = {
      type: 'docx',
      name: name,
      data: {
        title: d.meta.title,
        blocks: d.blocks,
        // 兼容旧 payload 字段（如果服务端兼容检查用）
        content: window.OfficeDocConverter.documentToMarkdown(d),
      }
    };
    fetch('/api/office/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify(payload),
    })
    .then(function(r){return r.json()})
    .then(function(r){
      if (r.ok) { toast('已保存 ✅ ' + name + ' (' + r.size + ' bytes)', 'success'); setDirty(null); /* 显示已保存点 */ }
      else toast('保存失败: ' + (r.error || '未知错误'), 'error');
    })
    .catch(function(e){ toast('保存失败: ' + e.message, 'error'); });
  };

  // v0.62.5: 导出 Markdown 按钮（学 OO FileMenu "Download as"）
  titlebar.querySelector('#word-export-md-btn').onclick = function () {
    var d = instance.getDocument();
    var md = window.OfficeDocConverter.documentToMarkdown(d);
    var baseName = (titlebar.querySelector('#word-title-input').value || '未命名').replace(/\.docx$/i, '');
    var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = baseName + '.md';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('已导出 ' + baseName + '.md', 'success');
  };

  // ─── SearchBar 逻辑 (学 OO SearchBar.js 浮动查找/替换) ───
  function wordSearchFindAll(query) {
    if (!query || !instance) return [];
    var doc = instance.getDocument();
    if (!doc || !doc.blocks) return [];
    var matches = [];
    doc.blocks.forEach(function (block, idx) {
      if (!block.content) return;
      var re;
      try { re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); }
      catch(e) { return; }
      var m;
      while ((m = re.exec(block.content)) !== null) {
        matches.push({ blockIdx: idx, blockId: block.id, start: m.index, end: m.index + m[0].length, text: m[0] });
      }
    });
    return matches;
  }

  function wordSearchNavigate(idx) {
    if (!searchState.matches.length) return;
    idx = Math.max(0, Math.min(idx, searchState.matches.length - 1));
    searchState.currentIdx = idx;
    var match = searchState.matches[idx];
    // 高亮所有匹配
    var mount = editorHost.querySelector('.ode-editor-flow');
    if (!mount) return;
    var blocks = mount.querySelectorAll('[data-bid]');
    blocks.forEach(function (el, bi) {
      var contentEl = el.querySelector('.ode-ce');
      if (!contentEl) return;
      var blockData = searchState.matches.filter(function(m){ return m.blockIdx === bi; });
      if (blockData.length && bi === match.blockIdx) {
        // 当前匹配 — 高亮并滚动
        el.style.background = 'rgba(255, 200, 0, 0.25)';
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        contentEl.focus();
      } else if (blockData.length) {
        el.style.background = 'rgba(255, 230, 100, 0.12)';
      } else {
        el.style.background = '';
      }
    });
    var countEl = host.querySelector('#ws-search-count');
    if (countEl) countEl.textContent = (idx + 1) + '/' + searchState.matches.length;
  }

  function wordSearchReplace(newText) {
    if (!searchState.matches.length || searchState.currentIdx < 0) return;
    var match = searchState.matches[searchState.currentIdx];
    var doc = instance.getDocument();
    if (!doc || !doc.blocks[match.blockIdx]) return;
    var oldContent = doc.blocks[match.blockIdx].content;
    var before = oldContent.slice(0, match.start);
    var after = oldContent.slice(match.end);
    doc.blocks[match.blockIdx].content = before + newText + after;
    instance.rerender();
    // 更新匹配列表
    searchState.matches = wordSearchFindAll(searchState.query);
    searchState.currentIdx = Math.min(searchState.currentIdx, searchState.matches.length - 1);
    // 跳到下一个
    if (searchState.matches.length) wordSearchNavigate(searchState.currentIdx);
    var countEl = host.querySelector('#ws-search-count');
    if (countEl) countEl.textContent = (searchState.matches.length > 0 ? (searchState.currentIdx + 1) : 0) + '/' + searchState.matches.length;
    setDirty(true);
  }

  function wordSearchReplaceAll(newText) {
    if (!searchState.matches.length) return;
    var doc = instance.getDocument();
    if (!doc || !doc.blocks) return;
    // 从后往前替换，避免 offset 漂移
    var sorted = searchState.matches.slice().sort(function (a, b) { return b.start - a.start; });
    sorted.forEach(function (m) {
      if (doc.blocks[m.blockIdx]) {
        var before = doc.blocks[m.blockIdx].content.slice(0, m.start);
        var after = doc.blocks[m.blockIdx].content.slice(m.end);
        doc.blocks[m.blockIdx].content = before + newText + after;
      }
    });
    instance.rerender();
    searchState.query = '';
    searchState.matches = [];
    searchState.currentIdx = -1;
    var countEl = host.querySelector('#ws-search-count');
    if (countEl) countEl.textContent = '0/0';
    // 清除高亮
    var mount = editorHost.querySelector('.ode-editor-flow');
    if (mount) mount.querySelectorAll('[data-bid]').forEach(function(el){ el.style.background = ''; });
    setDirty(true);
    toast('已替换 ' + sorted.length + ' 处', 'success');
  }

  // 绑定 SearchBar 事件
  setTimeout(function () {
    var searchInput = host.querySelector('#ws-search-input');
    if (!searchInput) return;
    var replaceInput = host.querySelector('#ws-replace-input');

    searchInput.oninput = function () {
      var q = this.value.trim();
      searchState.query = q;
      if (!q) {
        searchState.matches = [];
        searchState.currentIdx = -1;
        var countEl = host.querySelector('#ws-search-count');
        if (countEl) countEl.textContent = '0/0';
        var mount = editorHost.querySelector('.ode-editor-flow');
        if (mount) mount.querySelectorAll('[data-bid]').forEach(function(el){ el.style.background = ''; });
        return;
      }
      searchState.matches = wordSearchFindAll(q);
      if (searchState.matches.length) {
        wordSearchNavigate(0);
      } else {
        var countEl = host.querySelector('#ws-search-count');
        if (countEl) countEl.textContent = '0/0';
      }
    };

    host.querySelector('#ws-search-next').onclick = function () {
      if (searchState.matches.length) wordSearchNavigate(searchState.currentIdx + 1);
    };
    host.querySelector('#ws-search-prev').onclick = function () {
      if (searchState.matches.length) wordSearchNavigate(searchState.currentIdx - 1);
    };
    host.querySelector('#ws-search-close').onclick = function () {
      searchBar.style.display = 'none';
      var mount = editorHost.querySelector('.ode-editor-flow');
      if (mount) mount.querySelectorAll('[data-bid]').forEach(function(el){ el.style.background = ''; });
      searchInput.value = '';
      searchState.matches = [];
      searchState.currentIdx = -1;
      searchState.replaceMode = false;
      var rr = host.querySelector('#ws-replace-row');
      if (rr) rr.style.display = 'none';
    };
    host.querySelector('#ws-search-toggle-replace').onclick = function () {
      searchState.replaceMode = !searchState.replaceMode;
      var rr = host.querySelector('#ws-replace-row');
      if (rr) rr.style.display = searchState.replaceMode ? '' : 'none';
    };
    if (replaceInput) {
      host.querySelector('#ws-replace-one').onclick = function () {
        var t = replaceInput.value;
        wordSearchReplace(t);
      };
      host.querySelector('#ws-replace-all').onclick = function () {
        var t = replaceInput.value;
        wordSearchReplaceAll(t);
      };
    }

    // Ctrl+F / Cmd+F 切换 SearchBar
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        // 只当 Word 编辑器可见时响应
        if (!host || !host.parentNode || !document.body.contains(host)) return;
        // 检查是否可见 (PKG 窗口可能被最小化)
        var pkgWin = host.closest('.aw-window');
        if (pkgWin && pkgWin.classList.contains('aw-minimized')) return;
        e.preventDefault();
        if (searchBar.style.display === 'none') {
          searchBar.style.display = '';
          searchInput.focus();
          searchInput.select();
        } else {
          searchBar.style.display = 'none';
          var mount = editorHost.querySelector('.ode-editor-flow');
          if (mount) mount.querySelectorAll('[data-bid]').forEach(function(el){ el.style.background = ''; });
          searchInput.value = '';
          searchState.matches = [];
          searchState.currentIdx = -1;
        }
      }
    });
  // v0.62.6: Word 右键菜单
  editorHost.addEventListener('contextmenu', function (e) {
    var blockEl = e.target.closest('[data-bid]');
    if (!blockEl) return;
    var blockId = blockEl.dataset.bid;
    e.preventDefault();
    showCtxMenu([
      { label: '\u2702 \u5220\u9664\u5757', action: function () { if (blockId) instance.deleteBlock(blockId); } },
      { label: '\u2191 \u4E0A\u79FB', action: function () { if (blockId) instance.moveBlockUp(blockId); } },
      { label: '\u2193 \u4E0B\u79FB', action: function () { if (blockId) instance.moveBlockDown(blockId); } },
      '-',
      { label: '\u2716 \u53D6\u6D88', action: function () {} },
    ], e.clientX, e.clientY);
  });
  }, 100); // 延迟等 DOM 就绪
}

// ===== Excel 编辑器（v0.62.5 OO 风格标题栏）=====
// 新增：OO 风格标题栏（学 OO FileMenu.js）+ ●已修改点
// 保留：20×8 默认网格 / +行 / +列 / 保存
// v0.62.3: 底部状态栏（位置 / 选中范围 / sum / avg / count）
// 升级：showPrompt 替代 prompt() / 保存 payload 改 sheets[] 数组（PR 1 兼容）
// v0.62.5 PR-C: 多 sheet 支持 — sheets[] 数组 + currentSheetIdx + 底部 Sheet tabs
function openExcelEditor(w) {
  var ROWS = 20, COLS = 8;

  // v0.62.5: 多 sheet 数据结构（每个 sheet 独立 data 数组）
  var sheets = [];
  var currentSheetIdx = 0;
  // 当前 sheet 的 data 引用（切换 sheet 时重新指向，便于旧代码直接用 data）
  var data = [];

  function blankData() {
    var d = [];
    for (var ri = 0; ri < ROWS; ri++) { d[ri] = []; for (var ci = 0; ci < COLS; ci++) d[ri][ci] = ''; }
    return d;
  }
  function defaultSheetName() { return 'Sheet' + (sheets.length + 1); }
  function addSheet() {
    sheets.push({ name: defaultSheetName(), data: blankData() });
    currentSheetIdx = sheets.length - 1;
    data = sheets[currentSheetIdx].data;
    sel = { start: null, end: null };
    markDirty();
    renderTable();
  }
  function switchSheet(idx) {
    if (idx < 0 || idx >= sheets.length) return;
    currentSheetIdx = idx;
    data = sheets[idx].data;
    sel = { start: null, end: null };
    markDirty();
    renderTable();
  }
  function removeSheet(idx) {
    if (sheets.length <= 1) return toast('至少保留一个 Sheet', 'warning');
    sheets.splice(idx, 1);
    if (currentSheetIdx >= sheets.length) currentSheetIdx = sheets.length - 1;
    data = sheets[currentSheetIdx].data;
    sel = { start: null, end: null };
    markDirty();
    renderTable();
  }
  function renameSheet(idx, name) {
    if (idx < 0 || idx >= sheets.length) return;
    name = String(name || '').trim();
    if (!name) return;
    sheets[idx].name = name;
    markDirty();
    renderTable();
  }

  // 初始化默认 Sheet1
  sheets.push({ name: 'Sheet1', data: blankData() });
  data = sheets[0].data;

  // 选中状态：{start: [r,c], end: [r,c]} — 跟踪当前 cell range
  var sel = { start: null, end: null };

  function colLetter(ci) {
    var s = '';
    var n = ci;
    while (n >= 0) {
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
    }
    return s;
  }

  function isNum(v) {
    if (v === '' || v == null) return false;
    var n = parseFloat(v);
    return !isNaN(n) && isFinite(n);
  }

  // v0.62.5: Excel 标题栏独立的 dirty 跟踪
  var isDirty = false;

  function updateStatusBar() {
    var bar = w.$c.querySelector('#xlsx-status');
    if (!bar) return;
    if (!sel.start || !sel.end) {
      bar.textContent = 'A1 · 总 ' + data.length + ' 行 × ' + (data[0]||[]).length + ' 列';
      return;
    }
    var r1 = Math.min(sel.start[0], sel.end[0]);
    var c1 = Math.min(sel.start[1], sel.end[1]);
    var r2 = Math.max(sel.start[0], sel.end[0]);
    var c2 = Math.max(sel.start[1], sel.end[1]);
    var range = colLetter(c1) + (r1+1) + (r1===r2&&c1===c2?'':':' + colLetter(c2) + (r2+1));
    // 收集选中单元格数值
    var sum = 0, count = 0, numCount = 0;
    for (var r = r1; r <= r2; r++) {
      for (var c = c1; c <= c2; c++) {
        count++;
        if (isNum(cellStr(data[r][c]))) { sum += parseFloat(cellStr(data[r][c])); numCount++; }
      }
    }
    var parts = [
      range,
      (r2-r1+1) + ' 行 × ' + (c2-c1+1) + ' 列',
      'sum: ' + (numCount > 0 ? sum.toFixed(2) : '-'),
      'avg: ' + (numCount > 0 ? (sum/numCount).toFixed(2) : '-'),
      'count: ' + numCount + '/' + count,
    ];
    bar.textContent = parts.join(' · ');
  }

// v0.62.5: 操作函数集合（Ribbon 按钮 + 标题栏按钮复用同一组 operations）
  var ops = {
    addRow: function () {
      var newRow = [];
      for (var k = 0; k < (data[0] || []).length; k++) newRow[k] = '';
      data.push(newRow);
      markDirty();
      renderTable();
    },
    addCol: function () {
      for (var k = 0; k < data.length; k++) data[k].push('');
      markDirty();
      renderTable();
    },
    insertRowAbove: function () {
      // 在选中行上方插入
      var insertAt = sel.start ? sel.start[0] : 0;
      var newRow = [];
      for (var k = 0; k < (data[0] || []).length; k++) newRow[k] = '';
      data.splice(insertAt, 0, newRow);
      markDirty();
      renderTable();
    },
    insertRowBelow: function () {
      var insertAt = sel.start ? sel.start[0] + 1 : data.length;
      var newRow = [];
      for (var k = 0; k < (data[0] || []).length; k++) newRow[k] = '';
      data.splice(insertAt, 0, newRow);
      markDirty();
      renderTable();
    },
    insertColLeft: function () {
      var insertAt = sel.start ? sel.start[1] : 0;
      for (var k = 0; k < data.length; k++) data[k].splice(insertAt, 0, '');
      markDirty();
      renderTable();
    },
    insertColRight: function () {
      var insertAt = sel.start ? sel.start[1] + 1 : (data[0] || []).length;
      for (var k = 0; k < data.length; k++) data[k].splice(insertAt, 0, '');
      markDirty();
      renderTable();
    },
    deleteRow: function () {
      if (!sel.start) return toast('请先选中一行', 'warning');
      if (data.length <= 1) return toast('至少保留一行', 'warning');
      data.splice(sel.start[0], 1);
      sel = { start: null, end: null };
      markDirty();
      renderTable();
    },
    deleteCol: function () {
      if (!sel.start) return toast('请先选中一列', 'warning');
      if ((data[0] || []).length <= 1) return toast('至少保留一列', 'warning');
      var c = sel.start[1];
      for (var k = 0; k < data.length; k++) data[k].splice(c, 1);
      sel = { start: null, end: null };
      markDirty();
      renderTable();
    },
    clearCell: function () {
      if (!sel.start) return toast('请先选中单元格', 'warning');
      data[sel.start[0]][sel.start[1]] = { v: '' };
      markDirty();
      renderTable();
    },
    save: function () { saveExcel(); },

    // ─── Formula tab (学 OO Formula Tab) ───
    insertFormula: function (fnName) {
      if (!sel.start) return toast('请先选中单元格', 'warning');
      var r = sel.start[0], c = sel.start[1];
      // 从选中范围收集数值
      var r1 = sel.start[0], c1 = sel.start[1];
      var r2 = sel.end ? sel.end[0] : r1, c2 = sel.end ? sel.end[1] : c1;
      var values = [];
      for (var ri = Math.min(r1,r2); ri <= Math.max(r1,r2); ri++) {
        for (var ci = Math.min(c1,c2); ci <= Math.max(c1,c2); ci++) {
          var v = data[ri] ? cellStr(data[ri][ci]) : '';
          if (v !== '' && v != null && !isNaN(parseFloat(v)) && isFinite(v)) values.push(parseFloat(v));
        }
      }
      var result = '';
      switch (fnName) {
        case 'SUM':   result = values.reduce(function(a,b){return a+b;}, 0); break;
        case 'AVG':   result = values.length ? values.reduce(function(a,b){return a+b;}, 0) / values.length : 0; break;
        case 'COUNT': result = values.length; break;
        case 'MAX':   result = values.length ? Math.max.apply(null, values) : ''; break;
        case 'MIN':   result = values.length ? Math.min.apply(null, values) : ''; break;
        default: return toast('未知公式: ' + fnName, 'error');
      }
      data[r][c] = String(result);
      markDirty();
      renderTable();
      toast(fnName + ' = ' + result, 'success');
    },
    autoSum: function () {
      if (!sel.start) return toast('请先选中单元格', 'warning');
      var r = sel.start[0], c = sel.start[1];
      // 向上或向左找数值
      var vals = [];
      // 先向上找
      for (var ri = r - 1; ri >= 0; ri--) {
        var v = data[ri] ? cellStr(data[ri][c]) : '';
        if (v === '' || v == null) break;
        if (!isNaN(parseFloat(v)) && isFinite(v)) vals.push(parseFloat(v));
        else break;
      }
      if (vals.length === 0) {
        // 再向左找
        for (var ci = c - 1; ci >= 0; ci--) {
          var v2 = data[r] ? cellStr(data[r][ci]) : '';
          if (v2 === '' || v2 == null) break;
          if (!isNaN(parseFloat(v2)) && isFinite(v2)) vals.push(parseFloat(v2));
          else break;
        }
      }
      var sum = vals.reduce(function(a,b){return a+b;}, 0);
      data[r][c] = String(sum);
      markDirty();
      renderTable();
      toast('自动求和 = ' + sum, 'success');
    },

    // ─── Data tab (学 OO Data Tab) ───
    sortRange: function (ascending) {
      if (!sel.start || !sel.end) return toast('请先选中一个区域', 'warning');
      var r1 = Math.min(sel.start[0], sel.end[0]);
      var r2 = Math.max(sel.start[0], sel.end[0]);
      var c1 = Math.min(sel.start[1], sel.end[1]);
      var c2 = Math.max(sel.start[1], sel.end[1]);
      // 提取区域数据
      var rows = [];
      for (var ri = r1; ri <= r2; ri++) {
        rows.push({ idx: ri, cells: data[ri].slice(c1, c2 + 1) });
      }
      // 按第1列排序
      rows.sort(function (a, b) {
        var va = parseFloat(cellStr(a.cells[0])), vb = parseFloat(cellStr(b.cells[0]));
        if (!isNaN(va) && !isNaN(vb)) return ascending ? va - vb : vb - va;
        var sa = cellStr(a.cells[0] || ''), sb = cellStr(b.cells[0] || '');
        return ascending ? sa.localeCompare(sb) : sb.localeCompare(sa);
      });
      // 写回 data
      rows.forEach(function (row, i) {
        for (var ci = c1; ci <= c2; ci++) {
          data[r1 + i][ci] = row.cells[ci - c1];
        }
      });
      markDirty();
      renderTable();
      toast('已排序 ' + (r2 - r1 + 1) + ' 行 ' + (ascending ? '升序' : '降序'), 'success');
    },
    toggleFilter: function () {
      // 简单筛选: 在当前选中的列上方添加/移除筛选行 (首行变成 filter row)
      if (!sel.start) return toast('请先选中一个单元格', 'warning');
      var filterRow = 0; // 默认第0行为筛选标题行
      if (window._excelFilterActive) {
        // 关闭筛选 — 恢复所有行显示
        window._excelFilterActive = false;
        toast('筛选已关闭', 'info');
        renderTable();
      } else {
        window._excelFilterActive = true;
        toast('筛选已开启 — 点击筛选行值筛选', 'info');
        renderTable();
      }
    },
    applyFilter: function (colIdx, value) {
      if (!window._excelFilterActive) return;
      var cells = w.$c.querySelectorAll('.xlsx-cell');
      cells.forEach(function(el) {
        var c = parseInt(el.dataset.c);
        if (c === colIdx) {
          var td = el.parentNode;
          var tr = td.parentNode;
          if (value === '' || el.textContent.trim() === value) {
            tr.style.display = '';
          } else {
            tr.style.display = 'none';
          }
        }
      });
    },
    // v0.62.6: Undo/Redo
    undo: function () { xlUndo(); },
    redo: function () { xlRedo(); },
    toggleBold: function () { toggleCellFmt('b'); },
    toggleItalic: function () { toggleCellFmt('i'); },
    toggleUnderline: function () { toggleCellFmt('u'); },
    // v0.62.7: Layout
    setXlMargin: function (size) {
      var tbl = w.$c.querySelector('#xlsx-table');
      if (!tbl) return;
      var margins = { narrow: '0 8px', normal: '0 16px', wide: '0 32px' };
      tbl.style.margin = margins[size] || margins.normal;
      if (window.__xlRibbon) {
        Object.keys(margins).forEach(function(k){ window.__xlRibbon.setButtonActive('layout', 'xl-margin-' + k, k === size); });
      }
    },
    setXlOrientation: function (orient) {
      var cont = w.$c.querySelector('.xlsx-table-wrap');
      if (!cont) return;
      if (orient === 'landscape') { cont.style.maxWidth = '1200px'; }
      else { cont.style.maxWidth = ''; }
      if (window.__xlRibbon) {
        ['portrait','landscape'].forEach(function(o){ window.__xlRibbon.setButtonActive('layout', 'xl-orient-' + o, o === orient); });
      }
    },
  };

  function markDirty() {
    isDirty = true;
    var dot = w.$c.querySelector('#xlsx-modified-dot');
    if (dot) { dot.classList.add('is-dirty'); dot.classList.remove('is-saved'); dot.title = '已修改未保存'; }
  }

  function markSaved() {
    isDirty = false;
    var dot = w.$c.querySelector('#xlsx-modified-dot');
    if (dot) { dot.classList.remove('is-dirty'); dot.classList.add('is-saved'); dot.title = '已保存';
      setTimeout(function(){ dot.classList.remove('is-saved'); }, 1200); }
  }

  // v0.62.6: Excel Undo/Redo
  var xlUndoStack = [];
  var xlRedoStack = [];
  function xlSnapshot() { return JSON.parse(JSON.stringify({ data: data, sheets: sheets, currentSheetIdx: currentSheetIdx })); }
  function xlPushUndo() {
    xlUndoStack.push(xlSnapshot());
    if (xlUndoStack.length > 30) xlUndoStack.shift();
    xlRedoStack = [];
  }
  function xlRestoreState(s) {
    data.length = 0; s.data.forEach(function(r){ data.push(r); });
    sheets.length = 0; s.sheets.forEach(function(sh){ sheets.push({ name: sh.name, data: sh.data }); });
    currentSheetIdx = s.currentSheetIdx;
    data = sheets[currentSheetIdx].data;
    renderTable();
  }
  function xlUndo() {
    if (xlUndoStack.length < 2) return;
    xlRedoStack.push(xlSnapshot());
    var s = xlUndoStack.pop();
    xlRestoreState(xlUndoStack[xlUndoStack.length - 1]);
    markDirty();
  }
  function xlRedo() {
    if (!xlRedoStack.length) return;
    xlUndoStack.push(xlSnapshot());
    var s = xlRedoStack.pop();
    xlRestoreState(s);
    markDirty();
  }

  // 名称框 — 同步显示/编辑当前 cell 坐标 (学 OO Spreadsheet Name Box)
  function updateNameBox() {
    var box = w.$c.querySelector('#xlsx-namebox');
    if (!box) return;
    if (!sel.start) { box.value = ''; return; }
    var r = sel.start[0], c = sel.start[1];
    box.value = colLetter(c) + (r + 1);
  }

  function renderTable() {
    // v0.62.5: 容器套 .oo-editor oo-editor-xlsx class（让 Excel 墨绿色主题生效）
    var h = '<div class="oo-editor oo-editor-xlsx" style="display:flex;flex-direction:column;height:100%">';
    // OO 风格标题栏（v0.62.5: 简化 — 只留文件名 + 保存, 功能按钮移到 Ribbon）
    h += '<div class="oo-titlebar">';
    h += '<span class="oo-titlebar-icon">📊</span>';
    h += '<div class="oo-titlebar-name">';
    h += '<input id="xlsx-title-input" value="未命名.xlsx" placeholder="未命名.xlsx">';
    h += '<span id="xlsx-modified-dot" class="oo-modified-dot" title="未修改"></span>';
    h += '</div>';
    h += '<div class="oo-titlebar-actions">';
    h += '<button class="oo-titlebar-btn" id="xlsx-export-csv-btn" title="导出 CSV">📄 CSV</button>';
    h += '<button class="oo-titlebar-btn primary" id="xlsx-save-btn">💾 保存</button>';
    h += '</div>';
    h += '</div>';
    // v0.62.5: Ribbon 工具栏（学 OO TabBar.js + FileMenu.js）
    h += '<div id="xlsx-ribbon-host" style="flex-shrink:0"></div>';
    // 表格区
    h += '<div style="flex:1;overflow:auto;padding:4px">';
    h += '<table id="xlsx-table" style="border-collapse:collapse;width:100%;font-size:13px">';
    h += '<tr><th style="border:1px solid #ccc;background:var(--bg2);padding:4px 6px;min-width:30px;text-align:center;font-weight:600;position:sticky;top:0;z-index:2">#</th>';
    for (var ci = 0; ci < (data[0]||[]).length; ci++) {
      h += '<th style="border:1px solid #ccc;background:var(--bg2);padding:4px 6px;min-width:80px;text-align:center;font-weight:600;position:sticky;top:0;z-index:2">' + colLetter(ci) + '</th>';
    }
    h += '</tr>';
    for (var ri = 0; ri < data.length; ri++) {
      h += '<tr><td style="border:1px solid #ccc;background:var(--bg2);padding:4px 6px;text-align:center;font-size:11px;color:var(--text2)">' + (ri + 1) + '</td>';
      for (var ci2 = 0; ci2 < data[ri].length; ci2++) {
        var val = escHtml(String(data[ri][ci2]));
        h += '<td style="border:1px solid #ccc;padding:2px 4px;min-width:80px"><div class="xlsx-cell" contenteditable style="outline:none;min-height:20px;padding:2px" data-r="' + ri + '" data-c="' + ci2 + '">' + val + '</div></td>';
      }
      h += '</tr>';
    }
    h += '</table></div>';
    // v0.62.5: 底部状态栏行（含名称框 + 状态信息）
    h += '<div style="display:flex;align-items:center;background:var(--office-toolbar-bg);border-top:1px solid var(--office-divider);flex-shrink:0;height:28px">';
    h += '<input id="xlsx-namebox" class="oo-statusbar-namebox" placeholder="A1" title="当前选中单元格（输入跳转）" style="margin:0 4px 0 8px">';
    h += '<div id="xlsx-status" class="oo-statusbar" style="flex:1;border:none;background:transparent">A1 · 总 20 行 × 8 列</div>';
    h += '</div>';
    // v0.62.5 PR-C: Sheet tabs (学 OO Spreadsheet 底部 sheet 切换条)
    h += '<div id="xlsx-sheets">';
    sheets.forEach(function(s, i) {
      var activeCls = i === currentSheetIdx ? ' is-active' : '';
      h += '<div class="xlsx-sheet-tab' + activeCls + '" data-i="' + i + '" title="' + escHtml(s.name) + '（双击改名 / 右键菜单）">';
      h += '<span class="xlsx-sheet-name">' + escHtml(s.name) + '</span>';
      if (sheets.length > 1) {
        h += '<button class="xlsx-sheet-close" data-i="' + i + '" title="删除 Sheet">×</button>';
      }
      h += '</div>';
    });
    h += '<button id="xlsx-add-sheet" class="xlsx-sheet-add" title="新建 Sheet">+</button>';
    h += '</div>';
    h += '</div>';
    w.$c.innerHTML = h;

    // v0.62.5: Ribbon 挂载 — 学 OO FileMenu.js 的 Home/Insert 结构
    if (window.ACMSRibbon) {
      window.__xlRibbon = window.ACMSRibbon.create(w.$c.querySelector('#xlsx-ribbon-host'), {
        tabs: [
          {
            id: 'home', label: '🏠 Home',
            groups: [
              { title: '历史', buttons: [
                { id: 'undo', icon: '↩', label: '撤销', action: ops.undo },
                { id: 'redo', icon: '↪', label: '重做', action: ops.redo },
              ]},
              { title: '单元格', buttons: [
                { id: 'clear',     icon: '🧹', label: '清空', action: ops.clearCell },
                { id: 'bold',      icon: 'B',   label: '粗体', action: ops.toggleBold },
                { id: 'italic',    icon: 'I',   label: '斜体', action: ops.toggleItalic },
                { id: 'underline', icon: 'U',   label: '下划线', action: ops.toggleUnderline },
              ]},
              { title: '行列', buttons: [
                { id: 'add-row',   icon: '➕', label: '加行', action: ops.addRow },
                { id: 'add-col',   icon: '➕', label: '加列', action: ops.addCol },
                { id: 'del-row',   icon: '➖', label: '删行', action: ops.deleteRow },
                { id: 'del-col',   icon: '➖', label: '删列', action: ops.deleteCol },
              ]},
              { title: '保存', buttons: [
                { id: 'save',      icon: '💾', label: '保存', large: true, action: ops.save },
              ]},
            ],
          },
          {
            id: 'insert', label: '➕ Insert',
            groups: [
              { title: '插入行', buttons: [
                { id: 'ins-row-above', icon: '⬆️', label: '上方', action: ops.insertRowAbove },
                { id: 'ins-row-below', icon: '⬇️', label: '下方', action: ops.insertRowBelow },
              ]},
              { title: '插入列', buttons: [
                { id: 'ins-col-left',  icon: '⬅️', label: '左侧', action: ops.insertColLeft },
                { id: 'ins-col-right', icon: '➡️', label: '右侧', action: ops.insertColRight },
              ]},
            ],
          },
          {
            id: 'formula', label: 'ƒ Formula',
            groups: [
              { title: '自动求和', buttons: [
                { id: 'auto-sum', icon: 'Σ', label: '自动求和', large: true, action: ops.autoSum },
              ]},
              { title: '常用函数', buttons: [
                { id: 'fn-sum',   icon: 'Σ', label: 'SUM',   action: function(){ ops.insertFormula('SUM'); } },
                { id: 'fn-avg',   icon: 'x̄', label: 'AVG',   action: function(){ ops.insertFormula('AVG'); } },
                { id: 'fn-count', icon: '#', label: 'COUNT', action: function(){ ops.insertFormula('COUNT'); } },
                { id: 'fn-max',   icon: '↑', label: 'MAX',   action: function(){ ops.insertFormula('MAX'); } },
                { id: 'fn-min',   icon: '↓', label: 'MIN',   action: function(){ ops.insertFormula('MIN'); } },
              ]},
            ],
          },
          {
            id: 'data', label: '🔢 Data',
            groups: [
              { title: '排序', buttons: [
                { id: 'sort-asc',  icon: '⬆️', label: '升序', action: function(){ ops.sortRange(true); } },
                { id: 'sort-desc', icon: '⬇️', label: '降序', action: function(){ ops.sortRange(false); } },
              ]},
              { title: '筛选', buttons: [
                { id: 'toggle-filter', icon: '🔍', label: '筛选', action: ops.toggleFilter },
              ]},
            ],
          },
          {
            id: 'layout', label: '📐 Layout',
            groups: [
              { title: '边距', buttons: [
                { id: 'xl-margin-normal', icon: '📄', label: '普通', action: function(){ ops.setXlMargin('normal'); } },
                { id: 'xl-margin-narrow', icon: '📃', label: '窄',   action: function(){ ops.setXlMargin('narrow'); } },
                { id: 'xl-margin-wide',   icon: '📑', label: '宽',   action: function(){ ops.setXlMargin('wide'); } },
              ]},
              { title: '方向', buttons: [
                { id: 'xl-orient-portrait',  icon: '📄', label: '纵向', action: function(){ ops.setXlOrientation('portrait'); } },
                { id: 'xl-orient-landscape', icon: '📁', label: '横向', action: function(){ ops.setXlOrientation('landscape'); } },
              ]},
            ],
          },
        ],
        active: 'home',
      });
    }

    // 单元格编辑 + 选中跟踪
    var cells = w.$c.querySelectorAll('.xlsx-cell');
    cells.forEach(function(el) {
      var r = parseInt(el.dataset.r), c = parseInt(el.dataset.c);
      el.onfocus = function() {
        sel.start = [r, c];
        sel.end = [r, c];
        el.style.outline = '2px solid var(--accent)';
        el.style.background = '#f0f8ff';
        updateStatusBar();
        updateNameBox();
      };
      el.onblur = function() {
        el.style.outline = 'none';
        el.style.background = '';
        var newVal = el.textContent;
        if (cellStr(data[r][c]) !== newVal) {
          data[r][c] = { v: newVal };
          markDirty();
        }
      };
      el.onkeydown = function(e) {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      };
    });

    // 名称框: 输入 cell 坐标跳转 (B2 → 选中 B2)
    var namebox = w.$c.querySelector('#xlsx-namebox');
    namebox.onkeydown = function (e) {
      if (e.key !== 'Enter') return;
      var v = (namebox.value || '').trim().toUpperCase();
      var m = v.match(/^([A-Z]+)(\d+)$/);
      if (!m) return toast('格式示例: A1, B2, AA10', 'warning');
      var colStr = m[1], rowStr = m[2];
      var colIdx = 0;
      for (var i = 0; i < colStr.length; i++) colIdx = colIdx * 26 + (colStr.charCodeAt(i) - 64);
      colIdx -= 1; // 0-based
      var rowIdx = parseInt(rowStr) - 1;
      var cellEl = w.$c.querySelector('.xlsx-cell[data-r="' + rowIdx + '"][data-c="' + colIdx + '"]');
      if (!cellEl) return toast('超出范围', 'warning');
      cellEl.focus();
      namebox.blur();
    };
updateNameBox();

    // v0.62.5 PR-C: Sheet tabs 事件绑定
    w.$c.querySelectorAll('.xlsx-sheet-tab').forEach(function (tab) {
      tab.onclick = function (e) {
        if (e.target.classList.contains('xlsx-sheet-close')) return; // 关闭按钮单独处理
        switchSheet(parseInt(tab.dataset.i));
      };
      // 双击改名（学 OO Spreadsheet 双击 sheet 改名）
      tab.ondblclick = function () {
        var idx = parseInt(tab.dataset.i);
        var cur = sheets[idx].name;
        if (typeof showPrompt === 'function') {
          showPrompt({
            title: '重命名 Sheet',
            message: '输入新名称',
            defaultValue: cur,
            multiline: false,
            minLength: 1,
          }).then(function (n) { if (n) renameSheet(idx, n); });
        } else {
          var n = prompt('新名称:', cur);
          if (n) renameSheet(idx, n);
        }
      };
      // 关闭按钮
      var closeBtn = tab.querySelector('.xlsx-sheet-close');
      if (closeBtn) {
        closeBtn.onclick = function (e) {
          e.stopPropagation();
          removeSheet(parseInt(closeBtn.dataset.i));
        };
      }
    });
    var addSheetBtn = w.$c.querySelector('#xlsx-add-sheet');
    if (addSheetBtn) addSheetBtn.onclick = function () { addSheet(); };

    // v0.62.6: Excel 右键菜单
    w.$c.addEventListener('contextmenu', function (e) {
      var cell = e.target.closest('.xlsx-cell');
      if (!cell) return;
      e.preventDefault();
      var r = parseInt(cell.dataset.r), c = parseInt(cell.dataset.c);
      sel = { start: [r, c], end: [r, c] };
      updateNameBox();
      showCtxMenu([
        { label: '\u2726 \u6E05\u7A7A', action: function () { data[r][c] = ''; markDirty(); renderTable(); } },
        { label: '\u2191 \u4E0A\u65B9\u63D2\u884C', action: function () {
          var nr = []; for (var k = 0; k < (data[0]||[]).length; k++) nr.push('');
          data.splice(r, 0, nr); markDirty(); renderTable();
        }},
        { label: '\u2193 \u4E0B\u65B9\u63D2\u884C', action: function () {
          var nr = []; for (var k = 0; k < (data[0]||[]).length; k++) nr.push('');
          data.splice(r + 1, 0, nr); markDirty(); renderTable();
        }},
        { label: '\u2716 \u5220\u9664\u884C', action: function () {
          if (data.length <= 1) return toast('\u81F3\u5C11\u4FDD\u7559\u4E00\u884C', 'warning');
          data.splice(r, 1); markDirty(); renderTable();
        }},
        '-',
        { label: '\u53D6\u6D88', action: function () {} },
      ], e.clientX, e.clientY);
    });

// v0.62.5: 保存逻辑抽成 saveExcel 函数（Ribbon "保存"按钮 + 标题栏 "保存"按钮共用）
    function saveExcel() {
      var name;
      var currentName = (w.$c.querySelector('#xlsx-title-input').value || '').trim() || '表格';
      if (typeof showPrompt === 'function') {
        name = showPrompt({
          title: '保存 Excel 表格',
          message: '输入文件名（.xlsx 后缀自动加）',
          defaultValue: currentName.replace(/\.xlsx$/i, ''),
          multiline: false,
          minLength: 1,
        });
      } else {
        name = Promise.resolve(prompt('文件名：', '表格.xlsx') || '表格.xlsx');
      }
      return Promise.resolve(name).then(function(n) {
        if (!n) return;
        n = String(n).trim();
        if (!n.toLowerCase().endsWith('.xlsx')) n += '.xlsx';
        // v0.62.5 PR-C: 多 sheet payload — 每个 sheet 单独 headers + rows
        var payloadSheets = sheets.map(function (s) {
          var d = s.data;
          return { name: s.name, headers: d[0] || [], rows: d.slice(1) };
        });
        return fetch('/api/office/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
          body: JSON.stringify({ type: 'xlsx', name: n, data: { title: n.replace(/\.xlsx$/, ''), sheets: payloadSheets, rows: data.length, cols: (data[0]||[]).length } }),
        }).then(function(r){ return r.json(); }).then(function(r){
          if (r.ok) { toast('已保存 ✅ ' + n + ' (' + r.size + ' bytes, ' + sheets.length + ' 个 Sheet)', 'success'); markSaved(); }
          else toast('保存失败: ' + (r.error || '未知'), 'error');
        }).catch(function(e){ toast('保存失败: ' + e.message, 'error'); });
      });
    }
    // 标题栏 "保存" 按钮 — 调用 saveExcel（v0.62.5 重构）
    var saveBtn = w.$c.querySelector('#xlsx-save-btn');
    if (saveBtn) saveBtn.onclick = function () { saveExcel(); };

    // 标题栏 "导出 CSV" 按钮
    var csvBtn = w.$c.querySelector('#xlsx-export-csv-btn');
    if (csvBtn) csvBtn.onclick = function () {
      var csv = data.map(function(row){ return row.map(function(c){ return '"' + String(c).replace(/"/g,'""') + '"'; }).join(','); }).join('\n');
      var baseName = (w.$c.querySelector('#xlsx-title-input').value || '未命名').replace(/\.xlsx$/i, '');
      var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = baseName + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('已导出 ' + baseName + '.csv', 'success');
    };
  }

  // 初始状态入 undo 栈
  setTimeout(function () { xlPushUndo(); }, 100);
  renderTable();
}

// ===== PPT 编辑器（v0.62.3 状态栏 + 布局选择器）=====
// 新增：底部状态栏（当前 / 总页数）
// 新增：布局下拉（cover / content / blank）影响编辑区视觉
// 保留：缩略图侧边栏 / 标题+正文编辑 / +添加页 / 删除 / 保存
// 升级：showPrompt 替代 prompt()
function openPptEditor(w) {
  var slides = [{ title: 'PPT 标题', content: '第一页正文\n支持多行\n- 项目 A\n- 项目 B', layout: 'content', transition: { type: 'none', direction: 'from-right', duration: 500 }, animations: [] }];
  var cur = 0;

  // 布局下拉变化时改 placeholder + 字号
  function applyLayout(layout, titleEl, contentEl) {
    if (layout === 'cover') {
      titleEl.style.fontSize = '36px';
      titleEl.style.textAlign = 'center';
      titleEl.placeholder = '封面标题';
      contentEl.placeholder = '副标题（可选）';
    } else if (layout === 'blank') {
      titleEl.style.fontSize = '20px';
      titleEl.style.textAlign = 'left';
      titleEl.placeholder = '（空白页可只放图）';
      contentEl.placeholder = '正文或图片说明';
    } else { // content
      titleEl.style.fontSize = '22px';
      titleEl.style.textAlign = 'left';
      titleEl.placeholder = '幻灯片标题';
      contentEl.placeholder = '正文内容（支持换行）';
    }
  }

  // v0.62.5: PPT 操作函数集合（Ribbon + 标题栏共用）
  var pptOps = {
    addSlide: function () {
      slides.push({ title: '新页面', content: '', layout: 'content', transition: { type: 'none', direction: 'from-right', duration: 500 }, animations: [] });
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
      // 不重新 render — 只更新当前 slide 的视觉 + 缩略图 + 状态栏
      var titleEl = w.$c.querySelector('#ppt-title');
      var contentEl = w.$c.querySelector('#ppt-content');
      if (titleEl && contentEl) applyLayout(layout, titleEl, contentEl);
      updateThumb();
      updateStatus();
      // 同步 Ribbon Design tab 的激活状态
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
      // 同步 Ribbon Transition tab 激活状态
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
    // ─── Animations (学 OO Animation.js) ───
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
      // Add/update animation for current target
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
      // Update existing animations
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
        overlay.innerHTML =
          '<div class="ppt-slideshow-slide ' + layoutClass + '" style="animation:ppt-trans-' + trans.type + ' ' + trans.duration + 'ms ease">' +
            '<div class="ppt-slideshow-slide-inner">' +
              (s.title ? '<h1 class="ppt-sls-title" style="animation:ppt-elem-' + (animFor('title').type) + ' ' + (animFor('title').duration) + 'ms ease">' + escHtml(s.title) + '</h1>' : '') +
              (s.content ? '<div class="ppt-slideshow-content" style="animation:ppt-elem-' + (animFor('content').type) + ' ' + (animFor('content').duration) + 'ms ease">' + escHtml(s.content).replace(/\\n/g, '<br>') + '</div>' : '') +
            '</div>' +
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
    // v0.62.6: Undo/Redo
    undo: function () { pptUndo(); },
    redo: function () { pptRedo(); },
  };

  function markPptDirty() {
    var dot = w.$c.querySelector('#ppt-modified-dot');
    if (dot) { dot.classList.add('is-dirty'); dot.classList.remove('is-saved'); dot.title = '已修改未保存'; }
  }

  // v0.62.6: PPT Undo/Redo
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
    var s = pptUndoStack.pop();
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

  function render() {
    // v0.62.5: 容器套 .oo-editor oo-editor-pptx class（让 PPT 棕红色主题生效）
    var h = '<div class="oo-editor oo-editor-pptx" style="display:flex;flex-direction:column;height:100%">';
    // OO 风格标题栏（v0.62.5: 简化 — 只留文件名 + 保存, 功能按钮全部移到 Ribbon）
    h += '<div class="oo-titlebar">';
    h += '<span class="oo-titlebar-icon">📽️</span>';
    h += '<div class="oo-titlebar-name">';
    h += '<input id="ppt-title-input" value="未命名.pptx" placeholder="未命名.pptx">';
    h += '<span id="ppt-modified-dot" class="oo-modified-dot" title="未修改"></span>';
    h += '</div>';
    h += '<div class="oo-titlebar-actions">';
    h += '<button class="oo-titlebar-btn primary" id="ppt-save-btn">💾 保存</button>';
    h += '</div>';
    h += '</div>';
    // v0.62.5: Ribbon 工具栏（学 OO TabBar.js）
    h += '<div id="ppt-ribbon-host" style="flex-shrink:0"></div>';
    // 缩略图栏（OO 风格）
    h += '<div id="ppt-thumbs" style="display:flex;gap:8px;padding:10px;background:var(--office-toolbar-bg);border-bottom:1px solid var(--office-divider);overflow-x:auto;flex-shrink:0">';
    slides.forEach(function(s, i) {
      var layoutTag = s.layout === 'cover' ? '📄' : (s.layout === 'blank' ? '⬜' : '📃');
      var activeCls = i === cur ? ' is-active' : '';
      h += '<div class="ppt-thumb' + activeCls + '" data-i="' + i + '" draggable="true">';
      h += '<div class="ppt-thumb-icon">' + layoutTag + '</div>';
      h += '<div class="ppt-thumb-title">' + escHtml((s.title||'无标题').slice(0, 10)) + '</div>';
      h += '<div class="ppt-thumb-page">' + (i+1) + '/' + slides.length + '</div>';
      h += '</div>';
    });
    h += '</div>';
    // 编辑区（OO 风格 — slide 卡片样式）
    var s = slides[cur] || { title: '', content: '', layout: 'content' };
    h += '<div style="flex:1;padding:20px;overflow:auto;display:flex;justify-content:center">';
    h += '<div class="ppt-slide-paper" style="max-width:800px;width:100%;padding:40px;display:flex;flex-direction:column">';
    h += '<input id="ppt-title" value="' + escHtml(s.title) + '" style="width:100%;font-weight:600;border:none;outline:none;border-bottom:2px solid #e0e0e0;margin-bottom:16px;padding:8px 4px;background:transparent;font-family:inherit" placeholder="幻灯片标题">';
    h += '<textarea id="ppt-content" style="width:100%;flex:1;min-height:250px;border:none;outline:none;font-size:15px;line-height:1.7;padding:8px 4px;background:transparent;resize:vertical;font-family:inherit" placeholder="正文内容（支持换行）">' + escHtml(s.content) + '</textarea>';
    h += '</div></div>';
    // v0.62.5: 底部状态栏（OO 风格）
    h += '<div id="ppt-status" class="oo-statusbar" style="justify-content:space-between">';
    h += '<span>第 ' + (cur+1) + ' / ' + slides.length + ' 页</span>';
    h += '<span>' + (s.layout === 'cover' ? '封面' : (s.layout === 'blank' ? '空白' : '内容页')) + ' 布局</span>';
    h += '</div>';
    h += '</div>';

    w.$c.innerHTML = h;

    // v0.62.5: Ribbon 挂载（Home / Insert / Design 三 tab）
    if (window.ACMSRibbon) {
      window._pptRibbon = window.ACMSRibbon.create(w.$c.querySelector('#ppt-ribbon-host'), {
        tabs: [
          {
            id: 'home', label: '🏠 Home',
            groups: [
              { title: '历史', buttons: [
                { id: 'undo', icon: '↩', label: '撤销', action: pptOps.undo },
                { id: 'redo', icon: '↪', label: '重做', action: pptOps.redo },
              ]},
              { title: '幻灯片', buttons: [
                { id: 'add-slide', icon: '➕', label: '添加', action: pptOps.addSlide },
                { id: 'del-slide', icon: '➖', label: '删除', action: pptOps.delSlide },
              ]},
              { title: '保存', buttons: [
                { id: 'save', icon: '💾', label: '保存', large: true, action: pptOps.save },
              ]},
            ],
          },
          {
            id: 'insert', label: '➕ Insert',
            groups: [
              { title: '插入', buttons: [
                { id: 'ins-text',  icon: '📝', label: '文本框', action: function(){
                  slides[cur].content += (slides[cur].content ? '\n\n' : '') + '新文本框内容';
                  markPptDirty();
                  render();
                  // 聚焦到文本框
                  var contentEl = w.$c.querySelector('#ppt-content');
                  if (contentEl) { contentEl.focus(); contentEl.selectionStart = contentEl.value.length; }
                } },
                { id: 'ins-image', icon: '🖼️', label: '图片',   action: function(){
                  var input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
                  input.onchange = function () {
                    var file = input.files && input.files[0];
                    if (!file) return;
                    var reader = new FileReader();
                    reader.onload = function (e) {
                      // 在当前 slide 内容追加图片标记
                      slides[cur].content += (slides[cur].content ? '\n\n' : '') + '![' + file.name + '](' + e.target.result + ')';
                      markPptDirty();
                      render();
                    };
                    reader.readAsDataURL(file);
                  };
                  input.click();
                } },
                { id: 'ins-shape', icon: '⬜', label: '形状',   action: function(){
                  var shapes = ['⬜ 方框', '● 圆', '▲ 三角', '◆ 菱形', '⭐ 星'];
                  if (typeof showPrompt === 'function') {
                    showPrompt({
                      title: '选择形状',
                      message: '输入形状类型:',
                      multiline: false,
                      minLength: 1,
                      buttons: shapes.map(function(s){ return { text: s, value: s.split(' ')[1] }; }),
                    }).then(function(shape){
                      if (!shape || shape === '__cancel__') return;
                      slides[cur].content += (slides[cur].content ? '\n\n' : '') + '[' + shape + ']';
                      markPptDirty();
                      render();
                    });
                  } else {
                    var shape = prompt('选择形状 (方框/圆/三角/菱形/星):', '方框');
                    if (shape) {
                      slides[cur].content += (slides[cur].content ? '\n\n' : '') + '[' + shape + ']';
                      markPptDirty();
                      render();
                    }
                  }
                } },
              ]},
            ],
          },
          {
            id: 'design', label: '🎨 Design',
            groups: [
              { title: '布局', buttons: [
                { id: 'layout-content', icon: '📃', label: '内容', large: true,
                  action: function(){ pptOps.setLayout('content'); }, active: s.layout === 'content' },
                { id: 'layout-cover',   icon: '📄', label: '封面', large: true,
                  action: function(){ pptOps.setLayout('cover'); },   active: s.layout === 'cover' },
                { id: 'layout-blank',   icon: '⬜', label: '空白', large: true,
                  action: function(){ pptOps.setLayout('blank'); },   active: s.layout === 'blank' },
              ]},
            ],
          },
          {
            id: 'transit', label: '🎬 Transitions',
            groups: [
              { title: '效果', buttons: [
                { id: 'transit-none',    icon: '🚫', label: '无',     action: function(){ pptOps.setTransition({ type: 'none' }); } },
                { id: 'transit-fade',    icon: '🌫️', label: '淡入',  action: function(){ pptOps.setTransition({ type: 'fade' }); } },
                { id: 'transit-push',    icon: '👉', label: '推动',  action: function(){ pptOps.setTransition({ type: 'push' }); } },
                { id: 'transit-wipe',    icon: '🧹', label: '擦除',  action: function(){ pptOps.setTransition({ type: 'wipe' }); } },
                { id: 'transit-dissolve',icon: '💧', label: '溶解',  action: function(){ pptOps.setTransition({ type: 'dissolve' }); } },
                { id: 'transit-zoom',    icon: '🔍', label: '缩放',  action: function(){ pptOps.setTransition({ type: 'zoom' }); } },
              ]},
              { title: '方向', buttons: [
                { id: 'dir-right', icon: '→', label: '右', action: function(){ pptOps.setTransition({ direction: 'from-right' }); } },
                { id: 'dir-left',  icon: '←', label: '左', action: function(){ pptOps.setTransition({ direction: 'from-left' }); } },
                { id: 'dir-top',   icon: '↑', label: '上', action: function(){ pptOps.setTransition({ direction: 'from-top' }); } },
                { id: 'dir-bottom',icon: '↓', label: '下', action: function(){ pptOps.setTransition({ direction: 'from-bottom' }); } },
              ]},
              { title: '时长', buttons: [
                { id: 'dur-fast', icon: '⚡', label: '快',  action: function(){ pptOps.setTransition({ duration: 300 }); } },
                { id: 'dur-med',  icon: '⏸️', label: '中',  action: function(){ pptOps.setTransition({ duration: 500 }); }, active: true },
                { id: 'dur-slow', icon: '🐢', label: '慢',  action: function(){ pptOps.setTransition({ duration: 1000 }); } },
              ]},
              { title: '操作', buttons: [
                { id: 'apply-all', icon: '📋', label: '应用到全部', action: pptOps.applyToAll },
                { id: 'slideshow', icon: '▶️', label: '开始放映', large: true, action: pptOps.startSlideshow },
              ]},
            ],
          },
          {
            id: 'animate', label: '💫 Animations',
            groups: [
              { title: '目标', buttons: [
                { id: 'anim-title',   icon: '📝', label: '标题',   action: function(){ pptOps.setAnimTarget('title'); } },
                { id: 'anim-content', icon: '📄', label: '正文',   action: function(){ pptOps.setAnimTarget('content'); } },
              ]},
              { title: '效果', buttons: [
                { id: 'anim-fade',    icon: '🌫️', label: '淡入',  action: function(){ pptOps.setAnimEffect('fade'); } },
                { id: 'anim-fly',     icon: '✈️',  label: '飞入',  action: function(){ pptOps.setAnimEffect('fly-in'); } },
                { id: 'anim-zoom',    icon: '🔍', label: '缩放',  action: function(){ pptOps.setAnimEffect('zoom'); } },
                { id: 'anim-bounce',  icon: '🌀', label: '弹入',  action: function(){ pptOps.setAnimEffect('bounce'); } },
              ]},
              { title: '触发', buttons: [
                { id: 'trig-click', icon: '👆', label: '点击', action: function(){ pptOps.setAnimTrigger('onClick'); }, active: true },
                { id: 'trig-auto',  icon: '⏩', label: '自动', action: function(){ pptOps.setAnimTrigger('auto'); } },
              ]},
              { title: '时长', buttons: [
                { id: 'anim-dur-fast', icon: '⚡', label: '快', action: function(){ pptOps.setAnimDuration(300); } },
                { id: 'anim-dur-med',  icon: '⏸️', label: '中', action: function(){ pptOps.setAnimDuration(500); }, active: true },
                { id: 'anim-dur-slow', icon: '🐢', label: '慢', action: function(){ pptOps.setAnimDuration(1000); } },
              ]},
            ],
          },
        ],
        active: 'home',
      });
    }

    // 编辑同步
    var titleEl = w.$c.querySelector('#ppt-title');
    var contentEl = w.$c.querySelector('#ppt-content');
    applyLayout(s.layout, titleEl, contentEl);
    titleEl.oninput = function() { slides[cur].title = this.value; updateThumb(); markPptDirty(); };
    contentEl.oninput = function() { slides[cur].content = this.value; markPptDirty(); };
    var dragSrcIdx = -1;
    w.$c.querySelectorAll('.ppt-thumb').forEach(function(el) {
      el.onclick = function() {
        if (titleEl) slides[cur].title = titleEl.value;
        if (contentEl) slides[cur].content = contentEl.value;
        cur = parseInt(this.dataset.i);
        render();
      };
      // v0.62.6: PPT 拖拽排序 (HTML5 Drag & Drop)
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
        // 移动 slides 数组
        var item = slides.splice(fromIdx, 1)[0];
        slides.splice(toIdx, 0, item);
        cur = toIdx;
        markPptDirty();
        render();
      };
      // v0.62.6: PPT 缩略图右键菜单
      el.oncontextmenu = function (e) {
        e.preventDefault();
        e.stopPropagation();
        var idx = parseInt(this.dataset.i);
        showCtxMenu([
          { label: '\u2795 \u65B0\u5EFA\u5E7B\u706F\u7247', action: function () {
            slides.splice(idx + 1, 0, { title: '\u65B0\u9875\u9762', content: '', layout: 'content', transition: { type: 'none', direction: 'from-right', duration: 500 } });
            cur = idx + 1; markPptDirty(); render();
          }},
          { label: '📋 复制幻灯片', action: function () {
            var copy = JSON.parse(JSON.stringify(slides[idx]));
            slides.splice(idx + 1, 0, copy);
            cur = idx + 1; markPptDirty(); render();
          }},
          { label: '\u2716 \u5220\u9664', action: function () {
            if (slides.length <= 1) return toast('\u81F3\u5C11\u4FDD\u7559\u4E00\u9875', 'warning');
            slides.splice(idx, 1);
            if (cur >= slides.length) cur = slides.length - 1;
            markPptDirty(); render();
          }},
          '-',
          { label: '\u53D6\u6D88', action: function () {} },
        ], e.clientX, e.clientY);
      };
    });

    function updateThumb() {
      var thumbs = w.$c.querySelectorAll('.ppt-thumb');
      if (thumbs[cur]) {
        var t = thumbs[cur].querySelector('div:nth-child(2)');
        if (t) t.textContent = (slides[cur].title || '无标题').slice(0, 10);
      }
    }
function updateStatus() {
      var bar = w.$c.querySelector('#ppt-status');
      if (!bar) return;
      var lbl = slides[cur].layout === 'cover' ? '封面' : (slides[cur].layout === 'blank' ? '空白' : '内容页');
      bar.innerHTML = '<span>第 ' + (cur+1) + ' / ' + slides.length + ' 页</span><span>' + lbl + ' 布局</span>';
    }

    // v0.62.5: PPT 保存函数（Ribbon "保存" 按钮 + 标题栏 "保存" 按钮共用）
    function savePpt() {
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
          body: JSON.stringify({ type: 'pptx', name: name, data: { title: name.replace(/\.pptx$/, ''), slides: slides } }),
        }).then(function(r){ return r.json(); }).then(function(r){
          if (r.ok) {
            toast('已保存 ✅ ' + name + ' (' + r.size + ' bytes)', 'success');
            var dot = w.$c.querySelector('#ppt-modified-dot');
            if (dot) { dot.classList.remove('is-dirty'); dot.classList.add('is-saved'); dot.title = '已保存'; setTimeout(function(){ dot.classList.remove('is-saved'); }, 1200); }
          }
          else toast('保存失败: ' + (r.error || '未知'), 'error');
        }).catch(function(e){ toast('保存失败: ' + e.message, 'error'); });
      });
    }

    // 标题栏 "保存" 按钮 — 调 savePpt（v0.62.5 重构）
    var saveBtn = w.$c.querySelector('#ppt-save-btn');
    if (saveBtn) saveBtn.onclick = function () { savePpt(); };
  }

  // 初始状态入 undo 栈
  setTimeout(function () { pptPushUndo(); }, 100);
  render();
}

// ===== 注册全局函数供 PKG 调用 =====
window.openWordEditor = openWordEditor;
window.openExcelEditor = openExcelEditor;
window.openPptEditor = openPptEditor;

// ===== v0.62.4 全局 helper：让 chat / file-browser / delivery 等地方能一键打开文件到块编辑器 =====
// 用法：ACMS.openInOfficeEditor(fileId, fileName, source)
//   source = 'office' (默认) | 'chat'
// 行为：开 office-word PKG，把指定 fileId 的内容加载进块编辑器
window.ACMS = window.ACMS || {};
window.ACMS.openInOfficeEditor = function (fileId, fileName, source) {
  if (typeof openWordEditor !== 'function') {
    if (typeof toast === 'function') toast('块编辑器未加载', 'error');
    return;
  }
  // 构造一个 mock PKG window（复用 PKG 窗口的 $c 接口）
  var pkgWindow = {
    $c: document.createElement('div'),
    _isMock: true,
    _fileId: fileId,
    _fileName: fileName,
  };
  pkgWindow.$c.style.cssText = 'position:fixed;top:5%;left:5%;width:90%;height:90%;background:#fafaf6;border:2px solid #5b8c5a;box-shadow:0 8px 32px rgba(0,0,0,0.3);z-index:9999;display:flex;flex-direction:column';
  var header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;padding:8px 12px;background:#5b8c5a;color:white;flex-shrink:0';
  header.innerHTML = '<span style="flex:1;font-weight:600">📝 ' + (fileName || 'Word 文档') + '</span><button id="acms-office-close" style="background:#fff;color:#333;border:none;padding:4px 12px;cursor:pointer">✕ 关闭</button>';
  pkgWindow.$c.appendChild(header);
  var body = document.createElement('div');
  body.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column';
  pkgWindow.$c.appendChild(body);
  pkgWindow.$c = body; // 替换 $c 为实际编辑器区
  document.body.appendChild(pkgWindow.$c.parentElement); // 整个浮层
  openWordEditor(pkgWindow, fileId, fileName);
  document.getElementById('acms-office-close').onclick = function () {
    var overlay = pkgWindow.$c.parentElement;
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };
};
