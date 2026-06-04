// 父子同步 + 变更影响服务
const reqStore = require('../stores/requirement-store');
const modelStore = require('../stores/model-store');
const { callLLM } = require('./llm-adapter');

/**
 * 子需求评审通过时触发同步检查
 * @param {string} parentId 
 * @param {string} childId 
 */
async function syncOnChildApproved(parentId, childId) {
  const parent = reqStore.getById(parentId);
  const child = reqStore.getById(childId);
  if (!parent || !child) return { skipped: true, reason: '父需求或子需求不存在' };

  const parentSrs = typeof parent.srs === 'string' ? JSON.parse(parent.srs) : (parent.srs || {});
  const childSrs = typeof child.srs === 'string' ? JSON.parse(child.srs) : (child.srs || {});

  // 获取模型并调用 LLM 分析
  const models = modelStore.getActive();
  const model = models[0];
  if (!model) return { skipped: true, reason: '无可用模型' };

  const baseRoles = require('./ai-clarify-service');
  const prompt = baseRoles.buildPrompt('sync-check');

  const context = {
    parentTitle: parent.title,
    parentScopeIn: parentSrs.scopeIn || [],
    parentAC: parentSrs.acceptanceCriteria || [],
    childTitle: child.title,
    childScopeIn: childSrs.scopeIn || [],
    childAC: childSrs.acceptanceCriteria || [],
  };

  try {
    const result = await callLLM(model.id, [
      { role: 'system', content: prompt },
      { role: 'user', content: `请分析以下父子需求的匹配情况：\n\n${JSON.stringify(context, null, 2)}` },
    ], { temperature: 0.3, maxTokens: 2000, jsonMode: true, caller: 'sync-check' });

    let parsed;
    try { parsed = JSON.parse(result.content); } catch {
      const m = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) { try { parsed = JSON.parse(m[1]); } catch {} }
    }

    if (!parsed) return { skipped: true, reason: 'LLM 返回格式异常' };

    const changes = (parsed.changes || []).slice(0, 5);

    // 如果需要更新父需求，记录 changelog
    if (parsed.needsParentUpdate) {
      const changeLog = JSON.parse(parent.change_log || '[]');
      changeLog.push({
        stage: 'child-approved',
        timestamp: new Date().toISOString(),
        childId: childId,
        description: `子需求「${child.title}」评审通过：${changes.map(c => c.description).join('; ')}`,
      });
      reqStore.update(parentId, { change_log: JSON.stringify(changeLog) });
      console.log(`[sync] 父需求 ${parentId} 更新: ${changes.length} 项变化`);
    }

    return { hasChanges: parsed.hasChanges, changes, needsParentUpdate: parsed.needsParentUpdate };
  } catch (e) {
    console.error(`[sync] 同步检查失败: ${e.message}`);
    return { skipped: true, reason: e.message };
  }
}

/**
 * 手动触发父需求刷新 — AI 对比所有子需求的当前状态，生成差异报告
 * @param {string} parentId 
 */
async function triggerParentRefresh(parentId) {
  const parent = reqStore.getById(parentId);
  if (!parent) throw Object.assign(new Error('父需求不存在'), { status: 404 });

  const children = reqStore.findChildren(parentId);
  if (children.length === 0) return { message: '没有子需求', childrenCount: 0 };

  const parentSrs = typeof parent.srs === 'string' ? JSON.parse(parent.srs) : (parent.srs || {});

  // 收集所有子需求的当前状态
  const childStatuses = children.map(c => {
    const cs = typeof c.srs === 'string' ? JSON.parse(c.srs) : (c.srs || {});
    return {
      id: c.id, title: c.title, status: c.status,
      scopeIn: cs.scopeIn || [],
      acceptanceCriteria: cs.acceptanceCriteria || [],
    };
  });

  // 对比父和所有子的 scopeIn 覆盖
  const allChildScopeIn = childStatuses.flatMap(c => c.scopeIn);
  const parentScopeIn = parentSrs.scopeIn || [];
  const uncoveredParentScopeIn = parentScopeIn.filter(ps =>
    !allChildScopeIn.some(cs => cs.includes(ps.substring(0, 10)))
  );

  const totalChildren = children.length;
  const doneChildren = children.filter(c => c.status === 'done').length;

  // 计算流程覆盖
  const flowCoverages = children
    .map(c => JSON.parse(c.flow_coverage || '{}'))
    .filter(fc => fc.covers);
  const allCoveredNodes = new Set();
  flowCoverages.forEach(fc => (fc.covers || []).forEach(n => allCoveredNodes.add(n)));
  const maxFlowNode = flowCoverages.reduce((max, fc) => Math.max(max, ...(fc.covers || [0])), 0);
  const flowCoveragePct = maxFlowNode > 0 ? Math.round((allCoveredNodes.size / maxFlowNode) * 100) : 0;

  const report = {
    parentId,
    parentTitle: parent.title,
    parentRole: parent.role || 'normal',
    parentStatus: parent.status,
    childrenCount: totalChildren,
    doneCount: doneChildren,
    allDone: doneChildren === totalChildren,
    flowCoverage: flowCoveragePct,
    uncoveredParentScopeIn,
    childStatuses,
    refreshedAt: new Date().toISOString(),
  };

  // 更新 changelog
  const changeLog = JSON.parse(parent.change_log || '[]');
  changeLog.push({
    stage: 'parent-refresh',
    timestamp: new Date().toISOString(),
    description: `手动刷新: ${doneChildren}/${totalChildren} 子需求完成, 流程覆盖 ${flowCoveragePct}%, ${uncoveredParentScopeIn.length} 条父 scopeIn 未覆盖`,
  });
  reqStore.update(parentId, { change_log: JSON.stringify(changeLog) });

  console.log(`[sync] 父需求 ${parentId} 刷新: ${doneChildren}/${totalChildren} done, ${flowCoveragePct}% 覆盖`);
  return report;
}

/**
 * 评估变更影响范围
 * @param {object} requirement 
 * @param {string} changeDescription 
 */
async function assessChangeImpact(requirement, changeDescription) {
  if (!changeDescription || changeDescription.trim().length === 0) {
    return { impactLevel: 'internal', reason: '无变更描述，默认内部变更', affectedRequirements: [], needsParentReview: false };
  }

  // 如果变更涉及的关键词明确指示内部/边界/全局
  const lower = changeDescription.toLowerCase();
  const globalKeywords = ['架构', 'sl', '响应时间', '性能', '重构整体', '数据库迁移', '整体'];
  const boundaryKeywords = ['接口', 'api', '签名', 'schema', '协议', '格式变更', '字段', '参数'];

  let impactLevel = 'internal';
  if (globalKeywords.some(k => lower.includes(k))) impactLevel = 'global';
  else if (boundaryKeywords.some(k => lower.includes(k))) impactLevel = 'boundary';

  const needsReview = impactLevel === 'global';

  // 如果有模型，尝试 LLM 分析
  const models = modelStore.getActive();
  if (models[0] && impactLevel !== 'internal') {
    try {
      const baseRoles = require('./ai-clarify-service');
      const prompt = baseRoles.buildPrompt('change-impact');
      const srs = typeof requirement.srs === 'string' ? JSON.parse(requirement.srs) : (requirement.srs || {});

      const result = await callLLM(models[0].id, [
        { role: 'system', content: prompt },
        { role: 'user', content: `变更描述: ${changeDescription}\n\n需求 SRS:\n${JSON.stringify({ title: requirement.title, srs }, null, 2)}` },
      ], { temperature: 0.3, maxTokens: 2000, jsonMode: true, caller: 'change-impact' });

      let parsed;
      try { parsed = JSON.parse(result.content); } catch {
        const m = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (m) { try { parsed = JSON.parse(m[1]); } catch {} }
      }

      if (parsed && parsed.impactLevel) {
        impactLevel = parsed.impactLevel;
        return parsed;
      }
    } catch (e) { /* 降级使用规则判断 */ }
  }

  return { impactLevel, reason: '基于关键词规则判断', affectedRequirements: [], needsParentReview: needsReview };
}

module.exports = { syncOnChildApproved, triggerParentRefresh, assessChangeImpact };
