// 干系人地图辅助手段（v0.4）
// Method: stakeholders | Name: 干系人地图
(function () {
  const TYPE_LABELS = {
    decision_maker: '🏛️ 决策者',
    end_user: '👤 实际用户',
    operator: '🔧 运营维护',
    dependency: '🔗 上下游依赖',
    observer: '👀 关注方',
  };

  function render(reqId, data) {
    if (!data || !data.items) return '';
    if (data.status === 'generating' || data.status === 'pending') return '<div class="insight-loading">⏳ 正在识别干系人…</div>';
    if (data.status === 'failed') return `<div class="insight-error">❌ 生成失败：${escHtml(data.error || '')}</div>`;
    const items = data.items || [];
    if (items.length === 0) return '<div class="assist-intro">✅ 未发现明确干系人关联</div>';

    const cards = items.map((s, i) => {
      const typeLabel = TYPE_LABELS[s.type] || escHtml(s.type);
      const priorityCls = 'stake-' + (s.priority || 'low');
      let influenceIcon = '○';
      if (s.influence === 'high') influenceIcon = '🔥';
      else if (s.influence === 'medium') influenceIcon = '⭐';
      return `
      <div class="stakeholder-card" data-idx="${i}">
        <div class="stakeholder-type ${priorityCls}">${typeLabel}</div>
        <div class="stakeholder-role">${escHtml(s.role || '')}</div>
        <div class="stakeholder-concern">📌 ${escHtml(s.concern || '')}</div>
        ${s.potential_resistance ? `<div class="stakeholder-resistance">⚠️ ${escHtml(s.potential_resistance)}</div>` : ''}
        <div class="stakeholder-meta">
          <span class="stake-priority ${priorityCls}">${s.priority === 'high' ? '高优先' : s.priority === 'medium' ? '中优先' : '低优先'}</span>
          <span>影响力 ${influenceIcon}</span>
        </div>
      </div>`;
    }).join('');

    const summaryHtml = data.summary
      ? `<div class="stakeholder-summary">📊 ${escHtml(data.summary)}</div>`
      : '';

    return `
      <div class="stakeholder-radar">
        <div class="assist-section-title">👥 干系人地图 · ${items.length} 个相关角色</div>
        <div class="assist-intro">识别所有相关人物，理解他们的关注点和可能的阻力。</div>
        <div class="assist-grid">${cards}</div>
        ${summaryHtml}
      </div>`;
  }

  window.ACMSAssists.register('stakeholders', { name: '干系人地图', render });
})();
