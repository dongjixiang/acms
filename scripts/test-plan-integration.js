// Plan Executor 集成测试 (v0.48.1)
// 不 mock appendChatEntry —— 真实 require chat-intent.js，验证模块导出层 + DB 写入
//
// 这个测试专门抓 c941b54 commit 引入的 bug：
//   chat-intent.js 没 export appendChatEntry
//   plan-executor.js 调 undefined(reqId, entry) 抛 TypeError
//   writeSystemEntry 的 try/catch 静默吞掉
//   后果：requirement.plan 写对了，但 supplement_history 永远没 plan_* entries
//   前端聚合渲染找不到 plan-bubble → 用户看不到 ⏳ 进度卡
//
// mock 测试（test-plan-executor.js）掩盖了这个 bug，因为它替换了 appendChatEntry
// 这个测试不 mock，所以一旦模块导出层断了，测试立刻挂

const path = require('path');
const ROOT = path.join(__dirname, '..');

// === 不 mock appendChatEntry — 真实 require ===
// 但需要一个临时 REQ 来跑 plan（不能污染生产数据）
// 用现有 REQ 的第一个，结束后清掉 plan 字段
const reqStore = require(path.join(ROOT, 'server/stores/requirement-store'));
const reqs = reqStore.list({ limit: 1 });
if (reqs.length === 0) {
  console.log('❌ 数据库无 REQ，跳过集成测试');
  process.exit(1);
}
const reqId = reqs[0].id;
console.log(`[setup] 测试目标 REQ: ${reqId}`);

// 清空旧 plan 字段
reqStore.update(reqId, { plan: null, plan_status: null });

// === 关键检查 1: chat-intent.js 必须 export appendChatEntry ===
const chatIntent = require(path.join(ROOT, 'server/routes/chat-intent'));
console.log(`[check] typeof chatIntent.appendChatEntry = ${typeof chatIntent.appendChatEntry}`);
if (typeof chatIntent.appendChatEntry !== 'function') {
  console.log('❌ chat-intent.js 没 export appendChatEntry');
  console.log('   → plan-executor 写 system entries 时会调 undefined() 抛 TypeError');
  console.log('   → 写 entry 全部静默失败，前端聚合渲染找不到 plan-bubble');
  console.log('   → 修复：chat-intent.js 末尾加 module.exports.appendChatEntry = appendChatEntry;');
  process.exit(1);
}
console.log('✅ chat-intent.js 正确 export appendChatEntry');

// === 注册 mock tool ===
const { registerTool } = require(path.join(ROOT, 'server/services/tool-registry'));
registerTool({
  name: '__integration_test_tool',
  description: 'integration test',
  parameters: { type: 'object', properties: {} },
  async handler() {
    return { ok: true };
  },
});
console.log('[setup] mock tool 注册完成');

// === 调 planExecutor.executePlan（真实，不 mock appendChatEntry）===
const planExecutor = require(path.join(ROOT, 'server/services/plan-executor'));

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  console.log('\n=== 集成测试：executePlan 真实写入 ===');
  const r = await planExecutor.executePlan(reqId, {
    summary: '集成测试',
    steps: [
      { id: 's1', tool: '__integration_test_tool', args: {} },
      { id: 's2', tool: '__integration_test_tool', args: {}, depends_on: ['s1'] },
    ],
  });
  if (!r.ok) {
    console.log(`❌ executePlan 返回失败: ${r.error}`);
    process.exit(1);
  }
  console.log(`[run] executePlan 启动 plan_id=${r.plan_id}`);

  // 等异步跑完
  await sleep(500);

  // === 关键检查 2: supplement_history 必须有 plan_* entries ===
  const req = reqStore.getById(reqId);
  const hist = JSON.parse(req.supplement_history || '[]');
  const planEntries = hist.filter((e) => e.source && e.source.startsWith('plan_'));
  console.log(`[check] plan_* entries in history: ${planEntries.length}`);
  if (planEntries.length === 0) {
    console.log('❌ supplement_history 没有 plan_* entries');
    console.log('   → 之前 TypeError 被吞的症状');
    console.log('   → 检查 chat-intent.js 是否 export appendChatEntry');
    process.exit(1);
  }
  const sources = planEntries.map((e) => e.source);
  console.log(`[check] 来源: ${sources.join(', ')}`);
  if (!sources.includes('plan_loading')) {
    console.log('❌ 缺 plan_loading entry');
    process.exit(1);
  }
  if (!sources.includes('plan_done')) {
    console.log('❌ 缺 plan_done entry');
    process.exit(1);
  }
  console.log('✅ plan_* entries 真实写入 supplement_history');

  // === 关键检查 3: plan_done entry 含完整 plan 快照 ===
  const doneEntry = planEntries.find((e) => e.source === 'plan_done');
  const doneData = JSON.parse(doneEntry.text);
  if (!doneData.steps || doneData.steps.length !== 2) {
    console.log('❌ plan_done entry 没含完整 steps 快照');
    process.exit(1);
  }
  console.log(`✅ plan_done entry 含完整快照: ${doneData.steps.length} steps`);

  // === 关键检查 4: plan_status 在 DB 里是 done ===
  if (req.plan_status !== 'done') {
    console.log(`❌ plan_status 应为 done, 实际 ${req.plan_status}`);
    process.exit(1);
  }
  console.log(`✅ requirement.plan_status = ${req.plan_status}`);

  // 清理
  reqStore.update(reqId, { plan: null, plan_status: null, supplement_history: '[]' });
  console.log('\n=== ✅ 集成测试全部通过 ===');
  console.log('修复前症状：plan_* entries 永远为 0，前端看不到 ⏳ 卡');
  console.log('修复后：plan_loading/plan_step_update/plan_done 全部真实写入');
}

main().catch((e) => { console.error('test crashed:', e); process.exit(1); });