// ============================================================
// ACMS v0.13 B5 auto-reply 诊断探针
// 用法：F12 → Console → 粘进去 → 回车 → 启用 auto 态 → 复制日志
// 设计：只读全局状态，不改任何业务代码，可随时 _diagStop() 停
// ============================================================
(() => {
  if (window._aiAutoDiagInstalled) { console.log('[diag] 已安装，重复安装跳过'); return; }
  window._aiAutoDiagInstalled = true;
  console.log('[diag] v0.13 B5 auto-reply 探针启动 ✓');
  console.log('[diag] 关注字段：');
  console.log('  - countdownLeft: 倒计时剩余秒数（-1 = 倒计时不存在）');
  console.log('  - barText: 指示条 DOM 实际显示文本（这是你看到的"5 秒后发送"）');
  console.log('  - lastRound: _aiAutoLastRound（上次自动过的 brief 轮次）');
  console.log('  - sentCount: _aiAutoSentCount（累计自动发送次数）');
  console.log('  - state.briefRound: 前端本地 chatState 跟踪的 brief 轮次');
  console.log('  - state: 当前态 off/draft/auto');
  console.log('  - streamingBubble: 流式 bubble 是否还在（class 含 chat-streaming-bubble）');
  console.log('  - barInDom: 指示条 DOM 是否在页面里');

  // 找当前 reqId（从 page 找 .ai-auto-indicator 的 id）
  const findReqId = () => {
    const bar = document.querySelector('[id^="ai-auto-indicator-"]');
    if (bar) return bar.id.replace('ai-auto-indicator-', '');
    // 兜底：找 .chat-stream-msgs-* 容器
    const c = document.querySelector('[id^="chat-stream-msgs-"]');
    if (c) return c.id.replace('chat-stream-msgs-', '');
    return null;
  };

  let lastSig = null;
  let lastBarText = null;
  let lastBarInDom = null;
  let pollCount = 0;

  const probe = setInterval(() => {
    pollCount++;
    const reqId = findReqId();
    if (!reqId) return;

    const cd = window._aiAutoCountdowns?.[reqId];
    const state = window._aiReplyState?.[reqId] || 'off';
    const lastRound = window._aiAutoLastRound?.[reqId] || 0;
    const sentCount = window._aiAutoSentCount?.[reqId] || 0;
    const stateRound = window._chatState?.[reqId]?.briefRound || 0;

    let countdownLeft = -1;
    if (cd) {
      countdownLeft = Math.max(0, Math.ceil((cd.deadlineMs - Date.now()) / 1000));
    }

    // 读指示条 DOM 实际状态
    const bar = document.getElementById(`ai-auto-indicator-${reqId}`);
    const barInDom = !!bar;
    const barText = bar ? bar.querySelector('.ai-auto-indicator-text')?.textContent || '' : '';
    const barVisible = bar ? window.getComputedStyle(bar).display !== 'none' : false;

    // 找 streaming bubble（看是否还有 .chat-streaming-bubble）
    const container = document.getElementById(`chat-stream-msgs-${reqId}`);
    const streamingBubble = container?.querySelector('.chat-streaming-bubble');
    const hasStreamingBubble = !!streamingBubble;

    // 检测变化才打日志（避免刷屏）
    const sig = `${state}|${countdownLeft}|${lastRound}|${sentCount}|${stateRound}|${hasStreamingBubble}`;
    const barSig = `${barInDom}|${barVisible}|${barText}`;

    if (sig !== lastSig) {
      const t = new Date().toISOString().substring(11, 19);
      console.log(
        `[diag ${t}] #${pollCount} state=${state} countdownLeft=${countdownLeft}s ` +
        `lastRound=${lastRound} sentCount=${sentCount} state.briefRound=${stateRound} ` +
        `streamingBubble=${hasStreamingBubble}`
      );
      lastSig = sig;
    }

    if (barSig !== lastBarSig) {
      const t = new Date().toISOString().substring(11, 19);
      console.log(
        `[diag ${t}] #${pollCount} BAR inDom=${barInDom} visible=${barVisible} text="${barText}"`
      );
      lastBarSig = barSig;
    }
  }, 500);

  window._diagStop = () => {
    clearInterval(probe);
    window._aiAutoDiagInstalled = false;
    console.log('[diag] 已停止');
  };
  console.log('[diag] 探针每 500ms 跑，只在状态变化时打日志。停止：_diagStop()');
})();
