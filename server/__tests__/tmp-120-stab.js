// 120 CLI 稳定性测试：连跑 3 次 git 相关任务
process.chdir('/root/acms');
const { QwenSessionManager } = require('/root/acms/server/services/qwen-worker');
const modelStore = require('/root/acms/server/stores/model-store');

(async () => {
  const model = modelStore.getDefaultGenModel();
  const mgr = new QwenSessionManager({ maxSessions: 1, idleTimeoutMs: 600000 });
  let ok = 0, fail = 0;
  for (let i = 1; i <= 3; i++) {
    const t0 = Date.now();
    try {
      const s = await mgr.getSession('stab-' + i, { cwd: '/root/acms/workspaces/duogame' });
      const r = await s.ask('运行 git status --short 查看状态，一句话中文回答（第' + i + '次）', { timeoutMs: 90000 });
      const isOk = !r.is_error;
      if (isOk) ok++; else fail++;
      console.log(`[T${i}] ${isOk ? 'OK' : 'FAIL'} subtype=${r.subtype} 耗时=${((Date.now() - t0) / 1000).toFixed(1)}s err=${r.error ? r.error.message : 'none'}`);
      mgr.release('stab-' + i);
    } catch (e) {
      fail++;
      console.log(`[T${i}] EXC:`, e.message);
    }
  }
  console.log(`=== 结果: ${ok}/3 OK, ${fail}/3 FAIL ===`);
  process.exit(0);
})();
