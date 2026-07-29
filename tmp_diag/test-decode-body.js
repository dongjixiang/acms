// 测 server 端的 decodeBodyBuffer
function decodeBodyBuffer(buf, encoding) {
  const enc = String(encoding || '').toLowerCase();
  try {
    if (enc === 'base64') return Buffer.from(buf.toString('latin1').replace(/\s+/g, ''), 'base64');
    if (enc === 'quoted-printable') return Buffer.from(buf.toString('binary')
      .replace(/=([0-9A-Fa-f]{2})/g, (_x, h) => String.fromCharCode(parseInt(h, 16))), 'binary');
    return buf;
  } catch (e) { return buf; }
}

const rawBody = "77+977+9w7bvv73go6EK77+977+977+977+977+9yrzvv73vv73vv73vv73vv73vv73QsO+/ve+/ve+/ve+/ve+/vda1xLLvv73vv73Uoe+/vQrvv73vv73vv73vv73vv73vv70gdGVzdC1hdHQuHh077+9";
const buf = Buffer.from(rawBody, 'utf8');  // raw bytes
const decoded = decodeBodyBuffer(buf, 'base64');
console.log('decoded bytes:', decoded);
console.log('decoded as utf8:', decoded.toString('utf8'));

// 模拟 chunks（chunk size 限制）
const chunks = [];
for (let i = 0; i < rawBody.length; i += 16) chunks.push(Buffer.from(rawBody.slice(i, i + 16), 'utf8'));
const rawBuf = Buffer.concat(chunks);
const decoded2 = decodeBodyBuffer(rawBuf, 'base64');
console.log('\nwith chunks:', decoded2.toString('utf8'));
