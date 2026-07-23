// ACMS Agent 统一运行时 — v1.0（2026-07-23）
// 把 4 套框架（task-agent/chat-intent/agent-buddy/assist-free）重复的
// model 获取 + LLM 调用 + 结果提取 + 错误处理 统一封装。
//
// 设计原则：极简透明，不隐藏 runToolLoop 的选项，只消除重复。
// 每个框架仍负责自己的 prompt 构建、工具列表计算、后处理逻辑。

const modelStore = require('../stores/model-store');
const { runToolLoop } = require('./llm-adapter');

/**
 * 获取 LLM 模型实例
 * @param {string} modelId - 可选，不传则用默认
 * @returns {{ id: string, name: string, model: string, api: string }}
 * @throws {Error} 无可用模型
 */
function getModel(modelId) {
  if (modelId) {
    const m = modelStore.getById(modelId);
    if (m) return m;
  }
  const def = modelStore.getDefaultGenModel();
  if (def) return def;
  throw Object.assign(new Error('No model available'), { status: 503 });
}

/**
 * 统一提取 runToolLoop 返回内容的文本
 * runToolLoop 可能返回 string 或 { content } 对象
 */
function extractContent(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (result.content) return result.content;
  if (result.message && result.message.content) return result.message.content;
  return '';
}

/**
 * 统一执行 Agent 循环
 *
 * @param {object} opts
 * @param {string}  opts.modelId     - 模型 ID（可选，不传用默认）
 * @param {Array}   opts.messages    - [{role, content}, ...]
 * @param {string[]} opts.toolNames  - 可见工具名列表
 * @param {number}  opts.maxRounds   - 最大轮数（默认 10）
 * @param {object}  opts.context     - 透传给 tool handler 的上下文
 * @param {string}  opts.caller      - 日志标记
 * @param {function} opts.onProgress - 进度回调（task-agent 用）
 * @param {number}  opts.maxTokens   - LLM 最大 token 数
 * @param {number}  opts.temperature - LLM 温度
 * @returns {Promise<{content: string, modelUsed: string}>}
 *
 * 使用示例（最小配置）：
 *   const runtime = require('./agent-runtime');
 *   const { content } = await runtime.execute({
 *     messages, toolNames, maxRounds: 6, caller: 'my-agent',
 *   });
 */
async function execute(opts = {}) {
  // 1. 获取模型
  let model;
  try {
    model = getModel(opts.modelId);
  } catch (e) {
    return { content: '', modelUsed: null, error: e.message };
  }

  // 2. 构建 runToolLoop 选项
  const loopOpts = {
    toolNames: opts.toolNames || [],
    context: opts.context || {},
    maxRounds: opts.maxRounds ?? 10,
    caller: opts.caller || 'runtime',
    onProgress: opts.onProgress,
  };
  if (opts.maxTokens != null) loopOpts.maxTokens = opts.maxTokens;
  if (opts.temperature != null) loopOpts.temperature = opts.temperature;

  // 3. 执行
  let raw;
  try {
    raw = await runToolLoop(model.id, opts.messages || [], loopOpts);
  } catch (e) {
    return {
      content: '',
      modelUsed: model.id,
      error: `[${opts.caller}] runToolLoop failed: ${e.message}`,
      raw: null,
    };
  }

  // 4. 提取 + 把 raw 包装成诊断对象（v0.63 透明化根因）
  //   - 原 raw 可能是 string（旧 llm-adapter line 747 直接 return content）或 {content, finishReason, toolCalls, ...}
  //   - 调用方（task-agent 中止分支）需要判断 finish_reason=length / tool_call 次数 / error 等
  //   - 统一成 { _shape, content, finishReason, toolCalls, usage } 让消费方写起来一致
  let rawDiag;
  if (raw == null) {
    rawDiag = null;
  } else if (typeof raw === 'string') {
    rawDiag = {
      _shape: 'string',
      content: raw,
      finishReason: null,
      toolCalls: 0,
      usage: null,
    };
  } else {
    // 兼容两种 object 形态：
    //   1. 正常 LLM 响应（callAnthropic/callOpenAI 返回）: {content, toolCalls, finishReason, usage}
    //   2. runToolLoop 最终答案（v0.63 新形态）: {content, finishReason, toolCalls:[], toolCallCount:N}
    //   优先用 toolCallCount（累计值），fallback 到 toolCalls.length（当前轮）
    const toolCallsLen = Array.isArray(raw.toolCalls) ? raw.toolCalls.length : 0;
    const toolCallCount = typeof raw.toolCallCount === 'number' ? raw.toolCallCount : toolCallsLen;
    rawDiag = {
      _shape: 'object',
      content: raw.content || raw.message?.content || '',
      finishReason: raw.finishReason || null,
      toolCalls: toolCallCount,
      usage: raw.usage || null,
    };
  }

  return {
    content: extractContent(raw),
    modelUsed: model.id,
    raw: rawDiag,
  };
}

module.exports = { getModel, extractContent, execute };
