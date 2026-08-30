// ACMS Email Tone Sampler — v0.31（借鉴 inbox-zero@main reply/sender-reply-examples）
// 路径：server/services/email-tone-sampler.js
//
// 借鉴来源（NOASSERTION license — 重写为 JS，不 copy 源码）：
//   - apps/web/utils/ai/reply/draft-reply.ts line 167-173 senderReplyExamplesContext
//     <sender_reply_examples> 块 — 拉过去该发件人相关回信用来学语气
//     我做了更通用的"用户全局语气"采样（不限发件人 — IMAP Sent folder 全部最近 N 封）
//   - apps/web/utils/llms/types.ts：EmailForLLM 类型（subject/text 字段）
//
// 设计原则：
//   1. 两个函数：
//      buildToneSamplesText(emails) — 纯函数（拼接 XML）
//      sampleUserToneViaImap({mailbox, limit}) — 拉 IMAP + 调 buildToneSamplesText
//   2. 多个 Sent folder 名依次尝试：Sent / Sent Messages / [Gmail]/Sent Mail / 已发送 等
//   3. IMAP 失败不抛错 — 返回空字符串（route 层会捕获，drafter 走默认 system prompt）
//   4. 样本上限：10 封 + 每封 300 字符 — 限制 prompt 长度
//   5. XML 结构 — 跟 inbox-zero prompt 风格一致

const { createImapService } = require('./imap-service');
const config = require('../config');

// 常见 Sent folder 名（不同邮件服务商不同）
const SENT_MAILBOX_CANDIDATES = ['Sent', 'Sent Messages', 'Sent Items', '[Gmail]/Sent Mail', '已发送', '已发邮件'];

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 把已发邮件转换为语气样本字符串（纯函数）
 * @param {Array<{subject?: string, text?: string}>} emails - 已发邮件列表
 * @returns {string} XML 包装的样本字符串；空数组返回空字符串
 */
function buildToneSamplesText(emails) {
  if (!Array.isArray(emails) || emails.length === 0) return '';
  const maxSamples = Math.min(emails.length, 10);
  const samples = [];
  for (let i = 0; i < maxSamples; i++) {
    const e = emails[i] || {};
    const subject = escapeXml(String(e.subject || '').slice(0, 200));
    const body = escapeXml(String(e.text || e.snippet || '').slice(0, 300));
    samples.push('  <sample_' + (i + 1) + '>\n    <subject>' + subject + '</subject>\n    <body>' + body + '</body>\n  </sample_' + (i + 1) + '>');
  }
  return '<user_tone_samples>\n' +
    'Below are recent replies the user sent (from Sent folder). ' +
    'Match this writing style: tone, brevity, greeting/sign-off convention, sentence length, punctuation preference.\n\n' +
    samples.join('\n') + '\n</user_tone_samples>';
}

/**
 * 通过 IMAP 拉取已发邮件箱的最近 N 封，转换为 tone samples
 * @param {Object} opts
 * @param {string} [opts.mailbox] - 已发邮件箱名（不传自动尝试常见名）
 * @param {number} [opts.limit=10] - 拉多少封
 * @returns {Promise<string>} tone samples 字符串；失败返回 ''
 */
async function sampleUserToneViaImap(opts = {}) {
  const limit = opts.limit || 10;
  const smtpCfg = config.smtp || {};
  let imap;
  try {
    imap = createImapService({
      host: config.imapHost || process.env.IMAP_HOST || 'imap.263.net',
      port: config.imapPort || parseInt(process.env.IMAP_PORT || '993'),
      user: smtpCfg.user || '',
      pass: smtpCfg.pass || '',
      tls: config.imapTls !== false,
    });
    await imap.connect();

    // 尝试多个常见 Sent folder 名
    let emails = [];
    const candidates = opts.mailbox ? [opts.mailbox] : SENT_MAILBOX_CANDIDATES;
    for (const mb of candidates) {
      try {
        await imap.openBox(mb);
        const list = await imap.listEmails({ mailbox: mb, limit, offset: 0 });
        emails = list.emails || [];
        if (emails.length > 0) break;
      } catch (_) { /* try next */ }
    }

    try { await imap.disconnect(); } catch (_) { /* ignore */ }
    return buildToneSamplesText(emails);
  } catch (e) {
    try { if (imap) await imap.disconnect(); } catch (_) { /* ignore */ }
    console.warn('[email-tone-sampler] IMAP 采样失败（使用默认 system prompt）:', e.message);
    return '';
  }
}

module.exports = {
  buildToneSamplesText,
  sampleUserToneViaImap,
  SENT_MAILBOX_CANDIDATES,
};
