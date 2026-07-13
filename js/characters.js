// ============================================================
// MOOSE RACER — the roster.
// Every kart and driver is hand-built from Three.js primitives
// with toon shading: one cohesive, vibrant cartoon world.
// ============================================================
import * as THREE from 'three';

// ---- shared toon gradient (4-step cel shading) ----
let _gradientMap = null;
export function toonGradient() {
  if (_gradientMap) return _gradientMap;
  const data = new Uint8Array([90, 150, 210, 255]);
  _gradientMap = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  _gradientMap.minFilter = THREE.NearestFilter;
  _gradientMap.magFilter = THREE.NearestFilter;
  _gradientMap.needsUpdate = true;
  return _gradientMap;
}

export function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...opts });
}

// small cached geometries
const G = {
  sphere: (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h),
  box: (x, y, z) => new THREE.BoxGeometry(x, y, z),
  cyl: (rt, rb, h, s = 14) => new THREE.CylinderGeometry(rt, rb, h, s),
  cone: (r, h, s = 12) => new THREE.ConeGeometry(r, h, s),
  torus: (r, t, s = 10, ts = 18) => new THREE.TorusGeometry(r, t, s, ts),
};

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

// ---- eyes: big cartoon eyes on any head ----
function addEyes(head, r, y, zForward, spacing, opts = {}) {
  const white = toon(0xffffff);
  const black = toon(0x1a1a1a);
  const size = opts.size || r * 0.28;
  for (const s of [-1, 1]) {
    const eye = mesh(G.sphere(size, 10, 8), white, s * spacing, y, zForward);
    const pupil = mesh(G.sphere(size * 0.5, 8, 6), black, 0, 0, size * 0.62);
    eye.add(pupil);
    head.add(eye);
  }
  if (opts.angry) {
    const browMat = toon(0x1a1a1a);
    for (const s of [-1, 1]) {
      const brow = mesh(G.box(size * 2.1, size * 0.45, size * 0.4), browMat, s * spacing, y + size * 1.15, zForward);
      brow.rotation.z = -s * 0.5;
      head.add(brow);
    }
  }
}

// chunky cartoon wheel: rounded tire, dished rim, five spokes, hub cap
function makeWheel(radius, width, rimColor) {
  const wheel = new THREE.Group();
  const spinner = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.66, radius * 0.36, 10, 18), toon(0x262630));
  tire.rotation.y = Math.PI / 2;
  const rim = mesh(G.cyl(radius * 0.6, radius * 0.6, width * 0.72, 14), toon(rimColor));
  rim.rotation.z = Math.PI / 2;
  const spokeMat = toon(0xe8ecf4);
  for (let i = 0; i < 5; i++) {
    const spoke = mesh(G.box(width * 0.5, radius * 1.02, radius * 0.16), spokeMat);
    spoke.rotation.x = (i / 5) * Math.PI * 2;
    spinner.add(spoke);
  }
  const cap = mesh(G.sphere(radius * 0.24, 10, 8), toon(0x33333d));
  cap.scale.x = 0.5;
  spinner.add(tire, rim, cap);
  wheel.add(spinner);
  return wheel;
}

// straight limb between two points (axis pre-rotated so lookAt works)
function limb(mat, x1, y1, z1, x2, y2, z2, r = 0.055) {
  const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
  const geo = new THREE.CylinderGeometry(r, r * 1.15, len, 7);
  geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  m.lookAt(x2, y2, z2);
  return m;
}

// ---- racing-number roundel decals (canvas textures) ----
const _roundelCache = new Map();
function roundelTexture(num, accent) {
  const key = `${num}-${accent}`;
  if (_roundelCache.has(key)) return _roundelCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.beginPath(); x.arc(64, 64, 60, 0, Math.PI * 2);
  x.fillStyle = '#fffdf7'; x.fill();
  x.lineWidth = 10;
  x.strokeStyle = '#' + accent.toString(16).padStart(6, '0');
  x.stroke();
  x.fillStyle = '#1b1440';
  x.font = '900 64px "Titan One", "Arial Black", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(String(num), 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  _roundelCache.set(key, tex);
  return tex;
}

function roundel(num, accent, size = 0.56) {
  const mat = new THREE.MeshBasicMaterial({ map: roundelTexture(num, accent), transparent: true });
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
}

// ---- soft accent underglow (classic kart-game ground pop) ----
let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

// current character being built — lets shared chassis code read number/colors
let _activeChar = null;

// ---- generic cartoon kart chassis; characters decorate on top ----
function makeStandardKart({ body, accent, rim = 0xf2f2f2, long = 2.4, wide = 1.5, nose = 'round' }) {
  const g = new THREE.Group();
  const bodyMat = toon(body);
  const accentMat = toon(accent);

  const tub = mesh(G.box(wide, 0.42, long), bodyMat, 0, 0.42, 0);
  const front = nose === 'round'
    ? mesh(G.sphere(wide * 0.48, 12, 10), bodyMat, 0, 0.46, -long / 2)
    : mesh(G.cone(wide * 0.44, 0.9, 4), bodyMat, 0, 0.46, -long / 2 - 0.25);
  if (nose !== 'round') { front.rotation.x = -Math.PI / 2; front.rotation.y = Math.PI / 4; }
  front.scale.y = 0.6;
  const seatBack = mesh(G.box(wide * 0.8, 0.55, 0.18), accentMat, 0, 0.85, long * 0.32);
  const bumper = mesh(G.box(wide * 1.05, 0.2, 0.22), accentMat, 0, 0.35, -long / 2 - 0.05);
  const stripe = mesh(G.box(wide * 0.35, 0.05, long * 0.96), accentMat, 0, 0.66, 0);
  const wheelHolder = new THREE.Group();
  const wheels = [];
  const wr = 0.34;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const w = makeWheel(wr, 0.26, rim);
    w.position.set(sx * (wide / 2 + 0.16), wr, sz * (long / 2 - 0.42));
    wheelHolder.add(w);
    wheels.push(w);
  }
  const steering = mesh(G.torus(0.16, 0.035, 8, 14), toon(0x333333), 0, 0.86, -0.35);
  steering.rotation.x = -Math.PI / 3;
  // darker lower skirt for depth, mirrors, exhaust — small details read as "finished"
  const skirt = mesh(G.box(wide * 1.04, 0.18, long * 0.96), toon(new THREE.Color(body).multiplyScalar(0.62).getHex()), 0, 0.2, 0);
  const mirrorMat = toon(0x2c2c36);
  for (const s of [-1, 1]) {
    const mirror = mesh(G.box(0.07, 0.1, 0.16), mirrorMat, s * (wide / 2 + 0.12), 0.72, -long * 0.28);
    const stalk = mesh(G.cyl(0.025, 0.025, 0.14, 5), mirrorMat, s * (wide / 2 + 0.05), 0.68, -long * 0.28);
    stalk.rotation.z = s * 1.1;
    g.add(mirror, stalk);
  }
  const exhaust = mesh(G.cyl(0.08, 0.1, 0.34, 8), toon(0x8a8a96), wide * 0.28, 0.32, long / 2 + 0.12);
  exhaust.rotation.x = Math.PI / 2;
  g.add(tub, front, seatBack, bumper, stripe, wheelHolder, steering, skirt, exhaust);
  // racing number: on the hood and on the seat back
  if (_activeChar) {
    const hoodNum = roundel(_activeChar.num, accent, 0.55);
    hoodNum.rotation.set(-Math.PI / 2, 0, Math.PI);
    hoodNum.position.set(0, 0.695, -long * 0.3);
    const rearNum = roundel(_activeChar.num, accent, 0.42);
    rearNum.position.set(0, 0.88, long * 0.32 + 0.1);
    g.add(hoodNum, rearNum);
  }
  return { group: g, wheels, bodyMat, accentMat, seatZ: long * 0.12 };
}

// ---- Moose's Porsche GT3 RS: electric blue × hot pink ----
function buildPorscheGT3RS() {
  const BLUE = 0x00c2ff, PINK = 0xff3ea5;
  const g = new THREE.Group();
  const blueMat = toon(BLUE);
  const pinkMat = toon(PINK);
  const darkGlass = toon(0x143050);

  // low wide body with sloping hood + fastback
  const body = mesh(G.box(1.6, 0.42, 3.4), blueMat, 0, 0.5, 0);
  const hood = mesh(G.box(1.5, 0.3, 1.2), blueMat, 0, 0.56, -1.35);
  hood.rotation.x = 0.09;
  const noseLip = mesh(G.box(1.66, 0.16, 0.5), pinkMat, 0, 0.34, -1.85);
  const cabin = mesh(G.box(1.25, 0.5, 1.5), darkGlass, 0, 0.92, 0.12);
  cabin.scale.set(1, 1, 1);
  const roof = mesh(G.box(1.15, 0.1, 1.3), blueMat, 0, 1.18, 0.12);
  const tail = mesh(G.box(1.58, 0.36, 0.7), blueMat, 0, 0.62, 1.55);
  // signature giant swan-neck rear wing (hot pink)
  const wingPlane = mesh(G.box(1.85, 0.07, 0.55), pinkMat, 0, 1.42, 1.75);
  wingPlane.rotation.x = -0.12;
  const strutL = mesh(G.box(0.08, 0.55, 0.3), pinkMat, -0.55, 1.12, 1.72);
  const strutR = mesh(G.box(0.08, 0.55, 0.3), pinkMat, 0.55, 1.12, 1.72);
  const endplateL = mesh(G.box(0.06, 0.28, 0.55), blueMat, -0.92, 1.46, 1.75);
  const endplateR = mesh(G.box(0.06, 0.28, 0.55), blueMat, 0.92, 1.46, 1.75);
  // racing stripes over the top
  const stripeC = mesh(G.box(0.34, 0.05, 3.42), pinkMat, 0, 0.74, 0);
  // headlights
  const hlMat = toon(0xfff6c0, { emissive: 0xfff2a8, emissiveIntensity: 0.7 });
  const hlL = mesh(G.sphere(0.14, 8, 6), hlMat, -0.55, 0.56, -1.92);
  const hlR = mesh(G.sphere(0.14, 8, 6), hlMat, 0.55, 0.56, -1.92);
  // side skirts + number roundel
  const skirtL = mesh(G.box(0.1, 0.14, 2.2), pinkMat, -0.84, 0.32, 0);
  const skirtR = mesh(G.box(0.1, 0.14, 2.2), pinkMat, 0.84, 0.32, 0);
  const hoodNum = roundel(1, PINK, 0.66);
  hoodNum.rotation.set(-Math.PI / 2 + 0.09, 0, Math.PI);
  hoodNum.position.set(0, 0.73, -1.1);
  const wingNum = roundel(1, BLUE, 0.4);
  wingNum.position.set(0, 0.78, 1.92);
  g.add(hoodNum, wingNum);
  const exhaustMat = toon(0x777788);
  const exL = mesh(G.cyl(0.09, 0.09, 0.3, 10), exhaustMat, -0.3, 0.4, 1.95);
  exL.rotation.x = Math.PI / 2;
  const exR = exL.clone(); exR.position.x = 0.3;

  const wheels = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const w = makeWheel(0.4, 0.34, PINK);
    w.position.set(sx * 0.88, 0.4, sz * 1.25);
    wheels.push(w);
    g.add(w);
  }
  g.add(body, hood, noseLip, cabin, roof, tail, wingPlane, strutL, strutR,
        endplateL, endplateR, stripeC, hlL, hlR, skirtL, skirtR, exL, exR);

  // Moose herself — pink helmet with tiny moose antlers, peeking from cockpit
  const driver = new THREE.Group();
  const helmet = mesh(G.sphere(0.3, 14, 12), pinkMat, 0, 1.28, 0.12);
  const visor = mesh(G.sphere(0.26, 10, 8), toon(0x9be8ff), 0, 1.3, -0.02);
  visor.scale.set(0.9, 0.55, 0.7);
  const antlerMat = toon(0xffd93d);
  for (const s of [-1, 1]) {
    const stalk = mesh(G.cyl(0.035, 0.05, 0.24, 6), antlerMat, s * 0.2, 1.52, 0.12);
    stalk.rotation.z = -s * 0.5;
    const paddle = mesh(G.sphere(0.1, 8, 6), antlerMat, s * 0.3, 1.62, 0.12);
    paddle.scale.set(1.4, 0.9, 0.5);
    driver.add(stalk, paddle);
  }
  driver.add(helmet, visor);
  g.add(driver);
  return { group: g, wheels, driver };
}

// ---- per-character driver figures for standard karts ----
function driverBase(skin, shirt, seatZ) {
  const d = new THREE.Group();
  const shirtMat = toon(shirt);
  const skinMat = toon(skin);
  const torso = mesh(G.sphere(0.34, 12, 10), shirtMat, 0, 0.85, seatZ);
  torso.scale.set(1, 1.15, 0.85);
  const head = mesh(G.sphere(0.3, 14, 12), skinMat, 0, 1.42, seatZ);
  // arms reaching the wheel + gloves — drivers should look like they're driving
  for (const s of [-1, 1]) {
    const arm = limb(shirtMat, s * 0.3, 1.04, seatZ, s * 0.14, 0.92, -0.26);
    const hand = mesh(G.sphere(0.075, 8, 6), skinMat, s * 0.14, 0.92, -0.3);
    d.add(arm, hand);
  }
  d.add(torso, head);
  return { d, head, seatZ };
}

const BUILDERS = {
  moose: () => buildPorscheGT3RS(),

  keagan: () => { // golden retriever in a tennis-ball buggy
    const k = makeStandardKart({ body: 0xf5d539, accent: 0x8bc53f, rim: 0xffffff });
    const { d, head, seatZ } = driverBase(0xe8b968, 0xd94f30, k.seatZ);
    // snout, nose, floppy ears, happy tongue
    const snout = mesh(G.sphere(0.16, 10, 8), toon(0xf3d9a4), 0, 1.32, seatZ - 0.26);
    snout.scale.set(1, 0.75, 1.1);
    const nose = mesh(G.sphere(0.07, 8, 6), toon(0x2a1a12), 0, 1.36, seatZ - 0.4);
    const tongue = mesh(G.box(0.1, 0.03, 0.18), toon(0xff7d9c), 0.06, 1.22, seatZ - 0.34);
    tongue.rotation.x = 0.5;
    const earMat = toon(0xc98f3d);
    for (const s of [-1, 1]) {
      const ear = mesh(G.sphere(0.13, 8, 6), earMat, s * 0.28, 1.5, seatZ);
      ear.scale.set(0.6, 1.5, 0.8);
      ear.rotation.z = s * 0.45;
      d.add(ear);
    }
    addEyes(head, 0.3, 0.08, -0.24, 0.12);
    // wagging tail!
    const tail = mesh(G.cyl(0.04, 0.09, 0.5, 8), earMat, 0, 0.75, k.seatZ + 0.75);
    tail.rotation.x = 0.9;
    tail.userData.wag = true;
    k.group.add(d, tail);
    return k;
  },

  bex: () => { // Bex the Rex — t-rex in a jungle jeep
    const k = makeStandardKart({ body: 0x37b04c, accent: 0xff8c1a, rim: 0xffd93d, long: 2.7, wide: 1.6 });
    const bodyMat = toon(0x4ecb60);
    const seatZ = k.seatZ;
    const d = new THREE.Group();
    const torso = mesh(G.sphere(0.4, 12, 10), bodyMat, 0, 0.9, seatZ);
    torso.scale.set(1, 1.2, 0.9);
    const head = mesh(G.box(0.5, 0.42, 0.72), bodyMat, 0, 1.55, seatZ - 0.1);
    const jaw = mesh(G.box(0.42, 0.16, 0.6), toon(0x2f9440), 0, 1.32, seatZ - 0.18);
    // teeth
    const toothMat = toon(0xffffff);
    for (let i = -2; i <= 2; i++) {
      const t = mesh(G.cone(0.035, 0.09, 5), toothMat, i * 0.09, 1.4, seatZ - 0.46);
      t.rotation.x = Math.PI;
      d.add(t);
    }
    addEyes(head, 0.42, 0.14, -0.3, 0.16, { size: 0.09 });
    // tiny arms — the crowd loves them
    for (const s of [-1, 1]) {
      const arm = mesh(G.cyl(0.05, 0.06, 0.26, 7), bodyMat, s * 0.4, 0.95, seatZ - 0.2);
      arm.rotation.x = -1.1;
      d.add(arm);
    }
    const tail = mesh(G.cone(0.16, 1.1, 8), bodyMat, 0, 0.7, seatZ + 0.95);
    tail.rotation.x = Math.PI / 2 + 0.35;
    // back spikes
    for (let i = 0; i < 3; i++) {
      const sp = mesh(G.cone(0.07, 0.16, 5), toon(0xff8c1a), 0, 1.25 - i * 0.18, seatZ + 0.25 + i * 0.16);
      d.add(sp);
    }
    d.add(torso, head, jaw, tail);
    k.group.add(d);
    return k;
  },

  matthew: () => { // Mathilda's brother — cobalt arrow speedster
    const k = makeStandardKart({ body: 0x2456e6, accent: 0xffd93d, rim: 0x2456e6, nose: 'arrow', long: 2.6 });
    const { d, head, seatZ } = driverBase(0xf0b98a, 0x2456e6, k.seatZ);
    const hair = mesh(G.sphere(0.31, 12, 10), toon(0x53331b), 0, 1.5, seatZ + 0.03);
    hair.scale.set(1, 0.7, 1);
    addEyes(head, 0.3, 0.05, -0.24, 0.12);
    const fin = mesh(G.box(0.08, 0.45, 0.7), toon(0xffd93d), 0, 1.05, k.seatZ + 0.6);
    d.add(hair);
    k.group.add(d, fin);
    return k;
  },

  theam: () => { // Theam Jnr — turbo-orange rocket kid
    const k = makeStandardKart({ body: 0xff6d1f, accent: 0x00c2ff, rim: 0xffffff, long: 2.3 });
    const { d, head, seatZ } = driverBase(0xd99a66, 0xffffff, k.seatZ);
    const cap = mesh(G.sphere(0.31, 12, 10), toon(0x00c2ff), 0, 1.5, seatZ);
    cap.scale.set(1, 0.6, 1);
    const brim = mesh(G.box(0.4, 0.05, 0.3), toon(0x00c2ff), 0, 1.47, seatZ - 0.34);
    addEyes(head, 0.3, 0.05, -0.24, 0.12);
    // twin rocket boosters
    for (const s of [-1, 1]) {
      const rocket = mesh(G.cyl(0.14, 0.18, 0.6, 10), toon(0xd8dce6), s * 0.45, 0.72, k.seatZ + 0.85);
      rocket.rotation.x = Math.PI / 2;
      const flame = mesh(G.cone(0.12, 0.3, 8), toon(0xffd93d, { emissive: 0xff8c1a, emissiveIntensity: 0.8 }), s * 0.45, 0.72, k.seatZ + 1.25);
      flame.rotation.x = -Math.PI / 2;
      flame.userData.flicker = true;
      k.group.add(rocket, flame);
    }
    d.add(cap, brim);
    k.group.add(d);
    return k;
  },

  david: () => { // King David lookalike — royal golden chariot
    const k = makeStandardKart({ body: 0x7031c9, accent: 0xffc933, rim: 0xffc933, long: 2.5 });
    const { d, head, seatZ } = driverBase(0xdda37a, 0x7031c9, k.seatZ);
    const goldMat = toon(0xffc933, { emissive: 0x664400, emissiveIntensity: 0.25 });
    // crown
    const crownBase = mesh(G.cyl(0.24, 0.26, 0.14, 10), goldMat, 0, 1.68, seatZ);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = mesh(G.cone(0.05, 0.14, 5), goldMat, Math.cos(a) * 0.21, 1.8, seatZ + Math.sin(a) * 0.21);
      d.add(spike);
    }
    const beard = mesh(G.sphere(0.2, 10, 8), toon(0x6b4423), 0, 1.26, seatZ - 0.18);
    beard.scale.set(1.1, 0.9, 0.7);
    addEyes(head, 0.3, 0.1, -0.24, 0.12);
    // harp on the back + laurel bumper
    const harp = mesh(G.torus(0.3, 0.05, 8, 16, Math.PI), goldMat, 0, 1.0, k.seatZ + 0.7);
    harp.rotation.y = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const str = mesh(G.cyl(0.008, 0.008, 0.5 - i * 0.09, 4), toon(0xffffff), 0, 0.95 - 0.02 * i, k.seatZ + 0.5 + i * 0.13);
      k.group.add(str);
    }
    d.add(crownBase, beard);
    k.group.add(d, harp);
    return k;
  },

  jesus: () => { // gentle, radiant, surprisingly quick
    const k = makeStandardKart({ body: 0xfffdf7, accent: 0xffd93d, rim: 0xffd93d, long: 2.5 });
    const { d, head, seatZ } = driverBase(0xd9a578, 0xfffdf7, k.seatZ);
    const hair = mesh(G.sphere(0.32, 12, 10), toon(0x5b3a1e), 0, 1.46, seatZ + 0.05);
    hair.scale.set(1.05, 1.1, 1.05);
    const face = mesh(G.sphere(0.26, 12, 10), toon(0xd9a578), 0, 1.44, seatZ - 0.08);
    const beard = mesh(G.sphere(0.18, 10, 8), toon(0x5b3a1e), 0, 1.28, seatZ - 0.16);
    beard.scale.set(1, 0.8, 0.7);
    addEyes(head, 0.3, 0.12, -0.22, 0.11);
    // glowing halo
    const halo = mesh(G.torus(0.3, 0.035, 8, 24), toon(0xffe97a, { emissive: 0xffdd55, emissiveIntensity: 1.4 }), 0, 1.85, seatZ);
    halo.rotation.x = Math.PI / 2.4;
    halo.userData.halo = true;
    // dove hood ornament
    const dove = new THREE.Group();
    const doveBody = mesh(G.sphere(0.1, 8, 6), toon(0xffffff), 0, 0, 0);
    doveBody.scale.set(0.8, 0.8, 1.4);
    for (const s of [-1, 1]) {
      const wing = mesh(G.box(0.24, 0.03, 0.12), toon(0xffffff), s * 0.14, 0.05, 0);
      wing.rotation.z = s * 0.5;
      dove.add(wing);
    }
    dove.add(doveBody);
    dove.position.set(0, 0.75, -k.seatZ * 0.5 - 1.35);
    d.add(hair, face, beard, halo);
    k.group.add(d, dove);
    return k;
  },

  angel: () => { // The Littlest Angel — cloud kart with real wings
    const k = makeStandardKart({ body: 0xcfeeff, accent: 0xffd6ef, rim: 0xffffff, long: 2.2, wide: 1.4 });
    const { d, head, seatZ } = driverBase(0xf6cfa4, 0xffffff, k.seatZ);
    const curls = mesh(G.sphere(0.3, 12, 10), toon(0xffe28a), 0, 1.5, seatZ);
    curls.scale.set(1.05, 0.75, 1.05);
    addEyes(head, 0.3, 0.06, -0.24, 0.12);
    const halo = mesh(G.torus(0.22, 0.03, 8, 20), toon(0xffe97a, { emissive: 0xffdd55, emissiveIntensity: 1.3 }), 0, 1.8, seatZ);
    halo.rotation.x = Math.PI / 2.3;
    halo.userData.halo = true;
    // feathered wings that flap
    const wingMat = toon(0xffffff);
    const wings = new THREE.Group();
    for (const s of [-1, 1]) {
      const w = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const feather = mesh(G.sphere(0.22 - i * 0.045, 8, 6), wingMat, s * (0.35 + i * 0.24), 1.05 + i * 0.14, seatZ + 0.25);
        feather.scale.set(1.6, 0.5, 0.5);
        feather.rotation.z = s * (0.35 + i * 0.18);
        w.add(feather);
      }
      w.userData.flapSide = s;
      wings.add(w);
    }
    wings.userData.wings = true;
    // cloud puffs around the kart
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const puff = mesh(G.sphere(0.2, 8, 6), toon(0xffffff), Math.cos(a) * 0.85, 0.3, Math.sin(a) * 1.1);
      puff.scale.y = 0.7;
      k.group.add(puff);
    }
    d.add(curls, halo);
    k.group.add(d, wings);
    return k;
  },

  gongyoo: () => { // Gong Yoo — midnight & rose-gold grand tourer, iced americano in hand
    const k = makeStandardKart({ body: 0x1d2035, accent: 0xe8a4b8, rim: 0xe8a4b8, long: 2.8, wide: 1.5 });
    const { d, head, seatZ } = driverBase(0xf0c8a0, 0x1d2035, k.seatZ);
    const hair = mesh(G.sphere(0.31, 12, 10), toon(0x181210), 0, 1.5, seatZ + 0.02);
    hair.scale.set(1.03, 0.85, 1.03);
    addEyes(head, 0.3, 0.06, -0.24, 0.11, { size: 0.07 });
    // long tan coat collar (Goblin vibes)
    const collar = mesh(G.box(0.55, 0.2, 0.4), toon(0xc8a878), 0, 1.12, seatZ);
    // iced americano cup holder
    const cup = mesh(G.cyl(0.07, 0.055, 0.16, 10), toon(0xf7f3ea), 0.42, 0.78, seatZ - 0.3);
    const coffee = mesh(G.cyl(0.06, 0.06, 0.03, 10), toon(0x6b3a1e), 0.42, 0.86, seatZ - 0.3);
    const straw = mesh(G.cyl(0.012, 0.012, 0.18, 6), toon(0xe8a4b8), 0.45, 0.95, seatZ - 0.3);
    straw.rotation.z = 0.2;
    // sleek GT canopy
    const canopy = mesh(G.sphere(0.55, 14, 10), toon(0x2b3050, { transparent: true, opacity: 0.55 }), 0, 0.95, seatZ - 0.15);
    canopy.scale.set(1.1, 0.7, 1.5);
    d.add(hair, collar);
    k.group.add(d, cup, coffee, straw, canopy);
    return k;
  },

  turtle: () => { // Penny the Pink Turtle — shell-domed slowpoke with a big heart
    const k = makeStandardKart({ body: 0xff8fc8, accent: 0xff3ea5, rim: 0xffffff, long: 2.2, wide: 1.6 });
    const seatZ = k.seatZ;
    const d = new THREE.Group();
    // big shell dome
    const shell = mesh(G.sphere(0.75, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xe0559e), 0, 0.55, seatZ);
    const shellRim = mesh(G.torus(0.72, 0.09, 8, 22), toon(0xff8fc8), 0, 0.58, seatZ);
    shellRim.rotation.x = Math.PI / 2;
    // hex spots
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spot = mesh(G.cyl(0.14, 0.14, 0.03, 6), toon(0xff9ed2), Math.cos(a) * 0.42, 1.02, seatZ + Math.sin(a) * 0.42);
      spot.lookAt(0, 2.4, seatZ);
      d.add(spot);
    }
    const head = mesh(G.sphere(0.26, 12, 10), toon(0xffb7dd), 0, 1.0, seatZ - 0.75);
    addEyes(head, 0.26, 0.08, -0.2, 0.1);
    const neck = mesh(G.cyl(0.12, 0.16, 0.4, 8), toon(0xffb7dd), 0, 0.8, seatZ - 0.6);
    neck.rotation.x = 0.5;
    d.add(shell, shellRim, head, neck);
    k.group.add(d);
    return k;
  },

  giraffe: () => { // Jozi the Yellow Giraffe — tallest racer on the grid
    const k = makeStandardKart({ body: 0xffd93d, accent: 0xc9711a, rim: 0xc9711a, long: 2.6, wide: 1.5 });
    const seatZ = k.seatZ;
    const d = new THREE.Group();
    const spotMat = toon(0xc9711a);
    const neck = mesh(G.cyl(0.16, 0.22, 1.5, 10), toon(0xffdf5e), 0, 1.45, seatZ);
    const head = mesh(G.sphere(0.24, 12, 10), toon(0xffdf5e), 0, 2.25, seatZ - 0.12);
    head.scale.set(0.9, 0.9, 1.25);
    const snout = mesh(G.sphere(0.14, 10, 8), toon(0xffefad), 0, 2.18, seatZ - 0.38);
    addEyes(head, 0.24, 0.1, -0.18, 0.11);
    // ossicones + ears
    for (const s of [-1, 1]) {
      const horn = mesh(G.cyl(0.03, 0.03, 0.18, 6), spotMat, s * 0.1, 2.48, seatZ - 0.1);
      const knob = mesh(G.sphere(0.05, 6, 5), spotMat, s * 0.1, 2.58, seatZ - 0.1);
      const ear = mesh(G.sphere(0.09, 8, 6), toon(0xffdf5e), s * 0.26, 2.32, seatZ - 0.05);
      ear.scale.set(1.4, 0.7, 0.5);
      d.add(horn, knob, ear);
    }
    // neck spots
    for (let i = 0; i < 5; i++) {
      const spot = mesh(G.sphere(0.07, 6, 5), spotMat,
        (i % 2 ? 0.12 : -0.12), 0.9 + i * 0.28, seatZ - 0.14);
      spot.scale.z = 0.4;
      d.add(spot);
    }
    d.userData.sway = true;
    d.add(neck, head, snout);
    k.group.add(d);
    return k;
  },

  satan: () => { // Satan — all menace, zero podiums. Guaranteed to lose.
    const k = makeStandardKart({ body: 0x8f0f1d, accent: 0x1a1a1a, rim: 0xff3b1f, long: 2.7, wide: 1.6, nose: 'arrow' });
    const { d, head, seatZ } = driverBase(0xc03028, 0x1a1a1a, k.seatZ);
    addEyes(head, 0.3, 0.08, -0.24, 0.12, { angry: true });
    const hornMat = toon(0x1a1a1a);
    for (const s of [-1, 1]) {
      const horn = mesh(G.cone(0.08, 0.32, 7), hornMat, s * 0.2, 1.72, seatZ);
      horn.rotation.z = -s * 0.4;
      d.add(horn);
    }
    const goatee = mesh(G.cone(0.07, 0.2, 6), hornMat, 0, 1.2, seatZ - 0.22);
    goatee.rotation.x = Math.PI;
    // pitchfork strapped to the back
    const forkPole = mesh(G.cyl(0.03, 0.03, 1.2, 6), hornMat, 0.5, 1.0, k.seatZ + 0.6);
    forkPole.rotation.x = 0.3;
    for (let i = -1; i <= 1; i++) {
      const tine = mesh(G.cone(0.03, 0.22, 5), toon(0xff3b1f), 0.5 + i * 0.1, 1.62, k.seatZ + 0.38);
      k.group.add(tine);
    }
    // spiky exhaust stacks with permanent engine trouble (smoke handled by particles)
    for (const s of [-1, 1]) {
      const stack = mesh(G.cyl(0.08, 0.11, 0.5, 8), toon(0x333333), s * 0.5, 0.85, k.seatZ + 0.7);
      const flame = mesh(G.cone(0.09, 0.24, 7), toon(0xff6a00, { emissive: 0xff3300, emissiveIntensity: 0.9 }), s * 0.5, 1.2, k.seatZ + 0.7);
      flame.userData.flicker = true;
      k.group.add(stack, flame);
    }
    // spikes on the hood
    for (let i = 0; i < 4; i++) {
      const sp = mesh(G.cone(0.07, 0.22, 5), hornMat, (i - 1.5) * 0.3, 0.62, -0.9);
      k.group.add(sp);
    }
    d.add(goatee, forkPole);
    k.group.add(d);
    return k;
  },
};

// ============================================================
// THE ROSTER
// stats 0..1 → speed / accel / handling. Satan is rigged to lose
// in ai.js no matter what the stats say. He knows. He seethes.
// ============================================================
export const CHARACTERS = [
  { id: 'moose', name: 'Moose', tag: 'Mathilda Oosthuizen', emoji: '🫎',
    color: 0x00c2ff, accent: 0xff3ea5, swatch: 'linear-gradient(90deg,#00c2ff,#ff3ea5)',
    blurb: 'Mathilda "Moose" Oosthuizen and her electric-blue & hot-pink Porsche GT3 RS. Born to win. GO TEAM!',
    stats: { speed: 0.95, accel: 0.85, handling: 0.9 } },
  { id: 'keagan', name: 'Keagan', tag: 'Golden Retriever', emoji: '🐕',
    color: 0xf5d539, accent: 0x8bc53f, swatch: 'linear-gradient(90deg,#f5d539,#8bc53f)',
    blurb: 'A very good boy in a tennis-ball buggy. Easily distracted by squirrels, devastating on the straights.',
    stats: { speed: 0.88, accel: 0.9, handling: 0.78 } },
  { id: 'bex', name: 'Bex the Rex', tag: 'T-Rex', emoji: '🦖',
    color: 0x37b04c, accent: 0xff8c1a, swatch: 'linear-gradient(90deg,#37b04c,#ff8c1a)',
    blurb: 'Sixty-five million years of rage in a jungle jeep. Arms too short to honk the horn.',
    stats: { speed: 0.92, accel: 0.7, handling: 0.72 } },
  { id: 'matthew', name: 'Matthew', tag: "Mathilda's Brother", emoji: '🏎️',
    color: 0x2456e6, accent: 0xffd93d, swatch: 'linear-gradient(90deg,#2456e6,#ffd93d)',
    blurb: 'The competitive brother. Studied every racing line. Still loses to his sister. Every time.',
    stats: { speed: 0.86, accel: 0.85, handling: 0.88 } },
  { id: 'theam', name: 'Theam Jnr', tag: "Mathilda's Brother", emoji: '🚀',
    color: 0xff6d1f, accent: 0x00c2ff, swatch: 'linear-gradient(90deg,#ff6d1f,#00c2ff)',
    blurb: 'Strapped two rockets to a go-kart and called it engineering. The youngest, the bravest, the loudest.',
    stats: { speed: 0.9, accel: 0.95, handling: 0.65 } },
  { id: 'david', name: 'David', tag: 'King & Brother', emoji: '👑',
    color: 0x7031c9, accent: 0xffc933, swatch: 'linear-gradient(90deg,#7031c9,#ffc933)',
    blurb: 'Slayed a giant, wrote the Psalms, drives a golden chariot-kart. Brings a harp to a car race.',
    stats: { speed: 0.84, accel: 0.8, handling: 0.86 } },
  { id: 'jesus', name: 'Jesus', tag: 'Literally Jesus', emoji: '✝️',
    color: 0xfffdf7, accent: 0xffd93d, swatch: 'linear-gradient(90deg,#fffdf7,#ffd93d)',
    blurb: 'Radiant, forgiving, and shockingly fast. Doesn\'t need the bridge over the water hazard.',
    stats: { speed: 0.93, accel: 0.88, handling: 0.95 } },
  { id: 'angel', name: 'Halo', tag: 'The Littlest Angel', emoji: '👼',
    color: 0xcfeeff, accent: 0xffd6ef, swatch: 'linear-gradient(90deg,#cfeeff,#ffd6ef)',
    blurb: 'Leader of the angel pit crew. Wings are technically not against the rules. Nobody checked.',
    stats: { speed: 0.8, accel: 0.92, handling: 0.9 } },
  { id: 'gongyoo', name: 'Gong Yoo', tag: '공유 · K-Drama Legend', emoji: '🧄',
    color: 0x1d2035, accent: 0xe8a4b8, swatch: 'linear-gradient(90deg,#1d2035,#e8a4b8)',
    blurb: 'Impossibly handsome, eternally composed. Drifts through corners without spilling his iced americano.',
    stats: { speed: 0.89, accel: 0.82, handling: 0.93 } },
  { id: 'turtle', name: 'Penny', tag: 'Pink Turtle', emoji: '🐢',
    color: 0xff8fc8, accent: 0xff3ea5, swatch: 'linear-gradient(90deg,#ff8fc8,#e0559e)',
    blurb: 'Slow? SLOW?! Penny has a shell-shaped kart and something to prove.',
    stats: { speed: 0.78, accel: 0.75, handling: 0.97 } },
  { id: 'giraffe', name: 'Jozi', tag: 'Yellow Giraffe', emoji: '🦒',
    color: 0xffd93d, accent: 0xc9711a, swatch: 'linear-gradient(90deg,#ffd93d,#c9711a)',
    blurb: 'Sees every corner three seconds before anyone else. Terrible in tunnels.',
    stats: { speed: 0.85, accel: 0.78, handling: 0.84 } },
  { id: 'satan', name: 'Satan', tag: 'Guaranteed Last Place', emoji: '😈',
    color: 0x8f0f1d, accent: 0xff3b1f, swatch: 'linear-gradient(90deg,#8f0f1d,#ff3b1f)',
    blurb: 'The Prince of Darkness. Cheats constantly. Loses anyway. Every race. Forever. It\'s the rules.',
    stats: { speed: 0.6, accel: 0.6, handling: 0.5 } },
];

CHARACTERS.forEach((c, i) => { c.num = i + 1; });

export function buildKartFor(charId) {
  const char = CHARACTERS.find(c => c.id === charId);
  _activeChar = char;
  const built = BUILDERS[charId]();
  _activeChar = null;
  // soft accent-coloured underglow anchors the kart to the road
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTexture(), color: char.accent, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.8), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  glow.renderOrder = 1;
  built.group.add(glow);
  built.group.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  glow.castShadow = false;
  return built;
}
