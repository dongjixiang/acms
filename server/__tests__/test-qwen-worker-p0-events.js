// ============================================================
// test-qwen-worker-p0-events.js — P0 方案B 事件透传 mock 测试
// 不 spawn 真实 CLI，直接喂 JSONL line 验证 4 个新事件透传
// ============================================================
const path = require('path');
const SERVER = path.join(__dirname, '..');
process.chdir(SERVER);

const assert = require('assert');
const { QwenSession } = require('../services/qwen-worker');

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

console.log('=== qwen-worker P0 事件透传 mock 测试 ===\n');

// 不调 start()，绕过 CLI spawn；mock 必要字段
const events = [];
const s = new QwenSession({
  model: 'mock-model',
  authType: 'anthropic',
  baseUrl: 'http://mock',
  apiKey: 'mock-key',
  cwd: '/tmp',
  sessionId: 'test-uuid-p0',
  onEvent: (e) => events.push(e),
});

// ============ Case 1: 工具调用完整生命周期 ============
console.log('--- Case 1: tool_use_start / tool_use_end 透传 ---');

// 1.1 content_block_start (tool_use)
s._handleLine(JSON.stringify({
  type: 'stream_event',
  event: {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'tool_use', id: 'tu_1', name: 'read_file' },
  },
}));

const startEvt = events.find((e) => e.type === 'tool_use_start');
check('tool_use_start 已 emit',
  startEvt && startEvt.tool_use_id === 'tu_1' && startEvt.tool_name === 'read_file',
  JSON.stringify(startEvt));

// 1.2 input_json_delta 流式累加
s._handleLine(JSON.stringify({
  type: 'stream_event',
  event: {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'input_json_delta', partial_json: '{"file_path":' },
  },
}));
s._handleLine(JSON.stringify({
  type: 'stream_event',
  event: {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'input_json_delta', partial_json: '"/test/file.txt"}' },
  },
}));

// 1.3 content_block_stop → 触发 tool_use_end（input 完整 + JSON 解析）
s._handleLine(JSON.stringify({
  type: 'stream_event',
  event: { type: 'content_block_stop', index: 0 },
}));

const endEvt = events.find((e) => e.type === 'tool_use_end');
check('tool_use_end 已 emit',
  endEvt && endEvt.tool_use_id === 'tu_1' && endEvt.tool_name === 'read_file',
  JSON.stringify(endEvt));
check('tool_use_end input JSON 已解析',
  endEvt && endEvt.input && endEvt.input.file_path === '/test/file.txt',
  endEvt ? JSON.stringify(endEvt.input) : 'null');
check('tool_use 状态已清理 (_lastToolUseId)',
  s._lastToolUseId === null,
  `_lastToolUseId=${s._lastToolUseId}`);
check('toolUseAccum 已清理该 id',
  !s._toolUseAccum.has('tu_1'));

// ============ Case 2: tool_result 在 user 消息里 ============
console.log('\n--- Case 2: tool_result 在 user 消息里透传 ---');

s._handleLine(JSON.stringify({
  type: 'user',
  message: {
    role: 'user',
    content: [
      { type: 'tool_result', tool_use_id: 'tu_1', content: 'hello world', is_error: false },
    ],
  },
}));

const resultEvt = events.find((e) => e.type === 'tool_result');
check('tool_result 已 emit (string content)',
  resultEvt && resultEvt.tool_use_id === 'tu_1' && resultEvt.content === 'hello world' && !resultEvt.is_error,
  JSON.stringify(resultEvt));

// 2.1 content 是数组形式（multi-block result）
events.length = 0;
s._handleLine(JSON.stringify({
  type: 'user',
  message: {
    role: 'user',
    content: [
      { type: 'tool_result', tool_use_id: 'tu_2', content: [{ type: 'text', text: 'part1' }, { type: 'text', text: 'part2' }], is_error: false },
    ],
  },
}));

const resultEvt2 = events.find((e) => e.type === 'tool_result' && e.tool_use_id === 'tu_2');
check('tool_result 数组 content 拼成 string',
  resultEvt2 && resultEvt2.content === 'part1part2',
  resultEvt2 ? JSON.stringify(resultEvt2) : 'null');

// 2.2 tool_result is_error=true
events.length = 0;
s._handleLine(JSON.stringify({
  type: 'user',
  message: {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: 'tu_3', content: 'permission denied', is_error: true }],
  },
}));

const resultEvt3 = events.find((e) => e.type === 'tool_result' && e.tool_use_id === 'tu_3');
check('tool_result is_error=true 透传',
  resultEvt3 && resultEvt3.is_error === true,
  JSON.stringify(resultEvt3));

// 2.3 user 消息不含 tool_result（普通 user echo）— 不应误触发
events.length = 0;
s._handleLine(JSON.stringify({
  type: 'user',
  message: { role: 'user', content: 'hello qwen' },
}));
check('普通 user 消息不误触发 tool_result',
  !events.find((e) => e.type === 'tool_result'),
  events.length === 0 ? 'no events emitted' : JSON.stringify(events));

// ============ Case 3: thinking_delta 透传 ============
console.log('\n--- Case 3: thinking_delta 透传 ---');

events.length = 0;
s._handleLine(JSON.stringify({
  type: 'stream_event',
  event: {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking: '用户在问...我需要先' },
  },
}));
s._handleLine(JSON.stringify({
  type: 'stream_event',
  event: {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking: '考虑读文件' },
  },
}));

const thinkingEvts = events.filter((e) => e.type === 'thinking_delta');
check('thinking_delta 多次 emit',
  thinkingEvts.length === 2,
  `count=${thinkingEvts.length}`);
check('thinking_delta text 透传',
  thinkingEvts[0] && thinkingEvts[0].text === '用户在问...我需要先',
  thinkingEvts[0] ? thinkingEvts[0].text : 'null');

// ============ Case 4: 旧事件不受影响 ============
console.log('\n--- Case 4: 回归 — 旧事件仍正常 emit ---');

events.length = 0;
// 4.1 text_delta 仍走 _onDelta 路径
let deltaSum = '';
s._onDelta = (d) => { deltaSum += d; };
s._handleLine(JSON.stringify({
  type: 'stream_event',
  event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '你好' } },
}));
check('text_delta 真流式回调仍工作', deltaSum === '你好', `deltaSum=${deltaSum}`);

// 4.2 assistant 消息仍 emit
events.length = 0;
s._handleLine(JSON.stringify({
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
}));
check('assistant 消息仍 emit',
  events.find((e) => e.type === 'assistant') !== undefined,
  `events.length=${events.length}`);

// 4.3 approval_request (can_use_tool) 仍走 _handleApproval — 这里不直接测试，需要 mock child.stdin
//    但我们验证 _handleApproval 逻辑没被破坏：构造函数仍保留 onApproval / onEvent 字段
check('onApproval 仍保留',
  typeof s.onApproval === 'function',
  `onApproval=${typeof s.onApproval}`);
check('onEvent 仍保留',
  typeof s.onEvent === 'function');

// ============ Case 5: input_json 解析失败兜底 ============
console.log('\n--- Case 5: input_json 解析失败兜底 ---');

events.length = 0;
s._handleLine(JSON.stringify({
  type: 'stream_event',
  event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_bad', name: 'bash' } },
}));
s._handleLine(JSON.stringify({
  type: 'stream_event',
  event: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{not valid json' } },
}));
s._handleLine(JSON.stringify({
  type: 'stream_event',
  event: { type: 'content_block_stop', index: 0 },
}));

const badEndEvt = events.find((e) => e.type === 'tool_use_end' && e.tool_use_id === 'tu_bad');
check('坏 JSON 不崩，input 兜底为空对象',
  badEndEvt && badEndEvt.input && Object.keys(badEndEvt.input).length === 0,
  badEndEvt ? JSON.stringify(badEndEvt) : 'null');

// ============ 总结 ============
console.log('\n=== 测试总结 ===');
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log(`通过 ${passed}/${results.length}`);
if (failed.length) {
  console.log('\n❌ 失败:');
  failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
  process.exit(1);
}
console.log('✅ 全部通过');