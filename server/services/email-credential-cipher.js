'use strict';

// ACMS 邮件 v2.0 — IMAP/SMTP 凭证对称加密服务
// 算法：AES-256-GCM（auth tag 防篡改）
// 密钥：data/email-cipher.key 文件持久化（首次启动自动生成，权限 0600）
// 用途：email_accounts collection 存加密后的 imap_pass / smtp_pass，明文密码永不落盘

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGO = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;        // GCM 推荐 12 字节
const AUTH_TAG_BYTES = 16;

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const KEY_PATH = path.join(DATA_DIR, 'email-cipher.key');

let _key = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadKey() {
  if (_key) return _key;
  ensureDataDir();
  if (fs.existsSync(KEY_PATH)) {
    _key = fs.readFileSync(KEY_PATH);
  } else {
    // 首次启动：随机生成 32 字节密钥，0600 权限落盘
    _key = crypto.randomBytes(KEY_BYTES);
    fs.writeFileSync(KEY_PATH, _key, { mode: 0o600 });
    console.log('[email-cipher] 生成新加密密钥 →', KEY_PATH);
  }
  if (_key.length !== KEY_BYTES) {
    throw new Error(`[email-cipher] 密钥长度异常: ${_key.length} 字节（期望 ${KEY_BYTES}）`);
  }
  return _key;
}

// 加密：返回 base64(iv || authTag || ciphertext)，便于 JSON 存储
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return '';
  const key = loadKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, enc]).toString('base64');
}

// 解密：输入 base64(iv || authTag || ciphertext)
function decrypt(b64) {
  if (!b64) return '';
  const key = loadKey();
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < IV_BYTES + AUTH_TAG_BYTES) {
    throw new Error('[email-cipher] 密文长度异常');
  }
  const iv = buf.subarray(0, IV_BYTES);
  const authTag = buf.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const enc = buf.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

// 加密所有能找到的 pass 字段（兼容两种结构）
//   约定 A（扁平）: { imap_pass: '...', smtp_pass: '...' }
//   约定 B（嵌套）: { imap: { pass: '...' }, smtp: { pass: '...' } }
//   约定 C（直接是 inner）: { host, port, user, pass }  ← 给定 imap 组的内部对象时
function encryptCredentials(creds) {
  const out = JSON.parse(JSON.stringify(creds || {}));
  // 约定 A：扁平字段
  for (const k of Object.keys(out)) {
    if (k.endsWith('_pass') && out[k]) out[k] = encrypt(out[k]);
  }
  // 约定 B：嵌套 imap/smtp 对象内的 pass
  for (const group of ['imap', 'smtp']) {
    if (out[group] && typeof out[group] === 'object' && out[group].pass) {
      out[group].pass = encrypt(out[group].pass);
    }
  }
  // 约定 C：当前对象本身就有 pass 字段（被传入 inner 对象时）
  if (out.pass && typeof out.pass === 'string') out.pass = encrypt(out.pass);
  return out;
}

function decryptCredentials(creds) {
  const out = JSON.parse(JSON.stringify(creds || {}));
  for (const k of Object.keys(out)) {
    if (k.endsWith('_pass') && out[k]) out[k] = decrypt(out[k]);
  }
  for (const group of ['imap', 'smtp']) {
    if (out[group] && typeof out[group] === 'object' && out[group].pass) {
      out[group].pass = decrypt(out[group].pass);
    }
  }
  if (out.pass && typeof out.pass === 'string') out.pass = decrypt(out.pass);
  return out;
}

// 测试用：重新生成密钥（用于"丢失密钥后清除所有账户"场景）
function resetKey() {
  if (fs.existsSync(KEY_PATH)) fs.unlinkSync(KEY_PATH);
  _key = null;
  return loadKey();
}

module.exports = {
  encrypt,
  decrypt,
  encryptCredentials,
  decryptCredentials,
  resetKey,
  // 暴露路径供诊断
  KEY_PATH,
};
