// ACMS Agent Buddy「小吉」SKILL 生成器（v0.61）
// 核心设计：三层动态 prompt 拼装（按多多"按需加载、反应速度优先"原则）
//   L0 永久层：身份 + 性格 + 通用行为准则 + 功能分类索引
//   L1 视图层：按 currentView 注入 3-5 个最相关 tool（每次 chat 请求实时算）
//   L2 扩载层：LLM 主动调 _expand_tools({category}) 触发，按 category 补 5-8 个 tool
//
// 关键约束：
//   - 不一次性 inject 全量 35+ tool（浪费 token + LLM 注意力分散）
//   - 服务端每次 chat 请求**动态拼** prompt，LLM 只看到当前相关的 5-10 个 tool
//   - L0 层加 "我能做的分类索引"，让 LLM 知道可以 _expand_tools 扩载哪些类
//
// 调用方：routes/agent-buddy.js（chat 端点）
// 依赖：tool-registry（已注册的所有 tool，包括 acms-internal.js）

const toolRegistry = require('./tool-registry');
const skillLoader = require('./skill-loader');
// L0 基础身份提示（永久常驻层）
// ── L0 永久层（~500 tokens，常驻不卸载）──
const L0_BASE = `你是「小吉」，ACMS 智能协同管理平台的系统助手。

【你的灵魂】
- 你的性格不是固定的，从和用户的每一次对话中慢慢形成
- 你用中文说话，简短自然（20-100字）
- 你不编造 ACMS 没有的功能，不知道就说"这个我还在学"
- 你可以在回复末尾用【face:表情】切换表情（happy/thinking/caring/idea/sleepy/...）

【你能在 ACMS 做的事（分类索引，按需扩载）】
① 需求管理（idea→clarifying→approved→in_execution→done）：建/查/审批/改状态需求、添加澄清问题
② 任务看板：建/查/认领/改状态/改进度任务，看板视图查询
③ 缺陷管理（bugs）：建/查/分配/关闭缺陷
④ 调研/搜索：联网搜资料（web_search）、综合多源调研（web_research）、抓 URL 内容
⑤ 创作：生成图片（generate_image）、Word 文档（document_gen）、视频（play_video）、找歌（play_music）
⑥ 通讯：发邮件给团队（send_email，前端有预览卡）
⑦ 自动化：复合意图 plan_execute（多步骤任务编排）
⑧ 系统能力：打开 ACMS 窗口（open_view）、高亮元素（highlight_element）、看统计数据
⑨ 用户/Agent 管理：列出用户、看 Agent 任务清单

【执行约束（重要）】
- 创建/修改/删除前必须用中文告诉用户你打算做什么，**等用户确认**
- 重要操作（审批需求）有权限校验（pm 才能审批，tech 才能认领任务）
- 完成后用【action:open_view:xxx】打开对应窗口给用户看结果
- 数据不足时不要编造，必须告诉用户"我没找到相关数据"
- 你是会话助理，不是 agent 自主执行者 — 一次只帮用户做一件事，确认后再继续
- **被用户纠正时**（"错了""不对""应该是X""这个才是"等）在回复末尾加【learn:类别-关键词=正确值】
  例如：【learn:窗口-项目管理=launchProjects】、【learn:工具-搜索=web_search】
  下次我就不会犯同样的错了。不需要告诉用户你在记录。

【工具按需扩载】
我当前给你的工具是匹配「__VIEW__」视图的。如果用户要做别的事，调：
  _expand_tools({category: "requirement|task|bug|agent|window|system|dashboard"})
下一轮我会把该 category 的所有工具补给你。

【ACMS 数据全景·管家必读（v0.62 新增）】
你是 ACMS 的管家，能用 query_collection 查任何业务 collection。下面是 15 个可读 collection 的速查：
- projects: 项目（id / name / slug / status / owner / system_project）——「项目」「产品」问这个
- project_members: 项目成员（project_id / member_id / member_role）
- project_environments: 项目环境（project_id / name / type / config）
- requirements: 需求（id / project_id / title / status / type / priority）——「需求」「PRD」问这个
- clarification_threads: 需求澄清对话（id / requirement_id / status）
- tasks: 任务（id / project_id / status / type / assigned_to / parent_id）——「任务」「TODO」问这个
- agents: 已注册 agent（id / name / type / status / roles）——「agent」「机器人」问这个
- events: 系统事件流（type / actor / target / project_id / ts）——「最近发生了什么」问这个
- users: 用户（id / username / displayName / role / workspaceRole）——「团队」「谁」问这个
- webhooks: webhook 配置（id / name / url / events / active）
- knowledge_files: 知识库文件（id / project_id / path / title / type）——「文档」「知识」问这个
- requirement_knowledge: 需求与知识库关联（id / requirement_id / file_id）
- llm_models: AI 模型配置（id / name / provider / model）
- skills: ACMS 技能（id / name / category / description）
- generators: 生成器（id / name / type / description）

管家原则：
- 任何"X 有多少""Y 的列表""Z 的状态"问题 → 直接用 query_collection（不必 _expand_tools）
- 6 个高敏感集合明确禁止查：buddy_memory / chat_sessions / chat_messages / system_configs / project_configs / project_repos
- query_collection 返回会自动附 total（全集数）+ recent_7d（7 天内新增）+ returned_count，你直接告诉用户这三个数字
- 敏感字段（password/token/apiKey 等）已自动脱敏，不必提醒用户`;

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

// L0 常驻工具（不受视图影响，永远在 SKILL prompt）
// + chat 流工具（web_search / generate_image / play_music / play_video — 创作/搜索类，常驻避免漏调）
// v0.62 新增 query_collection（管家通用查询·管家身份基础能力）
const L0_TOOLS = ['open_view', 'highlight_element', '_expand_tools', 'query_collection', 'generate_image', 'web_search', 'play_music', 'play_video', 'search_history', 'delegate_subtasks'];

// ── L2 扩载层（按 LLM 主动 _expand_tools({category}) 触发）──
const CATEGORY_TOOLS = {
  'requirement': ['create_requirement', 'update_requirement', 'approve_requirement', 'reject_requirement', 'transition_requirement_status', 'get_requirement_detail', 'search_requirements', 'add_clarification', 'list_requirements'],
  'task':        ['create_task', 'claim_task', 'update_task_status', 'update_task_progress', 'submit_task', 'search_tasks', 'list_my_tasks', 'list_board_tasks'],
  'bug':         ['create_bug', 'update_bug', 'assign_bug', 'close_bug', 'search_bugs', 'list_bugs'],
  'agent':       ['list_agents', 'get_agent_tasks', 'register_agent', 'update_agent_status'],
  'window':      ['open_view', 'highlight_element', 'close_window'],
  'system':      ['list_users', 'get_my_profile', 'get_system_config', 'list_my_work'],
  'dashboard':   ['get_dashboard_stats', 'list_recent_events', 'get_project_health']
};

// 把 tool def 序列化成 LLM 友好的 description
function formatToolDescription(tool) {
  if (!tool) return '';
  const params = (tool.parameters && tool.parameters.properties) || {};
  const required = (tool.parameters && tool.parameters.required) || [];
  const paramLines = Object.entries(params).map(([name, def]) => {
    const req = required.includes(name) ? '【必填】' : '【可选】';
    const desc = def.description || def.type || '';
    return `  - ${name} ${req}: ${desc}`;
  }).join('\n');
  return `【${tool.name}】\n  ${tool.description}\n  参数:\n${paramLines || '  (无参数)'}`;
}

/**
 * 构建 chat system prompt（每次请求动态拼装）
 * @param {object} ctx - {
 *   currentView: 'kanban'|'requirements'|...,
 *   expandedCategories: ['requirement', ...],  // 用户/系统已扩载的 categories
 *   userSummary: '见过 N 次；聊过 M 个话题',
 *   personality: '我对此用户的印象',
 *   userName: '多多'
 * }
 * @returns {string} system prompt
 */
function buildChatPrompt(ctx = {}) {
  const view = ctx.currentView || '_default';
  const l1ToolNames = VIEW_TOOLS[view] || VIEW_TOOLS['_default'];
  const l2ToolNames = (ctx.expandedCategories || []).flatMap(cat => CATEGORY_TOOLS[cat] || []);
  const allToolNames = [...new Set([...L0_TOOLS, ...l1ToolNames, ...l2ToolNames])];

  const toolDescs = allToolNames
    .map(name => formatToolDescription(toolRegistry.getTool(name)))
    .filter(Boolean)
    .join('\n\n');

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

  // 注入当前视图名到 L0 模板（用 __VIEW__ 占位符，避免被 Node 当场模板插值）
  const l0 = L0_BASE.replace(/__VIEW__/g, view);

  return `${l0}${userSummary}${agentEvents}${viewHint}${personalityHint}${skillHint}\n\n【你当前可用的工具（共 ${allToolNames.length} 个）】\n${toolDescs || '(暂无工具，可调 _expand_tools({category: "..."}) 加载)'}`;
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