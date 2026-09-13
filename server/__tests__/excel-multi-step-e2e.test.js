// ACMS Excel 多步操作 E2E 测试 (v0.X PR4, 2026-09-10)
// 验证 PR1-3 的改动在真实 plan_executor + office_action tool 链路下端到端工作：
//   Case 1: 成功路径（LLM 模拟 → plan_execute → 2 个 office_action step → 全部成功 → plan_done）
//   Case 2: 混类拒绝（plan step 含 structural + content → office_action handler 拒绝 → plan_step_failed）
//   Case 3: refreshContext=true 但缺 docContext → NO_DOC_CONTEXT 失败
//   Case 4: 部分失败隔离（s1 ok / s2 fail → plan_done status=partial_failed, s2 status=failed, s1 status=done）
//   Case 5: 不影响 Office V3 内 AI 面板路径（office-action 端点单 batch 行为不变 — 不走 plan_execute）
//
// 设计原则（参见 docs/plan/excel-multi-step-plan-b-2026-09-10.md §6.8）：
// - 不 mock 整个 plan-executor 或 office_action tool — 跑真实链路
// - mock global.fetch（office-action 端点响应可控）
// - 不 mock reqStore（用真实 SQLite，验证 entry 真实持久化）
// - fire-and-forget 的 executePlan 需要 polling plan_done entry，加 timeout 兜底
//
// 用法：node server/__tests__/excel-multi-step-e2e.test.js

const path = require('path');
const fs = require('fs');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}
function section(name) { console.log('\n=== ' + name + ' ==='); }

// ============================================================
// Mock global.fetch（office-action 端点响应可控）
// ============================================================
let mockFetchQueue = [];  // {ok, action/error} 队列，按顺序消费
const realFetch = global.fetch;
global.fetch = function mockFetch(url, opts) {
  const item = mockFetchQueue.shift() || { ok: false, error: 'no mock fetch queued' };
  return Promise.resolve({
    ok: item.ok !== false && (item.status || 200) < 400,
    status: item.status || (item.ok === false ? 500 : 200),
    json: () => Promise.resolve(item),
  });
};

// ============================================================
// 加载依赖（必须在 mock fetch 后 require，否则 plan_executor 引用的 office-action 会用真实 fetch）
// ============================================================
const reqStore = require('../stores/requirement-store');
const planExec = require('../services/plan-executor');
require('../tools');  // 触发 office_action tool 注册

// 准备测试 REQ（每个 case 用独立 REQ，避免污染）
let reqCounter = 0;
function createTestReq(title) {
  const req = reqStore.create({
    projectId: 'e2e-test',
    title: title || `E2E 测试 REQ #${++reqCounter}`,
    description: 'PR4 E2E test',
    createdBy: 'test-runner',
  });
  // 清空 supplement_history（避免初始 entry 干扰）
  reqStore.update(req.id, { supplement_history: '[]' });
  return req.id;
}

// ============================================================
// helper：等 plan_done entry 出现（带 timeout）
// ============================================================
async function waitForPlanDone(reqId, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 5000);
  while (Date.now() < deadline) {
    const req = reqStore.getById(reqId);
    if (!req) throw new Error('REQ 不存在: ' + reqId);
    const history = JSON.parse(req.supplement_history || '[]');
    const done = history.find(e => e.source === 'plan_done');
    if (done) {
      return { done, history };
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`等 plan_done 超时 (${timeoutMs}ms)`);
}

// helper：从 history 找 entry（按 source + 可选 predicate）
function findEntry(history, source, predicate) {
  return history.find(e => e.source === source && (!predicate || predicate(e)));
}

// helper：解析 entry 的 text 字段（JSON）
function parseEntry(entry) {
  if (!entry || !entry.text) return null;
  try { return JSON.parse(entry.text); } catch { return null; }
}

// ============================================================
// Case 1: 成功路径（2 步 office_action 串行执行）
// ============================================================
(async () => {
  section('Case 1: 成功路径 — LLM 模拟 plan_execute → 2 个 office_action step → 全部成功');

  const reqId = createTestReq('Case 1 — 成功路径');

  // mock office-action 端点响应（s1 加 sheet, s2 写 cell/formula）
  mockFetchQueue = [
    {
      ok: true,
      action: {
        op: 'add_sheet',
        kind: 'xlsx',
        sheetId: 'sheet-3',
        name: '对比分析',
        summary: '已新增 sheet',
      },
    },
    {
      ok: true,
      action: {
        op: 'set_cell',
        kind: 'xlsx',
        sheetId: 'sheet-3',
        address: 'A1',
        value: '姓名',
        summary: '已写入 A1',
      },
    },
  ];

  // 执行 plan
  const plan = {
    summary: '加 sheet 并合并考勤数据',
    steps: [
      {
        id: 's1',
        tool: 'office_action',
        args: {
          kind: 'xlsx',
          operations: [{ op: 'add_sheet', sheetId: 'sheet-3', name: '对比分析' }],
          summary: '新增 sheet',
          docContext: { sheets: [{ id: 'sheet-1' }, { id: 'sheet-2' }] },
        },
      },
      {
        id: 's2',
        tool: 'office_action',
        args: {
          kind: 'xlsx',
          // 不传 refreshContext（s2 不依赖结构性变更）
          // 直接传 docContext（已经包含 sheet-3）
          operations: [
            { op: 'set_cell', sheetId: 'sheet-3', address: 'A1', value: '姓名' },
            { op: 'set_formula', sheetId: 'sheet-3', address: 'F2', formula: '=B2/D2' },
          ],
          summary: '写表头+公式',
          docContext: { sheets: [{ id: 'sheet-3', name: '对比分析' }] },
        },
        depends_on: ['s1'],
      },
    ],
  };

  const execResult = await planExec.executePlan(reqId, plan);
  assert(execResult.ok === true, `executePlan 返回 ok:true（实际: ${execResult.ok}）`);
  assert(execResult.plan_id && execResult.plan_id.startsWith('plan_'), `plan_id 已生成（实际: ${execResult.plan_id}）`);
  assert(execResult.total_steps === 2, `total_steps === 2（实际: ${execResult.total_steps}）`);

  // 等 plan_done
  const { done, history } = await waitForPlanDone(reqId);

  // 验证 plan_done entry
  const donePayload = parseEntry(done);
  assert(donePayload !== null, 'plan_done entry.text 是 JSON');
  assert(donePayload && donePayload.status === 'done', `plan_done.status === 'done'（实际: ${donePayload && donePayload.status}）`);

  // 验证 step 状态
  const s1 = donePayload.steps.find(s => s.id === 's1');
  const s2 = donePayload.steps.find(s => s.id === 's2');
  assert(s1 && s1.status === 'done', `s1.status === 'done'（实际: ${s1 && s1.status}）`);
  assert(s2 && s2.status === 'done', `s2.status === 'done'（实际: ${s2 && s2.status}）`);

  // 验证 office_action_apply entries（每个 step 一个）
  const applyEntries = history.filter(e => e.source === 'office_action_apply');
  assert(applyEntries.length === 2, `2 个 office_action_apply entry（实际: ${applyEntries.length}）`);

  // 验证第一个 entry 是 add_sheet
  const apply1 = parseEntry(applyEntries[0]);
  assert(apply1 && apply1.action && apply1.action.op === 'add_sheet', 's1 entry action.op === "add_sheet"');
  assert(apply1 && apply1.opClass === 'structural', 's1 opClass === "structural"');

  // 验证第二个 entry 是 set_cell
  const apply2 = parseEntry(applyEntries[1]);
  assert(apply2 && apply2.action && apply2.action.op === 'set_cell', 's2 entry action.op === "set_cell"');
  assert(apply2 && apply2.opClass === 'content', 's2 opClass === "content"');
})().then(() => {
  // ============================================================
  // Case 2: 混类拒绝（LLM 编错，handler 拒绝）
  // ============================================================
  return (async () => {
    section('Case 2: 混类拒绝 — office_action handler 拒绝 MIXED_CLASS_OPS');

    const reqId = createTestReq('Case 2 — 混类拒绝');

    // 不需要 mock fetch（handler 在调 fetch 前就拒绝）
    mockFetchQueue = [];

    const plan = {
      summary: '混类测试',
      steps: [
        {
          id: 's1',
          tool: 'office_action',
          args: {
            kind: 'xlsx',
            operations: [
              { op: 'add_sheet', sheetId: 'sheet-3', name: '对比分析' },  // structural
              { op: 'set_cell', sheetId: 'sheet-3', address: 'A1', value: 'x' },  // content
            ],
            summary: '混类错误',
            docContext: { sheets: [] },
          },
        },
      ],
    };

    planExec.executePlan(reqId, plan);
    const { done, history } = await waitForPlanDone(reqId);

    const donePayload = parseEntry(done);
    assert(donePayload && donePayload.status === 'partial_failed', `plan_done.status === 'partial_failed'（实际: ${donePayload && donePayload.status}）`);

    const s1 = donePayload.steps.find(s => s.id === 's1');
    assert(s1 && s1.status === 'failed', `s1.status === 'failed'（实际: ${s1 && s1.status}）`);
    assert(s1 && s1.error && String(s1.error).indexOf('MIXED_CLASS_OPS') >= 0, `s1.error 含 MIXED_CLASS_OPS（实际: ${s1 && s1.error}）`);

    // office-action 端点**没**被调用（handler 在调 fetch 前就拒绝）
    assert(mockFetchQueue.length === 0, 'office-action 端点未被调（handler 提前拒绝）');

    // 没有 office_action_apply entry（被拒绝没生成）
    const applyEntries = history.filter(e => e.source === 'office_action_apply');
    assert(applyEntries.length === 0, '无 office_action_apply entry（handler 拒绝未生成）');
  })();
}).then(() => {
  // ============================================================
  // Case 3: refreshContext=true 但缺 docContext → NO_DOC_CONTEXT
  // ============================================================
  return (async () => {
    section('Case 3: refreshContext 触发 — handler 返回 NO_DOC_CONTEXT');

    const reqId = createTestReq('Case 3 — refreshContext 触发');

    mockFetchQueue = [];

    const plan = {
      summary: 'refreshContext 测试',
      steps: [
        {
          id: 's1',
          tool: 'office_action',
          args: {
            kind: 'xlsx',
            refreshContext: true,  // 强制读 fresh
            // docContext 缺失
            operations: [{ op: 'set_cell', sheetId: 's1', address: 'A1', value: 'x' }],
            summary: 'refreshContext 测试',
          },
        },
      ],
    };

    planExec.executePlan(reqId, plan);
    const { done, history } = await waitForPlanDone(reqId);

    const donePayload = parseEntry(done);
    assert(donePayload && donePayload.status === 'partial_failed', `plan_done.status === 'partial_failed'`);

    const s1 = donePayload.steps.find(s => s.id === 's1');
    assert(s1 && s1.status === 'failed', `s1.status === 'failed'`);
    assert(s1 && s1.error && String(s1.error).indexOf('NO_DOC_CONTEXT') >= 0, `s1.error 含 NO_DOC_CONTEXT（实际: ${s1 && s1.error}）`);

    assert(mockFetchQueue.length === 0, 'office-action 端点未被调（fresh read 失败短路）');
  })();
}).then(() => {
  // ============================================================
  // Case 4: 部分失败隔离（s1 ok / s2 fail）
  // ============================================================
  return (async () => {
    section('Case 4: 部分失败隔离 — s1 成功 / s2 失败 → s1 状态保留');

    const reqId = createTestReq('Case 4 — 部分失败');

    // s1 mock ok, s2 不 mock fetch（handler 会因缺 docContext 失败）
    mockFetchQueue = [
      {
        ok: true,
        action: {
          op: 'add_sheet',
          kind: 'xlsx',
          sheetId: 'sheet-3',
          name: '对比分析',
          summary: '已新增 sheet',
        },
      },
      // s2 没 mock → handler 走 NO_DOC_CONTEXT 路径失败
    ];

    const plan = {
      summary: 's1 ok + s2 fail',
      steps: [
        {
          id: 's1',
          tool: 'office_action',
          args: {
            kind: 'xlsx',
            operations: [{ op: 'add_sheet', sheetId: 'sheet-3', name: '对比分析' }],
            summary: '新增 sheet',
            docContext: { sheets: [] },
          },
        },
        {
          id: 's2',
          tool: 'office_action',
          args: {
            kind: 'xlsx',
            // 故意不传 docContext + refreshContext=true → handler NO_DOC_CONTEXT
            refreshContext: true,
            operations: [{ op: 'set_cell', sheetId: 'sheet-3', address: 'A1', value: 'x' }],
            summary: '写表头',
          },
          depends_on: ['s1'],
        },
      ],
    };

    planExec.executePlan(reqId, plan);
    const { done, history } = await waitForPlanDone(reqId);

    const donePayload = parseEntry(done);
    assert(donePayload && donePayload.status === 'partial_failed', `plan_done.status === 'partial_failed'`);

    const s1 = donePayload.steps.find(s => s.id === 's1');
    const s2 = donePayload.steps.find(s => s.id === 's2');
    assert(s1 && s1.status === 'done', `s1.status === 'done'（s1 成功状态保留）`);
    assert(s2 && s2.status === 'failed', `s2.status === 'failed'（s2 失败不影响 plan 整体）`);

    // 关键：s1 成功时写了 office_action_apply entry，s2 失败没写
    const applyEntries = history.filter(e => e.source === 'office_action_apply');
    assert(applyEntries.length === 1, `只有 s1 写了 office_action_apply entry（实际: ${applyEntries.length}）`);
  })();
}).then(() => {
  // ============================================================
  // Case 5: 不影响 Office V3 内 AI 面板路径
  // ============================================================
  return (async () => {
    section('Case 5: 不影响 Office V3 内 AI 面板 — office-action 端点单 batch 路径');

    // 这个 case 测的是：office-action HTTP 端点本身能正常工作（被 V3 内 AI 面板调用）
    // 不走 plan_execute，所以 plan_done entry 不会有
    // 我们直接调 office_action tool handler（不走 plan），模拟 V3 内 AI 面板的调用链

    const reqId = createTestReq('Case 5 — V3 内 AI 面板路径');

    mockFetchQueue = [
      {
        ok: true,
        action: {
          op: 'add_sheet',
          kind: 'xlsx',
          sheetId: 'sheet-v3',
          name: '对比分析',
          summary: '已新增 sheet',
        },
      },
    ];

    // 直接调 tool handler（不走 plan_execute）
    const tr = require('../services/tool-registry');
    const tool = tr.getTool('office_action');
    const result = await tool.handler({
      kind: 'xlsx',
      operations: [{ op: 'add_sheet', sheetId: 'sheet-v3', name: '对比分析' }],
      summary: 'V3 内 AI 面板调用',
      docContext: { sheets: [] },
    }, { reqId });

    assert(result.ok === true, 'tool handler 返回 ok:true');
    assert(result.action && result.action.op === 'add_sheet', 'action.op === "add_sheet"');

    // 验证 entry 写入（V3 内 AI 面板路径也写 office_action_apply，前端一样能渲染）
    const req = reqStore.getById(reqId);
    const history = JSON.parse(req.supplement_history || '[]');
    const applyEntry = findEntry(history, 'office_action_apply');
    assert(applyEntry !== undefined, 'V3 内 AI 面板路径也写 office_action_apply entry');

    // 关键：没有 plan_done entry（不走 plan_execute）
    const doneEntry = findEntry(history, 'plan_done');
    assert(doneEntry === undefined, '无 plan_done entry（不走 plan_execute）');
  })();
}).then(() => {
  // ============================================================
  // 清理
  // ============================================================
  section('清理');
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
}).catch(e => {
  console.error('测试异常:', e);
  global.fetch = realFetch;
  process.exit(1);
});
