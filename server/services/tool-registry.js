// ACMS Tool Registry — 工具注册中心（v2.0）
// v0.66: 接入 app-tools-registry（前端应用通过 WS 暴露的能力）
const registry = new Map();
// v0.66: app-tool registry（前端应用通过 WS 暴露的能力）
const appToolsRegistry = require('./app-tools-registry');

function registerTool(def) {
  if (!def || !def.name || typeof def.handler !== 'function') {
    throw new Error(`工具注册失败：需要 name 和 handler (name=${def?.name})`);
  }
  registry.set(def.name, {
    name: def.name,
    description: def.description || '',
    parameters: def.parameters || { type: 'object', properties: {} },
    handler: def.handler,
    // v0.88: 工具池元数据（契约先定，引擎后建）
    //   domain: 能力域 fs/git/exec/web/db/office/acms/media/agent/system
    //   risk:   风险级 read/write/exec/restricted
    //   由 registerTool 显式声明，或由 tool-pools 的 POOL_DEFAULTS 兜底补全
    pool: normalizePool(def.pool),
  });
}

// v0.88: 池元数据归一化（校验合法值，非法域/风险降级默认）
const VALID_DOMAINS = new Set(['fs', 'git', 'exec', 'web', 'db', 'office', 'acms', 'media', 'agent', 'system', 'app']);
const VALID_RISKS = new Set(['read', 'write', 'exec', 'restricted']);
function normalizePool(pool) {
  if (!pool || typeof pool !== 'object') return null;
  const domain = VALID_DOMAINS.has(pool.domain) ? pool.domain : null;
  const risk = VALID_RISKS.has(pool.risk) ? pool.risk : null;
  if (!domain && !risk) return null;
  return { domain: domain || 'system', risk: risk || 'read' };
}

// v0.88: 读取某工具的池元数据（显式声明 > POOL_DEFAULTS 兜底）
function getToolPool(name) {
  const t = registry.get(name);
  if (t && t.pool) return t.pool;
  try {
    const { POOL_DEFAULTS } = require('./tool-pools');
    const def = POOL_DEFAULTS[name];
    if (def) return normalizePool(def);
  } catch (e) { /* tool-pools 不可用时静默 */ }
  return null;
}

// v0.88: 池查询（引擎后建，当前为手写映射 + 校验）
//   返回池内工具名数组；只返回真实注册的工具（防 P81/P97 漏 require 复发）
function listPool(poolName) {
  try {
    const { POOLS } = require('./tool-pools');
    const names = POOLS[poolName] || [];
    return names.filter(n => getTool(n) !== null);
  } catch (e) {
    console.warn('[tool-registry] listPool 失败:', e.message);
    return [];
  }
}

// v0.88: 列出所有池名
function listPoolNames() {
  try {
    const { POOLS } = require('./tool-pools');
    return Object.keys(POOLS);
  } catch (e) {
    return [];
  }
}

// v0.88: 校验所有池内工具真实存在 + 有 pool 元数据（供测试/CI）
function validatePools() {
  const { POOLS, POOL_DEFAULTS } = require('./tool-pools');
  const problems = [];
  for (const [poolName, names] of Object.entries(POOLS)) {
    for (const n of names) {
      if (!registry.has(n)) problems.push(`[${poolName}] ${n} 未注册`);
      if (!POOL_DEFAULTS[n] && !(registry.get(n) && registry.get(n).pool)) {
        problems.push(`[${poolName}] ${n} 缺 pool 元数据`);
      }
    }
  }
  return problems;
}

function getTool(name) {
  // v0.66: server tool 找不到时也查 app-tool（统一 getTool 入口）
  return registry.get(name) || appToolsRegistry.getAppToolSchema(name) || null;
}

function listTools() {
  // v0.66: 合并 server tools + app tools
  return [...Array.from(registry.values()), ...appToolsRegistry.listAppTools()];
}

function toProviderFormat(api, toolNames) {
  // v0.66: 合并 server + app 两边的 schema
  const sources = toolNames
    ? toolNames.map(n => registry.get(n) || appToolsRegistry.getAppToolSchema(n)).filter(Boolean)
    : listTools();

  if (api === 'anthropic-messages') {
    return sources.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  return sources.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * 递归解包 MiniMax/某些 provider 的 $text content block 格式。
 * MiniMax Anthropic API 在长字符串参数里包装成 {"$text":"..."} 对象，
 * 某些极端情况下还会散落在嵌套 key 里（如 {"$text":"part1","T":{"$text":"part2"}}）。
 * 这里把所有对象拍平为字符串：收集所有 string/$text 值按 key 序拼接。
 */
function unwrapTextBlocks(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object') return obj;

  // 纯 $text 块: {"$text": "string"}
  if (obj.$text && typeof obj.$text === 'string' && Object.keys(obj).length === 1) {
    return obj.$text;
  }

  // 带 $text 的多 key 对象: {"$text":"p1","T":{"$text":"p2"}} → 拼接所有 string 值
  if (obj.$text && typeof obj.$text === 'string') {
    const parts = [];
    for (const key of Object.keys(obj).sort()) {
      const val = obj[key];
      if (typeof val === 'string') {
        parts.push(val);
      } else if (val && typeof val === 'object' && val.$text && typeof val.$text === 'string') {
        parts.push(val.$text);
      } else {
        // 尝试 JSON 化兜底
        try { parts.push(JSON.stringify(val)); } catch { /* 静默 */ }
      }
    }
    return parts.join('');
  }

  // 普通数组/对象 → 递归
  if (Array.isArray(obj)) {
    return obj.map(unwrapTextBlocks);
  }
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = unwrapTextBlocks(value);
  }
  return result;
}

function extractToolCalls(api, responseData) {
  if (!responseData) return [];

  if (api === 'anthropic-messages') {
    return (responseData.content || [])
      .filter(b => b.type === 'tool_use')
      .map(b => ({ id: b.id, name: b.name, args: unwrapTextBlocks(b.input || {}) }));
  }

  const choices = responseData.choices || [];
  const message = choices[0]?.message || {};
  return (message.tool_calls || []).map(tc => ({
    id: tc.id,
    name: tc.function.name,
    args: unwrapTextBlocks(safeParseJSON(tc.function.arguments, {})),
  }));
}

function makeToolResult(api, toolCallId, result) {
  const content = typeof result === 'string' ? result : JSON.stringify(result);
  if (api === 'anthropic-messages') {
    return { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolCallId, content }] };
  }
  return { role: 'tool', tool_call_id: toolCallId, content };
}
function safeParseJSON(str, fallback) {
  if (!str || typeof str !== 'string') return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

// ═══════════════════════════════════════════════════════════
// T1: 工具调用统计（v0.62）
//   记录每个工具的调用次数、报错次数、最后调用时间
//   供后续数据分析驱动工具优化
// ═══════════════════════════════════════════════════════════
const _toolStats = {
  calls: {},
  errors: {},
  lastCalled: {},
  lastError: {},
};

/**
 * 获取工具调用统计数据
 * @returns {{ calls, errors, lastCalled, lastError, summary: Array }}
 *   summary 是按调用次数降序排列的数组 [{name, count, errors, lastCalled}]
 */
function getToolStats() {
  const summary = Object.keys(_toolStats.calls)
    .map(name => ({
      name,
      count: _toolStats.calls[name] || 0,
      errors: _toolStats.errors[name] || 0,
      lastCalled: _toolStats.lastCalled[name] || null,
      lastError: _toolStats.lastError[name] || null,
    }))
    .sort((a, b) => b.count - a.count);
  return {
    calls: { ..._toolStats.calls },
    errors: { ..._toolStats.errors },
    lastCalled: { ..._toolStats.lastCalled },
    lastError: { ..._toolStats.lastError },
    summary,
  };
}

/** 重置统计（用于测试/调试） */
function resetToolStats() {
  _toolStats.calls = {};
  _toolStats.errors = {};
  _toolStats.lastCalled = {};
  _toolStats.lastError = {};
}

/**
 * v0.14：执行工具 handler（便利 wrapper）
 * v0.61: 新增 ctx 参数透传给 handler
 * v0.62: 自动记录调用统计
 * v0.66: 路由到 app-tool（前端应用通过 WS 暴露的能力）
 *         getTool() 现在统一返回 server+app 两边 schema，但 app-tool schema 没有 handler，
 *         所以优先按"有 handler"判定为 server tool，否则走 app-tool 路径
 */
async function execute(name, args, ctx = {}) {
  // v0.66: 优先查 server tool（有 handler 才是真可执行）
  const serverTool = registry.get(name);
  if (serverTool && typeof serverTool.handler === 'function') {
    _toolStats.calls[name] = (_toolStats.calls[name] || 0) + 1;
    _toolStats.lastCalled[name] = Date.now();
    try {
      const result = await serverTool.handler(args || {}, ctx || {});
      if (result && (result.error || result.ok === false)) {
        _toolStats.errors[name] = (_toolStats.errors[name] || 0) + 1;
        _toolStats.lastError[name] = { ts: Date.now(), error: result.error || result.message || 'FAILED' };
      }
      return result;
    } catch (e) {
      _toolStats.errors[name] = (_toolStats.errors[name] || 0) + 1;
      _toolStats.lastError[name] = { ts: Date.now(), error: e.message };
      throw e;
    }
  }

  // v0.66: app-tool fallback（前端应用通过 WS 暴露的能力）
  const appSchema = appToolsRegistry.getAppToolSchema(name);
  if (appSchema) {
    _toolStats.calls[name] = (_toolStats.calls[name] || 0) + 1;
    _toolStats.lastCalled[name] = Date.now();
    try {
      const result = await appToolsRegistry.invokeClientAppTool(name, args || {}, ctx || {});
      if (result && (result.error || result.ok === false)) {
        _toolStats.errors[name] = (_toolStats.errors[name] || 0) + 1;
        _toolStats.lastError[name] = { ts: Date.now(), error: result.error || result.message || 'FAILED' };
      }
      return result;
    } catch (e) {
      _toolStats.errors[name] = (_toolStats.errors[name] || 0) + 1;
      _toolStats.lastError[name] = { ts: Date.now(), error: e.message };
      throw e;
    }
  }

  throw new Error(`未知工具: ${name}`);
}

module.exports = {
  registerTool, getTool, listTools, toProviderFormat, extractToolCalls, makeToolResult, execute,
  getToolStats, resetToolStats,
  // v0.88: 工具池
  getToolPool, listPool, listPoolNames, validatePools,
  // v0.66 PR4: app-tool 统计（透传 app-tools-registry.getStats）
  getAppToolStats: function() { return appToolsRegistry.getStats(); },
  resetAppToolStats: function() { return appToolsRegistry.resetStats(); },
};
