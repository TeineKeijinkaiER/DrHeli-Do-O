/* 道央ドクターヘリ PWA Service Worker */
const CACHE = 'doo-heli-v66';
const TILES = 'doo-heli-tiles-v1';      /* 地図タイル専用キャッシュ(件数上限つき) */
const TILE_LIMIT = 800;
const KEEP = [CACHE, TILES];
/* タイル配信元。ここに無い別オリジンは従来どおりネット優先。 */
const TILE_HOSTS = ['cyberjapandata.gsi.go.jp', 'tile.openstreetmap.org'];
const NAV_TIMEOUT_MS = 2500;            /* 電波が弱い現場で待たされないための上限 */
const CORE = [
  './','./index.html','./about.html','./manifest.json',
  './css/style.css','./js/install-guide.js','./js/app.js','./js/map.js','./js/modes.js','./js/drug-calc.js','./js/drugs.js',

  './vendor/leaflet/leaflet.js','./vendor/leaflet/leaflet.css',
  './data/regions.json','./data/operating-hours.json',
  './data/quiz.json','./data/inventory.json','./data/beginner.json','./data/drugs.json',
  './image/Heli.png','./image/Heriteinu.png','./image/public-icon-192.png','./image/public-icon-512.png','./image/public-icon-180.png'
];
/* Wi‑Fi以外、または接続種別を取得できない場合はネットワークへ出ない。
   既にキャッシュされたアプリ・データ・地図だけで動作させる。 */
function wifiOnly() {
  const c = self.navigator && self.navigator.connection;
  return self.navigator && self.navigator.onLine !== false && !!c && c.type === 'wifi';
}
/* 版を上げたときの取り込みはブラウザのHTTPキャッシュを通さない。
   通すと古い js/css がそのまま新しい版のキャッシュに入り、画面が更新されない
   （改名した見出しが旧名のまま残った実績あり）。 */
async function preserveOldCache() {
  const current = await caches.open(CACHE);
  const old = (await caches.keys()).filter(k => k.startsWith('doo-heli-v') && !KEEP.includes(k)).reverse();
  for (const name of old) {
    const previous = await caches.open(name);
    for (const req of await previous.keys()) {
      if (!(await current.match(req))) {
        const res = await previous.match(req);
        if (res) await current.put(req, res);
      }
    }
  }
}

async function refreshCore() {
  const cache = await caches.open(CACHE);
  let updated = 0;
  /* 一部が失敗しても、取得済みの旧データは消さない。認証画面も保存しない。 */
  await Promise.all(CORE.map(async url => {
    try {
      const req = new Request(url, { cache: 'reload' });
      const res = await fetch(req);
      if (unusable(req, res)) return;
      await cache.put(req, res.clone());
      updated++;
    } catch (_) { /* 通信不能なら既存キャッシュを保持 */ }
  }));
  if (updated === CORE.length) {
    const names = await caches.keys();
    await Promise.all(names.filter(k => k.startsWith('doo-heli-v') && !KEEP.includes(k)).map(k => caches.delete(k)));
  }
  return { ok: updated === CORE.length, updated, total: CORE.length };
}

self.addEventListener('install', e => {
  e.waitUntil(preserveOldCache().then(async () => {
    if (wifiOnly()) await refreshCore();
    await self.skipWaiting();
  }));
});
self.addEventListener('activate', e => {
  /* Wi-Fi判定不可・圏外の更新で旧キャッシュを消してはいけない。 */
  e.waitUntil(self.clients.claim());
});
self.addEventListener('message', e => {
  if (e.data?.type !== 'SYNC_ON_CONFIRMED_WIFI') return;
  e.waitUntil(refreshCore().then(result => e.ports[0]?.postMessage(result))
    .catch(() => e.ports[0]?.postMessage({ ok: false, updated: 0, total: CORE.length })));
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
  const path = new URL(req.url).pathname;
  if (/\.json$/i.test(path) && !/json/i.test(ct)) return true;
  if (/\.js$/i.test(path) && !/(javascript|ecmascript)/i.test(ct)) return true;
  if (/\.css$/i.test(path) && !/css/i.test(ct)) return true;
  return false;
}
function putIfUsable(req, res) {
  if (unusable(req, res)) return false;
  const cp = res.clone();
  caches.open(CACHE).then(c => c.put(req, cp));
  return true;
}
async function cached(req) {
  return (await caches.match(req, { cacheName: CACHE })) || (await caches.match(req));
}

/* 画面遷移: ネット優先。認証切れのとき Cloudflare Access のログイン画面へ
   到達できるようにするため。ただし電波が弱いと待たされるので、キャッシュが
   あれば NAV_TIMEOUT_MS で打ち切ってキャッシュを返す。 */
async function navigation(req) {
  const url = new URL(req.url);
  /* 復旧画面でWi-Fi確認後に選んだ、ログイン用の1回だけの通信。保存しない。 */
  if (url.searchParams.has('wifi-auth')) return fetch(req).catch(() => recoveryPage());
  if (url.searchParams.has('wifi-sync')) return recoveryPage();
  const saved = (await cached(req)) || (await cached('./index.html'));
  if (!wifiOnly()) return saved || recoveryPage();
  const netP = fetch(req).catch(() => null);
  const res = await Promise.race([netP, new Promise(r => setTimeout(() => r(null), saved ? NAV_TIMEOUT_MS : 15000))]);
  if (res) {
    if (!unusable(req, res)) { const cp = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', cp)); }
    return res;
  }
  return saved || (await netP) || Response.error();
}

/* v65 が旧キャッシュを消してしまった端末でも、通信せずに復旧操作を表示する。 */
function recoveryPage() {
  return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wi-Fiでデータを更新</title><body style="font:16px system-ui;padding:24px;line-height:1.7"><h1>Wi-Fiでデータを更新</h1><p>機内では操作しないでください。Wi-Fi接続を確認してから更新すると、必要なデータを端末に保存します。</p><button id="sync" style="font:inherit;padding:12px">Wi-Fi接続を確認して更新</button><p id="status" role="status"></p><p><a id="login" href="?wifi-auth=1">Wi-Fiでログインし直す</a></p><script>document.getElementById('login').onclick=e=>{if(!confirm('機内ではなく、Wi-Fiに接続していることを確認しましたか？'))e.preventDefault()};document.getElementById('sync').onclick=async()=>{if(!confirm('機内ではなく、Wi-Fiに接続していることを確認しましたか？'))return;const s=document.getElementById('status');s.textContent='更新中…';try{const reg=await navigator.serviceWorker.ready;const channel=new MessageChannel();const timer=setTimeout(()=>{s.textContent='更新が完了しませんでした。Wi-Fiを確認して再試行してください。'},60000);channel.port1.onmessage=e=>{clearTimeout(timer);s.textContent=e.data.ok?'更新しました。アプリを開きます。':'一部のデータを取得できませんでした。ログイン状態とWi-Fiを確認してください。';if(e.data.ok)location.replace('./')};reg.active.postMessage({type:'SYNC_ON_CONFIRMED_WIFI'},[channel.port2])}catch(e){s.textContent='更新できませんでした。ページを再読み込みしてください。'}}</script></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

/* タイルを保存し、上限を超えた分を古い順に捨てる */
let tileWritesSinceTrim = 0;
let tileTrimPromise = null;
async function trimTiles(c) {
  const ks = await c.keys();
  if (ks.length > TILE_LIMIT) await Promise.all(ks.slice(0, ks.length - TILE_LIMIT).map(k => c.delete(k)));
}
async function putTile(req, res) {
  const c = await caches.open(TILES);
  await c.put(req, res);
  /* 連続ズーム中に全件走査をタイル枚数分繰り返すと、特にiPhoneでUIが固まる。
     32枚ごとに1回だけ、かつ同時実行を1本に制限する。 */
  tileWritesSinceTrim += 1;
  if (tileWritesSinceTrim < 32 || tileTrimPromise) return;
  tileWritesSinceTrim = 0;
  tileTrimPromise = trimTiles(c).finally(() => { tileTrimPromise = null; });
  await tileTrimPromise;
}
/* タイルはキャッシュ優先(内容が変わらないため)。未取得のみネットへ。 */
async function tileFirst(req) {
  const hit = await caches.match(req, { cacheName: TILES });
  if (hit) return hit;
  if (!wifiOnly()) return Response.error();
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
    /* 利用履歴の API は素通し。集計結果をキャッシュ優先で返すと、
       管理画面がいつまでも古い数字を出してしまう。 */
    if (url.pathname.startsWith('/api/')) return;
    if (req.mode === 'navigate') { e.respondWith(navigation(req)); return; }
    const isData = /\/data\/.*\.json$/.test(url.pathname);
    if (isData) {
      /* データJSON: ネットワーク優先(オンライン時は常に最新)・失敗時のみキャッシュ */
      e.respondWith(
        (wifiOnly() ? fetch(req) : Promise.reject()).then(res => {
          if (!putIfUsable(req, res)) return cached(req).then(hit => hit || res);
          return res;
        }).catch(() => cached(req))
      );
    } else {
      /* アプリ本体(html/js/css/画像/vendor): キャッシュ優先＋背景更新 */
      e.respondWith(cached(req).then(hit => {
        if (!wifiOnly()) return hit || Response.error();
        /* 背景更新もHTTPキャッシュの古い版で上書きしないよう、サーバに確認させる */
        const net = fetch(req, { cache: 'no-cache' }).then(res => {
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
    e.respondWith((wifiOnly() ? fetch(req) : Promise.reject()).then(res => {
      if (res && (res.ok || res.type === 'opaque')) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
      return res;
    }).catch(() => cached(req)));
  }
});
