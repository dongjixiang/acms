// 澄清自我改进 API
const express = require('express');
const router = express.Router();
const improvement = require('../services/clarify-improvement-service');
const reqStore = require('../stores/requirement-store');

// 分析某次澄清会话
router.get('/analyze/:reqId', (req, res) => {
  try {
    const requirement = reqStore.getById(req.params.reqId);
    if (!requirement) return res.status(404).json({ error: 'REQUIREMENT_NOT_FOUND' });
    const clarifications = reqStore.getClarifications(req.params.reqId);
    const report = improvement.analyzeClarification(requirement, clarifications);
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: 'ANALYSIS_FAILED', message: e.message });
  }
});

// 应用改进到 Skill 文件
router.post('/apply-patch', (req, res) => {
  try {
    const { skillPatch } = req.body;
    if (!skillPatch) return res.status(400).json({ error: 'MISSING_PATCH' });
    const result = improvement.applySkillPatch(skillPatch);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'PATCH_FAILED', message: e.message });
  }
});

module.exports = router;
