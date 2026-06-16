// 五层痛点挖掘术（v0.8）
// AI 按 L1→L5 逐层分析需求描述，输出结构化痛点 + 时间轴 + 情绪分析
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

  const LAYER_LABELS = {
    1: { badge: 'L1', name: '表层扫描', icon: '📢' },
    2: { badge: 'L2', name: '行为断层', icon: '🔍' },
    3: { badge: 'L3', name: '根因穿透', icon: '🔗' },
    4: { badge: 'L4', name: '动态演变', icon: '🔄' },
    5: { badge: 'L5', name: '情感痛点', icon: '💭' },
  };

  const EMOTION_COLORS = {
    '焦虑': '#e74c3c',
    '无助': '#9b59b6',
    '丢脸': '#e67e22',
    '内疚': '#f39c12',
    '失控': '#c0392b',
  };

  function render(reqId, data) {
    if (!data || !data.items) return '';
    if (data.status === 'generating' || data.status === 'pending') return '<div class="insight-loading">⏳ 正在五层挖掘痛点…</div>';
    if (data.status === 'failed') return '<div class="insight-error">❌ 分析失败：' + escHtml(data.error || '') + '</div>';
    const items = data.items;
    if (items.length === 0) {
      return `
        <div class="assist-section-title">🔥 痛点溯源（五层挖掘）</div>
        <div class="assist-intro assist-intro-good">✅ 描述中未发现明显隐患点。</div>
      `;
    }

    // 按 layer 分组（未标记 layer 的归为 L1）
    const grouped = {};
    items.forEach(it => {
      const layer = it.layer || 1;
      if (!grouped[layer]) grouped[layer] = [];
      grouped[layer].push(it);
    });

    const cards = items.map((it, i) => {
      const cat = CATEGORY_MAP[it.category] || CATEGORY_MAP.risk;
      const sev = SEVERITY_MAP[it.severity] || SEVERITY_MAP.low;
      const lyr = LAYER_LABELS[it.layer] || LAYER_LABELS[1];
      const layerBadge = `<span class="pain-layer-badge" style="display:inline-block;font-size:10px;font-weight:700;padding:0 5px;border-radius:3px;background:#555;color:#fff;margin-right:4px">${lyr.icon} ${lyr.badge}</span>`;
      const rootCauseHtml = it.layer === 3 && it.root_cause
        ? `<div class="pain-rootcause" style="margin-top:4px;padding:4px 8px;background:rgba(155,89,182,0.08);border-left:2px solid #9b59b6;font-size:11px;color:var(--text2)"><strong>根因：</strong>${escHtml(it.root_cause)}</div>`
        : '';
      return `
      <div class="pain-card assist-card assist-card-narrow">
        <div class="assist-card-header" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${layerBadge}
          <span class="pain-severity" style="font-weight:${sev.weight};color:${sev.color};font-size:11px;padding:1px 6px;border:1px solid ${sev.color};border-radius:3px">${sev.label}</span>
          <span class="pain-category" style="background:${cat.color}18;color:${cat.color};font-size:11px;padding:1px 6px;border-radius:3px">${cat.emoji} ${cat.name}</span>
        </div>
        <div class="pain-title" style="font-weight:600;font-size:13px;margin:4px 0 2px">${escHtml(it.title || '')}</div>
        <div class="pain-desc assist-card-row" style="font-size:12px;color:var(--text2)">${escHtml(it.description || '')}</div>
        <div class="pain-impact assist-card-row" style="font-size:11px;color:var(--text3)"><span class="assist-label">后果：</span>${escHtml(it.impact || '')}</div>
        ${it.evidence ? `<div class="pain-evidence assist-card-quote" style="font-size:11px">"${escHtml(it.evidence)}"</div>` : ''}
        ${rootCauseHtml}
      </div>
      `;
    }).join('');

    // L4 时间轴
    const evolutionHtml = data.evolution
      ? `<div class="pain-evolution" style="margin-top:12px;padding:8px 12px;background:rgba(52,152,219,0.06);border:1px dashed rgba(52,152,219,0.3);border-radius:6px">
          <div style="font-weight:600;font-size:12px;margin-bottom:4px">🔄 痛点演化（L4）</div>
          <div style="font-size:12px;color:var(--text2)">${escHtml(data.evolution)}</div>
        </div>`
      : '';

    // L5 情绪分析
    const emotionalPains = data.emotional_pains || [];
    const emotionHtml = emotionalPains.length > 0
      ? `<div class="pain-emotions" style="margin-top:10px">
          <div style="font-weight:600;font-size:12px;margin-bottom:6px">💭 情感痛点（L5）</div>
          ${emotionalPains.map(ep => {
            const ec = EMOTION_COLORS[ep.emotion] || '#95a5a6';
            return `<div class="pain-emotion-item" style="display:flex;align-items:flex-start;gap:6px;padding:6px 10px;margin-bottom:4px;background:rgba(155,89,182,0.04);border-radius:4px;font-size:12px">
              <span style="color:${ec};font-weight:700;white-space:nowrap">${escHtml(ep.emotion)}</span>
              <span style="color:var(--text2)">${escHtml(ep.trigger || '')}</span>
              ${ep.quote ? `<span style="color:var(--text3);font-style:italic">— "${escHtml(ep.quote)}"</span>` : ''}
            </div>`;
          }).join('')}
        </div>`
      : '';

    const summaryBlock = data.summary
      ? `<div class="pain-summary" style="margin-top:10px;padding:6px 10px;background:rgba(231,76,60,0.06);border-radius:4px;font-size:12px;color:var(--text2)">📋 ${escHtml(data.summary)}</div>`
      : '';

    return `
      <div class="pain-radar">
        <div class="assist-section-title">🔥 五层痛点挖掘 · ${items.length} 处发现</div>
        <div class="assist-intro">从 L1（表层）到 L5（情感），五层递进挖掘需求中的隐藏痛点。</div>
        <div class="assist-grid assist-grid-cols-1" style="display:flex;flex-direction:column;gap:6px">${cards}</div>
        ${evolutionHtml}
        ${emotionHtml}
        ${summaryBlock}
      </div>
    `;
  }

  window.ACMSAssists.register('pains', { name: '五层痛点挖掘', render });
})();
