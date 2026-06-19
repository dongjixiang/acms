// 认证中间件
const config = require('../config');

function authMiddleware(req, res, next) {
  // v0.12 修复：跳过 /api/chat/upload/:id/raw，让浏览器 <a target="_blank"> 导航请求能拿到文件
  //   浏览器点链接是导航请求，不带 X-API-Key header，会被 401 挡住
  //   安全靠 UUID 不可枚举性（v4 有 122 位熵）扛着 — 生产环境应改为短时 token
  if (req.path === '/health'
      || req.path.startsWith('/client/')
      || req.path.startsWith('/api/generate/assets/')
      || /\/api\/chat\/upload\/[^/]+\/raw$/.test(req.path)) return next();
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (!apiKey) return res.status(401).json({ error: 'AUTH_REQUIRED', message: '请提供 API Key' });
  if (!config.apiKeys.includes(apiKey)) return res.status(403).json({ error: 'AUTH_DENIED', message: '无效的 API Key' });
  next();
}

function agentMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'] || '';
  if (apiKey.startsWith('agent-')) req.agentId = apiKey;
  next();
}

module.exports = { authMiddleware, agentMiddleware };
