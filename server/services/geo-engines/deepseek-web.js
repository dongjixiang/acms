// ACMS GEO 引擎适配器 — DeepSeek 网页版（v0.2 — task timeout + singleton）
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
// v0.2 变更（2026-09-01）：task-level 超时 + singleton 标识
//   - 加 TASK_TIMEOUT_MS (5min) 包 Promise.race —— tracker 不再无限等
//   - 加 capability.singleton=true —— tracker 拆成 singleton group 串行跑
//   - 错误区分 TASK_TIMEOUT / EXCEPTION / DEEPSEEK_WEB_FAILED 三类
//
// 返回契约对齐 GEO 引擎（P182：成功字段是 text，不是 raw_answer）：
//   { ok, engine, text, latency_ms, screenshot?, error?, message? }

const aiWebChat = require('../ai-web-chat');

// DeepSeek 网页版单 query 全流程实际 ≈ 4-5 分钟
//   open 30s + login 60s + webSearch 10s + input 20s + send 10s + wait 120s
// 5 分钟给点 buffer，超过即视为卡死（前端能立即看到失败而非无限等）
const TASK_TIMEOUT_MS = 300000;

function withTimeout(promise, ms) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error('TASK_TIMEOUT');
      e.code = 'TASK_TIMEOUT';
      reject(e);
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function query(prompt, options = {}) {
  const startTs = Date.now();
  const webSearch = options.webSearch !== false; // 网页版默认开智能搜索
  const taskId = 'geo-webchat-' + Date.now();

  try {
    const r = await withTimeout(
      aiWebChat.deepSeekAsk(prompt, { webSearch, taskId }),
      TASK_TIMEOUT_MS
    );

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
      timeout: !!r.timeout, // 下层 waitAnswerComplete 自己的兜底超时标记（与 TASK_TIMEOUT 不同）
    };
  } catch (e) {
    const isTimeout = e && e.code === 'TASK_TIMEOUT';
    return {
      ok: false,
      engine: 'deepseek-web',
      error: isTimeout ? 'TASK_TIMEOUT' : 'EXCEPTION',
      step: isTimeout ? 'task-timeout' : undefined,
      message: isTimeout
        ? `DeepSeek 网页版任务超时（${TASK_TIMEOUT_MS / 1000}s 已耗尽）—— 浏览器可能卡住或答案未生成`
        : (e && e.message) || String(e),
      latency_ms: Date.now() - startTs,
    };
  }
}

module.exports = {
  capability: {
    search: 'native',
    // v0.2: 独占浏览器 session 标识。tracker 看到这个标识会把它从并发池里
    // 抽出来串行跑（避免 N 个 deepseek-web query 抢同一个 Chromium daemon session 卡死）
    singleton: true,
    note: 'DeepSeek 网页版原生「智能搜索」（2026-08-31 实测校准：新版联网搜索改名智能搜索）。慢（30-60s/轮），适合抽样追踪。',
  },
  name: 'deepseek-web',
  query,
  models: ['chat.deepseek.com'],
  defaultModel: 'chat.deepseek.com',
};
