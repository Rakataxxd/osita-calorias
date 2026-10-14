'use strict';
/* Cuenta y nube: la app guarda primero en el teléfono (funciona sin internet) y en cuanto puede
   sube todo al servidor. Si dos aparatos guardan a la vez, se mezclan día por día. */

// 'osita.api' en localStorage solo sirve para probar contra un servidor local
const API = (() => { try { return localStorage.getItem('osita.api'); } catch (e) { return null; } })() || 'https://osita-calorias.rakataxxd.workers.dev';
const K_SES = 'osita.sesion', K_META = 'osita.nube';

function leerLS(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function escribirLS(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }

const NB = {
  ses: leerLS(K_SES),
  meta: leerLS(K_META) || { rev: 0, dirty: false, last: 0, usuario: null },
  timer: null, busy: false, error: '',
};
const needLogin = () => !NB.ses && !S.demo;

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (NB.ses) headers.Authorization = 'Bearer ' + NB.ses.token;
  const r = await fetch(API + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) }, cache: 'no-store' });
  let j = {};
  try { j = await r.json(); } catch (e) { }
  if (r.status === 401 && NB.ses && path !== '/api/login' && path !== '/api/clave') sesionVencida();
  return { status: r.status, ok: r.ok, j };
}
function guardarMeta() { escribirLS(K_META, NB.meta); }

// Lo llama save() de app.js cada vez que cambia algo
function nubeMarcar() {
  if (!NB.ses || S.demo || !S.profile) return;
  NB.meta.dirty = true; guardarMeta();
  clearTimeout(NB.timer);
  NB.timer = setTimeout(subir, 1500);
}

function sinTransitorios(s) {
  const { demo, ...resto } = s;
  return resto;
}

async function subir() {
  if (!NB.ses || S.demo || !S.profile || NB.busy || !NB.meta.dirty) return;
  if (!navigator.onLine) { pintarNube(); return; }
  NB.busy = true;
  try {
    const r = await api('/api/datos', { method: 'PUT', body: JSON.stringify({ datos: sinTransitorios(S), rev: NB.meta.rev }) });
    if (r.ok) {
      NB.meta = { ...NB.meta, rev: r.j.rev, dirty: false, last: Date.now() }; NB.error = '';
    } else if (r.status === 409) {
      // Otro aparato guardó antes: mezclar y volver a intentar
      if (r.j.datos) { S = Object.assign(defaults(), mezclar(S, r.j.datos)); localStorage.setItem(KEY, JSON.stringify(S)); }
      NB.meta.rev = r.j.rev; NB.busy = false; guardarMeta();
      refrescarSiSePuede();
      return subir();
    } else if (r.status !== 401) {
      NB.error = r.j.error || 'No se pudo guardar en la nube';
    }
  } catch (e) { NB.error = 'Sin conexión'; }
  NB.busy = false; guardarMeta(); pintarNube();
}

// Trae lo de la nube (al abrir la app, al volver a ella, al iniciar sesión)
async function bajar() {
  if (!NB.ses || S.demo) return;
  try {
    const r = await api('/api/datos');
    if (!r.ok) return;
    const srv = r.j.datos;
    if (!srv) {
      NB.meta.rev = 0;
      if (S.profile) { NB.meta.dirty = true; guardarMeta(); subir(); }
      return;
    }
    if (r.j.rev === NB.meta.rev && !NB.meta.dirty) return; // ya estamos al día
    S = Object.assign(defaults(), NB.meta.dirty && S.profile ? mezclar(S, srv) : srv);
    localStorage.setItem(KEY, JSON.stringify(S));
    NB.meta.rev = r.j.rev; NB.meta.last = Date.now(); guardarMeta();
    refrescarSiSePuede();
    if (NB.meta.dirty) subir();
  } catch (e) { }
}

// a = local, b = nube. Se mezcla comida por comida; lo borrado (S.del) no revive.
function mezclar(a, b) {
  // "Borrar todo" en un teléfono gana sobre lo que había antes en el otro
  if ((a.resetU || 0) > (b.profileU || 0) && (a.resetU || 0) > (b.resetU || 0)) b = defaults();
  else if ((b.resetU || 0) > (a.profileU || 0) && (b.resetU || 0) > (a.resetU || 0)) a = defaults();
  const out = Object.assign(defaults(), b, a);
  const del = { ...(b.del || {}), ...(a.del || {}) };
  const corte = Date.now() - 120 * 864e5; // las marcas de borrado viejas ya no hacen falta
  for (const k in del) if (del[k] < corte) delete del[k];
  out.del = del;
  const unirIds = (x, y) => {
    const m = new Map();
    for (const e of y || []) m.set(e.id, e);
    for (const e of x || []) m.set(e.id, e);
    return [...m.values()].filter(e => !del[e.id]);
  };
  out.days = {};
  for (const k of new Set([...Object.keys(a.days || {}), ...Object.keys(b.days || {})])) {
    const da = (a.days || {})[k], db = (b.days || {})[k];
    if (!da || !db) { out.days[k] = da || db; continue; }
    const nuevo = (da.u || 0) >= (db.u || 0) ? da : db;
    const d = { ...nuevo, meals: {}, ex: unirIds(da.ex, db.ex) };
    for (const m of MEALS) d.meals[m.id] = unirIds((da.meals || {})[m.id], (db.meals || {})[m.id]);
    d.u = Math.max(da.u || 0, db.u || 0);
    out.days[k] = d;
  }
  const w = new Map();
  for (const e of [...(b.weights || []), ...(a.weights || [])]) {
    const o = w.get(e.date);
    if (!o || (e.t || 0) >= (o.t || 0)) w.set(e.date, e);
  }
  out.weights = [...w.values()].filter(e => !(del['w:' + e.date] >= (e.t || 0))).sort((x, y) => x.date < y.date ? -1 : 1);
  const unir = (x, y) => { const m = new Map((y || []).map(f => [f.key, f])); for (const f of x || []) m.set(f.key, f); return [...m.values()]; };
  out.custom = unir(a.custom, b.custom);
  out.favs = unir(a.favs, b.favs);
  out.recents = unir(a.recents, b.recents).slice(0, 25);
  out.over = { ...(b.over || {}), ...(a.over || {}) };
  const la = a.profileU || 0, lb = b.profileU || 0;
  out.profile = la >= lb ? (a.profile || b.profile) : b.profile;
  out.profileU = Math.max(la, lb);
  out.resetU = Math.max(a.resetU || 0, b.resetU || 0);
  return out;
}

function refrescarSiSePuede() {
  if (!$('#onb').hidden && S.profile && !needLogin()) { $('#onb').hidden = true; $('#onb').innerHTML = ''; }
  if ($('#sheetWrap').hidden) render(); else pintarNube();
}

function sesionVencida() {
  NB.ses = null; escribirLS(K_SES, null);
  toast('Tu sesión se cerró. Entra de nuevo [[kori]]');
  render();
}

/* ---------------- Pantalla de entrar ---------------- */
function showLogin(msg = '') {
  $('#app').hidden = true;
  const o = $('#onb'); o.hidden = false;
  o.innerHTML = emojify(`<div class="onb-in">
    <div class="bear">${bearSVG('berry')}</div>
    <h1>Osita Calorías</h1>
    <p class="lead">Entra con tu cuenta para que todo quede guardado en la nube [[heart]]</p>
    <form id="loginF" autocomplete="on">
      <label class="field"><span>Usuario</span><input id="lgU" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc((NB.meta && NB.meta.usuario) || '')}"></label>
      <label class="field"><span>Contraseña</span><input id="lgP" name="password" type="password" autocomplete="current-password"></label>
      <p class="login-err" id="lgE">${esc(msg)}</p>
      <button class="btn" id="lgB" type="submit">Entrar</button>
    </form>
    <div class="grow"></div>
  </div>`);
  $('#loginF').addEventListener('submit', async e => {
    e.preventDefault();
    const usuario = $('#lgU').value.trim().toLowerCase(), pass = $('#lgP').value;
    if (!usuario || !pass) return ($('#lgE').textContent = 'Escribe tu usuario y contraseña');
    $('#lgB').disabled = true; $('#lgB').textContent = 'Entrando...'; $('#lgE').textContent = '';
    try {
      const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ usuario, pass }) });
      if (!r.ok) throw new Error(r.j.error || 'No se pudo entrar');
      if (NB.meta.usuario && NB.meta.usuario !== r.j.usuario) {
        // Otra cuenta en este teléfono: no mezclar sus datos
        S = defaults(); localStorage.setItem(KEY, JSON.stringify(S));
        NB.meta = { rev: 0, dirty: false, last: 0, usuario: null };
      }
      NB.ses = { usuario: r.j.usuario, token: r.j.token }; escribirLS(K_SES, NB.ses);
      NB.meta.usuario = r.j.usuario; if (S.profile) NB.meta.dirty = true; guardarMeta();
      await bajar();
      o.hidden = true; o.innerHTML = '';
      render();
      if (S.profile) toast(`¡Hola de nuevo, ${esc(S.profile.name)}! [[heart]]`);
    } catch (err) {
      $('#lgE').textContent = err.message === 'Failed to fetch' ? 'Sin conexión. Revisa tu internet.' : err.message;
      $('#lgB').disabled = false; $('#lgB').textContent = 'Entrar';
    }
  });
}

/* ---------------- Tarjeta "Mi cuenta" en Yo ---------------- */
function haceCuanto(ts) {
  if (!ts) return 'nunca';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'hace un momento';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `el ${fmtShort(keyOf(new Date(ts)))}`;
}
function estadoNube() {
  if (S.demo) return ['muted', 'Con datos de ejemplo: no se sube nada a la nube'];
  if (NB.busy) return ['muted', 'Guardando en la nube...'];
  if (NB.meta.dirty) return ['warn', navigator.onLine ? (NB.error || 'Cambios por subir...') : 'Sin internet: se sube solo cuando vuelva'];
  return ['ok', `Todo guardado en la nube · ${haceCuanto(NB.meta.last)}`];
}
function nubeCard() {
  if (!NB.ses) return '';
  const [cls, txt] = estadoNube();
  return `<section class="card">
    <h3>${icon('user')} Mi cuenta</h3>
    <p class="small" style="margin:8px 0 0">Conectada como <b>${esc(NB.ses.usuario)}</b></p>
    <p class="nube-st ${cls}" id="nubeSt">${txt}</p>
    <button class="settings-row" data-act="nubeYa">${icon('upload')}<span>Guardar ahora</span></button>
    <button class="settings-row" data-act="clave">${icon('edit')}<span>Cambiar contraseña</span></button>
    <button class="settings-row" data-act="salir" style="color:var(--red)">${icon('close')}<span>Cerrar sesión</span></button>
  </section>`;
}
function pintarNube() {
  const el = document.getElementById('nubeSt');
  if (!el) return;
  const [cls, txt] = estadoNube();
  el.className = 'nube-st ' + cls; el.textContent = txt;
}

function abrirClave() {
  openSheet(`${sheetHead('Cambiar contraseña')}
    <label class="field"><span>Contraseña actual</span><input id="ckA" type="password" autocomplete="current-password"></label>
    <label class="field"><span>Nueva contraseña</span><input id="ckN" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres"></label>
    <p class="login-err" id="ckE"></p>
    <button class="btn" data-act="claveOk">${icon('check')} Cambiar</button>`);
}

ACT.nubeYa = async () => {
  if (S.demo) return toast('Quita los datos de ejemplo primero');
  NB.meta.dirty = true; await subir();
  toast(NB.meta.dirty ? 'No se pudo subir ahorita [[cry]]' : 'Guardado en la nube [[star]]');
};
ACT.clave = () => abrirClave();
ACT.claveOk = async () => {
  const actual = $('#ckA').value, nueva = $('#ckN').value;
  if (nueva.length < 6) return ($('#ckE').textContent = 'La nueva necesita mínimo 6 caracteres');
  try {
    const r = await api('/api/clave', { method: 'POST', body: JSON.stringify({ actual, nueva }) });
    if (!r.ok) return ($('#ckE').textContent = r.j.error || 'No se pudo cambiar');
    closeSheet(); toast('Contraseña cambiada [[heart]]');
  } catch (e) { $('#ckE').textContent = 'Sin conexión'; }
};
ACT.salir = async () => {
  if (NB.meta.dirty && !S.demo) await subir();
  if (NB.meta.dirty && !S.demo && !(await confirmSheet('Hay cambios que no se han subido a la nube. Si sales ahora se pierden. ¿Salir igual?', 'Salir igual'))) return;
  else if (!NB.meta.dirty && !(await confirmSheet('¿Cerrar sesión en este teléfono?', 'Sí, salir', 'normal'))) return;
  try { await api('/api/salir', { method: 'POST' }); } catch (e) { }
  NB.ses = null; escribirLS(K_SES, null);
  NB.meta = { rev: 0, dirty: false, last: 0, usuario: NB.meta.usuario }; guardarMeta();
  S = defaults(); localStorage.setItem(KEY, JSON.stringify(S));
  try { localStorage.removeItem('osita-calorias.antes-del-demo'); } catch (e) { }
  UI.tab = 'hoy'; UI.date = todayKey();
  render();
};

window.addEventListener('online', () => { subir(); bajar(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) subir(); else if (!NB.meta.dirty) bajar(); else subir();
});
setInterval(() => { if (!document.hidden && NB.ses && !S.demo) { if (NB.meta.dirty) subir(); else bajar(); } }, 120000);
