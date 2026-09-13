import { ARENA_HALF } from './world.js';

const RADAR_SIZE = 220;
const RADAR_RANGE = 78;

export class HUD {
  constructor(game) {
    this.game = game;

    this.root = document.getElementById('hud');
    this.hpFill = document.getElementById('hp-fill');
    this.hpText = document.getElementById('hp-text');
    this.waveNum = document.getElementById('wave-num');
    this.enemyLeft = document.getElementById('enemy-left');
    this.scoreEl = document.getElementById('score');
    this.hiScoreEl = document.getElementById('hiscore');
    this.killsEl = document.getElementById('kills');
    this.chipShield = document.getElementById('chip-shield');
    this.chipRapid = document.getElementById('chip-rapid');
    this.feedEl = document.getElementById('feed');
    this.bannerEl = document.getElementById('banner');
    this.crosshair = document.getElementById('crosshair');
    this.reloadRing = document.getElementById('reload-ring');
    this.vignette = document.getElementById('vignette');
    this.hitDir = document.getElementById('hit-dir');
    this.hitDirTimer = 0;

    this.radar = document.getElementById('radar');
    this.rctx = this.radar.getContext('2d');

    this.vignetteLevel = 0;
    this.reticleTimer = 0;
    this.bannerTimer = null;
    this.feedItems = [];

    this.highScore = Number(localStorage.getItem('tankfront.hiscore') || 0);
    this.hiScoreEl.textContent = this.highScore;
  }

  show() {
    this.root.classList.remove('hidden');
    this.crosshair.classList.remove('hidden');
  }
  hide() {
    this.root.classList.add('hidden');
    this.crosshair.classList.add('hidden');
  }

  setHP(cur, max) {
    const ratio = Math.max(0, cur / max);
    this.hpFill.style.width = (ratio * 100).toFixed(1) + '%';
    this.hpFill.className = 'bar-fill' + (ratio < 0.28 ? ' low' : ratio < 0.58 ? ' mid' : '');
    this.hpText.textContent = `${Math.ceil(cur)} / ${Math.round(max)}`;
  }

  setWave(n, left) {
    this.waveNum.textContent = n;
    this.enemyLeft.textContent = left;
  }

  setEnemiesLeft(n) { this.enemyLeft.textContent = Math.max(0, n); }

  setScore(v) {
    this.scoreEl.textContent = v.toLocaleString('en-US');
  }

  setKills(v) { this.killsEl.textContent = v; }

  setChips(rapid, shield) {
    if (rapid > 0) {
      this.chipRapid.classList.remove('hidden');
      this.chipRapid.querySelector('b').textContent = Math.ceil(rapid);
    } else this.chipRapid.classList.add('hidden');

    if (shield > 0) {
      this.chipShield.classList.remove('hidden');
      this.chipShield.querySelector('b').textContent = Math.ceil(shield);
    } else this.chipShield.classList.add('hidden');
  }

  showBanner(text, color = '#ffb43d') {
    const el = this.bannerEl;
    el.textContent = text;
    el.style.color = color === '#ffb43d' ? '#fff' : color;
    el.style.textShadow = `0 0 40px ${color}bb, 0 6px 24px rgba(0,0,0,0.6)`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  pushFeed(text) {
    const li = document.createElement('li');
    li.innerHTML = text;
    this.feedEl.appendChild(li);
    this.feedItems.push({ el: li, life: 3.4 });
    while (this.feedItems.length > 6) {
      const old = this.feedItems.shift();
      old.el.remove();
    }
  }

  hitVignette(strength) {
    this.vignetteLevel = Math.min(1, this.vignetteLevel + strength);
  }

  /** 受击方位指示：angle 是相对于相机朝向的弧度（0 = 正前方，顺时针为正）。 */
  damageDir(angle) {
    this.hitDir.style.transform = `rotate(${angle}rad)`;
    this.hitDir.classList.add('on');
    this.hitDirTimer = 1.15;
  }

  pulseReticle() {
    this.reticleTimer = 0.22;
  }

  updateCrosshair(x, y, locked, cooldownRatio) {
    this.crosshair.style.transform = `translate(${x}px, ${y}px)`;
    this.crosshair.classList.toggle('locked', !!locked);
    if (cooldownRatio > 0) {
      this.reloadRing.classList.add('active');
      this.reloadRing.style.clipPath = `inset(${(1 - cooldownRatio) * 100}% 0 0 0)`;
    } else {
      this.reloadRing.classList.remove('active');
    }
  }

  drawRadar() {
    const ctx = this.rctx;
    const S = RADAR_SIZE;
    const c = S / 2;
    const scale = (c - 14) / RADAR_RANGE;
    const player = this.game.player;

    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c - 3, 0, Math.PI * 2);
    ctx.clip();

    const grd = ctx.createRadialGradient(c, c, 0, c, c, c);
    grd.addColorStop(0, 'rgba(14,34,22,0.94)');
    grd.addColorStop(1, 'rgba(6,14,9,0.96)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, S, S);

    ctx.strokeStyle = 'rgba(126,242,160,0.16)';
    ctx.lineWidth = 1;
    for (let r = 25; r <= 75; r += 25) {
      ctx.beginPath();
      ctx.arc(c, c, r * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(c, 4); ctx.lineTo(c, S - 4);
    ctx.moveTo(4, c); ctx.lineTo(S - 4, c);
    ctx.stroke();

    // arena boundary
    ctx.strokeStyle = 'rgba(255,180,61,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c, c, ARENA_HALF * scale, 0, Math.PI * 2);
    ctx.stroke();

    const yaw = player.yaw;
    const toLocal = (wx, wz) => {
      const dx = wx - player.pos.x;
      const dz = wz - player.pos.z;
      const fx = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const rx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      return [c + rx * scale, c - fx * scale, fx, rx];
    };

    // obstacles
    ctx.fillStyle = 'rgba(180,200,190,0.3)';
    for (const b of this.game.world.blockers) {
      if (b.dead || b.kind === 'wall') continue;
      const [x, y, fx] = toLocal(b.mesh.position.x, b.mesh.position.z);
      if (Math.abs(fx) > RADAR_RANGE) continue;
      const w = Math.max(2, (b.box.max.x - b.box.min.x) * scale);
      const d = Math.max(2, (b.box.max.z - b.box.min.z) * scale);
      ctx.fillRect(x - w / 2, y - d / 2, w, d);
    }

    // pickups
    for (const p of this.game.pickups.list) {
      const [x, y] = toLocal(p.root.position.x, p.root.position.z);
      ctx.fillStyle = p.type === 'repair' ? '#54e07a' : p.type === 'rapid' ? '#ffb43d' : '#66e0ff';
      ctx.beginPath();
      ctx.arc(x, y, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // enemies
    for (const e of this.game.enemies) {
      if (!e.alive) continue;
      const [x, y] = toLocal(e.pos.x, e.pos.z);
      const ang = e.yaw - yaw;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = e.typeKey === 'heavy' ? '#ff4d4d' : e.typeKey === 'medium' ? '#ff8a5a' : '#ffc46b';
      ctx.beginPath();
      ctx.moveTo(0, -6.5);
      ctx.lineTo(4.6, 5);
      ctx.lineTo(-4.6, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // player chevron
    ctx.fillStyle = '#8ef7a8';
    ctx.beginPath();
    ctx.moveTo(c, c - 8);
    ctx.lineTo(6, c + 7);
    ctx.lineTo(0, c + 3);
    ctx.lineTo(-6, c + 7);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  update(dt) {
    if (this.vignetteLevel > 0) {
      this.vignetteLevel = Math.max(0, this.vignetteLevel - dt * 2.2);
      this.vignette.style.opacity = (this.vignetteLevel * 0.85).toFixed(2);
    } else if (this.vignette.style.opacity !== '0') {
      this.vignette.style.opacity = '0';
    }

    if (this.hitDirTimer > 0) {
      this.hitDirTimer -= dt;
      if (this.hitDirTimer <= 0) this.hitDir.classList.remove('on');
    }

    if (this.reticleTimer > 0) this.reticleTimer = Math.max(0, this.reticleTimer - dt);

    for (let i = this.feedItems.length - 1; i >= 0; i--) {
      const f = this.feedItems[i];
      f.life -= dt;
      if (f.life <= 0) {
        f.el.style.transition = 'opacity 0.25s';
        f.el.style.opacity = '0';
        setTimeout(() => f.el.remove(), 260);
        this.feedItems.splice(i, 1);
      }
    }
  }
}
