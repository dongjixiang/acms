// ACMS · 音乐播放辅助（v0.21，2026-06-27）
//   Method: music | Name: 音乐播放（找免费播放源）
//
// v0.21 重构：把播放器 HTML / 进度条 / 源切换 / 放大缩小全部抽到 music-core.js
//   本文件只剩「assists 侧栏的卡片组装 + 全局状态管理」逻辑
//   聊天流卡片（chat.js renderMusicBubble）也用同一份 core → 两路渲染保持一致
//
// 全局函数：
//   - chatMusicPrompt(reqId)：弹内联表单 → 调 chatAssist('music', {song})
//   - toggleMusicExpand(reqId)：放大/缩小（assists 侧栏）
//   - switchMusicSource(reqId, idx)：切源（assists 侧栏，靠整卡 poll 重渲染）

(function () {
  const Core = window.ACMSMusicCard;
  if (!Core) { console.error('[assist:music] ACMSMusicCard core 未加载'); return; }

  // 全局状态：assists 侧栏专属（聊天流卡片用 DOM 内 data 属性，不依赖这里）
  if (!window._musicSourceIdx) window._musicSourceIdx = {};
  if (!window._musicExpanded) window._musicExpanded = {};

  function render(reqId, data) {
    if (!data) return '';
    if (data.status === 'generating' || data.status === 'pending') {
      return '<div class="insight-loading">⏳ 正在找播放源…</div>';
    }
    if (data.status === 'failed') {
      const errMsg = data.error === 'NO_SONG_NAME'
        ? '❌ 未识别到歌曲名。请在 chat 里说"播放 X"再点此按钮。'
        : `❌ 生成失败：${Core.escHtml(data.error || '未知错误')}`;
      return `<div class="insight-error">${errMsg}</div>`;
    }
    const sources = data.sources || [];
    if (sources.length === 0) return '';

    const songTitle = Core.escHtml(data.song || '');
    const playable = Core.normalizePlayable(data);
    const currentIdx = Math.min(window._musicSourceIdx[reqId] || 0, Math.max(playable.length - 1, 0));
    const currentSource = playable[currentIdx];
    const isExpanded = !!window._musicExpanded[reqId];

    // 播放器
    const playerHtml = currentSource ? Core.playerHTML(currentSource, { expanded: isExpanded }) : '';

    // 源切换 / 放大缩小 按钮
    const sourceNav = Core.sourceNavHTML(playable, currentIdx, (i) => `switchMusicSourceByBtn('${reqId}', this, ${i})`);
    const expandBtn = playable.length > 0
      ? Core.expandBtnHTML(isExpanded, `toggleMusicExpand('${reqId}')`)
      : '';

    // 平台搜索链接
    const platformCards = sources.map(s => `
      <a href="${Core.escHtml(s.url)}" target="_blank" rel="noopener noreferrer"
         class="music-assist-card ${s.verified ? 'verified' : 'search'}">
        <span class="music-assist-icon">${s.icon || '🔗'}</span>
        <span class="music-assist-platform">${Core.escHtml(s.platform)}</span>
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

  // dispatcher 在 innerHTML 替换后会调 afterRender(reqId, data) — 在这里挂进度条事件
  function afterRender(reqId, data) {
    const block = document.querySelector('.assist-block.assist-music');
    if (block) Core.attachProgress(block);
  }

  window.ACMSAssists.register('music', {
    name: '音乐播放（找免费播放源）',
    render,
    afterRender,
  });
})();

/** 切源（assists 侧栏）— 整卡重渲染 */
function switchMusicSourceByBtn(reqId, btn, idx) {
  window._musicSourceIdx[reqId] = idx;
  if (typeof ACMSAssistDispatcher !== 'undefined' && ACMSAssistDispatcher.poll) {
    ACMSAssistDispatcher.poll(reqId);
  } else if (typeof loadAssistPanel === 'function') {
    loadAssistPanel(reqId);
  }
}

/** 放大/缩小（assists 侧栏）— 整卡重渲染 */
function toggleMusicExpand(reqId) {
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
  if (typeof renderMusicForm === 'function') {
    renderMusicForm(reqId);
  } else {
    console.warn('[music] renderMusicForm 未定义');
  }
}