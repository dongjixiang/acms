// 决策树辅助手段（v0.3.3 Phase 2）
// 渲染 3 个互斥分支 + 类比徽章 + 分支详情面板（设计特色 + 配图）
// 字段：requirement.assist_decision_tree
(function () {
  // v0.3.6：决策树只作一级分支，类比和特色以信息项展示（不展开/不勾选）
  function render(reqId, data) {
    if (!data || !data.tree) return '';
    const tree = data.tree;
    const treeHtml = tree.map((t, i) => `
      <div class="brief-branch" data-branch-idx="${i}">
        <div class="brief-branch-label">${String.fromCharCode(65+i)} ${escHtml(t.label || '')}</div>
        <div class="brief-branch-desc">${escHtml(t.desc || '')}</div>
        ${t.examples ? `<div class="brief-branch-analogy-info">💡 参考：${escHtml(t.examples)}</div>` : ''}
        <div class="brief-branch-proscons">
          ${t.pros ? `<span class="brief-pro">+ ${escHtml(t.pros)}</span>` : ''}
          ${t.cons ? `<span class="brief-con">- ${escHtml(t.cons)}</span>` : ''}
        </div>
      </div>
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

  window.ACMSAssists.register('decision_tree', {
    name: '决策树（3 个互斥方向）',
    render,
  });
})();
