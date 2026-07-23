// ACMS Office 编辑器 — Word / Excel / PPT 统一前端
// 不依赖外部 CDN，纯原生实现

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ===== Word 编辑器 =====
var _quillLoaded = false;
function loadQuill(cb) {
  if (window.Quill) { cb(); return; }
  if (_quillLoaded) { setTimeout(function() { loadQuill(cb); }, 300); return; }
  _quillLoaded = true;
  var l = document.createElement('link'); l.href = 'https://cdn.quilljs.com/1.3.7/quill.snow.css'; l.rel = 'stylesheet'; document.head.appendChild(l);
  var s = document.createElement('script'); s.src = 'https://cdn.quilljs.com/1.3.7/quill.min.js'; s.onload = cb; document.head.appendChild(s);
}

function openWordEditor(w) {
  w.$c.innerHTML = '<div style="display:flex;flex-direction:column;height:100%"><div id="word-toolbar-area" style="flex-shrink:0;min-height:42px"></div><div id="word-editor" style="flex:1;overflow:auto"></div></div>';
  loadQuill(function() {
    var ed = document.createElement('div'); ed.id = 'word-editor-inner'; ed.style.cssText = 'height:100%;padding:20px';
    w.$c.querySelector('#word-editor').appendChild(ed);
    var q = new Quill('#word-editor-inner', { theme: 'snow', modules: { toolbar: [['bold','italic','underline','strike'], [{list:'ordered'},{list:'bullet'}], ['link','image'], ['clean']] } });
    w.$c.querySelector('#word-toolbar-area').appendChild(w.$c.querySelector('.ql-toolbar'));
    var tb = document.createElement('div'); tb.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg2);border-bottom:1px solid var(--border)';
    tb.innerHTML = '<span style="font-weight:600;flex:1;font-size:13px">📝 Word 文档</span><button class="btn-small btn-accept" id="word-save-btn">💾 保存</button>';
    w.$c.querySelector('#word-toolbar-area').appendChild(tb);
    tb.querySelector('#word-save-btn').onclick = function() {
      var name = prompt('文件名：', '文档.docx') || '文档.docx';
      fetch('/api/office/save', { method:'POST', headers:{'Content-Type':'application/json','X-API-Key':'dev-key-001'}, body:JSON.stringify({ type:'docx', name:name, data:{ type:'word', html:q.root.innerHTML, text:q.getText() } }) })
        .then(function(r){return r.json()}).then(function(r){ toast(r.ok?'已保存 ✅':'保存失败','success'); });
    };
  });
}

// ===== Excel 编辑器（纯原生，无外部依赖）=====
function openExcelEditor(w) {
  var rows = 20, cols = 8;
  var data = [];
  for (var ri = 0; ri < rows; ri++) { data[ri] = []; for (var ci = 0; ci < cols; ci++) data[ri][ci] = ''; }

  function renderTable() {
    var h = '<div style="display:flex;flex-direction:column;height:100%">';
    h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg2);border-bottom:1px solid var(--border);flex-shrink:0">';
    h += '<span style="font-weight:600;flex:1;font-size:13px">📊 Excel 表格</span>';
    h += '<button class="btn-small" id="xlsx-add-row">+ 行</button>';
    h += '<button class="btn-small" id="xlsx-add-col">+ 列</button>';
    h += '<button class="btn-small btn-accept" id="xlsx-save-btn">💾 保存</button>';
    h += '</div>';
    h += '<div style="flex:1;overflow:auto;padding:4px">';
    h += '<table id="xlsx-table" style="border-collapse:collapse;width:100%;font-size:13px">';
    // 表头
    h += '<tr><th style="border:1px solid #ccc;background:var(--bg2);padding:4px 6px;min-width:30px;text-align:center;font-weight:600;position:sticky;top:0;z-index:2">#</th>';
    var colLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (var ci = 0; ci < data[0].length; ci++) {
      h += '<th style="border:1px solid #ccc;background:var(--bg2);padding:4px 6px;min-width:80px;text-align:center;font-weight:600;position:sticky;top:0;z-index:2">' + (colLetters[ci] || 'C' + ci) + '</th>';
    }
    h += '</tr>';
    // 数据行
    for (var ri = 0; ri < data.length; ri++) {
      h += '<tr><td style="border:1px solid #ccc;background:var(--bg2);padding:4px 6px;text-align:center;font-size:11px;color:var(--text2)">' + (ri + 1) + '</td>';
      for (var ci = 0; ci < data[ri].length; ci++) {
        var val = escHtml(String(data[ri][ci]));
        h += '<td style="border:1px solid #ccc;padding:2px 4px;min-width:80px"><div class="xlsx-cell" contenteditable style="outline:none;min-height:20px;padding:2px" data-r="' + ri + '" data-c="' + ci + '">' + val + '</div></td>';
      }
      h += '</tr>';
    }
    h += '</table></div></div>';
    w.$c.innerHTML = h;

    // 单元格编辑
    w.$c.querySelectorAll('.xlsx-cell').forEach(function(el) {
      el.onblur = function() {
        var r = parseInt(this.dataset.r), c = parseInt(this.dataset.c);
        data[r][c] = this.textContent;
      };
      el.onkeydown = function(e) {
        if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
      };
    });

    // 添加行
    w.$c.querySelector('#xlsx-add-row').onclick = function() {
      var newRow = [];
      for (var ci = 0; ci < (data[0] || []).length; ci++) newRow[ci] = '';
      data.push(newRow);
      renderTable();
    };
    // 添加列
    w.$c.querySelector('#xlsx-add-col').onclick = function() {
      for (var ri = 0; ri < data.length; ri++) data[ri].push('');
      renderTable();
    };
    // 保存
    w.$c.querySelector('#xlsx-save-btn').onclick = function() {
      var name = prompt('文件名：', '表格.xlsx') || '表格.xlsx';
      fetch('/api/office/save', { method:'POST', headers:{'Content-Type':'application/json','X-API-Key':'dev-key-001'}, body:JSON.stringify({ type:'xlsx', name:name, data:{ type:'excel', data:data } }) })
        .then(function(r){return r.json()}).then(function(r){ toast(r.ok?'已保存 ✅':'保存失败','success'); });
    };
  }

  renderTable();
}

// ===== PPT 编辑器（自定义幻灯片 UI）=====
function openPptEditor(w) {
  var slides = [{ title: '点击编辑标题', content: '点击编辑正文\n支持多行内容' }];
  var cur = 0;

  function render() {
    var h = '<div style="display:flex;flex-direction:column;height:100%">';
    // 缩略图栏
    h += '<div style="display:flex;gap:6px;padding:8px;background:var(--bg2);border-bottom:1px solid var(--border);overflow-x:auto;flex-shrink:0">';
    slides.forEach(function(s, i) {
      h += '<div class="ppt-thumb" data-i="' + i + '" style="cursor:pointer;padding:6px 12px;border-radius:4px;border:2px solid ' + (i === cur ? 'var(--accent)' : 'transparent') + ';background:var(--bg1);min-width:70px;text-align:center;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml((s.title||'无标题').slice(0, 12)) + '</div>';
    });
    h += '<button class="btn-small" id="ppt-add" style="flex-shrink:0">+ 添加页</button>';
    h += '<span style="flex:1"></span>';
    h += '<button class="btn-small" id="ppt-del" style="flex-shrink:0;color:var(--danger)">🗑 删除</button>';
    h += '</div>';
    // 编辑区
    var s = slides[cur] || { title: '', content: '' };
    h += '<div style="flex:1;padding:20px;overflow:auto;display:flex;justify-content:center">';
    h += '<div style="max-width:800px;width:100%;background:white;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.15);padding:40px;min-height:350px;display:flex;flex-direction:column">';
    h += '<input id="ppt-title" value="' + escHtml(s.title) + '" style="width:100%;font-size:22px;font-weight:600;border:none;outline:none;border-bottom:2px solid #e0e0e0;margin-bottom:16px;padding:8px 4px;background:transparent;font-family:inherit" placeholder="幻灯片标题">';
    h += '<textarea id="ppt-content" style="width:100%;flex:1;min-height:250px;border:none;outline:none;font-size:15px;line-height:1.7;padding:8px 4px;background:transparent;resize:vertical;font-family:inherit" placeholder="正文内容（支持换行）">' + escHtml(s.content) + '</textarea>';
    h += '</div></div></div>';

    w.$c.innerHTML = h;

    // 编辑同步
    var titleEl = w.$c.querySelector('#ppt-title');
    var contentEl = w.$c.querySelector('#ppt-content');
    titleEl.oninput = function() { slides[cur].title = this.value; updateThumb(); };
    contentEl.oninput = function() { slides[cur].content = this.value; };
    w.$c.querySelector('#ppt-add').onclick = function() {
      slides.push({ title: '新页面', content: '' });
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
        cur = parseInt(this.dataset.i);
        render();
      };
    });

    function updateThumb() {
      var thumbs = w.$c.querySelectorAll('.ppt-thumb');
      if (thumbs[cur]) thumbs[cur].textContent = (slides[cur].title || '无标题').slice(0, 12);
    }

    // 保存按钮（加在窗口外，通过 toolbar 方式）
    var shouldAddSave = !w.$c.querySelector('#ppt-save-btn');
    if (shouldAddSave) {
      var tb = document.createElement('div');
      tb.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg2);border-bottom:1px solid var(--border);flex-shrink:0';
      tb.innerHTML = '<span style="font-weight:600;flex:1;font-size:13px">📽️ PPT 演示</span><button class="btn-small btn-accept" id="ppt-save-btn">💾 保存</button>';
      w.$c.insertBefore(tb, w.$c.firstChild);
      tb.querySelector('#ppt-save-btn').onclick = function() {
        var name = prompt('文件名：', '演示.pptx') || '演示.pptx';
        fetch('/api/office/save', { method:'POST', headers:{'Content-Type':'application/json','X-API-Key':'dev-key-001'}, body:JSON.stringify({ type:'pptx', name:name, data:{ type:'ppt', slides:slides } }) })
          .then(function(r){return r.json()}).then(function(r){ toast(r.ok?'已保存 ✅':'保存失败','success'); });
      };
    }
  }

  render();
}

// ===== 注册全局函数供 PKG 调用 =====
window.openWordEditor = openWordEditor;
window.openExcelEditor = openExcelEditor;
window.openPptEditor = openPptEditor;
