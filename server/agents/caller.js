// Agent 间调用器
// 编排型 Agent 通过它委托任务给执行型 Agent
const { collection } = require('../db/connection');
const agentStore = require('../stores/agent-store');
const registry = require('./registry');

let currentAgentId = null; // 由 registry.dispatch 设置

function setCurrentAgent(id) { currentAgentId = id; }
function getCurrentAgent() { return currentAgentId; }

class AgentCaller {
  /**
   * 从 fromAgent 委托给 toAgent
   * @param {string} toAgentId - 目标 Agent id
   * @param {object} request - { instruction, context, ... }
   * @param {object} options - { maxDepth, calledBy[] }
   */
  async call(toAgentId, request, options = {}) {
    const fromId = currentAgentId;
    if (!fromId) throw new Error('调用上下文缺失：无当前 Agent');

    const toAgent = agentStore.getById(toAgentId);
    if (!toAgent) throw new Error(`Agent ${toAgentId} 不存在`);

    // 权限检查
    this.checkPermission(fromId, toAgentId);

    // 防循环调用（深度限制）
    const calledBy = options.calledBy || [];
    if (calledBy.includes(toAgentId)) {
      throw new Error(`循环调用检测: ${toAgentId} 已被调用过`);
    }
    if (calledBy.length >= (options.maxDepth || 5)) {
      throw new Error(`调用深度超限 (${options.maxDepth || 5})，可能产生循环委托`);
    }

    // 执行目标 Agent
    const start = Date.now();
    // 获取目标 agent 的 domain
    const toAgentInfo = agentStore.getById(toAgentId);
    const domain = toAgentInfo?.domain || 'general';
    console.log(`[Caller] dispatching to domain=${domain} (toAgentId=${toAgentId})`);
    console.log(`[Caller] registry.dispatch type:`, typeof registry.dispatch);
    const result = await registry.dispatch(domain, request.instruction, {
      ...request.context,
      __meta: {
        callId: this.genCallId(),
        fromAgent: fromId,
        calledBy: [...calledBy, fromId],
        purpose: request.purpose
      }
    });

    const latency = Date.now() - start;

    // 记录调用日志
    this.logCall({
      callId: this.lastCallId,
      fromAgent: fromId,
      toAgent: toAgentId,
      instruction: request.instruction?.slice(0, 200),
      purpose: request.purpose,
      result: { ok: result?.ok, error: result?.error },
      latency
    });

    return result;
  }

  checkPermission(fromId, toId) {
    const from = agentStore.getById(fromId);
    if (!from) return;

    // orchestrator 可以调任意 worker
    if (from.role === 'orchestrator') return;

    // worker 只能调 allowed_to_call 里的
    const allowed = JSON.parse(from.allowed_to_call || '[]');
    if (!allowed.includes(toId)) {
      throw new Error(`${from.name} 无权调用 ${toId}`);
    }
  }

  logCall(log) {
    try {
      collection('agent_calls').insert({
        ...log,
        created_at: new Date().toISOString()
      });
    } catch (e) {
      console.warn('[AgentCaller] 日志写入失败:', e.message);
    }
  }

  genCallId() {
    return 'call_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  get lastCallId() { return this._lastCallId; }
  set lastCallId(v) { this._lastCallId = v; }
}

module.exports = new AgentCaller();
module.exports.setCurrentAgent = setCurrentAgent;
module.exports.getCurrentAgent = getCurrentAgent;
