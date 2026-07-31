import { TOWERS, CREEPS, sendHpMul } from './config.js';
import { pPos } from './board.js';

const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

let SEQ = 0;

export function spawn(b, type, wave, lv = 0, hpMulExtra = 1) {
  const d = CREEPS[type];
  const hp = d.hp * wave * sendHpMul(lv) * hpMulExtra;
  const n = d.count || 1;
  for (let i = 0; i < n; i++) {
    b.creeps.push({
      id: ++SEQ,
      type, lv,
      t: -i * 0.5 - Math.random() * 0.3,
      hp, maxHp: hp,
      spd: d.spd, slow: 0, slowT: 0, r: d.r,
      armor: (d.armor || 0) * (1 + lv * 0.25),
      regen: (d.regen || 0) * wave * sendHpMul(lv),
      bounty: Math.round(d.bounty * (1 + lv * 0.3) * Math.min(3, wave)),
      leak: d.leak, wob: Math.random() * 6.28, flash: 0, dead: false,
    });
  }
}

/* Pansar är platt avdrag per träff — därför är många små skott (PULS)
   dåliga mot BJÄSSE, medan RAIL och BLAST går rakt igenom.
   Minst 12% av skadan går alltid fram så inget blir helt immunt.     */
function applyDamage(c, amount, pierce = 0) {
  const armor = Math.max(0, c.armor * (1 - pierce));
  return Math.max(amount * 0.12, amount - armor);
}

export function damage(b, c, amount, pierce, hooks) {
  if (c.dead) return;
  c.hp -= applyDamage(c, amount, pierce);
  c.flash = 1;
  if (c.hp <= 0) {
    c.dead = true;
    const p = pPos(b, c.t);
    addFx(b, 'boom', p.x, p.y, CREEPS[c.type].color, 0.55 + c.r);
    if (hooks.onKill) hooks.onKill(c, p);
  }
}

export function addFx(b, k, x, y, color, r) {
  const life = k === 'boom' ? 0.42 : k === 'ring' ? 0.5 : 0.24;
  b.fx.push({ k, x, y, color, life, max: life, r: r || 0.5 });
}

export function addFloat(b, x, y, text, color) {
  b.floats.push({ x, y, text, color, life: 0.9, max: 0.9 });
}

/* ---------- torn skjuter ---------- */
function fire(b, tw, dt, hooks) {
  tw.cd -= dt;
  tw.flash = Math.max(0, tw.flash - dt * 5);
  if (tw.cd > 0) return;
  const st = TOWERS[tw.type].lv[tw.lv];
  const r2 = st.range * st.range;

  // Målval: creepen som hunnit längst och är inom räckvidd.
  let best = null, bestT = -1;
  for (const c of b.creeps) {
    if (c.dead || c.t < 0) continue;
    const p = pPos(b, c.t);
    if (c.t > bestT && dist2(tw.cx, tw.cy, p.x, p.y) <= r2) { best = c; bestT = c.t; }
  }
  if (!best) return;

  const p = pPos(b, best.t);
  tw.angle = Math.atan2(p.y - tw.cy, p.x - tw.cx);
  tw.cd = st.rate;
  tw.flash = 1;

  if (tw.type === 'arc') {
    const hits = [best];
    let cur = best;
    for (let i = 1; i < st.chain; i++) {
      let nx = null, nd = 1e9;
      const cp = pPos(b, cur.t);
      for (const c of b.creeps) {
        if (c.dead || c.t < 0 || hits.includes(c)) continue;
        const q = pPos(b, c.t);
        const d = dist2(cp.x, cp.y, q.x, q.y);
        if (d < 4.84 && d < nd) { nd = d; nx = c; }
      }
      if (!nx) break;
      hits.push(nx); cur = nx;
    }
    const pts = [{ x: tw.cx, y: tw.cy }];
    hits.forEach((c, i) => {
      const q = pPos(b, c.t);
      pts.push({ x: q.x, y: q.y });
      damage(b, c, st.dmg * Math.pow(0.78, i), 0, hooks);
    });
    b.bolts.push({ pts, life: 0.2, color: TOWERS.arc.color });
    return;
  }

  b.shots.push({
    x: tw.cx, y: tw.cy, target: best, type: tw.type, st,
    spd: tw.type === 'blast' ? 8 : tw.type === 'rail' ? 26 : 15,
    color: TOWERS[tw.type].color, trail: [],
  });
}

function stepShots(b, dt, hooks) {
  for (const s of b.shots) {
    if (s.done) continue;
    if (s.target.dead && s.type !== 'blast') { s.done = true; continue; }
    const tp = pPos(b, Math.max(0, s.target.t));
    const dx = tp.x - s.x, dy = tp.y - s.y;
    const d = Math.hypot(dx, dy);
    const step = s.spd * dt;
    if (d <= step || d < 0.12) {
      s.done = true;
      if (s.type === 'blast') {
        const aoe = s.st.splash;
        for (const c of b.creeps) {
          if (c.dead || c.t < 0) continue;
          const q = pPos(b, c.t);
          if (dist2(q.x, q.y, tp.x, tp.y) <= aoe * aoe) damage(b, c, s.st.dmg, s.st.pierce || 0, hooks);
        }
        addFx(b, 'boom', tp.x, tp.y, '#ff9d54', s.st.splash);
      } else {
        damage(b, s.target, s.st.dmg, s.st.pierce || 0, hooks);
        if (s.type === 'cryo') {
          s.target.slow = Math.max(s.target.slow, s.st.slow);
          s.target.slowT = s.st.slowT;
        }
        addFx(b, 'spark', tp.x, tp.y, s.color);
      }
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
    if (c.regen && c.hp < c.maxHp) c.hp = Math.min(c.maxHp, c.hp + c.regen * dt);
    c.wob += dt * 6;
    c.t += c.spd * (1 - c.slow) * dt;
    if (c.t >= b.len) {
      c.dead = true;
      leaked += c.leak;
      b.shake = 1;
      b.hurt = 1;
      const p = pPos(b, b.len);
      addFx(b, 'ring', p.x, p.y, '#ff5d73', 1.2);
    }
  }
  b.creeps = b.creeps.filter(c => !c.dead);
  if (leaked > 0 && hooks.onLeak) hooks.onLeak(leaked);
}

function stepFx(b, dt) {
  b.shake = Math.max(0, b.shake - dt * 3);
  b.hurt = Math.max(0, b.hurt - dt * 2);
  for (const f of b.fx) f.life -= dt;
  b.fx = b.fx.filter(f => f.life > 0);
  for (const bo of b.bolts) bo.life -= dt;
  b.bolts = b.bolts.filter(bo => bo.life > 0);
  for (const f of b.floats) { f.life -= dt; f.y -= dt * 0.8; }
  b.floats = b.floats.filter(f => f.life > 0);
}

export function stepBoard(b, dt, hooks = {}) {
  for (const tw of b.towers) fire(b, tw, dt, hooks);
  stepShots(b, dt, hooks);
  stepCreeps(b, dt, hooks);
  stepFx(b, dt);
}

/* Fjärrbana (multiplayer): vi simulerar inte, vi extrapolerar mellan
   snapshots så det ser levande ut i stället för att hacka i 6 fps. */
export function stepRemote(b, dt) {
  for (const c of b.creeps) c.t += c.spd * (1 - c.slow) * dt;
  stepFx(b, dt);
}

export function towerDps(type, lv) {
  const st = TOWERS[type].lv[lv];
  const mult = type === 'arc' ? st.chain * 0.7 : type === 'blast' ? 2.2 : 1;
  return Math.round(st.dmg / st.rate * mult);
}
