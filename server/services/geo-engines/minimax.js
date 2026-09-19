// ACMS GEO 引擎适配器 — MiniMax（v0.27 → v0.48.8 支持 anthropic-messages）
// 用途：调用 MiniMax API 做 AI 搜索可见性追踪
// 路径：server/services/geo-engines/minimax.js
//
// MiniMax API 协议（v0.48.8）：
//   - modelStore 记录：provider='minimax-cn'，api='anthropic-messages'
//   - baseUrl: https://api.minimaxi.com/anthropic → Anthropic Messages API (/v1/messages)
//   - 鉴权：Authorization: Bearer *** + anthropic-version: 2023-06-09
//   - thinking 控制：thinking: {type: 'disabled'}（避免 reasoning tokens 占满 max_tokens）

const GEO_CONFIG = require('../geo-config');

const TIMEOUT_MS = 60000;
const ANTHROPIC_VERSION = '2023-06-09';
const SYSTEM_PROMPT = '你是一个帮助分析品牌/产品在 AI 搜索中可见性的助手。请直接、准确地回答问题，不要回避。';

async function query(prompt, options = {}) {
  const modelInfo = GEO_CONFIG.getModelInfo('minimax');
  if (!modelInfo) {
    return {
      ok: false,
      engine: 'minimax',
      error: 'API_KEY_NOT_CONFIGURED',
      message: 'MiniMax 未在模型管理里配置。请先在系统管理 → AI 模型配置里添加 MiniMax 模型（provider=minimax-cn + baseUrl=https://api.minimaxi.com/anthropic + MiniMax 的 API Key）。',
    };
  }

  const model = options.model || modelInfo.model;
  const apiProtocol = modelInfo.api || 'anthropic-messages';
  const baseUrl = (modelInfo.baseUrl || '').replace(/\/$/, '');
  const startTs = Date.now();

  // v0.48.8: 按 api 协议分支
  if (apiProtocol === 'openai-chat') {
    return _openaiQuery({ baseUrl, model, prompt, apiKey: modelInfo.apiKey, startTs });
  }
  return _anthropicQuery({ baseUrl, model, prompt, apiKey: modelInfo.apiKey, startTs });
}

// Anthropic Messages API 实现
async function _anthropicQuery({ baseUrl, model, prompt, apiKey, startTs }) {
  const endpoint = `${baseUrl}/v1/messages`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 2000,
        thinking: { type: 'disabled' },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latency_ms = Date.now() - startTs;
    if (!r.ok) {
      return { ok: false, engine: 'minimax', error: `HTTP_${r.status}`, message: (await r.text()).slice(0, 500), latency_ms };
    }
    const data = await r.json();
    const text = Array.isArray(data.content)
      ? data.content.filter(b => b.type === 'text').map(b => b.text).join('')
      : '';
    return {
      ok: true, engine: 'minimax', model, text, citations: [],
      usage: data.usage || null, finish_reason: data.stop_reason || null,
      latency_ms, raw: data,
    };
  } catch (e) {
    clearTimeout(timer);
    const isAbort = e.name === 'AbortError';
    return { ok: false, engine: 'minimax', error: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR', message: isAbort ? `请求超时（${TIMEOUT_MS / 1000}s）` : e.message, latency_ms: Date.now() - startTs };
  }
}

// OpenAI Chat Completions 实现（兼容旧配置）
async function _openaiQuery({ baseUrl, model, prompt, apiKey, startTs }) {
  const endpoint = `${baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 2000,
        thinking: { type: 'disabled' },
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latency_ms = Date.now() - startTs;
    if (!r.ok) {
      return { ok: false, engine: 'minimax', error: `HTTP_${r.status}`, message: (await r.text()).slice(0, 500), latency_ms };
    }
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || '';
    return {
      ok: true, engine: 'minimax', model, text, citations: [],
      usage: data.usage || null, finish_reason: data.choices?.[0]?.finish_reason || null,
      latency_ms, raw: data,
    };
  } catch (e) {
    clearTimeout(timer);
    const isAbort = e.name === 'AbortError';
    return { ok: false, engine: 'minimax', error: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR', message: isAbort ? `请求超时（${TIMEOUT_MS / 1000}s）` : e.message, latency_ms: Date.now() - startTs };
  }
}

module.exports = {
  capability: { search: 'planned', note: 'MiniMax 官方 API 无联网搜索参数；当前走 Anthropic Messages API（用户 modelStore 配 anthropic-messages 协议）' },
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