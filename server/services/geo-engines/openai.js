// ACMS GEO 引擎适配器 — OpenAI（v0.1 — Phase 1 Week 1）
// 用途：调用 OpenAI Chat Completions API（含可选 web search tool）
// 路径：server/services/geo-engines/openai.js
//
// OpenAI API 关键事实：
//   - 协议：OpenAI Chat Completions（与 DeepSeek 兼容）
//   - baseUrl：从 modelStore 读（model.provider='openai'）
//   - 模型：gpt-4o / gpt-4-turbo / gpt-3.5-turbo / gpt-4o-mini
//   - 鉴权：Authorization: Bearer <api_key>
//   - 可选 Web Search：tool choice 'web_search_preview'（OpenAI Responses API，需要不同端点）
//
// 当前实现：仅 Chat Completions（最广泛兼容）。Web Search 需要切 Responses API，Phase 1 后续支持。
//
// 参考：
//   - https://platform.openai.com/docs/api-reference/chat
//   - Phase 0 deepseek.js（OpenAI 兼容协议参考）

const GEO_CONFIG = require('../geo-config');

const TIMEOUT_MS = 60000;

async function query(prompt, options = {}) {
  const modelInfo = GEO_CONFIG.getModelInfo('openai');
  if (!modelInfo) {
    return {
      ok: false,
      engine: 'openai',
      error: 'API_KEY_NOT_CONFIGURED',
      message: 'OpenAI 未在模型管理里配置。请先在系统管理 → AI 模型配置里添加 OpenAI 模型（provider=openai）并填入 API Key。',
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
        engine: 'openai',
        error: `HTTP_${response.status}`,
        message: errText.slice(0, 500),
        latency_ms: Date.now() - startTs,
      };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return {
      ok: true,
      engine: 'openai',
      model,
      text,
      citations: [], // Chat Completions API 不返回 citations（仅 Responses API + web_search tool）
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
      engine: 'openai',
      error: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: isAbort ? `请求超时（${TIMEOUT_MS / 1000}s）` : e.message,
      latency_ms: Date.now() - startTs,
    };
  }
}

module.exports = {
  name: 'openai',
  query,
  models: [], // 动态从 modelStore 读
  defaultModel: null,
  getModels() {
    const info = GEO_CONFIG.getModelInfo('openai');
    return info ? [info.model] : [];
  },
  getDefaultModel() {
    const info = GEO_CONFIG.getModelInfo('openai');
    return info ? info.model : null;
  },
};