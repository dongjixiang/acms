// ACMS Pong 游戏 v0.1 — 人机对战
(function() {
  'use strict';
  var canvas, ctx, animId;
  var W, H, cell = 10;
  var paddleW = 10, paddleH = 70, paddleSpeed = 5;
  var ballSize = 10, ballSpeedX = 3, ballSpeedY = 2;
  var playerY, aiY, ballX, ballY, ballVX, ballVY;
  var playerScore = 0, aiScore = 0;
  var running = false, keys = {};
  var w_ref = null;

  function init(w) {
    w_ref = w;
    if (animId) cancelAnimationFrame(animId);
    W = Math.floor((w.opts && w.opts.w ? w.opts.w : 480) / cell) * cell;
    H = Math.floor((w.opts && w.opts.h ? w.opts.h : 380) / cell) * cell;
    W = Math.max(320, W); H = Math.max(260, H);
    paddleH = Math.max(40, Math.floor(H / 6));
    playerY = H / 2 - paddleH / 2;
    aiY = H / 2 - paddleH / 2;
    resetBall();
    playerScore = 0; aiScore = 0;
    running = true;
    keys = {};
    render();
    bindKeys();
    loop();
  }

  function resetBall() {
    ballX = W / 2; ballY = H / 2;
    ballVX = (Math.random() > 0.5 ? 1 : -1) * ballSpeedX;
    ballVY = (Math.random() - 0.5) * ballSpeedY * 2;
  }

  function loop() {
    if (!running) return;
    update();
    draw();
    animId = requestAnimationFrame(loop);
  }

  function update() {
    // Player movement
    if (keys['ArrowUp'] || keys['w']) playerY -= paddleSpeed;
    if (keys['ArrowDown'] || keys['s']) playerY += paddleSpeed;
    playerY = Math.max(0, Math.min(H - paddleH, playerY));
    // AI movement
    var aiCenter = aiY + paddleH / 2;
    if (aiCenter < ballY - 10) aiY += paddleSpeed * 0.6;
    else if (aiCenter > ballY + 10) aiY -= paddleSpeed * 0.6;
    aiY = Math.max(0, Math.min(H - paddleH, aiY));
    // Ball movement
    ballX += ballVX; ballY += ballVY;
    // Bounce top/bottom
    if (ballY <= 0 || ballY + ballSize >= H) ballVY = -ballVY;
    // Paddle collision - player
    if (ballX <= paddleW + 4 && ballY + ballSize >= playerY && ballY <= playerY + paddleH) {
      ballVX = Math.abs(ballVX) * 1.05;
      ballVY += (Math.random() - 0.5) * 2;
    }
    // Paddle collision - AI
    if (ballX + ballSize >= W - paddleW - 4 && ballY + ballSize >= aiY && ballY <= aiY + paddleH) {
      ballVX = -Math.abs(ballVX) * 1.05;
      ballVY += (Math.random() - 0.5) * 2;
    }
    // Score
    if (ballX < 0) { aiScore++; resetBall(); }
    if (ballX > W) { playerScore++; resetBall(); }
    // Speed cap
    ballVX = Math.max(-8, Math.min(8, ballVX));
    ballVY = Math.max(-6, Math.min(6, ballVY));
  }

  function draw() {
    ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, W, H);
    // Center line
    ctx.setLineDash([8, 8]); ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.setLineDash([]);
    // Paddles
    ctx.fillStyle = '#3498db';
    ctx.fillRect(2, playerY, paddleW, paddleH);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(W - paddleW - 2, aiY, paddleW, paddleH);
    // Ball
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ballX + ballSize / 2, ballY + ballSize / 2, ballSize / 2, 0, Math.PI * 2); ctx.fill();
    // Score
    ctx.fillStyle = '#fff'; ctx.font = 'bold 32px Arial'; ctx.textAlign = 'center';
    ctx.fillText(playerScore, W / 4, 50);
    ctx.fillText(aiScore, W * 3 / 4, 50);
  }

  function bindKeys() {
    var kd = function(e) { keys[e.key] = true; if (['ArrowUp', 'ArrowDown', ' '].indexOf(e.key) >= 0) e.preventDefault(); };
    var ku = function(e) { keys[e.key] = false; };
    document.addEventListener('keydown', kd);
    document.addEventListener('keyup', ku);
    w_ref._keyHandlers = [kd, ku];
  }

  function render() {
    var html = '<div style="padding:8px;box-sizing:border-box;height:100%;display:flex;flex-direction:column;background:#0a0a1a;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
    html += '<span style="color:#3498db;font-weight:700;font-size:14px;">🏓 Pong</span>';
    html += '<span style="color:#888;font-size:11px;">↑↓ / WASD 移动</span>';
    html += '</div>';
    html += '<canvas id="pong-canvas" style="border-radius:4px;display:block;margin:0 auto;border:1px solid #222;"></canvas>';
    html += '</div>';
    w_ref.$c.innerHTML = html;
    canvas = document.getElementById('pong-canvas');
    canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');
  }

  function loader(w) {
    if (w._keyHandlers) {
      w._keyHandlers.forEach(function(h) { document.removeEventListener('keydown', h); document.removeEventListener('keyup', h); });
    }
    if (animId) cancelAnimationFrame(animId);
    init(w);
  }

  if (typeof ACMSWin !== 'undefined' && ACMSWin.registerViewLoader) {
    ACMSWin.registerViewLoader('game-pong', loader);
  }
})();
