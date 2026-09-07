// ACMS GEO Provider Config 接口定义（借鉴 oneglanse ProviderConfig，2026-09-06）
// 路径：server/services/geo-engines/types.js
//
// 用途：为国内 16 provider 适配提供统一的结构化模板。
//       OneGlanse 原版是 14 hook 的 TS interface；
//       ACMS 版简化为 JS 约定（靠注释 + 实例 engine 自检，无运行时类型检查）。
//
// 参考：apps/agent/src/core/providers/types.ts（oneglanse v1.x）
//       核心抽象：chat 类 provider（元宝/豆包） vs 搜索引擎类 provider（AI Overview 型）
//
// --- 字段说明 ---
//
// required:
//   id        - engine 标识（唯一），对应 geo_responses.engine 字段
//   name      - 显示名（中文）
//   capability.search - 'native'（API 自带搜索）| 'dom'（browser-agent 驱动）| 'none'
//   query     - 核心方法 async query(prompt, options) => Response
//
// optional (chat 类 engine 常用):
//   waitForResponse  - 等待 AI 生成完成（DOM 轮询 or API polling）
//   extractResponse  - 从页面/响应提取 markdown 正文
//   extractSources   - 从页面/响应提取 Source[]（URL + title + citedText）
//
// optional (搜索引擎类 engine 需要):
//   navigateToPrompt - 全自定义导航流（如元宝：搜索 → AI 摘要 → 展开）
//
// optional (通用):
//   beforePromptHook / afterTypingHook / beforeSubmitHook / afterSubmitHook
//   beforeRetryHook / betweenPromptsHook / preNavigationHook / postNavigationHook
//   submitOrder - 提交策略顺序：['native','enter','force','dispatch']
//   checkSubmitSuccess - 提交成功检查
//   skipInitialNavigation - 跳过初始导航（搜索引擎类用）
//
// 使用方式：
//   const { defineProvider } = require('./types');
//   module.exports = defineProvider({ id, name, capability, ... });

/**
 * ProviderConfig 完整字段定义（参考 OneGlanse ProviderConfig interface）
 */
const PROVIDER_CONFIG_FIELDS = [
  // required
  'id', 'name', 'capability', 'query',
  // optional: core hooks
  'waitForResponse', 'extractResponse', 'extractSources',
  // optional: lifecycle hooks
  'beforePromptHook', 'afterTypingHook', 'beforeSubmitHook', 'afterSubmitHook',
  'beforeRetryHook', 'betweenPromptsHook',
  'preNavigationHook', 'postNavigationHook',
  // optional: custom navigation
  'navigateToPrompt',
  // optional: submission
  'submitOrder', 'checkSubmitSuccess',
  // optional: skip initial nav
  'skipInitialNavigation',
];

/**
 * validateProviderConfig - 运行时自检（生产环境可关闭）
 * @param {Object} config - provider config 对象
 * @param {boolean} strict - 严格模式：缺少 required 字段抛错
 */
function validateProviderConfig(config, strict = process.env.NODE_ENV !== 'production') {
  if (!config || typeof config !== 'object') {
    throw new Error('[ProviderConfig] config must be an object');
  }
  const required = ['id', 'name', 'capability', 'query'];
  for (const field of required) {
    if (!(field in config)) {
      const msg = `[ProviderConfig] missing required field: ${field} (provider: ${config.id || 'unknown'})`;
      if (strict) throw new Error(msg);
      console.warn(`[ProviderConfig] ${msg}`);
    }
  }
  if (typeof config.query !== 'function') {
    const msg = `[ProviderConfig] query must be a function (provider: ${config.id})`;
    if (strict) throw new Error(msg);
    console.warn(`[ProviderConfig] ${msg}`);
  }
  // capability 必须有 search 字段
  if (config.capability && !('search' in config.capability)) {
    const msg = `[ProviderConfig] capability.search is required (provider: ${config.id})`;
    if (strict) throw new Error(msg);
    console.warn(`[ProviderConfig] ${msg}`);
  }
  return config;
}

/**
 * defineProvider - 定义一个 provider（含运行时校验）
 * @param {Object} fields - provider 配置
 * @returns {Object} validated provider config
 */
function defineProvider(fields) {
  return validateProviderConfig(fields, true);
}

/**
 * 判断 provider 是 chat 类还是搜索引擎类
 * chat 类：有 extractResponse + extractSources + waitForResponse
 * 搜索引擎类：有 navigateToPrompt + skipInitialNavigation
 */
function isChatLike(config) {
  return Boolean(config.extractResponse && config.extractSources && config.waitForResponse);
}

function isSearchEngineLike(config) {
  return Boolean(config.navigateToPrompt || config.skipInitialNavigation === true);
}

module.exports = {
  PROVIDER_CONFIG_FIELDS,
  validateProviderConfig,
  defineProvider,
  isChatLike,
  isSearchEngineLike,
};
