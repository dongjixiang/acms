// Express 应用组装 — 中间件 + 路由挂载
const express = require('express');
const path = require('path');
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
  const wsPath = path.join(__dirname, '..', 'workspaces', slug);

  express.static(wsPath, {
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (mimeMap[ext]) res.setHeader('Content-Type', mimeMap[ext]);
    },
    index: 'index.html',
  })(req, res, () => {
    res.status(404).send('File not found in workspace. Make sure the deliverable has been generated.');
  });
});

// 认证
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
app.use('/api/models', require('./routes/models'));
app.use('/api/ai', require('./routes/ai-clarify'));
app.use('/api/ai-tools', require('./routes/ai-tools'));
app.use('/api/exports', require('./routes/exports'));
app.use('/api/workspace', workspaceRouter);
app.use('/api/skills', require('./routes/skills'));
app.use('/api/bugs', require('./routes/bugs'));
app.use('/api/postmortem', require('./routes/postmortem'));

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

// 404
app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

// 统一错误处理
app.use(require('./middleware/error-handler'));

module.exports = app;
