// ============================================================
// qwen-worker.js 单元测试（Phase B v0.1）
// 验证：会话创建/握手/对话/记忆/工具审批/会话池/回收
// 运行: node server/__tests__/test-qwen-worker.js
// ============================================================
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const SERVER = path.join(__dirname, '..');
process.chdir(SERVER); // 保证 require 相对路径正确

const { QwenSessionManager, findCliPath } = require('../services/qwen-worker');

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  console.log('=== qwen-worker.js 单元测试 ===');
  console.log('CLI 路径:', findCliPath());

  // 临时目录（测试用）
  const tmp = path.join(SERVER, 'data', 'qwen-test-workspace');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });

  const manager = new QwenSessionManager({
    maxSessions: 2,
    idleTimeoutMs: 60 * 1000,
    onApproval: async (toolCall) => {
      console.log(`  [审批] ${toolCall.tool_name} ${JSON.stringify(toolCall.input).slice(0, 80)} → allow`);
      return true;
    },
  });

  let t0 = Date.now();

  try {
    // --- 1. 会话创建 + 握手 ---
    console.log('\n--- 1. 会话创建 ---');
    const s1 = await manager.getSession('user-a', { cwd: tmp });
    check('会话创建 + 握手', s1.ready && s1.sessionId);
    console.log(`  耗时 ${Date.now() - t0}ms`);

    // --- 2. 简单对话 ---
    console.log('\n--- 2. 简单对话 ---');
    t0 = Date.now();
    const r1 = await s1.ask('1+1=? 只要数字');
    check('对话返回 success', r1.subtype === 'success' && !r1.is_error, `turns=${r1.num_turns}`);
    check('回答包含 2', /2/.test(r1.result || ''), `result=${(r1.result || '').slice(0, 60)}`);
    console.log(`  耗时 ${Date.now() - t0}ms`);

    // --- 3. 多轮记忆 ---
    console.log('\n--- 3. 多轮记忆 ---');
    t0 = Date.now();
    const r2 = await s1.ask('我叫什么名字？', { timeoutMs: 120000 });
    check('第二轮回溯（名字应未知）', r2.subtype === 'success');
    t0 = Date.now();
    await s1.ask('记住我的名字叫测试员小明，只确认');
    const r3 = await s1.ask('我叫什么名字？一句话');
    check('记忆生效（回答测试员小明）', /测试员小明/.test(r3.result || ''), `result=${(r3.result || '').slice(0, 60)}`);
    console.log(`  记忆测试耗时 ${Date.now() - t0}ms`);

    // --- 4. 工具调用 + 审批 ---
    console.log('\n--- 4. 工具调用（写文件）---');
    t0 = Date.now();
    const r4 = await s1.ask('把"phase-b test"写入 test-output.txt', { timeoutMs: 120000 });
    check('写文件任务 success', r4.subtype === 'success' && !r4.is_error);
    const outFile = path.join(tmp, 'test-output.txt');
    check('产物存在', fs.existsSync(outFile), outFile);
    if (fs.existsSync(outFile)) {
      check('产物内容', fs.readFileSync(outFile, 'utf8').includes('phase-b test'));
    }
    check('审批回调被调用', s1.approvalCount >= 1, `审批次数=${s1.approvalCount}`);
    console.log(`  耗时 ${Date.now() - t0}ms`);

    // --- 5. 会话池多用户 ---
    console.log('\n--- 5. 会话池 ---');
    const s2 = await manager.getSession('user-b', { cwd: tmp });
    check('第二用户会话', s2.ready && s2.sessionId !== s1.sessionId);
    const stats = manager.getStats();
    check('会话池 2 个活跃', stats.active === 2, JSON.stringify(stats));
    const s1again = await manager.getSession('user-a', { cwd: tmp });
    check('复用已有会话', s1again === s1);

    // --- 6. 并发上限淘汰 ---
    console.log('\n--- 6. 并发上限淘汰 ---');
    const s3 = await manager.getSession('user-c', { cwd: tmp });
    const stats2 = manager.getStats();
    check('超上限后淘汰最旧', stats2.active <= 2, `active=${stats2.active}`);
    check('user-c 在池中', !!stats2.sessions['user-c']);
    s3.close();

    // --- 7. 释放 ---
    console.log('\n--- 7. 释放 ---');
    await manager.release('user-b');
    const stats3 = manager.getStats();
    check('user-b 已释放', !stats3.sessions['user-b']);

    console.log('\n=== 汇总 ===');
    const ok = results.filter((r) => r.ok).length;
    console.log(`通过 ${ok}/${results.length}`);
    process.exit(ok === results.length ? 0 : 1);
  } catch (e) {
    console.error('\n❌ 测试异常:', e);
    process.exit(1);
  } finally {
    manager.shutdown();
  }
})();
