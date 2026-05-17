// AI 工具 API — MD文档生成 + 智能任务分解
const express = require('express');
const router = express.Router();
const aiTools = require('../services/ai-tools-service');
const reqStore = require('../stores/requirement-store');
const taskStore = require('../stores/task-store');
const eventBus = require('../services/event-bus');

// 生成 MD 需求文档
router.post('/requirements/:id/generate-doc', async (req, res, next) => {
  try {
    const { modelId } = req.body;
    if (!modelId) return res.status(400).json({ error: 'MISSING_MODEL' });
    const result = await aiTools.generateDoc(req.params.id, modelId);
    // 保存为 structured_description
    reqStore.update(req.params.id, { structured_description: result.content });
    res.json(result);
  } catch (e) { next(e); }
});

// AI 智能任务分解
router.post('/requirements/:id/decompose-ai', async (req, res, next) => {
  try {
    const { modelId } = req.body;
    if (!modelId) return res.status(400).json({ error: 'MISSING_MODEL' });

    const result = await aiTools.decomposeRequirement(req.params.id, modelId);
    const requirement = reqStore.getById(req.params.id);

    // 批量创建任务
    const createdTasks = [];
    for (const t of (result.tasks || [])) {
      const task = taskStore.create({
        projectId: requirement.project_id,
        parentId: requirement.id,
        title: t.title,
        description: t.description || '',
        type: t.type || 'coding',
        priority: t.priority || requirement.priority,
        requiredSkills: t.requiredSkills || {},
        estimatedHours: t.estimatedHours || 4,
        dependsOn: [], // 依赖稍后通过 taskId 映射
        wikiContext: requirement.wiki_path || '',
        linkedWiki: (t.linkedWiki || []).map(w => ({ page: w, role: 'reference', autoLoad: false })),
      });
      createdTasks.push(task);
    }

    // 更新需求状态
    reqStore.transition(req.params.id, 'in_execution');

    for (const task of createdTasks) {
      eventBus.emit('task.created', {
        projectId: requirement.project_id,
        actor: { id: 'ai-planner', type: 'agent' },
        target: { type: 'task', id: task.id },
        payload: { task },
      });
    }

    res.json({ tasks: createdTasks, count: createdTasks.length, summary: result.summary, modelUsed: result.modelUsed });
  } catch (e) { next(e); }
});

module.exports = router;
