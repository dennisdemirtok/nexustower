import {
  TOWERS, TOWER_KEYS, CREEPS, CREEP_KEYS, MAPS, ECON,
  buildCost, sendUpCost, creepIncome, MAX_TOWER_LV,
} from './config.js';
import { towerDps } from './sim.js';

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
  $('sheetScrim').addEventListener('click', () => closeSheets());

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
  t._h = setTimeout(() => t.classList.remove('show'), 1500);
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

/* ============ ikoner ============ */
function creepIcon(key, s = 20) {
  const d = CREEPS[key], c = d.color, h = s / 2;
  let inner;
  if (d.shape === 'dart') inner = `<polygon points="${s * .85},${h} ${s * .18},${s * .85} ${s * .35},${h} ${s * .18},${s * .15}" fill="${c}"/>`;
  else if (d.shape === 'tank') inner = `<rect x="${s * .12}" y="${s * .24}" width="${s * .76}" height="${s * .52}" rx="${s * .18}" fill="${c}"/>`;
  else if (d.shape === 'boss') inner = `<polygon points="${h},${s * .06} ${s * .92},${h * .6} ${s * .92},${s * .76} ${h},${s * .96} ${s * .08},${s * .76} ${s * .08},${h * .6}" fill="${c}"/>`;
  else inner = `<circle cx="${h}" cy="${h}" r="${h * .74}" fill="${c}"/>`;
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${inner}<circle cx="${h}" cy="${h}" r="${h * .27}" fill="#0a0d1c"/></svg>`;
}

function towerGlyph(key, s = 34) {
  const t = TOWERS[key], c = t.color, h = s / 2;
  const poly = pts => `<polygon points="${pts}" fill="none" stroke="${c}" stroke-width="2.4" stroke-linejoin="round"/>`;
  let inner = '';
  if (t.shape === 'tri') inner = poly(`${h},${s * .12} ${s * .88},${s * .85} ${s * .12},${s * .85}`);
  if (t.shape === 'hex') {
    const p = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 6; p.push(`${h + h * .78 * Math.cos(a)},${h + h * .78 * Math.sin(a)}`); }
    inner = poly(p.join(' '));
  }
  if (t.shape === 'dia') inner = poly(`${h},${s * .1} ${s * .9},${h} ${h},${s * .9} ${s * .1},${h}`);
  if (t.shape === 'star') {
    const p = []; for (let i = 0; i < 8; i++) { const a = Math.PI / 4 * i; const r = i % 2 ? h * .35 : h * .82; p.push(`${h + r * Math.cos(a)},${h + r * Math.sin(a)}`); }
    inner = poly(p.join(' '));
  }
  if (t.shape === 'cross') inner = `<path d="M${h} ${s * .1} L${h} ${s * .78} M${s * .18} ${s * .5} L${s * .82} ${s * .5}" stroke="${c}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`;
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><circle cx="${h}" cy="${h}" r="${h * .15}" fill="${c}"/>${inner}</svg>`;
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
   sändningarna kändes opålitliga i v1. */
function attachSendCard(el, key) {
  let sx = 0, sy = 0, moved = false, lp = null;
  el.addEventListener('pointerdown', e => {
    sx = e.clientX; sy = e.clientY; moved = false;
    clearTimeout(lp);
    lp = setTimeout(() => { lp = null; openArmory(key); navigator.vibrate?.(12); }, 380);
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

export function refreshSendbar() {
  if (!G) return;
  for (const el of document.querySelectorAll('.sendbtn')) {
    const key = el.dataset.key, d = CREEPS[key], lv = G.me.sendLv[key];
    const locked = G.me.income < d.unlock;
    const pips = `<div class="pips">${Array.from({ length: ECON.maxSendLv },
      (_, i) => `<span class="${i < lv ? 'on' : ''}"></span>`).join('')}</div>`;
    el.innerHTML = locked
      ? `${creepIcon(key)}<div class="nm">${d.nm}</div><div class="lockmsg">🔒 ink ${d.unlock}</div>`
      : `${creepIcon(key)}<div class="nm">${d.nm}${d.count ? ' ×' + d.count : ''}</div>
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
const buildSheet = $('buildSheet'), upSheet = $('upSheet'), armorySheet = $('armorySheet');

function openSheet(el) {
  for (const s of [buildSheet, upSheet, armorySheet]) s.classList.toggle('open', s === el);
  $('sheetScrim').classList.add('on');
}

export function closeSheets() {
  for (const s of [buildSheet, upSheet, armorySheet]) s.classList.remove('open');
  $('sheetScrim').classList.remove('on');
  if (G) { G.sel = null; G.buildHint = false; G.previewRange = 0; }
}

export function openBuild() {
  const row = $('towrow');
  row.innerHTML = '';
  const n = G.me.board.towers.length;
  $('buildTax').textContent = n ? `+${Math.round((Math.pow(ECON.buildTax, n) - 1) * 100)}% byggskatt (${n} torn)` : '';
  for (const key of TOWER_KEYS) {
    const t = TOWERS[key];
    const cost = buildCost(key, n);
    const el = document.createElement('div');
    el.className = 'towcard' + (G.me.gold < cost ? ' poor' : '');
    el.innerHTML = `${towerGlyph(key)}
      <div class="nm" style="color:${t.color}">${t.name}</div>
      <div class="pr">◆${cost}</div>
      <div class="ds">${t.tag}</div>`;
    el.addEventListener('pointerdown', e => { e.stopPropagation(); H.build(key); });
    el.addEventListener('pointerenter', () => { if (G) G.previewRange = t.lv[0].range; });
    row.appendChild(el);
  }
  G.buildHint = true;
  openSheet(buildSheet);
}

export function openTower(tw) {
  const def = TOWERS[tw.type];
  const cur = def.lv[tw.lv], nxt = def.lv[tw.lv + 1];
  const sell = Math.floor(tw.invested * ECON.sellRate);
  const dpsNow = towerDps(tw.type, tw.lv);
  const dpsNext = nxt ? towerDps(tw.type, tw.lv + 1) : 0;
  const stat = (label, a, b, suffix = '') =>
    `<span>${label} <b>${a}${suffix}</b>${b !== undefined && b !== a ? ` <span class="up">→${b}${suffix}</span>` : ''}</span>`;

  upSheet.innerHTML = `<div class="grip"></div>
  <div style="display:flex;align-items:center;gap:11px;margin-bottom:9px">
    ${towerGlyph(tw.type, 40)}
    <div style="flex:1">
      <div style="font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:15px;color:${def.color}">${def.name}</div>
      <div style="font-size:11px;color:var(--muted)">Nivå ${tw.lv + 1}/${MAX_TOWER_LV}${nxt ? '' : ' · MAX'} · ${def.desc}</div>
    </div>
  </div>
  <div class="upstats">
    ${stat('DPS', dpsNow, nxt ? dpsNext : undefined)}
    ${stat('SKADA', cur.dmg, nxt ? nxt.dmg : undefined)}
    ${stat('TAKT', cur.rate, nxt ? nxt.rate : undefined, 's')}
    ${stat('RÄCKV', cur.range, nxt ? nxt.range : undefined)}
    ${cur.slow ? stat('SAKTAR', Math.round(cur.slow * 100), nxt ? Math.round(nxt.slow * 100) : undefined, '%') : ''}
    ${cur.chain ? stat('KEDJA', cur.chain, nxt ? nxt.chain : undefined) : ''}
    ${cur.splash ? stat('AOE', cur.splash, nxt ? nxt.splash : undefined) : ''}
    ${cur.pierce ? `<span>PANSARBRYT <b>${Math.round(cur.pierce * 100)}%</b></span>` : ''}
  </div>
  <div style="display:flex;gap:8px">
    <button class="btn upgrade ${(!nxt || G.me.gold < nxt.cost) ? 'disabled' : ''}" id="upBtn" style="flex:2">
      ${nxt ? `UPPGRADERA ◆${nxt.cost}` : 'MAXNIVÅ'}
    </button>
    <button class="btn sell" id="sellBtn" style="flex:1">SÄLJ ◆${sell}</button>
  </div>`;
  openSheet(upSheet);
  $('upBtn').addEventListener('pointerdown', e => { e.stopPropagation(); H.upgradeTower(tw); });
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
      <div class="lv">${locked ? '🔒 inkomst ' + d.unlock : 'nivå ' + lv + '/' + ECON.maxSendLv}</div>
      <div class="pr">${maxed ? 'MAX' : locked ? '—' : '◆' + cost}</div>
      <div class="pips">${Array.from({ length: ECON.maxSendLv }, (_, i) => `<span class="${i < lv ? 'on' : ''}"></span>`).join('')}</div>`;
    if (!maxed && !locked) el.addEventListener('pointerdown', e => { e.stopPropagation(); H.upgradeSend(key); });
    row.appendChild(el);
  }
  openSheet(armorySheet);
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
