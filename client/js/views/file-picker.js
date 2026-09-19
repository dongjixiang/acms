// ACMS · 通用文件选择器（v0.1）
// 路径：client/js/views/file-picker.js
//
// 用途：自由对话 / 需求对话的「📁 文件」入口 —— 弹层选文件 → 用对应 ACMS 应用打开
//
// 用法：
//   const picked = await window.ACMSFilePicker.pick();   // {path,name,ext,type} | null
//   await window.ACMSFilePicker.openFile(picked);
//   或一步到位（按钮入口）：
//   chatOpenFilePicker('__free__')
//
// 依赖：file-app-registry.js（ACMSFileApps）、acms-modal.js（ACMSModal）、api.js（api/API_KEY）
//
// 设计说明（踩坑预防）：
//   1. 选中状态存闭包变量 state.sel，不跨 modal 销毁边界读 DOM
//      （modal cleanup 会同步 removeChild，await 之后再查 DOM 必为 null — 见 acms-modal-overlay-pitfalls P52）
//   2. ACMSModal 没暴露 close，用 beforeCleanup 改写返回值实现「双击直开」
//      （acms-modal.js: value = ret 后再 resolve，所以 beforeCleanup 可以替换 value）
//   3. 列表动态重渲染 → 事件委托绑在列表容器上（P178 模式），不逐行 addEventListener

(function () {
  'use strict';

  var AK = (typeof API_KEY !== 'undefined' && API_KEY) ? API_KEY : 'dev-key-001';

  // ── 小工具 ──
  function extOf(name) {
    var s = String(name || '');
    var d = s.lastIndexOf('.');
    return (d < 0 || d === s.length - 1) ? '' : s.slice(d + 1).toLowerCase();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  function fmtTime(iso) {
    try {
      var d = new Date(iso), now = new Date();
      var p = function (x) { return (x < 10 ? '0' : '') + x; };
      if (isNaN(d.getTime())) return '';
      var hm = p(d.getHours()) + ':' + p(d.getMinutes());
      if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
      return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + hm;
    } catch (e) { return ''; }
  }

  function toastMsg(msg, type) {
    if (typeof toast === 'function') { try { toast(msg, type || 'info'); return; } catch (e) {} }
    console.log('[file-picker]', msg);
  }

  // 文件是否"可直接用 ACMS 应用打开"（用于给不匹配的文件加灰标记）
  function appsFor(item) {
    if (!window.ACMSFileApps) return [];
    try { return window.ACMSFileApps.getAppsForFile(item.name, '', { hasPath: true }) || []; }
    catch (e) { return []; }
  }

  // ── 弹层 CSS（用 ACMS 三主题变量，跟随主题切换）──
  var CSS = '' +
    '.acms-fp{display:flex;flex-direction:column;gap:10px;min-height:380px}' +
    '.acms-fp .fp-bar{display:flex;align-items:center;gap:8px}' +
    '.acms-fp .fp-up{width:30px;height:30px;flex:0 0 auto;border:1px solid var(--border);background:var(--bg3);' +
      'color:var(--text2);border-radius:7px;cursor:pointer;font-size:13px;line-height:1}' +
    '.acms-fp .fp-up:hover{border-color:var(--accent);color:var(--accent)}' +
    '.acms-fp .fp-up:disabled{opacity:.35;cursor:default}' +
    '.acms-fp .fp-root{height:30px;padding:0 10px;flex:0 0 auto;border:1px solid var(--border);background:var(--bg3);' +
      'color:var(--text2);border-radius:7px;cursor:pointer;font-size:12px}' +
    '.acms-fp .fp-root:hover{border-color:var(--accent);color:var(--accent)}' +
    '.acms-fp .fp-path{flex:1;min-width:0;font-size:12px;color:var(--text2);background:var(--bg3);' +
      'border:1px solid var(--border);border-radius:7px;padding:6px 10px;white-space:nowrap;overflow:hidden;' +
      'text-overflow:ellipsis;direction:rtl;text-align:left}' +
    '.acms-fp .fp-search{width:190px;flex:0 0 auto;height:30px;background:var(--bg3);border:1px solid var(--border);' +
      'border-radius:7px;color:var(--text);padding:0 10px;font-size:12px;outline:none;font-family:inherit}' +
    '.acms-fp .fp-search:focus{border-color:var(--accent)}' +
    '.acms-fp .fp-list{flex:1;min-height:300px;max-height:44vh;overflow-y:auto;border:1px solid var(--border);' +
      'border-radius:9px;background:var(--bg3);padding:5px}' +
    '.acms-fp .fp-row{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:7px;cursor:pointer;' +
      'font-size:13px;color:var(--text)}' +
    '.acms-fp .fp-row:hover{background:var(--bg4)}' +
    '.acms-fp .fp-row.sel{background:rgba(78,205,196,.16);box-shadow:inset 0 0 0 1px var(--accent)}' +
    '.acms-fp .fp-ic{width:18px;flex:0 0 auto;text-align:center;font-size:14px}' +
    '.acms-fp .fp-nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.acms-fp .fp-sz{flex:0 0 auto;width:74px;text-align:right;font-size:11px;color:var(--text3)}' +
    '.acms-fp .fp-tm{flex:0 0 auto;width:82px;text-align:right;font-size:11px;color:var(--text3)}' +
    '.acms-fp .fp-tag{flex:0 0 auto;font-size:10px;padding:1px 6px;border-radius:999px;' +
      'background:rgba(78,205,196,.15);color:var(--accent)}' +
    '.acms-fp .fp-none{flex:0 0 auto;font-size:10px;color:var(--text3)}' +
    '.acms-fp .fp-empty{padding:26px;text-align:center;color:var(--text3);font-size:12.5px}' +
    '.acms-fp .fp-foot{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text2);min-height:18px}' +
    '.acms-fp .fp-foot b{color:var(--accent);font-weight:600}' +
    '.acms-fp .fp-hint{color:var(--text3);font-size:11px;margin-left:auto}';

  // ── 主入口：pick() → Promise<item|null> ──
  function pick(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var state = { cur: opts.startPath || '', parent: null, entries: [], sel: null, q: '' };
      var settled = false;

      var html =
        '<style>' + CSS + '</style>' +
        '<div class="acms-fp" id="acms-fp">' +
          '<div class="fp-bar">' +
            '<button class="fp-up" id="fp-up" title="上一层">⬆</button>' +
            '<button class="fp-root" id="fp-root" title="回到工作区根目录">🏠 工作区</button>' +
            '<span class="fp-path" id="fp-path" title="">/</span>' +
            '<input class="fp-search" id="fp-search" placeholder="在当前目录筛选…">' +
          '</div>' +
          '<div class="fp-list" id="fp-list"></div>' +
          '<div class="fp-foot"><span id="fp-sel">未选择文件</span>' +
            '<span class="fp-hint">双击文件直接打开 · 双击文件夹进入</span></div>' +
        '</div>';

      var promise = window.ACMSModal.show({
        title: '📁 打开文件',
        size: 'xl',
        html: html,
        root: opts.root || undefined,
        actions: [
          { label: '取消', value: null, className: 'acms-modal-btn' },
          { label: '打开', value: 'OPEN', className: 'acms-modal-btn acms-modal-btn-primary' },
        ],
        // beforeCleanup 可改写返回值（acms-modal.js: value = ret → resolve(value)）
        beforeCleanup: function (value) {
          if (value === 'OPEN') return state.sel;   // 交给调用方；null 表示没选
          return null;
        },
      });

      // ACMSModal 在 Promise executor 内同步构造 DOM → 这里同步查得到
      var root = document.getElementById('acms-fp');
      if (!root) { resolve(null); return; }

      var listEl = document.getElementById('fp-list');
      var pathEl = document.getElementById('fp-path');
      var upEl = document.getElementById('fp-up');
      var selEl = document.getElementById('fp-sel');
      var searchEl = document.getElementById('fp-search');

      function closeWithSel() {
        var pb = document.querySelector('.acms-modal-overlay .acms-modal-btn-primary');
        if (pb) pb.click();
      }

      function render() {
        pathEl.textContent = state.cur || '/';
        pathEl.title = state.cur || '/';
        upEl.disabled = !state.parent;

        var q = state.q.toLowerCase();
        var rows = state.entries.filter(function (e) {
          return !q || String(e.name).toLowerCase().indexOf(q) >= 0;
        });

        if (!rows.length) {
          listEl.innerHTML = '<div class="fp-empty">' +
            (state.entries.length ? '没有匹配「' + esc(state.q) + '」的文件' : '这个目录是空的') + '</div>';
          return;
        }

        listEl.innerHTML = rows.map(function (e, i) {
          var isDir = e.type === 'dir';
          var app = isDir ? null : appsFor(e);
          var tag = '';
          if (!isDir) {
            tag = app.length
              ? '<span class="fp-tag">' + esc(String(app[0].label || '').replace(/^[^\u4e00-\u9fa5A-Za-z]+/, '') || app[0].name) + '</span>'
              : '<span class="fp-none">无应用</span>';
          }
          return '<div class="fp-row" data-i="' + i + '" data-name="' + esc(e.name) + '">' +
            '<span class="fp-ic">' + (isDir ? '📁' : (e.icon || '📄')) + '</span>' +
            '<span class="fp-nm">' + esc(e.name) + '</span>' +
            (isDir ? '' : '<span class="fp-sz">' + fmtSize(e.size) + '</span>') +
            '<span class="fp-tm">' + fmtTime(e.mtime) + '</span>' +
            (isDir ? '' : tag) +
          '</div>';
        }).join('');
      }

      function markSel(name) {
        listEl.querySelectorAll('.fp-row').forEach(function (r) {
          r.classList.toggle('sel', r.getAttribute('data-name') === name);
        });
      }

      function load(p) {
        var url = '/api/files' + (p ? '?path=' + encodeURIComponent(p) : '');
        return api('GET', url.replace(/^\/api/, '')).then(function (r) {
          state.cur = r.currentPath || '';
          state.parent = r.parentPath || null;
          state.entries = r.entries || [];
          state.sel = null;
          selEl.textContent = '未选择文件';
          render();
        }).catch(function (e) {
          listEl.innerHTML = '<div class="fp-empty">读取失败：' + esc((e && e.message) || '未知错误') + '</div>';
        });
      }

      // ── 事件（委托 + 闭包状态）──
      listEl.addEventListener('click', function (e) {
        var row = e.target.closest('.fp-row');
        if (!row) return;
        var name = row.getAttribute('data-name');
        var it = state.entries.filter(function (x) { return String(x.name) === name; })[0];
        if (!it) return;
        if (it.type === 'dir') { return; }        // 单击文件夹不进去，等双击
        state.sel = { path: (state.cur.replace(/\/$/, '') + '/' + it.name), name: it.name, type: 'file', ext: extOf(it.name) };
        selEl.innerHTML = '已选：<b>' + esc(it.name) + '</b>';
        markSel(name);
      });

      listEl.addEventListener('dblclick', function (e) {
        var row = e.target.closest('.fp-row');
        if (!row) return;
        var name = row.getAttribute('data-name');
        var it = state.entries.filter(function (x) { return String(x.name) === name; })[0];
        if (!it) return;
        if (it.type === 'dir') { load((state.cur.replace(/\/$/, '') + '/' + it.name)); return; }
        state.sel = { path: (state.cur.replace(/\/$/, '') + '/' + it.name), name: it.name, type: 'file', ext: extOf(it.name) };
        closeWithSel();                            // 双击文件 = 打开
      });

      upEl.addEventListener('click', function () { if (state.parent) load(state.parent); });
      document.getElementById('fp-root').addEventListener('click', function () { load(''); });

      var tmr = null;
      searchEl.addEventListener('input', function () {
        clearTimeout(tmr);
        var v = searchEl.value;
        tmr = setTimeout(function () { state.q = v; render(); }, 120);
      });

      // 结果（modal 关闭后 resolve；state.sel 活在闭包里，不依赖 DOM）
      promise.then(function (v) {
        if (settled) return;
        settled = true;
        resolve(v && v.path ? v : null);
      });

      load(state.cur);
    });
  }

  // ── 用匹配的 ACMS 应用打开 ──
  function openFile(item) {
    if (!item || !item.path) return Promise.resolve({ ok: false, reason: 'no-item' });
    var url = '/api/files?path=' + encodeURIComponent(item.path) + '&raw=1&api_key=' + encodeURIComponent(AK);
    var apps = appsFor(item);

    if (!apps.length) {
      // 与 file-app-registry 对齐：无匹配应用时不做静默失败
      toastMsg('没有可打开「' + item.name + '」的 ACMS 应用', 'info');
      return Promise.resolve({ ok: false, reason: 'no-app' });
    }

    var app = apps[0];
    return window.ACMSFileApps.openFileWith(app.name, {
      url: url, name: item.name, filePath: item.path, mime: '',
    }).then(function (r) {
      if (r && r.ok) {
        toastMsg('已用 ' + (app.label || app.name) + ' 打开', 'success');
      } else if (r && r.reason === 'needs-download') {
        toastMsg('该类型暂不支持直接打开，请先下载到本地', 'info');
      } else {
        toastMsg('打开失败：' + ((r && (r.reason || r.error)) || '未知原因'), 'error');
      }
      return r;
    }).catch(function (e) {
      toastMsg('打开失败：' + ((e && e.message) || '未知错误'), 'error');
      return { ok: false, reason: 'throw', error: e && e.message };
    });
  }

  // ── 一步到位：选 → 开 ──
  function pickAndOpen(opts) {
    return pick(opts).then(function (it) {
      if (!it) return null;
      return openFile(it).then(function (r) { return { item: it, result: r }; });
    });
  }

  window.ACMSFilePicker = {
    pick: pick,
    openFile: openFile,
    pickAndOpen: pickAndOpen,
  };

  // 对话辅助工具条按钮入口（index.html / idea-panel.js 都调这个）
  //   reqId 暂时只用于日志与未来把窗口绑定到会话，不影响本函数行为
  window.chatOpenFilePicker = function (reqId) {
    return pickAndOpen({}).then(function (r) {
      if (r && r.result && r.result.ok) {
        console.log('[file-picker] opened for session:', reqId, r.item.path);
      }
      return r;
    });
  };
})();
