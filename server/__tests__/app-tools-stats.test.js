// ACMS PR4 App-Tool 统计回归测试 (v0.66)
// 验证 app-tools-registry.getStats() 输出符合 RFC §5 PR4 验收标准
//
// 用法：node server/__tests__/app-tools-stats.test.js

const atr = require('../services/app-tools-registry');
const tr = require('../services/tool-registry');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}

(async () => {
  // 清理
  atr.resetStats();

  // 准备 mock ws sender
  let lastReq = null;
  atr.setWsSender((userId, msg) => {
    lastReq = msg;
    return { ok: true };
  });

  // ── Test 1: 注册 + 0 调用时 stats 形状 ──
  console.log('\n[test] 空 stats 形状');
  atr.registerClientAppTools('test-file-mgr', [{
    name: 'file_search', appId: 'test-file-mgr', description: 'd',
    parameters: { type: 'object', properties: { path: { type: 'string' } } }
  }]);
  let stats = atr.getStats();
  assert(stats.perTool !== undefined, 'stats.perTool 存在');
  assert(stats.totals !== undefined, 'stats.totals 存在');
  assert(Array.isArray(stats.totals.topErrors), 'totals.topErrors 是数组');
  assert(stats.totals.totalCalls === 0, '空 stats totalCalls = 0');
  assert(stats.totals.appToolCount === 1, 'appToolCount = 1');
  assert(stats.totals.totalToolCount >= 1, 'totalToolCount >= 1');
  assert(stats.totals.serverToolCount >= 0, 'serverToolCount >= 0');
  assert(stats.totals.registeredApps.length === 1, 'registeredApps 含 file-mgr');

  // ── Test 2: 成功调用 → recordCall(calls, latency, no error) ──
  console.log('\n[test] 成功调用 → calls++，no error');
  let invokeP = atr.invokeClientAppTool('file_search', { path: '/x' }, { userId: 'u1' });
  // 模拟客户端 50ms 后回传成功
  await new Promise(function(r) { setTimeout(r, 50); });
  atr.resolveClientResult(lastReq.reqId, { ok: true, files: [] });
  await invokeP;

  stats = atr.getStats();
  let fileSearch = stats.perTool.find(t => t.name === 'file_search');
  assert(fileSearch !== undefined, 'file_search 在 perTool');
  assert(fileSearch.calls === 1, 'file_search.calls = 1');
  assert(fileSearch.errors === 0, 'file_search.errors = 0');
  assert(fileSearch.errorRate === 0, 'file_search.errorRate = 0');
  assert(fileSearch.avgLatencyMs >= 50, 'file_search.avgLatencyMs >= 50ms（实际延迟）');
  assert(fileSearch.totalLatencyMs === fileSearch.avgLatencyMs, 'totalLatencyMs = avgLatencyMs（只有一次调用）');
  assert(fileSearch.lastCalled !== null, 'lastCalled 已设置');
  assert(fileSearch.lastError === null, 'lastError 仍为 null');

  // ── Test 3: 错误调用 → recordCall(calls++, errors++, errorTypes[code]++) ──
  console.log('\n[test] 错误调用 → errors++，errorTypes 聚合');
  let invokeErr = atr.invokeClientAppTool('file_search', { path: '/x' }, { userId: 'u1' });
  await new Promise(function(r) { setTimeout(r, 20); });
  atr.resolveClientResult(lastReq.reqId, { ok: false, error: 'NOT_FOUND', message: 'file not found' });
  await invokeErr;

  stats = atr.getStats();
  fileSearch = stats.perTool.find(t => t.name === 'file_search');
  assert(fileSearch.calls === 2, 'calls = 2');
  assert(fileSearch.errors === 1, 'errors = 1');
  assert(fileSearch.errorRate === 0.5, 'errorRate = 0.5');
  assert(fileSearch.errorTypes.length === 1, 'errorTypes 含 1 项');
  assert(fileSearch.errorTypes[0].code === 'NOT_FOUND', 'error code 正确');
  assert(fileSearch.errorTypes[0].count === 1, 'count = 1');
  assert(fileSearch.lastError.code === 'NOT_FOUND', 'lastError.code 正确');

  // ── Test 4: 超时 → 计入 TIMEOUT 错误 ──
  console.log('\n[test] 超时 → 计入 TIMEOUT');
  // 注册一个有短 timeout 的 tool
  atr.registerClientAppTools('test-slow', [{
    name: 'slow_op', appId: 'test-slow', description: 'd',
    parameters: { type: 'object', properties: {} },
    timeoutMs: 100,
  }]);
  let invokeTimeout = atr.invokeClientAppTool('slow_op', {}, { userId: 'u1' });
  const result = await invokeTimeout;
  assert(result.ok === false, 'returns ok:false');
  assert(result.error === 'TIMEOUT', 'error = TIMEOUT');

  stats = atr.getStats();
  const slowOp = stats.perTool.find(t => t.name === 'slow_op');
  assert(slowOp !== undefined, 'slow_op 在 perTool');
  assert(slowOp.calls === 1, 'slow_op.calls = 1');
  assert(slowOp.errors === 1, 'slow_op.errors = 1');
  assert(slowOp.errorTypes[0].code === 'TIMEOUT', 'error code = TIMEOUT');

  // ── Test 5: 高频错误聚合（topErrors）──
  console.log('\n[test] topErrors 跨 tool 聚合');
  // 加更多 NOT_FOUND 错误
  for (let i = 0; i < 3; i++) {
    let p = atr.invokeClientAppTool('file_search', { path: '/x' }, { userId: 'u1' });
    await new Promise(function(r) { setTimeout(r, 10); });
    atr.resolveClientResult(lastReq.reqId, { ok: false, error: 'NOT_FOUND' });
    await p;
  }

  stats = atr.getStats();
  const notFoundErr = stats.totals.topErrors.find(e => e.code === 'NOT_FOUND');
  assert(notFoundErr !== undefined, 'topErrors 含 NOT_FOUND');
  assert(notFoundErr.count >= 4, 'NOT_FOUND count >= 4（之前 1 + 现在 3）');
  const timeoutErr = stats.totals.topErrors.find(e => e.code === 'TIMEOUT');
  assert(timeoutErr !== undefined, 'topErrors 含 TIMEOUT');
  // NOT_FOUND 应排第一（count 更高）
  assert(stats.totals.topErrors[0].code === 'NOT_FOUND', 'topErrors[0] = NOT_FOUND（count 最多）');

  // ── Test 6: totals.totalCalls / totalErrors ──
  console.log('\n[test] totals 聚合正确');
  assert(stats.totals.totalCalls >= 6, 'totalCalls >= 6（file_search 5 + slow_op 1）');
  assert(stats.totals.totalErrors >= 5, 'totalErrors >= 5（NOT_FOUND ×4 + TIMEOUT ×1）');
  assert(stats.totals.appToolCount === 2, 'appToolCount = 2（file_search + slow_op）');
  assert(stats.totals.totalToolCount >= 2, 'totalToolCount >= 2');

  // ── Test 7: tool-registry.getAppToolStats 透传 ──
  console.log('\n[test] tool-registry.getAppToolStats 透传');
  const wrapped = tr.getAppToolStats();
  assert(wrapped.perTool !== undefined, 'wrapped.perTool 存在');
  assert(wrapped.totals !== undefined, 'wrapped.totals 存在');
  assert(wrapped.perTool.length === 2, 'wrapped.perTool 含 2 个 tool');

  // ── Test 8: CLIENT_OFFLINE 错误也计入 ──
  console.log('\n[test] CLIENT_OFFLINE 错误计入');
  atr.setWsSender(() => ({ ok: false, error: 'CLIENT_OFFLINE' }));
  let p = atr.invokeClientAppTool('file_search', {}, { userId: 'u1' });
  const clientOfflineResult = await p;
  assert(clientOfflineResult.ok === false, 'returns ok:false');
  assert(clientOfflineResult.error === 'CLIENT_OFFLINE', 'error = CLIENT_OFFLINE');

  stats = atr.getStats();
  const clientOfflineErr = stats.totals.topErrors.find(e => e.code === 'CLIENT_OFFLINE');
  assert(clientOfflineErr !== undefined, 'topErrors 含 CLIENT_OFFLINE');

  // ── Test 9: pendingInvokes 实时统计 ──
  console.log('\n[test] pendingInvokes 统计');
  // 注册一个短超时 tool，让 pending 不会无限挂
  atr.registerClientAppTools('test-pending', [{
    name: 'pending_op', appId: 'test-pending', description: 'd',
    parameters: { type: 'object', properties: {} },
    timeoutMs: 50,
  }]);
  atr.setWsSender(() => ({ ok: true }));  // 不 resolve，让它超时
  const ip1 = atr.invokeClientAppTool('pending_op', {}, {});
  const ip2 = atr.invokeClientAppTool('pending_op', {}, {});
  let statsMid = atr.getStats();
  assert(statsMid.totals.pendingInvokes >= 1, '至少有 1 个 pending（具体取决于时序）');
  // 等所有 timeout 触发
  await Promise.allSettled([ip1, ip2]);
  stats = atr.getStats();
  assert(stats.totals.pendingInvokes === 0, 'timeout 触发后 pendingInvokes = 0');
  atr.unregisterClientAppTools('test-pending');

  // ── Test 10: resetStats 清空 ──
  console.log('\n[test] resetStats');
  atr.resetStats();
  stats = atr.getStats();
  assert(stats.perTool.length === 0, 'resetStats 后 perTool 清空');
  assert(stats.totals.totalCalls === 0, 'totalCalls = 0');

  // ── 清理 ──
  atr.unregisterClientAppTools('test-file-mgr');
  atr.unregisterClientAppTools('test-slow');

  console.log(`\n[结果] ${passed} 通过, ${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('test threw:', e); process.exit(1); });