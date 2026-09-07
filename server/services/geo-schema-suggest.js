// ACMS GEO v0.41 P2: Schema.org 输出建议服务
// 路径：server/services/geo-schema-suggest.js
//
// 动机：客户用 GEO 测出"在 AI 里没人提"，下一步问"那我该怎么改"。
// 现在没答案。本服务基于品牌已有 queries + intent 分布，纯规则推荐
// 应该生成哪些 Schema.org 结构化数据（FAQPage/HowTo/Product 等），
// 帮客户从"测"走到"做"。
//
// 借鉴：Yao Open Prompts schema-org-geo-optimization.md
// 数据基础：Profound AI 引用偏好（FAQ/HowTo 在 AI 答案中引用率显著高于普通页面）
//
// 调用：GET /api/geo/brands/:id/schema-suggestions
// 返回：suggestions[]（含 priority P0/P1/P2 + difficulty EASY/MEDIUM/HARD + impact HIGH/MEDIUM/LOW）

'use strict';

// ===== Schema.org 推荐规则（按 priority 排序）=====
// 每条规则：type + 触发条件 + 实施难度 + 预期影响 + 推荐理由 + 建议挂在哪些页面
const SCHEMA_RULES = [
  {
    type: 'Organization',
    priority: 'P0',
    difficulty: 'EASY',
    impact: 'HIGH',
    reason: 'AI 引用品牌时的基础 schema（AI 需要识别"这是哪个公司"）',
    urlPattern: '官网首页 <head> JSON-LD',
    applicable: () => true,
  },
  {
    type: 'WebSite',
    priority: 'P0',
    difficulty: 'EASY',
    impact: 'MEDIUM',
    reason: 'WebSite + Sitelinks Searchbox 让品牌在 AI 搜索结果里更突出',
    urlPattern: '官网首页',
    applicable: (queries, brand) => !!brand.domain,
  },
  {
    type: 'BreadcrumbList',
    priority: 'P0',
    difficulty: 'EASY',
    impact: 'MEDIUM',
    reason: '页面层级清晰帮助 AI 理解网站结构 + 引用时附带完整路径',
    urlPattern: '全站（每个有层级的页面）',
    applicable: (queries, brand) => !!brand.domain,
  },
  {
    type: 'FAQPage',
    priority: 'P0',
    difficulty: 'MEDIUM',
    impact: 'HIGH',
    reason: '信息型/排错型查询的 AI 答案里，FAQ 结构化数据引用率显著高于普通段落',
    urlPattern: '/faq, /help, /常见问题',
    // 触发：informational 或 troubleshooting 的 query 数量 ≥ 3
    applicable: (queries) => countByIntent(queries, ['informational', 'troubleshooting']) >= 3,
  },
  {
    type: 'HowTo',
    priority: 'P1',
    difficulty: 'MEDIUM',
    impact: 'HIGH',
    reason: '实施型查询（如何做/步骤/流程）需要 HowTo 结构化，AI 会直接引用步骤清单',
    urlPattern: '/guide, /tutorial, /操作指南',
    applicable: (queries) => countByIntent(queries, ['implementation']) >= 3,
  },
  {
    type: 'Product',
    priority: 'P1',
    difficulty: 'MEDIUM',
    impact: 'MEDIUM',
    reason: '比较型查询的 AI 答案经常引用 Product schema（品牌定位/规格/价格）',
    urlPattern: '/products, /pricing, /产品页',
    applicable: (queries, brand) =>
      countByIntent(queries, ['comparative']) >= 3 && !!brand.domain,
  },
  {
    type: 'QAPage',
    priority: 'P1',
    difficulty: 'HARD',
    impact: 'MEDIUM',
    reason: '问答型查询（具体问题）需要 QAPage，比 FAQ 更细粒度',
    urlPattern: '/qa, /问答',
    applicable: (queries) => countByIntent(queries, ['troubleshooting']) >= 5,
  },
  {
    type: 'Article',
    priority: 'P0',
    difficulty: 'EASY',
    impact: 'HIGH',
    reason: '每篇博客/案例加 Article schema（含 author/datePublished/image）提升 AI 引用率',
    urlPattern: '/blog/*, /case/*, /news/*',
    applicable: () => true,
  },
  {
    type: 'Review',
    priority: 'P2',
    difficulty: 'MEDIUM',
    impact: 'LOW',
    reason: '有真实用户评价时加 Review schema（含 rating），AI 比较时会引用',
    urlPattern: '/testimonials, /reviews, /客户评价',
    applicable: (queries) => countByIntent(queries, ['comparative']) >= 3,
  },
];

// ===== Helper：按 intent 统计 query 数 =====
function countByIntent(queries, intents) {
  if (!Array.isArray(queries)) return 0;
  return queries.filter(q => {
    // q.intent 可能是 'informational' 或 'intent:informational' 两种格式
    const rawIntent = String(q.intent || '').replace(/^intent:/, '');
    // 也尝试从 tags 推断
    const tagIntent = (q.tags || []).find(t => typeof t === 'string' && t.startsWith('intent:'));
    const tagIntentValue = tagIntent ? tagIntent.replace('intent:', '') : null;
    return intents.some(i => i === rawIntent || i === tagIntentValue);
  }).length;
}

// ===== 主函数：生成 Schema.org 建议 =====
function suggestSchemas(brand, queries) {
  const _brand = brand || {};
  const _queries = Array.isArray(queries) ? queries : [];

  // 统计
  const stats = {
    totalQueries: _queries.length,
    unbrandedQueries: 0,
    brandedQueries: 0,
    intentDistribution: {
      informational: 0,
      comparative: 0,
      implementation: 0,
      troubleshooting: 0,
      unknown: 0,
    },
  };
  for (const q of _queries) {
    if (q.is_branded || (q.systemTags || []).includes('branded')) {
      stats.brandedQueries++;
    } else {
      stats.unbrandedQueries++;
    }
    const rawIntent = String(q.intent || '').replace(/^intent:/, '');
    if (stats.intentDistribution[rawIntent] !== undefined) {
      stats.intentDistribution[rawIntent]++;
    } else {
      stats.intentDistribution.unknown++;
    }
  }

  // 应用规则
  const suggestions = [];
  for (const rule of SCHEMA_RULES) {
    try {
      if (rule.applicable(_queries, _brand)) {
        suggestions.push({
          type: rule.type,
          priority: rule.priority,
          difficulty: rule.difficulty,
          impact: rule.impact,
          reason: rule.reason,
          urlPattern: rule.urlPattern,
        });
      }
    } catch (e) {
      // 规则出错时跳过（不拖垮整体建议）
      // eslint-disable-next-line no-console
      console.warn(`[geo-schema-suggest] 规则 ${rule.type} 评估失败:`, e.message);
    }
  }

  // 按优先级分组
  const schemasByPriority = { P0: [], P1: [], P2: [] };
  for (const s of suggestions) {
    if (schemasByPriority[s.priority]) schemasByPriority[s.priority].push(s);
  }

  return {
    ok: true,
    brand: {
      id: _brand.id || null,
      name: _brand.name || null,
      domain: _brand.domain || null,
      industry: _brand.industry || null,
    },
    stats,
    suggestions,
    schemasByPriority,
    generatedAt: new Date().toISOString(),
    note: '基于 Profound AI 引用偏好数据 + Schema.org 官方规范，纯规则推荐。具体 schema 代码模板可参考 schema.org 或 Google Search Central 文档。',
  };
}

// ===== Quick win 排序：P0+EASY+HIGH 最先做 =====
function sortByQuickWin(suggestions) {
  const priorityScore = { P0: 3, P1: 2, P2: 1 };
  const difficultyScore = { EASY: 3, MEDIUM: 2, HARD: 1 };
  const impactScore = { HIGH: 3, MEDIUM: 2, LOW: 1 };

  return [...suggestions].sort((a, b) => {
    const scoreA = priorityScore[a.priority] + difficultyScore[a.difficulty] + impactScore[a.impact];
    const scoreB = priorityScore[b.priority] + difficultyScore[b.difficulty] + impactScore[b.impact];
    return scoreB - scoreA;
  });
}

module.exports = {
  suggestSchemas,
  sortByQuickWin,
  SCHEMA_RULES,
  countByIntent,
};
