// 120 诊断：appendSystemPrompt 是否是 CLI exit 1 根因
process.chdir('/root/acms');
const { QwenSessionManager } = require('/root/acms/server/services/qwen-worker');
const modelStore = require('/root/acms/server/stores/model-store');

(async () => {
  const model = modelStore.getDefaultGenModel();
  const mgr = new QwenSessionManager({ maxSessions: 1 });

  // 场景 A：无 appendSystemPrompt（应该 OK）
  console.log('=== A: 无 appendSystemPrompt ===');
  try {
    const sA = await mgr.getSession('dbg-a', { cwd: '/root/acms/workspaces/duogame' });
    const rA = await sA.ask('运行 git status --short 一句话回答', { timeoutMs: 60000 });
    console.log('A subtype:', rA.subtype, '| err:', rA.error ? rA.error.message : 'none');
    mgr.release('dbg-a');
  } catch (e) { console.log('A 异常:', e.message); }

  // 场景 B：带 appendSystemPrompt（模拟 task 场景）
  console.log('=== B: 带 appendSystemPrompt ===');
  try {
    const sB = await mgr.getSession('dbg-b', {
      cwd: '/root/acms/workspaces/duogame',
      appendSystemPrompt: '你是 ACMS 的工程执行 Agent，运行在 Qwen Code 内核上。工作方式：任务描述会作为 user 消息给出，包含验收标准（Acceptance Criteria）。在当前工作目录（项目 workspace）内完成任务：探索代码 → 修改/新建文件 → 运行验证 → git 提交。使用中文写最终总结。不要只描述计划而不动手——实际写文件、实际跑命令验证。危险操作（删除重要目录、清空磁盘等）会被权限系统拦截，不要尝试绕过。',
    });
    const rB = await sB.ask('运行 git status --short 一句话回答', { timeoutMs: 60000 });
    console.log('B subtype:', rB.subtype, '| err:', rB.error ? rB.error.message : 'none');
    mgr.release('dbg-b');
  } catch (e) { console.log('B 异常:', e.message); }

  process.exit(0);
})();
