// ACMS Email Listener Integration — v0.37（封装 mail-listener，实现 IMAP IDLE 实时监听）
// 路径：server/services/email-listener-integration.js
//
// 背景：当前 ACMS 规则引擎只能「手动触发」或「轮询」，没有真正的新邮件实时监听
// 集成 mail-listener（GitHub 1k+ stars，IMAP IDLE 事件驱动）实现真正的实时链路：
// 新邮件到达 → 触发 callback → 规则引擎自动匹配 → 执行动作 → 写入日志
//
// 策略：保留现有 imap-service.js API，新增 startListening/stopListening 方法。
// 监听器状态保存在内存中（不持久化），可同时监听多个 mailbox。

const MailListener = require('mail-listener');

/**
 * 创建 IMAP 监听器
 * @param {Object} opts - 配置选项
 * @param {string} opts.user - 邮箱账号
 * @param {string} opts.password - 邮箱密码
 * @param {string} opts.host - IMAP 服务器
 * @param {number} [opts.port=993] - IMAP 端口
 * @param {boolean} [opts.tls=true] - 是否启用 TLS
 * @param {string} [opts.mailbox='INBOX'] - 要监听的邮箱
 * @param {Function} opts.onEmail - 新邮件回调函数 (parsed) => void
 * @param {Function} [opts.onError] - 错误回调函数 (err) => void
 * @returns {Object} MailListener 实例（带 stop 方法）
 */
function createListener(opts) {
  opts = opts || {};
  if (!opts.user || !opts.password) {
    throw new Error('createListener: 缺少 user 或 password');
  }
  if (typeof opts.onEmail !== 'function') {
    throw new Error('createListener: 缺少 onEmail 回调函数');
  }

  const listener = new MailListener({
    username: opts.user,
    password: opts.password,
    host: opts.host || 'imap.263.net',
    port: opts.port || 993,
    tls: opts.tls !== false,
    tlsOptions: { rejectUnauthorized: false },
    mailbox: opts.mailbox || 'INBOX',
    searchFilter: ['UNSEEN'], // 只监听未读邮件（新邮件）
    markSeen: false, // 不自动标记已读（让用户/规则决定）
    fetchOnStart: true, // 启动时拉取一次未读邮件
    attachments: false, // 不下载附件（避免大附件阻塞监听）
    attachmentOptions: { directory: undefined },
  });

  // 新邮件到达事件（IMAP IDLE 触发）
  listener.on('mail', function (mail) {
    try {
      // mail 是 mailparser 解析后的对象（含 subject/from/text/html/attachments）
      // 附加 mailbox 信息供调用方使用
      opts.onEmail({
        subject: mail.subject || '',
        from: mail.from ? (mail.from[0] ? mail.from[0].address : '') : '',
        fromName: mail.from ? (mail.from[0] ? mail.from[0].name : '') : '',
        to: mail.to ? (mail.to[0] ? mail.to[0].address : '') : '',
        date: mail.date ? mail.date.toISOString() : '',
        messageId: mail.messageId || '',
        text: (mail.text || '').slice(0, 2000), // 限制大小避免日志爆炸
        html: (mail.html || '').slice(0, 2000),
        snippet: (mail.text || mail.html || '').replace(/<[^>]+>/g, ' ').slice(0, 500),
        uid: mail.uid || null,
        mailbox: opts.mailbox || 'INBOX',
      });
    } catch (e) {
      console.error('[email-listener-integration] 处理新邮件失败:', e.message);
      if (typeof opts.onError === 'function') opts.onError(e);
    }
  });

  // 错误事件
  listener.on('error', function (err) {
    console.warn('[email-listener-integration] IMAP 监听错误:', err.message);
    if (typeof opts.onError === 'function') opts.onError(err);
  });

  // 服务器就绪事件
  listener.on('server:connected', function () {
    console.log('[email-listener-integration] IMAP 监听器已连接 — ' + (opts.mailbox || 'INBOX'));
  });

  return listener;
}

module.exports = {
  createListener,
};