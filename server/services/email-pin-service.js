'use strict';

// ACMS 邮件 v2.0 — PIN 哈希/验证服务
// 算法：crypto.scrypt（Node 内置，免装 bcrypt）
// 参数：N=16384 (2^14), r=8, p=1，keylen=64
// 4-6 位数字 PIN（熵低）— 主要防家人误开 + 短时窥屏，不防定向暴力
//
// 存储格式：`scrypt$<N>$<r>$<p>$<salt-base64>$<hash-base64>`
// 每段 `$` 分隔，便于解析（参数升级兼容：旧格式可识别）

const crypto = require('crypto');

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const SALT_BYTES = 16;
const MIN_PIN_LEN = 4;
const MAX_PIN_LEN = 6;

function validatePin(pin) {
  if (typeof pin !== 'string') return 'PIN 必须是字符串';
  if (pin.length < MIN_PIN_LEN || pin.length > MAX_PIN_LEN) {
    return `PIN 长度必须是 ${MIN_PIN_LEN}-${MAX_PIN_LEN} 位`;
  }
  if (!/^\d+$/.test(pin)) return 'PIN 只能是数字';
  return null;
}

function hash(pin) {
  const err = validatePin(pin);
  if (err) throw new Error(err);
  const salt = crypto.randomBytes(SALT_BYTES);
  const hashBuf = crypto.scryptSync(pin, salt, KEY_LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return ['scrypt', N, R, P, salt.toString('base64'), hashBuf.toString('base64')].join('$');
}

// 验证 PIN（恒定时间比较防时序攻击）
function verify(pin, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const err = validatePin(pin);
  if (err) return false;

  const parts = stored.split('$');
  // 期望：['scrypt', N, r, p, salt, hash] — 6 段
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const Nv = parseInt(parts[1], 10);
  const Rv = parseInt(parts[2], 10);
  const Pv = parseInt(parts[3], 10);
  if (!Nv || !Rv || Pv === undefined) return false;
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (!salt.length || !expected.length) return false;

  let actual;
  try {
    actual = crypto.scryptSync(pin, salt, expected.length, {
      N: Nv, r: Rv, p: Pv, maxmem: 128 * 1024 * 1024,
    });
  } catch (e) {
    return false;
  }

  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = {
  hash,
  verify,
  validatePin,
  MIN_PIN_LEN,
  MAX_PIN_LEN,
};
