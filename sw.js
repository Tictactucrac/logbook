// Service worker du carnet de sauts.
// Portée volontairement limitée à la "consultation hors ligne, lecture seule" :
// - les pages et fichiers statiques sont mis en cache et servis rapidement, y compris
//   hors réseau, une fois qu'ils ont été chargés au moins une fois en ligne ;
// - les appels GET à l'API sont mis en cache PAR COMPTE (x-account), et on retombe
//   sur la dernière version connue si le réseau est indisponible ;
// - les écritures (POST/PATCH/DELETE) ne sont jamais mises en cache : elles échouent
//   normalement hors ligne, comme avant. Pas de file d'attente/synchro différée.

const CACHE_NAME = 'logbook-v1';

const PRECACHE_URLS = [
  '/', '/index.html', '/carnet.html', '/avions.html', '/dz.html',
  '/materiel.html', '/soufflerie.html', '/stats.html',
  '/shared/app.js', '/shared/style.css', '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(() => {}) // une ressource indisponible au premier install ne doit pas tout bloquer
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(req));
    return;
  }

  event.respondWith(staleWhileRevalidate(req));
});

async function handleApiRequest(req) {
  if (req.method !== 'GET') {
    return fetch(req); // écritures : jamais mises en cache, échouent normalement hors réseau
  }
  const cache = await caches.open(CACHE_NAME);
  const account = req.headers.get('x-account') || 'valentin';
  const cacheKey = new Request(req.url + '::' + account);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(cacheKey, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    throw e;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then(res => { cache.put(req, res.clone()); return res; })
    .catch(() => cached);
  return cached || fetchPromise;
}
