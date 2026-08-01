// ─────────── docx 解析为 ACMS blocks ───────────
function parseDocxToBlocks(xml) {
  var blocks = [];

  // 提取所有 block 元素（段落和表格）
  // 段落
  var paragraphs = xml.match(/<w:p[^>]*>[\s\S]*?<\/w:p>/g) || [];
  // 表格
  var tables = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];

  // 找到所有段落和表格在文档中的位置，按顺序排列
  var elements = [];
  paragraphs.forEach(function(p) {
    var idx = xml.indexOf(p);
    if (idx >= 0) elements.push({ type: 'p', html: p, idx: idx });
  });
  tables.forEach(function(t) {
    var idx = xml.indexOf(t);
    if (idx >= 0) elements.push({ type: 'tbl', html: t, idx: idx });
  });
  elements.sort(function(a, b) { return a.idx - b.idx; });

  // 按顺序处理
  elements.forEach(function(el) {
    if (el.type === 'p') {
      var block = parseParagraph(el.html);
      if (block) blocks.push(block);
    } else if (el.type === 'tbl') {
      var tableBlock = parseTable(el.html);
      if (tableBlock) blocks.push(tableBlock);
    }
  });

  return blocks;
}

// 解析段落
function parseParagraph(p) {
  // 检测段落样式
  var styleMatch = p.match(/w:pStyle w:val="([^"]+)"/);
  var style = styleMatch ? styleMatch[1] : '';

  // 提取所有 run（格式化文本段）
  var runs = p.match(/<w:r[^>]*>[\s\S]*?<\/w:r>/g) || [];

  // 构建内联内容（支持粗体、斜体、颜色）
  var inlineParts = [];
  for (var j = 0; j < runs.length; j++) {
    var run = runs[j];
    var rPr = run.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
    var isBold = false, isItalic = false, color = null;

    if (rPr) {
      if (/<w:b[^\/]*\/>/i.test(rPr[1])) isBold = true;
      if (/<w:i[^\/]*\/>/i.test(rPr[1])) isItalic = true;
      var colorMatch = rPr[1].match(/w:color[^"]*"\s*:\s*"([^"]+)"/i);
      if (colorMatch) color = colorMatch[1];
    }

    var textMatches = run.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    var text = '';
    for (var k = 0; k < textMatches.length; k++) {
      text += textMatches[k].replace(/<[^>]+>/g, '');
    }

    if (text) {
      inlineParts.push({ text: text, bold: isBold, italic: isItalic, color: color });
    }
  }

  if (inlineParts.length === 0) return null;

  // 根据样式决定 block 类型
  var blockType = 'paragraph';
  var attrs = {};

  if (style === 'Heading1' || style === 'Title') {
    blockType = 'heading';
    attrs = { level: 1 };
  } else if (style === 'Heading2') {
    blockType = 'heading';
    attrs = { level: 2 };
  } else if (style === 'Heading3') {
    blockType = 'heading';
    attrs = { level: 3 };
  } else if (style === 'Heading4') {
    blockType = 'heading';
    attrs = { level: 4 };
  } else if (style === 'Heading5') {
    blockType = 'heading';
    attrs = { level: 5 };
  } else if (style === 'Heading6') {
    blockType = 'heading';
    attrs = { level: 6 };
  } else if (style === 'Code') {
    blockType = 'code';
    attrs = { language: '' };
  } else if (style === 'Quote') {
    blockType = 'quote';
    attrs = {};
  } else if (style === 'ListBullet' || style === 'ListNumber') {
    blockType = 'bulletList';
    attrs = {};
  }

  return {
    type: blockType,
    attrs: attrs,
    content: JSON.stringify(inlineParts)
  };
}

// 解析表格
function parseTable(tbl) {
  var rows = tbl.match(/<w:tr[^>]*>[\s\S]*?<\/w:tr>/g) || [];
  var headers = [];
  var dataRows = [];

  rows.forEach(function(tr, idx) {
    var cells = tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
    var rowData = [];

    cells.forEach(function(tc) {
      // 提取单元格文本（包括内联格式）
      var runs = tc.match(/<w:r[^>]*>[\s\S]*?<\/w:r>/g) || [];
      var text = '';
      runs.forEach(function(run) {
        var textMatches = run.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
        textMatches.forEach(function(t) {
          text += t.replace(/<[^>]+>/g, '');
        });
      });
      rowData.push(text.trim());
    });

    if (idx === 0) {
      headers = rowData;
    } else {
      dataRows.push(rowData);
    }
  });

  if (headers.length === 0) return null;

  return {
    type: 'table',
    attrs: {
      headers: headers,
      rows: dataRows
    },
    content: ''
  };
}

module.exports = {
  parseDocxToBlocks: parseDocxToBlocks
};
