// v0.46: 内置 hooks 自动注册入口
//   server boot 时 require('./hooks') 触发全部内置 hook 注册
//
// 内置 hooks:
//   - auto-typescheck-on-write: 写 .ts/.tsx 后自动 tsc --noEmit
//   - track-tool-stats: 跟踪 tool call 次数到 task.doc.tool_stats
//
// 用户自定义 hook:
require('./auto-typescheck-on-write');
require('./track-tool-stats');
require('./git-guard');

console.log('[hooks] 内置 hooks 注册完成');