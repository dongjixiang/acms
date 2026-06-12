// 需求体检辅助手段（v0.3.3 Phase 2）
// AI 扫描描述里的模糊表达 / 缺的关键维度
(function () {
  const categoryLabels = {
    vague: { icon: '🌀', name: '用了空泛词', color: 'var(--red)' },
    missing: { icon: '🕳️', name: '缺关键维度', color: 'var(--accent3)' },
    conflict: { icon: '⚡', name: '描述冲突', color: 'var(--red)' },
    scope: { icon: '📐', name: '范围不清', color: 'var(--accent3)' },
  };

  function render(reqId, data) {
    if (!data || !data.issues) return '';
    const issues = data.issues;
    if (issues.length === 0) {
      return `
        <div class="assist-section-title">🩺 需求体检</div>
        <div class="assist-intro assist-intro-good">✅ 你描述得挺清晰，没发现明显问题。</div>
      `;
    }
    const cards = issues.map((it, i) => {
      const cat = categoryLabels[it.category] || categoryLabels.vague;
      return `
      <div class="assist-card assist-card-narrow">
        <div class="assist-card-header">
          <span class="assist-card-cat" style="background:${cat.color}20;color:${cat.color}">${cat.icon} ${cat.name}</span>
        </div>
        ${it.quote ? `<div class="assist-card-quote">"${escHtml(it.quote)}"</div>` : ''}
        <div class="assist-card-row"><span class="assist-label">问题：</span>${escHtml(it.issue || '')}</div>
        <div class="assist-card-row"><span class="assist-label" style="color:var(--green)">怎么改：</span>${escHtml(it.suggestion || '')}</div>
      </div>
      `;
    }).join('');

    return `
      <div class="assist-section-title">🩺 需求体检 · ${issues.length} 处可以更清晰</div>
      <div class="assist-intro">这些都是你描述里具体不清的地方。每条都引用了原文，方便你定位。</div>
      <div class="assist-grid assist-grid-cols-1">${cards}</div>
      <div class="assist-actions">
        <button class="btn-small" onclick="ACMSAssistDispatcher.useAssist('${reqId}', 'diagnosis', {})">
          ✅ 我看到了，继续聊
        </button>
      </div>
    `;
  }

  window.ACMSAssists.register('diagnosis', { name: '需求体检', render });
})();
