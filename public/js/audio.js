/* ============================================================
   NEXUS WARS — ljud
   Allt syntetiseras med WebAudio. Inga ljudfiler: spelet förblir
   några hundra kilobyte och laddar direkt även på mobildata.
   Varje skadetyp har sin egen klangfärg, så man hör vad som skjuter.
   ============================================================ */

let ctx = null;
let master = null, sfxBus = null, musicBus = null;
let noiseBuf = null;
let ready = false;
let enabled = true;
let musicOn = false;
let intensity = 0;          // 0..1, styr musikens täthet

try { enabled = localStorage.getItem('nw_sound') !== 'off'; } catch { /* privat läge */ }

export const isEnabled = () => enabled;

export function setEnabled(v) {
  enabled = v;
  try { localStorage.setItem('nw_sound', v ? 'on' : 'off'); } catch { /* ignorera */ }
  if (master) master.gain.setTargetAtTime(v ? 1 : 0, ctx.currentTime, 0.05);
  if (!v) stopMusic();
}

/* Måste kallas från en riktig användargest — annars startar ingen
   webbläsare ljudet. */
export function unlock() {
  if (ready) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();

  master = ctx.createGain();
  master.gain.value = enabled ? 1 : 0;

  // Lätt kompression så många samtidiga skott inte spräcker mixen.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 20;
  comp.ratio.value = 8;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;

  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55;
  musicBus = ctx.createGain(); musicBus.gain.value = 0.0;

  sfxBus.connect(comp);
  musicBus.connect(comp);
  comp.connect(master);
  master.connect(ctx.destination);

  const len = ctx.sampleRate * 1.2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  ready = true;
}

const now = () => ctx.currentTime;
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------- byggstenar ---------- */
function tone({ freq, to, type = 'sine', dur = 0.15, gain = 0.3, attack = 0.004, dest, curve = 'exp', detune = 0 }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.detune.value = detune;
  const t = now();
  o.frequency.setValueAtTime(freq, t);
  if (to && to !== freq) {
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    else o.frequency.linearRampToValueAtTime(Math.max(20, to), t + dur);
  }
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || sfxBus);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise({ dur = 0.15, gain = 0.3, freq = 1200, to, q = 1, type = 'bandpass', dest }) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  const g = ctx.createGain();
  const t = now();
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(Math.max(60, to), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest || sfxBus);
  s.start(t); s.stop(t + dur + 0.02);
}

/* Rösttak: med tolv torn som skjuter blir det annars ett grötigt brus.
   Vi släpper igenom ~14 skottljud per sekund och tappar resten tyst. */
let budget = 14, budgetT = 0;
function canPlay(cost = 1) {
  if (!ready || !enabled) return false;
  const t = now();
  if (t - budgetT > 1) { budget = 14; budgetT = t; }
  if (budget < cost) return false;
  budget -= cost;
  return true;
}

/* ---------- effekter ---------- */
export const sfx = {
  /* En klangfärg per skadetyp — man hör skillnad på PULS och GAUSS. */
  shoot(dmgType, vol = 1) {
    if (!canPlay()) return;
    const v = 0.13 * vol;
    switch (dmgType) {
      case 'kin':
        tone({ freq: rnd(760, 880), to: 300, type: 'square', dur: 0.06, gain: v });
        break;
      case 'spr':
        noise({ dur: 0.13, gain: v * 1.5, freq: 900, to: 180, q: 0.7 });
        tone({ freq: 150, to: 60, type: 'sine', dur: 0.16, gain: v });
        break;
      case 'ter':
        noise({ dur: 0.22, gain: v * 1.2, freq: 500, to: 2200, q: 1.6 });
        break;
      case 'kry':
        tone({ freq: rnd(1500, 1750), to: 700, type: 'triangle', dur: 0.18, gain: v * 0.8 });
        tone({ freq: rnd(2600, 3000), to: 1800, type: 'sine', dur: 0.12, gain: v * 0.4 });
        break;
      case 'ele':
        tone({ freq: rnd(380, 460), to: 1500, type: 'sawtooth', dur: 0.09, gain: v * 0.9 });
        noise({ dur: 0.07, gain: v * 0.7, freq: 3400, q: 3 });
        break;
      case 'sik':
      default:
        tone({ freq: rnd(1150, 1300), to: 380, type: 'triangle', dur: 0.1, gain: v * 1.1 });
        noise({ dur: 0.05, gain: v * 0.5, freq: 2200, q: 2 });
    }
  },

  boom(size = 1, vol = 1) {
    if (!canPlay(2)) return;
    noise({ dur: 0.3 * size, gain: 0.2 * vol, freq: 700, to: 90, q: 0.6, type: 'lowpass' });
    tone({ freq: 120 * (1 / size), to: 40, type: 'sine', dur: 0.32 * size, gain: 0.18 * vol });
  },

  death(vol = 1) {
    if (!canPlay()) return;
    tone({ freq: rnd(420, 520), to: 110, type: 'sawtooth', dur: 0.14, gain: 0.1 * vol });
    noise({ dur: 0.1, gain: 0.08 * vol, freq: 1400, to: 400, q: 1 });
  },

  /* Läckage ska kännas i magen — det är det enda som faktiskt kostar. */
  leak() {
    if (!ready || !enabled) return;
    tone({ freq: 220, to: 70, type: 'sawtooth', dur: 0.55, gain: 0.22 });
    tone({ freq: 110, to: 44, type: 'square', dur: 0.6, gain: 0.14 });
    noise({ dur: 0.4, gain: 0.14, freq: 400, to: 90, q: 0.8, type: 'lowpass' });
  },

  send() {
    if (!ready || !enabled) return;
    tone({ freq: 240, to: 620, type: 'triangle', dur: 0.16, gain: 0.14 });
    noise({ dur: 0.18, gain: 0.07, freq: 700, to: 2400, q: 1.2 });
  },

  build() {
    if (!ready || !enabled) return;
    tone({ freq: 330, to: 660, type: 'square', dur: 0.1, gain: 0.12 });
    tone({ freq: 660, type: 'sine', dur: 0.22, gain: 0.1 });
  },

  upgrade() {
    if (!ready || !enabled) return;
    [523, 659, 784].forEach((f, i) => {
      setTimeout(() => ready && tone({ freq: f, type: 'triangle', dur: 0.2, gain: 0.11 }), i * 55);
    });
  },

  /* Grenvalet är permanent — det ska låta som ett beslut. */
  branch() {
    if (!ready || !enabled) return;
    [392, 523, 659, 880].forEach((f, i) => {
      setTimeout(() => ready && tone({ freq: f, type: 'sine', dur: 0.4, gain: 0.12 }), i * 70);
    });
    noise({ dur: 0.5, gain: 0.06, freq: 300, to: 3000, q: 0.8 });
  },

  sell() {
    if (!ready || !enabled) return;
    tone({ freq: 520, to: 200, type: 'triangle', dur: 0.2, gain: 0.1 });
  },

  ui() {
    if (!ready || !enabled) return;
    tone({ freq: 900, to: 700, type: 'sine', dur: 0.05, gain: 0.07 });
  },

  denied() {
    if (!ready || !enabled) return;
    tone({ freq: 180, to: 120, type: 'square', dur: 0.11, gain: 0.09 });
  },

  wave(n = 1) {
    if (!ready || !enabled) return;
    tone({ freq: 70, to: 46, type: 'sine', dur: 0.9, gain: 0.2 });
    tone({ freq: 140 + n * 4, to: 100, type: 'triangle', dur: 0.7, gain: 0.09 });
    noise({ dur: 0.8, gain: 0.07, freq: 220, to: 1600, q: 0.7 });
  },

  income() {
    if (!ready || !enabled) return;
    tone({ freq: 1050, type: 'sine', dur: 0.09, gain: 0.05 });
    tone({ freq: 1570, type: 'sine', dur: 0.07, gain: 0.03 });
  },

  win() {
    if (!ready || !enabled) return;
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => ready && tone({ freq: f, type: 'triangle', dur: 0.6, gain: 0.14 }), i * 130));
  },

  lose() {
    if (!ready || !enabled) return;
    [392, 330, 262, 196].forEach((f, i) =>
      setTimeout(() => ready && tone({ freq: f, type: 'sawtooth', dur: 0.7, gain: 0.13 }), i * 170));
  },
};

/* ============================================================
   Musik — generativ ambient som tätnar när det brinner.
   Ingen loop-fil, bara en schemaläggare som lägger ut toner.
   ============================================================ */
const SCALE = [0, 3, 5, 7, 10];          // moll-pentatonisk
const ROOTS = [55, 62, 49, 58];          // A1, D2, G1, Bb1 — skiftar var 8:e takt
let step = 0, nextNoteAt = 0, timer = null;

export function setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); }

export function startMusic() {
  if (!ready || !enabled || musicOn) return;
  musicOn = true;
  musicBus.gain.setTargetAtTime(0.5, now(), 1.5);
  nextNoteAt = now() + 0.1;
  timer = setInterval(scheduler, 60);
}

export function stopMusic() {
  musicOn = false;
  clearInterval(timer);
  timer = null;
  if (musicBus) musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
}

function scheduler() {
  if (!musicOn || !ready) return;
  const spb = 0.5;                        // 120 bpm, en ton per åttondel
  while (nextNoteAt < now() + 0.3) {
    playStep(step, nextNoteAt);
    nextNoteAt += spb / 2;
    step++;
  }
}

function playStep(i, at) {
  const bar = Math.floor(i / 8);
  const root = ROOTS[Math.floor(bar / 8) % ROOTS.length];
  const beat = i % 8;

  // Bas på 1 och 5 — hjärtslaget.
  if (beat === 0 || beat === 4) {
    schedTone(root, root * 0.98, 'sine', 0.9, 0.22, at);
    schedTone(root * 2, root * 1.98, 'triangle', 0.5, 0.06, at);
  }
  // Puls som följer hotnivån
  if (intensity > 0.25 && beat % 2 === 1) {
    schedNoise(0.06, 0.04 + intensity * 0.05, 4200, at);
  }
  if (intensity > 0.6 && beat === 6) {
    schedNoise(0.18, 0.06, 900, at);
  }
  // Pad-ackord var takt
  if (beat === 0) {
    [0, 2, 4].forEach((n, k) => {
      const semi = SCALE[(n + bar) % SCALE.length];
      schedTone(root * 4 * Math.pow(2, semi / 12), null, 'sine', 3.2, 0.035, at + k * 0.02);
    });
  }
  // Glesa melodiska stänk, tätare när det är stressigt
  if (Math.random() < 0.12 + intensity * 0.3) {
    const semi = SCALE[Math.floor(Math.random() * SCALE.length)];
    const oct = Math.random() < 0.5 ? 8 : 16;
    schedTone(root * oct * Math.pow(2, semi / 12), null, 'triangle', 0.5, 0.03, at);
  }
}

function schedTone(freq, to, type, dur, gain, at) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(musicBus);
  o.start(at); o.stop(at + dur + 0.05);
}

function schedNoise(dur, gain, freq, at) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  s.connect(f); f.connect(g); g.connect(musicBus);
  s.start(at); s.stop(at + dur + 0.02);
}

/* Liten hjälpare för haptik — samma "känns" som ljudet ger. */
export function buzz(ms) {
  if (!enabled) return;
  try { navigator.vibrate?.(ms); } catch { /* stöds inte */ }
}
