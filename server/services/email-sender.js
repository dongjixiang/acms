'use strict';

// Shared outbound email pipeline used by both the Mail app and chat assist.
// Keeps recipient validation, attachment resolution and SMTP behavior consistent.
const fs = require('fs');
const nodemailer = require('nodemailer');
const config = require('../config');
const chatUploadService = require('./chat-upload');

const EMAIL_RE = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const MAX_RECIPIENTS = 50;
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_SUBJECT_LENGTH = 998;

class EmailSendError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.name = 'EmailSendError';
    this.code = code;
    this.httpStatus = httpStatus || 400;
  }
}

function addressEmail(address) {
  const value = String(address || '').trim();
  if (!value) return '';
  const angle = value.match(/<\s*([^<>]+)\s*>$/);
  return (angle ? angle[1] : value).trim();
}

function isValidAddress(address) {
  const value = addressEmail(address);
  if (!value) return false;
  if (value.length > 254) return false;
  return EMAIL_RE.test(value);
}

function splitRecipients(value) {
  const result = [];
  let buffer = '';
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '<') { depth++; buffer += ch; continue; }
    if (ch === '>') { if (depth > 0) depth--; buffer += ch; continue; }
    if (depth === 0 && (ch === ';' || ch === ',' || ch === '、' || ch === '\n')) {
      if (buffer.trim()) result.push(buffer.trim());
      buffer = '';
      continue;
    }
    buffer += ch;
  }
  if (buffer.trim()) result.push(buffer.trim());
  return result;
}

function parseRecipients(input) {
  if (Array.isArray(input)) {
    return input.flatMap(parseRecipients).filter(Boolean);
  }
  const value = String(input || '').trim();
  if (!value) return [];

  // Always split on explicit delimiters first so display names like
  // "大多多 <a@b.com>, 另一 <c@d.com>" stay grouped.
  if (/[;,、\n]/.test(value)) {
    return splitRecipients(value);
  }

  // Whitespace-separated list of bare addresses (legacy convenience).
  const whitespaceParts = value.split(/\s+/).filter(Boolean);
  if (whitespaceParts.length > 1 && whitespaceParts.every(part => EMAIL_RE.test(part))) {
    return whitespaceParts;
  }
  return [value];
}

function validateRecipientGroup(value, fieldName) {
  const addresses = parseRecipients(value);
  const invalid = addresses.filter(address => !isValidAddress(address));
  if (invalid.length) {
    throw new EmailSendError(
      'INVALID_EMAIL',
      `${fieldName || '邮箱地址'}格式不正确: ${invalid.join(', ')}`,
      400
    );
  }
  return addresses;
}

function normalizeSendOptions(options) {
  const input = options || {};
  const to = validateRecipientGroup(input.to, '收件人');
  if (!to.length) throw new EmailSendError('NO_RECIPIENT', '缺少收件人', 400);

  const cc = validateRecipientGroup(input.cc, '抄送地址');
  const bcc = validateRecipientGroup(input.bcc, '密送地址');
  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) {
    throw new EmailSendError('TOO_MANY_RECIPIENTS', `收件人总数不能超过 ${MAX_RECIPIENTS} 个`, 400);
  }

  const subject = String(input.subject || '').trim();
  if (!subject) throw new EmailSendError('NO_SUBJECT', '缺少主题', 400);
  if (subject.length > MAX_SUBJECT_LENGTH) {
    throw new EmailSendError('SUBJECT_TOO_LONG', `主题不能超过 ${MAX_SUBJECT_LENGTH} 个字符`, 400);
  }

  const body = String(input.body || '');
  if (!body.trim()) throw new EmailSendError('NO_BODY', '缺少正文', 400);
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    throw new EmailSendError('BODY_TOO_LARGE', '正文不能超过 5MB', 413);
  }

  let replyTo = String(input.replyTo || '').trim();
  if (replyTo && !isValidAddress(replyTo)) {
    throw new EmailSendError('INVALID_REPLY_TO', `回复地址格式不正确: ${replyTo}`, 400);
  }

  return {
    to,
    cc,
    bcc,
    replyTo,
    subject,
    body,
    isHtml: input.isHtml === true,
    inReplyTo: String(input.inReplyTo || '').trim(),
    references: String(input.references || '').trim(),
    file_ids: Array.isArray(input.file_ids)
      ? input.file_ids.filter(Boolean)
      : (input.file_ids ? [input.file_ids] : []),
  };
}

function resolveAttachments(fileIds, uploadService) {
  const ids = Array.isArray(fileIds) ? fileIds.filter(Boolean) : (fileIds ? [fileIds] : []);
  if (ids.length > MAX_ATTACHMENTS) {
    throw new EmailSendError('TOO_MANY_ATTACHMENTS', `附件不能超过 ${MAX_ATTACHMENTS} 个`, 400);
  }

  const service = uploadService || chatUploadService;
  let totalBytes = 0;
  const attachments = ids.map(id => {
    const found = service.getFilePath(id);
    if (!found) {
      throw new EmailSendError('ATTACHMENT_NOT_FOUND', `附件不存在或已过期: ${id}`, 400);
    }
    const meta = found.meta || {};
    let size = Number(meta.size) || 0;
    if (!size) {
      try { size = fs.statSync(found.filePath).size; } catch (_) { size = 0; }
    }
    totalBytes += size;
    return {
      filename: String(meta.name || '附件').replace(/[\r\n]/g, '_'),
      path: found.filePath,
      contentType: meta.mime || undefined,
    };
  });

  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    throw new EmailSendError('ATTACHMENTS_TOO_LARGE', '附件总大小不能超过 25MB', 413);
  }
  return attachments;
}

function createTransporter(smtp, nodemailerImpl) {
  const mailer = nodemailerImpl || nodemailer;
  return mailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 60000,
  });
}

async function sendEmail(options, dependencies) {
  const deps = dependencies || {};
  const smtp = deps.smtp || config.smtp;
  if (!smtp || !smtp.host) {
    throw new EmailSendError('SMTP_NOT_CONFIGURED', '未配置 SMTP', 400);
  }

  const normalized = normalizeSendOptions(options);
  const attachments = deps.attachments || resolveAttachments(normalized.file_ids, deps.uploadService);
  const transporter = deps.transporter || createTransporter(smtp, deps.nodemailer);
  const fromAddress = smtp.from || smtp.user;
  const from = smtp.fromName ? `"${smtp.fromName}" <${fromAddress}>` : fromAddress;

  const message = {
    from,
    to: normalized.to.join(', '),
    cc: normalized.cc.length ? normalized.cc.join(', ') : undefined,
    bcc: normalized.bcc.length ? normalized.bcc.join(', ') : undefined,
    replyTo: normalized.replyTo || undefined,
    subject: normalized.subject,
    attachments,
    inReplyTo: normalized.inReplyTo || undefined,
    references: normalized.references || undefined,
    headers: {
      // v0.74.1: 显式声明 UTF-8，避免部分 SMTP relay 按系统默认编码导致乱码
      'Content-Type': normalized.isHtml ? 'text/html; charset=UTF-8' : 'text/plain; charset=UTF-8',
    },
    ...(normalized.isHtml ? { html: normalized.body } : { text: normalized.body }),
  };

  const info = await transporter.sendMail(message);
  return {
    info,
    message,
    recipients: normalized.to,
    cc: normalized.cc,
    bcc: normalized.bcc,
    attachments,
  };
}

module.exports = {
  EmailSendError,
  MAX_RECIPIENTS,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  parseRecipients,
  isValidAddress,
  normalizeSendOptions,
  resolveAttachments,
  createTransporter,
  sendEmail,
};
