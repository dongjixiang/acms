// v0.X: 内置 PreToolUse hook — Git 操作守护
//   在 agent 写任何文件/补丁之前，禁止使用 git 工具
//   治 T-MRGDBST1 / T-MRH7H9GA 现象：agent 在探索阶段就调 git_status/git_diff 空转
//
//   设计原则：
//   - 首次成功 write_file/patch_file 后解锁全部 git 工具
//   - 解锁后不再检查（信任 agent）
//   - 不阻塞非 git 操作

const { registerHook } = require('../services/hook-registry');
const taskStore = require('../stores/task-store');

const GIT_TOOLS = new Set([
  'agent_git_status', 'agent_git_diff', 'agent_git_commit',
  'agent_git_log', 'agent_git_branch',
]);

// per-task cache：taskId → 是否已解锁 git
const unlocked = new Set();

registerHook('PreToolUse', 'git-guard', async (ctx) => {
  const { toolName, args, ctx: toolCtx } = ctx;
  if (!GIT_TOOLS.has(toolName)) return ctx;  // 非 git 工具，放行

  const taskId = toolCtx?.taskId;
  if (!taskId) return ctx;  // 没有 taskId，放行（兼容非 task 场景）

  // 已解锁的任务，放行
  if (unlocked.has(taskId)) return ctx;

  // 检查这个 task 是否有任何成功的 write_file/patch_file
  try {
    const task = taskStore.getById(taskId);
    if (task) {
      const execLog = JSON.parse(task.execution_log || '[]');
      const hasWritten = execLog.some(e =>
        e.note && (e.note.includes('agent_write_file') || e.note.includes('agent_patch_file'))
      );
      if (hasWritten) {
        // 有写操作记录，解锁
        unlocked.add(taskId);
        return ctx;
      }
    }
  } catch (e) { /* 查询失败时放行 */ }

  // 没有写操作 → 拒绝 git 调用
  return {
    ...ctx,
    abort: true,
    abortReason: `【Git Guard】你还没有做任何代码修改（没有调 agent_write_file / agent_patch_file）。
Git 操作（${toolName}）应该在完成所有代码修改后再使用。
请先调 agent_write_file 或 agent_patch_file 完成代码变更，之后再调 git 工具来做版本管理。`,
  };
});
