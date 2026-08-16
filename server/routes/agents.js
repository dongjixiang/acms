// Agent 管理 API
// GET/POST /api/agents — 列表/新建
// GET/PUT/DELETE /api/agents/:id — 详情/更新/删除
// GET /api/agents/:id/tools — 已绑定工具
// POST /api/agents/:id/tools — 绑定工具
// DELETE /api/agents/:id/tools/:toolId — 解绑工具
// POST /api/agents/:id/call — 测试委托调用
// GET /api/agent-calls — 调用日志
// GET/POST /api/tools — 工具 CRUD

const express = require('express');
const router = express.Router();
const { collection } = require('../db/connection');
const agentStore = require('../stores/agent-store');
const toolStore = require('../stores/tool-store');
const registry = require('../agents/registry');
const caller = require('../agents/caller');

// ── Agent CRUD ─────────────────────────────────────────
// 注意：此 router 挂载在 /api/agents，所以路径不包含 /agents 前缀

/** GET /api/agents */
router.get('/', function (req, res) {
  const agents = agentStore.list();
  // 关联 tool 名称
  const tools = toolStore.list();
  const toolMap = new Map(tools.map(t => [t.id, t.name]));
  res.json({
    ok: true,
    agents: agents.map(a => ({
      ...a,
      boundTools: JSON.parse(a.bound_tools || '[]').map(tid => ({
        id: tid,
        name: toolMap.get(tid) || tid
      }))
    }))
  });
});

/** POST /api/agents */
router.post('/', function (req, res) {
  const { id, name, role, domain, modelId, systemPrompt, allowedToCall } = req.body;
  if (!id || !name) return res.json({ ok: false, error: 'id 和 name 必填' });

  const agent = agentStore.register({
    id, name, role: role || 'worker', domain: domain || 'general',
    modelId: modelId || '', systemPrompt: systemPrompt || '',
    allowedToCall: allowedToCall || []
  });
  res.json({ ok: true, agent });
});

/** GET /api/agents/:id */
router.get('/:id', function (req, res) {
  const agent = agentStore.getById(req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: 'Agent 不存在' });
  res.json({ ok: true, agent });
});

/** PUT /api/agents/:id */
router.put('/:id', function (req, res) {
  const agent = agentStore.getById(req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: 'Agent 不存在' });

  const { name, role, domain, modelId, systemPrompt, allowedToCall, status } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (role !== undefined) updates.role = role;
  if (domain !== undefined) updates.domain = domain;
  if (modelId !== undefined) updates.model_id = modelId;
  if (systemPrompt !== undefined) updates.system_prompt = systemPrompt;
  if (allowedToCall !== undefined) updates.allowed_to_call = JSON.stringify(allowedToCall);
  if (status !== undefined) updates.status = status;

  agentStore.update(req.params.id, updates);
  res.json({ ok: true, agent: agentStore.getById(req.params.id) });
});

/** DELETE /api/agents/:id */
router.delete('/:id', function (req, res) {
  const ok = agentStore.remove(req.params.id);
  res.json({ ok, deleted: ok });
});

// ── Tool CRUD (挂载在 /api/agents，路径为 /tools/*) ───────────────────────────

/** GET /api/tools */
router.get('/tools', function (req, res) {
  const tools = toolStore.list({ category: req.query.category });
  res.json({ ok: true, tools });
});

/** POST /api/tools */
router.post('/tools', function (req, res) {
  const { id, name, description, category, handlerPath, paramsSchema } = req.body;
  if (!id || !name) return res.json({ ok: false, error: 'id 和 name 必填' });
  const tool = toolStore.register({ id, name, description, category, handlerPath, paramsSchema });
  res.json({ ok: true, tool });
});

/** PUT /api/tools/:id */
router.put('/tools/:id', function (req, res) {
  const tool = toolStore.update(req.params.id, req.body);
  if (!tool) return res.status(404).json({ ok: false, error: '工具不存在' });
  res.json({ ok: true, tool });
});

/** DELETE /api/tools/:id */
router.delete('/tools/:id', function (req, res) {
  const ok = toolStore.delete(req.params.id);
  res.json({ ok, deleted: ok });
});

// ── Agent-Tool 映射 ─────────────────────────────────────

/** GET /api/agents/:id/tools */
router.get('/:id/tools', function (req, res) {
  const agent = agentStore.getById(req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: 'Agent 不存在' });

  const boundTools = JSON.parse(agent.bound_tools || '[]');
  const tools = toolStore.getByIds(boundTools);
  res.json({ ok: true, tools });
});

/** POST /api/agents/:id/tools */
router.post('/:id/tools', function (req, res) {
  const { toolId, paramsSchema } = req.body;
  if (!toolId) return res.json({ ok: false, error: 'toolId 必填' });

  const tool = toolStore.getById(toolId);
  if (!tool) return res.status(404).json({ ok: false, error: '工具不存在' });

  agentStore.addTool(req.params.id, toolId, paramsSchema || {});
  res.json({ ok: true });
});

/** DELETE /api/agents/:id/tools/:toolId */
router.delete('/:id/tools/:toolId', function (req, res) {
  agentStore.removeTool(req.params.id, req.params.toolId);
  res.json({ ok: true });
});

// ── 委托调用测试 ────────────────────────────────────────

/** POST /api/agents/:id/call */
router.post('/:id/call', async function (req, res) {
  const { toAgentId, instruction, context } = req.body;
  if (!toAgentId || !instruction) {
    return res.json({ ok: false, error: 'toAgentId 和 instruction 必填' });
  }

  try {
    // 设置调用上下文
    caller.setCurrentAgent(req.params.id);
    // 使用 caller 进行委托调用（内部会处理 domain 查找和权限检查）
    const result = await caller.call(toAgentId, { instruction, context }, { calledBy: [req.params.id] });
    res.json({ ok: true, result });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── 调用日志 ────────────────────────────────────────────

/** GET /api/agent-calls */
router.get('/calls', function (req, res) {
  const { limit = 50, fromAgent, toAgent } = req.query;
  const all = collection('agent_calls').all().reverse();
  let calls = all;
  if (fromAgent) calls = calls.filter(c => c.fromAgent === fromAgent);
  if (toAgent) calls = calls.filter(c => c.toAgent === toAgent);
  res.json({ ok: true, calls: calls.slice(0, parseInt(limit)) });
});

module.exports = router;
