/* 道央ドクターヘリ PWA Service Worker */
const CACHE = 'doo-heli-v22';
const TILES = 'doo-heli-tiles-v1';      /* 地図タイル専用キャッシュ(件数上限つき) */
const TILE_LIMIT = 800;
const KEEP = [CACHE, TILES];
/* タイル配信元。ここに無い別オリジンは従来どおりネット優先。 */
const TILE_HOSTS = ['cyberjapandata.gsi.go.jp', 'tile.openstreetmap.org'];
const NAV_TIMEOUT_MS = 2500;            /* 電波が弱い現場で待たされないための上限 */
const CORE = [
  './','./index.html','./manifest.json',
  './css/style.css','./js/app.js','./js/map.js','./js/modes.js',
  './vendor/leaflet/leaflet.js','./vendor/leaflet/leaflet.css',
  './data/regions.json','./data/operating-hours.json',
  './data/quiz.json','./data/inventory.json','./data/beginner.json',
  './image/Heli.png','./image/Heriteinu.png','./image/icon-192.png','./image/icon-512.png','./image/apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>!KEEP.includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

/* ログイン画面を本来のファイルとして取り込まないためのガード。
   Cloudflare Access の認証切れや、病院/公衆無線LANのキャプティブポータルでは、
   data/regions.json へのリクエストにログインHTMLが 200 で返る。res.ok だけで
   判定すると JSON の代わりに HTML をキャッシュしてアプリが壊れるため、
   リダイレクトの有無と Content-Type も併せて確認する。 */
function unusable(req, res) {
  if (!res || !res.ok) return true;
  if (res.redirected) return true;
  /* 自前認証(functions/_middleware.js)は未認証時にこのヘッダを必ず付ける。
     ログイン画面はリダイレクトを伴わない 200 HTML で返るため、これが無いと
     index.html として保存されてしまう。 */
  if (res.headers.get('x-auth-required')) return true;
  const ct = res.headers.get('content-type') || '';
  if (/\.json$/i.test(new URL(req.url).pathname) && !/json/i.test(ct)) return true;
  return false;
}
function putIfUsable(req, res) {
  if (unusable(req, res)) return false;
  const cp = res.clone();
  caches.open(CACHE).then(c => c.put(req, cp));
  return true;
}

/* 画面遷移: ネット優先。認証切れのとき Cloudflare Access のログイン画面へ
   到達できるようにするため。ただし電波が弱いと待たされるので、キャッシュが
   あれば NAV_TIMEOUT_MS で打ち切ってキャッシュを返す。 */
async function navigation(req) {
  const netP = fetch(req).catch(() => null);
  const cached = await caches.match('./index.html');
  const res = await Promise.race([netP, new Promise(r => setTimeout(() => r(null), cached ? NAV_TIMEOUT_MS : 15000))]);
  if (res) {
    if (!unusable(req, res)) { const cp = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', cp)); }
    return res;
  }
  return cached || (await netP) || Response.error();
}

/* タイルを保存し、上限を超えた分を古い順に捨てる */
async function putTile(req, res) {
  const c = await caches.open(TILES);
  await c.put(req, res);
  const ks = await c.keys();
  if (ks.length > TILE_LIMIT) await Promise.all(ks.slice(0, ks.length - TILE_LIMIT).map(k => c.delete(k)));
}
/* タイルはキャッシュ優先(内容が変わらないため)。未取得のみネットへ。 */
async function tileFirst(req) {
  const hit = await caches.match(req, { cacheName: TILES });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) putTile(req, res.clone());
    return res;
  } catch (err) {
    return Response.error();
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === 'navigate') { e.respondWith(navigation(req)); return; }
    const isData = /\/data\/.*\.json$/.test(url.pathname);
    if (isData) {
      /* データJSON: ネットワーク優先(オンライン時は常に最新)・失敗時のみキャッシュ */
      e.respondWith(
        fetch(req).then(res => {
          if (!putIfUsable(req, res)) return caches.match(req).then(hit => hit || res);
          return res;
        }).catch(() => caches.match(req))
      );
    } else {
      /* アプリ本体(html/js/css/画像/vendor): キャッシュ優先＋背景更新 */
      e.respondWith(caches.match(req).then(hit => {
        const net = fetch(req).then(res => {
          if (!putIfUsable(req, res)) return hit || res;
          return res;
        }).catch(() => hit);
        return hit || net;
      }));
    }
  } else if (TILE_HOSTS.includes(url.hostname)) {
    /* 地図タイル: 専用キャッシュにキャッシュ優先 */
    e.respondWith(tileFirst(req));
  } else {
    /* その他の別オリジン: ネット優先・失敗時キャッシュ */
    e.respondWith(fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
      return res;
    }).catch(() => caches.match(req)));
  }
});
