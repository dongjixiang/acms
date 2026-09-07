// ACMS social-publisher — approval.js
// =====================================
// 关键操作前 SSE 推 confirm 弹窗
// 跟 browser-agent v0.2 request_user_help 模式同构（P177 教训链路）
//
// 链路：
//   provider step 调用 approval.request({title, content, preview_screenshot})
//   → SSE broadcast('approval:request', {...})
//   → 前端内容运营平台监听 → 弹 confirm 弹窗
//   → 用户点"批准/编辑/取消"
//   → POST /api/social-publisher/approval/:id/respond
//   → approval 模块 resolve promise → step 继续执行
//
// PR 2 实现：基础 SSE 通道 + request/respond
// PR 3 增强：UI 弹窗 + 决策按钮 + 编辑模式

'use strict';

// 简单 ID 生成（避免引入 uuid 依赖）
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 内存 Map：approval_id → {resolve, reject, info}
// 跟 browser-agent session-store 同寿命（重启丢，PR 5 加持久化）
const PENDING_APPROVALS = new Map();

// SSE 客户端列表（content 运营台浮窗订阅）
const SSE_CLIENTS = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of SSE_CLIENTS) {
    try {
      client.write(payload);
    } catch (e) {
      // 死连接，下次清理
      SSE_CLIENTS.delete(client);
    }
  }
}

// ── 订阅 SSE 事件流 ──
function subscribe(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  SSE_CLIENTS.add(res);

  // 30s 心跳（防连接超时）
  const heartbeat = setInterval(() => {
    try {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    } catch (e) {
      clearInterval(heartbeat);
      SSE_CLIENTS.delete(res);
    }
  }, 30000);

  // 客户端断开清理
  res.on('close', () => {
    clearInterval(heartbeat);
    SSE_CLIENTS.delete(res);
  });

  return res;
}

// ── 请求审批 ──
function request({ title, content, preview_screenshot = null, timeout = 300000, platform, account_id }) {
  const approval_id = 'apr-' + genId();
  const created_at = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (PENDING_APPROVALS.has(approval_id)) {
        PENDING_APPROVALS.delete(approval_id);
        broadcast('approval:timeout', { approval_id });
        reject(new Error('approval_timeout'));
      }
    }, timeout);

    PENDING_APPROVALS.set(approval_id, {
      resolve: (decision) => {
        clearTimeout(timer);
        PENDING_APPROVALS.delete(approval_id);
        resolve(decision);
      },
      reject: (err) => {
        clearTimeout(timer);
        PENDING_APPROVALS.delete(approval_id);
        reject(err);
      },
      info: { title, content, preview_screenshot, platform, account_id, created_at },
    });

    // 推给前端
    broadcast('approval:request', {
      approval_id,
      title,
      content,
      preview_screenshot,
      platform,
      account_id,
      created_at,
      timeout_ms: timeout,
    });
  });
}

// ── 用户回复 ──
function respond(approval_id, decision) {
  // decision: {decision: 'approve'|'edit'|'cancel', edited?: {...}}
  const pending = PENDING_APPROVALS.get(approval_id);
  if (!pending) {
    return { ok: false, error: 'approval_not_found_or_resolved' };
  }
  if (!['approve', 'edit', 'cancel', 'reject'].includes(decision.decision)) {
    return { ok: false, error: 'invalid_decision' };
  }

  // v0.118 PR 5-5: 落 SQLite 持久化
  try {
    const persistence = require('./persistence');
    persistence.recordApproval({
      approval_id,
      decision: decision.decision,
      content: pending.info.content,
      edited: decision.edited,
      platform: pending.info.platform,
      account_id: pending.info.account_id,
      reviewer: 'user',
    });
  } catch (e) { /* 持久化失败不影响主流程 */ }

  broadcast('approval:resolved', { approval_id, decision: decision.decision });
  pending.resolve(decision);
  return { ok: true, approval_id, decision: decision.decision };
}

// ── 列出待审批（前端兜底用）──
function listPending() {
  return Array.from(PENDING_APPROVALS.entries()).map(([id, p]) => ({
    approval_id: id,
    ...p.info,
  }));
}

module.exports = {
  request,
  respond,
  subscribe,
  listPending,
  PENDING_APPROVALS,
  SSE_CLIENTS,
};
