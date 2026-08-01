// ACMS Excel 编辑器 — 依赖 office-common.js (escHtml, showCtxMenu)

// ===== Excel 编辑器（v0.62.5 OO 风格标题栏）=====
// 新增：OO 风格标题栏（学 OO FileMenu.js）+ ●已修改点
// 保留：20×8 默认网格 / +行 / +列 / 保存
// v0.62.3: 底部状态栏（位置 / 选中范围 / sum / avg / count）
// 升级：showPrompt 替代 prompt() / 保存 payload 改 sheets[] 数组（PR 1 兼容）
// v0.62.5 PR-C: 多 sheet 支持 — sheets[] 数组 + currentSheetIdx + 底部 Sheet tabs
// v0.65: 支持 fileId/fileName 参数从服务器加载文件
function openExcelEditor(w, fileId, fileName) {
  var ROWS = 20, COLS = 8;

  // v0.62.7: 文件来源: server(有fileId) / local(无fileId)
  var _isServerFile = !!fileId;
  var _fileId = fileId || null;

  // v0.62.5: 多 sheet 数据结构（每个 sheet 独立 data 数组）
  var sheets = [];
  var currentSheetIdx = 0;
  // 当前 sheet 的 data 引用（切换 sheet 时重新指向，便于旧代码直接用 data）
  var data = [];

  function blankData() {
    var d = [];
    for (var ri = 0; ri < ROWS; ri++) { d[ri] = []; for (var ci = 0; ci < COLS; ci++) d[ri][ci] = ''; }
    return d;
  }
  function defaultSheetName() { return 'Sheet' + (sheets.length + 1); }
  function addSheet() {
    sheets.push({ name: defaultSheetName(), data: blankData() });
    currentSheetIdx = sheets.length - 1;
    data = sheets[currentSheetIdx].data;
    sel = { start: null, end: null };
    markDirty();
    renderTable();
  }
  function switchSheet(idx) {
    if (idx < 0 || idx >= sheets.length) return;
    currentSheetIdx = idx;
    data = sheets[idx].data;
    sel = { start: null, end: null };
    markDirty();
    renderTable();
  }
  function removeSheet(idx) {
    if (sheets.length <= 1) return toast('至少保留一个 Sheet', 'warning');
    sheets.splice(idx, 1);
    if (currentSheetIdx >= sheets.length) currentSheetIdx = sheets.length - 1;
    data = sheets[currentSheetIdx].data;
    sel = { start: null, end: null };
    markDirty();
    renderTable();
  }
  function renameSheet(idx, name) {
    if (idx < 0 || idx >= sheets.length) return;
    name = String(name || '').trim();
    if (!name) return;
    sheets[idx].name = name;
    markDirty();
    renderTable();
  }

  // 初始化默认 Sheet1
  sheets.push({ name: 'Sheet1', data: blankData() });
  data = sheets[0].data;

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

  // ─── 单元格数据辅助函数（v0.63 Phase1: 统一 cell 数据结构）───
  // cell 格式: '' | '文本' | {v: 值} | {v: 值, b: {bold, italic, underline, fill, color, numFmt}}
  function cellStr(cell) {
    if (typeof cell === 'string') return cell;
    if (cell && typeof cell === 'object') return String(cell.v !== undefined ? cell.v : '');
    return '';
  }
  function cellVal(cell) {
    if (typeof cell === 'string') { var n = parseFloat(cell); return !isNaN(n) && isFinite(n) ? n : cell; }
    if (cell && typeof cell === 'object') return cell.v !== undefined ? cell.v : '';
    return '';
  }
  function cellFmt(cell) {
    if (!cell || typeof cell !== 'object') return {};
    return cell.b || {};
  }
  function setCellFmt(r, c, fmt) {
    if (!data[r]) data[r] = [];
    var cell = data[r][c];
    if (typeof cell !== 'object') data[r][c] = { v: cell || '' };
    if (!data[r][c].b) data[r][c].b = {};
    Object.assign(data[r][c].b, fmt);
  }
  function applyCellStyle(r, c) {
    var el = w.$c.querySelector('.xlsx-cell[data-r="' + r + '"][data-c="' + c + '"]');
    if (!el) return;
    var fmt = cellFmt(data[r][c]);
    el.style.fontWeight = fmt.bold ? 'bold' : '';
    el.style.fontStyle = fmt.italic ? 'italic' : '';
    el.style.textDecoration = fmt.underline ? 'underline' : '';
    el.style.backgroundColor = (fmt.highlight || fmt.fill) || '';
    el.style.color = fmt.color || '';
    // v0.65: 水平对齐
    if (fmt.align) {
      el.style.textAlign = fmt.align;
    } else {
      el.style.textAlign = '';
    }
    // v0.65: 垂直对齐
    if (fmt.valign) {
      el.style.verticalAlign = fmt.valign;
    } else {
      el.style.verticalAlign = '';
    }
    // v0.65: 换行
    el.style.whiteSpace = fmt.wrap ? 'pre-wrap' : 'normal';
    // v0.65: 文字旋转
    if (fmt.orientation) {
      el.style.transform = 'rotate(' + fmt.orientation + 'deg)';
      el.style.transformOrigin = 'left top';
    } else {
      el.style.transform = '';
      el.style.transformOrigin = '';
    }
    // v0.65: 边框
    var key = r + '-' + c;
    var b = cellBorders[key];
    if (b) {
      el.style.borderTop = b.top ? '1px solid ' + b.top : '';
      el.style.borderBottom = b.bottom ? '1px solid ' + b.bottom : '';
      el.style.borderLeft = b.left ? '1px solid ' + b.left : '';
      el.style.borderRight = b.right ? '1px solid ' + b.right : '';
    } else {
      el.style.borderTop = '';
      el.style.borderBottom = '';
      el.style.borderLeft = '';
      el.style.borderRight = '';
    }
  }

  // v0.62.5: Excel 标题栏独立的 dirty 跟踪
  var isDirty = false;
  // v0.64: 冻结状态
  var freezeRow = -1; // -1 = 无冻结, 0 = 冻结首行
  // v0.65: AutoFilter 状态
  var autoFilterActive = false;
  var autoFilterCol = -1; // 当前打开下拉的列
  var activeFilterMenu = null;
  // v0.65: 合并单元格
  var mergedRanges = []; // [{r1,c1,r2,c2}, ...]
  // v0.65: 边框
  var cellBorders = {}; // "r-c" -> {top,bottom,left,right} 颜色

  function updateStatusBar() {
    var bar = w.$c.querySelector('#xlsx-status');
    if (!bar) return;
    if (!sel.start || !sel.end) {
      bar.textContent = 'A1 · 总 ' + (data.length - 1) + ' 行 × ' + (data[0]||[]).length + ' 列';
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
        if (isNum(cellStr(data[r][c]))) { sum += parseFloat(cellStr(data[r][c])); numCount++; }
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

// v0.62.5: 操作函数集合（Ribbon 按钮 + 标题栏按钮复用同一组 operations）
  var ops = {
    addRow: function () {
      var newRow = [];
      for (var k = 0; k < (data[0] || []).length; k++) newRow[k] = '';
      data.push(newRow);
      markDirty();
      renderTable();
    },
    addCol: function () {
      for (var k = 0; k < data.length; k++) data[k].push('');
      markDirty();
      renderTable();
    },
    insertRowAbove: function () {
      // 在选中行上方插入
      var insertAt = sel.start ? sel.start[0] : 0;
      var newRow = [];
      for (var k = 0; k < (data[0] || []).length; k++) newRow[k] = '';
      data.splice(insertAt, 0, newRow);
      markDirty();
      renderTable();
    },
    insertRowBelow: function () {
      var insertAt = sel.start ? sel.start[0] + 1 : data.length;
      var newRow = [];
      for (var k = 0; k < (data[0] || []).length; k++) newRow[k] = '';
      data.splice(insertAt, 0, newRow);
      markDirty();
      renderTable();
    },
    insertColLeft: function () {
      var insertAt = sel.start ? sel.start[1] : 0;
      for (var k = 0; k < data.length; k++) data[k].splice(insertAt, 0, '');
      markDirty();
      renderTable();
    },
    insertColRight: function () {
      var insertAt = sel.start ? sel.start[1] + 1 : (data[0] || []).length;
      for (var k = 0; k < data.length; k++) data[k].splice(insertAt, 0, '');
      markDirty();
      renderTable();
    },
    deleteRow: function () {
      if (!sel.start) return toast('请先选中一行', 'warning');
      if (data.length <= 1) return toast('至少保留一行', 'warning');
      data.splice(sel.start[0], 1);
      sel = { start: null, end: null };
      markDirty();
      renderTable();
    },
    deleteCol: function () {
      if (!sel.start) return toast('请先选中一列', 'warning');
      if ((data[0] || []).length <= 1) return toast('至少保留一列', 'warning');
      var c = sel.start[1];
      for (var k = 0; k < data.length; k++) data[k].splice(c, 1);
      sel = { start: null, end: null };
      markDirty();
      renderTable();
    },
    clearCell: function () {
      if (!sel.start) return toast('请先选中单元格', 'warning');
      data[sel.start[0]][sel.start[1]] = { v: '' };
      markDirty();
      renderTable();
    },
    save: function () { saveExcel(); },

    // ─── Formula tab (学 OO Formula Tab) ───
    insertFormula: function (fnName) {
      if (!sel.start) return toast('请先选中单元格', 'warning');
      var r = sel.start[0], c = sel.start[1];
      // 从选中范围收集数值
      var r1 = sel.start[0], c1 = sel.start[1];
      var r2 = sel.end ? sel.end[0] : r1, c2 = sel.end ? sel.end[1] : c1;
      var values = [];
      for (var ri = Math.min(r1,r2); ri <= Math.max(r1,r2); ri++) {
        for (var ci = Math.min(c1,c2); ci <= Math.max(c1,c2); ci++) {
          var v = data[ri] ? cellStr(data[ri][ci]) : '';
          if (v !== '' && v != null && !isNaN(parseFloat(v)) && isFinite(v)) values.push(parseFloat(v));
        }
      }
      var result = '';
      switch (fnName) {
        case 'SUM':   result = values.reduce(function(a,b){return a+b;}, 0); break;
        case 'AVG':   result = values.length ? values.reduce(function(a,b){return a+b;}, 0) / values.length : 0; break;
        case 'COUNT': result = values.length; break;
        case 'MAX':   result = values.length ? Math.max.apply(null, values) : ''; break;
        case 'MIN':   result = values.length ? Math.min.apply(null, values) : ''; break;
        default: return toast('未知公式: ' + fnName, 'error');
      }
      data[r][c] = String(result);
      markDirty();
      renderTable();
      toast(fnName + ' = ' + result, 'success');
    },
    autoSum: function () {
      if (!sel.start) return toast('请先选中单元格', 'warning');
      var r = sel.start[0], c = sel.start[1];
      // 向上或向左找数值
      var vals = [];
      // 先向上找
      for (var ri = r - 1; ri >= 0; ri--) {
        var v = data[ri] ? cellStr(data[ri][c]) : '';
        if (v === '' || v == null) break;
        if (!isNaN(parseFloat(v)) && isFinite(v)) vals.push(parseFloat(v));
        else break;
      }
      if (vals.length === 0) {
        // 再向左找
        for (var ci = c - 1; ci >= 0; ci--) {
          var v2 = data[r] ? cellStr(data[r][ci]) : '';
          if (v2 === '' || v2 == null) break;
          if (!isNaN(parseFloat(v2)) && isFinite(v2)) vals.push(parseFloat(v2));
          else break;
        }
      }
      var sum = vals.reduce(function(a,b){return a+b;}, 0);
      data[r][c] = String(sum);
      markDirty();
      renderTable();
      toast('自动求和 = ' + sum, 'success');
    },

    // ─── Data tab (学 OO Data Tab) ───
    sortRange: function (ascending) {
      if (!sel.start || !sel.end) return toast('请先选中一个区域', 'warning');
      var r1 = Math.min(sel.start[0], sel.end[0]);
      var r2 = Math.max(sel.start[0], sel.end[0]);
      var c1 = Math.min(sel.start[1], sel.end[1]);
      var c2 = Math.max(sel.start[1], sel.end[1]);
      // 提取区域数据
      var rows = [];
      for (var ri = r1; ri <= r2; ri++) {
        rows.push({ idx: ri, cells: data[ri].slice(c1, c2 + 1) });
      }
      // 按第1列排序
      rows.sort(function (a, b) {
        var va = parseFloat(cellStr(a.cells[0])), vb = parseFloat(cellStr(b.cells[0]));
        if (!isNaN(va) && !isNaN(vb)) return ascending ? va - vb : vb - va;
        var sa = cellStr(a.cells[0] || ''), sb = cellStr(b.cells[0] || '');
        return ascending ? sa.localeCompare(sb) : sb.localeCompare(sa);
      });
      // 写回 data
      rows.forEach(function (row, i) {
        for (var ci = c1; ci <= c2; ci++) {
          data[r1 + i][ci] = row.cells[ci - c1];
        }
      });
      markDirty();
      renderTable();
      toast('已排序 ' + (r2 - r1 + 1) + ' 行 ' + (ascending ? '升序' : '降序'), 'success');
    },
    // v0.65: 排序对话框 — 选列 + 方向
    openSortDialog: function () {
      if (!sel.start) return toast('请先选中数据区域', 'warning');
      var r1 = Math.min(sel.start[0], sel.end[0]);
      var c1 = Math.min(sel.start[1], sel.end[1]);
      var c2 = Math.max(sel.start[1], sel.end[1]);
      // 构建列选择
      var colOpts = [];
      for (var c = c1; c <= c2; c++) {
        var header = cellStr(data[r1] && data[r1][c]);
        colOpts.push({ value: c, label: (header || colLetter(c)) + ' (' + colLetter(c) + ')' });
      }
      if (colOpts.length === 0) return toast('没有数据列', 'warning');
      var dlg = document.createElement('div');
      dlg.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:100000;display:flex;align-items:center;justify-content:center;';
      var box = document.createElement('div');
      box.style.cssText = 'background:var(--bg,#fff);border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.2);padding:20px 24px;min-width:300px;';
      box.innerHTML = '<h3 style="margin:0 0 16px;font-size:15px;color:var(--text,#333)">排序</h3>';
      var sel = document.createElement('select');
      sel.style.cssText = 'width:100%;padding:6px 8px;margin-bottom:10px;border:1px solid var(--office-divider);border-radius:4px;font-size:13px;';
      colOpts.forEach(function(o){ var op = document.createElement('option'); op.value = o.value; op.textContent = o.label; sel.appendChild(op); });
      var dir = document.createElement('select');
      dir.style.cssText = 'width:100%;padding:6px 8px;margin-bottom:16px;border:1px solid var(--office-divider);border-radius:4px;font-size:13px;';
      dir.innerHTML = '<option value="asc">升序 ↑</option><option value="desc">降序 ↓</option>';
      var btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
      var cancelBtn = document.createElement('button');
      cancelBtn.textContent = '取消';
      cancelBtn.style.cssText = 'padding:6px 16px;border:1px solid var(--office-divider);border-radius:4px;background:var(--bg,#fff);cursor:pointer;font-size:13px;';
      var okBtn = document.createElement('button');
      okBtn.textContent = '确定';
      okBtn.style.cssText = 'padding:6px 16px;border:none;border-radius:4px;background:var(--office-primary);color:#fff;cursor:pointer;font-size:13px;';
      btns.appendChild(cancelBtn);
      btns.appendChild(okBtn);
      box.appendChild(sel);
      box.appendChild(dir);
      box.appendChild(btns);
      dlg.appendChild(box);
      document.body.appendChild(dlg);
      // 事件
      cancelBtn.onclick = function(){ document.body.removeChild(dlg); };
      dlg.onclick = function(e){ if(e.target === dlg) document.body.removeChild(dlg); };
      okBtn.onclick = function(){
        document.body.removeChild(dlg);
        var sortCol = parseInt(sel.value);
        var ascending = dir.value === 'asc';
        // 排序 r1+1 到 r2 行（跳过标题行 r1）
        var sortR1 = r1, sortR2 = Math.max(r1 + 1, r2);
        var rows = [];
        for (var ri = sortR1; ri <= sortR2; ri++) {
          rows.push({ idx: ri, cells: data[ri].slice() });
        }
        rows.sort(function(a, b) {
          var va = parseFloat(cellStr(a.cells[sortCol])), vb = parseFloat(cellStr(b.cells[sortCol]));
          if (!isNaN(va) && !isNaN(vb)) return ascending ? va - vb : vb - va;
          var sa = cellStr(a.cells[sortCol] || ''), sb = cellStr(b.cells[sortCol] || '');
          return ascending ? sa.localeCompare(sb) : sb.localeCompare(sa);
        });
        rows.forEach(function(row, i) {
          for (var c = 0; c < COLS; c++) data[sortR1 + i][c] = row.cells[c] || '';
        });
        markDirty();
        renderTable();
        toast('已按 ' + colLetter(sortCol) + ' ' + (ascending ? '升序' : '降序'), 'success');
      };
    },
    toggleFilter: function () {
      // v0.65: 增强为 AutoFilter — 带下拉箭头的列筛选
      autoFilterActive = !autoFilterActive;
      if (autoFilterActive) {
        toast('自动筛选已开启 — 点击列头 ▼ 筛选', 'info');
      } else {
        // 清除所有筛选状态
        window._excelFilterActive = false;
        // 恢复所有行
        w.$c.querySelectorAll('#xlsx-table tr').forEach(function(tr){ tr.style.display = ''; });
        toast('自动筛选已关闭', 'info');
      }
      renderTable();
    },
    clearAutoFilter: function () {
      autoFilterActive = false;
      window._excelFilterActive = false;
      w.$c.querySelectorAll('#xlsx-table tr').forEach(function(tr){ tr.style.display = ''; });
      toast('筛选已清除', 'info');
      renderTable();
    },
    openFilterDropdown: function (colIdx) {
      if (!autoFilterActive) return;
      // 获取该列所有唯一值（跳过第一行标题行）
      var uniqueVals = [];
      var allVals = [];
      for (var r = 0; r < data.length; r++) {
        var v = cellStr(data[r] && data[r][colIdx]);
        allVals.push(v);
        if (uniqueVals.indexOf(v) === -1) uniqueVals.push(v);
      }
      // 关闭之前的
      closeFilterMenu();
      // 创建下拉菜单
      var menu = document.createElement('div');
      menu.className = 'xlsx-filter-menu';
      menu.style.cssText = 'position:absolute;z-index:99999;background:var(--bg,#fff);border:1px solid var(--office-divider);border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,0.15);min-width:160px;max-height:300px;overflow-y:auto;padding:4px 0;';
      // 全选/全不选
      var allBtn = document.createElement('button');
      allBtn.style.cssText = 'display:block;width:100%;padding:6px 12px;border:none;background:var(--office-accent-soft);text-align:left;font-size:12px;cursor:pointer;color:var(--office-primary);font-weight:600;';
      allBtn.textContent = '✅ 全选';
      allBtn.onclick = function() {
        menu.querySelectorAll('.xlsx-filter-item input').forEach(function(cb){ cb.checked = true; });
        applyAutoFilter(colIdx, null); // null = 全选
      };
      menu.appendChild(allBtn);
      // 分隔线
      var sep = document.createElement('hr');
      sep.style.cssText = 'margin:4px 0;border:none;border-top:1px solid var(--office-divider);';
      menu.appendChild(sep);
      // 值列表
      uniqueVals.forEach(function(val) {
        var item = document.createElement('label');
        item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 12px;cursor:pointer;font-size:12px;color:var(--text,#333);';
        item.onmouseenter = function(){ this.style.background = 'var(--office-tab-hover-bg)'; };
        item.onmouseleave = function(){ this.style.background = ''; };
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.style.cursor = 'pointer';
        cb.onchange = function() {
          var allChecked = true;
          menu.querySelectorAll('.xlsx-filter-item input').forEach(function(c){ if(!c.checked) allChecked=false; });
          allBtn.textContent = allChecked ? '✅ 全选' : '☐ 部分选中';
        };
        var span = document.createElement('span');
        span.textContent = val === '' ? '(空白)' : val;
        span.style.overflow = 'hidden';
        span.style.textOverflow = 'ellipsis';
        span.style.whiteSpace = 'nowrap';
        span.style.maxWidth = '110px';
        item.appendChild(cb);
        item.appendChild(span);
        menu.appendChild(item);
      });
      // 应用/清除按钮
      var btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:4px;padding:6px 8px;border-top:1px solid var(--office-divider);';
      var applyBtn = document.createElement('button');
      applyBtn.style.cssText = 'flex:1;padding:4px;font-size:12px;border:1px solid var(--office-divider);border-radius:3px;background:var(--office-primary);color:#fff;cursor:pointer;';
      applyBtn.textContent = '确定';
      applyBtn.onclick = function() {
        var checkedVals = [];
        menu.querySelectorAll('.xlsx-filter-item input:checked').forEach(function(cb, i) {
          checkedVals.push(uniqueVals[i]);
        });
        applyAutoFilter(colIdx, checkedVals.length === uniqueVals.length ? null : checkedVals);
        closeFilterMenu();
      };
      var clearBtn = document.createElement('button');
      clearBtn.style.cssText = 'flex:1;padding:4px;font-size:12px;border:1px solid var(--office-divider);border-radius:3px;background:var(--bg,#fff);cursor:pointer;';
      clearBtn.textContent = '清除';
      clearBtn.onclick = function() {
        applyAutoFilter(colIdx, null);
        closeFilterMenu();
      };
      btnRow.appendChild(clearBtn);
      btnRow.appendChild(applyBtn);
      menu.appendChild(btnRow);
      document.body.appendChild(menu);
      activeFilterMenu = menu;
      // 定位：列头下方
      var th = w.$c.querySelector('.xlsx-col-header[data-col="' + colIdx + '"]');
      if (th) {
        var rect = th.getBoundingClientRect();
        menu.style.left = rect.left + 'px';
        menu.style.top = (rect.bottom + 4) + 'px';
      }
      // 点击外部关闭
      setTimeout(function() {
        document.addEventListener('mousedown', function handler(e) {
          if (!menu.contains(e.target) && e.target !== th) {
            closeFilterMenu();
            document.removeEventListener('mousedown', handler);
          }
        });
      }, 0);
    },
    closeFilterMenu: function() {
      if (activeFilterMenu) {
        document.body.removeChild(activeFilterMenu);
        activeFilterMenu = null;
      }
    },
    applyAutoFilter: function(colIdx, keepVals) {
      // keepVals: null = 显示全部, [] = 不显示任何, [vals] = 只显示这些
      var rows = w.$c.querySelectorAll('#xlsx-table tr');
      rows.forEach(function(tr, idx) {
        if (idx === 0) return; // 表头行不隐藏
        var show = true;
        if (keepVals !== null && keepVals.length > 0) {
          var cell = tr.querySelector('.xlsx-cell[data-c="' + colIdx + '"]');
          if (cell) {
            show = keepVals.indexOf(cell.textContent.trim()) !== -1;
          }
        }
        tr.style.display = show ? '' : 'none';
      });
      // 更新列头筛选指示器
      updateFilterIndicator(colIdx, keepVals);
      toast(keepVals === null ? '筛选已清除' : '已筛选 ' + keepVals.length + ' 项', 'info');
    },
    updateFilterIndicator: function(colIdx, keepVals) {
      var th = w.$c.querySelector('.xlsx-col-header[data-col="' + colIdx + '"]');
      if (!th) return;
      var badge = th.querySelector('.xlsx-filter-badge');
      if (keepVals === null || keepVals === undefined) {
        if (badge) badge.remove();
      } else if (keepVals.length > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'xlsx-filter-badge';
          th.appendChild(badge);
        }
        badge.textContent = keepVals.length;
        badge.title = '已筛选 ' + keepVals.length + ' 项';
      }
    },
    // ─── v0.64: 查找/替换 ───
    openSearch: function () {
      var bar = w.$c.querySelector('#xlsx-search-bar');
      if (!bar) return;
      var isOpen = bar.classList.contains('is-open');
      bar.classList.toggle('is-open', !isOpen);
      if (!isOpen && bar.querySelector('#xlsx-search-input')) {
        bar.querySelector('#xlsx-search-input').focus();
      }
    },
    closeSearch: function () {
      var bar = w.$c.querySelector('#xlsx-search-bar');
      if (bar) bar.classList.remove('is-open');
      // 清除高亮
      w.$c.querySelectorAll('.xlsx-cell.is-search-match').forEach(function(el) {
        el.classList.remove('is-search-match');
        el.style.background = '';
      });
    },
    toggleReplace: function () {
      var row = w.$c.querySelector('#xlsx-replace-row');
      if (row) row.classList.toggle('is-open');
    },
    doSearch: function (query) {
      if (!query || query.length === 0) {
        w.$c.querySelectorAll('.xlsx-cell.is-search-match').forEach(function(el) {
          el.classList.remove('is-search-match');
          el.style.background = '';
        });
        var countEl = w.$c.querySelector('#xlsx-search-count');
        if (countEl) countEl.textContent = '0/0';
        return;
      }
      // 清除之前高亮
      w.$c.querySelectorAll('.xlsx-cell.is-search-match').forEach(function(el) {
        el.classList.remove('is-search-match');
        el.style.background = '';
      });
      var cells = w.$c.querySelectorAll('.xlsx-cell');
      var matches = [];
      cells.forEach(function(el) {
        var text = el.textContent.trim();
        if (text.indexOf(query) !== -1) {
          el.classList.add('is-search-match');
          el.style.background = 'rgba(255,235,59,0.3)';
          matches.push(el);
        }
      });
      var countEl = w.$c.querySelector('#xlsx-search-count');
      if (countEl) countEl.textContent = matches.length + ' 个结果';
      // 默认高亮第一个
      if (matches.length > 0) {
        window._excelSearchMatches = matches;
        window._excelSearchIdx = 0;
        matches[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else {
        window._excelSearchMatches = [];
        window._excelSearchIdx = -1;
      }
    },
    searchNext: function () {
      var matches = window._excelSearchMatches || [];
      if (matches.length === 0) return;
      var idx = (window._excelSearchIdx + 1) % matches.length;
      window._excelSearchIdx = idx;
      matches[idx].scrollIntoView({ block: 'center', behavior: 'smooth' });
      matches[idx].focus();
    },
    searchPrev: function () {
      var matches = window._excelSearchMatches || [];
      if (matches.length === 0) return;
      var idx = (window._excelSearchIdx - 1 + matches.length) % matches.length;
      window._excelSearchIdx = idx;
      matches[idx].scrollIntoView({ block: 'center', behavior: 'smooth' });
      matches[idx].focus();
    },
    doReplace: function (newVal) {
      if (window._excelSearchIdx < 0 || !window._excelSearchMatches) return;
      var el = window._excelSearchMatches[window._excelSearchIdx];
      if (!el) return;
      var r = parseInt(el.dataset.r), c = parseInt(el.dataset.c);
      data[r][c] = newVal;
      markDirty();
      el.textContent = newVal;
      this.doSearch(w.$c.querySelector('#xlsx-search-input')?.value || '');
    },
    doReplaceAll: function (newVal) {
      var query = w.$c.querySelector('#xlsx-search-input')?.value || '';
      if (!query) return;
      var cells = w.$c.querySelectorAll('.xlsx-cell');
      var count = 0;
      cells.forEach(function(el) {
        var text = el.textContent.trim();
        if (text.indexOf(query) !== -1) {
          var r = parseInt(el.dataset.r), c = parseInt(el.dataset.c);
          data[r][c] = newVal;
          el.textContent = newVal;
          count++;
        }
      });
      markDirty();
      toast('已替换 ' + count + ' 处', 'success');
      this.doSearch(query);
    },
    // ─── v0.64: 冻结窗格 ───
    toggleFreeze: function () {
      if (freezeRow === -1) {
        freezeRow = 0;
        toast('已冻结首行', 'info');
      } else {
        freezeRow = -1;
        toast('已取消冻结', 'info');
      }
      // 更新按钮状态
      var btn = w.$c.querySelector('#xlsx-freeze-btn');
      if (btn) {
        btn.style.background = freezeRow >= 0 ? 'var(--office-accent-soft)' : '';
        btn.style.color = freezeRow >= 0 ? 'var(--office-primary)' : '';
      }
      // 重新渲染表格以应用冻结
      var table = w.$c.querySelector('#xlsx-table');
      if (table) {
        var rows = table.querySelectorAll('tr');
        rows.forEach(function(tr, i) {
          if (i === 0) {
            tr.classList.toggle('xlsx-row-frozen', freezeRow >= 0);
          }
        });
      }
      // 显示/隐藏冻结指示器
      var indicator = w.$c.querySelector('#xlsx-freeze-indicator');
      if (indicator) indicator.classList.toggle('is-show', freezeRow >= 0);
      markDirty();
    },
    // ─── v0.64: 填充柄 ───
    openFormulaDialog: function () {
      if (!sel.start) return toast('请先选中单元格', 'warning');
      // 显示/隐藏公式对话框
      var dialog = w.$c.querySelector('#xlsx-formula-dialog');
      if (dialog) {
        dialog.classList.toggle('is-open');
        if (dialog.classList.contains('is-open')) {
          // 定位到公式栏下方
          var fb = w.$c.querySelector('#xlsx-formula-bar');
          if (fb) {
            var rect = fb.getBoundingClientRect();
            dialog.style.top = (rect.bottom + 4) + 'px';
            dialog.style.left = rect.left + 'px';
          }
          // 初始化类别列表
          renderFormulaCategories();
        }
      }
    },
    // v0.62.6: Undo/Redo
    undo: function () { xlUndo(); },
    redo: function () { xlRedo(); },
    toggleBold: function () {
      if (!sel.start) return;
      var r = sel.start[0], c = sel.start[1];
      var fmt = cellFmt(data[r][c]);
      fmt.bold = !fmt.bold;
      setCellFmt(r, c, fmt);
      applyCellStyle(r, c);
      markDirty();
    },
    toggleItalic: function () {
      if (!sel.start) return;
      var r = sel.start[0], c = sel.start[1];
      var fmt = cellFmt(data[r][c]);
      fmt.italic = !fmt.italic;
      setCellFmt(r, c, fmt);
      applyCellStyle(r, c);
      markDirty();
    },
    toggleUnderline: function () {
      if (!sel.start) return;
      var r = sel.start[0], c = sel.start[1];
      var fmt = cellFmt(data[r][c]);
      fmt.underline = !fmt.underline;
      setCellFmt(r, c, fmt);
      applyCellStyle(r, c);
      markDirty();
    },
    // v0.63 Phase1: 格式操作
    setFillColor: function (color) {
      if (!sel.start) return;
      var r = sel.start[0], c = sel.start[1];
      setCellFmt(r, c, { fill: color });
      applyCellStyle(r, c);
      markDirty();
    },
    setTextColor: function (color) {
      if (!sel.start) return;
      var r = sel.start[0], c = sel.start[1];
      setCellFmt(r, c, { color: color });
      applyCellStyle(r, c);
      markDirty();
    },
    setNumFmt: function (fmt) {
      if (!sel.start) return;
      var r = sel.start[0], c = sel.start[1];
      var cell = data[r][c];
      var v = cellStr(cell);
      var display = v;
      if (isNum(v)) {
        if (fmt === 'number') display = parseFloat(v).toFixed(2);
        else if (fmt === 'currency') display = '¥' + parseFloat(v).toFixed(2);
        else if (fmt === 'percent') display = (parseFloat(v) * 100).toFixed(1) + '%';
      }
      setCellFmt(r, c, { numFmt: fmt });
      // 更新显示
      var el = w.$c.querySelector('.xlsx-cell[data-r="' + r + '"][data-c="' + c + '"]');
      if (el) el.textContent = display;
      updateFormulaBar();
      markDirty();
    },
    // v0.62.7: Layout
    setXlMargin: function (size) {
      var tbl = w.$c.querySelector('#xlsx-table');
      if (!tbl) return;
      var margins = { narrow: '0 8px', normal: '0 16px', wide: '0 32px' };
      tbl.style.margin = margins[size] || margins.normal;
      if (window.__xlRibbon) {
        Object.keys(margins).forEach(function(k){ window.__xlRibbon.setButtonActive('layout', 'xl-margin-' + k, k === size); });
      }
    },
    setXlOrientation: function (orient) {
      var cont = w.$c.querySelector('.xlsx-table-wrap');
      if (!cont) return;
      if (orient === 'landscape') { cont.style.maxWidth = '1200px'; }
      else { cont.style.maxWidth = ''; }
      if (window.__xlRibbon) {
        ['portrait','landscape'].forEach(function(o){ window.__xlRibbon.setButtonActive('layout', 'xl-orient-' + o, o === orient); });
      }
    },
    // ─── v0.65: 对齐方式 ───
    setAlign: function(dir) {
      if (!sel.start) return;
      var r1 = Math.min(sel.start[0], sel.end[0]);
      var c1 = Math.min(sel.start[1], sel.end[1]);
      var r2 = Math.max(sel.start[0], sel.end[0]);
      var c2 = Math.max(sel.start[1], sel.end[1]);
      for (var r = r1; r <= r2; r++) {
        for (var c = c1; c <= c2; c++) {
          setCellFmt(r, c, { align: dir });
        }
      }
      reapplyCellStyles(r1, c1, r2, c2);
      markDirty();
    },
    setValign: function(dir) {
      if (!sel.start) return;
      var r1 = Math.min(sel.start[0], sel.end[0]);
      var c1 = Math.min(sel.start[1], sel.end[1]);
      var r2 = Math.max(sel.start[0], sel.end[0]);
      var c2 = Math.max(sel.start[1], sel.end[1]);
      for (var r = r1; r <= r2; r++) {
        for (var c = c1; c <= c2; c++) {
          setCellFmt(r, c, { valign: dir });
        }
      }
      reapplyCellStyles(r1, c1, r2, c2);
      markDirty();
    },
    toggleWrap: function () {
      if (!sel.start) return;
      var r1 = Math.min(sel.start[0], sel.end[0]);
      var c1 = Math.min(sel.start[1], sel.end[1]);
      var r2 = Math.max(sel.start[0], sel.end[0]);
      var c2 = Math.max(sel.start[1], sel.end[1]);
      for (var r = r1; r <= r2; r++) {
        for (var c = c1; c <= c2; c++) {
          var fmt = cellFmt(data[r] && data[r][c]);
          fmt.wrap = !fmt.wrap;
          setCellFmt(r, c, fmt);
        }
      }
      reapplyCellStyles(r1, c1, r2, c2);
      markDirty();
    },
    // ─── v0.65: 合并单元格 ───
    mergeCells: function () {
      if (!sel.start || !sel.end) return toast('请先选中一个区域', 'warning');
      var r1 = Math.min(sel.start[0], sel.end[0]);
      var c1 = Math.min(sel.start[1], sel.end[1]);
      var r2 = Math.max(sel.start[0], sel.end[0]);
      var c2 = Math.max(sel.start[1], sel.end[1]);
      if (r1 === r2 && c1 === c2) return toast('合并单个单元格无意义', 'warning');
      // 检查是否已有重叠的合并区域
      for (var i = 0; i < mergedRanges.length; i++) {
        var m = mergedRanges[i];
        if (!(r2 < m.r1 || r1 > m.r2 || c2 < m.c1 || c1 > m.c2)) {
          return toast('所选区域与已有合并区域重叠', 'warning');
        }
      }
      // 清除目标区域内已有的合并
      mergedRanges = mergedRanges.filter(function(m) {
        return !(r2 < m.r1 || r1 > m.r2 || c2 < m.c1 || c1 > m.c2);
      });
      mergedRanges.push({ r1: r1, c1: c1, r2: r2, c2: c2 });
      markDirty();
      renderTable();
      toast('已合并 ' + (r2-r1+1) + '×' + (c2-c1+1) + ' 单元格', 'success');
    },
    unmergeCells: function () {
      if (!sel.start) return toast('请先选中合并区域中的单元格', 'warning');
      var r = sel.start[0], c = sel.start[1];
      mergedRanges = mergedRanges.filter(function(m) {
        return !(r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2);
      });
      markDirty();
      renderTable();
      toast('已取消合并', 'success');
    },
    // ─── v0.65: 边框 ───
    setBorder: function(side, color) {
      if (!sel.start) return;
      var r1 = Math.min(sel.start[0], sel.end[0]);
      var c1 = Math.min(sel.start[1], sel.end[1]);
      var r2 = Math.max(sel.start[0], sel.end[0]);
      var c2 = Math.max(sel.start[1], sel.end[1]);
      for (var r = r1; r <= r2; r++) {
        for (var c = c1; c <= c2; c++) {
          var key = r + '-' + c;
          if (!cellBorders[key]) cellBorders[key] = {};
          cellBorders[key][side] = color || '#333333';
        }
      }
      renderTable();
      markDirty();
    },
    setAllBorders: function(color) {
      if (!sel.start) return;
      var r1 = Math.min(sel.start[0], sel.end[0]);
      var c1 = Math.min(sel.start[1], sel.end[1]);
      var r2 = Math.max(sel.start[0], sel.end[0]);
      var c2 = Math.max(sel.start[1], sel.end[1]);
      for (var r = r1; r <= r2; r++) {
        for (var c = c1; c <= c2; c++) {
          var key = r + '-' + c;
          if (!cellBorders[key]) cellBorders[key] = {};
          cellBorders[key].top = color || '#333333';
          cellBorders[key].bottom = color || '#333333';
          cellBorders[key].left = color || '#333333';
          cellBorders[key].right = color || '#333333';
        }
      }
      renderTable();
      markDirty();
    },
    clearBorders: function () {
      if (!sel.start) return;
      var r1 = Math.min(sel.start[0], sel.end[0]);
      var c1 = Math.min(sel.start[1], sel.end[1]);
      var r2 = Math.max(sel.start[0], sel.end[0]);
      var c2 = Math.max(sel.start[1], sel.end[1]);
      for (var r = r1; r <= r2; r++) {
        for (var c = c1; c <= c2; c++) {
          delete cellBorders[r + '-' + c];
        }
      }
      renderTable();
      markDirty();
    },
    // ─── v0.65: 文字旋转 ───
    setOrientation: function(deg) {
      if (!sel.start) return;
      var r1 = Math.min(sel.start[0], sel.end[0]);
      var c1 = Math.min(sel.start[1], sel.end[1]);
      var r2 = Math.max(sel.start[0], sel.end[0]);
      var c2 = Math.max(sel.start[1], sel.end[1]);
      for (var r = r1; r <= r2; r++) {
        for (var c = c1; c <= c2; c++) {
          setCellFmt(r, c, { orient: deg });
        }
      }
      reapplyCellStyles(r1, c1, r2, c2);
      markDirty();
      toast('文字旋转 ' + deg + '°', 'info');
    },
    // ─── v0.65: 条件格式（简单高亮）───
    condFormatGreaterThan: function() {
      if (!sel.start) return toast('请先选中区域', 'warning');
      var r1 = Math.min(sel.start[0], sel.end[0]);
      var c1 = Math.min(sel.start[1], sel.end[1]);
      var r2 = Math.max(sel.start[0], sel.end[0]);
      var c2 = Math.max(sel.start[1], sel.end[1]);
      var threshold = prompt('条件格式 — 显示大于该值的单元格（输入数字）:', '0');
      if (threshold === null) return;
      var t = parseFloat(threshold);
      if (isNaN(t)) return toast('无效数字', 'warning');
      var count = 0;
      for (var r = r1; r <= r2; r++) {
        for (var c = c1; c <= c2; c++) {
          var n = parseFloat(cellStr(data[r][c]));
          if (!isNaN(n) && n > t) {
            setCellFmt(r, c, { highlight: '#fff3cd' }); // 浅黄背景
            count++;
          }
        }
      }
      markDirty();
      renderTable();
      toast('高亮 ' + count + ' 个大于 ' + t + ' 的单元格', 'success');
    },
    condFormatClear: function() {
      if (!sel.start) return;
      var r1 = Math.min(sel.start[0], sel.end[0]);
      var c1 = Math.min(sel.start[1], sel.end[1]);
      var r2 = Math.max(sel.start[0], sel.end[0]);
      var c2 = Math.max(sel.start[1], sel.end[1]);
      for (var r = r1; r <= r2; r++) {
        for (var c = c1; c <= c2; c++) {
          setCellFmt(r, c, { highlight: null });
        }
      }
      markDirty();
      renderTable();
      toast('已清除条件格式', 'info');
    },
    // ─── v0.65: 移除重复值 ───
    removeDuplicates: function() {
      if (!sel.start) return toast('请先选中数据区域（含标题行）', 'warning');
      var r1 = Math.min(sel.start[0], sel.end[0]);
      var c1 = Math.min(sel.start[1], sel.end[1]);
      var r2 = Math.max(sel.start[0], sel.end[0]);
      var c2 = Math.max(sel.start[1], sel.end[1]);
      if (r2 <= r1) return toast('请选择多行数据', 'warning');
      // 标记重复行（从 r1+1 开始，第一行 r1 是标题）
      var firstSeen = {};
      var toDelete = {};
      var removed = 0;
      for (var r = r1 + 1; r <= r2; r++) {
        var key = [];
        for (var c = c1; c <= c2; c++) key.push(cellStr(data[r][c]));
        var k = key.join('\t');
        if (firstSeen[k]) {
          toDelete[r] = true;
          removed++;
        } else {
          firstSeen[k] = true;
        }
      }
      if (removed === 0) return toast('没有重复行', 'info');
      // 重建 data，删除重复行
      var result = [];
      for (var r = 0; r < data.length; r++) {
        if (r >= r1 + 1 && r <= r2 && toDelete[r]) continue;
        result.push(data[r]);
      }
      // 填充空行保持结构
      while (result.length < data.length) {
        var nr = [];
        for (var c = 0; c < COLS; c++) nr.push('');
        result.push(nr);
      }
      for (var r = 0; r < result.length; r++) {
        for (var c = 0; c < COLS; c++) {
          data[r][c] = result[r][c];
        }
      }
      markDirty();
      renderTable();
      toast('已移除 ' + removed + ' 行重复值', 'success');
    },
  };

  // ─── v0.65: 辅助函数：重应用样式到选区 ───
  function reapplyCellStyles(r1, c1, r2, c2) {
    for (var r = r1; r <= r2; r++) {
      for (var c = c1; c <= c2; c++) {
        applyCellStyle(r, c);
      }
    }
  }

  function markDirty() {
    isDirty = true;
    var dot = w.$c.querySelector('#xlsx-modified-dot');
    if (dot) { dot.classList.add('is-dirty'); dot.classList.remove('is-saved'); dot.title = '已修改未保存'; }
  }

  function markSaved() {
    isDirty = false;
    var dot = w.$c.querySelector('#xlsx-modified-dot');
    if (dot) { dot.classList.remove('is-dirty'); dot.classList.add('is-saved'); dot.title = '已保存';
      setTimeout(function(){ dot.classList.remove('is-saved'); }, 1200); }
  }

  // v0.62.6: Excel Undo/Redo
  var xlUndoStack = [];
  var xlRedoStack = [];
  function xlSnapshot() { return JSON.parse(JSON.stringify({ data: data, sheets: sheets, currentSheetIdx: currentSheetIdx })); }
  function xlPushUndo() {
    xlUndoStack.push(xlSnapshot());
    if (xlUndoStack.length > 30) xlUndoStack.shift();
    xlRedoStack = [];
  }
  function xlRestoreState(s) {
    data.length = 0; s.data.forEach(function(r){ data.push(r); });
    sheets.length = 0; s.sheets.forEach(function(sh){ sheets.push({ name: sh.name, data: sh.data }); });
    currentSheetIdx = s.currentSheetIdx;
    data = sheets[currentSheetIdx].data;
    renderTable();
  }
  function xlUndo() {
    if (xlUndoStack.length < 2) return;
    xlRedoStack.push(xlSnapshot());
    var s = xlUndoStack.pop();
    xlRestoreState(xlUndoStack[xlUndoStack.length - 1]);
    markDirty();
  }
  function xlRedo() {
    if (!xlRedoStack.length) return;
    xlUndoStack.push(xlSnapshot());
    var s = xlRedoStack.pop();
    xlRestoreState(s);
    markDirty();
  }

  // 名称框 — 同步显示/编辑当前 cell 坐标 (学 OO Spreadsheet Name Box)
  function updateNameBox() {
    var box = w.$c.querySelector('#xlsx-namebox');
    if (!box) return;
    if (!sel.start) { box.value = ''; return; }
    var r = sel.start[0], c = sel.start[1];
    box.value = colLetter(c) + (r + 1);
  }

  // v0.63 Phase1: 公式栏同步
  function updateFormulaBar() {
    var fx = w.$c.querySelector('#xlsx-fx-input');
    if (!fx || !sel.start) return;
    var r = sel.start[0], c = sel.start[1];
    fx.value = cellStr(data[r] && data[r][c]);
  }

  function renderTable() {
    // v0.62.5: 容器套 .oo-editor oo-editor-xlsx class（让 Excel 墨绿色主题生效）
    var h = '<div class="oo-editor oo-editor-xlsx" style="display:flex;flex-direction:column;height:100%">';
    // OO 风格标题栏（v0.62.5: 简化 — 只留文件名 + 保存, 功能按钮移到 Ribbon）
    h += '<div class="oo-titlebar">';
    h += '<span class="oo-titlebar-icon">📊</span>';
    h += '<div class="oo-titlebar-name">';
    h += '<input id="xlsx-title-input" value="未命名.xlsx" placeholder="未命名.xlsx">';
    h += '<span id="xlsx-modified-dot" class="oo-modified-dot" title="未修改"></span>';
    h += '</div>';
    h += '<div class="oo-titlebar-actions">';
    h += '<button class="oo-titlebar-btn" id="xlsx-export-csv-btn" title="导出 CSV">📄 CSV</button>';
    h += '<button class="oo-titlebar-btn primary" id="xlsx-save-btn">💾 保存</button>';
    h += '</div>';
    h += '</div>';
    // v0.62.5: Ribbon 工具栏（学 OO TabBar.js + FileMenu.js）
    h += '<div id="xlsx-ribbon-host" style="flex-shrink:0"></div>';
    // v0.63 Phase1: 公式栏（学 OO valueField — 始终显示当前选中 cell 内容）
    h += '<div id="xlsx-formula-bar" style="display:flex;align-items:center;flex-shrink:0;height:26px;background:var(--office-paper-bg);border-bottom:1px solid var(--office-divider);padding:0 4px;gap:4px;position:relative">';
    h += '<input id="xlsx-namebox" class="oo-statusbar-namebox" placeholder="A1" style="width:70px;height:20px;font-size:12px;margin:0" title="当前选中单元格（输入跳转）">';
    h += '<span style="font-size:11px;color:var(--text2,#888);padding:0 4px">fx</span>';
    h += '<input id="xlsx-fx-input" type="text" style="flex:1;height:20px;font-size:12px;font-family:monospace;border:1px solid var(--office-divider);border-radius:2px;padding:0 6px;background:var(--bg,#fff);color:var(--text,#333);outline:none" placeholder="单元格内容或公式">';
    h += '<button id="xlsx-fx-btn" style="width:20px;height:20px;border:1px solid var(--office-divider);border-radius:2px;background:var(--bg2,#f5f5f7);cursor:pointer;font-size:10px;color:var(--text2,#888);flex-shrink:0" title="公式选择器">ƒ</button>';
    h += '</div>';
    // v0.64: 查找/替换栏（学 OO SearchBar.js）
    h += '<div id="xlsx-search-bar">';
    h += '<input id="xlsx-search-input" type="search" placeholder="查找..." autocomplete="off">';
    h += '<span id="xlsx-search-count" class="xlsx-search-count">0/0</span>';
    h += '<button id="xlsx-search-prev" class="oo-searchbar-btn" title="上一个">▲</button>';
    h += '<button id="xlsx-search-next" class="oo-searchbar-btn" title="下一个">▼</button>';
    h += '<button id="xlsx-search-replace" class="oo-searchbar-btn" title="替换">⇥</button>';
    h += '<button id="xlsx-search-close" class="oo-searchbar-btn" title="关闭 (Esc)">✕</button>';
    h += '<div id="xlsx-replace-row" class="xlsx-replace-row">';
    h += '<input id="xlsx-replace-input" type="text" placeholder="替换为...">';
    h += '<button id="xlsx-replace-one" class="oo-searchbar-btn">替换</button>';
    h += '<button id="xlsx-replace-all" class="oo-searchbar-btn">全部替换</button>';
    h += '</div>';
    h += '</div>';
    // 表格区
    h += '<div id="xlsx-table-wrap" style="flex:1;overflow:auto;padding:4px">';
    h += '<table id="xlsx-table" style="border-collapse:collapse;width:100%;font-size:13px">';
    // v0.65: 构建合并单元格映射（跳过已在合并区域内的非起始单元格）
    var skipCell = function(r, c) {
      for (var i = 0; i < mergedRanges.length; i++) {
        var m = mergedRanges[i];
        // 在合并区域内，但不是起始单元格才跳过
        if (r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) {
          if (!(r === m.r1 && c === m.c1)) return true;
        }
      }
      return false;
    };
    // 调试日志
    console.log('[xlsx] data.length:', data.length);
    console.log('[xlsx] data[0]:', data[0]);
    console.log('[xlsx] data[1]:', data[1]);
    console.log('[xlsx] maxCols:', maxCols);
    
    h += '<tr><th class="xlsx-corner-th" style="border:1px solid #ccc;background:var(--bg2);padding:4px 6px;min-width:30px;text-align:center;font-weight:600;position:sticky;top:0;left:0;z-index:3">#</th>';
    var maxCols = 0;
    for (var ri0 = 0; ri0 < data.length; ri0++) { if ((data[ri0]||[]).length > maxCols) maxCols = data[ri0].length; }
    // v0.65: 计算列头的 colspan（基于第一行的合并区域）
    var colHeaderSpan = [];
    for (var ci = 0; ci < maxCols; ci++) { colHeaderSpan[ci] = 1; }
    for (var mi = 0; mi < mergedRanges.length; mi++) {
      var mr = mergedRanges[mi];
      if (mr.r1 === 0) { // 只在第一行处理列头合并
        for (var cc = mr.c1; cc <= mr.c2; cc++) {
          if (cc < maxCols) colHeaderSpan[cc] = mr.c2 - mr.c1 + 1;
        }
      }
    }
    // 渲染列头，使用 headers 作为列标题
    var ci = 0;
    while (ci < maxCols) {
      var span = colHeaderSpan[ci] || 1;
      var filterArrow = autoFilterActive ? '<span class="xlsx-filter-arrow" title="自动筛选">▼</span>' : '';
      var thStyle = 'border:1px solid #ccc;background:var(--bg2);padding:4px 6px;min-width:80px;text-align:center;font-weight:600;position:sticky;top:0;z-index:2;cursor:pointer;user-select:none';
      if (span > 1) thStyle += ';min-width:' + (80 * span) + 'px';
      // 使用 headers 作为列标题，如果没有 headers 则用列字母
      var colTitle = (data[0] && data[0][ci]) ? escHtml(data[0][ci]) : colLetter(ci);
      console.log('[xlsx] 渲染列头', ci, 'title:', colTitle, 'maxCols:', maxCols, 'data[0]:', data[0]);
      h += '<th class="xlsx-col-header" data-col="' + ci + '" colspan="' + span + '" style="' + thStyle + '">' + colTitle + filterArrow + '</th>';
      ci += span;
    }
    h += '</tr>';
    // 跳过第一行（headers），从第二行开始渲染数据
    for (var ri = 1; ri < data.length; ri++) {
      // v0.65: 检查当前行是否被上方合并区域占用（垂直合并中间行）
      var skipRow = false;
      for (var si = 0; si < mergedRanges.length; si++) {
        var sm = mergedRanges[si];
        if (ri > sm.r1 && ri <= sm.r2) { skipRow = true; break; }
      }
      if (skipRow) continue;
      // 计算当前行的 rowspan
      var rowSpan = 1;
      for (var i = 0; i < mergedRanges.length; i++) {
        if (mergedRanges[i].r1 === ri) rowSpan = mergedRanges[i].r2 - ri + 1;
      }
      var rowAttrs = rowSpan > 1 ? ' rowspan="' + rowSpan + '"' : '';
      h += '<tr><td class="xlsx-row-header" data-row="' + (ri - 1) + '" style="border:1px solid #ccc;background:var(--bg2);padding:4px 6px;text-align:center;font-size:11px;color:var(--text2);cursor:pointer;user-select:none">' + ri + '</td>';
      for (var ci2 = 0; ci2 < data[ri].length; ci2++) {
        if (skipCell(ri, ci2)) continue;
        // 检查是否需要 colspan
        var colSpan = 1;
        for (var j = 0; j < mergedRanges.length; j++) {
          if (mergedRanges[j].r1 === ri && mergedRanges[j].c1 === ci2) {
            colSpan = mergedRanges[j].c2 - ci2 + 1;
            break;
          }
        }
        var colSpanAttr = colSpan > 1 ? ' colspan="' + colSpan + '"' : '';
        var cell = data[ri][ci2];
        var val = escHtml(cellStr(cell));
        var fmt = cellFmt(cell);
        var style = 'outline:none;min-height:20px;padding:2px';
        if (fmt.bold) style += ';font-weight:bold';
        if (fmt.italic) style += ';font-style:italic';
        if (fmt.underline) style += ';text-decoration:underline';
        if (fmt.fill) style += ';background-color:' + fmt.fill;
        if (fmt.highlight) style += ';background-color:' + fmt.highlight;
        if (fmt.color) style += ';color:' + fmt.color;
        if (fmt.align) style += ';text-align:' + fmt.align;
        if (fmt.valign) style += ';vertical-align:' + fmt.valign;
        if (fmt.wrap) style += ';white-space:pre-wrap;';
        if (fmt.orientation) style += ';transform:rotate(' + fmt.orientation + 'deg);transform-origin:left top;';
        // v0.65: 边框
        var bk = ri + '-' + ci2;
        var bb = cellBorders[bk];
        if (bb) {
          if (bb.top) style += ';border-top:1px solid ' + bb.top;
          if (bb.bottom) style += ';border-bottom:1px solid ' + bb.bottom;
          if (bb.left) style += ';border-left:1px solid ' + bb.left;
          if (bb.right) style += ';border-right:1px solid ' + bb.right;
        }
        h += '<td style="border:1px solid #ccc;padding:2px 4px;min-width:80px"' + colSpanAttr + rowAttrs + '>' +
          '<div class="xlsx-cell" contenteditable style="' + style + '" data-r="' + ri + '" data-c="' + ci2 + '">' + val + '</div></td>';
      }
      h += '</tr>';
    }
    h += '</table></div>';
    // v0.62.5: 底部状态栏行（状态信息，名称框已移至公式栏 v0.63）
    h += '<div style="display:flex;align-items:center;background:var(--office-toolbar-bg);border-top:1px solid var(--office-divider);flex-shrink:0;height:28px">';
    h += '<div id="xlsx-status" class="oo-statusbar" style="flex:1;border:none;background:transparent;padding:0 8px">A1 · 总 ' + (data.length - 1) + ' 行 × ' + (data[0] ? data[0].length : 0) + ' 列</div>';
    h += '<button id="xlsx-freeze-btn" style="padding:2px 8px;font-size:11px;border:1px solid var(--office-divider);border-radius:3px;background:var(--bg,#fff);cursor:pointer;color:var(--text,#666);margin-right:4px" title="冻结首行">❄️ 冻结</button>';
    h += '</div>';
    // v0.62.5 PR-C: Sheet tabs (学 OO Spreadsheet 底部 sheet 切换条)
    h += '<div id="xlsx-sheets">';
    sheets.forEach(function(s, i) {
      var activeCls = i === currentSheetIdx ? ' is-active' : '';
      h += '<div class="xlsx-sheet-tab' + activeCls + '" data-i="' + i + '" title="' + escHtml(s.name) + '（双击改名 / 右键菜单）">';
      h += '<span class="xlsx-sheet-name">' + escHtml(s.name) + '</span>';
      if (sheets.length > 1) {
        h += '<button class="xlsx-sheet-close" data-i="' + i + '" title="删除 Sheet">×</button>';
      }
      h += '</div>';
    });
    h += '<button id="xlsx-add-sheet" class="xlsx-sheet-add" title="新建 Sheet">+</button>';
    h += '</div>';
    // v0.64: 公式选择器对话框（学 OO FormulaDialog.js）
    h += '<div id="xlsx-formula-dialog" style="display:none;position:absolute;top:0;left:0;z-index:10000;">';
    h += '<div class="xfd-search"><input id="xfd-search-input" type="text" placeholder="搜索函数..."></div>';
    h += '<div class="xfd-body">';
    h += '<div id="xfd-category-list" class="xfd-category-list"></div>';
    h += '<div id="xfd-function-list" class="xfd-function-list"></div>';
    h += '</div>';
    h += '<div id="xfd-preview" class="xfd-preview">选中函数查看详情</div>';
    h += '<div class="xfd-footer"><button id="xfd-cancel">取消</button><button id="xfd-ok" class="xfd-ok">插入</button></div>';
    h += '</div>';
    h += '</div>';
    h += '</div>';
    w.$c.innerHTML = h;

    // v0.62.5: Ribbon 挂载 — 学 OO FileMenu.js 的 Home/Insert 结构
    if (window.ACMSRibbon) {
      window.__xlRibbon = window.ACMSRibbon.create(w.$c.querySelector('#xlsx-ribbon-host'), {
        tabs: [
          {
            id: 'home', label: '🏠 Home',
            groups: [
              { title: '历史', buttons: [
                { id: 'undo', icon: '↩', label: '撤销', action: ops.undo },
                { id: 'redo', icon: '↪', label: '重做', action: ops.redo },
              ]},
              { title: '单元格', buttons: [
                { id: 'clear',     icon: '🧹', label: '清空', action: ops.clearCell },
                { id: 'bold',      icon: 'B',   label: '粗体', action: ops.toggleBold },
                { id: 'italic',    icon: 'I',   label: '斜体', action: ops.toggleItalic },
                { id: 'underline', icon: 'U',   label: '下划线', action: ops.toggleUnderline },
              ]},
              { title: '格式', buttons: [
                { id: 'fill-cc',   icon: '🎨', label: '背景',
                  action: function(){
                    var picker = document.createElement('input');
                    picker.type = 'color'; picker.value = '#ffff00';
                    picker.onchange = function(){ ops.setFillColor(this.value); };
                    picker.click();
                  } },
                { id: 'text-cc',   icon: 'A',   label: '字色',
                  action: function(){
                    var picker = document.createElement('input');
                    picker.type = 'color'; picker.value = '#000000';
                    picker.onchange = function(){ ops.setTextColor(this.value); };
                    picker.click();
                  } },
                { id: 'numfmt',    icon: '#',   label: '数字格式', type: 'select', value: 'general',
                  options: [
                    { value: 'general', label: '常规' },
                    { value: 'number',  label: '数字(2位)' },
                    { value: 'currency',label: '货币' },
                    { value: 'percent', label: '百分比' },
                  ],
                  action: function(v){ ops.setNumFmt(v); },
                },
                { id: 'cond-gt',   icon: '⚡', label: '高亮>',
                  action: ops.condFormatGreaterThan,
                },
                { id: 'cond-clr',  icon: '🗑️', label: '清除高亮', action: ops.condFormatClear },
              ]},
              { title: '对齐', buttons: [
                { id: 'align-l', icon: '≡', label: '左', action: function(){ ops.setAlign('left'); } },
                { id: 'align-c', icon: '≡', label: '中', action: function(){ ops.setAlign('center'); } },
                { id: 'align-r', icon: '≡', label: '右', action: function(){ ops.setAlign('right'); } },
                { id: 'wrap',    icon: '↩', label: '换行', action: ops.toggleWrap },
                { id: 'orient-90',  icon: '↕', label: '竖排', action: function(){ ops.setOrientation(90); } },
                { id: 'orient-45',  icon: '↗', label: '45°',  action: function(){ ops.setOrientation(45); } },
                { id: 'orient-reset', icon: '↔', label: '水平', action: function(){ ops.setOrientation(0); } },
              ]},
              { title: '合并', buttons: [
                { id: 'merge',   icon: '⊞', label: '合并', action: ops.mergeCells },
                { id: 'unmerge', icon: '⊟', label: '拆分', action: ops.unmergeCells },
              ]},
              { title: '边框', buttons: [
                { id: 'border-all', icon: '▣', label: '全部',
                  action: function(){
                    var picker = document.createElement('input');
                    picker.type = 'color'; picker.value = '#333333';
                    picker.onchange = function(){ ops.setAllBorders(this.value); };
                    picker.click();
                  } },
                { id: 'border-clear', icon: '⊘', label: '无', action: ops.clearBorders },
              ]},
              { title: '行列', buttons: [
                { id: 'add-row',   icon: '➕', label: '加行', action: ops.addRow },
                { id: 'add-col',   icon: '➕', label: '加列', action: ops.addCol },
                { id: 'del-row',   icon: '➖', label: '删行', action: ops.deleteRow },
                { id: 'del-col',   icon: '➖', label: '删列', action: ops.deleteCol },
              ]},
              { title: '查找', buttons: [
                { id: 'search', icon: '🔍', label: '查找替换', action: ops.openSearch },
              ]},
              { title: '视图', buttons: [
                { id: 'freeze', icon: '❄️', label: '冻结首行', action: ops.toggleFreeze },
              ]},

            ],
          },
          {
            id: 'insert', label: '➕ Insert',
            groups: [
              { title: '插入行', buttons: [
                { id: 'ins-row-above', icon: '⬆️', label: '上方', action: ops.insertRowAbove },
                { id: 'ins-row-below', icon: '⬇️', label: '下方', action: ops.insertRowBelow },
              ]},
              { title: '插入列', buttons: [
                { id: 'ins-col-left',  icon: '⬅️', label: '左侧', action: ops.insertColLeft },
                { id: 'ins-col-right', icon: '➡️', label: '右侧', action: ops.insertColRight },
              ]},
            ],
          },
          {
            id: 'formula', label: 'ƒ Formula',
            groups: [
              { title: '自动求和', buttons: [
                { id: 'auto-sum', icon: 'Σ', label: '自动求和', large: true, action: ops.autoSum },
              ]},
              { title: '常用函数', buttons: [
                { id: 'fn-sum',   icon: 'Σ', label: 'SUM',   action: function(){ ops.insertFormula('SUM'); } },
                { id: 'fn-avg',   icon: 'x̄', label: 'AVG',   action: function(){ ops.insertFormula('AVG'); } },
                { id: 'fn-count', icon: '#', label: 'COUNT', action: function(){ ops.insertFormula('COUNT'); } },
                { id: 'fn-max',   icon: '↑', label: 'MAX',   action: function(){ ops.insertFormula('MAX'); } },
                { id: 'fn-min',   icon: '↓', label: 'MIN',   action: function(){ ops.insertFormula('MIN'); } },
              ]},
            ],
          },
          {
            id: 'data', label: '🔢 Data',
            groups: [
              { title: '排序', buttons: [
                { id: 'sort-asc',  icon: '⬆️', label: '升序', action: function(){ ops.sortRange(true); } },
                { id: 'sort-desc', icon: '⬇️', label: '降序', action: function(){ ops.sortRange(false); } },
                { id: 'sort-dialog', icon: '📋', label: '排序选项', action: ops.openSortDialog },
              ]},
              { title: '筛选', buttons: [
                { id: 'toggle-filter', icon: '🔍', label: '自动筛选', action: ops.toggleFilter },
                { id: 'clear-filter',  icon: '⊘',  label: '清除筛选', action: ops.clearAutoFilter },
              ]},
              { title: '数据', buttons: [
                { id: 'rem-dup', icon: '✂️', label: '去重', action: ops.removeDuplicates },
              ]},
            ],
          },
          {
            id: 'layout', label: '📐 Layout',
            groups: [
              { title: '边距', buttons: [
                { id: 'xl-margin-normal', icon: '📄', label: '普通', action: function(){ ops.setXlMargin('normal'); } },
                { id: 'xl-margin-narrow', icon: '📃', label: '窄',   action: function(){ ops.setXlMargin('narrow'); } },
                { id: 'xl-margin-wide',   icon: '📑', label: '宽',   action: function(){ ops.setXlMargin('wide'); } },
              ]},
              { title: '方向', buttons: [
                { id: 'xl-orient-portrait',  icon: '📄', label: '纵向', action: function(){ ops.setXlOrientation('portrait'); } },
                { id: 'xl-orient-landscape', icon: '📁', label: '横向', action: function(){ ops.setXlOrientation('landscape'); } },
              ]},
            ],
          },
        ],
        active: 'home',
      });
    }

    // 单元格编辑 + 选中跟踪
    var cells = w.$c.querySelectorAll('.xlsx-cell');
    cells.forEach(function(el) {
      var r = parseInt(el.dataset.r), c = parseInt(el.dataset.c);
      el.onmousedown = function(e) {
        // 点击时选中单个单元格（不拖拽）
        if (e.target.classList.contains('xlsx-fill-handle')) return;
        sel.start = [r, c];
        sel.end = [r, c];
        highlightSelection();
        updateStatusBar();
        updateNameBox();
        updateFormulaBar();
      };
      el.onfocus = function() {
        if (!sel.start || sel.start[0] !== r || sel.start[1] !== c) {
          sel.start = [r, c];
          sel.end = [r, c];
        }
        updateStatusBar();
        updateNameBox();
        updateFormulaBar();
      };
      el.onblur = function() {
        el.style.outline = 'none';
        el.style.background = '';
        var newVal = el.textContent;
        var oldVal = cellStr(data[r][c]);
        if (oldVal !== newVal) {
          data[r][c] = { v: newVal };
          markDirty();
        }
        updateFormulaBar();
      };
      el.onkeydown = function(e) {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      };
    });

    // v0.64: 行/列头点击选中整行/整列 + 自动筛选箭头
    w.$c.querySelectorAll('.xlsx-col-header').forEach(function(th) {
      th.onclick = function(e) {
        // 检查是否点击了筛选箭头
        if (e.target.classList.contains('xlsx-filter-arrow') || e.target.closest('.xlsx-filter-arrow')) {
          e.stopPropagation();
          var colIdx = parseInt(this.dataset.col);
          if (autoFilterActive) {
            ops.openFilterDropdown(colIdx);
          }
          return;
        }
        e.stopPropagation();
        var c = parseInt(this.dataset.col);
        sel.start = [1, c];
        sel.end = [data.length - 1, c];
        highlightSelection();
        updateStatusBar();
        updateNameBox();
        updateFormulaBar();
      };
    });
    w.$c.querySelectorAll('.xlsx-row-header').forEach(function(td) {
      td.onclick = function(e) {
        e.stopPropagation();
        var r = parseInt(this.dataset.row);
        sel.start = [r, 0];
        sel.end = [r, (data[0] || []).length - 1];
        highlightSelection();
        updateStatusBar();
        updateNameBox();
        updateFormulaBar();
      };
    });
    // 左上角角块：选中全部
    var cornerTh = w.$c.querySelector('.xlsx-corner-th');
    if (cornerTh) {
      cornerTh.onclick = function(e) {
        e.stopPropagation();
        sel.start = [0, 0];
        sel.end = [data.length - 1, (data[0] || []).length - 1];
        highlightSelection();
        updateStatusBar();
        updateNameBox();
        updateFormulaBar();
      };
    }

    // v0.64: 鼠标拖拽选区
    var isDragSelecting = false;
    var dragStartCell = null;
    var tableWrap = w.$c.querySelector('#xlsx-table-wrap');
    if (tableWrap) {
      tableWrap.addEventListener('mousedown', function(e) {
        var cell = e.target.closest('.xlsx-cell');
        if (!cell || e.target.classList.contains('xlsx-fill-handle')) return;
        // 只在左键且没有 modifier 时启动拖拽选区
        if (e.button !== 0) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        isDragSelecting = true;
        dragStartCell = {
          r: parseInt(cell.dataset.r),
          c: parseInt(cell.dataset.c)
        };
        sel.start = [dragStartCell.r, dragStartCell.c];
        sel.end = [dragStartCell.r, dragStartCell.c];
        highlightSelection();
      });
      document.addEventListener('mousemove', function(e) {
        if (!isDragSelecting || !dragStartCell) return;
        var cell = e.target.closest('.xlsx-cell');
        if (!cell) {
          // 鼠标移出表格区域，用 last cell
          var lastCell = w.$c.querySelector('.xlsx-cell[data-r="' + (data.length - 1) + '"][data-c="' + ((data[0]||[]).length - 1) + '"]');
          if (lastCell) {
            sel.end = [lastCell.dataset.r, lastCell.dataset.c].map(Number);
            highlightSelection();
          }
          return;
        }
        var r = parseInt(cell.dataset.r), c = parseInt(cell.dataset.c);
        sel.end = [r, c];
        highlightSelection();
        updateStatusBar();
        updateNameBox();
      });
      document.addEventListener('mouseup', function(e) {
        if (!isDragSelecting) return;
        isDragSelecting = false;
        dragStartCell = null;
      });
    }

    // ─── 高亮选区 ───
    function highlightSelection() {
      // 清除旧高亮
      w.$c.querySelectorAll('.xlsx-cell.is-in-selection').forEach(function(el) {
        el.classList.remove('is-in-selection');
      });
      if (!sel.start || !sel.end) return;
      var r1 = Math.min(sel.start[0], sel.end[0]);
      var c1 = Math.min(sel.start[1], sel.end[1]);
      var r2 = Math.max(sel.start[0], sel.end[0]);
      var c2 = Math.max(sel.start[1], sel.end[1]);
      for (var r = r1; r <= r2; r++) {
        for (var c = c1; c <= c2; c++) {
          var el = w.$c.querySelector('.xlsx-cell[data-r="' + r + '"][data-c="' + c + '"]');
          if (el) el.classList.add('is-in-selection');
        }
      }
      // 高亮行头/列头
      w.$c.querySelectorAll('.xlsx-col-header.is-col-selected').forEach(function(el) { el.classList.remove('is-col-selected'); });
      w.$c.querySelectorAll('.xlsx-row-header.is-row-selected').forEach(function(el) { el.classList.remove('is-row-selected'); });
      if (r1 === r2) {
        var rh = w.$c.querySelector('.xlsx-row-header[data-row="' + r1 + '"]');
        if (rh) rh.classList.add('is-row-selected');
      }
      if (c1 === c2) {
        var ch = w.$c.querySelector('.xlsx-col-header[data-col="' + c1 + '"]');
        if (ch) ch.classList.add('is-col-selected');
      }
    }

    // 名称框: 输入 cell 坐标跳转 (B2 → 选中 B2)
    var namebox = w.$c.querySelector('#xlsx-namebox');
    namebox.onkeydown = function (e) {
      if (e.key !== 'Enter') return;
      var v = (namebox.value || '').trim().toUpperCase();
      var m = v.match(/^([A-Z]+)(\d+)$/);
      if (!m) return toast('格式示例: A1, B2, AA10', 'warning');
      var colStr = m[1], rowStr = m[2];
      var colIdx = 0;
      for (var i = 0; i < colStr.length; i++) colIdx = colIdx * 26 + (colStr.charCodeAt(i) - 64);
      colIdx -= 1; // 0-based
      var rowIdx = parseInt(rowStr) - 1;
      var cellEl = w.$c.querySelector('.xlsx-cell[data-r="' + rowIdx + '"][data-c="' + colIdx + '"]');
      if (!cellEl) return toast('超出范围', 'warning');
      cellEl.focus();
      namebox.blur();
    };
    updateNameBox();

    // v0.63 Phase1: 公式栏事件绑定（fx 输入框 ↔ 选中 cell 双向同步）
    var fxInput = w.$c.querySelector('#xlsx-fx-input');
    if (fxInput) {
      fxInput.addEventListener('focus', function () {
        if (sel.start) updateFormulaBar();
      });
      fxInput.addEventListener('blur', function () {
        if (!sel.start) return;
        var r = sel.start[0], c = sel.start[1];
        var newV = this.value;
        var oldV = cellStr(data[r] && data[r][c]);
        if (oldV !== newV) {
          data[r][c] = { v: newV };
          markDirty();
          // 同步 cell DOM
          var cellEl = w.$c.querySelector('.xlsx-cell[data-r="' + r + '"][data-c="' + c + '"]');
          if (cellEl) cellEl.textContent = newV;
        }
      });
      fxInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
        if (e.key === 'Escape') { this.blur(); updateFormulaBar(); }
      });
    }

    // v0.62.5 PR-C: Sheet tabs 事件绑定
    w.$c.querySelectorAll('.xlsx-sheet-tab').forEach(function (tab) {
      tab.onclick = function (e) {
        if (e.target.classList.contains('xlsx-sheet-close')) return; // 关闭按钮单独处理
        switchSheet(parseInt(tab.dataset.i));
      };
      // 双击改名（学 OO Spreadsheet 双击 sheet 改名）
      tab.ondblclick = function () {
        var idx = parseInt(tab.dataset.i);
        var cur = sheets[idx].name;
        if (typeof showPrompt === 'function') {
          showPrompt({
            title: '重命名 Sheet',
            message: '输入新名称',
            defaultValue: cur,
            multiline: false,
            minLength: 1,
          }).then(function (n) { if (n) renameSheet(idx, n); });
        } else {
          var n = prompt('新名称:', cur);
          if (n) renameSheet(idx, n);
        }
      };
      // 关闭按钮
      var closeBtn = tab.querySelector('.xlsx-sheet-close');
      if (closeBtn) {
        closeBtn.onclick = function (e) {
          e.stopPropagation();
          removeSheet(parseInt(closeBtn.dataset.i));
        };
      }
    });
    var addSheetBtn = w.$c.querySelector('#xlsx-add-sheet');
    if (addSheetBtn) addSheetBtn.onclick = function () { addSheet(); };

    // v0.64: 查找/替换栏事件绑定
    var searchBar = w.$c.querySelector('#xlsx-search-bar');
    var searchInput = w.$c.querySelector('#xlsx-search-input');
    var searchCount = w.$c.querySelector('#xlsx-search-count');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        ops.doSearch(this.value);
      });
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); ops.searchNext(); }
        if (e.key === 'Escape') { ops.closeSearch(); }
      });
    }
    var searchPrevBtn = w.$c.querySelector('#xlsx-search-prev');
    if (searchPrevBtn) searchPrevBtn.onclick = function () { ops.searchPrev(); };
    var searchNextBtn = w.$c.querySelector('#xlsx-search-next');
    if (searchNextBtn) searchNextBtn.onclick = function () { ops.searchNext(); };
    var searchReplaceBtn = w.$c.querySelector('#xlsx-search-replace');
    if (searchReplaceBtn) searchReplaceBtn.onclick = function () { ops.toggleReplace(); };
    var searchCloseBtn = w.$c.querySelector('#xlsx-search-close');
    if (searchCloseBtn) searchCloseBtn.onclick = function () { ops.closeSearch(); };
    var replaceInput = w.$c.querySelector('#xlsx-replace-input');
    if (replaceInput) {
      replaceInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); ops.doReplace(this.value); }
      });
    }
    var replaceOneBtn = w.$c.querySelector('#xlsx-replace-one');
    if (replaceOneBtn) replaceOneBtn.onclick = function () { ops.doReplace(replaceInput?.value || ''); };
    var replaceAllBtn = w.$c.querySelector('#xlsx-replace-all');
    if (replaceAllBtn) replaceAllBtn.onclick = function () { ops.doReplaceAll(replaceInput?.value || ''); };

    // v0.64: 冻结按钮事件
    var freezeBtn = w.$c.querySelector('#xlsx-freeze-btn');
    if (freezeBtn) freezeBtn.onclick = function () { ops.toggleFreeze(); };

    // v0.64: 公式对话框事件
    var fxBtn = w.$c.querySelector('#xlsx-fx-btn');
    if (fxBtn) fxBtn.onclick = function (e) { e.stopPropagation(); ops.openFormulaDialog(); };
    var formulaDialog = w.$c.querySelector('#xlsx-formula-dialog');
    if (formulaDialog) {
      formulaDialog.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      var xfdCancel = w.$c.querySelector('#xfd-cancel');
      if (xfdCancel) xfdCancel.onclick = function () { formulaDialog.classList.remove('is-open'); };
      var xfdOk = w.$c.querySelector('#xfd-ok');
      if (xfdOk) xfdOk.onclick = function () {
        var selected = w.$c.querySelector('.xfd-func-item.is-active');
        if (selected) {
          var fnName = selected.dataset.fn;
          var args = selected.dataset.args || '';
          insertFormulaWithArgs(fnName, args);
          formulaDialog.classList.remove('is-open');
        }
      };
      var xfdSearchInput = w.$c.querySelector('#xfd-search-input');
      if (xfdSearchInput) {
        xfdSearchInput.addEventListener('input', function () {
          filterFormulaFunctions(this.value);
        });
      }
    }
    // 点击外部关闭公式对话框
    document.addEventListener('mousedown', function (e) {
      if (formulaDialog && formulaDialog.classList.contains('is-open') &&
          !formulaDialog.contains(e.target) && e.target !== fxBtn) {
        formulaDialog.classList.remove('is-open');
      }
    });

    // v0.64: 填充柄 (Fill Handle)
    var fillHandle = null;
    var fillPreview = null;
    var isDraggingFill = false;
    function updateFillHandle() {
      // 移除旧的填充柄
      if (fillHandle) { fillHandle.remove(); fillHandle = null; }
      if (fillPreview) { fillPreview.remove(); fillPreview = null; }
      if (!sel.start) return;
      var r = sel.start[0], c = sel.start[1];
      var cellEl = w.$c.querySelector('.xlsx-cell[data-r=\"' + r + '\"][data-c=\"' + c + '\"]');
      if (!cellEl) return;
      // 添加填充柄
      fillHandle = document.createElement('div');
      fillHandle.className = 'xlsx-fill-handle';
      cellEl.classList.add('is-selected');
      cellEl.appendChild(fillHandle);
      // 拖拽逻辑
      fillHandle.onmousedown = function (e) {
        e.preventDefault();
        e.stopPropagation();
        isDraggingFill = true;
        var startX = e.clientX, startY = e.clientY;
        var startR = r, startC = c;
        var selData = getSelectionData();
        function onMove(ev) {
          if (!isDraggingFill) return;
          // 计算目标 cell
          var table = w.$c.querySelector('#xlsx-table');
          var cellHeight = cellEl.offsetHeight || 24;
          var cellWidth = cellEl.offsetWidth || 80;
          var dRow = Math.round((ev.clientY - startY) / cellHeight);
          var dCol = Math.round((ev.clientX - startX) / cellWidth);
          var endR = Math.max(0, Math.min(data.length - 1, startR + dRow));
          var endC = Math.max(0, Math.min((data[0]||[]).length - 1, startC + dCol));
          // 清除旧预览
          if (fillPreview) { fillPreview.remove(); fillPreview = null; cellEl.classList.remove('is-selected'); }
          if (dRow === 0 && dCol === 0) return;
          // 绘制预览框
          var rect = cellEl.getBoundingClientRect();
          fillPreview = document.createElement('div');
          fillPreview.className = 'xlsx-fill-preview';
          // 计算预览位置（相对于表格容器）
          var tableRect = table.getBoundingClientRect();
          var previewTop = rect.top - tableRect.top;
          var previewLeft = rect.left - tableRect.left;
          var previewHeight = Math.abs(dRow) * cellHeight;
          var previewWidth = Math.abs(dCol) * cellWidth;
          if (dRow < 0) previewTop -= previewHeight;
          if (dCol < 0) previewLeft -= previewWidth;
          fillPreview.style.cssText = 'position:absolute;top:' + previewTop + 'px;left:' + previewLeft + 'px;width:' + previewWidth + 'px;height:' + previewHeight + 'px;';
          table.appendChild(fillPreview);
          // 高亮目标区域
          highlightFillTarget(startR, startC, endR, endC);
        }
        function onUp(ev) {
          if (!isDraggingFill) return;
          isDraggingFill = false;
          if (fillPreview) { fillPreview.remove(); fillPreview = null; }
          cellEl.classList.remove('is-selected');
          // 执行填充
          var dRow = Math.round((ev.clientY - startY) / cellHeight);
          var dCol = Math.round((ev.clientX - startX) / cellWidth);
          if (dRow !== 0 || dCol !== 0) {
            fillFromSelection(startR, startC, startR + dRow, startC + dCol, selData);
            markDirty();
            renderTable();
          }
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      };
    }
    function getSelectionData() {
      if (!sel.start || !sel.end) return null;
      var r1 = Math.min(sel.start[0], sel.end[0]);
      var c1 = Math.min(sel.start[1], sel.end[1]);
      var r2 = Math.max(sel.start[0], sel.end[0]);
      var c2 = Math.max(sel.start[1], sel.end[1]);
      var result = [];
      for (var r = r1; r <= r2; r++) {
        var row = [];
        for (var c = c1; c <= c2; c++) {
          row.push(cellStr(data[r] && data[r][c]));
        }
        result.push(row);
      }
      return { data: result, startR: r1, startC: c1, endR: r2, endC: c2 };
    }
    function fillFromSelection(srcR, srcC, dstR, dstC, selData) {
      if (!selData) return;
      var dr = dstR - srcR, dc = dstC - srcC;
      var h = selData.data.length, w = selData.data[0].length;
      // 确定填充方向
      if (Math.abs(dr) >= Math.abs(dc)) {
        // 垂直填充
        for (var i = 1; i <= dr; i++) {
          var tr = srcR + i;
          if (tr >= data.length) break;
          for (var j = 0; j < w; j++) {
            var sc = srcC + j;
            if (sc < (data[0]||[]).length) {
              data[tr][sc] = fillPattern(selData.data[i % h][j], selData.data[(i % h - 1 + h) % h][j], i);
            }
          }
        }
      } else {
        // 水平填充
        for (var i = 1; i <= dc; i++) {
          var tc = srcC + i;
          if (tc >= (data[0]||[]).length) break;
          for (var j = 0; j < h; j++) {
            var sr = srcR + j;
            if (sr < data.length) {
              data[sr][tc] = fillPattern(selData.data[j][i % w], selData.data[j][(i % w - 1 + w) % w], i);
            }
          }
        }
      }
    }
    function fillPattern(current, previous, offset) {
      // 尝试数字序列
      var cn = parseFloat(current), pn = parseFloat(previous);
      if (!isNaN(cn) && !isNaN(pn) && isFinite(cn) && isFinite(pn)) {
        var diff = cn - pn;
        if (diff !== 0 || cn === 0) {
          var next = cn + diff;
          // 如果是整数序列，保持整数
          if (Number.isInteger(diff) && Number.isInteger(cn)) return String(Math.round(next));
          return String(parseFloat(next.toFixed(4)));
        }
      }
      // 尝试日期序列
      var dateMatch = current.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      if (dateMatch && previous) {
        var pd = previous.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
        if (pd) {
          var d1 = new Date(current), d2 = new Date(previous);
          var diffDays = (d1 - d2) / (1000 * 60 * 60 * 24);
          if (!isNaN(diffDays) && isFinite(diffDays)) {
            var newDate = new Date(d1.getTime() + diffDays * offset * 1000);
            return newDate.toISOString().slice(0, 10);
          }
        }
      }
      // 文字+数字后缀: Item1, Item2 → Item3
      var textMatch = current.match(/^(.*?)(\d+)$/);
      if (textMatch && previous) {
        var prevMatch = previous.match(/^(.*?)(\d+)$/);
        if (prevMatch && textMatch[1] === prevMatch[1]) {
          var num = parseInt(textMatch[2]) + offset;
          return textMatch[1] + num;
        }
      }
      return current;
    }
    function highlightFillTarget(r1, c1, r2, c2) {
      // 暂时高亮目标区域
      for (var r = Math.min(r1,r2); r <= Math.max(r1,r2); r++) {
        for (var c = Math.min(c1,c2); c <= Math.max(c1,c2); c++) {
          var el = w.$c.querySelector('.xlsx-cell[data-r=\"' + r + '\"][data-c=\"' + c + '\"]');
          if (el && !(r === r1 && c === c1)) el.style.background = 'rgba(74,128,86,0.15)';
        }
      }
    }
    // 选中变化时更新填充柄
    var origOnFocus = null;
    // 在 renderTable 的单元格事件之后添加填充柄更新
    var origRenderTable = renderTable;
    renderTable = function () {
      origRenderTable();
      updateFillHandle();
    };

    // v0.62.6: Excel 右键菜单
    w.$c.addEventListener('contextmenu', function (e) {
      var cell = e.target.closest('.xlsx-cell');
      if (!cell) return;
      e.preventDefault();
      var r = parseInt(cell.dataset.r), c = parseInt(cell.dataset.c);
      sel = { start: [r, c], end: [r, c] };
      updateNameBox();
      showCtxMenu([
        { label: '\u2726 \u6E05\u7A7A', action: function () { data[r][c] = ''; markDirty(); renderTable(); } },
        { label: '\u2191 \u4E0A\u65B9\u63D2\u884C', action: function () {
          var nr = []; for (var k = 0; k < (data[0]||[]).length; k++) nr.push('');
          data.splice(r, 0, nr); markDirty(); renderTable();
        }},
        { label: '\u2193 \u4E0B\u65B9\u63D2\u884C', action: function () {
          var nr = []; for (var k = 0; k < (data[0]||[]).length; k++) nr.push('');
          data.splice(r + 1, 0, nr); markDirty(); renderTable();
        }},
        { label: '\u2716 \u5220\u9664\u884C', action: function () {
          if (data.length <= 1) return toast('\u81F3\u5C11\u4FDD\u7559\u4E00\u884C', 'warning');
          data.splice(r, 1); markDirty(); renderTable();
        }},
        '-',
        { label: '\u53D6\u6D88', action: function () {} },
      ], e.clientX, e.clientY);
    });

// v0.62.5: 保存逻辑抽成 saveExcel 函数（Ribbon "保存"按钮 + 标题栏 "保存"按钮共用）
    function saveExcel() {
      var name;
      var currentName = (w.$c.querySelector('#xlsx-title-input').value || '').trim() || '表格';
      if (typeof showPrompt === 'function') {
        name = showPrompt({
          title: '保存 Excel 表格',
          message: '输入文件名（.xlsx 后缀自动加）',
          defaultValue: currentName.replace(/\.xlsx$/i, ''),
          multiline: false,
          minLength: 1,
        });
      } else {
        name = Promise.resolve(prompt('文件名：', '表格.xlsx') || '表格.xlsx');
      }
      return Promise.resolve(name).then(function(n) {
        if (!n) return;
        n = String(n).trim();
        if (!n.toLowerCase().endsWith('.xlsx')) n += '.xlsx';
        // v0.62.5 PR-C: 多 sheet payload — 每个 sheet 单独 headers + rows
        var payloadSheets = sheets.map(function (s) {
          var d = s.data;
          return { name: s.name, headers: d[0] || [], rows: d.slice(1) };
        });
        return fetch('/api/office/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
          body: JSON.stringify({ type: 'xlsx', name: n, data: { title: n.replace(/\.xlsx$/, ''), sheets: payloadSheets, rows: data.length, cols: (data[0]||[]).length } }),
        }).then(function(r){ return r.json(); }).then(function(r){
          if (r.ok) { toast('已保存 ✅ ' + n + ' (' + r.size + ' bytes, ' + sheets.length + ' 个 Sheet)', 'success'); markSaved(); }
          else toast('保存失败: ' + (r.error || '未知'), 'error');
        }).catch(function(e){ toast('保存失败: ' + e.message, 'error'); });
      });
    }
    // 标题栏 "保存" 按钮 — 调用 saveExcel（v0.62.5 重构）
    var saveBtn = w.$c.querySelector('#xlsx-save-btn');
    if (saveBtn) saveBtn.onclick = function () { saveExcel(); };

    // 标题栏 "导出 CSV" 按钮
    var csvBtn = w.$c.querySelector('#xlsx-export-csv-btn');
    if (csvBtn) csvBtn.onclick = function () {
      var csv = data.map(function(row){ return row.map(function(c){ return '"' + String(c).replace(/"/g,'""') + '"'; }).join(','); }).join('\n');
      var baseName = (w.$c.querySelector('#xlsx-title-input').value || '未命名').replace(/\.xlsx$/i, '');
      var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = baseName + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    toast('已导出 ' + baseName + '.csv', 'success');
    };
  }

  // v0.65: 从服务器加载文件
  if (_isServerFile && _fileId) {
    // 显示加载状态
    w.$c.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text2)">⏳ 正在加载 ' + (fileName || 'Excel 文件') + '...</div>';
    
    fetch('/api/office/load/' + encodeURIComponent(_fileId) + '?api_key=dev-key-001')
      .then(function(r) { return r.json(); })
      .then(function(resp) {
        
        if (!resp.ok) throw new Error(resp.error || '加载失败');
        // 解析 content (base64)
        if (resp.text && resp.text.startsWith('SCHEMA:')) {
          var schemaStr = resp.text.slice(7);
          
          var schemaData = JSON.parse(schemaStr);
          // v0.65: 检查 schemaData 是否有效
          if (!schemaData || !schemaData.sheets || !Array.isArray(schemaData.sheets) || schemaData.sheets.length === 0) {
            sheets = [{ name: 'Sheet1', data: blankData() }];
            currentSheetIdx = 0;
            data = sheets[0].data;
          } else {
            // 恢复 sheets
            sheets = [];
            schemaData.sheets.forEach(function(s) {
              var sheetData = [];
              // 使用实际列数，而非默认 COLS
              var actualCols = (s.headers && s.headers.length) || 8;
              if (s.rows && Array.isArray(s.rows)) {
                // 添加标题行
                if (s.headers && Array.isArray(s.headers)) {
                  sheetData.push(s.headers);
                }
                // 添加数据行
                s.rows.forEach(function(row) {
                  var nr = [];
                  for (var c = 0; c < actualCols; c++) nr.push(row[c] !== undefined ? row[c] : '');
                  sheetData.push(nr);
                });
              }
              
              sheets.push({ name: s.name || 'Sheet' + (sheets.length + 1), data: sheetData });
            });
            currentSheetIdx = 0;
            data = sheets[0].data;
            // 动态调整 ROWS 和 COLS
            if (data.length > ROWS) ROWS = data.length;
            if (data[0] && data[0].length > COLS) COLS = data[0].length;
            if (w.$c.querySelector('#xlsx-title-input')) {
              w.$c.querySelector('#xlsx-title-input').value = fileName || resp.filename;
            }
          }
        } else {
          sheets = [{ name: 'Sheet1', data: blankData() }];
          currentSheetIdx = 0;
          data = sheets[0].data;
          if (w.$c.querySelector('#xlsx-title-input')) {
            w.$c.querySelector('#xlsx-title-input').value = fileName || '已加载.xlsx';
          }
        }
        renderTable();
        
      })
      .catch(function(e) {
        w.$c.innerHTML = '<div style="padding:24px;text-align:center;color:#a00">❌ 加载失败：' + (e.message || '未知错误') + '<br>fileId: ' + _fileId + '</div>';
      });
  }

  // 初始状态入 undo 栈
  setTimeout(function () { xlPushUndo(); }, 100);
  renderTable();
}

