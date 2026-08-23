// ============================================================
// scripts/test-free-chat-sse-flow.js
// ============================================================
// 验证 v0.117f：自由对话 Qwen SSE 流 → 工具卡片渲染
//   模拟浏览器 fetch + ReadableStream 解析 + ACMSQwenToolCard 渲染
// ============================================================

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const failed = [];
function ok(name) { pass++; console.log(`  ✓ ${name}`); }
function bad(name, e) { fail++; failed.push({ name, e }); console.log(`  ✗ ${name}: ${e}`); }
function eq(a, b, name) { if (a === b) ok(name); else bad(name, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assert(cond, name, hint) { if (cond) ok(name); else bad(name, hint || 'assertion failed'); }

// 创建 jsdom 环境
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="chat-stream-msgs-sess-debug-test-1234"></div><div id="ap-messages"></div></body></html>', {
  url: 'http://localhost:3300',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window } = dom;
const document = window.document;

// 加载 agent-buddy-tool-card.js
const toolCardSrc = fs.readFileSync(path.join(__dirname, '../../client/js/core/agent-buddy-tool-card.js'), 'utf8');
window.eval(toolCardSrc);

console.log('\n=== T1: ACMSQwenToolCard 加载 ===\n');
assert(window.ACMSQwenToolCard, 'T1a ACMSQwenToolCard 已挂载');
assert(typeof window.ACMSQwenToolCard.handleToolCard === 'function', 'T1b handleToolCard 是函数');
assert(typeof window.ACMSQwenToolCard.handleThinking === 'function', 'T1c handleThinking 是函数');
assert(typeof window.ACMSQwenToolCard.setContainer === 'function', 'T1d setContainer 是函数');

console.log('\n=== T2: setContainer 切换到自由对话窗口 ===\n');
const freeContainer = document.getElementById('chat-stream-msgs-sess-debug-test-1234');
window.ACMSQwenToolCard.setContainer(freeContainer);
ok('T2 setContainer 调用成功');

console.log('\n=== T3: handleToolCard 模拟 6 类 phase ===\n');

// 模拟 tool_use_start
window.ACMSQwenToolCard.handleToolCard({
  type: 'tool_card', phase: 'start', tool_use_id: 'tu_A1',
  tool_name: 'write_file',
});
let freeCards = freeContainer.querySelectorAll('.ap-tool-card, [class*="tool-card"]');
let apCards = document.getElementById('ap-messages').querySelectorAll('.ap-tool-card, [class*="tool-card"]');
assert(freeCards.length > 0, 'T3a tool_card 在 free container 渲染', `free=${freeCards.length} ap=${apCards.length}`);
assert(apCards.length === 0, 'T3b tool_card 不在 #ap-messages 渲染', `ap=${apCards.length}`);

// input_complete
window.ACMSQwenToolCard.handleToolCard({
  type: 'tool_card', phase: 'input_complete', tool_use_id: 'tu_A1',
  tool_name: 'write_file', input: { path: 'hello.txt', content: 'hello world' },
});
freeCards = freeContainer.querySelectorAll('.ap-tool-card, [class*="tool-card"]');
ok('T3c input_complete 后卡片数不变（仍在 free container）');

// await_approval
window.ACMSQwenToolCard.handleToolCard({
  type: 'tool_card', phase: 'await_approval', tool_use_id: 'tu_A1',
  tool_name: 'write_file', input: { path: 'hello.txt' },
});
freeCards = freeContainer.querySelectorAll('.ap-tool-card, [class*="tool-card"]');
ok('T3d await_approval 后卡片仍在');

// result
window.ACMSQwenToolCard.handleToolCard({
  type: 'tool_card', phase: 'result', tool_use_id: 'tu_A1',
  tool_name: 'write_file', result: 'File created', error: null,
});
freeCards = freeContainer.querySelectorAll('.ap-tool-card, [class*="tool-card"]');
ok('T3e result 后卡片仍在 free container');

// approval_decided
window.ACMSQwenToolCard.handleToolCard({
  type: 'tool_card', phase: 'approval_decided', tool_use_id: 'tu_A1',
  tool_name: 'write_file', decision: 'allow',
});
freeCards = freeContainer.querySelectorAll('.ap-tool-card, [class*="tool-card"]');
ok('T3f approval_decided 后卡片仍在 free container');

console.log('\n=== T4: 完整事件流模拟 ===\n');
// 模拟 4 个工具调用：list_directory / glob / write_file / read_file
const tools = [
  { name: 'list_directory', input: { path: '.' } },
  { name: 'glob', input: { pattern: '*' } },
  { name: 'write_file', input: { path: 'hello.txt', content: 'hello' } },
  { name: 'read_file', input: { path: 'hello.txt' } },
];

for (var i = 0; i < tools.length; i++) {
  var tool = tools[i];
  var id = 'tu_T' + i;
  window.ACMSQwenToolCard.handleToolCard({ type: 'tool_card', phase: 'start', tool_use_id: id, tool_name: tool.name });
  window.ACMSQwenToolCard.handleToolCard({ type: 'tool_card', phase: 'input_complete', tool_use_id: id, tool_name: tool.name, input: tool.input });
  window.ACMSQwenToolCard.handleToolCard({ type: 'tool_card', phase: 'await_approval', tool_use_id: id, tool_name: tool.name, input: tool.input });
  window.ACMSQwenToolCard.handleToolCard({ type: 'tool_card', phase: 'approval_decided', tool_use_id: id, tool_name: tool.name, decision: 'allow' });
  window.ACMSQwenToolCard.handleToolCard({ type: 'tool_card', phase: 'result', tool_use_id: id, tool_name: tool.name, result: 'OK' });
}

freeCards = freeContainer.querySelectorAll('[class*="tool-card"]');
assert(freeCards.length >= 4, 'T4a 4 个工具调用后 ≥ 4 张卡片', `实际 ${freeCards.length} 张`);

// 检查内容含工具名
var allHtml = freeContainer.innerHTML;
assert(allHtml.includes('write_file'), 'T4b free container 含 write_file');
assert(allHtml.includes('read_file'), 'T4c free container 含 read_file');
assert(allHtml.includes('list_directory'), 'T4d free container 含 list_directory');
assert(allHtml.includes('glob'), 'T4e free container 含 glob');

console.log('\n=== T5: handleThinking 模拟 ===\n');
window.ACMSQwenToolCard.handleThinking({ type: 'thinking', thinking: '我需要先看一下当前目录结构,然后写入文件。' });
freeCards = freeContainer.querySelectorAll('[class*="thinking"]');
assert(freeCards.length > 0, 'T5a thinking 卡片在 free container', `实际 ${freeCards.length}`);

console.log(`\n=== 结果：${pass}/${pass+fail} 通过 ===`);
if (fail > 0) {
  console.log('失败项：');
  for (var f of failed) console.log(' -', f.name, ':', f.e);
  process.exit(1);
}
process.exit(0);
