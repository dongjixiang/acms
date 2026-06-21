// ===== 聊天 Assist 操作（v0.13 抽公共，2026-06-21）=====
// 抽自 client/js/views/requirements.js（原 L3535-3746，212 行）
//
// 跨文件依赖：
//   - api / escHtml / toast / showConfirm / App（全局）
//   - chat 模块函数（toggleChatMaximize / chatAutoGrow / renderChatBubble /
//     renderBriefBubble / renderAssistLayer / connectAssistStream /
//     chatToggleAttachPopover / chatRegen / chatSend / chatScrollToBottom /
//     chatBuildSupplementText / chatRemoveAttachment）—— HTML 字符串引用
//     是延迟触发（用户点按钮时），主文件已加载 → OK
//   - window.ACMSAssists（client/js/views/assists/index.js，全局）
//   - openRequirement（主文件）

async function chatAssist(reqId, method, extraBody) {
  // v0.6.7：累积模式 — 只清**同 method** 的旧卡片，保留其他 method 的卡片
  //   用户多次点不同按钮（决策树/场景/竞品/借鉴/痛点）→ 多张卡片共存
  //   用户重复点同 method → 替换为新卡片（防止累积多张同 method 卡片）
  const c = document.getElementById(`chat-stream-msgs-${reqId}`);
  if (c) {
    // v0.6.8：只移除同 method 的旧卡片（保留其他 method 的）
    const oldCards = c.querySelectorAll(`.assist-card[data-method="${method}"]`);
    oldCards.forEach(card => card.remove());
  }

  // v0.6.7：用 window.ACMSAssists 统一调度（之前直接调各 assist 自己的全局函数）
  const svc = window.ACMSAssists?.[method];
  if (!svc) {
    // v0.6.7：fallback 到老路径（兼容）
    const fallbackName = `chat${method.charAt(0).toUpperCase() + method.slice(1)}`;
    if (typeof window[fallbackName] === 'function') {
      return await window[fallbackName](reqId, extraBody);
    }
    console.error('[chatAssist] 未注册的 method:', method);
    return;
  }
  await svc.run(reqId, extraBody);
}

async function chatSendAssistPick(reqId, method) {
  // 支持多种选择模式
  // 1. decision_tree：选了一个分支 → 拼成自然语言 + 调 sendAiClarify
  // 2. scenarios/tradeoff/arch 等：选了选项 → 拼成自然语言
  // 3. diagnosis：阅读完即可（不需要 pick）
  // 4. use_case：选 1+ 个 use case
  if (!window.ACMSAssists?.[method]) {
    console.error('[chatSendAssistPick] 未注册的 method:', method);
    return;
  }
  await window.ACMSAssists[method].sendPick?.(reqId);
}

async function chatAssistRegen(reqId, method) {
  // v0.6.8 fix: skip 也调 useAssist 标记后端 used=true，避免下次轮询 renderAssistLayer 重复展示
  await api('POST', `/requirements/${reqId}/assist/use`, { method, action: 'regen' });
  const c = document.getElementById(`chat-stream-msgs-${reqId}`);
  if (c) {
    const oldCards = c.querySelectorAll(`.assist-card[data-method="${method}"]`);
    oldCards.forEach(card => card.remove());
  }
  await chatAssist(reqId, method);
}

async function chatSkipAssist(btn) {
  // v0.6.8 fix: skip 也调 useAssist 标记后端 used=true，避免下次轮询 renderAssistLayer 重复展示
  const reqId = btn?.dataset?.reqId || btn?.closest('[data-req-id]')?.dataset?.reqId;
  const method = btn?.dataset?.method;
  if (!reqId || !method) {
    console.warn('[chatSkipAssist] 缺 reqId 或 method');
    return;
  }
  try {
    await api('POST', `/requirements/${reqId}/assist/use`, { method, action: 'skip' });
    const c = document.getElementById(`chat-stream-msgs-${reqId}`);
    if (c) {
      const card = btn.closest('.assist-card');
      if (card) card.remove();
    }
  } catch (e) {
    console.error('[chatSkipAssist] 失败:', e.message);
  }
}

async function chatRewrite(reqId) {
  // 调 AI 重新生成上一轮回复（基于相同的 brief input）
  //   当前实现：调 rewrite-description 重整需求 → autoRegenBrief 自动重生 brief
  //   副作用：description 会被 LLM 重新组织（用户可能需要重做选择）
  //   用途：上一轮 AI 回答太差 / 答非所问时
  if (!await showConfirm('重写会触发 AI 重新组织需求描述（可能丢失手动选择），确认？', { type: 'warning' })) return;
  toast('⏳ 触发 AI 重写…', 'info');
  try {
    const resp = await api('POST', `/requirements/${reqId}/rewrite-description`, {
      supplement: '(用户操作：要求 AI 重写上一轮回答)',
      autoRegenBrief: true,
    });
    if (resp.error) {
      toast('重写失败: ' + resp.error, 'error');
      return;
    }
    toast('✅ 已触发重写，brief 正在重生…', 'success', 2000);
    setTimeout(() => openRequirement(reqId), 500);
  } catch (e) {
    toast('重写失败: ' + e.message, 'error');
  }
}

async function chatDone(reqId) {
  // 「够了」按钮：把需求 status 从 clarifying 切到 review（提交审核）
  //   行为：
  //     1. 调 POST /:id/transition 把 status 切到 review
  //     2. 成功后 openRequirement 重渲染（详情页显示 review 状态）
  if (!await showConfirm('确认需求描述已经清晰，可以提交审核？', { type: 'info' })) return;
  try {
    const resp = await api('POST', `/requirements/${reqId}/transition`, { targetStatus: 'review' });
    if (resp.error) {
      toast('提交失败: ' + resp.error, 'error');
      return;
    }
    toast('✅ 已提交审核', 'success', 2000);
    openRequirement(reqId);
  } catch (e) {
    toast('提交失败: ' + e.message, 'error');
  }
}
