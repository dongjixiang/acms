// ACMS · 对话清理辅助（v0.19，2026-06-27）
//   Method: clean | Name: 对话清理
//   内联表单：展示最近对话条目→勾选→提交

(function () {
  function render(reqId, data) {
    if (!data) return '';
    if (data.status === 'done') {
      const icon = data.action === 'all' ? '🧹' : '🗑';
      const removed = data.entries_removed || 0;
      return `
        <div class="assist-section-title" style="margin-bottom:6px">${icon} 对话清理 ✅</div>
        <div style="font-size:13px;color:var(--text);padding:4px 0">${escHtml(data.note || '清理完成')}</div>
        <div style="font-size:12px;color:var(--text2);padding:2px 0 6px">清理了 ${removed} 条记录 · brief 已重置</div>
        <div style="margin-top:4px"><button class="btn-small" onclick="chatCleanPrompt('${reqId}')">🔄 再次清理</button></div>
      `;
    }
    if (data.status === 'failed') {
      return `<div class="insight-error">❌ 清理失败：${escHtml(data.error || '未知错误')}</div>`;
    }
    // 没有有效状态 → 不渲染任何内容（避免空 assist-block 显示为一条线）
    return '<div style="display:none"></div>';
  }

  window.ACMSAssists.register('clean', { name: '对话清理', render });
})();

/**
 * v0.117 自由对话清理表单（独立路径，不走 chatAssist）
 *   数据源：chat_messages 表（不是 supplement_history）
 *   提交：POST /api/chat-sessions/:id/clean {mode, indices}
 */
async function renderFreeChatCleanForm(reqId) {
  const stream = document.getElementById(`chat-stream-msgs-${reqId}`);
  if (!stream) { toast('找不到会话容器', 'error'); return; }

  let messages;
  try {
    const resp = await api('GET', `/chat-sessions/${reqId}/messages`);
    messages = resp.messages || [];
  } catch (e) {
    toast('加载会话历史失败: ' + e.message, 'error');
    return;
  }

  if (messages.length === 0) {
    toast('当前会话没有记录可清理', 'info');
    return;
  }

  const cardId = `inline-clean-${reqId}-${Date.now()}`;
  const roleIcons = { user: '💬', assistant: '🤖', system: '📎' };

  const displayList = messages.slice(-30);
  const offset = messages.length - displayList.length;

  const itemsHtml = displayList.map((m, i) => {
    const realIdx = offset + i;
    const icon = roleIcons[m.role] || '❓';
    const text = (m.content || '').replace(/\n/g, ' ').slice(0, 25);
    const label = text.length > 22 ? text.slice(0, 20) + '...' : text;
    const time = m.ts ? new Date(m.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
    return `<label style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;cursor:pointer;border-bottom:1px solid var(--border)">
      <input type="checkbox" class="clean-item-cb" value="${realIdx}" style="flex-shrink:0">
      <span style="flex-shrink:0">${icon}</span>
      <span style="color:var(--text2);flex-shrink:0;width:36px;font-size:11px">${time}</span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)">${escHtml(label)}</span>
    </label>`;
  }).join('');

  const html = `
    <div id="${cardId}" class="chat-inline-form" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;margin:6px 0">
      <div style="font-weight:600;font-size:14px;margin-bottom:4px">🧹 对话清理（自由对话）</div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:8px">
        共 ${messages.length} 条记录 · 显示最近 ${displayList.length} 条 · 勾选要清理的条目
      </div>
      <div style="margin:4px 0 8px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-small" onclick="document.querySelectorAll('#${cardId} .clean-item-cb').forEach(c=>c.checked=true)">☑️ 全选</button>
        <button class="btn-small" onclick="document.querySelectorAll('#${cardId} .clean-item-cb').forEach(c=>c.checked=false)">↩️ 取消</button>
        <button class="btn-small btn-primary" onclick="submitFreeCleanSelected('${cardId}','${reqId}')">🗑 清理选中</button>
        <button class="btn-small btn-reject" onclick="submitFreeCleanAll('${cardId}','${reqId}')">⚠️ 全部清理</button>
        <button class="btn-small" onclick="dismissInlineForm('${cardId}')">取消</button>
      </div>
      <div style="max-height:280px;overflow-y:auto;min-height:60px">${itemsHtml}</div>
    </div>
  `;

  const typing = stream.querySelector('.chat-typing');
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const card = temp.firstElementChild;
  if (typing) stream.insertBefore(card, typing);
  else stream.appendChild(card);
  stream.scrollTop = stream.scrollHeight;
}

async function submitFreeCleanSelected(cardId, reqId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const checked = card.querySelectorAll('.clean-item-cb:checked');
  if (checked.length === 0) return toast('请先勾选要清理的条目', 'warning');
  const indices = Array.from(checked).map(cb => parseInt(cb.value, 10)).filter(i => !isNaN(i));
  if (indices.length === 0) return toast('无有效选中', 'warning');
  try {
    const r = await api('POST', `/chat-sessions/${reqId}/clean`, { mode: 'selected', indices });
    card.remove();
    toast(`已清理 ${r.entries_removed || indices.length} 条记录，剩余 ${r.history_remaining || 0} 条`, 'success');
    // v0.117b：自由对话模式独立 reload chat 流（不能调 loadChatStream —— 它走 /requirements/:id/supplement-history 报 REQ_NOT_FOUND）
    setTimeout(() => { reloadFreeChatStream(reqId); }, 800);
  } catch (e) {
    toast('清理失败: ' + e.message, 'error');
  }
}

async function submitFreeCleanAll(cardId, reqId) {
  if (!window.confirm('确认清理全部对话记录？此操作不可撤销。')) return;
  try {
    const r = await api('POST', `/chat-sessions/${reqId}/clean`, { mode: 'all' });
    const card = document.getElementById(cardId);
    if (card) card.remove();
    toast(`已清理 ${r.entries_removed} 条记录`, 'success');
    setTimeout(() => { reloadFreeChatStream(reqId); }, 800);
  } catch (e) {
    toast('清理失败: ' + e.message, 'error');
  }
}

/**
 * v0.117b：自由对话清理后 reload chat 流
 *   不调 loadChatStream（走 /requirements/:id/supplement-history 会 REQ_NOT_FOUND）
 *   独立 fetch chat_messages + 重渲染气泡（与 chat.js loadChatSessionMessages 同模式，但内联避免跨模块耦合）
 */
async function reloadFreeChatStream(reqId) {
  if (!reqId || !reqId.startsWith('sess-')) return;
  const container = document.getElementById('chat-stream-msgs-' + reqId);
  if (!container) return;
  try {
    const r = await api('GET', '/chat-sessions/' + reqId + '/messages');
    const messages = (r && r.messages) || [];
    container.innerHTML = '';
    if (messages.length === 0) {
      container.innerHTML = '<div class="chat-free-welcome" style="text-align:center;padding:40px 20px;color:var(--text2)">'
        + '<div style="font-size:32px;margin-bottom:8px">💬</div>'
        + '<div style="font-size:15px;font-weight:500;color:var(--text);margin-bottom:4px">新对话</div>'
        + '<div style="font-size:12px">问我任何问题，AI 会基于知识库和互联网帮你解答</div>'
        + '</div>';
      if (window._chatState && window._chatState[reqId]) window._chatState[reqId].histCount = 0;
      return;
    }
    for (const m of messages) {
      if (typeof renderChatBubble === 'function') {
        renderChatBubble(container, { role: m.role, text: m.content || '', at: m.ts || new Date().toISOString() });
      }
    }
    if (window._chatState && window._chatState[reqId]) window._chatState[reqId].histCount = messages.length;
    if (typeof chatScrollToBottom === 'function') chatScrollToBottom(container);
  } catch (e) {
    console.error('[clean] reload chat 流失败:', e.message);
    // 清理本身已成功，UI reload 失败不影响
  }
}

/**
 * 渲染清理表单（内联）
 */
async function chatCleanPrompt(reqId) {
  if (!reqId) return;

  // ═══ v0.117 自由对话：调 chat_messages + /chat-sessions/:id/clean 独立路径 ═══
  //   旧实现 toast 拦截是因为没 requirement 关联，无法操作 supplement_history。
  //   新实现：自由对话有 sess-xxx → chat_messages 表，独立 REST 接口清理。
  if (reqId.startsWith('sess-')) {
    return await renderFreeChatCleanForm(reqId);
  }

  const stream = document.getElementById(`chat-stream-msgs-${reqId}`);
  if (!stream) return;

  // 加载历史
  let history;
  try {
    const resp = await api('GET', `/requirements/${reqId}/supplement-history`);
    history = resp.history || [];
  } catch (e) {
    toast('加载对话历史失败: ' + e.message, 'error');
    return;
  }

  if (history.length === 0) {
    toast('当前对话没有记录可清理', 'info');
    return;
  }

  const cardId = `inline-clean-${reqId}-${Date.now()}`;
  const roleIcons = { user: '💬', assistant: '🤖', system: '📎' };

  // 展示最近 30 条
  const displayList = history.slice(-30);
  const offset = history.length - displayList.length; // 真实索引偏移

  const itemsHtml = displayList.map((e, i) => {
    const realIdx = offset + i;
    const icon = roleIcons[e.role] || '❓';
    const text = (e.text || e.opening || '(空)').replace(/\n/g, ' ').slice(0, 25);
    const label = text.length > 22 ? text.slice(0, 20) + '...' : text;
    const time = e.at ? new Date(e.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
    return `<label style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;cursor:pointer;border-bottom:1px solid var(--border)">
      <input type="checkbox" class="clean-item-cb" value="${realIdx}" style="flex-shrink:0">
      <span style="flex-shrink:0">${icon}</span>
      <span style="color:var(--text2);flex-shrink:0;width:36px;font-size:11px">${time}</span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)">${escHtml(label)}</span>
    </label>`;
  }).join('');

  const html = `
    <div id="${cardId}" class="chat-inline-form" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;margin:6px 0">
      <div style="font-weight:600;font-size:14px;margin-bottom:4px">🧹 对话清理</div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:8px">
        共 ${history.length} 条记录 · 显示最近 ${displayList.length} 条 · 勾选要清理的条目
      </div>
      <div style="margin:4px 0 8px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-small" onclick="document.querySelectorAll('#${cardId} .clean-item-cb').forEach(c=>c.checked=true)">☑️ 全选</button>
        <button class="btn-small" onclick="document.querySelectorAll('#${cardId} .clean-item-cb').forEach(c=>c.checked=false)">↩️ 取消</button>
        <button class="btn-small btn-primary" onclick="submitCleanSelected('${cardId}','${reqId}')">🗑 清理选中</button>
        <button class="btn-small btn-reject" onclick="submitCleanAll('${cardId}','${reqId}')">⚠️ 全部清理</button>
        <button class="btn-small" onclick="dismissInlineForm('${cardId}')">取消</button>
      </div>
      <div style="max-height:280px;overflow-y:auto;min-height:60px">${itemsHtml}</div>
    </div>
  `;

  const typing = stream.querySelector('.chat-typing');
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const card = temp.firstElementChild;
  if (typing) stream.insertBefore(card, typing);
  else stream.appendChild(card);
  stream.scrollTop = stream.scrollHeight;
}

/**
 * 提交选中条目清理
 */
async function submitCleanSelected(cardId, reqId) {
  const card = document.getElementById(cardId);
  if (!card) return;

  const checked = card.querySelectorAll('.clean-item-cb:checked');
  if (checked.length === 0) return toast('请先勾选要清理的条目', 'warning');

  const indices = Array.from(checked).map(cb => parseInt(cb.value, 10)).filter(i => !isNaN(i));
  if (indices.length === 0) return toast('无有效选中', 'warning');

  try {
    await chatAssist(reqId, 'clean', { mode: 'selected', indices });
    card.remove();
    setTimeout(() => {
      if (window._chatState && window._chatState[reqId]) window._chatState[reqId].histCount = 0;
      if (typeof loadChatStream === 'function') loadChatStream(reqId);
    }, 1000);
  } catch (e) {
    toast('清理失败: ' + e.message, 'error');
  }
}

/**
 * 提交全部清理
 */
async function submitCleanAll(cardId, reqId) {
  if (!window.confirm('确认清理全部对话记录？此操作不可撤销。')) return;
  const card = document.getElementById(cardId);
  try {
    await chatAssist(reqId, 'clean', { mode: 'all' });
    if (card) card.remove();
    setTimeout(() => {
      if (window._chatState && window._chatState[reqId]) window._chatState[reqId].histCount = 0;
      if (typeof loadChatStream === 'function') loadChatStream(reqId);
    }, 1000);
  } catch (e) {
    toast('清理失败: ' + e.message, 'error');
  }
}
