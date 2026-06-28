// ACMS · 音乐卡片公共渲染模块（v0.21，2026-06-27）
//
// 解决历史遗留问题：之前音乐卡片在两个地方独立实现（assist 侧栏 + 聊天流卡片），
// 改一处忘改另一处 → "放大缩小按钮在聊天流看不到"这类 bug 反复出现。
//
// 本模块是唯一真实实现（Single Source of Truth），提供：
//   - normalizePlayable(data)  → 标准化 playable[] 列表
//   - playerHTML(source, opts) → 单个播放器 HTML（bilibili/netease/audio + 进度条）
//   - sourceNavHTML(...)       → 源切换按钮组
//   - expandBtnHTML(...)       → 放大/缩小按钮
//   - attachProgress(rootEl)   → 挂进度条事件监听（必须在 HTML 插入 DOM 后调用）
//   - renderCard(...)          → 一键渲染整张卡（assist 模式专用，靠 poll 整卡重渲染）
//
// 进度条说明（B 站/网易云是 iframe 跨域，JS 无法操控进度，所以仅 audio 类型画进度条）

(function () {
  'use strict';

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  function uid() {
    return 'mc-' + Math.random().toString(36).slice(2, 9);
  }

  /**
   * 标准化 playable 列表
   * 接受原始 data（含 playable_sources / playable_url），返回 playable[]
   */
  function normalizePlayable(data) {
    const out = (data && data.playable_sources ? data.playable_sources : []).filter(s => s && s.url);
    if (out.length === 0 && data && data.playable_url) {
      const u = data.playable_url;
      out.push({
        type: u.includes('bilibili.com') ? 'bilibili' : 'audio',
        label: '源 #1',
        url: u,
        title: u.includes('bilibili.com') ? '哔哩哔哩' : '音频',
      });
    }
    return out;
  }

  /**
   * 单个播放器 HTML
   * @param {object} source - playable 元素 {type, label, url, title?}
   * @param {object} opts   - {expanded: bool}
   */
  function playerHTML(source, opts) {
    opts = opts || {};
    const expanded = !!opts.expanded;
    if (!source || !source.url) return '';

    if (source.type === 'bilibili') {
      const h = expanded ? 360 : 200;
      return `<div class="music-player-wrap" data-type="bilibili" style="margin:8px 0${expanded ? '' : ';max-width:360px'}">
        <iframe src="${escHtml(source.url)}" style="width:100%;height:${h}px;border:none;border-radius:8px" allow="autoplay" loading="lazy"></iframe>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">📺 ${escHtml(source.title || source.label || '哔哩哔哩')}</div>
      </div>`;
    }

    if (source.type === 'netease') {
      const h = expanded ? 120 : 80;
      return `<div class="music-player-wrap" data-type="netease" style="margin:8px 0${expanded ? '' : ';max-width:360px'}">
        <iframe src="${escHtml(source.url)}" style="width:100%;height:${h}px;border:none;border-radius:8px" allow="autoplay" loading="lazy"></iframe>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">🎵 ${escHtml(source.title || source.label || '网易云音乐')}</div>
      </div>`;
    }

    // v0.22 酷我音乐（player.kuwo.cn/song/{MUSICRID} — 实测可达，含 audio 标签）
    if (source.type === 'kuwo') {
      const h = expanded ? 120 : 80;
      return `<div class="music-player-wrap" data-type="kuwo" style="margin:8px 0${expanded ? '' : ';max-width:360px'}">
        <iframe src="${escHtml(source.url)}" style="width:100%;height:${h}px;border:none;border-radius:8px" allow="autoplay" loading="lazy"></iframe>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">🎼 ${escHtml(source.title || source.label || '酷我音乐')}</div>
      </div>`;
    }

    // audio 类型：自定义进度条（隐藏原生 controls，体验更可控）
    const id = uid();
    return `<div class="music-player-wrap" data-type="audio" data-audio-id="${id}" style="margin:8px 0">
      <audio id="${id}" preload="metadata" style="display:block;width:100%;max-height:0;opacity:0;position:absolute;pointer-events:none" src="${escHtml(source.url)}">浏览器不支持 audio</audio>
      <div class="music-progress" data-for="${id}" style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(255,255,255,0.04);border-radius:6px;margin-top:2px;font-size:11px;color:var(--text3)">
        <span class="music-time-current" style="min-width:32px;font-variant-numeric:tabular-nums">0:00</span>
        <div class="music-progress-bar" style="flex:1;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;cursor:pointer;position:relative">
          <div class="music-progress-buffered" style="position:absolute;left:0;top:0;height:100%;background:rgba(255,255,255,0.15);border-radius:2px;width:0%;transition:width .3s"></div>
          <div class="music-progress-played" style="position:absolute;left:0;top:0;height:100%;background:var(--accent);border-radius:2px;width:0%"></div>
        </div>
        <span class="music-time-total" style="min-width:32px;font-variant-numeric:tabular-nums">0:00</span>
        <button class="music-play-btn" data-for="${id}" title="播放/暂停" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:14px;padding:0 4px;line-height:1">▶</button>
      </div>
    </div>`;
  }

  /**
   * 源切换按钮组 HTML（>1 个源时才用）
   * @param {Array} playable
   * @param {number} currentIdx
   * @param {Function} onclickBuilder - (i) => string，返回 onclick 属性值字符串
   */
  function sourceNavHTML(playable, currentIdx, onclickBuilder) {
    if (!playable || playable.length <= 1) return '';
    const builder = onclickBuilder || ((i) => `switchChatMusicSource(this, ${i})`);
    return `<div class="music-source-nav" style="display:flex;gap:4px;flex-wrap:wrap;margin:4px 0">
      ${playable.map((s, i) => `
        <button class="btn-small music-source-btn" data-music-idx="${i}"
          onclick="${builder(i)}"
          style="font-size:11px;${i === currentIdx ? 'background:var(--accent);color:var(--bg);border-color:var(--accent)' : ''}">
          ${escHtml(s.label || '源#' + (i + 1))}
        </button>
      `).join('')}
    </div>`;
  }

  /**
   * 放大/缩小按钮 HTML
   * @param {boolean} expanded
   * @param {string} toggleExpr - onclick 表达式字符串（不含末尾括号，如 "toggleXxx(this)" 或 "toggleXxx('reqid')"）
   */
  function expandBtnHTML(expanded, toggleExpr) {
    const expr = toggleExpr || 'toggleChatMusicExpand(this)';
    return `<button class="btn-small music-expand-btn" onclick="${expr}"
      style="font-size:11px;float:right;margin-left:4px">
      ${expanded ? '🔽 缩小' : '⛶ 放大'}
    </button>`;
  }

  /**
   * 挂进度条事件（必须在 playerHTML 插入 DOM 后调用）
   * @param {HTMLElement} rootEl - 卡片根元素（任意含 .music-player-wrap 的祖先即可）
   */
  function attachProgress(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return;
    rootEl.querySelectorAll('.music-player-wrap[data-type="audio"]').forEach(wrap => {
      const audioId = wrap.dataset.audioId;
      const audio = wrap.querySelector('audio');
      const played = wrap.querySelector('.music-progress-played');
      const buffered = wrap.querySelector('.music-progress-buffered');
      const bar = wrap.querySelector('.music-progress-bar');
      const curEl = wrap.querySelector('.music-time-current');
      const durEl = wrap.querySelector('.music-time-total');
      const playBtn = wrap.querySelector('.music-play-btn');
      if (!audio || !played || !bar) return;
      // 防重复绑定（poll 整卡重渲染时 audioId 不变）
      if (wrap.dataset.bound === '1') return;
      wrap.dataset.bound = '1';

      audio.addEventListener('loadedmetadata', () => {
        durEl.textContent = fmtTime(audio.duration);
      });
      audio.addEventListener('timeupdate', () => {
        if (!audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        played.style.width = pct + '%';
        curEl.textContent = fmtTime(audio.currentTime);
      });
      audio.addEventListener('progress', () => {
        if (audio.buffered.length > 0 && audio.duration) {
          const end = audio.buffered.end(audio.buffered.length - 1);
          buffered.style.width = (end / audio.duration * 100) + '%';
        }
      });
      audio.addEventListener('ended', () => {
        played.style.width = '0%';
        audio.currentTime = 0;
        playBtn.textContent = '▶';
      });
      audio.addEventListener('play', () => { playBtn.textContent = '⏸'; });
      audio.addEventListener('pause', () => { playBtn.textContent = '▶'; });

      // 点击进度条 seek
      bar.addEventListener('click', (e) => {
        if (!audio.duration) return;
        const rect = bar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audio.currentTime = ratio * audio.duration;
      });
      // 拖拽 seek
      let dragging = false;
      bar.addEventListener('mousedown', (e) => {
        if (!audio.duration) return;
        dragging = true;
        seekAt(e);
      });
      document.addEventListener('mousemove', (e) => { if (dragging) seekAt(e); });
      document.addEventListener('mouseup', () => { dragging = false; });
      function seekAt(e) {
        const rect = bar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audio.currentTime = ratio * audio.duration;
      }

      // 播放/暂停按钮
      playBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
      });
    });
  }

  // 暴露
  window.ACMSMusicCard = {
    normalizePlayable,
    playerHTML,
    sourceNavHTML,
    expandBtnHTML,
    attachProgress,
    escHtml,
    fmtTime,
  };
})();