// 验证自由对话 handleFreeChatSSE 穿插渲染逻辑（v0.117z）
// 模拟真实后端 SSE 事件序列，检查 DOM 中卡片/气泡的时间穿插顺序
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="chat-stream-msgs-sess-test" class="chat-stream"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.Event = dom.window.Event;
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;
global.setInterval = setInterval;
global.clearInterval = clearInterval;

// eval 加载两个前端模块
const fs = require('fs');
eval(fs.readFileSync('client/js/core/agent-buddy-tool-card.js', 'utf8'));
eval(fs.readFileSync('client/js/views/requirements/chat.js', 'utf8'));

const container = document.getElementById('chat-stream-msgs-sess-test');

// 模拟 SSE 事件流（穿插场景：文本 → 工具 → 文本 → 工具 → 文本）
const events = [
  { type: 'text_delta', text: '好的，我先看看文件。' },
  { type: 'tool_card', phase: 'start', tool_use_id: 'call_1', tool_name: 'read_file' },
  { type: 'tool_card', phase: 'input_complete', tool_use_id: 'call_1', tool_name: 'read_file', input: { file_path: 'a.txt' } },
  { type: 'tool_card', phase: 'result', tool_use_id: 'call_1', tool_name: 'read_file', content: 'file content' },
  { type: 'text_delta', text: '读完了，现在改。' },
  { type: 'tool_card', phase: 'start', tool_use_id: 'call_2', tool_name: 'write_file' },
  { type: 'tool_card', phase: 'input_complete', tool_use_id: 'call_2', tool_name: 'write_file', input: { file_path: 'b.txt', content: 'hello' } },
  { type: 'tool_card', phase: 'result', tool_use_id: 'call_2', tool_name: 'write_file', content: 'done' },
  { type: 'text_delta', text: '改好了！' },
  { type: 'end', ok: true, result: '改好了！', error: null },
];

// 构造 SSE 文本
let sseText = events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('');
let idx = 0;

// 模拟 ReadableStream
const resp = {
  body: {
    getReader() {
      return {
        async read() {
          if (idx >= sseText.length) return { done: true };
          const chunk = sseText.slice(idx, idx + 10);
          idx += 10;
          return { done: false, value: new TextEncoder().encode(chunk) };
        }
      };
    }
  }
};

function dumpOrder() {
  const kids = [];
  container.childNodes.forEach(n => {
    if (n.nodeType !== 1) return;
    if (n.classList.contains('ap-tool-card')) kids.push('卡片:' + (n.getAttribute('data-tool-name') || '?'));
    else if (n.classList.contains('ap-stream-bubble')) kids.push('气泡(流式)');
    else if (n.classList.contains('ap-msg')) {
      const txt = n.querySelector('.ap-msg-text');
      kids.push('气泡:' + (txt ? txt.textContent.slice(0, 12) : '?'));
    } else kids.push(n.className || n.id || n.tagName);
  });
  return kids.join(' | ');
}

async function main() {
  console.log('=== T1: 穿插渲染顺序 ===');
  await handleFreeChatSSE('sess-test', resp, null);
  console.log('DOM 顺序:', dumpOrder());

  const cards = container.querySelectorAll('.ap-tool-card');
  const bubbles = container.querySelectorAll('.ap-msg');
  const order = dumpOrder();
  const ok = order.includes('气泡:好的，我先') && order.includes('卡片:read_file') &&
    order.includes('气泡:读完了') && order.includes('卡片:write_file') && order.includes('气泡:改好了');
  console.log('穿插顺序正确:', ok ? '✅' : '❌', '(期望: 文本→卡片→文本→卡片→文本)');
  console.log('卡片数:', cards.length, '气泡数:', bubbles.length);
  console.log('气泡1文本:', container.querySelectorAll('.ap-msg')[0]?.querySelector('.ap-msg-text')?.textContent);
  console.log('气泡2文本:', container.querySelectorAll('.ap-msg')[1]?.querySelector('.ap-msg-text')?.textContent);
  console.log('气泡3文本:', container.querySelectorAll('.ap-msg')[2]?.querySelector('.ap-msg-text')?.textContent);
  // 残留流式气泡检查（end 后应无 .ap-stream-bubble class）
  const leftover = container.querySelectorAll('.ap-stream-bubble').length;
  console.log('end 后残留流式气泡:', leftover, leftover === 0 ? '✅' : '❌');
}

main().catch(e => { console.error('TEST ERROR:', e.message); process.exit(1); });
