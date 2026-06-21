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
const { browserSearch } = require('./browser-fetch');

const SEARCH_TIMEOUT_MS = 10000;
const MAX_RESULTS = 8;

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

/**
 * 网页搜索
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

    // 模式 B：浏览器 Puppeteer 搜索（最稳，可执行 JS + 绕过反爬）
    console.log('[web-search] 使用 浏览器 搜索: ' + query);
    const browserResults = await browserSearch(query, maxResults);
    if (!browserResults.error && browserResults.results?.length > 0) {
      console.log(`[web-search] 浏览器搜索: ${browserResults.results.length} 条`);
      return { results: browserResults.results };
    }

    // 模式 C：搜狗 HTML 解析（降级）
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

module.exports = { searchWeb };
