// 需求变更 API
const express = require('express');
const router = express.Router();
const changeService = require('../services/change-service');

// 影响分析
router.post('/:id/change/analyze', (req, res, next) => {
  try {
    const analysis = changeService.analyzeImpact(req.params.id, req.body.description || '用户提出变更');
    res.json(analysis);
  } catch (e) { next(e); }
});

// 确认变更
router.post('/:id/change/confirm', (req, res, next) => {
  try {
    const result = changeService.confirmChange(req.params.id, req.body);
    res.json(result);
  } catch (e) { next(e); }
});

// 取消变更
router.post('/:id/change/cancel', (req, res, next) => {
  try {
    const result = changeService.cancelChange(req.params.id);
    res.json(result);
  } catch (e) { next(e); }
});

module.exports = router;
