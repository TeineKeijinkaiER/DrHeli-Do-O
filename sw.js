/* 道央ドクターヘリ PWA Service Worker */
const CACHE = 'doo-heli-v17';
const CORE = [
  './','./index.html','./manifest.json',
  './css/style.css','./js/app.js','./js/map.js','./js/modes.js',
  './data/regions.json','./data/operating-hours.json',
  './data/expert.json','./data/quiz.json','./data/inventory.json','./data/beginner.json','./data/stats.json','./data/case-lessons.json',
  './image/Heli.png','./image/Heriteinu.png','./image/icon-192.png','./image/icon-512.png','./image/apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    const isData = /\/data\/.*\.json$/.test(url.pathname);
    if (isData) {
      /* データJSON: ネットワーク優先(オンライン時は常に最新)・失敗時のみキャッシュ */
      e.respondWith(
        fetch(req).then(res => {
          if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
          return res;
        }).catch(() => caches.match(req))
      );
    } else {
      /* アプリ本体(html/js/css/画像): キャッシュ優先＋背景更新 */
      e.respondWith(caches.match(req).then(hit => {
        const net = fetch(req).then(res => {
          if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
          return res;
        }).catch(() => hit);
        return hit || net;
      }));
    }
  } else {
    /* 別オリジン(地図タイル等): ネット優先・失敗時キャッシュ */
    e.respondWith(fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
      return res;
    