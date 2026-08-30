// ============================================================
// qwen-worker.js — Qwen Code 嵌入式内核服务（Phase B v0.1）
// ============================================================
// 定位：把 Qwen Code CLI 变成 ACMS 的 Agent 内核。
//   - QwenSession: 单个会话（spawn CLI + JSONL 协议 + 审批回调 + 事件流）
//   - QwenSessionManager: 会话池（按 userId 分配/复用/空闲回收）
//
// 协议要点（2026-08-22 实测）：
//   1. spawn: node cli.js --input-format stream-json --output-format stream-json
//             --channel=SDK [--model X] [--auth-type anthropic] [--approval-mode default]
//   2. 握手: 立即发 control_request(initialize) → 等 control_response 再发任务
//   3. 任务: user 消息 {type:'user', message:{role:'user',content}, session_id, parent_tool_use_id:null}
//   4. 审批: control_request(can_use_tool) → control_response {behavior:'allow'|'deny'}
//   5. 完成: result 事件（subtype success / error）
//
// 已知坑：
//   - @qwen-code/sdk 0.1.8 在 Windows 有 bug（无视 pathToQwenExecutable + 丢参数），
//     所以这里直接实现 JSONL 协议，不用 SDK query()。
//   - session_id 必须是 UUID 格式。
//   - ACMS llm_models.apiKey 是 AES-256-GCM 密文，用 model-store.getDecryptedKey 解密。
// ============================================================
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DEBUG = process.env.QWEN_WORKER_DEBUG === '1';

function log(...args) {
  console.log(`[qwen-worker]`, ...args);
}
function debug(...args) {
  if (DEBUG) console.log(`[qwen-worker][debug]`, ...args);
}

// ---------- Qwen Code CLI 定位 ----------
// 优先 ACMS server/node_modules 内嵌，其次全局 PATH
function findCliPath() {
  const candidates = [
    // ACMS 根 node_modules（npm install 在 acms/ 执行）
    path.join(__dirname, '..', '..', 'node_modules', '@qwen-code', 'qwen-code', 'cli.js'),
    // server 内嵌
    path.join(__dirname, '..', 'node_modules', '@qwen-code', 'qwen-code', 'cli.js'),
    // 全局
    'qwen',
  ];
  for (const c of candidates) {
    if (c === 'qwen') {
      try { return require('child_process').execSync('where qwen', { stdio: 'ignore' }).toString().trim().split('\n')[0]; } catch { continue; }
    }
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ---------- UUID ----------
function uuid() {
  return crypto.randomUUID();
}

// ============================================================
// QwenSession — 单会话封装
// ============================================================
class QwenSession {
  /**
   * @param {object} opts
   * @param {string} opts.model 模型名（如 MiniMax-M3.0）
   * @param {string} opts.authType 'openai' | 'anthropic' | 'gemini'
   * @param {string} opts.baseUrl LLM API baseUrl
   * @param {string} opts.apiKey 明文 API key
   * @param {string} opts.cwd 工作目录（scratch）
   * @param {string} [opts.sessionId] UUID，不传则自动生成
   * @param {string} [opts.cliPath] Qwen Code CLI 路径
   * @param {function} [opts.onApproval] async (toolCall) => boolean|'allow'|'deny'
   * @param {function} [opts.onEvent] (event) => void  事件流回调（trace 用）
   * @param {number} [opts.approvalTimeoutMs] 审批超时（默认 60s）
   */
  constructor(opts) {
    this.model = opts.model;
    this.authType = opts.authType || 'anthropic';
    this.baseUrl = opts.baseUrl;
    this.apiKey = opts.apiKey;
    this.cwd = opts.cwd;
    this.sessionId = opts.sessionId || uuid();
    this.cliPath = opts.cliPath || findCliPath();
    this.onApproval = opts.onApproval || (async () => true);
    this.onEvent = opts.onEvent || (() => {});
    this.approvalTimeoutMs = opts.approvalTimeoutMs || 60000;
    this.approvalMode = opts.approvalMode || 'auto';   // 'auto' | 'ask'
    this.onApprovalRequest = opts.onApprovalRequest || null;  // ask 模式回调
    // 🆕 v0.115b：会话内自动放行集合（用户对某工具选"全部允许"后，本会话内同类操作不再弹审批）
    //   仅存于内存（会话/CLI 生命周期内有效），会话重建即清空
    this.autoAllowTools = new Set();
    this.enableMcp = opts.enableMcp !== false;  // B3: 默认开 MCP（ACMS 工具暴露给 Qwen）
    this.systemPrompt = opts.systemPrompt || null;       // B6: 完全覆盖 system prompt
    this.appendSystemPrompt = opts.appendSystemPrompt || null;  // B6: 追加人设（保留 Qwen 工程能力）

    this.child = null;
    this.rl = null;
    this.ready = false;
    this.closed = false;
    this._pendingResolve = null;
    this._handshakeResolve = null;
    this._handshakeReject = null;
    this._handshakeDone = false;  // 🆕 v0.119: 跟踪握手完成状态
    this.lastActivityAt = Date.now();
    this.turnCount = 0;
    this.approvalCount = 0;
    this._inFlight = false;  // ask 进行中（防空闲回收误杀）
    this._askQueue = [];     // 🆕 修复（2026-08-23）：并发消息队列 —— 同一会话同时只允许一个 ask 在飞
                             //   _pendingResolve 是单值，并发 ask 会互相覆盖（第二条覆盖第一条的 resolve
                             //   → 第一条永不 resolve 直到超时）。队列串行化解决。
    this.events = [];   // 事件流缓冲（trace）
    this.lastResult = null;
    this._initTimeout = null;
    // 🆕 v0.118.5 (2026-08-29): 无事件守护 —— 记录最近一次收到 CLI 事件的时间
    //   OOM/卡死场景 worker 被内核杀但 wrapper 活着 → child.on('exit') 不触发 →
    //   ask 挂满 600s。守护定时器用它判定"CLI 已无响应"并快速失败。
    this._lastEventAt = 0;
    // 🆕 v0.118.6 (2026-08-30): 无事件守护改造 —— 心跳探测回调 + 防重入标志
    //   根因（多多实测）：写大文件时 LLM 生成超大 write_file input，provider 端
    //   tool_use 参数非流式（OpenAI 兼容 API 常见：完整 JSON 一次性返回），
    //   Qwen CLI stdout 长时间零输出 → 旧守护 120s 无条件 SIGKILL 误杀。
    //   改造：无事件 120s 后先发 get_usage_info control_request 心跳，CLI 活着
    //   就回 control_response → 判定"正在生成大输出"继续等；心跳无响应再查
    //   CPU 活性；两者都无才杀。总超时 600s 仍是最终兜底。
    this._probeAckCb = null;      // 心跳 ACK 回调（_handleLine control_response 触发）
    this._probeInFlight = false;  // 探测进行中（interval 防重入）
    // 🆕 v0.118.5: stderr 尾部缓冲（exit 诊断 —— 区分 V8 heap OOM / GLIBC 噪声 / 真崩溃）
    this._stderrTail = [];
    // 🆕 P0 方案B（卡片化）：流式累积工具调用 input_json（CLI 按 Anthropic stream 协议发 input_json_delta）
    this._toolUseAccum = new Map();  // tool_use_id → { tool_name, input_json }
    this._lastToolUseId = null;      // 当前正在 input 流式的 tool_use_id
  }

  // ---------- 生命周期 ----------
  async start() {
    if (!this.cliPath) throw new Error('Qwen Code CLI 未找到。请先在 ACMS server 目录执行 npm install @qwen-code/qwen-code');
    if (!this.apiKey) throw new Error('Qwen Session: apiKey 为空');

    // 🆕 v0.118.5 (2026-08-29): Linux 低内存守门 —— spawn 前检查 MemAvailable
    //   120 实踩：1.8Gi 机器 Qwen CLI 单会话峰值 700MB+，8/28 内核 OOM killer 连环杀 12 次
    //   （dmesg: "Out of memory: Killed process XXXX (MainThread)"）。
    //   内存不够时明确报错让用户稍后再试，而不是 spawn 后让 OS OOM killer 杀（exit code 更友好）。
    //   阈值 300MB：ACMS 主进程 ~115MB + 系统 ~400MB + Qwen 512MB 堆上限的余量。
    if (process.platform === 'linux') {
      try {
        const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
        const m = /MemAvailable:\s+(\d+)\s+kB/.exec(meminfo);
        if (m) {
          const availMB = Math.round(parseInt(m[1], 10) / 1024);
          const MIN_AVAIL_MB = 300;
          if (availMB < MIN_AVAIL_MB) {
            throw new Error(`系统内存紧张（可用 ${availMB} MB < ${MIN_AVAIL_MB} MB），请稍后再试`);
          }
          debug(`MemAvailable=${availMB}MB 通过守门`);
        }
      } catch (e) {
        if (/系统内存紧张/.test(e.message)) throw e;
        debug('MemAvailable 检查失败(忽略):', e.message);
      }
    }

    const env = { ...process.env };
    // B5: 限制子进程堆内存（120 低内存服务器防系统级 OOM）
    //   v0.118.5 (2026-08-29): 256MB → 512MB —— 实测 256MB 对 Qwen Code 长任务不够：
    //   V8 FATAL "Reached heap limit" → CLI exited with code 1（8/29 120 实踩：
    //   worker 跑 25 分钟堆涨到 275~330MB 撞 256MB 上限）。512MB 在 1.8Gi 机器可行：
    //   worker 512 + ACMS ~115 + 系统 ~400 ≈ 1.0GB，且配合上面 MemAvailable 守门防系统 OOM。
    env.NODE_OPTIONS = process.env.NODE_OPTIONS || '--max-old-space-size=512';
    if (this.authType === 'anthropic') {
      env.ANTHROPIC_BASE_URL = this.baseUrl;
      env.ANTHROPIC_API_KEY = this.apiKey;
    } else if (this.authType === 'openai') {
      env.OPENAI_BASE_URL = this.baseUrl;
      env.OPENAI_API_KEY = this.apiKey;
    } else {
      env.GEMINI_API_KEY = this.apiKey;
    }

    const args = [
      this.cliPath,
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--channel=SDK',
      '--auth-type', this.authType,
      '--model', this.model,
      '--approval-mode', 'default',
      '--session-id', this.sessionId,
      '--include-partial-messages',  // B7: 真流式必需（否则无 content_block_delta 事件）
    ];

    // B6: 小吉人设注入（保留 Qwen Code 工程能力，追加 ACMS 身份）
    if (this.systemPrompt) args.push('--system-prompt', this.systemPrompt);
    if (this.appendSystemPrompt) args.push('--append-system-prompt', this.appendSystemPrompt);

    // B3: ACMS MCP 工具层（Qwen 可调 acms_* 工具）
    // v0.118.3 修复（2026-08-25）：`--mcp-config` 参数在 Qwen CLI 0.21.15 **不存在**
    //   （grep cli.js 0 命中，静默忽略）→ 之前 MCP 从未真正加载，Qwen 工具注册表
    //   里没有 acms_* 工具（acms_describe_image 找不到）。正确姿势：SDK initialize
    //   控制消息里传 `mcpServers` 字段（session-JV74G6EZ.js normalizeMcpServerConfig）。
    //   这里只记录路径，真正的注入在 _sendControl(initialize) 里做。
    if (this.enableMcp) {
      const mcpServerPath = path.join(__dirname, 'acms-mcp-server.js');
      if (fs.existsSync(mcpServerPath)) {
        this.mcpServerPath = mcpServerPath;
        debug('MCP enabled:', mcpServerPath);
      }
    }

    debug('spawn:', 'node', args.join(' '));
    this.child = spawn('node', args, {
      env, cwd: this.cwd, stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.rl = readline.createInterface({ input: this.child.stdout });
    this.rl.on('line', (line) => this._handleLine(line));
    this.child.stderr.on('data', (d) => {
      const s = d.toString().trim();
      // v0.118 临时诊断：stderr 全量输出，不受 DEBUG 门控
      //   （之前 MCP config 错误 silent fail —— agent 找不到 acms_describe_image 看不到原因）
      if (s) {
        const tag = '[cli-stderr]';
        console.log(tag, s.slice(0, 400));
        // 🆕 v0.118.5: 维护非噪声 tail 缓冲（exit 诊断用 —— 区分 V8 heap OOM / 真崩溃）
        //   120 特有噪声：cua-driver-rs GLIBC 错误每次 spawn 刷屏 6 行，过滤掉
        if (!/GLIBC|cua-driver/.test(s)) {
          this._stderrTail.push(s.slice(0, 250));
          if (this._stderrTail.length > 3) this._stderrTail.shift();
        }
        // 同时追加到 data/qwen-spawn.log（之前 stderr 完全丢失）
        try {
          const fs = require('fs');
          const path = require('path');
          const logDir = path.resolve(__dirname, '..', '..', 'data');
          if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
          fs.appendFileSync(
            path.join(logDir, 'qwen-spawn.log'),
            `[${new Date().toISOString()}] ${s.slice(0, 800)}\n`
          );
        } catch (e) { /* ignore */ }
      }
    });
    this.child.on('error', (e) => {
      debug('cli error:', e.message);
      if (this._handshakeReject) { this._handshakeReject(e); this._handshakeReject = null; }
    });
    this.child.on('exit', (code) => {
      debug(`cli exit code=${code}`);
      this.ready = false;
      if (this._pendingResolve) {
        const r = this._pendingResolve;
        this._pendingResolve = null;
        // 🆕 v0.118.5: 附 stderr 尾部（让用户/日志一眼看出是 V8 heap OOM 还是别的）
        const tail = this._stderrTail.filter((l) => /heap|FATAL|Error|error|Out of memory/i.test(l)).join(' | ');
        const msg = `CLI exited with code ${code}${tail ? ' — ' + tail.slice(0, 200) : ''}`;
        r({ type: 'result', subtype: 'cli_exit', is_error: true, error: { message: msg } });
      }
      // 🆕 修复（2026-08-23）：CLI 退出 → 队列中排队的 ask 全部 reject（否则永远挂起）
      this._flushQueue(new Error(`CLI exited with code ${code}`));
    });

    // 握手：发 initialize 等 ACK
    await new Promise((resolve, reject) => {
      this._handshakeResolve = resolve;
      this._handshakeReject = reject;
      this._initTimeout = setTimeout(() => reject(new Error('Qwen 握手超时 (15s)')), 15000);
      // 🆕 修复（2026-08-23）：timeout.canUseTool 提到 600s（CLI 上限）——
      //   CLI 默认 can_use_tool 审批超时 60s，ACMS ask 模式审批挂起等前端决策
      //   （5min 自动 deny）→ 前端没及时点 → CLI 60s 先超时 → "Control request timeout"
      //   → 工具调用（如 edit 文件）中断。提到 600s 让 CLI 等 ACMS 的 deny 兜底。
      // v0.118.4 修复（2026-08-26）：真正装配 MCP！旧代码 mcpServers: null
      //   （v0.118.3 注释说要用 mcpServers 字段但实际没传）→ Qwen 工具注册表
      //   从未有 acms_* 工具（"找不到 acms_describe_image"）。SDK initialize
      //   控制消息的 mcpServers 字段格式见 session-JV74G6EZ.js normalizeMcpServerConfig：
      //   { name: { command, args, env, trust } }（stdio transport 隐式，不用 transport 字段）
      const mcpServers = (this.enableMcp && this.mcpServerPath) ? {
        acms: {
          command: process.execPath,
          args: ['--max-old-space-size=128', this.mcpServerPath],
          env: {},
          trust: true,   // SDK 注入的 server 标记 trusted（CLI 不再弹权限确认）
        },
      } : null;
      this._sendControl({ subtype: 'initialize', hooks: null, mcpServers, sdkMcpServers: null, agents: null, timeout: { canUseTool: 600000 } });
    });

    this.ready = true;
    log(`会话就绪 ${this.sessionId.slice(0, 8)} (model=${this.model}, auth=${this.authType})`);
    return this;
  }

  // ---------- 消息 ----------
  async ask(prompt, opts = {}) {
    // 🆕 修复（2026-08-23）：并发消息串行化
    //   同一会话同时只允许一个 ask 在飞 —— _pendingResolve 是单值，并发 ask 会互相覆盖：
    //   第二条消息的 resolve 覆盖第一条 → 第一条永不 resolve（干等到超时），第二条拿到错乱结果。
    //   用户连发两条消息（如"改一下" + "好了么？"）必踩。这里排队串行执行。
    if (this._inFlight) {
      return new Promise((resolve, reject) => {
        this._askQueue.push({ prompt, opts, resolve, reject });
      });
    }
return this._doAsk(prompt, opts);
  }

  async _doAsk(prompt, opts = {}) {
    if (!this.ready || !this.child || this.child.exitCode !== null) {
      // 🆕 修复（2026-08-23）：未就绪 → 队列全部 reject（快速失败，不干等超时）
      this._flushQueue(new Error('Qwen 会话未就绪或已退出'));
      throw new Error('Qwen 会话未就绪或已退出');
    }
    this.lastActivityAt = Date.now();
    this.turnCount++;
    this._inFlight = true;
    this._onDelta = opts.onDelta || null;  // B7: 真流式回调（text_delta 实时）

    // 🆕 v0.118.5 + v0.118.6 (2026-08-29/30): 无事件守护 —— ask 在飞但 120s 无任何 CLI 事件
    //   v0.118.5 初衷：OOM killer 杀了 V8 worker（MainThread）但 wrapper 活着 → child.on('exit')
    //   不触发 → _pendingResolve 永远挂着 → 只能等 600s 总超时（8/25-8/26 实踩 12 次）。
    //   v0.118.6 修正误杀（多多实测）：写大文件时 LLM 生成超大 tool_use input，provider 端
    //   非流式 → CLI 合法静默 > 120s，旧逻辑无条件 SIGKILL 误杀（120 日志 2 次实锤）。
    //   现在：无事件 120s → 先心跳探测（get_usage_info control_request，CLI 活着必回 ACK）
    //   → 活着 = 生成大输出中，重置计时继续等；心跳无响应再查进程 CPU 活性；都无才杀。
    this._lastEventAt = Date.now();
    const NO_EVENT_TIMEOUT_MS = 120 * 1000;
    const noEventGuard = setInterval(() => {
      if (!this._pendingResolve) return;
      if (Date.now() - this._lastEventAt > NO_EVENT_TIMEOUT_MS) {
        if (this._probeInFlight) return;  // 🆕 v0.118.6: 上次探测未完成，防重入
        this._probeInFlight = true;
        this._probeAndMaybeKill(NO_EVENT_TIMEOUT_MS).finally(() => { this._probeInFlight = false; });
      }
    }, 30000);
    noEventGuard.unref?.();

    const resultPromise = new Promise((resolve) => { this._pendingResolve = resolve; });

    // 🆕 v0.118：attachments 多模态（base64 图）—— 与 prompt 一起 POST
    //   Anthropic ContentBlock 数组形态，CLI 0.21.15 anthropicContentGenerator 已支持
    //   formatUserContent 在 class 外部（module-level helper）
    const userContent = formatUserContent(prompt, opts.attachments);
    this.child.stdin.write(JSON.stringify({
      type: 'user',
      message: { role: 'user', content: userContent },
      session_id: this.sessionId,
      parent_tool_use_id: null,
    }) + '\n');

    // 超时保护
    const timeoutMs = opts.timeoutMs || 10 * 60 * 1000;
    const timer = setTimeout(() => {
      if (this._pendingResolve) {
        const r = this._pendingResolve;
        this._pendingResolve = null;
        // 🆕 v0.118.7 (2026-08-30): 超时后清理 CLI 进程树 —— 防僵尸泄漏
        //   多多实测：agnès API 断连后 worker 半死（进程活、CPU 0、无连接、无输出），
        //   ask 600s 超时旧逻辑只 resolve 不杀进程 → CLI 白挂 17 分钟占 ~180MB。
        //   超时 = 前端已拿到失败，无消费者 → SIGKILL 进程树（exit 事件会清 session
        //   + flushQueue reject 排队 ask；manager getSession 下次自动重建）。
        log(`会话 ${this.sessionId.slice(0, 8)} ask 超时 (${timeoutMs / 1000}s)，清理 CLI 进程树`);
        try { if (this.child && this.child.exitCode === null) this.child.kill('SIGKILL'); } catch (e) { /* ignore */ }
        r({ type: 'result', subtype: 'timeout', is_error: true, error: { message: `ask 超时 (${timeoutMs / 1000}s)` } });
      }
    }, timeoutMs);

    const result = await resultPromise;
    clearTimeout(timer);
    clearInterval(noEventGuard);  // 🆕 v0.118.5: ask 完成 → 停无事件守护
    this._inFlight = false;
    this._onDelta = null;
    this.lastResult = result;

    // 🆕 修复（2026-08-23）：当前 ask 完成 → 处理队列中下一条
    const next = this._askQueue.shift();
    if (next) {
      this._doAsk(next.prompt, next.opts).then(next.resolve, next.reject);
    }
    return result;
  }

  // ---------- 无事件守护探测（v0.118.6） ----------
  /**
   * 无事件超时后的活性探测决策：
   *   1. 心跳：发 get_usage_info control_request，3s 内收到任意 control_response → CLI 活着
   *   2. 心跳无响应 → Linux 查进程 CPU 时间（wrapper + 子进程）两次采样是否有增长
   *   3. 两者都无 → 判定卡死 → SIGKILL + stall 快速失败（保留 v0.118.5 的 OOM 兜底）
   *   4. 探测异常/平台不支持 → **保守不杀**（重置计时继续等，总超时 600s 兜底）
   *      —— 误杀（写大文件合法静默）比慢失败（OOM 等 600s）伤害大，多多 2026-08-30 实踩
   */
  async _probeAndMaybeKill(timeoutMs) {
    const probeOk = await this._cliHasActivity();
    if (probeOk) {
      debug(`无事件 ${timeoutMs / 1000}s，探测：CLI 存活（可能正在生成大输出），继续等待`);
      log(`会话 ${this.sessionId.slice(0, 8)} 无事件 ${timeoutMs / 1000}s，心跳/CPU 探测存活，继续等待（turn=${this.turnCount})`);
      this._lastEventAt = Date.now();  // 重置计时 → 下一个 120s 窗口
      return;
    }
    // 探测无活性：再确认一次仍然无事件（避免探测期间 CLI 恰好恢复）
    if (Date.now() - this._lastEventAt <= timeoutMs) return;
    if (!this._pendingResolve) return;
    const r = this._pendingResolve;
    this._pendingResolve = null;
    debug(`无事件 ${timeoutMs / 1000}s 且探测无活性，判定 CLI 卡死，kill 进程树`);
    log(`会话 ${this.sessionId.slice(0, 8)} 无事件 ${timeoutMs / 1000}s 且心跳/CPU 无活性，强制终止 CLI（rss=${(process.memoryUsage().rss / 1048576) | 0}MB, turn=${this.turnCount})`);
    try { if (this.child && this.child.exitCode === null) this.child.kill('SIGKILL'); } catch (e) { /* ignore */ }
    r({ type: 'result', subtype: 'stall', is_error: true, error: { message: `CLI 无响应超过 ${timeoutMs / 1000}s（无事件且探测无活性），已强制终止` } });
  }

  /**
   * CLI 活性探测（跨平台）。
   *   true  = CLI 活着（生成大输出中 / 正常等待中）→ 不杀
   *   false = 探测确认无活性（可能 OOM 杀 worker 或真卡死）→ 杀
   * 探测自身失败（/proc 不可读、平台不支持）→ 返回 true（保守不杀，等总超时）。
   */
  async _cliHasActivity() {
    // 0. wrapper 进程已死 → 无活性（exit 事件会走 cli_exit 快速失败）
    if (!this.child || this.child.exitCode !== null) return false;
    // 1. 心跳：get_usage_info（SystemController 只读子类型，CLI 活着必回 control_response）
    const heartbeat = await new Promise((resolve) => {
      let done = false;
      const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
      this._probeAckCb = () => finish(true);
      try {
        if (this.child.stdin && !this.child.stdin.destroyed) {
          this._sendControl({ subtype: 'get_usage_info' });
        } else { finish(false); return; }
      } catch (e) { finish(false); return; }
      setTimeout(() => finish(false), 3000).unref?.();
    });
    if (heartbeat) return true;
    debug('心跳无响应，尝试 CPU 活性探测');
    // 2. CPU 兜底（Linux /proc；其他平台无可靠手段 → 保守返回 true 等总超时）
    if (process.platform !== 'linux') return true;
    try {
      const pids = [this.child.pid, ...readChildrenPids(this.child.pid)];
      const sumTicks = () => pids.reduce((acc, pid) => acc + (readProcCpuTicks(pid) ?? 0), 0);
      const t1 = sumTicks();
      await new Promise((r2) => setTimeout(r2, 800));
      const t2 = sumTicks();
      if (t2 - t1 > 0) return true;
      debug(`CPU 无增长（wrapper=${this.child.pid}, children=${pids.slice(1).join(',') || '无'}）`);
    } catch (e) {
      debug('CPU 活性探测异常（保守不杀）:', e.message);
      return true;
    }
    return false;
  }

  // ---------- 审批 ----------
  async _handleApproval(req, requestId) {
    this.approvalCount++;
    this.lastActivityAt = Date.now();

    // 🆕 v0.115b：会话内自动放行 —— 用户此前对同类工具选择了"全部允许"。
    //   命中集合 → 不弹审批、不挂队列，直接 allow（CLI proceed 执行）。
    //   排除 ask_user_question（需要用户实际回答，不能自动放行）。
    const tnameEarly = req.tool_name || '';
    const isUserQuestionEarly = tnameEarly === 'ask_user_question'
      || (req._meta && req._meta.qwenInteractionKind === 'user_question');
    if (!isUserQuestionEarly && this.autoAllowTools && this.autoAllowTools.has(tnameEarly)) {
      debug(`[qwen] ${tnameEarly} 命中会话自动放行集合，跳过审批直接 allow`);
      this._emit({ type: 'approval_result', session_id: this.sessionId, tool_use_id: req.tool_use_id, allowed: true, autoAllowed: true });
      this.child.stdin.write(JSON.stringify({
        type: 'control_response',
        response: { subtype: 'success', request_id: requestId, response: { behavior: 'allow' } },
      }) + '\n');
      return;
    }

    // v0.114i: 识别 ask_user_question 工具调用（模型向用户提问澄清，如"查哪个城市的油价？"）
    //   它不是普通的 allow/deny 审批 —— 模型期望的是用户对问题的实际回答（answers），
    //   响应格式：{ behavior:'allow', updatedInput:{ answers:{ '0':'回答1', '1':'回答2' } } }
    const isUserQuestion = req.tool_name === 'ask_user_question'
      || (req._meta && req._meta.qwenInteractionKind === 'user_question');
    const rawQuestions = (req.input && Array.isArray(req.input.questions)) ? req.input.questions
      : (req._meta && Array.isArray(req._meta.qwenQuestions)) ? req._meta.qwenQuestions
      : [];

    const toolCall = {
      tool_name: req.tool_name,
      tool_use_id: req.tool_use_id,
      input: req.input,
      permission_suggestions: req.permission_suggestions || [],
      // v0.114i: 透传问答信息（前端可渲染问题表单而非"允许/拒绝"按钮）
      _isUserQuestion: isUserQuestion,
      questions: isUserQuestion ? rawQuestions.map((q, i) => ({
        index: String(i),
        header: (q && q.header) || `问题 ${i + 1}`,
        question: (q && q.question) || '',
        options: Array.isArray(q && q.options) ? q.options.map((o) => (o && o.label) || o) : [],
        inputType: (q && q.inputType) || 'single_select',
        multiSelect: !!(q && q.multiSelect),  // v0.114k: 透传多选标记（CLI 协议 multiSelect）
        answerKey: String((q && q.answerKey) ?? i),
      })) : [],
    };
    // 事件流回调（trace）
    this._emit({ type: 'approval_request', session_id: this.sessionId, toolCall, request_id: requestId });

    let decision;
    // ask 模式：挂起到审批队列，等待外部决策（B2）
    if (this.approvalMode === 'ask' && this.onApprovalRequest) {
      decision = await this.onApprovalRequest(toolCall, { sessionId: this.sessionId, requestId });
    } else {
      try {
        decision = await Promise.race([
          Promise.resolve(this.onApproval(toolCall)),
          new Promise((_, rej) => setTimeout(() => rej(new Error('审批超时')), this.approvalTimeoutMs)),
        ]);
      } catch (e) {
        debug('审批异常，默认拒绝:', e.message);
        decision = false;
      }
    }

    // v0.114i: decision 可能是对象（含 answers）而非布尔 —— ask_user_question 场景
    let allowed = false;
    let answers = null;
    if (decision && typeof decision === 'object') {
      allowed = decision.allowed === true || decision.allow === true || decision.behavior === 'allow';
      answers = decision.answers || null;
    } else {
      allowed = decision === true || decision === 'allow' || decision === 'allowed';
    }

    // ask_user_question：必须带 answers 才真正完成（没有 answers 的 allow 会被模型视为未回答）
    if (isUserQuestion && allowed && (!answers || Object.keys(answers).length === 0)) {
      debug('ask_user_question 被 allow 但无 answers，转为 deny（模型应继续等回答或自行处理）');
      allowed = false;
    }

    this._emit({ type: 'approval_result', session_id: this.sessionId, tool_use_id: toolCall.tool_use_id, allowed });

    const responseBody = allowed
      ? (answers ? { behavior: 'allow', updatedInput: { answers } } : { behavior: 'allow' })
      : { behavior: 'deny', message: isUserQuestion ? 'ACMS 未收到用户回答' : 'Rejected by ACMS' };

    this.child.stdin.write(JSON.stringify({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: responseBody,
      },
    }) + '\n');
  }

// 🆕 v0.119：中断当前 turn
  //   走 Qwen CLI control_request {subtype:"interrupt"} → Session.handleInterrupt()
  //   → activeTurnAbortController.abort(TurnInterruptedError) → recoverableCancellation
  //   → runNonInteractive 返回 130 + emitResult(isError:true, "Turn interrupted")
  //   Session 持续存活，processUserMessage 可继续接收新消息
  //   关键 race: 必须在 _handshakeDone 后才能发，否则 stdio 写穿
  interrupt() {
    if (!this._handshakeDone) {
      debug('interrupt 失败: handshake 未完成, session=', this.sessionId);
      return false;
    }
    this._sendControl({ subtype: 'interrupt' });
    debug('interrupt 已发送, session=', this.sessionId);
    return true;
  }

  // 🆕 v0.119：续转被中断的 turn
  //   走 Qwen CLI control_request {subtype:"continue_last_turn"} → requestContinueLastTurn()
  //   → buildSessionRecoveryPlanFromApiHistory() 扫描 history 末态：
  //     - interrupted_prompt（用户消息发了但 model 没回）→ 重发用户 parts
  //     - interrupted_turn（model 发了但 tool_use 没收到 tool_result）→ 合成失败 tool_result
  //     - clean/none → 拒绝续转，返回 {accepted:false}
  //   续转本身跑在 work queue 里，与新 user message 串行
  continueLastTurn(onAck) {
    if (!this._handshakeDone) {
      debug('continue_last_turn 失败: handshake 未完成, session=', this.sessionId);
      return false;
    }
    this._continueAckCb = onAck;
    this._sendControl({ subtype: 'continue_last_turn' });
    debug('continue_last_turn 已发送, session=', this.sessionId);
    return true;
  }

  // ---------- 内部 ----------
  _sendControl(request) {
    this.child.stdin.write(JSON.stringify({
      type: 'control_request',
      request_id: 'req-' + crypto.randomUUID(),
      request,
    }) + '\n');
  }

  _emit(evt) {
    this.events.push(evt);
    if (this.events.length > 500) this.events.shift(); // 上限 500 条
    // 任何事件到达都是活动信号（LLM 响应流也算）
    this.lastActivityAt = Date.now();
    try { this.onEvent(evt); } catch (e) { debug('onEvent 异常:', e.message); }
  }

  _handleLine(line) {
    if (!line.trim()) return;
    // 🆕 v0.118.5: 无事件守护 —— 任何 CLI 事件都算"活着"（stream_event/control_response/result…）
    this._lastEventAt = Date.now();
    let msg;
    try { msg = JSON.parse(line); } catch { return; }

    switch (msg.type) {
      case 'control_response': {
        const resp = msg.response || {};
        if (resp.subtype === 'success' && resp.response?.subtype === 'initialize') {
          if (this._initTimeout) { clearTimeout(this._initTimeout); this._initTimeout = null; }
          if (this._handshakeResolve) {
            this._handshakeResolve();
            this._handshakeResolve = null;
            this._handshakeReject = null;
          }
          // 🆕 v0.119：记录 handshake 完成，让 interrupt/continue 能工作
          this._handshakeDone = true;
        }
        // 🆕 v0.119：continue_last_turn ACK
        if (resp.subtype === 'success' && resp.response?.subtype === 'continue_last_turn') {
          debug('continue_last_turn ACK:', JSON.stringify(resp.response).slice(0, 200));
          if (this._continueAckCb) {
            this._continueAckCb(resp.response);
            this._continueAckCb = null;
          }
        }
        // 🆕 v0.118.6：心跳探测 ACK —— 收到**任意** control_response 都证明 CLI 活着
        //   （ACMS 发 control_request 后 CLI 才回 response，不会无缘无故发）。
        //   探测期间 CLI 可能回 error（不认识 get_usage_info）—— 也算活着。
        if (this._probeAckCb) {
          const cb = this._probeAckCb;
          this._probeAckCb = null;
          cb(true);
        }
        break;
      }
      case 'system':
        this._emit({ type: 'system', session_id: this.sessionId, subtype: msg.subtype, payload: msg });
        break;
      case 'assistant':
        this._emit({ type: 'assistant', session_id: this.sessionId, message: msg.message });
        break;
      case 'stream_event':
        this._emit({ type: 'stream_event', session_id: this.sessionId, event: msg.event });
        // B7: 真流式 — text_delta 实时回调
        if (this._onDelta && msg.event && msg.event.type === 'content_block_delta' && msg.event.delta && msg.event.delta.type === 'text_delta') {
          const _dt = msg.event.delta.text || '';
          // 🆕 修复（2026-08-23）：空 text_delta 不过滤会导致前端创建空气泡
          //   （updateStreamMessage('') 用空 accumulated 建气泡，只有 cursor 没文字）
          //   thinking 转 text 边界、流式分段间隙可能发空串 —— 直接跳过
          if (_dt) { try { this._onDelta(_dt); } catch (e) { debug('onDelta 异常:', e.message); } }
        }
        // 🆕 P0 方案B: tool_use 块开始（Anthropic stream 协议：tool_use 块独立于 text 块）
        if (msg.event && msg.event.type === 'content_block_start' && msg.event.content_block && msg.event.content_block.type === 'tool_use') {
          const cb = msg.event.content_block;
          this._toolUseAccum.set(cb.id, { tool_name: cb.name || 'unknown', input_json: '' });
          this._lastToolUseId = cb.id;
          this._emit({
            type: 'tool_use_start',
            session_id: this.sessionId,
            tool_use_id: cb.id,
            tool_name: cb.name || 'unknown',
            block_index: msg.event.index,
          });
        }
        // 🆕 P0 方案B: input_json_delta 累加（tool_use 的 input 是流式 JSON 片段）
        if (msg.event && msg.event.type === 'content_block_delta' && msg.event.delta && msg.event.delta.type === 'input_json_delta' && this._lastToolUseId) {
          const acc = this._toolUseAccum.get(this._lastToolUseId);
          if (acc) acc.input_json += (msg.event.delta.partial_json || '');
        }
        // 🆕 P0 方案B: content_block_stop → tool_use input 完整
        if (msg.event && msg.event.type === 'content_block_stop' && this._lastToolUseId && this._toolUseAccum.has(this._lastToolUseId)) {
          const acc = this._toolUseAccum.get(this._lastToolUseId);
          let parsedInput = {};
          if (acc.input_json) {
            try { parsedInput = JSON.parse(acc.input_json); }
            catch (e) { debug(`tool_use ${this._lastToolUseId} input JSON 解析失败:`, e.message, 'raw:', acc.input_json.slice(0, 100)); }
          }
          this._emit({
            type: 'tool_use_end',
            session_id: this.sessionId,
            tool_use_id: this._lastToolUseId,
            tool_name: acc.tool_name,
            input: parsedInput,
          });
          this._toolUseAccum.delete(this._lastToolUseId);
          this._lastToolUseId = null;
        }
        // 🆕 P0 方案B: thinking_delta 透传（D2: 折叠卡片用，Anthropic 协议 delta.type='thinking_delta'）
        if (msg.event && msg.event.type === 'content_block_delta' && msg.event.delta && msg.event.delta.type === 'thinking_delta') {
          this._emit({
            type: 'thinking_delta',
            session_id: this.sessionId,
            text: msg.event.delta.thinking || msg.event.delta.text || '',
          });
        }
        break;
      case 'user': {
        // 🆕 P0 方案B: CLI echo 的 user 消息里含 tool_result 块（Anthropic stream 协议规范）
        //   旧版 SDK 风格 assistant.content[] 也可能有 tool_result，但现代协议统一放 user 侧
        const content = msg.message && msg.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block && block.type === 'tool_result') {
              // content 可能是 string 或 [{type:'text', text:'...'}] 数组，统一成 string
              let resultText = '';
              if (typeof block.content === 'string') {
                resultText = block.content;
              } else if (Array.isArray(block.content)) {
                resultText = block.content.map((b) => (b && b.text) || '').join('');
              }
              this._emit({
                type: 'tool_result',
                session_id: this.sessionId,
                tool_use_id: block.tool_use_id,
                content: resultText,
                is_error: !!block.is_error,
              });
            }
          }
        }
        break;
      }
      case 'control_request': {
        const req = msg.request || {};
        if (req.subtype === 'can_use_tool') {
          this._handleApproval(req, msg.request_id).catch((e) => debug('审批处理异常:', e.message));
        }
        break;
      }
      case 'result':
        this._emit({ type: 'result', session_id: this.sessionId, result: msg });
        if (this._pendingResolve) {
          const r = this._pendingResolve;
          this._pendingResolve = null;
          r(msg);
        }
        break;
      default:
        debug('未知消息类型:', msg.type);
    }
  }

  getEventsSince(t) {
    return this.events.filter((e) => !t || (e.t || 0) >= t);
  }

  getStats() {
    return {
      sessionId: this.sessionId,
      ready: this.ready,
      turnCount: this.turnCount,
      approvalCount: this.approvalCount,
      lastActivityAt: this.lastActivityAt,
      cwd: this.cwd,
      model: this.model,
    };
  }

  // 🆕 修复（2026-08-23）：清空排队中的 ask（CLI 退出 / 会话关闭时调用，防止 promise 永远挂起）
  _flushQueue(err) {
    if (!this._askQueue || this._askQueue.length === 0) return;
    const queued = this._askQueue.splice(0);
    for (const item of queued) {
      try { item.reject(err); } catch (e) { /* ignore */ }
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    // 🆕 修复（2026-08-23）：关闭 → 队列中排队的 ask 全部 reject（否则永远挂起）
    this._flushQueue(new Error('Qwen 会话已关闭'));
    try {
      if (this.child && this.child.stdin) this.child.stdin.end();
    } catch (e) { /* ignore */ }
    // B5: 清理 MCP server 孤儿进程（Qwen CLI 退出后 MCP 子进程可能残留，低内存服务器会累积泄漏）
    try {
      const { execSync } = require('child_process');
      const isWin = process.platform === 'win32';
      if (isWin) {
        execSync(`taskkill /F /FI "WINDOWTITLE eq acms-mcp*" 2>nul`, { stdio: 'ignore' }).catch?.(() => {});
      } else {
        execSync(`pkill -f acms-mcp-server.js 2>/dev/null`, { stdio: 'ignore' });
      }
    } catch (e) { /* 清理失败忽略 */ }
    // 优雅退出窗口：3s 后 SIGKILL 兜底
    if (this.child && this.child.exitCode === null) {
      setTimeout(() => {
        try { if (this.child && this.child.exitCode === null) this.child.kill('SIGKILL'); } catch (e) { /* ignore */ }
      }, 3000).unref();
    }
log(`会话关闭 ${this.sessionId.slice(0, 8)}`);
  }
}

// ============================================================
// v0.118.6: 无事件守护的进程活性探测 helpers（Linux /proc）
// ============================================================

/**
 * 读进程 CPU 时间（utime+stime，单位 jiffies）。
 * /proc/<pid>/stat 格式：pid (comm) state ppid ... utime stime ...
 * comm 可能含空格/括号，从最后一个 ')' 后解析。
 * @returns {number|null} CPU ticks；进程不存在/读取失败 → null
 */
function readProcCpuTicks(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const idx = stat.lastIndexOf(')');
    if (idx < 0) return null;
    const parts = stat.slice(idx + 2).split(' ');
    // parts[0]=state(字段3) parts[1]=ppid ... parts[11]=utime(字段14) parts[12]=stime(字段15)
    const utime = parseInt(parts[11], 10) || 0;
    const stime = parseInt(parts[12], 10) || 0;
    return utime + stime;
  } catch (e) {
    return null;  // 进程不存在（已被 OOM 杀）或 /proc 不可读
  }
}

/**
 * 读进程的直接子进程 pid 列表（Linux）。
 * /proc/<pid>/task/<pid>/children 列出所有直接子进程。
 * @returns {number[]} 子进程 pid 数组（读失败 → []）
 */
function readChildrenPids(pid) {
  try {
    const content = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8');
    return content.trim().split(/\s+/).filter(Boolean).map(Number);
  } catch (e) {
    return [];
  }
}

/**
 * 格式化为 Qwen CLI 接受的 user message content（Anthropic ContentBlock 数组）
 *   - 无 attachments：返回原始字符串（向后兼容，原 chat 流都用字符串 content）
 *   - 有 attachments：[{type:'text', text}, {type:'image', source:{type:'base64', media_type, data}}, ...]
 *   att 形态: { mime:'image/png', data:'<base64>', name? }
 */
function formatUserContent(prompt, attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return prompt;
  const blocks = [];
  if (typeof prompt === 'string' && prompt) blocks.push({ type: 'text', text: prompt });
  else if (Array.isArray(prompt)) blocks.push(...prompt);
  for (const a of attachments) {
    if (!a || !a.mime || !a.data) continue;
    blocks.push({ type: 'image', source: { type: 'base64', media_type: a.mime, data: a.data } });
  }
  return blocks;
}

// ============================================================
// QwenSessionManager — 会话池
// ============================================================
class QwenSessionManager {
  /**
   * @param {object} opts
   * @param {string} [opts.modelId] ACMS llm_models id（默认取 default_gen_model）
   * @param {number} [opts.maxSessions] 最大并发会话数（默认 4）
   * @param {number} [opts.idleTimeoutMs] 空闲回收（默认 30min）
   * @param {function} [opts.onApproval] 审批回调
   * @param {function} [opts.onEvent] 事件回调
   */
  constructor(opts = {}) {
    this.maxSessions = opts.maxSessions || 4;
    this.idleTimeoutMs = opts.idleTimeoutMs || 30 * 60 * 1000;
    this.onApproval = opts.onApproval || null;
    this.onEvent = opts.onEvent || null;
    this.sessions = new Map(); // key: userId → QwenSession
    this._creating = new Map(); // 🆕 修复（2026-08-23）：创建锁 —— key: userId → Promise（防并发双 spawn）
    this._idleTimer = setInterval(() => this._reapIdle(), 60 * 1000);
    this._idleTimer.unref?.();
  }

  async _resolveModel(modelId) {
    const modelStore = require('../stores/model-store');
    const model = modelId ? modelStore.getById(modelId) : null;
    if (model) return model;

    // fallback: default_gen_model
    try {
      const { collection } = require('../db/connection');
      const sysConfigs = collection('system_configs');
      const cfg = sysConfigs.findOne((c) => c.key === 'default_gen_model');
      if (cfg && cfg.value) {
        const m = modelStore.getById(cfg.value);
        if (m) return m;
      }
    } catch (e) { debug('读取 default_gen_model 失败:', e.message); }

    // 最后 fallback：第一个 active 模型
    const models = modelStore.list().filter((m) => m.status === 'active');
    return models[0] || null;
  }

  _modelToAuthType(model) {
    const api = (model.api || '').toLowerCase();
    const base = (model.baseUrl || '').toLowerCase();
    if (api.includes('anthropic') || base.includes('minimax') && base.includes('anthropic')) return 'anthropic';
    if (api.includes('gemini')) return 'gemini';
    return 'openai';
  }

// 🆕 v0.115b：按 sessionId 查找会话（审批决策"全部允许"时把工具加入会话自动放行集合）
  findSessionBySessionId(sessionId) {
    if (!sessionId) return null;
    for (const sess of this.sessions.values()) {
      if (sess.sessionId === sessionId) return sess;
    }
    return null;
  }

  // 🆕 v0.119：按 userId 查找会话（不创建，纯查）
  //   interrupt/continue 专用 —— 不应该因为"找不到就建一个空 session"导致副作用
  //   返回 null 让上层决定如何 fallback（前端弹"session 已过期"提示）
  findSession(userId) {
    if (!userId) return null;
    const sess = this.sessions.get(userId);
    if (!sess) return null;
    // 已关闭的会话也不算（exitCode 非空说明进程已死）
    if (sess.closed || (sess.child && sess.child.exitCode !== null)) return null;
    return sess;
  }

  /**
   * 获取（或创建）用户会话
   */
  async getSession(userId, opts = {}) {
    // 🆕 修复（2026-08-23）：创建锁 —— 同一 userId 并发请求时只允许一个创建流程
    //   否则两个请求同时发现 sessions 无此 userId → 各自 spawn CLI（双进程、同 session 双写 stdin）
    //   实测：02:36:46/47 两个 Qwen CLI 进程同 session-id 4043f398（v0.114n 测试时）
    if (this._creating.has(userId)) {
      debug(`getSession 等待创建锁 ${userId}`);
      return this._creating.get(userId);
    }

    let session = this.sessions.get(userId);
    if (session && session.ready && session.child && session.child.exitCode === null) {
      // 🆕 修复（2026-08-23）：cwd 变化 → 重建会话（workspace 映射跨项目切换）
      //   同一 userId 先在项目 A 聊（cwd=workspaces/A），切到项目 B 后 cwd 变了，
      //   如果复用旧会话，Qwen 还在 A 目录干活 → 文件改错项目。
      //   会话 cwd 不同 → close 旧会话重建（下次 getSession 建新 CLI）。
      if (opts.cwd && session.cwd && session.cwd !== opts.cwd) {
        debug(`会话 cwd 变化 ${session.cwd.slice(-40)} → ${opts.cwd.slice(-40)}，重建`);
        try { session.close(); } catch (e) { /* ignore */ }
        this.sessions.delete(userId);
      } else {
        return session;
      }
    }
    if (session) { try { session.close(); } catch (e) { /* ignore */ } this.sessions.delete(userId); }

    const creatingPromise = (async () => {
      // 并发上限
      if (this.sessions.size >= this.maxSessions) {
        // 淘汰最久未活动
        let oldestKey = null, oldestAt = Infinity;
        for (const [k, s] of this.sessions) {
          if (s.lastActivityAt < oldestAt) { oldestAt = s.lastActivityAt; oldestKey = k; }
        }
        if (oldestKey) {
          debug(`会话池满(${this.maxSessions})，淘汰 ${oldestKey}`);
          try { this.sessions.get(oldestKey).close(); } catch (e) { /* ignore */ }
          this.sessions.delete(oldestKey);
        }
      }

      const model = await this._resolveModel(opts.modelId);
      if (!model) throw new Error('没有可用模型（llm_models 为空或无 active）');

      const cwd = opts.cwd || path.join(process.env.ACMS_DATA_DIR || path.join(__dirname, '..', 'data'), 'qwen-workspace', userId || 'default');
      fs.mkdirSync(cwd, { recursive: true });

      const modelStore = require('../stores/model-store');
      const apiKey = modelStore.getDecryptedKey(model.id);
      if (!apiKey) throw new Error(`模型 ${model.name} 未配置 API Key`);

      session = new QwenSession({
        model: model.model,
        authType: this._modelToAuthType(model),
        baseUrl: model.baseUrl,
        apiKey,
        cwd,
        sessionId: opts.sessionId,
        onApproval: this.onApproval || (async () => true),
        onEvent: this.onEvent || null,
        // B6: 人设注入（透传）
        systemPrompt: opts.systemPrompt || undefined,
        appendSystemPrompt: opts.appendSystemPrompt || undefined,
      });
      await session.start();
      this.sessions.set(userId, session);
      return session;
    })();

    this._creating.set(userId, creatingPromise);
    try {
      return await creatingPromise;
    } finally {
      this._creating.delete(userId);
    }
  }

  /**
   * 用户对话入口：保证会话存在并发送消息
   */
  async ask(userId, prompt, opts = {}) {
    const session = await this.getSession(userId, opts);
    return session.ask(prompt, opts);
  }

  async release(userId) {
    const session = this.sessions.get(userId);
    if (session) {
      session.close();
      this.sessions.delete(userId);
    }
  }

  _reapIdle() {
    const now = Date.now();
    for (const [userId, session] of this.sessions) {
      // 进行中的 ask 不回收（LLM 长上下文响应可能 >1min）
      if (session._inFlight) continue;
      if (now - session.lastActivityAt > this.idleTimeoutMs) {
        debug(`空闲回收会话 ${userId} (${(now - session.lastActivityAt) / 60000 | 0}min 无活动)`);
        session.close();
        this.sessions.delete(userId);
      }
    }
  }

  shutdown() {
    clearInterval(this._idleTimer);
    for (const [userId, session] of this.sessions) {
      session.close();
    }
    this.sessions.clear();
  }

  getStats() {
    const stats = {};
    for (const [userId, session] of this.sessions) {
      stats[userId] = session.getStats();
    }
    return { active: this.sessions.size, max: this.maxSessions, sessions: stats };
  }
}

module.exports = { QwenSession, QwenSessionManager, findCliPath };
