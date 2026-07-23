// 认证中间件 — 支持 API Key（向后兼容）+ JWT Token（用户登录）
const config = require('../config');
const userService = require('../services/user-service');

function authMiddleware(req, res, next) {
  // 公开路径跳过认证
  if (req.path === '/health'
      || req.path.startsWith('/client/')
      || req.path.startsWith('/api/generate/assets/')
      || req.path.startsWith('/api/auth/')    // 登录/注册接口公开
      || /\/api\/chat\/upload\/[^/]+\/raw$/.test(req.path)) return next();

  // 1. 尝试 JWT token（Authorization: Bearer <token>）
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const user = userService.getUserFromToken(token);
    if (user) {
      req.user = user;
      req.userId = user.id;
      return next();
    }
    // JWT 无效但不立即拒绝 — 降级到 API Key 检查
  }

  // 2. 尝试 API Key（向后兼容：agent、curl、旧客户端）
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (apiKey) {
    if (config.apiKeys.includes(apiKey)) {
      // API Key 用户标记为 system 身份
      req.user = { id: 'system', username: 'system', displayName: '系统', role: 'admin' };
      req.userId = 'system';
      return next();
    }
    return res.status(403).json({ error: 'AUTH_DENIED', message: '无效的 API Key' });
  }

  // 3. 无任何认证信息
  return res.status(401).json({ error: 'AUTH_REQUIRED', message: '请提供登录信息或 API Key' });
}

function agentMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'] || '';
  if (apiKey.startsWith('agent-')) req.agentId = apiKey;
  next();
}

module.exports = { authMiddleware, agentMiddleware };
