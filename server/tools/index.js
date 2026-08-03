// ACMS 内建工具注册入口（v0.23 L3 拆分后）
//
// 原 tools/index.js 484 行混合 16 个工具 → 拆为 5 个子模块 + 本入口
// 任何 server 入口（app.js）require('./tools') 即触发全部注册，无需改动
//
// 分类（按权限 / 用途 物理隔离）：
//   - web.js             6 工具  Web / Time / Knowledge（搜索抓取类，无副作用）
//   - external-api.js    2 工具  Agnes Video v2.0（外部 SaaS，限流/凭证独立）
//   - leisure.js         3 工具  音乐/视频/图片（fire-and-forget assist 包装）
//   - agent/read.js      3 工具  Agent 只读（read_file/list_files/search_files）
//   - agent/write.js     2 工具  Agent 写入/执行（有副作用）⚠️ 安全敏感
//   - agent/patch.js     1 工具  Agent 补丁编辑（精准修改，不覆盖全文）
//   - agent/isolate.js   2 工具  Agent 隔离工作区（scratch + merge）
//
// 任何 routes/* 调用 registerTool 的语义都通过 tool-registry 完成，本入口只触发注册。

require('./web');
require('./external-api');
require('./leisure');
require('./agent/read');
require('./agent/write');
require('./agent/patch');
require('./agent/isolate');
require('./agent/browser');
require('./agent/git');
require('./agent/database');
require('./agent/ssh');
require('./agent/http');
require('./agent/screenshot');
require('./agent/phase');
require('./agent/check');
require('./agent/plan');
// v0.62 修死代码：office-gen.js 之前 registerTool 了三个工具（generate_docx/xlsx/pptx）
// 但全 server 没人 require 它，导致 LLM 永远拿不到这三个 tool
// 加上这一行后，三个 tool 立即注册，plan_execute 的 validatePlan 会自动接受它们
require('./office-gen');
// v0.62.4: document_edit tool（让 LLM 在 plan_execute 里改/新建 .docx）
require('./document-edit');

// v0.66 bug fix: acms-internal.js 从未被 require，26 个 ACMS 业务工具（query_collection /
//   list_my_tasks / claim_task / create_requirement / open_view / highlight_element 等）
//   对 LLM 完全不可见。LLM 调 _expand_tools({category:'task'|'requirement'|'window'|'system'|
//   'dashboard'|'bug'|'agent'}) 拿不到任何工具（除了 v0.66 新加的 'app'）。
//   CATEGORY_TOOLS 里硬编码的 list_xxx 等工具也全部失效。
//   修复：在 tools/index.js 加 require('./acms-internal')，让所有 server 入口触发注册。
require('./acms-internal');
// v0.73: plan-execute.js / send-email.js 从未被 require → plan_execute 找不到 send_email
require('./plan-execute');
require('./send-email');
// v0.88: delegate_subtasks 从 task-agent.js 抽出独立注册（任何入口可见，小吉可委派）
require('./delegate-subtasks');

console.log('[tools] 内建工具注册完成:', listBuiltinTools().join(', '));
function listBuiltinTools() { return require('../services/tool-registry').listTools().map(t => t.name); }
