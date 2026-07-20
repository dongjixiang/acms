// 交付管理视图 — 交付概览 + 工作区文件浏览 + 打包下载 + 在线体验
// 依赖: core/state.js, core/utils.js

// ── 工具函数 ──
function _fmtSize(s) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (s > 1024 && i < units.length - 1) { s /= 1024; i++; }
  return s.toFixed(1) + ' ' + units[i];
}

function _getFileIcon(type) {
  const map = {
    '.md': '📝', '.docx': '📄', '.pdf': '📕',
    '.html': '🌐', '.css': '🎨', '.js': '📜',
    '.py': '🐍', '.json': '📋', '.xml': '📋',
    '.png': '🖼', '.jpg': '🖼', '.jpeg': '🖼', '.gif': '🖼', '.svg': '🖼', '.webp': '🖼',
    '.zip': '📦', '.gz': '📦',
    '.txt': '📃', '.log': '📃',
    '.sh': '⚡', '.bat': '⚡',
    '.woff': '🔤', '.woff2': '🔤', '.ttf': '🔤',
  };
  return map[type] || '📦';
}

// ── 预览 overlay ──
function _ensurePreviewOverlay() {
  if (document.getElementById('ws-preview-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'ws-preview-overlay';
  overlay.className = 'preview-overlay';
  overlay.innerHTML = '<div class="preview-header"><span id="ws-preview-title"></span><button class="btn-small" onclick="closeFilePreview()">✕ 关闭</button></div><div id="ws-preview-body" class="preview-body"></div>';
  overlay.onclick = function(e) { if (e.target === overlay) closeFilePreview(); };
  document.body.appendChild(overlay);
}

function closeFilePreview() {
  const overlay = document.getElementById('ws-preview-overlay');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
}

async function previewTextFile(filePath, fileName, fileType) {
  _ensurePreviewOverlay();
  const overlay = document.getElementById('ws-preview-overlay');
  document.getElementById('ws-preview-title').textContent = '👁 ' + fileName;
  const body = document.getElementById('ws-preview-body');
  try {
    const resp = await fetch('/api/workspace/files/' + App.currentProjectId + '/read?path=' + encodeURIComponent(filePath), { headers: { 'X-API-Key': 'dev-key-001' } });
    const data = await resp.json();
    const content = data.content || '';
    const lines = content.split('\n');

    // 按文件类型选择预览模式
    const mode = _detectPreviewMode(fileType, fileName);

    if (mode === 'md') {
      body.innerHTML = '<div class="preview-md-wrap">' + _renderMarkdown(content) + '</div>';
    } else if (mode === 'json') {
      body.innerHTML = '<pre class="preview-code"><code>' + _highlightJSON(content) + '</code></pre>';
    } else {
      // 代码模式：行号 + 语法高亮
      const codeHtml = _highlightCode(lines.join('\n'), fileType);
      body.innerHTML = '<div class="preview-code-wrap"><pre class="preview-code"><code>' + codeHtml + '</code></pre></div>';
    }
    body.scrollTop = 0;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  } catch (e) { toast('预览失败: ' + e.message, 'error'); }
}

// ── 预览模式识别 ──
function _detectPreviewMode(ext, name) {
  const map = { '.md': 'md', '.markdown': 'md' };
  if (map[ext]) return map[ext];
  if (ext === '.json') return 'json';
  return 'code';
}

// ── 简易 Markdown 渲染 ──
function _renderMarkdown(text) {
  let html = escHtml(text);
  // 代码块 ```...```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return '<pre class="preview-code" style="margin:8px 0;padding:12px;background:var(--bg3);border:1px solid var(--border);border-radius:6px"><code>' + _highlightCode(code, '.' + lang) + '</code></pre>';
  });
  // 行内代码 `...`
  html = html.replace(/`([^`]+)`/g, '<code style="background:var(--bg3);color:var(--accent);padding:1px 5px;border-radius:3px;font-size:0.9em">$1</code>');
  // 表格 — 必须在标题/列表/换行之前处理
  html = html.replace(/^\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/gm, (match, headerRow, bodyRows) => {
    const headers = headerRow.split('|').map(c => c.trim()).filter(Boolean);
    let tbl = '<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:13px">';
    tbl += '<thead><tr>' + headers.map(h => '<th style="border:1px solid var(--border);padding:6px 10px;background:var(--bg3);text-align:left">' + h + '</th>').join('') + '</tr></thead>';
    const bodyLines = bodyRows.trim().split('\n');
    tbl += '<tbody>';
    bodyLines.forEach(line => {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length > 0) {
        tbl += '<tr>' + cells.map(c => '<td style="border:1px solid var(--border);padding:6px 10px">' + c + '</td>').join('') + '</tr>';
      }
    });
    tbl += '</tbody></table>';
    return tbl;
  });
  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3 style="margin:12px 0 6px;color:var(--accent)">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="margin:16px 0 8px;color:var(--accent)">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="margin:20px 0 10px;color:var(--accent);font-size:1.3em">$1</h1>');
  // 加粗 **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // 列表 - 和 *
  html = html.replace(/^[*-] (.+)$/gm, '<li style="margin:2px 0 2px 16px">$1</li>');
  // 空行 → <br>
  html = html.replace(/\n\n/g, '</p><p style="margin:6px 0">');
  html = html.replace(/\n/g, '<br>');
  return '<div class="preview-md" style="padding:16px;line-height:1.7;font-size:14px;max-width:800px">' + html + '</div>';
}

// ── JSON 高亮 ──
function _highlightJSON(text) {
  try {
    const parsed = JSON.parse(text);
    text = JSON.stringify(parsed, null, 2);
  } catch (e) { /* 非合法 JSON，原样显示 */ }
  return _highlightCode(text, '.json');
}

// ── 语法高亮（轻量，无外部依赖）──
function _highlightCode(code, ext) {
  let html = escHtml(code);

  const keywordsJS = /\b(import|export|from|const|let|var|function|return|if|else|for|while|async|await|try|catch|throw|new|class|extends|type|interface|enum|as|typeof|instanceof|this|super|true|false|null|undefined)\b/g;
  const keywordsPy = /\b(import|from|def|class|return|if|elif|else|for|while|try|except|finally|with|as|pass|None|True|False|async|await|print|self|raise|yield|lambda)\b/g;
  const typesJS = /\b(string|number|boolean|void|never|any|unknown|T\[\]|Record|Promise|Array)\b/g;
  const decorators = /(@\w+)/g;

  // 注释
  html = html.replace(/(\/\/.*$)/gm, '<span class="hl-comment">$1</span>');
  html = html.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-comment">$1</span>');
  html = html.replace(/(#.*$)/gm, '<span class="hl-comment">$1</span>');

  // 字符串（先逃过已替换的）
  html = html.replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, '<span class="hl-string">$&</span>');

  // 数字
  html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-number">$1</span>');

  // 关键词
  const kw = ext === '.py' ? keywordsPy : keywordsJS;
  html = html.replace(kw, '<span class="hl-keyword">$1</span>');

  // 类型标注
  html = html.replace(typesJS, '<span class="hl-type">$1</span>');

  // 装饰器
  html = html.replace(decorators, '<span class="hl-decorator">$1</span>');

  return html;
}

async function previewImageFile(filePath, fileName) {
  _ensurePreviewOverlay();
  const overlay = document.getElementById('ws-preview-overlay');
  document.getElementById('ws-preview-title').textContent = '🖼 ' + fileName;
  const body = document.getElementById('ws-preview-body');
  try {
    const resp = await fetch('/api/workspace/files/' + App.currentProjectId + '/read?path=' + encodeURIComponent(filePath), { headers: { 'X-API-Key': 'dev-key-001' } });
    const data = await resp.json();
    body.innerHTML = '<div class="preview-image-wrap"><img src="' + data.content + '" alt="' + escHtml(fileName) + '" class="preview-image" onerror="this.parentElement.innerHTML=\'<div class=empty>图片加载失败</div>\'"></div>';
    body.scrollTop = 0;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  } catch (e) { toast('预览失败: ' + e.message, 'error'); }
}

// ── 自动部署 ──
async function deployProject() {
  try {
    const btn = document.querySelector('.btn-deploy');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ 部署中...'; }

    toast('🏗️ 正在构建...', 'info');
    const resp = await fetch('/api/workspace/build/' + App.currentProjectId, {
      method: 'POST', headers: { 'X-API-Key': 'dev-key-001' }
    });
    const data = await resp.json();

    if (data.ok) {
      toast('✅ 部署成功 (' + data.elapsed + ')', 'success');
    } else {
      const err = (data.error || '').slice(0, 200);
      toast('❌ 部署失败: ' + err, 'error');
    }
  } catch (e) {
    toast('部署出错: ' + e.message, 'error');
  } finally {
    const btn = document.querySelector('.btn-deploy');
    if (btn) { btn.disabled = false; btn.innerHTML = '🚀 自动部署'; }
  }
}

// ── 打包下载 ──
async function bundleDownload() {
  try {
    toast('正在打包，请稍候...', 'info');
    const resp = await fetch('/api/exports/project/' + App.currentProjectId + '/bundle', { headers: { 'X-API-Key': 'dev-key-001' } });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return toast('打包失败: ' + (err.message || resp.statusText), 'error');
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (App.currentProject ? (App.currentProject.name || 'project') : 'project') + '-workspace.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('下载完成 ✅', 'success');
  } catch (e) { toast('打包失败: ' + e.message, 'error'); }
}

// ── 一键体验（支持指定文件路径）──
async function openExperienceFile(filePath) {
  // 先同步打开空白窗口（避开手机浏览器弹窗拦截）
  const previewWindow = window.open('', '_blank');

  try {
    const resp = await fetch('/api/workspace/preview-token/' + App.currentProjectId, { method: 'POST', headers: { 'X-API-Key': 'dev-key-001' } });
    const data = await resp.json();
    if (!data.token) return toast('获取预览令牌失败', 'error');

    const fullUrl = window.location.origin + data.url + filePath;

    if (previewWindow) {
      previewWindow.location.href = fullUrl;
      toast('已在新标签页打开 🚀', 'success');
    } else {
      window.location.href = fullUrl;
    }
  } catch (e) {
    if (previewWindow) previewWindow.close();
    toast('体验入口启动失败: ' + e.message, 'error');
  }
}

// 兼容旧调用（无参数时用 index.html）
async function openExperience() {
  openExperienceFile('index.html');
}

// ── 主入口 ──
async function loadDelivery() {
  if (!App.currentProjectId) return;

  try {
    // 加载 overview
    const overviewResp = await fetch('/api/workspace/overview/' + App.currentProjectId, { headers: { 'X-API-Key': 'dev-key-001' } });
    const overview = await overviewResp.json();

    // 加载文件列表
    let showAllFiles = false;
    window._deliveryReloadFiles = async function(showAll) {
      showAllFiles = showAll;
      // 保存目录展开状态
      const openDirs = new Set();
      document.querySelectorAll('.delivery-dir[data-dirpath]').forEach(d => {
        if (d.open) openDirs.add(d.getAttribute('data-dirpath'));
      });
      const filesResp = await fetch('/api/workspace/files/' + App.currentProjectId + (showAll ? '?showAll=1' : ''), { headers: { 'X-API-Key': 'dev-key-001' } });
      const filesData = await filesResp.json();
      const files = filesData.files || [];
      renderDeliveryFiles(files, showAll);
      // 恢复目录展开状态
      openDirs.forEach(path => {
        document.querySelectorAll('.delivery-dir[data-dirpath]').forEach(el => {
          if (el.getAttribute('data-dirpath') === path) el.open = true;
        });
      });
    }
    const filesResp = await fetch('/api/workspace/files/' + App.currentProjectId, { headers: { 'X-API-Key': 'dev-key-001' } });
    const filesData = await filesResp.json();
    const files = filesData.files || [];

    document.getElementById('delivery-workspace-path').textContent = '📁 ' + (filesData.workspacePath || '');

    // ── 交付概览（精简横条）──
    const statsHtml = '<div class="delivery-summary">' +
      '<span>📋 <b>' + overview.totalReqs + '</b> 已完成需求</span>' +
      '<span class="sep"></span>' +
      '<span>✅ <b>' + overview.withDeliverables + '</b> 有交付物</span>' +
      '<span class="sep"></span>' +
      '<span>⚠️ <b>' + overview.missingDeliverables + '</b> 缺交付物</span>' +
      '<span class="sep"></span>' +
      '<span>📦 <b>' + overview.totalFiles + '</b> 个交付件</span>' +
      '</div>';
    document.getElementById('delivery-overview').innerHTML = statsHtml;

    // ── 操作栏 ──
    let actionsHtml = '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">';
    if (files.length > 0) {
      actionsHtml += '<button class="btn-primary" onclick="bundleDownload()">📦 打包下载</button>';
    }
    // 一键体验：支持多个 HTML 文件 + 自定义入口
    if (overview.hasWebPreview && overview.htmlFiles && overview.htmlFiles.length > 0) {
      const htmls = overview.htmlFiles;
      actionsHtml += '<span style="display:flex;align-items:center;gap:8px">';
      if (htmls.length === 1) {
        // 只有一个 HTML → 直接按钮
        actionsHtml += '<button class="btn-experience" onclick="openExperienceFile(\'' + escHtml(htmls[0].path).replace(/'/g, "\\'") + '\')">🌐 一键体验</button>';
      } else {
        // 多个 HTML → 下拉选择器 + 按钮（风格统一）
        const defaultSel = overview.defaultPreviewFile || htmls[0].path;
        actionsHtml += '<select class="preview-file-select" id="preview-file-select">';
        htmls.forEach(h => {
          const sel = h.path === defaultSel ? ' selected' : '';
          actionsHtml += '<option value="' + escHtml(h.path) + '"' + sel + '>' + escHtml(h.name) + '</option>';
        });
        actionsHtml += '</select>';
        actionsHtml += '<button class="btn-experience" onclick="openExperienceFile(document.getElementById(\'preview-file-select\').value)">🌐 一键体验</button>';
      }
      if (overview.previewEntry) {
        actionsHtml += '<span style="font-size:12px;color:var(--text2);cursor:help" title="项目配置指定入口">⚙️</span>';
      }
      actionsHtml += '</span>';
      // 自动部署按钮
      actionsHtml += '<button class="btn-deploy" onclick="deployProject()">🚀 自动部署</button>';
    }
    if (overview.totalSize > 0) {
      actionsHtml += '<span style="font-size:12px;color:var(--text2)">📦 ' + _fmtSize(overview.totalSize) + '</span>';
    }
    if (overview.lastDelivery) {
      actionsHtml += '<span style="font-size:12px;color:var(--text2)">🕐 ' + fmtDate(overview.lastDelivery) + '</span>';
    }
    actionsHtml += '</div>';
    document.getElementById('delivery-actions').innerHTML = actionsHtml;

    // ── 需求交付清单 ──
    let reqListHtml = '';
    if (overview.reqDetails && overview.reqDetails.length > 0) {
      reqListHtml += '<details><summary style="cursor:pointer;font-weight:bold;color:var(--accent);font-size:13px">📋 需求交付状态 (' + overview.reqDetails.length + ' 个)</summary>';
      reqListHtml += '<div style="margin-top:8px">';
      overview.reqDetails.forEach(r => {
        const icon = r.hasDeliverable ? '✅' : '⚠️';
        const color = r.hasDeliverable ? 'var(--green)' : 'var(--accent2)';
        reqListHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">';
        reqListHtml += '<span style="color:' + color + '">' + icon + ' ' + escHtml(r.id) + ' ' + escHtml(r.title) + '</span>';
        reqListHtml += '<span style="color:var(--text2)">' + r.fileCount + ' 个文件</span>';
        reqListHtml += '</div>';
      });
      reqListHtml += '</div></details>';
    }
    document.getElementById('delivery-req-list').innerHTML = reqListHtml;

    // ── 文件列表 ──
    renderDeliveryFiles(files, false);

  } catch (e) {
    document.getElementById('delivery-overview').innerHTML = '<div class="stat-card" style="grid-column:1/-1"><div class="stat-num" style="color:var(--accent2)">加载失败</div><div class="stat-label">' + escHtml(e.message) + '</div></div>';
  }
}

// ── 构建文件树 ──
function _buildFileTree(files) {
  const root = { name: '', children: [], isDir: true, depth: 0, path: '' };
  files.forEach(f => {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i];
      let child = node.children.find(c => c.name === dirName && c.isDir);
      if (!child) {
        const parentPath = node.path || '';
        child = { name: dirName, children: [], isDir: true, depth: i + 1, path: parentPath ? parentPath + '/' + dirName : dirName };
        node.children.push(child);
      }
      node = child;
    }
    node.children.push({
      name: f.name, path: f.path, size: f.size, modified: f.modified,
      type: f.type, isDir: false, depth: parts.length,
    });
  });
  // 排序：目录在前，文件在后，各自按字母
  function sortTree(n) {
    n.children.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(c => { if (c.isDir) sortTree(c); });
  }
  sortTree(root);
  return root;
}

// ── 递归渲染树节点 ──
function _renderTreeNode(node) {
  let html = '';
  node.children.forEach(child => {
    if (child.isDir) {
      html += '<details class="delivery-dir" data-dirpath="' + escHtml(child.path || child.name).replace(/'/g, "\\'") + '">' +
        '<summary class="delivery-dir-summary">' +
          '<span class="delivery-dir-label"><span class="dir-arrow">▶</span>' + (child.depth === 1 && !['/', ''].includes(child.name) ? _dirIcon(child.name) : '📁') + ' ' + escHtml(child.name) + '</span>' +
          '<span style="display:flex;align-items:center;gap:4px;flex-shrink:0">' +
            '<span style="color:var(--text2);font-weight:normal;font-size:11px">' + child.children.filter(c => !c.isDir).length + '</span>' +
            '<button class="btn-icon" onclick="event.stopPropagation();newFileInDir(\'' + (child.path || child.name).replace(/'/g, "\\'") + '\')" title="新建文件">➕</button>' +
            '<button class="btn-icon delete" onclick="event.stopPropagation();deleteDir(\'' + (child.path || child.name).replace(/'/g, "\\'") + '\')" title="删除目录">🗑</button>' +
          '</span>' +
        '</summary>' +
        _renderTreeNode(child) +
      '</details>';
    } else {
      const icon = _getFileIcon(child.type);
      const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'].includes(child.type);
      const canPreview = ['.md', '.html', '.js', '.py', '.json', '.css', '.txt', '.xml', '.yaml', '.yml', '.sql', '.sh', '.log', '.ts', '.tsx', '.jsx', '.bat', '.markdown'].includes(child.type);
      let actions = '';
      if (child.type === '.html') {
        actions += '<button class="btn-icon" onclick="event.stopPropagation();openExperienceFile(\'' + escHtml(child.path).replace(/'/g, "\\'") + '\')" title="一键体验">🌐</button>';
      }
      if (isImage) {
        actions += '<button class="btn-icon" onclick="event.stopPropagation();previewImageFile(\'' + escHtml(child.path).replace(/'/g, "\\'") + '\',\'' + escHtml(child.name).replace(/'/g, "\\'") + '\')" title="预览图片">🖼</button>';
      }
      if (canPreview && child.size < 500000) {
        actions += '<button class="btn-icon" onclick="event.stopPropagation();previewTextFile(\'' + escHtml(child.path).replace(/'/g, "\\'") + '\',\'' + escHtml(child.name).replace(/'/g, "\\'") + '\',\'' + escHtml(child.type).replace(/'/g, "\\'") + '\')" title="预览">👁</button>';
        actions += '<button class="btn-icon" onclick="event.stopPropagation();editFile(\'' + escHtml(child.path).replace(/'/g, "\\'") + '\',\'' + escHtml(child.name).replace(/'/g, "\\'") + '\')" title="编辑">✏️</button>';
      }
      actions += '<button class="btn-icon delete" onclick="event.stopPropagation();deleteFile(\'' + escHtml(child.path).replace(/'/g, "\\'") + '\')" title="删除">🗑</button>';
      html += '<div class="delivery-file-row" data-filepath="' + escHtml(child.path) + '" data-filename="' + escHtml(child.name).toLowerCase() + '">' +
        '<span class="delivery-file-name">' + icon + ' ' + escHtml(child.name) + '</span>' +
        '<span class="delivery-file-meta">' +
          '<span class="delivery-file-size">' + _fmtSize(child.size) + '</span>' +
          '<span class="delivery-file-date">' + fmtDate(child.modified) + '</span>' +
          actions +
        '</span>' +
      '</div>';
    }
  });
  return html;
}

function _dirIcon(name) {
  const map = { code: '💻', src: '📦', public: '🌍', data: '📊', docs: '📝', dist: '🚀', node_modules: '📦' };
  return map[name] || '📁';
}

function renderDeliveryFiles(files, showAll) {
  const container = document.getElementById('delivery-files');
  if (!container) return;

  if (!files.length) {
    container.innerHTML = '<div class="empty" style="padding:20px;text-align:center">📭 暂无交付物<br><span style="font-size:12px;color:var(--text2)">创建需求并执行后，交付物会自动出现在这里</span></div>';
    return;
  }

  // 搜索 + 过滤提示
  let filterHint = '';
  if (!showAll) {
    filterHint = '<span style="font-size:11px;color:var(--text2)">🔇 已过滤构建产物 — <a href="#" style="color:var(--accent);text-decoration:underline" onclick="window._deliveryReloadFiles(true);return false">显示全部</a></span>';
  } else {
    filterHint = '<span style="font-size:11px;color:var(--text2)">🔊 全部文件 — <a href="#" style="color:var(--accent);text-decoration:underline" onclick="window._deliveryReloadFiles(false);return false">恢复过滤</a></span>';
  }

  let html = '<div class="delivery-file-toolbar">' +
    '<input class="delivery-search" id="delivery-search-input" type="text" placeholder="搜索文件..." oninput="filterDeliveryFiles(this.value)" />' +
    '<span style="font-size:12px;color:var(--text2);white-space:nowrap" id="delivery-file-count">' + files.length + ' 个文件</span>' +
    filterHint +
    '</div>';

  // 多级树形渲染（默认折叠）
  const tree = _buildFileTree(files);
  html += '<div id="delivery-file-list">';
  // 从根的子节点开始渲染
  tree.children.forEach(child => {
    if (child.isDir) {
      html += '<details class="delivery-dir" data-dirpath="' + escHtml(child.path || child.name).replace(/'/g, "\\'") + '">' +
        '<summary class="delivery-dir-summary">' +
          '<span class="delivery-dir-label"><span class="dir-arrow">▶</span>' + _dirIcon(child.name) + ' ' + escHtml(child.name) + '</span>' +
          '<span style="display:flex;align-items:center;gap:4px;flex-shrink:0">' +
            '<span style="color:var(--text2);font-weight:normal;font-size:11px">' + child.children.filter(c => !c.isDir).length + '</span>' +
            '<button class="btn-icon" onclick="event.stopPropagation();newFileInDir(\'' + (child.path || child.name).replace(/'/g, "\\'") + '\')" title="新建文件">➕</button>' +
            '<button class="btn-icon delete" onclick="event.stopPropagation();deleteDir(\'' + (child.path || child.name).replace(/'/g, "\\'") + '\')" title="删除目录">🗑</button>' +
          '</span>' +
        '</summary>' +
        _renderTreeNode(child) +
      '</details>';
    } else {
      // 根目录下的文件
      const icon = _getFileIcon(child.type);
      html += '<div class="delivery-file-row" data-filepath="' + escHtml(child.path) + '" data-filename="' + escHtml(child.name).toLowerCase() + '">' +
        '<span class="delivery-file-name" style="padding-left:12px">' + icon + ' ' + escHtml(child.name) + '</span>' +
        '<span class="delivery-file-meta">' +
          '<span class="delivery-file-size">' + _fmtSize(child.size) + '</span>' +
          '<span class="delivery-file-date">' + fmtDate(child.modified) + '</span>' +
        '</span>' +
      '</div>';
    }
  });
  html += '</div>';

  container.innerHTML = html;
}

// ── 文件列表搜索过滤 ──
function filterDeliveryFiles(query) {
  const q = query.toLowerCase().trim();
  const rows = document.querySelectorAll('.delivery-file-row');
  let visible = 0;
  rows.forEach(row => {
    const name = row.getAttribute('data-filename') || '';
    const path = (row.getAttribute('data-filepath') || '').toLowerCase();
    const match = !q || name.includes(q) || path.includes(q);
    row.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  document.querySelectorAll('.delivery-dir').forEach(details => {
    const hasVisible = Array.from(details.querySelectorAll('.delivery-file-row')).some(r => r.style.display !== 'none');
    details.style.display = hasVisible ? '' : 'none';
  });
  const countEl = document.getElementById('delivery-file-count');
  if (countEl) countEl.textContent = visible + ' / ' + rows.length + ' 个文件';
}

// ── 编辑文件 ──
async function editFile(filePath, fileName) {
  _ensurePreviewOverlay();
  const overlay = document.getElementById('ws-preview-overlay');
  document.getElementById('ws-preview-title').textContent = '✏️ 编辑: ' + fileName;
  const body = document.getElementById('ws-preview-body');
  try {
    const resp = await fetch('/api/workspace/files/' + App.currentProjectId + '/read?path=' + encodeURIComponent(filePath), { headers: { 'X-API-Key': 'dev-key-001' } });
    const data = await resp.json();
    body.innerHTML =
      '<div style="display:flex;flex-direction:column;height:100%">' +
        '<div style="display:flex;gap:8px;padding:8px 12px;background:var(--bg2);border-bottom:1px solid var(--border);flex-shrink:0">' +
          '<button class="btn-primary" onclick="saveEditedFile()">💾 保存</button>' +
          '<button class="btn-small" onclick="closeFilePreview()">取消</button>' +
          '<span style="font-size:12px;color:var(--text2);margin-left:8px" id="edit-file-path">' + escHtml(filePath) + '</span>' +
        '</div>' +
        '<textarea id="edit-file-textarea" style="flex:1;width:100%;padding:12px;font-family:monospace;font-size:13px;line-height:1.6;background:var(--bg);color:var(--text);border:none;outline:none;resize:none;tab-size:2">' + escHtml(data.content || '') + '</textarea>' +
      '</div>';
    body.scrollTop = 0;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    // 保存当前编辑的文件路径
    overlay._editPath = filePath;
  } catch (e) { toast('加载失败: ' + e.message, 'error'); }
}

async function saveEditedFile() {
  const overlay = document.getElementById('ws-preview-overlay');
  const filePath = overlay._editPath;
  const content = document.getElementById('edit-file-textarea').value;
  if (!filePath) return toast('未指定文件路径', 'error');
  try {
    const resp = await fetch('/api/workspace/files/' + App.currentProjectId + '/write', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify({ path: filePath, content }),
    });
    const data = await resp.json();
    if (data.error) return toast('保存失败: ' + data.error, 'error');
    toast('✅ 已保存', 'success');
    closeFilePreview();
    // 刷新文件列表
    window._deliveryReloadFiles(false);
  } catch (e) { toast('保存失败: ' + e.message, 'error'); }
}

// ── 新建文件 ──
async function newFileInDir(dirName) {
  const name = await showPrompt({
    title: '新建文件',
    message: '输入文件名（含扩展名）',
    placeholder: '如 index.tsx',
    defaultValue: '',
    confirmText: '创建',
    multiline: false,
  });
  if (!name) return;
  // 用搜索找到第一个该目录下的文件路径前缀
  const firstRow = document.querySelector('.delivery-file-row[data-filepath^="' + dirName + '/"]');
  if (!firstRow) return toast('无法确定目录路径', 'error');
  const samplePath = firstRow.getAttribute('data-filepath');
  const dirPath = samplePath.substring(0, samplePath.indexOf(dirName) + dirName.length);
  const fullPath = dirPath + '/' + name;
  try {
    const resp = await fetch('/api/workspace/files/' + App.currentProjectId + '/write', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify({ path: fullPath, content: '' }),
    });
    const data = await resp.json();
    if (data.error) return toast('创建失败: ' + data.error, 'error');
    toast('✅ 文件已创建', 'success');
    window._deliveryReloadFiles(false);
    // 自动打开编辑
    editFile(fullPath, name);
  } catch (e) { toast('创建失败: ' + e.message, 'error'); }
}

// ── 删除目录 ──
async function deleteDir(dirPath) {
  const ok = await showConfirm('确定删除整个目录？\n' + dirPath + '\n\n目录内所有文件将被永久删除。');
  if (!ok) return;
  try {
    const resp = await fetch('/api/workspace/directory/' + App.currentProjectId + '?path=' + encodeURIComponent(dirPath), {
      method: 'DELETE', headers: { 'X-API-Key': 'dev-key-001' },
    });
    const data = await resp.json();
    if (data.error) return toast('删除失败: ' + data.error, 'error');
    toast('🗑 目录已删除', 'success');
    window._deliveryReloadFiles(false);
  } catch (e) { toast('删除失败: ' + e.message, 'error'); }
}

// ── 删除文件 ──
async function deleteFile(filePath) {
  const ok = await showConfirm('确定删除此文件？\n' + filePath);
  if (!ok) return;
  try {
    const resp = await fetch('/api/workspace/files/' + App.currentProjectId + '?path=' + encodeURIComponent(filePath), {
      method: 'DELETE', headers: { 'X-API-Key': 'dev-key-001' },
    });
    const data = await resp.json();
    if (data.error) return toast('删除失败: ' + data.error, 'error');
    toast('🗑 已删除', 'success');
    window._deliveryReloadFiles(false);
  } catch (e) { toast('删除失败: ' + e.message, 'error'); }
}
