// === ACMS v0.13 B5 auto-reply 诊断探针 v3 — 读关键状态 ===
(() => {
  if (window._aiAutoDiagInstalled) { console.log('[diag] 已安装'); return; }
  window._aiAutoDiagInstalled = true;
  console.log('[diag] 探针 v3 启动 — 读关键状态');

  const findReqId = () => {
    const bar = document.querySelector('[id^="ai-auto-indicator-"]');
    if (bar) return bar.id.replace('ai-auto-indicator-', '');
    const c = document.querySelector('[id^="chat-stream-msgs-"]');
    if (c) return c.id.replace('chat-stream-msgs-', '');
    return null;
  };

  const probe = setInterval(() => {
    const reqId = findReqId();
    if (!reqId) return;
    const t = new Date().toISOString().substring(11, 19);
    const cd = window._aiAutoCountdowns?.[reqId];
    const lastRound = window._aiAutoLastRound?.[reqId];
    const stateRound = window._chatState?.[reqId]?.briefRound;
    const sentCount = window._aiAutoSentCount?.[reqId];
    const state = window._aiReplyState?.[reqId];
    const running = window._aiAutoRunning?.[reqId];
    const left = cd ? Math.max(0, Math.ceil((cd.deadlineMs - Date.now()) / 1000)) : -1;
    const cdFired = cd?.fired;
    const bar = document.getElementById(`ai-auto-indicator-${reqId}`);
    const barText = bar?.querySelector('.ai-auto-indicator-text')?.textContent || '';
    const barVisible = bar ? window.getComputedStyle(bar).display !== 'none' : false;
    const container = document.getElementById(`chat-stream-msgs-${reqId}`);
    const hasStreamingBubble = !!container?.querySelector('.chat-streaming-bubble');

    // 只在状态变化时打日志
    const sig = `${state}|${left}|${lastRound}|${stateRound}|${sentCount}|${running}|${cdFired}|${hasStreamingBubble}`;
    if (probe._lastSig !== sig) {
      console.log(`[diag ${t}] state=${state} left=${left}s lastRound=${lastRound} stateRound=${stateRound} sentCount=${sentCount} running=${running} cdFired=${cdFired} streaming=${hasStreamingBubble}`);
      probe._lastSig = sig;
    }
    const barSig = `${barInDom}|${barVisible}|${barText}`;
    if (probe._lastBarSig !== barSig) {
      console.log(`[diag ${t}] BAR inDom=${!!bar} visible=${barVisible} text="${barText}"`);
      probe._lastBarSig = barSig;
    }
  }, 1000);

  window._diagStop = () => { clearInterval(probe); window._aiAutoDiagInstalled = false; console.log('[diag] 停止'); };
})();
