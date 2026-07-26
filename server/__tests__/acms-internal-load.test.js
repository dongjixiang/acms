// ACMS acms-internal 工具加载修复验证 (v0.66 bug fix)
// 验证 server/tools/index.js 修复后 26 个 ACMS 业务工具全部注册
//
// 用法：node server/__tests__/acms-internal-load.test.js

require('../tools/index.js');
const tr = require('../services/tool-registry');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}

// 26 个 acms-internal 工具的完整列表（来自 acms-internal.js 第 925 行日志 + grep name:）
const EXPECTED_TOOLS = [
  // 查询类（12 个）
  'list_my_work', 'list_my_tasks', 'list_board_tasks', 'search_tasks',
  'list_requirements', 'search_requirements', 'get_requirement_detail',
  'list_bugs', 'list_agents', 'get_dashboard_stats', 'list_recent_events', 'list_users',
  // 写操作类（8 个）
  'create_requirement', 'approve_requirement', 'reject_requirement', 'add_clarification',
  'claim_task', 'update_task_progress', 'update_task_status', 'submit_task',
  // 系统类（2 个）
  'open_view', 'highlight_element',
  // meta 类（3 个：_expand_tools / _recall_buddy_memory / search_history）
  '_expand_tools', '_recall_buddy_memory', 'search_history',
  // 管家通用（1 个）
  'query_collection',
];

console.log('[test] acms-internal 工具加载验证');
for (const name of EXPECTED_TOOLS) {
  const tool = tr.getTool(name);
  assert(tool !== null, `${name} 已注册`);
  if (tool) {
    assert(typeof tool.handler === 'function', `${name}.handler 是函数`);
    assert(tool.description && tool.description.length > 0, `${name}.description 非空`);
    assert(tool.parameters && tool.parameters.type === 'object', `${name}.parameters 是 object schema`);
  }
}

console.log('\n[test] 修复前应不可见 / 修复后可见');
const allNames = tr.listTools().map(t => t.name).sort();
assert(allNames.indexOf('open_view') >= 0, 'open_view 现在可见');
assert(allNames.indexOf('query_collection') >= 0, 'query_collection 现在可见');
assert(allNames.indexOf('create_requirement') >= 0, 'create_requirement 现在可见');
assert(allNames.indexOf('list_my_tasks') >= 0, 'list_my_tasks 现在可见');

console.log('\n[test] agent-buddy-skill.js L2 CATEGORY_TOOLS 现在能真正注入');
const buddy = require('../services/agent-buddy-skill');

function hasToolSchema(prompt, toolName) {
  return prompt.indexOf(`【${toolName}】`) >= 0;
}

// 修复前 task category 扩载为空 → 修复后应该有 list_my_tasks schema
const promptTask = buddy.buildChatPrompt({
  currentView: '_default',
  expandedCategories: ['task'],
});
assert(hasToolSchema(promptTask, 'list_my_tasks'), '_expand_tools({category:"task"}) 现在含 list_my_tasks');
assert(hasToolSchema(promptTask, 'claim_task'), '_expand_tools({category:"task"}) 现在含 claim_task');

const promptReq = buddy.buildChatPrompt({
  currentView: '_default',
  expandedCategories: ['requirement'],
});
assert(hasToolSchema(promptReq, 'create_requirement'), '_expand_tools({category:"requirement"}) 现在含 create_requirement');

const promptWin = buddy.buildChatPrompt({
  currentView: '_default',
  expandedCategories: ['window'],
});
assert(hasToolSchema(promptWin, 'open_view'), '_expand_tools({category:"window"}) 现在含 open_view');

const promptSys = buddy.buildChatPrompt({
  currentView: '_default',
  expandedCategories: ['system'],
});
assert(hasToolSchema(promptSys, 'list_users'), '_expand_tools({category:"system"}) 现在含 list_users');

console.log('\n[test] 修复对小吉 L0 prompt 无副作用');
const promptDefault = buddy.buildChatPrompt({ currentView: '_default', userName: '多多' });
// 默认 view 不应该注入 list_my_tasks（应该保持 L0 简洁）
assert(!hasToolSchema(promptDefault, 'list_my_tasks'), '默认 view 仍不含 list_my_tasks schema（节省 token）');

console.log(`\n[结果] ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);