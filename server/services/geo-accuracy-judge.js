// ACMS GEO 描述准确率判定（v0.36 — LLM-as-judge 抽样）
// 路径：server/services/geo-accuracy-judge.js
//
// 目的：v0.34 量化"被推荐"，v0.35 解释"零点击影响"，v0.36 量化"被推荐得对不对"。
// AI 经常会在回答里编造或夸大品牌事实（"X 公司成立于 2005 年"但实际 2015），
// 这种错误描述会反噬品牌信任——单独看"提及率"看不到这个问题。
//
// 设计：
//   - 抽样 20 条商业意图回答（不足时补自然样本）
//   - 每条调 LLM 判定 verdict: correct / misleading / unknown
//   - accuracy_rate = correct / (correct + misleading)，排除 unknown（"无法验证"不是错）
//   - 缓存到 geo_scores 表 dimension='accuracy_rate'，7 天内复用
//   - caller（API 层 / cron / dashboard 按钮）决定何时触发
//
// 为什么不每次 score 时跑：LLM 调用慢（30-60s/品牌）+ 贵 + 没必要每 view 重跑
// 缓存策略让"读 score"是同步快路径，"跑判定"是异步后台路径

const GEO_STORE = require('./geo-store');
const { callLLM } = require('./llm-adapter');
const modelStore = require('../stores/model-store');

const SAMPLE_SIZE = 20;
const CACHE_DAYS = 7;

const COMM_KEYWORDS = [
  '哪家', '推荐', '对比', '排行', 'top', '哪个', '选', 'best', 'recommend',
  'vs', 'alternative', 'alternatives'
];

const JUDGE_SYSTEM_PROMPT = `你是 GEO 描述准确率审核员。
任务：给定一个品牌的事实摘要 + 一段 AI 回答，判定 AI 回答里关于该品牌的描述是否事实正确：
- "correct"：所有可验证事实（业务、规模、产品、定位）正确
- "misleading"：含有错误、过时、混淆、夸大或编造的事实信息
- "unknown"：信息无法从品牌摘要验证（输入没提供的细节，不要因此判错）

输出严格的 JSON：{"verdict": "correct|misleading|unknown", "issue": "若 misleading 简述问题（≤ 30 字），否则 null"}
只输出 JSON，不要任何其他文字。`;

function buildJudgeUserPrompt(brand, responseText) {
  const brandSummary = {
    name: brand.name,
    domain: brand.domain,
    aliases: brand.aliases || [],
    industry: brand.industry || '',
  };
  // 截断超长回答（1500 字符足够 LLM 看到品牌被提及的核心段落）
  const truncated = String(responseText || '').slice(0, 1500);
  return JSON.stringify({ brand: brandSummary, ai_response: truncated });
}

function findChatModel() {
  const models = modelStore.list();
  // 优先选支持 text 的；找不到就返回第一个 active 的
  const candidate = models.find(m => m.status === 'active' && (m.capabilities || []).includes('text'));
  return candidate || models.find(m => m.status === 'active') || null;
}

async function judgeOne(brand, text, modelId) {
  try {
    const r = await callLLM(modelId, [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: buildJudgeUserPrompt(brand, text) },
    ], { temperature: 0.2, jsonMode: true, maxTokens: 300 });
    if (!r || !r.content) return { verdict: 'unknown', issue: 'EMPTY_RESPONSE' };
    let obj = null;
    try {
      obj = JSON.parse(r.content);
    } catch (_) {
      // fallback: 提取文本中第一个 { ... }
      const m = String(r.content).match(/\{[\s\S]*?\}/);
      if (m) {
        try { obj = JSON.parse(m[0]); } catch (_) { /* keep null */ }
      }
    }
    if (!obj || !['correct', 'misleading', 'unknown'].includes(obj.verdict)) {
      return { verdict: 'unknown', issue: 'PARSE_FAILED' };
    }
    return { verdict: obj.verdict, issue: obj.issue || null };
  } catch (e) {
    return { verdict: 'unknown', issue: 'LLM_ERROR:' + (e.message || 'unknown') };
  }
}

function getCommercialQueryIds(queries) {
  return new Set(
    (queries || [])
      .filter(q => {
        if (!q) return false;
        const tags = (q.systemTags || q.tags || []);
        if (tags.some(t => typeof t === 'string' && t.startsWith('intent:comparative'))) return true;
        const lower = String(q.prompt || '').toLowerCase();
        return COMM_KEYWORDS.some(k => lower.includes(k.toLowerCase()));
      })
      .map(q => q.id)
      .filter(Boolean)
  );
}

function pickSamples(allResponses, commercialQueryIds, limit) {
  const commercial = allResponses.filter(r => r.query_id && commercialQueryIds.has(r.query_id));
  if (commercial.length >= limit) {
    // 商业意图足够：取最近 limit 条
    return commercial.slice(0, limit);
  }
  // 不足则补自然样本
  const others = allResponses.filter(r => r.query_id && !commercialQueryIds.has(r.query_id));
  return commercial.concat(others).slice(0, limit);
}

// 缓存最新一条 accuracy_rate 到内存 + db
function cacheAccuracy(brandId, result) {
  if (result.accuracy_rate == null) return null;
  return GEO_STORE.createScore({
    brand_id: brandId,
    dimension: 'accuracy_rate',
    score: result.accuracy_rate,
    details: {
      correct: result.correct,
      misleading: result.misleading,
      unknown: result.unknown,
      sample_size: result.sample_size,
      issues: (result.issues || []).slice(0, 5),
      model_used: result.model_used,
      computed_at: result.computed_at,
    },
  });
}

// 主入口：异步抽样判定 + 缓存
async function judgeResponsesAccuracy(brandId, options = {}) {
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return { ok: false, error: 'BRAND_NOT_FOUND' };

  // 缓存命中（非 force 时复用 7 天内数据）
  if (!options.force) {
    const cached = getCachedAccuracy(brandId);
    if (cached) return cached;
  }

  const model = findChatModel();
  if (!model) return { ok: false, error: 'NO_LLM_MODEL', message: '系统未配置 LLM 模型（系统管理 → AI 模型管理）' };

  const allResponses = GEO_STORE.listResponses({ brand_id: brandId }).filter(r => !r.error);
  const allQueries = GEO_STORE.listQueries(brandId);
  const commercialQueryIds = getCommercialQueryIds(allQueries);
  const samples = pickSamples(allResponses, commercialQueryIds, SAMPLE_SIZE);

  if (samples.length === 0) {
    return { ok: false, error: 'NO_DATA', message: '没有可抽样的回答（先跑 tracker）' };
  }

  // 串行调用避免并发压垮 LLM API
  let correct = 0, misleading = 0, unknown = 0;
  const issues = [];
  for (const r of samples) {
    const text = r.text || r.raw_answer || '';
    if (!text) { unknown++; continue; }
    const j = await judgeOne(brand, text, model.id);
    if (j.verdict === 'correct') correct++;
    else if (j.verdict === 'misleading') {
      misleading++;
      if (j.issue && issues.length < 10) {
        issues.push({ query_id: r.query_id, engine: r.engine, issue: j.issue });
      }
    } else unknown++;
  }

  const judged = correct + misleading + unknown;
  if (judged === 0) return { ok: false, error: 'JUDGE_FAILED' };

  const den = correct + misleading;
  const accuracyRate = den > 0 ? correct / den : null;
  const result = {
    ok: true,
    accuracy_rate: accuracyRate,
    correct,
    misleading,
    unknown,
    sample_size: judged,
    commercial_count: samples.filter(r => commercialQueryIds.has(r.query_id)).length,
    issues,
    model_used: model.id,
    computed_at: new Date().toISOString(),
  };

  // 写入缓存
  cacheAccuracy(brandId, result);

  return result;
}

// 读缓存：geo_scores 表最新一条 accuracy_rate
function getCachedAccuracy(brandId) {
  let scores;
  try {
    scores = GEO_STORE.listScores({ brand_id: brandId, dimension: 'accuracy_rate' });
  } catch (_) { return null; }
  if (!scores || scores.length === 0) return null;
  const latest = scores[0]; // listScores 按 computed_at desc
  if (!latest || !latest.computed_at) return null;
  const age = Date.now() - new Date(latest.computed_at).getTime();
  if (age > CACHE_DAYS * 24 * 60 * 60 * 1000) return null;
  const details = latest.details || {};
  return {
    ok: true,
    cached: true,
    accuracy_rate: latest.score,
    correct: details.correct,
    misleading: details.misleading,
    unknown: details.unknown,
    sample_size: details.sample_size,
    commercial_count: details.commercial_count,
    issues: details.issues || [],
    model_used: details.model_used,
    computed_at: latest.computed_at,
  };
}

module.exports = {
  judgeResponsesAccuracy,
  getCachedAccuracy,
  SAMPLE_SIZE,
  CACHE_DAYS,
  _internal: {
    judgeOne,
    findChatModel,
    buildJudgeUserPrompt,
    getCommercialQueryIds,
    pickSamples,
    JUDGE_SYSTEM_PROMPT,
  },
};