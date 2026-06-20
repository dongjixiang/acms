// 视觉预览辅助手段（v0.3.3 B+++ 路由器接入）
// 渲染 3 张方向图（变体），用户可点选一个"最像的"
// v0.3.3 B+++ 移除："用这个方向充实我的想法"按钮（与决策树一致：用户看完视觉参考即可，不强制采用）
// 字段：requirement.insight_previews（visual 端点共用）
(function () {
  function render(reqId, data) {
    if (!data || !data.variants) return '';
    const variants = data.variants || [];
    const picked = data.picked_variant_id;

    // 状态判断
    if (data.status === 'pending' || data.status === 'generating') {
      if (variants.length === 0) {
        return `
          <div class="assist-section-title">🎨 视觉预览</div>
          <div class="insight-loading">🤔 AI 在生成 3 张方向图…（约 30s）</div>
        `;
      }
      // 有部分 variants（已完成 image 生成的）：实时展示
    }
    if (data.status === 'failed') {
      return `
        <div class="assist-section-title">🎨 视觉预览</div>
        <div class="insight-error">❌ 图片生成失败：${escHtml(data.error || '未知错误')}</div>
      `;
    }
    if (data.status === 'skipped') {
      return `
        <div class="assist-section-title">🎨 视觉预览</div>
        <div class="assist-intro">⏭ 跳过视觉预览。</div>
      `;
    }

    // variants 渲染
    const cards = variants.map((v, i) => {
      const isPicked = picked === v.id;
      const hasImg = v.asset_path && !v.error;
      const imgBlock = hasImg
        // v0.13 B7 fix: 用 req 所属 project_id 拼图片 URL，不用 App.currentProjectId
        //   旧：跨项目查看时永远 404（req 100016 在 sanguo，但用户在 duogame → URL 拼成 proj_duogame → 404）
        //   新：data.project_id 来自 server getAssist → req.project_id，跨项目正常显示
        //   fallback：data.project_id 缺失时用 App.currentProjectId（向后兼容）
        ? `<img src="/api/generate/assets/${data.project_id || App.currentProjectId}/${v.asset_path}" class="assist-visual-img" alt="${escHtml(v.label)}" loading="lazy" />`
        : (v.error
            ? `<div class="assist-visual-img-failed">🖼 生成失败：${escHtml(v.error)}</div>`
            : `<div class="assist-visual-img-loading">⏳ 生成中…</div>`);
      return `
        <div class="assist-card ${isPicked ? 'assist-card-picked' : ''}" data-visual-idx="${i}">
          <div class="assist-card-header">
            <span class="assist-card-letter">${String.fromCharCode(65+i)}</span>
            <strong>${escHtml(v.label || '')}</strong>
            ${isPicked ? '<span class="assist-picked-badge">✅ 选了</span>' : ''}
          </div>
          <div class="assist-card-meta">${escHtml(v.rationale || '')}</div>
          <div class="assist-visual-img-wrap">${imgBlock}</div>
          <button class="btn-small assist-pick-btn ${isPicked ? 'btn-primary' : ''}"
            onclick="ACMSAssistDispatcher.useAssist('${reqId}', 'visual', { variantId: '${escHtml(v.id).replace(/'/g, "\\'")}' })"
            ${isPicked ? 'disabled' : ''}>
            ${isPicked ? '✅ 已选' : '👆 选这个方向'}
          </button>
        </div>
      `;
    }).join('');

    return `
      <div class="assist-section-title">🎨 视觉预览 · ${variants.length} 个方向</div>
      <div class="assist-intro">看下哪个方向最像你想要的。选中的方向会作为视觉参考进入下一步。</div>
      <div class="assist-grid">${cards}</div>
      <!-- v0.3.6：「都不符合，再换一批」按钮（仅未选时显示） -->
      ${!picked ? `<div class="assist-regen-row">
        <button class="btn-small btn-secondary" onclick="ACMSAssistDispatcher.regenerateBatch('${reqId}', 'visual')" title="让 AI 再生成 3 张明显不同风格的图">🔄 都不符合，再换一批</button>
      </div>` : ''}
    `;
  }

  window.ACMSAssists.register('visual', { name: '视觉预览（3 张方向图）', render });
})();
