// v0.X: PostToolUse hook — 自动跟踪工具调用到 TaskMemory
//   自动记录：文件读取、文件写入、阶段变更
//   让 TaskMemory 在 agent 执行过程中自然积累，不需额外手动操作

const { registerHook } = require('../services/hook-registry');
const taskMemory = require('../services/task-memory');

registerHook('PostToolUse', 'task-memory-tracker', async ({ toolName, args, result, ctx }) => {
  const { taskId, projectId } = ctx || {};
  if (!taskId) return { result };

  try {
    switch (toolName) {
      case 'agent_read_file':
        if (args && args.path) {
          taskMemory.trackFileRead(taskId, args.path, '');
        }
        break;

      case 'agent_read_files':
        if (args && Array.isArray(args.paths)) {
          for (const p of args.paths) {
            taskMemory.trackFileRead(taskId, p, '');
          }
        }
        break;

      case 'agent_read_dir_summary':
      case 'agent_list_files':
        if (args && args.path) {
          taskMemory.trackFileRead(taskId, args.path, '探索目录');
        }
        break;

      case 'agent_write_file':
        if (args && args.path) {
          taskMemory.trackFileWritten(taskId, args.path, 'done', -1);
        }
        break;

      case 'agent_patch_file':
        if (args && args.path) {
          taskMemory.trackFileWritten(taskId, args.path, 'done', -1);
        }
        break;

      case 'agent_multi_patch':
        if (args && Array.isArray(args.patches)) {
          for (const p of args.patches) {
            if (p && p.path) {
              taskMemory.trackFileWritten(taskId, p.path, 'done', -1);
            }
          }
        }
        break;

      case 'agent_set_phase':
        if (args && args.phase) {
          taskMemory.setPhase(taskId, args.phase);
        }
        break;
    }
  } catch (e) {
    console.warn(`[hook:task-memory] failed for ${toolName}: ${e.message}`);
  }

  return { result };
});
