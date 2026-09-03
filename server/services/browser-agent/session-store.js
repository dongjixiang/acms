// ACMS 浏览器智能体 — 会话存储（v1.0 + v1.1 多轮上下文 + JSON 落盘）
// ============================================================
// 内存会话表：sessionId → {messages[], title, createdAt, updatedAt, status, pendingQuestion}
// 🆕 v1.1：落盘到 data/browser-sessions.json（重启不丢，根治"历史会话打不开"）
//   - 启动时从文件 load（兼容老文件缺失）
//   - 每次 mutation（addMessage/addToolCall/setStatus/setTitle/delete）同步写盘
//   - writeFileSync（避免异步竞态，简单可靠）
//
// 设计：
//   - sessionId 由前端生成（短随机），不需要服务端分配
//   - messages 累积：每次 runSessionTurn push user msg + 完成后 push assistant
//   - waiting_user 状态保留 messages + question，用户回复后 resume
//   - 持久化粒度：每次 mutation 写整文件（sessions 通常 < 100，单文件 < 1MB，性能 OK）

const fs = require('fs');
const path = require('path');

// 持久化路径：data/browser-sessions.json（与 geo/ email-rule 等同级）
const DATA_DIR = path.resolve(__dirname, '../../../data');
const SESSIONS_FILE = path.join(DATA_DIR, 'browser-sessions.json');

class SessionStore {
  constructor() {
    this.sessions = new Map(); // sessionId -> session
    this._writeTimer = null;  // 防抖写盘（合并短时间内多次 mutation）
    this._loadFromDisk();
  }

  // 启动时从文件加载
  _loadFromDisk() {
    try {
      if (!fs.existsSync(SESSIONS_FILE)) return; // 文件不存在 = 首次启动，OK
      const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
      if (!raw.trim()) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      for (const s of arr) {
        if (s && s.id) {
          // 防御：保证必要字段存在
          s.messages = Array.isArray(s.messages) ? s.messages : [];
          s.toolCalls = Array.isArray(s.toolCalls) ? s.toolCalls : [];
          s.status = s.status || 'idle';
          this.sessions.set(s.id, s);
        }
      }
      console.log(`[session-store] 从 ${SESSIONS_FILE} 加载了 ${this.sessions.size} 个会话`);
    } catch (e) {
      console.error('[session-store] 加载会话文件失败：', e.message);
      // 加载失败不阻塞启动（空 Map 继续）
    }
  }

  // 防抖写盘（200ms 合并多次 mutation，避免高频写）
  _scheduleFlush() {
    if (this._writeTimer) return;
    this._writeTimer = setTimeout(() => {
      this._writeTimer = null;
      this._flushToDisk();
    }, 200);
  }

  // 立即同步写盘（用于 delete / 进程退出前等关键场景）
  _flushToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const arr = [...this.sessions.values()];
      // 原子写：先写 .tmp 再 rename（避免写入中途崩溃导致文件损坏）
      const tmp = SESSIONS_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(arr, null, 2), 'utf8');
      fs.renameSync(tmp, SESSIONS_FILE);
    } catch (e) {
      console.error('[session-store] 写盘失败：', e.message);
    }
  }

  /**
   * 创建或获取会话（幂等）
   */
  getOrCreate(sessionId, opts = {}) {
    let s = this.sessions.get(sessionId);
    if (!s) {
      const now = Date.now();
      s = {
        id: sessionId,
        title: opts.title || '新会话',
        messages: [],
        toolCalls: [],
        status: 'idle',
        pendingQuestion: null,
        currentTaskId: null,
        createdAt: now,
        updatedAt: now,
      };
      this.sessions.set(sessionId, s);
      this._scheduleFlush();
    }
    return s;
  }

  /**
   * 追加消息
   */
  addMessage(sessionId, msg) {
    const s = this.getOrCreate(sessionId);
    s.messages.push(msg);
    s.updatedAt = Date.now();
    this._scheduleFlush();
    return s;
  }

  /**
   * 追加工具调用记录
   */
  addToolCall(sessionId, step) {
    const s = this.getOrCreate(sessionId);
    s.toolCalls.push(step);
    s.updatedAt = Date.now();
    this._scheduleFlush();
  }

  /**
   * 设置状态
   */
  setStatus(sessionId, status, extra = {}) {
    const s = this.getOrCreate(sessionId);
    s.status = status;
    if (extra.question !== undefined) s.pendingQuestion = extra.question;
    if (extra.taskId !== undefined) s.currentTaskId = extra.taskId;
    if (extra.messages !== undefined) s.messages = extra.messages;
    s.updatedAt = Date.now();
    this._scheduleFlush();
    return s;
  }

  /**
   * 设置标题
   */
  setTitle(sessionId, title) {
    const s = this.getOrCreate(sessionId);
    s.title = title || s.title;
    s.updatedAt = Date.now();
    this._scheduleFlush();
    return s;
  }

  /**
   * 取会话
   */
  get(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * 列会话（按 updatedAt 倒序）
   */
  list() {
    return [...this.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * 删会话（立即同步写盘）
   */
  delete(sessionId) {
    const r = this.sessions.delete(sessionId);
    if (r) this._flushToDisk(); // 删会话用同步写（重要操作）
    return r;
  }
}

const instance = new SessionStore();

// 进程退出前最后一次 flush（防止 setTimeout 防抖中的写丢失）
process.on('exit', () => { try { instance._flushToDisk(); } catch (e) {} });
process.on('SIGINT', () => { try { instance._flushToDisk(); } catch (e) {} process.exit(0); });
process.on('SIGTERM', () => { try { instance._flushToDisk(); } catch (e) {} process.exit(0); });

module.exports = instance;
