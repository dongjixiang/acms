// 复现：同轮 3+ 工具 + 文本穿插时 group 是否破坏时间顺序
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="chat-stream-msgs-sess-test" class="chat-stream"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.Event = dom.window.Event;

const fs = require('fs');
eval(fs.readFileSync('client/js/core/agent-buddy-tool-card.js', 'utf8'));
eval(fs.readFileSync('client/js/views/requirements/chat.js', 'utf8'));

const container = document.getElementById('chat-stream-msgs-sess-test');

// 场景：文本 → 工具1 → 文本 → 工具2 → 文本 → 工具3 → 文本（3 个工具穿插在文本之间）
const events = [
  { type: 'text_delta', text: '开始探索。' },
  { type: 'tool_card', phase: 'start', tool_use_id: 'c1', tool_name: 'read_file' },
  { type: 'tool_card', phase: 'input_complete', tool_use_id: 'c1', tool_name: 'read_file', input: { file_path: 'a.txt' } },
  { type: 'tool_card', phase: 'result', tool_use_id: 'c1', tool_name: 'read_file', content: 'a' },
  { type: 'text_delta', text: '找到了 a。' },
  { type: 'tool_card', phase: 'start', tool_use_id: 'c2', tool_name: 'list_directory' },
  { type: 'tool_card', phase: 'input_complete', tool_use_id: 'c2', tool_name: 'list_directory', input: { path: '.' } },
  { type: 'tool_card', phase: 'result', tool_use_id: 'c2', tool_name: 'list_directory', content: 'b' },
  { type: 'text_delta', text: '目录有内容。' },
  { type: 'tool_card', phase: 'start', tool_use_id: 'c3', tool_name: 'write_file' },
  { type: 'tool_card', phase: 'input_complete', tool_use_id: 'c3', tool_name: 'write_file', input: { file_path: 'x.txt', content: 'x' } },
  { type: 'tool_card', phase: 'result', tool_use_id: 'c3', tool_name: 'write_file', content: 'ok' },
  { type: 'text_delta', text: '写好了。' },
  { type: 'end', ok: true, result: '写好了。', error: null },
];

let sseText = events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('');
let idx = 0;
const resp = { body: { getReader() { return { async read() { if (idx >= sseText.length) return { done: true }; const c = sseText.slice(idx, idx + 10); idx += 10; return { done: false, value: new TextEncoder().encode(c) }; } }; } } };

function dumpOrder() {
  const kids = [];
  container.childNodes.forEach(n => {
    if (n.nodeType !== 1) return;
    if (n.classList.contains('ap-tool-group')) {
      const body = n.querySelector('.ap-tool-group-body');
      const cardNames = [];
      body.querySelectorAll('.ap-tool-card').forEach(c => cardNames.push(c.getAttribute('data-tool-name') || '?'));
      kids.push('组[' + cardNames.join(',') + ']');
    } else if (n.classList.contains('ap-tool-card')) kids.push('卡片:' + (n.getAttribute('data-tool-name') || '?'));
    else if (n.classList.contains('ap-msg')) {
      const t = n.querySelector('.ap-msg-text');
      kids.push('气泡:' + (t ? t.textContent.slice(0, 8) : '?'));
    } else kids.push(n.className || n.id || n.tagName);
  });
  return kids.join(' | ');
}

async function main() {
  await handleFreeChatSSE('sess-test', resp, null);
  console.log('DOM 顺序:', dumpOrder());
  console.log('期望(穿插): 气泡:开始 | 卡片:read_file | 气泡:找到了 | 卡片:list_directory | 气泡:目录有 | 卡片:write_file | 气泡:写好了');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
