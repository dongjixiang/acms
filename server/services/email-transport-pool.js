'use strict';

// ACMS 邮件 v2.0 — nodemailer transporter 缓存池
// 按 accountId 缓存 transporter，懒加载（首次 getTransport 时创建）
// 复用 email-sender.js 的 createTransporter，但凭证从 account-store 拿

const nodemailer = require('nodemailer');
const accountStore = require('./email-account-store');
const { createTransporter } = require('./email-sender');

const _pool = new Map();    // accountId → transporter
const _lock = new Map();    // accountId → Promise（防止并发首次创建）

function _build(accountId) {
  const dec = accountStore.getDecrypted(accountId);
  if (!dec) throw new Error(`account ${accountId} 不存在`);
  if (!dec.smtp || !dec.smtp.host) throw new Error(`account ${accountId} SMTP 配置缺失`);
  const smtp = {
    host: dec.smtp.host,
    port: dec.smtp.port || 465,
    secure: dec.smtp.secure !== false,
    user: dec.smtp.user,
    pass: dec.smtp.pass || '',
    from: dec.email,
    fromName: dec.smtp.from_name || '',
  };
  return createTransporter(smtp, nodemailer);
}

async function getTransport(accountId) {
  if (!accountId) throw new Error('accountId 不能为空');
  if (_pool.has(accountId)) return _pool.get(accountId);

  // 防止并发首次创建（双开邮件触发重复 transporter）
  if (_lock.has(accountId)) {
    await _lock.get(accountId);
    return _pool.get(accountId);
  }
  const p = (async () => {
    try {
      const t = _build(accountId);
      _pool.set(accountId, t);
      return t;
    } finally {
      _lock.delete(accountId);
    }
  })();
  _lock.set(accountId, p);
  return p;
}

function invalidate(accountId) {
  const t = _pool.get(accountId);
  if (t && typeof t.close === 'function') {
    try { t.close(); } catch (_) { /* ignore */ }
  }
  _pool.delete(accountId);
}

function invalidateAll() {
  for (const t of _pool.values()) {
    if (typeof t.close === 'function') {
      try { t.close(); } catch (_) { /* ignore */ }
    }
  }
  _pool.clear();
}

function size() { return _pool.size; }

module.exports = {
  getTransport,
  invalidate,
  invalidateAll,
  size,
};
