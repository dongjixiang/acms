// ACMS 俄罗斯方块 v0.1
(function() {
  'use strict';
  var canvas, ctx, animId;
  var COLS = 10, ROWS = 20, cellSize = 28;
  var board, currentPiece, currentX, currentY, currentRot, score, lines, level, gameOver;
  var dropInterval = 800, lastDrop = 0;
  var w_ref = null;

  var SHAPES = [
    [[1,1,1,1]],                          // I
    [[1,1],[1,1]],                          // O
    [[0,1,0],[1,1,1]],                      // T
    [[1,0,0],[1,1,1]],                      // L
    [[0,0,1],[1,1,1]],                      // J
    [[0,1,1],[1,1,0]],                      // S
    [[1,1,0],[0,1,1]],                      // Z
  ];
  var COLORS = ['#00f0f0', '#f0f000', '#a000f0', '#f0a000', '#0000f0', '#00f000', '#f00000'];

  function init(w) {
    w_ref = w;
    if (animId) cancelAnimationFrame(animId);
    board = [];
    for (var r = 0; r < ROWS; r++) board[r] = new Array(COLS).fill(0);
    score = 0; lines = 0; level = 1; gameOver = false;
    spawnPiece();
    lastDrop = Date.now();
    draw();
    bindKeys();
    loop();
  }

  function spawnPiece() {
    var idx = Math.floor(Math.random() * SHAPES.length);
    currentPiece = SHAPES[idx].map(function(r) { return r.slice(); });
    currentRot = idx;
    currentX = Math.floor((COLS - currentPiece[0].length) / 2);
    currentY = 0;
    if (collides(currentPiece, currentX, currentY)) { gameOver = true; }
  }

  function rotate(piece) {
    var h = piece.length, w = piece[0].length;
    var result = [];
    for (var c = 0; c < w; c++) {
      result[c] = [];
      for (var r = h - 1; r >= 0; r--) result[c].push(piece[r][c]);
    }
    return result;
  }

  function collides(piece, px, py) {
    for (var r = 0; r < piece.length; r++)
      for (var c = 0; c < piece[r].length; c++)
        if (piece[r][c]) {
          var nx = px + c, ny = py + r;
          if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
          if (ny >= 0 && board[ny][nx]) return true;
        }
    return false;
  }

  function lock() {
    for (var r = 0; r < currentPiece.length; r++)
      for (var c = 0; c < currentPiece[r].length; c++)
        if (currentPiece[r][c]) {
          var ny = currentY + r;
          if (ny >= 0 && ny < ROWS) board[ny][currentX + c] = currentRot + 1;
        }
    // Clear lines
    var cleared = 0;
    for (var r = ROWS - 1; r >= 0; r--) {
      if (board[r].every(function(v) { return v !== 0; })) {
        board.splice(r, 1);
        board.unshift(new Array(COLS).fill(0));
        cleared++; r++;
      }
    }
    if (cleared > 0) {
      var pts = [0, 100, 300, 500, 800];
      score += (pts[cleared] || 800) * level;
      lines += cleared;
      level = Math.floor(lines / 10) + 1;
      dropInterval = Math.max(100, 800 - (level - 1) * 60);
    }
    spawnPiece();
  }

  function loop() {
    if (gameOver) { draw(); return; }
    var now = Date.now();
    if (now - lastDrop > dropInterval) {
      lastDrop = now;
      if (!collides(currentPiece, currentX, currentY + 1)) { currentY++; }
      else { lock(); }
    }
    draw();
    animId = requestAnimationFrame(loop);
  }

  function draw() {
    if (!ctx) return;
    var boardW = COLS * cellSize, boardH = ROWS * cellSize;
    var totalW = boardW + 140, totalH = boardH;
    if (!canvas || canvas.width !== totalW) {
      canvas.width = totalW; canvas.height = totalH;
    }
    // Background
    ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, totalW, totalH);
    // Board
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, boardW, boardH);
    // Grid
    ctx.strokeStyle = '#2a2a4e'; ctx.lineWidth = 0.5;
    for (var r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * cellSize); ctx.lineTo(boardW, r * cellSize); ctx.stroke(); }
    for (var c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c * cellSize, 0); ctx.lineTo(c * cellSize, boardH); ctx.stroke(); }
    // Placed blocks
    for (var r = 0; r < ROWS; r++)
      for (var c = 0; c < COLS; c++)
        if (board[r][c]) {
          ctx.fillStyle = COLORS[board[r][c] - 1];
          ctx.fillRect(c * cellSize + 1, r * cellSize + 1, cellSize - 2, cellSize - 2);
        }
    // Current piece
    if (!gameOver && currentPiece) {
      ctx.fillStyle = COLORS[currentRot];
      for (var r = 0; r < currentPiece.length; r++)
        for (var c = 0; c < currentPiece[r].length; c++)
          if (currentPiece[r][c])
            ctx.fillRect((currentX + c) * cellSize + 1, (currentY + r) * cellSize + 1, cellSize - 2, cellSize - 2);
    }
    // Side panel
    var sx = boardW + 12;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'left';
    ctx.fillText('分数: ' + score, sx, 24);
    ctx.fillText('行数: ' + lines, sx, 48);
    ctx.fillText('等级: ' + level, sx, 72);
    if (gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, boardW, boardH);
      ctx.fillStyle = '#e74c3c'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center';
      ctx.fillText('游戏结束!', boardW / 2, boardH / 2 - 10);
      ctx.fillStyle = '#fff'; ctx.font = '14px Arial';
      ctx.fillText('分数: ' + score, boardW / 2, boardH / 2 + 14);
    }
  }

  function bindKeys() {
    var handler = function(e) {
      if (gameOver) return;
      if (e.target.tagName === 'INPUT') return;
      var moved = false;
      if (e.key === 'ArrowLeft')  { if (!collides(currentPiece, currentX - 1, currentY)) currentX--; moved = true; }
      if (e.key === 'ArrowRight') { if (!collides(currentPiece, currentX + 1, currentY)) currentX++; moved = true; }
      if (e.key === 'ArrowDown')  { if (!collides(currentPiece, currentX, currentY + 1)) currentY++; moved = true; }
      if (e.key === 'ArrowUp') {
        var rot = rotate(currentPiece);
        if (!collides(rot, currentX, currentY)) { currentPiece = rot; currentRot = (currentRot + 1) % SHAPES.length; }
        moved = true;
      }
      if (e.key === ' ') {
        while (!collides(currentPiece, currentX, currentY + 1)) currentY++;
        lock(); moved = true;
      }
      if (moved) { e.preventDefault(); draw(); }
    };
    document.addEventListener('keydown', handler);
    w_ref._keyHandler = handler;
    w_ref.$c.onclick = function() { if (gameOver) init(w_ref); };
  }

  function render(w) {
    var W = COLS * cellSize + 140, H = ROWS * cellSize;
    var html = '<div style="padding:8px;box-sizing:border-box;height:100%;display:flex;flex-direction:column;background:#0a0a1a;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
    html += '<span style="color:#9b59b6;font-weight:700;font-size:14px;">🧱 俄罗斯方块</span>';
    html += '<span style="color:#888;font-size:11px;">方向键移动 · 上旋转 · 空格下落</span>';
    html += '</div>';
    html += '<canvas id="tetris-canvas" style="display:block;margin:0 auto;border:1px solid #333;border-radius:4px;"></canvas>';
    html += '</div>';
    w.$c.innerHTML = html;
    canvas = document.getElementById('tetris-canvas');
    canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');
  }

  function loader(w) {
    if (w._keyHandler) document.removeEventListener('keydown', w._keyHandler);
    if (animId) cancelAnimationFrame(animId);
    render(w); init(w);
  }

  if (typeof ACMSWin !== 'undefined' && ACMSWin.registerViewLoader) {
    ACMSWin.registerViewLoader('game-tetris', loader);
  }
})();
