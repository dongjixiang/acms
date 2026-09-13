// ACMS chat-intent office_action 集成 (v0.X PR3, 2026-09-10)
// 验证 server/routes/chat-intent.js 的 3 个改动：
//   1. INTENT_TOOL_NAMES 含 'office_action'
//   2. buildFreeChatSystemPrompt 字符串含"Excel 多步操作"段
//   3. prompt 段位置正确（在"复合意图必须调 plan_execute"之后，"# 回复要求"之前）
//
// 设计原则（参见 docs/plan/excel-multi-step-plan-b-2026-09-10.md §6.7）：
// - 不 require 整个 chat-intent.js 模块（依赖 db/llm-adapter...很多初始化副作用）
// - 直接读源码做静态检查（grep + 字符串包含）— PR3 改动是纯 prompt 文本，静态检查最稳
//
// 用法：node server/__tests__/chat-intent-office-action.test.js

const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}
function section(name) { console.log('\n=== ' + name + ' ==='); }

// 读源码
const code = fs.readFileSync(path.resolve(__dirname, '../../server/routes/chat-intent.js'), 'utf-8');

// ============================================================
// Case 1: INTENT_TOOL_NAMES 含 office_action
// ============================================================
section('Case 1: INTENT_TOOL_NAMES 含 office_action');

const intentMatch = code.match(/const INTENT_TOOL_NAMES = \[([\s\S]*?)\];/);
assert(intentMatch !== null, 'INTENT_TOOL_NAMES 数组存在');
if (intentMatch) {
  const tools = (intentMatch[1].match(/'[^']+'/g) || []).map(s => s.slice(1, -1));
  assert(tools.indexOf('office_action') >= 0, 'office_action 在 INTENT_TOOL_NAMES 中');
  assert(tools.indexOf('plan_execute') >= 0, 'plan_execute 仍在（向后兼容）');
  assert(tools.indexOf('generate_image') >= 0, 'generate_image 仍在（向后兼容）');
  assert(tools.indexOf('send_email') >= 0, 'send_email 仍在（向后兼容）');
}

// ============================================================
// Case 2: buildFreeChatSystemPrompt 含 Excel 多步操作规则
// ============================================================
section('Case 2: buildFreeChatSystemPrompt 含 Excel 多步操作规则');

// 提取 buildFreeChatSystemPrompt 的 prompt body（贪婪匹配直到 function 闭合）
const fnMatch = code.match(/function buildFreeChatSystemPrompt\(req\) \{[\s\S]*?return `([\s\S]*?)`;\n\}/);
assert(fnMatch !== null, 'buildFreeChatSystemPrompt 函数存在');
if (fnMatch) {
  const promptBody = fnMatch[1];

  // 内容断言（用段标题 + 关键词 + 6 类 op 列表）
  assert(promptBody.indexOf('office_action') > 0, 'prompt 含 office_action 工具名');
  assert(promptBody.indexOf('加 sheet『对比分析』') > 0, 'prompt 含典型 plan 模板');
  assert(promptBody.indexOf('refreshContext: true') > 0, 'prompt 含 refreshContext:true 写法');
  assert(promptBody.indexOf('depends_on: ["s1"]') > 0, 'prompt 含 depends_on 串联示例');
  assert(promptBody.indexOf('structural') > 0, 'prompt 含 structural 类 op 列表');
  assert(promptBody.indexOf('content') > 0, 'prompt 含 content 类 op 列表');
  assert(promptBody.indexOf('MIXED_CLASS_OPS') > 0, 'prompt 含 handler 错误码引用');
  assert(promptBody.indexOf('**严禁**混类') > 0, 'prompt 含"严禁混类"规则');
  assert(promptBody.indexOf('**严禁**自己用普通 tool_loop') > 0, 'prompt 含"严禁普通 tool_loop"规则');
  assert(promptBody.indexOf('# ⛔ Excel/Word/PPT 多步操作必须调') > 0, 'prompt 含 office_action 段标题');
  assert(promptBody.indexOf('add_sheet') > 0, 'prompt 列了 add_sheet structural op');
  assert(promptBody.indexOf('set_cell') > 0, 'prompt 列了 set_cell content op');
  assert(promptBody.indexOf('set_formula') > 0, 'prompt 列了 set_formula content op');
}

// ============================================================
// Case 3: prompt 段位置正确
// ============================================================
section('Case 3: prompt 段位置正确');

if (fnMatch) {
  const promptBody = fnMatch[1];

  const segPlanExecute = promptBody.indexOf('# ⛔ 复合意图必须调 plan_execute');
  const segOfficeAction = promptBody.indexOf('# ⛔ Excel/Word/PPT 多步操作必须调');
  const segReplyReq = promptBody.indexOf('# 回复要求');

  assert(segPlanExecute > 0, 'plan_execute 段标题存在');
  assert(segOfficeAction > 0, 'office_action 段标题存在');
  assert(segReplyReq > 0, '# 回复要求 段标题存在');
  assert(
    segPlanExecute < segOfficeAction && segOfficeAction < segReplyReq,
    '段顺序：plan_execute < office_action < 回复要求'
  );

  // 段间距离合理（office_action 段应该在两者中间，不是挤在一角）
  const dist1 = segOfficeAction - segPlanExecute;
  const dist2 = segReplyReq - segOfficeAction;
  assert(dist1 > 100, `plan_execute → office_action 距离 ${dist1} 字符（合理）`);
  assert(dist2 > 100, `office_action → 回复要求 距离 ${dist2} 字符（合理）`);
}

// ============================================================
// Case 4 (bonus): 不破坏现有 prompt 结构
// ============================================================
section('Case 4 (bonus): 不破坏现有 prompt 结构');

if (fnMatch) {
  const promptBody = fnMatch[1];

  // 原有的"严禁装睡"段应该仍在
  assert(promptBody.indexOf('⛔ 严禁「装睡」') > 0, '原有"严禁装睡"段保留');
  // 原有的"复合意图必须调 plan_execute"段应该仍在
  assert(promptBody.indexOf('复合意图必须调 plan_execute') > 0, '原有"复合意图必须调 plan_execute"段保留');
  // 原有的"工具使用规则"在 clarify 模式，这里不检查（只测 free 模式）
  assert(promptBody.indexOf('回复要求') > 0, '"# 回复要求"段保留');
  // verifyIntent 没在 prompt 里（避免重复检测）
  assert(!/严禁.*?没有.*?能力/.test(promptBody), '没有意外的"严禁无能力"重复段');
}

// ============================================================
// Case 5 (bonus): 静态检查 getIntentToolNames 函数逻辑
// ============================================================
section('Case 5 (bonus): getIntentToolNames 函数逻辑');

const getFnMatch = code.match(/function getIntentToolNames\(\) \{[\s\S]*?\n\}/);
assert(getFnMatch !== null, 'getIntentToolNames 函数存在');
if (getFnMatch) {
  const fnBody = getFnMatch[0];
  assert(fnBody.indexOf('INTENT_TOOL_NAMES') > 0, 'getIntentToolNames 引用 INTENT_TOOL_NAMES');
  assert(fnBody.indexOf('appToolsRegistry') > 0, 'getIntentToolNames 动态注入 app-tool');
  assert(fnBody.indexOf('return') > 0, 'getIntentToolNames 有 return');
}

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
