// 120 验证：write_file 后紧跟 run_shell_command（无关 git）是否崩
process.chdir('/root/acms');
const { QwenSessionManager } = require('/root/acms/server/services/qwen-worker');
const modelStore = require('/root/acms/server/stores/model-store');

(async () => {
  const model = modelStore.getDefaultGenModel();
  const mgr = new QwenSessionManager({
    maxSessions: 1,
    onEvent: (evt) => {
      if (evt.type === 'approval_request') {
        const tc = evt.toolCall || {};
        console.log('[TOOL]', tc.tool_name, JSON.stringify(tc.input || {}).slice(0, 100));
      }
    },
  });
  const s = await mgr.getSession('seq-test', { cwd: '/root/acms/workspaces/duogame' });
  s.child.stderr.on('data', (d) => console.log('[STDERR]', d.toString().slice(0, 300)));
  // write_file 后跑 echo（非 git）
  const r = await s.ask('创建 seq-a.txt 内容 SEQ-A，然后运行 echo DONE 确认 shell 正常', { timeoutMs: 90000 });
  console.log('[RESULT] subtype:', r.subtype, '| err:', r.error ? r.error.message : 'none');
  console.log('[RESULT] result:', (r.result || '').slice(0, 150));
  process.exit(0);
})();
