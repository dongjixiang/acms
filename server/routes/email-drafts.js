'use strict';

// ACMS Email Drafts API — v1.13（自有草稿箱 REST）
// 路径：server/routes/email-drafts.js
//
// 端点：
//   GET    /api/email-drafts           列出草稿（?status=pending_confirmation / draft / sent）
//   GET    /api/email-drafts/:id       单条草稿详情（含原始邮件 context 字段）
//   POST   /api/email-drafts           新建草稿（manual 源，供用户主动写草稿用）
//   POST   /api/email-drafts/:id/update 编辑草稿（body / subject）
//   POST   /api/email-drafts/:id/send   发送草稿（调 email-sender.sendEmail，成功后 status='sent'）
//   POST   /api/email-drafts/:id/reject 拒绝草稿（auto_reply 待确认时用户点拒绝，status='rejected'）
//   DELETE /api/email-drafts/:id       删除草稿

const express = require('express');
const router = express.Router();
const draftStore = require('../services/email-draft-store');
const emailSender = require('../services/email-sender');

function errorResponse(res, error, fallbackCode) {
  const status = error && error.httpStatus ? error.httpStatus : 500;
  const code = (error && error.code) || fallbackCode || 'DRAFT_ERROR';
  const message = status >= 500 ? `草稿服务失败: ${error.message || '未知错误'}` : error.message;
  return res.status(status).json({ ok: false, error: code, message });
}

// === GET /api/email-drafts — 列出草稿 ===
router.get('/', (req, res) => {
  try {
    const result = draftStore.listDrafts({
      status: req.query.status || undefined,
      source: req.query.source || undefined,
      mailbox: req.query.mailbox || undefined,
      limit: req.query.limit || 200,
      offset: req.query.offset || 0,
    });
    res.json({
      ok: true,
      total: result.total,
      drafts: result.drafts,
      counts: draftStore.countByStatus(),
    });
  } catch (e) {
    errorResponse(res, e, 'LIST_DRAFTS_FAILED');
  }
});

// === GET /api/email-drafts/:id — 单条详情 ===
router.get('/:id', (req, res) => {
  try {
    const draft = draftStore.getDraft(req.params.id);
    if (!draft) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: '草稿不存在' });
    res.json({ ok: true, draft });
  } catch (e) {
    errorResponse(res, e, 'GET_DRAFT_FAILED');
  }
});

// === POST /api/email-drafts — 新建草稿（manual 源） ===
router.post('/', (req, res) => {
  try {
    const body = req.body || {};
    const draft = draftStore.createDraft({
      replyTo: body.to || body.replyTo || '',
      subject: body.subject || '',
      body: body.body || '',
      from: body.from || '',
      originalEmailUid: body.originalEmailUid || null,
      originalMailbox: body.originalMailbox || 'INBOX',
      source: 'manual',
      status: 'draft',
    });
    res.json({ ok: true, draft });
  } catch (e) {
    errorResponse(res, e, 'CREATE_DRAFT_FAILED');
  }
});

// === POST /api/email-drafts/:id/update — 编辑草稿 ===
router.post('/:id/update', (req, res) => {
  try {
    const body = req.body || {};
    const existing = draftStore.getDraft(req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: '草稿不存在' });
    if (existing.status === 'sent') {
      return res.status(409).json({ ok: false, error: 'ALREADY_SENT', message: '已发送的草稿不能编辑' });
    }
    // 只允许编辑这几个字段（其余是规则引擎元数据，不可改）
    const updates = {};
    if (typeof body.subject === 'string') updates.subject = body.subject.trim() || existing.subject;
    if (typeof body.body === 'string') updates.body = body.body;
    if (typeof body.to === 'string' && body.to.trim()) updates.reply_to = body.to.trim();
    if (body.status === 'pending_confirmation' || body.status === 'draft' || body.status === 'discarded') {
      updates.status = body.status;
    }
    const updated = draftStore.updateDraft(req.params.id, updates);
    res.json({ ok: true, draft: updated });
  } catch (e) {
    errorResponse(res, e, 'UPDATE_DRAFT_FAILED');
  }
});

// === POST /api/email-drafts/:id/send — 发送草稿（核心端点） ===
router.post('/:id/send', async (req, res) => {
  try {
    const existing = draftStore.getDraft(req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: '草稿不存在' });
    if (existing.status === 'sent') {
      return res.status(409).json({ ok: false, error: 'ALREADY_SENT', message: '已发送，不能重复发送' });
    }
    if (!existing.reply_to) {
      return res.status(400).json({ ok: false, error: 'NO_RECIPIENT', message: '草稿缺少收件人' });
    }

    // 调用 email-sender 真实发送
    const result = await emailSender.sendEmail({
      to: existing.reply_to,
      subject: existing.subject,
      body: existing.body,
      inReplyTo: existing.in_reply_to || undefined,
      references: existing.references || undefined,
    });

    // 写回 sent 状态
    const sentMessageId = (result && result.info && (result.info.messageId || '')) || '';
    const updated = draftStore.updateDraft(req.params.id, {
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_message_id: sentMessageId,
      error: null,
    });

    console.log(`[email-drafts] sent draft id=${req.params.id} to=${existing.reply_to} subject="${existing.subject}" messageId=${sentMessageId}`);
    res.json({
      ok: true,
      draft: updated,
      sent: {
        messageId: sentMessageId,
        recipients: result.recipients,
      },
    });
  } catch (e) {
    // 发送失败：记录 error 但**不**自动把 status 改 sent（让用户能再编辑重试）
    try {
      draftStore.updateDraft(req.params.id, { error: e.message || String(e) });
    } catch (_) { /* 忽略次要错误 */ }
    console.error(`[email-drafts] send failed id=${req.params.id}:`, e.message);
    errorResponse(res, e, 'SEND_DRAFT_FAILED');
  }
});

// === POST /api/email-drafts/:id/reject — 拒绝草稿（auto_reply 待确认时） ===
router.post('/:id/reject', (req, res) => {
  try {
    const existing = draftStore.getDraft(req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: '草稿不存在' });
    if (existing.status === 'sent') {
      return res.status(409).json({ ok: false, error: 'ALREADY_SENT', message: '已发送，不能拒绝' });
    }
    const reason = (req.body && req.body.reason) || '';
    const updated = draftStore.updateDraft(req.params.id, {
      status: 'rejected',
      error: reason || null,
    });
    res.json({ ok: true, draft: updated });
  } catch (e) {
    errorResponse(res, e, 'REJECT_DRAFT_FAILED');
  }
});

// === DELETE /api/email-drafts/:id — 删除草稿 ===
router.delete('/:id', (req, res) => {
  try {
    const removed = draftStore.deleteDraft(req.params.id);
    if (!removed) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: '草稿不存在' });
    res.json({ ok: true, id: req.params.id });
  } catch (e) {
    errorResponse(res, e, 'DELETE_DRAFT_FAILED');
  }
});

module.exports = router;