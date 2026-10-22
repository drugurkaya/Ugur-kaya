// Service worker: yalnızca uygulama kabuğunu (HTML/CSS/JS/ikon) önbelleğe alır, böylece uygulama
// hızlı açılır. Cihaz durumları ve API yanıtları ASLA önbelleğe alınmaz (eski durum gösterilmemesi
// ve token içeren yanıtların saklanmaması için).
const VERSION = 'ush-shell-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/core/auth.js',
  './js/core/automations.js',
  './js/core/catalog.js',
  './js/core/commands.js',
  './js/core/energy.js',
  './js/core/errors.js',
  './js/core/format.js',
  './js/core/ha-socket.js',
  './js/core/health.js',
  './js/core/model.js',
  './js/core/scenarios.js',
  './js/core/store.js',
  './js/ui/components.js',
  './js/ui/dom.js',
  './js/ui/icons.js',
  './js/ui/screens/add-device.js',
  './js/ui/screens/automations.js',
  './js/ui/screens/device.js',
  './js/ui/screens/energy.js',
  './js/ui/screens/health.js',
  './js/ui/screens/home.js',
  './js/ui/screens/rooms.js',
  './js/ui/screens/scenarios.js',
  './js/ui/screens/settings.js',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  // Yalnızca uygulamanın kendi dosyaları; /api ve /auth gibi her şey doğrudan ağa gider.
  if (event.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  // Ağ öncelikli: güncelleme varsa hemen alınır; ağ yoksa önbellekteki kabuk açılır.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match('./index.html'))),
  );
});
