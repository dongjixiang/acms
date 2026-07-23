// ACMS appRuntime — 把外部网页装进「本地应用壳」
// 共享 Puppeteer browser，BrowserContext 隔离每个会话（独立 cookie / 登录态）
// 阶段：P1 单服务 + P2 接 CDP screencast（由 routes/app-runtime.js 调用）
//
// 用法：
//   const session = await appRuntime.openSession({ url: 'https://wx.qq.com', w: 1024, h: 700 });
//   // → { sessionId, url, w, h }
//   appRuntime.attach(sessionId, ws);  // 绑定前端 WebSocket
//   await appRuntime.closeSession(sessionId);
//
// 设计要点：
//   - 共享单 browser，所有 session 复用（节省资源）
//   - 每个 session 一个独立 BrowserContext（隔离 cookie、登录态、缓存）
//   - input() 是无状态 RPC（来自前端 WS 消息）
//   - 服务端只挂页（CDP screencast 推送见 routes/app-runtime.js）
//   - 进程退出时统一 cleanup，避免僵尸 Chromium 进程

const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');
const { EventEmitter } = require('events');
const path = require('path');
const os = require('os');
const fs = require('fs');
// ws-hub 在 P2 引入；这里留空依赖兼容（s.ws 是 P2 才用的字段）

// v0.59：Session 闲置超时（无 input 的分钟数后自动关闭，回收 BrowserContext）
// 可被环境变量 APP_RUNTIME_IDLE_MS 覆盖（验证用 — 设短值走完 30min 流程不需要）
const IDLE_TIMEOUT_MS = Number(process.env.APP_RUNTIME_IDLE_MS) || 30 * 60 * 1000; // 30 分钟
const IDLE_CHECK_INTERVAL_MS = 60 * 1000; // 1 分钟扫一次

// 模块顶层固定引用 — 给 setTimeout 回调访问 service 实例
// （module.exports 还没赋值时已经能拿到）
var service;

function mouseButton(button) {
  if (button === 1 || button === 'middle') return 'middle';
  if (button === 2 || button === 'right') return 'right';
  return 'left';
}

class AppRuntimeService extends EventEmitter {
  constructor() {
    super();
    this.browser = null;
    this.launching = null;
    this.sessions = new Map(); // sessionId -> { sessionId, ctx, page, cdp, ws, ... }
    this.nativeShells = new Map(); // appId -> { browser, page, url, pid, userDataDir }
  }

  // ── 浏览器管理 ──
  async ensureBrowser() {
    if (this.browser && typeof this.browser.isConnected === 'function') {
      try { if (this.browser.isConnected()) return this.browser; } catch { this.browser = null; }
    }
    if (this.launching) return this.launching;

    // 启动时打印当前 idle 配置（诊断用 — 多多能反推 APP_RUNTIME_IDLE_MS env 是否生效）
    console.log(`[app-runtime] 配置：IDLE_TIMEOUT_MS=${IDLE_TIMEOUT_MS} (${IDLE_TIMEOUT_MS >= 60000 ? (IDLE_TIMEOUT_MS / 60000).toFixed(1) + ' min' : (IDLE_TIMEOUT_MS / 1000).toFixed(1) + ' sec'}，可被 APP_RUNTIME_IDLE_MS env 覆盖)`);

    this.launching = (async () => {
      // 复用 browser-fetch.js 已经验证好的启动参数
      // 自动探测 chrome.exe / chrome-headless-shell（缺失时 fallback）
      const launchOpts = {
        headless: true,
        args: [
          '--no-sandbox', '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', '--disable-gpu',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-sync',
          '--enable-features=NetworkService',
          '--disable-features=Translate,BackForwardCache',
        ],
        timeout: 30000,
        // defaultViewport 留空，由每个 page 自己 setViewport（保证分流同步尺寸）
      };

      let exePath;
      try {
        exePath = await puppeteer.executablePath();
        try { require('fs').accessSync(exePath); } catch { exePath = null; }
      } catch { exePath = null; }

      if (!exePath) {
        // chrome-headless-shell fallback（与 browser-fetch.js 保持一致路径）
        const baseDir = require('path').join(require('os').homedir(),
          '.cache', 'puppeteer', 'chrome-headless-shell');
        try {
          const { readdirSync } = require('fs');
          const verDir = readdirSync(baseDir, { withFileTypes: true })
            .find(d => d.isDirectory() && d.name.startsWith('win64-'));
          if (verDir) {
            exePath = require('path').join(baseDir, verDir.name,
              'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
          }
        } catch {}
      }

      if (exePath) {
        launchOpts.executablePath = exePath;
        console.log(`[app-runtime] Chrome: ${exePath}`);
      } else {
        console.warn('[app-runtime] 未找到 Chrome 可执行文件，使用默认路径');
      }

      this.browser = await puppeteer.launch(launchOpts);
      console.log('[app-runtime] Browser 启动成功');
      return this.browser;
    })();

    try { return await this.launching; }
    finally { this.launching = null; }
  }

  // ── Native shell：真 Chromium app 窗口（微信默认模式）──
  async openNativeShell({ appId = 'external-app', url, w = 1180, h = 760 } = {}) {
    if (!url) throw new Error('NO_URL');
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
    appId = String(appId).replace(/[^a-z0-9_-]/gi, '-').slice(0, 64) || 'external-app';

    const existing = this.nativeShells.get(appId);
    if (existing && existing.browser?.isConnected()) {
      try { await existing.page.bringToFront(); } catch {}
      return { appId, url: existing.url, pid: existing.pid, reused: true, mode: 'native-shell' };
    }
    this.nativeShells.delete(appId);

    const userDataDir = path.join(os.homedir(), '.acms', 'app-runtime', appId);
    fs.mkdirSync(userDataDir, { recursive: true });
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      userDataDir,
      args: [
        `--app=${url}`,
        `--window-size=${Math.max(640, Number(w) || 1180)},${Math.max(480, Number(h) || 760)}`,
        '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      ],
      timeout: 30000,
    });
    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();
    const pid = browser.process()?.pid || null;
    const shell = { appId, browser, page, url, pid, userDataDir, createdAt: Date.now() };
    this.nativeShells.set(appId, shell);
    browser.on('disconnected', () => this.nativeShells.delete(appId));
    console.log(`[app-runtime] native-shell ${appId} | ${url} | pid=${pid || 'unknown'}`);
    return { appId, url, pid, reused: false, mode: 'native-shell' };
  }

  async closeNativeShell(appId) {
    const shell = this.nativeShells.get(appId);
    if (!shell) return false;
    this.nativeShells.delete(appId);
    try { await shell.browser.close(); } catch {}
    return true;
  }

  listNativeShells() {
    return [...this.nativeShells.values()].map(s => ({
      appId: s.appId, url: s.url, pid: s.pid, createdAt: s.createdAt,
    }));
  }

  // ── 会话管理 ──
  async openSession({ url, w = 1024, h = 700, headless = true } = {}) {
    if (!url) throw new Error('NO_URL');
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;

    const browser = await this.ensureBrowser();

    // 独立 cookie context（隔离登录态）— 关闭时自动清理
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: w, height: h });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    );

    const sessionId = uuidv4();
    const session = {
      sessionId,
      url,
      w, h,
      ctx, page,
      cdp: null,              // CDP session（延迟到 P2 初始化 screencast 时建）
      screencastOn: false,    // screencast 是否在跑（pause/resume 切换）
      wss: null,              // Set<WebSocket>（P2-2 多客户端同步）
      createdAt: Date.now(),
      lastFrameAt: 0,
      lastActivityAt: Date.now(),   // v0.59 P2-4：闲置检测基准
      _idleTimer: null,
      // 输入按顺序串行执行，避免页面导航/重绘时多个 CDP Input.dispatchMouseEvent 并发互相阻塞。
      _inputQueue: Promise.resolve(),
      _pendingMove: null,
      _lastMoveTs: 0,
      _closed: false,
    };

    // 异常兜底：page 崩溃 / 关闭 → 自动 closeSession
    page.on('crash', () => { console.warn(`[app-runtime] session ${sessionId} 页面崩溃`); this._safeClose(sessionId); });
    page.on('close', () => { this._safeClose(sessionId); });

    this.sessions.set(sessionId, session);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      // 导航失败不立刻关闭（用户可能自己写正确的 URL）
      console.warn(`[app-runtime] session ${sessionId} 初次导航超时/失败: ${e.message.slice(0, 100)}`);
    }

    console.log(`[app-runtime] 打开 session ${sessionId.slice(0, 8)} | ${url} | viewport=${w}x${h} | 当前 sessions=${this.sessions.size}`);
    // v0.59 P2-4：启动闲置检测
    this._armIdleTimer(session);
    return { sessionId, url, w, h };
  }

  // ── 闲置 timer（P2-4）──
  _armIdleTimer(s) {
    if (s._idleTimer) clearTimeout(s._idleTimer);
    s._idleTimer = setTimeout(() => {
      // 30 分钟（或 env APP_RUNTIME_IDLE_MS 覆盖值）无 input → 自动关掉
      console.log(`[app-runtime] session ${s.sessionId.slice(0, 8)} 闲置超过 ${(IDLE_TIMEOUT_MS / 1000).toFixed(1)} 秒，自动关闭`);
      service._broadcast(s, { type: 'idle-closed', reason: 'idle-timeout', idleMs: IDLE_TIMEOUT_MS });
      service.closeSession(s.sessionId).catch(() => {});
    }, IDLE_TIMEOUT_MS);
  }

  // input() 进入时被 handler 调，更新活动点 + 重置 timer
  _touch(s) {
    s.lastActivityAt = Date.now();
    this._armIdleTimer(s);
  }

  // ── WS 绑定（多客户端支持 — desktop widget 可能同时订阅同一 session）──
  attach(sessionId, ws) {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    if (!s.wss) s.wss = new Set();
    s.wss.add(ws);
    return true;
  }

  detach(sessionId, ws) {
    const s = this.sessions.get(sessionId);
    if (!s || !s.wss) return;
    s.wss.delete(ws);
  }

  // 向 session 的所有 ws 广播消息（丢失败的连接，下次自动清）
  _broadcast(s, msg) {
    if (!s.wss) return;
    const data = JSON.stringify(msg);
    for (const ws of s.wss) {
      try { if (ws.readyState === 1) ws.send(data); } catch {}
    }
  }

  _closeAllWs(s) {
    if (!s.wss) return;
    for (const ws of s.wss) {
      try { ws.close(1000, 'session-closed'); } catch {}
    }
    s.wss.clear();
  }

  hasSession(sessionId) {
    return this.sessions.has(sessionId);
  }

  // ── 来自前端的输入事件 ──
  async input(sessionId, event) {
    const s = this.sessions.get(sessionId);
    if (!s) return { error: 'NO_SESSION' };
    const { page } = s;
    // P2-4：每个 input 都视为活动，重置 idle timer
    this._touch(s);
    // 高频 mousemove 不进入等待队列：只保留最新坐标，避免链接导航时 Input.dispatchMouseEvent 堆积。
    if (event.type === 'mousemove') {
      const now = Date.now();
      if (now - s._lastMoveTs < 32) return { ok: true, throttled: true };
      s._lastMoveTs = now;
      s._pendingMove = { x: event.x, y: event.y };
      if (!s._moveScheduled) {
        s._moveScheduled = true;
        setTimeout(() => {
          const move = s._pendingMove;
          s._pendingMove = null;
          s._moveScheduled = false;
          if (!move || s._closed) return;
          page.mouse.move(move.x, move.y).catch(() => {});
        }, 0);
      }
      return { ok: true, queued: true };
    }

    // 点击/键盘/导航按顺序执行；前一个超时也不能让队列永久 rejected。
    const run = async () => {
      try {
        switch (event.type) {
        case 'mousedown':
          await page.mouse.move(event.x, event.y);
          await page.mouse.down({ button: mouseButton(event.button) });
          return { ok: true };
        case 'mouseup':
          await page.mouse.move(event.x, event.y);
          await page.mouse.up({ button: mouseButton(event.button) });
          return { ok: true };
        case 'click':
          await page.mouse.click(event.x, event.y);
          return { ok: true };
        case 'dblclick':
          await page.mouse.click(event.x, event.y, { clickCount: 2 });
          return { ok: true };
        case 'wheel':
          await page.mouse.wheel({ deltaX: event.dx || 0, deltaY: event.dy || 0 });
          return { ok: true };
        case 'keydown': {
          const key = event.code || event.key;
          if (key) await page.keyboard.down(key);
          return { ok: true };
        }
        case 'keyup': {
          const key = event.code || event.key;
          if (key) await page.keyboard.up(key);
          return { ok: true };
        }
        case 'type': {
          const text = String(event.text || '');
          if (!text) return { ok: true };
          // CDP Input.insertText 直接插入 Unicode，支持中文/emoji，无需键盘映射。
          if (!s.cdp) {
            s.cdp = await page.target().createCDPSession();
            await s.cdp.send('Page.enable');
          }
          await s.cdp.send('Input.insertText', { text });
          return { ok: true };
        }
        case 'navigate':
          if (!/^https?:\/\//i.test(event.url || '')) return { error: 'BAD_URL' };
          await page.goto(event.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          s.url = page.url();
          return { ok: true, navigated: true, url: s.url };
        case 'back':
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          return { ok: true };
        case 'forward':
          await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          return { ok: true };
        case 'reload':
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
          return { ok: true };
        case 'resize':
          s.w = event.w; s.h = event.h;
          await page.setViewport({ width: event.w, height: event.h });
          return { ok: true };
        case 'exec': {
          // 调试用：在页面上下文跑一段 JS（v0.59 加）
          const result = await page.evaluate(event.code);
          return { ok: true, result };
        }
        default:
          return { error: 'UNKNOWN_EVENT_TYPE' };
        }
      } catch (e) {
        return { error: e.message.slice(0, 200) };
      }
    };
    // 远程预览模式下，前端只有 fetch 通道，所以 navigate 后必须主动推 navigated。
    const queued = s._inputQueue.then(async () => {
      const updated = await run();
      if (event.type === 'navigate' && updated && !updated.error) {
        service._broadcast(s, { type: 'navigated', url: updated.url || event.url });
      }
      return updated;
    }, run);
    s._inputQueue = queued.then(() => undefined, () => undefined);
    return queued;
  }

  async _safeClose(sessionId) {
    try { await this.closeSession(sessionId); } catch (e) { /* 静默 */ }
  }

  async closeSession(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    if (s._closed) return;
    s._closed = true;

    if (s.wss) {
      for (const ws of s.wss) {
        try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'closed' })); } catch {}
      }
      this._closeAllWs(s);
    }
    try { if (s.cdp && s.screencastOn) await s.cdp.send('Page.stopScreencast').catch(() => {}); } catch {}
    try { await s.page.close({ runBeforeUnload: false }); } catch {}
    try { await s.ctx.close(); } catch {}
    this.sessions.delete(sessionId);
    this.emit('closed', sessionId);
    if (s._idleTimer) clearTimeout(s._idleTimer);
    // ── 同步在全局清掉 idle timer 引用，避免重复清理 ──
    console.log(`[app-runtime] 关闭 session ${sessionId.slice(0, 8)} | 剩余 sessions=${this.sessions.size}`);
  }

  // ── 服务退出时统一清理（防 Chromium 僵尸进程）──
  async cleanup() {
    for (const id of [...this.sessions.keys()]) {
      try { await this.closeSession(id); } catch {}
    }
    for (const appId of [...this.nativeShells.keys()]) {
      try { await this.closeNativeShell(appId); } catch {}
    }
    if (this.browser && typeof this.browser.isConnected === 'function') {
      try { if (this.browser.isConnected()) await this.browser.close(); } catch {}
      this.browser = null;
    }
  }

  // ── 查询 ──
  listSessions() {
    return [...this.sessions.values()].map(s => ({
      sessionId: s.sessionId,
      url: s.url,
      title: '', // 暂不查 title（避免额外 CDP 调用；后续 P3 可补）
      createdAt: s.createdAt,
      lastFrameAt: s.lastFrameAt,
    }));
  }
}

// 模块顶层固定引用（先实例化，再挂到 module.exports，避免 setTimeout 闭包里找不到）
service = new AppRuntimeService();
module.exports = service;

// 进程信号 — 干净退出
process.on('exit', () => { try { module.exports.cleanup(); } catch {} });
process.on('SIGINT', () => { module.exports.cleanup().finally(() => process.exit(0)); });
process.on('SIGTERM', () => { module.exports.cleanup().finally(() => process.exit(0)); });

// 调试自检（require 本文件、命令行 `--check` 参数时跑）
if (require.main === module && process.argv.includes('--check')) {
  (async () => {
    console.log('[app-runtime --check] 启动 Puppeteer 并打开一个会话…');
    try {
      const s = await module.exports.openSession({ url: 'https://example.com', w: 800, h: 600 });
      console.log('[app-runtime --check] sessionId:', s.sessionId);
      console.log('[app-runtime --check] 当前 sessions:', module.exports.listSessions());
      await new Promise(r => setTimeout(r, 2000));
      await module.exports.closeSession(s.sessionId);
      await module.exports.cleanup();
      console.log('[app-runtime --check] ✅ OK');
      process.exit(0);
    } catch (e) {
      console.error('[app-runtime --check] ❌', e.message);
      process.exit(1);
    }
  })();
}
