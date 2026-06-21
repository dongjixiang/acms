// ===== 描述历史弹窗（v0.3.2 增量，v0.13 抽公共）=====
// 抽自 client/js/views/requirements.js（原 L2503-2616，2026-06-21）
// 跨文件依赖：api / escHtml / toast / showConfirm（全局），openRequirement（主文件）
// 加载顺序：本文件必须在 requirements.js 之前（保证 openRequirement 已定义）

/** 打开描述历史弹窗（v0.3.2 增量） */
async function showDescriptionHistory(reqId) {
  if (document.getElementById('desc-history-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'desc-history-overlay';
  overlay.className = 'modal-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) closeDescriptionHistory(); };
  overlay.innerHTML = `
    <div class="modal-content" style="width:82vw;max-width:900px;max-height:82vh;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0">📜 描述历史</h3>
        <button class="btn-small btn-reject" onclick="closeDescriptionHistory()">✕ 关闭</button>
      </div>
      <div id="desc-history-body" style="flex:1;overflow-y:auto;padding-right:8px">
        <div style="text-align:center;padding:20px;color:var(--text2)">⏳ 加载中…</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // 加载历史
  try {
    const resp = await api('GET', `/requirements/${reqId}/description-history`);
    renderDescriptionHistory(reqId, resp);
  } catch (e) {
    document.getElementById('desc-history-body').innerHTML = `<div style="text-align:center;padding:20px;color:var(--red)">❌ ${escHtml(e.message)}</div>`;
  }
}

function renderDescriptionHistory(reqId, data) {
  const body = document.getElementById('desc-history-body');
  const history = data.history || [];
  const current = data.currentDescription || '';

  if (history.length === 0) {
    body.innerHTML = `
      <div style="text-align:center;padding:30px;color:var(--text2)">
        <div style="font-size:14px;margin-bottom:8px">📭 暂无历史版本</div>
        <div style="font-size:12px">当你点击「💡 补充想法并重整」或勾选特色时，会保留旧版描述到这里</div>
      </div>
    `;
    return;
  }

  // 按时间倒序展示（最新在最上面）
  const sorted = [...history].reverse();
  const itemsHtml = sorted.map((h, i) => {
    const realIdx = history.length - 1 - i;  // 对应原始索引
    const time = h.rewritten_at ? new Date(h.rewritten_at).toLocaleString() : '未知时间';
    const supplementHtml = h.supplement
      ? `<div style="margin-top:6px;padding:6px 8px;background:rgba(139,92,246,0.08);border-left:2px solid var(--accent);border-radius:0 4px 4px 0;font-size:11px;color:var(--text2)">
          💡 触发补充: ${escHtml(h.supplement)}
        </div>`
      : '';
    return `
      <div class="desc-history-item" data-history-idx="${realIdx}" style="margin-bottom:14px;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <strong style="font-size:12px;color:var(--text)">📄 v${realIdx + 1}</strong>
          <span style="font-size:10px;color:var(--text2)">${time}</span>
        </div>
        ${supplementHtml}
        <div class="desc-history-text" data-idx="${realIdx}" style="margin-top:8px;font-size:12px;color:var(--text);line-height:1.6;white-space:pre-wrap;max-height:240px;overflow-y:auto;padding:8px;background:var(--bg);border-radius:4px">${escHtml(h.description || '(空)')}</div>
        <div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end">
          <button class="btn-small" onclick="restoreDescriptionHistory('${reqId}', ${realIdx})" title="用这个旧版本替换当前描述（会触发重新生成思路）">↩️ 用此版本覆盖当前</button>
        </div>
      </div>
    `;
  }).join('');

  // 当前版本（最上面，最显眼）
  const currentHtml = `
    <div class="desc-history-item" style="margin-bottom:14px;padding:12px;background:rgba(78,205,196,0.08);border:2px solid var(--green);border-radius:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <strong style="font-size:12px;color:var(--green)">✨ 当前版本</strong>
        <span style="font-size:10px;color:var(--text2)">最新</span>
      </div>
      <div style="margin-top:8px;font-size:12px;color:var(--text);line-height:1.6;white-space:pre-wrap;max-height:240px;overflow-y:auto;padding:8px;background:var(--bg);border-radius:4px">${escHtml(current)}</div>
    </div>
  `;

  body.innerHTML = currentHtml + itemsHtml;
}

// 「用此版本覆盖当前」：把旧版本当 supplement 写回去，让 LLM 重新组织（保留手动选择痕迹 + 重新生成思路）
async function restoreDescriptionHistory(reqId, historyIdx) {
  if (!await showConfirm('用此旧版本覆盖当前描述？\n\n会触发 AI 重新组织（基于你选中的旧版）并重新生成决策树。', { type: 'warning' })) return;
  toast('⏳ 正在恢复并重新组织…', 'info', 2000);
  try {
    // 把"用 history v{idx} 替换"作为 supplement，原文会让 LLM 知道意图
    // 实际做法：直接把 history[historyIdx].description 写回 req.description，再触发 regen
    // 简化：调 rewrite，supplement 携带"用户选择恢复历史版本"的意图
    const resp = await api('POST', `/requirements/${reqId}/rewrite-description`, {
      supplement: `(用户操作：从描述历史中选择了 v${historyIdx + 1} 版本作为基础，请基于此重整)`,
      modelId: null,  // 让后端自动选可用文本模型（避免硬编码 ID 在不同服务器上找不到）
      autoRegenBrief: true,
    });
    if (resp.error) {
      toast('恢复失败: ' + resp.error, 'error');
      return;
    }
    toast('✅ 已恢复，思路正在重生…', 'success', 2000);
    closeDescriptionHistory();
    setTimeout(() => openRequirement(reqId), 500);
  } catch (e) {
    toast('恢复失败: ' + e.message, 'error');
  }
}

function closeDescriptionHistory() {
  const overlay = document.getElementById('desc-history-overlay');
  if (overlay) overlay.remove();
}
