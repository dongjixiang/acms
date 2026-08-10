// ACMS Office V2 集成桥接（v0.91 — 配合 Univer + Tiptap + Reveal POC）
//
// 设计原则：
//   (C) 桌面启动后 idle 时 prefetch office-v2 main.js → 下次打开秒开
//   (D) ACMSWin 关闭时调 editor.destroy() / univerAPI.dispose() → 防内存泄漏
//
// 用法：ACMS 现有 office-* 视图保留（向后兼容），新视图注册为 office-v2-*
//   ACMSWin.open('office-v2-word', { fileId, fileName })
//
// 配套静态产物在 /client/lib/office-v2/（esbuild code-split 输出）：
//   main.js       1.7 KB  入口路由（dynamic import 三个 engine）
//   main.css      700 KB  共用样式
//   word.js       436 KB  Tiptap + 14 扩展
//   excel.js      5.9 MB  Univer Sheets
//   slides.js     117 KB  Reveal.js
//   word.css / excel.css / slides.css
//
// 不依赖任何 node_modules — 浏览器原生 dynamic import 即可。
// 加载策略：先 prefetch main.js（最轻），再 idle 时 prefetch 三个 engine 入口。

(function () {
  'use strict';

  // ── 配置 ──
  var BASE = '/client/lib/office-v2/';
  var PREFETCH_DELAY_MS = 3000;        // 桌面启动后 3s 触发 prefetch
  var ENGINE_PREFETCH_DELAY_MS = 8000;  // 三个 engine 再延后 5s（避免抢主流程带宽）

  var state = {
    prefetched: { main: false, word: false, excel: false, slides: false },
    instances: {},  // { fileId: editorInstance }
    moduleCache: {},  // 缓存 import 的 module 引用
  };

  // ── Prefetch（用 <link rel="modulepreload"> + 浏览器内部预加载） ──
  function prefetch(filename) {
    if (state.prefetched[filename]) return;
    var link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = BASE + filename + '.js';
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
    state.prefetched[filename] = true;
    console.info('[office-v2] prefetch scheduled:', filename);
  }

  // v0.91.2: 同时 prefetch CSS 文件，避免首次打开时白屏
  function prefetchCss(cssRel) {
    if (state.prefetched[cssRel]) return;
    var link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'style';
    link.href = BASE + cssRel;
    document.head.appendChild(link);
    state.prefetched[cssRel] = true;
  }

  function schedulePrefetch() {
    // 主入口
    setTimeout(function () { prefetch('main'); }, PREFETCH_DELAY_MS);
    // CSS（与 main.js 一起，避免首次打开时无样式）
    setTimeout(function () { prefetchCss('main.css'); }, PREFETCH_DELAY_MS);
    // 三个 engine
    setTimeout(function () {
      prefetch('word');
      prefetch('excel');
      prefetch('slides');
      prefetchCss('word.css');
      prefetchCss('excel.css');
      prefetchCss('slides.css');
    }, ENGINE_PREFETCH_DELAY_MS);
  }

  // 如果浏览器有 requestIdleCallback，更优雅；没有就降级 setTimeout
  if (typeof window.requestIdleCallback === 'function') {
    var icId = window.requestIdleCallback(schedulePrefetch, { timeout: 5000 });
    console.info('[office-v2] idle prefetch scheduled (ric id=' + icId + ')');
  } else {
    schedulePrefetch();
  }

  // ── CSS 注入（esbuild 拆分 CSS 到独立文件，但不生成自动注入代码；这里手动 <link>） ──
  var injectedCss = {};
  function ensureCssLoaded(cssFiles) {
    cssFiles.forEach(function (rel) {
      if (injectedCss[rel]) return;
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = BASE + rel;
      link.dataset.officeV2 = '1';
      document.head.appendChild(link);
      injectedCss[rel] = true;
      console.info('[office-v2] css injected:', rel);
    });
  }

  // ── Dynamic import 引擎（同时预加载对应 CSS） ──
  async function loadEngine(kind) {
    if (state.moduleCache[kind]) return state.moduleCache[kind];
    if (!state.prefetched[kind]) prefetch(kind);
    // 显式加载该 engine 的 CSS
    if (kind === 'word')   ensureCssLoaded(['main.css', 'word.css']);
    if (kind === 'excel')  ensureCssLoaded(['main.css', 'excel.css']);
    if (kind === 'slides') ensureCssLoaded(['main.css', 'slides.css']);
    var mod = await import(BASE + kind + '.js');
    state.moduleCache[kind] = mod;
    console.info('[office-v2] loaded engine module:', kind);
    return mod;
  }

  // ── 视图加载器工厂（ACMSWin.open 入口） ──
  function makeLoader(kind) {
    return async function loader(w, opts) {
      // 参考 acms-office-editor-stack P104：opts 在 arguments[1]，不是 w.opts
      opts = opts || {};
      var args = arguments[1] || opts;  // 兼容 ACMSWin 的 (w, opts) 调用
      var fileId = args.fileId;
      var fileName = args.fileName || 'untitled';
      var isRemoteFile = !!fileId;

      // ── Excel 专用：顶部工具栏 HTML ──
      if (kind === 'excel' && w && w.$c) {
        var fnSafe = String(fileName || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        w.$c.innerHTML =
          '<div style="display:flex;flex-direction:column;height:100%;overflow:hidden;">' +
          '  <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--office-divider);background:var(--office-xlsx-soft,#d8e8df);flex-shrink:0;">' +
          '    <span style="font-size:13px;font-weight:600;color:var(--office-xlsx-header,#2f7048);margin-right:8px;">📊</span>' +
          '    <span id="xlsx-v2-filename" style="font-size:12px;color:var(--text,#333);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + fnSafe + '">' + fnSafe + '</span>' +
          '    <button id="xlsx-v2-open-btn" style="padding:3px 10px;border:1px solid var(--office-xlsx-primary,#4a9466);border-radius:4px;background:#fff;cursor:pointer;font-size:12px;color:var(--office-xlsx-primary,#4a9466);">📂 打开</button>' +
          '    <button id="xlsx-v2-save-btn" style="padding:3px 10px;border:1px solid var(--office-xlsx-primary,#4a9466);border-radius:4px;background:var(--office-xlsx-primary,#4a9466);cursor:pointer;font-size:12px;color:#fff;">💾 保存</button>' +
          '    <button id="xlsx-v2-download-btn" style="padding:3px 10px;border:1px solid var(--border,#ccc);border-radius:4px;background:#fff;cursor:pointer;font-size:12px;color:var(--text2,#666);">⬇ 下载</button>' +
          '  </div>' +
          '  <div id="' + targetId + '" class="editor-host" style="flex:1;overflow:hidden;"></div>' +
          '</div>';
      } else if (kind === 'slides') {
        // Reveal 需要 <div class="reveal"><div class="slides">
        w.$c.innerHTML = '<div class="reveal" style="height:100%"><div class="slides"></div></div>';
      } else {
        w.$c.innerHTML = '<div id="' + targetId + '" class="editor-host" style="height:100%"></div>';
      }

      // ── 动态 import 引擎 ──
      var mod, mountFn, editor;
      try {
        mod = await loadEngine(kind);
        var fnName = 'mount' + (kind === 'word' ? 'Word' : kind === 'excel' ? 'Excel' : 'Slides');
        mountFn = mod[fnName];
        if (typeof mountFn !== 'function') throw new Error(fnName + ' not exported from ' + kind + '.js');
        editor = mountFn(targetId);
      } catch (err) {
        console.error('[office-v2] load failed:', err);
        if (w && w.$c) {
          w.$c.innerHTML = '<div style="padding:24px;color:#a00">❌ 加载失败：' +
            (err.message || err) + '<br><pre style="font-size:11px;white-space:pre-wrap">' +
            ((err.stack || '').slice(0, 500)) + '</pre></div>';
        }
        return;
      }

      // ── Excel 工具栏事件 ──
      if (kind === 'excel' && w && w.$c) {
        // 保存：用 Univer workbook API 读取数据 → POST /api/office/save
        var saveBtn = w.$c.querySelector('#xlsx-v2-save-btn');
        if (saveBtn) {
          saveBtn.onclick = function () {
            if (!editor) return toast('编辑器未就绪', 'error');
            try {
              if (!editor.getWorkbook) return toast('无法读取编辑器数据', 'error');
              var wb = editor.getWorkbook();
              var sheetsData = [];
              wb.eachSheet(function (sheet, sheetId) {
                var rows = [];
                sheet.eachRow(function (row, ri) {
                  var rowData = [];
                  row.eachCell(function (cell, ci) {
                    rowData.push(cell.value !== null && cell.value !== undefined ? cell.value : '');
                  });
                  rows.push(rowData);
                });
                if (rows.length > 0) sheetsData.push({ name: sheet.name, data: rows });
              });
              var payload = { type: 'xlsx', name: fileName, data: { sheets: sheetsData } };
              fetch('/api/office/save?api_key=dev-key-001', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              }).then(function (r) { return r.json(); }).then(function (r) {
                if (r.ok) {
                  toast('已保存 ✅ ' + r.fileName + ' (' + r.size + ' bytes)', 'success');
                  if (!isRemoteFile) {
                    fileId = r.fileId;
                    fileName = r.fileName;
                    var fnEl = w.$c.querySelector('#xlsx-v2-filename');
                    if (fnEl) fnEl.textContent = r.fileName;
                    var oldKey = Object.keys(state.instances).find(function (k) {
                      return state.instances[k].editor === editor;
                    });
                    if (oldKey) {
                      state.instances[r.fileId] = state.instances[oldKey];
                      delete state.instances[oldKey];
                    }
                  }
                } else {
                  toast('保存失败: ' + (r.error || '未知'), 'error');
                }
              }).catch(function (e) { toast('保存失败: ' + e.message, 'error'); });
            } catch (e) {
              toast('保存失败: ' + e.message, 'error');
            }
          };
        }
        // 下载：用 Univer 内置 xlsx 导出
        var downloadBtn = w.$c.querySelector('#xlsx-v2-download-btn');
        if (downloadBtn) {
          downloadBtn.onclick = function () {
            if (!editor) return toast('编辑器未就绪', 'error');
            try {
              if (!editor.getWorkbook) return toast('无法读取编辑器数据', 'error');
              // Univer 提供 exportAsXlsx() 方法返回 Blob
              if (typeof editor.exportAsXlsx === 'function') {
                editor.exportAsXlsx().then(function (blob) {
                  if (!blob || blob.size === 0) return toast('导出失败', 'error');
                  var url = URL.createObjectURL(blob);
                  var a = document.createElement('a');
                  a.href = url; a.download = (fileName || 'export').replace(/\.xlsx$/i, '') + '.xlsx';
                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  toast('已下载 ' + a.download, 'success');
                }).catch(function (e) { toast('导出失败: ' + e.message, 'error'); });
              } else if (typeof editor.downloadXlsx === 'function') {
                var blob = editor.downloadXlsx();
                if (blob && blob.size > 0) {
                  var url = URL.createObjectURL(blob);
                  var a = document.createElement('a');
                  a.href = url; a.download = (fileName || 'export').replace(/\.xlsx$/i, '') + '.xlsx';
                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  toast('已下载', 'success');
                } else {
                  toast('导出失败，请用"保存"存到服务器后下载', 'warning');
                }
              } else {
                toast('当前 Univer 版本不支持直接下载，请先保存再下载', 'warning');
              }
            } catch (e) {
              toast('下载失败: ' + e.message, 'error');
            }
          };
        }
        // 打开本地文件
        var openBtn = w.$c.querySelector('#xlsx-v2-open-btn');
        if (openBtn) {
          openBtn.onclick = function () {
            var inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = '.xlsx,.xls,.csv';
            inp.onchange = function (e) {
              var file = e.target.files && e.target.files[0];
              if (!file) return;
              var reader = new FileReader();
              reader.onload = function (ev) {
                var buf = new Uint8Array(ev.target.result);
                if (editor && typeof editor.loadWorkbook === 'function') {
                  editor.loadWorkbook(buf).then(function () {
                    toast('已打开 ' + file.name, 'success');
                    var fnEl = w.$c.querySelector('#xlsx-v2-filename');
                    if (fnEl) fnEl.textContent = file.name;
                    fileName = file.name;
                  }).catch(function (err) {
                    toast('打开失败: ' + (err.message || '未知'), 'error');
                  });
                } else {
                  toast('编辑器未就绪，请刷新后重试', 'error');
                }
              };
              reader.readAsArrayBuffer(file);
            };
            inp.click();
          };
        }
      }

      // ── 加载已有远程文件 ──
      if (isRemoteFile && kind === 'excel' && editor) {
        fetch('/api/office/load/' + encodeURIComponent(fileId) + '?api_key=dev-key-001')
          .then(function (r) { return r.json(); })
          .then(function (resp) {
            if (!resp.ok) throw new Error(resp.error || '加载失败');
            if (resp.text && resp.text.startsWith('SCHEMA:')) {
              var schemaData = JSON.parse(resp.text.slice(7));
              if (schemaData && schemaData.sheets && schemaData.sheets.length > 0 && editor && editor.applyChanges) {
                // 将 schema 数据写入 Univer
                var wb = editor.getWorkbook && editor.getWorkbook();
                if (wb) {
                  // 清空现有 sheet，创建新 sheet
                  while (wb.getSheetCount() > 0) {
                    var firstSheet = wb.getSheetByIndex(0);
                    wb.removeSheetByIndex(0);
                  }
                  schemaData.sheets.forEach(function (s, idx) {
                    var ws = wb.createSheet(s.name || 'Sheet' + (idx + 1));
                    var headers = s.headers || [];
                    var rows = s.rows || [];
                    // 写 headers
                    if (headers.length > 0) {
                      var hRow = ws.getRow(1);
                      headers.forEach(function (h, ci) {
                        hRow.getCell(ci + 1).value = h;
                      });
                    }
                    // 写数据行
                    rows.forEach(function (rowData, ri) {
                      var row = ws.getRow(ri + (headers.length > 0 ? 2 : 1));
                      rowData.forEach(function (v, ci) {
                        row.getCell(ci + 1).value = v;
                      });
                    });
                  });
                  toast('已加载 ' + resp.filename, 'success');
                }
              }
            }
          })
          .catch(function (err) {
            console.warn('[xlsx-v2] load failed:', err);
          });
      }

      // 保存 instance 供 dispose + 后续 save 用
      var key = fileId || ('__new__' + Date.now());
      state.instances[key] = { kind: kind, editor: editor, fileId: fileId, fileName: fileName };

      // 注册 onClose → destroy/dispose
      if (w && typeof w.onClose !== 'function') {
        w.onClose = function () {
          console.info('[office-v2] window close, disposing:', key, '(kind=' + kind + ')');
          try {
            if (kind === 'word' && editor && typeof editor.destroy === 'function') {
              editor.destroy();
            } else if (kind === 'excel' && editor && typeof editor.dispose === 'function') {
              editor.dispose();
            } else if (kind === 'slides' && editor && typeof editor.destroy === 'function') {
              editor.destroy();
            }
          } catch (e) {
            console.warn('[office-v2] dispose error:', e.message);
          }
          delete state.instances[key];
        };
      }

      return editor;
    };
  }

  // ── 注册 view loaders ──
  // 仅当 ACMSWin 可用时注册（避免 standalone 测试时崩）
  //
  // 注册策略：
  //   (1) 注册 v2 新名 'office-v2-word' / '-excel' / '-slides'  → 推荐用
  //   (2) 同时覆盖 ACMS 桌面 launcher 调用的旧名 'office-word' / 'office-xlsx' / 'office-pptx'
  //       ACMSWin.registerViewLoader 是简单 viewLoaders[name] = fn 赋值（window-manager.js:47）
  //       → 后注册的覆盖先注册的 → 旧 office-*.js (加载顺序在前) 被本 bridge (后加载) 覆盖
  //   (3) 临时回滚：localStorage.setItem('office-v2-disabled', '1') 跳到回旧版
  function registerAll() {
    if (typeof window.ACMSWin === 'undefined' || !ACMSWin.registerViewLoader) {
      console.info('[office-v2] ACMSWin not available, skipping registerViewLoader');
      return;
    }
    var rollback = (function () {
      try { return localStorage.getItem('office-v2-disabled') === '1'; } catch (e) { return false; }
    })();
    if (rollback) {
      console.warn('[office-v2] DISABLED by localStorage office-v2-disabled=1, keeping legacy editors');
      return;
    }
    // 新名
    ACMSWin.registerViewLoader('office-v2-word', makeLoader('word'));
    ACMSWin.registerViewLoader('office-v2-excel', makeLoader('excel'));
    ACMSWin.registerViewLoader('office-v2-slides', makeLoader('slides'));
    // 旧名（覆盖 office-word.js / office-excel.js / office-ppt.js 的注册）
    ACMSWin.registerViewLoader('office-word', makeLoader('word'));
    ACMSWin.registerViewLoader('office-xlsx', makeLoader('excel'));
    ACMSWin.registerViewLoader('office-pptx', makeLoader('slides'));
    console.info('[office-v2] view loaders registered (覆盖旧名 office-word/office-xlsx/office-pptx)');
  }

  // ── 工具 API：给 LLM 或外部代码手动触发加载 ──
  window.OfficeV2 = {
    open: function (kind, fileId, fileName) {
      if (!window.ACMSWin) return console.warn('[office-v2] no ACMSWin');
      return ACMSWin.open('office-v2-' + kind, { w: 900, h: 600, title: fileName || kind, fileId: fileId, fileName: fileName });
    },
    listInstances: function () { return Object.keys(state.instances); },
    getState: function () { return state; },
    // 主动 prefetch（桌面启动前的 hook）
    warmUp: function () { schedulePrefetch(); },
  };

  // ── 启动 ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerAll);
  } else {
    registerAll();
  }
})();
