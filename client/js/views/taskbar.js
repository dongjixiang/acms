// ACMS L1 — 底部任务栏
// 依赖: App (state.js)、api.js

(function() {
  'use strict';

  // ── 初始化 ──
  function init() {
    updateClock();
    setInterval(updateClock, 10000);
    pollTaskbar();
    setInterval(pollTaskbar, 30000);  // 每 30s 刷新状态
    bindEvents();
    initProjectPill();
    // v0.55：启动时拉回收站 badge + 历史列表缓存
    if (typeof refreshRecycleBinCount === 'function') refreshRecycleBinCount();
  }

  // ── 项目切换 Pill ──
  function initProjectPill() {
    updateProjectPill();
    // 首次加载项目列表到下拉
    loadProjectDropdown();
  }

  function updateProjectPill() {
    var icon = document.getElementById('tb-project-icon');
    var label = document.getElementById('tb-project-label');
    if (!icon || !label) return;

    var inProject = window.App && window.App.currentProject;
    if (inProject) {
      icon.textContent = '📁';
      label.textContent = window.App.currentProject.name || '';
      label.style.color = '';
    } else if (window.App && window.App.currentProjectId) {
      icon.textContent = '📁';
      label.textContent = '项目 ' + (window.App.currentProjectId || '');
      label.style.color = '';
    } else {
      icon.textContent = '📦';
      label.textContent = '项目管理';
      label.style.color = 'var(--text2)';
    }

    // 同步启动菜单
    updateLauncherApps(inProject);
  }

  function updateLauncherApps(inProject) {
    var title = document.getElementById('launcher-proj-title');
    var apps = document.getElementById('launcher-proj-apps');
    if (!title || !apps) return;
    if (inProject) {
      title.textContent = '📁 ' + (window.App.currentProject.name || '当前项目');
      title.style.display = '';
      apps.style.display = '';
    } else {
      title.style.display = 'none';
      apps.style.display = 'none';
    }
  }
  // 暴露全局供 router.js（先加载）调用
  window.updateProjectPill = updateProjectPill;
  window.loadProjectDropdown = loadProjectDropdown;
  var cachedProjects = null;
  var projectsLoading = false;

  function loadProjectDropdown() {
    // 如果有缓存，立即展示（不阻塞 UI）
    if (cachedProjects) {
      renderProjectDropdown(cachedProjects);
    }
    // 避免重复请求
    if (projectsLoading) return;
    projectsLoading = true;
    try {
      api('GET', '/projects?limit=50').then(function(data) {
        var list = Array.isArray(data) ? data : (data.projects || []);
        cachedProjects = list;
        projectsLoading = false;
        renderProjectDropdown(list);
      }).catch(function() {
        projectsLoading = false;
        renderProjectDropdown([]);
      });
    } catch(e) { projectsLoading = false; renderProjectDropdown([]); }
  }

  function renderProjectDropdown(projects) {
    var dd = document.getElementById('tb-project-dropdown');
    if (!dd) return;
    var html = '';
    var activeId = (window.App && window.App.currentProjectId) || null;

    if (projects.length === 0) {
      html += '<div class="pd-item" style="cursor:default;opacity:0.5"><span class="pd-check"></span><span class="pd-name">暂无项目</span></div>';
    } else {
      projects.forEach(function(p) {
        var isActive = p.id === activeId;
        html += '<div class="pd-item' + (isActive ? ' active' : '') + '" data-proj-id="' + escAttr(p.id) + '" onclick="switchProject(\'' + escAttr(p.id) + '\',this)">' +
          '<span class="pd-check">' + (isActive ? '✓' : '') + '</span>' +
          '<span class="pd-icon">📁</span>' +
          '<span class="pd-name">' + escHtml(p.name) + '</span>' +
          '<span class="pd-count">' + (p.activeTasks || p.task_count || '') + '</span>' +
        '</div>';
      });
    }
    html += '<div class="pd-divider"></div>';
    html += '<div class="pd-item new-proj" onclick="openProjectsWindowWithNewForm()">' +
      '<span class="pd-check"></span><span class="pd-icon">+</span>' +
      '<span class="pd-name">新建项目</span>' +
    '</div>';
    dd.innerHTML = html;
  }

  window.toggleProjectDropdown = function(e) {
    if (e) e.stopPropagation();
    var dd = document.getElementById('tb-project-dropdown');
    if (!dd) return;
    var willOpen = !dd.classList.contains('open');
    if (willOpen) {
      dd.classList.add('open');
      document.addEventListener('click', closeProjectDropdownHandler);

      // 有缓存立即展示，无缓存显示加载中
      if (cachedProjects) {
        renderProjectDropdown(cachedProjects);
      } else {
        dd.innerHTML = '<div class="pd-item" style="cursor:default;opacity:0.5;justify-content:center"><span class="pd-name">⏳ 加载中...</span></div>';
      }

      // 后台刷新（避免重复请求）
      if (!projectsLoading) loadProjectDropdown();
    } else {
      dd.classList.remove('open');
      document.removeEventListener('click', closeProjectDropdownHandler);
    }
  };

  function closeProjectDropdownHandler() {
    closeProjectDropdown();
    document.removeEventListener('click', closeProjectDropdownHandler);
  }

  window.closeProjectDropdown = function() {
    var dd = document.getElementById('tb-project-dropdown');
    if (dd) dd.classList.remove('open');
  };

  window.switchProject = function(id, itemEl) {
    var dd = document.getElementById('tb-project-dropdown');
    if (dd) dd.classList.remove('open');
    document.removeEventListener('click', closeProjectDropdownHandler);

    // 如果已经是当前项目，不切换
    if (window.App && window.App.currentProjectId === id) return;

    // 从项目数据中查找
    var projName = itemEl ? itemEl.querySelector('.pd-name').textContent : id;
    var proj = { id: id, name: projName };

    // 调用 router 的 enterProject
    if (typeof enterProject === 'function') {
      enterProject(proj);
    } else {
      // fallback
      if (window.App) { App.currentProject = proj; App.currentProjectId = id; }
      updateProjectPill();
    }
  };

  // 权限控制：非管理员隐藏系统管理
  try {
    var userData = JSON.parse(localStorage.getItem('acms-user') || '{}');
    if (userData.role !== 'admin') {
      var adminItems = document.querySelectorAll('#launcher-menu .launcher-item');
      adminItems.forEach(function(item) {
        if (item.getAttribute('onclick') && item.getAttribute('onclick').includes('launchAdmin')) {
          item.style.display = 'none';
        }
      });
    }
  } catch(e) {}

  // ── 时钟 ──
  function updateClock() {
    var el = document.getElementById('tb-clock');
    if (!el) return;
    var now = new Date();
    el.textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  // ── 轮询任务栏状态 ──
  function pollTaskbar() {
    // Agent 活跃数
    try {
      api('GET', '/tasks?status=in_progress&limit=100').then(function(data) {
        var count = Array.isArray(data) ? data.length : (data.tasks ? data.tasks.length : 0);
        updateAgentCount(count);
      }).catch(function() {});
    } catch(e) {}

    // 待审核任务数
    try {
      api('GET', '/tasks?status=submitted&limit=100').then(function(data) {
        var count = Array.isArray(data) ? data.length : (data.tasks ? data.tasks.length : 0);
        updateReviewCount(count);
      }).catch(function() {});
    } catch(e) {}

    // 通知 — v0.58 改为由 notification-center.js 管理
    // 不再生成 mock 数据，模块初始化时自动渲染
  }

  function updateAgentCount(n) {
    var el = document.getElementById('tb-agent-num');
    if (el) el.textContent = n;
    var dot = document.querySelector('#tb-agent-count .tray-dot');
    if (dot) {
      if (n > 0) { dot.classList.add('pulse'); dot.classList.add('green'); }
      else { dot.classList.remove('pulse'); dot.style.background = 'var(--text3, #5a5a70)'; }
    }
  }

  function updateReviewCount(n) {
    var el = document.getElementById('tb-review-num');
    if (el) el.textContent = n;
    if (n > 0) {
      var badge = document.getElementById('tb-notif-count');
      if (badge) { badge.textContent = n; badge.style.display = 'inline'; }
      // 通知 Agent Buddy 有积压
      if (window.ACMS && ACMS.Buddy && ACMS.Buddy.addScore) {
        ACMS.Buddy.addScore('pending-review', n);
      }
    }
  }

  // ── 通知 ──
  function renderNotifs(notifs) {
    var list = document.getElementById('notif-list');
    if (!list) return;
    list.innerHTML = '';
    notifs.forEach(function(n) {
      var div = document.createElement('div');
      div.className = 'notif-entry';
      div.innerHTML = '<span class="ne-icon">' + n.icon + '</span>' +
        '<div class="ne-body">' +
        '<div class="ne-title">' + n.title + '</div>' +
        '<div class="ne-desc">' + n.desc + '</div>' +
        '<div class="ne-time">' + n.time + '</div></div>';
      list.appendChild(div);
    });
    if (!notifs.length) {
      list.innerHTML = '<div style="font-size:12px;color:var(--text2);padding:8px;text-align:center">暂没有通知</div>';
    }
  }

  // ── 事件绑定 ──
  function bindEvents() {
    // 开始菜单
    var startBtn = document.getElementById('tb-start');
    var launcher = document.getElementById('launcher-menu');
    if (startBtn && launcher) {
      startBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        launcher.classList.toggle('open');
        document.getElementById('notif-panel').classList.remove('open');
      });
      // 点击外部关闭启动菜单（用 click 事件，不用 mousedown 避免和其他组件冲突）
      document.addEventListener('click', function(e) {
        if (launcher.classList.contains('open') &&
            !launcher.contains(e.target) &&
            !startBtn.contains(e.target)) {
          launcher.classList.remove('open');
        }
      });
      launcher.addEventListener('click', function(e) {
        e.stopPropagation();
      });
    }

    // 通知按钮
    var notifBtn = document.getElementById('tb-notif-btn');
    var notifPanel = document.getElementById('notif-panel');
    if (notifBtn && notifPanel) {
      notifBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        // v0.58 使用通知中心 API 管理面板状态 + badge
        if (window.ACMS && ACMS.Notif) {
          ACMS.Notif.toggle();
        } else {
          notifPanel.classList.toggle('open');
        }
        launcher.classList.remove('open');
        // 清除 badge
        var badge = document.getElementById('tb-notif-count');
        if (badge) { badge.textContent = '0'; badge.style.display = 'none'; }
      });
      document.addEventListener('click', function() {
        notifPanel.classList.remove('open');
      });
      notifPanel.addEventListener('click', function(e) { e.stopPropagation(); });
    }

    // 主题切换浮层（弹出主题选择 + 壁纸预览 + 操作）
    var themeBtn = document.getElementById('tb-theme-btn');
    if (themeBtn) {
      // 惰性创建浮层 DOM
      function ensureThemePopup() {
        var existing = document.getElementById('tb-theme-popup');
        if (existing) return existing;
        var popup = document.createElement('div');
        popup.id = 'tb-theme-popup';
        popup.innerHTML =
          '<div class="theme-popup-section">' +
            '<div class="theme-popup-section-title">主题</div>' +
            '<div class="theme-popup-row" id="theme-popup-btns">' +
              '<button class="theme-btn" data-theme="dark" title="暗色">🌙</button>' +
              '<button class="theme-btn" data-theme="light" title="浅色">☀️</button>' +
              '<button class="theme-btn" data-theme="cream" title="奶油">📄</button>' +
            '</div>' +
          '</div>' +
          '<div class="theme-popup-section">' +
            '<div class="theme-popup-section-title">壁纸</div>' +
            '<div class="theme-popup-wallpaper-preview" id="theme-popup-wp-preview" onclick="typeof openWallpaperDialog===\'function\'&&openWallpaperDialog()"></div>' +
            '<div style="display:flex;gap:4px;flex-wrap:wrap">' +
              '<span class="theme-popup-action" onclick="typeof triggerWallpaperUpload===\'function\'&&triggerWallpaperUpload()">📁 上传</span>' +
              '<span class="theme-popup-action" onclick="typeof ACMSWallpaper!==\'undefined\'&&ACMSWallpaper.reset()">🗑 清除</span>' +
              '<span class="theme-popup-action" id="theme-popup-manage-icons" onclick="typeof openDesktopIconManager===\'function\'&&openDesktopIconManager()">📌 图标管理</span>' +
            '</div>' +
          '</div>';
        document.body.appendChild(popup);
        // 浮层内点击阻止冒泡，并处理主题按钮切换
        popup.addEventListener('click', function(ev) {
          ev.stopPropagation();
          var btn = ev.target.closest('.theme-btn');
          if (!btn) return;
          var theme = btn.getAttribute('data-theme');
          if (!theme) return;
          document.documentElement.setAttribute('data-theme', theme);
          localStorage.setItem('acms-theme', theme);
          popup.querySelectorAll('.theme-btn').forEach(function(b) {
            b.classList.toggle('active', b.getAttribute('data-theme') === theme);
          });
          popup.classList.remove('open');
        });
        return popup;
      }

      // 同步壁纸预览缩略图
      function syncThemePopupPreview() {
        var preview = document.getElementById('theme-popup-wp-preview');
        if (!preview) return;
        if (typeof ACMSWallpaper !== 'undefined') {
          var wp = ACMSWallpaper.get();
          if (wp && wp.url) {
            preview.style.backgroundImage = 'url(' + wp.url + ')';
            preview.textContent = '';
            preview.title = '点击选择壁纸';
          } else {
            preview.style.backgroundImage = '';
            preview.textContent = '无壁纸';
            preview.title = '';
          }
        } else {
          preview.style.backgroundImage = '';
          preview.textContent = '无壁纸';
          preview.title = '';
        }
      }

      themeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var popup = ensureThemePopup();
        launcher.classList.remove('open');
        if (popup.classList.contains('open')) {
          popup.classList.remove('open');
          return;
        }
        // 打开：刷新壁纸预览 + 高亮当前主题
        syncThemePopupPreview();
        var currentTheme = document.documentElement.getAttribute('data-theme') || 'cream';
        popup.querySelectorAll('.theme-btn').forEach(function(btn) {
          btn.classList.toggle('active', btn.getAttribute('data-theme') === currentTheme);
        });
        popup.classList.add('open');
      });

      // 浮层外点击关闭
      document.addEventListener('click', function(e) {
        var popup = document.getElementById('tb-theme-popup');
        if (!popup || !popup.classList.contains('open')) return;
        if (popup.contains(e.target)) return;
        if (e.target === themeBtn || themeBtn.contains(e.target)) return;
        popup.classList.remove('open');
      });
    }
  }

  // ── 修改密码 ──
  window.showChangePassword = function() {
    closeLauncher();
    if (document.getElementById('change-password-overlay')) return;

    var user = null;
    try { user = JSON.parse(localStorage.getItem('acms-user') || 'null'); } catch(e) {}
    if (user && (user.isGuest || user.role === 'guest')) {
      toast('游客账号没有密码，无需修改', 'info');
      return;
    }

    var overlay = document.createElement('div');
    overlay.id = 'change-password-overlay';
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog prompt-dialog" style="min-width:0;text-align:left">
        <div class="confirm-icon" style="text-align:center">🔐</div>
        <h3 style="text-align:center">修改密码</h3>
        <p style="text-align:center">请输入原密码验证身份，再设置新密码。</p>
        <div style="margin-bottom:12px">
          <label style="display:block;margin-bottom:5px;font-size:12px;color:var(--text2)">原密码</label>
          <input type="password" class="prompt-input" id="change-current-password" autocomplete="current-password" placeholder="输入当前密码">
        </div>
        <div style="margin-bottom:12px">
          <label style="display:block;margin-bottom:5px;font-size:12px;color:var(--text2)">新密码</label>
          <input type="password" class="prompt-input" id="change-new-password" autocomplete="new-password" placeholder="至少 4 位">
        </div>
        <div style="margin-bottom:12px">
          <label style="display:block;margin-bottom:5px;font-size:12px;color:var(--text2)">确认新密码</label>
          <input type="password" class="prompt-input" id="change-confirm-password" autocomplete="new-password" placeholder="再次输入新密码">
        </div>
        <div id="change-password-error" style="display:none;margin:0 0 12px;color:var(--accent2);font-size:12px"></div>
        <div class="confirm-actions">
          <button class="btn-back confirm-cancel">取消</button>
          <button class="confirm-btn btn-accept confirm-submit">保存修改</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    var currentInput = overlay.querySelector('#change-current-password');
    var newInput = overlay.querySelector('#change-new-password');
    var confirmInput = overlay.querySelector('#change-confirm-password');
    var errorEl = overlay.querySelector('#change-password-error');
    var submitBtn = overlay.querySelector('.confirm-submit');
    var close = function() { overlay.remove(); document.removeEventListener('keydown', onKey); };
    var onKey = function(e) { if (e.key === 'Escape') close(); };
    var showError = function(message) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    };
    var submit = async function() {
      var currentPassword = currentInput.value;
      var newPassword = newInput.value;
      var confirmPassword = confirmInput.value;
      errorEl.style.display = 'none';
      if (!currentPassword) return showError('请输入原密码');
      if (!newPassword || newPassword.length < 4) return showError('新密码至少 4 位');
      if (!confirmPassword) return showError('请再次输入新密码');
      if (newPassword !== confirmPassword) return showError('两次输入的新密码不一致');

      submitBtn.disabled = true;
      submitBtn.textContent = '修改中...';
      try {
        await api('POST', '/auth/change-password', { currentPassword: currentPassword, newPassword: newPassword });
        close();
        toast('密码修改成功', 'success');
      } catch (e) {
        showError(e.message || '密码修改失败');
        submitBtn.disabled = false;
        submitBtn.textContent = '保存修改';
      }
    };

    overlay.querySelector('.confirm-cancel').onclick = close;
    submitBtn.onclick = submit;
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    [currentInput, newInput, confirmInput].forEach(function(input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
      });
    });
    document.addEventListener('keydown', onKey);
    currentInput.focus();
  };

  // ── 退出登录 ──
  window.doLogout = function() {
    localStorage.removeItem('acms-token');
    localStorage.removeItem('acms-user');
    localStorage.removeItem('acms-token-remember');
    window.location.href = '/client/login.html';
  };

  // ── 导航辅助 ──
  window.navigateTo = function(view) {
    if (view === 'projects') {
      launchProjects();
    }
    document.getElementById('launcher-menu').classList.remove('open');
  };

  // ── 启动器导航（桌面模式感知）──
  window.closeLauncher = function() {
    var m = document.getElementById('launcher-menu');
    if (m) m.classList.remove('open');
  };

  window.launchView = function(name) {
    if (window.ACMSWin) {
      if (!ACMSWin.isActive()) ACMSWin.enable();
      ACMSWin.open(name);
    } else if (typeof showWorkspaceView === 'function') {
      showWorkspaceView(name);
    }
    closeLauncher();
  };

window.launchAdmin = function() {
    // 系统管理始终以 ACMSWin 窗口打开（独立加载，不依赖 DOM 克隆）
    if (window.ACMSWin) {
      if (!ACMSWin.isActive()) ACMSWin.enable();
      ACMSWin.open('admin', { w: 720, h: 520 });
    }
    closeLauncher();
  };

  window.launchProjects = function() {
    // 项目列表始终以 ACMSWin 窗口打开（内容由 loadContent 独立加载）
    if (window.ACMSWin) {
      if (!ACMSWin.isActive()) ACMSWin.enable();
      ACMSWin.open('projects', { w: 720, h: 500 });
    }
    closeLauncher();
  };

  // ═══ v0.55 自由对话：新建/历史/回收站 ═══

  // 创建新对话窗口：POST /api/chat-sessions → 拿到 sid → open('chat', {instanceId})
  window.createNewChatWindow = async function() {
    closeLauncher();
    if (!window.ACMSWin) { if (typeof toast === 'function') toast('窗口系统未就绪', 'error'); return; }
    if (!ACMSWin.isActive()) ACMSWin.enable();
    try {
      const r = await api('POST', '/chat-sessions', {});
      if (r && r.error) { toast('创建对话失败: ' + r.error, 'error'); return; }
      const session = r.session;
      ACMSWin.open('chat', {
        w: 720, h: 520,
        instanceId: session.id,
        title: session.title,
      });
      // 关窗后刷新历史列表（提供 onClose 由 chat loader 设置）
    } catch (e) {
      console.error('[createNewChatWindow] error:', e);
      if (typeof toast === 'function') toast('创建对话失败: ' + e.message, 'error');
    }
  };

  // 打开历史对话窗口
  window.openChatHistoryWindow = function() {
    closeLauncher();
    if (!window.ACMSWin) return;
    if (!ACMSWin.isActive()) ACMSWin.enable();
    ACMSWin.open('chat-history', { w: 720, h: 480 });
  };

  // 打开回收站窗口
  window.openChatRecycleBin = function() {
    closeLauncher();
    if (!window.ACMSWin) return;
    if (!ACMSWin.isActive()) ACMSWin.enable();
    ACMSWin.open('chat-recycle', { w: 720, h: 480 });
  };

  // 启动菜单 hover 💬 → 调 API 拉最近 8 条历史 + 渲染子菜单列表
  var _chatListCache = null;
  var _chatListCacheAt = 0;
  window.onChatLauncherHover = async function() {
    var listEl = document.getElementById('launcher-chat-list');
    if (!listEl) return;
    // 30s 缓存，避免每次 hover 都拉
    var now = Date.now();
    if (_chatListCache && now - _chatListCacheAt < 30000) {
      renderLauncherChatList(_chatListCache);
      return;
    }
    listEl.innerHTML = '<div style="padding:8px;color:var(--text3);font-size:11px;text-align:center">加载中…</div>';
    try {
      const r = await api('GET', '/chat-sessions?limit=8');
      const sessions = (r && r.sessions) || [];
      _chatListCache = sessions;
      _chatListCacheAt = now;
      renderLauncherChatList(sessions);
    } catch (e) {
      listEl.innerHTML = '<div style="padding:8px;color:var(--accent2);font-size:11px">加载失败</div>';
    }
  };

  // mouseleave 不做关闭（CSS :hover 处理）
  window.onChatLauncherLeave = function() { /* CSS :hover 自动处理 */ };

function renderLauncherChatList(sessions) {
    var listEl = document.getElementById('launcher-chat-list');
    if (!listEl) return;
    if (!sessions.length) {
      listEl.innerHTML = '<div style="padding:10px 8px;color:var(--text3);font-size:11px;text-align:center">还没有对话 · 点 🆕 创建</div>';
      return;
    }
    // v0.58.4: 顶部总数 + 引导（hover 子菜单只显示最近 8 条，超过 8 条要跳历史窗口管理）
    var html = '<div class="launcher-section-info" id="launcher-chat-count">显示最近 ' + sessions.length + ' 条 · 超过的请去历史窗口</div>';
    sessions.forEach(function(s) {
      var title = (s.title || '未命名').replace(/</g, '&lt;');
      if (title.length > 22) title = title.slice(0, 22) + '…';
      var sid = s.id;
      var safeTitle = title.replace(/'/g, "\\'");
      // v0.58.4: 每条加 🗑 按钮直接软删除（stopPropagation 防止冒泡触发打开对话）
      html += '<div class="launcher-item launcher-chat-row">' +
        '<span class="li-icon">💬</span>' +
        '<span class="li-label" onclick="openChatSessionFromLauncher(\'' + sid + '\',\'' + safeTitle + '\')">' + title + '</span>' +
        '<button class="launcher-item-delete" title="移到回收站（7 天后自动清理）" onclick="event.stopPropagation();softDeleteChatSession(\'' + sid + '\',\'' + safeTitle + '\')">🗑</button>' +
        '</div>';
    });
    listEl.innerHTML = html;
  }

  // 从 launcher 历史点开 → 找到已开窗口 focus；没开则 open
  window.openChatSessionFromLauncher = function(sid, title) {
    closeLauncher();
    if (!window.ACMSWin) return;
    if (!ACMSWin.isActive()) ACMSWin.enable();
    ACMSWin.open('chat', { w: 720, h: 520, instanceId: sid, title: title });
  };

  // 刷新历史列表（关窗 / 标题修改 / 删除后调用）
  window.refreshLauncherChatList = function() {
    _chatListCache = null;
    _chatListCacheAt = 0;
    // 如果 launcher 已打开且 hover 在 chat 上，重新拉
    var chatLauncher = document.getElementById('launcher-chat');
    if (chatLauncher && chatLauncher.matches(':hover')) window.onChatLauncherHover();
  };

  // 拉回收站数量 → 更新 launcher badge + 桌面图标 badge
  window.refreshRecycleBinCount = async function() {
    try {
      const r = await api('GET', '/chat-sessions/recycle-bin/count');
      const count = (r && r.count) || 0;
      // launcher badge
      var badge = document.getElementById('launcher-recycle-count');
      if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
      }
      // 桌面图标 badge（通过 ACMSWin.updateDesktopIconBadge）
      if (window.ACMSWin && ACMSWin.updateDesktopIconBadge) {
        ACMSWin.updateDesktopIconBadge('chat-recycle', count);
      }
    } catch (e) {
      console.warn('[refreshRecycleBinCount] failed:', e.message);
    }
  };

  // 项目卡片点击 → 切换项目
  window.windowSwitchProject = function(id, name) {
    enterProject({ id: id, name: name });
    // 关闭项目列表窗口
    var wins = document.querySelectorAll('.acms-window');
    wins.forEach(function(el) {
      if (el.querySelector('.aw-proj-card')) {
        el.querySelector('.aw-btn-close') && el.querySelector('.aw-btn-close').click();
      }
    });
  };

  // ── 内联快照新建项目表单（窗口内 inline） ──
  // 显示/隐藏内联表单\uff08在 projects 窗口内）
  window.toggleInlineNewProjectForm = function() {
    var form = document.getElementById('inline-new-project-form');
    if (!form) return;
    var willShow = form.style.display === 'none' || !form.style.display;
    form.style.display = willShow ? 'block' : 'none';
    if (willShow) {
      setTimeout(function() {
        var n = document.getElementById('inp-name');
        if (n) n.focus();
      }, 60);
    } else {
      // 取消时清空
      var nm = document.getElementById('inp-name'); if (nm) nm.value = '';
      var ds = document.getElementById('inp-desc'); if (ds) ds.value = '';
      var sl = document.getElementById('inp-slug'); if (sl) sl.value = '';
    }
  };

  // 窗口外调用\uff1a打开 projects 窗口 + 自动展开内联表单
  window.openProjectsWindowWithNewForm = function() {
    if (window.ACMSWin) {
      if (!ACMSWin.isActive()) ACMSWin.enable();
      ACMSWin.open('projects', { w: 720, h: 500 });
      // 等 loader 加载完再展开
      setTimeout(function() {
        if (typeof toggleInlineNewProjectForm === 'function') toggleInlineNewProjectForm();
      }, 350);
    }
    closeLauncher();
  };

  // 提交 inline 表单
  window.submitInlineNewProject = function() {
    var name = ((document.getElementById('inp-name') || {}).value || '').trim();
    var desc = ((document.getElementById('inp-desc') || {}).value || '').trim();
    var slug = ((document.getElementById('inp-slug') || {}).value || '').trim();
    if (!name) { if (typeof toast === 'function') toast('请填写项目名称', 'error'); return; }
    var btn = document.getElementById('inp-save');
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
    api('POST', '/projects', { name: name, description: desc, slug: slug })
      .then(function(data) {
        if (btn) { btn.disabled = false; btn.textContent = '✓'; }
        // 清空表单 + 收起
        var nm = document.getElementById('inp-name'); if (nm) nm.value = '';
        var ds = document.getElementById('inp-desc'); if (ds) ds.value = '';
        var sl = document.getElementById('inp-slug'); if (sl) sl.value = '';
        if (typeof toggleInlineNewProjectForm === 'function') toggleInlineNewProjectForm();
        // 刷新 projects 窗口（先关再开）
        document.querySelectorAll('.acms-window').forEach(function(el) {
          var t = el.querySelector('.aw-title');
          if (t && t.textContent === '项目管理') {
            var cb = el.querySelector('.aw-btn-close');
            if (cb) cb.click();
          }
        });
        if (window.ACMSWin) ACMSWin.open('projects');
        // 刷新任务栏下拉
        if (typeof loadProjectDropdown === 'function') loadProjectDropdown();
        if (typeof toast === 'function') toast('✅ 项目 "' + (data.name || name) + '" 创建成功', 'success');
        // 规定：创建后自动进入新项目\uff08解决“无法更新为默认”）
        if (data && data.id && typeof enterProject === 'function') {
          setTimeout(function() { enterProject({ id: data.id, name: data.name || name }); }, 500);
        }
      })
      .catch(function(err) {
        if (btn) { btn.disabled = false; btn.textContent = '✓'; }
        if (typeof toast === 'function') toast('❌ 创建失败: ' + (err.data ? (err.data.message || err.data.error) : (err.message || '')), 'error');
      });
  };

  // ── 启动 ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
