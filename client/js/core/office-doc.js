// ACMS Office 文档 Block Schema（v0.62 块编辑器核心）
// 位置：client/js/core/office-doc.js
//
// 设计原则：
//   1. 结构化（不是 HTML 字符串）— 跟 LLM 输出对齐，可直接转 docx/xlsx/pptx
//   2. 易序列化（纯 JSON）— 存 DB / 发 WS / 走 plan_execute 工具调用都通
//   3. 易扩展（attrs 字段）— 加新 block 类型不改 schema
//   4. 跟 LLM 输出对齐（"中性的中间表示"）— markdown/Block/docx 互转无损
//
// Block 类型（10 种）：
//   heading       { level: 1-6, content }
//   paragraph     { content }
//   bulletList    { content }
//   orderedList   { content }
//   todo          { checked: bool, content }
//   quote         { content }
//   code          { language, content }
//   divider       {} （无 attrs）
//   image         { src, alt, width }
//   table         { headers: [], rows: [[]] }
//
// 每个 block 必有字段：type + id (uuid) + content + attrs
// attrs 默认空对象

(function (root) {
  'use strict';

  // ──────────── 类型常量 ────────────
  var TYPES = {
    HEADING: 'heading',
    PARAGRAPH: 'paragraph',
    BULLET_LIST: 'bulletList',
    ORDERED_LIST: 'orderedList',
    TODO: 'todo',
    QUOTE: 'quote',
    CODE: 'code',
    DIVIDER: 'divider',
    IMAGE: 'image',
    TABLE: 'table',
  };

  var TYPE_LABELS = {
    heading: '标题',
    paragraph: '正文',
    bulletList: '• 列表',
    orderedList: '1. 列表',
    todo: '☑ 待办',
    quote: '引用',
    code: '代码块',
    divider: '分割线',
    image: '图片',
    table: '表格',
  };

  // ──────────── UUID 生成（无依赖） ────────────
  function uuid() {
    // RFC 4122 v4
    var s4 = function () { return Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1); };
    return s4() + s4() + '-' + s4() + '-4' + s4().slice(1) + '-' +
      (8 + Math.floor(Math.random() * 4)).toString(16) + s4().slice(1) + '-' + s4() + s4() + s4();
  }

  // ──────────── Block 工厂 ────────────
  // 每个工厂返回一个新 block 对象
  function makeBlock(type, attrs, content) {
    var block = {
      id: uuid(),
      type: type,
      attrs: attrs || {},
      content: content || '',
    };
    // 不同 block 的默认值
    if (type === TYPES.HEADING) block.attrs.level = block.attrs.level || 1;
    if (type === TYPES.TODO) block.attrs.checked = block.attrs.checked === true;
    if (type === TYPES.CODE) block.attrs.language = block.attrs.language || '';
    if (type === TYPES.IMAGE) {
      block.attrs.src = block.attrs.src || '';
      block.attrs.alt = block.attrs.alt || '';
      block.attrs.width = block.attrs.width || null;
    }
    if (type === TYPES.TABLE) {
      block.attrs.headers = block.attrs.headers || [];
      block.attrs.rows = block.attrs.rows || [];
    }
    return block;
  }

  // 便利工厂
  function heading(text, level) { return makeBlock(TYPES.HEADING, { level: level || 1 }, text || ''); }
  function paragraph(text) { return makeBlock(TYPES.PARAGRAPH, {}, text || ''); }
  function bulletList(text) { return makeBlock(TYPES.BULLET_LIST, {}, text || ''); }
  function orderedList(text) { return makeBlock(TYPES.ORDERED_LIST, {}, text || ''); }
  function todo(text, checked) { return makeBlock(TYPES.TODO, { checked: checked === true }, text || ''); }
  function quote(text) { return makeBlock(TYPES.QUOTE, {}, text || ''); }
  function code(text, language) { return makeBlock(TYPES.CODE, { language: language || '' }, text || ''); }
  function divider() { return makeBlock(TYPES.DIVIDER, {}, ''); }
  function image(src, alt, width) { return makeBlock(TYPES.IMAGE, { src: src || '', alt: alt || '', width: width || null }, ''); }
  function table(headers, rows) { return makeBlock(TYPES.TABLE, { headers: headers || [], rows: rows || [] }, ''); }

  // ──────────── 文档对象 ────────────
  // Document = { meta: {title, createdAt, updatedAt}, blocks: [...] }
  function makeDocument(opts) {
    opts = opts || {};
    return {
      meta: {
        title: opts.title || 'untitled',
        version: 1,
        schema: 'office-doc.v1',
        createdAt: opts.createdAt || new Date().toISOString(),
        updatedAt: opts.updatedAt || new Date().toISOString(),
      },
      blocks: opts.blocks || [],
    };
  }

  // 校验 document 结构
  function validateDocument(doc) {
    if (!doc || typeof doc !== 'object') return { ok: false, error: 'NOT_OBJECT' };
    if (!doc.meta || typeof doc.meta !== 'object') return { ok: false, error: 'NO_META' };
    if (!Array.isArray(doc.blocks)) return { ok: false, error: 'BLOCKS_NOT_ARRAY' };
    for (var i = 0; i < doc.blocks.length; i++) {
      var b = doc.blocks[i];
      if (!b.type) return { ok: false, error: 'BLOCK_' + i + '_NO_TYPE' };
      if (!Object.prototype.hasOwnProperty.call(TYPES, upperFirst(b.type)) &&
          !Object.values(TYPES).includes(b.type)) {
        return { ok: false, error: 'BLOCK_' + i + '_UNKNOWN_TYPE:' + b.type };
      }
      if (typeof b.id !== 'string') return { ok: false, error: 'BLOCK_' + i + '_NO_ID' };
    }
    return { ok: true };
  }

  // ──────────── Block CRUD ────────────
  function insertBlock(doc, block, index) {
    if (typeof index !== 'number' || index < 0 || index > doc.blocks.length) {
      index = doc.blocks.length;
    }
    doc.blocks.splice(index, 0, block);
    doc.meta.updatedAt = new Date().toISOString();
    return block;
  }

  function removeBlock(doc, blockId) {
    for (var i = 0; i < doc.blocks.length; i++) {
      if (doc.blocks[i].id === blockId) {
        var removed = doc.blocks.splice(i, 1)[0];
        doc.meta.updatedAt = new Date().toISOString();
        return removed;
      }
    }
    return null;
  }

  function moveBlock(doc, blockId, newIndex) {
    var idx = -1;
    for (var i = 0; i < doc.blocks.length; i++) {
      if (doc.blocks[i].id === blockId) { idx = i; break; }
    }
    if (idx < 0) return null;
    var b = doc.blocks.splice(idx, 1)[0];
    if (newIndex < 0) newIndex = 0;
    if (newIndex > doc.blocks.length) newIndex = doc.blocks.length;
    doc.blocks.splice(newIndex, 0, b);
    doc.meta.updatedAt = new Date().toISOString();
    return b;
  }

  function updateBlock(doc, blockId, updates) {
    for (var i = 0; i < doc.blocks.length; i++) {
      if (doc.blocks[i].id === blockId) {
        if (typeof updates.content === 'string') doc.blocks[i].content = updates.content;
        if (updates.attrs && typeof updates.attrs === 'object') {
          for (var k in updates.attrs) doc.blocks[i].attrs[k] = updates.attrs[k];
        }
        if (typeof updates.type === 'string') doc.blocks[i].type = updates.type;
        doc.meta.updatedAt = new Date().toISOString();
        return doc.blocks[i];
      }
    }
    return null;
  }

  function findBlock(doc, blockId) {
    for (var i = 0; i < doc.blocks.length; i++) {
      if (doc.blocks[i].id === blockId) return doc.blocks[i];
    }
    return null;
  }

  // ──────────── 块级内联格式（粗体/斜体/代码/链接） ────────────
  // content 字段支持简化的 markdown 行内语法：
  //   **粗体**  *斜体*  `代码`  [链接](url)
  // 转换器负责解析；编辑器在 contenteditable 里允许直接输入

  function parseInline(content) {
    var out = [];
    var i = 0;
    var re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
    var last = 0;
    var m;
    while ((m = re.exec(content)) !== null) {
      if (m.index > last) out.push({ type: 'text', text: content.slice(last, m.index) });
      var tok = m[0];
      if (tok.indexOf('**') === 0) {
        out.push({ type: 'bold', text: tok.slice(2, -2) });
      } else if (tok.charAt(0) === '`') {
        out.push({ type: 'code', text: tok.slice(1, -1) });
      } else if (tok.charAt(0) === '[') {
        var linkMatch = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          out.push({ type: 'link', text: linkMatch[1], href: linkMatch[2] });
        } else {
          out.push({ type: 'text', text: tok });
        }
      } else if (tok.charAt(0) === '*') {
        out.push({ type: 'italic', text: tok.slice(1, -1) });
      }
      last = re.lastIndex;
    }
    if (last < content.length) out.push({ type: 'text', text: content.slice(last) });
    if (out.length === 0) out.push({ type: 'text', text: content || '' });
    return out;
  }

  // ──────────── Helper ────────────
  function upperFirst(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  // ──────────── 导出 ────────────
  var OfficeDoc = {
    TYPES: TYPES,
    TYPE_LABELS: TYPE_LABELS,
    uuid: uuid,
    makeBlock: makeBlock,
    heading: heading,
    paragraph: paragraph,
    bulletList: bulletList,
    orderedList: orderedList,
    todo: todo,
    quote: quote,
    code: code,
    divider: divider,
    image: image,
    table: table,
    makeDocument: makeDocument,
    validateDocument: validateDocument,
    insertBlock: insertBlock,
    removeBlock: removeBlock,
    moveBlock: moveBlock,
    updateBlock: updateBlock,
    findBlock: findBlock,
    parseInline: parseInline,
  };

  // 浏览器 + CommonJS 双导出
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = OfficeDoc;
  } else {
    root.OfficeDoc = OfficeDoc;
  }
})(typeof window !== 'undefined' ? window : globalThis);
