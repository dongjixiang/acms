// ===== 思路面板 + Insight 预览（v0.13 抽公共，2026-06-21）=====
// 抽自 client/js/views/requirements.js（原 L2432-2695，263 行）
//
// 跨文件依赖（重要！）：
//   - api / escHtml / toast / showConfirm / App（全局）
//   - openRequirement（主文件 requirements.js，script 顺序保证已加载）
//   - chat 模块函数（toggleChatMaximize / chatUploadTrigger / chatUploadFile /
//     chatAutoGrow / chatSend / chatHandlePaste / chatToggleAttachPopover /
//     showAiPopover / selectAiMode / chatAssist / chatDone）—— 都在
//     requirements.js 的 chat 区域，HTML 字符串引用是延迟触发（用户点按钮时），
//     不要求加载顺序，但 idea-panel 与 chat 模块逻辑上紧耦合
//
// 未来 chat 拆分时（Round 3 计划）需要同步迁移这些引用

// 存轮询 timer，避免多次打开详情页时叠加
const _insightPollers = {};
const _briefPollers = {};

function renderIdeaPanel(req) {
  const clarity = req.input_clarity;
  const clarityBadge = clarity
    ? { high: '🟢 明确', medium: '🟡 一般', low: '🔴 模糊' }[clarity] || clarity
    : '⏳ 评估中…';
  const reasonText = req.clarity_reason ? `<div class="insight-reason">${escHtml(req.clarity_reason)}</div>` : '';
  const chatMode = req.chat_mode || 'clarify'; // v0.18 chat 模式（clarify=默认 / free=通用对话）
  const modeLabel = chatMode === 'free' ? '💬 自由对话' : '🎯 想法澄清';
  const modeTitle = chatMode === 'free'
    ? '当前：自由对话 · 点切回想法澄清'
    : '当前：想法澄清 · 点切到自由对话';
  const titleText = chatMode === 'free' ? '💬 自由对话' : '💬 对话式想法澄清';
  // v0.18：free 模式隐藏 chat-extras 按钮行（澄清专用 7 个工具）+ clarity 徽章
  const extrasDisplay = chatMode === 'free' ? 'none' : 'flex';
  const clarityDisplay = chatMode === 'free' ? 'none' : '';
  return `
    <div id="idea-panel-${req.id}" class="idea-panel">
      <div class="insight-header">
        <span class="insight-title" id="chat-mode-title-${req.id}">${titleText}</span>
        <button class="chat-maximize-btn" onclick="toggleChatMaximize('${req.id}')" title="全屏">⛶</button>
        <!-- v0.18 chat 模式切换器（clarify ↔ free）-->
        <span id="chat-mode-chip-${req.id}" class="chat-mode-chip chat-mode-${chatMode}"
              onclick="toggleChatMode('${req.id}')" title="${modeTitle}">
          <span class="chat-mode-label">${modeLabel}</span>
          <span class="chat-mode-icon">⇄</span>
        </span>
        <span class="insight-clarity-badge insight-clarity-${clarity || 'unknown'}" style="display:${clarityDisplay}">${clarityBadge}</span>
        ${reasonText}
      </div>
      <!-- v0.3.6 对话流：聊天式想法澄清 -->
      <div id="chat-stream-container-${req.id}" class="chat-stream-container">
        <div class="chat-stream" id="chat-stream-msgs-${req.id}" onscroll="chatScrollUpdateBtn('${req.id}')">
          <div class="chat-typing"><span></span><span></span><span></span></div>
        </div>
        <!-- v0.17 浮动滚动按钮：底部 ↔ 顶部切换（解决旧 REQ 打开看不到历史 AI 回复） -->
        <button class="chat-scroll-top-btn" id="chat-scroll-top-btn-${req.id}"
          onclick="chatScrollToggle('${req.id}')" title="滚到顶部">📜</button>
        <div class="chat-stream-input">
          <div class="chat-attach-preview" id="chat-attach-preview-${req.id}" style="display:none"></div>
          <div class="chat-input-area">
            <div class="chat-input-popover" id="chat-input-popover-${req.id}" style="display:none">
              <div class="popover-item" onclick="chatUploadTrigger('${req.id}','image')"><span class="pop-icon">🖼</span><span>图片</span><span class="pop-hint">PNG · JPG · WEBP</span></div>
              <div class="popover-item" onclick="chatUploadTrigger('${req.id}','pdf')"><span class="pop-icon">📕</span><span>PDF</span><span class="pop-hint">.pdf</span></div>
              <div class="popover-item" onclick="chatUploadTrigger('${req.id}','docx')"><span class="pop-icon">📘</span><span>Word</span><span class="pop-hint">.docx</span></div>
              <div class="popover-item" onclick="chatUploadTrigger('${req.id}','text')"><span class="pop-icon">📄</span><span>文本 / 代码</span><span class="pop-hint">.md .txt .json</span></div>
            </div>
<input type="file" id="chat-file-${req.id}" class="hidden" style="display:none"
              multiple
              onchange="chatUploadFile('${req.id}', this)">
            <div class="chat-input-row">
              <button class="btn-attach" id="chat-attach-btn-${req.id}" onclick="chatToggleAttachPopover('${req.id}')" title="添加附件">📎</button>
              <textarea id="chat-input-${req.id}" rows="1"
                placeholder="回答 AI 的问题，或补充你的想法…（可直接 Ctrl+V 粘贴截图）"
                oninput="chatAutoGrow(this)"
                onkeydown="if(event.key==='Enter' && !event.ctrlKey && !event.shiftKey && !event.altKey){event.preventDefault();chatSend('${req.id}')}"
                onpaste="chatHandlePaste('${req.id}', event)"></textarea>
<div class="chat-input-actions">
                <button class="btn-small btn-primary" onclick="chatSend('${req.id}')">📤 发送</button>
                <button class="btn-ai-mode btn-ai-off" id="ai-mode-btn-${req.id}" onclick="showAiPopover(event,'${req.id}')" title="AI 代回">↻<span class="btn-ai-state-dot"></span></button>
                <div class="ai-reply-popover" id="ai-popover-${req.id}" data-req-id="${req.id}">
                  <div class="ai-reply-popover-title">AI 回复模式</div>
                  <div class="ai-reply-popover-option" data-mode="off" onclick="selectAiMode('off','${req.id}')">
                    <div class="ai-reply-popover-icon ai-reply-popover-icon-off">↻</div>
                    <div class="ai-reply-popover-content">
                      <div class="ai-reply-popover-label">关闭</div>
                      <div class="ai-reply-popover-desc">让 AI 重新问下一轮（原 ↻ 行为）</div>
                    </div>
                  </div>
                  <div class="ai-reply-popover-option" data-mode="draft" onclick="selectAiMode('draft','${req.id}')">
                    <div class="ai-reply-popover-icon ai-reply-popover-icon-draft">✏️</div>
                    <div class="ai-reply-popover-content">
                      <div class="ai-reply-popover-label">AI 草稿</div>
                      <div class="ai-reply-popover-desc">AI 帮你起草回复填到输入框，可修改后再发</div>
                    </div>
                  </div>
                  <div class="ai-reply-popover-option" data-mode="auto" onclick="selectAiMode('auto','${req.id}')">
                    <div class="ai-reply-popover-icon ai-reply-popover-icon-auto">🚀</div>
                    <div class="ai-reply-popover-content">
                      <div class="ai-reply-popover-label">AI 自动</div>
                      <div class="ai-reply-popover-desc">AI 替你直接回复并发送（需二次确认）</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="chat-extras" style="display:${extrasDisplay}">
            <button onclick="chatAssist('${req.id}', 'decision_tree')">🌳 决策树</button>
            <button onclick="chatAssist('${req.id}', 'scenarios')">👥 场景</button>
            <button onclick="chatAssist('${req.id}', 'competitive')">🏢 竞品</button>
            <button onclick="chatAssist('${req.id}', 'reference')">🏛 借鉴</button>
            <button onclick="chatMusicPrompt('${req.id}')">🎵 音乐</button>
            <button onclick="chatVideoPrompt('${req.id}')">🎬 视频</button>
            <button onclick="chatAssist('${req.id}', 'use_case')">✨ 整理</button>
            <button onclick="chatAssist('${req.id}', 'health_check')" style="border-color:var(--accent);color:var(--accent)">🏥 体检</button>
            <button onclick="chatDone('${req.id}')" style="border-color:rgba(255,68,68,0.2);color:#f55">✅ 够了</button>
          </div>
        </div>
      </div>
    </div>
  `;
}


async function maybeLoadInsightPreviews(reqId) {
  // 清理旧轮询
  if (_insightPollers[reqId]) {
    clearInterval(_insightPollers[reqId]);
    delete _insightPollers[reqId];
  }
  try {
    const resp = await api('GET', `/requirements/${reqId}/insight-previews`);
    const data = resp;
    const previews = data.insightPreviews;
    if (!previews || previews.status === 'pending') {
      // 任务还没启动（老需求没自动启动），手动触发
      const triggerResp = await api('POST', `/requirements/${reqId}/insight-previews`, {});
      if (triggerResp && !triggerResp.error) {
        // 启动轮询
        _insightPollers[reqId] = setInterval(() => pollInsightPreviews(reqId), 3000);
        setTimeout(() => pollInsightPreviews(reqId), 500);
      }
    } else if (previews.status === 'generating') {
      _insightPollers[reqId] = setInterval(() => pollInsightPreviews(reqId), 3000);
      renderInsightPreviewContent(reqId, previews);
    } else {
      // done / failed / skipped
      // v0.13 B8：传入 projectId，让 render 用 req 所属项目拼图片 URL（治跨项目 404）
      renderInsightPreviewContent(reqId, previews, resp.projectId);
      if (previews.status === 'generating' || previews.status === 'pending') {
        _insightPollers[reqId] = setInterval(() => pollInsightPreviews(reqId), 3000);
      }
    }
  } catch (e) {
    console.warn('[insight] 加载失败:', e.message);
  }
}

async function pollInsightPreviews(reqId) {
  try {
    const resp = await api('GET', `/requirements/${reqId}/insight-previews`);
    const previews = resp.insightPreviews;
    if (!previews) return;
    // v0.13 B8：传入 projectId（治跨项目图片 404）
    renderInsightPreviewContent(reqId, previews, resp.projectId);
    if (previews.status !== 'generating' && previews.status !== 'pending') {
      clearInterval(_insightPollers[reqId]);
      delete _insightPollers[reqId];
    }
  } catch (e) {
    console.warn('[insight] 轮询失败:', e.message);
  }
}

function renderInsightPreviewContent(reqId, previews, projectId) {
  const container = document.getElementById(`insight-preview-content-${reqId}`);
  if (!container) return;
  const footer = document.getElementById(`insight-footer-${reqId}`);
  // v0.13 B8：拼图片 URL 用 req 所属 projectId，避免跨项目查看时 404
  //   fallback：projectId 缺失时用 App.currentProjectId（向后兼容老调用）
  const assetProjectId = projectId || App.currentProjectId;

  if (previews.status === 'pending') {
    container.innerHTML = '<div class="insight-loading">⏳ 等待启动…</div>';
    return;
  }
  if (previews.status === 'generating') {
    const v = previews.variants || [];
    const done = v.filter(x => x.asset_path).length;
    const hasLabels = v.some(x => x.label);
    if (!hasLabels) {
      container.innerHTML = '<div class="insight-loading">🤔 AI 在分析需求、想 3 个可能方向…</div>';
    } else {
      // 显示已生成的部分 + loading 占位
      const cards = v.map((variant, i) => `
        <div class="insight-card ${variant.asset_path ? 'ready' : 'pending'}">
          <div class="insight-card-label">${escHtml(variant.label || `方向 ${String.fromCharCode(65+i)}`)}</div>
          ${variant.rationale ? `<div class="insight-card-rationale">💭 ${escHtml(variant.rationale)}</div>` : ''}
          <div class="insight-card-image">
            ${variant.asset_path
              ? `<img src="/api/generate/assets/${assetProjectId}/${variant.asset_path}" alt="${escHtml(variant.label)}" />`
              : `<div class="insight-card-loading">⏳ 生成中…</div>`}
          </div>
        </div>
      `).join('');
      container.innerHTML = `<div class="insight-grid">${cards}</div><div class="insight-status">${done}/${v.length} 已完成</div>`;
    }
    if (footer) footer.style.display = 'flex';
    return;
  }
  if (previews.status === 'failed') {
    container.innerHTML = `<div class="insight-error">❌ 预览生成失败：${escHtml(previews.error || '未知错误')}</div>`;
    if (footer) footer.style.display = 'flex';
    return;
  }
  // done
  const pickedId = previews.picked_variant_id;
  const v = previews.variants || [];
  const cards = v.map((variant, i) => {
    const safeId = `insight-prompt-${reqId}-${variant.id}`;
    return `
    <div class="insight-card ${variant.asset_path ? 'ready' : 'failed'} ${pickedId === variant.id ? 'picked' : ''}">
      <div class="insight-card-label">${escHtml(variant.label || `方向 ${String.fromCharCode(65+i)}`)}</div>
      ${variant.rationale ? `<div class="insight-card-rationale">💭 ${escHtml(variant.rationale)}</div>` : ''}
      <div class="insight-card-image">
        ${variant.asset_path
          ? `<img src="/api/generate/assets/${assetProjectId}/${variant.asset_path}" alt="${escHtml(variant.label)}" />`
          : `<div class="insight-card-failed">✗ ${escHtml(variant.error || '生成失败')}</div>`}
      </div>
      ${variant.prompt ? `<details class="insight-card-prompt"><summary>查看生成 prompt</summary><code>${escHtml(variant.prompt)}</code></details>` : ''}
      ${variant.asset_path
        ? (pickedId === variant.id
            ? `<div class="insight-picked-badge">✅ 已选</div>`
            : `<button class="insight-pick-btn" onclick="pickInsightVariant('${reqId}','${variant.id}')">选这个</button>`)
        : ''}
    </div>
  `}).join('');
  container.innerHTML = `<div class="insight-grid">${cards}</div>`;
  if (pickedId) {
    if (footer) footer.style.display = 'none';
    container.insertAdjacentHTML('beforeend', '<div class="insight-picked-msg">🎉 你的选择已并入需求，状态已进入澄清阶段</div>');
  } else {
    if (footer) footer.style.display = 'flex';
  }
}

async function pickInsightVariant(reqId, variantId) {
  try {
    const resp = await api('POST', `/requirements/${reqId}/insight-pick`, { variantId });
    if (resp.error) {
      toast('选择失败: ' + resp.error, 'error');
      return;
    }
    toast('✅ 已选择，需求进入澄清阶段', 'success');
    // 重新打开详情页刷新状态
    setTimeout(() => openRequirement(reqId), 800);
  } catch (e) {
    toast('选择失败: ' + e.message, 'error');
  }
}

async function skipInsightPreviews(reqId) {
  try {
    const resp = await api('POST', `/requirements/${reqId}/insight-skip`, {});
    if (resp.error) {
      toast('跳过失败: ' + resp.error, 'error');
      return;
    }
    toast('已跳过预览，可直接进入澄清', 'success');
    setTimeout(() => openRequirement(reqId), 500);
  } catch (e) {
    toast('跳过失败: ' + e.message, 'error');
  }
}

async function regenerateInsightPreviews(reqId) {
  if (!await showConfirm('重新生成 3 张预览图会消耗 token，确认？', { type: 'info' })) return;
  try {
    const resp = await api('POST', `/requirements/${reqId}/insight-previews`, {});
    if (resp.error) {
      toast('启动失败: ' + resp.error, 'error');
      return;
    }
    toast('🔄 重新生成已启动', 'success');
    maybeLoadInsightPreviews(reqId);
  } catch (e) {
    toast('启动失败: ' + e.message, 'error');
  }
}
