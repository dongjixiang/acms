// 120 CLI 调试：workspace cwd + 复杂任务
process.chdir('/root/acms');
const { QwenSessionManager } = require('/root/acms/server/services/qwen-worker');
const modelStore = require('/root/acms/server/stores/model-store');

(async () => {
  console.log('=== CLI 复杂任务调试 ===');
  const model = modelStore.getDefaultGenModel();
  const mgr = new QwenSessionManager({ maxSessions: 1 });
  try {
    const s = await mgr.getSession('debug-cli', {
      cwd: '/root/acms/workspaces/duogame',
    });
    console.log('[DEBUG] 会话就绪, cwd=/root/acms/workspaces/duogame');
    const t0 = Date.now();
    const r = await s.ask('在 /root/acms/workspaces/duogame 创建 qwen-120-test.txt，内容 Qwen-120-OK', { timeoutMs: 120000 });
    console.log('[DEBUG] 耗时', ((Date.now() - t0) / 1000).toFixed(1) + 's');
    console.log('[DEBUG] subtype:', r.subtype, '| is_error:', r.is_error);
    console.log('[DEBUG] error:', r.error ? r.error.message : 'none');
    console.log('[DEBUG] result:', (r.result || '').slice(0, 200));
  } catch (e) {
    console.log('[DEBUG] 异常:', e.message);
  }
  process.exit(0);
})();
