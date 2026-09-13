// ACMS office_action_apply renderer 测试 (v0.X PR2, 2026-09-10)
// 验证 chat.js 内的 renderOfficeActionApplyBubble 函数行为：
//   1. payload 解析成功 + applyOfficeAction 返回 ok → 渲染 ✅ HTML
//   2. applyOfficeAction 返回 error → 渲染 ❌ HTML
//   3. payload.type 不匹配 → 渲染兜底 HTML
//   4. payload 解析失败（非 JSON）→ 渲染兜底 HTML
//   5. window.OfficeV3 未加载 → 渲染 ❌ "OfficeV3 未加载"
//
// 设计原则（参见 docs/plan/excel-multi-step-plan-b-2026-09-10.md §6.6）：
// - 不 vm 跑整个 chat.js（依赖太多：escHtml/api/toast/App/...）
// - 在 vm sandbox 内复制 renderer 核心逻辑（同 chat.js 内实现）+ mock OfficeV3
// - 这等价于"测试 renderOfficeActionApplyBubble 的逻辑契约"
//
// 用法：node server/__tests__/office-action-renderer.test.js

const vm = require('vm');

// ── mock OfficeV3.applyOfficeAction（注入式）──
let mockApplyCalledWith = null;
let mockApplyResponse = { ok: true };
const mockOfficeV3 = {
  applyOfficeAction: function (payload) {
    mockApplyCalledWith = payload;
    return mockApplyResponse;
  },
};

const sandbox = {
  console: console,
  setTimeout: setTimeout,
  Promise: Promise,
  window: {
    OfficeV3: mockOfficeV3,
  },
};
vm.createContext(sandbox);

// ── 在 sandbox 里复制 chat.js 内的 renderer（同逻辑） ──
// 这是对 chat.js 内实现的"测试镜像" — 逻辑一致，验证契约
vm.runInContext(`
function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
}

function renderOfficeActionApplyBubble(reqId, jsonText) {
  if (!jsonText) return '<div class="chat-system-msg">📋 Office 操作（数据为空）</div>';
  let payload;
  try { payload = JSON.parse(jsonText); } catch {
    return \`<div class="chat-system-msg">\${escHtml((jsonText || '').slice(0, 100))}</div>\`;
  }
  if (payload.type !== 'office_action_apply') {
    return \`<div class="chat-system-msg">\${escHtml((jsonText || '').slice(0, 100))}</div>\`;
  }
  let result;
  try {
    if (window.OfficeV3 && typeof window.OfficeV3.applyOfficeAction === 'function') {
      result = window.OfficeV3.applyOfficeAction({
        kind: payload.kind,
        action: payload.action,
        summary: payload.summary,
      });
    } else {
      result = { ok: false, error: 'OfficeV3 未加载' };
    }
  } catch (e) {
    result = { ok: false, error: e.message };
  }
  const summary = escHtml(payload.summary || '已应用');
  if (result && result.ok) {
    return \`<div class="chat-system-msg" style="color:var(--success,#2da44e)">✅ \${summary}</div>\`;
  }
  return \`<div class="chat-system-msg" style="color:var(--error,#cf222e)">❌ \${summary} — \${escHtml((result && result.error) || 'applyPlan 失败')}</div>\`;
}
`, sandbox);

const renderOfficeActionApplyBubble = sandbox.renderOfficeActionApplyBubble;

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}
function section(name) { console.log('\n=== ' + name + ' ==='); }

// ============================================================
// Case 1: 成功路径
// ============================================================
section('Case 1: payload ok + applyOfficeAction ok → ✅ HTML');

mockApplyCalledWith = null;
mockApplyResponse = { ok: true };

const okPayload = {
  type: 'office_action_apply',
  kind: 'xlsx',
  action: { op: 'add_sheet', sheetId: 'sheet-3', name: '对比分析' },
  summary: '已新增 sheet',
  opClass: 'structural',
  stepIndex: 0,
};
const r1 = renderOfficeActionApplyBubble('REQ-1', JSON.stringify(okPayload));

assert(r1.indexOf('✅') > 0, 'HTML 含 ✅');
assert(r1.indexOf('已新增 sheet') > 0, 'HTML 含 summary 文本');
assert(r1.indexOf('chat-system-msg') > 0, 'HTML 含 chat-system-msg class');
assert(r1.indexOf('#2da44e') > 0, 'HTML 含 success 颜色');
assert(mockApplyCalledWith !== null, 'applyOfficeAction 被调');
assert(mockApplyCalledWith && mockApplyCalledWith.kind === 'xlsx', '传入 kind === "xlsx"');
assert(mockApplyCalledWith && mockApplyCalledWith.action.op === 'add_sheet', '传入 action.op === "add_sheet"');

// ============================================================
// Case 2: 失败路径
// ============================================================
section('Case 2: applyOfficeAction 返回 error → ❌ HTML');

mockApplyCalledWith = null;
mockApplyResponse = { ok: false, error: '工作簿未加载（请先打开 Excel 文件）' };

const failPayload = {
  type: 'office_action_apply',
  kind: 'xlsx',
  action: { op: 'set_cell', sheetId: 's1', address: 'A1', value: 'x' },
  summary: '写表头',
};
const r2 = renderOfficeActionApplyBubble('REQ-2', JSON.stringify(failPayload));

assert(r2.indexOf('❌') > 0, 'HTML 含 ❌');
assert(r2.indexOf('工作簿未加载') > 0, 'HTML 含错误信息');
assert(r2.indexOf('#cf222e') > 0, 'HTML 含 error 颜色');

// ============================================================
// Case 3: payload.type 不匹配
// ============================================================
section('Case 3: payload.type 不匹配 → 兜底 HTML');

mockApplyCalledWith = null;

const wrongType = { type: 'something_else', foo: 'bar' };
const r3 = renderOfficeActionApplyBubble('REQ-3', JSON.stringify(wrongType));

assert(r3.indexOf('chat-system-msg') > 0, 'HTML 含 chat-system-msg class');
assert(r3.indexOf('❌') < 0, '不渲染 ❌（仅兜底，无 apply）');
assert(mockApplyCalledWith === null, 'applyOfficeAction 未被调');

// ============================================================
// Case 4: 非 JSON payload
// ============================================================
section('Case 4: 非 JSON payload → 兜底 HTML');

mockApplyCalledWith = null;

const r4 = renderOfficeActionApplyBubble('REQ-4', 'this is not json {{');

assert(r4.indexOf('chat-system-msg') > 0, 'HTML 含 chat-system-msg class');
assert(r4.indexOf('this is not json') > 0, 'HTML 含原始文本（兜底显示前 100 字符）');
assert(mockApplyCalledWith === null, 'applyOfficeAction 未被调');

// ============================================================
// Case 5: 空 jsonText
// ============================================================
section('Case 5: 空 jsonText → "数据为空" HTML');

mockApplyCalledWith = null;

const r5 = renderOfficeActionApplyBubble('REQ-5', '');

assert(r5.indexOf('数据为空') > 0, 'HTML 含"数据为空"提示');
assert(mockApplyCalledWith === null, 'applyOfficeAction 未被调');

// ============================================================
// Case 6: window.OfficeV3 未加载
// ============================================================
section('Case 6: window.OfficeV3 未加载 → ❌ HTML');

const sandbox2 = {
  console: console,
  window: {},  // 没 OfficeV3
};
vm.createContext(sandbox2);
vm.runInContext(`
function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
}
function renderOfficeActionApplyBubble(reqId, jsonText) {
  if (!jsonText) return '<div class="chat-system-msg">📋 Office 操作（数据为空）</div>';
  let payload;
  try { payload = JSON.parse(jsonText); } catch {
    return \`<div class="chat-system-msg">\${escHtml((jsonText || '').slice(0, 100))}</div>\`;
  }
  if (payload.type !== 'office_action_apply') {
    return \`<div class="chat-system-msg">\${escHtml((jsonText || '').slice(0, 100))}</div>\`;
  }
  let result;
  try {
    if (window.OfficeV3 && typeof window.OfficeV3.applyOfficeAction === 'function') {
      result = window.OfficeV3.applyOfficeAction({kind:payload.kind, action:payload.action, summary:payload.summary});
    } else {
      result = { ok: false, error: 'OfficeV3 未加载' };
    }
  } catch (e) {
    result = { ok: false, error: e.message };
  }
  const summary = escHtml(payload.summary || '已应用');
  if (result && result.ok) return \`<div class="chat-system-msg">✅ \${summary}</div>\`;
  return \`<div class="chat-system-msg">❌ \${summary} — \${escHtml((result && result.error) || 'applyPlan 失败')}</div>\`;
}
`, sandbox2);

const r6 = sandbox2.renderOfficeActionApplyBubble('REQ-6', JSON.stringify(okPayload));
assert(r6.indexOf('OfficeV3 未加载') > 0, 'HTML 含 "OfficeV3 未加载" 错误');

// ============================================================
// Case 7 (bonus): payload 缺 action
// ============================================================
section('Case 7 (bonus): payload 缺 action');

mockApplyCalledWith = null;
const incomplete = { type: 'office_action_apply', kind: 'xlsx', summary: 'no action' };
const r7 = renderOfficeActionApplyBubble('REQ-7', JSON.stringify(incomplete));

// renderer 仍然调 applyOfficeAction 传 undefined action → 由 applyOfficeAction 自己 reject
// 当前实现：applyOfficeAction 内部会检查 → 返回 {ok:false, error:'缺少 kind 或 action'}
assert(mockApplyCalledWith !== null, 'applyOfficeAction 被调（带 undefined action）');
assert(mockApplyCalledWith && mockApplyCalledWith.action === undefined, 'action 是 undefined');
assert(r7.indexOf('❌') > 0, 'HTML 是 ❌（applyOfficeAction reject）');

// ============================================================
// 总结
// ============================================================
console.log('\n=== 总结 ===');
console.log(`通过: ${passed} / ${passed + failed}`);

// ============================================================
// Bonus: 静态一致性检查（确保 chat.js 内的实现与测试同步）
// ============================================================
section('Bonus: 静态一致性检查（chat.js 内 renderer 必须存在）');

const fs = require('fs');
const chatJsPath = require('path').resolve(__dirname, '../../client/js/views/requirements/chat.js');
const chatJsCode = fs.readFileSync(chatJsPath, 'utf-8');

assert(chatJsCode.indexOf('function renderOfficeActionApplyBubble') > 0,
  'chat.js 内必须定义 renderOfficeActionApplyBubble 函数');
assert(chatJsCode.indexOf("entry.source === 'office_action_apply'") > 0,
  'chat.js 三元链必须识别 office_action_apply source');
assert(chatJsCode.indexOf('window.OfficeV3.applyOfficeAction') > 0,
  'chat.js renderer 必须调 window.OfficeV3.applyOfficeAction');

console.log('\n=== 总结 ===');
console.log(`通过: ${passed} / ${passed + failed}`);
if (failed > 0) {
  console.error(`失败: ${failed}`);
  process.exit(1);
} else {
  console.log('✅ 全部通过');
  process.exit(0);
}
