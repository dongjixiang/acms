// ACMS GEO Channels 投放策略模块（v0.45）
// 借鉴 GEOVisibilityTool geo-channels，利用 ACMS 数据优势做更精细的策略
//
// 七节结构：
//  1. Hero Metrics
//  2. 🔥 紧急处理（负面 sentiment / 误识别）
//  3. 📊 Top10 Channel 投放清单（ROI 公式 + 时间维度）
//  4. 🤖 Per-Engine 适配策略
//  5. 🎯 竞品反位攻关
//  6. 🕳️ 零命中 Query 攻关
//  7. 📋 总结
//
// 设计原则：
//  - 数据驱动：所有建议必须引用具体数字
//  - ROI 公式公开（无伪精度）
//  - 竞品官网/自有站/搜索引擎 自动剔除
//  - 时间维度：紧急 / 短期 / 中期 / 长期

const GEO_STORE = require('./geo-store');
const SCORING = require('./geo-scoring');
const CHANNEL_MAPPING = require('./geo-channel-mapping');

// ===== ROI 公式（公开可复现）=====
function computeROI(appearanceCount, crossEngineCount, intentCoverage) {
  if (appearanceCount >= 5 && (crossEngineCount >= 2 || intentCoverage >= 3)) return 'HIGH';
  if (appearanceCount >= 5 || (crossEngineCount >= 2 && appearanceCount >= 3)) return 'MED';
  return 'LOW';
}

// ===== 时间维度判定 =====
function computeTimeline(roi, hasNegative, isCompetitorWeak) {
  if (hasNegative || isCompetitorWeak) return 'URGENT';
  if (roi === 'HIGH') return 'SHORT';
  if (roi === 'MED') return 'MEDIUM';
  return 'LONG';
}

// ===== 构建 Channel Digest =====
function buildChannelDigest(brandId, options = {}) {
  const { lookbackDays = 30 } = options;
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const responses = GEO_STORE.listResponses({ brand_id: brandId })
    .filter(r => r.ts >= cutoff && !r.error);
  const queries = GEO_STORE.listQueries(brandId);
  const matchTerms = SCORING.getMatchTerms(brand).map(t => t.toLowerCase());

  // 拉 watch 竞品
  let competitorInfo = [];
  try {
    const watches = GEO_STORE.listWatches ? GEO_STORE.listWatches() : [];
    const myWatches = watches.filter(w => w.focus_brand_id === brandId);
    const allBrands = GEO_STORE.listBrands();
    for (const w of myWatches) {
      for (const cid of (w.competitor_ids || [])) {
        const b = allBrands.find(x => x.id === cid);
        if (b && b.name) competitorInfo.push({ id: b.id, name: b.name, domain: b.domain || '' });
      }
    }
  } catch (_) {}

  // 按 channel 聚合
  const channelStats = {};
  const engineIntentMap = {}; // engine -> Set<intent>
  const engineChannelMap = {}; // engine -> Set<domain>
  let totalNegative = 0;
  let totalMisidentified = 0;
  const zeroHitQueries = [];

  for (const r of responses) {
    const query = queries.find(q => q.id === r.query_id);
    const intent = (query?.tags || []).find(t => t.startsWith('intent:')) || 'unknown';
    const intentLabel = intent.replace('intent:', '');

    // per-engine tracking
    const engine = r.engine || 'unknown';
    if (!engineIntentMap[engine]) engineIntentMap[engine] = new Set();
    engineIntentMap[engine].add(intentLabel);
    if (!engineChannelMap[engine]) engineChannelMap[engine] = new Set();

    // citations -> channel
    if (r.citations && Array.isArray(r.citations)) {
      for (const cite of r.citations) {
        const info = CHANNEL_MAPPING.resolveChannelInfo(cite);
        if (!info || CHANNEL_MAPPING.isExcluded(info.domain)) continue;
        engineChannelMap[engine].add(info.domain);

        if (!channelStats[info.domain]) {
          channelStats[info.domain] = {
            domain: info.domain,
            type: info.type,
            contentForm: info.contentForm,
            appearanceCount: 0,
            engines: new Set(),
            intents: new Set(),
            brandMentioned: false,
            competitorMentioned: false,
          };
        }
        channelStats[info.domain].appearanceCount++;
        channelStats[info.domain].engines.add(engine);
        channelStats[info.domain].intents.add(intentLabel);
      }
    }

    // 品牌提及检测
    const text = (r.raw_answer || '').toLowerCase();
    const hasBrand = matchTerms.some(t => text.includes(t));
    if (hasBrand) {
      // 简单 sentiment 启发：含负面词
      const negativeWords = ['差', '不好', '坑', '骗', '垃圾', '失败', '负面', '投诉'];
      if (negativeWords.some(w => text.includes(w))) totalNegative++;
    }

    // 零命中检测：query 有竞品提及但品牌未提及
    let hasCompetitor = false;
    for (const comp of competitorInfo) {
      if (text.includes(comp.name.toLowerCase())) {
        hasCompetitor = true;
        break;
      }
    }
    if (hasCompetitor && !hasBrand && query) {
      zeroHitQueries.push({
        prompt: query.prompt,
        intent: intentLabel,
        competitors: competitorInfo.filter(c => text.includes(c.name.toLowerCase())).map(c => c.name),
      });
    }
  }

  // 转为数组并排序
  const channelList = Object.values(channelStats)
    .map(c => ({
      ...c,
      engines: Array.from(c.engines),
      intents: Array.from(c.intents),
      crossEngineCount: c.engines.size,
      intentCoverage: c.intents.size,
      roi: computeROI(c.appearanceCount, c.engines.size, c.intents.size),
      timeline: computeTimeline(
        computeROI(c.appearanceCount, c.engines.size, c.intents.size),
        false, // 紧急信号单独算
        false,
      ),
    }))
    .sort((a, b) => b.appearanceCount - a.appearanceCount)
    .slice(0, 20);

  // 竞品 domain 集合（用于排除）
  const competitorDomains = new Set(competitorInfo.map(c => c.domain).filter(Boolean));

  return {
    brand,
    channelList,
    engineIntentMap,
    engineChannelMap,
    totalNegative,
    zeroHitQueries: zeroHitQueries.slice(0, 10),
    competitorInfo,
    competitorDomains,
    totalResponses: responses.length,
  };
}

// ===== 生成投放策略 =====
async function generateChannels(brandId, options = {}) {
  const { lookbackDays = 30 } = options;
  const digest = buildChannelDigest(brandId, { lookbackDays });
  const { brand, channelList, engineIntentMap, zeroHitQueries, competitorInfo, competitorDomains } = digest;

  // §1 Hero Metrics
  const urgentCount = channelList.filter(c => {
    // 紧急 = 高竞争 channel 中品牌未占位
    return c.appearanceCount >= 3 && !c.brandMentioned;
  }).length;

  // §2 紧急处理（负面信号）
  const urgentItems = [];
  if (digest.totalNegative > 0) {
    urgentItems.push({
      type: 'negative_sentiment',
      query: '含负面词的回答',
      platform: '跨引擎',
      evidence: `${digest.totalNegative} 条回答含负面信号`,
      action: '监测并反位投放正面内容',
    });
  }
  // 竞品强占位也是紧急
  for (const comp of competitorInfo.slice(0, 3)) {
    if (comp.domain) {
      const compChannel = channelList.find(c => c.domain === comp.domain);
      if (compChannel && compChannel.appearanceCount >= 3) {
        urgentItems.push({
          type: 'competitor_dominance',
          query: `${comp.name} 在 ${comp.domain} 占位`,
          platform: comp.domain,
          evidence: `出现 ${compChannel.appearanceCount} 次`,
          action: `反位投放：在 ${compChannel.contentForm} 发布对比文`,
        });
      }
    }
  }

  // §3 Top10 Channel（剔除竞品官网 + 搜索引擎）
  const topChannels = channelList
    .filter(c => !competitorDomains.has(c.domain) && !CHANNEL_MAPPING.isExcluded(c.domain))
    .slice(0, 10)
    .map(c => ({
      ...c,
      roi: computeROI(c.appearanceCount, c.crossEngineCount, c.intentCoverage),
      timeline: computeTimeline(
        computeROI(c.appearanceCount, c.crossEngineCount, c.intentCoverage),
        urgentItems.some(u => u.platform === c.domain),
        false,
      ),
    }));

  // §4 Per-Engine 适配
  const perEngineStrategy = Object.entries(engineIntentMap).map(([engine, intents]) => {
    const channels = Array.from(engineIntentMap.hasOwnProperty(engine) ? new Set() : []);
    // 找该 engine 高频出现的 channel
    const engineChannels = topChannels.filter(c => c.engines.includes(engine));
    return {
      engine,
      intents: Array.from(intents),
      topChannels: engineChannels.slice(0, 3).map(c => c.domain),
      strategy: buildEngineStrategy(engine, Array.from(intents), engineChannels),
    };
  });

  // §5 竞品反位
  const counterPlacement = competitorInfo.slice(0, 5).map(comp => {
    const compChannels = topChannels.filter(c => {
      // 找竞品可能占位的 channel（高频但品牌未出现的）
      return c.appearanceCount >= 2;
    });
    return {
      competitor: comp.name,
      domain: comp.domain,
      counterChannels: compChannels.slice(0, 3).map(c => ({
        domain: c.domain,
        action: `在 ${c.domain} 发布「${comp.name} vs 卡司通」对比文`,
      })),
    };
  }).filter(c => c.counterChannels.length > 0);

  // §6 零命中攻关
  const zeroHitPlan = zeroHitQueries.slice(0, 6).map(q => ({
    query: q.prompt,
    intent: q.intent,
    competitors: q.competitors,
    recommendedChannel: topChannels[0]?.domain || '知乎',
    contentForm: topChannels[0]?.contentForm || '深度回答',
  }));

  // §7 总结
  const summary = {
    coreProblem: identifyCoreProblem(topChannels, zeroHitQueries),
    thirtyDayAction: generateThirtyDayAction(topChannels, urgentItems),
    expectedImprovement: estimateImprovement(digest),
  };

  return {
    ok: true,
    brand: { id: brand.id, name: brand.name, domain: brand.domain },
    generatedAt: new Date().toISOString(),
    lookbackDays,
    // §1
    heroMetrics: {
      urgentCount: urgentItems.length,
      topChannelCount: topChannels.length,
      zeroHitCount: zeroHitQueries.length,
      totalResponses: digest.totalResponses,
    },
    // §2
    urgent: { items: urgentItems, count: urgentItems.length },
    // §3
    topChannels,
    // §4
    perEngineStrategy,
    // §5
    counterPlacement,
    // §6
    zeroHitPlan,
    // §7
    summary,
  };
}

function buildEngineStrategy(engine, intents, channels) {
  const contentPrefs = {
    'deepseek': '案例 + 数据 + ROI',
    'openai': '权威性 + 品牌故事',
    'claude': '深度分析 + 对比评估',
    'perplexity': '实时信息 + 引用源',
    'kimi': '品牌叙事 + 专业内容',
  };
  return `投${contentPrefs[engine] || '针对性内容'}，重点放在 ${channels.slice(0, 2).join(' / ') || '高频 channel'}`;
}

function identifyCoreProblem(topChannels, zeroHits) {
  if (zeroHits.length >= 5) return '内容缺口大：多个高价值 query 零命中';
  if (topChannels.length === 0) return '信源覆盖不足：AI 回答中几乎没有引用你的内容';
  return '头部 channel 占位弱：高频 channel 品牌出现次数少';
}

function generateThirtyDayAction(topChannels, urgentItems) {
  if (urgentItems.length > 0) return '先处理紧急信号 → 再投放 Top3 channel';
  const top3 = topChannels.slice(0, 3);
  if (top3.length === 0) return '扩充信源：先在高权重平台发布基础内容';
  return `在 ${top3.map(c => c.domain).join(' / ')} 发布内容`;
}

function estimateImprovement(digest) {
  // 启发式：如果 Top3 channel 各发 2 篇，预期 +10~20 分
  if (digest.totalResponses < 10) return '数据样本不足，无法预估';
  if (digest.zeroHitQueries.length >= 5) return '+15~25 分（零命中攻关空间大）';
  return '+5~15 分（稳步提升）';
}

// ===== List 接口（缓存最近一次）=====
let _lastResult = new Map(); // brandId -> { result, ts }
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

function getCachedResult(brandId) {
  const entry = _lastResult.get(brandId);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    _lastResult.delete(brandId);
    return null;
  }
  return entry.result;
}

function setCachedResult(brandId, result) {
  _lastResult.set(brandId, { result, ts: Date.now() });
}

module.exports = {
  generateChannels,
  buildChannelDigest,
  computeROI,
  computeTimeline,
  getCachedResult,
  setCachedResult,
};
