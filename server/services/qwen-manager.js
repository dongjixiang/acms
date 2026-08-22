// ============================================================
// services/qwen-manager.js — Qwen 内核共享单例（Phase B2）
// ============================================================
// 被 routes/qwen.js 和 routes/agent-buddy.js 共同引用。
// 职责：
//   - QwenSessionManager 单例（会话池）
//   - 配置持久化（system_configs）
//   - 审批挂起队列（ask 模式）
// ============================================================
const crypto = require('crypto');

const SYSTEM_CFG_ENABLED = 'qwen_worker_enabled';
const SYSTEM_CFG_MAX = 'qwen_worker_max_sessions';
const SYSTEM_CFG_IDLE = 'qwen_worker_idle_ms';
const SYSTEM_CFG_PROMPT = 'qwen_worker_persona';  // B6: 小吉人设（可覆盖）

// B6: 默认小吉人设（追加到 Qwen Code 工程 prompt 之后）
const DEFAULT_PERSONA = `你是「小吉」，ACMS（智能体协同管理系统）中的 AI 助手，运行在 Qwen Code 内核上。

身份与口吻：
- 用户是多多（产品经理），用平等伙伴口吻交流，称呼"多多"或"伙伴"，不用敬语（别说"您"）。
- 你就是小吉，不要自称 Agnes、Qwen 或其他模型名。

能力：
- 软件工程：读写代码、运行命令、调试、git 操作（Qwen Code 内核原生能力）。
- ACMS 操作：通过 acms_* 工具管理任务/需求/项目/知识库/邮件/工作区文件/网络搜索。
- 需要修改文件或执行命令时，会弹出审批框请用户确认；不要谎称已执行。

风格：
- 用中文回复，简洁清晰，不啰嗦。
- 回答要基于工具返回的真实数据，不要编造。`;

function getPersona() {
  try {
    const v = readSysConfig(SYSTEM_CFG_PROMPT, '');
    if (v && typeof v === 'string' && v.trim()) return v;
  } catch (e) { /* ignore */ }
  return DEFAULT_PERSONA;
}

let config = { enabled: false, maxSessions: 4, idleTimeoutMs: 30 * 60 * 1000 };
let manager = null;

// ---------- 配置持久化 ----------
function readSysConfig(key, fallback) {
  try {
    const { collection } = require('../db/connection');
    const cfg = collection('system_configs').findOne((c) => c.key === key);
    return cfg ? cfg.value : fallback;
  } catch (e) { return fallback; }
}
function writeSysConfig(key, value) {
  try {
    const { collection } = require('../db/connection');
    const coll = collection('system_configs');
    const existing = coll.findOne((c) => c.key === key);
    if (existing) {
      coll.update((c) => c.key === key, { ...existing, value, updated_at: new Date().toISOString() });
    } else {
      coll.insert({ key, value, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
  } catch (e) {
    console.warn('[qwen-manager] writeSysConfig 失败:', e.message);
  }
}
function loadConfigFromDb() {
  try {
    const v = readSysConfig(SYSTEM_CFG_ENABLED, false);
    config.enabled = v === true || v === 'true' || v === 1 || v === '1';
    config.maxSessions = parseInt(readSysConfig(SYSTEM_CFG_MAX, 4), 10) || 4;
    config.idleTimeoutMs = parseInt(readSysConfig(SYSTEM_CFG_IDLE, 30 * 60 * 1000), 10) || 30 * 60 * 1000;
  } catch (e) { /* DB 未就绪 */ }
}
try { loadConfigFromDb(); } catch (e) { /* ignore */ }

// ---------- 审批挂起队列 ----------
// approvalId → { userId, sessionId, toolCall, requestId, createdAt, resolve, settled }
const pendingApprovals = new Map();

function createApprovalRecord(userId, sessionId, toolCall, requestId) {
  const approvalId = 'apv-' + crypto.randomUUID().slice(0, 8);
  const record = {
    approvalId, userId, sessionId, toolCall, requestId, createdAt: Date.now(),
    resolve: null, settled: false,
  };
  pendingApprovals.set(approvalId, record);
  // 5 分钟超时自动拒绝
  setTimeout(() => {
    const rec = pendingApprovals.get(approvalId);
    if (rec && !rec.settled) {
      rec.settled = true;
      pendingApprovals.delete(approvalId);
      if (rec.resolve) rec.resolve(false);
    }
  }, 5 * 60 * 1000).unref();
  return record;
}

function listPendingApprovals(userId) {
  const list = [];
  for (const rec of pendingApprovals.values()) {
    if (rec.settled) continue;
    if (userId && rec.userId !== userId) continue;
    list.push({
      approvalId: rec.approvalId,
      userId: rec.userId,
      toolName: rec.toolCall.tool_name,
      input: rec.toolCall.input,
      suggestions: rec.toolCall.permission_suggestions || [],
      createdAt: rec.createdAt,
    });
  }
  return list;
}

function settleApproval(approvalId, allowed) {
  const rec = pendingApprovals.get(approvalId);
  if (!rec || rec.settled) return false;
  rec.settled = true;
  pendingApprovals.delete(approvalId);
  if (rec.resolve) rec.resolve(allowed);
  return true;
}

// ---------- Manager 单例 ----------
function getManager() {
  if (manager) return manager;
  const { QwenSessionManager } = require('./qwen-worker');
  manager = new QwenSessionManager({
    maxSessions: config.maxSessions,
    idleTimeoutMs: config.idleTimeoutMs,
    onApproval: async (toolCall) => {
      console.log(`[qwen] [审批] ${toolCall.tool_name} → auto allow`);
      return true;
    },
    onEvent: (evt) => {
      try {
        const eventBus = require('./event-bus');
        eventBus.emit('qwen:event', { actor: {}, payload: evt });
      } catch (e) { /* 忽略 */ }
    },
  });
  return manager;
}

// ---------- 对话（ask 模式包装） ----------
/**
 * 用户对话。approvalMode='ask' 时工具审批挂起队列，等外部决策。
 * @returns {Promise<object>} { ok, result, subtype, isError, error, usage, sessionId, approvalCount }
 */
async function chat(userId, prompt, opts = {}) {
  const m = getManager();
  const session = await m.getSession(userId, {
    cwd: opts.cwd || undefined,
    modelId: opts.modelId || undefined,
    // B6: 小吉人设（仅新会话注入；已有会话保留原人设）
    appendSystemPrompt: opts.appendSystemPrompt !== undefined ? opts.appendSystemPrompt : getPersona(),
  });

  const askMode = opts.approvalMode === 'ask';
  if (askMode) {
    session.approvalMode = 'ask';
    session.onApprovalRequest = (toolCall, ctx) => {
      return new Promise((resolve) => {
        const rec = createApprovalRecord(userId, ctx.sessionId, toolCall, ctx.requestId);
        rec.resolve = resolve;
        try {
          const eventBus = require('./event-bus');
          eventBus.emit('qwen:approval', { actor: { id: userId }, payload: { approvalId: rec.approvalId, toolCall } });
        } catch (e) { /* 忽略 */ }
      });
    };
  } else {
    session.approvalMode = 'auto';
    session.onApprovalRequest = null;
  }

  const result = await session.ask(prompt, { timeoutMs: opts.timeoutMs || undefined });
  return {
    ok: !result.is_error,
    subtype: result.subtype,
    result: result.result || '',
    isError: !!result.is_error,
    error: result.error || null,
    usage: result.usage || null,
    numTurns: result.num_turns || 0,
    durationMs: result.duration_ms || 0,
    approvalCount: session.approvalCount,
    sessionId: session.sessionId,
  };
}

function getConfig() { return { ...config }; }
function setConfig(patch) {
  if (typeof patch.enabled === 'boolean') {
    config.enabled = patch.enabled;
    writeSysConfig(SYSTEM_CFG_ENABLED, patch.enabled);
  }
  if (typeof patch.maxSessions === 'number' && patch.maxSessions >= 1 && patch.maxSessions <= 20) {
    config.maxSessions = patch.maxSessions;
    writeSysConfig(SYSTEM_CFG_MAX, patch.maxSessions);
  }
  if (typeof patch.idleTimeoutMs === 'number' && patch.idleTimeoutMs >= 60000) {
    config.idleTimeoutMs = patch.idleTimeoutMs;
    writeSysConfig(SYSTEM_CFG_IDLE, patch.idleTimeoutMs);
  }
  if (manager) {
    manager.maxSessions = config.maxSessions;
    manager.idleTimeoutMs = config.idleTimeoutMs;
  }
  return { ...config };
}

module.exports = {
  getManager, chat, getConfig, setConfig,
  listPendingApprovals, settleApproval,
};
