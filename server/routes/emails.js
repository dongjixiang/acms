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

// DELETE /api/emails/:uid — 删除邮件（mailbox query 参数；uid 支持数字或逗号分隔批量）
router.delete('/:uid', async (req, res) => {
  try {
    const raw = String(req.params.uid || '');
    if (!raw) return res.status(400).json({ error: 'INVALID_UID', message: '邮件编号无效' });
    // 支持批量：uid=123,124,125
    const uids = raw.split(',').map(s => parseInt(s, 10)).filter(n => Number.isFinite(n) && n > 0);
    if (!uids.length) return res.status(400).json({ error: 'INVALID_UID', message: '邮件编号无效' });
    const result = await getImap().deleteMessages(uids, { mailbox: req.query.mailbox || 'INBOX' });
    res.json({ success: true, ...result });
  } catch (error) {
    errorResponse(res, error, 'EMAIL_DELETE_FAILED');
  }
});

// POST /api/emails/:uid/move — 移动邮件到目标文件夹
// body: { to: "目标文件夹名" }
router.post('/:uid/move', async (req, res) => {
  try {
    const raw = String(req.params.uid || '');
    const to = String((req.body && req.body.to) || '').trim();
    if (!raw) return res.status(400).json({ error: 'INVALID_UID', message: '邮件编号无效' });
    if (!to) return res.status(400).json({ error: 'MISSING_TARGET', message: '请提供目标文件夹' });
    const uids = raw.split(',').map(s => parseInt(s, 10)).filter(n => Number.isFinite(n) && n > 0);
    if (!uids.length) return res.status(400).json({ error: 'INVALID_UID', message: '邮件编号无效' });
    const from = String(req.query.mailbox || req.body.from || 'INBOX');
    if (from === to) return res.status(400).json({ error: 'SAME_MAILBOX', message: '源和目标相同' });
    const result = await getImap().moveMessages(uids, from, to);
    res.json({ success: true, ...result });
  } catch (error) {
    errorResponse(res, error, 'EMAIL_MOVE_FAILED');
  }
});

// POST /api/emails/:uid/read — 标记已读/未读
// body: { read: true|false }；read=true 加 \Seen；read=false 去 \Seen
router.post('/:uid/read', async (req, res) => {
  try {
    const raw = String(req.params.uid || '');
    if (!raw) return res.status(400).json({ error: 'INVALID_UID', message: '邮件编号无效' });
    const uids = raw.split(',').map(s => parseInt(s, 10)).filter(n => Number.isFinite(n) && n > 0);
    if (!uids.length) return res.status(400).json({ error: 'INVALID_UID', message: '邮件编号无效' });
    const read = req.body && req.body.read === false ? false : true;
    const result = await getImap().setFlags(uids, ['\\Seen'], {
      mailbox: req.query.mailbox || 'INBOX',
      mode: read ? 'add' : 'remove',
    });
    res.json({ success: true, read, ...result });
  } catch (error) {
    errorResponse(res, error, 'EMAIL_SET_FLAG_FAILED');
  }
});

// v0.30: AI 智能分类（借鉴 elie222/inbox-zero@main ai-categorize-single-sender.ts）
// 设计：static rules first → AI fallback → 防类目扩散 → 全程显式 confidence + source
// body: { from, subject, snippet, categories?, modelId? }
// 返回：{ ok, category, rationale, confidence, source: 'static'|'ai'|'fallback' }
router.post('/classify', async (req, res) => {
  try {
    const { from, subject, snippet, categories, modelId } = req.body || {};
    if (!from && !subject) {
      return res.status(400).json({ ok: false, error: 'MISSING_INPUT', message: 'from 与 subject 不能都为空' });
    }
    const classifier = require('../services/email-classifier');
    const result = await classifier.classifyEmail({ from, subject, snippet, categories, modelId });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// v0.30: AI 草拟回复（借鉴 inbox-zero@main draft-reply.ts 完整 system prompt）
// 设计：用户主动触发 → 输出给弹窗显示 → 用户手动确认填入 composer（绝不自动发）
// body: { from, subject, body, toneHints?, modelId? }
// 返回：{ ok, draft, reason, source: 'ai'|'fallback' }
router.post('/draft-reply', async (req, res) => {
  try {
    const { from, subject, body, toneHints, modelId } = req.body || {};
    if (!from && !subject && !body) {
      return res.status(400).json({ ok: false, error: 'MISSING_INPUT', message: '请提供 from / subject / body 至少一项' });
    }
    const drafter = require('../services/email-drafter');
    const result = await drafter.draftReply({ from, subject, body, toneHints, modelId });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
