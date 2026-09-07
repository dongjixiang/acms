// ACMS GEO Channel 投放形态映射表（v0.45）
// 参考 GEOVisibilityTool geo-channels 的 14 类硬编码
//
// 设计原则：
// 1. 硬编码主流平台的投放形态（避免 LLM 自由发挥）
// 2. 提供 registerChannelType() 扩展 API
// 3. 排除规则：搜索引擎/索引类/竞品官网不进 Top10 grid
//
// 用法：
//   const { getChannelConfig, isExcluded, CHANNEL_TYPES } = require('./geo-channel-mapping');
//   const cfg = getChannelConfig('zhihu.com'); // { type, contentForm, roiMultiplier }

// ===== 投放形态枚举 =====
const CHANNEL_TYPES = {
  MEDIA: 'MEDIA',           // 行业媒体 / 科技媒体
  QNA: 'QNA',               // 问答平台
  BLOG: 'BLOG',             // 技术博客
  VIDEO: 'VIDEO',           // 视频平台
  SOCIAL: 'SOCIAL',         // 社交平台
  FORUM: 'FORUM',           // 论坛 / 社区
  DEV: 'DEV',               // 开发者平台
  PROFESSIONAL: 'PROFESSIONAL', // 职业社交平台
  REVIEW: 'REVIEW',         // 点评 / 评测
  WIKI: 'WIKI',             // 百科
};

const CONTENT_FORMS = {
  'MEDIA': '行业稿 / 科技报道',
  'QNA': '深度回答 / 专栏文',
  'BLOG': '技术博客 / 教程',
  'VIDEO': '评测视频 / 教程',
  'SOCIAL': '种草笔记 / 话题',
  'FORUM': '论坛帖子 / 问答',
  'DEV': '技术文章 / 开源项目',
  'PROFESSIONAL': 'LinkedIn 文章 / 职场内容',
  'REVIEW': '产品评测 / 用户反馈',
  'WIKI': '百科条目 / 知识沉淀',
};

// ===== 平台映射表 =====
const CHANNEL_REGISTRY = {
  // 国内主流
  'zhihu.com': { type: CHANNEL_TYPES.QNA, priority: 1 },
  'juejin.cn': { type: CHANNEL_TYPES.BLOG, priority: 2 },
  'csdn.net': { type: CHANNEL_TYPES.BLOG, priority: 3 },
  'jianshu.com': { type: CHANNEL_TYPES.BLOG, priority: 4 },
  'bilibili.com': { type: CHANNEL_TYPES.VIDEO, priority: 5 },
  '36kr.com': { type: CHANNEL_TYPES.MEDIA, priority: 6 },
  'sohu.com': { type: CHANNEL_TYPES.MEDIA, priority: 7 },
  '163.com': { type: CHANNEL_TYPES.MEDIA, priority: 8 },
  'tieba.baidu.com': { type: CHANNEL_TYPES.FORUM, priority: 9 },
  'xiaohongshu.com': { type: CHANNEL_TYPES.SOCIAL, priority: 10 },
  'douyin.com': { type: CHANNEL_TYPES.VIDEO, priority: 11 },
  'weibo.com': { type: CHANNEL_TYPES.SOCIAL, priority: 12 },
  'oschina.net': { type: CHANNEL_TYPES.DEV, priority: 13 },
  'segmentfault.com': { type: CHANNEL_TYPES.DEV, priority: 14 },
  // 国际
  'reddit.com': { type: CHANNEL_TYPES.FORUM, priority: 15 },
  'medium.com': { type: CHANNEL_TYPES.BLOG, priority: 16 },
  'linkedin.com': { type: CHANNEL_TYPES.PROFESSIONAL, priority: 17 },
  'youtube.com': { type: CHANNEL_TYPES.VIDEO, priority: 18 },
  'quora.com': { type: CHANNEL_TYPES.QNA, priority: 19 },
};

// ===== 排除规则（对标 geo-channels 核心剔除） =====
const EXCLUDED_PATTERNS = [
  'google.com',           // 搜索引擎
  'baidu.com',            // 搜索引擎
  'bing.com',             // 搜索引擎
  'scholar.google.com',   // 学术索引
  'patents.google.com',   // 专利索引
  'wikipedia.org',        // 百科（无法直接发文）
  'github.com',           // 代码托管（非内容渠道）
];

function isExcluded(domain) {
  if (!domain) return true;
  const d = domain.toLowerCase();
  return EXCLUDED_PATTERNS.some(e => d.includes(e));
}

// ===== 查询接口 =====
function getChannelConfig(domain) {
  if (!domain) return null;
  const d = domain.toLowerCase();
  // 精确匹配
  if (CHANNEL_REGISTRY[d]) return CHANNEL_REGISTRY[d];
  // 模糊匹配（subdomain）
  for (const [key, cfg] of Object.entries(CHANNEL_REGISTRY)) {
    if (d.endsWith('.' + key) || d === key) return cfg;
  }
  return null;
}

function resolveChannelInfo(citation) {
  // citation 来自 r.citations[{url, title, domain}]
  if (!citation) return null;
  const domain = citation.domain || (citation.url ? new URL(citation.url).hostname.replace(/^www\./, '') : null);
  if (!domain) return null;
  if (isExcluded(domain)) return null;
  const cfg = getChannelConfig(domain);
  if (!cfg) return { domain, type: 'OTHER', contentForm: '其他', priority: 99 };
  return {
    domain,
    type: cfg.type,
    contentForm: CONTENT_FORMS[cfg.type] || '其他',
    priority: cfg.priority,
  };
}

function getAllChannelTypes() {
  return Object.values(CHANNEL_TYPES);
}

// ===== 扩展 API（供后续注册新平台） =====
function registerChannelType(domain, config) {
  CHANNEL_REGISTRY[domain.toLowerCase()] = config;
}

module.exports = {
  CHANNEL_TYPES,
  CONTENT_FORMS,
  CHANNEL_REGISTRY,
  EXCLUDED_PATTERNS,
  getChannelConfig,
  resolveChannelInfo,
  isExcluded,
  getAllChannelTypes,
  registerChannelType,
};
