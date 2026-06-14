// 决策树辅助手段（v0.4 — 暖橙描边 + 岔路口锚点 + 提交按钮）
// 字段：requirement.assist_decision_tree
// 数据结构：{ tree: [{label, desc, examples, pros, cons}, ...], used, used_branch_idx }
(function () {
  function render(reqId, data) {
    if (!data || !data.tree) return '';
    const tree = data.tree;
    const usedIdx = (data.used && typeof data.used_branch_idx === 'number') ? data.used_branch_idx : -1;
    const isSubmitted = !!data.used;

    const treeHtml = tree.map((t, i) => {
      const isSelected = isSubmitted ? (i === usedIdx) : false;
      return `
      <div class="dt-branch${isSelected ? ' selected' : ''}" data-branch-idx="${i}">
        <div class="dt-branch-head">
          <span class="dt-branch-letter">${String.fromCharCode(65+i)}</span>
          <span class="dt-branch-label">${escHtml(t.label || '')}</span>
          <span class="dt-picked-badge">✅ 你选的</span>
        </div>
        <div class="dt-branch-desc">${escHtml(t.desc || '')}</div>
        ${t.examples ? `<div class="dt-branch-analogy">💡 ${escHtml(t.examples)}</div>` : ''}
        <div class="dt-proscons">
          ${t.pros ? `<div class="dt-pc dt-pc-pro"><span class="dt-pc-mark">+</span>${escHtml(t.pros)}</div>` : ''}
          ${t.cons ? `<div class="dt-pc dt-pc-con"><span class="dt-pc-mark">−</span>${escHtml(t.cons)}</div>` : ''}
        </div>
      </div>`;
    }).join('');

    // 已选/已提交提示
    const usedBranch = isSubmitted ? tree[usedIdx] : null;
    const usedTag = usedBranch
      ? `<div class="dt-submitted-tag">✅ 已确认方向 <strong>${String.fromCharCode(65 + usedIdx)}</strong> · ${escHtml(usedBranch.label || '')}</div>`
      : '';

    // 底部操作按钮（已提交后只显示"重新选择"）
    const regenBtn = `<button class="dt-btn" onclick="ACMSAssistDispatcher.regenerateBatch('${reqId}', 'decision_tree')" title="让 AI 再生成 3 个明显不同的方向">🔄 ${isSubmitted ? '↩ 重新选择' : '都不符合，再换一批'}</button>`;
    const submitBtn = isSubmitted
      ? ''
      : `<button class="dt-btn dt-btn-primary" id="dt-submit-${reqId}" disabled onclick="dtSubmit('${reqId}')">✓ 确认采用这个方向</button>`;

    return `
      <div class="dt-block">
        <div class="dt-title">🌳 决策树 · 3 个互斥方向</div>
        <div class="dt-tree">${treeHtml}</div>
        ${usedTag}
        <div class="dt-footer">
          <span>${isSubmitted ? '已确认 · 点"重新选择"可改' : '点击卡片切换选中 · 单选'}</span>
          <div class="dt-footer-actions">${regenBtn}${submitBtn}</div>
        </div>
      </div>
    `;
  }

  // 渲染后挂事件（dispatcher.afterRender 调用）
  function afterRender(reqId, data) {
    if (!data || data.used) return; // 已提交后不挂事件
    const layer = document.querySelector(`#assist-area-${reqId} .assist-decision_tree`);
    if (!layer) return;
    const branches = layer.querySelectorAll('.dt-branch');
    branches.forEach(card => {
      card.addEventListener('click', () => {
        const wasSelected = card.classList.contains('selected');
        branches.forEach(c => c.classList.remove('selected'));
        if (!wasSelected) {
          card.classList.add('selected');
          // 启用提交按钮
          const submitBtn = document.getElementById(`dt-submit-${reqId}`);
          if (submitBtn) submitBtn.disabled = false;
        } else {
          const submitBtn = document.getElementById(`dt-submit-${reqId}`);
          if (submitBtn) submitBtn.disabled = true;
        }
      });
    });
  }

  window.ACMSAssists.register('decision_tree', {
    name: '决策树（3 个互斥方向）',
    render,
    afterRender,
  });
})();

/** 全局函数：点提交按钮 → 调 useAssist 标记 used_branch_idx + 锁住卡片 */
function dtSubmit(reqId) {
  const layer = document.querySelector(`#assist-area-${reqId} .assist-decision_tree`);
  if (!layer) return;
  const selected = layer.querySelector('.dt-branch.selected');
  if (!selected) {
    toast('请先选一个方向', 'info', 1500);
    return;
  }
  const idx = parseInt(selected.dataset.branchIdx);
  // 立即锁住 + 禁用提交按钮 + 切提示（不等轮询）
  layer.querySelectorAll('.dt-branch').forEach(c => {
    c.classList.remove('selected');
    c.style.cursor = 'default';
  });
  const submitBtn = document.getElementById(`dt-submit-${reqId}`);
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '✓ 已提交';
  }
  // 调后端标记 + 触发轮询
  ACMSAssistDispatcher.useAssist(reqId, 'decision_tree', { used_branch_idx: idx });
}
