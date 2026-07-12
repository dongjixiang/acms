// LLM 适配器 — 统一多 API 格式调用层（v2.0 + tool_calls + Anthropic 流式）
// 支持: openai-chat, anthropic-messages
const modelStore = require('../stores/model-store');
const toolRegistry = require('./tool-registry');
// v0.46: Hook 系统集成（PreToolUse / PostToolUse）— 让用户在不改 tool handler 的情况下注入自动化
const { runPreHooks, runPostHooks } = require('./hook-registry');

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
    if (typeof v !== 'string') continue;  // 防非字符串 crash
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
const TOOL_RESULT_TRUNCATE_BYTES = 12 * 1024; // 单条 tool result 12KB 阈值（Hermes 默认 4MB turn，ACMS agent 单 tool 12KB 够用）

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
    _hint: 'Output exceeded 12KB and was truncated. If you need a specific section, use read_file with a smaller window (offset/length) or grep for the exact pattern.',
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
    'i will write', 'i\'ll write', 'let me write', 'i will create', 'i will modify', 'i will update',
    'now i will', 'next i will', 'will create', 'will write', 'will implement',
  ];
  const matched = stallPhrases.filter(p => content.includes(p));
  if (matched.length > 0) {
    return { phrases: matched, contentPreview: (result.content || '').slice(0, 200) };
  }
  return null;
}

// ===== v0.X: Trace Capture — 完整任务执行链路日志 =====
//   当 options.traceFile 设置时，每轮将完整 messages / LLM 响应 / 工具调用写入 JSONL
//   生成路径：data/traces/<taskId>-<timestamp>.jsonl
//   每行一个 JSON 事件：{ type, round, ts, data }
const fs = require('fs');
const path = require('path');
const TRACE_DIR = path.join(__dirname, '..', '..', 'data', 'traces');

function initTrace(taskId) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filePath = path.join(TRACE_DIR, `${taskId}-${ts}.jsonl`);
  try { fs.mkdirSync(TRACE_DIR, { recursive: true }); } catch (e) { /* ignore */ }
  return filePath;
}

function writeTrace(filePath, type, round, data) {
  if (!filePath) return;
  try {
    const entry = JSON.stringify({ type, round, ts: new Date().toISOString(), data: data });
    fs.appendFileSync(filePath, entry + '\n');
  } catch (e) { /* 不阻塞主流程 */ }
}

async function runToolLoop(modelId, messages, options = {}) {
  const maxRounds = options.maxRounds ?? 10;
  const toolNames = options.toolNames;
  const context = options.context || {};  // v0.20：透传给 tool handler（music/video/image_gen 需要 reqId）
  const progressCallback = options.onProgress;  // v0.35：每轮进度回调
  const model = modelStore.getById(modelId);
  if (!model) throw Object.assign(new Error('模型不存在'), { status: 404 });
  const api = model.api || 'openai-chat';

  // v0.X: Trace capture — 完整执行链路日志
  //   当 options.traceFile 或 context.taskId + task.trace_mode 设置时启用
  let traceFile = options.traceFile || null;
  if (!traceFile && context.taskId) {
    // 检查 task 是否启用了 trace_mode
    try {
      const { collection } = require('../db/connection');
      const task = collection('tasks').findOne(t => t.id === context.taskId);
      if (task && task.trace_mode) {
        traceFile = initTrace(context.taskId);
        writeTrace(traceFile, 'init', 0, { modelId, maxRounds, toolNames, taskId: context.taskId });
      }
    } catch (e) { /* trace init failed */ }
  }

  // v0.20 bugfix：检测 LLM 连续两轮调同一 tool + 相同 args → 强制退出（避免无限循环）
  // v0.20 bugfix：检测 LLM 连续两轮调同一 tool + 相同 args → 强制退出（避免无限循环）
  //   旧 bug：LLM 调 play_music(song="X") → handler 返回 ok → LLM 再调确认 → 再返回 ok → 死循环
  //   修复：连续两轮同 tool+args 直接返回最后一次 content（不抛错），避免 LLM 死循环
  let lastToolCallKey = null;
  let lastWriteRound = -1;  // v0.X: 写后空转检测 — 上次成功 write_file/patch_file 的轮次

  // v0.25 debug: 记录每轮 LLM 调了啥 + tool 结果，方便 PM 查 tool loop 卡死根因
  const toolCallHistory = [];

  // v0.29 fix: Context 压缩 — Hermes-style 防止 LLM 长对话失忆 goal
  //   当 messages 超过阈值（默认 30），summarize 旧 messages，保留 system + 最近 12 条
  //   根因：T-MRDO0ECU 重跑 Round 12 时 messages 已 37 条，goal 在 messages[1] 已被推到 attention 边缘
  // v0.45: 改用 LLM 摘要（保留语义信息）而非纯规则截断
  const COMPRESS_THRESHOLD = 30;
  const KEEP_RECENT = 12;
  let _compressed = false;

  // v0.45: LLM-based context compression
  async function compressMessages(messages, maxRounds, round) {
    if (_compressed) return;
    _compressed = true;

    const systemMsg = messages[0];
    const msgsToCompress = messages.slice(1, -KEEP_RECENT);
    const recentMsgs = messages.slice(-KEEP_RECENT);
    const droppedCount = msgsToCompress.length;

    if (droppedCount === 0) return;

    // 构建压缩提示：让 LLM 总结被丢弃的 messages
    const compressPrompt = [
      { role: 'system', content: 'You are a context summarizer. Summarize the following conversation messages in 3-5 sentences. Focus on: what the agent did, what files were created/modified, what decisions were made. Do NOT include tool call details — only the outcomes.' },
      { role: 'user', content: msgsToCompress.map(m => {
        if (m.role === 'tool_result') return `Tool result for ${m.name || m.tool_call_id}: ${typeof m.content === 'string' ? m.content.slice(0, 500) : JSON.stringify(m.content).slice(0, 500)}`;
        return `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 500) : JSON.stringify(m.content).slice(0, 500)}`;
      }).join('\n---\n') },
    ];

    try {
      // 用同一个 model 做摘要调用（不占 tool loop）
      const summaryResult = await callLLMWithTools(modelId, compressPrompt, {
        toolNames: [],
        maxTokens: 500,
      });
      const summaryText = summaryResult.content || `[Earlier ${droppedCount} messages compressed: agent explored workspace and made tool calls. Goal context remains in system prompt above.]`;
      const compressed = [systemMsg, { role: 'user', content: summaryText }, ...recentMsgs];
      messages.length = 0;
      messages.push(...compressed);
      console.log(`[runToolLoop] v0.45 context compression: ${messages.length + droppedCount} → ${compressed.length} messages (kept system + last ${KEEP_RECENT} + LLM summary)`);
    } catch (e) {
      // 摘要失败则降级为规则压缩
      const droppedToolSummary = toolCallHistory.slice(0, toolCallHistory.length - KEEP_RECENT / 2).map(h => `${h.tool}(${(h.args||'').slice(0, 60)})`).join(', ');
      const summaryText = `[Earlier ${droppedCount} messages compressed: agent explored workspace and made tool calls: ${droppedToolSummary || 'exploration + verification'}. Goal context remains in system prompt above.]`;
      const compressed = [systemMsg, { role: 'user', content: summaryText }, ...recentMsgs];
      messages.length = 0;
      messages.push(...compressed);
      console.log(`[runToolLoop] v0.45 context compression (fallback): ${messages.length + droppedCount} → ${compressed.length} messages`);
    }
  }

  for (let round = 0; round < maxRounds; round++) {
    console.log(`[runToolLoop] round=${round + 1}/${maxRounds} | messages=${messages.length} | taskId=${context.taskId || '?'}`);

    // v0.X: 写后空转检测 — 检测 patch_file/write_file 成功后连续 ≥3 轮无新写操作
    //   治 T-MRH7H9GA 现象：agent 在 R20 写完 3 个补丁，R21-47 全在 verify/空转
    //   inject user message 比 system prompt 规则有效（LLM 更听 user role 消息）
    if (typeof lastWriteRound === 'number' && lastWriteRound >= 0 && round - lastWriteRound >= 3 && round >= 6) {
      const idleRounds = round - lastWriteRound;
      const hasRecentWrite = toolCallHistory.slice(-3).some(h => 
        h.tool === 'agent_write_file' || h.tool === 'agent_patch_file' || h.tool === 'agent_multi_patch'
      );
      if (!hasRecentWrite) {
        const fixSummary = toolCallHistory
          .filter(h => h.tool === 'agent_patch_file' || h.tool === 'agent_write_file')
          .map(h => `  r${h.round} ${h.tool}(${(h.args||'').slice(0, 60)}) → ${(h.resultPreview||'').slice(0, 60)}`)
          .join('\n');
        console.warn(`[runToolLoop] ⛔ 写后空转检测: 上次写操作在 R${lastWriteRound + 1}, 已空转 ${idleRounds} 轮. 注入 user steer.`);
        messages.push({
          role: 'user',
          content: `### ⚠️ 系统检测到你在空转\n\n你已经连续 ${idleRounds} 轮（R${lastWriteRound + 1} → R${round + 1}）没有写任何新文件或补丁。你之前的补丁都已经成功（syntax OK）。\n\n**立即结束任务并提交**，不要再验证/重读/检查 git 状态。\n\n之前完成的补丁：\n${fixSummary}\n\n回复 "DONE" 并产生最终总结。如果再空转 2 轮，系统将自动提交当前改动。`,
        });
      }
    }

    // v0.X: 只读超时 — 前 N 轮没写过任何文件时强制 steer（治 T-MRGDBST1 33 次读 0 次写的纯探索死循环）
    if (lastWriteRound < 0 && round >= 6 && round % 3 === 0) {
      console.warn(`[runToolLoop] ⛔ 只读超时检测: 已 ${round + 1} 轮未写任何文件. 注入 user steer.`);
      const readTools = toolCallHistory.filter(h => h.tool.startsWith('agent_read_') || h.tool === 'agent_list_files' || h.tool === 'agent_search_files');
      messages.push({
        role: 'user',
        content: `### ⚠️ 系统检测到你只读不写\n\n你已经读了 ${readTools.length} 个文件/目录，但还没写任何代码。\n\n**立即停止探索，开始写代码。**\n\n你现在应该已经充分理解了项目结构。接下来必须调用 \`agent_write_file\` 或 \`agent_patch_file\` 来实际完成任务。\n\n如果再读 3 轮还不写，这个 task 将被标记为 failed。`,
      });
    }

    // v0.45: 执行中途 steer 检查 — 如果 progress_note 中有新的 steer message，注入到 messages
    if (context.taskId && progressCallback) {
      try {
        const { collection } = require('../db/connection');
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

    // v0.45: 上下文压缩 — 超过阈值时 LLM 摘要旧 messages
    if (messages.length > COMPRESS_THRESHOLD && !_compressed) {
      await compressMessages(messages, maxRounds, round);
    }

    // v0.44.4: 去掉 L576 的"模型思考中..."推送——它总是在每轮最后覆盖 tool call entry
    //   因为下一轮 L576 push 的时间戳 > 上一轮 L616 push 的时间戳
    //   SSE 推 lastEntry，永远看到"模型思考中..."而不是 tool call
    //   修法：不推了，只保留 tool call 的 log entry
// v0.31 fix: Diagnostic mode — 每个 LLM 调用前 dump 完整 messages + 调用后 dump response
    //   让多多能看到"发给 LLM 啥 + LLM 返回啥"，找到装睡根因
    const sysContent = messages[0]?.content || '';
    const remainingRounds = maxRounds - round;
    // v0.X: Trace — 本轮发送给模型的完整 messages
    writeTrace(traceFile, 'round_start', round + 1, {
      messages: messages.map(m => {
        // 安全序列化：截断超长 tool result 防 trace 文件膨胀
        const safe = { role: m.role };
        if (typeof m.content === 'string') safe.content = m.content.length > 50000 ? m.content.slice(0, 50000) + '...[TRUNCATED]' : m.content;
        if (m.tool_calls) safe.tool_calls = m.tool_calls;
        return safe;
      }),
      remainingRounds,
    });
    // v0.45: 把剩余轮次注入到 messages，让 LLM 知道紧迫感（避免到第 80 轮还在试探）
    if (round >= 3 && round % 5 === 0) {
      // 每 5 轮注入一次预算提醒
      messages.push({
        role: 'user',
        content: `[Budget Alert] ${remainingRounds} rounds remaining of ${maxRounds}. If you're stuck in a loop (e.g. repeatedly reading the same file or executing similar commands), break the loop NOW: switch to agent_write_file or agent_patch_file with a complete solution. Do not over-explore.`
      });
    }
    console.log(`[runToolLoop] LLM_CALL#${round + 1}/${maxRounds} (剩余 ${remainingRounds}) system_prompt_len=${sysContent.length} system_preview="${sysContent.slice(0, 300).replace(/\n/g, ' ')}..."`);
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
    const result = await callLLMWithTools(modelId, messages, { ...options, toolNames });
    // v0.X: Trace — 记录 LLM 返回的完整 content + tool_calls
    writeTrace(traceFile, 'llm_response', round + 1, {
      content: result.content || '',
      toolCalls: (result.toolCalls || []).map(tc => ({ name: tc.name, id: tc.id, args: tc.args })),
      finishReason: result.finishReason || null,
      usage: result.usage || null,
    });
    // v0.31 fix: dump LLM 完整 response
    const content = typeof result.content === 'string' ? result.content : '';
    console.log(`[runToolLoop] LLM_RESP#${round + 1} content_len=${content.length} finish_reason=${result.finishReason || 'n/a'} tool_calls=${result.toolCalls?.length || 0}`);
    console.log(`[runToolLoop] LLM_RESP#${round + 1} content="${content.slice(0, 600).replace(/\n/g, ' | ')}"`);
    if (content.length > 600) console.log(`[runToolLoop] LLM_RESP#${round + 1} content_tail="${content.slice(-300).replace(/\n/g, ' | ')}"`);
    if (result.toolCalls) {
      // v0.33 C 方案: 同 turn 静默去重（治根因 — LLM 经常同 turn 调多次 read_file 浪费预算）
      //   参考 Hermes _deduplicate_tool_calls:6078
      const beforeDedup = result.toolCalls.length;
      result.toolCalls = deduplicateToolCalls(result.toolCalls);
      if (result.toolCalls.length < beforeDedup) {
        console.log(`[runToolLoop] v0.33 dedup: ${beforeDedup} → ${result.toolCalls.length} tool_calls`);
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
      // v0.33 C 方案: stream stall detection（参考 Hermes run_agent.py:8330）
      //   LLM 返回 content 但没 tool_calls + content 提到"i will write" → 装睡信号
      //   比装睡检测更前置：装睡检测需要 LLM 调 tool，stall detection 是"连 tool 都不调但嘴上说会调"
      const stall = detectStreamStall(result, messages);
      if (stall) {
        console.warn(`[runToolLoop] v0.33 STALL detected round=${round + 1}: phrases=${stall.phrases.join(',')} preview="${stall.contentPreview}"`);
        messages.push({
          role: 'user',
          content: `[系统检测到你嘴上说 "${stall.phrases[0]}" 但没真调 tool。请立即调对应 tool 实际执行（不要继续描述意图）。如果还剩 ${maxRounds - round - 1} 轮，请专注。]`,
        });
        continue;
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
      // v0.X: Trace — 最终答案
      writeTrace(traceFile, 'final_answer', round + 1, {
        content: result.content || '',
        toolCallHistory,
        remainingRounds,
      });
      // v0.35: 最终答案回调
      if (progressCallback) {
        progressCallback(round + 1, maxRounds, '正在生成任务总结...', toolCallHistory.map(h => h.tool).slice(-3));
      }
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
        // v0.33 C 方案: tool name 容错（参考 Hermes _repair_tool_call:6098）
        //   模型拼写错误（TodoTool_tool / Patch_tool / ReadFile）→ 5 步自动修
        const allTools = toolRegistry.listTools ? toolRegistry.listTools() : [];
        const validNames = new Set(allTools);
        const repaired = repairToolName(tc.name, validNames);
        if (repaired !== tc.name && validNames.has(repaired)) {
          const repairedTool = toolRegistry.getTool(repaired);
          if (repairedTool) {
            console.log(`[runToolLoop] v0.33 tool name repair: "${tc.name}" → "${repaired}"`);
            toolCallHistory.push({ round: round + 1, tool: repaired, args: argsPreview, result: 'REPAIRED_NAME' });
            // 修复成功，按正常 tool 处理
            try {
              // 递归调用逻辑：但简单起见直接在这里执行一次
              const toolResult = await repairedTool.handler(tc.args, context);
              const truncatedResult = truncateToolResult(repaired, toolResult);
              if (truncatedResult.truncated) {
                console.log(`[runToolLoop] v0.33 truncated ${repaired} result: ${truncatedResult.origSize} → ${TOOL_RESULT_TRUNCATE_BYTES} bytes`);
              }
              toolCallHistory[toolCallHistory.length - 1].resultPreview = JSON.stringify(truncatedResult.result).slice(0, 300);
              messages.push(toolRegistry.makeToolResult(api, tc.id, truncatedResult.result));
            } catch (e) {
              toolCallHistory[toolCallHistory.length - 1].error = e.message;
              messages.push(toolRegistry.makeToolResult(api, tc.id, { error: e.message }));
            }
            continue;
          }
        }
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
        // v0.46 Hook 系统: PreToolUse 链（可修改 args / abort=true 跳过 tool 执行）
        const pre = await runPreHooks(tc.name, tc.args, context);
        if (pre.abort) {
          toolCallHistory.push({ round: round + 1, tool: tc.name, args: argsPreview, result: 'PRE_HOOK_ABORT', error: pre.abortReason });
          messages.push(toolRegistry.makeToolResult(api, tc.id, { ok: false, aborted: true, reason: pre.abortReason }));
          continue;
        }
        const finalArgs = pre.args || tc.args;
        // v0.20：handler 接 (args, context) — context 用于传 reqId 等
        const toolResult = await tool.handler(finalArgs, context);
        const resultPreview = JSON.stringify(toolResult).slice(0, 300);
        // v0.46 Hook 系统: PostToolUse 链（可修改/包装 result）
        const postResult = await runPostHooks(tc.name, finalArgs, toolResult, context);
        // v0.33 C 方案: 截断超长 tool result（参考 Hermes enforce_turn_budget:181）
        //   防止 LLM 调一次 read_file 拿到 50KB 文件把 context 撑爆
        const truncated = truncateToolResult(tc.name, postResult);
        if (truncated.truncated) {
          console.log(`[runToolLoop] v0.33 truncated ${tc.name} result: ${truncated.origSize} → ${TOOL_RESULT_TRUNCATE_BYTES} bytes`);
        }
        console.log(`[runToolLoop]   -> result (${resultPreview.length} chars): ${resultPreview}`);
        // v0.X: 写后空转检测 — 记录最后成功 write_file/patch_file 的轮次
        if (['agent_write_file', 'agent_patch_file', 'agent_multi_patch'].includes(tc.name) && toolResult && toolResult.ok) {
          lastWriteRound = round;
        }
        // v0.X: Trace — 记录工具的完整 args + result
        writeTrace(traceFile, 'tool_result', round + 1, {
          name: tc.name,
          args: tc.args,
          result: toolResult,
          truncated: truncated.truncated || false,
        });
        toolCallHistory.push({ round: round + 1, tool: tc.name, args: argsPreview, resultPreview });
        messages.push(toolRegistry.makeToolResult(api, tc.id, truncated.result));
      } catch (e) {
        console.log(`[runToolLoop]   -> ERROR: ${e.message}`);
        toolCallHistory.push({ round: round + 1, tool: tc.name, args: argsPreview, error: e.message });
        messages.push(toolRegistry.makeToolResult(api, tc.id, { error: e.message }));
      }
    }
  }
  console.error(`[runToolLoop] Tool loop exceeded max rounds (${maxRounds}). 完整 tool call history (${toolCallHistory.length} 条):\n${toolCallHistory.map(h => `  r${h.round} ${h.tool}(${(h.args||'').slice(0, 80)}) → ${h.resultPreview ? h.resultPreview.slice(0, 80) : (h.result || h.error || '?')}`).join('\n')}`);
  writeTrace(traceFile, 'tool_loop_exceeded', maxRounds, {
    toolCallHistory,
    messagesCount: messages.length,
  });
  throw new Error(`Tool loop exceeded max rounds (${maxRounds})`);
}

module.exports = { callLLM, callLLMStream, callLLMWithTools, runToolLoop };
