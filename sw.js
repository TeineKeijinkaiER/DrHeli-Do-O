/* 道央ドクターヘリ PWA Service Worker */
const CACHE = 'doo-heli-v1';
const CORE = [
  './','./index.html','./manifest.json',
  './css/style.css','./js/app.js','./js/map.js','./js/modes.js',
  './data/regions.json','./data/operating-hours.json',
  './data/quiz.json','./data/logistics.json','./data/beginner.json',
  './image/Heli.png','./image/Heriteinu.png','./image/icon-192.png','./image/icon-512.png','./image/apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    /* 同一オリジン(アプリ・データ): キャッシュ優先＋背景更新 */
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      }).catch(()=>hit);
      return hit || net;
    }));
  } else {
    /* 地図タイル・Leaflet等(別オリジン): ネット優先、失敗時キャッシュ */
    e.respondWith(fetch(req).then(res => {
      if (res && (res.ok || res.type==='opaque')) caches.open(CACHE).then(c => c.put(req, res.clone()));
      return res;
    }).catch(()=>caches.match(req)));
  }
});
