// AI 澄清对话 API
const express = require('express');
const router = express.Router();
const aiClarify = require('../services/ai-clarify-service');

// 发起/继续澄清对话
router.post('/requirements/:id/clarify-ai', async (req, res, next) => {
  try {
    const { modelId, message, history } = req.body;
    if (!modelId) return res.status(400).json({ error: 'MISSING_MODEL', message: '请选择大模型' });
    const result = await aiClarify.clarify(req.params.id, modelId, message, history);
    res.json(result);
  } catch (e) { next(e); }
});

module.exports = router;
