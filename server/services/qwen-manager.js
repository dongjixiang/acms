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

// 🆕 v0.117：把 chat 流历史拼到 prompt 前（治"自由对话上下文缺失"）
//   根因：Qwen 内部 session 只在同 sessionId（同 userId 持续访问）保留上下文；
//   空闲 30min 后被 reap → sessionId 变 → 上下文丢。ACMS chat_messages 历史从未传给 Qwen，
//   即使 session 重建也看不到之前聊过什么。
//   治本：chat-intent.js 把 loadHistoryForLLM() 返回的 [{role, content}] 数组传进来，
//   拼到当前 user prompt 前，作为"已知对话历史"参考。Qwen 看到全部历史，与 session 机制解耦。
//   限制：HISTORY_LIMIT_FOR_LLM 默认 20 条 ≈ ~6000 tokens，模型上下文窗口内不超限。
function buildHistoryPrompt(historyMessages, currentPrompt) {
  if (!Array.isArray(historyMessages) || historyMessages.length === 0) return currentPrompt;
  const lines = ['[对话历史 — 仅参考上下文，不是新指令]', ''];
  for (const m of historyMessages) {
    const role = m.role === 'assistant' ? '助手' : (m.role === 'user' ? '用户' : (m.role || '?'));
    const content = (m.content || '').toString().trim();
    if (!content) continue;
    // 截断单条过长内容（防意外塞大段 markdown）
    const trimmed = content.length > 1500 ? content.slice(0, 1500) + '…' : content;
    lines.push(`${role}: ${trimmed}`);
  }
  lines.push('', '[当前请求]');
  lines.push(`用户: ${currentPrompt}`);
  return lines.join('\n');
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
      // 🆕 P1 方案B（卡片化）：前端 SSE 工具卡片需要 tool_use_id 与审批列表匹配
      toolUseId: rec.toolCall.tool_use_id,
      input: rec.toolCall.input,
      suggestions: rec.toolCall.permission_suggestions || [],
      // v0.114i: ask_user_question 透传（前端渲染问题表单）
      isUserQuestion: !!rec.toolCall._isUserQuestion,
      questions: rec.toolCall.questions || [],
      createdAt: rec.createdAt,
    });
  }
  return list;
}

// v0.114i: settle 支持 answers（ask_user_question 场景）
//   allowed: boolean | { allowed:boolean, answers:object }
// 🆕 v0.115b: opts.alwaysAllow=true 且决策为 allow → 工具名加入会话自动放行集合
//   （本会话内后续同类操作不再弹审批，直接 allow）
function settleApproval(approvalId, allowed, opts) {
  const rec = pendingApprovals.get(approvalId);
  if (!rec || rec.settled) return false;
  rec.settled = true;
  pendingApprovals.delete(approvalId);
  if (rec.resolve) rec.resolve(allowed);

  // 会话内自动放行记录（仅 ask 模式卡片"全部允许"触发）
  const isAllow = allowed === true || allowed === 'allow'
    || (allowed && typeof allowed === 'object' && (allowed.allowed === true || allowed.allow === true));
  if (opts && opts.alwaysAllow && isAllow) {
    const tname = rec.toolCall && rec.toolCall.tool_name;
    const isUserQ = rec.toolCall && rec.toolCall._isUserQuestion;
    if (tname && !isUserQ) {
      const manager = getManager();
      const sess = manager && manager.findSessionBySessionId ? manager.findSessionBySessionId(rec.sessionId) : null;
      if (sess && sess.autoAllowTools) {
        sess.autoAllowTools.add(tname);
        console.log(`[qwen] [审批] ${tname} → 加入会话自动放行集合 (session=${String(rec.sessionId).slice(0, 8)})`);
      } else {
        console.warn(`[qwen] [审批] 会话 ${String(rec.sessionId).slice(0, 8)} 未找到，无法记录自动放行`);
      }
    }
  }
  return true;
}

// ---------- Manager 单例 ----------
function getManager() {
  if (manager) return manager;
  const { QwenSessionManager } = require('./qwen-worker');
  manager = new QwenSessionManager({
    maxSessions: config.maxSessions,
    idleTimeoutMs: config.idleTimeoutMs,
    // v0.114d: auto 模式也走沙箱策略（跟随 Qwen permission_suggestions，建议 deny 则拒绝），
    //   不再全放行。ask 模式（小吉聊天审批）走 onApprovalRequest，不受此影响。
    onApproval: async (toolCall) => {
      // v0.114i: ask_user_question 在 auto 模式（无前端交互）下无法回答 → 显式 deny
      //   （worker 层会把 allow-无answers 转 deny，这里提前拒绝更清晰）
      if (toolCall && toolCall._isUserQuestion) {
        console.warn('[qwen] [审批] ask_user_question → deny（auto 模式无法回答用户问题）');
        return false;
      }
      const suggs = (toolCall && toolCall.permission_suggestions) || [];
      const hasDeny = suggs.some((s) => s && s.allow === false);
      if (hasDeny) {
        console.warn(`[qwen] [审批] ${toolCall.tool_name} → deny（权限建议 deny）`);
        return false;
      }
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
  // 🆕 v0.117：把 chat 流历史拼到 prompt 前（治"自由对话上下文缺失"）
  //   调用方传 historyMessages（[{role, content}]）→ 内部 buildHistoryPrompt 拼接
  //   不传 / 空数组 → 不拼，保持原行为（小吉 agent-buddy 不需要，已有自己的 session 上下文）
  const finalPrompt = buildHistoryPrompt(opts.historyMessages, prompt);

  const m = getManager();
  const session = await m.getSession(userId, {
    cwd: opts.cwd || undefined,
    modelId: opts.modelId || undefined,
    // B6: 小吉人设（仅新会话注入；已有会话保留原人设）
    // 🆕 workspaceHint（v0.114t）：聊天路径 workspace 映射 —— 追加在当前项目工作区的
    //   指引（项目 slug + 路径）。注意：不是覆盖人设，是拼在人设后面。
    appendSystemPrompt: (opts.appendSystemPrompt !== undefined ? opts.appendSystemPrompt : getPersona())
      + (opts.workspaceHint || ''),
  });

  const askMode = opts.approvalMode === 'ask';
  if (askMode) {
    session.approvalMode = 'ask';
    session.onApprovalRequest = (toolCall, ctx) => {
      // v0.114q: 只读安全工具自动放行（不弹审批框）—— Qwen 调 web_search/fetch_url
      //   等只读工具也弹框等用户点"允许"，不点就 ask 超时 240s 卡死，
      //   表现为"只有工具调用、没有 Agent 回复文本"。只读工具无副作用，直接 allow。
      const tname = (toolCall && toolCall.tool_name) || '';
      // 只读安全前缀/白名单（Qwen CLI 工具 + ACMS MCP 只读工具）
      const isReadOnly = /^(web_search|web_fetch|fetch_url|get_current_time|get_available_models|read|list|search|grep|glob|ls|cat|head|tail|todo_read|agent_read|agent_list|agent_search|agent_git_status|agent_git_log|agent_git_diff|agent_db_query|acms_.*(list|get|read|search|query|status)|mcp__acms__acms_.*(list|get|read|search|query|status))/i.test(tname)
        || (toolCall && Array.isArray(toolCall.permission_suggestions) && toolCall.permission_suggestions.length === 0 && /query|search|read|list|get|status|fetch|check/i.test(tname));
      if (isReadOnly) {
        console.log(`[qwen] [审批] ${tname} → 只读安全工具自动 allow`);
        return Promise.resolve(true);
      }
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

  // v0.114m/0.114q: 透传 onEvent（工具调用事件 → 前端 SSE progress 渲染工具摘要）
  //   v0.114q: 改为设置一次性 onEvent（不复用会话时累积闭包链——旧闭包引用旧 res，
  //   复用会话多次 chat 后链会无限变长且写已结束响应）。保留 manager 默认 eventBus
  //   转发（全局 trace），叠加本次回调。
  if (opts.onEvent) {
    session.onEvent = (evt) => {
      try {
        const eventBus = require('./event-bus');
        eventBus.emit('qwen:event', { actor: {}, payload: evt });
      } catch (e) { /* ignore */ }
      try { opts.onEvent(evt); } catch (e) { /* ignore */ }
    };
  }

  const result = await session.ask(finalPrompt, {
    timeoutMs: opts.timeoutMs || undefined,
    onDelta: opts.onDelta || null,  // B7: 真流式
  });
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

// B6b: 人设读写（admin 可编辑）
function getPersonaForEdit() {
  try {
    const v = readSysConfig(SYSTEM_CFG_PROMPT, '');
    if (v && typeof v === 'string') return { customized: true, persona: v };
  } catch (e) { /* ignore */ }
  return { customized: false, persona: DEFAULT_PERSONA };
}
function setPersona(persona) {
  const p = String(persona || '').trim();
  if (!p) {
    // 清空 → 回默认
    try {
      const { collection } = require('../db/connection');
      const coll = collection('system_configs');
      coll.remove((c) => c.key === SYSTEM_CFG_PROMPT);
    } catch (e) { /* ignore */ }
    return { customized: false, persona: DEFAULT_PERSONA };
  }
  writeSysConfig(SYSTEM_CFG_PROMPT, p);
  return { customized: true, persona: p };
}

module.exports = {
  getManager, chat, getConfig, setConfig,
  listPendingApprovals, settleApproval,
  getPersonaForEdit, setPersona,  // B6b: admin 人设编辑
  buildHistoryPrompt,             // v0.117: 测试用 + 外部直接调用
};
