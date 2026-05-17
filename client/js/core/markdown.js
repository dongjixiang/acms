// 轻量 Markdown 渲染器
function renderMarkdown(md) {
  if (!md) return '';
  let html = escHtml(md);

  // 表格（必须在其他行级处理之前）
  html = renderTables(html);

  // 标题（### → h3, ## → h2, # → h1）
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 粗体/斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 列表项
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // 引用
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // 水平线
  html = html.replace(/^---$/gm, '<hr>');

  // 换行（连续空行 → 段落分隔）
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // 包裹为段落
  html = '<p>' + html + '</p>';
  // 清理空段落和空行导致的嵌套问题
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p><h([1-4])>/g, '<h$1>');
  html = html.replace(/<\/h([1-4])><\/p>/g, '</h$1>');
  html = html.replace(/<p><ul>/g, '<ul>');
  html = html.replace(/<\/ul><\/p>/g, '</ul>');
  html = html.replace(/<p><blockquote>/g, '<blockquote>');
  html = html.replace(/<\/blockquote><\/p>/g, '</blockquote>');
  html = html.replace(/<p><table>/g, '<table>');
  html = html.replace(/<\/table><\/p>/g, '</table>');

  return html;
}

// 表格渲染
function renderTables(html) {
  // 匹配 Markdown 表格:
  // | Header1 | Header2 |
  // |---------|---------|
  // | Cell1   | Cell2   |
  const tableRegex = /(\|.+\|\n\|[-:\|\s]+\|\n((?:\|.+\|\n?)+))/g;
  return html.replace(tableRegex, (match) => {
    const lines = match.trim().split('\n');
    if (lines.length < 2) return match;

    // 表头
    const headers = lines[0].split('|').filter(s => s.trim());
    // 跳过分隔行 (|---|---|)
    const rows = lines.slice(2).filter(l => l.includes('|'));

    let table = '<table><thead><tr>';
    for (const h of headers) {
      table += `<th>${h.trim()}</th>`;
    }
    table += '</tr></thead><tbody>';
    for (const row of rows) {
      const cells = row.split('|').filter(s => s.trim());
      table += '<tr>';
      for (const c of cells) {
        table += `<td>${c.trim()}</td>`;
      }
      table += '</tr>';
    }
    table += '</tbody></table>';
    return table;
  });
}
