// ============================================================
// MOOSE RACER — 20 hand-designed circuits.
// Every course is a unique closed spline with its own elevation
// profile, colour palette, sky, fog, lighting and themed props.
// ============================================================
import * as THREE from 'three';
import { toon } from './characters.js';

// deterministic rng per track so scenery is stable
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- layout: closed non-intersecting harmonic loop ----
// r(θ) = R + Σ aᵢ·sin(kᵢθ + φᵢ),  y(θ) = Σ hᵢ·sin(mᵢθ + ψᵢ)
function harmonicLoop({ R = 110, waves = [], lift = [], points = 24 }) {
  const pts = [];
  for (let i = 0; i < points; i++) {
    const th = (i / points) * Math.PI * 2;
    let r = R, y = 0;
    for (const [a, k, ph] of waves) r += a * Math.sin(k * th + ph);
    for (const [h, m, ps] of lift) y += h * Math.sin(m * th + ps);
    pts.push(new THREE.Vector3(Math.cos(th) * r, Math.max(0.0, y), Math.sin(th) * r));
  }
  return pts;
}

// ============================================================
// PROP LIBRARY — reusable cartoon scenery pieces
// ============================================================
const P = {
  tree: (rng, c1 = 0x2f9e44, c2 = 0x7a4a21) => {
    const g = new THREE.Group();
    const h = 3 + rng() * 3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, h * 0.4, 7), toon(c2));
    trunk.position.y = h * 0.2;
    const fol = new THREE.Mesh(new THREE.SphereGeometry(h * 0.42, 9, 8), toon(c1));
    fol.position.y = h * 0.62; fol.scale.y = 1.25;
    g.add(trunk, fol);
    return g;
  },
  pine: (rng, c1 = 0x1e7a3c) => {
    const g = new THREE.Group();
    const h = 4 + rng() * 4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, h * 0.3, 6), toon(0x6b4423));
    trunk.position.y = h * 0.15;
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(h * 0.28 - i * h * 0.06, h * 0.35, 8), toon(c1));
      cone.position.y = h * (0.35 + i * 0.22);
      g.add(cone);
    }
    g.add(trunk);
    return g;
  },
  palm: (rng) => {
    const g = new THREE.Group();
    const h = 5 + rng() * 3;
    const lean = rng() * 0.25;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, h, 7), toon(0xa06a3a));
    trunk.position.y = h / 2; trunk.rotation.z = lean;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.SphereGeometry(1.6, 7, 5), toon(0x37b04c));
      frond.scale.set(1, 0.18, 0.35);
      frond.position.set(Math.cos(a) * 1.3 + lean * h, h - 0.2, Math.sin(a) * 1.3);
      frond.rotation.y = -a; frond.rotation.z = 0.35;
      g.add(frond);
    }
    return g;
  },
  candyCane: (rng, col = 0xff3355) => {
    const g = new THREE.Group();
    const h = 4 + rng() * 2.5;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, h, 8), toon(0xffffff));
    pole.position.y = h / 2;
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.3, 8, 12, Math.PI), toon(col));
    hook.position.y = h;
    for (let i = 0; i < Math.floor(h / 0.9); i++) {
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.4, 8), toon(col));
      stripe.position.y = 0.45 + i * 0.9;
      g.add(stripe);
    }
    g.add(pole, hook);
    return g;
  },
  lollipop: (rng, col) => {
    const g = new THREE.Group();
    const h = 3.5 + rng() * 2.5;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, h, 6), toon(0xffffff));
    stick.position.y = h / 2;
    const candy = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.4, 16), toon(col));
    candy.rotation.x = Math.PI / 2; candy.position.y = h + 1.1;
    const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.16, 6, 16), toon(0xffffff));
    swirl.position.y = h + 1.1; swirl.position.z = 0.22;
    g.add(stick, candy, swirl);
    return g;
  },
  cactus: (rng) => {
    const g = new THREE.Group();
    const h = 2.5 + rng() * 2;
    const mat = toon(0x3f9e4d);
    const main = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, h, 4, 8), mat);
    main.position.y = h / 2 + 0.5;
    g.add(main);
    for (const s of [-1, 1]) {
      if (rng() < 0.7) {
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1, 4, 8), mat);
        arm.position.set(s * 0.8, h * 0.55, 0);
        arm.rotation.z = -s * 0.6;
        g.add(arm);
      }
    }
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 6), toon(0xff3ea5));
    flower.position.y = h + 1.1;
    g.add(flower);
    return g;
  },
  mushroom: (rng, cap = 0xff4757) => {
    const g = new THREE.Group();
    const h = 1.6 + rng() * 3.4;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.22, h * 0.3, h, 9), toon(0xfff3e0));
    stem.position.y = h / 2;
    const capM = new THREE.Mesh(new THREE.SphereGeometry(h * 0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(cap));
    capM.position.y = h * 0.95;
    g.add(stem, capM);
    for (let i = 0; i < 4; i++) {
      const a = rng() * Math.PI * 2, rr = rng() * h * 0.4 + 0.1;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(h * 0.09, 6, 5), toon(0xffffff));
      dot.position.set(Math.cos(a) * rr, h * 1.02 + h * 0.18, Math.sin(a) * rr);
      g.add(dot);
    }
    return g;
  },
  crystal: (rng, col = 0x9c6bff) => {
    const g = new THREE.Group();
    const n = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const h = 1.5 + rng() * 3.5;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.4 + rng() * 0.4, h, 5),
        toon(col, { emissive: col, emissiveIntensity: 0.35, transparent: true, opacity: 0.9 }));
      c.position.set((rng() - 0.5) * 1.6, h / 2, (rng() - 0.5) * 1.6);
      c.rotation.z = (rng() - 0.5) * 0.5;
      g.add(c);
    }
    return g;
  },
  star: (rng, col = 0xfff173) => {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.5 + rng() * 0.6),
      toon(col, { emissive: col, emissiveIntensity: 1.2 }));
    s.position.y = 4 + rng() * 14;
    s.userData.anim = 'twinkle';
    s.userData.phase = rng() * Math.PI * 2;
    return s;
  },
  planet: (rng) => {
    const cols = [0xff8c5a, 0x7cc0ff, 0xd9a4ff, 0xffe28a, 0x8affc1];
    const g = new THREE.Group();
    const r = 2 + rng() * 4;
    const p = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), toon(cols[Math.floor(rng() * cols.length)]));
    g.add(p);
    if (rng() < 0.6) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.6, r * 0.12, 6, 24), toon(0xffe9b0));
      ring.rotation.x = Math.PI / 2.4;
      g.add(ring);
    }
    g.position.y = 10 + rng() * 22;
    g.userData.anim = 'spin';
    return g;
  },
  coral: (rng) => {
    const cols = [0xff6f91, 0xff9671, 0xffc75f, 0xf9f871, 0xd65db1];
    const g = new THREE.Group();
    const col = cols[Math.floor(rng() * cols.length)];
    for (let i = 0; i < 4 + rng() * 3; i++) {
      const h = 1 + rng() * 2.6;
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, h, 6), toon(col));
      branch.position.set((rng() - 0.5) * 1.4, h / 2, (rng() - 0.5) * 1.4);
      branch.rotation.z = (rng() - 0.5) * 0.8;
      branch.rotation.x = (rng() - 0.5) * 0.8;
      g.add(branch);
    }
    return g;
  },
  bubble: (rng) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.3 + rng() * 0.7, 10, 8),
      toon(0xbfefff, { transparent: true, opacity: 0.35 }));
    b.position.y = 1 + rng() * 12;
    b.userData.anim = 'rise';
    b.userData.phase = rng() * Math.PI * 2;
    return b;
  },
  pumpkin: (rng) => {
    const g = new THREE.Group();
    const r = 0.7 + rng() * 0.9;
    const body = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), toon(0xff7b1c));
    body.scale.y = 0.8; body.position.y = r * 0.8;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.4, 6), toon(0x3d7a2a));
    stem.position.y = r * 1.6;
    const eyeMat = toon(0xffe27a, { emissive: 0xffb821, emissiveIntensity: 1 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.ConeGeometry(0.14 * r / 0.9, 0.24 * r / 0.9, 3), eyeMat);
      eye.position.set(s * r * 0.4, r * 0.9, r * 0.82);
      g.add(eye);
    }
    g.add(body, stem);
    return g;
  },
  deadTree: (rng) => {
    const g = new THREE.Group();
    const mat = toon(0x3a2b3d);
    const h = 4 + rng() * 3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.5, h, 6), mat);
    trunk.position.y = h / 2;
    g.add(trunk);
    for (let i = 0; i < 4; i++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.15, h * 0.5, 5), mat);
      br.position.y = h * (0.55 + rng() * 0.35);
      br.rotation.z = (rng() - 0.5) * 2.2;
      br.rotation.y = rng() * Math.PI * 2;
      g.add(br);
    }
    return g;
  },
  cloudPuff: (rng) => {
    const g = new THREE.Group();
    const mat = toon(0xffffff, { transparent: true, opacity: 0.92 });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1 + rng() * 1.6, 9, 7), mat);
      s.position.set((rng() - 0.5) * 4, (rng() - 0.5) * 1, (rng() - 0.5) * 2.4);
      s.scale.y = 0.65;
      g.add(s);
    }
    g.position.y = rng() < 0.5 ? 0.4 : 5 + rng() * 12;
    g.userData.anim = 'drift';
    g.userData.phase = rng() * Math.PI * 2;
    return g;
  },
  column: (rng, col = 0xfff3d6) => {
    const g = new THREE.Group();
    const h = 5 + rng() * 3;
    const mat = toon(col);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, h, 12), mat);
    shaft.position.y = h / 2;
    const capTop = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 1.7), mat);
    capTop.position.y = h + 0.2;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 1.8), mat);
    base.position.y = 0.25;
    g.add(shaft, capTop, base);
    return g;
  },
  acacia: (rng) => {
    const g = new THREE.Group();
    const h = 4.5 + rng() * 2.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, h, 7), toon(0x6e4a2a));
    trunk.position.y = h / 2; trunk.rotation.z = (rng() - 0.5) * 0.2;
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(2.6 + rng(), 1.4, 0.9, 10), toon(0x5a8f3c));
    canopy.position.y = h + 0.3;
    g.add(trunk, canopy);
    return g;
  },
  tennisBall: (rng) => {
    const r = 0.8 + rng() * 1.4;
    const g = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), toon(0xd8f04a));
    ball.position.y = r;
    const seam = new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, r * 0.05, 6, 22), toon(0xffffff));
    seam.position.y = r; seam.rotation.x = Math.PI / 3; seam.rotation.y = rng() * 3;
    g.add(ball, seam);
    return g;
  },
  bone: (rng) => {
    const g = new THREE.Group();
    const mat = toon(0xfff8e8);
    const len = 1.6 + rng() * 1.4;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, len, 8), mat);
    shaft.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) {
      for (const o of [-0.18, 0.18]) {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), mat);
        knob.position.set(s * len / 2, o, 0);
        g.add(knob);
      }
    }
    g.add(shaft);
    g.position.y = 0.3;
    g.rotation.y = rng() * Math.PI;
    return g;
  },
  cherryTree: (rng) => {
    const g = new THREE.Group();
    const h = 3.5 + rng() * 2.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, h * 0.5, 7), toon(0x5c4033));
    trunk.position.y = h * 0.25;
    g.add(trunk);
    const pinks = [0xffb7d5, 0xff9ec6, 0xffd1e3];
    for (let i = 0; i < 3; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(h * 0.32, 9, 7), toon(pinks[i % 3]));
      puff.position.set((rng() - 0.5) * h * 0.5, h * 0.62 + (rng() - 0.4) * h * 0.25, (rng() - 0.5) * h * 0.5);
      g.add(puff);
    }
    return g;
  },
  lantern: (rng, col = 0xff5a5a) => {
    const g = new THREE.Group();
    const h = 3.4 + rng();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, h, 6), toon(0x333344));
    pole.position.y = h / 2;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8),
      toon(col, { emissive: col, emissiveIntensity: 1.1 }));
    lamp.position.y = h;
    lamp.scale.y = 1.25;
    g.add(pole, lamp);
    return g;
  },
  neonPylon: (rng) => {
    const cols = [0x00f0ff, 0xff2fd6, 0xaaff00, 0xffe600];
    const col = cols[Math.floor(rng() * cols.length)];
    const g = new THREE.Group();
    const h = 6 + rng() * 12;
    const bldg = new THREE.Mesh(new THREE.BoxGeometry(2.4 + rng() * 2.4, h, 2.4 + rng() * 2.4), toon(0x141b30));
    bldg.position.y = h / 2;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.25, h * 0.85, 0.25),
      toon(col, { emissive: col, emissiveIntensity: 1.6 }));
    strip.position.set(bldg.geometry.parameters.width / 2 + 0.05, h / 2, bldg.geometry.parameters.depth / 2 + 0.05);
    const roofGlow = new THREE.Mesh(new THREE.BoxGeometry(bldg.geometry.parameters.width * 0.9, 0.25, bldg.geometry.parameters.depth * 0.9),
      toon(col, { emissive: col, emissiveIntensity: 1.2 }));
    roofGlow.position.y = h + 0.15;
    g.add(bldg, strip, roofGlow);
    return g;
  },
  snowman: (rng) => {
    const g = new THREE.Group();
    const mat = toon(0xffffff);
    const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), mat); b1.position.y = 0.8;
    const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), mat); b2.position.y = 1.9;
    const b3 = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), mat); b3.position.y = 2.7;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 6), toon(0xff8c1a));
    nose.position.set(0, 2.7, 0.5); nose.rotation.x = Math.PI / 2;
    g.add(b1, b2, b3, nose);
    return g;
  },
  icicle: (rng) => {
    const g = new THREE.Group();
    const mat = toon(0xbfe8ff, { transparent: true, opacity: 0.85, emissive: 0x224466, emissiveIntensity: 0.3 });
    for (let i = 0; i < 3; i++) {
      const h = 2 + rng() * 4;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.5 + rng() * 0.4, h, 6), mat);
      spike.position.set((rng() - 0.5) * 1.6, h / 2, (rng() - 0.5) * 1.6);
      g.add(spike);
    }
    return g;
  },
  angelStatue: (rng) => {
    const g = new THREE.Group();
    const mat = toon(0xfff6e0);
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 8), mat); body.position.y = 1.3;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat); head.position.y = 2.35;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 6, 16),
      toon(0xffe97a, { emissive: 0xffdd55, emissiveIntensity: 1.2 }));
    halo.position.y = 2.75; halo.rotation.x = Math.PI / 2.2;
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), mat);
      wing.scale.set(0.25, 1, 0.5); wing.position.set(s * 0.6, 1.6, -0.2); wing.rotation.z = s * 0.4;
      g.add(wing);
    }
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.5, 10), mat);
    base.position.y = 0.25;
    g.add(body, head, halo, base);
    return g;
  },
  lavaRock: (rng) => {
    const g = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + rng() * 1.8), toon(0x2c1f26));
    rock.position.y = 0.8;
    rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    const glow = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + rng() * 0.5),
      toon(0xff5714, { emissive: 0xff3c00, emissiveIntensity: 1.4 }));
    glow.position.y = 0.6 + rng();
    g.add(rock, glow);
    return g;
  },
  balloon: (rng) => {
    const cols = [0xff3ea5, 0x00c2ff, 0xffd93d, 0x7cff6b, 0xb388ff];
    const g = new THREE.Group();
    const col = cols[Math.floor(rng() * cols.length)];
    const b = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 10), toon(col));
    b.scale.y = 1.2;
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), toon(0x8a5a2a));
    basket.position.y = -2;
    g.add(b, basket);
    g.position.y = 14 + rng() * 14;
    g.userData.anim = 'drift';
    g.userData.phase = rng() * Math.PI * 2;
    return g;
  },
};

// ============================================================
// THE 20 CIRCUITS
// ============================================================
export const TRACKS = [
  { id: 1, name: 'Moose Meadows', theme: 'Sunny Grasslands', seed: 101,
    tagline: 'Where it all began — rolling hills, big skies, zero mercy.',
    pal: { skyTop: 0x3ec7ff, skyBot: 0xbdf2ff, fog: 0xbdf2ff, ground: 0x6fd86a, road: 0x4a4a58, edge1: 0xff3ea5, edge2: 0xffffff, card: 'linear-gradient(160deg,#3ec7ff,#6fd86a)' },
    layout: { R: 105, waves: [[26, 3, 0.4], [10, 5, 2.1]], lift: [[3, 2, 0]], points: 26 },
    decor: [['tree', 90], ['cloudPuff', 26], ['balloon', 5]] },

  { id: 2, name: 'Tennis Ball Turnpike', theme: "Keagan's Backyard", seed: 202,
    tagline: 'Giant tennis balls. Buried bones. One very good boy.',
    pal: { skyTop: 0x57c8ff, skyBot: 0xfff0b8, fog: 0xfff0b8, ground: 0x8bc53f, road: 0x585048, edge1: 0xd8f04a, edge2: 0x2e2a24, card: 'linear-gradient(160deg,#d8f04a,#8bc53f)' },
    layout: { R: 100, waves: [[22, 2, 1.2], [14, 4, 0.2]], lift: [[2.5, 3, 1]], points: 24 },
    decor: [['tennisBall', 40], ['bone', 30], ['tree', 40]] },

  { id: 3, name: 'Candy Canyon', theme: 'Sugar Rush Valley', seed: 303,
    tagline: 'A river of strawberry milk runs through it. Do not lick the road.',
    pal: { skyTop: 0xff9ecf, skyBot: 0xffe3f2, fog: 0xffd7ec, ground: 0xffb7d5, road: 0x7c4a63, edge1: 0xff3355, edge2: 0xffffff, card: 'linear-gradient(160deg,#ff9ecf,#ffe3a0)' },
    layout: { R: 108, waves: [[30, 3, 2.5], [8, 7, 0]], lift: [[4, 2, 2]], points: 26 },
    decor: [['candyCane', 46], ['lollipop', 36], ['mushroom', 20]],
    lollipopCols: [0xff3ea5, 0x00c2ff, 0xffd93d, 0x7cff6b] },

  { id: 4, name: 'Turtle Bay', theme: 'Pink Sand Beach', seed: 404,
    tagline: "Penny's home turf. Slow and steady wins... nothing. Drive fast.",
    pal: { skyTop: 0x2fb9e8, skyBot: 0xffe9c9, fog: 0xffe9c9, ground: 0xffd4c2, road: 0x6b5340, edge1: 0xff8fc8, edge2: 0xfff6e0, card: 'linear-gradient(160deg,#2fb9e8,#ffd4c2)' },
    layout: { R: 98, waves: [[18, 2, 0], [16, 3, 1.4]], lift: [[2, 4, 0.5]], points: 24 },
    decor: [['palm', 60], ['tennisBall', 0], ['cloudPuff', 18]] },

  { id: 5, name: 'Mushroom Hollow', theme: 'Giant Fungus Forest', seed: 505,
    tagline: 'The mushrooms are enormous, the shortcuts are suspicious.',
    pal: { skyTop: 0x35754f, skyBot: 0xc9f2b8, fog: 0xb9e2a8, ground: 0x4d9950, road: 0x54445c, edge1: 0xff4757, edge2: 0xfff3e0, card: 'linear-gradient(160deg,#4d9950,#ff4757)' },
    layout: { R: 112, waves: [[24, 4, 0.8], [12, 2, 2.6]], lift: [[5, 3, 0]], points: 28 },
    decor: [['mushroom', 70], ['tree', 30], ['crystal', 12]] },

  { id: 6, name: 'Desert Dash', theme: 'Karoo Scorcher', seed: 606,
    tagline: 'Heat haze, cactus flowers and a horizon that never arrives.',
    pal: { skyTop: 0x3fa8f0, skyBot: 0xffd9a0, fog: 0xffd9a0, ground: 0xe8b36b, road: 0x5c4a3a, edge1: 0xff6d1f, edge2: 0xfff3d6, card: 'linear-gradient(160deg,#ffd9a0,#e8842a)' },
    layout: { R: 118, waves: [[34, 2, 0.6], [10, 5, 1.8]], lift: [[3, 2, 1]], points: 26 },
    decor: [['cactus', 70], ['lavaRock', 0], ['cloudPuff', 8]] },

  { id: 7, name: 'Cherry Blossom Circuit', theme: 'Seoul in Spring', seed: 707,
    tagline: "Gong Yoo's favourite. Petals in the air, drama in every corner.",
    pal: { skyTop: 0x9fb8ff, skyBot: 0xffe0ee, fog: 0xffdfee, ground: 0x8fce91, road: 0x4c4658, edge1: 0xff9ec6, edge2: 0xffffff, card: 'linear-gradient(160deg,#9fb8ff,#ffb7d5)' },
    layout: { R: 104, waves: [[20, 5, 0], [16, 2, 1.1]], lift: [[4, 3, 2.4]], points: 28 },
    decor: [['cherryTree', 70], ['lantern', 30]] },

  { id: 8, name: 'Jungle Rumble', theme: "Bex's Stomping Ground", seed: 808,
    tagline: 'Sixty-five million years in the making. Mind the ferns.',
    pal: { skyTop: 0x2d8f5e, skyBot: 0xd6f5a8, fog: 0xa8d98a, ground: 0x2f7a3c, road: 0x4f4438, edge1: 0xff8c1a, edge2: 0xffe28a, card: 'linear-gradient(160deg,#2d8f5e,#ff8c1a)' },
    layout: { R: 110, waves: [[28, 3, 1.9], [14, 6, 0.4]], lift: [[6, 2, 0.8]], points: 30 },
    decor: [['tree', 100], ['palm', 30], ['mushroom', 16]] },

  { id: 9, name: 'Frostbite Falls', theme: 'Snowglobe Alps', seed: 909,
    tagline: 'Fresh powder, frozen waterfalls and a suspicious number of snowmen.',
    pal: { skyTop: 0x7db8e8, skyBot: 0xeaf7ff, fog: 0xeaf7ff, ground: 0xf2fbff, road: 0x9db4c9, edge1: 0x00c2ff, edge2: 0xffffff, card: 'linear-gradient(160deg,#7db8e8,#f2fbff)' },
    layout: { R: 106, waves: [[22, 4, 2.2], [12, 3, 0]], lift: [[6, 2, 1.5]], points: 26 },
    decor: [['pine', 80], ['snowman', 14], ['icicle', 26]], snow: true },

  { id: 10, name: 'Sunset Boulevard', theme: 'Golden Hour Coast', seed: 1010,
    tagline: 'Palm silhouettes, tangerine skies, main-character energy.',
    pal: { skyTop: 0xff8a5c, skyBot: 0xffd36e, fog: 0xffc46e, ground: 0x9c6b8f, road: 0x3f2c4d, edge1: 0xffd93d, edge2: 0xff3ea5, card: 'linear-gradient(160deg,#ff8a5c,#ffd36e)' },
    layout: { R: 114, waves: [[26, 2, 2.8], [12, 4, 1.3]], lift: [[3, 3, 0.6]], points: 26 },
    decor: [['palm', 70], ['lantern', 24], ['balloon', 4]], lanternCol: 0xffd93d },

  { id: 11, name: 'Neon Nights', theme: 'Midnight Mega-City', seed: 1111,
    tagline: 'The city never sleeps. Neither do the drift sparks.',
    pal: { skyTop: 0x0a0a2e, skyBot: 0x2b1157, fog: 0x1a0e3d, ground: 0x131328, road: 0x1c1c34, edge1: 0x00f0ff, edge2: 0xff2fd6, glowRoad: true, card: 'linear-gradient(160deg,#0a0a2e,#ff2fd6)' },
    layout: { R: 108, waves: [[24, 5, 1.7], [14, 3, 0.2]], lift: [[5, 4, 2]], points: 30 },
    decor: [['neonPylon', 70], ['lantern', 20]], lanternCol: 0x00f0ff, night: true },

  { id: 12, name: 'Safari Sunrise', theme: 'Giraffe Savanna', seed: 1212,
    tagline: "Jozi's homeland. Acacia trees and endless amber light.",
    pal: { skyTop: 0xffa63e, skyBot: 0xffe6b8, fog: 0xffe0a8, ground: 0xd6a750, road: 0x5e4a36, edge1: 0xc9711a, edge2: 0xffe28a, card: 'linear-gradient(160deg,#ffa63e,#d6a750)' },
    layout: { R: 116, waves: [[30, 3, 0], [10, 2, 1.9]], lift: [[2.5, 2, 0]], points: 26 },
    decor: [['acacia', 60], ['lavaRock', 12], ['cloudPuff', 10]] },

  { id: 13, name: 'Bubble Reef', theme: 'Under-the-Sea(ish)', seed: 1313,
    tagline: 'Technically underwater. Legally questionable. Extremely beautiful.',
    pal: { skyTop: 0x0e5f8f, skyBot: 0x36c3c9, fog: 0x2fa8b8, ground: 0x2a8f96, road: 0x274a63, edge1: 0xff6f91, edge2: 0xf9f871, card: 'linear-gradient(160deg,#0e5f8f,#36c3c9)' },
    layout: { R: 102, waves: [[22, 6, 0.9], [12, 2, 2.2]], lift: [[4, 3, 1.2]], points: 28 },
    decor: [['coral', 80], ['bubble', 50], ['crystal', 10]], crystalCol: 0x54e8d8 },

  { id: 14, name: 'Aurora Alps', theme: 'Northern Lights', seed: 1414,
    tagline: 'Race beneath a sky on fire — green and violet ribbons all the way.',
    pal: { skyTop: 0x0b1c3d, skyBot: 0x1f4d5e, fog: 0x14304a, ground: 0xdceeff, road: 0x2c3a52, edge1: 0x7cffc1, edge2: 0xb388ff, glowRoad: true, card: 'linear-gradient(160deg,#0b1c3d,#7cffc1)' },
    layout: { R: 110, waves: [[26, 4, 0.3], [10, 7, 1.5]], lift: [[7, 2, 0.4]], points: 28 },
    decor: [['pine', 60], ['icicle', 30], ['star', 40]], snow: true, night: true, aurora: true },

  { id: 15, name: 'Volcano Vortex', theme: 'Mount Kaboom', seed: 1515,
    tagline: 'The floor is lava. The scenery is lava. Everything is lava.',
    pal: { skyTop: 0x2b1014, skyBot: 0xa8341c, fog: 0x521c14, ground: 0x1f1418, road: 0x3a2c30, edge1: 0xff5714, edge2: 0xffd93d, glowRoad: true, card: 'linear-gradient(160deg,#2b1014,#ff5714)' },
    layout: { R: 106, waves: [[24, 3, 2.0], [14, 5, 0.7]], lift: [[8, 2, 2.6]], points: 28 },
    decor: [['lavaRock', 70], ['deadTree', 20], ['crystal', 14]], crystalCol: 0xff5714, night: true },

  { id: 16, name: 'Haunted Hollow', theme: "Satan's Home Track", seed: 1616,
    tagline: 'Home-field advantage has never mattered less. He still loses here.',
    pal: { skyTop: 0x191024, skyBot: 0x4a2158, fog: 0x2e1638, ground: 0x2a1f33, road: 0x352b42, edge1: 0xff7b1c, edge2: 0x9c6bff, glowRoad: true, card: 'linear-gradient(160deg,#191024,#9c6bff)' },
    layout: { R: 112, waves: [[28, 5, 2.9], [12, 2, 0.6]], lift: [[5, 3, 1.8]], points: 30 },
    decor: [['deadTree', 60], ['pumpkin', 40], ['crystal', 16]], crystalCol: 0x9c6bff, night: true },

  { id: 17, name: 'Jordan River Rally', theme: 'Ancient Kingdoms', seed: 1717,
    tagline: "David's golden columns line the royal road. Harp music optional.",
    pal: { skyTop: 0x4fa3e8, skyBot: 0xffeccb, fog: 0xffe8c4, ground: 0xd9c08a, road: 0x8a7350, edge1: 0xffc933, edge2: 0x7031c9, card: 'linear-gradient(160deg,#4fa3e8,#ffc933)' },
    layout: { R: 108, waves: [[22, 2, 0.5], [18, 4, 2.4]], lift: [[3.5, 3, 0.9]], points: 26 },
    decor: [['column', 46], ['palm', 40], ['angelStatue', 10]] },

  { id: 18, name: "Heaven's Highway", theme: 'Cloud Kingdom', seed: 1818,
    tagline: 'A road paved on clouds. Angels cheer from the guardrails.',
    pal: { skyTop: 0x8fd0ff, skyBot: 0xfff4d6, fog: 0xfff4d6, ground: 0xf4faff, road: 0xe8ddc0, edge1: 0xffd93d, edge2: 0xffffff, card: 'linear-gradient(160deg,#8fd0ff,#fff4d6)' },
    layout: { R: 110, waves: [[26, 4, 1.1], [10, 6, 0]], lift: [[9, 2, 0.2], [3, 5, 1]], points: 30 },
    decor: [['cloudPuff', 60], ['angelStatue', 24], ['column', 16]], columnCol: 0xfff6e0 },

  { id: 19, name: 'Space Station Zero', theme: 'Orbital Gauntlet', seed: 1919,
    tagline: 'Gravity is a suggestion. The view is non-negotiable.',
    pal: { skyTop: 0x02010f, skyBot: 0x171040, fog: 0x0a0722, ground: 0x11112b, road: 0x23233f, edge1: 0x7cff6b, edge2: 0x00c2ff, glowRoad: true, card: 'linear-gradient(160deg,#02010f,#00c2ff)' },
    layout: { R: 114, waves: [[26, 5, 0.8], [16, 3, 2.7]], lift: [[10, 2, 1.4], [4, 4, 0]], points: 30 },
    decor: [['star', 90], ['planet', 12], ['crystal', 14]], crystalCol: 0x00f0ff, night: true, space: true },

  { id: 20, name: 'GO TEAM Galaxy', theme: 'The Rainbow Finale', seed: 2020,
    tagline: 'The final circuit. A rainbow ribbon through the stars. GO TEAM!',
    pal: { skyTop: 0x050214, skyBot: 0x2a0a4a, fog: 0x120826, ground: 0x0a0618, road: 0xffffff, edge1: 0xffffff, edge2: 0xffffff, rainbow: true, glowRoad: true, card: 'linear-gradient(90deg,#ff3ea5,#ffd93d,#7cff6b,#00c2ff,#b388ff)' },
    layout: { R: 120, waves: [[30, 3, 1.0], [16, 5, 2.2], [8, 7, 0.5]], lift: [[12, 2, 0], [5, 3, 2.1]], points: 32 },
    decor: [['star', 120], ['planet', 16], ['balloon', 6]], night: true, space: true },
];

// ============================================================
// TRACK CONSTRUCTION
// ============================================================
export const ROAD_HALF_WIDTH = 7;
const SAMPLES = 700;

export function buildTrack(def, scene) {
  const rng = mulberry32(def.seed);
  const pts = harmonicLoop(def.layout);
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.6);

  // dense samples: position + tangent + lateral for physics, AI, minimap
  const samples = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / SAMPLES;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const lat = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    samples.push({ p, tan, lat, t });
  }
  const length = curve.getLength();

  // ---- road ribbon with vertex colours ----
  const W = ROAD_HALF_WIDTH;
  const verts = [], cols = [], idx = [];
  const cRoad = new THREE.Color(def.pal.road);
  const cE1 = new THREE.Color(def.pal.edge1);
  const cE2 = new THREE.Color(def.pal.edge2);
  const tmp = new THREE.Color();
  for (let i = 0; i <= SAMPLES; i++) {
    const s = samples[i % SAMPLES];
    let inner = cRoad;
    if (def.pal.rainbow) {
      tmp.setHSL((i / SAMPLES * 5) % 1, 0.85, 0.55);
      inner = tmp;
    }
    const edge = (Math.floor(i / 6) % 2 === 0) ? cE1 : cE2;
    // 4 verts across: edgeL, roadL, roadR, edgeR
    const positions = [-W - 1.1, -W + 0.4, W - 0.4, W + 1.1];
    for (let j = 0; j < 4; j++) {
      const off = positions[j];
      verts.push(s.p.x + s.lat.x * off, s.p.y + 0.02 + (j === 0 || j === 3 ? 0.06 : 0), s.p.z + s.lat.z * off);
      const c = (j === 0 || j === 3) ? edge : inner;
      cols.push(c.r, c.g, c.b);
    }
    if (i < SAMPLES) {
      const a = i * 4, b = (i + 1) * 4;
      for (let j = 0; j < 3; j++) {
        idx.push(a + j, a + j + 1, b + j, a + j + 1, b + j + 1, b + j);
      }
    }
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  roadGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  roadGeo.setIndex(idx);
  roadGeo.computeVertexNormals();
  const roadMat = new THREE.MeshToonMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    emissive: def.pal.glowRoad ? 0x222233 : 0x000000,
    emissiveIntensity: def.pal.glowRoad ? 1 : 0,
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  scene.add(road);

  // ---- start line: checkerboard ----
  const startGroup = new THREE.Group();
  const s0 = samples[0];
  const white = toon(0xffffff), black = toon(0x1a1a1a);
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 8; i++) {
      const sq = new THREE.Mesh(new THREE.BoxGeometry(W * 2 / 8, 0.06, 1), (i + row) % 2 ? white : black);
      const off = -W + (i + 0.5) * (W * 2 / 8);
      sq.position.set(
        s0.p.x + s0.lat.x * off + s0.tan.x * row,
        s0.p.y + 0.05,
        s0.p.z + s0.lat.z * off + s0.tan.z * row);
      startGroup.add(sq);
    }
  }
  // start arch
  const archMat = toon(def.pal.edge1, { emissive: def.pal.edge1, emissiveIntensity: 0.4 });
  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 9, 10), archMat);
    pole.position.set(s0.p.x + s0.lat.x * side * (W + 2), s0.p.y + 4.5, s0.p.z + s0.lat.z * side * (W + 2));
    startGroup.add(pole);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 5, 1.6, 0.4), toon(def.pal.edge2, { emissive: def.pal.edge2, emissiveIntensity: 0.25 }));
  banner.position.set(s0.p.x, s0.p.y + 9, s0.p.z);
  banner.lookAt(s0.p.x + s0.tan.x, s0.p.y + 9, s0.p.z + s0.tan.z);
  startGroup.add(banner);
  scene.add(startGroup);

  // ---- boost pads ----
  const boostPads = [];
  const padCount = 5;
  const padMat = new THREE.MeshToonMaterial({ color: 0x00e5ff, emissive: 0x00c2ff, emissiveIntensity: 1.5, transparent: true, opacity: 0.92 });
  for (let i = 1; i <= padCount; i++) {
    const si = Math.floor((i / (padCount + 1)) * SAMPLES);
    const s = samples[si];
    const side = (i % 2 ? 1 : -1) * W * 0.4;
    const pad = new THREE.Group();
    for (let c = 0; c < 3; c++) {
      const chev = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.6, 3), padMat);
      chev.rotation.x = -Math.PI / 2;
      chev.rotation.z = Math.PI;
      chev.position.set(0, 0.06 + c * 0.001, -c * 1.4);
      pad.add(chev);
    }
    pad.position.set(s.p.x + s.lat.x * side, s.p.y + 0.05, s.p.z + s.lat.z * side);
    pad.lookAt(s.p.x + s.lat.x * side - s.tan.x, s.p.y + 0.05, s.p.z + s.lat.z * side - s.tan.z);
    pad.userData.si = si;
    pad.userData.side = side;
    scene.add(pad);
    boostPads.push({ si, side, mesh: pad });
  }

  // ---- ground ----
  if (!def.space) {
    const groundGeo = new THREE.CircleGeometry(420, 48);
    const ground = new THREE.Mesh(groundGeo, toon(def.pal.ground));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.25;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // ---- sky dome (gradient shader) ----
  const skyGeo = new THREE.SphereGeometry(900, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(def.pal.skyTop) },
      bot: { value: new THREE.Color(def.pal.skyBot) },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bot;
      void main(){ float h = normalize(vP).y * .5 + .5; gl_FragColor = vec4(mix(bot, top, smoothstep(.05,.65,h)), 1.0); }`,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // aurora ribbons
  const animatedProps = [];
  if (def.aurora) {
    for (let i = 0; i < 3; i++) {
      const ribbonGeo = new THREE.PlaneGeometry(600, 40, 40, 1);
      const ribbonMat = new THREE.MeshBasicMaterial({
        color: i % 2 ? 0x7cffc1 : 0xb388ff, transparent: true, opacity: 0.16,
        side: THREE.DoubleSide, depthWrite: false,
      });
      const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
      ribbon.position.set(0, 120 + i * 30, -120 + i * 90);
      ribbon.rotation.x = 0.4;
      ribbon.userData.anim = 'aurora';
      ribbon.userData.phase = i * 2.1;
      scene.add(ribbon);
      animatedProps.push(ribbon);
    }
  }

  // ---- fog & lights ----
  scene.fog = new THREE.Fog(def.pal.fog, def.night ? 90 : 140, def.night ? 420 : 620);
  const hemi = new THREE.HemisphereLight(def.pal.skyTop, def.pal.ground, def.night ? 0.55 : 0.95);
  const sun = new THREE.DirectionalLight(def.night ? 0xaab8ff : 0xfff4d6, def.night ? 0.7 : 1.35);
  sun.position.set(120, 180, 80);
  const amb = new THREE.AmbientLight(0xffffff, def.night ? 0.32 : 0.42);
  scene.add(hemi, sun, amb);

  // ---- decorations ----
  const propColArgs = {
    lollipop: def.lollipopCols,
    crystal: def.crystalCol ? [def.crystalCol] : null,
    lantern: def.lanternCol ? [def.lanternCol] : null,
    column: def.columnCol ? [def.columnCol] : null,
  };
  const minR = 0, maxR = 260;
  for (const [type, count] of def.decor) {
    for (let i = 0; i < count; i++) {
      // rejection-sample a spot clear of the road
      let x, z, ok = false, tries = 0;
      while (!ok && tries++ < 12) {
        const a = rng() * Math.PI * 2;
        const rr = minR + Math.sqrt(rng()) * maxR;
        x = Math.cos(a) * rr; z = Math.sin(a) * rr;
        ok = true;
        // cheap clearance test against every 8th sample
        for (let sIdx = 0; sIdx < SAMPLES; sIdx += 8) {
          const sp = samples[sIdx].p;
          const dx = sp.x - x, dz = sp.z - z;
          if (dx * dx + dz * dz < (W + 5) * (W + 5)) { ok = false; break; }
        }
      }
      if (!ok) continue;
      let prop;
      const colArr = propColArgs[type];
      if (colArr) prop = P[type](rng, colArr[Math.floor(rng() * colArr.length)]);
      else prop = P[type](rng);
      prop.position.x = x; prop.position.z = z;
      prop.rotation.y = rng() * Math.PI * 2;
      const sc = 0.8 + rng() * 0.6;
      prop.scale.multiplyScalar(sc);
      scene.add(prop);
      prop.traverse(o => { if (o.userData.anim) animatedProps.push(o); });
      if (prop.userData.anim) animatedProps.push(prop);
    }
  }

  // snow / petals particle field
  let weather = null;
  if (def.snow || def.id === 7) {
    const n = 600;
    const wGeo = new THREE.BufferGeometry();
    const wPos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      wPos[i * 3] = (rng() - 0.5) * 500;
      wPos[i * 3 + 1] = rng() * 60;
      wPos[i * 3 + 2] = (rng() - 0.5) * 500;
    }
    wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
    const wMat = new THREE.PointsMaterial({
      color: def.snow ? 0xffffff : 0xffb7d5, size: def.snow ? 0.55 : 0.75,
      transparent: true, opacity: 0.9, depthWrite: false,
    });
    weather = new THREE.Points(wGeo, wMat);
    scene.add(weather);
  }

  // ---- start grid: 12 slots behind the line ----
  const startPositions = [];
  for (let i = 0; i < 12; i++) {
    const back = 6 + Math.floor(i / 2) * 5.2;
    const side = (i % 2 === 0 ? -1 : 1) * W * 0.42;
    const si = (SAMPLES - Math.floor(back / (length / SAMPLES)) + SAMPLES) % SAMPLES;
    const s = samples[si];
    startPositions.push({
      pos: new THREE.Vector3(s.p.x + s.lat.x * side, s.p.y, s.p.z + s.lat.z * side),
      heading: Math.atan2(s.tan.x, s.tan.z),
      si,
    });
  }

  return { def, curve, samples, length, halfWidth: W, boostPads, startPositions, animatedProps, weather, SAMPLES };
}
