// ACMS · 剧本辅助（v0.22，2026-06-28）
//   Method: screenplay | Name: 短视频剧本
//
// 渲染：3 个剧本选项卡 + 选中 + 换一批
// 全局函数：
//   - chatScreenplayPrompt(reqId)：内联表单（创意+时长）→ 调 chatAssist
//   - selectScreenplay(reqId, idx)：选中后写聊天流+填入输入框
//
// 流程（按 P11 教训）：
//   1. 用户点 🎬 剧本 → 内联表单 → 提交
//   2. chatAssist('screenplay', {idea, target_seconds}) → 后端生成 3 剧本
//   3. SSE done → 聊天流里 renderLeisureResult 渲染 3 选项卡
//   4. 用户点某个剧本 → 调 markPicked → 后端写 supplement_history
//   5. 前端读最新 data → 把剧本 markdown 填入输入框（用户可编辑后再发）
//   6. 用户点「换一批」→ regenerateBatch → 重新生成 3 个明显不同的

(function () {
  function render(reqId, data) {
    if (!data) return '';
    if (data.status === 'generating') {
      return `<div class="insight-loading">⏳ 正在生成 3 个剧本方案（${data.target_seconds || 30}s）…</div>`;
    }
    if (data.status === 'failed') {
      const errMsg = data.error === 'NO_IDEA'
        ? '❌ 请输入创意描述。点击 🎬 剧本 按钮重新尝试。'
        : `❌ 生成失败：${escHtml(data.error || '未知错误')}`;
      return `<div class="insight-error">${errMsg}</div>`;
    }
    if (data.status === 'done' && Array.isArray(data.screenplays)) {
      const screenplays = data.screenplays;
      const cards = screenplays.map((sp, i) => {
        const isPicked = data.picked === i;
        return `
        <div class="assist-card ${isPicked ? 'assist-card-picked' : ''}" data-screenplay-idx="${i}">
          <div class="assist-card-header">
            <span class="assist-card-letter">${String.fromCharCode(65+i)}</span>
            <strong>${escHtml(sp.title || '(无标题)')}</strong>
            ${isPicked ? '<span class="assist-picked-badge">✅ 你选的</span>' : ''}
          </div>
          <div class="assist-card-row" style="font-style:italic;color:var(--text2);margin:4px 0">${escHtml(sp.logline || '')}</div>
          ${sp.characters && sp.characters.length ? `
            <div class="assist-card-row"><span class="assist-label">角色：</span>${sp.characters.map(c => escHtml(c.name || '') + (c.desc ? '（' + escHtml(c.desc) + '）' : '')).join('、')}</div>
          ` : ''}
          ${sp.setting ? `<div class="assist-card-row"><span class="assist-label">场景：</span>${escHtml(sp.setting)}</div>` : ''}
          <div class="assist-card-row"><span class="assist-label">分镜：</span>${(sp.scenes || []).length} 场 · ${data.target_seconds || 30}s</div>
          <details style="margin-top:4px">
            <summary style="font-size:11px;color:var(--text2);cursor:pointer">📖 查看完整分镜</summary>
            <div style="padding:6px 0;font-size:11px;color:var(--text)">
              ${(sp.scenes || []).map(sc => `
                <div style="margin:3px 0;padding:4px;border-left:2px solid var(--border)">
                  <div style="color:var(--accent);font-weight:600">⏱ ${escHtml(sc.time || '?')}</div>
                  ${sc.shot ? `<div>📷 ${escHtml(sc.shot)}</div>` : ''}
                  ${sc.dialogue && sc.dialogue !== '——' ? `<div>💬 ${escHtml(sc.dialogue)}</div>` : ''}
                  ${sc.action ? `<div>🎬 ${escHtml(sc.action)}</div>` : ''}
                </div>
              `).join('')}
              ${sp.shot_tips ? `<div style="margin-top:4px;color:var(--text2)">💡 拍摄建议：${escHtml(sp.shot_tips)}</div>` : ''}
            </div>
          </details>
          <button class="btn-small btn-primary assist-pick-btn" onclick="selectScreenplay('${reqId}', ${i})">
            ${isPicked ? '✅ 已选 · 已填入输入框' : '👆 选这个剧本'}
          </button>
        </div>
        `;
      }).join('');

      return `
        <div class="assist-section-title">🎬 短视频剧本 · 3 个方向</div>
        <div class="assist-intro">挑一个最合心意的剧本——选中后会自动填到下方输入框，你可以修改后再发给 AI 继续打磨。</div>
        <div style="font-size:11px;color:var(--text2);margin-bottom:6px">基于：${escHtml(data.idea || '')} · ${data.target_seconds || 30}s</div>
        <div class="assist-grid">${cards}</div>
        <!-- v0.22：「都不满意，再换一批」按钮（dispatcher.regenerateBatch）-->
        <div class="assist-regen-row">
          <button class="btn-small btn-secondary" onclick="ACMSAssistDispatcher.regenerateBatch('${reqId}', 'screenplay')" title="让 AI 再生成 3 个明显不同的剧本">🔄 都不满意，再换一批</button>
        </div>
      `;
    }
    return '';
  }

  window.ACMSAssists.register('screenplay', { name: '短视频剧本（3 个剧本选项）', render });
})();

/**
 * 渲染剧本表单（内联）— 替代 window.prompt（按 6/27 偏好）
 */
async function chatScreenplayPrompt(reqId) {
  if (!reqId) return;
  const stream = document.getElementById(`chat-stream-msgs-${reqId}`);
  if (!stream) return;

  const cardId = `inline-screenplay-${reqId}-${Date.now()}`;

  const html = `
    <div id="${cardId}" class="chat-inline-form" data-method="screenplay" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;margin:6px 0">
      <div style="font-weight:600;font-size:14px;margin-bottom:4px">🎬 短视频剧本</div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:8px">
        描述你的创意想法，AI 会生成 3 个明显不同风格的剧本让你挑。
      </div>
      <div style="margin:6px 0">
        <label style="display:block;font-size:12px;margin-bottom:3px;color:var(--text2)">创意描述（一句话即可）</label>
        <textarea id="${cardId}-idea" rows="2" placeholder="例：一只猫在雨天咖啡馆等主人回来" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:4px;font-size:13px;resize:vertical">一只猫在雨天咖啡馆等主人回来</textarea>
      </div>
      <div style="margin:6px 0">
        <label style="display:block;font-size:12px;margin-bottom:3px;color:var(--text2)">目标时长</label>
        <select id="${cardId}-duration" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:4px;font-size:13px">
          <option value="15">15 秒（短预告，约 3 场）</option>
          <option value="30" selected>30 秒（抖音/小红书，约 5 场）</option>
          <option value="60">60 秒（YouTube Shorts/西瓜，约 7 场）</option>
        </select>
      </div>
      <div style="margin:8px 0 0;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-small btn-primary" onclick="submitScreenplayForm('${cardId}','${reqId}')">🎬 生成 3 个剧本</button>
        <button class="btn-small" onclick="dismissInlineForm('${cardId}')">取消</button>
      </div>
    </div>
  `;

  const typing = stream.querySelector('.chat-typing');
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const card = temp.firstElementChild;
  if (typing) stream.insertBefore(card, typing);
  else stream.appendChild(card);
  stream.scrollTop = stream.scrollHeight;

  // 自动 focus 到输入框
  setTimeout(() => {
    const ta = document.getElementById(`${cardId}-idea`);
    if (ta) { ta.focus(); ta.select(); }
  }, 100);
}

/**
 * 提交剧本表单 → 调 chatAssist 触发
 */
async function submitScreenplayForm(cardId, reqId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const idea = (card.querySelector(`#${cardId}-idea`)?.value || '').trim();
  const targetSeconds = parseInt(card.querySelector(`#${cardId}-duration`)?.value || '30');
  if (!idea) return toast('请输入创意描述', 'warning');

  try {
    // 标记为显式调用 → dispatcher 持续显示（即使生成完毕）
    if (!window._explicitAssist) window._explicitAssist = {};
    window._explicitAssist[reqId] = 'screenplay';
    await chatAssist(reqId, 'screenplay', { idea, target_seconds: targetSeconds });
    card.remove();
  } catch (e) {
    toast('生成失败: ' + e.message, 'error');
  }
}

/**
 * 选中某个剧本：
 *  1. 调后端 markPicked（写 supplement_history + 标记 picked）
 *  2. 把剧本 markdown 填入输入框（让用户编辑后再发）
 *  3. 触发聊天流刷新（poller 检测到新 entry 自动渲染）
 */
async function selectScreenplay(reqId, idx) {
  try {
    // 1. 调后端 use 路由（dispatcher.useAssist 已封一层）
    await ACMSAssistDispatcher.useAssist(reqId, 'screenplay', { idx });
    // 2. 读最新 data，构造 markdown 填入输入框
    const resp = await api('GET', `/requirements/${reqId}/assist`);
    const data = resp.assists?.screenplay;
    if (!data || !data.screenplays?.[idx]) {
      toast('⚠️ 剧本数据丢失，请刷新页面', 'error');
      return;
    }
    const sp = data.screenplays[idx];
    const md = buildScreenplayMarkdown(sp, data, idx);
    const input = document.getElementById(`chat-input-${reqId}`);
    if (input) {
      input.value = md;
      input.focus();
      if (typeof chatAutoGrow === 'function') chatAutoGrow(input);
    }
    // 3. 触发聊天流刷新（poller 已起，会自动捡到 supplement_history 新条目）
    if (typeof startChatPolling === 'function') startChatPolling(reqId);
    toast('🎬 剧本已填入输入框，可编辑后再发给 AI', 'success', 2500);
  } catch (e) {
    toast('选择失败: ' + e.message, 'error');
  }
}

/**
 * 构造剧本的 markdown（填入输入框 + 写入聊天流）
 */
function buildScreenplayMarkdown(sp, data, idx) {
  const lines = [];
  lines.push(`# 选中的剧本：${sp.title || ''}`);
  if (sp.logline) lines.push(`> ${sp.logline}`);
  lines.push('');
  if (sp.characters && sp.characters.length) {
    lines.push(`**角色**：${sp.characters.map(c => `${c.name}${c.desc ? '（' + c.desc + '）' : ''}`).join('、')}`);
  }
  if (sp.setting) lines.push(`**场景**：${sp.setting}`);
  if (data.target_seconds) lines.push(`**时长**：${data.target_seconds}s（${(sp.scenes || []).length} 场分镜）`);
  lines.push('');
  lines.push('## 分镜');
  (sp.scenes || []).forEach((sc, i) => {
    lines.push(`### ${i + 1}. ${sc.time || ''}`);
    if (sc.shot) lines.push(`- 📷 **镜头**：${sc.shot}`);
    if (sc.dialogue && sc.dialogue !== '——') lines.push(`- 💬 **对白**：${sc.dialogue}`);
    if (sc.action) lines.push(`- 🎬 **动作**：${sc.action}`);
    lines.push('');
  });
  if (sp.shot_tips) {
    lines.push('## 拍摄建议');
    lines.push(sp.shot_tips);
    lines.push('');
  }
  lines.push('---');
  lines.push('（请基于这个剧本告诉我你的修改意见，或者直接说「按这个生成视频」）');
  return lines.join('\n');
}
