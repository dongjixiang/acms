// ACMS GEO 引擎适配器 — Microsoft Copilot（v0.1 — Phase 1 Week 2）
// 用途：调用 Microsoft Copilot API（Azure OpenAI 兼容）
// 路径：server/services/geo-engines/copilot.js
//
// Copilot API 关键事实：
//   - 协议：Azure OpenAI Chat Completions（OpenAI 兼容变体）
//   - baseUrl：https://api.copilot.microsoft.com 或 Azure 资源 endpoint
//   - 鉴权：api-key header（不是 Bearer）
//   - 模型：copilot-gpt-4 / copilot-gpt-3.5
//   - 端点：{baseUrl}/chat/completions
//
// 注意：Copilot 的公开 API 不稳定，Microsoft 可能限制第三方访问。
//   如果不可用，返回 NOT_SUPPORTED_IN_API 错误，Phase 1 标记为「待验证」。

const GEO_CONFIG = require('../geo-config');

const TIMEOUT_MS = 60000;

async function query(prompt, options = {}) {
  const modelInfo = GEO_CONFIG.getModelInfo('copilot');
  if (!modelInfo) {
    return {
      ok: false,
      engine: 'copilot',
      error: 'API_KEY_NOT_CONFIGURED',
      message: 'Microsoft Copilot 未在模型管理里配置。Copilot API 不稳定且公开访问受限，建议在系统管理 → AI 模型配置里添加 OpenAI 兼容协议模型（provider=openai 但 baseUrl 是 Azure endpoint）。',
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
        // Copilot 用 api-key header 而非 Authorization: Bearer
        'api-key': modelInfo.apiKey,
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
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      return {
        ok: false,
        engine: 'copilot',
        error: `HTTP_${response.status}`,
        message: errText.slice(0, 500),
        latency_ms: Date.now() - startTs,
      };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return {
      ok: true,
      engine: 'copilot',
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
      engine: 'copilot',
      error: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: isAbort ? `请求超时（${TIMEOUT_MS / 1000}s）` : e.message,
      latency_ms: Date.now() - startTs,
    };
  }
}

module.exports = {
  name: 'copilot',
  query,
  models: [],
  defaultModel: null,
  getModels() {
    const info = GEO_CONFIG.getModelInfo('copilot');
    return info ? [info.model] : [];
  },
  getDefaultModel() {
    const info = GEO_CONFIG.getModelInfo('copilot');
    return info ? info.model : null;
  },
};