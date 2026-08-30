// ACMS GEO 数据存储服务（v0.1 — Phase 0 D4）
// 路径：server/services/geo-store.js
//
// 5 张表（用现有 collection API 自动建表，无需手写 SQL）：
//   geo_brands      — 品牌/项目（agency 多品牌场景的核心）
//   geo_queries     — 提问模板库（每个品牌 N 个 query）
//   geo_responses   — AI 引擎原始回答（每次 query + engine 一条）
//   geo_scores      — 评分历史（每个 brand + dimension + snapshot）
//   geo_snapshots   — 周快照（每周聚合）
//
// 关键决策（v0.1）：
//   - 复用 db/connection.collection API（自动 ensureTable JSON schema 模式）
//   - 所有表都是 (id, doc) 模式，doc 是完整 JSON 对象（含 id 字段）
//   - id 用 `geo_<entity>_<timestamp36>_<rand4>` 格式（自生成）
//   - 索引查询用 collection().find(predicate) 线性扫（小数据够用；万级以上再优化）
//
// 参考：ACMS §38 db-json-schema.md（JSON 集合文档）+ §P152 collection API 注意

const { collection } = require('../db/connection');
const { normalizeAliases } = require('./geo-match'); // v0.30: 别名清洗（写入端）

const COLLECTIONS = {
  BRANDS: 'geo_brands',
  QUERIES: 'geo_queries',
  RESPONSES: 'geo_responses',
  SCORES: 'geo_scores',
  SNAPSHOTS: 'geo_snapshots',
  WATCH: 'geo_watch',
};

// === ID 生成 ===
function makeId(prefix) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${ts}_${rand}`;
}

// === geo_brands ===
function listBrands() {
  return collection(COLLECTIONS.BRANDS).all()
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

function getBrand(id) {
  return collection(COLLECTIONS.BRANDS).findOne(b => b.id === id);
}

function findBrandByDomain(domain) {
  return collection(COLLECTIONS.BRANDS).findOne(b => b.domain === domain);
}

function createBrand({ name, domain, llms_txt_url = '', settings = {}, industry = '', aliases = [] }) {
  if (!name || !domain) throw new Error('createBrand: name 和 domain 必填');
  const existing = findBrandByDomain(domain);
  if (existing) {
    throw new Error(`createBrand: domain="${domain}" 已存在 (id=${existing.id})`);
  }
  // v0.30: 顶层 aliases 字段（替代 settings.aliases — 写入端清洗一次）
  // 同时保留 settings.aliases 兼容 legacy 读取路径
  const cleanedAliases = normalizeAliases(aliases, name);
  const mergedSettings = { ...(settings || {}) };
  // 写入端只保留一份到顶层 aliases；settings.aliases 留着不影响读取（getMatchTerms 优先读顶层）
  if (cleanedAliases.length > 0) mergedSettings._legacy_aliases = cleanedAliases;
  const brand = {
    id: makeId('brand'),
    name,
    domain,
    llms_txt_url: llms_txt_url || `https://${domain}/llms.txt`,
    industry: industry || '',
    settings: mergedSettings,
    // v0.30: 顶层别名（mention 检测主路径）
    aliases: cleanedAliases,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  collection(COLLECTIONS.BRANDS).insert(brand);
  return brand;
}

function updateBrand(id, updates) {
  const c = collection(COLLECTIONS.BRANDS);
  // v0.30: 白名单字段过滤（防恶意/手滑覆盖 id / created_at 等）
  const allowed = ['name', 'domain', 'llms_txt_url', 'industry', 'settings', 'aliases', 'status'];
  const filtered = {};
  for (const k of allowed) {
    if (k in updates) filtered[k] = updates[k];
  }
  // v0.30: aliases 更新时清洗 + 保留 settings._legacy_aliases 镜像（双写兼容）
  if ('aliases' in filtered) {
    const existing = c.findOne(b => b.id === id);
    const currentName = filtered.name || (existing && existing.name) || '';
    const cleanedAliases = normalizeAliases(filtered.aliases, currentName);
    filtered.aliases = cleanedAliases;
    const mergedSettings = { ...((existing && existing.settings) || {}), ...(filtered.settings || {}) };
    mergedSettings._legacy_aliases = cleanedAliases;
    filtered.settings = mergedSettings;
  }
  const result = c.update(b => b.id === id, {
    ...filtered,
    updated_at: new Date().toISOString(),
  });
  return result;
}

function deleteBrand(id) {
  const c = collection(COLLECTIONS.BRANDS);
  // 级联删除：先删关联的 queries / responses / scores / snapshots
  collection(COLLECTIONS.QUERIES).remove(q => q.brand_id === id);
  collection(COLLECTIONS.RESPONSES).remove(r => r.brand_id === id);
  collection(COLLECTIONS.SCORES).remove(s => s.brand_id === id);
  collection(COLLECTIONS.SNAPSHOTS).remove(s => s.brand_id === id);
  return c.remove(b => b.id === id);
}

// === geo_queries ===
function listQueries(brandId) {
  const all = collection(COLLECTIONS.QUERIES).all();
  return brandId ? all.filter(q => q.brand_id === brandId) : all;
}

// v0.26 C1a: 数据模型升级（借鉴 elmo prompts 表）
//   - enabled    : bool，单条启用/停用（tracker 只跑 enabled）
//   - tags       : text[]，用户标签（可多标签，替代单值 category）
//   - persona    : text，生成时的角色（legacy 数据兼容）
//   - source     : 'manual' | 'ai_generated' | 'bulk_import' | 'legacy' | 'template'
//   - systemTags : text[]，系统自动计算（branded/unbranded/low-performing/high-performing/opportunity）
function createQuery({ brand_id, prompt, category = 'general', engine_targets = ['deepseek'], enabled = true, tags = [], persona = null, source = 'manual', systemTags = [], meta = null }) {
  if (!brand_id) throw new Error('createQuery: brand_id 必填');
  if (!prompt) throw new Error('createQuery: prompt 必填');
  const q = {
    id: makeId('qry'),
    brand_id,
    prompt,
    category,
    engine_targets: Array.isArray(engine_targets) ? engine_targets : ['deepseek'],
    status: 'active',
    // v0.26 C1a 新字段
    enabled: enabled !== false,
    tags: Array.isArray(tags) ? tags : [],
    persona: persona || null,
    source: source || 'manual',
    systemTags: Array.isArray(systemTags) ? systemTags : [],
    meta: meta || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  collection(COLLECTIONS.QUERIES).insert(q);
  return q;
}

// v0.26 C1a: 更新 query（新增，支持部分字段更新）
function updateQuery(id, updates) {
  const result = collection(COLLECTIONS.QUERIES).update(q => q.id === id, {
    ...updates,
    updated_at: new Date().toISOString(),
  });
  return result;
}

// v0.26 C1a: 批量创建 queries（bulk import 用 — 每个 line 一条，返回已创建 + skipped 报告）
function bulkCreateQueries({ brand_id, prompts, engine_targets = ['deepseek'], source = 'bulk_import', tags = [] }) {
  const created = [];
  for (const p of prompts) {
    if (!p || !p.trim()) continue;
    created.push(createQuery({ brand_id, prompt: p.trim(), engine_targets, source, tags }));
  }
  return created;
}

function deleteQuery(id, options = {}) {
  const { cascade = true } = options;
  // v0.26: 级联删除关联 responses（防 query_id 悬空）
  if (cascade) {
    collection(COLLECTIONS.RESPONSES).remove(r => r.query_id === id);
  }
  return collection(COLLECTIONS.QUERIES).remove(q => q.id === id);
}

// v0.26: 批量删除 queries（cleanup 用 — 级联删 responses）
function deleteQueries(ids, options = {}) {
  const { cascade = true } = options;
  let removed = 0;
  for (const id of ids) {
    if (deleteQuery(id, { cascade })) removed++;
  }
  return removed;
}

// v0.26: 清理 legacy 模板（完整问句 — 指标失真根源）
// options.alsoTest = true 时连 test-brand 一起清
function cleanupLegacyQueries(options = {}) {
  const { includeTest = false } = options;
  const migrate = require('./geo-migrate');
  const allQueries = collection(COLLECTIONS.QUERIES).all();
  const legacy = allQueries.filter(q => {
    if (!includeTest && q.brand_id === 'test-brand') return false;
    return migrate.isLegacyFullSentence(q.prompt);
  });
  const ids = legacy.map(q => q.id);
  const removed = deleteQueries(ids, { cascade: true });
  return { ok: true, removed, legacy_count: legacy.length, brand_ids: [...new Set(legacy.map(q => q.brand_id))] };
}

// v0.26 C1a: 计算 systemTags（branded 自动分类 — 借鉴 elmo「系统自动算 branded/unbranded」）
// 之后可在 tracker/scoring 里调用
function computeSystemTags(promptText, brandName, { mentionRate = null } = {}) {
  const tags = [];
  const lower = String(promptText || '').toLowerCase();
  const brandLower = String(brandName || '').toLowerCase();
  // branded = prompt 文本包含品牌名 → 品牌搜索意图（自然发现排除）
  if (brandLower && lower.includes(brandLower)) {
    tags.push('branded');
  } else {
    tags.push('unbranded');
  }
  // 表现类标签（由评分数据驱动，mentionRate 传入时才算）
  if (mentionRate != null) {
    if (mentionRate >= 0.7) tags.push('high-performing');
    else if (mentionRate <= 0.3) tags.push('low-performing');
  }
  return tags;
}

// === geo_responses ===
function listResponses(filter = {}) {
  let all = collection(COLLECTIONS.RESPONSES).all();
  if (filter.brand_id) all = all.filter(r => r.brand_id === filter.brand_id);
  if (filter.query_id) all = all.filter(r => r.query_id === filter.query_id);
  if (filter.engine) all = all.filter(r => r.engine === filter.engine);
  return all.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

function createResponse({ brand_id, query_id, engine, raw_answer = '', citations = [], web_queries = [], latency_ms = null, usage = null, error = null, model = '', language = 'zh' }) {
  if (!brand_id || !query_id || !engine) {
    throw new Error('createResponse: brand_id, query_id, engine 必填');
  }
  const r = {
    id: makeId('resp'),
    brand_id,
    query_id,
    engine,
    model,
    language: language || 'zh',
    raw_answer: raw_answer || '',
    citations: Array.isArray(citations) ? citations : [],
    web_queries: Array.isArray(web_queries) ? web_queries : [], // v0.26: AI 引擎 grounding 时跑的搜索 query（Query Fan-out 基础数据）
    latency_ms,
    usage: usage || null,
    error: error || null,
    ts: Date.now(),
    created_at: new Date().toISOString(),
  };
  collection(COLLECTIONS.RESPONSES).insert(r);
  return r;
}

// === geo_scores ===
function listScores(filter = {}) {
  let all = collection(COLLECTIONS.SCORES).all();
  if (filter.brand_id) all = all.filter(s => s.brand_id === filter.brand_id);
  if (filter.dimension) all = all.filter(s => s.dimension === filter.dimension);
  if (filter.snapshot_id) all = all.filter(s => s.snapshot_id === filter.snapshot_id);
  return all.sort((a, b) => (b.computed_at || '').localeCompare(a.computed_at || ''));
}

function createScore({ brand_id, dimension, score, snapshot_id = null, details = {} }) {
  if (!brand_id || !dimension || score == null) {
    // v0.26: 防御 — null score（无数据维度：单引擎一致性/无竞品 SoV/无品牌词查询）跳过写入
    // 不抛错（避免整个跟踪/快照失败）；null ≠ 0（"无数据" ≠ "表现差"）
    if (score == null) {
      console.log(`[geo-store] createScore skip: dimension=${dimension} score=null (no data)`);
      return null;
    }
    throw new Error('createScore: brand_id, dimension, score 必填');
  }
  const s = {
    id: makeId('scr'),
    brand_id,
    dimension,
    score: Number(score),
    snapshot_id,
    details: details || {},
    computed_at: new Date().toISOString(),
  };
  collection(COLLECTIONS.SCORES).insert(s);
  return s;
}

// === geo_snapshots ===
function listSnapshots(brandId) {
  const all = collection(COLLECTIONS.SNAPSHOTS).all();
  return brandId ? all.filter(s => s.brand_id === brandId) : all
    .sort((a, b) => (b.computed_at || '').localeCompare(a.computed_at || ''));
}

function createSnapshot({ brand_id, week, summary_json = {} }) {
  if (!brand_id || !week) throw new Error('createSnapshot: brand_id 和 week 必填');
  const coll = collection(COLLECTIONS.SNAPSHOTS);
  // v0.27: upsert — 同一品牌同一周只保留一份快照（同周重复跑 tracker 时更新而非新增，治「2 个周快照」）
  const existing = coll.findOne(s => s.brand_id === brand_id && s.week === week);
  if (existing) {
    const merged = { ...existing, summary_json, computed_at: new Date().toISOString() };
    coll.update(s => s.id === existing.id, merged);
    return merged;
  }
  const s = {
    id: makeId('snap'),
    brand_id,
    week, // 'YYYY-Www' 格式，如 '2026-W34'
    summary_json,
    computed_at: new Date().toISOString(),
  };
  coll.insert(s);
  return s;
}

// === geo_watch（竞品 Watch，Phase 4 v0.11）===
function listWatches() {
  return collection(COLLECTIONS.WATCH).all()
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

function getWatch(id) {
  return collection(COLLECTIONS.WATCH).findOne(w => w.id === id);
}

function createWatch({ focus_brand_id, competitor_ids = [], enabled = true }) {
  if (!focus_brand_id) throw new Error('createWatch: focus_brand_id 必填');
  const w = {
    id: makeId('watch'),
    focus_brand_id,
    competitor_ids: Array.isArray(competitor_ids) ? competitor_ids.filter(Boolean) : [],
    enabled: !!enabled,
    last_run: null,
    last_result: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  collection(COLLECTIONS.WATCH).insert(w);
  return w;
}

function updateWatch(id, updates = {}) {
  const coll = collection(COLLECTIONS.WATCH);
  const existing = coll.findOne(w => w.id === id);
  if (!existing) return null;
  const merged = { ...existing, ...updates, updated_at: new Date().toISOString() };
  if (updates.competitor_ids !== undefined) {
    merged.competitor_ids = Array.isArray(updates.competitor_ids) ? updates.competitor_ids.filter(Boolean) : [];
  }
  coll.update(w => w.id === id, merged);
  return coll.findOne(w => w.id === id);
}

function deleteWatch(id) {
  const coll = collection(COLLECTIONS.WATCH);
  const existing = coll.findOne(w => w.id === id);
  if (!existing) return false;
  coll.remove(w => w.id === id);
  return true;
}

function setWatchLastRun(id, result) {
  return updateWatch(id, { last_run: new Date().toISOString(), last_result: result });
}

// === 统计辅助 ===
function getBrandStats(brandId) {
  const responses = listResponses({ brand_id: brandId });
  const queries = listQueries(brandId);
  const scores = listScores({ brand_id: brandId });
  const snapshots = listSnapshots(brandId);

  // 按引擎统计
  const byEngine = {};
  for (const r of responses) {
    if (!byEngine[r.engine]) byEngine[r.engine] = { total: 0, success: 0, errors: 0, total_latency_ms: 0 };
    byEngine[r.engine].total++;
    if (r.error) {
      byEngine[r.engine].errors++;
    } else {
      byEngine[r.engine].success++;
      // 只累加成功 response 的 latency（修 v0.1.1 bug：之前 error 的 latency 污染平均值）
      if (r.latency_ms) byEngine[r.engine].total_latency_ms += r.latency_ms;
    }
  }
  for (const k of Object.keys(byEngine)) {
    const e = byEngine[k];
    e.avg_latency_ms = e.success > 0 ? Math.round(e.total_latency_ms / e.success) : 0;
    e.success_rate = e.total > 0 ? Math.round((e.success / e.total) * 100) / 100 : 0;
  }

  return {
    brand_id: brandId,
    queries_count: queries.length,
    responses_count: responses.length,
    scores_count: scores.length,
    snapshots_count: snapshots.length,
    by_engine: byEngine,
  };
}

// === 清理（测试用）===
function _clearAll() {
  // ⚠️ 危险操作：清空所有 GEO 数据（仅测试用）
  const c1 = collection(COLLECTIONS.BRANDS); const a1 = c1.all(); a1.forEach(d => c1.remove(b => b.id === d.id));
  const c2 = collection(COLLECTIONS.QUERIES); const a2 = c2.all(); a2.forEach(d => c2.remove(b => b.id === d.id));
  const c3 = collection(COLLECTIONS.RESPONSES); const a3 = c3.all(); a3.forEach(d => c3.remove(b => b.id === d.id));
  const c4 = collection(COLLECTIONS.SCORES); const a4 = c4.all(); a4.forEach(d => c4.remove(b => b.id === d.id));
  const c5 = collection(COLLECTIONS.SNAPSHOTS); const a5 = c5.all(); a5.forEach(d => c5.remove(b => b.id === d.id));
  return { cleared: a1.length + a2.length + a3.length + a4.length + a5.length };
}

module.exports = {
  COLLECTIONS,
  // brands
  listBrands, getBrand, findBrandByDomain, createBrand, updateBrand, deleteBrand,
  // queries
  listQueries, createQuery, updateQuery, bulkCreateQueries, computeSystemTags, deleteQuery, deleteQueries, cleanupLegacyQueries,
  // responses
  listResponses, createResponse,
  // scores
  listScores, createScore,
  // snapshots
  listSnapshots, createSnapshot,
  // watch
  listWatches, getWatch, createWatch, updateWatch, deleteWatch, setWatchLastRun,
  // stats
  getBrandStats,
  // utility
  _clearAll,
};