// ACMS 浏览器智能体 — 会话存储（v1.0，多轮上下文）
// ============================================================
// 内存会话表：sessionId → {messages[], title, createdAt, updatedAt, status, pendingQuestion}
// 重启丢失可接受（与 TASKS 内存表一致；持久化按需加 SQLite）
//
// 设计：
//   - sessionId 由前端生成（短随机），不需要服务端分配
//   - messages 累积：每次 runSessionTurn push user msg + 完成后 push assistant
//   - waiting_user 状态保留 messages + question，用户回复后 resume

class SessionStore {
  constructor() {
    this.sessions = new Map(); // sessionId -> session
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
        messages: [], // [{role, content, ts?}] 累积的对话
        toolCalls: [], // [{round, toolNames, message, ts}] 每轮工具调用记录（前端步骤摘要用）
        status: 'idle', // idle | running | waiting_user | done | error
        pendingQuestion: null,
        currentTaskId: null,
        createdAt: now,
        updatedAt: now,
      };
      this.sessions.set(sessionId, s);
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
    return s;
  }

  /**
   * 追加工具调用记录（前端步骤卡用）
   */
  addToolCall(sessionId, step) {
    const s = this.getOrCreate(sessionId);
    s.toolCalls.push(step);
    s.updatedAt = Date.now();
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
    return s;
  }

  /**
   * 设置标题
   */
  setTitle(sessionId, title) {
    const s = this.getOrCreate(sessionId);
    s.title = title || s.title;
    s.updatedAt = Date.now();
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
   * 删会话
   */
  delete(sessionId) {
    return this.sessions.delete(sessionId);
  }
}

module.exports = new SessionStore();