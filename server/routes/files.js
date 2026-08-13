var express = require('express');
var router = express.Router();
var path = require('path');
var fs = require('fs');

var WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', 'workspaces');
// 前端约定的 workspace 入口（iP() 返回的非 admin 起始路径）
var WORKSPACE_CLIENT_ROOT = '/workspaces';

// Windows 上把 /d → D:\ 等盘符路径转换成真实路径
// path.resolve('/d') 在 Windows 上会解析成 C:\d，必须手动处理
// 注意：返回的形式必须是 D:\xxx（D: + 一个 \ + 子路径），不能 D:\\xxx，也不能 D:
//   /c       → C:\
//   /c/Users → C:\Users
//   /c/foo/bar → C:\foo\bar
function resolveDrivePath(reqPath) {
  if (process.platform === 'win32' && reqPath) {
    var m = reqPath.match(/^\/([a-zA-Z])(?:\/|$)/);
    if (m) {
      var rest = reqPath.slice(2).replace(/\//g, '\\');
      if (rest === '') rest = '\\';
      else if (rest[0] !== '\\') rest = '\\' + rest;
      return m[1].toUpperCase() + ':' + rest;
    }
  }
  return null;
}

// 把绝对文件系统路径转成前端约定的 MSYS 风格路径
//   WORKSPACE_ROOT 及其子 → /workspaces[/子路径] （仅非 admin）
//   D:\xxx                  → /d/xxx  （admin 和非 admin 通用）
//   其他/失败               → 原值（让调用方判断）
// 关键设计：admin 视角下不把 C:\...\workspaces\foo 重写成 /workspaces/foo
//   原 admin 凭盘符进入 workspace 子树时，前端 curPath 是 /c/...\workspaces\foo，
//   路径处理（bc/jn）按 MSYS 盘符风格工作，保持一致。
function toClientPath(p, isAdmin) {
  if (!p) return p;
  if (process.platform !== 'win32') return p;
  // 关键：先判 workspace（因为 workspace 物理上也是 D:\xxx 形式，会被盘符正则匹配到）
  //   non-admin：workspace 子树 → /workspaces[/子路径]
  //   admin   ：跳过 workspace 分支（落到下面盘符分支，保留 /c/... 盘符风格）
  if (!isAdmin) {
    if (p === WORKSPACE_ROOT) return WORKSPACE_CLIENT_ROOT;
    var wsPrefix = WORKSPACE_ROOT + path.sep;
    if (p.startsWith(wsPrefix)) {
      var rel = p.slice(wsPrefix.length).replace(/\\/g, '/');
      return WORKSPACE_CLIENT_ROOT + '/' + rel;
    }
  }
  // 盘符根 (D:\) 或盘符子路径 (D:\xxx) → /d 或 /d/xxx
  var m = p.match(/^([A-Z]):\\(.*)/);
  if (m) return '/' + m[1].toLowerCase() + (m[2] ? '/' + m[2].replace(/\\/g, '/') : '');
  return p;
}

// 统一的安全路径解析：返回 { safePath, isAdmin }
//   - admin: /d/foo → D:\foo；/workspaces[/foo] 也支持（防御性，admin 通过 FB_nv('/workspaces') 走 fallback 不会踩盘符根路径坑）
//   - 非 admin: 只接受以 /workspaces/ 开头的 MSYS 路径；其他 → null（403）
// 关键修复：原本 path.resolve(WORKSPACE_ROOT, '/workspaces/foo') 在 Windows 上会被
//   path.win32.resolve 解读为「盘符根相对路径」覆盖 WORKSPACE_ROOT，导致解析到错的目录。
//   修复方式：先剥前导 / 再用 path.join 拼接到 WORKSPACE_ROOT。admin 兜底同样补掉盘符坑。
function resolveSafePath(req, reqPath) {
  var isAdmin = req.user && req.user.role === 'admin';
  if (isAdmin) {
    var dp = resolveDrivePath(reqPath);
    if (dp) return { safePath: dp, isAdmin: true };
    // admin 防御性也支持 /workspaces 入口（避免 fallback 走 path.resolve 踩盘符坑）
    var rawAdm = (reqPath == null) ? '' : String(reqPath);
    if (rawAdm === '' || rawAdm === '/') {
      // admin 访问系统根 —— 走 path.resolve，但前面已经确认 dp 为 null，说明 reqPath 不是盘符形式
      return { safePath: path.resolve(reqPath || '/'), isAdmin: true };
    }
    if (rawAdm === WORKSPACE_CLIENT_ROOT || rawAdm === WORKSPACE_CLIENT_ROOT + '/') {
      return { safePath: WORKSPACE_ROOT, isAdmin: true };
    }
    if (rawAdm.startsWith(WORKSPACE_CLIENT_ROOT + '/')) {
      var relAdm = rawAdm.slice(WORKSPACE_CLIENT_ROOT.length + 1).replace(/\//g, path.sep);
      var wsAdm = path.join(WORKSPACE_ROOT, relAdm);
      if (!wsAdm.startsWith(WORKSPACE_ROOT)) return null;
      return { safePath: wsAdm, isAdmin: true };
    }
    // 其他非盘符路径 —— fallback：path.resolve（admin 选定的合法路径，已超出常规命名空间）
    return { safePath: path.resolve(reqPath || '/'), isAdmin: true };
  }
  // 非 admin：要求以前端的 /workspaces 入口开头（兼容空 = 入口本身）
  var raw = (reqPath == null) ? '' : String(reqPath);
  var rel;
  if (raw === '' || raw === '/') {
    rel = '';
  } else if (raw === WORKSPACE_CLIENT_ROOT || raw === WORKSPACE_CLIENT_ROOT + '/') {
    rel = '';
  } else if (raw.startsWith(WORKSPACE_CLIENT_ROOT + '/')) {
    // /workspaces/foo/bar → foo\bar
    rel = raw.slice(WORKSPACE_CLIENT_ROOT.length + 1).replace(/\//g, path.sep);
  } else {
    // 不在 workspace 命名空间，拒绝
    return null;
  }
  var safePath = rel ? path.join(WORKSPACE_ROOT, rel) : WORKSPACE_ROOT;
  if (!safePath.startsWith(WORKSPACE_ROOT)) return null;
  return { safePath: safePath, isAdmin: false };
}

/**
 * GET /api/files?path=...
 */
router.get('/', function(req, res) {
  var reqPath = req.query.path || '';

  // raw=1: 直接返回文件内容（供 img 标签预览）
  if (req.query.raw === '1') {
    var resolvedRaw = resolveSafePath(req, reqPath);
    if (!resolvedRaw) return res.status(403).json({ error: 'FORBIDDEN', message: '\u6743\u9650\u4e0d\u8db3' });
    var r = resolvedRaw.safePath;
    if (!fs.existsSync(r)) return res.status(404).json({ error: 'NOT_FOUND' });
    var stRaw = fs.statSync(r);
    if (stRaw.isDirectory()) return res.status(400).json({ error: 'IS_DIR' });
    res.sendFile(r);
    return;
  }

  var resolved = resolveSafePath(req, reqPath);
  if (!resolved) {
    return res.status(403).json({ error: 'FORBIDDEN', message: '\u6743\u9650\u4e0d\u8db3' });
  }
  var safePath = resolved.safePath;
  var isAdmin = resolved.isAdmin;

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

    // 计算上级路径：走到 WORKSPACE_ROOT 时不返回上级（前端不显示「.. 上级」项）
    // 返回前端约定用 MSYS 风格（/workspaces/foo 或 /c/Users/...）
    // admin 视角下保持盘符风格不重写 workspace 子树
    var parentFs = (safePath === WORKSPACE_ROOT) ? null : path.dirname(safePath);
    res.json({
      currentPath: toClientPath(safePath, isAdmin),
      parentPath: parentFs ? toClientPath(parentFs, isAdmin) : null,
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
  var resolved = resolveSafePath(req, reqPath);
  if (!resolved) return res.status(403).json({ error: 'FORBIDDEN' });
  var safePath = resolved.safePath;
  if (!fs.existsSync(safePath)) return res.status(404).json({ error: 'NOT_FOUND' });
  var st = fs.statSync(safePath);
  res.json({ name: path.basename(safePath), type: st.isDirectory() ? 'dir' : 'file', size: st.size, mtime: st.mtime.toISOString(), isImage: /\\\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(safePath) });
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
// v0.75: 代理加载外部 CDN 图片（tui-image-editor canvas 需要 CORS 头）
//   url 参数: 外部图片 URL
//   v0.77: 改用响应 content-type 校验（取代 URL 扩展名白名单，兼容 ?参数式 CDN 图）
//   防御：仅 http(s) + 拒内网/loopback + 50MB 大小上限
router.get('/proxy-image', async function(req, res) {
  var imageUrl = req.query.url || '';
  if (!imageUrl) return res.status(400).json({ error: 'MISSING_URL' });
  // 协议 + URL 合法性
  var parsed;
  try { parsed = new URL(imageUrl); } catch (e) {
    return res.status(400).json({ error: 'INVALID_URL' });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'INVALID_PROTOCOL' });
  }
  // SSRF 防御：拒绝本机/内网/loopback
  var host = parsed.hostname;
  var isPrivate = host === 'localhost'
    || /^127\./.test(host)
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)
    || host === '::1'
    || /^fc[0-9a-f]{2}:/i.test(host)
    || /^fd[0-9a-f]{2}:/i.test(host);
  if (isPrivate) return res.status(403).json({ error: 'BLOCKED_HOST' });
  // AbortController 控制超时（15s）
  var ac = new AbortController();
  var tid = setTimeout(function() { ac.abort(); }, 15000);
  try {
    var resp = await fetch(imageUrl, { signal: ac.signal, redirect: 'follow' });
    if (!resp.ok) return res.status(502).json({ error: 'FETCH_FAILED', status: resp.status });
    // content-type 校验：必须是 image/*
    var ct = (resp.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
    if (!ct.startsWith('image/')) {
      return res.status(403).json({ error: 'NOT_IMAGE', contentType: ct });
    }
    // 流式读取 + 50MB 大小上限
    var maxBytes = 50 * 1024 * 1024;
    var reader = resp.body.getReader();
    var received = 0;
    var chunks = [];
    while (true) {
      var r = await reader.read();
      if (r.done) break;
      received += r.value.length;
      if (received > maxBytes) {
        try { reader.cancel(); } catch (e) {}
        return res.status(413).json({ error: 'TOO_LARGE' });
      }
      chunks.push(r.value);
    }
    clearTimeout(tid);
    var buf = Buffer.concat(chunks.map(function(c) { return Buffer.from(c); }));
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Allow-Headers', '*');
    res.set('Content-Type', ct);
    res.set('Content-Length', buf.length);
    res.send(buf);
  } catch (e) {
    clearTimeout(tid);
    var msg = (e && e.name === 'AbortError') ? 'TIMEOUT' : (e && e.message) || 'UNKNOWN';
    res.status(502).json({ error: 'FETCH_FAILED', message: msg });
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
