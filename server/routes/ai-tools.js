// AI 工具 API — MD文档生成 + 智能任务分解
const express = require('express');
const router = express.Router();
const aiTools = require('../services/ai-tools-service');
const reqStore = require('../stores/requirement-store');
const taskStore = require('../stores/task-store');
const eventBus = require('../services/event-bus');
const dispatcher = require('../services/auto-execute-dispatcher');
const { validateChildCoverage, detectIntegrationGaps, validateParentAggregateCoverage } = require('../services/coverage-validator');
const decomposer = require('../services/decomposer');

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
    // P0 v0.X: 接 lang — agent 输出语言跟前端 UI 一致
    //   默认 'zh'（多多场景），前端主动调时通过 I18n.getLang() 传入
    //   同时存到 task.doc.preferred_lang，后续 dispatcher 触发的重跑也能拿到
    const { taskId, modelId, agentId, lang } = req.body;
    if (!taskId) return res.status(400).json({ error: 'MISSING_TASK_ID' });

    // v0.X: 任务执行锁 — 防并发触发（dispatcher 自动恢复 + curl steer + 重试同时跑同一任务）
    //   之前 dispatcher 自己管锁，但 /agent-execute 路由层访问不到 dispatcher 的 _executingTasks，
    //   导致 curl /agent-execute 绕过锁并发触发同一任务（实测 T-MRHSD8OE 13:36 双跑浪费 token）。
    //   修法：让 /agent-execute 路由统一管锁，dispatcher 不再自己加锁。
    if (dispatcher.isTaskLocked(taskId)) {
      return res.status(409).json({
        success: false,
        taskId,
        error: 'TASK_ALREADY_RUNNING',
        message: `任务 ${taskId} 正在执行中，请等待完成或使用 /agent-steer 注入指令`,
      });
    }
    if (!dispatcher.tryAcquireTaskLock(taskId)) {
      // 极端 race condition（两个请求同时通过 isTaskLocked 检查）
      return res.status(409).json({
        success: false,
        taskId,
        error: 'TASK_ALREADY_RUNNING',
        message: `任务 ${taskId} 正在执行中（race condition）`,
      });
    }

    try {
      const effectiveLang = lang || 'zh';
      const task = taskStore.getById(taskId);
      if (task && lang) {
        taskStore.update(taskId, { preferred_lang: lang, updated_at: new Date().toISOString() });
      }

      const result = await aiTools.executeTaskAgent(taskId, { modelId, lang: effectiveLang });

    // v0.35 改版：基于任务需求验证文件，不 parse LLM summary
    //   从任务描述/acceptance criteria 提取文件路径 → 验证是否存在
    //   缺失 → 退回 in_progress 重做（不是直接 FAIL）
    const taskDoc = taskStore.getById(taskId);
    const audit = taskDoc ? aiTools.auditTaskRequirements(taskDoc.project_id, taskDoc) : { requiredCount: 0, verifiedCount: 0, missingCount: 0, missingFiles: [], requiredFiles: [], verifiedFiles: [] };
    if (audit.missingCount > 0) {
      const missingList = audit.missingFiles.map(m => `${m.path} (${m.reason})`).join(', ');
      console.warn(`[agent-execute] ⚠ Task ${taskId} 需求文件 ${audit.missingCount} 缺失: ${missingList}`);
      const missingFiles = audit.missingFiles.map(m => m.path).join(', ');
      const feedbackNotes = `[需求文件验证未通过 — 请创建缺失文件]

你的任务描述中要求创建以下文件，但它们不存在：
${audit.missingFiles.map(m => `- \`${m.path}\` (原因: ${m.reason})`).join('\n')}

需求中提到的文件(${audit.requiredCount}): ${audit.requiredFiles.join(', ') || '(无)'}`;
      // 退回 in_progress，附 feedback 让 LLM 重做
      taskStore.update(taskId, { status: 'in_progress', progress_note: feedbackNotes });
      // v0.44.5: 自动 steer agent — 把 feedback 注入到 agent 的 messages 里，让它知道要去补文件
      //   之前 agent 拿到反馈后可能不知道要创建文件，或者继续装睡
      //   修法：直接 steer agent，明确告诉它"创建缺失文件"
      //   v0.X fix: 复用顶部已经导入的 aiTools.executeTaskAgent，**不要重新 require './task-agent'**
      //     （routes/ 下没有 task-agent.js，会抛 MODULE_NOT_FOUND 被外层 catch 静默吞掉，
      //      导致 audit 失败后永远不触发自动 steer，任务永远卡在 in_progress）
      // 异步 steer，不阻塞响应
      (async () => {
        try {
          await aiTools.executeTaskAgent(taskId, {
            steerMessage: `### 自动 steer: 创建缺失文件\n\n你的提交被拒绝了，因为以下文件不存在：\n${missingFiles}\n\n请创建这些文件。对于每个文件，根据任务描述中的需求，用合理的内容创建它。如果你不知道该放什么内容，创建一个合理的空骨架（比如空类/空函数/空模块）。\n\n创建后重新提交。`,
          });
        } catch (e) {
          console.error(`[agent-execute] steer failed for task ${taskId}: ${e.message}`);
        }
      })();
      return res.status(409).json({
        success: false,
        taskId,
        modelUsed: result.modelUsed,
        audit,
        error: 'FILES_MISSING',
        message: `Task requires ${audit.missingCount} file(s) that are missing. Task returned to in_progress for rework.`,
        notes: feedbackNotes,
      });
    }

    // 所有声称文件都验证存在 → 正常 submit 进 review
    // v0.45: 装睡检测 — 检查 execution_log 是否有真实的 tool calls
    const execLog = JSON.parse(taskDoc.execution_log || '[]');
    const toolCallEntries = execLog.filter(e => e.note && (e.note.includes('调用工具') || e.note.includes('Tool call')));
    const fileWriteEntries = execLog.filter(e => e.note && (e.note.includes('agent_write_file') || e.note.includes('agent_patch_file')));
    if (toolCallEntries.length === 0) {
      // 装睡检测：execution_log 0 tool calls → 强制重做
      const installWarning = `⚠️ 装睡检测失败: execution_log 中没有任何 tool call 记录。你必须使用 agent_read_file/agent_search_files/agent_write_file 等工具实际执行任务，不能嘴上说完成就提交。\n\n当前日志: ${execLog.length} 条 entry，0 条 tool call。\n\n请重新执行任务：先 explore 工作区 → 修改/创建文件 → 用 node --check 验证 → 再提交。`;
      taskStore.update(taskId, { status: 'in_progress', progress_note: installWarning });
      console.warn(`[agent-execute] ⚠️ 装睡检测: Task ${taskId} - 0 tool_calls in execution_log, returning to in_progress for rework`);
      return res.status(409).json({
        success: false,
        taskId,
        error: 'STALL_DETECTED',
        message: `Stall detected: execution_log has ${execLog.length} entries but 0 tool calls. Task returned to in_progress for rework.`,
        notes: installWarning,
      });
    }

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
      // v0.23: happy path 也返回 audit 详情 — 让 review 调试有完整证据
      audit: audit.missingCount === 0 ? audit : null,
    });
    } finally {
      // v0.X: 释放任务执行锁 — 无论 success/audit-fail/stall 都要释放
      dispatcher.releaseTaskLock(taskId);
    }
  } catch (e) { next(e); }
});

// v0.30 fix: 手动 steer endpoint — Hermes /steer slash command 的 ACMS 等价物
//   PM 可以注入额外指令到 agent-execute，类似 Hermes user-driven steer
//   用法：POST /api/ai-tools/agent-steer/:taskId { message: "...", modelId?: "..." }
//   效果：重新跑 agent-execute，messages[1] 注入 user steerMessage（紧跟 system prompt 后）
router.post('/agent-steer/:taskId', async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { message, modelId } = req.body;
    if (!message) return res.status(400).json({ error: 'MISSING_MESSAGE', message: 'steer message 是必填项' });
    const result = await aiTools.executeTaskAgent(taskId, { modelId, steerMessage: message });
    // v0.35: 同样跑需求文件验证
    const taskDoc = taskStore.getById(taskId);
    const audit = taskDoc ? aiTools.auditTaskRequirements(taskDoc.project_id, taskDoc) : { requiredCount: 0, verifiedCount: 0, missingCount: 0, missingFiles: [], requiredFiles: [], verifiedFiles: [] };
    res.json({
      success: true,
      taskId,
      steered: true,
      modelUsed: result.modelUsed,
      analysisLength: (result.analysis || '').length,
      audit,
    });
  } catch (e) { next(e); }
});

// v0.46: Plan mode endpoints — Hermes /plan + Claude Code ExitPlanMode 的 ACMS 等价物
//   POST /agent-plan/:taskId              — 生成 plan（不执行）
//   POST /agent-plan/:taskId/approve      — 批准 plan → 自动调 agent-execute
//   POST /agent-plan/:taskId/reject       — 拒绝 plan → 任务留在 backlog

router.post('/agent-plan/:taskId', async (req, res, next) => {
  try {
    const { taskId } = req.params;
    // P0 v0.X: 接 lang — plan summary 跟 UI 语言一致
    //   同时存到 task.doc.preferred_lang，后续 dispatcher 触发的重跑也能拿到
    const { modelId, lang } = req.body;
    const effectiveLang = lang || 'zh';
    if (lang) {
      const task = taskStore.getById(taskId);
      if (task) taskStore.update(taskId, { preferred_lang: lang, updated_at: new Date().toISOString() });
    }
    const result = await aiTools.generatePlan(taskId, { modelId, lang: effectiveLang });
    res.json({
      success: true,
      taskId,
      plan: result.plan,
    });
  } catch (e) { next(e); }
});

router.post('/agent-plan/:taskId/approve', async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const task = taskStore.getById(taskId);
    if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
    if (!task.plan) return res.status(400).json({ error: 'NO_PLAN', message: '任务还没生成 plan，先调 /agent-plan' });

    // 标记 plan 为 approved
    const approvedPlan = { ...task.plan, approved: true, approvedAt: new Date().toISOString() };
    taskStore.update(taskId, { plan: approvedPlan, plan_status: 'approved' });

    // 异步触发 agent-execute（不等执行完，PM 可以看 SSE 进度）
    (async () => {
      try {
        await aiTools.executeTaskAgent(taskId, { modelId: task.plan.model });
      } catch (e) {
        console.error(`[agent-plan-approve] executeTaskAgent failed for ${taskId}: ${e.message}`);
      }
    })();

    res.json({
      success: true,
      taskId,
      plan: approvedPlan,
      message: 'Plan approved, agent-execute started in background.',
    });
  } catch (e) { next(e); }
});

router.post('/agent-plan/:taskId/reject', async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { reason } = req.body;
    // P0 v0.X: plan 驳回必填理由（min 10 字）— 对齐 task review / requirement reject
    const trimmedReason = (reason || '').trim();
    if (trimmedReason.length < 10) {
      return res.status(400).json({
        error: 'REJECT_REASON_REQUIRED',
        message: 'Plan 驳回理由至少 10 字，给 AI 明确方向',
        minLength: 10,
      });
    }
    const task = taskStore.getById(taskId);
    if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
    if (!task.plan) return res.status(400).json({ error: 'NO_PLAN', message: '任务还没生成 plan' });

    const rejectedPlan = { ...task.plan, rejectedReason: trimmedReason, rejectedAt: new Date().toISOString() };
    taskStore.update(taskId, {
      plan: rejectedPlan,
      plan_status: 'rejected',
      status: 'backlog',  // 退回 backlog，PM 可以手动改 plan 或重新调 /agent-plan
    });

    res.json({
      success: true,
      taskId,
      plan: rejectedPlan,
      message: 'Plan rejected. Task returned to backlog.',
    });
  } catch (e) { next(e); }
});

// v0.45: Decomposer API — 编排者只拆不执行
//   POST /api/ai-tools/decompose { requirementText, projectId, parentId, modelId? }
//   效果：LLM 分解需求 → 创建任务 → 链接依赖 → 返回任务图
router.post('/decompose', async (req, res, next) => {
  try {
    const { requirementText, projectId, parentId, modelId } = req.body;
    if (!requirementText || !projectId) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'requirementText 和 projectId 是必填项' });
    }

    // 第一步：LLM 分解
    const { tasks, taskGraph } = await decomposer.decomposeRequirement(requirementText, projectId, parentId, { modelId });

    // 第二步：创建任务（decomposer 不执行，只创建）
    const createdTasks = [];
    for (const t of tasks) {
      const task = taskStore.create({
        title: t.title,
        description: t.description,
        type: t.type,
        project_id: projectId,
        parent_id: parentId,
        estimated_hours: t.estimated_hours,
        required_skills: JSON.stringify(t.required_skills),
        depends_on: t.depends_on || [],
        status: 'backlog',
      });
      createdTasks.push(task);
    }

    // 第三步：发出事件（触发下游流程）
    eventBus.emit('tasks.decomposed', {
      projectId,
      parentId,
      createdTasks: createdTasks.map(t => t.id),
    });

    res.json({
      success: true,
      decomposed: true,
      taskCount: createdTasks.length,
      tasks: createdTasks,
      taskGraph,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
