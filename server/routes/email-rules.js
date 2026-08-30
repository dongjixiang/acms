// ACMS Email Rules — v0.35（自然语言规则引擎路由，参考 Inbox-Zero plain English rules 模式）
// 路径：server/routes/email-rules.js

'use strict';
const express = require('express');
const router = express.Router();
const parser = require('../services/email-rule-parser');
const { collection } = require('../db/connection');

// 辅助：生成规则 ID
function makeRuleId() {
  return 'er_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// POST /api/email-rules/parse — 解析自然语言规则（不保存，只预览）
// 参考现有 /api/emails/classify 模式（解析后显式确认，不静默写入）
router.post('/parse', async (req, res) => {
  try {
    const { description, mailbox, modelId } = req.body || {};
    if (!description || String(description).trim().length < 3) {
      return res.status(400).json({ ok: false, error: 'MISSING_DESCRIPTION', message: '规则描述至少 3 个字符' });
    }
    const result = await parser.parseRule(String(description).trim(), mailbox || 'INBOX', modelId);
    res.json({ ok: result.ok, parsed: result.parsed, confidence: result.confidence, mailbox: mailbox || 'INBOX', message: result.ok ? '解析成功（请确认后保存）' : (result.error || '解析失败') });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'PARSE_ERROR' });
  }
});

// POST /api/email-rules — 创建规则（解析 + 显式保存，不静默写入，防 P163 silent write）
router.post('/', async (req, res) => {
  try {
    const { description, mailbox, modelId, parsed, enabled = true, priority = 10 } = req.body || {};
    console.log('[email-rules] POST / received:', JSON.stringify({ description: (description||'').slice(0,80), mailbox, hasParsed: !!parsed, parsedKeys: parsed ? Object.keys(parsed) : null }).slice(0, 300));
    if (!description) {
      return res.status(400).json({ ok: false, error: 'MISSING_DESCRIPTION', message: '规则描述必填' });
    }
    let finalParsed = parsed;
    // 如果传入了 parsed（前端已解析预览确认），直接验证；否则重新解析
    if (!finalParsed || typeof finalParsed !== 'object') {
      const parseResult = await parser.parseRule(String(description).trim(), mailbox || 'INBOX', modelId);
      if (!parseResult.ok || !parseResult.parsed) {
        return res.status(400).json({ ok: false, error: 'PARSE_FAILED', message: parseResult.error || '无法解析规则描述' });
      }
      finalParsed = parseResult.parsed;
    }
    // 验证解析结果（防扩散 + 防幻觉）
    const validActions = Object.keys(parser.ALLOWED_ACTIONS);
    const actions = finalParsed.actions || {};
    for (const key of Object.keys(actions)) {
      if (!validActions.includes(key)) {
        return res.status(400).json({ ok: false, error: 'INVALID_ACTION', message: `无效动作: ${key}` });
      }
    }
    // v0.97: reply_template 从 actions 提取到规则级别（每个规则独立配置回复模板）
    const replyTemplate = actions.reply_template || '';
    if (replyTemplate) delete actions.reply_template;  // 从 actions 中移除，提升到规则级
    if (actions.auto_reply === true && !replyTemplate) {
      return res.status(400).json({ ok: false, error: 'AUTO_REPLY_MISSING_TEMPLATE', message: 'auto_reply=true 必须同时提供 reply_template' });
    }
    // 显式保存到 DB（不静默写入，用户点击确认后才到这里）
    const ruleDoc = {
      id: require('../services/email-rule-parser').makeRuleId ? require('../services/email-rule-parser').makeRuleId() : 'er_' + Date.now().toString(36),
      mailbox: mailbox || 'INBOX',
      user_description: String(description).trim(),
      parsed_conditions: finalParsed.conditions || { categories: [], senders: [], keywords: [] },
      parsed_actions: actions,
      reply_template: replyTemplate,  // v0.97: 规则级回复模板
      enabled: Boolean(enabled),
      priority: parseInt(priority, 10) || 10,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source: 'user_config',
    };
    const rulesColl = collection('email_rules');
    rulesColl.insert(ruleDoc);
    console.log('[email-rules] INSERTED rule id=' + ruleDoc.id + ' mailbox=' + ruleDoc.mailbox);
    res.json({ ok: true, rule: ruleDoc, message: '规则已保存（显式确认写入，防 silent write）' });
  } catch (e) {
    console.error('[email-rules] POST / ERROR:', e.stack || e.message);
    res.status(500).json({ ok: false, error: e.message || 'CREATE_RULE_ERROR' });
  }
});

// GET /api/email-rules?mailbox=INBOX — 列出规则
router.get('/', (req, res) => {
  try {
    const mailbox = req.query.mailbox || 'INBOX';
    const rulesColl = collection('email_rules');
    const allRules = rulesColl.find ? rulesColl.find(r => r.mailbox === mailbox) : (rulesColl.all ? rulesColl.all().filter(r => r.mailbox === mailbox) : []);
    // 按优先级降序、创建时间升序
    const sorted = allRules.sort((a, b) => (b.priority || 0) - (a.priority || 0) || new Date(a.created_at) - new Date(b.created_at));
    res.json({ ok: true, mailbox, count: sorted.length, rules: sorted });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'LIST_RULES_ERROR' });
  }
});

// GET /api/email-rules/logs?mailbox=INBOX — 执行日志
router.get('/logs', (req, res) => {
  try {
    const mailbox = req.query.mailbox || 'INBOX';
    const logsColl = collection('email_rule_logs');
    const logs = logsColl.find ? logsColl.find(r => r.mailbox === mailbox) : (logsColl.all ? logsColl.all().filter(r => r.mailbox === mailbox) : []);
    const sorted = logs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)).slice(0, 50);
    res.json({ ok: true, mailbox, count: sorted.length, logs: sorted });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'LIST_LOGS_ERROR' });
  }
});

// POST /api/email-rules/test — 测试规则（用 mock 数据，不触碰真实邮件，防 P164 实踩）
router.post('/test', async (req, res) => {
  try {
    const { description, mailbox, mockEmail } = req.body || {};
    if (!description) return res.status(400).json({ ok: false, error: 'MISSING_DESCRIPTION' });
    // 解析规则
    const parseResult = await parser.parseRule(String(description).trim(), mailbox || 'INBOX');
    if (!parseResult.ok || !parseResult.parsed) {
      return res.status(400).json({ ok: false, message: parseResult.error || '解析失败' });
    }
    // 模拟匹配（用 mock 数据，不操作真实 IMAP，参考 P164 测试 SOP）
    const mockData = mockEmail || { from: 'newsletter@test.com', subject: '测试优惠活动', snippet: '每周精选优惠通知', uid: 'mock-uid-001' };
    // 简单匹配逻辑：检查条件是否与 mock 数据匹配
    const conditions = parseResult.parsed.conditions || {};
    const actions = parseResult.parsed.actions || {};
    const matchedCategories = conditions.categories || [];
    const matchedSenders = (conditions.senders || []).filter(s => String(mockData.from || '').toLowerCase().includes(String(s || '').toLowerCase()));
    const matchedKeywords = (conditions.keywords || []).filter(k => String(mockData.subject || '').toLowerCase().includes(String(k || '').toLowerCase()) || String(mockData.snippet || '').toLowerCase().includes(String(k || '').toLowerCase()));
    const isMatched = matchedCategories.length > 0 || matchedSenders.length > 0 || matchedKeywords.length > 0 || matchedCategories.length === 0; // 如果没有条件则默认匹配
    res.json({
      ok: true,
      message: '测试完成（使用 mock 数据，不操作真实邮件，参考 P164 测试 SOP）',
      mockEmail: mockData,
      parsedRule: parseResult.parsed,
      matchResult: {
        matched: isMatched,
        matchedCategories: matchedCategories,
        matchedSenders: matchedSenders,
        matchedKeywords: matchedKeywords,
        wouldExecuteActions: isMatched ? actions : {},
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'TEST_RULE_ERROR' });
  }
});

// DELETE /api/email-rules/:id
router.delete('/:id', (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'MISSING_ID' });
    const rulesColl = collection('email_rules');
    const removed = rulesColl.findOne ? rulesColl.remove(r => r.id === id) : false;
    res.json({ ok: true, removed: !!removed, id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'DELETE_RULE_ERROR' });
  }
});

module.exports = router;
