// Agent 工具注册表
// 工具是 Agent 可调用的能力单元（生图/搜索/格式化等）
const { collection } = require('../db/connection');

class ToolStore {
  /** 注册一个新工具 */
  register({ id, name, description, category = 'general', handlerPath, paramsSchema = [] }) {
    const doc = {
      id, name, description, category, handlerPath, paramsSchema,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    collection('tools').insert(doc);
    return doc;
  }

  /** 更新工具 */
  update(id, updates) {
    const doc = collection('tools').findOne(t => t.id === id);
    if (!doc) return null;
    Object.assign(doc, updates, { updated_at: new Date().toISOString() });
    collection('tools').update(t => t.id === id, doc);
    return doc;
  }

  /** 删除工具 */
  delete(id) {
    // 同时清掉 agent_tools 里的映射
    collection('agent_tools').remove(at => at.tool_id === id);
    return collection('tools').remove(t => t.id === id) > 0;
  }

  /** 获取所有工具 */
  list({ category } = {}) {
    let tools = collection('tools').all();
    if (category) tools = tools.filter(t => t.category === category);
    return tools;
  }

  /** 按 id 获取 */
  getById(id) { return collection('tools').findOne(t => t.id === id) || null; }

  /** 批量获取 */
  getByIds(ids) {
    return ids.map(id => this.getById(id)).filter(Boolean);
  }

  /** 给 Agent 绑定工具 */
  addTool(agentId, toolId, paramsSchema = {}) {
    const agent = collection('agents').findOne(a => a.id === agentId);
    if (!agent) return false;
    const tools = JSON.parse(agent.bound_tools || '[]');
    if (tools.find(t => t.id === toolId)) return true;
    tools.push({ id: toolId, params: paramsSchema });
    agent.bound_tools = JSON.stringify(tools);
    collection('agents').update(a => a.id === agentId, agent);
    return true;
  }
}

module.exports = new ToolStore();
