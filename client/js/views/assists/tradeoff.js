// 取舍清单辅助手段（v0.3.3 Phase 2）
// AI 列出关键取舍维度，用户表态倾向
(function () {
  function render(reqId, data) {
    if (!data || !data.dimensions) return '';
    const dims = data.dimensions;
    const picks = data.picks || {};
    const cards = dims.map((d, i) => {
      const pick = picks[i];
      const opts = (d.options || []).map((opt, oi) => {
        const isPicked = pick === opt;
        return `<button class="assist-tradeoff-opt ${isPicked ? 'assist-tradeoff-opt-picked' : ''}"
          onclick="ACMSAssistDispatcher.useAssist('${reqId}', 'tradeoff', { dimIdx: ${i}, pick: '${escHtml(opt).replace(/'/g, "\\'")}' })">
          ${isPicked ? '✅ ' : ''}${escHtml(opt)}
        </button>`;
      }).join('');
      return `
      <div class="assist-card assist-card-narrow">
        <div class="assist-card-header">
          <span class="assist-card-letter">⚖️</span>
          <strong>${escHtml(d.axis || '')}</strong>
        </div>
        ${d.context ? `<div class="assist-card-row"><span class="assist-label">含义：</span>${escHtml(d.context)}</div>` : ''}
        <div class="assist-tradeoff-opts">${opts}</div>
        ${d.hint ? `<div class="assist-card-row" style="font-style:italic;color:var(--text3);margin-top:6px">💬 ${escHtml(d.hint)}</div>` : ''}
      </div>
      `;
    }).join('');

    return `
      <div class="assist-section-title">⚖️ 取舍清单 · ${dims.length} 个关键维度</div>
      <div class="assist-intro">这个需求里你必须做出选择的维度。表态你的倾向，让需求更聚焦。</div>
      <div class="assist-grid assist-grid-cols-1">${cards}</div>
    `;
  }

  window.ACMSAssists.register('tradeoff', { name: '取舍清单', render });
})();
