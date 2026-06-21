// 轻量 Markdown 渲染器（支持 Mermaid 图表）
let _mermaidReady = false;
let _mermaidPending = [];

// HTML 反解（撤销 escHtml 的转义）
function unescHtml(text) {
  return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function renderMarkdown(md) {
  if (!md) return '';
  let html = escHtml(md);

  // 提取围栏代码块（在转义前处理原始内容）
  html = renderFencedBlocks(html);

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

  // 自动链接 URL（http/https 开头，排除已包裹在 <a> 内的）
  html = html.replace(/(https?:\/\/[^\s<>"']+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

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
  html = html.replace(/<p><pre/g, '<pre');
  html = html.replace(/<\/pre><\/p>/g, '</pre>');
  html = html.replace(/<p><div class="mermaid-container/g, '<div class="mermaid-container');
  html = html.replace(/<\/div><\/p>/g, '</div>');

  // 延迟渲染 Mermaid（等 DOM 插入后再初始化）
  setTimeout(() => initMermaidBlocks(), 50);

  return html;
}

// ===== 围栏代码块 =====
let _fenceCounter = 0;
const _mermaidStore = {};  // JS Map: id → raw mermaid code (preserves \n)

function renderFencedBlocks(html) {
  const fenceRegex = /```(\w*)\n([\s\S]*?)```/g;
  return html.replace(fenceRegex, (match, lang, code) => {
    const trimmed = code.trim();
    const isMermaid = lang.toLowerCase() === 'mermaid';

    if (isMermaid) {
      const id = `mermaid-${++_fenceCounter}`;
      // 代码存入 JS 对象（保留原始 \n），需要反解 escHtml 的转义
      _mermaidStore[id] = unescHtml(trimmed);
      return `<div class="mermaid-container" data-mermaid-id="${id}"></div>`;
    }

    const langLabel = lang ? `<span class="code-lang">${escHtml(lang)}</span>` : '';
    return `<pre>${langLabel}<code>${trimmed}</code></pre>`;
  });
}

// ===== Mermaid 初始化 =====
function initMermaidBlocks() {
  const containers = document.querySelectorAll('.mermaid-container:not([data-mermaid-rendered])');
  if (!containers.length) return;

  // 懒加载 mermaid
  if (!_mermaidReady) {
    _mermaidPending.push(...containers);
    loadMermaid();
    return;
  }

  // 同步当前主题（页面切换后可能不一致）
  if (window.App && window.App._updateMermaidTheme) {
    window.App._updateMermaidTheme();
  }

  renderMermaidContainers(containers);
}

function loadMermaid() {
  if (window.mermaid) {
    _mermaidReady = true;
    renderMermaidContainers(_mermaidPending);
    _mermaidPending = [];
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
  script.onload = () => {
    const theme = (window.App && (window.App.theme === 'light' || window.App.theme === 'cream')) ? 'default' : 'dark';
    window.mermaid.initialize({ startOnLoad: false, theme: theme, securityLevel: 'loose' });
    _mermaidReady = true;
    renderMermaidContainers(_mermaidPending);
    _mermaidPending = [];
  };
  script.onerror = () => {
    // 加载失败：显示原始代码
    _mermaidPending.forEach(el => {
      el.innerHTML = `<pre><code>${el.textContent}</code></pre>`;
      el.classList.add('mermaid-failed');
    });
    _mermaidPending = [];
  };
  document.head.appendChild(script);
}

async function renderMermaidContainers(containers) {
  for (const el of containers) {
    if (el.hasAttribute('data-mermaid-rendered')) continue;
    el.setAttribute('data-mermaid-rendered', '1');

    const id = el.getAttribute('data-mermaid-id');
    // 从 JS store 读取代码，绕开 DOM 换行折叠问题
    const code = (_mermaidStore[id] || '').trim();

    if (!code) {
      console.warn('[Mermaid] empty code for id:', id, ', skipping');
      continue;
    }

    try {
      console.log('[Mermaid] rendering block, code length:', code.length, 'first 80 chars:', code.substring(0, 80));
      const { svg } = await window.mermaid.render(id, code);
      el.innerHTML = svg;
      console.log('[Mermaid] render success, SVG length:', svg.length);
    } catch (e) {
      console.error('[Mermaid] render failed:', e.message, '| code:', code.substring(0, 120));
      el.innerHTML = `<pre class="mermaid-error"><code>${escHtml(code)}</code></pre>
        <div style="font-size:11px;color:var(--accent2);margin-top:4px">Mermaid Error: ${escHtml(e.message)}</div>`;
      el.classList.add('mermaid-failed');
    }
  }
}

// ===== 表格渲染 =====
function renderTables(html) {
  const tableRegex = /(\|.+\|\n\|[-:\|\s]+\|\n((?:\|.+\|\n?)+))/g;
  return html.replace(tableRegex, (match) => {
    const lines = match.trim().split('\n');
    if (lines.length < 2) return match;

    const headers = lines[0].split('|').filter(s => s.trim());
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
