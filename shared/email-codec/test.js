'use strict';

// ACMS · email-codec/test.js
// 基础自测：验证 RFC 2047 / 5322 / 2045 解码正确性

const EmailCodec = require('./index');

console.log('=== email-codec 自测 ===\n');

// ---- 1. decodeMimeWord ----
console.log('1. decodeMimeWord:');
const tests1 = [
  ['=?utf-8?B?5rWL6K+V?=', '测试'],
  ['=?utf-8?B?5Lit5paH?=', '中文'],
  ['=?utf-8?Q?=E4=B8=AD=E6=96=87?=', '中文'],
  ['=?ISO-8859-1?Q?Fran=E7ais?=', 'Français'],
  ['plain text', 'plain text'],
  // RFC 2047: 相邻 encoded-word 间的空格会被保留
  ['=?utf-8?B?5rWL6K+V?= =?utf-8?B?6YKu5Lu2?=', '测试 邮件'],
];
tests1.forEach(([input, expected]) => {
  const out = EmailCodec.decodeMimeWord(input);
  const ok = out === expected ? '✅' : '❌';
  console.log(`  ${ok} "${input}" → "${out}" (期望: "${expected}")`);
});

// ---- 2. decodeHeaderValue (折叠行) ----
console.log('\n2. decodeHeaderValue (折叠行):');
const folded = '=?utf-8?B?5rWL6K+V?=\r\n =?utf-8?B?6YKu5Lu2?=';
const out2 = EmailCodec.decodeHeaderValue(folded);
// RFC 2047: 折叠行合并时，encoded-word 间的空格保留
console.log(`  ${out2 === '测试 邮件' ? '✅' : '❌'} 折叠行合并: "${folded}" → "${out2}"`);

// ---- 3. extractHeaderField ----
console.log('\n3. extractHeaderField:');
const rawHeaders = `Subject: =?utf-8?B?5rWL6K+V?=
From: "张三" <zhangsan@example.com>
To: "李四" <lisi@example.com>
Date: Mon, 1 Jan 2024 12:00:00 +0800`;
console.log(`  Subject: "${EmailCodec.extractHeaderField(rawHeaders, 'Subject')}"`);
console.log(`  From: "${EmailCodec.extractHeaderField(rawHeaders, 'From')}"`);
console.log(`  To: "${EmailCodec.extractHeaderField(rawHeaders, 'To')}"`);

// ---- 4. decodeBodyBuffer ----
console.log('\n4. decodeBodyBuffer:');
// base64: 传入包含 base64 字符串的 latin1 buffer
const base64Raw = 'SGVsbG8gV29ybGQ='; // "Hello World" base64
const base64Buf = Buffer.from(base64Raw, 'latin1');
const decodedB64 = EmailCodec.decodeBodyBuffer(base64Buf, 'base64');
console.log(`  base64: "${decodedB64.toString('utf8')}"`);

const qpBuf = Buffer.from('Hello=20World=0D=0A', 'binary'); // "Hello World\r\n" quoted-printable
const decodedQP = EmailCodec.decodeBodyBuffer(qpBuf, 'quoted-printable');
console.log(`  quoted-printable: "${decodedQP.toString('utf8')}"`);

const plainBuf = Buffer.from('Plain text', 'utf8');
const decodedPlain = EmailCodec.decodeBodyBuffer(plainBuf, '7bit');
console.log(`  7bit: "${decodedPlain.toString('utf8')}"`);

// ---- 5. charsetToString ----
console.log('\n5. charsetToString:');
const utf8Buf = Buffer.from('中文', 'utf8');
console.log(`  utf8: "${EmailCodec.charsetToString(utf8Buf, 'utf-8')}"`);
const iconv = require('iconv-lite');
const gbkBuf = iconv.encode('中文', 'gbk');
console.log(`  gbk: "${EmailCodec.charsetToString(gbkBuf, 'gbk')}"`);

// ---- 6. decodeEmail 组合 ----
console.log('\n6. decodeEmail 组合:');
const rawEmail = {
  headers: {
    subject: '=?utf-8?B?5rWL6K+V?=',
    from: '"张三" <zhangsan@example.com>',
    'content-type': 'text/plain; charset=utf-8',
    'content-transfer-encoding': 'base64'
  },
  // body: 原始 base64 字符串（latin1 buffer），不是已解码的字节
  body: Buffer.from('5L2g5aW9', 'latin1'), // "你好" 的 base64
  encoding: 'base64',
  charset: 'utf-8'
};
const decoded = EmailCodec.decodeEmail(rawEmail);
console.log(`  headers:`, decoded.headers);
console.log(`  text: "${decoded.text}"`);
console.log(`  html: "${decoded.html}"`);

// ---- 7. decodeCommonHeaders ----
console.log('\n7. decodeCommonHeaders:');
const common = EmailCodec.decodeCommonHeaders(rawEmail.headers);
console.log(`  common:`, common);

console.log('\n=== 自测完成 ===');