// ===== 聊天 UI 辅助 + 澄清历史（v0.13 抽公共，2026-06-21）=====
// 抽自 client/js/views/requirements.js（原 L3747-3854，108 行）
//
// 跨文件依赖：
//   - api / escHtml / toast（全局）
//   - _chatState（chat 区域 const，L2211）
//   - connectStreamingBrief / renderChatBubble（chat 区域函数，HTML 字符串
//     引用是延迟触发）

/** 全屏切换（整个 idea-panel 全屏覆盖视口） */
function toggleChatMaximize(reqId) {
  const panel = document.getElementById(`idea-panel-${reqId}`);
  if (!panel) return;
  const isMaximized = panel.classList.toggle('chat-maximized');
  const btn = panel.querySelector('.chat-maximize-btn');
  if (btn) {
    btn.textContent = isMaximized ? '⤡' : '⛶';
    btn.title = isMaximized ? '恢复' : '全屏';
  }
  document.body.style.overflow = isMaximized ? 'hidden' : '';
}

function chatScrollToBottom(container) { if (container) container.scrollTop = container.scrollHeight; }

/** 发送 supplement + 触发 SSE 流式（被 chatPickCard / chatSend 共用） */
async function chatSendSupplement(reqId, supplement, source) {
  try {
    // v0.9 上传附件后自动重生 brief，让用户看到 brief 跟着附件更新
    const r = await api('POST', `/requirements/${reqId}/supplement`, { supplement, supplementSource: source, autoRegenBrief: true });
    if (r.error) { toast('补充失败: '+r.error, 'error'); return; }
    if (r.supplementHistoryCount) {
      const state = _chatState[reqId];
      if (state) state.histCount = r.supplementHistoryCount;
    }
    const c = document.getElementById(`chat-stream-msgs-${reqId}`);
    connectStreamingBrief(reqId, c);
  } catch(e) { toast('补充失败: '+e.message, 'error'); }
}

/** 导出当前 AI 回复为 Word 文档（v0.8） */
async function chatExportWord(el) {
  let reqId;
  if (typeof el === 'string') {
    reqId = el;
  } else if (el?.dataset?.reqId) {
    reqId = el.dataset.reqId;
  } else {
    // 兜底：从最近的 chat-stream-msgs 容器取
    const container = el?.closest('[id^="chat-stream-msgs-"]');
    reqId = container?.id?.replace('chat-stream-msgs-', '') || '';
  }
  if (!reqId) { toast('无法确定需求 ID', 'error'); return; }

  const btn = el?.tagName === 'BUTTON' || el?.tagName === 'SPAN' ? el : null;
  if (btn) { btn.textContent = '⏳'; btn.style.pointerEvents = 'none'; }

  try {
    const API_KEY = 'dev-key-001';
    const resp = await fetch(`/api/requirements/${reqId}/export-word`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: '{}',
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      toast('导出失败: ' + (errData.message || errData.error || resp.statusText), 'error');
      return;
    }

    // 触发下载
    const disposition = resp.headers.get('content-disposition') || '';
    const match = disposition.match(/filename\*?=(?:UTF-8'')?([^;\s]+)/i);
    let fileName = match ? decodeURIComponent(match[1]) : `AI回复_${reqId}.docx`;
    if (!fileName.endsWith('.docx')) fileName += '.docx';

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('✅ Word 文档已导出', 'success');
  } catch(e) {
    toast('导出失败: '+e.message, 'error');
    console.warn('[chatExportWord] error:', e);
  } finally {
    if (btn) { btn.textContent = '📄'; btn.style.pointerEvents = ''; }
  }
}

/** 切换澄清面板的对话追溯（v0.3.6） */
async function toggleClarifyHistory(reqId) {
  const container = document.getElementById(`clarify-history-${reqId}`);
  const toggle = container?.previousElementSibling?.querySelector('.supplement-history-toggle');
  if (!container) return;
  const isHidden = container.style.display === 'none';
  container.style.display = isHidden ? 'block' : 'none';
  if (toggle) toggle.textContent = isHidden ? '▽' : '▷';
  if (isHidden && container.querySelector('.insight-loading')) {
    try {
      const resp = await api('GET', `/requirements/${reqId}/supplement-history`);
      const history = resp.history || [];
      if (history.length === 0) {
        container.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px">暂无对话历史</div>';
        return;
      }
      container.innerHTML = '<div class="chat-stream" style="max-height:300px;padding:8px;gap:6px"></div>';
      const stream = container.querySelector('.chat-stream');
      for (const entry of history) renderChatBubble(stream, entry);
      stream.scrollTop = stream.scrollHeight;
    } catch (e) {
      container.innerHTML = `<div style="color:var(--accent2);font-size:12px;padding:8px">加载失败: ${escHtml(e.message)}</div>`;
    }
  }
}
