// 竞品分析辅助手段（v0.3.6）
// AI 列出竞品 + 对比分析 + 行动建议
(function () {
  function render(reqId, data) {
    if (!data || !data.competitors) return '';
    const competitors = data.competitors || [];
    const table = data.comparison_table || [];
    const suggestions = data.suggestions || null;
    const positioning = data.market_positioning || '';
    const risks = data.risk_assumptions || [];

    // 竞品卡片
    const compCards = competitors.map((c, i) => {
      const strengths = (c.strengths || []).map(s => `<li>${escHtml(s)}</li>`).join('');
      const weaknesses = (c.weaknesses || []).map(w => `<li style="color:var(--red)">${escHtml(w)}</li>`).join('');
      const features = (c.key_features || []).map(f => `<span class="assist-arch-element">${escHtml(f)}</span>`).join('');
      return `
      <div class="assist-card">
        <div class="assist-card-header">
          <span class="assist-card-letter">${String.fromCharCode(65+i)}</span>
          <a href="#" onclick="event.preventDefault();chatAssist('${reqId}','reference',{productName:'${escHtml(c.name).replace(/'/g, "\\'")}'})" class="comp-ref-link" title="查看该产品的深度借鉴简报">${escHtml(c.name)}</a>
          <span style="font-size:11px;color:var(--text3);margin-left:auto">${escHtml(c.category||'')}</span>
        </div>
        <div class="assist-card-row">${escHtml(c.description||'')}</div>
        <div class="assist-card-row"><span class="assist-label">用户群：</span>${escHtml(c.target_users||'')}</div>
        <div class="assist-card-row"><span class="assist-label">定价：</span>${escHtml(c.pricing_model||'')}</div>
        <div class="assist-card-row"><span class="assist-label">优势：</span></div>
        <ul style="margin:2px 0 6px;padding-left:16px;font-size:12px;color:var(--green)">${strengths}</ul>
        <div class="assist-card-row"><span class="assist-label">劣势：</span></div>
        <ul style="margin:2px 0 6px;padding-left:16px;font-size:12px">${weaknesses}</ul>
        ${features ? `<div class="assist-card-row"><span class="assist-label">特色：</span><div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px">${features}</div></div>` : ''}
      </div>`;
    }).join('');

    // 对比表
    const tableRows = table.map(t => `
      <tr>
        <td><strong>${escHtml(t.dimension)}</strong></td>
        <td>${escHtml(t.our_status||'')}</td>
        <td>${escHtml(t.gap||'')}</td>
        <td><span class="comp-priority-${(t.priority||'中')}">${escHtml(t.priority||'中')}</span></td>
      </tr>`).join('');

    const tableHtml = table.length > 0 ? `
      <div class="assist-section-title" style="margin-top:12px">📊 对比矩阵</div>
      <table class="comp-table">
        <tr><th>维度</th><th>我们</th><th>差距</th><th>优先级</th></tr>
        ${tableRows}
      </table>` : '';

    // 行动建议
    const suggestHtml = suggestions ? `
      <div class="assist-section-title" style="margin-top:12px">🎯 行动建议</div>
      ${suggestions.stop_doing?.length ? `<div style="margin:4px 0"><span style="color:var(--red);font-weight:600">🔴 停止做</span><ul style="margin:2px 0 6px 16px;font-size:12px">${suggestions.stop_doing.map(s => `<li>${escHtml(s)}</li>`).join('')}</ul></div>` : ''}
      ${suggestions.start_doing?.length ? `<div style="margin:4px 0"><span style="color:var(--green);font-weight:600">🟢 开始做</span><ul style="margin:2px 0 6px 16px;font-size:12px">${suggestions.start_doing.map(s => `<li>${escHtml(s)}</li>`).join('')}</ul></div>` : ''}
      ${suggestions.keep_doing?.length ? `<div style="margin:4px 0"><span style="color:var(--accent);font-weight:600">🔵 保持做</span><ul style="margin:2px 0 6px 16px;font-size:12px">${suggestions.keep_doing.map(s => `<li>${escHtml(s)}</li>`).join('')}</ul></div>` : ''}
    ` : '';

    // 定位建议
    const posHtml = positioning ? `<div class="assist-card-row" style="margin-top:8px;font-style:italic"><span class="assist-label">📍 定位：</span>${escHtml(positioning)}</div>` : '';

    // 风险/假设
    const riskHtml = risks.length > 0 ? `
      <div style="margin-top:8px;padding:6px 8px;background:rgba(255,165,0,0.08);border-radius:4px;font-size:11px;color:var(--text3)">
        ⚠️ 局限性：${risks.map(r => escHtml(r)).join('；')}
      </div>` : '';

    return `
      <div class="assist-section-title">🏢 竞品分析 · ${competitors.length} 个竞品</div>
      <div class="assist-intro">外部对标，帮你了解市场格局和竞争定位。</div>
      <div class="assist-grid">${compCards}</div>
      ${tableHtml}
      ${suggestHtml}
      ${posHtml}
      ${riskHtml}
    `;
  }

  window.ACMSAssists.register('competitive', { name: '竞品分析', render });
})();
