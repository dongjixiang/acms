// ACMS App-Tools 链路回归测试 (v0.66 PR1.3)
// 模拟客户端 WS 通信，验证 tool-registry.execute → app-tools-registry → WS → 客户端回传 → resolve 完整链路
//
// 用法：node server/__tests__/app-tools.test.js
// 不依赖 ACMS 启动，可在任何时候跑

const path = require('path');
const tr = require('../services/tool-registry');
const atr = require('../services/app-tools-registry');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}

async function test(name, fn) {
  console.log('\n[test]', name);
  try { await fn(); }
  catch (e) { failed++; console.error('  ✗ threw:', e.message); }
}

(async () => {
  // ── Test 1: 注册 + 列表 ──
  await test('register + list', async () => {
    const r = atr.registerClientAppTools('test-file-mgr', [
      { name: 'file_search', description: 'd', parameters: { type: 'object', properties: { path: { type: 'string' }, query: { type: 'string' } } } },
    ]);
    assert(r.ok === true, 'register returns ok');
    assert(atr.listAppToolNames().includes('file_search'), 'listAppToolNames contains file_search');
    assert(atr.getAppToolSchema('file_search') !== null, 'getAppToolSchema returns schema');
  });

  // ── Test 2: 同名校验（不同 app 不能同名） ──
  await test('name conflict detection', async () => {
    const r = atr.registerClientAppTools('test-other-app', [
      { name: 'file_search', description: 'd', parameters: { type: 'object', properties: {} } },
    ]);
    assert(r.ok === false, 'second register with same name fails');
    assert(r.error === 'NAME_CONFLICT', 'error code is NAME_CONFLICT');
  });

  // ── Test 3: invoke 链路（mock WS） ──
  await test('invoke round-trip via mock WS', async () => {
    let sentMsg = null;
    atr.setWsSender((userId, msg) => { sentMsg = msg; return { ok: true }; });

    const invokePromise = atr.invokeClientAppTool('file_search', { path: '/tmp', query: 'README' }, { userId: 'u1' });

    // 异步模拟客户端 handler 执行
    setTimeout(() => {
      assert(sentMsg !== null, 'ws sender invoked');
      assert(sentMsg.type === 'app_tool:invoke', 'message type is app_tool:invoke');
      assert(sentMsg.toolName === 'file_search', 'toolName matches');
      assert(sentMsg.reqId && sentMsg.reqId.startsWith('at_'), 'reqId generated');
      // 模拟客户端 handler 异步返回
      atr.resolveClientResult(sentMsg.reqId, { ok: true, files: [{ name: 'README.md' }], count: 1 });
    }, 10);

    const result = await invokePromise;
    assert(result.ok === true, 'invoke resolved with ok');
    assert(result.count === 1, 'result count matches');
    assert(result.files[0].name === 'README.md', 'result file name matches');
  });

  // ── Test 4: invoke 找不到 tool ──
  await test('invoke unknown tool', async () => {
    const result = await atr.invokeClientAppTool('non_existent_tool', {}, {});
    assert(result.ok === false, 'returns ok:false');
    assert(result.error === 'TOOL_NOT_FOUND', 'error is TOOL_NOT_FOUND');
  });

  // ── Test 5: invoke 客户端离线 ──
  await test('invoke client offline', async () => {
    atr.setWsSender(() => ({ ok: false, error: 'NO_CLIENT' }));
    const result = await atr.invokeClientAppTool('file_search', {}, {});
    assert(result.ok === false, 'returns ok:false');
    assert(result.error === 'NO_CLIENT', 'error is NO_CLIENT');
  });

  // ── Test 6: tool-registry.execute 路由到 app-tool ──
  await test('tool-registry.execute routes to app-tool', async () => {
    atr.setWsSender((userId, msg) => {
      // 模拟客户端立即回传
      setTimeout(() => atr.resolveClientResult(msg.reqId, { ok: true, files: [], count: 0, routed: true }), 5);
      return { ok: true };
    });

    const result = await tr.execute('file_search', { path: '/', query: 'x' }, { userId: 'u1' });
    assert(result.ok === true, 'execute returns ok');
    assert(result.routed === true, 'result indicates it was routed through app-tool');
  });

  // ── Test 7: tool-registry.execute 找不到 tool ──
  await test('tool-registry.execute unknown tool throws', async () => {
    try {
      await tr.execute('totally_made_up_tool', {}, {});
      assert(false, 'should have thrown');
    } catch (e) {
      assert(e.message.includes('未知工具'), 'throws 未知工具 error');
    }
  });

  // ── 清理 ──
  atr.unregisterClientAppTools('test-file-mgr');
  atr.unregisterClientAppTools('test-other-app');

  console.log(`\n[结果] ${passed} 通过, ${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
})();