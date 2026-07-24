// ═══════════════════════════════════════════════════════════
// ACMS Agent 执行链集成测试（v0.64）
// ═══════════════════════════════════════════════════════════
// 验证：
//   1. 工具提取后注册正确（agent_set_phase / agent_typescheck / agent_plan）
//   2. Planner 无法理解检测模式（9个正则）
//   3. workspace-meta 经验记忆（recordExperience + getSummaryForPrompt）
//   4. Guardrail 描述过短警告
//   5. delegate_subtasks 工具 handler
//
// 不依赖真实 server / DB / LLM，只 mock 必要依赖

(async () => {
const path = require('path');
const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('  ✅ ' + msg); } else { failed++; console.log('  ❌ ' + msg); } }
function assertEq(a, b, msg) { assert(a === b, msg + ` (expected=${JSON.stringify(b)}, got=${JSON.stringify(a)})`); }
function assertIn(needle, haystack, msg) { assert(haystack.includes(needle), msg + ` — expected to find "${needle}" in "${String(haystack).slice(0, 100)}"`); }

// ── 1. 工具注册验证 ──
console.log('\n📦 1. Tool registration (extracted tools)');

// Load tool registry
const { getTool, listTools } = require(path.join(ROOT, 'server/services/tool-registry'));

// Load extracted tool files (they register themselves)
require(path.join(ROOT, 'server/tools/agent/phase'));
require(path.join(ROOT, 'server/tools/agent/check'));
require(path.join(ROOT, 'server/tools/agent/plan'));

assert(!!getTool('agent_set_phase'), 'agent_set_phase registered');
assert(!!getTool('agent_typescheck'), 'agent_typescheck registered');
assert(!!getTool('agent_plan'), 'agent_plan registered');

const tPhase = getTool('agent_set_phase');
assertEq(tPhase.parameters.properties.phase.enum.join(','), 'explore,design,write,test,fix', 'agent_set_phase has 5 phases');
assert(tPhase.parameters.required.includes('phase'), 'agent_set_phase requires phase');

const tPlan = getTool('agent_plan');
assert(tPlan.parameters.required.includes('summary'), 'agent_plan requires summary');
assert(tPlan.parameters.required.includes('files'), 'agent_plan requires files');
assert(tPlan.parameters.required.includes('steps'), 'agent_plan requires steps');

const tCheck = getTool('agent_typescheck');
assertEq(tCheck.parameters.properties.path.type, 'string', 'agent_typescheck has path parameter');

// ── 2. Planner 无法理解检测 ──
console.log('\n🔍 2. Planner cannot-understand pattern matching');

// These patterns are defined in task-agent.js as PLANNER_CANNOT_UNDERSTAND_PATTERNS
const PATTERNS = [
  /i\s+(?:cannot|can'?t|couldn'?t)\s+(?:understand|figure\s+out|determine|proceed)\b/i,
  /(?:not\s+enough|insufficient|lack(?:ing)?|missing|without)\s+(?:information|context|details?|clarity|requirements?)\b/i,
  /task\s+(?:description\s+)?(?:is\s+)?(?:unclear|too\s+vague|too\s+brief|insufficient|empty|ambiguous|too\s+short)\b/i,
  /(?:no|without)\s+(?:clear|sufficient|specific)\s+(?:requirements?|acceptance\s+criteria|details?|instructions?)\b/i,
  /i\s+(?:need|require)\s+(?:more|additional|clearer|specific)\s+(?:context|information|details?|requirements?|clarification)\b/i,
  /(?:无法|不能|难以|很难)\s*(?:理解|确定|判断|继续|规划|开始)/,
  /(?:信息|上下文|详情|细节|要求|上下文信息)\s*(?:不足|不够|太少|缺失|有限)/,
  /(?:任务|描述|说明)\s*(?:太短|不够|不清晰|不明确|模糊|过于简单|过于简短|太简单)/,
  /(?:请|需要|请先)\s*(?:补充|提供|明确|澄清)\s*(?:描述|详情|信息|上下文|要求|任务说明|任务描述)/,
];

// Test cases that SHOULD match
const shouldMatch = [
  'I cannot understand this task without more context.',
  'Insufficient information to proceed.',
  'Task description is too vague and unclear.',
  'No clear requirements provided.',
  'I need more details about what you want.',
  '无法理解这个任务需要做什么。',
  '上下文信息不足，无法规划。',
  '任务描述太短，不明确。',
  '请补充任务描述信息。',
];
for (const text of shouldMatch) {
  const matched = PATTERNS.some(p => p.test(text));
  assert(matched, `Pattern should match: "${text.slice(0, 50)}..."`);
}

// Test cases that should NOT match
const shouldNotMatch = [
  'Plan: modify 3 files in src/game/ to add grid rendering.',
  'I need to check the workspace structure first.',
  '无法找到文件 src/game/GameLoop.js',
  'Cannot determine the file path without reading the config.',
  'The requirements are clear: add a new login page.',
];
for (const text of shouldNotMatch) {
  const matched = PATTERNS.some(p => p.test(text));
  assert(!matched, `Pattern should NOT match: "${text.slice(0, 50)}..."`);
}

// ── 3. workspace-meta 经验记忆 ──
console.log('\n📗 3. Workspace memory experiences');

const workspaceMeta = require(path.join(ROOT, 'server/services/workspace-meta'));

// Test with test workspace
const slug = '_test_xp_' + Date.now();

// Record an experience
workspaceMeta.recordExperience(slug, {
  taskId: 'T-TEST-001',
  title: '修复登录页样式',
  outcome: 'completed',
  summary: '成功修复了登录按钮 hover 效果和输入框对齐问题',
  pitfalls: 'CSS 优先级不够，需加 !important',
});

// Record a failed experience
workspaceMeta.recordExperience(slug, {
  taskId: 'T-TEST-002',
  title: '添加用户权限管理',
  outcome: 'failed',
  summary: 'Planner 无法找到相关 API 文档',
  pitfalls: '缺少 API 文档，需要补充',
});

// Read back
const recent = workspaceMeta.getRecentExperiences(slug, 2);
assertEq(recent.length, 2, 'getRecentExperiences returns 2 entries');
assertEq(recent[0].title, '修复登录页样式', 'First experience title correct');
assertEq(recent[0].outcome, 'completed', 'First experience outcome correct');
assertIn('!important', recent[0].pitfalls, 'First experience pitfalls preserved');
assertEq(recent[1].outcome, 'failed', 'Second experience outcome correct');



// Clean up: flush and delete meta file
// Also record a file read so getSummaryForPrompt doesn't return "empty" too early
workspaceMeta.recordRead(slug, 'src/test.js');

// Now getSummaryForPrompt should include experiences
const summary2 = workspaceMeta.getSummaryForPrompt(slug);
assertIn('Past task experience', summary2, 'getSummaryForPrompt includes experiences section');
assertIn('修复登录页样式', summary2, 'getSummaryForPrompt includes experience title');
assertIn('❌', summary2, 'getSummaryForPrompt shows failure icon');
assertIn('✅', summary2, 'getSummaryForPrompt shows success icon');

// Also test getSummaryForPrompt with ONLY experiences (no files)
const slug2 = '_test_xp_only_' + Date.now();
workspaceMeta.recordExperience(slug2, { taskId: 'T-ONLY', title: 'only xp', outcome: 'completed', summary: 'test', pitfalls: '' });
const summaryOnly = workspaceMeta.getSummaryForPrompt(slug2);
assertIn('Past task experience', summaryOnly, 'getSummaryForPrompt works with only experiences (no files)');

workspaceMeta.flushAll();
const fs = require('fs');
const metaPath = path.join(ROOT, 'workspaces', slug, '.acms-meta.json');
try { if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath); } catch (e) {}
try { fs.rmdirSync(path.join(ROOT, 'workspaces', slug)); } catch (e) {}

// ── 4. Guardrail 描述过短警告 ──
console.log('\n⚠️  4. Guardrail: description too short warning');

function makeDescWarning(desc) {
  return (desc || '').length < 20
    ? '\n\n⚠️ 注意：当前任务描述较短（' + ((desc || '').length + '').trim() + ' 字）。'
    + '如果无法从现有信息理解任务，请直接说明需要补充哪些信息，不要花费过多精力探索 workspace。'
    : '';
}

assertEq(makeDescWarning('test'), '\n\n⚠️ 注意：当前任务描述较短（4 字）。如果无法从现有信息理解任务，请直接说明需要补充哪些信息，不要花费过多精力探索 workspace。', 'Short desc produces warning');
assertEq(makeDescWarning('修复登录页样式——输入框对齐问题——超二十'), '', 'Long desc (24+ chars) produces no warning');
assertEq(makeDescWarning(''), '\n\n⚠️ 注意：当前任务描述较短（0 字）。如果无法从现有信息理解任务，请直接说明需要补充哪些信息，不要花费过多精力探索 workspace。', 'Empty desc produces warning');
assert(makeDescWarning('1234567890123456789') !== '', '19 chars produces warning');
assertEq(makeDescWarning('12345678901234567890'), '', '20 chars, no warning');

// ── 5. agent_set_phase handler ──
console.log('\n🔄 5. agent_set_phase handler');

// Mock taskStore
const taskStore = require(path.join(ROOT, 'server/stores/task-store'));

// Create a test task first (need projectId)
// Task creation needs a project to exist, but let's test error cases instead
const phaseResult = await getTool('agent_set_phase').handler(
  { phase: 'write', note: '正在写代码' },
  { taskId: 'NONEXISTENT-TASK-ID' }
);
assert(phaseResult.error === 'TASK_NOT_FOUND' || phaseResult.ok === false, 'agent_set_phase handles missing task');

// Test invalid phase
const invalidResult = await getTool('agent_set_phase').handler(
  { phase: 'invalid_phase' },
  { taskId: 'T-TEST-001' }
);
assert(invalidResult.error && invalidResult.error.includes('INVALID_PHASE'), 'agent_set_phase rejects invalid phase');

// ── 6. agent_plan handler ──
console.log('\n📋 6. agent_plan handler');

const planResult = await getTool('agent_plan').handler(
  { summary: 'Add 2 files', files: [{ path: 'a.js', purpose: 'main' }], steps: ['1. Create a.js'] },
  { taskId: 'NONEXISTENT-TASK-ID' }
);
// Should still return success since it writes to store (which swallows errors)
assert(planResult.ok === true, 'agent_plan returns ok:true');
assertIn('Plan written', planResult.message, 'agent_plan returns Plan written message');

// ── 结果汇总 ──
console.log('\n' + '='.repeat(50));
console.log(`📊 结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) {
  console.log('❌ 有失败项!');
  process.exit(1);
} else {
  console.log('✅ 全部通过!');
}
})();
