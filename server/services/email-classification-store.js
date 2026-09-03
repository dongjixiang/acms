// ACMS Email Classification Store — v1.22（per-email 分类持久化）
// 路径：server/services/email-classification-store.js
//
// 背景：v0.33 借鉴 inbox-zero 用 sender-level cache（同一发件人 = 同一分类），
//   但 ACMS 处理真实工作邮箱，同一发件人可发不同类型邮件（如 sweden@263.net
//   一会发产品报价、一会发供应商大会邀请）。sender-only 假设错了。
//
// 架构（Phase 1）：per-email 优先，sender cache 兜底
//   - collection('email_classifications') — key: (mailbox, uid)
//   - 写入：classifyEmailAndPersist 自动写 per-email（不再写 sender cache）
//   - 读取：loadEmails 后批量 bulkGet 一次 join 邮件列表
//   - chip 渲染：per-email 分类优先 → 没有就 sender cache（chip 加 ~ 后缀表示是发件人默认）
//
// 调用方：
//   - server/services/email-classifier.js classifyEmailAndPersist 写 per-email
//   - server/routes/emails.js GET /email-classifications 提供给前端 join
//   - client/js/views/email-inbox.js refreshEmailClassifications() 拉数据

const { collection } = require('../db/connection');

const COL = 'email_classifications';

function nowIso() { return new Date().toISOString(); }
function makeId(mailbox, uid) {
  return 'ecl_' + mailbox + '_' + uid;
}

/**
 * 取某封邮件的分类
 */
function getByUid(mailbox, uid) {
  if (!mailbox || uid === null || uid === undefined) return null;
  const id = makeId(mailbox, uid);
  const all = collection(COL).all ? collection(COL).all() : [];
  return all.find(d => d.id === id) || null;
}

/**
 * 批量取一组邮件的分类
 * @returns {{ uid: classificationObj }} 缺省 uid 不在返回 map 里
 */
function bulkGetByUids(mailbox, uids) {
  const out = {};
  if (!mailbox || !Array.isArray(uids) || uids.length === 0) return out;
  const all = collection(COL).all ? collection(COL).all() : [];
  const idSet = new Set(uids.map(u => makeId(mailbox, u)));
  for (const d of all) {
    if (idSet.has(d.id)) {
      // d.id 格式 ecl_<mailbox>_<uid>，拆出 uid
      const uid = parseInt(d.id.split('_').pop(), 10);
      out[uid] = {
        category: d.category,
        source: d.source,
        rationale: d.rationale || '',
        classified_at: d.classified_at,
        from: d.from || '',
        subject: d.subject || '',
      };
    }
  }
  return out;
}

/**
 * 列出某 mailbox 下所有 per-email 分类（hashmap: uid → classification）
 */
function listByMailbox(mailbox) {
  const out = {};
  if (!mailbox) return out;
  const all = collection(COL).all ? collection(COL).all() : [];
  const prefix = 'ecl_' + mailbox + '_';
  for (const d of all) {
    if (d.id && d.id.indexOf(prefix) === 0) {
      const uid = parseInt(d.id.slice(prefix.length), 10);
      if (!Number.isNaN(uid)) {
        out[uid] = {
          category: d.category,
          source: d.source,
          rationale: d.rationale || '',
          classified_at: d.classified_at,
          from: d.from || '',
          subject: d.subject || '',
        };
      }
    }
  }
  return out;
}

/**
 * 写某封邮件的分类（upsert）
 */
function setByUid({ mailbox, uid, from, subject, category, source, rationale }) {
  if (!mailbox || !uid || !category) {
    return { ok: false, error: 'MISSING_ARGS', message: 'mailbox / uid / category 必填' };
  }
  const id = makeId(mailbox, uid);
  const now = nowIso();
  const existing = getByUid(mailbox, uid);
  const doc = {
    id,
    mailbox,
    uid,
    from: (from || '').toLowerCase().trim(),
    subject: subject || '',
    category,
    source: source || 'ai',
    rationale: (rationale || '').slice(0, 200),
    classified_at: existing ? now : now,
    updated_at: now,
  };
  if (existing) {
    collection(COL).update(d => d.id === id, doc);
    return { ok: true, action: 'updated' };
  } else {
    collection(COL).insert(doc);
    return { ok: true, action: 'created' };
  }
}

/**
 * 删除某封邮件的分类
 */
function removeByUid(mailbox, uid) {
  if (!mailbox || !uid) return false;
  const id = makeId(mailbox, uid);
  return collection(COL).remove(d => d.id === id);
}

/**
 * 清空某 mailbox 下所有 per-email 分类
 */
function clearByMailbox(mailbox) {
  if (!mailbox) return 0;
  const all = collection(COL).all ? collection(COL).all() : [];
  const prefix = 'ecl_' + mailbox + '_';
  let count = 0;
  all.forEach(function (doc) {
    if (doc.id && doc.id.indexOf(prefix) === 0) {
      collection(COL).remove(d => d.id === doc.id);
      count++;
    }
  });
  return count;
}

/**
 * 清空全部 per-email 分类（数据管理 → 清理发件人分类按钮也要清这个）
 */
function clearAll() {
  const all = collection(COL).all ? collection(COL).all() : [];
  const count = all.length;
  all.forEach(function (doc) {
    collection(COL).remove(d => d.id === doc.id);
  });
  return count;
}

module.exports = {
  getByUid,
  bulkGetByUids,
  listByMailbox,
  setByUid,
  removeByUid,
  clearByMailbox,
  clearAll,
  COL,
  makeId,
};