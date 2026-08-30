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
const LLM_TOOLS = require('./geo-llm-tools');

// v0.24: 多语言支持——语言代码 → 语言名（翻译 prompt 用）
const LANGUAGES = {
  zh: '中文', en: '英文', th: '泰文', ja: '日文', ko: '韩文',
  vi: '越南文', id: '印尼文', ms: '马来文', fr: '法文', de: '德文',
  es: '西班牙文', ru: '俄文', ar: '阿拉伯文', pt: '葡萄牙文',
};

// 翻译缓存（queryText:lang → 译文），避免重复翻译
const _translateCache = new Map();

async function translateQuery(text, lang) {
  const cacheKey = `${text}:${lang}`;
  if (_translateCache.has(cacheKey)) return _translateCache.get(cacheKey);
  const langName = LANGUAGES[lang] || lang;
  const r = await LLM_TOOLS.generate(
    `把下面这句话翻译成${langName}。只输出翻译结果，不要解释、不要引号。\n\n${text}`,
    { temperature: 0.2, maxTokens: 500 }
  );
  const t = r.ok ? String(r.text || '').trim() : text; // 失败 fallback 原文
  _translateCache.set(cacheKey, t);
  return t;
}

// 清空翻译缓存（测试用）
function _clearTranslateCache() {
  _translateCache.clear();
}
const GEO_SCORING = require('./geo-scoring');
const TEMPLATES = require('./geo-query-templates');

const DEFAULT_ENGINES = ['deepseek', 'openai', 'claude', 'perplexity', 'gemini', 'grok', 'minimax'];

async function runTracker(brandId, options = {}) {
  const {
    engines = GEO_CONFIG.getTrackEngines(),
    maxQueries = 50, // v0.29: 配合 LLM 生成 12-16 条 + elmo 推荐 25-50（之前硬钉 10 — 新生成的 prompts 会漏跑）
    dryRun = false,
    autoGenerateQueries = false,
    language = 'zh', // v0.24: 多语言——非 zh 时翻译 query
    rag = false,     // v0.25: DeepSeek 检索增强（先真实检索再回答，慢~18s/条但真实）
  } = options;

  const startTs = Date.now();
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) {
    return { ok: false, error: 'BRAND_NOT_FOUND', message: `Brand ${brandId} 不存在` };
  }

  console.log(`[geo-tracker] Start: brand=${brand.name} (${brandId}) engines=${engines.join(',')} dryRun=${dryRun} language=${language}`);

  // 1. 获取或生成 queries — v0.29: 显式按 created_at 升序排序（之前 listQueries 无排序，
  //   SQLite 按 ROWID 返回，稳定的「前 N 条」隐藏了「新加的 prompt 被截断」的现象）
  let queries = GEO_STORE.listQueries(brandId)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  if (queries.length === 0 && autoGenerateQueries) {
    console.log(`[geo-tracker] No queries found, generating via TEMPLATES...`);
    const generated = TEMPLATES.generateBrandQueries(brand.name).slice(0, maxQueries);
    for (const q of generated) {
      GEO_STORE.createQuery({
        brand_id: brandId,
        prompt: q.prompt,
        category: q.category,
        engine_targets: q.engines,
        source: 'template', // v0.26 C1a
      });
    }
    queries = GEO_STORE.listQueries(brandId);
  }

  // v0.26 C2b: 只跑 enabled 的 queries（用户可停用单条 prompt）
  const enabledQueries = queries.filter(q => q.enabled !== false);
  if (enabledQueries.length !== queries.length) {
    console.log(`[geo-tracker] Skipping ${queries.length - enabledQueries.length} disabled queries`);
  }
  queries = enabledQueries;

  if (queries.length === 0) {
    return {
      ok: false,
      error: 'NO_QUERIES',
      message: `Brand ${brand.name} 没有 enabled 的 query 模板。请先调用 geo-query-templates 生成，或手动添加。`,
      brand_id: brandId,
    };
  }

  // v0.24: 挂语言到每个 query（非 zh 时 tracker 内翻译）
  if (language && language !== 'zh') {
    queries = queries.map(q => ({ ...q, language }));
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
      // v0.24: 多语言支持——query.language 非 zh 时先 LLM 翻译
      const lang = query.language || 'zh';
      let promptToUse = query.prompt;
      if (lang !== 'zh') {
        promptToUse = await translateQuery(query.prompt, lang);
      }
      const result = await eng.query(promptToUse, options.rag ? { rag: true } : {});
      const latency = Date.now() - taskStart;
      return {
        query_id: query.id,
        engine,
        language: lang,
        ok: result.ok,
        raw_answer: result.text || '',
        citations: result.citations || [],
        web_queries: result.web_queries || [], // v0.26: 透传 web search queries（Claude/OpenAI 升级后才有）
        web_search_enabled: result.web_search_enabled || false,
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
        language: query.language || 'zh',
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
          language: d.language || 'zh',
          raw_answer: d.raw_answer,
          citations: d.citations || [],
          web_queries: d.web_queries || [], // v0.26: Query Fan-out 通道（默认空，待 engine 升级 grounding 后填充）
          latency_ms: d.latency_ms,
          usage: d.usage,
          error: d.error,
          model: d.model,
        });
        responsesWritten++;
      }
    }
  }

  // v0.26 C6: 跑完后自动刷新 systemTags（high/low-performing 由真实 mentionRate 驱动）
  try {
    const brandName2 = brand.name || '';
    const allResponses2 = GEO_STORE.listResponses({ brand_id: brandId });
    const byQuery2 = {};
    for (const r of allResponses2) {
      if (!r.query_id || r.error) continue;
      if (!byQuery2[r.query_id]) byQuery2[r.query_id] = [];
      byQuery2[r.query_id].push(r);
    }
    for (const q of queriesToRun) {
      const runs = byQuery2[q.id] || [];
      if (runs.length === 0) continue;
      const mentioned = runs.filter(r => {
        const text = (r.raw_answer || '').toLowerCase();
        return brandName2 && text.includes(brandName2.toLowerCase());
      }).length;
      const mentionRate = mentioned / runs.length;
      const sysTags = GEO_STORE.computeSystemTags(q.prompt, brandName2, { mentionRate });
      GEO_STORE.updateQuery(q.id, { systemTags: sysTags });
    }
  } catch (e) {
    console.log(`[geo-tracker] systemTags refresh failed: ${e.message}`);
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
  LANGUAGES,
  translateQuery,
  _clearTranslateCache,
};