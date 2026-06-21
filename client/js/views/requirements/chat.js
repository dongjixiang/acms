// ===== 聊天核心（v0.13 抽公共，2026-06-21）=====
// 抽自 client/js/views/requirements.js（原 L2207-3038，832 行）
//
// v0.3.6 对话式想法澄清 — 聊天流 + 辅助卡片层
// ════════════════════════════════════════════════════════════════
//
// 跨文件依赖（重要！）：
//   - api / escHtml / toast / showConfirm / App（全局）
//   - 主文件 requirements.js 中的 openRequirement / loadRequirements 等
//   - idea-panel.js：maybeLoadInsightPreviews / renderChatBubble 的子容器
//   - ai-state.js：triggerAiAutoSend 调 chatSend / applyAiDraft 用 _chatState
//   - brief-controls.js：maybeLoadInsightPreviews（用于 triggerInsightPreviews）
//   - chat-assist.js：chatAssist / chatSendAssistPick 调 renderAssistLayer /
//     connectAssistStream / chatRegen / chatBuildSupplementText
//   - chat-ui.js：chatSendSupplement 调 connectStreamingBrief
//   - ACMSThinkingBrief（client/js/views/assists/thinking-brief.js）
//
// 这是 chat 模块最大单块。所有 function 必须在 script 加载完成 +
// requirements.js 加载完成之前不能在 onclick 触发时被调用。HTML 字符串
// 引用是延迟触发（用户点按钮时），所有相关函数在那一刻已加载 → OK
//
// 模块内函数（30+ 个）：
//   - 核心 streaming：loadChatStream / startChatPolling / connectStreamingBrief
//   - 渲染：fmtLocalTime / renderChatBubble / renderBriefBubble / renderAssistLayer
//   - 卡片交互：chatToggleOpt / chatPickCard / chatToggleCard
//   - 附件：chatToggleAttachPopover / chatUploadTrigger / chatUploadRawFile /
//     chatUploadFile / chatHandlePaste / chatRemoveAttachment / chatPromoteAttachment /
//     chatRenderAttachPreview / chatBuildSupplementText
//   - 发送：chatSend
//   - 流式 assist：loadStreamAssist / connectAssistStream
//   - 重生成：chatRegen
//   - Misc：chatAutoGrow / toggleChatThinking

const _chatPollers = {};
const _chatState = {}; // reqId → { histCount, briefRound }

function chatAutoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 90) + 'px';
}

async function loadChatStream(reqId) {
  const container = document.getElementById(`chat-stream-msgs-${reqId}`);
  if (!container) return;
  container.innerHTML = '<div class="chat-typing"><span></span><span></span><span></span></div>';
  _chatState[reqId] = { histCount: 0, briefRound: 0 };

  try {
    const [histResp, briefResp] = await Promise.all([
      api('GET', `/requirements/${reqId}/supplement-history`),
      api('GET', `/requirements/${reqId}/thinking-brief`),
    ]);
    container.innerHTML = '';
    const history = histResp.history || [];
    for (const entry of history) renderChatBubble(container, entry);
    _chatState[reqId].histCount = history.length;

    const brief = briefResp.thinkingBrief;
    // v0.13 B5 fix: 强制设 state.briefRound（无论 status，避免 undefined）
    //   旧 bug：L3448 条件 brief.status === 'done' 才设；如果 loadChatStream 时 brief 在 generating
    //   → state.briefRound 永远是 undefined → triggerAiAutoSend L4278 fallback 到 0
    //   → polling 看到 briefRound > 0 总是满足 → 永远启动新倒计时
    _chatState[reqId].briefRound = brief?.chat_round || 0;
    if (brief && brief.status === 'done') {
      if (String(brief.chat_round) !== (container.lastElementChild?.dataset?.chatRound || '')) renderBriefBubble(container, brief);
    } else if (brief && brief.status === 'generating') {
      container.insertAdjacentHTML('beforeend', '<div class="chat-typing"><span></span><span></span><span></span></div>');
    }
    try { const r = await api('GET', `/requirements/${reqId}/assist`); renderAssistLayer(container, reqId, r.assists || {}); } catch(e) { console.warn('[loadChatStream] assist load error:', e.message); }
    chatScrollToBottom(container);
    startChatPolling(reqId);
  } catch (e) {
    container.innerHTML = `<div class="chat-bubble chat-bubble-ai"><div class="chat-bubble-meta"><span class="chat-label">⚠️</span></div>对话流加载失败：${escHtml(e.message)}</div>`;
  }
}

function startChatPolling(reqId) {
  if (_chatPollers[reqId]) clearInterval(_chatPollers[reqId]);
  let c = 0;
  _chatPollers[reqId] = setInterval(async () => {
    if (++c > 80) { clearInterval(_chatPollers[reqId]); delete _chatPollers[reqId]; return; }
    try {
      const container = document.getElementById(`chat-stream-msgs-${reqId}`);
      if (!container) { clearInterval(_chatPollers[reqId]); delete _chatPollers[reqId]; return; }
      const state = _chatState[reqId];
      if (!state) return;

      // 增量：只拉新增的 supplement_history
      const histResp = await api('GET', `/requirements/${reqId}/supplement-history`);
      const history = histResp.history || [];
      if (history.length > state.histCount) {
        for (let i = state.histCount; i < history.length; i++) renderChatBubble(container, history[i]);
        state.histCount = history.length;
        chatScrollToBottom(container);
      }

// 增量：检查 brief 更新（SSE 完成或轮询到 done）
      const briefResp = await api('GET', `/requirements/${reqId}/thinking-brief`);
      const brief = briefResp.thinkingBrief;
      const typing = container.querySelector('.chat-typing');
      const streamingBubble = container.querySelector('.chat-streaming-bubble');
      if (brief && brief.status === 'done' && !streamingBubble) {
        const briefRound = brief.chat_round || 0;

        // v0.13 B5 fix: auto 态检查放在 state.briefRound 更新之前
        //   否则 SSE done 已先更新 state.briefRound，polling 条件 `briefRound > state.briefRound` 会被跳过
        if (_aiGetState(reqId) === 'auto'
            && briefRound > (window._aiAutoLastRound[reqId] || 0)
            && !_aiAutoCountdowns[reqId]) {
          const input = document.getElementById(`chat-input-${reqId}`);
          const isInputEmpty = !input?.value?.trim();
          if (isInputEmpty) {
            console.log(`[ai-auto] ${reqId} polling 触发倒计时（briefRound=${briefRound}）`);
            // v0.13 B5 fix: AI 完成时显式 toast 告知"10 秒后自动回复"
            //   之前 5s 倒计时太短，用户来不及反应 → 体验"立即又 5 秒"
            //   现在 10s + 显式 toast 提示 → 用户有时间消化 + 可选 ↻ 跳过 / 选关闭停止
            toast(`🤖 AI 提问完成 · 10 秒后自动回复 · 点 ↻ 跳过 / 选「关闭」停止`, 'info', 4000);
            _aiStartAutoCountdown(reqId, briefRound);
          } else {
            _aiUpdateAutoIndicator(reqId, -1, window._aiAutoSentCount[reqId] || 0);
          }
        }

        if (briefRound > state.briefRound) {
          if (typing) typing.remove();
          renderBriefBubble(container, brief);
          state.briefRound = briefRound;
          chatScrollToBottom(container);
        }
      }

      // assist 层（移除旧层 + 加新层，始终只显示最新一张）
      const r = await api('GET', `/requirements/${reqId}/assist`);
      renderAssistLayer(container, reqId, r.assists || {});
      // 检测显式选中的 assist 是否完成（合并 pollAssistUntilDone）
      const explicit = window._explicitAssist?.[reqId];
      if (explicit) {
        const ad = r.assists?.[explicit];
        if (ad) {
          if (ad.status === 'done') {
            console.log(`[chatAssist] ${explicit} done, rendering`);
            if (window._explicitAssist) delete window._explicitAssist[reqId];
            renderAssistLayer(container, reqId, r.assists || {});
          } else if (ad.status === 'failed') {
            console.error(`[chatAssist] ${explicit} failed:`, ad.error || 'unknown');
            toast(`❌ ${explicit} 生成失败: ${ad.error || '未知错误'}`, 'error', 5000);
            if (window._explicitAssist) delete window._explicitAssist[reqId];
          } else {
            // 生成中：每 3 次轮询打一次日志
            if (c % 3 === 0) console.log(`[chatAssist] ${explicit} still ${ad.status} (tick #${c})`);
          }
        } else {
          // 数据还没写入（setImmediate 延迟）
          if (c % 3 === 0) console.log(`[chatAssist] ${explicit} waiting for data (tick #${c})`);
        }
      }
    } catch(e) {
      // v0.13 B5 fix: REQ_NOT_FOUND 时清理状态（req 已删除，避免持续报错 + 污染 state）
      if (e.message?.includes('REQ_NOT_FOUND')) {
        console.log(`[chatPoll] ${reqId} 已删除，清理状态`);
        clearInterval(_chatPollers[reqId]);
        delete _chatPollers[reqId];
        delete _chatState[reqId];
        delete window._aiAutoLastRound?.[reqId];
        delete window._aiAutoSentCount?.[reqId];
        delete window._aiAutoCountdowns?.[reqId];
        delete window._aiReplyState?.[reqId];
        delete window._aiAutoRunning?.[reqId];
        return;
      }
      console.warn('[chatPoll] polling error:', e.message);
    }
  }, 3000);
}

// v0.13 B5：本地时区格式化时间戳（之前 (entry.at).substring(11,16) 拿的是 UTC）
function fmtLocalTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch (e) { return ''; }
}

function renderChatBubble(container, entry) {
  const isAI = entry.role === 'assistant';
  const isSystem = entry.role === 'system';
  const parts = [];
  if (isAI) {
    if (entry.opening) parts.push(renderMarkdown(entry.opening));
    if (entry.followup_question) parts.push(`<div class="chat-response-q">${renderMarkdown(entry.followup_question)}</div>`);
  }
  const bodyHtml = parts.length
    ? parts.join('') + (entry.understanding
        ? `<div class="chat-thinking" style="display:none"><div class="chat-thinking-inner">${renderMarkdown(entry.understanding)}</div></div>`
        : '')
    : isSystem
      ? `<div class="chat-system-msg">${renderMarkdown(entry.text || '')}</div>`
      : `<div>${isAI ? renderMarkdown(entry.text || '') : escHtml(entry.text || '')}</div>`;

  // 用户气泡支持附件小芯片（v0.9）
  const userAttachHtml = (!isAI && entry.attachmentsHtml)
    ? `<div class="bubble-attachments">${entry.attachmentsHtml}</div>`
    : '';

  const hasThinking = isAI && entry.understanding;
  const div = document.createElement('div');
  div.className = `chat-bubble ${isAI ? 'chat-bubble-ai' : isSystem ? 'chat-bubble-system' : 'chat-bubble-user'}`;
  div.dataset.chatRound = entry.chat_round || '';
  div.innerHTML = `<div class="chat-bubble-meta"><span class="chat-label">${isAI ? '🤖 AI' : isSystem ? '📎 参考' : '💬 你'}</span><span class="chat-time">${fmtLocalTime(entry.at)}</span>${hasThinking ? '<span class="chat-thinking-btn" onclick="toggleChatThinking(this)">💭</span>' : ''}${isAI ? '<span class="chat-export-btn" onclick="chatExportWord(this)" title="导出为 Word 文档">📄</span>' : ''}</div>${bodyHtml}${userAttachHtml}`;
  container.appendChild(div);
}

function renderBriefBubble(container, brief) {
  if (!brief || brief.status !== 'done') return;
  const hasResponse = brief.opening || brief.followup_question;
  const hasThinking = brief.ai_understanding;
  const hasSuggest = brief.suggested_assist && brief.suggested_assist.method;
  if (!hasResponse && !hasThinking && !hasSuggest) return;

  let respHtml = '';
  if (brief.opening) respHtml += renderMarkdown(brief.opening);
  if (brief.followup_question) respHtml += `<div class="chat-response-q">${renderMarkdown(brief.followup_question)}</div>`;

  const thinkingHtml = hasThinking
    ? `<div class="chat-thinking" style="display:none"><div class="chat-thinking-inner">${renderMarkdown(brief.ai_understanding)}</div></div>`
    : '';

  const suggestHtml = hasSuggest
    ? `<div class="chat-assist-suggest" onclick="chatAssist('${container.id?.replace('chat-stream-msgs-', '') || ''}','${brief.suggested_assist.method}')">💡 ${escHtml(brief.suggested_assist.reason || '试试' + brief.suggested_assist.method)} →</div>`
    : '';

  const toggleAttr = hasThinking ? ` data-has-thinking="1"` : '';
  const div = document.createElement('div');
  div.className = 'chat-bubble chat-bubble-ai';
  div.innerHTML = `<div class="chat-bubble-meta"><span class="chat-label">🤖 AI</span><span class="chat-time">第${brief.chat_round||1}轮</span>${hasThinking ? '<span class="chat-thinking-btn" onclick="toggleChatThinking(this)">💭</span>' : ''}<span class="chat-export-btn" onclick="chatExportWord(this)" data-req-id="${escHtml(container.id?.replace('chat-stream-msgs-', '') || '')}" title="导出为 Word 文档">📄</span></div><div class="chat-response"${toggleAttr}>${respHtml}</div>${thinkingHtml}${suggestHtml}`;
  container.appendChild(div);
}

function toggleChatThinking(btn) {
  const bubble = btn.closest('.chat-bubble');
  const think = bubble?.querySelector('.chat-thinking');
  if (think) {
    const isHidden = think.style.display === 'none';
    think.style.display = isHidden ? 'block' : 'none';
    btn.style.opacity = isHidden ? '1' : '0.5';
  }
}

function renderAssistLayer(container, reqId, assists) {
  if (!assists || typeof assists !== 'object') return;

  // 跟踪已渲染的 assist 数据指纹，避免不必要重建（v0.3.6）
  if (!window._assistRenderCache) window._assistRenderCache = {};

  for (const method of ['diagnosis', 'reference', 'scenarios', 'tradeoff', 'arch', 'decision_tree', 'visual', 'competitive', 'pains', 'stakeholders', 'risks', 'assumptions', 'use_case', 'health_check']) {
    const d = assists[method];
    if (!d || d.status !== 'done' || d.used) continue;
    // v0.6.7 累积模式：不再 restrict 到 _explicitAssist method
    //   所有 method 的 done 卡片都渲染（用户点过的会累积显示，未点的也显示）
    // v0.13 B9：visual 跳过 round filter
    //   bug：REQ-MQFAYK2A 的 visual.generated_at_round=6，但 briefRound=0（req 在孵化阶段没产生过 brief）
    //   → 6 !== 0 → filter skip → 视觉卡片根本不渲染
    //   修：visual 是「方向图快照」，不是 chat 流相关辅助，应该一直可见直到用户 pick
    const chatStateRound = _chatState[reqId]?.briefRound;
    if (method !== 'visual'
        && typeof chatStateRound === 'number'
        && typeof d.generated_at_round === 'number'
        && d.generated_at_round !== chatStateRound) {
      if (method === 'decision_tree') console.log(`[assist.render] decision_tree SKIP round: generated=${d.generated_at_round} chatState=${chatStateRound}`);
      continue;
    }

    // 检查数据指纹：没变化就不重建（避免用户选中态丢失）
    // v0.3.6：+aspects+picked 确保借鉴卡片选中态变化能被检测到
    // v0.13 B10：+variants 让 visual regenerate 后能正确重新渲染
    //   bug：visual 数据变化只体现在 variants 上，但 fingerprint 不含 variants
    //   → regenerate 后 status/picked/used 全不变 → fingerprint 命中缓存 → 跳过渲染
    //   → 旧卡片留在 DOM，新生成的图永远看不到
    //   例：REQ-MQFAYK2A 重生成 3 张图（status=picked=used 不变）→ UI 不更新
    const fingerprint = JSON.stringify({ status: d.status, scenarios: d.scenarios, tree: d.tree, dimensions: d.dimensions, modules: d.modules, aspects: d.aspects, profile: d.profile, insights: d.insights, variants: d.variants, picked: d.picked, used: d.used });
    const cacheKey = `${reqId}_${method}`;
    if (window._assistRenderCache[cacheKey] === fingerprint) continue; // 没变化，跳过该方法
    window._assistRenderCache[cacheKey] = fingerprint;

    // 移除旧层（确定要重建时才删）
    container.querySelectorAll(`.chat-assist-layer[data-assist-method="${method}"]`).forEach(el => el.remove());

    // 使用原组件渲染器获取视觉内容，替换交互为对话流选择
    let innerHtml = '';
    const mod = window.ACMSAssists?.get?.(method);
      if (method === 'reference') console.log(`[assist.render] reference rendering, has mod:`, !!mod, `data mode:`, d?.mode, `status:`, d?.status);
      if (mod && mod.render) {
      if (method === 'decision_tree') console.log(`[assist.render] decision_tree rendering, tree items: ${d.tree?.length || 0}`);
      try {
        const raw = mod.render(reqId, d);
        // 去掉 regen/actions 行 + secondary 按钮，保留 pick 按钮
        let stripped = raw
          .replace(/<div class="assist-actions[\s\S]*?<\/div>/g, '')
          .replace(/<div class="assist-regen-row[\s\S]*?<\/div>/g, '')
          .replace(/<button class="btn-small btn-secondary[\s\S]*?<\/button>/g, '')
          .trim();
        // 保留 assist-intro
        stripped = stripped.replace(/class="assist-intro/g, 'class="assist-intro assist-intro-dialog"');

        // 场景/架构：保留 pick 按钮，替换 onclick 为对话流
        if (method === 'scenarios' || method === 'arch') {
          stripped = stripped
            .replace(/onclick="ACMSAssistDispatcher\.useAssist\([^)]+\)"/g, '')
            .replace(/<button class="btn-small[^"]*assist-pick-btn\s*"/g, '<button class="btn-small btn-primary" onclick="chatPickCard(\'' + reqId + '\',\'' + method + '\',this)"');
          // 场景/架构不设 clickable（通过按钮交互，点卡片内容不触发选择）
        } else {
          // 其他：去掉 pick 按钮，设 clickable
          stripped = stripped
            .replace(/<button class="(?:assist-pick-btn|btn-small btn-primary assist-pick-btn)[\s\S]*?<\/button>/g, '');
          if (method === 'decision_tree') {
            // v0.4 决策树用 .dt-branch；老 brief-branch 兼容（任何残留老卡片）
            // 注意：必须后跟 \s 或 "，避免误匹配 dt-branch-head/letter/label/desc/analogy
            stripped = stripped
              .replace(/class="dt-branch(\s|")/g, 'class="dt-branch chat-assist-clickable$1')
              .replace(/class="brief-branch(\s|")/g, 'class="brief-branch chat-assist-clickable$1');
          } else if (method === 'tradeoff') {
            stripped = stripped.replace(/<button class="assist-tradeoff-opt/g, '<span class="assist-tradeoff-opt chat-assist-opt-clickable"');
            stripped = stripped.replace(/<\/button>/g, '</span>');
          }
        }
        innerHtml = stripped;
      } catch (e) { innerHtml = `<div class="insight-error">❌ 渲染失败: ${e.message}</div>`; }
    } else {
      // 降级：简易标题
      const titles = { decision_tree:'🌳 决策树', scenarios:'👥 场景', tradeoff:'⚖️ 取舍', arch:'🏗️ 架构', diagnosis:'🩺 体检', visual:'🎨 视觉', competitive:'🏢 竞品', reference:'🏛 借鉴', pains:'🔥 痛点', stakeholders:'👥 干系人', risks:'⚠️ 风险', assumptions:'📌 假设', health_check:'🏥 需求体检', health_check:'🏥 需求体检' };
      innerHtml = `<div class="assist-section-title">${titles[method]||method}</div>`;
    }

if (!innerHtml.trim()) continue;

    const el = document.createElement('div');
    el.className = 'chat-assist-layer';
    el.dataset.assistMethod = method;
    // v0.13 fix: use_case 自带 apply/regen/discard 按钮，不附加 chat-assist-actions 重复按钮
    const chatActions = (method === 'use_case') ? '' :
      `<div class="chat-assist-actions" style="margin-top:10px"><button class="btn-small btn-accept" onclick="chatSendAssistPick('${reqId}','${method}')">✅ 发送选择</button><button class="btn-small" onclick="chatAssistRegen('${reqId}','${method}')">↻ 换一批</button><button class="btn-small" onclick="chatSkipAssist(this)">跳过</button></div>`;
    el.innerHTML = `${innerHtml}${chatActions}`;
    // v0.6.6：优先就地替换 .assist-loading-card（chatAssist 插的），否则 append 到末尾
    const loadingEl = container.querySelector(`.assist-loading-card[data-method="${method}"]`);
    if (loadingEl) {
      // 就地替换 — 用户视觉上看到 loading 卡片"变成"正式卡片（焦点跳到新卡片）
      loadingEl.replaceWith(el);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      container.appendChild(el);
    }
    // v0.6.7 累积模式：不 break，继续遍历下一个 method，每张都渲染
    //   （v0.3.6 "同一时间只显示一张卡片"已被累积模式替代）
  }
}

function chatToggleOpt(el) { el.classList.toggle('selected'); }

/** 点击卡片上的选择按钮（场景/架构）— 切换选中态 */
function chatPickCard(reqId, method, btn) {
  const card = btn.closest('[class*="assist-card"]');
  if (!card) return;
  const isSelected = card.classList.toggle('selected');
  btn.textContent = isSelected ? '✅ 已选' : '👆 我最像这个';
  btn.className = isSelected ? 'btn-small btn-primary' : 'btn-small';
}

/** 卡片选择切换（场景/决策树/架构等原组件卡片） */
function chatToggleCard(el, reqId, method) {
  el.classList.toggle('selected');
}

// 决策树/架构等卡片的点击选择委托（仅限 chat-assist-clickable，不干扰场景按钮）
// v0.3.6 D：决策树分支互斥（同一层内只能选一个）
document.addEventListener('click', function(e) {
  const target = e.target.closest('.chat-assist-clickable:not(.assist-card)');
  if (target && target.closest('.chat-assist-layer')) {
    // 决策树分支互斥：同层其他分支取消选中（v0.4 兼容 .dt-tree 和 .brief-tree）
    const tree = target.closest('.brief-tree, .dt-tree');
    if (tree) {
      tree.querySelectorAll('.chat-assist-clickable.selected').forEach(sib => sib.classList.remove('selected'));
    }
    target.classList.toggle('selected');
  }
  // v0.3.6 B：取舍清单选项（chat-assist-opt-clickable）独立委托
  // 同一维度内互斥（同一 .assist-card 内只能选一个）
  const opt = e.target.closest('.chat-assist-opt-clickable');
  if (opt && opt.closest('.chat-assist-layer')) {
    const card = opt.closest('.assist-card');
    if (card) {
      card.querySelectorAll('.chat-assist-opt-clickable').forEach(sib => sib.classList.remove('selected'));
    }
    opt.classList.add('selected');
  }
});

// ── 聊天附件（v0.9） ──
//   每个 reqId 一份待发附件队列；发送时清空
window._chatAttachments = window._chatAttachments || {};

const CHAT_UPLOAD_ACCEPT = {
  image: 'image/png,image/jpeg,image/jpg,image/gif,image/webp',
  pdf:   'application/pdf,.pdf',
  docx:  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx',
  text:  '.md,.txt,.log,.json,.yaml,.yml,.toml,.ini,.env,.js,.ts,.jsx,.tsx,.py,.java,.go,.rs,.rb,.php,.cs,.cpp,.c,.h,.hpp,.sh,.bash,.zsh,.ps1,.html,.css,.scss,.xml,.sql,.graphql,text/plain,text/markdown,application/json',
};

function chatToggleAttachPopover(reqId) {
  const pop = document.getElementById(`chat-input-popover-${reqId}`);
  if (!pop) return;
  const willOpen = pop.style.display === 'none';
  // 关闭其他打开的
  document.querySelectorAll('.chat-input-popover').forEach(el => { if (el !== pop) el.style.display = 'none'; });
  pop.style.display = willOpen ? 'block' : 'none';
}

function chatUploadTrigger(reqId, category) {
  const inp = document.getElementById(`chat-file-${reqId}`);
  if (!inp) return;
  inp.setAttribute('accept', CHAT_UPLOAD_ACCEPT[category] || '*/*');
  inp.dataset.category = category;
  // v0.13 B5 fix: 立即关掉 popover（用户取消文件选择后 popover 不会自动隐藏）
  const pop = document.getElementById(`chat-input-popover-${reqId}`);
  if (pop) pop.style.display = 'none';
  inp.click();
}

// 共享内部函数：上传单个 File 对象（v0.10 文件选择 + 剪贴板粘贴都走这里）
//   抽出来后，chatUploadFile 只负责从 input 取文件并清空，chatHandlePaste 只负责从剪贴板取文件
async function chatUploadRawFile(reqId, file, category = 'unknown') {
  if (!file) return;

  // 客户端大小兜底（与服务端一致）
  if (file.size > 20 * 1024 * 1024) {
    toast(`文件过大（${(file.size/1024/1024).toFixed(1)}MB），上限 20MB`, 'error');
    return;
  }

  // 显示"上传中"
  const tmpId = '_uploading_' + Date.now();
  const isVision = category === 'image';
  const waitLabel = isVision ? '🔍 AI 识别中...' : '⏳ 上传中...';
  chatRenderAttachPreview(reqId, [{ id: tmpId, name: file.name, size: file.size, mime: file.type, category, icon: '⏳', uploading: true, waitLabel }]);

  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', category);
    // 图片/PDF 解析可能较慢，给足超时（vision 最坏 30s，PDF 几秒）
    const ctrl = new AbortController();
    const timeoutMs = isVision ? 40000 : 20000;
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    const r = await fetch('/api/chat/upload', {
      method: 'POST',
      headers: { 'X-API-Key': 'dev-key-001' },
      body: fd,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = await r.json();
    if (!r.ok) {
      toast('上传失败: ' + (data.error || r.statusText), 'error');
      chatRemoveAttachment(reqId, tmpId);
      return;
    }
    // 替换占位
    const arr = (window._chatAttachments[reqId] || []).filter(a => a.id !== tmpId);
    arr.push(data);
    window._chatAttachments[reqId] = arr;
    chatRenderAttachPreview(reqId, arr);
    // 关闭 popover
    const pop = document.getElementById(`chat-input-popover-${reqId}`);
    if (pop) pop.style.display = 'none';
    // 解析失败的友好提示
    if (data.parseNote) {
      toast('⚠️ ' + data.parseNote, 'warning');
    } else if (data.extractedText) {
      // 解析成功的提示（轻量，避免刷屏）
      const summary = data.extractedText.slice(0, 30).replace(/\n/g, ' ');
      console.log(`[chat-upload] ✅ ${data.name} 解析: ${data.extractedText.length} 字`);
    }
  } catch (e) {
    const msg = e.name === 'AbortError' ? '请求超时（解析太慢）' : '上传异常: ' + e.message;
    toast(msg, 'error');
    chatRemoveAttachment(reqId, tmpId);
  }
}

// 从文件 input 选择上传（v0.9 📎 → popover → 选文件走这里）
//   v0.13 B5: 支持多文件上传（input multiple），循环处理每个文件
async function chatUploadFile(reqId, input) {
  const files = Array.from(input.files || []);
  if (files.length === 0) return;
  const category = input.dataset.category || 'unknown';
  for (const file of files) {
    await chatUploadRawFile(reqId, file, category);
  }
  input.value = '';  // 重置 input，允许重复选同一文件
}

// 剪贴板粘贴上传（v0.10 截图直接 Ctrl+V 走这里）
//   只在 textarea 上挂监听，避免污染全局；只拦截 image 类型，纯文本粘贴照常工作
function chatHandlePaste(reqId, ev) {
  if (!ev.clipboardData) return;
  const items = ev.clipboardData.items;
  if (!items || items.length === 0) return;

  // 收集所有 image 类型文件（一次粘贴可能含多张）
  const files = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.kind === 'file' && it.type && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length === 0) return;  // 没有图片 → 让浏览器按默认行为处理（粘贴文本）

  // 阻止图片二进制 / 文件名塞进 textarea
  ev.preventDefault();

  // 剪贴板文件没 name，给一个时间戳命名方便追溯
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  files.forEach((f, idx) => {
    if (!f.name || f.name === 'image.png') {
      const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      f.name = files.length > 1
        ? `screenshot-${ts}-${idx + 1}.${ext}`
        : `screenshot-${ts}.${ext}`;
    }
    chatUploadRawFile(reqId, f, 'image');
  });

  if (files.length > 1) {
    toast(`✓ 已粘贴 ${files.length} 张图片`, 'success');
  }
}

function chatRemoveAttachment(reqId, attachId) {
  const arr = (window._chatAttachments[reqId] || []).filter(a => a.id !== attachId);
  window._chatAttachments[reqId] = arr;
  chatRenderAttachPreview(reqId, arr);
}

// 把聊天附件沉淀到项目知识库（v0.9）
//   默认不入库；用户主动点 📥 触发
//   成功后按钮变 ✓ 并禁用
async function chatPromoteAttachment(reqId, uploadId, btn) {
  const arr = window._chatAttachments[reqId] || [];
  const att = arr.find(a => a.id === uploadId);
  if (!att || att.promoted) return;
  // 防双击
  if (btn) { btn.style.pointerEvents = 'none'; btn.textContent = '⏳'; }
  try {
    const r = await fetch(`/api/chat/upload/${uploadId}/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify({ reqId }),
    });
    const data = await r.json();
    if (!r.ok) {
      toast('存入失败: ' + (data.error || r.statusText), 'error');
      if (btn) { btn.style.pointerEvents = ''; btn.textContent = '📥'; }
      return;
    }
    // 标记已沉淀
    att.promoted = true;
    if (btn) { btn.textContent = '✓'; btn.title = '已存入知识库'; btn.classList.add('done'); }
    toast('✓ 已存入知识库', 'success');
  } catch (e) {
    toast('存入异常: ' + e.message, 'error');
    if (btn) { btn.style.pointerEvents = ''; btn.textContent = '📥'; }
  }
}

function chatRenderAttachPreview(reqId, arr) {
  const box = document.getElementById(`chat-attach-preview-${reqId}`);
  if (!box) return;
  if (!arr || !arr.length) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
box.style.display = 'flex';
  box.innerHTML = arr.map(a => {
    const sizeStr = a.size < 1024 ? `${a.size}B` : a.size < 1024*1024 ? `${(a.size/1024).toFixed(1)}KB` : `${(a.size/1024/1024).toFixed(2)}MB`;
    const thumb = a.category === 'image' && a.url
      ? `<img src="${a.url}" alt="">`
      : a.icon;
    const cls = a.uploading ? 'attach-card uploading' : 'attach-card';
    // v0.13 B5 fix: 文件名加 <a> 链接，点击打开新窗口预览/下载
    const fileUrl = a.id ? `/api/chat/upload/${encodeURIComponent(a.id)}/raw` : '#';
    const nameHtml = a.uploading
      ? `<div class="attach-name" title="${escHtml(a.name)}">${escHtml(a.name)}</div>`
      : `<div class="attach-name" title="${escHtml(a.name)}"><a href="${fileUrl}" target="_blank" rel="noopener">${escHtml(a.name)}</a></div>`;
    return `
      <div class="${cls}" data-id="${a.id}">
        <div class="attach-thumb">${thumb}</div>
        <div class="attach-info">
          ${nameHtml}
          <div class="attach-meta">${a.uploading ? (a.waitLabel || '⏳ 上传中...') : sizeStr + (a.extractedText ? ' · ' + a.extractedText.length + '字' : (a.parseNote ? ' · ⚠️ ' + a.parseNote : ''))}</div>
        </div>
        ${a.uploading ? '' : `<span class="attach-promote${a.promoted ? ' done' : ''}" onclick="chatPromoteAttachment('${reqId}','${a.id}', this)" title="${a.promoted ? '已存入知识库' : '存入知识库'}">${a.promoted ? '✓' : '📥'}</span>`}
        <span class="attach-x" onclick="chatRemoveAttachment('${reqId}','${a.id}')" title="移除">✕</span>
      </div>
    `;
  }).join('');
  // 高亮 📎 按钮
  const btn = document.getElementById(`chat-attach-btn-${reqId}`);
  if (btn) btn.classList.toggle('has-attach', arr.length > 0);
}

// 构造把附件内容拼到消息的文本（v1 简化：直接拼正文，不做引用块）
function chatBuildSupplementText(reqId, userText) {
  const arr = window._chatAttachments[reqId] || [];
  const parts = [];
  if (userText) parts.push(userText);
  if (arr.length) {
    parts.push('\n\n---\n📎 附件内容：\n');
    for (const a of arr) {
      if (a.extractedText) {
        parts.push(`\n[${a.name}]\n${a.extractedText}\n`);
      } else if (a.category === 'image') {
        parts.push(`\n[图片：${a.name}，${a.size}B]\n`);
      } else if (a.category === 'pdf') {
        parts.push(`\n[PDF：${a.name}，${a.size}B — v1 未解析正文]\n`);
      } else {
        parts.push(`\n[附件：${a.name}]\n`);
      }
    }
  }
  return parts.join('');
}

async function chatSend(reqId) {
  const input = document.getElementById(`chat-input-${reqId}`);
  const text = input?.value?.trim();
  const attachments = window._chatAttachments[reqId] || [];
  if (!text && !attachments.length) { toast('先写点想法或添加附件', 'warning'); return; }
  const finalText = chatBuildSupplementText(reqId, text);

  const c = document.getElementById(`chat-stream-msgs-${reqId}`);
  if (c) {
    // 用户气泡显示原文 + 附件小芯片
    const userBubbleAttachments = attachments.map(a => {
      const icon = a.icon || '📎';
      return `<span class="attach-chip">${icon} ${escHtml(a.name)}</span>`;
    }).join('');
    const userBubbleText = text || (attachments.length ? '📎 ' + attachments.length + ' 个附件' : '');
    renderChatBubble(c, {
      role: 'user',
      text: userBubbleText,
      attachmentsHtml: userBubbleAttachments,
      at: new Date().toISOString(),
    });
    c?.querySelectorAll('.chat-assist-layer').forEach(el => el.remove());
    chatScrollToBottom(c);
  }
  if (input) { input.value = ''; input.style.height = 'auto'; }
  // 清空附件
  window._chatAttachments[reqId] = [];
  chatRenderAttachPreview(reqId, []);

  // v0.13 B5 fix: 加 await 让 chatSend 等 POST 真正完成
  //   之前 fire-and-forget → triggerAiAutoSend 内的 await chatSend 立即 resolve
  //   → _aiAutoSentCount++ / "已自动发送 N 轮" 日志与"消息真正发出去"不同步
  //   → 与重入保护配合，确保一轮 send 真正结束再开始下一轮
  // v0.14：检测 URL → 走 send-with-fetch 路径（server 抓取 + 预搜注入）
  const urls = extractUrls(text);
  if (urls.length > 0) {
    await chatSendWithFetch(reqId, finalText, urls);
  } else {
    await chatSendSupplement(reqId, finalText, 'idea_supplement');
  }
}

/**
 * v0.14：检测文本中的 URL（http/https 开头）
 * 返回去重后的 URL 数组
 */
function extractUrls(text) {
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s<>"'，。、；！？)\]]+/g) || [];
  // 去重
  return Array.from(new Set(matches));
}

/**
 * v0.14：发送带 URL 抓取的聊天消息
 * 流程：
 *   1. 插入「🌐 抓取中」状态卡到 chat 流
 *   2. 调 POST /api/chat/send-with-fetch
 *   3. 成功后：状态卡变「📎 参考资料」卡（带「📚 加入知识库」按钮）
 *   4. 失败：状态卡变错误提示 + toast，AI 仍正常回答
 */
async function chatSendWithFetch(reqId, text, urls) {
  const c = document.getElementById(`chat-stream-msgs-${reqId}`);

  // 1. 插入「🌐 抓取中」状态卡
  let statusCard = null;
  if (c) {
    statusCard = document.createElement('div');
    statusCard.id = `chat-fetch-status-${reqId}`;
    statusCard.className = 'chat-fetch-status';
    statusCard.innerHTML = `
      <div class="chat-fetch-header">🌐 正在抓取 ${urls.length} 个外部链接…</div>
      <ul class="chat-fetch-list">
        ${urls.map(u => `<li><span class="chat-fetch-url">${escHtml(u)}</span> <span class="chat-fetch-spinner">⏳</span></li>`).join('')}
      </ul>
      <div class="chat-fetch-note">预计 10-30s · 抓取中不影响你做其他操作</div>
    `;
    c.appendChild(statusCard);
    chatScrollToBottom(c);
  }

  try {
    const resp = await fetch('/api/chat/send-with-fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify({ reqId, text, urls }),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${resp.status}`);
    }
    const data = await resp.json();

    // 2. 状态卡就地变「📎 参考资料」卡
    if (statusCard && c) {
      statusCard.id = `chat-fetch-results-${reqId}`;
      statusCard.className = 'chat-fetch-results';
      const itemsHtml = (data.fetchResults || []).map((r, i) => {
        if (!r.ok) {
          return `<div class="chat-fetch-item error">
            <div class="chat-fetch-url-row"><span class="chat-fetch-url-icon">⚠️</span> <span class="chat-fetch-url">${escHtml(r.url)}</span></div>
            <div class="chat-fetch-err">抓取失败：${escHtml(r.error || '未知错误')}</div>
            <div class="chat-fetch-note">AI 仍会基于你的消息回答</div>
          </div>`;
        }
        // 注意：onclick 参数里嵌 URL 可能有引号问题，用 dataset 存 URL
        return `<div class="chat-fetch-item ok" data-url="${escHtml(r.url)}" data-title="${escHtml(r.title || '')}" data-summary="${escHtml(r.summary || '')}" data-idx="${i}">
          <div class="chat-fetch-url-row">📎 <span class="chat-fetch-title">${escHtml(r.title || r.url)}</span></div>
          <div class="chat-fetch-meta">字数：${r.length}${r.truncated ? '（已截断）' : ''} · ${escHtml(r.url)}</div>
          <div class="chat-fetch-summary">${renderMarkdown(r.summary || '')}</div>
          <div class="chat-fetch-actions">
            <button class="btn-small chat-fetch-promote" onclick="chatPromoteFetchedUrl('${reqId}', this)">📚 加入项目知识库</button>
            <button class="btn-small" onclick="this.closest('.chat-fetch-item').remove()">× 关闭</button>
          </div>
        </div>`;
      }).join('');
      statusCard.innerHTML = itemsHtml;
    }

    toast(`✅ 已抓取 ${data.fetchResults.filter(r => r.ok).length}/${data.fetchResults.length} 个链接`, 'success', 2000);

    // v0.14 fix: 提前把已渲染的 server 条目计入 histCount，
    //   避免 startChatPolling 后拉 supplement_history 又把 user/system 条目渲染成气泡
    const state = _chatState[reqId];
    if (state) {
      // 写入数 = 1（user）+ N（system，每 URL 一条）+ 1（assistant，如果 0.5 步存了旧 brief）
      const assistantExtra = (state.briefRound > 0) ? 1 : 0;
      state.histCount += 1 + assistantExtra + data.fetchResults.length;
    }

    // v0.14 fix: 启动轮询，让用户看到 AI 正在回复的流式气泡
    //   之前缺这段 → 用户看不到反馈 → 以为没发成功又点了一次 → 消息被发 2 次
    setTimeout(() => startChatPolling(reqId), 500);
  } catch (e) {
    // 3. 失败：状态卡变错误提示，toast 提示，但**不抛错**（AI 仍可回答）
    if (statusCard) {
      statusCard.className = 'chat-fetch-status error';
      statusCard.innerHTML = `<div class="chat-fetch-err">❌ 抓取请求失败：${escHtml(e.message)}</div>
        <div class="chat-fetch-note">AI 仍会基于你的消息回答（不包含链接内容）</div>`;
    }
    toast('URL 抓取失败，AI 将基于你的消息回答', 'warning', 2000);
  }
}

  /**
   * v0.14：「📚 加入项目知识库」按钮回调
   * 调 POST /api/chat/url-promote 把抓取结果沉淀到 knowledge_files
   */
  async function chatPromoteFetchedUrl(reqId, btn) {
    const item = btn.closest('.chat-fetch-item');
    if (!item) return;
    const url = item.dataset.url;
    const title = item.dataset.title || '';
    const summary = item.dataset.summary || '';
    if (!url) return;

    // 防双击
    if (btn.disabled) return;
    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = '⏳ 存入中…';

    try {
      const resp = await fetch('/api/chat/url-promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
        body: JSON.stringify({ reqId, url, title, summary }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${resp.status}`);
      }
      btn.textContent = '✓ 已加入';
      btn.classList.add('done');
      toast('✅ 已存入项目知识库', 'success', 2000);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = origText;
      toast('存入失败: ' + e.message, 'error');
    }
  }

/** 连接 SSE 流式思路简报 */
function connectStreamingBrief(reqId, container) {
  // 创建或复用 streaming 气泡
  let streamingBubble = container?.querySelector('.chat-streaming-bubble');
  if (!streamingBubble && container) {
    streamingBubble = document.createElement('div');
    streamingBubble.className = 'chat-bubble chat-bubble-ai chat-streaming-bubble';
    // v2.0: 流式渐进渲染结构
    streamingBubble.innerHTML = '<div class="chat-bubble-meta"><span class="chat-label">🤖 AI</span></div>'
      + '<div class="chat-streaming-opening"></div>'
      + '<div class="chat-streaming-thinking" style="display:none"><div class="chat-thinking-inner"></div></div>'
      + '<div class="chat-streaming-followup" style="display:none"></div>';
    container.appendChild(streamingBubble);
    chatScrollToBottom(container);
  }
  const openingEl = streamingBubble?.querySelector('.chat-streaming-opening');
  const thinkingInnerEl = streamingBubble?.querySelector('.chat-streaming-thinking .chat-thinking-inner');
  const followupEl = streamingBubble?.querySelector('.chat-streaming-followup');
  if (!openingEl) return;

  const es = new EventSource(`/api/requirements/${reqId}/thinking-brief/stream?api_key=dev-key-001`);

  es.addEventListener('message', (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'opening') {
        openingEl.innerHTML = renderMarkdown(openingEl.textContent + data.text);
        chatScrollToBottom(container);
      } else if (data.type === 'thinking') {
        if (!thinkingInnerEl) return;
        const thinkingBubble = streamingBubble?.querySelector('.chat-streaming-thinking');
        if (thinkingBubble) thinkingBubble.style.display = '';
        thinkingInnerEl.innerHTML = renderMarkdown(thinkingInnerEl.textContent + data.text);
      } else if (data.type === 'followup') {
        if (!followupEl) return;
        followupEl.style.display = '';
        followupEl.innerHTML = '<i>' + escHtml(followupEl.textContent + data.text) + '</i>';
        chatScrollToBottom(container);
      } else if (data.type === 'token') {
        // 兼容旧事件类型
        openingEl.textContent += data.text;
        chatScrollToBottom(container);
      } else if (data.type === 'done' && data.brief) {
        es.close();
        // 同步 briefRound，避免轮询重复渲染
        // 流完成 → 把 raw JSON 替换为自然回复 + 可折叠思考
        const state = _chatState[reqId];
        if (state) state.briefRound = data.brief.chat_round || 0;
        let respHtml = '';
        if (data.brief.opening) respHtml += renderMarkdown(data.brief.opening);
        if (data.brief.followup_question) respHtml += `<div class="chat-response-q">${renderMarkdown(data.brief.followup_question)}</div>`;
        const thinkingHtml = data.brief.ai_understanding
          ? `<div class="chat-thinking" style="display:none"><div class="chat-thinking-inner">${renderMarkdown(data.brief.ai_understanding)}</div></div>`
          : '';
        const suggestHtml = data.brief.suggested_assist?.method
          ? `<div class="chat-assist-suggest" onclick="chatAssist('${reqId}','${data.brief.suggested_assist.method}')">💡 ${escHtml(data.brief.suggested_assist.reason || '试试' + data.brief.suggested_assist.method)} →</div>`
          : '';
        streamingBubble.className = 'chat-bubble chat-bubble-ai';
        streamingBubble.innerHTML = `<div class="chat-bubble-meta"><span class="chat-label">🤖 AI</span><span class="chat-time">第${data.brief.chat_round||1}轮</span>${data.brief.ai_understanding ? '<span class="chat-thinking-btn" onclick="toggleChatThinking(this)">💭</span>' : ''}<span class="chat-export-btn" onclick="chatExportWord(this)" data-req-id="${escHtml(container.id?.replace('chat-stream-msgs-', '') || '')}" title="导出为 Word 文档">📄</span></div><div class="chat-response">${respHtml}</div>${thinkingHtml}${suggestHtml}`;
        delete streamingBubble.dataset.streaming;
        // v0.13 B5 fix: 同步 dataset.chatRound，避免 polling 误判为新轮次重复渲染
        streamingBubble.dataset.chatRound = String(data.brief.chat_round || 0);
        chatScrollToBottom(container);
        // 只保留 suggested_assist（气泡底部的 💡 链接），不自动触发
        // auto_assist 逻辑已移除（2026-06-14：用户自主点击更可靠）
        // 尝试加载 assist
        loadStreamAssist(reqId, container);
        // v0.13 B5 fix: SSE done 是「AI 这一轮回复真正结束」的唯一可靠信号
        //   取代 polling 的 brief.status==='done' && !streamingBubble 竞态检测
        //   bug：polling 在后端 brief 完成到 SSE 首个 token 之间窗口误判 → 倒计时提前
        //   新：SSE done handler 内直接触发倒计时，倒计时输入空 + auto 态才启动
        window._aiSseDone = window._aiSseDone || {};
        const sseDoneRound = data.brief.chat_round || 0;
        window._aiSseDone[reqId] = sseDoneRound;
        if (_aiGetState(reqId) === 'auto'
            && sseDoneRound > (window._aiAutoLastRound[reqId] || 0)
            && !_aiAutoCountdowns[reqId]) {
          const input = document.getElementById(`chat-input-${reqId}`);
          if (input && !input.value.trim()) {
            console.log(`[ai-auto] ${reqId} SSE done 触发倒计时（round=${sseDoneRound}）`);
            toast('🤖 AI 提问完成 · 10 秒后自动回复 · 点 ↻ 跳过 / 选「关闭」停止', 'info', 4000);
            _aiStartAutoCountdown(reqId, sseDoneRound);
          }
        }
      } else if (data.type === 'error') {
        es.close();
        openingEl.textContent = '⚠️ ' + (data.message || '生成失败');
        // v0.13 B5 fix: 与 SSE error 同处理 — 拆掉 .chat-streaming-bubble class
        //   不然 polling 永远查到 streamingBubble → 永远不启动倒计时
        streamingBubble.className = 'chat-bubble chat-bubble-ai chat-bubble-error';
        delete streamingBubble.dataset.streaming;
        streamingBubble.dataset.streaming = 'done';
      }
    } catch (e) { /* JSON parse error */ }
  });

  es.addEventListener('error', () => {
    es.close();
    if (streamingBubble?.dataset?.streaming !== 'done') {
      openingEl.textContent += '\n⚠️ 连接中断';
      // v0.13 B5 fix: SSE 错误也算「AI 这一轮结束」（虽然失败）
      //   不然 streamingBubble 永远卡在 DOM（带 .chat-streaming-bubble class）
      //   → polling 每次都查到 streamingBubble → !streamingBubble 永远 false
      //   → 永远不启动倒计时 → 自动回复卡死
      streamingBubble.className = 'chat-bubble chat-bubble-ai chat-bubble-error';
      streamingBubble.dataset.streaming = 'done';
      // 兜底信号：让 polling 知道这一轮已结束（即便失败）
      window._aiSseDone = window._aiSseDone || {};
      window._aiSseDone[reqId] = _chatState[reqId]?.briefRound || 0;
    }
  });
}

/** 流完成后再拉一笔 assist */
async function loadStreamAssist(reqId, container) {
  try {
    const r = await api('GET', `/requirements/${reqId}/assist`);
    renderAssistLayer(container, reqId, r.assists || {});
  } catch(e) { console.warn('[loadStreamAssist] error:', e.message); }
}

/**
 * v2.0: 辅助手段 SSE 流式 — 实时进度 + 完成通知
 * 调用后由 polling 负责实际渲染结果卡片
 */
function connectAssistStream(reqId, method, extraBody) {
  const container = document.getElementById(`chat-stream-msgs-${reqId}`);
  
  // 先通过 POST 触发后端 job（setImmediate 异步跑）
  api('POST', `/requirements/${reqId}/assist/${method}`, extraBody || {}).then(() => {
    // POST 成功，开 SSE 看进度
    const es = new EventSource(`/api/requirements/${reqId}/assist/${method}/stream?api_key=dev-key-001`);
    
    es.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'progress') {
          // 更新 loading 卡片的提示和计时
          const loadingEl = container?.querySelector(`.assist-loading-card[data-method="${method}"]`);
          if (loadingEl) {
            const hintEl = loadingEl.querySelector('.assist-loading-hint');
            if (hintEl) hintEl.textContent = data.text;
            // 更新计时
            const progressEl = loadingEl.querySelector('.assist-loading-progress');
            if (progressEl) {
              const startedAt = parseInt(loadingEl.dataset.startedAt || '0', 10);
              const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
              progressEl.textContent = elapsed + 's';
            }
          }
        } else if (data.type === 'done') {
          es.close();
          // 移除 loading 卡片（polling 会渲染真实结果）
          const loadingEl = container?.querySelector(`.assist-loading-card[data-method="${method}"]`);
          if (loadingEl) loadingEl.remove();
          toast(`✅ ${method} 完成`, 'success', 1500);
          startChatPolling(reqId);
        } else if (data.type === 'error') {
          es.close();
          const loadingEl = container?.querySelector(`.assist-loading-card[data-method="${method}"]`);
          if (loadingEl) failAssistLoading(loadingEl, data.message || '生成失败');
        }
      } catch {}
    });

    es.addEventListener('error', () => {
      es.close();
      // SSE 断连，回退到 polling
      startChatPolling(reqId);
    });
  }).catch(e => {
    // POST 失败
    const loadingEl = container?.querySelector(`.assist-loading-card[data-method="${method}"]`);
    if (loadingEl) failAssistLoading(loadingEl, '触发失败: ' + e.message);
    toast('失败: '+e.message, 'error');
  });
}

async function chatRegen(reqId) {
  if (!await showConfirm('重新生成思路会消耗 token，确认？', {type:'info'})) return;
  try {
    // 清理旧的 streaming 气泡和 assist 层
    const c = document.getElementById(`chat-stream-msgs-${reqId}`);
    if (c) {
      c.querySelectorAll('.chat-assist-layer').forEach(el=>el.remove());
      c.querySelectorAll('.chat-streaming-bubble').forEach(el=>el.remove());
    }
    // 开 SSE 流式重新生成
    connectStreamingBrief(reqId, c);
  } catch(e) { toast('失败: '+e.message, 'error'); }
}



