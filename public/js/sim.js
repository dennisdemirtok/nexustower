import { CREEPS, ECON, sendHpMul, towerStat, towerFace, dmgMul, creepBounty, tierHpMul } from './config.js';
import { cPos, nextStep, progress, distAt } from './board.js';
import { COLS, ROWS } from './config.js';

const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

let SEQ = 0;

export function spawn(b, type, wave, lv = 0, hpMulExtra = 1) {
  const d = CREEPS[type];
  const hp = d.hp * tierHpMul(type) * wave * sendHpMul(lv) * hpMulExtra;
  const n = d.count || 1;
  for (let i = 0; i < n; i++) {
    b.creeps.push({
      id: ++SEQ,
      type, lv, cls: d.cls, fly: !!d.fly,
      /* Marktrupper har egna koordinater och följer flödesfältet.
         Jittret gör att de inte går exakt i samma spår. */
      x: b.entry[0] + (Math.random() - 0.5) * 0.5,
      y: b.entry[1],
      jx: (Math.random() - 0.5) * 0.34,
      jy: (Math.random() - 0.5) * 0.34,
      t: -i * 0.5 - Math.random() * 0.3,
      hp, maxHp: hp,
      spd: d.spd, slow: 0, slowT: 0, r: d.r,
      burn: 0, burnT: 0, dbuff: 0,
      magicImmune: !!d.magicImmune,
      splashResist: d.splashResist || 0,
      regen: (d.regen || 0) * wave * sendHpMul(lv),
      bounty: creepBounty(type) * (1 + lv * 0.3),
      leak: d.leak,
      wob: Math.random() * 6.28, bob: Math.random() * 6.28,
      flash: 0, dead: false,
    });
  }
}

/* Skadeberäkning: typ mot pansarklass.
   GAUSS (trueDmg) går utanför tabellen helt.
   LUFTVÄRN (airBonus) lägger på en extra faktor mot FLYG.        */
const MAGIC = new Set(['ter', 'kry', 'ele']);

export function effective(amount, st, cls, c) {
  if (st && st.trueDmg) return amount;
  let m = dmgMul(st && st.dmgType, cls);
  if (st && st.airBonus && cls === 'flyg') m *= st.airBonus;
  // PRÄSTINNA: eld, is och blixt biter knappt.
  if (c && c.magicImmune && st && MAGIC.has(st.dmgType)) m *= 0.25;
  // DRAKE: halv skada från sprängverkan.
  if (c && c.splashResist && st && st.splash) m *= 1 - c.splashResist;
  return amount * m;
}

export function damage(b, c, amount, st, hooks) {
  if (c.dead) return 0;
  const dealt = effective(amount, st, c.cls, c);
  c.hp -= dealt;
  c.flash = 1;
  if (c.hp <= 0) {
    c.dead = true;
    const p = cPos(b, c);
    addFx(b, 'boom', p.x, p.y, CREEPS[c.type].color, 0.55 + c.r);
    addParts(b, p.x, p.y, c.r > 0.3 ? 12 : 7, CREEPS[c.type].color, 2.6 + c.r * 3);
    // BEHEMOTH lämnar en avskedspresent.
    const ds = CREEPS[c.type].deathSpawn;
    if (ds) {
      for (let i = 0; i < ds.count; i++) {
        spawn(b, ds.key, 1, c.lv);
        const n = b.creeps[b.creeps.length - 1];
        n.x = p.x + (Math.random() - 0.5) * 0.8;
        n.y = p.y + (Math.random() - 0.5) * 0.8;
        n.t = 0;
      }
    }
    if (hooks.onKill) hooks.onKill(c, p);
  }
  return dealt;
}

export function addFx(b, k, x, y, color, r) {
  const life = k === 'boom' ? 0.42 : k === 'ring' ? 0.5 : 0.24;
  b.fx.push({ k, x, y, color, life, max: life, r: r || 0.5 });
}

/* Spillror. Rutkoordinater som allt annat, med lite gravitation så de
   faller ner mot banan i stället för att sväva bort. */
export function addParts(b, x, y, n, color, spread = 2.2, life = 0.5) {
  if (b.parts.length > 220) return;      // tak så mobilen inte kvävs
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = spread * (0.3 + Math.random() * 0.7);
    b.parts.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 0.6,
      life: life * (0.6 + Math.random() * 0.6),
      max: life,
      size: 0.5 + Math.random(),
      color,
    });
  }
}

export function addFloat(b, x, y, text, color) {
  b.floats.push({ x, y, text, color, life: 0.9, max: 0.9 });
}

/* Statistiken för ett torn, med skadetypen inbakad så sim och UI
   alltid är överens om vad som faktiskt skjuts. */
export function statOf(tw) {
  const st = towerStat(tw.type, tw.lv, tw.branch);
  const face = towerFace(tw.type, tw.lv, tw.branch);
  return { ...st, dmgType: face.dmg, color: face.color };
}

/* ---------- torn skjuter ---------- */
function targetsInRange(b, tw, st, max) {
  const r2 = st.range * st.range;
  const found = [];
  for (const c of b.creeps) {
    if (c.dead || c.t < 0) continue;
    const p = cPos(b, c);
    if (dist2(tw.cx, tw.cy, p.x, p.y) <= r2) found.push({ c, p });
  }
  // Den som hunnit längst är farligast — skjut på den först.
  found.sort((a, z) => progress(b, z.c) - progress(b, a.c));
  return found.slice(0, max);
}

function fire(b, tw, dt, hooks) {
  tw.cd -= dt;
  tw.flash = Math.max(0, tw.flash - dt * 5);
  if (tw.cd > 0) return;

  const st = statOf(tw);
  if (tw.dbuff > 0) st.dmg *= 1 - tw.dbuff;
  const picks = targetsInRange(b, tw, st, st.multi || 1);
  if (!picks.length) return;

  const first = picks[0];
  tw.angle = Math.atan2(first.p.y - tw.cy, first.p.x - tw.cx);
  tw.cd = st.rate;
  tw.flash = 1;
  tw.recoil = 1;
  if (hooks.onFire) hooks.onFire(st);

  if (st.chain) {
    const hits = [first.c];
    let cur = first.c;
    for (let i = 1; i < st.chain; i++) {
      let nx = null, nd = 1e9;
      const cp = cPos(b, cur);
      for (const c of b.creeps) {
        if (c.dead || c.t < 0 || hits.includes(c)) continue;
        const q = cPos(b, c);
        const d = dist2(cp.x, cp.y, q.x, q.y);
        if (d < 4.84 && d < nd) { nd = d; nx = c; }
      }
      if (!nx) break;
      hits.push(nx); cur = nx;
    }
    const pts = [{ x: tw.cx, y: tw.cy }];
    hits.forEach((c, i) => {
      const q = cPos(b, c);
      pts.push({ x: q.x, y: q.y });
      damage(b, c, st.dmg * Math.pow(0.8, i), st, hooks);
    });
    b.bolts.push({ pts, life: 0.2, color: st.color });
    return;
  }

  for (const pick of picks) {
    b.shots.push({
      x: tw.cx, y: tw.cy, target: pick.c, st,
      spd: st.splash ? 8 : st.range > 4 ? 26 : 15,
      color: st.color, trail: [],
    });
  }
}

function impact(b, s, tp, hooks) {
  const st = s.st;
  if (hooks.onImpact) hooks.onImpact(st);
  if (st.splash) {
    const aoe = st.splash;
    for (const c of b.creeps) {
      if (c.dead || c.t < 0) continue;
      const q = cPos(b, c);
      if (dist2(q.x, q.y, tp.x, tp.y) <= aoe * aoe) {
        damage(b, c, st.dmg, st, hooks);
        applyOnHit(c, st);
      }
    }
    addFx(b, 'boom', tp.x, tp.y, st.color, st.splash);
    addParts(b, tp.x, tp.y, 9, st.color, 3.2 * st.splash, 0.42);
    return;
  }
  damage(b, s.target, st.dmg, st, hooks);
  applyOnHit(s.target, st);
  addFx(b, 'spark', tp.x, tp.y, st.color);
  addParts(b, tp.x, tp.y, 3, st.color, 1.6, 0.26);
}

function applyOnHit(c, st) {
  if (c.dead) return;
  if (st.slow) { c.slow = Math.max(c.slow, st.slow); c.slowT = st.slowT; }
  if (st.burn) { c.burn = Math.max(c.burn, st.burn / st.burnT); c.burnT = st.burnT; c.burnSt = st; }
}

function stepShots(b, dt, hooks) {
  for (const s of b.shots) {
    if (s.done) continue;
    if (s.target.dead && !s.st.splash) { s.done = true; continue; }
    const tp = cPos(b, s.target);
    const dx = tp.x - s.x, dy = tp.y - s.y;
    const d = Math.hypot(dx, dy);
    const step = s.spd * dt;
    if (d <= step || d < 0.12) {
      s.done = true;
      impact(b, s, tp, hooks);
    } else {
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 5) s.trail.shift();
      s.x += dx / d * step;
      s.y += dy / d * step;
    }
  }
  b.shots = b.shots.filter(s => !s.done);
}

function stepCreeps(b, dt, hooks) {
  let leaked = 0;
  for (const c of b.creeps) {
    if (c.dead) continue;
    c.flash = Math.max(0, c.flash - dt * 6);
    if (c.slowT > 0) { c.slowT -= dt; if (c.slowT <= 0) c.slow = 0; }
    if (c.burnT > 0) {
      c.burnT -= dt;
      damage(b, c, c.burn * dt, c.burnSt, hooks);
      if (c.burnT <= 0) c.burn = 0;
      if (c.dead) continue;
    }
    if (c.regen && c.hp < c.maxHp) c.hp = Math.min(c.maxHp, c.hp + c.regen * dt);
    c.wob += dt * 6;
    c.bob += dt * 2.4;

    /* t < 0 är utsläppsfördröjning så en grupp inte spawnar ovanpå varandra.
       Gäller båda sorterna; flygande använder t även som färdsträcka sedan. */
    if (c.t < 0) { c.t += dt; continue; }

    const step = c.spd * (1 - c.slow) * dt;
    let arrived = false;

    if (c.fly) {
      c.t += step;
      arrived = c.t >= b.air.len;
    } else {
      /* Följ flödesfältet: gå mot grannrutan med kortast väg till målet.
         Byggs ett torn räknas fältet om och creepen svänger av sig själv. */
      const cx = Math.max(0, Math.min(COLS - 1, Math.round(c.x)));
      const cy = Math.max(0, Math.min(ROWS - 1, Math.round(c.y)));
      if (cx === b.exit[0] && cy === b.exit[1]) {
        arrived = true;
      } else {
        const n = nextStep(b, cx, cy);
        const tx = (n ? n.x : b.exit[0]) + c.jx;
        const ty = (n ? n.y : b.exit[1]) + c.jy;
        const dx = tx - c.x, dy = ty - c.y;
        const d = Math.hypot(dx, dy);
        if (d <= step || d < 0.02) { c.x = tx; c.y = ty; }
        else { c.x += dx / d * step; c.y += dy / d * step; }
      }
    }

    if (arrived) {
      c.dead = true;
      leaked += c.leak;
      b.shake = 1;
      b.hurt = 1;
      const p = cPos(b, c);
      addFx(b, 'ring', p.x, p.y, '#ff5d73', 1.2);
      addParts(b, p.x, p.y, 16, '#ff5d73', 4, 0.7);
    }
  }
  b.creeps = b.creeps.filter(c => !c.dead);
  if (leaked > 0 && hooks.onLeak) hooks.onLeak(leaked);
}

function stepFx(b, dt) {
  b.shake = Math.max(0, b.shake - dt * 3);
  b.hurt = Math.max(0, b.hurt - dt * 2);
  for (const tw of b.towers) if (tw.recoil > 0) tw.recoil = Math.max(0, tw.recoil - dt * 9);
  for (const p of b.parts) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += dt * 4.5;                 // gravitation
    p.vx *= 1 - dt * 2.2;             // luftmotstånd
  }
  b.parts = b.parts.filter(p => p.life > 0);
  for (const f of b.fx) f.life -= dt;
  b.fx = b.fx.filter(f => f.life > 0);
  for (const bo of b.bolts) bo.life -= dt;
  b.bolts = b.bolts.filter(bo => bo.life > 0);
  for (const f of b.floats) { f.life -= dt; f.y -= dt * 0.8; }
  b.floats = b.floats.filter(f => f.life > 0);
}

/* Auror: SHAMAN läker allt omkring sig, JÄTTE sänker eldkraften hos torn
   den passerar. Båda räknas om en gång per steg i stället för per par. */
function stepAuras(b, dt) {
  for (const tw of b.towers) tw.dbuff = 0;
  for (const c of b.creeps) {
    if (c.dead || c.t < 0) continue;
    const d = CREEPS[c.type];
    const p = cPos(b, c);
    if (d.healAura) {
      const r2 = d.healRange * d.healRange;
      for (const o of b.creeps) {
        if (o.dead || o === c || o.hp >= o.maxHp) continue;
        const q = cPos(b, o);
        if (dist2(p.x, p.y, q.x, q.y) <= r2) o.hp = Math.min(o.maxHp, o.hp + d.healAura * dt);
      }
    }
    if (d.towerDebuff) {
      const r2 = d.debuffRange * d.debuffRange;
      for (const tw of b.towers) {
        if (dist2(p.x, p.y, tw.cx, tw.cy) <= r2) tw.dbuff = Math.max(tw.dbuff, d.towerDebuff);
      }
    }
  }
}

export function stepBoard(b, dt, hooks = {}) {
  stepAuras(b, dt);
  for (const tw of b.towers) fire(b, tw, dt, hooks);
  stepShots(b, dt, hooks);
  stepCreeps(b, dt, hooks);
  stepFx(b, dt);
}

/* Fjärrbana (multiplayer): vi simulerar inte, vi extrapolerar mellan
   snapshots så det ser levande ut i stället för att hacka i 6 fps. */
export function stepRemote(b, dt) {
  for (const c of b.creeps) {
    const step = c.spd * (1 - c.slow) * dt;
    if (c.fly) { c.t += step; continue; }
    const cx = Math.max(0, Math.min(COLS - 1, Math.round(c.x)));
    const cy = Math.max(0, Math.min(ROWS - 1, Math.round(c.y)));
    const n = nextStep(b, cx, cy);
    if (n) {
      const dx = n.x - c.x, dy = n.y - c.y;
      const d = Math.hypot(dx, dy) || 1;
      c.x += dx / d * step; c.y += dy / d * step;
    }
    c.bob += dt * 2.4; c.wob += dt * 6;
  }
  stepFx(b, dt);
}

/* Ungefärlig DPS för UI och AI. Räknar in splash/kedja/multi grovt. */
export function towerDps(type, lv, branch) {
  const st = towerStat(type, lv, branch);
  let mult = 1;
  if (st.chain) mult = st.chain * 0.75;
  else if (st.splash) mult = 2.2;
  else if (st.multi) mult = st.multi;
  const burn = st.burn ? st.burn / st.rate : 0;
  return Math.round((st.dmg / st.rate) * mult + burn);
}

/* DPS mot en specifik pansarklass — det är den siffran som betyder något. */
export function towerDpsVs(type, lv, branch, cls) {
  const st = towerStat(type, lv, branch);
  const face = towerFace(type, lv, branch);
  const base = towerDps(type, lv, branch);
  return Math.round(effective(base, { ...st, dmgType: face.dmg }, cls));
}
