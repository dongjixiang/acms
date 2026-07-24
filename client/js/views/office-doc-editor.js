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
    var state = { doc: doc || OfficeDoc.makeDocument({ title: opts.title || 'untitled' }), onChange: opts.onChange || null };
    renderAll(container, state);
    return {
      getDocument: function () { return state.doc; },
      getMarkdown: function () { return OfficeDocConverter.documentToMarkdown(state.doc); },
      destroy: function () { container.innerHTML = ''; container.classList.remove('ode-editor'); },
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
    content.textContent = c;
    if (block.type === 'heading') {
      content.className = 'ode-content ode-heading ode-h' + (a.level || 1);
    } else if (block.type === 'quote') {
      content.className = 'ode-content ode-quote';
    } else if (block.type === 'code') {
      content.className = 'ode-content ode-code';
      content.style.fontFamily = 'Consolas, monospace';
    } else if (block.type === 'todo' && a.checked) {
      content.classList.add('ode-todo-done');
    }
    bindContentEvents(content, block, state);
    main.appendChild(content);
    return main;
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
    content.oninput = function () {
      OfficeDoc.updateBlock(state.doc, block.id, { content: content.textContent });
      notifyChange(state);
    };
    content.onkeydown = function (e) {
      // Enter → 新建一个 paragraph 跟在后面
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        var newBlock = OfficeDoc.paragraph('');
        var idx = state.doc.blocks.findIndex(function (b) { return b.id === block.id; });
        OfficeDoc.insertBlock(state.doc, newBlock, idx + 1);
        notifyChange(state);
        var container = content.closest('.ode-editor');
        rerender(container, state);
        // 聚焦新 block
        setTimeout(function () {
          var newEl = container.querySelector('[data-block-id="' + newBlock.id + '"] .ode-content');
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
        var container2 = content.closest('.ode-editor');
        rerender(container2, state);
        if (prevBlock) {
          setTimeout(function () {
            var prevEl = container2.querySelector('[data-block-id="' + prevBlock.id + '"] .ode-content');
            if (prevEl) { prevEl.focus(); placeCaretAtEnd(prevEl); }
          }, 0);
        }
        return;
      }
    };
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

  // ──────────── 导出 ────────────
  var OfficeDocEditor = { mountEditor: mountEditor };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = OfficeDocEditor;
  } else {
    root.OfficeDocEditor = OfficeDocEditor;
  }
})(typeof window !== 'undefined' ? window : globalThis);
