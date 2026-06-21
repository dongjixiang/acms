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

function extractToolCalls(api, responseData) {
  if (!responseData) return [];

  if (api === 'anthropic-messages') {
    return (responseData.content || [])
      .filter(b => b.type === 'tool_use')
      .map(b => ({ id: b.id, name: b.name, args: b.input || {} }));
  }

  const choices = responseData.choices || [];
  const message = choices[0]?.message || {};
  return (message.tool_calls || []).map(tc => ({
    id: tc.id,
    name: tc.function.name,
    args: safeParseJSON(tc.function.arguments, {}),
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
 * @param {string} name - 工具名
 * @param {object} args - 工具参数
 * @returns {Promise<object>} 工具返回结果
 * @throws {Error} 工具不存在时
 */
async function execute(name, args) {
  const tool = getTool(name);
  if (!tool) {
    throw new Error(`未知工具: ${name}`);
  }
  if (typeof tool.handler !== 'function') {
    throw new Error(`工具 ${name} 没有 handler`);
  }
  return await tool.handler(args || {});
}

module.exports = { registerTool, getTool, listTools, toProviderFormat, extractToolCalls, makeToolResult, execute };
