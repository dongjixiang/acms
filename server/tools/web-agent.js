// ACMS 内建工具 — 跨应用浏览器自动化工具组（web_* v0.1）
// ============================================================
// 让 LLM（小吉 / 任务 agent）能像人一样操作真实浏览器：
// 打开任意网页、点击、输入、读取内容、截图。
// 底层：browser-agent 服务（agent-browser CLI，内置 stealth 反爬）
//
// 使用约定（写给 LLM 看）：
//   web_open 打开页面 → web_snapshot 拿无障碍树（元素带 @eN ref）→
//   web_click/web_type 操作 → web_read 拿正文 → web_screenshot 截图
//   复杂站点用 web_eval 直接跑 JS 查/改页面
//   要「去某 AI 网站问问题」用 web_ai_search（语义封装，自动处理登录/发送/等回答）
//
// 注意：浏览器实例全局唯一、串行执行；工具之间页面状态保持。

const { registerTool } = require('../services/tool-registry');
const ba = require('../services/browser-agent');
const aiWebChat = require('../services/ai-web-chat');

// ── web_open ──
registerTool({
  name: 'web_open',
  description: '打开一个网页（真实浏览器，可过多数反爬）。参数 url 必填。打开后如需理解页面结构调用 web_snapshot，读正文用 web_read。示例：web_open({"url":"https://chat.deepseek.com"})',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '要打开的完整 URL（含 https://）' },
    },
    required: ['url'],
  },
  async handler(args) {
    const r = await ba.open(args.url);
    if (!r.ok) return { error: r.error };
    return { ok: true, title: r.title || '', url: r.url || args.url };
  },
});

// ── web_snapshot ──
registerTool({
  name: 'web_snapshot',
  description: '获取当前浏览器页面的无障碍树（accessibility tree），返回带编号的可交互元素（如 [ref=e1]）。用它理解页面结构、找按钮/输入框/链接，然后 web_click / web_type 按 ref 或文本操作。',
  parameters: { type: 'object', properties: {}, required: [] },
  async handler() {
    const r = await ba.snapshot();
    if (!r.ok) return { error: r.error };
    return { ok: true, snapshot: r.output };
  },
});

// ── web_click ──
registerTool({
  name: 'web_click',
  description: '点击页面元素。selector 支持三种格式：1) @ref（web_snapshot 里的编号，如 @e5）2) CSS 选择器（如 button.primary）3) 文本定位用 web_find。',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: '@ref 编号或 CSS 选择器' },
    },
    required: ['selector'],
  },
  async handler(args) {
    const r = await ba.click(args.selector);
    if (!r.ok) return { error: r.error };
    return { ok: true };
  },
});

// ── web_type ──
registerTool({
  name: 'web_type',
  description: '向输入框输入文本。selector 同 web_click（@ref 或 CSS）。输入前会自动聚焦。示例：web_type({"selector":"@e6","text":"你好"})',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: '@ref 编号或 CSS 选择器' },
      text: { type: 'string', description: '要输入的文本' },
    },
    required: ['selector', 'text'],
  },
  async handler(args) {
    const r = await ba.typeText(args.selector, args.text);
    if (!r.ok) return { error: r.error };
    return { ok: true };
  },
});

// ── web_press ──
registerTool({
  name: 'web_press',
  description: '向当前聚焦元素发送按键。常用：Enter（提交/发送）、Tab、Escape、ArrowDown。示例：web_press({"key":"Enter"})',
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: '按键名，如 Enter / Tab / Escape / ArrowDown' },
    },
    required: ['key'],
  },
  async handler(args) {
    const r = await ba.press(args.key);
    if (!r.ok) return { error: r.error };
    return { ok: true };
  },
});

// ── web_read ──
registerTool({
  name: 'web_read',
  description: '读取当前页面的正文文本（agent 可读格式，非 HTML）。用于获取文章内容、搜索结果、AI 回答等。',
  parameters: { type: 'object', properties: {}, required: [] },
  async handler() {
    const r = await ba.readText();
    if (!r.ok) return { error: r.error };
    return { ok: true, text: r.output };
  },
});

// ── web_screenshot ──
registerTool({
  name: 'web_screenshot',
  description: '截取当前浏览器页面截图，保存到服务器并返回图片地址。用于视觉验证页面状态、把截图展示给用户。',
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: '可选，截图分组标识（默认 manual）' },
    },
    required: [],
  },
  async handler(args) {
    const tid = String(args.taskId || 'manual').replace(/[^a-zA-Z0-9_-]/g, '');
    const ts = Date.now();
    const filePath = require('path').join(ba.SESSION_ROOT, tid, `step-${ts}.png`);
    const r = await ba.screenshotToFile(filePath);
    if (!r.ok) return { error: r.error };
    return { ok: true, imagePath: `/api/browser-agent/screenshots/${tid}/step-${ts}.png` };
  },
});

// ── web_eval ──
registerTool({
  name: 'web_eval',
  description: '在当前页面执行 JavaScript 表达式并返回结果。用于处理复杂 DOM：查元素状态、读取动态内容、模拟滚动等。表达式是立即执行函数写法，如 (() => { return document.title })()',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'JavaScript 表达式' },
    },
    required: ['expression'],
  },
  async handler(args) {
    const r = await ba.evalJs(args.expression);
    if (!r.ok) return { error: r.error };
    return { ok: true, output: r.output };
  },
});

// ── web_find ──
registerTool({
  name: 'web_find',
  description: '按文本/占位符等语义定位元素并操作。locator: text（可见文本）/ placeholder（输入框占位符）/ role / label / alt。value: 目标文本。action: click（默认）/ hover / focus。示例：web_find({"locator":"text","value":"登录","action":"click"})',
  parameters: {
    type: 'object',
    properties: {
      locator: { type: 'string', enum: ['text', 'placeholder', 'role', 'label', 'alt', 'title', 'testid'], description: '定位方式' },
      value: { type: 'string', description: '目标文本' },
      action: { type: 'string', enum: ['click', 'hover', 'focus'], description: '操作（默认 click）' },
    },
    required: ['locator', 'value'],
  },
  async handler(args) {
    const r = await ba.find(args.locator, args.value, args.action || 'click');
    if (!r.ok) return { error: r.error };
    return { ok: true };
  },
});

// ── web_ai_search ──
registerTool({
  name: 'web_ai_search',
  description: '去 AI 网站（当前支持 DeepSeek 网页版）提问并返回完整回答。自动处理：登录（需已配置账号凭据）、可选开启联网搜索、输入问题、等待生成完成、提取回答、保存回答截图。\n\n【受限工具】仅当用户**明确要求**用 AI 搜索/AI 问答时使用（如「去 DeepSeek 查 X」「用 AI 帮我搜 X」）。\n**禁止**在主任务遇到障碍时自作主张调用本工具"绕开"问题（如登录墙改用 DeepSeek 间接获取）—— 此类场景必须先调 request_user_help 询问用户，由用户选择三选一（A 登录/B 换数据源/C 取消）。\n\n示例：web_ai_search({"site":"deepseek","prompt":"今天A股三大指数表现如何？","webSearch":true})',
  parameters: {
    type: 'object',
    properties: {
      site: { type: 'string', enum: ['deepseek'], description: 'AI 网站（当前仅 deepseek）' },
      prompt: { type: 'string', description: '要问的问题' },
      webSearch: { type: 'boolean', description: '是否开启该网站的联网搜索模式（DeepSeek 网页版有「联网搜索」开关）', default: false },
    },
    required: ['site', 'prompt'],
  },
  async handler(args) {
    if (args.site !== 'deepseek') return { error: `暂不支持站点: ${args.site}` };
    const r = await aiWebChat.deepSeekAsk(args.prompt, { webSearch: !!args.webSearch });
    if (!r.ok) return { error: r.error || 'DeepSeek 提问失败', step: r.step };
    return {
      ok: true,
      answer: r.answer,
      elapsedMs: r.elapsedMs,
      screenshot: r.screenshot || '',
      note: r.timeout ? '回答可能未完整生成（超时）' : '',
    };
  },
});

// ── request_user_help ──
// 求助暂停工具：浏览器智能体（task-runner）专用，遇到需要用户帮助时暂停等回复
registerTool({
  name: 'request_user_help',
  description: '当任务执行中遇到需要用户帮助的情况时调用（如：需要登录、遇到验证码/滑块/人机验证、需要用户提供信息或做决定、操作有风险需要确认）。调用后任务会暂停，你的问题展示给用户，用户回复后任务自动继续。参数 question 用中文清楚说明你需要用户做什么。',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: '需要用户做什么（中文，具体清晰，如「该网站需要登录，请提供账号密码或手动完成登录后回复我」）' },
    },
    required: ['question'],
  },
  async handler(args) {
    // runToolLoop 检测到 needUserHelp 会暂停循环（v0.2）
    return { needUserHelp: true, question: String(args?.question || '需要你的帮助') };
  },
});

console.log('[tools] 浏览器自动化工具注册完成: web_open, web_snapshot, web_click, web_type, web_press, web_read, web_screenshot, web_eval, web_find, web_ai_search, request_user_help');
