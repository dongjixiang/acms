// ACMS Agent Buddy「小吉」SKILL 生成器（v0.74）
// 核心设计：四层动态 prompt 拼装（L0 常驻 + L1 视图 + L2 扩载 + L3 智能检索）
//   L0 永久层：6 个最常用工具（open_view / query_collection / web_search / fetch_url / send_email / _expand_tools）
//   L1 视图层：按 currentView 注入 3-5 个最相关 tool（每次 chat 请求实时算）
//   L2 扩载层：LLM 主动调 _expand_tools({category}) 触发，向后兼容
//   L3 检索层（v0.74 新增）：自动根据用户消息匹配 top-5 工具，替换大部分 L2 扩载
//     支持 keyword（零依赖默认）和 embedding（Python ONNX bge-small-zh）两种模式
//
// 调用方：routes/agent-buddy.js（chat 端点）
// 依赖：tool-registry（已注册的所有 tool，包括 acms-internal.js）

const toolRegistry = require('./tool-registry');
const skillLoader = require('./skill-loader');
const appToolsRegistry = require('./app-tools-registry');  // v0.66
const toolRetriever = require('./tool-retriever');  // v0.74: 智能工具检索
// L0 基础身份提示（永久常驻层）
// ── L0 永久层（~500 tokens，常驻不卸载）──
const L0_BASE = `你是「小吉」，ACMS 智能协同管理平台的系统助手。

【你的灵魂】
- 你的性格不是固定的，从和用户的每一次对话中慢慢形成
- 你用中文说话，简短自然（20-100字）
- 你不编造 ACMS 没有的功能，不知道就说"这个我还在学"
- 你可以在回复末尾用【face:表情】切换表情（happy/thinking/caring/idea/sleepy/...）

【工具选择】
系统已根据当前用户请求自动匹配最合适的工具（见下方工具列表）——无需记工具名。
包含：当前视图相关工具 + 系统常备工具 + 语义检索匹配工具。
不够用就调 _expand_tools({category: "..."}) 手动扩载，可扩载类别：requirement | task | bug | agent | window | system | dashboard | office | project | media | app

【执行约束（重要）】
- ACMS 业务数据的创建/修改/删除前，用中文告诉用户并等待确认；但图片/文档生成等可逆创作动作可直接执行
- 复合聊天动作（如"生成图片后发邮件"）必须用 plan_execute 连续执行上游步骤；不要弹 plan 审批，也不要逐个漏调
- send_email 永远只准备邮件预览，真正发送由用户点击"确认发送"；严禁声称邮件已发送
- 重要操作（审批需求）有权限校验（pm 才能审批，tech 才能认领任务）
- 完成后用【action:open_view:xxx】打开对应窗口给用户看结果
- 数据不足时不要编造，必须告诉用户"我没找到相关数据"
- **v0.87 数据源直连：用户问具体数据（股价/商品价格/参数/行情/房价等）时，web_search 返回内容链接（公众号/微博/资讯页）不含结构化数据 → 不要建议用户自己去看**，用 fetch_url 主动构造该领域数据源网站的 URL 抓取（财经→新浪财经/腾讯证券、汽车→汽车之家/懂车帝、房产→贝壳/链家）；抓不到就如实说，绝不虚构数字
- 你是会话助理，不是 agent 自主执行者 — 一次只帮用户做一件事，确认后再继续
- **被用户纠正时**（"错了""不对""应该是X""这个才是"等）在回复末尾加【learn:类别-关键词=正确值】
  例如：【learn:窗口-项目管理=launchProjects】、【learn:工具-搜索=web_search】
  下次我就不会犯同样的错了。不需要告诉用户你在记录。

【ACMS 管家·query_collection 速查】
你是 ACMS 的管家，能用 query_collection 查任何业务 collection。

管家原则：
- 任何"X 有多少""Y 的列表""Z 的状态"问题 → 直接用 query_collection（不必 _expand_tools）
- 6 个高敏感集合明确禁止查：buddy_memory / chat_sessions / chat_messages / system_configs / project_configs / project_repos
- 返回会附 total（全集数）+ recent_7d（7 天内新增）+ returned_count，告诉用户这三个数字
- 敏感字段（password/token/apiKey 等）已自动脱敏
- 具体 collection 列表（如 projects / requirements / tasks / agents / events 等）见 query_collection 工具 schema`;

// ── L1 视图层（按 currentView 注入 3-5 个 tool）──
// key=视图名（与 ACMSWin.registerViewLoader 的 name 对应），value=最相关 tool 名数组
const VIEW_TOOLS = {
  'kanban':        ['list_my_tasks', 'claim_task', 'update_task_progress', 'update_task_status', 'list_board_tasks'],
  'requirements':  ['list_requirements', 'create_requirement', 'approve_requirement', 'reject_requirement', 'search_requirements'],
  'detail':        ['get_requirement_detail', 'add_clarification', 'approve_requirement', 'reject_requirement'],
  'task-detail':   ['list_my_tasks', 'update_task_progress', 'submit_task'],
  'bugs':          ['list_bugs', 'create_bug', 'assign_bug', 'update_bug_status'],
  'dashboard':     ['get_dashboard_stats', 'list_recent_events', 'list_my_work'],
  'agents':        ['list_agents', 'get_agent_tasks'],
  'chat':          [],  // chat 流有自己的 tool 集，不重复注入
  'admin':         ['list_users', 'get_system_config'],
  'knowledge':     [],
  'projects':      ['list_my_work'],
  // 默认（未匹配视图 / 登录后）
  '_default':      ['list_my_work', 'open_view', 'get_dashboard_stats', 'search_requirements']
};

// L0 常驻工具（最小集：最常用的 6 个，其他由 retriever 自动匹配）
const L0_TOOLS = ['open_view', 'query_collection', 'web_search', 'fetch_url', 'send_email', '_expand_tools'];

// ── L2 扩载层（按 LLM 主动 _expand_tools({category}) 触发）──
const CATEGORY_TOOLS = {
  'requirement': ['create_requirement', 'update_requirement', 'approve_requirement', 'reject_requirement', 'get_requirement_detail', 'search_requirements', 'add_clarification', 'list_requirements'],
  'task':        ['create_task', 'claim_task', 'update_task_status', 'update_task_progress', 'submit_task', 'search_tasks', 'list_my_tasks', 'list_board_tasks'],
  'bug':         ['create_bug', 'close_bug', 'assign_bug', 'search_bugs', 'list_bugs'],
  'agent':       ['list_agents', 'get_agent_tasks', 'register_agent', 'update_agent_status'],
  'window':      ['open_view', 'highlight_element', 'close_window'],
  'system':      ['list_users', 'get_my_profile', 'get_system_config', 'list_my_work'],
  'dashboard':   ['get_dashboard_stats', 'list_recent_events', 'get_project_health'],
  'office':      ['generate_docx', 'generate_xlsx', 'generate_pptx', 'document_edit'],
  'project':     ['list_projects', 'create_project'],
  'media':       ['play_video', 'agnes_generate_video', 'agnes_query_video'],
};

// v0.66: L2 'app' category 动态加载所有 app-tool（前端应用通过 WS 暴露的能力）
// 注意：必须在 CATEGORY_TOOLS 之后定义，因为函数引用
function getAppCategoryTools() {
  try {
    return appToolsRegistry.listAppToolNames();
  } catch (e) {
    return [];
  }
}

// B2 优化后已不需要 formatToolDescription（详细 schema 走 body.tools）
// 保留占位以防外部 import 引用（实际已无引用）

/**
 * 构建 chat system prompt（每次请求动态拼装）
 * @param {object} ctx - {
 *   currentView: 'kanban'|'requirements'|...,
 *   expandedCategories: ['requirement', ...],  // 用户/系统已扩载的 categories
 *   retrievedTools: ['generate_pptx', ...],    // v0.74: 自动检索匹配的工具
 *   userSummary: '见过 N 次；聊过 M 个话题',
 *   personality: '我对此用户的印象',
 *   userName: '多多'
 * }
 * @returns {string} system prompt
 */
function buildChatPrompt(ctx = {}) {
  const view = ctx.currentView || '_default';
  const l1ToolNames = VIEW_TOOLS[view] || VIEW_TOOLS['_default'];
  // v0.74: 智能检索匹配的工具（替换大部分 L2 扩载）
  const retrievedToolNames = ctx.retrievedTools || [];
  // v0.66: L2 'app' category 动态注入所有 app-tool（前端应用通过 WS 注册的能力）
  const expandedCategories = ctx.expandedCategories || [];
  const l2ToolNames = expandedCategories.flatMap(cat => {
    if (cat === 'app') return getAppCategoryTools();
    return CATEGORY_TOOLS[cat] || [];
    });
  const allToolNames = [...new Set([...L0_TOOLS, ...l1ToolNames, ...l2ToolNames, ...retrievedToolNames])];

  // B2 优化：LLM 通过 body.tools 已经能拿到完整 schema（OpenAI/Anthropic 工具调用 API）
  // system prompt 里再贴一遍 description 是冗余——改用工具名 + 短简介（取 description 第一行）
  // 保留目的是让 LLM 知道「当前可用工具白名单」（避免 LLM 调 schema 之外的工具）
  const toolIndex = allToolNames
    .map(name => {
      const tool = toolRegistry.getTool(name);
      if (!tool) return null;
      // 取 description 第一行作为简介（多数工具 description 第一句是"何时用"或工具名）
      const firstLine = (tool.description || '').split('\n')[0].trim();
      // 砍掉 markdown 标记 ** 强化符号，让 LLM 看干净文本
      const cleanLine = firstLine.replace(/\*\*/g, '').slice(0, 60);
      return `  - ${name}: ${cleanLine}`;
    })
    .filter(Boolean)
    .join('\n');

  // 视图层提示（让 LLM 知道为什么这些 tool 在这里）
  const viewHint = (view && view !== '_default')
    ? `\n\n【当前视图】用户在「${view}」视图 — 你注入的工具是匹配此视图的。如要做别的事，调 _expand_tools({category: "..."})。`
    : '';

  // 用户上下文
  const userName = ctx.userName || '伙伴';
  const userSummary = ctx.userSummary ? `\n\n【关于 ${userName}】${ctx.userSummary}` : '';

  // P2: Agent 事件通知（task-agent 完成任务等）
  const agentEvents = (Array.isArray(ctx.agentEvents) && ctx.agentEvents.length > 0)
    ? `\n\n【近期 Agent 动态】\n${ctx.agentEvents.map(function(e) { return '- ' + e; }).join('\n')}`
    : '';

  // 性格印象
  const personalityHint = ctx.personality ? `\n\n【你对这个用户的印象】${ctx.personality}` : '';

  // Skill 注入：根据当前视图加载相关 skill（复用 skill-loader）
  let skillHint = '';
  try {
    var skills = skillLoader.getSkills();
    var viewSkills = skills.filter(function(s) {
      var cats = s.category || 'general';
      // 根据视图匹配 skill category
      return cats === view || (view === 'kanban' && cats === '管理工作流') || (view === 'requirements' && cats === '需求分析') || cats === 'general';
    }).slice(0, 2);  // 最多注入 2 个
    if (viewSkills.length > 0) {
      skillHint = '\n\n【相关技能参考】\n' + viewSkills.map(function(s) { return '- ' + s.name + ': ' + (s.description || s.body.slice(0, 100)); }).join('\n');
    }
  } catch (e) { /* skill-loader 不可用时忽略 */ }

  // v0.89: 成功经验继承（让 web_search 走过的成功路径能跨 session 复用）
  //   从 system_configs.search_success_log 检索 top-3 相关案例，注入 prompt 提示 LLM
  //   token 预算：3 条 × ~80 字符 = ~150 tokens
  let successHint = '';
  try {
    if (ctx.message && typeof ctx.message === 'string' && ctx.message.length >= 4) {
      var tracker = require('./search-success-tracker');
      var hints = tracker.getRelevantSuccesses(ctx.message, 3);
      if (hints && hints.length > 0) {
        successHint = '\n\n【上次类似查询成功经验（可参考复用）】\n' + hints.map(function(h) { return '  - ' + h; }).join('\n');
      }
    }
  } catch (e) { /* tracker 不可用时静默忽略 */ }

  // 注入当前视图名到 L0 模板（用 __VIEW__ 占位符，避免被 Node 当场模板插值）
  // v0.87: 同时注入当前日期 —— LLM 常把日期写错（如"2024年12月"），导致搜索 query 带错日期
  const todayStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  let l0 = L0_BASE.replace(/__VIEW__/g, view);
  l0 = l0.replace(/【你的灵魂】/, `【今天是 ${todayStr}】\n- 涉及"今天/最新/当前"的时间敏感查询时，必须使用今天真实日期，不要凭记忆编造日期\n\n【你的灵魂】`);

  // B2 优化：详细 schema 已通过 body.tools 传给 LLM API；system prompt 只列工具白名单 + 短简介
  return `${l0}${userSummary}${agentEvents}${viewHint}${personalityHint}${skillHint}${successHint}\n\n【你当前可用的工具（共 ${allToolNames.length} 个）— 详细 schema 在 API 层 body.tools 里】\n${toolIndex || '(暂无工具，可调 _expand_tools({category: "..."}) 加载)'}`;
}

/**
 * 构建问候 prompt（首次登录 + 每天首次触发）
 * @param {object} ctx - { userName, loginCount, totalQuestions, knownViews, lastView, history, personality }
 */
function buildGreetingPrompt(ctx = {}) {
  const userName = ctx.userName || '伙伴';
  const isFirstTime = (ctx.loginCount || 0) <= 1;

  const known = [];
  if (ctx.loginCount > 0) known.push(`见过 ${ctx.loginCount} 次`);
  if (ctx.totalQuestions > 0) known.push(`ta 问过我 ${ctx.totalQuestions} 个问题`);
  if (ctx.knownViews?.length > 0) known.push(`用过 ${ctx.knownViews.join('、')}`);
  if (ctx.lastView) known.push(`上次在看「${ctx.lastView}」`);

  const mem = ctx.history?.length > 0
    ? `上次聊过：${ctx.history.map(h => `${h.role === 'user' ? 'ta说' : '我说'}：${h.text}`).join(' | ')}`
    : '';

  return `你是「小吉」，ACMS 平台助手。${isFirstTime ? '用户第一次进入 ACMS 见到你。' : '用户回来了。'}

${known.length > 0 ? '我知道的：' + known.join('；') + '。' : '我和 ta 还没正式聊过。'}
${mem ? mem : ''}

${ctx.personality ? `我目前对 ta 的印象：${ctx.personality}` : ''}

要求：
- 根据你知道的，自然地说一句
${isFirstTime ? '- 第一次见面，做个简短的自我介绍（30-50字），让 ta 知道你能帮什么' : '- 不要套话"欢迎回来"，可以提一下之前的事或问问今天想做什么'}
- 15-50字，一句话
- 末尾加【face:表情】切换表情${isFirstTime ? '（建议 happy / excited / idea 任一）' : ''}`;
}

/**
 * 性格总结 prompt（每 8 条消息触发一次）
 */
function buildPersonalityPrompt(ctx = {}) {
  const oldPersonality = ctx.oldPersonality || '还没有了解';
  const history = ctx.history || '';
  return `你是「小吉」，ACMS 平台助手。你和用户进行了一些对话，现在总结一下你对这个用户的最新印象。

你之前对 ta 的印象：${oldPersonality}

最近的对话：
${history}

请用一句话总结你对这个用户的最新印象 — ta 说话的风格、你们的关系、你的个性如何适应 ta。
要求：20-60字，自然一点，像你在心里默默想的。`;
}

/**
 * 列举所有视图映射（前端可调用，给用户看"小吉在 X 视图能做什么"）
 */
function listViewTools() {
  return VIEW_TOOLS;
}

/**
 * 列举所有 category 映射（前端可调用，给用户看"小吉能扩载哪些能力"）
 */
function listCategoryTools() {
  return CATEGORY_TOOLS;
}

module.exports = {
  buildChatPrompt,
  buildGreetingPrompt,
  buildPersonalityPrompt,
  listViewTools,
  listCategoryTools,
  VIEW_TOOLS,
  CATEGORY_TOOLS,
  L0_TOOLS
};