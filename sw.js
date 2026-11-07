/*
 * Service worker de Hype: "network first" para los archivos de la app, con
 * copia en caché para poder abrirla sin conexión. Nunca cachea llamadas a
 * Supabase, Gemini ni GIPHY.
 */
const CACHE = 'hype-shell-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './css/app.css', './config.js', './assets/icon.svg'])).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // sólo archivos propios
  if (req.headers.get('range')) return; // vídeos por rangos: directo a la red
  // Revalidamos siempre los módulos (petición condicional, 304 si no cambian) para no
  // mezclar archivos de dos versiones después de una actualización.
  const fresh = req.mode === 'navigate' ? req : new Request(req, { cache: 'no-cache' });
  event.respondWith(
    fetch(fresh)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
