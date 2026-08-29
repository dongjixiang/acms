// ACMS GEO 引擎适配器 — OpenAI（v0.1 — Phase 1 Week 1，v0.26 升级 web_search）
// 用途：调用 OpenAI API（Chat Completions + Responses API 双模式，含可选 web search tool）
// 路径：server/services/geo-engines/openai.js
//
// v0.26 升级要点（借鉴 elmo 真实 web_queries 数据）：
//   - 默认走 Responses API（OpenAI 2024+ 主推端点），支持 web_search_preview tool
//   - 可选 Chat Completions 模式（options.useChatCompletions = true，保留兼容）
//   - web_search_preview tool 返回 web_queries + citations
//
// 参考：
//   - https://platform.openai.com/docs/api-reference/responses
//   - https://platform.openai.com/docs/guides/tools-web-search

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
  const enableWebSearch = options.enableWebSearch !== false;
  const useChatCompletions = options.useChatCompletions === true; // v0.26: 旧模式备选

  const baseUrl = modelInfo.baseUrl.replace(/\/$/, '');
  const startTs = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let endpoint, body, parseResponse;
    if (useChatCompletions) {
      // 旧模式：Chat Completions API（不返回 web_queries）
      endpoint = `${baseUrl}/chat/completions`;
      body = {
        model,
        messages: [
          { role: 'system', content: 'You are an expert assistant helping analyze brand/product visibility in AI search engines. Provide direct, accurate answers.' },
          { role: 'user', content: prompt },
        ],
        temperature: options.temperature ?? 0.5,
        max_tokens: options.max_tokens ?? 2000,
      };
      parseResponse = (data) => ({
        text: data.choices?.[0]?.message?.content || '',
        webQueries: [],
        citations: [],
      });
    } else {
      // v0.26: 新模式 — Responses API（支持 web_search_preview tool）
      endpoint = `${baseUrl}/responses`;
      body = {
        model,
        input: prompt,
        temperature: options.temperature ?? 0.5,
        max_output_tokens: options.max_tokens ?? 2000,
      };
      if (enableWebSearch) {
        body.tools = [{ type: 'web_search_preview' }];
        // web_search_preview 用户位置提示（影响结果本地化）
        body.tool_choice = 'auto';
      }
      parseResponse = (data) => {
        // Responses API 输出结构：
        //   output: [
        //     { type: 'web_search_call', action: { query: '...' } },
        //     { type: 'message', content: [
        //       { type: 'output_text', text: '...', annotations: [{type: 'url_citation', url, title}] }
        //     ]}
        //   ]
        let text = '';
        const webQueries = [];
        const citations = [];
        const output = Array.isArray(data.output) ? data.output : [];
        for (const item of output) {
          if (item?.type === 'web_search_call' && item?.action?.query) {
            webQueries.push(item.action.query);
          } else if (item?.type === 'message') {
            const content = Array.isArray(item.content) ? item.content : [];
            for (const c of content) {
              if (c?.type === 'output_text' && typeof c.text === 'string') {
                text += (text ? '\n\n' : '') + c.text;
                // 提取 annotations 中的 url_citation
                if (Array.isArray(c.annotations)) {
                  for (const ann of c.annotations) {
                    if (ann?.type === 'url_citation') {
                      citations.push({
                        url: ann.url,
                        title: ann.title || '',
                        domain: (() => { try { return new URL(ann.url).hostname.replace(/^www\./, ''); } catch (_) { return ''; } })(),
                      });
                    }
                  }
                }
              }
            }
          }
        }
        return { text, webQueries: [...new Set(webQueries)], citations };
      };
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
        engine: 'openai',
        error: `HTTP_${response.status}`,
        message: errText.slice(0, 500),
        latency_ms: Date.now() - startTs,
      };
    }

    const data = await response.json();
    const parsed = parseResponse(data);
    return {
      ok: true,
      engine: 'openai',
      model,
      text: parsed.text,
      citations: parsed.citations,
      web_queries: parsed.webQueries, // v0.26: 实际 web search queries
      web_search_enabled: enableWebSearch && !useChatCompletions,
      usage: data.usage ? {
        prompt_tokens: data.usage.input_tokens || data.usage.prompt_tokens || 0,
        completion_tokens: data.usage.output_tokens || data.usage.completion_tokens || 0,
        total_tokens: data.usage.total_tokens || ((data.usage.input_tokens || data.usage.prompt_tokens || 0) + (data.usage.output_tokens || data.usage.completion_tokens || 0)),
      } : null,
      finish_reason: data.status || data.choices?.[0]?.finish_reason || null,
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
  capability: { search: 'native', note: 'web_search_preview tool（v0.26 启用）→ Responses API 返回 web_queries + url_citation annotations' },
  name: 'openai',
  query,
  models: [],
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