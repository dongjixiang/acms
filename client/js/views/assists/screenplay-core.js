// ACMS · 剧本辅助核心渲染（v0.22.8，2026-06-28）
//   v0.22 单一来源：assist 侧栏 + 聊天流卡片都用这份 render
//   渲染：角色 / 场景 / 分镜头 3 大块 + 内嵌"生成图/视频"按钮
//
// 接入方式：
//   - assists/screenplay.js 侧栏 render(reqId, data) → 调 ACMSScreenplayCard.renderDetail()
//   - chat.js renderScreenplayBubble(jsonText) → 同上
//
// 全局对象：window.ACMSScreenplayCard = { renderDetail, getProjectIdForReq, ... }

(function () {
  /**
   * 主渲染函数
   *   data = 完整 assist_screenplay JSON
   *   返回 HTML 字符串
   */
  function renderDetail(reqId, data) {
    if (!data) return '';
    if (data.status === 'generating') {
      return '<div class="insight-loading">⏳ 正在生成 3 个剧本方案…</div>';
    }
    if (data.status === 'failed') {
      return `<div class="insight-error">❌ 生成失败：${escHtml(data.error || '未知错误')}</div>`;
    }
    if (data.status === 'done' && !data.picked && data.picked !== 0) {
      return renderPickScreenplayList(reqId, data);
    }
    if (data.status === 'done' && (data.picked !== null && data.picked !== undefined)) {
      return renderSelectedScreenplay(reqId, data);
    }
    return '';
  }

  /** 3 个剧本选项卡（未选状态） */
  function renderPickScreenplayList(reqId, data) {
    const screenplays = data.screenplays || [];
    const cards = screenplays.map((sp, i) => {
      const isPicked = data.picked === i;
      return `
      <div class="assist-card ${isPicked ? 'assist-card-picked' : ''}" data-screenplay-idx="${i}">
        <div class="assist-card-header">
          <span class="assist-card-letter">${String.fromCharCode(65 + i)}</span>
          <strong>${escHtml(sp.title || '(无标题)')}</strong>
          ${isPicked ? '<span class="assist-picked-badge">✅ 你选的</span>' : ''}
        </div>
        <div class="assist-card-row" style="font-style:italic;color:var(--text2);margin:4px 0">${escHtml(sp.logline || '')}</div>
        ${sp.characters && sp.characters.length ? `
          <div class="assist-card-row"><span class="assist-label">角色：</span>${sp.characters.map(c => escHtml(c.name || '') + (c.desc ? '（' + escHtml(c.desc) + '）' : '')).join('、')}</div>
        ` : ''}
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

  /**
   * 已选剧本 → 渲染角色/场景/分镜头 3 大块 + 内嵌按钮
   */
  function renderSelectedScreenplay(reqId, data) {
    const sp = data.screenplays[data.picked];
    if (!sp) return '<div class="insight-error">剧本数据丢失</div>';

    const characters = sp.characters || [];
    const scenes = sp.scenes || [];
    const assets = data.assets || { characters: {}, scenes: {} };
    const sceneVideos = data.scene_videos || {};
    const target = data.target_seconds || 30;

    // 角色区块
    const charactersHtml = characters.map((c, idx) => {
      const name = c.name || `角色${idx + 1}`;
      const desc = c.desc || '';
      const asset = assets.characters?.[name];
      const imgAsset = asset?.asset_path;
      const imgSrc = imgAsset
        ? `/api/generate/assets/${encodeURIComponent(data.project_id || 'default')}/${imgAsset}`
        : asset?.image_url_output;
      return `
        <div class="screenplay-asset-block" style="margin:8px 0;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1">
              <div style="font-weight:600;font-size:13px">👤 ${escHtml(name)}</div>
              <div style="font-size:11px;color:var(--text2);margin-top:2px">${escHtml(desc)}</div>
            </div>
            ${imgSrc ? `<img src="${escHtml(imgSrc)}" style="width:60px;height:60px;object-fit:cover;border-radius:4px" alt="角色图" />` : ''}
            <button class="btn-small" onclick="screenplayGenImageForm('${reqId}', 'character', '${escHtml(name).replace(/'/g, "\\'")}', '${escHtml(desc).replace(/'/g, "\\'")}')">
              ${imgSrc ? '🔄 重生成' : '🎨 生成图'}
            </button>
          </div>
          ${asset?.options?.length > 1 ? `<div style="font-size:10px;color:var(--text3);margin-top:4px">已选第 ${(asset.picked_idx || 0) + 1} 张 · 共 ${asset.options.length} 张候选</div>` : ''}
        </div>
      `;
    }).join('');

    // 场景区块（每个分镜 = 一个场景图？目前简化：1 个场景图，对应 setting）
    const sceneKey = '0';
    const sceneAsset = assets.scenes?.[sceneKey];
    const sceneImgAsset = sceneAsset?.asset_path;
    const sceneImgSrc = sceneImgAsset
      ? `/api/generate/assets/${encodeURIComponent(data.project_id || 'default')}/${sceneImgAsset}`
      : sceneAsset?.image_url_output;
    const sceneBlock = `
      <div class="screenplay-asset-block" style="margin:8px 0;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1">
            <div style="font-weight:600;font-size:13px">🎬 场景设定</div>
            <div style="font-size:11px;color:var(--text2);margin-top:2px">${escHtml(sp.setting || '（未填）')}</div>
          </div>
          ${sceneImgSrc ? `<img src="${escHtml(sceneImgSrc)}" style="width:60px;height:60px;object-fit:cover;border-radius:4px" alt="场景图" />` : ''}
          <button class="btn-small" onclick="screenplayGenImageForm('${reqId}', 'scene', '0', '${escHtml(sp.setting || '').replace(/'/g, "\\'")}')">
            ${sceneImgSrc ? '🔄 重生成' : '🎨 生成图'}
          </button>
        </div>
      </div>
    `;

    // 分镜头区块
    const scenesHtml = scenes.map((sc, idx) => {
      const video = sceneVideos[String(idx)];
      const videoSrc = video?.asset_path
        ? `/api/generate/assets/${encodeURIComponent(data.project_id || 'default')}/${video.asset_path}`
        : video?.video_url;
      const hasVideo = !!videoSrc;
      const characterAsset = characters.length > 0 ? assets.characters?.[characters[0].name] : null;
      const hasAllAssets = characterAsset?.asset_path && sceneImgAsset;
      const disabledHint = hasAllAssets ? '' : '（需先生成角色图 + 场景图）';

      return `
        <div class="screenplay-scene-block" style="margin:6px 0;padding:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="font-size:12px;color:var(--accent);font-weight:600">⏱ ${escHtml(sc.time || '?')} · 场 ${idx + 1}</span>
          </div>
          <div style="font-size:12px;line-height:1.6">
            ${sc.shot ? `<div>📷 <strong>镜头：</strong>${escHtml(sc.shot)}</div>` : ''}
            ${sc.dialogue && sc.dialogue !== '——' ? `<div>💬 <strong>对白：</strong>${escHtml(sc.dialogue)}</div>` : ''}
            ${sc.action ? `<div>🎬 <strong>动作：</strong>${escHtml(sc.action)}</div>` : ''}
          </div>
          ${hasVideo ? `
            <div style="margin-top:6px">
              <video controls style="width:100%;max-width:320px;border-radius:4px" src="${escHtml(videoSrc)}"></video>
              <div style="font-size:10px;color:var(--text2);margin-top:2px">✅ 视频已生成${video.asset_path ? '（已保存到本地）' : ''}</div>
            </div>
          ` : `
            <div style="margin-top:6px">
              <button class="btn-small" ${hasAllAssets ? '' : 'disabled'} onclick="screenplayGenVideo('${reqId}', ${idx})" style="font-size:11px">
                🎥 生成视频${disabledHint}
              </button>
            </div>
          `}
        </div>
      `;
    }).join('');

    return `
      <div class="assist-section-title">🎬 ${escHtml(sp.title || '')}</div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:4px">基于：${escHtml(data.idea || '')} · ${target}s · ${scenes.length} 场</div>
      <div style="font-style:italic;color:var(--text2);font-size:12px;margin-bottom:8px">${escHtml(sp.logline || '')}</div>

      ${characters.length > 0 ? `
        <div class="screenplay-section-block">
          <div class="screenplay-section-title">👤 角色（${characters.length}）</div>
          ${charactersHtml}
        </div>
      ` : ''}

      <div class="screenplay-section-block">
        <div class="screenplay-section-title">🎬 场景</div>
        ${sceneBlock}
      </div>

      <div class="screenplay-section-block">
        <div class="screenplay-section-title">🎞 分镜头（${scenes.length} 场）</div>
        ${scenesHtml}
      </div>

      <div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--border)">
        <button class="btn-small btn-secondary" onclick="ACMSAssistDispatcher.regenerateBatch('${reqId}', 'screenplay')" title="换一批剧本">🔄 换一批剧本</button>
      </div>
    `;
  }

  /**
   * 解析聊天流 screenplay_result 卡片 → 调 renderDetail
   *   entry.text 是 JSON 字符串（含 screenplay + meta）
   */
  function renderFromChatEntry(reqId, jsonText) {
    if (!jsonText) return '<div class="chat-system-msg">📖 剧本结果（数据为空）</div>';
    let card;
    try { card = JSON.parse(jsonText); } catch { return `<div class="chat-system-msg">${escHtml((jsonText || '').slice(0, 100))}</div>`; }
    if (card.type !== 'screenplay_card' || !card.screenplay) {
      return `<div class="chat-system-msg">${escHtml((jsonText || '').slice(0, 100))}</div>`;
    }
    // 转成 renderDetail 期望的 data 结构
    return renderDetail(reqId, {
      status: 'done',
      idea: card.idea || '',
      target_seconds: card.target_seconds || 30,
      screenplays: [card.screenplay],
      picked: card.picked_idx || 0,
      picked_at: new Date().toISOString(),
    });
  }

  window.ACMSScreenplayCard = { renderDetail, renderFromChatEntry };
})();
