// ACMS office_action tool 测试 (v0.X, 2026-09-10)
// 验证 server/tools/office-action.js 的 6 个 case：
//   1. 注册成功 + schema 完整
//   2. 混类 op 拒绝（structural + content）
//   3. refreshContext=true 触发 fresh docContext 读取
//   4. refreshContext=false + docContext 缺失 → NO_DOC_CONTEXT
//   5. office-action HTTP 端点 ok → 返回 + 写 system entry
//   6. office-action HTTP 端点 fail → 返回 fail
//
// 用法：node server/__tests__/office-action-tool.test.js
//
// 设计原则（参见 docs/plan/excel-multi-step-plan-b-2026-09-10.md §6.5）：
// - mock global.fetch（避免真实网络）
// - 真实 requirement-store 写入（验证 system entry 持久化）

const tr = require('../services/tool-registry');
require('../tools'); // 触发全部 server tools 注册（含 office-action）

// --- Mock global.fetch (Node 18+) ---
let mockFetchResponse = null;
let mockFetchCalledWith = null;
const realFetch = global.fetch;
global.fetch = function mockFetch(url, opts) {
  mockFetchCalledWith = { url, opts };
  return Promise.resolve({
    ok: mockFetchResponse && mockFetchResponse.ok !== false,
    status: (mockFetchResponse && mockFetchResponse.ok === false) ? 500 : 200,
    json: () => Promise.resolve(mockFetchResponse),
  });
};

// --- Test helpers ---
let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}
function section(name) { console.log('\n=== ' + name + ' ==='); }

// --- Real req store for case 5 (验证 system entry 持久化) ---
const reqStore = require('../stores/requirement-store');

// 准备测试 REQ（用 create 而不是 update，因为 update 对不存在 id 是 noop）
const TEST_REQ_ID = reqStore.create({
  projectId: 'test',
  title: 'office_action 测试 REQ',
  description: 'unit test',
  createdBy: 'test-runner',
}).id;

// ============================================================
// Case 1: 注册成功 + schema 完整
// ============================================================
section('Case 1: 注册成功 + schema 完整');

const tool = tr.getTool('office_action');
assert(tool !== null, 'office_action tool 已注册到 tool-registry');
assert(tool && tool.name === 'office_action', 'tool.name === "office_action"');
assert(tool && tool.description && tool.description.indexOf('单类 op') > 0, 'description 含"单类 op"约束规则');
assert(tool && tool.parameters && tool.parameters.type === 'object', 'parameters.type === "object"');
assert(tool && tool.parameters.required && tool.parameters.required.indexOf('kind') >= 0, 'required 含 kind');
assert(tool && tool.parameters.required && tool.parameters.required.indexOf('operations') >= 0, 'required 含 operations');
assert(tool && tool.parameters.properties && tool.parameters.properties.kind, 'properties.kind 存在');
assert(tool && tool.parameters.properties.kind.enum && tool.parameters.properties.kind.enum.length === 3, 'kind enum = [word, xlsx, slides]');
assert(tool && tool.parameters.properties.operations, 'properties.operations 存在');
assert(tool && tool.parameters.properties.operations.type === 'array', 'operations.type === "array"');
assert(tool && tool.parameters.properties.refreshContext, 'properties.refreshContext 存在');
assert(tool && tool.parameters.properties.summary, 'properties.summary 存在');
assert(typeof tool.handler === 'function', 'handler 是 function');

// ============================================================
// Case 2: 混类 op 拒绝
// ============================================================
section('Case 2: 混类 op 拒绝（structural + content）');

(async () => {
  const result = await tool.handler({
    kind: 'xlsx',
    operations: [
      { op: 'add_sheet', sheetId: 'sheet-test', name: '对比分析' },  // structural
      { op: 'set_cell', sheetId: 'sheet-test', address: 'A1', value: '姓名' },  // content
    ],
    summary: '混类测试',
    docContext: { sheets: [{ id: 'sheet-test', name: '对比分析', rows: [] }] },  // 跳过 fresh read
  }, { reqId: TEST_REQ_ID });

  assert(result.ok === false, '混类返回 ok:false');
  assert(result.error === 'MIXED_CLASS_OPS', 'error === MIXED_CLASS_OPS');
  assert(Array.isArray(result.mixedClasses), '返回 mixedClasses 数组');
  assert(result.mixedClasses && result.mixedClasses.indexOf('structural') >= 0, 'mixedClasses 含 structural');
  assert(result.mixedClasses && result.mixedClasses.indexOf('content') >= 0, 'mixedClasses 含 content');
  assert(result.message && result.message.indexOf('拆成多个 plan step') > 0, 'message 提示要拆 step');

  // ============================================================
  // Case 2b: 未知 op 拒绝
  // ============================================================
  section('Case 2b: 未知 op 拒绝');

  const r2 = await tool.handler({
    kind: 'xlsx',
    operations: [{ op: 'fly_to_moon', payload: '🚀' }],
    summary: '未知 op 测试',
    docContext: { sheets: [] },
  }, { reqId: TEST_REQ_ID });

  assert(r2.ok === false, '未知 op 返回 ok:false');
  assert(r2.error === 'UNKNOWN_OPS', 'error === UNKNOWN_OPS');
  assert(r2.unknownOps && r2.unknownOps.indexOf('fly_to_moon') >= 0, 'unknownOps 含具体 op 名');

  // ============================================================
  // Case 2c: 空 operations 拒绝
  // ============================================================
  section('Case 2c: 空 operations 拒绝');

  const r3 = await tool.handler({
    kind: 'xlsx',
    operations: [],
    summary: '空数组测试',
    docContext: { sheets: [] },
  }, { reqId: TEST_REQ_ID });

  assert(r3.ok === false, '空数组返回 ok:false');
  assert(r3.error === 'EMPTY_OPERATIONS', 'error === EMPTY_OPERATIONS');

  // ============================================================
  // Case 4: refreshContext=false + docContext 缺失 → NO_DOC_CONTEXT
  // ============================================================
  section('Case 4: refreshContext=false + docContext 缺失');

  const r4 = await tool.handler({
    kind: 'xlsx',
    operations: [{ op: 'set_cell', sheetId: 's1', address: 'A1', value: 'x' }],
    summary: '缺 docContext 测试',
    // docContext 缺失，refreshContext 也未设
  }, { reqId: TEST_REQ_ID });

  assert(r4.ok === false, '缺 docContext 返回 ok:false');
  assert(r4.error === 'NO_DOC_CONTEXT', 'error === NO_DOC_CONTEXT');
  assert(r4.needsDocContext === true, 'needsDocContext=true 标记前端需补');

  // ============================================================
  // Case 5: office-action HTTP 端点 ok → 返回 + 写 system entry
  // ============================================================
  section('Case 5: office-action HTTP 端点 ok');

  // 清掉之前测试的 system entries
  reqStore.update(TEST_REQ_ID, { supplement_history: '[]' });

  mockFetchResponse = {
    ok: true,
    action: {
      op: 'add_sheet',
      kind: 'xlsx',
      sheetId: 'sheet-new',
      name: '对比分析',
      summary: '已新增 sheet',
    },
  };
  mockFetchCalledWith = null;

  const r5 = await tool.handler({
    kind: 'xlsx',
    operations: [{ op: 'add_sheet', sheetId: 'sheet-new', name: '对比分析' }],
    summary: '新增 sheet',
    docContext: { sheets: [{ id: 'sheet-1', name: '考勤' }, { id: 'sheet-2', name: '打开' }] },
  }, { reqId: TEST_REQ_ID, stepIndex: 0 });

  assert(r5.ok === true, 'office-action ok 返回 ok:true');
  assert(r5.action && r5.action.op === 'add_sheet', '返回 action.op === "add_sheet"');
  assert(r5.pendingApply === true, 'pendingApply=true 标记前端需 apply');
  assert(r5.opClass === 'structural', 'opClass === "structural"');
  assert(mockFetchCalledWith !== null, 'fetch 被调用');
  assert(mockFetchCalledWith.url && mockFetchCalledWith.url.indexOf('/api/agent-buddy/office-action') > 0, 'fetch URL 是 office-action 端点');
  const fetchBody = JSON.parse(mockFetchCalledWith.opts.body);
  assert(fetchBody.kind === 'xlsx', 'fetch body.kind === "xlsx"');
  assert(fetchBody.docContext && Array.isArray(fetchBody.docContext.sheets), 'fetch body 传了 docContext');
  assert(fetchBody.docContext.sheets.length === 2, 'docContext.sheets 有 2 个');

  // 验证 system entry 写入
  const reqAfter = reqStore.getById(TEST_REQ_ID);
  const history = JSON.parse(reqAfter.supplement_history || '[]');
  const officeEntry = history.find(h => h.source === 'office_action_apply');
  assert(officeEntry !== undefined, 'supplement_history 写了 office_action_apply entry');
  assert(officeEntry && officeEntry.text, 'entry.text 非空');
  if (officeEntry) {
    const payload = JSON.parse(officeEntry.text);
    assert(payload.type === 'office_action_apply', 'entry.type === "office_action_apply"');
    assert(payload.kind === 'xlsx', 'payload.kind === "xlsx"');
    assert(payload.action && payload.action.op === 'add_sheet', 'payload.action.op === "add_sheet"');
    assert(payload.opClass === 'structural', 'payload.opClass === "structural"');
    assert(payload.stepIndex === 0, 'payload.stepIndex === 0');
  }

  // ============================================================
  // Case 6: office-action HTTP 端点 fail
  // ============================================================
  section('Case 6: office-action HTTP 端点 fail');

  mockFetchResponse = {
    ok: false,
    error: 'LLM 拒绝：文档内容识别失败',
  };

  const r6 = await tool.handler({
    kind: 'xlsx',
    operations: [{ op: 'set_cell', sheetId: 's1', address: 'A1', value: 'x' }],
    summary: '故意失败测试',
    docContext: { sheets: [] },
  }, { reqId: TEST_REQ_ID });

  assert(r6.ok === false, 'office-action fail 返回 ok:false');
  assert(r6.error === 'OFFICE_ACTION_FAILED', 'error === OFFICE_ACTION_FAILED');
  assert(r6.reason && r6.reason.indexOf('LLM 拒绝') >= 0, 'reason 含端点 error 信息');

  // ============================================================
  // Case 3: refreshContext=true 触发 fresh docContext 读取
  // ============================================================
  section('Case 3: refreshContext=true 触发 fresh 读取');

  // PR1 占位：readFreshOfficeDocContext 返回 null → handler 应返回 NO_DOC_CONTEXT
  // 这个 case 主要是验证"refreshContext=true 时 handler 会尝试读 fresh"
  // PR2 会改成"等前端 ack 注入"，届时本 case 会改为验证 frontend 收到 ack 后回填 docContext

  mockFetchResponse = { ok: true, action: { op: 'set_cell', address: 'A1' } };
  mockFetchCalledWith = null;

  const r7 = await tool.handler({
    kind: 'xlsx',
    operations: [{ op: 'set_cell', sheetId: 's1', address: 'A1', value: 'y' }],
    summary: 'refreshContext 测试',
    refreshContext: true,
    // 故意不传 docContext
  }, { reqId: TEST_REQ_ID });

  // PR1 期望：因 readFreshOfficeDocContext 占位返回 null → NO_DOC_CONTEXT
  // 这是预期的"fresh read 待前端实现"信号
  assert(r7.ok === false, 'PR1 占位：refreshContext 但无 fresh → ok:false');
  assert(r7.error === 'NO_DOC_CONTEXT', 'PR1 占位：错误是 NO_DOC_CONTEXT（待前端实现）');
  assert(mockFetchCalledWith === null, 'PR1 占位：未调 office-action 端点（因 fresh read 失败短路）');

  // ============================================================
  // Case 7 (bonus): NO_REQ_ID 拒绝
  // ============================================================
  section('Case 7 (bonus): NO_REQ_ID 拒绝');

  const r8 = await tool.handler({
    kind: 'xlsx',
    operations: [{ op: 'set_cell', sheetId: 's1', address: 'A1', value: 'x' }],
    summary: '无 reqId 测试',
    docContext: { sheets: [] },
  }, { /* 无 reqId */ });

  assert(r8.ok === false, '无 reqId 返回 ok:false');
  assert(r8.error === 'NO_REQ_ID', 'error === NO_REQ_ID');

  // ============================================================
  // 恢复 global.fetch
  // ============================================================
  global.fetch = realFetch;

  // ============================================================
  // 总结
  // ============================================================
  console.log('\n=== 总结 ===');
  console.log(`通过: ${passed} / ${passed + failed}`);
  if (failed > 0) {
    console.error(`失败: ${failed}`);
    process.exit(1);
  } else {
    console.log('✅ 全部通过');
    process.exit(0);
  }
})().catch(e => {
  console.error('测试异常:', e);
  global.fetch = realFetch;
  process.exit(1);
});
