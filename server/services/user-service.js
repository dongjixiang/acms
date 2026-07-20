// 用户服务 — 注册、登录、游客、JWT 令牌
const crypto = require('crypto');
const { collection } = require('../db/connection');

// JWT 签名密钥（生产环境应从环境变量读取）
const JWT_SECRET = process.env.JWT_SECRET || 'acms-jwt-secret-change-in-production';
const WORKSPACE_ROLES = new Set(['pm', 'tech', 'design']);

function normalizeWorkspaceRole(role) {
  return WORKSPACE_ROLES.has(role) ? role : 'pm';
}

// 简单 JWT 实现（不引入 jsonwebtoken 依赖）
function createToken(payload, expiresIn = '7d') {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const exp = expiresIn === '7d' ? now + 7 * 86400 : now + 86400;
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const signature = crypto.createHmac('sha256', JWT_SECRET)
      .update(`${parts[0]}.${parts[1]}`)
      .digest('base64url');
    if (signature !== parts[2]) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function generateId() { return crypto.randomUUID().slice(0, 8); }

// 注册
function register(username, password, displayName, workspaceRole = 'pm') {
  const users = collection('users');
  const existing = users.findOne(u => u.username === username);
  if (existing) return { error: 'USERNAME_TAKEN', message: '用户名已存在' };

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');

  const user = {
    id: 'u_' + generateId(),
    username,
    displayName: displayName || username,
    passwordHash: hash,
    salt,
    role: 'user',       // auth role: user | admin
    workspaceRole: normalizeWorkspaceRole(workspaceRole),  // UI/workspace role: pm | tech | design
    createdAt: new Date().toISOString(),
    lastLogin: null,
  };
  users.insert(user);
  return { user: sanitize(user), token: createToken({ userId: user.id, username: user.username, role: user.role }) };
}

// 登录
function login(username, password) {
  const users = collection('users');
  const user = users.findOne(u => u.username === username);
  if (!user) return { error: 'AUTH_FAILED', message: '用户名或密码错误' };

  const hash = crypto.pbkdf2Sync(password, user.salt, 1000, 64, 'sha512').toString('hex');
  if (hash !== user.passwordHash) return { error: 'AUTH_FAILED', message: '用户名或密码错误' };

  // 更新最后登录
  user.lastLogin = new Date().toISOString();
  users.update(u => u.id === user.id, { lastLogin: user.lastLogin });

  return { user: sanitize(user), token: createToken({ userId: user.id, username: user.username, role: user.role }) };
}

// 游客登录
function guestLogin(clientId) {
  const guestId = 'guest_' + (clientId || generateId());
  const guestUser = {
    id: guestId,
    username: 'guest_' + guestId.slice(-6),
    displayName: '游客',
    role: 'guest',
    workspaceRole: 'pm',
    isGuest: true,
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
  };
  // 游客数据不持久化到 users 表（只在内存/token 里）
  return {
    user: sanitize(guestUser),
    token: createToken({ userId: guestUser.id, username: guestUser.username, role: 'guest' }, '1d'),
  };
}

// 修改密码：必须先验证当前登录用户的原密码。
function changePassword(userId, currentPassword, newPassword) {
  const users = collection('users');
  const user = users.findOne(u => u.id === userId);
  if (!user) return { error: 'USER_NOT_FOUND', message: '用户不存在' };
  if (user.role === 'guest' || user.isGuest) {
    return { error: 'GUEST_NOT_RESETTABLE', message: '游客账号没有密码，无需修改' };
  }

  const currentHash = crypto.pbkdf2Sync(currentPassword, user.salt, 1000, 64, 'sha512').toString('hex');
  if (currentHash !== user.passwordHash) {
    return { error: 'CURRENT_PASSWORD_INVALID', message: '原密码不正确' };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(newPassword, salt, 1000, 64, 'sha512').toString('hex');
  users.update(u => u.id === user.id, { passwordHash: hash, salt });
  return { user: sanitize({ ...user, passwordHash: hash, salt }) };
}

// 忘记密码：当前 ACMS 未配置邮件验证，采用用户名 + 新密码的本地找回流程。
function resetPassword(username, newPassword) {
  const normalizedUsername = String(username || '').trim();
  const users = collection('users');
  const user = users.findOne(u => u.username === normalizedUsername);
  if (!user) return { error: 'USER_NOT_FOUND', message: '用户名不存在' };
  if (user.role === 'guest' || user.isGuest) {
    return { error: 'GUEST_NOT_RESETTABLE', message: '游客账号无需找回密码' };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(newPassword, salt, 1000, 64, 'sha512').toString('hex');
  users.update(u => u.id === user.id, { passwordHash: hash, salt });
  return { user: sanitize({ ...user, passwordHash: hash, salt }) };
}

// 通过 token 获取用户
function getUserFromToken(token) {
  const payload = verifyToken(token);
  if (!payload) return null;
  if (payload.role === 'guest') {
    // 游客从 token payload 恢复
    return { id: payload.userId, username: payload.username, displayName: '游客', role: 'guest', workspaceRole: 'pm', isGuest: true };
  }
  const users = collection('users');
  return users.findOne(u => u.id === payload.userId) || null;
}

// 通过 ID 获取用户
function getUserById(userId) {
  if (userId && userId.startsWith('guest_')) {
    return { id: userId, displayName: '游客', role: 'guest', workspaceRole: 'pm', isGuest: true };
  }
  const users = collection('users');
  const user = users.findOne(u => u.id === userId);
  return user ? sanitize(user) : null;
}

// 列出所有用户
function listUsers() {
  const users = collection('users');
  return users.all().map(sanitize);
}

// 创建默认 admin 账户（首次启动时调用）
function ensureDefaultAdmin() {
  const users = collection('users');
  const admin = users.findOne(u => u.username === 'admin');
  if (!admin) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync('admin123', salt, 1000, 64, 'sha512').toString('hex');
    const user = {
      id: 'u_admin',
      username: 'admin',
      displayName: '管理员',
      passwordHash: hash,
      salt,
      role: 'admin',
      createdAt: new Date().toISOString(),
      lastLogin: null,
    };
    users.insert(user);
    console.log('[user] ✅ 默认管理员已创建 (admin / admin123)');
  }
}

// 脱敏（去掉密码相关字段）
function sanitize(user) {
  if (!user) return null;
  const { passwordHash, salt, ...safe } = user;
  return safe;
}

module.exports = { register, login, guestLogin, changePassword, resetPassword, getUserFromToken, getUserById, listUsers, verifyToken, ensureDefaultAdmin };
