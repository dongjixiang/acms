// 渲染：产品全景 + 可视化图表 + 核心理念 + "应用到需求"按钮
// v0.13: 注入 sourceNote（来源说明）— 仅用于 dispatcher.render() 自动注入，render 函数不需要自己拼
//   因 render() 结果被 dispatcher.render 包了一层：<div class="assist-block assist-${m}">${sourceNote}${mod.render(...)}</div>
//   所以 render 函数只输出纯卡片内容，不拼 sourceNote
// v0.13.1 fix: 适配后端 v2 数据结构（target_product / profile / diagrams[i].type=flow|grid|layers / insights.title）
//   bug：之前只读 product_name/summary/dimensions/insights.label — 后端 9 个月前就改 v2 了，前端字段全对不上
//        导致除了 insights.desc 显示，其他全空 — 用户报"借鉴卡片只显示核心理念"根因
(function () {
  function render(reqId, data) {
    if (!data || data.status === 'pending' || data.status === 'generating') return '';
    if (data.status === 'failed') return `<div class="insight-error">❌ 产品情报加载失败：${escHtml(data.error || '未知错误')}</div>`;

    // v0.13.1 数据读取 — 兼容 v1（旧字段名）和 v2（新字段名）
    const productName = data.target_product || data.product_name || '';
    const profile = data.profile || null;
    const diagrams = Array.isArray(data.diagrams) ? data.diagrams : (Array.isArray(data.dimensions) ? data.dimensions : []);
    const insights = data.insights || [];

    // v2 → v1 summary 适配：profile 4 维度 → 产品全景块
    //   给老样式（.ref-summary / .ref-oneliner）保留 CSS 类名 — 兼容旧主题/扩展样式
    const summary = profile ? {
      one_liner: profile.定位 || '',
      brief: profile.核心功能 || '',
      workflow: profile.工作流程 || '',
      users: profile.典型用户 || '',
    } : null;

    // 产品全景（来自 profile）
    const overviewHtml = summary ? `
      <div class="ref-summary">
        ${summary.one_liner ? `<div class="ref-oneliner" style="font-size:14px;font-weight:600;margin:6px 0;padding:6px 10px;background:var(--bg2);border-radius:6px;border-left:3px solid var(--accent)">📌 ${escHtml(summary.one_liner)}</div>` : ''}
        ${summary.brief ? `<div style="font-size:12px;color:var(--text);margin:6px 0 4px 0"><strong style="color:var(--text2)">核心功能：</strong>${escHtml(summary.brief)}</div>` : ''}
        ${summary.workflow ? `<div style="font-size:12px;color:var(--text2);margin:2px 0"><strong style="color:var(--text2)">工作流程：</strong>${escHtml(summary.workflow)}</div>` : ''}
        ${summary.users ? `<div style="font-size:12px;color:var(--text2);margin:2px 0"><strong style="color:var(--text2)">典型用户：</strong>${escHtml(summary.users)}</div>` : ''}
      </div>
    ` : '';

    // 核心理念（insights — 做成可点选块，title + desc + 可选 override_summary）
    const insightsHtml = insights.length > 0 ? `
      <div class="ref-insights">
        <div style="font-size:11px;font-weight:600;color:var(--text2);margin:8px 0 4px 0">💡 核心理念（点选后「全部引用到对话」）</div>
        ${insights.map((ins, i) => `
          <div class="insight-block" data-idx="${i}" style="cursor:pointer;margin:3px 0;padding:5px 8px;background:var(--bg2);border-radius:5px;border:1px solid var(--border);font-size:12px;transition:all 0.15s">
            <div class="label" style="font-weight:600;color:var(--text)">${escHtml(ins.title || ins.label || '')}</div>
            <div class="desc" style="color:var(--text2);margin-top:2px">${escHtml(ins.desc || '')}</div>
            ${ins.override_summary ? `<div style="font-size:10px;color:var(--accent);margin-top:3px;font-style:italic">💬 ${escHtml(ins.override_summary)}</div>` : ''}
            <div class="insight-apply-btn" onclick="referenceApplyInsight('${reqId}', this)" style="display:inline-block;margin-top:4px;padding:2px 8px;font-size:10px;border:1px solid var(--accent3);border-radius:4px;color:var(--accent3);cursor:pointer;background:transparent">+ 应用到需求</div>
          </div>
        `).join('')}
      </div>
    ` : '';

    // 可视化图表（diagrams — 按 type=flow|grid|layers 分支渲染）
    const diagramsHtml = diagrams.length > 0 ? `
      <div class="ref-diagrams" style="margin-top:10px">
        <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px">📊 可视化图表 · ${diagrams.length} 张</div>
        ${diagrams.map(renderOneDiagram).join('')}
      </div>
    ` : '';

    // 底部操作
    const footer = `<div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:11px;color:var(--text3)">💡 点「应用到需求」可将借鉴点注入对话继续讨论</span><button class="btn-small btn-primary" onclick="referenceApplyAll('${reqId}')" style="font-size:11px">✅ 全部引用到对话</button></div>`;

    return `
      <div class="ref-brief">
        ${productName ? `<div class="brief-top"><h2>🏛 ${escHtml(productName)} · 产品简报</h2></div>` : ''}
        ${overviewHtml}
        ${insightsHtml}
        ${diagramsHtml}
        ${footer}
      </div>
    `;
  }

  // 单个 diagram 按 type 渲染：flow 流程图 / grid 视图网格 / layers 层级卡
  function renderOneDiagram(d) {
    const titleHtml = `<div style="font-size:12px;font-weight:600;margin:8px 0 4px 0">${escHtml(d.title || '')}${d.subtitle ? ` <span style="font-size:11px;color:var(--text2);font-weight:normal">${escHtml(d.subtitle)}</span>` : ''}</div>`;
    const tagsHtml = (Array.isArray(d.tags) && d.tags.length)
      ? `<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:3px">${d.tags.map(t => `<span style="font-size:10px;background:var(--bg);padding:1px 6px;border-radius:8px;border:1px solid var(--border);color:var(--text2)">#${escHtml(t)}</span>`).join('')}</div>`
      : '';

    if (d.type === 'flow' && Array.isArray(d.nodes)) {
      const nodesHtml = d.nodes.map(n => `
        <div style="flex:1 1 130px;min-width:120px;padding:6px 8px;background:var(--bg3);border-radius:4px;font-size:11px;border:1px solid var(--border1)">
          <div style="font-weight:600;color:var(--text)">${escHtml(n.icon || '•')} ${escHtml(n.label || '')}</div>
          ${n.detail ? `<div style="color:var(--text2);margin-top:2px;font-size:10px;line-height:1.4">${escHtml(n.detail)}</div>` : ''}
        </div>
      `).join('');
      return `<div class="ref-diagram ref-diagram-flow" style="margin:8px 0;padding:6px 8px;background:var(--bg2);border-radius:6px;border:1px solid var(--border)">${titleHtml}<div style="display:flex;flex-wrap:wrap;gap:6px">${nodesHtml}</div>${tagsHtml}</div>`;
    }

    if (d.type === 'grid' && Array.isArray(d.views)) {
      const sourceHtml = (d.source_label || d.source_detail)
        ? `<div style="margin:2px 0 4px 0;padding:4px 6px;background:var(--bg3);border-radius:4px;font-size:11px">${d.source_label ? `<strong style="color:var(--accent)">📦 ${escHtml(d.source_label)}</strong>` : ''}${d.source_detail ? `<div style="color:var(--text2);margin-top:1px;font-size:10px">${escHtml(d.source_detail)}</div>` : ''}</div>`
        : '';
      const viewsHtml = d.views.map(v => `
        <div style="padding:6px 8px;background:var(--bg3);border-radius:4px;font-size:11px;border:1px solid var(--border1)">
          <div style="font-weight:600;color:var(--text)">${escHtml(v.icon || '•')} ${escHtml(v.name || '')}</div>
          ${v.desc ? `<div style="color:var(--text2);margin-top:2px;font-size:10px;line-height:1.4">${escHtml(v.desc)}</div>` : ''}
        </div>
      `).join('');
      return `<div class="ref-diagram ref-diagram-grid" style="margin:8px 0;padding:6px 8px;background:var(--bg2);border-radius:6px;border:1px solid var(--border)">${titleHtml}${sourceHtml}<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px">${viewsHtml}</div>${tagsHtml}</div>`;
    }

    if (d.type === 'layers' && Array.isArray(d.layers)) {
      const layersHtml = d.layers.map(l => `
        <div style="display:flex;gap:8px;margin:3px 0;padding:5px 8px;background:var(--bg3);border-radius:4px;font-size:11px;border:1px solid var(--border1)">
          <span style="flex-shrink:0;color:var(--accent);font-weight:600;min-width:34px;font-family:monospace">${escHtml(l.level || '')}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;color:var(--text)">${escHtml(l.name || '')}</div>
            ${l.desc ? `<div style="color:var(--text2);margin-top:1px;font-size:10px;line-height:1.4">${escHtml(l.desc)}</div>` : ''}
          </div>
        </div>
      `).join('');
      return `<div class="ref-diagram ref-diagram-layers" style="margin:8px 0;padding:6px 8px;background:var(--bg2);border-radius:6px;border:1px solid var(--border)">${titleHtml}<div>${layersHtml}</div>${tagsHtml}</div>`;
    }

    // 兜底：未知 type，沿用旧 dimensions 渲染（layers label/value）
    return `<div class="ref-diagram ref-diagram-fallback" style="margin:8px 0;padding:6px;background:var(--bg2);border-radius:6px;border:1px solid var(--border)">${titleHtml}${Array.isArray(d.layers) ? `<div class="perm-layers" style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0">${d.layers.map(l => `<span style="font-size:11px;background:var(--bg);padding:2px 6px;border-radius:4px;border:1px solid var(--border)">${escHtml((l.label||'') + ' ' + (l.value||''))}</span>`).join('')}</div>` : ''}${tagsHtml}</div>`;
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
