// AI 澄清对话 API
const express = require('express');
const router = express.Router();
const aiClarify = require('../services/ai-clarify-service');
const domainDetect = require('../services/domain-detect');
const sketchGenerator = require('../services/prototype-sketch-generator');

// 发起/继续澄清对话
router.post('/requirements/:id/clarify-ai', async (req, res, next) => {
  try {
    const { modelId, message, history } = req.body;
    if (!modelId) return res.status(400).json({ error: 'MISSING_MODEL', message: '请选择大模型' });
    const result = await aiClarify.clarify(req.params.id, modelId, message, history);
    res.json(result);
  } catch (e) { next(e); }
});

// 生成原型界面/流程示意图（用户手动触发，可按反馈调整）
// 调整意见自动写入需求的澄清对话记录
router.post('/requirements/:id/prototype-sketches', async (req, res, next) => {
  try {
    const reqStore = require('../stores/requirement-store');
    const requirement = reqStore.getById(req.params.id);
    if (!requirement) return res.status(404).json({ error: '需求不存在' });

    const domain = domainDetect.detectDomain(requirement);
    if (domain !== 'prototype') {
      return res.json({ pages: [], message: '该需求不属于原型类需求，不生成界面示意图。', domain });
    }

    const adjustFeedback = req.body.feedback || '';
    const modelId = req.body.modelId || '';

    // 如果有反馈意见，先写入澄清对话记录
    if (adjustFeedback) {
      reqStore.addClarification(req.params.id, {
        role: 'user',
        content: '💬 界面线框图调整意见：' + adjustFeedback,
      });
    }

    const result = await sketchGenerator.generateSketches(req.params.id, adjustFeedback, modelId);

    // 如果是调整后的结果，将调整结果也写入澄清对话
    if (adjustFeedback && result.pages && result.pages.length > 0) {
      const pageList = result.pages.map(p => `📄 ${p.name}`).join('、');
      reqStore.addClarification(req.params.id, {
        role: 'agent',
        agentId: 'sketch-ai',
        content: `🎨 已根据您的意见调整界面线框图，当前包含 ${result.pages.length} 个页面：${pageList}。${
          result.flowDescription ? '操作流程：' + result.flowDescription : ''
        }`,
      });
    }

    // 如果有 SRS 更新（基于用户反馈），同步更新需求的 SRS 文档
    if (adjustFeedback && result.srsUpdates) {
      const currentSrs = (() => { try { return JSON.parse(requirement.srs || '{}'); } catch { return {}; } })();
      const updatedSrs = { ...currentSrs };
      if (result.srsUpdates.scopeIn) updatedSrs.scopeIn = result.srsUpdates.scopeIn;
      if (result.srsUpdates.acceptanceCriteria) updatedSrs.acceptanceCriteria = result.srsUpdates.acceptanceCriteria;
      if (result.srsUpdates.summary) updatedSrs.summary = result.srsUpdates.summary;
      reqStore.updateSrs(req.params.id, updatedSrs);

      // 同步重新生成需求 Wiki 文档
      try {
        const aiTools = require('../services/ai-tools-service');
        // 如果需求已有 wiki_path，使用上次生成时用的模型，否则用当前模型
        const docModelId = modelId || requirement._lastDocModel || null;
        if (docModelId) {
          aiTools.generateDoc(req.params.id, docModelId).then(docResult => {
            console.log(`[sketch] 需求文档已重新生成，模型: ${docResult.modelUsed}`);
          }).catch(e => console.error('[sketch] 重新生成需求文档失败:', e.message));
        } else {
          console.log('[sketch] 跳过文档重新生成：无可用模型（用户未选择模型）');
        }
      } catch (e) {
        console.error('[sketch] 触发文档重新生成失败:', e.message);
      }
    }

    // 保证返回结构兼容前端
    res.json({
      pages: result.pages || [],
      flowDescription: result.flowDescription || '',
      modelUsed: result.modelUsed || '',
      error: result.error,
    });
  } catch (e) { next(e); }
});

module.exports = router;
