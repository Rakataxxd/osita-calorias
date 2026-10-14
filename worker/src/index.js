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
