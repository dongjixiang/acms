// ACMS Word 编辑器 — 依赖 office-common.js (escHtml, showCtxMenu)

function openWordEditor(w, fileId, fileName) {
  console.log('[Word] openWordEditor called', { fileId, fileName, wcW: w.$c.offsetWidth, wcH: w.$c.offsetHeight });
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
  console.log('[Word] host after titlebar', { hostW: host.offsetWidth, hostH: host.offsetHeight });

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

  // v0.62.7: 文件来源: server(有fileId) / local(无fileId)
  var _isServerFile = !!fileId;
  var _fileId = fileId || null;

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
        // 解析 blocks：从 resp.text 或 resp.content (base64) 恢复
        if (resp.text) {
          // 尝试解析 markdown 格式（带 # 标题的纯文本）
          var lines = resp.text.split('\n');
          lines.forEach(function (line) {
            var trimmed = line.trim();
            if (!trimmed) return;
            // heading 检测
            var h = trimmed.match(/^(#{1,6})\s+(.+)$/);
            if (h) {
              doc.blocks.push(window.OfficeDoc.heading(h[2], h[1].length));
            } else {
              doc.blocks.push(window.OfficeDoc.paragraph(trimmed));
            }
          });
        } else {
          doc.blocks.push(window.OfficeDoc.paragraph(''));
        }
        if (doc.blocks.length === 0) {
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
      // v0.63 Phase2: 预设样式库（学 OO Styles 面板 — 每个样式 = type + formatting）
      _stylePresets: {
        'Normal':    { type: 'paragraph',    blockAttrs: {},                        formatting: {} },
        'Title':     { type: 'heading',       blockAttrs: { level: 1 },              formatting: { fontSize: 28, align: 'center', fontFamily: 'serif' } },
        'Subtitle':  { type: 'heading',       blockAttrs: { level: 2 },              formatting: { fontSize: 18, align: 'center', color: '#666', fontFamily: 'sans' } },
        'Heading 1': { type: 'heading',       blockAttrs: { level: 1 },              formatting: { fontSize: 22, align: 'left', fontFamily: 'serif' } },
        'Heading 2': { type: 'heading',       blockAttrs: { level: 2 },              formatting: { fontSize: 18, align: 'left', fontFamily: 'serif' } },
        'Heading 3': { type: 'heading',       blockAttrs: { level: 3 },              formatting: { fontSize: 16, align: 'left', fontFamily: 'serif' } },
        'Quote':     { type: 'quote',         blockAttrs: {},                        formatting: {} },
        'Code':      { type: 'code',          blockAttrs: {},                        formatting: {} },
      },
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
      // v0.63 Phase2: 应用预设样式（类型 + formatting 一次性设置）
      applyStyle: function (styleName) {
        var preset = wordOps._stylePresets[styleName];
        if (!preset) return;
        var cur = instance.getCurrentBlockId();
        if (cur) {
          instance.changeBlockType(cur, preset.type, preset.blockAttrs);
          instance.setBlockFormatting(cur, preset.formatting);
        } else {
          instance.addBlock(preset.type, preset.blockAttrs, '');
          instance.setBlockFormatting(instance.getCurrentBlockId(), preset.formatting);
        }
      },
      // v0.63 Phase2: 脚注
      _footnoteCounter: 0,
      insertFootnote: function () {
        var cur = instance.getCurrentBlockId();
        if (!cur) return toast('请先把光标放在正文块中', 'warning');
        var doc = instance.getDocument();
        var block = doc.blocks.find(function(b){ return b.id === cur; });
        if (!block || block.type !== 'paragraph') return toast('请在段落中插入脚注', 'warning');
        wordOps._footnoteCounter++;
        var fnId = 'fn-' + wordOps._footnoteCounter;
        var fnNum = wordOps._footnoteCounter;
        // 在光标处插入上标标记（用 contenteditable 选区操作）
        var sel = window.getSelection();
        if (sel.rangeCount && !sel.isCollapsed) {
          var range = sel.getRangeAt(0);
          var sup = document.createElement('sup');
          sup.className = 'ode-footnote-ref';
          sup.style.cssText = 'color:var(--office-primary,#446995);cursor:pointer;font-size:10px';
          sup.textContent = '[' + fnNum + ']';
          sup.title = '脚注 ' + fnNum + '：点击跳转到注释（双击编辑）';
          sup.ondblclick = function(e) {
            e.preventDefault();
            var newContent = prompt('编辑脚注内容：', '');
            if (newContent !== null) {
              var targetBlock = doc.blocks.find(function(b){ return b.id === fnId; });
              if (targetBlock) { targetBlock.content = newContent; instance.rerender(); }
            }
          };
          range.deleteContents();
          range.insertNode(sup);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
          // 在段落后插入脚注块
          var idx = doc.blocks.indexOf(block);
          doc.blocks.splice(idx + 1, 0, OfficeDoc.makeBlock('footnote', { id: fnId }, '点击脚注标记双击编辑...'));
          instance.rerender();
          setDirty(true);
          toast('已插入脚注 [' + fnNum + ']', 'success');
        }
      },
      // v0.63 Phase2: 生成目录
      generateTOC: function () {
        var doc = instance.getDocument();
        var tocBlocks = [];
        doc.blocks.forEach(function (b) {
          if (b.type === 'heading' && (b.attrs && b.attrs.level) && b.attrs.level <= 3 && b.content) {
            tocBlocks.push({ level: b.attrs.level, content: b.content, id: b.id });
          }
        });
        if (!tocBlocks.length) return toast('没有找到标题块，无法生成目录', 'warning');
        var cur = instance.getCurrentBlockId();
        var insertAt = cur ? (doc.blocks.findIndex(function(b){ return b.id === cur; }) + 1) : 0;
        // 在当前位置插入 TOC 块（如果是第一个块则插入到开头）
        if (insertAt === 0 && doc.blocks[0] && doc.blocks[0].type !== 'heading') {
          insertAt = 1;
        }
        // 创建 TOC 块
        var tocContent = '## 目录\n\n';
        tocBlocks.forEach(function (item) {
          var indent = '  '.repeat(item.level - 1);
          tocContent += indent + '- ' + item.content + '\n';
        });
        // 在 insertAt 位置插入 TOC block
        var tocBlock = OfficeDoc.makeBlock('heading', { level: 2 }, '目录');
        doc.blocks.splice(insertAt, 0, tocBlock);
        // 在 tocBlock 后插入一个 paragraph 包含目录内容
        var tocPara = OfficeDoc.makeBlock('paragraph', {}, tocContent);
        doc.blocks.splice(insertAt + 1, 0, tocPara);
        instance.rerender();
        setDirty(true);
        toast('已生成目录（' + tocBlocks.length + ' 个标题）', 'success');
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
                { id: 'format-painter', icon: '🖌', label: '格式刷', action: function(){ var cur = instance.getCurrentBlockId(); if (!cur) return toast('请先选中要复制格式的段落', 'warning'); wordOps.activateFormatPainter(cur); } },
              ]},
              { title: '字号', buttons: [
                { id: 'font-size', type: 'select', value: '16',
                  options: [
                    { value: '8', label: '8' }, { value: '9', label: '9' },
                    { value: '10', label: '10' }, { value: '11', label: '11' },
                    { value: '12', label: '12' }, { value: '14', label: '14' },
                    { value: '16', label: '16' }, { value: '18', label: '18' },
                    { value: '20', label: '20' }, { value: '22', label: '22' },
                    { value: '24', label: '24' }, { value: '30', label: '30' },
                    { value: '36', label: '36' }, { value: '48', label: '48' },
                  ],
                  action: function(val){ wordOps.setFontSize(parseInt(val)); },
                },
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
              { title: '样式库', buttons: [
                { id: 'style-normal',  icon: '¶',  label: '正文', large: true,
                  action: function(){ wordOps.applyStyle('Normal'); } },
                { id: 'style-title',   icon: 'T',  label: '标题', large: true,
                  action: function(){ wordOps.applyStyle('Title'); } },
                { id: 'style-h1',      icon: 'H1', label: '标题1', large: true,
                  action: function(){ wordOps.applyStyle('Heading 1'); } },
                { id: 'style-h2',      icon: 'H2', label: '标题2', large: true,
                  action: function(){ wordOps.applyStyle('Heading 2'); } },
                { id: 'style-h3',      icon: 'H3', label: '标题3', large: true,
                  action: function(){ wordOps.applyStyle('Heading 3'); } },
                { id: 'style-quote',   icon: '❝', label: '引用', large: true,
                  action: function(){ wordOps.applyStyle('Quote'); } },
                { id: 'style-code',    icon: '</>', label: '代码', large: true,
                  action: function(){ wordOps.applyStyle('Code'); } },
              ]},
              { title: '列表', buttons: [
                { id: 'bullet',  icon: '•',   label: '项目',   action: function(){ wordOps.setType('bulletList'); } },
                { id: 'ordered', icon: '1.',  label: '编号',   action: function(){ wordOps.setType('orderedList'); } },
                { id: 'todo',    icon: '☑',   label: '待办',   action: function(){ wordOps.setType('todo'); } },
              ]},
              { title: '元素', buttons: [
                { id: 'divider', icon: '─',  label: '分割线', action: function(){ wordOps.insertAfter('divider'); } },
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
          {
            id: 'references', label: '📑 References',
            groups: [
              { title: '引用', buttons: [
                { id: 'insert-fn', icon: '📝', label: '脚注', large: true, action: wordOps.insertFootnote },
                { id: 'gen-toc',   icon: '📋', label: '生成目录', large: true, action: wordOps.generateTOC },
              ]},
              { title: '分页', buttons: [
                { id: 'ref-page-break', icon: '➖', label: '分页符', action: wordOps.insertPageBreak },
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
    var d = instance.getDocument();
    var currentName = (titlebar.querySelector('#word-title-input').value || '').trim() || '文档';

    if (_isServerFile && _fileId) {
      // 服务器文件 → 直接覆写
      var payload = {
        type: 'docx', fileId: _fileId, name: currentName,
        data: { title: d.meta.title, blocks: d.blocks, content: window.OfficeDocConverter.documentToMarkdown(d) },
      };
      fetch('/api/office/save', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
        body: JSON.stringify(payload),
      }).then(function(r){return r.json()}).then(function(r){
        if (r.ok) { toast('已保存 ✅ ' + currentName, 'success'); setDirty(null); }
        else toast('保存失败: ' + (r.error || '未知错误'), 'error');
      }).catch(function(e){ toast('保存失败: ' + e.message, 'error'); });
    } else {
      // 新文件/本地文件 → 浏览器下载
      if (typeof showPrompt !== 'function') { toast('showPrompt 未加载', 'error'); return; }
      var name = await showPrompt({
        title: '保存 Word 文档', message: '输入文件名（将下载到本地）',
        placeholder: '文档', defaultValue: currentName.replace(/\.docx$/i, ''),
        multiline: false, minLength: 1,
      });
      if (!name) return;
      name = String(name).trim();
      if (!name.toLowerCase().endsWith('.docx')) name += '.docx';
      var md = window.OfficeDocConverter.documentToMarkdown(d);
      var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('已下载 ' + name, 'success');
      setDirty(null);
    }
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

