// ACMS · 剧本辅助（v0.22，2026-06-28）
//   Method: screenplay | Name: 短视频剧本
//
// 渲染：3 个剧本选项卡 + 选中 + 换一批
// 全局函数：
// ACMS · 剧本辅助（v0.22，2026-06-28）
//   Method: screenplay | Name: 短视频剧本
//
// 渲染（v0.22.8 用 screenplay-core.js 单一来源）：
//   - 调 ACMSScreenplayCard.renderDetail() 渲染
//   - 同一份 render 也在 chat.js 聊天流卡片用
//
// 全局函数：
//   - chatScreenplayPrompt(reqId)：内联表单（创意+时长）→ 调 chatAssist
//   - selectScreenplay(reqId, idx)：选中后写聊天流+填入输入框
//   - screenplayGenImage(reqId, assetType, assetKey, prompt)：为角色/场景生成图
//   - screenplayGenVideo(reqId, sceneIdx)：为分镜头生成视频

(function () {
  function render(reqId, data) {
    // v0.22.8: 单一来源 — 全调 screenplay-core
    if (window.ACMSScreenplayCard) {
      return window.ACMSScreenplayCard.renderDetail(reqId, data);
    }
    // 兜底（core 未加载时）
    if (!data) return '';
    if (data.status === 'generating') {
      return '<div class="insight-loading">⏳ 正在生成 3 个剧本方案…</div>';
    }
    if (data.status === 'failed') {
      return `<div class="insight-error">❌ 生成失败：${escHtml(data.error || '未知错误')}</div>`;
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
        <div class="assist-regen-row">
          <button class="btn-small btn-secondary" onclick="ACMSAssistDispatcher.regenerateBatch('${reqId}', 'screenplay')" title="让 AI 再生成 3 个明显不同的剧本">🔄 都不满意，再换一批</button>
        </div>
      `;
    }
    return '';
  }

  window.ACMSAssists.register('screenplay', { name: '短视频剧本（角色/场景/分镜头联动）', render });
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
    if (!window._explicitAssist) window._explicitAssist = {};
    window._explicitAssist[reqId] = 'screenplay';
    await chatAssist(reqId, 'screenplay', { idea, target_seconds: targetSeconds });
    card.remove();
  } catch (e) {
    toast('生成失败: ' + e.message, 'error');
  }
}

/**
 * 选中剧本 → 写聊天流 + 填输入框
 */
async function selectScreenplay(reqId, idx) {
  try {
    await ACMSAssistDispatcher.useAssist(reqId, 'screenplay', { idx });
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
    if (typeof startChatPolling === 'function') startChatPolling(reqId);
    toast('🎬 剧本已填入输入框，可编辑后再发给 AI', 'success', 2500);
  } catch (e) {
    toast('选择失败: ' + e.message, 'error');
  }
}

/**
 * 构造剧本 markdown（填入输入框 + 写入聊天流）
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

/**
 * v0.22.8: 为角色/场景生成图
 *   1. 弹内联表单（pre-fill prompt=assetType/assetKey 对应描述）
 *   2. 调 image_gen
 *   3. 完成后调 screenplay.use 写回 assets
 */
async function screenplayGenImage(reqId, assetType, assetKey, defaultPrompt) {
  // 用 window.prompt 拿 prompt（最简实现，先不做完整内联表单）
  const prompt = (window.prompt(`🎨 为「${assetKey}」生成图，描述词：`, defaultPrompt) || '').trim();
  if (!prompt) return;

  // 显示一个临时 loading 卡片在聊天流
  const stream = document.getElementById(`chat-stream-msgs-${reqId}`);
  const tempCard = document.createElement('div');
  tempCard.className = 'assist-loading-card';
  tempCard.dataset.method = 'image_gen';
  tempCard.dataset.tempFor = `${assetType}_${assetKey}`;
  tempCard.innerHTML = `<div class="assist-loading-head"><span class="assist-loading-spinner">⏳</span><span class="assist-loading-title">🎨 正在为「${assetKey}」生成 3 张候选图…</span></div>`;
  stream.appendChild(tempCard);
  stream.scrollTop = stream.scrollHeight;

  try {
    // 1. 触发 image_gen
    await chatAssist(reqId, 'image_gen', { prompt, n: 3, _attach_to: { type: 'screenplay', assetType, assetKey } });

    // 2. 轮询直到 done
    let imgData = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const r = await api('GET', `/requirements/${reqId}/assist`);
      imgData = r.assists?.image_gen;
      if (imgData?.status === 'done' || imgData?.status === 'failed') break;
    }
    tempCard.remove();
    if (!imgData || imgData.status !== 'done') {
      toast('❌ 图片生成失败', 'error');
      return;
    }

    // 3. 默认选第 0 张，写回 screenplay
    await api('POST', `/requirements/${reqId}/assist/screenplay/use`, {
      action: 'set_asset',
      asset_type: assetType,
      asset_key: assetKey,
      options: imgData.options || [],
      picked_idx: 0,
    });

    // 4. 刷新聊天流
    if (typeof startChatPolling === 'function') startChatPolling(reqId);
    toast('✅ 已为「' + assetKey + '」生成 3 张候选（默认选第 1 张）', 'success', 2500);
  } catch (e) {
    tempCard.remove();
    toast('生成失败: ' + e.message, 'error');
  }
}

/**
 * v0.22.8: 为分镜头生成视频
 *   1. 调 video assist（pre-fill scene prompt + character/scene asset）
 *   2. 轮询直到 done
 *   3. 写回 scene_videos[sceneIdx]
 */
async function screenplayGenVideo(reqId, sceneIdx) {
  try {
    // 读当前 screenplay 数据拿 scene 内容
    const r = await api('GET', `/requirements/${reqId}/assist`);
    const sp = r.assists?.screenplay;
    if (!sp || sp.picked === null || sp.picked === undefined) {
      toast('请先选一个剧本', 'warning');
      return;
    }
    const screenplay = sp.screenplays[sp.picked];
    const scene = screenplay.scenes?.[sceneIdx];
    if (!scene) {
      toast('分镜头数据缺失', 'error');
      return;
    }

    // 构造 prompt（角色 + 场景 + 分镜）
    const characterName = (screenplay.characters || [])[0]?.name || 'character';
    const prompt = [
      scene.shot || '',
      scene.action || '',
      scene.dialogue && scene.dialogue !== '——' ? `Says: "${scene.dialogue}"` : '',
    ].filter(Boolean).join('. ');

    // 显示 loading
    const stream = document.getElementById(`chat-stream-msgs-${reqId}`);
    const tempCard = document.createElement('div');
    tempCard.className = 'assist-loading-card';
    tempCard.dataset.method = 'video';
    tempCard.dataset.tempFor = `scene_${sceneIdx}`;
    tempCard.innerHTML = `<div class="assist-loading-head"><span class="assist-loading-spinner">⏳</span><span class="assist-loading-title">🎥 正在为分镜头 ${sceneIdx + 1} 生成视频（最长 5 分钟）…</span></div>`;
    stream.appendChild(tempCard);
    stream.scrollTop = stream.scrollHeight;

    // 触发 video
    await chatAssist(reqId, 'video', { prompt, duration: sp.target_seconds || 30, _attach_to: { type: 'screenplay', sceneIdx } });

    // 轮询直到拿到 video_url（video 是异步任务）
    let videoData = null;
    for (let i = 0; i < 60; i++) {  // 5 分钟
      await new Promise(r => setTimeout(r, 5000));
      const r2 = await api('POST', `/requirements/${reqId}/assist/video/query`);
      if (r2 && r2.video_url) { videoData = r2; break; }
      if (r2 && r2.status === 'failed') break;
    }
    tempCard.remove();
    if (!videoData || !videoData.video_url) {
      toast('❌ 视频生成失败', 'error');
      return;
    }

    // 写回 scene_videos
    await api('POST', `/requirements/${reqId}/assist/screenplay/use`, {
      action: 'set_scene_video',
      scene_idx: sceneIdx,
      video_id: videoData.video_id,
      video_url: videoData.video_url,
      asset_path: videoData.asset_path,
      status: 'done',
    });
    if (typeof startChatPolling === 'function') startChatPolling(reqId);
    toast('🎥 分镜头 ' + (sceneIdx + 1) + ' 视频已生成', 'success', 2500);
  } catch (e) {
    toast('生成失败: ' + e.message, 'error');
  }
}
