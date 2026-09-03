'use strict';

// ACMS · email-codec/decode-body.js
// RFC 2045 Content-Transfer-Encoding 解码 + charset → UTF-8
// 移植自 imap-service.js + email-inbox.js，统一前后端行为

const iconv = require('iconv-lite');

// ===== 内部：Buffer 字符集转字符串 =====
function charsetToString(buf, charset) {
  if (!buf) return '';
  const cs = String(charset || '').toLowerCase().replace(/^["']|["']$/g, '');
  if (cs === 'utf-8' || cs === 'utf8') return buf.toString('utf8');
  if (cs === 'gb2312' || cs === 'gbk' || cs === 'gb18030') {
    try { return iconv.decode(buf, 'gbk'); } catch (_) {}
  }
  if (cs === 'big5') {
    try { return iconv.decode(buf, 'big5'); } catch (_) {}
  }
  if (cs === 'iso-8859-1' || cs === 'latin1') return buf.toString('latin1');
  // 默认 utf8
  return buf.toString('utf8');
}

// ===== 按 Content-Transfer-Encoding 解码 raw body bytes =====
// encoding: 'base64' | 'quoted-printable' | '7bit' | '8bit' | 'binary'
function decodeBodyBuffer(buf, encoding) {
  if (!buf) return Buffer.alloc(0);
  const enc = String(encoding || '').toLowerCase();
  try {
    if (enc === 'base64') {
      // base64 可能包含 whitespace，先清理
      const b64 = buf.toString('latin1').replace(/\s+/g, '');
      return Buffer.from(b64, 'base64');
    }
    if (enc === 'quoted-printable') {
      // QP 解码：先剥离软换行 =\r\n / =\n（RFC 2045 §6.7：软换行不加空格，直接删除）
      let qpStr = buf.toString('binary')
        .replace(/=\r\n/g, '')
        .replace(/=\n/g, '');
      // =_ → space
      qpStr = qpStr.replace(/_/g, ' ');
      // =XX → 字节
      qpStr = qpStr.replace(/=([0-9A-Fa-f]{2})/g, (_x, h) => String.fromCharCode(parseInt(h, 16)));
      return Buffer.from(qpStr, 'binary');
    }
    // 7bit / 8bit / binary：原样返回
    return buf;
  } catch (e) {
    return buf;
  }
}

// ===== 便捷：Buffer → string (自动按 encoding + charset) =====
function decodeBodyToString(buf, encoding, charset) {
  const decoded = decodeBodyBuffer(buf, encoding);
  return charsetToString(decoded, charset);
}

// ===== 从 MIME header 字符串解析 charset / encoding =====
// 例: "text/plain; charset=utf-8" 或 "text/html; charset=\"gb2312\"; format=flowed"
function parseContentType(contentType) {
  if (!contentType) return { mime: 'text/plain', charset: 'utf-8', params: {} };
  const parts = String(contentType).split(';').map(s => s.trim());
  const mime = parts[0].toLowerCase();
  const params = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf('=');
    if (eq > 0) {
      const key = parts[i].slice(0, eq).trim().toLowerCase();
      let val = parts[i].slice(eq + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      params[key] = val;
    }
  }
  return {
    mime,
    charset: params.charset || 'utf-8',
    params
  };
}

// ===== 从 Content-Transfer-Encoding header 解析 encoding =====
function parseTransferEncoding(header) {
  if (!header) return '7bit';
  return String(header).trim().toLowerCase().replace(/^["']|["']$/g, '');
}

module.exports = {
  decodeBodyBuffer,
  charsetToString,
  decodeBodyToString,
  parseContentType,
  parseTransferEncoding
};