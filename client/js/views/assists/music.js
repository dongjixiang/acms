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
  /**
   * 渲染音乐卡片（支持源切换 + 放大）
   * 全局状态：_musicSourceIdx[reqId] 记录当前选中的源索引
   */
  if (!window._musicSourceIdx) window._musicSourceIdx = {};

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
    // 可播放源列表
    const playableSources = (data.playable_sources || []).filter(s => s.url);
    // 如果没有 playable_sources 但有 playable_url，构造一个
    if (playableSources.length === 0 && data.playable_url) {
      playableSources.push({
        type: data.playable_url.includes('bilibili.com') ? 'bilibili' : 'audio',
        label: '源 #1',
        url: data.playable_url,
        title: data.playable_url.includes('bilibili.com') ? '哔哩哔哩' : '音频',
      });
    }

    const currentIdx = Math.min(window._musicSourceIdx[reqId] || 0, playableSources.length - 1);
    const currentSource = playableSources[currentIdx];
    const isExpanded = window._musicExpanded?.[reqId];

    // 构建播放器
    let playerHtml = '';
    if (currentSource) {
      if (currentSource.type === 'bilibili') {
        const h = isExpanded ? 360 : 200;
        playerHtml = `<div style="margin:8px 0${isExpanded ? '' : ';max-width:360px'}">
          <iframe src="${escHtml(currentSource.url)}" style="width:100%;height:${h}px;border:none;border-radius:8px" allow="autoplay" loading="lazy"></iframe>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">📺 ${escHtml(currentSource.title || '哔哩哔哩')}</div>
        </div>`;
      } else {
        playerHtml = `<div style="margin:8px 0">
          <audio controls style="width:100%;max-width:${isExpanded ? 100 : 360}%;height:40px" src="${escHtml(currentSource.url)}">您的浏览器不支持音频播放</audio>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">🔊 ${escHtml(currentSource.title || '音频')}</div>
        </div>`;
      }
    }

    // 源切换按钮（仅当有多个源时显示）
    const sourceNav = playableSources.length > 1 ? `
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin:4px 0">
        ${playableSources.map((s, i) => `
          <button class="btn-small" style="${i === currentIdx ? 'background:var(--accent);color:var(--bg);border-color:var(--accent)' : ''}" 
            onclick="switchMusicSource('${reqId}', ${i})">${escHtml(s.label)}</button>
        `).join('')}
      </div>
    ` : '';

    // 放大/缩小按钮
    const expandBtn = playableSources.length > 0 ? `
      <button class="btn-small" onclick="toggleMusicExpand('${reqId}')" style="font-size:11px;float:right">
        ${isExpanded ? '🔽 缩小' : '⛶ 放大'}
      </button>
    ` : '';

    // 平台链接
    const platformCards = sources.map(s => `
      <a href="${escHtml(s.url)}" target="_blank" rel="noopener noreferrer"
         class="music-assist-card ${s.verified ? 'verified' : 'search'}">
        <span class="music-assist-icon">${s.icon || '🔗'}</span>
        <span class="music-assist-platform">${escHtml(s.platform)}</span>
        <span class="music-assist-badge">${s.verified ? '✓ 找到' : '搜'}</span>
      </a>
    `).join('');

    return `
      <div class="assist-section-title">
        🎵 ${songTitle || '音乐'}
        ${expandBtn}
      </div>
      ${playerHtml}
      ${sourceNav}
      <div class="music-assist-intro" style="clear:both">在以下平台搜索该歌曲：</div>
      <div class="music-assist-list">${platformCards}</div>
    `;
  }

  window.ACMSAssists.register('music', { name: '音乐播放（找免费播放源）', render });
})();

/** 切换音乐源 */
function switchMusicSource(reqId, idx) {
  if (!window._musicSourceIdx) window._musicSourceIdx = {};
  window._musicSourceIdx[reqId] = idx;
  // 刷新 assist 面板
  if (typeof ACMSAssistDispatcher !== 'undefined' && ACMSAssistDispatcher.poll) {
    ACMSAssistDispatcher.poll(reqId);
  } else if (typeof loadAssistPanel === 'function') {
    loadAssistPanel(reqId);
  }
}

/** 放大/缩小 */
function toggleMusicExpand(reqId) {
  if (!window._musicExpanded) window._musicExpanded = {};
  window._musicExpanded[reqId] = !window._musicExpanded[reqId];
  if (typeof ACMSAssistDispatcher !== 'undefined' && ACMSAssistDispatcher.poll) {
    ACMSAssistDispatcher.poll(reqId);
  } else if (typeof loadAssistPanel === 'function') {
    loadAssistPanel(reqId);
  }
}

/** 全局函数：渲染内联表单 → 调 chatAssist 触发 music assist */
async function chatMusicPrompt(reqId) {
  if (!reqId) return;
  renderMusicForm(reqId);
}
