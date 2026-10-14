// Backend de Osita Calorías: cuentas, sesiones y los datos de cada persona en D1.
// La app sigue funcionando sin internet con su copia local; esto la respalda en la nube.

const ORIGENES = ['https://rakataxxd.github.io', 'http://localhost:8137', 'http://127.0.0.1:8137'];
const MAX_JSON = 4_000_000;      // ~4 MB por persona (años de comidas caben de sobra)
const DIAS_COPIA = 90;
const ITER = 100_000;            // PBKDF2: el máximo que permite Workers

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const normUser = u => String(u || '').trim().toLowerCase();

async function hashPass(pass, sal) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(sal), iterations: ITER }, key, 256);
  return hex(bits);
}
// Comparación en tiempo constante
function iguales(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function cors(req) {
  const o = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ORIGENES.includes(o) ? o : ORIGENES[0],
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-clave',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
const json = (req, data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(req) },
});

async function sesion(req, env) {
  const m = /^Bearer\s+([a-f0-9]{64})$/i.exec(req.headers.get('Authorization') || '');
  if (!m) return null;
  const th = await sha256(m[1]);
  const row = await env.DB.prepare('SELECT usuario, usado FROM sesiones WHERE token_hash = ?').bind(th).first();
  if (!row) return null;
  const ahora = Date.now();
  if (ahora - row.usado > 3600_000) await env.DB.prepare('UPDATE sesiones SET usado = ? WHERE token_hash = ?').bind(ahora, th).run();
  return { usuario: row.usuario, th };
}

async function copiaDelDia(env, usuario, jsonStr, rev) {
  const dia = new Date().toISOString().slice(0, 10);
  await env.DB.prepare('INSERT INTO copias (usuario, dia, json, rev) VALUES (?, ?, ?, ?) ON CONFLICT(usuario, dia) DO UPDATE SET json = excluded.json, rev = excluded.rev')
    .bind(usuario, dia, jsonStr, rev).run();
}

async function crearUsuario(env, usuario, pass) {
  const sal = randHex(16);
  await env.DB.prepare('INSERT INTO usuarios (usuario, sal, hash, creado) VALUES (?, ?, ?, ?)')
    .bind(usuario, sal, await hashPass(pass, sal), Date.now()).run();
}

/* ---------- Datos del Atajo de iPhone ---------- */
async function leerCuerpo(req) {
  const txt = await req.text();
  try { return JSON.parse(txt); } catch (e) { }
  try { return Object.fromEntries(new URLSearchParams(txt)); } catch (e) { return {}; }
}
// Atajos a veces manda "8,432" o "8.432" o "520,5" como texto, según el idioma del iPhone
function numero(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) && v >= 0 ? v : null;
  let s = String(v).replace(/[^\d.,]/g, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return isFinite(n) && n >= 0 ? n : null;
}
function fechaLocal(tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch (e) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date()); }
}
// Escribe en los datos de la persona, en el día de HOY según su zona horaria (con reintento si otro guardó a la vez)
async function guardarSalud(env, usuario, pasos, kcal) {
  for (let i = 0; i < 4; i++) {
    const row = await env.DB.prepare('SELECT json, rev FROM datos WHERE usuario = ?').bind(usuario).first();
    if (!row) return { error: 'Primero abre la app y llena tus datos' };
    const datos = JSON.parse(row.json);
    const fecha = fechaLocal(datos.tz);
    datos.days = datos.days || {};
    const d = datos.days[fecha] || { meals: { desayuno: [], almuerzo: [], cena: [], refa: [] }, ex: [], water: 0, steps: 0 };
    const ahora = Date.now();
    if (pasos != null) d.steps = Math.round(pasos);
    d.salud = { pasos: pasos != null ? Math.round(pasos) : (d.salud && d.salud.pasos) ?? null, kcal: kcal != null ? Math.round(kcal) : (d.salud && d.salud.kcal) ?? null, ts: ahora };
    d.u = ahora;
    datos.days[fecha] = d;
    const str = JSON.stringify(datos);
    const r = await env.DB.prepare('UPDATE datos SET json = ?, rev = rev + 1, actualizado = ? WHERE usuario = ? AND rev = ?').bind(str, ahora, usuario, row.rev).run();
    if (r.meta.changes) {
      await copiaDelDia(env, usuario, str, row.rev + 1);
      return { ok: true, fecha, pasos: d.salud.pasos, kcal: d.salud.kcal, mensaje: `Listo: ${d.salud.pasos ?? 0} pasos y ${d.salud.kcal ?? 0} kcal activas` };
    }
  }
  return { error: 'Intenta de nuevo' };
}

/* ---------- Ranking de calorías quemadas en actividad ----------
   Mismo cálculo que la app (app.js): ejercicio anotado + pasos por encima de los que
   ya incluye su nivel de actividad. Las fechas son las del teléfono ("hoy" lo manda la app). */
const PASOS_BASE = { 1.2: 3000, 1.375: 5000, 1.55: 7500, 1.725: 10000 };
const diaUTC = k => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const claveUTC = d => d.toISOString().slice(0, 10);
const INICIO = {
  hoy: h => h,
  semana: h => { const d = diaUTC(h); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return claveUTC(d); }, // desde el lunes
  mes: h => h.slice(0, 8) + '01',
  anio: h => h.slice(0, 5) + '01-01',
  todo: () => '0000-00-00',
};
// La energía activa del iPhone incluye el movimiento normal del día, que ya viene en el
// nivel de actividad; solo cuenta lo que pasa de eso (igual que en app.js)
function extraSalud(d, prof, w) {
  if (!d.salud || d.salud.kcal == null) return 0;
  const edad = new Date().getUTCFullYear() - (prof.birthYear || 2000);
  const bmr = 10 * w + 6.25 * (prof.height || 160) - 5 * edad + (prof.sex === 'f' ? -161 : 5);
  return Math.max(0, d.salud.kcal - bmr * ((prof.act || 1.375) - 1));
}
function resumenActividad(datos, desde, hasta, usuario) {
  const vacio = { nombre: usuario, empezo: false, kcal: 0, min: 0, dias: 0, mejor: null };
  if (!datos || !datos.profile) return vacio;
  const prof = datos.profile;
  const pesos = (datos.weights || []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
  const pesoEn = k => {
    let w = null;
    for (const e of pesos) { if (e.date <= k) w = e.kg; else break; }
    return w ?? (pesos.length ? pesos[0].kg : prof.startWeight || 60);
  };
  const base = PASOS_BASE[prof.act] ?? 5000;
  let kcal = 0, min = 0, dias = 0, mejor = null;
  for (const [k, d] of Object.entries(datos.days || {})) {
    if (k < desde || k > hasta) continue;
    const ex = (d.ex || []).reduce((a, e) => a + (+e.kcal || 0), 0);
    const pasos = Math.max(0, (+d.steps || 0) - base) * 0.00055 * pesoEn(k);
    const total = Math.max(ex + pasos, extraSalud(d, prof, pesoEn(k)));
    kcal += total;
    min += (d.ex || []).reduce((a, e) => a + (+e.min || 0), 0);
    if (total > 0) dias++;
    if (!mejor || total > mejor.kcal) mejor = { dia: k, kcal: Math.round(total) };
  }
  return { nombre: String(prof.name || usuario).slice(0, 40), empezo: true, kcal: Math.round(kcal), min, dias, mejor: mejor && mejor.kcal > 0 ? mejor : null };
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (p === '/api/login' && req.method === 'POST') {
        const b = await req.json().catch(() => ({}));
        const usuario = normUser(b.usuario), pass = String(b.pass || '');
        if (!usuario || !pass) return json(req, { error: 'Faltan datos' }, 400);
        const desde = Date.now() - 15 * 60_000;
        const fallos = await env.DB.prepare('SELECT COUNT(*) n FROM intentos WHERE usuario = ? AND ts > ?').bind(usuario, desde).first('n');
        if (fallos >= 8) return json(req, { error: 'Muchos intentos. Espera 15 minutos.' }, 429);
        const u = await env.DB.prepare('SELECT sal, hash FROM usuarios WHERE usuario = ?').bind(usuario).first();
        const h = await hashPass(pass, u ? u.sal : 'x');
        if (!u || !iguales(h, u.hash)) {
          await env.DB.prepare('INSERT INTO intentos (usuario, ts) VALUES (?, ?)').bind(usuario, Date.now()).run();
          return json(req, { error: 'Usuario o contraseña incorrectos' }, 401);
        }
        await env.DB.prepare('DELETE FROM intentos WHERE usuario = ?').bind(usuario).run();
        const token = randHex(32);
        await env.DB.prepare('INSERT INTO sesiones (token_hash, usuario, creado, usado) VALUES (?, ?, ?, ?)')
          .bind(await sha256(token), usuario, Date.now(), Date.now()).run();
        return json(req, { token, usuario });
      }

      if (p === '/api/admin/usuario' && req.method === 'POST') {
        if (!env.ADMIN_CLAVE || !iguales(req.headers.get('x-clave') || '', env.ADMIN_CLAVE)) return json(req, { error: 'No' }, 403);
        const b = await req.json().catch(() => ({}));
        const usuario = normUser(b.usuario), pass = String(b.pass || '');
        if (!/^[a-z0-9._-]{3,30}$/.test(usuario) || pass.length < 6) return json(req, { error: 'Usuario o contraseña inválidos' }, 400);
        const ya = await env.DB.prepare('SELECT 1 FROM usuarios WHERE usuario = ?').bind(usuario).first();
        if (ya) return json(req, { error: 'Ya existe' }, 409);
        await crearUsuario(env, usuario, pass);
        return json(req, { ok: true, usuario });
      }

      // El Atajo de iPhone manda pasos y energía activa con su código, sin sesión
      if (p === '/api/salud' && req.method === 'POST') {
        const tok = (url.searchParams.get('t') || req.headers.get('x-atajo') || '').trim();
        if (!/^[a-f0-9]{24}$/.test(tok)) return json(req, { error: 'Falta el código del atajo' }, 401);
        const a = await env.DB.prepare('SELECT usuario FROM atajos WHERE token = ?').bind(tok).first();
        if (!a) return json(req, { error: 'Código del atajo incorrecto' }, 401);
        const b = await leerCuerpo(req);
        const pasos = numero(b.pasos ?? b.steps), kcal = numero(b.kcal ?? b.energia);
        if (pasos == null && kcal == null) return json(req, { error: 'No llegaron pasos ni calorías' }, 400);
        const r = await guardarSalud(env, a.usuario, pasos, kcal);
        if (r.error) return json(req, r, 409);
        await env.DB.prepare('UPDATE atajos SET ultimo = ? WHERE usuario = ?').bind(Date.now(), a.usuario).run();
        return json(req, r);
      }

      // De aquí para abajo hace falta sesión
      const s = await sesion(req, env);
      if (p.startsWith('/api/') && !s) return json(req, { error: 'Sesión vencida' }, 401);

      if (p === '/api/datos' && req.method === 'GET') {
        const row = await env.DB.prepare('SELECT json, rev, actualizado FROM datos WHERE usuario = ?').bind(s.usuario).first();
        return json(req, row ? { datos: JSON.parse(row.json), rev: row.rev, actualizado: row.actualizado } : { datos: null, rev: 0 });
      }

      if (p === '/api/datos' && req.method === 'PUT') {
        const txt = await req.text();
        if (txt.length > MAX_JSON) return json(req, { error: 'Demasiado grande' }, 413);
        const b = JSON.parse(txt);
        if (!b || typeof b.datos !== 'object' || !Number.isInteger(b.rev)) return json(req, { error: 'Formato' }, 400);
        const datosStr = JSON.stringify(b.datos);
        const ahora = Date.now();
        // Solo se escribe si nadie más guardó en el medio (rev igual a la del servidor)
        const r = b.rev === 0
          ? await env.DB.prepare('INSERT INTO datos (usuario, json, rev, actualizado) VALUES (?, ?, 1, ?) ON CONFLICT(usuario) DO NOTHING').bind(s.usuario, datosStr, ahora).run()
          : await env.DB.prepare('UPDATE datos SET json = ?, rev = rev + 1, actualizado = ? WHERE usuario = ? AND rev = ?').bind(datosStr, ahora, s.usuario, b.rev).run();
        if (!r.meta.changes) {
          const row = await env.DB.prepare('SELECT json, rev, actualizado FROM datos WHERE usuario = ?').bind(s.usuario).first();
          return json(req, { conflicto: true, datos: row ? JSON.parse(row.json) : null, rev: row ? row.rev : 0 }, 409);
        }
        const rev = b.rev + 1;
        await copiaDelDia(env, s.usuario, datosStr, rev);
        return json(req, { ok: true, rev, actualizado: ahora });
      }

      if (p === '/api/ranking' && req.method === 'GET') {
        const hoy = url.searchParams.get('hoy') || '';
        const periodo = url.searchParams.get('periodo') || 'semana';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(hoy) || !(periodo in INICIO)) return json(req, { error: 'Parámetros' }, 400);
        const desde = INICIO[periodo](hoy);
        const { results } = await env.DB.prepare('SELECT u.usuario, d.json FROM usuarios u LEFT JOIN datos d ON d.usuario = u.usuario').all();
        const filas = results.map(r => ({ usuario: r.usuario, yo: r.usuario === s.usuario, ...resumenActividad(r.json ? JSON.parse(r.json) : null, desde, hoy, r.usuario) }));
        filas.sort((a, b) => b.kcal - a.kcal || b.min - a.min);
        return json(req, { periodo, desde, hasta: hoy, filas });
      }

      if (p === '/api/atajo' && req.method === 'GET') {
        let row = await env.DB.prepare('SELECT token, ultimo FROM atajos WHERE usuario = ?').bind(s.usuario).first();
        if (!row) {
          row = { token: randHex(12), ultimo: null };
          await env.DB.prepare('INSERT INTO atajos (usuario, token, creado) VALUES (?, ?, ?)').bind(s.usuario, row.token, Date.now()).run();
        }
        return json(req, row);
      }
      if (p === '/api/atajo/nuevo' && req.method === 'POST') {
        const token = randHex(12);
        await env.DB.prepare('INSERT INTO atajos (usuario, token, creado) VALUES (?, ?, ?) ON CONFLICT(usuario) DO UPDATE SET token = excluded.token, creado = excluded.creado, ultimo = NULL')
          .bind(s.usuario, token, Date.now()).run();
        return json(req, { token, ultimo: null });
      }

      if (p === '/api/copias' && req.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT dia, rev, length(json) bytes FROM copias WHERE usuario = ? ORDER BY dia DESC').bind(s.usuario).all();
        return json(req, { copias: results });
      }
      if (p === '/api/copia' && req.method === 'GET') {
        const row = await env.DB.prepare('SELECT json FROM copias WHERE usuario = ? AND dia = ?').bind(s.usuario, url.searchParams.get('dia') || '').first();
        return row ? json(req, { datos: JSON.parse(row.json) }) : json(req, { error: 'No existe' }, 404);
      }

      if (p === '/api/clave' && req.method === 'POST') {
        const b = await req.json().catch(() => ({}));
        const u = await env.DB.prepare('SELECT sal, hash FROM usuarios WHERE usuario = ?').bind(s.usuario).first();
        if (!u || !iguales(await hashPass(String(b.actual || ''), u.sal), u.hash)) return json(req, { error: 'La contraseña actual no es correcta' }, 401);
        const nueva = String(b.nueva || '');
        if (nueva.length < 6) return json(req, { error: 'Mínimo 6 caracteres' }, 400);
        const sal = randHex(16);
        await env.DB.prepare('UPDATE usuarios SET sal = ?, hash = ? WHERE usuario = ?').bind(sal, await hashPass(nueva, sal), s.usuario).run();
        // Cierra las demás sesiones abiertas, deja la actual
        await env.DB.prepare('DELETE FROM sesiones WHERE usuario = ? AND token_hash != ?').bind(s.usuario, s.th).run();
        return json(req, { ok: true });
      }

      if (p === '/api/salir' && req.method === 'POST') {
        await env.DB.prepare('DELETE FROM sesiones WHERE token_hash = ?').bind(s.th).run();
        return json(req, { ok: true });
      }

      return json(req, { error: 'No encontrado' }, 404);
    } catch (e) {
      return json(req, { error: 'Error del servidor' }, 500);
    }
  },

  async scheduled(evt, env) {
    const ahora = Date.now();
    const limite = new Date(ahora - DIAS_COPIA * 864e5).toISOString().slice(0, 10);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM copias WHERE dia < ?').bind(limite),
      env.DB.prepare('DELETE FROM intentos WHERE ts < ?').bind(ahora - 864e5),
      env.DB.prepare('DELETE FROM sesiones WHERE usado < ?').bind(ahora - 400 * 864e5),
    ]);
  },
};
