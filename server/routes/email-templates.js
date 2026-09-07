// ACMS Email Templates API — v0.1
// 自动回复模板管理（CRUD）

const express = require('express');
const router = express.Router();
const { collection } = require('../db/connection');

// GET /api/email-templates?profile_id=X — 列出模板（v2.3 加 profile_id 过滤）
router.get('/', (req, res) => {
  try {
    const profileId = req.query.profile_id || null;
    const templatesColl = collection('email_templates');
    const allTemplates = typeof templatesColl.all === 'function' ? templatesColl.all() : [];
    const filtered = profileId
      ? allTemplates.filter(t => t.profile_id === profileId || (!t.profile_id && profileId === 'default'))
      : allTemplates.filter(t => !t.profile_id || t.profile_id === 'default');
    res.json({ ok: true, profile_id: profileId, count: filtered.length, templates: filtered });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'LIST_TEMPLATES_ERROR' });
  }
});

// POST /api/email-templates — 创建模板（v2.3 加 profile_id）
router.post('/', async (req, res) => {
  try {
    const { name, content, description, mailbox } = req.body || {};
    const profileId = (req.body && req.body.profile_id) || req.query.profile_id || 'default';
    if (!name || !content) {
      return res.status(400).json({ ok: false, error: 'MISSING_FIELDS', message: 'name 和 content 必填' });
    }
    const templateDoc = {
      id: 'tpl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      profile_id: profileId,
      name: String(name).trim(),
      content: String(content).trim(),
      description: description ? String(description).trim() : '',
      mailbox: mailbox || 'INBOX',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const templatesColl = collection('email_templates');
    templatesColl.insert(templateDoc);
    res.json({ ok: true, template: templateDoc });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'CREATE_TEMPLATE_ERROR' });
  }
});

// PUT /api/email-templates/:id — 更新模板（v2.3 加 profile_id 所有权检查）
router.put('/:id', async (req, res) => {
  try {
    const { name, content, description } = req.body || {};
    const requestProfileId = (req.body && req.body.profile_id) || req.query.profile_id;
    const templatesColl = collection('email_templates');
    const existing = templatesColl.findOne(r => r.id === req.params.id);
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    }
    if (requestProfileId && existing.profile_id && existing.profile_id !== requestProfileId) {
      return res.status(403).json({ ok: false, error: 'PROFILE_MISMATCH', message: '该模板不属于你（profile 不匹配）' });
    }
    const updated = {
      ...existing,
      name: name !== undefined ? String(name).trim() : existing.name,
      content: content !== undefined ? String(content).trim() : existing.content,
      description: description !== undefined ? String(description).trim() : existing.description,
      updated_at: new Date().toISOString(),
    };
    templatesColl.update(r => r.id === req.params.id, updated);
    res.json({ ok: true, template: updated });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'UPDATE_TEMPLATE_ERROR' });
  }
});

// DELETE /api/email-templates/:id — 删除模板（v2.3 加 profile_id 所有权检查）
router.delete('/:id', async (req, res) => {
  try {
    const requestProfileId = req.query.profile_id;
    const templatesColl = collection('email_templates');
    const existing = templatesColl.findOne(r => r.id === req.params.id);
    if (existing && requestProfileId && existing.profile_id && existing.profile_id !== requestProfileId) {
      return res.status(403).json({ ok: false, error: 'PROFILE_MISMATCH', message: '该模板不属于你（profile 不匹配）' });
    }
    const deleted = templatesColl.remove(r => r.id === req.params.id);
    res.json({ ok: true, deleted });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'DELETE_TEMPLATE_ERROR' });
  }
});

module.exports = router;
