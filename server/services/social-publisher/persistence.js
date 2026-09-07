// ACMS social-publisher — 持久化层（v0.118 PR 5-5）
// 路径：server/services/social-publisher/persistence.js
//
// 2 个 collection（落 SQLite，重启不丢）：
//   - social_approval_sessions  审批会话（含决策、edit 内容、created_at、resolved_at）
//   - social_task_history       发布历史（post_url / 步骤截图 / 完整结果）
//
// 跟 PR 2 内存版区别：
//   - approval.js 的 PENDING_APPROVALS 仍走内存（实时性 + 跨实例不要求一致）
//   - 决策落地 / 历史落地走 SQLite（重启不丢 + 跨实例一致）
//
// 用法：
//   const p = require('./persistence');
//   p.recordApproval({approval_id, decision, content, edited, platform, account_id});
//   p.recordTaskHistory({task_id, platform, account_id, title, content, result});
//   p.listApprovalHistory({platform, account_id, limit});

'use strict';

const { collection } = require('../../db/connection');

const APPROVAL_COLL = 'social_approval_sessions';
const HISTORY_COLL = 'social_task_history';

function makeId() {
  return 'spp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

// ── 记录审批决策 ──
function recordApproval({ approval_id, decision, content, edited, platform, account_id, task_id, reviewer = 'user' }) {
  if (!approval_id || !decision) return { ok: false, error: 'missing approval_id or decision' };
  const now = new Date().toISOString();
  const record = {
    id: makeId(),
    approval_id,
    task_id: task_id || null,
    platform: platform || null,
    account_id: account_id || null,
    decision,
    content: content ? String(content).slice(0, 1000) : null,  // 截断防止大对象
    edited: edited ? JSON.stringify(edited) : null,
    reviewer,
    created_at: now,
    resolved_at: now,
  };
  try {
    collection(APPROVAL_COLL).insert(record);
    return { ok: true, id: record.id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function listApprovalHistory({ platform, account_id, decision, limit = 100 } = {}) {
  try {
    let docs = collection(APPROVAL_COLL).all();
    if (platform) docs = docs.filter(d => d.platform === platform);
    if (account_id) docs = docs.filter(d => d.account_id === account_id);
    if (decision) docs = docs.filter(d => d.decision === decision);
    docs.sort((a, b) => (b.resolved_at || '').localeCompare(a.resolved_at || ''));
    return docs.slice(0, limit);
  } catch {
    return [];
  }
}

// ── 记录发布历史 ──
function recordTaskHistory({ task_id, platform, account_id, title, content, result }) {
  if (!task_id || !platform) return { ok: false, error: 'missing task_id or platform' };
  const now = new Date().toISOString();
  const record = {
    id: makeId(),
    task_id,
    platform,
    account_id: account_id || null,
    title: title ? String(title).slice(0, 200) : null,
    content: content ? String(content).slice(0, 2000) : null,
    ok: !!(result?.ok),
    post_url: result?.post_url || null,
    post_id: result?.post_id || null,
    media_id: result?.media_id || null,
    total_elapsed_ms: result?.total_elapsed_ms || null,
    error: result?.error || null,
    steps: result?.steps ? JSON.stringify(result.steps.slice(0, 20)) : null,
    sub_results: result?.sub_results ? JSON.stringify(result.sub_results) : null,
    completed_at: now,
  };
  try {
    collection(HISTORY_COLL).insert(record);
    return { ok: true, id: record.id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function listTaskHistory({ platform, account_id, ok, limit = 200 } = {}) {
  try {
    let docs = collection(HISTORY_COLL).all();
    if (platform) docs = docs.filter(d => d.platform === platform);
    if (account_id) docs = docs.filter(d => d.account_id === account_id);
    if (ok !== undefined) docs = docs.filter(d => !!d.ok === !!ok);
    docs.sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
    return docs.slice(0, limit).map(d => ({
      ...d,
      steps: d.steps ? JSON.parse(d.steps) : null,
      sub_results: d.sub_results ? JSON.parse(d.sub_results) : null,
    }));
  } catch {
    return [];
  }
}

function getTaskHistory(id) {
  try {
    const doc = collection(HISTORY_COLL).findOne(d => d.id === id);
    if (!doc) return null;
    return {
      ...doc,
      steps: doc.steps ? JSON.parse(doc.steps) : null,
      sub_results: doc.sub_results ? JSON.parse(doc.sub_results) : null,
    };
  } catch {
    return null;
  }
}

module.exports = {
  recordApproval,
  listApprovalHistory,
  recordTaskHistory,
  listTaskHistory,
  getTaskHistory,
  APPROVAL_COLL,
  HISTORY_COLL,
};
