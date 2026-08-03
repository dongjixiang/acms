// ACMS 工具池元数据（v0.88 — 契约先定，引擎后建）
//
// 设计目标（2026-08-03 多多拍板）：
//   通用任务平台远景下工具会涨到 200+，现在把"工具属于哪个域、什么风险级"
//   作为一次性契约定死，未来新增工具注册时顺手填，避免大规模重构。
//
// 两个导出：
//   POOL_DEFAULTS  — 86 个工具 → { domain, risk } 映射（按工具名索引）
//   POOLS          — 手写池定义（池名 → 工具名数组），引擎后建前的临时实现
//
// domain 能力域：fs / git / exec / web / db / office / acms / media / agent / system / app
// risk  风险级：  read（只读，直接执行）/ write（可逆写入，确认卡）
//                 exec（命令执行，高审）/ restricted（受限，显式批准）
//
// 迁移路径：当工具量 >150 或出现第三方角色需求时，
//   listPool 内部改为动态过滤（registry.tools.filter(t => pool.domain ∈ ...)），
//   本文件 POOLS 手写数组即废弃，POOL_DEFAULTS 保留作为工具元数据。

// ═══════════════════════════════════════════════════════════
// POOL_DEFAULTS — 工具 → { domain, risk }
// ═══════════════════════════════════════════════════════════
const POOL_DEFAULTS = {
  // ── agent/* 文件系统域（fs）──
  'agent_read_file':        { domain: 'fs', risk: 'read' },
  'agent_read_files':       { domain: 'fs', risk: 'read' },
  'agent_read_dir_summary': { domain: 'fs', risk: 'read' },
  'agent_search_files':     { domain: 'fs', risk: 'read' },
  'agent_list_files':       { domain: 'fs', risk: 'read' },
  'agent_write_file':       { domain: 'fs', risk: 'write' },
  'agent_patch_file':       { domain: 'fs', risk: 'write' },
  'agent_multi_patch':      { domain: 'fs', risk: 'write' },
  'workspace_isolate':      { domain: 'fs', risk: 'exec' },
  'workspace_merge':        { domain: 'fs', risk: 'exec' },

  // ── git 域 ──
  'agent_git_status':       { domain: 'git', risk: 'read' },
  'agent_git_log':          { domain: 'git', risk: 'read' },
  'agent_git_branch':       { domain: 'git', risk: 'read' },
  'agent_git_diff':         { domain: 'git', risk: 'read' },
  'agent_git_commit':       { domain: 'git', risk: 'exec' },

  // ── exec 域 ──
  'agent_exec_command':     { domain: 'exec', risk: 'exec' },
  'agent_typescheck':       { domain: 'exec', risk: 'read' },
  'agent_set_phase':        { domain: 'agent', risk: 'write' },
  'agent_plan':             { domain: 'agent', risk: 'write' },
  'delegate_subtasks':      { domain: 'agent', risk: 'exec' },

  // ── web 域 ──
  'web_search':             { domain: 'web', risk: 'read' },
  'web_research':           { domain: 'web', risk: 'read' },
  'fetch_url':              { domain: 'web', risk: 'read' },
  'search_knowledge':       { domain: 'web', risk: 'read' },
  'agent_http_request':     { domain: 'web', risk: 'write' },
  'browser_snapshot':       { domain: 'web', risk: 'read' },
  'browser_console':        { domain: 'web', risk: 'read' },
  'browser_screenshot':     { domain: 'web', risk: 'read' },
  'browser_click':          { domain: 'web', risk: 'write' },
  'browser_type':           { domain: 'web', risk: 'write' },

  // ── db 域 ──
  'agent_db_query':         { domain: 'db', risk: 'restricted' },

  // ── ssh 域（并入 exec）──
  'agent_ssh_check':        { domain: 'exec', risk: 'read' },
  'agent_ssh_execute':      { domain: 'exec', risk: 'restricted' },

  // ── office 域 ──
  'generate_docx':          { domain: 'office', risk: 'write' },
  'generate_xlsx':          { domain: 'office', risk: 'write' },
  'generate_pptx':          { domain: 'office', risk: 'write' },
  'document_edit':          { domain: 'office', risk: 'write' },

  // ── media 域 ──
  'generate_image':         { domain: 'media', risk: 'write' },
  'play_music':             { domain: 'media', risk: 'read' },
  'play_video':             { domain: 'media', risk: 'read' },
  'agnes_generate_video':   { domain: 'media', risk: 'write' },
  'agnes_query_video':      { domain: 'media', risk: 'read' },

  // ── acms 业务域（需求/任务/缺陷/项目/看板/用户）──
  'query_collection':       { domain: 'acms', risk: 'read' },
  'list_requirements':      { domain: 'acms', risk: 'read' },
  'search_requirements':    { domain: 'acms', risk: 'read' },
  'get_requirement_detail': { domain: 'acms', risk: 'read' },
  'create_requirement':     { domain: 'acms', risk: 'write' },
  'update_requirement':     { domain: 'acms', risk: 'write' },
  'approve_requirement':    { domain: 'acms', risk: 'write' },
  'reject_requirement':     { domain: 'acms', risk: 'write' },
  'add_clarification':      { domain: 'acms', risk: 'write' },
  'list_my_tasks':          { domain: 'acms', risk: 'read' },
  'list_board_tasks':       { domain: 'acms', risk: 'read' },
  'search_tasks':           { domain: 'acms', risk: 'read' },
  'create_task':            { domain: 'acms', risk: 'write' },
  'claim_task':             { domain: 'acms', risk: 'write' },
  'update_task_status':     { domain: 'acms', risk: 'write' },
  'update_task_progress':   { domain: 'acms', risk: 'write' },
  'submit_task':            { domain: 'acms', risk: 'write' },
  'list_bugs':              { domain: 'acms', risk: 'read' },
  'search_bugs':            { domain: 'acms', risk: 'read' },
  'create_bug':             { domain: 'acms', risk: 'write' },
  'close_bug':              { domain: 'acms', risk: 'write' },
  'assign_bug':             { domain: 'acms', risk: 'write' },
  'list_agents':            { domain: 'acms', risk: 'read' },
  'get_agent_tasks':        { domain: 'acms', risk: 'read' },
  'register_agent':         { domain: 'acms', risk: 'write' },
  'update_agent_status':    { domain: 'acms', risk: 'write' },
  'list_projects':          { domain: 'acms', risk: 'read' },
  'create_project':         { domain: 'acms', risk: 'write' },
  'get_project_health':     { domain: 'acms', risk: 'read' },
  'list_users':             { domain: 'acms', risk: 'read' },
  'get_my_profile':         { domain: 'acms', risk: 'read' },
  'get_system_config':      { domain: 'acms', risk: 'read' },
  'list_my_work':           { domain: 'acms', risk: 'read' },
  'list_recent_events':     { domain: 'acms', risk: 'read' },
  'get_dashboard_stats':    { domain: 'acms', risk: 'read' },
  'open_view':              { domain: 'acms', risk: 'read' },
  'close_window':           { domain: 'acms', risk: 'read' },
  'highlight_element':      { domain: 'acms', risk: 'read' },
  'switch_project':         { domain: 'acms', risk: 'write' },
  '_expand_tools':          { domain: 'acms', risk: 'read' },
  '_recall_buddy_memory':   { domain: 'acms', risk: 'read' },
  'search_history':         { domain: 'acms', risk: 'read' },
  'plan_execute':           { domain: 'acms', risk: 'exec' },
  'send_email':             { domain: 'acms', risk: 'restricted' },

  // ── system 域 ──
  'get_current_time':       { domain: 'system', risk: 'read' },
};

// ═══════════════════════════════════════════════════════════
// POOLS — 手写池定义（引擎后建前的临时实现）
//   池名 → 工具名数组。listPool(name) 会过滤未注册的工具。
// ═══════════════════════════════════════════════════════════
const POOLS = {
  // 代码执行域（小吉执行子集）：读文件/搜索/写文件/patch/跑命令/git 状态+提交
  'code_execution': [
    'agent_read_file', 'agent_read_files', 'agent_read_dir_summary',
    'agent_search_files', 'agent_list_files',
    'agent_write_file', 'agent_patch_file', 'agent_multi_patch',
    'agent_exec_command', 'agent_typescheck', 'agent_set_phase',
    'agent_git_status', 'agent_git_log', 'agent_git_branch', 'agent_git_diff', 'agent_git_commit',
  ],
  // 网络调研域（researcher 专业 Agent）
  'web_research': [
    'web_search', 'web_research', 'fetch_url', 'search_knowledge',
    'agent_http_request', 'browser_snapshot', 'browser_screenshot',
  ],
  // 数据查询域
  'data_query': [
    'query_collection', 'search_history', 'agent_db_query',
    'list_requirements', 'list_my_tasks', 'list_board_tasks',
    'list_bugs', 'list_agents', 'list_projects', 'list_users',
  ],
  // Office 文档生成域
  'office': [
    'generate_docx', 'generate_xlsx', 'generate_pptx', 'document_edit',
  ],
  // 媒体创作域
  'media': [
    'generate_image', 'play_music', 'play_video',
    'agnes_generate_video', 'agnes_query_video',
  ],
  // 低风险只读域（可无确认直接执行）
  'read_only': [
    'agent_read_file', 'agent_read_files', 'agent_read_dir_summary',
    'agent_search_files', 'agent_list_files',
    'agent_git_status', 'agent_git_log', 'agent_git_branch', 'agent_git_diff',
    'web_search', 'web_research', 'fetch_url', 'search_knowledge',
    'browser_snapshot', 'browser_console', 'browser_screenshot',
    'query_collection', 'list_requirements', 'search_requirements', 'get_requirement_detail',
    'list_my_tasks', 'list_board_tasks', 'search_tasks', 'list_bugs', 'search_bugs',
    'list_agents', 'get_agent_tasks', 'list_projects', 'get_project_health',
    'list_users', 'get_my_profile', 'list_my_work', 'list_recent_events',
    'get_dashboard_stats', 'get_system_config', 'open_view', 'close_window',
    'get_current_time', 'search_history',
  ],
  // 高风险域（需确认/审批）
  'high_risk': [
    'agent_exec_command', 'agent_ssh_execute', 'agent_db_query',
    'agent_git_commit', 'plan_execute', 'send_email',
    'workspace_isolate', 'workspace_merge',
  ],
};

// ═══════════════════════════════════════════════════════════
// DOMAIN_TERMS — 能力域 → 中文意图词（v0.88）
//   给 tool-retriever 的中文检索用：agent_* 工具描述是英文，中文消息
//   bi-gram 匹配不到 → L3 检索捞不出执行工具（P6）。
//   这是集中一份的"域词典"，由 retriever init 时拼进 fulltext，
//   不是分散在工具定义里的第三套词表。
// ═══════════════════════════════════════════════════════════
const DOMAIN_TERMS = {
  'fs':    ['文件', '读写', '代码', '源码', '目录', '路径', '文件内容', '查看文件', '读文件', '写文件', '改文件', '搜索代码', '文件列表', '项目结构'],
  'git':   ['git', '提交', '版本', '仓库', '分支', 'commit', '提交记录', 'git状态', '代码版本', '回滚'],
  'exec':  ['命令', '执行', '运行', '终端', 'shell', '跑测试', 'npm', 'node', '脚本', '启动服务', '命令行'],
  'web':   ['搜索', '网页', '抓取', '调研', '联网', '查询', 'url', '链接', '新闻', '资料', '浏览器'],
  'db':    ['数据库', '查询', '数据表', 'sql', 'db', '存储', '记录'],
  'office': ['文档', 'word', 'excel', 'ppt', '表格', '演示', 'docx', 'xlsx', 'pptx', '报告', '纪要'],
  'media': ['图片', '生成图', '画图', '音乐', '歌曲', '视频', '播放', '创作'],
  'acms':  ['需求', '任务', '缺陷', 'bug', '项目', '看板', '用户', 'agent', '审批', '认领', '统计', '仪表盘', '事件', '工作'],
  'agent': ['子任务', '委派', '并行', '分工', '子agent', 'subtask', '协作'],
  'system': ['时间', '当前时间', '配置', '系统'],
  'app':   ['应用', '工具', 'app'],
};

module.exports = { POOL_DEFAULTS, POOLS, DOMAIN_TERMS };
