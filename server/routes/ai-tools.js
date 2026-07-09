// AI 工具 API — MD文档生成 + 智能任务分解
const express = require('express');
const router = express.Router();
const aiTools = require('../services/ai-tools-service');
const reqStore = require('../stores/requirement-store');
const taskStore = require('../stores/task-store');
const eventBus = require('../services/event-bus');
const { validateChildCoverage, detectIntegrationGaps, validateParentAggregateCoverage } = require('../services/coverage-validator');

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

    // ── 覆盖率验证（非阻塞，不中断流程）──
    let coverageReport = null;
    let integrationGap = null;
    try {
      coverageReport = validateChildCoverage(requirement.id, createdTasks);
      integrationGap = detectIntegrationGaps(requirement.id, createdTasks);

      // 持久化覆盖率报告
      const covStore = {
        coveragePct: coverageReport.coveragePct,
        total: coverageReport.total,
        uncovered: coverageReport.uncoveredItems,
        warnings: coverageReport.warnings,
        integrationGap: {
          hasGap: integrationGap.hasIntegrationGap,
          description: integrationGap.gapDescription,
          suggestion: integrationGap.suggestion,
          missingTypes: integrationGap.missingTypes,
        },
        taskCount: createdTasks.length,
        validatedAt: new Date().toISOString(),
      };
      reqStore.update(requirement.id, { coverage_report: JSON.stringify(covStore) });

      if (coverageReport.warnings.length > 0) {
        console.log(`[coverage] ⚠ ${requirement.id} 任务覆盖率 ${coverageReport.coveragePct}%, ${coverageReport.warnings.length} 条警告`);
      }
      if (integrationGap.hasIntegrationGap) {
        console.log(`[coverage] ⚠ ${requirement.id} 存在集成缺口: ${integrationGap.gapDescription}`);
      }

      // 如果当前需求有父需求，异步触发父需求聚合覆盖率检查
      if (requirement.parent_id) {
        setImmediate(async () => {
          try {
            const aggregateCov = validateParentAggregateCoverage(requirement.parent_id);
            if (aggregateCov.gaps.length > 0) {
              reqStore.update(requirement.parent_id, {
                aggregate_coverage_report: JSON.stringify({
                  gaps: aggregateCov.gaps,
                  coveragePct: aggregateCov.coveragePct,
                  totalItems: aggregateCov.totalItems,
                  childrenCoverage: aggregateCov.childrenCoverage,
                  warnings: aggregateCov.warnings,
                  updatedAt: new Date().toISOString(),
                  lastChildId: requirement.id,
                })
              });
              console.log(`[coverage] ⚠ 父需求 ${requirement.parent_id} 聚合覆盖率 ${aggregateCov.coveragePct}%, ${aggregateCov.gaps.length} 条缺口`);
            }
          } catch (e) {
            console.error(`[coverage] 父需求聚合验证异常: ${e.message}`);
          }
        });
      }
    } catch (e) {
      console.error(`[coverage] 覆盖率验证异常（非关键）: ${e.message}`);
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
      coverage: coverageReport ? {
        coveragePct: coverageReport.coveragePct,
        uncovered: coverageReport.uncoveredItems,
        warnings: coverageReport.warnings,
        integrationGap: integrationGap ? {
          hasGap: integrationGap.hasIntegrationGap,
          suggestion: integrationGap.suggestion,
        } : null,
      } : null,
    });
  } catch (e) { next(e); }
});

// 逐段润色
router.post('/requirements/:id/refine-section', async (req, res, next) => {
  try {
    const { modelId, sectionTitle, sectionContent, fullDoc, instruction } = req.body;
    if (!modelId || !sectionTitle || !sectionContent) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: '缺少必要参数' });
    }
    const result = await aiTools.refineSection(modelId, sectionTitle, sectionContent, fullDoc, instruction);
    res.json(result);
  } catch (e) { next(e); }
});

// 编辑后关联检查
router.post('/requirements/:id/check-consistency', async (req, res, next) => {
  try {
    const { modelId, editedSection, oldContent, newContent, fullDoc } = req.body;
    if (!modelId || !editedSection || !oldContent || !newContent) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: '缺少必要参数' });
    }
    // 日志：检查实际收到的数据（用正则避免字符编码问题）
    console.log('[check-consistency] modelId:', modelId);
    console.log('[check-consistency] editedSection:', editedSection);
    var has50x30 = /50\s*\D+\s*30/.test(fullDoc || '');
    var has50x46 = /50\s*\D+\s*46/.test(fullDoc || '');
    console.log('[check-consistency] fullDoc 含 50?30:', has50x30);
    console.log('[check-consistency] fullDoc 含 50?46:', has50x46);
    console.log('[check-consistency] fullDoc length:', (fullDoc || '').length);
    const result = await aiTools.checkConsistency(modelId, editedSection, oldContent, newContent, fullDoc);
    // 兼容 MiniMax: content 可能含 thinking 块或 markdown 包裹，需要多层提取
    let contentStr = result.content || '';
    // 剥 markdown 代码块
    contentStr = contentStr.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
    // 找首个 { 到匹配的 }
    let parsed = null;
    let depth = 0, inStr = false, escape = false, start = -1;
    for (let i = 0; i < contentStr.length; i++) {
      const ch = contentStr[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') { if (start === -1) start = i; depth++; }
      if (ch === '}') { depth--; if (depth === 0 && start >= 0) {
        try { parsed = JSON.parse(contentStr.substring(start, i + 1)); } catch {}
        break;
      }}
    }
    if (!parsed) { try { parsed = JSON.parse(contentStr); } catch {} }
    if (!parsed) parsed = { affectedSections: [] };
    res.json({ ...parsed, modelUsed: result.modelUsed });
  } catch (e) { next(e); }
});

// Agent 自主执行 — LLM 探索工作区 + 分析 + 自动提交
router.post('/agent-execute', async (req, res, next) => {
  try {
    const { taskId, modelId, agentId } = req.body;
    if (!taskId) return res.status(400).json({ error: 'MISSING_TASK_ID' });

    const result = await aiTools.executeTaskAgent(taskId, { modelId });

    // v0.23 防「agent 撒谎」核心防御：从 LLM summary 提取声称写的文件 → 实际 readFile 验证
    //   缺失文件 → 不进 review，进 failed，避免 reviewer 被虚假 success 误导
    const taskDoc = taskStore.getById(taskId);
    const audit = taskDoc ? aiTools.auditAgentClaims(taskDoc.project_id, result.analysis) : { claimedCount: 0, verifiedCount: 0, missingCount: 0, missingFiles: [], claimedFiles: [], verifiedFiles: [] };
    if (audit.missingCount > 0) {
      const missingList = audit.missingFiles.map(m => `${m.path} (${m.reason})`).join(', ');
      console.error(`[agent-execute] ⚠ Task ${taskId} 声称 ${audit.claimedCount} 文件，但 ${audit.missingCount} 缺失: ${missingList}`);
      const failNotes = `[Agent 声称文件验证失败]\n\n缺失文件：\n${audit.missingFiles.map(m => `- \`${m.path}\` (原因: ${m.reason})`).join('\\n')}\n\n声称但已写入(${audit.verifiedCount}):\n${audit.verifiedFiles.map(f => `- \`${f}\``).join('\\n') || '(无)'}\n\n原始 agent summary:\n${result.analysis || '(empty)'}`;
      // 标记任务为 failed 而非 submit 让它进 review
      const task = taskStore.getById(taskId);
      const failSubmit = taskStore.submit(taskId, {
        agentId: agentId || 'agent-xiaoji',
        notes: failNotes,
      });
      // 然后强制改状态为 failed (submit 通常是 todo→review；这里我们要 failed)
      try { taskStore.update(taskId, { status: 'failed' }); } catch (e) {}
      return res.status(409).json({
        success: false,
        taskId,
        modelUsed: result.modelUsed,
        audit,
        error: 'CLAIM_MISMATCH',
        message: `Agent claimed ${audit.claimedCount} file(s), but ${audit.missingCount} missing. Task marked failed.`,
        notes: failNotes,
      });
    }

    // 所有声称文件都验证存在 → 正常 submit 进 review
    const submitResult = taskStore.submit(taskId, {
      agentId: agentId || 'agent-xiaoji',
      notes: result.analysis,
    });

    // 发出 task.submitted 事件（触发 reviewer 审核等后续流程）
    if (submitResult && !submitResult.error) {
      eventBus.emit('task.submitted', {
        projectId: submitResult.project_id,
        actor: { id: agentId || 'agent-xiaoji', type: 'agent' },
        target: { type: 'task', id: submitResult.id },
        payload: { task: submitResult },
      });
    }

    res.json({
      success: true,
      taskId,
      modelUsed: result.modelUsed,
      analysisLength: (result.analysis || '').length,
      submitted: !submitResult?.error,
      submitError: submitResult?.error || null,
    });
  } catch (e) { next(e); }
});

module.exports = router;
