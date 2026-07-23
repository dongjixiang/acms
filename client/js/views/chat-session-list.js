// ACMS · 自由对话历史 + 回收站窗口（v0.55 合并版）
// 用 mode 参数区分 history / recycle 两个视图，共享渲染逻辑。
//
// 依赖：api / toast / showConfirm / ACMSWin（全局）
// 数据：
//   - history: GET /api/chat-sessions
//   - recycle: GET /api/chat-sessions/recycle-bin/list
//
// 入口（被 view-loader 调用）：
//   - window.loadChatHistory()      → history 模式
//   - window.loadChatRecycleBin()    → recycle 模式
//
// 暴露的操作函数：
//   - window.openChatSessionFromHistory(sid)
//   - window.softDeleteChatSession(sid, title)
//   - window.restoreChatSession(sid)
//   - window.purgeChatSession(sid, title)
//   - window.onChatHistorySearch(query)

(function() {
  'use strict';

  // ── 模块状态（按 mode 隔离） ──
  var state = {
    history: { all: [], query: '' },
    recycle: { all: [] },
  };

  // ── 入口 ──

  window.loadChatHistory = async function() {
    var listEl = document.getElementById('chat-history-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2);font-size:12px">⏳ 加载中…</div>';
    try {
      const r = await api('GET', '/chat-sessions');
      const sessions = (r && r.sessions) || [];
      state.history.all = sessions;
      render('history', applySearch('history'));
    } catch (e) {
      listEl.innerHTML = '<div class="chat-hist-empty">加载失败: ' + escHtml(e.message) + '</div>';
    }
  };

  window.loadChatRecycleBin = async function() {
    var listEl = document.getElementById('chat-recycle-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2);font-size:12px">⏳ 加载中…</div>';
    try {
      const r = await api('GET', '/chat-sessions/recycle-bin/list');
      const sessions = (r && r.sessions) || [];
      state.recycle.all = sessions;
      render('recycle', sessions);
    } catch (e) {
      listEl.innerHTML = '<div class="chat-recycle-empty">加载失败: ' + escHtml(e.message) + '</div>';
    }
  };

  window.onChatHistorySearch = function(q) {
    state.history.query = (q || '').trim().toLowerCase();
    render('history', applySearch('history'));
  };

  // ── 渲染（共用） ──

  function render(mode, sessions) {
    var listEl = document.getElementById(mode === 'history' ? 'chat-history-list' : 'chat-recycle-list');
    if (!listEl) return;
    var emptyCls = mode === 'history' ? 'chat-hist-empty' : 'chat-recycle-empty';
    var rowCls = mode === 'history' ? 'chat-hist-row' : 'chat-recycle-row';

    // v0.58.5: recycle 模式顶部加「清空全部」按钮（仅当有项目时显示）
    var topBar = (mode === 'recycle' && sessions.length > 0)
      ? '<div class="chat-recycle-toolbar"><span class="chat-recycle-count">回收站共 ' + sessions.length + ' 个</span>'
        + '<button class="btn-purge-all" onclick="purgeAllChatSessions()">🗑 清空全部</button></div>'
      : '';

    if (!sessions.length) {
      listEl.innerHTML = topBar + '<div class="' + emptyCls + '">' + emptyText(mode) + '</div>';
      return;
    }

    var html = topBar;
    sessions.forEach(function(s) {
      html += renderRow(s, mode, rowCls);
    });
    listEl.innerHTML = html;
  }

  function renderRow(s, mode, rowCls) {
    var title = escHtml(s.title || '未命名');
    var safeTitle = title.replace(/'/g, "\\'");
    var sid = escHtml(s.id);

    var html = '<div class="' + rowCls + '" data-sid="' + sid + '">';
    html += '<span class="chr-icon">💬</span>';
    html += '<div class="chr-info">';
    html += '<div class="chr-title" title="' + title + '">' + title + '</div>';
    html += '<div class="chr-meta">';
    html += metaItems(s, mode);
    html += '</div></div>';
    html += '<div class="chr-actions">';
    html += actionButtons(s, mode, safeTitle);
    html += '</div></div>';
    return html;
  }

  function metaItems(s, mode) {
    if (mode === 'history') {
      var updated = fmtRelative(s.updated_at);
      var msgCount = s.message_count != null ? s.message_count : '';
      var html = '<span class="chr-meta-item">🕒 ' + updated + '</span>';
      if (msgCount !== '') html += '<span class="chr-meta-item">💬 ' + msgCount + ' 条</span>';
      return html;
    }
    // recycle
    var deleted = fmtAbsolute(s.deleted_at);
    var daysLeft = s.days_remaining != null ? s.days_remaining : 0;
    return '<span class="chr-meta-item">🗑 ' + deleted + '</span>'
         + '<span class="chr-meta-item chr-days">⏳ 还剩 ' + daysLeft + ' 天</span>';
  }

  function actionButtons(s, mode, safeTitle) {
    var sid = s.id;
    if (mode === 'history') {
      return '<button onclick="openChatSessionFromHistory(\'' + sid + '\')" title="打开对话">↪ 打开</button>'
           + '<button onclick="softDeleteChatSession(\'' + sid + '\',\'' + safeTitle + '\')" title="移到回收站" style="color:var(--accent2)">🗑</button>';
    }
    // recycle
    return '<button onclick="restoreChatSession(\'' + sid + '\')" title="恢复到对话列表">↩ 恢复</button>'
         + '<button onclick="purgeChatSession(\'' + sid + '\',\'' + safeTitle + '\')" title="永久删除" style="color:var(--accent2)">🗑 永久删除</button>';
  }

  function emptyText(mode) {
    if (mode === 'history') {
      return state.history.query ? '🔍 没找到匹配的对话' : '✨ 还没有对话 · 启动菜单 💬 → 新建对话';
    }
    return '✨ 回收站是空的';
  }

  function applySearch(mode) {
    if (mode !== 'history') return state[mode].all;
    var q = state.history.query;
    if (!q) return state.history.all;
    return state.history.all.filter(function(s) {
      return (s.title || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // ── 操作 ──

  window.openChatSessionFromHistory = function(sid) {
    if (!window.ACMSWin) return;
    if (!ACMSWin.isActive()) ACMSWin.enable();
    ACMSWin.open('chat', { w: 720, h: 520, instanceId: sid });
  };

  window.softDeleteChatSession = function(sid, title) {
    var doIt = function() {
      doSoftDelete(sid);
    };
    if (typeof showConfirm === 'function') {
      showConfirm('确认删除「' + title + '」？将移到回收站，7 天后自动清理。').then(function(ok) {
        if (ok) doIt();
      });
    } else {
      if (confirm('确认删除「' + title + '」？将移到回收站，7 天后自动清理。')) doIt();
    }
  };

  async function doSoftDelete(sid) {
    try {
      const r = await api('DELETE', '/chat-sessions/' + sid);
      if (r && r.error) { if (typeof toast === 'function') toast('删除失败: ' + r.error, 'error'); return; }
      if (typeof toast === 'function') toast('已移到回收站', 'success');
      closeChatWindowBySid(sid);
      await window.loadChatHistory();
      if (window.refreshLauncherChatList) window.refreshLauncherChatList();
      if (window.refreshRecycleBinCount) window.refreshRecycleBinCount();
    } catch (e) {
      console.error('[softDeleteChatSession] error:', e);
      if (typeof toast === 'function') toast('删除失败: ' + e.message, 'error');
    }
  }

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

  // v0.58.5: 一键清空回收站（不等 7 天过期）
  window.purgeAllChatSessions = function() {
    var doPurge = async function() {
      try {
        const r = await api('DELETE', '/chat-sessions/recycle-bin/purge-all');
        if (r && r.error) { if (typeof toast === 'function') toast('清空失败: ' + r.error, 'error'); return; }
        var n = (r && typeof r.count === 'number') ? r.count : 0;
        if (typeof toast === 'function') toast('已清空回收站（' + n + ' 个对话）', 'success');
        await window.loadChatRecycleBin();
        if (window.refreshRecycleBinCount) window.refreshRecycleBinCount();
      } catch (e) {
        console.error('[purgeAllChatSessions] error:', e);
        if (typeof toast === 'function') toast('清空失败: ' + e.message, 'error');
      }
    };
    if (typeof showConfirm === 'function') {
      showConfirm('⚠️ 清空整个回收站？\n\n所有对话及其消息将被永久删除，不可恢复。\n（如果只是想等过期自动清理，不需要点这个）', {
        title: '清空回收站',
        confirmText: '确认清空',
        cancelText: '取消',
        type: 'warning',
      }).then(function(ok) {
        if (ok) doPurge();
      });
    } else {
      if (confirm('清空整个回收站？此操作不可恢复。')) doPurge();
    }
  };

  // ── 工具 ──

  // 通过 sid 找到对应聊天窗口并关闭（chat.js initChatWindow 时把 sid 存到 dataset.chatSid）
  function closeChatWindowBySid(sid) {
    var wins = document.querySelectorAll('.acms-window');
    for (var i = 0; i < wins.length; i++) {
      var el = wins[i];
      if (el.dataset && el.dataset.chatSid === sid) {
        var btn = el.querySelector('.aw-btn-close');
        if (btn) btn.click();
        return;
      }
    }
  }

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