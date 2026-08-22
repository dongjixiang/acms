// 120 捕获 Qwen 实际工具调用序列（写文件+git 场景）
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
        console.log('[TOOL]', tc.tool_name, JSON.stringify(tc.input || {}).slice(0, 120));
      }
      if (evt.type === 'stream_event' && evt.event && evt.event.type === 'content_block_delta') {
        // 忽略文本 delta，只看 tool 相关
      }
    },
  });
  const s = await mgr.getSession('trace-git', { cwd: '/root/acms/workspaces/duogame' });
  s.child.stderr.on('data', (d) => console.log('[STDERR]', d.toString().slice(0, 300)));
  const r = await s.ask('在 workspace 创建 trace-a.txt 内容 TRACE-A，然后用 git status 确认它出现', { timeoutMs: 90000 });
  console.log('[RESULT] subtype:', r.subtype, '| err:', r.error ? r.error.message : 'none');
  process.exit(0);
})();
