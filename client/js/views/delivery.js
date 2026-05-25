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
    const lineNums = lines.map((_, i) => '<span class="ln">' + String(i + 1).padStart(4, ' ') + '</span>').join('\n');
    const codeLines = lines.map(l => escHtml(l)).join('\n');
    body.innerHTML = '<div class="preview-code-wrap"><div class="preview-code-lines">' + lineNums + '</div><pre class="preview-code"><code>' + codeLines + '</code></pre></div>';
    body.scrollTop = 0;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  } catch (e) { toast('预览失败: ' + e.message, 'error'); }
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
    const filesResp = await fetch('/api/workspace/files/' + App.currentProjectId, { headers: { 'X-API-Key': 'dev-key-001' } });
    const filesData = await filesResp.json();
    const files = filesData.files || [];

    document.getElementById('delivery-workspace-path').textContent = '📁 ' + (filesData.workspacePath || '');

    // ── 交付概览卡片 ──
    const statsHtml =
      '<div class="stat-card" style="border-left:3px solid var(--green)"><div class="stat-num">' + overview.totalReqs + '</div><div class="stat-label">已完成需求</div></div>' +
      '<div class="stat-card" style="border-left:3px solid var(--accent)"><div class="stat-num">' + overview.withDeliverables + '</div><div class="stat-label">有交付物</div></div>' +
      '<div class="stat-card" style="border-left:3px solid var(--accent2)"><div class="stat-num">' + overview.missingDeliverables + '</div><div class="stat-label">缺交付物</div></div>' +
      '<div class="stat-card" style="border-left:3px solid var(--blue)"><div class="stat-num">' + overview.totalFiles + '</div><div class="stat-label">交付物文件</div></div>';
    document.getElementById('delivery-overview').innerHTML = statsHtml;

    // ── 操作栏 ──
    let actionsHtml = '';
    if (files.length > 0) {
      actionsHtml += '<button class="btn-primary" onclick="bundleDownload()">📦 打包下载</button>';
    }
    // 一键体验：支持多个 HTML 文件 + 自定义入口
    if (overview.hasWebPreview && overview.htmlFiles && overview.htmlFiles.length > 0) {
      const htmls = overview.htmlFiles;
      if (htmls.length === 1) {
        // 只有一个 HTML → 直接按钮
        actionsHtml += '<button class="btn-experience" onclick="openExperienceFile(\'' + escHtml(htmls[0].path).replace(/'/g, "\\'") + '\')">🌐 一键体验</button>';
      } else {
        // 多个 HTML → 下拉选择器 + 按钮
        // 默认选中 previewEntry 指定的那个，否则 index.html，否则第一个
        const defaultSel = overview.defaultPreviewFile || htmls[0].path;
        actionsHtml += '<select id="preview-file-select" style="padding:8px 12px;background:var(--bg2);color:var(--text);border:1px solid var(--accent);border-radius:var(--radius);font-size:13px;max-width:200px">';
        htmls.forEach(h => {
          const sel = h.path === defaultSel ? ' selected' : '';
          actionsHtml += '<option value="' + escHtml(h.path) + '"' + sel + '>' + escHtml(h.name) + '</option>';
        });
        actionsHtml += '</select>';
        actionsHtml += '<button class="btn-experience" onclick="openExperienceFile(document.getElementById(\'preview-file-select\').value)">🌐 一键体验</button>';
      }
      if (overview.previewEntry) {
        actionsHtml += '<span style="font-size:11px;color:var(--text2);margin-left:4px" title="项目配置指定入口">⚙️</span>';
      }
    }
    if (overview.totalSize > 0) {
      actionsHtml += '<span style="font-size:12px;color:var(--text2);margin-left:8px">总大小: ' + _fmtSize(overview.totalSize) + '</span>';
    }
    if (overview.lastDelivery) {
      actionsHtml += '<span style="font-size:12px;color:var(--text2);margin-left:8px">最近交付: ' + fmtDate(overview.lastDelivery) + '</span>';
    }
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
    if (!files.length) {
      document.getElementById('delivery-files').innerHTML = '<div class="empty" style="padding:20px;text-align:center">📭 暂无交付物<br><span style="font-size:12px;color:var(--text2)">创建需求并执行后，交付物会自动出现在这里</span></div>';
      return;
    }

    // 按目录分组
    const byDir = {};
    files.forEach(f => {
      const dir = f.path.includes('/') ? f.path.substring(0, f.path.lastIndexOf('/')) : '/';
      if (!byDir[dir]) byDir[dir] = [];
      byDir[dir].push(f);
    });

    const dirOrder = ['code', 'requirements', 'exports', 'deploy'];
    let fileHtml = '';

    // 先按固定顺序排，剩余按字母
    const sortedDirs = Object.keys(byDir).sort((a, b) => {
      const ia = dirOrder.indexOf(a), ib = dirOrder.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    sortedDirs.forEach(dir => {
      const items = byDir[dir];
      const dirIcon = dir === 'code' ? '💻' : dir === 'requirements' ? '📝' : dir === 'exports' ? '📄' : dir === 'deploy' ? '🚀' : '📁';
      fileHtml += '<div style="font-weight:bold;color:var(--accent);margin-top:12px;font-size:13px">' + dirIcon + ' ' + (dir === '/' ? '根目录' : dir) + ' <span style="color:var(--text2);font-weight:normal">(' + items.length + ')</span></div>';
      items.forEach(f => {
        const icon = _getFileIcon(f.type);
        const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'];
        const isImage = imageExts.includes(f.type);
        const isPreviewable = ['.md', '.html', '.js', '.py', '.json', '.css', '.txt', '.xml', '.yaml', '.yml', '.sql', '.sh', '.log', '.ts', '.bat'].includes(f.type) || isImage;

        let previewBtn = '';
        // HTML 文件：加一键体验按钮（🌐）
        if (f.type === '.html') {
          previewBtn = '<button class="btn-small btn-experience-icon" onclick="event.stopPropagation();openExperienceFile(\'' + escHtml(f.path).replace(/'/g, "\\'") + '\')" title="一键体验">🌐</button>';
        }
        if (isImage) {
          previewBtn += '<button class="btn-small" onclick="event.stopPropagation();previewImageFile(\'' + escHtml(f.path).replace(/'/g, "\\'") + '\',\'' + escHtml(f.name).replace(/'/g, "\\'") + '\')" title="预览图片">👁</button>';
        } else if (isPreviewable && f.size < 500000) {
          previewBtn += '<button class="btn-small" onclick="event.stopPropagation();previewTextFile(\'' + escHtml(f.path).replace(/'/g, "\\'") + '\',\'' + escHtml(f.name).replace(/'/g, "\\'") + '\',\'' + escHtml(f.type).replace(/'/g, "\\'") + '\')" title="预览文件">👁</button>';
        }

        fileHtml += '<div class="config-row workspace-file-row" style="padding-left:16px;font-size:13px">';
        fileHtml += '<span>' + icon + ' ' + escHtml(f.name) + '</span>';
        fileHtml += '<span style="display:flex;align-items:center;gap:12px;font-size:11px;color:var(--text2)">' + _fmtSize(f.size) + ' · ' + fmtDate(f.modified) + previewBtn + '</span>';
        fileHtml += '</div>';
      });
    });
    document.getElementById('delivery-files').innerHTML = fileHtml;

  } catch (e) {
    document.getElementById('delivery-overview').innerHTML = '<div class="stat-card" style="grid-column:1/-1"><div class="stat-num" style="color:var(--accent2)">加载失败</div><div class="stat-label">' + escHtml(e.message) + '</div></div>';
  }
}
