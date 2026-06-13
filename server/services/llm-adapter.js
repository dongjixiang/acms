// LLM 适配器 — 统一多 API 格式调用层
// 支持: openai-chat, anthropic-messages
const modelStore = require('../stores/model-store');

// 默认请求超时（毫秒）
const DEFAULT_TIMEOUT = 120000; // 120s

// ── v0.3.3 B+++ 补丁（2026-06-13）：DEBUG 模式开关 ──
// 配合 index.js 启动时的 ACMS_LLM_DEBUG 环境变量
// 开启后把 LLM request/response/parse 全 dump 到 data/acms-llm-debug.log
// 配合文件 logger（data/acms.log）可以诊断 5 轮没辅助手段 / tradeoff 解析失败 等问题
// 自动 rotate（5MB → .old）
const LLM_DEBUG = process.env.ACMS_LLM_DEBUG === '1';
const DEBUG_LOG_FILE = require('path').join(__dirname, '..', 'data', 'acms-llm-debug.log');
const DEBUG_LOG_MAX_BYTES = 5 * 1024 * 1024;
function _debugDump(tag, payload) {
  if (!LLM_DEBUG) return;
  try {
    require('fs').mkdirSync(require('path').dirname(DEBUG_LOG_FILE), { recursive: true });
    if (require('fs').existsSync(DEBUG_LOG_FILE) && require('fs').statSync(DEBUG_LOG_FILE).size > DEBUG_LOG_MAX_BYTES) {
      require('fs').renameSync(DEBUG_LOG_FILE, DEBUG_LOG_FILE + '.old');
      require('fs').writeFileSync(DEBUG_LOG_FILE, `[rotated at ${new Date().toISOString()}]\n`);
    }
    const line = `\n=== [${new Date().toISOString()}] ${tag} ===\n` + JSON.stringify(payload, null, 2) + '\n';
    require('fs').appendFileSync(DEBUG_LOG_FILE, line);
  } catch {}
}

/**
 * 调用 LLM，自动根据 model.api 选择协议
 * @param {string} modelId
 * @param {Array}  messages - [{role, content}, ...]
 * @param {object} options - { temperature, maxTokens, jsonMode, projectId }
 * @returns {object} { content, modelUsed, usage: { promptTokens, completionTokens, totalTokens } }
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
  };

  // ── DEBUG 模式：dump 完整入参 ──
  _debugDump('LLM_REQUEST', {
    modelId,
    model: { name: model.name, model: model.model, api, baseUrl: model.baseUrl, isMiniMax: (model.baseUrl || '').includes('minimax'), isDeepSeek: (model.baseUrl || '').includes('deepseek') },
    opts,
    messagesCount: messages.length,
    messagesTotalChars: messages.reduce((s, m) => s + (m.content?.length || 0), 0),
    messages: messages.map(m => ({ role: m.role, contentLen: m.content?.length || 0, content: m.content })),
    caller: options.caller || '(none)',
  });

  let result;
  if (api === 'anthropic-messages') {
    result = await callAnthropic(model, messages, opts, apiKey);
  } else {
    result = await callOpenAI(model, messages, opts, apiKey);
  }

  // ── DEBUG 模式：dump 完整返回 ──
  _debugDump('LLM_RESPONSE', {
    modelId,
    contentLen: result.content?.length || 0,
    content: result.content,
    usage: result.usage,
    finishReason: result.finishReason || '(n/a)',
  });

  // 记录 Token 用量（如果有 projectId）
  if (options.projectId && result.usage) {
    try {
      const tracker = require('./token-tracker');
      tracker.record(options.projectId, model.name || model.model, result.usage, options.caller || '');
    } catch (e) { /* 非关键，静默失败 */ }
  }

  return result;
}

// ===== OpenAI Chat Completions =====
async function callOpenAI(model, messages, opts, apiKey) {
  const baseUrl = model.baseUrl || 'https://api.deepseek.com/v1';
  const isMiniMax = baseUrl.includes('minimax');
  const isDeepSeek = baseUrl.includes('deepseek');

  const body = {
    model: model.model,
    messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
  };

  // jsonMode: 只对明确支持的 provider 发送 API 级 response_format
  // OpenAI、Groq、Together 等支持；DeepSeek、MiniMax 等不支持或表现不稳定
  const supportsJsonResponseFormat = !isMiniMax && !isDeepSeek;
  if (opts.jsonMode && supportsJsonResponseFormat) {
    body.response_format = { type: 'json_object' };
  }

  // 对于不支持 API 级 json 约束的 provider，通过 prompt 提示强化
  if (opts.jsonMode && !supportsJsonResponseFormat) {
    const jsonReminder = {
      role: 'system',
      content: '【格式强制】你必须严格输出纯 JSON 对象，不要用 ```json 代码块包裹，不要添加任何额外文字、注释或说明。JSON 必须合法（无尾逗号、无截断），所有字符串字段使用双引号。',
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
    const u = data.usage || {};
    return {
      content: data.choices?.[0]?.message?.content || '',
      modelUsed: `${model.name} (${model.model})`,
      usage: {
        promptTokens: u.prompt_tokens || 0,
        completionTokens: u.completion_tokens || 0,
        totalTokens: u.total_tokens || 0,
      },
    };
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw Object.assign(new Error(`LLM 请求超时 (${DEFAULT_TIMEOUT/1000}s): ${model.name} (${model.model})`), { status: 504, timeout: true });
    }
    throw e;
  }
}

// ===== Anthropic Messages =====
async function callAnthropic(model, messages, opts, apiKey) {
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

  if (systemParts.length > 0) {
    body.system = systemParts.join('\n\n');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  try {
    const resp = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
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
    return {
      content: textContent || '',
      modelUsed: `${model.name} (${model.model})`,
      usage: {
        promptTokens: u.input_tokens || 0,
        completionTokens: u.output_tokens || 0,
        totalTokens: (u.input_tokens || 0) + (u.output_tokens || 0),
      },
    };
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw Object.assign(new Error(`LLM 请求超时 (${DEFAULT_TIMEOUT/1000}s): ${model.name} (${model.model})`), { status: 504, timeout: true });
    }
    throw e;
  }
}

module.exports = { callLLM };
