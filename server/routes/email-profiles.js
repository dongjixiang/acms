'use strict';

// ACMS 邮件 v2.0 — Profile（身份）CRUD 路由
// 路由：/api/email-profiles

const express = require('express');
const router = express.Router();
const profileStore = require('../services/email-profile-store');
const accountStore = require('../services/email-account-store');
const pool = require('../services/email-transport-pool');

function err(res, code, msg, status) {
  return res.status(status || 400).json({ ok: false, error: code, message: msg });
}

// GET /api/email-profiles — 列出所有 profile（公开字段，不含 PIN hash）
router.get('/', (req, res) => {
  try {
    res.json({ ok: true, profiles: profileStore.list() });
  } catch (e) {
    err(res, 'LIST_PROFILES_ERROR', e.message, 500);
  }
});

// POST /api/email-profiles — 创建 profile
router.post('/', (req, res) => {
  try {
    const { name, avatar, color, type, pin, settings } = req.body || {};
    const p = profileStore.create({ name, avatar, color, type, pin, settings });
    res.json({ ok: true, profile: p });
  } catch (e) {
    const status = /PIN|name/.test(e.message) ? 400 : 500;
    err(res, 'CREATE_PROFILE_ERROR', e.message, status);
  }
});

// GET /api/email-profiles/:id — 单个 profile
router.get('/:id', (req, res) => {
  try {
    const p = profileStore.get(req.params.id);
    if (!p) return err(res, 'PROFILE_NOT_FOUND', 'profile 不存在', 404);
    res.json({ ok: true, profile: p });
  } catch (e) {
    err(res, 'GET_PROFILE_ERROR', e.message, 500);
  }
});

// PATCH /api/email-profiles/:id — 改 name/avatar/color/type/pin/settings
router.patch('/:id', (req, res) => {
  try {
    const p = profileStore.update(req.params.id, req.body || {});
    if (!p) return err(res, 'PROFILE_NOT_FOUND', 'profile 不存在', 404);
    res.json({ ok: true, profile: p });
  } catch (e) {
    const status = /PIN|name/.test(e.message) ? 400 : 500;
    err(res, 'UPDATE_PROFILE_ERROR', e.message, status);
  }
});

// DELETE /api/email-profiles/:id — 删除 profile（级联删 account + 数据）
router.delete('/:id', (req, res) => {
  try {
    const p = profileStore.get(req.params.id);
    if (!p) return err(res, 'PROFILE_NOT_FOUND', 'profile 不存在', 404);

    // 级联清理：先删 account → 清理 transporter pool
    const accounts = accountStore.list(req.params.id);
    for (const a of accounts) {
      pool.invalidate(a.id);
    }
    accountStore.removeByProfile(req.params.id);

    const ok = profileStore.remove(req.params.id);
    res.json({
      ok,
      removed: { profile_id: req.params.id, accounts: accounts.length },
    });
  } catch (e) {
    err(res, 'DELETE_PROFILE_ERROR', e.message, 500);
  }
});

// POST /api/email-profiles/:id/verify-pin — 验证 PIN，返回短期 unlock token
//   unlock_token = profile_id + timestamp + hmac（存内存，30 分钟有效）
router.post('/:id/verify-pin', (req, res) => {
  try {
    const { pin } = req.body || {};
    if (!profileStore.verifyPin(req.params.id, String(pin || ''))) {
      return err(res, 'PIN_INVALID', 'PIN 错误', 401);
    }
    profileStore.touch(req.params.id);
    // 简化：返回 profile_id 作为 unlock key（前端存 localStorage）
    //   实际"会话"在前端用 lock 计时管理，服务端不做会话（v2.0 简化）
    res.json({
      ok: true,
      profile_id: req.params.id,
      unlock_key: 'unlock_' + req.params.id,
      expires_in: 30 * 60,  // 30 分钟（前端按此倒计时）
    });
  } catch (e) {
    err(res, 'VERIFY_PIN_ERROR', e.message, 500);
  }
});

module.exports = router;
