// ACMS Email — 规则引擎接入 IMAP 流程（阶段2接入点）
// 当 IMAP 获取到新邮件时，调用规则引擎处理（参考 P177 链路：IMAP → 分类 → 规则匹配 → 执行动作 → 日志）

const emailRuleEngine = require('./email-rule-engine');

// 接入点：在 IMAP 获取到邮件列表/详情后，触发规则处理
// 参考 imap-service.js 的 listEmails / getEmail 流程，在获取邮件数据后调用
async function processEmailWithRules({ mailbox = 'INBOX', emailData, modelId, imapService }) {
  // 阶段2：接入规则引擎处理新收到的邮件
  // 实际使用场景：IMAP 收到新邮件 → 调用此函数 → 规则引擎自动匹配执行
  try {
    const result = await emailRuleEngine.processIncomingEmail({
      mailbox,
      emailData,
      modelId,
      imapService,
    });
    return result;
  } catch (e) {
    console.error('[email-imap-rule-integration] 规则处理失败:', e.message);
    return { ok: false, error: 'RULE_ENGINE_ERROR', message: e.message };
  }
}

// 批量处理：对 IMAP 获取到的邮件列表逐条应用规则（参考 P177 批量处理模式）
async function processEmailBatchWithRules({ mailbox = 'INBOX', emails = [], modelId, imapService }) {
  const results = [];
  for (const email of emails) {
    const result = await processEmailWithRules({ mailbox, emailData: email, modelId, imapService });
    results.push({ uid: email.uid || email.messageId, mailbox, ...result });
  }
  return {
    ok: true,
    processedCount: results.length,
    matchedRulesCount: results.filter(r => r.rulesMatchedCount > 0).length,
    executedActionsCount: results.filter(r => r.rulesExecutedCount > 0).length,
    results,
  };
}

module.exports = {
  processEmailWithRules,
  processEmailBatchWithRules,
};
