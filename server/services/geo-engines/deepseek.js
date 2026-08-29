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
//   - 鉴权：Authorization: Bearer ***

const GEO_CONFIG = require('../geo-config');

const TIMEOUT_MS = 60000;

// v0.25: DeepSeek API 官方无联网搜索参数（App 的 Search 是客户端功能）。
// 提供「RAG 检索增强模拟」：先用 ACMS 反爬 web-search（Bing 浏览器/Toutiao 多通道）拿真实搜索结果，
// 再作为上下文喂给 DeepSeek 生成「有依据」的回答——近似 DeepSeek Search 的体验，但不等同官方实现。
async function ragSearch(prompt) {
  try {
    const { searchWeb } = require('../../services/web-search');
    const res = await searchWeb(prompt, { maxResults: 6 });
    if (res.error || !res.results || !res.results.length) return null;
    return res.results.slice(0, 6).map((x, i) =>
      `[${i + 1}] ${x.title}\n${x.url}\n${(x.snippet || '').slice(0, 300)}`
    ).join('\n\n');
  } catch (_) {
    return null; // 搜索失败降级为裸 LLM
  }
}

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

  // v0.25: RAG 检索增强（options.rag=true 时先搜索真实网页）
  let ragContext = null;
  if (options.rag) {
    ragContext = await ragSearch(prompt);
  }

  try {
    const systemContent = '你是一个帮助分析品牌/产品在 AI 搜索中可见性的助手。请直接、准确地回答问题，不要回避。'
      + (ragContext
        ? `\n\n以下是本次查询的实时搜索结果（来自网页检索，请优先基于这些信息回答，并自然引用来源）：\n${ragContext}`
        : '');
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
            content: systemContent,
          },
          { role: 'user', content: prompt },
        ],
        temperature: options.temperature ?? 0.5,
        max_tokens: options.max_tokens ?? 2000,
        // v0.25 修复: DeepSeek V4 默认 thinking=enabled，会把所有 completion tokens 花在
        // reasoning_content 上导致 content 为空（finish=length）。GEO 追踪要直接回答，显式关闭。
        thinking: { type: 'disabled' },
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
  capability: { search: 'none', rag: true, note: '官方 API 无联网搜索参数；v0.25 提供 RAG 检索增强模拟（web-search 检索 + 上下文喂入，需 rag 开关）' },
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