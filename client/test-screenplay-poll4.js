(async () => {
  const sessId = 'sess-debug-x1';
  const c = document.getElementById('chat-stream-msgs-' + sessId);
  if (!c) return JSON.stringify({error: 'no container for ' + sessId});

  const log = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origErr = console.error;
  console.log = function(...a) { log.push(['L', a.join(' ').slice(0, 300)]); origLog.apply(console, a); };
  console.warn = function(...a) { log.push(['W', a.join(' ').slice(0, 300)]); origWarn.apply(console, a); };
  console.error = function(...a) { log.push(['E', a.join(' ').slice(0, 300)]); origErr.apply(console, a); };

  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
    if (url.includes('/supplement-history') || url.includes('/thinking-brief') || url.includes('/assist')) {
      log.push(['F', url.slice(0, 150)]);
    }
    return origFetch.apply(this, args);
  };

  const stateBefore = JSON.stringify(window._chatState?.[sessId]);
  const pollerBefore = !!window._chatPollers?.[sessId];

  try {
    window.startChatPolling(sessId);
    await new Promise(r => setTimeout(r, 5000));
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origErr;
    window.fetch = origFetch;
  }

  if (window._chatPollers?.[sessId]) {
    clearInterval(window._chatPollers[sessId]);
    delete window._chatPollers[sessId];
  }

  return JSON.stringify({
    stateBefore,
    pollerBefore,
    children: c.children.length,
    bubblesAll: c.querySelectorAll('.chat-bubble').length,
    bubblesSystem: c.querySelectorAll('.chat-bubble-system').length,
    screenplayCards: c.querySelectorAll('.screenplay-card-in-chat').length,
    stateHistCount: window._chatState?.[sessId]?.histCount,
    innerHTML_tail: c.innerHTML.slice(-500),
    debugLog: log.slice(0, 30),
  }, null, 2);
})()
