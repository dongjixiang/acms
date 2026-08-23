// 验证 v0.117bb：连续工具合并 group（小吉 onReplyStart 回复段分组语义）
// 场景 A：3 个连续工具（无文本穿插）→ 应合并 group
// 场景 B：3 个工具穿插在文本之间 → 应独立穿插不 group
const { JSDOM } = require('jsdom');
const fs = require('fs');

// 顶层 eval 一次模块（async function 声明进全局）
const dom0 = new JSDOM('<!DOCTYPE html><html><body><div id="chat-stream-msgs-sess-test" class="chat-stream"></div></body></html>');
global.window = dom0.window;
global.document = dom0.window.document;
global.CustomEvent = dom0.window.CustomEvent;
global.Event = dom0.window.Event;
eval(fs.readFileSync('client/js/core/agent-buddy-tool-card.js', 'utf8'));
eval(fs.readFileSync('client/js/views/requirements/chat.js', 'utf8'));

function freshContainer() {
  // 复用同一 document（ACMSQwenToolCard 闭包绑定 dom0 的 document，换 document 会 WrongDocumentError）
  const el = document.getElementById('chat-stream-msgs-sess-test');
  el.innerHTML = '';
  if (window.ACMSQwenToolCard && window.ACMSQwenToolCard.reset) window.ACMSQwenToolCard.reset();
  return el;
}

function runEvents(container, events) {
  const sseText = events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('');
  let idx = 0;
  const resp = { body: { getReader() { return { async read() { if (idx >= sseText.length) return { done: true }; const c = sseText.slice(idx, idx + 10); idx += 10; return { done: false, value: new TextEncoder().encode(c) }; } }; } } };
  return handleFreeChatSSE('sess-test', resp, null);
}

function dumpOrder(container) {
  const kids = [];
  container.childNodes.forEach(n => {
    if (n.nodeType !== 1) return;
    if (n.classList.contains('ap-tool-group')) {
      const cardNames = [];
      n.querySelectorAll('.ap-tool-card').forEach(c => cardNames.push(c.getAttribute('data-tool-name') || '?'));
      kids.push('组[' + cardNames.join(',') + ']');
    } else if (n.classList.contains('ap-tool-card')) kids.push('卡片:' + (n.getAttribute('data-tool-name') || '?'));
    else if (n.classList.contains('ap-msg')) {
      const t = n.querySelector('.ap-msg-text');
      kids.push('气泡:' + (t ? t.textContent.slice(0, 8) : '?'));
    } else kids.push(n.className || n.id || n.tagName);
  });
  return kids.join(' | ');
}

function tool(useId, name) {
  return [
    { type: 'tool_card', phase: 'start', tool_use_id: useId, tool_name: name },
    { type: 'tool_card', phase: 'input_complete', tool_use_id: useId, tool_name: name, input: { file_path: useId + '.txt' } },
    { type: 'tool_card', phase: 'result', tool_use_id: useId, tool_name: name, content: 'ok' },
  ];
}

async function main() {
  // 场景 A：3 个连续工具（无文本）→ group（用 a* id 防与 B 场景撞车）
  const containerA = freshContainer();
  await runEvents(containerA, [
    ...tool('a1', 'read_file'), ...tool('a2', 'list_directory'), ...tool('a3', 'write_file'),
    { type: 'text_delta', text: '全部完成。' },
    { type: 'end', ok: true, result: '全部完成。', error: null },
  ]);
  const orderA = dumpOrder(containerA);
  console.log('A(3连续工具):', orderA);
  console.log('A group 合并:', orderA.includes('组[') && orderA.includes('气泡:全部完成') ? '✅' : '❌');

  // 场景 B：3 个工具穿插文本 → 不 group（用 b* id 防与 A 场景撞车）
  const containerB = freshContainer();
  await runEvents(containerB, [
    { type: 'text_delta', text: '开始探索。' },
    ...tool('b1', 'read_file'),
    { type: 'text_delta', text: '找到了 a。' },
    ...tool('b2', 'list_directory'),
    { type: 'text_delta', text: '目录有内容。' },
    ...tool('b3', 'write_file'),
    { type: 'text_delta', text: '写好了。' },
    { type: 'end', ok: true, result: '写好了。', error: null },
  ]);
  const orderB = dumpOrder(containerB);
  console.log('B(穿插):', orderB);
  console.log('B debugCount:', window.ACMSQwenToolCard ? window.ACMSQwenToolCard.debugCount() : 'N/A');
  console.log('B 卡片数:', containerB.querySelectorAll('.ap-tool-card').length);
  console.log('B 全部子节点:', containerB.innerHTML.slice(0, 400));
  console.log('B 穿插不 group:', orderB.includes('气泡:开始探索') && orderB.includes('卡片:read_file') && orderB.includes('气泡:找到了') && orderB.includes('卡片:list_directory') && orderB.includes('气泡:目录有') && orderB.includes('卡片:write_file') && !orderB.includes('组[') ? '✅' : '❌');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
