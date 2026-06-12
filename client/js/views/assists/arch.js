// 信息架构图辅助手段（v0.3.3 Phase 2）
// AI 列出 5-8 个核心页面/模块，用户圈出"我要这些"
(function () {
  function render(reqId, data) {
    if (!data || !data.modules) return '';
    const modules = data.modules;
    const pickedSet = new Set(data.picked || []);
    const cards = modules.map((m, i) => {
      const isPicked = pickedSet.has(i);
      const elements = (m.key_elements || []).map(e => `<span class="assist-arch-element">${escHtml(e)}</span>`).join('');
      return `
      <div class="assist-card assist-card-narrow ${isPicked ? 'assist-card-picked' : ''}" data-module-idx="${i}">
        <div class="assist-card-header">
          <span class="assist-card-letter">${String.fromCharCode(65+i)}</span>
          <strong>${escHtml(m.name || '')}</strong>
          ${isPicked ? '<span class="assist-picked-badge">✅ 要</span>' : ''}
        </div>
        <div class="assist-card-row"><span class="assist-label">用途：</span>${escHtml(m.purpose || '')}</div>
        <div class="assist-card-row"><span class="assist-label">入口：</span>${escHtml(m.entry || '')}</div>
        ${elements ? `<div class="assist-arch-elements">${elements}</div>` : ''}
        <button class="btn-small assist-pick-btn ${isPicked ? 'btn-primary' : ''}"
          onclick="ACMSAssistDispatcher.useAssist('${reqId}', 'arch', { idx: ${i} })">
          ${isPicked ? '✅ 已圈' : '👆 我要这个'}
        </button>
      </div>
      `;
    }).join('');

    return `
      <div class="assist-section-title">🗂 信息架构 · ${modules.length} 个核心模块</div>
      <div class="assist-intro">这是系统的主要"骨架"。圈出你想要的，我们会按这些模块展开。</div>
      <div class="assist-grid">${cards}</div>
    `;
  }

  window.ACMSAssists.register('arch', { name: '信息架构图', render });
})();
