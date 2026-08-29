// ACMS GEO Audit Agent（v0.1 — Phase 1 Week 4）
// 用途：对单个 brand 跑完整 audit → 输出结构化审计报告
// 路径：server/services/geo-audit-agent.js
//
// 流程：
//   1. 调 tracker agent 跑多引擎查询（如果还没跑）
//   2. 算 cite-ability score
//   3. 分析每个引擎的 mention rate + 位置分
//   4. 识别 content gaps（该被引用却没被引用）
//   5. 输出结构化 audit 报告
//
// 输出格式（JSON）：
//   {
//     brand: {...},
//     score: 51.81 (Grade C),
//     breakdown: { engine_name: { mentions, total, rate, avg_position } },
//     content_gaps: ['...', '...'],
//     recommendations: ['...', '...'],
//     llms_txt_status: { has_llms_txt, valid, last_genered },
//   }
//
// 调用方式：
//   - 服务端：require('./geo-audit-agent').runAudit(brandId)
//   - 工具：未来集成到 geo-audit tool
//   - HTTP：POST /api/geo/audit (Phase 1 Week 5)

const GEO_STORE = require('./geo-store');
const TRACKER = require('./geo-tracker-agent');
const SCORING = require('./geo-scoring');
const LLMS_GEN = require('../services/geo-llms-txt-generator');
const GEO_CONFIG = require('../services/geo-config');
const fs = require('fs').promises;
const path = require('path');

async function runAudit(brandId, options = {}) {
  const {
    runTracker = true,
    lookbackDays = 30,
    includeLLMSTxtCheck = true,
  } = options;

  const startTs = Date.now();
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) {
    return { ok: false, error: 'BRAND_NOT_FOUND', message: `Brand ${brandId} 不存在` };
  }

  // 1. 可选：跑 tracker 拿最新数据
  if (runTracker) {
    console.log(`[geo-audit] Running tracker for ${brand.name}...`);
    await TRACKER.runTracker(brandId, { maxQueries: 10 });
  }

  // 2. 算综合分
  const score = SCORING.calculateCiteAbilityScore(brand, { lookbackDays });
  if (!score.ok) {
    return { ok: false, error: score.error, message: score.message };
  }

  // 3. 按引擎拆解
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const responses = GEO_STORE.listResponses({ brand_id: brandId })
    .filter(r => !r.error && r.ts >= cutoff);

  const breakdown = {};
  for (const engine of score.engines_used) {
    const engineResponses = responses.filter(r => r.engine === engine);
    const mentionedCount = engineResponses.filter(r =>
      SCORING._internal.isMentioned(brand.name, r.raw_answer || r.text || '')
    ).length;
    breakdown[engine] = {
      total: engineResponses.length,
      mentioned: mentionedCount,
      mention_rate: engineResponses.length > 0 ? Math.round((mentionedCount / engineResponses.length) * 100) / 100 : 0,
    };
  }

  // 4. 识别 content gaps（引擎提到该品牌但内容贫乏的情况）
  const contentGaps = identifyContentGaps(brand, responses);

  // 5. 生成改进建议
  const recommendations = generateRecommendations(brand, score, breakdown, contentGaps);

  // 6. llms.txt 健康度
  let llmsTxtStatus = null;
  if (includeLLMSTxtCheck) {
    llmsTxtStatus = await checkLLMSTxtStatus(brand);
  }

  // v0.16: 第三方提及信号（借鉴 geo-seo-claude Brand Authority Signals + 引用源分类）
  const thirdPartySignals = analyzeThirdPartySignals(brandId, lookbackDays);

  // v0.16: robots.txt AI 爬虫检查（借鉴 geo-optimizer-skill 18 分项）
  let robotsTxtStatus = null;
  try {
    robotsTxtStatus = await checkRobotsTxt(brand);
  } catch (e) {
    robotsTxtStatus = { status: 'error', message: e.message };
  }

  return {
    ok: true,
    brand: { id: brand.id, name: brand.name, domain: brand.domain },
    audit_date: new Date().toISOString(),
    score: {
      score: score.score,
      grade: score.grade,
      components: score.components,
    },
    breakdown,
    content_gaps: contentGaps,
    recommendations,
    llms_txt_status: llmsTxtStatus,
    third_party_signals: thirdPartySignals,
    robots_txt: robotsTxtStatus,
    duration_ms: Date.now() - startTs,
  };
}

// v0.16: 第三方提及信号——引用源里 editorial/forum/social/reviews 类占比
// 依据：Ahrefs 2025-12「品牌提及 vs 外链对 AI 可见性相关性强 3 倍」+ geo-seo-claude 权重 20%
function analyzeThirdPartySignals(brandId, lookbackDays) {
  try {
    const classifier = require('../services/geo-citation-classifier');
    const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
    const responses = GEO_STORE.listResponses({ brand_id: brandId }).filter(r => !r.error && r.ts >= cutoff);
    const allBrands = GEO_STORE.listBrands();
    const brandDomains = allBrands
      .map(b => (b.domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase())
      .filter(Boolean);
    const rollup = classifier.rollupCitations(responses, brandDomains);
    if (!rollup.total_citations) {
      return { ok: true, total_citations: 0, score: 0, breakdown: {}, message: '暂无引用数据（先跑跟踪 + 配 Perplexity 等返回 citations 的引擎）' };
    }
    const thirdPartyCats = ['editorial', 'forum', 'social', 'reviews'];
    const breakdown = {};
    let thirdPartyTotal = 0;
    for (const c of thirdPartyCats) {
      const n = rollup.category_tally[c] || 0;
      breakdown[c] = n;
      thirdPartyTotal += n;
    }
    // 第三方提及率 = 第三方类引用 / 总引用（0-1）
    const ratio = thirdPartyTotal / rollup.total_citations;
    // 评分：>=0.4 满分，线性衰减
    const score = Math.min(1, ratio / 0.4);
    return {
      ok: true,
      total_citations: rollup.total_citations,
      third_party_total: thirdPartyTotal,
      third_party_ratio: Math.round(ratio * 1000) / 1000,
      score: Math.round(score * 1000) / 1000,
      breakdown,
      message: thirdPartyTotal === 0
        ? 'AI 引擎当前只引用自有站内容，没有第三方（媒体/论坛/评测/社交）来源。第三方引用是 AI 可见性的强信号（比外链强 3 倍），建议做内容分发/PR。'
        : `第三方来源占比 ${Math.round(ratio * 100)}%（媒体 ${breakdown.editorial} / 论坛 ${breakdown.forum} / 评测 ${breakdown.reviews} / 社交 ${breakdown.social}）`,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// v0.16: robots.txt AI 爬虫检查——27 个 AI bot 中关键 6 个
// 依据：geo-optimizer-skill Robots.txt 18 分项（citation bots 显式允许）
const AI_BOTS = [
  { name: 'GPTBot', type: 'ChatGPT 爬虫' },
  { name: 'OAI-SearchBot', type: 'ChatGPT 搜索' },
  { name: 'ClaudeBot', type: 'Claude 爬虫' },
  { name: 'PerplexityBot', type: 'Perplexity' },
  { name: 'Google-Extended', type: 'Gemini/AI Overviews' },
  { name: 'CCBot', type: 'Common Crawl' },
];

async function checkRobotsTxt(brand) {
  const domain = String(brand.domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!domain) return { status: 'error', message: '品牌域名无效' };
  const url = `https://${domain}/robots.txt`;
  let text;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'acms-geo-audit/1.0' } });
    text = await resp.text();
  } catch (e) {
    return { status: 'unreachable', message: `无法抓取 ${url}（${e.message.slice(0, 40)}），跳过 AI 爬虫检查`, url };
  } finally {
    clearTimeout(timer);
  }
  if (!text) return { status: 'empty', message: 'robots.txt 为空（未限制任何爬虫 = 默认放行）', url };
  // 解析 User-agent 块
  const lines = text.split('\n');
  const blocks = [];
  let cur = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^user-agent:\s*(.+)$/i);
    if (m) {
      cur = { agent: m[1].trim().toLowerCase(), rules: [] };
      blocks.push(cur);
    } else if (cur) {
      cur.rules.push(line);
    }
  }
  const results = AI_BOTS.map(bot => {
    const botLower = bot.name.toLowerCase();
    const block = blocks.find(b => b.agent === '*' || b.agent === botLower) || null;
    const disallowed = block ? block.rules.some(r => /^disallow:\s*\/?$/.test(r) ? false : /^disallow:/i.test(r)) : false;
    const allowed = block ? block.rules.some(r => /^allow:\s*\//.test(r)) : true; // 无块 = 默认允许
    return { name: bot.name, type: bot.type, status: disallowed ? 'blocked' : (allowed ? 'allowed' : 'default'), disallowed: block && block.rules.filter(r => /^disallow:/i.test(r)).slice(0, 3) };
  });
  const blocked = results.filter(r => r.status === 'blocked');
  return {
    status: blocked.length ? 'warning' : 'ok',
    url,
    results,
    message: blocked.length
      ? `⚠️ ${blocked.map(b => b.name).join('、')} 被 robots.txt 屏蔽——AI 引擎无法抓取你的站点，GEO 可见性直接受损。建议显式 Allow 这些 AI 爬虫。`
      : `✅ 所有关键 AI 爬虫（GPTBot/ClaudeBot/PerplexityBot/Google-Extended 等）均可访问`,
  };
}

function identifyContentGaps(brand, responses) {
  const gaps = [];
  const brandLower = brand.name.toLowerCase();
  // 1. 引擎提到该品牌但内容贫乏（< 50 字符）
  for (const r of responses) {
    if (!r.raw_answer) continue;
    const text = r.raw_answer.toLowerCase();
    if (text.includes(brandLower)) {
      const ctx = SCORING._internal.extractBrandContext(brand.name, r.raw_answer);
      if (ctx.length < 50) {
        gaps.push({
          type: 'SHORT_CONTEXT',
          engine: r.engine,
          query_id: r.query_id,
          description: `${r.engine} 提到 ${brand.name} 但描述过短（${ctx.length} 字符）`,
        });
      }
    }
  }
  return gaps.slice(0, 10); // 最多 10 个
}

function generateRecommendations(brand, score, breakdown, contentGaps) {
  const recs = [];

  // 提及率低
  if (score.components.mention_rate < 0.5) {
    recs.push({
      priority: 'HIGH',
      type: 'LOW_MENTION_RATE',
      title: '提升品牌在 AI 引擎中的提及率',
      detail: `当前 mention_rate=${(score.components.mention_rate * 100).toFixed(0)}%，建议增加高质量品牌提及内容（FAQ、行业案例、技术博客）。`,
    });
  }

  // 引擎一致性差
  if (score.components.engine_consistency < 0.7) {
    recs.push({
      priority: 'MEDIUM',
      type: 'ENGINE_INCONSISTENCY',
      title: '提升多引擎一致性',
      detail: `当前一致性=${(score.components.engine_consistency * 100).toFixed(0)}%，部分引擎提及率高，部分低。需分析低提及引擎的内容偏好。`,
    });
  }

  // Content gaps
  if (contentGaps.length > 0) {
    recs.push({
      priority: 'MEDIUM',
      type: 'CONTENT_GAPS',
      title: `修复 ${contentGaps.length} 个内容缺口`,
      detail: '多个引擎提及品牌但描述过短，建议补充详细产品介绍、技术细节、客户案例。',
    });
  }

  // 综合分低
  if (score.score < 50) {
    recs.push({
      priority: 'HIGH',
      type: 'OVERALL_LOW',
      title: 'GEO 综合分偏低',
      detail: `当前分数 ${score.score}（${score.grade} 级）。建议:1) 创建 llms.txt 文件;2) 增加 FAQ 内容;3) 添加 Schema.org 结构化数据。`,
    });
  }

  return recs;
}

async function checkLLMSTxtStatus(brand) {
  const domain = brand.domain;
  const filename = `${domain}.txt`;
  const localPath = path.join(LLMS_GEN.OUTPUT_DIR, filename);
  try {
    const stats = await fs.stat(localPath);
    const content = await fs.readFile(localPath, 'utf-8');
    return {
      has_local_file: true,
      file_size: stats.size,
      last_modified: stats.mtime.toISOString(),
      content_preview: content.slice(0, 200),
    };
  } catch {
    return {
      has_local_file: false,
      message: '本地未生成 llms.txt 文件。运行 generate_llms_txt 工具生成。',
    };
  }
}

module.exports = {
  runAudit,
};