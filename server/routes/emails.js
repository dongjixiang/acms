// ACMS · 邮件收件箱 API（v0.73）
const express = require('express');
const router = express.Router();
const { createImapService } = require('../services/imap-service');
const config = require('../config');
const nodemailer = require('nodemailer');

// ── POST /api/emails/send — 发送邮件（不依赖 IMAP 连接）──
router.post('/send', async (req, res) => {
  try {
    const smtp = config.smtp;
    if (!smtp || !smtp.host) {
      return res.status(400).json({ error: 'SMTP_NOT_CONFIGURED', message: '未配置 SMTP' });
    }
    const { to, cc, subject, body, isHtml } = req.body || {};
    if (!to || !to.trim()) return res.status(400).json({ error: 'NO_RECIPIENT', message: '缺少收件人' });
    if (!subject || !subject.trim()) return res.status(400).json({ error: 'NO_SUBJECT', message: '缺少主题' });
    if (!body || !body.trim()) return res.status(400).json({ error: 'NO_BODY', message: '缺少正文' });

    const recipients = to.split(/[;,,、\s]+/).map(s => s.trim()).filter(Boolean);
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    });

    const fromAddr = smtp.fromName
      ? `"${smtp.fromName}" <${smtp.from}>`
      : smtp.from;

    const info = await transporter.sendMail({
      from: fromAddr,
      to: recipients.join(', '),
      cc: cc || undefined,
      subject: String(subject).trim(),
      ...(isHtml ? { html: body } : { text: body }),
    });

    console.log(`[emails.send] 发送成功 → ${recipients.join(', ')} | subject="${subject}"`);
    res.json({ success: true, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected });
  } catch (e) {
    console.error('[emails.send] 发送失败:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 单例 IMAP 服务（从 config.mail 读取 IMAP 配置）
let _imap = null;
function getImap() {
  if (_imap) return _imap;
  const smtpCfg = config.smtp || {};
  // IMAP 通常与 SMTP 同账号密码，host 不同
  _imap = createImapService({
    host: config.imapHost || process.env.IMAP_HOST || 'imap.263.net',
    port: config.imapPort || parseInt(process.env.IMAP_PORT || '993'),
    user: smtpCfg.user || '',
    pass: smtpCfg.pass || '',
    tls: config.imapTls !== false,
  });
  return _imap;
}

// ── 中间件：确保已连接 ──
async function ensureConnected(req, res, next) {
  try {
    const imap = getImap();
    await imap.connect();
    next();
  } catch (e) {
    res.status(503).json({ error: 'IMAP_CONNECT_FAILED', message: e.message });
  }
}
router.use(ensureConnected);

// GET /api/emails/mailboxes — 列出邮箱
router.get('/mailboxes', async (req, res) => {
  try {
    const boxes = await getImap().getMailboxes();
    res.json({ mailboxes: boxes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/emails — 列出邮件
//   mailbox=INBOX  limit=20  offset=0
router.get('/', async (req, res) => {
  try {
    const result = await getImap().listEmails({
      mailbox: req.query.mailbox || 'INBOX',
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/emails/search — 搜索邮件
//   q=关键词  mailbox=INBOX  limit=20
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'MISSING_QUERY' });
    const result = await getImap().searchEmails(q, {
      mailbox: req.query.mailbox || 'INBOX',
      limit: parseInt(req.query.limit) || 20,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/emails/:uid — 邮件详情
router.get('/:uid', async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    if (!uid) return res.status(400).json({ error: 'INVALID_UID' });
    const email = await getImap().getEmail(uid, req.query.mailbox || 'INBOX');
    res.json(email);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/emails/:uid/attachment/:partId — 获取附件
router.get('/:uid/attachment/:partId', async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    const partId = req.params.partId;
    if (!uid || !partId) return res.status(400).json({ error: 'INVALID_PARAMS' });
    const buf = await getImap().getAttachment(uid, partId, req.query.mailbox || 'INBOX');
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', 'attachment');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
