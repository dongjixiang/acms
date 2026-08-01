// ACMS 文档流编辑器（v0.62.7 重写 — 学 OO Word / Google Docs）
// 单 contenteditable div + <p>/<h1>/<ul> 标签
// 替代旧的块编辑器架构（每个 block 独立 contenteditable）
//
// 设计原则：
//   - 连续文档流（不是卡片/块列表）
//   - 选区格式（notion-style wrapper）
//   - Enter = 新段落（不分裂块）
//   - 数据层仍然用 block schema（向后兼容）
//   - 无块 UI chrome（无手柄/无徽章/无 + 按钮）

(function (root) {
  'use strict';

  // ─── Block type → HTML tag map ───
  var BLOCK_TAGS = {
    paragraph:    { tag: 'p',      cls: 'ode-p' },
    heading:      { tag: 'h1',     cls: 'ode-h' },
    bulletList:   { tag: 'ul',     cls: 'ode-ul' },
    orderedList:  { tag: 'ol',     cls: 'ode-ol' },
    todo:         { tag: 'div',    cls: 'ode-todo' },
    quote:        { tag: 'blockquote', cls: 'ode-quote' },
    code:         { tag: 'pre',    cls: 'ode-code' },
    divider:      { tag: 'hr',     cls: 'ode-hr' },
    image:        { tag: 'figure', cls: 'ode-figure' },
    table:        { tag: 'div',    cls: 'ode-table' },
    footnote:     { tag: 'div',    cls: 'ode-footnote' },
  };

  // ─── Tag → Block type reverse map ───
  function getTypeFromElement(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === 'p') return 'paragraph';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'ul') return 'bulletList';
    if (tag === 'ol') return 'orderedList';
    if (tag === 'blockquote') return 'quote';
    if (tag === 'pre') return 'code';
    if (tag === 'hr') return 'divider';
    if (tag === 'figure') return 'image';
    return el.dataset.btype || 'paragraph';
  }

  function getHeadingLevel(el) {
    var m = el.tagName.match(/^H([1-6])$/i);
    return m ? parseInt(m[1]) : 1;
  }

  // ─── Block → HTML ───
  function blockToHTML(block) {
    var type = block.type;
    if (type === 'divider') return '<hr data-bid="' + block.id + '" data-btype="divider">';
    if (type === 'image') {
      var a = block.attrs || {};
      return '<figure data-bid="' + block.id + '" data-btype="image"' +
        (a.src ? ' style="text-align:center"' : '') + '>' +
        (a.src ? '<img src="' + escAttr(a.src) + '" alt="' + escAttr(a.alt||'') + '" style="max-width:100%">' : '') +
        (a.alt ? '<figcaption>' + escHtml(a.alt) + '</figcaption>' : '') +
        '</figure>';
    }
    if (type === 'table') {
      var ta = block.attrs || {};
      var hdrs = ta.headers || [];
      var rows = ta.rows || [];
      var html = '<table data-bid="' + block.id + '" data-btype="table" style="border-collapse:collapse;width:100%"><thead><tr>';
      hdrs.forEach(function (h) { html += '<th style="border:1px solid #ccc;padding:6px;background:var(--bg2,#f5f5f5);font-weight:600">' + escHtml(h) + '</th>'; });
      html += '</tr></thead><tbody>';
      rows.forEach(function (row) {
        html += '<tr>';
        row.forEach(function (cell) { html += '<td style="border:1px solid #ccc;padding:6px">' + escHtml(cell) + '</td>'; });
        html += '</tr>';
      });
      html += '</tbody></table>';
      return html;
    }
    if (type === 'todo') {
      var t = block.attrs && block.attrs.checked;
      var todoItems = (block.content||'').split('\n').filter(function(s){ return s !== ''; });
      if (!todoItems.length) todoItems = [''];
      var todoHtml = todoItems.map(function(item){
        return '<span contenteditable="true" class="ode-ce" style="display:block;outline:none;padding:1px 0">' + escHtml(item) + '</span>';
      }).join('');
      return '<div data-bid="' + block.id + '" data-btype="todo" class="ode-todo" style="display:flex;align-items:flex-start;gap:8px">' +
        '<input type="checkbox" ' + (t ? 'checked' : '') + ' style="width:16px;height:16px;cursor:pointer;flex-shrink:0;margin-top:4px">' +
        '<div style="flex:1">' + todoHtml + '</div></div>';
    }
    if (type === 'code') {
      return '<pre data-bid="' + block.id + '" data-btype="code" style="background:var(--bg2,#f5f5f7);padding:12px;border-radius:4px;overflow-x:auto;font-family:Consolas,monospace;font-size:13px;line-height:1.5;white-space:pre-wrap" contenteditable="true" class="ode-ce">' + escHtml(block.content||'') + '</pre>';
    }
    if (type === 'bulletList') {
      var items = (block.content||'').split('\n').filter(function(s){ return s !== ''; });
      if (!items.length) items = [''];
      var lis1 = items.map(function(item){ return '<li contenteditable="true" class="ode-ce" style="outline:none">' + escHtml(item) + '</li>'; }).join('');
      return '<ul data-bid="' + block.id + '" data-btype="bulletList" style="margin:4px 0;padding-left:24px">' + lis1 + '</ul>';
    }
    if (type === 'orderedList') {
      var items2 = (block.content||'').split('\n').filter(function(s){ return s !== ''; });
      if (!items2.length) items2 = [''];
      var lis2 = items2.map(function(item){ return '<li contenteditable="true" class="ode-ce" style="outline:none">' + escHtml(item) + '</li>'; }).join('');
      return '<ol data-bid="' + block.id + '" data-btype="orderedList" style="margin:4px 0;padding-left:24px">' + lis2 + '</ol>';
    }
    if (type === 'quote') {
      return '<blockquote data-bid="' + block.id + '" data-btype="quote" style="margin:4px 0;padding:4px 16px;border-left:3px solid var(--office-primary,#446995);color:var(--text2,#666)">' +
        '<p contenteditable="true" class="ode-ce" style="outline:none;margin:0">' + escHtml(block.content||'') + '</p></blockquote>';
    }
    if (type === 'footnote') {
      var fnId = (block.attrs && block.attrs.id) || block.id;
      return '<div data-bid="' + block.id + '" data-btype="footnote" class="ode-footnote" style="margin:8px 0;padding:8px 12px;background:var(--office-xlsx-soft,#d8e8df);border-radius:4px;font-size:12px;color:var(--text2,#666)">' +
        '<sup style="color:var(--office-primary,#446995);font-weight:600;margin-right:6px">[' + fnId.replace('fn-','') + ']</sup>' +
        '<span contenteditable="true" class="ode-ce" style="outline:none">' + escHtml(block.content||'') + '</span>' +
        '</div>';
    }

    // paragraph / heading
    var info = BLOCK_TAGS[type] || BLOCK_TAGS.paragraph;
    var tag = info.tag;
    // heading level
    if (type === 'heading') {
      var lvl = (block.attrs && block.attrs.level) || 1;
      tag = 'h' + Math.min(6, Math.max(1, lvl));
    }
    // formatting attrs
    var fmt = (block.attrs && block.attrs.formatting) || {};
    var style = '';
    if (fmt.align) style += 'text-align:' + fmt.align + ';';
    if (fmt.fontSize) style += 'font-size:' + fmt.fontSize + 'px;';
    if (fmt.fontFamily) style += 'font-family:' + fmt.fontFamily + ';';
    // inline formatting: parseInline 已经在 office-doc.js 里定义，但这里直接显示带 markdown 的原始内容
    // contenteditable 里显示 markdown 符号，由 parseInline 在导出时处理
    var content = escHtml(block.content || '');
    return '<' + tag + ' data-bid="' + block.id + '" data-btype="' + type + '"' +
      (style ? ' style="' + style + '"' : '') +
      ' contenteditable="true" class="ode-ce">' + content + '</' + tag + '>';
  }

  // ─── HTML → blocks array ───
  function parseEditorDOM(editorEl) {
    var blocks = [];
    var children = editorEl.children;
    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      var type = getTypeFromElement(el);
      var blockId = el.dataset.bid;
      var b = { type: type, id: blockId || OfficeDoc.uuid(), content: '', attrs: {} };

      if (type === 'divider') {
        // no content
      } else if (type === 'image') {
        var img = el.querySelector('img');
        if (img) {
          b.attrs.src = img.getAttribute('src') || '';
          b.attrs.alt = img.getAttribute('alt') || '';
        }
      } else if (type === 'table') {
        var headers = [], rows = [];
        var ths = el.querySelectorAll('thead th');
        ths.forEach(function (th) { headers.push(th.textContent || ''); });
        var trs = el.querySelectorAll('tbody tr');
        trs.forEach(function (tr) {
          var row = [];
          tr.querySelectorAll('td').forEach(function (td) { row.push(td.textContent || ''); });
          rows.push(row);
        });
        b.attrs.headers = headers;
        b.attrs.rows = rows;
      } else if (type === 'todo') {
        var cb = el.querySelector('input[type="checkbox"]');
        if (cb) b.attrs.checked = cb.checked;
        var ceSpan = el.querySelector('.ode-ce');
        b.content = ceSpan ? ceSpan.textContent || '' : '';
      } else if (type === 'bulletList' || type === 'orderedList') {
        var lis = el.querySelectorAll('li');
        b.content = '';
        lis.forEach(function (li) { if (b.content) b.content += '\n'; b.content += li.textContent || ''; });
      } else if (type === 'code' || type === 'quote') {
        var ceEl = el.querySelector('.ode-ce') || el;
        b.content = ceEl.textContent || '';
      } else if (type === 'footnote') {
        var ceEl2 = el.querySelector('.ode-ce');
        b.content = ceEl2 ? ceEl2.textContent || '' : (el.textContent || '').replace(/^\[\d+\]\s*/, '');
        var sup = el.querySelector('sup');
        if (sup) {
          var m = sup.textContent.match(/\[(\d+)\]/);
          if (m) b.attrs.id = 'fn-' + m[1];
        }
      } else {
        // paragraph / heading
        b.content = el.textContent || '';
        if (type === 'heading') {
          var lvl = getHeadingLevel(el);
          b.attrs.level = lvl;
        }
        // formatting from inline style
        var align = el.style.textAlign;
        if (align) {
          b.attrs.formatting = b.attrs.formatting || {};
          b.attrs.formatting.align = align;
        }
      }
      blocks.push(b);
    }
    return blocks;
  }

  // ─── 导航在块间移动 ───
  function getBlockData(container, el) {
    if (!el) return null;
    // text node 没有 closest()，需要先取 parentElement
    var node = el.nodeType === Node.ELEMENT_NODE ? el : el.parentElement;
    if (!node) return null;
    var blockEl = node.closest('[data-bid]');
    if (!blockEl) return null;
    var idx = Array.prototype.indexOf.call(container.children, blockEl);
    return { el: blockEl, id: blockEl.dataset.bid, idx: idx, type: blockEl.dataset.btype };
  }

  function placeCaretAtEnd(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function placeCaretAtStart(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // ─── 重新渲染（从 blocks 生成 DOM） ───
  function fullRender(container, doc) {
    // 保存当前选区
    var sel = window.getSelection();
    var savedBlockId = null, savedOffset = 0, savedTextBefore = '';
    if (sel.rangeCount) {
      var r = sel.getRangeAt(0);
      var blockData = getBlockData(container, r.startContainer);
      if (blockData) {
        savedBlockId = blockData.id;
        savedOffset = r.startOffset;
        savedTextBefore = blockData.el.textContent;
      }
    }

    var html = doc.blocks.map(blockToHTML).join('\n');
    container.innerHTML = html;

    // 恢复光标
    if (savedBlockId) {
      setTimeout(function () {
        var newEl = container.querySelector('[data-bid="' + savedBlockId + '"]');
        if (!newEl) {
          // 块被删了 → 光标放最后
          var last = container.querySelector('.ode-ce:last-child');
          if (last) { last.focus(); placeCaretAtEnd(last); }
          return;
        }
        var ceEl = newEl.querySelector('.ode-ce') || newEl;
        if (ceEl && ceEl.isContentEditable) {
          ceEl.focus();
          // 估算光标位置
          var txt = ceEl.textContent || '';
          var offset = Math.min(savedOffset, txt.length);
          if (savedTextBefore === txt) {
            var r2 = document.createRange();
            r2.setStart(ceEl.firstChild || ceEl, offset);
            r2.collapse(true);
            var sel2 = window.getSelection();
            sel2.removeAllRanges();
            sel2.addRange(r2);
          } else {
            placeCaretAtEnd(ceEl);
          }
        }
      }, 0);
    }
  }

  // ─── 从当前 DOM 更新 blocks ───
  function syncBlocks(container, doc) {
    var newBlocks = parseEditorDOM(container);
    // 保留旧的 block ID（如果有的话）
    doc.blocks = newBlocks;
  }

  // ─── 通知 onChange ───
  function notifyChange(state) {
    if (typeof state.onChange === 'function') state.onChange(state.doc);
  }

  // ─── 处理 Enter 键 ───
  function handleEnter(e, container, state) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var blockData = getBlockData(container, sel.focusNode);
    if (!blockData) return;

    e.preventDefault();
    syncBlocks(container, state.doc);
    var curIdx = blockData.idx;
    var curBlock = state.doc.blocks[curIdx];
    if (!curBlock) return;

    // 分裂当前 block：光标前的内容留在当前 block，光标后的内容去新 block
    var focusNode = sel.focusNode;
    var focusOffset = sel.focusOffset;
    var textBefore = '', textAfter = '';
    if (focusNode.nodeType === Node.TEXT_NODE) {
      textBefore = focusNode.textContent.slice(0, focusOffset);
      textAfter = focusNode.textContent.slice(focusOffset);
    } else {
      textAfter = focusNode.textContent || '';
    }

    // 新 block 类型：heading → 变 paragraph；其它保持同类型
    var newType = curBlock.type;
    var newAttrs = {};
    // 继承当前 block 的格式 (字号/对齐/字体)
    if (curBlock.attrs && curBlock.attrs.formatting) {
      newAttrs.formatting = JSON.parse(JSON.stringify(curBlock.attrs.formatting));
    }
    if (curBlock.type === 'heading') {
      newType = 'paragraph';
    } else if (curBlock.type === 'bulletList' || curBlock.type === 'orderedList') {
      // 如果列表项空了 → 变 paragraph
      if (!textBefore.trim() && !textAfter.trim()) {
        newType = 'paragraph';
      }
    }

    if (textBefore) {
      curBlock.content = textBefore;
    } else {
      // 当前 block 空了 → 在当前位置插入新空 paragraph
    }

    var newBlock = OfficeDoc.makeBlock(newType, newAttrs, textAfter || '');
    state.doc.blocks.splice(curIdx + 1, 0, newBlock);

    fullRender(container, state.doc);
    notifyChange(state);

    // 聚焦到新 block 的开头
    setTimeout(function () {
      var newEl = container.querySelector('[data-bid="' + newBlock.id + '"]');
      if (newEl) {
        var ce = newEl.querySelector('.ode-ce') || newEl;
        if (ce && ce.isContentEditable) { ce.focus(); if (!textBefore) placeCaretAtStart(ce); }
      }
    }, 0);
  }

  // ─── 处理 Backspace 键 ───
  function handleBackspace(e, container, state) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var focusNode = sel.focusNode;
    var focusOffset = sel.focusOffset;

    // 只在光标在元素开头时处理合并
    if (focusOffset !== 0 || focusNode.nodeType !== Node.TEXT_NODE) return;

    var blockData = getBlockData(container, focusNode);
    if (!blockData || blockData.idx <= 0) return;

    e.preventDefault();
    syncBlocks(container, state.doc);
    var prevIdx = blockData.idx - 1;
    var curBlock = state.doc.blocks[blockData.idx];
    var prevBlock = state.doc.blocks[prevIdx];
    if (prevBlock && curBlock) {
      var mergeContent = (prevBlock.content || '') + (curBlock.content || '');
      prevBlock.content = mergeContent;
      state.doc.blocks.splice(blockData.idx, 1);
      fullRender(container, state.doc);
      notifyChange(state);
      setTimeout(function () {
        var el = container.querySelector('[data-bid="' + prevBlock.id + '"]');
        if (el) {
          var ce = el.querySelector('.ode-ce') || el;
          if (ce && ce.isContentEditable) { ce.focus(); placeCaretAtEnd(ce); }
        }
      }, 0);
    }
  }

  // ─── 处理 input 事件（同步内容到 blocks） ───
  function handleInput(container, state) {
    syncBlocks(container, state.doc);
    notifyChange(state);
  }

  // ════════════════════════════════════════════
  // 主入口
  // ════════════════════════════════════════════
  function mountEditor(container, doc, opts) {
    console.log('[FlowEditor] mountEditor called', { containerId: container.id, blocks: doc.blocks.length, OfficeDoc: typeof OfficeDoc });
    opts = opts || {};
    if (typeof container === 'string') container = document.getElementById(container);
    if (!container) throw new Error('office-doc-editor: container not found');
    container.innerHTML = '';
    container.classList.add('ode-editor-flow');
    // 保留已有 flex 样式，只追加文档流样式
    container.style.padding = '40px 64px';
    container.style.maxWidth = '880px';
    container.style.boxSizing = 'border-box';
    container.style.lineHeight = '1.7';
    container.style.fontSize = '15px';
    container.style.fontFamily = 'Calibri, PingFang SC, sans-serif';

    var state = {
      doc: doc || OfficeDoc.makeDocument({ title: opts.title || 'untitled' }),
      onChange: opts.onChange || null,
    };
    if (state.doc.blocks.length === 0) {
      state.doc.blocks.push(OfficeDoc.paragraph(''));
    }

    // 最初渲染
    var html = state.doc.blocks.map(blockToHTML).join('\n');
    console.log('[FlowEditor] HTML rendered', { htmlLen: html.length, htmlPreview: html.slice(0, 200) });
    container.innerHTML = html;
    console.log('[FlowEditor] Container dims', { 
      offsetH: container.offsetHeight, offsetW: container.offsetWidth,
      scrollH: container.scrollHeight, childCount: container.children.length 
    });

    // 事件监听
    container.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        handleEnter(e, container, state);
      } else if (e.key === 'Backspace') {
        handleBackspace(e, container, state);
      }
    });

    container.addEventListener('input', function () {
      handleInput(container, state);
    });

    // ─── Instance API（向后兼容） ───

    function getCurrentBlockData() {
      var sel = window.getSelection();
      if (!sel.rangeCount) return null;
      return getBlockData(container, sel.focusNode);
    }

    function focusBlock(blockId, position) {
      setTimeout(function () {
        var el = container.querySelector('[data-bid="' + blockId + '"]');
        if (el) {
          var ce = el.querySelector('.ode-ce') || el;
          if (ce && ce.isContentEditable) {
            ce.focus();
            if (position === 'end') placeCaretAtEnd(ce);
            else placeCaretAtStart(ce);
          }
        }
      }, 0);
    }

    return {
getDocument: function () { return state.doc; },
      getMarkdown: function () {
        // 先同步
        syncBlocks(container, state.doc);
        return OfficeDocConverter.documentToMarkdown(state.doc);
      },

      // v0.66 fix: Bubble Menu 移到 mountEditor 内
      //   导致在任何地方选词都触发显示 ode-bubble — cream 主题下又是白字米色底看不见 → "空白方框"）
      //   现在 scope 到 editorRoot（container），只在编辑器内选词才显示
      destroy: (function () {
        var _bubble = null;
        function _getBubble() {
          if (_bubble) return _bubble;
          _bubble = document.createElement('div');
          _bubble.className = 'ode-bubble';
          // 固定深色背景 + 白字（cream 主题下也清晰）
          _bubble.style.cssText =
            'position:fixed;z-index:99999;display:none;background:#2a2a2a;' +
            'border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.35);padding:4px;gap:2px;';
          var btns = [
            { label: 'B', cmd: 'bold', style: 'font-weight:700' },
            { label: 'I', cmd: 'italic', style: 'font-style:italic' },
            { label: 'U', cmd: 'underline', style: 'text-decoration:underline' },
            { label: '</>', cmd: 'code', style: 'font-family:monospace' },
          ];
          btns.forEach(function (b) {
            var btn = document.createElement('button');
            btn.textContent = b.label;
            btn.dataset.cmd = b.cmd;
            btn.style.cssText = 'border:none;background:transparent;color:#fff;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px;';
            btn.onmouseenter = function () { this.style.background = 'rgba(255,255,255,0.15)'; };
            btn.onmouseleave = function () { this.style.background = 'transparent'; };
            btn.onmousedown = function (e) {
              e.preventDefault();
              var sel = window.getSelection();
              if (!sel.rangeCount || sel.isCollapsed) return;
              var cmd = this.dataset.cmd;
              if (cmd === 'code') {
                var txt = sel.toString();
                document.execCommand('insertText', false, '`' + txt + '`');
              } else {
                document.execCommand(cmd);
              }
              _bubble.style.display = 'none';
            };
            _bubble.appendChild(btn);
          });
          document.body.appendChild(_bubble);
          return _bubble;
        }

        function _updateBubble() {
          var sel = window.getSelection();
          if (!sel.rangeCount || sel.isCollapsed || !sel.toString().trim()) {
            if (_bubble) _bubble.style.display = 'none';
            return;
          }
          // v0.66 fix: 检查 selection 是否在编辑器内（root scope）
          var r = sel.getRangeAt(0);
          var node = r.commonAncestorContainer;
          // commonAncestorContainer 可能是 Text 节点（无 parentElement），用 contains 检查
          var inEditor = (node.nodeType === 1)
            ? container.contains(node)
            : (node.parentElement && container.contains(node.parentElement));
          if (!inEditor) {
            if (_bubble) _bubble.style.display = 'none';
            return;
          }
          var rect = r.getBoundingClientRect();
          var b = _getBubble();
          // 修正：先 display:flex 再读 offsetWidth（之前 display:none 时读 = 0 导致位置错乱）
          b.style.display = 'flex';
          b.style.visibility = 'hidden';
          var bw = b.offsetWidth, bh = b.offsetHeight;
          b.style.visibility = '';
          b.style.left = (rect.left + rect.width / 2 - bw / 2) + 'px';
          b.style.top = (rect.top - bh - 8) + 'px';
          // 检测已激活的格式
          var btns = b.querySelectorAll('button');
          btns.forEach(function (btn) {
            try {
              var state = document.queryCommandState(btn.dataset.cmd);
              btn.style.background = state ? 'rgba(255,255,255,0.25)' : 'transparent';
            } catch(e) {}
          });
        }

        document.addEventListener('selectionchange', _updateBubble);
        // 点击外部关闭
        function _onMouseDown(e) {
          if (_bubble && !_bubble.contains(e.target)) {
            _bubble.style.display = 'none';
          }
        }
        document.addEventListener('mousedown', _onMouseDown);

        return function () {
          container.innerHTML = '';
          container.classList.remove('ode-editor-flow');
          // v0.66 fix: 清理全局监听 + DOM 节点（防泄漏）
          document.removeEventListener('selectionchange', _updateBubble);
          document.removeEventListener('mousedown', _onMouseDown);
          if (_bubble && _bubble.parentNode) _bubble.parentNode.removeChild(_bubble);
          _bubble = null;
        };
      })(),
      getCurrentBlockId: function () {
        var d = getCurrentBlockData();
        return d ? d.id : null;
      },
      getCurrentBlock: function () {
        var d = getCurrentBlockData();
        if (!d) return null;
        return state.doc.blocks[d.idx] || null;
      },
      getBlock: function (id) {
        return state.doc.blocks.find(function (b) { return b.id === id; }) || null;
      },
      getAllBlocks: function () { return state.doc.blocks.slice(); },
      focusBlock: focusBlock,
      addBlock: function (type, attrs, content, afterBlockId) {
        syncBlocks(container, state.doc);
        var block = OfficeDoc.makeBlock(type, attrs || {}, content || '');
        if (afterBlockId) {
          var idx = state.doc.blocks.findIndex(function (b) { return b.id === afterBlockId; });
          if (idx >= 0) state.doc.blocks.splice(idx + 1, 0, block);
          else state.doc.blocks.push(block);
        } else {
          state.doc.blocks.push(block);
        }
        fullRender(container, state.doc);
        notifyChange(state);
        focusBlock(block.id, 'start');
        return block.id;
      },
      changeBlockType: function (blockId, newType, attrs) {
        syncBlocks(container, state.doc);
        var block = state.doc.blocks.find(function (b) { return b.id === blockId; });
        if (!block) return false;
        block.type = newType;
        if (newType === 'heading') {
          block.attrs = block.attrs || {};
          block.attrs.level = (attrs && attrs.level) || 1;
        }
        fullRender(container, state.doc);
        notifyChange(state);
        return true;
      },
      deleteBlock: function (blockId) {
        syncBlocks(container, state.doc);
        var idx = state.doc.blocks.findIndex(function (b) { return b.id === blockId; });
        if (idx < 0) return false;
        state.doc.blocks.splice(idx, 1);
        if (state.doc.blocks.length === 0) {
          state.doc.blocks.push(OfficeDoc.paragraph(''));
        }
        fullRender(container, state.doc);
        notifyChange(state);
        return true;
      },
      moveBlockUp: function (blockId) {
        syncBlocks(container, state.doc);
        var idx = state.doc.blocks.findIndex(function (b) { return b.id === blockId; });
        if (idx <= 0) return false;
        var item = state.doc.blocks.splice(idx, 1)[0];
        state.doc.blocks.splice(idx - 1, 0, item);
        fullRender(container, state.doc);
        notifyChange(state);
        return true;
      },
      moveBlockDown: function (blockId) {
        syncBlocks(container, state.doc);
        var idx = state.doc.blocks.findIndex(function (b) { return b.id === blockId; });
        if (idx < 0 || idx >= state.doc.blocks.length - 1) return false;
        var item = state.doc.blocks.splice(idx, 1)[0];
        state.doc.blocks.splice(idx + 1, 0, item);
        fullRender(container, state.doc);
        notifyChange(state);
        return true;
      },
      // v0.62.5+: 块级 formatting
      getBlockFormatting: function (blockId) {
        var b = state.doc.blocks.find(function (x) { return x.id === blockId; });
        if (!b || !b.attrs) return {};
        return b.attrs.formatting || {};
      },
      setBlockFormatting: function (blockId, fmtPatch) {
        var b = state.doc.blocks.find(function (x) { return x.id === blockId; });
        if (!b) return false;
        var cur = (b.attrs && b.attrs.formatting) || {};
        var next = Object.assign({}, cur, fmtPatch);
        Object.keys(next).forEach(function (k) {
          if (next[k] === false || next[k] === '' || next[k] == null) delete next[k];
        });
        b.attrs = Object.assign({}, b.attrs, { formatting: next });
        fullRender(container, state.doc);
        notifyChange(state);
        return true;
      },
      toggleInlineFormat: function (blockId, marker) {
        // 保留：选区格式 — 用 document.execCommand 原生支持
        // 如果 blockId 为 null 或未指定，对当前选区操作
        var sel = window.getSelection();
        if (sel.rangeCount && !sel.isCollapsed) {
          // 有选区 → 原生格式
          var cmd = (marker === 'bold') ? 'bold'
                  : (marker === 'italic') ? 'italic'
                  : (marker === 'underline') ? 'underline'
                  : null;
          if (cmd) { document.execCommand(cmd); return true; }
        }
        // 兜底：整块切换 markdown 语法
        var b = state.doc.blocks.find(function (x) { return x.id === blockId; });
        if (!b || !b.content) return false;
        var content = b.content;
        var m;
        if (marker === 'bold') m = /^\*\*(.*)\*\*$/.exec(content);
        else if (marker === 'italic') m = /^\*(.*)\*$/.exec(content);
        else if (marker === 'underline') m = /^__(.*)__$/.exec(content);
        else if (marker === 'code') m = /^`(.*)`$/.exec(content);
        if (m) b.content = m[1];
        else {
          var pair = marker === 'bold' ? ['**', '**'] : marker === 'italic' ? ['*', '*'] : marker === 'underline' ? ['__', '__'] : ['`', '`'];
          b.content = pair[0] + content + pair[1];
        }
        fullRender(container, state.doc);
        notifyChange(state);
        return true;
      },
      rerender: function () {
        syncBlocks(container, state.doc);
        fullRender(container, state.doc);
      },
    };
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escAttr(s) { return escHtml(String(s||'')).replace(/"/g,'&quot;'); }

  root.OfficeDocEditor = root.OfficeDocEditor || {};
  root.OfficeDocEditor.mountEditor = mountEditor;
})(window);
