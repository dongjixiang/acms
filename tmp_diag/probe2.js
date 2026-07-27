
const Imap = require('imap');
const raw = `From: ACMS <sweden@263.net>
Subject: =?UTF-8?B?77+977+977+977+977+977+977+977+977+977+9?=
 =?UTF-8?B?77+977+9IO+/ve+/vSDvv73vv73vv70=?=

`;
const parsed = Imap.parseHeader(raw);
console.log('parsed.subject:', JSON.stringify(parsed.subject));
console.log('parsed.from:', JSON.stringify(parsed.from));
// buffer 字节
const buf = Buffer.from(parsed.subject[0], 'latin1');
console.log('subject latin1 bytes:', buf.toString('hex').slice(0, 80));
console.log('subject utf8 decoded:', buf.toString('utf8'));
