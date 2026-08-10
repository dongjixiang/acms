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
      max_results: { type: 'number', description: '最大返回结果数（1-50）', default: 5 },
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
const successTracker = require('../services/search-success-tracker');
registerTool({
  name: 'fetch_url',
  description: '抓取单个完整 URL 网页内容转 markdown。\n'
    + '【何时用】\n'
    + '  • 用户消息含完整 URL（如 https://...）→ 抓那个链接\n'
    + '  • 问具体数据（股价/价格/行情/参数/房价）且 web_search 只返回内容链接（公众号/微博/资讯页）无结构化数据时 → 主动构造数据源 URL 抓取（财经→finance.sina.com.cn / gu.qq.com / quote.eastmoney.com；汽车→autohome.com.cn / dongchedi.com；房产→beike.com / bj.lianjia.com）\n'
    + '【严禁】编造 URL（抓不到如实说）；用 fetch_url 验证邮箱域名（让 send_email 自己处理失败）\n'
    + '【何时不用】搜索/查资料/调研 → 用 web_search 或 web_research；查时间 → 用 get_current_time\n'
    + '【返回】标题+正文（默认 5000 字，max_length 可调），已做 SSRF 防护（拒绝内网 URL），超时 30s。',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '完整 URL（必须以 http:// 或 https:// 开头，不是搜索 query）' },
      max_length: { type: 'number', description: '最大字符数（默认 5000）', default: 5000 },
    },
    required: ['url'],
  },
  async handler(args, ctx = {}) {
    const result = await fetchUrlCore(args);
    // v0.89: 记录成功经验（让下次类似 query 能复用这个 URL 模板）
    if (result && !result.error && result.url) {
      try { successTracker.recordFetchSuccess(result.url, ctx.message || ''); } catch (_) {}
    }
    return result;
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
  description: `【用途】联网搜索最新信息、事实、数据
【适用】用户明确说"搜一下"/"查一下"/"XX是什么"/"最近XX事件"
【禁用】用户描述产品功能、场景、想法、需求时严禁调用
【返回】1-40条结果（标题+摘要+URL），默认40条
【参数】
  - query: 搜索关键词（必填，越精确越好）
  - max_results: 结果数量（1-40，默认40）
【query 构造规则（v0.87c）】
  - 用**简洁自然的关键词**，不要堆砌同义词和日期（如"深圳95号汽油价格 今日油价 2026年8月"会让引擎理解偏，应写"深圳95号汽油当日价格"）
  - 问具体数据（价格/行情）时，query 直接含实体+数据词（如"茅台股价""深圳95号汽油价格"），简洁才精准
【示例】
  - ✅ 正确："帮我搜一下2026年世界杯足球赛冠军是谁"
  - ❌ 错误："帮我做一个世界杯相关的功能页面"
【v0.87 数据源衔接】若用户要的是**具体数据**（股价/商品价格/参数/行情/房价），
  而搜索结果只返回内容链接（公众号/微博/资讯页）不含结构化数据时——
  不要建议用户自己去看，先**再搜 1 次定位数据源 URL**（如"XX价格 查询 官网"），
  拿到真实 URL 后用 **fetch_url** 抓取。**严禁凭记忆瞎猜域名**（如乱编
  oilxxx.com），URL 必须来自搜索结果。`,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词（必填，中文或英文）' },
      max_results: { type: 'number', description: '最大返回结果数（1-40，默认40）', default: 40, minimum: 1, maximum: 40 },
    },
    required: ['query'],
  },
  async handler(args, ctx = {}) {
    const result = await webSearch(args);
    // v0.66: 图片搜索 — 若 image_search=true 或查询含图片关键词，自动跑百度图片搜索
    const imageKeywords = /图片|照片|写真|壁纸|头像|海报|截图|相片|图集|靓照|艺术照/;
    const isImageSearch = args.image_search || (args.query && imageKeywords.test(args.query));
    let imageResults = null;
    if (ctx.reqId && isImageSearch) {
      console.log('[web_search] 触发图片搜索: query=' + args.query);
      try {
        const { browserSearchBaiduImage } = require('../services/web-search');
        const imgResult = await browserSearchBaiduImage(args.query, 9);
        console.log('[web_search] 图片搜索结果: ' + (imgResult?.images?.length || 0) + ' 张');
        if (imgResult && Array.isArray(imgResult.images) && imgResult.images.length > 0) {
          imageResults = imgResult.images;
          // 存到 requirement 供 action card 轮询读取
          const reqStore = require('../stores/requirement-store');
          reqStore.update(ctx.reqId, {
            assist_image_search: JSON.stringify({ query: args.query, images: imgResult.images }),
          });
        }
      } catch (e) {
        console.warn('[web_search] 图片搜索失败（可忽略）:', e.message);
      }
    }
    // v0.73: 图片搜索时只展示图片，不写文字搜索结果到聊天流
    // v0.81: 同时检查 query 中是否包含图片关键词，防止 LLM 未传 image_search=true 时写入文字结果
    const shouldShowTextResults = !isImageSearch;
    if (ctx.reqId && !result.error && Array.isArray(result.results) && result.results.length > 0 && shouldShowTextResults) {
      writeChatEntryForTool(ctx.reqId, 'search_result', {
        type: 'search_result', query: args.query, count: result.count, formatted: result.formatted, results: result.results,
      });
    }
    return { ...result, image_results: imageResults || [] };
  },
});

// v0.15：综合网络调研（webResearch 已在文件顶部 require 过）
registerTool({
  name: 'web_research',
  description: `【用途】深度综合调研（搜索+抓取+LLM综合分析）
【适用】用户明确要求：1)调研产品/行业/公司 2)深度对比多个方案 3)总结某主题最新进展
【禁用】用户描述产品功能、场景、需求时严禁调用
【返回】结构化答案（含引用来源）
【参数】
  - query: 调研问题或主题（必填）
  - max_results: 搜索条数（1-40，默认40）
  - deep_fetch: 自动抓取URL数（0-10，默认10；0=只搜索不抓取）
  - model_id: 分析用LLM（可选，默认用系统默认模型）`,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '调研问题或主题（必填）' },
      max_results: { type: 'number', description: '搜索返回条数（1-40，默认40）', default: 40, minimum: 1, maximum: 40 },
      deep_fetch: { type: 'number', description: '自动抓取的 URL 数（0-10，默认10；0=不抓取只返回搜索结果）', default: 10, minimum: 0, maximum: 10 },
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
