// ACMS social-publisher — account-store.js
// =========================================
// 内容平台账号管理：多账号 + Cookie/CookieCloud + 健康检查
//
// 设计：复用 email-account-store.js 的 collection 模式 + email-credential-cipher 加密
//
// 存储：
//   collection: social_accounts
//   doc 形状：
//     {
//       id: 'sa_xxx',                        // 账号 ID
//       platform: 'toutiao',                 // 平台枚举
//       display_name: '多多·头条号',          // 用户起的别名
//       avatar: '#4f8cff',                   // UI 头像色
//       status: 'active' | 'disabled' | 'banned',
//       risk_level: 0-100,                   // 0=健康 100=被风控
//       last_used_at: <iso>,
//       last_error: null | 'error message',
//       daily_publish_count: 0,              // 今日已发数
//       daily_reset_at: <iso>,               // 每日重置时间
//       credentials: {                       // 凭据（密文）
//         type: 'cookie' | 'cookiecloud' | 'qrcode',
//         ciphertext: '...',                 // AES-256-GCM 密文
//         meta: { url: 'mp.toutiao.com', ... },
//       },
//       // 各平台风控阈值（参考 humanized-social-publisher ⭐42）
//       limits: {
//         max_per_day: 10,                   // 单账号日上限
//         min_interval_minutes: 30,          // 两次发布最小间隔
//         require_approval: true,            // 是否必须审批
//       },
//       sort_order: 0,
//       created_at: <iso>,
//     }
//
// 安全原则（P164 教训）：
//   - 测试用 mock 账号（sa_test_xxx），绝不碰真实账号
//   - 凭据走 AES-256-GCM 加密（复用 email-credential-cipher）
//   - daily_publish_count 自动重置（防刷）
//   - risk_level > 80 自动 status='banned' 拒绝发布

'use strict';

const { collection } = require('../../db/connection');
const cipher = require('../email-credential-cipher');

const COLL = 'social_accounts';

function makeId() {
  return 'sa_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function coll() { return collection(COLL); }

// ── 平台默认风控阈值 ──
// 参考 humanized-social-publisher ⭐42 + 实测经验
// v0.118.1: 加 login_url —— agent-browser auth save 需要的登录页 URL（不同于创作中心 url）
const PLATFORM_LIMITS = {
  toutiao:     { max_per_day: 10, min_interval_minutes: 30,  require_approval: true,  url: 'https://mp.toutiao.com',           login_url: 'https://mp.toutiao.com/auth/page/login' },
  xiaohongshu: { max_per_day: 5,  min_interval_minutes: 60,  require_approval: true,  url: 'https://creator.xiaohongshu.com',  login_url: 'https://creator.xiaohongshu.com/login' },
  wechat_oa:   { max_per_day: 8,  min_interval_minutes: 30,  require_approval: true,  url: 'https://mp.weixin.qq.com',         login_url: 'https://mp.weixin.qq.com' },  // 公众号走 API 不是浏览器登录
  zhihu:       { max_per_day: 15, min_interval_minutes: 15,  require_approval: true,  url: 'https://zhuanlan.zhihu.com',      login_url: 'https://www.zhihu.com/signin' },
  douyin:      { max_per_day: 5,  min_interval_minutes: 120, require_approval: true,  url: 'https://creator.douyin.com',      login_url: 'https://creator.douyin.com/' },
};

// ── 创建账号 ──
function create({ platform, display_name, credentials, avatar, limits }) {
  if (!PLATFORM_LIMITS[platform]) {
    return { ok: false, error: `unsupported_platform: ${platform}` };
  }
  if (!credentials || !credentials.type) {
    return { ok: false, error: 'missing_credentials' };
  }

  const id = makeId();
  const now = new Date().toISOString();
  const platformLimits = PLATFORM_LIMITS[platform];

  // 加密凭据
  let ciphertext;
  try {
    const plaintext = JSON.stringify({ ...credentials, meta: credentials.meta || {} });
    ciphertext = cipher.encrypt(plaintext);
  } catch (e) {
    return { ok: false, error: `encrypt_failed: ${e.message}` };
  }

  const doc = {
    id,
    platform,
    display_name: display_name || `${platform}_${id.slice(-6)}`,
    avatar: avatar || '#4f8cff',
    status: 'active',
    risk_level: 0,
    last_used_at: null,
    last_error: null,
    daily_publish_count: 0,
    daily_reset_at: now,
    credentials: { type: credentials.type, ciphertext, meta: credentials.meta || {} },
    limits: { ...platformLimits, ...(limits || {}) },
    sort_order: 0,
    created_at: now,
  };

  try {
    coll().insert(doc);
    // 返回时去掉 ciphertext（不暴露给上层）
    const { ciphertext: _, ...safe } = doc.credentials;
    return { ok: true, account: { ...doc, credentials: { ...safe, has_ciphertext: true } } };
  } catch (e) {
    return { ok: false, error: `db_insert_failed: ${e.message}` };
  }
}

// ── 列出账号 ──
function list({ platform, status } = {}) {
  try {
    let docs = coll().find ? coll().find(() => true) : [];
    if (platform) docs = docs.filter(d => d.platform === platform);
    if (status) docs = docs.filter(d => d.status === status);
    // 排序：sort_order asc, created_at desc
    docs.sort((a, b) => (a.sort_order - b.sort_order) || (b.created_at || '').localeCompare(a.created_at || ''));
    // 脱敏：去掉 ciphertext
    return docs.map(d => {
      const { ciphertext, ...safeCipher } = d.credentials || {};
      return { ...d, credentials: { ...safeCipher, has_ciphertext: !!ciphertext } };
    });
  } catch (e) {
    return [];
  }
}

// ── 获取单个账号（返回脱敏版）──
function get(account_id) {
  if (!account_id) return null;
  try {
    const doc = coll().findOne(c => c.id === account_id);
    if (!doc) return null;
    const { ciphertext, ...safeCipher } = doc.credentials || {};
    return { ...doc, credentials: { ...safeCipher, has_ciphertext: !!ciphertext } };
  } catch (e) {
    return null;
  }
}

// ── 获取凭据（解密，仅内部用）──
function getCredentials(account_id) {
  if (!account_id) return null;
  try {
    const doc = coll().findOne(c => c.id === account_id);
    if (!doc || !doc.credentials || !doc.credentials.ciphertext) return null;
    const plaintext = cipher.decrypt(doc.credentials.ciphertext);
    return JSON.parse(plaintext);
  } catch (e) {
    return null;
  }
}

// ── 更新账号 ──
function update(account_id, updates) {
  if (!account_id) return { ok: false, error: 'missing_account_id' };
  try {
    const c = coll();
    c.update(doc => doc.id === account_id, updates);
    return { ok: true, account_id };
  } catch (e) {
    return { ok: false, error: `db_update_failed: ${e.message}` };
  }
}

// ── 删除账号 ──
function remove(account_id) {
  if (!account_id) return { ok: false, error: 'missing_account_id' };
  try {
    coll().remove(doc => doc.id === account_id);
    return { ok: true, account_id };
  } catch (e) {
    return { ok: false, error: `db_remove_failed: ${e.message}` };
  }
}

// ── 健康检查（PR 2 头条用，PR 5 扩展风控规则）──
function checkHealth({ account_id, platform }) {
  const account = get(account_id);
  if (!account) {
    return { ok: false, status: 'not_found', error: `account_not_found: ${account_id}` };
  }
  if (platform && account.platform !== platform) {
    return { ok: false, status: 'platform_mismatch', error: `account is ${account.platform}, not ${platform}` };
  }
  if (account.status === 'banned') {
    return { ok: false, status: 'banned', account, error: '账号已被封禁' };
  }
  if (account.status === 'disabled') {
    return { ok: false, status: 'disabled', account, error: '账号已禁用' };
  }
  if (account.risk_level >= 80) {
    return { ok: false, status: 'risk_control', account, error: `账号风控等级过高: ${account.risk_level}` };
  }

  // 每日限额检查
  const now = new Date();
  const resetAt = new Date(account.daily_reset_at || 0);
  // 跨天重置
  if (now.toDateString() !== resetAt.toDateString()) {
    update(account_id, { daily_publish_count: 0, daily_reset_at: now.toISOString() });
    account.daily_publish_count = 0;
  }
  if (account.daily_publish_count >= account.limits.max_per_day) {
    return { ok: false, status: 'daily_limit', account, error: `今日发布数已达上限 (${account.limits.max_per_day})` };
  }

  // 最小间隔检查
  //  v0.118.x 修复：如果上次记录是失败（last_error 存在），豁免 too_frequent
  //   之前逻辑：last_used_at 任意更新都会触发 30 分钟冷却，导致登录失败/选择器错等本地 bug 也要等 30 分钟
  //   修复后：recordSuccess 会清 last_error，recordFailure 会写 last_error —— last_error 存在 = 上次失败 = 不算冷却
  //   recordFailure 也已不再写 last_used_at（修复见 recordFailure），双重保险
  if (account.last_used_at && !account.last_error) {
    const lastUsed = new Date(account.last_used_at);
    const intervalMin = (now - lastUsed) / 60000;
    if (intervalMin < account.limits.min_interval_minutes) {
      const waitMin = Math.ceil(account.limits.min_interval_minutes - intervalMin);
      return {
        ok: false,
        status: 'too_frequent',
        account,
        error: `发布过于频繁，需等待 ${waitMin} 分钟`,
        wait_minutes: waitMin,
      };
    }
  }

  return {
    ok: true,
    status: 'healthy',
    risk_level: account.risk_level,
    account,
  };
}

// ── 记录发布成功（更新 daily_publish_count + last_used_at）──
function recordSuccess(account_id) {
  return update(account_id, {
    daily_publish_count: (get(account_id)?.daily_publish_count || 0) + 1,
    last_used_at: new Date().toISOString(),
    last_error: null,
  });
}

// ── 记录发布失败（risk_level +10，封禁阈值 80）──
//  v0.118.x 修复：不更新 last_used_at — 失败不消耗频率冷却
//   bug 复现（2026-09-07）：发布失败几分钟后重试，checkHealth 返回 too_frequent 拒绝
//   根因：recordFailure 也更新 last_used_at，导致本地失败（登录/选择器错）也进入 30 分钟冷却
//   风控职责分离：
//     - last_used_at 仅记录成功发布（防平台刷量）→ recordSuccess 维护
//     - risk_level 累计失败风险 → recordFailure 维护（连败会自动到 banned）
function recordFailure(account_id, error_msg) {
  const account = get(account_id);
  if (!account) return { ok: false };
  const newRisk = Math.min(100, (account.risk_level || 0) + 10);
  const updates = {
    last_error: error_msg || 'unknown',
    risk_level: newRisk,
  };
  if (newRisk >= 100) {
    updates.status = 'banned';
  }
  return update(account_id, updates);
}

// ── 上传图片到平台（PR 2 stub：返回原图 URL，PR 3 改真实上传）──
async function uploadImage({ image_url_or_path, account_id, platform }) {
  // PR 2 stub：直接返回原图，不真上传（每个平台 provider 自己处理）
  // 真实逻辑 PR 3 在 provider 里调 ba.upload()
  return {
    ok: true,
    cdn_url: image_url_or_path,
    size: 0,
    width: 0,
    height: 0,
    stub: true,
    note: 'PR 2 stub：未真实上传，CDN URL = 原路径。PR 3 在 provider 里实现真实上传',
  };
}

// ── v0.118 PR 5-2: 多账号轮换（按 risk_level + last_used_at 智能选最佳账号）──
//   评分规则（越低越好）：
//     - risk_level 权重 1.0
//     - daily_publish_count 权重 2.0（越接近上限越差）
//     - 距 last_used_at 时间权重 0.5（越近越差，防密集操作）
function scoreAccount(account) {
  let score = 0;
  score += (account.risk_level || 0) * 1.0;
  const limit = (account.limits?.max_per_day) || 10;
  score += ((account.daily_publish_count || 0) / limit) * 100 * 2.0;
  if (account.last_used_at) {
    const minutesAgo = (Date.now() - new Date(account.last_used_at).getTime()) / 60000;
    const minInterval = account.limits?.min_interval_minutes || 30;
    if (minutesAgo < minInterval) {
      // 还在冷却期，加很大惩罚
      score += 1000;
    } else {
      // 越近发布过越往后排
      score += Math.max(0, 60 - minutesAgo) * 0.5;
    }
  }
  return score;
}

function selectBestAccount({ platform, exclude = [] } = {}) {
  const all = list({ platform }).filter(a => a.status === 'active');
  if (all.length === 0) return null;
  // 排除已用过的（多平台任务中避免重复）
  const candidates = all.filter(a => !exclude.includes(a.id));
  if (candidates.length === 0) return null;
  // 按 score 升序排
  candidates.sort((a, b) => scoreAccount(a) - scoreAccount(b));
  const best = candidates[0];
  return {
    account: best,
    score: scoreAccount(best),
    candidates_count: candidates.length,
    all_scores: candidates.map(c => ({ id: c.id, score: scoreAccount(c), risk: c.risk_level, used: c.daily_publish_count })),
  };
}

function resetRiskLevel(account_id) {
  // 手动重置风控（PM 工具：账号被误判后解除封禁）
  return update(account_id, { risk_level: 0, status: 'active', last_error: null });
}

module.exports = {
  create,
  list,
  get,
  getCredentials,
  update,
  remove,
  checkHealth,
  recordSuccess,
  recordFailure,
  uploadImage,
  selectBestAccount,
  resetRiskLevel,
  scoreAccount,
  PLATFORM_LIMITS,
};
