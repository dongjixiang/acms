'use strict';

// ACMS 邮件 v2.0 — Account（邮箱凭证）CRUD 路由
// 路由：/api/email-accounts

const express = require('express');
const router = express.Router();
const accountStore = require('../services/email-account-store');
const profileStore = require('../services/email-profile-store');
const pool = require('../services/email-transport-pool');

function err(res, code, msg, status) {
  return res.status(status || 400).json({ ok: false, error: code, message: msg });
}

// GET /api/email-accounts?profile_id=X — 列出某 profile 的账户
router.get('/', (req, res) => {
  try {
    const profileId = req.query.profile_id;
    if (profileId && !profileStore.get(profileId)) {
      return err(res, 'PROFILE_NOT_FOUND', 'profile 不存在', 404);
    }
    res.json({ ok: true, accounts: accountStore.list(profileId) });
  } catch (e) {
    err(res, 'LIST_ACCOUNTS_ERROR', e.message, 500);
  }
});

// POST /api/email-accounts — 创建账户
router.post('/', (req, res) => {
  try {
    const a = accountStore.create(req.body || {});
    res.json({ ok: true, account: a });
  } catch (e) {
    const status = /不完整|不能为空/.test(e.message) ? 400 : 500;
    err(res, 'CREATE_ACCOUNT_ERROR', e.message, status);
  }
});

// GET /api/email-accounts/:id — 单个账户（公开字段）
router.get('/:id', (req, res) => {
  try {
    const a = accountStore.get(req.params.id);
    if (!a) return err(res, 'ACCOUNT_NOT_FOUND', 'account 不存在', 404);
    res.json({ ok: true, account: a });
  } catch (e) {
    err(res, 'GET_ACCOUNT_ERROR', e.message, 500);
  }
});

// PATCH /api/email-accounts/:id — 改字段（凭证如提供则重新加密）
router.patch('/:id', (req, res) => {
  try {
    const a = accountStore.update(req.params.id, req.body || {});
    if (!a) return err(res, 'ACCOUNT_NOT_FOUND', 'account 不存在', 404);
    // 凭证改了 → 让 transporter pool 失效（下次发送时重建）
    if (req.body && (req.body.imap || req.body.smtp)) {
      pool.invalidate(req.params.id);
    }
    res.json({ ok: true, account: a });
  } catch (e) {
    err(res, 'UPDATE_ACCOUNT_ERROR', e.message, 500);
  }
});

// DELETE /api/email-accounts/:id — 删除账户
router.delete('/:id', (req, res) => {
  try {
    const a = accountStore.get(req.params.id);
    if (!a) return err(res, 'ACCOUNT_NOT_FOUND', 'account 不存在', 404);
    pool.invalidate(req.params.id);
    // 同时清理 imap-listener-pool
    try {
      const listenerPool = require('../services/imap-listener-pool');
      listenerPool.removeAccount(req.params.id);
    } catch (_) { /* ignore if pool not ready */ }
    const ok = accountStore.remove(req.params.id);
    res.json({ ok, account_id: req.params.id });
  } catch (e) {
    err(res, 'DELETE_ACCOUNT_ERROR', e.message, 500);
  }
});

// POST /api/email-accounts/:id/test — 测试 IMAP + SMTP 连接
router.post('/:id/test', async (req, res) => {
  const a = accountStore.get(req.params.id);
  if (!a) return err(res, 'ACCOUNT_NOT_FOUND', 'account 不存在', 404);

  const results = { imap: { ok: false }, smtp: { ok: false } };
  let httpStatus = 200;

  // IMAP 测试：用 imap-service connect-and-list
  try {
    const imapService = require('../services/imap-service');
    const dec = accountStore.getDecrypted(req.params.id);
    const svc = imapService.createImapService({
      host: dec.imap.host, port: dec.imap.port, user: dec.imap.user, pass: dec.imap.pass, tls: dec.imap.tls,
    });
    const list = await svc.getMailboxes();
    results.imap = { ok: true, mailboxes: (list || []).length, sample: (list || []).slice(0, 3).map(m => m.name || m.path) };
    try { svc.disconnect && svc.disconnect(); } catch (_) { /* ignore */ }
  } catch (e) {
    results.imap = { ok: false, error: e.message };
    httpStatus = 502;
  }

  // SMTP 测试：verify transporter
  try {
    const tr = await pool.getTransport(req.params.id);
    await tr.verify();
    results.smtp = { ok: true };
  } catch (e) {
    results.smtp = { ok: false, error: e.message };
    httpStatus = 502;
  }

  const allOk = results.imap.ok && results.smtp.ok;
  if (allOk) accountStore.touch(req.params.id);
  res.status(httpStatus).json({ ok: allOk, account_id: req.params.id, ...results });
});

module.exports = router;
