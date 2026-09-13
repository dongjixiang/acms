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
 *   v0.22.51：数据源扩为两套（文字 + 工具卡片），否则卡片清不掉
 *     ① GET /api/chat-sessions/:id/messages          → 文字对话
 *     ② GET /api/requirements/sess-xxx/supplement-history → 工具结果卡片
 *   提交：POST /api/chat-sessions/:id/clean {mode, indices, cardIndices}
 */

/** 工具卡片条目 → 短标签（解析 text 里的 type） */
function cardEntryLabel(entry) {
  let type = '';
  try { type = (JSON.parse(entry.text || '{}').type) || ''; } catch (e) { type = ''; }
  const MAP = {
    music_card: '🎵 音乐卡片',
    screenplay_card: '📖 剧本卡片',
    screenplay_loading: '📖 剧本卡片（未完成）',
    screenplay_precheck: '📖 剧本卡片（未完成）',
    image_card: '🖼️ 图片卡片',
    video_card: '🎬 视频卡片',
    video_loading: '🎬 视频卡片（未完成）',
    search_result: '🔍 搜索结果',
  };
  return MAP[type] || ('🧩 工具卡片' + (type ? '（' + type + '）' : ''));
}

async function renderFreeChatCleanForm(reqId) {
  const stream = document.getElementById(`chat-stream-msgs-${reqId}`);
  if (!stream) { toast('找不到会话容器', 'error'); return; }

  // v0.22.51：自由对话的记录分两处存 —— 只列文字会出现「共 0 条记录可清理」
  //   但聊天流里/历史里明明还有工具卡片（永远清不掉的僵尸数据）
  let messages = [];
  let cards = [];
  try {
    const [msgResp, histResp] = await Promise.all([
      api('GET', `/chat-sessions/${reqId}/messages`),
      api('GET', `/requirements/${reqId}/supplement-history`).catch(function(e) {
        console.warn('[clean] supplement-history 读取失败:', e.message);
        return null;
      }),
    ]);
    messages = (msgResp && msgResp.messages) || [];
    cards = (histResp && Array.isArray(histResp.history)) ? histResp.history : [];
  } catch (e) {
    toast('加载会话历史失败: ' + e.message, 'error');
    return;
  }

  if (messages.length === 0 && cards.length === 0) {
    toast('当前会话没有记录可清理', 'info');
    return;
  }

  const cardId = `inline-clean-${reqId}-${Date.now()}`;
  const roleIcons = { user: '💬', assistant: '🤖', system: '📎' };

  // 合并成一个时间序列表（文字气泡 + 工具卡片），用户看到的顺序 = 实际发生顺序
  const items = [];
  messages.forEach(function(m, i) {
    items.push({ src: 'msg', idx: i, icon: roleIcons[m.role] || '❓', ts: m.ts, text: m.content || '(空)' });
  });
  cards.forEach(function(c, i) {
    items.push({ src: 'card', idx: i, icon: '🧩', ts: c.at, text: cardEntryLabel(c) });
  });
  items.sort(function(a, b) { return String(a.ts || '').localeCompare(String(b.ts || '')); });

  const displayList = items.slice(-30);

  const itemsHtml = displayList.map(it => {
    const text = it.text.replace(/\n/g, ' ').slice(0, 25);
    const label = text.length > 22 ? text.slice(0, 20) + '...' : text;
    const time = it.ts ? new Date(it.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
    return `<label style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;cursor:pointer;border-bottom:1px solid var(--border)">
      <input type="checkbox" class="clean-item-cb" value="${it.idx}" data-src="${it.src}" style="flex-shrink:0">
      <span style="flex-shrink:0">${it.icon}</span>
      <span style="color:var(--text2);flex-shrink:0;width:36px;font-size:11px">${time}</span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)">${escHtml(label)}</span>
    </label>`;
  }).join('');

  const html = `
    <div id="${cardId}" class="chat-inline-form" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;margin:6px 0">
      <div style="font-weight:600;font-size:14px;margin-bottom:4px">🧹 对话清理（自由对话）</div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:8px">
        共 ${items.length} 条记录（💬 文字 ${messages.length} · 🧩 卡片 ${cards.length}）· 显示最近 ${displayList.length} 条 · 勾选要清理的条目
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

/** 收集勾选项 → 按存储来源分流（chat_messages / supplement_history） */
function collectFreeCleanSelection(card) {
  const sel = { indices: [], cardIndices: [] };
  card.querySelectorAll('.clean-item-cb:checked').forEach(function(cb) {
    const idx = parseInt(cb.value, 10);
    if (isNaN(idx)) return;
    if (cb.dataset.src === 'card') sel.cardIndices.push(idx);
    else sel.indices.push(idx);
  });
  return sel;
}

async function submitFreeCleanSelected(cardId, reqId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const sel = collectFreeCleanSelection(card);
  if (sel.indices.length === 0 && sel.cardIndices.length === 0) {
    return toast('请先勾选要清理的条目', 'warning');
  }
  const total = sel.indices.length + sel.cardIndices.length;
  try {
    const r = await api('POST', `/chat-sessions/${reqId}/clean`, {
      mode: 'selected',
      indices: sel.indices,
      cardIndices: sel.cardIndices,
    });
    card.remove();
    toast(`已清理 ${total} 条记录，剩余 ${(r.history_remaining || 0) + (r.cards_remaining || 0)} 条`, 'success');
    // v0.117b：自由对话模式独立 reload chat 流（不能调 loadChatStream —— 它走 /requirements/:id/supplement-history 报 REQ_NOT_FOUND）
    setTimeout(() => { reloadFreeChatStream(reqId); }, 800);
  } catch (e) {
    toast('清理失败: ' + e.message, 'error');
  }
}

async function submitFreeCleanAll(cardId, reqId) {
  // P50b：禁止 window.confirm —— 统一走 ACMSModal
  const choice = await window.ACMSModal.show({
    title: '🧹 清理全部对话记录',
    size: 'md',
    html: '<div style="font-size:13px;line-height:1.6;">'
      + '<p>将清空这个会话里的<b>全部文字对话 + 工具卡片</b>（音乐/剧本/图片/视频/搜索结果）。</p>'
      + '<p style="color:var(--text3);font-size:11px;margin-top:8px;">⚠️ 此操作不可撤销。</p>'
      + '</div>',
    actions: [
      { label: '取消', value: 'CANCEL', className: 'acms-modal-btn' },
      { label: '🧹 全部清理', value: 'CONFIRM', className: 'acms-modal-btn acms-modal-btn-primary' },
    ],
  });
  if (choice !== 'CONFIRM') return;
  const card = document.getElementById(cardId);
  try {
    const r = await api('POST', `/chat-sessions/${reqId}/clean`, { mode: 'all' });
    if (card) card.remove();
    const removed = (r.entries_removed || 0) + (r.cards_removed || 0);
    toast(`已清理 ${removed} 条记录`, 'success');
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
    // v0.22.51 fix：水位线必须跟 startChatPolling 比对的那一套存储对齐
    //   文字在 chat_messages，工具卡片在隐藏 requirement 的 supplement_history
    //   旧代码用 messages.length 当水位线 → 清理后（messages=0）轮询会把历史卡片全量刷出
    const [r, histResp] = await Promise.all([
      api('GET', '/chat-sessions/' + reqId + '/messages'),
      api('GET', '/requirements/' + reqId + '/supplement-history').catch(function() { return null; }),
    ]);
    const messages = (r && r.messages) || [];
    const cardCount = (histResp && Array.isArray(histResp.history)) ? histResp.history.length : 0;
    container.innerHTML = '';
    if (messages.length === 0) {
      // 空 session：不显示欢迎（保留空容器）
      if (window._chatState && window._chatState[reqId]) window._chatState[reqId].histCount = cardCount;
      return;
    }
    for (const m of messages) {
      if (typeof renderChatBubble === 'function') {
        renderChatBubble(container, { role: m.role, text: m.content || '', at: m.ts || new Date().toISOString() });
      }
    }
    if (window._chatState && window._chatState[reqId]) window._chatState[reqId].histCount = cardCount;
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
  // P50b：禁止 window.confirm —— 统一走 ACMSModal
  const choice = await window.ACMSModal.show({
    title: '🧹 清理全部对话记录',
    size: 'md',
    html: '<div style="font-size:13px;line-height:1.6;">'
      + '<p>将清空本条需求的全部对话记录（文字 + 辅助卡片）。</p>'
      + '<p style="color:var(--text3);font-size:11px;margin-top:8px;">⚠️ 此操作不可撤销。</p>'
      + '</div>',
    actions: [
      { label: '取消', value: 'CANCEL', className: 'acms-modal-btn' },
      { label: '🧹 全部清理', value: 'CONFIRM', className: 'acms-modal-btn acms-modal-btn-primary' },
    ],
  });
  if (choice !== 'CONFIRM') return;
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
