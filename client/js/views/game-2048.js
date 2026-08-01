// ACMS 2048 游戏 v0.1
(function() {
  'use strict';

  var grid = [], score = 0, won = false, over = false;
  var SIZE = 4;
  var cellSize = 80, gap = 8;
  var canvas, ctx, animFrame;

  function init(w) {
    if (w.dead) return;
    grid = newArray(SIZE, 0);
    score = 0; won = false; over = false;
    spawn(); spawn();
    render(w);
    bindKeys();
  }

  function newArray(n, val) {
    var a = [];
    for (var i = 0; i < n; i++) a[i] = new Array(n).fill(0);
    return a;
  }

  function spawn() {
    var empty = [];
    for (var r = 0; r < SIZE; r++)
      for (var c = 0; c < SIZE; c++)
        if (grid[r][c] === 0) empty.push([r, c]);
    if (empty.length === 0) return;
    var [r, c] = empty[Math.floor(Math.random() * empty.length)];
    grid[r][c] = Math.random() < 0.9 ? 2 : 4;
  }

  function move(dir) {
    if (over || won) return;
    var old = JSON.stringify(grid);
    if (dir === 'left') slideLeft();
    else if (dir === 'right') slideRight();
    else if (dir === 'up') slideUp();
    else if (dir === 'down') slideDown();
    if (JSON.stringify(grid) !== old) {
      spawn();
      checkState();
      render(w);
    }
  }

  function slideLeft() {
    for (var r = 0; r < SIZE; r++) {
      var row = grid[r].filter(function(v) { return v !== 0; });
      for (var i = 0; i < row.length - 1; i++) {
        if (row[i] === row[i + 1]) { row[i] *= 2; score += row[i]; row[i + 1] = 0; }
      }
      row = row.filter(function(v) { return v !== 0; });
      while (row.length < SIZE) row.push(0);
      grid[r] = row;
    }
  }

  function slideRight() {
    for (var r = 0; r < SIZE; r++) {
      var row = grid[r].filter(function(v) { return v !== 0; }).reverse();
      for (var i = 0; i < row.length - 1; i++) {
        if (row[i] === row[i + 1]) { row[i] *= 2; score += row[i]; row[i + 1] = 0; }
      }
      row = row.filter(function(v) { return v !== 0; }).reverse();
      while (row.length < SIZE) row.push(0);
      grid[r] = row;
    }
  }

  function slideUp() {
    for (var c = 0; c < SIZE; c++) {
      var col = [];
      for (var r = 0; r < SIZE; r++) col.push(grid[r][c]);
      col = col.filter(function(v) { return v !== 0; });
      for (var i = 0; i < col.length - 1; i++) {
        if (col[i] === col[i + 1]) { col[i] *= 2; score += col[i]; col[i + 1] = 0; }
      }
      col = col.filter(function(v) { return v !== 0; });
      while (col.length < SIZE) col.push(0);
      for (var r = 0; r < SIZE; r++) grid[r][c] = col[r];
    }
  }

  function slideDown() {
    for (var c = 0; c < SIZE; c++) {
      var col = [];
      for (var r = 0; r < SIZE; r++) col.push(grid[r][c]);
      col = col.filter(function(v) { return v !== 0; }).reverse();
      for (var i = 0; i < col.length - 1; i++) {
        if (col[i] === col[i + 1]) { col[i] *= 2; score += col[i]; col[i + 1] = 0; }
      }
      col = col.filter(function(v) { return v !== 0; }).reverse();
      while (col.length < SIZE) col.push(0);
      for (var r = 0; r < SIZE; r++) grid[r][c] = col[r];
    }
  }

  function checkState() {
    for (var r = 0; r < SIZE; r++)
      for (var c = 0; c < SIZE; c++)
        if (grid[r][c] === 2048) won = true;
    var hasMove = false;
    for (var r = 0; r < SIZE; r++)
      for (var c = 0; c < SIZE; c++) {
        if (grid[r][c] === 0) hasMove = true;
        if (c < SIZE - 1 && grid[r][c] === grid[r][c + 1]) hasMove = true;
        if (r < SIZE - 1 && grid[r][c] === grid[r + 1][c]) hasMove = true;
      }
    if (!hasMove) over = true;
  }

  function getTileColor(v) {
    var colors = {
      0: '#cdc1b4', 2: '#eee4da', 4: '#ede0c8', 8: '#f2b179',
      16: '#f59563', 32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72',
      256: '#edcc61', 512: '#edc850', 1024: '#edc53f', 2048: '#edc22e'
    };
    return colors[v] || '#3c3a32';
  }

  function render(w) {
    if (w.dead) return;
    var html = '<div style="padding:12px;box-sizing:border-box;height:100%;display:flex;flex-direction:column;background:#faf8ef;">';
    // Header
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
    html += '<div style="font-size:24px;font-weight:700;color:#776e65;">2048</div>';
    html += '<div style="display:flex;gap:8px;">';
    html += '<div style="background:#bbada0;padding:4px 12px;border-radius:4px;text-align:center;">';
    html += '<div style="font-size:10px;color:#eee4da;font-weight:600;">分数</div>';
    html += '<div style="font-size:16px;color:white;font-weight:700;" id="score">' + score + '</div>';
    html += '</div>';
    html += '<div style="background:#bbada0;padding:4px 12px;border-radius:4px;text-align:center;cursor:pointer;" onclick="document.querySelector(\'.game-2048-restart\').click()">';
    html += '<div style="font-size:10px;color:#eee4da;font-weight:600;">新游戏</div>';
    html += '</div>';
    html += '</div></div>';
    // Canvas
    var totalW = SIZE * cellSize + (SIZE + 1) * gap;
    var totalH = SIZE * cellSize + (SIZE + 1) * gap;
    html += '<div style="position:relative;margin:0 auto;">';
    html += '<canvas id="game2048-canvas" width="' + totalW + '" height="' + totalH + '" class="game-2048-restart"></canvas>';
    // Overlay for game over / win
    html += '<div id="overlay2048" style="display:none;position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(238,228,218,0.73);border-radius:6px;flex-direction:column;align-items:center;justify-content:center;">';
    html += '<div id="overlayText2048" style="font-size:48px;font-weight:700;color:#776e65;margin-bottom:16px;">Game Over</div>';
    html += '<button id="retryBtn2048" style="padding:8px 24px;font-size:16px;background:#8f7a66;color:white;border:none;border-radius:4px;cursor:pointer;">再来一局</button>';
    html += '</div></div>';
    // Touch controls
    html += '<div style="margin-top:12px;display:flex;justify-content:center;gap:4px;">';
    html += '<button onclick="window._game2048Move(\'up\')" style="width:50px;height:36px;font-size:18px;background:#8f7a66;color:white;border:none;border-radius:4px;cursor:pointer;">↑</button>';
    html += '<div style="display:flex;flex-direction:column;gap:4px;">';
    html += '<button onclick="window._game2048Move(\'left\')" style="width:36px;height:36px;font-size:18px;background:#8f7a66;color:white;border:none;border-radius:4px;cursor:pointer;">←</button>';
    html += '<button onclick="window._game2048Move(\'right\')" style="width:36px;height:36px;font-size:18px;background:#8f7a66;color:white;border:none;border-radius:4px;cursor:pointer;">→</button>';
    html += '</div>';
    html += '<button onclick="window._game2048Move(\'down\')" style="width:50px;height:36px;font-size:18px;background:#8f7a66;color:white;border:none;border-radius:4px;cursor:pointer;">↓</button>';
    html += '</div>';
    html += '<div style="margin-top:8px;text-align:center;font-size:11px;color:#776e65;">方向键或按钮移动</div>';
    html += '</div>';
    w.$c.innerHTML = html;

    canvas = document.getElementById('game2048-canvas');
    ctx = canvas.getContext('2d');
    draw();

    document.getElementById('retryBtn2048').addEventListener('click', function() { init(w); });
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var x = gap + c * (cellSize + gap);
        var y = gap + r * (cellSize + gap);
        ctx.fillStyle = getTileColor(grid[r][c]);
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, y, cellSize, cellSize, 4) : ctx.rect(x, y, cellSize, cellSize);
        ctx.fill();
        if (grid[r][c] !== 0) {
          ctx.fillStyle = grid[r][c] <= 4 ? '#776e65' : '#f9f6f2';
          ctx.font = 'bold ' + (grid[r][c] >= 1000 ? 20 : grid[r][c] >= 100 ? 24 : 28) + 'px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(grid[r][c], x + cellSize / 2, y + cellSize / 2);
        }
      }
    }
    var ov = document.getElementById('overlay2048');
    if (over || won) {
      ov.style.display = 'flex';
      document.getElementById('overlayText2048').textContent = won ? '你赢了!' : 'Game Over';
    } else {
      ov.style.display = 'none';
    }
    var sc = document.getElementById('score');
    if (sc) sc.textContent = score;
  }

  function bindKeys() {
    var handler = function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      var map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
    };
    document.addEventListener('keydown', handler);
    w._keyHandler = handler;
  }

  window._game2048Move = function(dir) { move(dir); };

  function loader(w) {
    if (w._keyHandler) document.removeEventListener('keydown', w._keyHandler);
    if (animFrame) cancelAnimationFrame(animFrame);
    init(w);
  }

  // Register
  if (typeof ACMSWin !== 'undefined' && ACMSWin.registerViewLoader) {
    ACMSWin.registerViewLoader('game-2048', loader);
  }
})();
