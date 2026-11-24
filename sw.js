/* sw.js — çevrimdışı çalışabilmesi için kabuk önbelleği (depo interneti olmadan da açılır) */
'use strict';

var SURUM = 'qr-yukleme-v13';
var KABUK = [
  './',
  'index.html',
  'etiket.html',
  'kurulum.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/storage.js',
  'js/products.js',
  'js/validate.js',
  'js/scanner.js',
  'js/qrmake.js',
  'js/core.js',
  'js/items.js',
  'js/scan.js',
  'js/views.js',
  'js/labels.js',
  'vendor/jsQR.js',
  'vendor/qrcode-generator.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'ornek-veri/urunler.csv',
  'ornek-veri/urunler.json'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SURUM).then(function (c) {
      return Promise.all(KABUK.map(function (u) {
        return c.add(u).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== SURUM; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (r) {
        var copy = r.clone();
        caches.open(SURUM).then(function (c) { c.put(req, copy); });
        return r;
      }).catch(function () {
        return caches.match(req).then(function (hit) { return hit || caches.match('index.html'); });
      })
    );
    return;
  }

  /* kabuk dosyaları: önce önbellek, arka planda tazele.
     urunler.json PC→telefon senkron dosyasıdır: önbelleğe alınmaz, her zaman ağdan tazesi alınır */
  if (/^\/urunler\.json/.test(url.pathname)) return;
  e.respondWith(
    caches.match(req).then(function (hit) {
      var taze = fetch(req).then(function (r) {
        if (r && r.status === 200) {
          var copy = r.clone();
          caches.open(SURUM).then(function (c) { c.put(req, copy); });
        }
        return r;
      }).catch(function () { return hit; });
      return hit || taze;
    })
  );
});
