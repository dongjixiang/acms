// ACMS 游戏中心 v0.1
// 右键菜单「游戏中心」入口 → 游戏大厅窗口 → 4 个独立游戏
(function() {
  'use strict';

  // ── 游戏大厅视图 ──
  function renderGameCenter(w) {
    if (w.dead) return;
    w.$c.innerHTML = '';

    var games = [
      { id: '2048',       label: '2048',      icon: '🔢', color: '#e67e22', desc: '滑动合并数字，目标 2048' },
      { id: 'snake',      label: '贪吃蛇',     icon: '🐍', color: '#27ae60', desc: '吃豆子变长，别撞墙' },
      { id: 'pong',       label: 'Pong',       icon: '🏓', color: '#3498db', desc: '经典乒乓球，人机对战' },
      { id: 'tetris',     label: '俄罗斯方块', icon: '🧱', color: '#9b59b6', desc: '经典方块消除' },
    ];

    var html = '';
    html += '<div style="padding:16px;box-sizing:border-box;height:100%;display:flex;flex-direction:column;">';
    html += '<h2 style="margin:0 0 4px 0;font-size:18px;color:var(--text1)">🎮 游戏中心</h2>';
    html += '<p style="margin:0 0 16px 0;font-size:12px;color:var(--text2)">选择游戏开始游玩</p>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;flex:1;">';

    games.forEach(function(g) {
      html += '<div class="game-card" data-game="' + g.id + '" style="';
      html += 'background:var(--bg2);border:1px solid var(--border);border-radius:12px;';
      html += 'padding:20px;cursor:pointer;display:flex;flex-direction:column;align-items:center;';
      html += 'text-align:center;transition:all 0.15s;min-height:120px;">';
      html += '<div style="font-size:36px;margin-bottom:8px;">' + g.icon + '</div>';
      html += '<div style="font-size:16px;font-weight:600;color:var(--text1);margin-bottom:4px;">' + g.label + '</div>';
      html += '<div style="font-size:11px;color:var(--text2);line-height:1.4;">' + g.desc + '</div>';
      html += '<div style="margin-top:12px;padding:4px 16px;border-radius:20px;font-size:11px;font-weight:600;background:' + g.color + '22;color:' + g.color + '">开始游戏</div>';
      html += '</div>';
    });

    html += '</div></div>';
    w.$c.innerHTML = html;

    w.$c.querySelectorAll('.game-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var gameId = card.getAttribute('data-game');
        openGame(gameId);
      });
      card.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-2px)';
        this.style.boxShadow = '0 4px 12px var(--shadow)';
      });
      card.addEventListener('mouseleave', function() {
        this.style.transform = '';
        this.style.boxShadow = '';
      });
    });
  }

  // ── 打开单个游戏窗口 ──
  function openGame(gameId) {
    var configs = {
      '2048':   { w: 360, h: 480, title: '2048' },
      'snake':  { w: 420, h: 480, title: '贪吃蛇' },
      'pong':   { w: 480, h: 380, title: 'Pong' },
      'tetris': { w: 300, h: 500, title: '俄罗斯方块' },
    };
    var cfg = configs[gameId] || { w: 400, h: 400, title: gameId };
    if (window.ACMSWin) {
      ACMSWin.open('game-' + gameId, cfg);
    }
  }

  // ── 注册视图 ──
  function init() {
    if (typeof ACMSWin !== 'undefined' && ACMSWin.registerViewLoader) {
      ACMSWin.registerViewLoader('game-center', renderGameCenter);
    }
    if (window.ACMS && window.ACMS.registerPackage) {
      ACMS.registerPackage('game-center', {
        title: '游戏中心', icon: '🎮', category: '娱乐',
        defaultSize: { w: 400, h: 380 },
        loader: renderGameCenter
      });
    }
  }

  // 延迟注册，确保 ACMSWin 已加载
  if (typeof ACMSWin !== 'undefined') {
    init();
  } else {
    var checkWin = setInterval(function() {
      if (typeof ACMSWin !== 'undefined') {
        clearInterval(checkWin);
        init();
      }
    }, 100);
    setTimeout(function() { clearInterval(checkWin); }, 5000);
  }
})();
