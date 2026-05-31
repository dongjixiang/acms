// 契约匹配验证器 — 在所有子需求进入 review 前运行
// 验证规则定义在 skill-contract-validator.md，代码只负责执行匹配逻辑

const reqStore = require('../stores/requirement-store');

/**
 * 提取文本中的核心关键词（中文分词简化版）
 */
function extractKeywords(text) {
  if (!text) return [];
  const stopWords = new Set(['的', '了', '是', '在', '和', '与', '或', '需要', '提供', '使用', '包含',
    'the', 'a', 'an', 'to', 'for', 'of', 'in', 'and', 'or', '请', '一个', '这个', '该', '等', '其']);
  const words = [];

  // 先提取英文单词（保持完整，如 CRUD, API, Product）
  const enMatches = text.match(/[A-Za-z][A-Za-z0-9_]*/g) || [];
  for (const w of enMatches) {
    const lower = w.toLowerCase();
    if (!stopWords.has(lower) && lower.length > 1) words.push(lower);
  }

  // 再提取中文词汇：按常见分隔符拆分后取非英文字段
  const segments = text.split(/[，,、\s()（）:：/]+/).filter(Boolean);
  for (const seg of segments) {
    // 去掉已匹配的英文部分，保留中文
    const cnPart = seg.replace(/[A-Za-z0-9_]+/g, '').trim();
    if (cnPart.length >= 2) {
      // 对较长中文段再进行二元切分
      if (cnPart.length <= 4) {
        words.push(cnPart);
      } else {
        for (let i = 0; i < cnPart.length - 1; i++) {
          words.push(cnPart.substring(i, i + 2));
        }
      }
    }
  }

  return [...new Set(words.filter(w => w.length >= 1))];
}

/**
 * 计算关键词匹配度
 * @returns {number} 0-1 的匹配比例
 */
function matchScore(consumerText, providerText) {
  const consKeys = extractKeywords(consumerText);
  const provKeys = extractKeywords(providerText);
  if (consKeys.length === 0) return 0;
  let matched = 0;
  for (const ck of consKeys) {
    for (const pk of provKeys) {
      if (pk.includes(ck) || ck.includes(pk)) {
        matched++;
        break;
      }
    }
  }
  return matched / consKeys.length;
}

/**
 * 验证父需求的所有子需求的契约匹配
 * @param {string} parentReqId — 主需求 ID
 * @returns {{ passed: boolean, checks: [], summary: string }}
 */
function validateSiblingContracts(parentReqId) {
  const parent = reqStore.getById(parentReqId);
  if (!parent) return { passed: true, checks: [], summary: '父需求不存在' };

  const children = reqStore.findChildren(parentReqId);
  if (children.length < 2) {
    return { passed: true, checks: [], summary: '子需求不足2个，无需契约检查' };
  }

  const archSpec = JSON.parse(parent.arch_spec || '{}');
  const glossary = (archSpec.domain && archSpec.domain.glossary) || [];
  const checks = [];

  // 收集所有 provides 和 consumes
  const allProvides = []; // [{ childId, childTitle, description }]
  const allConsumes = []; // [{ childId, childTitle, description }]
  const childContracts = []; // [{ childId, childTitle, hasProvides, hasConsumes }]

  for (const child of children) {
    const contracts = JSON.parse(child.interface_contracts || '[]');
    let hasProvides = false, hasConsumes = false;

    for (const c of contracts) {
      const desc = c.description || c.commitment || '';
      if (c.direction === 'provides') {
        allProvides.push({ childId: child.id, childTitle: child.title, description: desc, raw: c });
        hasProvides = true;
      } else if (c.direction === 'consumes') {
        allConsumes.push({ childId: child.id, childTitle: child.title, description: desc, raw: c });
        hasConsumes = true;
      }
    }
    childContracts.push({
      childId: child.id, childTitle: child.title,
      hasProvides, hasConsumes,
      contractCount: contracts.length,
    });
  }

  // ── 规则 1: consumes 必须匹配 provides（error）──
  const unmatchedConsumes = [];
  for (const cons of allConsumes) {
    let matched = false;
    for (const prov of allProvides) {
      if (cons.childId === prov.childId) continue; // 不匹配自己
      if (matchScore(cons.description, prov.description) >= 0.5) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      unmatchedConsumes.push({ child: cons.childTitle, childId: cons.childId, consumes: cons.description });
    }
  }
  if (unmatchedConsumes.length > 0) {
    checks.push({ rule: '规则1: consumes未匹配provides', severity: 'error', items: unmatchedConsumes.map(u => ({ ...u, status: 'unmatched' })) });
  }

  // ── 规则 2: provides 无人消费（warning）──
  const unconsumedProvides = [];
  for (const prov of allProvides) {
    let matched = false;
    for (const cons of allConsumes) {
      if (cons.childId === prov.childId) continue;
      if (matchScore(cons.description, prov.description) >= 0.5) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      unconsumedProvides.push({ child: prov.childTitle, childId: prov.childId, provides: prov.description });
    }
  }
  if (unconsumedProvides.length > 0) {
    checks.push({ rule: '规则2: provides无人消费', severity: 'warning', items: unconsumedProvides.map(u => ({ ...u, status: 'unconsumed' })) });
  }

  // ── 规则 3: 子需求无交互声明（warning）──
  const isolated = childContracts.filter(c => !c.hasProvides && !c.hasConsumes);
  if (isolated.length > 0) {
    checks.push({
      rule: '规则3: 子需求无交互声明',
      severity: 'warning',
      items: isolated.map(i => ({ child: i.childTitle, childId: i.childId, status: 'isolated', note: '既未声明对外提供也未声明消费其他模块，可能是独立模块或遗漏协作声明' })),
    });
  }

  // ── 规则 4: 术语引用一致性（info）──
  if (glossary.length > 0) {
    const glossaryTerms = new Set(glossary.map(g => g.term));
    const unknownTerms = [];
    for (const item of [...allProvides, ...allConsumes]) {
      const desc = item.description;
      for (const term of glossaryTerms) {
        if (desc.includes(term)) {
          glossaryTerms.delete(term); // 标记已使用
        }
      }
    }
    // 检查是否有未使用的 glossary 术语
    for (const g of glossary) {
      if (glossaryTerms.has(g.term)) {
        unknownTerms.push({ term: g.term, note: '术语表中定义但在契约中未引用' });
      }
    }
    if (unknownTerms.length > 0) {
      checks.push({ rule: '规则4: 术语引用一致性', severity: 'info', items: unknownTerms });
    }
  }

  // ── 汇总 ──
  const errors = checks.filter(c => c.severity === 'error').length;
  const warnings = checks.filter(c => c.severity === 'warning').length;
  const infos = checks.filter(c => c.severity === 'info').length;
  const passed = errors === 0;

  const summaryParts = [];
  if (passed) summaryParts.push('✅ 契约匹配通过');
  else summaryParts.push(`❌ ${errors} 个阻塞问题`);
  if (warnings > 0) summaryParts.push(`${warnings} 个警告`);
  if (infos > 0) summaryParts.push(`${infos} 个提示`);

  return { passed, checks, summary: summaryParts.join('，'), contractStats: { provides: allProvides.length, consumes: allConsumes.length, matchedConsumes: allConsumes.length - unmatchedConsumes.length, unmatchedConsumes: unmatchedConsumes.length } };
}

module.exports = { validateSiblingContracts, extractKeywords, matchScore };
