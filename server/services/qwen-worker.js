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
    this.lastActivityAt = Date.now();
    this.turnCount = 0;
    this.approvalCount = 0;
    this._inFlight = false;  // ask 进行中（防空闲回收误杀）
    this.events = [];   // 事件流缓冲（trace）
    this.lastResult = null;
    this._initTimeout = null;
  }

  // ---------- 生命周期 ----------
  async start() {
    if (!this.cliPath) throw new Error('Qwen Code CLI 未找到。请先在 ACMS server 目录执行 npm install @qwen-code/qwen-code');
    if (!this.apiKey) throw new Error('Qwen Session: apiKey 为空');

    const env = { ...process.env };
    // B5: 限制子进程堆内存（120 低内存服务器防 OOM；CLI bundle 256MB 足够）
    env.NODE_OPTIONS = process.env.NODE_OPTIONS || '--max-old-space-size=256';
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
    if (this.enableMcp) {
      const mcpServerPath = path.join(__dirname, 'acms-mcp-server.js');
      if (fs.existsSync(mcpServerPath)) {
        const mcpConfig = JSON.stringify({
          mcpServers: {
            acms: { command: process.execPath, args: ['--max-old-space-size=128', mcpServerPath] },
          },
        });
        args.push('--mcp-config', mcpConfig);
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
      if (s && !s.includes('DEBUG')) debug('cli-stderr:', s.slice(0, 300));
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
        r({ type: 'result', subtype: 'cli_exit', is_error: true, error: { message: `CLI exited with code ${code}` } });
      }
    });

    // 握手：发 initialize 等 ACK
    await new Promise((resolve, reject) => {
      this._handshakeResolve = resolve;
      this._handshakeReject = reject;
      this._initTimeout = setTimeout(() => reject(new Error('Qwen 握手超时 (15s)')), 15000);
      this._sendControl({ subtype: 'initialize', hooks: null, mcpServers: null, sdkMcpServers: null, agents: null });
    });

    this.ready = true;
    log(`会话就绪 ${this.sessionId.slice(0, 8)} (model=${this.model}, auth=${this.authType})`);
    return this;
  }

  // ---------- 消息 ----------
  async ask(prompt, opts = {}) {
    if (!this.ready || !this.child || this.child.exitCode !== null) {
      throw new Error('Qwen 会话未就绪或已退出');
    }
    this.lastActivityAt = Date.now();
    this.turnCount++;
    this._inFlight = true;
    this._onDelta = opts.onDelta || null;  // B7: 真流式回调（text_delta 实时）

    const resultPromise = new Promise((resolve) => { this._pendingResolve = resolve; });
    this.child.stdin.write(JSON.stringify({
      type: 'user',
      message: { role: 'user', content: prompt },
      session_id: this.sessionId,
      parent_tool_use_id: null,
    }) + '\n');

    // 超时保护
    const timeoutMs = opts.timeoutMs || 10 * 60 * 1000;
    const timer = setTimeout(() => {
      if (this._pendingResolve) {
        const r = this._pendingResolve;
        this._pendingResolve = null;
        r({ type: 'result', subtype: 'timeout', is_error: true, error: { message: `ask 超时 (${timeoutMs / 1000}s)` } });
      }
    }, timeoutMs);

    const result = await resultPromise;
    clearTimeout(timer);
    this._inFlight = false;
    this._onDelta = null;
    this.lastResult = result;
    return result;
  }

  // ---------- 审批 ----------
  async _handleApproval(req, requestId) {
    this.approvalCount++;
    this.lastActivityAt = Date.now();

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
          try { this._onDelta(msg.event.delta.text || ''); } catch (e) { debug('onDelta 异常:', e.message); }
        }
        break;
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

  close() {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
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

  /**
   * 获取（或创建）用户会话
   */
  async getSession(userId, opts = {}) {
    let session = this.sessions.get(userId);
    if (session && session.ready && session.child && session.child.exitCode === null) {
      return session;
    }
    if (session) { try { session.close(); } catch (e) { /* ignore */ } this.sessions.delete(userId); }

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
