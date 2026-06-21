// ACMS 内建工具注册
const { registerTool } = require('../services/tool-registry');

registerTool({
  name: 'get_current_time',
  description: '获取指定时区的当前日期和时间',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: '时区名称（如 Asia/Shanghai, America/New_York）',
        enum: ['Asia/Shanghai', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'UTC'],
      },
    },
    required: ['timezone'],
  },
  async handler(args) {
    const now = new Date();
    const tz = args.timezone || 'Asia/Shanghai';
    return { timezone: tz, local_time: now.toLocaleString('zh-CN', { timeZone: tz }), utc_time: now.toISOString(), timestamp: now.getTime() };
  },
});

registerTool({
  name: 'search_knowledge',
  description: '搜索内部知识库和已沉淀的需求文档，查找与关键词相关的历史信息',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词或自然语言问题' },
      max_results: { type: 'number', description: '最大返回结果数（1-20）', default: 5 },
    },
    required: ['query'],
  },
  async handler(args) {
    const query = args.query || '';
    return { query, results: [{ title: `[Mock] 关于"${query}"的文档`, score: 0.95, snippet: '模拟知识库搜索结果', source: 'knowledge_base' }], total: 1, note: '当前为模拟数据，后续接入真实搜索引擎' };
  },
});

registerTool({
  name: 'get_requirement_detail',
  description: '获取需求的详细信息，包括当前状态、AI理解、用户反馈历史和已有辅助分析结果',
  parameters: {
    type: 'object',
    properties: { requirement_id: { type: 'string', description: '需求 ID（如 req_xxx）' } },
    required: ['requirement_id'],
  },
  async handler(args) {
    try {
      const reqStore = require('../stores/requirement-store');
      const req = reqStore.getById(args.requirement_id);
      if (!req) return { error: '需求不存在' };
      return { id: req.id, title: req.title, description: req.description, status: req.status, ai_understanding: req.ai_understanding };
    } catch (e) { return { error: e.message }; }
  },
});

const { fetchUrlCore } = require('./url-fetch');
registerTool({
  name: 'fetch_url',
  description: '抓取外部 URL 网页内容，提取正文转 markdown。'
            + '当用户消息含 http(s):// 链接时使用，返回标题 + 正文摘要（5000 字以内）。'
            + '已做 SSRF 防护（拒绝内网 URL），超时 30s。',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '完整 URL（含 http:// 或 https://）' },
      max_length: { type: 'number', description: '最大字符数（默认 5000）', default: 5000 },
    },
    required: ['url'],
  },
  async handler(args) {
    return await fetchUrlCore(args);
  },
});

const { search: webSearch } = require('./web-search');
registerTool({
  name: 'web_search',
  description: '搜索互联网最新信息。当用户询问最新事件、实时数据、当前资讯时使用。'
            + '免费搜索引擎，无需 API Key，返回标题 + 摘要 + URL。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词（越精确越好）' },
      max_results: { type: 'number', description: '最大返回结果数（1-8）', default: 8 },
    },
    required: ['query'],
  },
  async handler(args) {
    return await webSearch(args);
  },
});

// v0.15：综合网络调研（搜索 + 抓取 + LLM 综合分析 一站式）
const { research: webResearch } = require('./web-research');
registerTool({
  name: 'web_research',
  description: '综合网络调研：搜索互联网 + 自动抓取 Top N 链接正文 + LLM 综合分析，返回结构化答案（含引用来源）。'
            + '适用场景：用户问"目前XXX怎么样"、"分析一下YYY"、"对比一下AAA和BBB"等需要多源信息的复杂问题。'
            + '比 web_search 更深入（自动读全文），比手动 search+fetch 更省事。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '调研问题或主题' },
      max_results: { type: 'number', description: '搜索返回条数（默认 6，1-10）', default: 6 },
      deep_fetch: { type: 'number', description: '自动抓取的 URL 数（默认 3，0=不抓取只返回搜索结果）', default: 3 },
      model_id: { type: 'string', description: '综合分析用的 LLM（可选，默认用系统默认模型）' },
    },
    required: ['query'],
  },
  async handler(args) {
    return await webResearch(args);
  },
});

console.log('[tools] 内建工具注册完成:', listBuiltinTools().join(', '));
function listBuiltinTools() { return require('../services/tool-registry').listTools().map(t => t.name); }
