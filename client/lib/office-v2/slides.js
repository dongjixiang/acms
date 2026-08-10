// ACMS PPT Editor v1 — 基于 Reveal.js 的演示文稿编辑器
// 功能：创建/编辑幻灯片、插入文本/图片/表格、保存为 .pptx、打开 .pptx
// 导出：mountSlides(targetId) -> { reveal, editor, destroy }

// ── PPTX 解析（前端 AdmZip）────────────────────────────────────────────
function parsePptxToSchema(buf) {
  var zip = new AdmZip(buf);
  var imageMap = {};
  zip.getEntries().forEach(function(e) {
    if (e.entryName.match(/^ppt\/media\//) && /\.(png|jpg|jpeg|gif|bmp)$/i.test(e.entryName)) {
      var ext = e.entryName.replace(/.*\./, '').toLowerCase();
      var mime = {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',bmp:'image/bmp'}[ext] || 'image/png';
      imageMap[e.entryName] = 'data:' + mime + ';base64,' + e.getData().toString('base64');
    }
  });

  var presXml = zip.readAsText('ppt/presentation.xml');
  var presObj = parseXml(presXml);
  var pres = presObj['p:presentation'];
  var slideIds = [];
  if (pres && pres['p:sldIdLst']) {
    var ids = pres['p:sldIdLst']['p:sldId'];
    if (!Array.isArray(ids)) ids = [ids];
    ids.forEach(function(sid) { if (sid['@_r:id']) slideIds.push(sid['@_r:id']); });
  }

  var relsXml = zip.readAsText('ppt/_rels/presentation.xml.rels') || '';
  var relsObj = parseXml(relsXml);
  var relMap = {};
  var rels = relsObj['Relationships'] && relsObj['Relationships']['Relationship'];
  if (rels) { if (!Array.isArray(rels)) rels = [rels]; }
  (rels || []).forEach(function(r) {
    if (r['@_Id'] && r['@_Target']) relMap[r['@_Id']] = r['@_Target'];
  });

  var slides = [];
  slideIds.forEach(function(rid) {
    var slideFile = relMap[rid];
    if (!slideFile) return;
    var slideXml = zip.readAsText('ppt/' + slideFile);
    if (!slideXml) return;
    var slideObj = parseXml(slideXml);
    var sld = slideObj['p:sld'];
    if (!sld) return;
    var cSld = sld['p:cSld'];
    if (!cSld) return;
    var spTree = cSld['p:spTree'];
    if (!spTree) return;

    var titleText = '';
    var bodyText = '';
    var layout = 'content';
    var shapes = spTree['p:sp'] || [];
    if (!Array.isArray(shapes)) shapes = [shapes];
    shapes.forEach(function(sp) {
      var nvSpPr = sp['p:nvSpPr'];
      if (!nvSpPr) return;
      var nvPr = nvSpPr['p:nvPr'];
      if (!nvPr) return;
      var ph = nvPr['p:ph'];
      var phType = ph ? (ph['@_type'] || '') : '';
      var txBody = sp['p:txBody'];
      if (!txBody) return;
      var paragraphs = txBody['a:p'] || [];
      if (!Array.isArray(paragraphs)) paragraphs = [paragraphs];
      var texts = [];
      paragraphs.forEach(function(p) {
        var runs = p['a:r'] || [];
        if (!Array.isArray(runs)) runs = [runs];
        runs.forEach(function(r) {
          if (r['a:t']) texts.push(r['a:t']);
        });
      });
      var innerText = texts.join(' ');
      var nameAttr = nvSpPr['p:nvCnPr'] && nvSpPr['p:nvCnPr']['p:cNvPr'] ? (nvSpPr['p:nvCnPr']['p:cNvPr']['@_name'] || '') : '';
      if (phType === 'title' || (nameAttr.indexOf('标题') >= 0 && nameAttr.indexOf('副标题') < 0) || nameAttr.indexOf('Title') >= 0) {
        titleText = innerText;
        layout = 'cover';
      } else if (phType === 'body' || nameAttr.indexOf('正文') >= 0 || nameAttr.indexOf('Content') >= 0) {
        bodyText = innerText;
        layout = 'content';
      } else if (!phType && !nameAttr && innerText) {
        bodyText = bodyText ? bodyText + '\n' + innerText : innerText;
      }
    });

    // 提取表格
    var tables = [];
    var graphicFrames = spTree['p:graphicFrame'] || [];
    if (!Array.isArray(graphicFrames)) graphicFrames = [graphicFrames];
    graphicFrames.forEach(function(gf) {
      var graphic = gf['a:graphic'];
      if (!graphic) return;
      var graphicData = graphic['a:graphicData'];
      if (!graphicData) return;
      var tbl = graphicData['a:tbl'];
      if (!tbl) return;
      var tableData = { rows: [] };
      var gridCols = tbl['a:tblGrid'] && tbl['a:tblGrid']['a:gridCol'];
      if (gridCols) { if (!Array.isArray(gridCols)) gridCols = [gridCols]; tableData.cols = gridCols.length; }
      var rows = tbl['a:tr'] || [];
      if (!Array.isArray(rows)) rows = [rows];
      rows.forEach(function(row) {
        var cells = row['a:tc'] || [];
        if (!Array.isArray(cells)) cells = [cells];
        var rowData = [];
        cells.forEach(function(cell) {
          var txBody = cell['a:txBody'];
          var cellText = '';
          if (txBody) {
            var paras = txBody['a:p'] || [];
            if (!Array.isArray(paras)) paras = [paras];
            paras.forEach(function(p) {
              var rs = p['a:r'] || [];
              if (!Array.isArray(rs)) rs = [rs];
              rs.forEach(function(r) { if (r['a:t']) cellText += r['a:t']; });
            });
          }
          rowData.push(cellText);
        });
        tableData.rows.push(rowData);
      });
      tables.push(tableData);
    });

    // 提取图片
    var baseName = slideFile.split('/').pop();
    var relsFileName = baseName.replace('.xml', '.xml.rels');
    var relsPath = 'ppt/slides/_rels/' + relsFileName;
    var relsXml2 = zip.readAsText(relsPath) || '';
    var relsObj2 = parseXml(relsXml2);
    var rels2 = relsObj2['Relationships'] && relsObj2['Relationships']['Relationship'];
    if (rels2) { if (!Array.isArray(rels2)) rels2 = [rels2]; }
    var images = [];
    (rels2 || []).forEach(function(r) {
      if (r['@_Type'] && r['@_Type'].indexOf('image') >= 0 && r['@_Target']) {
        var imgName = r['@_Target'].split('/').pop();
        var imgEntry = 'ppt/media/' + imgName;
        if (imageMap[imgEntry]) images.push({ rid: r['@_Id'], src: imageMap[imgEntry] });
      }
    });

    if (titleText || bodyText) {
      slides.push({
        title: titleText || '标题',
        content: bodyText || '',
        layout: layout,
        images: images,
        tables: tables
      });
    }
  });

  return slides.length > 0 ? JSON.stringify({ slides: slides }) : null;
}

function parseXml(str) {
  if (typeof window.DOMParser !== 'undefined') {
    var doc = new DOMParser().parseFromString(str, 'text/xml');
    return xmlDocToObj(doc);
  }
  return {};
}

function xmlDocToObj(doc) {
  var result = {};
  function processNode(node, obj) {
    if (node.nodeType === 3) return; // text node
    var name = node.nodeName;
    var val = null;
    if (node.attributes) {
      var attrs = {};
      for (var i = 0; i < node.attributes.length; i++) {
        attrs[node.attributes[i].nodeName] = node.attributes[i].nodeValue;
      }
      if (Object.keys(attrs).length > 0) val = attrs;
    }
    if (node.childNodes.length === 0) {
      obj[name] = val !== null ? val : (node.textContent || '');
    } else if (node.childNodes.length === 1 && node.childNodes[0].nodeType === 3) {
      obj[name] = val !== null ? val : node.childNodes[0].textContent;
    } else {
      var childObj = {};
      for (var j = 0; j < node.childNodes.length; j++) {
        processNode(node.childNodes[j], childObj);
      }
      obj[name] = val !== null ? val : childObj;
    }
  }
  processNode(doc.documentElement, result);
  return result;
}

// ── PPTX 导出（PptxGenJS）──────────────────────────────────────────────
function buildPptxGenJS(slides) {
  var PptxGenJS = window.pptxgen;
  if (!PptxGenJS) throw new Error('PptxGenJS not loaded');
  var pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';

  slides.forEach(function(slide) {
    var pptSlide = pptx.addSlide();
    pptSlide.background = { color: 'FFFFFF' };

    // 标题
    if (slide.title) {
      var titleOpts = { x: 0.5, y: 0.3, w: 9, h: 0.8 };
      if (slide.layout === 'cover') {
        titleOpts = { x: 0.5, y: 2, w: 9, h: 1.2, fontSize: 36, bold: true, align: 'center' };
      }
      pptSlide.addText(slide.title, titleOpts);
    }

    // 内容
    if (slide.content) {
      var contentText = slide.content.replace(/<[^>]+>/g, '').replace(/\n/g, '\n');
      var contentOpts = { x: 0.5, y: slide.layout === 'cover' ? 3.5 : 1.3, w: 9, h: 4, fontSize: 16 };
      pptSlide.addText(contentText, contentOpts);
    }

    // 图片
    if (slide.images && slide.images.length > 0) {
      slide.images.forEach(function(img, i) {
        var src = img.src;
        if (src && src.indexOf('data:') === 0) {
          pptSlide.addImage({ data: src, x: 1 + i * 0.1, y: 1.5 + i * 0.05, w: 4, h: 3 });
        }
      });
    }

    // 表格
    if (slide.tables && slide.tables.length > 0) {
      slide.tables.forEach(function(tbl) {
        if (!tbl.rows || tbl.rows.length === 0) return;
        var rows = tbl.rows.map(function(row) {
          return row.map(function(cell) { return { text: cell, options: { bold: false } }; });
        });
        pptSlide.addTable(rows, { x: 0.5, y: 4.5, w: 9, fontFace: 'Arial', fontSize: 10 });
      });
    }
  });

  return pptx;
}

// ── 编辑器主函数 ──────────────────────────────────────────────────────
export function mountSlides(targetId) {
  var REVEAL_CDN = 'https://cdn.jsdelivr.net/npm/reveal.js@4.5.0';
  var CSS_URL = REVEAL_CDN + '/dist/reveal.css';
  var THEME_URL = REVEAL_CDN + '/dist/theme/black.css';
  var JS_URL = REVEAL_CDN + '/js/reveal.js';

  // 1. 加载 Reveal.js CSS
  var cssLoaded = false;
  function ensureCss(cb) {
    if (cssLoaded) { cb(); return; }
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_URL;
    var theme = document.createElement('link');
    theme.rel = 'stylesheet';
    theme.href = THEME_URL;
    document.head.appendChild(link);
    document.head.appendChild(theme);
    // 加一个 hidden 的 reveal 触发 CSS 加载
    var placeholder = document.createElement('div');
    placeholder.className = 'reveal';
    placeholder.style.display = 'none';
    document.body.appendChild(placeholder);
    link.onload = theme.onload = function() {
      cssLoaded = true;
      document.body.removeChild(placeholder);
      cb();
    };
    link.onerror = theme.onerror = function() {
      // 降级：内联最小样式
      cssLoaded = true;
      document.body.removeChild(placeholder);
      injectMinimalRevealCss();
      cb();
    };
  }

  function injectMinimalRevealCss() {
    var style = document.createElement('style');
    style.textContent = [
      '.reveal{position:relative;width:100%;height:100%;overflow:hidden}',
      '.reveal .slides{position:absolute;width:100%;height:100%;left:0;top:0;overflow:hidden}',
      '.reveal .slides section{display:none;position:absolute;width:100%;height:100%;padding:40px;box-sizing:border-box}',
      '.reveal .slides section.present{display:block}',
      '.reveal .slides section .fragment{opacity:0;transition:opacity 0.3s}',
      '.reveal .slides section .fragment.visible{opacity:1}',
      '.reveal .controls{position:absolute;bottom:20px;right:20px;z-index:100}',
      '.reveal .progress{position:absolute;bottom:0;left:0;right:0;height:4px;z-index:99}',
      '.reveal .slide-number{position:absolute;bottom:10px;right:10px;font-size:14px;color:#999;z-index:100}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // 2. 加载 Reveal.js JS
  function ensureJs(cb) {
    if (window.Reveal) { cb(); return; }
    var script = document.createElement('script');
    script.src = JS_URL;
    script.onload = function() { cb(); };
    script.onerror = function() { cb(); };
    document.head.appendChild(script);
  }

  // 3. 编辑器状态
  var slides = [{
    title: '幻灯片标题',
    content: '点击编辑正文内容\n支持多行文本',
    layout: 'cover',
    images: [],
    tables: []
  }];
  var cur = 0;
  var undoStack = [];
  var redoStack = [];
  var _savedFileId = null;
  var _fileId = null;

  function saveUndo() {
    undoStack.push(JSON.stringify({ slides: slides, cur: cur }));
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
  }

  function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(JSON.stringify({ slides: slides, cur: cur }));
    var state = JSON.parse(undoStack.pop());
    slides = state.slides;
    cur = state.cur;
    render();
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(JSON.stringify({ slides: slides, cur: cur }));
    var state = JSON.parse(redoStack.pop());
    slides = state.slides;
    cur = state.cur;
    render();
  }

  // 4. 渲染
  function render() {
    var container = document.getElementById(targetId);
    if (!container) return;

    // 保存当前 slide 内容
    var activeSection = container.querySelector('.reveal .slides section.present');
    if (activeSection) {
      var titleEl = activeSection.querySelector('.slide-title');
      var contentEl = activeSection.querySelector('.slide-content');
      if (titleEl) slides[cur].title = titleEl.innerHTML;
      if (contentEl) slides[cur].content = contentEl.innerHTML;
      var imgDiv = activeSection.querySelector('.slide-images');
      if (imgDiv) slides[cur].images = parseImagesFromDiv(imgDiv);
      var tblDiv = activeSection.querySelector('.slide-tables');
      if (tblDiv) slides[cur].tables = parseTablesFromDiv(tblDiv);
    }

    // 构建 HTML
    var html = '<div class="ppt-editor-shell" style="display:flex;flex-direction:column;height:100%;font-family:sans-serif;">';

    // 标题栏
    html += '<div class="ppt-toolbar" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--office-toolbar-bg,#f5f5f5);border-bottom:1px solid var(--office-divider,#e0e0e0);flex-shrink:0;">';
    html += '<span style="font-size:16px;">📽️</span>';
    html += '<input id="' + targetId + '-title" value="' + escHtml(fileName || '未命名.pptx') + '" placeholder="文件名" style="border:1px solid #ccc;padding:4px 8px;border-radius:4px;font-size:13px;width:180px;">';
    html += '<span id="' + targetId + '-dirty" style="color:#888;font-size:12px;"></span>';
    html += '<div style="flex:1;"></div>';
    html += '<button id="' + targetId + '-undo" style="padding:4px 10px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;" title="撤销 (Ctrl+Z)">↩ 撤销</button>';
    html += '<button id="' + targetId + '-redo" style="padding:4px 10px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;" title="重做 (Ctrl+Y)">↪ 重做</button>';
    html += '<button id="' + targetId + '-add-slide" style="padding:4px 10px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;">+ 新建页</button>';
    html += '<button id="' + targetId + '-open-pptx" style="padding:4px 10px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;">📂 打开 .pptx</button>';
    html += '<button id="' + targetId + '-save" style="padding:4px 10px;border:1px solid #446995;border-radius:4px;background:#446995;color:#fff;cursor:pointer;font-size:13px;">💾 保存</button>';
    html += '<button id="' + targetId + '-download" style="padding:4px 10px;border:1px solid #446995;border-radius:4px;background:#446995;color:#fff;cursor:pointer;font-size:13px;" title="下载为 .pptx 文件">⬇ 下载</button>';
    html += '</div>';

    // 主体：左侧缩略图 + 右侧编辑区
    html += '<div style="display:flex;flex:1;overflow:hidden;">';

    // 左侧缩略图栏
    html += '<div style="width:160px;flex-shrink:0;background:var(--office-toolbar-bg,#f9f9f9);border-right:1px solid var(--office-divider,#e0e0e0);overflow-y:auto;padding:8px;">';
    html += '<div style="font-size:11px;color:#888;margin-bottom:8px;font-weight:bold;">幻灯片</div>';
    slides.forEach(function(s, i) {
      var active = i === cur ? 'is-active' : '';
      var layoutIcon = s.layout === 'cover' ? '📄' : (s.layout === 'blank' ? '⬜' : '📃');
      html += '<div class="ppt-thumb ' + active + '" data-i="' + i + '" draggable="true" style="border:2px solid' + (i === cur ? ' var(--office-primary,#446995)' : ' #ddd') + ';border-radius:4px;padding:4px;margin-bottom:6px;cursor:pointer;background:#fff;">';
      html += '<div style="font-size:10px;color:#666;margin-bottom:2px;">' + layoutIcon + ' ' + escHtml((s.title || '幻灯片').replace(/<[^>]+>/g, '').slice(0, 12)) + '</div>';
      html += '<div style="font-size:9px;color:#999;">第 ' + (i + 1) + ' 页 · ' + s.layout + '</div>';
      html += '<div style="display:flex;gap:2px;margin-top:4px;">';
      html += '<button class="ppt-thumb-del" data-i="' + i + '" style="font-size:9px;padding:1px 4px;border:1px solid #ddd;border-radius:2px;background:#fff;cursor:pointer;" title="删除">✕</button>';
      html += '<button class="ppt-thumb-copy" data-i="' + i + '" style="font-size:9px;padding:1px 4px;border:1px solid #ddd;border-radius:2px;background:#fff;cursor:pointer;" title="复制">⧉</button>';
      html += '</div></div>';
    });
    html += '</div>';

    // 右侧编辑区
    html += '<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">';
    html += '<div style="display:flex;gap:4px;padding:6px 12px;background:#fafafa;border-bottom:1px solid #e0e0e0;flex-shrink:0;">';
    html += '<select id="' + targetId + '-layout" style="padding:3px 8px;border:1px solid #ccc;border-radius:4px;font-size:12px;">';
    html += '<option value="cover" ' + (slides[cur].layout === 'cover' ? 'selected' : '') + '>封面布局</option>';
    html += '<option value="content" ' + (slides[cur].layout === 'content' ? 'selected' : '') + '>内容布局</option>';
    html += '<option value="blank" ' + (slides[cur].layout === 'blank' ? 'selected' : '') + '>空白布局</option>';
    html += '</select>';
    html += '<button id="' + targetId + '-fmt-bold" style="padding:3px 8px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-weight:bold;font-size:13px;">B</button>';
    html += '<button id="' + targetId + '-fmt-italic" style="padding:3px 8px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-style:italic;font-size:13px;">I</button>';
    html += '<button id="' + targetId + '-fmt-underline" style="padding:3px 8px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;text-decoration:underline;font-size:13px;">U</button>';
    html += '<input id="' + targetId + '-color" type="color" value="#000000" style="width:28px;height:24px;border:1px solid #ccc;border-radius:4px;cursor:pointer;" title="字体颜色">';
    html += '<select id="' + targetId + '-font-size' + '" style="padding:3px 6px;border:1px solid #ccc;border-radius:4px;font-size:12px;">';
    [12,14,16,18,24,32,48].forEach(function(s) {
      html += '<option value="' + s + '" ' + (s === 16 ? 'selected' : '') + '>' + s + 'px</option>';
    });
    html += '</select>';
    html += '<div style="flex:1;"></div>';
    html += '<button id="' + targetId + '-insert-img" style="padding:3px 8px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:12px;">🖼 插入图片</button>';
    html += '<button id="' + targetId + '-insert-table" style="padding:3px 8px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:12px;">📊 插入表格</button>';
    html += '</div>';

    // Reveal.js 容器
    html += '<div class="reveal" style="flex:1;overflow:hidden;">';
    html += '<div class="slides">';
    slides.forEach(function(s, i) {
      var contentHtml = s.content || '';
      var imagesHtml = '';
      if (s.images && s.images.length > 0) {
        imagesHtml = '<div class="slide-images" style="margin:8px 0;">' +
          s.images.map(function(img) {
            return '<img src="' + img.src + '" style="max-width:100%;max-height:200px;display:block;margin:4px 0;" data-rid="' + img.rid + '">';
          }).join('') + '</div>';
      }
      var tablesHtml = '';
      if (s.tables && s.tables.length > 0) {
        tablesHtml = '<div class="slide-tables" style="margin:8px 0;">' +
          s.tables.map(function(tbl, ti) {
            if (!tbl.rows || tbl.rows.length === 0) return '';
            var thtml = '<table style="border-collapse:collapse;width:100%;margin:4px 0;font-size:12px;">';
            tbl.rows.forEach(function(row, ri) {
              thtml += '<tr>';
              row.forEach(function(cell) {
                thtml += '<td style="border:1px solid #ccc;padding:4px 8px;">' + escHtml(cell) + '</td>';
              });
              thtml += '</tr>';
            });
            thtml += '</table>';
            return thtml;
          }).join('') + '</div>';
      }
      var titleHtml = s.layout !== 'blank'
        ? '<div class="slide-title" contenteditable="true" style="width:100%;font-weight:bold;border:none;outline:none;border-bottom:2px solid #e0e0e0;margin-bottom:12px;padding:8px 4px;background:transparent;font-size:' + (s.layout === 'cover' ? '32px' : '22px') + ';min-height:40px;" data-field="title">' + (s.title || '') + '</div>'
        : '';
      var bodyHtml = s.layout === 'blank'
        ? ''
        : '<div class="slide-content" contenteditable="true" style="width:100%;flex:1;min-height:150px;border:none;outline:none;font-size:16px;line-height:1.7;padding:8px 4px;background:transparent;resize:none;" data-field="content">' + contentHtml + '</div>';
      html += '<section class="' + (i === cur ? 'present' : '') + '" data-slide-idx="' + i + '">';
      html += titleHtml;
      html += bodyHtml;
      html += imagesHtml;
      html += tablesHtml;
      html += '</section>';
    });
    html += '</div></div>'; // end slides, end reveal

    // 状态栏
    html += '<div style="display:flex;justify-content:space-between;padding:4px 12px;background:#fafafa;border-top:1px solid #e0e0e0;font-size:11px;color:#888;flex-shrink:0;">';
    html += '<span>第 ' + (cur + 1) + ' / ' + slides.length + ' 页</span>';
    html += '<span>' + (slides[cur].layout === 'cover' ? '封面' : (slides[cur].layout === 'blank' ? '空白' : '内容页')) + ' 布局</span>';
    html += '<span>方向键翻页 · Esc 概览 · F 全屏放映</span>';
    html += '</div>';

    html += '</div></div></div>'; // end shell

    container.innerHTML = html;

    // 绑定缩略图点击
    container.querySelectorAll('.ppt-thumb').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target.classList.contains('ppt-thumb-del') || e.target.classList.contains('ppt-thumb-copy')) return;
        var idx = parseInt(el.dataset.i);
        // 保存当前 slide
        saveCurrentSlide(container);
        cur = idx;
        render();
      });
    });

    // 绑定删除/复制
    container.querySelectorAll('.ppt-thumb-del').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = parseInt(el.dataset.i);
        if (slides.length <= 1) return;
        saveUndo();
        slides.splice(idx, 1);
        if (cur >= slides.length) cur = slides.length - 1;
        render();
      });
    });
    container.querySelectorAll('.ppt-thumb-copy').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = parseInt(el.dataset.i);
        saveUndo();
        var copy = JSON.parse(JSON.stringify(slides[idx]));
        slides.splice(idx + 1, 0, copy);
        cur = idx + 1;
        render();
      });
    });

    // 拖拽排序
    var dragSrcIdx = -1;
    container.querySelectorAll('.ppt-thumb').forEach(function(el) {
      el.addEventListener('dragstart', function(e) {
        dragSrcIdx = parseInt(el.dataset.i);
        e.dataTransfer.effectAllowed = 'move';
        el.style.opacity = '0.4';
      });
      el.addEventListener('dragend', function() {
        el.style.opacity = '';
      });
      el.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.querySelectorAll('.ppt-thumb').forEach(function(t) { t.style.borderColor = ''; });
        el.style.borderColor = 'var(--office-primary,#446995)';
      });
      el.addEventListener('dragleave', function() {
        el.style.borderColor = '';
      });
      el.addEventListener('drop', function(e) {
        e.preventDefault();
        var toIdx = parseInt(el.dataset.i);
        if (dragSrcIdx === toIdx) return;
        saveUndo();
        var item = slides.splice(dragSrcIdx, 1)[0];
        slides.splice(toIdx, 0, item);
        cur = toIdx;
        render();
      });
    });

    // 工具栏按钮
    var layoutSel = container.querySelector('#' + targetId + '-layout');
    if (layoutSel) {
      layoutSel.onchange = function() {
        saveUndo();
        slides[cur].layout = this.value;
        render();
      };
    }

    var boldBtn = container.querySelector('#' + targetId + '-fmt-bold');
    if (boldBtn) boldBtn.onclick = function() { document.execCommand('bold'); };
    var italicBtn = container.querySelector('#' + targetId + '-fmt-italic');
    if (italicBtn) italicBtn.onclick = function() { document.execCommand('italic'); };
    var underlineBtn = container.querySelector('#' + targetId + '-fmt-underline');
    if (underlineBtn) underlineBtn.onclick = function() { document.execCommand('underline'); };

    var colorInput = container.querySelector('#' + targetId + '-color');
    if (colorInput) {
      colorInput.onchange = function() { document.execCommand('foreColor', false, this.value); };
    }

    var fontSizeSel = container.querySelector('#' + targetId + '-font-size');
    if (fontSizeSel) {
      fontSizeSel.onchange = function() {
        document.execCommand('fontSize', false, '7');
        // 把选中的 text 的 font-size 改为指定值
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          var range = sel.getRangeAt(0);
          var span = document.createElement('span');
          span.style.fontSize = this.value + 'px';
          try { range.surroundContents(span); } catch(e) {}
        }
      };
    }

    var addBtn = container.querySelector('#' + targetId + '-add-slide');
    if (addBtn) {
      addBtn.onclick = function() {
        saveUndo();
        slides.push({
          title: '新页面',
          content: '新页面正文内容',
          layout: 'content',
          images: [],
          tables: []
        });
        cur = slides.length - 1;
        render();
      };
    }

    var undoBtn = container.querySelector('#' + targetId + '-undo');
    if (undoBtn) undoBtn.onclick = undo;
    var redoBtn = container.querySelector('#' + targetId + '-redo');
    if (redoBtn) redoBtn.onclick = redo;

    var openBtn = container.querySelector('#' + targetId + '-open-pptx');
    if (openBtn) {
      openBtn.onclick = function() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pptx';
        input.onchange = function(e) {
          var file = e.target.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function(ev) {
            try {
              var schema = parsePptxToSchema(ev.target.result);
              if (schema) {
                saveUndo();
                var data = JSON.parse(schema);
                slides = data.slides;
                cur = 0;
                render();
                toast('已加载 ' + file.name + '（' + slides.length + ' 页）', 'success');
              } else {
                toast('无法解析此 .pptx 文件', 'error');
              }
            } catch(err) {
              toast('解析失败: ' + err.message, 'error');
            }
          };
          reader.readAsArrayBuffer(file);
        };
        input.click();
      };
    }

    var saveBtn = container.querySelector('#' + targetId + '-save');
    if (saveBtn) {
      saveBtn.onclick = function() {
        saveCurrentSlide(container);
        var name = (container.querySelector('#' + targetId + '-title').value || '演示').trim();
        if (!name.toLowerCase().endsWith('.pptx')) name += '.pptx';
        var body = {
          type: 'pptx',
          name: name,
          data: { slides: slides },
          _schema: { type: 'pptx', name: name, data: { slides: slides } }
        };
        fetch('/api/office/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
          body: JSON.stringify(body)
        }).then(function(r) { return r.json(); }).then(function(r) {
          if (r.ok) {
            _savedFileId = r.fileId;
            toast('已保存 ' + name + ' (' + r.size + ' bytes)', 'success');
          } else {
            toast('保存失败: ' + (r.error || '未知'), 'error');
          }
        }).catch(function(e) { toast('保存失败: ' + e.message, 'error'); });
      };
    }

    var downloadBtn = container.querySelector('#' + targetId + '-download');
    if (downloadBtn) {
      downloadBtn.onclick = function() {
        saveCurrentSlide(container);
        var name = (container.querySelector('#' + targetId + '-title').value || '演示').trim();
        if (!name.toLowerCase().endsWith('.pptx')) name += '.pptx';
        try {
          var pptx = buildPptxGenJS(slides);
          pptx.writeFile({ fileName: name }).catch(function(e) {
            toast('下载失败: ' + e.message, 'error');
          });
        } catch(e) {
          toast('生成失败: ' + e.message, 'error');
        }
      };
    }

    var insertImgBtn = container.querySelector('#' + targetId + '-insert-img');
    if (insertImgBtn) {
      insertImgBtn.onclick = function() {
        var url = prompt('请输入图片 URL：');
        if (!url) return;
        saveUndo();
        var imgHtml = '<img src="' + escHtml(url) + '" style="max-width:100%;max-height:250px;display:block;margin:8px 0;" data-rid="user-inserted">';
        var contentEl = container.querySelector('.reveal .slides section[data-slide-idx="' + cur + '"] .slide-images');
        if (contentEl) {
          contentEl.insertAdjacentHTML('beforeend', imgHtml);
        } else {
          var section = container.querySelector('.reveal .slides section[data-slide-idx="' + cur + '"]');
          if (section) {
            var div = document.createElement('div');
            div.className = 'slide-images';
            div.innerHTML = imgHtml;
            section.appendChild(div);
          }
        }
        if (!slides[cur].images) slides[cur].images = [];
        slides[cur].images.push({ rid: 'user-inserted', src: url });
      };
    }

    var insertTblBtn = container.querySelector('#' + targetId + '-insert-table');
    if (insertTblBtn) {
      insertTblBtn.onclick = function() {
        var rows = parseInt(prompt('表格行数（含表头）：', '3'));
        var cols = parseInt(prompt('表格列数：', '3'));
        if (isNaN(rows) || isNaN(cols) || rows < 1 || cols < 1) return;
        saveUndo();
        var tblHtml = '<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:13px;">';
        for (var r = 0; r < rows; r++) {
          tblHtml += '<tr>';
          for (var c = 0; c < cols; c++) {
            var bg = r === 0 ? 'background:#f0f0f0;font-weight:bold;' : '';
            tblHtml += '<td style="border:1px solid #ccc;padding:6px 12px;' + bg + '" contenteditable="true">' + (r === 0 ? '列' + (c+1) : '内容') + '</td>';
          }
          tblHtml += '</tr>';
        }
        tblHtml += '</table>';
        var section = container.querySelector('.reveal .slides section[data-slide-idx="' + cur + '"]');
        if (section) {
          var div = document.createElement('div');
          div.className = 'slide-tables';
          div.innerHTML = tblHtml;
          section.appendChild(div);
        }
        if (!slides[cur].tables) slides[cur].tables = [];
        var rowData = [];
        for (var r = 0; r < rows; r++) {
          var row = [];
          for (var c = 0; c < cols; c++) row.push(r === 0 ? '列' + (c+1) : '内容');
          rowData.push(row);
        }
        slides[cur].tables.push({ rows: rowData, cols: cols });
      };
    }

    // 键盘快捷键
    document.addEventListener('keydown', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.target.getAttribute('contenteditable') === 'true') return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        cur = Math.max(0, cur - 1);
        render();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        cur = Math.min(slides.length - 1, cur + 1);
        render();
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        redo();
      }
    });
  }

  function saveCurrentSlide(container) {
    var section = container.querySelector('.reveal .slides section[data-slide-idx="' + cur + '"]');
    if (!section) return;
    var titleEl = section.querySelector('.slide-title');
    var contentEl = section.querySelector('.slide-content');
    var imgDiv = section.querySelector('.slide-images');
    var tblDiv = section.querySelector('.slide-tables');
    if (titleEl) slides[cur].title = titleEl.innerHTML;
    if (contentEl) slides[cur].content = contentEl.innerHTML;
    if (imgDiv) slides[cur].images = parseImagesFromDiv(imgDiv);
    if (tblDiv) slides[cur].tables = parseTablesFromDiv(tblDiv);
  }

  function parseImagesFromDiv(div) {
    if (!div) return [];
    var imgs = [];
    div.querySelectorAll('img').forEach(function(img) {
      imgs.push({ rid: img.dataset.rid || 'auto', src: img.src });
    });
    return imgs;
  }

  function parseTablesFromDiv(div) {
    if (!div) return [];
    var tables = [];
    div.querySelectorAll('table').forEach(function(tbl) {
      var rows = [];
      tbl.querySelectorAll('tr').forEach(function(tr) {
        var row = [];
        tr.querySelectorAll('td').forEach(function(td) {
          row.push(td.textContent || '');
        });
        rows.push(row);
      });
      tables.push({ rows: rows, cols: rows.length > 0 ? rows[0].length : 0 });
    });
    return tables;
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg, type) {
    if (typeof window.toast === 'function') {
      window.toast(msg, type || 'info');
    } else {
      console.log('[PPT] ' + msg);
    }
  }

  // 5. 加载 Reveal.js 并初始化
  ensureCss(function() {
    ensureJs(function() {
      // 初始化 Reveal.js
      var reveal = window.Reveal;
      if (reveal) {
        reveal.initialize({
          hash: false,
          controls: false,
          progress: false,
          slideNumber: false,
          history: false,
          keyboard: false,
          overview: false,
          touch: false,
          fragments: false,
          transition: 'slide',
          width: 960,
          height: 540,
          margin: 0,
          minScale: 0.2,
          maxScale: 1.0
        });
        // 方向键翻页（自己的逻辑，不依赖 Reveal 键盘）
        document.addEventListener('keydown', function(e) {
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
          if (e.target.getAttribute('contenteditable') === 'true') return;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            if (!e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              cur = Math.min(slides.length - 1, cur + 1);
              render();
            }
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            if (!e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              cur = Math.max(0, cur - 1);
              render();
            }
          } else if (e.key === 'f' || e.key === 'F') {
            e.preventDefault();
            var section = document.querySelector('.reveal .slides section.present');
            if (section && section.requestFullscreen) section.requestFullscreen();
          } else if (e.key === 'Escape') {
            // 退出全屏
            if (document.fullscreenElement) document.exitFullscreen();
          }
        });
      }
      // 首次渲染
      render();
    });
  });

  // 返回接口
  return {
    slides: slides,
    cur: function() { return cur; },
    destroy: function() {
      // 清理 Reveal.js
      if (window.Reveal && window.Reveal.destroy) {
        try { window.Reveal.destroy(); } catch(e) {}
      }
    }
  };
}

// 暴露给 bridge（UMD 模式：ESM 环境下 export 被 tree-shake，bridge 通过 window 访问）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mountSlides: mountSlides };
} else {
  window.mountSlides = mountSlides;
}
