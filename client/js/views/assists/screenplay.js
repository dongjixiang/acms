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
      <!-- v0.22.31: 艺术风格下拉（关键！同一剧本所有角色共享一个风格，避免"角色 1 写实 + 角色 2 卡通"） -->
      <div style="margin:6px 0">
        <label style="display:block;font-size:12px;margin-bottom:3px;color:var(--text2)">🎨 艺术风格 <span style="color:var(--text3);font-size:11px">（所有角色 + 场景 + 视频都用这个风格）</span></label>
        <select id="${cardId}-artstyle" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:4px;font-size:13px">
          ${(window.ACMSScreenplayIPDict?.listArtStyles() || [{ value: 'photorealistic', label: '📸 写实摄影（默认）' }]).map(o => `<option value="${o.value}"${o.value === 'photorealistic' ? ' selected' : ''}>${o.label}</option>`).join('')}
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
  // v0.22.31: 读 art_style（剧本级共享风格）
  const artStyle = card.querySelector(`#${cardId}-artstyle`)?.value || 'photorealistic';
  if (!idea) return toast('请输入创意描述', 'warning');

  try {
    if (!window._explicitAssist) window._explicitAssist = {};
    window._explicitAssist[reqId] = 'screenplay';
    await chatAssist(reqId, 'screenplay', { idea, target_seconds: targetSeconds, art_style: artStyle });
    card.remove();
  } catch (e) {
    toast('生成失败: ' + e.message, 'error');
  }
}

/**
 * v0.22.14: 选中剧本 → 写聊天流 + toast 提示
 *   v0.22.14: 不再自动填输入框（后续工作全部在聊天流卡片里完成）
 */
async function selectScreenplay(reqId, idx) {
  try {
    await ACMSAssistDispatcher.useAssist(reqId, 'screenplay', { idx });
    if (typeof startChatPolling === 'function') startChatPolling(reqId);
    // v0.22.68: 立刻刷新对话流里的剧本卡（不等轮询 tick）
    //   背景：writeScreenplayChatEntry 是「删同 idea 旧卡 + push 新卡」→ 历史条数不变 →
    //   轮询的增量判断（history.length > histCount）不触发 → 卡片渲染不出来
    //   （多多 2026-09-13：「点『选择这个剧本』后，剧本在对话流里面显示不出来了」）
    if (typeof refreshScreenplayChatCard === 'function') await refreshScreenplayChatCard(reqId);
    toast('✅ 剧本已选中 — 资源联动在聊天流卡片里完成', 'success', 2500);
  } catch (e) {
    toast('选择失败: ' + e.message, 'error');
  }
}

/**
 * v0.22.11: 在已生成的 3 张候选里切换（不重新生成）
 *   1. 调 screenplay.use set_asset 改 picked_idx
 *   2. 刷新聊天流
 */
async function screenplayPickOption(reqId, assetType, assetKey, pickedIdx) {
  try {
    // 1. 读最新 data 拿 options
    const r = await api('GET', `/requirements/${reqId}/assist`);
    const sp = r.assists?.screenplay;
    if (!sp) { toast('剧本数据丢失', 'error'); return; }
    const assets = sp.assets || {};
    const target = assetType === 'character' ? assets.characters?.[assetKey] : assets.scenes?.[String(assetKey)];
    if (!target || !Array.isArray(target.options) || target.options.length <= 1) {
      toast('没有可选的候选', 'warning');
      return;
    }

    // 2. 调 use 路由 set_asset 改 picked_idx
    await api('POST', `/requirements/${reqId}/assist/screenplay/use`, {
      action: 'set_asset',
      asset_type: assetType,
      asset_key: assetKey,
      options: target.options,
      picked_idx: pickedIdx,
    });

    // 3. 刷新聊天流 + 侧栏
    if (typeof startChatPolling === 'function') startChatPolling(reqId);
    if (window.ACMSAssistDispatcher?.poll) window.ACMSAssistDispatcher.poll(reqId);
    // v0.22.20: server 端 setAsset 已重写 chat history，聊天流那张 card 是 frozen 的旧 HTML
    //   主动重渲染才能让用户看到「切换图后」剧本角色块显示新图
    if (typeof refreshScreenplayChatCard === 'function') {
      await refreshScreenplayChatCard(reqId);
    }
    toast('🔀 已切换到第 ' + (pickedIdx + 1) + ' 张', 'success', 1500);
  } catch (e) {
    toast('切换失败: ' + e.message, 'error');
  }
}

/**
 * v0.22.16: 为角色/场景生成图（v0.22.15 设计调整）
 *   - v0.22.14: 弹内联表单让用户改 prompt → 提交
 *   - v0.22.15: 弹窗口 → 不弹窗口！直接触发 image_gen 卡片
 *   - v0.22.16: image_gen 卡片进入 pending_input 状态（不立即生成，用户改完 prompt 后点"生成"才跑）
 *   - 通过 _attachTo metadata 告诉 image_gen：选完图后要写回 screenplay.assets
 */
async function screenplayGenImage(reqId, assetType, assetKey, defaultPrompt) {
  try {
    if (!window._attachTo) window._attachTo = {};
    window._attachTo[reqId] = { type: 'screenplay', assetType, assetKey, ts: Date.now() };
    // 触发 image_gen（用 description 当 prompt，直接生成）
    if (!window._explicitAssist) window._explicitAssist = {};
    window._explicitAssist[reqId] = 'image_gen';
    await chatAssist(reqId, 'image_gen', {
      prompt: defaultPrompt || '',
      n: 3,
    });
    toast('🎨 正在生成 3 张候选图…', 'info', 2000);
  } catch (e) {
    toast('启动失败: ' + e.message, 'error');
  }
}

/**
 * v0.22.15: 改 screenplayGenImageForm 为兼容旧调用（不弹窗口，直接走 screenplayGenImage）
 *   保留旧名字避免破坏 screenplay-core.js 的 onclick 字符串引用
 */
function screenplayGenImageForm(reqId, assetType, assetKey, defaultPrompt) {
  return screenplayGenImage(reqId, assetType, assetKey, defaultPrompt);
}

/**
 * v0.22.16: 为分镜头生成视频（完成后自动继续下一个可生成的分镜头）
 *   传入 promptOverride 则用户手工修改了 prompt
 *   1. 调 video assist（pre-fill scene prompt + character/scene asset）
 *   2. 轮询直到拿到 video_url
 *   3. 写回 scene_videos[sceneIdx]
 *   4. v0.22.12+: 自动找下一个"可生成"的分镜头（角色图+场景图都齐了 + 还没生成视频）→ 调自己
 */
async function screenplayGenVideo(reqId, sceneIdx, promptOverride) {
  // v0.22.61: 防重复提交（同一场次生成中再点一次直接拦截）
  //   为什么：视频任务要 1-5 分钟，而之前第一次点击时卡片先渲染出**上一个视频**
  //   （通用字段 assist_video 空窗期，见 services/assists/video.js v0.22.61 注释）→
  //   用户以为没生效 → 再点一次 → 同时跑两个任务 → Agnes 429
  //   （实测 assist_video_scene_1/2 = failed「Agnes API 请求失败: HTTP 429」）
  const _flightKey = reqId + ':' + sceneIdx;
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

    // v0.22.61: 同一场次已在生成中 → 拦截（防重复提交 → Agnes 429）
    if (!window._sceneVideoInFlight) window._sceneVideoInFlight = {};
    if (window._sceneVideoInFlight[_flightKey]) {
      toast('分镜头 ' + (sceneIdx + 1) + ' 的视频正在生成中（约 1-5 分钟），请等它完成再操作', 'info', 3500);
      return;
    }
    // v0.22.61b: 内存锁之外的兜底 —— 页面刷新后内存锁没了，但后端通用字段
    //   （runAssistJob 会镜像本场的 generating 快照，带 scene_idx + started_at）还在，
    //   查一次避免刷新后重复提交。只认 6 分钟内的快照，避免卡在"僵死的 generating"上无法重试。
    const _backendVid = r.assists && r.assists.video;
    if (_backendVid && _backendVid.status === 'generating' && _backendVid.scene_idx === sceneIdx) {
      const _started = Date.parse(_backendVid.started_at || '');
      const _ageMin = isNaN(_started) ? 0 : (Date.now() - _started) / 60000;
      if (_ageMin < 6) {
        toast('分镜头 ' + (sceneIdx + 1) + ' 的视频还在云端生成中（已 ' + Math.max(0, Math.round(_ageMin)) + ' 分钟），请等它完成', 'info', 3500);
        return;
      }
    }
    window._sceneVideoInFlight[_flightKey] = true;

    // 构造 prompt（角色 + 场景 + 分镜，v0.22.16: 支持 promptOverride 手工修改）
    // v0.22.23: 默认 prompt 用结构化 buildSceneVideoPrompt（Setting+Camera+Action+Dialogue+Style+Quality）
    // v0.22.X fix: 三层兜底优先级
    //   ① promptOverride（用户在 textarea 改完立刻点按钮，DOM 里的最新值，最优先）
    //   ② scene.video_prompt_override（onblur 持久化到 req 的字段，刷新页面/切场后还在）
    //   ③ buildSceneVideoPrompt（默认结构化 prompt，从 scene / sp 自动生成）
    //   之前只有 ① + ③，没有 ② → 用户改完走开/刷新后 textarea 显示自定义值，但点重做按钮时 backend 拿到的是 buildSceneVideoPrompt 默认值 → 「改了没生效」
    const prompt = promptOverride
      || (scene && typeof scene.video_prompt_override === 'string' && scene.video_prompt_override.trim() ? scene.video_prompt_override : null)
      || (window.ACMSScreenplayCard?.buildSceneVideoPrompt
        ? window.ACMSScreenplayCard.buildSceneVideoPrompt(scene, sp)
        : [scene.shot || '', scene.action || '', scene.dialogue && scene.dialogue !== '——' ? `Says: "${scene.dialogue}"` : ''].filter(Boolean).join('. '));

    // v0.22.23: 收集角色图 + 场景图 URL，传给 video assist 做多图视频
    const assets = sp.assets || {};
    const projectSlug = sp.project_id || 'default';
    const imageUrls = [];
    // 收集角色图 URL（所有角色）
    const characters = screenplay.characters || [];
    for (const c of characters) {
      const asset = assets.characters?.[c.name];
      if (!asset) continue;
      if (asset.image_url_output) {
        imageUrls.push(asset.image_url_output);
      } else if (asset.asset_path) {
        imageUrls.push(`/api/generate/assets/${encodeURIComponent(projectSlug)}/${asset.asset_path}`);
      }
    }
    // 收集场景图 URL（scene 0）
    const sceneAsset = assets.scenes?.['0'];
    if (sceneAsset) {
      if (sceneAsset.image_url_output) {
        imageUrls.push(sceneAsset.image_url_output);
      } else if (sceneAsset.asset_path) {
        imageUrls.push(`/api/generate/assets/${encodeURIComponent(projectSlug)}/${sceneAsset.asset_path}`);
      }
    }
    // 去重（保持顺序）
    const uniqueUrls = [...new Set(imageUrls)];

    // v0.22.67: 首帧图 + 视频选项 → 走 2.5-flash 的 keyframe 首尾帧模式
    //   本段 first_frame = 场 i 的首帧图；last_frame = 场 i+1 的首帧图（末段只传首帧）
    //   → 上一段的"尾帧"和下一段的"首帧"是同一张图 → 拼接处画面连续（不再割裂）
    const vo = sp.video_opts || {};
    const frames = sp.scene_frames || {};
    const fr1 = frames[String(sceneIdx)];
    const fr2 = frames[String(sceneIdx + 1)];
    const localUrl = (p) => {
      if (!p) return '';
      // v0.22.70: 首帧图 asset_path 可能自带 workspace 前缀 → 统一剥到 'assets/' 开头，避免拼重 404
      const s = String(p); const i = s.indexOf('assets/');
      return `/api/generate/assets/${encodeURIComponent(projectSlug)}/${i > 0 ? s.slice(i) : s}`;
    };
    // v0.22.77: 首尾帧模式只在「有公网 CDN 地址」时启用 —— Agnes 视频接口的 first_frame / last_frame
    //   必须是公网可访问 URL；本地地址（打磨图、或只剩 asset_path 的旧数据）它的服务器拉不到，
    //   传进去只会让整段视频生成失败。没有公网地址就落回下面「多图参考」模式（角色图/场景图都自带 CDN）。
    const pubUrl = (f) => (f && f.image_url_output) ? f.image_url_output : '';
    const fr1Url = pubUrl(fr1);
    const fr2Url = pubUrl(fr2);
    const frameLocalOnly = !!(fr1 && !fr1.image_url_output);
    const useKeyframe = !!fr1Url;
    if (frameLocalOnly) {
      toast('⚠️ 本场首帧图是本地打磨图（无公网地址）→ 视频改用「多图参考」模式，段间衔接会弱化', 'info', 4000);
    }

    // v0.22.14: 显示 loading（弹到 body，跟剧本其他生成器一致位置）
    const tempCard = document.createElement('div');
    tempCard.className = 'assist-loading-card screenplay-gen-video-loading';
    tempCard.dataset.method = 'video';
    tempCard.dataset.tempFor = `scene_${sceneIdx}`;
    tempCard.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);width:90%;max-width:520px;z-index:10000;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;box-shadow:0 4px 20px rgba(0,0,0,0.15)';
    tempCard.innerHTML = `<div style="display:flex;align-items:center;gap:6px"><span style="font-size:18px">🎥</span><strong style="flex:1;font-size:13px">正在为分镜头 ${sceneIdx + 1} 生成视频${useKeyframe ? '（首尾帧衔接模式）' : ''}（最长 5 分钟）…</strong></div>`;
    document.body.appendChild(tempCard);
    setTimeout(() => { tempCard.scrollIntoView?.({ block: 'center' }); }, 50);

    // v0.22.30 / v0.22.67: per-scene 时长 —— 优先用用户设置（video_opts.seconds_per_scene）
    const totalScenes = (screenplay.scenes || []).length;
    const sceneDuration = parseInt(vo.seconds_per_scene, 10) > 0
      ? Math.max(4, Math.min(12, parseInt(vo.seconds_per_scene, 10)))
      : (totalScenes > 0
          ? Math.max(5, Math.round((sp.target_seconds || 30) / totalScenes))
          : (sp.target_seconds || 30));

    // 触发 video
    const videoOpts = { prompt, duration: sceneDuration, _attach_to: { type: 'screenplay', sceneIdx } };
    if (useKeyframe) {
      videoOpts.video_model = vo.video_model || 'agnes-video-2.5-flash';
      videoOpts.seconds = sceneDuration;
      videoOpts.aspect_ratio = vo.aspect_ratio || '16:9';
      videoOpts.first_frame = fr1Url;
      if (fr2Url) videoOpts.last_frame = fr2Url;
      console.log('[screenplay] 首尾帧模式 videoOpts', { model: videoOpts.video_model, seconds: sceneDuration, aspect: videoOpts.aspect_ratio, first: !!fr1Url, last: !!fr2Url });
    } else if (uniqueUrls.length > 0) {
      videoOpts.image_urls = uniqueUrls;
    }
    await chatAssist(reqId, 'video', videoOpts);

    // 轮询直到拿到 video_url（v0.22.30: 带 scene_idx 让后端按分桶字段读，避免被别的分镜头覆盖）
    let videoData = null;
    for (let i = 0; i < 60; i++) {  // 5 分钟
      await new Promise(r => setTimeout(r, 5000));
      const r2 = await api('POST', `/requirements/${reqId}/assist/video/query`, { scene_idx: sceneIdx });
      if (r2 && r2.video_url) { videoData = r2; break; }
      if (r2 && r2.status === 'failed') break;
    }
    tempCard.remove();
    if (!videoData || !videoData.video_url) {
      if (window._sceneVideoInFlight) delete window._sceneVideoInFlight[_flightKey];  // v0.22.61: 失败释放，允许重试
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
    // v0.22.56 fix: 视频生成后主动刷新聊天流剧本气泡
    //   setSceneVideo 重写 chat entry 时 history.length 不变（filter 移老 + push 新）→ polling state.histCount 命中上限
    //   → polling 不触发新渲染 → 气泡 frozen HTML 没 video → 用户报"视频生成后没同步显示"
    //   同 chatImagePick / screenplayPickOption 的处理路径
    if (typeof refreshScreenplayChatCard === 'function') {
      await refreshScreenplayChatCard(reqId);
    }
    toast('🎥 分镜头 ' + (sceneIdx + 1) + ' 视频已生成', 'success', 2000);

    // v0.22.61: 本场次已完成 → 释放防重复锁（下面的自动续跑是**别的**场次，各自有各自的 key）
    if (window._sceneVideoInFlight) delete window._sceneVideoInFlight[_flightKey];

    // v0.22.12: 自动继续下一个可生成的分镜头
    const allScenes = screenplay.scenes || [];
    const sceneVideos = (await api('GET', `/requirements/${reqId}/assist`)).assists?.screenplay?.scene_videos || {};
    // v0.22.61 fix: `nextAssets` 从未声明过（v0.22.23 注释写"第 274 行已声明"，实际那行是
    //   `const assets = sp.assets || {}`）→ 每次视频生成成功后走到这里必抛
    //   ReferenceError: nextAssets is not defined → 被 catch 捕获 → 用户看到
    //   「🎥 分镜头 N 视频已生成」绿色 toast 紧跟一条「❌ 生成失败: nextAssets is not defined」
    //   红色 toast → 以为失败了再点一次（重复提交 → Agnes 429）。
    //   同时 v0.22.12 的「自动续跑下一个分镜头」实际从未生效（throw 在 for 循环之前）。
    //   改用上面已算好的 assets（= sp.assets）。
    const firstCharAsset = characters.length > 0 ? (assets.characters || {})[characters[0].name] : null;
    const sceneAsset2 = (assets.scenes || {})['0'];
    const hasAllBaseAssets = firstCharAsset?.asset_path && sceneAsset2?.asset_path;
    if (hasAllBaseAssets) {
      // 找下一个未生成的分镜头
      for (let i = 0; i < allScenes.length; i++) {
        if (i === sceneIdx) continue;  // 跳过刚生成的
        if (sceneVideos[String(i)]?.video_url) continue;  // 跳已生成的
        // 找到！自动继续
        toast('🔄 自动开始下一个分镜头 ' + (i + 1) + '...', 'info', 2000);
        await new Promise(r => setTimeout(r, 1000));  // 1s 延迟让用户看清
        return screenplayGenVideo(reqId, i);
      }
      // 全部完成
      toast('✅ 所有分镜头视频已生成完成！', 'success', 3000);
    }
  } catch (e) {
    if (window._sceneVideoInFlight) delete window._sceneVideoInFlight[_flightKey];  // v0.22.61: 异常也要释放防重复锁
    toast('生成失败: ' + e.message, 'error');
  }
}

/**
 * v0.22.67: 生成某一场的「首帧图」（这一场的起始定格）
 *   参考图 = 角色档案图（全部）+ 场景图（多图合成保形象一致）
 *   产出存在 assist.scene_frames[idx].image_url_output（Agnes CDN 公网 URL）→ 直接喂给 2.5 视频接口做首尾帧
 */
/**
 * v0.22.77: 打磨「首帧图」—— 打开图片编辑器，改完回写**覆盖本场**（原图备份，可还原）
 *   与图候选的打磨共用同一套来源登记 + 编辑器「✅ 完成打磨」回写链路，
 *   区别只在 kind='scene_frame' → image-editor 侧分发到 screenplay 端点
 */
function openPolishSceneFrame(reqId, sceneIdx, imgUrl) {
  if (!imgUrl) { toast('这一场还没有首帧图', 'error'); return; }
  window.__acmsPolishTarget = {
    kind: 'scene_frame', reqId: reqId, sceneIdx: sceneIdx, idx: sceneIdx,
    url: imgUrl, at: Date.now(),
  };
  window._fb_open_file = { name: 'frame-' + (sceneIdx + 1) + '.png', src: imgUrl };
  try {
    if (window.ACMSWin && ACMSWin.open) {
      ACMSWin.open('image-editor', { w: 1000, h: 700, title: '✏️ 打磨首帧图（场 ' + (sceneIdx + 1) + '）', instanceId: imgUrl });
      toast('已打开编辑器 · 改完点「✅ 完成打磨」', 'success', 3500);
    } else {
      throw new Error('窗口管理器不可用');
    }
  } catch (e) {
    window.__acmsPolishTarget = null;
    window._fb_open_file = null;
    toast('打开图片编辑器失败：' + e.message, 'error');
  }
}

/**
 * v0.22.77: 还原首帧图到打磨前（打磨图文件仍在磁盘上，只是引用切回原图 → 不算破坏性操作，不弹 confirm）
 */
async function screenplayRevertSceneFrame(reqId, sceneIdx, btn) {
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 还原中…'; }
  try {
    await api('POST', `/requirements/${reqId}/assist/screenplay/use`, {
      action: 'revert_scene_frame',
      scene_idx: sceneIdx,
    });
    toast('↩️ 已还原到打磨前的首帧图', 'success', 2500);
    if (typeof refreshScreenplayChatCard === 'function') await refreshScreenplayChatCard(reqId);
  } catch (e) {
    toast('还原失败：' + ((e && e.message) ? e.message : e), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

async function screenplayGenSceneFrame(reqId, sceneIdx, btn) {
  const key = reqId + ':frame:' + sceneIdx;
  if (!window._frameInFlight) window._frameInFlight = {};
  if (window._frameInFlight[key]) { toast('这一场的首帧图正在生成中…', 'info', 2500); return; }
  window._frameInFlight[key] = true;
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 生成中…'; }
  toast('🎨 正在生成场 ' + (sceneIdx + 1) + ' 的首帧图（角色图 + 场景图作参考）…', 'info', 3000);
  try {
    // v0.22.X fix: 读取首帧图 prompt textarea（id = spfrm-${reqId}-${idx}）的当前 value
    //   如果用户改过 textarea 但还没失焦（onblur 未触发持久化），DOM 当前值优先 → 当次生效
    //   如果用户已经失焦，DOM value 已被持久化到 scene_frame_prompt_override，
    //   genSceneFrame 也会读 sp.scenes[scene_idx].scene_frame_prompt_override 兜底
    const textarea = document.getElementById('spfrm-' + reqId + '-' + sceneIdx);
    const promptOverride = textarea ? textarea.value : '';
    const body = { action: 'gen_scene_frame', scene_idx: sceneIdx };
    if (promptOverride && promptOverride.trim()) body.prompt = promptOverride;
    const r = await api('POST', `/requirements/${reqId}/assist/screenplay/use`, body);
    const fr = r && r.result && r.result.scene_frames && r.result.scene_frames[String(sceneIdx)];
    if (!fr) throw new Error('生成未返回首帧图');
    toast('✅ 场 ' + (sceneIdx + 1) + ' 首帧图已生成', 'success', 2500);
    if (typeof refreshScreenplayChatCard === 'function') await refreshScreenplayChatCard(reqId);
    if (window.ACMSAssistDispatcher && window.ACMSAssistDispatcher.loadAll) window.ACMSAssistDispatcher.loadAll(reqId);
  } catch (e) {
    toast('首帧图生成失败: ' + (e.message || e), 'error', 5000);
    if (btn) { btn.disabled = false; btn.textContent = label; }
  } finally {
    delete window._frameInFlight[key];
  }
}

/**
 * v0.22.67: 修改视频生成参数（每段时长 / 画幅），即时写回后端
 */
async function screenplaySetVideoOpts(reqId, key, value, el) {
  try {
    const body = { action: 'set_video_opts' };
    body[key] = key === 'seconds_per_scene' ? parseInt(value, 10) : value;
    await api('POST', `/requirements/${reqId}/assist/screenplay/use`, body);
    const shown = key === 'seconds_per_scene' ? value + ' 秒/段' : '画幅 ' + value;
    toast('✅ 已设置 ' + shown + '（下次生成生效）', 'success', 2200);
    if (typeof refreshScreenplayChatCard === 'function') await refreshScreenplayChatCard(reqId);
  } catch (e) {
    toast('设置失败: ' + (e.message || e), 'error', 4000);
    if (el) el.value = el.dataset.prev || el.value;
  }
}

/**
 * v0.22.65: 合成完整视频（把已生成的分镜头拼成一条）
 *   transition: 'none'（无损拼接）| 'fade'（0.4s 交叉溶解）
 *   后端同步跑 ffmpeg（几秒），完成后重写聊天流卡片 → 前端主动刷新剧本气泡
 */
async function screenplayComposeFinal(reqId, transition, btn) {
  const label = btn ? btn.textContent : '';
  if (window._composeInFlight && window._composeInFlight[reqId]) {
    toast('正在合成中，请稍候…', 'info', 2500);
    return;
  }
  if (!window._composeInFlight) window._composeInFlight = {};
  window._composeInFlight[reqId] = true;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 合成中…'; }
  toast(transition === 'fade' ? '✨ 正在合成（淡入淡出过渡，约几秒）…' : '🎞 正在合成完整视频（约几秒）…', 'info', 2500);
  try {
    const r = await api('POST', `/requirements/${reqId}/assist/screenplay/use`, {
      action: 'compose_final',
      transition: transition || 'none',
    });
    const fv = r && r.result && r.result.final_video;
    if (!fv) throw new Error('合成未返回结果');
    toast('✅ 完整视频已合成（' + fv.segments + ' 段 · ' + (fv.duration ? (Math.round(fv.duration * 10) / 10) + 's' : '') + '）', 'success', 3000);
    // 刷新聊天流剧本气泡 + 侧栏
    if (typeof refreshScreenplayChatCard === 'function') await refreshScreenplayChatCard(reqId);
    if (window.ACMSAssistDispatcher && window.ACMSAssistDispatcher.poll) window.ACMSAssistDispatcher.poll(reqId);
    if (window.ACMSAssistDispatcher && window.ACMSAssistDispatcher.loadAll) window.ACMSAssistDispatcher.loadAll(reqId);
  } catch (e) {
    toast('合成失败: ' + (e.message || e), 'error', 5000);
    if (btn) { btn.disabled = false; btn.textContent = label; }
  } finally {
    delete window._composeInFlight[reqId];
  }
}
