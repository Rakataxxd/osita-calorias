// Dibujos: osita blanca de botón rojo (estilo Korilakkuma), pollito amarillo, fresas e íconos.
const INK = '#4a3628';

// Korilakkuma de verdad (arte oficial de San-X recortado como sticker), una por estado de ánimo
const KORI = {
  normal: 'kori-normal', happy: 'kori-happy', love: 'kori-love', worried: 'kori-worried', sleepy: 'kori-sleepy',
  cheer: 'kori-cheer', berry: 'kori-berry', eat: 'kori-eat', skip: 'kori-skip', water: 'kori-water',
};
function bearSVG(mood = 'normal') {
  return `<img class="sticker" src="img/${KORI[mood] || KORI.normal}.jpg" alt="" draggable="false">`;
}

// Fresa centrada en (0,0) de ~24 px de alto a escala 1
function berryPath(s = 1) {
  return `<g transform="scale(${s})">
    <path d="M0 14 C-12 10 -13 -2 -9 -5 C-5 -8 5 -8 9 -5 C13 -2 12 10 0 14z" fill="#e5505e" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M-8 -6 l3 -5 l3 3 l2 -5 l2 5 l3 -3 l3 5 q-8 4 -16 0z" fill="#7cc48a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <g fill="#ffe6a8"><circle cx="-4" cy="0" r="1.1"/><circle cx="3" cy="-1" r="1.1"/><circle cx="-1" cy="5" r="1.1"/><circle cx="5" cy="5" r="1.1"/><circle cx="-5" cy="7" r="1.1"/></g>
  </g>`;
}
function berrySVG(cls = '') {
  return `<svg viewBox="-16 -16 32 32" class="${cls}" aria-hidden="true">${berryPath(1)}</svg>`;
}

// Kiiroitori de verdad (arte oficial con fondo transparente)
function chickSVG(cls = '') {
  return `<img class="${cls}" src="img/tori.png" alt="" draggable="false" style="width:100%;display:block">`;
}
function toriSticker(kind = 'power') {
  return `<img class="sticker" src="img/tori-${kind}.jpg" alt="" draggable="false">`;
}

// Dibujitos en lugar de emojis: mismo trazo café grueso y colores pastel de San-X
const EMO = {
  berry: `<svg viewBox="-16 -16 32 32">${berryPath(1)}</svg>`,
  heart: `<svg viewBox="0 0 32 32"><path d="M16 27C9 22.5 4 18 4 12a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 6-5 10.5-12 15z" fill="#f6a5b6" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><ellipse cx="10" cy="11.5" rx="2.2" ry="1.4" fill="#fff" opacity=".8" transform="rotate(-30 10 11.5)"/></svg>`,
  drop: `<svg viewBox="0 0 32 32"><path d="M16 3s9 9.5 9 16a9 9 0 0 1-18 0C7 12.5 16 3 16 3z" fill="#a8d8f0" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><circle cx="12.5" cy="19" r="1.4" fill="${INK}"/><circle cx="19.5" cy="19" r="1.4" fill="${INK}"/><path d="M14.5 22.5q1.5 1.3 3 0" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`,
  star: `<svg viewBox="0 0 32 32"><path d="M16 3.5l3.6 7.6 8.3 1-6.1 5.7 1.6 8.2L16 22l-7.4 4 1.6-8.2-6.1-5.7 8.3-1z" fill="#ffe27a" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="13" cy="15.5" r="1.2" fill="${INK}"/><circle cx="19" cy="15.5" r="1.2" fill="${INK}"/></svg>`,
  kori: `<svg viewBox="0 0 32 32"><g stroke="${INK}" stroke-width="2.2"><circle cx="7.5" cy="8.5" r="4.5" fill="#fdf0d5"/><circle cx="24.5" cy="8.5" r="4.5" fill="#fdf0d5"/><ellipse cx="16" cy="18" rx="12.5" ry="10.5" fill="#fdf0d5"/></g><circle cx="7.5" cy="8.5" r="2.3" fill="#f6a5b6"/><circle cx="24.5" cy="8.5" r="2.3" fill="#f6a5b6"/><ellipse cx="16" cy="22" rx="5" ry="3.6" fill="#fff"/><circle cx="10.5" cy="18" r="1.6" fill="${INK}"/><circle cx="21.5" cy="18" r="1.6" fill="${INK}"/><ellipse cx="16" cy="20.6" rx="1.8" ry="1.3" fill="${INK}"/><path d="M7 21.5l1.5-1.5M8.6 22l1.5-1.5M22 21.5l1.5-1.5M23.6 22l1.5-1.5" stroke="#f5a623" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  cry: `<svg viewBox="0 0 32 32"><g stroke="${INK}" stroke-width="2.2"><circle cx="7.5" cy="8.5" r="4.5" fill="#fdf0d5"/><circle cx="24.5" cy="8.5" r="4.5" fill="#fdf0d5"/><ellipse cx="16" cy="18" rx="12.5" ry="10.5" fill="#fdf0d5"/></g><circle cx="7.5" cy="8.5" r="2.3" fill="#f6a5b6"/><circle cx="24.5" cy="8.5" r="2.3" fill="#f6a5b6"/><ellipse cx="16" cy="22" rx="5" ry="3.6" fill="#fff"/><path d="M9 18.5q1.6-1.6 3.2 0M19.8 18.5q1.6-1.6 3.2 0" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/><ellipse cx="16" cy="20.6" rx="1.8" ry="1.3" fill="${INK}"/><path d="M10.5 20.5q-1.5 3 0 4.2q1.5-1.2 0-4.2z" fill="#a8d8f0" stroke="${INK}" stroke-width="1"/></svg>`,
  target: `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#fff" stroke="${INK}" stroke-width="2.4"/><circle cx="16" cy="16" r="8" fill="#f6a5b6" stroke="${INK}" stroke-width="2"/><circle cx="16" cy="16" r="3.6" fill="#e5505e" stroke="${INK}" stroke-width="1.8"/></svg>`,
  box: `<svg viewBox="0 0 32 32"><path d="M5 11l11-5 11 5v12l-11 5-11-5z" fill="#f3d3a6" stroke="${INK}" stroke-width="2.3" stroke-linejoin="round"/><path d="M5 11l11 5 11-5M16 16v12" stroke="${INK}" stroke-width="2.1" fill="none" stroke-linejoin="round"/><circle cx="10" cy="19" r="1" fill="${INK}"/><circle cx="13" cy="20.3" r="1" fill="${INK}"/></svg>`,
  tori: `<img src="img/tori.png" alt="">`,
  crown: `<svg viewBox="0 0 40 30"><path d="M4 25 2 7l10 8 8-12 8 12 10-8-2 18z" fill="#ffd24d" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><circle cx="20" cy="17" r="3" fill="#e5505e" stroke="${INK}" stroke-width="1.6"/><path d="M5 25h30" stroke="${INK}" stroke-width="2.6"/></svg>`,
};
function emo(name) { return `<span class="emo">${EMO[name] || ''}</span>`; }
// Cambia los [[nombre]] del texto por su dibujito
const emojify = html => String(html).replace(/\[\[(\w+)\]\]/g, (m, n) => EMO[n] ? emo(n) : m);

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9v11.5h13V9"/><path d="M10 20.5v-6h4v6"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 8h7M9 11.5h5"/>',
  scale: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M7.5 10a6 6 0 0 1 9 0"/><path d="M12 10l1.6-2.4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chevL: '<path d="M15 18l-6-6 6-6"/>',
  chevR: '<path d="M9 18l6-6-6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  barcode: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13 8v8M16.5 8v8"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  flame: '<path d="M12 3c.8 4 5.5 5.6 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.6 1.4-3.8 2-5.3 1 1 1.5 2 1.6 3.3C11.3 9.6 12.4 6.6 12 3z"/>',
  drop: '<path d="M12 3s6 6.6 6 11.2a6 6 0 0 1-12 0C6 9.6 12 3 12 3z"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14"/>',
  steps: '<path d="M8 3.5c2 0 3 2 3 4.5s-1 4.5-2.8 4.5S5.5 10.5 5.5 8 6 3.5 8 3.5zM6 15h5v1.8a2.5 2.5 0 0 1-5 0z"/><path d="M16 7.5c2 0 2.5 4.5 2.5 7s-1 4.5-2.8 4.5S13 17 13 14.5s1-7 3-7zM13.4 21h4.8"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  sparkle: '<path d="M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  pencilPlus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M4 8h3l1.8-2.5h6.4L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.6"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
};
function icon(name, cls = '') {
  return `<svg viewBox="0 0 24 24" class="ic ${cls}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// Íconos de cada comida del día
const MEAL_ART = {
  sun: `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="${INK}" stroke-width="2.4" stroke-linecap="round"><path d="M20 3v5M20 32v5M3 20h5M32 20h5M8 8l3.5 3.5M28.5 28.5 32 32M8 32l3.5-3.5M28.5 11.5 32 8"/><circle cx="20" cy="20" r="8.5" fill="#ffd66b"/></g><circle cx="17" cy="19" r="1.3" fill="${INK}"/><circle cx="23" cy="19" r="1.3" fill="${INK}"/><path d="M17.5 22.5q2.5 2 5 0" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`,
  bowl: `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"><path d="M9 18c0-4 5-7 11-7s11 3 11 7z" fill="#fff"/><path d="M5 18h30c0 8-7 14-15 14S5 26 5 18z" fill="#f6a5b6"/></g><circle cx="15" cy="24" r="1.3" fill="${INK}"/><circle cx="25" cy="24" r="1.3" fill="${INK}"/><path d="M18 27q2 1.6 4 0" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M25 5l-2 8M29 6l-4 7" stroke="${INK}" stroke-width="2" stroke-linecap="round"/></svg>`,
  moon: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M26 6a14 14 0 1 0 8 22A11.5 11.5 0 0 1 26 6z" fill="#ffe27a" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M14 22q2 1.5 4 0" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M22 22q2 1.5 4 0" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M8 8l.8 2 2 .8-2 .8L8 13.6l-.8-2-2-.8 2-.8z" fill="#f6a5b6"/></svg>`,
  berry: `<svg viewBox="-20 -20 40 40" aria-hidden="true">${berryPath(1.3)}</svg>`,
};
