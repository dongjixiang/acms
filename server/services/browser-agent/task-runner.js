// ACMS 浏览器智能体 — 目标驱动任务执行器（v0.2）
// ============================================================
// 用户给一个目标（自然语言），本执行器驱动 LLM 自主规划：
//   理解目标 → 调 web_* 工具操作真实浏览器 → 观察结果 → 调整 → 达成
// 底层：agent-runtime.execute（复用 runToolLoop 工具循环）
//       + browser-agent 服务（web_* 工具，agent-browser CLI）
//
// 可观察性：onStep 每轮回调 {round, maxRounds, message, toolNames}
//          + fire-and-forget 截图（每步存 taskId 目录，SSE 推路径）
//
// 用法：
//   const runner = require('./task-runner');
//   await runner.runGoalTask('去 DeepSeek 查一下深圳95油价', {
//     taskId: 'bt-xxx', onStep: (step) => console.log(step.message),
//   });

const path = require('path');
const runtime = require('../agent-runtime');
const ba = require('./index');
// v0.119: Puppeteer driver（远程预览引擎）—— session.appSessionId 存在时
// 每步截图从该会话页截，而不是 CLI daemon（避免截到无关页面）
const ppDriver = require('./puppeteer-driver');
// 🔴 P178 防御：直调/独立进程时必须先触发工具注册，
//    否则 toProviderFormat(toolNames) 返回空 → 模型看不到工具 → 文本伪调用死循环
try { require('../../tools'); } catch (e) { /* 生产环境入口已注册，幂等 */ }

// 模型：跟随系统默认生成模型（多多要求 2026-08-31）。
// 默认模型若输出文本格式伪调用（{"tool":..}/[工具调用]），
// llm-adapter v0.2 已支持解析（parseInlineToolCalls 扩展）—— 不再强制指定 DeepSeek。

// 浏览器智能体 system prompt（目标驱动 + 工具使用规范）
const BROWSER_AGENT_PROMPT = `你是「浏览器智能体」，一个能操作真实浏览器的自主 AI 助手。

【你的任务】
用户给你一个目标，你需要自己想办法用 web_* 工具逐步达成目标，不需要用户逐步指导。

【标准工作流】
1. web_open 打开最相关的页面（搜索引擎 / 目标网站）
2. web_snapshot 获取页面无障碍树（元素带 [ref=eN] 编号），理解页面结构
3. web_find 按文本/占位符定位元素（如 web_find({"locator":"text","value":"搜索","action":"click"})）
   或 web_click/web_type 按 ref 操作（@eN）
4. web_read 读取正文 / web_screenshot 截图确认结果
5. 结果不对就调整策略重试，直到目标达成

【关键规则】
- 每一步都要看工具返回结果，根据实际结果决定下一步，不要编造页面内容
- 长文本结果用 web_read 读取，页面复杂时用 web_eval 精确提取（表达式用 IIFE 写法）
- 目标达成后用中文总结：做了什么、关键结果、证据（URL/数据/截图）
- 不要做超出目标范围的事（不下载文件、不提交表单除非目标要求）

【路径与决策规则 —— 严格遵守，禁止擅自换路】
⚠️ 此段优先级高于「标准工作流」中的「调整策略重试」原则。
- 禁止自行决定「换目标网站 / 换数据源 / 改用 web_ai_search / Bing / 百度等替代工具」来绕过障碍，
  即使这些工具有可能间接拿到等价信息 —— 任务路径的改变必须经用户同意。
- 遇到任何障碍（登录墙、验证码、滑块、人机验证、风控拦截、技术异常、信息不足、目标路径走不通）：
  **必须**立即调 request_user_help，**禁止**用 web_ai_search 或其他网站「间接达成」目标。
- 同一操作尝试 2 次仍失败 → 立即求助（不要第 3 次尝试）。
- 任务方向、数据源、达成路径发生任何变化 → 调 request_user_help 获取用户授权。

【需要用户帮助时 —— 必须调 request_user_help 暂停求助，禁止硬闯】
**禁止**以下行为：
- 反复尝试不同登录 URL、在登录页/验证码页空转、假装已登录、用截图/读取代替登录。
- 擅自调用 web_ai_search / 搜索引擎 / AI 问答等工具「绕开」障碍（哪怕能拿到等价信息）。

**必须**立即调 request_user_help（参数 question 用【三选一模板】说明要用户做什么）：
- 页面出现登录表单（含「登录 / 电子邮件 / 邮箱 / 密码 / 验证码 / 手机号」输入框或按钮）
- 遇到验证码 / 滑块 / 人机验证 / 风控拦截（出现「安全验证」「请完成验证」「拖动滑块」等）
- 需要用户提供额外信息、做选择、确认有风险的操作
- 同一操作尝试 2 次仍失败（元素找不到、页面结构变化、加载异常）
- 任务路径遇到任何阻碍你无法自主达成目标的场景

【三选一求助模板 —— 调 request_user_help 时必须用这个格式】
---
【遇到障碍】<具体原因 + 当前页面证据，如「京东搜索结果页检测到登录墙，未登录状态下不可见价格」>
可选项：
A. <提供账号 / 手动完成登录后告诉我继续>
B. <改用其他数据源（如 Bing 搜索 / 百度 / AI 搜索）获取等价信息>
C. <取消任务，不再尝试>

请回复 A / B / C（或自定义指令）
---
调 request_user_help 后任务暂停，用户回复会作为新消息注入，你从暂停处继续。`;

// 内存任务表（taskId → 状态），重启丢失可接受
const TASKS = new Map(); // taskId -> { goal, status, steps, content, error, createdAt }

async function runGoalTask(goal, opts = {}) {
  const taskId = opts.taskId || ('bt-' + Date.now().toString(36));
  const maxRounds = opts.maxRounds || 20; // v0.2: 15→20（探索型任务轮次更充裕）
  const shotDir = path.join(ba.SESSION_ROOT, taskId);
  const steps = [];

  const task = {
    taskId,
    goal,
    status: 'running',
    steps,
    content: '',
    error: null,
    createdAt: Date.now(),
    // resume 支持：保存 messages + 模型，回复后继续
    messages: null,
    modelId: opts.modelId || null,
  };
  TASKS.set(taskId, task);

  // resume 模式：从上次暂停的 messages 继续（用户回复注入）
  let messages;
  if (Array.isArray(opts.initialMessages) && opts.initialMessages.length > 0) {
    messages = opts.initialMessages;
    messages.push({ role: 'user', content: `[用户回复] ${opts.userReply || ''}\n请根据用户的帮助继续完成任务。` });
  } else {
    messages = [
      { role: 'system', content: BROWSER_AGENT_PROMPT },
      { role: 'user', content: `【目标】${goal}\n请开始执行。每步操作后观察结果，目标达成后用中文总结。` },
    ];
  }
  task.messages = messages;

  // 回调挂到 task 上（resume 复用同一套推送）
  task._onStep = opts.onStep || null;
  task._onWaiting = opts.onWaiting || null;
  task._onDone = opts.onDone || null;

  const emitStep = (round, maxR, message, toolNames) => {
    const step = { round, maxRounds: maxR, message, toolNames: toolNames || [], ts: Date.now() };
    steps.push(step);
    // fire-and-forget 截图（不阻塞 loop；截图 ~1s）
    const shotPath = path.join(shotDir, `step-${round}.png`);
    ba.screenshotToFile(shotPath).then(() => {
      if (task._onStep) task._onStep({ ...step, screenshot: `/api/browser-agent/screenshots/${taskId}/step-${round}.png` });
    }).catch(() => {
      // 截图失败：传 null，前端不渲染破图
      if (task._onStep) task._onStep({ ...step, screenshot: null });
    });
  };

  try {
    const { content, error, status, question, messages: outMessages } = await runtime.execute({
      modelId: opts.modelId, // 默认用系统默认生成模型（多多要求）；可显式覆盖
      messages,
      toolNames: [
        'web_open', 'web_snapshot', 'web_click', 'web_type', 'web_press',
        'web_read', 'web_eval', 'web_find', 'web_screenshot', 'web_ai_search',
        'request_user_help',
      ],
      maxRounds,
      caller: 'browser-agent-task',
      context: { taskId },
      onProgress: emitStep,
    });
    // v0.2: 求助暂停 —— 保存 messages 等用户回复后 resume
    if (status === 'waiting_user') {
      task.status = 'waiting_user';
      task.pendingQuestion = question || '需要你的帮助';
      task.messages = outMessages || messages;
      if (opts.onWaiting) opts.onWaiting({ taskId, question: task.pendingQuestion });
      return { taskId, status: 'waiting_user', question: task.pendingQuestion, steps };
    }
    task.status = error ? 'error' : 'done';
    task.content = content || '';
    task.error = error || null;
    if (opts.onDone) opts.onDone({ taskId, status: task.status, content: task.content, error: task.error, steps });
    return { taskId, status: task.status, content: task.content, error: task.error, steps };
  } catch (e) {
    task.status = 'error';
    task.error = e.message;
    if (opts.onDone) opts.onDone({ taskId, status: 'error', content: '', error: e.message, steps });
    return { taskId, status: 'error', content: '', error: e.message, steps };
  }
}

// 用户回复后继续任务（resume）
async function resumeGoalTask(taskId, userReply) {
  const task = TASKS.get(taskId);
  if (!task) return { taskId, status: 'error', error: '任务不存在' };
  if (task.status !== 'waiting_user') return { taskId, status: 'error', error: `任务不在等待用户状态（当前 ${task.status}）` };

  task.status = 'running';
  task.pendingQuestion = null;
  const steps = task.steps;

  // 重新跑（复用已有 messages + 注入用户回复）
  const shotDir = path.join(ba.SESSION_ROOT, taskId);
  const emitStep = (round, maxR, message, toolNames) => {
    const step = { round, maxRounds: maxR, message, toolNames: toolNames || [], ts: Date.now() };
    steps.push(step);
    const shotPath = path.join(shotDir, `step-${round}.png`);
    ba.screenshotToFile(shotPath).then(() => {
      if (task._onStep) task._onStep({ ...step, screenshot: `/api/browser-agent/screenshots/${taskId}/step-${round}.png` });
    }).catch(() => {
      if (task._onStep) task._onStep({ ...step, screenshot: null });
    });
  };

  try {
    const { content, error, status, question, messages: outMessages } = await runtime.execute({
      modelId: task.modelId || undefined,
      messages: task.messages.concat([{ role: 'user', content: `[用户回复] ${userReply}\n请根据用户的帮助继续完成任务。` }]),
      toolNames: [
        'web_open', 'web_snapshot', 'web_click', 'web_type', 'web_press',
        'web_read', 'web_eval', 'web_find', 'web_screenshot', 'web_ai_search',
        'request_user_help',
      ],
      maxRounds: 10,
      caller: 'browser-agent-task-resume',
      context: { taskId },
      onProgress: emitStep,
    });
    if (status === 'waiting_user') {
      task.status = 'waiting_user';
      task.pendingQuestion = question || '需要你的帮助';
      task.messages = outMessages || task.messages;
      if (task._onWaiting) task._onWaiting({ taskId, question: task.pendingQuestion });
      return { taskId, status: 'waiting_user', question: task.pendingQuestion, steps };
    }
    task.status = error ? 'error' : 'done';
    task.content = content || '';
    task.error = error || null;
    if (task._onDone) task._onDone({ taskId, status: task.status, content: task.content, error: task.error, steps });
    return { taskId, status: task.status, content: task.content, error: task.error, steps };
  } catch (e) {
    task.status = 'error';
    task.error = e.message;
    if (task._onDone) task._onDone({ taskId, status: 'error', content: '', error: e.message, steps });
    return { taskId, status: 'error', content: '', error: e.message, steps };
  }
}

function getTask(taskId) {
  return TASKS.get(taskId) || null;
}

// ============================================================
// v1.0：会话多轮（多轮上下文累积）
//   sessionStore 维护 messages[] → 每次 user msg 累积进 messages
//   再调 runtime.execute 跑一轮 → 完成后 append assistant 内容
//   waiting_user 状态保留 messages + pendingQuestion → 用户回复后 resume
// ============================================================
const sessionStore = require('./session-store');

// v0.118.12: domain 级完成钩子（区别于 onDone SSE 回调）
//   onDone 由 routes 每轮（首轮/resume）重新传入 → 只推 SSE；
//   domainOnDone 只在首轮注册一次并存在 session 上 → resume 走 routes 后仍能在
//   终态执行一次（go-publisher 落 history/platform-memory 依赖它），幂等置空。
function invokeDomainDone(session, result) {
  const fn = session && session.domainOnDone;
  if (typeof fn !== 'function') return;
  session.domainOnDone = null;  // 幂等：只落一次
  try {
    fn({
      sessionId: session.id,
      taskId: session.currentTaskId || null,
      status: session.status || 'error',
      content: (result && result.content) || '',
      error: session.error || (result && result.error) || null,
    });
  } catch (e) {
    console.error('[task-runner] domainOnDone failed:', e.message);
  }
}

// v0.118.15: session 级 SSE 内建广播 —— 修复「service 直调 runSessionTurn 无事件」
//   旧设计：SSE 客户端管理与广播在 routes 层（SESSION_SSE_CLIENTS + makeSessionCallbacks），
//   靠 routes 创建 session 时传 onStep/onWaiting/onDone 才有事件。
//   go-publisher service 直调 runSessionTurn（不经 routes /session/start）→ 没传回调 →
//   前端订阅 /session/:id/stream 后永远收不到 step/done →「⏳ 等待 LLM 开始执行…」。
//   现在：SSE 是 session 执行状态的一等通道 —— 客户端管理 + 广播内建在本模块，
//   任何调用方（routes / 域服务）创建的 session 都能被订阅。opts.on* 回调保留兼容。
const SESSION_SSE_CLIENTS = new Map(); // sessionId -> Set<res>

function pushSessionSSE(sessionId, event, data) {
  const clients = SESSION_SSE_CLIENTS.get(sessionId);
  if (!clients || clients.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach((res) => { try { res.write(payload); } catch (e) {} });
}

function closeSessionSSE(sessionId) {
  const clients = SESSION_SSE_CLIENTS.get(sessionId);
  if (!clients) return;
  clients.forEach((res) => { try { res.end(); } catch (e) {} });
  SESSION_SSE_CLIENTS.delete(sessionId);
}

function scheduleCloseSessionSSE(sessionId, delayMs) {
  setTimeout(() => closeSessionSSE(sessionId), delayMs || 1500);
}

function lastAssistantContent(session) {
  try {
    const msgs = session.messages || [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant' && msgs[i].content) return msgs[i].content;
    }
  } catch (_) { /* ignore */ }
  return '';
}

// 订阅 session 进度流（补发历史 toolCalls + 当前状态 + 挂客户端）
function attachSessionStream(sessionId, res, req) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('retry: 3000\n\n');

  const session = sessionStore.get(sessionId);
  if (!session) {
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ error: '会话不存在' })}\n\n`);
      res.end();
    } catch (_) { /* ignore */ }
    return false;
  }

  // 补发已产生的工具调用 + 当前状态
  if (session.toolCalls && session.toolCalls.length) {
    session.toolCalls.forEach((s) => {
      try { res.write(`event: step\ndata: ${JSON.stringify(s)}\n\n`); } catch (_) {}
    });
  }
  try {
    if (session.status === 'waiting_user') {
      res.write(`event: waiting_user\ndata: ${JSON.stringify({ sessionId, question: session.pendingQuestion })}\n\n`);
    } else if (session.status !== 'running' && session.status !== 'idle') {
      // 已 done/error（补发带 content：从 messages 最后 assistant 取）
      res.write(`event: done\ndata: ${JSON.stringify({ sessionId, status: session.status, content: lastAssistantContent(session), error: session.error || null })}\n\n`);
      res.end();
      return true;
    }
  } catch (_) { /* ignore */ }

  if (!SESSION_SSE_CLIENTS.has(sessionId)) SESSION_SSE_CLIENTS.set(sessionId, new Set());
  SESSION_SSE_CLIENTS.get(sessionId).add(res);
  if (req) {
    req.on('close', () => {
      const set = SESSION_SSE_CLIENTS.get(sessionId);
      if (set) { set.delete(res); if (set.size === 0) SESSION_SSE_CLIENTS.delete(sessionId); }
    });
  }
  return true;
}

function broadcastStep(sessionId, stepObj, opts) {
  sessionStore.addToolCall(sessionId, stepObj);
  pushSessionSSE(sessionId, 'step', stepObj);
  if (opts && typeof opts.onStep === 'function') opts.onStep(stepObj);
}

function broadcastWaiting(sessionId, question, opts, taskId) {
  pushSessionSSE(sessionId, 'waiting_user', { sessionId, question });
  if (opts && typeof opts.onWaiting === 'function') opts.onWaiting({ sessionId, taskId, question });
}

function broadcastDone(sessionId, taskId, status, content, error, opts) {
  const data = { sessionId, taskId, status, content: content || '', error: error || null };
  if (opts && typeof opts.onDone === 'function') opts.onDone(data);
  pushSessionSSE(sessionId, 'done', data);
  scheduleCloseSessionSSE(sessionId, 1500);
}

const SESSION_TOOL_NAMES = [
  'web_open', 'web_snapshot', 'web_click', 'web_type', 'web_press',
  'web_read', 'web_eval', 'web_find', 'web_screenshot', 'web_ai_search',
  'web_auth_login',  // v0.118.16: 服务端 agent-browser auth login（LLM 不再用 web_eval execSync 死路）
  'request_user_help',
];

// v0.119.2: 远程预览引擎锁 —— 同一 Puppeteer 会话（appSessionId）同时只允许一个查询驱动。
//   Web机器人多个会话共享同一个 app-runtime 浏览器（localStorage 同 appSessionId），
//   并行查询会互相抢页面/破坏登录态（多多要求：远程预览模式下禁止并行查询）。
//   锁粒度 = appSessionId（不同浏览器实例互不阻塞）；waiting_user 期间保持占用（页面停留
//   在登录/验证等敏感态，别人不许动），done/error 才释放；删除会话自动释放。
const PP_LOCKS = new Map(); // appSessionId -> { ownerSessionId, ts }

function acquirePpLock(appSessionId, sessionId) {
  if (!appSessionId) return { ok: true };
  const cur = PP_LOCKS.get(appSessionId);
  if (!cur) {
    PP_LOCKS.set(appSessionId, { ownerSessionId: sessionId, ts: Date.now() });
    return { ok: true };
  }
  if (cur.ownerSessionId === sessionId) return { ok: true }; // 自己（resume / begin 已持有）
  return { ok: false, error: `远程预览浏览器正被会话 ${cur.ownerSessionId} 的查询占用 —— 远程预览模式禁止并行查询：请先等它完成，或到该会话点 ⏹ 停止，再回来继续` };
}

function releasePpLock(appSessionId, sessionId) {
  if (!appSessionId) return;
  const cur = PP_LOCKS.get(appSessionId);
  if (cur && cur.ownerSessionId === sessionId) PP_LOCKS.delete(appSessionId);
}

// routes 用：同步检查 —— busy 返回错误文案，否则 null（start/turn/reply 前置 gate）
function checkPpBusy(appSessionId, sessionId) {
  if (!appSessionId) return null;
  const cur = PP_LOCKS.get(appSessionId);
  if (cur && cur.ownerSessionId !== sessionId) {
    return `远程预览浏览器正被会话 ${cur.ownerSessionId} 的查询占用 —— 远程预览模式禁止并行查询：请先等它完成，或到该会话点 ⏹ 停止`;
  }
  return null;
}

// v0.118.16: 人主动发起介入（对话框可由 Agent 发起 = request_user_help，也可由人发起 = interruptSession）
//   写 session.pendingHuman → runToolLoop 每轮轮首经 context.humanSteerProvider 感知
//   两种形态：
//     interrupt {}（无 message）      → pause:true → Agent 当前动作结束后暂停（waiting_user 链路）等人工输入
//     interrupt { message }           → 注入下轮（不暂停），Agent 立即响应人的指示
function interruptSession(sessionId, payload = {}) {
  const session = sessionStore.get(sessionId);
  if (!session) return { ok: false, error: '会话不存在' };
  if (session.status !== 'running') {
    return { ok: false, error: `会话不在执行中（当前 ${session.status}）`, status: session.status };
  }
  const msg = payload.message ? String(payload.message).trim() : '';
  session.pendingHuman = msg
    ? { pause: false, message: msg, ts: Date.now() }
    : { pause: true, question: payload.question || '用户请求暂停介入，请在下方输入指示，回复后 Agent 继续', ts: Date.now() };
  return { ok: true, pause: !msg };
}

// 给 runtime.execute 的 context.humanSteerProvider（每轮被 runToolLoop 询问一次，读到即清）
function makeHumanSteerProvider(session) {
  return () => {
    if (!session || !session.pendingHuman) return null;
    const h = session.pendingHuman;
    session.pendingHuman = null;
    return h;
  };
}

async function runSessionTurn(sessionId, userMsg, opts = {}) {
  if (!sessionId || !userMsg) return { sessionId, status: 'error', error: '缺少 sessionId 或 userMsg' };
  const session = sessionStore.getOrCreate(sessionId, { title: opts.title });
  if (typeof opts.domainOnDone === 'function') session.domainOnDone = opts.domainOnDone;
  // v0.119: 远程预览引擎 —— 记录/刷新 app-runtime 会话 id（web_* 动作驱动 Puppeteer）
  if (opts.appSessionId) session.appSessionId = String(opts.appSessionId);
  // v0.119.2: 远程预览引擎锁 —— 并行查询 gate（busy 时不 push 消息、不启动）
  if (session.appSessionId) {
    const g = acquirePpLock(session.appSessionId, sessionId);
    if (!g.ok) return { sessionId, status: 'busy', error: g.error };
  }
  // push user message（累积上下文）—— v1.0 修复：addMessage 是 store 类方法，不是 session 实例方法
  sessionStore.addMessage(sessionId, { role: 'user', content: userMsg, ts: Date.now() });

  // 构造完整 messages：system + 累积历史
  const messages = [
    { role: 'system', content: BROWSER_AGENT_PROMPT },
    ...session.messages,
  ];

  const taskId = opts.taskId || ('ws-' + Date.now().toString(36));
  session.currentTaskId = taskId;
  session.status = 'running';
  session.pendingQuestion = null;

  let result;
  try {
    result = await runtime.execute({
      modelId: opts.modelId, // 默认跟随系统默认生成模型
      messages,
      toolNames: SESSION_TOOL_NAMES,
      maxRounds: opts.maxRounds || 20,
      caller: 'browser-agent-session',
      context: { sessionId, taskId, humanSteerProvider: makeHumanSteerProvider(session), appSessionId: session.appSessionId || null },
      onProgress: (round, maxRounds, message, toolNames) => {
        // 修复：runToolLoop 传入 4 个独立参数，不是对象；包装成 step 对象再保存
        const step = { round: round || 0, maxRounds: maxRounds || 20, message: message || '', toolNames: Array.isArray(toolNames) ? toolNames : [] };
        const taskIdVal = session.currentTaskId || taskId || sessionId;
        const roundNum = step.round || round || 1;
        const shotPath = path.join(ba.SESSION_ROOT || require('path').resolve('data/browser-sessions'), taskIdVal, `step-${roundNum}.png`);
        // v0.118.15: 完整执行链路可视化（截图成功/失败都广播 step；内建 SSE 不依赖 opts.onStep）
        const emitStep = (screenshot) => {
          broadcastStep(sessionId, { ...step, ts: Date.now(), screenshot }, opts);
        };
        const shotTask = session.appSessionId
          ? ppDriver.screenshotToFile(session.appSessionId, shotPath)
          : ba.screenshotToFile(shotPath);
        shotTask.then(() => {
          emitStep(`/api/browser-agent/screenshots/${taskIdVal}/step-${roundNum}.png`);
        }).catch(() => {
          emitStep(null);
        });
      },
    });
  } catch (e) {
    session.status = 'error';
    session.error = e.message;
    // v0.119.2: 异常也释放锁
    releasePpLock(session.appSessionId || null, sessionId);
    broadcastDone(sessionId, taskId, 'error', '', e.message, opts);
    invokeDomainDone(session, null);
    return { sessionId, status: 'error', error: e.message };
  }

  // waiting_user：保留 messages + question，等用户回复
  if (result.status === 'waiting_user') {
    session.status = 'waiting_user';
    session.pendingQuestion = result.question;
    session.messages = result.messages || session.messages;
    broadcastWaiting(sessionId, session.pendingQuestion, opts, taskId);
    return { sessionId, taskId, status: 'waiting_user', question: session.pendingQuestion };
  }

  session.status = result.error ? 'error' : 'done';
  // push assistant 回复到 session.messages（下次 turn 自动看到）—— v1.0 修复：addMessage 是 store 类方法
  sessionStore.addMessage(sessionId, { role: 'assistant', content: result.content || '', ts: Date.now() });
  // v0.119.2: 终态释放远程预览引擎锁（waiting_user 已在上文 return，不释放）
  releasePpLock(session.appSessionId || null, sessionId);
  // v0.118.12: onDone/return 补 content —— session 对象无 content 字段，此前 done 事件丢 LLM 总结
  //   （go-publish 域壳依赖 content 提取 post_url / 写历史档案）
  broadcastDone(sessionId, taskId, session.status, result.content || '', session.error, opts);
  invokeDomainDone(session, result);
  return { sessionId, taskId, status: session.status, content: result.content || '', error: session.error };
}

async function resumeSessionTurn(sessionId, userReply, opts = {}) {
  if (!sessionId) return { sessionId, status: 'error', error: '缺少 sessionId' };
  const session = sessionStore.get(sessionId);
  if (!session) return { sessionId, status: 'error', error: '会话不存在' };
  if (session.status !== 'waiting_user') return { sessionId, status: 'error', error: `会话不在等待状态（当前 ${session.status}）` };

  // v0.119.2: resume 也受远程预览引擎锁保护（owner=self 续用；ACMS 重启后锁空 → 允许重新持有）
  if (opts.appSessionId) session.appSessionId = String(opts.appSessionId);
  if (session.appSessionId) {
    const g = acquirePpLock(session.appSessionId, sessionId);
    if (!g.ok) return { sessionId, status: 'busy', error: g.error };
  }

  // push user reply —— v1.0 修复：addMessage 是 store 类方法
  sessionStore.addMessage(sessionId, { role: 'user', content: '[用户回复] ' + String(userReply || ''), ts: Date.now() });

  const messages = [
    { role: 'system', content: BROWSER_AGENT_PROMPT },
    ...session.messages,
  ];

  session.status = 'running';
  session.pendingQuestion = null;

  let result;
  try {
    result = await runtime.execute({
      modelId: opts.modelId,
      messages,
      toolNames: SESSION_TOOL_NAMES,
      maxRounds: opts.maxRounds || 10,
      caller: 'browser-agent-session-resume',
      context: { sessionId, taskId: session.currentTaskId, humanSteerProvider: makeHumanSteerProvider(session), appSessionId: session.appSessionId || null },
      onProgress: (round, maxRounds, message, toolNames) => {
        // 修复：runToolLoop 传入 4 个独立参数，包装成对象
        const step = { round: round || 0, maxRounds: maxRounds || 10, message: message || '', toolNames: Array.isArray(toolNames) ? toolNames : [] };
        const taskIdVal = session.currentTaskId || sessionId;
        const roundNum = step.round || round || 1;
        const shotPath = path.join(ba.SESSION_ROOT || require('path').resolve('data/browser-sessions'), taskIdVal, `step-${roundNum}.png`);
        // v0.118.15: 与 runSessionTurn 对齐 —— 等截图落盘再广播（防破图），内建 SSE 不依赖 opts.onStep
        const emitStep = (screenshot) => {
          broadcastStep(sessionId, { ...step, ts: Date.now(), screenshot }, opts);
        };
        const shotTask = session.appSessionId
          ? ppDriver.screenshotToFile(session.appSessionId, shotPath)
          : ba.screenshotToFile(shotPath);
        shotTask.then(() => {
          emitStep(`/api/browser-agent/screenshots/${taskIdVal}/step-${roundNum}.png`);
        }).catch(() => {
          emitStep(null);
        });
      },
    });
  } catch (e) {
    session.status = 'error';
    session.error = e.message;
    // v0.119.2: 异常也释放锁
    releasePpLock(session.appSessionId || null, sessionId);
    broadcastDone(sessionId, session.currentTaskId, 'error', '', e.message, opts);
    invokeDomainDone(session, null);
    return { sessionId, status: 'error', error: e.message };
  }

  if (result.status === 'waiting_user') {
    session.status = 'waiting_user';
    session.pendingQuestion = result.question;
    session.messages = result.messages || session.messages;
    broadcastWaiting(sessionId, session.pendingQuestion, opts, session.currentTaskId);
    return { sessionId, taskId: session.currentTaskId, status: 'waiting_user', question: session.pendingQuestion };
  }

  session.status = result.error ? 'error' : 'done';
  // v1.0 修复：addMessage 是 store 类方法
  sessionStore.addMessage(sessionId, { role: 'assistant', content: result.content || '', ts: Date.now() });
  // v0.119.2: 终态释放远程预览引擎锁（waiting_user 已在上文 return，不释放）
  releasePpLock(session.appSessionId || null, sessionId);
  // v0.118.12: onDone/return 补 content（与 runSessionTurn 对齐，session 对象无 content 字段）
  broadcastDone(sessionId, session.currentTaskId, session.status, result.content || '', session.error, opts);
  invokeDomainDone(session, result);
  return { sessionId, taskId: session.currentTaskId, status: session.status, content: result.content || '', error: session.error };
}

function getSession(sessionId) {
  return sessionStore.get(sessionId);
}
function listSessions() {
  return sessionStore.list();
}
function deleteSession(sessionId) {
  // v0.118.15: 删除会话同时清 SSE 客户端（routes DELETE 不再显式 close）
  closeSessionSSE(sessionId);
  // v0.119.2: 删除会话释放远程预览引擎锁（防锁残留）
  const s = sessionStore.get(sessionId);
  if (s) releasePpLock(s.appSessionId || null, sessionId);
  return sessionStore.delete(sessionId);
}

module.exports = {
  runGoalTask, resumeGoalTask, getTask,
  runSessionTurn, resumeSessionTurn, getSession, listSessions, deleteSession,
  interruptSession,  // v0.118.16: 人主动发起介入（暂停等输入 / 注入发言）
  // v0.119.2: 远程预览引擎锁（routes start/turn/reply 前置 gate）
  checkPpBusy, acquirePpLock, releasePpLock,
  // v0.118.15: session SSE 订阅（routes /session/:id/stream 用）
  attachSessionStream, closeSessionSSE,
  BROWSER_AGENT_PROMPT, TASKS, sessionStore,
};
