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
      return `
        <div class="assist-section-title">🎬 AI 视频生成</div>
        <div style="margin:8px 0">
          <div style="font-size:13px;margin-bottom:4px">描述：${escHtml(data.prompt || '')}</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:8px">
            时长：${data.duration || '?'}s · 帧率：${data.frame_rate || 24}fps
            ${data.size ? `· 分辨率：${data.size}` : ''}
          </div>
          ${isAsync ? `
            <div style="font-size:12px;color:var(--text2);margin-bottom:6px">
              ⏳ 视频生成中（异步任务）· ID: ${escHtml((data.video_id || '').slice(0,24))}…
            </div>
            <button class="btn-small btn-primary" onclick="chatVideoQuery('${reqId}')">🔄 刷新进度</button>
          ` : data.video_url ? `
            <a href="${escHtml(data.video_url)}" target="_blank" rel="noopener noreferrer" class="btn-small btn-primary" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px">
              ▶️ 下载/查看视频
            </a>
          ` : `
            <div style="color:var(--warn);font-size:12px">视频已生成但 URL 不可用</div>
          `}
          ${data.progress ? `<div style="font-size:11px;color:var(--text2);margin-top:4px">✅ ${Math.min(data.progress, 100)}%</div>` : ''}
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
    if (status === 'done') toast('🎬 视频已生成！', 'success', 4000);
    else if (status === 'failed') toast('❌ 视频生成失败', 'error', 4000);
    else toast('🔄 进度：' + (r.progress ?? '?') + '%', 'info', 2000);
  } catch (e) {
    toast('查询失败：' + e.message, 'error');
  }
}
