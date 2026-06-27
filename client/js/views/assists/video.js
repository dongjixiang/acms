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
      return `
        <div class="assist-section-title">🎬 AI 视频生成 ✅</div>
        <div style="margin:8px 0">
          <div style="font-size:13px;margin-bottom:4px">描述：${escHtml(data.prompt || '')}</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:8px">
            时长：${data.duration || '?'}s · 分辨率：${data.size || '?'}
          </div>
          ${data.video_url ? `
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
 * 全局函数：弹输入框 → 调 chatAssist 触发 video assist
 */
async function chatVideoPrompt(reqId) {
  if (!reqId) return;
  const prompt = (window.prompt('🎬 描述视频内容（支持中文/英文）：', '') || '').trim();
  if (!prompt) return;
  const duration = (window.prompt('⏱️ 视频时长（秒，默认 5）：', '5') || '5').trim();
  const dur = parseFloat(duration) || 5;
  const useImage = window.confirm('是否使用参考图片？（取消 = 文生视频，确定 = 输入图片 URL）');
  let imageUrl = '';
  if (useImage) {
    imageUrl = (window.prompt('🖼️ 输入图片 URL：', '') || '').trim();
  }
  try {
    await chatAssist(reqId, 'video', { prompt, duration: dur, image_url: imageUrl });
  } catch (e) {
    toast('视频辅助失败：' + (e?.message || 'unknown'), 'error');
  }
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
