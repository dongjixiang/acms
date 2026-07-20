// ACMS · 自由对话回收站窗口（v0.55）
// 列出 7 天内未过期的已删 session，支持恢复 / 永久删除
//
// 依赖：api / toast / showConfirm / ACMSWin（全局）
// 数据：GET /api/chat-sessions/recycle-bin/list

(function() {
  'use strict';

  // 加载回收站（被 chat-recycle 视图 loader 调用）
  window.loadChatRecycleBin = async function() {
    var listEl = document.getElementById('chat-recycle-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2);font-size:12px">⏳ 加载中…</div>';
    try {
      const r = await api('GET', '/chat-sessions/recycle-bin/list');
      const sessions = (r && r.sessions) || [];
      renderRecycleList(sessions);
    } catch (e) {
      listEl.innerHTML = '<div class="chat-recycle-empty">加载失败: ' + escHtml(e.message) + '</div>';
    }
  };

  function renderRecycleList(sessions) {
    var listEl = document.getElementById('chat-recycle-list');
    if (!listEl) return;
    if (!sessions.length) {
      listEl.innerHTML = '<div class="chat-recycle-empty">✨ 回收站是空的</div>';
      return;
    }
    var html = '';
    sessions.forEach(function(s) {
      var title = escHtml(s.title || '未命名');
      var deleted = fmtAbsolute(s.deleted_at);
      var daysLeft = s.days_remaining != null ? s.days_remaining : 0;
      html += '<div class="chat-recycle-row" data-sid="' + escHtml(s.id) + '">';
      html += '<span class="chr-icon">💬</span>';
      html += '<div class="chr-info">';
      html += '<div class="chr-title" title="' + title + '">' + title + '</div>';
      html += '<div class="chr-meta">';
      html += '<span class="chr-meta-item">🗑 ' + deleted + '</span>';
      html += '<span class="chr-meta-item chr-days">⏳ 还剩 ' + daysLeft + ' 天</span>';
      html += '</div>';
      html += '</div>';
      html += '<div class="chr-actions">';
      html += '<button onclick="restoreChatSession(\'' + s.id + '\')" title="恢复到对话列表">↩ 恢复</button>';
      html += '<button onclick="purgeChatSession(\'' + s.id + '\',\'' + title.replace(/'/g, "\\'") + '\')" title="永久删除" style="color:var(--accent2)">🗑 永久删除</button>';
      html += '</div>';
      html += '</div>';
    });
    listEl.innerHTML = html;
  }

  // 恢复
  window.restoreChatSession = async function(sid) {
    try {
      const r = await api('POST', '/chat-sessions/' + sid + '/restore');
      if (r && r.error) { if (typeof toast === 'function') toast('恢复失败: ' + r.error, 'error'); return; }
      if (typeof toast === 'function') toast('已恢复', 'success');
      await window.loadChatRecycleBin();
      if (window.refreshRecycleBinCount) window.refreshRecycleBinCount();
      if (window.refreshLauncherChatList) window.refreshLauncherChatList();
    } catch (e) {
      console.error('[restoreChatSession] error:', e);
      if (typeof toast === 'function') toast('恢复失败: ' + e.message, 'error');
    }
  };

  // 永久删除（二级确认）
  window.purgeChatSession = function(sid, title) {
    var doPurge = async function() {
      try {
        const r = await api('DELETE', '/chat-sessions/' + sid + '/purge');
        if (r && r.error) { if (typeof toast === 'function') toast('永久删除失败: ' + r.error, 'error'); return; }
        if (typeof toast === 'function') toast('已永久删除', 'success');
        await window.loadChatRecycleBin();
        if (window.refreshRecycleBinCount) window.refreshRecycleBinCount();
      } catch (e) {
        console.error('[purgeChatSession] error:', e);
        if (typeof toast === 'function') toast('永久删除失败: ' + e.message, 'error');
      }
    };
    if (typeof showConfirm === 'function') {
      showConfirm('⚠️ 永久删除「' + title + '」？\n\n此操作不可恢复，所有消息将被清除。').then(function(ok) {
        if (ok) doPurge();
      });
    } else {
      if (confirm('永久删除「' + title + '」？此操作不可恢复。')) doPurge();
    }
  };

  // ── 工具 ──
  function fmtAbsolute(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return y + '-' + m + '-' + day + ' ' + hh + ':' + mm;
  }

  function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})();