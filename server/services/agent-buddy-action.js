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
  const key = `buddy_action_req:${userId || 'anonymous'}`;

  // v0.101 (2026-08-19): 每次动作新建容器，不复用。
  //   v0.100 复用闲置容器（buddy_action_req 指向的旧容器）导致前端卡片 id = ap-action-<reqId>
  //   复用历史位置的卡片 DOM → 新动作内容渲染到聊天流上方旧卡片，不直观（多多反馈）。
  //   现在：每次动作一个独立 requirement → 前端每次 append 新卡片到消息流底部（聊天向下）。
  //   垃圾治理改用「容量清理」：每 user 保留最近 5 条小吉动作容器，更旧的删除（见 cleanupOldActionReqs）。
  //   注意：不能复用旧容器还有一个原因——旧容器里 assist_music/assist_image 等字段是历史残留，
  //   工具 handler 读到的状态永远滞后（如 play_music 历史 done 状态拦截新歌请求）。

  const requirement = reqStore.create({
    projectId: project.id,
    title: `小吉即时动作 · ${userId || 'anonymous'}`,
    description: '小吉生成图片、文档、邮件等即时聊天动作的隐藏运行容器。',
    createdBy: userId || 'system',
    status: 'idea',
    role: 'system',
  });
  reqStore.update(requirement.id, { chat_mode: 'free', system_record: 1 });

  const value = JSON.stringify(requirement.id);
  const mem = collection('buddy_memory').findOne(m => m.user_id === (userId || 'anonymous') && m.key === key);
  if (mem) collection('buddy_memory').update(m => m.user_id === (userId || 'anonymous') && m.key === key, { value, updated_at: new Date().toISOString() });
  else collection('buddy_memory').insert({ user_id: userId || 'anonymous', key, value, updated_at: new Date().toISOString() });

  cleanupOldActionReqs(userId, requirement.id);
  return reqStore.getById(requirement.id);
}

// v0.101: 容量清理 — 每 user 保留最近 MAX_KEEP 条小吉动作容器，更旧的删除。
//   替代 v0.100 的「复用容器」策略：既防止 requirements 表被小吉动作垃圾占满，
//   又保证每次动作有独立容器（前端卡片位置正确、工具状态无历史残留）。
const MAX_KEEP_ACTION_REQS = 5;
function cleanupOldActionReqs(userId, keepId) {
  try {
    const { collection } = require('../db/connection');
    const all = collection('requirements').find(r =>
      r.system_record === 1 && r.status === 'idea'
      && (r.title || '').indexOf('小吉即时动作') === 0
      && r.created_by === (userId || 'system')
    );
    // 按创建时间倒序，保留最近 MAX_KEEP 条（含刚新建的 keepId）
    const sorted = all.slice().sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return tb - ta;
    });
    // 只清理「已经闲置超过 30 分钟」的旧容器：刚建的可能还在被前端轮询/工具异步写入
    const now = Date.now();
    const stale = sorted.slice(MAX_KEEP_ACTION_REQS).filter(r => {
      if (r.id === keepId) return false;
      const ageMs = now - new Date(r.created_at || 0).getTime();
      return ageMs > 30 * 60 * 1000;
    });
    for (const r of stale) {
      collection('requirements').remove(x => x.id === r.id);
      console.log(`[agent-buddy-action] 清理旧动作容器 ${r.id} (user=${userId}, age=${Math.round((now - new Date(r.created_at || 0).getTime()) / 60000)}min)`);
    }
  } catch (e) {
    console.warn('[agent-buddy-action] cleanupOldActionReqs 失败（可忽略）:', e.message);
  }
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
  // v0.94 (P5): 加 office_edit —— 修改已打开的 Office 文档（Word/Excel/PPT）
  const capabilities = Array.isArray(value.capabilities)
    ? value.capabilities.filter(x => ['image_generation', 'image_search', 'music_playback', 'email_draft', 'email_send', 'web_search', 'web_research', 'document_generation', 'project_create', 'create_task', 'web_fetch', 'code_execution', 'video_generation', 'office_edit'].includes(x))
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

async function routeMessage(modelId, message, history = [], ctx = {}) {
  const historyText = (history || []).slice(-4).map(h => `${h.role}: ${String(h.text || '').slice(0, 180)}`).join('\\n');
  // v0.96.2 (P138 修复 + office_edit 语义): 注入当前前端视图/打开的文件名，让 router 能区分
  //   「在打开的 Word 里写」（office_edit）vs 「生成新文档」（document_generation）
  const currentView = String(ctx.currentView || '').trim();
  const openFileName = String(ctx.fileName || ctx.openFileName || '').trim();
  const officeEditHint = (currentView && /office[-_]v3[-_](word|excel|xlsx|slides|pptx|ppt)/i.test(currentView))
    ? `\n【关键上下文】当前前端打开了 ${currentView}${openFileName ? '（文件：' + openFileName + '）' : ''}。\n` +
      `- 用户说「写/创作/生成/加 + 内容/作文/文章/段落/章节 + （在文档里/到文档/给文档）」或任何涉及**该文档**的写作/追加/补全意图 → capabilities 必须包含 office_edit（不要归类为 document_generation）。\n` +
      `- 用户只说「写一篇 XXX」无明确文档词，但当前已打开了该类文档（word/word-ui → Word），意图是在文档里写 → office_edit；只在**没有任何文档打开**时才归 document_generation。\n` +
      `- 用户明确说「生成新文档/导出/新建文件」且没指明要写进打开的文档 → document_generation。\n`
    : '';
  const system = `你是 ACMS 小吉的动作路由器。只做分类，不调用工具，不制定开发计划。
输出严格 JSON：
{"mode":"conversation|single_action|conversational_action","confidence":0.0,"capabilities":[],"requires_confirmation":false,"reason":"..."}
- 能力枚举：image_generation、image_search、music_playback、email_draft、email_send、web_search、web_research、document_generation、project_create、create_task、web_fetch、code_execution、video_generation、office_edit、office_open、view_navigation、window_control。
${officeEditHint}规则：
- 纯问答/查询 ACMS 数据/闲聊 → conversation。
  - **v1.0 (P5) 闲聊识别强化**: 含「你/小吉 + 疑问词」(如「你明天有啥打算」「小吉你干啥呢」「你最喜欢啥」「你是谁」「你能干啥」)的 query → **必 conversation**,不要猜工具意图。主语是"你/小吉"且问 AI 自己的偏好/状态/计划 = 闲聊。
  - **例外**: 「你帮...」+ 明确动词（找/搜/听/生成/打开...）是真实工具意图,不算闲聊。
  - 一个明确工具动作 → single_action。
- 两个及以上有依赖的动作（如生成图片后发邮件）→ conversational_action。
- send email 是外部副作用，必须包含 email_draft + email_send，requires_confirmation=true。
- 用户描述简短但动作明确时照常分类，不要因为缺少主题、数量等默认参数判无法理解。
- **重要：mode 为 single_action 或 conversational_action 时，必须根据用户意图将相关能力填入 capabilities 数组，不要留空。**
- **找图片/搜图片/查图片→ capabilities 含 image_search。生成图片/画图片/创作图片→ capabilities 含 image_generation。两者不同。**
- **创建项目/新建项目→ capabilities 含 project_create。**
- **创建任务/新建任务/加个任务/添加任务 → capabilities 含 create_task（注意区分：创建项目是 project_create，创建任务/看板任务是 create_task）。**
- **用户消息包含 http/https URL 时，必须分类为 single_action 并填入 web_fetch 能力（抓取网页内容），不要分类为 conversation。**
- **用户说"看新闻"/"查新闻"/"搜新闻"/"最新消息"/"今天有什么新闻"等→ capabilities 含 web_search。**
- **v0.88 用户要求改代码/写代码/修bug/实现功能/读文件/跑命令/查看项目代码/调试 等代码执行意图 → capabilities 含 code_execution。**
- **v1.0 (P3-A) 用户问"我有什么偏好/之前聊过什么/我学了什么/最近操作"等记忆类查询 → capabilities 含 retrieve_memory (内部走 retrieve_memory 工具)。**
- **v1.0 (P4-A) 用户问"我在哪个项目/项目里有多少需求/系统配置/近期事件"等上下文类查询 → capabilities 含 query_project_context (内部走 query_project_context 工具)。**`;
  const result = await callLLM(modelId, [
    { role: 'system', content: system },
    ...(historyText ? [{ role: 'user', content: `最近对话：\\n${historyText}` }] : []),
    { role: 'user', content: message },
  ], { maxTokens: 350, temperature: 0, caller: 'agent-buddy-action-router' });
  const content = typeof result === 'string' ? result : (result && result.content) || '';
  const route = normalizeRoute(extractJson(content));
// v1.0 (Phase 5-B): 闲聊兜底关键词拦截 — 含「你/小吉 + 疑问词」的 query 强降级 conversation
  //   治「你明天有啥打算」「小吉你干啥呢」「你最喜欢啥」类被 router 误判成工具动作
  //   允许中间插入最多 5 个字 (如「你最喜欢」「你明天想去」「你想听」)
  //   注意: 「你想听...」「你帮我...」是真实意图,不算闲聊 — 加 ! 你想/帮我 否定
  const chatRe = /(?:你|小吉)\s*.{0,5}?(?:有啥|有[什么啥]|干什么|干嘛|干啥|咋了|咋|怎么|为什么|喜欢|觉得|会|能|是.*吗|是啥|是谁)/;
  // 例外: 「你想听...」「你帮我...」是真实工具意图
  const notChatRe = /你.*帮.*(找|搜|查|听|做|打开|生成|画|写|改|创建)|你.*想.*(听|看|搜|找|生成)/;
  if (chatRe.test(message) && !notChatRe.test(message) && route.mode !== 'conversation') {
    console.log(`[agent-buddy-action] 闲聊兜底命中: "${message.slice(0, 30)}..." → 降级 conversation`);
    route.mode = 'conversation';
    route.capabilities = [];
    route.confidence = 0.9;
  }
  // v0.66: 关键词前置拦截 — 不管路由器 LLM 怎么分类，看到"找图片"就强制 image_search
  // v1.0 (Phase 5-A): 扩展正则覆盖「找...图片」「找美女图片」「搜点图」等松散表达
  //   必须含"图/图片/照片/壁纸/头像/海报"等图片关键词,避免误命中闲聊
  const searchImgRe = /找.*图|搜.*图|找.*图片|搜.*图片|找.*照片|搜.*照片|找.*壁纸|搜.*壁纸|找.*头像|搜.*头像|找.*海报|搜.*海报|查.*图|查.*图片|图片.*搜索|搜[些点张]\s*图/i;
  if (searchImgRe.test(message)) {
    if (route.mode === 'conversation') {
      route.mode = 'single_action';
      route.confidence = 0.85;
    }
    if (!route.capabilities.includes('image_search')) route.capabilities.push('image_search');
    if (!route.capabilities.includes('web_search')) route.capabilities.push('web_search');
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
  // v1.0 (Phase 2-B): office_open 关键词拦截 — 「打开Word/Excel/PPT」「打开文档」类
  //   治 mt049ys1 「帮我打开Word」 类 router 误判为 conversation（无 open_view 工具）
  const officeOpenRe = /打开.*(?:Word|Excel|PPT|PowerPoint|文档|表格|演示)|新建.*(?:Word|Excel|PPT|文档)|创建.*(?:Word|Excel|PPT)/i;
  if (officeOpenRe.test(message)) {
    if (route.mode === 'conversation') {
      route.mode = 'single_action';
      route.confidence = 0.9;
    }
    if (!route.capabilities.includes('office_open')) route.capabilities.push('office_open');
    console.log('[agent-buddy-action] 关键词命中 office_open, 强制覆盖路由');
  }
  // v1.0 (Phase 2-B): view_navigation 关键词拦截 — 「打开看板/需求/缺陷/dashboard/项目详情」等视图
  //   注意: office_open (打开Word/Excel/PPT) 优先级更高,先命中 office_open 就不命中 view_navigation
  const viewNavRe = /(?:打开|进入|进去|切到|切换到|跳到|转到|进\s*入|进\s*去|看[一这]?下|看[一这]?眼|查[一这]?下|看看)\s*(?:看板|kanban|需求(?:列表|池)?|requirements|缺陷|bugs?|任务|tasks|仪表[盘台]|dashboard|项目详情|详情页|聊天|chat|admin|管理|项目管理|项目列表)/i;
  if (viewNavRe.test(message) && !route.capabilities.includes('view_navigation') && !route.capabilities.includes('office_open')) {
    if (route.mode === 'conversation') {
      route.mode = 'single_action';
      route.confidence = 0.85;
    }
    route.capabilities.push('view_navigation');
    console.log('[agent-buddy-action] 关键词命中 view_navigation, 强制覆盖路由');
  }
  // v1.0 (Phase 4-A): query_project_context 关键词拦截 — 「我在哪个项目/项目里有多少需求/系统配置/近期事件」
  //   治 P3/P4 工具暴露但 router 没主动选的问题
  const projectCtxRe = /(我.*项目|项目.*需求|系统配置|近期事件|最近.*事件|我.*哪个项目|哪些项目|项目.*成员|项目.*状态)/;
  if (projectCtxRe.test(message)) {
    if (route.mode === 'conversation') {
      route.mode = 'single_action';
      route.confidence = 0.85;
    }
    if (!route.capabilities.includes('query_project_context')) route.capabilities.push('query_project_context');
    console.log('[agent-buddy-action] 关键词命中 query_project_context, 强制覆盖路由');
  }
  // v1.0 (Phase 3-A): retrieve_memory 关键词拦截 — 「我有什么偏好/之前聊过什么/学了什么/最近操作」
  const memoryRe = /(我.*偏好|我.*学|之前.*聊|以前.*聊|之前.*对话|历史.*对话|我.*记什么|记.*什么|我的.*记忆|最近.*操作|之前.*教)/;
  if (memoryRe.test(message)) {
    if (route.mode === 'conversation') {
      route.mode = 'single_action';
      route.confidence = 0.85;
    }
    if (!route.capabilities.includes('retrieve_memory')) route.capabilities.push('retrieve_memory');
    console.log('[agent-buddy-action] 关键词命中 retrieve_memory, 强制覆盖路由');
  }
  // video_generation 关键词拦截 — 用户说"生成视频"/"做一个视频"/"画一段视频"等
  const videoGenRe = /生成.*视频|做.*视频|画.*视频|创作.*视频|帮我.*视频|给我.*视频|视频.*生成|拍.*视频/;
  if (videoGenRe.test(message) && !route.capabilities.includes('video_generation')) {
    if (route.mode === 'conversation') {
      route.mode = 'single_action';
      route.confidence = 0.9;
    }
    route.capabilities.push('video_generation');
    console.log('[agent-buddy-action] 关键词命中 video_generation, 强制覆盖路由');
  }
  // v0.94 (P5): 关键词前置拦截 — 修改已打开 Office 文档意图（改/编辑 Word/Excel/PPT）
  //   与 document_generation 区分：生成新文档不命中；"改/编辑/调整 + 文档类型词"命中
  const officeEditRe = /(改|编辑|调整|修改|更新|把).*(文档|word|excel|表格|xlsx|ppt|幻灯片|演示文稿|演示文件|文件里的|文件内)/;
  const officeEditRe2 = /(文档|表格|幻灯片|演示文稿).*(改成|改为|加上|删除|更新|修改|更新为|改成)/;
  if ((officeEditRe.test(message) || officeEditRe2.test(message)) && !route.capabilities.includes('office_edit')) {
    if (route.mode === 'conversation') {
      route.mode = 'single_action';
      route.confidence = 0.9;
    }
    route.capabilities.push('office_edit');
    console.log('[agent-buddy-action] 关键词命中 office_edit, 强制覆盖路由');
  }
  // v0.96.2 (P138 修复): 当前已打开 Office 文档 + 用户说「写/创作/生成/做 + 作文/文章/内容/段落/章节/...
  //   标题/简介/总结/描述」 → office_edit（不是 document_generation）。
  //   v0.96 之前: 「帮我写一篇春天的作文」被归到 document_generation → 生成新 .docx 附件而非写进打开的 Word。
  //   触发条件: 当前前端打开 office 视图（currentView 来自 ctx）+ 消息含「写作动词 + 写作名词」组合。
  const isOfficeView = currentView && /office[-_]v3[-_]?(word|excel|xlsx|slides|pptx|ppt)?/i.test(currentView);
  const writeVerbRe = /写|创作|起草|拟|编|生成|做|产出|补充|加(一段|一篇|一些|几段|一个)|续写|扩写|改写/;
  const writeNounRe = /作文|文章|内容|段落|章节|标题|简介|介绍|总结|描述|文案|报告|总结|读后感|日记|小说|诗歌|故事|脚本|大纲|提纲/;
  if (isOfficeView && writeVerbRe.test(message) && writeNounRe.test(message) && !route.capabilities.includes('office_edit')) {
    if (route.mode === 'conversation') {
      route.mode = 'single_action';
      route.confidence = 0.92;
    }
    route.capabilities.push('office_edit');
    // 如果 router 误归到 document_generation，移除去重（避免 document_gen tool 跑）
    const idx = route.capabilities.indexOf('document_generation');
    if (idx >= 0) route.capabilities.splice(idx, 1);
    console.log('[agent-buddy-action] 关键上下文+写作动词命中 office_edit, 强制覆盖路由（移除 document_generation）');
  }
  return route;
}

// v1.0 (Phase 1-A): conversation 模式只留 L0 元工具，避免 LLM 面对 37 个工具乱选
//   L0 元工具清单：get_my_profile(查自己) / buddy_memory_write(记偏好)
//                  _expand_tools(主动扩载) / buddy_skill(查/加载技能)
//                  retrieve_memory(查长期记忆: 用户偏好/历史/技能/最近操作)
//                  query_project_context(查项目/系统/用户上下文)
// v1.0 (Phase 3-A): + retrieve_memory (Memory retrieve 化)
// v1.0 (Phase 4-A): + query_project_context (项目 context retrieve 化)
//   LLM 真要做事 → 主动调 _expand_tools 加载对应类别，或调 get_my_profile 查上下文
//   治 trace 失败模式 80%：37 工具 + 首轮强制调 → LLM 乱选 → 装睡/stall
const CONVERSATION_L0_TOOLS = ['get_my_profile', 'buddy_memory_write', '_expand_tools', 'buddy_skill', 'retrieve_memory', 'query_project_context'];

function getActionToolNames(route, baseTools) {
  const tools = new Set(baseTools || []);
  if (route.mode === 'conversation') {
    // v1.0: 闲聊模式清空 baseTools，只留元工具
    tools.clear();
    CONVERSATION_L0_TOOLS.forEach(n => tools.add(n));
  } else if (route.mode === 'conversational_action') {
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
      if (capability === 'video_generation') { tools.add('play_video'); tools.add('agnes_generate_video'); tools.add('agnes_query_video'); }
      if (capability === 'image_search') { tools.delete('generate_image'); tools.add('web_search'); }
      if (capability === 'project_create') { tools.add('create_project'); tools.add('list_projects'); }
      // v0.100 (2026-08-18): create_task 补映射 —— 白名单/关键词拦截有但映射表漏了，
      //   导致「创建任务」路由到 single_action 后工具列表为空，小吉只能反问无法真建
      //   注入 list_projects：create_task 需要 projectId，LLM 可先查项目再建
      if (capability === 'create_task') { tools.add('create_task'); tools.add('list_projects'); }
      if (capability === 'web_fetch') { tools.add('fetch_url'); }
      // v1.0 (Phase 2-B): office_open / view_navigation / window_control
      //   治 mt049ys1 「帮我打开Word」 类 router 误判为 conversation（无 open_view 工具）
      if (capability === 'office_open') { tools.add('open_view'); tools.add('highlight_element'); }
      if (capability === 'view_navigation') { tools.add('open_view'); }
      if (capability === 'window_control') { tools.add('close_window'); tools.add('highlight_element'); }
      // v1.0 (Phase 3-A): retrieve_memory — 记忆类查询
      if (capability === 'retrieve_memory') { tools.add('retrieve_memory'); }
      // v1.0 (Phase 4-A): query_project_context — 项目/系统 context 查询
      if (capability === 'query_project_context') { tools.add('query_project_context'); }
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
- ⚠️ 说=做：提到工具名（web_search/generate_image/send_email/play_music/query_collection/play_video/agnes_generate_video）必须同时调 tool_call，否则系统重提示强制执行
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
- 当前 reqId 是小吉隐藏动作容器，可安全用于 generate_image / plan_execute / send_email / play_video。`;
  if (route.mode === 'conversational_action') {
    return shared + `
【复合聊天动作】必须调用 plan_execute 一次完成全部步骤，不要逐个直接调用，也不要输出"正在做"而不调工具。
- 示例：s1 generate_image；s2 send_email depends_on=["s1"]。s2 不手填 file_ids，系统会从 s1 精确注入附件。
- send_email 只创建 pending_send_email 预览，不会真正发送；必须等待用户确认后才发送，严禁声称"邮件已发送"。` + STALL_HARD_CONSTRAINTS + `
`;
  }
return shared + `
【单一动作】必须调用对应工具一次。若是 send_email，工具只准备预览并等待确认，严禁声称已发送。` + STALL_HARD_CONSTRAINTS + (route.capabilities.includes('image_search')
    ? `

【图片搜索】image_search capability 调 web_search 时**必须传 image_search=true 参数**（直接走百度图片搜索，返回图片结果），不要走文字 web_search。示例：web_search({query: "用户原话里的图片关键词", image_search: true, max_results: 9})。`
    : '') + `
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
