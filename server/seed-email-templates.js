// Seed initial email templates on first run
const { collection } = require('./db/connection');

function seedTemplates() {
  try {
    const coll = collection('email_templates');
    const existing = coll.findOne({ name: '客户咨询回复' });
    if (existing) {
      console.log('[email-templates] Templates already seeded, skipping');
      return;
    }
    
    const templates = [
      {
        id: 'tpl_default_001',
        name: '客户咨询回复',
        content: '感谢您的咨询。我们已收到您的报价请求，团队将在24小时内回复您具体方案和报价。如需加急处理，请直接拨打客服热线。',
        description: '标准客户咨询自动回复模板',
        mailbox: 'INBOX',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'tpl_followup_002',
        name: '跟进提醒',
        content: '您好，这是一封跟进邮件。关于您之前的咨询，我们的团队正在处理中，预计将在1-2个工作日内给您详细回复。感谢您的耐心等待。',
        description: '用于跟进未回复客户的自动提醒',
        mailbox: 'INBOX',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'tpl_thanks_003',
        name: '感谢确认',
        content: '感谢您的来信！我们已确认收到您的信息，并将在1-3个工作日内与您联系。如有紧急情况，欢迎随时致电。',
        description: '用于确认收到客户邮件的标准回复',
        mailbox: 'INBOX',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    ];
    
    templates.forEach(t => coll.insert(t));
    console.log('[email-templates] Seeded', templates.length, 'default templates');
  } catch (e) {
    console.error('[email-templates] Seed error:', e.message);
  }
}

module.exports = { seedTemplates };
