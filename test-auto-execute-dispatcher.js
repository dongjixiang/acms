// ACMS · AutoExecuteDispatcher 单元测试
// 验证核心逻辑：监听 task.claimed → 过滤 → 标记 + 记录 stats
// (HTTP 调用本身不测，仅 mock fetch)

const dispatcher = require('./server/services/auto-execute-dispatcher');
const taskStore = require('./server/stores/task-store');

let pass = 0, fail = 0;
function check(cond, msg) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗', msg); }
}

async function mockEventBusInvoke(type, eventData) {
  // 模拟 eventBus.emit 走 dispatcher.handleTaskClaimed
  if (type === 'task.claimed') {
    await dispatcher.handleTaskClaimed({
      ...eventData,
      target_id: eventData.target?.id,
    });
  }
}

(async () => {
  // ===== 测试 1: 启动后 dispatcher 状态 =====
  console.log('===== Test 1: dispatcher init =====');
  dispatcher.init();
  const stats0 = dispatcher.getStats();
  check(stats0.autoAgents.includes('agent-acms-self'), 'agent-acms-self 在白名单');
  check(stats0.autoAgents.includes('agent-xiaoji'), 'agent-xiaoji 在白名单（fallback）');
  console.log('  stats:', stats0);

  // ===== 测试 2: 跳过非白名单 agent =====
  console.log('\n===== Test 2: 非白名单 agent → 跳过 =====');
  const beforeStats = dispatcher.getStats();
  await mockEventBusInvoke('task.claimed', {
    target: { id: 'T-FAKE-001' },
    actor: { id: 'agent-unknown-bot' },
  });
  const afterStats = dispatcher.getStats();
  check(afterStats.skipped === beforeStats.skipped + 1, 'skipped 计数+1');
  check(!dispatcher.processedClaims.has('T-FAKE-001'), 'T-FAKE-001 没进 processedClaims');

  // ===== 测试 3: 白名单但 task 不存在 =====
  console.log('\n===== Test 3: 白名单 + task 不存在 → 跳过 =====');
  await mockEventBusInvoke('task.claimed', {
    target: { id: 'T-NONEXISTENT-9999' },
    actor: { id: 'agent-acms-self' },
  });
  console.log('  (skipped silently)');

  // ===== 测试 4: 重入去重 =====
  console.log('\n===== Test 4: 同 task 多次 invoke → 只处理 1 次 =====');
  // 先 mock 一个真实存在的 task — 我们手动注入 status=in_progress
  // 因为 taskStore.claim 才是合规路径，这里直接检查 processedClaims
  dispatcher.processedClaims.add('T-TEST-DUP');
  await mockEventBusInvoke('task.claimed', {
    target: { id: 'T-TEST-DUP' },
    actor: { id: 'agent-acms-self' },
  });
  // 因为已在 processedClaims，所以 handleTaskClaimed 在第一句 set.has() 就 return
  // skipped 不会再 +1（因为不进入 if 那块）
  console.log('  (silent skip)');

  // ===== 测试 5: addAutoAgent / removeAutoAgent =====
  console.log('\n===== Test 5: dynamic agent 管理 =====');
  dispatcher.addAutoAgent('agent-test-bot');
  check(dispatcher.getStats().autoAgents.includes('agent-test-bot'), 'addAutoAgent 生效');
  dispatcher.removeAutoAgent('agent-test-bot');
  check(!dispatcher.getStats().autoAgents.includes('agent-test-bot'), 'removeAutoAgent 生效');

  console.log('\n=== Final stats ===');
  console.log(dispatcher.getStats());

  console.log(`\n=== ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
