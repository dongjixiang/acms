// ─────────── docx 解析为 ACMS blocks ───────────
function parseDocxToBlocks(xml) {
  var paragraphs = xml.match(/<w:p[^>]*>[\s\S]*?<\/w:p>/g) || [];
  var blocks = [];

  for (var i = 0; i < paragraphs.length; i++) {
    var p = paragraphs[i];
    
    // 检测段落样式
    var styleMatch = p.match(/w:pStyle w:val="([^"]+)"/);
    var style = styleMatch ? styleMatch[1] : '';
    
    // 提取所有 run（格式化文本段）
    var runs = p.match(/<w:r[^>]*>[\s\S]*?<\/w:r>/g) || [];
    
    // 构建内联内容（支持粗体、斜体）
    var inlineParts = [];
    for (var j = 0; j < runs.length; j++) {
      var run = runs[j];
      var rPr = run.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
      var isBold = false, isItalic = false;
      
      if (rPr) {
        if (/<w:b[^\/]*\/>/i.test(rPr[1])) isBold = true;
        if (/<w:i[^\/]*\/>/i.test(rPr[1])) isItalic = true;
      }
      
      var textMatches = run.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
      var text = '';
      for (var k = 0; k < textMatches.length; k++) {
        text += textMatches[k].replace(/<[^>]+>/g, '');
      }
      
      if (text) {
        inlineParts.push({ text: text, bold: isBold, italic: isItalic });
      }
    }
    
    if (inlineParts.length === 0) continue;
    
    // 根据样式决定 block 类型
    var blockType, attrs, content;
    
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
    } else {
      blockType = 'paragraph';
      attrs = {};
    }
    
    // 构建 content（内联格式序列）
    content = JSON.stringify(inlineParts);
    
    blocks.push({
      type: blockType,
      attrs: attrs,
      content: content
    });
  }
  
  return blocks;
}
