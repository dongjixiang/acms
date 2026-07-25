// ACMS 块编辑器 UI（v0.62 块编辑器核心）
// 位置：client/js/views/office-doc-editor.js
//
// 极简实现：每个 block 是一个 contenteditable 元素
// Enter 键：分裂当前块（创建新块跟在后面）
// Backspace 在空块上：删除当前块，光标回到上一个块的末尾
// Block 间切换类型：点击左侧 + 按钮 → 弹出类型菜单
//
// 设计原则（学 Notion）：
//   - 块间无可见边框（看起来是连续流）
//   - hover 块时显示左侧的"块操作按钮"（+、delete、↑↓）
//   - / 命令（占位，留给 PR 3 扩展）

(function (root) {
  'use strict';

// ──────────── 主入口：mount 到一个容器 ────────────
  function mountEditor(container, doc, opts) {
    opts = opts || {};
    if (typeof container === 'string') container = document.getElementById(container);
    if (!container) throw new Error('office-doc-editor: container not found');
    container.innerHTML = '';
    container.classList.add('ode-editor');
    var state = {
      doc: doc || OfficeDoc.makeDocument({ title: opts.title || 'untitled' }),
      onChange: opts.onChange || null,
      currentBlockId: null,   // v0.62.5: 跟踪当前 focus 的 block（Ribbon 需要）
    };
    // v0.62.2: 空 doc 自动加 1 个 paragraph（mountEditor 内部已处理）
    if (state.doc.blocks.length === 0) {
      state.doc.blocks.push(OfficeDoc.paragraph(''));
    }
    renderAll(container, state);

    // ──────── v0.62.5: Ribbon 友好的 instance API ────────

    function getContainer() { return container; }

    function findBlockIdx(blockId) {
      return state.doc.blocks.findIndex(function (b) { return b.id === blockId; });
    }

    function focusBlock(blockId, position) {
      setTimeout(function () {
        var el = container.querySelector('[data-block-id="' + blockId + '"] .ode-content');
        if (el) {
          el.focus();
          if (position === 'end') placeCaretAtEnd(el);
          else placeCaretAtStart(el);
        }
      }, 0);
    }

    function getCurrentBlock() {
      return state.currentBlockId
        ? state.doc.blocks.find(function (b) { return b.id === state.currentBlockId; }) || null
        : null;
    }

    // v0.62.5: 工厂分发 — 支持 OfficeDoc.paragraph(...) / .heading(c, level) / .table(...) 等
    // v0.62.5 PR-W2: instance API 扩展 — 块级 formatting (align/fontSize/fontFamily/bold/italic/underline)
    function getBlockFormatting(blockId) {
      var b = state.doc.blocks.find(function (x) { return x.id === blockId; });
      if (!b || !b.attrs) return {};
      return b.attrs.formatting || {};
    }
    function setBlockFormatting(blockId, fmtPatch) {
      var b = state.doc.blocks.find(function (x) { return x.id === blockId; });
      if (!b) return false;
      var cur = (b.attrs && b.attrs.formatting) || {};
      var next = Object.assign({}, cur, fmtPatch);
      // 清掉 false/空 值
      Object.keys(next).forEach(function (k) {
        if (next[k] === false || next[k] === '' || next[k] == null) delete next[k];
      });
      var attrs = Object.assign({}, b.attrs, { formatting: next });
      OfficeDoc.updateBlock(state.doc, blockId, { attrs: attrs });
      notifyChange(state);
      rerender(container, state);
      focusBlock(blockId, 'end');
      return true;
    }
    function toggleInlineFormat(blockId, marker) {
      // PR-W2: 利用 schema 现有 parseInline 支持的 markdown 行内语法
      //   **bold** *italic* `code` [link](url) __underline__
      var b = state.doc.blocks.find(function (x) { return x.id === blockId; });
      if (!b || !b.content) return false;
      var content = b.content;
      var m;
      if (marker === 'bold') m = /^\*\*(.*)\*\*$/.exec(content);
      if (marker === 'italic') m = /^\*(.*)\*$/.exec(content);
      if (marker === 'underline') m = /^__(.*)__$/.exec(content);
      if (marker === 'code') m = /^`(.*)`$/.exec(content);
      var newContent;
      if (m) {
        // 已经包了 → 去掉
        newContent = m[1];
      } else {
        // 没包 → 包上
        var pair = (marker === 'bold') ? ['**', '**']
                 : (marker === 'italic') ? ['*', '*']
                 : (marker === 'underline') ? ['__', '__']
                 : ['`', '`'];
        newContent = pair[0] + content + pair[1];
      }
      OfficeDoc.updateBlock(state.doc, blockId, { content: newContent });
      notifyChange(state);
      rerender(container, state);
      focusBlock(blockId, 'end');
      return true;
    }

    function makeBlockByType(type, attrs, content) {
      var factory = OfficeDoc[type];
      if (typeof factory === 'function') {
        // heading 需要 level, 其它用 content/attrs
        if (type === 'heading') return factory(content || '', (attrs && attrs.level) || 1);
        return factory(content || '');
      }
      // fallback: 直接构造
      var b = {
        id: typeof OfficeDoc.uuid === 'function' ? OfficeDoc.uuid()
             : Math.random().toString(36).slice(2) + Date.now().toString(36),
        type: type,
        attrs: attrs || {},
        content: content || '',
      };
      if (type === 'heading' && b.attrs.level === undefined) b.attrs.level = 1;
      if (type === 'todo') b.attrs.checked = b.attrs.checked === true;
      return b;
    }

    // v0.62.5: 在某块后(或末尾)插入新类型块
    function addBlock(type, attrs, content, afterBlockId) {
      var newBlock = makeBlockByType(type, attrs, content);
      var insertIdx;
      if (afterBlockId) {
        var idx = findBlockIdx(afterBlockId);
        insertIdx = idx >= 0 ? idx + 1 : state.doc.blocks.length;
      } else {
        insertIdx = state.doc.blocks.length;
      }
      OfficeDoc.insertBlock(state.doc, newBlock, insertIdx);
      notifyChange(state);
      rerender(container, state);
      focusBlock(newBlock.id, 'start');
      return newBlock.id;
    }

    function changeBlockType(blockId, newType) {
      OfficeDoc.updateBlock(state.doc, blockId, { type: newType });
      notifyChange(state);
      rerender(container, state);
      focusBlock(blockId, 'end');
    }

    function deleteBlock(blockId) {
      if (state.doc.blocks.length <= 1) return false;
      var idx = findBlockIdx(blockId);
      if (idx < 0) return false;
      var prevBlock = state.doc.blocks[idx - 1];
      OfficeDoc.removeBlock(state.doc, blockId);
      notifyChange(state);
      rerender(container, state);
      if (prevBlock) focusBlock(prevBlock.id, 'end');
      return true;
    }

    function moveBlockUp(blockId) {
      var idx = findBlockIdx(blockId);
      if (idx <= 0) return false;
      OfficeDoc.moveBlock(state.doc, blockId, idx - 1);
      notifyChange(state);
      rerender(container, state);
      return true;
    }

    function moveBlockDown(blockId) {
      var idx = findBlockIdx(blockId);
      if (idx < 0 || idx >= state.doc.blocks.length - 1) return false;
      OfficeDoc.moveBlock(state.doc, blockId, idx + 2);
      notifyChange(state);
      rerender(container, state);
      return true;
    }

    return {
      // 原有 API
      getDocument: function () { return state.doc; },
      getMarkdown: function () { return OfficeDocConverter.documentToMarkdown(state.doc); },
      destroy: function () { container.innerHTML = ''; container.classList.remove('ode-editor'); },
      // v0.62.5: 新 API（Ribbon 用）
      getCurrentBlockId: function () { return state.currentBlockId; },
      getCurrentBlock: getCurrentBlock,
      getBlock: function (id) { return state.doc.blocks.find(function (b) { return b.id === id; }) || null; },
      getAllBlocks: function () { return state.doc.blocks.slice(); },
      focusBlock: focusBlock,
      addBlock: addBlock,
      changeBlockType: changeBlockType,
      deleteBlock: deleteBlock,
      moveBlockUp: moveBlockUp,
      moveBlockDown: moveBlockDown,
      // PR-W2: 块级 formatting + 行内格式 toggle
      getBlockFormatting: getBlockFormatting,
      setBlockFormatting: setBlockFormatting,
      toggleInlineFormat: toggleInlineFormat,
      // 触发重新渲染（外部 schema 改了之后用）
      rerender: function () { rerender(container, state); },
    };
  }

  // ──────────── 渲染所有块 ────────────
  function renderAll(container, state) {
    var list = document.createElement('div');
    list.className = 'ode-block-list';
    container.appendChild(list);
    list.appendChild(renderToolbar(container, state));

    for (var i = 0; i < state.doc.blocks.length; i++) {
      list.appendChild(renderBlock(state.doc.blocks[i], state, i));
    }

    // 末尾的"添加块"按钮
    var addAtEnd = document.createElement('button');
    addAtEnd.className = 'ode-add-end';
    addAtEnd.textContent = '+ 添加块';
    addAtEnd.onclick = function () { addBlockAfter(container, state, state.doc.blocks.length - 1); };
    list.appendChild(addAtEnd);
  }

  // ──────────── 顶部 toolbar（保存/导出为 markdown/导出为 docx） ────────────
  function renderToolbar(container, state) {
    var bar = document.createElement('div');
    bar.className = 'ode-toolbar';
    bar.innerHTML =
      '<span class="ode-title">📝 ' + escapeHtml(state.doc.meta.title) + '</span>' +
      '<button data-act="save">💾 保存</button>' +
      '<button data-act="export-md">导出 .md</button>' +
      '<button data-act="export-docx">导出 .docx</button>';
    bar.querySelector('[data-act="save"]').onclick = function () { notifyChange(state); console.log('[office-doc] 已保存', OfficeDocConverter.documentToMarkdown(state.doc)); };
    bar.querySelector('[data-act="export-md"]').onclick = function () { downloadText(state.doc.meta.title + '.md', OfficeDocConverter.documentToMarkdown(state.doc)); };
    bar.querySelector('[data-act="export-docx"]').onclick = function () { exportDocx(state); };
    return bar;
  }

  // ──────────── 渲染单个 block ────────────
  function renderBlock(block, state, idx) {
    var wrap = document.createElement('div');
    wrap.className = 'ode-block ode-block-' + block.type;
    wrap.dataset.blockId = block.id;
    wrap.dataset.blockIdx = idx;

    // 左侧 hover 显示的"块操作栏"
    var handle = document.createElement('div');
    handle.className = 'ode-handle';
    handle.innerHTML =
      '<button data-handle="add" title="在此后插入块">+</button>' +
      '<button data-handle="up" title="上移">↑</button>' +
      '<button data-handle="down" title="下移">↓</button>' +
      '<button data-handle="del" title="删除">✕</button>';
    handle.querySelector('[data-handle="add"]').onclick = function (e) { e.preventDefault(); addBlockAfter(wrap.parentNode.parentNode, state, idx); };
    handle.querySelector('[data-handle="up"]').onclick = function (e) { e.preventDefault(); OfficeDoc.moveBlock(state.doc, block.id, Math.max(0, idx - 1)); notifyChange(state); rerender(wrap.parentNode.parentNode.parentNode, state); };
    handle.querySelector('[data-handle="down"]').onclick = function (e) { e.preventDefault(); OfficeDoc.moveBlock(state.doc, block.id, idx + 2); notifyChange(state); rerender(wrap.parentNode.parentNode.parentNode, state); };
    handle.querySelector('[data-handle="del"]').onclick = function (e) { e.preventDefault(); OfficeDoc.removeBlock(state.doc, block.id); notifyChange(state); rerender(wrap.parentNode.parentNode.parentNode, state); };
    wrap.appendChild(handle);

    // 类型切换器（点击 block 标签可改类型）
    var typeBadge = document.createElement('span');
    typeBadge.className = 'ode-type-badge';
    typeBadge.textContent = OfficeDoc.TYPE_LABELS[block.type] || block.type;
    typeBadge.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      showTypeMenu(typeBadge, block, state, wrap.parentNode.parentNode);
    };
    wrap.appendChild(typeBadge);

    // 主内容
    var main = renderBlockMain(block, state);
    wrap.appendChild(main);

    return wrap;
  }

  function renderBlockMain(block, state) {
    var c = block.content || '';
    var a = block.attrs || {};
    var fmt = a.formatting || {};
    var main = document.createElement('div');
    main.className = 'ode-main';

    if (block.type === 'divider') {
      main.innerHTML = '<hr class="ode-divider" />';
      return main;
    }
    if (block.type === 'image') {
      var img = document.createElement('div');
      img.className = 'ode-image-wrap';
      if (a.src) {
        img.innerHTML = '<img src="' + escapeAttr(a.src) + '" alt="' + escapeAttr(a.alt || '') + '" class="ode-image" />';
      } else {
        img.innerHTML = '<input type="text" placeholder="图片 URL" class="ode-image-src" value="" />';
        img.querySelector('input').oninput = function (e) {
          OfficeDoc.updateBlock(state.doc, block.id, { attrs: { src: e.target.value } });
          notifyChange(state);
        };
      }
      main.appendChild(img);
      return main;
    }
    if (block.type === 'todo') {
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = a.checked === true;
      cb.className = 'ode-todo-check';
      cb.onchange = function () {
        OfficeDoc.updateBlock(state.doc, block.id, { attrs: { checked: cb.checked } });
        notifyChange(state);
        var txt = main.querySelector('.ode-content');
        if (txt) txt.classList.toggle('ode-todo-done', cb.checked);
      };
      main.appendChild(cb);
    }

    var content = document.createElement('div');
    content.className = 'ode-content';
    content.contentEditable = 'true';
    content.spellcheck = false;
    content.dataset.placeholder = placeholderFor(block.type);
    // PR-W2: 块级 formatting — className + style
    if (fmt.align) content.classList.add('ode-align-' + fmt.align);
    if (fmt.fontSize) content.classList.add('ode-fs-' + fmt.fontSize);
    if (fmt.fontFamily) content.classList.add('ode-ff-' + fmt.fontFamily);
    // PR-W2: inline 格式 — 用 schema 现有 parseInline 转 HTML, escapeHtml 防 XSS
    if (block.type === 'code') {
      content.textContent = c;  // code 块纯文本, 不解析 inline
    } else {
      content.innerHTML = renderInlineHtml(c);
    }
    if (block.type === 'heading') {
      content.className += ' ode-heading ode-h' + (a.level || 1);
    } else if (block.type === 'quote') {
      content.className += ' ode-quote';
    } else if (block.type === 'code') {
      content.className += ' ode-code';
      content.style.fontFamily = 'Consolas, monospace';
    } else if (block.type === 'todo' && a.checked) {
      content.classList.add('ode-todo-done');
    }
    bindContentEvents(content, block, state);
    main.appendChild(content);
    return main;
  }

  // PR-W2: parseInline → escaped HTML (防 XSS)
  function renderInlineHtml(content) {
    if (!content) return '';
    var tokens = OfficeDoc.parseInline(content);
    var html = '';
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      var text = escapeHtml(t.text || '');
      if (t.type === 'bold') html += '<strong>' + text + '</strong>';
      else if (t.type === 'italic') html += '<em>' + text + '</em>';
      else if (t.type === 'code') html += '<code class="ode-inline-code">' + text + '</code>';
      else if (t.type === 'link') html += '<a href="' + escapeAttr(t.href || '#') + '" target="_blank" rel="noopener">' + text + '</a>';
      else html += text;
    }
    return html;
  }

  function placeholderFor(type) {
    return {
      heading: '标题',
      paragraph: '输入内容...',
      bulletList: '列表项',
      orderedList: '列表项',
      todo: '待办事项',
      quote: '引用内容',
      code: '代码',
      image: '图片',
      table: '表格',
      divider: '',
    }[type] || '';
  }

  // ──────────── 内容编辑事件 ────────────
  function bindContentEvents(content, block, state) {
    // v0.62.5: 记录当前 focus 的 block (Ribbon 需要 getCurrentBlockId)
    content.onfocus = function () { state.currentBlockId = block.id; };
    content.oninput = function () {
      OfficeDoc.updateBlock(state.doc, block.id, { content: content.textContent });
      notifyChange(state);
    };
    content.onkeydown = function (e) {
      // PR-W4: markdown shortcut — 输入 `# ` / `## ` / `### ` 空格后转 H1/H2/H3 (OO Word 行为)
      // 关键: onkeydown 触发时空格还没插入 DOM, 所以 txt 要 + ' ' 模拟
      // PR-W4 bug 修复: bindContentEvents 在 mountEditor 外, 不能直接调 focusBlock
      //   → 改成 inline 找 DOM + focus
      var mdShortcutEditor = content.closest('.ode-editor');
      function mdShortcutRefocus() {
        setTimeout(function () {
          if (!mdShortcutEditor) return;
          var targetEl = mdShortcutEditor.querySelector('[data-block-id="' + block.id + '"] .ode-content');
          if (targetEl) { targetEl.focus(); placeCaretAtStart(targetEl); }
        }, 0);
      }
      if (e.key === ' ') {
        var txt = (content.textContent || '') + ' ';  // 模拟空格
        var m;
        if ((m = /^(#{1,3})\s$/.exec(txt))) {
          e.preventDefault();
          var level = m[1].length;
          OfficeDoc.updateBlock(state.doc, block.id, {
            type: 'heading',
            content: '',
            attrs: Object.assign({}, block.attrs || {}, { level: level })
          });
          notifyChange(state);
          rerender(mdShortcutEditor, state);
          mdShortcutRefocus();
          return;
        }
        if (txt === '* ' || txt === '- ') {
          e.preventDefault();
          OfficeDoc.updateBlock(state.doc, block.id, { type: 'bulletList', content: '' });
          notifyChange(state);
          rerender(mdShortcutEditor, state);
          mdShortcutRefocus();
          return;
        }
        if (/^1\.\s$/.test(txt)) {
          e.preventDefault();
          OfficeDoc.updateBlock(state.doc, block.id, { type: 'orderedList', content: '' });
          notifyChange(state);
          rerender(mdShortcutEditor, state);
          mdShortcutRefocus();
          return;
        }
        if (txt === '[] ' || txt === '[ ] ') {
          e.preventDefault();
          OfficeDoc.updateBlock(state.doc, block.id, { type: 'todo', content: '', attrs: Object.assign({}, block.attrs || {}, { checked: false }) });
          notifyChange(state);
          rerender(mdShortcutEditor, state);
          mdShortcutRefocus();
          return;
        }
        if (txt === '> ') {
          e.preventDefault();
          OfficeDoc.updateBlock(state.doc, block.id, { type: 'quote', content: '' });
          notifyChange(state);
          rerender(mdShortcutEditor, state);
          mdShortcutRefocus();
          return;
        }
        if (txt === '```' || txt === '``` ') {
          e.preventDefault();
          OfficeDoc.updateBlock(state.doc, block.id, { type: 'code', content: '' });
          notifyChange(state);
          rerender(mdShortcutEditor, state);
          mdShortcutRefocus();
          return;
        }
        if (/^-{3,}\s*$/.test(txt)) {
          e.preventDefault();
          instance_addBlockAfter(block.id, 'divider');
          content.textContent = '';
          OfficeDoc.updateBlock(state.doc, block.id, { content: '' });
          notifyChange(state);
          rerender(mdShortcutEditor, state);
          setTimeout(function () {
            var el = content.closest('.ode-editor');
            if (el) {
              var next = el.querySelectorAll('.ode-block');
              if (next.length) {
                var last = next[next.length - 1].querySelector('.ode-content');
                if (last) { last.focus(); placeCaretAtEnd(last); }
              }
            }
          }, 0);
          return;
        }
      }
      // Enter → 新建一个 paragraph 跟在后面
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        var newBlock = OfficeDoc.paragraph('');
        var idx = state.doc.blocks.findIndex(function (b) { return b.id === block.id; });
        // PR-W4: heading 后 Enter 自动转普通段落 (OO Word 行为)
        if (block.type === 'heading') {
          newBlock = OfficeDoc.paragraph('');
        }
        OfficeDoc.insertBlock(state.doc, newBlock, idx + 1);
        notifyChange(state);
        var container2 = content.closest('.ode-editor');
        rerender(container2, state);
        // 聚焦新 block
        setTimeout(function () {
          var newEl = container2.querySelector('[data-block-id="' + newBlock.id + '"] .ode-content');
          if (newEl) { newEl.focus(); placeCaretAtStart(newEl); }
        }, 0);
        return;
      }
      // Backspace 在空块上 → 删除当前块
      if (e.key === 'Backspace' && content.textContent === '') {
        if (state.doc.blocks.length === 1) return; // 至少保留 1 个块
        e.preventDefault();
        var idx2 = state.doc.blocks.findIndex(function (b) { return b.id === block.id; });
        var prevBlock = state.doc.blocks[idx2 - 1];
        OfficeDoc.removeBlock(state.doc, block.id);
        notifyChange(state);
        var container3 = content.closest('.ode-editor');
        rerender(container3, state);
        if (prevBlock) {
          setTimeout(function () {
            var prevEl = container3.querySelector('[data-block-id="' + prevBlock.id + '"] .ode-content');
            if (prevEl) { prevEl.focus(); placeCaretAtEnd(prevEl); }
          }, 0);
        }
        return;
      }
    };
  }

  // PR-W4: helper — 简化 addBlockAfter 调用 (markdown shortcut 用)
  function instance_addBlockAfter(afterBlockId, type) {
    var nb = makeBlockByType(type, null, '');
    var idx = state.doc.blocks.findIndex(function (b) { return b.id === afterBlockId; });
    OfficeDoc.insertBlock(state.doc, nb, idx >= 0 ? idx + 1 : state.doc.blocks.length);
  }

  // ──────────── 块类型菜单 ────────────
  function showTypeMenu(badge, block, state, container) {
    var existing = document.querySelector('.ode-type-menu');
    if (existing) existing.remove();
    var menu = document.createElement('div');
    menu.className = 'ode-type-menu';
    var types = Object.keys(OfficeDoc.TYPES);
    for (var i = 0; i < types.length; i++) {
      var t = types[i];
      var item = document.createElement('button');
      item.textContent = OfficeDoc.TYPE_LABELS[t] || t;
      item.onclick = function (tt) {
        return function () {
          var newType = OfficeDoc.TYPES[tt];
          var current = block;
          // 简单处理：只改 type，保留 content 和 attrs
          OfficeDoc.updateBlock(state.doc, current.id, { type: newType });
          notifyChange(state);
          menu.remove();
          rerender(container, state);
        };
      }(t);
      menu.appendChild(item);
    }
    badge.appendChild(menu);
    setTimeout(function () {
      var onClickAway = function () {
        menu.remove();
        document.removeEventListener('click', onClickAway);
      };
      document.addEventListener('click', onClickAway);
    }, 0);
  }

  // ──────────── 在某位置后插入新块 ────────────
  function addBlockAfter(container, state, idx) {
    var b = OfficeDoc.paragraph('');
    OfficeDoc.insertBlock(state.doc, b, idx + 1);
    notifyChange(state);
    rerender(container, state);
    setTimeout(function () {
      var el = container.querySelector('[data-block-id="' + b.id + '"] .ode-content');
      if (el) { el.focus(); placeCaretAtStart(el); }
    }, 0);
  }

  function rerender(container, state) {
    if (!container) return;
    container.innerHTML = '';
    renderAll(container, state);
  }

  // ──────────── 导出 ────────────
  function downloadText(name, text) {
    var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 100);
  }

  function exportDocx(state) {
    if (typeof window.docx === 'undefined') {
      alert('docx npm 包未加载（需要通过打包工具引入）\n\n降级：可导出 .md');
      return;
    }
    var p = OfficeDocConverter.blocksToDocxBuffer(state.doc.blocks, window.docx);
    if (!p) {
      alert('导出失败');
      return;
    }
    Promise.resolve(p).then(function (buf) {
      var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = state.doc.meta.title + '.docx'; a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 100);
    });
  }

  // ──────────── 工具函数 ────────────
  function notifyChange(state) {
    if (typeof state.onChange === 'function') state.onChange(state.doc);
  }
  function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
  function placeCaretAtStart(el) {
    var r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(true);
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
  function placeCaretAtEnd(el) {
    var r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  // ──────────── Bubble Menu (PR-W6: 选中文字浮动工具栏) ────────────
  // 监听 selectionchange, 选中 .ode-content 内文字时显示浮动 B/I/U 工具栏
  // 用 DOM 操作 + dispatch input 触发 oninput handler (跟用户输入同一路径)
  var odBubbleMenu = (function () {
    var menu = document.createElement('div');
    menu.className = 'ode-bubble-menu';
    menu.style.cssText = 'position:fixed;z-index:9999;background:white;border:1px solid #d0d0d0;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.12);padding:4px 6px;display:none;gap:2px;align-items:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif';
    var btns = [
      { id: 'bold',      label: 'B', title: '粗体 **', style: 'font-weight:700' },
      { id: 'italic',    label: 'I', title: '斜体 *',  style: 'font-style:italic' },
      { id: 'underline', label: 'U', title: '下划线 __', style: 'text-decoration:underline' },
      { id: 'code',      label: '</>', title: '代码 `' },
    ];
    btns.forEach(function (b) {
      var btn = document.createElement('button');
      btn.dataset.bubbleId = b.id;
      btn.title = b.title;
      btn.textContent = b.label;
      btn.style.cssText = 'background:transparent;border:none;padding:4px 8px;cursor:pointer;border-radius:3px;font-size:13px;color:#333;min-width:24px;' + (b.style || '');
      btn.onmouseover = function () { btn.style.background = '#f0f0f0'; };
      btn.onmouseout = function () { btn.style.background = 'transparent'; };
      btn.onmousedown = function (e) {
        // mousedown 阻止默认, 避免 selection 丢失
        e.preventDefault();
        applyMarkdownWrap(b.id);
        hideMenu();
      };
      menu.appendChild(btn);
    });
    document.body.appendChild(menu);

    function applyMarkdownWrap(marker) {
      var sel = window.getSelection();
      if (!sel.rangeCount) return;
      var text = sel.toString();
      if (!text) return;
      var pair = (marker === 'bold')      ? ['**', '**']
               : (marker === 'italic')    ? ['*', '*']
               : (marker === 'underline') ? ['__', '__']
               : (marker === 'code')      ? ['`', '`']
               : ['', ''];
      // 检测已包 → 去掉; 没包 → 加上
      var isWrapped = (marker === 'bold'      && /^\*\*[\s\S]*\*\*$/.test(text))
                   || (marker === 'italic'    && /^\*[\s\S]*\*$/.test(text))
                   || (marker === 'underline' && /^__[\s\S]*__$/.test(text))
                   || (marker === 'code'      && /^`[\s\S]*`$/.test(text));
      var newText = isWrapped
        ? text.slice(pair[0].length, text.length - pair[0].length)
        : pair[0] + text + pair[1];
      // 用 document.execCommand 替换 selection (保留 undo 历史)
      try {
        document.execCommand('insertText', false, newText);
      } catch (e) {
        // execCommand 不可用时 fallback: 直接 range 替换
        var range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(newText));
        // 触发 input 事件
        var container = range.startContainer;
        while (container && !(container.classList && container.classList.contains('ode-content'))) {
          container = container.parentNode;
        }
        if (container) container.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    function showMenu(rect) {
      // toolbar 显示在选区上方
      menu.style.display = 'flex';
      menu.style.left = (rect.left + rect.width / 2 - menu.offsetWidth / 2) + 'px';
      menu.style.top = (rect.top - menu.offsetHeight - 8) + 'px';
    }
    function hideMenu() { menu.style.display = 'none'; }

    // 监听 selectionchange (但只在 selection 在 .ode-content 内时显示)
    document.addEventListener('selectionchange', function () {
      var sel = window.getSelection();
      if (!sel.rangeCount) { hideMenu(); return; }
      var node = sel.anchorNode;
      // 找最近的 .ode-content
      while (node && node.nodeType !== 1) node = node.parentNode;
      while (node && !(node.classList && node.classList.contains('ode-content'))) {
        node = node.parentNode;
      }
      if (!node) { hideMenu(); return; }
      var text = sel.toString();
      if (!text || text.length < 1) { hideMenu(); return; }
      // collapsed selection (只有光标, 没有选区) 不显示
      if (sel.isCollapsed) { hideMenu(); return; }
      // 显示菜单
      var range = sel.getRangeAt(0);
      var rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) { hideMenu(); return; }
      showMenu(rect);
    });

    // 滚动/编辑器 resize 时隐藏
    window.addEventListener('scroll', hideMenu, true);
    window.addEventListener('resize', hideMenu);

    return { menu: menu, hideMenu: hideMenu };
  })();

  // ──────────── 导出 ────────────
  var OfficeDocEditor = { mountEditor: mountEditor };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = OfficeDocEditor;
  } else {
    root.OfficeDocEditor = OfficeDocEditor;
  }
})(typeof window !== 'undefined' ? window : globalThis);
