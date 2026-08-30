// ACMS Email Parser Integration — v0.37（封装 mailparser，替代自研 RFC2047 / base64 / quoted-printable / charset 解析）
// 路径：server/services/email-parser-integration.js
//
// 背景：imap-service.js 原有 ~150 行自研 MIME 解析代码（decodeMimeWord / decodeBodyBuffer / charsetToString 等）
// 集成 mailparser（Nodemailer 团队维护，Node.js 邮件解析事实标准）替代自研解析。
//
// 策略：保留原有 getEmail API 不变，新增 getEmailParsed 方法让多多对比测试。

const { simpleParser } = require('mailparser');

/**
 * 用 mailparser 解析原始邮件 Buffer，返回标准化的邮件对象
 * @param {Buffer} rawBuffer - IMAP fetch 拿到的原始邮件字节流
 * @returns {Promise<Object>} 解析后的邮件对象（含 subject/from/to/date/text/html/attachments）
 */
async function parseEmailBuffer(rawBuffer) {
  if (!rawBuffer || !Buffer.isBuffer(rawBuffer)) {
    throw new Error('parseEmailBuffer: 缺少原始邮件 Buffer');
  }

  // simpleParser 自动处理 MIME / RFC2047 / base64 / quoted-printable / charset
  const parsed = await simpleParser(rawBuffer, {
    skipImageLinks: false,
    skipTextToHtml: false,
    skipTextFromHtml: false,
  });

  // 附件列表标准化（参考 imap-service.js 原 findAttachments 输出格式）
  const attachments = (parsed.attachments || []).map(function (att, idx) {
    return {
      id: idx,
      name: att.filename || ('attachment-' + idx),
      size: att.size || 0,
      type: att.contentType || 'application/octet-stream',
      // 保留 mailparser 的完整附件对象（含 content Buffer），供下载时直接用
      content: att.content,
      contentDisposition: att.contentDisposition,
      cid: att.cid,
    };
  });

  return {
    subject: parsed.subject || '',
    from: parsed.from ? (parsed.from.text || '') : '',
    to: parsed.to ? (parsed.to.text || '') : '',
    cc: parsed.cc ? (parsed.cc.text || '') : '',
    date: parsed.date ? parsed.date.toISOString() : '',
    messageId: parsed.messageId || '',
    inReplyTo: parsed.inReplyTo || '',
    references: (parsed.references || []).join(' '),
    text: parsed.text || '',
    html: parsed.html || '',
    textAsHtml: parsed.textAsHtml || '',
    attachments: attachments,
    // 高级字段（mailparser 解析的完整结构，供高级场景使用）
    headers: parsed.headers || new Map(),
  };
}

/**
 * 解析 IMAP fetch 拿到的原始邮件源（适用于 mailparser）
 * @param {string|Buffer} rawSource - IMAP 拿到的字符串或 Buffer
 * @returns {Promise<Object>} 解析后的邮件对象
 */
async function parseEmailSource(rawSource) {
  if (!rawSource) {
    throw new Error('parseEmailSource: 缺少原始邮件源');
  }
  const buffer = Buffer.isBuffer(rawSource) ? rawSource : Buffer.from(rawSource, 'utf8');
  return await parseEmailBuffer(buffer);
}

module.exports = {
  parseEmailBuffer,
  parseEmailSource,
};