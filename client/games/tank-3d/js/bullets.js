import * as THREE from 'three';
import { ARENA_HALF } from './world.js';

const SHARED_GEO = new THREE.SphereGeometry(0.28, 8, 6);
const LIMIT = ARENA_HALF + 12;

export class BulletManager {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.list = [];
    this.pool = [];
    this._tmpA = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();
  }

  _acquire(color) {
    let b = this.pool.pop();
    if (!b) {
      const mesh = new THREE.Mesh(SHARED_GEO, new THREE.MeshBasicMaterial({ color }));
      mesh.frustumCulled = false;
      b = { mesh, pos: new THREE.Vector3(), dir: new THREE.Vector3(), light: null };
    }
    b.mesh.material.color.set(color);
    b.mesh.material.opacity = 1;
    b.mesh.material.transparent = false;
    b.mesh.visible = true;
    this.group.add(b.mesh);
    return b;
  }

  fire({ pos, dir, speed = 90, damage = 30, owner = 'player', color = 0xffe066, radius = 0.42, life = 3.2 }) {
    const b = this._acquire(color);
    b.pos.copy(pos);
    b.dir.copy(dir).normalize();
    b.speed = speed;
    b.damage = damage;
    b.owner = owner;
    b.radius = radius;
    b.life = life;
    b.dead = false;
    b.mesh.position.copy(pos);
    this.list.push(b);
    return b;
  }

  _release(b) {
    this.group.remove(b.mesh);
    b.dead = true;
    if (this.pool.length < 120) this.pool.push(b);
  }

  clear() {
    for (const b of this.list) this._release(b);
    this.list.length = 0;
  }

  update(dt) {
    const world = this.game.world;
    const player = this.game.player;
    const enemies = this.game.enemies;
    const fx = this.game.effects;

    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.life -= dt;
      if (b.life <= 0) {
        this._release(b);
        this.list.splice(i, 1);
        continue;
      }

      const stepLen = b.speed * dt;
      const steps = Math.max(1, Math.ceil(stepLen / 1.1));
      const sub = stepLen / steps;
      let hit = false;

      for (let s = 0; s < steps && !hit; s++) {
        b.pos.addScaledVector(b.dir, sub);

        // ground
        if (b.pos.y <= 0.12) {
          fx.impact(b.pos, new THREE.Vector3(0, 1, 0), 0xd8c07a);
          this.game.audio.hitArmor();
          hit = true;
          break;
        }

        // leave the arena
        if (Math.abs(b.pos.x) > LIMIT || Math.abs(b.pos.z) > LIMIT) {
          hit = true;
          break;
        }

        const blk = world.hitBlocker(b.pos, b.radius);
        if (blk) {
          const destroyed = world.damageBlocker(blk, b.damage);
          fx.impact(b.pos, this._tmpA.copy(b.dir).negate(), blk.kind === 'brick' || blk.kind === 'crate' ? 0xd08a4a : 0xffd27a);
          if (destroyed) {
            fx.explosion(this._tmpB.set(blk.mesh.position.x, 1.2, blk.mesh.position.z), 0.45);
            this.game.audio.explosion(false);
          } else {
            this.game.audio.hitArmor();
          }
          hit = true;
          break;
        }

        // tanks
        if (b.owner === 'player') {
          for (const e of enemies) {
            if (!e.alive || e.spawning) continue;
            const dx = b.pos.x - e.pos.x;
            const dz = b.pos.z - e.pos.z;
            const rr = e.radius + b.radius;
            if (dx * dx + dz * dz < rr * rr && b.pos.y > 0.2 && b.pos.y < e.height) {
              e.takeDamage(b.damage, this._tmpA.copy(b.dir));
              hit = true;
              break;
            }
          }
        } else if (player.alive) {
          const dx = b.pos.x - player.pos.x;
          const dz = b.pos.z - player.pos.z;
          const rr = player.radius + b.radius;
          if (dx * dx + dz * dz < rr * rr && b.pos.y > 0.2 && b.pos.y < player.height) {
            player.takeDamage(b.damage, this._tmpA.copy(b.dir));
            hit = true;
          }
        }
      }

      if (hit) {
        this._release(b);
        this.list.splice(i, 1);
        continue;
      }

      b.mesh.position.copy(b.pos);
      b.mesh.scale.setScalar(1 + Math.min(0.35, b.speed / 400));
      if (Math.random() < 0.65) fx.trail(b.pos);
    }
  }
}
