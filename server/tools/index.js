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

console.log('[tools] 内建工具注册完成:', listBuiltinTools().join(', '));
function listBuiltinTools() { return require('../services/tool-registry').listTools().map(t => t.name); }
