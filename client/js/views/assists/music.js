// ACMS · 音乐播放辅助（v0.19，2026-06-27）
//   Method: music | Name: 音乐播放（找免费播放源）
//
// 卡片渲染：
//   - 已 verified（有 web_search 找到的具体链接）：badge "✓ 找到"
//   - 未 verified（仅平台搜索链接）：badge "搜"
//
// 全局函数：
//   - chatMusicPrompt(reqId)：弹输入框 → 调 chatAssist('music', {song})

(function () {
  function render(reqId, data) {
    if (!data) return '';
    if (data.status === 'generating' || data.status === 'pending') {
      return '<div class="insight-loading">⏳ 正在找播放源…</div>';
    }
    if (data.status === 'failed') {
      const errMsg = data.error === 'NO_SONG_NAME'
        ? '❌ 未识别到歌曲名。请在 chat 里说"播放 X"再点此按钮。'
        : `❌ 生成失败：${escHtml(data.error || '未知错误')}`;
      return `<div class="insight-error">${errMsg}</div>`;
    }
    const sources = data.sources || [];
    if (sources.length === 0) return '';

    const songTitle = escHtml(data.song || '');
    const intro = data.verified
      ? '已为你找到播放源，点击跳转播放：'
      : '在以下平台搜索该歌曲（点击跳转）：';

    const cards = sources.map(s => `
      <a href="${escHtml(s.url)}" target="_blank" rel="noopener noreferrer"
         class="music-assist-card ${s.verified ? 'verified' : 'search'}">
        <span class="music-assist-icon">${s.icon || '🔗'}</span>
        <span class="music-assist-platform">${escHtml(s.platform)}</span>
        <span class="music-assist-badge">${s.verified ? '✓ 找到' : '搜'}</span>
      </a>
    `).join('');

    return `
      <div class="assist-section-title">🎵 ${songTitle || '音乐'}</div>
      <div class="music-assist-intro">${escHtml(intro)}</div>
      <div class="music-assist-list">${cards}</div>
      <div class="music-assist-note">
        💡 点击跳转对应平台播放。ACMS 不存储音频文件，仅提供搜索跳转链接。
      </div>
    `;
  }

  window.ACMSAssists.register('music', { name: '音乐播放（找免费播放源）', render });
})();

/**
 * 全局函数：渲染内联表单 → 调 chatAssist 触发 music assist
 */
async function chatMusicPrompt(reqId) {
  if (!reqId) return;
  renderMusicForm(reqId);
}
