// ACMS 网页搜索服务（v0.15，2026-06-21）
// 搜索源（按优先级）:
//   1. BING_API_KEY 已配 → Bing Web Search API v7（最快）
//   2. 浏览器 Puppeteer 搜搜狗（最稳，可执行 JS + 绕过反爬）
//   3. 下降级：搜狗 / Bing HTML 解析
//
// Bing API 配置（可选）:
//   环境变量: BING_API_KEY=xxx
//   config.json: { "bingApiKey": "xxx" }

const https = require('https');
const { browserSearch, launchBrowser } = require('./browser-fetch');
// v0.80: agent-browser 冗余 fallback（当 puppeteer 引擎全失败时使用）
const { searchBingCn: agentBrowserSearchBingCn } = require('./agent-browser-fetch');
// v0.89: 成功经验持久化（让 web_search 成功路径能跨 session 复用）
const successTracker = require('./search-success-tracker');

const SEARCH_TIMEOUT_MS = 10000;
const MAX_RESULTS = 40;
// v0.84: 并发 race 整体硬超时（所有源同时启动，12s 内谁先通过质量门谁赢）
const SEARCH_RACE_TIMEOUT_MS = 12000;

// v0.84: firstNonEmpty — 多个已启动的 promise 并发，第一个返回非空结果的胜出
//   其余 promise 不阻塞（各自内部有超时，后台自然结束）
function firstNonEmpty(promises, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; resolve(null); }
    }, timeoutMs);
    for (const p of promises) {
      p.then((r) => {
        if (done) return;
        if (r && Array.isArray(r.results) && r.results.length > 0) {
          done = true;
          clearTimeout(timer);
          resolve(r);
        }
      }).catch(() => { /* 单个源失败不影响其他 */ });
    }
  });
}

// v0.87g: 两阶段结果收集（用户要求）——
//   阶段1: 等高可信源（ab-bingcn）settle，收集**此时已完成**的其他源结果，合并返回
//   阶段2: 若阶段1 结果不足（空或太少），等待所有源都结束（Promise.allSettled），
//          合并全部结果做最终返回
//   调用方通过 checkQuality 判断阶段1 是否够用
async function collectWithPriority(promises, priorityIdx, extraWaitMs, timeoutMs, checkQuality) {
  // 阶段1: 等高可信源 settle + 已完成的源
  const stage1 = await new Promise((resolve) => {
    let settled = false;
    const seenUrl = new Set();
    const seenTitle = new Set();
    const merged = [];
    const addAll = (r, source) => {
      if (!r || !Array.isArray(r.results)) return;
      for (const item of r.results) {
        const uKey = normalizeUrlKey(item.url);
        const tKey = normalizeTitleKey(item.title);
        if (!uKey && !tKey) continue;
        if (seenUrl.has(uKey) || seenTitle.has(tKey)) continue;
        seenUrl.add(uKey);
        seenTitle.add(tKey);
        merged.push({ ...item, _source: source });
      }
    };

    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve({ merged, seenUrl, seenTitle }); }
    }, timeoutMs);

    // 其他源：并发收集（先到的先进）
    for (let i = 0; i < promises.length; i++) {
      if (i === priorityIdx) continue;
      promises[i].then((r) => {
        if (settled) return;
        addAll(r, r && r.source ? r.source : 'other');
      }).catch(() => {});
    }

    // 高可信源：必须等它 settle，结果排最前
    const p = promises[priorityIdx];
    if (p) {
      p.then((r) => {
        if (settled) return;
        if (r && Array.isArray(r.results) && r.results.length > 0) {
          // 高可信源插到最前（先收集的 other 结果往后挪）
          addAll(r, r.source || 'ab-bingcn');
          // 重新排序：ab-bingcn 排最前
          merged.sort((a, b) => (a._source === 'ab-bingcn' ? -1 : b._source === 'ab-bingcn' ? 1 : 0));
        }
        setTimeout(() => {
          if (!settled) { settled = true; clearTimeout(timer); resolve({ merged, seenUrl, seenTitle }); }
        }, extraWaitMs);
      }).catch(() => {
        setTimeout(() => {
          if (!settled) { settled = true; clearTimeout(timer); resolve({ merged, seenUrl, seenTitle }); }
        }, extraWaitMs);
      });
    } else {
      setTimeout(() => {
        if (!settled) { settled = true; clearTimeout(timer); resolve({ merged, seenUrl, seenTitle }); }
      }, extraWaitMs);
    }
  });

  const result1 = stage1.merged.length > 0 ? { results: stage1.merged, source: 'multi', _stage: 1 } : null;

  // 阶段1 够用 → 直接返回
  if (result1 && (!checkQuality || checkQuality(result1.results))) {
    return result1;
  }

  // 阶段2: 不够 → 等所有源都结束，合并全部
  console.log(`[web-search] collectWithPriority 阶段1 不足 (${stage1.merged.length}条)，等所有源结束后合并`);
  const settledAll = await Promise.allSettled(promises);
  const seenUrl = stage1.seenUrl;
  const seenTitle = stage1.seenTitle;
  const merged = [...stage1.merged];  // 保留阶段1 已有的（含 ab-bingcn 前置排序）
  const addAll2 = (r, source) => {
    if (!r || !Array.isArray(r.results)) return;
    for (const item of r.results) {
      const uKey = normalizeUrlKey(item.url);
      const tKey = normalizeTitleKey(item.title);
      if (!uKey && !tKey) continue;
      if (seenUrl.has(uKey) || seenTitle.has(tKey)) continue;
      seenUrl.add(uKey);
      seenTitle.add(tKey);
      merged.push({ ...item, _source: source });
    }
  };
  settledAll.forEach((s, idx) => {
    if (s.status === 'fulfilled' && s.value) {
      addAll2(s.value, promises[idx] && promises[idx]._srcName || ('source' + idx));
    }
  });
  return merged.length > 0 ? { results: merged, source: 'multi', _stage: 2 } : null;
}

// v0.84: 引擎包装 — 过滤 + 质量门，不过则视为空（让 firstNonEmpty 继续等下一个源）
function wrapEngine(name, promise, query) {
  return Promise.resolve(promise)
    .then((res) => {
      if (!res || !Array.isArray(res.results) || res.results.length === 0) {
        return { results: [], source: name };
      }
      let filtered = filterByRelevance(res.results, query);
      if (name === 'bingcn') {
        const grams = extractKeyTokens(query);
        const hasBigram = filtered.some((r) => {
          const t = (r.title || '').toLowerCase();
          return grams.some((g) => t.includes(g.toLowerCase()));
        });
        if (!hasBigram) {
          console.warn('[web-search] race bingcn 质量门未过(标题无2-gram), 视为空');
          return { results: [], source: name };
        }
      }
      return { results: filtered, source: name };
    })
    .catch(() => ({ results: [], source: name }));
}

// ── 搜索缓存（5 分钟 TTL，与 web-research 一致）──
const _searchCache = new Map();
const SEARCH_CACHE_TTL = 5 * 60 * 1000;

function getSearchCache(query, maxResults) {
  const key = `${query}|${maxResults}`.toLowerCase().trim();
  const cached = _searchCache.get(key);
  if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL) return cached.data;
  return null;
}

function setSearchCache(query, maxResults, data) {
  const key = `${query}|${maxResults}`.toLowerCase().trim();
  _searchCache.set(key, { data, ts: Date.now() });
  if (_searchCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of _searchCache) {
      if (now - v.ts > SEARCH_CACHE_TTL) _searchCache.delete(k);
    }
  }
}

// 调试开关：设为 true 会把首次响应的前 500 字写入日志
const DEBUG_DUMP_HTML = false;

function getBingApiKey() {
  if (process.env.BING_API_KEY) return process.env.BING_API_KEY;
  try {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(__dirname, '..', '..', 'config.json');
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (cfg.bingApiKey) return cfg.bingApiKey;
    }
  } catch (e) { /* 静默降级 */ }
  return null;
}

// 共享：清理 URL 末尾的多余标点（markdown 链接闭合、中文括号等）
function cleanUrl(u) {
  if (!u || typeof u !== 'string') return u;
  return u.replace(/[\\)\\]）】」』.,;:!?。，；：！？]+$/, '');
}

// v0.84: 共享 AD/垃圾结果黑名单（bingcn / baidu / sogou 解析共用）
const TITLE_BAN_RE = /(看看元宝|抢购|限时|钜惠|特惠|landing-?page|redirect-?page|推广链接|^推广$|^赞助$|^广告$)/i;
const URL_BAN_RE = /(landing-?page|tridChannel|html5\.qq\.com\/landingpage|tencent\.com\/evt\/dl|yuanbao\.tencent\.com|so\.html5\.qq)/i;
function isBadResult(title, url) {
  return (
    !title ||
    title.length < 4 ||
    TITLE_BAN_RE.test(title) ||
    URL_BAN_RE.test(url) ||
    url.includes('bing.com/') ||
    url.includes('microsoft.com/')
  );
}

// 共享：解码 sogou 重定向链接
function resolveSogouLink(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.hostname.includes('sogou.com') && u.pathname === '/link') {
      const encoded = u.searchParams.get('url');
      if (encoded) {
        try {
          let normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
          while (normalized.length % 4) normalized += '=';
          const decoded = Buffer.from(normalized, 'base64').toString('utf8');
          if (decoded.startsWith('http')) return cleanUrl(decoded);
        } catch {}
        try {
          const decoded = decodeURIComponent(encoded);
          if (decoded.startsWith('http')) return cleanUrl(decoded);
        } catch {}
      }
    }
  } catch {}
  return cleanUrl(rawUrl);
}

// v0.50: 相关性过滤 — 用 query 关键词命中数筛掉不相关结果（治"宽泛 query 拿 8 条 7 条是噪声"症状）
//   - 从 query 提取核心关键词（去 stopwords、过短的 token）
//   - 对每个 result，算 title+snippet+url 的命中关键词数
//   - score = hits / total_keywords；>= 0.25 才算"真相关"
//   - 全部 hits=0 时 fallback 用原结果（避免过滤太激进把真相关也丢）
//   - topK 限制最多 6 条（即使命中很多也只留前 6 强相关）
function filterByRelevance(results, query) {
  if (!Array.isArray(results) || results.length === 0 || !query) return results || [];
  const tokens = extractKeyTokens(query);
  if (tokens.length === 0) return results;

  const scored = results.map((r) => {
    const title = String(r.title || '').toLowerCase();
    const snippet = String(r.snippet || '').toLowerCase();
    const url = String(r.url || '').toLowerCase();
    const haystack = title + ' ' + snippet + ' ' + url;
    let hits = 0;
    const hitTokens = [];
    for (const t of tokens) {
      if (haystack.includes(t.toLowerCase())) {
        hits++;
        hitTokens.push(t);
      }
    }
    // 触发词加权：title 含 "决赛"/"晋级"/"半决赛"/"赛程" 等赛事词，+0.4 (独立加分)
    const triggerWords = ['决赛', '晋级', '半决赛', '赛程', '决赛圈', '淘汰赛', '四强', '八强', '小组赛'];
    let bonus = 0;
    for (const tw of triggerWords) if (title.includes(tw)) bonus += 1;
    // score = 关键词命中率 (0-1) + 触发词存在加分 (0.4 一次性) — 治"query 没含赛队名但 result 是真赛况"
    const baseScore = hits / tokens.length;
    const triggerBonus = bonus > 0 ? 0.4 : 0;
    const score = baseScore + triggerBonus;
    return { r, hits, score, hitTokens };
  });

  // 按 score 降序排序
  scored.sort((a, b) => b.score - a.score);

  // 相关结果按调用方请求数返回，服务级上限为 20。
  const strong = scored.filter((s) => s.score >= 0.18).map((s) => s.r);
  if (strong.length > 0) {
    return strong.slice(0, MAX_RESULTS);
  }

  // v0.87c: 全 0 分且 query 有实体词 → 返回空（结果与 query 完全无关，让 race 等下一个源）
  //   治"toutiao 对任何 query 返回热榜新闻，0 分命中却降级保留 → 垃圾赢 race"。
  //   宽泛 query（tokens < 2，如"最新新闻"）不适用——本身无实体词可匹配。
  if (tokens.length >= 2) {
    console.log(`[web-search] filterByRelevance 全 0 分 (tokens=${tokens.length}), 返回空等待下一源`);
    return [];
  }

  // 都没有强匹配 — 降级过滤：至少去掉明显无关的结果（如单字字典页）
  if (results.length <= 3) return results;  // 结果太少不滤
  const filtered = results.filter(function(r) {
    var u = (r.url || '').toLowerCase();
    var t = (r.title || '').toLowerCase();
    // 去掉汉字单字字典页（baike.baidu.com/item/单字 或 baike.baidu.com/item/单字/数字ID）
    if (u.match(/baike\.baidu\.com\/item\/[\u4e00-\u9fff%]+\/?\d*$/)) return false;
    // 去掉 hanyuguoxue 等字典站
    if (u.includes('hanyuguoxue.com') || u.includes('zdic.net') || u.includes('guoxuedashi.com') || u.includes('guoxue.com')) return false;
    return true;
  });
  return filtered.length > 0 ? filtered.slice(0, MAX_RESULTS) : results.slice(0, MAX_RESULTS);
}

// v0.50: 提取关键词 — 中文按 2-char sliding window（与 browser-fetch.js 一致），英文按空格拆
//   stopwords 过滤掉宽泛词（最新/赛况/状态/比分/晋级 ...）
//   因为宽泛词搜索引擎也能匹配，但相关度低：把"2026 FIFA 世界杯 决赛 比分 晋级"中的"比分/晋级"过滤掉
//   保留"2026 / FIFA / 世界杯 / 决赛 / 阿根廷 / 西班牙" 等实体词
const STOPWORDS = new Set([
  '最新', '赛况', '状态', '比分', '晋级', '动态', '情况', '信息', '新闻',
  '查询', '搜索', '现在', '当前', '今天', '昨天', '明天',
  '怎么办', '怎么样', '什么', '怎么', '如何',
  '的', '了', '是', '在', '和', '与', '或', '及',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'latest', 'current', 'now', 'today'
]);

function extractKeyTokens(query) {
  if (!query) return [];
  const q = String(query).toLowerCase();
  const tokens = new Set();
  // 1) 英文/数字 token (单独按连续字符 — unicode class 严格切，不用 split-by-punctuation 这样英文中文混排会糊在一起)
  const englishMatches = (q.match(/[a-z0-9]+/gi) || []);
  for (const t of englishMatches) {
    if (t.length >= 2 && !STOPWORDS.has(t.toLowerCase())) tokens.add(t.toLowerCase());
  }
  // 2) 中文: 把已切走的英文/数字/空白去掉，剩纯中文做 2-char sliding window
  const chinese = q.replace(/[a-z0-9\s\p{P}]+/gi, ' ');
  const matched = chinese.match(/[一-鿿]+/g) || [];
  for (const block of matched) {
    for (let i = 0; i < block.length - 1; i++) {
      const two = block.slice(i, i + 2);
      if (!STOPWORDS.has(two)) tokens.add(two);
    }
  }
  return Array.from(tokens);
}

// ─────────────────────────────────────────────────────────────
// v0.83: 宽泛新闻意图检测 + 头条热榜直连（治"今天最新新闻"类垃圾结果）
//   根因：宽泛 query 全是 stopword → 搜索引擎返回日历网/首页垃圾 →
//         LLM 拿垃圾编造新闻。解法：意图命中且无实体词时直接读热榜，
//         不经过搜索引擎。
// ─────────────────────────────────────────────────────────────

const NEWS_INTENT_RE = /新闻|最新|热点|头条|要闻|时政|大事|消息|时讯|速递|今天.*(发生|有啥|什么)|看.*新闻/;
// 有分类词 → 用户要特定领域（科技/财经…），热榜是综合榜，不适用
const NEWS_CATEGORY_RE = /科技|财经|体育|娱乐|军事|国际|国内|社会|健康|教育|游戏|汽车|房产|股市|数码|文化|旅游/;

function isVagueNewsQuery(query) {
  const q = String(query || '').trim();
  if (!NEWS_INTENT_RE.test(q)) return false;
  if (NEWS_CATEGORY_RE.test(q)) return false;          // 分类需求 → 正常搜索
  if (/[a-zA-Z0-9]/.test(q)) return false;             // 有实体（2026/世界杯）→ 正常搜索
  const chinese = q.replace(/[^一-鿿]/g, '');
  if (chinese.length > 12) return false;               // 太长 → 可能有具体主题
  return true;
}

async function fetchToutiaoHotBoard(maxResults = 20) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return { error: `HTTP ${resp.status}`, results: [] };
    const data = await resp.json();
    const items = Array.isArray(data?.data) ? data.data : [];
    const results = items
      .map((it) => ({
        title: String(it.Title || it.title || '').slice(0, 200),
        url: String(it.Url || it.url || ''),
        snippet: `热度 ${it.HotValue ?? it.hot_value ?? ''}`.slice(0, 300),
        hotValue: it.HotValue ?? it.hot_value ?? 0,
      }))
      .filter((r) => r.title)
      .slice(0, maxResults);
    if (results.length === 0) return { error: '热榜为空', results: [] };
    return { results, source: 'toutiao-hot' };
  } catch (e) {
    return { error: `头条热榜失败: ${e.message}`, results: [] };
  }
}

// v0.87j: query 规范化 — 治"LLM 生成堆砌词 query 导致引擎理解偏"
//   实测（2026-08-02 Bing CN）:
//     "深圳95号汽油价格"       → ❌ 深圳百科（价格太泛命中地名）
//     "深圳95号汽油当日价格"   → ✅ 油价站（当日价格指向价格查询页）
//     "深圳油价 95号"          → ❌ 深圳百科
// v0.87j: 冗余词清洗——必须覆盖 LLM 常见的堆砌词（含日期年份、官网，否则残留会让 Bing 理解偏）
//   实测: "深圳95号汽油价格 2026年8月" 只删价格词 → "深圳95号汽油 2026年8月 当日价格"（日期残留→Bing 理解偏）
//        "深圳95号汽油价格 查询官网" → "深圳95号汽油 官网 当日价格"（官网残留）
const QUERY_REDUNDANT_RE = /实时|查询|官网|今日|今天|最新|多少钱|价格是多少|什么价格|是多少钱|多少钱一|每升|最新价格|今日价格|20\d{2}年\d{1,2}月\d{1,2}日|20\d{2}年\d{1,2}月|\d{4}年\d{1,2}月/g;
const PRICE_INTENT_RE = /价格|多少钱|行情|油价|金价|股价|房价|报价|多少钱一/;
// v0.87j: 价格词删除需防跨界——"汽油价格"里"油+价"组"油价"（位置6）比"价格"（位置7）更早匹配。
//   用 lookbehind 排除跨界: "汽油"+"价格"的"油价"前面是"汽"→不删; "黄金"+"价格"的"金价"前面是"黄"→不删;
//   "股票"+"价格"的"股价"前面是"票"→不删。这样"价格"正常删，保留产品实体（汽油/黄金/股票）。
const PRICE_NOUN_RE = /价格|(?<!汽)油价|(?<!黄)金价|(?<!票)股价|房价|行情|报价/g;

function simplifyQuery(query) {
  const q = String(query || '').trim();
  if (!q) return q;

  let cleaned = q.replace(QUERY_REDUNDANT_RE, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length < 4) cleaned = q;  // 保护：清洗太狠用原 query

  // 价格意图 + 无"当日/今日价格"措辞 → 规范化为 "实体 当日价格"
  if (PRICE_INTENT_RE.test(cleaned) && !/当日价格|今日价格/.test(cleaned)) {
    const entity = cleaned.replace(PRICE_NOUN_RE, '').replace(/\s+/g, ' ').trim();
    if (entity.length >= 2) {
      const normalized = entity + ' 当日价格';
      console.log(`[web-search] query 规范化: "${cleaned}" → "${normalized}"`);
      return normalized;
    }
  }
  return cleaned;
}

/**
 * v0.49 网页搜索主函数：多搜索引擎优先级串联
 * @param {string} query - 搜索关键词
 * @param {object} [options] - { maxResults }
 * @returns {Promise<{results: Array, error?: string}>}
 */
async function searchWeb(query, options = {}) {
  if (!query || typeof query !== 'string') {
    return { error: '搜索关键词必填', results: [] };
  }

  // v0.87i: 入口统一简化 query（治 LLM 堆砌词）
  const originalQuery = query;
  query = simplifyQuery(query);
  if (query !== originalQuery) {
    console.log(`[web-search] query 简化: "${originalQuery}" → "${query}"`);
  }

  const apiKey = getBingApiKey();
  const maxResults = Math.min(options.maxResults || MAX_RESULTS, 40);
  const encodedQuery = encodeURIComponent(query.trim());
  const tStart = Date.now();  // v0.84: race 耗时统计

  // ── 缓存命中直接返回 ──
  const cached = getSearchCache(query, maxResults);
  if (cached) {
    console.log(`[web-search] 缓存命中: "${query.slice(0, 50)}"`);
    return { ...cached, _cached: true };
  }

  try {
    // v0.83: 宽泛新闻意图 → 头条热榜直连（不搜搜索引擎）
    if (isVagueNewsQuery(query)) {
      console.log('[web-search] 宽泛新闻意图, 走头条热榜: ' + query);
      const hot = await fetchToutiaoHotBoard(maxResults);
      if (hot.results.length > 0) {
        const result = { results: hot.results, source: 'toutiao-hot' };
        setSearchCache(query, maxResults, result);
        successTracker.recordSearchSuccess(originalQuery, query, 'toutiao-hot', hot.results);
        return result;
      }
      console.warn('[web-search] 热榜失败, 降级到搜索引擎: ' + (hot.error || ''));
    }

    if (apiKey) {
      // 模式 A：Bing Web Search API（需 Key）
      console.log('[web-search] 使用 Bing API 搜索');
      const data = await fetchBingApi(apiKey, encodedQuery, maxResults);
      const results = parseBingApiResults(data, maxResults);
      if (results.length > 0) {
        const result = { results, source: 'bing-api' };
        setSearchCache(query, maxResults, result);
        successTracker.recordSearchSuccess(originalQuery, query, 'bing-api', results);
        return result;
      }
    }

    // ── v0.84: 分层并发 race，先到先得 ──
    //   层1（高质量，优先）: bing-api / bingcn / toutiao / baidu / ddg（puppeteer 真实浏览器）
    //     8s 窗口内第一个通过质量门的非空结果立即返回。
    //   层2（HTTP 快源，降级）: sogou-html / bing-html —— 纯 HTTP 1s 返回，但质量差，
    //     若让它们参与层1 竞争会永远赢（puppeteer 天然 3-5s），所以只在层1 全废后用。
    //   兜底: 热榜（v0.83）。
    const highSources = [];
    if (apiKey) {
      highSources.push(
        wrapEngine('bing-api', fetchBingApi(apiKey, encodedQuery, maxResults).then((data) => {
          return { results: parseBingApiResults(data, maxResults) };
        }), query)
      );
    }
    highSources.push(
      wrapEngine('bingcn',  browserSearchBingCn(query, maxResults), query),
      wrapEngine('toutiao', browserSearchToutiao(query, maxResults), query),
      wrapEngine('baidu',   browserSearchBaidu(query, maxResults), query),
      wrapEngine('ddg',     browserSearchDDG(query, maxResults), query),
      // v0.87c: ab-bingcn 加入层1 —— agent-browser（真实 Chromium）能过 puppeteer 被限的
      //   BingCN 反爬，之前因 parseBingCnA11yTree URL 提取 bug 永远 0 条（已修），且不在 race 里
      wrapEngine('ab-bingcn', agentBrowserSearchBingCn(query, maxResults), query),
    );
    const lowSources = [
      wrapEngine('sogou-html', fetchSogou(encodedQuery).then((html) => ({ results: parseSogouResults(html, maxResults) })), query),
      wrapEngine('bing-html',  fetchBingHtml(encodedQuery).then((html) => ({ results: parseBingHtmlResults(html, maxResults) })), query),
    ];

    // 层1: 高质量源竞争（v0.87g 两阶段）
    //   阶段1: 并发执行，等 ab-bingcn（高可信源）settle + 2s 收集已完成源 → 合并返回
    //   阶段2: 若阶段1 不足（ab-bingcn 结果 < 3 条 或 总数 < 3），等所有源结束合并最终返回
    //   高可信源结果排最前（_source: 'ab-bingcn'），LLM 能区分并优先参考
    const abIdx = highSources.length - 1;  // ab-bingcn 是最后一个
    // 给每个源 promise 附加来源名（阶段2 合并用）
    highSources.forEach((p, i) => {
      if (!p._srcName) p._srcName = i === abIdx ? 'ab-bingcn' : ('src' + i);
    });
    const checkQuality = (results) => {
      const abCount = results.filter(r => r._source === 'ab-bingcn').length;
      return abCount >= 3;  // 高可信源 >=3 条 → 阶段1 够用
    };
    const winner1 = await collectWithPriority(highSources, abIdx, 2000, 30000, checkQuality);
    if (winner1 && winner1.results.length > 0) {
      const result = { results: winner1.results, source: winner1.source };
      if (winner1._stage) result._stage = winner1._stage;
      console.log(`[web-search] race层1 胜出: ${winner1.source} ${winner1.results.length} 条 (${Date.now() - tStart}ms, stage=${winner1._stage || 1})`);
      setSearchCache(query, maxResults, result);
      successTracker.recordSearchSuccess(originalQuery, query, winner1.source, winner1.results);
      return result;
    }

    // 层2: HTTP 快源（此时它们大概率已返回，再等 2s）
    console.warn(`[web-search] race层1 全部失败/超时(${SEARCH_RACE_TIMEOUT_MS}ms)，降级 HTTP 快源`);
    const winner2 = await firstNonEmpty(lowSources, 2000);
    if (winner2 && winner2.results.length > 0) {
      const result = { results: winner2.results, source: winner2.source };
      console.log(`[web-search] race层2 胜出: ${winner2.source} ${winner2.results.length} 条 (${Date.now() - tStart}ms)`);
      setSearchCache(query, maxResults, result);
      successTracker.recordSearchSuccess(originalQuery, query, winner2.source, winner2.results);
      return result;
    }

    // ── v0.83: 全失败 → 热榜兜底 ──
    //   场景：任意 query（不只新闻意图）搜索引擎返回空/垃圾时，
    //   用头条热榜真实数据兜底，用户至少拿到可用的新闻列表。
    console.warn(`[web-search] 全链路失败，热榜兜底 (${Date.now() - tStart}ms)`);
    const hotFallback = await fetchToutiaoHotBoard(maxResults);
    if (hotFallback.results.length > 0) {
      const result = { ...hotFallback, _fallback: true };
      setSearchCache(query, maxResults, result);
      return result;
    }

    const failResult = { error: '未找到相关结果', results: [] };
    setSearchCache(query, maxResults, failResult);
    return failResult;
  } catch (e) {
    return { error: `搜索失败: ${e.message}`, results: [] };
  }
}

/**
 * v0.76: 并行浏览器搜索 — Baidu / BingCN / Toutiao 三路并行
 * 返回第一个有优质结果的引擎，或 null（全部失败）
 */
async function parallelBrowserSearch(query, maxResults) {
  const engines = [
    { name: 'baidu', fn: () => browserSearchBaidu(query, maxResults) },
    { name: 'bingcn', fn: () => browserSearchBingCn(query, maxResults) },
    { name: 'toutiao', fn: () => browserSearchToutiao(query, maxResults) },
  ];

  const settled = await Promise.allSettled(engines.map(e => e.fn()));

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status !== 'fulfilled') {
      console.warn(`[web-search] ${engines[i].name} 抛错:`, r.reason?.message);
      continue;
    }
    const res = r.value;
    if (!res.results?.length) continue;

    console.log(`[web-search] ${engines[i].name} 浏览器搜索: ${res.results.length} 条`);

    if (engines[i].name === 'baidu') {
      // Baidu 相关性过滤（原有逻辑）
      const filtered = filterByRelevance(res.results, query);
      if (filtered.length > 0) {
        console.log(`[web-search] Baidu 相关性过滤: ${res.results.length} → ${filtered.length} 条`);
        return { results: filtered, source: 'baidu' };
      }
      console.warn('[web-search] Baidu 相关性过滤后为空, 兜底所有结果');
      return { results: res.results, source: 'baidu' };
    }

    if (engines[i].name === 'bingcn') {
      // BingCN 质量门（原有逻辑）
      var filtered = filterByRelevance(res.results, query);
      var hasBigram = false;
      if (filtered.length > 0) {
        var grams = extractKeyTokens(query);
        for (var gi = 0; gi < filtered.length && !hasBigram; gi++) {
          var t = (filtered[gi].title || '').toLowerCase();
          for (var gj = 0; gj < grams.length && !hasBigram; gj++) {
            if (t.includes(grams[gj].toLowerCase())) hasBigram = true;
          }
        }
      }
      if (filtered.length > 0 && hasBigram) {
        return { results: filtered, source: 'bingcn' };
      }
      console.warn('[web-search] BingCN 结果不相关，跳过');
      continue;
    }

    if (engines[i].name === 'toutiao') {
      // Toutiao 相关性过滤
      var filtered = filterByRelevance(res.results, query);
      if (filtered.length > 0) {
        return { results: filtered, source: 'toutiao' };
      }
      console.warn('[web-search] Toutiao 相关性过滤后为空，跳过');
      continue;
    }
  }

  return null;
}

// ========================
// 模式 B-0 (v0.77): 多源并行 + 合并 + dedup (Baidu / BingCN / Toutiao / DDG)
//   解决 schema 上限 50 但实际返 10-25 的差距
//   调用方 maxResults > 8 才走这里；<= 8 用下面老的 parallelBrowserSearch 保留兼容
// ========================

function normalizeUrlKey(u) {
  if (!u) return '';
  try {
    const url = new URL(u);
    return (url.hostname.toLowerCase().replace(/^www\./, '') + url.pathname.replace(/\/$/, '')).toLowerCase();
  } catch {
    return String(u).toLowerCase().split('?')[0].split('#')[0];
  }
}

function normalizeTitleKey(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, ' ')
    .replace(/[^\w\u4e00-\u9fff]/g, '')
    .trim()
    .slice(0, 60);
}

async function parallelMergeSearch(query, maxResults) {
  const engines = [
    { name: 'baidu',   fn: () => browserSearchBaidu(query, maxResults) },
    { name: 'bingcn',  fn: () => browserSearchBingCn(query, maxResults) },
    { name: 'toutiao', fn: () => browserSearchToutiao(query, maxResults) },
    { name: 'ddg',     fn: () => browserSearchDDG(query, maxResults) },
    // v0.80: agent-browser 冗余 fallback（puppeteer 全失败时启用）
    { name: 'ab-bingcn', fn: () => agentBrowserSearchBingCn(query, maxResults) },
  ];

  const settled = await Promise.allSettled(engines.map((e) => e.fn()));

  const seenUrl = new Set();
  const seenTitle = new Set();
  const merged = [];
  const stats = {};

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    const name = engines[i].name;
    if (r.status !== 'fulfilled') {
      stats[name] = `ERR(${r.reason?.message?.slice(0, 60) || 'unknown'})`;
      console.warn(`[web-search] ${name} 抛错:`, r.reason?.message);
      continue;
    }
    const res = r.value;
    if (!res.results?.length) {
      stats[name] = '0';
      continue;
    }
    stats[name] = String(res.results.length);
    console.log(`[web-search] ${name} 并行贡献: ${res.results.length} 条`);

    const filtered = filterByRelevance(res.results, query);

    // v0.83: bingcn 质量门对齐（parallelBrowserSearch 已有，parallelMerge 漏了）
    //   宽泛/人名 query 时 bingcn 返回日历网/字典页垃圾，标题不含 query 的
    //   2-gram → 跳过，避免垃圾进合并污染结果。
    if (name === 'bingcn') {
      const grams = extractKeyTokens(query);
      const hasBigram = filtered.some((r) => {
        const t = (r.title || '').toLowerCase();
        return grams.some((g) => t.includes(g.toLowerCase()));
      });
      if (!hasBigram) {
        console.warn('[web-search] parallelMerge bingcn 质量门未过(标题无2-gram), 跳过');
        continue;
      }
    }

    let added = 0;
    for (const item of filtered) {
      const uKey = normalizeUrlKey(item.url);
      const tKey = normalizeTitleKey(item.title);
      if (!uKey && !tKey) continue;
      if (seenUrl.has(uKey) || seenTitle.has(tKey)) continue;
      seenUrl.add(uKey);
      seenTitle.add(tKey);
      merged.push({ ...item, _source: name });
      added++;
    }
    if (added > 0) stats[name] = `${stats[name]}→${added}`;
  }

  console.log(`[web-search] parallelMerge 合并: ${Object.entries(stats).map(([k, v]) => `${k}:${v}`).join(' / ')} → 总 ${merged.length} 条 → 截 max=${maxResults}`);

  if (merged.length === 0) return null;
  return {
    results: merged.slice(0, maxResults),
    source: 'multi',
    sources: engines.map((e) => e.name),
  };
}

// ========================
// 模式 A：Bing Web Search API
// ========================

function fetchBingApi(apiKey, encodedQuery, count) {
  return new Promise((resolve, reject) => {
    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodedQuery}&count=${count}&mkt=zh-CN`;
    const req = https.get(url, {
      headers: { 'Ocp-Apim-Subscription-Key': apiKey, 'Accept': 'application/json' },
      timeout: SEARCH_TIMEOUT_MS,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          let errMsg = `HTTP ${res.statusCode}`;
          try { const errData = JSON.parse(data); errMsg += `: ${errData.message || JSON.stringify(errData)}`; } catch {}
          return reject(new Error(errMsg));
        }
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`解析 Bing API 失败: ${e.message}`)); }
      });
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('搜索超时')); });
  });
}

function parseBingApiResults(data, maxResults) {
  const results = [];
  if (!data?.webPages?.value) return results;
  for (const item of data.webPages.value) {
    if (!item.name || !item.url) continue;
    results.push({ title: (item.name || '').slice(0, 200), url: item.url, snippet: (item.snippet || '').slice(0, 300) });
    if (results.length >= maxResults) break;
  }
  return results;
}

// ========================
// 模式 B：搜狗搜索 HTML
// ========================

function fetchSogou(encodedQuery) {
  return new Promise((resolve, reject) => {
    const url = `https://www.sogou.com/web?query=${encodedQuery}`;

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      timeout: SEARCH_TIMEOUT_MS,
    }, (res) => {
      let html = '';
      res.on('data', chunk => html += chunk);
      res.on('end', () => resolve(html));
    });

    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('搜索超时')); });
  });
}

function parseSogouResults(html, maxResults) {
  const results = [];
  if (!html || html.length < 200) return results;

  const seenUrls = new Set();

  const addResult = (url, title, snippet) => {
    if (!url || !title || seenUrls.has(url)) return;
    // 解码 sogou 重定向 + 清理末尾标点
    url = resolveSogouLink(url);
    if (url.includes('sogou.com') || url.includes('bing.com') || url.includes('microsoft.com')) return;
    // v0.84: 广告/垃圾黑名单（元宝/抢购/推广…，与 bingcn/baidu 对齐）
    if (isBadResult(title.replace(/<[^>]+>/g, '').trim(), url)) return;
    if (url.startsWith('http')) {
      seenUrls.add(url);
      results.push({
        title: title.replace(/<[^>]+>/g, '').trim().slice(0, 200),
        url: url,
        snippet: (snippet || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300),
      });
    }
  };

  // 策略：用多种模式扫描全页面的结果链接
  // 搜狗 2025-2026 的 HTML 中，搜索结果通常在 <div class="results"> 或直接 <div class="vrwrap">
  // 但类名经常变，所以用区域标记 + 链接模式绕过

  // 1. 找搜索结果区域（如有）
  const bodyStart = html.indexOf('<!--searchresult-->');
  const bodyEnd = html.indexOf('<!--/searchresult-->');
  const searchBody = bodyStart >= 0 && bodyEnd > bodyStart
    ? html.substring(bodyStart, bodyEnd)
    : html;

  // 2. 匹配所有 <a href="http...">TITLE</a> 模式
  //    先尝试带 h3/h2 的（标题通常被包裹）
  const hLinkRe = /<h[23][^>]*>[\s]*<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>[\s]*<\/h[23]>/gi;
  let m;
  while ((m = hLinkRe.exec(searchBody)) !== null) {
    if (results.length >= maxResults) break;
    addResult(m[1], m[2], '');
  }

  // 3. 匹配 <a> 直接链接（排除搜索框/导航区）
  if (results.length < maxResults) {
    const aRe = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/gi;
    // 重置 lastIndex
    aRe.lastIndex = 0;
    while ((m = aRe.exec(searchBody)) !== null) {
      if (results.length >= maxResults) break;
      const url = m[1];
      const title = m[2].replace(/<[^>]+>/g, '').trim();
      if (!title || title.length < 3) continue;  // 过滤图标/按钮等短文本
      addResult(url, title, '');
    }
  }

  // 4. 尝试从 snip/abstract 区域提取摘要
  //    （给已有的结果补充摘要）
  for (const r of results) {
    if (r.snippet) continue;
    // 在 html 里找 url 附近的一段文字
    const idx = html.indexOf(r.url);
    if (idx < 0) continue;
    const around = html.substring(Math.max(0, idx - 200), idx + 500);
    const pRe = /<p[^>]*>([\s\S]{10,300}?)<\/p>/i.exec(around);
    if (pRe) {
      const txt = pRe[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (txt.length > 10) r.snippet = txt.slice(0, 300);
    }
  }

  return results.slice(0, maxResults);
}

// ========================
// 模式 C：Bing 网页版（fallback）
// ========================

function fetchBingHtml(encodedQuery) {
  return new Promise((resolve, reject) => {
    const url = `https://www.bing.com/search?q=${encodedQuery}`;
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      timeout: SEARCH_TIMEOUT_MS,
    }, (res) => {
      let html = '';
      res.on('data', chunk => html += chunk);
      res.on('end', () => resolve(html));
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('搜索超时')); });
  });
}

function parseBingHtmlResults(html, maxResults) {
  const results = [];
  if (!html || html.length < 200) return results;
  const seenUrls = new Set();

  // Bing HTML 搜索结果: <li class="b_algo">
  const algoRegex = /<li[^>]*class="[^"]*\bb_algo\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = algoRegex.exec(html)) !== null) {
    const block = match[1];
    if (results.length >= maxResults) break;

    const linkMatch = block.match(/<h2>?[^<]*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const url = cleanUrl(linkMatch[1]);
    let title = linkMatch[2].replace(/<[^>]+>/g, '').trim();

    if (!url || !title || seenUrls.has(url)) continue;
    seenUrls.add(url);

    let snippet = '';
    const pMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (pMatch) snippet = pMatch[1].replace(/<[^>]+>/g, '').trim();

    results.push({ title: title.slice(0, 200), url, snippet: snippet.slice(0, 300) });
  }

  return results;
}

// ========================
// 模式 B-1：浏览器 Puppeteer 抓 cn.bing.com (v0.49 web-search 修复：替代搜狗)
//   实测：当前网络 cn.bing.com 500ms 内 200，FIFA 命中，质量好
//   保留 playwright 单 browser 共享（launchBrowser 单例）
// ========================
async function browserSearchBingCn(query, maxResults = 15) {
  let browser;
  try {
    browser = await launchBrowser();
  } catch (e) {
    return { error: `浏览器启动失败: ${e.message}`, results: [] };
  }
  let page = null;
  try {
    page = await browser.newPage();
    await page.setDefaultNavigationTimeout(30000);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' });

    const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-Hans`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2500));  // 等 JS 渲染

    const results = await page.evaluate((max) => {
      // 先删 AD 区（bing 广告 class 固定，精准删除）
      const adSelectors = [
        '.b_ad', '.b_algoHeader', '#b_results > aside', '.b_paginate',
        '.b_widget', '.b_caption > .b_factrow', '.b_rs', '.b_scopebar',
        '[class*="b_ad"]', '#b_content + *',
      ];
      document.querySelectorAll(adSelectors.join(',')).forEach(el => el.remove());

      // AD 黑名单（与 browserSearch 共用）
      const titleBanRe = /(看看元宝|抢购|限时|钜惠|特惠|landing-?page|redirect-?page|推广链接|^推广$|^赞助$|^广告$)/i;
      const urlBanRe = /(landing-?page|tridChannel|html5\.qq\.com\/landingpage|tencent\.com\/evt\/dl|yuanbao\.tencent\.com|so\.html5\.qq)/i;
      const isBadResult = (title, url) =>
        !title ||
        title.length < 4 ||
        titleBanRe.test(title) ||
        urlBanRe.test(url) ||
        url.includes('bing.com/') ||
        url.includes('microsoft.com/');

      const items = [];
      const seen = new Set();
      const blocks = document.querySelectorAll('li.b_algo');
      for (const block of blocks) {
        if (items.length >= max) break;
        const link = block.querySelector('h2 a[href^="http"], a[href^="http"]');
        if (!link) continue;
        const rawUrl = link.href;
        const title = (link.textContent || '').trim();
        if (isBadResult(title, rawUrl)) continue;
        if (seen.has(rawUrl)) continue;
        seen.add(rawUrl);
        const snipEl = block.querySelector('.b_caption p, .b_snippet, p');
        const snip = snipEl ? (snipEl.textContent || '').trim() : '';
        items.push({ title: title.slice(0, 200), url: rawUrl, snippet: snip.slice(0, 300) });
      }
      // 兜底：所有 h2 > a（应对 b_algo class 偶尔变化）
      if (items.length < max) {
        const h2Links = document.querySelectorAll('h2 a[href^="http"]');
        for (const a of h2Links) {
          if (items.length >= max) break;
          const rawUrl = a.href;
          const title = (a.textContent || '').trim();
          if (isBadResult(title, rawUrl)) continue;
          if (seen.has(rawUrl)) continue;
          seen.add(rawUrl);
          items.push({ title: title.slice(0, 200), url: rawUrl, snippet: '' });
        }
      }
      return items;
    }, maxResults);

    return { results };
  } catch (e) {
    return { error: `浏览器 BingCN 搜索失败: ${e.message}`, results: [] };
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}

// ========================
// 模式 B-1.5 (v0.77): 浏览器 Puppeteer 抓 html.duckduckgo.com (DDG)
//   复用 ACMS 现有 puppeteer-extra + stealth plugin，可过 DDG HTML 端点反爬
//   适合：英文 / 海外 / 隐私敏感类 query（中文也走得通）
//   单页 ~10 条。maxResults > 10 时用 POST form (s=10/20/30/40) 翻页拼到 maxResults
//   （必须用 POST，DDG 不响应 ?s= GET 参数）
// ========================
async function browserSearchDDG(query, maxResults = 15) {
  let browser;
  try {
    browser = await launchBrowser();
  } catch (e) {
    return { error: `浏览器启动失败: ${e.message}`, results: [] };
  }

  const cap = Math.min(maxResults, 40); // ACMS 单网站上限 40 条
  const pagesNeeded = Math.ceil(cap / 10);
  const collected = [];
  const seenUrl = new Set();
  const collectOne = (item) => {
    const uKey = (item.url || '').split('?')[0].split('#')[0];
    if (!item.title || !uKey) return false;
    if (seenUrl.has(uKey)) return false;
    seenUrl.add(uKey);
    collected.push(item);
    return true;
  };

  // 解析结果 + 收集 Next form 数据（DDG 翻页关键）
  // 用 Node 端定义函数直接传给 evaluate（避免 string 模板跨 context 序列化风险）
  const PARSE_FN = function parseDDGPage() {
    const containers = document.querySelectorAll('.result, .web-result');
    const out = [];
    for (const it of containers) {
      if (it.classList.contains('result--ad')) continue;
      if (it.closest('[class*="ad"], .ads-wrapper, .js-sidebar-ads')) continue;
      const a = it.querySelector('a.result__a, a.result__title, h2.result__title a');
      if (!a) continue;
      let targetUrl = a.getAttribute('href') || '';
      try {
        const u = new URL(targetUrl, location.href);
        const uddg = u.searchParams.get('uddg');
        if (uddg) targetUrl = uddg;
      } catch {}
      const title = (a.textContent || '').trim();
      const snip = it.querySelector('.result__snippet');
      const snippet = snip ? (snip.textContent || '').trim() : '';
      if (!title || !targetUrl || targetUrl === '/html/' || targetUrl.startsWith('/html?')) continue;
      out.push({ title, url: targetUrl, snippet });
    }
    const forms = document.querySelectorAll('form[method="post"][action="/html/"]');
    const nexts = [];
    for (const f of forms) {
      const sInp = f.querySelector('input[name="s"]');
      if (!sInp) continue;
      const data = {};
      for (const inp of f.querySelectorAll('input')) {
        if (inp.name) data[inp.name] = inp.value || '';
      }
      nexts.push({ s: sInp.value, data });
    }
    return { results: out, nexts };
  };

  // 用一个 page 跑全部（page reuse），其他 page 关闭
  let page = null;
  try {
    page = await browser.newPage();
    await page.setDefaultNavigationTimeout(20000);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7' });

    // ====== Page 1: GET ======
    const url1 = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    await page.goto(url1, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1200));

    const p1 = await page.evaluate(PARSE_FN);
    let nexts = p1.nexts || [];
    let targetS = '0';
    for (const item of p1.results || []) {
      collectOne(item);
      if (collected.length >= cap) break;
    }
    console.log(`[web-search] DDG page 1/GET: +${p1.results?.length || 0} raw, ${collected.length}/${cap} collected, nexts=${nexts.map(n => n.s).join(',')}`);

    // ====== Page 2-5: POST 表单翻页 ======
    const PARSE_POST_FN = async function fetchAndParseNext(formData) {
      try {
        const res = await fetch('/html/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
          body: new URLSearchParams(formData).toString(),
        });
        if (!res.ok) return { results: [], nexts: [] };
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const containers = doc.querySelectorAll('.result, .web-result');
        const BASE = 'https://html.duckduckgo.com/html/';
        const out = [];
        for (const it of containers) {
          if (it.classList.contains('result--ad')) continue;
          if (it.closest('[class*="ad"], .ads-wrapper, .js-sidebar-ads')) continue;
          const a = it.querySelector('a.result__a, a.result__title, h2.result__title a');
          if (!a) continue;
          let targetUrl = a.getAttribute('href') || '';
          // PAGE 2 DOMParser 没 window.location, 必须显式 base
          try {
            const u = new URL(targetUrl, BASE);
            const uddg = u.searchParams.get('uddg');
            if (uddg) targetUrl = uddg;
          } catch {}
          const title = (a.textContent || '').trim();
          const snip = it.querySelector('.result__snippet');
          const snippet = snip ? (snip.textContent || '').trim() : '';
          if (!title || !targetUrl || targetUrl === '/html/' || targetUrl.startsWith('/html?')) continue;
          out.push({ title, url: targetUrl, snippet });
        }
        // 抓下一页 next form（DDG 不严格按 s=10/20/30 链式，可能跳 s=25/40/50）
        const nextForms = doc.querySelectorAll('form[method="post"][action="/html/"]');
        const nexts = [];
        for (const f of nextForms) {
          const sInp = f.querySelector('input[name="s"]');
          if (!sInp) continue;
          const data = {};
          for (const inp of f.querySelectorAll('input')) {
            if (inp.name) data[inp.name] = inp.value || '';
          }
          nexts.push({ s: sInp.value, data });
        }
        return { results: out, nexts };
      } catch (e) {
        return { results: [], nexts: [] };
      }
    };

    // DDG next form chain 是非线性的：s=10→25→?，不是等差 s=10/20/30。
    // 用 nexts[0]（DDG 自己的 next 链第一个）持续往后翻。
    for (let i = 1; i < pagesNeeded && collected.length < cap; i++) {
      if (nexts.length === 0) {
        console.log(`[web-search] DDG: 已无 next form，停在 ${collected.length} 条`);
        break;
      }
      // 过滤掉 s='0'（回首页）和已知 cursor（避免死循环）
      const forwardNexts = nexts.filter((n) => n.s !== '0' && parseInt(n.s, 10) > parseInt(targetS || '0', 10));
      const f = forwardNexts[0] || nexts[0];
      targetS = f.s;
      const r = await page.evaluate(PARSE_POST_FN, f.data);
      const pResults = r.results || [];
      if (r.nexts && r.nexts.length > 0) {
        nexts = r.nexts;
      } else {
        nexts = [];
      }
      for (const item of pResults) {
        collectOne(item);
        if (collected.length >= cap) break;
      }
      console.log(`[web-search] DDG page ${i + 1}/POST s=${f.s}: +${pResults.length} raw, ${collected.length}/${cap} collected, nexts now=${nexts.map(n => n.s).join(',')}`);
    }
  } catch (e) {
    console.warn(`[web-search] DDG 整体异常: ${e.message?.slice(0, 100)}`);
  } finally {
    if (page) try { await page.close(); } catch {}
  }

  if (collected.length === 0) return { error: 'DDG 多页均未返回结果', results: [] };
  return { results: collected.slice(0, cap) };
}

// ========================
// 模式 B-2：浏览器 Puppeteer 抓 baidu.com (v0.49 中文 query 备选)
//   实测：200/2s/FIFA 命中，作为中文检索兜底
// ========================
async function browserSearchBaidu(query, maxResults = 15) {
  let browser;
  try {
    browser = await launchBrowser();
  } catch (e) {
    return { error: `浏览器启动失败: ${e.message}`, results: [] };
  }
  let page = null;
  try {
    page = await browser.newPage();
    await page.setDefaultNavigationTimeout(30000);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9' });

    const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2500));

    const results = await page.evaluate((max) => {
      // 删 AD 区（百度 AD 区固定 class）
      const adSelectors = [
        '[class*="ec_"], [class*="channel_lit"], [class*="result-op"]',
        '[class*="c-tools"], [class*="c-row"]',
        '.c-container[c-row]', '.c-container[cmcc-icon]',
      ];
      document.querySelectorAll(adSelectors.join(',')).forEach(el => el.remove());

      const titleBanRe = /(看看元宝|抢购|限时|钜惠|特惠|landing-?page|redirect-?page|推广链接|^推广$|^赞助$|^广告$)/i;
      const urlBanRe = /(landing-?page|tridChannel|html5\.qq\.com\/landingpage|tencent\.com\/evt\/dl|yuanbao\.tencent\.com)/i;
      const isBadResult = (title, url) =>
        !title ||
        title.length < 4 ||
        titleBanRe.test(title) ||
        urlBanRe.test(url) ||
        url.includes('baidu.com/link?') ||
        url.includes('baidu.com/sf/');

      const items = [];
      const seen = new Set();

      // 百度新结构（2024-2026）：每个结果是 .result 或 .c-container 不带 ads class
      const blocks = document.querySelectorAll('.result, .c-container:not([class*="ads"]):not([class*="ad-"])');
      for (const block of blocks) {
        if (items.length >= max) break;
        const link = block.querySelector('h3 a[href^="http"], a[href^="http"]');
        if (!link) continue;
        const rawUrl = link.href;
        const title = (link.textContent || '').trim();
        if (isBadResult(title, rawUrl)) continue;
        if (seen.has(rawUrl)) continue;
        seen.add(rawUrl);
        // 摘要：通常在 .c-abstract / .content-right_8
        const snipEl = block.querySelector('.c-abstract, .content-right_8, .c-font-normal');
        const snip = snipEl ? (snipEl.textContent || '').trim() : '';
        items.push({ title: title.slice(0, 200), url: rawUrl, snippet: snip.slice(0, 300) });
      }
      // 兜底：h3 > a
      if (items.length < max) {
        const h3Links = document.querySelectorAll('h3 a[href^="http"]');
        for (const a of h3Links) {
          if (items.length >= max) break;
          const rawUrl = a.href;
          const title = (a.textContent || '').trim();
          if (isBadResult(title, rawUrl)) continue;
          if (seen.has(rawUrl)) continue;
          seen.add(rawUrl);
          items.push({ title: title.slice(0, 200), url: rawUrl, snippet: '' });
        }
      }
      return items;
    }, maxResults);

    return { results };
  } catch (e) {
    return { error: `浏览器 Baidu 搜索失败: ${e.message}`, results: [] };
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}

/**
 * 百度图片搜索 — 返回直接图片 URL 列表
 */
async function browserSearchBaiduImage(query, maxResults = 9) {
  let browser;
  try {
    browser = await launchBrowser();
  } catch (e) {
    return { error: `浏览器启动失败: ${e.message}`, images: [] };
  }
  let page = null;
  try {
    page = await browser.newPage();
    await page.setDefaultNavigationTimeout(30000);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9' });

    const url = `https://image.baidu.com/search/index?tn=baiduimage&word=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    // 等 JS 加载 + 首屏图片渲染
    await new Promise(resolve => setTimeout(resolve, 4000));

    const images = await page.evaluate((max) => {
      const items = [];
      const seen = new Set();
      // 百度图片结构：img 标签用 data-objurl 存大图 URL，src 懒加载为空
      const imgElements = document.querySelectorAll('img[data-objurl]');
      for (const img of imgElements) {
        if (items.length >= max) break;
        const objUrl = img.getAttribute('data-objurl') || '';
        if (!objUrl || seen.has(objUrl)) continue;
        seen.add(objUrl);
        const thumb = img.getAttribute('data-th') || img.getAttribute('src') || objUrl;
        const title = img.alt || img.title || '';
        items.push({ thumb, url: objUrl, title: title.slice(0, 100) });
      }
      return items;
    }, maxResults);

    // 百度图片首屏只渲染约 8 张 data-objurl，滚动加载更多凑满 3x3 网格
    if (images.length < maxResults) {
      // 多次滚动加载更多
      for (var scrollAttempt = 0; scrollAttempt < 3 && images.length < maxResults; scrollAttempt++) {
        await page.evaluate(() => window.scrollBy(0, 600));
        await new Promise(resolve => setTimeout(resolve, 1500));
        var existingUrls = images.map(function(i) { return i.url; });
        var moreImages = await page.evaluate(function(max, existingUrls) {
          var items = [];
          document.querySelectorAll('img[data-objurl]').forEach(function(img) {
            if (items.length >= max) return;
            var objUrl = img.getAttribute('data-objurl') || '';
            if (!objUrl || existingUrls.indexOf(objUrl) >= 0) return;
            items.push({
              thumb: img.getAttribute('data-th') || img.getAttribute('src') || objUrl,
              url: objUrl,
              title: (img.alt || img.title || '').slice(0, 100),
            });
          });
          return items;
        }, maxResults - images.length, existingUrls);
        for (var mi = 0; mi < moreImages.length && images.length < maxResults; mi++) {
          images.push(moreImages[mi]);
        }
      }
    }

    console.log(`[web-search] Baidu 图片搜索: ${images.length} 张`);
    return { images, query };
  } catch (e) {
    return { error: `Baidu 图片搜索失败: ${e.message}`, images: [] };
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}

/**
 * DDG 图片搜索 — 备用方案，当百度失败时使用
 */
async function browserSearchDDGImage(query, maxResults = 9) {
  let browser;
  try {
    browser = await launchBrowser();
  } catch (e) {
    return { error: `浏览器启动失败: ${e.message}`, images: [] };
  }
  let page = null;
  try {
    page = await browser.newPage();
    await page.setDefaultNavigationTimeout(30000);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');

    // DDG 图片搜索 URL
    const url = `https://duckduckgo.com/?iax=images&ia=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const images = await page.evaluate((max) => {
      const items = [];
      const seen = new Set();
      // DDG 图片结果在 a.vqd-4x 链接中，src 在 img 标签
      const links = document.querySelectorAll('a.vqd-4x, a.react-image');
      for (const a of links) {
        if (items.length >= max) break;
        const img = a.querySelector('img');
        if (!img) continue;
        const src = img.src || img.getAttribute('data-src') || '';
        if (!src || seen.has(src)) continue;
        seen.add(src);
        // 尝试获取原始尺寸图片
        const origUrl = a.href || src;
        items.push({ thumb: src, url: origUrl, title: '' });
      }
      return items;
    }, maxResults);

    console.log(`[web-search] DDG 图片搜索: ${images.length} 张`);
    return { images, query };
  } catch (e) {
    return { error: `DDG 图片搜索失败: ${e.message}`, images: [] };
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}


/**
 * 头条搜索 — 无反爬，中文搜索质量好
 */
async function browserSearchToutiao(query, maxResults = 15) {
  let browser;
  try {
    browser = await launchBrowser();
  } catch (e) {
    return { error: `浏览器启动失败: ${e.message}`, results: [] };
  }
  let page = null;
  try {
    page = await browser.newPage();
    await page.setDefaultNavigationTimeout(30000);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9' });

    const url = 'https://www.toutiao.com/search/?keyword=' + encodeURIComponent(query);
    // v0.84: networkidle0 → domcontentloaded（头条 JS 多，等网络空闲要 ~10s，
    //   搜索结果 DOM 在 domcontentloaded 已可用，race 场景下省 5-8s）
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 1500));

    const results = await page.evaluate((max) => {
      const items = [];
      const seen = new Set();
      document.querySelectorAll('a[href*="sou.toutiao.com/search/jump"]').forEach(a => {
        if (items.length >= max) return;
        const title = (a.textContent || '').trim();
        const url = a.href;
        if (title.length < 6 || seen.has(url)) return;
        seen.add(url);
        items.push({ title: title.slice(0, 200), url, snippet: '' });
      });
      return items;
    }, maxResults);

    console.log('[web-search] Toutiao 浏览器搜索: ' + results.length + ' 条');
    return { results };
  } catch (e) {
    return { error: 'Toutiao 搜索失败: ' + e.message, results: [] };
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}


module.exports = {
  searchWeb,
  parallelMergeSearch,
  browserSearchToutiao,
  browserSearchBingCn,
  browserSearchBaidu,
  browserSearchBaiduImage,
  browserSearchDDGImage,
  browserSearchDDG,
  filterByRelevance,
  // v0.83
  isVagueNewsQuery,
  fetchToutiaoHotBoard,
};
