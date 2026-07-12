// 渲染：产品全景 + 可视化图表 + 核心理念 + "应用到需求"按钮
// v0.13: 注入 sourceNote（来源说明）— 仅用于 dispatcher.render() 自动注入，render 函数不需要自己拼
//   因 render() 结果被 dispatcher.render 包了一层：<div class="assist-block assist-${m}">${sourceNote}${mod.render(...)}</div>
//   所以 render 函数只输出纯卡片内容，不拼 sourceNote
(function () {
  function render(reqId, data) {
    if (!data || data.status === 'pending' || data.status === 'generating') return '';
    if (data.status === 'failed') return `<div class="insight-error">❌ 产品情报加载失败：${escHtml(data.error || '未知错误')}</div>`;

    // data 结构
    const productName = data.product_name || '';
    const summary = data.summary;
    const insights = data.insights || [];
    const dimensions = data.dimensions || [];

    // 折叠类来组织布局
    const overviewHtml = summary ? `
      <div class="ref-summary">
        ${summary.one_liner ? `<div class="ref-oneliner" style="font-size:14px;font-weight:600;margin:6px 0;padding:6px 10px;background:var(--bg2);border-radius:6px;border-left:3px solid var(--accent)">${escHtml(summary.one_liner)}</div>` : ''}
        ${summary.brief ? `<div style="font-size:12px;color:var(--text2);margin:4px 0 8px 0">${escHtml(summary.brief)}</div>` : ''}
        ${summary.metrics ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0">${summary.metrics.map(m => `<span style="font-size:11px;background:var(--bg2);padding:2px 8px;border-radius:10px;border:1px solid var(--border)">${escHtml(m.label || '')}: <strong>${escHtml(m.value || '')}</strong></span>`).join('')}</div>` : ''}
      </div>
    ` : '';

    // 核心理念（insights — 做成可点选块）
    const insightsHtml = insights.length > 0 ? `
      <div class="ref-insights">
        <div style="font-size:11px;font-weight:600;color:var(--text2);margin:6px 0 4px 0">💡 核心理念（点选后「全部引用到对话」）</div>
        ${insights.map((ins, i) => `
          <div class="insight-block" data-idx="${i}" style="cursor:pointer;margin:3px 0;padding:5px 8px;background:var(--bg2);border-radius:5px;border:1px solid var(--border);font-size:12px;transition:all 0.15s">
            <div class="label" style="font-weight:600;color:var(--text)">${escHtml(ins.label || '')}</div>
            <div class="desc" style="color:var(--text2);margin-top:2px">${escHtml(ins.desc || '')}</div>
            ${ins.source ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">📎 ${escHtml(ins.source)}</div>` : ''}
            <div class="insight-apply-btn" onclick="referenceApplyInsight('${reqId}', this)" style="display:inline-block;margin-top:4px;padding:2px 8px;font-size:10px;border:1px solid var(--accent3);border-radius:4px;color:var(--accent3);cursor:pointer;background:transparent">+ 应用到需求</div>
          </div>
        `).join('')}
      </div>
    ` : '';

    // 多维度对比（dimensions — 可选）
    const dimensionsHtml = dimensions.length > 0 ? `
      <div class="ref-dimensions" style="margin-top:8px">
        <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px">📊 多维对比</div>
        ${dimensions.map(d => `
          <div class="diagram-section" style="margin:4px 0">
            <div style="font-size:12px;font-weight:600;margin:2px 0">🔒 ${escHtml(d.title || '')} <span style="font-size:11px;color:var(--text2)">${escHtml(d.subtitle || '')}</span></div>
            <div class="perm-layers" style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0">${(d.layers || []).map(l => `<span style="font-size:11px;background:var(--bg);padding:2px 6px;border-radius:4px;border:1px solid var(--border)">${escHtml((l.label||'') + ' ' + (l.value||''))}</span>`).join('')}</div>
          </div>
        `).join('')}
      </div>
    ` : '';

    // 底部操作
    const footer = `<div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:11px;color:var(--text3)">💡 点「应用到需求」可将借鉴点注入对话继续讨论</span><button class="btn-small btn-primary" onclick="referenceApplyAll('${reqId}')" style="font-size:11px">✅ 全部引用到对话</button></div>`;

    return `
      <div class="ref-brief">
        ${productName ? `<div class="brief-top"><h2>🏛 ${escHtml(productName)} · 产品简报</h2></div>` : ''}
        ${overviewHtml}
        ${insightsHtml}
        ${dimensionsHtml}
        ${footer}
      </div>
    `;
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

/** 全部引用到对话：检测是否在 chat layer → 走统一路径，否则塞输入框 */
function referenceApplyAll(reqId) {
  // 如果在 chat assist layer/result 内，走 chatSendAssistPick 统一路径
  const btn = document.querySelector("button[onclick*=\"referenceApplyAll('" + reqId + "')\"]");
  const inChatLayer = btn && (btn.closest('.chat-assist-layer') || btn.closest('.chat-assist-result'));
  if (inChatLayer) {
    chatSendAssistPick(reqId, 'reference');
    return;
  }
  // 以下为原有逻辑（独立面板模式）
  const layer = document.querySelector('#chat-stream-msgs-' + reqId + ' .chat-assist-layer[data-assist-method="reference"]');
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
    if (title) parts.push('\n💡 ' + title);
    if (desc) parts.push('  ' + desc);
  });

  const text = parts.join('\n');
  const input = document.getElementById('ai-clarify-input-' + reqId);
  if (!input) return;
  input.value = text;

  // 自动发送
  const sendBtn = document.querySelector('#chat-stream-' + reqId + ' .btn-primary[onclick*="chatSend"]');
  if (sendBtn) {
    sendBtn.click();
    toast('✅ 已发送借鉴理念到对话', 'success', 1500);
  } else {
    input.focus();
    toast('✅ 已填入输入框，请点击发送', 'success', 1500);
  }
}
