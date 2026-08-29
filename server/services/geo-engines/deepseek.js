// ACMS GEO 引擎适配器 — DeepSeek（v0.2 — Phase 0，复用 modelStore）
// 用途：调用 DeepSeek API（兼容 OpenAI 协议）做 AI 搜索可见性追踪
// 路径：server/services/geo-engines/deepseek.js
//
// v0.2 修订（2026-08-29）：复用 modelStore 的 baseUrl + model + apiKey（不另存 key）
//
// DeepSeek API 关键事实：
//   - baseUrl: modelStore 里配置（默认 https://api.deepseek.com/v1）
//   - 兼容 OpenAI Chat Completions 协议
//   - 模型：deepseek-chat (V3) / deepseek-reasoner (R1) / deepseek-v4-flash 等
//   - 鉴权：Authorization: Bearer <api_key>

const GEO_CONFIG = require('../geo-config');

const TIMEOUT_MS = 60000;

async function query(prompt, options = {}) {
  const modelInfo = GEO_CONFIG.getModelInfo('deepseek');
  if (!modelInfo) {
    return {
      ok: false,
      engine: 'deepseek',
      error: 'API_KEY_NOT_CONFIGURED',
      message: 'DeepSeek 未在模型管理里配置。请先在系统管理 → AI 模型配置里添加 DeepSeek 模型并填入 API Key，GEO 工具会自动复用。',
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
            content: '你是一个帮助分析品牌/产品在 AI 搜索中可见性的助手。请直接、准确地回答问题，不要回避。',
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
        engine: 'deepseek',
        error: `HTTP_${response.status}`,
        message: errText.slice(0, 500),
        latency_ms: Date.now() - startTs,
      };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return {
      ok: true,
      engine: 'deepseek',
      model,
      text,
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
      engine: 'deepseek',
      error: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: isAbort ? `请求超时（${TIMEOUT_MS / 1000}s）` : e.message,
      latency_ms: Date.now() - startTs,
    };
  }
}

module.exports = {
  name: 'deepseek',
  query,
  models: [], // 动态从 modelStore 读
  defaultModel: null, // 动态从 modelStore 读
  getModels() {
    const info = GEO_CONFIG.getModelInfo('deepseek');
    return info ? [info.model] : [];
  },
  getDefaultModel() {
    const info = GEO_CONFIG.getModelInfo('deepseek');
    return info ? info.model : null;
  },
};