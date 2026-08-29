// ACMS GEO 引擎适配器 — Perplexity（v0.1 — Phase 1 Week 1）
// 用途：调用 Perplexity Chat Completions API（带真实 web search → citations[]）
// 路径：server/services/geo-engines/perplexity.js
//
// Perplexity API 关键事实：
//   - 协议：OpenAI Chat Completions 兼容
//   - baseUrl：https://api.perplexity.ai
//   - 鉴权：Authorization: Bearer <api_key>
//   - 模型：sonar / sonar-pro / sonar-reasoning / sonar-deep-research
//   - **关键能力**：自带 web search → 响应里返回 citations[]（每个含 url/title）
//
// Citations 字段位置（v2 API）：
//   data.choices[0].message.citations = [{url, title}, ...]
//   或者顶层 data.citations（API 文档有歧义，以实际响应为准）

const GEO_CONFIG = require('../geo-config');

const TIMEOUT_MS = 90000; // Perplexity web search 可能较慢

async function query(prompt, options = {}) {
  const modelInfo = GEO_CONFIG.getModelInfo('perplexity');
  if (!modelInfo) {
    return {
      ok: false,
      engine: 'perplexity',
      error: 'API_KEY_NOT_CONFIGURED',
      message: 'Perplexity 未在模型管理里配置。请先在系统管理 → AI 模型配置里添加 Perplexity 模型（provider=perplexity），baseUrl=https://api.perplexity.ai 并填入 API Key。',
    };
  }

  const model = options.model || modelInfo.model;
  const endpoint = `${modelInfo.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const startTs = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body = {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert assistant helping analyze brand/product visibility in AI search engines. Provide direct, accurate answers with citations.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: options.temperature ?? 0.5,
      max_tokens: options.max_tokens ?? 2000,
      return_citations: true, // Perplexity 专属：要求返回 citations
      return_images: false,
    };

    // 可选：限制搜索时间范围
    if (options.search_recency_filter) {
      body.search_recency_filter = options.search_recency_filter; // 'hour' / 'day' / 'week' / 'month' / 'year'
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${modelInfo.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      return {
        ok: false,
        engine: 'perplexity',
        error: `HTTP_${response.status}`,
        message: errText.slice(0, 500),
        latency_ms: Date.now() - startTs,
      };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    // Citations 解析：可能在 message 顶层或 choices 顶层
    let citations = [];
    if (Array.isArray(data.choices?.[0]?.message?.citations)) {
      citations = data.choices[0].message.citations;
    } else if (Array.isArray(data.citations)) {
      citations = data.citations;
    }
    // 规范化 citation 结构
    citations = citations.map(c => ({
      url: c.url || '',
      title: c.title || '',
      snippet: c.snippet || c.text || '',
    })).filter(c => c.url); // 只保留有 URL 的

    return {
      ok: true,
      engine: 'perplexity',
      model,
      text,
      citations,
      search_metadata: {
        // Perplexity 可能在响应里包含搜索元数据
        recency_filter: options.search_recency_filter || null,
        results_count: citations.length,
      },
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
      engine: 'perplexity',
      error: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: isAbort ? `请求超时（${TIMEOUT_MS / 1000}s）` : e.message,
      latency_ms: Date.now() - startTs,
    };
  }
}

module.exports = {
  name: 'perplexity',
  query,
  models: [],
  defaultModel: null,
  getModels() {
    const info = GEO_CONFIG.getModelInfo('perplexity');
    return info ? [info.model] : [];
  },
  getDefaultModel() {
    const info = GEO_CONFIG.getModelInfo('perplexity');
    return info ? info.model : null;
  },
};