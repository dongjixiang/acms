(async () => {
  const sessId = 'sess-debug-x1';
  const c = document.getElementById('chat-stream-msgs-__free__');
  if (!c) return JSON.stringify({error: 'no container'});

  // 关键：把容器 ID 改成 sess-debug-x1
  c.id = 'chat-stream-msgs-' + sessId;

  if (!window._chatState) window._chatState = {};
  if (!window._chatPollers) window._chatPollers = {};
  window._chatState[sessId] = { histCount: 0, briefRound: 0 };

  const log = [];
  const origConsole = console.log;
  console.log = function(...args) { log.push(args.join(' ').slice(0, 200)); origConsole.apply(console, args); };

  try {
    window.startChatPolling(sessId);
    await new Promise(r => setTimeout(r, 4500));
  } finally {
    console.log = origConsole;
  }

  // 清理
  if (window._chatPollers[sessId]) {
    clearInterval(window._chatPollers[sessId]);
    delete window._chatPollers[sessId];
  }

  return JSON.stringify({
    sessId,
    containerId: c.id,
    children: c.children.length,
    bubblesAll: c.querySelectorAll('.chat-bubble').length,
    bubblesSystem: c.querySelectorAll('.chat-bubble-system').length,
    screenplayCards: c.querySelectorAll('.screenplay-card-in-chat').length,
    innerHTML_tail: c.innerHTML.slice(-600),
    stateHistCount: window._chatState[sessId]?.histCount,
    debugLog: log.slice(0, 8),
  }, null, 2);
})()
