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
    const hoyK = todayKey(), antes = ((S.days[hoyK] || {}).salud || {}).ts;
    S = Object.assign(defaults(), NB.meta.dirty && S.profile ? mezclar(S, srv) : srv);
    localStorage.setItem(KEY, JSON.stringify(S));
    NB.meta.rev = r.j.rev; NB.meta.last = Date.now(); guardarMeta();
    refrescarSiSePuede();
    const despues = ((S.days[hoyK] || {}).salud || {}).ts;
    if (despues && despues !== antes) { S.atajoListo = true; toast('Llegaron tus pasos del iPhone [[heart]]'); }
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
    const sa = da.salud, sb = db.salud;
    if (sa || sb) d.salud = !sa ? sb : !sb ? sa : (sa.ts >= sb.ts ? sa : sb);
    d.steps = Math.max(da.steps || 0, db.steps || 0);
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

/* ---------------- Ranking: quién quemó más calorías ---------------- */
const PERIODOS = [['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año'], ['todo', 'Todo']];
const RK = { periodo: 'semana', data: null, cargando: false, error: '', abierto: false };

function rankingCTA() {
  if (!NB.ses) return '';
  return `<button class="card rank-cta" data-act="ranking">
    <div class="rank-st">${bearSVG('cheer')}</div>
    <div class="in"><b>Ranking</b><small>¿Quién quemó más calorías?</small></div>${icon('chevR')}
  </button>`;
}
function rangoTexto(d) {
  if (!d) return '';
  if (d.periodo === 'hoy') return 'Solo hoy';
  if (d.periodo === 'todo') return 'Desde el primer día';
  return `Del ${fmtShort(d.desde)} a hoy`;
}
function pintarRanking() {
  if (!RK.abierto) return;
  const d = RK.data && RK.data.periodo === RK.periodo ? RK.data : null;
  const filas = d ? d.filas : [];
  const max = Math.max(1, ...filas.map(f => f.kcal));
  const lider = filas[0] && filas[0].kcal > 0 ? filas[0] : null;
  const empate = lider && filas[1] && filas[1].kcal === lider.kcal;
  const medalla = i => ['#ffd24d', '#cfd6df', '#e8b08a'][i] || 'var(--accent-2)';
  let cuerpo = '';
  if (RK.cargando && !d) cuerpo = '<div class="spin"></div>';
  else if (RK.error && !d) cuerpo = `<div class="empty"><div class="bear">${bearSVG('worried')}</div>${esc(RK.error)}</div>`;
  else if (d) {
    cuerpo = `
      <div class="rank-hero anim">
        <div class="bear">${lider && !empate ? `<span class="crown">${EMO.crown}</span>` : ''}${bearSVG(lider ? 'cheer' : 'sleepy')}</div>
        <div><small class="muted">${rangoTexto(d)}</small>
          <h2>${!lider ? 'Nadie ha quemado nada todavía' : empate ? '¡Van empatados!' : `¡${esc(lider.nombre)} va ganando!`}</h2>
          ${lider && !empate ? `<p class="small" style="margin:4px 0 0"><span data-count="${lider.kcal}">0</span> kcal quemadas [[star]]</p>` : '<p class="small muted" style="margin:4px 0 0">A moverse [[heart]]</p>'}
        </div>
      </div>
      <div class="list rank-list">${filas.map((f, i) => `
        <div class="rank-row anim ${f.yo ? 'yo' : ''} ${i === 0 && f.kcal > 0 ? 'first' : ''}" style="animation-delay:${120 + i * 90}ms">
          <span class="pos" style="background:${f.kcal > 0 ? medalla(i) : '#f4ece9'}">${i + 1}</span>
          <div class="in">
            <b>${esc(f.nombre)}${f.yo ? ' <em>(tú)</em>' : ''}</b>
            <small>${!f.empezo ? 'Todavía no empieza' : `${fmt(f.min)} min de ejercicio · ${f.dias} ${f.dias === 1 ? 'día activo' : 'días activos'}`}</small>
            <div class="bar"><i data-w="${f.kcal / max * 100}%" style="width:0;transition-delay:${250 + i * 90}ms;background:${i === 0 && f.kcal > 0 ? 'linear-gradient(90deg,var(--accent),var(--red))' : 'var(--accent)'}"></i></div>
            ${f.mejor && d.periodo !== 'hoy' ? `<small>Mejor día: ${fmtShort(f.mejor.dia)} · ${fmt(f.mejor.kcal)} kcal</small>` : ''}
          </div>
          <span class="kc"><span data-count="${f.kcal}">0</span><small>kcal</small></span>
        </div>`).join('')}</div>
      ${RK.cargando ? '<div class="spin"></div>' : ''}`;
  }
  openSheet(`${sheetHead('Ranking')}
    <div class="seg">${PERIODOS.map(([v, n]) => `<button class="${RK.periodo === v ? 'on' : ''}" data-act="rkp" data-v="${v}">${n}</button>`).join('')}</div>
    ${S.demo ? '<p class="tip" style="margin-top:12px">Estás viendo datos de ejemplo; el ranking usa lo que está guardado en la nube.</p>' : ''}
    ${cuerpo}
    <p class="muted small" style="margin:14px 4px 0;line-height:1.5">Cuenta las calorías de <b>actividad</b>: el ejercicio que anotas más los pasos por encima de tu nivel de actividad. El metabolismo en reposo no cuenta, para que sea justo.</p>`);
  RK.abierto = true; // openSheet acaba de correr el cleanup anterior
  if (d && !RK.cargando) animarRanking(lider && !empate);
  sheetCleanup = () => { RK.abierto = false; };
}
async function cargarRanking() {
  RK.cargando = true; RK.error = ''; pintarRanking();
  try {
    const r = await api(`/api/ranking?periodo=${RK.periodo}&hoy=${todayKey()}`);
    if (!r.ok) throw new Error(r.j.error || 'error');
    RK.data = r.j;
  } catch (e) {
    RK.error = navigator.onLine ? 'No se pudo cargar el ranking' : 'Necesitas internet para ver el ranking';
  }
  RK.cargando = false; pintarRanking();
}
ACT.ranking = async (el, e) => {
  // El botón se aplasta, salen corazones del dedo y luego abre
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  if (e && e.clientX) burst(e.clientX, e.clientY, 10);
  await new Promise(r => setTimeout(r, sinMovimiento() ? 0 : 280));
  RK.abierto = true; RK.data = null;
  pintarRanking();
  if (NB.meta.dirty && !S.demo) await subir(); // que lo último de hoy ya cuente
  cargarRanking();
};
ACT.rkp = (el, e) => {
  if (RK.periodo === el.dataset.v) return;
  RK.periodo = el.dataset.v;
  if (e && e.clientX) burst(e.clientX, e.clientY, 6);
  cargarRanking();
};

/* ---------------- Atajo de iPhone (pasos y energía activa de Salud) ---------------- */
const NOMBRE_ATAJO = 'Osita Salud';
const AT = { token: null, ultimo: null, error: '' };
const atajoListo = () => !!S.atajoListo || Object.values(S.days || {}).some(d => d && d.salud);
const urlAtajo = () => `${API}/api/salud?t=${AT.token}`;

function pintarAtajo() {
  const paso = (n, html) => `<li><span class="n">${n}</span><div>${html}</div></li>`;
  openSheet(`${sheetHead('Pasos del iPhone')}
    <div class="empty" style="padding:0 0 6px"><div class="bear" style="width:86px">${toriSticker('power')}</div>
      Las páginas web no pueden leer la app Salud, pero un <b>Atajo</b> del iPhone sí, y nos manda tus pasos y calorías activas.</div>
    ${!AT.token ? (AT.error ? `<p class="login-err">${esc(AT.error)}</p>` : '<div class="spin"></div>') : `
    <div class="card" style="margin-top:6px">
      <h3>${icon('link')} Tu dirección secreta</h3>
      <p class="muted small" style="margin:4px 0 8px">Es solo tuya: con ella el atajo guarda en tu cuenta. No la compartas.</p>
      <div class="url-box" id="atUrl">${esc(urlAtajo())}</div>
      <button class="btn" data-act="atajoCopiar">${icon('copy')} Copiar dirección</button>
      <p class="nube-st ${AT.ultimo ? 'ok' : 'muted'}" style="margin-top:10px">${AT.ultimo ? `Último envío del iPhone: ${haceCuanto(AT.ultimo)}` : 'Todavía no ha llegado nada del iPhone'}</p>
    </div>
    <div class="card">
      <h3>${icon('sparkle')} Arma el atajo (una sola vez)</h3>
      <ol class="pasos">
        ${paso(1, `Abre la app <b>Atajos</b>, toca <b>+</b> y ponle de nombre exactamente <b>${NOMBRE_ATAJO}</b>.`)}
        ${paso(2, `Agrega <b>Buscar muestras de salud</b>. Tipo: <b>Pasos</b>. Agrega el filtro <b>Fecha de inicio · es hoy</b>. En <b>Agrupar por</b> elige <b>Día</b>.`)}
        ${paso(3, `Agrega <b>Calcular estadísticas</b> y elige <b>Suma</b>.`)}
        ${paso(4, `Repite los pasos 2 y 3 pero con <b>Energía activa</b>.`)}
        ${paso(5, `Agrega <b>Obtener contenido de URL</b> y pega la dirección de arriba. Toca la flechita: Método <b>POST</b>, Cuerpo de la solicitud <b>JSON</b>.`)}
        ${paso(6, `Agrega dos campos tipo <b>Número</b>: <code>pasos</code> con la primera <b>Estadísticas</b> y <code>kcal</code> con la segunda.`)}
        ${paso(7, `Toca el botón de reproducir para probarlo. La primera vez el iPhone te pide permiso para leer Salud: dale <b>Permitir</b>.`)}
      </ol>
    </div>
    <div class="card">
      <h3>${icon('bolt')} Que se mande solo (opcional)</h3>
      <ol class="pasos">
        ${paso(1, `En Atajos ve a <b>Automatización</b> → <b>+</b> → <b>App</b>.`)}
        ${paso(2, `Elige la app que más abres (WhatsApp, Instagram...) → <b>Se abre</b> → <b>Ejecutar inmediatamente</b>.`)}
        ${paso(3, `Escoge el atajo <b>${NOMBRE_ATAJO}</b>. Listo: cada vez que abras esa app se actualizan tus pasos.`)}
      </ol>
      <p class="muted small" style="margin:8px 2px 0">Con el teléfono bloqueado el iPhone no deja leer Salud; por eso conviene que corra al abrir una app y no a una hora fija.</p>
    </div>
    <button class="btn" data-act="atajoProbar">${icon('steps')} Probar el atajo ahora</button>
    <button class="btn ghost" data-act="atajoNuevo">Cambiar mi dirección secreta</button>
    <p class="muted small" style="margin:8px 4px 0;line-height:1.5">Si usas Apple Watch, "Agrupar por Día" evita que los pasos del reloj y del teléfono se cuenten doble. La energía activa incluye tu movimiento normal; solo cuenta lo que pasa de tu nivel de actividad, y se usa lo mayor entre eso y lo que anotas a mano.</p>`}`);
}
async function abrirAtajo() {
  AT.error = '';
  pintarAtajo();
  try {
    const r = await api('/api/atajo');
    if (!r.ok) throw new Error(r.j.error || 'No se pudo');
    AT.token = r.j.token; AT.ultimo = r.j.ultimo;
  } catch (e) { AT.error = navigator.onLine ? 'No se pudo cargar. Intenta de nuevo.' : 'Necesitas internet para configurar esto'; }
  if (!$('#sheetWrap').hidden) pintarAtajo();
}
function correrAtajo() {
  location.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent(NOMBRE_ATAJO);
}
ACT.atajo = () => abrirAtajo();
ACT.traer = () => {
  if (S.demo) return toast('Quita los datos de ejemplo primero');
  if (!atajoListo()) return abrirAtajo();
  toast('Abriendo el atajo... luego regresa aquí [[heart]]');
  setTimeout(correrAtajo, 400);
};
ACT.atajoProbar = () => { S.atajoListo = true; correrAtajo(); };
ACT.atajoCopiar = async () => {
  try { await navigator.clipboard.writeText(urlAtajo()); toast('Dirección copiada [[star]]'); }
  catch (e) {
    const el = $('#atUrl'); const rg = document.createRange(); rg.selectNodeContents(el);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg);
    toast('Mantén presionado para copiar');
  }
};
ACT.atajoNuevo = async () => {
  if (!(await confirmSheet('¿Cambiar tu dirección secreta? Tendrás que pegar la nueva en el atajo.', 'Sí, cambiar', 'normal'))) return abrirAtajo();
  try { const r = await api('/api/atajo/nuevo', { method: 'POST' }); if (r.ok) { AT.token = r.j.token; AT.ultimo = null; } } catch (e) { }
  abrirAtajo();
};

/* ---------------- Animaciones del ranking ---------------- */
const sinMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Lluvia de corazones, estrellas y fresitas desde un punto
function burst(x, y, n = 12) {
  if (sinMovimiento()) return;
  const tipos = ['heart', 'star', 'berry', 'heart', 'star'];
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.className = 'burst-p';
    s.innerHTML = EMO[tipos[i % tipos.length]];
    const ang = (Math.PI * 2 * i) / n + Math.random() * .5, dist = 60 + Math.random() * 80;
    s.style.left = x + 'px'; s.style.top = y + 'px';
    s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    s.style.setProperty('--dy', Math.sin(ang) * dist - 30 + 'px');
    s.style.setProperty('--r', (Math.random() * 120 - 60) + 'deg');
    s.style.setProperty('--s', (.7 + Math.random() * .6).toFixed(2));
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 950);
  }
}
// Los números suben desde 0
function contar(root) {
  root.querySelectorAll('[data-count]').forEach(el => {
    const to = +el.dataset.count;
    if (sinMovimiento() || !to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 950;
    const paso = t => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(to * e);
      if (p < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  });
}
function animarRanking(lider) {
  const sh = $('#sheet'); if (!sh) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    sh.querySelectorAll('.rank-row .bar i[data-w]').forEach(b => (b.style.width = b.dataset.w));
    contar(sh);
    const h = sh.querySelector('.rank-hero .bear');
    if (lider && h) { const r = h.getBoundingClientRect(); setTimeout(() => burst(r.left + r.width / 2, r.top + r.height / 2, 14), 250); }
  }));
}
