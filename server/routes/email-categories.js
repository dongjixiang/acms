// ACMS Email Categories — v0.38（用户维护的邮件分类，AI 自动分类依据）
// 路径：server/routes/email-categories.js
//
// 设计：替代硬编码 8 类别（参考 email-classifier.js DEFAULT_CATEGORIES）
// 用户可以自定义分类（增删改），AI 收到新邮件时按用户分类体系分类
// 字段：name（分类名）/ description（描述帮助 AI 理解）/ color（chip 颜色）/ examples（示例邮件）

'use strict';
const express = require('express');
const router = express.Router();
const { collection } = require('../db/connection');

function makeCategoryId() {
  return 'ec_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// GET /api/email-categories?mailbox=INBOX — 列出分类（按 mailbox 隔离 + 全局默认）
router.get('/', (req, res) => {
  try {
    const mailbox = req.query.mailbox || 'INBOX';
    const coll = collection('email_categories');
    const all = coll.find ? coll.find(c => c.mailbox === mailbox || c.mailbox === '*' || !c.mailbox)
                         : (coll.all ? coll.all().filter(c => c.mailbox === mailbox || c.mailbox === '*' || !c.mailbox) : []);
    // 排序：priority 高的在前，name 字母序
    const sorted = all.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0) || String(a.name).localeCompare(String(b.name)));
    res.json({ ok: true, mailbox, count: sorted.length, categories: sorted });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'LIST_CATEGORIES_ERROR' });
  }
});

// POST /api/email-categories — 创建分类（显式确认，防 silent write）
router.post('/', (req, res) => {
  try {
    const { mailbox, name, description, color, examples, priority } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ ok: false, error: 'MISSING_NAME', message: '分类名称必填' });
    }
    const coll = collection('email_categories');
    // 检查重名（同 mailbox 下不能重复）
    const existing = coll.find ? coll.find(c => c.mailbox === (mailbox || 'INBOX') && c.name === String(name).trim())
                              : (coll.all ? coll.all().filter(c => c.mailbox === (mailbox || 'INBOX') && c.name === String(name).trim()) : []);
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: 'DUPLICATE_NAME', message: '同名分类已存在' });
    }
    const doc = {
      id: makeCategoryId(),
      mailbox: mailbox || 'INBOX',
      name: String(name).trim(),
      description: String(description || '').slice(0, 200),
      color: String(color || 'var(--accent1)').slice(0, 50),
      examples: Array.isArray(examples) ? examples.slice(0, 10).map(String) : [],
      priority: Number(priority || 0),
      enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    coll.insert(doc);
    res.json({ ok: true, id: doc.id, category: doc });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'CREATE_CATEGORY_ERROR' });
  }
});

// PATCH /api/email-categories/:id — 更新分类
router.patch('/:id', (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'MISSING_ID' });
    const coll = collection('email_categories');
    const existing = coll.findOne ? coll.findOne(c => c.id === id) : null;
    if (!existing) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    const updates = {};
    ['name', 'description', 'color', 'priority', 'enabled'].forEach(function (k) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });
    if (Array.isArray(req.body.examples)) updates.examples = req.body.examples.slice(0, 10).map(String);
    updates.updated_at = new Date().toISOString();
    // 简化更新（findOne + remove + insert 是 collection() API 的常见模式）
    coll.remove(c => c.id === id);
    coll.insert({ ...existing, ...updates });
    res.json({ ok: true, id: id, updated: { ...existing, ...updates } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'UPDATE_CATEGORY_ERROR' });
  }
});

// DELETE /api/email-categories/:id — 删除分类
router.delete('/:id', (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'MISSING_ID' });
    const coll = collection('email_categories');
    const removed = coll.remove(c => c.id === id);
    res.json({ ok: true, removed: !!removed, id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'DELETE_CATEGORY_ERROR' });
  }
});

// POST /api/email-categories/seed — 种子数据（首次使用时初始化默认分类）
router.post('/seed', (req, res) => {
  try {
    const mailbox = (req.body && req.body.mailbox) || 'INBOX';
    const coll = collection('email_categories');
    const existing = coll.find ? coll.find(c => c.mailbox === mailbox)
                              : (coll.all ? coll.all().filter(c => c.mailbox === mailbox) : []);
    if (existing.length > 0) {
      return res.json({ ok: true, message: '已存在分类，跳过种子', count: existing.length, skipped: true });
    }
    // 默认 8 类别（迁移自 email-classifier.js DEFAULT_CATEGORIES）
    const defaults = [
      { name: '客户咨询', description: '客户询问产品/服务/报价', color: 'var(--green)', priority: 10 },
      { name: '会议邀请', description: '会议邀请、日程安排', color: 'var(--accent1)', priority: 9 },
      { name: '工作协作', description: '团队内部协作、任务分配', color: 'var(--accent2)', priority: 8 },
      { name: '财务发票', description: '发票、收据、付款通知', color: 'var(--yellow)', priority: 7 },
      { name: '营销订阅', description: 'Newsletter、推广邮件', color: 'var(--text3)', priority: 3 },
      { name: '求职招聘', description: '求职、招聘、HR 邮件', color: 'var(--text2)', priority: 6 },
      { name: '自动通知', description: '系统通知、自动化邮件', color: 'var(--text3)', priority: 2 },
      { name: '其他', description: '无法归类的邮件', color: 'var(--text3)', priority: 1 },
    ];
    const inserted = [];
    for (const d of defaults) {
      const doc = {
        id: makeCategoryId(),
        mailbox: mailbox,
        name: d.name,
        description: d.description,
        color: d.color,
        examples: [],
        priority: d.priority,
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_default: true,
      };
      coll.insert(doc);
      inserted.push(doc);
    }
    res.json({ ok: true, mailbox: mailbox, count: inserted.length, categories: inserted });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'SEED_ERROR' });
  }
});

module.exports = router;