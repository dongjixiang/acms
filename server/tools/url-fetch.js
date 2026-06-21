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
const USER_AGENT = 'ACMS-Bot/1.0 (+https://github.com/dongjixiang/acms)';

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

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function fetchUrlCore({ url, max_length = MAX_LENGTH_DEFAULT }) {
  if (!url || typeof url !== 'string') {
    return { error: 'url 参数必填' };
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
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (e) {
    if (e.name === 'AbortError') return { error: `抓取超时（>${FETCH_TIMEOUT_MS / 1000}s）` };
    return { error: `fetch 失败: ${e.message}` };
  }

  if (!resp.ok) {
    return { error: `HTTP ${resp.status} ${resp.statusText}` };
  }

  // 3. 内容类型检查
  const ct = resp.headers.get('content-type') || '';
  if (!ct.includes('text/html') && !ct.includes('application/xhtml')) {
    return { error: `不支持的内容类型: ${ct}` };
  }

  // 4. 解析 HTML
  const html = await resp.text();
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

  return {
    url,
    finalUrl: resp.url || url,
    title: title.slice(0, 200),
    content,
    length: fullContent.length,
    truncated,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { fetchUrlCore };
