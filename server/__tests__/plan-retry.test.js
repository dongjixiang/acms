// PR5 测试：plan-retry 路由 + 前端重试 UI（v0.120）
//
// 覆盖：
//   1. collectFailedSteps 只挑 failed/skipped，保留 error/depends_on
//   2. buildRetryMessage 含每个失败 step 的 id/tool/error + 已完成的步骤清单
//   3. buildRetryMessage 含混类约束提示（结构性 op 不能与内容类同批）
//   4. 路由：plan 不存在 → 404 PLAN_NOT_FOUND
//   5. 路由：req 不存在 → 404 REQ_NOT_FOUND
//   6. 路由：无失败步骤 → 200 {retried:false, reason:NO_FAILED_STEPS}（幂等，不触发 LLM）
//   7. 路由：有失败步骤 → 200 {retried:true, retry_message, failed_steps}
//   8. 前端 plan.js 静态检查：renderRetryButton 存在 + 只在 failed>0 出现
//   9. 前端 chat.js 静态检查：retryFailedPlanSteps 挂到 window
//
// 跑法：node server/__tests__/plan-retry.test.js

'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}\n     ${e.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}\n     ${e.message}`);
  }
}

// ── 准备：直接 require 路由模块，避开 app.js（兄弟 agent 的 merge conflict 会让它崩）
const planRetry = require(path.join(ROOT, 'server', 'routes', 'plan-retry.js'));
const { collectFailedSteps, buildRetryMessage } = planRetry.__test;

// ── 1-3. 纯函数测试 ──

console.log('\n[1] collectFailedSteps');

test('只挑 failed / skipped，保留 error + depends_on', () => {
  const planDoc = {
    planId: 'plan_abc',
    summary: '给 Excel 加汇总 sheet',
    steps: [
      { id: 's1', tool: 'office_action', status: 'done' },
      { id: 's2', tool: 'office_action', status: 'failed', error: 'MIXED_CLASS_OPS', depends_on: ['s1'], args: { kind: 'xlsx' } },
      { id: 's3', tool: 'office_action', status: 'skipped', error: 'upstream failed', depends_on: ['s2'] },
    ],
  };
  const out = collectFailedSteps(planDoc);
  assert.strictEqual(out.length, 2, `期望 2 个失败步骤，实际 ${out.length}`);
  assert.strictEqual(out[0].id, 's2');
  assert.strictEqual(out[0].error, 'MIXED_CLASS_OPS');
  assert.deepStrictEqual(out[0].depends_on, ['s1']);
  assert.strictEqual(out[1].id, 's3');
  assert.strictEqual(out[1].status, 'skipped');
});

test('空 steps / null planDoc 不炸，返回 []', () => {
  assert.deepStrictEqual(collectFailedSteps(null), []);
  assert.deepStrictEqual(collectFailedSteps({}), []);
  assert.deepStrictEqual(collectFailedSteps({ steps: [] }), []);
});

console.log('\n[2] buildRetryMessage');

test('含每个失败 step 的 id/tool/error', () => {
  const planDoc = {
    planId: 'plan_xyz',
    summary: '合并考勤 sheet',
    steps: [
      { id: 's1', tool: 'office_action', status: 'done' },
      { id: 's2', tool: 'office_action', status: 'failed', error: 'Structural operations must be in separate batches' },
    ],
  };
  const failedSteps = collectFailedSteps(planDoc);
  const msg = buildRetryMessage(planDoc, failedSteps);

  assert.ok(msg.includes('s2'), '应含失败步骤 id s2');
  assert.ok(msg.includes('office_action'), '应含 tool 名');
  assert.ok(msg.includes('Structural operations must be in separate batches'), '应含原始 error 文本');
  assert.ok(msg.includes('[系统提示]'), '应标明是系统提示不是用户原话');
});

test('已完成步骤列为"不要重做"', () => {
  const planDoc = {
    planId: 'plan_1',
    summary: 'x',
    steps: [
      { id: 's1', tool: 'office_action', status: 'done' },
      { id: 's2', tool: 'office_action', status: 'failed', error: 'E' },
    ],
  };
  const msg = buildRetryMessage(planDoc, collectFailedSteps(planDoc));
  assert.ok(msg.includes('已完成（不要重做）'), '应有"不要重做"段');
  assert.ok(msg.includes('✅ s1'), 's1 应被标为已完成');
});

test('含混类约束提示（结构性 op 不能与内容类同批）', () => {
  const planDoc = { planId: 'p', summary: 's', steps: [{ id: 's1', tool: 'office_action', status: 'failed', error: 'E' }] };
  const msg = buildRetryMessage(planDoc, collectFailedSteps(planDoc));
  assert.ok(msg.includes('结构类操作'), '应含结构类操作约束');
  assert.ok(msg.includes('不能与内容类操作'), '应含不能混批说明');
  assert.ok(msg.includes('refreshContext'), '应含 refreshContext 规则');
});

// ── 4-7. 路由测试（用真实 express app 挂载，mock store） ──

/**
 * 造一个假 reqStore（拦截 require 缓存里的真 store）
 * 因为 plan-retry.js 内部 require('../stores/requirement-store')，
 * 用 require.cache 注入 mock 最省事。
 */
function mockReqStore(record) {
  const p = require.resolve(path.join(ROOT, 'server', 'stores', 'requirement-store.js'));
  const saved = require.cache[p];
  require.cache[p] = {
    id: p, filename: p, loaded: true,
    exports: { getById: (id) => (record && record.id === id ? record : null) },
  };
  return () => { if (saved) require.cache[p] = saved; else delete require.cache[p]; };
}

/** 起一个临时 express app，挂 plan-retry 路由，用 Node 内置 fetch 打 */
function startApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  // 重新 require 一份干净路由（避免和前面 require 的单例互相污染）
  delete require.cache[require.resolve(path.join(ROOT, 'server', 'routes', 'plan-retry.js'))];
  const router = require(path.join(ROOT, 'server', 'routes', 'plan-retry.js'));
  app.use('/api/requirements', router);
  app.use((err, _req, res, _next) => res.status(500).json({ error: 'INTERNAL', message: err.message }));
  return new Promise((resolve) => {
    const srv = app.listen(0, () => resolve({ srv, port: srv.address().port }));
  });
}

async function post(port, url, body) {
  const r = await fetch(`http://127.0.0.1:${port}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

(async function run() {
  console.log('\n[3] 路由端点');

  // case: req 不存在
  {
    const restore = mockReqStore(null);
    const { srv, port } = await startApp();
    await testAsync('req 不存在 → 404 REQ_NOT_FOUND', async () => {
      const r = await post(port, '/api/requirements/REQ-NOPE/plan/p1/retry', {});
      assert.strictEqual(r.status, 404);
      assert.strictEqual(r.json.error, 'REQ_NOT_FOUND');
    });
    srv.close();
    restore();
  }

  // case: plan 不存在
  {
    const restore = mockReqStore({ id: 'REQ-A', plan: null });
    const { srv, port } = await startApp();
    await testAsync('req 有但 plan 为空 → 404 PLAN_NOT_FOUND', async () => {
      const r = await post(port, '/api/requirements/REQ-A/plan/p1/retry', {});
      assert.strictEqual(r.status, 404);
      assert.strictEqual(r.json.error, 'PLAN_NOT_FOUND');
    });
    srv.close();
    restore();
  }

  // case: planId 不匹配
  {
    const plan = JSON.stringify({ planId: 'plan_real', summary: 's', steps: [{ id: 's1', tool: 't', status: 'failed', error: 'E' }] });
    const restore = mockReqStore({ id: 'REQ-B', plan });
    const { srv, port } = await startApp();
    await testAsync('planId 不匹配 → 404 PLAN_ID_MISMATCH', async () => {
      const r = await post(port, '/api/requirements/REQ-B/plan/plan_wrong/retry', {});
      assert.strictEqual(r.status, 404);
      assert.strictEqual(r.json.error, 'PLAN_ID_MISMATCH');
      assert.strictEqual(r.json.current, 'plan_real');
    });
    srv.close();
    restore();
  }

  // case: 无失败步骤 → 幂等返回，不触发 LLM
  {
    const plan = JSON.stringify({ planId: 'plan_ok', summary: 's', steps: [{ id: 's1', tool: 't', status: 'done' }] });
    const restore = mockReqStore({ id: 'REQ-C', plan });
    const { srv, port } = await startApp();
    await testAsync('无失败步骤 → retried:false + NO_FAILED_STEPS（幂等）', async () => {
      const r = await post(port, '/api/requirements/REQ-C/plan/plan_ok/retry', {});
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.ok, true);
      assert.strictEqual(r.json.retried, false);
      assert.strictEqual(r.json.reason, 'NO_FAILED_STEPS');
      assert.ok(!r.json.retry_message, '不应返回 retry_message（不会触发 LLM）');
    });
    srv.close();
    restore();
  }

  // case: 有失败步骤 → 返回 retry_message + failed_steps
  {
    const plan = JSON.stringify({
      planId: 'plan_fail', summary: '给考勤表加汇总 sheet',
      steps: [
        { id: 's1', tool: 'office_action', status: 'done' },
        { id: 's2', tool: 'office_action', status: 'failed', error: 'MIXED_CLASS_OPS' },
      ],
    });
    const restore = mockReqStore({ id: 'REQ-D', plan });
    const { srv, port } = await startApp();
    await testAsync('有失败步骤 → retried:true + retry_message + failed_steps=[s2]', async () => {
      const r = await post(port, '/api/requirements/REQ-D/plan/plan_fail/retry', {});
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.retried, true);
      assert.deepStrictEqual(r.json.failed_steps, ['s2']);
      assert.ok(r.json.retry_message.includes('MIXED_CLASS_OPS'), 'retry_message 应含失败 error');
      assert.ok(r.json.retry_message.includes('plan_fail'), 'retry_message 应含 plan id');
    });
    srv.close();
    restore();
  }

  // ── 8-9. 前端静态检查 ──

  console.log('\n[4] 前端静态检查');

  const planJs = fs.readFileSync(path.join(ROOT, 'client/js/views/assists/plan.js'), 'utf8');
  const chatJs = fs.readFileSync(path.join(ROOT, 'client/js/views/requirements/chat.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(ROOT, 'client/index.html'), 'utf8');

  test('plan.js 定义了 renderRetryButton 并在 renderPlanInner 调用', () => {
    assert.ok(planJs.includes('function renderRetryButton'), '应定义 renderRetryButton');
    assert.ok(planJs.includes('const retryHtml = renderRetryButton(data, counts, overall)'), 'renderPlanInner 应调用它');
    assert.ok(planJs.includes('${retryHtml}'), '应插入到 HTML 模板');
  });

  test('renderRetryButton 只在 failed>0 且终态时出现', () => {
    assert.ok(planJs.includes("if (overall !== 'partial_failed' && overall !== 'done') return ''"), '应限制终态');
    assert.ok(planJs.includes('if (failedCount === 0) return'), '应限制 failed>0');
  });

  test('按钮显式颜色（防隐形按钮）', () => {
    assert.ok(planJs.includes('background:#2d3748'), '应设背景色');
    assert.ok(planJs.includes('color:#e2e8f0'), '应设文字色');
  });

  test('aggregateAndRender 注入 __reqId', () => {
    assert.ok(planJs.includes('p.data.__reqId = reqId'), '应把 reqId 注入 data');
  });

  test('chat.js 定义 retryFailedPlanSteps 并挂到 window', () => {
    assert.ok(chatJs.includes('async function retryFailedPlanSteps(btn)'), '应定义函数');
    assert.ok(chatJs.includes('window.retryFailedPlanSteps = retryFailedPlanSteps'), '应挂 window');
  });

  test('chat.js 重试走标准发送链路（chatSendDetect）+ 调 retry 端点', () => {
    assert.ok(chatJs.includes('/plan/${planId}/retry'), '应调 retry 端点');
    assert.ok(chatJs.includes('await chatSendDetect(reqId, r.retry_message)'), '应走 chatSendDetect');
  });

  test('index.html 已 bump plan.js + chat.js 版本号', () => {
    assert.ok(indexHtml.includes('plan.js?v=0.120'), 'plan.js 版本应 bump');
    assert.ok(indexHtml.includes('chat.js?v=0.22.49'), 'chat.js 版本应 bump');
  });

  // ── 汇总 ──

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`结果：${passed} 通过 / ${failed} 失败（共 ${passed + failed}）`);
  if (failed) {
    console.log('\n失败详情：');
    for (const f of failures) console.log(`  ❌ ${f.name}\n     ${f.error}`);
    process.exit(1);
  }
  console.log('全部通过 ✅');
  // SQLite / express 句柄让进程不自然退出，显式结束
  process.exit(0);
})();
