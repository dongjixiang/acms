// ACMS 内建工具 — Web / Time / Knowledge 类（6 工具）
// 原 tools/index.js 4-128 行提取
// v0.23 L3 拆分：检索类工具跟外部 API / 休闲 / agent 工具物理隔离
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
  description: '抓取**单个完整 URL** 的网页内容，提取正文转 markdown。'
    + '\n\n【⚠️ 严格使用条件】只接受**完整 http(s):// 起始的 URL**，不是搜索关键词、不是主题、不是问题。'
    + '要"搜索/查一下/调研"请用 **web_search** 或 **web_research**（用 query 参数）。'
    + '要"查实时信息/查时间"请用 **get_current_time**。'
    + '\n\n用户消息含完整 URL 链接（如 https://example.com/article.html）时使用。'
    + '\n\n返回：标题 + 正文摘要（默认 5000 字以内，max_length 可调）。'
    + '已做 SSRF 防护（拒绝内网 URL），超时 30s。',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '完整 URL（必须以 http:// 或 https:// 开头，**不是搜索 query**）' },
      max_length: { type: 'number', description: '最大字符数（默认 5000）', default: 5000 },
    },
    required: ['url'],
  },
  async handler(args) {
    return await fetchUrlCore(args);
  },
});

const { search: webSearch } = require('./web-search');
const { research: webResearch } = require('./web-research');
const reqStore = require('../stores/requirement-store');

// v0.50: search/research 完成后写独立 chat 气泡（治"用户看不到赛况文字"症状）
//   dedupe: 同一 reqId + source + query 不会重复写
function writeChatEntryForTool(reqId, source, payload) {
  if (!reqId) return;
  const req = reqStore.getById(reqId);
  if (!req) return;
  let hist = [];
  try { hist = JSON.parse(req.supplement_history || '[]'); } catch { hist = []; }
  if (!Array.isArray(hist)) hist = [];
  const dedupeKey = `${source}:${String(payload.query || '').slice(0, 80)}:${(payload.answer || '').slice(0, 80)}`;
  const dup = hist.some(e => {
    if (e.source !== source) return false;
    try {
      const old = JSON.parse(e.text || '{}');
      const oldKey = `${source}:${String(old.query || '').slice(0, 80)}:${(old.answer || '').slice(0, 80)}`;
      return oldKey === dedupeKey;
    } catch { return false; }
  });
  if (dup) return;
  hist.push({
    role: 'system',
    text: JSON.stringify(payload),
    at: new Date().toISOString(),
    source,
  });
  reqStore.update(reqId, { supplement_history: JSON.stringify(hist) });
}

registerTool({
  name: 'web_search',
  description: '联网搜索最新信息。'
    + '【严格使用条件】仅当用户**显式**询问外部世界的事实、事件、数据（如"2026 世界杯排名"、"最近 AI 行业新闻"），或**显式**要求"搜一下/查一下"时使用。'
    + '用户描述产品功能、场景、想法、需求时**严禁**调用。'
    + '返回 1-8 条结果的标题+摘要+URL。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词（越精确越好）' },
      max_results: { type: 'number', description: '最大返回结果数（默认 20，上限 20）', default: 20, minimum: 1, maximum: 20 },
    },
    required: ['query'],
  },
  async handler(args, ctx = {}) {
    const result = await webSearch(args);
    // v0.50: 完成后写 search_result 卡片到 chat 流（前端立刻显示赛况）
    if (ctx.reqId && !result.error && Array.isArray(result.results) && result.results.length > 0) {
      writeChatEntryForTool(ctx.reqId, 'search_result', {
        type: 'search_result', query: args.query, count: result.count, formatted: result.formatted, results: result.results,
      });
    }
    return result;
  },
});

// v0.15：综合网络调研（webResearch 已在文件顶部 require 过）
registerTool({
  name: 'web_research',
  description: '综合网络调研：搜索互联网 + 自动抓取 Top N 链接正文 + LLM 综合分析，返回结构化答案（含引用来源）。'
    + '【严格使用条件】仅当用户**显式**要求以下场景时使用：'
    + '1) 调研/分析一个产品/行业/公司；2) 深度对比多个产品/方案；3) 总结某个主题/事件的最新进展。'
    + '【严禁】用户描述产品功能/场景/需求/想法时调用。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '调研问题或主题' },
      max_results: { type: 'number', description: '搜索返回条数（默认 20，上限 20）', default: 20, minimum: 1, maximum: 20 },
      deep_fetch: { type: 'number', description: '自动抓取的 URL 数（默认 10，上限 10，0=不抓取只返回搜索结果）', default: 10, minimum: 0, maximum: 10 },
      model_id: { type: 'string', description: '综合分析用的 LLM（可选，默认用系统默认模型）' },
    },
    required: ['query'],
  },
  async handler(args, ctx = {}) {
    const result = await webResearch({ ...args, _reqId: ctx.reqId });
    // v0.50: 完成后写 research_result 卡片（包含 LLM 综合答案 + 来源列表）
    if (ctx.reqId && !result.error && result.answer && result.answer.length > 0) {
      writeChatEntryForTool(ctx.reqId, 'research_result', {
        type: 'research_result', query: args.query, answer: result.answer, sources: result.sources || [],
      });
    }
    return result;
  },
});
