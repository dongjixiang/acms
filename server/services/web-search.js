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

const SEARCH_TIMEOUT_MS = 10000;
const MAX_RESULTS = 20;

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
  return u.replace(/[\)\]）】」』.,;:!?。，；：！？]+$/, '');
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

  // 都没有强匹配 (说明 query 失配/搜索引擎烂), fallback 原结果
  return results;
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

  const apiKey = getBingApiKey();
  const maxResults = Math.min(options.maxResults || MAX_RESULTS, 20);
  const encodedQuery = encodeURIComponent(query.trim());

  try {
    if (apiKey) {
      // 模式 A：Bing Web Search API（需 Key）
      console.log('[web-search] 使用 Bing API 搜索');
      const data = await fetchBingApi(apiKey, encodedQuery, maxResults);
      const results = parseBingApiResults(data, maxResults);
      if (results.length > 0) return { results };
    }

    // 模式 B：浏览器 Puppeteer 搜索（v0.49 重排 + v0.50 提级 Baidu 为主路径）
    //   优先级: baidu.com (中文主路径, 多多实测确认精准) → cn.bing.com (兜底+英文 query) → sogou (兜底,带 quality gate)
    //   v0.50 调整原因: 之前 cn.bing 放前面是基于"快速"，但实测质量差 (ACMS puppeteer 拿的是"裸 SEO"，真浏览器才有体育 UI)
    //   ACMS puppeteer 抓的内容和真浏览器不一样，所以选 baidu 当主路径 (它中文 SEO 质量好+返回纯链接/标题/摘要)
    //   DDG/Brave/Wikipedia/ESPN 被 GFW 屏蔽(实测 5022ms 超时) — 跳过
    try {
      console.log('[web-search] 浏览器 Baidu 搜索: ' + query);
      const r = await browserSearchBaidu(query, maxResults);
      if (!r.error && r.results?.length > 0) {
        console.log(`[web-search] Baidu 浏览器搜索: ${r.results.length} 条`);
        // v0.50: 立即按 query 关键词相关性过滤（治"宽泛 query 拿到 8 条噪声 7 条"症状）
        const filtered = filterByRelevance(r.results, query);
        if (filtered.length > 0) {
          console.log(`[web-search] Baidu 相关性过滤: ${r.results.length} → ${filtered.length} 条`);
          return { results: filtered };
        }
        console.warn('[web-search] Baidu 相关性过滤后为空, 兜底所有结果');
        return { results: r.results };
      }
      console.warn(`[web-search] Baidu 无结果或失败: ${r.error || 'empty'}`);
    } catch (e) {
      console.warn('[web-search] Baidu 抛错:', e.message);
    }
    try {
      console.log('[web-search] 浏览器 BingCN 搜索: ' + query);
      const r = await browserSearchBingCn(query, maxResults);
      if (!r.error && r.results?.length > 0) {
        console.log(`[web-search] BingCN 浏览器搜索: ${r.results.length} 条`);
        // v0.50: 同样做相关性过滤
        const filtered = filterByRelevance(r.results, query);
        if (filtered.length > 0) return { results: filtered };
        return { results: r.results };
      }
      console.warn(`[web-search] BingCN 无结果或失败: ${r.error || 'empty'}`);
    } catch (e) {
      console.warn('[web-search] BingCN 抛错:', e.message);
    }

    // 模式 C：搜狗兜底（带 v0.49 quality gate，过滤元宝/抢购等 AD/竞价链接）
    console.log('[web-search] 浏览器 Sogou 兜底搜索: ' + query);
    const browserResults = await browserSearch(query, maxResults);
    if (!browserResults.error && browserResults.results?.length > 0) {
      // sogou 自带 quality gate（title/url 黑名单），不过滤更严
      console.log(`[web-search] Sogou 浏览器搜索: ${browserResults.results.length} 条`);
      return { results: browserResults.results };
    }

    // 模式 D：搜狗 HTML 解析（再降级，无浏览器）
    console.log('[web-search] 浏览器搜索失败，尝试搜狗 HTML 解析');
    const html = await fetchSogou(encodedQuery);
    let results = parseSogouResults(html, maxResults);
    if (results.length > 0) return { results };

    // 模式 D：Bing 网页版 HTML 解析（最终降级）
    console.log('[web-search] 搜狗无结果，尝试 Bing 网页版');
    const bingHtml = await fetchBingHtml(encodedQuery);
    results = parseBingHtmlResults(bingHtml, maxResults);
    if (results.length > 0) return { results };

    return { error: '未找到相关结果', results: [] };
  } catch (e) {
    return { error: `搜索失败: ${e.message}`, results: [] };
  }
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
async function browserSearchBingCn(query, maxResults = 8) {
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
// 模式 B-2：浏览器 Puppeteer 抓 baidu.com (v0.49 中文 query 备选)
//   实测：200/2s/FIFA 命中，作为中文检索兜底
// ========================
async function browserSearchBaidu(query, maxResults = 8) {
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

module.exports = { searchWeb, browserSearchBingCn, browserSearchBaidu, filterByRelevance };
