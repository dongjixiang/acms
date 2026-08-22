// 120 精确组合测试
process.chdir('/root/acms');
const { QwenSessionManager } = require('/root/acms/server/services/qwen-worker');
const modelStore = require('/root/acms/server/stores/model-store');

(async () => {
  const model = modelStore.getDefaultGenModel();
  const mgr = new QwenSessionManager({ maxSessions: 1 });
  const cwd = '/root/acms/workspaces/duogame';

  async function tryAsk(name, prompt) {
    const t0 = Date.now();
    try {
      const s = await mgr.getSession('c-' + name, { cwd });
      s.child.stderr.on('data', (d) => console.log(`[${name}-STDERR]`, d.toString().slice(0, 250)));
      const r = await s.ask(prompt, { timeoutMs: 90000 });
      console.log(`[${name}] subtype=${r.subtype} 耗时=${((Date.now()-t0)/1000).toFixed(1)}s err=${r.error ? r.error.message : 'none'}`);
      mgr.release('c-' + name);
    } catch (e) {
      console.log(`[${name}] EXC:`, e.message);
    }
  }

  // 1. 中文写文件（无 git）→ 之前成功，重测
  await tryAsk('w-zh', '在 workspace 创建 comb-a.txt 内容 COMB-A');
  // 2. 中文 git status（无写）→ 之前成功，重测
  await tryAsk('g-zh', '运行 git status --short 查看状态，用中文一句话回答');
  // 3. 中文写文件 + git → 疑似崩
  await tryAsk('wg-zh', '在 workspace 创建 comb-b.txt 内容 COMB-B，然后用 git status 确认它出现');
  // 4. 英文写文件 + git → 之前成功，重测
  await tryAsk('wg-en', 'Create comb-c.txt with content COMB-C in workspace, then run git status to confirm');

  process.exit(0);
})();
