// ACMS 表格维度选择器 — 学 OO DimensionPicker (297行) + InsertTableDialog (147行)
// 设计思路: 在按钮下方弹出 10×10 网格, 悬停高亮, 点击确认行列数
// AGPL 安全: 全部自写, 只学 OO 的网格选择交互模式
(function (root) {
  'use strict';

  function createTablePicker(triggerEl, onPick) {
    var PICKER_MAX = 10;
    var overlay = document.createElement('div');
    overlay.className = 'oo-table-picker-overlay';
    overlay.style.cssText =
      'position:fixed;z-index:9999;background:var(--bg,#fff);border:1px solid var(--border,#ddd);' +
      'border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:8px;';

    // 标题行: 显示 N×M
    var label = document.createElement('div');
    label.style.cssText = 'font-size:12px;color:var(--text2,#888);margin-bottom:6px;text-align:center;';
    label.textContent = '1 × 1';
    overlay.appendChild(label);

    // 网格容器
    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(' + PICKER_MAX + ',18px);gap:2px;';

    var cells = [];
    var currentRows = 1, currentCols = 1;

    function clearHighlight() {
      cells.forEach(function (c) {
        c.style.background = '';
        c.style.borderColor = '#ddd';
      });
    }

    function highlight(r, c) {
      clearHighlight();
      for (var ri = 0; ri <= r; ri++) {
        for (var ci = 0; ci <= c; ci++) {
          var idx = ri * PICKER_MAX + ci;
          if (cells[idx]) {
            cells[idx].style.background = 'var(--office-accent-soft, #dde4ee)';
            cells[idx].style.borderColor = 'var(--office-primary, #446995)';
          }
        }
      }
    }

    for (var ri = 0; ri < PICKER_MAX; ri++) {
      for (var ci = 0; ci < PICKER_MAX; ci++) {
        var cell = document.createElement('div');
        cell.style.cssText =
          'width:18px;height:18px;border:1px solid #ddd;border-radius:2px;cursor:pointer;' +
          'transition:background 0.1s,border-color 0.1s;';
        cell.dataset.r = ri;
        cell.dataset.c = ci;
        cell.onmouseenter = function () {
          var r = parseInt(this.dataset.r);
          var c = parseInt(this.dataset.c);
          currentRows = r + 1;
          currentCols = c + 1;
          highlight(r, c);
          label.textContent = currentRows + ' × ' + currentCols;
        };
        cell.onclick = function () {
          var r = parseInt(this.dataset.r) + 1;
          var c = parseInt(this.dataset.c) + 1;
          onPick(r, c);
          document.body.removeChild(overlay);
        };
        grid.appendChild(cell);
        cells.push(cell);
      }
    }

    overlay.appendChild(grid);

    // 底部快速按钮: 3×3, 5×5, 7×5
    var quickRow = document.createElement('div');
    quickRow.style.cssText = 'display:flex;gap:4px;margin-top:6px;justify-content:center;';
    [[3,3],[5,5],[7,5],[8,10]].forEach(function (size) {
      var btn = document.createElement('button');
      btn.textContent = size[0] + '×' + size[1];
      btn.style.cssText =
        'font-size:11px;padding:2px 6px;border:1px solid var(--border,#ddd);border-radius:3px;' +
        'background:transparent;cursor:pointer;';
      btn.onclick = function (e) {
        e.stopPropagation();
        onPick(size[0], size[1]);
        document.body.removeChild(overlay);
      };
      quickRow.appendChild(btn);
    });
    overlay.appendChild(quickRow);

    // 定位在 triggerEl 下方
    function position() {
      var rect = triggerEl.getBoundingClientRect();
      overlay.style.left = rect.left + 'px';
      overlay.style.top = (rect.bottom + 4) + 'px';
    }
    position();

    // 点击外部关闭
    function onDocClick(e) {
      if (!overlay.contains(e.target) && e.target !== triggerEl) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        document.removeEventListener('mousedown', onDocClick);
        document.removeEventListener('scroll', position, true);
      }
    }
    setTimeout(function () { document.addEventListener('mousedown', onDocClick); }, 0);
    document.addEventListener('scroll', position, true);

    document.body.appendChild(overlay);
  }

  root.ACMS = root.ACMS || {};
  root.ACMS.TablePicker = { create: createTablePicker };
})(window);
