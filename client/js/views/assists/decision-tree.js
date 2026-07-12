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
        ${t.examples ? (() => {
          // 拆产品名 (按 ,，、 分，trim) — 每个变链接，点开走 loading 卡片模式
          const products = (t.examples || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean);
          const links = products.map((p, i, arr) => {
            const safeP = String(p).replace(/'/g, '&#39;');
            return `<a class="dt-analogy-link" data-product="${escHtml(p)}" onclick="dtOpenReference('${reqId}', '${safeP}', this)">${escHtml(p)}</a>${i < arr.length - 1 ? ', ' : ''}`;
          }).join('');
          return `<div class="dt-branch-analogy">💡 ${links}</div>`;
        })() : ''}
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
    // v0.46 fix：优先查#assist-area（旧 sidebar），fallback 到聊天流卡片
    const layer = document.querySelector(`#assist-area-${reqId} .assist-decision_tree`)
      || document.querySelector(`.chat-assist-result[data-assist-method="decision_tree"]`);
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

/** 全局函数：点提交按钮 → 调 useAssist 标记 used_branch_idx + 锁住卡片 + 发送到对话框 */
async function dtSubmit(reqId) {
  // v0.46 fix：优先查#assist-area，fallback 到聊天流卡片
  const layer = document.querySelector(`#assist-area-${reqId} .assist-decision_tree`)
    || document.querySelector(`.chat-assist-result[data-assist-method="decision_tree"]`);
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
  // 调后端标记
  await ACMSAssistDispatcher.useAssist(reqId, 'decision_tree', { branchIdx: idx });

  // v0.46 fix：如果在聊天流中，把选择内容发送到对话框
  //   检测：卡片在 chat-stream 容器内
  const inChatStream = layer.closest('[id^="chat-stream-msgs-"]');
  if (!inChatStream) return; // 旧 sidebar 模式——只标记，不写聊天流

  const label = selected.querySelector('.dt-branch-label')?.textContent?.trim() || '';
  const desc = selected.querySelector('.dt-branch-desc')?.textContent?.trim() || '';
  const pros = selected.querySelector('.dt-pc-pro')?.textContent?.replace(/^\+/,'').trim() || '';
  const cons = selected.querySelector('.dt-pc-con')?.textContent?.replace(/^−/,'').trim() || '';
  const letter = selected.querySelector('.dt-branch-letter')?.textContent?.trim() || '';
  const examples = Array.from(selected.querySelectorAll('.dt-analogy-link')).map(a => a.textContent).join('、');
  let supplement = `我倾向于方向「${letter} ${label}」—— ${desc}`;
  if (pros) supplement += `。优势：${pros}`;
  if (cons) supplement += `；顾虑：${cons}`;
  if (examples) supplement += `。参考：${examples}`;
  // 渲染用户气泡 + 发送到后端
  const c = document.getElementById(`chat-stream-msgs-${reqId}`);
  if (c) {
    renderChatBubble(c, {role:'user', text:supplement, at:new Date().toISOString()});
    layer.remove();
    c.insertAdjacentHTML('beforeend', '<div class="chat-typing"><span></span><span></span><span></span></div>');
    chatScrollToBottom(c);
  }
  chatSendSupplement(reqId, supplement, 'decision_tree_pick');
}

/** v0.6.4 关联产品链接：点产品名 → 触发 reference assist → loading 卡片在 .dt-block 下方
 *  流程: 1) showAssistLoading 插卡片  2) POST 触发  3) 轮询 GET 看 status  4) replaceAssistLoading
 *  等待时间: 45-75s (3 步串行 LLM)；轮询 2s 一次，最多 60 次 (120s 超时)
 *  不阻塞: 加载过程中用户可继续操作其他卡片/输入框
 */
async function dtOpenReference(reqId, productName, linkEl) {
  // 找触发点的 .dt-block 父级（决策树卡片容器）
  const dtBlock = linkEl.closest('.dt-block');
  if (!dtBlock) return;
  // 防重复点击
  if (linkEl.classList.contains('loading')) return;
  linkEl.classList.add('loading');

  // 1. 创建 loading 卡片，插在 .dt-block 之后
  const loading = showAssistLoading({
    method: 'reference',
    title: `正在生成「${productName}」参考简报`,
    hint: '预计 45-75s · 加载中不影响你做其他操作',
  });
  dtBlock.after(loading);
  // 焦点跳转
  loading.scrollIntoView({ behavior: 'smooth', block: 'center' });

  try {
    // 2. 触发 reference assist
    const r1 = await api('POST', `/requirements/${reqId}/assist/reference`, { productName });
    if (r1 && r1.error) {
      failAssistLoading(loading, '触发失败: ' + r1.error);
      linkEl.classList.remove('loading');
      return;
    }

    // 3. 轮询直到 status === 'done'（每 2s 一次，最多 60 次 = 120s）
    const stepHints = ['分析产品定位...', '生成可视化图表...', '提炼核心理念...'];
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const r2 = await api('GET', `/requirements/${reqId}`);
      if (r2 && r2.error) {
        failAssistLoading(loading, '读取失败: ' + r2.error);
        linkEl.classList.remove('loading');
        return;
      }
      let ref = null;
      try { ref = r2.assist_reference ? JSON.parse(r2.assist_reference) : null; } catch {}
      if (ref && ref.status === 'done' && ref.target_product === productName) {
        // 4. 渲染 reference-brief 替换 loading
        const html = window.ACMSAssists.get('reference').render(reqId, ref);
        replaceAssistLoading(loading, html);
        linkEl.classList.remove('loading');
        linkEl.classList.add('loaded');
        return;
      }
      if (ref && ref.status === 'failed') {
        failAssistLoading(loading, '生成失败: ' + (ref.error || '未知错误'));
        linkEl.classList.remove('loading');
        return;
      }
      // 更新进度（3 阶段）
      const stepIdx = Math.min(Math.floor(i / 10), 2);
      const sec = (i + 1) * 2;
      updateAssistLoadingProgress(loading, stepHints[stepIdx], sec);
    }
    // 超时
    failAssistLoading(loading, '生成超时（>120s），请刷新页面重试');
    linkEl.classList.remove('loading');
  } catch (e) {
    failAssistLoading(loading, '网络错误: ' + (e.message || String(e)));
    linkEl.classList.remove('loading');
  }
}

/** v0.6.4 通用 loading 卡片 — 链接触发打开辅助卡片时使用
 *  3 个配套函数:
 *    showAssistLoading({method, title, hint}) → 创建 loading 卡片 DOM
 *    updateAssistLoadingProgress(card, step, sec) → 更新进度
 *    replaceAssistLoading(loading, html) → 替换为结果（焦点跳转）
 *    failAssistLoading(loading, error) → 替换为错误态
 *  位置: 插在触发点的"紧邻下方"（同 container，dtBlock.after()）
 */
function showAssistLoading({ method, title, hint } = {}) {
  const card = document.createElement('div');
  card.className = `assist-loading-card method-${method || 'default'}`;
  card.dataset.method = method || 'default';  // v0.6.8 fix: 必设 data-method，renderAssistLayer 才能 querySelector 找到
  // v0.11 fix: 记录开始时间，让 startChatPolling 能计算 elapsed 更新进度（解决一直显示 0s 的 bug）
  card.dataset.startedAt = String(Date.now());
  card.innerHTML = `
    <div class="assist-loading-head">
      <span class="assist-loading-spinner">⏳</span>
      <span class="assist-loading-title">${escHtml(title || '加载中...')}</span>
    </div>
    ${hint ? `<div class="assist-loading-hint">${escHtml(hint)}</div>` : ''}
    <div class="assist-loading-progress">0s</div>
  `;
  return card;
}

function updateAssistLoadingProgress(loadingCard, stepHint, seconds) {
  if (!loadingCard) return;
  const titleEl = loadingCard.querySelector('.assist-loading-title');
  const progressEl = loadingCard.querySelector('.assist-loading-progress');
  if (titleEl && stepHint) titleEl.textContent = stepHint;
  if (progressEl) progressEl.textContent = `${seconds}s`;
}

function replaceAssistLoading(loadingCard, html) {
  if (!loadingCard || !loadingCard.parentNode) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const newCard = tmp.firstElementChild;
  if (newCard) {
    loadingCard.replaceWith(newCard);
    // 焦点跳转到新卡片
    newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    loadingCard.remove();
  }
}

function failAssistLoading(loadingCard, errorMsg) {
  if (!loadingCard || !loadingCard.parentNode) return;
  loadingCard.classList.add('assist-loading-error');
  loadingCard.innerHTML = `<div class="assist-loading-error-text">❌ ${escHtml(errorMsg || '生成失败')}</div>`;
}
