// ===== Chat 模式切换器（v0.18，2026-06-27）=====
// 切换 clarify ↔ free：
//   - clarify（默认）：原行为 — AI 引导澄清需求
//   - free：通用对话 — AI 基于附件/参考资料回答，不追问澄清
//
// 设计要点：
//   - mode 存 req.chat_mode 后端字段（reqStore 动态字段无 schema 迁移）
//   - 切换时清空旧 brief（避免旧澄清问题污染自由对话流）
//   - 切换不丢 supplement_history（用户/AI 历史保留）
//   - free 模式隐藏 chat-extras 按钮行（决策树/场景/竞品/借鉴/整理/体检/够了）
//
// 跨文件依赖：
//   - api / escHtml / toast / showConfirm（全局）
//   - 元素 id 约定：#chat-mode-chip-${reqId} / #chat-mode-title-${reqId}

// 全局状态：reqId → 'clarify' | 'free'
window._chatMode = window._chatMode || {};

// 读取当前 mode（默认 clarify — 向后兼容）
function getChatMode(reqId) {
  if (!reqId) return 'clarify';
  // 优先从 DOM 读（页面已渲染的 chip 状态最可靠）
  const chip = document.getElementById(`chat-mode-chip-${reqId}`);
  if (chip) {
    if (chip.classList.contains('chat-mode-free')) return 'free';
    if (chip.classList.contains('chat-mode-clarify')) return 'clarify';
  }
  return window._chatMode[reqId] || 'clarify';
}

// 切换 mode（chip 点击）
async function toggleChatMode(reqId) {
  const cur = getChatMode(reqId);
  const next = cur === 'clarify' ? 'free' : 'clarify';
  await setChatMode(reqId, next);
}

// 设置 mode（外部调用入口）
async function setChatMode(reqId, mode) {
  if (!reqId || !['clarify', 'free'].includes(mode)) return;
  const cur = getChatMode(reqId);
  if (cur === mode) return; // 无变化

  try {
    const r = await api('POST', `/requirements/${reqId}/chat-mode`, { mode });
    if (!r || r.error) {
      toast('切换失败: ' + (r?.error || 'unknown'), 'error');
      return;
    }

    // 更新本地状态
    window._chatMode[reqId] = mode;

    // 同步 UI（chip + title + extras 隐藏/显示）
    renderChatModeUI(reqId, mode);

    // 切到 free 时清掉 assist 卡片（决策树/场景/借鉴等不能再用）
    if (mode === 'free') {
      const c = document.getElementById(`chat-stream-msgs-${reqId}`);
      c?.querySelectorAll('.chat-assist-layer, .assist-loading-card').forEach(el => el.remove());
    }

    // v0.18 bugfix：切换后调 loadChatStream(reqId) 重新加载 chat 流
    //   旧 bug：只塞 chat-typing dots + 清掉 polling/state → DOM 永远在跳但什么都不加载
    //   修：loadChatStream 自己会清 DOM → 拉 supplement-history + brief → 渲染气泡 → 启动 polling
    //   后端切到 free 时已清空 thinking_brief，所以历史气泡都是 user/assistant entries（保留无违和感）
    if (typeof loadChatStream === 'function') {
      try {
        await loadChatStream(reqId);
      } catch (e) {
        console.warn('[setChatMode] reload failed:', e.message);
      }
    }

    // 提示用户
    const label = mode === 'free' ? '💬 自由对话' : '🎯 想法澄清';
    const desc = mode === 'free'
      ? 'AI 将基于附件/参考资料回答 · 不追问澄清'
      : 'AI 会引导你理清需求 · 问澄清问题';
    toast(`${label} · ${desc}`, 'info', 2500);
  } catch (e) {
    // v0.18：404 错误（NOT_FOUND）— 多半是 server 没重启旧进程没新路由，给用户明确提示
    const isNotFound = e?.data?.error === 'NOT_FOUND' || /NOT_FOUND/.test(e?.message || '');
    if (isNotFound) {
      toast('⚠️ 路由不存在 — 请重启 ACMS server（systemctl restart acms）', 'error', 5000);
    } else {
      toast('切换失败: ' + (e?.message || 'unknown'), 'error');
    }
    console.error('[setChatMode]', e);
  }
}

// 同步 UI（chip class + title + extras 显示）
function renderChatModeUI(reqId, mode) {
  const chip = document.getElementById(`chat-mode-chip-${reqId}`);
  const title = document.getElementById(`chat-mode-title-${reqId}`);
  const extras = document.querySelectorAll(`#idea-panel-${reqId} .chat-extras`);

  if (chip) {
    chip.classList.remove('chat-mode-clarify', 'chat-mode-free');
    chip.classList.add(mode === 'free' ? 'chat-mode-free' : 'chat-mode-clarify');
    const label = chip.querySelector('.chat-mode-label');
    if (label) label.textContent = mode === 'free' ? '💬 自由对话' : '🎯 想法澄清';
    chip.title = mode === 'free'
      ? '当前：自由对话 · 点切回想法澄清'
      : '当前：想法澄清 · 点切到自由对话';
  }

  if (title) {
    title.textContent = mode === 'free' ? '💬 自由对话' : '💬 对话式想法澄清';
  }

  // free 模式隐藏 chat-extras 按钮行（澄清专用工具）
  extras.forEach(el => {
    el.style.display = mode === 'free' ? 'none' : 'flex';
  });

  // free 模式隐藏 chatDone（"够了"按钮）— 但该按钮在 chat-extras 内，已被上面处理
  // free 模式隐藏清晰度徽章（clarity 是澄清流的产物，free 下没意义）
  const clarityBadge = document.querySelectorAll(`#idea-panel-${reqId} .insight-clarity-badge`);
  clarityBadge.forEach(el => {
    el.style.display = mode === 'free' ? 'none' : '';
  });
}

// 页面加载时初始化 mode（从 req.chat_mode 字段读 — 旧 REQ 缺字段视为 clarify）
function initChatMode(reqId, req) {
  const mode = req?.chat_mode || 'clarify';
  window._chatMode[reqId] = mode;
  renderChatModeUI(reqId, mode);
}
