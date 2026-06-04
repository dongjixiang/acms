// 需求业务逻辑 — 从 routes 中提取
const reqStore = require('../stores/requirement-store');
const taskStore = require('../stores/task-store');
const eventBus = require('./event-bus');

const service = {
  // 分解需求为任务
  async decompose(requirementId, tasks, actorId) {
    const requirement = reqStore.getById(requirementId);
    if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404, code: 'REQ_NOT_FOUND' });
    if (requirement.status !== 'approved') throw Object.assign(new Error('只有已确认的需求才能分解'), { status: 400, code: 'REQ_NOT_APPROVED' });
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) throw Object.assign(new Error('请提供任务列表'), { status: 400, code: 'MISSING_TASKS' });

    const created = [];
    for (const t of tasks) {
      const task = taskStore.create({
        projectId: requirement.project_id, parentId: requirement.id,
        title: t.title, description: t.description || '', type: t.type || 'coding',
        priority: t.priority || requirement.priority, requiredSkills: t.requiredSkills || {},
        estimatedHours: t.estimatedHours || 0, dependsOn: t.dependsOn || [],
        wikiContext: requirement.wiki_path || '',
        linkedWiki: [{ page: requirement.wiki_path || '', role: 'parent', autoLoad: true }, ...(t.linkedWiki || [])],
      });
      created.push(task);
    }

    reqStore.transition(requirementId, 'in_execution');

    eventBus.emit('requirement.decomposed', {
      projectId: requirement.project_id,
      actor: { id: actorId || 'planner', type: 'agent' },
      target: { type: 'requirement', id: requirement.id },
      payload: { requirement, taskCount: created.length },
    });

    for (const task of created) {
      eventBus.emit('task.created', {
        projectId: requirement.project_id,
        actor: { id: actorId || 'planner', type: 'agent' },
        target: { type: 'task', id: task.id }, payload: { task },
      });
    }

    return { tasks: created, count: created.length };
  },

  // 提交审核（含 AI 5 维评审）
  async submitForReview(requirementId, agentId) {
    const requirement = reqStore.getById(requirementId);
    if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404, code: 'REQ_NOT_FOUND' });
    if (requirement.status !== 'clarifying') throw Object.assign(new Error('只有澄清中的需求才能提交审核'), { status: 400, code: 'INVALID_STATUS' });

    // 1. 字段门控检查（同步）
    const { getGateErrors } = require('./state-machine');
    const gate = getGateErrors(requirement);
    if (!gate.passed) {
      throw Object.assign(new Error('GATE_FAILED'), { status: 400, code: 'GATE_FAILED', errors: gate.errors });
    }

    // 2. AI 5 维评审（异步）
    let reviewResult = null;
    try {
      const { performReview } = require('./review-service');
      reviewResult = await performReview(requirement);
    } catch (e) {
      console.error(`[review] 评审异常: ${e.message}`);
      // 评审失败不阻塞流程，降级通过
      reviewResult = { passed: true, score: 3, issues: [], skipped: true };
    }

    // 存储评审报告到 requirements.review_report
    if (reviewResult && !reviewResult.skipped) {
      reqStore.update(requirementId, {
        review_report: JSON.stringify({
          score: reviewResult.score,
          issues: reviewResult.issues,
          passed: reviewResult.passed,
          reviewedAt: new Date().toISOString(),
          modelUsed: reviewResult.modelUsed,
        }),
      });
    }

    // 3. AI 评审不通过 → 退回到 clarifying，附带问题清单
    if (!reviewResult.passed) {
      // 将评审问题注入到澄清历史中
      const reviewMessage = `🔍 AI 评审发现以下问题，需要进一步澄清：\n` +
        reviewResult.issues.map((i, idx) =>
          `${idx + 1}. [${i.dimension}] ${i.detail}${i.suggestion ? '\n   建议: ' + i.suggestion : ''}`
        ).join('\n');
      reqStore.addClarification(requirementId, { role: 'agent', agentId: 'reviewer', content: reviewMessage });
      reqStore.update(requirementId, { refinement: JSON.stringify({ ...JSON.parse(requirement.refinement || '{}'), readyForReview: false }) });

      throw Object.assign(new Error('REVIEW_FAILED'), {
        status: 400,
        code: 'REVIEW_FAILED',
        review: reviewResult,
        message: reviewMessage,
      });
    }

    // 4. 字段门控 + AI 评审均通过 → 执行状态转换
    const now = new Date().toISOString();
    const approval = JSON.parse(requirement.approval || '{}');
    approval.submittedAt = now;
    approval.submittedBy = agentId;
    reqStore.update(requirementId, { approval: JSON.stringify(approval) });

    const refinement = JSON.parse(requirement.refinement || '{}');
    refinement.readyForReview = true;
    reqStore.update(requirementId, { refinement: JSON.stringify(refinement) });

    const result = reqStore.transition(requirementId, 'review', { id: agentId, type: 'agent' });
    if (result.error) throw Object.assign(new Error(result.error), { status: 400, code: result.error });

    eventBus.emit('requirement.review_submitted', {
      projectId: result.project_id,
      actor: { id: agentId, type: 'agent' },
      target: { type: 'requirement', id: result.id },
      payload: { requirement: result, review: reviewResult },
    });

    return { ...result, review: reviewResult };
  },

  // 确认需求
  async approve(requirementId) {
    const result = reqStore.transition(requirementId, 'approved', { id: 'user', type: 'human' });
    if (result.error) throw Object.assign(new Error(result.error), { status: 400, code: result.error });

    const projectStore = require('../stores/project-store');
    const wikiService = require('./wiki-service');
    const project = projectStore.getById(result.project_id);
    if (project && project.wiki_vault_path) {
      const content = wikiService.generateRequirementPage(result);
      const pagePath = `docs/需求/${result.id}-${result.title.replace(/[/\\?%*:|"<>]/g, '-')}.md`;
      wikiService.writePage(project.wiki_vault_path, pagePath, content);
      reqStore.update(result.id, { wiki_path: pagePath, wiki_synced: 1, last_wiki_sync: new Date().toISOString() });
    }

    // 子需求审批通过 → 触发父子同步检查
    if (result.parent_id) {
      try {
        const { syncOnChildApproved } = require('./sync-service');
        syncOnChildApproved(result.parent_id, result.id).then(sr => {
          if (sr && sr.hasChanges) {
            console.log(`[sync] 子需求 ${result.id} -> 父需求 ${result.parent_id}: ${sr.changes.length} 项边界变化`);
            eventBus.emit('requirement.sync_needed', {
              projectId: result.project_id,
              actor: { id: 'sync-agent', type: 'agent' },
              target: { type: 'requirement', id: result.parent_id },
              payload: { childId: result.id, changes: sr.changes },
            });
          }
        }).catch(e => console.error('[sync] 异步同步失败:', e.message));
      } catch (e) { /* 非关键 */ }
    }

    eventBus.emit('requirement.approved', {
      projectId: result.project_id, actor: { id: 'user', type: 'human' },
      target: { type: 'requirement', id: result.id }, payload: { requirement: result },
    });
    return result;
  },

  // 驳回需求
  async reject(requirementId, reason) {
    const requirement = reqStore.getById(requirementId);
    if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404, code: 'REQ_NOT_FOUND' });

    const approval = JSON.parse(requirement.approval || '{}');
    approval.rejections = approval.rejections || [];
    approval.rejections.push({ reason: reason || '未提供原因', time: new Date().toISOString() });
    reqStore.update(requirementId, { approval: JSON.stringify(approval) });

    const result = reqStore.transition(requirementId, 'clarifying');
    if (result.error) throw Object.assign(new Error(result.error), { status: 400, code: result.error });
    return result;
  },
};

module.exports = service;
