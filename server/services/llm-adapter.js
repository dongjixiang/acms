// LLM 适配器 — 统一多 API 格式调用层
// 支持: openai-chat, anthropic-messages
const modelStore = require('../stores/model-store');

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

  let result;
  if (api === 'anthropic-messages') {
    result = await callAnthropic(model, messages, opts, apiKey);
  } else {
    result = await callOpenAI(model, messages, opts, apiKey);
  }

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

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

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

  const resp = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

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
}

module.exports = { callLLM };
