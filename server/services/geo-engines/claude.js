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
    // v0.26: 启用 web_search tool（Anthropic 原生支持）— 让 Claude 实际跑 web search 并返回 search queries
    // 借鉴 elmo 真实拿到 web_queries 数据（之前 capability: { search: 'planned' } — 现在升级到 'native'）
    // Feature flag：options.enableWebSearch = true（默认） / false（关掉走裸 API）
    const enableWebSearch = options.enableWebSearch !== false;
    const body = {
      model,
      system: 'You are an expert assistant helping analyze brand/product visibility in AI search engines. Provide direct, accurate answers with citations.',
      messages: [
        { role: 'user', content: prompt },
      ],
      temperature: options.temperature ?? 0.5,
      max_tokens: options.max_tokens ?? 2000,
    };
    if (enableWebSearch) {
      body.tools = [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5, // 最多跑 5 次 web search（够用，省 token）
      }];
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': modelInfo.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
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

    // v0.26: 解析 content[] 数组（启用 web_search 后有多类型 block）
    // - type: 'text' → 主回答文本
    // - type: 'web_search_tool_result' → web search 实际跑的搜索结果（带 query 字段）
    // - type: 'server_tool_use' → 服务端工具调用（query 在 input.query）
    let text = '';
    const webQueries = [];
    const citations = [];
    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block?.type === 'text' && typeof block.text === 'string') {
          text += (text ? '\n\n' : '') + block.text;
          // v0.26: 提取 text block 的 citations 字段（Anthropic web_search 返回的位置引用）
          if (Array.isArray(block.citations)) {
            for (const c of block.citations) {
              if (c?.type === 'web_search_result_location') {
                citations.push({
                  url: c.url,
                  title: c.title || c.cited_text?.slice(0, 60) || '',
                  domain: (() => { try { return new URL(c.url).hostname.replace(/^www\./, ''); } catch (_) { return ''; } })(),
                });
              }
            }
          }
        } else if (block?.type === 'web_search_tool_result') {
          // web_search 实际跑过的搜索 query 都在 content[].content[].query
          const results = Array.isArray(block.content) ? block.content : [];
          for (const r of results) {
            if (r?.type === 'web_search_result' && typeof r?.query === 'string') {
              webQueries.push(r.query);
            }
          }
        } else if (block?.type === 'server_tool_use' && block?.name === 'web_search') {
          // 服务端工具调用记录（input.query 是 web search 的 query）
          if (typeof block?.input?.query === 'string') {
            webQueries.push(block.input.query);
          }
        }
      }
    }
    // 去重
    const uniqueWebQueries = [...new Set(webQueries)];

    return {
      ok: true,
      engine: 'claude',
      model,
      text,
      citations,
      web_queries: uniqueWebQueries, // v0.26: 实际 web search queries（之前永远是 []，现在能拿到真数据）
      web_search_enabled: enableWebSearch,
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
  capability: { search: 'native', note: 'web_search_20250305 tool（v0.26 启用）→ 返回 web_queries + citations' },
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