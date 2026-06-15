// 假设清单辅助手段（v0.4）
// Method: assumptions | Name: 假设清单
(function () {
  const CATEGORY_LABELS = {
    user: '👤 用户行为',
    tech: '💻 技术环境',
    business: '🏢 业务逻辑',
    external: '🌐 外部因素',
    scale: '📈 规模',
  };

  function render(reqId, data) {
    if (!data || !data.items) return '';
    if (data.status === 'generating' || data.status === 'pending') return '<div class="insight-loading">⏳ 正在提取假设…</div>';
    if (data.status === 'failed') return `<div class="insight-error">❌ 生成失败：${escHtml(data.error || '')}</div>`;
    const items = data.items || [];
    if (items.length === 0) return '<div class="assist-intro">✅ 未发现明显的隐藏假设</div>';

    const cards = items.map((a, i) => {
      const catLabel = CATEGORY_LABELS[a.category] || escHtml(a.category);
      const confIcon = a.confidence === 'high' ? '🟢' : a.confidence === 'medium' ? '🟡' : '🔴';
      const confText = a.confidence === 'high' ? '高置信' : a.confidence === 'medium' ? '中置信' : '低置信';
      return `
      <div class="assumption-card" data-idx="${i}">
        <div class="assumption-category">${catLabel}</div>
        <div class="assumption-statement">📌 ${escHtml(a.statement || '')}</div>
        <div class="assumption-risk">💥 若错了：${escHtml(a.risk_if_wrong || '')}</div>
        <div class="assumption-meta">
          <span class="assumption-confidence ${'conf-' + (a.confidence || 'low')}">${confIcon} ${confText}</span>
          ${a.evidence ? `<span class="assumption-evidence">📝 ${escHtml(a.evidence)}</span>` : ''}
        </div>
      </div>`;
    }).join('');

    const summaryHtml = data.summary
      ? `<div class="assumption-summary">💡 ${escHtml(data.summary)}</div>`
      : '';

    return `
      <div class="assumption-board">
        <div class="assist-section-title">📌 假设清单 · ${items.length} 项隐式假设</div>
        <div class="assist-intro">你的描述中隐含的这些前提——如果它们不成立，方案可能需要重新考虑。</div>
        <div class="assist-grid assist-grid-cols-1">${cards}</div>
        ${summaryHtml}
      </div>`;
  }

  window.ACMSAssists.register('assumptions', { name: '假设清单', render });
})();
