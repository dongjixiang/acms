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
   *   v0.22.9+: 顶部加状态条（角色/场景/视频 进度）
   */
  function renderSelectedScreenplay(reqId, data) {
    const sp = data.screenplays[data.picked];
    if (!sp) return '<div class="insight-error">剧本数据丢失</div>';

    const characters = sp.characters || [];
    const scenes = sp.scenes || [];
    const assets = data.assets || { characters: {}, scenes: {} };
    const sceneVideos = data.scene_videos || {};
    const target = data.target_seconds || 30;

    // 统计资源就绪情况
    const charAssets = assets.characters || {};
    const sceneAssets = assets.scenes || {};
    const charsReady = characters.filter(c => charAssets[c.name]?.asset_path).length;
    const sceneReady = (sceneAssets['0']?.asset_path) ? 1 : 0;
    const videoReady = scenes.filter((_, i) => sceneVideos[String(i)]?.video_url).length;
    const charsTotal = characters.length;
    const sceneTotal = 1;
    const videoTotal = scenes.length;
    const allReady = charsReady === charsTotal && sceneReady === sceneTotal && charsTotal > 0;

    // 顶部状态条
    const statusBar = renderStatusBar({
      charsReady, charsTotal, sceneReady, sceneTotal, videoReady, videoTotal, allReady,
    });

    // 角色区块
    const charactersHtml = characters.map((c, idx) => {
      const name = c.name || `角色${idx + 1}`;
      const desc = c.desc || '';
      const asset = charAssets[name];
      const imgAsset = asset?.asset_path;
      const imgSrc = imgAsset
        ? `/api/generate/assets/${encodeURIComponent(data.project_id || 'default')}/${imgAsset}`
        : asset?.image_url_output;
      const isReady = !!imgAsset;
      const options = asset?.options || [];
      const hasMultipleOptions = options.length > 1;

      // 3 张候选缩略图（v0.22.11 换图功能）
      const optionsHtml = hasMultipleOptions ? `
        <details style="margin-top:6px" data-screenplay-options="${escHtml(name).replace(/"/g, '&quot;')}">
          <summary style="font-size:11px;color:var(--accent);cursor:pointer;user-select:none">🔀 候选 ${options.length} 张（已选第 ${(asset.picked_idx || 0) + 1} 张 · 点切换）</summary>
          <div style="display:flex;flex-wrap:wrap;gap:4px;padding:6px 0">
            ${options.map((opt, i) => {
              const optSrc = opt.asset_path
                ? `/api/generate/assets/${encodeURIComponent(data.project_id || 'default')}/${opt.asset_path}`
                : opt.image_url_output;
              const isSelected = (asset.picked_idx || 0) === i;
              return `
                <div onclick="screenplayPickOption('${reqId}', 'character', '${escHtml(name).replace(/'/g, "\\'")}', ${i})" style="
                  width:60px;height:60px;border-radius:4px;cursor:pointer;position:relative;
                  border:2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'};
                  background:${isSelected ? 'rgba(99,102,241,0.1)' : 'transparent'};
                  display:flex;align-items:center;justify-content:center;
                " title="候选 ${i + 1}">
                  <img src="${escHtml(optSrc)}" style="width:100%;height:100%;object-fit:cover;border-radius:2px" alt="候选 ${i + 1}" />
                  ${isSelected ? '<div style="position:absolute;top:2px;right:2px;background:var(--accent);color:white;border-radius:50%;width:14px;height:14px;display:flex;align-items:center;justify-content:center;font-size:9px">✓</div>' : ''}
                </div>
              `;
            }).join('')}
          </div>
        </details>
      ` : '';

      return `
        <div class="screenplay-asset-block" style="margin:8px 0;padding:8px;background:var(--bg);border:1px solid ${isReady ? 'var(--green)' : 'var(--border)'};border-radius:6px">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1">
              <div style="font-weight:600;font-size:13px">👤 ${escHtml(name)} ${isReady ? '<span style="color:var(--green)">✅</span>' : '<span style="color:var(--text3)">⏳</span>'}</div>
              <!-- v0.22.16: 可编辑 prompt（提醒词可手工修改） -->
              <textarea id="sppc-${reqId}-${escHtml(name).replace(/[^\\w]/g, '_')}" rows="2" style="width:100%;font-size:11px;padding:3px;border:1px solid var(--border);border-radius:3px;font-family:inherit;margin-top:2px" placeholder="修改图片生成的提示词…">${escHtml(desc)}</textarea>
              <div style="font-size:10px;color:var(--text3);margin-top:1px">✏️ 可修改提示词后点下方按钮重新生成</div>
            </div>
            ${imgSrc ? `<img src="${escHtml(imgSrc)}" style="width:60px;height:60px;object-fit:cover;border-radius:4px" alt="角色图" />` : ''}
            <div style="display:flex;flex-direction:column;gap:3px">
              ${isReady ? `<button class="btn-small" onclick="screenplayGenImageForm('${reqId}', 'character', '${escHtml(name)}', document.getElementById('sppc-${reqId}-${escHtml(name).replace(/[^\\w]/g, '_')}').value)" style="font-size:10px">🎨 重新生成</button>` : `<button class="btn-small" onclick="screenplayGenImageForm('${reqId}', 'character', '${escHtml(name)}', document.getElementById('sppc-${reqId}-${escHtml(name).replace(/[^\\w]/g, '_')}').value)">🎨 生成图</button>`}
            </div>
          </div>
          ${optionsHtml}
        </div>
      `;
    }).join('');

    // 场景区块
    const sceneKey = '0';
    const sceneAsset = sceneAssets[sceneKey];
    const sceneImgAsset = sceneAsset?.asset_path;
    const sceneImgSrc = sceneImgAsset
      ? `/api/generate/assets/${encodeURIComponent(data.project_id || 'default')}/${sceneImgAsset}`
      : sceneAsset?.image_url_output;
    const sceneIsReady = !!sceneImgAsset;
    const sceneOptions = sceneAsset?.options || [];
    const sceneHasMultipleOptions = sceneOptions.length > 1;
    const sceneOptionsHtml = sceneHasMultipleOptions ? `
      <details style="margin-top:6px" data-screenplay-options="scene_0">
        <summary style="font-size:11px;color:var(--accent);cursor:pointer;user-select:none">🔀 候选 ${sceneOptions.length} 张（已选第 ${(sceneAsset.picked_idx || 0) + 1} 张 · 点切换）</summary>
        <div style="display:flex;flex-wrap:wrap;gap:4px;padding:6px 0">
          ${sceneOptions.map((opt, i) => {
            const optSrc = opt.asset_path
              ? `/api/generate/assets/${encodeURIComponent(data.project_id || 'default')}/${opt.asset_path}`
              : opt.image_url_output;
            const isSelected = (sceneAsset.picked_idx || 0) === i;
            return `
              <div onclick="screenplayPickOption('${reqId}', 'scene', '0', ${i})" style="
                width:60px;height:60px;border-radius:4px;cursor:pointer;position:relative;
                border:2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'};
                background:${isSelected ? 'rgba(99,102,241,0.1)' : 'transparent'};
                display:flex;align-items:center;justify-content:center;
              " title="候选 ${i + 1}">
                <img src="${escHtml(optSrc)}" style="width:100%;height:100%;object-fit:cover;border-radius:2px" alt="候选 ${i + 1}" />
                ${isSelected ? '<div style="position:absolute;top:2px;right:2px;background:var(--accent);color:white;border-radius:50%;width:14px;height:14px;display:flex;align-items:center;justify-content:center;font-size:9px">✓</div>' : ''}
              </div>
            `;
          }).join('')}
        </div>
      </details>
    ` : '';
    const sceneBlock = `
      <div class="screenplay-asset-block" style="margin:8px 0;padding:8px;background:var(--bg);border:1px solid ${sceneIsReady ? 'var(--green)' : 'var(--border)'};border-radius:6px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1">
            <div style="font-weight:600;font-size:13px">🎬 场景设定 ${sceneIsReady ? '<span style="color:var(--green)">✅</span>' : '<span style="color:var(--text3)">⏳</span>'}</div>
            <!-- v0.22.16: 可编辑场景 prompt -->
            <textarea id="spsc-${reqId}-scene_0" rows="2" style="width:100%;font-size:11px;padding:3px;border:1px solid var(--border);border-radius:3px;font-family:inherit;margin-top:2px" placeholder="修改场景图的提示词…">${escHtml(sp.setting || '')}</textarea>
            <div style="font-size:10px;color:var(--text3);margin-top:1px">✏️ 可修改提示词后点下方按钮</div>
          </div>
          ${sceneImgSrc ? `<img src="${escHtml(sceneImgSrc)}" style="width:60px;height:60px;object-fit:cover;border-radius:4px" alt="场景图" />` : ''}
          <div style="display:flex;flex-direction:column;gap:3px">
            ${sceneIsReady ? `<button class="btn-small" onclick="screenplayGenImageForm('${reqId}', 'scene', '0', document.getElementById('spsc-${reqId}-scene_0').value)" style="font-size:10px">🎨 重新生成</button>` : `<button class="btn-small" onclick="screenplayGenImageForm('${reqId}', 'scene', '0', document.getElementById('spsc-${reqId}-scene_0').value)">🎨 生成图</button>`}
          </div>
        </div>
        ${sceneOptionsHtml}
      </div>
    `;

    // 分镜头区块
    const scenesHtml = scenes.map((sc, idx) => {
      const video = sceneVideos[String(idx)];
      const videoSrc = video?.asset_path
        ? `/api/generate/assets/${encodeURIComponent(data.project_id || 'default')}/${video.asset_path}`
        : video?.video_url;
      const hasVideo = !!videoSrc;
      const characterAsset = characters.length > 0 ? charAssets[characters[0].name] : null;
      const hasAllAssets = characterAsset?.asset_path && sceneImgAsset;
      const disabledHint = hasAllAssets ? '' : '（需先生成角色图 + 场景图）';
      const statusBadge = hasVideo
        ? '<span style="color:var(--green)">✅</span>'
        : hasAllAssets
          ? '<span style="color:var(--accent)">🔓 可生成</span>'
          : '<span style="color:var(--text3)">⏳ 等待</span>';

      return `
        <div class="screenplay-scene-block" style="margin:6px 0;padding:8px;background:var(--bg2);border:1px solid ${hasVideo ? 'var(--green)' : 'var(--border)'};border-radius:6px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="font-size:12px;color:var(--accent);font-weight:600">⏱ ${escHtml(sc.time || '?')} · 场 ${idx + 1}</span>
            ${statusBadge}
          </div>
          <div style="font-size:12px;line-height:1.6">
            ${sc.shot ? `<div>📷 <strong>镜头：</strong>${escHtml(sc.shot)}</div>` : ''}
            ${sc.dialogue && sc.dialogue !== '——' ? `<div>💬 <strong>对白：</strong>${escHtml(sc.dialogue)}</div>` : ''}
            ${sc.action ? `<div>🎬 <strong>动作：</strong>${escHtml(sc.action)}</div>` : ''}
          </div>
          <!-- v0.22.16: 可编辑视频 prompt -->
          <div style="margin-top:4px">
            <textarea id="spvid-${reqId}-${idx}" rows="2" style="width:100%;font-size:11px;padding:3px;border:1px solid var(--border);border-radius:3px;font-family:inherit" placeholder="修改视频生成的提示词…">${escHtml([sc.shot, sc.action, sc.dialogue && sc.dialogue !== '——' ? `Says: "${sc.dialogue}"` : ''].filter(Boolean).join('. '))}</textarea>
            <div style="font-size:10px;color:var(--text3);margin-top:1px">✏️ 可修改提示词后点下方按钮</div>
          </div>
          ${hasVideo ? `
            <div style="margin-top:6px">
              <video controls style="width:100%;max-width:320px;border-radius:4px" src="${escHtml(videoSrc)}"></video>
              <div style="font-size:10px;color:var(--text2);margin-top:2px">✅ 视频已生成${video.asset_path ? '（已保存到本地）' : ''}</div>
            </div>
          ` : `
            <div style="margin-top:6px">
              <button class="btn-small" ${hasAllAssets ? '' : 'disabled'} onclick="screenplayGenVideo('${reqId}', ${idx}, document.getElementById('spvid-${reqId}-${idx}').value)" style="font-size:11px">
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

      ${statusBar}

      ${characters.length > 0 ? `
        <div class="screenplay-section-block">
          <div class="screenplay-section-title">👤 角色（${charsReady}/${charsTotal}）</div>
          ${charactersHtml}
        </div>
      ` : ''}

      <div class="screenplay-section-block">
        <div class="screenplay-section-title">🎬 场景（${sceneReady}/${sceneTotal}）</div>
        ${sceneBlock}
      </div>

      <div class="screenplay-section-block">
        <div class="screenplay-section-title">🎞 分镜头（${videoReady}/${videoTotal} 场已生成）</div>
        ${scenesHtml}
      </div>

      <div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--border)">
        <button class="btn-small btn-secondary" onclick="ACMSAssistDispatcher.regenerateBatch('${reqId}', 'screenplay')" title="换一批剧本">🔄 换一批剧本</button>
      </div>
    `;
  }

  /**
   * v0.22.9+: 资源就绪状态条
   *   显示"角色 X/Y · 场景 X/Y · 视频 X/Y"
   *   全齐时高亮绿色"✅ 可开始生成视频"
   */
  function renderStatusBar(stats) {
    const { charsReady, charsTotal, sceneReady, sceneTotal, videoReady, videoTotal, allReady } = stats;
    const progress = (charsReady + sceneReady + videoReady) / Math.max(1, charsTotal + sceneTotal + videoTotal);
    const pct = Math.round(progress * 100);

    if (allReady) {
      return `
        <div style="margin:8px 0;padding:8px 10px;background:rgba(34,197,94,0.08);border:1px solid var(--green);border-radius:6px">
          <div style="font-weight:600;font-size:12px;color:var(--green)">✅ 全部资源就绪（${pct}%）</div>
          <div style="font-size:10px;color:var(--text2);margin-top:2px">角色 ${charsReady}/${charsTotal} · 场景 ${sceneReady}/${sceneTotal} · 视频 ${videoReady}/${videoTotal}</div>
        </div>
      `;
    }
    return `
      <div style="margin:8px 0;padding:6px 10px;background:var(--bg2);border:1px solid var(--border);border-radius:6px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;color:var(--text2)">📊 资源进度</span>
          <span style="font-size:11px;font-weight:600;color:${progress > 0 ? 'var(--accent)' : 'var(--text3)'}">${pct}%</span>
          <span style="font-size:10px;color:var(--text3);flex:1">·</span>
          <span style="font-size:10px;color:var(--text2)">角色 ${charsReady}/${charsTotal} · 场景 ${sceneReady}/${sceneTotal} · 视频 ${videoReady}/${videoTotal}</span>
        </div>
        <div style="height:3px;background:var(--border);border-radius:2px;margin-top:4px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:var(--accent);transition:width .3s"></div>
        </div>
      </div>
    `;
  }

  /**
   * 解析聊天流 screenplay_result 卡片 → 调 renderDetail
   *   entry.text 是 JSON 字符串（含 screenplay + meta + assets + scene_videos）
   *   v0.22.13+: 把 assets + scene_videos 传给 renderDetail，让聊天流卡片也能交互
   */
  function renderFromChatEntry(reqId, jsonText) {
    if (!jsonText) return '<div class="chat-system-msg">📖 剧本结果（数据为空）</div>';
    let card;
    try { card = JSON.parse(jsonText); } catch { return `<div class="chat-system-msg">${escHtml((jsonText || '').slice(0, 100))}</div>`; }
    if (card.type !== 'screenplay_card' || !card.screenplay) {
      return `<div class="chat-system-msg">${escHtml((jsonText || '').slice(0, 100))}</div>`;
    }
    // 转成 renderDetail 期望的 data 结构（含完整 assets + scene_videos + project_id）
    return renderDetail(reqId, {
      status: 'done',
      idea: card.idea || '',
      target_seconds: card.target_seconds || 30,
      screenplays: [card.screenplay],
      picked: card.picked_idx || 0,
      picked_at: card.saved_at || new Date().toISOString(),
      // v0.22.13: 把 resources 也带过来（让聊天流卡片也能用按钮交互）
      assets: card.assets || { characters: {}, scenes: {} },
      scene_videos: card.scene_videos || {},
      // project_id 从 assist 数据里拿（需要时 renderDetail 会用）
      // 注意：card 里没存 project_id，renderDetail 渲染本地 URL 时用 'default' 兜底
    });
  }

  window.ACMSScreenplayCard = { renderDetail, renderFromChatEntry };
})();
