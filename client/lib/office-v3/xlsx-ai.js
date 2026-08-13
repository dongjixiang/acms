// ACMS sheets AI 核心（P4a）— 内存工作簿模型 + workbook DSL 执行器 + Undo + UI 同步 + 保存
// DSL 语义移植自 GenOffice vendor/office-v3/sheets/（Apache-2.0）：op 类型/展开规则/2000 上限
// 设计：AI 操作内存 schema（纯逻辑可测）→ applySchemaToUniver 同步 UI（v2 已验证路径）→ schema→writeXlsx 保存
(function () {
  'use strict';

  // ── HTML 转义（独立文件自备，不依赖 bridge） ──
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── 地址工具（对齐 GenOffice cell-address.ts 语义） ──
  function colLabel(n) { // 0→A, 25→Z, 26→AA
    var s = '';
    n = n + 1;
    while (n > 0) {
      var m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function parseAddress(addr) { // 'A1' → {row:1, col:0}（row 1-based, col 0-based）
    var m = /^([A-Za-z]+)(\d+)$/.exec(String(addr).trim());
    if (!m) throw new Error('无效地址: ' + addr);
    var col = 0;
    for (var i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64);
    return { row: parseInt(m[2], 10), col: col - 1 };
  }

  function formatAddress(row, col) { // (1-based row, 0-based col) → 'A1'
    return colLabel(col) + row;
  }

  function parseRange(rng) { // 'A1:B3' → {startRow, startCol, endRow, endCol}（1-based row）
    var parts = String(rng).split(':');
    var a = parseAddress(parts[0]);
    var b = parts.length > 1 ? parseAddress(parts[1]) : a;
    return {
      startRow: Math.min(a.row, b.row), startCol: Math.min(a.col, b.col),
      endRow: Math.max(a.row, b.row), endCol: Math.max(a.col, b.col),
    };
  }

  function rangeCellCount(r) {
    return (r.endRow - r.startRow + 1) * (r.endCol - r.startCol + 1);
  }

  var MAX_EXPANDED = 2000; // 对齐 GenOffice

  // ── schema → snapshot（内存工作簿） ──
  // schemaData: {sheets:[{name, headers, rows}]}（ACMS load 的 SCHEMA 格式）
  // snapshot:   {revision, sheets:[{id, name, cells:{'A1':{v,f}}, styles:{}}]}
  function snapshotFromSchema(schemaData) {
    var sheets = (schemaData && schemaData.sheets) || [];
    return {
      revision: 0,
      sheets: sheets.map(function (s, si) {
        var cells = {};
        var headers = s.headers || [];
        var rows = s.rows || [];
        var all = [headers].concat(rows);
        all.forEach(function (rowData, ri) {
          (rowData || []).forEach(function (v, ci) {
            if (v === null || v === undefined || v === '') return;
            var addr = formatAddress(ri + 1, ci);
            var str = String(v);
            if (str.indexOf('=') === 0) cells[addr] = { v: '', f: str };
            else cells[addr] = { v: v };
          });
        });
        return { id: 'sheet' + (si + 1), name: s.name || 'Sheet' + (si + 1), cells: cells, styles: {}, visuals: [] };
      }),
    };
  }

  // snapshot → schema（保存/同步 UI 用）
  function schemaFromSnapshot(snap) {
    return {
      sheets: snap.sheets.map(function (s) {
        // 收集所有行/列范围
        var maxRow = 0, maxCol = 0;
        Object.keys(s.cells).forEach(function (addr) {
          var p = parseAddress(addr);
          if (p.row > maxRow) maxRow = p.row;
          if (p.col > maxCol) maxCol = p.col;
        });
        var headers = [], rows = [];
        for (var r = 1; r <= maxRow; r++) {
          var rowData = [];
          for (var c = 0; c <= maxCol; c++) {
            var cell = s.cells[formatAddress(r, c)];
            rowData.push(cell ? (cell.f ? cell.f : cell.v) : null);
          }
          if (r === 1) headers = rowData;
          else rows.push(rowData);
        }
        return { name: s.name, headers: headers, rows: rows };
      }),
    };
  }

  // ── 操作展开/校验（对齐 GenOffice workbook-dsl） ──
  function expandOps(operations) {
    var expanded = [];
    var cellCount = 0;
    function countCell() {
      cellCount++;
      if (cellCount > MAX_EXPANDED) throw new Error('操作展开超过 ' + MAX_EXPANDED + ' 个单元格，已拒绝');
    }
    (operations || []).forEach(function (op) {
      if (op.op === 'set_range') {
        var origin = parseRange(op.range);
        op.values.forEach(function (rowValues, rowOffset) {
          (rowValues || []).forEach(function (value, colOffset) {
            countCell();
            var addr = formatAddress(origin.startRow + rowOffset, origin.startCol + colOffset);
            if (typeof value === 'string' && value.indexOf('=') === 0) {
              expanded.push({ op: 'set_formula', sheetId: op.sheetId, address: addr, formula: value });
            } else {
              expanded.push({ op: 'set_cell', sheetId: op.sheetId, address: addr, value: value });
            }
          });
        });
      } else if (op.op === 'clear_range') {
        var bounds = parseRange(op.range);
        if (rangeCellCount(bounds) > MAX_EXPANDED) throw new Error('clear_range 超过 ' + MAX_EXPANDED + ' 个单元格');
        for (var r = bounds.startRow; r <= bounds.endRow; r++) {
          for (var c = bounds.startCol; c <= bounds.endCol; c++) {
            countCell();
            expanded.push({ op: 'clear_cell', sheetId: op.sheetId, address: formatAddress(r, c) });
          }
        }
      } else if (op.op === 'format_range') {
        if (rangeCellCount(parseRange(op.range)) > MAX_EXPANDED) throw new Error('format_range 超过 ' + MAX_EXPANDED + ' 个单元格');
        expanded.push(op);
      } else {
        expanded.push(op);
      }
    });
    return expanded;
  }

  // ── 执行器（纯函数：返回新 snapshot + changes） ──
  function cloneSnapshot(snap) {
    return {
      revision: snap.revision + 1,
      sheets: snap.sheets.map(function (s) {
        return { id: s.id, name: s.name, cells: Object.assign({}, s.cells), styles: Object.assign({}, s.styles), visuals: (s.visuals || []).map(function (v) { return Object.assign({}, v); }) };
      }),
    };
  }

  function findSheet(snap, sheetId) {
    var s = snap.sheets.find(function (x) { return x.id === sheetId; });
    if (!s) throw new Error('sheet 不存在: ' + sheetId);
    return s;
  }

  function applyOps(snapshot, operations) {
    var next = cloneSnapshot(snapshot);
    var changes = [];
    var expanded = expandOps(operations);
    expanded.forEach(function (op) {
      switch (op.op) {
        case 'set_cell': {
          var s0 = findSheet(next, op.sheetId);
          var before = s0.cells[op.address] || null;
          if (op.value === null || op.value === undefined || op.value === '') delete s0.cells[op.address];
          else s0.cells[op.address] = { v: op.value };
          changes.push({ sheetId: op.sheetId, address: op.address, before: before, after: s0.cells[op.address] || null });
          break;
        }
        case 'set_formula': {
          var s1 = findSheet(next, op.sheetId);
          var before1 = s1.cells[op.address] || null;
          s1.cells[op.address] = { v: '', f: op.formula };
          changes.push({ sheetId: op.sheetId, address: op.address, before: before1, after: s1.cells[op.address] });
          break;
        }
        case 'clear_cell': {
          var s2 = findSheet(next, op.sheetId);
          var before2 = s2.cells[op.address] || null;
          delete s2.cells[op.address];
          delete s2.styles[op.address];
          changes.push({ sheetId: op.sheetId, address: op.address, before: before2, after: null });
          break;
        }
        case 'rename_sheet': {
          var s3 = findSheet(next, op.sheetId);
          s3.name = op.name;
          break;
        }
        case 'find_replace': {
          var s4 = findSheet(next, op.sheetId);
          Object.keys(s4.cells).forEach(function (addr) {
            var cell = s4.cells[addr];
            if (typeof cell.v === 'string' && cell.v.indexOf(op.find) !== -1) {
              var before = cell;
              cell.v = cell.v.split(op.find).join(op.replace);
              changes.push({ sheetId: op.sheetId, address: addr, before: before, after: cell });
            }
          });
          break;
        }
        case 'format_range': {
          var s5 = findSheet(next, op.sheetId);
          var fmt = op.format || {};
          var r5 = parseRange(op.range);
          for (var r = r5.startRow; r <= r5.endRow; r++) {
            for (var c = r5.startCol; c <= r5.endCol; c++) {
              var addr = formatAddress(r, c);
              s5.styles[addr] = Object.assign({}, s5.styles[addr] || {}, fmt);
            }
          }
          break;
        }
        case 'sort_range': {
          var s6 = findSheet(next, op.sheetId);
          var r6 = parseRange(op.range);
          var sortCol = op.column !== undefined ? op.column : r6.startCol;
          var rows = [];
          for (var rr = r6.startRow; rr <= r6.endRow; rr++) {
            var rowObj = {};
            for (var cc = r6.startCol; cc <= r6.endCol; cc++) {
              var a6 = formatAddress(rr, cc);
              if (s6.cells[a6]) rowObj[a6] = s6.cells[a6];
            }
            rows.push({ row: rr, cells: rowObj, key: (s6.cells[formatAddress(rr, sortCol)] || {}).v });
          }
          var asc = op.descending ? -1 : 1;
          rows.sort(function (x, y) {
            if (x.key === y.key) return 0;
            if (x.key === null || x.key === undefined) return 1;
            if (y.key === null || y.key === undefined) return -1;
            var cmp = (typeof x.key === 'number' && typeof y.key === 'number') ? x.key - y.key : String(x.key).localeCompare(String(y.key), 'zh-CN');
            return cmp * asc;
          });
          // 重写行内容
          rows.forEach(function (rowInfo, newOffset) {
            var targetRow = r6.startRow + newOffset;
            // 清空目标行旧内容（范围内）
            for (var cc2 = r6.startCol; cc2 <= r6.endCol; cc2++) delete s6.cells[formatAddress(targetRow, cc2)];
            // 写入排序后的内容
            Object.keys(rowInfo.cells).forEach(function (srcAddr) {
              var src = parseAddress(srcAddr);
              var dstAddr = formatAddress(targetRow, src.col);
              s6.cells[dstAddr] = rowInfo.cells[srcAddr];
            });
          });
          break;
        }
        case 'insert_rows': {
          var s7 = findSheet(next, op.sheetId);
          shiftRows(s7, op.index, op.count || 1, 1);
          break;
        }
        case 'delete_rows': {
          var s8 = findSheet(next, op.sheetId);
          shiftRows(s8, op.index, op.count || 1, -1);
          break;
        }
        case 'insert_cols': {
          var s9 = findSheet(next, op.sheetId);
          shiftCols(s9, op.index, op.count || 1, 1);
          break;
        }
        case 'delete_cols': {
          var s10 = findSheet(next, op.sheetId);
          shiftCols(s10, op.index, op.count || 1, -1);
          break;
        }
        case 'add_sheet': {
          next.sheets.push({ id: 'sheet' + (next.sheets.length + 1), name: op.name || 'Sheet' + (next.sheets.length + 1), cells: {}, styles: {} });
          break;
        }
        case 'delete_sheet': {
          next.sheets = next.sheets.filter(function (x) { return x.id !== op.sheetId; });
          break;
        }
        case 'add_chart': {
          var s11 = findSheet(next, op.sheetId);
          // 从 range 提取数据（内存 cells → 二维数组）
          var r11 = parseRange(op.range);
          var grid = [];
          for (var rr2 = r11.startRow; rr2 <= r11.endRow; rr2++) {
            var rowArr = [];
            for (var cc2 = r11.startCol; cc2 <= r11.endCol; cc2++) {
              var cell11 = s11.cells[formatAddress(rr2, cc2)];
              rowArr.push(cell11 ? (cell11.f ? cell11.f : cell11.v) : null);
            }
            grid.push(rowArr);
          }
          var parsed = chartDataFromValues(grid);
          if (!parsed) throw new Error('图表数据无效: ' + op.range);
          var kind = op.kind || recommendChartKind(parsed);
          var visual = {
            id: 'chart' + Date.now(),
            type: 'chart',
            kind: kind,
            title: op.title || '图表',
            range: op.range,
            sheetId: op.sheetId,
            x: op.x !== undefined ? op.x : 0.6,
            y: op.y !== undefined ? op.y : 0.4,
            w: op.w || 420,
            h: op.h || 260,
            data: { categories: parsed.categories, series: parsed.series },
          };
          s11.visuals = s11.visuals || [];
          s11.visuals.push(visual);
          changes.push({ sheetId: op.sheetId, address: op.range, before: null, after: visual });
          break;
        }
        case 'edit_chart': {
          var s12 = findSheet(next, op.sheetId);
          var vis = (s12.visuals || []).find(function (v) { return v.id === op.visualId; });
          if (!vis) throw new Error('图表不存在: ' + op.visualId);
          if (op.title !== undefined) vis.title = op.title;
          if (op.kind !== undefined) vis.kind = op.kind;
          if (op.range !== undefined && op.range !== vis.range) {
            // 换数据源：重新提取
            var r12 = parseRange(op.range);
            var grid2 = [];
            for (var rr3 = r12.startRow; rr3 <= r12.endRow; rr3++) {
              var rowArr2 = [];
              for (var cc3 = r12.startCol; cc3 <= r12.endCol; cc3++) {
                var cell12 = s12.cells[formatAddress(rr3, cc3)];
                rowArr2.push(cell12 ? (cell12.f ? cell12.f : cell12.v) : null);
              }
              grid2.push(rowArr2);
            }
            var parsed2 = chartDataFromValues(grid2);
            if (!parsed2) throw new Error('图表数据无效: ' + op.range);
            vis.range = op.range;
            vis.data = { categories: parsed2.categories, series: parsed2.series };
          }
          break;
        }
        case 'delete_visual': {
          var s13 = findSheet(next, op.sheetId);
          s13.visuals = (s13.visuals || []).filter(function (v) { return v.id !== op.visualId; });
          break;
        }
        default:
          throw new Error('不支持的操作: ' + op.op);
      }
    });
    return { snapshot: next, changes: changes };
  }

  // 行位移（insert: dir=1 / delete: dir=-1）— index 1-based
  function shiftRows(sheet, index, count, dir) {
    var newCells = {};
    Object.keys(sheet.cells).forEach(function (addr) {
      var p = parseAddress(addr);
      if (dir === 1) { // 插入：index 起的行下移 count
        if (p.row >= index) newCells[formatAddress(p.row + count, p.col)] = sheet.cells[addr];
        else newCells[addr] = sheet.cells[addr];
      } else { // 删除：index 起的 count 行删除，之后上移
        if (p.row >= index && p.row < index + count) return; // 删除
        if (p.row >= index + count) newCells[formatAddress(p.row - count, p.col)] = sheet.cells[addr];
        else newCells[addr] = sheet.cells[addr];
      }
    });
    sheet.cells = newCells;
    // styles 同步位移
    var newStyles = {};
    Object.keys(sheet.styles || {}).forEach(function (addr) {
      var p = parseAddress(addr);
      if (dir === 1) {
        if (p.row >= index) newStyles[formatAddress(p.row + count, p.col)] = sheet.styles[addr];
        else newStyles[addr] = sheet.styles[addr];
      } else {
        if (p.row >= index && p.row < index + count) return;
        if (p.row >= index + count) newStyles[formatAddress(p.row - count, p.col)] = sheet.styles[addr];
        else newStyles[addr] = sheet.styles[addr];
      }
    });
    sheet.styles = newStyles;
  }

  // 列位移（insert: dir=1 / delete: dir=-1）— index 0-based
  function shiftCols(sheet, index, count, dir) {
    var newCells = {};
    Object.keys(sheet.cells).forEach(function (addr) {
      var p = parseAddress(addr);
      if (dir === 1) {
        if (p.col >= index) newCells[formatAddress(p.row, p.col + count)] = sheet.cells[addr];
        else newCells[addr] = sheet.cells[addr];
      } else {
        if (p.col >= index && p.col < index + count) return;
        if (p.col >= index + count) newCells[formatAddress(p.row, p.col - count)] = sheet.cells[addr];
        else newCells[addr] = sheet.cells[addr];
      }
    });
    sheet.cells = newCells;
    var newStyles = {};
    Object.keys(sheet.styles || {}).forEach(function (addr) {
      var p = parseAddress(addr);
      if (dir === 1) {
        if (p.col >= index) newStyles[formatAddress(p.row, p.col + count)] = sheet.styles[addr];
        else newStyles[addr] = sheet.styles[addr];
      } else {
        if (p.col >= index && p.col < index + count) return;
        if (p.col >= index + count) newStyles[formatAddress(p.row, p.col - count)] = sheet.styles[addr];
        else newStyles[addr] = sheet.styles[addr];
      }
    });
    sheet.styles = newStyles;
  }

  // ── 图表（P4b）：数据提取 + 推荐 + SVG 渲染（移植自 GenOffice chart-visual/chart-recommend 核心） ──
  function isNumericV(v) {
    return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
  }
  function toNumberV(v) {
    return typeof v === 'number' ? v : isNumericV(v) ? Number(String(v).trim()) : 0;
  }
  // 二维数组 → ParsedChartData {categories, series:[{name, values}], hasHeaderRow, hasCategoryColumn}
  function chartDataFromValues(source) {
    var firstRow = source[0];
    if (!firstRow || !firstRow.length) return null;
    var isBlank = function (v) { return v === null || v === undefined || v === ''; };
    var width = firstRow.length;
    var hasLabelHeader = source.length > 1 && firstRow.some(function (v, i) { return (width === 1 || i > 0) && !isBlank(v) && !isNumericV(v); });
    var hasCrossTab = source.length > 1 && width > 1 && isBlank(firstRow[0]) && firstRow.every(function (v, i) { return i === 0 || !isBlank(v); });
    var hasHeaderRow = hasLabelHeader || hasCrossTab;
    var body = (hasHeaderRow ? source.slice(1) : source).slice(0, 500);
    if (!body.length) return null;
    var hasCategoryColumn = width > 1 && (hasCrossTab || body.some(function (r) { return !isBlank(r[0]) && !isNumericV(r[0]); }));
    var categories = body.map(function (row, i) { return hasCategoryColumn ? String(row[0] === null || row[0] === undefined ? '' : row[0]) : String(i + 1); });
    var series = [];
    for (var col = hasCategoryColumn ? 1 : 0; col < width; col++) {
      if (!body.some(function (r) { return isNumericV(r[col]); })) continue;
      var header = hasHeaderRow ? firstRow[col] : null;
      series.push({
        name: isBlank(header) ? 'Series ' + (series.length + 1) : String(header),
        values: body.map(function (r) { return toNumberV(r[col]); }),
      });
      if (series.length >= 12) break;
    }
    return series.length ? { categories: categories, series: series, hasHeaderRow: hasHeaderRow, hasCategoryColumn: hasCategoryColumn } : null;
  }

  // 推荐图表类型（简化版）：≥2 series → column；分类是时间 → line；单 series 且分类≤8 → pie；否则 column
  function recommendChartKind(parsed) {
    if (!parsed) return 'column';
    if (parsed.series.length > 2) return 'column';
    if (parsed.series.length === 1 && parsed.categories.length <= 8) return 'pie';
    if (parsed.categories.length >= 6) return 'line';
    return 'column';
  }

  // SVG 渲染：parsed + kind → SVG 字符串（自绘，column/bar/line/pie）
  function chartToSvg(parsed, kind, title) {
    var W = 400, H = 240, padL = 50, padR = 16, padT = 30, padB = 36;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var cats = parsed.categories, series = parsed.series;
    var allVals = [];
    series.forEach(function (s) { s.values.forEach(function (v) { if (v !== null && v !== undefined) allVals.push(v); }); });
    var maxV = Math.max.apply(null, allVals.concat([1]));
    var minV = Math.min.apply(null, allVals.concat([0]));
    minV = Math.min(minV, 0);
    var span = maxV - minV || 1;
    var X = function (i) { return padL + (i + 0.5) * (plotW / cats.length); };
    var Y = function (v) { return padT + plotH - ((v - minV) / span) * plotH; };
    var colors = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#264478', '#C55A11'];
    var parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">');
    // 背景 + 网格
    parts.push('<rect x="' + padL + '" y="' + padT + '" width="' + plotW + '" height="' + plotH + '" fill="#fff"/>');
    for (var gi = 0; gi <= 4; gi++) {
      var gy = padT + plotH - (gi / 4) * plotH;
      parts.push('<line x1="' + padL + '" y1="' + gy + '" x2="' + (padL + plotW) + '" y2="' + gy + '" stroke="#eee" stroke-width="1"/>');
      var gv = minV + (span * gi) / 4;
      parts.push('<text x="' + (padL - 6) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="10" fill="#888">' + Math.round(gv * 100) / 100 + '</text>');
    }
    // 标题
    if (title) parts.push('<text x="' + (W / 2) + '" y="18" text-anchor="middle" font-size="13" font-weight="700" fill="#333">' + esc(title) + '</text>');
    var kind2 = kind === 'bar' ? 'column' : kind;
    if (kind2 === 'pie') {
      // 饼图：单 series
      var vals = series[0] ? series[0].values : [];
      var total = vals.reduce(function (s, v) { return s + Math.max(v, 0); }, 0) || 1;
      var cx = W / 2 - 20, cy = padT + plotH / 2, R = Math.min(plotW, plotH) / 2 - 10;
      var angle = -90;
      vals.forEach(function (v, i) {
        var sweep = (Math.max(v, 0) / total) * 360;
        var a1 = (angle * Math.PI) / 180, a2 = ((angle + sweep) * Math.PI) / 180;
        var x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
        var x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
        var large = sweep > 180 ? 1 : 0;
        parts.push('<path d="M' + cx + ',' + cy + ' L' + x1 + ',' + y1 + ' A' + R + ',' + R + ' 0 ' + large + ' 1 ' + x2 + ',' + y2 + ' Z" fill="' + colors[i % colors.length] + '"/>');
        // 图例
        parts.push('<rect x="' + (W - 90) + '" y="' + (padT + i * 16) + '" width="10" height="10" fill="' + colors[i % colors.length] + '"/>');
        var label = (cats[i] || ('项' + (i + 1))) + ' ' + Math.round((Math.max(v, 0) / total) * 100) + '%';
        parts.push('<text x="' + (W - 76) + '" y="' + (padT + i * 16 + 9) + '" font-size="10" fill="#444">' + esc(label) + '</text>');
        angle += sweep;
      });
    } else {
      // column/line：分组柱状
      var nS = series.length;
      var groupW = plotW / cats.length;
      var barW = Math.min(groupW / (nS + 1), 36);
      series.forEach(function (s, si) {
        var color = colors[si % colors.length];
        var linePts = [];
        s.values.forEach(function (v, ci) {
          if (v === null || v === undefined) return;
          var bx = X(ci) - (groupW * (nS - 1)) / 2 + si * barW - barW / 2;
          var by = Y(v), bh = padT + plotH - by;
          parts.push('<rect x="' + bx + '" y="' + by + '" width="' + barW + '" height="' + Math.max(bh, 0) + '" fill="' + color + '" opacity="0.9"/>');
          linePts.push(X(ci) + ',' + by);
        });
        if (kind === 'line' || kind2 === 'line') {
          parts.push('<polyline points="' + linePts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2"/>');
        }
      });
      // 分类轴标签
      cats.forEach(function (c, i) {
        var show = cats.length <= 12 || i % Math.ceil(cats.length / 12) === 0;
        if (show) parts.push('<text x="' + X(i) + '" y="' + (H - 14) + '" text-anchor="middle" font-size="9" fill="#888">' + esc(String(c).slice(0, 8)) + '</text>');
      });
      // 图例
      series.forEach(function (s, si) {
        parts.push('<rect x="' + (padL + si * 90) + '" y="' + (H - 22) + '" width="10" height="10" fill="' + colors[si % colors.length] + '"/>');
        parts.push('<text x="' + (padL + si * 90 + 13) + '" y="' + (H - 13) + '" font-size="9" fill="#444">' + esc(s.name) + '</text>');
      });
    }
    parts.push('</svg>');
    return parts.join('');
  }

  // ── 会话状态（单工作簿） ──
  var session = {
    snapshot: null,       // WorkbookSnapshot
    editor: null,         // Univer editor 实例（UI 同步目标）
    containerEl: null,    // 图表 SVG overlay 容器（Excel 窗口 DOM）
    undoStack: [],        // 快照栈
    redoStack: [],
    fileId: null,
    fileName: null,
  };

  // 渲染所有图表到容器（P4b：SVG overlay）
  function renderCharts(container) {
    if (!container) container = session.containerEl;
    if (!container || !session.snapshot) return;
    var sheets = session.snapshot.sheets;
    var html = '';
    sheets.forEach(function (s) {
      (s.visuals || []).forEach(function (v) {
        if (!v.data) return;
        var svg = chartToSvg(v.data, v.kind, v.title);
        html += '<div class="xlsx-ai-chart" data-visual="' + v.id + '" style="position:absolute;left:' + (v.x * 100) + '%;top:' + (v.y * 100) + '%;width:' + v.w + 'px;height:' + v.h + 'px;background:#fff;border:1px solid #d0d0d8;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.08);z-index:50;">' + svg + '<div style="position:absolute;top:2px;right:4px;font-size:10px;color:#aaa;cursor:pointer" title="删除图表" onclick="window.XlsxAI.deleteVisual(\'' + v.id + '\')">✕</div></div>';
      });
    });
    container.innerHTML = html;
  }

  function getSheetIdByName(name) {
    var s = session.snapshot.sheets.find(function (x) { return x.name === name; });
    return s ? s.id : null;
  }

  function pushUndo(snap) {
    session.undoStack.push(snap);
    if (session.undoStack.length > 50) session.undoStack.shift();
    session.redoStack = [];
  }

  // ── 对外 API ──
  window.XlsxAI = {
    // 载入 schema（打开文件后/首次）
    loadSchema: function (schemaData, editor, fileId, fileName, containerEl) {
      session.snapshot = snapshotFromSchema(schemaData);
      session.editor = editor || null;
      session.containerEl = containerEl || null;
      session.fileId = fileId || null;
      session.fileName = fileName || 'untitled.xlsx';
      session.undoStack = [];
      session.redoStack = [];
      renderCharts();
      return session.snapshot;
    },
    getSnapshot: function () { return session.snapshot; },
    getSchema: function () { return session.snapshot ? schemaFromSnapshot(session.snapshot) : null; },
    getSheetIdByName: getSheetIdByName,
    // 小吉入口：propose(operations, summary) → 应用 + UI 同步；返回 undo 句柄
    propose: function (operations, summary) {
      if (!session.snapshot) return { ok: false, error: '未加载工作簿' };
      try {
        var before = session.snapshot;
        var result = applyOps(before, operations);
        session.snapshot = result.snapshot;
        pushUndo(before);
        var schema = schemaFromSnapshot(result.snapshot);
        var synced = session.editor ? window.applySchemaToUniver(session.editor, schema) : true;
        renderCharts();
        return {
          ok: true,
          summary: summary || (operations.length + ' 个操作'),
          changes: result.changes.length,
          synced: synced,
          undo: function () { return window.XlsxAI.undo(); },
        };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    // 从 schema 构造并同步（AI 外部使用）
    applySchema: function (schemaData) {
      if (!session.editor) return false;
      return window.applySchemaToUniver(session.editor, schemaData);
    },
    undo: function () {
      if (!session.undoStack.length) return { ok: false, error: '没有可撤销的操作' };
      session.redoStack.push(session.snapshot);
      session.snapshot = session.undoStack.pop();
      if (session.editor) window.applySchemaToUniver(session.editor, schemaFromSnapshot(session.snapshot));
      renderCharts();
      return { ok: true };
    },
    redo: function () {
      if (!session.redoStack.length) return { ok: false, error: '没有可重做的操作' };
      session.undoStack.push(session.snapshot);
      session.snapshot = session.redoStack.pop();
      if (session.editor) window.applySchemaToUniver(session.editor, schemaFromSnapshot(session.snapshot));
      renderCharts();
      return { ok: true };
    },
    // 删除图表（SVG overlay 的 ✕ 按钮调用）
    deleteVisual: function (visualId) {
      var snap = session.snapshot;
      if (!snap) return { ok: false, error: '未加载工作簿' };
      var sheet = snap.sheets.find(function (s) { return (s.visuals || []).some(function (v) { return v.id === visualId; }); });
      if (!sheet) return { ok: false, error: '图表不存在' };
      return window.XlsxAI.propose([{ op: 'delete_visual', sheetId: sheet.id, visualId: visualId }], '删除图表');
    },
    // 图表工具（小吉/P5 用）
    chartDataFromValues: chartDataFromValues,
    recommendChartKind: recommendChartKind,
    chartToSvg: chartToSvg,
    renderCharts: function (container) { renderCharts(container); },
    // 保存：schema → POST /api/office/save（writeXlsx 通道）
    save: async function () {
      if (!session.snapshot) return { ok: false, error: '未加载工作簿' };
      var schema = schemaFromSnapshot(session.snapshot);
      var payload = { type: 'xlsx', name: session.fileName || 'untitled.xlsx', data: { sheets: schema.sheets } };
      try {
        var resp = await fetch('/api/office/save?api_key=dev-key-001', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        var r = await resp.json();
        if (r.ok) {
          session.fileId = r.fileId;
          session.fileName = r.fileName;
          return { ok: true, fileId: r.fileId, fileName: r.fileName, size: r.size };
        }
        return { ok: false, error: r.error || '保存失败' };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    // 内部工具（测试用）
    _internal: { parseAddress: parseAddress, formatAddress: formatAddress, parseRange: parseRange, applyOps: applyOps, expandOps: expandOps },
  };
})();
