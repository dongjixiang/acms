// 独立 git 仓库测试：排除 /root/acms 大仓库干扰
process.chdir('/root/acms');
const { QwenSessionManager } = require('/root/acms/server/services/qwen-worker');
const modelStore = require('/root/acms/server/stores/model-store');

(async () => {
  const model = modelStore.getDefaultGenModel();
  const mgr = new QwenSessionManager({ maxSessions: 1 });
  const cwd = '/tmp/qwen-isolated';
  require('fs').mkdirSync(cwd, { recursive: true });
  const { execSync } = require('child_process');
  try { execSync('cd /tmp/qwen-isolated && git init 2>&1 | head -1 && git config user.email test@test.com && git config user.name test'); } catch (e) { console.log('git init:', e.message); }

  async function tryAsk(name, prompt) {
    const t0 = Date.now();
    try {
      const s = await mgr.getSession('iso-' + name, { cwd });
      const r = await s.ask(prompt, { timeoutMs: 90000 });
      console.log(`[${name}] subtype=${r.subtype} 耗时=${((Date.now()-t0)/1000).toFixed(1)}s err=${r.error ? r.error.message : 'none'}`);
      mgr.release('iso-' + name);
    } catch (e) {
      console.log(`[${name}] EXC:`, e.message);
    }
  }

  // 中文写文件 + git（独立小仓库）
  await tryAsk('zh-isolated', '在 workspace 创建 iso-a.txt 内容 ISO-A，然后用 git status 确认它出现');
  // 英文对照
  await tryAsk('en-isolated', 'Create iso-b.txt with content ISO-B in workspace, then git status to confirm');

  process.exit(0);
})();
