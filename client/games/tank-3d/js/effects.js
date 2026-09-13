import * as THREE from 'three';

let softTex = null;
function getSoftTexture() {
  if (softTex) return softTex;
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.78)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  softTex = new THREE.CanvasTexture(c);
  softTex.colorSpace = THREE.SRGBColorSpace;
  return softTex;
}

class ParticleSystem {
  constructor(scene, { capacity = 800, blending = THREE.NormalBlending } = {}) {
    this.capacity = capacity;
    this.count = 0;

    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);

    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.grow = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.alphaScale = new Float32Array(capacity);
    this.baseColor = new Float32Array(capacity * 3);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));

    const m = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: getSoftTexture() } },
      vertexShader: /* glsl */`
        attribute float aSize;
        attribute vec3 aColor;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          if (mv.z > -0.2) { vAlpha = 0.0; gl_PointSize = 0.0; }
          else { gl_PointSize = max(1.0, aSize * (420.0 / -mv.z)); }
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          if (vAlpha <= 0.001) discard;
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor, t.a * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending,
    });

    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.geom = g;
  }

  spawn(o) {
    const i = this.count < this.capacity ? this.count++ : Math.floor(Math.random() * this.capacity);
    const i3 = i * 3;
    this.positions[i3] = o.x; this.positions[i3 + 1] = o.y; this.positions[i3 + 2] = o.z;
    this.vel[i3] = o.vx || 0; this.vel[i3 + 1] = o.vy || 0; this.vel[i3 + 2] = o.vz || 0;
    const col = o.color instanceof THREE.Color ? o.color : new THREE.Color(o.color || 0xffffff);
    this.baseColor[i3] = col.r; this.baseColor[i3 + 1] = col.g; this.baseColor[i3 + 2] = col.b;
    this.colors[i3] = col.r; this.colors[i3 + 1] = col.g; this.colors[i3 + 2] = col.b;
    this.baseSize[i] = o.size || 1;
    this.sizes[i] = o.size || 1;
    this.alphaScale[i] = o.alpha ?? 1;
    this.alphas[i] = this.alphaScale[i];
    this.life[i] = o.life || 1;
    this.maxLife[i] = this.life[i];
    this.grav[i] = o.grav || 0;
    this.drag[i] = o.drag ?? 1.6;
    this.grow[i] = o.grow || 0;
    return i;
  }

  update(dt) {
    let anyAlive = false;
    for (let i = 0; i < this.count; i++) {
      const l = this.life[i];
      if (l <= 0) { if (this.alphas[i] !== 0) this.alphas[i] = 0; continue; }
      const i3 = i * 3;
      this.life[i] = l - dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);

      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= d;
      this.vel[i3 + 2] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d + this.grav[i] * dt;

      this.positions[i3] += this.vel[i3] * dt;
      this.positions[i3 + 1] += this.vel[i3 + 1] * dt;
      this.positions[i3 + 2] += this.vel[i3 + 2] * dt;

      if (this.positions[i3 + 1] < 0.05) {
        this.positions[i3 + 1] = 0.05;
        this.vel[i3 + 1] *= -0.25;
      }

      this.sizes[i] = this.baseSize[i] * (1 + this.grow[i] * (1 - t));
      const fade = t < 0.15 ? t / 0.15 : t;
      this.alphas[i] = this.alphaScale[i] * fade;

      if (this.grow[i] === 0) {
        this.colors[i3] = this.baseColor[i3];
        this.colors[i3 + 1] = this.baseColor[i3 + 1];
        this.colors[i3 + 2] = this.baseColor[i3 + 2];
      }
      anyAlive = true;
    }
    if (this.count > 0) {
      this.geom.attributes.position.needsUpdate = true;
      this.geom.attributes.aColor.needsUpdate = true;
      this.geom.attributes.aSize.needsUpdate = true;
      this.geom.attributes.aAlpha.needsUpdate = true;
    }
    return anyAlive;
  }
}

export class Effects {
  constructor(scene, { onShake } = {}) {
    this.scene = scene;
    this.onShake = onShake || (() => {});

    this.smoke = new ParticleSystem(scene, { capacity: 900, blending: THREE.NormalBlending });
    this.spark = new ParticleSystem(scene, { capacity: 900, blending: THREE.AdditiveBlending });

    this.lights = [];
    for (let i = 0; i < 8; i++) {
      const l = new THREE.PointLight(0xffaa44, 0, 40, 2);
      l.visible = false;
      scene.add(l);
      this.lights.push({ light: l, life: 0, maxLife: 1, intensity: 0 });
    }

    this.rings = [];
    this._tmp = new THREE.Vector3();
  }

  _flash(pos, color, intensity, distance, life) {
    const slot = this.lights.find((s) => s.life <= 0) || this.lights[0];
    slot.light.position.copy(pos);
    slot.light.color.set(color);
    slot.light.distance = distance;
    slot.intensity = intensity;
    slot.life = life;
    slot.maxLife = life;
    slot.light.visible = true;
  }

  _ring(pos, color, maxR, life) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 1, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.35, pos.z);
    mesh.scale.setScalar(1);
    this.scene.add(mesh);
    this.rings.push({ mesh, life, maxLife: life, maxR });
  }

  muzzleFlash(pos, dir, scale = 1) {
    const d = dir.clone().normalize();
    this._flash(pos, 0xffb057, 5 * scale, 26 * scale, 0.07);
    for (let i = 0; i < 12 * scale; i++) {
      const spread = 0.55;
      this.spark.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: d.x * (16 + Math.random() * 22) + (Math.random() - 0.5) * 16 * spread,
        vy: d.y * (16 + Math.random() * 22) + (Math.random() - 0.5) * 9 * spread,
        vz: d.z * (16 + Math.random() * 22) + (Math.random() - 0.5) * 16 * spread,
        size: 0.7 + Math.random() * 0.9,
        color: Math.random() < 0.5 ? 0xffd88a : 0xff9a3d,
        life: 0.14 + Math.random() * 0.14,
        drag: 5.5, grav: -6, grow: 0.6,
      });
    }
    for (let i = 0; i < 6 * scale; i++) {
      this.smoke.spawn({
        x: pos.x + (Math.random() - 0.5), y: pos.y + (Math.random() - 0.5), z: pos.z + (Math.random() - 0.5),
        vx: d.x * 6 + (Math.random() - 0.5) * 5,
        vy: 1.6 + Math.random() * 2.4,
        vz: d.z * 6 + (Math.random() - 0.5) * 5,
        size: 1.1 + Math.random() * 1.0,
        color: 0x9c9c9c,
        life: 0.5 + Math.random() * 0.4,
        drag: 2.2, grav: 1.2, grow: 2.4, alpha: 0.26,
      });
    }
  }

  impact(pos, normal, color = 0xffcf7a) {
    const n = normal ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
    this._flash(pos, 0xffc07a, 2.4, 16, 0.06);
    for (let i = 0; i < 16; i++) {
      this.spark.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: n.x * (6 + Math.random() * 16) + (Math.random() - 0.5) * 14,
        vy: Math.abs(n.y) * 4 + Math.random() * 12,
        vz: n.z * (6 + Math.random() * 16) + (Math.random() - 0.5) * 14,
        size: 0.45 + Math.random() * 0.65,
        color: Math.random() < 0.4 ? 0xffffff : color,
        life: 0.22 + Math.random() * 0.28,
        drag: 3.4, grav: -22, grow: 0.2,
      });
    }
    for (let i = 0; i < 8; i++) {
      this.smoke.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: (Math.random() - 0.5) * 5,
        vy: 1.2 + Math.random() * 2.6,
        vz: (Math.random() - 0.5) * 5,
        size: 1.1 + Math.random(),
        color: 0x8b8b8b,
        life: 0.5 + Math.random() * 0.4,
        drag: 2.4, grav: 1.4, grow: 2.6, alpha: 0.34,
      });
    }
  }

  explosion(pos, scale = 1) {
    this._flash(pos, 0xffa030, 14 * scale, 46 * scale, 0.26);
    this._ring(pos, 0xffb861, 16 * scale, 0.5);
    this.onShake(0.55 * scale);

    for (let i = 0; i < 34 * scale; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 6 + Math.random() * 20 * scale;
      this.spark.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * s,
        vy: 6 + Math.random() * 22 * scale,
        vz: Math.sin(a) * s,
        size: 0.8 + Math.random() * 1.5,
        color: [0xffe08a, 0xffb04d, 0xff7a2b][i % 3],
        life: 0.3 + Math.random() * 0.45,
        drag: 2.4, grav: -26, grow: 0.4,
      });
    }
    for (let i = 0; i < 24 * scale; i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.spawn({
        x: pos.x + (Math.random() - 0.5) * 2, y: pos.y + Math.random() * 1.4, z: pos.z + (Math.random() - 0.5) * 2,
        vx: Math.cos(a) * (3 + Math.random() * 6),
        vy: 2 + Math.random() * 5,
        vz: Math.sin(a) * (3 + Math.random() * 6),
        size: 2.4 + Math.random() * 2.6,
        color: i % 5 === 0 ? 0x33312e : 0x6f6a63,
        life: 0.9 + Math.random() * 1.1,
        drag: 1.5, grav: 2.4, grow: 3.4, alpha: 0.55,
      });
    }
  }

  dust(pos, intensity = 1) {
    this.smoke.spawn({
      x: pos.x + (Math.random() - 0.5) * 2.2,
      y: 0.22 + Math.random() * 0.3,
      z: pos.z + (Math.random() - 0.5) * 2.2,
      vx: (Math.random() - 0.5) * 1.8,
      vy: 0.45 + Math.random() * 0.8,
      vz: (Math.random() - 0.5) * 1.8,
      size: 0.9 + Math.random() * 0.9,
      color: 0xcbbd94,
      life: 0.35 + Math.random() * 0.35,
      drag: 2.4, grav: 0.5, grow: 2.2, alpha: 0.2 * intensity,
    });
  }

  trail(pos) {
    this.smoke.spawn({
      x: pos.x, y: pos.y, z: pos.z,
      vx: 0, vy: 0.2, vz: 0,
      size: 0.55,
      color: 0xbdbdbd,
      life: 0.22,
      drag: 2, grav: 0, grow: 1.6, alpha: 0.2,
    });
  }

  renderMark(pos) {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 16),
      new THREE.MeshBasicMaterial({ color: 0x3a3226, transparent: true, opacity: 0.35, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.04 + Math.random() * 0.01, pos.z);
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    this.rings.push({ mesh, life: 6, maxLife: 9, maxR: 1, mark: true });
  }

  ringFlash(pos, color, scale = 1) {
    this._ring(pos, color, 9 * scale, 0.45);
    this._flash(pos, color, 3 * scale, 22, 0.25);
  }

  update(dt) {
    this.smoke.update(dt);
    this.spark.update(dt);

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.mark) {
        const t = Math.max(0, r.life / r.maxLife);
        r.mesh.material.opacity = 0.35 * t;
        if (r.life <= 0) {
          this.scene.remove(r.mesh);
          r.mesh.geometry.dispose();
          r.mesh.material.dispose();
          this.rings.splice(i, 1);
        }
        continue;
      }
      const t = 1 - Math.max(0, r.life / r.maxLife);
      r.mesh.scale.setScalar(1 + t * r.maxR);
      r.mesh.material.opacity = Math.max(0, 0.9 * (1 - t) ** 1.6);
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
      }
    }

    for (const s of this.lights) {
      if (s.life <= 0) {
        if (s.light.visible) s.light.visible = false;
        continue;
      }
      s.life -= dt;
      const t = Math.max(0, s.life / s.maxLife);
      s.light.intensity = s.intensity * t * t;
      if (s.life <= 0) s.light.visible = false;
    }
  }
}
