// ACMS GEO 引擎适配器 — DeepSeek 网页版（v0.1 — browser-agent）
// ============================================================
// 用途：调用 chat.deepseek.com 网页版（自动登录 + 原生「智能搜索」联网模式）
//       做 AI 搜索可见性追踪 —— 覆盖 API 无法提供的官方联网搜索质量。
// 路径：server/services/geo-engines/deepseek-web.js
// 底层：ai-web-chat 服务（browser-agent → agent-browser CLI）
//
// 与 deepseek.js（API + RAG 模拟）的区别：
//   - 网页版 = DeepSeek 官方原生搜索增强 + 引用，回答质量更高
//   - 代价 = 慢（一轮 30-60s）+ 网页风控风险 → 适合抽样/按需追踪，
//     不适合全量每周跑（GEO_CONFIG 里按引擎开关控制）
//
// 返回契约对齐 GEO 引擎（P182：成功字段是 text，不是 raw_answer）：
//   { ok, engine, text, latency_ms, screenshot?, error?, message? }

const aiWebChat = require('../ai-web-chat');

async function query(prompt, options = {}) {
  const startTs = Date.now();
  const webSearch = options.webSearch !== false; // 网页版默认开智能搜索
  try {
    const r = await aiWebChat.deepSeekAsk(prompt, {
      webSearch,
      taskId: 'geo-webchat-' + Date.now(),
    });
    if (!r.ok) {
      return {
        ok: false,
        engine: 'deepseek-web',
        error: r.error || 'DEEPSEEK_WEB_FAILED',
        step: r.step,
        message: `DeepSeek 网页版失败（${r.step || 'unknown'}）: ${r.error || ''}`,
        latency_ms: Date.now() - startTs,
      };
    }
    return {
      ok: true,
      engine: 'deepseek-web',
      model: 'chat.deepseek.com（网页版 + 智能搜索）',
      text: r.answer,
      latency_ms: r.elapsedMs || Date.now() - startTs,
      screenshot: r.screenshot || '',
      timeout: !!r.timeout,
    };
  } catch (e) {
    return {
      ok: false,
      engine: 'deepseek-web',
      error: 'EXCEPTION',
      message: e.message,
      latency_ms: Date.now() - startTs,
    };
  }
}

module.exports = {
  capability: {
    search: 'native',
    note: 'DeepSeek 网页版原生「智能搜索」（2026-08-31 实测校准：新版联网搜索改名智能搜索）。慢（30-60s/轮），适合抽样追踪。',
  },
  name: 'deepseek-web',
  query,
  models: ['chat.deepseek.com'],
  defaultModel: 'chat.deepseek.com',
};
