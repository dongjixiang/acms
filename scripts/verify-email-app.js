'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const clientPath = path.join(ROOT, 'client/js/views/email-inbox.js');
const routePath = path.join(ROOT, 'server/routes/emails.js');
const client = fs.readFileSync(clientPath, 'utf8');
const route = fs.readFileSync(routePath, 'utf8');

// Regression: fetch JSON must explicitly declare JSON, otherwise Express sees an empty body.
assert.match(
  client,
  /Content-Type[^"'`]*application\/json/,
  'email compose must send Content-Type: application/json'
);

// ACMSWin scope: email window code must not query globally duplicated IDs.
assert.doesNotMatch(
  client,
  /document\.getElementById\(['"]em-/,
  'email app DOM queries must be scoped to the active ACMSWin root'
);

// Compose contract and UX safety.
assert.match(client, /file_ids\s*:/, 'compose send payload must include uploaded attachment IDs');
assert.match(client, /sanitizeEmailHtml/, 'HTML email bodies must be sanitized before innerHTML rendering');
assert.match(client, /localStorage/, 'compose must preserve drafts locally');
assert.match(client, /bcc\s*:/, 'compose must support BCC');

// The direct inbox route must reuse the shared sender, not maintain a divergent SMTP implementation.
assert.match(route, /services\/email-sender/, 'direct email route must reuse shared email sender service');
assert.doesNotMatch(route, /nodemailer\s*=\s*require/, 'direct route must not instantiate nodemailer itself');

const sender = require('../server/services/email-sender');

assert.deepStrictEqual(
  sender.parseRecipients('a@example.com; b@example.com、c@example.com'),
  ['a@example.com', 'b@example.com', 'c@example.com']
);
assert.deepStrictEqual(
  sender.parseRecipients(['a@example.com', ' b@example.com ']),
  ['a@example.com', 'b@example.com']
);
assert.strictEqual(sender.isValidAddress('多多 <duoduo@example.com>'), true);
assert.strictEqual(sender.isValidAddress('not-an-email'), false);

assert.throws(
  () => sender.normalizeSendOptions({ subject: 's', body: 'b' }),
  err => err && err.code === 'NO_RECIPIENT'
);
assert.throws(
  () => sender.normalizeSendOptions({ to: 'bad', subject: 's', body: 'b' }),
  err => err && err.code === 'INVALID_EMAIL'
);
assert.throws(
  () => sender.normalizeSendOptions({ to: 'a@example.com', subject: '', body: 'b' }),
  err => err && err.code === 'NO_SUBJECT'
);
assert.throws(
  () => sender.normalizeSendOptions({ to: 'a@example.com', subject: 's', body: '' }),
  err => err && err.code === 'NO_BODY'
);

const normalized = sender.normalizeSendOptions({
  to: 'a@example.com',
  cc: 'b@example.com',
  bcc: 'c@example.com',
  replyTo: 'reply@example.com',
  subject: '  hello  ',
  body: 'world',
  isHtml: false,
});
assert.deepStrictEqual(normalized.to, ['a@example.com']);
assert.deepStrictEqual(normalized.cc, ['b@example.com']);
assert.deepStrictEqual(normalized.bcc, ['c@example.com']);
assert.strictEqual(normalized.replyTo, 'reply@example.com');
assert.strictEqual(normalized.subject, 'hello');

const fakeUploadService = {
  getFilePath(id) {
    return {
      filePath: path.join(ROOT, 'fixtures', id),
      meta: { name: id + '.txt', mime: 'text/plain', size: 1024 },
    };
  },
};
const attachments = sender.resolveAttachments(['one', 'two'], fakeUploadService);
assert.strictEqual(attachments.length, 2);
assert.strictEqual(attachments[0].filename, 'one.txt');
assert.throws(
  () => sender.resolveAttachments(new Array(11).fill('x'), fakeUploadService),
  err => err && err.code === 'TOO_MANY_ATTACHMENTS'
);

console.log('PASS verify-email-app');
