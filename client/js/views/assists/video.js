// ACMS · AI 视频生成辅助（v0.19，2026-06-27）
//   Method: video | Name: AI 视频生成（Agnes Video）
//
// 卡片渲染：
//   - generating：旋转中
//   - pending：显示 video_id + 进度条 + 刷新按钮
//   - done：显示视频 URL 链接
//   - failed：错误提示
//
// 全局函数：
//   - chatVideoPrompt(reqId)：弹输入框 → 调 chatAssist('video', {prompt, duration})

(function () {
  function render(reqId, data) {
    if (!data) return '';
    if (data.status === 'generating' || data.status === 'pending') {
      const progress = data.progress ?? 0;
      const vid = data.video_id || '(等待中)';
      return `
        <div class="assist-section-title">🎬 AI 视频生成</div>
        <div style="margin:8px 0">
          <div style="font-size:13px;margin-bottom:4px">描述：${escHtml(data.prompt || '')}</div>
          <div style="font-size:12px;color:var(--text2)">
            时长：${data.duration || '?'}s · 帧率：${data.frame_rate || 24}fps
            ${data.image_url ? ' · 🖼️ 图生视频' : ''}
          </div>
          <div style="margin:8px 0;background:var(--bg3);border-radius:6px;overflow:hidden;height:8px">
            <div style="width:${Math.min(progress, 100)}%;height:100%;background:var(--accent);border-radius:6px;transition:width 0.5s"></div>
          </div>
          <div style="font-size:11px;color:var(--text2);margin-bottom:6px">
            ⏳ ${data.status === 'generating' ? '任务创建中…' : '视频生成中 ' + Math.min(progress, 100) + '%'}
            ${data.status === 'generating' ? '' : ' · ID: ' + vid.slice(0, 20) + '…'}
          </div>
          ${data.status === 'pending' ? `
            <button class="btn-small" onclick="chatVideoQuery('${reqId}')">🔄 刷新进度</button>
          ` : ''}
        </div>
        <div class="music-assist-note">💡 视频生成约需 30 秒到 2 分钟，点「刷新进度」查看状态</div>
      `;
    }
    if (data.status === 'done') {
      const isAsync = data.async_task && !data.video_url;
      const videoTag = data.video_url
        ? `<video controls style="width:100%;max-width:360px;border-radius:6px;margin:4px 0;background:#000" src="${escHtml(data.video_url)}"></video>`
        : '';
      return `
        <div class="assist-section-title">🎬 AI 视频生成</div>
        <div style="margin:8px 0">
          <div style="font-size:13px;margin-bottom:4px">描述：${escHtml(data.prompt || '')}</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:8px">
            时长：${data.duration || '?'}s · 帧率：${data.frame_rate || 24}fps
            ${data.size ? `· 分辨率：${data.size}` : ''}
          </div>
          ${videoTag}
          ${isAsync ? `
            <div style="margin-top:4px;display:flex;gap:6px;align-items:center">
              <button class="btn-small btn-primary" onclick="chatVideoQuery('${reqId}')">🔄 刷新进度</button>
              <span class="video-auto-poll-status" style="font-size:11px;color:var(--text2)">⏳ 自动检测进度…</span>
            </div>
          ` : `
            <div style="margin-top:4px;font-size:11px;color:var(--text2)">✅ 生成完成 · <span onclick="chatVideoQuery('${reqId}')" style="cursor:pointer;text-decoration:underline">刷新</span></div>
          `}
          ${!isAsync && data.video_url ? `
            <div style="margin-top:4px"><a href="${escHtml(data.video_url)}" target="_blank" rel="noopener noreferrer" class="btn-small" style="text-decoration:none">🔗 打开原视频</a></div>
          ` : ''}
        </div>
      `;
    }
    if (data.status === 'failed') {
      const errMsg = data.error === 'NO_PROMPT'
        ? '❌ 请输入视频描述。点击 🎬 视频 按钮重新尝试。'
        : `❌ 生成失败：${escHtml(data.error || '未知错误')}`;
      return `<div class="insight-error">${errMsg}</div>`;
    }
    return '';
  }

  window.ACMSAssists.register('video', { name: 'AI 视频生成（Agnes Video）', render });
})();

/**
 * 全局函数：渲染内联表单 → 调 chatAssist 触发 video assist
 */
async function chatVideoPrompt(reqId) {
  if (!reqId) return;
  renderVideoForm(reqId);
}

/**
 * 全局函数：刷新视频生成进度
 */
async function chatVideoQuery(reqId) {
  if (!reqId) return;
  try {
    const r = await api('POST', '/requirements/' + reqId + '/assist/video/query');
    if (r.error) return toast('查询失败：' + r.message, 'error');
    // 刷新 assist 卡片
    const assistPanel = document.getElementById('assist-panel-' + reqId);
    if (assistPanel && typeof loadAssistPanel === 'function') {
      loadAssistPanel(reqId);
    }
    const status = r.status;
    if (status === 'done') {
      // 有 video_url 时直接更新聊天流里的卡片
      if (r.video_url) {
        const card = document.querySelector(`#chat-stream-msgs-${reqId} .assist-loading-card[data-method="video"]`);
        if (card) {
          card.innerHTML = `
            <div class="assist-loading-head" style="border:none"><span style="font-size:16px">🎬</span><span class="assist-loading-title">视频已生成</span></div>
            <div style="padding:4px 0">
              <video controls style="width:100%;max-width:360px;border-radius:6px" src="${escHtml(r.video_url)}"></video>
            </div>
            <div style="padding:2px 0;font-size:11px;color:var(--text2)">✅ 生成完成</div>
          `;
          card.style.borderTopColor = 'var(--green)';
          card.style.animation = 'none';
        }
        // 清除自动轮询
        if (typeof window._autoPollTimers !== 'undefined' && window._autoPollTimers[reqId]) {
          clearInterval(window._autoPollTimers[reqId]);
          delete window._autoPollTimers[reqId];
        }
      }
      toast('🎬 视频已生成！', 'success', 4000);
    } else if (status === 'failed') {
      toast('❌ 视频生成失败', 'error', 4000);
    } else {
      // 点刷新后如果还 pending，检查是否已有自动轮询，没有则启动
      const card = document.querySelector(`#chat-stream-msgs-${reqId} .assist-loading-card[data-method="video"]`);
      if (card && typeof startVideoAutoPoll === 'function') {
        const statusEl = card.querySelector('.video-auto-poll-status');
        if (statusEl) statusEl.textContent = '⏳ 自动检测进度…';
        startVideoAutoPoll(reqId, card);
      }
      toast('🔄 进度：' + (r.progress ?? '?') + '%', 'info', 2000);
    }
  } catch (e) {
    toast('查询失败：' + e.message, 'error');
  }
}
