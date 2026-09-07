
const ruleEngine = require('./server/services/email-rule-engine');
const { collection } = require('./server/db/connection');

async function trigger() {
  const rulesColl = collection('email_rules');
  const rules = rulesColl.all ? rulesColl.all().filter(r => r.mailbox === 'INBOX' && r.enabled === true) : [];
  console.log('Found rules:', rules.length);
  for (const r of rules) {
    console.log('Rule:', r.id, '| profile:', r.profile_id, '| actions:', JSON.stringify(r.parsed_actions || r.actions || {}));
  }
  
  // Simulate incoming email matching user's new message
  const mockEmail = {
    from: 'sweden@263.net',
    subject: '我需要你们的最新产品功能介绍和价格清单',
    text: '最新产品功能介绍和价格清单',
    snippet: '功能介绍和价格清单',
    uid: 9999,
    mailbox: 'INBOX',
    messageId: 'manual-trigger-001'
  };
  
  const result = await ruleEngine.processIncomingEmail({ mailbox: 'INBOX', emailData: mockEmail });
  console.log('TRIGGER RESULT:', JSON.stringify(result, null, 2));
  
  // Check drafts after execution
  const draftStore = require('./server/services/email-draft-store');
  const drafts = draftStore ? (draftStore.getAll ? draftStore.getAll() : []) : [];
  console.log('DRAFTS COUNT AFTER TRIGGER:', drafts.length);
  for (const d of drafts.slice(-3)) {
    console.log('DRAFT:', d.id, '| status:', d.status, '| ruleId:', d.ruleId, '| subject:', d.subject);
  }
  
  // Check logs
  const logsColl = collection('email_rule_logs');
  const logs = logsColl.all ? logsColl.all() : [];
  console.log('LOGS COUNT AFTER TRIGGER:', logs.length);
  for (const log of logs.slice(-3)) {
    console.log('LOG:', log.rule_id, '| mailbox:', log.mailbox, '| actions:', JSON.stringify(log.executed_actions || {}));
  }
}

trigger().catch(e => console.error('TRIGGER ERROR:', e.message || e));
