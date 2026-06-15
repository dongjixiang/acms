// 风险预警辅助手段（v1.0）
// Method: risks | Name: 风险预警
// 按 severity/likelihood/impact 标注风险项，给出缓解建议
(function () {
  const CATEGORY_MAP = {
    tech:        { label: '💻 技术',       color: '#3498db' },
    dependency:  { label: '🔗 依赖',       color: '#9b59b6' },
    timeline:    { label: '⏱ 时间',       color: '#e67e22' },
    compliance:  { label: '⚖️ 合规',       color: '#2ecc71' },
    resource:    { label: '🧑‍💻 资源',     color: '#1abc9c' },
  };

  const SEVERITY_MAP = {
    high:   { emoji: '🛑', label: '严重', color: '#e74c3c', bg: '#fdecea' },
    medium: { emoji: '⚠️', label: '中等', color: '#f39c12', bg: '#fef5e7' },
    low:    { emoji: '📌', label: '轻微', color: '#95a5a6', bg: '#f4f6f7' },
  };

  const LIKELIHOOD_MAP = {
    high:   { label: '可能性高', color: '#e74c3c' },
    medium: { label: '可能',     color: '#f39c12' },
    low:    { label: '可能性低', color: '#2ecc71' },
  };

  const IMPACT_MAP = {
    high:   { label: '影响大', color: '#e74c3c' },
    medium: { label: '影响中', color: '#f39c12' },
    low:    { label: '影响小', color: '#2ecc71' },
  };

  function render(reqId, data) {
    if (!data || !data.items) return '';
    if (data.status === 'generating' || data.status === 'pending') return '<div class="insight-loading">⏳ 正在分析风险…</div>';
    if (data.status === 'failed') return `<div class="insight-error">❌ 分析失败：${escHtml(data.error || '')}</div>`;
    const items = data.items || [];
    if (items.length === 0) return '<div class="assist-intro assist-intro-good">✅ 未发现明显风险项。</div>';

    const cards = items.map((it, i) => {
      const cat = CATEGORY_MAP[it.category] || { label: escHtml(it.category || '未知'), color: '#95a5a6' };
      const sev = SEVERITY_MAP[it.severity] || SEVERITY_MAP.low;
      const like = LIKELIHOOD_MAP[it.likelihood] || LIKELIHOOD_MAP.low;
      const imp = IMPACT_MAP[it.impact] || IMPACT_MAP.low;

      return `
      <div class="risk-card assist-card assist-card-narrow">
        <div class="assist-card-header" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="risk-severity" style="background:${sev.bg};color:${sev.color};font-weight:600;font-size:11px;padding:1px 8px;border-radius:3px">${sev.emoji} ${sev.label}</span>
          <span class="risk-category" style="background:${cat.color}18;color:${cat.color};font-size:11px;padding:1px 6px;border-radius:3px">${cat.label}</span>
        </div>
        <div class="risk-title" style="font-weight:600;font-size:13px;margin:4px 0 2px">${escHtml(it.title || '')}</div>
        <div class="risk-desc assist-card-row" style="font-size:12px;color:var(--text2)">${escHtml(it.description || '')}</div>
        <div class="assist-card-row" style="display:flex;gap:10px;font-size:11px;color:var(--text3);margin:4px 0">
          <span style="color:${like.color}">◉ ${like.label}</span>
          <span style="color:${imp.color}">◆ ${imp.label}</span>
        </div>
        ${it.mitigation ? `<div class="risk-mitigation assist-card-quote" style="font-size:11px">💡 ${escHtml(it.mitigation)}</div>` : ''}
      </div>`;
    }).join('');

    const summaryBlock = data.summary
      ? `<div class="risk-summary" style="margin-top:10px;padding:6px 10px;background:rgba(231,76,60,0.06);border-radius:4px;font-size:12px;color:var(--text2)">📋 ${escHtml(data.summary)}</div>`
      : '';

    return `
      <div class="risk-radar">
        <div class="assist-section-title">⚠️ 风险预警 · ${items.length} 项风险</div>
        <div class="assist-intro">以下是根据项目情况识别出的潜在风险，按严重程度排列。</div>
        <div class="assist-grid assist-grid-cols-1" style="display:flex;flex-direction:column;gap:6px">${cards}</div>
        ${summaryBlock}
      </div>`;
  }

  window.ACMSAssists.register('risks', { name: '风险预警', render });
})();
