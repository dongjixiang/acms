// ACMS App Tools Registry — v0.66
// 服务端镜像客户端 app-tool 元数据（schema only），实际 handler 在客户端
// 服务端 invoke 通过 WebSocket 路由到客户端，客户端执行后回传结果
//
// 设计要点：
//   - 注册：客户端通过 WS 发送 {type:'app_tools:register', appId, tools:[meta...]}
//   - 调用：tool-registry.execute() 找不到 server tool 时路由到本模块 invokeClientAppTool
//   - 路由：通过 WS 推 {type:'app_tool:invoke', reqId, appId, toolName, args} 给客户端
//   - 返回：客户端发 {type:'app_tool:result', reqId, payload}，本模块 resolve 对应 promise
//   - 超时：默认 30s，可由 toolDef.timeoutMs 覆盖
//   - 单 ws 假设：ACMS 每个浏览器 tab 一个 WS，invoke 推送走"任意 open ws"策略（先到先得）

const pendingInvokes = new Map();  // reqId → {resolve, timer, toolName, appId, ts}
const clientAppTools = new Map();  // appId → [{name, description, parameters, timeoutMs, appId}]
const DEFAULT_TIMEOUT = 30000;

let _wsSender = null;  // 注入：fn(userId, msg) → {ok, ...}

// ── 注册管理 ──
function registerClientAppTools(appId, tools) {
  if (!appId || !Array.isArray(tools)) return { ok: false, error: 'INVALID_ARGS' };
  const valid = tools.filter(t => t && t.name && t.parameters && typeof t.name === 'string');
  if (valid.length === 0) return { ok: false, error: 'NO_VALID_TOOLS' };

  // 同名校验：不同 appId 不能声明同名 tool（避免 LLM 选错）
  for (const t of valid) {
    for (const [otherAppId, otherTools] of clientAppTools.entries()) {
      if (otherAppId === appId) continue;
      if (otherTools.some(x => x.name === t.name)) {
        return {
          ok: false,
          error: 'NAME_CONFLICT',
          message: `Tool ${t.name} 已被 ${otherAppId} 注册，不能再用于 ${appId}`,
        };
      }
    }
  }

  clientAppTools.set(appId, valid.map(t => ({
    appId,
    name: t.name,
    description: t.description || '',
    parameters: t.parameters,
    timeoutMs: t.timeoutMs,
  })));

  console.log(`[AppTools] Registered ${valid.length} tool(s) for ${appId}: ${valid.map(t => t.name).join(', ')}`);
  return { ok: true, count: valid.length };
}

function unregisterClientAppTools(appId) {
  clientAppTools.delete(appId);
  console.log(`[AppTools] Unregistered ${appId}`);
}

// ── 查询 ──
function listAppToolNames() {
  const names = [];
  for (const tools of clientAppTools.values()) {
    for (const t of tools) names.push(t.name);
  }
  return names;
}

function listAppTools() {
  const all = [];
  for (const tools of clientAppTools.values()) all.push(...tools);
  return all;
}

function getAppToolSchema(name) {
  for (const tools of clientAppTools.values()) {
    const t = tools.find(x => x.name === name);
    if (t) return t;
  }
  return null;
}

// ── Invoke（通过 WS 路由到客户端）──
function generateReqId() {
  return 'at_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

async function invokeClientAppTool(name, args, ctx = {}) {
  const schema = getAppToolSchema(name);
  if (!schema) {
    return { ok: false, error: 'TOOL_NOT_FOUND', message: `App-tool ${name} 未注册` };
  }

  const reqId = generateReqId();
  const timeoutMs = schema.timeoutMs || DEFAULT_TIMEOUT;
  const startTs = Date.now();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (pendingInvokes.delete(reqId)) {
        recordCall(name, schema.appId, Date.now() - startTs, 'TIMEOUT');
        resolve({ ok: false, error: 'TIMEOUT', message: `Tool ${name} timed out after ${timeoutMs}ms`, timeoutMs });
      }
    }, timeoutMs);

    pendingInvokes.set(reqId, { resolve, timer, toolName: name, appId: schema.appId, ts: startTs });

    // 推送给 ws 客户端
    const sendResult = _wsSender ? _wsSender(ctx.userId, {
      type: 'app_tool:invoke',
      reqId,
      appId: schema.appId,
      toolName: name,
      args: args || {},
      ctx: { userId: ctx.userId, ts: Date.now() },
    }) : { ok: false, error: 'WS_SENDER_NOT_SET' };

    if (!sendResult.ok) {
      if (pendingInvokes.delete(reqId)) {
        clearTimeout(timer);
        recordCall(name, schema.appId, Date.now() - startTs, sendResult.error || 'CLIENT_OFFLINE');
        resolve({
          ok: false,
          error: sendResult.error || 'CLIENT_OFFLINE',
          message: sendResult.message || 'No WS client to receive invoke',
        });
      }
    } else {
      // 记录成功发起的调用（latency 在 resolveClientResult 时计算）
      // 不在此时调用 recordCall，等客户端回传
    }
  });
}

// ── 客户端回传结果 ──
function resolveClientResult(reqId, payload) {
  const pending = pendingInvokes.get(reqId);
  if (!pending) return false;
  pendingInvokes.delete(reqId);
  clearTimeout(pending.timer);
  const latency = Date.now() - pending.ts;
  // 错误判定：payload.ok === false 或有 error 字段
  const isError = payload && (payload.ok === false || payload.error);
  recordCall(pending.toolName, pending.appId, latency, isError ? (payload.error || 'UNKNOWN_ERROR') : null);
  pending.resolve(payload || { ok: false, error: 'EMPTY_RESULT' });
  return true;
}

// ── WS sender 注入（避免循环依赖）──
function setWsSender(fn) {
  _wsSender = fn;
  if (typeof fn === 'function') console.log('[AppTools] WS sender 已注入');
}

// ── 统计（PR4 完整化）──
const _toolStats = {
  // toolName → { calls, errors, totalLatencyMs, lastCalled, lastError, errorTypes: Map<code, count> }
  perTool: new Map(),
  // 全局 pending（活跃调用）
  pending: 0,
};

// 记录一次调用结果（成功或失败）
function recordCall(name, appId, latencyMs, errorCode) {
  var s = _toolStats.perTool.get(name);
  if (!s) {
    s = {
      appId: appId,
      calls: 0,
      errors: 0,
      totalLatencyMs: 0,
      lastCalled: null,
      lastError: null,
      errorTypes: new Map(),
    };
    _toolStats.perTool.set(name, s);
  }
  s.calls++;
  s.totalLatencyMs += latencyMs || 0;
  s.lastCalled = Date.now();
  if (errorCode) {
    s.errors++;
    s.lastError = { ts: Date.now(), code: errorCode };
    s.errorTypes.set(errorCode, (s.errorTypes.get(errorCode) || 0) + 1);
  }
}

function getStats() {
  var perTool = [];
  for (var [name, s] of _toolStats.perTool) {
    perTool.push({
      name: name,
      appId: s.appId,
      calls: s.calls,
      errors: s.errors,
      errorRate: s.calls > 0 ? +(s.errors / s.calls).toFixed(4) : 0,
      avgLatencyMs: s.calls > 0 ? Math.round(s.totalLatencyMs / s.calls) : 0,
      totalLatencyMs: s.totalLatencyMs,
      lastCalled: s.lastCalled,
      lastError: s.lastError,
      errorTypes: Array.from(s.errorTypes.entries())
        .map(function(e) { return { code: e[0], count: e[1] }; })
        .sort(function(a, b) { return b.count - a.count; }),
    });
  }
  perTool.sort(function(a, b) { return b.calls - a.calls; });

  var totals = {
    totalCalls: perTool.reduce(function(s, t) { return s + t.calls; }, 0),
    totalErrors: perTool.reduce(function(s, t) { return s + t.errors; }, 0),
    pendingInvokes: pendingInvokes.size,
    registeredApps: Array.from(clientAppTools.keys()),
    toolCount: listAppToolNames().length,
  };

  // 全局高频错误聚合（所有 tool 累加）
  var globalErrorTypes = new Map();
  for (var t of perTool) {
    for (var et of t.errorTypes) {
      globalErrorTypes.set(et.code, (globalErrorTypes.get(et.code) || 0) + et.count);
    }
  }
  totals.topErrors = Array.from(globalErrorTypes.entries())
    .map(function(e) { return { code: e[0], count: e[1] }; })
    .sort(function(a, b) { return b.count - a.count; })
    .slice(0, 10);

  return { perTool: perTool, totals: totals };
}

// 重置统计（测试用）
function resetStats() {
  _toolStats.perTool.clear();
  _toolStats.pending = 0;
}

module.exports = {
  registerClientAppTools,
  unregisterClientAppTools,
  listAppToolNames,
  listAppTools,
  getAppToolSchema,
  invokeClientAppTool,
  resolveClientResult,
  setWsSender,
  getStats,
  resetStats,
  recordCall,
  // 测试用
  _pendingInvokes: pendingInvokes,
  _clientAppTools: clientAppTools,
  _toolStats: _toolStats,
};