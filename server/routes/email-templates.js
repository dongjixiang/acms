// ACMS Email Templates API — v0.1
// 自动回复模板管理（CRUD）

const express = require('express');
const router = express.Router();
const { collection } = require('../db/connection');

// GET /api/email-templates — 列出所有模板
router.get('/', (req, res) => {
  try {
    const templatesColl = collection('email_templates');
    const allTemplates = templatesColl.find
      ? templatesColl.find()
      : (templatesColl.all ? templatesColl.all() : []);
    res.json({ ok: true, count: allTemplates.length, templates: allTemplates });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'LIST_TEMPLATES_ERROR' });
  }
});

// POST /api/email-templates — 创建模板
router.post('/', async (req, res) => {
  try {
    const { name, content, description, mailbox } = req.body || {};
    if (!name || !content) {
      return res.status(400).json({ ok: false, error: 'MISSING_FIELDS', message: 'name 和 content 必填' });
    }
    const templateDoc = {
      id: 'tpl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
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

// PUT /api/email-templates/:id — 更新模板
router.put('/:id', async (req, res) => {
  try {
    const { name, content, description } = req.body || {};
    const templatesColl = collection('email_templates');
    const existing = templatesColl.findOne(r => r.id === req.params.id);
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
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

// DELETE /api/email-templates/:id — 删除模板
router.delete('/:id', async (req, res) => {
  try {
    const templatesColl = collection('email_templates');
    const deleted = templatesColl.remove(r => r.id === req.params.id);
    res.json({ ok: true, deleted });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'DELETE_TEMPLATE_ERROR' });
  }
});

module.exports = router;
