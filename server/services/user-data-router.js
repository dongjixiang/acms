// User Data Router — 用户维度文件路径统一解析（v0.119+）
//
// 配合 acms/users/{username}/ 根目录使用。
// f 阶段（2026-09-19）：只建根 + router，不迁任何旧数据。
//
// 用法：
//   const router = require('./user-data-router');
//   const path = router.getUserPath(currentUser, 'assets/ip-library');
//   // → /c/.../acms/users/多多/assets/ip-library/
//
// 设计要点：
//   - username 创建后不可改（user-service.js:168），目录名稳定
//   - 不存在的目录自动 mkdirSync（lazy 创建）
//   - 游客不落盘（返回 null），不污染 users/ 命名空间
//   - category 白名单校验：避免任意路径写入
//   - 'default' 兜底未登录场景（不进 users/ 也可用 router.resolveUserPath 显式指定）

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'users');

const VALID_CATEGORIES = new Set([
  'assets/ip-library',
  'assets/geo',
  'assets/browser',
  'assets/social',
  'chat',
  'logs',
  'config',
]);

/**
 * 兜底 userId 解析
 * @param {object|string|null} userOrId  - user 对象 / username 字符串 / null
 * @returns {string|null} 落盘用的 userId；null 表示不落盘（游客）
 */
function resolveUserId(userOrId) {
  if (!userOrId) return 'default';
  if (typeof userOrId === 'string') {
    // 字符串直接当 username 用（ACMS 已保证 username 不可改 = 稳定）
    return userOrId || 'default';
  }
  if (userOrId.isGuest || userOrId.role === 'guest') return null;
  if (userOrId.username) return userOrId.username;
  if (userOrId.id === 'system' || userOrId.role === 'system') return 'system';
  return userOrId.id || 'default';
}

/**
 * 获取用户维度路径，自动 mkdir（lazy）
 * @param {object|string} userOrId  user 对象 / username
 * @param {string} category         见 VALID_CATEGORIES
 * @returns {string|null} 绝对路径；游客返回 null
 */
function getUserPath(userOrId, category) {
  const userId = resolveUserId(userOrId);
  if (!userId) return null;

  if (!VALID_CATEGORIES.has(category)) {
    throw new Error(
      `[user-data-router] unknown category: "${category}". ` +
      `Valid: ${[...VALID_CATEGORIES].join(', ')}`
    );
  }

  const fullPath = path.join(ROOT, userId, category);
  try {
    fs.mkdirSync(fullPath, { recursive: true });
  } catch (e) {
    // 已有 / 权限错误透传给调用方
    throw new Error(`[user-data-router] mkdir failed for ${fullPath}: ${e.message}`);
  }
  return fullPath;
}

/**
 * 只解析路径，不创建目录（用于读路径判断存在性 / 列举文件）
 */
function peekUserPath(userOrId, category) {
  const userId = resolveUserId(userOrId);
  if (!userId) return null;
  if (!VALID_CATEGORIES.has(category)) return null;
  return path.join(ROOT, userId, category);
}

/**
 * 判断用户目录是否存在（不创建）
 */
function userDirExists(userOrId) {
  const userId = resolveUserId(userOrId);
  if (!userId) return false;
  return fs.existsSync(path.join(ROOT, userId));
}

/**
 * 列举所有已建用户目录（物理扫描，不查 users collection）
 */
function listUserDirs() {
  if (!fs.existsSync(ROOT)) return [];
  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

module.exports = {
  ROOT,
  VALID_CATEGORIES: [...VALID_CATEGORIES],
  resolveUserId,
  getUserPath,
  peekUserPath,
  userDirExists,
  listUserDirs,
};
