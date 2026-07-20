// ACMS · 自由对话历史窗口（v0.55）
// 渲染未删 session 列表，支持搜索 / 打开 / 删除 / 软删
//
// 依赖：api / toast / showConfirm / ACMSWin（全局）
// 数据：GET /api/chat-sessions?include_deleted=false
//
// 注意：本文件只负责历史窗口内的渲染和操作。
// 启动菜单子菜单的渲染在 taskbar.js 里（renderLauncherChatList）。

(function() {
  'use strict';

  var _allSessions = [];   // 当前加载的全部历史（用于搜索过滤）
  var _searchQuery = '';

  // 加载历史（被 chat-history 视图 loader 调用）
  window.loadChatHistory = async function() {
    var listEl = document.getElementById('chat-history-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2);font-size:12px">⏳ 加载中…</div>';
    try {
      const r = await api('GET', '/chat-sessions');
      const sessions = (r && r.sessions) || [];
      _allSessions = sessions;
      renderHistoryList(_allSessions);
    } catch (e) {
      listEl.innerHTML = '<div class="chat-hist-empty">加载失败: ' + escHtml(e.message) + '</div>';
    }
  };

  // 搜索过滤（oninput 触发）
  window.onChatHistorySearch = function(q) {
    _searchQuery = (q || '').trim().toLowerCase();
    var filtered = !_searchQuery ? _allSessions : _allSessions.filter(function(s) {
      return (s.title || '').toLowerCase().indexOf(_searchQuery) !== -1;
    });
    renderHistoryList(filtered);
  };

  // 渲染列表
  function renderHistoryList(sessions) {
    var listEl = document.getElementById('chat-history-list');
    if (!listEl) return;
    if (!sessions.length) {
      listEl.innerHTML = '<div class="chat-hist-empty">' + (_searchQuery ? '🔍 没找到匹配的对话' : '✨ 还没有对话 · 启动菜单 💬 → 新建对话') + '</div>';
      return;
    }
    var html = '';
    sessions.forEach(function(s) {
      var title = escHtml(s.title || '未命名');
      var updated = fmtRelative(s.updated_at);
      var msgCount = s.message_count != null ? s.message_count : '';
      html += '<div class="chat-hist-row" data-sid="' + escHtml(s.id) + '">';
      html += '<span class="chr-icon">💬</span>';
      html += '<div class="chr-info">';
      html += '<div class="chr-title" title="' + title + '">' + title + '</div>';
      html += '<div class="chr-meta">';
      html += '<span class="chr-meta-item">🕒 ' + updated + '</span>';
      if (msgCount !== '') html += '<span class="chr-meta-item">💬 ' + msgCount + ' 条</span>';
      html += '</div>';
      html += '</div>';
      html += '<div class="chr-actions">';
      html += '<button onclick="openChatSessionFromHistory(\'' + s.id + '\')" title="打开对话">↪ 打开</button>';
      html += '<button onclick="softDeleteChatSession(\'' + s.id + '\',\'' + title.replace(/'/g, "\\'") + '\')" title="移到回收站" style="color:var(--accent2)">🗑</button>';
      html += '</div>';
      html += '</div>';
    });
    listEl.innerHTML = html;
  }

  // 打开历史会话
  window.openChatSessionFromHistory = function(sid) {
    if (!window.ACMSWin) return;
    if (!ACMSWin.isActive()) ACMSWin.enable();
    ACMSWin.open('chat', { w: 720, h: 520, instanceId: sid });
  };

  // 软删（移到回收站）
  window.softDeleteChatSession = function(sid, title) {
    if (typeof showConfirm !== 'function') {
      if (!confirm('确认删除「' + title + '」？将移到回收站，7 天后自动清理。')) return;
    } else {
      showConfirm('确认删除「' + title + '」？将移到回收站，7 天后自动清理。').then(function(ok) {
        if (ok) doSoftDelete(sid);
      });
      return;
    }
    doSoftDelete(sid);
  };

  async function doSoftDelete(sid) {
    try {
      const r = await api('DELETE', '/chat-sessions/' + sid);
      if (r && r.error) { if (typeof toast === 'function') toast('删除失败: ' + r.error, 'error'); return; }
      if (typeof toast === 'function') toast('已移到回收站', 'success');
      // 关掉对应窗口（如果开着）
      if (window.ACMSWin) {
        // 简单实现：找到对应 window 并关闭
        try { ACMSWin.close && ACMSWin.close(findChatWindow(sid)); } catch (e) {}
      }
      // 刷新历史 + 回收站 badge + launcher 列表
      await window.loadChatHistory();
      if (window.refreshLauncherChatList) window.refreshLauncherChatList();
      if (window.refreshRecycleBinCount) window.refreshRecycleBinCount();
    } catch (e) {
      console.error('[softDeleteChatSession] error:', e);
      if (typeof toast === 'function') toast('删除失败: ' + e.message, 'error');
    }
  }

  // 通过 sid 找到对应的窗口对象（用于关窗）
  function findChatWindow(sid) {
    if (!window.ACMSWin || !ACMSWin.open) return null;
    // 通过 querySelector 找（window-manager 没暴露列表，但 DOM 可查）
    var wins = document.querySelectorAll('.acms-window');
    for (var i = 0; i < wins.length; i++) {
      var el = wins[i];
      // 通过 onClose 闭包标识不好做；用 instanceId 存到 dataset
      if (el.dataset && el.dataset.chatSid === sid) {
        // 找到对应 w 对象 - 简单方案：从 ACMSWin 内部找
        // ACMSWin 没暴露 list；降级：直接 close el.click()
        var btn = el.querySelector('.aw-btn-close');
        if (btn) btn.click();
        return true;
      }
    }
    return null;
  }

  // ── 工具：相对时间 ──
  function fmtRelative(iso) {
    if (!iso) return '';
    var t = new Date(iso).getTime();
    var now = Date.now();
    var diff = now - t;
    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 7 * 24 * 60 * 60 * 1000) return Math.floor(diff / 86400000) + ' 天前';
    return new Date(iso).toLocaleDateString('zh-CN');
  }

  function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})();