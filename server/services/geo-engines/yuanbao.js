// ACMS GEO 引擎适配器 — 腾讯元宝（v0.1 — Phase B DOM 派，搜索引擎型）
// 路径：server/services/geo-engines/yuanbao.js
//
// 设计思路（借鉴 oneglanse AI Overview provider 模式）：
//   - 类型：搜索引擎类 provider（有搜索框 + AI 摘要区域）
//   - 导航模式：navigateToPrompt（全自定义：搜索 → 等待 AI 摘要 → 展开引用源）
//   - 底层：ai-web-chat 服务（browser-agent → agent-browser CLI）
//   - 返回契约：{ ok, engine, text, citations, latency_ms, error?, message? }
//
// 与 deepseek-web.js 的区别：
//   - 元宝域名：yuanbao.tencent.com（vs chat.deepseek.com）
//   - 元宝无原生搜索开关（AI 自动联网）
//   - 元宝引用源在 AI 摘要下方（需点击展开）
//   - 元宝需要处理登录态 + consent dialog（借鉴 oneglanse AI Overview session.ts）
//
// v0.1 备注（2026-09-06）：
//   - 初次实现，选择器需根据实际 DOM 调整
//   - 借鉴 oneglanse ai-overview/index.ts navigateToPrompt 模式
//   - 借鉴 oneglanse extractSources DOM 选择器模式
//
// 参考：
//   - oneglanse apps/agent/src/core/providers/ai-overview/index.ts
//   - oneglanse apps/agent/src/core/providers/ai-overview/lib/session.ts
//   - oneglanse apps/agent/src/core/providers/ai-overview/lib/extractSources.ts
//   - ACMS server/services/ai-web-chat/index.js

const aiWebChat = require('../ai-web-chat');

const YUANBAO_URL = 'https://yuanbao.tencent.com';
const TASK_TIMEOUT_MS = 120000; // 元宝一轮约 30-60s

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

// v0.1: 元宝 DOM 选择器（需根据实际渲染结果调整）
const SELECTORS = {
  // 搜索框（借鉴 oneglanse AI Overview: PROVIDER_EDITOR_SELECTORS['ai-overview']）
  searchInput: '[class*="search"], [class*="input"], textarea, [contenteditable="true"]',
  // 发送/搜索按钮
  searchBtn: '[class*="search"] button, [aria-label*="搜索"], [aria-label*="发送"]',
  // AI 摘要区域（通用：含 markdown 文本的容器）
  aiSummary: '[class*="summary"], [class*="answer"], [class*="response"], [class*="message"]',
  // 引用源展开按钮（借鉴 oneglanse: sources button pattern）
  sourcesBtn: '[class*="source"], [class*="citation"], [class*="reference"]',
  // 引用源链接（借鉴 oneglanse AI Overview: inline-source-card a[href^="http"]）
  sourceLink: 'a[href^="http"]',
  // 加载状态
  loading: '[class*="loading"], [class*="thinking"], [class*="streaming"]',
  // consent dialog（借鉴 oneglanse: dismissGoogleConsentDialog）
  consentDialog: '[class*="consent"], [class*="dialog"], [class*="modal"]',
};

/**
 * 导航到 prompt（借鉴 oneglanse ai-overview navigateToPrompt 模式）
 * 流程：打开页面 → 输入搜索词 → 点击搜索 → 等待 AI 摘要 → 关闭 consent dialog
 */
async function navigateToPrompt(prompt, taskId) {
  // TODO: 实现元宝专用导航流
  // 借鉴 oneglanse pattern:
  //   await ensureGoogleSession(page);
  //   await navigateWithRetry(page, URL, { waitUntil: 'domcontentloaded' });
  //   assertAIOverviewPageNotBlocked(page);
  //   await dismissGoogleConsentDialog(page);
  //   const searchInput = await findActiveEditorCandidateFromSelectors(page, selectors);
  //   await insertPromptIntoEditor(page, searchInput.locator, prompt, 'ai-overview');
  //   await page.keyboard.press('Enter');
  //   await waitForAIOverviewSearchResults(page);
  return { ok: true, step: 'placeholder' };
}

/**
 * 等待 AI 摘要生成完成（轮询 DOM 检测 loading 消失）
 * 借鉴 oneglanse waitForAssistantToFinish 模式
 */
async function waitForResponse(page, timeoutMs = 60000) {
  // placeholder: 待 ai-web-chat 扩展后实现
  return;
}

/**
 * 从元宝 DOM 抽取 Source[]（借鉴 oneglanse extractAIOverviewSources）
 */
async function extractSources(page) {
  // placeholder: 待 ai-web-chat 扩展后实现
  return [];
}

/**
 * 主 query 方法
 */
async function query(prompt, options = {}) {
  const startTs = Date.now();
  const taskId = 'geo-yuanbao-' + Date.now();

  try {
    // TODO: 实现元宝专用 ask 函数
    return {
      ok: false,
      engine: 'yuanbao',
      error: 'NOT_IMPLEMENTED',
      message: '元宝引擎适配器尚未实现（v0.1 placeholder，待 ai-web-chat 扩展 yuanbaoAsk）',
      latency_ms: Date.now() - startTs,
    };
  } catch (e) {
    const isTimeout = e && e.code === 'TASK_TIMEOUT';
    return {
      ok: false,
      engine: 'yuanbao',
      error: isTimeout ? 'TASK_TIMEOUT' : 'EXCEPTION',
      message: isTimeout
        ? `元宝任务超时（${TASK_TIMEOUT_MS / 1000}s）`
        : (e && e.message) || String(e),
      latency_ms: Date.now() - startTs,
    };
  }
}

module.exports = {
  capability: {
    search: 'dom',         // DOM 驱动派
    singleton: true,       // 独占浏览器 session
    note: '腾讯元宝（DOM 驱动，搜索引擎型）。v0.1 placeholder。',
    maxConcurrent: 1,
    timeoutMs: TASK_TIMEOUT_MS,
  },
  name: '腾讯元宝',
  query,
  models: ['yuanbao'],
  defaultModel: 'yuanbao',
  // v0.1: 导出选择器和辅助函数供测试用
  SELECTORS,
  navigateToPrompt,
  waitForResponse,
  extractSources,
};
