// ACMS social-publisher REST API（v0.118 PR 3）
// 路径：server/routes/social-publisher.js
//
// 设计参考：
//   - server/routes/email-accounts.js（多账号 CRUD + AES 解密 + 错误处理模板）
//   - server/routes/geo.js（健康检查 + 静态路由 + :id 路由顺序）
//   - P105：参数化路由（:id）必须注册在静态路由之后
//   - P106：approve|reject|edit 决策统一通过 approval.js
//
// 端点清单：
//   账号管理：
//     GET    /api/social-publisher/accounts
//     POST   /api/social-publisher/accounts
//     GET    /api/social-publisher/accounts/:id
//     DELETE /api/social-publisher/accounts/:id
//     POST   /api/social-publisher/accounts/:id/check
//   内容运营：
//     POST   /api/social-publisher/rewrite
//     POST   /api/social-publisher/publish
//     POST   /api/social-publisher/schedule
//   状态查询：
//     GET    /api/social-publisher/queue
//     POST   /api/social-publisher/queue/clear-done
//     GET    /api/social-publisher/schedule
//     GET    /api/social-publisher/history
//     GET    /api/social-publisher/screenshots
//     GET    /api/social-publisher/drawer-stats
//   审批：
//     GET    /api/social-publisher/approval
//     POST   /api/social-publisher/approval/:id/:decision  (approve|reject)
//     GET    /api/social-publisher/stream  (SSE 审批推送)
//   工具：
//     GET    /api/social-publisher/health
//   静态：
//     GET    /api/social-publisher/screenshots/:task/:file  (截图访问)

'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const sp = require('../services/social-publisher');
const goPublisher = require('../services/social-publisher/go-publisher');  // v0.118.x: goal-driven 模式
const accountStore = sp;
const approval = sp.approval;
// v0.118.1：调 agent-browser auth 系列（账号密码存到 agent-browser 全局 auth，不在 social_accounts 里）
const browserAgent = require('../services/browser-agent');

// 截图存储目录
const SCREENSHOTS_DIR = path.resolve(__dirname, '../../data/social-publisher-screenshots');
try { fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true }); } catch (_) {}

function err(res, code, msg, status) {
  return res.status(status || 400).json({ ok: false, error: code, message: msg });
}

// 内存队列（PR 3 简版：进程内存，PR 4 接 Kanban）
const QUEUE = [];
const HISTORY = [];
const SCHEDULED = [];

function enqueue(task) {
  QUEUE.push({ ...task, status: 'queued', created_at: new Date().toISOString() });
  return QUEUE.length;
}

function recordHistory(item) {
  HISTORY.unshift({ ...item, created_at: item.created_at || new Date().toISOString() });
  if (HISTORY.length > 500) HISTORY.length = 500;  // 内存上限
}

// ============================================
// Kanban 集成（PR 4）
// ============================================

// 列出 social-* 任务
router.get('/kanban/tasks', (req, res) => {
  try {
    const { projectId, platform, type } = req.query;
    const tasks = sp.kanban.listSocialTasks({ projectId, platform, type });
    res.json({ ok: true, tasks, count: tasks.length, types: sp.kanban.getSocialTaskTypes() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 创建发布任务（social-publish / social-publish-all / social-rewrite）
router.post('/kanban/tasks', (req, res) => {
  try {
    const task = sp.kanban.createPublishTask(req.body || {});
    res.json({ ok: true, task });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// 拉取任务（claim → 触发 sp-task-executor）
const taskStore = require('../stores/task-store');
const eventBus = require('../services/event-bus');
router.post('/kanban/tasks/:id/claim', (req, res) => {
  try {
    const { agentId = 'sp-scheduler' } = req.body || {};
    const r = taskStore.claim(req.params.id, agentId);
    if (r.error) return err(res, r.error, r.error, 400);
    const task = taskStore.getById(req.params.id);
    // v0.118.1 修复：必须 emit task.claimed 事件，否则 sp-task-executor 永远监听不到 → 任务卡 in_progress
    // （之前只调 taskStore.claim() 改状态，sp-task-executor 监听 eventBus('task.claimed') 等不到事件，详见 task-execution-not-starting 诊断）
    eventBus.emit('task.claimed', {
      projectId: task.project_id,
      actor: { id: agentId, type: 'agent' },
      target: { type: 'task', id: task.id },
      payload: { task },
    }).catch(e => console.error('[sp-claim] emit error:', e.message));
    res.json({ ok: true, task });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 拉取任务详情（含 publish params）
router.get('/kanban/tasks/:id', (req, res) => {
  try {
    const t = taskStore.getById(req.params.id);
    if (!t) return err(res, 'TASK_NOT_FOUND', 'task 不存在', 404);
    const params = sp.kanban.getPublishParams(req.params.id);
    res.json({ ok: true, task: t, params });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================
// 排期（PR 4：简单定时器，到点自动 claim）
// ============================================
const SCHEDULED_TASKS = new Map();  // taskId → setTimeout handle

router.post('/kanban/schedule', (req, res) => {
  try {
    const { schedule_at, ...taskParams } = req.body || {};
    if (!schedule_at) return err(res, 'MISSING_SCHEDULE_AT', 'schedule_at 必填');
    const when = new Date(schedule_at).getTime();
    const now = Date.now();
    if (when <= now) return err(res, 'PAST_SCHEDULE', 'schedule_at 必须在未来');

    // 1) 建任务（先入 backlog，状态=backlog）
    const task = sp.kanban.createPublishTask({ ...taskParams, schedule_at });
    // 2) 安排定时器
    const delay = when - now;
    const handle = setTimeout(() => {
      SCHEDULED_TASKS.delete(task.id);
      // 自动 claim
      const r = taskStore.claim(task.id, 'sp-scheduler');
      if (r.error) {
        console.warn(`[sp-scheduler] claim ${task.id} failed: ${r.error}`);
      } else {
        console.log(`[sp-scheduler] 🤖 Auto-claimed scheduled task: ${task.id}`);
      }
    }, delay);
    SCHEDULED_TASKS.set(task.id, handle);

    res.json({
      ok: true,
      task,
      delay_ms: delay,
      fire_at: new Date(when).toISOString(),
      scheduled_count: SCHEDULED_TASKS.size,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 取消排期
router.post('/kanban/schedule/:id/cancel', (req, res) => {
  const handle = SCHEDULED_TASKS.get(req.params.id);
  if (!handle) return err(res, 'NOT_SCHEDULED', '该任务未排期或已触发', 404);
  clearTimeout(handle);
  SCHEDULED_TASKS.delete(req.params.id);
  res.json({ ok: true });
});

// 列出排期
router.get('/kanban/schedule', (req, res) => {
  res.json({
    ok: true,
    items: Array.from(SCHEDULED_TASKS.keys()),
    count: SCHEDULED_TASKS.size,
  });
});

// ============================================
// 健康检查（必须放最前）
// ============================================
router.get('/health', (req, res) => {
  try {
    res.json({
      ok: true,
      version: '0.118',
      pr: 4,
      platforms: ['toutiao', 'xiaohongshu', 'wechat_oa', 'zhihu', 'douyin'],
      platform_limits: sp.PLATFORM_LIMITS,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================
// 账号管理
// ============================================
router.get('/accounts', (req, res) => {
  try {
    const { platform, status } = req.query;
    const accounts = accountStore.list({ platform, status });
    // 附加 health 字段给前端
    const enriched = accounts.map(a => ({
      ...a,
      health: accountStore.checkHealth({ account_id: a.id, platform: a.platform }).ok ? 'ok' : 'err',
    }));
    res.json({ ok: true, accounts: enriched, count: enriched.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// v0.118.1: 端点清单更新：
//   POST /accounts                 — 调 agent-browser auth save 存凭据（不存密码到 social_accounts）
//   POST /accounts/:id/login       — 调 agent-browser auth login（打开登录页 + 自动填账号密码 + 等跳转）
//   GET  /accounts/auth-profiles   — 列出 agent-browser 已保存的 profile
//   POST /accounts/:id/bind-auth   — 把现有账号绑定到已存在的 agent-browser profile

router.post('/accounts', async (req, res) => {
  try {
    const { platform, display_name, credential, credentials, avatar, limits } = req.body || {};
    if (!platform || !display_name) return err(res, 'MISSING_FIELDS', 'platform 和 display_name 必填');

    // v0.118.1: 新流程 — 用户填 username + password（不是 cookie）
    //   1. 先调 agent-browser auth save 存到全局 auth（profile 名 = social-publisher account id）
    //      注意：必须先 create 拿到 id，再 auth save（profile name 用 id 保证全局唯一）
    //   2. accountStore 只存 username（密码不落库，全在 agent-browser 里）
    const cred = credential || credentials || {};
    if (cred.type !== 'agent_browser') {
      return err(res, 'UNSUPPORTED_CREDENTIAL_TYPE',
        `v0.118.1 仅支持 type=agent_browser（username+password → agent-browser auth save）。cookie/cookiecloud 模式已废弃。`, 400);
    }
    if (!cred.username || cred.password === undefined || cred.password === null) {
      return err(res, 'MISSING_USERNAME_PASSWORD', 'username 和 password 必填');
    }

    // 第一步：先创建 social-publisher 账号（拿到 id 作为 auth profile name）
    const tmpCredentials = {
      type: 'agent_browser',
      username: cred.username,
      auth_profile: '__pending__',  // 占位，第二步 auth save 成功后覆盖
      meta: { url: accountStore.PLATFORM_LIMITS[platform]?.login_url || '' },
    };
    const result = accountStore.create({ platform, display_name, credentials: tmpCredentials, avatar, limits });
    if (!result.ok) return err(res, 'CREATE_FAILED', result.error, 400);

    // 第二步：调 agent-browser auth save 把账号密码存到全局 auth 系统
    const loginUrl = accountStore.PLATFORM_LIMITS[platform]?.login_url;
    if (!loginUrl) {
      // 兜底：删掉刚建的账号（避免脏数据）
      accountStore.remove(result.account.id);
      return err(res, 'NO_LOGIN_URL', `平台 ${platform} 没有 login_url`, 400);
    }
    const authR = await browserAgent.authSave({
      name: result.account.id,  // 用 social-publisher account id 作为 auth profile name（全局唯一）
      url: loginUrl,
      username: cred.username,
      password: cred.password,
    });
    if (!authR.ok) {
      // 兜底：删掉刚建的账号
      accountStore.remove(result.account.id);
      return err(res, 'AUTH_SAVE_FAILED', authR.error || 'auth save 失败', 500);
    }

    // 第三步：更新账号的 auth_profile 字段（标记已绑定）
    accountStore.update(result.account.id, { credentials: { type: 'agent_browser', username: cred.username, auth_profile: result.account.id, meta: { url: loginUrl } } });

    const finalAccount = accountStore.get(result.account.id);
    res.json({ ok: true, account: finalAccount });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/accounts/auth-profiles', async (req, res) => {
  try {
    const r = await browserAgent.authList();
    if (!r.ok) return res.json({ ok: true, profiles: [] });  // 兜底：list 失败不阻塞前端
    res.json({ ok: true, profiles: r.profiles || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// v0.118.1: 立即登录 — 调 agent-browser auth login + 等跳转
//   返回 { ok: true, status: 'logged_in' | 'need_user', hint }
//   ok=true 但 status=need_user：auth login 超时（可能要验证码）→ 用户去 Web 机器人手动完成
router.post('/accounts/:id/login', async (req, res) => {
  try {
    const a = accountStore.get(req.params.id);
    if (!a) return err(res, 'ACCOUNT_NOT_FOUND', 'account 不存在', 404);
    if (!a.credentials || a.credentials.type !== 'agent_browser' || !a.credentials.auth_profile) {
      return err(res, 'NOT_AGENT_BROWSER_ACCOUNT', '该账号不是 agent_browser 类型，无法登录', 400);
    }
    const r = await browserAgent.authLogin({ name: a.credentials.auth_profile, timeout: 30000 });
    // 更新最后登录时间
    if (r.ok) {
      accountStore.update(req.params.id, { last_used_at: new Date().toISOString() });
    }
    res.json({
      ok: r.ok,
      status: r.ok ? 'logged_in' : 'need_user',
      hint: r.ok ? '登录成功，可发布' : '需要验证码？去 Web 机器人完成（auth save 已自动填账号密码）',
      detail: r.output,
      error: r.error,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/accounts/:id', (req, res) => {
  try {
    const a = accountStore.get(req.params.id);
    if (!a) return err(res, 'ACCOUNT_NOT_FOUND', 'account 不存在', 404);
    res.json({ ok: true, account: a });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.delete('/accounts/:id', async (req, res) => {
  try {
    const a = accountStore.get(req.params.id);
    if (!a) return err(res, 'ACCOUNT_NOT_FOUND', 'account 不存在', 404);
    // v0.118.1: 同步删 agent-browser auth profile（如果存在）
    if (a.credentials && a.credentials.type === 'agent_browser' && a.credentials.auth_profile) {
      try { await browserAgent.authDelete({ name: a.credentials.auth_profile }); } catch (_) {}
    }
    const r = accountStore.remove(req.params.id);
    if (!r.ok) return err(res, 'DELETE_FAILED', r.error, 400);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/accounts/:id/check', (req, res) => {
  try {
    const a = accountStore.get(req.params.id);
    if (!a) return err(res, 'ACCOUNT_NOT_FOUND', 'account 不存在', 404);
    const h = accountStore.checkHealth({ account_id: req.params.id, platform: a.platform });
    res.json({ ok: true, ...h });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================
// 内容运营
// ============================================
router.post('/rewrite', async (req, res) => {
  try {
    const { content, platform, tone, length } = req.body || {};
    if (!content) return err(res, 'MISSING_CONTENT', 'content 必填');
    const r = await sp.rewriteForPlatform({ content, platform: platform || 'toutiao', tone, length });
    if (!r.ok) return err(res, 'REWRITE_FAILED', r.error, 500);
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/publish', async (req, res) => {
  try {
    const { title, content, images, tags, account_id, platforms, options } = req.body || {};
    if (!title || !content) return err(res, 'MISSING_FIELDS', 'title 和 content 必填');
    if (!account_id) return err(res, 'MISSING_ACCOUNT', 'account_id 必填');

    // 单平台走 provider.publish；多平台排队
    const platformList = platforms || ['toutiao'];
    const taskId = `pub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    if (platformList.length === 1) {
      // 单平台直接发布
      const result = await sp.publishTo(platformList[0], {
        title, content, images, tags, account_id,
        options: { ...(options || {}), require_approval: options?.require_approval !== false },
      });
      recordHistory({
        task_id: taskId,
        platform: platformList[0],
        title,
        ok: result.ok,
        post_url: result.post_url,
        total_elapsed_ms: result.total_elapsed_ms,
        error: result.error,
        steps: result.steps,
      });
      return res.json({ ok: true, task_id: taskId, platform: platformList[0], result });
    }

    // 多平台：入队
    for (const p of platformList) {
      enqueue({
        task_id: `${taskId}-${p}`,
        platform: p,
        title,
        content,
        images,
        tags,
        account_id,
        options: { ...(options || {}), require_approval: options?.require_approval !== false },
      });
    }
    res.json({ ok: true, task_id: taskId, queued: platformList.length, queue_size: QUEUE.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/schedule', (req, res) => {
  try {
    const { title, content, images, tags, account_id, platforms, schedule_at } = req.body || {};
    if (!schedule_at) return err(res, 'MISSING_SCHEDULE_AT', 'schedule_at 必填');
    const item = {
      id: `sch-${Date.now().toString(36)}`,
      title, content, images, tags, account_id, platforms,
      schedule_at,
      status: 'scheduled',
      created_at: new Date().toISOString(),
    };
    SCHEDULED.push(item);
    res.json({ ok: true, item, count: SCHEDULED.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================
// 状态查询
// ============================================
router.get('/queue', (req, res) => {
  res.json({ ok: true, items: QUEUE, count: QUEUE.length });
});

router.post('/queue/clear-done', (req, res) => {
  const before = QUEUE.length;
  for (let i = QUEUE.length - 1; i >= 0; i--) {
    if (QUEUE[i].status === 'done' || QUEUE[i].status === 'failed') QUEUE.splice(i, 1);
  }
  res.json({ ok: true, cleared: before - QUEUE.length });
});

router.get('/schedule', (req, res) => {
  res.json({ ok: true, items: SCHEDULED, count: SCHEDULED.length });
});

router.get('/history', (req, res) => {
  const { platform } = req.query;
  let items = HISTORY;
  if (platform && platform !== 'all') items = items.filter(h => h.platform === platform);
  res.json({ ok: true, items, count: items.length });
});

router.get('/screenshots', (req, res) => {
  try {
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      return res.json({ ok: true, items: [] });
    }
    const items = [];
    for (const task of fs.readdirSync(SCREENSHOTS_DIR)) {
      const taskDir = path.join(SCREENSHOTS_DIR, task);
      if (!fs.statSync(taskDir).isDirectory()) continue;
      for (const file of fs.readdirSync(taskDir)) {
        items.push({
          task_id: task,
          filename: file,
          url: `/api/social-publisher/screenshots/${task}/${file}`,
          platform: task.split('-')[0],
          step: file.replace(/\.png$/, ''),
          created_at: fs.statSync(path.join(taskDir, file)).mtime.toISOString(),
        });
      }
    }
    items.sort((a, b) => b.created_at.localeCompare(a.created_at));
    res.json({ ok: true, items: items.slice(0, 100), count: items.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/drawer-stats', (req, res) => {
  const { platform } = req.query;
  const today = new Date().toISOString().slice(0, 10);
  let todayCount = 0;
  for (const a of accountStore.list({ platform: platform !== 'all' ? platform : undefined })) {
    if (a.last_used_at && a.last_used_at.startsWith(today)) todayCount += a.daily_publish_count || 0;
  }
  const limits = {};
  for (const [p, l] of Object.entries(sp.PLATFORM_LIMITS)) {
    if (platform !== 'all' && p !== platform) continue;
    const used = accountStore.list({ platform: p }).reduce((sum, a) => {
      return sum + (a.last_used_at && a.last_used_at.startsWith(today) ? (a.daily_publish_count || 0) : 0);
    }, 0);
    limits[p] = { used, max: l.max_per_day };
  }
  const recent = HISTORY.slice(0, 5).map(h => ({
    title: h.title,
    platform: h.platform,
    created_at: h.created_at,
  }));
  res.json({ ok: true, today_count: todayCount, limits, recent });
});

// ============================================
// 审批
// ============================================
router.get('/approval', (req, res) => {
  res.json({ ok: true, items: approval.listPending(), count: approval.listPending().length });
});

router.post('/approval/:id/:decision', (req, res) => {
  const { id, decision } = req.params;
  if (!['approve', 'reject', 'edit', 'cancel'].includes(decision)) {
    return err(res, 'INVALID_DECISION', `decision 必须是 approve/reject/edit/cancel`, 400);
  }
  const r = approval.respond(id, {
    decision,
    edited: req.body?.edited || null,
  });
  if (!r.ok) return err(res, 'RESPOND_FAILED', r.error, 400);
  res.json({ ok: true, ...r });
});

// SSE 审批事件流
router.get('/stream', (req, res) => {
  approval.subscribe(res);
});

// ============================================
// 静态：截图访问
// ============================================
router.get('/screenshots/:task/:file', (req, res) => {
  const { task, file } = req.params;
  if (task.includes('..') || file.includes('..') || file.includes('/')) {
    return res.status(400).send('invalid_path');
  }
  const filepath = path.join(SCREENSHOTS_DIR, task, file);
  if (!fs.existsSync(filepath)) return res.status(404).send('not_found');
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(filepath).pipe(res);
});

// 删除单张截图（多多要求：截图回看记录允许删除）
router.delete('/screenshots/:task/:file', (req, res) => {
  try {
    const { task, file } = req.params;
    // 防御 path traversal（与 GET 静态路由 line 551 一致）
    if (task.includes('..') || task.includes('/') || task.includes('\\') ||
        file.includes('..') || file.includes('/') || file.includes('\\')) {
      return err(res, 'INVALID_PATH', 'invalid path', 400);
    }
    const filepath = path.join(SCREENSHOTS_DIR, task, file);
    if (!fs.existsSync(filepath)) return err(res, 'NOT_FOUND', '截图不存在', 404);
    fs.unlinkSync(filepath);
    // 顺手把空 task 目录清掉（避免越积越多空目录）
    const taskDir = path.join(SCREENSHOTS_DIR, task);
    if (fs.existsSync(taskDir) && fs.readdirSync(taskDir).length === 0) {
      try { fs.rmdirSync(taskDir); } catch (_) { /* 忽略 */ }
    }
    res.json({ ok: true, deleted: { task, file } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 整批删除某 task 的所有截图（清理失败任务留下的整批证据）
router.delete('/screenshots/by-task/:task', (req, res) => {
  try {
    const { task } = req.params;
    if (task.includes('..') || task.includes('/') || task.includes('\\')) {
      return err(res, 'INVALID_PATH', 'invalid path', 400);
    }
    const taskDir = path.join(SCREENSHOTS_DIR, task);
    if (!fs.existsSync(taskDir)) return err(res, 'NOT_FOUND', '任务截图目录不存在', 404);
    let count = 0;
    for (const f of fs.readdirSync(taskDir)) {
      try { fs.unlinkSync(path.join(taskDir, f)); count++; } catch (_) {}
    }
    try { fs.rmdirSync(taskDir); } catch (_) {}
    res.json({ ok: true, deleted: { task, count } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================
// PR 5: 监控 + 持久化查询
// ============================================

// 监控 stats
router.get('/monitor/stats', (req, res) => {
  try {
    res.json({ ok: true, ...sp.monitor.getStats() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 最近告警
router.get('/monitor/alerts', (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10);
  res.json({ ok: true, alerts: sp.monitor.getRecentAlerts(limit), count: sp.monitor.getRecentAlerts(limit).length });
});

// 立即跑一次健康检查
router.post('/monitor/run-check', (req, res) => {
  sp.monitor.runHealthCheck();
  res.json({ ok: true, stats: sp.monitor.getStats() });
});

// 审批历史（持久化版）
router.get('/approval-history', (req, res) => {
  const { platform, account_id, decision, limit } = req.query;
  const items = sp.persistence.listApprovalHistory({
    platform, account_id, decision,
    limit: limit ? parseInt(limit, 10) : 100,
  });
  res.json({ ok: true, items, count: items.length });
});

// 发布历史（持久化版）
router.get('/task-history', (req, res) => {
  const { platform, account_id, ok, limit } = req.query;
  const items = sp.persistence.listTaskHistory({
    platform, account_id, ok,
    limit: limit ? parseInt(limit, 10) : 200,
  });
  res.json({ ok: true, items, count: items.length });
});

// 单条历史详情
router.get('/task-history/:id', (req, res) => {
  const item = sp.persistence.getTaskHistory(req.params.id);
  if (!item) return err(res, 'NOT_FOUND', '历史不存在', 404);
  res.json({ ok: true, item });
});

// 重置账号风控（PM 工具）
router.post('/accounts/:id/reset-risk', (req, res) => {
  const a = accountStore.get(req.params.id);
  if (!a) return err(res, 'ACCOUNT_NOT_FOUND', 'account 不存在', 404);
  const r = accountStore.resetRiskLevel(req.params.id);
  res.json({ ok: r.ok, account_id: req.params.id });
});

// 选最佳账号（多账号轮换）
router.post('/accounts/select-best', (req, res) => {
  const { platform, exclude } = req.body || {};
  const r = accountStore.selectBestAccount({ platform, exclude: exclude || [] });
  if (!r) return res.json({ ok: false, error: 'no_active_account' });
  res.json({ ok: true, ...r });
});

module.exports = router;

// ─────────────────────────────────────────────────────────
// v0.118.x: Web 机器人 goal-driven 模式（不再 hard-code 选择器，让 LLM 看 DOM 自己操作）
//   之前 /publish 走 sp.publishTo → provider.publish，5 个平台 × 几百行脆弱选择器代码
//   现在 /go-publish 调 runGoalTask(goal)，LLM 看 goal 自己操作 + request_user_help 兜底
// ─────────────────────────────────────────────────────────

// POST /api/social-publisher/go-publish — 创建发布任务（异步）
router.post('/go-publish', async (req, res) => {
  try {
    const { title, content, platform, account_id, tags, images } = req.body || {};
    if (!title || !content) return err(res, 'MISSING_FIELDS', 'title 和 content 必填');
    if (!platform) return err(res, 'MISSING_PLATFORM', 'platform 必填');
    if (!account_id) return err(res, 'MISSING_ACCOUNT', 'account_id 必填');

    const account = accountStore.get(account_id);
    if (!account) return err(res, 'ACCOUNT_NOT_FOUND', `账号 ${account_id} 不存在`, 404);
    if (account.platform !== platform) {
      return err(res, 'PLATFORM_MISMATCH', `账号是 ${account.platform} 不是 ${platform}`, 400);
    }

    const result = await goPublisher.goPublish(account, {
      title,
      content,
      tags: tags || [],
      images: images || [],
      platform,
    });
    // v0.118.12: 执行/SSE/reply 全部收敛到 browser-agent session 通道
    //   订阅: GET  /api/browser-agent/session/<task_id>/stream（step/waiting_user/done）
    //   回复: POST /api/browser-agent/session/<task_id>/reply  { message }
    //   查询: GET  /api/browser-agent/session/<task_id>
    res.json({
      ok: true,
      task_id: result.taskId,
      status: result.status,
      stream: '/api/browser-agent/session/' + result.taskId + '/stream',
    });
  } catch (e) {
    console.error('[go-publish] error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── v0.118.x: 平台经验库管理 ──
//   GET    /platform-memory           — 列出所有平台的 memory 状态
//   GET    /platform-memory/:platform — 看某个平台的详细经验
//   DELETE /platform-memory/:platform — 清空某个平台的 memory（调试用）
router.get('/platform-memory', (req, res) => {
  res.json({ ok: true, list: require('../services/social-publisher/platform-memory').listAll() });
});
router.get('/platform-memory/:platform', (req, res) => {
  const memory = require('../services/social-publisher/platform-memory');
  res.json({ ok: true, memory: memory.read(req.params.platform) });
});
router.delete('/platform-memory/:platform', (req, res) => {
  const memory = require('../services/social-publisher/platform-memory');
  res.json(memory.clear(req.params.platform));
});