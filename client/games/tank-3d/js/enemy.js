import * as THREE from 'three';
import { createTank } from './tank.js';
import { ARENA_HALF } from './world.js';

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export const ENEMY_TYPES = {
  scout: {
    label: '侦察车', hp: 48, speed: 15.5, turn: 2.5, damage: 7, fireRate: 1.5,
    range: 38, spread: 0.15, scale: 0.84, radius: 1.75, height: 2.5, turretSpeed: 3.0,
    body: '#c8623c', accent: '#8f3f26', turretColor: '#d8763f', score: 120,
    bulletColor: 0xff8a4d, desired: 15,
  },
  medium: {
    label: '中型坦克', hp: 88, speed: 11, turn: 1.75, damage: 12, fireRate: 1.9,
    range: 44, spread: 0.11, scale: 1.0, radius: 2.0, height: 2.9, turretSpeed: 2.4,
    body: '#a2483a', accent: '#6f2f26', turretColor: '#b8553f', score: 210,
    bulletColor: 0xff6a5a, desired: 21,
  },
  heavy: {
    label: '重型坦克', hp: 155, speed: 7.2, turn: 1.05, damage: 18, fireRate: 2.7,
    range: 48, spread: 0.085, scale: 1.3, radius: 2.5, height: 3.6, turretSpeed: 1.6,
    body: '#5f4050', accent: '#3f2836', turretColor: '#74495c', score: 400,
    bulletColor: 0xff4d4d, desired: 26,
  },
};

function makeBar() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 10;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx, tex };
}

function drawBar(bar, ratio) {
  const { ctx, tex } = bar;
  ctx.clearRect(0, 0, 64, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, 64, 10);
  const w = Math.max(0, Math.round(60 * ratio));
  ctx.fillStyle = ratio > 0.5 ? '#6ef08a' : ratio > 0.25 ? '#ffcc4d' : '#ff5a5a';
  ctx.fillRect(2, 2, w, 6);
  tex.needsUpdate = true;
}

export class Enemy {
  constructor(game, typeKey, stats = {}) {
    this.game = game;
    this.typeKey = typeKey;
    const base = ENEMY_TYPES[typeKey];
    this.type = base;

    this.hpMul = stats.hpMul ?? 1;
    this.dmgMul = stats.dmgMul ?? 1;
    this.spreadMul = stats.spreadMul ?? 1;
    this.speedMul = stats.speedMul ?? 1;

    this.maxHp = Math.round(base.hp * this.hpMul);
    this.hp = this.maxHp;
    this.radius = base.radius;
    this.height = base.height;

    this.root = createTank({
      body: base.body,
      accent: base.accent,
      turret: base.turretColor,
      scale: base.scale,
      kind: typeKey === 'heavy' ? 'heavy' : typeKey === 'scout' ? 'scout' : 'medium',
    });
    this.root.rotation.order = 'YXZ';
    game.scene.add(this.root);

    this.pos = this.root.position;
    this.turret = this.root.userData.turret;
    this.muzzle = this.root.userData.muzzle;
    this.wheels = this.root.userData.wheels;

    this.yaw = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.turretYaw = 0;
    this.cooldown = 0.6 + Math.random() * 1.2;
    this.alive = true;
    this.spawning = true;
    this.spawnTimer = 0.62;
    this.orbitDir = Math.random() < 0.5 ? -1 : 1;
    this.los = false;
    this.losTimer = Math.random() * 0.15;
    this.stuck = 0;
    this.hitFlash = 0;
    this.wander = Math.random() * Math.PI * 2;

    const bar = makeBar();
    this.bar = bar;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: bar.tex, depthTest: false, transparent: true }));
    this.sprite.scale.set(3.6, 0.56, 1);
    this.sprite.renderOrder = 20;
    this.root.add(this.sprite);
    drawBar(bar, 1);

    this.root.scale.multiplyScalar(0.02);
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();
  }

  get label() { return this.type.label; }

  place(x, z) {
    this.pos.set(x, 0, z);
    this.yaw = Math.atan2(-x, -z);
    this.root.rotation.y = this.yaw;
  }

  _probe(off, dist, radiusScale = 1) {
    const a = this.yaw + off;
    const p = {
      x: this.pos.x + Math.sin(a) * dist,
      y: 1.2,
      z: this.pos.z + Math.cos(a) * dist,
    };
    if (Math.abs(p.x) > ARENA_HALF - this.radius * radiusScale || Math.abs(p.z) > ARENA_HALF - this.radius * radiusScale) return true;
    return this.game.world.hitBlocker(p, this.radius * radiusScale) !== null;
  }

  update(dt) {
    const player = this.game.player;

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);

    if (this.spawning) {
      this.spawnTimer -= dt;
      const t = 1 - Math.max(0, this.spawnTimer) / 0.62;
      const s = this.type.scale * (0.15 + 0.85 * (1 - (1 - t) ** 2));
      this.root.scale.setScalar(s);
      this.updateSprite();
      if (this.spawnTimer <= 0) {
        this.spawning = false;
        this.root.scale.setScalar(this.type.scale);
        this.game.effects.ringFlash(this._v.set(this.pos.x, 0.6, this.pos.z), this.type.bulletColor, 1);
      }
      return;
    }

    const px = this.pos.x - player.pos.x;
    const pz = this.pos.z - player.pos.z;
    const dist = Math.hypot(px, pz);
    const desired = this.type.desired;
    const engaged = player.alive && dist < this.type.range * 1.7;

    let throttle = 0;
    let turnRate = 0;

    if (engaged) {
      const ang = Math.atan2(-px, -pz);
      let err = wrapAngle(ang - this.yaw);

      // obstacle avoidance overrides steering
      const blockedAhead = this._probe(0, 6, 1.1) || this._probe(0, 3, 1.05);
      if (blockedAhead) {
        const leftClear = !this._probe(0.85, 7, 1.05);
        const rightClear = !this._probe(-0.85, 7, 1.05);
        if (leftClear && !rightClear) err = 0.85;
        else if (rightClear && !leftClear) err = -0.85;
        else err = this.orbitDir * 1.1;
        throttle = this.speed > 1 ? 0.35 : -0.4;
      } else if (dist > desired * 1.2) {
        throttle = 1;
      } else if (dist < desired * 0.72) {
        throttle = -0.7;
      } else {
        throttle = 0.55;
        err = this.orbitDir * 0.75;
        if (Math.random() < 0.004) this.orbitDir *= -1;
      }

      const maxTurn = this.type.turn * dt;
      turnRate = THREE.MathUtils.clamp(err, -maxTurn, maxTurn);
      this.yaw = wrapAngle(this.yaw + turnRate);

      let desiredSpeed = 0;
      if (throttle > 0) desiredSpeed = this.type.speed * this.speedMul * throttle;
      else if (throttle < 0) desiredSpeed = -this.type.speed * 0.5 * Math.abs(throttle);

      const accel = 22 * dt;
      if (this.speed < desiredSpeed) this.speed = Math.min(desiredSpeed, this.speed + accel);
      else this.speed = Math.max(desiredSpeed, this.speed - accel);
    } else {
      // wander when player is far away
      this.wander += (Math.random() - 0.5) * dt * 2.4;
      const maxTurn = this.type.turn * 0.7 * dt;
      const err = wrapAngle(this.wander - this.yaw);
      this.yaw = wrapAngle(this.yaw + THREE.MathUtils.clamp(err, -maxTurn, maxTurn));
      const desiredSpeed = this.type.speed * 0.5 * this.speedMul;
      this.speed += (desiredSpeed - this.speed) * Math.min(1, dt * 1.6);
      if (this._probe(0, 5, 1.1)) this.wander += Math.PI * (0.5 + Math.random());
    }

    const beforeX = this.pos.x;
    const beforeZ = this.pos.z;
    this.pos.x += Math.sin(this.yaw) * this.speed * dt;
    this.pos.z += Math.cos(this.yaw) * this.speed * dt;
    this.game.world.resolveCircle(this.pos, this.radius);

    if (Math.abs(this.pos.x - beforeX) + Math.abs(this.pos.z - beforeZ) < Math.abs(this.speed) * dt * 0.35 && Math.abs(this.speed) > 2) {
      this.stuck += dt;
      if (this.stuck > 0.35) {
        this.yaw = wrapAngle(this.yaw + (Math.random() < 0.5 ? 1 : -1) * 0.9);
        this.orbitDir *= -1;
        this.stuck = 0;
      }
    } else this.stuck = 0;

    this.root.position.y = 0;
    this.root.rotation.y = this.yaw;
    const wheelSpin = this.speed * dt * 1.4;
    for (const w of this.wheels) w.rotation.y += wheelSpin;

    // -------- turret & firing --------
    const tof = dist / 70;
    const lead = 0.55;
    const leadX = player.pos.x + Math.sin(player.yaw) * player.speed * tof * lead;
    const leadZ = player.pos.z + Math.cos(player.yaw) * player.speed * tof * lead;
    const aimAng = Math.atan2(leadX - this.pos.x, leadZ - this.pos.z);
    if (player.alive) {
      const err = wrapAngle(aimAng - this.yaw);
      const step = this.type.turretSpeed * dt;
      this.turretYaw += Math.abs(err) <= step ? err : Math.sign(err) * step;
    }
    this.turret.rotation.y = this.turretYaw;

    this.cooldown -= dt;
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.12 + Math.random() * 0.1;
      const mp = this.muzzle.getWorldPosition(this._v).clone();
      this.los = this.game.world.lineOfSight(mp, { x: player.pos.x, y: 1.5, z: player.pos.z });
    }

    if (player.alive && this.los && this.cooldown <= 0 && dist < this.type.range * 1.45) {
      const muzzleErr = Math.abs(wrapAngle(wrapAngle(aimAng - this.yaw) - this.turretYaw));
      if (muzzleErr < 0.13) this.fire(leadX, leadZ);
    }

    this.updateSprite();
  }

  updateSprite() {
    this.sprite.position.y = this.height + 1.05;
    const visible = this.hp < this.maxHp && !this.spawning;
    this.sprite.visible = visible;
  }

  updateBar() {
    drawBar(this.bar, Math.max(0, this.hp / this.maxHp));
  }

  fire(tx, tz) {
    this.root.updateMatrixWorld(true);
    const pos = this.muzzle.getWorldPosition(new THREE.Vector3());

    const spread = this.type.spread * this.spreadMul * (0.6 + Math.random() * 0.8);
    const dir = new THREE.Vector3(tx - pos.x, 0, tz - pos.z).normalize();
    dir.x += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;

    const jitterY = (Math.random() - 0.5) * spread * 0.5;
    dir.y = jitterY;
    dir.normalize();

    this.game.bullets.fire({
      pos, dir,
      speed: 72,
      damage: this.type.damage * this.dmgMul,
      owner: 'enemy',
      color: this.type.bulletColor,
      radius: 0.36,
      life: 3.4,
    });

    this.cooldown = this.type.fireRate * (0.85 + Math.random() * 0.4);
    this.game.effects.muzzleFlash(pos, dir, 0.85);
    if (this.game.distToPlayer(this.pos) < 55) this.game.audio.enemyShoot();
  }

  takeDamage(dmg, dir) {
    if (!this.alive || this.spawning) return;
    this.hp -= dmg;
    this.updateBar();
    const hitPoint = this._v.set(
      this.pos.x + (dir ? dir.x : 0) * -this.radius * 0.6,
      1.5,
      this.pos.z + (dir ? dir.z : 0) * -this.radius * 0.6
    );
    this.game.effects.impact(hitPoint.clone(), dir ? this._d.copy(dir).negate() : this._d.set(0, 1, 0), 0xffcf7a);
    this.game.audio.hit();
    if (this.hp <= 0) this.die();
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    const scale = this.typeKey === 'heavy' ? 1.9 : this.typeKey === 'scout' ? 1.0 : 1.4;
    this.game.effects.explosion(this._v.set(this.pos.x, 1.5, this.pos.z).clone(), scale);
    this.game.audio.explosion(this.typeKey === 'heavy');
    this.game.onEnemyKilled(this);
    this.dispose();
  }

  dispose() {
    if (this.sprite) {
      this.root.remove(this.sprite);
      this.sprite.material.dispose();
      this.bar.tex.dispose();
      this.sprite = null;
    }
    this.game.scene.remove(this.root);
  }
}

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.queue = [];
    this.wave = 0;
    this.intermission = 0;
    this.spawnTimer = 0;
    this.maxAlive = 6;
    this.waveActive = false;
  }

  get remaining() {
    return this.queue.length + this.list.filter((e) => e.alive).length;
  }

  buildWave(n) {
    const heavyChance = n >= 5 ? Math.min(0.32, (n - 4) * 0.055) : 0;
    const medChance = n >= 3 ? Math.min(0.62, 0.24 + (n - 3) * 0.07) : n >= 2 ? 0.18 : 0;
    const count = Math.min(18, 3 + Math.round(n * 1.35));

    const roster = [];
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      if (r < heavyChance) roster.push('heavy');
      else if (r < heavyChance + medChance) roster.push('medium');
      else roster.push('scout');
    }
    // guarantee at least one medium from wave 3, one heavy from wave 6
    if (n >= 3 && !roster.includes('medium') && !roster.includes('heavy')) roster[0] = 'medium';
    if (n >= 6 && !roster.includes('heavy')) roster[roster.length - 1] = 'heavy';
    return roster;
  }

  startWave(n) {
    this.wave = n;
    this.game.wave = n;
    this.queue = this.buildWave(n);
    this.total = this.queue.length;
    this.spawnTimer = 0.35;
    this.intermission = 0;
    this.waveActive = true;
    this.maxAlive = n >= 7 ? 7 : 6;

    this.stats = {
      hpMul: 1 + 0.06 * (n - 1),
      dmgMul: 1 + 0.032 * (n - 1),
      spreadMul: Math.max(0.34, 1 - 0.055 * (n - 1)),
      speedMul: 1 + 0.012 * (n - 1),
    };

    this.game.audio.waveStart();

    const first = this.total;
    this.game.hud.showBanner(`第 ${n} 波 · 敌军 ${first}`, n % 5 === 0 ? '#ff5a5a' : '#ffb43d');
    this.game.hud.setWave(n, first);
  }

  _spawnPoint() {
    const player = this.game.player;
    for (let i = 0; i < 40; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = ARENA_HALF - 5 - Math.random() * 10;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      if (Math.hypot(x - player.pos.x, z - player.pos.z) < 34) continue;
      return { x, z };
    }
    const ang = Math.random() * Math.PI * 2;
    return { x: Math.cos(ang) * (ARENA_HALF - 8), z: Math.sin(ang) * (ARENA_HALF - 8) };
  }

  spawnOne() {
    const typeKey = this.queue.shift();
    const e = new Enemy(this.game, typeKey, this.stats);
    const p = this._spawnPoint();
    e.place(p.x, p.z);
    this.list.push(e);
    this.game.effects.ringFlash(new THREE.Vector3(p.x, 1.2, p.z), 0xff7a4d, 1.4);
  }

  update(dt) {
    const world = this.game.world;

    if (this.game.state === 'playing') {
      if (this.waveActive) {
        this.spawnTimer -= dt;
        const aliveCount = this.list.filter((e) => e.alive).length;
        if (this.queue.length > 0 && aliveCount < this.maxAlive && this.spawnTimer <= 0) {
          this.spawnOne();
          this.spawnTimer = Math.max(0.5, 1.35 - this.wave * 0.05);
        }
        if (this.queue.length === 0 && aliveCount === 0) {
          this.waveActive = false;
          this.intermission = 4.5;
          this.game.onWaveCleared(this.wave);
        }
      } else if (this.intermission > 0) {
        this.intermission -= dt;
        if (this.intermission <= 0) this.startWave(this.wave + 1);
      }
    }

    // integrate + separation
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (!e.alive) { this.list.splice(i, 1); continue; }
      if (this.game.state === 'playing') e.update(dt);
    }

    for (let i = 0; i < this.list.length; i++) {
      const a = this.list[i];
      if (!a.alive || a.spawning) continue;
      for (let j = i + 1; j < this.list.length; j++) {
        const b = this.list[j];
        if (!b.alive || b.spawning) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const minD = a.radius + b.radius + 0.4;
        const d2 = dx * dx + dz * dz;
        if (d2 > 1e-5 && d2 < minD * minD) {
          const d = Math.sqrt(d2);
          const push = (minD - d) * 0.5;
          a.pos.x -= (dx / d) * push;
          a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push;
          b.pos.z += (dz / d) * push;
          world.resolveCircle(a.pos, a.radius);
          world.resolveCircle(b.pos, b.radius);
        }
      }
      // don't drive through the player
      const p = this.game.player;
      if (p.alive) {
        const dx = p.pos.x - a.pos.x;
        const dz = p.pos.z - a.pos.z;
        const minD = a.radius + p.radius + 0.2;
        const d2 = dx * dx + dz * dz;
        if (d2 > 1e-5 && d2 < minD * minD) {
          const d = Math.sqrt(d2);
          const push = (minD - d) * 0.5;
          a.pos.x -= (dx / d) * push;
          a.pos.z -= (dz / d) * push;
          world.resolveCircle(a.pos, a.radius);
        }
      }
    }
  }

  clear() {
    for (const e of this.list) e.dispose();
    this.list.length = 0;
    this.queue.length = 0;
    this.waveActive = false;
    this.intermission = 0;
  }
}
