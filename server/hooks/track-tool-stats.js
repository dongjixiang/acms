// v0.46: 内置 hook — 跟踪 tool call 次数到 task.doc.tool_stats
//   给 PM 看板一个 agent 工作量的量化视图
const { registerHook } = require('../services/hook-registry');
const taskStore = require('../stores/task-store');

registerHook('PostToolUse', 'track-tool-stats', async ({ toolName, args, result, ctx }) => {
  const { taskId } = ctx;
  if (!taskId) return { result };

  try {
    const task = taskStore.getById(taskId);
    if (!task) return { result };

    const stats = JSON.parse(task.tool_stats || '{}');
    stats[toolName] = (stats[toolName] || 0) + 1;
    stats.total = (stats.total || 0) + 1;
    stats.lastTool = toolName;
    stats.lastToolAt = new Date().toISOString();

    taskStore.update(taskId, { tool_stats: JSON.stringify(stats) });
  } catch (e) {
    console.warn(`[hook:track-tool-stats] failed: ${e.message}`);
  }

  return { result };
});