// ACMS delegate_subtasks — 并行子任务委派（v0.88 从 task-agent.js 抽出独立注册）
//
// 背景：v0.88 之前只在 task-agent.js 内部 registerTool，且 task-agent.js 由
//   ai-tools-service require——小吉/chat 流 require tools/index.js 时拿不到该工具。
//   抽出到独立文件 + tools/index.js require 后，任何入口都能看到它。
//
// 设计：让 agent 把一个大任务拆成多个子任务并行执行。每个子任务有独立的
//   目标和工具集（TOOLSET_MAP 七类：read/write/git/exec/browser/db/http）。
//   最多同时 3 个子任务，每个子任务独立 runToolLoop（10 轮上限）。

const { registerTool } = require('../services/tool-registry');
const { execute: runtimeExec } = require('../services/agent-runtime');

const TOOLSET_MAP = {
  read: ['agent_read_file', 'agent_search_files', 'agent_list_files'],
  write: ['agent_read_file', 'agent_search_files', 'agent_write_file', 'agent_patch_file', 'agent_multi_patch'],
  git: ['agent_git_status', 'agent_git_diff', 'agent_git_commit', 'agent_git_log'],
  exec: ['agent_read_file', 'agent_search_files', 'agent_exec_command'],
  browser: ['browser_snapshot', 'browser_console', 'browser_click', 'browser_type'],
  db: ['agent_db_query'],
  http: ['agent_http_request'],
};

registerTool({
  name: 'delegate_subtasks',
  description: '把当前任务拆成多个子任务并行执行。每个子任务有独立的目标和工具集。'
    + '适合并行处理多个文件、同时调研多个方案、前后端并行开发等场景。'
    + '返回每个子任务的执行摘要。最多同时 3 个子任务。'
    + '示例: delegate_subtasks({tasks: [{goal: "修复登录页样式", tools: ["read","write"]}, {goal: "添加 API 测试", tools: ["read","exec"]}]})',
  parameters: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        description: '子任务数组，每个子任务包含 goal（目标描述）和 tools（工具集名称列表）',
        items: {
          type: 'object',
          properties: {
            goal: { type: 'string', description: '子任务目标（必填），清晰描述要做什么' },
            tools: { type: 'array', description: '工具集名称列表：read, write, git, exec, browser, db, http', items: { type: 'string' } },
          },
          required: ['goal'],
        },
      },
    },
    required: ['tasks'],
  },
  // v0.88: 池元数据
  pool: { domain: 'agent', risk: 'exec' },
  async handler(args, ctx = {}) {
    var tasks = args.tasks || [];
    if (!Array.isArray(tasks) || tasks.length === 0) return { ok: false, error: 'NO_TASKS' };
    if (tasks.length > 3) return { ok: false, error: 'TOO_MANY_TASKS' };

    var results = await Promise.all(tasks.map(async function(subtask, idx) {
      var toolNames = (subtask.tools || ['read', 'write']).flatMap(function(t) { return TOOLSET_MAP[t] || []; });
      toolNames = [...new Set(toolNames)];
      var msgs = [
        { role: 'system', content: '你是一个专注的子任务 Agent。你的目标明确且范围有限。完成任务后给出简洁总结（3-5 行）。工具可用：' + toolNames.join(', ') },
        { role: 'user', content: subtask.goal },
      ];
      try {
        var start = Date.now();
        var result = await runtimeExec({ messages: msgs, toolNames: toolNames, maxRounds: 10, maxTokens: 32000, context: ctx, caller: 'delegate-' + idx });
        return { index: idx, goal: subtask.goal.slice(0, 100), ok: true, summary: (result.content || '').slice(0, 500), elapsed: (Date.now() - start) + 'ms' };
      } catch (e) {
        return { index: idx, goal: subtask.goal.slice(0, 100), ok: false, error: e.message };
      }
    }));

    return { ok: true, total: results.length, successCount: results.filter(function(r) { return r.ok; }).length, failedCount: results.filter(function(r) { return !r.ok; }).length, results: results };
  },
});
