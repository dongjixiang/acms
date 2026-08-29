// ACMS GEO 提问模板库（v0.1 — Phase 1 Week 3）
// 用途：行业 prompt 模板 + Persona fan-out（多角色提问）
// 路径：server/services/geo-query-templates.js
//
// 设计要点：
//   - 行业 × 角色 × 问题类型 = 三维模板库
//   - 8 个行业 × 4 个角色 × 3 种问题 = 96 个基础模板
//   - Phase 1 起步：通用模板（不依赖行业），10 个高频问题
//   - 用户可在 dashboard 添加自定义模板（Phase 1 Week 5）
//
// 角色 Persona 4 个：
//   - CEO/创始人：商业视角（产品/市场/竞品）
//   - 客户/用户：使用视角（怎么用/好不好用/价格）
//   - 分析师/投资人：数据视角（估值/增长/趋势）
//   - 技术开发者：技术视角（架构/API/性能）

const GEO_STORE = require('./geo-store');

// === Persona 定义 ===
const PERSONAS = {
  ceo: {
    id: 'ceo',
    name: 'CEO/创始人',
    description: '商业视角，关注产品、市场、竞品、增长',
    icon: '👔',
  },
  customer: {
    id: 'customer',
    name: '客户/用户',
    description: '使用视角，关注功能、价格、易用性',
    icon: '🛒',
  },
  analyst: {
    id: 'analyst',
    name: '分析师/投资人',
    description: '数据视角，关注估值、增长、趋势',
    icon: '📊',
  },
  developer: {
    id: 'developer',
    name: '技术开发者',
    description: '技术视角，关注架构、API、性能',
    icon: '💻',
  },
};

// === 问题类别 ===
const CATEGORIES = {
  brand_intro: { id: 'brand_intro', name: '品牌介绍', icon: '🏷️' },
  product: { id: 'product', name: '产品功能', icon: '🛠️' },
  comparison: { id: 'comparison', name: '竞品对比', icon: '⚖️' },
  pricing: { id: 'pricing', name: '价格/成本', icon: '💰' },
  use_case: { id: 'use_case', name: '使用场景', icon: '💡' },
  industry: { id: 'industry', name: '行业趋势', icon: '📈' },
};

// === 模板生成 ===

// 生成针对某品牌 + persona 的 prompt 模板
function generatePromptTemplate({ brand, persona, category, customSuffix = '' }) {
  const p = PERSONAS[persona] || PERSONAS.customer;
  const c = CATEGORIES[category] || CATEGORIES.brand_intro;

  const templates = {
    brand_intro: {
      ceo: `请介绍 ${brand} 这家公司，重点说明其商业模式、核心产品和目标客户。`,
      customer: `${brand} 是什么？值得购买吗？普通用户的使用体验如何？`,
      analyst: `${brand} 的商业模式、市场规模和增长前景如何？有哪些投资亮点？`,
      developer: `${brand} 的技术栈、平台和开发者生态怎么样？`,
    },
    product: {
      ceo: `${brand} 的核心产品功能有哪些？差异化优势是什么？`,
      customer: `${brand} 的主要功能和使用体验如何？有什么优缺点？`,
      analyst: `${brand} 的产品组合和定价策略在市场中处于什么位置？`,
      developer: `${brand} 的 API、SDK 和技术文档质量如何？`,
    },
    comparison: {
      ceo: `${brand} 与主要竞品相比，竞争优势和劣势分别是什么？`,
      customer: `${brand} 跟其他类似产品比，哪个更好用？`,
      analyst: `${brand} 在行业中的市场地位和竞争格局如何？`,
      developer: `${brand} 与同类技术产品相比，技术差异在哪里？`,
    },
    pricing: {
      ceo: `${brand} 的定价策略和盈利模式是什么？`,
      customer: `${brand} 的价格如何？有哪些套餐？性价比怎么样？`,
      analyst: `${brand} 的定价在行业中是高还是低？有什么定价策略？`,
      developer: `${brand} 的开发者套餐和使用成本是多少？`,
    },
    use_case: {
      ceo: `${brand} 的典型客户和成功案例有哪些？`,
      customer: `谁在使用 ${brand}？解决了什么问题？真实体验如何？`,
      analyst: `${brand} 的市场应用场景和行业渗透率如何？`,
      developer: `使用 ${brand} 的开发者场景和集成案例有哪些？`,
    },
    industry: {
      ceo: `${brand} 所在行业的市场规模和未来趋势如何？`,
      customer: `${brand} 这个品类的发展趋势是什么？未来会怎样？`,
      analyst: `${brand} 所在的细分行业有哪些投资机会和风险？`,
      developer: `${brand} 涉及的技术领域未来发展方向是什么？`,
    },
  };

  let prompt = templates[category]?.[persona] || templates.brand_intro[persona];
  if (customSuffix) prompt += ' ' + customSuffix;
  return prompt;
}

// 批量生成：某品牌的 4 persona × 6 category = 24 queries
function generateBrandQueries(brand, options = {}) {
  const { personas = ['ceo', 'customer', 'analyst', 'developer'], categories = ['brand_intro', 'product', 'comparison', 'pricing', 'use_case', 'industry'] } = options;
  const queries = [];

  for (const persona of personas) {
    for (const category of categories) {
      const prompt = generatePromptTemplate({ brand, persona, category });
      queries.push({
        brand,
        persona,
        category,
        prompt,
        engines: ['deepseek', 'openai', 'claude', 'perplexity', 'gemini', 'grok'], // 默认 6 引擎（去掉了 copilot 不稳定）
      });
    }
  }
  return queries;
}

// 将生成的 queries 写入 geo_queries 集合
async function persistBrandQueries(brandId, options = {}) {
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) throw new Error(`Brand not found: ${brandId}`);

  const queries = generateBrandQueries(brand.name, options);
  const created = [];
  for (const q of queries) {
    const createdQuery = GEO_STORE.createQuery({
      brand_id: brandId,
      prompt: q.prompt,
      category: q.category,
      engine_targets: q.engines,
    });
    // 附加 persona 信息（存在 doc 里）
    GEO_STORE._internal_update_query_persona?.(createdQuery.id, q.persona);
    created.push(createdQuery);
  }
  return { ok: true, count: created.length, queries: created };
}

// === 自定义模板管理 ===

function addCustomTemplate({ brand_id, persona, category, prompt, engine_targets }) {
  if (!brand_id || !prompt) throw new Error('brand_id 和 prompt 必填');
  return GEO_STORE.createQuery({
    brand_id,
    prompt,
    category: category || 'custom',
    engine_targets: engine_targets || ['deepseek'],
  });
}

function listTemplatesForBrand(brandId) {
  return GEO_STORE.listQueries(brandId);
}

// === 导出 ===

module.exports = {
  PERSONAS,
  CATEGORIES,
  generatePromptTemplate,
  generateBrandQueries,
  persistBrandQueries,
  addCustomTemplate,
  listTemplatesForBrand,
};