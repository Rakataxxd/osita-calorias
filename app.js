'use strict';
/* Osita Calorías — contador de calorías y metas de peso al estilo de Huawei Salud.
   Todo vive en localStorage de este navegador; no hay servidor. */

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(n || 0).toLocaleString('es-GT');
const fmt1 = n => (Math.round((n || 0) * 10) / 10).toLocaleString('es-GT', { maximumFractionDigits: 1 });
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* ---------------- Fechas ---------------- */
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DIAL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const todayKey = () => keyOf(new Date());
const fmtShort = k => { const d = parseKey(k); return `${d.getDate()} ${MES[d.getMonth()]}`; };
const fmtLong = d => `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`;
function dayName(k) {
  const t = todayKey();
  if (k === t) return 'Hoy';
  if (k === addDays(t, -1)) return 'Ayer';
  if (k === addDays(t, 1)) return 'Mañana';
  const d = parseKey(k); return DIAL[d.getDay()][0].toUpperCase() + DIAL[d.getDay()].slice(1);
}

/* ---------------- Constantes ---------------- */
const MEALS = [
  { id: 'desayuno', name: 'Desayuno', min: .25, max: .30, art: 'sun' },
  { id: 'almuerzo', name: 'Almuerzo', min: .35, max: .40, art: 'bowl' },
  { id: 'cena', name: 'Cena', min: .25, max: .30, art: 'moon' },
  { id: 'refa', name: 'Refacciones', min: .05, max: .10, art: 'berry' },
];
// steps = pasos que ese nivel ya incluye; solo los de más cuentan como actividad extra
const ACTS = [
  { v: 1.2, n: 'Sedentaria', d: 'Estudio u oficina, camino poquito', steps: 3000 },
  { v: 1.375, n: 'Ligera', d: 'Camino un rato casi todos los días', steps: 5000 },
  { v: 1.55, n: 'Moderada', d: 'Paso de pie o caminando gran parte del día', steps: 7500 },
  { v: 1.725, n: 'Muy activa', d: 'Trabajo físico o muchísimo movimiento', steps: 10000 },
];
const PACES = [
  { v: .25, n: 'Suavecito', d: '¼ kg por semana · casi no se siente' },
  { v: .5, n: 'Recomendado', d: '½ kg por semana · el más sostenible', tag: 'Recomendado' },
  { v: .75, n: 'Rápido', d: '¾ kg por semana · hay que ser constante' },
  { v: 1, n: 'Intenso', d: '1 kg por semana · solo por poco tiempo' },
];
const MACRO_SPLITS = [
  { id: 'eq', n: 'Equilibrado', c: 50, p: 20, f: 30 },
  { id: 'pro', n: 'Alto en proteína', c: 40, p: 30, f: 30 },
  { id: 'low', n: 'Bajo en carbos', c: 30, p: 30, f: 40 },
];
const EXERCISES = [
  { n: 'Caminar', met: 3.5 }, { n: 'Caminar rápido', met: 4.3 }, { n: 'Correr', met: 8 },
  { n: 'Bicicleta', met: 6.8 }, { n: 'Bailar / zumba', met: 6.5 }, { n: 'Pesas / gym', met: 5 },
  { n: 'Yoga', met: 2.5 }, { n: 'Pilates', met: 3 }, { n: 'Natación', met: 6 },
  { n: 'Saltar cuerda', met: 11 }, { n: 'HIIT', met: 8 }, { n: 'Escaleras', met: 8 },
  { n: 'Limpiar la casa', met: 3.3 }, { n: 'Fútbol', met: 7 },
];
const WATER_CUPS = 8;

/* ---------------- Datos ---------------- */
const KEY = 'osita-calorias.v1';
const defaults = () => ({ v: 1, profile: null, days: {}, weights: [], custom: [], favs: [], recents: [], over: {}, del: {}, theme: 'fresa' });
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v) return Object.assign(defaults(), s); } catch (e) { }
  return defaults();
}
let S = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('No se pudo guardar [[cry]]'); }
  if (typeof nubeMarcar === 'function') nubeMarcar();
}
const UI = { tab: 'hoy', date: todayKey(), cal: null, wRange: '3m', weekEnd: todayKey() };

const emptyDay = () => ({ meals: { desayuno: [], almuerzo: [], cena: [], refa: [] }, ex: [], water: 0, steps: 0 });
const dayData = k => S.days[k] || emptyDay();
function dayMut(k) {
  if (!S.days[k]) S.days[k] = emptyDay();
  const d = S.days[k];
  d.u = Date.now(); // para mezclar bien si se usa en dos teléfonos
  for (const m of MEALS) d.meals[m.id] = d.meals[m.id] || [];
  d.ex = d.ex || [];
  return d;
}
// Marca lo borrado para que al mezclar dos teléfonos no vuelva a aparecer
function tomb(id) { S.del = S.del || {}; S.del[id] = Date.now(); }
function pruneDay(k) {
  const d = S.days[k]; if (!d) return;
  const any = MEALS.some(m => (d.meals[m.id] || []).length) || d.ex.length || d.water || d.steps;
  if (!any) delete S.days[k];
}

/* ---------------- Cálculos ---------------- */
function weightAt(k) {
  let w = null;
  for (const e of S.weights) { if (e.date <= k) w = e.kg; else break; }
  if (w == null) w = S.weights.length ? S.weights[0].kg : S.profile.startWeight;
  return w;
}
const latestWeight = () => S.weights.length ? S.weights[S.weights.length - 1].kg : S.profile.startWeight;
const ageOf = p => new Date().getFullYear() - p.birthYear;
const splitOf = p => MACRO_SPLITS.find(x => x.id === p.split) || MACRO_SPLITS[0];

function calc(k = UI.date) {
  const p = S.profile;
  const w = weightAt(k);
  const age = ageOf(p);
  const bmr = 10 * w + 6.25 * p.height - 5 * age + (p.sex === 'f' ? -161 : 5);
  const tdee = bmr * p.act;
  const diff = p.goal - w;
  const mode = Math.abs(diff) < 0.3 ? 'keep' : diff < 0 ? 'lose' : 'gain';
  const want = p.pace * 7700 / 7;
  const minK = p.sex === 'f' ? 1200 : 1500;
  let budget = mode === 'lose' ? tdee - want : mode === 'gain' ? tdee + want : tdee;
  budget = Math.max(0, budget);
  if (p.customKcal) budget = p.customKcal;
  budget = Math.round(budget / 10) * 10;
  const delta = mode === 'keep' ? 0 : Math.abs(tdee - budget);
  const perWeek = delta * 7 / 7700;
  const weeks = mode === 'keep' || perWeek < 0.01 ? 0 : Math.abs(diff) / perWeek;
  const eta = new Date(); eta.setDate(eta.getDate() + Math.round(weeks * 7));
  const sp = splitOf(p);
  const macros = { c: budget * sp.c / 100 / 4, p: budget * sp.p / 100 / 4, f: budget * sp.f / 100 / 9 };
  return { w, age, bmr, tdee, mode, budget, delta, perWeek, weeks, eta, macros, sp, minK, clamped: false };
}
const baseSteps = () => (ACTS.find(a => a.v === S.profile.act) || ACTS[1]).steps;
const stepsKcal = (steps, w) => Math.max(0, steps - baseSteps()) * 0.00055 * w;

function totals(k) {
  const d = dayData(k);
  const t = { kcal: 0, p: 0, c: 0, f: 0, meal: {}, n: 0 };
  for (const m of MEALS) {
    let mk = 0;
    for (const e of d.meals[m.id] || []) { t.kcal += e.kcal; t.p += e.p; t.c += e.c; t.f += e.f; mk += e.kcal; t.n++; }
    t.meal[m.id] = mk;
  }
  const w = weightAt(k);
  t.exList = d.ex.reduce((a, e) => a + e.kcal, 0);
  t.stepK = stepsKcal(d.steps || 0, w);
  t.ex = t.exList + t.stepK;
  return t;
}
function dayStatus(k) {
  const t = totals(k);
  if (!t.n) return '';
  return t.kcal <= calc(k).budget + t.ex ? 'ok' : 'hi';
}
// Valores que ella corrigió a mano ("las mías tienen menos") se recuerdan por comida
function applyOver(f) {
  const o = S.over && S.over[f.key];
  if (!o) return f;
  const base = f._base || { k100: f.k100, p100: f.p100, c100: f.c100, f100: f.f100 };
  return { ...f, ...o, _base: base, edited: true };
}
function foodVals(food, g) {
  const r = g / 100;
  return { kcal: food.k100 * r, p: (food.p100 || 0) * r, c: (food.c100 || 0) * r, f: (food.f100 || 0) * r };
}

/* ---------------- Utilidades de interfaz ---------------- */
let toastT;
function toast(msg) {
  const t = $('#toast'); t.innerHTML = emojify(msg); t.hidden = false;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2400);
}
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-ic]').forEach(el => { el.outerHTML = icon(el.dataset.ic); });
}

let sheetCleanup = null;
function openSheet(html) {
  const wrap = $('#sheetWrap');
  const wasOpen = !wrap.hidden;
  if (sheetCleanup) { sheetCleanup(); sheetCleanup = null; }
  $('#sheet').innerHTML = emojify(html);
  $('#sheet').scrollTop = 0;
  wrap.hidden = false;
  document.body.style.overflow = 'hidden';
  if (!wasOpen) history.pushState({ sheet: 1 }, '');
}
function doCloseSheet() {
  if (sheetCleanup) { sheetCleanup(); sheetCleanup = null; }
  $('#sheetWrap').hidden = true;
  $('#sheet').innerHTML = '';
  document.body.style.overflow = '';
}
function closeSheet() {
  if ($('#sheetWrap').hidden) return;
  if (history.state && history.state.sheet) history.back(); else doCloseSheet();
}
window.addEventListener('popstate', () => { if (!$('#sheetWrap').hidden) doCloseSheet(); });

function confirmSheet(msg, okText = 'Sí', mood = 'worried') {
  return new Promise(res => {
    openSheet(`<div class="empty"><div class="bear">${bearSVG(mood)}</div></div>
      <h2 style="text-align:center;font-size:19px">${esc(msg)}</h2>
      <button class="btn" data-act="cf-ok">${esc(okText)}</button>
      <button class="btn soft" data-act="cf-no">Mejor no</button>`);
    ACT['cf-ok'] = () => { closeSheet(); res(true); };
    ACT['cf-no'] = () => { closeSheet(); res(false); };
    sheetCleanup = () => res(false);
  });
}
function sheetHead(title, back) {
  return `<div class="sh-head">${back ? `<button class="icon-btn" data-act="${back}" aria-label="Atrás">${icon('chevL')}</button>` : ''}
    <h2>${esc(title)}</h2><button class="icon-btn" data-act="close" aria-label="Cerrar">${icon('close')}</button></div>`;
}

/* ---------------- Render principal ---------------- */
function render() {
  if (needLogin()) return showLogin();
  if (!S.profile) { $('#app').hidden = true; return startOnboarding(); }
  $('#app').hidden = false;
  if (!$('#onb').hidden) { $('#onb').hidden = true; $('#onb').innerHTML = ''; }
  document.body.dataset.theme = S.theme || 'fresa';
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
  const views = { hoy: viewHoy, diario: viewDiario, peso: viewPeso, yo: viewYo };
  $('#view').innerHTML = emojify(views[UI.tab]());
  $('#top').innerHTML = UI.tab === 'hoy' ? emojify(topHoy()) : '';
  requestAnimationFrame(() => document.querySelectorAll('[data-to]').forEach(el => {
    if (el.dataset.prop === 'w') el.style.width = el.dataset.to; else el.style.strokeDashoffset = el.dataset.to;
  }));
}

function bubbleFor(k) {
  const p = S.profile, name = esc(p.name || 'bonita');
  const t = totals(k), c = calc(k);
  const avail = c.budget + t.ex, left = avail - t.kcal;
  const h = new Date().getHours();
  const isToday = k === todayKey();
  const w = latestWeight();
  const reached = p.startWeight > p.goal ? w <= p.goal : p.startWeight < p.goal ? w >= p.goal : false;
  if (isToday && reached && S.weights.length > 1) return ['love', `¡<b>${name}</b>, llegaste a tu meta de ${fmt1(p.goal)} kg! Estoy orgullosísima de ti [[heart]]`];
  if (!t.n) {
    if (!isToday) return ['sleepy', `Este día no tiene comidas anotadas. Toca <b>+</b> para agregar algo.`];
    if (h < 11) return ['normal', `¡Buenos días, <b>${name}</b>! ¿Qué vamos a desayunar hoy? [[berry]]`];
    if (h >= 22) return ['sleepy', `Ya es tardecito... ¿anotamos lo que comiste hoy, <b>${name}</b>?`];
    return ['normal', `Hola <b>${name}</b> [[heart]] Hoy tienes <b>${fmt(avail)} kcal</b> para comer rico.`];
  }
  if (left < 0) return ['worried', `Nos pasamos <b>${fmt(-left)} kcal</b>... ¡no pasa nada! Una caminata o un día más ligero mañana lo arregla.`];
  if (t.kcal / avail > 0.85) return ['happy', `¡Casi completas tu día perfecto! Te quedan <b>${fmt(left)} kcal</b>.`];
  if (isToday && dayData(k).water < 4 && h > 14) return ['normal', `Te quedan <b>${fmt(left)} kcal</b>. ¡Y acuérdate de tomar agüita! [[drop]]`];
  return ['happy', `¡Vas súper bien, <b>${name}</b>! Te quedan <b>${fmt(left)} kcal</b> para hoy.`];
}

function topHoy() {
  const k = UI.date, d = parseKey(k);
  const [mood, msg] = bubbleFor(k);
  return `<div class="daybar">
      <button class="dnav" data-act="day" data-n="-1" aria-label="Día anterior">${icon('chevL')}</button>
      <div class="dlabel"><h1>${dayName(k)}</h1><span>${d.getDate()} de ${MESL[d.getMonth()]}</span></div>
      <button class="dnav" data-act="day" data-n="1" aria-label="Día siguiente" ${k >= todayKey() ? 'disabled' : ''}>${icon('chevR')}</button>
    </div>
    <div class="greet"><div class="bear">${bearSVG(mood)}</div><div class="bubble">${msg}</div></div>`;
}

/* ---------------- HOY ---------------- */
function viewHoy() {
  const k = UI.date, t = totals(k), c = calc(k), d = dayData(k);
  const avail = c.budget + t.ex, left = avail - t.kcal;
  const over = left < 0;
  const R = 78, C = 2 * Math.PI * R, frac = clamp(t.kcal / avail, 0, 1);

  const ring = `<div class="ring">
      <svg viewBox="0 0 180 180"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${over ? '#e5505e' : 'var(--accent)'}"/><stop offset="1" stop-color="${over ? '#c23441' : '#e5505e'}"/></linearGradient></defs>
        <circle class="ring-track" cx="90" cy="90" r="${R}" fill="none" stroke-width="16"/>
        <circle class="ring-val" cx="90" cy="90" r="${R}" fill="none" stroke="url(#rg)" stroke-width="16" stroke-linecap="round"
          stroke-dasharray="${C}" stroke-dashoffset="${C}" data-to="${C * (1 - (over ? 1 : frac))}"/>
      </svg>
      <div class="rc"><span class="big ${over ? 'over' : ''}">${fmt(Math.abs(left))}</span><small>${over ? 'kcal de más' : 'kcal restantes'}</small></div>
    </div>`;

  const macro = (lbl, val, goal, col) => `<div class="macro"><small>${lbl}</small>
      <div class="bar"><i style="width:0;background:${col}" data-prop="w" data-to="${clamp(val / goal * 100, 0, 100)}%"></i></div>
      <span class="num">${fmt(val)}</span><span class="muted small"> / ${fmt(goal)} g</span></div>`;

  const meals = MEALS.map(m => {
    const list = d.meals[m.id] || [];
    const mk = t.meal[m.id];
    const lo = c.budget * m.min, hi = c.budget * m.max;
    const cls = !mk ? '' : mk > hi * 1.1 ? 'hi' : mk >= lo * .8 ? 'ok' : '';
    return `<section class="card meal">
      <div class="meal-h"><div class="mi">${MEAL_ART[m.art]}</div>
        <div class="mt"><h3>${m.name}</h3><small>Recomendado ${fmt(lo)}–${fmt(hi)} kcal</small></div>
        <span class="mk ${cls}">${mk ? fmt(mk) : ''}</span>
        <button class="addbtn" data-act="add" data-meal="${m.id}" aria-label="Agregar a ${m.name}">${icon('plus')}</button></div>
      ${list.length ? `<div class="items">${list.map(e => `<button class="item" data-act="edit" data-meal="${m.id}" data-id="${e.id}">
          <div class="in"><b>${esc(e.food.name)}</b><small>${esc(portionText(e))}</small></div><span class="ik">${fmt(e.kcal)}</span></button>`).join('')}</div>` : ''}
      ${!list.length && d.meals && hasMeal(addDays(k, -1), m.id) ? `<div class="meal-tools"><button data-act="copy" data-meal="${m.id}">${icon('copy')} Repetir lo de ayer</button></div>` : ''}
    </section>`;
  }).join('');

  // Quemadas al estilo Huawei: reposo (se acumula a lo largo del día) + actividad
  const now = new Date();
  const frac24 = k === todayKey() ? (now.getHours() * 60 + now.getMinutes()) / 1440 : k < todayKey() ? 1 : 0;
  const resting = c.bmr * frac24;
  const gap = c.tdee + t.ex - t.kcal;
  const gapLbl = c.mode === 'gain' ? 'Superávit de hoy' : c.mode === 'keep' ? 'Balance de hoy' : 'Déficit de hoy';
  const gapVal = c.mode === 'gain' ? -gap : gap;
  const gapGoal = c.delta;
  const gapPct = gapGoal ? clamp(gapVal / gapGoal * 100, 0, 100) : 0;

  const tot = t.c * 4 + t.p * 4 + t.f * 9;
  const pc = tot ? t.c * 4 / tot : 0, pp = tot ? t.p * 4 / tot : 0, pf = tot ? t.f * 9 / tot : 0;
  const DR = 44, DC = 2 * Math.PI * DR;
  let off = 0;
  const seg = (fr, col) => { const s = `<circle cx="56" cy="56" r="${DR}" fill="none" stroke="${col}" stroke-width="14" stroke-dasharray="${fr * DC} ${DC}" stroke-dashoffset="${-off}"/>`; off += fr * DC; return s; };

  return `
  <section class="card hero">
    <div class="side"><span class="num">${fmt(t.kcal)}</span><small>${icon('heart')} Comido</small></div>
    ${ring}
    <div class="side"><span class="num">${fmt(t.ex)}</span><small>${icon('flame')} Ejercicio</small></div>
    <div class="budget-line">Presupuesto <b>${fmt(c.budget)}</b> + ejercicio <b>${fmt(t.ex)}</b> − comido <b>${fmt(t.kcal)}</b></div>
  </section>

  <section class="card"><div class="macros">
    ${macro('Carbohidratos', t.c, c.macros.c, 'var(--carb)')}
    ${macro('Proteína', t.p, c.macros.p, 'var(--prot)')}
    ${macro('Grasa', t.f, c.macros.f, 'var(--fat)')}
  </div></section>

  ${meals}

  <section class="card">
    <div class="card-head"><h3>${icon('flame')} Quemadas</h3><span class="num" style="font-size:20px;color:var(--ink)">${fmt(resting + t.ex)} <small class="muted" style="font-size:12px">kcal</small></span></div>
    <div class="burn-grid">
      <div><span class="num">${fmt(resting)}</span><small>En reposo</small></div>
      <div><span class="num">${fmt(t.ex)}</span><small>Actividad</small></div>
      <div><span class="num">${fmt(c.tdee + t.ex)}</span><small>Gasto del día</small></div>
    </div>
    <div class="gap-row">
      <div class="lbl"><span>${gapLbl}</span><span>${c.mode === 'keep' ? `<b>${fmt(gap)}</b> kcal` : `<b>${fmt(gapVal)}</b> / ${fmt(gapGoal)} kcal`}</span></div>
      ${c.mode !== 'keep' ? `<div class="bar" style="height:11px"><i style="width:0;background:linear-gradient(90deg,var(--mint),#3fae78)" data-prop="w" data-to="${gapPct}%"></i></div>
      ${gapVal >= gapGoal ? `<span class="chip-ok">${icon('check', 'mini')} ${k === todayKey() ? `Si no comes más, cumples tu ${c.mode === 'gain' ? 'superávit' : 'déficit'}` : `¡Meta de ${c.mode === 'gain' ? 'superávit' : 'déficit'} cumplida!`}</span>` : `<small class="muted">Si no comes nada más, así cierras el día.</small>`}` : '<small class="muted">Tu meta es mantener el peso: busca quedar cerca de 0.</small>'}
    </div>
  </section>

  <section class="card ex-list">
    <div class="card-head"><h3>${icon('bolt')} Ejercicio</h3><button class="link" data-act="ex">+ Agregar</button></div>
    ${d.ex.length ? `<div class="items">${d.ex.map(e => `<button class="item" data-act="exdel" data-id="${e.id}"><div class="in"><b>${esc(e.name)}</b><small>${e.min ? e.min + ' min' : 'manual'}</small></div><span class="ik">−${fmt(e.kcal)}</span></button>`).join('')}</div>` : '<p class="muted small" style="margin:8px 0 0">Caminar, bailar, gym... todo suma y te da más calorías para comer.</p>'}
    <button class="steps-row" data-act="steps" style="width:100%;text-align:left">${icon('steps')}<div class="in"><b>${fmt(d.steps || 0)} pasos</b>${d.steps ? (t.stepK ? `≈ ${fmt(t.stepK)} kcal extra` : `Tu nivel de actividad ya cuenta ${fmt(baseSteps())} pasos`) : 'Toca para anotar tus pasos del día'}</div>${icon('edit')}</button>
  </section>

  <section class="card">
    <div class="card-head"><h3>${icon('drop')} Agüita</h3><span class="muted small">${(d.water || 0) * 250} / ${WATER_CUPS * 250} ml</span></div>
    <div class="water" style="margin-top:10px"><div class="chick">${chickSVG()}</div>
      <div class="cups">${Array.from({ length: WATER_CUPS }, (_, i) => `<button class="cup ${i < (d.water || 0) ? 'full' : ''}" data-act="water" data-i="${i}" aria-label="Vaso ${i + 1}"></button>`).join('')}</div>
    </div>
  </section>

  <section class="card">
    <h3>${icon('sparkle')} Análisis nutricional</h3>
    <div class="ana" style="margin-top:10px">
      <div class="donut"><svg viewBox="0 0 112 112"><circle cx="56" cy="56" r="${DR}" fill="none" stroke="#f4ece9" stroke-width="14"/>
        ${tot ? seg(pc, 'var(--carb)') + seg(pp, 'var(--prot)') + seg(pf, 'var(--fat)') : ''}</svg>
        <div class="dc"><div><b>${fmt(t.kcal)}</b>kcal</div></div></div>
      <div class="legend">
        <div><i style="background:var(--carb)"></i><span>Carbos</span><b>${Math.round(pc * 100)}%</b><em>&nbsp;/ ${c.sp.c}%</em></div>
        <div><i style="background:var(--prot)"></i><span>Proteína</span><b>${Math.round(pp * 100)}%</b><em>&nbsp;/ ${c.sp.p}%</em></div>
        <div><i style="background:var(--fat)"></i><span>Grasa</span><b>${Math.round(pf * 100)}%</b><em>&nbsp;/ ${c.sp.f}%</em></div>
      </div>
    </div>
    <div class="tips">${tipsFor(t, c, pc, pp, pf).map(x => `<div class="tip">${x}</div>`).join('')}</div>
  </section>
  ${footer()}`;
}
const hasMeal = (k, m) => !!(S.days[k] && (S.days[k].meals[m] || []).length);
function portionText(e) {
  const f = e.food;
  if (e.mode === 'g') return `${fmt(e.g)} g`;
  const unit = e.qty !== 1 && /^1 /.test(f.unit) ? f.unit.slice(2) : f.unit;
  const q = e.qty === 1 ? '' : `${fmt1(e.qty)} × `;
  return `${q}${unit}${f.ug && f.unit.indexOf(' g') < 0 && f.src !== 'quick' ? ` (${fmt(e.g)} g)` : ''}`;
}
function tipsFor(t, c, pc, pp, pf) {
  if (!t.n) return ['Anota tus comidas y aquí te digo cómo va el balance de tu día [[kori]]'];
  const tips = [];
  const sp = c.sp;
  if (pp * 100 < sp.p - 6) tips.push('Te falta proteína: pollo, huevo, yogur griego, atún o frijol te ayudan a sentirte llena más tiempo.');
  if (pf * 100 > sp.f + 8) tips.push('Hoy va alto en grasa; prueba cosas a la plancha o al horno en vez de fritas.');
  if (pc * 100 > sp.c + 10) tips.push('Muchos carbohidratos hoy; acompaña con verduras y algo de proteína.');
  for (const m of MEALS) {
    if (t.meal[m.id] > c.budget * m.max * 1.15) tips.push(`${m.name === 'Refacciones' ? 'Las refacciones pasaron' : `El ${m.name.toLowerCase()} pasó`} de lo recomendado (${fmt(c.budget * m.max)} kcal).`);
  }
  if (!tips.length) tips.push('¡Tus macros van balanceados! Así se hace [[star]]');
  return tips.slice(0, 3);
}
function footer() {
  return `<p class="foot">${berrySVG()} Hecho con mucho amor para ti ${berrySVG()}<br>Los valores son aproximados; escucha siempre a tu cuerpo.</p>`;
}

/* ---------------- DIARIO ---------------- */
function viewDiario() {
  const t0 = todayKey();
  const end = UI.weekEnd;
  const days = Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
  const vals = days.map(k => ({ k, t: totals(k), c: calc(k) }));
  const maxV = Math.max(...vals.map(v => Math.max(v.t.kcal, v.c.budget + v.t.ex)), 1) * 1.1;
  const logged = vals.filter(v => v.t.n);
  const avg = logged.length ? logged.reduce((a, v) => a + v.t.kcal, 0) / logged.length : 0;
  const okDays = logged.filter(v => v.t.kcal <= v.c.budget + v.t.ex).length;
  const bud = calc(t0).budget;

  // racha de días seguidos con algo anotado
  let streak = 0, k = t0;
  if (!totals(k).n) k = addDays(k, -1);
  while (totals(k).n) { streak++; k = addDays(k, -1); }

  if (!UI.cal) { const d = new Date(); UI.cal = [d.getFullYear(), d.getMonth()]; }
  const [cy, cm] = UI.cal;
  const first = new Date(cy, cm, 1), nDays = new Date(cy, cm + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  let cal = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<div class="dw">${x}</div>`).join('');
  cal += '<div></div>'.repeat(lead);
  for (let i = 1; i <= nDays; i++) {
    const kk = keyOf(new Date(cy, cm, i));
    cal += `<button class="${dayStatus(kk)} ${kk === t0 ? 'today' : ''}" data-act="goday" data-k="${kk}" ${kk > t0 ? 'disabled' : ''}>${i}</button>`;
  }
  const nowYM = new Date();

  return `
  <div class="page-title">${berrySVG()}<h1>Mi diario</h1></div>
  <section class="card">
    <div class="stat3" style="margin-top:0">
      <div><b>${streak}</b><small>${streak === 1 ? 'día' : 'días'} de racha</small></div>
      <div><b>${fmt(avg)}</b><small>promedio kcal</small></div>
      <div><b>${okDays}/${logged.length}</b><small>días en meta</small></div>
    </div>
  </section>
  <section class="card">
    <div class="cal-h">
      <button class="icon-btn" data-act="week" data-n="-7" aria-label="Semana anterior">${icon('chevL')}</button>
      <h3>${fmtShort(days[0])} – ${fmtShort(days[6])}</h3>
      <button class="icon-btn" data-act="week" data-n="7" aria-label="Semana siguiente" ${end >= t0 ? 'disabled style="opacity:.35"' : ''}>${icon('chevR')}</button>
    </div>
    <div class="week">
      <div class="bline" style="bottom:${(bud / maxV) * (150 - 34) + 18}px"></div>
      ${vals.map(v => {
        const st = v.t.n ? (v.t.kcal <= v.c.budget + v.t.ex ? 'ok' : 'hi') : '';
        return `<button class="col ${v.k === UI.date ? 'sel' : ''}" data-act="goday" data-k="${v.k}" ${v.k > t0 ? 'disabled' : ''}>
          <b>${v.t.n ? fmt(v.t.kcal) : ''}</b><i class="${st}" style="height:${v.t.kcal / maxV * (150 - 34)}px"></i><span>${DIA[parseKey(v.k).getDay()]}</span></button>`;
      }).join('')}
    </div>
    <p class="muted small" style="margin:8px 0 0;text-align:center">La línea punteada es tu presupuesto (${fmt(bud)} kcal). Verde = dentro de la meta, contando el ejercicio.</p>
  </section>
  <section class="card">
    <div class="cal-h">
      <button class="icon-btn" data-act="cal" data-n="-1" aria-label="Mes anterior">${icon('chevL')}</button>
      <h3 style="text-transform:capitalize">${MESL[cm]} ${cy}</h3>
      <button class="icon-btn" data-act="cal" data-n="1" aria-label="Mes siguiente" ${cy === nowYM.getFullYear() && cm === nowYM.getMonth() ? 'disabled style="opacity:.35"' : ''}>${icon('chevR')}</button>
    </div>
    <div class="cal">${cal}</div>
    <div class="cal-leg"><span><i style="background:var(--mint)"></i>Dentro de la meta</span><span><i style="background:var(--red)"></i>Me pasé</span></div>
  </section>
  ${footer()}`;
}

/* ---------------- PESO ---------------- */
function viewPeso() {
  const p = S.profile, c = calc(todayKey());
  const w = latestWeight();
  const start = p.startWeight, goal = p.goal;
  const span = start - goal;
  const prog = Math.abs(span) < 0.05 ? 1 : clamp((start - w) / span, 0, 1);
  const left = Math.abs(w - goal);
  const reached = span > 0 ? w <= goal : span < 0 ? w >= goal : true;
  const bmi = w / Math.pow(p.height / 100, 2);
  const bmiCat = bmi < 18.5 ? 'Bajo peso' : bmi < 25 ? 'Saludable' : bmi < 30 ? 'Sobrepeso' : 'Obesidad';
  const bmiPos = clamp((bmi - 15) / 20 * 100, 0, 100);
  const lostSoFar = start - w;

  return `
  <div class="page-title">${berrySVG()}<h1>Mi peso</h1></div>
  <section class="card">
    <div class="w-hero"><div class="bear">${bearSVG(reached ? 'cheer' : prog > .5 ? 'happy' : 'berry')}</div>
      <div><small class="muted">Peso actual</small><div class="wbig">${fmt1(w)} <small>kg</small></div>
      <small class="muted">${reached ? '¡Meta cumplida! [[star]]' : `Te faltan <b style="color:var(--accent-ink)">${fmt1(left)} kg</b> para tu meta`}</small></div></div>
    <div class="prog">
      <div class="bar"><i style="width:0" data-prop="w" data-to="${prog * 100}%"></i><span class="berry" style="left:${prog * 100}%">${berrySVG()}</span></div>
      <div class="ends"><span>Inicio ${fmt1(start)} kg</span><span>${Math.round(prog * 100)}%</span><span>Meta ${fmt1(goal)} kg</span></div>
    </div>
    <button class="btn" data-act="weigh">${icon('plus')} Registrar peso</button>
  </section>

  <section class="card">
    <div class="card-head"><h3>${icon('sparkle')} Progreso</h3>
      <div class="seg" style="margin:0;padding:3px">${[['1m', '1M'], ['3m', '3M'], ['all', 'Todo']].map(([v, l]) => `<button class="${UI.wRange === v ? 'on' : ''}" data-act="wrange" data-v="${v}" style="padding:5px 10px">${l}</button>`).join('')}</div></div>
    ${weightChart()}
  </section>

  <section class="card">
    <h3>${icon('target')} Mi plan</h3>
    <div class="stat3">
      <div><b>${fmt(c.budget)}</b><small>kcal al día</small></div>
      <div><b>${c.mode === 'keep' ? '—' : fmt1(c.perWeek)}</b><small>kg por semana</small></div>
      <div><b>${Math.abs(lostSoFar) < 0.05 ? '0' : (lostSoFar > 0 ? '−' : '+') + fmt1(Math.abs(lostSoFar))}</b><small>kg desde el inicio</small></div>
    </div>
    <p class="small" style="margin:12px 2px 0;line-height:1.5">${c.mode === 'keep'
      ? 'Estás en tu peso meta: tu presupuesto ahora es para <b>mantener</b>. [[heart]]'
      : `A este ritmo llegarías a <b>${fmt1(goal)} kg</b> alrededor del <b>${fmtLong(c.eta)}</b> (${Math.round(c.weeks)} semanas).`}
      ${c.clamped ? '<br><span class="muted">Tu presupuesto no baja de 1,200 kcal para cuidarte, así que el ritmo real es un poquito más lento.</span>' : ''}</p>
    <button class="btn soft" data-act="profile">${icon('edit')} Cambiar meta</button>
  </section>

  <section class="card">
    <div class="card-head"><h3>IMC</h3><span><b class="num" style="font-size:20px;color:var(--ink)">${fmt1(bmi)}</b> <span class="muted small">${bmiCat}</span></span></div>
    <div class="bmi-wrap"><div class="bmi-scale"><span style="width:17.5%;background:#9fc9ee"></span><span style="width:32.5%;background:var(--mint)"></span><span style="width:25%;background:var(--carb)"></span><span style="width:25%;background:var(--red)"></span></div>
      <i class="bmi-pin" style="left:${bmiPos}%"></i></div>
    <div class="bmi-lbl"><span>15</span><span>18.5</span><span>25</span><span>30</span><span>35</span></div>
  </section>

  <section class="card">
    <h3>${icon('calendar')} Historial</h3>
    ${S.weights.length ? `<div class="items">${[...S.weights].reverse().slice(0, 30).map((e, i, arr) => {
      const prev = arr[i + 1]; const dlt = prev ? e.kg - prev.kg : 0;
      return `<button class="item" data-act="wdel" data-date="${e.date}"><div class="in"><b>${fmt1(e.kg)} kg</b><small>${dayName(e.date) === 'Hoy' ? 'Hoy' : fmtShort(e.date) + ' ' + parseKey(e.date).getFullYear()}</small></div>
        <span class="ik" style="color:${dlt < 0 ? 'var(--mint)' : dlt > 0 ? 'var(--red)' : 'var(--muted)'}">${prev ? (dlt > 0 ? '+' : dlt < 0 ? '−' : '') + fmt1(Math.abs(dlt)) : ''}</span></button>`;
    }).join('')}</div>` : '<p class="muted small">Aún no hay registros.</p>'}
  </section>
  ${footer()}`;
}

function weightChart() {
  const t0 = todayKey();
  const from = UI.wRange === '1m' ? addDays(t0, -30) : UI.wRange === '3m' ? addDays(t0, -91) : '0000';
  const pts = S.weights.filter(e => e.date >= from);
  if (!pts.length) return '<div class="empty">Registra tu peso para ver la gráfica.</div>';
  const goal = S.profile.goal;
  const W = 340, H = 190, L = 34, Rr = 10, T = 14, B = 26;
  const ks = pts.map(e => e.kg).concat(goal);
  let lo = Math.floor(Math.min(...ks) - .8), hi = Math.ceil(Math.max(...ks) + .8);
  const t1 = parseKey(pts[0].date).getTime(), t2 = Math.max(parseKey(pts[pts.length - 1].date).getTime(), t1 + 864e5 * 6);
  const x = d => L + (parseKey(d).getTime() - t1) / (t2 - t1) * (W - L - Rr);
  const y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const ticks = []; const step = Math.max(1, Math.round((hi - lo) / 4));
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  const line = pts.map((e, i) => `${i ? 'L' : 'M'}${x(e.date).toFixed(1)} ${y(e.kg).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts[pts.length - 1].date).toFixed(1)} ${H - B} L${x(pts[0].date).toFixed(1)} ${H - B}Z`;
  const last = pts[pts.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfica de peso">
    <defs><linearGradient id="wa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map(v => `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join('')}
    <line x1="${L}" x2="${W - Rr}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--mint)" stroke-width="2" stroke-dasharray="5 5"/>
    <text x="${W - Rr}" y="${y(goal) - 5}" text-anchor="end" style="fill:#2f8a5c">meta ${fmt1(goal)}</text>
    ${pts.length > 1 ? `<path d="${area}" fill="url(#wa)"/><path d="${line}" fill="none" stroke="var(--red)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    ${pts.map(e => `<circle cx="${x(e.date)}" cy="${y(e.kg)}" r="${pts.length > 40 ? 2.5 : 4}" fill="#fff" stroke="var(--red)" stroke-width="2.5"/>`).join('')}
    <text x="${L}" y="${H - 8}">${fmtShort(pts[0].date)}</text>
    <text x="${W - Rr}" y="${H - 8}" text-anchor="end">${fmtShort(last.date)}</text>
  </svg>`;
}

/* ---------------- YO ---------------- */
function viewYo() {
  const p = S.profile, c = calc(todayKey());
  const act = ACTS.find(a => a.v === p.act) || ACTS[1];
  return `
  <div class="page-title">${berrySVG()}<h1>Yo</h1></div>
  <section class="card" style="text-align:center">
    <div class="bear" style="width:120px;margin:0 auto">${bearSVG('berry')}</div>
    <h2 style="font-size:22px">${esc(p.name)}</h2>
    <p class="muted small" style="margin:4px 0 0">${p.sex === 'f' ? 'Mujer' : 'Hombre'} · ${ageOf(p)} años · ${p.height} cm · ${act.n.toLowerCase()}</p>
    <div class="stat3">
      <div><b>${fmt(c.budget)}</b><small>presupuesto</small></div>
      <div><b>${fmt(c.tdee)}</b><small>gasto diario</small></div>
      <div><b>${fmt(c.bmr)}</b><small>metabolismo basal</small></div>
    </div>
    <button class="btn soft" data-act="profile">${icon('edit')} Editar mis datos y metas</button>
  </section>

  ${rankingCTA()}
  ${nubeCard()}

  <section class="card">
    <h3>${icon('sparkle')} Tema</h3>
    <div class="theme-dots" style="margin-top:12px">
      ${[['fresa', '#f28fa5', 'Fresa'], ['kiiro', '#f5b92e', 'Pollito'], ['rila', '#c58b5a', 'Miel']].map(([id, col, n]) => `<button class="${S.theme === id ? 'on' : ''}" style="background:${col}" data-act="theme" data-v="${id}" aria-label="${n}" title="${n}"></button>`).join('')}
    </div>
  </section>

  <section class="card">
    <h3>${icon('heart')} Mis comidas guardadas</h3>
    ${S.custom.length ? `<div class="items">${S.custom.map(f => `<button class="item" data-act="cdel" data-key="${f.key}"><div class="in"><b>${esc(f.name)}</b><small>${esc(f.unit)} · ${fmt(f.k100 * f.ug / 100)} kcal</small></div>${icon('trash')}</button>`).join('')}</div>`
      : '<p class="muted small" style="margin:8px 0 0">Cuando crees una comida propia (por ejemplo, el licuado que siempre te haces) aparece aquí.</p>'}
  </section>

  <section class="card">
    <h3>${icon('download')} Mis datos</h3>
    <p class="muted small" style="margin:6px 0 4px">Todo se guarda solo en este teléfono. Haz una copia de vez en cuando por si cambias de celular.</p>
    <button class="settings-row" data-act="export">${icon('download')}<span>Guardar copia de seguridad</span></button>
    <label class="settings-row" style="cursor:pointer">${icon('upload')}<span>Cargar copia de seguridad</span><input type="file" accept="application/json,.json" id="importFile" hidden></label>
    ${S.demo ? `<button class="settings-row" data-act="demoOff">${icon('sparkle')}<span>Quitar datos de ejemplo y volver a los míos</span></button>`
      : `<button class="settings-row" data-act="demo">${icon('sparkle')}<span>Ver con datos de ejemplo</span></button>`}
    <button class="settings-row" data-act="reset" style="color:var(--red)">${icon('trash')}<span>Borrar todo y empezar de nuevo</span></button>
  </section>
  ${footer()}`;
}

/* ---------------- Agregar comida ---------------- */
const AS = { meal: 'desayuno', q: '', cat: '', off: null, offQ: '', loading: false };
function guessMeal() {
  const h = new Date().getHours();
  return h < 11 ? 'desayuno' : h < 16 ? 'almuerzo' : h < 18 ? 'refa' : 'cena';
}
function openAdd(meal) {
  AS.meal = meal || (UI.date === todayKey() ? guessMeal() : 'desayuno');
  AS.q = ''; AS.cat = ''; AS.off = null; AS.offQ = '';
  renderAdd();
}
function renderAdd() {
  openSheet(`${sheetHead('Agregar comida')}
    <div class="chips">${MEALS.map(m => `<button class="chip ${AS.meal === m.id ? 'on' : ''}" data-act="ameal" data-meal="${m.id}">${m.name}</button>`).join('')}</div>
    <label class="search">${icon('search')}<input id="q" type="search" placeholder="Buscar: tortilla, pollo, banano..." value="${esc(AS.q)}" autocomplete="off" enterkeyhint="search"></label>
    <div class="quick">
      <button data-act="scan">${icon('barcode')}Escanear</button>
      <button data-act="quick">${icon('bolt')}Rápido</button>
      <button data-act="custom">${icon('plus')}Crear comida</button>
    </div>
    <div id="addList">${addListHTML()}</div>`);
  const q = $('#q');
  let deb;
  q.addEventListener('input', () => {
    clearTimeout(deb);
    deb = setTimeout(() => { AS.q = q.value; if (norm(AS.q) !== norm(AS.offQ)) AS.off = null; $('#addList').innerHTML = emojify(addListHTML()); }, 120);
  });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); AS.q = q.value; searchOFF(); q.blur(); } });
}
function allFoods() { return S.custom.concat(FOODS); }
function searchLocal(q) {
  const toks = norm(q).split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  const out = [];
  for (const f of allFoods()) {
    const n = norm(f.name + ' ' + (f.brand || ''));
    if (toks.every(t => n.includes(t))) {
      let s = 0;
      if (n.startsWith(toks[0])) s -= 10;
      if (n.split(/\s+/).some(wd => wd.startsWith(toks[0]))) s -= 5;
      if (f.src === 'custom') s -= 3;
      out.push([s + n.length / 100, f]);
    }
  }
  return out.sort((a, b) => a[0] - b[0]).map(x => x[1]).slice(0, 40);
}
function foodRow(f) {
  const kc = f.k100 * (f.ug || 100) / 100;
  const sub = f.brand ? `${esc(f.brand)} · ` : '';
  return `<button class="item" data-act="pick" data-key="${esc(f.key)}"><div class="in"><b>${esc(f.name)}</b><small>${sub}${esc(f.unit)} · ${fmt(kc)} kcal</small></div><span class="plus">${icon('plus')}</span></button>`;
}
let pickCache = {};
function listBlock(title, foods, extra = '') {
  if (!foods.length) return '';
  foods = foods.map(applyOver);
  foods.forEach(f => (pickCache[f.key] = f));
  return `<div class="sec-t"><span>${title}</span>${extra}</div><div class="list">${foods.map(foodRow).join('')}</div>`;
}
function addListHTML() {
  if (AS.q.trim()) {
    const loc = searchLocal(AS.q);
    let html = listBlock('Resultados', loc);
    if (!loc.length) html += `<div class="empty"><div class="bear">${bearSVG('worried')}</div>No encontré "${esc(AS.q)}" en mi lista.</div>`;
    if (AS.loading) html += '<div class="spin"></div>';
    else if (AS.off) html += AS.off.length ? listBlock('De internet (Open Food Facts)', AS.off) : '<div class="empty">Tampoco salió nada en internet. Puedes crearla tú [[heart]]</div>';
    else html += `<button class="btn soft" data-act="off">${icon('search')} Buscar productos de marca en internet</button>`;
    return html;
  }
  let html = '';
  html += listBlock('Recientes', S.recents.slice(0, 8));
  html += listBlock('Favoritas', S.favs);
  html += listBlock('Mis comidas', S.custom);
  html += `<div class="sec-t"><span>Explorar</span></div><div class="chips">${Object.entries(FOOD_CATS).map(([k, n]) => `<button class="chip ${AS.cat === k ? 'on' : ''}" data-act="acat" data-cat="${k}">${n}</button>`).join('')}</div>`;
  const cat = AS.cat || 'gt';
  html += listBlock(FOOD_CATS[cat], FOODS.filter(f => f.cat === cat));
  return html;
}

/* Open Food Facts: búsqueda y código de barras (gratis, sin clave) */
function offToFood(p) {
  const n = p.nutriments || {};
  let k = n['energy-kcal_100g'];
  if (k == null && n['energy_100g'] != null) k = n['energy_100g'] / 4.184;
  if (k == null || isNaN(k)) return null;
  const sq = parseFloat(p.serving_quantity);
  const name = (p.product_name_es || p.product_name || '').trim();
  if (!name) return null;
  return {
    key: 'o:' + p.code, name, brand: (p.brands || '').split(',')[0].trim(),
    k100: +k, p100: +n.proteins_100g || 0, c100: +n.carbohydrates_100g || 0, f100: +n.fat_100g || 0,
    unit: sq > 0 ? `1 porción (${fmt(sq)} g)` : '100 g', ug: sq > 0 ? sq : 100, src: 'off'
  };
}
const OFF_FIELDS = 'code,product_name,product_name_es,brands,nutriments,serving_quantity';
async function searchOFF() {
  const q = AS.q.trim(); if (!q) return;
  AS.loading = true; AS.offQ = q; $('#addList') && ($('#addList').innerHTML = emojify(addListHTML()));
  try {
    const r = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=30&fields=${OFF_FIELDS}`);
    const j = await r.json();
    const seen = new Set();
    AS.off = (j.products || []).map(offToFood).filter(f => f && !seen.has(f.name + f.brand) && seen.add(f.name + f.brand)).slice(0, 20);
  } catch (e) { AS.off = null; toast('Sin internet ahorita [[cry]]'); }
  AS.loading = false;
  if ($('#addList') && AS.q.trim() === q) $('#addList').innerHTML = emojify(addListHTML());
}
async function offProduct(code) {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  const j = await r.json();
  if (j.status !== 1 || !j.product) return null;
  j.product.code = j.product.code || code;
  return offToFood(j.product);
}

/* ---------------- Detalle / porción ---------------- */
const FD = { food: null, meal: '', qty: 1, mode: 'u', entryId: null, back: null };
function openDetail(food, meal, entry, back = 'back-add') {
  FD.food = entry ? food : applyOver(food); FD.meal = meal; FD.back = back; FD.editing = false;
  FD.entryId = entry ? entry.id : null;
  FD.mode = entry ? entry.mode : 'u';
  FD.qty = entry ? (entry.mode === 'g' ? entry.g : entry.qty) : 1;
  renderDetail();
}
const fdGrams = () => FD.mode === 'g' ? FD.qty : FD.qty * (FD.food.ug || 100);
function renderDetail() {
  const f = FD.food, v = foodVals(f, fdGrams());
  const fav = S.favs.some(x => x.key === f.key);
  const canUnit = f.src !== 'quick';
  openSheet(`${sheetHead(FD.entryId ? 'Editar' : MEALS.find(m => m.id === FD.meal).name, FD.entryId ? null : FD.back)}
    <div class="food-hero">
      <h2 style="font-size:19px">${esc(f.name)}</h2>${f.brand ? `<div class="brand">${esc(f.brand)}</div>` : ''}
      <div class="kc" style="margin-top:10px"><span id="fdK">${fmt(v.kcal)}</span> <small>kcal</small></div>
      <button class="edit-kc" data-act="fdedit">${icon('edit')} ${f.edited ? 'Valores editados por ti' : 'Editar calorías'}</button>
      <div class="mrow">
        <div style="background:#fff6e3">Carbos<b id="fdC">${fmt1(v.c)} g</b></div>
        <div style="background:#fdeaf0">Proteína<b id="fdP">${fmt1(v.p)} g</b></div>
        <div style="background:#eaf4fd">Grasa<b id="fdF">${fmt1(v.f)} g</b></div>
      </div>
    </div>
    ${FD.editing ? editPanel(f) : ''}
    ${canUnit ? `<div class="seg"><button class="${FD.mode === 'u' ? 'on' : ''}" data-act="fdmode" data-v="u">${esc(f.unit)}</button><button class="${FD.mode === 'g' ? 'on' : ''}" data-act="fdmode" data-v="g">Gramos</button></div>` : ''}
    <div class="qty">
      <button class="step" data-act="fdstep" data-n="-1" aria-label="Menos">${icon('minus')}</button>
      <input id="fdQ" type="number" inputmode="decimal" min="0" step="${FD.mode === 'g' ? 5 : 0.25}" value="${+FD.qty.toFixed(2)}">
      <button class="step" data-act="fdstep" data-n="1" aria-label="Más">${icon('plus')}</button>
    </div>
    <p class="muted small" style="text-align:center;margin:8px 0 0" id="fdG">${FD.mode === 'u' ? `${fmt(fdGrams())} g en total` : ''}</p>
    ${!FD.entryId ? `<div class="chips" style="margin-top:12px;justify-content:center">${MEALS.map(m => `<button class="chip ${FD.meal === m.id ? 'on' : ''}" data-act="fdmeal" data-meal="${m.id}">${m.name}</button>`).join('')}</div>` : ''}
    <div style="display:flex;gap:10px;align-items:center">
      <button class="icon-btn ${fav ? 'on' : ''}" data-act="fav" aria-label="Favorita" style="margin-top:14px;width:52px;height:52px">${icon('heart')}</button>
      <button class="btn" data-act="fdsave">${icon('check')} ${FD.entryId ? 'Guardar' : 'Agregar'}</button>
    </div>
    ${FD.entryId ? `<button class="btn ghost" data-act="fddel">${icon('trash')} Quitar de ${MEALS.find(m => m.id === FD.meal).name.toLowerCase()}</button>` : ''}
    <p class="muted small" style="text-align:center;margin-top:10px">${fmt(f.k100)} kcal por 100 g${f.src === 'off' ? ' · datos de Open Food Facts' : ''}</p>`);
  $('#fdQ').addEventListener('input', e => { FD.qty = Math.max(0, parseFloat(e.target.value) || 0); updDetail(); });
}
function editPanel(f) {
  const ug = f.ug || 100, r = ug / 100;
  const v = x => +((x || 0) * r).toFixed(1);
  return `<div class="card edit-panel">
    <h3>${icon('edit')} Mis valores</h3>
    <p class="muted small" style="margin:4px 0 0">Copia lo que dice la etiqueta de tu producto. Valores por <b>${esc(f.unit)}${f.unit.indexOf(' g') < 0 ? ` (${fmt(ug)} g)` : ''}</b>.</p>
    <label class="field"><span>Calorías (kcal)</span><input id="edK" type="number" inputmode="decimal" value="${v(f.k100)}"></label>
    <div class="grid3">
      <label class="field"><span>Carbos g</span><input id="edC" type="number" inputmode="decimal" value="${v(f.c100)}"></label>
      <label class="field"><span>Proteína g</span><input id="edP" type="number" inputmode="decimal" value="${v(f.p100)}"></label>
      <label class="field"><span>Grasa g</span><input id="edF" type="number" inputmode="decimal" value="${v(f.f100)}"></label>
    </div>
    <label class="check"><input type="checkbox" id="edRem" checked> Recordar para la próxima vez</label>
    <button class="btn" data-act="edsave">${icon('check')} Usar mis valores</button>
    ${f.edited ? `<button class="btn ghost" data-act="edreset">Volver a los valores originales</button>` : ''}
  </div>`;
}
function saveEdit() {
  const f = FD.food, r = 100 / (f.ug || 100);
  const n = id => Math.max(0, parseFloat($(id).value) || 0);
  const kc = parseFloat($('#edK').value);
  if (!(kc >= 0)) return toast('Escribe las calorías [[kori]]');
  const vals = { k100: kc * r, c100: n('#edC') * r, p100: n('#edP') * r, f100: n('#edF') * r };
  const base = f._base || { k100: f.k100, p100: f.p100, c100: f.c100, f100: f.f100 };
  FD.food = { ...f, ...vals, _base: base, edited: true };
  if ($('#edRem').checked && f.src !== 'quick') {
    S.over[f.key] = vals;
    S.recents = S.recents.map(x => x.key === f.key ? FD.food : x);
    S.favs = S.favs.map(x => x.key === f.key ? FD.food : x);
    save();
  }
  FD.editing = false; renderDetail(); toast('Valores actualizados [[star]]');
}
function updDetail() {
  const v = foodVals(FD.food, fdGrams());
  $('#fdK').textContent = fmt(v.kcal); $('#fdC').textContent = fmt1(v.c) + ' g';
  $('#fdP').textContent = fmt1(v.p) + ' g'; $('#fdF').textContent = fmt1(v.f) + ' g';
  $('#fdG').textContent = FD.mode === 'u' ? `${fmt(fdGrams())} g en total` : '';
}
function saveDetail() {
  if (!(FD.qty > 0)) return toast('Pon una cantidad [[kori]]');
  const g = fdGrams(), v = foodVals(FD.food, g);
  const d = dayMut(UI.date);
  const entry = { id: FD.entryId || uid(), food: FD.food, mode: FD.mode, qty: FD.mode === 'u' ? FD.qty : 1, g, ...v };
  if (FD.entryId) {
    const arr = d.meals[FD.meal]; const i = arr.findIndex(e => e.id === FD.entryId);
    if (i >= 0) arr[i] = entry;
  } else {
    d.meals[FD.meal].push(entry);
    if (FD.food.src !== 'quick') S.recents = [FD.food, ...S.recents.filter(x => x.key !== FD.food.key)].slice(0, 25);
  }
  save(); closeSheet(); render();
  toast(FD.entryId ? 'Listo, actualizado [[star]]' : `+${fmt(v.kcal)} kcal en ${MEALS.find(m => m.id === FD.meal).name.toLowerCase()} [[berry]]`);
}

/* ---------------- Rápido / crear comida ---------------- */
function openQuick() {
  openSheet(`${sheetHead('Agregar rápido', 'back-add')}
    <p class="muted small" style="margin:0 2px">Para cuando ya sabes cuántas calorías tiene (por ejemplo, lo dice la etiqueta).</p>
    <label class="field"><span>¿Qué comiste?</span><input id="qkN" placeholder="Ej. Galleta de la oficina"></label>
    <label class="field"><span>Calorías (kcal)</span><input id="qkK" type="number" inputmode="numeric" placeholder="150"></label>
    <div class="grid3">
      <label class="field"><span>Carbos g</span><input id="qkC" type="number" inputmode="decimal" placeholder="opcional"></label>
      <label class="field"><span>Proteína g</span><input id="qkP" type="number" inputmode="decimal" placeholder="opcional"></label>
      <label class="field"><span>Grasa g</span><input id="qkF" type="number" inputmode="decimal" placeholder="opcional"></label>
    </div>
    <div class="chips" style="margin-top:14px">${MEALS.map(m => `<button class="chip ${AS.meal === m.id ? 'on' : ''}" data-act="qkmeal" data-meal="${m.id}">${m.name}</button>`).join('')}</div>
    <button class="btn" data-act="qksave">${icon('check')} Agregar</button>`);
  setTimeout(() => $('#qkN') && $('#qkN').focus(), 250);
}
function saveQuick() {
  const kc = parseFloat($('#qkK').value);
  if (!(kc >= 0)) return toast('Escribe las calorías [[kori]]');
  const food = {
    key: 'q:' + uid(), name: $('#qkN').value.trim() || 'Comida rápida', unit: 'porción', ug: 100, src: 'quick',
    k100: kc, c100: parseFloat($('#qkC').value) || 0, p100: parseFloat($('#qkP').value) || 0, f100: parseFloat($('#qkF').value) || 0
  };
  const d = dayMut(UI.date);
  d.meals[AS.meal].push({ id: uid(), food, mode: 'u', qty: 1, g: 100, ...foodVals(food, 100) });
  save(); closeSheet(); render(); toast(`+${fmt(kc)} kcal [[berry]]`);
}
function openCustom(prefill = {}) {
  openSheet(`${sheetHead('Crear comida', 'back-add')}
    <p class="muted small" style="margin:0 2px">Se guarda en "Mis comidas" para usarla cuando quieras.</p>
    <label class="field"><span>Nombre</span><input id="cuN" placeholder="Ej. Licuado de banano de mi mamá" value="${esc(prefill.name || '')}"></label>
    <div class="grid2">
      <label class="field"><span>Porción</span><input id="cuU" placeholder="1 vaso" value="${esc(prefill.unit || '1 porción')}"></label>
      <label class="field"><span>Gramos de la porción</span><input id="cuG" type="number" inputmode="decimal" placeholder="250"></label>
    </div>
    <label class="field"><span>Calorías de 1 porción (kcal)</span><input id="cuK" type="number" inputmode="numeric" placeholder="220"></label>
    <div class="grid3">
      <label class="field"><span>Carbos g</span><input id="cuC" type="number" inputmode="decimal" placeholder="0"></label>
      <label class="field"><span>Proteína g</span><input id="cuP" type="number" inputmode="decimal" placeholder="0"></label>
      <label class="field"><span>Grasa g</span><input id="cuF" type="number" inputmode="decimal" placeholder="0"></label>
    </div>
    ${prefill.code ? `<p class="muted small">Código de barras: ${esc(prefill.code)}</p>` : ''}
    <button class="btn" data-act="cusave" data-code="${esc(prefill.code || '')}">${icon('check')} Guardar y agregar</button>`);
}
function saveCustom(code) {
  const name = $('#cuN').value.trim(), kc = parseFloat($('#cuK').value);
  if (!name) return toast('Ponle nombre [[kori]]');
  if (!(kc >= 0)) return toast('Escribe las calorías [[kori]]');
  const ug = parseFloat($('#cuG').value) || 100;
  const r = 100 / ug;
  const food = {
    key: code ? 'c:' + code : 'c:' + uid(), name, unit: $('#cuU').value.trim() || '1 porción', ug, src: 'custom', code: code || undefined,
    k100: kc * r, c100: (parseFloat($('#cuC').value) || 0) * r, p100: (parseFloat($('#cuP').value) || 0) * r, f100: (parseFloat($('#cuF').value) || 0) * r
  };
  S.custom = [food, ...S.custom.filter(f => f.key !== food.key)];
  save();
  openDetail(food, AS.meal);
}

/* ---------------- Escáner ---------------- */
async function openScan() {
  openSheet(`${sheetHead('Escanear código', 'back-add')}
    <div class="scan-box"><video id="scanV" playsinline muted></video></div>
    <p class="muted small" id="scanMsg" style="text-align:center">Apunta al código de barras del empaque [[box]]</p>
    <label class="search">${icon('barcode')}<input id="scanCode" type="text" inputmode="numeric" placeholder="O escribe el número del código" enterkeyhint="search"></label>
    <button class="btn soft" data-act="scango">${icon('search')} Buscar código</button>`);
  let stream = null, alive = true, timer = null;
  sheetCleanup = () => { alive = false; clearTimeout(timer); if (stream) stream.getTracks().forEach(t => t.stop()); };
  $('#scanCode').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ACT.scango(); } });
  const msg = t => { const m = $('#scanMsg'); if (m) m.textContent = t; };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    if (!alive) return stream.getTracks().forEach(t => t.stop());
    const v = $('#scanV'); v.srcObject = stream; await v.play();
    let Det = window.BarcodeDetector;
    try { if (!Det || !(await Det.getSupportedFormats()).includes('ean_13')) Det = null; } catch (e) { Det = null; }
    if (!Det) { msg('Preparando el lector...'); Det = (await import('https://cdn.jsdelivr.net/npm/barcode-detector@2/dist/es/pure.min.js')).BarcodeDetector; msg('Apunta al código de barras del empaque [[box]]'); }
    const det = new Det({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    const tick = async () => {
      if (!alive) return;
      try { const r = await det.detect(v); if (r.length && alive) { if (navigator.vibrate) navigator.vibrate(60); return lookupCode(r[0].rawValue); } } catch (e) { }
      timer = setTimeout(tick, 250);
    };
    tick();
  } catch (e) {
    msg('No pude abrir la cámara. Escribe el número del código aquí abajo.');
  }
}
async function lookupCode(code) {
  code = String(code).replace(/\D/g, '');
  if (code.length < 6) return toast('Ese código está incompleto');
  const mine = S.custom.find(f => f.code === code);
  if (mine) return openDetail(mine, AS.meal);
  if (sheetCleanup) { sheetCleanup(); sheetCleanup = null; }
  openSheet(`${sheetHead('Buscando...', 'back-add')}<div class="empty"><div class="bear">${bearSVG('normal')}</div>Buscando el producto ${esc(code)}</div><div class="spin"></div>`);
  try {
    const f = await offProduct(code);
    if (f) return openDetail(f, AS.meal);
    openSheet(`${sheetHead('No lo encontré', 'back-add')}<div class="empty"><div class="bear">${bearSVG('worried')}</div>Ese producto todavía no está en la base de datos.<br>Puedes crearlo con los datos de la etiqueta y la próxima vez lo reconozco [[heart]]</div>
      <button class="btn" data-act="custom" data-code="${esc(code)}">${icon('plus')} Crear con este código</button>`);
  } catch (e) {
    openSheet(`${sheetHead('Sin conexión', 'back-add')}<div class="empty"><div class="bear">${bearSVG('worried')}</div>Necesito internet para buscar códigos.</div>`);
  }
}

/* ---------------- Ejercicio / pasos / agua ---------------- */
const EXS = { i: 0, min: 30 };
function openEx() {
  const w = weightAt(UI.date);
  const e = EXERCISES[EXS.i];
  const kc = e.met * 3.5 * w / 200 * EXS.min;
  openSheet(`${sheetHead('Agregar ejercicio')}
    <div class="empty" style="padding:0 0 8px"><div class="bear" style="width:84px">${toriSticker('power')}</div></div>
    <div class="chips" style="flex-wrap:wrap">${EXERCISES.map((x, i) => `<button class="chip ${i === EXS.i ? 'on' : ''}" data-act="exi" data-i="${i}">${x.n}</button>`).join('')}</div>
    <label class="field"><span>Minutos</span></label>
    <div class="qty" style="margin-top:0">
      <button class="step" data-act="exstep" data-n="-5" aria-label="Menos">${icon('minus')}</button>
      <input id="exM" type="number" inputmode="numeric" value="${EXS.min}">
      <button class="step" data-act="exstep" data-n="5" aria-label="Más">${icon('plus')}</button>
    </div>
    <div class="food-hero" style="margin-top:14px"><div class="kc"><span id="exK">${fmt(kc)}</span> <small>kcal quemadas</small></div></div>
    <button class="btn" data-act="exsave">${icon('check')} Agregar</button>
    <div class="sec-t">¿Tu reloj ya te dijo cuánto quemaste?</div>
    <div class="grid2"><label class="field" style="margin-top:0"><input id="exN" placeholder="Actividad"></label><label class="field" style="margin-top:0"><input id="exK2" type="number" inputmode="numeric" placeholder="kcal"></label></div>
    <button class="btn soft" data-act="exsave2">Agregar con mis kcal</button>`);
  $('#exM').addEventListener('input', ev => { EXS.min = Math.max(0, parseFloat(ev.target.value) || 0); $('#exK').textContent = fmt(e.met * 3.5 * w / 200 * EXS.min); });
}
function openSteps() {
  const d = dayData(UI.date);
  openSheet(`${sheetHead('Pasos del día')}
    <div class="empty" style="padding-top:0"><div class="bear">${bearSVG('skip')}</div>Copia los pasos de tu reloj o del teléfono.</div>
    <div class="qty"><input id="stN" type="number" inputmode="numeric" placeholder="8000" value="${d.steps || ''}"></div>
    <p class="muted small" style="text-align:center">Tu nivel de actividad ya incluye unos ${fmt(baseSteps())} pasos; cada 1,000 pasos de más te dan ≈ ${fmt(0.55 * weightAt(UI.date))} kcal extra.</p>
    <button class="btn" data-act="stsave">${icon('check')} Guardar</button>`);
}
function openWeigh() {
  openSheet(`${sheetHead('Registrar peso')}
    <div class="empty" style="padding-top:0"><div class="bear">${bearSVG('love')}</div>Lo ideal es pesarte en ayunas, siempre a la misma hora.</div>
    <div class="qty">
      <button class="step" data-act="wstep" data-n="-0.1" aria-label="Menos">${icon('minus')}</button>
      <input id="wN" type="number" inputmode="decimal" step="0.1" value="${fmt1(latestWeight()).replace(',', '.')}">
      <button class="step" data-act="wstep" data-n="0.1" aria-label="Más">${icon('plus')}</button>
    </div>
    <label class="field"><span>Fecha</span><input id="wD" type="date" value="${todayKey()}" max="${todayKey()}"></label>
    <button class="btn" data-act="wsave">${icon('check')} Guardar</button>`);
}
function addWeight(date, kg) {
  S.weights = S.weights.filter(e => e.date !== date);
  S.weights.push({ date, kg: Math.round(kg * 10) / 10, t: Date.now() });
  S.weights.sort((a, b) => a.date < b.date ? -1 : 1);
}

/* ---------------- Perfil (editar) ---------------- */
function openProfile() {
  const p = S.profile;
  openSheet(`${sheetHead('Mis datos y metas')}
    <label class="field"><span>Nombre</span><input id="pN" value="${esc(p.name)}"></label>
    <div class="grid2">
      <label class="field"><span>Sexo</span><select id="pS"><option value="f" ${p.sex === 'f' ? 'selected' : ''}>Mujer</option><option value="m" ${p.sex === 'm' ? 'selected' : ''}>Hombre</option></select></label>
      <label class="field"><span>Edad</span><input id="pA" type="number" inputmode="numeric" value="${ageOf(p)}"></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Estatura (cm)</span><input id="pH" type="number" inputmode="numeric" value="${p.height}"></label>
      <label class="field"><span>Peso meta (kg)</span><input id="pG" type="number" inputmode="decimal" step="0.1" value="${p.goal}"></label>
    </div>
    <label class="field"><span>Peso con el que empecé (kg)</span><input id="pW" type="number" inputmode="decimal" step="0.1" value="${p.startWeight}"></label>
    <label class="field"><span>Actividad del día a día</span><select id="pAct">${ACTS.map(a => `<option value="${a.v}" ${a.v === p.act ? 'selected' : ''}>${a.n} · ${a.d}</option>`).join('')}</select></label>
    <label class="field"><span>Ritmo</span><select id="pP">${PACES.map(a => `<option value="${a.v}" ${a.v === p.pace ? 'selected' : ''}>${a.n} · ${a.d}</option>`).join('')}</select></label>
    <label class="field"><span>Reparto de macros</span><select id="pM">${MACRO_SPLITS.map(a => `<option value="${a.id}" ${a.id === (p.split || 'eq') ? 'selected' : ''}>${a.n} · ${a.c}/${a.p}/${a.f}</option>`).join('')}</select></label>
    <label class="field"><span>Presupuesto fijo de kcal (vacío = automático)</span><input id="pK" type="number" inputmode="numeric" placeholder="Automático" value="${p.customKcal || ''}"></label>
    <button class="btn" data-act="psave">${icon('check')} Guardar</button>`);
}
function saveProfile() {
  const p = S.profile;
  const num = id => parseFloat($(id).value);
  const age = num('#pA'), h = num('#pH'), g = num('#pG'), w0 = num('#pW');
  if (!(age >= 10 && age <= 100) || !(h >= 120 && h <= 230) || !(g >= 30 && g <= 250) || !(w0 >= 30 && w0 <= 250)) return toast('Revisa los números [[kori]]');
  Object.assign(p, {
    name: $('#pN').value.trim() || p.name, sex: $('#pS').value, birthYear: new Date().getFullYear() - Math.round(age),
    height: h, goal: Math.round(g * 10) / 10, startWeight: Math.round(w0 * 10) / 10, act: num('#pAct'), pace: num('#pP'),
    split: $('#pM').value, customKcal: num('#pK') > 0 ? Math.round(num('#pK')) : null,
  });
  S.profileU = Date.now();
  save(); closeSheet(); render(); toast('Guardado [[heart]]');
}

/* ---------------- Bienvenida ---------------- */
const O = { step: 0, name: '', sex: 'f', age: '', height: '', weight: '', goal: '', act: 1.375, pace: .5 };
function startOnboarding() { $('#onb').hidden = false; renderOnb(); }
function renderOnb() {
  const N = 6;
  const dots = `<div class="dots">${Array.from({ length: N }, (_, i) => `<i class="${i === O.step ? 'on' : ''}"></i>`).join('')}</div>`;
  const nav = (ok = 'Siguiente') => `<div class="grow"></div><button class="btn" data-act="onext">${ok}</button>${O.step ? '<button class="btn ghost" data-act="oback">Atrás</button>' : ''}`;
  let body = '';
  if (O.step === 0) body = `<div class="bear">${bearSVG('happy')}</div><h1>¡Hola, hola!</h1>
    <p class="lead">Soy tu osita de las calorías [[berry]]<br>Te ayudo a contar lo que comes, ver lo que quemas y llegar a tu peso meta, como en Huawei Salud pero más bonito.</p>${nav('Empezar')}`;
  if (O.step === 1) body = `<div class="bear">${bearSVG('normal')}</div><h1>¿Cómo te llamo?</h1>
    <label class="field"><input id="oN" value="${esc(O.name)}" placeholder="Tu nombre o apodo" autocomplete="given-name"></label>${nav()}`;
  if (O.step === 2) body = `<div class="bear">${bearSVG('berry')}</div><h1>Cuéntame de ti</h1>
    <p class="lead">Con esto calculo tu metabolismo.</p>
    <div class="sex">${[['f', 'Mujer'], ['m', 'Hombre']].map(([v, n]) => `<button class="opt ${O.sex === v ? 'on' : ''}" data-act="osex" data-v="${v}"><b>${n}</b></button>`).join('')}</div>
    <div class="grid2"><label class="field"><span>Edad</span><input id="oA" type="number" inputmode="numeric" value="${O.age}" placeholder="24"></label>
    <label class="field"><span>Estatura (cm)</span><input id="oH" type="number" inputmode="numeric" value="${O.height}" placeholder="160"></label></div>${nav()}`;
  if (O.step === 3) body = `<div class="bear">${bearSVG('love')}</div><h1>Tu peso y tu meta</h1>
    <div class="grid2"><label class="field"><span>Peso actual (kg)</span><input id="oW" type="number" inputmode="decimal" step="0.1" value="${O.weight}" placeholder="62.5"></label>
    <label class="field"><span>Peso meta (kg)</span><input id="oG" type="number" inputmode="decimal" step="0.1" value="${O.goal}" placeholder="56"></label></div>
    <p class="lead small" id="oBmi"></p>${nav()}`;
  if (O.step === 4) body = `<div class="bear sm">${bearSVG('skip')}</div><h1>¿Qué tan activa es tu día?</h1><p class="lead">Sin contar el ejercicio: eso lo anotas aparte y te da más calorías.</p>
    ${ACTS.map(a => `<button class="opt ${O.act === a.v ? 'on' : ''}" data-act="oact" data-v="${a.v}"><div><b>${a.n}</b><small>${a.d}</small></div></button>`).join('')}${nav()}`;
  if (O.step === 5) {
    const keep = Math.abs(+O.goal - +O.weight) < 0.3, gain = +O.goal > +O.weight;
    body = `<div class="bear sm">${bearSVG('cheer')}</div><h1>${keep ? '¡Listo!' : gain ? '¿A qué ritmo subimos?' : '¿A qué ritmo bajamos?'}</h1>
    ${keep ? '<p class="lead">Tu meta es mantenerte. Te doy un presupuesto para quedarte igualita.</p>' : PACES.map(a => `<button class="opt ${O.pace === a.v ? 'on' : ''}" data-act="opace" data-v="${a.v}"><div><b>${a.n}</b><small>${a.d}</small></div>${a.tag ? `<span class="tag">${a.tag}</span>` : ''}</button>`).join('')}
    ${planPreview()}${nav('¡Empezar!')}`;
  }
  $('#onb').innerHTML = emojify(`<div class="onb-in">${dots}${body}</div>`);
  const bmiEl = $('#oBmi');
  if (bmiEl) {
    const upd = () => {
      const w = parseFloat($('#oW').value), h = +O.height;
      if (w > 0 && h > 0) {
        const lo = 18.5 * Math.pow(h / 100, 2), hi = 24.9 * Math.pow(h / 100, 2);
        bmiEl.innerHTML = `Para tu estatura, el rango saludable es <b>${fmt1(lo)}–${fmt1(hi)} kg</b>.`;
      }
    };
    $('#oW').addEventListener('input', upd); upd();
  }
  const inp = $('#onb input'); if (inp && O.step) setTimeout(() => inp.focus(), 200);
}
function planPreview() {
  const tmp = S.profile;
  S.profile = { sex: O.sex, birthYear: new Date().getFullYear() - +O.age, height: +O.height, goal: +O.goal, startWeight: +O.weight, act: O.act, pace: O.pace, split: 'eq' };
  const keepW = S.weights; S.weights = [];
  const c = calc(todayKey());
  S.profile = tmp; S.weights = keepW;
  return `<div class="plan-box"><small class="muted">Tu presupuesto diario</small><div class="kc">${fmt(c.budget)}</div><small class="muted">kcal</small>
    ${c.mode !== 'keep' ? `<p>Llegarías a <b>${fmt1(+O.goal)} kg</b> cerca del <b>${fmtLong(c.eta)}</b> [[target]]</p>` : ''}
    ${c.clamped ? '<p class="muted small">No te dejo bajar de 1,200 kcal al día para cuidarte [[heart]]</p>' : ''}</div>`;
}
function onbNext() {
  const v = id => $(id) ? $(id).value.trim() : '';
  if (O.step === 1) { O.name = v('#oN'); if (!O.name) return toast('¿Cómo te llamas? [[cry]]'); }
  if (O.step === 2) {
    O.age = v('#oA'); O.height = v('#oH');
    if (!(+O.age >= 10 && +O.age <= 100)) return toast('Revisa tu edad [[kori]]');
    if (!(+O.height >= 120 && +O.height <= 230)) return toast('La estatura va en centímetros, ej. 160');
  }
  if (O.step === 3) {
    O.weight = v('#oW'); O.goal = v('#oG');
    if (!(+O.weight >= 30 && +O.weight <= 250) || !(+O.goal >= 30 && +O.goal <= 250)) return toast('Revisa los pesos (en kg) [[kori]]');
  }
  if (O.step === 5) {
    const kg = Math.round(+O.weight * 10) / 10;
    S.profile = {
      name: O.name, sex: O.sex, birthYear: new Date().getFullYear() - Math.round(+O.age), height: +O.height,
      startWeight: kg, goal: Math.round(+O.goal * 10) / 10, act: O.act, pace: O.pace, split: 'eq', customKcal: null, startDate: todayKey()
    };
    S.profileU = Date.now();
    addWeight(todayKey(), kg);
    save();
    $('#onb').hidden = true; $('#onb').innerHTML = '';
    UI.tab = 'hoy'; UI.date = todayKey();
    render(); toast(`¡Bienvenida, ${esc(O.name)}! [[berry]]`);
    return;
  }
  O.step++; renderOnb();
}

/* ---------------- Acciones ---------------- */
const ACT = {
  close: () => closeSheet(),
  day: el => { const n = +el.dataset.n; const k = addDays(UI.date, n); if (k <= todayKey()) { UI.date = k; render(); } },
  goday: el => { UI.date = el.dataset.k; UI.tab = 'hoy'; render(); scrollTo(0, 0); },
  week: el => { const k = addDays(UI.weekEnd, +el.dataset.n); UI.weekEnd = k > todayKey() ? todayKey() : k; render(); },
  cal: el => { let [y, m] = UI.cal; m += +el.dataset.n; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } UI.cal = [y, m]; render(); },
  add: el => openAdd(el.dataset.meal),
  ameal: el => { AS.meal = el.dataset.meal; document.querySelectorAll('[data-act="ameal"]').forEach(b => b.classList.toggle('on', b === el)); },
  acat: el => { AS.cat = el.dataset.cat; $('#addList').innerHTML = emojify(addListHTML()); },
  off: () => searchOFF(),
  pick: el => { const f = pickCache[el.dataset.key]; if (f) openDetail(f, AS.meal); },
  'back-add': () => { if (sheetCleanup) { sheetCleanup(); sheetCleanup = null; } renderAdd(); },
  fdmode: el => {
    const m = el.dataset.v; if (m === FD.mode) return;
    const g = fdGrams(); FD.mode = m;
    FD.qty = m === 'g' ? Math.round(g) : Math.round(g / (FD.food.ug || 100) * 4) / 4 || 1;
    renderDetail();
  },
  fdstep: el => {
    const st = FD.mode === 'g' ? 10 : (FD.qty < 1 || (FD.qty === 1 && +el.dataset.n < 0) ? .25 : .5);
    FD.qty = Math.max(0, Math.round((FD.qty + st * +el.dataset.n) * 100) / 100);
    $('#fdQ').value = FD.qty; updDetail();
  },
  fdmeal: el => { FD.meal = el.dataset.meal; AS.meal = FD.meal; document.querySelectorAll('[data-act="fdmeal"]').forEach(b => b.classList.toggle('on', b === el)); },
  fdsave: () => saveDetail(),
  fdedit: () => { FD.editing = !FD.editing; renderDetail(); if (FD.editing) setTimeout(() => $('#edK') && $('#edK').focus(), 100); },
  edsave: () => saveEdit(),
  edreset: () => {
    const f = FD.food; delete S.over[f.key];
    const { _base, edited, ...rest } = f;
    FD.food = { ...rest, ...(_base || {}) };
    S.recents = S.recents.map(x => x.key === f.key ? FD.food : x);
    S.favs = S.favs.map(x => x.key === f.key ? FD.food : x);
    save(); FD.editing = false; renderDetail(); toast('Valores originales');
  },
  fddel: () => {
    const d = dayMut(UI.date);
    d.meals[FD.meal] = d.meals[FD.meal].filter(e => e.id !== FD.entryId);
    tomb(FD.entryId);
    pruneDay(UI.date); save(); closeSheet(); render(); toast('Quitado');
  },
  fav: el => {
    const f = FD.food;
    if (S.favs.some(x => x.key === f.key)) S.favs = S.favs.filter(x => x.key !== f.key);
    else S.favs = [f, ...S.favs].slice(0, 40);
    save(); el.classList.toggle('on'); toast(el.classList.contains('on') ? 'Guardada en favoritas [[heart]]' : 'Quitada de favoritas');
  },
  edit: el => {
    const e = (dayData(UI.date).meals[el.dataset.meal] || []).find(x => x.id === el.dataset.id);
    if (e) openDetail(e.food, el.dataset.meal, e);
  },
  copy: el => {
    const m = el.dataset.meal, src = dayData(addDays(UI.date, -1)).meals[m] || [];
    const d = dayMut(UI.date);
    src.forEach(e => d.meals[m].push({ ...e, id: uid() }));
    save(); render(); toast('Copiado de ayer [[star]]');
  },
  quick: () => openQuick(),
  qkmeal: el => { AS.meal = el.dataset.meal; document.querySelectorAll('[data-act="qkmeal"]').forEach(b => b.classList.toggle('on', b === el)); },
  qksave: () => saveQuick(),
  custom: el => openCustom({ code: el.dataset.code || '' }),
  cusave: el => saveCustom(el.dataset.code),
  cdel: async el => {
    const f = S.custom.find(x => x.key === el.dataset.key);
    if (f && await confirmSheet(`¿Borrar "${f.name}" de mis comidas?`, 'Sí, borrar')) { S.custom = S.custom.filter(x => x !== f); save(); render(); }
  },
  scan: () => openScan(),
  scango: () => { const c = $('#scanCode').value; if (c.trim()) lookupCode(c); },
  ex: () => { EXS.i = 0; EXS.min = 30; openEx(); },
  exi: el => { EXS.i = +el.dataset.i; EXS.min = Math.max(0, parseFloat($('#exM').value) || 0); openEx(); },
  exstep: el => { EXS.min = Math.max(0, (parseFloat($('#exM').value) || 0) + +el.dataset.n); openEx(); },
  exsave: () => {
    const e = EXERCISES[EXS.i]; if (!(EXS.min > 0)) return toast('¿Cuántos minutos? [[kori]]');
    const kcal = Math.round(e.met * 3.5 * weightAt(UI.date) / 200 * EXS.min);
    dayMut(UI.date).ex.push({ id: uid(), name: e.n, min: EXS.min, kcal });
    save(); closeSheet(); render(); toast(`¡Bien ahí! −${fmt(kcal)} kcal [[star]]`);
  },
  exsave2: () => {
    const kcal = parseFloat($('#exK2').value); if (!(kcal > 0)) return toast('Escribe las kcal [[kori]]');
    dayMut(UI.date).ex.push({ id: uid(), name: $('#exN').value.trim() || 'Actividad', min: 0, kcal: Math.round(kcal) });
    save(); closeSheet(); render(); toast(`¡Bien ahí! −${fmt(kcal)} kcal [[star]]`);
  },
  exdel: async el => {
    const d = dayMut(UI.date), e = d.ex.find(x => x.id === el.dataset.id);
    if (e && await confirmSheet(`¿Quitar "${e.name}"?`, 'Sí, quitar')) { d.ex = d.ex.filter(x => x !== e); tomb(e.id); pruneDay(UI.date); save(); render(); }
  },
  steps: () => openSteps(),
  stsave: () => { const n = Math.max(0, Math.round(parseFloat($('#stN').value) || 0)); dayMut(UI.date).steps = n; pruneDay(UI.date); save(); closeSheet(); render(); },
  water: el => {
    const i = +el.dataset.i, d = dayMut(UI.date);
    d.water = (d.water || 0) === i + 1 ? i : i + 1;
    pruneDay(UI.date); save(); render();
    if (d.water === WATER_CUPS) toast('¡Meta de agüita cumplida! [[drop]][[tori]]');
  },
  weigh: () => openWeigh(),
  wstep: el => { const i = $('#wN'); i.value = (Math.round(((parseFloat(i.value) || 0) + +el.dataset.n) * 10) / 10).toFixed(1); },
  wsave: () => {
    const kg = parseFloat($('#wN').value), date = $('#wD').value || todayKey();
    if (!(kg >= 30 && kg <= 250)) return toast('Revisa el peso [[kori]]');
    const before = latestWeight();
    addWeight(date > todayKey() ? todayKey() : date, kg); save(); closeSheet(); render();
    const dl = kg - before;
    toast(dl < -0.05 ? `¡Bajaste ${fmt1(-dl)} kg! [[star]]` : 'Peso guardado [[heart]]');
  },
  wdel: async el => {
    if (S.weights.length <= 1) return toast('Necesito al menos un registro');
    if (await confirmSheet(`¿Borrar el registro del ${fmtShort(el.dataset.date)}?`, 'Sí, borrar')) { S.weights = S.weights.filter(e => e.date !== el.dataset.date); tomb('w:' + el.dataset.date); save(); render(); }
  },
  wrange: el => { UI.wRange = el.dataset.v; render(); },
  profile: () => openProfile(),
  psave: () => saveProfile(),
  theme: el => { S.theme = el.dataset.v; save(); render(); },
  export: () => {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `osita-calorias-${todayKey()}.json`; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('Copia guardada [[star]]');
  },
  reset: async () => {
    if (!(await confirmSheet('¿Borrar TODO? Se pierden tus comidas, pesos y metas.', 'Sí, borrar todo'))) return;
    S = { ...defaults(), resetU: Date.now() }; save(); O.step = 0; render();
  },
  osex: el => { O.sex = el.dataset.v; O.age = $('#oA').value; O.height = $('#oH').value; renderOnb(); },
  oact: el => { O.act = +el.dataset.v; renderOnb(); },
  opace: el => { O.pace = +el.dataset.v; renderOnb(); },
  onext: () => onbNext(),
  oback: () => { O.step = Math.max(0, O.step - 1); renderOnb(); },
};

document.addEventListener('click', e => {
  const tab = e.target.closest('.tab');
  if (tab) { UI.tab = tab.dataset.tab; if (UI.tab === 'diario') UI.weekEnd = todayKey(); render(); scrollTo(0, 0); return; }
  if (e.target.closest('#fab')) return openAdd();
  if (e.target.closest('[data-close]')) return closeSheet();
  const el = e.target.closest('[data-act]');
  if (el && ACT[el.dataset.act]) { e.preventDefault(); ACT[el.dataset.act](el, e); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#sheetWrap').hidden) closeSheet();
  if (e.key === 'Enter' && !$('#onb').hidden && e.target.tagName === 'INPUT') { e.preventDefault(); onbNext(); }
});
document.addEventListener('change', async e => {
  if (e.target.id !== 'importFile') return;
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !data.v || !data.profile) throw new Error('formato');
    if (!(await confirmSheet('¿Reemplazar tus datos actuales con esta copia?', 'Sí, cargar', 'normal'))) return;
    S = Object.assign(defaults(), data); save(); render(); toast('Copia cargada [[star]]');
  } catch (err) { toast('Ese archivo no es una copia válida [[cry]]'); }
  e.target.value = '';
});

// Si la app queda abierta pasada la medianoche, "hoy" avanza solo
let lastToday = todayKey();
setInterval(() => {
  const t = todayKey();
  if (t !== lastToday) { if (UI.date === lastToday) UI.date = t; lastToday = t; if ($('#sheetWrap').hidden) render(); }
}, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && $('#sheetWrap').hidden && S.profile) render(); });

window.addEventListener('DOMContentLoaded', () => {
  hydrateIcons();
  render();
  bajar();
});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
}
