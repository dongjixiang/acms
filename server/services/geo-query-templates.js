// ACMS GEO 提问模板库（v0.26 C1b — 重设计：完整问句 → 短搜索片段）
// 路径：server/services/geo-query-templates.js
//
// v0.26 重设计背景（多多：目前分析出来的指标看着都有问题）：
//   - 旧版 prompt 是完整问句（"请介绍 X 公司，重点说明商业模式..."）→ AI 回答是"客服话术"
//   - 用户在 ChatGPT 真实输入的是短搜索片段（"asics running shoes"）→ 指标才真实
//   - 借鉴 elmo promptSchema：'Short search-style fragment, lowercase, under ~12 words.
//     NOT a full sentence — the kind of thing people actually type into ChatGPT.'
//
// 新版设计原则：
//   1. prompt = 中文搜索片段（≤12 字，不加句号问号）
//   2. 16 unbranded（不含品牌名 — 测"自然发现"：用户搜行业词时品牌被不被 AI 主动提）
//   3. 8 branded（含品牌名 — 测"品牌搜索覆盖"：用户搜品牌时 AI 给的信息对不对）
//   4. 保留 4 persona × 6 category 框架（用户视角 × 问题类型）
//   5. brand 占位符 {brand}：持久化时替换为实际品牌名（branded 模板才替换）

const GEO_STORE = require('./geo-store');

// === Persona 定义 ===
const PERSONAS = {
  ceo: {
    id: 'ceo',
    name: 'CEO/创始人',
    description: '商业视角，关注市场、竞品、增长',
    icon: '👔',
  },
  customer: {
    id: 'customer',
    name: '客户/用户',
    description: '使用视角，关注功能、价格、口碑',
    icon: '🛒',
  },
  analyst: {
    id: 'analyst',
    name: '分析师/投资人',
    description: '数据视角，关注规模、趋势、估值',
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
  brand_intro: { id: 'brand_intro', name: '品牌认知', icon: '🏷️' },
  product: { id: 'product', name: '产品/服务', icon: '🛠️' },
  comparison: { id: 'comparison', name: '对比选择', icon: '⚖️' },
  pricing: { id: 'pricing', name: '价格/成本', icon: '💰' },
  use_case: { id: 'use_case', name: '案例/场景', icon: '💡' },
  industry: { id: 'industry', name: '行业趋势', icon: '📈' },
};

// === 短搜索片段模板 ===
// unbranded：不含品牌名（自然发现）
// branded：含 {brand} 占位符（品牌搜索覆盖）
// 中文短查询风格（≤12 字，无句号问号）

const UNBRANDED_TEMPLATES = {
  brand_intro: {
    ceo: '展览设计公司 行业排名',
    customer: '展览设计 哪家好',
    analyst: '会展行业 市场规模',
    developer: '展览设计 数字化方案',
  },
  product: {
    ceo: '展览公司 核心服务',
    customer: '展台设计 服务内容',
    analyst: '展览服务商 业务范围',
    developer: '展台设计 技术方案',
  },
  comparison: {
    ceo: '展览设计公司 对比',
    customer: '展览公司 选择建议',
    analyst: '会展行业 竞争格局',
    developer: '展览设计 方案对比',
  },
  pricing: {
    ceo: '展览设计 报价收费',
    customer: '展台搭建 价格多少',
    analyst: '会展服务 定价策略',
    developer: '展览设计 成本估算',
  },
  use_case: {
    ceo: '展览公司 成功案例',
    customer: '展台设计 案例参考',
    analyst: '会展行业 应用场景',
    developer: '展览数字化 案例',
  },
  industry: {
    ceo: '会展行业 发展趋势',
    customer: '展览行业 前景',
    analyst: '会展 投资机会',
    developer: '展览技术 发展方向',
  },
};

const BRANDED_TEMPLATES = {
  brand_intro: {
    ceo: '{brand} 公司介绍',
    customer: '{brand} 怎么样',
    analyst: '{brand} 商业模式',
    developer: '{brand} 技术实力',
  },
  product: {
    ceo: '{brand} 核心产品',
    customer: '{brand} 服务评价',
    analyst: '{brand} 产品分析',
    developer: '{brand} 技术栈',
  },
  comparison: {
    ceo: '{brand} 对比竞品',
    customer: '{brand} 和谁差不多',
    analyst: '{brand} 市场地位',
    developer: '{brand} 技术对比',
  },
  pricing: {
    ceo: '{brand} 收费模式',
    customer: '{brand} 报价',
    analyst: '{brand} 定价分析',
    developer: '{brand} 使用成本',
  },
  use_case: {
    ceo: '{brand} 典型客户',
    customer: '{brand} 使用体验',
    analyst: '{brand} 市场案例',
    developer: '{brand} 集成案例',
  },
  industry: {
    ceo: '{brand} 行业前景',
    customer: '{brand} 值得选吗',
    analyst: '{brand} 增长潜力',
    developer: '{brand} 生态发展',
  },
};

// === 模板生成 ===

// 生成针对某品牌 + persona 的 prompt 模板
// options.branded = true → 品牌搜索片段；false → 自然发现片段
function generatePromptTemplate({ brand, persona, category, customSuffix = '', branded = true }) {
  const p = PERSONAS[persona] || PERSONAS.customer;
  const c = CATEGORIES[category] || CATEGORIES.brand_intro;
  if (!brand) return '';

  // 中文行业词（unbranded 需要根据品牌行业调整关键词 — 先用通用词，后续接 LLM 定制）
  const templatePool = branded ? BRANDED_TEMPLATES : UNBRANDED_TEMPLATES;
  let template = templatePool[category]?.[persona] || templatePool.brand_intro[persona] || '';
  // branded 模板替换 {brand} 占位符
  let prompt = template.replace(/\{brand\}/g, brand);
  if (customSuffix) prompt += ' ' + customSuffix;
  return prompt;
}

// 批量生成：某品牌的 personas × categories 组合
// 默认生成 24 个：16 unbranded（2 persona × 6 category... 实际全 4×6=24，取前 16 unbranded + 8 branded）
// 设计：每个 persona 每个 category 各 1 个 unbranded（24 个里取 16？）
// 简单化：4 persona × 6 category 全部 unbranded（24），再加 8 个 branded（每 persona 各 2 个 category）
// 最终默认 = 24 unbranded + 8 branded = 32 个
function generateBrandQueries(brand, options = {}) {
  const {
    personas = ['ceo', 'customer', 'analyst', 'developer'],
    categories = ['brand_intro', 'product', 'comparison', 'pricing', 'use_case', 'industry'],
    includeBranded = true,
  } = options;
  const queries = [];

  // 1) unbranded：所有 persona × category（自然发现 — 核心指标）
  for (const persona of personas) {
    for (const category of categories) {
      const prompt = generatePromptTemplate({ brand, persona, category, branded: false });
      queries.push({
        brand,
        persona,
        category,
        prompt,
        branded: false,
        source: 'template',
        engines: ['deepseek', 'openai', 'claude', 'perplexity', 'gemini', 'grok'],
      });
    }
  }

  // 2) branded：每 persona 挑 2 个高频 category（brand_intro + comparison — 品牌搜索覆盖）
  if (includeBranded) {
    const brandedCategories = ['brand_intro', 'comparison'];
    for (const persona of personas) {
      for (const category of brandedCategories) {
        const prompt = generatePromptTemplate({ brand, persona, category, branded: true });
        queries.push({
          brand,
          persona,
          category,
          prompt,
          branded: true,
          source: 'template',
          engines: ['deepseek', 'openai', 'claude', 'perplexity', 'gemini', 'grok'],
        });
      }
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
    // v0.26: 直接传 persona/source/tags/systemTags（不再依赖不存在的 _internal_update_query_persona）
    const systemTags = GEO_STORE.computeSystemTags
      ? GEO_STORE.computeSystemTags(q.prompt, brand.name)
      : (q.branded ? ['branded'] : ['unbranded']);
    const createdQuery = GEO_STORE.createQuery({
      brand_id: brandId,
      prompt: q.prompt,
      category: q.category,
      engine_targets: q.engines,
      persona: q.persona,
      source: q.source,
      tags: [],
      systemTags,
    });
    created.push(createdQuery);
  }
  return { ok: true, count: created.length, queries: created };
}

// === 自定义模板管理 ===

function addCustomTemplate({ brand_id, persona, category, prompt, engine_targets, tags = [], enabled = true }) {
  if (!brand_id || !prompt) throw new Error('brand_id 和 prompt 必填');
  return GEO_STORE.createQuery({
    brand_id,
    prompt,
    category: category || 'custom',
    engine_targets: engine_targets || ['deepseek'],
    persona: persona || null,
    tags,
    enabled,
    source: 'manual',
  });
}

function listTemplatesForBrand(brandId) {
  return GEO_STORE.listQueries(brandId);
}

// === 导出 ===

module.exports = {
  PERSONAS,
  CATEGORIES,
  UNBRANDED_TEMPLATES,
  BRANDED_TEMPLATES,
  generatePromptTemplate,
  generateBrandQueries,
  persistBrandQueries,
  addCustomTemplate,
  listTemplatesForBrand,
};
