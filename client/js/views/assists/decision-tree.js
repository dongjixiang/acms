// 决策树辅助手段（v0.3.3 Phase 2）
// 渲染 3 个互斥分支 + 类比徽章 + 分支详情面板（设计特色 + 配图）
// 字段：requirement.assist_decision_tree
(function () {
  let _branchDetailPollers = {}; // reqId-branchIdx → interval

  function render(reqId, data) {
    if (!data || !data.tree) return '';
    const tree = data.tree;
    const treeHtml = tree.map((t, i) => `
      <div class="brief-branch" data-branch-idx="${i}">
        <div class="brief-branch-label">${String.fromCharCode(65+i)} ${escHtml(t.label || '')}</div>
        <div class="brief-branch-desc">${escHtml(t.desc || '')}</div>
        ${t.examples ? `<button class="brief-branch-analogy-btn" onclick="ACMSAssists.get('decision_tree').expandBranchDetail('${reqId}', ${i})" title="查看详细的产品介绍">💡 ${escHtml(t.examples)} ▾</button>` : ''}
        <div class="brief-branch-proscons">
          ${t.pros ? `<span class="brief-pro">+ ${escHtml(t.pros)}</span>` : ''}
          ${t.cons ? `<span class="brief-con">- ${escHtml(t.cons)}</span>` : ''}
        </div>
      </div>
      <div id="branch-detail-${reqId}-${i}" class="branch-detail-panel" style="display:none"></div>
    `).join('');

    return `
      <div class="assist-section-title">🌳 决策树 · 3 个互斥方向</div>
      <div class="brief-tree">${treeHtml}</div>
      ${data.used ? `<div class="assist-used-tag">✅ 你选了 ${String.fromCharCode(65 + (data.used_branch_idx ?? 0))} 方向</div>` : ''}
      <!-- v0.3.6：「都不符合，再换一批」按钮（仅未选时显示，避免重复消耗 token） -->
      ${!data.used ? `<div class="assist-regen-row">
        <button class="btn-small btn-secondary" onclick="ACMSAssistDispatcher.regenerateBatch('${reqId}', 'decision_tree')" title="让 AI 再生成 3 个明显不同的方向">🔄 都不符合，再换一批</button>
      </div>` : ''}
    `;
  }

  async function expandBranchDetail(reqId, branchIdx) {
    const panel = document.getElementById(`branch-detail-${reqId}-${branchIdx}`);
    if (!panel) return;

    if (panel.style.display === 'block' && panel.innerHTML) {
      panel.style.display = 'none';
      stopBranchDetailPolling(reqId, branchIdx);
      return;
    }
    panel.style.display = 'block';
    panel.innerHTML = '<div class="insight-loading">⏳ AI 正在分析产品特色…</div>';
    try {
      await api('POST', `/requirements/${reqId}/thinking-brief/branch-detail`, { branchIdx, modelId: null });
    } catch (e) {
      console.log('[branch-detail] 启动请求:', e.message);
    }
    startBranchDetailPolling(reqId, branchIdx, panel);
  }

  function startBranchDetailPolling(reqId, branchIdx, panel) {
    stopBranchDetailPolling(reqId, branchIdx);
    const key = `${reqId}-${branchIdx}`;
    const tick = async () => {
      try {
        const resp = await api('GET', `/requirements/${reqId}/thinking-brief/branch-detail/${branchIdx}`);
        const detail = resp.branchDetail;
        renderBranchDetail(panel, detail, reqId, branchIdx);
        if (detail && (detail.status === 'done' || detail.status === 'failed')) {
          const allImgDone = !detail.features || detail.features.every(f => f.image_status === 'done' || f.image_status === 'failed');
          if (allImgDone) stopBranchDetailPolling(reqId, branchIdx);
        }
      } catch (e) {
        if (e.message && e.message.includes('NOT_GENERATED')) {
          panel.innerHTML = '<div class="insight-loading">⏳ 等待生成启动…</div>';
        } else {
          panel.innerHTML = `<div class="insight-error">❌ ${escHtml(e.message)}</div>`;
          stopBranchDetailPolling(reqId, branchIdx);
        }
      }
    };
    _branchDetailPollers[key] = setInterval(tick, 2000);
    tick();
  }

  function stopBranchDetailPolling(reqId, branchIdx) {
    const key = `${reqId}-${branchIdx}`;
    if (_branchDetailPollers[key]) {
      clearInterval(_branchDetailPollers[key]);
      delete _branchDetailPollers[key];
    }
  }

  function renderBranchDetail(panel, detail, reqId, branchIdx) {
    if (!detail) {
      panel.innerHTML = '<div class="insight-loading">⏳ 等待生成启动…</div>';
      return;
    }
    if (detail.status === 'generating' && (!detail.features || detail.features.length === 0)) {
      panel.innerHTML = '<div class="insight-loading">🤔 AI 正在分析该方向的设计特色…</div>';
      return;
    }
    if (detail.status === 'failed') {
      panel.innerHTML = `<div class="insight-error">❌ 特色生成失败：${escHtml(detail.error || '未知错误')}</div>
        <button class="btn-small" style="margin-top:8px" onclick="ACMSAssists.get('decision_tree').retryBranchDetail('${reqId}', ${branchIdx})">↻ 重试</button>`;
      return;
    }

    const features = detail.features || [];
    const branchLetter = String.fromCharCode(65 + branchIdx);
    // v0.3.3：决策树已迁到 assist_decision_tree 独立字段
    // 后端 GET 会附带 tree 字段（从 assist_decision_tree 或老 brief.decision_tree 取）
    // 老 brief 缓存也作为 fallback（兼容未重启服务时浏览器缓存的场景）
    const brief = window.ACMSThinkingBrief ? window.ACMSThinkingBrief.getBrief(reqId) : null;
    const branch =
      (detail.tree && detail.tree[branchIdx]) ||
      (brief?.decision_tree?.[branchIdx]) ||
      null;
    const branchLabel = branch?.label || '';

    const featuresHtml = features.map((f, i) => {
      const imgStatus = f.image_status;
      let imgBlock;
      if (imgStatus === 'done' && f.image_asset) {
        imgBlock = `<div class="branch-feature-img-clickable" onclick="event.stopPropagation();ACMSAssists.get('decision_tree').expandFeatureImage('${reqId}', ${branchIdx}, ${i})" title="点击放大"><img src="/api/generate/assets/${App.currentProjectId}/${f.image_asset}" class="branch-feature-img" alt="${escHtml(f.title)}" loading="lazy" /></div>`;
      } else if (imgStatus === 'failed') {
        imgBlock = `<div class="branch-feature-img-failed">🖼 配图失败</div>`;
      } else {
        imgBlock = `<div class="branch-feature-img-loading">⏳ 配图中…</div>`;
      }
      return `
        <div class="branch-feature-card" data-feature-idx="${i}">
          <input type="checkbox" class="branch-feature-check" id="branch-feature-${reqId}-${branchIdx}-${i}" data-feature-title="${escHtml(f.title)}" onclick="event.stopPropagation()">
          <div class="branch-feature-img-wrap">${imgBlock}</div>
          <label for="branch-feature-${reqId}-${branchIdx}-${i}" class="branch-feature-text" onclick="event.stopPropagation()">
            <div class="branch-feature-title">${escHtml(f.title)}</div>
            <div class="branch-feature-desc">${escHtml(f.desc)}</div>
          </label>
        </div>
      `;
    }).join('');

    panel.innerHTML = `
      <div class="branch-detail-inner">
        <div class="branch-detail-header">
          <strong>${branchLetter} ${escHtml(branchLabel)} · 设计特色</strong>
          <button class="branch-detail-close" onclick="ACMSAssists.get('decision_tree').expandBranchDetail('${reqId}', ${branchIdx})">✕</button>
        </div>
        <div class="branch-detail-intro">
          💡 AI 从「${escHtml(branch?.examples || branchLabel)}」中提炼出 ${features.length} 个独特的设计特色。勾选你感兴趣的方向，充实到你的想法。
        </div>
        <div class="branch-feature-grid">${featuresHtml}</div>
        <div class="branch-detail-actions">
          <button class="btn-small" onclick="ACMSAssists.get('decision_tree').expandBranchDetail('${reqId}', ${branchIdx})">← 收起</button>
        </div>
      </div>
    `;
  }

  function expandFeatureImage(reqId, branchIdx, featureIdx) {
    const brief = window.ACMSThinkingBrief ? window.ACMSThinkingBrief.getBrief(reqId) : null;
    const detail = brief?.branch_details?.[branchIdx];
    const f = detail?.features?.[featureIdx];
    if (!f || f.image_status !== 'done' || !f.image_asset) return;

    const existing = document.getElementById('feature-image-modal');
    if (existing) document.body.removeChild(existing);

    const overlay = document.createElement('div');
    overlay.id = 'feature-image-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer';
    overlay.onclick = function(e) { if (e.target === overlay) document.body.removeChild(overlay); };

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#1a1a1a;border-radius:8px;padding:20px;max-width:94vw;max-height:94vh;cursor:default;box-shadow:0 8px 32px rgba(0,0,0,0.5);display:flex;flex-direction:column;align-items:center';
    modal.onclick = function(e) { e.stopPropagation(); };

    const title = document.createElement('div');
    title.style.cssText = 'font-size:14px;font-weight:bold;color:#fff;margin-bottom:6px;text-align:center';
    title.textContent = f.title;

    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:12px;color:#aaa;margin-bottom:12px;text-align:center;max-width:600px';
    desc.textContent = f.desc;

    const img = document.createElement('img');
    img.src = `/api/generate/assets/${App.currentProjectId}/${f.image_asset}`;
    img.alt = f.title;
    img.style.cssText = 'max-width:90vw;max-height:80vh;object-fit:contain;border-radius:4px;background:#000';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ 关闭';
    closeBtn.style.cssText = 'margin-top:12px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:4px;padding:6px 16px;font-size:12px;cursor:pointer';
    closeBtn.onclick = function() { document.body.removeChild(overlay); };

    modal.appendChild(title);
    modal.appendChild(desc);
    modal.appendChild(img);
    modal.appendChild(closeBtn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const onKey = (e) => {
      if (e.key === 'Escape' && document.body.contains(overlay)) {
        document.body.removeChild(overlay);
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);
  }

  function retryBranchDetail(reqId, branchIdx) {
    const panel = document.getElementById(`branch-detail-${reqId}-${branchIdx}`);
    if (panel) panel.innerHTML = '<div class="insight-loading">⏳ 重新启动生成…</div>';
    expandBranchDetail(reqId, branchIdx);
  }

  async function confirmBranchFeatures(reqId, branchIdx) {
    const checked = Array.from(document.querySelectorAll(`#branch-detail-${reqId}-${branchIdx} .branch-feature-check:checked`));
    if (checked.length === 0) {
      toast('请先勾选至少一个感兴趣的特色', 'warning');
      return;
    }
    const brief = window.ACMSThinkingBrief ? window.ACMSThinkingBrief.getBrief(reqId) : null;
    const branch = brief?.decision_tree?.[branchIdx];
    if (!branch) return;
    const examples = branch.examples || branch.label;
    const titles = checked.map(cb => cb.dataset.featureTitle).join('、');
    const supplement = `（从「${examples}」学到的特色：${titles}）`;

    const panel = document.getElementById(`branch-detail-${reqId}-${branchIdx}`);
    if (panel) panel.style.display = 'none';
    stopBranchDetailPolling(reqId, branchIdx);

    toast(`⏳ 正在重新组织需求描述…`, 'info', 2000);
    try {
      const resp = await api('POST', `/requirements/${reqId}/rewrite-description`, {
        supplement,
        modelId: null,
        autoRegenBrief: true,
      });
      if (resp.error) {
        toast('重整失败: ' + resp.error, 'error');
        return;
      }
      toast(`✅ 已重整，思路正在重生…`, 'success', 2000);
      setTimeout(() => openRequirement(reqId), 500);
    } catch (e) {
      toast('重整失败: ' + e.message, 'error');
    }
  }

  window.ACMSAssists.register('decision_tree', {
    name: '决策树（3 方向 + 类比徽章 → 设计特色）',
    render, expandBranchDetail, expandFeatureImage, retryBranchDetail, confirmBranchFeatures,
  });
})();
