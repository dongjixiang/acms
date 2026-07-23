// ACMS 统一卡片渲染器（v0.61）
// 纯函数，不依赖任何视图的闭包变量
// 
// 全局可调（小吉面板、assist-launcher、未来视图均可 import）
// 每个函数接收纯数据对象，返回 DOM 元素
// 
// 设计原则：
//   - 不自带 escHtml（引用全局的，utils.js 已定义）
//   - 不自带 CSS（复用样式，或加内联 style 确保独立可用）
//   - 不自带音乐播放器（只展示平台链接，全文娱体验走 chat 流）
//   - 不自带图片上传（只展示缩略图+查看原图链接）

(function() {
  'use strict';

  // 安全的文本转义（后端也可能调，但这里是前端全局）
  function esc(s) {
    if (!s) return '';
    if (typeof escHtml === 'function') return escHtml(s);
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // === Image Card ===
  // payload: { url, title, prompt?, size? }
  function renderImageCard(payload) {
    if (!payload || !payload.url) {
      var empty = document.createElement('div');
      empty.className = 'cr-card cr-image-empty';
      empty.textContent = '🖼️ 图片数据不可用';
      return empty;
    }
    var div = document.createElement('div');
    div.className = 'cr-card cr-image';
    div.innerHTML =
      '<div style="font-weight:bold;margin-bottom:4px;font-size:13px">🖼️ ' + esc(payload.title || '图片') + '</div>' +
      (payload.prompt ? '<div style="font-size:11px;color:var(--text2);margin-bottom:4px">' + esc(payload.prompt) + '</div>' : '') +
      '<img src="' + esc(payload.url) + '" alt="' + esc(payload.title || '') + '" ' +
        'style="max-width:200px;max-height:160px;border-radius:6px;border:1px solid var(--border);display:block;cursor:pointer" ' +
        'onclick="window.open(\'' + esc(payload.url) + '\',\'_blank\')" ' +
        'onerror="this.outerHTML=\'<div style=color:var(--danger);font-size:12px>⚠ 图片加载失败</div>\'">' +
      (payload.size ? '<div style="font-size:11px;color:var(--text3);margin-top:2px">' + esc(payload.size) + '</div>' : '');
    return div;
  }

  // === Music Card ===
  // payload: { song, artist, platforms: [{name, url, icon?}] }
  function renderMusicCard(payload) {
    if (!payload || !payload.song) return null;
    var div = document.createElement('div');
    div.className = 'cr-card cr-music';
    var title = (payload.artist ? esc(payload.artist) + ' - ' : '') + esc(payload.song);
    var platforms = (payload.platforms || []).filter(function(p) { return p && p.url; });
    var linksHtml = platforms.map(function(p) {
      return '<a href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer" ' +
        'style="display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;border-radius:4px;' +
        'background:rgba(255,217,61,0.06);border:1px solid rgba(255,217,61,0.12);text-decoration:none;font-size:12px">' +
        (p.icon || '🎵') + ' ' + esc(p.name || '平台') + '</a>';
    }).join('');
    div.innerHTML =
      '<div style="font-weight:bold;margin-bottom:4px;font-size:13px">🎵 ' + title + '</div>' +
      (linksHtml ? '<div style="margin-bottom:2px;font-size:11px;color:var(--text3)">在以下平台搜索：</div><div>' + linksHtml + '</div>' : '<div style="font-size:12px;color:var(--text2)">暂无可用平台</div>');
    return div;
  }

  // === Search Card ===
  // payload: { summary, results: [{title, snippet, url?}] }
  function renderSearchCard(payload) {
    if (!payload) return null;
    var div = document.createElement('div');
    div.className = 'cr-card cr-search';
    var summaryHtml = payload.summary ? '<div style="font-size:12px;color:var(--text2);margin-bottom:6px">' + esc(payload.summary) + '</div>' : '';
    var resultsHtml = (payload.results || []).slice(0, 5).map(function(r) {
      return '<div style="margin:4px 0;font-size:12px">' +
        (r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener" style="font-weight:bold;text-decoration:none">' + esc(r.title) + '</a>' : '<b>' + esc(r.title) + '</b>') +
        (r.snippet ? '<div style="color:var(--text3);font-size:11px;margin-top:1px">' + esc(r.snippet) + '</div>' : '') +
        '</div>';
    }).join('');
    div.innerHTML = '<div style="font-weight:bold;margin-bottom:4px;font-size:13px">🔍 搜索结果</div>' + summaryHtml + resultsHtml;
    return div;
  }

  // === Research Card ===
  // payload: { answer, sources: [{title, url?}] }
  function renderResearchCard(payload) {
    if (!payload || !payload.answer) return null;
    var div = document.createElement('div');
    div.className = 'cr-card cr-research';
    var sourcesHtml = (payload.sources || []).slice(0, 5).map(function(s) {
      return '<div style="font-size:11px;margin:1px 0">' +
        (s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title || s.url) + '</a>' : esc(s.title || '')) +
        '</div>';
    }).join('');
    div.innerHTML =
      '<div style="font-weight:bold;margin-bottom:4px;font-size:13px">📊 调研摘要</div>' +
      '<div style="font-size:12px;color:var(--text);margin-bottom:6px;line-height:1.5">' + esc(payload.answer.slice(0, 600)) + '</div>' +
      (sourcesHtml ? '<details><summary style="font-size:11px;color:var(--text3);cursor:pointer">来源 (' + (payload.sources || []).length + ')</summary>' + sourcesHtml + '</details>' : '');
    return div;
  }

  // === Email Card ===
  // payload: { to, subject, body, attachments? }
  function renderEmailCard(payload) {
    if (!payload || !payload.subject) return null;
    var div = document.createElement('div');
    div.className = 'cr-card cr-email';
    div.innerHTML =
      '<div style="font-weight:bold;margin-bottom:4px;font-size:13px">📧 邮件已发送</div>' +
      '<div style="font-size:12px;color:var(--text2)">收件人: ' + esc(payload.to || '—') + '</div>' +
      '<div style="font-size:12px;color:var(--text2)">主题: ' + esc(payload.subject) + '</div>' +
      (payload.body ? '<div style="font-size:11px;color:var(--text3);margin-top:2px">' + esc(payload.body.slice(0, 200)) + '</div>' : '') +
      (payload.attachments ? '<div style="font-size:11px;color:var(--text3);margin-top:2px">📎 ' + esc(payload.attachments) + '</div>' : '');
    return div;
  }

  // === 统一入口 ===
  // type: 'image'|'music'|'search'|'research'|'email'
  // payload: 对应卡片的数据对象
  // 返回 DOM 元素，调用方 insert 到容器
  function renderCard(type, payload) {
    switch (type) {
      case 'image': return renderImageCard(payload);
      case 'music': return renderMusicCard(payload);
      case 'search': return renderSearchCard(payload);
      case 'research': return renderResearchCard(payload);
      case 'email': return renderEmailCard(payload);
      default: return null;
    }
  }

  // 从工具 handler result 推断卡片类型和数据
  // 用于 assist-free route 对 tool result 做自动卡片转换
  function inferCardFromToolResult(toolName, result) {
    if (!result || !result.ok) return null;
    if (toolName === 'generate_image') {
      var url = result.image_url_output || result.asset_path || result.url || '';
      return { type: 'image', payload: { url: url, title: result.prompt || '图片', prompt: result.prompt, size: result.size } };
    }
    if (toolName === 'play_music') {
      return { type: 'music', payload: { song: result.song, artist: result.artist, platforms: result.platforms || result.playable } };
    }
    if (toolName === 'web_research') {
      return { type: 'research', payload: { answer: result.answer || result.formatted, sources: result.sources || result.searchResults } };
    }
    if (toolName === 'web_search') {
      return { type: 'search', payload: { summary: result.summary || '', results: result.results || [] } };
    }
    if (toolName === 'send_email') {
      return { type: 'email', payload: { to: result.to, subject: result.subject, body: result.body, attachments: result.attachments } };
    }
    return null;
  }

  // 挂到全局
  window.ACMS = window.ACMS || {};
  ACMS.CardRenderer = {
    renderCard: renderCard,
    inferCardFromToolResult: inferCardFromToolResult,
    renderImageCard: renderImageCard,
    renderMusicCard: renderMusicCard,
    renderSearchCard: renderSearchCard,
    renderResearchCard: renderResearchCard,
    renderEmailCard: renderEmailCard,
  };

  console.log('[CardRenderer] 卡片渲染器已注册');
})();