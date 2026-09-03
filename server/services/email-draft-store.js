'use strict';

// ACMS Email Draft Store — v1.13（自有草稿箱 CRUD）
// 路径：server/services/email-draft-store.js
//
// 用途：
//   - 规则引擎 draft_only / auto_reply 动作生成的草稿写到这（替换原本「内存飘字符串」的反模式）
//   - 用户在 ACMS 邮件 UI 的「📝 草稿箱」视图集中查看 / 编辑 / 发送 / 删除
//   - 完全不依赖邮箱 IMAP Drafts 文件夹（按多多决定：A 方案）
//
// Schema：
//   {
//     id: 'draft_<timestamp36>_<random>',         // 唯一 ID
//     original_email_uid: '邮件 UID（INBOX 里原邮件）' | null, // 触发草稿的原始邮件
//     original_mailbox: 'INBOX',                  // 原始邮件所在 mailbox
//     from: '收件人（也就是发送时 from，反过来）', // NOTE：邮箱 user 视角，草稿 to = 原邮件 from
//     reply_to: '原邮件 from',                    // 实际回复目标
//     subject: '草稿主题（默认 Re: <原主题>）',
//     body: '草稿正文（email-drafter LLM 输出）',
//     status: 'draft' | 'pending_confirmation' | 'sent' | 'rejected' | 'discarded',
//     source: 'auto_reply' | 'draft_only' | 'manual',  // 来源：规则引擎自动 / 用户手动
//     rule_id: 'rule_xxx' | null,                 // 触发的规则 ID（auto_reply 时必填）
//     rule_description: '自然语言规则描述',
//     tone: '商务邮件...' | null,                  // drafter 的 toneHints（auto_reply 时记录）
//     model_id: '模型 ID' | null,
//     in_reply_to: '<原邮件 messageId>',           // 发送时设 In-Reply-To 头，保留线程
//     references: '<原邮件 references>',          // RFC 5322 链式引用
//     draft_length: 0,                            // 草稿字符数（方便 UI 预览截断）
//     draft_preview: '...前 200 字符...',           // 列表里卡片预览
//     created_at: 'ISO 时间',
//     updated_at: 'ISO 时间',
//     sent_at: 'ISO 时间' | null,                  // 实际发送时间
//     sent_message_id: '<SMTP messageId>' | null, // 发送成功的 SMTP messageId
//     error: '错误信息' | null,                    // 发送失败时记录
//   }

const { collection } = require('../db/connection');

const COLL_NAME = 'email_drafts';

const VALID_STATUSES = ['draft', 'pending_confirmation', 'sent', 'rejected', 'discarded'];
const VALID_SOURCES = ['auto_reply', 'draft_only', 'manual'];

function genId() {
  return 'draft_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// === 创建草稿 ===
// opts: {
//   originalEmailUid, originalMailbox,
//   replyTo (string, required), subject (string, required), body (string, required),
//   source ('auto_reply' | 'draft_only' | 'manual', default 'manual'),
//   status (default 'draft'),
//   ruleId, ruleDescription, tone, modelId,
//   inReplyTo, references,
// }
function createDraft(opts) {
  const body = String((opts && opts.body) || '');
  const subject = String((opts && opts.subject) || '').trim() || '(无主题)';
  const replyTo = String((opts && opts.replyTo) || '').trim();
  if (!body) throw new Error('body 不能为空');
  if (!replyTo) throw new Error('replyTo 不能为空（草稿必须知道回复给谁）');

  const source = (opts && opts.source) || 'manual';
  if (!VALID_SOURCES.includes(source)) throw new Error(`无效 source: ${source}`);
  const status = (opts && opts.status) || 'draft';
  if (!VALID_STATUSES.includes(status)) throw new Error(`无效 status: ${status}`);

  const now = new Date().toISOString();
  const doc = {
    id: genId(),
    original_email_uid: (opts && opts.originalEmailUid) || null,
    original_mailbox: (opts && opts.originalMailbox) || 'INBOX',
    from: (opts && opts.from) || '',  // 草稿 to（=原邮件 from，邮箱用户视角）
    reply_to: replyTo,
    subject: subject,
    body: body,
    status: status,
    source: source,
    rule_id: (opts && opts.ruleId) || null,
    rule_description: (opts && opts.ruleDescription) || '',
    tone: (opts && opts.tone) || '',
    model_id: (opts && opts.modelId) || null,
    in_reply_to: (opts && opts.inReplyTo) || '',
    references: (opts && opts.references) || '',
    draft_length: body.length,
    draft_preview: body.slice(0, 200),
    created_at: now,
    updated_at: now,
    sent_at: null,
    sent_message_id: null,
    error: null,
  };
  const coll = collection(COLL_NAME);
  coll.insert(doc);
  return doc;
}

// === 读取单条草稿 ===
function getDraft(id) {
  const coll = collection(COLL_NAME);
  return coll.findOne ? coll.findOne(d => d.id === id) : coll.all().find(d => d.id === id);
}

// === 列出草稿 ===
// opts: { status?, source?, mailbox?, limit?, offset? }
function listDrafts(opts) {
  opts = opts || {};
  const coll = collection(COLL_NAME);
  let all = coll.all ? coll.all() : (coll.find ? coll.find(() => true) : []);
  if (opts.status) all = all.filter(d => d.status === opts.status);
  if (opts.source) all = all.filter(d => d.source === opts.source);
  if (opts.mailbox) all = all.filter(d => d.original_mailbox === opts.mailbox);
  // 按 updated_at 倒序（最近编辑的在前）
  all.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const limit = Number(opts.limit) || 200;
  const offset = Number(opts.offset) || 0;
  return {
    total: all.length,
    drafts: all.slice(offset, offset + limit),
  };
}

// === 更新草稿（编辑 / 状态变更 / 发送结果记录） ===
function updateDraft(id, updates) {
  const coll = collection(COLL_NAME);
  const existing = getDraft(id);
  if (!existing) return null;
  const updated = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
  };
  // body 长度 / 预览 自动同步
  if (typeof updates.body === 'string') {
    updated.draft_length = updates.body.length;
    updated.draft_preview = updates.body.slice(0, 200);
  }
  coll.update(d => d.id === id, updated);
  return updated;
}

// === 删除草稿 ===
function deleteDraft(id) {
  const coll = collection(COLL_NAME);
  return coll.remove(d => d.id === id);
}

// === 统计（按状态） ===
function countByStatus() {
  const coll = collection(COLL_NAME);
  const all = coll.all ? coll.all() : (coll.find ? coll.find(() => true) : []);
  const counts = {};
  for (const d of all) {
    counts[d.status || 'draft'] = (counts[d.status || 'draft'] || 0) + 1;
  }
  return counts;
}

module.exports = {
  COLL_NAME,
  VALID_STATUSES,
  VALID_SOURCES,
  createDraft,
  getDraft,
  listDrafts,
  updateDraft,
  deleteDraft,
  countByStatus,
};