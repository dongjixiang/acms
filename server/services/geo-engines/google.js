// ACMS GEO 引擎适配器 — Google Gemini（v0.1 — Phase 1 Week 2）
// 用途：调用 Google AI Studio Gemini API
// 路径：server/services/geo-engines/google.js
//
// Google Gemini API 关键事实：
//   - 协议：Google AI Studio generateContent（非 OpenAI 兼容）
//   - baseUrl：https://generativelanguage.googleapis.com
//   - 鉴权：API key 作为 query param (?key=API_KEY)
//   - 端点：{baseUrl}/v1beta/models/{model}:generateContent
//   - 模型：gemini-1.5-pro / gemini-1.5-flash / gemini-2.0-flash-exp
//
// Gemini API 响应结构：
//   data.candidates[0].content.parts[0].text
//   data.usageMetadata = {promptTokenCount, candidatesTokenCount, totalTokenCount}

const GEO_CONFIG = require('../geo-config');

const TIMEOUT_MS = 60000;

async function query(prompt, options = {}) {
  const modelInfo = GEO_CONFIG.getModelInfo('google');
  if (!modelInfo) {
    return {
      ok: false,
      engine: 'gemini',
      error: 'API_KEY_NOT_CONFIGURED',
      message: 'Google Gemini 未在模型管理里配置。请先在系统管理 → AI 模型配置里添加 Google 模型（provider=google），baseUrl=https://generativelanguage.googleapis.com 并填入 API Key。',
    };
  }

  const model = options.model || modelInfo.model;
  const baseUrl = modelInfo.baseUrl.replace(/\/$/, '');
  const endpoint = `${baseUrl}/v1beta/models/${model}:generateContent?key=${modelInfo.apiKey}`;
  const startTs = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are an expert assistant helping analyze brand/product visibility in AI search engines. Provide direct, accurate answers.\n\n${prompt}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: options.temperature ?? 0.5,
          maxOutputTokens: options.max_tokens ?? 2000,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      return {
        ok: false,
        engine: 'gemini',
        error: `HTTP_${response.status}`,
        message: errText.slice(0, 500),
        latency_ms: Date.now() - startTs,
      };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usageMeta = data.usageMetadata || {};

    return {
      ok: true,
      engine: 'gemini',
      model,
      text,
      citations: [], // 基础 generateContent 不返回 citations（需 grounding 单独调用）
      usage: usageMeta.totalTokenCount ? {
        prompt_tokens: usageMeta.promptTokenCount,
        completion_tokens: usageMeta.candidatesTokenCount,
        total_tokens: usageMeta.totalTokenCount,
      } : null,
      finish_reason: data.candidates?.[0]?.finishReason || null,
      latency_ms: Date.now() - startTs,
      raw: data,
    };
  } catch (e) {
    clearTimeout(timeout);
    const isAbort = e.name === 'AbortError';
    return {
      ok: false,
      engine: 'gemini',
      error: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: isAbort ? `请求超时（${TIMEOUT_MS / 1000}s）` : e.message,
      latency_ms: Date.now() - startTs,
    };
  }
}

module.exports = {
  capability: { search: 'planned', note: 'Gemini 官方支持 google_search grounding，当前裸 generateContent，待改造' },
  name: 'gemini',
  query,
  models: [],
  defaultModel: null,
  getModels() {
    const info = GEO_CONFIG.getModelInfo('google');
    return info ? [info.model] : [];
  },
  getDefaultModel() {
    const info = GEO_CONFIG.getModelInfo('google');
    return info ? info.model : null;
  },
};