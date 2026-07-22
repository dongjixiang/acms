// ACMS Tool Registry — 工具注册中心（v2.0）
const registry = new Map();

function registerTool(def) {
  if (!def || !def.name || typeof def.handler !== 'function') {
    throw new Error(`工具注册失败：需要 name 和 handler (name=${def?.name})`);
  }
  registry.set(def.name, {
    name: def.name,
    description: def.description || '',
    parameters: def.parameters || { type: 'object', properties: {} },
    handler: def.handler,
  });
}

function getTool(name) {
  return registry.get(name) || null;
}

function listTools() {
  return Array.from(registry.values());
}

function toProviderFormat(api, toolNames) {
  const sources = toolNames
    ? toolNames.map(n => registry.get(n)).filter(Boolean)
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

/**
 * v0.14：执行工具 handler（便利 wrapper）
 * v0.61: 新增 ctx 参数透传给 handler，让 tool handler 能拿到 userId/username/role/reqId 等上下文
 * @param {string} name - 工具名
 * @param {object} args - 工具参数
 * @param {object} ctx - 透传上下文（userId/username/role/reqId/taskId/...）
 * @returns {Promise<object>} 工具返回结果
 * @throws {Error} 工具不存在时
 */
async function execute(name, args, ctx = {}) {
  const tool = getTool(name);
  if (!tool) {
    throw new Error(`未知工具: ${name}`);
  }
  if (typeof tool.handler !== 'function') {
    throw new Error(`工具 ${name} 没有 handler`);
  }
  return await tool.handler(args || {}, ctx || {});
}

module.exports = { registerTool, getTool, listTools, toProviderFormat, extractToolCalls, makeToolResult, execute };
