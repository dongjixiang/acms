// 120 崩溃完整输出捕获
process.chdir('/root/acms');
const { QwenSessionManager } = require('/root/acms/server/services/qwen-worker');
const modelStore = require('/root/acms/server/stores/model-store');

(async () => {
  const model = modelStore.getDefaultGenModel();
  const mgr = new QwenSessionManager({ maxSessions: 1 });
  const cwd = '/root/acms/workspaces/duogame';
  const s = await mgr.getSession('crash-full', { cwd });
  // 全量捕获 stderr
  s.child.stderr.on('data', (d) => console.log('[STDERR-RAW]', JSON.stringify(d.toString())));
  s.child.on('exit', (code, sig) => console.log('[EXIT] code=' + code + ' sig=' + sig));
  const r = await s.ask('在 workspace 创建 crash-a.txt 内容 CRASH-A，然后用 git status 确认它出现', { timeoutMs: 90000 });
  console.log('[RESULT] subtype:', r.subtype, '| err:', r.error ? r.error.message : 'none');
  console.log('[RESULT] result:', (r.result || '').slice(0, 100));
  process.exit(0);
})();
