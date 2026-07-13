// ============================================================
// MOOSE RACER — procedural WebAudio: chiptune soundtrack,
// engine hum and arcade SFX. Zero audio files.
// ============================================================
let ctx = null;
let master, musicGain, sfxGain, engineOsc, engineGain, engineOsc2;
let musicOn = true;
let musicTimer = null;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.34; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.8; sfxGain.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function initAudio() { ac(); }

export function toggleMusic() {
  musicOn = !musicOn;
  if (musicGain) musicGain.gain.value = musicOn ? 0.34 : 0;
  return musicOn;
}

// ---------- SFX ----------
function blip(freq, dur, type = 'square', vol = 0.5, slideTo = null) {
  const c = ac();
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g); g.connect(sfxGain);
  o.start(); o.stop(c.currentTime + dur + 0.05);
}

export const SFX = {
  count: () => blip(440, 0.25, 'square', 0.4),
  go: () => { blip(880, 0.5, 'square', 0.5); blip(1108, 0.5, 'square', 0.35); },
  click: () => blip(660, 0.08, 'square', 0.3, 880),
  boost: () => { blip(220, 0.5, 'sawtooth', 0.5, 1200); blip(440, 0.35, 'square', 0.3, 1760); },
  driftCharge: () => blip(330, 0.1, 'square', 0.18, 392),
  bump: () => blip(120, 0.2, 'sawtooth', 0.4, 60),
  offroad: () => blip(90, 0.12, 'triangle', 0.25),
  lap: () => { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'square', 0.4), i * 90)); },
  finalLap: () => { [784, 740, 784, 988].forEach((f, i) => setTimeout(() => blip(f, 0.18, 'square', 0.4), i * 110)); },
  overtake: () => blip(523, 0.14, 'square', 0.3, 784),
  fanfare: () => {
    const seq = [[523, 0], [523, 120], [523, 240], [659, 360], [784, 560], [659, 760], [784, 900], [1047, 1100]];
    seq.forEach(([f, t]) => setTimeout(() => { blip(f, 0.3, 'square', 0.45); blip(f / 2, 0.3, 'triangle', 0.3); }, t));
  },
  satanLoses: () => { [392, 370, 349, 330, 175].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sawtooth', 0.3), i * 160)); },
};

// ---------- engine ----------
export function startEngine() {
  const c = ac();
  if (engineOsc) return;
  engineOsc = c.createOscillator(); engineOsc.type = 'sawtooth';
  engineOsc2 = c.createOscillator(); engineOsc2.type = 'triangle';
  engineGain = c.createGain(); engineGain.gain.value = 0;
  const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 700;
  engineOsc.connect(filt); engineOsc2.connect(filt); filt.connect(engineGain); engineGain.connect(master);
  engineOsc.frequency.value = 50; engineOsc2.frequency.value = 100;
  engineOsc.start(); engineOsc2.start();
}
export function setEngine(speedRatio, boosting) {
  if (!engineOsc) return;
  const f = 45 + speedRatio * 160 + (boosting ? 60 : 0);
  engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.08);
  engineOsc2.frequency.setTargetAtTime(f * 2.02, ctx.currentTime, 0.08);
  engineGain.gain.setTargetAtTime(0.05 + speedRatio * 0.075, ctx.currentTime, 0.1);
}
export function stopEngine() {
  if (!engineOsc) return;
  engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
  const o1 = engineOsc, o2 = engineOsc2;
  setTimeout(() => { try { o1.stop(); o2.stop(); } catch (e) {} }, 500);
  engineOsc = engineOsc2 = null;
}

// ---------- chiptune soundtrack ----------
// A bouncy loop in a major key; melody varies per track seed.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16]; // major pentatonic-ish
function noteFreq(root, step) { return root * Math.pow(2, step / 12); }

export function startMusic(seed = 1, tempo = 138) {
  stopMusic();
  const c = ac();
  const beat = 60 / tempo / 2; // 8th notes
  let s = seed * 2654435761 % 4294967296;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const root = 220 * Math.pow(2, Math.floor(rnd() * 4) / 12);
  // compose a 32-step melody + bass line
  const melody = [], bass = [];
  let cur = 3;
  for (let i = 0; i < 32; i++) {
    cur += Math.floor(rnd() * 5) - 2;
    cur = Math.max(0, Math.min(SCALE.length - 1, cur));
    melody.push(rnd() < 0.82 ? SCALE[cur] : null);
    bass.push([0, 0, 7, 5][Math.floor(i / 8)]);
  }
  let step = 0;
  const tick = () => {
    const t = c.currentTime + 0.05;
    const m = melody[step % 32];
    if (m !== null && musicOn) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'square'; o.frequency.value = noteFreq(root * 2, m);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.95);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + beat);
    }
    if (step % 2 === 0 && musicOn) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = noteFreq(root / 2, bass[step % 32]);
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + beat * 1.8);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + beat * 2);
    }
    // hats
    if (musicOn) {
      const bufSize = 2048;
      const buf = c.createBuffer(1, bufSize, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
      const n = c.createBufferSource(); n.buffer = buf;
      const g = c.createGain();
      g.gain.setValueAtTime(step % 4 === 2 ? 0.14 : 0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
      n.connect(hp); hp.connect(g); g.connect(musicGain);
      n.start(t);
    }
    step++;
  };
  musicTimer = setInterval(tick, beat * 1000);
}

export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
