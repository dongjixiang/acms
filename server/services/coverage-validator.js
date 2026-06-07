// 覆盖率验证服务 — 任务分解后检查是否覆盖需求 SRS
// 纯规则匹配（无 LLM 调用），同步执行，不阻塞流程
const reqStore = require('../stores/requirement-store');
const taskStore = require('../stores/task-store');

/**
 * 从 scopeIn 条目中提取关键词（去停用词，保留 2-4 字核心词）
 */
function extractKeywords(text) {
  const stopWords = new Set([
    '功能', '系统', '模块', '实现', '支持', '提供', '包括', '具备',
    '相关', '管理', '处理', '进行', '可以', '需要', '能够', '使用',
    '基于', '通过', '完成', '所有', '其他', '的', '了', '和', '与',
  ]);
  // 提取 2-4 字词
  const words = [];
  for (let len = 4; len >= 2; len--) {
    for (let i = 0; i <= text.length - len; i++) {
      const w = text.substring(i, i + len);
      if (!stopWords.has(w) && /[\u4e00-\u9fff]/.test(w) && !words.includes(w)) {
        words.push(w);
      }
    }
  }
  // 也保留 ASCII 关键词（API, UI, DB 等）
  const asciiWords = text.match(/\b[A-Za-z]{2,}\b/g) || [];
  for (const w of asciiWords) {
    if (!words.includes(w)) words.push(w);
  }
  return words;
}

/**
 * 关键词是否匹配任务文本
 */
function matchesTask(taskText, keywords) {
  const lower = taskText.toLowerCase();
  let matchCount = 0;
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) matchCount++;
  }
  // 匹配率 ≥ 30% 即视为覆盖
  return keywords.length > 0 ? (matchCount / keywords.length >= 0.3) : false;
}

/**
 * ① 单需求验证：已创建的任务是否覆盖本需求的 SRS scopeIn
 *
 * @param {string} requirementId
 * @param {Array} createdTasks - 可选，传入已创建的任务数组（用于分解后立即验证）
 * @returns {object} { coveredItems, uncoveredItems[], coveragePct, total, warnings[] }
 */
function validateChildCoverage(requirementId, createdTasks) {
  const requirement = reqStore.getById(requirementId);
  if (!requirement) return { error: '需求不存在', coveragePct: 0 };

  const srs = JSON.parse(requirement.srs || '{}');
  const scopeIn = srs.scopeIn || [];
  const ac = srs.acceptanceCriteria || [];

  // 获取任务列表
  let tasks;
  if (createdTasks && Array.isArray(createdTasks)) {
    tasks = createdTasks;
  } else {
    const taskIds = JSON.parse(requirement.task_ids || '[]');
    tasks = taskIds.map(id => taskStore.getById(id)).filter(Boolean);
  }

  if (tasks.length === 0) {
    return {
      coveredItems: [],
      uncoveredItems: scopeIn.map(s => ({ text: s, source: 'scopeIn' })),
      coveragePct: 0,
      total: scopeIn.length + ac.length,
      warnings: ['尚无任务，无法验证覆盖率'],
    };
  }

  const allTaskText = tasks
    .map(t => `${t.title} ${t.description || ''}`)
    .join(' ');
  const coveredItems = [];
  const uncoveredItems = [];
  const warnings = [];

  // 逐条检查 scopeIn
  for (const item of scopeIn) {
    const keywords = extractKeywords(item);
    if (keywords.length === 0) {
      // 无法提取关键词的条目（纯 ASCII 或过短），用全文匹配
      if (allTaskText.toLowerCase().includes(item.toLowerCase())) {
        coveredItems.push({ text: item, source: 'scopeIn', matchedBy: item });
      } else {
        uncoveredItems.push({ text: item, source: 'scopeIn' });
      }
      continue;
    }
    if (matchesTask(allTaskText, keywords)) {
      coveredItems.push({ text: item, source: 'scopeIn', matchedBy: keywords.slice(0, 3).join(', ') });
    } else {
      uncoveredItems.push({ text: item, source: 'scopeIn' });
    }
  }

  // 逐条检查 acceptanceCriteria
  for (const item of ac) {
    const keywords = extractKeywords(item);
    if (keywords.length === 0) {
      if (allTaskText.toLowerCase().includes(item.toLowerCase())) {
        coveredItems.push({ text: item, source: 'acceptanceCriteria', matchedBy: item });
      } else {
        uncoveredItems.push({ text: item, source: 'acceptanceCriteria' });
      }
      continue;
    }
    if (matchesTask(allTaskText, keywords)) {
      coveredItems.push({ text: item, source: 'acceptanceCriteria', matchedBy: keywords.slice(0, 3).join(', ') });
    } else {
      uncoveredItems.push({ text: item, source: 'acceptanceCriteria' });
    }
  }

  const total = scopeIn.length + ac.length;
  const covered = coveredItems.length;
  const coveragePct = total > 0 ? Math.round((covered / total) * 100) : 0;

  if (uncoveredItems.length > 0) {
    warnings.push(`${uncoveredItems.length}/${total} 条需求条目未被任务覆盖（覆盖率 ${coveragePct}%）`);
    // 如果是 scopeIn 未覆盖，给出更具体的提示
    const uncoveredScope = uncoveredItems.filter(i => i.source === 'scopeIn');
    if (uncoveredScope.length > 0) {
      warnings.push(`未覆盖的功能范围: ${uncoveredScope.map(i => i.text).join('、')}`);
    }
  }

  return {
    coveredItems,
    uncoveredItems,
    coveragePct,
    total,
    warnings,
    taskCount: tasks.length,
  };
}

/**
 * ② 父需求聚合验证：所有子需求的任务合集是否覆盖父需求原始 scopeIn
 *
 * @param {string} parentId
 * @returns {object} { parentScopeIn, childrenCoverage[], gaps[], coveragePct, warnings }
 */
function validateParentAggregateCoverage(parentId) {
  const parent = reqStore.getById(parentId);
  if (!parent) return { error: '父需求不存在', coveragePct: 0 };

  // 取父需求的原始 SRS（从数据库读最新值，可能已被修剪）
  const parentSrs = JSON.parse(parent.srs || '{}');
  const parentScopeIn = parentSrs.scopeIn || [];

  // 收集所有子需求
  const children = reqStore.findChildren(parentId);
  if (children.length === 0) {
    return {
      parentScopeIn,
      childrenCoverage: [],
      gaps: parentScopeIn.map(s => ({ text: s, reason: '无子需求' })),
      coveragePct: 0,
      warnings: ['无子需求，无法聚合验证'],
    };
  }

  // 对每个子需求，收集其 scopeIn 和任务
  const childrenCoverage = [];
  const allCoveredItems = new Set();

  for (const child of children) {
    const childSrs = JSON.parse(child.srs || '{}');
    const childScopeIn = childSrs.scopeIn || [];
    const childCoverage = validateChildCoverage(child.id);
    const taskIds = JSON.parse(child.task_ids || '[]');

    childrenCoverage.push({
      id: child.id,
      title: child.title,
      scopeIn: childScopeIn,
      taskCount: taskIds.length,
      coveragePct: childCoverage.coveragePct || 0,
      uncoveredScope: (childCoverage.uncoveredItems || [])
        .filter(i => i.source === 'scopeIn')
        .map(i => i.text),
    });

    // 收集所有子需求覆盖的 scopeIn 条目文本
    for (const si of childScopeIn) {
      allCoveredItems.add(si.trim());
    }
    // 任务文本里也可能覆盖
    const taskIds2 = JSON.parse(child.task_ids || '[]');
    for (const tid of taskIds2) {
      const task = taskStore.getById(tid);
      if (task) {
        const taskText = `${task.title} ${task.description || ''}`;
        // 将任务文本中的关键词作为覆盖信号
        for (const pi of parentScopeIn) {
          const kw = extractKeywords(pi);
          if (kw.length > 0 && matchesTask(taskText, kw)) {
            allCoveredItems.add(pi.trim());
          }
        }
      }
    }
  }

  // 找出父需求 scopeIn 中未被覆盖的条目
  const gaps = [];
  for (const psi of parentScopeIn) {
    const trimmed = psi.trim();
    // 检查是否在子需求 scopeIn 中出现
    const inChildScope = children.some(child => {
      const cSrs = JSON.parse(child.srs || '{}');
      return (cSrs.scopeIn || []).some(csi => csi.includes(trimmed) || trimmed.includes(csi));
    });
    if (!inChildScope && !allCoveredItems.has(trimmed)) {
      // 再检查是否匹配任何子需求的任务文本
      const matchedByTask = children.some(child => {
        const tids = JSON.parse(child.task_ids || '[]');
        return tids.some(tid => {
          const task = taskStore.getById(tid);
          if (!task) return false;
          const text = `${task.title} ${task.description || ''}`;
          const kw = extractKeywords(trimmed);
          return kw.length > 0 && matchesTask(text, kw);
        });
      });
      if (!matchedByTask) {
        gaps.push({ text: psi, reason: '未出现在任何子需求的 SRS 或任务中' });
      }
    }
  }

  const totalItems = parentScopeIn.length;
  const coveredCount = totalItems - gaps.length;
  const coveragePct = totalItems > 0 ? Math.round((coveredCount / totalItems) * 100) : 0;

  const warnings = [];
  if (gaps.length > 0) {
    warnings.push(`父需求 ${parent.title} 的 ${gaps.length}/${totalItems} 条 scopeIn 未被任何子需求覆盖（聚合覆盖率 ${coveragePct}%）`);
    warnings.push(`缺失条目: ${gaps.map(g => g.text).join('、')}`);
  }

  return {
    parentTitle: parent.title,
    parentScopeIn,
    childrenCoverage,
    gaps,
    coveragePct,
    totalItems,
    warnings,
    childCount: children.length,
  };
}

/**
 * ③ 集成缺口检测：创建的任务中是否缺乏"串联"类任务
 *
 * 检查维度：
 * - 入口任务（main/entry point）
 * - 导航任务（页面/界面间切换）
 * - 集成任务（子系统串接）
 * - 边界任务（空态、加载、错误状态）
 *
 * @param {string} requirementId
 * @param {Array} createdTasks - 可选，已创建的任务数组
 * @returns {object} { hasIntegrationGap, gapDescription, suggestion, missingTypes[] }
 */
function detectIntegrationGaps(requirementId, createdTasks) {
  const requirement = reqStore.getById(requirementId);
  if (!requirement) return { hasIntegrationGap: false };

  const srs = JSON.parse(requirement.srs || '{}');
  const scopeIn = srs.scopeIn || [];

  let tasks;
  if (createdTasks && Array.isArray(createdTasks)) {
    tasks = createdTasks;
  } else {
    const taskIds = JSON.parse(requirement.task_ids || '[]');
    tasks = taskIds.map(id => taskStore.getById(id)).filter(Boolean);
  }

  const allTaskTexts = tasks.map(t => `${t.title} ${t.description || ''}`.toLowerCase()).join(' ');

  // 必须出现的任务类型
  const requiredTypes = [];

  // 1. 是否有 3+ 子系统但没有入口/导航任务？
  const subsystemCount = scopeIn.length;
  if (subsystemCount >= 3) {
    const hasEntry = /入口|主界面|首页|启动|主菜单|main\s*(menu|page)|entry\s*point/i.test(allTaskTexts);
    const hasNav = /导航|路由|切换|跳转|navigation|router|page\s*switch/i.test(allTaskTexts);
    if (!hasEntry) requiredTypes.push({ type: '入口', severity: 'error', suggestion: '缺少「主界面入口」任务，用户首次打开时无落脚点' });
    if (!hasNav) requiredTypes.push({ type: '导航', severity: 'warning', suggestion: '缺少「导航」任务，多个页面间无法切换' });
  }

  // 2. 是否有 2+ 子系统但没有集成任务？
  if (subsystemCount >= 2) {
    const hasIntegration = /集成|串联|联调|整合|整合|对接|integration|orchestrat/i.test(allTaskTexts);
    if (!hasIntegration) {
      requiredTypes.push({ type: '集成', severity: 'warning', suggestion: '缺少「系统集成」任务，各子系统独立实现后缺少串联' });
    }
  }

  // 3. 是否有边界状态检查？
  const hasEdgeCase = /空态|加载|错误|异常|loading|error|empty|边界|fallback/i.test(allTaskTexts);
  if (!hasEdgeCase && subsystemCount >= 2) {
    requiredTypes.push({ type: '边界状态', severity: 'info', suggestion: '未发现「空态/加载/异常」处理任务，建议补充' });
  }

  if (requiredTypes.length === 0) {
    return {
      hasIntegrationGap: false,
      gapDescription: '未发现明显集成缺口',
      suggestion: '',
      missingTypes: [],
    };
  }

  const missingLabels = requiredTypes.map(t => t.type);
  const descParts = requiredTypes
    .filter(t => t.severity === 'error' || t.severity === 'warning')
    .map(t => `[${t.severity === 'error' ? '必缺' : '建议'}] ${t.suggestion}`);

  return {
    hasIntegrationGap: requiredTypes.filter(t => t.severity === 'error').length > 0,
    gapDescription: descParts.join('；'),
    suggestion: `当前需求包含 ${subsystemCount} 个功能模块/子系统，建议补充: ${missingLabels.join('、')} 类任务`,
    missingTypes: requiredTypes,
  };
}

module.exports = {
  validateChildCoverage,
  validateParentAggregateCoverage,
  detectIntegrationGaps,
  extractKeywords,  // 导出供测试使用
};
