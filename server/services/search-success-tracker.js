// ACMS 小吉搜索成功经验追踪器（v0.89）
//
// 目的：让 web_search + fetch_url 链路上的「成功路径」持久化，下次类似 query 注入 prompt 复用。
// 设计原则：
//   - server 端默默观察，不修改主流程（零 LLM 行为风险）
//   - 单条 system_configs.search_success_log（FIFO 50 条，自动压缩）
//   - 检索接口用关键词重叠度打分（轻量、零依赖）
//   - 数据结构精简：query + query_normalized + path + url + summary（≤200 字符/条）
//
// 调用方：
//   - server/services/web-search.js: searchWeb 成功时 recordSearchSuccess
//   - server/tools/url-fetch.js: fetchUrlCore 成功时 recordFetchSuccess
//   - server/services/agent-buddy-skill.js: buildChatPrompt 调用 getRelevantSuccesses

const { collection } = require('../db/connection');

const STORAGE_KEY = 'search_success_log';
const MAX_ENTRIES = 50;          // 单条记录里数组最多 50 条
const MIN_QUERY_LEN = 4;         // 太短的 query 不记录（"天气""油价" 无意义）
const STOPWORDS = new Set([
  '的', '了', '是', '在', '我', '你', '他', '她', '它', '们', '和', '或', '就', '都',
  '请', '帮', '查', '搜', '看', '一下', '什么', '怎么', '为什么', '多少', '几个',
  '啊', '吗', '呢', '吧', '嗯', '哦', '呀',
]);

function getAll() {
  try {
    const cfg = collection('system_configs').findOne(c => c.key === STORAGE_KEY);
    if (!cfg || !cfg.value) return [];
    if (Array.isArray(cfg.value)) return cfg.value;
    // 兼容老的 JSON 字符串
    try { return JSON.parse(cfg.value); } catch (_) { return []; }
  } catch (_) {
    return [];
  }
}

function saveAll(entries) {
  const sysConfigs = collection('system_configs');
  const now = new Date().toISOString();
  const existing = sysConfigs.findOne(c => c.key === STORAGE_KEY);
  if (existing) {
    sysConfigs.update(c => c.key === STORAGE_KEY, { ...existing, value: entries, updated_at: now });
  } else {
    sysConfigs.insert({ key: STORAGE_KEY, value: entries, created_at: now, updated_at: now });
  }
}

/**
 * 记录 web_search 成功调用
 * @param {string} query 原始 query
 * @param {string} queryNormalized simplifyQuery 规范化后 query
 * @param {string} source 搜索引擎来源 (bing-api / bingcn / toutiao-hot / baidu / ddg / sogou ...)
 * @param {Array} results top results [{title, url, snippet}]
 */
function recordSearchSuccess(query, queryNormalized, source, results) {
  if (!query || query.length < MIN_QUERY_LEN) return;
  if (!Array.isArray(results) || results.length === 0) return;

  // 防止重复（同 query + source 1 小时内不重复记录）
  const entries = getAll();
  const oneHourAgo = Date.now() - 3600 * 1000;
  const dup = entries.find(e =>
    e.type === 'search' &&
    e.query === queryNormalized &&
    e.source === source &&
    e.ts > oneHourAgo
  );
  if (dup) return;

  // 取 top-1 URL 作为推荐
  const top = results[0];
  entries.push({
    type: 'search',
    query,                       // LLM 原始 query（参考价值）
    queryNormalized: queryNormalized || query,  // 实际生效 query
    source,                      // 走通的引擎
    topUrl: (top && top.url) || '',
    topTitle: (top && top.title) || '',
    ts: Date.now(),
    hits: results.length,
  });

  // FIFO 压缩到 MAX_ENTRIES
  while (entries.length > MAX_ENTRIES) entries.shift();
  saveAll(entries);
}

/**
 * 记录 fetch_url 成功调用（数据源直连类场景）
 */
function recordFetchSuccess(url, relatedQuery) {
  if (!url) return;
  const entries = getAll();
  const oneHourAgo = Date.now() - 3600 * 1000;
  const dup = entries.find(e =>
    e.type === 'fetch' &&
    e.topUrl === url &&
    e.ts > oneHourAgo
  );
  if (dup) return;

  // 从 URL 提取 domain 用于归类
  let domain = '';
  try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch (_) {}

  entries.push({
    type: 'fetch',
    query: relatedQuery || '',
    topUrl: url,
    domain,
    ts: Date.now(),
  });
  while (entries.length > MAX_ENTRIES) entries.shift();
  saveAll(entries);
}

/**
 * 关键词分词（中文按字 + 二元组，英文按词）
 */
function tokenize(text) {
  if (!text) return [];
  const tokens = [];
  // 英文/数字部分按空格分
  const enPart = text.match(/[a-zA-Z0-9]+/g) || [];
  enPart.forEach(w => tokens.push(w.toLowerCase()));
  // 中文部分：单字 + 2-gram
  const zhPart = text.replace(/[a-zA-Z0-9\s]/g, '');
  for (let i = 0; i < zhPart.length; i++) {
    const c = zhPart[i];
    if (!STOPWORDS.has(c)) tokens.push(c);
    if (i < zhPart.length - 1) {
      const bi = c + zhPart[i + 1];
      if (!STOPWORDS.has(bi)) tokens.push(bi);
    }
  }
  return tokens;
}

/**
 * 检索 top-N 相关成功案例（按关键词重叠度打分）
 * @param {string} currentQuery 当前用户 query
 * @param {number} topN 返回数量（默认 3）
 * @returns {Array<{summary: string}>}
 */
function getRelevantSuccesses(currentQuery, topN = 3) {
  if (!currentQuery) return [];
  const queryTokens = new Set(tokenize(currentQuery));
  if (queryTokens.size === 0) return [];

  const entries = getAll();
  const now = Date.now();
  const scored = entries
    .filter(e => now - e.ts < 30 * 24 * 3600 * 1000)  // 只看 30 天内
    .map(e => {
      const tokens = new Set(tokenize(e.queryNormalized || e.query || ''));
      let overlap = 0;
      queryTokens.forEach(t => { if (tokens.has(t)) overlap++; });
      const score = tokens.size > 0 ? overlap / Math.sqrt(tokens.size * queryTokens.size) : 0;
      return { entry: e, score };
    })
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return scored.map(m => formatSuccessHint(m.entry));
}

/**
 * 格式化成 LLM 友好的提示文本
 */
function formatSuccessHint(e) {
  if (e.type === 'fetch') {
    return `${e.query ? `「${e.query.slice(0, 20)}」` : '数据源'}→ ${e.domain || e.topUrl.slice(0, 50)}`;
  }
  // search 类型
  const queryHint = e.queryNormalized && e.queryNormalized !== e.query
    ? `${e.query.slice(0, 30)} → ${e.queryNormalized.slice(0, 30)}`
    : (e.query || '').slice(0, 40);
  const urlShort = (e.topUrl || '').replace(/^https?:\/\//, '').slice(0, 40);
  return `${queryHint}（${e.source}）→ ${urlShort}`;
}

module.exports = {
  recordSearchSuccess,
  recordFetchSuccess,
  getRelevantSuccesses,
  getAll,
  tokenize,  // 暴露供测试
};