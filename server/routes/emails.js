'use strict';

// ACMS · 邮件收件箱 API（v0.74）
const express = require('express');
const router = express.Router();
const { createImapService } = require('../services/imap-service');
const emailSender = require('../services/email-sender');
const config = require('../config');

function errorResponse(res, error, fallbackCode) {
  const status = error && error.httpStatus ? error.httpStatus : 500;
  const code = (error && error.code) || fallbackCode || 'EMAIL_ERROR';
  const message = status >= 500 ? `邮件服务失败: ${error.message || '未知错误'}` : error.message;
  return res.status(status).json({ error: code, message });
}

// ── POST /api/emails/send — 发送邮件（不依赖 IMAP 连接）──
router.post('/send', async (req, res) => {
  try {
    const result = await emailSender.sendEmail(req.body || {});
    const info = result.info || {};
    console.log(`[emails.send] 发送成功 → ${result.recipients.join(', ')} | subject="${result.message.subject}" | attachments=${result.attachments.length}`);
    res.json({
      success: true,
      messageId: info.messageId || '',
      accepted: info.accepted || result.recipients,
      rejected: info.rejected || [],
      attachmentNames: result.attachments.map(item => item.filename),
    });
  } catch (error) {
    console.error('[emails.send] 发送失败:', error.message);
    errorResponse(res, error, 'SMTP_SEND_FAILED');
  }
});

// GET /api/emails/account — 只返回前端需要的非敏感账号信息和限制（放在 IMAP 中间件之前避免连接依赖）
router.get('/account', (req, res) => {
  const smtp = config.smtp || {};
  res.json({
    email: smtp.from || smtp.user || '',
    name: smtp.fromName || '',
    configured: Boolean(smtp.host),
    limits: {
      recipients: emailSender.MAX_RECIPIENTS,
      attachments: emailSender.MAX_ATTACHMENTS,
      attachmentBytes: emailSender.MAX_ATTACHMENT_BYTES,
    },
  });
});
// 单例 IMAP 服务（IMAP 通常与 SMTP 共用账号密码）
let _imap = null;
function getImap() {
  if (_imap) return _imap;
  const smtpCfg = config.smtp || {};
  _imap = createImapService({
    host: config.imapHost || process.env.IMAP_HOST || 'imap.263.net',
    port: config.imapPort || parseInt(process.env.IMAP_PORT || '993'),
    user: smtpCfg.user || '',
    pass: smtpCfg.pass || '',
    tls: config.imapTls !== false,
  });
  return _imap;
}

async function ensureConnected(req, res, next) {
  try {
    await getImap().connect();
    next();
  } catch (error) {
    res.status(503).json({ error: 'IMAP_CONNECT_FAILED', message: error.message });
  }
}
router.use(ensureConnected);

// 静态路由必须在动态路由（/:uid）之前注册，否则 /sender-categories 会被 :uid=NaN 拦截
// v0.33: GET /sender-categories?mailbox=INBOX — 一次性拉所有已分类发件人
router.get('/sender-categories', (req, res) => {
  try {
    const mailbox = req.query.mailbox || 'INBOX';
    const store = require('../services/email-sender-category-store');
    const map = store.listByMailbox(mailbox);
    res.json({ ok: true, mailbox, count: Object.keys(map).length, categories: map });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
// v0.33: DELETE /sender-categories?mailbox=INBOX&sender=xxx — 撤销分类
router.delete('/sender-categories', (req, res) => {
  try {
    const { sender, mailbox } = req.query;
    if (!sender || !mailbox) return res.status(400).json({ ok: false, error: 'MISSING_ARGS' });
    const store = require('../services/email-sender-category-store');
    const removed = store.removeBySender(sender, mailbox);
    res.json({ ok: true, removed });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
// v1.20: POST /api/emails/sender-categories/clear — 清空全部发件人分类缓存
router.post('/sender-categories/clear', (req, res) => {
  try {
    const store = require('../services/email-sender-category-store');
    const removed = store.clearAll();
    console.log('[email-sender-categories] 清空全部分类缓存，移除 ' + removed + ' 条');
    res.json({ ok: true, removed });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'CLEAR_SENDER_CATEGORIES_FAILED' });
  }
});
  // v1.22: POST /api/emails/email-classifications/clear — 清空全部单封邮件分类缓存
  router.post('/email-classifications/clear', (req, res) => {
  try {
    const store = require('../services/email-classification-store');
    const removed = store.clearAll();
    console.log('[email-classifications] 清空全部分类缓存，移除 ' + removed + ' 条');
    res.json({ ok: true, removed });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'CLEAR_EMAIL_CLASSIFICATIONS_FAILED' });
  }
});
// v0.30: 批量分析发件人
router.post('/analyze-senders', async (req, res) => {
  try {
    const { mailbox = 'INBOX', maxSenders = 20, modelId } = req.body || {};
    const analyzer = require('../services/email-sender-analyzer');
    const result = await analyzer.analyzeSendersBatch({ mailbox, maxSenders, modelId });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/emails/mailboxes — 列出邮箱
router.get('/mailboxes', async (req, res) => {
  try {
    const boxes = await getImap().getMailboxes();
    res.json({ mailboxes: boxes });
  } catch (error) {
    errorResponse(res, error, 'MAILBOX_LIST_FAILED');
  }
});

// GET /api/emails — 列出邮件（mailbox=INBOX&limit=30&offset=0）
router.get('/', async (req, res) => {
  try {
    const result = await getImap().listEmails({
      mailbox: req.query.mailbox || 'INBOX',
      limit: Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 100),
      offset: Math.max(parseInt(req.query.offset) || 0, 0),
    });
    res.json(result);
  } catch (error) {
    errorResponse(res, error, 'EMAIL_LIST_FAILED');
  }
});

// GET /api/emails/search — 搜索邮件（q=关键词&mailbox=INBOX&limit=30）
router.get('/search', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return res.status(400).json({ error: 'MISSING_QUERY', message: '请输入搜索关键词' });
    const result = await getImap().searchEmails(query, {
      mailbox: req.query.mailbox || 'INBOX',
      limit: Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 100),
    });
    res.json(result);
  } catch (error) {
    errorResponse(res, error, 'EMAIL_SEARCH_FAILED');
  }
});

// GET /api/emails/:uid — 邮件详情
router.get('/:uid', async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    if (!uid) return res.status(400).json({ error: 'INVALID_UID', message: '邮件编号无效' });
    const email = await getImap().getEmail(uid, req.query.mailbox || 'INBOX');
    res.json(email);
  } catch (error) {
    errorResponse(res, error, 'EMAIL_LOAD_FAILED');
  }
});

// v0.37: 用 mailparser 解析邮件（推荐 2 集成 — 参考集成决策矩阵 Tier 1-推荐2）
// 与 /:uid 区别：用 mailparser 替代自研 ~150 行 MIME 解析，更标准化、支持更多边界 case
router.get('/:uid/parsed', async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    if (!uid) return res.status(400).json({ ok: false, error: 'INVALID_UID', message: '邮件编号无效' });
    const result = await getImap().getEmailParsed(uid, req.query.mailbox || 'INBOX');
    res.json(result);
  } catch (error) {
    errorResponse(res, error, 'EMAIL_PARSED_FAILED');
  }
});

// v0.37: 启动 IMAP IDLE 实时监听（推荐 1 集成 — 参考集成决策矩阵 Tier 1-推荐1）
// 新邮件到达 → 后端规则引擎自动匹配 → 写入执行日志 → 可选通知前端
router.post('/listen/start', async (req, res) => {
  try {
    const mailbox = (req.body && req.body.mailbox) || 'INBOX';
    const imap = getImap();
    const result = imap.startListening({
      mailbox: mailbox,
      // 当调用方没传 user/password/host 时，startListening 内部会自动从当前 IMAP 服务提取
      onEmail: async function (parsed) {
        // 新邮件到达 → 触发规则引擎（参考 P177 事件广播链路）
        try {
          await imap.processEmailWithRules(parsed, { mailbox: parsed.mailbox });
          console.log('[listen] 新邮件已触发规则匹配 — UID=' + parsed.uid + ' from=' + parsed.from);
        } catch (e) {
          console.warn('[listen] 规则处理异常:', e.message);
        }
      },
      onError: function (err) {
        console.warn('[listen] 监听错误:', err.message);
      },
    });
    res.json(result);
  } catch (error) {
    errorResponse(res, error, 'LISTEN_START_FAILED');
  }
});

// v0.37: 停止 IMAP IDLE 监听
router.post('/listen/stop', async (req, res) => {
  try {
    const mailbox = (req.body && req.body.mailbox) || 'INBOX';
    const result = getImap().stopListening(mailbox);
    res.json(result);
  } catch (error) {
    errorResponse(res, error, 'LISTEN_STOP_FAILED');
  }
});

// v0.37: 列出当前正在监听的 mailbox
router.get('/listen/list', async (req, res) => {
  try {
    res.json(getImap().listListening());
  } catch (error) {
    errorResponse(res, error, 'LISTEN_LIST_FAILED');
  }
});

// GET /api/emails/:uid/attachment/:partId — 下载附件
router.get('/:uid/attachment/:partId', async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    const partId = String(req.params.partId || '');
    if (!uid || !partId) return res.status(400).json({ error: 'INVALID_PARAMS', message: '附件参数无效' });

    const buffer = await getImap().getAttachment(uid, partId, req.query.mailbox || 'INBOX');
    const requestedType = String(req.query.type || 'application/octet-stream');
    const contentType = /^[\w.+-]+\/[\w.+-]+$/.test(requestedType)
      ? requestedType
      : 'application/octet-stream';
    const filename = String(req.query.name || 'attachment').replace(/[\r\n]/g, '_').slice(0, 240);
    res.type(contentType);
    res.attachment(filename);
    res.send(buffer);
  } catch (error) {
    errorResponse(res, error, 'ATTACHMENT_DOWNLOAD_FAILED');
  }
});

// DELETE /api/emails/:uid — 删除邮件（mailbox query 参数；uid 支持数字或逗号分隔批量）
router.delete('/:uid', async (req, res) => {
  try {
    const raw = String(req.params.uid || '');
    if (!raw) return res.status(400).json({ error: 'INVALID_UID', message: '邮件编号无效' });
    // 支持批量：uid=123,124,125
    const uids = raw.split(',').map(s => parseInt(s, 10)).filter(n => Number.isFinite(n) && n > 0);
    if (!uids.length) return res.status(400).json({ error: 'INVALID_UID', message: '邮件编号无效' });
    const result = await getImap().deleteMessages(uids, { mailbox: req.query.mailbox || 'INBOX' });
    res.json({ success: true, ...result });
  } catch (error) {
    errorResponse(res, error, 'EMAIL_DELETE_FAILED');
  }
});

// POST /api/emails/:uid/move — 移动邮件到目标文件夹
// body: { to: "目标文件夹名" }
router.post('/:uid/move', async (req, res) => {
  try {
    const raw = String(req.params.uid || '');
    const to = String((req.body && req.body.to) || '').trim();
    if (!raw) return res.status(400).json({ error: 'INVALID_UID', message: '邮件编号无效' });
    if (!to) return res.status(400).json({ error: 'MISSING_TARGET', message: '请提供目标文件夹' });
    const uids = raw.split(',').map(s => parseInt(s, 10)).filter(n => Number.isFinite(n) && n > 0);
    if (!uids.length) return res.status(400).json({ error: 'INVALID_UID', message: '邮件编号无效' });
    const from = String(req.query.mailbox || req.body.from || 'INBOX');
    if (from === to) return res.status(400).json({ error: 'SAME_MAILBOX', message: '源和目标相同' });
    const result = await getImap().moveMessages(uids, from, to);
    res.json({ success: true, ...result });
  } catch (error) {
    errorResponse(res, error, 'EMAIL_MOVE_FAILED');
  }
});

// POST /api/emails/:uid/read — 标记已读/未读
// body: { read: true|false }；read=true 加 \Seen；read=false 去 \Seen
router.post('/:uid/read', async (req, res) => {
  try {
    const raw = String(req.params.uid || '');
    if (!raw) return res.status(400).json({ error: 'INVALID_UID', message: '邮件编号无效' });
    const uids = raw.split(',').map(s => parseInt(s, 10)).filter(n => Number.isFinite(n) && n > 0);
    if (!uids.length) return res.status(400).json({ error: 'INVALID_UID', message: '邮件编号无效' });
    const read = req.body && req.body.read === false ? false : true;
    const result = await getImap().setFlags(uids, ['\\Seen'], {
      mailbox: req.query.mailbox || 'INBOX',
      mode: read ? 'add' : 'remove',
    });
    res.json({ success: true, read, ...result });
  } catch (error) {
    errorResponse(res, error, 'EMAIL_SET_FLAG_FAILED');
  }
});

  // v0.30: AI 智能分类（借鉴 inbox-zero@main ai-categorize-single-sender.ts）
  // v0.33: 持久化版 — 分类结果自动写 store，下次同发件人直接命中
  // v1.22: 接受 uid — 写 per-email（per-email 优先 → sender cache 兜底）
  router.post('/classify', async (req, res) => {
  try {
    const { from, subject, snippet, categories, modelId, mailbox, uid } = req.body || {};
    if (!from && !subject) {
      return res.status(400).json({ ok: false, error: 'MISSING_INPUT', message: 'from 与 subject 不能都为空' });
    }
    const classifier = require('../services/email-classifier');
    // 用 classifyEmailAndPersist — 内部调 classifyEmail + 自动写 store
    //   uid 存在 → 写 per-email（v1.22）；uid 缺失 → 写 sender cache（向后兼容）
    const result = mailbox
      ? await classifier.classifyEmailAndPersist({ from, mailbox, uid, subject, snippet, categories, modelId })
      : await classifier.classifyEmail({ from, subject, snippet, categories, modelId });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

  // v1.22: GET /api/emails/email-classifications?mailbox=INBOX — 列出某 mailbox 下所有 per-email 分类
//   前端 loadEmails 后调用一次 → state.emailClassifications[uid] 用于 chip 渲染
//   可选参数 uids=1,2,3 — 只取指定 uid（避免拉全集）
router.get('/email-classifications', (req, res) => {
  try {
    const mailbox = req.query.mailbox || 'INBOX';
    const store = require('../services/email-classification-store');
    let map;
    if (req.query.uids) {
      const uids = String(req.query.uids).split(',').map(function (s) { return parseInt(s.trim(), 10); }).filter(function (n) { return !Number.isNaN(n); });
      map = store.bulkGetByUids(mailbox, uids);
    } else {
      map = store.listByMailbox(mailbox);
    }
    res.json({ ok: true, mailbox, count: Object.keys(map).length, classifications: map });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
  // v1.22: DELETE /api/emails/email-classifications?mailbox=INBOX&uid=xxx — 撤销单封邮件分类
router.delete('/email-classifications', (req, res) => {
  try {
    const { mailbox, uid } = req.query;
    if (!mailbox || !uid) return res.status(400).json({ ok: false, error: 'MISSING_ARGS' });
    const store = require('../services/email-classification-store');
    const ok = store.removeByUid(mailbox, parseInt(uid, 10));
    res.json({ ok, removed: ok });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


// 设计：用户主动触发 → 输出给弹窗显示 → 用户手动确认填入 composer（绝不自动发）
// body: { from, subject, body, toneHints?, modelId? }
// 返回：{ ok, draft, reason, source: 'ai'|'fallback' }
router.post('/draft-reply', async (req, res) => {
  try {
    const { from, subject, body, toneHints, modelId, skip_tone_sample, previousDraft, retryHint } = req.body || {};
    if (!from && !subject && !body) {
      return res.status(400).json({ ok: false, error: 'MISSING_INPUT', message: '请提供 from / subject / body 至少一项' });
    }
    const drafter = require('../services/email-drafter');
    // v0.31: 自动从 IMAP Sent folder 拉用户历史回复作为语气样本（借鉴 inbox-zero）
    let toneSamples = '';
    if (!skip_tone_sample) {
      try {
        const toneSampler = require('../services/email-tone-sampler');
        toneSamples = await toneSampler.sampleUserToneViaImap({ limit: 10 });
      } catch (e) {
        console.warn('[emails.draft-reply] tone sample 失败（fallback）:', e.message);
      }
    }
    // v0.32: 重新生成时把上一版草稿 + 用户修改意见传给 LLM 避免重复
    const result = await drafter.draftReply({ from, subject, body, toneHints, toneSamples, previousDraft, retryHint, modelId });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
