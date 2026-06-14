// 场景剧本辅助手段（v0.3.3 Phase 2）
// AI 给出 3 个典型用户场景，用户挑一个"最像我"
(function () {
  function render(reqId, data) {
    if (!data || !data.scenarios) return '';
    const scenarios = data.scenarios;
    const cards = scenarios.map((s, i) => {
      const isPicked = data.picked === i;
      return `
      <div class="assist-card ${isPicked ? 'assist-card-picked' : ''}" data-scenario-idx="${i}">
        <div class="assist-card-header">
          <span class="assist-card-letter">${String.fromCharCode(65+i)}</span>
          <strong>${escHtml(s.title || '')}</strong>
          ${isPicked ? '<span class="assist-picked-badge">✅ 你选的</span>' : ''}
        </div>
        <div class="assist-card-meta">👤 ${escHtml(s.persona || '')}</div>
        <div class="assist-card-row"><span class="assist-label">背景：</span>${escHtml(s.context || '')}</div>
        <div class="assist-card-row"><span class="assist-label" style="color:var(--red)">痛点：</span>${escHtml(s.pain || '')}</div>
        <div class="assist-card-row"><span class="assist-label" style="color:var(--green)">目标：</span>${escHtml(s.goal || '')}</div>
        ${s.quote ? `<div class="assist-card-quote">"${escHtml(s.quote)}"</div>` : ''}
        <button class="btn-small btn-primary assist-pick-btn" onclick="ACMSAssistDispatcher.useAssist('${reqId}', 'scenarios', { idx: ${i} })">
          ${isPicked ? '✅ 已选' : '👆 我最像这个'}
        </button>
      </div>
      `;
    }).join('');

    return `
      <div class="assist-section-title">🎬 场景剧本 · 3 个典型用户场景</div>
      <div class="assist-intro">挑一个和你最像的场景——我们就按这个场景往下走。</div>
      <div class="assist-grid">${cards}</div>
      <!-- v0.3.6：「都不符合，再换一批」按钮 -->
      <div class="assist-regen-row">
        <button class="btn-small btn-secondary" onclick="ACMSAssistDispatcher.regenerateBatch('${reqId}', 'scenarios')" title="让 AI 再生成 3 个明显不同的场景">🔄 都不符合，再换一批</button>
      </div>
    `;
  }

  window.ACMSAssists.register('scenarios', { name: '场景剧本', render });
})();
