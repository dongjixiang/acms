// 120 CLI git 命令调试
process.chdir('/root/acms');
const { QwenSessionManager } = require('/root/acms/server/services/qwen-worker');
const modelStore = require('/root/acms/server/stores/model-store');

(async () => {
  const model = modelStore.getDefaultGenModel();
  const mgr = new QwenSessionManager({ maxSessions: 1 });
  try {
    const s = await mgr.getSession('debug-git', {
      cwd: '/root/acms/workspaces/duogame',
    });
    console.log('[DBG] 会话就绪');
    s.child.stderr.on('data', (d) => {
      console.log('[CLI-STDERR]', d.toString().slice(0, 800));
    });
    s.child.stdout.on('data', (d) => {
      const txt = d.toString();
      // 打印非 JSON 的原始输出（可能包含崩溃前打印）
      if (!txt.trim().startsWith('{')) console.log('[CLI-STDOUT-RAW]', txt.slice(0, 300));
    });
    const r = await s.ask('运行 git status --short 并简要说明结果', { timeoutMs: 60000 });
    console.log('[DBG] subtype:', r.subtype, '| is_error:', r.is_error);
    console.log('[DBG] error:', r.error ? r.error.message : 'none');
    console.log('[DBG] result:', (r.result || '').slice(0, 200));
    await new Promise((res) => setTimeout(res, 1500));
    console.log('[DBG] child exitCode:', s.child.exitCode);
  } catch (e) {
    console.log('[DBG] 异常:', e.message);
  }
  process.exit(0);
})();
