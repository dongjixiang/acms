// 小吉 conversational-action 运行时
// 为即时聊天动作提供真实 requirement 容器，并用 LLM 单轮结构化路由复合动作。

const { callLLM } = require('./llm-adapter');
const reqStore = require('../stores/requirement-store');

const ACTION_PROJECT_SLUG = 'agent-buddy-actions';
const ACTION_MODES = new Set(['conversation', 'single_action', 'conversational_action']);

function ensureActionProject(userId) {
  const { collection } = require('../db/connection');
  let project = collection('projects').findOne(p => p.slug === ACTION_PROJECT_SLUG);
  if (!project) {
    const projectStore = require('../stores/project-store');
    project = projectStore.create({
      name: '小吉动作记录',
      slug: ACTION_PROJECT_SLUG,
      description: '小吉即时聊天动作的隐藏运行容器。',
      owner: userId || 'system',
    });
    collection('projects').update(p => p.id === project.id, { system_project: 1 });
    project = collection('projects').findOne(p => p.id === project.id) || project;
  }
  return project;
}

function getOrCreateActionRequirement(userId) {
  const { collection } = require('../db/connection');
  const project = ensureActionProject(userId);
  const requirement = reqStore.create({
    projectId: project.id,
    title: `小吉即时动作 · ${userId || 'anonymous'}`,
    description: '小吉生成图片、文档、邮件等即时聊天动作的隐藏运行容器。',
    createdBy: userId || 'system',
    status: 'idea',
    role: 'system',
  });
  reqStore.update(requirement.id, { chat_mode: 'free', system_record: 1 });

  const key = `buddy_action_req:${userId || 'anonymous'}`;
  const mem = collection('buddy_memory').findOne(m => m.user_id === (userId || 'anonymous') && m.key === key);
  const value = JSON.stringify(requirement.id);
  if (mem) collection('buddy_memory').update(m => m.user_id === (userId || 'anonymous') && m.key === key, { value, updated_at: new Date().toISOString() });
  else collection('buddy_memory').insert({ user_id: userId || 'anonymous', key, value, updated_at: new Date().toISOString() });
  return reqStore.getById(requirement.id);
}

function extractJson(text) {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) {}
  }
  return null;
}

function normalizeRoute(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const mode = ACTION_MODES.has(value.mode) ? value.mode : 'conversation';
  // v0.85: 白名单与 router prompt 能力枚举对齐（之前漏了 web_search/web_fetch/project_create/create_task
  //   → "特斯拉股票今日价格"等不命中关键词拦截的消息，capabilities 被滤成空 → 无工具 → LLM 乱码）
  // v0.88: 加 code_execution —— 小吉执行域（改代码/修 bug/跑命令等意图）
  const capabilities = Array.isArray(value.capabilities)
    ? value.capabilities.filter(x => ['image_generation', 'image_search', 'music_playback', 'email_draft', 'email_send', 'web_search', 'web_research', 'document_generation', 'project_create', 'create_task', 'web_fetch', 'code_execution'].includes(x))
    : [];
  const normalized = {
    mode,
    confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)),
    capabilities: [...new Set(capabilities)],
    requires_confirmation: value.requires_confirmation !== false && capabilities.includes('email_send'),
    reason: String(value.reason || '').slice(0, 300),
  };
  // v0.85 防御: single_action / conversational_action 但 capabilities 空 → 降级 conversation
  //   否则 getActionToolNames 清空工具 → LLM 无 schema 可调 → 输出乱码标签格式
  //   conversation 模式有 L0 常驻工具（web_search 等），LLM 仍能自己决定调工具
  if (normalized.mode !== 'conversation' && normalized.capabilities.length === 0) {
    console.warn(`[agent-buddy-action] ${normalized.mode} 但 capabilities 为空 → 降级 conversation (msg: ${String(value.reason || '').slice(0, 60)})`);
    normalized.mode = 'conversation';
  }
  return normalized;
}

async function routeMessage(modelId, message, history = []) {
  const historyText = (history || []).slice(-4).map(h => `${h.role}: ${String(h.text || '').slice(0, 180)}`).join('\\n');
  const system = `你是 ACMS 小吉的动作路由器。只做分类，不调用工具，不制定开发计划。
输出严格 JSON：
{"mode":"conversation|single_action|conversational_action","confidence":0.0,"capabilities":[],"requires_confirmation":false,"reason":"..."}
能力枚举：image_generation、image_search、music_playback、email_draft、email_send、web_search、web_research、document_generation、project_create、web_fetch、code_execution。
规则：
- 纯问答/查询 ACMS 数据/闲聊 → conversation。
- 一个明确工具动作 → single_action。
- 两个及以上有依赖的动作（如生成图片后发邮件）→ conversational_action。
- send email 是外部副作用，必须包含 email_draft + email_send，requires_confirmation=true。
- 用户描述简短但动作明确时照常分类，不要因为缺少主题、数量等默认参数判无法理解。
- **重要：mode 为 single_action 或 conversational_action 时，必须根据用户意图将相关能力填入 capabilities 数组，不要留空。**
- **找图片/搜图片/查图片→ capabilities 含 image_search。生成图片/画图片/创作图片→ capabilities 含 image_generation。两者不同。**
- **创建项目/新建项目→ capabilities 含 project_create。**
- **用户消息包含 http/https URL 时，必须分类为 single_action 并填入 web_fetch 能力（抓取网页内容），不要分类为 conversation。**
- **用户说"看新闻"/"查新闻"/"搜新闻"/"最新消息"/"今天有什么新闻"等→ capabilities 含 web_search。**
- **v0.88 用户要求改代码/写代码/修bug/实现功能/读文件/跑命令/查看项目代码/调试 等代码执行意图 → capabilities 含 code_execution。**`;
  const result = await callLLM(modelId, [
    { role: 'system', content: system },
    ...(historyText ? [{ role: 'user', content: `最近对话：\\n${historyText}` }] : []),
    { role: 'user', content: message },
  ], { maxTokens: 350, temperature: 0, caller: 'agent-buddy-action-router' });
  const content = typeof result === 'string' ? result : (result && result.content) || '';
  const route = normalizeRoute(extractJson(content));
  // v0.66: 关键词前置拦截 — 不管路由器 LLM 怎么分类，看到"找图片"就强制 image_search
  const searchImgRe = /找图片|搜图片|查图片|找一张.*图|搜一张.*图/;
  if (searchImgRe.test(message) && route.mode !== 'conversation') {
    route.capabilities = ['image_search'];
    console.log('[agent-buddy-action] 关键词命中 image_search, 强制覆盖路由');
  }
  // v0.76: 关键词前置拦截 — 不管路由器 LLM 怎么分类，看到"创建项目/新建项目"就强制 project_create
  // v0.79: 扩展正则匹配"项目...创建"倒序（如"项目还没帮我创建呢"），支持"创"简写
  const createProjectRe = /创.*项目|项目.*创|新建.*项目|新建.*叫|帮我建.*项目/;
  if (createProjectRe.test(message) && route.mode !== 'conversation') {
    route.capabilities = ['project_create'];
    console.log('[agent-buddy-action] 关键词命中 project_create, 强制覆盖路由');
  }
  // v0.79: 关键词前置拦截 — 看到"创建任务/创建开发任务"就强制 task 相关工具
  const createTaskRe = /创.*任务|任务.*创建|建.*任务|新建.*任务/;
  if (createTaskRe.test(message) && route.mode !== 'conversation') {
    route.capabilities = ['create_task'];
    console.log('[agent-buddy-action] 关键词命中 create_task, 强制覆盖路由');
  }
  // v0.79: 关键词前置拦截 — 看到"看新闻/查新闻/最新消息"就强制 web_search
  const newsSearchRe = /看新闻|查新闻|搜新闻|最新消息|今天.*新闻|有什么新闻|新闻.*今天/;
  if (newsSearchRe.test(message) && route.mode !== 'conversation') {
    route.capabilities = ['web_search'];
    console.log('[agent-buddy-action] 关键词命中 web_search, 强制覆盖路由');
  }
  // v0.73: "生成X然后发邮件"关键词拦截 — 强制 conversational_action + image_generation + email_send
  const emailAfterRe = /然后发邮件|再发邮件|发邮件给我|发邮件到|发邮件至|并发送邮件|且发邮件/;
  if (emailAfterRe.test(message) && (route.capabilities.includes('image_generation') || /生成|画|创作/.test(message))) {
    route.mode = 'conversational_action';
    if (!route.capabilities.includes('image_generation')) route.capabilities.push('image_generation');
    if (!route.capabilities.includes('email_send')) route.capabilities.push('email_send');
    if (!route.capabilities.includes('email_draft')) route.capabilities.push('email_draft');
    route.requires_confirmation = true;
    console.log('[agent-buddy-action] 关键词命中 生成+发邮件, 强制 conversational_action');
  }
  // v0.79: URL 检测 — 用户消息含完整 http(s) URL 时强制 web_fetch（直接抓取而非搜索）
  //   注意：即使用户消息被 LLM 分类为 conversation，只要含 URL 就强制 web_fetch
  const urlRe = /https?:\/\/[^\s<>"')\],;]+/;
  if (urlRe.test(message)) {
    if (route.mode === 'conversation') {
      route.mode = 'single_action';
      route.confidence = 0.95;
    }
    if (!route.capabilities.includes('web_fetch')) route.capabilities.push('web_fetch');
    console.log('[agent-buddy-action] URL 命中 web_fetch, 强制覆盖路由');
  }
  // v0.88: 关键词前置拦截 — 代码执行意图（改代码/修bug/实现功能/读文件/跑命令）
  //   code_execution 意图 = 需要在项目 workspace 里读写文件/跑命令/git
  //   命中后把 code_execution 加进 capabilities（不覆盖已有，可叠加 web_search 等）
  const codeExecRe = /改代码|写代码|修[一这]?[个]?bug|修[一这]?[个]?缺陷|实现[一这]?[个]?功能|新增.*功能|读文件|看.*代码|跑[个一]?命令|执行命令|调试|查看项目|改文件|写文件|重构|代码审查|看下.*代码/;
  if (codeExecRe.test(message) && !route.capabilities.includes('code_execution')) {
    if (route.mode === 'conversation') {
      route.mode = 'single_action';
      route.confidence = 0.9;
    }
    route.capabilities.push('code_execution');
    console.log('[agent-buddy-action] 关键词命中 code_execution, 强制覆盖路由');
  }
  return route;
}

function getActionToolNames(route, baseTools) {
  const tools = new Set(baseTools || []);
  if (route.mode === 'conversational_action') {
    // v0.73: 复合动作只给 plan_execute，清掉所有基础工具
    tools.clear();
    tools.add('plan_execute');
  } else if (route.mode === 'single_action') {
    // v0.75: 清空所有基础工具，只保留这个 capability 需要的工具（结构性强制）
    tools.clear();
    route.capabilities.forEach(capability => {
      if (capability === 'image_generation') tools.add('generate_image');
      if (capability === 'music_playback') tools.add('play_music');
      if (capability === 'email_send' || capability === 'email_draft') tools.add('send_email');
      if (capability === 'web_research') { tools.add('web_search'); tools.add('web_research'); }
      if (capability === 'web_search') { tools.add('web_search'); tools.add('fetch_url'); }
      // v0.87: web_search 同时注入 fetch_url —— 搜索返回内容链接（公众号/微博）而
      //   不含结构化数据（价格/行情/参数）时，LLM 可无缝衔接 fetch_url 直接抓数据源网站
      //   （新浪财经/汽车之家/贝壳等），而不是建议用户自己去看
      if (capability === 'document_generation') tools.add('document_gen');
      if (capability === 'image_search') { tools.delete('generate_image'); tools.add('web_search'); }
      if (capability === 'project_create') { tools.add('create_project'); tools.add('list_projects'); }
      if (capability === 'web_fetch') { tools.add('fetch_url'); }
      // v0.88: code_execution —— 注入代码执行池（读/写/跑命令/git）
      //   从 listPool 取真实注册的工具（防 P81/P97 漏 require 复发）
      if (capability === 'code_execution') {
        require('../services/tool-registry').listPool('code_execution').forEach(function(n) { tools.add(n); });
        // 委派通道：小吉可把子任务派给专业子 agent（Orchestrator-Worker）
        tools.add('delegate_subtasks');
      }
    });
  }
  return [...tools];
}

// 装睡防御硬约束 — single/conversational 两段共用（避免重复 ~600 字符）
const STALL_HARD_CONSTRAINTS = `
【装睡防御硬约束】
- 严重警告：回复中只有文字描述不调工具 = 装睡，系统强制重试；必须实际调用工具，不能只说"已提交""请等待"
- 生成图片时用户给了描述就直接调，严禁反问风格；AI 自行补充细节或默认值
- 找歌/搜歌只能调 play_music，不能调 generate_image 或其他创作工具
- 区分："找图片"/"搜图片"=搜真实照片（用 web_search + image_search=true），不是 AI 生图（用 generate_image）
- ⚠️ 说=做：提到工具名（web_search/generate_image/send_email/play_music/query_collection）必须同时调 tool_call，否则系统重提示强制执行
- ⚠️ 首轮必须调：严禁先回复文字再调，任务需要工具时首轮直接调
- ⚠️ 结果导向：web_search 调用后立即基于结果撰写；若不含具体数据（价格/行情/参数）可再调 1 次 web_search 定位数据源 URL（如"XX价格 官网/查询"），然后用 fetch_url 抓取；严禁第 3 次调 web_search
- ⚠️ 禁止循环：web_search 最多 2 次（1 次搜数据 + 1 次定位数据源 URL），第 3 次系统强制终止`;

function buildActionPrompt(route) {
  if (route.mode === 'conversation') return '';
  const shared = `

【小吉动作路由】
- 执行模式：${route.mode}
- 所需能力：${route.capabilities.join(', ') || 'none'}
- 路由置信度：${route.confidence}
- 路由原因：${route.reason || '用户明确要求执行动作'}
- 当前 reqId 是小吉隐藏动作容器，可安全用于 generate_image / plan_execute / send_email。`;
  if (route.mode === 'conversational_action') {
    return shared + `
【复合聊天动作】必须调用 plan_execute 一次完成全部步骤，不要逐个直接调用，也不要输出"正在做"而不调工具。
- 示例：s1 generate_image；s2 send_email depends_on=["s1"]。s2 不手填 file_ids，系统会从 s1 精确注入附件。
- send_email 只创建 pending_send_email 预览，不会真正发送；必须等待用户确认后才发送，严禁声称"邮件已发送"。` + STALL_HARD_CONSTRAINTS + `
`;
  }
  return shared + `
【单一动作】必须调用对应工具一次。若是 send_email，工具只准备预览并等待确认，严禁声称已发送。` + STALL_HARD_CONSTRAINTS + `
`;
}

function snapshotActionState(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  let plan = null;
  try { plan = JSON.parse(req.plan || 'null'); } catch (_) {}
  return {
    requirementId,
    planStatus: req.plan_status || '',
    plan,
    assistImage: safeJson(req.assist_image),
    assistImageSearch: safeJson(req.assist_image_search),
    assistMusic: safeJson(req.assist_music),
    assistEmail: safeJson(req.assist_send_email),
    pendingEmail: getLatestPendingEmail(req),
  };
}

function getLatestPendingEmail(req) {
  let history = [];
  try { history = JSON.parse(req && req.supplement_history || '[]'); } catch (_) {}
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (!entry || entry.source !== 'send_email_pending') continue;
    const card = safeJson(entry.text);
    if (card && card.type === 'pending_send_email') return card;
  }
  return null;
}

function safeJson(value) {
  try { return JSON.parse(value || 'null'); } catch (_) { return null; }
}

module.exports = {
  ensureActionProject,
  getOrCreateActionRequirement,
  routeMessage,
  getActionToolNames,
  buildActionPrompt,
  snapshotActionState,
  normalizeRoute,
  extractJson,
};
