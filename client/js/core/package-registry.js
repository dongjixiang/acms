// ACMS Package Registry (v0.58)
// 集中管理所有包/视图的注册，取代散落在 index.html 和各文件中的 registerViewLoader 调用。
//
// 用法：
//   每个视图文件末尾调用 ACMS.registerPackage(name, config)
//   会自动回填 window-manager 的 labels，并触发 onPackageRegistered 事件供其他模块（命令面板等）监听
//
// API:
//   ACMS.registerPackage(name, config)
//     config = { title, icon, loader, defaultSize, category, description, tags }
//     - title / icon 会同步到 window-manager 的 labels
//     - loader 会调用 ACMSWin.registerViewLoader
//     - category 用于分组（"管理" "开发" "系统" "工具"）
//   ACMS.getPackage(name) → config
//   ACMS.getAllPackages() → [{name, title, icon, category, ...}, ...]
//   ACMS.onPackageRegistered(fn) → 注册回调，新包注册时触发
//
// 迁移指南：
//   index.html 内的内联注册 → 移到各视图文件的 IIFE 末尾
//   window-manager.js 的 labels 对象 → 全量迁移到此注册，下版本可删除 labels 硬编码

(function() {
  'use strict';

  var packages = {};          // name → config
  var packageList = [];       // 有序列表
  var events = [];

  // ── 注册包 ──
  function registerPackage(name, config) {
    if (!name || !config) return;
    if (packages[name]) {
      console.warn('[PKG] 重复注册: ' + name);
      return;
    }

    // 安全提取 loader
    var loader = typeof config.loader === 'function' ? config.loader : null;

    // 构造完整 config
    var entry = {
      name: name,
      title: config.title || name,
      icon: config.icon || '📦',
      category: config.category || '未分类',
      description: config.description || '',
      tags: config.tags || [],
      defaultSize: config.defaultSize || { w: 800, h: 520 },
      loader: loader,
    };
    packages[name] = entry;
    packageList.push(entry);

    // v0.62: 注册事件关心
    if (config.onEvent && window.ACMSWin && ACMSWin.onViewEvent) {
      ACMSWin.onViewEvent(name, '__all__', config.onEvent);
    }

    // 同步到 window-manager labels
    if (window.ACMSWin) {
      // ACMSWin 内部的 labels 对象可通过扩展添加
      // 这里直接调用 registerViewLoader
      if (loader) {
        ACMSWin.registerViewLoader(name, function(w, opts) {
          return loader(w, opts);
        });
      }
    } else {
      // 如果 ACMSWin 还没加载，入队列
      if (loader) {
        if (!window._viewLoaderQueue) window._viewLoaderQueue = [];
        window._viewLoaderQueue.push({ view: name, loader: function(w, opts) {
          return loader(w, opts);
        }});
      }
    }

    // 通知事件监听者
    events.forEach(function(fn) {
      try { fn(name, entry); } catch(e) { console.warn('[PKG] 事件错误:', e); }
    });

    // console.log('[PKG] 已注册: ' + name);
  }

  // ── 获取包信息 ──
  function getPackage(name) {
    return packages[name] || null;
  }

  function getAllPackages() {
    return packageList;
  }

  // ── 按分类获取 ──
  function getPackagesByCategory(category) {
    return packageList.filter(function(p) { return p.category === category; });
  }

  function getCategories() {
    var cats = {};
    packageList.forEach(function(p) { cats[p.category] = true; });
    return Object.keys(cats).sort();
  }

  // ── 搜索包（模糊匹配 name/title/description/tags）──
  function searchPackages(query) {
    if (!query) return packageList;
    var q = query.toLowerCase();
    return packageList.filter(function(p) {
      return p.name.toLowerCase().indexOf(q) !== -1 ||
             p.title.toLowerCase().indexOf(q) !== -1 ||
             (p.description && p.description.toLowerCase().indexOf(q) !== -1) ||
             (p.tags && p.tags.some(function(t) { return t.toLowerCase().indexOf(q) !== -1; }));
    });
  }

  // ── 事件 ──
  function onPackageRegistered(fn) {
    if (typeof fn === 'function') events.push(fn);
  }

  // ── 暴露 API ──
  window.ACMS = window.ACMS || {};
  ACMS.registerPackage = registerPackage;
  ACMS.getPackage = getPackage;
  ACMS.getAllPackages = getAllPackages;
  ACMS.getPackagesByCategory = getPackagesByCategory;
  ACMS.getCategories = getCategories;
  ACMS.searchPackages = searchPackages;
  ACMS.onPackageRegistered = onPackageRegistered;
})();
