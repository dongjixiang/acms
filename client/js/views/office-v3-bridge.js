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
      '.v3-error{padding:20px;color:#a00;font-size:13px;}' +
      '.v3-slides-stage{flex:1;overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:24px;background:#e8e9ee;}' +
      '.v3-slide-canvas{position:relative;box-shadow:0 2px 12px rgba(0,0,0,.18);flex-shrink:0;overflow:hidden;}' +
      '.v3-slide-shape{position:absolute;overflow:hidden;}' +
      '.v3-slide-textbox{position:relative;width:100%;height:100%;overflow:hidden;}' +
      '.v3-slide-para{position:absolute;left:0;right:0;outline:none;min-height:1em;line-height:1.25;white-space:pre-wrap;}' +
      '.v3-slide-para:focus{box-shadow:inset 0 0 0 1px var(--office-accent,#1f6feb);}';
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
  // P132: GenOffice Slides UI（Konva 全套菜单）优先；失败/禁用回退自渲染 v3
  function slidesGenEnabled() {
    try { return localStorage.getItem('office-v3-slides-ui') !== '0'; } catch (e) { return true; }
  }

  // 加载 GenOffice Slides UI：iframe 完全隔离（不污染 ACMS 全局样式）
  async function loadGenOfficeSlides(w, fileId, fileName) {
    // 清理旧 slides-ui 实例
    Object.keys(state.instances).forEach(function (k) {
      var e = state.instances[k].editor;
      if (e && e.kind === 'slides-ui') delete state.instances[k];
    });
    var oldFrame = w.$c.querySelector('iframe.v3-genoffice-frame');
    if (oldFrame) {
      try { if (oldFrame.contentWindow && oldFrame.contentWindow.__unmount) oldFrame.contentWindow.__unmount(); } catch (e) { /* ignore */ }
      oldFrame.remove();
    }
    w.$c.innerHTML = '';
    var frame = document.createElement('iframe');
    frame.className = 'v3-genoffice-frame';
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block;';
    frame.src = BASE + 'slides-ui/host.html?v=17';
    w.$c.appendChild(frame);

    function initFrame() {
      var win = frame.contentWindow;
      if (!win || typeof win.__init !== 'function') return;
      win.__init({ fileId: fileId || undefined, fileName: fileName || 'untitled.pptx', apiKey: API_KEY })
        .then(function (r) {
          if (r && !r.ok) console.warn('[office-v3] GenOffice slides host init 失败:', r.error);
        })
        .catch(function (e) { console.warn('[office-v3] GenOffice slides host init 异常:', e.message); });
    }
    frame.addEventListener('load', initFrame);
    setTimeout(function () {
      if (frame.contentWindow && frame.contentWindow.__ready === true) initFrame();
    }, 500);

    w.onClose = function () {
      try { if (frame.contentWindow && frame.contentWindow.__unmount) frame.contentWindow.__unmount(); } catch (e) { /* ignore */ }
      frame.remove();
    };
    var key = fileId || ('__v3genslides__' + Date.now());
    state.instances[key] = { editor: { kind: 'slides-ui', fileId: fileId, fileName: fileName, iframe: frame } };
    return { kind: 'slides-ui', fileId: fileId, fileName: fileName, iframe: frame };
  }

  // P132: slides 调度器——GenOffice 优先，禁用/失败回退自渲染
  function makeSlidesLoader() {
    return async function loader(w, opts) {
      opts = opts || {};
      var args = arguments[1] || opts;
      var fileId = args.fileId;
      var fileName = args.fileName || 'untitled.pptx';
      if (!w || !w.$c) return null;

      var useGen = slidesGenEnabled();
      var win = null;
      if (useGen) {
        try {
          win = await loadGenOfficeSlides(w, fileId, fileName);
        } catch (err) {
          console.warn('[office-v3] GenOffice Slides UI 加载失败，回退自渲染:', err.message);
          useGen = false;
        }
      }
      if (!useGen) {
        win = await makeSlidesSelfLoader()(w, opts);
      }
      w.reloadDocument = function (fid, fname) {
        if (!fid) return;
        console.info('[office-v3] slides reloadDocument:', fid, fname);
        if (slidesGenEnabled()) {
          loadGenOfficeSlides(w, fid, fname).catch(function (e) {
            console.warn('[office-v3] GenOffice slides reload 失败，回退自渲染:', e.message);
            w.$c.innerHTML = '';
            makeSlidesSelfLoader()(w, { fileId: fid, fileName: fname });
          });
        } else {
          w.$c.innerHTML = '';
          makeSlidesSelfLoader()(w, { fileId: fid, fileName: fname });
        }
      };
      return win;
    };
  }

  // P132: GenOffice Excel UI（Univer 0.25.1 presets 全套菜单）优先；失败回退 v2
  function excelGenEnabled() {
    try { return localStorage.getItem('office-v3-sheets-ui') !== '0'; } catch (e) { return true; }
  }

  // 加载 GenOffice Sheets UI：iframe 完全隔离（不污染 ACMS 全局样式）
  async function loadGenOfficeExcel(w, fileId, fileName) {
    // 清理旧 sheets-ui 实例（reload 换文件后旧 key 残留会误导 runAction 定位）
    Object.keys(state.instances).forEach(function (k) {
      var e = state.instances[k].editor;
      if (e && e.kind === 'sheets-ui') delete state.instances[k];
    });
    var oldFrame = w.$c.querySelector('iframe.v3-genoffice-frame');
    if (oldFrame) {
      try { if (oldFrame.contentWindow && oldFrame.contentWindow.__unmount) oldFrame.contentWindow.__unmount(); } catch (e) { /* ignore */ }
      oldFrame.remove();
    }
    w.$c.innerHTML = '';
    var frame = document.createElement('iframe');
    frame.className = 'v3-genoffice-frame';
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block;';
    frame.src = BASE + 'sheets-ui/host.html?v=26';
    w.$c.appendChild(frame);

    var _frameInitDone = false;
    function initFrame() {
      if (_frameInitDone) return;  // P144: load 事件 + setTimeout 兜底会各调一次，二次 __init 会 unmount 掉第一个 Univer → Injector disposed 竞态
      var win = frame.contentWindow;
      if (!win || typeof win.__init !== 'function') return;
      _frameInitDone = true;
      win.__init({ fileId: fileId || undefined, fileName: fileName || '工作簿.xlsx', apiKey: API_KEY })
        .then(function (r) {
          if (r && !r.ok) console.warn('[office-v3] GenOffice sheets host init 失败:', r.error);
        })
        .catch(function (e) { console.warn('[office-v3] GenOffice sheets host init 异常:', e.message); });
    }
    frame.addEventListener('load', initFrame);
    setTimeout(function () {
      if (frame.contentWindow && frame.contentWindow.__ready === true) initFrame();
    }, 500);

    w.onClose = function () {
      try { if (frame.contentWindow && frame.contentWindow.__unmount) frame.contentWindow.__unmount(); } catch (e) { /* ignore */ }
      frame.remove();
    };
    var key = fileId || ('__v3genxlsx__' + Date.now());
    state.instances[key] = { editor: { kind: 'sheets-ui', fileId: fileId, fileName: fileName, iframe: frame } };
    return { kind: 'sheets-ui', fileId: fileId, fileName: fileName, iframe: frame };
  }

  // Excel 调度器：GenOffice UI 优先，失败回退 legacy v2 loader（Univer 裸引擎）
  function makeExcelLoader(legacyLoader) {
    return async function loader(w, opts) {
      opts = opts || {};
      var args = arguments[1] || opts;
      var fileId = args.fileId;
      var fileName = args.fileName || '工作簿.xlsx';
      if (!w || !w.$c) return null;
      var useGen = excelGenEnabled();
      var win = null;
      if (useGen) {
        try {
          win = await loadGenOfficeExcel(w, fileId, fileName);
        } catch (err) {
          console.warn('[office-v3] GenOffice Sheets UI 加载失败，回退 v2:', err.message);
          useGen = false;
        }
      }
      if (!useGen) {
        if (legacyLoader) {
          win = await legacyLoader(w, opts);
        } else {
          w.$c.innerHTML = '<div style="padding:20px;color:#a00;font-size:13px">Excel 编辑器不可用（GenOffice UI 失败且无 v2 回退）。可设置 localStorage office-v3-sheets-ui=0 后刷新恢复 v2。</div>';
        }
      }
      w.reloadDocument = function (fid, fname) {
        if (!fid) return;
        console.info('[office-v3] excel reloadDocument:', fid, fname);
        if (excelGenEnabled()) {
          loadGenOfficeExcel(w, fid, fname).catch(function (e) {
            console.warn('[office-v3] GenOffice excel reload 失败，回退 v2:', e.message);
            w.$c.innerHTML = '';
            if (legacyLoader) legacyLoader(w, { fileId: fid, fileName: fname });
          });
        } else {
          w.$c.innerHTML = '';
          if (legacyLoader) legacyLoader(w, { fileId: fid, fileName: fname });
        }
      };
      return win;
    };
  }

  // 自渲染 v3（原 makeSlidesLoader 主体）
  function makeSlidesSelfLoader() {
    return async function loader(w, opts) {
      opts = opts || {};
      var args = arguments[1] || opts;
      var fileId = args.fileId;
      var fileName = args.fileName || 'untitled.pptx';
      var isRemoteFile = !!fileId;

      if (!w || !w.$c) return null;
      var fnSafe = esc(fileName);
      w.$c.innerHTML =
        '<div class="v3-root">' +
        '  <div class="v3-toolbar">' +
        '    <span class="v3-tb-title">📽️</span>' +
        '    <span class="v3-tb-file" title="' + fnSafe + '">' + fnSafe + '</span>' +
        '    <button class="v3-tb-btn" id="v3-slides-prev">◀</button>' +
        '    <span class="v3-tb-status" id="v3-slides-pageno" style="margin-left:0">1 / 1</span>' +
        '    <button class="v3-tb-btn" id="v3-slides-next">▶</button>' +
        '    <button class="v3-tb-btn" id="v3-slides-save">💾 保存</button>' +
        '    <button class="v3-tb-btn" id="v3-slides-download">⬇ 下载</button>' +
        '    <span class="v3-tb-status" id="v3-slides-status">加载中…</span>' +
        '  </div>' +
        '  <div class="v3-slides-stage" id="v3-slides-stage"></div>' +
        '</div>';

      var stage = w.$c.querySelector('#v3-slides-stage');
      var statusEl = w.$c.querySelector('#v3-slides-status');
      var pageNoEl = w.$c.querySelector('#v3-slides-pageno');
      var saveBtn = w.$c.querySelector('#v3-slides-save');
      var dlBtn = w.$c.querySelector('#v3-slides-download');
      var prevBtn = w.$c.querySelector('#v3-slides-prev');
      var nextBtn = w.$c.querySelector('#v3-slides-next');

      var editor = {
        kind: 'slides',
        fileId: fileId,
        fileName: fileName,
        opened: null,      // {deck, archive}
        slideIdx: 0,
        dirtyEls: new Set(),
        destroy: function () {
          state.instances = Object.keys(state.instances).reduce(function (acc, k) {
            if (state.instances[k].editor !== editor) acc[k] = state.instances[k];
            return acc;
          }, {});
        },
        // P5：AI 编辑入口 — 修改当前页第 textBoxIdx 个文本框的全部文本
        proposeEdit: function (textBoxIdx, newText) {
          if (!editor.opened) return { ok: false, error: '文档未加载' };
          var deck = editor.opened.deck;
          var slide = deck.slides[editor.slideIdx];
          var textEls = slide.elements.filter(function (el) { return el.type === 'text' || el.type === 'shape'; });
          var el = textEls[textBoxIdx];
          if (!el || !el.text) return { ok: false, error: '文本框不存在: ' + textBoxIdx };
          var origPara = el.text.paragraphs[0] || {};
          el.text.paragraphs = [{
            runs: [{ text: String(newText) }],
            align: origPara.align,
            lineHeight: origPara.lineHeight,
            lineExact: origPara.lineExact,
          }];
          el.dirty = true;
          editor.dirtyEls.add(el.id);
          renderCurrentSlide();
          return { ok: true, textBoxIdx: textBoxIdx, newText: String(newText) };
        },
      };

      function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

      // 渲染当前页：RenderSlide → DOM
      function renderCurrentSlide() {
        if (!editor.opened) return;
        var engine = state.moduleCache.slides;
        var deck = editor.opened.deck;
        var slide = deck.slides[editor.slideIdx];
        stage.innerHTML = '';
        pageNoEl.textContent = (editor.slideIdx + 1) + ' / ' + deck.slides.length;

        var rs = engine.buildRenderSlide(slide, deck.size, { fitWidthPx: 960, slideNo: editor.slideIdx + 1 });
        var fitScale = Math.min((stage.clientWidth || 900) / rs.widthPx, (stage.clientHeight || 520) / rs.heightPx);
        if (fitScale <= 0 || !isFinite(fitScale)) fitScale = 1;
        var S = fitScale;

        var canvas = document.createElement('div');
        canvas.className = 'v3-slide-canvas';
        canvas.style.width = Math.round(rs.widthPx * S) + 'px';
        canvas.style.height = Math.round(rs.heightPx * S) + 'px';
        if (rs.background && rs.background.kind === 'solid') {
          canvas.style.background = rs.background.color;
        } else {
          canvas.style.background = '#fff';
        }
        stage.appendChild(canvas);

        (rs.nodes || []).forEach(function (node) {
          if (node.type === 'group') return;  // P2 简化：组跳过
          if (node.type === 'table' || node.type === 'chart' || node.type === 'chip') return;  // P2 简化：非文本节点跳过
          var b = node.box;
          var el = document.createElement('div');
          el.className = 'v3-slide-shape';
          el.style.left = Math.round(b.x * S) + 'px';
          el.style.top = Math.round(b.y * S) + 'px';
          el.style.width = Math.round(b.w * S) + 'px';
          el.style.height = Math.round(b.h * S) + 'px';
          if (node.fill && node.fill.kind === 'solid') el.style.background = node.fill.color;
          if (node.presetGeometry && node.presetGeometry !== 'rect') {
            // 基础几何近似：ellipse → 圆角
            if (/ellipse|roundRect/i.test(node.presetGeometry)) el.style.borderRadius = '50%';
          }

          if (node.text && node.text.lines && node.text.lines.length) {
            var textBox = document.createElement('div');
            textBox.className = 'v3-slide-textbox';
            textBox.dataset.sourceId = node.sourceId;
            // 按段落分组（paraStart 标记），每段一个 contenteditable
            var paraEl = null;
            node.text.lines.forEach(function (line) {
              if (line.paraStart || !paraEl) {
                paraEl = document.createElement('div');
                paraEl.className = 'v3-slide-para';
                paraEl.contentEditable = 'true';
                paraEl.dataset.sourceId = node.sourceId;
                paraEl.style.top = Math.round(line.top * S) + 'px';
                if (line.align) paraEl.style.textAlign = line.align;
                if (line.marLPx) paraEl.style.paddingLeft = Math.round(line.marLPx * S) + 'px';
                textBox.appendChild(paraEl);
              }
              var run = line.runs[0] || { text: '', fontFamily: 'Arial', fontSizePx: 18, color: '#000' };
              paraEl.style.fontFamily = "'" + (run.fontFamily || 'Arial') + "'";
              paraEl.style.fontSize = Math.round((run.fontSizePx || 18) * S) + 'px';
              paraEl.style.color = run.color || '#000';
              if (run.bold) paraEl.style.fontWeight = '700';
              if (run.italic) paraEl.style.fontStyle = 'italic';
              // 行文本拼接（含 run 级 span 格式）
              var lineText = line.runs.map(function (g) {
                var t = esc(g.text || '');
                var st = '';
                if (g.bold) st += 'font-weight:700;';
                if (g.italic) st += 'font-style:italic;';
                if (g.underline) st += 'text-decoration:underline;';
                if (g.color && g.color !== run.color) st += 'color:' + g.color + ';';
                return st ? '<span style="' + st + '">' + t + '</span>' : t;
              }).join('');
              paraEl.innerHTML += lineText;
              paraEl.appendChild(document.createTextNode('\n'));
            });
            el.appendChild(textBox);
          }
          canvas.appendChild(el);
        });
      }

      function collectParaRuns(paraEl) {
        // 从 contenteditable 段落收集 runs（复用 word 的 span 样式逻辑）
        var runs = [];
        (function walk(node) {
          if (node.nodeType === Node.TEXT_NODE) {
            if (node.textContent && node.textContent !== '\n') runs.push({ text: node.textContent.replace(/\n$/, '') });
            return;
          }
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.tagName === 'SPAN' && node.getAttribute('style')) {
            var st = node.style;
            var run = { text: node.textContent };
            if (st.fontWeight === '700' || st.fontWeight === 'bold') run.bold = true;
            if (st.fontStyle === 'italic') run.italic = true;
            if (st.textDecoration.indexOf('underline') !== -1) run.underline = true;
            if (st.color && st.color !== 'rgb(0, 0, 0)') run.color = st.color;
            var ff = st.fontFamily && st.fontFamily.match(/^'([^']+)'$/);
            if (ff) run.font = ff[1];
            runs.push(run);
            return;
          }
          for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
        })(paraEl);
        // 合并相邻纯文本 run
        var merged = [];
        runs.forEach(function (r) {
          if (merged.length && !merged[merged.length - 1].font && !r.font &&
              merged[merged.length - 1].bold === r.bold && merged[merged.length - 1].italic === r.italic) {
            merged[merged.length - 1].text += r.text;
          } else {
            merged.push(r);
          }
        });
        return merged;
      }

      // 编辑回写：DOM 段落 → 更新对应 TextElement.text.paragraphs → dirty
      function writeBackEdits() {
        if (!editor.opened) return;
        var deck = editor.opened.deck;
        var slide = deck.slides[editor.slideIdx];
        var bySource = {};
        slide.elements.forEach(function (el, i) { bySource[el.id] = { el: el, i: i }; });

        var paras = stage.querySelectorAll('.v3-slide-para');
        paras.forEach(function (paraEl) {
          var sid = paraEl.dataset.sourceId;
          var hit = bySource[sid];
          if (!hit || !hit.el.text) return;
          var el = hit.el;
          var runs = collectParaRuns(paraEl);
          if (!runs.length) return;
          // 替换整个 text 为单段落（保留段落级属性：对齐等从原第一段继承）
          var origPara = el.text.paragraphs[0] || {};
          el.text.paragraphs = [{
            runs: runs,
            align: origPara.align,
            lineHeight: origPara.lineHeight,
            lineExact: origPara.lineExact,
            spaceBefore: origPara.spaceBefore,
            spaceAfter: origPara.spaceAfter,
            bullet: origPara.bullet,
          }];
          el.dirty = true;
          editor.dirtyEls.add(el.id);
        });
      }

      // 保存：writeBack → savePptx → base64 → POST
      saveBtn.onclick = async function () {
        if (!editor.opened) return toast('文档未加载', 'error');
        setStatus('保存中…');
        try {
          writeBackEdits();
          var engine = state.moduleCache.slides;
          var out = await engine.savePptx(editor.opened);
          var b64 = bytesToBase64(out);
          var resp = await fetch('/api/office/save?api_key=' + API_KEY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'pptx', name: editor.fileName, content: b64 }),
          });
          var r = await resp.json();
          if (r.ok) {
            editor.fileId = r.fileId;
            editor.fileName = r.fileName;
            editor.dirtyEls.clear();
            setStatus('✅ 已保存 ' + r.fileName + ' (' + r.size + ' bytes)');
            toast('已保存 ✅ ' + r.fileName, 'success');
          } else {
            setStatus('❌ 保存失败: ' + (r.error || '未知'));
            toast('保存失败: ' + (r.error || '未知'), 'error');
          }
        } catch (e) {
          console.error('[office-v3] slides save error:', e);
          setStatus('❌ 保存失败: ' + e.message);
          toast('保存失败: ' + e.message, 'error');
        }
      };

      dlBtn.onclick = function () {
        if (!editor.fileId) return toast('请先保存再下载', 'warning');
        window.open('/api/office/download/' + encodeURIComponent(editor.fileId) + '/' + encodeURIComponent(editor.fileName), '_blank');
      };

      prevBtn.onclick = function () {
        if (!editor.opened) return;
        if (editor.slideIdx > 0) { editor.slideIdx--; renderCurrentSlide(); }
      };
      nextBtn.onclick = function () {
        if (!editor.opened) return;
        if (editor.slideIdx < editor.opened.deck.slides.length - 1) { editor.slideIdx++; renderCurrentSlide(); }
      };
      window.addEventListener('resize', function () { if (editor.opened && editor.slideIdx === editor.slideIdx) renderCurrentSlide(); });

      // 加载远程文件
      async function loadRemoteFile(fileId2, fileName2) {
        try {
          var dlName = encodeURIComponent(fileName2 || 'document.pptx');
          var resp = await fetch('/api/office/download/' + encodeURIComponent(fileId2) + '/' + dlName + '?api_key=' + API_KEY);
          if (!resp.ok) throw new Error('下载文件失败 HTTP ' + resp.status);
          var bin = new Uint8Array(await resp.arrayBuffer());
          if (!state.moduleCache.slides) await loadSlidesEngine();
          var engine = state.moduleCache.slides;
          editor.opened = await engine.openPptx(bin);
          editor.fileId = fileId2;
          editor.fileName = fileName2;
          editor.slideIdx = 0;
          renderCurrentSlide();
          var fnEl = w.$c.querySelector('.v3-tb-file');
          if (fnEl) fnEl.textContent = fileName2;
          setStatus('✅ ' + editor.opened.deck.slides.length + ' 页，点击文本框直接编辑');
        } catch (err) {
          console.error('[office-v3] slides load failed:', err);
          stage.innerHTML = '<div class="v3-error">❌ 加载失败：' + esc(err.message) + '</div>';
        }
      }

      if (isRemoteFile) {
        await loadRemoteFile(fileId, fileName);
      }

      // 窗口复用（P3）
      w.reloadDocument = function (fileId2, fileName2) {
        if (!fileId2) return;
        console.info('[office-v3] slides reloadDocument:', fileId2, fileName2);
        setStatus('加载中…');
        loadRemoteFile(fileId2, fileName2);
      };
      // P5: 注册到 state.instances（小吉/工具 API 定位用；word loader 已有）
      var key = fileId || ('__v3slides__' + Date.now());
      state.instances[key] = { editor: editor };
      return editor;
    };
  }

  async function loadSlidesEngine() {
    if (state.moduleCache.slides) return state.moduleCache.slides;
    var mod = await import(BASE + 'slides-engine.js');
    state.moduleCache.slides = mod;
    return mod;
  }

  // ── 视图加载器（ACMSWin.open 入口） ──
  // P132: GenOffice Word UI（Tiptap 全套菜单）优先；失败/禁用回退自渲染 v3

  // GenOffice UI 开关：localStorage office-v3-word-ui=0 禁用；默认启用
  function genOfficeEnabled() {
    try { return localStorage.getItem('office-v3-word-ui') !== '0'; } catch (e) { return true; }
  }

  // GenOffice Word UI：替换第 blockIdx 段文本（Tiptap commands）
  // 段落类节点 = docParagraph/docHeading/docListItem（与 buildOfficeDocContext 摘要索引一致，跳过表格）
  function genOfficeProposeEdit(frame, blockIdx, newText) {
    try {
      var win = frame && frame.contentWindow;
      var docEl = win && win.document ? win.document.querySelector('[contenteditable="true"]') : null;
      var editor = docEl && docEl.editor;
      if (!editor) return { ok: false, error: '编辑器未就绪' };
      var paras = [];
      editor.state.doc.content.forEach(function (node, offset) {
        var n = node.type.name;
        if (n === 'docParagraph' || n === 'docHeading' || n === 'docListItem') {
          paras.push({ node: node, offset: offset });
        }
      });
      var target = paras[blockIdx];
      if (!target) return { ok: false, error: '段落不存在: ' + blockIdx };
      var fromPos = target.offset + 1;
      var toPos = target.offset + target.node.nodeSize - 1;
      editor.chain()
        .setTextSelection({ from: fromPos, to: toPos })
        .insertContent(String(newText))
        .run();
      return { ok: true, blockIdx: blockIdx, newText: String(newText) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // GenOffice Word UI：在文档末尾追加新内容（v0.96.2 P138）
  // 把 \\n\\n 分隔的多段文本用 ProseMirror docParagraph 节点插入到 doc 末尾
  function genOfficeAppendAll(frame, newText) {
    try {
      var win = frame && frame.contentWindow;
      var docEl = win && win.document ? win.document.querySelector('[contenteditable="true"]') : null;
      var editor = docEl && docEl.editor;
      if (!editor) return { ok: false, error: '编辑器未就绪' };
      var text = String(newText || '').trim();
      if (!text) return { ok: false, error: '没有要追加的内容' };
      // 在文档末尾（doc.content.size）插入多个段落，用 \\n\\n 切分
      var paragraphs = text.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
      var docSize = editor.state.doc.content.size;
      // 先把光标移到文档末尾
      editor.commands.focus('end');
      // 如果文档末尾不是段落结尾，补一个换行（避免粘连到最后一个段落的 run）
      // 简单做法：直接 insertContent 多个段落（Tiptap 自动按 docParagraph 解析）
      var content = paragraphs.map(function (p) {
        return { type: 'docParagraph', content: [{ type: 'text', text: p }] };
      });
      editor.chain()
        .insertContentAt(docSize, content)
        .run();
      return { ok: true, appended: paragraphs.length, chars: text.length };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // v0.97: appendAll + 自动配图（解析【插图N：xxx】标记，串行调生图 API）
  function genOfficeAppendAllWithImages(frame, newText, markers) {
    return new Promise(function (resolve) {
      var win = frame && frame.contentWindow;
      var docEl = win && win.document ? win.document.querySelector('[contenteditable="true"]') : null;
      var editor = docEl && docEl.editor;
      if (!editor) { resolve({ ok: false, error: '编辑器未就绪', imgCount: 0 }); return; }
      
      // 去掉插图标记后写入文字
      var cleanText = String(newText || '').replace(/【插图\d+：[^】]+】/g, '');
      var ag = genOfficeAppendAll(frame, cleanText);
      if (!ag.ok) { resolve({ ok: false, error: ag.error, imgCount: 0 }); return; }
      
      // 串行生成每张图片
      var idx = 0;
      var imgCount = 0;
      var errors = [];
      
      function genNext() {
        if (idx >= markers.length) {
          resolve({ ok: true, imgCount: imgCount, errors: errors, summary: '已生成 ' + imgCount + ' 张插图' });
          return;
        }
        var marker = markers[idx++];
        var match = marker.match(/【插图(\d+)：([^】]+)】/);
        if (!match) { genNext(); return; }
        var desc = match[2].trim();
        
        // 调生图 API
        var recentImages = genOfficeCollectRecentImages(editor, 1);
        var body = { prompt: desc, n: 1, size: '1024x1024' };
        if (recentImages.length > 0) body.referenceImage = recentImages[0];
        
        fetch('/api/image-tools/ai-generate?api_key=dev-key-001', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
          body: JSON.stringify(body)
        }).then(function (r) { return r.json(); }).then(function (data) {
          if (!data || !data.ok || !data.options || !data.options.length) {
            errors.push('插图' + match[1] + '生成失败');
            genNext();
            return;
          }
          var opt = data.options[0];
          var imgData = opt.dataUrl || opt.image_url_output;
          if (!imgData) { errors.push('插图' + match[1] + '返回无图片数据'); genNext(); return; }
          
          // 转 dataUrl（如果是 http URL）
          var p = Promise.resolve(imgData);
          if (imgData.indexOf('data:') !== 0) {
            p = fetch(imgData).then(function (r2) { return r2.blob(); }).then(function (blob) {
              return new Promise(function (resolve2) {
                var fr = new FileReader();
                fr.onload = function () { resolve2(fr.result); };
                fr.readAsDataURL(blob);
              });
            });
          }
          
          p.then(function (dataUrl) {
            var node = {
              type: 'docProtected',
              attrs: {
                blockType: 'image',
                imageDataUrl: null,
                label: 'AI 插图 ' + match[1],
                previewText: 'AI 插图 ' + match[1],
                imageWidthPx: 320,
                imageHeightPx: null,
                genImage: { dataUrl: dataUrl, base64: dataUrl.split(',')[1], mime: opt.mime || 'image/png' }
              }
            };
            // 插入到文档末尾
            var pos = editor.state.doc.content.size;
            editor.chain().focus().insertContentAt(pos, node).run();
            imgCount++;
            genNext();
          }).catch(function (err) {
            errors.push('插图' + match[1] + '插入失败: ' + err.message);
            genNext();
          });
        }).catch(function (err) {
          errors.push('插图' + match[1] + '请求失败: ' + err.message);
          genNext();
        });
      }
      
      genNext();
    });
  }

  // v0.97: 批量生成插图并插入文档末尾（用于 appendAll 后自动配图）
  function genOfficeGenerateBatchImages(frame, count) {
    return new Promise(function (resolve) {
      var win = frame && frame.contentWindow;
      var docEl = win && win.document ? win.document.querySelector('[contenteditable="true"]') : null;
      var editor = docEl && docEl.editor;
      if (!editor) { resolve({ ok: false, error: '编辑器未就绪', imgCount: 0 }); return; }
      
      // 根据文档内容生成插图描述
      var docText = '';
      try {
        editor.state.doc.content.forEach(function (child) {
          if (child.type.name === 'docParagraph') {
            child.content.forEach(function (c) {
              if (c.text) docText += c.text + ' ';
            });
          }
        });
      } catch (e) { /* ignore */ }
      
      // 用文档前200字生成插图描述（简化版：直接用固定描述）
      var sceneDescs = [
        '一幅中国水墨风格插图，武侠场景，意境深远',
        '一幅中国水墨风格插图，武侠打斗场景，动感十足',
        '一幅中国水墨风格插图，武侠人物特写，神情坚毅',
        '一幅中国水墨风格插图，武侠场景，夜色笼罩',
        '一幅中国水墨风格插图，武侠场景，山水背景',
        '一幅中国水墨风格插图，武侠决战场景，气势磅礴'
      ];
      
      var idx = 0;
      var imgCount = 0;
      var errors = [];
      
      function genNext() {
        if (idx >= count) {
          resolve({ ok: true, imgCount: imgCount, errors: errors, summary: '已生成 ' + imgCount + ' 张插图' });
          return;
        }
        var desc = sceneDescs[idx] || '一幅中国水墨风格插图，武侠场景';
        var recentImages = genOfficeCollectRecentImages(editor, 1);
        var body = { prompt: desc, n: 1, size: '1024x1024' };
        if (recentImages.length > 0) body.referenceImage = recentImages[0];
        
        fetch('/api/image-tools/ai-generate?api_key=dev-key-001', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
          body: JSON.stringify(body)
        }).then(function (r) { return r.json(); }).then(function (data) {
          if (!data || !data.ok || !data.options || !data.options.length) {
            errors.push('插图' + (idx+1) + '生成失败');
            idx++; genNext();
            return;
          }
          var opt = data.options[0];
          var imgData = opt.dataUrl || opt.image_url_output;
          if (!imgData) { errors.push('插图' + (idx+1) + '返回无图片'); idx++; genNext(); return; }
          
          var p = Promise.resolve(imgData);
          if (imgData.indexOf('data:') !== 0) {
            p = fetch(imgData).then(function (r2) { return r2.blob(); }).then(function (blob) {
              return new Promise(function (resolve2) {
                var fr = new FileReader();
                fr.onload = function () { resolve2(fr.result); };
                fr.readAsDataURL(blob);
              });
            });
          }
          
          p.then(function (dataUrl) {
            var node = {
              type: 'docProtected',
              attrs: {
                blockType: 'image',
                imageDataUrl: null,
                label: 'AI 插图 ' + (idx+1),
                previewText: 'AI 插图 ' + (idx+1),
                imageWidthPx: 320,
                imageHeightPx: null,
                genImage: { dataUrl: dataUrl, base64: dataUrl.split(',')[1], mime: opt.mime || 'image/png' }
              }
            };
            var pos = editor.state.doc.content.size;
            editor.chain().focus().insertContentAt(pos, node).run();
            imgCount++;
            idx++;
            genNext();
          }).catch(function (err) {
            errors.push('插图' + (idx+1) + '插入失败: ' + err.message);
            idx++; genNext();
          });
        }).catch(function (err) {
          errors.push('插图' + (idx+1) + '请求失败: ' + err.message);
          idx++; genNext();
        });
      }
      
      genNext();
    });
  }

    // GenOffice Word UI：在第 blockIdx 段之后插入新段落（v0.96.2 P138）
  function genOfficeInsertAfter(frame, blockIdx, newText) {
    try {
      var win = frame && frame.contentWindow;
      var docEl = win && win.document ? win.document.querySelector('[contenteditable="true"]') : null;
      var editor = docEl && docEl.editor;
      if (!editor) return { ok: false, error: '编辑器未就绪' };
      var text = String(newText || '').trim();
      if (!text) return { ok: false, error: '没有要插入的内容' };
      var paras = [];
      editor.state.doc.content.forEach(function (node, offset) {
        var n = node.type.name;
        if (n === 'docParagraph' || n === 'docHeading' || n === 'docListItem') {
          paras.push({ node: node, offset: offset });
        }
      });
      var target = paras[blockIdx];
      if (!target) return { ok: false, error: '段落不存在: ' + blockIdx };
      // 插入位置 = 目标段落结束位置（offset + nodeSize）
      var insertPos = target.offset + target.node.nodeSize;
      var paragraphs = text.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
      var content = paragraphs.map(function (p) {
        return { type: 'docParagraph', content: [{ type: 'text', text: p }] };
      });
      editor.chain()
        .insertContentAt(insertPos, content)
        .run();
      return { ok: true, afterBlock: blockIdx, appended: paragraphs.length };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // v0.96.9: 返回选中区域结束位置（ProseMirror 字符 pos）；无选区返回 -1
  // 实时 selection 优先，失焦时回退 iframe 内 host.html 缓存的最近非空选区（__acmsSelCache）
  function genOfficeSelectionInsertPos(win) {
    try {
      var docEl = win.document.querySelector('[contenteditable="true"]');
      var editor = docEl && docEl.editor;
      if (!editor) return -1;
      var sel = editor.state.selection;
      if (sel && !sel.empty && sel.to != null) return sel.to;
      var cache = win.__acmsSelCache;
      if (cache && cache.to != null) return cache.to;
      return -1;
    } catch (e) {
      return -1;
    }
  }

  // v0.96.9: 把新文本插入到用户选中区域之后（原文保留，用户自行对比取舍）
  // 润色/总结/改写结果走这个 op（insertAfterSelection）
  function genOfficeInsertAtSelection(frame, newText) {
    try {
      var win = frame && frame.contentWindow;
      var docEl = win && win.document ? win.document.querySelector('[contenteditable="true"]') : null;
      var editor = docEl && docEl.editor;
      if (!editor) return { ok: false, error: '编辑器未就绪' };
      var text = String(newText || '').trim();
      if (!text) return { ok: false, error: '没有要插入的内容' };
      var insertPos = genOfficeSelectionInsertPos(win);
      if (insertPos < 0) return { ok: false, error: '未检测到选中区域，请先选中文字' };
      var paragraphs = text.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
      var content = paragraphs.map(function (p) {
        return { type: 'docParagraph', content: [{ type: 'text', text: p }] };
      });
      editor.chain().focus().insertContentAt(insertPos, content).run();
      return { ok: true, inserted: paragraphs.length, atPos: insertPos };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // v0.96.9: 根据选中文字生成插图并插入到选中区域之后（异步，返回 Promise）
  // action: { op:'generateImage', prompt, summary? }
  // 链路：ACMS 生图服务 /api/image-tools/ai-generate（AGNES）→ dataUrl → docProtected 图片节点
  // 收集文档中已有的 AI 插图（最多 maxCount 张）作为风格参考
  function genOfficeCollectRecentImages(editor, maxCount) {
    var images = [];
    editor.state.doc.content.forEach(function (child) {
      if (images.length >= (maxCount || 2)) return;
      if (child.type.name === 'docProtected' && child.attrs.blockType === 'image') {
        var gi = child.attrs.genImage;
        if (gi && (gi.dataUrl || gi.base64)) {
          var dataUrl = gi.dataUrl || ('data:image/png;base64,' + gi.base64);
          images.push(dataUrl);
        }
      }
    });
    return images;
  }
  function genOfficeGenerateImage(frame, action) {
    var win = frame && frame.contentWindow;
    var docEl = win && win.document ? win.document.querySelector('[contenteditable="true"]') : null;
    var editor = docEl && docEl.editor;
    if (!editor) return Promise.resolve({ ok: false, error: '编辑器未就绪' });
    var prompt = String(action.prompt || '').trim();
    if (!prompt) return Promise.resolve({ ok: false, error: '缺少插图描述 prompt' });
    var insertPos = genOfficeSelectionInsertPos(win);
    // v0.97: 无选区时（如"写文章+配图"全文生成任务），插入到文档末尾
    if (insertPos < 0) {
      insertPos = editor.state.doc.content.size;
    }
    // 清理文档中所有 loading 状态的占位节点（防止保存时带入）
    var doc = editor.state.doc;
    var positionsToRemove = [];
    doc.content.forEach(function (child, offset) {
      if (child.type.name === 'docProtected' && child.attrs.blockType === 'image' && child.attrs.genImage && child.attrs.genImage.loading) {
        positionsToRemove.push(offset);
      }
    });
    if (positionsToRemove.length > 0) {
      console.log('[IMG-DEBUG] cleaning', positionsToRemove.length, 'loading placeholders before save');
      positionsToRemove.forEach(function (pos) {
        editor.chain().focus().deleteRange({ from: pos, to: pos + 1 }).run();
      });
    }
    // 收集已有的 AI 插图作为风格参考（最多 2 张）
    var recentImages = genOfficeCollectRecentImages(editor, 2);
    console.log('[IMG-DEBUG] recentImages count:', recentImages.length);
    var body = { prompt: prompt, n: 1, size: '1024x1024' };
    if (recentImages.length > 0) {
      body.referenceImage = recentImages[recentImages.length - 1];
      console.log('[IMG-DEBUG] using reference image, length:', body.referenceImage.length);
    }
    // 插入占位节点显示"生成中..."
    var placeholderNode = {
      type: 'docProtected',
      attrs: {
        blockType: 'image',
        imageDataUrl: null,
        label: 'AI 插图',
        previewText: '正在生成插图...',
        imageWidthPx: 320,
        imageHeightPx: 200,
        genImage: { loading: true, mime: 'image/png' }
      }
    };
    editor.chain().focus().insertContentAt(insertPos, placeholderNode).run();
    console.log('[IMG-DEBUG] placeholder inserted at', insertPos, 'loading:', placeholderNode.attrs.genImage.loading);
    // 调 ACMS 生图服务（与 office-action 同款鉴权）
    return fetch('/api/image-tools/ai-generate?api_key=dev-key-001', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (!data || !data.ok || !data.options || !data.options.length) {
        return { ok: false, error: (data && data.error) || '生图失败' };
      }
      var opt = data.options[0];
      var imgData = opt.dataUrl || opt.image_url_output;
      if (!imgData) return { ok: false, error: '生图返回缺少图片数据' };
      var p = Promise.resolve(imgData);
      // 非 data URI（http URL，如 CDN）→ 前端 fetch 转 base64（CDN 一般开 CORS）
      if (imgData.indexOf('data:') !== 0) {
        p = fetch(imgData).then(function (r2) { return r2.blob(); }).then(function (blob) {
          return new Promise(function (resolve) {
            var fr = new FileReader();
            fr.onload = function () { resolve(fr.result); };
            fr.readAsDataURL(blob);
          });
        });
      }
      return p.then(function (dataUrl) {
        console.log('[IMG-DEBUG] genOfficeGenerateImage: dataUrl length=', dataUrl.length, 'mime=', opt.mime);
        var node = {
          type: 'docProtected',
          attrs: {
            blockType: 'image',
            imageDataUrl: null,
            label: 'AI 插图',
            previewText: 'AI 插图: ' + prompt.slice(0, 40),
            imageWidthPx: 320,
            imageHeightPx: null,
            genImage: { dataUrl: dataUrl, base64: dataUrl.split(',')[1], mime: opt.mime || 'image/png' }
          }
        };
        console.log('[IMG-DEBUG] image generated, dataUrl length=', node.attrs.genImage.dataUrl.length);
        // 替换占位节点（找到 loading 状态的节点并替换）
        var doc = editor.state.doc;
        var targetPos = -1;
        var foundNode = null;
        doc.content.forEach(function (child, offset) {
          if (targetPos >= 0) return;
          if (child.type.name === 'docProtected' && child.attrs.blockType === 'image') {
            var isPlaceholder = !!(child.attrs.genImage && child.attrs.genImage.loading);
            console.log('[IMG-DEBUG] found image node at', offset, ':', {
              isPlaceholder: isPlaceholder,
              hasLoading: !!child.attrs.genImage?.loading,
              imgLen: (child.attrs.imageDataUrl || '').length,
              label: child.attrs.label
            });
            if (isPlaceholder) {
              targetPos = offset;
              foundNode = child;
            }
          }
        });
        console.log('[IMG-DEBUG] targetPos for replacement:', targetPos, 'foundNode:', !!foundNode);
        if (targetPos >= 0) {
          // 删除旧节点，插入新节点
          var nodeSize = child.nodeSize;
          editor.chain().focus().deleteRange({ from: targetPos, to: targetPos + nodeSize }).run();
          editor.chain().focus().insertContentAt(targetPos, node).run();
        } else {
          editor.chain().focus().insertContentAt(insertPos, node).run();
        }
        // 验证插入后的状态
        setTimeout(() => {
          const doc = editor.state.doc;
          doc.content.forEach((child, offset) => {
            if (child.type.name === 'docProtected' && child.attrs.blockType === 'image') {
              console.log('[IMG-DEBUG] after insert, found image node at', offset, ':', {
                hasImage: !!child.attrs.imageDataUrl,
                imgLen: (child.attrs.imageDataUrl || '').length,
                hasGenImg: !!child.attrs.genImage,
                genImgLen: (child.attrs.genImage?.dataUrl || '').length,
                label: child.attrs.label
              });
            }
          });
        }, 100);
        return { ok: true, inserted: true, atPos: insertPos, imgSize: opt.size };
      });
    }).catch(function (err) {
      return { ok: false, error: err.message };
    });
  }

  // 收集 word 文档的段落节点（docParagraph/docHeading/docListItem），与 buildOfficeDocContext 索引一致
  function genOfficeBlockList(editor) {
    var paras = [];
    editor.state.doc.content.forEach(function (node, offset) {
      var n = node.type.name;
      if (n === 'docParagraph' || n === 'docHeading' || n === 'docListItem') {
        paras.push({ node: node, offset: offset });
      }
    });
    return paras;
  }

  // GenOffice Word UI：批量替换多个段落文本（v0.96.7，润色全文/改写多处）
  // operations: [{ blockIdx, newText }] — 每段独立事务，逐段重新定位（前面替换不改变段落数）
  function genOfficeProposeEdits(frame, operations) {
    try {
      var win = frame && frame.contentWindow;
      var docEl = win && win.document ? win.document.querySelector('[contenteditable="true"]') : null;
      var editor = docEl && docEl.editor;
      if (!editor) return { ok: false, error: '编辑器未就绪' };
      var ops = Array.isArray(operations) ? operations : [];
      if (!ops.length) return { ok: false, error: '没有要执行的替换操作' };
      var done = 0, errors = [];
      ops.forEach(function (op) {
        var blockIdx = op.blockIdx;
        var newText = String(op.newText != null ? op.newText : '').trim();
        if (!newText) { errors.push('第' + blockIdx + '段新文本为空'); return; }
        var paras = genOfficeBlockList(editor);
        var target = paras[blockIdx];
        if (!target) { errors.push('段落不存在: ' + blockIdx); return; }
        var fromPos = target.offset + 1;
        var toPos = target.offset + target.node.nodeSize - 1;
        editor.chain()
          .setTextSelection({ from: fromPos, to: toPos })
          .insertContent(String(newText))
          .run();
        done++;
      });
      return { ok: true, replaced: done, errors: errors };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // GenOffice Word UI：批量格式调整（v0.96.7，排版：标题层级/列表/加粗斜体/对齐/缩进）
  // operations: [{ blockIdx, format: { heading:0|1..9, bold, italic, strike, align, indentFirstLine, kind:'bullet'|'numbered'|'none' } }]
  // 只改格式不改文字；未提及字段保持原样；非法值跳过该字段并汇总
  function genOfficeFormatOps(frame, operations) {
    try {
      var win = frame && frame.contentWindow;
      var docEl = win && win.document ? win.document.querySelector('[contenteditable="true"]') : null;
      var editor = docEl && docEl.editor;
      if (!editor) return { ok: false, error: '编辑器未就绪' };
      var ops = Array.isArray(operations) ? operations : [];
      if (!ops.length) return { ok: false, error: '没有要执行的格式操作' };
      var done = 0, errors = [];
      ops.forEach(function (op) {
        var blockIdx = op.blockIdx;
        var fmt = op.format || {};
        var paras = genOfficeBlockList(editor);
        var target = paras[blockIdx];
        if (!target) { errors.push('段落不存在: ' + blockIdx); return; }
        var fromPos = target.offset + 1;
        var toPos = target.offset + target.node.nodeSize - 1;
        var chain = editor.chain().setTextSelection({ from: fromPos, to: toPos });
        var changed = false;
        // 1) 先属性（用当前节点类型名），再结构（setNode 可能改类型）
        if (fmt.align != null) {
          chain.updateAttributes(target.node.type.name, { align: String(fmt.align) });
          changed = true;
        }
        if (fmt.indentFirstLine != null) {
          var ifl = parseInt(fmt.indentFirstLine, 10);
          if (!isNaN(ifl) && ifl >= 0) {
            chain.updateAttributes(target.node.type.name, { indentFirstLine: ifl });
            changed = true;
          } else errors.push('第' + blockIdx + '段 indentFirstLine 非法: ' + fmt.indentFirstLine);
        }
        // v0.96.9: 段落级属性扩展（左右缩进/行距/段前段后/段落底纹）
        if (fmt.indentLeft != null) {
          var ilf = parseInt(fmt.indentLeft, 10);
          if (!isNaN(ilf) && ilf >= 0) { chain.updateAttributes(target.node.type.name, { indentLeft: ilf }); changed = true; }
          else errors.push('第' + blockIdx + '段 indentLeft 非法: ' + fmt.indentLeft);
        }
        if (fmt.indentRight != null) {
          var irf = parseInt(fmt.indentRight, 10);
          if (!isNaN(irf) && irf >= 0) { chain.updateAttributes(target.node.type.name, { indentRight: irf }); changed = true; }
          else errors.push('第' + blockIdx + '段 indentRight 非法: ' + fmt.indentRight);
        }
        if (fmt.lineSpacing != null) {
          var lsf = parseFloat(fmt.lineSpacing);
          if (!isNaN(lsf) && lsf > 0) { chain.updateAttributes(target.node.type.name, { lineSpacing: lsf }); changed = true; }
          else errors.push('第' + blockIdx + '段 lineSpacing 非法: ' + fmt.lineSpacing);
        }
        if (fmt.spaceBefore != null) {
          var sbf = parseInt(fmt.spaceBefore, 10);
          if (!isNaN(sbf) && sbf >= 0) { chain.updateAttributes(target.node.type.name, { spaceBefore: sbf }); changed = true; }
          else errors.push('第' + blockIdx + '段 spaceBefore 非法: ' + fmt.spaceBefore);
        }
        if (fmt.spaceAfter != null) {
          var saf = parseInt(fmt.spaceAfter, 10);
          if (!isNaN(saf) && saf >= 0) { chain.updateAttributes(target.node.type.name, { spaceAfter: saf }); changed = true; }
          else errors.push('第' + blockIdx + '段 spaceAfter 非法: ' + fmt.spaceAfter);
        }
        if (fmt.shadingFill != null) {
          var shf = String(fmt.shadingFill).replace(/^#/, '');
          if (/^[0-9a-fA-F]{6}$/.test(shf)) { chain.updateAttributes(target.node.type.name, { shadingFill: shf }); changed = true; }
          else errors.push('第' + blockIdx + '段 shadingFill 非法: ' + fmt.shadingFill);
        }
        // 2) 字符 marks（true=加，false=去）
        if (fmt.bold === true) { chain.setMark('bold'); changed = true; }
        else if (fmt.bold === false) { chain.unsetMark('bold'); changed = true; }
        if (fmt.italic === true) { chain.setMark('italic'); changed = true; }
        else if (fmt.italic === false) { chain.unsetMark('italic'); changed = true; }
        if (fmt.strike === true) { chain.setMark('strike'); changed = true; }
        else if (fmt.strike === false) { chain.unsetMark('strike'); changed = true; }
        if (fmt.underline === true) { chain.setMark('underline'); changed = true; }
        else if (fmt.underline === false) { chain.unsetMark('underline'); changed = true; }
        // v0.96.9: docTextStyle 字符级属性（字号/字体/颜色/高亮/字符底纹/上下标/大写）
        if (fmt.sizeHalfPoints != null) {
          var szf = parseInt(fmt.sizeHalfPoints, 10);
          if (!isNaN(szf) && szf >= 10 && szf <= 400) { chain.setMark('docTextStyle', { sizeHalfPoints: szf }); changed = true; }
          else errors.push('第' + blockIdx + '段 sizeHalfPoints 非法: ' + fmt.sizeHalfPoints + '（范围 10-400 半磅）');
        }
        if (fmt.font != null) {
          var fnf = String(fmt.font).trim().slice(0, 50);
          if (fnf) { chain.setMark('docTextStyle', { font: fnf }); changed = true; }
          else errors.push('第' + blockIdx + '段 font 非法: ' + fmt.font);
        }
        if (fmt.color != null) {
          var colf = String(fmt.color).replace(/^#/, '');
          if (/^[0-9a-fA-F]{6}$/.test(colf)) { chain.setMark('docTextStyle', { color: colf }); changed = true; }
          else errors.push('第' + blockIdx + '段 color 非法: ' + fmt.color + '（需十六进制无#）');
        }
        if (fmt.highlight != null) {
          var hlf = String(fmt.highlight).replace(/^#/, '');
          if (/^[0-9a-fA-F]{6}$/.test(hlf)) { chain.setMark('docTextStyle', { highlight: hlf }); changed = true; }
          else errors.push('第' + blockIdx + '段 highlight 非法: ' + fmt.highlight);
        }
        if (fmt.shading != null) {
          var shg = String(fmt.shading).replace(/^#/, '');
          if (/^[0-9a-fA-F]{6}$/.test(shg)) { chain.setMark('docTextStyle', { shading: shg }); changed = true; }
          else errors.push('第' + blockIdx + '段 shading 非法: ' + fmt.shading);
        }
        if (fmt.vertAlign != null) {
          if (fmt.vertAlign === 'superscript' || fmt.vertAlign === 'subscript') { chain.setMark('docTextStyle', { vertAlign: fmt.vertAlign }); changed = true; }
          else errors.push('第' + blockIdx + '段 vertAlign 非法: ' + fmt.vertAlign + '（需 superscript/subscript）');
        }
        if (fmt.caps != null) {
          if (fmt.caps === 'all' || fmt.caps === 'small') { chain.setMark('docTextStyle', { caps: fmt.caps }); changed = true; }
          else errors.push('第' + blockIdx + '段 caps 非法: ' + fmt.caps + '（需 all/small）');
        }
        // 3) 结构：标题层级 / 列表类型
        if (fmt.heading != null) {
          var lvl = parseInt(fmt.heading, 10);
          if (lvl === 0) { chain.setNode('docParagraph'); changed = true; }
          else if (lvl >= 1 && lvl <= 9) { chain.setNode('docHeading', { level: lvl }); changed = true; }
          else errors.push('第' + blockIdx + '段 heading 非法: ' + fmt.heading);
        }
        if (fmt.kind != null) {
          if (fmt.kind === 'none') { chain.setNode('docParagraph'); changed = true; }
          else if (fmt.kind === 'bullet' || fmt.kind === 'numbered') { chain.setNode('docListItem', { kind: fmt.kind }); changed = true; }
          else errors.push('第' + blockIdx + '段 kind 非法: ' + fmt.kind);
        }
        if (changed) { chain.run(); done++; }
      });
      return { ok: true, formatted: done, errors: errors };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // v0.96.8: GenOffice Slides UI — 插入 SmartArt
  // action: { op:'addSmartart', slideIndex, layout, items, xPx?, yPx?, wPx?, hPx?, fitWidthPx? }
  // layout: 'list'|'process'|'cycle'|'hierarchy'|'pyramid'|'matrix'|'venn'
  // items: string[] (至少 2 项)
  function genOfficeAddSmartart(frame, action) {
    try {
      var win = frame && frame.contentWindow;
      if (!win || !win.slidesApi) return { ok: false, error: 'Slides editor 未就绪' };
      var slideIndex = action.slideIndex != null ? parseInt(action.slideIndex) : 0;
      var layout = String(action.layout || 'process');
      var items = Array.isArray(action.items) ? action.items.filter(function (t) { return t && String(t).trim(); }) : [];
      if (items.length < 2) return { ok: false, error: 'SmartArt 至少需要 2 个文本项' };
      
      // 使用 window.slidesApi.addSmartArt() API（GenOffice 原生接口）
      return win.slidesApi.addSmartArt({
        slideIndex: slideIndex,
        layout: layout,
        items: items
      });
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // v0.96.8: GenOffice Slides UI — 插入 3D 模型
  // action: { op:'insertModel3d', slideIndex, fileBase64, ext, name? }
  // 浏览器环境：通过 host.html 的 slides:insert-model3d 通道
  function genOfficeInsertModel3d(frame, action) {
    try {
      var win = frame && frame.contentWindow;
      if (!win || !win.__slidesEditor) return { ok: false, error: 'Slides editor 未就绪' };
      var ed = win.__slidesEditor;
      if (!action.fileBase64) return { ok: false, error: '缺少 fileBase64' };
      // 通过 host.html 已 patch 的 slides:insert-model3d 通道
      // 需要先写 fake state（host.html 的 patchBrowserFileOpen 会读取）
      var bytes = base64ToBytes(action.fileBase64);
      var ext = String(action.ext || 'glb').toLowerCase();
      var fakePath = '/tmp/fake-3d-model.' + ext;
      if (!win._slidesFakeFiles) win._slidesFakeFiles = {};
      if (!win._slidesFakeDialog) win._slidesFakeDialog = {};
      win._slidesFakeFiles[fakePath] = bytes;
      win._slidesFakeDialog.path = fakePath;
      // 调用 original handler
      var result = ed.call('slides:insert-model3d', { sender: { id: 'acms-buddy' }, slideIndex: action.slideIndex || 0 });
      // 清理 fake state
      delete win._slidesFakeFiles[fakePath];
      delete win._slidesFakeDialog;
      return result;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // 加载 GenOffice Word UI：iframe 完全隔离（不污染 ACMS 全局样式）
  async function loadGenOfficeWord(w, fileId, fileName) {
    // 清理旧 word-ui 实例（reload 换文件后旧 key 残留会误导 runAction 定位）
    Object.keys(state.instances).forEach(function (k) {
      var e = state.instances[k].editor;
      if (e && e.kind === 'word-ui') delete state.instances[k];
    });
    // 复用窗口时先卸载旧 iframe 内容
    var oldFrame = w.$c.querySelector('iframe.v3-genoffice-frame');
    if (oldFrame) {
      try { if (oldFrame.contentWindow && oldFrame.contentWindow.__unmount) oldFrame.contentWindow.__unmount(); } catch (e) { /* ignore */ }
      oldFrame.remove();
    }
    w.$c.innerHTML = '';
    var frame = document.createElement('iframe');
    frame.className = 'v3-genoffice-frame';
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block;';
    frame.src = BASE + 'word-ui/host.html?v=0.96.9b';
    w.$c.appendChild(frame);

    function patchOpenDocx(win) {
      // GenOffice desktop shim 的 openDocx() 默认返回 null（ Electron IPC stub ）
      // 浏览器环境需要注入真实文件选择逻辑
      if (!win) return;
      // 用闭包标记是否已 patch（防止重复 patch 报错）
      var patched = false;

      function doPatch() {
        if (!win.desktop || typeof win.desktop.openDocx !== 'function') {
          // desktop 还没就绪，继续等
          return false;
        }
        // 检查是否已经被我们的 patch 覆盖过（通过标记判断）
        if (win.desktop.__acmsPatched) {
          return true; // 已经是我们的 patch
        }
        try {
          win.desktop.openDocx = function () {
            return new Promise(function (resolve) {
              var inp = document.createElement('input');
              inp.type = 'file';
              inp.accept = '.docx';
              inp.onchange = function (ev2) {
                var file = ev2.target && ev2.target.files && ev2.target.files[0];
                if (!file) { resolve(null); return; }
                var reader = new FileReader();
                reader.onload = function (e2) {
                  resolve({ name: file.name, data: new Uint8Array(e2.target.result) });
                };
                reader.onerror = function () { resolve(null); };
                reader.readAsArrayBuffer(file);
              };
              inp.click();
            });
          };
          win.desktop.__acmsPatched = true;
          patched = true;
          console.info('[office-v3] patched desktop.openDocx for browser file pick');
          return true;
        } catch (e2) {
          console.warn('[office-v3] patchOpenDocx failed:', e2.message);
          return false;
        }
      }

      function tryPatch() {
        if (doPatch()) return; // patch 成功
        // desktop 还没就绪或被重建，继续监测
        var lastPatchCheck = Date.now();
        var interval = setInterval(function () {
          if (win.desktop && !win.desktop.__acmsPatched) {
            // desktop 被重建了（GenOffice mountWordUI 重新创建），重新 patch
            if (doPatch()) {
              clearInterval(interval);
              console.info('[office-v3] re-patched desktop.openDocx after rebuild');
            }
          } else if (win.desktop && win.desktop.__acmsPatched) {
            // 仍然 patched，没问题
          }
          // 最多监测 10 秒后停止
          if (Date.now() - lastPatchCheck > 10000) {
            clearInterval(interval);
          }
        }, 500);
      }
      tryPatch();
    }

    function initFrame() {
      var win = frame.contentWindow;
      if (!win || typeof win.__init !== 'function') return;
      patchOpenDocx(win);
      win.__init({ fileId: fileId || undefined, fileName: fileName || 'untitled.docx', apiKey: API_KEY })
        .then(function (r) {
          if (r && !r.ok) console.warn('[office-v3] GenOffice host init 失败:', r.error);
          // mount 完成后 re-patch：GenOffice 每次 mountWordUI 会重建 window.desktop，覆盖之前的 patch
          setTimeout(function () { patchOpenDocx(win); }, 500);
        })
        .catch(function (e) { console.warn('[office-v3] GenOffice host init 异常:', e.message); });
    }
    frame.addEventListener('load', initFrame);
    // 防御：若 load 已触发（缓存）而监听器没捕获
    setTimeout(function () {
      if (frame.contentWindow && frame.contentWindow.__ready && frame.contentWindow.__ready === true) {
        initFrame();
      }
    }, 500);

    // 窗口复用：重新加载新文件（调度层统一处理，见 makeWordLoader）
    // 窗口关闭：卸载 iframe
    w.onClose = function () {
      try { if (frame.contentWindow && frame.contentWindow.__unmount) frame.contentWindow.__unmount(); } catch (e) { /* ignore */ }
      frame.remove();
    };
    // 注册到 state.instances（runAction / buildOfficeDocContext 定位用）
    var key = fileId || ('__v3genword__' + Date.now());
    state.instances[key] = { editor: { kind: 'word-ui', fileId: fileId, fileName: fileName, iframe: frame } };
    return { kind: 'word-ui', fileId: fileId, fileName: fileName, iframe: frame };
  }

  // P132: 调度器——GenOffice UI 优先，禁用/失败回退自渲染 v3
  function makeWordLoader() {
    return async function loader(w, opts) {
      opts = opts || {};
      var args = arguments[1] || opts;
      var fileId = args.fileId;
      var fileName = args.fileName || 'untitled.docx';
      if (!w || !w.$c) return null;

      var useGen = genOfficeEnabled();
      var win = null;
      if (useGen) {
        try {
          win = await loadGenOfficeWord(w, fileId, fileName);
        } catch (err) {
          console.warn('[office-v3] GenOffice Word UI 加载失败，回退自渲染:', err.message);
          useGen = false;
        }
      }
      if (!useGen) {
        win = await makeWordSelfLoader()(w, opts);
      }
      // 窗口复用统一入口：重新检查开关
      w.reloadDocument = function (fid, fname) {
        if (!fid) return;
        console.info('[office-v3] word reloadDocument:', fid, fname);
        if (genOfficeEnabled()) {
          loadGenOfficeWord(w, fid, fname).catch(function (e) {
            console.warn('[office-v3] GenOffice reload 失败，回退自渲染:', e.message);
            w.$c.innerHTML = '';
            makeWordSelfLoader()(w, { fileId: fid, fileName: fname });
          });
        } else {
          w.$c.innerHTML = '';
          makeWordSelfLoader()(w, { fileId: fid, fileName: fname });
        }
      };
      return win;
    };
  }

  // 自渲染 v3（原 makeWordLoader 主体）
  function makeWordSelfLoader() {
    return async function loader(w, opts) {
      opts = opts || {};
      var args = arguments[1] || opts;
      var fileId = args.fileId;
      var fileName = args.fileName || 'untitled.docx';
      var isRemoteFile = !!fileId;
      var targetId = (fileId || 'new-' + Date.now()).replace(/[^a-zA-Z0-9]/g, '');
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
        // P5：AI 编辑入口 — 修改指定 block 的文本（DOM 同步 + dirty）
        proposeEdit: function (blockIdx, newText) {
          var entry = editor.blockEls[blockIdx];
          if (!entry) return { ok: false, error: 'block 不存在: ' + blockIdx };
          var inner = entry.el.querySelector('.v3-para-inner') || entry.el;
          // 保留第一个 run 的格式，替换文本
          var firstRun = (entry.block.runs || [])[0] || {};
          inner.innerHTML = runToHtml(Object.assign({}, firstRun, { text: String(newText) }));
          editor.dirty.add(blockIdx);
          entry.el.classList.add('v3-dirty');
          setStatus(editor.dirty.size + ' 段已修改');
          return { ok: true, blockIdx: blockIdx, newText: String(newText) };
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
      async function loadRemoteFile(fileId2, fileName2) {
        try {
          var dlName = encodeURIComponent(fileName2 || 'document.docx');
          var resp = await fetch('/api/office/download/' + encodeURIComponent(fileId2) + '/' + dlName + '?api_key=' + API_KEY);
          if (!resp.ok) throw new Error('下载文件失败 HTTP ' + resp.status);
          var bin = new Uint8Array(await resp.arrayBuffer());
          var engine = await loadWordEngine();
          var parsed = await engine.parseDocx(bin);
          editor.parsed = parsed;
          editor.fileId = fileId2;
          editor.fileName = fileName2;
          renderBlocks(parsed.blocks);
          var zhCount = (parsed.blocks || []).reduce(function (n, b) {
            return n + (b.runs || []).filter(function (r) { return /[\u4e00-\u9fff]/.test(r.text || ''); }).length;
          }, 0);
          var fnEl = w.$c.querySelector('.v3-tb-file');
          if (fnEl) fnEl.textContent = fileName2;
          setStatus('✅ ' + (parsed.blocks || []).length + ' 块 / ' + zhCount + ' 中文 run');
        } catch (err) {
          console.error('[office-v3] load failed:', err);
          page.innerHTML = '<div class="v3-error">❌ 加载失败：' + esc(err.message) + '</div>';
        }
      }

      if (isRemoteFile) {
        await loadRemoteFile(fileId, fileName);
      } else {
        setStatus('新文档（未加载）');
      }

      // 窗口复用（P3）——由 makeWordLoader 调度层统一处理（P132：需重查 GenOffice 开关）
      // 这里不覆盖 w.reloadDocument，避免自渲染版覆盖调度版

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
    // Excel：保存 v2 loader 引用（覆盖前），GenOffice UI 优先，失败回退 v2
    var legacyExcelLoader = null;
    try { legacyExcelLoader = ACMSWin._getLoader('office-xlsx'); } catch (e) { /* ignore */ }
    ACMSWin.registerViewLoader('office-v3-xlsx', makeExcelLoader(legacyExcelLoader));
    ACMSWin.registerViewLoader('office-xlsx', makeExcelLoader(legacyExcelLoader));  // 覆盖旧名（P119 模式）

    // Word：GenOffice UI 优先，失败回退自渲染 v3（P119 覆盖旧名）
    var wordLoader = makeWordLoader();
    ACMSWin.registerViewLoader('office-v3-word', wordLoader);
    ACMSWin.registerViewLoader('office-word', wordLoader);  // 覆盖 office-v2-bridge 的注册

    // Slides：自渲染 v3
    var slidesLoader = makeSlidesLoader();
    ACMSWin.registerViewLoader('office-v3-slides', slidesLoader);
    ACMSWin.registerViewLoader('office-pptx', slidesLoader);  // 覆盖 office-v2-bridge 的注册

    console.info('[office-v3] word + slides + excel loaders registered (覆盖 office-word/office-pptx/office-xlsx)');
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
    // P5：小吉统一动作入口 — 找到目标实例并执行编辑
    // action: { kind:'word'|'slides'|'xlsx', fileId?, op, args }
    runAction: function (action) {
      if (!action || !action.kind) return { ok: false, error: '缺少 kind' };
      try {
        if (action.kind === 'xlsx') {
          // GenOffice sheets-ui 优先（iframe 内 __sheetsAI）
          var sheetsInst = null;
          var keys2 = Object.keys(state.instances);
          for (var i2 = 0; i2 < keys2.length; i2++) {
            var e2 = state.instances[keys2[i2]].editor;
            if (e2 && e2.kind === 'sheets-ui') { sheetsInst = state.instances[keys2[i2]]; break; }
          }
          var sheetsWin = sheetsInst && sheetsInst.editor && sheetsInst.editor.iframe && sheetsInst.editor.iframe.contentWindow;
          var sheetsAI = sheetsWin && sheetsWin.__sheetsAI;
          if (sheetsAI) {
            if (action.op === 'propose') {
              try {
                var pr = sheetsAI.propose(action.operations || [], action.summary || '小吉编辑');
                if (!pr || !pr.ok) return { ok: false, error: (pr && pr.error) || '生成计划失败' };
                // GenOffice 语义：立即应用 + [撤销]（对齐 AiChatPanel auto-applied）
                var ap2 = sheetsAI.applyPlan(pr.plan);
                if (ap2 && ap2.error) return { ok: false, error: ap2.error };
                return { ok: true, plan: pr.plan, summary: action.summary || '已应用 ' + (action.operations || []).length + ' 个操作', undo: function () { try { sheetsAI.undo(); return { ok: true }; } catch (err) { return { ok: false, error: err.message }; } } };
              } catch (err) {
                return { ok: false, error: err.message };
              }
            }
            if (action.op === 'applyPlan' && action.plan) {
              try {
                var ap = sheetsAI.applyPlan(action.plan);
                if (ap && ap.error) return { ok: false, error: ap.error };
                return { ok: true, summary: '已应用', undo: function () { try { sheetsAI.undo(); return { ok: true }; } catch (err) { return { ok: false, error: err.message }; } } };
              } catch (err) {
                return { ok: false, error: err.message };
              }
            }
            if (action.op === 'undo') {
              try { sheetsAI.undo(); return { ok: true, summary: '已撤销' }; } catch (err) { return { ok: false, error: err.message }; }
            }
            return { ok: false, error: '未知 xlsx 操作: ' + action.op };
          }
          // 回退 v2 XlsxAI
          if (typeof window.XlsxAI === 'undefined' || !window.XlsxAI.getSnapshot()) {
            return { ok: false, error: '工作簿未加载（请先打开 Excel 文件）' };
          }
          if (action.op === 'propose') {
            return window.XlsxAI.propose(action.operations || [], action.summary || '小吉编辑');
          }
          if (action.op === 'undo') return window.XlsxAI.undo();
          if (action.op === 'redo') return window.XlsxAI.redo();
          return { ok: false, error: '未知 xlsx 操作: ' + action.op };
        }
        // word / slides：按 fileId 或 kind 找实例（word 请求命中 GenOffice word-ui 实例）
        var inst = null;
        var keys = Object.keys(state.instances);
        if (action.fileId && state.instances[action.fileId]) {
          inst = state.instances[action.fileId];
        } else {
          for (var i = 0; i < keys.length; i++) {
            var e = state.instances[keys[i]].editor;
            if (e && (e.kind === action.kind || (action.kind === 'word' && e.kind === 'word-ui') || (action.kind === 'slides' && e.kind === 'slides-ui'))) { inst = state.instances[keys[i]]; break; }
          }
        }
        if (!inst || !inst.editor) return { ok: false, error: '没有打开的 ' + action.kind + ' 编辑器' };
        var ed = inst.editor;
        // v0.96.2/v0.97: appendAll — 在文档末尾追加新内容（word/slides）
        // v0.97: 支持【插图N：画面描述】标记，自动调生图 API 并插入图片
        if (action.op === 'appendAll') {
          if (ed.kind === 'word-ui') {
            var ag = genOfficeAppendAll(ed.iframe, action.newText);
            if (!ag.ok) return ag;
            // v0.97: 解析插图标记
            // v0.97: 兼容多种插图标记格式：【插图N：xxx】或【此处可插入插图：xxx】
            var imgMarkers = [];
            var rawText = String(action.newText || '');
            var markerRegex = /【(?:插图\d*：|此处可插入插图：)([^】]+)】/g;
            var m;
            var imgIdx = 0;
            while ((m = markerRegex.exec(rawText)) !== null) {
              imgIdx++;
              imgMarkers.push('【插图' + imgIdx + '：' + m[1] + '】');
            }
            // v0.97: 如果后端指示需要配图（action.needImages），自动在文档末尾生成图片
            if (action.needImages && action.needImages > 0) {
              return genOfficeGenerateBatchImages(ed.iframe, action.needImages).then(function (res) {
                return {
                  ok: true,
                  summary: (res.summary || '已追加内容并生成 ' + res.imgCount + ' 张插图'),
                  pendingSave: true,
                };
              });
            }
            // v0.97: 如果 newText 里有插图标记，也自动配图
            if (imgMarkers.length > 0) {
              return genOfficeAppendAllWithImages(ed.iframe, action.newText, imgMarkers).then(function (res) {
                return {
                  ok: true,
                  summary: (res.summary || '已追加内容并生成 ' + res.imgCount + ' 张插图'),
                  pendingSave: true,
                };
              });
            }
            return {
              ok: true,
              summary: action.summary || '已追加 ' + (ag.appended || 1) + ' 段到文档末尾',
              pendingSave: true,
              undo: function () { return { ok: true, note: '文本编辑请用 Ctrl+Z' }; },
            };
          }
          // slides: 直接操作 opened.deck（参考 proposeEdit 的写法）
          if (ed.kind === 'slides' && ed.opened && ed.opened.deck) {
            try {
              var deck = ed.opened.deck;
              var slide = deck.slides[ed.slideIdx] || deck.slides[0];
              if (!slide || !slide.elements) return { ok: false, error: '当前幻灯片无效' };
              // 在末尾追加一个文本元素（textBox）
              var txt = String(action.newText || '').trim();
              if (!txt) return { ok: false, error: '没有要追加的内容' };
              slide.elements.push({ type: 'text', text: { paragraphs: [{ runs: [{ text: txt }] }] } });
              ed.dirtyEls && ed.dirtyEls.add(slide);
              return {
                ok: true,
                summary: action.summary || '已追加文本到幻灯片末尾',
                pendingSave: ed.dirtyEls && ed.dirtyEls.size > 0,
                undo: function () { return { ok: true, note: '请用 Ctrl+Z' }; },
              };
            } catch (err) {
              return { ok: false, error: err.message };
            }
          }
          return { ok: false, error: '当前编辑器不支持 appendAll' };
        }
        // v0.96.2 (P138): insertAfter — 在指定 blockIdx 段之后插入新段落（word/slides）
        if (action.op === 'insertAfter') {
          if (ed.kind === 'word-ui') {
            var ig = genOfficeInsertAfter(ed.iframe, action.blockIdx, action.newText);
            if (!ig.ok) return ig;
            return {
              ok: true,
              summary: action.summary || '已在第 ' + action.blockIdx + ' 段后插入 ' + (ig.appended || 1) + ' 段',
              pendingSave: true,
              undo: function () { return { ok: true, note: '文本编辑请用 Ctrl+Z' }; },
            };
          }
          // slides: 在第 textBoxIdx 个文本框之后插入新文本框
          if (ed.kind === 'slides' && ed.opened && ed.opened.deck) {
            try {
              var deck2 = ed.opened.deck;
              var slide2 = deck2.slides[ed.slideIdx] || deck2.slides[0];
              if (!slide2 || !slide2.elements) return { ok: false, error: '当前幻灯片无效' };
              var txt2 = String(action.newText || '').trim();
              if (!txt2) return { ok: false, error: '没有要插入的内容' };
              var textBoxes = slide2.elements.filter(function (el) { return el.text; });
              var idx2 = action.textBoxIdx != null ? action.textBoxIdx : (typeof action.blockIdx === 'number' ? action.blockIdx : textBoxes.length - 1);
              // 按 textBoxes 索引定位插入点
              var insertAt = idx2 + 1;
              slide2.elements.splice(insertAt, 0, { type: 'text', text: { paragraphs: [{ runs: [{ text: txt2 }] }] } });
              ed.dirtyEls && ed.dirtyEls.add(slide2);
              return {
                ok: true,
                summary: action.summary || '已在文本框 ' + idx2 + ' 后插入',
                pendingSave: ed.dirtyEls && ed.dirtyEls.size > 0,
                undo: function () { return { ok: true, note: '请用 Ctrl+Z' }; },
              };
            } catch (err) {
              return { ok: false, error: err.message };
            }
          }
          return { ok: false, error: '当前编辑器不支持 insertAfter' };
        }
        // v0.96.9: insertAfterSelection — 把新文本插入到用户选中区域之后（润色/总结/改写，原文保留）
        if (action.op === 'insertAfterSelection') {
          if (ed.kind === 'word-ui') {
            var isg = genOfficeInsertAtSelection(ed.iframe, action.newText);
            if (!isg.ok) return isg;
            return {
              ok: true,
              summary: action.summary || '已插入到选中文字之后',
              pendingSave: true,
              undo: function () { return { ok: true, note: '文本编辑请用 Ctrl+Z' }; },
            };
          }
          return { ok: false, error: '当前编辑器不支持 insertAfterSelection' };
        }
        // v0.96.9/v0.97: generateImage — 根据 prompt 生成插图并插入（有选区插到选区后，无选区插到文档末尾）
        // ⚠️ 返回 Promise：调用方（host.html runner/右键菜单、agent-buddy.js）需 await / Promise.resolve
        if (action.op === 'generateImage') {
          if (ed.kind === 'word-ui') {
            return genOfficeGenerateImage(ed.iframe, action).then(function (gi) {
              if (gi && gi.ok) {
                return { ok: true, summary: action.summary || '已生成插图并插入', pendingSave: true };
              }
              return { ok: false, error: (gi && gi.error) || '插图生成失败' };
            });
          }
          return Promise.resolve({ ok: false, error: '当前编辑器不支持 generateImage' });
        }
        if (action.op === 'proposeEdits') {
          // v0.96.7: 批量替换多个段落（润色全文/改写多处）
          if (ed.kind === 'word-ui') {
            var pe = genOfficeProposeEdits(ed.iframe, action.operations);
            if (!pe.ok) return pe;
            return {
              ok: true,
              summary: action.summary || '已润色 ' + (pe.replaced || 0) + ' 段' + (pe.errors && pe.errors.length ? '（' + pe.errors.length + ' 段跳过）' : ''),
              pendingSave: true,
              undo: function () { return { ok: true, note: '文本编辑请用 Ctrl+Z' }; },
            };
          }
          return { ok: false, error: '当前编辑器不支持 proposeEdits' };
        }
        if (action.op === 'formatOps') {
          // v0.96.7: 批量格式调整（排版：标题层级/列表/加粗斜体/对齐/缩进）
          if (ed.kind === 'word-ui') {
            var fo = genOfficeFormatOps(ed.iframe, action.operations);
            if (!fo.ok) return fo;
            return {
              ok: true,
              summary: action.summary || '已调整 ' + (fo.formatted || 0) + ' 段格式' + (fo.errors && fo.errors.length ? '（' + fo.errors.length + ' 段跳过）' : ''),
              pendingSave: true,
              undo: function () { return { ok: true, note: '格式编辑请用 Ctrl+Z' }; },
            };
          }
          return { ok: false, error: '当前编辑器不支持 formatOps' };
        }
        if (action.op === 'proposeEdit') {
          // GenOffice Word UI（iframe 内 Tiptap）：走 commands 替换段落
          if (ed.kind === 'word-ui') {
            var g = genOfficeProposeEdit(ed.iframe, action.blockIdx, action.newText);
            if (!g.ok) return g;
            return {
              ok: true,
              summary: action.summary || '已修改第 ' + action.blockIdx + ' 段',
              pendingSave: true,
              undo: function () { return { ok: true, note: '文本编辑请用 Ctrl+Z' }; },
            };
          }
          var idx = ed.kind === 'slides' ? action.textBoxIdx : action.blockIdx;
          var r = ed.proposeEdit(idx, action.newText);
          if (!r.ok) return r;
          return {
            ok: true,
            summary: action.summary || (action.kind === 'word'
              ? '已修改第 ' + action.blockIdx + ' 段'
              : '已修改文本框 ' + (action.textBoxIdx != null ? action.textBoxIdx : '')),
            pendingSave: ed.dirty && ed.dirty.size > 0 || ed.dirtyEls && ed.dirtyEls.size > 0,
            undo: function () { /* 无快照栈：标记为待人工撤销，回滚用会话级 journal 后置 */ return { ok: true, note: '文本编辑请用 Ctrl+Z' }; },
          };
        }
        if (action.op === 'save') {
          // 触发保存：word/slides 各自的保存流程
          var saveBtn = document.querySelector('#' + (ed.domId || '') + ' .v3-tb-save') ||
                        (ed._saveEl || null);
          if (saveBtn) { saveBtn.click(); return { ok: true, summary: '已触发保存' }; }
          return { ok: false, error: '未找到保存按钮' };
        }
        // v0.96.8: addSmartart — 在幻灯片上插入 SmartArt（直接调 GenOffice IPC）
        if (action.op === 'addSmartart') {
          if (ed.kind === 'slides-ui') {
            var sa = genOfficeAddSmartart(ed.iframe, action);
            if (!sa.ok) return sa;
            return { ok: true, summary: action.summary || '已插入 SmartArt', pendingSave: true };
          }
          return { ok: false, error: '当前编辑器不支持 addSmartart（需 GenOffice Slides UI）' };
        }
        // v0.96.8: insertModel3d — 在幻灯片上插入 3D 模型（直接调 GenOffice IPC）
        if (action.op === 'insertModel3d') {
          if (ed.kind === 'slides-ui') {
            var m3d = genOfficeInsertModel3d(ed.iframe, action);
            if (!m3d.ok) return m3d;
            return { ok: true, summary: action.summary || '已插入 3D 模型', pendingSave: true };
          }
          return { ok: false, error: '当前编辑器不支持 insertModel3d（需 GenOffice Slides UI）' };
        }
        return { ok: false, error: '未知操作: ' + action.op };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  };
})();
