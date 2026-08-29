// ACMS GEO 引用源分类器（v0.16 — 移植自 elmohq/elmo domain-categories.ts，MIT）
// 用途：把 AI 回答中的引用 URL 归一化 + 分类（来源类型 × 页面类型）+ rollup 聚合
// 路径：server/services/geo-citation-classifier.js
//
// 借鉴 elmo 的成熟体系（MIT 许可）：
//   - normalizeUrl：去 tracking 参数 / 去 www / 强制 https / 去尾斜杠 → 同一页面折叠
//   - 来源分类 CitationCategory：brand/editorial/reviews/social/forum/ecommerce/reference/institutional/other
//   - 页面类型 CitationPageType：homepage/article/listicle/comparison/review/howto/forum/video/doc/product/info/other
//   - rollup：URL 级折叠计数 → 域名级（取最高频 URL 的分类）→ 分类 tally

// === URL 归一化 ===
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    // 去 Google 追踪参数
    if (u.searchParams.get('utm_source') === 'openai') u.searchParams.delete('utm_source');
    u.search = u.searchParams.toString();
    u.hash = u.hash.replace(/:~:text=[^&]*/, '');
    if (u.hash === '#') u.hash = '';
    u.protocol = 'https:';
    u.hostname = u.hostname.replace(/^www\./, '').toLowerCase();
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch (_) {
    return url;
  }
}

function extractDomain(urlOrDomain) {
  try {
    const u = new URL(urlOrDomain);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch (_) {
    return String(urlOrDomain).replace(/^www\./, '').split('/')[0].toLowerCase();
  }
}

// === 来源分类 ===
const CATEGORY_LABELS = {
  brand: '自有站', editorial: '媒体', reviews: '评测', social: '社交',
  forum: '论坛', ecommerce: '电商', reference: '百科/文档', institutional: '机构', other: '其他',
};

// 论坛域名（elmo FORUM_DOMAINS 精选 + 中文站）
const FORUM_DOMAINS = new Set([
  'zhihu.com', 'news.ycombinator.com', 'reddit.com', 'quora.com', 'douban.com',
  'v2ex.com', 'bbs.hupu.com', 'tieba.baidu.com', '36kr.com', 'sspai.com',
  'resetera.com', 'neogaf.com', 'mumsnet.com', 'bogleheads.org', 'linustechtips.com',
  'head-fi.org', 'twoplustwo.com', 'flyertalk.com', 'xda-developers.com',
]);

function isForumDomain(host) {
  let d = String(host || '').replace(/^www\./, '').toLowerCase();
  if (/^(forums?|community|discuss|boards?|bbs|forum)\./.test(d)) return true;
  const parts = d.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    if (FORUM_DOMAINS.has(parts.slice(i).join('.'))) return true;
  }
  return FORUM_DOMAINS.has(d);
}

// 媒体/评测/电商/社交/参考/机构域名信号（通用正则，避免枚举所有站）
const SOCIAL_HOST_RE = /(^|\.)(twitter\.com|x\.com|facebook\.com|instagram\.com|linkedin\.com|youtube\.com|tiktok\.com|weibo\.com|xiaohongshu\.com|bilibili\.com|threads\.net|mastodon\.[a-z.]+)$/;
const ECOMMERCE_HOST_RE = /(^|\.)(amazon\.[a-z.]+|jd\.com|taobao\.com|tmall\.com|pinduoduo\.com|aliexpress\.com|ebay\.[a-z.]+|shopify\.com|bestbuy\.com)$/;
const REFERENCE_HOST_RE = /(^|\.)(wikipedia\.org|zh\.wikipedia\.org|baike\.baidu\.com|wikihow\.com|github\.com|stackoverflow\.com|mdn\.web\.docs|developer\.mozilla\.org|npmjs\.com|pypi\.org)$/;
const INSTITUTIONAL_HOST_RE = /(^|\.)(gov\.|edu\.|org\.|ac\.|university|stanford\.edu|mit\.edu|harvard\.edu|ox\.ac\.uk|who\.int|un\.org|github\.io)$/;
const REVIEW_HOST_RE = /(^|\.)(trustpilot\.com|g2\.com|gartner\.com|forrester\.com|crunchbase\.com|producthunt\.com|alternative\.to|quora\.com|glassdoor\.com|yelp\.com|dianping\.com|zhihu\.com)$/;
const EDITORIAL_HOST_RE = /(^|\.)(medium\.com|techcrunch\.com|theverge\.com|wired\.com|forbes\.com|bloomberg\.com|reuters\.com|ft\.com|wsj\.com|cnbc\.com|36kr\.com|ifeng\.com|sina\.com\.cn|sohu\.com|netease\.com|qq\.com|163\.com|huxiu\.com|geekpark\.net|ithome\.com|pingwest\.com)$/;

// 来源分类（域名级启发式；自有品牌站由调用方传入 brandDomains 判定）
function classifyDomain(domain, brandDomains = []) {
  const d = String(domain || '').toLowerCase();
  if (!d) return 'other';
  if (brandDomains.includes(d)) return 'brand';
  if (isForumDomain(d)) return 'forum';
  if (SOCIAL_HOST_RE.test(d)) return 'social';
  if (REVIEW_HOST_RE.test(d)) return 'reviews';
  if (ECOMMERCE_HOST_RE.test(d)) return 'ecommerce';
  if (REFERENCE_HOST_RE.test(d)) return 'reference';
  if (INSTITUTIONAL_HOST_RE.test(d)) return 'institutional';
  if (EDITORIAL_HOST_RE.test(d)) return 'editorial';
  return 'other';
}

// === 页面类型 ===
const PAGE_TYPE_LABELS = {
  homepage: '首页', article: '文章', listicle: '榜单', comparison: '对比',
  review: '评测', howto: '教程', forum: '论坛', video: '视频', doc: '文档',
  product: '产品页', info: '信息页', other: '其他',
};

function inferPageType(url, title) {
  let parsed;
  try { parsed = new URL(url); } catch (_) { return 'other'; }
  const path = parsed.pathname.toLowerCase();
  if (path === '/' || path === '') return 'homepage';
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const lowerTitle = String(title || '').toLowerCase();
  const haystack = path + ' ' + lowerTitle;

  if (/(^|\.)(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|tiktok\.com|bilibili\.com)$/.test(host) || /\/(watch|shorts|embed|videos?|video)(\/|$|\?)/.test(path)) return 'video';
  if (isForumDomain(host) || /\/(comments|forums?|threads?|viewtopic|discussion)(\/|$)/.test(path) || /\/r\//.test(path)) return 'forum';
  if (/\/(docs?|documentation|developers?|api|sdk|reference|wiki|kb|help|support)(\/|$)/.test(path)) return 'doc';
  if (/\breview(s|ed)?\b/.test(haystack)) return 'review';
  if (/\b(vs\.?|versus|alternatives?|comparison)\b/.test(haystack) || /\/(compare|comparison|vs|alternatives)(\/|$|-)/.test(path)) return 'comparison';
  if (/\b(\d+\s+best|best\s+\d+|top\s+\d+|best\s+[a-z])\b/.test(lowerTitle) || /^\s*(best|top)\b/.test(lowerTitle) || (/(^|\/)(best|top)-[a-z]/.test(path) && !/best-?sellers?|\/(products?|collections|shop|store|dp|gp|pdp|item|cart|buy)(\/|$|-)/.test(path))) return 'listicle';
  if (/\b(how to|how-to|guide|tutorial|step[- ]by[- ]step|getting started)\b/.test(haystack) || /\/(how-to|guides?|tutorials?)(\/|$)/.test(path)) return 'howto';
  if (/\/(products?|item|shop|store|collections|buy|cart|pricing|plans?|dp|pdp)(\/|$)/.test(path)) return 'product';
  if (/\/(about|about-us|faq|faqs|contact|privacy|terms|policy|legal|careers?|press|locations?)(\/|$|-)/.test(path)) return 'info';
  if (/\/(blog|news|articles?|story|posts?|magazine|insights?|resources?)(\/|$|-)/.test(path) || /\/(\d{4})\/(\d{2}|[a-z])/.test(path)) return 'article';
  return 'other';
}

// === Rollup（URL 级 → 域名级 → tally）===
function extractUrlsFromResponse(resp) {
  const urls = [];
  const cit = resp.citations || [];
  cit.forEach(c => {
    if (!c) return;
    if (typeof c === 'string') urls.push(c);
    else if (typeof c === 'object') {
      const u = c.url || c.link || c.href || c.uri;
      if (u) urls.push(u);
    }
  });
  const m = (resp.raw_answer || '').match(/https?:\/\/[^\s"'<>)\]},]+/g);
  if (m) urls.push(...m);
  return urls;
}

/**
 * rollup：把 responses 数组折叠成 URL 级 + 域名级 + 分类 tally
 * @param {Array} responses - geo_responses 数组（含 citations/raw_answer/ts/engine）
 * @param {Array} brandDomains - 自有品牌域名列表（判定 brand 类）
 */
function rollupCitations(responses, brandDomains = []) {
  // URL 级折叠
  const folded = new Map(); // normalized -> {count, title, domain, engines:Set, positions:[]}
  const bd = brandDomains.map(d => extractDomain(d));

  responses.forEach(resp => {
    if (resp.error) return;
    const urls = extractUrlsFromResponse(resp);
    urls.forEach(u => {
      const norm = normalizeUrl(u);
      if (!norm || !/^https?:/.test(norm)) return;
      const domain = extractDomain(norm);
      const existing = folded.get(norm);
      if (existing) {
        existing.count++;
        if (resp.engine) existing.engines.add(resp.engine);
      } else {
        folded.set(norm, {
          url: norm,
          domain,
          count: 1,
          title: resp.citation_titles && resp.citation_titles[0] || null,
          engines: new Set(resp.engine ? [resp.engine] : []),
        });
      }
    });
  });

  // URL 级输出 + 分类
  const urls = Array.from(folded.values()).map(u => ({
    url: u.url,
    domain: u.domain,
    title: u.title,
    count: u.count,
    engines: Array.from(u.engines),
    category: classifyDomain(u.domain, bd),
    pageType: inferPageType(u.url, u.title),
  })).sort((a, b) => b.count - a.count);

  // 域名级（取最高频 URL 的分类）
  const byDomain = new Map();
  for (const u of urls) {
    const cur = byDomain.get(u.domain);
    if (!cur) byDomain.set(u.domain, { domain: u.domain, count: u.count, category: u.category, exampleTitle: u.title, topCount: u.count });
    else {
      cur.count += u.count;
      if (u.count > cur.topCount) { cur.topCount = u.count; cur.category = u.category; cur.exampleTitle = u.title; }
    }
  }
  const domains = Array.from(byDomain.values()).map(({ topCount, ...rest }) => rest).sort((a, b) => b.count - a.count);

  // tally
  const categoryCounts = {};
  const pageTypeCounts = {};
  let total = 0;
  for (const u of urls) {
    categoryCounts[u.category] = (categoryCounts[u.category] || 0) + u.count;
    pageTypeCounts[u.pageType] = (pageTypeCounts[u.pageType] || 0) + u.count;
    total += u.count;
  }

  return {
    ok: true,
    total_citations: total,
    total_urls: urls.length,
    total_domains: domains.length,
    urls: urls.slice(0, 50),
    domains: domains.slice(0, 30),
    category_tally: categoryCounts,
    page_type_tally: pageTypeCounts,
    category_labels: CATEGORY_LABELS,
    page_type_labels: PAGE_TYPE_LABELS,
  };
}

module.exports = {
  normalizeUrl,
  extractDomain,
  classifyDomain,
  inferPageType,
  extractUrlsFromResponse,
  rollupCitations,
  CATEGORY_LABELS,
  PAGE_TYPE_LABELS,
};
