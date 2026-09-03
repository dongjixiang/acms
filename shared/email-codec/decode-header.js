'use strict';

// ACMS · email-codec/decode-header.js
// RFC 2047 (encoded-word) + RFC 5322 (header folding) 解码
// 移植自 imap-service.js + email-inbox.js，统一前后端行为

const iconv = require('iconv-lite');

// ===== 内部：单个 encoded-word 解码 =====
// =?charset?B?base64?=  或  =?charset?Q?quoted-printable?=
function decodeMimeWord(s) {
  if (!s) return '';
  // 匹配 =?charset?encoding?data?=，允许连续多个 encoded-word
  const re = /=\?([^?]+)\?([BbQq])\?([^?]*?)\?=/g;
  return String(s).replace(re, function(_m, charset, enc, data) {
    try {
      const encUpper = enc.toUpperCase();
      let buf;
      if (encUpper === 'B') {
        // Base64
        buf = Buffer.from(data, 'base64');
      } else {
        // Quoted-Printable: _ = space, =XX = hex byte
        const q = data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_x, h) => String.fromCharCode(parseInt(h, 16)));
        buf = Buffer.from(q, 'binary');
      }
      const cs = String(charset).toLowerCase().replace(/^["']|["']$/g, '');
      // charset 映射
      if (cs === 'utf-8' || cs === 'utf8') return buf.toString('utf8');
      if (cs === 'gb2312' || cs === 'gbk' || cs === 'gb18030') return iconv.decode(buf, 'gbk');
      if (cs === 'big5') return iconv.decode(buf, 'big5');
      if (cs === 'iso-8859-1' || cs === 'latin1') return buf.toString('latin1');
      // 未知 charset：尝试 utf8，失败回退 latin1
      try { return buf.toString('utf8'); } catch (_) { return buf.toString('latin1'); }
    } catch (e) { return _m; }
  });
}

// ===== 合并多行 encoded-word + 折叠 CRLF (RFC 5322 §2.2.3) =====
// 处理: "Subject: =?utf-8?B?5bCP56iL?=\r\n =?utf-8?B?5YiX?="
function decodeHeaderValue(s) {
  if (!s) return '';
  // 先合并折叠行：CRLF + WSP → 单空格
  const folded = String(s).replace(/\r\n[ \t]+/g, ' ');
  return decodeMimeWord(folded);
}

// ===== 从原始 header 字符串提取单个字段值 =====
// 处理 RFC 5322 多行折叠 + 重复字段（取第一个）
function extractHeaderField(headerStr, fieldName) {
  if (!headerStr) return '';
  const re = new RegExp('^' + fieldName + ':\\s*(.+)$', 'im');
  const m = headerStr.match(re);
  if (!m) return '';
  let value = m[1];
  // 合并续行
  const continuation = headerStr.slice(headerStr.indexOf(m[0]) + m[0].length);
  const moreRe = new RegExp('^[ \t]+(.+)$', 'gm');
  let cm;
  const subs = [];
  while ((cm = moreRe.exec(continuation)) !== null) {
    subs.push(cm[1]);
    if (!cm[1].match(/^[ \t]/)) break;
  }
  return decodeMimeWord((value + (subs.length ? ' ' + subs.join(' ') : '')).trim());
}

// ===== 批量解码常用 header 字段 =====
function decodeCommonHeaders(rawHeaders) {
  const out = {};
  const fields = ['subject', 'from', 'to', 'cc', 'bcc', 'reply-to', 'date', 'message-id', 'in-reply-to', 'references'];
  for (const f of fields) {
    // 兼容大小写键名
    const val = rawHeaders[f] || rawHeaders[f.toUpperCase()] || rawHeaders[f.charAt(0).toUpperCase() + f.slice(1)];
    if (val) out[f] = decodeHeaderValue(val);
  }
  return out;
}

module.exports = { decodeMimeWord, decodeHeaderValue, extractHeaderField, decodeCommonHeaders };