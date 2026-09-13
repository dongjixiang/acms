import * as THREE from 'three';

export const ARENA_HALF = 62;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function groundTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');

  g.fillStyle = '#7fa85c';
  g.fillRect(0, 0, S, S);

  const rng = mulberry32(7);
  for (let i = 0; i < 220; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const r = 12 + rng() * 46;
    const tint = rng();
    const col = tint < 0.45 ? '140,168,96' : tint < 0.78 ? '168,178,108' : '112,142,80';
    g.fillStyle = `rgba(${col},${0.10 + rng() * 0.16})`;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.55 + rng() * 0.5), rng() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }

  for (let i = 0; i < 900; i++) {
    const x = rng() * S;
    const y = rng() * S;
    g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(60,80,40,0.07)';
    g.fillRect(x, y, 2, 2);
  }

  g.strokeStyle = 'rgba(255,255,255,0.09)';
  g.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const p = (i / 8) * S;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(20, 20);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.blockers = [];
    this.rng = mulberry32(20260912);
    this._matCache = new Map();

    this._buildSky();
    this._buildGround();
    this._buildPerimeter();
    this._buildObstacles();
    this._buildScenery();
  }

  _sky() {
    const geo = new THREE.SphereGeometry(420, 32, 20);
    const top = new THREE.Color('#3b7dd8');
    const mid = new THREE.Color('#9fcdf5');
    const bottom = new THREE.Color('#f3d9a8');
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const h = clamp(pos.getY(i) / 420, -1, 1);
      if (h >= 0) c.copy(mid).lerp(top, Math.pow(h, 0.65));
      else c.copy(mid).lerp(bottom, Math.pow(-h, 0.7));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
    const sky = new THREE.Mesh(geo, mat);
    sky.renderOrder = -1;
    this.group.add(sky);
  }

  _buildSky() {
    this._sky();
    this.scene.fog = new THREE.Fog(0xbcd9f2, 110, 320);
  }

  _buildGround() {
    const geo = new THREE.PlaneGeometry(ARENA_HALF * 2 + 300, ARENA_HALF * 2 + 300);
    const mat = new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0 });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);
    this.groundY = 0;
  }

  _mat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (this._matCache.has(key)) return this._matCache.get(key);
    const m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.05, ...opts });
    this._matCache.set(key, m);
    return m;
  }

  _addBlocker(mesh, w, h, d, { destructible = false, hp = 0, kind = 'steel' } = {}) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.updateMatrixWorld();
    const box = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(mesh.position.x, h / 2, mesh.position.z),
      new THREE.Vector3(w, h, d)
    );
    const rec = { mesh, box, destructible, hp, maxHp: hp, kind, dead: false };
    mesh.userData.blocker = rec;
    this.blockers.push(rec);
    this.group.add(mesh);
    return rec;
  }

  _buildPerimeter() {
    const H = 9;
    const T = 5;
    const L = ARENA_HALF;
    const mat = this._mat('#8d8f95', { roughness: 0.9 });
    const capMat = this._mat('#b9bcc4');
    const walls = [
      { x: 0, z: -L - T / 2, w: L * 2 + T * 2, d: T },
      { x: 0, z: L + T / 2, w: L * 2 + T * 2, d: T },
      { x: -L - T / 2, z: 0, w: T, d: L * 2 + T * 2 },
      { x: L + T / 2, z: 0, w: T, d: L * 2 + T * 2 },
    ];
    for (const w of walls) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, H, w.d), mat);
      mesh.position.set(w.x, H / 2, w.z);
      this._addBlocker(mesh, w.w, H, w.d, { kind: 'wall' });

      const cap = new THREE.Mesh(new THREE.BoxGeometry(w.w + 1.4, 0.8, w.d + 1.4), capMat);
      cap.position.set(w.x, H + 0.4, w.z);
      this.group.add(cap);
    }
  }

  _buildObstacles() {
    const rng = this.rng;
    const placed = [];
    const tries = 700;
    let made = 0;

    while (made < 40 && tries > 0) {
      const t = made;
      const ang = rng() * Math.PI * 2;
      const dist = 15 + rng() * (ARENA_HALF - 26);
      const x = Math.cos(ang) * dist;
      const z = Math.sin(ang) * dist;

      let ok = true;
      for (const p of placed) {
        if ((p.x - x) ** 2 + (p.z - z) ** 2 < 12 * 12) { ok = false; break; }
      }
      if (!ok) continue;
      placed.push({ x, z });

      const roll = rng();
      if (roll < 0.42) {
        const w = 2.6 + rng() * 1.6;
        const h = 3 + rng() * 2.6;
        const d = 2.6 + rng() * 1.6;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this._mat('#b0673a', { roughness: 0.95 }));
        mesh.position.set(x, h / 2, z);
        mesh.rotation.y = Math.round(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.1;
        this._addBlocker(mesh, w, h, d, { destructible: true, hp: 55, kind: 'brick' });
      } else if (roll < 0.62) {
        const w = 2.4;
        const h = 2.4;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), this._mat('#a9793f', { roughness: 0.98 }));
        mesh.position.set(x, h / 2, z);
        mesh.rotation.y = rng() * Math.PI;
        this._addBlocker(mesh, w, h, w, { destructible: true, hp: 24, kind: 'crate' });
      } else if (roll < 0.86) {
        const s = 2.8 + rng() * 2.2;
        const h = s * 1.5;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, h, s), this._mat('#6f7b8c', { roughness: 0.7, metalness: 0.25 }));
        mesh.position.set(x, h / 2, z);
        mesh.rotation.y = Math.round(rng() * 4) * (Math.PI / 2);
        this._addBlocker(mesh, s, h, s, { kind: 'steel' });
      } else {
        const r = 3 + rng() * 2.2;
        const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), this._mat('#8d8577', { roughness: 1 }));
        mesh.position.set(x, r * 0.55, z);
        mesh.rotation.set(rng() * 3, rng() * 3, rng() * 3);
        this._addBlocker(mesh, r * 1.6, r * 1.15, r * 1.6, { kind: 'rock' });
      }
      made++;
    }

    const guard = [
      [-26, -26], [26, -26], [-26, 26], [26, 26],
    ];
    for (const [x, z] of guard) {
      const h = 3.6;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(3, h, 3), this._mat('#6f7b8c', { roughness: 0.7, metalness: 0.25 }));
      mesh.position.set(x, h / 2, z);
      this._addBlocker(mesh, 3, h, 3, { kind: 'steel' });
    }
  }

  _buildScenery() {
    const rng = mulberry32(999);
    const trunkMat = this._mat('#7a5230', { roughness: 1 });
    const leafMat = this._mat('#3f8f4a', { roughness: 1 });
    const leafMat2 = this._mat('#55a85c', { roughness: 1 });

    for (let i = 0; i < 54; i++) {
      const ang = (i / 54) * Math.PI * 2 + rng() * 0.09;
      const dist = ARENA_HALF + 12 + rng() * 46;
      const x = Math.cos(ang) * dist;
      const z = Math.sin(ang) * dist;
      const s = 0.8 + rng() * 1.1;

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 4.4 * s, 6), trunkMat);
      trunk.position.set(x, 2.2 * s, z);
      this.group.add(trunk);

      const leaf = new THREE.Mesh(new THREE.ConeGeometry(3.1 * s, 6.4 * s, 7), rng() < 0.5 ? leafMat : leafMat2);
      leaf.position.set(x, 6.6 * s, z);
      this.group.add(leaf);
    }

    const hillMat = this._mat('#9fb083', { roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const ang = rng() * Math.PI * 2;
      const dist = ARENA_HALF + 90 + rng() * 110;
      const r = 26 + rng() * 40;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), hillMat);
      hill.position.set(Math.cos(ang) * dist, -r * (0.55 + rng() * 0.2), Math.sin(ang) * dist);
      hill.scale.y = 0.5;
      this.group.add(hill);
    }

    for (let i = 0; i < 22; i++) {
      const x = (rng() - 0.5) * 2 * (ARENA_HALF - 8);
      const z = (rng() - 0.5) * 2 * (ARENA_HALF - 8);
      if (x * x + z * z < 20 * 20) continue;
      const s = 0.35 + rng() * 0.5;
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(s * 2.4, 0), leafMat2);
      bush.position.set(x, s * 1.7, z);
      bush.castShadow = true;
      this.group.add(bush);
    }
  }

  /* ------------ queries ------------ */

  resolveCircle(pos, radius) {
    for (const b of this.blockers) {
      if (b.dead) continue;
      const box = b.box;
      const cx = clamp(pos.x, box.min.x, box.max.x);
      const cz = clamp(pos.z, box.min.z, box.max.z);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > radius * radius) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = radius - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      } else {
        const left = pos.x - box.min.x;
        const right = box.max.x - pos.x;
        const back = pos.z - box.min.z;
        const front = box.max.z - pos.z;
        const m = Math.min(left, right, back, front);
        if (m === left) pos.x = box.min.x - radius;
        else if (m === right) pos.x = box.max.x + radius;
        else if (m === back) pos.z = box.min.z - radius;
        else pos.z = box.max.z + radius;
      }
    }
    const lim = ARENA_HALF - radius;
    pos.x = clamp(pos.x, -lim, lim);
    pos.z = clamp(pos.z, -lim, lim);
  }

  hitBlocker(point, radius = 0.3) {
    for (const b of this.blockers) {
      if (b.dead) continue;
      const box = b.box;
      if (
        point.x > box.min.x - radius && point.x < box.max.x + radius &&
        point.y > box.min.y - radius && point.y < box.max.y + radius &&
        point.z > box.min.z - radius && point.z < box.max.z + radius
      ) return b;
    }
    return null;
  }

  lineOfSight(a, b) {
    const steps = 20;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const p = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
      };
      if (this.hitBlocker(p, 0.45)) return false;
    }
    return true;
  }

  damageBlocker(rec, dmg) {
    if (!rec || rec.dead || !rec.destructible) return false;
    rec.hp -= dmg;
    const k = Math.max(0, rec.hp / rec.maxHp);
    rec.mesh.scale.set(1, 0.75 + 0.25 * k, 1);
    rec.mesh.position.y = (rec.box.max.y * (0.75 + 0.25 * k)) / 2;
    if (rec.hp <= 0) {
      rec.dead = true;
      this.group.remove(rec.mesh);
      rec.mesh.geometry.dispose();
      return true;
    }
    return false;
  }
}
