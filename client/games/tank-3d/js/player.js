import * as THREE from 'three';
import { createTank } from './tank.js';

const TURN_SPEED = 2.5;
const MAX_FORWARD = 17;
const MAX_BACK = 9.5;
const ACCEL = 30;
const TURRET_SPEED = 5.0;
const TURRET_LIMIT = THREE.MathUtils.degToRad(140);
const BASE_COOLDOWN = 0.46;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Player {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    if (this.root) this.game.scene.remove(this.root);
    this.shieldMesh = null;

    this.root = createTank({ body: '#5f8f4e', accent: '#3f6b34', turret: '#6ba055', scale: 1 });
    this.root.rotation.order = 'YXZ';
    this.game.scene.add(this.root);

    this.pos = this.root.position;
    this.pos.set(0, 0, 6);

    this.yaw = 0;
    this.speed = 0;
    this.turretYaw = 0;
    this.turretTarget = 0;
    this.recoil = 0;

    this.hp = 100;
    this.maxHp = 100;
    this.radius = 2.0;
    this.height = 2.9;
    this.alive = true;
    this.invuln = 1.4;

    this.cooldown = 0;
    this.pickupFlash = 0;
    this.rapid = 0;
    this.shield = 0;

    this.dustTimer = 0;
    this.markTimer = 0;
    this.hitFlash = 0;
    this.pitch = 0;
    this.roll = 0;
    this.aimPoint = new THREE.Vector3(0, 1.2, 30);
    this.clamped = false;

    this.muzzle = this.root.userData.muzzle;
    this.turret = this.root.userData.turret;
    this.wheels = this.root.userData.wheels;
    this.turretBaseZ = this.turret.position.z;

    this._v = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  update(dt, input, camera, aimNDC) {
    if (!this.alive) return;

    // ---------- aiming ----------
    if (aimNDC) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(aimNDC, camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.4);
      const hit = new THREE.Vector3();
      if (ray.ray.intersectPlane(plane, hit)) this.aimPoint.copy(hit);
    }

    // ---------- driving ----------
    const throttle = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);

    const targetSpeed = throttle > 0 ? MAX_FORWARD : throttle < 0 ? -MAX_BACK : 0;
    const rate = throttle === 0 ? ACCEL * 1.6 : ACCEL;
    if (this.speed < targetSpeed) this.speed = Math.min(targetSpeed, this.speed + rate * dt);
    else if (this.speed > targetSpeed) this.speed = Math.max(targetSpeed, this.speed - rate * dt);

    const speedFactor = 1 - Math.min(0.3, Math.abs(this.speed) / MAX_FORWARD * 0.3);
    this.yaw += steer * TURN_SPEED * speedFactor * dt;
    this.yaw = wrapAngle(this.yaw);

    this.pos.x += Math.sin(this.yaw) * this.speed * dt;
    this.pos.z += Math.cos(this.yaw) * this.speed * dt;
    this.game.world.resolveCircle(this.pos, this.radius);

    // ---------- turret ----------
    const dx = this.aimPoint.x - this.pos.x;
    const dz = this.aimPoint.z - this.pos.z;
    const worldAngle = Math.atan2(dx, dz);
    let local = wrapAngle(worldAngle - this.yaw);
    this.clamped = Math.abs(local) > TURRET_LIMIT;
    local = THREE.MathUtils.clamp(local, -TURRET_LIMIT, TURRET_LIMIT);
    this.turretTarget = local;
    const diff = wrapAngle(local - this.turretYaw);
    const step = TURRET_SPEED * dt;
    this.turretYaw += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
    this.turret.rotation.y = this.turretYaw;

    // recoil spring
    this.recoil = Math.max(0, this.recoil - dt * 5.5);
    this.turret.position.z = this.turretBaseZ - this.recoil * 0.55;
    this.turret.position.y = 2.28 + this.recoil * 0.05;

    // body lean
    const targetRoll = -steer * 0.05 * Math.min(1, Math.abs(this.speed) / 10 + 0.35);
    const targetPitch = THREE.MathUtils.clamp(-this.speed / MAX_FORWARD * 0.035, -0.04, 0.04);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 6);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 6);

    this.root.rotation.y = this.yaw;
    this.root.rotation.x = this.pitch;
    this.root.rotation.z = this.roll;

    // wheels
    const wheelSpin = this.speed * dt * 1.4;
    for (const w of this.wheels) w.rotation.y += wheelSpin;

    // ---------- firing ----------
    this.cooldown -= dt;
    if (input.fire && this.cooldown <= 0) this.fire();

    // ---------- powerups ----------
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    if (this.rapid > 0) this.rapid = Math.max(0, this.rapid - dt);
    if (this.shield > 0) this.shield = Math.max(0, this.shield - dt);
    if (this.pickupFlash > 0) this.pickupFlash = Math.max(0, this.pickupFlash - dt);

    // ---------- effects ----------
    const moving = Math.abs(this.speed) > 3;
    this.dustTimer -= dt;
    if (moving && this.dustTimer <= 0) {
      this.dustTimer = 0.055;
      const bx = -Math.sin(this.yaw) * 2.5;
      const bz = -Math.cos(this.yaw) * 2.5;
      const sx = Math.cos(this.yaw) * 1.35;
      const sz = -Math.sin(this.yaw) * 1.35;
      const side = Math.random() < 0.5 ? 1 : -1;
      this.game.effects.dust(
        this._v.set(this.pos.x + bx + sx * side, 0, this.pos.z + bz + sz * side),
        Math.min(1, Math.abs(this.speed) / MAX_FORWARD + 0.25)
      );
    }
    this.markTimer -= dt;
    if (moving && this.markTimer <= 0) {
      this.markTimer = 0.42;
      const sx = Math.cos(this.yaw) * 1.35;
      const sz = -Math.sin(this.yaw) * 1.35;
      this.game.effects.renderMark(this._v.set(this.pos.x + sx, 0, this.pos.z + sz));
      this.game.effects.renderMark(this._v.set(this.pos.x - sx, 0, this.pos.z - sz));
    }

    this._updateShieldMesh(dt);
    this.game.audio.setEngine(Math.min(1, Math.abs(this.speed) / MAX_FORWARD + Math.abs(steer) * 0.25));
  }

  _updateShieldMesh(dt) {
    const active = this.shield > 0;
    if (active && !this.shieldMesh) {
      this.shieldMesh = new THREE.Mesh(
        new THREE.SphereGeometry(2.9, 18, 12),
        new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })
      );
      this.shieldMesh.position.y = 1.6;
      this.root.add(this.shieldMesh);
    }
    if (this.shieldMesh) {
      if (!active) {
        this.root.remove(this.shieldMesh);
        this.shieldMesh.geometry.dispose();
        this.shieldMesh.material.dispose();
        this.shieldMesh = null;
      } else {
        const pulse = 0.14 + Math.sin(this.game.time * 9) * 0.06;
        this.shieldMesh.material.opacity = this.shield <= 2 ? pulse * (0.4 + 0.6 * Math.abs(Math.sin(this.game.time * 22))) : pulse;
      }
    }
  }

  fire() {
    this.root.updateMatrixWorld(true);
    const pos = this._v.copy(this.muzzleWorld());
    const dir = this._dir;
    this.muzzle.getWorldDirection(dir).normalize();

    const spread = 0.008;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread * 0.5;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    this.game.bullets.fire({
      pos, dir,
      speed: 105,
      damage: 34,
      owner: 'player',
      color: 0xffe066,
      radius: 0.4,
      life: 3.0,
    });

    this.cooldown = BASE_COOLDOWN * (this.rapid > 0 ? 0.34 : 1);
    this.recoil = 1;
    this.game.effects.muzzleFlash(pos, dir, 1);
    this.game.addShake(0.16);
    this.game.audio.shoot();
    this.game.hud.pulseReticle();
  }

  muzzleWorld() {
    return this.muzzle.getWorldPosition(new THREE.Vector3());
  }

  takeDamage(dmg, dir) {
    if (!this.alive || this.invuln > 0) return;
    let d = dmg;
    if (this.shield > 0) {
      d = dmg * 0.3;
      this.game.effects.ringFlash(this._v.set(this.pos.x, 1.8, this.pos.z), 0x66e0ff, 0.7);
    }
    this.hp -= d;
    this.hitFlash = 1;
    this.game.addShake(Math.min(0.6, 0.14 + d / 120));
    this.game.hud.hitVignette(Math.min(1, d / 22));
    this.game.audio.hitArmor();

    const back = dir ? dir.clone().setY(0).normalize() : new THREE.Vector3(0, 0, 1);
    this.game.effects.impact(this._v.copy(this.muzzleWorldSafe()), back.clone().negate(), 0xff9a5a);
    this.game.hud.damageDir(Math.atan2(-back.x, -back.z) - this.game.camYaw);

    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  muzzleWorldSafe() {
    return new THREE.Vector3(this.pos.x, 1.9, this.pos.z);
  }

  applyPickup(type) {
    if (type === 'repair') {
      this.hp = Math.min(this.maxHp, this.hp + 35);
      this.game.notify('维修包 +35 装甲', 'repair');
    } else if (type === 'rapid') {
      this.rapid = 10;
      this.game.notify('连发炮弹 10s', 'rapid');
    } else if (type === 'shield') {
      this.shield = 9;
      this.game.notify('能量护盾 9s', 'shield');
    } else if (type === 'double') {
      this.maxHp += 15;
      this.hp = this.maxHp;
      this.rapid = 6;
      this.game.notify('装甲强化 +15 上限', 'repair');
    }
    this.pickupFlash = 1;
    this.game.audio.pickup();
    this.game.effects.ringFlash(this._v.set(this.pos.x, 1.4, this.pos.z), 0x9ef7a8, 1.1);
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.root.updateMatrixWorld(true);
    this.game.effects.explosion(new THREE.Vector3(this.pos.x, 1.6, this.pos.z), 2.4);
    this.game.audio.explosion(true);
    this.game.audio.stopEngine();
    this.game.addShake(1.4);
    this.game.onPlayerDestroyed();
  }
}
