// LLM 适配器 — 统一多 API 格式调用层（v2.0 + tool_calls + Anthropic 流式）
// 支持: openai-chat, anthropic-messages
const modelStore = require('../stores/model-store');
const toolRegistry = require('./tool-registry');
// v0.46: Hook 系统集成（PreToolUse / PostToolUse）— 让用户在不改 tool handler 的情况下注入自动化
const { runPreHooks, runPostHooks } = require('./hook-registry');
// v0.XX: 代理 Phase 1 — 统一出站 fetch（接管所有 LLM API 调用以支持代理设置）
const { proxyFetch: fetch } = require('./proxy-fetch');

// v0.101: Agent 运行全链路追踪（懒加载避免循环依赖；开关在系统管理）
let _traceSvc = null;
function _getTraceSvc() {
  if (!_traceSvc) _traceSvc = require('./agent-trace');
  return _traceSvc;
}

// 默认请求超时（毫秒）
const DEFAULT_TIMEOUT = 120000; // 120s

// ── v0.3.3 B+++ 补丁（2026-06-13，v0.13 抽公共到 services/debug-logger.js）──
const { dump: _debugDump } = require('./debug-logger');

// v0.35: 工具名称 → 人类可读描述
function getToolDisplayName(toolName) {
  const names = {
    'agent_read_file': '读取文件',
    'agent_list_files': '列出文件',
    'agent_search_files': '搜索文件',
    'agent_exec_command': '执行命令',
    'agent_write_file': '写入文件',
  };
  return names[toolName] || toolName;
}

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

  // v0.79 DEBUG: 打印发送给 Agnes AI 的消息结构
  if (baseUrl.includes('agnes-ai')) {
    console.log(`[llm-adapter][agnes-debug] model=${model.model} messages_count=${messages.length} total_chars=${messages.reduce((s,m)=>s+(m.content?.length||0),0)} tools_count=${tools?.length||0}`);
    messages.forEach((m,i) => {
      const c = typeof m.content === 'string' ? m.content : (m.content ? JSON.stringify(m.content).substring(0,50) : '(no content)');
      console.log(`[llm-adapter][agnes-debug]   msg[${i}] role=${m.role} len=${c.length} preview="${c.substring(0,60)}"`);
    });
  }

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
      throw Object.assign(new Error(`LLM 调用失败: ${resp.status} ${err}`), { status: resp.status });
    }

    const data = await resp.json();
    const msg = data.choices?.[0]?.message || {};
    const u = data.usage || {};

    // v0.79: DeepSeek R1 等思考型模型会把推理过程放在 <think>...</think> 里
    //   把它从 content 剥离到 result.thinking，避免污染对话气泡
    var rawContent = msg.content || '';
    var thinking = '';
    var thinkMatch = rawContent.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
      thinking = thinkMatch[1].trim();
      rawContent = rawContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }

    const result = {
      content: rawContent,
      thinking,
      modelUsed: `${model.name} (${model.model})`,
      usage: { promptTokens: u.prompt_tokens || 0, completionTokens: u.completion_tokens || 0, totalTokens: u.total_tokens || 0 },
    };

    if (tools && tools.length > 0 && msg.tool_calls?.length > 0) {
      result.toolCalls = toolRegistry.extractToolCalls('openai-chat', data);
      result.finishReason = data.choices?.[0]?.finish_reason || 'tool_calls';
    } else if (tools && tools.length > 0 && msg.content && (
      (msg.content.indexOf('<|tool_begin|>') >= 0 || msg.content.indexOf('</|tool_begin|>') >= 0) ||
      /<\s*[\s\u200b_]*tool[\s\u200b_]*_?[\s\u200b_]*call[\s\u200b_]*\s*>/.test(msg.content) ||
      /<function[\s=>(]*\w+[\s=)>]*>/.test(msg.content) ||
      // v0.85: openapi<tool_sep> 变体（Agnes AI 第 5 种格式漂移）
      msg.content.indexOf('openapi<tool_sep>') >= 0
    )) {
      // v0.75: 某些模型用内联标签格式返回工具调用（非标准 OpenAI tool_calls）
      //   格式: <|tool_begin|>tool_name<|tool_param_begin|>{"arg":"val"}<|tool_end|>
      // v0.78: 某些模型（Agnes AI）用 XML 格式返回工具调用
      //   格式: <function(tool_name)><parameter>name
      result.toolCalls = parseInlineToolCalls(msg.content);
      result.finishReason = 'tool_calls';
      result.content = '';  // 工具调用文本不进入对话气泡
    } else if (tools && tools.length > 0 && data.choices?.[0]?.finish_reason === 'tool_calls') {
      // v0.75: API 说 finish_reason=tool_calls 但 tool_calls 字段为空——dump 原始响应诊断
      console.warn('[llm-adapter] v0.75 DEBUG: finish_reason=tool_calls but no tool_calls parsed', JSON.stringify({
        finish_reason: data.choices?.[0]?.finish_reason,
        hasToolCalls: !!msg.tool_calls,
        toolCallsLen: msg.tool_calls?.length,
        contentLen: (msg.content || '').length,
        contentPreview: (msg.content || '').slice(0, 100),
        keys: Object.keys(msg),
      }));
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
      throw Object.assign(new Error(`LLM 调用失败: ${resp.status} ${err}`), { status: resp.status });
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

// === Hermes-style agent loop helpers (v0.33 C 方案) ===
// 参考 Hermes run_agent.py:283-330 IterationBudget + tools/tool_result_storage.py
// 目标：让 ACMS 20 轮装睡 → 90 轮内收敛

// v0.33: IterationBudget — 线程安全的迭代预算
//   Hermes: max_iterations=90 + refund() 让 execute_code 工具不占预算
//   ACMS: maxRounds=90 + 跨 turn 去重 + 同 turn 静默 dedup + tool result 截断
class IterationBudget {
  constructor(maxTotal) {
    this.maxTotal = maxTotal;
    this._used = 0;
  }
  // 返回 true 表示还允许，false 表示用光
  consume() {
    if (this._used >= this.maxTotal) return false;
    this._used += 1;
    return true;
  }
  // 退一轮（Hermes 用法：execute_code 工具的迭代不占预算；ACMS 留接口，后续接 execute_code 工具时用）
  refund() {
    if (this._used > 0) this._used -= 1;
  }
  get used() { return this._used; }
  get remaining() { return Math.max(0, this.maxTotal - this._used); }
}

// v0.75: 解析内联标签格式的工具调用
//   某些模型用特殊 token 表示工具调用，非标准 OpenAI tool_calls 字段
//   格式: <|tool_begin|>tool_name<|tool_param_begin|>{"arg":"val"}<|tool_end|>
// v0.78: 支持 XML 格式（Agnes AI 等模型）: <function(tool_name)><parameter>name
// v0.79: 支持 XML 等号变体: <function=tool_name><parameter=name>VALUE</parameter></function>
//        + 剥掉 <tool_call>...</tool_call> 外层包装（含零宽空格）
// v0.85: 支持 openapi<tool_sep> 变体（Agnes AI 第 5 种格式漂移）:
//        <tool_call>openapi<tool_sep>web_search{"query":"..."}</tool_calls>
function parseInlineToolCalls(content) {
  if (!content || typeof content !== 'string') return [];
  var results = [];
  // v0.79: 剥掉最外层 <tool_call>...</tool_call> 包装
  //   LLM 实际输出: <tool_call><function=...>...</function></tool_call>
  //   字符细节: < \u200b t o o l \u200b _ c a l l \u200b >
  //   所以 tool 和 call 之间是 \u200b_（零宽空格+下划线），不是单独一个符号
  //   \s 在 JS 不匹配 \u200b，必须用 [\s\u200b]
  var stripped = content.replace(/<\s*[\s\u200b_]*tool[\s\u200b_]*_?[\s\u200b_]*call[\s\u200b_]*\s*>/g, '');

  // v0.85: openapi<tool_sep> 变体 — LLM 输出类似
  //   <tool_call>openapi<tool_sep>web_search{"query":"特斯拉股价"}</tool_calls>
  //   （闭合标签可能写成 </tool_calls> 或缺失，宽松匹配）
  //   注意: stripped 已把 <tool_call> 剥掉，这里直接匹配 openapi<tool_sep>name{json}
  var openapiRe = /openapi<tool_sep>\s*(\w+)\s*(\{[^<]*?\})\s*(?:<\/tool_calls?>)?/g;
  var opMatch;
  while ((opMatch = openapiRe.exec(stripped)) !== null) {
    var opArgs = {};
    try { opArgs = JSON.parse(opMatch[2]); } catch (e) { opArgs = { _raw: opMatch[2] }; }
    results.push({
      id: 'inline_openapi_' + Date.now() + '_' + results.length,
      name: opMatch[1],
      args: opArgs,
    });
  }

  // v0.78+ XML 格式（兼容 () 和 = 两种函数名/参数名分隔符）:
  //   旧: <function(fetch_url)><parameter name="url">VALUE</parameter></function>
  //   新: <function=fetch_url><parameter=url>VALUE</parameter></function>
  //   注意: <function=NAME> 直接以 > 结尾，没有 = 或 )
  //   通用写法: <function[\s=>(]*name[\s=)>]*>
  var xmlRe = /<function[\s=>(]*(\w+)[\s=)>]*>([\s\S]*?)<\s*\/\s*function\s*>/g;
  var xmlMatch;
  while ((xmlMatch = xmlRe.exec(stripped)) !== null) {
    var name = xmlMatch[1];
    var body = xmlMatch[2];
    var args = {};
    // 参数同样兼容三种形式: <parameter name="p">V</parameter> / <parameter=p>V</parameter>
    //   不能用统一 [\s="(>]*(\w+) 因为 "name" 字段会被错误吃掉
    //   用 (?:name="x"|=x) 二选一明确分组
    var paramRe = /<parameter(?:\s+name\s*=\s*"(\w+)"|\s*=\s*(\w+))\s*>([\s\S]*?)<\s*\/\s*parameter\s*>/g;
    var paramMatch;
    while ((paramMatch = paramRe.exec(body)) !== null) {
      var paramName = paramMatch[1] || paramMatch[2];
      var paramValue = paramMatch[3];
      // 尝试 JSON 解析（值可能是字符串、数组或对象）
      try { args[paramName] = JSON.parse(paramValue); }
      catch (e) { args[paramName] = paramValue; }
    }
    results.push({
      id: 'inline_xml_' + Date.now() + '_' + results.length,
      name: name,
      args: args,
    });
  }
  // v0.75: 如果没有找到 XML 格式，尝试内联标签格式
  if (results.length === 0) {
    var re = /<\/?\|tool_begin\|>\s*(\w+)\s*<\|tool_param_begin\|>\s*(\{[\s\S]*?\})?\s*<\|tool_end\|>/g;
    var match;
    while ((match = re.exec(stripped)) !== null) {
      var toolName = match[1];
      var toolArgs = {};
      if (match[2]) {
        try { toolArgs = JSON.parse(match[2]); } catch (e) { toolArgs = { _raw: match[2] }; }
      }
      results.push({
        id: 'inline_' + Date.now() + '_' + results.length,
        name: toolName,
        args: toolArgs,
      });
    }
  }
  return results;
}

// v0.33: 同 turn 静默去重（参考 Hermes _deduplicate_tool_calls:6078）
//   LLM 经常同一 turn 调多次 read_file(path) — Hermes 静默去重，ACMS 之前跨轮警告治标
//   这里去重"完全相同 (tool_name, args) JSON 字符串"的 call，只保留第一次
function deduplicateToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls) || toolCalls.length < 2) return toolCalls;
  const seen = new Set();
  const unique = [];
  let dropped = 0;
  for (const tc of toolCalls) {
    const name = tc.name || tc.function?.name || '';
    const args = tc.args || (tc.function?.arguments ? safeParseJSON(tc.function.arguments) : null) || {};
    const key = `${name}::${JSON.stringify(args)}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(tc);
    } else {
      dropped += 1;
    }
  }
  if (dropped > 0) console.warn(`[runToolLoop] v0.33 同 turn 去重: 删了 ${dropped} 个重复 tool_call`);
  return unique;
}

function safeParseJSON(s) { try { return JSON.parse(s); } catch { return null; } }

// v0.33: tool name 容错（参考 Hermes _repair_tool_call:6098）
//   模型常拼错 `TodoTool_tool` / `Patch_tool` / `ReadFile` 这种 — 5 步自动修
function repairToolName(name, validNames) {
  if (!name || validNames.has(name)) return name;
  // Step 1: lowercase 直接匹配
  const lower = name.toLowerCase();
  if (validNames.has(lower)) return lower;
  // Step 2: 标准化分隔符
  const norm = lower.replace(/[-\s]/g, '_');
  if (validNames.has(norm)) return norm;
  // Step 3: camelCase -> snake_case
  const snake = name.replace(/(?<!^)(?=[A-Z])/g, '_').toLowerCase();
  if (validNames.has(snake)) return snake;
  // Step 4: 去 _tool / -tool / tool 后缀（最多 2 次，处理 TodoTool_tool）
  let stripped = name;
  for (let i = 0; i < 2; i++) {
    const lc = stripped.toLowerCase();
    let next = null;
    for (const suffix of ['_tool', '-tool', 'tool']) {
      if (lc.endsWith(suffix)) {
        next = stripped.slice(0, -suffix.length).replace(/[_-]+$/, '');
        break;
      }
    }
    if (!next || next === stripped) break;
    if (validNames.has(next)) return next;
    if (validNames.has(next.toLowerCase())) return next.toLowerCase();
    stripped = next;
  }
  // Step 5: 模糊匹配 — 阈值更宽松（Hermes difflib cutoff=0.7 ≈ 距离 ≤ 30%）
  //   但短名（如 TodoTool 长度 8）容易误判，加 min 4 绝对阈值防止瞎配
  let best = null;
  let bestScore = Infinity;
  for (const v of validNames) {
    const score = levenshtein(lower, v.toLowerCase());
    if (score < bestScore) { bestScore = score; best = v; }
  }
  // 阈值规则：score <= max(3, floor(name.length * 0.4))
  //   TodoTool_tool(13 chars) -> todo_tool score 4: 4 <= max(3, 5) ✓ 修复
  //   xyz_unknown(11) -> 任何 valid name score >= 7: 不修（不瞎配）
  const threshold = Math.max(3, Math.floor(name.length * 0.4));
  if (best !== null && bestScore <= threshold) return best;
  return name; // 修不了，原样返回
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 4) return 99;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

// v0.33: tool result 截断（参考 Hermes enforce_turn_budget:181）
//   防止 LLM 调一次 read_file 拿到 50KB 文件把 context 撑爆
//   ACMS 没 sandbox fs 持久化机制，改成"超阈值截断 + 在 message 里标注"，后续轮 LLM 自己判断要不要 read 一次小窗口
const TOOL_RESULT_TRUNCATE_BYTES = 96 * 1024; // 单条 tool result 96KB 阈值（v0.64: 12→96KB，historical-events.json 16KB 一次返回不截断）

function truncateToolResult(name, result) {
  const json = JSON.stringify(result);
  if (json.length <= TOOL_RESULT_TRUNCATE_BYTES) return { result, truncated: false, origSize: json.length };
  // 截断策略：保留前 8KB + 后 2KB + 标注
  const head = json.slice(0, 8 * 1024);
  const tail = json.slice(-2 * 1024);
  const truncated = {
    _truncated: true,
    _origSize: json.length,
    _truncatedAt: TOOL_RESULT_TRUNCATE_BYTES,
    _hint: 'Output exceeded ' + Math.round(TOOL_RESULT_TRUNCATE_BYTES / 1024) + 'KB and was truncated. If you need a specific section, use agent_read_file with offset/limit for a smaller window or grep for the exact pattern.',
    head,
    tail,
  };
  return { result: truncated, truncated: true, origSize: json.length };
}

// v0.33: stream stall detection（参考 Hermes run_agent.py:8330）
//   模型 stream 中途中断时，partial_tool_names 列表里记录了"LLM 想调但没真跑"的 tool
//   我们没法直接检测 partial_tool_names（那是 OpenAI stream 协议层），但可以检测 "LLM 返回 content 但没 tool_calls + content 里提了 'I will write'"
function detectStreamStall(result, messages) {
  if (!result || result.toolCalls?.length > 0) return null;
  const content = (result.content || '').toLowerCase();
  const stallPhrases = [
    'i will write', "i'll write", 'let me write', 'i will create', 'i will modify', 'i will update',
    'now i will', 'next i will', 'will create', 'will write', 'will implement',
    // v0.66 中文装睡检测：LLM 说"这就为你生成"但实际不调工具
    '这就为你', '这就给', '我这就', '马上为你', '我来为你',
    // v0.66 更多装睡模式：LLM 说"正在为您XX"但实际不调工具
    '正在为您', '正在为你', '正在生成', '正在准备', '请稍等', '请稍后',
    // v0.73: 更多装睡模式
    '任务已提交', '正在创作', '请耐心等待', '已提交', '图片生成任务', '秒后完成', '消化一下', '让我想想', '我先看看',
    // v0.75: 承诺-不调型 — LLM 说「我用 X 帮你」「马上帮你 X」但不调工具
    '马上帮你', '我帮你', '帮你找', '帮你搜', '帮你查', '帮你写', '帮你画',
    '我用 web_search', '我用 generate_image', '我用 send_email', '我用 play_music', '我用 query_collection',
    '用 web_search 帮你', '用 generate_image 帮你', '用 play_music 帮你', '用 send_email 帮你',
    '我给你', '让我给你', '我马上给你',
    // v0.79: 扩展装睡检测 — LLM 说"让我重新/再创建/帮你创建"但不调 tool
    '让我重新', '让我再', '帮你重新', '帮我重新', '我再', '我再帮你', '重新创建', '重新建',
    '帮你创建', '让我建', '让我添加', '让我创建', '让我补充',
    // v0.92: 视频生成装睡检测
    '视频生成任务已创建', '视频生成任务', '生成视频任务', '视频卡片', '视频已提交',
  ];
  const matched = stallPhrases.filter(p => content.includes(p));
  if (matched.length > 0) {
    // v1.1 (P12): 疑问句豁免 — 「需要我帮你查吗？」是提议不是承诺
    //   实踩(2026-08-20 trc_mt0qtowi_dhvp): 用户问"没有地方可以查比特币的行情么？",
    //   小吉回答渠道列表后礼貌收尾"需要我帮你查一下今天的比特币具体价格吗？"
    //   → 命中 '我帮你'/'帮你查' 被 stall 误伤,强制第二轮重复给列表。
    //   规则: 问号结尾 / 吗么结尾 / 「需要我|要我|可以我」开头 = 提议句,不判装睡。
    //   「吧」结尾不豁免(「我帮你找找看吧」是承诺不是提议)。
    const trimmed = content.trim();
    const isQuestion = /[?？]\s*$/.test(trimmed)
      || /(吗|么)\s*$/.test(trimmed)
      || /^(需要|要|可以|想|让)我/.test(trimmed);
    if (isQuestion) {
      return null;
    }
    return { phrases: matched, contentPreview: (result.content || '').slice(0, 200) };
  }
  return null;
}

/**
 * v1.1 (2026-08-20): 服务端强制兜底数据获取 — 查询类请求首轮 LLM 不调工具时代执行。
 * 治 agnes-2.5-flash 等模型不遵守 function-calling，直接编造新闻（trace trc_mt1kiue4_xymk）。
 * 数据获取优先级：
 *   1. 新闻/财经/行情类 → 华尔街见闻 7x24 快讯 API 直连（真实数据源，免登录 JSON，Hermes 实测 2026-08-20）
 *   2. 其他查询类 → 服务端直接调 web_search（不依赖 LLM 发起 tool_call）
 * @param {string} query 用户查询原文
 * @param {object} opts { progressCallback, round, maxRounds }
 * @returns {Promise<{injected:boolean, source:string, formatted:string, count:number, durationMs:number, error?:string}>}
 */
async function _serverAutoFetch(query, opts = {}) {
  const _t0 = Date.now();
  const newsLike = /新闻|资讯|财经|经济|热点|今日|今天|最新|行情|大盘|股市|市场/.test(query);
  try {
    // ── 路径 1: 新闻/财经/行情类 → 华尔街见闻 lives API 直连 ──
    if (newsLike) {
      const wallstcnUrl = 'https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&limit=15';
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 10000);
      try {
        const resp = await fetch(wallstcnUrl, {
          signal: ctrl.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        clearTimeout(to);
        if (resp.ok) {
          const data = await resp.json();
          const items = data?.data?.items || [];
          if (Array.isArray(items) && items.length > 0) {
            // 只保留今天（北京时间）的快讯，按时间倒序
            const now = Date.now();
            const todayItems = items.filter(it => it.display_time && (now - it.display_time * 1000) < 26 * 3600 * 1000);
            const list = (todayItems.length > 0 ? todayItems : items).slice(0, 15);
            const formatted = list.map((it, i) => {
              const dt = new Date((it.display_time || now) * 1000);
              const hm = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
              const text = (it.content_text || it.title || '').replace(/\s+/g, ' ').trim().slice(0, 220);
              return `[${i + 1}] ${hm} ${text}`;
            }).join('\n');
            if (formatted) {
              return { injected: true, source: '华尔街见闻7x24快讯', formatted, count: list.length, durationMs: Date.now() - _t0 };
            }
          }
        }
      } catch (e) {
        clearTimeout(to);
        console.warn(`[runToolLoop] v1.1 华尔街见闻 API 直连失败: ${e.message}`);
      }
    }

    // ── 路径 2: 其他查询类 → 服务端执行 web_search ──
    if (opts.progressCallback) opts.progressCallback((opts.round || 0) + 1, opts.maxRounds || 10, '系统代查实时信息中...', ['web_search']);
    const { searchWeb } = require('./web-search');
    const sr = await searchWeb(query, { maxResults: 10 });
    if (sr && !sr.error && Array.isArray(sr.results) && sr.results.length > 0) {
      const formatted = sr.results.map((r, i) => {
        const snip = (r.snippet || '').slice(0, 200);
        return `[${i + 1}] **${r.title}**\n    ${r.url}${snip ? '\n    > ' + snip : ''}`;
      }).join('\n\n');
      return { injected: true, source: 'web_search（服务端代执行）', formatted, count: sr.results.length, durationMs: Date.now() - _t0 };
    }
    return { injected: false, error: sr?.error || 'web_search 无结果', durationMs: Date.now() - _t0 };
  } catch (e) {
    return { injected: false, error: e.message, durationMs: Date.now() - _t0 };
  }
}

async function runToolLoop(modelId, messages, options = {}) {
  const maxRounds = options.maxRounds ?? 10;
  const toolNames = options.toolNames;
  const context = options.context || {};  // v0.20：透传给 tool handler（music/video/image_gen 需要 reqId）
  const progressCallback = options.onProgress;  // v0.35：每轮进度回调
  const model = modelStore.getById(modelId);
  if (!model) throw Object.assign(new Error('模型不存在'), { status: 404 });
  const api = model.api || 'openai-chat';
  // v0.101: Agent 运行全链路追踪 — 系统管理开关 agent_trace_enabled，开则记录完整链路
  //   记录：每轮 messages 快照 / LLM 完整响应 / 工具调用（args+结果+耗时）/ steer 事件
  let trace = null;
  try {
    const traceSvc = _getTraceSvc();
    if (traceSvc.isTraceEnabled()) {
      trace = traceSvc.startTrace({
        modelId,
        maxRounds,
        toolNames: Array.isArray(toolNames) ? toolNames.slice() : [],
        context: {
          taskId: context.taskId || null,
          reqId: context.reqId || null,
          caller: options.caller || null,
          actionMode: options.actionMode || null,
        },
      });
    }
  } catch (e) { trace = null; }  // 追踪失败绝不影响主流程

  // v0.20 bugfix：检测 LLM 连续两轮调同一 tool + 相同 args → 强制退出（避免无限循环）
  //   旧 bug：LLM 调 play_music(song="X") → handler 返回 ok → LLM 再调确认 → 再返回 ok → 死循环
  //   修复：连续两轮同 tool+args 直接返回最后一次 content（不抛错），避免 LLM 死循环
  let lastToolCallKey = null;

  // v0.25 debug: 记录每轮 LLM 调了啥 + tool 结果，方便 PM 查 tool loop 卡死根因
  const toolCallHistory = [];

  // v0.100 (2026-08-18): 空 content 连续计数 — LLM 输出空内容不能当最终答案
  //   模型（如 MiniMax）调完工具后不写总结 → 空 content 被当最终答案 → 用户看到兜底文案
  //   空 content 注入重试提示最多 1 次（连续 2 次空直接放弃，避免死循环浪费轮次）
  let _emptyContentCount = 0;

  // v1.0 (Phase 6-B): 异步任务感知标记 — 注入[异步任务已提交]后,下轮 LLM 只需简短确认
  //   配合 P6-A: 降 max_tokens 到 300, 加速 LLM 响应
  let _asyncShortOutput = false;

  // P159: 上下文压缩抽到独立文件(借鉴 Hermes agent/context_compressor.py)
  //   4 个改进点:① 前置剪枝(pruneToolOutputs)不调 LLM ② token-based 触发 ③ 结构化 summary 模板
  //   ④ 失败冷却 10 分钟(避免反复重试失败摘要)
  //   治"runToolLoop 过度循环(22 轮重复验证)→ 信息爆炸 → LLM 注意力分散" bug
  const { compressMessages, resetRunState: _resetCCState } = require('./context_compressor');
  _resetCCState();  // 每次 runToolLoop 开始重置 per-run 状态

  // P160: 工具调用执行 helper — 返回 messages 数组
  async function _execToolCall(tc, toolReg, api, msgs, hist, rnd, ctx) {
    const _t0 = Date.now();  // v0.101: 工具执行计时（进 trace）
    const tool = toolReg.getTool(tc.name);
    const argsPreview = JSON.stringify(tc.args || {}).slice(0, 200);
    console.log(`[runToolLoop]   call: ${tc.name}(${argsPreview})`);
    const out = [];
    if (!tool) {
      const allTools = toolReg.listTools ? toolReg.listTools() : [];
      const validNames = new Set(allTools);
      const repaired = repairToolName(tc.name, validNames);
      if (repaired !== tc.name && validNames.has(repaired)) {
        const repairedTool = toolReg.getTool(repaired);
        if (repairedTool) {
          console.log(`[runToolLoop] v0.33 tool name repair: "${tc.name}" → "${repaired}"`);
          hist.push({ round: rnd + 1, tool: repaired, args: argsPreview, result: 'REPAIRED_NAME' });
          try {
            const toolResult = await repairedTool.handler(tc.args, ctx);
            const truncatedResult = truncateToolResult(repaired, toolResult);
            if (truncatedResult.truncated) {
              console.log(`[runToolLoop] v0.33 truncated ${repaired} result: ${truncatedResult.origSize} → ${TOOL_RESULT_TRUNCATE_BYTES} bytes`);
            }
            hist[hist.length - 1].resultPreview = JSON.stringify(truncatedResult.result).slice(0, 300);
            if (trace) trace.recordToolCall(rnd + 1, { tool: repaired, args: tc.args, result: truncatedResult.result, durationMs: Date.now() - _t0, error: null, note: 'REPAIRED_NAME' });
            out.push(toolRegistry.makeToolResult(api, tc.id, truncatedResult.result));
          } catch (e) {
            hist[hist.length - 1].error = e.message;
            if (trace) trace.recordToolCall(rnd + 1, { tool: repaired, args: tc.args, result: null, durationMs: Date.now() - _t0, error: e.message, note: 'REPAIRED_NAME' });
            out.push(toolRegistry.makeToolResult(api, tc.id, { error: e.message }));
          }
          return out;
        }
      }
      console.log(`[runToolLoop]   -> 未知工具: ${tc.name}`);
      hist.push({ round: rnd + 1, tool: tc.name, args: argsPreview, result: 'UNKNOWN_TOOL' });
      if (trace) trace.recordToolCall(rnd + 1, { tool: tc.name, args: tc.args, result: null, durationMs: 0, error: 'UNKNOWN_TOOL' });
      out.push(toolRegistry.makeToolResult(api, tc.id, { error: `未知工具: ${tc.name}` }));
      return out;
    }
    const callKey = `${tc.name}:${JSON.stringify(tc.args)}`;
    if (callKey === lastToolCallKey) {
      console.warn(`[runToolLoop]   -> 检测到连续两轮同 tool+args — 警告 LLM，不强制退出 (round ${rnd + 1}/${maxRounds})`);
      hist.push({ round: rnd + 1, tool: tc.name, args: argsPreview, result: 'WARN_REPEAT' });
      if (trace) trace.recordToolCall(rnd + 1, { tool: tc.name, args: tc.args, result: null, durationMs: 0, error: 'WARN_REPEAT', note: '连续两轮同 tool+args' });
      out.push(toolRegistry.makeToolResult(api, tc.id, {
        warning: `You just called ${tc.name} with the same arguments in the previous round. This is a repeated call. If you have enough information, write the files or finish. If you need different info, try a different tool or different arguments. Do NOT call the same tool with the same arguments again — you have limited rounds left (${maxRounds - rnd - 1} rounds remaining).`,
        _duplicateCall: true,
      }));
      lastToolCallKey = callKey;
      return out;
    }
    lastToolCallKey = callKey;
    try {
      const pre = await runPreHooks(tc.name, tc.args, ctx);
      if (pre.abort) {
        hist.push({ round: rnd + 1, tool: tc.name, args: argsPreview, result: 'PRE_HOOK_ABORT', error: pre.abortReason });
        if (trace) trace.recordToolCall(rnd + 1, { tool: tc.name, args: tc.args, result: null, durationMs: Date.now() - _t0, error: 'PRE_HOOK_ABORT: ' + (pre.abortReason || '') });
        out.push(toolRegistry.makeToolResult(api, tc.id, { ok: false, aborted: true, reason: pre.abortReason }));
        return out;
      }
      const finalArgs = pre.args || tc.args;
      const toolResult = await tool.handler(finalArgs, ctx);
      const resultPreview = JSON.stringify(toolResult).slice(0, 300);
      const postResult = await runPostHooks(tc.name, finalArgs, toolResult, ctx);
      const truncated = truncateToolResult(tc.name, postResult);
      if (truncated.truncated) {
        console.log(`[runToolLoop] v0.33 truncated ${tc.name} result: ${truncated.origSize} → ${TOOL_RESULT_TRUNCATE_BYTES} bytes`);
      }
      console.log(`[runToolLoop]   -> result (${resultPreview.length} chars): ${resultPreview}`);
      hist.push({ round: rnd + 1, tool: tc.name, args: argsPreview, resultPreview });
      if (trace) trace.recordToolCall(rnd + 1, { tool: tc.name, args: tc.args, result: truncated.result, durationMs: Date.now() - _t0, error: null });
      out.push(toolRegistry.makeToolResult(api, tc.id, truncated.result));
    } catch (e) {
      console.log(`[runToolLoop]   -> ERROR: ${e.message}`);
      hist.push({ round: rnd + 1, tool: tc.name, args: argsPreview, error: e.message });
      if (trace) trace.recordToolCall(rnd + 1, { tool: tc.name, args: tc.args, result: null, durationMs: Date.now() - _t0, error: e.message });
      out.push(toolRegistry.makeToolResult(api, tc.id, { error: e.message }));
    }
    return out;
  }














































  for (let round = 0; round < maxRounds; round++) {
    console.log(`[runToolLoop] round=${round + 1}/${maxRounds} | messages=${messages.length} | taskId=${context.taskId || '?'}`);

    // v0.45: 执行中途 steer 检查 — 如果 progress_note 中有新的 steer message，注入到 messages
    if (context.taskId && progressCallback) {
      try {
        const { collection } = require('../../db/connection');
        const task = collection('tasks').findOne(t => t.id === context.taskId);
        if (task && task.progress_note) {
          const steerMatch = task.progress_note.match(/--- PM Steer ---\n([\s\S]*?)(?:\n--- PM Steer ---|$)/);
          if (steerMatch && steerMatch[1] && steerMatch[1].trim()) {
            const steerMsg = steerMatch[1].trim();
            // 检查是否已经注入过（避免重复注入）
            const alreadyInjected = messages.some(m => m.content && m.content.includes(steerMsg.slice(0, 50)));
            if (!alreadyInjected) {
              messages.push({
                role: 'user',
                content: `# PM Direction\n\n${steerMsg}\n\nPlease incorporate this direction into your current work.`,
              });
              console.log(`[runToolLoop] v0.45 PM steer injected for task ${context.taskId}: ${steerMsg.slice(0, 100)}...`);
            }
          }
        }
      } catch (e) { /* steer check failed, continue */ }
    }

    // P159: 阈值判断 + 摘要逻辑全部抽到 context-compressor.js(shouldCompress + compressMessages)
    await compressMessages(messages, { modelId });

    // v0.44.4: 去掉 L576 的"模型思考中..."推送——它总是在每轮最后覆盖 tool call entry
    //   因为下一轮 L576 push 的时间戳 > 上一轮 L616 push 的时间戳
    //   SSE 推 lastEntry，永远看到"模型思考中..."而不是 tool call
    //   修法：不推了，只保留 tool call 的 log entry
// v0.31 fix: Diagnostic mode — 每个 LLM 调用前 dump 完整 messages + 调用后 dump response
    //   让多多能看到"发给 LLM 啥 + LLM 返回啥"，找到装睡根因
    const sysContent = messages[0]?.content || '';
    const remainingRounds = maxRounds - round;
    // v0.45: 把剩余轮次注入到 messages，让 LLM 知道紧迫感（避免到第 80 轮还在试探）
    if (round >= 3 && round % 5 === 0) {
      // 每 5 轮注入一次预算提醒
      if (trace) trace.addNote(round + 1, 'budget_alert', remainingRounds + ' rounds remaining');
      messages.push({
        role: 'user',
        content: `[Budget Alert] ${remainingRounds} rounds remaining of ${maxRounds}. If you're stuck in a loop (e.g. repeatedly reading the same file or executing similar commands), break the loop NOW: switch to agent_write_file or agent_patch_file with a complete solution. Do not over-explore.`
      });
    }
    console.log(`[runToolLoop] LLM_CALL#${round + 1}/${maxRounds} (剩余 ${remainingRounds}) system_prompt_len=${sysContent.length} system_preview="${sysContent.slice(0, 300).replace(/\n/g, ' ')}..."`);
    // v1.1 (2026-08-20): 新闻/财经/行情类请求首轮预注入真实数据 —
    //   web_search（头条热榜）对"今日经济新闻"返回泛社会热点（实测 trc_mt1nrfbl_tkji），
    //   LLM 基于垃圾结果总结 = 回答质量差。新闻类直接服务端直连华尔街见闻 7x24 快讯 API，
    //   把真实数据预注入 messages（LLM 首轮即见真数据，不依赖它调工具、不依赖 web_search 质量）。
    if (round === 0 && (!options || options.actionMode !== 'conversation') && Array.isArray(toolNames) && toolNames.includes('web_search')) {
      const _lastUser = [...messages].reverse().find(m => m.role === 'user' && typeof m.content === 'string' && m.content.trim() && !m.content.trim().startsWith('['));
      const _uq = _lastUser ? _lastUser.content.trim().slice(0, 100) : '';
      const _newsLike = /新闻|资讯|财经|经济|热点|今日|今天|最新|行情|大盘|股市|市场/.test(_uq);
      const _alreadyInjected = messages.some(m => typeof m.content === 'string' && m.content.includes('[系统代查结果]'));
      if (_newsLike && _uq && !_alreadyInjected) {
        const _auto = await _serverAutoFetch(_uq, { progressCallback, round, maxRounds });
        if (_auto && _auto.injected) {
          messages.push({
            role: 'user',
            content: `[系统代查结果] 用户请求实时信息「${_uq}」，系统已自动获取以下真实数据（来源: ${_auto.source}，非模型编造）：\n\n${_auto.formatted}\n\n请基于以上真实数据回答用户。若数据不含用户要的具体项，可继续调用工具（web_search/fetch_url）补充，但严禁编造数字/日期/新闻内容。`,
          });
          toolCallHistory.push({ round: round + 1, tool: 'web_search', args: _uq, result: 'SERVER_AUTO', resultPreview: `server-auto ${_auto.source}: ${_auto.count} 条` });
          if (trace) trace.recordToolCall(round + 1, { tool: 'web_search', args: { query: _uq, serverAuto: true, source: _auto.source }, result: { count: _auto.count, source: _auto.source }, durationMs: _auto.durationMs || 0, error: null, note: 'SERVER_AUTO' });
          if (trace) trace.addNote(round + 1, 'server_auto_fetch', `${_auto.source} ${_auto.count}条 query="${_uq.slice(0, 40)}"`);
          console.log(`[runToolLoop] v1.1 新闻类预注入 ${_auto.source}: ${_auto.count} 条`);
        } else {
          console.warn(`[runToolLoop] v1.1 新闻类预注入失败，走 LLM 自主工具路径: ${_auto ? _auto.error : 'no result'}`);
        }
      }
    }
    if (sysContent.length > 300) console.log(`[runToolLoop] LLM_CALL#${round + 1} system_tail="${sysContent.slice(-300).replace(/\n/g, ' ')}"`);
    console.log(`[runToolLoop] LLM_CALL#${round + 1} messages_count=${messages.length}`);
    // dump 最近 5 条 messages（每条前 250 字符）— v0.31.1 容错 content 为 null/undefined
    messages.slice(-5).forEach((m, idx) => {
      const safeContent = typeof m.content === 'string' ? m.content : '';
      const preview = safeContent
        ? safeContent.slice(0, 250).replace(/\n/g, ' | ')
        : (m.tool_calls ? `[tool_calls: ${m.tool_calls.map(tc => tc.function?.name || tc.name).join(',')}]` : '(empty)');
      console.log(`[runToolLoop] LLM_CALL#${round + 1} msg[${messages.length - 5 + idx}] role=${m.role} preview="${preview}"`);
    });
    // v0.101: 记录本轮发送给 LLM 的完整 messages 快照（压缩/预算注入之后 = 真实发送内容）
    const _llmT0 = Date.now();
    if (trace) trace.beginRound(round + 1, _getTraceSvc().cloneMessages(messages));
    // v1.0 (Phase 6-B): 异步任务提示后降 max_tokens — 只需简短确认,不需要 4000 token
    //   治「程响的可能等 116 秒」: 注入[异步任务已提交]后,LLM 只需输出 10-20 字确认
    const _llmOptions = (_asyncShortOutput && (options.maxTokens || 0) > 300)
      ? { ...options, maxTokens: 300 }
      : options;
    const result = await callLLMWithTools(modelId, messages, { ..._llmOptions, toolNames });
    // v0.31 fix: dump LLM 完整 response
    const content = typeof result.content === 'string' ? result.content : '';
    console.log(`[runToolLoop] LLM_RESP#${round + 1} content_len=${content.length} finish_reason=${result.finishReason || 'n/a'} tool_calls=${result.toolCalls?.length || 0}`);
    console.log(`[runToolLoop] LLM_RESP#${round + 1} content="${content.slice(0, 600).replace(/\n/g, ' | ')}"`);
    if (content.length > 600) console.log(`[runToolLoop] LLM_RESP#${round + 1} content_tail="${content.slice(-300).replace(/\n/g, ' | ')}"`);
    // v0.101: 记录 LLM 完整响应（原始 tool_calls，去重前）
    if (trace) trace.recordLLMResponse(round + 1, {
      content,
      finishReason: result.finishReason || null,
      toolCalls: result.toolCalls ? result.toolCalls.map(tc => ({ name: tc.name, id: tc.id, args: tc.args })) : [],
      usage: result.usage || null,
      durationMs: Date.now() - _llmT0,
    });
    if (result.toolCalls) {
      // v0.33 C 方案: 同 turn 静默去重（治根因 — LLM 经常同 turn 调多次 read_file 浪费预算）
      //   参考 Hermes _deduplicate_tool_calls:6078
      const beforeDedup = result.toolCalls.length;
      result.toolCalls = deduplicateToolCalls(result.toolCalls);
      if (result.toolCalls.length < beforeDedup) {
        console.log(`[runToolLoop] v0.33 dedup: ${beforeDedup} → ${result.toolCalls.length} tool_calls`);
      }

      // v0.81: 强制限制 web_search 重复调用 — LLM 不遵守 system prompt 约束，必须在代码层拦截
      // v0.87b: 放宽为"允许 2 次"——第 1 次搜数据，第 2 次用于**定位数据源 URL**
      //   （如"深圳95号汽油价格"→ 搜"油价查询 深圳 官网"拿到真实 URL 再 fetch_url）
      //   第 3 次起强制终止。之前只允许 1 次，LLM 拿不到数据源 URL 只能瞎猜域名。
      const webSearchCalls = toolCallHistory.filter(h => h.tool === 'web_search');
      const hasWebSearchInThisTurn = result.toolCalls.some(tc => tc.name === 'web_search');
      if (webSearchCalls.length >= 2 && hasWebSearchInThisTurn) {
        console.warn(`[runToolLoop] v0.81 强制终止: web_search 已调用 ${webSearchCalls.length} 次，禁止再次调用`);
        if (trace) trace.addNote(round + 1, 'web_search_force_stop', '已调用 ' + webSearchCalls.length + ' 次');
        messages.push({
          role: 'user',
          content: `[系统强制终止] 你已调用 web_search 两次（一次搜数据，一次定位数据源），严禁第三次调用 web_search。如果你仍认为搜索结果不含用户要的具体数据，用 **fetch_url** 抓取已找到的真实数据源 URL；若没有可靠 URL，如实告诉用户"没找到"，不要建议用户自己去看，也不要瞎猜域名。直接输出最终答案。]`,
        });
        continue;
      }

      for (const tc of result.toolCalls) {
        const argsStr = JSON.stringify(tc.args || {}).slice(0, 400);
        console.log(`[runToolLoop] LLM_RESP#${round + 1} tool_call name=${tc.name} id=${tc.id} args="${argsStr}"`);
        // v0.44.3: 在 LLM 返回 tool_calls 后立即写一条 log（在 tool handler 执行前）
        //   因为 saveProgress L576 推的"模型思考中..."总是排在 tool call entry 后面
        //   但 SSE 只推 lastEntry，导致前端永远看不到 tool call
        //   修法：先推 tool call entry，再推"模型思考中..."，确保 tool call 在数组末尾
        if (progressCallback && toolRegistry) {
          const toolDesc = getToolDisplayName(tc.name);
          const toolArgsPreview = argsStr.slice(0, 200);
          // v0.46: 把 LLM 的分析思考也写进 log，让 PM 能看到 agent 的思路
          const thought = (result.content || '').trim();
          const thoughtPreview = thought ? '💡 ' + thought.slice(0, 300).replace(/\n/g, ' ') + '\n' : '';
          progressCallback(round + 1, maxRounds, thoughtPreview + `调用工具: ${toolDesc} (${toolArgsPreview})`, [tc.name]);
        }
      }
    }
    if (result.usage) console.log(`[runToolLoop] LLM_RESP#${round + 1} usage=${JSON.stringify(result.usage)}`);
    if (!result.toolCalls?.length) {
      // v0.100 (2026-08-18): 空 content 拦截 — LLM 输出空内容不能当最终答案
      //   原逻辑只判断 tool_calls 为空就进最终答案分支，content='' 也放行 → 用户看到兜底文案
      //   修法：调过工具 → 强制要求基于工具结果写总结；没调过 → 强制要求回答
      const _rawContent = String(result.content || '').trim();
      if (!_rawContent) {
        _emptyContentCount += 1;
        if (trace) trace.addNote(round + 1, 'empty_content', '第 ' + _emptyContentCount + ' 次空内容');
        if (_emptyContentCount >= 2 || round >= maxRounds - 1) {
          // 连续 2 次空 / 最后一轮 → 放弃重试，返回空（上层 abort/兜底处理）
          console.warn(`[runToolLoop] v0.100 空 content round=${round + 1}: 连续 ${_emptyContentCount} 次空内容, 放弃重试`);
          if (trace) { trace.addNote(round + 1, 'empty_content_give_up', '连续 ' + _emptyContentCount + ' 次空内容'); trace.finish({ content: '', finishReason: 'empty_content', usage: result.usage || null }); }
          return {
            content: '',
            finishReason: 'empty_content',
            toolCalls: [],
            toolCallCount: toolCallHistory.length,
            usage: result.usage || null,
          };
        }
        console.warn(`[runToolLoop] v0.100 空 content round=${round + 1}: LLM 返回空内容, 注入重试提示`);
        messages.push({
          role: 'user',
          content: toolCallHistory.length > 0
            ? `[系统检测到你的回复内容为空。你已调用 ${toolCallHistory.length} 次工具，请根据工具执行结果输出最终答案给用户（总结做了什么/结果如何），不得输出空内容。]`
            : '[系统检测到你的回复内容为空。请直接回答用户的问题，或调用可用工具执行。]',
        });
        continue;
      }
// v0.33 C 方案: stream stall detection（参考 Hermes run_agent.py:8330）
      //   LLM 返回 content 但没 tool_calls + content 提到"i will write" → 装睡信号
      //   比装睡检测更前置：装睡检测需要 LLM 调 tool，stall detection 是"连 tool 都不调但嘴上说会调"
      // v1.0 (Phase 2-C): 豁免"刚成功调过工具"的轮次
      //   异步工具（play_music/generate_image）返回 reqId 后,LLM 想自然回复用户「好的我帮你找」
      //   → 含「正在为你」/「帮你找」触发 stall → LLM 被警告 → 死循环直到 maxRounds
      //   治 4/5 stall 死循环 trace (msyt6tv8/msytjpfw/msyu0jla/msyvboo6)
      //   只在 toolCallHistory.length === 0 (本轮之前完全没调过工具) 时才判 stall
      const stall = detectStreamStall(result, messages);
      if (stall) {
        if (toolCallHistory.length > 0) {
          console.log(`[runToolLoop] v1.0 stall 豁免: round=${round + 1} 已调 ${toolCallHistory.length} 次工具,放行自然回复`);
          // 不 continue,让 LLM 自然返回 content
        } else {
          console.warn(`[runToolLoop] v0.33 STALL detected round=${round + 1}: phrases=${stall.phrases.join(',')} preview="${stall.contentPreview}"`);
          if (trace) trace.addNote(round + 1, 'stall', 'phrases=' + stall.phrases.join(','));
          messages.push({
            role: 'user',
            content: `[系统检测到你嘴上说 "${stall.phrases[0]}" 但没真调 tool。请立即调对应 tool 实际执行（不要继续描述意图）。如果还剩 ${maxRounds - round - 1} 轮，请专注。]`,
          });
          continue;
        }
      }
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
        if (trace) trace.addNote(round + 1, 'user_steer_sleeping', 'LLM 装睡未写文件');
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
      // v0.85: 残留工具标签检测 — LLM 输出的工具调用标签格式未被解析（如第 6 种
      //   <arg_key>/<arg_value> 无工具名变体），禁止把乱码当最终答案 → 强制重试
      const tagRe = /<\s*[\/\\s\u200b_]*\|?tool|openapi<tool_sep>|<function[\s=>(]|<arg_key>|<\|\s*tool_begin\s*\|>/i;
      if (tagRe.test(content)) {
        console.warn(`[runToolLoop] v0.85 残留工具标签 round=${round + 1}: 标签格式未解析, 注入重试提示`);
        if (trace) trace.addNote(round + 1, 'residual_tool_tag', '');
        messages.push({
          role: 'user',
          content: `[系统检测到你的回复包含工具调用标签（如 <tool_call>/<arg_key>/openapi<tool_sep>/<function>）但格式未被识别。请改用标准工具调用格式：直接输出 JSON 格式的 tool_call（工具名+参数），不要输出任何 XML/尖括号标签。]`,
        });
        continue;
      }
      // v0.87h: 首轮强制工具检查 — 路由层已判定 single_action + 有可用工具（toolNames 非空），
      //   但 LLM 第一轮 tool_calls=0 直接给文字答案（如"抱歉没找到，建议官方渠道"）
      //   → 这是装睡的变体（历史对话里的失败示范会让 LLM 直接复述失败结论）
      //   → 强制重试，忽略历史失败，要求本轮实际调工具
      //   ⚠️ 闲聊模式（conversation）跳过：用户说"在干嘛/你好/早上好"等不需要调工具
      // v1.1 (2026-08-20): 服务端强制兜底 — 查询类请求（web_search 可用）首轮无工具时，
      //   不依赖模型自觉，代码层直接代执行数据获取（新闻类→华尔街见闻 API 直连 / 其他→web_search），
      //   把真实数据注入 messages 再让 LLM 总结。治 agnes-2.5-flash 等模型不遵守 function-calling
      //   直接编造新闻（trace trc_mt1kiue4_xymk 实测：2 轮 0 工具调用，编造 597 字假新闻）。
      const isConversationMode = options && options.actionMode === 'conversation';
      if (round === 0 && Array.isArray(toolNames) && toolNames.length > 0 && toolCallHistory.length === 0 && !isConversationMode) {
        console.warn(`[runToolLoop] v0.87h 首轮未调工具 round=${round + 1}: 有工具(${toolNames.join(',')})但 tool_calls=0, 强制重试`);
        if (trace) trace.addNote(round + 1, 'first_round_no_tool', 'tools=' + toolNames.join(','));
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user' && typeof m.content === 'string' && m.content.trim() && !m.content.trim().startsWith('['));
        const userQuery = lastUserMsg ? lastUserMsg.content.trim().slice(0, 100) : '';
        // 查询类关键词闸：只有真正的查询/检索请求才代执行，避免误伤"帮我写首诗"等创作类
        const queryLike = /查|搜|找|最新|今天|行情|新闻|价格|多少|怎么样|如何|什么|资讯|热点|财经|经济|汇率|天气/.test(userQuery);
        const serverAutoOk = toolNames.includes('web_search') && userQuery && queryLike;
        if (serverAutoOk) {
          const autoResult = await _serverAutoFetch(userQuery, { progressCallback, round, maxRounds });
          if (autoResult && autoResult.injected) {
            messages.push({
              role: 'user',
              content: `[系统代查结果] 用户请求实时信息「${userQuery}」，系统已自动获取以下真实数据（来源: ${autoResult.source}，非模型编造）：\n\n${autoResult.formatted}\n\n请基于以上真实数据回答用户。若数据不含用户要的具体项，可继续调用工具（web_search/fetch_url）补充，但严禁编造数字/日期/新闻内容。`,
            });
            toolCallHistory.push({ round: round + 1, tool: 'web_search', args: userQuery, result: 'SERVER_AUTO', resultPreview: `server-auto ${autoResult.source}: ${autoResult.count} 条` });
            if (trace) trace.recordToolCall(round + 1, { tool: 'web_search', args: { query: userQuery, serverAuto: true, source: autoResult.source }, result: { count: autoResult.count, source: autoResult.source }, durationMs: autoResult.durationMs || 0, error: null, note: 'SERVER_AUTO' });
            if (trace) trace.addNote(round + 1, 'server_auto_fetch', `${autoResult.source} ${autoResult.count}条 query="${userQuery.slice(0, 40)}"`);
            console.log(`[runToolLoop] v1.1 服务端代执行 ${autoResult.source} 成功: ${autoResult.count} 条`);
            continue;
          }
          console.warn(`[runToolLoop] v1.1 服务端代执行失败，回退注入提示: ${autoResult ? autoResult.error : 'no result'}`);
        }
        messages.push({
          role: 'user',
          content: `[系统检测到这是本轮对话的第一轮，你有可用工具（${toolNames.join('、')}）但未调用任何工具。**忽略之前对话中"没找到/建议官方渠道"的失败示范**，本轮必须实际调用工具（如 web_search）重新执行。严禁直接给出"抱歉没找到"类回答。]`,
        });
        continue;
      }
      // v0.92: 连续两轮不调工具兜底 — 首轮强制重试后 LLM 仍不调工具时，再推一把
      //   根因：history 里有大量失败示范（纯文字回复），LLM 复述这些模式
      //   检测：toolCallHistory 为空 + 当前轮 tool_calls=0 + 内容含装睡短语
      if (round > 0 && Array.isArray(toolNames) && toolNames.length > 0 && toolCallHistory.length === 0) {
        const forcePhrases = ['视频生成任务已创建', '视频生成任务', '生成视频任务', '视频卡片', '视频已提交',
          '任务已提交', '正在创作', '请耐心等待', '已提交', '图片生成任务', '秒后完成',
          '这就为你', '我这就', '马上为你', '我来为你', '正在为您', '正在为你', '正在生成', '正在准备'];
        const hasForcePhrase = forcePhrases.some(p => (result.content || '').includes(p));
        if (hasForcePhrase) {
          console.warn(`[runToolLoop] v0.92 连续 ${round + 1} 轮未调工具 + 含装睡短语，强制注入最终提示`);
          if (trace) trace.addNote(round + 1, 'force_final_prompt', '');
          messages.push({
            role: 'user',
            content: `[最后机会！你有工具 ${toolNames.join('、')} 可用。请立即调用其中合适的工具来执行用户请求，不要再回复纯文字。调用工具后你的回复会自动显示给用户。]`,
          });
          continue;
        }
      }
      // v0.75: 承诺-不调型检测 — LLM 嘴上说「用 X 工具帮你」但不真调 → 自动构造 tool_call
      const commitToolRe = /用 (generate_image|web_search|play_music|send_email|document_gen|plan_execute|query_collection|search_knowledge|search_history)/i;
      const commitMatch = commitToolRe.exec(content);
      if (commitMatch) {
        const mentionedTool = commitMatch[1].toLowerCase();
        console.warn(`[runToolLoop] v0.75 承诺-不调: round=${round + 1} LLM 提到「${mentionedTool}」但不调 → 重提示`);
        if (trace) trace.addNote(round + 1, 'promise_no_call', mentionedTool);
        messages.push({
          role: 'user',
          content: `[系统检测到你在回复中提到了「${mentionedTool}」但未实际调用。请立即调 ${mentionedTool} 工具来执行，不要继续用文字描述。]`,
        });
        continue;
      }

      console.log(`[runToolLoop] round=${round + 1} LLM 返回最终答案 (no tool calls), content=${(result.content || '').length} chars`);
      if (toolCallHistory.length > 0) console.log(`[runToolLoop] 完整 tool call history:\n${toolCallHistory.map(h => `  r${h.round} ${h.tool}(${(h.args||'').slice(0, 100)})`).join('\n')}`);
      // v0.35: 最终答案回调
      if (progressCallback) {
        progressCallback(round + 1, maxRounds, '正在生成任务总结...', toolCallHistory.map(h => h.tool).slice(-3));
      }
      // v0.63 透明化根因：返回带诊断信息的对象（agent-runtime.js 会包装成 rawDiag）
      //   旧 string 路径会丢失 toolCallHistory/finishReason，导致 task-agent 中止分支看不出根因
      if (trace) trace.finish({ content: result.content || '', finishReason: result.finishReason || 'stop', usage: result.usage || null });
      return {
        content: result.content || '',
        finishReason: result.finishReason || 'stop',
        toolCalls: [],  // 最后一轮没调 tool
        toolCallCount: toolCallHistory.length,
        usage: result.usage || null,
      };
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

    // P160: 工具并行执行 — Hermes _PARALLEL_SAFE_TOOLS 借鉴
    //   read/search/exec/git 类读操作可并发,write/patch 串行防竞态
    const _PARALLEL_SAFE_TOOLS = new Set([
      'agent_read_file', 'agent_list_files', 'agent_search_files',
      'agent_exec_command', 'agent_git_status', 'agent_git_log',
      'agent_git_diff', 'agent_set_phase',
    ]);
    const MAX_CONCURRENT_TOOLS = 4;
    const parallelCalls = [];
    const serialCalls = [];
    for (const _tci of result.toolCalls) {
      if (_PARALLEL_SAFE_TOOLS.has(_tci.name)) parallelCalls.push(_tci);
      else serialCalls.push(_tci);
    }
    // 并行组
    for (let i = 0; i < parallelCalls.length; i += MAX_CONCURRENT_TOOLS) {
      const batch = parallelCalls.slice(i, i + MAX_CONCURRENT_TOOLS);
      const batchResults = await Promise.allSettled(batch.map(async (_tc) => {
        return await _execToolCall(_tc, toolRegistry, api, messages, toolCallHistory, round, context);
      }));
      for (const res of batchResults) {
        if (res.status === 'fulfilled') {
          const msgs = res.value;
          if (msgs) for (const m of msgs) messages.push(m);
        } else {
          console.warn(`[runToolLoop] P160 并行工具失败: ${res.reason && res.reason.message || String(res.reason)}`);
          if (trace) trace.addNote(round + 1, 'parallel_tool_failed', res.reason && res.reason.message || String(res.reason));
        }
      }
    }
// 串行组
    for (const _tc of serialCalls) {
      const sres = await _execToolCall(_tc, toolRegistry, api, messages, toolCallHistory, round, context);
      if (sres) for (const m of sres) messages.push(m);
    }

    // v1.0 (Phase 2-D): plan_execute 调通后锁子工具
    //   治 mszcfa4s_kiyo 类失败: plan_execute 创建 plan 后,LLM 又单独调 generate_image/send_email
    //   扫描本轮 messages 末尾的工具结果,如果含 plan_id → 注入 user msg 让 LLM 知道 plan 已接管
    try {
      const lastToolMsgs = messages.slice(-Math.max(parallelCalls.length + serialCalls.length, 1));
      for (const m of lastToolMsgs) {
        if (m && m.role === 'tool' && typeof m.content === 'string') {
          let parsed = null;
          try { parsed = JSON.parse(m.content); } catch (_) {}
          if (parsed && (parsed.plan_id || parsed.planId) && parsed.ok !== false) {
            const planId = parsed.plan_id || parsed.planId;
            console.log(`[runToolLoop] v1.0 plan_execute 调通: plan_id=${planId}, 锁子工具`);
            if (trace) trace.addNote(round + 1, 'plan_lock', `plan_id=${planId}`);
            messages.push({
              role: 'user',
              content: `[Plan 已接管] plan_execute 已创建 plan_id=${planId} 并由 plan engine 调度执行。你（LLM）**不要**再调以下子工具：generate_image / send_email / play_music / play_video / web_search / fetch_url / document_gen / agnes_generate_video。等 plan_result 到达后系统会推送给你,再回复最终用户。]`,
            });
            break;
          }
        }
      }
    } catch (e) { /* plan 检测失败不应影响主流程 */ }

    // v1.0 (Phase 6-A): 异步任务感知 — 通用 reqId 检测
    //   治「程响的可能等 116 秒」: play_music 返回 reqId 后,LLM 不知道卡片何时回来,
    //   继续等/继续调 → 用户等很久
    //   检测: 工具结果含 reqId + ok===true + 异步提示词 → 注入 user msg 让 LLM 知道
    //   「卡片会自动显示,只需简短确认,不要继续调工具/等结果」
    try {
      const asyncKeywords = ['正在为你', '正在生成', '正在找', '正在准备', '预计', '等待', '已提交', '正在处理', '正在创建'];
      const lastToolMsgs2 = messages.slice(-Math.max(parallelCalls.length + serialCalls.length, 1));
      for (const m of lastToolMsgs2) {
        if (m && m.role === 'tool' && typeof m.content === 'string') {
          let parsed = null;
          try { parsed = JSON.parse(m.content); } catch (_) {}
          if (parsed && parsed.ok === true && parsed.reqId) {
            const msgText = String(parsed.message || '');
            const isAsync = asyncKeywords.some(k => msgText.includes(k));
            if (isAsync) {
              console.log(`[runToolLoop] v1.0 异步任务已提交: reqId=${parsed.reqId}, 注入简短确认提示`);
              if (trace) trace.addNote(round + 1, 'async_submitted', `reqId=${parsed.reqId}`);
              _asyncShortOutput = true;  // v1.0 (Phase 6-B): 下轮 LLM 只需简短确认
              messages.push({
                role: 'user',
                content: `[异步任务已提交] 工具已启动后台任务 (reqId=${parsed.reqId})，结果卡片会自动显示给用户。你（LLM）**只需简短确认**（10-20字，如"好的，正在为你处理"），**不要继续调工具**，也不要等结果或再次调用相同工具。直接输出简短确认即可。`,
              });
              break;
            }
          }
        }
      }
    } catch (e) { /* 异步检测失败不应影响主流程 */ }

  }
  console.error(`[runToolLoop] Tool loop exceeded max rounds (${maxRounds}). 完整 tool call history (${toolCallHistory.length} 条):\n${toolCallHistory.map(h => `  r${h.round} ${h.tool}(${(h.args||'').slice(0, 80)}) → ${h.resultPreview ? h.resultPreview.slice(0, 80) : (h.result || h.error || '?')}`).join('\n')}`);
  if (trace) trace.fail(new Error('Tool loop exceeded max rounds (' + maxRounds + ')'));
  throw new Error(`Tool loop exceeded max rounds (${maxRounds})`);
}

module.exports = { callLLM, callLLMStream, callLLMWithTools, runToolLoop, detectStreamStall };