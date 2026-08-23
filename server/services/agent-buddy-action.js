// 小吉 conversational-action 运行时
// 为即时聊天动作提供真实 requirement 容器，并用规则路由复合动作。
// v0.116: 路由从 LLM 分类改为纯规则（工具调用已全权交给 Qwen Code，
//   路由 LLM 与 Qwen 能力重叠且分类不可靠需大量正则兜底，纯属固定成本）。

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

// v0.116: 纯规则路由（2026-08-23）—— 移除 LLM 分类调用。
//   背景：工具调用已全权交给 Qwen Code（conversation + web_search/web_fetch/code_execution 全走 Qwen），
//   路由 LLM（default_gen_model）先分类一次与 Qwen 能力重叠、且分类不可靠需要 15+ 条正则兜底修正，
//   纯属每次聊天的固定成本（延迟 + token + 故障点）。
//   现在：能力正则直接得出 mode + capabilities；未命中任何能力 → conversation（走 Qwen）。
//   保留 modelId/history 参数仅为调用方兼容，不再使用。
async function routeMessage(modelId, message, history = [], ctx = {}) {
  const currentView = String(ctx.currentView || '').trim();
  const openFileName = String(ctx.fileName || ctx.openFileName || '').trim();
  // v0.96.2 (P138 修复 + office_edit 语义): 当前前端打开的 office 视图
  //   「在打开的 Word 里写」（office_edit）vs 「生成新文档」（document_generation）
  const isOfficeView = currentView && /office[-_]v3[-_]?(word|excel|xlsx|slides|pptx|ppt)?/i.test(currentView);

  const caps = new Set();
  const mark = (cap) => caps.add(cap);

  // ── 能力正则（命中即加入 capabilities；mode 最后统一计算）──
  // 图片搜索：找图/搜图（区别于生成）
  const searchImgRe = /找.*图|搜.*图|找.*图片|搜.*图片|找.*照片|搜.*照片|找.*壁纸|搜.*壁纸|找.*头像|搜.*头像|找.*海报|搜.*海报|查.*图|查.*图片|图片.*搜索|搜[些点张]\s*图/i;
  if (searchImgRe.test(message)) { mark('image_search'); console.log('[agent-buddy-action] 关键词命中 image_search'); }
  // 图片生成：画/生成图（补：原依赖 LLM 分类）
  const imageGenRe = /生成.{0,6}(图片|照片|图|海报|封面)|画.{0,3}(张|个|幅|一)|帮我画|画一?张|做[一一张]?图|做.{0,3}(图|海报)|配图|创作.{0,4}图|设计.{0,4}(海报|图|封面)/;
  if (imageGenRe.test(message)) { mark('image_generation'); console.log('[agent-buddy-action] 关键词命中 image_generation'); }
  // 创建项目（覆盖式：命中即清掉查询类误命中，如「我.*项目」）
  const createProjectRe = /创.*项目|项目.*创|新建.*项目|新建.*叫|帮我建.*项目/;
  if (createProjectRe.test(message)) { caps.clear(); mark('project_create'); console.log('[agent-buddy-action] 关键词命中 project_create, 强制覆盖路由'); }
  // 创建任务
  const createTaskRe = /创.*任务|任务.*创建|建.*任务|新建.*任务/;
  if (createTaskRe.test(message)) { mark('create_task'); console.log('[agent-buddy-action] 关键词命中 create_task'); }
  // 新闻/搜索
  const newsSearchRe = /看新闻|查新闻|搜新闻|最新消息|今天.*新闻|有什么新闻|新闻.*今天/;
  if (newsSearchRe.test(message)) { mark('web_search'); console.log('[agent-buddy-action] 关键词命中 web_search'); }
  // 调研（补：原依赖 LLM 分类）
  const researchRe = /调研|查资料|搜集.*资料|研究一下|综合分析/;
  if (researchRe.test(message)) { mark('web_research'); console.log('[agent-buddy-action] 关键词命中 web_research'); }
  // 音乐播放（补：原依赖 LLM 分类）
  const musicRe = /播放|听[一这]?首|放[一这]?首|想听|找歌|听歌|唱歌|音乐|点一首/;
  if (musicRe.test(message)) { mark('music_playback'); console.log('[agent-buddy-action] 关键词命中 music_playback'); }
  // 视频生成
  const videoGenRe = /生成.*视频|做.*视频|画.*视频|创作.*视频|帮我.*视频|给我.*视频|视频.*生成|拍.*视频|跳舞|跳[个一]?舞/;
  if (videoGenRe.test(message)) { mark('video_generation'); console.log('[agent-buddy-action] 关键词命中 video_generation'); }
  // 文档生成（补：原依赖 LLM 分类；与打开/编辑区分）
  const docGenRe = /写.{0,4}(周报|报告|总结|方案|文档)|生成.{0,6}(周报|报告|总结|方案|文档)|做.{0,4}(周报|报告|总结|方案)|新建.*文档|制作.*文档|word文档|docx|pptx|excel|xlsx/;
  if (docGenRe.test(message)) { mark('document_generation'); console.log('[agent-buddy-action] 关键词命中 document_generation'); }
  // 发邮件
  const emailSendRe = /发邮件|发送邮件|邮件发给|发个邮件|写封邮件|发一封|发邮件给|邮件发送/;
  if (emailSendRe.test(message)) { mark('email_send'); console.log('[agent-buddy-action] 关键词命中 email_send'); }
  // 复合：生成X然后发邮件 → 强制 conversational_action（前段有动作词才算复合意图）
  const emailAfterRe = /然后发邮件|再发邮件|发邮件给我|发邮件到|发邮件至|并发送邮件|且发邮件/;
  let emailAfterHit = false;
  if (emailAfterRe.test(message) && /生成|画|创作|做|写|总结|整理|查|搜|设计/.test(message)) {
    emailAfterHit = true;
    mark('email_send'); mark('email_draft');
    if (/生成|画|创作|做|设计/.test(message)) mark('image_generation');
    console.log('[agent-buddy-action] 关键词命中 生成+发邮件, 强制 conversational_action');
  }
  // URL → web_fetch（直接抓取而非搜索）
  const urlRe = /https?:\/\/[^\s<>"')\],;]+/;
  if (urlRe.test(message)) { mark('web_fetch'); console.log('[agent-buddy-action] URL 命中 web_fetch'); }
  // 代码执行
  const codeExecRe = /改代码|写代码|修[一这]?[个]?bug|修[一这]?[个]?缺陷|实现[一这]?[个]?功能|新增.*功能|读文件|看.*代码|跑[个一]?命令|执行命令|调试|查看项目|改文件|写文件|重构|代码审查|看下.*代码/;
  if (codeExecRe.test(message)) { mark('code_execution'); console.log('[agent-buddy-action] 关键词命中 code_execution'); }
  // Office 打开（优先级高于 document_generation：打开/新建文档 ≠ 生成文档）
  const officeOpenRe = /打开.*(?:Word|Excel|PPT|PowerPoint|文档|表格|演示)|新建.*(?:Word|Excel|PPT|文档)|创建.*(?:Word|Excel|PPT)/i;
  if (officeOpenRe.test(message)) {
    mark('office_open');
    caps.delete('document_generation');
    console.log('[agent-buddy-action] 关键词命中 office_open, 强制覆盖路由');
  }
  // 视图导航（office_open 已命中则不加）
  const viewNavRe = /(?:打开|进入|进去|切到|切换到|跳到|转到|进\s*入|进\s*去|看[一这]?下|看[一这]?眼|查[一这]?下|看看)\s*(?:看板|kanban|需求(?:列表|池)?|requirements|缺陷|bugs?|任务|tasks|仪表[盘台]|dashboard|项目详情|详情页|聊天|chat|admin|管理|项目管理|项目列表)/i;
  if (viewNavRe.test(message) && !caps.has('view_navigation') && !caps.has('office_open')) {
    mark('view_navigation');
    console.log('[agent-buddy-action] 关键词命中 view_navigation');
  }
  // 项目上下文查询（查询语义；创建/任务类意图不叠加，避免「帮我创建个项目」误命中「我.*项目」）
  const projectCtxRe = /(我在.*项目|我.*在.*项目|哪个项目|哪些项目|项目(?:里|中|的).*(需求|任务|成员|状态|进度)|系统配置|近期事件|最近.*事件|项目.*成员|项目.*状态)/;
  if (projectCtxRe.test(message) && !caps.has('project_create') && !caps.has('create_task')) { mark('query_project_context'); console.log('[agent-buddy-action] 关键词命中 query_project_context'); }
  // 记忆查询
  const memoryRe = /(我.*偏好|我.*学|之前.*聊|以前.*聊|之前.*对话|历史.*对话|我.*记什么|记.*什么|我的.*记忆|最近.*操作|之前.*教)/;
  if (memoryRe.test(message)) { mark('retrieve_memory'); console.log('[agent-buddy-action] 关键词命中 retrieve_memory'); }
  // Office 编辑（改文档类，优先级高于 document_generation）
  const officeEditRe = /(改|编辑|调整|修改|更新|把).*(文档|word|excel|表格|xlsx|ppt|幻灯片|演示文稿|演示文件|文件里的|文件内)/;
  const officeEditRe2 = /(文档|表格|幻灯片|演示文稿).*(改成|改为|加上|删除|更新|修改|更新为|改成)/;
  if (officeEditRe.test(message) || officeEditRe2.test(message)) {
    mark('office_edit');
    caps.delete('document_generation');
    console.log('[agent-buddy-action] 关键词命中 office_edit, 强制覆盖路由');
  }
  // Office 编辑（当前已打开 office 视图 + 写作动词/名词组合 → 写进打开的文档）
  const writeVerbRe = /写|创作|起草|拟|编|生成|做|产出|补充|加(一段|一篇|一些|几段|一个)|续写|扩写|改写/;
  const writeNounRe = /作文|文章|内容|段落|章节|标题|简介|介绍|总结|描述|文案|报告|总结|读后感|日记|小说|诗歌|故事|脚本|大纲|提纲/;
  if (isOfficeView && writeVerbRe.test(message) && writeNounRe.test(message)) {
    mark('office_edit');
    caps.delete('document_generation');
    console.log('[agent-buddy-action] 关键上下文+写作动词命中 office_edit, 强制覆盖路由（移除 document_generation）');
  }

  // ── 闲聊兜底：含「你/小吉 + 疑问词」且非「你帮我/你想听」→ 清空能力降级 conversation ──
  const chatRe = /(?:你|小吉)\s*.{0,5}?(?:有啥|有[什么啥]|干什么|干嘛|干啥|咋了|咋|怎么|为什么|喜欢|觉得|会|能|是.*吗|是啥|是谁)/;
  const notChatRe = /你.*帮.*(找|搜|查|听|做|打开|生成|画|写|改|创建)|你.*想.*(听|看|搜|找|生成)/;
  if (chatRe.test(message) && !notChatRe.test(message) && caps.size > 0) {
    console.log(`[agent-buddy-action] 闲聊兜底命中: "${message.slice(0, 30)}..." → 降级 conversation`);
    caps.clear();
  }

  // ── mode 计算 ──
  let mode;
  let confidence;
  if (emailAfterHit) { mode = 'conversational_action'; confidence = 0.9; }
  else if (caps.size >= 2) { mode = 'conversational_action'; confidence = 0.85; }
  else if (caps.size === 1) { mode = 'single_action'; confidence = 0.85; }
  else { mode = 'conversation'; confidence = 0.6; }

  const capabilities = [...caps];
  return {
    mode,
    confidence,
    capabilities,
    requires_confirmation: capabilities.includes('email_send'),
    reason: `纯规则路由：命中 ${capabilities.join(', ') || '无（conversation）'}`,
  };
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
    assistVideo: safeJson(req.assist_video),  // v0.113c: 漏了视频字段 → 前端永远拿不到 video 状态
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
