// 痛点溯源辅助手段（v0.7）
// AI 扫描描述中的隐患点，按效率/体验/成本/风险/质量分类
(function () {
  const CATEGORY_MAP = {
    efficiency:  { emoji: '🔴', name: '效率',   color: '#e74c3c' },
    experience:  { emoji: '🟠', name: '体验',   color: '#f39c12' },
    cost:        { emoji: '🟡', name: '成本',   color: '#d4a017' },
    risk:        { emoji: '🟣', name: '风险',   color: '#9b59b6' },
    quality:     { emoji: '🔵', name: '质量',   color: '#3498db' },
  };

  const SEVERITY_MAP = {
    high:   { label: '严重', color: '#e74c3c', weight: 'bold' },
    medium: { label: '中等', color: '#f39c12', weight: 'normal' },
    low:    { label: '轻微', color: '#95a5a6', weight: 'normal' },
  };

  function render(reqId, data) {
    if (!data || !data.items) return '';
    const items = data.items;
    if (items.length === 0) {
      return `
        <div class="assist-section-title">🔥 痛点溯源</div>
        <div class="assist-intro assist-intro-good">✅ 描述中未发现明显隐患点。</div>
      `;
    }

    const cards = items.map((it, i) => {
      const cat = CATEGORY_MAP[it.category] || CATEGORY_MAP.risk;
      const sev = SEVERITY_MAP[it.severity] || SEVERITY_MAP.low;
      return `
      <div class="pain-card assist-card assist-card-narrow">
        <div class="assist-card-header" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="pain-severity" style="font-weight:${sev.weight};color:${sev.color};font-size:11px;padding:1px 6px;border:1px solid ${sev.color};border-radius:3px">${sev.label}</span>
          <span class="pain-category" style="background:${cat.color}18;color:${cat.color};font-size:11px;padding:1px 6px;border-radius:3px">${cat.emoji} ${cat.name}</span>
        </div>
        <div class="pain-title" style="font-weight:600;font-size:13px;margin:4px 0 2px">${escHtml(it.title || '')}</div>
        <div class="pain-desc assist-card-row" style="font-size:12px;color:var(--text2)">${escHtml(it.description || '')}</div>
        <div class="pain-impact assist-card-row" style="font-size:11px;color:var(--text3)"><span class="assist-label">后果：</span>${escHtml(it.impact || '')}</div>
        ${it.evidence ? `<div class="pain-evidence assist-card-quote" style="font-size:11px">"${escHtml(it.evidence)}"</div>` : ''}
      </div>
      `;
    }).join('');

    const summaryBlock = data.summary
      ? `<div class="pain-summary" style="margin-top:10px;padding:6px 10px;background:rgba(231,76,60,0.06);border-radius:4px;font-size:12px;color:var(--text2)">📋 ${escHtml(data.summary)}</div>`
      : '';

    return `
      <div class="pain-radar">
        <div class="assist-section-title">🔥 痛点溯源 · ${items.length} 处隐患</div>
        <div class="assist-intro">以下是你描述里暴露出的潜在风险/问题点，按严重程度标注。</div>
        <div class="assist-grid assist-grid-cols-1" style="display:flex;flex-direction:column;gap:6px">${cards}</div>
        ${summaryBlock}
      </div>
    `;
  }

  window.ACMSAssists.register('pains', { name: '痛点溯源', render });
})();
