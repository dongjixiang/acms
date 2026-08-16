// Tools 管理 API (独立路由)
const express = require('express');
const router = express.Router();
const toolStore = require('../stores/tool-store');

/** GET /api/tools */
router.get('/', function (req, res) {
  const tools = toolStore.list({ category: req.query.category });
  res.json({ ok: true, tools });
});

/** POST /api/tools */
router.post('/', function (req, res) {
  const { id, name, description, category, handlerPath, paramsSchema } = req.body;
  if (!id || !name) return res.json({ ok: false, error: 'id 和 name 必填' });
  const tool = toolStore.register({ id, name, description, category, handlerPath, paramsSchema });
  res.json({ ok: true, tool });
});

/** PUT /api/tools/:id */
router.put('/:id', function (req, res) {
  const tool = toolStore.update(req.params.id, req.body);
  if (!tool) return res.status(404).json({ ok: false, error: '工具不存在' });
  res.json({ ok: true, tool });
});

/** DELETE /api/tools/:id */
router.delete('/:id', function (req, res) {
  const ok = toolStore.delete(req.params.id);
  res.json({ ok, deleted: ok });
});

module.exports = router;
