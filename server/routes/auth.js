// 认证路由 — 注册 / 登录 / 游客 / 用户管理
const express = require('express');
const router = express.Router();
const userService = require('../services/user-service');
const WORKSPACE_ROLES = new Set(['pm', 'tech', 'design']);

function getBearerUser(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return userService.getUserFromToken(authHeader.slice(7));
}

// 注册
router.post('/register', (req, res) => {
  const { username, password, displayName, workspaceRole = 'pm' } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'MISSING_FIELDS', message: '用户名和密码不能为空' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'WEAK_PASSWORD', message: '密码至少 4 位' });
  }
  if (!WORKSPACE_ROLES.has(workspaceRole)) {
    return res.status(400).json({ error: 'INVALID_WORKSPACE_ROLE', message: '用户类型不正确' });
  }
  const result = userService.register(username.trim(), password, displayName || username.trim(), workspaceRole);
  if (result.error) {
    return res.status(409).json({ error: result.error, message: result.message });
  }
  res.json({ user: result.user, token: result.token });
});

// 修改密码（必须携带当前登录用户的 JWT，并验证原密码）
router.post('/change-password', (req, res) => {
  const user = getBearerUser(req);
  if (!user) {
    return res.status(401).json({ error: 'TOKEN_INVALID', message: '登录已过期，请重新登录' });
  }
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'MISSING_FIELDS', message: '原密码和新密码不能为空' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'WEAK_PASSWORD', message: '密码至少 4 位' });
  }
  const result = userService.changePassword(user.id, currentPassword, newPassword);
  if (result.error) {
    const status = result.error === 'CURRENT_PASSWORD_INVALID' ? 403 : 400;
    return res.status(status).json({ error: result.error, message: result.message });
  }
  res.json({ message: '密码修改成功' });
});

// 忘记密码（未配置 SMTP/邮箱验证时的本地找回流程）
router.post('/forgot-password', (req, res) => {
  const { username, newPassword } = req.body || {};
  if (!username || !newPassword) {
    return res.status(400).json({ error: 'MISSING_FIELDS', message: '用户名和新密码不能为空' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'WEAK_PASSWORD', message: '密码至少 4 位' });
  }
  const result = userService.resetPassword(username, newPassword);
  if (result.error) {
    const status = result.error === 'USER_NOT_FOUND' ? 404 : 400;
    return res.status(status).json({ error: result.error, message: result.message });
  }
  res.json({ message: '密码已重置，请使用新密码登录' });
});

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'MISSING_FIELDS', message: '用户名和密码不能为空' });
  }
  const result = userService.login(username.trim(), password);
  if (result.error) {
    return res.status(401).json({ error: result.error, message: result.message });
  }
  res.json({ user: result.user, token: result.token });
});

// 游客登录
router.post('/guest', (req, res) => {
  const { clientId } = req.body || {};
  const result = userService.guestLogin(clientId);
  res.json({ user: result.user, token: result.token });
});

// 获取当前用户信息（手动解析 token，因为 /api/auth 挂在 authMiddleware 之前）
router.get('/me', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'AUTH_REQUIRED', message: '未登录' });
  }
  const user = userService.getUserFromToken(authHeader.slice(7));
  if (!user) {
    return res.status(401).json({ error: 'TOKEN_INVALID', message: '登录已过期，请重新登录' });
  }
  res.json({ user });
});

// 列出所有用户（仅管理员）
router.get('/users', (req, res) => {
  const authHeader = req.headers['authorization'];
  const user = authHeader ? userService.getUserFromToken(authHeader.slice(7)) : null;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'FORBIDDEN', message: '仅管理员可查看用户列表' });
  }
  res.json({ users: userService.listUsers() });
});

module.exports = router;
