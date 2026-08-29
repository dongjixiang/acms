// ACMS GEO — 代表 Prompt 挑选算法（v0.26 — 借鉴 elmo selectRepresentativePrompts）
// 路径：server/services/geo-prompt-report.js
//
// 用途：从所有 prompt 跑出来的 responses 中，挑出 4 个「代表 prompt」用于周报
//   - 💪 2 个 strength（品牌赢的 query）
//   - 🎯 2 个 opportunity（品牌缺席但竞品活跃的 query）
//
// elmo 算法要点（packages/lib/src/report-metrics.ts）：
//   1. 排除 branded prompt（包含品牌名的）— 不代表自然发现
//   2. 4 槽位：MAX_SELECTED=4, MAX_PER_CATEGORY=2
//   3. 0-SoV 上限 MAX_ZERO_SOV=1（避免 4 个全 0 显得品牌隐形）
//   4. strengths 排序：competitor 活跃度优先（vs nobody 不算赢）
//   5. opportunities 排序：低 SoV 优先（增长空间最大）

const GEO_STORE = require('./geo-store');
const SCORING = require('./geo-scoring');

const MAX_SELECTED = 4;
const MAX_PER_CATEGORY = 2;
const MAX_ZERO_SOV = 1;

/**
 * 计算单个 prompt 的 SoV
 * @param {string} promptId
 * @param {Array} runs - response 列表
 * @param {Array} competitors - watch 竞品列表 [{name, domain}]
 * @returns {{ promptId, sov, brandMentionCount, totalRuns, totalCompetitorMentions, competitorMentions }}
 */
function computePromptSoV(promptId, runs, competitors) {
  const promptRuns = runs.filter(r => r.prompt_id === promptId || r.query_id === promptId);
  const totalRuns = promptRuns.length;
  if (totalRuns === 0) {
    return { promptId, sov: null, brandMentionCount: 0, totalRuns: 0, totalCompetitorMentions: 0, competitorMentions: {} };
  }
  const brandMentionCount = promptRuns.filter(r => r.mentioned).length;
  const competitorMentions = {};
  let totalCompetitorMentions = 0;
  for (const run of promptRuns) {
    const mentionedComps = run.competitors_mentioned || [];
    for (const c of mentionedComps) {
      if (competitors.some(comp => comp.name === c)) {
        competitorMentions[c] = (competitorMentions[c] || 0) + 1;
        totalCompetitorMentions++;
      }
    }
  }
  const denominator = brandMentionCount + totalCompetitorMentions;
  const sov = denominator === 0 ? null : Math.round((brandMentionCount / denominator) * 100);
  return { promptId, sov, brandMentionCount, totalRuns, totalCompetitorMentions, competitorMentions };
}

/**
 * 判断 prompt 是否包含品牌名（branded）
 */
function isBranded(promptText, brandName) {
  if (!brandName) return false;
  const lower = String(promptText || '').toLowerCase();
  return lower.includes(brandName.toLowerCase());
}

/**
 * 挑选代表 prompt（借鉴 elmo selectRepresentativePrompts）
 * @param {string} brandId
 * @param {Object} options { competitors?: [{name, domain}] }
 * @returns {Array<{promptId, promptValue, category: 'strength'|'opportunity', sov, brandMentionCount, totalCompetitorMentions}>}
 */
function selectRepresentativePrompts(brandId, options = {}) {
  const competitors = options.competitors || [];
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return [];

  // 拉所有 prompt + response
  const queries = GEO_STORE.listQueries(brandId);
  if (!queries || queries.length === 0) return [];

  const allResponses = GEO_STORE.listResponses({ brand_id: brandId });

  // 对每个 prompt 算出 SoV
  const promptSoVs = queries.map(q => {
    // 给每个 response 加 mentioned + competitors_mentioned 字段（如果还没）
    const runs = allResponses
      .filter(r => r.query_id === q.id)
      .map(r => {
        const text = (r.raw_answer || r.text || '').toLowerCase();
        const mentioned = !!brand.name && text.includes(brand.name.toLowerCase());
        // 竞品提及：扫描回答里的竞品名
        const competitors_mentioned = [];
        for (const c of competitors) {
          if (c.name && text.includes(c.name.toLowerCase())) competitors_mentioned.push(c.name);
        }
        return { ...r, mentioned, competitors_mentioned };
      });
    return {
      ...computePromptSoV(q.id, runs, competitors),
      promptValue: q.prompt || q.text || '',
      isBranded: isBranded(q.prompt || q.text, brand.name),
    };
  });

  // 优先用非 branded prompt（代表自然发现）
  const nonBranded = promptSoVs.filter(p => !p.isBranded);
  const pool = nonBranded.length >= MAX_SELECTED ? nonBranded : promptSoVs;
  if (pool.length === 0) return [];

  // strengths：非 0 SoV，competitor 活跃度优先
  const strengths = pool.filter(p => p.sov !== null && p.sov > 0)
    .sort((a, b) => {
      // competitor 活跃度优先
      const aHas = a.totalCompetitorMentions > 0 ? 1 : 0;
      const bHas = b.totalCompetitorMentions > 0 ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      return (b.sov || 0) - (a.sov || 0);
    });
  // opportunities：低 SoV 优先（含 0），但有 competitor 活跃
  const contested = pool.filter(p => p.totalCompetitorMentions > 0);
  const opportunities = [
    ...contested.filter(p => p.sov !== null && p.sov > 0)
      .sort((a, b) => (a.sov || 0) - (b.sov || 0)),
    ...contested.filter(p => p.sov === null || p.sov === 0)
      .sort((a, b) => b.totalCompetitorMentions - a.totalCompetitorMentions),
  ];

  // 选 4 个（最多 2 strength + 2 opportunity，0-SoV 上限 1）
  const selected = [];
  const usedIds = new Set();
  let zeroSoVCount = 0;

  function take(candidates, max, category) {
    let picked = 0;
    for (const p of candidates) {
      if (selected.length >= MAX_SELECTED) return;
      if (picked >= max) return;
      if (usedIds.has(p.promptId)) continue;
      const isZero = p.sov === null || p.sov === 0;
      if (isZero && zeroSoVCount >= MAX_ZERO_SOV) continue;
      if (isZero) zeroSoVCount++;
      usedIds.add(p.promptId);
      selected.push({
        promptId: p.promptId,
        promptValue: p.promptValue,
        category: category || (isZero ? 'opportunity' : 'strength'),
        sov: p.sov,
        brandMentionCount: p.brandMentionCount,
        totalCompetitorMentions: p.totalCompetitorMentions,
        totalRuns: p.totalRuns,
        competitorMentions: p.competitorMentions,
      });
      picked++;
    }
  }

  take(strengths, MAX_PER_CATEGORY, 'strength');
  take(opportunities, MAX_PER_CATEGORY, 'opportunity');
  take([...strengths, ...opportunities], MAX_SELECTED);

  return selected;
}

/**
 * 生成"代表 prompt"段 Markdown（周报用）
 * @param {string} brandId
 * @param {Object} options
 * @returns {string} Markdown 字符串（无代表 prompt 时返回空字符串）
 */
function generateRepresentativePromptsSection(brandId, options = {}) {
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return '';
  const selected = selectRepresentativePrompts(brandId, options);
  if (selected.length === 0) {
    return `## 🎯 代表 prompt 表现\n\n*本周暂无足够 prompt 跑数据（需要至少 1 个 prompt + 1 个引擎响应）*\n\n`;
  }
  const strengths = selected.filter(s => s.category === 'strength');
  const opportunities = selected.filter(s => s.category === 'opportunity');
  const md = [];
  md.push(`## 🎯 代表 prompt 表现（挑 4 个：2 优势 + 2 机会）`);
  md.push('');
  md.push(`> 算法借鉴 elmo **selectRepresentativePrompts**：排除品牌名直接包含品牌词的 branded prompt（更代表自然发现）；2 strength 优先 competitor 活跃度（vs nobody 不算赢）；2 opportunity 优先低 SoV（增长空间最大）；0-SoV 上限 1 个（避免显得品牌隐形）。`);
  md.push('');
  if (strengths.length > 0) {
    md.push(`### 💪 优势 prompt（${strengths.length}）`);
    md.push('');
    md.push('| 排名 | Prompt | 品牌 SoV | 提及 | 竞品活跃 |');
    md.push('|------|--------|----------|------|----------|');
    strengths.forEach((s, i) => {
      const compStr = Object.entries(s.competitorMentions || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, c]) => `${name}(${c})`)
        .join(', ') || '—';
      md.push(`| ${i + 1} | ${s.promptValue.slice(0, 60)}${s.promptValue.length > 60 ? '...' : ''} | ${s.sov ?? '—'}% | ${s.brandMentionCount}/${s.totalRuns} | ${compStr} |`);
    });
    md.push('');
  }
  if (opportunities.length > 0) {
    md.push(`### 🎯 机会 prompt（${opportunities.length}）`);
    md.push('');
    md.push('| 排名 | Prompt | 品牌 SoV | 竞品活跃 | 建议 |');
    md.push('|------|--------|----------|----------|------|');
    opportunities.forEach((o, i) => {
      const compStr = Object.entries(o.competitorMentions || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, c]) => `${name}(${c})`)
        .join(', ') || '—';
      const advice = o.brandMentionCount === 0
        ? '🔴 品牌完全缺席 — 优先创建该 query 的内容'
        : `🟡 SoV ${o.sov}% — 补充结构化数据/FAQ`;
      md.push(`| ${i + 1} | ${o.promptValue.slice(0, 60)}${o.promptValue.length > 60 ? '...' : ''} | ${o.sov ?? '—'}% | ${compStr} | ${advice} |`);
    });
    md.push('');
  }
  return md.join('\n');
}

/**
 * v0.26: 找内容缺口（借鉴 elmo findContentGaps）
 * 找出"竞品被提及但品牌没出现"的 prompt — 最高价值的内容创作机会
 * @param {string} brandId
 * @param {Object} options { competitors?: [{name, domain}], maxResults?: 5 }
 * @returns {Array<{promptValue, promptId, competitorsMentioned: string[], competitorCount: number}>}
 */
function findContentGaps(brandId, options = {}) {
  const competitors = options.competitors || [];
  const maxResults = options.maxResults || 5;
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return [];

  const queries = GEO_STORE.listQueries(brandId);
  if (!queries || queries.length === 0) return [];
  const allResponses = GEO_STORE.listResponses({ brand_id: brandId });

  const gaps = [];
  for (const q of queries) {
    const promptRuns = allResponses.filter(r => r.query_id === q.id);
    if (promptRuns.length === 0) continue; // 没跑过不算缺口
    const hasBrandMention = promptRuns.some(r => {
      const text = (r.raw_answer || r.text || '').toLowerCase();
      return brand.name && text.includes(brand.name.toLowerCase());
    });
    if (hasBrandMention) continue; // 品牌有提及 — 不算缺口
    // 收集该 prompt 里所有被提及的竞品
    const allCompetitors = new Set();
    for (const run of promptRuns) {
      const text = (run.raw_answer || run.text || '').toLowerCase();
      // 1) 显式传进来的 watch 竞品
      for (const c of competitors) {
        if (c.name && text.includes(c.name.toLowerCase())) allCompetitors.add(c.name);
      }
      // 2) 自动探测：所有 brands 里名字 ≥ 3 字的（粗略 — 避免误判）
      // 暂不开，watch 竞品已经覆盖主场景
    }
    if (allCompetitors.size === 0) continue; // 没人提 — 不是真缺口
    gaps.push({
      promptId: q.id,
      promptValue: q.prompt || q.text || '',
      competitorsMentioned: [...allCompetitors],
      competitorCount: allCompetitors.size,
    });
  }
  // 排序：competitor 数多者优先（缺口越深）
  return gaps.sort((a, b) => b.competitorCount - a.competitorCount).slice(0, maxResults);
}

/**
 * 生成"内容缺口"段 Markdown（周报/月报用 + optimizer 注入）
 */
function generateContentGapsSection(brandId, options = {}) {
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return '';
  const gaps = findContentGaps(brandId, options);
  if (gaps.length === 0) {
    return `## 🕳️ 内容缺口（数据驱动）\n\n*暂无明确缺口 — 所有 prompt 跑过的回答中，品牌至少被提及 1 次*\n\n`;
  }
  const md = [];
  md.push(`## 🕳️ 内容缺口（数据驱动 Top ${gaps.length}）`);
  md.push('');
  md.push(`> 算法借鉴 elmo **findContentGaps**：找出"竞品被提及但品牌没出现"的 prompt，按竞品活跃度排序。这些是最该做内容/SEO 的 query — 做出来后能直接被 AI 引用。`);
  md.push('');
  md.push('| 优先级 | Prompt | 竞品活跃 | 建议行动 |');
  md.push('|--------|--------|----------|----------|');
  gaps.forEach((g, i) => {
    const compStr = g.competitorsMentioned.join(', ');
    const priority = g.competitorCount >= 3 ? '🔴 HIGH' : g.competitorCount >= 2 ? '🟡 MED' : '🟢 LOW';
    const action = g.competitorCount >= 3
      ? '**紧急** — 3+ 竞品在回答里都出现，你完全缺席'
      : g.competitorCount === 2
      ? '**重要** — 2 个竞品在抢位，补充 FAQ + 权威内容'
      : '**机会** — 1 个竞品在位，先做该 query 的核心内容';
    md.push(`| ${i + 1}. ${priority} | ${g.promptValue.slice(0, 50)}${g.promptValue.length > 50 ? '...' : ''} | ${compStr} (${g.competitorCount}个) | ${action} |`);
  });
  md.push('');
  return md.join('\n');
}

module.exports = {
  selectRepresentativePrompts,
  generateRepresentativePromptsSection,
  computePromptSoV,
  isBranded,
  findContentGaps,
  generateContentGapsSection,
};
