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

// ── POST /api/emails/send — 发送邮件（v2.0 支持 accountId）──
router.post('/send', async (req, res) => {
  try {
    const body = req.body || {};
    // v2.0: accountId 从 body 抽出来作 dependency，剩下作邮件选项
    const { accountId, ...emailOptions } = body;
    const dependencies = accountId ? { accountId } : undefined;
    const result = await emailSender.sendEmail(emailOptions, dependencies);
    const info = result.info || {};
    console.log(`[emails.send] 发送成功 → ${result.recipients.join(', ')} | subject="${result.message.subject}" | attachments=${result.attachments.length}${accountId ? ' | via account=' + accountId : ''}`);
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
// v0.33: GET /sender-categories?mailbox=INBOX&profile_id=X — 列出已分类发件人（v2.3 加 profile_id 过滤）
router.get('/sender-categories', (req, res) => {
  try {
    const mailbox = req.query.mailbox || 'INBOX';
    const profileId = req.query.profile_id || null;
    const store = require('../services/email-sender-category-store');
    const map = store.listByMailbox(mailbox);
    // v2.3: profile 过滤（无 profile_id 时返所有 — 兼容 legacy；传了则按 sender 的 profile_id 字段过滤）
    const filtered = profileId ? filterSenderCategoriesByProfile(map, profileId) : map;
    res.json({ ok: true, mailbox, profile_id: profileId, count: Object.keys(filtered).length, categories: filtered });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// v2.3: helper — 过滤 sender_categories map（每个 sender → {category, profile_id, ...}）
//   保留有 profile_id 字段且匹配的；无 profile_id 字段的视为 'default'
function filterSenderCategoriesByProfile(map, profileId) {
  if (!map || typeof map !== 'object') return {};
  const out = {};
  for (const sender of Object.keys(map)) {
    const entry = map[sender] || {};
    const entryProfile = entry.profile_id || 'default';
    if (entryProfile === profileId) out[sender] = entry;
  }
  return out;
}
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
// v1.20: POST /api/emails/sender-categories/clear — 清空发件人分类缓存（v2.3 加 profile_id）
router.post('/sender-categories/clear', (req, res) => {
  try {
    const profileId = (req.body && req.body.profile_id) || req.query.profile_id || null;
    const store = require('../services/email-sender-category-store');
    const removed = profileId ? store.clearByProfile(profileId) : store.clearAll();
    console.log('[email-sender-categories] 清空分类缓存（profile=' + (profileId || 'all') + '），移除 ' + removed + ' 条');
    res.json({ ok: true, removed });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'CLEAR_SENDER_CATEGORIES_FAILED' });
  }
});

  // v1.22: per-email 分类（权威）路由组 — 必须放在 GET/DELETE /:uid 之前避免被拦截
  // P58 教训：'/:uid' 是 wildcard 单段匹配，'/email-classifications' 这类静态路径必须先注册
  // v2.3: 加 profile_id 过滤
  router.get('/email-classifications', (req, res) => {
    try {
      const mailbox = req.query.mailbox || 'INBOX';
      const profileId = req.query.profile_id || null;
      const store = require('../services/email-classification-store');
      const all = store.listByMailbox(mailbox);
      // v2.3: 按 profile_id 过滤（无 profile_id 时返所有 — 兼容 legacy）
      const filtered = profileId ? Object.fromEntries(Object.entries(all).filter(function (entry) {
        // 需要从 listByMailbox 结果反查 — 实际 listByMailbox 没带 profile_id
        // 简化：profile_id 模式下走 store 直接过滤
        const all2 = require('../db/connection').collection('email_classifications').all();
        return all2.filter(function (d) {
          return d.mailbox === mailbox && (d.profile_id || 'default') === profileId;
        }).length > 0;
      })) : all;
      res.json({ ok: true, mailbox, profile_id: profileId, count: Object.keys(filtered).length, classifications: filtered });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
  // v1.22: DELETE /api/emails/email-classifications?mailbox=INBOX&uid=xxx — 撤销单封邮件分类（v2.3 加 profile_id）
  router.delete('/email-classifications', (req, res) => {
    try {
      const { mailbox, uid } = req.query;
      if (!mailbox || !uid) return res.status(400).json({ ok: false, error: 'MISSING_ARGS' });
      const profileId = req.query.profile_id;
      const store = require('../services/email-classification-store');
      // v2.3: 按 profile 删 — 跨 profile 不能删（PROFILE_MISMATCH）
      if (profileId) {
        const all = require('../db/connection').collection('email_classifications').all();
        const target = all.find(d => d.mailbox === mailbox && String(d.uid) === String(uid));
        if (target && (target.profile_id || 'default') !== profileId) {
          return res.status(403).json({ ok: false, error: 'PROFILE_MISMATCH', message: '该分类不属于你（profile 不匹配）' });
        }
      }
      const removed = store.removeByUid(mailbox, uid);
      res.json({ ok: true, removed });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
  // v1.22: POST /api/emails/email-classifications/clear — 清空（v2.3 加 profile_id）
  router.post('/email-classifications/clear', (req, res) => {
    try {
      const profileId = (req.body && req.body.profile_id) || req.query.profile_id || null;
      const store = require('../services/email-classification-store');
      const removed = profileId ? store.clearByProfile(profileId) : store.clearAll();
      console.log('[email-classifications] 清空分类缓存（profile=' + (profileId || 'all') + '），移除 ' + removed + ' 条');
      res.json({ ok: true, removed });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
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

// GET /api/emails/mailboxes — 列出邮箱（?force=1 强制重新 LIST，绕过 5min 目录缓存）
router.get('/mailboxes', async (req, res) => {
  try {
    const force = req.query.force === '1' || req.query.force === 'true';
    const boxes = await getImap().getMailboxes(force);
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

// v0.37 + v2.0：启动 IMAP IDLE 实时监听（支持 accountId 多账户）
// 新邮件到达 → 后端规则引擎自动匹配 → 写入执行日志 → 可选通知前端
router.post('/listen/start', async (req, res) => {
  try {
    const mailbox = (req.body && req.body.mailbox) || 'INBOX';
    const accountId = (req.body && req.body.accountId) || null;
    const pool = require('../services/imap-listener-pool');
    const accountStore = require('../services/email-account-store');
    const result = pool.startListening({
      accountId,
      mailbox,
      onEmail: async function (parsed) {
        try {
          // v2.4 修复：imap-service.js 只导出 createImapService 工厂（无 processEmailWithRules 实例方法）
          // → 旧代码 proc 恒 null，规则引擎从未被调用（只有 [listen] 日志，邮件不触发规则/草稿）
          // → 改走 email-imap-rule-integration + 默认账户 imapService 单例（getImap，供 archive/label/move 动作）
          const integration = require('../services/email-imap-rule-integration');
          const result = await integration.processEmailWithRules({
            mailbox: parsed.mailbox || mailbox,
            emailData: parsed,
            modelId: null,
            imapService: getImap(),
          });
          const matched = (result && result.rulesMatchedCount) || 0;
          const executed = (result && result.rulesExecutedCount) || 0;
          console.log('[listen] 新邮件已触发规则匹配 — UID=' + parsed.uid + ' from=' + parsed.from + (accountId ? ' | account=' + accountId : '') + ' | matched=' + matched + ' executed=' + executed);
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

// v0.37 + v2.0：停止 IMAP IDLE 监听（支持 accountId）
router.post('/listen/stop', async (req, res) => {
  try {
    const mailbox = (req.body && req.body.mailbox) || 'INBOX';
    const accountId = (req.body && req.body.accountId) || null;
    const pool = require('../services/imap-listener-pool');
    const result = pool.stopListening({ accountId, mailbox });
    res.json(result);
  } catch (error) {
    errorResponse(res, error, 'LISTEN_STOP_FAILED');
  }
});

// v0.37 + v2.0：列出当前监听（支持 ?account_id=X 过滤）
router.get('/listen/list', async (req, res) => {
  try {
    const pool = require('../services/imap-listener-pool');
    const accountId = req.query.account_id || null;
    res.json(pool.listListening(accountId ? { accountId } : undefined));
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
    const mailbox = req.query.mailbox || 'INBOX';
    // v2.3: 确保 mailbox 传递到 IMAP（防止默认用 'INBOX' 而实际选了不同 mailbox 时 UID 无效）
    const result = await getImap().deleteMessages(uids, { mailbox });
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
