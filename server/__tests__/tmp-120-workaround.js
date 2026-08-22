// 120 验证 workaround：中文任务不用 # Task 标题
process.chdir('/root/acms');
const { QwenSessionManager } = require('/root/acms/server/services/qwen-worker');
const modelStore = require('/root/acms/server/stores/model-store');

(async () => {
  const model = modelStore.getDefaultGenModel();
  const mgr = new QwenSessionManager({ maxSessions: 1 });
  const cwd = '/root/acms/workspaces/duogame';

  async function tryAsk(name, prompt) {
    try {
      const s = await mgr.getSession('wr-' + name, { cwd });
      const r = await s.ask(prompt, { timeoutMs: 90000 });
      console.log(`[${name}] subtype=${r.subtype} err=${r.error ? r.error.message : 'none'}`);
      mgr.release('wr-' + name);
    } catch (e) {
      console.log(`[${name}] EXC:`, e.message);
    }
  }

  // Workaround A: 中文 + 普通加粗标题（不用 # markdown 标题）
  await tryAsk('A-bold', '**任务 T-QWEN-120-02：创建并验证文件**\n\n在 workspace 创建 qwen-wr-a.txt 内容 AAA，然后用 git status 确认');

  // Workaround B: 中文 + 英文 Task 标题
  await tryAsk('B-enhead', '# Task: 创建文件\n\n在 workspace 创建 qwen-wr-b.txt 内容 BBB，然后用 git status 确认');

  // Workaround C: 无标题直接任务
  await tryAsk('C-plain', '任务：在 workspace 创建 qwen-wr-c.txt 内容 CCC，然后用 git status 确认它出现在 untracked');

  process.exit(0);
})();
