'use strict';

// ACMS 邮件 v2.0 — Account（邮箱凭证）CRUD store
// collection: email_accounts
// doc 形状：
//   {
//     id: 'ea_xxx',
//     profile_id: 'ep_xxx',                    // 所属身份（必须）
//     email: 'sweden@263.net',                 // 主显示邮箱
//     name: '工作邮箱',                         // 用户起的别名
//     color: '#4ecdc4',                        // UI 头像色
//     imap: { host, port, user, pass, tls },   // pass 是密文
//     smtp: { host, port, user, pass, secure, from_name },
//     sort_order: 0,                           // 抽屉内排序
//     status: 'active' | 'disabled',            // 软禁用（不删数据）
//     last_used_at: <iso>,
//     last_error: null,
//     created_at: <iso>,
//   }

const { collection } = require('../db/connection');
const cipher = require('./email-credential-cipher');

const COLL = 'email_accounts';

function makeId() {
  return 'ea_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function coll() { return collection(COLL); }

// 公开字段：imap_pass / smtp_pass 不返回给前端
function publicView(a) {
  if (!a) return null;
  // eslint-disable-next-line no-unused-vars
  const { imap, smtp, ...rest } = a;
  return {
    ...rest,
    imap: a.imap ? { host: a.imap.host, port: a.imap.port, user: a.imap.user, tls: a.imap.tls, has_pass: !!a.imap.pass } : null,
    smtp: a.smtp ? { host: a.smtp.host, port: a.smtp.port, user: a.smtp.user, secure: a.smtp.secure, from_name: a.smtp.from_name, has_pass: !!a.smtp.pass } : null,
  };
}

// 解密视图（调用方内部用 — sendEmail / IMAP 连接）
function decrypt(a) {
  if (!a) return null;
  return {
    ...a,
    imap: a.imap ? cipher.decryptCredentials(a.imap) : null,
    smtp: a.smtp ? cipher.decryptCredentials(a.smtp) : null,
  };
}

function list(profileId) {
  const all = coll().all();
  const filtered = profileId ? all.filter(a => a.profile_id === profileId) : all;
  return filtered
    .map(publicView)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

function get(id) {
  return publicView(coll().findOne(a => a.id === id));
}

function getRaw(id) {
  return coll().findOne(a => a.id === id);
}

function getDecrypted(id) {
  return decrypt(getRaw(id));
}

function getDefaultForProfile(profileId) {
  if (!profileId) return null;
  // 默认账户 = sort_order 最小 + status=active
  const candidates = coll().all()
    .filter(a => a.profile_id === profileId && a.status !== 'disabled')
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  return candidates[0] ? publicView(candidates[0]) : null;
}

function create({ profile_id, email, name, color, imap, smtp, sort_order }) {
  if (!profile_id) throw new Error('profile_id 不能为空');
  if (!email || !String(email).trim()) throw new Error('email 不能为空');
  if (!imap || !imap.host || !imap.port || !imap.user) throw new Error('imap 配置不完整 (host/port/user)');
  if (!smtp || !smtp.host || !smtp.port || !smtp.user) throw new Error('smtp 配置不完整 (host/port/user)');

  // 用 cipher 统一加密（嵌套 imap/smtp.pass）
  const imapEnc = imap.pass ? cipher.encryptCredentials({ imap: { pass: imap.pass } }).imap : { pass: '' };
  const smtpEnc = smtp.pass ? cipher.encryptCredentials({ smtp: { pass: smtp.pass } }).smtp : { pass: '' };
  const doc = {
    id: makeId(),
    profile_id,
    email: String(email).trim(),
    name: (name && String(name).trim()) || String(email).trim(),
    color: color || '#4ecdc4',
    imap: {
      host: imap.host,
      port: Number(imap.port) || 993,
      user: imap.user,
      pass: imapEnc.pass || '',
      tls: imap.tls !== false,
    },
    smtp: {
      host: smtp.host,
      port: Number(smtp.port) || 465,
      user: smtp.user,
      pass: smtpEnc.pass || '',
      secure: smtp.secure !== false,
      from_name: smtp.from_name || '',
    },
    sort_order: sort_order || 0,
    status: 'active',
    last_used_at: null,
    last_error: null,
    created_at: new Date().toISOString(),
  };
  coll().insert(doc);
  return publicView(doc);
}

function update(id, updates) {
  const existing = getRaw(id);
  if (!existing) return null;

  const safeUpdates = JSON.parse(JSON.stringify(existing));  // 深拷贝避免 mutate 原对象
  // 简单字段
  for (const key of ['email', 'name', 'color', 'status', 'sort_order']) {
    if (updates[key] !== undefined) safeUpdates[key] = updates[key];
  }
  // imap 字段
  if (updates.imap) {
    if (!safeUpdates.imap) safeUpdates.imap = {};
    for (const k of ['host', 'port', 'user', 'tls']) {
      if (updates.imap[k] !== undefined) safeUpdates.imap[k] = updates.imap[k];
    }
    if (updates.imap.pass) {
      const enc = cipher.encryptCredentials({ imap: { pass: updates.imap.pass } });
      safeUpdates.imap.pass = enc.imap.pass;
    }
  }
  // smtp 字段
  if (updates.smtp) {
    if (!safeUpdates.smtp) safeUpdates.smtp = {};
    for (const k of ['host', 'port', 'user', 'secure', 'from_name']) {
      if (updates.smtp[k] !== undefined) safeUpdates.smtp[k] = updates.smtp[k];
    }
    if (updates.smtp.pass) {
      const enc = cipher.encryptCredentials({ smtp: { pass: updates.smtp.pass } });
      safeUpdates.smtp.pass = enc.smtp.pass;
    }
  }

  coll().update(a => a.id === id, safeUpdates);
  return publicView(safeUpdates);
}

function touch(id, error) {
  const update = { last_used_at: new Date().toISOString() };
  if (error) update.last_error = error;
  coll().update(a => a.id === id, update);
}

function remove(id) {
  return coll().remove(a => a.id === id);
}

function removeByProfile(profileId) {
  return coll().remove(a => a.profile_id === profileId);
}

module.exports = {
  list,
  get,
  getRaw,
  getDecrypted,
  getDefaultForProfile,
  create,
  update,
  touch,
  remove,
  removeByProfile,
};
