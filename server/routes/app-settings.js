// ACMS App Settings API — v1.02（用户级应用偏好，按 app_id + key 隔离）
// 路径：server/routes/app-settings.js
//
// 设计：通用 key-value 偏好存储（替代硬编码 fallback 值）
// 用例：邮件 AI 模型选择 / 分类敏感度 / 主题模式 / 显示密度 …
// 字段：app_id（应用 ID） + key（偏好名） + value（任意 JSON-serializable 值）
//
// 注意：暂不按 user_id 隔离（多多环境基本单人；后续接多人时加 user_id 维度即可）

'use strict';
const express = require('express');
const router = express.Router();
const { collection } = require('../db/connection');

// GET /api/app-settings?app_id=email — 拿该 app 全部偏好
router.get('/', (req, res) => {
  try {
    const appId = String(req.query.app_id || '').trim();
    if (!appId) return res.status(400).json({ ok: false, error: 'MISSING_APP_ID', message: 'app_id 必填（query）' });
    const coll = collection('app_settings');
    const all = coll.find
      ? coll.find(c => c.app_id === appId)
      : (coll.all ? coll.all().filter(c => c.app_id === appId) : []);
    // 转成 { [key]: value } 形式方便前端
    const map = {};
    for (const r of all) map[r.key] = r.value;
    res.json({ ok: true, app_id: appId, count: all.length, settings: map, raw: all });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'LIST_SETTINGS_ERROR' });
  }
});

// PUT /api/app-settings/:key?app_id=email  body: { value }
// 更新某个 key 的偏好（upsert：不存在则创建）
router.put('/:key', (req, res) => {
  try {
    const appId = String(req.query.app_id || '').trim();
    const key = String(req.params.key || '').trim();
    if (!appId || !key) return res.status(400).json({ ok: false, error: 'MISSING_FIELDS', message: 'app_id (query) + key (path) 必填' });
    const value = req.body && req.body.value !== undefined ? req.body.value : null;
    const coll = collection('app_settings');
    const existing = coll.find
      ? coll.find(c => c.app_id === appId && c.key === key)
      : (coll.all ? coll.all().filter(c => c.app_id === appId && c.key === key) : []);
    const now = new Date().toISOString();
    if (existing.length > 0) {
      // 更新：remove + insert
      coll.remove(c => c.app_id === appId && c.key === key);
      coll.insert({ app_id: appId, key: key, value: value, updated_at: now });
    } else {
      coll.insert({ app_id: appId, key: key, value: value, created_at: now, updated_at: now });
    }
    res.json({ ok: true, app_id: appId, key: key, value: value, updated_at: now });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'UPSERT_SETTINGS_ERROR' });
  }
});

// POST /api/app-settings/bulk?app_id=email  body: { settings: { k1: v1, k2: v2 } }
// 批量更新 — 前端一次保存多个偏好
router.post('/bulk', (req, res) => {
  try {
    const appId = String(req.query.app_id || '').trim();
    if (!appId) return res.status(400).json({ ok: false, error: 'MISSING_APP_ID' });
    const settings = (req.body && req.body.settings) || {};
    if (typeof settings !== 'object' || Array.isArray(settings)) {
      return res.status(400).json({ ok: false, error: 'INVALID_SETTINGS', message: 'settings 必须是对象' });
    }
    const coll = collection('app_settings');
    const now = new Date().toISOString();
    const results = [];
    for (const k of Object.keys(settings)) {
      coll.remove(c => c.app_id === appId && c.key === k);
      coll.insert({ app_id: appId, key: k, value: settings[k], updated_at: now });
      results.push({ key: k, value: settings[k] });
    }
    res.json({ ok: true, app_id: appId, count: results.length, updated: results });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'BULK_SETTINGS_ERROR' });
  }
});

// DELETE /api/app-settings/:key?app_id=email — 删除某条偏好（恢复默认）
router.delete('/:key', (req, res) => {
  try {
    const appId = String(req.query.app_id || '').trim();
    const key = String(req.params.key || '').trim();
    if (!appId || !key) return res.status(400).json({ ok: false, error: 'MISSING_FIELDS' });
    const coll = collection('app_settings');
    const removed = coll.remove(c => c.app_id === appId && c.key === key);
    res.json({ ok: true, removed: !!removed, app_id: appId, key: key });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'DELETE_SETTINGS_ERROR' });
  }
});

module.exports = router;