// ACMS 桌面配置同步服务 (v0.75)
// 提供 localStorage ↔ 服务端双向同步，让桌面配置（壁纸、图标位置、固定项）
// 不再只活在 localStorage，能跨设备 / 抗清缓存。
//
// 设计原则：
//   1. localStorage 永远是「当前实际生效」的状态 — 服务端只作为「备份 + 跨设备」。
//   2. 默认 autoSync=true：本地任意变更 → debounce 3s → 自动写服务端。
//   3. 默认不自动从服务端拉：登录后若有服务端配置 + 本地空 → 友好弹窗
//      「要不要从服务端恢复？」让用户选，而不是悄悄覆盖。
//   4. 完整读写分离：手动按钮分别触发。
//
// API (window.ACMSDesktopSync):
//   .config.autoSync = true|false     // 是否本地变 → 自动同步
//   .state.syncing, .state.lastSyncAt
//   .notifyChange(type)                // 其他模块调：本地变更时触发 debounce
//   .uploadNow()       → Promise       // 立即上传本地 → 服务端
//   .downloadNow()     → Promise       // 立即下载服务端 → 本地（含冲突弹窗）
//   .initialize()      → Promise       // 启动时调，检查服务端是否有配置可恢复
//   .unbind()          → Promise       // 删除服务端记录
//   .getServerInfo()   → Promise       // { exists, updatedAt }
//   .collectLocal()    → object        // 收集所有 localStorage 项为单一 config
//   .applyRemote(cfg)  → boolean       // 把远端 config 写回 localStorage
//
(function () {
  'use strict';

  // ── 桌面配置覆盖的 5 个 localStorage key（与 desktop-icons.js / wallpaper.js 同步） ──
  var LS_KEYS = {
    wallpaper:        'acms-wallpaper',
    wallpaperPresets: 'acms-wallpaper-presets',
    pinned:           'acms-desktop-pinned',
    autoArrange:      'acms-desktop-auto-arrange',
    iconOverrides:    'acms-icon-overrides',
  };

  var CONFIG_VER = 1;     // 当前 config 对象 schema 版本（预留扩展）

  // ── 模块状态 ──
  var state = {
    syncing: false,
    lastSyncAt: null,
    lastError: null,
    initialized: false,
  };

  var config = {
    autoSync: true,
    debounceMs: 3000,
  };

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
    refreshDesktopAfterApply();
    if (typeof window.toast === 'function') {
      window.toast(applied ? '已从服务端恢复桌面配置' : '远端配置为空', 'success');
    }
    return { success: true, choice: 'download', applied: applied };
  }

  // 启动时调一次：检测服务端是否有配置，若有 + 本地空 → 弹窗邀请恢复
  async function initialize() {
    if (state.initialized) return;
    state.initialized = true;

    var info;
    try { info = await getServerInfo(); }
    catch (e) { return; }   // 静默 — 启动期不应打扰用户

    if (!info.exists) return;             // 服务端没数据，跳过

    // 本地空 + 服务端有 → 邀请恢复
    if (localIsEmpty()) {
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
        refreshDesktopAfterApply();
        if (typeof window.toast === 'function') window.toast('已从服务端恢复桌面配置', 'success');
      } else if (config.autoSync) {
        // 用户拒绝恢复，但开启了 autoSync → 把当前（或默认）状态推到服务端
        // 避免下次登录又来弹
        uploadNow().catch(function () {});
      }
    }
    // 本地非空 + 服务端有 → 不弹窗（避免干扰），等用户主动点「↻ 从服务端恢复」
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

  // ── 冲突对话框（用 showConfirm 实现） — 让用户在三种动作中选一种 ──
  // 因为 showConfirm 只有二选一，我们用 prompt-text 模拟三选一
  async function askConflictChoice(timeStr, updatedAt) {
    var label = '本地和服务端都有桌面配置，无法自动决定以哪个为准。';
    var detail = '本地：当前浏览器的桌面配置\n服务端：' + (timeStr || '未知时间') + '的备份';
    if (typeof window.showPrompt === 'function') {
      // 用 showPrompt 让用户输入关键字选择
      var ans = await window.showPrompt({
        title: '☁ 同步方向选择',
        message: label + '\n' + detail + '\n\n请输入关键字选择（不区分大小写）：\n• server  — 用服务端覆盖本地（恢复远端）\n• local   — 用本地覆盖服务端（把本地推上去）\n• 输入其他任意内容或留空后按 Esc → 取消',
        placeholder: 'server / local',
        multiline: false,
        confirmText: '确认',
        cancelText: '取消',
        minLength: 0,
      });
      if (ans === null) return 'cancel';
      var k = (ans || '').trim().toLowerCase();
      if (k === 'server' || k === 's' || k === '下载' || k === '恢复') return 'download';
      if (k === 'local' || k === 'l' || k === '上传' || k === '本地') return 'upload';
      return 'cancel';
    }
    // 没有 showPrompt 退到 showConfirm 单选
    var ok = await window.showConfirm(label + '\n\n确认将用服务端覆盖本地。\n' + detail, {
      title: '☁ 同步方向', confirmText: '用服务端覆盖本地', cancelText: '取消', type: 'info',
    });
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
    initialize().catch(function () { /* swallow */ });
  }

  // 三种触发时机：
  //   a) 已登录：立刻 init
  //   b) DOMContentLoaded 后：检查登录态再 init
  //   c) 监听 storage 变化作为兜底（多标签场景不必要，但保险）
  function tryInit() {
    var hasToken = !!localStorage.getItem('acms-token');
    if (hasToken) bootstrapAfterLogin();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();
