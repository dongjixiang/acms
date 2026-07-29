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
      if (cs === 'big5') return iconv.decode(buf, 'big5');
      if (cs === 'iso-8859-1' || cs === 'latin1') return buf.toString('latin1');
      try { return buf.toString('utf8'); } catch (_) { return buf.toString('latin1'); }
    } catch (e) { return _m; }
  });
}

// 测试 Q encoding
const tests = [
  "=?UTF-8?Q?=E6=97=A0charset=E6=B5=8B=E8=AF=95?=",
  "=?UTF-8?Q?=E4=B8=AD=E6=96=87abc?=",
  "=?UTF-8?Q?=E6=97=A0charset=E6=B5=8B=E8=AF=95?= =?UTF-8?Q?=E4=B8=AD=E6=96=87abc?=",
  "=?gbk?B?zfjJz7m6xrHPtc2zLdPDu6fWp7i2zajWqg==?=",
];
for (const t of tests) {
  const result = decodeMimeWord(t);
  console.log('input :', t.slice(0,60));
  console.log('output:', JSON.stringify(result));
  console.log();
}
