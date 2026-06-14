// 借鉴卡片 v2 — 产品简报模式（2026-06-14）
// 渲染：产品全景 + 可视化图表 + 核心理念 + "应用到需求"按钮
// 替代旧版表格选择器模式
(function () {
  function render(reqId, data) {
    if (!data || data.mode !== 'brief' || data.status !== 'done') return '';
    const product = escHtml(data.target_product || '');
    const profile = data.profile || {};
    const diagrams = data.diagrams || [];
    const insights = data.insights || [];

    // ── 产品全景 ──
    const profileHtml = Object.keys(profile).length > 0 ? `
      <div class="brief-top">
        <h2><span>🏛</span> ${product} · 产品简报</h2>
        <div class="profile-grid">
          ${['定位','核心功能','工作流程','典型用户'].filter(k => profile[k]).map(k => `
            <div class="profile-row">
              <span class="key">${k}</span>
              <span class="val">${escHtml(profile[k])}</span>
            </div>
          `).join('')}
        </div>
      </div>` : '';

    // ── 图表 ──
    const diagramHtml = diagrams.map(d => renderDiagram(d)).join('');

    // ── 核心理念 ──
    const insightHtml = insights.map((ins, i) => {
      const colors = ['n1','n2','n3'];
      return `
      <div class="insight-block">
        <div class="head">
          <span class="num ${colors[i] || 'n1'}">${i + 1}</span>
          <span class="label">${escHtml(ins.title || '')}</span>
        </div>
        <div class="desc">${escHtml(ins.desc || '')}</div>
        <div class="insight-apply-btn" onclick="referenceApplyInsight('${reqId}', this)">+ 应用到需求</div>
      </div>`;
    }).join('');

    // ── 底部 ──
    const footerHtml = insights.length > 0 ? `
      <div class="brief-footer">
        <span class="hint">💡 点「应用到需求」可将借鉴点注入对话继续讨论</span>
        <div class="btn-row">
          <button class="btn-small" onclick="chatAssistRegen('${reqId}','reference')" style="font-size:11px">↻ 换一批核心理念</button>
          <button class="btn-small btn-primary" onclick="referenceApplyAll('${reqId}')" style="font-size:11px">✅ 全部引用到对话</button>
        </div>
      </div>` : '';

    return `
      <div class="ref-brief">
        ${profileHtml}
        ${diagramHtml}
        ${insightHtml}
        ${footerHtml}
      </div>`;
  }

  // ── 图表渲染 ──
  function renderDiagram(d) {
    if (!d || !d.type) return '';
    switch (d.type) {
      case 'flow': return renderFlow(d);
      case 'grid': return renderGrid(d);
      case 'layers': return renderLayers(d);
      default: return '';
    }
  }

  function renderFlow(d) {
    const nodes = (d.nodes || []).map((n, i) => `
      <div class="df-node df-n${i + 1}">
        <span class="icon">${n.icon || '📋'}</span>
        <span class="label"><strong>${escHtml(n.label || '')}</strong>${n.detail ? '<br>' + escHtml(n.detail) : ''}</span>
      </div>`).join('<span class="df-arrow">→</span>');
    const tags = (d.tags || []).map(t => `<span class="df-tag">${escHtml(t)}</span>`).join('');
    return `
      <div class="diagram-section">
        <div class="diagram-title">📊 ${escHtml(d.title || '')} <span class="sub">${escHtml(d.subtitle || '')}</span></div>
        <div class="data-flow">${nodes}</div>
        ${tags ? `<div class="df-tags">${tags}</div>` : ''}
      </div>`;
  }

  function renderGrid(d) {
    const views = (d.views || []).map(v => `
      <div class="view-card">
        <span class="vicon">${v.icon || '📊'}</span>
        <span class="vname">${escHtml(v.name || '')}</span>
        <span class="vdesc">${escHtml(v.desc || '')}</span>
      </div>`).join('');
    return `
      <div class="diagram-section">
        <div class="diagram-title">🖼️ ${escHtml(d.title || '')} <span class="sub">${escHtml(d.subtitle || '')}</span></div>
        <div class="view-showcase">
          <div class="view-source">
            <span class="icon">🗄️</span>
            <span class="label">${escHtml(d.source_label || '')}</span>
            <span class="sub">${escHtml(d.source_detail || '')}</span>
          </div>
          <div class="view-grid">${views}</div>
        </div>
      </div>`;
  }

  function renderLayers(d) {
    const layers = (d.layers || []).map((l, i) => `
      <div class="perm-card perm-l${i + 1}">
        <div class="plevel">${escHtml(l.level || '')}</div>
        <div class="pname">${escHtml(l.name || '')}</div>
        <div class="pdesc">${escHtml(l.desc || '')}</div>
      </div>`).join('');
    return `
      <div class="diagram-section">
        <div class="diagram-title">🔒 ${escHtml(d.title || '')} <span class="sub">${escHtml(d.subtitle || '')}</span></div>
        <div class="perm-layers">${layers}</div>
      </div>`;
  }

  window.ACMSAssists.register('reference', { name: '借鉴卡片（产品简报）', render });
})();

// ── 全局函数 ──
/** 应用到需求：切换选中态 */
function referenceApplyInsight(reqId, btn) {
  const block = btn.closest('.insight-block');
  if (!block) return;
  const isSelected = block.classList.toggle('selected');
  btn.textContent = isSelected ? '✅ 已选' : '+ 应用到需求';
}

/** 全部引用到对话：把选中的理念发送到对话流 */
function referenceApplyAll(reqId) {
  const layer = document.querySelector(`#chat-stream-msgs-${reqId} .chat-assist-layer[data-assist-method="reference"]`);
  if (!layer) return;
  const brief = layer.querySelector('.ref-brief');
  if (!brief) return;

  // 收集被选中的 insight（如果都没选则全选）
  const selected = brief.querySelectorAll('.insight-block.selected');
  const blocks = selected.length > 0 ? selected : brief.querySelectorAll('.insight-block');

  if (blocks.length === 0) {
    toast('没有可引用的理念', 'info', 1500);
    return;
  }

  const parts = ['参考了以下产品设计：'];
  blocks.forEach(b => {
    const title = b.querySelector('.label')?.textContent?.trim();
    const desc = b.querySelector('.desc')?.textContent?.trim();
    if (title) parts.push(`\n💡 ${title}`);
    if (desc) parts.push(`  ${desc}`);
  });

  const text = parts.join('\n');
  const input = document.getElementById(`ai-clarify-input-${reqId}`);
  if (!input) return;
  input.value = text;

  // 自动发送
  const sendBtn = document.querySelector(`#chat-stream-${reqId} .btn-primary[onclick*="chatSend"]`);
  if (sendBtn) {
    sendBtn.click();
    toast('✅ 已发送借鉴理念到对话', 'success', 1500);
  } else {
    input.focus();
    toast('✅ 已填入输入框，请点击发送', 'success', 1500);
  }
}
