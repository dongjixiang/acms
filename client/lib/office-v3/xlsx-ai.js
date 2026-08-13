// ACMS sheets AI 核心（P4a）— 内存工作簿模型 + workbook DSL 执行器 + Undo + UI 同步 + 保存
// DSL 语义移植自 GenOffice vendor/office-v3/sheets/（Apache-2.0）：op 类型/展开规则/2000 上限
// 设计：AI 操作内存 schema（纯逻辑可测）→ applySchemaToUniver 同步 UI（v2 已验证路径）→ schema→writeXlsx 保存
(function () {
  'use strict';

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
        return { id: 'sheet' + (si + 1), name: s.name || 'Sheet' + (si + 1), cells: cells, styles: {} };
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
        return { id: s.id, name: s.name, cells: Object.assign({}, s.cells), styles: Object.assign({}, s.styles) };
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

  // ── 会话状态（单工作簿） ──
  var session = {
    snapshot: null,       // WorkbookSnapshot
    editor: null,         // Univer editor 实例（UI 同步目标）
    undoStack: [],        // 快照栈
    redoStack: [],
    fileId: null,
    fileName: null,
  };

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
    loadSchema: function (schemaData, editor, fileId, fileName) {
      session.snapshot = snapshotFromSchema(schemaData);
      session.editor = editor || null;
      session.fileId = fileId || null;
      session.fileName = fileName || 'untitled.xlsx';
      session.undoStack = [];
      session.redoStack = [];
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
        return {
          ok: true,
          summary: summary || (operations.length + ' 个操作'),
          changes: result.changes.length,
          synced: synced,
          undo: function () { window.XlsxAI.undo(); },
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
      return { ok: true };
    },
    redo: function () {
      if (!session.redoStack.length) return { ok: false, error: '没有可重做的操作' };
      session.undoStack.push(session.snapshot);
      session.snapshot = session.redoStack.pop();
      if (session.editor) window.applySchemaToUniver(session.editor, schemaFromSnapshot(session.snapshot));
      return { ok: true };
    },
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
