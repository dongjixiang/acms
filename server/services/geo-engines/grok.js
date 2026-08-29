// ACMS GEO 引擎适配器 — xAI Grok（v0.1 — Phase 1 Week 2）
// 用途：调用 xAI Grok API（OpenAI 兼容协议）
// 路径：server/services/geo-engines/grok.js
//
// Grok API 关键事实：
//   - 协议：OpenAI Chat Completions 完全兼容
//   - baseUrl：https://api.x.ai/v1
//   - 鉴权：Authorization: Bearer <api_key>
//   - 模型：grok-beta / grok-vision-beta / grok-2
//   - 端点：{baseUrl}/chat/completions
//
// Grok 可能默认启用实时信息（X/Twitter 平台数据），
//   citations 数据偶尔会出现，但通常为空。

const GEO_CONFIG = require('../geo-config');

const TIMEOUT_MS = 60000;

async function query(prompt, options = {}) {
  const modelInfo = GEO_CONFIG.getModelInfo('grok');
  if (!modelInfo) {
    return {
      ok: false,
      engine: 'grok',
      error: 'API_KEY_NOT_CONFIGURED',
      message: 'xAI Grok 未在模型管理里配置。请先在系统管理 → AI 模型配置里添加 Grok 模型（provider=openai 协议 + baseUrl=https://api.x.ai/v1 + Grok 的 API Key）。',
    };
  }

  const model = options.model || modelInfo.model;
  const endpoint = `${modelInfo.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const startTs = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${modelInfo.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert assistant helping analyze brand/product visibility in AI search engines. Provide direct, accurate answers.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: options.temperature ?? 0.5,
        max_tokens: options.max_tokens ?? 2000,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      return {
        ok: false,
        engine: 'grok',
        error: `HTTP_${response.status}`,
        message: errText.slice(0, 500),
        latency_ms: Date.now() - startTs,
      };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return {
      ok: true,
      engine: 'grok',
      model,
      text,
      citations: [],
      usage: data.usage || null,
      finish_reason: data.choices?.[0]?.finish_reason || null,
      latency_ms: Date.now() - startTs,
      raw: data,
    };
  } catch (e) {
    clearTimeout(timeout);
    const isAbort = e.name === 'AbortError';
    return {
      ok: false,
      engine: 'grok',
      error: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: isAbort ? `请求超时（${TIMEOUT_MS / 1000}s）` : e.message,
      latency_ms: Date.now() - startTs,
    };
  }
}

module.exports = {
  name: 'grok',
  query,
  models: [],
  defaultModel: null,
  getModels() {
    const info = GEO_CONFIG.getModelInfo('grok');
    return info ? [info.model] : [];
  },
  getDefaultModel() {
    const info = GEO_CONFIG.getModelInfo('grok');
    return info ? info.model : null;
  },
};