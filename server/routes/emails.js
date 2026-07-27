'use strict';

// ACMS · 邮件收件箱 API（v0.74）
const express = require('express');
const router = express.Router();
const { createImapService } = require('../services/imap-service');
const emailSender = require('../services/email-sender');
const config = require('../config');

function errorResponse(res, error, fallbackCode) {
  const status = error && error.httpStatus ? error.httpStatus : 500;
  const code = (error && error.code) || fallbackCode || 'EMAIL_ERROR';
  const message = status >= 500 ? `邮件服务失败: ${error.message || '未知错误'}` : error.message;
  return res.status(status).json({ error: code, message });
}

// ── POST /api/emails/send — 发送邮件（不依赖 IMAP 连接）──
router.post('/send', async (req, res) => {
  try {
    const result = await emailSender.sendEmail(req.body || {});
    const info = result.info || {};
    console.log(`[emails.send] 发送成功 → ${result.recipients.join(', ')} | subject="${result.message.subject}" | attachments=${result.attachments.length}`);
    res.json({
      success: true,
      messageId: info.messageId || '',
      accepted: info.accepted || result.recipients,
      rejected: info.rejected || [],
      attachmentNames: result.attachments.map(item => item.filename),
    });
  } catch (error) {
    console.error('[emails.send] 发送失败:', error.message);
    errorResponse(res, error, 'SMTP_SEND_FAILED');
  }
});

// GET /api/emails/account — 只返回前端需要的非敏感账号信息和限制（放在 IMAP 中间件之前避免连接依赖）
router.get('/account', (req, res) => {
  const smtp = config.smtp || {};
  res.json({
    email: smtp.from || smtp.user || '',
    name: smtp.fromName || '',
    configured: Boolean(smtp.host),
    limits: {
      recipients: emailSender.MAX_RECIPIENTS,
      attachments: emailSender.MAX_ATTACHMENTS,
      attachmentBytes: emailSender.MAX_ATTACHMENT_BYTES,
    },
  });
});
// 单例 IMAP 服务（IMAP 通常与 SMTP 共用账号密码）
let _imap = null;
function getImap() {
  if (_imap) return _imap;
  const smtpCfg = config.smtp || {};
  _imap = createImapService({
    host: config.imapHost || process.env.IMAP_HOST || 'imap.263.net',
    port: config.imapPort || parseInt(process.env.IMAP_PORT || '993'),
    user: smtpCfg.user || '',
    pass: smtpCfg.pass || '',
    tls: config.imapTls !== false,
  });
  return _imap;
}

async function ensureConnected(req, res, next) {
  try {
    await getImap().connect();
    next();
  } catch (error) {
    res.status(503).json({ error: 'IMAP_CONNECT_FAILED', message: error.message });
  }
}
router.use(ensureConnected);

// GET /api/emails/mailboxes — 列出邮箱
router.get('/mailboxes', async (req, res) => {
  try {
    const boxes = await getImap().getMailboxes();
    res.json({ mailboxes: boxes });
  } catch (error) {
    errorResponse(res, error, 'MAILBOX_LIST_FAILED');
  }
});

// GET /api/emails — 列出邮件（mailbox=INBOX&limit=30&offset=0）
router.get('/', async (req, res) => {
  try {
    const result = await getImap().listEmails({
      mailbox: req.query.mailbox || 'INBOX',
      limit: Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 100),
      offset: Math.max(parseInt(req.query.offset) || 0, 0),
    });
    res.json(result);
  } catch (error) {
    errorResponse(res, error, 'EMAIL_LIST_FAILED');
  }
});

// GET /api/emails/search — 搜索邮件（q=关键词&mailbox=INBOX&limit=30）
router.get('/search', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return res.status(400).json({ error: 'MISSING_QUERY', message: '请输入搜索关键词' });
    const result = await getImap().searchEmails(query, {
      mailbox: req.query.mailbox || 'INBOX',
      limit: Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 100),
    });
    res.json(result);
  } catch (error) {
    errorResponse(res, error, 'EMAIL_SEARCH_FAILED');
  }
});

// GET /api/emails/:uid — 邮件详情
router.get('/:uid', async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    if (!uid) return res.status(400).json({ error: 'INVALID_UID', message: '邮件编号无效' });
    const email = await getImap().getEmail(uid, req.query.mailbox || 'INBOX');
    res.json(email);
  } catch (error) {
    errorResponse(res, error, 'EMAIL_LOAD_FAILED');
  }
});

// GET /api/emails/:uid/attachment/:partId — 下载附件
router.get('/:uid/attachment/:partId', async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    const partId = String(req.params.partId || '');
    if (!uid || !partId) return res.status(400).json({ error: 'INVALID_PARAMS', message: '附件参数无效' });

    const buffer = await getImap().getAttachment(uid, partId, req.query.mailbox || 'INBOX');
    const requestedType = String(req.query.type || 'application/octet-stream');
    const contentType = /^[\w.+-]+\/[\w.+-]+$/.test(requestedType)
      ? requestedType
      : 'application/octet-stream';
    const filename = String(req.query.name || 'attachment').replace(/[\r\n]/g, '_').slice(0, 240);
    res.type(contentType);
    res.attachment(filename);
    res.send(buffer);
  } catch (error) {
    errorResponse(res, error, 'ATTACHMENT_DOWNLOAD_FAILED');
  }
});

module.exports = router;
