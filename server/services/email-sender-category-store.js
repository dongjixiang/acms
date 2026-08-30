// ACMS Email Sender Category Store — v0.33（按发件人持久化分类，借鉴 inbox-zero UpsertSenderRecord）
// 路径：server/services/email-sender-category-store.js
//
// 借鉴来源（NOASSERTION license — 重写为 JS，不 copy 源码）：
//   - apps/web/utils/ai/categorize-sender/categorize.ts line 105-117 updateSenderCategory
//     upsertSenderRecord({senderEmail, categoryId, ...})
//     我做更细粒度版（按 sender + mailbox 维度 + 计数 + rationale + 时间戳）
//
// 设计：
//   1. collection('email_sender_categories') — (id, doc) 自动 JSON 存储
//   2. key = (sender_email, mailbox) 唯一 — 同账号同发件人只存一条
//   3. 每次 save 计数 +1 + 更新 last_updated（代表多次确认/重新分类）
//   4. bulkGet({mailbox, senders[]}) 一次性返回 {sender→{category,source,rationale}}
//
// 调用方：
//   - server/services/email-classifier.js classifyEmail 后自动 save（L0）
//   - server/services/email-sender-analyzer.js analyzeSendersBatch 跳过已分类 sender（L2）
//   - routes/emails.js GET /sender-categories 提供给前端列表渲染 chip

const { collection } = require('../db/connection');

const COL = 'email_sender_categories';

function nowIso() { return new Date().toISOString(); }
function makeId() {
  return 'csc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

/**
 * 查找某 (sender, mailbox) 的分类记录
 */
function getBySender(sender, mailbox) {
  if (!sender || !mailbox) return null;
  const target = String(sender).toLowerCase().trim();
  const all = collection(COL).all ? collection(COL).all() : [];
  // collection API 返回 find/findOne — 直接用 findOne
  return collection(COL).findOne(d => d.sender === target && d.mailbox === mailbox) || null;
}

/**
 * 保存/累加某 sender 的分类
 */
function saveCategory({ sender, mailbox, category, source, rationale }) {
  if (!sender || !mailbox || !category) {
    return { ok: false, error: 'MISSING_ARGS', message: 'sender / mailbox / category 必填' };
  }
  const target = String(sender).toLowerCase().trim();
  const now = nowIso();
  const existing = collection(COL).findOne(d => d.sender === target && d.mailbox === mailbox);
  if (existing) {
    collection(COL).update(d => d.sender === target && d.mailbox === mailbox, {
      category, source: source || existing.source, rationale: rationale || existing.rationale,
      count: (existing.count || 1) + 1, last_updated: now,
    });
    return { ok: true, action: 'updated', category, count: (existing.count || 1) + 1 };
  } else {
    collection(COL).insert({
      id: makeId(),
      sender: target, mailbox,
      category, source: source || 'ai', rationale: rationale || '',
      count: 1, first_seen: now, last_updated: now,
    });
    return { ok: true, action: 'created', category, count: 1 };
  }
}

/**
 * 批量查一组 sender 在某 mailbox 下的分类记录
 * 返回 {sender_email_lowercase: {category, source, rationale, count}} 或缺省 {}
 */
function bulkGet(mailbox, senders) {
  const out = {};
  if (!mailbox || !Array.isArray(senders) || senders.length === 0) return out;
  const targets = new Set(senders.map(s => String(s || '').toLowerCase().trim()).filter(Boolean));
  const all = collection(COL).find(d => d.mailbox === mailbox);
  for (const d of all) {
    if (targets.has(d.sender)) {
      out[d.sender] = {
        category: d.category,
        source: d.source,
        rationale: d.rationale,
        count: d.count || 1,
        last_updated: d.last_updated,
      };
    }
  }
  return out;
}

/**
 * 列出某 mailbox 下所有已分类的 sender（hashmap 返回）
 * 给前端 GET /sender-categories 用
 */
function listByMailbox(mailbox) {
  if (!mailbox) return {};
  const all = collection(COL).find(d => d.mailbox === mailbox);
  const out = {};
  for (const d of all) {
    out[d.sender] = {
      category: d.category,
      source: d.source,
      rationale: d.rationale,
      count: d.count || 1,
      last_updated: d.last_updated,
    };
  }
  return out;
}

/**
 * 删除某 sender 的分类记录（撤销分类 — 给未来手动重置用）
 */
function removeBySender(sender, mailbox) {
  if (!sender || !mailbox) return false;
  const target = String(sender).toLowerCase().trim();
  return collection(COL).remove(d => d.sender === target && d.mailbox === mailbox);
}

module.exports = {
  getBySender,
  saveCategory,
  bulkGet,
  listByMailbox,
  removeBySender,
  COL,
};
