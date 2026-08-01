// ACMS 贪吃蛇 v0.1
(function() {
  'use strict';
  var canvas, ctx, cell = 20, cols, rows;
  var snake, dir, nextDir, food, score, gameLoop, speed = 120, running = false;
  var w_ref = null;

  function init(w) {
    w_ref = w;
    if (gameLoop) clearInterval(gameLoop);
    cols = Math.floor((w.opts && w.opts.w ? w.opts.w : 420) / cell);
    rows = Math.floor((w.opts && w.opts.h ? w.opts.h : 480) / cell);
    cols = Math.max(10, Math.min(20, cols));
    rows = Math.max(10, Math.min(20, rows));
    var W = cols * cell, H = rows * cell;
    snake = [{ x: Math.floor(cols / 2), y: Math.floor(rows / 2) }];
    dir = { x: 1, y: 0 }; nextDir = { x: 1, y: 0 };
    score = 0; running = true;
    spawnFood(W, H);
    render(W, H);
    bindKeys();
    gameLoop = setInterval(function() { tick(W, H); }, speed);
  }

  function spawnFood(W, H) {
    do {
      food = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
    } while (snake.some(function(s) { return s.x === food.x && s.y === food.y; }));
  }

  function tick(W, H) {
    if (!running) return;
    dir = nextDir;
    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.x >= cols || head.y < 0 || head.y >= rows ||
        snake.some(function(s) { return s.x === head.x && s.y === head.y; })) {
      running = false;
      draw(W, H, true); return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10; spawnFood(W, H);
    } else { snake.pop(); }
    draw(W, H, false);
  }

  function draw(W, H, dead) {
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, W, H);
    // Grid
    ctx.strokeStyle = '#2a2a4e'; ctx.lineWidth = 0.5;
    for (var x = 0; x <= W; x += cell) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (var y = 0; y <= H; y += cell) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // Food
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath(); ctx.arc(food.x * cell + cell / 2, food.y * cell + cell / 2, cell / 2 - 2, 0, Math.PI * 2); ctx.fill();
    // Snake
    snake.forEach(function(s, i) {
      ctx.fillStyle = i === 0 ? '#2ecc71' : '#27ae60';
      ctx.fillRect(s.x * cell + 1, s.y * cell + 1, cell - 2, cell - 2);
    });
    // HUD
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'left';
    ctx.fillText('分数: ' + score, 8, 20);
    if (dead) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e74c3c'; ctx.font = 'bold 28px Arial'; ctx.textAlign = 'center';
      ctx.fillText('游戏结束!', W / 2, H / 2 - 10);
      ctx.fillStyle = '#fff'; ctx.font = '14px Arial';
      ctx.fillText('分数: ' + score + '  点击重新开始', W / 2, H / 2 + 16);
    }
  }

  function bindKeys() {
    var handler = function(e) {
      if (e.target.tagName === 'INPUT') return;
      var map = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
                  ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
                  w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 } };
      if (map[e.key]) {
        e.preventDefault();
        var nd = map[e.key];
        if (nd.x !== -dir.x || nd.y !== -dir.y) nextDir = nd;
      }
    };
    document.addEventListener('keydown', handler);
    w_ref._keyHandler = handler;
    // Click to restart
    w_ref.$c.onclick = function() { if (!running) init(w_ref); };
  }

  function render(W, H) {
    var html = '<div style="padding:8px;box-sizing:border-box;height:100%;display:flex;flex-direction:column;background:#0f0f23;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
    html += '<span style="color:#2ecc71;font-weight:700;font-size:16px;">🐍 贪吃蛇</span>';
    html += '<span style="color:#fff;font-size:12px;">方向键/WASD 控制</span>';
    html += '</div>';
    html += '<canvas id="snake-canvas" style="border-radius:4px;display:block;margin:0 auto;"></canvas>';
    html += '</div>';
    w_ref.$c.innerHTML = html;
    canvas = document.getElementById('snake-canvas');
    canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');
    draw(W, H, false);
  }

  function loader(w) {
    if (w._keyHandler) document.removeEventListener('keydown', w._keyHandler);
    if (gameLoop) clearInterval(gameLoop);
    init(w);
  }

  if (typeof ACMSWin !== 'undefined' && ACMSWin.registerViewLoader) {
    ACMSWin.registerViewLoader('game-snake', loader);
  }
})();
