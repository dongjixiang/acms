// Agent Registry — 按 domain 路由到对应 Agent
// 启动时扫描 server/agents/expert-*.js 自动注册
const agentStore = require('../stores/agent-store');
const caller = require('./caller');

class AgentRegistry {
  constructor() {
    this.handlers = new Map(); // id -> { agent, handler }
  }

  /** 启动时扫描并注册所有 expert-* 模块 */
  async scan() {
    const fs = require('fs');
    const path = require('path');
    const agentsDir = path.join(__dirname);

    for (const file of fs.readdirSync(agentsDir)) {
      if (!file.startsWith('expert-') || !file.endsWith('.js')) continue;
      try {
        const mod = require(path.join(agentsDir, file));
        if (mod.id && mod.handler) {
          this.register(mod);
          console.log(`[AgentRegistry] 已注册: ${mod.id} (${mod.name || mod.id})`);
        }
      } catch (e) {
        console.error(`[AgentRegistry] 加载 ${file} 失败:`, e.message);
      }
    }
  }

  /** 注册一个 Agent 模块 */
  register({ id, name, domain, handler, systemPrompt }) {
    this.handlers.set(id, { id, name, domain, handler, systemPrompt });
  }

  /** 根据 domain 找到对应的 Agent */
  resolve(domain) {
    // 1. 精确匹配 domain
    let agent = null;
    for (const [id, h] of this.handlers) {
      if (h.domain === domain) { agent = h; break; }
    }
    if (agent) return agent;

    // 2. 从 DB 找 domain 匹配的 online agent
    const dbAgents = agentStore.list({ status: 'online' });
    const matched = dbAgents.filter(a => a.domain === domain);
    if (matched.length > 0) {
      // 确保 handler 已注册
      const dbAgent = matched[0];
      if (!this.handlers.has(dbAgent.id)) {
        // 动态加载（后续可扩展为从 handlerPath 加载）
        console.warn(`[AgentRegistry] ${dbAgent.id} 在 DB 但无 handler，使用 fallback`);
      }
      return { id: dbAgent.id, name: dbAgent.name, domain: dbAgent.domain, handler: this.handlers.get(dbAgent.id)?.handler };
    }

    // 3. fallback 到 general
    return this.handlers.get('agent-general') || null;
  }

  /**
   * 分发指令到对应 Agent
   * @param {string} domain - 领域（word/sheet/image/search/general）
   * @param {string} instruction - 用户指令
   * @param {object} context - 文档上下文
   */
  async dispatch(domain, instruction, context = {}) {
    const agent = this.resolve(domain);
    if (!agent || !agent.handler) {
      throw new Error(`无可用 ${domain} Agent（已注册: ${[...this.handlers.keys()].join(', ')}`);
    }

    // 设置调用上下文
    caller.setCurrentAgent(agent.id);

    try {
      // 用 Agent 绑定的 model 执行
      const dbAgent = agentStore.getById(agent.id);
      const modelId = dbAgent?.model_id || null;

      const result = await agent.handler({
        instruction,
        context,
        modelId,
        caller,  // 注入 caller 供 Agent 内部委托其他 Agent
        agentId: agent.id
      });

      return result;
    } finally {
      caller.setCurrentAgent(null);
    }
  }

  /** 列出所有已注册 Agent */
  list() {
    return [...this.handlers.values()].map(({ id, name, domain }) => ({ id, name, domain }));
  }
}

module.exports = new AgentRegistry();
