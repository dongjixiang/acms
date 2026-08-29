// ACMS GEO 引擎适配器 — Anthropic Claude（v0.1 — Phase 1 Week 1）
// 用途：调用 Anthropic Messages API（非 OpenAI 兼容）
// 路径：server/services/geo-engines/claude.js
//
// Anthropic API 关键差异：
//   - 协议：Anthropic Messages（不是 OpenAI Chat Completions）
//   - 鉴权：x-api-key header + anthropic-version: 2023-06-01
//   - 模型：claude-3-5-sonnet / claude-3-opus / claude-3-haiku
//   - **关键差异**：system prompt 独立字段（不在 messages 里）
//   - max_tokens 必填（Anthropic 强制）
//
// 端点格式：{baseUrl}/v1/messages

const GEO_CONFIG = require('../geo-config');

const TIMEOUT_MS = 60000;
const ANTHROPIC_VERSION = '2023-06-01';

async function query(prompt, options = {}) {
  const modelInfo = GEO_CONFIG.getModelInfo('anthropic');
  if (!modelInfo) {
    return {
      ok: false,
      engine: 'claude',
      error: 'API_KEY_NOT_CONFIGURED',
      message: 'Anthropic Claude 未在模型管理里配置。请先在系统管理 → AI 模型配置里添加 Anthropic 模型（provider=anthropic）并填入 API Key。',
    };
  }

  const model = options.model || modelInfo.model;
  // Anthropic baseUrl 通常是 https://api.anthropic.com（无 /v1 后缀），要加 /v1/messages
  const baseUrl = modelInfo.baseUrl.replace(/\/$/, '');
  const endpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`;
  const startTs = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': modelInfo.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        system: 'You are an expert assistant helping analyze brand/product visibility in AI search engines. Provide direct, accurate answers.',
        messages: [
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
        engine: 'claude',
        error: `HTTP_${response.status}`,
        message: errText.slice(0, 500),
        latency_ms: Date.now() - startTs,
      };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return {
      ok: true,
      engine: 'claude',
      model,
      text,
      citations: [], // Claude API 不返回 citations
      usage: data.usage ? {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
        total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
      } : null,
      stop_reason: data.stop_reason || null,
      latency_ms: Date.now() - startTs,
      raw: data,
    };
  } catch (e) {
    clearTimeout(timeout);
    const isAbort = e.name === 'AbortError';
    return {
      ok: false,
      engine: 'claude',
      error: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: isAbort ? `请求超时（${TIMEOUT_MS / 1000}s）` : e.message,
      latency_ms: Date.now() - startTs,
    };
  }
}

module.exports = {
  name: 'claude',
  query,
  models: [],
  defaultModel: null,
  getModels() {
    const info = GEO_CONFIG.getModelInfo('anthropic');
    return info ? [info.model] : [];
  },
  getDefaultModel() {
    const info = GEO_CONFIG.getModelInfo('anthropic');
    return info ? info.model : null;
  },
};