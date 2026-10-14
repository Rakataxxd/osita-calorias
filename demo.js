'use strict';
/* Datos de ejemplo (~75 días) para ver cómo se ve la app llena.
   Se activa con ?demo en la URL o desde "Yo". Antes guarda los datos reales aparte. */

const DEMO_BACKUP = 'osita-calorias.antes-del-demo';

const DEMO_MEALS = {
  desayuno: [
    [['Desayuno chapín (huevos, frijol, plátano, crema)', 1]],
    [['Huevo estrellado / revuelto', 2], ['Frijoles volteados', 1], ['Tortilla de maíz', 2]],
    [['Mosh (avena con leche)', 1], ['Banano', 1]],
    [['Pan francés', 2], ['Queso fresco', 1], ['Café con leche y azúcar', 1]],
    [['Yogur griego natural', 1], ['Granola', 1], ['Fresas', 1]],
    [['Panqueque / hotcake', 3], ['Miel', 1], ['Café con leche y azúcar', 1]],
    [['Cereal de maíz (corn flakes)', 1], ['Leche descremada', 1], ['Banano', 1]],
    [['Champurrada', 2], ['Café con leche y azúcar', 1]],
    [['Huevo cocido', 2], ['Pan integral', 1], ['Papaya', 1]],
  ],
  almuerzo: [
    [['Pepián de pollo', 1], ['Arroz blanco cocido', 1], ['Tortilla de maíz', 2]],
    [["Kak'ik", 1], ['Tamalito de chipilín', 1]],
    [['Pechuga de pollo a la plancha', 1], ['Arroz con verduras', 1], ['Ensalada verde (sin aderezo)', 1]],
    [['Pollo frito tipo Campero', 2], ['Papas fritas', 1], ['Gaseosa (Coca-Cola, Pepsi)', 1]],
    [['Hilachas', 1], ['Arroz blanco cocido', 1], ['Tortilla de maíz', 2]],
    [['Sopa de pollo', 1], ['Tortilla de maíz', 3]],
    [['Espagueti con salsa roja', 1], ['Pan francés', 1]],
    [['Churrasco completo', 1]],
    [['Ensalada César con aderezo', 1], ['Jugo de naranja natural', 1]],
    [['Sushi (rollo California)', 1]],
    [['Jocón de pollo', 1], ['Arroz blanco cocido', 1], ['Tortilla de maíz', 2]],
    [['Tilapia / pescado blanco', 1], ['Papa cocida', 1], ['Brócoli cocido', 1]],
  ],
  cena: [
    [['Frijoles volteados', 1], ['Huevo estrellado / revuelto', 1], ['Tortilla de maíz', 2], ['Crema', 1]],
    [['Shuco', 1]],
    [['Pizza de pepperoni', 2]],
    [['Sándwich de jamón y queso', 1], ['Café negro', 1]],
    [['Tamal colorado', 1], ['Pan francés', 1], ['Café con leche y azúcar', 1]],
    [['Chuchito', 2], ['Rosa de Jamaica con azúcar', 1]],
    [['Ensalada de pollo', 1]],
    [['Pupusa de queso / revuelta', 2], ['Horchata', 1]],
    [['Tostada con guacamol', 2], ['Tostada con frijol', 1]],
    [['Atún en agua', 1], ['Pan integral', 2], ['Tomate', 1]],
    [['Sopa de verduras', 1], ['Queso fresco', 1], ['Tortilla de maíz', 1]],
  ],
  refa: [
    [['Manzana', 1]], [['Boquitas de maíz (Tortrix, Doritos)', 1]], [['Rellenitos de plátano', 1]],
    [['Yogur con fruta', 1]], [['Galletas María', 1]], [['Chocolate con leche', 1]],
    [['Fresas', 1], ['Yogur griego natural', 1]], [['Frappé de café', 1]], [['Pastel de tres leches', 1]],
    [['Almendras', 1]], [['Gelatina preparada', 1]], [['Mango', 1]],
  ],
};

// Generador con semilla fija: siempre salen los mismos datos de ejemplo
function seededRandom(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function buildDemo(days = 75) {
  const rnd = seededRandom(2910);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const byName = Object.fromEntries(FOODS.map(f => [f.name, f]));
  const t0 = todayKey();
  const start = addDays(t0, -days);
  const D = defaults();
  D.theme = S.theme || 'fresa';
  D.profile = {
    name: (S.profile && S.profile.name) || 'Bbcita', sex: 'f', birthYear: new Date().getFullYear() - 23, height: 158,
    startWeight: 64.5, goal: 55, act: 1.375, pace: .5, split: 'eq', customKcal: null, startDate: start,
  };

  // Peso: baja ~0.4 kg por semana con el sube y baja normal de cada día
  let kg = 64.5;
  for (let i = 0; i <= days; i++) {
    const k = addDays(start, i);
    kg += -0.058 + (rnd() - .5) * 0.05;
    if (i === 0 || i === days || rnd() < .4) D.weights.push({ date: k, kg: Math.round((kg + (rnd() - .5) * 0.5) * 10) / 10 });
  }
  D.weights[0].kg = 64.5;

  const used = new Map();
  const entry = (name, qty) => {
    const f = byName[name];
    if (!f) throw new Error('Comida de ejemplo sin match: ' + name);
    used.set(f.key, f);
    const g = qty * f.ug;
    return { id: uid(), food: f, mode: 'u', qty, g, ...foodVals(f, g) };
  };

  for (let i = 0; i <= days; i++) {
    const k = addDays(start, i);
    if (k !== t0 && rnd() < .07) continue; // algunos días sin anotar, como en la vida real
    const day = emptyDay();
    const isToday = k === t0;
    const hour = new Date().getHours();
    for (const m of MEALS) {
      if (isToday && ((m.id === 'almuerzo' && hour < 12) || (m.id === 'cena' && hour < 19) || (m.id === 'refa' && hour < 15))) continue;
      if (m.id === 'refa' && rnd() < .3) continue;
      if (m.id === 'cena' && rnd() < .08) continue;
      day.meals[m.id] = pick(DEMO_MEALS[m.id]).map(([n, q]) => entry(n, q));
    }
    if (rnd() < .45) {
      const ex = pick(EXERCISES.slice(0, 11));
      const min = [20, 30, 30, 45, 60][Math.floor(rnd() * 5)];
      day.ex.push({ id: uid(), name: ex.n, min, kcal: Math.round(ex.met * 3.5 * 62 / 200 * min) });
    }
    // La mayoría de días quedan dentro del presupuesto (verdes); unos cuantos se pasan
    const budget = 1250 + day.ex.reduce((x, e) => x + e.kcal, 0);
    const sum = () => MEALS.reduce((x, m) => x + day.meals[m.id].reduce((y, e) => y + e.kcal, 0), 0);
    if (!isToday && sum() > budget && rnd() < .8) {
      day.meals.refa = [];
      if (sum() > budget) day.meals.cena = pick([[['Ensalada de pollo', 1]], [['Sopa de verduras', 1], ['Queso fresco', 1]], [['Yogur griego natural', 1], ['Fresas', 1]]]).map(([n, q]) => entry(n, q));
      if (sum() > budget) day.meals.almuerzo = day.meals.almuerzo.map(e => {
        const q = Math.max(.5, e.qty * .6); const g = q * e.food.ug;
        return { ...e, qty: q, g, ...foodVals(e.food, g) };
      });
    }
    day.steps = Math.round((3000 + rnd() * 9000) / 10) * 10;
    day.water = isToday ? 3 : 2 + Math.floor(rnd() * 7);
    D.days[k] = day;
  }

  const all = [...used.values()];
  D.recents = all.slice(-12).reverse();
  D.favs = ['Pepián de pollo', 'Fresas', 'Mosh (avena con leche)', 'Rellenitos de plátano'].map(n => byName[n]);
  D.custom = [{
    key: 'c:demo-licuado', name: 'Licuado de banano de mi mamá', unit: '1 vaso', ug: 300, src: 'custom',
    k100: 220 / 3, c100: 38 / 3, p100: 8 / 3, f100: 4 / 3,
  }];
  return D;
}

function loadDemo() {
  try {
    if (S.profile && !localStorage.getItem(DEMO_BACKUP)) localStorage.setItem(DEMO_BACKUP, JSON.stringify(S));
  } catch (e) { }
  S = buildDemo();
  S.demo = true;
  save();
  $('#onb').hidden = true; $('#onb').innerHTML = '';
  UI.tab = 'hoy'; UI.date = todayKey(); UI.cal = null; UI.weekEnd = todayKey();
  render();
  toast('Datos de ejemplo cargados [[star]]');
}
function restoreReal() {
  let real = null;
  try { real = JSON.parse(localStorage.getItem(DEMO_BACKUP)); } catch (e) { }
  S = real ? Object.assign(defaults(), real) : defaults();
  save();
  // Sin copia local: lo real está en la nube
  if (!real && NB.ses) { NB.meta.rev = -1; NB.meta.dirty = false; bajar(); }
  try { localStorage.removeItem(DEMO_BACKUP); } catch (e) { }
  UI.tab = 'hoy'; UI.date = todayKey(); UI.cal = null;
  render();
  toast(real ? 'Volviste a tus datos [[heart]]' : 'Listo, empezamos de cero [[heart]]');
}

ACT.demo = async () => {
  if (await confirmSheet('¿Llenar la app con datos de ejemplo? Tus datos se guardan aparte y puedes volver a ellos.', 'Sí, ver ejemplo', 'happy')) loadDemo();
};
ACT.demoOff = () => restoreReal();

if (/[?&]demo\b/.test(location.search)) {
  history.replaceState(null, '', location.pathname);
  loadDemo();
}
