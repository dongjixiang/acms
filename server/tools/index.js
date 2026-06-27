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
  // v0.16 收紧：去掉"询问最新事件、实时数据、当前资讯"等描述，避免诱导 LLM
  //   仅在用户**显式**要求联网搜素时使用
  description: '联网搜索最新信息。'
            + '【严格使用条件】仅当用户**显式**询问外部世界的事实、事件、数据（如"2026 世界杯排名"、"最近 AI 行业新闻"），或**显式**要求"搜一下/查一下"时使用。'
            + '用户描述产品功能、场景、想法、需求时**严禁**调用。'
            + '返回 1-8 条结果的标题+摘要+URL。',
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
  // v0.16 收紧：去掉"适用场景：用户问'目前XXX怎么样'、'分析一下YYY'"等诱导性描述
  //   强化"显式"和"严禁"约束，避免误触发
  description: '综合网络调研：搜索互联网 + 自动抓取 Top N 链接正文 + LLM 综合分析，返回结构化答案（含引用来源）。'
            + '【严格使用条件】仅当用户**显式**要求以下场景时使用：'
            + '1) 调研/分析一个产品/行业/公司（如"分析钉钉的产品策略"、"调研 SaaS 行业头部厂商"）'
            + '2) 深度对比多个产品/方案（如"对比钉钉和企业微信的差异"）'
            + '3) 总结某个主题/事件的最新进展（如"2026 世界杯小组赛最新积分情况"）'
            + '【严禁】用户描述产品功能/场景/需求/想法时调用；'
            + '【严禁】用户用日常词（想听/想看/想找/推荐/帮我/搜索等）描述时调用。'
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

// Agnes AI Video V2.0 视频生成
const { generateVideo, queryVideo } = require('./agnes-video');
registerTool({
  name: 'agnes_generate_video',
  description: '使用 Agnes AI Video V2.0 创建视频生成任务。'
    + '支持：文生视频（只需 prompt）、图生视频（+image URL）、多图视频（+extra_images[]）、关键帧动画（+extra_mode="keyframes"）。'
    + '返回 video_id 和 task_id。任务异步执行，之后用 agnes_query_video 查询结果。',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '视频内容的文本描述（文生视频必填）' },
      image: { type: 'string', description: '图生视频：单张参考图片 URL' },
      mode: { type: 'string', enum: ['ti2vid', 'keyframes'], description: '生成模式（ti2vid=图生视频, keyframes=关键帧动画）' },
      height: { type: 'number', description: '视频高度（默认 768）' },
      width: { type: 'number', description: '视频宽度（默认 1152）' },
      num_frames: { type: 'number', description: '视频帧数（≤441，需满足 8n+1 规则，如 81/121/241/441）', default: 121 },
      frame_rate: { type: 'number', description: '视频帧率（1-60，推荐 24）', default: 24 },
      seed: { type: 'number', description: '随机种子，用于生成可复现的结果' },
      negative_prompt: { type: 'string', description: '反向提示词，描述需要避免的内容' },
      extra_images: { type: 'array', items: { type: 'string' }, description: '多图视频/关键帧：额外图片 URL 数组' },
      extra_mode: { type: 'string', description: '附加模式设置，如 "keyframes"' },
    },
    required: ['prompt'],
  },
  async handler(args) {
    return await generateVideo(args);
  },
});

registerTool({
  name: 'agnes_query_video',
  description: '查询 Agnes AI 视频生成任务的状态和结果。'
    + '在 agnes_generate_video 创建任务后使用，返回当前进度和最终视频 URL。'
    + '建议创建任务后间隔 15-30 秒查询，直到 status 为 "completed" 或 "failed"。',
  parameters: {
    type: 'object',
    properties: {
      video_id: { type: 'string', description: '视频 ID（推荐，由 agnes_generate_video 返回）' },
      task_id: { type: 'string', description: '任务 ID（兼容旧版查询）' },
      model_name: { type: 'string', description: '显式指定模型名称（可选，默认 agnes-video-v2.0）' },
    },
  },
  async handler(args) {
    return await queryVideo(args);
  },
});

// ════════════════════════════════════════════════════════════════
// v0.20：休闲娱乐工具（音乐/视频/图片）— 把 assist 包装为 LLM 可见工具
//   LLM 看到用户说"想听 X"/"播放 X"/"生成图片 Y"等 → 主动 tool-call → 触发对应 assist
//   fire-and-forget 异步跑，handler 立刻返回成功响应给 LLM
//   context 由 chat-intent.js 注入（含 reqId）
// ════════════════════════════════════════════════════════════════

registerTool({
  name: 'play_music',
  description: '为用户找歌曲的免费播放源（网易云/QQ/B站/YouTube 等）。'
    + '当用户表达"想听 X""播放 X""找一首 X""搜 X 歌""放 X 歌"等音乐意图时使用。'
    + 'song 必填，artist 可选（帮助 LLM 推断更准的搜索）。'
    + '返回 ok=true 表示已触发异步搜索，用户会在 10-30 秒内看到播放卡片。'
    + '【重要】这是 fire-and-forget 异步任务，**调用一次即可，不要重复调用**。LLM 看到 ok 后应直接生成回复告诉用户"正在帮你找"，不要再次调用本工具确认。',
  parameters: {
    type: 'object',
    properties: {
      song: { type: 'string', description: '歌曲名（必填）' },
      artist: { type: 'string', description: '艺人名（可选，LLM 可从对话历史推断）' },
    },
    required: ['song'],
  },
  async handler(args, ctx = {}) {
    const { reqId } = ctx;
    if (!reqId) return { ok: false, error: 'NO_REQ_ID', message: '工具调用上下文缺少 reqId' };
    if (!args?.song) return { ok: false, error: 'NO_SONG', message: '必须提供 song 参数' };
    try {
      const musicSvc = require('../services/assists/music');
      console.log(`[tool:play_music] ${reqId} song="${args.song}" artist="${args.artist || ''}"`);
      // fire-and-forget：异步跑 assist job，不阻塞 LLM
      setImmediate(() => {
        musicSvc.runAssistJob(reqId, { song: args.song, artist: args.artist })
          .catch(e => console.error(`[tool:play_music] runAssistJob failed:`, e.message));
      });
      return {
        ok: true,
        message: `正在为你找「${args.song}${args.artist ? ' - ' + args.artist : ''}」的免费播放源，预计 10-30 秒内显示卡片。`,
        song: args.song,
        artist: args.artist || null,
        reqId,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
});

registerTool({
  name: 'play_video',
  description: '用视频生成辅助工具创建视频任务。'
    + '当用户表达"生成视频 X""做一个视频""给我生成一段视频""画一个视频"等视频生成意图时使用。'
    + '需要从用户消息中提取视频主题/描述作为 prompt。'
    + '返回 ok=true 表示已触发异步生成（通常 60-300 秒），完成后用户看到视频卡片。'
    + '【重要】这是 fire-and-forget 异步任务，**调用一次即可，不要重复调用**。LLM 看到 ok 后应直接生成回复告诉用户"正在生成"，不要再次调用本工具确认。',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '视频内容描述（必填，从用户消息提炼）' },
      duration: { type: 'number', description: '目标时长（秒，可选，用于 frame 数估算）' },
    },
    required: ['prompt'],
  },
  async handler(args, ctx = {}) {
    const { reqId } = ctx;
    if (!reqId) return { ok: false, error: 'NO_REQ_ID', message: '工具调用上下文缺少 reqId' };
    if (!args?.prompt) return { ok: false, error: 'NO_PROMPT', message: '必须提供 prompt 参数' };
    try {
      const videoSvc = require('../services/assists/video');
      console.log(`[tool:play_video] ${reqId} prompt="${args.prompt.slice(0, 80)}"`);
      // fire-and-forget：异步跑 assist job
      setImmediate(() => {
        videoSvc.runAssistJob(reqId, { prompt: args.prompt, duration: args.duration })
          .catch(e => console.error(`[tool:play_video] runAssistJob failed:`, e.message));
      });
      return {
        ok: true,
        message: `正在为你生成视频「${args.prompt.slice(0, 30)}...」，预计 60-300 秒完成，完成后显示视频卡片。`,
        prompt: args.prompt,
        reqId,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
});

registerTool({
  name: 'generate_image',
  description: '用图片生成辅助工具创建图片。'
    + '当用户表达"生成图片 X""画一张 X""画一个 X""给我生成一张图"等图片生成意图时使用。'
    + '需要从用户消息中提取图片描述作为 prompt。'
    + '返回 ok=true 表示已触发异步生成（通常 10-60 秒），完成后用户看到图片卡片。'
    + '【重要】这是 fire-and-forget 异步任务，**调用一次即可，不要重复调用**。LLM 看到 ok 后应直接生成回复告诉用户"正在生成"，不要再次调用本工具确认。',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '图片内容描述（必填，从用户消息提炼）' },
    },
    required: ['prompt'],
  },
  async handler(args, ctx = {}) {
    const { reqId } = ctx;
    if (!reqId) return { ok: false, error: 'NO_REQ_ID', message: '工具调用上下文缺少 reqId' };
    if (!args?.prompt) return { ok: false, error: 'NO_PROMPT', message: '必须提供 prompt 参数' };
    try {
      const imageSvc = require('../services/assists/image-gen');
      console.log(`[tool:generate_image] ${reqId} prompt="${args.prompt.slice(0, 80)}"`);
      setImmediate(() => {
        imageSvc.runAssistJob(reqId, { prompt: args.prompt })
          .catch(e => console.error(`[tool:generate_image] runAssistJob failed:`, e.message));
      });
      return {
        ok: true,
        message: `正在为你生成图片「${args.prompt.slice(0, 30)}...」，预计 10-60 秒完成，完成后显示图片卡片。`,
        prompt: args.prompt,
        reqId,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
});

console.log('[tools] 内建工具注册完成:', listBuiltinTools().join(', '));
function listBuiltinTools() { return require('../services/tool-registry').listTools().map(t => t.name); }
