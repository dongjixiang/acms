// 需求 API 路由（精简版 — 业务逻辑在 services/requirement-service.js）
const express = require('express');
const router = express.Router();
const reqStore = require('../stores/requirement-store');
const eventBus = require('../services/event-bus');
const reqService = require('../services/requirement-service');
const modelStore = require('../stores/model-store');

// 创建需求
router.post('/', async (req, res, next) => {
  try {
    const { projectId, title, description, priority, tags, deadline, parentId, modelId, role, userRole } = req.body;
    if (!projectId || !title) return res.status(400).json({ error: 'MISSING_FIELDS' });
    const requirement = reqStore.create({ projectId, title, description, priority, tags, deadline, createdBy: req.agentId || 'user', parentId: parentId || null, userRole: userRole || role || '' });

    // ── 同步：LLM 评估明确度（30 文档「一放一收」Step 2）──
    try {
      const { assessClarity } = require('../services/insight-previews');
      const { clarity, reason, modelId: usedModel } = await assessClarity(title, description, modelId);
      if (clarity) {
        reqStore.update(requirement.id, { input_clarity: clarity, clarity_reason: reason || '' });
        requirement.input_clarity = clarity;
        requirement.clarity_reason = reason || '';
        requirement.clarity_model = usedModel;
      }
    } catch (e) { console.error('[requirements.create] 明确度评估失败（非阻塞）:', e.message); }

    // ── 异步：自动启动思路简报（v0.3「思路先于画面」改造）──
    // 思路简报是文本，~1500 tokens；图片预览改为用户手动触发
    try {
      const { runBriefJob } = require('../services/thinking-brief');
      setImmediate(() => runBriefJob(requirement.id, { modelId, role })
        .catch(e => console.error('[brief.auto] 任务异常:', e)));
    } catch (e) { console.error('[requirements.create] 启动思路简报任务失败（非阻塞）:', e.message); }

    eventBus.emit('requirement.created', { projectId, actor: { id: req.agentId || 'user', type: 'human' }, target: { type: 'requirement', id: requirement.id }, payload: { requirement } });
    res.status(201).json(requirement);
  } catch (e) { next(e); }
});

// 需求列表
router.get('/', (req, res) => {
  const { projectId, status, parentId, rootOnly, limit, offset } = req.query;
  res.json(reqStore.list({
    projectId, status,
    parentId: parentId || undefined,
    rootOnly: rootOnly === 'true',
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0
  }));
});

// 需求详情
router.get('/:id', (req, res) => {
  const requirement = reqStore.getById(req.params.id);
  if (!requirement) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
  res.json({ ...requirement, clarifications: reqStore.getClarifications(req.params.id) });
});

// ============================================================
// v0.4 Phase 2c：诊断纠偏（用户主动改 diagnosis.type）
//   POST /:id/correct-diagnosis  { type: 'vague'|'conflicted'|'blank' }
//   行为：
//     1. 校验 status === 'idea'
//     2. 改 brief.diagnosis.type + 写入 corrected_at + previous_type
//     3. 清掉旧 dialog（让 brief 重生时重新生成）
//     4. 异步触发 brief 重生（让 diagnosis label/guide/dialog 基于新 type 重新生成）
// ============================================================
router.post('/:id/correct-diagnosis', async (req, res, next) => {
  try {
    const VALID = ['vague', 'conflicted', 'blank'];
    const { type } = req.body || {};
    if (!VALID.includes(type)) {
      return res.status(400).json({ error: 'INVALID_TYPE', validTypes: VALID });
    }
    const reqRec = reqStore.getById(req.params.id);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    if (reqRec.status !== 'idea') {
      return res.status(409).json({ error: 'ONLY_IDEA_STATUS', currentStatus: reqRec.status });
    }

    // 读 brief，校验 diagnosis 已存在
    let brief;
    try { brief = JSON.parse(reqRec.thinking_brief || 'null'); } catch { brief = null; }
    if (!brief || !brief.diagnosis || !brief.diagnosis.type) {
      return res.status(409).json({ error: 'NO_DIAGNOSIS_TO_CORRECT' });
    }
    if (brief.diagnosis.type === type) {
      return res.json({ ok: true, diagnosis: brief.diagnosis, briefRegen: 'no_change', reason: 'same type, no action' });
    }

    // 改 diagnosis.type + 写标记
    const corrected = {
      ...brief.diagnosis,
      type,
      corrected_at: new Date().toISOString(),
      previous_type: brief.diagnosis.type,
    };
    brief.diagnosis = corrected;
    brief.dialog = null;  // 清掉旧 dialog，让 brief 重生时重新生成
    reqStore.update(req.params.id, { thinking_brief: JSON.stringify(brief) });
    console.log(`[correct-diagnosis] ${req.params.id}: ${corrected.previous_type} → ${type}`);

    // 异步触发 brief 重生（让 diagnosis label/guide/dialog 基于新 type 重新生成）
    //   v0.4 Phase 2c：传 skipDiagnosisRegen + preserveDiagnosisType 让 brief 重生保留 type
    const previousType = brief.diagnosis.type;
    setImmediate(async () => {
      try {
        const { runBriefJob } = require('../services/thinking-brief');
        await runBriefJob(req.params.id, {
          skipDiagnosisRegen: true,
          preserveDiagnosisType: type,
          previousType,
        });
      } catch (e) {
        console.error(`[correct-diagnosis] ${req.params.id} brief 重生失败（非阻塞）:`, e.message);
      }
    });

    res.json({ ok: true, diagnosis: corrected, briefRegen: 'started' });
  } catch (e) { next(e); }
});

// 状态转换 — 切换到 approved 时检查具体性
router.post('/:id/transition', (req, res, next) => {
  try {
    // v0.4 Phase 4.1：idea → clarifying 时先固化（生成 summary）
    //   调 elicit-solidify service 产出"我们讨论了什么"摘要，存到 brief.summary
    //   失败不阻塞 transition（fallback 走 raw brief 内容）
    if (req.body.targetStatus === 'clarifying') {
      try {
        const elicitorAdapter = require('../services/elicitor-adapter');
        if (elicitorAdapter.canRun().ok) {
          const { generateSummary } = require('../services/elicitor-solidify');
          const fresh = reqStore.getById(req.params.id);
          if (fresh && fresh.status === 'idea') {
            const currentBrief = JSON.parse(fresh.thinking_brief || 'null');
            if (currentBrief && currentBrief.status === 'done') {
              generateSummary(currentBrief, fresh, null).then(summary => {
                if (summary) {
                  const updated = JSON.parse(fresh.thinking_brief || '{}');
                  updated.summary = summary;
                  reqStore.update(req.params.id, { thinking_brief: JSON.stringify(updated) });
                  console.log(`[transition.solidify] ${req.params.id} summary 已生成`);
                }
              }).catch(e => console.warn('[transition.solidify] 非阻塞失败:', e.message));
            }
          }
        }
      } catch (e) { console.warn('[transition.solidify] 非阻塞:', e.message); }
    }

    // 具体性门控: approved 前检查模糊表达
    if (req.body.targetStatus === 'approved') {
      const requirement = reqStore.getById(req.params.id);
      if (requirement) {
        const validator = require('../services/concreteness-validator');
        const result = validator.validateRequirement(requirement);
        if (!result.passed) {
          return res.status(400).json({
            error: 'VAGUE_REQUIREMENT',
            message: '需求包含模糊表达，无法审批通过。请先澄清以下问题：',
            warnings: result.warnings.filter(w => w.severity === 'error').slice(0, 5),
            allWarnings: result.warnings,
          });
        }
      }
    }
    const result = reqStore.transition(req.params.id, req.body.targetStatus, { id: req.agentId || 'user', type: req.agentId ? 'agent' : 'human' });
    if (result.error) return res.status(400).json(result);

    // 审批通过后运行澄清自我改进
    let improvementReport = null;
    if (req.body.targetStatus === 'approved') {
      try {
        const clarifications = reqStore.getClarifications(req.params.id);
        if (clarifications && clarifications.length > 0) {
          const improvement = require('../services/clarify-improvement-service');
          const report = improvement.analyzeClarification(result, clarifications);
          improvementReport = report;
          console.log(`[clarify-improve] ${result.id}: ${report.totalRounds}轮, ${report.totalVaguenessWarnings}模糊, ${report.suggestions.length}建议`);
        }
      } catch (e) { /* 非关键 */ }
    }

    // 需求进入执行阶段 → 自动生成知识页面
    if (req.body.targetStatus === 'approved' || req.body.targetStatus === 'in_execution') {
      try {
        const synthesizer = require('../services/knowledge-synthesizer');
        synthesizer.generateForRequirement(req.params.id).then(res => {
          if (res.created) {
            console.log(`[KnowledgeSynthesizer] ✅ ${req.params.id} → ${res.path}`);
          } else if (!res.skipped) {
            console.log(`[KnowledgeSynthesizer] ⚠️ ${req.params.id}: ${res.reason}`);
          }
        });
      } catch (e) { /* 非关键 */ }
    }

    eventBus.emit(`requirement.${req.body.targetStatus === 'approved' ? 'approved' : 'status_changed'}`, { projectId: result.project_id, actor: { id: req.agentId || 'user', type: 'human' }, target: { type: 'requirement', id: result.id }, payload: { requirement: result } });
    res.json({ ...result, improvement: improvementReport });
  } catch (e) { next(e); }
});

// 澄清对话
router.post('/:id/clarify', (req, res) => {
  const { question, agentId } = req.body;
  if (!question) return res.status(400).json({ error: 'MISSING_QUESTION' });
  reqStore.addClarificationQuestion(req.params.id, { question, askedBy: agentId || req.agentId || 'analyst' });
  reqStore.addClarification(req.params.id, { role: 'agent', agentId: agentId || req.agentId, content: question });
  res.json({ message: '澄清问题已添加' });
});

router.post('/:id/answer', (req, res) => {
  const { questionIndex, answer, role } = req.body;
  reqStore.answerClarification(req.params.id, questionIndex, answer);
  reqStore.addClarification(req.params.id, { role: role || 'user', content: answer });
  res.json({ success: true });
});

// SRS
router.patch('/:id/srs', (req, res) => {
  const requirement = reqStore.updateSrs(req.params.id, req.body);
  if (!requirement) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
  res.json(requirement);
});

// 通用字段更新（deadline, title 等）
router.patch('/:id', (req, res) => {
  const { deadline, title, description, description_append, priority, tags } = req.body;
  const updates = {};
  if (deadline !== undefined) updates.deadline = deadline;
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  // v0.3.2 增量：description_append 追加到原 description 末尾（决策树详情面板勾选用）
  if (description_append !== undefined) {
    const r = reqStore.getById(req.params.id);
    if (!r) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    updates.description = (r.description || '') + description_append;
  }
  if (priority !== undefined) updates.priority = priority;
  if (tags !== undefined) updates.tags = JSON.stringify(tags);
  const requirement = reqStore.update(req.params.id, updates);
  if (!requirement) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
  res.json(requirement);
});

// 架构宪法管理
router.patch('/:id/arch-spec', (req, res) => {
  try {
    const { archSpec } = req.body;
    if (!archSpec) return res.status(400).json({ error: 'MISSING_ARCH_SPEC' });
    const requirement = reqStore.updateArchSpec(req.params.id, archSpec);
    if (!requirement) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    res.json({ success: true, arch_spec: requirement.arch_spec });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/interface-contracts', (req, res) => {
  try {
    const { contracts } = req.body;
    if (!contracts) return res.status(400).json({ error: 'MISSING_CONTRACTS' });
    const requirement = reqStore.updateInterfaceContracts(req.params.id, contracts);
    if (!requirement) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    res.json({ success: true, interface_contracts: requirement.interface_contracts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 审核流程（使用 service）
router.post('/:id/submit-review', async (req, res, next) => {
  try {
    const result = await reqService.submitForReview(req.params.id, req.agentId || 'analyst');

    // 契约验证: 如果该需求有父需求且所有兄弟都已 readyForReview，自动触发
    const requirement = reqStore.getById(req.params.id);
    if (requirement && requirement.parent_id) {
      const children = reqStore.findChildren(requirement.parent_id);
      const allReady = children.every(c => {
        const ref = JSON.parse(c.refinement || '{}');
        return c.status === 'review' || c.status === 'approved' || ref.readyForReview === true;
      });
      if (allReady && children.length >= 2) {
        try {
          const validator = require('../services/contract-validator');
          const contractResult = validator.validateSiblingContracts(requirement.parent_id);
          result.contractValidation = contractResult;
        } catch (e) { /* 非关键 */ }
      }
    }

    res.json(result);
  } catch (e) { next(e); }
});

router.post('/:id/approve', async (req, res, next) => {
  try { res.json(await reqService.approve(req.params.id)); } catch (e) { next(e); }
});

router.post('/:id/reject', async (req, res, next) => {
  try { res.json(await reqService.reject(req.params.id, req.body.reason)); } catch (e) { next(e); }
});

// 分解（使用 service）
router.post('/:id/decompose', async (req, res, next) => {
  try { res.status(201).json(await reqService.decompose(req.params.id, req.body.tasks, req.agentId)); } catch (e) { next(e); }
});

// 统计
router.get('/stats/:projectId', (req, res) => {
  res.json(reqStore.getStats(req.params.projectId));
});

// 契约验证: 手动触发（前端可显式调用）
router.post('/:id/validate-contracts', (req, res) => {
  try {
    const validator = require('../services/contract-validator');
    const result = validator.validateSiblingContracts(req.params.id);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 需求文档: 读取已生成的 Wiki MD 文件
router.get('/:id/doc', (req, res) => {
  try {
    const requirement = reqStore.getById(req.params.id);
    if (!requirement) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    const wikiPath = requirement.wiki_path;
    if (!wikiPath) return res.json({ content: null, message: '暂无需求文档' });

    const fs = require('fs');
    const path = require('path');
    const projectStore = require('../stores/project-store');
    const project = projectStore.getById(requirement.project_id);
    if (!project || !project.wiki_vault_path) return res.json({ content: null, message: '项目未配置 Wiki' });

    const fullPath = path.join(project.wiki_vault_path, wikiPath);
    if (!fs.existsSync(fullPath)) return res.json({ content: null, message: '文档文件不存在' });

    const content = fs.readFileSync(fullPath, 'utf-8');
    res.json({ content, path: wikiPath });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 删除需求
router.delete('/:id', (req, res) => {
  const requirement = reqStore.getById(req.params.id);
  if (!requirement) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
  const { collection } = require('../db/connection');

  // 级联删除所有子需求（递归）
  let deletedChildren = 0;
  const childIds = JSON.parse(requirement.child_ids || '[]');
  if (childIds.length > 0) {
    for (const cid of childIds) {
      const child = reqStore.getById(cid);
      if (child) {
        // 递归获取孙子需求
        const grandChildIds = JSON.parse(child.child_ids || '[]');
        for (const gcid of grandChildIds) {
          collection('requirements').remove(r => r.id === gcid);
          deletedChildren++;
        }
        // 删除子需求（含关联任务和澄清记录）
        const childTaskIds = JSON.parse(child.task_ids || '[]');
        for (const tid of childTaskIds) collection('tasks').remove(t => t.id === tid);
        collection('requirements').remove(r => r.id === cid);
        collection('clarification_threads').remove(c => c.requirement_id === cid);
        deletedChildren++;
      }
    }
  }

  // 如果有父需求，从父需求的 child_ids 中移除自己
  if (requirement.parent_id) {
    const parent = reqStore.getById(requirement.parent_id);
    if (parent) {
      const pcids = JSON.parse(parent.child_ids || '[]').filter(id => id !== req.params.id);
      collection('requirements').update(r => r.id === requirement.parent_id, { child_ids: JSON.stringify(pcids) });
    }
  }

  collection('clarification_threads').remove(c => c.requirement_id === req.params.id);
  // 删除关联任务
  const taskIds = JSON.parse(requirement.task_ids || '[]');
  for (const tid of taskIds) collection('tasks').remove(t => t.id === tid);
  const orphanTasks = collection('tasks').find(t => t.parent_id === req.params.id);
  for (const t of orphanTasks) collection('tasks').remove(t2 => t2.id === t.id);
  collection('requirements').remove(r => r.id === req.params.id);
  res.json({ success: true, message: `需求 ${requirement.title} 已删除，级联删除 ${deletedChildren} 个子需求`, deletedTasks: taskIds.length + orphanTasks.length, deletedChildren });
});

// 获取拆分方案（AI 生成）
router.post('/:id/split-proposal', async (req, res, next) => {
  try {
    const { generateSplitProposal } = require('../services/split-gate-service');
    const proposal = await generateSplitProposal(req.params.id);
    res.json(proposal);
  } catch (e) { next(e); }
});

// 需求拆分（含流程地图 + 上下文继承 + 父需求修剪）
router.post('/:id/split', (req, res, next) => {
  try {
    const { children } = req.body;
    if (!children || !Array.isArray(children) || children.length === 0) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: '需要提供 children 数组' });
    }
    const { executeSplit } = require('../services/split-gate-service');
    const proposal = req.body.proposal || null;
    const result = executeSplit(req.params.id, children, proposal);
    eventBus.emit('requirement.split', { projectId: result.parent.project_id, actor: { id: req.agentId || 'user', type: 'human' }, target: { type: 'requirement', id: req.params.id }, payload: { parent: result.parent, children: result.children } });
    res.status(201).json(result);
  } catch (e) { next(e); }
});

// 父需求刷新 — 对比所有子需求的当前状态
router.post('/:id/refresh-parent', async (req, res, next) => {
  try {
    const { triggerParentRefresh } = require('../services/sync-service');
    const report = await triggerParentRefresh(req.params.id);
    res.json(report);
  } catch (e) { next(e); }
});

// 变更影响评估
router.post('/:id/assess-impact', async (req, res, next) => {
  try {
    const { changeDescription } = req.body;
    const requirement = reqStore.getById(req.params.id);
    if (!requirement) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    const { assessChangeImpact } = require('../services/sync-service');
    const result = await assessChangeImpact(requirement, changeDescription || '');
    res.json(result);
  } catch (e) { next(e); }
});

// 覆盖率验证 — 手动触发：检查当前需求的任务是否覆盖 SRS
router.post('/:id/validate-coverage', (req, res, next) => {
  try {
    const { validateChildCoverage, detectIntegrationGaps } = require('../services/coverage-validator');
    const coverage = validateChildCoverage(req.params.id);
    const integrationGap = detectIntegrationGaps(req.params.id);
    res.json({ coverage, integrationGap });
  } catch (e) { next(e); }
});

// 聚合覆盖率验证 — 容器父需求的子需求任务是否覆盖父需求原始 scopeIn
router.post('/:id/validate-aggregate-coverage', (req, res, next) => {
  try {
    const { validateParentAggregateCoverage } = require('../services/coverage-validator');
    const result = validateParentAggregateCoverage(req.params.id);
    res.json(result);
  } catch (e) { next(e); }
});

// 获取子需求
router.get('/:id/children', (req, res) => {
  const children = reqStore.findChildren(req.params.id);
  res.json(children);
});

// 获取需求质量指标
router.get('/metrics/:projectId', (req, res) => {
  try {
    const { persistAndCheck } = require('../services/metrics-service');
    const result = persistAndCheck(req.params.projectId);
    if (!result) return res.json({ metrics: null, triggers: [] });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 获取需求进度（聚合子需求进度）
router.get('/:id/progress', (req, res) => {
  const progress = reqStore.getProgress(req.params.id);
  res.json(progress);
});

// 获取数据模型预览（用于 review 阶段让用户提前发现数据/流程偏差）
router.post('/:id/data-model-preview', async (req, res) => {
  try {
    const extractor = require('../services/data-model-extractor');
    const result = await extractor.extractModel(req.params.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// 洞察类需求预览（30 文档「一放一收」Step 2）
// ============================================================
const insightService = require('../services/insight-previews');

// 手动触发（也用于重新生成）
router.post('/:id/insight-previews', async (req, res, next) => {
  try {
    const { modelId, imageProviderId, role } = req.body || {};
    const reqRec = reqStore.getById(req.params.id);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    // 状态机：仅 idea 状态可生成
    if (reqRec.status !== 'idea') {
      return res.status(409).json({ error: 'ONLY_IDEA_STATUS', currentStatus: reqRec.status });
    }
    // fire-and-forget：立即返回，后台跑
    setImmediate(() => insightService.runPreviewJob(req.params.id, { modelId, imageProviderId, role })
      .catch(e => console.error('[insight] 任务异常:', e)));
    res.status(202).json({ message: '预览任务已启动', status: 'pending' });
  } catch (e) { next(e); }
});

// 查询预览状态（前端轮询用）
router.get('/:id/insight-previews', (req, res, next) => {
  try {
    const reqRec = reqStore.getById(req.params.id);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    const previews = JSON.parse(reqRec.insight_previews || 'null');
    res.json({
      requirementId: req.params.id,
      status: reqRec.status,
      inputClarity: reqRec.input_clarity || null,
      insightPreviews: previews,
    });
  } catch (e) { next(e); }
});

// 用户选某个变体
router.post('/:id/insight-pick', (req, res, next) => {
  try {
    const { variantId } = req.body || {};
    if (!variantId) return res.status(400).json({ error: 'MISSING_VARIANT_ID' });
    const result = insightService.pickVariant(req.params.id, variantId);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (e) { next(e); }
});

// 跳过预览
router.post('/:id/insight-skip', (req, res, next) => {
  try {
    const result = insightService.skipPreviews(req.params.id);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (e) { next(e); }
});

// ============================================================
// 思路简报（v0.3「思路先于画面」改造）
//   - 创建需求时自动生成（POST / 已无 endpoint 显式触发）
//   - 前端通过 GET 读取，必要时通过 POST /regen 重新生成
// ============================================================
const briefService = require('../services/thinking-brief');

// 查询思路简报（前端轮询用）
router.get('/:id/thinking-brief', (req, res, next) => {
  try {
    const reqRec = reqStore.getById(req.params.id);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    const brief = briefService.getBrief(req.params.id);
    res.json({
      requirementId: req.params.id,
      status: reqRec.status,
      thinkingBrief: brief,  // null = 还没生成
    });
  } catch (e) { next(e); }
});

// 重新生成思路简报（用户主动操作）
router.post('/:id/thinking-brief/regen', async (req, res, next) => {
  try {
    const { modelId, role } = req.body || {};
    const reqRec = reqStore.getById(req.params.id);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    if (reqRec.status !== 'idea') {
      return res.status(409).json({ error: 'ONLY_IDEA_STATUS', currentStatus: reqRec.status });
    }
    // fire-and-forget：立即返回，后台跑
    setImmediate(() => briefService.runBriefJob(req.params.id, { modelId, role })
      .catch(e => console.error('[brief.regen] 任务异常:', e)));
    res.status(202).json({ message: '思路简报重新生成已启动', status: 'generating' });
  } catch (e) { next(e); }
});

// v0.3.6 流式思路简报（SSE）
// 连接后触发 brief 生成，逐 token 推送
router.get('/:id/thinking-brief/stream', async (req, res, next) => {
  try {
    const reqRec = reqStore.getById(req.params.id);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx 兼容
    res.flushHeaders();

    const send = (type, data) => {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    send('status', { message: '开始生成思路简报…' });

    const defaultModel = modelStore.getDefaultGenModel();
    const modelId = defaultModel?.id || null;

    for await (const event of briefService.runBriefJobStream(req.params.id, { modelId })) {
      if (event.type === 'token') {
        send('token', { text: event.text });
      } else if (event.type === 'done') {
        send('done', { brief: event.brief });
        break;
      } else if (event.type === 'error') {
        send('error', { message: event.message });
        break;
      }
    }
    res.end();
  } catch (e) {
    // 流中断或异常，尝试发 error 事件
    try { res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`); res.end(); } catch {}
  }
});

// ============================================================
// 辅助手段（v0.3.3 Phase 2）
//   LLM 路由器 + 5 种独立 assist（decision_tree/scenarios/diagnosis/tradeoff/arch）
//   POST /assist/run       → 路由器选一种 → 调对应 service → 返回 method + status
//   GET  /assist           → 列出已生成的辅助手段 + 当前状态（前端轮询）
//   POST /assist/:method   → 手动指定 method（跳过路由器，用户主动触发某一种）
// ============================================================
const assists = require('../services/assists');
const { pickNext: pickAssistNext } = require('../services/assists/router');

// 列出所有已生成的辅助手段（前端轮询用）
router.get('/:id/assist', (req, res, next) => {
  try {
    const reqRec = reqStore.getById(req.params.id);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });

    const result = {};
    // v0.3.3 B+++：用统一的 assist registry 拉所有 method（含 visual）
    for (const method of assists.ASSIST_METHODS) {
      const svc = assists.getAssist(method);
      if (svc && svc.getAssist) {
        const data = svc.getAssist(req.params.id);
        if (data) result[method] = data;
      }
    }

    res.json({ assists: result });
  } catch (e) { next(e); }
});

// 收集已用 methods（用户表态过的 = 永远锁）
//   用单独的 usedMethods[] 表示，避免和"本轮已生成"混在一起
// round_used_methods = 本轮（与当前 chat_round 一致）已生成过的 method
function collectAssistState(reqId, currentRound) {
  const usedMethods = [];
  const roundUsedMethods = [];
  const all = reqStore.getById(reqId);
  if (!all) return { usedMethods, roundUsedMethods };
  for (const method of assists.ASSIST_METHODS) {
    const svc = assists.getAssist(method);
    const data = svc && svc.getAssist ? svc.getAssist(reqId) : null;
    if (!data) continue;
    // 用户表态过（used=true）→ 永远锁
    if (data.used) usedMethods.push(method);
    // 生成过 + 轮次匹配 → 本轮锁
    if (data.status === 'done' && typeof data.generated_at_round === 'number' && data.generated_at_round === currentRound) {
      roundUsedMethods.push(method);
    }
  }
  return { usedMethods, roundUsedMethods };
}

// 路由器自动选一种
router.post('/:id/assist/run', async (req, res, next) => {
  try {
    const { modelId, role } = req.body || {};
    const reqRec = reqStore.getById(req.params.id);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    if (reqRec.status !== 'idea') {
      return res.status(409).json({ error: 'ONLY_IDEA_STATUS', currentStatus: reqRec.status });
    }

    const currentRound = (() => { try { return JSON.parse(reqRec.thinking_brief || 'null')?.chat_round || 1; } catch { return 1; } })();
    const { usedMethods, roundUsedMethods } = collectAssistState(req.params.id, currentRound);

    // 读 brief 拿 ai_understanding + followup_question（当前对话焦点）
    let aiUnderstanding = '';
    let followupQuestion = '';
    let diagnosis = null;
    try {
      const brief = JSON.parse(reqRec.thinking_brief || 'null');
      aiUnderstanding = brief?.ai_understanding || '';
      followupQuestion = brief?.followup_question || '';
      diagnosis = brief?.diagnosis || null;  // v0.4 Phase 2a
    } catch {}

    // /assist/run 是用户主动召唤，force=true 跳过"首轮豁免"
    const pick = await pickAssistNext({
      clarity: reqRec.input_clarity,
      chatRound: currentRound,
      usedMethods,
      roundUsedMethods,
      aiUnderstanding,
      followupQuestion,
      diagnosis,  // v0.4 Phase 2a：传 diagnosis 让路由器感知
      force: true,
    }, modelId);

    if (!pick.method) {
      return res.json({ method: null, reason: pick.reason || '无可推荐', status: 'idle' });
    }

    const svc = assists.getAssist(pick.method);
    if (!svc || !svc.runAssistJob) {
      return res.status(500).json({ error: 'ASSIST_NOT_FOUND', method: pick.method });
    }

    // 把 currentRound 传给 assist service，让它写入 generated_at_round 字段（用于下次判定本轮）
    // 同时传 followupQuestion，让 assist 生成内容紧扣当前对话焦点
    setImmediate(() => svc.runAssistJob(req.params.id, { modelId, role, chatRound: currentRound, followupQuestion })
      .catch(e => console.error(`[assist.${pick.method}] 任务异常:`, e.message)));

    res.status(202).json({
      method: pick.method,
      reason: pick.reason,
      status: 'generating',
    });
  } catch (e) { next(e); }
});

    // 手动指定 method（用户主动选）
router.post('/:id/assist/:method', async (req, res, next) => {
  try {
    const { method } = req.params;
    const { modelId, role, productName } = req.body || {};
    const reqRec = reqStore.getById(req.params.id);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    if (reqRec.status !== 'idea') {
      return res.status(409).json({ error: 'ONLY_IDEA_STATUS', currentStatus: reqRec.status });
    }

    const svc = assists.getAssist(method);
    if (!svc) return res.status(400).json({ error: 'UNKNOWN_METHOD', method });
    if (!svc.runAssistJob) return res.status(500).json({ error: 'ASSIST_HAS_NO_RUNNER' });

    const deepDiveOf = req.body?.deepDiveOf;
    const manualBrief = (() => { try { return JSON.parse(reqRec.thinking_brief || 'null'); } catch { return null; } })();
    const manualRound = manualBrief?.chat_round || 1;
    const manualFocus = manualBrief?.followup_question || '';
    setImmediate(() => svc.runAssistJob(req.params.id, { modelId, role, chatRound: manualRound, followupQuestion: manualFocus, deepDiveOf, productName })
      .catch(e => console.error(`[assist.${method}] 任务异常:`, e.message)));

    res.status(202).json({ method, status: 'generating' });
  } catch (e) { next(e); }
});

// v0.3.6：「都不符合，再换一批」按钮
//   跟 /assist/:method 的区别：强制重跑（绕过 visual.js 的 already_done 保护 + scenarios/decision-tree 也会重跑）
//   旧选择不进 used（因为用户没选），但标记这批已被换过（避免下次换出同样内容）
router.post('/:id/assist/:method/regenerate', async (req, res, next) => {
  try {
    const { method } = req.params;
    const { modelId, role } = req.body || {};
    const reqRec = reqStore.getById(req.params.id);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    if (reqRec.status !== 'idea') {
      return res.status(409).json({ error: 'ONLY_IDEA_STATUS', currentStatus: reqRec.status });
    }

    // 只有 3 种适合换（scenarios / decision_tree / visual）
    const REGENERATABLE = ['scenarios', 'decision_tree', 'visual', 'reference'];
    if (!REGENERATABLE.includes(method)) {
      return res.status(400).json({ error: 'METHOD_NOT_REGENERATABLE', method });
    }

    const svc = assists.getAssist(method);
    if (!svc || !svc.runAssistJob) return res.status(500).json({ error: 'ASSIST_HAS_NO_RUNNER' });

    // 标记当前 batch 已被"换过"（不进 used，因为用户没选）
    //   存到 req 上的标记字段，让 runAssistJob / dispatcher 知道该换
    const regenBrief = (() => { try { return JSON.parse(reqRec.thinking_brief || 'null'); } catch { return null; } })();
    const chatRound = regenBrief?.chat_round || 1;
    const regenFocus = regenBrief?.followup_question || '';

    setImmediate(() => svc.runAssistJob(req.params.id, {
      modelId,
      role,
      chatRound,
      followupQuestion: regenFocus,
      forceRegenerate: true,  // 关键：让 service 知道这是"换一批"调用
    }).catch(e => console.error(`[assist.regen.${method}] 任务异常:`, e.message)));

    res.status(202).json({ method, status: 'generating', regenerate: true });
  } catch (e) { next(e); }
});

// 标记用户"使用"了某个辅助手段（勾选/表态）
router.post('/:id/assist/:method/use', async (req, res, next) => {
  try {
    const { method } = req.params;
    const body = req.body || {};
    const reqRec = reqStore.getById(req.params.id);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });

    const svc = assists.getAssist(method);
    if (!svc) return res.status(400).json({ error: 'UNKNOWN_METHOD', method });

    let result = null;
    if (method === 'decision_tree') result = svc.markUsed(req.params.id, body.branchIdx);
    else if (method === 'scenarios') result = svc.markPicked(req.params.id, body.idx);
    else if (method === 'diagnosis') result = svc.markUsed(req.params.id);
    else if (method === 'tradeoff') result = svc.setPick(req.params.id, body.dimIdx, body.pick);
    else if (method === 'arch') result = svc.togglePick(req.params.id, body.idx);
    else if (method === 'visual') {
      // v0.3.3 B+++：visual 选中某个变体 → 复用 insightPreviews.pickVariant（会写 picked + 合并到 srs.summary）
      const { pickVariant } = require('../services/insight-previews');
      result = pickVariant(req.params.id, body.variantId);
    }
    else if (method === 'competitive') {
      // v0.3.6：竞品分析 → 标记已阅
      result = svc.markUsed(req.params.id);
    }
    else if (method === 'reference') {
      // v0.3.6：借鉴卡片 → 切换选中
      result = svc.togglePick(req.params.id, body.idx);
    }
    else if (method === 'pains' || method === 'stakeholders' || method === 'risks' || method === 'assumptions') {
      // v0.4：4 个新辅助手段 → 标记已阅/跳过
      result = svc.markUsed(req.params.id);
    }
    else return res.status(400).json({ error: 'METHOD_HAS_NO_USE_HANDLER' });

    res.json({ method, result });
  } catch (e) { next(e); }
});

// ============================================================
// 决策树分支详情（v0.3.2 极简思路区 增量）
//   用户点开分支的「类比徽章」→ 生成 3-5 个该分支的设计特色 + 配图
// ============================================================
const branchDetailService = require('../services/branch-detail');
const rewriteService = require('../services/rewrite-description');
const briefServiceRegen = require('../services/thinking-brief');

// 启动生成（fire-and-forget，立即返回 202）
router.post('/:id/thinking-brief/branch-detail', async (req, res, next) => {
  try {
    const { branchIdx, modelId, role } = req.body || {};
    if (typeof branchIdx !== 'number' || branchIdx < 0) {
      return res.status(400).json({ error: 'INVALID_BRANCH_IDX' });
    }
    const reqRec = reqStore.getById(req.params.id);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });

    setImmediate(() => branchDetailService.runBranchDetailJob(req.params.id, branchIdx, { modelId, role })
      .catch(e => console.error('[branch-detail] 任务异常:', e)));
    res.status(202).json({ message: '分支详情生成已启动', status: 'generating' });
  } catch (e) { next(e); }
});

// 读取详情（前端轮询用）
router.get('/:id/thinking-brief/branch-detail/:branchIdx', (req, res, next) => {
  try {
    const branchIdx = parseInt(req.params.branchIdx, 10);
    if (isNaN(branchIdx) || branchIdx < 0) {
      return res.status(400).json({ error: 'INVALID_BRANCH_IDX' });
    }
    const detail = branchDetailService.getBranchDetail(req.params.id, branchIdx);
    if (!detail) return res.status(404).json({ error: 'NOT_GENERATED' });

    // v0.3.3：附带当前决策树数据（assist_decision_tree），前端渲染详情面板时拿 branch label/desc
    const reqRec = reqStore.getById(req.params.id);
    let tree = [];
    if (reqRec) {
      try {
        const assist = JSON.parse(reqRec.assist_decision_tree || 'null');
        if (assist && Array.isArray(assist.tree)) tree = assist.tree;
      } catch { /* 静默 */ }
      // 老 brief.decision_tree 兜底
      if (tree.length === 0) {
        try {
          const brief = JSON.parse(reqRec.thinking_brief || 'null');
          if (brief && Array.isArray(brief.decision_tree)) tree = brief.decision_tree;
        } catch { /* 静默 */ }
      }
    }
    res.json({ branchDetail: { ...detail, tree } });
  } catch (e) { next(e); }
});

// ============================================================
// v0.3.5 新增：仅追加补充（不动 description）
//   📤 发送按钮用 → 保留用户最初输入的描述，不被 LLM 自动改写
//   旧的 /rewrite-description 路由保留 → 给「✨ AI 重新组织」按钮 + 决策树勾选 + 描述历史恢复用
// ============================================================
router.post('/:id/supplement', async (req, res, next) => {
  try {
    const { supplement, supplementSource, autoRegenBrief } = req.body || {};
    const reqRec = reqStore.getById(req.params.id);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    if (reqRec.status !== 'idea') {
      return res.status(409).json({ error: 'ONLY_IDEA_STATUS', currentStatus: reqRec.status });
    }

    // 仅追加 supplement_history，不动 description（保留创作主权）
    const result = await rewriteService.addSupplement(req.params.id, { supplement, supplementSource });

    // 触发 brief 重生 + 重评 clarity（v0.3.5 修复：让 AI 看到补充后重新评估）
    //   跟原 /rewrite-description 一致，让 brief + clarity 跟 supplement_history 同步
    let briefRegen = null;
    if (autoRegenBrief !== false) {
      setImmediate(async () => {
        try {
          // 先读最新的 supplement_history（addSupplement 已经写入）
          const fresh = reqStore.getById(req.params.id);
          let supplementHistory = [];
          try {
            supplementHistory = JSON.parse(fresh?.supplement_history || '[]');
            if (!Array.isArray(supplementHistory)) supplementHistory = [];
          } catch (e) { /* 静默降级 */ }

          await briefServiceRegen.runBriefJob(req.params.id, {});
          console.log(`[supplement.assist] ${req.params.id} brief 已重生（路由器在 brief 内部触发）`);

          // v0.3.5 修复：brief 重生后同步重评 clarity，让用户看到"补充让需求变清晰"的反馈
          try {
            const { assessClarity } = require('../services/insight-previews');
            const afterFresh = reqStore.getById(req.params.id);
            if (afterFresh) {
              const clarityResult = await assessClarity(
                afterFresh.title, afterFresh.description, null,
                supplementHistory  // 把 supplement_history 喂给 clarity 评估
              );
              if (clarityResult?.clarity) {
                reqStore.update(req.params.id, {
                  input_clarity: clarityResult.clarity,
                  clarity_reason: clarityResult.reason || '',
                  clarity_model: clarityResult.modelId,
                });
                console.log(`[supplement.clarity] ${req.params.id} 重新评估明确度: ${clarityResult.clarity}`);
              }
            }
          } catch (e) { console.error('[supplement] 重评明确度失败（非阻塞）:', e.message); }
        } catch (e) {
          console.error('[supplement] 自动重新生成思路异常:', e.message);
        }
      });
      briefRegen = 'started';
    }

    res.json({
      supplementHistoryCount: result.supplementHistoryCount,
      added: result.added,
      briefRegen,
    });
  } catch (e) { next(e); }
});

// v0.3.5 新增：读取补充历史（前端 idea panel 展示用）
router.get('/:id/supplement-history', (req, res, next) => {
  try {
    const reqRec = reqStore.getById(req.params.id);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    let history = [];
    try { history = JSON.parse(reqRec.supplement_history || '[]'); } catch { history = []; }
    res.json({
      history: history.map((h, i) => ({
        index: i,
        role: h.role || 'user',
        text: h.text || '',
        opening: h.opening || '',
        understanding: h.understanding || '',
        followup_question: h.followup_question || '',
        source: h.source || 'idea_supplement',
        at: h.at || null,
      })),
      totalCount: history.length,
    });
  } catch (e) { next(e); }
});

// ============================================================
// 需求描述重新组织（v0.3.2 增量）
//   - 勾选特色 / 手工补充 → LLM 把「原始 + 痕迹」重新组织成结构化描述
//   - 旧描述进 description_history（最近 5 份）
//   - 重新组织完成后自动触发「重新生成思路」（基于最新描述）
// ============================================================
router.post('/:id/rewrite-description', async (req, res, next) => {
  try {
    const { supplement, modelId, role, autoRegenBrief, supplementSource } = req.body || {};
    const reqRec = reqStore.getById(req.params.id);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });

    // 同步执行 rewrite（前端要立即看新描述）
    // v0.3.3 B+++：把 supplementSource 一并传入 → 写入 supplement_history 时带标签
    //   标签让 LLM 知道这条补充是来自「用户手写/决策树勾选/scenario 选/arch 圈/...」
    const result = await rewriteService.runRewriteJob(req.params.id, { supplement, modelId, supplementSource });

    // v0.3.3：重整后同步重评明确度 → 徽章立刻更新
    // （用最新的 title + description 评估；modelId 不传，让后端按 capabilities 自动选）
    let clarityResult = null;
    try {
      const { assessClarity } = require('../services/insight-previews');
      const fresh = reqStore.getById(req.params.id);
      if (fresh) {
        // v0.3.5 修复：clarity 评估也要看 supplement_history
        let supplementHistory = [];
        try {
          supplementHistory = JSON.parse(fresh.supplement_history || '[]');
          if (!Array.isArray(supplementHistory)) supplementHistory = [];
        } catch (e) { /* 静默降级 */ }
        clarityResult = await assessClarity(fresh.title, fresh.description, null, supplementHistory);
        if (clarityResult?.clarity) {
          reqStore.update(req.params.id, {
            input_clarity: clarityResult.clarity,
            clarity_reason: clarityResult.reason || '',
            clarity_model: clarityResult.modelId,
          });
        }
      }
    } catch (e) { console.error('[rewrite] 重评明确度失败（非阻塞）:', e.message); }

    // autoRegenBrief 默认 true：基于最新 description 重新生成思路
    let briefRegen = null;
    if (autoRegenBrief !== false) {
      setImmediate(async () => {
        try {
          await briefServiceRegen.runBriefJob(req.params.id, { modelId, role });
          // v0.3.3 B 方案：路由器调用已内嵌到 runBriefJob 内部，brief 完成自动调一次
          //   这里不再重复触发，避免同一 chat_round 选多种
          console.log(`[rewrite.assist] ${req.params.id} brief 已重生（路由器在 brief 内部触发）`);
        } catch (e) { console.error('[rewrite] 自动重新生成思路异常:', e.message); }
      });
      briefRegen = 'started';
    }

    res.json({
      description: result.description,
      modelId: result.modelId,
      historyCount: result.historyCount,
      supplementHistoryCount: result.supplementHistoryCount,  // v0.3.3 B+++ 累加计数
      briefRegen,
      clarity: clarityResult?.clarity || null,
      clarityReason: clarityResult?.reason || null,
    });
  } catch (e) { next(e); }
});

// 读取描述历史（v0.3.2 增量）
router.get('/:id/description-history', (req, res, next) => {
  try {
    const reqRec = reqStore.getById(req.params.id);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    let history = [];
    try { history = JSON.parse(reqRec.description_history || '[]'); } catch { history = []; }
    res.json({
      history: history.map((h, i) => ({
        index: i,
        description: h.description || '',
        supplement: h.supplement || null,
        rewritten_at: h.rewritten_at || null,
        model: h.model || null,
      })),
      currentDescription: reqRec.description || '',
    });
  } catch (e) { next(e); }
});

// ============================================================
// 导出 AI 回复为 Word 文档（v0.8）
//   提取当前 AI brief 内容 → LLM 优化格式 → 生成 .docx 下载
// ============================================================
router.post('/:id/export-word', async (req, res, next) => {
  try {
    const wordExport = require('../services/word-export');
    const { filePath, fileName } = await wordExport.exportBriefToWord(req.params.id, {
      chatRound: req.body?.chatRound,
      modelId: req.body?.modelId,
    });
    const fs = require('fs');
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Length', stat.size);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('end', () => {
      // 发送完后清理临时文件
      try { fs.unlinkSync(filePath); } catch {}
    });
  } catch (e) {
    if (e.message === 'BRIEF_NOT_READY') return res.status(400).json({ error: 'BRIEF_NOT_READY', message: 'AI 回复尚未就绪，请稍后再试' });
    if (e.message === 'BRIEF_EMPTY') return res.status(400).json({ error: 'BRIEF_EMPTY', message: 'AI 回复内容为空，无法导出' });
    if (e.message === 'REQ_NOT_FOUND') return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    next(e);
  }
});

module.exports = router;
