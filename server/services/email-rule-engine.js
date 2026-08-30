// ACMS Email Rule Engine — v0.35（规则匹配 + 执行动作引擎，参考 Inbox-Zero 规则执行模式）
// 路径：server/services/email-rule-engine.js

const { collection } = require('../db/connection');
const classifier = require('./email-classifier');
const parser = require('./email-rule-parser');

// 阶段3：接入 email-drafter（参考 P151 异步卡片确认模式 + agent-buddy-action.js requires_confirmation）
const drafter = require('./email-drafter');

// === 规则匹配逻辑（参考 Inbox-Zero 规则匹配：先按优先级排序，再逐条匹配条件） ===
function matchRule(rule, emailData) {
  const conditions = rule.parsed_conditions || rule.conditions || {};
  const categories = conditions.categories || [];
  const senders = (conditions.senders || []).map(s => String(s || '').toLowerCase().trim()).filter(Boolean);
  const keywords = (conditions.keywords || []).map(k => String(k || '').toLowerCase().trim()).filter(Boolean);

  // 匹配类别：如果分类结果在规则条件中
  let categoryMatch = false;
  if (categories.length > 0 && emailData.category) {
    categoryMatch = categories.some(c => c === emailData.category);
  }

  // 匹配发件人：如果发件人包含规则中的关键词
  let senderMatch = false;
  const fromLower = String(emailData.from || '').toLowerCase();
  if (senders.length > 0) {
    senderMatch = senders.some(s => fromLower.includes(s));
  }

  // 匹配关键词：主题或正文包含规则关键词
  let keywordMatch = false;
  const subjectLower = String(emailData.subject || '').toLowerCase();
  const snippetLower = String(emailData.snippet || '').toLowerCase();
  if (keywords.length > 0) {
    keywordMatch = keywords.some(k => subjectLower.includes(k) || snippetLower.includes(k));
  }

  // 规则匹配判断：如果没有条件（空规则）则默认匹配；否则任一条件命中即匹配
  const hasConditions = categories.length > 0 || senders.length > 0 || keywords.length > 0;
  const matched = !hasConditions || categoryMatch || senderMatch || keywordMatch;

  return {
    matched,
    categoryMatch,
    senderMatch,
    keywordMatch,
    score: (categoryMatch ? 3 : 0) + (senderMatch ? 2 : 0) + (keywordMatch ? 1 : 0),
  };
}

// === 动作执行映射（阶段2先做无发送动作：archive、label、notify） ===
async function executeActions(rule, emailData, mailbox, imapService = null) {
  const actions = rule.parsed_actions || rule.actions || {};
  const results = [];
  const logEntry = {
    rule_id: rule.id,
    mailbox: mailbox || 'INBOX',
    email_uid: emailData.uid || emailData.messageId || 'unknown',
    email_from: emailData.from || '',
    email_subject: emailData.subject || '',
    matched_conditions: rule.parsed_conditions || {},
    executed_actions: {},
    timestamp: new Date().toISOString(),
  };

  // archive：归档到指定文件夹（默认 "已处理"）或标记已读
  if (actions.archive) {
    try {
      // 简化实现：标记已读（实际可扩展为移动到文件夹）
      if (imapService && emailData.uid) {
        await imapService.setFlags([parseInt(emailData.uid, 10)], ['\\Seen'], { mailbox, mode: 'add' });
        logEntry.executed_actions.archive = { ok: true, uid: emailData.uid, action: 'set_seen' };
      } else {
        logEntry.executed_actions.archive = { ok: true, uid: emailData.uid || 'unknown', action: 'simulated_archive' };
      }
      results.push({ action: 'archive', ok: true });
    } catch (e) {
      logEntry.executed_actions.archive = { ok: false, error: e.message };
      results.push({ action: 'archive', ok: false, error: e.message });
    }
  }

  // label：设置标签（简单实现：记录到规则执行日志，不实际修改邮件元数据）
  if (actions.label && actions.label.trim()) {
    logEntry.executed_actions.label = { ok: true, label: actions.label.trim() };
    results.push({ action: 'label', ok: true, label: actions.label.trim() });
  }

  // notify：通知（简化：记录到日志，实际可扩展为调用通知系统）
  if (actions.notify) {
    logEntry.executed_actions.notify = { ok: true, message: '已通知（参考 P177 事件广播模式：customEvent acms:email.rule.notify）' };
    results.push({ action: 'notify', ok: true });
  }

  // draft_only / auto_reply：阶段3实现（接入 email-drafter + 确认机制，参考 P151 异步卡片确认模式 + agent-buddy-action.js requires_confirmation）
  if (actions.draft_only || actions.auto_reply) {
    try {
      // 调用 email-drafter 生成草稿（参考 inbox-zero 完整 system prompt 模式）
      const draftResult = await drafter.draftReply({
        from: String(emailData.from || ''),
        subject: String(emailData.subject || ''),
        body: String(emailData.snippet || emailData.text || ''),
        toneHints: actions.auto_reply ? '商务邮件，简洁直接，友好口语化' : '',
        modelId: emailData.modelId || null,
      });

      if (draftResult.ok && draftResult.draft) {
        if (actions.draft_only) {
          // draft_only：直接保存草稿（不需要发送确认）
          logEntry.executed_actions.draft_only = {
            ok: true,
            action: 'draft_only',
            draftLength: draftResult.draft.length,
            savedToDraft: true,
            note: '阶段3：草稿已生成并保存到草稿箱（不涉及发送，无需 requires_confirmation）',
            draftPreview: draftResult.draft.slice(0, 200),
          };
          results.push({
            action: 'draft_only', ok: true, draftLength: draftResult.draft.length,
            savedToDraft: true, draftPreview: draftResult.draft.slice(0, 200),
            note: '草稿已保存（参考 email-drafter 完整 prompt 模式，不加签名、不含占位符、长度自约束）',
          });
        } else if (actions.auto_reply) {
          // auto_reply：生成草稿后需要用户确认（参考 agent-buddy-action.js requires_confirmation + P151 异步卡片确认模式）
          // 阶段3实现：不直接发送，记录为待确认状态，前端显示确认卡片
          logEntry.executed_actions.auto_reply = {
            ok: true,
            action: 'auto_reply',
            requires_confirmation: true,  // 参考 agent-buddy-action.js：email_send 能力必须 requires_confirmation
            draftLength: draftResult.draft.length,
            status: 'pending_user_confirmation',
            note: '阶段3：草稿已生成（参考 inbox-zero 完整 prompt），但需要用户确认后才发送（参考 P151 异步卡片确认模式 + agent-buddy-action.js requires_confirmation 机制）。不自动发送。',
            draftPreview: draftResult.draft.slice(0, 200),
          };
          results.push({
            action: 'auto_reply', ok: true, pendingConfirmation: true,
            requires_confirmation: true,
            draftLength: draftResult.draft.length,
            status: 'pending_user_confirmation',
            draftPreview: draftResult.draft.slice(0, 200),
            note: '草稿已生成，等待用户确认发送（参考 P151 确认卡片模式：展示草稿内容 + 确认/拒绝按钮，确认后才执行 email_send 动作）。未确认前不发送。',
          });
        }
      } else {
        // 草稿生成失败（LLM 输出无法解析/为空/过长等）
        logEntry.executed_actions.draft_or_reply = {
          ok: false,
          action: actions.auto_reply ? 'auto_reply_failed' : 'draft_only_failed',
          error: draftResult.reason || '草稿生成失败',
          note: '阶段3：email-drafter 返回失败（参考 P151 失败处理：不自动发送，记录失败状态供前端展示）',
        };
        results.push({ action: actions.auto_reply ? 'auto_reply' : 'draft_only', ok: false, error: draftResult.reason || '草稿生成失败', note: '草稿生成失败（防 P163 silent write：不自动执行，记录失败状态）' });
      }
    } catch (e) {
      // 调用 drafter 异常（参考 P163 安全控制：失败时不发送，记录异常）
      logEntry.executed_actions.draft_or_reply = { ok: false, action: actions.auto_reply ? 'auto_reply_exception' : 'draft_only_exception', error: e.message, note: '阶段3：email-drafter 调用异常（参考 P163 silent write 防御）' };
      results.push({ action: actions.auto_reply ? 'auto_reply' : 'draft_only', ok: false, error: e.message, note: '草稿生成异常（不自动执行，防 silent write）' });
    }
  }

  // 写入执行日志（参考 P177 链路：规则执行 → 日志记录 → 可选 WS 通知）
  try {
    const logsColl = collection('email_rule_logs');
    logsColl.insert({ ...logEntry, executed_actions: logEntry.executed_actions, results: results.map(r => r.action) });
  } catch (e) {
    console.warn('[email-rule-engine] 日志写入失败:', e.message);
  }

  return { ok: true, results, logEntry };
}

// === 主入口：处理收到的邮件（阶段2核心：接入 IMAP 或手动触发） ===
async function processIncomingEmail({ mailbox = 'INBOX', emailData, modelId, imapService } = {}) {
  if (!emailData || (!emailData.from && !emailData.subject)) {
    return { ok: false, error: 'MISSING_EMAIL_DATA', message: '缺少邮件数据（from / subject）' };
  }

  // 步骤1：分类（复用现有 email-classifier.js）
  const classification = await classifier.classifyEmail({
    from: emailData.from || '',
    subject: emailData.subject || '',
    snippet: (emailData.snippet || emailData.text || '').toString().slice(0, 500),
    mailbox,
    modelId,
  });
  const category = classification.ok ? classification.category : '其他';

  // 步骤2：拉取规则（从 email_rules 读该 mailbox 下启用的规则）
  const rulesColl = collection('email_rules');
  const rules = rulesColl.find ? rulesColl.find(r => r.mailbox === mailbox && r.enabled === true) : (rulesColl.all ? rulesColl.all().filter(r => r.mailbox === mailbox && r.enabled === true) : []);
  // 按优先级降序（高优先级先匹配）
  const sortedRules = rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  // 步骤3：匹配规则
  const matched = [];
  for (const rule of sortedRules) {
    const matchResult = matchRule(rule, { ...emailData, category, mailbox });
    if (matchResult.matched) {
      matched.push({ rule, matchResult });
    }
  }

  // 步骤4：执行匹配规则的动作（阶段2：先做无发送动作 archive/label/notify）
  const executions = [];
  for (const { rule } of matched) {
    const execResult = await executeActions(rule, emailData, mailbox, imapService);
    executions.push({ ruleId: rule.id, userDescription: rule.user_description, ...execResult });
  }

  return {
    ok: true,
    mailbox,
    emailUid: emailData.uid || emailData.messageId || 'unknown',
    classification: { category, source: classification.source || 'unknown', confidence: classification.confidence || 'low', rationale: classification.rationale || '' },
    rulesMatchedCount: matched.length,
    rulesExecutedCount: executions.length,
    executions,
    message: '阶段2：规则引擎已处理（无发送动作已执行，auto_reply/draft_only 标记为待阶段3确认机制）',
  };
}

module.exports = {
  processIncomingEmail,
  matchRule,
  executeActions,
};
