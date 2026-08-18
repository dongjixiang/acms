// Agent 数据存储
const { collection } = require('../db/connection');

class AgentStore {
  /** 注册/更新 Agent */
  register({ id, name, role = 'worker', domain = 'general', modelId = '', systemPrompt = '', allowedToCall = [] }) {
    const now = new Date().toISOString();
    const existing = collection('agents').findOne(a => a.id === id);
    const doc = {
      id, name, role, domain, modelId, systemPrompt,
      allowed_to_call: JSON.stringify(allowedToCall),
      bound_tools: '[]',
      bound_skills: '[]',  // v0.110: Agent 绑定技能（B 方案，按 name 引用文件技能）
      status: 'online',
      registered_at: existing?.registered_at || now,
      last_seen_at: now
    };
    if (existing) {
      // 合并：保留旧字段，更新新字段
      Object.assign(existing, doc);
      collection('agents').update(a => a.id === id, existing);
    } else {
      collection('agents').insert(doc);
    }
    return this.getById(id);
  }

  /** 更新 Agent 字段 */
  update(id, updates) {
    const agent = this.getById(id);
    if (!agent) return null;
    if (updates.allowedToCall !== undefined) updates.allowed_to_call = JSON.stringify(updates.allowedToCall);
    if (updates.boundTools !== undefined) updates.bound_tools = JSON.stringify(updates.boundTools);
    if (updates.boundSkills !== undefined) updates.bound_skills = JSON.stringify(updates.boundSkills);  // v0.110
    Object.assign(agent, updates, { last_seen_at: new Date().toISOString() });
    collection('agents').update(a => a.id === id, agent);
    return agent;
  }

  /** 删除 Agent */
  remove(id) {
    return collection('agents').remove(a => a.id === id) > 0;
  }

  getById(id) { return collection('agents').findOne(a => a.id === id) || null; }

  list({ status, role, domain } = {}) {
    let agents = collection('agents').all();
    if (status) agents = agents.filter(a => a.status === status);
    if (role) agents = agents.filter(a => a.role === role);
    if (domain) agents = agents.filter(a => a.domain === domain);
    return agents.sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at));
  }

  /** 给 Agent 绑定工具 */
  addTool(agentId, toolId, paramsSchema = {}) {
    const agent = this.getById(agentId);
    if (!agent) return false;
    const tools = JSON.parse(agent.bound_tools || '[]');
    if (tools.find(t => t.id === toolId)) return true; // 已绑定
    tools.push({ id: toolId, params: paramsSchema });
    agent.bound_tools = JSON.stringify(tools);
    collection('agents').update(a => a.id === agentId, agent);
    return true;
  }

  /** 解绑工具 */
  removeTool(agentId, toolId) {
    const agent = this.getById(agentId);
    if (!agent) return false;
    const tools = (JSON.parse(agent.bound_tools || '[]')).filter(t => t.id !== toolId);
    agent.bound_tools = JSON.stringify(tools);
    collection('agents').update(a => a.id === agentId, agent);
    return true;
  }

  /** 绑定技能（v0.110，按 name 字符串引用文件技能） */
  addSkill(agentId, skillName) {
    const agent = this.getById(agentId);
    if (!agent) return false;
    const skills = JSON.parse(agent.bound_skills || '[]');
    if (skills.includes(skillName)) return true;  // 已绑定
    skills.push(skillName);
    agent.bound_skills = JSON.stringify(skills);
    collection('agents').update(a => a.id === agentId, agent);
    return true;
  }

  /** 解绑技能 */
  removeSkill(agentId, skillName) {
    const agent = this.getById(agentId);
    if (!agent) return false;
    const skills = (JSON.parse(agent.bound_skills || '[]')).filter(s => s !== skillName);
    agent.bound_skills = JSON.stringify(skills);
    collection('agents').update(a => a.id === agentId, agent);
    return true;
  }

  updateStatus(id, status) {
    return this.update(id, { status });
  }
}

module.exports = new AgentStore();
