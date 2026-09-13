import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { EnemyManager } from './enemy.js';
import { BulletManager } from './bullets.js';
import { PickupManager } from './pickups.js';
import { Effects } from './effects.js';
import { GameAudio } from './audio.js';
import { HUD } from './hud.js';

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.app = document.getElementById('app');

    this.state = 'menu';
    this.time = 0;
    this.score = 0;
    this.kills = 0;
    this.wave = 0;
    this.shake = 0;
    this.fps = 60;

    this.input = { forward: false, back: false, left: false, right: false, fire: false, orbitL: false, orbitR: false };
    this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 3 };
    this.mouseNDC = new THREE.Vector2(0, 0);

    this.camYaw = 0;
    this.camYawOffset = 0;
    this.menuAngle = 0;
    this._camTarget = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();

    this._initRenderer();
    this._initScene();

    this.world = new World(this.scene);
    this.effects = new Effects(this.scene, { onShake: (v) => this.addShake(v) });
    this.audio = new GameAudio();
    this.bullets = new BulletManager(this);
    this.player = new Player(this);
    this.enemyManager = new EnemyManager(this);
    this.enemies = this.enemyManager.list;
    this.pickups = new PickupManager(this);
    this.hud = new HUD(this);

    this._bindUI();
    this._bindInput();

    this.clock = new THREE.Clock();
    this._refreshHUD();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 900);
    this.camera.position.set(0, 30, 70);

    const hemi = new THREE.HemisphereLight(0xc9e2ff, 0x59683f, 0.95);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d6, 1.75);
    sun.position.set(58, 92, 34);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 300;
    sun.shadow.camera.left = -95;
    sun.shadow.camera.right = 95;
    sun.shadow.camera.top = 95;
    sun.shadow.camera.bottom = -95;
    sun.shadow.bias = -0.0009;
    sun.shadow.normalBias = 0.7;
    this.scene.add(sun);

    const rim = new THREE.DirectionalLight(0x9ec8ff, 0.35);
    rim.position.set(-60, 40, -70);
    this.scene.add(rim);

    this.sun = sun;
  }

  _bindUI() {
    this.overlays = {
      start: document.getElementById('overlay-start'),
      pause: document.getElementById('overlay-pause'),
      over: document.getElementById('overlay-over'),
    };

    const click = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    };

    click('btn-start', () => this.startGame());
    click('btn-resume', () => this.resume());
    click('btn-retry', () => this.startGame());
    click('btn-quit', () => this.toMenu());
    click('btn-menu', () => this.toMenu());
  }

  _showOverlay(name) {
    for (const k in this.overlays) {
      if (!this.overlays[k]) continue;
      this.overlays[k].classList.toggle('hidden', k !== name);
    }
    this.app.classList.toggle('ui-mode', !!name);
  }

  _bindInput() {
    const map = {
      KeyW: 'forward', ArrowUp: 'forward',
      KeyS: 'back', ArrowDown: 'back',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
      KeyQ: 'orbitL', KeyE: 'orbitR',
    };

    window.addEventListener('keydown', (e) => {
      if (map[e.code]) {
        this.input[map[e.code]] = true;
        e.preventDefault();
      }
      if (e.code === 'Space') {
        this.input.fire = true;
        e.preventDefault();
      }
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      }
      if (e.code === 'KeyR' && (this.state === 'over' || this.state === 'paused')) this.startGame();
    });

    window.addEventListener('keyup', (e) => {
      if (map[e.code]) this.input[map[e.code]] = false;
      if (e.code === 'Space') this.input.fire = false;
    });

    window.addEventListener('blur', () => {
      for (const k in this.input) this.input[k] = false;
      if (this.state === 'playing') this.pause();
    });

    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this._updateMouseNDC();
    });

    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.state === 'playing') this.input.fire = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.input.fire = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this._updateMouseNDC();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
  }

  _updateMouseNDC() {
    this.mouseNDC.set(
      (this.mouse.x / window.innerWidth) * 2 - 1,
      -(this.mouse.y / window.innerHeight) * 2 + 1
    );
  }

  /* -------------------- flow -------------------- */

  startGame() {
    this.audio.init();
    this.audio.startEngine();

    this.player.reset();
    this.enemyManager.clear();
    this.pickups.clear();
    this.bullets.clear();

    this.score = 0;
    this.kills = 0;
    this.wave = 0;
    this.shake = 0;
    this.camYaw = this.player.yaw;
    this.camYawOffset = 0;
    this.state = 'playing';

    this._showOverlay(null);
    this.hud.show();
    this._refreshHUD();
    this.hud.setEnemiesLeft(0);
    this.enemyManager.startWave(1);
    this.hud.pushFeed('战斗开始，<b>守住阵地</b>');
  }

  toMenu() {
    this.state = 'menu';
    this.audio.stopEngine();
    this.enemyManager.clear();
    this.pickups.clear();
    this.bullets.clear();
    this.player.reset();
    this.player.alive = false;
    this.hud.hide();
    this._showOverlay('start');
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.fire = false;
    this.audio.setEngine(0);
    this._fillStats(document.getElementById('pause-stats'));
    this._showOverlay('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.audio.init();
    this.audio.startEngine();
    this.state = 'playing';
    this._showOverlay(null);
  }

  gameOver() {
    this.state = 'over';
    this.audio.stopEngine();
    this.hud.hide();
    this._showOverlay('over');

    document.getElementById('over-score').textContent = this.score.toLocaleString('en-US');
    this._fillStats(document.getElementById('over-stats'));

    const isRecord = this.score > this.hud.highScore;
    document.getElementById('over-record').classList.toggle('hidden', !isRecord);
    if (isRecord) {
      this.hud.highScore = this.score;
      localStorage.setItem('tankfront.hiscore', String(this.score));
      this.hud.hiScoreEl.textContent = this.score.toLocaleString('en-US');
    }
  }

  _fillStats(target) {
    if (!target) return;
    target.innerHTML = `
      <div class="st"><span>抵达波次</span><b>${this.wave}</b></div>
      <div class="st"><span>击毁敌军</span><b>${this.kills}</b></div>
      <div class="st"><span>总得分</span><b>${this.score.toLocaleString('en-US')}</b></div>
      <div class="st"><span>最高纪录</span><b>${Math.max(this.hud.highScore, this.score).toLocaleString('en-US')}</b></div>
    `;
  }

  /* -------------------- hooks -------------------- */

  addShake(v) {
    this.shake = Math.min(1.6, this.shake + v);
  }

  distToPlayer(pos) {
    return Math.hypot(pos.x - this.player.pos.x, pos.z - this.player.pos.z);
  }

  notify(text, kind) {
    const color = kind === 'repair' ? '#7ef2a0' : kind === 'rapid' ? '#ffb43d' : kind === 'shield' ? '#8ee6ff' : '#ffffff';
    this.hud.pushFeed(`<b style="color:${color}">${text}</b>`);
  }

  onEnemyKilled(e) {
    const mult = 1 + (this.wave - 1) * 0.12;
    const pts = Math.round(e.type.score * mult);
    this.score += pts;
    this.kills++;
    this.hud.setScore(this.score);
    this.hud.setKills(this.kills);
    const tag = e.typeKey === 'heavy' ? '重型' : e.typeKey === 'medium' ? '中型' : '侦察';
    this.hud.pushFeed(`击毁${tag}车 <b>+${pts}</b>`);
    this.pickups.maybeDrop(e.pos);
  }

  onWaveCleared(n) {
    const bonus = 200 * n;
    this.score += bonus;
    this.hud.setScore(this.score);
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 18);
    this._refreshHUD();
    this.hud.showBanner(`第 ${n} 波清除  ·  +${bonus}`, '#7ef2a0');
    this.hud.pushFeed(`波次奖励 <b>+${bonus}</b> · 装甲修复 <b>+18</b>`);
    this.audio.pickup();
  }

  onPlayerDestroyed() {
    this.audio.gameOver();
    setTimeout(() => {
      if (this.state === 'playing') this.gameOver();
    }, 1500);
  }

  _refreshHUD() {
    this.hud.setHP(this.player.hp, this.player.maxHp);
    this.hud.setScore(this.score);
    this.hud.setKills(this.kills);
  }

  /* -------------------- loop -------------------- */

  updateCamera(dt) {
    const shakeAmp = this.shake * 0.9;
    this.shake = Math.max(0, this.shake - dt * (1.8 + this.shake * 2.2));

    if (this.state === 'menu') {
      this.menuAngle += dt * 0.075;
      this._camPos.set(Math.cos(this.menuAngle) * 72, 27, Math.sin(this.menuAngle) * 72);
      this.camera.position.copy(this._camPos);
      this.camera.lookAt(0, 4, 0);
      return;
    }

    if (this.state === 'playing') {
      this.camYawOffset += ((this.input.orbitR ? 1 : 0) - (this.input.orbitL ? 1 : 0)) * 1.9 * dt;
      if (!this.input.orbitL && !this.input.orbitR) {
        this.camYawOffset *= Math.max(0, 1 - dt * 2.4);
      }
      this.camYawOffset = THREE.MathUtils.clamp(this.camYawOffset, -1.35, 1.35);
    }

    const targetYaw = this.player.yaw + this.camYawOffset;
    this.camYaw = lerpAngle(this.camYaw, targetYaw, 1 - Math.exp(-dt * 5));

    const speedLift = Math.min(3.4, Math.abs(this.player.speed) * 0.16 + this.player.speed * 0.06);
    const dist = 20.5 + speedLift * 0.5;
    const height = 11.5 + speedLift * 0.4;

    const fx = Math.sin(this.camYaw);
    const fz = Math.cos(this.camYaw);

    this._camTarget.set(
      this.player.pos.x - fx * dist,
      height,
      this.player.pos.z - fz * dist
    );

    const k = 1 - Math.exp(-dt * 7.5);
    this.camera.position.lerp(this._camTarget, k);

    this._lookAt.set(
      this.player.pos.x + fx * 9,
      2.2,
      this.player.pos.z + fz * 9
    );
    this.camera.lookAt(this._lookAt);

    if (shakeAmp > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * shakeAmp;
      this.camera.position.y += (Math.random() - 0.5) * shakeAmp;
      this.camera.position.z += (Math.random() - 0.5) * shakeAmp;
      this.camera.rotateZ((Math.random() - 0.5) * shakeAmp * 0.02);
    }
  }

  updateHUD(dt) {
    const p = this.player;
    this.hud.setHP(p.hp, p.maxHp);
    this.hud.setEnemiesLeft(this.enemyManager.remaining);
    this.hud.setChips(p.rapid, p.shield);

    const ratio = p.alive ? Math.max(0, 1 - p.cooldown / 0.46) : 0;
    this.hud.updateCrosshair(this.mouse.x, this.mouse.y, p.clamped, ratio);
    this.hud.drawRadar();
    this.hud.update(dt);
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;

    if (this.state === 'playing') {
      this.player.update(dt, this.input, this.camera, this.mouseNDC);
      this.enemyManager.update(dt);
      this.pickups.update(dt);
    } else if (this.state === 'menu' || this.state === 'over') {
      this.enemyManager.update(dt);
    }

    if (this.state !== 'paused') {
      this.bullets.update(dt);
      this.effects.update(dt);
    }

    this.updateCamera(dt);

    if (this.state === 'playing') this.updateHUD(dt);
    else this.hud.update(dt);

    if (this.player.alive) {
      this.sun.position.set(this.player.pos.x + 58, 92, this.player.pos.z + 34);
      this.sun.target.position.set(this.player.pos.x, 0, this.player.pos.z);
      this.sun.target.updateMatrixWorld();
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('error', (e) => {
  console.error('[tank-front] runtime error', e.error || e.message);
});

const game = new Game();
window.__tankFront = game;

// keep the reticle fresh before the first mousemove
game._updateMouseNDC();
game._showOverlay('start');
