// ACMS social-publisher 服务（v0.1 stub）
// =========================================
// 多平台自动发布平台主入口。
// 复用 web-agent.js（browser-agent）+ ai-web-chat/index.js（deepSeekAsk）的
// 语义层封装模式：每个平台 provider 是一组 web_* 步骤的编排。
//
// 当前状态：v0.1 stub —— 所有平台返回 {ok:false, error:'not_implemented', ...}
//         PR 2 起按 todo 列表逐平台实现：
//   - PR 2: toutiao 端到端
//   - PR 3: xiaohongshu / wechat_oa / zhihu（复制头条 provider 改 DOM）
//   - PR 5: douyin（视频，差异较大放最后）
//
// 子模块：
//   - account-store.js  账号管理（system_configs 存多账号 + Cookie）
//   - content-rewriter.js  AI 改写（按平台风格 prompt 模板）
//   - humanizer.js      行为模拟（人类打字 + 步间停顿 + 鼠标轨迹）
//   - approval.js       审批门控（关键操作前 SSE 推 confirm）
//   - kanban-handler.js Kanban 调度集成（task.due → publishTo）
//   - providers/        每平台一个文件，复用本入口的 executeSteps()
//
// 设计哲学（跟 ai-web-chat 保持一致）：
//   1. 单例浏览器（复用 web_* 全局浏览器实例）
//   2. 自动登录（auth save 凭据复用）
//   3. 步骤化执行（每步带截图 + 错误处理 + 重试）
//   4. 实时可观察（screenshots[] 返回，前端可做实时画面）
//   5. 求助机制（卡死/风控 → request_user_help）

const path = require('path');
const accountStore = require('./account-store');

// ── 主入口：发布到指定平台 ──
async function publishTo(platform, params) {
  // 验证平台
  const supported = ['toutiao', 'xiaohongshu', 'wechat_oa', 'zhihu', 'douyin'];
  if (!supported.includes(platform)) {
    return {
      ok: false,
      error: `unsupported_platform: ${platform}`,
      supported_platforms: supported,
    };
  }

  // 验证必填
  if (!params.account_id) {
    return { ok: false, error: 'missing_account_id' };
  }
  if (!params.title && !params.caption) {
    return { ok: false, error: 'missing_title_or_caption' };
  }

  // 懒加载 provider
  let provider;
  try {
    provider = require(`./providers/${platform}.js`);
  } catch (e) {
    return {
      ok: false,
      error: 'provider_not_implemented',
      platform,
      message: `${platform} provider 尚未实现。PR 2 头条已落地，PR 3 三平台复制头条模式。`,
      next_step: e.code === 'MODULE_NOT_FOUND'
        ? `创建 server/services/social-publisher/providers/${platform}.js`
        : `检查 providers/${platform}.js 错误: ${e.message}`,
    };
  }

  // 真实实现路径
  return await provider.publish(params, { account_id: params.account_id });
}

// ── AI 改写（PR 2 真实实现）──
async function rewriteForPlatform({ content, platform, tone, length }) {
  try {
    const rewriter = require('./content-rewriter');
    return await rewriter.rewrite({ content, platform, tone, length });
  } catch (e) {
    return { ok: false, error: `rewrite_failed: ${e.message}` };
  }
}

// ── 图片上传（PR 2 真实实现，PR 3 在 provider 内扩展）──
async function uploadImage({ image_url_or_path, account_id, platform }) {
  try {
    return await accountStore.uploadImage({ image_url_or_path, account_id, platform });
  } catch (e) {
    return { ok: false, error: `upload_failed: ${e.message}` };
  }
}

// ── 账号健康检查（PR 2 真实实现）──
async function checkAccount({ account_id, platform }) {
  try {
    return accountStore.checkHealth({ account_id, platform });
  } catch (e) {
    return { ok: false, status: 'error', error: `check_failed: ${e.message}` };
  }
}

module.exports = {
  // 主入口（PR 1 暴露）
  publishTo,
  rewriteForPlatform,
  uploadImage,
  checkAccount,
  // account-store 直接暴露（PR 2 增加）
  create: accountStore.create,
  list: accountStore.list,
  get: accountStore.get,
  getCredentials: accountStore.getCredentials,
  update: accountStore.update,
  remove: accountStore.remove,
  recordSuccess: accountStore.recordSuccess,
  recordFailure: accountStore.recordFailure,
  checkHealth: accountStore.checkHealth,
  // approval（PR 2 增加，给 routes 用）
  approval: require('./approval'),
  // humanizer（PR 5-3 暴露，给 L3 App / 单元测试用）
  humanizer: require('./humanizer'),
  // PR 5-1: 5 个 provider 直接暴露
  providers: {
    toutiao: require('./providers/toutiao'),
    xiaohongshu: require('./providers/xiaohongshu'),
    wechat_oa: require('./providers/wechat_oa'),
    zhihu: require('./providers/zhihu'),
    douyin: require('./providers/douyin'),
  },
  // account-store 完整暴露（PR 5-2 加 selectBestAccount / resetRiskLevel / scoreAccount）
  accountStore: require('./account-store'),
  // PR 4: Kanban 集成
  kanban: require('./kanban-helper'),
  startTaskExecutor: require('./sp-task-executor').startSpTaskExecutor,
  // PR 5-6: 监控
  startMonitor: require('./monitor').startSpMonitor,
  monitor: require('./monitor'),
  // PR 5-5: 持久化
  persistence: require('./persistence'),
  // 配置
  PLATFORM_LIMITS: accountStore.PLATFORM_LIMITS,
};
