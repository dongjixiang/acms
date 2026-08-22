// ============================================================
// qwen-task.js 单元测试（v0.114）
// 验证：配置开关/沙箱策略/prompt 组装/任务执行（真实 CLI）
// 运行: node server/__tests__/test-qwen-task.js
// ============================================================
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const SERVER = path.join(__dirname, '..');
process.chdir(SERVER);

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  console.log('=== qwen-task.js 单元测试 ===\n');
  const { runQwenTask, taskEnabled, setTaskEnabled, getTaskManager, _internals } = require('../services/qwen-task');
  const { sandboxPolicy, buildTaskPrompt, TASK_SYSTEM_PROMPT } = _internals;

  // --- 1. 沙箱策略 ---
  console.log('--- 1. 沙箱策略 ---');
  check('无 suggestions → 放行', sandboxPolicy({ tool_name: 'Bash', permission_suggestions: [] }) === true);
  check('全部 allow → 放行', sandboxPolicy({ tool_name: 'Write', permission_suggestions: [{ allow: true }] }) === true);
  check('含 deny → 拒绝', sandboxPolicy({ tool_name: 'Bash', permission_suggestions: [{ allow: true }, { allow: false, reason: 'dangerous' }] }) === false);
  check('无 toolCall → 放行', sandboxPolicy(null) === true);

  // --- 2. prompt 组装 ---
  console.log('\n--- 2. prompt 组装 ---');
  const task = { id: 'T-TEST01', title: '修 bug', description: '登录页 404', acceptance_criteria: '页面可打开' };
  const prompt = buildTaskPrompt(task, null, '/ws/demo', 'zh');
  check('包含任务描述', prompt.includes('修 bug') && prompt.includes('登录页 404'));
  check('包含验收标准', prompt.includes('Acceptance Criteria') && prompt.includes('页面可打开'));
  check('包含 workspace 路径', prompt.includes('/ws/demo'));
  check('包含中文总结指令', prompt.includes('最终总结用中文'));
  const promptEn = buildTaskPrompt(task, null, '/ws/demo', 'en');
  check('英文 lang → English 指令', promptEn.includes('English'));
  check('自定义 taskContext 优先', buildTaskPrompt(task, 'CUSTOM-CTX', '/ws/demo', 'zh').includes('CUSTOM-CTX'));
  check('system prompt 含工程指令', TASK_SYSTEM_PROMPT.includes('Qwen Code 内核'));

  // --- 3. 配置开关 ---
  console.log('\n--- 3. 配置开关（需要 DB）---');
  try {
    const before = taskEnabled();
    check('默认读取 DB 布尔', typeof before === 'boolean');
    const ok = setTaskEnabled(true);
    check('setTaskEnabled(true) 写入', ok === true);
    check('写入后 taskEnabled()===true', taskEnabled() === true);
    setTaskEnabled(false);
    check('恢复 false', taskEnabled() === false);
    // 还原默认（不污染测试环境）
    setTaskEnabled(true);
    check('测试结束保持开启（供后续集成测试）', taskEnabled() === true);
  } catch (e) {
    check('配置开关（跳过）', false, e.message);
  }

  // --- 4. runQwenTask 未启用时抛错 ---
  console.log('\n--- 4. 未启用抛错 ---');
  setTaskEnabled(false);
  try {
    await runQwenTask({ id: 'T-X' }, { project: { slug: 'demo' } });
    check('未启用 → 抛错', false, '没有抛错');
  } catch (e) {
    check('未启用 → QWEN_TASK_DISABLED', e.code === 'QWEN_TASK_DISABLED', e.message);
  }
  setTaskEnabled(true);

  // --- 5. 真实任务执行（写文件，走审批）---
  console.log('\n--- 5. 真实任务执行（需要 CLI + 模型 key）---');
  const tmp = path.join(SERVER, 'data', 'qwen-task-test-ws');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  // 模拟 workspace：直接指向临时目录（绕过 workspace-service 的固定根）
  // 通过 monkey-patch workspace.getPath 指向 tmp
  const workspaceSvc = require('../services/workspace-service');
  const origGetPath = workspaceSvc.getPath.bind(workspaceSvc);
  workspaceSvc.getPath = () => tmp;

  try {
    const t0 = Date.now();
    const r = await runQwenTask(
      { id: 'T-TASK01', title: '写一个测试文件', description: '在 workspace 创建 hello-qwen-task.txt，内容为 qwen-task-v1' },
      { project: { slug: 'demo', name: 'demo' }, taskContext: null, lang: 'zh' }
    );
    console.log(`  耗时 ${Date.now() - t0}ms, turns=${r.numTurns}, approvals=${r.approvalCount}`);
    check('任务 success + qwen 标记', r.qwen === true && !!r.content);
    check('返回 content 非空', (r.content || '').length > 0);
    const outFile = path.join(tmp, 'hello-qwen-task.txt');
    check('产物文件存在', fs.existsSync(outFile), outFile);
    if (fs.existsSync(outFile)) {
      check('产物内容正确', fs.readFileSync(outFile, 'utf8').includes('qwen-task-v1'));
    }
  } catch (e) {
    check('真实任务执行（跳过）', false, e.message);
  } finally {
    workspaceSvc.getPath = origGetPath;
  }

  // --- 汇总 ---
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== 结果: ${passed}/${results.length} 通过 ===`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => {
  console.error('测试崩溃:', e);
  process.exit(1);
});
