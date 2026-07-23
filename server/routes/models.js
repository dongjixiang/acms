// 大模型管理 API — 含能力标注
const express = require('express');
const router = express.Router();
const modelStore = require('../stores/model-store');
const eventBus = require('../services/event-bus');

const ALL_CAPABILITIES = ['text', 'vision', 'json-mode', 'extended-thinking', 'audio-input', 'function-calling'];

router.get('/', (req, res) => res.json(modelStore.list()));
router.get('/active', (req, res) => res.json(modelStore.getActive()));

// 按能力查找活跃模型
router.get('/by-capability/:cap', (req, res) => {
  if (!ALL_CAPABILITIES.includes(req.params.cap)) {
    return res.status(400).json({ error: 'INVALID_CAPABILITY', validValues: ALL_CAPABILITIES });
  }
  res.json(modelStore.getActiveWithCapability(req.params.cap));
});

router.post('/', (req, res, next) => {
  try {
    const { name, provider, model, baseUrl, apiKey, systemPrompt, api, capabilities } = req.body;
    if (!name || !provider || !model) return res.status(400).json({ error: 'MISSING_FIELDS' });
    if (capabilities && !Array.isArray(capabilities)) return res.status(400).json({ error: 'capabilities 必须是数组' });
    var created = modelStore.create({ name, provider, model, baseUrl, apiKey, systemPrompt, api, capabilities });
    eventBus.emit('model.updated', { actor: { id: 'admin', type: 'human' }, target: { type: 'model', id: created.id }, payload: { action: 'created' } });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const updates = { ...req.body };
    delete updates.id; delete updates.created_at;
    if (updates.capabilities && !Array.isArray(updates.capabilities)) {
      return res.status(400).json({ error: 'capabilities 必须是数组' });
    }
    const updated = modelStore.update(req.params.id, updates);
    if (!updated) return res.status(404).json({ error: 'MODEL_NOT_FOUND' });
    console.log('[models] PATCH 成功，准备 emit');
    await eventBus.emit('model.updated', { actor: { id: 'admin', type: 'human' }, target: { type: 'model', id: req.params.id }, payload: { model: updated } });
    console.error('[models] emit 完成, wsClients:', eventBus._wsClients ? eventBus._wsClients.size : 0);
    res.json(updated);
  } catch (e) { next(e); }
});

router.delete('/:id', (req, res) => {
  modelStore.remove(req.params.id);
  eventBus.emit('model.updated', { actor: { id: 'admin', type: 'human' }, target: { type: 'model', id: req.params.id }, payload: { action: 'deleted' } });
  res.json({ success: true });
});

// 返回所有可用能力列表（供前端展示）
router.get('/capabilities/list', (req, res) => {
  res.json(ALL_CAPABILITIES.map(c => ({ id: c, label: {
    'text': '文本生成',
    'vision': '视觉理解',
    'json-mode': '结构化输出',
    'extended-thinking': '扩展思考',
    'audio-input': '音频理解',
    'function-calling': '工具调用',
  }[c] || c })));
});

module.exports = router;
