// 完全模拟 server 端代码路径
const iconv = require('iconv-lite');

function decodeMimeWord(text) {
  if (!text) return '';
  const re = /=\?([^?]+)\?([BbQq])\?([^?]*?)\?=/g;
  return String(text).replace(re, function(_m, charset, enc, data) {
    try {
      const encUpper = enc.toUpperCase();
      let buf;
      if (encUpper === 'B') {
        buf = Buffer.from(data, 'base64');
      } else {
        const q = data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_x, h) => String.fromCharCode(parseInt(h, 16)));
        buf = Buffer.from(q, 'binary');
      }
      const cs = String(charset).toLowerCase().replace(/^["']|["']$/g, '');
      if (cs === 'utf-8' || cs === 'utf8') return buf.toString('utf8');
      if (cs === 'gb2312' || cs === 'gbk' || cs === 'gb18030') return iconv.decode(buf, 'gbk');
      try { return buf.toString('utf8'); } catch (_) { return buf.toString('latin1'); }
    } catch (e) { return _m; }
  });
}

function decodeHeaderValue(s) {
  if (!s) return '';
  return decodeMimeWord(String(s).replace(/\r\n[ \t]+/g, ''));
}

function extractHeaderField(headerStr, fieldName) {
  if (!headerStr) return '';
  const re = new RegExp('^' + fieldName + ':\s*(.+)$', 'im');
  const m = headerStr.match(re);
  if (!m) return '';
  let value = m[1];
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

// 完整 raw header（从 chunks log 抄的 uid=3331）
const rawBody = "From: ACMS <sweden@263.net>\r\nSubject: =?UTF-8?Q?=E6=97=A0charset=E6=B5=8B=E8=AF=95?=\r\n =?UTF-8?Q?=E4=B8=AD=E6=96=87abc?=\r\nMessage-ID: <f73afca5-a6a4-7a24-6b27-3287347d46f8@263.net>\r\nDate: Mon, 27 Jul 2026 16:26:01 +0000\r\n\r\n";

console.log('=== Step 1: decodeHeaderValue(body) ===');
const s1 = decodeHeaderValue(rawBody);
console.log(JSON.stringify(s1));

console.log('\n=== Step 2: extractHeaderField(headerStr, subject) ===');
const s2 = extractHeaderField(s1, 'subject');
console.log(JSON.stringify(s2));

console.log('\n=== Step 3: extractHeaderField(rawBody, subject) — 没经过 decodeHeaderValue ===');
const s3 = extractHeaderField(rawBody, 'subject');
console.log(JSON.stringify(s3));

console.log('\n=== Server API actually returns: ===');
console.log(JSON.stringify('=?UTF-8?Q?E8=AF=95?= =?UTF-8?Q?AD=E6=96=87abc?='));
