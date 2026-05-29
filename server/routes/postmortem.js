// Post-Mortem 分析 API
const express = require('express');
const router = express.Router();
const pmService = require('../services/postmortem-service');

/** GET /api/postmortem/:projectId — 分析项目质量 */
router.get('/:projectId', (req, res) => {
  try {
    const report = pmService.analyze(req.params.projectId);
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: 'ANALYSIS_FAILED', message: e.message });
  }
});

module.exports = router;
