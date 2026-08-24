(async () => {
  const sessId = 'sess-debug-x1';
  const c = document.getElementById('chat-stream-msgs-__free__');
  if (!c) return JSON.stringify({error: 'no container'});
  c.id = 'chat-stream-msgs-' + sessId;

  if (!window._chatState) window._chatState = {};
  if (!window._chatPollers) window._chatPollers = {};
  window._chatState[sessId] = { histCount: 0, briefRound: 0 };

  const log = [];
  const origLog = console.log;
  console.log = function(...args) {
    log.push(['LOG', args.join(' ').slice(0, 300)]);
    origLog.apply(console, args);
  };
  const origWarn = console.warn;
  console.warn = function(...args) {
    log.push(['WARN', args.join(' ').slice(0, 300)]);
    origWarn.apply(console, args);
  };
  const origErr = console.error;
  console.error = function(...args) {
    log.push(['ERR', args.join(' ').slice(0, 300)]);
    origErr.apply(console, args);
  };

  // 直接 patch fetch 看 /supplement-history 调用情况
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = args[0];
    if (typeof url === 'string' && url.includes('/supplement-history')) {
      log.push(['FETCH', url.slice(0, 100)]);
    }
    return origFetch.apply(this, args);
  };

  try {
    window.startChatPolling(sessId);
    await new Promise(r => setTimeout(r, 5000));
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origErr;
    window.fetch = origFetch;
  }

  if (window._chatPollers[sessId]) {
    clearInterval(window._chatPollers[sessId]);
    delete window._chatPollers[sessId];
  }

  return JSON.stringify({
    children: c.children.length,
    bubblesAll: c.querySelectorAll('.chat-bubble').length,
    bubblesSystem: c.querySelectorAll('.chat-bubble-system').length,
    screenplayCards: c.querySelectorAll('.screenplay-card-in-chat').length,
    innerHTML_tail: c.innerHTML.slice(-400),
    stateHistCount: window._chatState[sessId]?.histCount,
    hasPoller: !!window._chatPollers[sessId],
    debugLog: log.slice(0, 20),
  }, null, 2);
})()
