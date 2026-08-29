// ACMS GEO Optimizer Agent（v0.1 — Phase 2 #1 多 agent 协同）
// 用途：AI 自动分析品牌 GEO 表现 → 生成可执行的优化建议（差异化核心）
// 路径：server/services/geo-optimizer-agent.js
//
// 流程：
//   1. 拉品牌当前 GEO 数据（cite-ability score + 引擎拆解 + content gaps）
//   2. 构建结构化 prompt（要求 LLM 输出 JSON 建议）
//   3. 调 ACMS agent-runtime（复用 LLM 内核）
//   4. 解析 LLM 输出 → 结构化 recommendations[]
//   5. 返回 {ok, analysis, recommendations, score_snapshot}
//
// 设计要点：
//   - 复用 agent-runtime.execute（不重复造 LLM 调用）
//   - toolNames: [] （纯分析，不调外部工具）
//   - maxRounds: 1 （一次分析，避免循环）
//   - 输出格式：JSON（{analysis, recommendations: [{priority, type, title, detail, actions[]}]}）
//   - 解析失败 fallback：提取文本作为 analysis

const runtime = require('./agent-runtime');
const GEO_STORE = require('./geo-store');
const SCORING = require('./geo-scoring');
const AUDIT = require('./geo-audit-agent');

async function runOptimization(brandId, options = {}) {
  const {
    lookbackDays = 30,
    includeAudit = true,
  } = options;

  const startTs = Date.now();
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) {
    return { ok: false, error: 'BRAND_NOT_FOUND', message: `Brand ${brandId} 不存在` };
  }

  // 1. 拉数据（audit 报告 + score）
  let auditResult = null;
  if (includeAudit) {
    auditResult = await AUDIT.runAudit(brandId, { runTracker: false });
  }
  const score = SCORING.calculateCiteAbilityScore(brand, { lookbackDays });
  if (!score.ok) {
    return { ok: false, error: score.error, message: score.message };
  }

  // 2. 构建 prompt
  const prompt = buildOptimizationPrompt(brand, score, auditResult);
  console.log(`[geo-optimizer] Analyzing ${brand.name} (score=${score.score})...`);

  // 3. 调 LLM
  const messages = [
    {
      role: 'system',
      content: '你是一名 GEO（Generative Engine Optimization）优化顾问。'
        + '你的任务是基于给定的品牌 GEO 数据分析结果，输出可执行的优化建议。'
        + '严格输出 JSON 格式（不要 markdown 代码块）：'
        + '{"analysis": "对品牌当前状态的简要分析（200字内）",'
        + '"recommendations": [{"priority": "HIGH|MEDIUM|LOW", "type": "CONTENT|FAQ|SCHEMA|LLMS|CITATION|AUTHORITY|STRATEGY", "title": "建议标题", "detail": "为什么这么做", "actions": ["具体行动1", "具体行动2"]}]}',
    },
    { role: 'user', content: prompt },
  ];

  let result;
  try {
    result = await runtime.execute({
      messages,
      toolNames: [],
      maxRounds: 1,
      caller: 'geo-optimizer',
      maxTokens: 4000,
      temperature: 0.3,
    });
  } catch (e) {
    return {
      ok: false,
      error: 'LLM_CALL_FAILED',
      message: e.message,
      brand_id: brandId,
    };
  }

  const rawContent = result.content || '';
  const parsed = parseOptimizationOutput(rawContent);

  const output = {
    ok: true,
    brand: { id: brand.id, name: brand.name, domain: brand.domain },
    analysis: parsed.analysis,
    recommendations: parsed.recommendations,
    score_snapshot: {
      score: score.score,
      grade: score.grade,
      components: score.components,
      engines_used: score.engines_used,
    },
    audit_summary: auditResult ? {
      content_gaps: auditResult.content_gaps?.length || 0,
      breakdown: auditResult.breakdown || {},
    } : null,
    model_used: result.modelUsed || null,
    raw_preview: rawContent.slice(0, 200),
    duration_ms: Date.now() - startTs,
    timestamp: new Date().toISOString(),
  };

  // 缓存优化结果（供 applyRecommendationToTask 用，5 分钟 TTL）
  setOptimizationCache(brandId, output);
  return output;
}

// 构建优化 prompt（把数据喂给 LLM）
function buildOptimizationPrompt(brand, score, auditResult) {
  const lines = [];
  lines.push(`# GEO 优化请求\n`);
  lines.push(`## 品牌信息`);
  lines.push(`- 名称: ${brand.name}`);
  lines.push(`- 域名: ${brand.domain}`);
  lines.push(`- 综合分: ${score.score} / 100（${score.grade}）`);
  lines.push(`- 数据样本: ${score.sample_size} 条响应 / ${score.engines_used.length} 个引擎`);
  lines.push('');

  lines.push(`## 当前各维度评分`);
  for (const [dim, val] of Object.entries(score.components)) {
    const labels = {
      mention_rate: '提及率',
      position_score: '位置分',
      context_score: '上下文分',
      engine_consistency: '引擎一致性',
      freshness: '时效性',
    };
    lines.push(`- ${labels[dim] || dim}: ${(val * 100).toFixed(0)}%`);
  }
  lines.push('');

  if (auditResult && auditResult.breakdown) {
    lines.push(`## 引擎拆解`);
    for (const [engine, info] of Object.entries(auditResult.breakdown)) {
      lines.push(`- ${engine}: ${info.mentioned}/${info.total} 提及 (${(info.mention_rate * 100).toFixed(0)}%)`);
    }
    lines.push('');
  }

  if (auditResult && auditResult.content_gaps && auditResult.content_gaps.length > 0) {
    lines.push(`## 内容缺口（${auditResult.content_gaps.length} 个）`);
    auditResult.content_gaps.slice(0, 5).forEach((gap, i) => {
      lines.push(`${i + 1}. [${gap.engine}] ${gap.description}`);
    });
    lines.push('');
  }

  lines.push(`## 要求`);
  lines.push(`- 分析当前品牌在 AI 搜索中的核心问题`);
  lines.push(`- 给出 3-6 条可执行的优化建议（按优先级排序）`);
  lines.push(`- 每条建议包含具体行动（actions 数组）`);
  lines.push(`- 关注：内容质量、FAQ、结构化数据（Schema）、llms.txt、外部引用、权威性`);
  return lines.join('\n');
}

// 解析 LLM 输出（JSON 优先，fallback 文本）
function parseOptimizationOutput(raw) {
  // 尝试提取 JSON
  let jsonText = raw.trim();
  // 去掉 markdown 代码块
  jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');

  // 找第一个 { 到最后一个 }
  const start = jsonText.indexOf('{');
  const end = jsonText.lastIndexOf('}');
  if (start >= 0 && end > start) {
    jsonText = jsonText.slice(start, end + 1);
  }

  try {
    const parsed = JSON.parse(jsonText);
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.slice(0, 10).map(r => ({
          priority: r.priority || 'MEDIUM',
          type: r.type || 'STRATEGY',
          title: r.title || '未命名建议',
          detail: r.detail || '',
          actions: Array.isArray(r.actions) ? r.actions.slice(0, 5) : [],
        }))
      : [];
    return {
      analysis: parsed.analysis || raw.slice(0, 200),
      recommendations,
    };
  } catch {
    // fallback: 无法解析 JSON，返回文本分析
    return {
      analysis: raw.slice(0, 500),
      recommendations: [],
    };
  }
}

// Phase 3 #6: 把一条优化建议落地为 Kanban 任务（分析→建议→执行闭环）
function applyRecommendationToTask(brandId, recommendationIndex, options = {}) {
  const GEO_STORE = require('./geo-store');
  const kanbanHelper = require('./geo-kanban-helper');

  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} 不存在`);

  // 需要先跑一次优化拿到 recommendations（缓存到内存 5 分钟）
  const cache = getOptimizationCache(brandId);
  const recs = cache?.recommendations || [];
  const rec = recs[recommendationIndex];
  if (!rec) {
    throw new Error(`建议索引 ${recommendationIndex} 不存在（当前 ${recs.length} 条）。先 POST /api/geo/optimize 生成建议。`);
  }

  const task = kanbanHelper.createGEOTask({
    projectId: options.projectId || 'default',
    brandId,
    type: 'geo-optimize',
    title: `${rec.priority === 'HIGH' ? '🔴' : rec.priority === 'MEDIUM' ? '🟡' : '🟢'} [GEO建议] ${rec.title}`,
    description: `${rec.detail}\n\n行动项:\n${(rec.actions || []).map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\n来源: GEO Optimizer 建议 #${recommendationIndex + 1}（${rec.type}）`,
    priority: rec.priority === 'HIGH' ? 1 : rec.priority === 'MEDIUM' ? 3 : 5,
    engineTargets: [],
  });

  return { ok: true, task, recommendation: rec };
}

// 优化结果缓存（5 分钟 TTL，供 applyRecommendation 用）
const _optCache = new Map();
function getOptimizationCache(brandId) {
  const entry = _optCache.get(brandId);
  if (!entry) return null;
  if (Date.now() - entry.ts > 5 * 60 * 1000) {
    _optCache.delete(brandId);
    return null;
  }
  return entry;
}
function setOptimizationCache(brandId, result) {
  _optCache.set(brandId, { ts: Date.now(), ...result });
}

module.exports = {
  runOptimization,
  applyRecommendationToTask,
  buildOptimizationPrompt,
  parseOptimizationOutput,
};