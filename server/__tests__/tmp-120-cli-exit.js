// 120 CLI 收尾 exit 调试：完整 stderr
process.chdir('/root/acms');
const { QwenSessionManager } = require('/root/acms/server/services/qwen-worker');
const modelStore = require('/root/acms/server/stores/model-store');

(async () => {
  const model = modelStore.getDefaultGenModel();
  const mgr = new QwenSessionManager({ maxSessions: 1 });
  try {
    const s = await mgr.getSession('debug-exit', {
      cwd: '/root/acms/workspaces/duogame',
    });
    console.log('[DBG] 会话就绪');
    // 监听原始 stderr（绕过 debug 过滤）
    s.child.stderr.on('data', (d) => {
      console.log('[CLI-STDERR]', d.toString().slice(0, 500));
    });
    const r = await s.ask('在 workspace 创建文件 exit-test.txt 内容 EXIT-TEST，然后运行 cat exit-test.txt 验证，最后用 git status 查看状态', { timeoutMs: 120000 });
    console.log('[DBG] subtype:', r.subtype, '| is_error:', r.is_error);
    console.log('[DBG] error:', r.error ? JSON.stringify(r.error).slice(0, 300) : 'none');
    console.log('[DBG] result:', (r.result || '').slice(0, 300));
    // 等 2s 看 CLI 是否自己退出
    await new Promise((res) => setTimeout(res, 2000));
    console.log('[DBG] child exitCode:', s.child.exitCode);
  } catch (e) {
    console.log('[DBG] 异常:', e.message);
  }
  process.exit(0);
})();
