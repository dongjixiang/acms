// 120 诊断：完整 buildTaskPrompt 是否导致 CLI exit 1
process.chdir('/root/acms');
const { QwenSessionManager } = require('/root/acms/server/services/qwen-worker');
const modelStore = require('/root/acms/server/stores/model-store');
const { _internals } = require('/root/acms/server/services/qwen-task');

(async () => {
  const model = modelStore.getDefaultGenModel();
  const mgr = new QwenSessionManager({ maxSessions: 1 });

  const task = {
    id: 'T-QWEN-120-02',
    title: 'Qwen内核120终验：创建并验证文件',
    description: '在 workspace 创建 qwen-120-final.txt，内容 QWEN-120-FINAL-OK，然后用 git status 确认它出现在 untracked 列表',
    acceptance_criteria: '文件存在且内容正确',
  };
  const prompt = _internals.buildTaskPrompt(task, null, '/root/acms/workspaces/duogame', 'zh');
  console.log('=== 完整 task prompt（无 MCP）===');
  console.log('prompt 长度:', prompt.length);
  console.log('prompt 前 100:', prompt.slice(0, 100));
  try {
    const s = await mgr.getSession('dbg-full', {
      cwd: '/root/acms/workspaces/duogame',
      appendSystemPrompt: _internals.TASK_SYSTEM_PROMPT,
    });
    s.child.stderr.on('data', (d) => console.log('[STDERR]', d.toString().slice(0, 400)));
    s.child.on('exit', (code) => console.log('[EXIT] code=', code));
    const r = await s.ask(prompt, { timeoutMs: 120000 });
    console.log('subtype:', r.subtype, '| err:', r.error ? r.error.message : 'none');
    console.log('result 前 200:', (r.result || '').slice(0, 200));
  } catch (e) {
    console.log('异常:', e.message);
  }
  process.exit(0);
})();
