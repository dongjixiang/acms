// ACMS GEO 引擎适配器 — MiniMax（v0.27）
// 用途：调用 MiniMax API（OpenAI 兼容协议）做 AI 搜索可见性追踪
// 路径：server/services/geo-engines/minimax.js
//
// MiniMax API 关键事实：
//   - 协议：OpenAI Chat Completions 兼容（/v1/chat/completions）
//   - baseUrl：国内 https://api.minimax.chat/v1，国际 https://api.minimaxi.com/v1（modelStore 里配置）
//   - 模型：MiniMax-Text-01（文本旗舰）、abab6.5s-chat（旧）
//   - 鉴权：Authorization: Bearer ***
//   - 注意：MiniMax-Text-01 默认可能开启 thinking/reasoning（同 DeepSeek V4 的 P183 教训），
//     显式传 thinking:{type:'disabled'} 保证 content 直接返回回答文本

const GEO_CONFIG = require('../geo-config');

const TIMEOUT_MS = 60000;

async function query(prompt, options = {}) {
  const modelInfo = GEO_CONFIG.getModelInfo('minimax');
  if (!modelInfo) {
    return {
      ok: false,
      engine: 'minimax',
      error: 'API_KEY_NOT_CONFIGURED',
      message: 'MiniMax 未在模型管理里配置。请先在系统管理 → AI 模型配置里添加 MiniMax 模型（provider=minimax + baseUrl=https://api.minimax.chat/v1 + MiniMax 的 API Key）。',
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
        // MiniMax-Text-01 支持 thinking 开关：显式关闭，避免 reasoning tokens 占满 max_tokens 导致 content 为空
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
        engine: 'minimax',
        error: `HTTP_${response.status}`,
        message: errText.slice(0, 500),
        latency_ms: Date.now() - startTs,
      };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return {
      ok: true,
      engine: 'minimax',
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
      engine: 'minimax',
      error: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: isAbort ? `请求超时（${TIMEOUT_MS / 1000}s）` : e.message,
      latency_ms: Date.now() - startTs,
    };
  }
}

module.exports = {
  capability: { search: 'planned', note: 'MiniMax 官方 API 无联网搜索参数；当前裸 chat completions（OpenAI 兼容协议）' },
  name: 'minimax',
  query,
  models: [],
  defaultModel: null,
  getModels() {
    const info = GEO_CONFIG.getModelInfo('minimax');
    return info ? [info.model] : [];
  },
  getDefaultModel() {
    const info = GEO_CONFIG.getModelInfo('minimax');
    return info ? info.model : null;
  },
};
