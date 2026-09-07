// ACMS GEO 引擎适配器 — 豆包（字节跳动）网页版（v0.1 — Phase B DOM 派）
// 路径：server/services/geo-engines/doubao.js
//
// 设计思路（借鉴 oneglanse ProviderConfig + deepseek-web.js 模式）：
//   - 类型：chat 类 provider（有编辑器 + 发送按钮 + AI 回复区域）
//   - 底层：ai-web-chat 服务（browser-agent → agent-browser CLI）
//   - 返回契约：{ ok, engine, text, citations, latency_ms, error?, message? }
//
// 与 deepseek-web.js 的区别：
//   - 豆包域名：www.doubao.com（vs chat.deepseek.com）
//   - 豆包无原生"智能搜索"开关（AI 自动联网）
//   - 豆包回复区域 DOM 结构不同（需用独立选择器）
//   - 豆包无 references 字段（citations 需从 DOM 抽取）
//
// v0.1 备注（2026-09-06）：
//   - 初次实现，选择器需根据实际 DOM 调整
//   - 借鉴 oneglanse ChatGPT provider 的 waitForResponse 模式
//   - 借鉴 oneglanse extractSources DOM 选择器模式
//
// 参考：
//   - oneglanse apps/agent/src/core/providers/chatgpt/index.ts
//   - oneglanse apps/agent/src/core/providers/chatgpt/lib/extractSources.ts
//   - ACMS server/services/ai-web-chat/index.js

const aiWebChat = require('../ai-web-chat');

const DOUBAO_URL = 'https://www.doubao.com';
const TASK_TIMEOUT_MS = 120000; // 豆包一轮约 30-60s

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

// v0.1: 豆包 DOM 选择器（需根据实际渲染结果调整）
const SELECTORS = {
  // 输入框
  input: '[class*="input"], [class*="editor"], textarea, [contenteditable="true"]',
  // 发送按钮
  sendBtn: '[class*="send"], [aria-label*="发送"], button[class*="submit"]',
  // AI 回复区域（通用：含 markdown 文本的容器）
  responseArea: '[class*="answer"], [class*="response"], [class*="message"]',
  // 引用源链接（借鉴 oneglanse: a[target="_blank"] 模式）
  sourceLink: 'a[target="_blank"][href^="http"]',
  // 加载状态（判断 AI 是否还在生成）
  loading: '[class*="loading"], [class*="typing"], [class*="streaming"]',
};

/**
 * 等待豆包 AI 回答生成完成（轮询 DOM 检测 loading 消失 + responseArea 有内容）
 * 借鉴 oneglanse waitForAssistantToFinish 模式（每 2s 轮询，最长 60s）
 */
async function waitForResponse(page, timeoutMs = 60000) {
  // 注意：当前 ai-web-chat 没有直接暴露 page 对象
  // 这里用 placeholder，待 ai-web-chat 扩展后实现
  // 简化版：直接返回（假设 query 内部已等待完成）
  return;
}

/**
 * 从豆包 DOM 抽取 Source[]（借鉴 oneglanse CHATGPT_RAW_SOURCES_DOM_EXTRACTOR）
 * oneglanse 核心模式：String.raw`(_helpers) => { ... DOM querySelectorAll ... }`
 */
async function extractSources(page) {
  // placeholder: 待 ai-web-chat 暴露 evalJs 后实现
  // 借鉴 oneglanse pattern:
  //   const anchors = document.querySelectorAll('ul li > a[target="_blank"][rel*="noopener"][href^="http"]');
  //   for (const anchor of anchors) { ... }
  return [];
}

/**
 * 主 query 方法
 */
async function query(prompt, options = {}) {
  const startTs = Date.now();
  const taskId = 'geo-doubao-' + Date.now();

  try {
    // TODO: 实现豆包专用 ask 函数（类似 deepSeekAsk）
    // 当前返回 stub，符合 ProviderConfig 契约但无实际功能
    return {
      ok: false,
      engine: 'doubao',
      error: 'NOT_IMPLEMENTED',
      message: '豆包引擎适配器尚未实现（v0.1 placeholder，待 ai-web-chat 扩展 doubaoAsk）',
      latency_ms: Date.now() - startTs,
    };
  } catch (e) {
    const isTimeout = e && e.code === 'TASK_TIMEOUT';
    return {
      ok: false,
      engine: 'doubao',
      error: isTimeout ? 'TASK_TIMEOUT' : 'EXCEPTION',
      message: isTimeout
        ? `豆包任务超时（${TASK_TIMEOUT_MS / 1000}s）`
        : (e && e.message) || String(e),
      latency_ms: Date.now() - startTs,
    };
  }
}

module.exports = {
  capability: {
    search: 'dom',        // DOM 驱动派
    singleton: true,      // 独占浏览器 session，避免并发冲突
    note: '豆包（字节跳动）网页版，DOM 驱动，需登录态。v0.1 placeholder。',
    maxConcurrent: 1,
    timeoutMs: TASK_TIMEOUT_MS,
  },
  name: '豆包',
  query,
  models: ['doubao'],
  defaultModel: 'doubao',
  // v0.1: 导出选择器供测试用
  SELECTORS,
};
