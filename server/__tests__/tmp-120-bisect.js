// 120 诊断：二分 prompt 触发条件（中文/markdown/内容）
process.chdir('/root/acms');
const { QwenSessionManager } = require('/root/acms/server/services/qwen-worker');
const modelStore = require('/root/acms/server/stores/model-store');

(async () => {
  const model = modelStore.getDefaultGenModel();
  const mgr = new QwenSessionManager({ maxSessions: 1 });
  const cwd = '/root/acms/workspaces/duogame';

  async function tryAsk(name, prompt) {
    try {
      const s = await mgr.getSession('dbg-' + name, { cwd });
      s.child.stderr.on('data', (d) => console.log('[' + name + '-STDERR]', d.toString().slice(0, 300)));
      const r = await s.ask(prompt, { timeoutMs: 60000 });
      console.log(`[${name}] subtype=${r.subtype} err=${r.error ? r.error.message : 'none'} result=${(r.result || '').slice(0, 60)}`);
      mgr.release('dbg-' + name);
    } catch (e) {
      console.log(`[${name}] EXC:`, e.message);
    }
  }

  // 1. 纯中文简单任务
  await tryAsk('zh-simple', '运行 git status --short 查看状态，用中文一句话回答');
  // 2. 中文 + Task 标题格式
  await tryAsk('zh-task', '# Task T-X: 测试任务\n\n在 workspace 创建文件 a.txt 内容 ABC，然后用 git status 确认');
  // 3. 英文 + Task 格式
  await tryAsk('en-task', '# Task T-X: Test task\n\nCreate file a.txt with content ABC in workspace, then git status');
  // 4. 中文 + workspace 路径
  await tryAsk('zh-ws', '工作目录：/root/acms/workspaces/duogame\n\n运行 git status --short 一句话回答');

  process.exit(0);
})();
