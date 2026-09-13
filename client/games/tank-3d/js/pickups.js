import * as THREE from 'three';

const TYPES = {
  repair: { color: 0x54e07a, label: '维修包' },
  rapid: { color: 0xffb43d, label: '连发' },
  shield: { color: 0x66e0ff, label: '护盾' },
};

const ICON = {
  repair: () => {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: 0x0d2015 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.16), m);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.9, 0.16), m);
    b.position.z = 0.02;
    a.position.z = 0.02;
    g.add(a, b);
    return g;
  },
  rapid: () => {
    const m = new THREE.MeshBasicMaterial({ color: 0x2a1a02 });
    const g = new THREE.Group();
    for (let i = -1; i <= 1; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 6), m);
      c.rotation.z = Math.PI / 2;
      c.position.set(0, i * 0.3, 0.02);
      g.add(c);
    }
    return g;
  },
  shield: () => {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: 0x04202a });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 6, 14), m);
    ring.position.z = 0.02;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), m);
    dot.position.z = 0.02;
    g.add(ring, dot);
    return g;
  },
};

export class PickupManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this._v = new THREE.Vector3();
  }

  maybeDrop(pos, forceType = null) {
    const player = this.game.player;
    if (!forceType) {
      const fieldHasRepair = this.list.some((p) => p.type === 'repair');
      if (player.hp / player.maxHp < 0.4 && !fieldHasRepair) forceType = 'repair';
      else if (Math.random() > 0.17) return null;
    }

    let type = forceType;
    if (!type) {
      const r = Math.random();
      type = r < 0.46 ? 'repair' : r < 0.78 ? 'rapid' : 'shield';
    }
    return this.spawn(pos, type);
  }

  spawn(pos, type) {
    const def = TYPES[type];
    const root = new THREE.Group();
    root.position.set(pos.x, 1.5, pos.z);

    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 1.7, 1.7),
      new THREE.MeshStandardMaterial({
        color: def.color, emissive: def.color, emissiveIntensity: 0.35,
        flatShading: true, roughness: 0.4, metalness: 0.3, transparent: true, opacity: 0.92,
      })
    );
    shell.castShadow = true;
    root.add(shell);

    const icon = ICON[type] ? ICON[type]() : null;
    if (icon) {
      icon.position.y = 0.9;
      icon.rotation.x = -Math.PI / 2;
      root.add(icon);
    }

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 2.1, 24),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -1.35;
    root.add(halo);

    const light = new THREE.PointLight(def.color, 2.2, 14, 2);
    light.position.y = 0.6;
    root.add(light);

    this.group.add(root);
    const rec = { root, shell, halo, type, life: 20, t: Math.random() * 6, light };
    this.list.push(rec);
    return rec;
  }

  update(dt) {
    const player = this.game.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      p.life -= dt;
      p.root.rotation.y += dt * 1.6;
      p.root.position.y = 1.5 + Math.sin(p.t * 2.4) * 0.28;
      p.shell.rotation.x += dt * 0.9;
      const pulse = 0.82 + Math.sin(p.t * 4) * 0.18;
      p.halo.scale.setScalar(pulse);
      p.halo.material.opacity = p.life < 4 ? (0.4 * (0.4 + 0.6 * Math.abs(Math.sin(p.t * 10)))) : 0.4;

      if (p.life < 4) p.root.visible = Math.floor(p.t * 8) % 2 === 0;

      if (player.alive) {
        const dx = p.root.position.x - player.pos.x;
        const dz = p.root.position.z - player.pos.z;
        if (dx * dx + dz * dz < (player.radius + 1.9) ** 2) {
          player.applyPickup(p.type);
          this.remove(i);
          continue;
        }
      }

      if (p.life <= 0) this.remove(i);
    }
  }

  remove(i) {
    const p = this.list[i];
    this.group.remove(p.root);
    p.root.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (o.material.dispose) o.material.dispose();
      }
    });
    this.list.splice(i, 1);
  }

  clear() {
    for (let i = this.list.length - 1; i >= 0; i--) this.remove(i);
  }
}
