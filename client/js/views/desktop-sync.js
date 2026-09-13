// ACMS 桌面配置同步服务 (v0.75 → B 方案)
// 提供 localStorage ↔ 服务端双向同步，让桌面配置（壁纸、图标位置、固定项）
// 不再只活在 localStorage，能跨设备 / 抗清缓存。
//
// 设计原则（B 方案 — 2026-09-11）：
//   1. localStorage 永远是「当前实际生效」的状态 — 服务端只作为「备份 + 跨设备」。
//   2. 默认 autoSync=false（修「本地永远在本地」bug）：
//        原行为 = 任何 localStorage 变更 → debounce 3s → 自动 push
//                → 多设备互相覆盖，永远是「最后一次本设备修改」在上，不是「最后一次主动同步」在上
//        新行为 = 默认手工同步；power user 可在设置面板打开 autoSync
//   3. 智能提示「服务端有新版本」：
//        启动 / 重新可见时检查服务端 updatedAt vs 本地 lastSeenServerUpdatedAt
//        → 服务端更新就 toast 提示 + status bar 显示橙色云朵
//        → 不弹模态框，避免打断登录体验
//   4. 完整读写分离：手动按钮分别触发（右键桌面 → 桌面同步 → 上传/下载/解绑）。
//
// API (window.ACMSDesktopSync):
//   .config.autoSync = true|false     // 是否本地变 → 自动同步
//   .state.syncing, .state.lastSyncAt, .state.serverHasUpdate, .state.serverUpdatedAt
//   .setAutoSync(bool)   → bool       // 切换并持久化偏好
//   .getAutoSync()       → bool
//   .getSyncStatus()     → object     // 状态快照（settings / status bar 用）
//   .checkForUpdates()   → Promise    // 主动查一次服务端（status bar 轮询 / 切回 tab 时）
//   .notifyChange(type)                // 其他模块调：本地变更时触发 debounce
//   .uploadNow()       → Promise       // 立即上传本地 → 服务端
//   .downloadNow()     → Promise       // 立即下载服务端 → 本地（含冲突弹窗）
//   .initialize()      → Promise       // 启动时调，检查服务端是否有配置可恢复
//   .unbind()          → Promise       // 删除服务端记录
//   .getServerInfo()   → Promise       // { exists, updatedAt, config }
//   .collectLocal()    → object        // 收集所有 localStorage 项为单一 config
//   .applyRemote(cfg)  → boolean       // 把远端 config 写回 localStorage
//
// 同步元数据 localStorage key（不属于桌面配置本身，只是「我上次看到的服务端时间」标记）：
//   acms-desktop-last-seen-server-updated-at   ISO 字符串
//   acms-desktop-auto-sync-pref                "true" / "false"
//
(function () {
  'use strict';

  // ── 桌面配置覆盖的 5 个 localStorage key（与 desktop-icons.js / wallpaper.js 同步） ──
  // lastSeenServerUpdatedAt 不是桌面配置本身，是同步元数据（防止反复弹提示用），
  // 不进 collectLocal，但进 applyRemote/localIsEmpty 的 Object.keys 扫描。
  var LS_KEYS = {
    wallpaper:        'acms-wallpaper',
    wallpaperPresets: 'acms-wallpaper-presets',
    pinned:           'acms-desktop-pinned',
    autoArrange:      'acms-desktop-auto-arrange',
    iconOverrides:    'acms-icon-overrides',
    lastSeenServerUpdatedAt: 'acms-desktop-last-seen-server-updated-at',
  };

  var CONFIG_VER = 1;     // 当前 config 对象 schema 版本（预留扩展）

  // ── 模块状态 ──
  var state = {
    syncing: false,
    lastSyncAt: null,
    lastError: null,
    initialized: false,
    serverHasUpdate: false,   // 服务端有未查看的新版本（比 lastSeenServerUpdatedAt 新）
    serverUpdatedAt: null,    // 服务端最新更新时间
  };

  // 默认 autoSync=false — 修「本地永远在本地」bug：
  //   原行为：任何 localStorage 变更 → debounce 3s → 自动 push 到服务端
  //   后果：多设备场景下 A/B 互相覆盖，永远是「本设备最新版」在上，不是「最后一次主动同步」在上
  //   新行为：默认手工同步；用户可去设置面板打开 autoSync（power user 场景）
  //   autoSync 偏好持久化到 localStorage，避免每次刷新重置
  var AUTO_SYNC_PREF_KEY = 'acms-desktop-auto-sync-pref';
  var config = {
    autoSync: false,
    debounceMs: 3000,
  };
  try {
    var stored = localStorage.getItem(AUTO_SYNC_PREF_KEY);
    if (stored !== null) config.autoSync = stored === 'true';
  } catch (e) { /* swallow */ }

  var debounceTimer = null;

  // ─────────────────────────────────────────────
  // localStorage ↔ config 对象互转
  // ─────────────────────────────────────────────
  function readLs(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw == null) return null;
      // autoArrange 是布尔字符串 "true"/"false"，保留原始 string
      if (key === LS_KEYS.autoArrange) return raw;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function writeLs(key, value) {
    try {
      if (value === null || value === undefined) {
        localStorage.removeItem(key);
        return;
      }
      if (key === LS_KEYS.autoArrange) {
        localStorage.setItem(key, String(value));
      } else {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (e) {
      if (window.console) console.warn('[ACMSDesktopSync] localStorage write fail', key, e);
    }
  }

  // 把当前 5 项 localStorage 打包为单一 config 对象
  function collectLocal() {
    return {
      version: CONFIG_VER,
      wallpaper:        readLs(LS_KEYS.wallpaper),
      wallpaperPresets: readLs(LS_KEYS.wallpaperPresets),
      pinned:           readLs(LS_KEYS.pinned),
      autoArrange:      readLs(LS_KEYS.autoArrange),   // "true" | "false" | null
      iconOverrides:    readLs(LS_KEYS.iconOverrides),
      collectedAt:      new Date().toISOString(),
    };
  }

  // 把远端 config 写回 localStorage（不触发刷新，需调用方刷 UI）
  // 返回是否完整应用（任何一项缺失都允许）
  function applyRemote(remote) {
    if (!remote || typeof remote !== 'object') return false;
    var applied = [];
    Object.keys(LS_KEYS).forEach(function (k) {
      if (remote[k] !== undefined) {
        writeLs(LS_KEYS[k], remote[k]);
        applied.push(k);
      }
    });
    return applied.length > 0;
  }

  function localIsEmpty() {
    // 用「5 项全空」判断本地是否完全没数据 — 用于决定首次冲突对话框
    var any = false;
    Object.keys(LS_KEYS).forEach(function (k) {
      var v = readLs(LS_KEYS[k]);
      if (v !== null && v !== undefined && v !== '' && v !== 'true') any = true;
    });
    return !any;
  }

  // 记录「本地最近一次看到的服务端 updatedAt」—— 用于检测服务端是否有未查看的更新
  // 持久化到 localStorage：用户登录 / 拉取 / 上传成功时刷新
  function getLastSeenServerUpdatedAt() {
    try {
      var v = localStorage.getItem(LS_KEYS.lastSeenServerUpdatedAt);
      if (!v) return null;
      var t = Date.parse(v);
      return isNaN(t) ? null : t;
    } catch (e) { return null; }
  }
  function setLastSeenServerUpdatedAt(iso) {
    try {
      if (iso) localStorage.setItem(LS_KEYS.lastSeenServerUpdatedAt, String(iso));
    } catch (e) { /* swallow */ }
  }
  function clearLastSeenServerUpdatedAt() {
    try { localStorage.removeItem(LS_KEYS.lastSeenServerUpdatedAt); } catch (e) { /* swallow */ }
  }

  // ─────────────────────────────────────────────
  // 服务端交互
  // ─────────────────────────────────────────────
  async function getServerInfo() {
    try {
      var res = await window.api('GET', '/desktop-config');
      return {
        exists: !!res.config,
        updatedAt: res.updatedAt || null,
        config: res.config || null,
      };
    } catch (e) {
      // 401 (未登录) / 403 (system 账号) → 视作无服务端
      return { exists: false, updatedAt: null, config: null, error: e.message };
    }
  }

  async function pushServer(configObj) {
    var res = await window.api('POST', '/desktop-config', { config: configObj });
    return res;
  }

  async function deleteServer() {
    return await window.api('DELETE', '/desktop-config');
  }

  // 拦截 localStorage.setItem：只要写入的 key 是我们关心的桌面配置，
  // 自动触发 ACMSDesktopSync.notifyChange（防抖合并写在 notifyChange 内部）。
  // 这样未来加新的桌面配置 localStorage 项，只要更新 LS_KEYS 自动接入同步，
  // 不需要改 wallpaper.js / desktop-icons.js 源码。
  function patchLocalStorage() {
    var origSet = Storage.prototype.setItem;
    if (origSet.__acmsPatched) return;
    Storage.prototype.setItem = function (k, v) {
      var result = origSet.apply(this, arguments);
      // 只在 window.localStorage 上拦截，避免命中 sessionStorage
      if (this === window.localStorage) {
        try {
          var watched = Object.keys(LS_KEYS).some(function (name) { return LS_KEYS[name] === k; });
          if (watched && window.ACMSDesktopSync) {
            window.ACMSDesktopSync.notifyChange(k);
          }
        } catch (e) { /* swallow */ }
      }
      return result;
    };
    Storage.prototype.setItem.__acmsPatched = true;
  }

  // ─────────────────────────────────────────────
  // 公开 API
  // ─────────────────────────────────────────────

  // 其他模块（wallpaper.js, desktop-icons.js 等）在自己写完 localStorage 后调这个
  // type 仅用于日志和未来扩展，实际我们总是 collect 全部
  function notifyChange(type) {
    if (!state.initialized) return;   // 未初始化前不触发同步（避免登录前脏写）
    if (!config.autoSync) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      uploadNow().catch(function (e) {
        if (window.console) console.warn('[ACMSDesktopSync] auto upload failed', e);
      });
    }, config.debounceMs);
  }

  // 立即上传本地 → 服务端
  async function uploadNow() {
    if (state.syncing) {
      return { success: false, message: '正在同步中' };
    }
    state.syncing = true;
    var snapshot = collectLocal();
    try {
      var res = await pushServer(snapshot);
      state.syncing = false;
      state.lastSyncAt = new Date().toISOString();
      state.lastError = null;
      // v0.??: push 成功后刷 lastSeen + 状态 — 此刻服务端 = 本地，自然不再有「新版本」状态
      if (res.savedAt) {
        setLastSeenServerUpdatedAt(res.savedAt);
        state.serverHasUpdate = false;
        state.serverUpdatedAt = res.savedAt;
      }
      updateTrayIndicator();
      if (typeof window.toast === 'function') {
        window.toast('桌面配置已同步到服务端 (' + formatTime(state.lastSyncAt) + ')', 'success');
      }
      return { success: true, savedAt: res.savedAt };
    } catch (e) {
      state.syncing = false;
      state.lastError = e.message || String(e);
      if (typeof window.toast === 'function') {
        window.toast('同步到服务端失败: ' + state.lastError, 'error');
      }
      return { success: false, message: state.lastError };
    }
  }

  // 立即下载服务端 → 本地（带冲突对话框）
  async function downloadNow(opts) {
    opts = opts || {};
    var skipPrompt = !!opts.skipPrompt;

    var info;
    try {
      info = await getServerInfo();
    } catch (e) {
      if (typeof window.toast === 'function') window.toast('从服务端拉取失败: ' + (e.message || e), 'error');
      return { success: false, message: e.message };
    }
    if (!info.exists) {
      if (typeof window.toast === 'function') window.toast('服务端没有该用户的桌面配置', 'info');
      return { success: false, message: 'NO_SERVER_CONFIG' };
    }

    // 冲突对话框：本地非空 + 服务端非空 + 不是 skipPrompt 模式
    var needConfirm = !skipPrompt && !localIsEmpty();

    if (needConfirm) {
      var ft = formatRelativeTime(info.updatedAt);
      var choice = await askConflictChoice(ft, info.updatedAt);
      if (choice === 'cancel') return { success: false, message: 'CANCELLED' };

      if (choice === 'upload') {
        // 用户想用本地覆盖远端：先 push
        await uploadNow();
        return { success: true, choice: 'upload' };
      }
      // 'download' 落下面走默认流程
    }

    // 默认 / 用户选 download：应用远端到本地
    var applied = applyRemote(info.config);
    state.lastSyncAt = new Date().toISOString();
    // v0.??: pull 成功后刷 lastSeen — 此刻本地 = 服务端，「新版本」已消化
    if (info.updatedAt) {
      setLastSeenServerUpdatedAt(info.updatedAt);
      state.serverHasUpdate = false;
      state.serverUpdatedAt = info.updatedAt;
    }
    updateTrayIndicator();
    refreshDesktopAfterApply();
    if (typeof window.toast === 'function') {
      window.toast(applied ? '已从服务端恢复桌面配置' : '远端配置为空', 'success');
    }
    return { success: true, choice: 'download', applied: applied };
  }

  // 启动时调一次：检测服务端状态，决定是否提示
  // 改动（B 方案）：
  //   原逻辑：只在「本地空」时弹「要不要从服务端恢复？」→ 多设备场景下永远不弹
  //   新逻辑：本地非空时也检查「服务端是否比本地记录的 lastSeen 更新」
  //           → 若更新，toast 提示「服务端桌面有更新（X 分钟前）」+ state.serverHasUpdate=true
  //           → 状态图标（云朵）变橙色提示用户去右键菜单主动拉取
  //           → 静默不弹模态框，避免打断登录体验
  async function initialize() {
    if (state.initialized) return;
    state.initialized = true;

    var info;
    try { info = await getServerInfo(); }
    catch (e) { return; }   // 静默 — 启动期不应打扰用户

    if (!info.exists) {
      // 服务端没数据 → 顺手清 lastSeen（避免 unbind 后误弹）
      clearLastSeenServerUpdatedAt();
      state.serverHasUpdate = false;
      state.serverUpdatedAt = null;
      return;
    }

    state.serverUpdatedAt = info.updatedAt || null;
    var localEmpty = localIsEmpty();
    var lastSeenTs = getLastSeenServerUpdatedAt();
    var serverTs = info.updatedAt ? Date.parse(info.updatedAt) : 0;
    var serverNewerThanLastSeen = lastSeenTs && serverTs && serverTs > lastSeenTs;

    // 情况 1：本地空 → 邀请恢复（保留原逻辑）
    if (localEmpty) {
      var ft = formatRelativeTime(info.updatedAt);
      var ok = false;
      if (typeof window.showConfirm === 'function') {
        ok = await window.showConfirm(
          '服务端有一份你之前的桌面配置（' + ft + '更新）。\n\n是否恢复到当前浏览器？\n\n选择「确认」将覆盖当前桌面（当前桌面为空）。',
          { title: '☁ 恢复桌面配置', confirmText: '从服务端恢复', cancelText: '不用，继续本地', type: 'info' }
        );
      }
      if (ok) {
        applyRemote(info.config);
        setLastSeenServerUpdatedAt(info.updatedAt);
        state.serverHasUpdate = false;
        refreshDesktopAfterApply();
        if (typeof window.toast === 'function') window.toast('已从服务端恢复桌面配置', 'success');
      } else {
        // 拒绝恢复 + 本地空 → 顺手记录 lastSeen 避免下次登录反复弹
        // （不主动 upload — autoSync=false 默认，避免给服务端塞垃圾数据）
        setLastSeenServerUpdatedAt(info.updatedAt);
        state.serverHasUpdate = false;
      }
      return;
    }

    // 情况 2：本地非空 + 服务端比 lastSeen 新 → 主动提示（B 方案核心）
    if (serverNewerThanLastSeen) {
      state.serverHasUpdate = true;
      var ft2 = formatRelativeTime(info.updatedAt);
      if (typeof window.toast === 'function') {
        window.toast(
          '☁ 服务端桌面有新版本（' + ft2 + '），右键桌面 → 桌面同步 → 从服务端恢复可查看',
          'info',
          8000
        );
      }
      // 不更新 lastSeen，让「有新版本」状态持续到用户主动查看/拉取
      return;
    }

    // 情况 3：本地非空 + 服务端不新（或首次登录 lastSeen 为空）→ 静默
    state.serverHasUpdate = false;
    if (info.updatedAt && lastSeenTs) {
      // 顺手记录（保持 lastSeen 跟上 server，但仅在已有 lastSeen 时 — 避免首次登录就给 lastSeen「打标记」）
      setLastSeenServerUpdatedAt(info.updatedAt);
    } else if (info.updatedAt && !lastSeenTs) {
      // 首次登录（lastSeen 未初始化）：不主动设 lastSeen，但也不弹
      // 理由：如果服务端 current = local current，用户从未主动 sync 过，
      //       没必要立刻把 lastSeen 拉到当前 server 时间，
      //       等下次有真更新时再 lastSeen 才有意义。
    }
  }

  async function unbind() {
    if (typeof window.showConfirm === 'function') {
      var ok = await window.showConfirm(
        '确定要删除服务端的桌面配置吗？\n\n此后你的桌面配置只活在当前浏览器，重启浏览器或换设备都会丢失。\n当前浏览器内的桌面配置不会被影响。',
        { title: '☁ 解绑云同步', confirmText: '删除服务端副本', cancelText: '取消', type: 'danger' }
      );
      if (!ok) return { success: false };
    }
    try {
      await deleteServer();
      // v0.??: unbind 后清 lastSeen + 状态 — 服务端没了，下次登录走「本地空」分支
      clearLastSeenServerUpdatedAt();
      state.serverHasUpdate = false;
      state.serverUpdatedAt = null;
      updateTrayIndicator();
      if (typeof window.toast === 'function') window.toast('已删除服务端桌面配置', 'success');
      return { success: true };
    } catch (e) {
      if (typeof window.toast === 'function') window.toast('删除失败: ' + (e.message || e), 'error');
      return { success: false, message: e.message };
    }
  }

  // 应用远端到 localStorage 后，重建桌面图标 + 壁纸
  function refreshDesktopAfterApply() {
    try {
      if (window.ACMSWallpaper && typeof ACMSWallpaper.refreshFromLocalStorage === 'function') {
        ACMSWallpaper.refreshFromLocalStorage();
      } else if (window.ACMSWallpaper && typeof ACMSWallpaper.set === 'function') {
        // 后备：重设一遍当前壁纸（会从 localStorage 读）
        var cur = ACMSWallpaper.get();
        if (cur && cur.url) ACMSWallpaper.set(cur.url, cur.style || 'cover').catch(function () {});
      }
    } catch (e) { /* swallow */ }
    try {
      if (window.ACMSWin && typeof ACMSWin.refreshDesktopIcons === 'function') {
        ACMSWin.refreshDesktopIcons();
      }
    } catch (e) { /* swallow */ }
  }

  // ── 冲突对话框（B 方案 — 修"UX 反人类"bug） ──
  // 旧版用 showPrompt 让用户输入"server/local/cancel"关键字 → 90% 用户直接点确认输入空 → 解析为 cancel → "没下载到"
  // 新版用 ACMSModal 三按钮（取消 / 推送本地 / 恢复服务端）—— 用户用点不用输入，零歧义
  async function askConflictChoice(timeStr, updatedAt) {
    var detail = '本地：当前浏览器的桌面配置\n服务端：' + (timeStr || '未知时间') + '的备份';
    // 优先用 ACMSModal（三按钮，标准 UI）
    if (typeof window.ACMSModal === 'object' && typeof window.ACMSModal.show === 'function') {
      var choice = await window.ACMSModal.show({
        title: '☁ 桌面同步方向',
        message: '本地和服务端都有桌面配置，请选择以哪个为准：\n\n' + detail,
        actions: [
          { label: '取消',                  value: null,      className: 'acms-modal-btn' },
          { label: '↑ 推送本地到服务端',     value: 'upload',  className: 'acms-modal-btn' },
          { label: '↓ 恢复服务端到本地',     value: 'download',className: 'acms-modal-btn acms-modal-btn-primary' },
        ],
      });
      // null = 用户点取消 / 按 Esc / 点遮罩
      if (choice === null || choice === undefined) return 'cancel';
      return choice === 'upload' ? 'upload' : 'download';
    }
    // 退路：showConfirm 二选一（没 ACMSModal 的环境）
    var ok = await window.showConfirm(
      '本地和服务端都有桌面配置。\n\n' + detail + '\n\n确认将用服务端覆盖本地？',
      { title: '☁ 同步方向', confirmText: '用服务端覆盖本地', cancelText: '取消', type: 'info' }
    );
    return ok ? 'download' : 'cancel';
  }

  // ── 时间格式化 ──
  function formatTime(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    } catch (e) { return ''; }
  }
  function formatRelativeTime(iso) {
    if (!iso) return '未知时间';
    try {
      var d = new Date(iso);
      var diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diffSec < 60) return '刚刚';
      if (diffSec < 3600) return Math.floor(diffSec / 60) + ' 分钟前';
      if (diffSec < 86400) return Math.floor(diffSec / 3600) + ' 小时前';
      if (diffSec < 86400 * 7) return Math.floor(diffSec / 86400) + ' 天前';
      return d.toLocaleDateString('zh-CN');
    } catch (e) { return '未知时间'; }
  }

  // ── 暴露 API ──
  function setAutoSync(enabled) {
    config.autoSync = !!enabled;
    try { localStorage.setItem(AUTO_SYNC_PREF_KEY, String(config.autoSync)); } catch (e) { /* swallow */ }
    if (typeof window.toast === 'function') {
      window.toast(config.autoSync ? '已开启自动同步（本地变更 → 服务端）' : '已关闭自动同步（改用手动同步）', 'info');
    }
    return config.autoSync;
  }
  function getAutoSync() { return !!config.autoSync; }
  // 给状态栏 / 设置面板用的「当前同步状态快照」
  function getSyncStatus() {
    return {
      autoSync: config.autoSync,
      syncing: state.syncing,
      lastSyncAt: state.lastSyncAt,
      lastError: state.lastError,
      serverExists: !!state.serverUpdatedAt,
      serverUpdatedAt: state.serverUpdatedAt,
      serverHasUpdate: !!state.serverHasUpdate,
    };
  }
  // 主动查一次服务端（供 status bar 轮询 / visibility change 用）
  async function checkForUpdates() {
    if (state.initialized && state.syncing) return getSyncStatus();
    var info;
    try { info = await getServerInfo(); } catch (e) { return getSyncStatus(); }
    if (!info.exists) {
      clearLastSeenServerUpdatedAt();
      state.serverHasUpdate = false;
      state.serverUpdatedAt = null;
      return getSyncStatus();
    }
    state.serverUpdatedAt = info.updatedAt || null;
    var lastSeenTs = getLastSeenServerUpdatedAt();
    var serverTs = info.updatedAt ? Date.parse(info.updatedAt) : 0;
    var serverNewerThanLastSeen = lastSeenTs && serverTs && serverTs > lastSeenTs;
    state.serverHasUpdate = !!serverNewerThanLastSeen;
    return getSyncStatus();
  }
  window.ACMSDesktopSync = {
    config: config,
    state: state,
    notifyChange: notifyChange,
    uploadNow: uploadNow,
    downloadNow: downloadNow,
    initialize: initialize,
    unbind: unbind,
    getServerInfo: getServerInfo,
    collectLocal: collectLocal,
    applyRemote: applyRemote,
    refreshAfterApply: refreshDesktopAfterApply,
    patchLocalStorage: patchLocalStorage,
    setAutoSync: setAutoSync,
    getAutoSync: getAutoSync,
    getSyncStatus: getSyncStatus,
    checkForUpdates: checkForUpdates,
    LS_KEYS: LS_KEYS,
  };

  // ── 启动钩子 ──
  // 1) 立刻 patch localStorage.setItem — 必须在任何桌面操作前装好
  patchLocalStorage();

  // 2) 订阅 wallpaper.onChange（wallpaper.js 已有 _notifyChange 机制）
  function subscribeWallpaper() {
    if (window.ACMSWallpaper && typeof ACMSWallpaper.onChange === 'function') {
      ACMSWallpaper.onChange(function () {
        // wallpaper.set 已写 localStorage，patch 会触发 notifyChange；
        // 这里再调一次保险（双触发由 debounce 合并，不重复上传）
        notifyChange('wallpaper');
      });
    }
  }

  // 3) 用户登录后初始化（检查服务端是否可恢复）
  function bootstrapAfterLogin() {
    subscribeWallpaper();
    initialize().then(updateTrayIndicator).catch(function () { /* swallow */ });
  }

  // 4) 同步状态 → 顶栏 taskbar tray 云朵指示器（B 方案 UI）
  //    serverHasUpdate=true → 显示红点 + tooltip 提示
  //    syncing → 改 spinner
  //    error → 改红云朵
  function updateTrayIndicator() {
    var icon = document.getElementById('tb-sync-icon');
    var dot = document.getElementById('tb-sync-dot');
    var btn = document.getElementById('tb-sync-btn');
    if (!icon || !dot || !btn) return;
    var s = state;
    var cfg = config;
    // icon 字符
    if (s.syncing) {
      icon.textContent = '⏳';
      dot.style.display = 'none';
    } else if (s.lastError) {
      icon.textContent = '☁';
      dot.style.display = 'block';
      dot.style.background = 'var(--accent2)';   // 红
    } else if (s.serverHasUpdate) {
      icon.textContent = '☁';
      dot.style.display = 'block';
      dot.style.background = '#ffa500';          // 橙 — 强提示
    } else if (s.lastSyncAt) {
      icon.textContent = '✅';
      dot.style.display = 'none';
    } else {
      icon.textContent = '☁';
      dot.style.display = 'none';
    }
    // tooltip
    var tipParts = ['桌面同步'];
    if (s.syncing) tipParts.push('正在同步…');
    else if (s.lastError) tipParts.push('上次失败: ' + String(s.lastError).slice(0, 30));
    else if (s.serverHasUpdate) tipParts.push('⚠ 服务端有新版本（右键桌面 → 桌面同步 → 从服务端恢复）');
    else if (s.lastSyncAt) tipParts.push('已同步 ' + formatRelativeTime(s.lastSyncAt));
    else tipParts.push('未同步（手工模式）');
    if (cfg.autoSync) tipParts.push('· 自动同步开');
    else tipParts.push('· 手工模式');
    btn.title = tipParts.join(' · ');
  }

  // 5) 切回 tab 时主动查一次服务端（B 方案核心场景：用户在 A 设备改了桌面，B 切回 tab 立即看到通知）
  function onVisibilityChange() {
    if (document.visibilityState === 'visible' && state.initialized) {
      checkForUpdates().then(updateTrayIndicator).catch(function () { /* swallow */ });
    }
  }

  // 三种触发时机：
  //   a) 已登录：立刻 init
  //   b) DOMContentLoaded 后：检查登录态再 init
  //   c) 监听 storage 变化作为兜底（多标签场景不必要，但保险）
  function tryInit() {
    var hasToken = !!localStorage.getItem('acms-token');
    if (hasToken) bootstrapAfterLogin();
    // 始终订阅 visibility change — 即使未登录也不会报错（checkForUpdates 内部 try/catch）
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();
