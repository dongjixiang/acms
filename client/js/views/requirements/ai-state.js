// ===== AI 自动回复状态机（v0.13 抽公共，2026-06-21）=====
// 抽自 client/js/views/requirements.js（原 L3046-3533，488 行）
//
// v0.13 B5 核心：AI 自动回复的 3 态切换（off / draft / auto）+ 倒计时 + 方向 checkpoint
// 活跃修改区，最近 6/19-6/20 多轮 fix（见各函数注释）
//
// 跨文件依赖：
//   - api / escHtml / toast / showConfirm（全局）
//   - chatAutoGrow / chatSend（chat 区域，HTML 引用）
//   - _chatState（chat 区域 const，L2211）
//   - window._aiReplyState / _aiAutoRunning / _aiDraftBeforeAI /
//     _aiAutoLastRound / _aiAutoSentCount / _aiAutoCountdowns（全局对象，
//     本文件设置 + 其他模块读）
//   - document.addEventListener 监听 popover 外部点击 + Esc 关闭

// v0.13 B5：AI 回复模式按钮（3 态）+ popover — 全局状态定义
// 必须先于 _ai* 函数定义（_aiGetState 读 _aiReplyState）
window._aiReplyState = window._aiReplyState || {};
window._aiDraftBeforeAI = window._aiDraftBeforeAI || {};
// v0.13 B5：自动态持续生效 — 倒计时 + 计数 + 最后轮次
window._aiAutoCountdowns = window._aiAutoCountdowns || {}; // reqId → { timerId, deadlineMs, chatRound }
window._aiAutoSentCount = window._aiAutoSentCount || {};   // reqId → 已自动发送次数
window._aiAutoLastRound = window._aiAutoLastRound || {};   // reqId → 上次自动触发的 brief chat_round

function _aiGetState(reqId) {
  return window._aiReplyState[reqId] || 'off';
}
function _aiSetState(reqId, state) {
  window._aiReplyState[reqId] = state;
  _aiRenderBtn(reqId);
}
function _aiRenderBtn(reqId) {
  const btn = document.getElementById(`ai-mode-btn-${reqId}`);
  if (!btn) return;
  const state = _aiGetState(reqId);
  btn.classList.remove('btn-ai-off', 'btn-ai-draft', 'btn-ai-auto');
  btn.classList.add('btn-ai-' + state);
  // 同步 popover 高亮
  const popover = document.getElementById(`ai-popover-${reqId}`);
  if (popover) {
    popover.querySelectorAll('.ai-reply-popover-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.mode === state);
    });
  }
}

// 点 AI 模式按钮 → 弹 popover
// 名字避开浏览器原生 HTMLElement.togglePopover() 冲突（v0.13 B5 mockup bugfix）
async function showAiPopover(e, reqId) {
  if (e) e.stopPropagation();

  // 自动态下再点 ↻ = 直接发送（不经确认）
  if (_aiGetState(reqId) === 'auto') {
    await triggerAiAutoSend(reqId);
    return;
  }

  // 关闭其他 req 的 popover
  document.querySelectorAll('.ai-reply-popover.show').forEach(p => {
    if (p.id !== `ai-popover-${reqId}`) p.classList.remove('show');
  });

  const popover = document.getElementById(`ai-popover-${reqId}`);
  if (!popover) return;
  const wasOpen = popover.classList.contains('show');
  popover.classList.toggle('show');
  if (!wasOpen) _aiRenderBtn(reqId); // 同步高亮
}

function closeAiPopover(reqId) {
  const popover = document.getElementById(`ai-popover-${reqId}`);
  if (popover) popover.classList.remove('show');
}

// 用户选某个态
async function selectAiMode(mode, reqId) {
  closeAiPopover(reqId);

  if (mode === _aiGetState(reqId)) return; // 没变化

  if (mode === 'off') {
    // v0.13 B5 fix: 关闭态不再调 chatRegen
    //   旧行为：用户点「关闭」→ 自动跑 chatRegen → 触发后端 briefServiceRegen.runBriefJob
    //   → brief 完成 → 路由器 pickNext 自动选 1 种 assist → 后台跑
    //   用户体验：「刷新/选关闭后辅助功能自动跑」+「我明明选了关闭为什么 AI 还在工作」
    //   新行为：仅关闭 auto 态（取消倒计时 + 隐藏指示条），AI 立即停手
    _aiCancelAutoCountdown(reqId, 'user selected close');
    _aiHideAutoIndicator(reqId);
    _aiSetState(reqId, 'off');
    toast('⏸ 已退出自动回复', 'info', 1500);
    return;
  }

  if (mode === 'draft') {
    // AI 草稿：调后端生成草稿，追加到输入框
    await applyAiDraft(reqId);
    return;
  }

  if (mode === 'auto') {
    // AI 自动：弹二次确认
    _showAiAutoConfirmModal(reqId);
    return;
  }
}

// 调后端生成 AI 草稿并填充输入框（追加模式）
async function applyAiDraft(reqId) {
  const input = document.getElementById(`chat-input-${reqId}`);
  if (!input) return;

  // 备份用户原文（用于撤销）
  window._aiDraftBeforeAI[reqId] = input.value;

  // v0.13 B5 fix: req 选择器没选也允许，server 自动选默认大模型（与 chatSendSupplement 一致）
  const modelId = document.getElementById(`ai-model-select-${reqId}`)?.value?.trim()
    || ''; // 缺省时 server 端 fallback 到 admin 设置的默认模型
  // 不再拦截「未选模型」——交给 server 兜底

  // v0.13 B5 fix: 改用 .chat-response 选择器（只读 AI 实际回复，不含 thinking 折叠 + suggest 建议 + meta 时间戳）
  //   旧：b.textContent.slice(0, 500) → 500 字符截断，thinking 折叠内容占满 500 时 response 完全丢失
  //   → LLM 拿不到完整 AI 1 轮 → 草稿不基于完整 AI 上一轮
  //   新：AI bubble 只读 .chat-response，长度 500 → 1500（够覆盖长 brief）
  const c = document.getElementById(`chat-stream-msgs-${reqId}`);  // v0.13 B5 fix: 之前 patch 误删，导致 ReferenceError
  // v0.13 B5 fix: 等待所有 streaming bubble 完成（避免读到正在 streaming 的半成品）
  //   旧：applyAiDraft 5s 期间 AI 上一轮 streaming 还没完成 → .chat-response 不存在
  //   → contentEl 回退到 b（bubble 整体）→ b.textContent 是 token 文本（不完整）
  //   → 草稿基于不完整 AI 上一轮 → "没等 AI 完成就发"
  //   新：等待 streaming 完成（className 不再含 chat-streaming-bubble）再读
  if (c) {
    const start = Date.now();
    while (c.querySelector('.chat-streaming-bubble') && Date.now() - start < 8000) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  const bubbles = c ? Array.from(c.querySelectorAll('.chat-bubble')).slice(-6) : [];
  const history = bubbles.map(b => {
    const role = b.classList.contains('chat-bubble-user') ? 'user' : 'assistant';
    // AI bubble 优先读 .chat-response（实际回复），user bubble 读 textContent（无 .chat-response）
    const contentEl = b.querySelector('.chat-response') || b;
    return { role, content: (contentEl.textContent || '').slice(0, 1500) };
  }).filter(h => h.content);

  toast('✏️ 正在生成 AI 草稿…', 'info', 1500);

  try {
    const r = await api('POST', `/ai/requirements/${reqId}/auto-draft`, { modelId, history });
    if (!r || !r.ok || !r.draft) {
      const msg = r?.error === 'NO_MODEL_AVAILABLE'
        ? '管理界面尚未设置默认大模型，请去 Admin → 大模型配置 设置'
        : (r?.message || r?.error || 'unknown');
      toast('AI 草稿生成失败：' + msg, 'error', 4000);
      return;
    }
    const existing = input.value.trim();
    if (existing) {
      input.value = existing + '\n\n' + r.draft;
    } else {
      input.value = r.draft;
    }
    chatAutoGrow(input);
    _aiSetState(reqId, 'draft');
    toast('✏️ 已生成 AI 草稿 · 可直接修改后发送', 'success', 2000);
  } catch (e) {
    toast('AI 草稿失败：' + (e?.message || 'unknown'), 'error', 3000);
  }
}

// 撤销 AI 草稿，保留用户原文
function restoreAiDraft(reqId) {
  const input = document.getElementById(`chat-input-${reqId}`);
  if (!input) return;
  input.value = window._aiDraftBeforeAI[reqId] || '';
  chatAutoGrow(input);
  _aiSetState(reqId, 'off');
  toast('↺ 已撤销 AI 草稿 · 保留你的原文', 'info', 1500);
}

// 自动态：再点 ↻ = 直接发送（v0.13 B5 fix: 持续生效，不再二次确认，不再重置 off）
//   v0.13 B5 fix: 防并发重入（tick / polling / 用户快速点 ↻ 都会并发触发，导致连续发 2 条）
async function triggerAiAutoSend(reqId) {
  if (window._aiAutoRunning?.[reqId]) {
    console.log(`[ai-auto] ${reqId} triggerAiAutoSend 已在跑，跳过重复触发`);
    return;
  }
  window._aiAutoRunning = window._aiAutoRunning || {};
  window._aiAutoRunning[reqId] = true;
  try {
    // 注意：用户已在 selectAiMode('auto') 弹窗里确认过启用自动态，此处不再弹确认
    const input = document.getElementById(`chat-input-${reqId}`);
    if (!input) return;
    // v0.13 B5 fix: 立即 hide 指示条（applyAiDraft 5s 期间不应该显示 "5 秒后发送"）
    //   旧行为：指示条一直显示 "5 秒后发送" 直到下一轮倒计时启动才更新
    //   新行为：进入 triggerAiAutoSend 立即 hide，下一轮 _aiStartAutoCountdown 启动时再 show
    _aiHideAutoIndicator(reqId);
    // 输入框为空 → 先快速生成 AI 草稿
    if (!input.value.trim()) {
      await applyAiDraft(reqId);
      if (!input.value.trim()) {
        // v0.13 B5 fix: applyAiDraft 失败时 input 仍空，必须中断 triggerAiAutoSend
        //   旧行为：return 只跳出 if 块，triggerAiAutoSend 继续 → L4280 await chatSend(reqId)
        //   → chatSend 内部 L3989 防御 return（input 空）→ L4280 await 立即完成
        //   → L4283 _aiAutoSentCount++ 仍增 → L4285 "已自动发送 N 轮" 打 log
        //   → 但消息没发！→ 后端不启动新 brief → polling 不启动新倒计时 → auto 停止
        //   新行为：明确 return 中断整个 triggerAiAutoSend（不再增 sentCount / 不打 log / 不跑 checkpoint）
        toast('⚠️ AI 草稿生成失败，本轮自动回复已取消', 'warning', 3000);
        return;
      }
    }
    // v0.13 B5 fix: 二次防御 — applyAiDraft 成功后 input 非空，但 chatSend 内部可能因 race 仍防御 return
    //   这种情况不常见（applyAiDraft 成功后 input 应该非空），但加防御保护 auto 状态
    const canSend = input.value.trim() || (window._chatAttachments?.[reqId]?.length || 0) > 0;
    if (!canSend) {
      console.log(`[ai-auto] ${reqId} 无法发送（input 空且无附件），本轮终止`);
      return;
    }
    // v0.13 B5：记录当前 brief 轮次，避免重复触发同轮的倒计时
    // v0.13 B5 fix: 显式拉一次 briefResp 拿最新 briefRound
    //   旧：state.briefRound 可能滞后（L3506 只在 !streamingBubble 时更新 / L3448 强制设 0）
    //   → _aiAutoLastRound 设错值 → polling 看到 briefRound > 错值 满足 → 循环
    //   新：直接拉一次 briefResp 拿真值，绕过 state 同步问题
    let realBriefRound = 0;
    try {
      const r = await api('GET', `/requirements/${reqId}/thinking-brief`);
      realBriefRound = r?.thinkingBrief?.chat_round || 0;
      window._aiAutoLastRound[reqId] = realBriefRound;
      // 顺便把 state 同步好（后续轮次 L4314 仍读 state）
      _chatState[reqId] = _chatState[reqId] || { histCount: 0, briefRound: 0 };
      _chatState[reqId].briefRound = realBriefRound;
    } catch (e) {
      // v0.13 B5 fix: 拉失败时直接中断 triggerAiAutoSend（不设 _aiAutoLastRound，避免循环）
      //   旧：fallback -1 → polling 看到 briefRound > -1 满足 → 循环
      //   旧：fallback state.briefRound（如果 0）→ polling 看到 briefRound > 0 满足 → 循环
      //   新：fetch 失败就 return → chatSend 不跑 → "已自动发送" log 不打 → 不会循环
      console.warn(`[ai-auto] ${reqId} fetch /thinking-brief 失败，本轮取消:`, e.message);
      toast('⚠️ AI 轮次信息获取失败，本轮自动回复已取消', 'warning', 3000);
      return;
    }

    await chatSend(reqId);

    // v0.13 B5：递增自动发送计数 + 检查方向 checkpoint
    window._aiAutoSentCount[reqId] = (window._aiAutoSentCount[reqId] || 0) + 1;
    const sentCount = window._aiAutoSentCount[reqId];
    console.log(`[ai-auto] ${reqId} 已自动发送第 ${sentCount} 轮`);
    _aiCheckDirectionCheckpoint(reqId);

    // 保持 'auto' 态（持续生效，用户主动选「关闭」才退出）
  } finally {
    window._aiAutoRunning[reqId] = false;
  }
}

// 弹「AI 自动模式」二次确认（v0.13 B5 fix: 用专属 class 确保 fixed 定位 + 高 z-index）
function _showAiAutoConfirmModal(reqId) {
  const existing = document.getElementById('ai-auto-confirm-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'ai-auto-confirm-modal';
  modal.className = 'ai-auto-confirm-bg';  // 专属 class，强制 fixed + z-index 9999
  modal.innerHTML = `
    <div class="modal" onclick="event.stopPropagation()">
      <div class="modal-title">🚀 启用 AI 自动回复？</div>
      <div class="modal-body">
        启用后，<strong>点 ↻ 按钮 AI 将直接发送回复，不再经过你确认</strong>。<br>
        模式会<strong>持续生效</strong>，直到你点 ↻ 选「关闭」。
      </div>
      <div class="modal-buttons">
        <button class="btn" onclick="closeAiAutoConfirm()">取消</button>
        <button class="btn btn-primary" onclick="confirmAiAuto('${reqId}')">启用</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function closeAiAutoConfirm() {
  const m = document.getElementById('ai-auto-confirm-modal');
  if (m) m.remove();
}

function confirmAiAuto(reqId) {
  closeAiAutoConfirm();
  _aiSetState(reqId, 'auto');
  // v0.13 B5：自动态启用时重置计数 + 挂 input 监听
  window._aiAutoSentCount[reqId] = 0;
  // v0.13 B5 fix: 显式拉一次 briefResp 同步 state.briefRound
  //   旧 bug：state.briefRound 可能是 undefined（loadChatStream 时 brief.status='generating'，
  //   L3448 没设 state.briefRound），导致 triggerAiAutoSend 跑时 L4278 fallback 到 0
  //   → polling 看到 briefRound > 0 总是满足 → 永远启动新倒计时（applyAiDraft 失败也启动）
  //   新行为：enable auto 时显式同步一次 state.briefRound
  api('GET', `/requirements/${reqId}/thinking-brief`).then(r => {
    const b = r?.thinkingBrief;
    if (b && b.chat_round != null) {
      _chatState[reqId] = _chatState[reqId] || { histCount: 0, briefRound: 0 };
      _chatState[reqId].briefRound = b.chat_round || 0;
    }
  }).catch(e => console.warn('[ai-auto] 同步 state.briefRound 失败:', e.message));
  // _aiAutoLastRound 保持 0（语义：还没自动过任何轮次）
  //   当前等待用户回复的轮次如果存在，_aiCheckAndStartAuto 会检测到并立即启动倒计时
  window._aiAutoLastRound[reqId] = 0;
  _aiSetupInputListener(reqId);
  _aiShowAutoIndicator(reqId, '⏸ 已就绪 · 等待 AI 提问完成后自动回复');
  toast('🚀 AI 自动回复已启用 · 持续生效，点 ↻ 选「关闭」停用', 'success', 2500);
  // v0.13 B5 fix: 启用后立即检测当前轮次是否就该启动倒计时（不等下次 polling）
  setTimeout(() => _aiCheckAndStartAuto(reqId), 200);
  console.log(`[ai-auto] ${reqId} 已启用 auto 态`);
}

// v0.13 B5 fix: 启用 auto 后立即检测当前 brief 状态，看是否该立即启动倒计时
async function _aiCheckAndStartAuto(reqId) {
  if (_aiGetState(reqId) !== 'auto') return;
  let brief;
  try {
    const r = await api('GET', `/requirements/${reqId}/thinking-brief`);
    brief = r?.thinkingBrief;
  } catch (e) {
    console.warn('[ai-auto] 检测当前 brief 失败:', e.message);
    return;
  }
  if (!brief || brief.status !== 'done') {
    console.log(`[ai-auto] ${reqId} 当前 brief 未就绪 (status=${brief?.status})`);
    return;
  }
  const briefRound = brief.chat_round || 0;
  console.log(`[ai-auto] ${reqId} 检测：briefRound=${briefRound}, _aiAutoLastRound=${window._aiAutoLastRound[reqId] || 0}`);
  // 条件：当前轮次 > 上次自动过（首次 _aiAutoLastRound=0，任何 done 轮次都满足）
  if (briefRound > (window._aiAutoLastRound[reqId] || 0)) {
    const input = document.getElementById(`chat-input-${reqId}`);
    const isInputEmpty = !input?.value?.trim();
    if (isInputEmpty && !_aiAutoCountdowns[reqId]) {
      console.log(`[ai-auto] ${reqId} 立即启动倒计时（briefRound=${briefRound}）`);
      _aiStartAutoCountdown(reqId, briefRound);
    } else {
      console.log(`[ai-auto] ${reqId} 跳过：输入框非空或有倒计时`);
    }
  }
}

// ── v0.13 B5：自动态持续生效 — 倒计时 + 指示条 + 方向 checkpoint ──
// v0.13 B5 fix: 5s → 10s 倒计时
//   旧：5s 倒计时让用户来不及消化 AI 提问就自动发，体验上"立即又 5 秒"
//   新：10s 倒计时 + AI 完成时显式 toast 提示（"AI 提问完成 · 10 秒后自动回复"）
//   → 给用户消化时间 + 显式告知 + 可选 ↻ 跳过 / 选关闭停止
const AI_AUTO_COUNTDOWN_MS = 10000;      // 10 秒倒计时（之前 5s 太短）
const AI_AUTO_CHECKPOINT_EVERY = 3;      // 每 3 轮弹方向确认

// 自动态指示条（固定在 chat 输入区上方）
function _aiShowAutoIndicator(reqId, text) {
  let bar = document.getElementById(`ai-auto-indicator-${reqId}`);
  if (!bar) {
    bar = document.createElement('div');
    bar.id = `ai-auto-indicator-${reqId}`;
    bar.className = 'ai-auto-indicator';
    // 插到 chat-input-area 上方（chat-stream-input 是输入区父元素）
    const inputArea = document.querySelector(`#chat-stream-container-${reqId} .chat-stream-input`)
      || document.querySelector(`#chat-stream-msgs-${reqId}`)?.parentElement;
    if (inputArea) inputArea.insertBefore(bar, inputArea.firstChild);
  }
  bar.innerHTML = `<span class="ai-auto-indicator-text">🚀 ${escHtml(text)}</span>
    <span class="ai-auto-indicator-actions">
      <button class="btn-small ai-auto-pause-btn" onclick="_aiPauseAuto('${reqId}')">⏸ 暂停</button>
      <button class="btn-small ai-auto-skip-btn" onclick="_aiSkipCountdown('${reqId}')">↻ 立即</button>
    </span>`;
}
function _aiHideAutoIndicator(reqId) {
  const bar = document.getElementById(`ai-auto-indicator-${reqId}`);
  if (bar) bar.remove();
}
function _aiUpdateAutoIndicator(reqId, secondsLeft, sentCount) {
  const bar = document.getElementById(`ai-auto-indicator-${reqId}`);
  if (!bar) return;
  const textEl = bar.querySelector('.ai-auto-indicator-text');
  if (!textEl) return;
  if (secondsLeft < 0) {
    // 用户编辑态
    textEl.textContent = `⏸ 用户正在编辑 · 编辑完按 ↻ 恢复自动`;
  } else {
    textEl.textContent = `🚀 AI 自动回复 · ${secondsLeft} 秒后发送 · 第 ${sentCount + 1} 轮`;
  }
}

// 用户暂停自动态（保留「关闭态」语义，退出 auto）
function _aiPauseAuto(reqId) {
  _aiCancelAutoCountdown(reqId, 'user paused');
  _aiSetState(reqId, 'off');
  _aiHideAutoIndicator(reqId);
  toast('⏸ 已暂停 AI 自动回复', 'info', 1500);
}

// 用户跳过倒计时，立即触发
function _aiSkipCountdown(reqId) {
  _aiCancelAutoCountdown(reqId, 'user skipped');
  triggerAiAutoSend(reqId);
}

// 启动倒计时（5 秒），倒计时到 0 → triggerAiAutoSend
function _aiStartAutoCountdown(reqId, chatRound) {
  if (_aiAutoCountdowns[reqId]) return; // 已有倒计时，不重复启动
  const sentCount = window._aiAutoSentCount[reqId] || 0;
  const deadlineMs = Date.now() + AI_AUTO_COUNTDOWN_MS;
  // v0.13 B5 fix: 新一轮倒计时启动时重建/显示指示条
  //   旧行为：tick 内部 _aiUpdateAutoIndicator 在 bar 不存在时直接 return → bar 不会出现
  //   新行为：_aiStartAutoCountdown 入口 _aiShowAutoIndicator 重建 bar，tick 立即跑更新文本
  _aiShowAutoIndicator(reqId, `⏸ 等待 AI 下一轮完成后 5 秒倒计时发送 · 第 ${sentCount + 1} 轮`);
  const tick = () => {
    const left = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
    _aiUpdateAutoIndicator(reqId, left, sentCount);
    // v0.13 B5 fix: 防 tick 在 left<=0 区间多次进入触发（V8/Chrome setInterval
    //   对 pending 回调的清理行为不一致；Math.ceil(-0.25)=0 让 left<=0 持续 ~1s）
    const cd = window._aiAutoCountdowns[reqId];
    if (left <= 0 && cd && !cd.fired) {
      cd.fired = true;
      _aiCancelAutoCountdown(reqId, 'countdown finished');
      triggerAiAutoSend(reqId);
      return;
    }
  };
  tick(); // 立即渲染一次
  const timerId = setInterval(tick, 250);
  window._aiAutoCountdowns[reqId] = { timerId, deadlineMs, chatRound, fired: false };
}

function _aiCancelAutoCountdown(reqId, reason) {
  const cd = window._aiAutoCountdowns[reqId];
  if (!cd) return;
  clearInterval(cd.timerId);
  delete window._aiAutoCountdowns[reqId];
  // v0.13 B5 fix: cancel 时立即 hide 指示条
  //   旧行为：cancel 只 clearInterval + delete 对象，bar 还在 DOM
  //   → applyAiDraft / chatSend 期间 bar 一直显示 "5 秒后发送" 文本
  //   → 视觉上"几乎不消失就又开始数 5 秒"
  //   新行为：cancel 立即 hide bar，下一轮倒计时启动时再 show
  _aiHideAutoIndicator(reqId);
}

// 输入框 input 监听 — 用户打字自动取消倒计时（保留用户工作）
function _aiSetupInputListener(reqId) {
  const input = document.getElementById(`chat-input-${reqId}`);
  if (!input) return;
  if (input._aiAutoListenerAttached) return;
  input._aiAutoListenerAttached = true;
  input.addEventListener('input', () => {
    if (_aiGetState(reqId) === 'auto' && _aiAutoCountdowns[reqId]) {
      // 用户开始打字 → 取消自动倒计时（让用户编辑），但不退出自动态
      _aiCancelAutoCountdown(reqId, 'user started typing');
      _aiUpdateAutoIndicator(reqId, -1, window._aiAutoSentCount[reqId] || 0);
    }
  });
}

// 每 N 轮强制方向确认
function _aiCheckDirectionCheckpoint(reqId) {
  const sentCount = window._aiAutoSentCount[reqId] || 0;
  if (sentCount > 0 && sentCount % AI_AUTO_CHECKPOINT_EVERY === 0) {
    _aiCancelAutoCountdown(reqId, 'direction checkpoint');
    _showDirectionCheckpointModal(reqId, sentCount);
  }
}

function _showDirectionCheckpointModal(reqId, sentCount) {
  const existing = document.getElementById('ai-direction-checkpoint-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'ai-direction-checkpoint-modal';
  modal.className = 'ai-auto-confirm-bg';  // 复用 fixed + 高 z-index
  modal.innerHTML = `
    <div class="modal" onclick="event.stopPropagation()">
      <div class="modal-title">🧭 方向确认</div>
      <div class="modal-body">
        已自动回复 <strong>${sentCount}</strong> 轮。<br>
        对话方向是否还在你想要的轨道上？<br>
        <span style="font-size:12px;color:var(--text3)">查看 chat 流判断 · 继续则继续自动，退出则恢复手动</span>
      </div>
      <div class="modal-buttons">
        <button class="btn" onclick="_aiExitAfterCheckpoint('${reqId}')">退出自动（恢复手动）</button>
        <button class="btn btn-primary" onclick="_aiContinueAfterCheckpoint('${reqId}')">继续自动</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function _aiExitAfterCheckpoint(reqId) {
  const m = document.getElementById('ai-direction-checkpoint-modal');
  if (m) m.remove();
  _aiSetState(reqId, 'off');
  _aiHideAutoIndicator(reqId);
  toast('⏸ 已退出自动回复 · 恢复手动', 'info', 2000);
}

function _aiContinueAfterCheckpoint(reqId) {
  const m = document.getElementById('ai-direction-checkpoint-modal');
  if (m) m.remove();
  toast('✅ 继续自动回复', 'info', 1500);
}

// 点 popover 外面关闭（不切换态）
document.addEventListener('click', (e) => {
  document.querySelectorAll('.ai-reply-popover.show').forEach(p => {
    const btnId = `ai-mode-btn-${p.dataset.reqId}`;
    const btn = document.getElementById(btnId);
    if (!p.contains(e.target) && (!btn || !btn.contains(e.target))) {
      p.classList.remove('show');
    }
  });
});
// Esc 关闭所有 AI popover
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.ai-reply-popover.show').forEach(p => p.classList.remove('show'));
  }
});
