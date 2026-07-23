// ACMS 壁纸子系统 — 零外部依赖
// API: window.ACMSWallpaper = { set, get, reset, getPresets, getStyle, setStyle }
// 存储: localStorage 'acms-wallpaper' (JSON: {url, style})
// 控制: #acms-desktop CSS background-image
(function() {
  'use strict';

  var LS_KEY = 'acms-wallpaper';
  var PRESETS_KEY = 'acms-wallpaper-presets';
  var DESKTOP_SEL = '#acms-desktop';

  // ── 内置预设壁纸（极小尺寸 DataURL 渐变/纹理） ──
  var BUILTIN_PRESETS = [
    {
      id: 'preset-mountain',
      label: '山峦',
      // A tiny JPEG (~2KB) gradient — placeholder; real ones are generated on first use
      data: 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#2d3436"/><stop offset="100%" stop-color="#636e72"/>' +
        '</linearGradient></defs>' +
        '<rect width="800" height="600" fill="url(#g)"/>' +
        '<polygon points="0,600 100,300 200,400 350,250 500,380 600,200 800,350 800,600" fill="#dfe6e9" opacity="0.15"/>' +
        '<polygon points="0,600 150,400 300,500 450,350 600,450 750,300 800,380 800,600" fill="#b2bec3" opacity="0.1"/>' +
        '</svg>'
      ),
    },
    {
      id: 'preset-ocean',
      label: '海洋',
      data: 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#0984e3"/><stop offset="100%" stop-color="#74b9ff"/>' +
        '</linearGradient></defs>' +
        '<rect width="800" height="600" fill="url(#g)"/>' +
        '<circle cx="600" cy="80" r="35" fill="#ffeaa7" opacity="0.3"/>' +
        '<path d="M0,420 Q100,380 200,420 T400,420 T600,420 T800,420" fill="none" stroke="#dfe6e9" stroke-width="2" opacity="0.2"/>' +
        '<path d="M0,450 Q100,420 200,450 T400,450 T600,450 T800,450" fill="none" stroke="#dfe6e9" stroke-width="2" opacity="0.15"/>' +
        '</svg>'
      ),
    },
    {
      id: 'preset-forest',
      label: '森林',
      data: 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#2d5016"/><stop offset="100%" stop-color="#6ab04c"/>' +
        '</linearGradient></defs>' +
        '<rect width="800" height="600" fill="url(#g)"/>' +
        '<circle cx="120" cy="400" r="50" fill="#badc58" opacity="0.1"/>' +
        '<circle cx="300" cy="380" r="60" fill="#badc58" opacity="0.08"/>' +
        '<circle cx="550" cy="420" r="55" fill="#badc58" opacity="0.1"/>' +
        '<circle cx="700" cy="390" r="45" fill="#badc58" opacity="0.08"/>' +
        '</svg>'
      ),
    },
    {
      id: 'preset-sakura',
      label: '樱花',
      data: 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#fab1a0"/><stop offset="100%" stop-color="#ffeaa7"/>' +
        '</linearGradient></defs>' +
        '<rect width="800" height="600" fill="url(#g)"/>' +
        '<circle cx="200" cy="150" r="40" fill="#fd79a8" opacity="0.08"/>' +
        '<circle cx="350" cy="120" r="30" fill="#e84393" opacity="0.06"/>' +
        '<circle cx="550" cy="180" r="45" fill="#fd79a8" opacity="0.08"/>' +
        '<circle cx="700" cy="140" r="35" fill="#e84393" opacity="0.06"/>' +
        '</svg>'
      ),
    },
    {
      id: 'preset-starry',
      label: '星空',
      data: 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">' +
        '<defs><radialGradient id="g" cx="50%" cy="50%" r="70%">' +
        '<stop offset="0%" stop-color="#0c0c3a"/><stop offset="100%" stop-color="#000000"/>' +
        '</radialGradient></defs>' +
        '<rect width="800" height="600" fill="url(#g)"/>' +
        '<circle cx="300" cy="100" r="1.5" fill="#fff" opacity="0.8"/>' +
        '<circle cx="500" cy="80" r="1" fill="#fff" opacity="0.6"/>' +
        '<circle cx="150" cy="200" r="1.5" fill="#fff" opacity="0.7"/>' +
        '<circle cx="650" cy="150" r="1" fill="#fff" opacity="0.5"/>' +
        '<circle cx="400" cy="250" r="2" fill="#fff" opacity="0.9"/>' +
        '<circle cx="100" cy="350" r="1" fill="#fff" opacity="0.4"/>' +
        '<circle cx="700" cy="300" r="1.5" fill="#fff" opacity="0.6"/>' +
        '<circle cx="550" cy="400" r="1" fill="#fff" opacity="0.5"/>' +
        '<circle cx="250" cy="450" r="1.5" fill="#fff" opacity="0.7"/>' +
        '<circle cx="450" cy="500" r="1" fill="#fff" opacity="0.3"/>' +
        '</svg>'
      ),
    },
  ];

  // ── 内部状态 ──
  var currentWallpaper = null;  // { url, style }
  var presets = [];
  var loadedPresets = false;

  // ── 从 localStorage 恢复 ──
  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        currentWallpaper = JSON.parse(raw);
      }
      var presetsRaw = localStorage.getItem(PRESETS_KEY);
      if (presetsRaw) {
        presets = JSON.parse(presetsRaw);
      }
    } catch (e) {
      currentWallpaper = null;
    }
  }

  // ── 应用壁纸到桌面 ──
  function applyWallpaper(data) {
    var d = document.querySelector(DESKTOP_SEL);
    if (!d) return;

    if (data && data.url) {
      d.style.setProperty('--wallpaper-url', 'url(' + data.url + ')');
      d.style.setProperty('--wallpaper-style', data.style || 'cover');
      d.classList.add('has-wallpaper');
    } else {
      d.classList.remove('has-wallpaper');
      d.style.removeProperty('--wallpaper-url');
      d.style.removeProperty('--wallpaper-style');
    }
  }

  // ── 预加载图片（防闪白） ──
  function preloadImage(url) {
    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.onload = function() { resolve(url); };
      img.onerror = function() { reject(new Error('图片加载失败')); };
      img.crossOrigin = 'anonymous';
      img.src = url;
    });
  }

  // ── 获取初始化后的预设列表 ──
  function ensurePresets() {
    if (loadedPresets) return;
    loadedPresets = true;
    // 先加载用户保存的预设，如果没有则用内置
    var saved = localStorage.getItem(PRESETS_KEY);
    if (saved) {
      try { presets = JSON.parse(saved); } catch(e) { presets = []; }
    }
    // 合并内置预设（内置 ID 以 preset- 开头）
    var builtinIds = BUILTIN_PRESETS.map(function(p) { return p.id; });
    var existingIds = presets.map(function(p) { return p.id; });
    BUILTIN_PRESETS.forEach(function(bp) {
      if (existingIds.indexOf(bp.id) === -1) {
        presets.push(bp);
      }
    });
    // 保存合并后的列表
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  }

  // ════════════════════════════════════
  // 公开 API
  // ════════════════════════════════════

  window.ACMSWallpaper = {

    /** 设置壁纸
     *  @param {string} url       图片 URL 或 DataURL
     *  @param {string} [style]   'cover' | 'contain' | 'fill'，默认 'cover'
     *  @returns {Promise}
     */
    set: function(url, style) {
      style = style || 'cover';
      // 如果跟当前一样则跳过
      if (currentWallpaper && currentWallpaper.url === url && currentWallpaper.style === style) {
        return Promise.resolve();
      }
      var self = this;
      return preloadImage(url).then(function() {
        currentWallpaper = { url: url, style: style };
        localStorage.setItem(LS_KEY, JSON.stringify(currentWallpaper));
        applyWallpaper(currentWallpaper);
        self._notifyChange();
      }).catch(function(err) {
        console.warn('[ACMSWallpaper] 图片加载失败:', err.message);
        throw err;
      });
    },

    /** 获取当前壁纸信息 */
    get: function() {
      return currentWallpaper ? { url: currentWallpaper.url, style: currentWallpaper.style } : null;
    },

    /** 获取缩放模式 */
    getStyle: function() {
      return (currentWallpaper && currentWallpaper.style) || 'cover';
    },

    /** 设置缩放模式（不换图） */
    setStyle: function(style) {
      if (!currentWallpaper) return;
      currentWallpaper.style = style || 'cover';
      localStorage.setItem(LS_KEY, JSON.stringify(currentWallpaper));
      applyWallpaper(currentWallpaper);
    },

    /** 清除壁纸，恢复默认 */
    reset: function() {
      currentWallpaper = null;
      localStorage.removeItem(LS_KEY);
      applyWallpaper(null);
      this._notifyChange();
    },

    /** 获取预设壁纸列表 */
    getPresets: function() {
      ensurePresets();
      return presets.map(function(p) {
        return { id: p.id, label: p.label, data: p.data };
      });
    },

    /** 添加用户自定义预设 */
    addPreset: function(id, label, data) {
      ensurePresets();
      // 去重
      presets = presets.filter(function(p) { return p.id !== id; });
      presets.push({ id: id, label: label, data: data });
      localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
    },

    /** 删除预设 */
    removePreset: function(id) {
      // 不允许删除内置预设
      if (id && id.indexOf('preset-') === 0) return;
      ensurePresets();
      presets = presets.filter(function(p) { return p.id !== id; });
      localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
    },

    /** 初始化（DOM 就绪后调用） */
    init: function() {
      loadFromStorage();
      if (currentWallpaper && currentWallpaper.url) {
        var d = document.querySelector(DESKTOP_SEL);
        if (d) {
          applyWallpaper(currentWallpaper);
        } else {
          // #acms-desktop 尚未创建（ACMSWin.enable() 还没执行），等待它出现
          var observer = new MutationObserver(function() {
            var desk = document.querySelector(DESKTOP_SEL);
            if (desk) {
              applyWallpaper(currentWallpaper);
              observer.disconnect();
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
        }
      }
    },

    /** 注册变化回调 */
    onChange: function(fn) {
      if (typeof fn === 'function') {
        self._changeListeners.push(fn);
      }
    },

    // ── 内部 ──
    _changeListeners: [],
    _notifyChange: function() {
      var data = this.get();
      this._changeListeners.forEach(function(fn) {
        try { fn(data); } catch(e) { console.warn('[ACMSWallpaper] onChange error:', e); }
      });
    },
  };

  // DOM 就绪后自动初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { window.ACMSWallpaper.init(); });
  } else {
    window.ACMSWallpaper.init();
  }

})();
