// Express 应用组装 — 中间件 + 路由挂载
const express = require('express');
const path = require('path');
const config = require('./config');
const { authMiddleware, agentMiddleware } = require('./middleware/auth');

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

// 404
app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

// 统一错误处理
app.use(require('./middleware/error-handler'));

module.exports = app;
