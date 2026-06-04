// 拆分门控服务 — 流程地图生成 + 子需求设计 + shell 检测 + 上下文继承
const modelStore = require('../stores/model-store');
const reqStore = require('../stores/requirement-store');
const { callLLM } = require('./llm-adapter');

/**
 * 生成拆分方案
 * @param {string} requirementId
 * @returns {Promise<object>} { shouldSplit, reason, flowMap, children, hasShell, shellAdded, remainingParentScopeIn }
 */
async function generateSplitProposal(requirementId) {
  const requirement = reqStore.getById(requirementId);
  if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404 });

  const srs = typeof requirement.srs === 'string' ? JSON.parse(requirement.srs) : (requirement.srs || {});
  const scopeIn = srs.scopeIn || [];
  const ac = srs.acceptanceCriteria || [];

  // 如果 scopeIn ≤ 2 条 → 不需要拆
  if (scopeIn.length <= 2) {
    return { shouldSplit: false, reason: '需求范围较小（scopeIn ≤ 2条），不需要拆分', children: [] };
  }

  // 获取模型
  const models = modelStore.getActive();
  const model = models[0];
  if (!model) {
    console.log('[split-gate] 无可用模型，使用规则判断');
    return ruleBasedSplit(requirement, srs);
  }

  const baseRoles = require('./ai-clarify-service');
  const prompt = baseRoles.buildPrompt('split-gate');

  const context = {
    title: requirement.title,
    description: requirement.description || '',
    srs: srs,
    priority: requirement.priority,
  };

  const messages = [
    { role: 'system', content: prompt },
    { role: 'user', content: `请分析以下需求 SRS，判断是否需要拆分并设计方案：\n\n${JSON.stringify(context, null, 2)}` },
  ];

  try {
    const result = await callLLM(model.id, messages, {
      temperature: 0.3, maxTokens: 4000, jsonMode: true,
      projectId: requirement.project_id, caller: 'split-gate',
    });

    let parsed;
    try { parsed = JSON.parse(result.content); } catch {
      const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) { try { parsed = JSON.parse(jsonMatch[1]); } catch {} }
    }

    if (!parsed || typeof parsed.shouldSplit !== 'boolean') {
      console.log('[split-gate] LLM 返回格式异常，降级规则判断');
      return ruleBasedSplit(requirement, srs);
    }

    // 规范化 children
    const children = (parsed.children || []).map(c => ({
      title: c.title || '',
      inheritedScopeIn: Array.isArray(c.inheritedScopeIn) ? c.inheritedScopeIn : [],
      inheritedAC: Array.isArray(c.inheritedAC) ? c.inheritedAC : [],
      coversFlowNodes: Array.isArray(c.coversFlowNodes) ? c.coversFlowNodes : [],
      isShell: !!c.isShell,
    })).filter(c => c.title && c.title.trim().length >= 2);  // 过滤空标题

    const flowMap = Array.isArray(parsed.flowMap) ? parsed.flowMap : [];
    const remainingScopeIn = Array.isArray(parsed.remainingParentScopeIn) ? parsed.remainingParentScopeIn : [];

    return {
      shouldSplit: parsed.shouldSplit,
      reason: parsed.reason || '',
      flowMap,
      children,
      hasShell: children.some(c => c.isShell) || parsed.hasShell,
      shellAdded: parsed.shellAdded || '',
      remainingParentScopeIn: remainingScopeIn,
    };
  } catch (e) {
    console.error(`[split-gate] 调用异常: ${e.message}`);
    return ruleBasedSplit(requirement, srs);
  }
}

/**
 * 执行拆分（带上下文继承 + 父需求修剪 + flowCoverage 赋值）
 * @param {string} parentId
 * @param {Array} children - 来自 split proposal 的 children 数组
 * @param {object} proposal - 完整的 splitProposal
 * @returns {object} { parent, children }
 */
function executeSplit(parentId, children, proposal) {
  const parent = reqStore.getById(parentId);
  if (!parent) throw Object.assign(new Error('父需求不存在'), { status: 404 });

  const parentSrs = typeof parent.srs === 'string' ? JSON.parse(parent.srs) : (parent.srs || {});
  const parentArchSpec = JSON.parse(parent.arch_spec || '{}');
  const parentRefinement = JSON.parse(parent.refinement || '{}');
  const flowMap = (proposal && proposal.flowMap) || [];
  const flowMapStr = flowMap.join(' → ');

  const created = [];

  for (const child of children) {
    // 构建子需求的初始 SRS（继承父需求的 scopeIn/AC）
    const childSrs = {
      scopeIn: child.inheritedScopeIn || [],
      acceptanceCriteria: child.inheritedAC || [],
      technicalConstraints: parentSrs.technicalConstraints || [],
      summary: parentSrs.summary ? `${parentSrs.summary} → ${child.title}` : child.title,
    };

    // flowCoverage 赋值
    const flowCoverage = {
      flowMap: flowMapStr ? [flowMapStr] : [],
      covers: child.coversFlowNodes || [],
      providesEntry: child.isShell,
      providesIntegration: child.coversFlowNodes && child.coversFlowNodes.length > 2,
    };

    const req = reqStore.create({
      projectId: parent.project_id,
      title: child.title,
      description: `【继承自${parent.title}】${child.title}\n\n父需求背景: ${parent.description || ''}`,
      priority: parent.priority,
      parentId,
      createdBy: parent.created_by,
      archSpec: parentArchSpec,
      srs: JSON.stringify(childSrs),
      flowCoverage: JSON.stringify(flowCoverage),
      status: 'clarifying',  // 从 clarifying 起步，跳过 idea
    });

    created.push(req);
  }

  // === 父需求修剪为 container ===
  const remainingScopeIn = (proposal && proposal.remainingParentScopeIn) || [];

  // 如果 AI 没有给出 remainingParentScopeIn，自动推断：保留入口/集成类条目
  let trimmedScopeIn = remainingScopeIn;
  if (trimmedScopeIn.length === 0) {
    trimmedScopeIn = (parentSrs.scopeIn || []).filter(s =>
      /入口|导航|主界面|主页|集成|联调|部署|运维|整体|全局/i.test(s)
    );
    if (trimmedScopeIn.length === 0) {
      // 没有明显的入口/集成条目，保留前两条
      trimmedScopeIn = (parentSrs.scopeIn || []).slice(0, 2);
    }
  }

  // 生成容器型 AC
  const containerAC = [
    `所有子需求的 scopeIn 合起来覆盖用户完整流程`,
    `端到端性能 SLO 达成`,
  ];
  if (proposal && proposal.flowMap && proposal.flowMap.length > 0) {
    containerAC.push(`用户流程 ${proposal.flowMap.join(' → ')} 的每个节点都有子需求覆盖`);
  }

  const parentContainerSrs = {
    ...parentSrs,
    scopeIn: trimmedScopeIn.length > 0 ? trimmedScopeIn : ['应用主入口与导航', '系统集成与联调'],
    acceptanceCriteria: containerAC,
    technicalConstraints: parentSrs.technicalConstraints || [],
  };

  // 记录 changelog
  const changeLog = JSON.parse(parent.change_log || '[]');
  changeLog.push({
    stage: 'split',
    timestamp: new Date().toISOString(),
    description: `拆分为 ${created.length} 个子需求: ${created.map(c => c.title).join(', ')}。修剪为容器型父需求。`,
  });

  reqStore.update(parentId, {
    srs: JSON.stringify(parentContainerSrs),
    change_log: JSON.stringify(changeLog),
    role: 'container',
  });

  // 父需求转为 approved（等待子需求聚合）
  if (parent.status !== 'approved' && parent.status !== 'in_execution') {
    reqStore.transition(parentId, 'approved', { id: 'split-gate', type: 'agent' });
  }

  return { parent: reqStore.getById(parentId), children: created };
}

/**
 * 基于规则的拆分判断（降级方案）
 */
function ruleBasedSplit(requirement, srs) {
  const scopeIn = srs.scopeIn || [];
  if (scopeIn.length <= 2) {
    return { shouldSplit: false, reason: '需求范围较小，不需要拆分', children: [] };
  }

  // 检测是否涉及多个领域
  const domains = new Set();
  const domainKeywords = {
    game: ['关卡','角色','战斗','技能','NPC','地图','装备'],
    webapp: ['页面','前端','UI','路由','表单','组件'],
    api: ['API','接口','端点','REST','服务'],
    data: ['数据','报表','统计','分析','看板'],
    auth: ['登录','注册','认证','权限','角色'],
    payment: ['支付','订单','结算','退款'],
  };

  for (const s of scopeIn) {
    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some(k => s.includes(k))) domains.add(domain);
    }
  }

  if (domains.size >= 2 && scopeIn.length >= 3) {
    // 生成简单的子需求建议：每个 scopeIn 一个子需求，进入口检查
    const children = scopeIn.slice(0, 3).map((s, i) => ({
      title: s.length > 20 ? s.substring(0, 20) + '...' : s,
      inheritedScopeIn: [s],
      inheritedAC: [],
      coversFlowNodes: [i],
      isShell: /入口|导航|主界面|主页/.test(s),
    }));

    // shell 检测
    const hasShell = children.some(c => c.isShell);
    const shellAdded = !hasShell && children.length >= 3
      ? '主界面外壳与导航（自动创建）'
      : '';

    return {
      shouldSplit: true,
      reason: `需求涉及 ${domains.size} 个领域（${[...domains].join(', ')}），scopeIn ${scopeIn.length} 条，建议拆分`,
      flowMap: scopeIn.map((_, i) => `节点${i + 1}`),
      children,
      hasShell: hasShell || !!shellAdded,
      shellAdded,
      remainingParentScopeIn: ['应用主入口与导航', '系统集成与联调'],
    };
  }

  return { shouldSplit: false, reason: '需求范围单一，不需要拆分', children: [] };
}

module.exports = { generateSplitProposal, executeSplit };
