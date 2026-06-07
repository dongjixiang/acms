// 认证中间件
const config = require('../config');

function authMiddleware(req, res, next) {
  if (req.path === '/health' || req.path.startsWith('/client/') || req.path.startsWith('/api/generate/assets/')) return next();
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
