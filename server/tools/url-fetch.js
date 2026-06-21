// ACMS 内建工具 — fetch_url（v0.14，2026-06-21）
// 抓取外部 URL 网页内容，提取正文转 markdown。
//
// 集成模式（acms-tool-call 模式 B「预搜注入」）：
//   - server 端 chat-fetch.js 检测到 URL → 内部调 toolRegistry.execute('fetch_url')
//   - 抓取结果作为 system message 注入 chat 流 → 触发 brief 重生
//   - 未来 AI 自主调（用户说「再读个链接」）走模式 A 纯 tool_calls
//
// 安全：
//   - url-safety.js SSRF check（拒绝 localhost/内网 IP）
//   - 30s timeout
//   - User-Agent 标识
//   - 失败返回 {error: msg}（handler 不抛错，让 LLM 看到错误）
//
// 解析：
//   - cheerio 解析 HTML（~150KB，比 @extractus/article-extractor 链 3MB 轻 8x）
//   - 自写 Readability 简化版启发式提取正文（基于 Mozilla Readability 思想）
//   - 截断 5000 字 + 标注 truncated 字段
//
// 缓存：暂不实现（v0.14 简单版），24h 重复 URL 抓取可在 v0.15 加

const cheerio = require('cheerio');
const { checkUrlSafety } = require('../services/url-safety');

const FETCH_TIMEOUT_MS = 30000;
const MAX_LENGTH_DEFAULT = 5000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;  // 24h
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// v0.14：24h 内存缓存（key: url，value: {result, expiresAt}）
// 重复 URL 不重新抓（省 LLM token + 提速）
const fetchCache = new Map();

function getCached(url) {
  const entry = fetchCache.get(url);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    fetchCache.delete(url);
    return null;
  }
  return entry.result;
}

function setCached(url, result) {
  fetchCache.set(url, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  // 简单 LRU 清理：>500 条时清最旧一半
  if (fetchCache.size > 500) {
    const entries = Array.from(fetchCache.entries());
    entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (let i = 0; i < 250; i++) fetchCache.delete(entries[i][0]);
  }
  return result;
}

// 导出供测试 + url-promote 端点复用
function clearCache() { fetchCache.clear(); }
function cacheSize() { return fetchCache.size; };

// Readability 简化版启发式 — 找正文容器
function findMainContent($) {
  // 1. 优先 <article> / <main> / [role="main"]
  const candidates = [];
  $('article, main, [role="main"]').each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 200) candidates.push({ el, score: text.length, source: 'semantic' });
  });

  // 2. 找包含最多 <p> 文字的 div（Readability 思想）
  $('div, section').each((_, el) => {
    const $el = $(el);
    const paragraphs = $el.find('p').length;
    const text = $el.text().trim();
    // 启发式：<p> 数量 × 100 + 文本长度 / 100 = score
    if (paragraphs >= 3) {
      const score = paragraphs * 100 + Math.min(text.length / 100, 500);
      candidates.push({ el, score, source: 'paragraphs' });
    }
  });

  if (candidates.length === 0) return null;

  // 取 score 最高的
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].el;
}

function htmlToMarkdown($, container) {
  const $c = $(container);
  // 移除噪音元素
  $c.find('script, style, nav, header, footer, aside, iframe, noscript, .ad, .ads, .advertisement, .sidebar, .menu, .navigation, .comment, .social, .share').remove();

  const lines = [];
  $c.find('h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, code').each((_, el) => {
    const $el = $(el);
    const tag = el.tagName.toLowerCase();
    const text = $el.text().trim().replace(/\s+/g, ' ');
    if (!text) return;

    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
      const level = parseInt(tag[1]);
      lines.push('\n' + '#'.repeat(level) + ' ' + text + '\n');
    } else if (tag === 'p') {
      lines.push('\n' + text + '\n');
    } else if (tag === 'li') {
      lines.push('- ' + text);
    } else if (tag === 'blockquote') {
      lines.push('\n> ' + text + '\n');
    } else if (tag === 'pre' || tag === 'code') {
      lines.push('\n```\n' + text + '\n```\n');
    }
  });

  const result = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // v0.14：结构化提取远小于纯文本时，fallback 到纯文本
  //   条件：结构化结果 < 500 字 且 纯文本是结构化结果的 3 倍以上
  //   兼容百度百科等非标准 HTML 结构（正文在 .content_btGmf / .text_FfyV6 内，
  //   不是标准 <p> / <li> 标签，但目录用 <li> 提取出 28 行 317 字）
  if (result.length < 500) {
    const plainText = $c.text().replace(/\s+/g, ' ').trim();
    if (plainText.length > result.length * 3) {
      return plainText;
    }
  }
  return result;
}

async function fetchUrlCore({ url, max_length = MAX_LENGTH_DEFAULT }) {
  if (!url || typeof url !== 'string') {
    return { error: 'url 参数必填' };
  }

  // v0.14：先查 24h 缓存（命中秒返，省 LLM token + 提速）
  const cached = getCached(url);
  if (cached) {
    return { ...cached, cached: true };
  }

  // 1. SSRF check
  const safety = await checkUrlSafety(url);
  if (!safety.safe) {
    return { error: `安全检查失败: ${safety.reason}` };
  }

  // 2. fetch
  let resp;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    resp = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://baike.baidu.com/',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (e) {
    if (e.name === 'AbortError') return { error: `抓取超时（>${FETCH_TIMEOUT_MS / 1000}s）` };
    return { error: `fetch 失败: ${e.message}` };
  }

  // 3. 获取 HTML 内容（fetch 成功 → 直接读；403 等失败 → fallback 到 curl）
  let html;
  if (!resp.ok) {
    // v0.14：失败 → fallback 到 curl（TLS 指纹绕过简单 WAF）
    const curlResp = await tryCurlFallback(url);
    if (curlResp && curlResp.ok) {
      html = curlResp.text;
    } else {
      // v0.14：curl 也失败（或被反爬验证拦截）→ fallback 到 puppeteer 浏览器
      const browserResp = await tryBrowserFallback(url);
      if (browserResp && browserResp.ok) {
        html = browserResp.text;
        // v0.14：browser fallback 的额外字段（截图 + 原始 HTML）传给外层
        resp = { ok: true, browserFallback: browserResp };
      } else {
        return { error: `HTTP ${resp.status} ${resp.statusText}` };
      }
    }
  } else {
    // 内容类型检查
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) {
      return { error: `不支持的内容类型: ${ct}` };
    }
    html = await resp.text();
  }
  const $ = cheerio.load(html, { decodeEntities: true });

  // 5. 提取 title
  const title = $('title').first().text().trim()
    || $('meta[property="og:title"]').attr('content')
    || $('meta[name="twitter:title"]').attr('content')
    || '';

  // 6. 提取正文
  const container = findMainContent($) || $('body').get(0);
  if (!container) return { error: '未找到正文容器' };
  const fullContent = htmlToMarkdown($, container);
  if (!fullContent) return { error: '正文提取为空' };

  // 7. 截断
  const truncated = fullContent.length > max_length;
  const content = truncated ? fullContent.slice(0, max_length) + '\n\n...[已截断，原文 ' + fullContent.length + ' 字符]' : fullContent;

  // v0.14：browser fallback 返回的额外字段（截图 + 原始 HTML）
  //   从 tryBrowserFallback 传递（仅当走了 browser 路径时才有）
  const extraScreenshot = resp?.browserFallback?.screenshot || null;
  const extraRawHtml = resp?.browserFallback?.rawHtml || null;

  const result = {
    url,
    finalUrl: resp?.url || url,
    title: title.slice(0, 200),
    content,
    length: fullContent.length,
    truncated,
    fetchedAt: new Date().toISOString(),
    screenshot: extraScreenshot,
    rawHtml: extraRawHtml,
  };

  // v0.14：写入 24h 缓存
  setCached(url, result);
  return { ...result, cached: false };
}


// v0.14：当 Node.js fetch 被 WAF/反爬拦截时（403/40x），fallback 到 curl
// curl 用不同 TLS 指纹和 HTTP/2 帧设置，能绕过部分 WAF
// 比 puppeteer 轻 1000 倍（3MB vs 100MB），curl 在 Windows/Linux/Mac 均内置
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// v0.14：当 curl fallback 也遇到反爬验证时（百度安全验证等需 JS 执行），fallback 到 puppeteer
let _browserFetchModule = null;

async function getBrowserFetch() {
  if (!_browserFetchModule) {
    try {
      _browserFetchModule = require('../services/browser-fetch');
    } catch (e) {
      return null;
    }
  }
  return _browserFetchModule;
}

async function tryBrowserFallback(url) {
  const bf = await getBrowserFetch();
  if (!bf) return null;
  try {
    const result = await bf.browserFetch(url);
    if (result.error) return null;
    if (!result.text || result.text.length < 50) return null;
    return { text: result.text, status: 200, ok: true, title: result.title, finalUrl: result.finalUrl, screenshot: result.screenshot, rawHtml: result.html, screenshotFormat: 'base64' };
  } catch (e) {
    return null;
  }
}

// 反爬页面关键词检测
const ANTI_CRAWL_KEYWORDS = [
  '安全验证', '百度安全验证', '请通过安全验证', '验证页面',
  'js', 'challenge', 'captcha', '人机验证',
];

async function tryCurlFallback(urlStr) {
  const timeout = FETCH_TIMEOUT_MS;
  const cmd = [
    'curl', '-s', '-L',
    '-H', 'User-Agent: ' + USER_AGENT,
    '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    '-H', 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
    '-H', 'Referer: https://baike.baidu.com/',
    '-m', Math.floor(timeout / 1000).toString(),
    escapeShellArg(urlStr),
  ].join(' ');
  try {
    const { stdout } = await execPromise(cmd, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: timeout + 5000,
    });
    if (!stdout || stdout.length < 50) return null;
    // v0.14：检测 curl 返回是否含反爬验证关键词（如百度安全验证）
    //   如是 → 返回 null，上层走 browser fallback（puppeteer 能执行 JS 通过验证）
    if (ANTI_CRAWL_KEYWORDS.some(kw => stdout.includes(kw))) return null;
    return { text: stdout, status: 200, ok: true };
  } catch (e) {
    return null;
  }
}

function escapeShellArg(s) {
  // Windows MSYS/cmd：用双引号 + 内部转义（双引号本身、反斜杠后缀）
  // JSON.stringify 生成 "..." 格式，内部特殊字符自动转义
  return JSON.stringify(s);
}

module.exports = { fetchUrlCore, getCached, setCached, clearCache, cacheSize };
