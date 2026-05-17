// 大模型管理 API
const express = require('express');
const router = express.Router();
const modelStore = require('../stores/model-store');

router.get('/', (req, res) => res.json(modelStore.list()));
router.get('/active', (req, res) => res.json(modelStore.getActive()));

router.post('/', (req, res, next) => {
  try {
    const { name, provider, model, baseUrl, apiKey, systemPrompt } = req.body;
    if (!name || !provider || !model) return res.status(400).json({ error: 'MISSING_FIELDS' });
    res.status(201).json(modelStore.create({ name, provider, model, baseUrl, apiKey, systemPrompt }));
  } catch (e) { next(e); }
});

router.patch('/:id', (req, res, next) => {
  try {
    const updates = { ...req.body };
    // 不更新 id, created_at
    delete updates.id; delete updates.created_at;
    const updated = modelStore.update(req.params.id, updates);
    if (!updated) return res.status(404).json({ error: 'MODEL_NOT_FOUND' });
    res.json({ ...updated, apiKey: '***' });
  } catch (e) { next(e); }
});

router.delete('/:id', (req, res) => {
  modelStore.remove(req.params.id);
  res.json({ success: true });
});

module.exports = router;
