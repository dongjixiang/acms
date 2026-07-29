var express = require('express');
var router = express.Router();
var path = require('path');
var fs = require('fs');

var WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', 'workspaces');

// Windows 上把 /d → D:\ 等盘符路径转换成真实路径
// path.resolve('/d') 在 Windows 上会解析成 C:\d，必须手动处理
function resolveDrivePath(reqPath) {
  if (process.platform === 'win32' && reqPath) {
    var m = reqPath.match(/^\/([a-zA-Z])(?:\/|$)/);
    if (m) {
      return m[1].toUpperCase() + ':\\' + reqPath.slice(2).replace(/\//g, '\\');
    }
  }
  return null;
}

/**
 * GET /api/files?path=...
 */
router.get('/', function(req, res) {
  var reqPath = req.query.path || '';
  var isAdmin = req.user && req.user.role === 'admin';
  
  // raw=1: 直接返回文件内容（供 img 标签预览）
  if (req.query.raw === '1') {
    var r;
    if (isAdmin) {
      var dp = resolveDrivePath(reqPath);
      r = dp || path.resolve(reqPath || '/');
    } else {
      var resolved = path.resolve(WORKSPACE_ROOT, reqPath || '');
      if (!resolved.startsWith(WORKSPACE_ROOT)) return res.status(403).json({ error: 'FORBIDDEN' });
      r = resolved;
    }
    if (!fs.existsSync(r)) return res.status(404).json({ error: 'NOT_FOUND' });
    var st = fs.statSync(r);
    if (st.isDirectory()) return res.status(400).json({ error: 'IS_DIR' });
    res.sendFile(r);
    return;
  }
  
  var safePath;
  if (isAdmin) {
    var dp = resolveDrivePath(reqPath);
    console.log('[Files DEBUG] path=/d test:', JSON.stringify({reqPath: reqPath, dp: dp, resolved: dp || path.resolve(reqPath || '/')}));
    safePath = dp || path.resolve(reqPath || '/');
  } else {
    var resolved = path.resolve(WORKSPACE_ROOT, reqPath || '');
    if (!resolved.startsWith(WORKSPACE_ROOT)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: '\u6743\u9650\u4e0d\u8db3' });
    }
    safePath = resolved;
  }
  
  if (!fs.existsSync(safePath)) {
    return res.status(404).json({ error: 'NOT_FOUND', message: '\u8def\u5f84\u4e0d\u5b58\u5728' });
  }
  
  var stat = fs.statSync(safePath);
  if (!stat.isDirectory()) {
    return res.status(400).json({ error: 'NOT_DIR', message: '\u4e0d\u662f\u76ee\u5f55' });
  }
  
  try {
    var entries = fs.readdirSync(safePath, { withFileTypes: true });
    var result = entries
      .filter(function(entry) { return !entry.name.startsWith('.'); })
      .map(function(entry) {
        var fullPath = path.join(safePath, entry.name);
        var st;
        try { st = fs.statSync(fullPath); } catch(e) { return null; }
        if (!st) return null;
        return {
          name: entry.name,
          type: entry.isDirectory() ? 'dir' : 'file',
          size: st.size,
          mtime: st.mtime.toISOString(),
          icon: entry.isDirectory() ? '\ud83d\udcc1' : getFileIcon(entry.name),
        };
      })
      .filter(function(e) { return e !== null; })
      .sort(function(a, b) {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    
    res.json({
      currentPath: safePath,
      parentPath: isAdmin ? path.dirname(safePath) : (safePath !== WORKSPACE_ROOT ? path.dirname(safePath) : null),
      entries: result,
      isAdmin: isAdmin,
    });
  } catch (e) {
    console.error('[Files] read error:', e);
    res.status(500).json({ error: 'READ_ERROR', message: e.message });
  }
});

router.get('/info', function(req, res) {
  var reqPath = req.query.path;
  if (!reqPath) return res.status(400).json({ error: 'MISSING_PATH' });
  var isAdmin = req.user && req.user.role === 'admin';
  var safePath;
  if (isAdmin) {
    var dp = resolveDrivePath(reqPath);
    safePath = dp || path.resolve(reqPath);
  } else {
    var resolved = path.resolve(WORKSPACE_ROOT, reqPath);
    if (!resolved.startsWith(WORKSPACE_ROOT)) return res.status(403).json({ error: 'FORBIDDEN' });
    safePath = resolved;
  }
  if (!fs.existsSync(safePath)) return res.status(404).json({ error: 'NOT_FOUND' });
  var st = fs.statSync(safePath);
  res.json({ name: path.basename(safePath), type: st.isDirectory() ? 'dir' : 'file', size: st.size, mtime: st.mtime.toISOString(), isImage: /\\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(safePath) });
});

function getFileIcon(name) {
  var ext = path.extname(name).toLowerCase();
  var icons = {
    '.js':'\ud83d\udcdc', '.ts':'\ud83d\udcd8', '.py':'\ud83d\udc0d', '.html':'\ud83c\udf10', '.css':'\ud83c\udfa8',
    '.json':'\ud83d\udccb', '.md':'\ud83d\udcdd', '.txt':'\ud83d\udcc4', '.yml':'\u2699\ufe0f', '.yaml':'\u2699\ufe0f',
    '.png':'\ud83d\uddbc', '.jpg':'\ud83d\uddbc', '.jpeg':'\ud83d\uddbc', '.gif':'\ud83d\uddbc', '.svg':'\ud83d\uddbc', '.webp':'\ud83d\uddbc',
    '.zip':'\ud83d\udce6', '.tar':'\ud83d\udce6', '.gz':'\ud83d\udce6',
    '.mp3':'\ud83c\udfb5', '.wav':'\ud83c\udfb5', '.mp4':'\ud83c\udfac', '.mov':'\ud83c\udfac',
    '.pdf':'\ud83d\udcd5', '.doc':'\ud83d\udcd8', '.docx':'\ud83d\udcd8',
    '.sh':'\u26a1', '.bat':'\u26a1', '.exe':'\u2699\ufe0f',
  };
  return icons[ext] || '\ud83d\udcc4';
}

// ===== Helper functions =====

function resolveSafePath(req, reqPath) {
  var isAdmin = req.user && req.user.role === 'admin';
  if (isAdmin) {
    var dp = resolveDrivePath(reqPath);
    return { safePath: dp || path.resolve(reqPath || '/'), isAdmin: true };
  }
  var resolved = path.resolve(WORKSPACE_ROOT, reqPath || '');
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    return null;
  }
  return { safePath: resolved, isAdmin: false };
}

function buildEntry(fullPath, entryName) {
  var st;
  try { st = fs.statSync(fullPath); } catch(e) { return null; }
  if (!st) return null;
  return {
    name: entryName,
    type: st.isDirectory() ? 'dir' : 'file',
    size: st.size,
    mtime: st.mtime.toISOString(),
    icon: st.isDirectory() ? '\ud83d\udcc1' : getFileIcon(entryName),
  };
}

function searchDir(dirPath, query, results, maxResults) {
  if (results.length >= maxResults) return;
  var entries;
  try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch(e) { return; }
  entries.forEach(function(entry) {
    if (results.length >= maxResults) return;
    if (entry.name.startsWith('.')) return;
    var fullPath = path.join(dirPath, entry.name);
    if (entry.name.toLowerCase().indexOf(query.toLowerCase()) !== -1) {
      var info = buildEntry(fullPath, entry.name);
      if (info) {
        info.path = fullPath;
        results.push(info);
      }
    }
    if (entry.isDirectory()) {
      searchDir(fullPath, query, results, maxResults);
    }
  });
}

// ===== DELETE /api/files/delete =====
router.post('/delete', function(req, res) {
  var reqPath = req.body && req.body.path;
  if (!reqPath) return res.status(400).json({ error: 'MISSING_PATH', message: '\u7f3a\u5c11\u8def\u5f84\u53c2\u6570' });

  var resolved = resolveSafePath(req, reqPath);
  if (!resolved) return res.status(403).json({ error: 'FORBIDDEN', message: '\u6743\u9650\u4e0d\u8db3' });

  if (!fs.existsSync(resolved.safePath)) {
    return res.status(404).json({ error: 'NOT_FOUND', message: '\u8def\u5f84\u4e0d\u5b58\u5728' });
  }

  // Non-admin: only allow deleting files within WORKSPACE_ROOT
  if (!resolved.isAdmin) {
    if (!resolved.safePath.startsWith(WORKSPACE_ROOT + path.sep)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: '\u6743\u9650\u4e0d\u8db3' });
    }
  }

  try {
    var stat = fs.statSync(resolved.safePath);
    if (stat.isDirectory()) {
      var children = fs.readdirSync(resolved.safePath);
      if (children.length > 0) {
        return res.status(400).json({ error: 'DIR_NOT_EMPTY', message: '\u76ee\u5f55\u975e\u7a7a\uff0c\u4e0d\u5141\u8bb8\u5220\u9664' });
      }
      fs.rmdirSync(resolved.safePath);
    } else {
      fs.unlinkSync(resolved.safePath);
    }
    res.json({ success: true, path: reqPath });
  } catch (e) {
    console.error('[Files] delete error:', e);
    res.status(500).json({ error: 'DELETE_ERROR', message: e.message });
  }
});

// ===== RENAME /api/files/rename =====
router.post('/rename', function(req, res) {
  var reqPath = req.body && req.body.path;
  var newName = req.body && req.body.newName;
  if (!reqPath || !newName) return res.status(400).json({ error: 'MISSING_PARAMS', message: '\u7f3a\u5c11\u53c2\u6570' });

  var resolved = resolveSafePath(req, reqPath);
  if (!resolved) return res.status(403).json({ error: 'FORBIDDEN', message: '\u6743\u9650\u4e0d\u8db3' });

  if (!fs.existsSync(resolved.safePath)) {
    return res.status(404).json({ error: 'NOT_FOUND', message: '\u8def\u5f84\u4e0d\u5b58\u5728' });
  }

  var parentDir = path.dirname(resolved.safePath);
  var newPath = path.join(parentDir, newName);

  if (fs.existsSync(newPath)) {
    return res.status(400).json({ error: 'ALREADY_EXISTS', message: '\u76ee\u6807\u540d\u79f0\u5df2\u5b58\u5728' });
  }

  try {
    fs.renameSync(resolved.safePath, newPath);
    var info = buildEntry(newPath, newName);
    res.json(info);
  } catch (e) {
    console.error('[Files] rename error:', e);
    res.status(500).json({ error: 'RENAME_ERROR', message: e.message });
  }
});

// ===== MKDIR /api/files/mkdir =====
router.post('/mkdir', function(req, res) {
  var reqPath = req.body && req.body.path;
  var name = req.body && req.body.name;
  if (!reqPath || !name) return res.status(400).json({ error: 'MISSING_PARAMS', message: '\u7f3a\u5c11\u53c2\u6570' });

  var resolved = resolveSafePath(req, reqPath);
  if (!resolved) return res.status(403).json({ error: 'FORBIDDEN', message: '\u6743\u9650\u4e0d\u8db3' });

  var dirPath = path.join(resolved.safePath, name);

  if (fs.existsSync(dirPath)) {
    return res.status(400).json({ error: 'ALREADY_EXISTS', message: '\u76ee\u5f55\u5df2\u5b58\u5728' });
  }

  try {
    fs.mkdirSync(dirPath, { recursive: false });
    var info = buildEntry(dirPath, name);
    res.status(201).json(info);
  } catch (e) {
    console.error('[Files] mkdir error:', e);
    res.status(500).json({ error: 'MKDIR_ERROR', message: e.message });
  }
});

// ===== UPLOAD /api/files/upload =====
router.post('/upload', function(req, res) {
  var reqPath = req.body && req.body.path;
  var fileName = req.body && req.body.fileName;
  var content = req.body && req.body.content;
  if (!reqPath || !fileName || !content) return res.status(400).json({ error: 'MISSING_PARAMS', message: '\u7f3a\u5c11\u53c2\u6570' });

  var resolved = resolveSafePath(req, reqPath);
  if (!resolved) return res.status(403).json({ error: 'FORBIDDEN', message: '\u6743\u9650\u4e0d\u8db3' });

  var filePath = path.join(resolved.safePath, fileName);

  if (fs.existsSync(filePath)) {
    return res.status(400).json({ error: 'ALREADY_EXISTS', message: '\u6587\u4ef6\u5df2\u5b58\u5728' });
  }

  try {
    var buffer = Buffer.from(content, 'base64');
    fs.writeFileSync(filePath, buffer);
    var info = buildEntry(filePath, fileName);
    res.status(201).json(info);
  } catch (e) {
    console.error('[Files] upload error:', e);
    res.status(500).json({ error: 'UPLOAD_ERROR', message: e.message });
  }
});

// ===== SEARCH /api/files/search =====
router.get('/search', function(req, res) {
  var query = req.query.q;
  var searchPath = req.query.path || '';
  if (!query) return res.status(400).json({ error: 'MISSING_QUERY', message: '\u7f3a\u5c11\u641c\u7d22\u5173\u952e\u8bcd' });

  var resolved = resolveSafePath(req, searchPath);
  if (!resolved) return res.status(403).json({ error: 'FORBIDDEN', message: '\u6743\u9650\u4e0d\u8db3' });

  if (!fs.existsSync(resolved.safePath)) {
    return res.status(404).json({ error: 'NOT_FOUND', message: '\u8def\u5f84\u4e0d\u5b58\u5728' });
  }

  var stat = fs.statSync(resolved.safePath);
  if (!stat.isDirectory()) {
    return res.status(400).json({ error: 'NOT_DIR', message: '\u4e0d\u662f\u76ee\u5f55' });
  }

  try {
    var results = [];
    searchDir(resolved.safePath, query, results, 100);
    res.json({ query: query, results: results });
  } catch (e) {
    console.error('[Files] search error:', e);
    res.status(500).json({ error: 'SEARCH_ERROR', message: e.message });
  }
});

// ===== OPEN /api/files/open =====
// 用系统默认应用或指定应用打开文件
router.post('/open', function(req, res) {
  var reqPath = req.body && req.body.path;
  var appName = req.body && req.body.app; // 可选，指定应用名称
  if (!reqPath) return res.status(400).json({ error: 'MISSING_PATH' });

  var resolved = resolveSafePath(req, reqPath);
  if (!resolved) return res.status(403).json({ error: 'FORBIDDEN' });
  if (!fs.existsSync(resolved.safePath)) return res.status(404).json({ error: 'NOT_FOUND' });

  var exec = require('child_process').exec;
  var cmd;
  if (process.platform === 'win32') {
    cmd = appName ? 'start "" "' + appName + '" "' + resolved.safePath + '"' : 'start "" "' + resolved.safePath + '"';
  } else if (process.platform === 'darwin') {
    cmd = appName ? 'open -a "' + appName + '" "' + resolved.safePath + '"' : 'open "' + resolved.safePath + '"';
  } else {
    cmd = appName ? appName + ' "' + resolved.safePath + '"' : 'xdg-open "' + resolved.safePath + '"';
  }
  exec(cmd, function(err) {
    if (err) return res.status(500).json({ error: 'OPEN_FAILED', message: err.message });
    res.json({ success: true });
  });
});

// ===== ASSET /api/files/asset =====
// v0.73: 通过 workspace 相对路径访问资源文件（解决 CDN 图片 CORS 问题）
//   path 参数格式: "{projectSlug}/assets/{dateStr}/{fileName}.png"
//   返回文件本身 + CORS 头，供 image-editor/tui-image-editor 的 crossOrigin 加载
router.get('/asset', function(req, res) {
  var reqPath = req.query.path || '';
  if (!reqPath) return res.status(400).json({ error: 'MISSING_PATH' });
  // 限制在 workspace 目录下
  var resolved = path.resolve(WORKSPACE_ROOT, reqPath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) return res.status(403).json({ error: 'FORBIDDEN' });
  if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'NOT_FOUND' });
  var st = fs.statSync(resolved);
  if (st.isDirectory()) return res.status(400).json({ error: 'IS_DIR' });
  // CORS 头 — tui-image-editor 的 crossOrigin 加载需要
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');
  res.set('Access-Control-Allow-Headers', '*');
  // 根据扩展名推断 Content-Type（sendFile 可能不自动推）
  var ext = path.extname(resolved).toLowerCase();
  var mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp' };
  if (mimeMap[ext]) res.set('Content-Type', mimeMap[ext]);
  res.sendFile(resolved);
});

// ===== PROXY-IMAGE /api/files/proxy-image =====
// v0.75: 代理加载外部 CDN 图片（tui-image-editor canvas 需要 CORS）
//   url 参数: 外部图片 URL
//   返回图片内容 + CORS 头，供 image-editor 加载跨域图片
router.get('/proxy-image', async function(req, res) {
  var imageUrl = req.query.url || '';
  if (!imageUrl) return res.status(400).json({ error: 'MISSING_URL' });
  // 只允许图片 URL 扩展名
  var lower = imageUrl.toLowerCase();
  if (!/\.(png|jpg|jpeg|gif|webp|bmp|svg)(\?|$)/.test(lower)) return res.status(403).json({ error: 'NOT_IMAGE' });
  try {
    var resp = await fetch(imageUrl, { timeout: 15000 });
    if (!resp.ok) return res.status(502).json({ error: 'FETCH_FAILED', status: resp.status });
    var ab = await resp.arrayBuffer();
    var buf = Buffer.from(ab);
    var ct = resp.headers.get('content-type') || 'image/png';
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Allow-Headers', '*');
    res.set('Content-Type', ct);
    res.send(buf);
  } catch (e) {
    res.status(502).json({ error: 'FETCH_FAILED', message: e.message });
  }
});

// ===== DRIVES /api/files/drives =====
// 列出系统中的可用盘符（Windows）或根目录
router.get('/drives', function(req, res) {
  var isAdmin = req.user && req.user.role === 'admin';
  if (!isAdmin) return res.status(403).json({ error: 'FORBIDDEN' });

  var drives = [];
  if (process.platform === 'win32') {
    // Windows: 检测 A: 到 Z:
    for (var ch = 67; ch <= 90; ch++) { // C: 到 Z: (跳过 A: B:)
      var letter = String.fromCharCode(ch);
      try {
        var root = letter + ':\\';
        if (fs.existsSync(root)) {
          var st = fs.statSync(root);
          drives.push({ name: letter + ':', path: '/' + letter.toLowerCase(), label: letter + ': 盘', mtime: st.mtime.toISOString() });
        }
      } catch(e) {}
    }
  } else {
    drives.push({ name: '/', path: '/', label: '根目录 /' });
  }
  res.json({ drives: drives });
});

module.exports = router;
