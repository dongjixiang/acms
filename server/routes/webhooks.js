// Webhook 订阅管理 API
const express = require('express');
const router = express.Router();

// webhookService 由 index.js 注入
let webhookService;

router.use((req, res, next) => {
  webhookService = req.app.get('webhookService');
  if (!webhookService) return res.status(500).json({ error: 'Webhook service not initialized' });
  next();
});

/** POST /api/webhooks — 创建订阅 */
router.post('/', (req, res) => {
  const { name, url, events, secret, description, active } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'MISSING_FIELDS', message: 'name 和 url 是必填项' });
  if (!events || events.length === 0) return res.status(400).json({ error: 'MISSING_EVENTS', message: '至少需要一个事件类型' });

  const sub = webhookService.create({ name, url, events, secret, description, active });
  if (sub.error) return res.status(400).json(sub);

  res.status(201).json({
    subscription: sub,
    webhookUrl: `/api/webhooks/receive/${sub.id}`,
    message: `Webhook 已创建。将 ${sub.url} 配置为接收 ${events.join(', ')} 事件。`,
  });
});

/** GET /api/webhooks — 列出所有订阅 */
router.get('/', (req, res) => {
  const { event, active } = req.query;
  const subs = webhookService.listSubscriptions({
    event: event || null,
    active: active !== undefined ? active === 'true' : undefined,
  });
  res.json(subs);
});

/** GET /api/webhooks/:id — 获取单个订阅 */
router.get('/:id', (req, res) => {
  const sub = webhookService.getById(req.params.id);
  if (!sub) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json(sub);
});

/** PATCH /api/webhooks/:id — 更新订阅 */
router.patch('/:id', (req, res) => {
  const { url, events, secret, description, active } = req.body;
  const updates = {};
  if (url !== undefined) updates.url = url;
  if (events !== undefined) updates.events = events;
  if (secret !== undefined) updates.secret = secret;
  if (description !== undefined) updates.description = description;
  if (active !== undefined) updates.active = active;

  const sub = webhookService.update(req.params.id, updates);
  if (sub.error) return res.status(400).json(sub);
  res.json(sub);
});

/** DELETE /api/webhooks/:id — 删除订阅 */
router.delete('/:id', (req, res) => {
  const result = webhookService.delete(req.params.id);
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

/** POST /api/webhooks/:id/test — 测试推送 */
router.post('/:id/test', async (req, res, next) => {
  try {
    const result = await webhookService.test(req.params.id);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
