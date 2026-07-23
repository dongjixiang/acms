// Plan Executor 核心逻辑测试 (v0.48)
// 验证：
//   - 正常 2 步 plan 串行执行
//   - 失败步骤的下游依赖 skipped
//   - plan_done entry 写入
//
// 不依赖真实 server / DB / LLM，只 mock tool + appendChatEntry + reqStore

const path = require('path');
const ROOT = path.join(__dirname, '..');

// === Mock 1: 注册 mock tool 到 tool-registry ===
const { registerTool } = require(path.join(ROOT, 'server/services/tool-registry'));

registerTool({
  name: 'mock_generate_image',
  description: 'mock',
  parameters: { type: 'object', properties: {} },
  async handler(args) {
    return { ok: true, image_url: 'https://mock/img.png', prompt: args.prompt };
  },
});

registerTool({
  name: 'mock_send_email',
  description: 'mock',
  parameters: { type: 'object', properties: {} },
  async handler(args) {
    return { ok: true, message_id: '<mock@x>', to: args.to };
  },
});

registerTool({
  name: 'mock_fail',
  description: 'mock',
  parameters: { type: 'object', properties: {} },
  async handler(args) {
    return { ok: false, error: 'MOCK_FAIL', message: 'intentional fail' };
  },
});

registerTool({
  name: 'mock_throw',
  description: 'mock',
  parameters: { type: 'object', properties: {} },
  async handler() {
    throw new Error('MOCK_THROW');
  },
});

console.log('[mock] 4 个 mock tool 注册完成');

// === Mock 2: 拦截 reqStore.update，把 plan 数据存到内存 ===
const fakeStore = { reqId: 'TEST-REQ', plan: null, plan_status: null };
const realReqStore = require(path.join(ROOT, 'server/stores/requirement-store'));
const origUpdate = realReqStore.update;
realReqStore.update = function (id, updates) {
  if (id === fakeStore.reqId) {
    if (updates.plan !== undefined) fakeStore.plan = updates.plan;
    if (updates.plan_status !== undefined) fakeStore.plan_status = updates.plan_status;
  }
  return origUpdate.call(this, id, updates);
};

// === Mock 3: 拦截 appendChatEntry，存到内存 ===
const chatHistory = [];
const chatIntentModule = require(path.join(ROOT, 'server/routes/chat-intent'));
const origAppend = chatIntentModule.appendChatEntry;
chatIntentModule.appendChatEntry = function (reqId, entry) {
  if (reqId === fakeStore.reqId) {
    chatHistory.push(entry);
    return;
  }
  return origAppend.call(this, reqId, entry);
};

// === 跑测试 ===
const planExecutor = require(path.join(ROOT, 'server/services/plan-executor'));

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    console.log(e.stack);
    process.exit(1);
  }
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  console.log('\n=== Test A: 正常 2 步 plan（generate_image → send_email）===');
  chatHistory.length = 0;
  fakeStore.plan = null;
  fakeStore.plan_status = null;

  const r = await planExecutor.executePlan(fakeStore.reqId, {
    summary: '生成图片并发邮件',
    steps: [
      { id: 's1', tool: 'mock_generate_image', args: { prompt: '小猫小狗打架' } },
      { id: 's2', tool: 'mock_send_email', args: { to: 'oracle@x.com' }, depends_on: ['s1'] },
    ],
  });
  if (!r.ok) throw new Error('executePlan 返回失败: ' + r.error);

  // 等待 setImmediate + runPlan 完成
  await sleep(500);

  // 验证 system entries
  const sources = chatHistory.map((e) => e.source);
  console.log(`  system entries: ${sources.join(', ')}`);
  if (!sources.includes('plan_loading')) throw new Error('缺 plan_loading entry');
  if (!sources.includes('plan_done')) throw new Error('缺 plan_done entry');

  // 验证 plan_done entry
  const doneEntry = chatHistory.find((e) => e.source === 'plan_done');
  const doneData = JSON.parse(doneEntry.text);
  console.log(`  plan_done status: ${doneData.status}, duration: ${doneData.duration_ms}ms`);
  if (doneData.status !== 'done') throw new Error(`plan_done.status 应为 done, 实际 ${doneData.status}`);

  // 验证 plan 终态
  const finalPlan = JSON.parse(fakeStore.plan);
  console.log(`  plan status: ${finalPlan.status}, steps: ${finalPlan.steps.map((s) => `${s.id}:${s.status}`).join(', ')}`);
  if (finalPlan.status !== 'done') throw new Error(`plan.status 应为 done`);
  for (const s of finalPlan.steps) {
    if (s.status !== 'done') throw new Error(`step ${s.id} 应为 done, 实际 ${s.status}`);
  }

  await test('Test A: 正常 plan 全 done', async () => {});

  console.log('\n=== Test B: 步骤 1 失败 → 步骤 2 skipped ===');
  chatHistory.length = 0;
  fakeStore.plan = null;
  fakeStore.plan_status = null;

  await planExecutor.executePlan(fakeStore.reqId, {
    summary: '失败隔离测试',
    steps: [
      { id: 's1', tool: 'mock_fail', args: {} },
      { id: 's2', tool: 'mock_send_email', args: { to: 'a' }, depends_on: ['s1'] },
      { id: 's3', tool: 'mock_generate_image', args: { prompt: 'x' }, depends_on: ['s1'] },
    ],
  });
  await sleep(500);

  const finalPlanB = JSON.parse(fakeStore.plan);
  console.log(`  plan status: ${finalPlanB.status}, steps: ${finalPlanB.steps.map((s) => `${s.id}:${s.status}`).join(', ')}`);
  if (finalPlanB.status !== 'partial_failed') throw new Error('plan.status 应为 partial_failed');
  if (finalPlanB.steps[0].status !== 'failed') throw new Error('s1 应 failed');
  if (finalPlanB.steps[1].status !== 'skipped') throw new Error('s2 应 skipped');
  if (finalPlanB.steps[2].status !== 'skipped') throw new Error('s3 应 skipped');

  await test('Test B: 失败隔离 + skipped', async () => {});

  console.log('\n=== Test C: topologicalSort 检测 cycle (validatePlan 不查) ===');
  // validatePlan 接受 cycle 定义（id 引用合法），但 topologicalSort 抛错
  const v = planExecutor.validatePlan({
    summary: 'cycle test',
    steps: [
      { id: 's1', tool: 'mock_generate_image', args: {}, depends_on: ['s2'] },
      { id: 's2', tool: 'mock_generate_image', args: {}, depends_on: ['s1'] },
    ],
  });
  if (!v.ok) throw new Error('validatePlan 应通过 cycle 校验 (cycle detection 在 topologicalSort)');
  let threwCycle = false;
  try {
    planExecutor.topologicalSort(v.steps);
  } catch (e) {
    if (e.message.includes('CYCLE_DEP')) threwCycle = true;
  }
  if (!threwCycle) throw new Error('topologicalSort 应抛 CYCLE_DEP');

  await test('Test C: cycle 检测', async () => {});

  console.log('\n=== Test D: validatePlan 拒绝 unknown tool ===');
  const v2 = planExecutor.validatePlan({
    summary: 'unknown',
    steps: [{ id: 's1', tool: 'totally_fake', args: {} }],
  });
  if (v2.ok || !v2.error.includes('UNKNOWN_TOOL')) throw new Error('应返回 UNKNOWN_TOOL');

  await test('Test D: unknown tool 拒绝', async () => {});

  console.log('\n=== Test E: plan 字段持久化验证 ===');
  if (!fakeStore.plan) throw new Error('plan 字段未持久化');
  if (fakeStore.plan_status !== 'partial_failed') throw new Error('plan_status 应为 partial_failed');
  await test('Test E: plan + plan_status 持久化', async () => {});

  console.log('\n=== Test F: tool throw → 当前 step failed + 下游 skipped ===');
  chatHistory.length = 0;
  fakeStore.plan = null;
  fakeStore.plan_status = null;

  await planExecutor.executePlan(fakeStore.reqId, {
    summary: '异常失败隔离测试',
    steps: [
      { id: 's1', tool: 'mock_throw', args: {} },
      { id: 's2', tool: 'mock_send_email', args: { to: 'a' }, depends_on: ['s1'] },
    ],
  });
  await sleep(500);

  const finalPlanF = JSON.parse(fakeStore.plan);
  console.log(`  plan status: ${finalPlanF.status}, steps: ${finalPlanF.steps.map((s) => `${s.id}:${s.status}`).join(', ')}`);
  if (finalPlanF.status !== 'partial_failed') throw new Error('异常 plan.status 应为 partial_failed');
  if (finalPlanF.steps[0].status !== 'failed') throw new Error('异常 s1 应 failed');
  if (finalPlanF.steps[1].status !== 'skipped') throw new Error('异常 s2 应 skipped');
  if (!chatHistory.some(e => e.source === 'plan_warning')) throw new Error('异常路径缺 plan_warning');
  await test('Test F: throw 异常隔离 + skipped', async () => {});

  console.log('\n=== 全部通过 ===');
}

main().catch((e) => { console.error('test crashed:', e); process.exit(1); });