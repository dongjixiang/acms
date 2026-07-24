// ACMS Office 编辑器 — Word / Excel / PPT 统一前端
// 不依赖外部 CDN，纯原生实现

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ===== Word 编辑器（v0.62.1 块编辑器）=====
// 改用自研 office-doc-editor 替代 Quill
// 依赖：window.OfficeDoc + window.OfficeDocEditor（由 index.html 在 office-editor.js 之前加载）
function openWordEditor(w) {
  // 容器 = 整个 PKG 内容区
  w.$c.innerHTML = '<div id="word-host" style="height:100%;display:flex;flex-direction:column"></div>';
  var host = w.$c.querySelector('#word-host');

  // 顶部 toolbar：标题 + 保存按钮（自己加，不依赖编辑器内置）
  var bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg2);border-bottom:1px solid var(--border);flex-shrink:0';
  bar.innerHTML = '<span style="font-weight:600;flex:1;font-size:13px">📝 Word 文档（块编辑）</span><button class="btn-small btn-accept" id="word-save-btn">💾 保存</button>';
  host.appendChild(bar);

  // 编辑器 mount 区
  var editorHost = document.createElement('div');
  editorHost.id = 'word-editor-mount';
  editorHost.style.cssText = 'flex:1;min-height:0;overflow:auto;background:#fafaf6';
  host.appendChild(editorHost);

  // 检查依赖是否加载（office-doc.js + office-doc-converter.js 必须在 office-editor.js 之前）
  if (!window.OfficeDoc || !window.OfficeDocEditor) {
    editorHost.innerHTML = '<div style="padding:24px;color:#a00">❌ 块编辑器未加载<br><br>请确认 client/index.html 在 office-editor.js 之前加载了：<br><br>&lt;script src="/client/js/core/office-doc.js"&gt;&lt;/script&gt;<br>&lt;script src="/client/js/core/office-doc-converter.js"&gt;&lt;/script&gt;</div>';
    return;
  }

  // 挂块编辑器（用空 doc 初始化）
  var doc = window.OfficeDoc.makeDocument({ title: 'untitled' });
  var instance = window.OfficeDocEditor.mountEditor(editorHost, doc, {
    onChange: function() { /* 实时更新，不做任何事 */ }
  });
  w._officeDocInstance = instance; // 挂到 w 上方便 PKG 关闭时清理

  // 保存按钮：showPrompt 拿文件名（避免 browser dialog），send blocks 到 /api/office/save
  bar.querySelector('#word-save-btn').onclick = async function() {
    if (typeof showPrompt !== 'function') {
      toast('showPrompt 未加载，无法输入文件名', 'error');
      return;
    }
    var name = await showPrompt({
      title: '保存 Word 文档',
      message: '输入文件名（.docx 后缀自动加）',
      placeholder: '文档',
      defaultValue: '文档',
      multiline: false,
      minLength: 1,
    });
    if (!name) return; // 用户取消
    name = String(name).trim();
    if (!name.toLowerCase().endsWith('.docx')) name += '.docx';

    var d = instance.getDocument();
    var payload = {
      type: 'docx',
      name: name,
      data: {
        title: d.meta.title,
        blocks: d.blocks,
        // 兼容旧 payload 字段（如果服务端兼容检查用）
        content: window.OfficeDocConverter.documentToMarkdown(d),
      }
    };
    fetch('/api/office/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify(payload),
    })
    .then(function(r){return r.json()})
    .then(function(r){
      if (r.ok) toast('已保存 ✅ ' + name + ' (' + r.size + ' bytes)', 'success');
      else toast('保存失败: ' + (r.error || '未知错误'), 'error');
    })
    .catch(function(e){ toast('保存失败: ' + e.message, 'error'); });
  };
}

// ===== Excel 编辑器（v0.62.3 状态栏 + 选中统计）=====
// 新增：底部状态栏（位置 / 选中范围 / sum / avg / count）
// 保留：20×8 默认网格 / +行 / +列 / 保存
// 升级：showPrompt 替代 prompt() / 保存 payload 改 sheets[] 数组（PR 1 兼容）
function openExcelEditor(w) {
  var ROWS = 20, COLS = 8;
  var data = [];
  for (var ri = 0; ri < ROWS; ri++) { data[ri] = []; for (var ci = 0; ci < COLS; ci++) data[ri][ci] = ''; }

  // 选中状态：{start: [r,c], end: [r,c]} — 跟踪当前 cell range
  var sel = { start: null, end: null };

  function colLetter(ci) {
    var s = '';
    var n = ci;
    while (n >= 0) {
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
    }
    return s;
  }

  function isNum(v) {
    if (v === '' || v == null) return false;
    var n = parseFloat(v);
    return !isNaN(n) && isFinite(n);
  }

  function updateStatusBar() {
    var bar = w.$c.querySelector('#xlsx-status');
    if (!bar) return;
    if (!sel.start || !sel.end) {
      bar.textContent = 'A1 · 总 ' + data.length + ' 行 × ' + (data[0]||[]).length + ' 列';
      return;
    }
    var r1 = Math.min(sel.start[0], sel.end[0]);
    var c1 = Math.min(sel.start[1], sel.end[1]);
    var r2 = Math.max(sel.start[0], sel.end[0]);
    var c2 = Math.max(sel.start[1], sel.end[1]);
    var range = colLetter(c1) + (r1+1) + (r1===r2&&c1===c2?'':':' + colLetter(c2) + (r2+1));
    // 收集选中单元格数值
    var sum = 0, count = 0, numCount = 0;
    for (var r = r1; r <= r2; r++) {
      for (var c = c1; c <= c2; c++) {
        count++;
        if (isNum(data[r][c])) { sum += parseFloat(data[r][c]); numCount++; }
      }
    }
    var parts = [
      range,
      (r2-r1+1) + ' 行 × ' + (c2-c1+1) + ' 列',
      'sum: ' + (numCount > 0 ? sum.toFixed(2) : '-'),
      'avg: ' + (numCount > 0 ? (sum/numCount).toFixed(2) : '-'),
      'count: ' + numCount + '/' + count,
    ];
    bar.textContent = parts.join(' · ');
  }

  function renderTable() {
    var h = '<div style="display:flex;flex-direction:column;height:100%">';
    // 顶部 toolbar
    h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg2);border-bottom:1px solid var(--border);flex-shrink:0">';
    h += '<span style="font-weight:600;flex:1;font-size:13px">📊 Excel 表格（v0.62.3 增强）</span>';
    h += '<button class="btn-small" id="xlsx-add-row">+ 行</button>';
    h += '<button class="btn-small" id="xlsx-add-col">+ 列</button>';
    h += '<button class="btn-small btn-accept" id="xlsx-save-btn">💾 保存</button>';
    h += '</div>';
    // 表格区
    h += '<div style="flex:1;overflow:auto;padding:4px">';
    h += '<table id="xlsx-table" style="border-collapse:collapse;width:100%;font-size:13px">';
    h += '<tr><th style="border:1px solid #ccc;background:var(--bg2);padding:4px 6px;min-width:30px;text-align:center;font-weight:600;position:sticky;top:0;z-index:2">#</th>';
    for (var ci = 0; ci < (data[0]||[]).length; ci++) {
      h += '<th style="border:1px solid #ccc;background:var(--bg2);padding:4px 6px;min-width:80px;text-align:center;font-weight:600;position:sticky;top:0;z-index:2">' + colLetter(ci) + '</th>';
    }
    h += '</tr>';
    for (var ri = 0; ri < data.length; ri++) {
      h += '<tr><td style="border:1px solid #ccc;background:var(--bg2);padding:4px 6px;text-align:center;font-size:11px;color:var(--text2)">' + (ri + 1) + '</td>';
      for (var ci2 = 0; ci2 < data[ri].length; ci2++) {
        var val = escHtml(String(data[ri][ci2]));
        h += '<td style="border:1px solid #ccc;padding:2px 4px;min-width:80px"><div class="xlsx-cell" contenteditable style="outline:none;min-height:20px;padding:2px" data-r="' + ri + '" data-c="' + ci2 + '">' + val + '</div></td>';
      }
      h += '</tr>';
    }
    h += '</table></div>';
    // v0.62.3: 底部状态栏
    h += '<div id="xlsx-status" style="padding:4px 12px;background:var(--bg2);border-top:1px solid var(--border);font-size:11px;color:var(--text2);font-family:Consolas,monospace;flex-shrink:0;min-height:24px;display:flex;align-items:center">A1 · 总 20 行 × 8 列</div>';
    h += '</div>';
    w.$c.innerHTML = h;

    // 单元格编辑 + 选中跟踪
    var cells = w.$c.querySelectorAll('.xlsx-cell');
    cells.forEach(function(el) {
      var r = parseInt(el.dataset.r), c = parseInt(el.dataset.c);
      el.onfocus = function() {
        sel.start = [r, c];
        sel.end = [r, c];
        el.style.outline = '2px solid var(--accent)';
        el.style.background = '#f0f8ff';
        updateStatusBar();
      };
      el.onblur = function() {
        el.style.outline = 'none';
        el.style.background = '';
        data[r][c] = el.textContent;
      };
      el.onkeydown = function(e) {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      };
    });

    // 添加行
    w.$c.querySelector('#xlsx-add-row').onclick = function() {
      var newRow = [];
      for (var ci3 = 0; ci3 < (data[0] || []).length; ci3++) newRow[ci3] = '';
      data.push(newRow);
      renderTable();
    };
    // 添加列
    w.$c.querySelector('#xlsx-add-col').onclick = function() {
      for (var ri2 = 0; ri2 < data.length; ri2++) data[ri2].push('');
      renderTable();
    };
    // 保存（用 showPrompt 替代 prompt）
    w.$c.querySelector('#xlsx-save-btn').onclick = async function() {
      var name;
      if (typeof showPrompt === 'function') {
        name = await showPrompt({
          title: '保存 Excel 表格',
          message: '输入文件名（.xlsx 后缀自动加）',
          defaultValue: '表格',
          multiline: false,
          minLength: 1,
        });
        if (!name) return;
      } else {
        name = prompt('文件名：', '表格.xlsx') || '表格.xlsx';
      }
      name = String(name).trim();
      if (!name.toLowerCase().endsWith('.xlsx')) name += '.xlsx';
      // v0.62.3: 用 sheets[] 数组格式（PR 1 兼容）
      var sheets = [{ name: 'Sheet1', headers: data[0] || [], rows: data.slice(1) }];
      fetch('/api/office/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
        body: JSON.stringify({ type: 'xlsx', name: name, data: { title: 'Sheet1', sheets: sheets, rows: data.length, cols: (data[0]||[]).length } }),
      })
      .then(function(r){ return r.json(); })
      .then(function(r){ toast(r.ok ? '已保存 ✅ ' + name + ' (' + r.size + ' bytes)' : '保存失败: ' + (r.error || '未知'), r.ok ? 'success' : 'error'); })
      .catch(function(e){ toast('保存失败: ' + e.message, 'error'); });
    };
  }

  renderTable();
}

// ===== PPT 编辑器（v0.62.3 状态栏 + 布局选择器）=====
// 新增：底部状态栏（当前 / 总页数）
// 新增：布局下拉（cover / content / blank）影响编辑区视觉
// 保留：缩略图侧边栏 / 标题+正文编辑 / +添加页 / 删除 / 保存
// 升级：showPrompt 替代 prompt()
function openPptEditor(w) {
  var slides = [{ title: 'PPT 标题', content: '第一页正文\n支持多行\n- 项目 A\n- 项目 B', layout: 'content' }];
  var cur = 0;

  // 布局下拉变化时改 placeholder + 字号
  function applyLayout(layout, titleEl, contentEl) {
    if (layout === 'cover') {
      titleEl.style.fontSize = '36px';
      titleEl.style.textAlign = 'center';
      titleEl.placeholder = '封面标题';
      contentEl.placeholder = '副标题（可选）';
    } else if (layout === 'blank') {
      titleEl.style.fontSize = '20px';
      titleEl.style.textAlign = 'left';
      titleEl.placeholder = '（空白页可只放图）';
      contentEl.placeholder = '正文或图片说明';
    } else { // content
      titleEl.style.fontSize = '22px';
      titleEl.style.textAlign = 'left';
      titleEl.placeholder = '幻灯片标题';
      contentEl.placeholder = '正文内容（支持换行）';
    }
  }

  function render() {
    var h = '<div style="display:flex;flex-direction:column;height:100%">';
    // 顶部 toolbar
    h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg2);border-bottom:1px solid var(--border);flex-shrink:0">';
    h += '<span style="font-weight:600;font-size:13px">📽️ PPT 演示（v0.62.3 增强）</span>';
    h += '<span style="flex:1"></span>';
    h += '<label style="font-size:11px;color:var(--text2)">布局:</label>';
    h += '<select id="ppt-layout" style="font-size:12px;padding:2px 6px;border:1px solid var(--border);background:var(--bg2);border-radius:0">';
    h += '<option value="content"' + (slides[cur].layout === 'content' ? ' selected' : '') + '>内容页</option>';
    h += '<option value="cover"' + (slides[cur].layout === 'cover' ? ' selected' : '') + '>封面</option>';
    h += '<option value="blank"' + (slides[cur].layout === 'blank' ? ' selected' : '') + '>空白</option>';
    h += '</select>';
    h += '<button class="btn-small" id="ppt-add" style="flex-shrink:0">+ 添加页</button>';
    h += '<button class="btn-small" id="ppt-del" style="flex-shrink:0;color:var(--danger)">🗑 删除</button>';
    h += '<button class="btn-small btn-accept" id="ppt-save-btn">💾 保存</button>';
    h += '</div>';
    // 缩略图栏
    h += '<div id="ppt-thumbs" style="display:flex;gap:6px;padding:8px;background:var(--bg2);border-bottom:1px solid var(--border);overflow-x:auto;flex-shrink:0">';
    slides.forEach(function(s, i) {
      var layoutTag = s.layout === 'cover' ? '📄' : (s.layout === 'blank' ? '⬜' : '📃');
      h += '<div class="ppt-thumb" data-i="' + i + '" style="cursor:pointer;padding:6px 10px;border:2px solid ' + (i === cur ? 'var(--accent)' : 'var(--border)') + ';background:' + (i === cur ? '#e8f4e8' : 'var(--bg1)') + ';min-width:80px;text-align:center;font-size:11px;border-radius:0">';
      h += '<div style="font-size:14px;margin-bottom:2px">' + layoutTag + '</div>';
      h += '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px">' + escHtml((s.title||'无标题').slice(0, 10)) + '</div>';
      h += '<div style="font-size:10px;color:var(--text2);margin-top:2px">' + (i+1) + '/' + slides.length + '</div>';
      h += '</div>';
    });
    h += '</div>';
    // 编辑区
    var s = slides[cur] || { title: '', content: '', layout: 'content' };
    h += '<div style="flex:1;padding:20px;overflow:auto;display:flex;justify-content:center">';
    h += '<div style="max-width:800px;width:100%;background:white;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.15);padding:40px;min-height:350px;display:flex;flex-direction:column">';
    h += '<input id="ppt-title" value="' + escHtml(s.title) + '" style="width:100%;font-weight:600;border:none;outline:none;border-bottom:2px solid #e0e0e0;margin-bottom:16px;padding:8px 4px;background:transparent;font-family:inherit" placeholder="幻灯片标题">';
    h += '<textarea id="ppt-content" style="width:100%;flex:1;min-height:250px;border:none;outline:none;font-size:15px;line-height:1.7;padding:8px 4px;background:transparent;resize:vertical;font-family:inherit" placeholder="正文内容（支持换行）">' + escHtml(s.content) + '</textarea>';
    h += '</div></div>';
    // v0.62.3: 底部状态栏
    h += '<div id="ppt-status" style="padding:4px 12px;background:var(--bg2);border-top:1px solid var(--border);font-size:11px;color:var(--text2);font-family:Consolas,monospace;flex-shrink:0;min-height:24px;display:flex;align-items:center;justify-content:space-between">';
    h += '<span>第 ' + (cur+1) + ' / ' + slides.length + ' 页</span>';
    h += '<span>' + (s.layout === 'cover' ? '封面' : (s.layout === 'blank' ? '空白' : '内容页')) + ' 布局</span>';
    h += '</div>';
    h += '</div>';

    w.$c.innerHTML = h;

    // 编辑同步
    var titleEl = w.$c.querySelector('#ppt-title');
    var contentEl = w.$c.querySelector('#ppt-content');
    var layoutSel = w.$c.querySelector('#ppt-layout');
    applyLayout(s.layout, titleEl, contentEl);
    titleEl.oninput = function() { slides[cur].title = this.value; updateThumb(); };
    contentEl.oninput = function() { slides[cur].content = this.value; };
    layoutSel.onchange = function() {
      slides[cur].layout = this.value;
      applyLayout(this.value, titleEl, contentEl);
      updateStatus();
    };
    w.$c.querySelector('#ppt-add').onclick = function() {
      slides.push({ title: '新页面', content: '', layout: 'content' });
      cur = slides.length - 1;
      render();
    };
    w.$c.querySelector('#ppt-del').onclick = function() {
      if (slides.length <= 1) { toast('至少保留一页', 'warning'); return; }
      slides.splice(cur, 1);
      if (cur >= slides.length) cur = slides.length - 1;
      render();
    };
    w.$c.querySelectorAll('.ppt-thumb').forEach(function(el) {
      el.onclick = function() {
        if (titleEl) slides[cur].title = titleEl.value;
        if (contentEl) slides[cur].content = contentEl.value;
        if (layoutSel) slides[cur].layout = layoutSel.value;
        cur = parseInt(this.dataset.i);
        render();
      };
    });

    function updateThumb() {
      var thumbs = w.$c.querySelectorAll('.ppt-thumb');
      if (thumbs[cur]) {
        var t = thumbs[cur].querySelector('div:nth-child(2)');
        if (t) t.textContent = (slides[cur].title || '无标题').slice(0, 10);
      }
    }
    function updateStatus() {
      var bar = w.$c.querySelector('#ppt-status');
      if (!bar) return;
      var lbl = slides[cur].layout === 'cover' ? '封面' : (slides[cur].layout === 'blank' ? '空白' : '内容页');
      bar.innerHTML = '<span>第 ' + (cur+1) + ' / ' + slides.length + ' 页</span><span>' + lbl + ' 布局</span>';
    }

    // 保存按钮（用 showPrompt 替代 prompt）
    w.$c.querySelector('#ppt-save-btn').onclick = async function() {
      var name;
      if (typeof showPrompt === 'function') {
        name = await showPrompt({
          title: '保存 PPT 演示',
          message: '输入文件名（.pptx 后缀自动加）',
          defaultValue: '演示',
          multiline: false,
          minLength: 1,
        });
        if (!name) return;
      } else {
        name = prompt('文件名：', '演示.pptx') || '演示.pptx';
      }
      name = String(name).trim();
      if (!name.toLowerCase().endsWith('.pptx')) name += '.pptx';
      fetch('/api/office/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
        body: JSON.stringify({ type: 'pptx', name: name, data: { title: name.replace(/\.pptx$/, ''), slides: slides } }),
      })
      .then(function(r){ return r.json(); })
      .then(function(r){ toast(r.ok ? '已保存 ✅ ' + name + ' (' + r.size + ' bytes)' : '保存失败: ' + (r.error || '未知'), r.ok ? 'success' : 'error'); })
      .catch(function(e){ toast('保存失败: ' + e.message, 'error'); });
    };
  }

  render();
}

// ===== 注册全局函数供 PKG 调用 =====
window.openWordEditor = openWordEditor;
window.openExcelEditor = openExcelEditor;
window.openPptEditor = openPptEditor;
