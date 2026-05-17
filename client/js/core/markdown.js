// 轻量 Markdown 渲染器
function renderMarkdown(md) {
  if (!md) return '';
  let html = escHtml(md);

  // 标题
  html = html.replace(/^### (.+)$/gm, '<h4 style="margin:12px 0 4px;color:var(--accent)">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 style="margin:16px 0 6px;color:var(--accent)">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 style="margin:18px 0 8px;color:var(--accent)">$1</h2>');

  // 粗体/斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code style="background:var(--bg3);padding:1px 5px;border-radius:3px;font-size:12px">$1</code>');

  // 列表项
  html = html.replace(/^- (.+)$/gm, '<li style="margin-left:20px">$1</li>');
  // 包裹相邻 <li> 为 <ul>
  html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul style="margin:8px 0">$1</ul>');

  // 引用
  html = html.replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid var(--accent);padding:4px 12px;margin:8px 0;color:var(--text2)">$1</blockquote>');

  // 换行
  html = html.replace(/\n\n/g, '<br><br>');
  html = html.replace(/\n/g, '<br>');

  return html;
}
