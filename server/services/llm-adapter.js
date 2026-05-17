// LLM 适配器 — 统一多 API 格式调用层
// 支持: openai-chat, anthropic-messages
const modelStore = require('../stores/model-store');

/**
 * 调用 LLM，自动根据 model.api 选择协议
 * @param {string} modelId
 * @param {Array}  messages - [{role, content}, ...]
 * @param {object} options - { temperature, maxTokens, jsonMode }
 * @returns {object} { content: string, modelUsed: string }
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

  if (api === 'anthropic-messages') {
    return callAnthropic(model, messages, opts, apiKey);
  }
  // 默认 openai-chat
  return callOpenAI(model, messages, opts, apiKey);
}

// ===== OpenAI Chat Completions =====
async function callOpenAI(model, messages, opts, apiKey) {
  const baseUrl = model.baseUrl || 'https://api.deepseek.com/v1';
  const isMiniMax = baseUrl.includes('minimax');

  const body = {
    model: model.model,
    messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
  };

  // MiniMax 的 OpenAI 兼容端点不支持 response_format
  if (opts.jsonMode && !isMiniMax) {
    body.response_format = { type: 'json_object' };
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
  return {
    content: data.choices?.[0]?.message?.content || '',
    modelUsed: `${model.name} (${model.model})`,
  };
}

// ===== Anthropic Messages =====
async function callAnthropic(model, messages, opts, apiKey) {
  const baseUrl = model.baseUrl || 'https://api.anthropic.com';

  // 分离 system 消息
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
  return {
    content: data.content?.[0]?.text || '',
    modelUsed: `${model.name} (${model.model})`,
  };
}

module.exports = { callLLM };
