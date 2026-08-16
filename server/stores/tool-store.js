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
    // 级联：从所有 agent 的 bound_tools 里移除该工具（实际绑定存在 agents.bound_tools JSON）
    // 注意：agent_tools 表是非 doc 结构（id, agent_id, tool_id, params_schema），
    //       collection('agent_tools').remove() 会假定 doc 列 → no such column: doc（P 陷阱）
    try {
      const agents = collection('agents').all();
      for (const a of agents) {
        const tools = JSON.parse(a.bound_tools || '[]');
        const next = tools.filter(t => t.id !== id);
        if (next.length !== tools.length) {
          collection('agents').update(x => x.id === a.id, { bound_tools: JSON.stringify(next) });
        }
      }
    } catch (e) { console.error('[tool-store] cascade unbind failed:', e.message); }
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
