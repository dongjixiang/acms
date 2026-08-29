// ACMS GEO 引擎适配器 — Perplexity（v0.1 — Phase 1 Week 1）
// 用途：调用 Perplexity Chat Completions API（带真实 web search → citations[]）
// 路径：server/services/geo-engines/perplexity.js
//
// Perplexity API 关键事实：
//   - 协议：OpenAI Chat Completions 兼容
//   - baseUrl：https://api.perplexity.ai
//   - 鉴权：Authorization: Bearer ***
//   - 模型：sonar / sonar-pro / sonar-reasoning / sonar-deep-research
//   - **关键能力**：自带 web search → 响应里返回 citations[]（每个含 url/title）
//
// Citations 字段位置（v2 API）：
//   data.choices[0].message.citations = [{url, title}, ...]
//   或者顶层 data.citations（API 文档有歧义，以实际响应为准）

const GEO_CONFIG = require('../geo-config');
// v0.26: 统一引用解析派发（借鉴 elmo text-extraction.ts）
const { extractCitations, normalizeCitations } = require('../geo-citation-extractor');

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

    // v0.26: Citations 解析走统一派发（替换原内联解析）
    // 原逻辑：data.choices[0].message.citations[] 或 data.citations[]
    // 新逻辑：extractCitations(data, 'perplexity') 走归一化 + 去重 + 域名解析
    const citationObjs = extractCitations(data, 'perplexity');
    const citations = citationObjs.map(c => ({
      url: c.url,
      title: c.title || '',
      domain: c.domain,
      snippet: '', // Perplexity API 不返回 snippet（前端从 answer_text 渲染时拿）
    }));

    // v0.26: 尝试提取 web_queries（不同 Perplexity API 版本可能字段不同）
    // 实际：当前 Perplexity 公开 API 不返回 search query 文本（只返 citations URL）
    // 这里探测多种可能位置，有就提取
    const webQueries = [];
    // 1) data.search_results[*].query
    if (Array.isArray(data.search_results)) {
      for (const r of data.search_results) {
        if (typeof r?.query === 'string' && r.query.trim()) webQueries.push(r.query);
      }
    }
    // 2) data.choices[0].message.search_queries[]
    if (Array.isArray(data.choices?.[0]?.message?.search_queries)) {
      for (const q of data.choices[0].message.search_queries) {
        if (typeof q === 'string' && q.trim()) webQueries.push(q);
      }
    }
    // 3) data.choices[0].search_queries[]
    if (Array.isArray(data.choices?.[0]?.search_queries)) {
      for (const q of data.choices[0].search_queries) {
        if (typeof q === 'string' && q.trim()) webQueries.push(q);
      }
    }

    return {
      ok: true,
      engine: 'perplexity',
      model,
      text,
      citations,
      web_queries: [...new Set(webQueries)], // 去重
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
  capability: { search: 'native', note: 'sonar 自带 web search → citations[]' },
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