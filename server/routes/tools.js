// Tools 管理 API (独立路由)
const express = require('express');
const router = express.Router();
const toolStore = require('../stores/tool-store');

/** GET /api/tools */
router.get('/', function (req, res) {
  const tools = toolStore.list({ category: req.query.category });
  res.json({ ok: true, tools });
});

/** GET /api/tools/runtime — 全量运行时工具（tool-registry 内存注册，LLM 实际可用）
 *  注意：必须注册在 /:id 之前（P105 参数化路由吞静态路径） */
router.get('/runtime', function (req, res) {
  try {
    // 触发全部工具注册（web/agent/git/ssh/db/office...），再列出
    require('../tools/index');
    const tr = require('../services/tool-registry');
    const all = tr.listTools();
    const tools = all.map(t => {
      // 用 pool 元数据补全分类（listTools 返回对象无 pool，需查 POOL_DEFAULTS）
      let pool = null;
      try { pool = tr.getToolPool(t.name); } catch (e) {}
      return {
        id: t.name,
        name: t.name,
        description: t.description || '',
        category: (pool && pool.domain) || (t.pool && t.pool.domain) || 'general',
        risk: (pool && pool.risk) || (t.pool && t.pool.risk) || '',
        hasHandler: typeof t.handler === 'function'
      };
    });
    res.json({ ok: true, count: tools.length, tools });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
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
