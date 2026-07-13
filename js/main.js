// ============================================================
// MOOSE RACER — game shell: screens, selection, progression,
// celebration. GO TEAM!
// ============================================================
import * as THREE from 'three';
import { CHARACTERS, buildKartFor, toon } from './characters.js';
import { TRACKS } from './tracks.js';
import { Race } from './race.js';
import { initAudio, SFX, startMusic, stopMusic } from './audio.js';
import { initEnv } from './env.js';

const $ = id => document.getElementById(id);

// ---------- save data ----------
const SAVE_KEY = 'mooseRacerSave.v1';
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* sandboxed/private mode: play on without saving */ } }
const save = Object.assign({ unlocked: 1, best: {}, tutorialSeen: false }, loadSave());

// ---------- renderer (shared between menu showcase & races) ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('game-canvas'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const ENV = initEnv(renderer);

let race = null;
let selectedChar = save.lastChar || 'moose';
let selectedTrack = 1;

// ============================================================
// MENU SHOWCASE — rotating kart on a striped podium
// ============================================================
const menu = (() => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x150b38);
  scene.environment = ENV;
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
  // frame the podium kart in the lower-right, clear of the selection grid
  camera.position.set(0, 3.6, 10.5);
  camera.lookAt(-2.3, 3.0, 0);
  scene.add(new THREE.HemisphereLight(0xbfe8ff, 0x54308a, 1.2));
  const sun = new THREE.DirectionalLight(0xfff4d6, 1.8);
  sun.position.set(5, 8, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -7; sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 7; sun.shadow.camera.bottom = -7;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 30;
  scene.add(sun, new THREE.AmbientLight(0xffffff, 0.4));

  const podium = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 0.6, 32), toon(0xff3ea5));
  podium.position.y = -0.3;
  const podiumTop = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.1, 32), toon(0x00c2ff));
  podiumTop.position.y = 0.05;
  podiumTop.receiveShadow = true;
  scene.add(podium, podiumTop);
  // floating candy shapes in the background
  const floaters = [];
  const cols = [0xff3ea5, 0x00c2ff, 0xffd93d, 0x7cff6b, 0xb388ff];
  for (let i = 0; i < 26; i++) {
    const geos = [new THREE.OctahedronGeometry(0.4), new THREE.TorusGeometry(0.4, 0.16, 8, 14), new THREE.BoxGeometry(0.5, 0.5, 0.5)];
    const m = new THREE.Mesh(geos[i % 3], toon(cols[i % 5]));
    m.position.set((Math.random() - 0.5) * 26, Math.random() * 12 - 3, -6 - Math.random() * 12);
    m.userData.spin = 0.3 + Math.random();
    floaters.push(m);
    scene.add(m);
  }
  let kartGroup = null;
  let active = false;
  const clock = new THREE.Clock();

  function setKart(charId) {
    if (kartGroup) {
      scene.remove(kartGroup);
      kartGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    kartGroup = buildKartFor(charId).group;
    kartGroup.position.y = 0.1;
    scene.add(kartGroup);
  }
  function loop() {
    if (!active) return;
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (kartGroup) kartGroup.rotation.y += dt * 0.8;
    for (const f of floaters) { f.rotation.x += dt * f.userData.spin; f.rotation.y += dt * f.userData.spin * 0.7; }
    camera.position.y = 3.6 + Math.sin(t * 0.6) * 0.25;
    renderer.render(scene, camera);
  }
  return {
    start() { if (!active) { active = true; clock.getDelta(); loop(); } },
    stop() { active = false; },
    setKart,
    resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); },
  };
})();

// ============================================================
// SCREENS
// ============================================================
const screens = ['screen-title', 'screen-tutorial', 'screen-charselect', 'screen-trackselect', 'screen-pause', 'screen-results'];
function show(id) {
  for (const s of screens) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', id !== null);
  if (id !== null) $('hud').classList.add('hidden');
}

// ---------- character select ----------
function buildCharGrid() {
  const grid = $('char-grid');
  grid.innerHTML = '';
  for (const c of CHARACTERS) {
    const card = document.createElement('div');
    card.className = 'char-card' + (c.id === selectedChar ? ' selected' : '');
    card.innerHTML = `
      <div class="char-emoji">${c.emoji}</div>
      <div class="char-name">${c.name}</div>
      <div class="char-tag">${c.tag}</div>
      <div class="char-swatch" style="background:${c.swatch}"></div>`;
    card.onclick = () => {
      selectedChar = c.id;
      save.lastChar = c.id; persist();
      SFX.click();
      grid.querySelectorAll('.char-card').forEach(el => el.classList.remove('selected'));
      card.classList.add('selected');
      $('char-blurb').textContent = c.blurb;
      menu.setKart(c.id);
    };
    grid.appendChild(card);
  }
  $('char-blurb').textContent = CHARACTERS.find(c => c.id === selectedChar).blurb;
}

// ---------- track select ----------
function buildTrackGrid() {
  const grid = $('track-grid');
  grid.innerHTML = '';
  if (selectedTrack > save.unlocked) selectedTrack = save.unlocked;
  for (const t of TRACKS) {
    const locked = t.id > save.unlocked;
    const card = document.createElement('div');
    card.className = 'track-card' + (locked ? ' locked' : '') + (t.id === selectedTrack ? ' selected' : '');
    card.style.background = t.pal.card;
    const best = save.best[t.id];
    card.innerHTML = `
      <div class="track-num">№ ${String(t.id).padStart(2, '0')}</div>
      ${locked ? '<div class="track-lock">🔒</div>' : ''}
      <div class="track-name">${t.name}</div>
      <div class="track-theme">${t.theme}</div>
      ${best ? `<div class="track-best">🏆 ${fmtMs(best)}</div>` : ''}`;
    card.onclick = () => {
      if (locked) { $('track-blurb').textContent = '🔒 Earn a medal (top 3) on the previous circuit to unlock this one!'; return; }
      selectedTrack = t.id;
      SFX.click();
      grid.querySelectorAll('.track-card').forEach(el => el.classList.remove('selected'));
      card.classList.add('selected');
      $('track-blurb').textContent = `${t.tagline}`;
    };
    grid.appendChild(card);
  }
  const cur = TRACKS.find(t => t.id === selectedTrack);
  $('track-blurb').textContent = cur ? cur.tagline : '';
}

function fmtMs(ms) {
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), t = Math.floor((ms % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${t}`;
}

// ============================================================
// RACE LIFECYCLE
// ============================================================
function startRace() {
  menu.stop();
  stopMusic();
  show(null);
  $('hud').classList.remove('hidden');
  const trackDef = TRACKS.find(t => t.id === selectedTrack);
  race = new Race({
    renderer,
    trackDef,
    playerCharId: selectedChar,
    onFinish: onRaceFinish,
  });
}

function onRaceFinish({ results, playerRank, playerTime, trackDef }) {
  race = null;
  $('hud').classList.add('hidden');

  // progression: a medal (podium, top 3) unlocks the next circuit
  const won = playerRank === 1;
  const podium = playerRank <= 3;
  if (podium && trackDef.id === save.unlocked && save.unlocked < TRACKS.length) {
    save.unlocked++;
  }
  if (playerTime && (!save.best[trackDef.id] || playerTime * 1000 < save.best[trackDef.id])) {
    save.best[trackDef.id] = Math.round(playerTime * 1000);
  }
  persist();

  // ----- celebration -----
  const title = $('results-title');
  const playingAsSatan = selectedChar === 'satan';
  if (playingAsSatan) {
    title.textContent = 'SATAN LOSES AGAIN!';
  } else if (won) {
    title.textContent = 'GO TEAM!';
    SFX.fanfare();
  } else if (podium) {
    title.textContent = 'PODIUM! 🏆';
  } else {
    title.textContent = 'GOOD RACE!';
  }
  title.style.animation = 'none'; void title.offsetWidth; title.style.animation = '';

  const finalMsg = playingAsSatan
    ? 'The prophecy holds. No matter how well you drove, Satan finishes last. Forever.'
    : trackDef.id === TRACKS.length && won
    ? '👑 CHAMPION OF THE GO TEAM GALAXY — YOU BEAT ALL 20 CIRCUITS! 👑'
    : won ? `${trackDef.name} conquered in ${fmtMs(Math.round(playerTime * 1000))} — next circuit unlocked!`
    : podium ? `${['🥇', '🥈', '🥉'][playerRank - 1]} P${playerRank} on ${trackDef.name} — medal earned, next circuit unlocked!`
    : `P${playerRank} on ${trackDef.name} — earn a medal (top 3) to unlock the next circuit!`;
  $('results-sub').textContent = finalMsg;

  const list = $('results-list');
  list.innerHTML = '';
  results.forEach(r => {
    const li = document.createElement('li');
    if (r.isPlayer) li.classList.add('player-row');
    if (r.id === 'satan') li.classList.add('satan-row');
    li.innerHTML = `
      <span class="r-pos">${r.rank}${['st','nd','rd'][r.rank-1] || 'th'}</span>
      <span>${r.emoji}</span>
      <span>${r.name}${r.isPlayer ? ' (YOU)' : ''}${r.id === 'satan' ? ' — loses again, as foretold' : ''}</span>
      <span class="r-time">${r.time ? fmtMs(Math.round(r.time * 1000)) : 'DNF'}</span>`;
    list.appendChild(li);
  });
  setTimeout(() => SFX.satanLoses(), won ? 1800 : 600);

  $('btn-next-track').style.display = (podium && trackDef.id < TRACKS.length) ? '' : 'none';

  show('screen-results');
  startConfetti(won ? 260 : podium ? 120 : 40);
  startMusic(won ? 777 : 555, 150);
}

// ============================================================
// CONFETTI (2D canvas, results screen)
// ============================================================
let confettiRAF = null;
function startConfetti(count) {
  const canvas = $('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = innerWidth; canvas.height = innerHeight;
  const cols = ['#ff3ea5', '#00c2ff', '#ffd93d', '#7cff6b', '#b388ff', '#ffffff'];
  const bits = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height,
    w: 6 + Math.random() * 8,
    h: 8 + Math.random() * 10,
    c: cols[Math.floor(Math.random() * cols.length)],
    vy: 2 + Math.random() * 3.5,
    vx: (Math.random() - 0.5) * 2,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.2,
  }));
  cancelAnimationFrame(confettiRAF);
  (function tick() {
    if ($('screen-results').classList.contains('hidden')) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const b of bits) {
      b.y += b.vy; b.x += b.vx + Math.sin(b.y * 0.02) * 1.2; b.rot += b.vr;
      if (b.y > canvas.height + 20) { b.y = -20; b.x = Math.random() * canvas.width; }
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    confettiRAF = requestAnimationFrame(tick);
  })();
}

// ============================================================
// WIRING
// ============================================================
$('btn-start').onclick = () => {
  initAudio(); SFX.click();
  startMusic(42, 132);
  if (!save.tutorialSeen) show('screen-tutorial');
  else { show('screen-charselect'); menu.start(); menu.setKart(selectedChar); }
};
$('btn-tutorial-done').onclick = () => {
  SFX.click();
  save.tutorialSeen = true; persist();
  show('screen-charselect');
  buildCharGrid();
  menu.start(); menu.setKart(selectedChar);
};
$('btn-char-done').onclick = () => { SFX.click(); buildTrackGrid(); show('screen-trackselect'); };
$('btn-back-char').onclick = () => { SFX.click(); show('screen-charselect'); };
$('btn-race').onclick = () => startRace();

$('btn-resume').onclick = () => race && race.togglePause(false);
$('btn-restart').onclick = () => {
  if (!race) return;
  race.dispose(); race = null;
  $('screen-pause').classList.add('hidden');
  startRace();
};
$('btn-quit').onclick = () => {
  if (race) { race.dispose(); race = null; }
  $('screen-pause').classList.add('hidden');
  $('hud').classList.add('hidden');
  backToMenu();
};

$('btn-next-track').onclick = () => {
  SFX.click();
  if (selectedTrack < TRACKS.length) selectedTrack++;
  startRace();
};
$('btn-retry').onclick = () => startRace();
$('btn-menu').onclick = () => backToMenu();

function backToMenu() {
  stopMusic();
  startMusic(42, 132);
  buildCharGrid(); buildTrackGrid();
  show('screen-charselect');
  menu.start(); menu.setKart(selectedChar);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  menu.resize();
  if (race) race.resize();
});

// initial build
buildCharGrid();
show('screen-title');
