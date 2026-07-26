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

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (pendingInvokes.delete(reqId)) {
        resolve({ ok: false, error: 'TIMEOUT', message: `Tool ${name} timed out after ${timeoutMs}ms`, timeoutMs });
      }
    }, timeoutMs);

    pendingInvokes.set(reqId, { resolve, timer, toolName: name, appId: schema.appId, ts: Date.now() });

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
        resolve({
          ok: false,
          error: sendResult.error || 'CLIENT_OFFLINE',
          message: sendResult.message || 'No WS client to receive invoke',
        });
      }
    }
  });
}

// ── 客户端回传结果 ──
function resolveClientResult(reqId, payload) {
  const pending = pendingInvokes.get(reqId);
  if (!pending) return false;
  pendingInvokes.delete(reqId);
  clearTimeout(pending.timer);
  pending.resolve(payload || { ok: false, error: 'EMPTY_RESULT' });
  return true;
}

// ── WS sender 注入（避免循环依赖）──
function setWsSender(fn) {
  _wsSender = fn;
  if (typeof fn === 'function') console.log('[AppTools] WS sender 已注入');
}

// ── 统计（PR4 完整化）──
function getStats() {
  return {
    registeredApps: Array.from(clientAppTools.keys()),
    toolCount: listAppToolNames().length,
    pendingCount: pendingInvokes.size,
    pendingTools: Array.from(pendingInvokes.values()).map(p => ({ tool: p.toolName, ageMs: Date.now() - p.ts })),
  };
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
  // 测试用
  _pendingInvokes: pendingInvokes,
  _clientAppTools: clientAppTools,
};