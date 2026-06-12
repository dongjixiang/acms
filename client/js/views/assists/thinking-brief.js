// 思路区对话流渲染（v0.3.3 Phase 2）
// 从 requirements.js 拆出，独立管 brief 的轮询 + 渲染
// 思路区只显示对话气泡（opening/ai_understanding/followup_question）+ 轮次标记
// 决策树/其他辅助手段 → 由其他 assist 模块按 type 分发渲染
(function () {
  let _briefPollers = {}; // reqId → interval
  const _briefCache = {}; // reqId → brief（供其他 assist 模块读取）

  async function load(reqId) {
    if (_briefPollers[reqId]) {
      clearInterval(_briefPollers[reqId]);
      delete _briefPollers[reqId];
    }
    try {
      const resp = await api('GET', `/requirements/${reqId}/thinking-brief`);
      const brief = resp.thinkingBrief;
      _briefCache[reqId] = brief;
      render(reqId, brief);
      if (brief && (brief.status === 'generating' || brief.status === 'pending')) {
        _briefPollers[reqId] = setInterval(() => poll(reqId), 2500);
      }
    } catch (e) {
      console.warn('[brief] 加载失败:', e.message);
    }
  }

  async function poll(reqId) {
    try {
      const resp = await api('GET', `/requirements/${reqId}/thinking-brief`);
      const brief = resp.thinkingBrief;
      _briefCache[reqId] = brief;
      render(reqId, brief);
      if (!brief || (brief.status !== 'generating' && brief.status !== 'pending')) {
        clearInterval(_briefPollers[reqId]);
        delete _briefPollers[reqId];
      }
    } catch (e) {
      console.warn('[brief] 轮询失败:', e.message);
    }
  }

  function render(reqId, brief) {
    const container = document.getElementById(`thinking-brief-content-${reqId}`);
    if (!container) return;

    if (!brief) {
      container.innerHTML = '<div class="insight-loading">⏳ 思路简报待生成…</div>';
      return;
    }
    if (brief.status === 'pending' || brief.status === 'generating') {
      container.innerHTML = `<div class="insight-loading">${brief.chat_round && brief.chat_round > 1 ? '🤔 AI 在整理你的新回答…' : '🤔 AI 正在理解你的想法…'}</div>`;
      return;
    }
    if (brief.status === 'failed') {
      container.innerHTML = `<div class="insight-error">❌ 思路生成失败：${escHtml(brief.error || '未知错误')}</div>`;
      return;
    }

    // done: v0.3.3 对话式思路区
    // 只渲染对话气泡（不渲染决策树 / 追问清单 / 类比参考）
    // 那些是「辅助手段」→ 由 assist-dispatcher 在另一个区域按 type 渲染
    const opening = brief.opening || '';
    const understanding = brief.ai_understanding || '';
    const followup = brief.followup_question || '';
    const round = brief.chat_round || 1;

    const openingBlock = (understanding || opening) ? `
      <div class="brief-opening">
        ${round > 1 ? `<div class="brief-round-tag">第 ${round} 轮对话</div>` : ''}
        ${understanding ? `<div class="brief-understanding"><strong>我的理解：</strong>${escHtml(understanding)}</div>` : ''}
        ${opening ? `<div class="brief-opening-text">${escHtml(opening)}</div>` : ''}
      </div>
    ` : '';

    const followupBlock = followup ? `
      <div class="brief-followup">
        <span class="brief-followup-label">💬 当前最想知道的：</span>
        <span class="brief-followup-text">${escHtml(followup)}</span>
      </div>
    ` : '';

    container.innerHTML = `
      <div class="brief-block">
        ${openingBlock}
        ${followupBlock}
        <div id="assist-area-${reqId}" class="assist-area"></div>
      </div>
    `;
  }

  // 暴露给全局
  window.ACMSThinkingBrief = {
    load, render, poll,
    getBrief: (reqId) => _briefCache[reqId] || null,
    setBrief: (reqId, brief) => { _briefCache[reqId] = brief; },
  };
})();
