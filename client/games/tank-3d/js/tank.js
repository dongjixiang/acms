import * as THREE from 'three';

const geoms = {};
const mats = {};

function geo(key, make) {
  if (!geoms[key]) geoms[key] = make();
  return geoms[key];
}
function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!mats[k]) {
    mats[k] = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.62, metalness: 0.28, ...opts });
  }
  return mats[k];
}

/**
 * Low-poly cartoon tank. Model faces +Z.
 * Returns a Group with .userData = { turret, muzzle, wheels, body }
 */
export function createTank({ body = '#5f8f4e', accent = '#3f6b34', turret = '#6ba055', scale = 1, kind = 'medium' } = {}) {
  const root = new THREE.Group();
  root.scale.setScalar(scale);

  const trackMat = mat('#2f3239', { roughness: 0.95, metalness: 0.15 });
  const bodyMat = mat(body);
  const darkBody = mat(accent);
  const turretMat = mat(turret);

  const hullW = 3.4;
  const hullH = 1.5;
  const hullD = 4.4;

  // lower chassis
  const chassis = new THREE.Mesh(geo('chassis', () => new THREE.BoxGeometry(hullW, hullH, hullD)), bodyMat);
  chassis.position.y = 1.05;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  root.add(chassis);

  // sloped front plate
  const glacis = new THREE.Mesh(geo('glacis', () => new THREE.BoxGeometry(hullW * 0.94, 0.9, 1.5)), bodyMat);
  glacis.position.set(0, 1.35, hullD / 2 - 0.55);
  glacis.rotation.x = -0.5;
  glacis.castShadow = true;
  root.add(glacis);

  // upper deck
  const deck = new THREE.Mesh(geo('deck', () => new THREE.BoxGeometry(hullW * 0.82, 0.5, hullD * 0.72)), darkBody);
  deck.position.set(0, 2.0, -0.2);
  deck.castShadow = true;
  root.add(deck);

  // fenders / side skirts
  for (const sx of [-1, 1]) {
    const skirt = new THREE.Mesh(geo('skirt', () => new THREE.BoxGeometry(0.42, 0.62, hullD * 0.86)), darkBody);
    skirt.position.set(sx * (hullW / 2 + 0.16), 1.9, 0);
    skirt.castShadow = true;
    root.add(skirt);
  }

  // tracks
  const wheels = [];
  const trackW = 0.78;
  for (const sx of [-1, 1]) {
    const track = new THREE.Mesh(geo('track', () => new THREE.BoxGeometry(trackW, 1.35, hullD + 0.5)), trackMat);
    track.position.set(sx * (hullW / 2 + 0.42), 0.72, 0);
    track.castShadow = true;
    track.receiveShadow = true;
    root.add(track);

    for (let i = 0; i < 5; i++) {
      const w = new THREE.Mesh(geo('wheel', () => new THREE.CylinderGeometry(0.46, 0.46, trackW + 0.1, 10)), trackMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * (hullW / 2 + 0.42), 0.72, -hullD / 2 + 0.6 + i * (hullD - 1.2) / 4);
      w.castShadow = true;
      root.add(w);
      wheels.push(w);
    }
  }

  // headlights
  for (const sx of [-1, 1]) {
    const lamp = new THREE.Mesh(geo('lamp', () => new THREE.SphereGeometry(0.2, 8, 6)), mat('#ffe6a3', { emissive: 0x6b5518, metalness: 0.1, roughness: 0.4 }));
    lamp.position.set(sx * (hullW / 2 - 0.42), 1.5, hullD / 2 - 0.05);
    root.add(lamp);
  }

  // ---- turret ----
  const turretGroup = new THREE.Group();
  turretGroup.position.set(0, 2.28, -0.25);
  root.add(turretGroup);

  const tBase = new THREE.Mesh(geo('turretBase', () => new THREE.CylinderGeometry(1.32, 1.5, 0.85, 8)), turretMat);
  tBase.castShadow = true;
  turretGroup.add(tBase);

  const tShell = new THREE.Mesh(geo('turretShell', () => new THREE.BoxGeometry(2.0, 0.95, 2.5)), turretMat);
  tShell.position.set(0, 0.42, 0.15);
  tShell.castShadow = true;
  turretGroup.add(tShell);

  const tFront = new THREE.Mesh(geo('turretFront', () => new THREE.BoxGeometry(1.55, 0.8, 0.9)), turretMat);
  tFront.position.set(0, 0.42, 1.35);
  tFront.castShadow = true;
  turretGroup.add(tFront);

  const mantlet = new THREE.Mesh(geo('mantlet', () => new THREE.CylinderGeometry(0.44, 0.5, 0.7, 10)), mat('#4a4f57', { metalness: 0.5, roughness: 0.5 }));
  mantlet.rotation.x = Math.PI / 2;
  mantlet.position.set(0, 0.45, 1.62);
  turretGroup.add(mantlet);

  const barrelLen = kind === 'heavy' ? 4.4 : kind === 'scout' ? 2.9 : 3.6;
  const barrel = new THREE.Mesh(
    geo('barrel' + barrelLen, () => new THREE.CylinderGeometry(0.2, 0.24, barrelLen, 10)),
    mat('#454a52', { metalness: 0.55, roughness: 0.45 })
  );
  barrel.rotation.x = Math.PI / 2;
  const barrelZ = 1.75 + barrelLen / 2;
  barrel.position.set(0, 0.45, barrelZ);
  barrel.castShadow = true;
  turretGroup.add(barrel);

  const muzzleBrake = new THREE.Mesh(
    geo('brake', () => new THREE.CylinderGeometry(0.3, 0.3, 0.5, 10)),
    mat('#33373d', { metalness: 0.6, roughness: 0.4 })
  );
  muzzleBrake.rotation.x = Math.PI / 2;
  muzzleBrake.position.set(0, 0.45, 1.75 + barrelLen - 0.2);
  turretGroup.add(muzzleBrake);

  // hatch + antenna
  const hatch = new THREE.Mesh(geo('hatch', () => new THREE.CylinderGeometry(0.42, 0.42, 0.22, 10)), mat('#3d4149', { metalness: 0.4 }));
  hatch.position.set(-0.45, 0.95, -0.35);
  turretGroup.add(hatch);

  const antenna = new THREE.Mesh(geo('antenna', () => new THREE.CylinderGeometry(0.045, 0.045, 2.1, 5)), mat('#2b2e33'));
  antenna.position.set(0.72, 1.6, -0.75);
  antenna.rotation.z = 0.12;
  turretGroup.add(antenna);

  // muzzle anchor: local +Z is the barrel direction
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.45, 1.75 + barrelLen + 0.15);
  turretGroup.add(muzzle);

  root.userData = { turret: turretGroup, muzzle, wheels, kind, barrelZ };
  return root;
}

export function tankRadius(scale = 1) {
  return 2.05 * scale;
}
