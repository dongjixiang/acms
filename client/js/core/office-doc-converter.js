// ACMS Office 文档转换器（v0.62 块编辑器核心）
// 位置：client/js/core/office-doc-converter.js
//
// 三向转换：
//   1. blocks → markdown     （保存、显示、AI 输入）
//   2. markdown → blocks     （从 chat 上传的 .md / document_gen 产出加载）
//   3. blocks → docx Buffer  （/api/office/save 调用，或前端 zip 后下载）
//
// 依赖：
//   - OfficeDoc（schema 定义、CRUD、parseInline）
//   - docx npm 包（客户端用，浏览器也支持）

(function (root) {
  'use strict';

  // Node + 浏览器双兼容：OfficeDoc 可能来自 window 或 require
  var OfficeDoc = root.OfficeDoc;
  if (!OfficeDoc && typeof require === 'function') {
    try { OfficeDoc = require('./office-doc'); } catch (e) { /* 浏览器无 require */ }
  }
  if (!OfficeDoc) {
    throw new Error('office-doc-converter: OfficeDoc not loaded. Make sure office-doc.js is loaded first.');
  }

  // ──────────── Blocks → Markdown ────────────
  function blocksToMarkdown(blocks) {
    if (!Array.isArray(blocks)) return '';
    var lines = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      lines.push(blockToMarkdownLine(b));
    }
    return lines.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  function blockToMarkdownLine(b) {
    var c = b.content || '';
    var a = b.attrs || {};
    switch (b.type) {
      case 'heading':
        var lv = clampLevel(a.level);
        return repeat('#', lv) + ' ' + c;
      case 'paragraph':
        return c;
      case 'bulletList':
        return '- ' + c;
      case 'orderedList':
        return '1. ' + c;
      case 'todo':
        return '- [' + (a.checked ? 'x' : ' ') + '] ' + c;
      case 'quote':
        return '> ' + c.replace(/\n/g, '\n> ');
      case 'code':
        return '```' + (a.language || '') + '\n' + c + '\n```';
      case 'divider':
        return '---';
      case 'image':
        var alt = a.alt || c || 'image';
        return '![' + alt + '](' + (a.src || '') + ')';
      case 'table': {
        var headers = a.headers || [];
        var rows = a.rows || [];
        if (headers.length === 0) return '';
        var sep = headers.map(function () { return '---'; });
        var lines = [
          '| ' + headers.join(' | ') + ' |',
          '| ' + sep.join(' | ') + ' |',
        ];
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i] || [];
          lines.push('| ' + r.join(' | ') + ' |');
        }
        return lines.join('\n');
      }
      default:
        return c;
    }
  }

  function clampLevel(n) {
    n = parseInt(n, 10) || 1;
    if (n < 1) return 1;
    if (n > 6) return 6;
    return n;
  }
  function repeat(s, n) {
    var out = '';
    for (var i = 0; i < n; i++) out += s;
    return out;
  }

  // ──────────── Markdown → Blocks ────────────
  function markdownToBlocks(md) {
    if (!md || typeof md !== 'string') return [];
    var lines = md.replace(/\r\n/g, '\n').split('\n');
    var blocks = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      var b = parseMarkdownLine(line, lines, i);
      if (b) {
        blocks.push(b.block);
        i = b.next;
      } else {
        i++;
      }
    }
    return blocks;
  }

  function parseMarkdownLine(line, allLines, idx) {
    var t = line;

    // divider
    if (/^---+\s*$/.test(t)) {
      return { block: OfficeDoc.divider(), next: idx + 1 };
    }

    // code fence
    if (/^```/.test(t)) {
      var lang = t.slice(3).trim();
      var content = [];
      var j = idx + 1;
      while (j < allLines.length && !/^```/.test(allLines[j])) {
        content.push(allLines[j]);
        j++;
      }
      return { block: OfficeDoc.code(content.join('\n'), lang), next: j + 1 };
    }

    // heading
    var h = t.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      return { block: OfficeDoc.heading(h[2], h[1].length), next: idx + 1 };
    }

    // todo
    var todo = t.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (todo) {
      return { block: OfficeDoc.todo(todo[2], todo[1].toLowerCase() === 'x'), next: idx + 1 };
    }

    // bullet list
    if (/^[-*]\s+/.test(t)) {
      return { block: OfficeDoc.bulletList(t.replace(/^[-*]\s+/, '')), next: idx + 1 };
    }

    // ordered list
    if (/^\d+\.\s+/.test(t)) {
      return { block: OfficeDoc.orderedList(t.replace(/^\d+\.\s+/, '')), next: idx + 1 };
    }

    // quote
    if (/^>\s+/.test(t)) {
      var content = t.replace(/^>\s+/, '');
      // 收集连续 quote 行
      var j2 = idx + 1;
      while (j2 < allLines.length && /^>\s+/.test(allLines[j2])) {
        content += '\n' + allLines[j2].replace(/^>\s+/, '');
        j2++;
      }
      return { block: OfficeDoc.quote(content), next: j2 };
    }

    // table（简单支持 | col | col | 形式）
    if (/^\|.*\|$/.test(t) && idx + 1 < allLines.length && /^\|[\s\-|]+\|$/.test(allLines[idx + 1])) {
      var headers = t.split('|').slice(1, -1).map(function (s) { return s.trim(); });
      var rows = [];
      var k = idx + 2;
      while (k < allLines.length && /^\|.*\|$/.test(allLines[k])) {
        rows.push(allLines[k].split('|').slice(1, -1).map(function (s) { return s.trim(); }));
        k++;
      }
      return { block: OfficeDoc.table(headers, rows), next: k };
    }

    // image
    var img = t.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (img) {
      return { block: OfficeDoc.image(img[2], img[1]), next: idx + 1 };
    }

    // 空行 = 跳过
    if (/^\s*$/.test(t)) return null;

    // paragraph（合并连续非空行）
    var para = t;
    var j3 = idx + 1;
    while (j3 < allLines.length &&
           !/^\s*$/.test(allLines[j3]) &&
           !/^#{1,6}\s/.test(allLines[j3]) &&
           !/^[-*]\s/.test(allLines[j3]) &&
           !/^\d+\.\s/.test(allLines[j3]) &&
           !/^```/.test(allLines[j3]) &&
           !/^>\s/.test(allLines[j3]) &&
           !/^!\[.*\]\(.*\)\s*$/.test(allLines[j3]) &&
           !/^---+\s*$/.test(allLines[j3])) {
      para += '\n' + allLines[j3];
      j3++;
    }
    return { block: OfficeDoc.paragraph(para), next: j3 };
  }

  // ──────────── Blocks → docx Buffer ────────────
  // 依赖 npm 包 docx（在 ACMS 仓库通过 package.json 引入）
  // 浏览器环境：动态 import 失败时返回 null（让调用方降级到 markdown）
  function blocksToDocxBuffer(blocks, docxLib) {
    if (!docxLib || typeof docxLib.Packer === 'undefined') {
      return null;
    }
    var D = docxLib;
    var children = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      var p = blockToDocxParagraph(b, D);
      if (p) children.push(p);
    }
    if (children.length === 0) {
      children.push(new D.Paragraph({ children: [new D.TextRun('')] }));
    }
    var doc = new D.Document({ sections: [{ children: children }] });
    // 返回 Packer.toBuffer 产生的 Promise（浏览器+Node 通用）
    return D.Packer.toBuffer(doc);
  }

  function blockToDocxParagraph(b, D) {
    var c = b.content || '';
    var a = b.attrs || {};
    var runs = parseInlineToTextRuns(c, D);

    switch (b.type) {
      case 'heading': {
        var lv = clampLevel(a.level);
        var hl = [null, D.HeadingLevel.HEADING_1, D.HeadingLevel.HEADING_2, D.HeadingLevel.HEADING_3,
                  D.HeadingLevel.HEADING_4, D.HeadingLevel.HEADING_5, D.HeadingLevel.HEADING_6][lv] || D.HeadingLevel.HEADING_1;
        return new D.Paragraph({ heading: hl, children: runs, spacing: { before: 200, after: 100 } });
      }
      case 'paragraph':
        return new D.Paragraph({ children: runs, spacing: { after: 80 } });
      case 'bulletList':
        return new D.Paragraph({ bullet: { level: 0 }, children: runs, spacing: { after: 60 } });
      case 'orderedList':
        return new D.Paragraph({ numbering: { reference: 'default-numbering', level: 0 }, children: runs, spacing: { after: 60 } });
      case 'todo': {
        // 视觉上 checkbox
        var mark = new D.TextRun({ text: (a.checked ? '☑ ' : '☐ '), bold: true });
        return new D.Paragraph({ children: [mark].concat(runs), spacing: { after: 60 } });
      }
      case 'quote':
        return new D.Paragraph({ indent: { left: 720 }, children: runs, spacing: { after: 120 } });
      case 'code':
        return new D.Paragraph({
          children: runs.map(function (r) {
            return new D.TextRun({ text: r.text || '', font: 'Consolas' });
          }),
          spacing: { after: 100 },
        });
      case 'divider':
        return new D.Paragraph({
          border: { bottom: { color: 'auto', space: 1, style: 'single', size: 6 } },
          spacing: { after: 100 },
        });
      case 'image': {
        // 简化：插入 alt 文本占位（docx 嵌图需要 ImageRun + 读文件，暂不实现）
        return new D.Paragraph({
          children: [new D.TextRun({ text: '[图片: ' + (a.alt || a.src || '') + ']', italics: true })],
          alignment: D.AlignmentType.CENTER,
        });
      }
      case 'table': {
        // docx 表格需要 Table + TableRow + TableCell，简化用 paragraphs 模拟
        var headerText = (a.headers || []).join(' | ');
        var rows = a.rows || [];
        var lines = [headerText ? '| ' + headerText + ' |' : ''];
        for (var i = 0; i < rows.length; i++) {
          lines.push('| ' + (rows[i] || []).join(' | ') + ' |');
        }
        return new D.Paragraph({
          children: [new D.TextRun({ text: lines.filter(Boolean).join('\n'), font: 'Consolas' })],
          spacing: { after: 120 },
        });
      }
      default:
        return new D.Paragraph({ children: runs, spacing: { after: 80 } });
    }
  }

  function parseInlineToTextRuns(content, D) {
    var inlines = OfficeDoc.parseInline(content);
    var out = [];
    for (var i = 0; i < inlines.length; i++) {
      var t = inlines[i];
      switch (t.type) {
        case 'bold':
          out.push(new D.TextRun({ text: t.text, bold: true }));
          break;
        case 'italic':
          out.push(new D.TextRun({ text: t.text, italics: true }));
          break;
        case 'code':
          out.push(new D.TextRun({ text: t.text, font: 'Consolas' }));
          break;
        case 'link':
          out.push(new D.TextRun({ text: t.text, color: '0563C1', underline: {} }));
          break;
        case 'text':
        default:
          out.push(new D.TextRun({ text: t.text || '' }));
          break;
      }
    }
    if (out.length === 0) out.push(new D.TextRun({ text: content || '' }));
    return out;
  }

  // ──────────── Document 转换便利函数 ────────────
  function documentToMarkdown(doc) {
    return blocksToMarkdown(doc.blocks);
  }
  function markdownToDocument(md, opts) {
    return OfficeDoc.makeDocument(Object.assign({ blocks: markdownToBlocks(md) }, opts || {}));
  }

  // ──────────── 导出 ────────────
  var OfficeDocConverter = {
    blocksToMarkdown: blocksToMarkdown,
    blockToMarkdownLine: blockToMarkdownLine,
    markdownToBlocks: markdownToBlocks,
    documentToMarkdown: documentToMarkdown,
    markdownToDocument: markdownToDocument,
    blocksToDocxBuffer: blocksToDocxBuffer,
    blockToDocxParagraph: blockToDocxParagraph,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = OfficeDocConverter;
  } else {
    root.OfficeDocConverter = OfficeDocConverter;
  }
})(typeof window !== 'undefined' ? window : globalThis);
