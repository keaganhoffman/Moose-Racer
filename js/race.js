// ============================================================
// MOOSE RACER — the race engine.
// Arcade kart physics, drift-to-boost, rubber-band AI,
// and the sacred rule: Satan always loses.
// ============================================================
import * as THREE from 'three';
import { CHARACTERS, buildKartFor } from './characters.js';
import { buildTrack, ROAD_HALF_WIDTH } from './tracks.js';
import { SFX, startEngine, setEngine, stopEngine, startMusic, stopMusic } from './audio.js';
import { getEnv } from './env.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';

const LAPS = 5;
const BASE_SPEED = 46;          // world units / s at speed stat 1.0
const KART_RADIUS = 1.7;

const $ = id => document.getElementById(id);

function fmtTime(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const t = Math.floor((ms % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${t}`;
}
const SUFFIX = ['st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th', 'th', 'th', 'th'];

// ---- tiny pooled particle system ----
class Particles {
  constructor(scene, count = 400) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.count = count;
    this.cursor = 0;
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    // soft round sprite so particles read as puffs, not squares
    const pc = document.createElement('canvas');
    pc.width = pc.height = 64;
    const px = pc.getContext('2d');
    const pg = px.createRadialGradient(32, 32, 2, 32, 32, 30);
    pg.addColorStop(0, 'rgba(255,255,255,1)');
    pg.addColorStop(0.6, 'rgba(255,255,255,.55)');
    pg.addColorStop(1, 'rgba(255,255,255,0)');
    px.fillStyle = pg; px.fillRect(0, 0, 64, 64);
    const mat = new THREE.PointsMaterial({
      size: 0.6, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
      map: new THREE.CanvasTexture(pc), alphaTest: 0.02,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  spawn(p, v, color, life = 0.6) {
    const i = this.cursor = (this.cursor + 1) % this.count;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    const c = new THREE.Color(color);
    this.col.set([c.r, c.g, c.b], i * 3);
    this.life[i] = life;
  }
  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.life[i] -= dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= 6 * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// persistent rubber laid down while drifting — the track remembers your laps
class SkidMarks {
  constructor(scene, maxSegs = 700) {
    this.max = maxSegs;
    this.cursor = 0;
    this.prev = null;
    const geo = new THREE.BufferGeometry();
    this.posArr = new Float32Array(maxSegs * 4 * 3).fill(-999);
    const idx = new Uint32Array(maxSegs * 6);
    for (let s = 0; s < maxSegs; s++) {
      const b = s * 4, o = s * 6;
      idx[o] = b; idx[o + 1] = b + 2; idx[o + 2] = b + 1;
      idx[o + 3] = b + 1; idx[o + 4] = b + 2; idx[o + 5] = b + 3;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0x14141c, transparent: true, opacity: 0.38,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  add(l, r) {
    if (this.prev) {
      const b = this.cursor * 12;
      this.posArr.set([this.prev[0].x, this.prev[0].y, this.prev[0].z,
                       this.prev[1].x, this.prev[1].y, this.prev[1].z,
                       l.x, l.y, l.z, r.x, r.y, r.z], b);
      this.cursor = (this.cursor + 1) % this.max;
      this.mesh.geometry.attributes.position.needsUpdate = true;
    }
    this.prev = [l.clone(), r.clone()];
  }
  break() { this.prev = null; }
}

export class Race {
  constructor({ renderer, trackDef, playerCharId, onFinish, onQuitToMenu }) {
    this.renderer = renderer;
    this.trackDef = trackDef;
    this.playerCharId = playerCharId;
    this.onFinish = onFinish;
    this.onQuitToMenu = onQuitToMenu;
    this.disposed = false;
    this.paused = false;

    this.scene = new THREE.Scene();
    this.scene.environment = getEnv();
    this.camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 2000);
    this.track = buildTrack(trackDef, this.scene);
    this.particles = new Particles(this.scene);
    this.skids = new SkidMarks(this.scene);

    // post-processing: bloom makes neon, halos and flames actually glow
    const rt = new THREE.WebGLRenderTarget(2, 2, { samples: 4, type: THREE.HalfFloatType });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(renderer.getPixelRatio());
    this.composer.setSize(innerWidth, innerHeight);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight),
      trackDef.night ? 0.5 : 0.4, 0.5, trackDef.night ? 0.72 : 1.05);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.raceTime = 0;
    this.state = 'countdown'; // countdown | racing | finished
    this.countdownStep = 4;
    this.countdownTimer = 0.4;
    this.toastQueue = [];

    this._buildKarts();
    this._buildLeaderboard();
    this._bindInput();

    this.minimapCtx = $('minimap').getContext('2d');
    this._precomputeMinimap();

    $('hud-trackname').textContent = trackDef.name;
    $('hud-lap').textContent = `LAP 1/${LAPS}`;
    startMusic(trackDef.seed, trackDef.night ? 128 : 140);
    startEngine();
    this._loop = this._loop.bind(this);
    window.__MOOSE__ = this; // debug/testing handle
    requestAnimationFrame(this._loop);
  }

  _buildKarts() {
    const { startPositions } = this.track;
    this.karts = [];
    // player starts near the back — earn that podium!
    const gridOrder = CHARACTERS.filter(c => c.id !== this.playerCharId).map(c => c.id);
    gridOrder.splice(7, 0, this.playerCharId);
    gridOrder.forEach((id, i) => {
      const char = CHARACTERS.find(c => c.id === id);
      const built = buildKartFor(id);
      const slot = startPositions[i];
      built.group.position.copy(slot.pos);
      // models are built nose-toward--Z; movement heading points toward +Z at 0,
      // so the mesh needs a half-turn to face its direction of travel
      built.group.rotation.order = 'YXZ';
      built.group.rotation.y = slot.heading + Math.PI;
      this.scene.add(built.group);
      const kart = {
        id, char, built, isPlayer: id === this.playerCharId,
        pos: slot.pos.clone(), heading: slot.heading,
        speed: 0, steer: 0, driftYaw: 0,
        si: slot.si, lap: 0, progress: 0, prevSi: slot.si, // lap 0: the grid sits behind the start line, first crossing begins lap 1
        boost: 0, driftCharge: 0, drifting: false,
        offroad: false, finished: false, finishTime: 0,
        aiLane: (Math.random() - 0.5) * ROAD_HALF_WIDTH * 0.9,
        aiWobbleT: Math.random() * 10,
        stuckT: 0,
        animParts: [],
      };
      // headlight glows on night circuits
      if (this.trackDef.night) {
        if (!this._hlTex) {
          const hc = document.createElement('canvas');
          hc.width = hc.height = 64;
          const hx = hc.getContext('2d');
          const hg = hx.createRadialGradient(32, 32, 2, 32, 32, 30);
          hg.addColorStop(0, 'rgba(255,246,214,1)');
          hg.addColorStop(1, 'rgba(255,246,214,0)');
          hx.fillStyle = hg; hx.fillRect(0, 0, 64, 64);
          this._hlTex = new THREE.CanvasTexture(hc);
        }
        const bb = new THREE.Box3().setFromObject(built.group);
        for (const sx of [-1, 1]) {
          const beam = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this._hlTex, color: 0xfff2c4, transparent: true, opacity: 0.7,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }));
          beam.position.set(sx * 0.38, 0.52, bb.min.z + 0.18);
          beam.scale.setScalar(0.55);
          built.group.add(beam);
        }
      }
      // collect animated sub-parts (flames, tails, halos, wings…)
      built.group.traverse(o => {
        if (o.userData.flicker || o.userData.wag || o.userData.halo || o.userData.wings || o.userData.sway) {
          kart.animParts.push(o);
        }
      });
      this.karts.push(kart);
    });
    this.player = this.karts.find(k => k.isPlayer);
    // camera initial placement behind player
    const p = this.player;
    this.camera.position.set(
      p.pos.x - Math.sin(p.heading) * 10,
      p.pos.y + 5,
      p.pos.z - Math.cos(p.heading) * 10);
    this.camera.lookAt(p.pos.x, p.pos.y + 1.5, p.pos.z);
    this.camPos = this.camera.position.clone();
    this.camHeading = p.heading;
    this.camY = p.pos.y + 4.4;
  }

  _bindInput() {
    this.keys = {};
    this._down = e => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (k === 'p' || k === 'escape') this.togglePause();
      if (k === 'm') { import('./audio.js').then(a => a.toggleMusic()); }
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    };
    this._up = e => { this.keys[e.key.toLowerCase()] = false; };
    addEventListener('keydown', this._down);
    addEventListener('keyup', this._up);
  }

  togglePause(force) {
    if (this.state === 'finished' && force === undefined) return;
    this.paused = force !== undefined ? force : !this.paused;
    $('screen-pause').classList.toggle('hidden', !this.paused);
    if (!this.paused) this.clock.getDelta(); // swallow paused time
  }

  toast(text) {
    const el = $('race-toast');
    el.textContent = text;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth; // restart animation
    el.style.animation = '';
  }

  // ---------- physics ----------
  _nearestSample(kart) {
    const { samples, SAMPLES } = this.track;
    let best = kart.si, bestD = Infinity;
    for (let o = -25; o <= 55; o++) {
      const i = (kart.si + o + SAMPLES) % SAMPLES;
      const sp = samples[i].p;
      const dx = sp.x - kart.pos.x, dz = sp.z - kart.pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  _updateKart(kart, input, dt) {
    const { samples, SAMPLES, halfWidth } = this.track;
    const stats = kart.char.stats;
    const maxFwd = BASE_SPEED * (0.72 + 0.28 * stats.speed) * (kart.boost > 0 ? 1.38 : 1) * (kart.offroad && kart.boost <= 0 ? 0.45 : 1);
    const accelRate = 1.35 * (0.7 + 0.5 * stats.accel) + (kart.boost > 0 ? 1.6 : 0);

    // speed
    if (input.throttle > 0 || kart.boost > 0) {
      const target = maxFwd * Math.max(input.throttle, kart.boost > 0 ? 1 : 0);
      kart.speed += (target - kart.speed) * Math.min(1, accelRate * dt);
    } else if (input.brake > 0) {
      kart.speed += (-maxFwd * 0.3 - kart.speed) * Math.min(1, 2.2 * dt);
    } else {
      kart.speed += (0 - kart.speed) * Math.min(1, 0.9 * dt);
    }
    if (kart.boost > 0) kart.boost -= dt;

    // steering
    const steerTarget = input.steer;
    kart.steer += (steerTarget - kart.steer) * Math.min(1, 9 * dt);
    const speedFactor = THREE.MathUtils.clamp(kart.speed / 16, -1, 1);
    let turnRate = kart.steer * (1.6 + 1.0 * stats.handling) * speedFactor;

    // drift: extra rotation + lateral slide + charge
    if (input.drift && Math.abs(kart.speed) > maxFwd * 0.4 && Math.abs(kart.steer) > 0.25) {
      kart.drifting = true;
      turnRate *= 1.65;
      kart.driftYaw += ((kart.steer > 0 ? 0.5 : -0.5) - kart.driftYaw) * Math.min(1, 5 * dt);
      kart.driftCharge = Math.min(1, kart.driftCharge + dt * 0.55);
    } else {
      if (kart.drifting && kart.driftCharge > 0.32) {
        // release → mini turbo!
        kart.boost = 0.5 + kart.driftCharge * 1.1;
        if (kart.isPlayer) { SFX.boost(); this.toast('TURBO! 🔥'); }
      }
      kart.drifting = false;
      kart.driftCharge = Math.max(0, kart.driftCharge - dt * 2);
      kart.driftYaw += (0 - kart.driftYaw) * Math.min(1, 6 * dt);
    }

    kart.heading -= turnRate * dt * (kart.speed < 0 ? -1 : 1);

    // move (drift adds sideways slip)
    const moveHeading = kart.heading + kart.driftYaw * 0.45;
    kart.pos.x += Math.sin(moveHeading) * kart.speed * dt;
    kart.pos.z += Math.cos(moveHeading) * kart.speed * dt;

    // track anchoring
    kart.si = this._nearestSample(kart);
    const s = samples[kart.si];
    const dx = kart.pos.x - s.p.x, dz = kart.pos.z - s.p.z;
    const latDist = dx * s.lat.x + dz * s.lat.z;

    kart.offroad = Math.abs(latDist) > halfWidth;
    // soft wall
    const LIMIT = halfWidth + 9;
    if (Math.abs(latDist) > LIMIT) {
      const push = Math.abs(latDist) - LIMIT;
      kart.pos.x -= s.lat.x * Math.sign(latDist) * push;
      kart.pos.z -= s.lat.z * Math.sign(latDist) * push;
      kart.speed *= 0.965;
    }
    // height + slope follow
    kart.pos.y += (s.p.y - kart.pos.y) * Math.min(1, 12 * dt);

    // lap logic (crossing sample 0)
    const d = kart.si - kart.prevSi;
    if (d < -SAMPLES * 0.6) { // wrapped forward
      kart.lap++;
      if (kart.isPlayer && !kart.finished) {
        if (kart.lap === LAPS) { SFX.finalLap(); this.toast('FINAL LAP! ⚡'); }
        else if (kart.lap > 1 && kart.lap < LAPS) SFX.lap();
        $('hud-lap').textContent = `LAP ${Math.min(Math.max(kart.lap, 1), LAPS)}/${LAPS}`;
      }
    } else if (d > SAMPLES * 0.6) {
      kart.lap--; // reversed over the line — no cheating!
    }
    kart.prevSi = kart.si;
    kart.progress = (kart.lap - 1) * SAMPLES + kart.si;

    // boost pads
    for (const pad of this.track.boostPads) {
      let ds = Math.abs(kart.si - pad.si);
      ds = Math.min(ds, SAMPLES - ds);
      if (ds < 5 && Math.abs(latDist - pad.side) < 3.4 && kart.boost < 0.4) {
        kart.boost = 1.25;
        if (kart.isPlayer) SFX.boost();
      }
    }

    // finish detection
    if (!kart.finished && kart.lap > LAPS) {
      kart.finished = true;
      kart.finishTime = this.raceTime;
      if (kart.isPlayer) this._playerFinished();
    }
  }

  _aiInput(kart, dt) {
    const { samples, SAMPLES } = this.track;
    kart.aiWobbleT += dt;
    // wandering lane keeps the pack spread out
    const lane = kart.aiLane * (0.6 + 0.4 * Math.sin(kart.aiWobbleT * 0.3));
    const look = (kart.si + 14 + Math.floor(kart.speed * 0.32)) % SAMPLES;
    const lookFar = (kart.si + 44) % SAMPLES;
    const s = samples[look];
    const target = new THREE.Vector3(s.p.x + s.lat.x * lane, 0, s.p.z + s.lat.z * lane);
    const desired = Math.atan2(target.x - kart.pos.x, target.z - kart.pos.z);
    let dAng = desired - kart.heading;
    while (dAng > Math.PI) dAng -= Math.PI * 2;
    while (dAng < -Math.PI) dAng += Math.PI * 2;
    // positive steer decreases heading (same convention as player input), so steer against dAng
    const steer = THREE.MathUtils.clamp(-dAng * 2.4, -1, 1);

    // slow slightly for big curvature ahead
    const tanNow = samples[kart.si].tan, tanFar = samples[lookFar].tan;
    const curv = 1 - (tanNow.x * tanFar.x + tanNow.z * tanFar.z);
    let throttle = curv > 0.5 ? 0.62 : 1;

    // --- difficulty & rubber banding ---
    const gap = (this.player.progress - kart.progress) / SAMPLES; // laps ahead of AI
    let mult = 0.9 + 0.06 * Math.sin(kart.aiWobbleT * 0.17 + kart.aiLane);
    mult += THREE.MathUtils.clamp(gap * 0.35, -0.12, 0.1);

    // --- THE RULE: Satan always loses ---
    if (kart.id === 'satan') {
      mult = Math.min(mult, 0.78);
      const others = this.karts.filter(k => k !== kart && !k.isPlayer);
      const minOther = Math.min(...others.map(k => k.progress));
      if (kart.progress >= minOther - 12) mult = 0.45;           // never allowed to pass anyone
      if (kart.progress >= this.player.progress - 20 && this.player.lap >= LAPS) {
        mult = 0.1;                                               // divine intervention near the flag
        if (!this._divineShown) { this._divineShown = true; this.toast('🙏 DIVINE INTERVENTION!'); }
      }
      // permanent engine trouble: sputtering smoke
      if (Math.random() < 0.3) {
        this.particles.spawn(
          new THREE.Vector3(kart.pos.x, kart.pos.y + 1.2, kart.pos.z),
          new THREE.Vector3((Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2),
          0x555555, 1.1);
      }
    }
    throttle *= mult;

    // unstick
    if (kart.speed < 3 && this.state === 'racing') {
      kart.stuckT += dt;
      if (kart.stuckT > 1.5) throttle = 1;
    } else kart.stuckT = 0;

    return { throttle, brake: 0, steer, drift: false };
  }

  _playerInput() {
    const k = this.keys;
    const up = k['arrowup'] || k['w'];
    const down = k['arrowdown'] || k['s'];
    let steer = 0;
    if (k['arrowleft'] || k['a']) steer -= 1;
    if (k['arrowright'] || k['d']) steer += 1;
    return { throttle: up ? 1 : 0, brake: down ? 1 : 0, steer, drift: !!k[' '] };
  }

  _collideKarts() {
    for (let i = 0; i < this.karts.length; i++) {
      for (let j = i + 1; j < this.karts.length; j++) {
        const a = this.karts[i], b = this.karts[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        const min = KART_RADIUS * 2;
        if (d2 < min * min && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          const nx = dx / d, nz = dz / d;
          a.pos.x -= nx * push; a.pos.z -= nz * push;
          b.pos.x += nx * push; b.pos.z += nz * push;
          if ((a.isPlayer || b.isPlayer) && Math.abs(a.speed - b.speed) > 6) SFX.bump();
        }
      }
    }
  }

  _playerFinished() {
    this.state = 'finished';
    const rank = this._rankOf(this.player);
    setTimeout(() => this._showResults(rank), 1400);
    if (rank === 1) SFX.fanfare();
    else if (rank <= 3) SFX.lap();
  }

  _standings() {
    return [...this.karts].sort((a, b) =>
      (a.finished && b.finished) ? a.finishTime - b.finishTime :
      a.finished ? -1 : b.finished ? 1 : b.progress - a.progress);
  }

  _rankOf(kart) {
    return this._standings().indexOf(kart) + 1;
  }

  // ---------- live leaderboard ----------
  _buildLeaderboard() {
    const ROW = 25;
    const lb = $('leaderboard');
    lb.innerHTML = '';
    lb.style.height = `${this.karts.length * ROW + 10}px`;
    this._lbRows = new Map();
    for (const kart of this.karts) {
      const row = document.createElement('div');
      row.className = 'lb-row' + (kart.isPlayer ? ' lb-player' : '') + (kart.id === 'satan' ? ' lb-satan' : '');
      row.innerHTML = `
        <span class="lb-rank"></span>
        <span class="lb-emoji">${kart.char.emoji}</span>
        <span class="lb-name">${kart.char.name}${kart.isPlayer ? ' ★' : ''}</span>
        <span class="lb-lap"></span>`;
      lb.appendChild(row);
      this._lbRows.set(kart.id, {
        row,
        rank: row.querySelector('.lb-rank'),
        lap: row.querySelector('.lb-lap'),
      });
    }
    this._lbClock = 0;
    this._updateLeaderboard(this._standings());
  }

  _updateLeaderboard(standings) {
    const ROW = 25;
    standings.forEach((kart, i) => {
      const r = this._lbRows.get(kart.id);
      r.row.style.transform = `translateY(${i * ROW}px)`;
      r.row.classList.toggle('lb-first', i === 0);
      r.row.classList.toggle('lb-finished', kart.finished);
      r.rank.textContent = i + 1;
      r.lap.textContent = kart.finished ? '🏁' : `L${Math.min(Math.max(kart.lap, 1), LAPS)}`;
    });
  }

  _showResults(playerRank) {
    // final standings: finishers by time, then by progress — Satan hard-pinned to last
    let sorted = [...this.karts].sort((a, b) =>
      (a.finished && b.finished) ? a.finishTime - b.finishTime :
      a.finished ? -1 : b.finished ? 1 : b.progress - a.progress);
    const satan = sorted.find(k => k.id === 'satan');
    sorted = sorted.filter(k => k !== satan); sorted.push(satan);
    // estimate finish times for karts still on track (Satan always slowest)
    const { SAMPLES, length } = this.track;
    const unitPerSample = length / SAMPLES;
    let lastEst = this.raceTime;
    const results = sorted.map((k, i) => {
      let time;
      if (k.finished) time = k.finishTime;
      else {
        const remaining = Math.max(0, LAPS * SAMPLES - k.progress) * unitPerSample;
        const pace = Math.max(8, Math.abs(k.speed), BASE_SPEED * 0.55);
        time = this.raceTime + remaining / pace;
      }
      time = Math.max(time, lastEst + 0.15); // keep standings monotonic
      lastEst = time;
      return { id: k.id, name: k.char.name, emoji: k.char.emoji, isPlayer: k.isPlayer, time, rank: i + 1 };
    });
    this.dispose();
    this.onFinish({ results, playerRank: results.findIndex(r => r.isPlayer) + 1, playerTime: this.player.finishTime, trackDef: this.trackDef });
  }

  // ---------- visuals ----------
  _animateKartParts(kart, t, dt) {
    for (const o of kart.animParts) {
      const u = o.userData;
      if (u.flicker) o.scale.setScalar(0.85 + Math.random() * 0.4 + (kart.boost > 0 ? 0.5 : 0));
      if (u.wag) o.rotation.z = Math.sin(t * (6 + kart.speed * 0.2)) * 0.5;
      if (u.halo) o.position.y += Math.sin(t * 3) * 0.0012;
      if (u.wings) for (const w of o.children) w.rotation.z = Math.sin(t * 7) * 0.18 * (w.userData.flapSide || 1);
      if (u.sway) o.rotation.z = Math.sin(t * 1.8) * 0.05 + kart.steer * -0.12;
    }
    // spin wheels
    for (const w of kart.built.wheels || []) w.children.forEach(c => { c.rotation.x += kart.speed * dt * 0.8; });
  }

  _updateVisuals(dt, t) {
    for (const kart of this.karts) {
      const g = kart.built.group;
      g.position.copy(kart.pos);
      // slope pitch (YXZ order: yaw first, then pitch/roll in the kart's own frame)
      const s = this.track.samples[kart.si];
      const ahead = this.track.samples[(kart.si + 6) % this.track.SAMPLES];
      const slope = Math.atan2(ahead.p.y - s.p.y, 6 * (this.track.length / this.track.SAMPLES));
      // drift pose: nose points into the corner while the velocity slides outward
      g.rotation.set(slope, kart.heading - kart.driftYaw * 0.6 + Math.PI, kart.steer * -0.08 + kart.driftYaw * -0.25);

      // skid marks from the rear axle while drifting on tarmac
      if (kart.isPlayer) {
        if (kart.drifting && !kart.offroad && Math.abs(kart.speed) > 10) {
          const fx = Math.sin(kart.heading), fz = Math.cos(kart.heading);
          const rx = fz, rz = -fx;
          const bx = kart.pos.x - fx * 1.05, bz = kart.pos.z - fz * 1.05;
          this.skids.add(
            new THREE.Vector3(bx + rx * 0.58, kart.pos.y + 0.035, bz + rz * 0.58),
            new THREE.Vector3(bx - rx * 0.58, kart.pos.y + 0.035, bz - rz * 0.58));
        } else this.skids.break();
      }
      // drift sparks
      if (kart.drifting && kart.isPlayer) {
        const col = kart.driftCharge > 0.8 ? 0xff3ea5 : kart.driftCharge > 0.45 ? 0xffd93d : 0x00c2ff;
        for (let i = 0; i < 2; i++) {
          this.particles.spawn(
            new THREE.Vector3(kart.pos.x - Math.sin(kart.heading) * 1.2 + (Math.random() - 0.5), kart.pos.y + 0.2, kart.pos.z - Math.cos(kart.heading) * 1.2 + (Math.random() - 0.5)),
            new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6),
            col, 0.4);
        }
      }
      // boost flames
      if (kart.boost > 0) {
        this.particles.spawn(
          new THREE.Vector3(kart.pos.x - Math.sin(kart.heading) * 1.6, kart.pos.y + 0.5, kart.pos.z - Math.cos(kart.heading) * 1.6),
          new THREE.Vector3(-Math.sin(kart.heading) * 8, 1.5, -Math.cos(kart.heading) * 8),
          Math.random() < 0.5 ? 0xffd93d : 0xff6d1f, 0.35);
      }
      this._animateKartParts(kart, t + kart.aiLane, dt);
    }

    // shadow sun tracks the player so shadows stay crisp everywhere on the circuit
    const sun = this.track.sun;
    sun.target.position.copy(this.player.pos);
    sun.position.copy(this.player.pos).addScaledVector(this.track.sunDir, 220);
    // boost pads pulse
    this.track.padMat.emissiveIntensity = 1.3 + 0.7 * Math.sin(t * 6);

    // themed prop animation
    for (const o of this.track.animatedProps) {
      const u = o.userData, ph = u.phase || 0;
      switch (u.anim) {
        case 'twinkle': o.scale.setScalar(0.8 + 0.35 * Math.sin(t * 3 + ph)); o.rotation.y += dt; break;
        case 'spin': o.rotation.y += dt * 0.3; break;
        case 'rise': o.position.y += dt * 1.2; if (o.position.y > 16) o.position.y = 0.5; break;
        case 'drift': o.position.x += Math.sin(t * 0.12 + ph) * dt * 3; break;
        case 'aurora': o.material.opacity = 0.1 + 0.09 * Math.sin(t * 0.5 + ph); break;
      }
    }
    // weather (snow / petals)
    if (this.track.weather) {
      const pos = this.track.weather.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - dt * 3.2;
        if (y < 0) y = 55;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(t + i) * dt * 0.8);
      }
      pos.needsUpdate = true;
    }

    // chase camera: locked follow distance, smoothed heading — snappy but stable
    const p = this.player;
    let dh = p.heading - this.camHeading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.camHeading += dh * Math.min(1, 7 * dt);
    this.camY += (p.pos.y + 4.4 - this.camY) * Math.min(1, 6 * dt);
    const back = 8.5 + Math.abs(p.speed) * 0.035;
    this.camera.position.set(
      p.pos.x - Math.sin(this.camHeading) * back,
      this.camY,
      p.pos.z - Math.cos(this.camHeading) * back);
    this.camera.lookAt(p.pos.x + Math.sin(p.heading) * 4, p.pos.y + 1.6, p.pos.z + Math.cos(p.heading) * 4);
    const targetFov = 68 + (p.boost > 0 ? 14 : 0) + p.speed * 0.1;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 4 * dt);
    this.camera.updateProjectionMatrix();
  }

  // ---------- HUD ----------
  _precomputeMinimap() {
    const pts = this.track.samples.filter((_, i) => i % 6 === 0).map(s => s.p);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const pad = 16, size = 200;
    const scale = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    this.mmap = { pts, minX, minZ, scale, pad, cx: (maxX - minX) * scale / 2, cy: (maxZ - minZ) * scale / 2 };
  }
  _mm(p) {
    const m = this.mmap;
    return [m.pad + (p.x - m.minX) * m.scale, m.pad + (p.z - m.minZ) * m.scale];
  }
  _drawMinimap() {
    const c = this.minimapCtx;
    c.clearRect(0, 0, 200, 200);
    c.strokeStyle = 'rgba(255,255,255,.85)';
    c.lineWidth = 5; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    this.mmap.pts.forEach((p, i) => {
      const [x, y] = this._mm(p);
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    });
    c.closePath(); c.stroke();
    for (const kart of this.karts) {
      const [x, y] = this._mm(kart.pos);
      c.beginPath();
      c.arc(x, y, kart.isPlayer ? 6 : 4, 0, Math.PI * 2);
      c.fillStyle = kart.isPlayer ? '#ff3ea5' : kart.id === 'satan' ? '#ff3b1f' : '#' + kart.char.color.toString(16).padStart(6, '0');
      c.fill();
      if (kart.isPlayer) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); }
    }
  }
  _updateHUD(dt) {
    const p = this.player;
    const standings = this._standings();
    const rank = standings.indexOf(p) + 1;
    $('pos-num').textContent = rank;
    $('pos-suffix').textContent = SUFFIX[rank - 1];
    // leaderboard reorders a few times a second — the CSS transition smooths it
    this._lbClock += dt;
    if (this._lbClock > 0.3) {
      this._lbClock = 0;
      this._updateLeaderboard(standings);
    }
    if (this._lastRank && rank < this._lastRank && this.state === 'racing') SFX.overtake();
    this._lastRank = rank;
    $('hud-timer').textContent = fmtTime(this.raceTime * 1000);
    $('speed-num').textContent = Math.round(Math.abs(p.speed) * 3.4);
    $('drift-fill').style.width = `${p.driftCharge * 100}%`;
    $('drift-label').textContent = p.boost > 0 ? 'BOOST!!' : p.drifting ? 'CHARGING…' : 'DRIFT';
  }

  // ---------- main loop ----------
  _loop() {
    if (this.disposed) return;
    requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.paused) { this.composer.render(); return; }
    this.elapsed += dt;
    const t = this.elapsed;

    if (this.state === 'countdown') {
      this.countdownTimer -= dt;
      if (this.countdownTimer <= 0) {
        this.countdownStep--;
        const el = $('countdown');
        if (this.countdownStep > 0) {
          el.classList.remove('hidden', 'go');
          el.textContent = this.countdownStep;
          el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
          SFX.count();
          this.countdownTimer = 1;
        } else {
          el.textContent = 'GO!';
          el.classList.add('go');
          el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
          SFX.go();
          this.state = 'racing';
          setTimeout(() => el.classList.add('hidden'), 900);
        }
      }
      // slow orbit while the grid waits
      const p = this.player;
      const a = t * 0.5;
      this.camera.position.set(p.pos.x + Math.sin(a) * 13, p.pos.y + 6, p.pos.z + Math.cos(a) * 13);
      this.camera.lookAt(p.pos.x, p.pos.y + 1, p.pos.z);
      this.camPos.copy(this.camera.position);
      this.camHeading = p.heading;
      this._updateVisualsStatic(dt, t);
      this._drawMinimap();
      this.composer.render();
      return;
    }

    this.raceTime += dt;

    for (const kart of this.karts) {
      const input = kart.isPlayer && this.state !== 'finished'
        ? this._playerInput()
        : kart.isPlayer ? { throttle: 0.3, brake: 0, steer: 0, drift: false }
        : this._aiInput(kart, dt);
      this._updateKart(kart, input, dt);
    }
    this._collideKarts();
    this.particles.update(dt);
    this._updateVisuals(dt, t);
    this._updateHUD(dt);
    this._drawMinimap();
    setEngine(Math.abs(this.player.speed) / BASE_SPEED, this.player.boost > 0);
    this.composer.render();
  }

  _updateVisualsStatic(dt, t) {
    for (const kart of this.karts) this._animateKartParts(kart, t, dt);
    for (const o of this.track.animatedProps) {
      if (o.userData.anim === 'twinkle') o.scale.setScalar(0.8 + 0.35 * Math.sin(t * 3 + (o.userData.phase || 0)));
    }
    this.particles.update(dt);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(innerWidth, innerHeight);
    this.bloom.setSize(innerWidth, innerHeight);
  }

  dispose() {
    this.disposed = true;
    this.composer.dispose();
    removeEventListener('keydown', this._down);
    removeEventListener('keyup', this._up);
    stopEngine();
    stopMusic();
    this.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
  }
}
