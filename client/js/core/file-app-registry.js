// ACMS · 文件 → 应用 registry（v0.74.1）
//
// 把"什么类型的文件用哪个 ACMS 应用打开"的逻辑集中在一处，
// file-browser / email-inbox / chat 文件卡片等都能复用，避免 if-else 散落。
//
// 用法：
//   ACMSFileApps.getAppsForFile('photo.png', 'image/png')
//     → [{name:'image-editor', label:'🖼️ 图片编辑器', supported:true}, ...]
//
//   ACMSFileApps.openFileWith('image-editor', {url: '/api/files/...raw=1', name: 'photo.png'})
//     → 自动用对应应用打开（image-editor 直接传 src，code-editor 先 fetch content，office 类提示下载）
//
//   ACMSFileApps.rememberAssociation('png', 'image-editor')  // 用户偏好记忆
//
// 注册新应用（未来用）：
//   ACMSFileApps.register({
//     name: 'pdf-viewer',
//     label: '📕 PDF 阅读器',
//     mime: /^application\/pdf$/i,
//     exts: ['pdf'],
//     supports: 'url',          // 'url' | 'text' | 'needs-download'
//     open: function({url, name}) { ACMSWin.open('pdf-viewer', {url, title: name}); }
//   });

(function () {
  'use strict';

  // 内置应用清单（v0.74 默认）
  var DEFAULT_APPS = [
    {
      name: 'image-editor', label: '🖼️ 图片编辑器', supports: 'url',
      mime: /^image\//i,
      exts: ['png','jpg','jpeg','gif','webp','bmp','svg','ico','avif','tif','tiff'],
    },
    {
      name: 'code-editor', label: '💻 代码编辑器', supports: 'text',
      mime: /^text\/(?!html)/i,
      exts: ['txt','md','json','js','jsx','ts','tsx','py','java','c','cpp','h','hpp','css','scss','sass','less','xml','csv','tsv','log','sh','bash','zsh','yaml','yml','ini','conf','toml','sql','env','gitignore','dockerfile','vue','svelte','go','rs','rb','php','kt','swift','r','lua','pl','asm'],
    },
    {
      name: 'web-browser', label: '🌐 浏览器（HTML）', supports: 'text',
      mime: /^text\/html/i,
      exts: ['html','htm','mhtml'],
    },
    {
      name: 'web-browser', label: '📕 PDF 预览', supports: 'url',
      mime: /^application\/pdf/i,
      exts: ['pdf'],
    },
    {
      name: 'web-browser', label: '🎬 视频播放', supports: 'url',
      mime: /^video\//i,
      exts: ['mp4','webm','mov','avi','mkv','m4v','ogv'],
    },
    {
      name: 'web-browser', label: '🎵 音频播放', supports: 'url',
      mime: /^audio\//i,
      exts: ['mp3','wav','ogg','m4a','flac','aac','opus'],
    },
    // Office 系列：v0.74 邮件附件暂不支持直传（office editor 需要 workspace fileId），
    //   标记 supported=false，前端 UI 提示用户"先下载到本地"
    {
      name: 'office-word', label: '📝 Word 编辑器', supports: 'needs-download',
      mime: /(officedocument\.word|msword)/i,
      exts: ['docx','doc','odt','rtf'],
    },
    {
      name: 'office-xlsx', label: '📊 Excel 编辑器', supports: 'needs-download',
      mime: /(officedocument\.spreadsheet|excel)/i,
      exts: ['xlsx','xls','ods'],
    },
    {
      name: 'office-pptx', label: '📽️ PPT 编辑器', supports: 'needs-download',
      mime: /(officedocument\.presentation|powerpoint)/i,
      exts: ['pptx','ppt','odp'],
    },
  ];

  var apps = DEFAULT_APPS.slice();

  function attachmentExt(name) {
    var s = String(name || '');
    var dot = s.lastIndexOf('.');
    if (dot < 0 || dot === s.length - 1) return '';
    return s.slice(dot + 1).toLowerCase();
  }

  // 公开 API：推断可用应用
  function getAppsForFile(name, mime) {
    var m = String(mime || '').toLowerCase();
    var ext = attachmentExt(name);
    var matched = [];
    var seen = {};
    apps.forEach(function (app) {
      var hit = false;
      if (m && app.mime && app.mime.test(m)) hit = true;
      if (!hit && ext && app.exts && app.exts.indexOf(ext) >= 0) hit = true;
      if (!hit) return;
      if (seen[app.name]) return; // 同应用多条规则取第一条 label
      seen[app.name] = true;
      matched.push({
        name: app.name,
        label: app.label,
        supported: app.supports === 'url' || app.supports === 'text',
      });
    });
    return matched;
  }

  // 公开 API：用指定应用打开文件
  // opts: {url?, name, content?, mime?}
  //   - image-editor / web-browser (非 HTML)：传 url
  //   - code-editor / web-browser (HTML)：传 content（fetch URL 后用 srcdoc/text）
  //   - office-* (needs-download)：返回 {ok:false, reason:'needs-download'} 让调用方引导下载
  function openFileWith(appName, opts) {
    opts = opts || {};
    var app = apps.find(function (a) { return a.name === appName; });
    if (!app) {
      // 应用未注册 → 兜底用 web-browser（如果有 url）
      if (opts.url && window.ACMSWin && window.ACMSWin.open) {
        window.ACMSWin.open('web-browser', { url: opts.url, title: opts.name || '' });
        return Promise.resolve({ ok: true, fallback: true });
      }
      return Promise.resolve({ ok: false, reason: 'APP_NOT_REGISTERED' });
    }

    var url = opts.url || '';
    var name = opts.name || '未命名';
    var mime = String(opts.mime || '').toLowerCase();
    var title = name + '  ·  📂';

    if (app.supports === 'needs-download') {
      return Promise.resolve({ ok: false, reason: 'needs-download', label: app.label });
    }

    if (appName === 'image-editor') {
      window._fb_open_file = { name: name, src: url };
      if (window.ACMSWin) window.ACMSWin.open('image-editor', { w: 1000, h: 700, title: '🖼️ ' + title });
      return Promise.resolve({ ok: true });
    }

    if (appName === 'code-editor') {
      if (opts.content != null) {
        window._fb_open_file = { name: name, content: opts.content };
        if (window.ACMSWin) window.ACMSWin.open('code-editor', { w: 900, h: 600, title: '💻 ' + title });
        return Promise.resolve({ ok: true });
      }
      // 否则 fetch URL 拿文本
      return fetch(url).then(function (r) { return r.text(); }).then(function (content) {
        window._fb_open_file = { name: name, content: content };
        if (window.ACMSWin) window.ACMSWin.open('code-editor', { w: 900, h: 600, title: '💻 ' + title });
        return { ok: true };
      }).catch(function (err) {
        return { ok: false, reason: 'fetch-failed', error: err && err.message };
      });
    }

    if (appName === 'web-browser') {
      var ext = attachmentExt(name);
      // HTML → fetch 后用 srcdoc 渲染（保证正确显示而非源码）
      if (/^text\/html/.test(mime) || ext === 'html' || ext === 'htm' || ext === 'mhtml') {
        return fetch(url).then(function (r) { return r.text(); }).then(function (html) {
          if (window.ACMSWin) window.ACMSWin.open('web-browser', { w: 1100, h: 750, title: '🌐 ' + title, srcdoc: html, url: url });
          return { ok: true };
        }).catch(function () {
          // fallback 直接传 URL
          if (window.ACMSWin) window.ACMSWin.open('web-browser', { w: 1100, h: 750, title: '🌐 ' + title, url: url });
          return { ok: true };
        });
      }
      // PDF / 视频 / 音频 → 直接传 URL 给 iframe
      if (window.ACMSWin) window.ACMSWin.open('web-browser', { w: 1100, h: 750, title: '🌐 ' + title, url: url });
      return Promise.resolve({ ok: true });
    }

    // 其他应用（用户自定义注册）：调 app.open(opts)
    if (typeof app.open === 'function') {
      try {
        var ret = app.open(opts);
        return Promise.resolve(ret || { ok: true });
      } catch (e) {
        return Promise.resolve({ ok: false, reason: 'open-threw', error: e && e.message });
      }
    }
    return Promise.resolve({ ok: false, reason: 'unsupported' });
  }

  // 公开 API：注册新应用
  function register(appDef) {
    if (!appDef || !appDef.name) return;
    // 同名应用 → 替换
    apps = apps.filter(function (a) { return a.name !== appDef.name; });
    apps.push(appDef);
  }

  // 公开 API：用户偏好记忆（按扩展名记默认应用）
  var PREFIX = 'acms.file-app.';
  function rememberAssociation(ext, appName) {
    try { localStorage.setItem(PREFIX + String(ext || '').toLowerCase(), String(appName || '')); } catch (e) {}
  }
  function getRememberedAssociation(ext) {
    try {
      var v = localStorage.getItem(PREFIX + String(ext || '').toLowerCase());
      return v || null;
    } catch (e) { return null; }
  }
  function clearRememberedAssociation(ext) {
    try { localStorage.removeItem(PREFIX + String(ext || '').toLowerCase()); } catch (e) {}
  }

  window.ACMSFileApps = {
    getAppsForFile: getAppsForFile,
    openFileWith: openFileWith,
    register: register,
    rememberAssociation: rememberAssociation,
    getRememberedAssociation: getRememberedAssociation,
    clearRememberedAssociation: clearRememberedAssociation,
  };
})();