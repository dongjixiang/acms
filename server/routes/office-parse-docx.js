// ─────────── docx 解析为带格式 markdown ───────────
function parseDocxToMarkdown(xml) {
  var paragraphs = xml.match(/<w:p[^>]*>[\s\S]*?<\/w:p>/g) || [];
  var lines = [];

  for (var i = 0; i < paragraphs.length; i++) {
    var p = paragraphs[i];
    var styleMatch = p.match(/w:pStyle w:val="([^"]+)"/);
    var style = styleMatch ? styleMatch[1] : '';
    var runs = p.match(/<w:r[^>]*>[\s\S]*?<\/w:r>/g) || [];
    var line = '';
    var isBold = false;
    var isItalic = false;

    for (var j = 0; j < runs.length; j++) {
      var run = runs[j];
      var rPr = run.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
      if (rPr) {
        if (/<w:b[^\/]*\/>/i.test(rPr[1])) isBold = true;
        if (/<w:i[^\/]*\/>/i.test(rPr[1])) isItalic = true;
      }
      var textMatches = run.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
      for (var k = 0; k < textMatches.length; k++) {
        var text = textMatches[k].replace(/<[^>]+>/g, '');
        var formatted = text;
        if (isBold) formatted = '**' + formatted + '**';
        if (isItalic) formatted = '*' + formatted + '*';
        line += formatted;
      }
    }

    var trimmed = line.trim();
    if (!trimmed) continue;

    if (style === 'Heading1' || style === 'Title') lines.push('# ' + trimmed);
    else if (style === 'Heading2') lines.push('## ' + trimmed);
    else if (style === 'Heading3') lines.push('### ' + trimmed);
    else if (style === 'Heading4') lines.push('#### ' + trimmed);
    else if (style === 'Code') lines.push('```\n' + trimmed + '\n```');
    else if (style === 'Quote') lines.push('> ' + trimmed);
    else lines.push(trimmed);
  }

  return lines.filter(function(l) { return l.trim(); }).join('\n\n');
}
