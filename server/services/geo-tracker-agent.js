// ACMS GEO Tracker Agent（v0.1 — Phase 1 Week 3）
// 用途：对单个 brand 跑多引擎查询，存 geo_responses，写 cite-ability snapshot
// 路径：server/services/geo-tracker-agent.js
//
// 设计：
//   - 输入：brandId（必填） + options（engines / lookbackDays / dryRun）
//   - 输出：{ok, brand, queries_run, responses_collected, engines_used, score}
//   - 不依赖 ACMS agent-runtime（避免循环依赖；纯数据流）
//   - 失败优雅降级：某个引擎失败不影响其他引擎
//
// 流程：
//   1. 拉 brand 的所有 active queries（geo_queries）
//   2. 每个 query × 每个 engine 调 GEO_ENGINES.getEngine(engine).query(prompt)
//   3. 写 geo_responses（成功 / 失败都写）
//   4. 调 geo-scoring.calculateCiteAbilityScore 算分
//   5. 调 geo-scoring.generateSnapshotSummary 创建 snapshot
//   6. 返回 summary
//
// SOP 参考（P164）：测试用 test_brand，调用真实 engine（如果有 key），
//   没有 key 的 engine 返回 API_KEY_NOT_CONFIGURED（错误响应仍写 store）

const GEO_STORE = require('./geo-store');
const GEO_ENGINES = require('./geo-engines');
const GEO_CONFIG = require('./geo-config');
const GEO_SCORING = require('./geo-scoring');
const TEMPLATES = require('./geo-query-templates');

const DEFAULT_ENGINES = ['deepseek', 'openai', 'claude', 'perplexity', 'gemini', 'grok']; // copilot 排除（不稳定）

async function runTracker(brandId, options = {}) {
  const {
    engines = GEO_CONFIG.getTrackEngines(),
    maxQueries = 10,
    dryRun = false,
    autoGenerateQueries = false,
  } = options;

  const startTs = Date.now();
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) {
    return { ok: false, error: 'BRAND_NOT_FOUND', message: `Brand ${brandId} 不存在` };
  }

  console.log(`[geo-tracker] Start: brand=${brand.name} (${brandId}) engines=${engines.join(',')} dryRun=${dryRun}`);

  // 1. 获取或生成 queries
  let queries = GEO_STORE.listQueries(brandId);
  if (queries.length === 0 && autoGenerateQueries) {
    console.log(`[geo-tracker] No queries found, generating via TEMPLATES...`);
    const generated = TEMPLATES.generateBrandQueries(brand.name).slice(0, maxQueries);
    for (const q of generated) {
      GEO_STORE.createQuery({
        brand_id: brandId,
        prompt: q.prompt,
        category: q.category,
        engine_targets: q.engines,
      });
    }
    queries = GEO_STORE.listQueries(brandId);
  }

  if (queries.length === 0) {
    return {
      ok: false,
      error: 'NO_QUERIES',
      message: `Brand ${brand.name} 没有 query 模板。请先调用 geo-query-templates 生成，或手动添加。`,
      brand_id: brandId,
    };
  }

  const queriesToRun = queries.slice(0, maxQueries);
  const enginesToUse = engines.filter(e => {
    const eng = GEO_ENGINES.getEngine(e);
    return eng != null;
  });

  // 2. 并发跑所有 queries × engines（用 Promise.allSettled 不让一个失败拖垮）
  const tasks = [];
  for (const query of queriesToRun) {
    for (const engine of enginesToUse) {
      tasks.push({ query, engine });
    }
  }

  console.log(`[geo-tracker] Running ${tasks.length} tasks (${queriesToRun.length} queries × ${enginesToUse.length} engines)`);

  const results = await Promise.allSettled(tasks.map(async ({ query, engine }) => {
    const eng = GEO_ENGINES.getEngine(engine);
    const taskStart = Date.now();
    try {
      const result = await eng.query(query.prompt);
      const latency = Date.now() - taskStart;
      return {
        query_id: query.id,
        engine,
        ok: result.ok,
        raw_answer: result.text || '',
        citations: result.citations || [],
        error: result.error || null,
        message: result.message || null,
        model: result.model || null,
        latency_ms: latency,
        usage: result.usage || null,
      };
    } catch (e) {
      return {
        query_id: query.id,
        engine,
        ok: false,
        error: 'EXCEPTION',
        message: e.message,
        latency_ms: Date.now() - taskStart,
      };
    }
  }));

  // 3. 写 geo_responses（除非 dryRun）
  let responsesWritten = 0;
  if (!dryRun) {
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const d = r.value;
        GEO_STORE.createResponse({
          brand_id: brandId,
          query_id: d.query_id,
          engine: d.engine,
          raw_answer: d.raw_answer,
          citations: d.citations,
          latency_ms: d.latency_ms,
          usage: d.usage,
          model: d.model,
          error: d.error,
        });
        responsesWritten++;
      }
    }
  }

  // 4. 算分（基于刚写入的数据）
  const score = GEO_SCORING.calculateCiteAbilityScore(brand);

  // 5. 创建 snapshot（每周一次 — 这里创建的是「本次跟踪」的 mini-snapshot）
  const now = new Date();
  const week = `${now.getUTCFullYear()}-W${String(Math.ceil((((now - new Date(now.getUTCFullYear(), 0, 1)) / 86400000) + new Date(now.getUTCFullYear(), 0, 1).getDay() + 1) / 7)).padStart(2, '0')}`;
  const snapshotResult = GEO_SCORING.generateSnapshotSummary(brandId, week);

  const summary = {
    ok: true,
    brand: { id: brand.id, name: brand.name, domain: brand.domain },
    tasks_run: tasks.length,
    queries_run: queriesToRun.length,
    engines_used: enginesToUse,
    responses_written: responsesWritten,
    success_count: results.filter(r => r.status === 'fulfilled' && r.value.ok).length,
    error_count: results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length,
    dry_run: dryRun,
    duration_ms: Date.now() - startTs,
    score: score.ok ? {
      score: score.score,
      grade: score.grade,
      components: score.components,
    } : null,
    snapshot_id: snapshotResult.ok ? snapshotResult.snapshot.id : null,
    timestamp: new Date().toISOString(),
  };

  console.log(`[geo-tracker] Done: ${summary.success_count}/${summary.tasks_run} success, score=${score.score || 'N/A'}`);
  return summary;
}

// 批量跑所有 active brands
async function runTrackerAll(options = {}) {
  const brands = GEO_STORE.listBrands().filter(b => b.status === 'active');
  const results = [];
  for (const brand of brands) {
    try {
      const r = await runTracker(brand.id, options);
      results.push({ brand_id: brand.id, brand_name: brand.name, ...r });
    } catch (e) {
      results.push({ brand_id: brand.id, brand_name: brand.name, ok: false, error: e.message });
    }
  }
  return {
    ok: true,
    total_brands: brands.length,
    results,
  };
}

module.exports = {
  runTracker,
  runTrackerAll,
  DEFAULT_ENGINES,
};