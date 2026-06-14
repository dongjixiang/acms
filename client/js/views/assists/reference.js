// 借鉴卡片辅助手段（v0.3.6）
// 统一表格渲染，支持无限递归深入 + 选择
(function () {
  function render(reqId, data) {
    if (!data) return '';
    if (data.mode === 'deepdive' || data.mode === 'decompose') {
      if (Array.isArray(data.aspects) && data.aspects.length > 0) {
        return renderTable(reqId, data);
      }
    }
    if (Array.isArray(data.references) && data.references.length > 0) {
      return renderRecommend(reqId, data);
    }
    return '';
  }

  // ===== 统一表格渲染（level1 decompose + deepdive 共用） =====
  function renderTable(reqId, data) {
    const aspects = data.aspects || [];
    const picked = data.picked || [];
    const product = escHtml(data.target_product || '参考产品');
    const isDeepDive = data.mode === 'deepdive';
    // 当前级别路径（deepdive 才有 path）
    const currentPath = isDeepDive ? (data.deepdive_path || []).concat([data.parent_aspect || '']) : [];
    const title = isDeepDive
      ? currentPath.join(' > ')
      : product;

    // 按 category 分组
    const CAT_ORDER = ['功能', '流程', '特色', '架构', '理念', '细节'];
    const groups = {};
    CAT_ORDER.forEach(c => groups[c] = []);
    aspects.forEach(a => { const c = a.category || '其他'; if (!groups[c]) groups[c] = []; groups[c].push(a); });
    const sortedGroups = Object.keys(groups).filter(c => groups[c].length > 0)
      .sort((a, b) => {
        const ia = CAT_ORDER.indexOf(a); const ib = CAT_ORDER.indexOf(b);
        return (ia >= 0 ? ia : 99) - (ib >= 0 ? ib : 99);
      });

    const categoryBg = {
      '功能': 'rgba(78,205,196,0.15)', '流程': 'rgba(100,149,237,0.15)',
      '特色': 'rgba(255,165,0,0.15)', '架构': 'rgba(139,92,246,0.15)',
      '理念': 'rgba(255,107,107,0.15)', '细节': 'rgba(200,200,200,0.15)',
    };

    const tableHtml = sortedGroups.map(cat => {
      const bg = categoryBg[cat] || 'var(--bg3)';
      const items = groups[cat].map(a => {
        const idx = aspects.indexOf(a);
        const isPicked = picked.includes(idx);
        const safeName = escHtml(a.name);
        const safeDesc = escHtml(a.desc || '');
        // 用于 [深入] 的路径
        const nextPath = isDeepDive
          ? JSON.stringify(currentPath.concat([a.name])).replace(/'/g, "\\'")
          : JSON.stringify([a.name]).replace(/'/g, "\\'");
        return `
        <tr class="ref-aspect-row">
          <td class="ref-aspect-name">${safeName}</td>
          <td class="ref-aspect-desc">${safeDesc}${a.why_helpful ? `<br><span style="font-size:11px;color:var(--text3);font-style:italic">💡 ${escHtml(a.why_helpful)}</span>` : ''}</td>
          <td class="ref-aspect-action">
            <button class="btn-small" onclick="referenceDeepDive('${reqId}','${escHtml(product)}','${safeName}','${safeDesc}', '${nextPath}')" style="font-size:11px">🔍</button>
          </td>
          <td class="ref-aspect-pick">
            <button class="btn-small ${isPicked ? 'btn-primary' : ''}" onclick="referencePick('${reqId}', ${idx})" style="font-size:11px">
              ${isPicked ? '✅' : '☐'}
            </button>
          </td>
        </tr>`;
      }).join('');
      return `
        <div class="ref-cat-section">
          <div class="ref-cat-header" style="background:${bg};padding:4px 10px;font-size:13px;font-weight:600;border-radius:4px 4px 0 0">${cat}（${groups[cat].length}）</div>
          <table class="ref-aspect-table">
            <colgroup><col style="width:28%"><col><col style="width:40px"><col style="width:40px"></colgroup>
            <tbody>${items}</tbody>
          </table>
        </div>
        <div style="height:5px"></div>`;
    }).join('');

    return `
      <div class="assist-section-title">🏛 ${title} · ${aspects.length} 项</div>
      <div class="assist-intro">${isDeepDive ? '继续深入或选择感兴趣的方向。' : '按类型分组，点击🔍深入，点击☐选择。'}</div>
      ${tableHtml}
    `;
  }

  // ===== 推荐模式（多个产品） =====
  function renderRecommend(reqId, data) {
    const refs = data.references || [];
    const cards = refs.map((r, i) => {
      const inspirs = (r.inspirations || []).map(insp => `<li>${escHtml(insp)}</li>`).join('');
      return `
      <div class="assist-card assist-card-narrow">
        <div class="assist-card-header">
          <span class="assist-card-letter">${String.fromCharCode(65+i)}</span>
          <strong>${escHtml(r.name || '')}</strong>
          <span style="font-size:11px;color:var(--text3);margin-left:auto">${escHtml(r.category||'')}</span>
        </div>
        <div class="assist-card-row" style="font-style:italic;color:var(--text2)">💡 ${escHtml(r.why || '')}</div>
        ${inspirs ? `<ul style="margin:4px 0 6px 16px;padding:0;font-size:12px">${inspirs}</ul>` : ''}
      </div>`;
    }).join('');
    return `
      <div class="assist-section-title">🏛 借鉴卡片 · ${refs.length} 个参考产品</div>
      <div class="assist-grid">${cards}</div>
    `;
  }

  window.ACMSAssists.register('reference', { name: '借鉴卡片', render });
})();

/** 全局函数：点 🔍 深入（递归） */
function referenceDeepDive(reqId, product, aspectName, aspectDesc, pathJson) {
  let path = [];
  try { path = JSON.parse(pathJson || '[]'); } catch {}
  toast(`🔍 深入「${aspectName}」…`, 'info', 1500);
  chatAssist(reqId, 'reference', { deepDiveOf: { product, aspectName, aspectDesc, path } });
}

/** 全局函数：点 ☐/✅ 选择（立即切换 DOM + 调 API） */
function referencePick(reqId, idx) {
  // 即时切换 DOM，不等轮询
  const layer = document.querySelector(`#chat-stream-msgs-${reqId} .chat-assist-layer[data-assist-method="reference"]`);
  if (layer) {
    const rows = layer.querySelectorAll('.ref-aspect-row');
    if (rows[idx]) {
      const btn = rows[idx].querySelector('.ref-aspect-pick .btn-small');
      if (btn) {
        const isNow = btn.textContent.trim() === '✅';
        btn.textContent = isNow ? '☐' : '✅';
        btn.className = isNow ? 'btn-small' : 'btn-small btn-primary';
      }
    }
  }
  ACMSAssistDispatcher.useAssist(reqId, 'reference', { idx });
}
