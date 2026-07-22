// Express 应用组装 — 中间件 + 路由挂载
const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { authMiddleware, agentMiddleware } = require('./middleware/auth');

// v0.4 Phase 0.4：启动时 elicitor SKILL 健康检查（不健康只 warn 不 throw）
const elicitorAdapter = require('./services/elicitor-adapter');
elicitorAdapter.startupHealthCheck();

const app = express();

// 基础中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS + UTF-8
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', config.cors.origin);
  res.header('Access-Control-Allow-Headers', config.cors.headers);
  res.header('Access-Control-Allow-Methods', config.cors.methods);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// i18n（公开，无需认证）
app.get('/api/i18n/:lang', (req, res) => {
  const lang = req.params.lang === 'en' ? 'en' : 'zh';
  try {
    res.json(require(`../client/js/i18n/${lang}.json`));
  } catch (e) { res.json(require('../client/js/i18n/zh.json')); }
});

// ── 预览路由（令牌认证，无需 API Key，在 auth 之前）──
const workspaceRouter = require('./routes/workspace');
const previewTokens = workspaceRouter._previewTokens;
const workspaceSvc = require('./services/workspace-service');

// 重写 HTML 里的根相对 URL：只重写工作区里实际存在的文件，避免误伤 API 端点
//   href="/...", src="/...", srcset="/...", action="/...", data="/..." 形式
//   排除 // 开头（协议相对 URL，如 //cdn.example.com/...）
function rewriteRootRelative(content, wsPath, htmlDir, previewBase) {
  return content.replace(
    /((?:href|src|srcset|action|data|poster|cite|formaction)\s*=\s*["'])\/([^/"'][^"']*)(["'])/g,
    (match, prefix, relUrl, suffix) => {
      const target = path.join(wsPath, htmlDir && htmlDir !== '.' ? htmlDir : '', relUrl);
      return fs.existsSync(target) ? prefix + previewBase + relUrl + suffix : match;
    }
  );
}

app.use('/preview/:token', (req, res, next) => {
  const token = req.params.token;
  if (!token) return res.status(400).send('Missing preview token');

  const entry = previewTokens.get(token);
  if (!entry || Date.now() > entry.expires) {
    return res.status(401).send('Preview token expired or invalid. Please go back to ACMS and re-open the preview.');
  }

  req._previewSlug = entry.slug;
  next();
});

// 预览静态文件服务
const mimeMap = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.webp': 'image/webp',
};

app.use('/preview/:token', (req, res, next) => {
  const slug = req._previewSlug;
  const token = req.params.token;
  const wsPath = path.join(__dirname, '..', 'workspaces', slug);

  // 解析请求路径 → 工作区文件
  let reqPath;
  try { reqPath = decodeURIComponent(req.path); } catch (e) { return res.status(400).send('Bad path'); }
  let fullPath = path.resolve(wsPath, '.' + reqPath);

  // v0.X: 优先从 dist/ 取（Vite/Webpack 构建产物）
  //   当 dist/index.html 存在时，/index.html 和 /assets/* 都从 dist/ 解析
  const distIndex = path.join(wsPath, 'dist', 'index.html');
  if (fs.existsSync(distIndex)) {
    // 根请求 → dist/index.html
    if (reqPath === '/' || reqPath === '/index.html') {
      fullPath = distIndex;
    } else {
      // 其他请求 → 先看 dist/ 下有无同路径文件
      const distPath = path.join(wsPath, 'dist', '.' + reqPath);
      try {
        if (fs.statSync(distPath).isFile()) fullPath = distPath;
      } catch (e) { /* 不在 dist/ 里，走正常路径 */ }
    }
  }
  if (fullPath !== wsPath && !fullPath.startsWith(wsPath + path.sep)) {
    return res.status(403).send('Forbidden');
  }
  let stat;
  try { stat = fs.statSync(fullPath); } catch (e) {
    // 文件不存在：SPA fallback — 向父目录找 index.html（点 router-link 后刷新页面不会 404）
    let dir = path.dirname(fullPath);
    let fallback = null;
    while (dir.startsWith(wsPath) && dir.length >= wsPath.length) {
      const idx = path.join(dir, 'index.html');
      try { fs.statSync(idx); fallback = idx; break; } catch (e2) { /* keep walking up */ }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    if (fallback) {
      const fbRel = path.relative(wsPath, fallback).split(path.sep).join('/');
      const fbDir = path.posix.dirname(fbRel);
      const fbPreviewBase = '/preview/' + token + '/' + (fbDir && fbDir !== '.' ? fbDir + '/' : '');
      let content = fs.readFileSync(fallback, 'utf-8');
      content = rewriteRootRelative(content, wsPath, fbDir, fbPreviewBase);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(content);
    }
    return res.status(404).send('File not found in workspace. Make sure the deliverable has been generated.');
  }
  // 目录 → 找 index.html
  if (stat.isDirectory()) {
    const idx = path.join(fullPath, 'index.html');
    try { stat = fs.statSync(idx); fullPath = idx; } catch (e) {
      return res.status(404).send('No index.html in directory');
    }
  }

  // 如果请求的 URL 真的带 index.html（不是目录请求），302 跳到目录 URL：
  //   这样 Vue Router 的 createWebHistory(base) 能看到路径 /（不是 /index.html），
  //   路由的 { path: "/", redirect: "/timeline" } 才能生效
  if (path.basename(fullPath) === 'index.html' && /\/index\.html(\?.*)?$/.test(req.originalUrl)) {
    const dirUrl = req.originalUrl.replace(/\/index\.html(\?.*)?$/, '/$1');
    return res.redirect(302, dirUrl);
  }

  const ext = path.extname(fullPath).toLowerCase();
  const contentType = mimeMap[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);

  // 找出 HTML 所在目录：JS 在 assets/ 子目录里时，HTML 在父目录；否则 HTML 跟 JS 同目录
  function htmlDirFor(jsRel) {
    const jsDir = path.posix.dirname(jsRel);
    if (path.basename(jsDir) === 'assets') return path.posix.dirname(jsDir);
    return jsDir;
  }

  // HTML：把根相对 URL 重写成预览路径，让 Vite 等构建产物的 /assets/*、/favicon.svg 等能解析
  //   根相对 URL 不受 <base href> 影响（HTML 规范），必须显式重写
  //   只重写真正存在的文件，避免误伤 API 端点
  if (ext === '.html') {
    const relPath = path.relative(wsPath, fullPath).split(path.sep).join('/');
    const htmlDir = path.posix.dirname(relPath);
    const previewBase = '/preview/' + token + '/' + (htmlDir && htmlDir !== '.' ? htmlDir + '/' : '');
    let content = fs.readFileSync(fullPath, 'utf-8');
    content = rewriteRootRelative(content, wsPath, htmlDir, previewBase);
    return res.send(content);
  }

  // JS：修复 Vue Router base + Vite 预加载 helper
  //   - history:P("/") → history:P("<previewBase>")    让 router 跳转保留在预览路径下
  //   - return"/"+e    → return"<previewBase>"+e      让 Vite modulepreload 用预览路径
  if (ext === '.js') {
    const relPath = path.relative(wsPath, fullPath).split(path.sep).join('/');
    const htmlDir = htmlDirFor(relPath);
    const previewBase = '/preview/' + token + '/' + (htmlDir && htmlDir !== '.' ? htmlDir + '/' : '');
    let content = fs.readFileSync(fullPath, 'utf-8');
    let changed = false;
    const newContent = content
      .replace(/history:([A-Za-z_$]{1,3})\("\/"\)/g, (m, fn) => { changed = true; return `history:${fn}("${previewBase}")`; })
      .replace(/return"\/"\+([A-Za-z_$]{1,3})(?=[,}\s])/g, (m, fn) => { changed = true; return `return"${previewBase}"+${fn}`; });
    if (!changed) return fs.createReadStream(fullPath).pipe(res);
    res.setHeader('Content-Type', contentType);
    return res.send(newContent);
  }
  // 非 HTML：直接流式传输
  fs.createReadStream(fullPath).pipe(res);
});

// 认证（auth 路由在公开路径中，无需 API Key）
app.use('/api/auth', require('./routes/auth'));

// 认证中间件
app.use(authMiddleware);
app.use(agentMiddleware);

// 静态文件
app.use('/client', express.static(path.join(__dirname, '..', 'client'), {
  setHeaders: (res, filePath) => {
    const mimeMap = {
      '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
      '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    };
    const mime = mimeMap[require('path').extname(filePath).toLowerCase()];
    if (mime) res.setHeader('Content-Type', mime);
  }
}));

// 健康检查
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// 根路径
app.get('/', (req, res) => res.redirect('/client/index.html'));

// API 路由
app.use('/api/projects', require('./routes/projects'));
app.use('/api/requirements', require('./routes/requirements'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/wiki', require('./routes/wiki'));
app.use('/api/changes', require('./routes/changes'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/dashboard', require('./routes/dashboard'));  // v0.46 PM Dashboard 4 张卡
app.use('/api/models', require('./routes/models'));
app.use('/api/ai', require('./routes/ai-clarify'));
app.use('/api/ai-tools', require('./routes/ai-tools'));
app.use('/api/exports', require('./routes/exports'));
app.use('/api/workspace', workspaceRouter);
app.use('/api/skills', require('./routes/skills'));
app.use('/api/bugs', require('./routes/bugs'));
app.use('/api/postmortem', require('./routes/postmortem'));
app.use('/api/files', require('./routes/files'));

// Webhook 服务初始化
const eventBus = require('./services/event-bus');
const WebhookService = require('./services/webhook-service');
const webhookService = new WebhookService(eventBus);
webhookService.start();
app.set('webhookService', webhookService);
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/clarify-improve', require('./routes/clarify-improve'));
app.use('/api/improvements', require('./routes/improvements'));
app.use('/api/knowledge', require('./routes/knowledge'));
app.use('/api/generate', require('./routes/gen'));
app.use('/api/chat', require('./routes/chat-upload'));  // v0.9 聊天附件上传
app.use('/api/chat', require('./routes/chat-fetch'));   // v0.14 聊天 URL 抓取
app.use('/api/chat', require('./routes/chat-url-promote'));  // v0.14 抓取结果入知识库
app.use('/api/chat', require('./routes/chat-intent'));  // v0.15 聊天智能响应（自动搜索）
app.use('/api/chat-sessions', require('./routes/chat-sessions'));  // v0.55 自由对话多窗口 + 历史持久化 + 回收站

// L3: Apps API
app.use('/api/apps', require('./routes/apps'));
// v0.59 Agent Buddy 聊天接口
app.use('/api/agent-buddy', require('./routes/agent-buddy'));
// v0.61 辅助工具自由对话接口（轻量版 chat-intent，无 requirement 依赖）
app.use('/api/assist-free', require('./routes/assist-free'));
// v0.59 appRuntime — 把外部网页装进「本地应用壳」（chrome CDP screencast 流推送 + input 桥接）
app.use('/api/app-runtime', require('./routes/app-runtime'));

// 404 — v0.18 加 unmatched 路径 log
app.use((req, res, next) => {
  console.warn(`[404] ${req.method} ${req.originalUrl} (no route matched — 检查 server 是否重启 / 路由是否注册)`);
  res.status(404).json({ error: 'NOT_FOUND', method: req.method, path: req.originalUrl });
});

// 统一错误处理
app.use(require('./middleware/error-handler'));

module.exports = app;
