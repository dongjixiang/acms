'use strict';

// ACMS · email-codec v1.0
// 统一 RFC 2047 (encoded-word) + RFC 5322 (header folding) + RFC 2045 (Content-Transfer-Encoding)
// 前后端共用：浏览器端打包进 bundle，Node 端直接 require

const { decodeMimeWord, decodeHeaderValue, extractHeaderField } = require('./decode-header');
const { decodeBodyBuffer, charsetToString } = require('./decode-body');

module.exports = {
  // ===== Header 解码 =====
  // 单个 encoded-word: =?charset?B?base64?= 或 =?charset?Q?quoted-printable?=
  decodeMimeWord,
  
  // 完整 header 值：合并折叠行 + 解码所有 encoded-word
  decodeHeaderValue,
  
  // 从原始 header 字符串提取单个字段（处理多行折叠 + 重复字段）
  extractHeaderField,
  
  // ===== Body 解码 =====
  // 按 Content-Transfer-Encoding 解码 Buffer: base64 / quoted-printable / 7bit / 8bit / binary
  decodeBodyBuffer,
  
  // Buffer + charset → UTF-8 字符串
  charsetToString,
  
  // ===== 组合 API =====
  // 完整邮件解码：{ headers: {}, body: Buffer, encoding, charset, html? }
  decodeEmail: function(rawEmail) {
    if (!rawEmail) return { headers: {}, text: '', html: '' };
    
    const headers = {};
    for (const [k, v] of Object.entries(rawEmail.headers || {})) {
      headers[k.toLowerCase()] = decodeHeaderValue(v);
    }
    
    const encoding = (rawEmail.encoding || '7bit').toLowerCase();
    const charset = rawEmail.charset || 'utf-8';
    
    let text = '';
    let html = '';
    
    if (rawEmail.body) {
      const buf = decodeBodyBuffer(rawEmail.body, encoding);
      text = charsetToString(buf, charset);
    }
    
    if (rawEmail.html) {
      const htmlBuf = decodeBodyBuffer(rawEmail.html, encoding);
      html = charsetToString(htmlBuf, charset);
    }
    
    return { headers, text, html };
  },
  
  // 便捷：仅解码 subject/from/to 等常用字段
  decodeCommonHeaders: function(rawHeaders) {
    const out = {};
    const fields = ['subject', 'from', 'to', 'cc', 'bcc', 'reply-to', 'date', 'message-id', 'in-reply-to', 'references'];
    for (const f of fields) {
      const val = rawHeaders[f] || rawHeaders[f.toUpperCase()] || rawHeaders[f.charAt(0).toUpperCase() + f.slice(1)];
      if (val) out[f] = decodeHeaderValue(val);
    }
    return out;
  }
};