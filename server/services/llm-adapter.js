// LLM 适配器 — 统一多 API 格式调用层（v2.0 + tool_calls + Anthropic 流式）
// 支持: openai-chat, anthropic-messages
const modelStore = require('../stores/model-store');
const toolRegistry = require('./tool-registry');

// 默认请求超时（毫秒）
const DEFAULT_TIMEOUT = 120000; // 120s

// ── v0.3.3 B+++ 补丁（2026-06-13，v0.13 抽公共到 services/debug-logger.js）──
const { dump: _debugDump } = require('./debug-logger');

/**
 * 调用 LLM，自动根据 model.api 选择协议
 * @param {string} modelId
 * @param {Array}  messages - [{role, content}, ...]
 * @param {object} options - { temperature, maxTokens, jsonMode, projectId, tools }
 * @returns {object} { content, modelUsed, usage, toolCalls?, finishReason? }
 */
async function callLLM(modelId, messages, options = {}) {
  const model = modelStore.getById(modelId);
  if (!model) throw Object.assign(new Error('模型不存在'), { status: 404 });

  const apiKey = modelStore.getDecryptedKey(modelId);
  if (!apiKey) throw Object.assign(new Error('模型未配置 API Key'), { status: 400 });

  const api = model.api || 'openai-chat';

  const opts = {
    temperature: options.temperature ?? 0.7,
    maxTokens: options.maxTokens ?? 2000,
    jsonMode: options.jsonMode ?? false,
    tools: options.tools || null,
  };

  _debugDump('LLM_REQUEST', {
    modelId, model: { name: model.name, model: model.model, api, baseUrl: model.baseUrl },
    opts, messagesCount: messages.length,
    messagesTotalChars: messages.reduce((s, m) => s + (m.content?.length || 0), 0),
    messages: messages.map(m => ({ role: m.role, contentLen: m.content?.length || 0, content: m.content })),
    caller: options.caller || '(none)',
  });

  // v0.15: 429/529 等瞬时错误自动重试（指数退避），最多 3 次
  const RETRY_STATUSES = [429, 529, 502, 503, 504];
  const MAX_RETRIES = 3;
  let result;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (api === 'anthropic-messages') {
        result = await callAnthropic(model, messages, opts, apiKey, opts.tools);
      } else {
        result = await callOpenAI(model, messages, opts, apiKey, opts.tools);
      }
      break;  // 成功，退出重试
    } catch (e) {
      lastErr = e;
      const status = e.status || e.response?.status;
      if (!RETRY_STATUSES.includes(status) || attempt === MAX_RETRIES) {
        throw e;
      }
      const delayMs = 500 * Math.pow(2, attempt - 1);  // 500ms, 1s, 2s
      console.warn(`[llm-adapter] ${model.name} 临时错误 ${status}（${attempt}/${MAX_RETRIES}），${delayMs}ms 后重试...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  if (!result) throw lastErr;

  _debugDump('LLM_RESPONSE', {
    modelId, contentLen: result.content?.length || 0, content: result.content,
    usage: result.usage, finishReason: result.finishReason || '(n/a)',
  });

  if (options.projectId && result.usage) {
    try {
      const tracker = require('./token-tracker');
      tracker.record(options.projectId, model.name || model.model, result.usage, options.caller || '');
    } catch (e) { /* 非关键，静默失败 */ }
  }

  return result;
}

// ===== OpenAI Chat Completions =====
// v0.25 fix: fetch 错误信息增强 — Node fetch 抛 'fetch failed' 时丢失根因
// 必须读 e.cause 才能看到 DNS / TLS / ECONNRESET 等具体错误
function buildFetchErrorDetail(e, model, baseUrl, endpoint) {
  const causeInfo = e.cause
    ? `${e.cause.name || ''} ${e.cause.code || ''} ${e.cause.message || ''}`.trim()
    : '';
  return `${model.name} (${model.model}) @ ${baseUrl}${endpoint} — ${e.message}${causeInfo ? ` [cause: ${causeInfo}]` : ''}`;
}

async function callOpenAI(model, messages, opts, apiKey, tools) {
  const baseUrl = model.baseUrl || 'https://api.deepseek.com/v1';
  const isMiniMax = baseUrl.includes('minimax');

  const body = {
    model: model.model,
    messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
  };

  // v2.0: 工具调用
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const supportsJsonResponseFormat = !isMiniMax;
  if (opts.jsonMode && supportsJsonResponseFormat) {
    body.response_format = { type: 'json_object' };
  }

  if (opts.jsonMode && !supportsJsonResponseFormat) {
    const jsonReminder = {
      role: 'system',
      content: '【格式强制】你必须严格输出纯 JSON 对象，不要用 ```json 代码块包裹，不要添加任何额外文字、注释或说明。',
    };
    messages.push(jsonReminder);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const err = await resp.text();
      throw Object.assign(new Error(`LLM 调用失败: ${resp.status} ${err}`), { status: 502 });
    }

    const data = await resp.json();
    const msg = data.choices?.[0]?.message || {};
    const u = data.usage || {};

    const result = {
      content: msg.content || '',
      modelUsed: `${model.name} (${model.model})`,
      usage: { promptTokens: u.prompt_tokens || 0, completionTokens: u.completion_tokens || 0, totalTokens: u.total_tokens || 0 },
    };

    if (tools && tools.length > 0 && msg.tool_calls?.length > 0) {
      result.toolCalls = toolRegistry.extractToolCalls('openai-chat', data);
      result.finishReason = data.choices?.[0]?.finish_reason || 'tool_calls';
    }

    return result;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw Object.assign(new Error(`LLM 请求超时 (${DEFAULT_TIMEOUT/1000}s): ${model.name} (${model.model})`), { status: 504, timeout: true });
    }
    const detail = buildFetchErrorDetail(e, model, baseUrl, '/chat/completions');
    console.error(`[llm-adapter] LLM 调用异常: ${detail}`);
    throw Object.assign(new Error(`LLM 调用失败: ${detail}`), { status: 502, cause: e.cause });
  }
}

// ===== Anthropic Messages =====
async function callAnthropic(model, messages, opts, apiKey, tools) {
  const baseUrl = model.baseUrl || 'https://api.anthropic.com';

  const systemParts = [];
  const chatMessages = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
    } else {
      chatMessages.push({ role: m.role, content: m.content });
    }
  }

  const body = {
    model: model.model,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    messages: chatMessages,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = { type: 'auto' };
  }

  if (systemParts.length > 0) {
    body.system = systemParts.join('\n\n');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  try {
    const resp = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const err = await resp.text();
      throw Object.assign(new Error(`LLM 调用失败: ${resp.status} ${err}`), { status: 502 });
    }

    const data = await resp.json();
    const textContent = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    const u = data.usage || {};

    const result = {
      content: textContent || '',
      modelUsed: `${model.name} (${model.model})`,
      usage: { promptTokens: u.input_tokens || 0, completionTokens: u.output_tokens || 0, totalTokens: (u.input_tokens || 0) + (u.output_tokens || 0) },
    };

    if (tools && tools.length > 0 && data.content?.some(c => c.type === 'tool_use')) {
      result.toolCalls = toolRegistry.extractToolCalls('anthropic-messages', data);
      result.finishReason = data.stop_reason || 'tool_use';
    }

    return result;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw Object.assign(new Error(`LLM 请求超时 (${DEFAULT_TIMEOUT/1000}s): ${model.name} (${model.model})`), { status: 504, timeout: true });
    }
    const detail = buildFetchErrorDetail(e, model, baseUrl, '/v1/messages');
    console.error(`[llm-adapter] LLM 调用异常: ${detail}`);
    throw Object.assign(new Error(`LLM 调用失败: ${detail}`), { status: 502, cause: e.cause });
  }
}

// ════════════════════════════════════════════════════════════════
// 流式调用（SSE）
// ════════════════════════════════════════════════════════════════

/**
 * 流式调用 LLM，根据 model.api 自动分流
 */
async function* callLLMStream(modelId, messages, options = {}) {
  const model = modelStore.getById(modelId);
  if (!model) throw Object.assign(new Error('模型不存在'), { status: 404 });

  const apiKey = modelStore.getDecryptedKey(modelId);
  if (!apiKey) throw Object.assign(new Error('模型未配置 API Key'), { status: 400 });

  const api = model.api || 'openai-chat';

  if (api === 'anthropic-messages') {
    yield* callAnthropicStream(model, messages, options, apiKey);
    return;
  }
  yield* callOpenAIStream(model, messages, options, apiKey);
}

/** OpenAI Chat SSE 流式 */
async function* callOpenAIStream(model, messages, opts, apiKey) {
  const baseUrl = model.baseUrl || 'https://api.deepseek.com/v1';
  const body = { model: model.model, messages, temperature: opts.temperature ?? 0.7, max_tokens: opts.maxTokens ?? 2000, stream: true };
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(body),
  });
  if (!resp.ok) { const err = await resp.text(); yield { type: 'error', message: `LLM 流式调用失败: ${resp.status} ${err}` }; return; }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '', buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) { fullContent += delta; yield { type: 'token', text: delta }; }
        } catch {}
      }
    }
  } finally { reader.releaseLock(); }
  yield { type: 'done', content: fullContent, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
}

/** Anthropic Messages SSE 流式 */
async function* callAnthropicStream(model, messages, opts, apiKey) {
  const baseUrl = model.baseUrl || 'https://api.anthropic.com';

  const systemParts = [];
  const chatMessages = [];
  for (const m of messages) {
    if (m.role === 'system') systemParts.push(m.content);
    else chatMessages.push({ role: m.role, content: m.content });
  }

  const body = { model: model.model, max_tokens: opts.maxTokens ?? 2000, temperature: opts.temperature ?? 0.7, stream: true, messages: chatMessages };
  if (systemParts.length > 0) body.system = systemParts.join('\n\n');

  const resp = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body),
  });
  if (!resp.ok) { const err = await resp.text(); yield { type: 'error', message: `LLM 流式调用失败: ${resp.status} ${err}` }; return; }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '', buffer = '', currentEvent = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) { currentEvent = ''; continue; }
        if (trimmed.startsWith('event:')) { currentEvent = trimmed.slice(6).trim(); }
        else if (trimmed.startsWith('data:')) {
          const data = trimmed.slice(5).trim();
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            if (currentEvent === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              const text = parsed.delta.text || '';
              if (text) { fullContent += text; yield { type: 'token', text }; }
            } else if (currentEvent === 'content_block_delta' && parsed.delta?.type === 'thinking_delta') {
              const text = parsed.delta.thinking || '';
              if (text) yield { type: 'thinking', text };
            } else if (currentEvent === 'message_stop') {
              yield { type: 'done', content: fullContent, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
              reader.releaseLock(); return;
            } else if (currentEvent === 'error') {
              yield { type: 'error', message: parsed.error?.message || 'Anthropic 流式错误' };
              reader.releaseLock(); return;
            }
          } catch {}
        }
      }
    }
  } finally { reader.releaseLock(); }
  yield { type: 'done', content: fullContent, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
}

// ════════════════════════════════════════════════════════════════
// v2.0: 带工具调用的 LLM 调用 + Tool Call Loop 编排
// ════════════════════════════════════════════════════════════════

async function callLLMWithTools(modelId, messages, options = {}) {
  const toolNames = options.toolNames;
  // v0.16 fix: 按 model.api 转换 tool 格式（避免 MiniMax anthropic 端点收到 openai 格式 → 400 invalid params）
  //   openai-chat → {type:'function', function:{name, description, parameters}}
  //   anthropic-messages → {name, description, input_schema}
  let tools = null;
  if (toolNames) {
    const model = modelStore.getById(modelId);
    const api = model?.api || 'openai-chat';
    tools = toolRegistry.toProviderFormat(api, toolNames);
  }
  return callLLM(modelId, messages, { ...options, tools });
}

async function runToolLoop(modelId, messages, options = {}) {
  const maxRounds = options.maxRounds ?? 10;
  const toolNames = options.toolNames;
  const context = options.context || {};  // v0.20：透传给 tool handler（music/video/image_gen 需要 reqId）
  const model = modelStore.getById(modelId);
  if (!model) throw Object.assign(new Error('模型不存在'), { status: 404 });
  const api = model.api || 'openai-chat';

  // v0.20 bugfix：检测 LLM 连续两轮调同一 tool + 相同 args → 强制退出（避免无限循环）
  //   旧 bug：LLM 调 play_music(song="X") → handler 返回 ok → LLM 再调确认 → 再返回 ok → 死循环
  //   修复：连续两轮同 tool+args 直接返回最后一次 content（不抛错），避免 LLM 死循环
  let lastToolCallKey = null;

  // v0.25 debug: 记录每轮 LLM 调了啥 + tool 结果，方便 PM 查 tool loop 卡死根因
  const toolCallHistory = [];

  // v0.29 fix: Context 压缩 — Hermes-style 防止 LLM 长对话失忆 goal
  //   当 messages 超过阈值（默认 30），summarize 旧 messages，保留 system + 最近 12 条
  //   根因：T-MRDO0ECU 重跑 Round 12 时 messages 已 37 条，goal 在 messages[1] 已被推到 attention 边缘
  const COMPRESS_THRESHOLD = 30;
  const KEEP_RECENT = 12;
  if (messages.length > COMPRESS_THRESHOLD) {
    const systemMsg = messages[0];
    const recentMsgs = messages.slice(-KEEP_RECENT);
    const droppedCount = messages.length - 1 - KEEP_RECENT;
    const droppedToolSummary = toolCallHistory.slice(0, toolCallHistory.length - KEEP_RECENT / 2).map(h => `${h.tool}(${(h.args||'').slice(0, 60)})`).join(', ');
    const summaryText = `[Earlier ${droppedCount} messages compressed: agent explored workspace and made tool calls: ${droppedToolSummary || 'exploration + verification'}. Goal context remains in system prompt above.]`;
    const compressed = [systemMsg, { role: 'user', content: summaryText }, ...recentMsgs];
    console.log(`[runToolLoop] v0.29 context compression: ${messages.length} → ${compressed.length} messages (kept system + last ${KEEP_RECENT})`);
    messages.length = 0;
    messages.push(...compressed);
  }

  for (let round = 0; round < maxRounds; round++) {
    console.log(`[runToolLoop] round=${round + 1}/${maxRounds} | messages=${messages.length} | taskId=${context.taskId || '?'}`);
    const result = await callLLMWithTools(modelId, messages, { ...options, toolNames });
    if (!result.toolCalls?.length) {
      // v0.30 fix: 装睡检测 — user 语气 + 二选一选项（Hermes-style user-driven steer）
      //   根因：v0.29 STEER 注入 goal 段但 LLM 当 system warning 看，4 轮装睡都不醒悟
      //   改成 user 主动观察语气 + 强制 A/B 选择 + 现实威胁（user 接手）
      //   Hermes 的 /steer 命令等价物 — LLM 把 user message 当 "用户的意图"，优先级高于 system warning
      const requiresWrite = Array.isArray(toolNames) && toolNames.includes('agent_write_file');
      const writeFileCalls = toolCallHistory.filter(h => h.tool === 'agent_write_file' && !h.error);
      if (requiresWrite && writeFileCalls.length === 0) {
        const systemPrompt = messages[0]?.content || '';
        const goalMatch = systemPrompt.match(/# YOUR SPECIFIC GOAL FOR THIS TASK\s*([\s\S]+?)(?=# DO NOT STOP|$)/);
        const goalReminder = goalMatch ? goalMatch[1].trim() : 'Complete the task by writing all required files.';
        console.warn(`[runToolLoop] USER-STEER round=${round + 1}: LLM 装睡，user 主动 steer 注入`);
        messages.push({
          role: 'user',
          content: `我看到你刚才 return summary 但没真写文件。

请**二选一**（必须选一个，不要再返回 summary）：

**A. 立即调用 agent_write_file**：用完整 content 写当前任务要求的文件（任务要求在你 system prompt 里）。

**B. 用一句话解释**：为什么你不能写（例如 "我没找到 GameState.js 的接口定义"）。

如果 A：你写完调用 agent_write_file，response 会告诉你 "wrote N bytes | syntax: OK"。
如果 B：说明具体卡点，我会考虑是否调整 task 或让你换个角度。
如果你再返回 summary 或忽略这个 steer，这个 task 立即被标记 failed，我会自己接手写。

Round ${round + 1}/${maxRounds}。

【Goal 摘要】${goalReminder.slice(0, 400)}`,
        });
        continue;
      }
      console.log(`[runToolLoop] round=${round + 1} LLM 返回最终答案 (no tool calls), content=${(result.content || '').length} chars`);
      if (toolCallHistory.length > 0) console.log(`[runToolLoop] 完整 tool call history:\n${toolCallHistory.map(h => `  r${h.round} ${h.tool}(${(h.args||'').slice(0, 100)})`).join('\n')}`);
      return result.content || '';
    }

    const asstMsg = { role: 'assistant', content: result.content || null };
    if (api === 'anthropic-messages') {
      const blocks = [];
      if (result.content) blocks.push({ type: 'text', text: result.content });
      for (const tc of result.toolCalls) blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args });
      asstMsg.content = blocks;
    } else {
      asstMsg.tool_calls = result.toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } }));
    }
    messages.push(asstMsg);

    for (const tc of result.toolCalls) {
      const tool = toolRegistry.getTool(tc.name);
      const argsPreview = JSON.stringify(tc.args || {}).slice(0, 200);
      console.log(`[runToolLoop]   call: ${tc.name}(${argsPreview})`);

      if (!tool) {
        console.log(`[runToolLoop]   -> 未知工具: ${tc.name}`);
        toolCallHistory.push({ round: round + 1, tool: tc.name, args: argsPreview, result: 'UNKNOWN_TOOL' });
        messages.push(toolRegistry.makeToolResult(api, tc.id, { error: `未知工具: ${tc.name}` }));
        continue;
      }

      // v0.25 fix: 放宽 v0.20 强制退出 — 重复 tool 调用不再 return，而是把「你刚调了同一 tool」塞回 messages
      //   让 LLM 自己决定下一步。真死循环由 maxRounds 兜底。
      //   根因（T-MRDO0ECU 案例）：agent 在 round 6 已看到 GameState.js 不存在，但 round 7 重复调 walker
      //   时被强制截断，失去了调 agent_write_file 的机会。LLM 收到 warning 后会自主收敛。
      const callKey = `${tc.name}:${JSON.stringify(tc.args)}`;
      if (callKey === lastToolCallKey) {
        console.warn(`[runToolLoop]   -> 检测到连续两轮同 tool+args — 警告 LLM，不强制退出 (round ${round + 1}/${maxRounds})`);
        toolCallHistory.push({ round: round + 1, tool: tc.name, args: argsPreview, result: 'WARN_REPEAT' });
        messages.push(toolRegistry.makeToolResult(api, tc.id, {
          warning: `You just called ${tc.name} with the same arguments in the previous round. This is a repeated call. If you have enough information, write the files or finish. If you need different info, try a different tool or different arguments. Do NOT call the same tool with the same arguments again — you have limited rounds left (${maxRounds - round - 1} rounds remaining).`,
          _duplicateCall: true,
        }));
        lastToolCallKey = callKey;
        continue;
      }
      lastToolCallKey = callKey;

      try {
        // v0.20：handler 接 (args, context) — context 用于传 reqId 等
        const toolResult = await tool.handler(tc.args, context);
        const resultPreview = JSON.stringify(toolResult).slice(0, 300);
        console.log(`[runToolLoop]   -> result (${resultPreview.length} chars): ${resultPreview}`);
        toolCallHistory.push({ round: round + 1, tool: tc.name, args: argsPreview, resultPreview });
        messages.push(toolRegistry.makeToolResult(api, tc.id, toolResult));
      } catch (e) {
        console.log(`[runToolLoop]   -> ERROR: ${e.message}`);
        toolCallHistory.push({ round: round + 1, tool: tc.name, args: argsPreview, error: e.message });
        messages.push(toolRegistry.makeToolResult(api, tc.id, { error: e.message }));
      }
    }
  }
  console.error(`[runToolLoop] Tool loop exceeded max rounds (${maxRounds}). 完整 tool call history (${toolCallHistory.length} 条):\n${toolCallHistory.map(h => `  r${h.round} ${h.tool}(${(h.args||'').slice(0, 80)}) → ${h.resultPreview ? h.resultPreview.slice(0, 80) : (h.result || h.error || '?')}`).join('\n')}`);
  throw new Error(`Tool loop exceeded max rounds (${maxRounds})`);
}

module.exports = { callLLM, callLLMStream, callLLMWithTools, runToolLoop };
