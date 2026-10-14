// Funciona sin internet: guarda la app la primera vez que se abre.
const CACHE = 'osita-v7';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'nube.js', 'demo.js', 'art.js', 'foods.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-180.png',
  'img/tori.png', 'img/kori-normal.jpg', 'img/kori-happy.jpg', 'img/kori-love.jpg', 'img/kori-worried.jpg', 'img/kori-sleepy.jpg',
  'img/kori-cheer.jpg', 'img/kori-berry.jpg', 'img/kori-eat.jpg', 'img/kori-skip.jpg', 'img/kori-water.jpg', 'img/tori-power.jpg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname.endsWith('openfoodfacts.org')) return;
  const isApp = url.origin === location.origin;
  const isAsset = isApp || url.hostname.includes('fonts.g') || url.hostname === 'cdn.jsdelivr.net';
  if (!isAsset) return;
  // Primero la red (para recibir cambios), si no hay, lo guardado
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: isApp }).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
