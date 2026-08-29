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

const COLLECTIONS = {
  BRANDS: 'geo_brands',
  QUERIES: 'geo_queries',
  RESPONSES: 'geo_responses',
  SCORES: 'geo_scores',
  SNAPSHOTS: 'geo_snapshots',
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

function createBrand({ name, domain, llms_txt_url = '', settings = {} }) {
  if (!name || !domain) throw new Error('createBrand: name 和 domain 必填');
  const existing = findBrandByDomain(domain);
  if (existing) {
    throw new Error(`createBrand: domain="${domain}" 已存在 (id=${existing.id})`);
  }
  const brand = {
    id: makeId('brand'),
    name,
    domain,
    llms_txt_url: llms_txt_url || `https://${domain}/llms.txt`,
    settings: settings || {},
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  collection(COLLECTIONS.BRANDS).insert(brand);
  return brand;
}

function updateBrand(id, updates) {
  const c = collection(COLLECTIONS.BRANDS);
  const result = c.update(b => b.id === id, {
    ...updates,
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

function createQuery({ brand_id, prompt, category = 'general', engine_targets = ['deepseek'] }) {
  if (!brand_id) throw new Error('createQuery: brand_id 必填');
  if (!prompt) throw new Error('createQuery: prompt 必填');
  const q = {
    id: makeId('qry'),
    brand_id,
    prompt,
    category,
    engine_targets: Array.isArray(engine_targets) ? engine_targets : ['deepseek'],
    status: 'active',
    created_at: new Date().toISOString(),
  };
  collection(COLLECTIONS.QUERIES).insert(q);
  return q;
}

function deleteQuery(id) {
  return collection(COLLECTIONS.QUERIES).remove(q => q.id === id);
}

// === geo_responses ===
function listResponses(filter = {}) {
  let all = collection(COLLECTIONS.RESPONSES).all();
  if (filter.brand_id) all = all.filter(r => r.brand_id === filter.brand_id);
  if (filter.query_id) all = all.filter(r => r.query_id === filter.query_id);
  if (filter.engine) all = all.filter(r => r.engine === filter.engine);
  return all.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

function createResponse({ brand_id, query_id, engine, raw_answer = '', citations = [], latency_ms = null, usage = null, error = null, model = '' }) {
  if (!brand_id || !query_id || !engine) {
    throw new Error('createResponse: brand_id, query_id, engine 必填');
  }
  const r = {
    id: makeId('resp'),
    brand_id,
    query_id,
    engine,
    model,
    raw_answer: raw_answer || '',
    citations: Array.isArray(citations) ? citations : [],
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
  const s = {
    id: makeId('snap'),
    brand_id,
    week, // 'YYYY-Www' 格式，如 '2026-W34'
    summary_json,
    computed_at: new Date().toISOString(),
  };
  collection(COLLECTIONS.SNAPSHOTS).insert(s);
  return s;
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
  listQueries, createQuery, deleteQuery,
  // responses
  listResponses, createResponse,
  // scores
  listScores, createScore,
  // snapshots
  listSnapshots, createSnapshot,
  // stats
  getBrandStats,
  // utility
  _clearAll,
};