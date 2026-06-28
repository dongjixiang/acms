// ACMS · AI 图片生成辅助（v0.22.8，2026-06-28）
//   Method: image_gen | Name: AI 图片生成（N 候选）
//   v0.22.8: 支持 N 候选（一次生 3 张图，用户选 1 张）
//
// 渲染：
//   - pending_input：待提交表单（可编辑 prompt + 提交按钮）
//   - generating：⏳ 生成中（N 张）
//   - done：3 缩略图 + 选中按钮（高亮 picked）
//   - failed：错误提示
//
// 全局函数：
//   - chatImagePrompt(reqId)：弹输入框 → 调 chatAssist('image_gen', {...})
//   - chatImagePick(reqId, idx)：选中第 idx 张（调 use 路由）
//   - submitPendingImageGen(reqId)：提交 pending 状态的表单 → 开始真正生成

(function () {
  function render(reqId, data) {
    if (!data) return '';
    // v0.22.16: pending_input 状态 — 显示可编辑表单
    if (data.status === 'pending_input') {
      return renderPendingInput(reqId, data);
    }
    if (data.status === 'generating') {
      return `<div class="insight-loading">⏳ 正在生成 ${data.n || 3} 张候选图…</div>`;
    }
    if (data.status === 'failed') {
      const errMsg = data.error === 'NO_PROMPT'
        ? '❌ 请输入图片描述。点击 🖼️ 图片 按钮重新尝试。'
        : `❌ 生成失败：${escHtml(data.error || '未知错误')}`;
      return `<div class="insight-error">${errMsg}</div>`;
    }
    if (data.status === 'done') {
      const options = Array.isArray(data.options) ? data.options : [];
      if (options.length === 0) {
        // 兼容老数据（没 options 字段）：用 image_url_output
        return renderSingleFromLegacy(reqId, data);
      }
      // v0.22.8: N 候选渲染
      const pickedIdx = data.picked_idx || 0;
      const optionsHtml = options.map((opt, i) => {
        const assetUrl = opt.asset_path
          ? `/api/generate/assets/${encodeURIComponent(data.project_id || 'default')}/${opt.asset_path}`
          : null;
        const cdnUrl = opt.image_url_output || '';
        const isPicked = i === pickedIdx;
        return `
          <div class="image-option" data-image-option-idx="${i}" style="
            display:inline-block;margin:4px;padding:4px;
            border:2px solid ${isPicked ? 'var(--accent)' : 'var(--border)'};
            border-radius:8px;background:${isPicked ? 'rgba(99,102,241,0.08)' : 'transparent'};
            cursor:pointer;position:relative;
            ${isPicked ? 'box-shadow:0 0 0 2px var(--accent)' : ''}
          " onclick="chatImagePick('${reqId}', ${i})">
            ${isPicked ? '<div style="position:absolute;top:4px;right:4px;background:var(--accent);color:white;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:12px">✓</div>' : ''}
            <img src="${escHtml(assetUrl || cdnUrl)}" alt="候选 ${i+1}" style="display:block;width:140px;height:140px;object-fit:cover;border-radius:4px" onerror="this.src='${escHtml(cdnUrl)}';this.onerror=null;" />
            <div style="text-align:center;font-size:11px;color:var(--text2);margin-top:2px">${i+1}${isPicked ? ' · 已选' : ''}</div>
          </div>
        `;
      }).join('');

      return `
        <div class="assist-section-title">🖼️ AI 图片生成 ✅</div>
        <div style="margin:8px 0">
          <div style="font-size:13px;margin-bottom:4px">描述：${escHtml(data.prompt || '')}</div>
          ${data.image_url ? `<div style="font-size:11px;color:var(--text2);margin-bottom:4px">🔄 图生图（有参考图）</div>` : ''}
          <div style="font-size:11px;color:var(--text2);margin-bottom:8px">尺寸：${escHtml(data.size || '1024x1024')} · ${options.length} 张候选</div>
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px">👆 点选你最喜欢的那张（已选 ${pickedIdx + 1}）</div>
          <div style="display:flex;flex-wrap:wrap;margin:6px 0">${optionsHtml}</div>
        </div>
      `;
    }
    return '';
  }

  // v0.22.16: pending_input 渲染 — 可编辑 prompt 表单 + 提交按钮
  function renderPendingInput(reqId, data) {
    return `
      <div class="assist-section-title">🖼️ AI 图片生成</div>
      <div style="margin:8px 0">
        <div style="font-size:12px;color:var(--text2);margin-bottom:4px">图片描述（可修改后提交）：</div>
        <textarea id="image-gen-prompt-${reqId}" rows="3" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:4px;font-size:13px;resize:vertical;font-family:inherit">${escHtml(data.prompt || '')}</textarea>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <button class="btn-small btn-primary" onclick="submitPendingImageGen('${reqId}')">🎨 生成 3 张候选</button>
          <span style="font-size:11px;color:var(--text3)">点击后开始生成图片</span>
        </div>
      </div>
    `;
  }

  // 兼容老数据（v0.22.8 之前的：没 options 字段，只有 image_url_output）
  function renderSingleFromLegacy(reqId, data) {
    const assetUrl = data.asset_path ? '/api/generate/assets/' + (data.project_id || 'default') + '/' + data.asset_path : '';
    const cdnUrl = data.image_url_output || '';
    const imgSrc = assetUrl || cdnUrl;
    return `
      <div class="assist-section-title">🖼️ AI 图片生成 ✅</div>
      <div style="margin:8px 0">
        <div style="font-size:13px;margin-bottom:4px">描述：${escHtml(data.prompt || '')}</div>
        ${data.image_url ? `<div style="font-size:11px;color:var(--text2);margin-bottom:4px">🔄 图生图（有参考图）</div>` : ''}
        <div style="font-size:11px;color:var(--text2);margin-bottom:8px">尺寸：${escHtml(data.size || '1024x1024')}</div>
        ${imgSrc ? `
          <div style="margin:8px 0">
            <img src="${escHtml(imgSrc)}" alt="生成的图片" style="max-width:100%;border-radius:8px;border:1px solid var(--border)" onerror="this.src='${escHtml(cdnUrl)}';this.onerror=null;" />
          </div>
          <a href="${escHtml(cdnUrl || assetUrl)}" target="_blank" rel="noopener noreferrer" class="btn-small btn-primary" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px">
            🔗 查看原图
          </a>
        ` : '<div style="color:var(--warn);font-size:12px">图片 URL 不可用</div>'}
      </div>
    `;
  }

  window.ACMSAssists.register('image_gen', { name: 'AI 图片生成（N 候选）', render });
})();

/**
 * 全局函数：渲染内联表单 → 调 chatAssist 触发 image assist
 */
async function chatImagePrompt(reqId) {
  if (!reqId) return;
  renderImageForm(reqId);
}

/**
 * v0.22.16: 提交 pending 状态的表单 → 真正调用后端生成
 */
async function submitPendingImageGen(reqId) {
  const ta = document.getElementById('image-gen-prompt-' + reqId);
  const prompt = ta?.value?.trim() || '';
  if (!prompt) {
    toast('请输入图片描述词', 'warning');
    return;
  }
  try {
    toast('🎨 开始生成 3 张候选…', 'info', 2000);
    await chatAssist(reqId, 'image_gen', { prompt, n: 3 });
  } catch (e) {
    toast('生成失败: ' + e.message, 'error');
  }
}

/**
 * 选中第 idx 张候选
 */
async function chatImagePick(reqId, idx) {
  try {
    // v0.22.15: 如果来自 screenplay 的图片生成，附带 _attachTo 让后端联动写回
    const attachTo = window._attachTo?.[reqId];
    const payload = { idx };
    if (attachTo) {
      payload._attachTo = {
        assetType: attachTo.assetType,
        assetKey: attachTo.assetKey,
      };
    }
    await ACMSAssistDispatcher.useAssist(reqId, 'image_gen', payload);
    toast('✅ 已选中第 ' + (idx + 1) + ' 张', 'success', 1500);
    // 立即刷新卡片高亮（poll 可能还在等间隔）
    refreshImageCard(reqId);
    // v0.22.16: 选图完成后清理 _attachTo
    if (window._attachTo?.[reqId]) delete window._attachTo[reqId];
  } catch (e) {
    toast('选中失败: ' + e.message, 'error');
  }
}

/**
 * 强制刷新图片卡片（用于选中后 UI 即时更新）
 */
async function refreshImageCard(reqId) {
  try {
    const resp = await api('GET', '/requirements/' + reqId + '/assist');
    const container = document.getElementById('assist-area-' + reqId);
    if (container && resp.assists && resp.assists.image_gen) {
      const mod = window.ACMSAssists.get('image_gen');
      if (mod && mod.render) {
        const rendered = mod.render(reqId, resp.assists.image_gen);
        if (rendered) {
          container.innerHTML = '<div class="assist-block assist-image_gen">' + rendered + '</div>';
        }
      }
    }
    // v0.22.15: 如果来自 screenplay，同时刷新 screenplay 卡片（用 poll 统一刷新所有 assist 卡片）
    if (window.ACMSAssistDispatcher?.poll) {
      window.ACMSAssistDispatcher.poll(reqId);
    }
  } catch (e) { /* 静默失败 */ }
}
