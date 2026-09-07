// ACMS 内建工具 — 社交平台自动发布工具组（social-publisher v0.1 stub）
// =====================================================================
// 让 LLM（小吉 / 任务 agent）能像人一样自动发布图文到内容平台。
// 底层：复用 web_* 工具（browser-agent）+ ai-web-chat 语义层模式
//
// 使用约定（写给 LLM 看）：
//   给一段素材 → rewrite_content_for_platform 改写 → publish_to_xxx 发布
//   平台：toutiao（头条）/ xiaohongshu（小红书）/ wechat_oa（公众号）
//         / zhihu（知乎）/ douyin（抖音）
//   多账号：account_id 必须从 list_accounts / add_account 拿，不能现编
//   定时：options.schedule_at = '2026-09-10T09:00:00+08:00'（ISO8601 + 时区）
//   审批：options.require_approval = true → 关键操作（点"发布"）前弹 confirm
//
// 行为模拟：所有 publish_to_* 默认开 humanize（人类打字节奏 + 步间停顿）
// 失败重试：单步失败自动重试 2 次，2 次都失败 → request_user_help
// 截图证据：每步自动截图，screenshots[] 返回，回看发布过程
//
// 真实实现位置：server/services/social-publisher/
// 本文件只是 tool-registry 注册 + 参数透传到对应 service
//
// v0.1 stub：本版本所有 publish_to_* 返回 "not_implemented"
//            PR 2 起按 todo 列表逐平台实现

const { registerTool } = require('../services/tool-registry');
const { publishTo, rewriteForPlatform, uploadImage, checkAccount, kanban } = require('../services/social-publisher');
const taskStore = require('../stores/task-store');

// 工具层 Kanban 包装：建任务 → claim → 等结果（小吉对话里调）
async function runViaKanban(platform, args) {
  const task = kanban.createPublishTask({
    projectId: 'sp-tool-call',
    type: 'social-publish',
    platform,
    account_id: args.account_id,
    post_title: args.title || args.caption,
    content: args.content,
    images: args.images || [],
    tags: args.tags || [],
    options: args.options || {},
  });
  // 立即 claim（触发 sp-task-executor）
  taskStore.claim(task.id, 'sp-tool-call');
  // 等结果（轮询 artifacts.social_result，最长 5min）
  const start = Date.now();
  while (Date.now() - start < 300000) {
    await new Promise(r => setTimeout(r, 1500));
    const t = taskStore.getById(task.id);
    if (t.status === 'review' || t.status === 'failed' || t.status === 'done') {
      try {
        const arts = JSON.parse(t.artifacts || '{}');
        return arts.social_result || { ok: t.status === 'review' || t.status === 'done', error: t.progress_note };
      } catch {
        return { ok: t.status === 'review' || t.status === 'done', error: t.progress_note };
      }
    }
  }
  return { ok: false, error: 'timeout_5min', task_id: task.id };
}

// ── publish_to_toutiao ──
registerTool({
  name: 'publish_to_toutiao',
  description: '自动发布图文到今日头条（mp.toutiao.com）。背后是 Playwright 模拟人工操作：登录 → 打开发文页 → 填标题 → 填正文 → 上传图片 → 填标签 → 预览 → 点发布 → 验证 post_url。\n\n参数：\n- title: 标题（必填，10-30 字最佳）\n- content: 正文（必填，富文本 HTML 或纯文本）\n- images: 图片路径数组（可选，如 [\'/path/to/1.jpg\']，留空不传图）\n- tags: 标签数组（可选，如 [\'AI\',\'创业\']）\n- account_id: 账号 ID（必填，必须从 list_accounts 拿）\n- options.schedule_at: ISO8601 定时（可选，null=立即发）\n- options.require_approval: 发前是否弹 confirm（默认 true）\n- options.humanize: 行为模拟（默认 true）\n\n返回 {ok, post_url, post_id, screenshots, steps, total_elapsed_ms}。失败返回 {ok:false, error, failed_step, screenshots}。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '文章标题' },
      content: { type: 'string', description: '文章正文（HTML 或纯文本）' },
      images: { type: 'array', items: { type: 'string' }, description: '图片路径数组（可选）' },
      tags: { type: 'array', items: { type: 'string' }, description: '标签数组（可选）' },
      account_id: { type: 'string', description: '账号 ID（必填，从 list_accounts 拿）' },
      options: { type: 'object', description: '高级选项（schedule_at / require_approval / humanize）' },
    },
    required: ['title', 'content', 'account_id'],
  },
  async handler(args) {
    return await runViaKanban('toutiao', args);
  },
});

// ── publish_to_xiaohongshu ──
registerTool({
  name: 'publish_to_xiaohongshu',
  description: '自动发布图文到小红书（xiaohongshu.com / creator.xiaohongshu.com）。注意小红书风控极严，单账号每天上限 5 篇，必须开 humanize。\n\n参数：title 必填（20 字内，多 emoji）/ content 必填（短段 + emoji + 故事化）/ images 强烈建议（图文笔记必备封面图）/ account_id / options。\n\n返回同 publish_to_toutiao。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '笔记标题（20 字内）' },
      content: { type: 'string', description: '笔记正文' },
      images: { type: 'array', items: { type: 'string' }, description: '图片数组（必填，建议 3-9 张）' },
      account_id: { type: 'string', description: '账号 ID' },
      options: { type: 'object', description: '高级选项' },
    },
    required: ['title', 'content', 'images', 'account_id'],
  },
  async handler(args) {
    return await runViaKanban('xiaohongshu', args);
  },
});

// ── publish_to_wechat_oa ──
registerTool({
  name: 'publish_to_wechat_oa',
  description: '自动发布图文到微信公众号（mp.weixin.qq.com）。需要服务号 + 微信开放平台授权（auth save 凭据）。\n\n参数：title / content / images / summary（摘要，必填，公众号列表展示）/ account_id / options。\n\n返回同 publish_to_toutiao。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '文章标题' },
      content: { type: 'string', description: '文章正文（HTML）' },
      images: { type: 'array', items: { type: 'string' }, description: '图片数组' },
      summary: { type: 'string', description: '摘要（必填，列表展示）' },
      account_id: { type: 'string', description: '公众号账号 ID' },
      options: { type: 'object', description: '高级选项' },
    },
    required: ['title', 'content', 'summary', 'account_id'],
  },
  async handler(args) {
    return await runViaKanban('wechat_oa', args);
  },
});

// ── publish_to_zhihu ──
registerTool({
  name: 'publish_to_zhihu',
  description: '自动发布文章/回答到知乎（zhuanlan.zhihu.com）。可发布专栏文章或某个问题下的回答。\n\n参数：title / content / account_id / options.question_id（可选，指定问题 ID 时为回答模式，否则是专栏文章）。\n\n返回同 publish_to_toutiao。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '文章/回答标题' },
      content: { type: 'string', description: '正文（Markdown 或 HTML）' },
      account_id: { type: 'string', description: '账号 ID' },
      options: { type: 'object', description: '高级选项（含 question_id 走回答模式）' },
    },
    required: ['title', 'content', 'account_id'],
  },
  async handler(args) {
    return await runViaKanban('zhihu', args);
  },
});

// ── publish_to_douyin ──
registerTool({
  name: 'publish_to_douyin',
  description: '自动发布视频到抖音（creator.douyin.com）。需要视频文件 + 文案 + 话题标签。视频平台风控比图文严，建议短视频 ≤ 60s。\n\n参数：video_url（必填）/ caption（必填，文案）/ hashtags（标签数组）/ account_id / options。\n\n返回同 publish_to_toutiao。',
  parameters: {
    type: 'object',
    properties: {
      video_url: { type: 'string', description: '视频 URL 或本地路径' },
      caption: { type: 'string', description: '视频文案/标题' },
      hashtags: { type: 'array', items: { type: 'string' }, description: '话题标签' },
      account_id: { type: 'string', description: '账号 ID' },
      options: { type: 'object', description: '高级选项' },
    },
    required: ['video_url', 'caption', 'account_id'],
  },
  async handler(args) {
    return await runViaKanban('douyin', args);
  },
});

// ── rewrite_content_for_platform（辅助工具）──
registerTool({
  name: 'rewrite_content_for_platform',
  description: '把素材按目标平台风格改写。调 modelStore 的 LLM（复用现有模型库）。\n\n平台风格：\n- toutiao: 1500-3000 字长文，标题党，开头直入主题，分小标题\n- xiaohongshu: 300-800 字短段，多 emoji，故事化，末尾 5-8 个标签\n- wechat_oa: 1500-2500 字，标题党，故事化开头，有金句\n- zhihu: 1000-2000 字，亮观点，引用数据/案例\n- douyin: 30-100 字短文案，钩子开头，结尾有互动\n\n参数：content（必填，原始素材）/ platform（必填）/ tone（可选，如"专业"/"轻松"）/ length（可选，如"短"/"中"/"长"）\n\n返回 {ok, content, tokens_used, model_id}。',
  parameters: {
    type: 'object',
    properties: {
      content: { type: 'string', description: '原始素材' },
      platform: { type: 'string', enum: ['toutiao', 'xiaohongshu', 'wechat_oa', 'zhihu', 'douyin'], description: '目标平台' },
      tone: { type: 'string', description: '语气（可选）' },
      length: { type: 'string', description: '长度（短/中/长）' },
    },
    required: ['content', 'platform'],
  },
  async handler(args) {
    return await rewriteForPlatform(args);
  },
});

// ── upload_image_to_platform（辅助工具）──
registerTool({
  name: 'upload_image_to_platform',
  description: '把图片上传到目标平台图床，返回 CDN URL。可在 publish_to_xxx 之前单独调用。\n\n参数：image_url_or_path（必填）/ account_id（必填）/ platform（必填）\n\n返回 {ok, cdn_url, size, width, height}。',
  parameters: {
    type: 'object',
    properties: {
      image_url_or_path: { type: 'string', description: '图片 URL 或本地路径' },
      account_id: { type: 'string', description: '账号 ID' },
      platform: { type: 'string', enum: ['toutiao', 'xiaohongshu', 'wechat_oa', 'zhihu', 'douyin'], description: '目标平台' },
    },
    required: ['image_url_or_path', 'account_id', 'platform'],
  },
  async handler(args) {
    return await uploadImage(args);
  },
});

// ── check_account_status（辅助工具）──
registerTool({
  name: 'check_account_status',
  description: '检查账号是否健康：Cookie 是否过期、是否被风控、最近一次使用时间。发之前必调。\n\n参数：account_id（必填）/ platform（可选，限定检查某平台）\n\n返回 {ok, status: "healthy"|"cookie_expired"|"risk_control"|"banned", last_used_at, risk_level: 0-100}。',
  parameters: {
    type: 'object',
    properties: {
      account_id: { type: 'string', description: '账号 ID' },
      platform: { type: 'string', description: '限定平台（可选）' },
    },
    required: ['account_id'],
  },
  async handler(args) {
    return await checkAccount(args);
  },
});
