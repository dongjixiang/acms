// ===== 聊天 Assist 操作（v0.13 抽公共，2026-06-21）=====
// 抽自 client/js/views/requirements.js（原 L3535-3745，211 行）
//
// 跨文件依赖（重要！）：
//   - api / escHtml / toast / showConfirm（全局）
//   - chat 模块函数：connectAssistStream / showAssistLoading /
//     failAssistLoading / renderChatBubble / chatScrollToBottom /
//     chatSendSupplement（都在 chat.js）
//   - openRequirement（主文件）
//   - ACMSAssistDispatcher.useAssist（client/js/views/assists/dispatcher.js）
//   - window._chatState / _assistRenderCache / _explicitAssist（全局状态）
//   - HTML 字符串引用是延迟触发（用户点按钮时），script 顺序保证已加载 → OK
//
// 6 个函数：chatAssist / chatSendAssistPick / chatAssistRegen /
// chatSkipAssist / chatRewrite / chatDone
//
// v0.13 Bug 修复记录：第一次抽时把 chatAssist 错写成调 window.ACMSAssists[method].run()
// 实际原版走 connectAssistStream SSE 流式 + showAssistLoading 插 loading 卡片。
// 6 个函数全部从 git 历史 d5bac94^ 完整恢复，确保 0 行为变化。

async function chatAssist(reqId, method, extraBody) {
  // v0.6.7：累积模式 — 只清**同 method** 的旧卡片，保留其他 method 的卡片
  //   用户多次点不同按钮（决策树/场景/竞品/借鉴/痛点）→ 多张卡片共存
  //   用户重复点同 method → 替换为新卡片（防止累积多张同 method 卡片）
  const c = document.getElementById(`chat-stream-msgs-${reqId}`);
  if (c) {
    c.querySelectorAll(`.chat-assist-layer[data-assist-method="${method}"]`).forEach(el => el.remove());
    c.querySelectorAll(`.assist-loading-card[data-method="${method}"]`).forEach(el => el.remove());
  }
  // 清除缓存指纹，确保新卡片可以渲染
  if (window._assistRenderCache) {
    Object.keys(window._assistRenderCache).forEach(k => {
      if (k.startsWith(reqId + '_')) delete window._assistRenderCache[k];
    });
  }
  // 标记用户显式选择了哪个 assist（polling 用 — 监听该 method 是否完成）
  //   v0.6.7 累积模式：不再限制 renderAssistLayer 只渲染这一个 method
  if (!window._explicitAssist) window._explicitAssist = {};
  window._explicitAssist[reqId] = method;
  // v0.6.6：先插 loading 卡片到 chat-stream-msgs 末尾（最后一条聊天记录下方）
  //   标题用 method 中文名（用 methodTitles 跟 renderAssistLayer 保持一致）
  const methodTitles = { decision_tree:'🌳 决策树', scenarios:'👥 场景', tradeoff:'⚖️ 取舍', arch:'🏗️ 架构', diagnosis:'🩺 体检', visual:'🎨 视觉', competitive:'🏢 竞品', reference:'🏛 借鉴', pains:'🔥 痛点', stakeholders:'👥 干系人', risks:'⚠️ 风险', assumptions:'📌 假设', music:'🎵 音乐', video:'🎬 视频', image_gen:'🖼️ 图片', clean:'🧹 清理', screenplay:'📖 剧本' };
  if (c) {
    const loading = showAssistLoading({
      method,
      title: `正在生成${methodTitles[method] || method}…`,
      hint: '预计 10-30s · 加载中不影响你做其他操作',
    });
    c.appendChild(loading);
    loading.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  try {
    const body = extraBody || {};
    // v2.0: 用 SSE 替代 POST 触发，实现实时进度
    connectAssistStream(reqId, method, body);
  }
  catch(e) {
    // 触发失败 → loading 卡片就地变为错误态
    const loadingEl = c?.querySelector(`.assist-loading-card[data-method="${method}"]`);
    if (loadingEl) failAssistLoading(loadingEl, '触发失败: ' + e.message);
    toast('失败: '+e.message, 'error');
  }
}

/** pollAssistUntilDone 已合并到 startChatPolling（2026-06-14） */

async function chatSendAssistPick(reqId, method) {
  // v0.46 fix：优先查.chat-assist-layer（旧模式），fallback 到.chat-assist-result（聊天流内联渲染）
  const layer = document.querySelector(`#chat-stream-msgs-${reqId} .chat-assist-layer[data-assist-method="${method}"]`)
    || document.querySelector(`.chat-assist-result[data-assist-method="${method}"]`);
  if (!layer) return;
  // 支持多种选择模式
  const selOpts = layer.querySelectorAll('.chat-assist-option.selected');
  const selCards = layer.querySelectorAll('.chat-assist-clickable.selected');
  const selTradeoff = layer.querySelectorAll('.chat-assist-opt-clickable.selected');
  const selAssistCards = layer.querySelectorAll('.assist-card.selected');
  const selRefInsights = layer.querySelectorAll('.insight-block.selected');
  if (selOpts.length === 0 && selCards.length === 0 && selTradeoff.length === 0 && selAssistCards.length === 0 && selRefInsights.length === 0) { toast('请先选择选项', 'warning'); return; }

  let supplement = '';
  switch (method) {
    case 'decision_tree': {
      // 选中 1 个分支：label + desc + pros + cons
      const branch = selCards[0] || selAssistCards[0];
      if (branch && branch.classList.contains('dt-branch')) {
        const label = branch.querySelector('.dt-branch-label')?.textContent?.trim() || '';
        const desc = branch.querySelector('.dt-branch-desc')?.textContent?.trim() || '';
        const pros = branch.querySelector('.dt-pc-pro')?.textContent?.replace(/^\+/,'').trim() || '';
        const cons = branch.querySelector('.dt-pc-con')?.textContent?.replace(/^−/,'').trim() || '';
        const letter = branch.querySelector('.dt-branch-letter')?.textContent?.trim() || '';
        const examples = Array.from(branch.querySelectorAll('.dt-analogy-link')).map(a => a.textContent).join('、');
        let text = `我倾向于方向「${letter} ${label}」—— ${desc}`;
        if (pros) text += `。优势：${pros}`;
        if (cons) text += `；顾虑：${cons}`;
        if (examples) text += `。参考：${examples}`;
        supplement = text;
      }
      break;
    }
    case 'scenarios': {
      // 选中 1+ 场景卡片：title + persona + context + pain + goal + quote
      const parts = [];
      selAssistCards.forEach(card => {
        const title = card.querySelector('strong')?.textContent?.trim() || '';
        const persona = card.querySelector('.assist-card-meta')?.textContent?.replace(/^👤\s*/,'').trim() || '';
        const rows = card.querySelectorAll('.assist-card-row');
        const context = rows[0]?.textContent?.replace(/^背景：/,'').trim() || '';
        const pain = rows[1]?.textContent?.replace(/^痛点：/,'').trim() || '';
        const goal = rows[2]?.textContent?.replace(/^目标：/,'').trim() || '';
        const quote = card.querySelector('.assist-card-quote')?.textContent?.trim() || '';
        let t = `场景「${title}」：${persona}。背景：${context}。痛点：${pain}。目标：${goal}`;
        if (quote) t += `。用户原话：${quote}`;
        parts.push(t);
      });
      supplement = parts.join('\n');
      break;
    }
    case 'arch': {
      // 选中 1+ 模块：name + purpose + entry + elements
      const parts = [];
      selAssistCards.forEach(card => {
        const name = card.querySelector('strong')?.textContent?.trim() || '';
        const rows = card.querySelectorAll('.assist-card-row');
        const purpose = rows[0]?.textContent?.replace(/^用途：/,'').trim() || '';
        const entry = rows[1]?.textContent?.replace(/^入口：/,'').trim() || '';
        const elements = Array.from(card.querySelectorAll('.assist-arch-element')).map(e => e.textContent).join('、');
        let t = `需要模块「${name}」：${purpose}，入口${entry}`;
        if (elements) t += `，包含${elements}`;
        parts.push(t);
      });
      supplement = parts.join('\n');
      break;
    }
    case 'tradeoff': {
      // 每个维度选 1 边：axis + 选中option + context
      const parts = [];
      // 每个 .chat-assist-opt-clickable.selected 属于一个 .assist-card（一个维度）
      const optGroups = {};
      selTradeoff.forEach(opt => {
        const card = opt.closest('.assist-card');
        if (!card) return;
        const axis = card.querySelector('strong')?.textContent?.trim() || '';
        const option = opt.textContent?.replace(/^✅\s*/,'').trim() || '';
        if (!optGroups[axis]) optGroups[axis] = [];
        optGroups[axis].push(option);
      });
      for (const [axis, options] of Object.entries(optGroups)) {
        parts.push(`在「${axis}」上选择「${options.join('」/「')}」`);
      }
      supplement = parts.join('\n');
      break;
    }
    case 'reference': {
      // 借鉴卡片：选中理念 + 产品名
      const productEl = layer.querySelector('.brief-top h2');
      const productName = productEl?.textContent?.replace(/^🏛\s*/,'').replace(/\s*·\s*产品简报$/,'').trim() || '';
      const selected = layer.querySelectorAll('.insight-block.selected');
      const blocks = selected.length > 0 ? selected : layer.querySelectorAll('.insight-block');
      if (blocks.length > 0) {
        const parts = [`参考了${productName}的设计：`];
        blocks.forEach(b => {
          const title = b.querySelector('.label')?.textContent?.trim() || '';
          const desc = b.querySelector('.desc')?.textContent?.trim() || '';
          if (title) parts.push(`💡 ${title}：${desc}`);
        });
        supplement = parts.join('\n');
      }
      break;
    }
    default: {
      // 兜底：保持原有逻辑
      const labels = [];
      selOpts.forEach(el => labels.push(el.querySelector('.chat-opt-title')?.textContent?.trim()||''));
      selCards.forEach(el => {
        const t = el.querySelector('strong')?.textContent?.trim() || el.querySelector('.assist-card-letter')?.textContent?.trim() || '';
        if (t) labels.push(t);
      });
      selTradeoff.forEach(el => {
        const t = el.textContent?.trim();
        if (t) labels.push(t);
      });
      selAssistCards.forEach(el => {
        const t = el.querySelector('strong')?.textContent?.trim() || el.querySelector('.assist-card-letter')?.textContent?.trim() || '';
        if (t) labels.push(t);
      });
      supplement = `[${method}] ${labels.join('；')}`;
    }
  }

  if (!supplement) { toast('请先选择选项', 'warning'); return; }
  const c = document.getElementById(`chat-stream-msgs-${reqId}`);
  if (c) { renderChatBubble(c, {role:'user', text:supplement, at:new Date().toISOString()}); layer.remove(); c.insertAdjacentHTML('beforeend','<div class="chat-typing"><span></span><span></span><span></span></div>'); chatScrollToBottom(c); }
  chatSendSupplement(reqId, supplement, `${method}_pick`);
}

async function chatAssistRegen(reqId, method) {
  try { await api('POST', `/requirements/${reqId}/assist/${method}/regenerate`, {}); toast(`🔄 新${method}正在生成…`, 'info', 1500); }
  catch(e) { toast('失败: '+e.message, 'error'); }
}
// v0.6.8 fix: skip 也调 useAssist 标记后端 used=true，避免下次轮询 renderAssistLayer 重新渲染
//   之前只删 DOM 不调后端，累积模式下点过其他 method 就会把跳过的卡片又带回来
async function chatSkipAssist(btn) {
  const layer = btn.closest('.chat-assist-layer') || btn.closest('.chat-assist-result');
  if (!layer) return;
  const reqId = (layer.closest('[id^="chat-stream-msgs-"]') || {}).id?.replace('chat-stream-msgs-', '') || (window._chatState && Object.keys(window._chatState)[0]);
  const method = layer.dataset.assistMethod;
  layer.remove();
  if (reqId && method && window.ACMSAssistDispatcher?.useAssist) {
    try { await ACMSAssistDispatcher.useAssist(reqId, method, { action: 'skipped' }); } catch(e) { console.warn('[chatSkipAssist] useAssist failed:', e.message); }
  }
}

async function chatRewrite(reqId) {
  if (!await showConfirm('AI 会根据全部对话重新整理需求描述，确认？', {type:'info'})) return;
  try {
    await api('POST', `/requirements/${reqId}/rewrite-description`, {supplement:'', supplementSource:'idea_supplement'});
    toast('✅ 需求描述已更新', 'success');
    openRequirement(reqId);
  } catch(e) { toast('整理失败: ' + e.message, 'error'); }
}

async function chatDone(reqId) {
  if (!await showConfirm('确认想法已明确？AI 会整理全部对话更新需求描述，然后进入澄清阶段。', {type:'info'})) return;
  try {
    await api('POST', `/requirements/${reqId}/rewrite-description`, {supplement:'', supplementSource:'idea_supplement'});
    const r = await api('POST', `/requirements/${reqId}/transition`, {targetStatus:'clarifying'});
    if (r.error) { toast('进入澄清失败: ' + r.error, 'error'); return; }
    toast('✅ 进入澄清阶段', 'success', 2000);
    openRequirement(reqId);
    setTimeout(()=>{const p=document.getElementById('ai-clarify-panel'); if(p) p.scrollIntoView({behavior:'smooth',block:'start'});}, 300);
  } catch(e) { toast('操作失败: ' + e.message, 'error'); }
}
