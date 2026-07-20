// L3 — 前端 App 加载器
// 扫描 apps/ 目录，自动加载 manifest + frontend.js
// 替代 index.html 中手动注册每个 assist script

(function() {
  'use strict';

  var loadedApps = {};

  /**
   * 加载所有 app 的 manifest
   */
  function loadAppManifests() {
    // 从后端 API 获取 app 列表
    return api('GET', '/apps')
      .then(function(data) {
        var apps = data.apps || [];
        apps.forEach(function(app) {
          loadedApps[app.method] = app;
        });
        return apps;
      })
      .catch(function() {
        return [];
      });
  }

  /**
   * 注册 app 到 ACMSAssists（如果前端 renderer 存在）
   */
  function registerAppRenderer(method, renderFn) {
    if (window.ACMSAssists) {
      window.ACMSAssists.register(method, renderFn);
    }
  }

  /**
   * 获取已注册的 app 列表（含 manifest 信息）
   */
  function getApps(type) {
    var list = Object.values(loadedApps);
    if (type) list = list.filter(function(a) { return a.type === type; });
    return list;
  }

  /**
   * 获取单个 app 信息
   */
  function getApp(method) {
    return loadedApps[method] || null;
  }

  // ── 暴露全局 ──
  window.ACMSApps = {
    loadManifests: loadAppManifests,
    register: registerAppRenderer,
    getApps: getApps,
    getApp: getApp,
  };

})();
