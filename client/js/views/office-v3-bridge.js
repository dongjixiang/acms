// ACMS Office V3 集成桥接（v0.93 P1 — GenOffice docx 引擎 Word 编辑器）
//
// 设计原则（继承 office-v2-bridge.js 模式）：
//   (A) idle prefetch + dynamic import → 首开秒开、boot 零负担
//   (B) ACMSWin 关闭时清理 → 防内存泄漏
//   (C) 后端 API 零改动：load 用 resp.content(base64 原始字节) → parseDocx；
//       save 用 saveDocx 字节 → base64 → POST /api/office/save
//
// P1 范围：Word（office-v3-word / 覆盖 office-word）。PPT/Excel 由 P2/P3 扩展。
// 回滚：localStorage office-v3-disabled=1 → 不注册 v3（v2 继续生效）

(function () {
  'use strict';

  var BASE = '/client/lib/office-v3/';
  var API_KEY = 'dev-key-001';

  // ── 样式（动态注入，避免 index.html 多一个 link） ──
  function injectCss() {
    if (document.getElementById('office-v3-css')) return;
    var style = document.createElement('style');
    style.id = 'office-v3-css';
    style.textContent =
      '.v3-root{display:flex;flex-direction:column;height:100%;overflow:hidden;background:#f0f1f5;}' +
      '.v3-toolbar{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--office-divider,#d8d8de);background:#fff;flex-shrink:0;}' +
      '.v3-tb-title{font-size:13px;font-weight:600;color:var(--text,#333);margin-right:4px;}' +
      '.v3-tb-file{font-size:12px;color:var(--text2,#666);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.v3-tb-btn{padding:3px 10px;border:1px solid var(--border,#ccc);border-radius:4px;background:#fff;cursor:pointer;font-size:12px;color:var(--text,#333);}' +
      '.v3-tb-btn:hover{background:#f5f5f7;}' +
      '.v3-tb-status{margin-left:auto;font-size:11px;color:#888;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.v3-page{flex:1;overflow:auto;padding:32px 48px;max-width:880px;width:100%;margin:0 auto;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.06);border-radius:6px;}' +
      '.v3-para{min-height:1.4em;margin:0 0 8px;padding:2px 4px;border-radius:3px;outline:none;line-height:1.6;}' +
      '.v3-para:focus{box-shadow:0 0 0 1px var(--office-accent,#1f6feb);}' +
      '.v3-para.v3-dirty{outline:1px dashed #e0a800;}' +
      '.v3-table{border-collapse:collapse;margin:10px 0;width:100%;}' +
      '.v3-table td,.v3-table th{border:1px solid #999;padding:4px 8px;font-size:12pt;}' +
      '.v3-passthrough{border:1px dashed #bbb;background:#f7f7f8;color:#777;padding:8px 12px;border-radius:4px;margin:8px 0;font-size:13px;}' +
      '.v3-img img{max-width:100%;}' +
      '.v3-error{padding:20px;color:#a00;font-size:13px;}';
    document.head.appendChild(style);
  }
  injectCss();

  var state = {
    prefetched: {},
    moduleCache: {},   // { word: Module }
    instances: {},     // { fileId: { editor, fileId, fileName, dirty } }
  };

  // ── Prefetch ──
  function prefetch(name) {
    if (state.prefetched[name]) return;
    var link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = BASE + name;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
    state.prefetched[name] = true;
  }

  function schedulePrefetch() {
    setTimeout(function () { prefetch('word-engine.js'); }, 3000);
    setTimeout(function () { prefetch('opentype.js'); }, 8000);  // PPT 用，提前拉
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(schedulePrefetch, { timeout: 5000 });
  } else {
    schedulePrefetch();
  }

  async function loadWordEngine() {
    if (state.moduleCache.word) return state.moduleCache.word;
    var mod = await import(BASE + 'word-engine.js');
    state.moduleCache.word = mod;
    return mod;
  }

  // ── 工具 ──
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function runStyle(run) {
    var s = [];
    if (run.bold) s.push('font-weight:700');
    if (run.italic) s.push('font-style:italic');
    if (run.underline) s.push('text-decoration:underline');
    if (run.strike) s.push('text-decoration:line-through');
    if (run.color) s.push('color:#' + run.color);
    if (run.sizeHalfPoints) s.push('font-size:' + (run.sizeHalfPoints / 2) + 'pt');
    if (run.font) s.push("font-family:'" + String(run.font).replace(/'/g, '') + "'");
    return s.join(';');
  }

  function runToHtml(run) {
    var style = runStyle(run);
    var txt = esc(run.text || '');
    return style ? '<span style="' + style + '">' + txt + '</span>' : txt;
  }

  // ── 渲染 blocks → DOM ──
  function renderBlock(b, idx) {
    var el = document.createElement('div');
    if (b.type === 'paragraph' || b.type === 'heading' || b.type === 'listItem') {
      el.className = 'v3-para';
      el.contentEditable = 'true';
      el.dataset.idx = idx;
      if (b.type === 'heading' && b.level) {
        el.style.fontWeight = '700';
        if (b.level === 1) el.style.fontSize = '22pt';
        if (b.level === 2) el.style.fontSize = '16pt';
      }
      if (b.type === 'listItem') {
        var marker = b.list && b.list.kind === 'ordered' ? (b.list.ilvl + 1) + '. ' : '• ';
        el.style.paddingLeft = (b.list ? b.list.ilvl * 20 + 18 : 18) + 'px';
        el.style.listStyle = 'none';
        el.dataset.marker = marker;
      }
      var align = b.format && b.format.align;
      if (align) el.style.textAlign = align;
      var inner = document.createElement('span');
      inner.className = 'v3-para-inner';
      inner.innerHTML = (b.runs || []).map(runToHtml).join('');
      el.appendChild(inner);
    } else if (b.type === 'table') {
      var t = b.table;
      if (t && t.rows) {
        var table = document.createElement('table');
        table.className = 'v3-table';
        t.rows.forEach(function (row) {
          var tr = document.createElement('tr');
          row.forEach(function (cell) {
            var td = document.createElement('td');
            td.textContent = (cell.paras || []).join(' ');
            tr.appendChild(td);
          });
          table.appendChild(tr);
        });
        el.appendChild(table);
      } else {
        el.className = 'v3-passthrough';
        el.textContent = '📋 ' + (b.label || '表格（只读预览）');
      }
    } else if (b.type === 'image') {
      el.className = 'v3-img';
      if (b.imageDataUrl) {
        var img = document.createElement('img');
        img.src = b.imageDataUrl;
        img.style.maxWidth = '100%';
        el.appendChild(img);
      } else {
        el.textContent = '🖼 ' + (b.label || '图片');
      }
    } else {
      el.className = 'v3-passthrough';
      el.textContent = '🔒 ' + (b.previewText || b.label || '受保护内容（只读）');
    }
    return el;
  }

  // DOM 收集 runs（编辑段）
  function collectRuns(el) {
    var runs = [];
    (function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) runs.push({ text: node.textContent });
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.tagName === 'SPAN' && node.getAttribute('style')) {
        var st = node.style;
        var run = { text: node.textContent };
        if (st.fontWeight === '700' || st.fontWeight === 'bold') run.bold = true;
        if (st.fontStyle === 'italic') run.italic = true;
        if (st.textDecoration.indexOf('underline') !== -1) run.underline = true;
        if (st.textDecoration.indexOf('line-through') !== -1) run.strike = true;
        if (st.color && st.color !== 'rgb(51, 51, 51)') run.color = st.color.replace('#', '');
        var sz = st.fontSize && st.fontSize.match(/^([\d.]+)pt$/);
        if (sz) run.sizeHalfPoints = Math.round(parseFloat(sz[1]) * 2);
        var ff = st.fontFamily && st.fontFamily.match(/^'([^']+)'$/);
        if (ff) run.font = ff[1];
        runs.push(run);
        return;
      }
      for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
    })(el);
    return runs;
  }

  function paraText(el) {
    return (el.querySelector('.v3-para-inner') || el).textContent;
  }

  // ── 视图加载器（ACMSWin.open 入口） ──
  function makeWordLoader() {
    return async function loader(w, opts) {
      opts = opts || {};
      var args = arguments[1] || opts;
      var fileId = args.fileId;
      var fileName = args.fileName || 'untitled.docx';
      var isRemoteFile = !!fileId;
      var targetId = (fileId || 'new-' + Date.now()).replace(/-/g, '');

      if (!w || !w.$c) return null;
      var fnSafe = esc(fileName);
      w.$c.innerHTML =
        '<div class="v3-root">' +
        '  <div class="v3-toolbar">' +
        '    <span class="v3-tb-title">📝</span>' +
        '    <span class="v3-tb-file" title="' + fnSafe + '">' + fnSafe + '</span>' +
        '    <button class="v3-tb-btn" id="v3-word-save">💾 保存</button>' +
        '    <button class="v3-tb-btn" id="v3-word-download">⬇ 下载</button>' +
        '    <button class="v3-tb-btn" id="v3-word-open">📂 打开</button>' +
        '    <span class="v3-tb-status" id="v3-word-status">加载中…</span>' +
        '  </div>' +
        '  <div class="v3-page" id="' + targetId + '"></div>' +
        '</div>';

      var page = w.$c.querySelector('#' + targetId);
      var statusEl = w.$c.querySelector('#v3-word-status');
      var saveBtn = w.$c.querySelector('#v3-word-save');
      var dlBtn = w.$c.querySelector('#v3-word-download');
      var openBtn = w.$c.querySelector('#v3-word-open');

      var editor = {
        kind: 'word',
        fileId: fileId,
        fileName: fileName,
        parsed: null,
        blockEls: [],
        dirty: new Set(),
        destroy: function () {
          // 引擎为纯函数，无 DOM 实例需显式销毁；事件随 DOM 移除
          state.instances = Object.keys(state.instances).reduce(function (acc, k) {
            if (state.instances[k].editor !== editor) acc[k] = state.instances[k];
            return acc;
          }, {});
        },
      };

      function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

      function renderBlocks(blocks) {
        page.innerHTML = '';
        editor.blockEls = [];
        editor.dirty.clear();
        var idx = 0;
        for (var i = 0; i < blocks.length; i++) {
          var b = blocks[i];
          if (b.hidden) continue;
          var el = renderBlock(b, idx);
          if (el.contentEditable === 'true') {
            (function (el2, idx2) {
              el2.addEventListener('input', function () {
                editor.dirty.add(idx2);
                el2.classList.add('v3-dirty');
                setStatus(editor.dirty.size + ' 段已修改');
              });
            })(el, idx);
          }
          page.appendChild(el);
          editor.blockEls.push({ idx: idx, el: el, block: b });
          idx++;
        }
      }

      function buildSaveBlocks() {
        var saveBlocks = [];
        var editedCount = 0, originalCount = 0;
        editor.blockEls.forEach(function (entry) {
          var b = entry.block;
          if (b.hidden || b.docxIndex === null || b.docxIndex === undefined) return;
          if (b.type !== 'paragraph' && b.type !== 'heading' && b.type !== 'listItem') {
            saveBlocks.push({ kind: 'original', docxIndex: b.docxIndex });
            originalCount++;
            return;
          }
          var newText = paraText(entry.el);
          var origText = (b.runs || []).map(function (r) { return r.text || ''; }).join('');
          if (editor.dirty.has(entry.idx) && newText !== origText) {
            var runs = collectRuns(entry.el.querySelector('.v3-para-inner') || entry.el);
            saveBlocks.push({
              kind: 'generated',
              block: {
                type: b.type,
                runs: runs,
                styleId: b.styleId,
                format: b.format,
                rawPPr: b.rawPPr,
                level: b.level,
                list: b.list,
              },
            });
            editedCount++;
          } else {
            saveBlocks.push({ kind: 'original', docxIndex: b.docxIndex });
            originalCount++;
          }
        });
        return { saveBlocks: saveBlocks, editedCount: editedCount, originalCount: originalCount };
      }

      // 保存：saveDocx → base64 → POST /api/office/save（content 直存通道）
      saveBtn.onclick = async function () {
        if (!editor.parsed) return toast('文档未加载', 'error');
        setStatus('保存中…');
        try {
          var engine = await loadWordEngine();
          var built = buildSaveBlocks();
          var out = await engine.saveDocx(editor.parsed, built.saveBlocks);
          var b64 = bytesToBase64(out);
          var payload = { type: 'docx', name: editor.fileName, content: b64 };
          var resp = await fetch('/api/office/save?api_key=' + API_KEY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          var r = await resp.json();
          if (r.ok) {
            editor.fileId = r.fileId;
            editor.fileName = r.fileName;
            setStatus('✅ 已保存 ' + r.fileName + ' (' + r.size + ' bytes, ' + built.editedCount + ' 段编辑 / ' + built.originalCount + ' 段保留)');
            toast('已保存 ✅ ' + r.fileName, 'success');
          } else {
            setStatus('❌ 保存失败: ' + (r.error || '未知'));
            toast('保存失败: ' + (r.error || '未知'), 'error');
          }
        } catch (e) {
          console.error('[office-v3] save error:', e);
          setStatus('❌ 保存失败: ' + e.message);
          toast('保存失败: ' + e.message, 'error');
        }
      };

      dlBtn.onclick = function () {
        if (!editor.fileId) return toast('请先保存再下载', 'warning');
        var url = '/api/office/download/' + encodeURIComponent(editor.fileId) + '/' + encodeURIComponent(editor.fileName);
        window.open(url, '_blank');
      };

      openBtn.onclick = function () {
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.docx';
        inp.onchange = function (e) {
          var file = e.target.files && e.target.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = async function (ev) {
            try {
              var engine = await loadWordEngine();
              var buf = new Uint8Array(ev.target.result);
              var parsed = await engine.parseDocx(buf);
              editor.parsed = parsed;
              editor.fileName = file.name;
              editor.fileId = null;
              renderBlocks(parsed.blocks);
              var fnEl = w.$c.querySelector('.v3-tb-file');
              if (fnEl) fnEl.textContent = file.name;
              setStatus('✅ 已打开本地文件，直接编辑后保存');
            } catch (err) {
              setStatus('❌ 解析失败: ' + err.message);
            }
          };
          reader.readAsArrayBuffer(file);
        };
        inp.click();
      };

      // 加载远程文件（文件浏览器打开）
      // 用 /api/office/download 拿原始字节（load 的 docx 分支只返回 blocks JSON，无 content）
      if (isRemoteFile) {
        try {
          var dlName = encodeURIComponent(fileName || 'document.docx');
          var resp = await fetch('/api/office/download/' + encodeURIComponent(fileId) + '/' + dlName + '?api_key=' + API_KEY);
          if (!resp.ok) throw new Error('下载文件失败 HTTP ' + resp.status);
          var bin = new Uint8Array(await resp.arrayBuffer());
          var engine = await loadWordEngine();
          var parsed = await engine.parseDocx(bin);
          editor.parsed = parsed;
          renderBlocks(parsed.blocks);
          var zhCount = (parsed.blocks || []).reduce(function (n, b) {
            return n + (b.runs || []).filter(function (r) { return /[\u4e00-\u9fff]/.test(r.text || ''); }).length;
          }, 0);
          setStatus('✅ ' + (parsed.blocks || []).length + ' 块 / ' + zhCount + ' 中文 run');
        } catch (err) {
          console.error('[office-v3] load failed:', err);
          page.innerHTML = '<div class="v3-error">❌ 加载失败：' + esc(err.message) + '</div>';
        }
      } else {
        setStatus('新文档（未加载）');
      }

      var key = fileId || ('__v3word__' + Date.now());
      state.instances[key] = { editor: editor };
      return editor;
    };
  }

  // ── base64 工具（浏览器） ──
  function bytesToBase64(bytes) {
    var bs = new Uint8Array(bytes);
    var chunks = [];
    var CH = 0x8000;
    for (var i = 0; i < bs.length; i += CH) {
      chunks.push(String.fromCharCode.apply(null, bs.subarray(i, i + CH)));
    }
    return btoa(chunks.join(''));
  }

  function base64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // ── 注册 ──
  function registerAll() {
    if (typeof window.ACMSWin === 'undefined' || !ACMSWin.registerViewLoader) {
      console.info('[office-v3] ACMSWin not available, skipping');
      return;
    }
    var rollback = (function () {
      try { return localStorage.getItem('office-v3-disabled') === '1'; } catch (e) { return false; }
    })();
    if (rollback) {
      console.warn('[office-v3] DISABLED by localStorage office-v3-disabled=1');
      return;
    }
    ACMSWin.registerViewLoader('office-v3-word', makeWordLoader());
    ACMSWin.registerViewLoader('office-word', makeWordLoader());  // 覆盖旧名（P119 模式）
    console.info('[office-v3] word loader registered (office-v3-word + 覆盖 office-word)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerAll);
  } else {
    registerAll();
  }

  // 工具 API（P5 小吉用，先暴露骨架）
  window.OfficeV3 = {
    open: function (kind, fileId, fileName) {
      if (!window.ACMSWin) return console.warn('[office-v3] no ACMSWin');
      var view = kind === 'word' ? 'office-v3-word' : kind === 'excel' ? 'office-v3-xlsx' : 'office-v3-slides';
      return ACMSWin.open(view, { w: 980, h: 680, title: fileName || kind, fileId: fileId, fileName: fileName });
    },
    listInstances: function () { return Object.keys(state.instances); },
    getState: function () { return state; },
    warmUp: function () { schedulePrefetch(); },
  };
})();
