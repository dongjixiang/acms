// ACMS 跨应用浏览器自动化 REST API（browser-agent v0.1）
// ============================================================
// 端点：
//   POST /api/browser-agent/open       {url}          打开页面
//   POST /api/browser-agent/click      {selector}     点击（支持 @ref / text= / CSS）
//   POST /api/browser-agent/type       {selector,text} 输入文本
//   POST /api/browser-agent/press      {key}          按键
//   POST /api/browser-agent/read                      页面正文
//   POST /api/browser-agent/snapshot                  无障碍树（LLM 定位元素）
//   POST /api/browser-agent/find       {locator,value,action}
//   POST /api/browser-agent/eval       {expression}   JS 求值
//   POST /api/browser-agent/wait       {ms}
//   POST /api/browser-agent/screenshot {taskId?}      截图存盘 → 返回 URL
//   GET  /api/browser-agent/screenshots/:task/:file    读截图（?api_key= 认证）
//   GET  /api/browser-agent/status                    当前页面 + 登录态
//   POST /api/browser-agent/close                     关闭浏览器
//   POST /api/browser-agent/deepseek/ask {prompt, webSearch}  DeepSeek 网页版问答（ai-web-chat）
//
// 供：小吉工具 / 浏览器控制台视图 / GEO 引擎 adapter / 未来应用

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const ba = require('../services/browser-agent');
const aiWebChat = require('../services/ai-web-chat');

// ── POST /api/browser-agent/open ──
router.post('/open', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: '缺少 url' });
    const r = await ba.open(url);
    if (!r.ok) return res.status(502).json({ error: r.error });
    res.json({ ok: true, url: r.url, title: r.title });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/browser-agent/click ──
router.post('/click', async (req, res) => {
  try {
    const { selector } = req.body || {};
    if (!selector) return res.status(400).json({ error: '缺少 selector' });
    const r = await ba.click(selector);
    if (!r.ok) return res.status(502).json({ error: r.error });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/browser-agent/type ──
router.post('/type', async (req, res) => {
  try {
    const { selector, text } = req.body || {};
    if (!selector || text === undefined) return res.status(400).json({ error: '缺少 selector 或 text' });
    const r = await ba.typeText(selector, text);
    if (!r.ok) return res.status(502).json({ error: r.error });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/browser-agent/press ──
router.post('/press', async (req, res) => {
  try {
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ error: '缺少 key' });
    const r = await ba.press(key);
    if (!r.ok) return res.status(502).json({ error: r.error });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/browser-agent/read ──
router.post('/read', async (req, res) => {
  try {
    const r = await ba.readText();
    if (!r.ok) return res.status(502).json({ error: r.error });
    res.json({ ok: true, text: r.output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/browser-agent/snapshot ──
router.post('/snapshot', async (req, res) => {
  try {
    const r = await ba.snapshot();
    if (!r.ok) return res.status(502).json({ error: r.error });
    res.json({ ok: true, snapshot: r.output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/browser-agent/find ──
router.post('/find', async (req, res) => {
  try {
    const { locator, value, action } = req.body || {};
    if (!locator || !value) return res.status(400).json({ error: '缺少 locator 或 value' });
    const r = await ba.find(locator, value, action || 'click');
    if (!r.ok) return res.status(502).json({ error: r.error });
    res.json({ ok: true, output: r.output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/browser-agent/eval ──
router.post('/eval', async (req, res) => {
  try {
    const { expression } = req.body || {};
    if (!expression) return res.status(400).json({ error: '缺少 expression' });
    const r = await ba.evalJs(expression);
    if (!r.ok) return res.status(502).json({ error: r.error });
    res.json({ ok: true, output: r.output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/browser-agent/wait ──
router.post('/wait', async (req, res) => {
  try {
    const { ms } = req.body || {};
    const r = await ba.wait(parseInt(ms, 10) || 1000);
    if (!r.ok) return res.status(502).json({ error: r.error });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/browser-agent/screenshot ──
// 截图存到 data/browser-sessions/<taskId>/step-<ts>.png
// 返回可直接 <img> 使用的 URL（带 api_key）
router.post('/screenshot', async (req, res) => {
  try {
    const { taskId } = req.body || {};
    const tid = String(taskId || 'manual').replace(/[^a-zA-Z0-9_-]/g, '');
    const ts = Date.now();
    const filePath = path.join(ba.SESSION_ROOT, tid, `step-${ts}.png`);
    const r = await ba.screenshotToFile(filePath, { fullPage: !!req.body?.fullPage });
    if (!r.ok) return res.status(502).json({ error: r.error });
    const apiKey = req.query.api_key || req.headers['x-api-key'] || '';
    res.json({
      ok: true,
      path: `/api/browser-agent/screenshots/${tid}/step-${ts}.png?api_key=${apiKey}`,
      file: filePath,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/browser-agent/screenshots/:task/:file ──
// 读截图（前端 <img> 用；支持 ?api_key= 过认证，参照邮件附件 P93 模式）
router.get('/screenshots/:task/:file', (req, res) => {
  try {
    const { task, file } = req.params;
    const safeTask = String(task).replace(/[^a-zA-Z0-9_-]/g, '');
    const safeFile = String(file).replace(/[^a-zA-Z0-9._-]/g, '');
    const filePath = path.join(ba.SESSION_ROOT, safeTask, safeFile);
    if (!filePath.startsWith(ba.SESSION_ROOT) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: '截图不存在' });
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/browser-agent/mouse ──
// 用户手动操作（双向控制）：坐标 = 浏览器视口 CSS 像素
// body: { x, y, action: 'click'|'move'|'wheel', dy? }
router.post('/mouse', async (req, res) => {
  try {
    const { x, y, action, dy } = req.body || {};
    if (action === 'wheel') {
      const r = await ba.mouseWheel(dy || 0);
      return r.ok ? res.json({ ok: true }) : res.status(502).json({ error: r.error });
    }
    if (x == null || y == null) return res.status(400).json({ error: '缺少 x/y' });
    let r;
    if (action === 'move') r = await ba.mouseMove(x, y);
    else r = await ba.mouseClick(x, y); // 默认 click
    if (!r.ok) return res.status(502).json({ error: r.error });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/browser-agent/keyboard ──
// 用户手动输入（真实按键）
router.post('/keyboard', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (text == null) return res.status(400).json({ error: '缺少 text' });
    const r = await ba.keyboardType(String(text));
    if (!r.ok) return res.status(502).json({ error: r.error });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/browser-agent/status ──
router.get('/status', async (req, res) => {
  try {
    const info = await ba.pageInfo();
    let loggedIn = false;
    try { loggedIn = await ba.isDeepSeekLoggedIn(); } catch (e) {}
    const vp = await ba.getViewport();
    res.json({ ok: true, info, deepseekLoggedIn: loggedIn, viewport: vp.ok ? { width: vp.width, height: vp.height } : null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/browser-agent/close ──
router.post('/close', async (req, res) => {
  try {
    await ba.closeAll();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/browser-agent/deepseek/ask ──
// DeepSeek 网页版问答（ai-web-chat 语义接口）
// body: { prompt: string, webSearch?: boolean, taskId?: string }
router.post('/deepseek/ask', async (req, res) => {
  try {
    const { prompt, webSearch } = req.body || {};
    if (!prompt) return res.status(400).json({ error: '缺少 prompt' });
    const taskId = String(req.body?.taskId || 'deepseek-' + Date.now()).replace(/[^a-zA-Z0-9_-]/g, '');
    const result = await aiWebChat.deepSeekAsk(prompt, { webSearch: !!webSearch, taskId });
    if (!result.ok) return res.status(502).json({ error: result.error, step: result.step });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/browser-agent/stream-info ──
// agent-browser WebSocket 实时帧流（准实时画面，替代每步截图轮询）
// 返回 { enabled, port, wsUrl } —— 前端连 wsUrl 后发 {"type":"config","maxFps":N}
// 收帧格式：{"data":"<base64 JPEG>"}（控制消息 {"connected":..}/{"tabs":..} 忽略）
router.get('/stream-info', async (req, res) => {
  try {
    let port = null, enabled = false;
    const st = await ba.tryExec('stream status --json', 8000);
    if (st.ok) {
      try {
        const d = JSON.parse(st.output);
        port = d?.data?.port || null;
        enabled = !!d?.data?.enabled;
      } catch (e) {}
    }
    if (!enabled) {
      await ba.tryExec('stream enable --json', 8000);
      const st2 = await ba.tryExec('stream status --json', 8000);
      if (st2.ok) {
        try {
          const d = JSON.parse(st2.output);
          port = d?.data?.port || null;
          enabled = !!d?.data?.enabled;
        } catch (e) {}
      }
    }
    res.json({ ok: true, enabled, port, wsUrl: port ? `ws://127.0.0.1:${port}/?maxFps=5` : null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/browser-agent/cdp-info ──
// CDP 双向控制通道（Chrome DevTools Protocol）：
//   前端连 wsUrl → Target.attachToTarget(page) → Page.startScreencast（帧流）
//   → Input.dispatchMouseEvent/dispatchKeyEvent（真实控制，同一浏览器实例）
//   比 agent-browser stream（只看）强：精确点击/悬停/滚轮/中文输入
//
// 🆕 v0.7.1：兜底拉起 —— 拿不到 CDP URL 时主动 open about:blank 占位
//   原因：用户先开控制台再给目标时，daemon 可能未启 → get cdp-url 失败
//        → 前端静默降级 stream，看画面 OK 但点击不精准
//   修法：服务端主动 open 占位页确保前端永远能拿到 CDP URL
router.get('/cdp-info', async (req, res) => {
  try {
    let bootstrapped = false;
    let r = await ba.tryExec('get cdp-url', 8000);
    const wsOk = r.ok && String(r.output || '').trim().startsWith('ws://');
    if (!wsOk) {
      // daemon 未启或没 page → 主动拉起一个 about:blank 占位（保证前端拿到 CDP 精准控制）
      console.log('[browser-agent] /cdp-info 无 CDP URL，主动 bootstrap: open about:blank');
      const openR = await ba.tryExec('open "about:blank" --json', 30000);
      if (!openR.ok) {
        return res.status(502).json({
          error: '无法拉起浏览器 daemon: ' + openR.error,
          hint: '请确认 agent-browser CLI 已安装（npx agent-browser --version）',
        });
      }
      bootstrapped = true;
      // open 后等 daemon 稳定再重试（about:blank 加载很快，但 cdp-url 注册到 daemon 有延迟）
      await new Promise((r2) => setTimeout(r2, 800));
      r = await ba.tryExec('get cdp-url', 8000);
    }
    const wsUrl = String(r.output || '').trim();
    if (!wsUrl.startsWith('ws://')) {
      return res.status(502).json({
        error: '未拿到 CDP URL: ' + wsUrl.slice(0, 80),
        bootstrapped,
        hint: 'agent-browser daemon 已打开页面但未暴露 CDP 端点（可重启 daemon 试试）',
      });
    }
    res.json({ ok: true, wsUrl, bootstrapped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════
// 浏览器智能体：目标驱动任务（v0.2）
//   POST /api/browser-agent/task {goal} → 异步启动 → {taskId}
//   GET  /api/browser-agent/task/:taskId/stream → SSE（step / done 事件）
//   GET  /api/browser-agent/task/:taskId → 任务状态
// ═══════════════════════════════════════════
const taskRunner = require('../services/browser-agent/task-runner');
const SSE_CLIENTS = new Map(); // taskId -> Set<res>

function pushSSE(taskId, event, data) {
  const clients = SSE_CLIENTS.get(taskId);
  if (!clients || clients.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach((res) => { try { res.write(payload); } catch (e) {} });
}

function closeSSE(taskId) {
  const clients = SSE_CLIENTS.get(taskId);
  if (!clients) return;
  clients.forEach((res) => { try { res.end(); } catch (e) {} });
  SSE_CLIENTS.delete(taskId);
}

router.post('/task', (req, res) => {
  try {
    const { goal, maxRounds } = req.body || {};
    if (!goal || !String(goal).trim()) return res.status(400).json({ error: '缺少目标 goal' });
    const taskId = 'bt-' + Date.now().toString(36);
    // 异步启动（不 await 完成，前端通过 SSE 订阅进度）
    taskRunner.runGoalTask(String(goal).trim(), {
      taskId,
      maxRounds: parseInt(maxRounds, 10) || 15,
      onStep: (step) => pushSSE(taskId, 'step', step),
      onWaiting: (info) => pushSSE(taskId, 'waiting_user', info),
      onDone: (result) => {
        pushSSE(taskId, 'done', result);
        setTimeout(() => closeSSE(taskId), 1500);
      },
    });
    res.json({ ok: true, taskId, note: 'GET /api/browser-agent/task/' + taskId + '/stream 订阅进度（SSE）' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/browser-agent/task/:taskId/reply — 用户回复求助，任务继续
router.post('/task/:taskId/reply', async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message || !String(message).trim()) return res.status(400).json({ error: '缺少回复内容' });
    const taskId = req.params.taskId;
    const result = await taskRunner.resumeGoalTask(taskId, String(message).trim());
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/task/:taskId/stream', (req, res) => {
  const taskId = req.params.taskId;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('retry: 3000\n\n');

  const task = taskRunner.getTask(taskId);
  if (!task) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: '任务不存在' })}\n\n`);
    res.end();
    return;
  }
  // 补发已产生的步骤
  if (task.steps && task.steps.length) {
    task.steps.forEach((s) => {
      res.write(`event: step\ndata: ${JSON.stringify(s)}\n\n`);
    });
  }
  // 已完成 → 立即推 done
  if (task.status !== 'running') {
    res.write(`event: done\ndata: ${JSON.stringify({ taskId, status: task.status, content: task.content, error: task.error, steps: task.steps })}\n\n`);
    res.end();
    return;
  }
  if (!SSE_CLIENTS.has(taskId)) SSE_CLIENTS.set(taskId, new Set());
  SSE_CLIENTS.get(taskId).add(res);
  req.on('close', () => { SSE_CLIENTS.get(taskId)?.delete(res); });
});

router.get('/task/:taskId', (req, res) => {
  const task = taskRunner.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  res.json({ ok: true, ...task });
});

module.exports = router;
