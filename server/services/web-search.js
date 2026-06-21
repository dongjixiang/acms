// ACMS 网页搜索服务（v0.15，2026-06-21）
// 通过 DuckDuckGo HTML Search 免费查询，无需 API Key
// 解析返回的 HTML 提取搜索结果（标题 + 摘要 + URL）
//
// 为什么用 DuckDuckGo：
//   - 免费，无 API Key 要求
//   - 不记录用户 IP，隐私友好
//   - 返回结果结构稳定（HTML 表格布局）
//   - 国内可访问（无需翻墙）
//
// 备选（需 API Key）：
//   - Bing Web Search API（Azure，1000次/月免费）
//   - SerpAPI（100次/月免费）
//   - Google Programmable Search（10000次/天免费）

const cheerio = require('cheerio');
const https = require('https');

const SEARCH_TIMEOUT_MS = 15000;
const MAX_RESULTS = 8;  // 默认返回前 8 条结果

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

  const maxResults = options.maxResults || MAX_RESULTS;
  const encodedQuery = encodeURIComponent(query.trim());

  try {
    const html = await fetchDuckDuckGo(encodedQuery);
    if (!html) return { error: '搜索无返回', results: [] };

    // 解析 HTML 提取搜索结果
    const results = parseDuckDuckGoResults(html, maxResults);

    if (results.length === 0) {
      // 检测是否被反爬拦截
      if (html.includes('captcha') || html.includes('安全验证') || html.includes('challenge')) {
        return { error: '搜索被反爬拦截，请稍后重试', results: [] };
      }
      return { error: '未找到相关结果', results: [] };
    }

    return { results };
  } catch (e) {
    return { error: `搜索失败: ${e.message}`, results: [] };
  }
}

/**
 * 通过 DuckDuckGo Lite 搜索（无 JS 版本，返回纯 HTML）
 * URL: https://lite.duckduckgo.com/lite/?q=xxx
 */
function fetchDuckDuckGo(encodedQuery) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      req.destroy();
      reject(new Error('搜索超时'));
    }, SEARCH_TIMEOUT_MS);

    const req = https.get(
      `https://lite.duckduckgo.com/lite/?q=${encodedQuery}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        timeout: SEARCH_TIMEOUT_MS,
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          clearTimeout(timeout);
          resolve(data);
        });
      }
    );

    req.on('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });
  });
}

/**
 * 解析 DuckDuckGo Lite 的 HTML 搜索结果
 * HTML 结构：一个表格，搜索结果在 id="links" 的 div 内
 * 每个结果：一个 div 包含标题链接、摘要文本
 */
function parseDuckDuckGoResults(html, maxResults) {
  const $ = cheerio.load(html);
  const results = [];

  // DuckDuckGo Lite 搜索结果是表格布局：
  // 搜索结果行包含 class="result" 或直接是 <a> 标签 + 文本
  // 解析方法：找所有链接（#links 内的 a）
  const seenUrls = new Set();

  // 方法1：找 #links 区域内的所有链接
  $('#links a').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    const title = $el.text().trim();
    if (!href || !title || seenUrls.has(href)) return;
    seenUrls.add(href);

    // 摘要：链接后面的文本（DDG lite 结构）
    const snippet = $el.parent().next('small, span, div').text().trim()
      || $el.closest('tr').find('td').last().text().trim()
      || '';

    results.push({
      title: title.slice(0, 200),
      url: href,
      snippet: snippet.slice(0, 300),
    });
  });

  // 方法2：如果方法1没取到，退回到解析通用的 <a> 标签
  if (results.length === 0) {
    $('a[href^="http"]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      const title = $el.text().trim();
      if (!href || !title || seenUrls.has(href)) return;
      if (href.includes('duckduckgo.com')) return; // 跳过DDG内部链接
      seenUrls.add(href);

      const snippet = $el.closest('div, td').find('p, span, div').not($el).first().text().trim().slice(0, 300);
      results.push({
        title: title.slice(0, 200),
        url: href,
        snippet: snippet || '',
      });
    });
  }

  return results.slice(0, maxResults);
}

module.exports = { searchWeb };
