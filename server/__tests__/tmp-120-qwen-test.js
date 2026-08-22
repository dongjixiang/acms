// 120 集成验证：强制单角色执行 T-QWEN-120-01
process.chdir('/root/acms');
const aiTools = require('/root/acms/server/services/task-agent');

(async () => {
  console.log('=== 120 强制单角色执行 T-QWEN-120-01 ===');
  const t0 = Date.now();
  try {
    const result = await aiTools.executeTaskAgent('T-QWEN-120-01', {
      multiRole: false,
      lang: 'zh',
    });
    console.log('[RESULT] 完成 耗时', ((Date.now() - t0) / 1000).toFixed(1) + 's | model:', result.modelUsed);
    console.log('[RESULT] analysis:', (result.analysis || '').slice(0, 300));
  } catch (e) {
    console.error('[RESULT] 失败:', e.message, '| code:', e.code);
  }
  process.exit(0);
})();
