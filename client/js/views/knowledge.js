// 知识库视图
// 依赖: core/state.js, core/utils.js, js/api.js

let _currentPagePath = null;

async function loadKnowledgeView() {
  _currentPagePath = null;
  _pagePathCache = null;
  try {
    await Promise.all([
      loadKnowledgeTree().catch(e => console.warn('Knowledge tree:', e.message)),
      loadKnowledgeFiles().catch(e => console.warn('Knowledge files:', e.message)),
      loadKnowledgeStats().catch(e => console.warn('Knowledge stats:', e.message)),
    ]);
  } catch (e) {
    // 全局容错
  }
}

// ── 知识库统计 ──

async function loadKnowledgeStats() {
  try {
    const stats = await api('GET', `/knowledge/${App.currentProjectId}/stats`);
    const el = document.getElementById('knowledge-stats');
    if (stats.exists) {
      el.textContent = `📄 ${stats.pageCount} 页 | 📁 ${stats.uploadCount} 个上传`;
    } else {
      el.textContent = '⚪ 知识库未初始化';
    }
  } catch (e) {
    // 静默
  }
}

// ── 目录树 ──

async function loadKnowledgeTree() {
  try {
    const tree = await api('GET', `/knowledge/${App.currentProjectId}/tree`);
    // 建立路径缓存（用于 wikilink 解析）
    _pagePathCache = {};
    if (tree && tree.length) {
      for (const item of tree) {
        if (item.type === 'file') {
          const name = item.name.replace('.md', '');
          _pagePathCache[item.name] = item.path;
          _pagePathCache[name] = item.path;
        }
      }
    }
    const el = document.getElementById('knowledge-tree');
    el.innerHTML = renderTree(tree);
  } catch (e) {
    document.getElementById('knowledge-tree').innerHTML =
      `<div class="empty">加载失败: ${escHtml(e.message)}</div>`;
  }
}

function renderTree(tree) {
  if (!tree || !tree.length) {
    return '<div class="empty" style="padding:16px 0;font-size:13px">知识库为空</div>';
  }

  let html = '';

  for (const item of tree) {
    if (item.type === 'directory') {
      const depth = item.path.split(/[/\\]/).length;
      const padding = depth * 16;
      html += `<div style="padding-left:${padding}px;font-size:12px;color:var(--text2);margin:4px 0">
        📁 ${escHtml(item.name)}</div>`;
    } else if (item.type === 'file') {
      const depth = item.path.split(/[/\\]/).length;
      const padding = depth * 16;
      const isActive = item.path === _currentPagePath;
      const isProtected = ['index.md', 'log.md', 'SCHEMA.md'].includes(item.name);
      html += `<div style="padding-left:${padding}px;margin:2px 0;display:flex;align-items:center;justify-content:space-between">
        <a href="#" onclick="openKnowledgePage('${escHtml(item.path)}');return false"
           style="text-decoration:none;color:${isActive ? 'var(--accent)' : 'var(--text)'};
                  font-size:13px;${isActive ? 'font-weight:bold' : ''};flex:1">
          📄 ${escHtml(item.name.replace('.md', ''))}</a>
        ${isProtected ? '' : `<button class="btn-small" style="font-size:9px;padding:0 4px;margin-left:4px;opacity:0.4" onclick="deleteKnowledgePage('${escHtml(item.path)}','${escHtml(item.name)}')" title="删除页面">🗑</button>`}
      </div>`;
    }
  }

  return html;
}

// ── 打开知识页面 ──

async function openKnowledgePage(pagePath) {
  _currentPagePath = pagePath;
  try {
    const data = await api('GET', `/knowledge/${App.currentProjectId}/page?path=${encodeURIComponent(pagePath)}`);
    const contentEl = document.getElementById('knowledge-page-content');
    const summaryEl = document.getElementById('knowledge-index-summary');

    summaryEl.style.display = 'none';
    contentEl.style.display = 'block';

    // 渲染 markdown（简单渲染，支持 frontmatter 显示和 wikilink 转换）
    contentEl.innerHTML = renderKnowledgePage(data.content);

    // 高亮当前页面
    document.querySelectorAll('#knowledge-tree a').forEach(a => a.style.fontWeight = 'normal');
    const activeLink = document.querySelector(`#knowledge-tree a[href*="${escHtml(pagePath)}"]`);
    if (activeLink) activeLink.style.fontWeight = 'bold';

    // 重新加载树以更新高亮
    loadKnowledgeTree();
  } catch (e) {
    toast('加载页面失败: ' + e.message, 'error');
  }
}

function renderKnowledgePage(markdown) {
  if (!markdown) return '<div class="empty">页面为空</div>';

  let html = markdown;

  // 提取并显示 frontmatter（如果有）
  const fmMatch = html.match(/^---\n([\s\S]*?)\n---\n*/);
  if (fmMatch) {
    const fm = fmMatch[1];
    html = html.slice(fmMatch[0].length);

    // 解析 frontmatter 为属性面板
    const lines = fm.split('\n').filter(l => l.includes(':'));
    let fmHtml = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:12px;display:flex;flex-wrap:wrap;gap:12px">';
    for (const line of lines) {
      const [key, ...vals] = line.split(':');
      const val = vals.join(':').trim().replace(/^['"]|['"]$/g, '');
      let icon = '📌';
      if (key.trim() === 'type') icon = '🏷️';
      else if (key.trim() === 'created' || key.trim() === 'updated') icon = '📅';
      else if (key.trim() === 'tags') icon = '🔖';
      else if (key.trim() === 'confidence') icon = '🎯';
      else if (key.trim() === 'contested') icon = val === 'true' ? '⚠️' : '✅';
      fmHtml += `<span><strong>${icon} ${key.trim()}:</strong> ${escHtml(val)}</span>`;
    }
    fmHtml += '</div>';
    html = fmHtml + html;
  }

  // 转换 [[wikilink]] 为页面内链接
  html = html.replace(/\[\[([^\]]+)\]\]/g, (match, name) => {
    const pageName = name.split('|')[0].trim();
    const displayName = name.includes('|') ? name.split('|')[1].trim() : pageName;
    // 尝试找到对应的知识页面
    const pagePath = findPagePathByName(pageName);
    if (pagePath) {
      return `<a href="#" onclick="openKnowledgePage('${escHtml(pagePath)}');return false" style="color:var(--accent);text-decoration:none;border-bottom:1px dashed var(--accent3)">${escHtml(displayName)}</a>`;
    }
    return `<span style="color:var(--text2);border-bottom:1px dashed var(--border)">${escHtml(displayName)}</span>`;
  });

  // 简单 markdown 渲染
  html = simpleMarkdown(html);

  return html;
}

// 缓存知识树中文件路径用于 wikilink 解析
let _pagePathCache = null;

function findPagePathByName(name) {
  if (!_pagePathCache) return null;
  // 尝试多种匹配：完整文件名、不含扩展名、下划线替换空格等
  const candidates = [
    `${name}.md`,
    name,
    name.replace(/\s+/g, '-') + '.md',
    name.replace(/\s+/g, '_') + '.md',
  ];
  for (const c of candidates) {
    if (_pagePathCache[c]) return _pagePathCache[c];
  }
  return null;
}

function simpleMarkdown(text) {
  // 标题
  text = text.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.+)$/gm, '<h2 style="font-size:16px;margin:16px 0 8px">$1</h2>');
  text = text.replace(/^# (.+)$/gm, '<h1 style="font-size:20px;margin:16px 0 8px">$1</h1>');

  // 粗体/斜体
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 行内代码
  text = text.replace(/`([^`]+)`/g, '<code style="background:var(--bg2);padding:1px 4px;border-radius:3px;font-size:12px">$1</code>');

  // 代码块（保留）
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g,
    '<pre style="background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:8px;overflow-x:auto;font-size:12px"><code>$2</code></pre>');

  // 无序列表
  text = text.replace(/^- (.+)$/gm, '<li style="margin:2px 0">$1</li>');
  text = text.replace(/(<li[\s\S]*?<\/li>)/g, '<ul style="padding-left:20px;margin:4px 0">$1</ul>');

  // 链接
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--accent)">$1</a>');

  // 引用
  text = text.replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid var(--accent3);padding:4px 8px;margin:4px 0;background:var(--bg2);font-size:13px">$1</blockquote>');

  // 分隔线
  text = text.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">');

  // 表格
  text = text.replace(/^\|(.+)\|$/gm, (match) => {
    const cells = match.split('|').filter(c => c.trim()).map(c => c.trim());
    const isHeader = cells.every(c => c.startsWith('---'));
    if (isHeader) return '</thead><tbody>';
    const cellHtml = cells.map(c => `<td style="padding:4px 8px;border:1px solid var(--border);font-size:13px">${c}</td>`).join('');
    return `<tr>${cellHtml}</tr>`;
  });

  // 段落（剩下的非空行）
  text = text.replace(/^(?!<[a-z])/gm, '');

  return text.replace(/\n{3,}/g, '\n\n');
}

// ── 上传弹窗控制 ──

let _pendingUploadFile = null;

function showUploadDialog() {
  _pendingUploadFile = null;
  document.getElementById('upload-file-input').value = '';
  document.getElementById('upload-file-name').textContent = '未选择文件';
  document.getElementById('upload-purpose').value = '';
  document.getElementById('upload-submit-btn').disabled = true;
  document.getElementById('upload-progress').style.display = 'none';
  document.getElementById('upload-dialog-overlay').style.display = 'flex';
}

function hideUploadDialog() {
  document.getElementById('upload-dialog-overlay').style.display = 'none';
  _pendingUploadFile = null;
}

function onFileSelected(input) {
  _pendingUploadFile = input.files[0];
  document.getElementById('upload-file-name').textContent = _pendingUploadFile ? _pendingUploadFile.name : '未选择文件';
  document.getElementById('upload-submit-btn').disabled = !_pendingUploadFile;
}

async function doUploadWithPurpose() {
  const file = _pendingUploadFile;
  if (!file) return toast('请先选择文件', 'error');

  const purpose = document.getElementById('upload-purpose').value.trim();
  document.getElementById('upload-submit-btn').disabled = true;
  document.getElementById('upload-progress').style.display = 'block';
  document.getElementById('upload-progress').textContent = '⏳ 上传中...';

  try {
    const formData = new FormData();
    formData.append('file', file);
    if (purpose) formData.append('notes', purpose);

    const result = await apiUpload('POST', `/knowledge/${App.currentProjectId}/upload`, formData);
    toast(`文件 ${file.name} 上传成功 (${(result.size / 1024).toFixed(1)}KB)`, 'success');

    hideUploadDialog();

    // 刷新列表
    await Promise.all([
      loadKnowledgeFiles(),
      loadKnowledgeTree(),
      loadKnowledgeStats(),
    ]);
  } catch (e) {
    document.getElementById('upload-progress').textContent = '❌ 上传失败: ' + e.message;
    document.getElementById('upload-submit-btn').disabled = false;
    toast('上传失败: ' + e.message, 'error');
  }
}

// ── 上传文件列表 ──

async function loadKnowledgeFiles() {
  try {
    const files = await api('GET', `/knowledge/${App.currentProjectId}/files`);
    const el = document.getElementById('knowledge-files');

    if (!files || !files.length) {
      el.innerHTML = '<div class="empty" style="padding:8px 0;font-size:13px">暂无上传文件</div>';
      return;
    }

    el.innerHTML = files.map(f => {
      const date = new Date(f.uploaded_at);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
      const statusIcon = f.status === 'scanned' ? '✅' : f.status === 'scanning' ? '⏳' : f.status === 'failed' ? '❌' : '📤';
      const statusLabel = f.status === 'scanned' ? '已扫描' : f.status === 'scanning' ? '扫描中...' : f.status === 'failed' ? '扫描失败' : '待扫描';
      const rescanBtn = f.status !== 'scanning'
        ? `<button class="btn-small" style="font-size:10px;margin-left:4px" onclick="rescanKnowledgeFile('${f.id}')" title="重新扫描">🔄</button>`
        : '';
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
        <span>${statusIcon} ${escHtml(f.original_name)} <span style="color:var(--text2);font-size:11px">(${(f.size / 1024).toFixed(1)}KB)</span>
        <span style="color:var(--text2);font-size:11px;margin-left:8px">${statusLabel}</span></span>
        <span style="color:var(--text2);font-size:11px">${dateStr} ${f.notes ? '📝 ' + escHtml(f.notes) : ''}
        ${rescanBtn}
        <button class="btn-small" style="font-size:10px;margin-left:4px" onclick="deleteKnowledgeFile('${f.id}','${escHtml(f.original_name)}')">🗑</button></span>
      </div>`;
    }).join('');
  } catch (e) {
    document.getElementById('knowledge-files').innerHTML =
      `<div class="empty">加载失败: ${escHtml(e.message)}</div>`;
  }
}

// ── 删除文件 ──

async function deleteKnowledgeFile(fileId, name) {
  if (!(await showConfirm(`确认删除上传文件「${name}」？`))) return;
  try {
    await api('DELETE', `/knowledge/${App.currentProjectId}/files/${fileId}`);
    toast('文件已删除', 'success');
    await Promise.all([
      loadKnowledgeFiles(),
      loadKnowledgeStats(),
      loadKnowledgeTree(),
    ]);
  } catch (e) {
    toast('删除失败: ' + e.message, 'error');
  }
}

// ── 刷新 ──

async function refreshKnowledge() {
  // 重建页面缓存
  _pagePathCache = null;
  await loadKnowledgeView();
}

// ── 重新扫描文件 ──

async function rescanKnowledgeFile(fileId) {
  try {
    toast('正在重新扫描...', 'info');
    const result = await api('POST', `/knowledge/${App.currentProjectId}/rescan/${fileId}`);
    if (result.status === 'scanned') {
      toast(`扫描完成: ${result.findings || 0} 个发现`, 'success');
    } else {
      toast(`扫描失败: ${result.error || '未知错误'}`, 'error');
    }
    await Promise.all([
      loadKnowledgeFiles(),
      loadKnowledgeTree(),
      loadKnowledgeStats(),
    ]);
  } catch (e) {
    toast('重新扫描失败: ' + e.message, 'error');
  }
}

// ── 需求详情关联知识面板 ──

async function loadRequirementKnowledge(reqId) {
  try {
    const panel = document.getElementById(`req-knowledge-panel-${reqId}`);
    if (!panel) return;

    // 获取已关联的知识
    const links = await api('GET', `/knowledge/${App.currentProjectId}/links/${reqId}`).catch(() => []);
    const hasLinks = links && links.length > 0;

    // 先尝试自动匹配（如果没有任何关联）
    let matches = [];
    if (!hasLinks) {
      // 获取需求标题（从 DOM 中提取或直接使用 reqId 查询）
      const titleEl = document.getElementById('detail-title');
      const title = titleEl ? titleEl.textContent.replace(/^[^:]+:\s*/, '') : '';
      const descEl = document.querySelector('#detail-content .md-content');
      const desc = descEl ? descEl.textContent.slice(0, 200) : '';
      if (title) {
        matches = await api('GET', `/knowledge/${App.currentProjectId}/match?title=${encodeURIComponent(title)}&description=${encodeURIComponent(desc)}`).catch(() => []);
      }
    }

    let html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">';
    html += '<h3 style="font-size:14px;margin:0">📚 关联知识</h3>';
    html += '<div style="display:flex;gap:4px">';
    html += `<button class="btn-small" style="font-size:10px" onclick="showKnowledgeMatchPanel('${reqId}')" title="匹配知识">🔍 匹配</button>`;
    html += '</div></div>';

    if (hasLinks) {
      html += '<div style="display:flex;flex-direction:column;gap:4px">';
      for (const link of links) {
        html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:12px">
          <span>📄 ${escHtml(link.title)} <span style="color:var(--text2);font-size:10px">(${link.relevance === 'auto' ? '自动' : '手动'})</span></span>
          <div>
            <button class="btn-small" style="font-size:10px;padding:1px 6px" onclick="openKnowledgePage('${escHtml(link.page_path)}');showWorkspaceView('knowledge');loadKnowledgeView();" title="查看">👁️</button>
            <button class="btn-small" style="font-size:10px;padding:1px 6px" onclick="unlinkRequirementKnowledge('${reqId}','${escHtml(link.page_path)}')" title="取消关联">✕</button>
          </div>
        </div>`;
      }
      html += '</div>';
    } else if (matches.length > 0) {
      // 显示自动匹配推荐
      html += '<div style="font-size:11px;color:var(--text2);margin-bottom:4px">自动匹配到以下相关知识：</div>';
      html += '<div style="display:flex;flex-direction:column;gap:4px">';
      for (const m of matches.slice(0, 4)) {
        const icon = m.relevance === 'high' ? '🔴' : m.relevance === 'medium' ? '🟡' : '🟢';
        html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:12px">
          <span>${icon} ${escHtml(m.title)} <span style="color:var(--text2);font-size:10px">${m.relevance}</span></span>
          <button class="btn-small" style="font-size:10px;padding:1px 6px" onclick="linkRequirementKnowledge('${reqId}','${escHtml(m.pagePath)}')" title="关联">+</button>
        </div>`;
      }
      html += '</div>';
    } else {
      html += '<div style="font-size:12px;color:var(--text2);padding:4px 0">暂无关联知识。点击「匹配」手动搜索。</div>';
    }

    panel.innerHTML = html;
  } catch (e) {
    const panel = document.getElementById(`req-knowledge-panel-${reqId}`);
    if (panel) {
      panel.innerHTML = '<div style="font-size:12px;color:var(--text2);padding:4px 0">📚 关联知识 — 加载失败</div>';
    }
  }
}

// ── 关联/取消关联知识 ──

async function linkRequirementKnowledge(reqId, pagePath) {
  try {
    await api('POST', `/knowledge/${App.currentProjectId}/link`, { reqId, pagePath });
    toast('已关联知识页面', 'success');
    loadRequirementKnowledge(reqId);
  } catch (e) {
    toast('关联失败: ' + e.message, 'error');
  }
}

async function unlinkRequirementKnowledge(reqId, pagePath) {
  try {
    await api('DELETE', `/knowledge/${App.currentProjectId}/unlink`, { reqId, pagePath });
    toast('已取消关联', 'info');
    loadRequirementKnowledge(reqId);
  } catch (e) {
    toast('取消关联失败: ' + e.message, 'error');
  }
}

// ── 知识匹配弹窗 ──

async function showKnowledgeMatchPanel(reqId) {
  const title = prompt('输入关键词进行匹配（留空则使用需求标题）:');
  if (title === null) return;

  const searchTitle = title.trim() || (document.getElementById('detail-title')?.textContent.replace(/^[^:]+:\s*/, '') || '');
  if (!searchTitle) return toast('请输入关键词', 'error');

  try {
    const matches = await api('GET', `/knowledge/${App.currentProjectId}/match?title=${encodeURIComponent(searchTitle)}&description=`);
    if (!matches || matches.length === 0) {
      toast('未找到匹配的知识页面', 'info');
      return;
    }

    // 简单的选择器弹窗
    const msg = matches.slice(0, 8).map((m, i) =>
      `${i + 1}. [${m.relevance}] ${m.title} (匹配: ${m.matchedKeywords.join(', ')})`
    ).join('\n');

    const choice = prompt(`找到 ${matches.length} 个匹配页面，输入编号关联（多个用逗号分隔）:\n\n${msg}`);
    if (!choice) return;

    const indices = choice.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0 && n <= matches.length);
    for (const idx of indices) {
      await linkRequirementKnowledge(reqId, matches[idx - 1].pagePath);
    }

    loadRequirementKnowledge(reqId);
  } catch (e) {
    toast('匹配失败: ' + e.message, 'error');
  }
}

// ── 删除知识页面 ──

async function deleteKnowledgePage(pagePath, name) {
  if (!(await showConfirm(`确认删除知识页面「${name}」？此操作不可撤销。`))) return;
  try {
    await api('DELETE', `/knowledge/${App.currentProjectId}/page?path=${encodeURIComponent(pagePath)}`);
    toast(`页面 ${name} 已删除`, 'success');
    if (_currentPagePath === pagePath) {
      _currentPagePath = null;
      document.getElementById('knowledge-page-content').style.display = 'none';
      document.getElementById('knowledge-index-summary').style.display = 'block';
    }
    await Promise.all([
      loadKnowledgeTree(),
      loadKnowledgeFiles(),
      loadKnowledgeStats(),
    ]);
  } catch (e) {
    toast('删除失败: ' + e.message, 'error');
  }
}

async function apiUpload(method, path, formData) {
  const url = `/api${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'X-API-Key': 'dev-key-001' },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}
