const path = require('path');
const { isPathAllowed, sniffMimeFromBuffer, resolveImageSource } = require('../server/services/vision-service');

console.log('=== A. 路径白名单 ===');
const home = process.env.USERPROFILE || '';
const tests = [
  { p: path.join(home, 'Pictures', 'xjl.png'),
    ctx: { cwd: path.join(home, 'Pictures') }, expect: true, label: 'Pictures 内（cwd=Pictures）' },
  { p: path.join(home, 'Pictures', 'xjl.png'),
    ctx: { cwd: process.cwd() }, expect: true, label: 'Pictures 兜底（cwd=ACMS）' },
  { p: 'C:\Windows\System32\config.png',
    ctx: { cwd: process.cwd() }, expect: false, label: 'Win System32 拒' },
  { p: path.join(home, '.ssh', 'id_rsa'),
    ctx: { cwd: process.cwd() }, expect: false, label: '.ssh 拒' },
  { p: path.join(home, 'Pictures', '.git', 'config'),
    ctx: { cwd: process.cwd() }, expect: false, label: '.git 拒' },
  { p: '', ctx: {}, expect: false, label: 'empty path' },
  { p: null, ctx: {}, expect: false, label: 'null path' },
  { p: '/etc/passwd', ctx: { cwd: process.cwd() }, expect: false, label: '/etc/passwd 拒' },
  { p: path.join(home, 'Desktop', 'img.png'),
    ctx: { cwd: process.cwd() }, expect: true, label: 'Desktop 兜底' },
  { p: path.join(home, 'Downloads', 'img.png'),
    ctx: { cwd: process.cwd() }, expect: true, label: 'Downloads 兜底' },
];
let ap=0,af=0;
for (const t of tests) {
  const r = isPathAllowed(t.p, t.ctx);
  if (r.ok === t.expect) { ap++; console.log('  PASS |', t.label); }
  else { af++; console.log('  FAIL |', t.label, '|', JSON.stringify(r).slice(0,180)); }
}
console.log(`[A] path  ${ap}/${ap+af}`);

console.log('');
console.log('=== B. mime 嗅探 ===');
const pngHeader = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
const jpegHeader = Buffer.from([0xFF,0xD8,0xFF,0xE0]);
const gifHeader = Buffer.from([0x47,0x49,0x46,0x38,0x39,0x61]);
const webpHeader = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0,0,0,0]), Buffer.from('WEBP'), Buffer.from('VP8 ')]);
const mimes = [
  { label: 'PNG', expect: 'image/png', buf: Buffer.concat([pngHeader, Buffer.alloc(20)]) },
  { label: 'JPEG', expect: 'image/jpeg', buf: Buffer.concat([jpegHeader, Buffer.alloc(20)]) },
  { label: 'GIF', expect: 'image/gif', buf: Buffer.concat([gifHeader, Buffer.alloc(20)]) },
  { label: 'WEBP', expect: 'image/webp', buf: Buffer.concat([webpHeader, Buffer.alloc(20)]) },
  { label: 'too short', expect: null, buf: Buffer.from('ab') },
  { label: 'random text', expect: null, buf: Buffer.from('hello world 12345') },
  { label: 'real xjl.png', expect: 'image/png', buf: require('fs').readFileSync(path.join(home, 'Pictures', 'xjl.png')).slice(0,16) },
];
let bp=0,bf=0;
for (const t of mimes) {
  const got = sniffMimeFromBuffer(t.buf);
  if (got === t.expect) { bp++; console.log('  PASS |', t.label); }
  else { bf++; console.log('  FAIL |', t.label, '| got=', got, '| expect=', t.expect); }
}
console.log(`[B] mime  ${bp}/${bp+bf}`);

console.log('');
console.log('=== C. resolveImageSource ===');
(async () => {
  const xjl = path.join(home, 'Pictures', 'xjl.png');
  console.log('USERPROFILE:', home, '| xjl.png exists:', require('fs').existsSync(xjl));

  console.log('C1. resolve(xjl.png, cwd=Pictures) →');
  let r = await resolveImageSource(xjl, { cwd: path.join(home, 'Pictures') });
  console.log('  ', JSON.stringify(r));

  console.log('C2. resolve(xjl.png, no context, 走 Desktop/Pictures 兜底) →');
  r = await resolveImageSource(xjl, {});
  console.log('  ', JSON.stringify(r));

  console.log('C3. resolve("http://example.com/x.png") → URL_NEEDS_FETCH 提示调用方自己 fetch');
  r = await resolveImageSource('http://example.com/x.png', {});
  console.log('  ', JSON.stringify(r));

  console.log('C4. resolve("https://internalhost/x.png") → INTERNAL_HOST_BLOCKED（业务安全）');
  r = await resolveImageSource('https://localhost/x.png', {});
  console.log('  ', JSON.stringify(r));

  console.log('C5. resolve(non-existent path) → FILE_NOT_FOUND');
  r = await resolveImageSource(path.join(home, 'Pictures', '__no_such_file__.png'), {});
  console.log('  ', JSON.stringify(r));

  console.log('C6. resolve(in-memory PNG Buffer) → buffer kind');
  r = await resolveImageSource(Buffer.concat([pngHeader, Buffer.alloc(2048)]), {});
  console.log('  ', JSON.stringify(r));

  const fail = af + bf;
  process.exit(fail > 0 ? 1 : 0);
})();
