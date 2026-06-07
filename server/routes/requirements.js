// 需求 API 路由（精简版 — 业务逻辑在 services/requirement-service.js）
const express = require('express');
const router = express.Router();
const reqStore = require('../stores/requirement-store');
const eventBus = require('../services/event-bus');
const reqService = require('../services/requirement-service');

// 创建需求
router.post('/', (req, res, next) => {
  try {
    const { projectId, title, description, priority, tags, deadline, parentId } = req.body;
    if (!projectId || !title) return res.status(400).json({ error: 'MISSING_FIELDS' });
    const requirement = reqStore.create({ projectId, title, description, priority, tags, deadline, createdBy: req.agentId || 'user', parentId: parentId || null });
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

// 状态转换 — 切换到 approved 时检查具体性
router.post('/:id/transition', (req, res, next) => {
  try {
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
  const { deadline, title, description, priority, tags } = req.body;
  const updates = {};
  if (deadline !== undefined) updates.deadline = deadline;
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
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

module.exports = router;
