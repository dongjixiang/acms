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
      var targetId = (fileId || 'new-' + Date.now()).replace(/-/g, '');

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
        editor = mountFn(targetId, opts);
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
        // 保存：用 Univer API 读取所有 sheet 数据 → POST /api/office/save
        var saveBtn = w.$c.querySelector('#xlsx-v2-save-btn');
        if (saveBtn) {
          saveBtn.onclick = function () {
            if (!editor) return toast('编辑器未就绪', 'error');
            try {
              // v0.93 修复：getWorkbook() 必须传 unitId（P124）；type 2 = SHEET
              var sheetUnit = editor._univerInstanceService && editor._univerInstanceService.getCurrentUnitOfType
                ? editor._univerInstanceService.getCurrentUnitOfType(2)
                : null;
              var wb = sheetUnit ? editor.getWorkbook(sheetUnit.getUnitId()) : null;
              if (!wb) return toast('无法读取编辑器数据', 'error');
              var sheetsData = [];
              var sheets = wb.getSheets && wb.getSheets();
              if (!sheets) return toast('无法读取工作表', 'error');
              sheets.forEach(function (sheet) {
                var sheetName = sheet.getSheetName ? sheet.getSheetName() : 'Sheet';
                var maxRows = sheet.getMaxRows ? sheet.getMaxRows() : 0;
                var maxCols = sheet.getMaxColumns ? sheet.getMaxColumns() : 0;
                if (maxRows === 0) return;
                var rows = [];
                for (var r = 1; r <= maxRows; r++) {
                  var rowData = [];
                  for (var c = 1; c <= maxCols; c++) {
                    var cell = sheet.getCell(r, c);
                    rowData.push(cell !== null && cell !== undefined ? cell.v : '');
                  }
                  rows.push(rowData);
                }
                if (rows.length > 0) sheetsData.push({ name: sheetName, data: rows });
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
        // 下载：通过 /api/office/download 获取服务器上的文件
        var downloadBtn = w.$c.querySelector('#xlsx-v2-download-btn');
        if (downloadBtn) {
          downloadBtn.onclick = function () {
            if (!fileId) return toast('请先点击"保存"按钮存到服务器，然后再下载', 'warning');
            var url = '/api/office/download/' + encodeURIComponent(fileId) + '/' + encodeURIComponent(fileName);
            window.open(url, '_blank');
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
                var buf = ev.target.result;
                // 用后端 API 解析文件
                var fd = new FormData();
                fd.append('file', new Blob([buf]), file.name);
                fetch('/api/office/upload?api_key=dev-key-001', {
                  method: 'POST',
                  body: fd
                }).then(function (r) { return r.json(); }).then(function (r) {
                  if (r.ok && r.sheets) {
                    toast('已解析 ' + file.name + '，点击"保存"存入服务器', 'success');
                    var fnEl = w.$c.querySelector('#xlsx-v2-filename');
                    if (fnEl) fnEl.textContent = file.name;
                    fileName = file.name;
                    fileId = r.fileId;
                    // 将数据写入 Univer
                    // mountExcel 返回 univerAPI 实例
                    console.log('[xlsx-v2] editor type:', typeof editor, 'keys:', editor ? Object.keys(editor).slice(0, 10) : 'null');
                    console.log('[xlsx-v2] getWorkbook:', typeof editor.getWorkbook, editor.getWorkbook);
                    if (editor) {
                      console.log('[xlsx-v2] editor methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(editor)).filter(function(k) { return typeof editor[k] === 'function'; }).slice(0, 20));
                    }
                    // getWorkbook 需要传入 unitId，改用 _univerInstanceService
                    if (editor && editor._univerInstanceService) {
                      var univerInstanceService = editor._univerInstanceService;
                      var sheets = univerInstanceService.getUnitTypes && univerInstanceService.getUnitTypes();
                      console.log('[xlsx-v2] unit types:', sheets);
                      // 获取第一个 sheet 的 unitId
                      var sheetUnitId = null;
                      if (univerInstanceService.getCurrentUnitOfType) {
                        var sheet = univerInstanceService.getCurrentUnitOfType(2 /* UNIVER_SHEET, v0.93 修复枚举 */);
                        if (sheet) sheetUnitId = sheet.getUnitId();
                      }
                      console.log('[xlsx-v2] sheet unitId:', sheetUnitId);
                      if (sheetUnitId) {
                        var wb = editor.getWorkbook(sheetUnitId);
                        if (!wb) return toast('无法获取工作簿', 'error');
                        // 清空现有 sheet
                        while (wb.getSheetCount() > 0) {
                          wb.removeSheetByIndex(0);
                        }
                        // 写入每个 sheet
                        r.sheets.forEach(function (s, idx) {
                          var sheetName = s.name || 'Sheet' + (idx + 1);
                          var headers = s.headers || [];
                          var rows = s.rows || [];
                          var ws = wb.createSheet(sheetName);
                          // 写入数据
                          if (headers.length > 0 || rows.length > 0) {
                            var data = headers.concat(rows.map(function (r) { return headers.length > 0 ? r : r; }));
                            if (data.length > 0) {
                              var maxCols = data[0] ? data[0].length : 0;
                              var range = ws.getRange(0, 0, data.length - 1, maxCols - 1);
                              range.setValues(data);
                            }
                          }
                        });
                        toast('已加载 ' + r.sheets.length + ' 个工作表', 'success');
                      } else {
                        console.warn('[xlsx-v2] no sheet unitId found');
                        toast('无法获取工作表', 'error');
                      }
                    } else {
                      console.warn('[xlsx-v2] editor._univerInstanceService not available:', editor);
                      console.warn('[xlsx-v2] editor type:', typeof editor);
                      console.warn('[xlsx-v2] editor keys:', editor ? Object.keys(editor) : 'N/A');
                    }
                  } else {
                    toast('文件解析失败: ' + (r.error || '未知'), 'error');
                  }
                }).catch(function (err) {
                  toast('上传失败: ' + err.message, 'error');
                });
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
              applySchemaToUniver(editor, schemaData);
              // P5: 同步到 XlsxAI（小吉 xlsx 编辑的快照/Undo 基础）
              if (typeof window.XlsxAI !== 'undefined' && window.XlsxAI.loadSchema) {
                window.XlsxAI.loadSchema(schemaData, editor, fileId, fileName);
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
  // v0.93: applySchemaToUniver 抽成全局工具（P4a xlsx-ai 复用：AI 改 schema 后同步 UI）
  window.applySchemaToUniver = function (editor, schemaData) {
    if (!schemaData || !schemaData.sheets || schemaData.sheets.length === 0 || !editor || !editor._univerInstanceService) {
      console.warn('[xlsx-v2] applySchemaToUniver: 无效参数');
      return false;
    }
    try {
      var univerInstanceService = editor._univerInstanceService;
      var sheetUnitId = null;
      if (univerInstanceService.getCurrentUnitOfType) {
        // v0.93 修复：Univer 0.25.1 枚举 2=SHEET（1=DOC），原代码用 1 导致拿不到 sheet unit
        var sheet = univerInstanceService.getCurrentUnitOfType(2 /* UNIVER_SHEET */);
        if (sheet) sheetUnitId = sheet.getUnitId();
      }
      if (!sheetUnitId) {
        console.warn('[xlsx-v2] applySchemaToUniver: 无 sheet unit');
        return false;
      }
      var wb = editor.getWorkbook(sheetUnitId);
      if (!wb) {
        console.warn('[xlsx-v2] applySchemaToUniver: 无 workbook');
        return false;
      }
      // v0.93 重写：复用第一个 sheet + setValues 覆盖写入
      // （Univer 0.25 facade 无 removeSheetByIndex/createSheet；原 v2 load 代码 API 不匹配从未工作）
      schemaData.sheets.forEach(function (s, idx) {
        var sheetName = s.name || 'Sheet' + (idx + 1);
        var headers = s.headers || [];
        var rows = s.rows || [];
        var sheetsArr = typeof wb.getSheets === 'function' ? wb.getSheets() : [];
        var ws = null;
        if (sheetsArr.length > idx) {
          ws = sheetsArr[idx];
        } else if (sheetsArr.length > 0) {
          ws = sheetsArr[0];
        }
        if (!ws) return;
        if (typeof ws.setSheetName === 'function') {
          try { ws.setSheetName(sheetName); } catch (e) { /* 改名失败不影响数据 */ }
        }
        if (headers.length > 0 || rows.length > 0) {
          var data = headers.concat(rows);
          if (data.length > 0) {
            var maxCols = data.reduce(function (mx, row) { return Math.max(mx, row ? row.length : 0); }, 0);
            if (maxCols > 0) {
              var range = ws.getRange(0, 0, data.length - 1, maxCols - 1);
              if (range && typeof range.setValues === 'function') {
                range.setValues(data);
              } else {
                console.warn('[xlsx-v2] applySchemaToUniver: ws.getRange/setValues 不可用');
                return false;
              }
            }
          }
        }
      });
      if (typeof toast === 'function') toast('已加载 ' + schemaData.sheets.length + ' 个工作表', 'success');
      return true;
    } catch (e) {
      console.warn('[xlsx-v2] applySchemaToUniver error:', e);
      return false;
    }
  };

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
