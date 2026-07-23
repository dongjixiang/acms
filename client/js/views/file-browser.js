// ACMS 文件浏览器 v0.70 — 完整重写：目录树 + 文件操作 + 搜索 + 上传 + 拖拽
// 依赖: api(), ACMSWin, ACMSWallpaper, toast()
// API:
//   GET  /files?path=...           → { currentPath, parentPath, entries: [{name,type,size,mtime}] }
//   POST /files/delete  { path }
//   POST /files/rename  { path, newName }
//   POST /files/mkdir   { path, name }
//   POST /files/upload  { path, fileName, content }  content=base64
//   GET  /files/search?q=xxx&path=yyy
(function() {
  'use strict';

  // ── 状态 ──
  var browsingWindow = null;
  var currentPath = '/';
  var historyStack = [];       // 后退历史
  var forwardStack = [];       // 前进历史
  var expandedDirs = {};       // 已展开的目录树节点 { path: true }
  var treeCache = {};          // 目录树子列表缓存 { path: [entries] }
  var currentSearch = '';      // 当前搜索关键词
  var renameTarget = null;     // 正在重命名的条目
  var contextEntry = null;     // 右键菜单的目标数据

  // ── 工具函数 ──
  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function jsStr(s) {
    return JSON.stringify(s).replace(/'/g, "\\'");
  }

  function fmtSize(bytes) {
    if (bytes == null) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function fmtMtime(ts) {
    if (!ts) return '';
    try {
      var d = new Date(ts);
      if (isNaN(d.getTime())) return String(ts);
      var month = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      var hour = String(d.getHours()).padStart(2, '0');
      var min = String(d.getMinutes()).padStart(2, '0');
      return month + '-' + day + ' ' + hour + ':' + min;
    } catch (e) {
      return String(ts);
    }
  }

  function guessIcon(name, type) {
    if (type === 'directory') return '📁';
    var ext = name ? name.split('.').pop().toLowerCase() : '';
    if (['jpg','jpeg','png','gif','bmp','webp','svg'].indexOf(ext) !== -1) return '🖼';
    if (['mp4','webm','avi','mov','mkv'].indexOf(ext) !== -1) return '🎬';
    if (['mp3','wav','ogg','flac','aac'].indexOf(ext) !== -1) return '🎵';
    if (['pdf'].indexOf(ext) !== -1) return '📄';
    if (['zip','rar','7z','tar','gz'].indexOf(ext) !== -1) return '📦';
    if (['doc','docx'].indexOf(ext) !== -1) return '📝';
    if (['xls','xlsx','csv'].indexOf(ext) !== -1) return '📊';
    if (['js','ts','py','java','cpp','c','h','go','rs'].indexOf(ext) !== -1) return '💻';
    if (['json','xml','yaml','yml','toml','ini','cfg','conf'].indexOf(ext) !== -1) return '⚙';
    if (['html','htm','css','scss','less'].indexOf(ext) !== -1) return '🌐';
    if (['md','txt','log'].indexOf(ext) !== -1) return '📃';
    return '📄';
  }

  function isImage(name) {
    if (!name) return false;
    var ext = name.split('.').pop().toLowerCase();
    return ['jpg','jpeg','png','gif','bmp','webp','svg'].indexOf(ext) !== -1;
  }

  function joinPath(base, name) {
    var b = base.replace(/\/+$/, '');
    if (!b) return '/' + name;
    return b + '/' + name;
  }

  function parentPathOf(p) {
    if (!p || p === '/') return '/';
    var parts = p.replace(/\/+$/, '').split('/');
    parts.pop();
    if (parts.length <= 1) return '/';
    return parts.join('/');
  }

  function shortName(path) {
    if (!path || path === '/') return '/';
    return path.replace(/\/+$/, '').split('/').pop();
  }

  function getInitialPath() {
    var userInfo = null;
    try {
      var raw = localStorage.getItem('acms-user');
      if (raw) userInfo = JSON.parse(raw);
    } catch (e) { /* ignore */ }
    if (userInfo && userInfo.role !== 'admin') {
      return '/workspaces';
    }
    return '/';
  }

  // ── Toast 封装 ──
  function fbToast(msg, type) {
    if (typeof toast === 'function') {
      toast(msg, type || 'success');
    }
  }

  // ── 通知窗口重新绘制 ──
  function refreshView() {
    if (!browsingWindow || browsingWindow.dead) return;
    renderAll(browsingWindow);
  }

  // ── 渲染全部 (工具栏 + 树 + 文件列表) ──
  function renderAll(w) {
    if (!w || w.dead) return;

    var html = '';

    // ═══ 工具栏 ═══
    html += '<div class="fb-toolbar">';
    // 后退 / 前进 / 上级 / 刷新
    html += '<button class="fb-tb-btn" onclick="window.FB_goBack()" title="后退" ' + (historyStack.length === 0 ? 'disabled style="opacity:0.4"' : '') + '>◀</button>';
    html += '<button class="fb-tb-btn" onclick="window.FB_goForward()" title="前进" ' + (forwardStack.length === 0 ? 'disabled style="opacity:0.4"' : '') + '>▶</button>';
    html += '<button class="fb-tb-btn" onclick="window.FB_goUp()" title="上级目录" ' + (currentPath === '/' ? 'disabled style="opacity:0.4"' : '') + '>↑</button>';
    html += '<button class="fb-tb-btn" onclick="window.FB_refresh()" title="刷新">↻</button>';
    // 面包屑导航
    html += '<div class="fb-path-bar">' + renderBreadcrumbs(currentPath) + '</div>';
    // 新建文件夹按钮
    html += '<button class="fb-tb-btn" onclick="window.FB_newFolder()" title="新建文件夹">📁+</button>';
    // 上传按钮
    html += '<button class="fb-tb-btn" onclick="window.FB_uploadFile()" title="上传文件">📤</button>';
    // 搜索框
    html += '<input class="fb-search-input" type="text" id="__fb_search" placeholder="🔍 搜索…" value="' + escHtml(currentSearch) + '" oninput="window.FB_onSearch(this.value)">';
    html += '</div>';

    // ═══ 主内容区（左右分栏） ═══
    html += '<div class="fb-body">';

    // 左侧：目录树
    html += '<div class="fb-tree-panel">';
    html += '<div class="fb-tree-header">📂 目录</div>';
    html += '<div class="fb-tree-content" id="__fb_tree">';
    html += renderTreeContent(currentPath);
    html += '</div>';
    html += '</div>';

    // 右侧：文件列表
    html += '<div class="fb-list-panel">';
    html += '<div class="fb-list-header">';
    html += '<span class="fb-col-icon"></span>';
    html += '<span class="fb-col-name">名称</span>';
    html += '<span class="fb-col-size">大小</span>';
    html += '<span class="fb-col-mtime">修改时间</span>';
    html += '<span class="fb-col-actions">操作</span>';
    html += '</div>';
    html += '<div class="fb-list" id="__fb_list">';
    html += '<div style="padding:40px;text-align:center;color:var(--text2)">⏳ 加载中...</div>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // .fb-body

    // ═══ 状态栏 ═══
    html += '<div class="fb-statusbar" id="__fb_status"></div>';

    // ── 拖拽上传遮罩 ──
    html += '<div class="fb-dropzone" id="__fb_dropzone">📂 拖放文件到此处上传</div>';

    w.$c.innerHTML = html;

    // 加载文件列表
    loadFileList(w, currentPath, currentSearch);
  }

  // ── 面包屑 ──
  function renderBreadcrumbs(path) {
    if (!path || path === '/') {
      return '<span class="fb-path-part" onclick="window.FB_navigate(\'/\')">/</span>';
    }
    var parts = path.replace(/^\/+/, '').replace(/\/+$/, '').split('/');
    var html = '<span class="fb-path-part" onclick="window.FB_navigate(\'/\')">/</span>';
    var accumulated = '';
    parts.forEach(function(part) {
      if (!part) return;
      accumulated += '/' + part;
      html += '<span class="fb-path-sep">/</span>';
      html += '<span class="fb-path-part" onclick="window.FB_navigate(\'' + escHtml(accumulated) + '\')">' + escHtml(part) + '</span>';
    });
    return html;
  }

  // ── 目录树渲染 ──
  function renderTreeContent(activePath) {
    var rootPath = '/';
    var rootLabel = '/';
    var isActive = (activePath === '/');
    var isExpanded = !!expandedDirs['/'];
    var arrow = isExpanded ? '▼' : '▶';
    var html = '<ul class="fb-tree-ul">';
    html += '<li class="fb-tree-li' + (isActive ? ' fb-tree-active' : '') + '" data-path="/">';
    html += '<span class="fb-tree-arrow" onclick="event.stopPropagation();window.FB_toggleTree(\'/\')">' + arrow + '</span>';
    html += '<span class="fb-tree-label" onclick="window.FB_navigate(\'/\')">📁 /</span>';
    if (isExpanded) {
      html += renderTreeChildren('/', activePath, 1);
    }
    html += '</li>';
    html += '</ul>';
    return html;
  }

  function renderTreeChildren(parentPath, activePath, depth) {
    // 检查缓存
    var cached = treeCache[parentPath];
    if (!cached) {
      // 未加载，显示加载指示器，触发加载
      return '<span class="fb-tree-loading">⏳</span>';
    }
    var dirs = cached.filter(function(e) { return e.type === 'directory'; });
    if (dirs.length === 0) {
      return '<span class="fb-tree-empty" style="padding-left:' + (depth * 16 + 8) + 'px;font-size:11px;color:var(--text2)">(空)</span>';
    }
    var html = '<ul class="fb-tree-ul" style="padding-left:' + (depth * 12) + 'px">';
    dirs.forEach(function(entry) {
      var childPath = joinPath(parentPath, entry.name);
      var isActive = (childPath === activePath);
      var isExpanded = !!expandedDirs[childPath];
      var hasCached = !!treeCache[childPath];
      var arrow = '▶';
      if (hasCached) {
        arrow = isExpanded ? '▼' : '▶';
      }
      html += '<li class="fb-tree-li' + (isActive ? ' fb-tree-active' : '') + '" data-path="' + escHtml(childPath) + '">';
      html += '<span class="fb-tree-arrow" onclick="event.stopPropagation();window.FB_toggleTree(\'' + escHtml(childPath) + '\')">' + arrow + '</span>';
      html += '<span class="fb-tree-label" onclick="window.FB_navigate(\'' + escHtml(childPath) + '\')">📁 ' + escHtml(entry.name) + '</span>';
      if (isExpanded) {
        html += renderTreeChildren(childPath, activePath, depth + 1);
      }
      html += '</li>';
    });
    html += '</ul>';
    return html;
  }

  // ── 加载目录树子节点 ──
  function loadTreeChildren(path) {
    return api('GET', '/files?path=' + encodeURIComponent(path))
      .then(function(data) {
        if (data && data.entries) {
          treeCache[path] = data.entries;
        }
        return data;
      })
      .catch(function(err) {
        treeCache[path] = [];
        fbToast('加载目录树失败: ' + (err.message || ''), 'error');
      });
  }

  // ── 加载文件列表 ──
  function loadFileList(w, path, search) {
    var listEl = w.$c.querySelector('#__fb_list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text2)">⏳ 加载中...</div>';

    var statusEl = w.$c.querySelector('#__fb_status');
    if (statusEl) statusEl.textContent = '⏳ 加载中...';

    var promise;
    if (search && search.trim()) {
      promise = api('GET', '/files/search?q=' + encodeURIComponent(search) + '&path=' + encodeURIComponent(path));
    } else {
      promise = api('GET', '/files?path=' + encodeURIComponent(path));
    }

    return promise
      .then(function(data) {
        if (w.dead) return;
        if (!data || !data.entries) {
          listEl.innerHTML = '<div class="fb-error">⚠ 返回数据格式异常</div>';
          if (statusEl) statusEl.textContent = '错误：数据格式异常';
          return;
        }
        renderFileList(listEl, statusEl, path, data, search);
      })
      .catch(function(err) {
        if (w.dead) return;
        listEl.innerHTML = '<div class="fb-error">⚠ 加载失败: ' + escHtml(err.message || '未知错误') + '</div>';
        if (statusEl) statusEl.textContent = '加载失败';
      });
  }

  // ── 渲染文件列表 ──
  function renderFileList(listEl, statusEl, path, data, search) {
    var entries = data.entries || [];
    var parent = data.parentPath;

    // 排序：目录在前，然后按名称排序
    entries.sort(function(a, b) {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      var na = (a.name || '').toLowerCase();
      var nb = (b.name || '').toLowerCase();
      if (na < nb) return -1;
      if (na > nb) return 1;
      return 0;
    });

    var html = '';

    // ".." 上级目录（不在根目录且非搜索模式）
    if (parent && path !== '/' && (!search || !search.trim())) {
      html += '<div class="fb-entry" onclick="window.FB_navigate(\'' + escHtml(parent) + '\')">';
      html += '<span class="fb-icon">🔙</span>';
      html += '<span class="fb-name" style="color:var(--text2);font-style:italic">.. 上级目录</span>';
      html += '<span class="fb-size">—</span>';
      html += '<span class="fb-mtime"></span>';
      html += '<span class="fb-actions"></span>';
      html += '</div>';
    }

    if (search && search.trim()) {
      // 搜索结果提示
      html += '<div class="fb-search-info">🔍 搜索 "' + escHtml(search) + '" 在 ' + escHtml(path) + ' 中的结果 (' + entries.length + ' 条)</div>';
    }

    if (entries.length === 0) {
      html += '<div class="fb-empty">📂 此目录为空</div>';
    } else {
      entries.forEach(function(entry) {
        var icon = entry.icon || guessIcon(entry.name, entry.type);
        var isDir = entry.type === 'dir' || entry.type === 'directory';
        var fullPath = joinPath(path, entry.name);
        var entryClass = 'fb-entry';
        if (isDir) entryClass += ' fb-entry-dir';

        var clickAttr = '';
        if (isDir) {
          clickAttr = ' onclick="window.FB_navigate(\'' + escHtml(fullPath) + '\')"';
        } else if (isImage(entry.name)) {
          clickAttr = ' onclick="window.FB_previewImage(\'' + escHtml(fullPath) + '\', \'' + escHtml(entry.name) + '\')"';
        }

        // 操作按钮
        var actionsHtml = '';
        actionsHtml += '<button class="fb-act-btn" title="重命名" onclick="event.stopPropagation();window.FB_rename(\'' + escHtml(fullPath) + '\', \'' + escHtml(entry.name) + '\', ' + (isDir ? 'true' : 'false') + ')">✏️</button>';
        actionsHtml += '<button class="fb-act-btn" title="删除" onclick="event.stopPropagation();window.FB_delete(\'' + escHtml(fullPath) + '\', \'' + escHtml(entry.name) + '\', ' + (isDir ? 'true' : 'false') + ')">🗑️</button>';
        if (isImage(entry.name)) {
          actionsHtml += '<button class="fb-act-btn" title="设为壁纸" onclick="event.stopPropagation();window.FB_setWallpaper(\'' + escHtml(fullPath) + '\')">🖼</button>';
        }

        html += '<div class="' + entryClass + '"' + clickAttr + ' oncontextmenu="event.preventDefault();event.stopPropagation();window.FB_contextMenu(event, \'' + escHtml(fullPath) + '\', \'' + escHtml(entry.name) + '\', ' + (isDir ? 'true' : 'false') + ', \'' + escHtml(icon) + '\')">';
        html += '<span class="fb-icon">' + icon + '</span>';
        html += '<span class="fb-name">' + escHtml(entry.name) + '</span>';
        html += '<span class="fb-size">' + (isDir ? '—' : fmtSize(entry.size)) + '</span>';
        html += '<span class="fb-mtime">' + fmtMtime(entry.mtime) + '</span>';
        html += '<span class="fb-actions">' + actionsHtml + '</span>';
        html += '</div>';
      });
    }

    listEl.innerHTML = html;

    // 状态栏
    if (statusEl) {
      var dirCount = entries.filter(function(e) { return e.type === 'directory'; }).length;
      var fileCount = entries.length - dirCount;
      if (search && search.trim()) {
        statusEl.textContent = '🔍 "' + search + '" — ' + entries.length + ' 个结果';
      } else {
        statusEl.textContent = dirCount + ' 个目录, ' + fileCount + ' 个文件';
      }
    }

    // 绑定拖拽事件
    bindDragDrop(listEl, path);
  }

  // ── 拖拽上传 ──
  function bindDragDrop(container, path) {
    var dropzone = browsingWindow && browsingWindow.$c ? browsingWindow.$c.querySelector('#__fb_dropzone') : null;
    if (!dropzone) return;

    function showDropzone(show) {
      dropzone.classList.toggle('fb-dropzone-active', show);
    }

    // 移除旧监听器（用新函数替换）
    var onDragOver = function(e) {
      e.preventDefault();
      e.stopPropagation();
      showDropzone(true);
    };
    var onDragLeave = function(e) {
      e.preventDefault();
      e.stopPropagation();
      showDropzone(false);
    };
    var onDrop = function(e) {
      e.preventDefault();
      e.stopPropagation();
      showDropzone(false);
      var files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleFileUpload(files, path);
      }
    };

    // 重新绑定（先移除旧的全局监听）
    container._fb_dropHandlers = container._fb_dropHandlers || [];
    container._fb_dropHandlers.forEach(function(h) {
      container.removeEventListener(h.type, h.fn);
    });
    container._fb_dropHandlers = [];

    [onDragOver, onDragLeave, onDrop].forEach(function(fn) {
      container.addEventListener(fn.name === 'onDragOver' ? 'dragover' : fn.name === 'onDragLeave' ? 'dragleave' : 'drop', fn);
      container._fb_dropHandlers.push({ type: fn.name === 'onDragOver' ? 'dragover' : fn.name === 'onDragLeave' ? 'dragleave' : 'drop', fn: fn });
    });

    // 文档级拖放防止浏览器打开文件
    document.body.addEventListener('dragover', function(e) { e.preventDefault(); });
    document.body.addEventListener('drop', function(e) { e.preventDefault(); });
  }

  function handleFileUpload(files, path) {
    if (!files || files.length === 0) return;
    fbToast('正在上传 ' + files.length + ' 个文件...', 'info');
    var uploaded = 0;
    var failed = 0;

    function uploadNext(index) {
      if (index >= files.length) {
        var msg = '上传完成: ' + uploaded + ' 成功';
        if (failed > 0) msg += ', ' + failed + ' 失败';
        fbToast(msg, failed > 0 ? 'warning' : 'success');
        if (uploaded > 0) refreshView();
        return;
      }
      var file = files[index];
      var reader = new FileReader();
      reader.onload = function(e) {
        var base64 = e.target.result.split(',')[1];
        api('POST', '/files/upload', {
          path: path,
          fileName: file.name,
          content: base64
        }).then(function() {
          uploaded++;
          uploadNext(index + 1);
        }).catch(function(err) {
          failed++;
          fbToast('上传失败 ' + file.name + ': ' + (err.message || ''), 'error');
          uploadNext(index + 1);
        });
      };
      reader.onerror = function() {
        failed++;
        fbToast('读取文件失败: ' + file.name, 'error');
        uploadNext(index + 1);
      };
      reader.readAsDataURL(file);
    }

    uploadNext(0);
  }

  // ── 图片预览 ──
  function previewImage(filePath, fileName) {
    var imgUrl = '/api/files?path=' + encodeURIComponent(filePath) + '&raw=1';
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.15s';

    var popup = document.createElement('div');
    popup.style.cssText = 'background:var(--window-bg,#1e1e2e);border-radius:12px;padding:16px;max-width:90vw;max-height:90vh;display:flex;flex-direction:column;align-items:center;box-shadow:0 8px 40px rgba(0,0,0,0.4);animation:scaleIn 0.15s';

    var img = document.createElement('img');
    img.src = imgUrl;
    img.style.cssText = 'max-width:70vw;max-height:60vh;border-radius:8px;object-fit:contain;margin-bottom:12px';
    img.alt = fileName || '预览';

    var errMsg = document.createElement('div');
    errMsg.style.cssText = 'display:none;padding:20px;color:var(--accent2,#f87171);text-align:center';
    errMsg.textContent = '⚠ 图片加载失败';
    img.onerror = function() {
      img.style.display = 'none';
      errMsg.style.display = 'block';
    };

    var infoRow = document.createElement('div');
    infoRow.style.cssText = 'display:flex;align-items:center;gap:12px;font-size:13px;color:var(--text2,#a0a0b0)';
    infoRow.textContent = fileName || '';

    var btnWallpaper = document.createElement('button');
    btnWallpaper.textContent = '🖼 设为壁纸';
    btnWallpaper.style.cssText = 'padding:6px 16px;border-radius:6px;border:none;background:var(--accent,#6366f1);color:white;cursor:pointer;font-size:13px;font-weight:500';
    btnWallpaper.onclick = function() {
      if (window.ACMSWallpaper) {
        ACMSWallpaper.set(imgUrl, 'cover').catch(function(err) {
          console.warn('[FileBrowser] 壁纸设置失败:', err.message);
          fbToast('壁纸设置失败', 'error');
        });
      }
    };

    var btnClose = document.createElement('button');
    btnClose.textContent = '✕';
    btnClose.style.cssText = 'padding:4px 10px;border-radius:4px;border:1px solid var(--border,#333);background:transparent;color:var(--text,#ccc);cursor:pointer;font-size:13px;margin-left:auto';
    btnClose.onclick = function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };

    var topBar = document.createElement('div');
    topBar.style.cssText = 'display:flex;align-items:center;width:100%;margin-bottom:8px';
    topBar.appendChild(infoRow);
    topBar.appendChild(btnClose);

    popup.appendChild(topBar);
    popup.appendChild(img);
    popup.appendChild(errMsg);
    popup.appendChild(btnWallpaper);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    });
  }

  // ── 上下文菜单 ──
  function showContextMenu(e, filePath, fileName, isDir, icon) {
    // 移除已有菜单
    var existing = document.querySelector('.fb-context-menu');
    if (existing) existing.parentNode.removeChild(existing);
    contextEntry = { path: filePath, name: fileName, isDir: isDir, icon: icon };

    var menu = document.createElement('div');
    menu.className = 'fb-context-menu';
    menu.style.cssText = 'position:fixed;z-index:100000;min-width:160px;padding:6px 0;background:var(--window-bg,#1e1e32);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.4);font-size:13px;color:var(--text);left:' + e.clientX + 'px;top:' + e.clientY + 'px;backdrop-filter:blur(12px)';

    var items = [];
    // 重命名
    items.push({ label: '✏️ 重命名', action: function() {
      window.FB_rename(contextEntry.path, contextEntry.name, contextEntry.isDir);
    }});
    // 删除
    items.push({ label: '🗑️ 删除', action: function() {
      window.FB_delete(contextEntry.path, contextEntry.name, contextEntry.isDir);
    }});
    // 分隔线
    items.push({ sep: true });
    if (!isDir && isImage(fileName)) {
      items.push({ label: '🖼 设为壁纸', action: function() {
        window.FB_setWallpaper(contextEntry.path);
      }});
    }
    // 复制路径
    items.push({ label: '📋 复制路径', action: function() {
      navigator.clipboard.writeText(contextEntry.path).then(function() {
        fbToast('路径已复制', 'success');
      }).catch(function() {
        fbToast('复制失败', 'error');
      });
    }});

    items.forEach(function(item) {
      if (item.sep) {
        var sep = document.createElement('div');
        sep.style.cssText = 'height:1px;margin:4px 10px;background:var(--border)';
        menu.appendChild(sep);
        return;
      }
      var el = document.createElement('div');
      el.style.cssText = 'display:flex;align-items:center;padding:8px 14px;cursor:pointer;transition:background 0.1s;gap:8px';
      el.textContent = item.label;
      el.addEventListener('mouseenter', function() { el.style.background = 'color-mix(in srgb, var(--accent) 14%, transparent)'; });
      el.addEventListener('mouseleave', function() { el.style.background = 'transparent'; });
      el.addEventListener('click', function() {
        removeMenu();
        item.action();
      });
      menu.appendChild(el);
    });

    document.body.appendChild(menu);

    // 点击其他地方关闭
    function removeMenu() {
      if (menu.parentNode) menu.parentNode.removeChild(menu);
      document.removeEventListener('click', removeMenu);
      document.removeEventListener('contextmenu', removeMenu);
    }
    setTimeout(function() {
      document.addEventListener('click', removeMenu);
      document.addEventListener('contextmenu', removeMenu);
    }, 0);
  }

  // ── 新建文件夹对话框 ──
  function promptNewFolder() {
    var name = prompt('请输入新文件夹名称:', '新建文件夹');
    if (!name || !name.trim()) return;
    name = name.trim();
    // 检查非法字符
    if (/[/\\:*?"<>|]/.test(name)) {
      fbToast('文件夹名称包含非法字符', 'error');
      return;
    }
    api('POST', '/files/mkdir', { path: currentPath, name: name })
      .then(function() {
        fbToast('文件夹 "' + name + '" 创建成功', 'success');
        // 清除该目录的树缓存，以便重新加载
        delete treeCache[currentPath];
        refreshView();
      })
      .catch(function(err) {
        fbToast('创建失败: ' + (err.message || ''), 'error');
      });
  }

  // ── 上传文件对话框 ──
  function promptUploadFile() {
    var input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = function() {
      if (input.files && input.files.length > 0) {
        handleFileUpload(input.files, currentPath);
      }
    };
    input.click();
  }

  // ── 重命名 ──
  function renameEntry(filePath, oldName, isDir) {
    var newName = prompt('重命名 "' + oldName + '" 为:', oldName);
    if (!newName || !newName.trim()) return;
    newName = newName.trim();
    if (newName === oldName) return;
    if (/[/\\:*?"<>|]/.test(newName)) {
      fbToast('名称包含非法字符', 'error');
      return;
    }
    api('POST', '/files/rename', { path: filePath, newName: newName })
      .then(function() {
        fbToast('已重命名为 "' + newName + '"', 'success');
        delete treeCache[currentPath];
        delete treeCache[parentPathOf(filePath)];
        refreshView();
      })
      .catch(function(err) {
        fbToast('重命名失败: ' + (err.message || ''), 'error');
      });
  }

  // ── 删除确认 ──
  function deleteEntry(filePath, fileName, isDir) {
    if (isDir) {
      if (!confirm('确定要删除目录 "' + fileName + '" 及其所有内容吗？\n（非空目录可能无法删除）')) return;
    } else {
      if (!confirm('确定要删除文件 "' + fileName + '" 吗？')) return;
    }
    api('POST', '/files/delete', { path: filePath })
      .then(function() {
        fbToast('已删除 "' + fileName + '"', 'success');
        delete treeCache[currentPath];
        var parentPath = parentPathOf(filePath);
        delete treeCache[parentPath];
        refreshView();
      })
      .catch(function(err) {
        fbToast('删除失败: ' + (err.message || ''), 'error');
      });
  }

  // ── 设为壁纸 ──
  function setWallpaper(filePath) {
    var imgUrl = '/api/files?path=' + encodeURIComponent(filePath) + '&raw=1';
    if (window.ACMSWallpaper) {
      ACMSWallpaper.set(imgUrl, 'cover').catch(function(err) {
        console.warn('[FileBrowser] 壁纸设置失败:', err.message);
        fbToast('壁纸设置失败', 'error');
      });
    }
  }

  // ── 导航 ──
  function navigate(path) {
    if (!browsingWindow || browsingWindow.dead) return;
    if (path === currentPath) return;
    // 保存当前路径到历史
    historyStack.push(currentPath);
    forwardStack = [];
    currentPath = path;
    currentSearch = '';
    // 展开目录树中的当前目录
    expandTreeToPath(path);
    renderAll(browsingWindow);
  }

  function goBack() {
    if (historyStack.length === 0) return;
    forwardStack.push(currentPath);
    currentPath = historyStack.pop();
    currentSearch = '';
    expandTreeToPath(currentPath);
    renderAll(browsingWindow);
  }

  function goForward() {
    if (forwardStack.length === 0) return;
    historyStack.push(currentPath);
    currentPath = forwardStack.pop();
    currentSearch = '';
    expandTreeToPath(currentPath);
    renderAll(browsingWindow);
  }

  function goUp() {
    if (currentPath === '/') return;
    var parent = parentPathOf(currentPath);
    navigate(parent);
  }

  function refresh() {
    // 清除当前路径的缓存
    delete treeCache[currentPath];
    renderAll(browsingWindow);
  }

  // ── 展开目录树到指定路径 ──
  function expandTreeToPath(path) {
    if (!path || path === '/') return loadTreeChildren('/');
    expandedDirs['/'] = true;
    var parts = path.replace(/^\/+/, '').replace(/\/+$/, '').split('/');
    var accumulated = '';
    parts.forEach(function(part) {
      if (!part) return;
      accumulated = accumulated ? accumulated + '/' + part : '/' + part;
      expandedDirs[accumulated] = true;
    });
    // 确保加载所有展开节点的子目录
    return loadTreeChain(path);
  }

  function loadTreeChain(path) {
    if (!path || path === '/') {
      if (!treeCache['/']) {
        return loadTreeChildren('/');
      }
      return Promise.resolve();
    }
    var parts = path.replace(/^\/+/, '').replace(/\/+$/, '').split('/');
    var accumulated = '';
    var chain = ['/'];
    parts.forEach(function(part) {
      if (!part) return;
      accumulated = accumulated ? accumulated + '/' + part : '/' + part;
      chain.push(accumulated);
    });
    // 从根到目标依次加载缓存
    function loadNext(idx) {
      if (idx >= chain.length) return Promise.resolve();
      var p = chain[idx];
      if (!treeCache[p]) {
        return loadTreeChildren(p).then(function() {
          return loadNext(idx + 1);
        });
      }
      return loadNext(idx + 1);
    }
    return loadNext(0);
  }

  // ── 切换目录树展开/折叠 ──
  function toggleTree(path) {
    expandedDirs[path] = !expandedDirs[path];
    if (expandedDirs[path] && !treeCache[path]) {
      loadTreeChildren(path).then(function() {
        renderAll(browsingWindow);
      });
    }
    renderAll(browsingWindow);
  }

  // ── 搜索 ──
  function onSearch(value) {
    currentSearch = value.trim();
    loadFileList(browsingWindow, currentPath, currentSearch);
  }

  // ════════════════════════════════════════
  // 全局函数（供 onclick 调用）
  // ════════════════════════════════════════

  window.FB_navigate = function(path) { navigate(path); };
  window.FB_goBack = function() { goBack(); };
  window.FB_goForward = function() { goForward(); };
  window.FB_goUp = function() { goUp(); };
  window.FB_refresh = function() { refresh(); };
  window.FB_newFolder = function() { promptNewFolder(); };
  window.FB_uploadFile = function() { promptUploadFile(); };
  window.FB_previewImage = function(filePath, fileName) { previewImage(filePath, fileName); };
  window.FB_toggleTree = function(path) { toggleTree(path); };
  window.FB_onSearch = function(value) { onSearch(value); };
  window.FB_rename = function(filePath, fileName, isDir) { renameEntry(filePath, fileName, isDir); };
  window.FB_delete = function(filePath, fileName, isDir) { deleteEntry(filePath, fileName, isDir); };
  window.FB_setWallpaper = function(filePath) { setWallpaper(filePath); };
  window.FB_contextMenu = function(e, filePath, fileName, isDir, icon) {
    showContextMenu(e, filePath, fileName, isDir, icon);
  };
  window.FB_loadDir = function(path) {
    if (browsingWindow && !browsingWindow.dead) {
      navigate(path);
    }
  };

  // ════════════════════════════════════════
  // 注册 viewLoader
  // ════════════════════════════════════════
  if (window.ACMSWin) {
    // v0.58 包注册
    if (window.ACMS && ACMS.registerPackage) {
      ACMS.registerPackage('file-manager', {
        title: '文件浏览器', icon: '📂', category: '工具',
        defaultSize: { w: 820, h: 560 },
        loader: function(w) {
          browsingWindow = w;
          historyStack = [];
          forwardStack = [];
          currentSearch = '';
          expandedDirs = {};
          treeCache = {};
          contextEntry = null;

          currentPath = getInitialPath();
          expandTreeToPath(currentPath).then(function() {
            renderAll(w);
          }).catch(function() {
            renderAll(w);
          });
        }
      });
    } else {
      // 降级：直接注册（ACMS.registerPackage 不可用时）
      ACMSWin.registerViewLoader('file-manager', function(w) {
          browsingWindow = w;
          historyStack = [];
          forwardStack = [];
          currentSearch = '';
          expandedDirs = {};
          treeCache = {};
          contextEntry = null;

          currentPath = getInitialPath();
          expandTreeToPath(currentPath).then(function() {
            renderAll(w);
          }).catch(function() {
            renderAll(w);
          });
      });
    }
  }

})();
