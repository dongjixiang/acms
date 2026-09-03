// ACMS GEO Opportunities 智能推荐（v0.33 — 借鉴 elmo opportunities.ts）
// 路径：server/services/geo-opportunities.js
//
// 设计：
//   1. Digest 构建 — 聚合 30d + 7d 数据，计算每个 prompt 的可见度 vs 竞品
//   2. 单次 LLM 调用 — 处理确定性 digest，生成分类机会（creation/existing/outreach/social）
//   3. 难度标签 — citation volatility → wide-open/contested/locked-in
//   4. Content Gap — 找竞品被提但品牌未提的 prompts
//
// 输出持久化到 geo_opportunities 表（append-only）

const { collection } = require('./geo-store');
const SCORING = require('./geo-scoring');
const LLM_TOOLS = require('./geo-llm-tools');

const COLLECTION = 'geo_opportunities';

// ===== Citation Volatility（参考 elmo visibility-stats.ts）======
function computeVolatility(citedDomains, windowDays = 30) {
  if (!citedDomains || citedDomains.length === 0) return null;
  
  // 简化版：计算域名集合的 Jaccard 稳定性
  // 实际 elmo 用时间序列滑动窗口计算
  const uniqueDomains = new Set(citedDomains);
  const domainCount = uniqueDomains.size;
  
  // 启发式：引用源越分散 = 越 open；越集中 = 越 locked
  // domainCount < 3 → locked-in（固定几个大站）
  // domainCount 3-8 → contested
  // domainCount > 8 → wide-open
  if (domainCount <= 2) return { label: 'locked-in', stability: 85 };
  if (domainCount <= 6) return { label: 'contested', stability: 55 };
  return { label: 'wide-open', stability: 25 };
}

// ===== Content Gap 分析 =====
function findContentGaps(brand, responses, queries) {
  const matchTerms = SCORING.getMatchTerms(brand).map(t => t.toLowerCase());
  const competitorNames = (brand.competitors || []).map(c => c.name.toLowerCase());
  
  const gaps = [];
  for (const q of queries) {
    const qResponses = responses.filter(r => r.query_id === q.id);
    if (qResponses.length === 0) continue;
    
    // 检查该 prompt 下是否有竞品被提及但品牌未被提及
    let hasCompetitor = false;
    let hasBrand = false;
    
    for (const r of qResponses) {
      const text = (r.text || r.raw_answer || '').toLowerCase();
      if (matchTerms.some(t => text.includes(t))) hasBrand = true;
      if (competitorNames.some(c => text.includes(c))) hasCompetitor = true;
    }
    
    if (hasCompetitor && !hasBrand) {
      gaps.push({
        promptId: q.id,
        prompt: q.prompt,
        category: q.category,
        tags: q.tags || [],
        runs: qResponses.length,
      });
    }
  }
  
  return gaps.slice(0, 10); // 最多 10 个 gap
}

// ===== Digest 构建 =====
function buildDigest(brandId, options = {}) {
  const { lookbackDays = 30, includeCompetitors = true } = options;
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);
  
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const responses = GEO_STORE.listResponses({ brand_id: brandId })
    .filter(r => r.ts >= cutoff && !r.error);
  const queries = GEO_STORE.listQueries(brandId);
  
  // 按 prompt 聚合数据
  const byPrompt = {};
  const allDomains = new Set();
  
  for (const r of responses) {
    if (!r.query_id) continue;
    if (!byPrompt[r.query_id]) {
      byPrompt[r.query_id] = {
        promptId: r.query_id,
        prompt: '',
        brandMentioned: false,
        competitorMentions: [],
        citedDomains: [],
        model: r.model || 'unknown',
      };
    }
    
    const text = (r.text || r.raw_answer || '').toLowerCase();
    const matchTerms = SCORING.getMatchTerms(brand).map(t => t.toLowerCase());
    const hasBrand = matchTerms.some(t => text.includes(t));
    byPrompt[r.query_id].brandMentioned = byPrompt[r.query_id].brandMentioned || hasBrand;
    
    // 提取 cited domains（从 r.citations 或 r.raw_output）
    if (r.citations && Array.isArray(r.citations)) {
      for (const cite of r.citations) {
        if (cite.domain) allDomains.add(cite.domain);
      }
    }
    
    // 提取竞品提及
    if (includeCompetitors && brand.competitors) {
      for (const comp of brand.competitors) {
        const compName = comp.name.toLowerCase();
        if (text.includes(compName) && !byPrompt[r.query_id].competitorMentions.includes(compName)) {
          byPrompt[r.query_id].competitorMentions.push(compName);
        }
      }
    }
  }
  
  // 填充 prompt 文本
  for (const q of queries) {
    if (byPrompt[q.id]) byPrompt[q.id].prompt = q.prompt;
  }
  
  // 计算每个 prompt 的 SoV
  const promptStats = Object.values(byPrompt).map(p => ({
    ...p,
    sov: p.brandMentioned ? 1 : 0,
    volatility: computeVolatility(p.citedDomains),
  }));
  
  // 总体统计
  const totalRuns = responses.length;
  const brandMentionCount = responses.filter(r => {
    const text = (r.text || r.raw_answer || '').toLowerCase();
    return SCORING.getMatchTerms(brand).some(t => text.includes(t.toLowerCase()));
  }).length;
  
  const overallSoV = totalRuns > 0 ? brandMentionCount / totalRuns : 0;
  
  return {
    brand: {
      id: brand.id,
      name: brand.name,
      domain: brand.domain,
      industry: brand.industry || '',
      competitors: (brand.competitors || []).map(c => c.name),
    },
    stats: {
      totalRuns,
      brandMentionCount,
      overallSoV: Math.round(overallSoV * 100) / 100,
      totalPrompts: queries.length,
      activePrompts: queries.filter(q => q.enabled).length,
    },
    promptStats: promptStats.sort((a, b) => b.sov - a.sov),
    citedDomains: Array.from(allDomains).slice(0, 50),
  };
}

// ===== LLM Prompt 模板 =====
const OPPORTUNITIES_SYSTEM_PROMPT = `你是一个 GEO（Generative Engine Optimization）策略专家。根据品牌的 AI 可见性数据，生成具体的改进机会建议。

输出格式（严格 JSON）：
{
  "summary": ["3-5 条简短洞察，每条不超过 20 字"],
  "opportunities": [
    {
      "category": "creation|existing-content|outreach|social",
      "title": "简短具体的行动标题",
      "why": "解释为什么这个机会值得做（1-2 句话）",
      "relatedPrompts": ["关联的 prompt 文本"],
      "difficulty": "wide-open|contested|locked-in"
    }
  ],
  "risks": ["2-3 条风险提示"]
}

分类定义：
- creation: 需要新建内容（对比文、指南、案例）
- existing-content: 优化已有页面（刷新、补充 FAQ、增加 schema）
- outreach: 争取第三方引用（评测网站、媒体 roundup、行业报告）
- social: 在社区出现（Reddit、知乎、论坛、问答）

difficulty 定义：
- wide-open: 引用源经常变化，容易突破
- contested: 有一定竞争，需要努力
- locked-in: 引用源固定，很难突破`;

// ===== 主函数 =====
async function generateOpportunities(brandId, options = {}) {
  const { lookbackDays = 30, forceRefresh = false } = options;
  
  // 检查是否需要刷新（默认 7 天缓存）
  if (!forceRefresh) {
    const existing = collection('geo_opportunities').find(doc => doc.brand_id === brandId)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    if (existing.length > 0) {
      const lastGen = new Date(existing[0].created_at);
      const daysSince = (Date.now() - lastGen.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) {
        return { ok: true, data: existing[0], cached: true, daysSince: Math.round(daysSince * 10) / 10 };
      }
    }
  }
  
  // 1. 构建 digest
  const digest = buildDigest(brandId, { lookbackDays });
  
  // 2. 识别 Content Gaps
  const brand = GEO_STORE.getBrand(brandId);
  const responses = GEO_STORE.listResponses({ brand_id: brandId });
  const queries = GEO_STORE.listQueries(brandId);
  const contentGaps = findContentGaps(brand, responses, queries);
  
  // 3. 构建 LLM 输入
  const llmInput = {
    ...digest,
    contentGaps: contentGaps.slice(0, 5),
    topCompetitors: (brand.competitors || []).slice(0, 5).map(c => c.name),
  };
  
  // 4. 调用 LLM（单次结构化输出）
  console.log(`[geo-opportunities] Generating for ${brand.name}...`);
  
  const llmResult = await LLM_TOOLS.callLLM({
    model: 'deepseek',
    messages: [
      { role: 'system', content: OPPORTUNITIES_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(llmInput, null, 2) },
    ],
    response_format: { type: 'json_object' },
    maxTokens: 2000,
  });
  
  if (!llmResult.ok) {
    console.error('[geo-opportunities] LLM call failed:', llmResult.error);
    return { ok: false, error: llmResult.error };
  }
  
  // 5. 解析并增强
  let opportunities;
  try {
    const parsed = JSON.parse(llmResult.content);
    opportunities = {
      ...parsed,
      brandId,
      generatedAt: new Date().toISOString(),
      contentGaps,
    };
  } catch (e) {
    console.error('[geo-opportunities] JSON parse failed:', e.message);
    opportunities = {
      summary: ['LLM 解析失败，请稍后重试'],
      opportunities: [],
      risks: ['数据处理异常'],
      brandId,
      generatedAt: new Date().toISOString(),
      contentGaps,
    };
  }
  
  // 6. 持久化
  const record = {
    id: `${'opp'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    brand_id: brandId,
    data: opportunities,
    created_at: new Date().toISOString(),
    lookbackDays,
  };

  collection('geo_opportunities').insert(record);
  
  console.log(`[geo-opportunities] Generated ${opportunities.opportunities?.length || 0} opportunities for ${brand.name}`);
  
  return { ok: true, data: record, cached: false };
}

// ===== List 接口 =====
function listOpportunities(brandId, limit = 10) {
  const coll = collection('geo_opportunities');
  // v0.33: find 需要传函数作为 predicate，不是对象
  const records = coll.find(doc => doc.brand_id === brandId)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, limit);
  return records;
}

module.exports = {
  generateOpportunities,
  listOpportunities,
  buildDigest,
  findContentGaps,
  computeVolatility,
  COLLECTION,
};
