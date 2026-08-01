import {
  TOWERS, TOWER_KEYS, CREEPS, CREEP_KEYS, MAPS, ECON, DMG, ARMOR, TYPE_VS,
  buildCost, sendUpCost, creepIncome, MAX_TOWER_LV, BASE_LEVELS,
  towerStat, towerFace, needsBranch,
} from './config.js';
import { towerDps, towerDpsVs } from './sim.js';
import * as Audio from './audio.js';

export const $ = id => document.getElementById(id);
let H = {};           // handlers från main.js
let G = null;         // aktuell spelstat (sätts av setState)

export function initUI(handlers) {
  H = handlers;

  $('tabDef').addEventListener('click', () => H.setView('def'));
  $('tabAtk').addEventListener('click', () => H.setView('atk'));
  $('viewBtn').addEventListener('click', () => H.setView(G && G.view === 'def' ? 'atk' : 'def'));
  $('pauseBtn').addEventListener('click', () => H.togglePause());
  $('speedBtn').addEventListener('click', () => H.cycleSpeed());
  $('armoryBtn').addEventListener('click', () => openArmory());
  $('infoBtn').addEventListener('click', () => openInfo());
  $('sheetScrim').addEventListener('click', () => closeSheets());

  const sb = $('soundBtn');
  const paintSound = () => {
    sb.textContent = Audio.isEnabled() ? '🔊' : '🔇';
    sb.classList.toggle('off', !Audio.isEnabled());
  };
  sb.addEventListener('click', () => {
    Audio.unlock();
    Audio.setEnabled(!Audio.isEnabled());
    if (Audio.isEnabled() && G && !G.over) Audio.startMusic();
    paintSound();
    Audio.sfx.ui();
  });
  paintSound();

  $('modeCampaign').addEventListener('click', () => showMenu('campaign'));
  $('modeOnline').addEventListener('click', () => showMenu('online'));
  $('mmFind').addEventListener('click', () => H.findMatch($('mmName').value.trim() || 'PILOT'));
  $('mmCancel').addEventListener('click', () => { H.cancelMatch(); showMenu('online'); });

  $('endNext').addEventListener('click', () => H.nextSector());
  $('endAgain').addEventListener('click', () => H.replay());
  $('endMenu').addEventListener('click', () => { H.leave(); showMenu(); });

  buildSendbar();
}

export function setState(g) { G = g; }

/* ============ HUD ============ */
export function updateHUD() {
  if (!G) return;
  $('pLives').textContent = Math.max(0, G.me.board.lives);
  $('eLives').textContent = Math.max(0, G.foe.board.lives);
  $('gold').textContent = Math.floor(G.me.gold);
  $('inc').textContent = G.me.income;
  const t = Math.floor(G.time);
  $('wave').textContent = `VÅG ${G.wave + 1} · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  $('incBar').style.width = (100 * (1 - G.incT / ECON.incInterval)) + '%';
  refreshSendbarState();
}

export function pop(id) {
  const el = $(id).parentElement;
  el.classList.add('pop');
  setTimeout(() => el.classList.remove('pop'), 260);
}

export function toast(m) {
  const t = $('toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 1600);
}

export function banner(title, sub) {
  const b = $('banner');
  b.innerHTML = title + (sub ? `<span class="sub">${sub}</span>` : '');
  b.classList.add('show');
  clearTimeout(b._h);
  b._h = setTimeout(() => b.classList.remove('show'), 1900);
}

export function setViewTabs(v) {
  $('tabDef').classList.toggle('active', v === 'def');
  $('tabAtk').classList.toggle('active', v === 'atk');
  $('viewBtn').textContent = v === 'def' ? 'VÄXLA VY ⚔' : 'VÄXLA VY 🛡';
  $(v === 'def' ? 'dotDef' : 'dotAtk').classList.remove('on');
}
export function alertTab(which) {
  if (document.body.classList.contains('dual')) return;
  if (G && G.view === which) return;
  $(which === 'def' ? 'dotDef' : 'dotAtk').classList.add('on');
}

/* ============ små byggstenar ============ */
const dmgChip = key =>
  `<span class="chip" style="color:${DMG[key].color};border-color:${DMG[key].color}55">${DMG[key].nm}</span>`;

const clsChip = key =>
  `<span class="chip" style="color:${ARMOR[key].color};border-color:${ARMOR[key].color}55">${ARMOR[key].glyph} ${ARMOR[key].nm}</span>`;

/* Effektivitetsrad: vad tornet gör mot varje pansarklass. */
function effRow(type, lv, branch) {
  const face = towerFace(type, lv, branch);
  const st = towerStat(type, lv, branch);
  return `<div class="effrow">` + Object.keys(ARMOR).map(cls => {
    let m = st.trueDmg ? 1 : (TYPE_VS[face.dmg][cls] ?? 1);
    if (st.airBonus && cls === 'flyg') m *= st.airBonus;
    const pct = Math.round(m * 100);
    const tone = pct >= 115 ? 'good' : pct <= 80 ? 'bad' : 'mid';
    return `<span class="eff ${tone}"><i>${ARMOR[cls].glyph}</i>${ARMOR[cls].nm}<b>${pct}%</b></span>`;
  }).join('') + `</div>`;
}

function creepIcon(key, s = 20) {
  const d = CREEPS[key], c = d.color, h = s / 2;
  let inner;
  if (d.shape === 'dart') inner = `<polygon points="${s * .85},${h} ${s * .18},${s * .85} ${s * .35},${h} ${s * .18},${s * .15}" fill="${c}"/>`;
  else if (d.shape === 'tank') inner = `<rect x="${s * .12}" y="${s * .24}" width="${s * .76}" height="${s * .52}" rx="${s * .18}" fill="${c}"/>`;
  else if (d.shape === 'boss') inner = `<polygon points="${h},${s * .06} ${s * .92},${h * .6} ${s * .92},${s * .76} ${h},${s * .96} ${s * .08},${s * .76} ${s * .08},${h * .6}" fill="${c}"/>`;
  else if (d.shape === 'wing') inner =
    `<polygon points="${h},${s * .18} ${s * .66},${h} ${h},${s * .82} ${s * .34},${h}" fill="${c}"/>` +
    `<polygon points="${s * .6},${s * .4} ${s * .98},${s * .22} ${s * .62},${s * .6}" fill="${c}" opacity=".8"/>` +
    `<polygon points="${s * .4},${s * .4} ${s * .02},${s * .22} ${s * .38},${s * .6}" fill="${c}" opacity=".8"/>`;
  else inner = `<circle cx="${h}" cy="${h}" r="${h * .74}" fill="${c}"/>`;
  const core = d.shape === 'wing' ? '' : `<circle cx="${h}" cy="${h}" r="${h * .27}" fill="#0a0d1c"/>`;
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${inner}${core}</svg>`;
}

function towerGlyph(type, size = 34, lv = 0, branch = null) {
  const face = towerFace(type, lv, branch);
  const c = face.color, s = size, h = s / 2, R = h * 0.78;
  const stroke = `fill="none" stroke="${c}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"`;
  const ring = (n, rot, rIn) => {
    const p = [];
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 / n) * i + rot;
      const r = rIn && i % 2 ? R * rIn : R;
      p.push(`${h + r * Math.cos(a)},${h + r * Math.sin(a)}`);
    }
    return `<polygon points="${p.join(' ')}" ${stroke}/>`;
  };
  let inner = '';
  switch (face.shape) {
    case 'tri': inner = `<polygon points="${h},${s * .14} ${s * .86},${s * .84} ${s * .14},${s * .84}" ${stroke}/>`; break;
    case 'hex': inner = ring(6, -Math.PI / 2); break;
    case 'dia': inner = `<polygon points="${h},${s * .12} ${s * .88},${h} ${h},${s * .88} ${s * .12},${h}" ${stroke}/>`; break;
    case 'star': inner = ring(8, -Math.PI / 2, 0.42); break;
    case 'shard': inner = ring(3, -Math.PI / 2) +
      `<path d="M${h} ${h} L${h} ${s * .12} M${h} ${h} L${s * .86} ${s * .68} M${h} ${h} L${s * .14} ${s * .68}" ${stroke}/>`; break;
    case 'flame': inner = `<path d="M${h} ${s * .12} Q${s * .88} ${h * .9} ${h} ${s * .9} Q${s * .12} ${h * .9} ${h} ${s * .12} Z" ${stroke}/>`; break;
    case 'bolt': inner = `<path d="M${s * .58} ${s * .1} L${s * .3} ${s * .52} L${s * .54} ${s * .52} L${s * .4} ${s * .9}" ${stroke}/>`; break;
    case 'aa': inner = `<path d="M${s * .36} ${s * .12} L${s * .36} ${s * .68} M${s * .64} ${s * .12} L${s * .64} ${s * .68} M${s * .18} ${s * .74} L${s * .82} ${s * .74}" ${stroke}/>`; break;
    default: inner = `<path d="M${h} ${s * .1} L${h} ${s * .78} M${s * .18} ${s * .5} L${s * .82} ${s * .5}" ${stroke}/>`;
  }
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><circle cx="${h}" cy="${h}" r="${h * .14}" fill="${c}"/>${inner}</svg>`;
}

/* ============ sendbar ============ */
export function buildSendbar() {
  const bar = $('sendbar');
  bar.innerHTML = '';
  for (const key of CREEP_KEYS) {
    const el = document.createElement('div');
    el.className = 'sendbtn';
    el.dataset.key = key;
    bar.appendChild(el);
    attachSendCard(el, key);
  }
  refreshSendbar();
}

/* Tap = skicka (köas om guldet inte räcker). Håll = öppna armén.
   Rörelse > 10 px räknas som scroll, inte tryck — det var därför
   sändningarna kändes opålitliga i v1.
   Hålltiden är 500 ms, inte 380: ett lite trögt tryck mitt i en strid
   råkade annars räknas som håll, och då uteblev sändningen helt. */
const LONG_PRESS = 500;

function attachSendCard(el, key) {
  let sx = 0, sy = 0, moved = false, lp = null;
  el.addEventListener('pointerdown', e => {
    sx = e.clientX; sy = e.clientY; moved = false;
    clearTimeout(lp);
    lp = setTimeout(() => { lp = null; openArmory(key); navigator.vibrate?.(12); }, LONG_PRESS);
  });
  el.addEventListener('pointermove', e => {
    if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) {
      moved = true; clearTimeout(lp); lp = null;
    }
  });
  el.addEventListener('pointerup', () => {
    if (lp) { clearTimeout(lp); lp = null; if (!moved) H.send(key); }
  });
  el.addEventListener('pointercancel', () => { clearTimeout(lp); lp = null; });
  el.addEventListener('pointerleave', () => { clearTimeout(lp); lp = null; });
}

/* Långa namn (DRÖNARE ×2) krymper i stället för att klippas på smal skärm. */
function nameTag(d) {
  const label = d.nm + (d.count ? ' ×' + d.count : '');
  const size = label.length > 8 ? ' style="font-size:7.2px"' : '';
  return `<div class="nm"${size}>${label}</div>`;
}

export function refreshSendbar() {
  if (!G) return;
  for (const el of document.querySelectorAll('.sendbtn')) {
    const key = el.dataset.key, d = CREEPS[key], lv = G.me.sendLv[key];
    const locked = G.me.income < d.unlock;
    const pips = `<div class="pips">${Array.from({ length: ECON.maxSendLv },
      (_, i) => `<span class="${i < lv ? 'on' : ''}"></span>`).join('')}</div>`;
    el.innerHTML = locked
      ? `<div class="cls" style="color:${ARMOR[d.cls].color}">${ARMOR[d.cls].glyph}</div>
         ${creepIcon(key)}<div class="nm">${d.nm}</div><div class="lockmsg">🔒${d.unlock}</div>`
      : `<div class="cls" style="color:${ARMOR[d.cls].color}">${ARMOR[d.cls].glyph}</div>
         ${creepIcon(key)}${nameTag(d)}
         <div class="pr">◆${d.cost}</div><div class="in">+${creepIncome(key)} ink</div>${pips}
         <div class="cdfill"></div><div class="qbadge" style="display:none"></div>`;
    el.classList.toggle('locked', locked);
  }
  refreshSendbarState();
}

/* Lätt uppdatering varje frame: råd/kö/cooldown. */
export function refreshSendbarState() {
  if (!G) return;
  for (const el of document.querySelectorAll('.sendbtn')) {
    const key = el.dataset.key, d = CREEPS[key];
    if (G.me.income < d.unlock) continue;
    el.classList.toggle('poor', G.me.gold < d.cost);
    const q = G.me.queue.filter(x => x === key).length;
    const badge = el.querySelector('.qbadge');
    if (badge) {
      badge.style.display = q ? '' : 'none';
      badge.textContent = q;
    }
    const fill = el.querySelector('.cdfill');
    if (fill) fill.style.width = (100 * Math.max(0, 1 - G.sendCd / ECON.sendCooldown)) + '%';
  }
}

/* ============ sheets ============ */
const sheets = () => [$('buildSheet'), $('upSheet'), $('armorySheet'), $('infoSheet')];

function openSheet(el) {
  const wasOpen = el.classList.contains('open');
  for (const s of sheets()) s.classList.toggle('open', s === el);
  $('sheetScrim').classList.add('on');
  if (!wasOpen) Audio.sfx.ui();
}

export function closeSheets() {
  for (const s of sheets()) s.classList.remove('open');
  $('sheetScrim').classList.remove('on');
  if (G) { G.sel = null; G.buildHint = false; G.previewRange = 0; }
}

export function openBuild() {
  const row = $('towrow');
  row.innerHTML = '';
  const n = G.me.board.towers.length;
  $('buildTax').textContent = n ? `+${Math.round((Math.pow(ECON.buildTax, n) - 1) * 100)} % byggskatt (${n} torn)` : '';
  for (const key of TOWER_KEYS) {
    const t = TOWERS[key];
    const cost = buildCost(key, n);
    const el = document.createElement('div');
    el.className = 'towcard' + (G.me.gold < cost ? ' poor' : '');
    el.innerHTML = `${towerGlyph(key)}
      <div class="nm" style="color:${t.color}">${t.name}</div>
      <div class="pr">◆${cost}</div>
      ${dmgChip(t.dmg)}
      <div class="ds">${t.tag}</div>`;
    el.addEventListener('pointerdown', e => { e.stopPropagation(); H.build(key); });
    el.addEventListener('pointerenter', () => { if (G) G.previewRange = t.lv[0].range; });
    row.appendChild(el);
  }
  G.buildHint = true;
  openSheet($('buildSheet'));
}

export function openTower(tw) {
  const face = towerFace(tw.type, tw.lv, tw.branch);
  const cur = towerStat(tw.type, tw.lv, tw.branch);
  const atFork = needsBranch(tw);
  const nxt = tw.lv + 1 < MAX_TOWER_LV && !atFork ? towerStat(tw.type, tw.lv + 1, tw.branch) : null;
  const sell = Math.floor(tw.invested * ECON.sellRate);
  const dpsNow = towerDps(tw.type, tw.lv, tw.branch);

  const stat = (label, a, b, suffix = '') =>
    `<span>${label} <b>${a}${suffix}</b>${b !== undefined && b !== null && b !== a ? ` <span class="up">→${b}${suffix}</span>` : ''}</span>`;

  let action;
  if (atFork) {
    // Grenvalet — det viktigaste beslutet i hela spelet.
    action = `<div class="forkhead">VÄLJ SPECIALISERING — permanent</div>
      <div class="forkrow">` + ['a', 'b'].map(br => {
      const b = TOWERS[tw.type].branches[br];
      const st = b.lv[0];
      const poor = G.me.gold < st.cost;
      return `<div class="forkcard ${poor ? 'poor' : ''}" data-br="${br}">
        ${towerGlyph(tw.type, 30, BASE_LEVELS, br)}
        <div class="fn" style="color:${b.color}">${b.name}</div>
        ${dmgChip(b.dmg)}
        <div class="fd">${b.tag}</div>
        <div class="fp">◆${st.cost}</div>
        ${effRow(tw.type, BASE_LEVELS, br)}
      </div>`;
    }).join('') + `</div>`;
  } else {
    action = `<div style="display:flex;gap:8px">
      <button class="btn upgrade ${(!nxt || G.me.gold < nxt.cost) ? 'disabled' : ''}" id="upBtn" style="flex:2">
        ${nxt ? `UPPGRADERA ◆${nxt.cost}` : 'MAXNIVÅ'}
      </button>
      <button class="btn sell" id="sellBtn" style="flex:1">SÄLJ ◆${sell}</button>
    </div>`;
  }

  $('upSheet').innerHTML = `<div class="grip"></div>
  <div class="uphead">
    ${towerGlyph(tw.type, 40, tw.lv, tw.branch)}
    <div style="flex:1">
      <div class="upname" style="color:${face.color}">${face.name}</div>
      <div class="upsub">Nivå ${tw.lv + 1}/${MAX_TOWER_LV}${nxt || atFork ? '' : ' · MAX'} · ${face.desc}</div>
    </div>
    ${dmgChip(face.dmg)}
  </div>
  <div class="upstats">
    ${stat('DPS', dpsNow, nxt ? towerDps(tw.type, tw.lv + 1, tw.branch) : null)}
    ${stat('SKADA', cur.dmg, nxt ? nxt.dmg : null)}
    ${stat('TAKT', cur.rate, nxt ? nxt.rate : null, 's')}
    ${stat('RÄCKV', cur.range, nxt ? nxt.range : null)}
    ${cur.slow ? stat('SAKTAR', Math.round(cur.slow * 100), nxt && nxt.slow ? Math.round(nxt.slow * 100) : null, '%') : ''}
    ${cur.chain ? stat('KEDJA', cur.chain, nxt ? nxt.chain : null) : ''}
    ${cur.multi ? stat('MÅL', cur.multi, nxt ? nxt.multi : null) : ''}
    ${cur.splash ? stat('AOE', cur.splash, nxt ? nxt.splash : null) : ''}
    ${cur.burn ? stat('BRAND', cur.burn, nxt ? nxt.burn : null, '/s') : ''}
    ${cur.airBonus ? `<span>MOT FLYG <b>×${cur.airBonus}</b></span>` : ''}
    ${cur.trueDmg ? `<span class="up">REN SKADA — inga multiplikatorer</span>` : ''}
  </div>
  ${cur.trueDmg ? '' : effRow(tw.type, tw.lv, tw.branch)}
  ${action}
  ${atFork ? `<button class="btn sell" id="sellBtn" style="width:100%;margin-top:8px">SÄLJ ◆${sell}</button>` : ''}`;

  openSheet($('upSheet'));
  if (atFork) {
    for (const card of $('upSheet').querySelectorAll('.forkcard')) {
      card.addEventListener('pointerdown', e => { e.stopPropagation(); H.upgradeTower(tw, card.dataset.br); });
    }
  } else {
    $('upBtn').addEventListener('pointerdown', e => { e.stopPropagation(); H.upgradeTower(tw); });
  }
  $('sellBtn').addEventListener('pointerdown', e => { e.stopPropagation(); H.sellTower(tw); });
}

export function openArmory(focusKey) {
  const row = $('armrow');
  row.innerHTML = '';
  for (const key of CREEP_KEYS) {
    const d = CREEPS[key], lv = G.me.sendLv[key];
    const maxed = lv >= ECON.maxSendLv;
    const cost = sendUpCost(key, lv);
    const locked = G.me.income < d.unlock;
    const el = document.createElement('div');
    el.className = 'armcard' + (maxed ? ' max' : '') + ((locked || G.me.gold < cost) ? ' poor' : '');
    el.style.outline = focusKey === key ? '1px solid var(--amber)' : '';
    el.innerHTML = `${creepIcon(key, 22)}
      <div class="nm">${d.nm}</div>
      ${clsChip(d.cls)}
      <div class="lv">${locked ? '🔒 inkomst ' + d.unlock : 'nivå ' + lv + '/' + ECON.maxSendLv}</div>
      <div class="note">${d.note}</div>
      <div class="pr">${maxed ? 'MAX' : locked ? '—' : '◆' + cost}</div>
      <div class="pips">${Array.from({ length: ECON.maxSendLv }, (_, i) => `<span class="${i < lv ? 'on' : ''}"></span>`).join('')}</div>`;
    if (!maxed && !locked) el.addEventListener('pointerdown', e => { e.stopPropagation(); H.upgradeSend(key); });
    row.appendChild(el);
  }
  openSheet($('armorySheet'));
}

/* Hela kontramatrisen — utan den är systemet osynligt för spelaren. */
export function openInfo() {
  const clsKeys = Object.keys(ARMOR);
  const head = clsKeys.map(c =>
    `<div class="mh" style="color:${ARMOR[c].color}">${ARMOR[c].glyph}<span>${ARMOR[c].nm}</span></div>`).join('');
  const rows = Object.keys(DMG).map(t => {
    const cells = clsKeys.map(c => {
      const m = TYPE_VS[t][c];
      const tone = m >= 1.15 ? 'good' : m <= 0.8 ? 'bad' : 'mid';
      return `<div class="mc ${tone}">${Math.round(m * 100)}%</div>`;
    }).join('');
    return `<div class="mr"><div class="ml" style="color:${DMG[t].color}">${DMG[t].nm}</div>${cells}</div>`;
  }).join('');

  const creeps = CREEP_KEYS.map(k => {
    const d = CREEPS[k];
    return `<div class="ci">${creepIcon(k, 18)}<b>${d.nm}</b>${clsChip(d.cls)}</div>`;
  }).join('');

  $('infoSheet').innerHTML = `<div class="grip"></div>
    <h3>Skadetyper mot pansarklasser</h3>
    <div class="matrix">
      <div class="mr head"><div class="ml"></div>${head}</div>
      ${rows}
    </div>
    <div class="armnote">Läs raden för att se vad ditt torn är bra mot. Läs kolumnen för
      att se vad du ska skicka mot motståndarens torn. <b>FLYG</b> följer inte vägen — de
      går rakt över banan, så ett torn i hörnet hinner aldrig skjuta på dem.</div>
    <div class="cilist">${creeps}</div>`;
  openSheet($('infoSheet'));
}

/* ============ menyer ============ */
let menuMode = 'campaign';

export function showMenu(mode) {
  if (mode) menuMode = mode;
  $('endOv').classList.add('hidden');
  $('mmOv').classList.add('hidden');
  $('startOv').classList.remove('hidden');
  $('modeCampaign').classList.toggle('on', menuMode === 'campaign');
  $('modeOnline').classList.toggle('on', menuMode === 'online');

  if (menuMode === 'online') {
    $('startOv').classList.add('hidden');
    $('mmOv').classList.remove('hidden');
    $('mmTitle').textContent = 'ONLINE 1v1';
    $('mmSub').textContent = 'Två spelare matchas automatiskt. Dela länken med en kompis så hamnar ni i samma kö.';
    $('mmFind').style.display = '';
    $('mmName').style.display = '';
    return;
  }

  const cleared = loadCleared();
  const ml = $('maplist');
  ml.classList.remove('hidden');
  ml.innerHTML = '';
  MAPS.forEach((m, i) => {
    const locked = i > 0 && !cleared.has(i - 1) && !cleared.has(i);
    const el = document.createElement('div');
    el.className = 'mapcard' + (cleared.has(i) ? ' done' : '') + (locked ? ' locked' : '');
    el.innerHTML = `<div class="no">${i + 1}</div>
      <div class="mi"><div class="mn">${m.name}</div>
      <div class="md">${m.short} · ${m.ai.nm}</div></div>
      <div class="st">${cleared.has(i) ? '✓' : locked ? '🔒' : '▶'}</div>`;
    if (!locked) el.addEventListener('click', () => H.startCampaign(i));
    ml.appendChild(el);
  });
}

export function showMatchmaking(text, sub) {
  $('startOv').classList.add('hidden');
  $('endOv').classList.add('hidden');
  $('mmOv').classList.remove('hidden');
  $('mmTitle').textContent = text;
  $('mmSub').textContent = sub;
  $('mmFind').style.display = 'none';
  $('mmName').style.display = 'none';
}

export function hideOverlays() {
  $('startOv').classList.add('hidden');
  $('mmOv').classList.add('hidden');
  $('endOv').classList.add('hidden');
}

export function showEnd({ win, title, sub, stats, showNext }) {
  const t = $('endTitle');
  t.textContent = title;
  t.className = win ? 'win' : '';
  $('endSub').textContent = sub;
  $('endStats').innerHTML = stats.map(s => `<div><b>${s.v}</b>${s.k}</div>`).join('');
  $('endNext').style.display = showNext ? '' : 'none';
  $('endOv').classList.remove('hidden');
  closeSheets();
}

/* ============ persistens ============ */
export function loadCleared() {
  try { return new Set(JSON.parse(localStorage.getItem('nw_cleared') || '[]')); }
  catch { return new Set(); }
}
export function saveCleared(set) {
  try { localStorage.setItem('nw_cleared', JSON.stringify([...set])); } catch { /* privat läge */ }
}
export function loadName() {
  try { return localStorage.getItem('nw_name') || ''; } catch { return ''; }
}
export function saveName(n) {
  try { localStorage.setItem('nw_name', n); } catch { /* ignorera */ }
}
