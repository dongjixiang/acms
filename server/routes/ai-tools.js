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
        dependsOn: t.dependsOn || [],   // 先存标题，创建完毕后映射为 ID
        dependsContract: t.dependsContract || [],  // ★ 新增: 接口契约
        wikiContext: requirement.wiki_path || '',
        linkedWiki: (t.linkedWiki || []).map(w => ({ page: w, role: 'reference', autoLoad: false })),
      });
      createdTasks.push(task);
    }

    // 依赖映射：AI 返回的标题 → 实际 task ID
    if (createdTasks.length > 1) {
      const titleToId = {};
      for (const t of createdTasks) { titleToId[t.title] = t.id; }

      for (const t of createdTasks) {
        const rawDepends = JSON.parse(t.depends_on || '[]');
        const resolved = [];
        for (const depTitle of rawDepends) {
          const depId = titleToId[depTitle];
          if (depId && depId !== t.id) resolved.push(depId);
        }
        if (resolved.length > 0) {
          // 检测循环依赖
          if (taskStore.detectCycle(t.id, resolved)) {
            console.warn(`[ai-tools] 循环依赖已跳过: ${t.id} ← ${resolved}`);
          } else {
            taskStore.update(t.id, { depends_on: JSON.stringify(resolved) });
            // 维护 depended_by（反向依赖）
            for (const depId of resolved) {
              const depTask = taskStore.getById(depId);
              if (depTask) {
                const depBy = JSON.parse(depTask.depended_by || '[]');
                if (!depBy.includes(t.id)) {
                  depBy.push(t.id);
                  taskStore.update(depId, { depended_by: JSON.stringify(depBy) });
                }
              }
            }
            // 设置阻塞状态
            taskStore.update(t.id, { blocked: 1, block_reason: '等待前置任务完成' });
          }
        }
      }
    }

    // 仅当真正创建了任务才更新需求状态（失败时保留 approved，允许重试）
    if (createdTasks.length > 0) {
      reqStore.transition(req.params.id, 'in_execution');
    }

    for (const task of createdTasks) {
      eventBus.emit('task.created', {
        projectId: requirement.project_id,
        actor: { id: 'ai-planner', type: 'agent' },
        target: { type: 'task', id: task.id },
        payload: { task },
      });
    }

    res.json({
      tasks: createdTasks,
      count: createdTasks.length,
      summary: result.summary,
      modelUsed: result.modelUsed,
      success: createdTasks.length > 0,
    });
  } catch (e) { next(e); }
});

module.exports = router;
