/* 道央ドクターヘリ PWA Service Worker */
const CACHE = 'doo-heli-v74';
const TILES = 'doo-heli-tiles-v1';      /* 地図タイル専用キャッシュ(件数上限つき) */
const TILE_LIMIT = 800;
const KEEP = [CACHE, TILES];
/* タイル配信元。通信を伴うのは未保存タイルを開いた場合だけ。 */
const TILE_HOSTS = ['cyberjapandata.gsi.go.jp', 'tile.openstreetmap.org'];
const CORE = [
  './','./index.html','./about.html','./manifest.json',
  './css/style.css','./js/install-guide.js','./js/app.js','./js/map.js','./js/modes.js','./js/drug-calc.js','./js/drugs.js',

  './vendor/leaflet/leaflet.js','./vendor/leaflet/leaflet.css',
  './data/regions.json','./data/operating-hours.json',
  './data/quiz.json','./data/inventory.json','./data/beginner.json','./data/drugs.json',
  './image/Heli.png','./image/Heriteinu.png','./image/public-icon-192.png','./image/public-icon-512.png','./image/public-icon-180.png','./image/doo-offline-map.svg'
];
/* 通常利用中はキャッシュを優先し、背景更新しない。
   キャッシュが無い場合のみネットワークに取りに行く。飛行中の無線停止は端末の機内モードで行う。 */
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
      /*
       * 更新用 Request(cache:'reload') をそのまま cache.put() に渡すと、
       * Safari 等では Cache API が「reload モードの Request」を拒否する。
       * 通信は no-store で強制更新し、保存時は通常の URL をキーにする。
       */
      const req = new Request(url, { credentials: 'same-origin' });
      const res = sameOriginRedirect(req, await fetch(req, { cache: 'no-store', credentials: 'same-origin' }));
      if (unusable(req, res)) return;
      await cache.put(url, res.clone());
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
  e.waitUntil(preserveOldCache().then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  /* 更新失敗で旧キャッシュを失わない。古い版は手動更新成功後に整理する。 */
  e.waitUntil(self.clients.claim());
});
self.addEventListener('message', e => {
  if (!['SYNC_REQUESTED', 'SYNC_ON_CONFIRMED_WIFI'].includes(e.data?.type)) return;
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
/* Cloudflare Pages は index.html → /、about.html → /about へ 308 で寄せる。
   同一オリジン内の寄せ替えは中身が同じなので保存してよい。redirected のまま
   キャッシュすると画面遷移で使えないため、応答を作り直して印を外す。
   別オリジンへの転送(キャプティブポータル等)は従来どおり unusable() で弾く。 */
function sameOriginRedirect(req, res) {
  if (!res || !res.redirected) return res;
  if (new URL(res.url).origin !== new URL(req.url).origin) return res;
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}
async function putIfUsable(req, res) {
  if (unusable(req, res)) return false;
  const cache = await caches.open(CACHE);
  await cache.put(req, res.clone());
  return true;
}
async function cached(req) {
  return (await caches.match(req, { cacheName: CACHE })) || (await caches.match(req));
}

/* 画面遷移もキャッシュ優先。明示的な再ログインとキャッシュ未保存時のみ通信。 */
async function navigation(req) {
  const url = new URL(req.url);
  if (url.searchParams.has('wifi-auth') || url.searchParams.has('connect')) return fetch(req).catch(() => recoveryPage());
  if (url.searchParams.has('wifi-sync') || url.searchParams.has('sync')) return recoveryPage();
  const saved = (await cached(req)) || (await cached('./index.html'));
  if (saved) return saved;
  try {
    const res = await fetch(req);
    if (!unusable(req, res)) {
      const cache = await caches.open(CACHE);
      await cache.put('./index.html', res.clone());
    }
    return res;
  } catch (_) { return recoveryPage(); }
}

/* キャッシュが空で通信できない端末にも、オフラインで復旧操作を表示する。 */
function recoveryPage() {
  return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>データの保存</title><body style="font:16px system-ui;padding:24px;line-height:1.7"><h1>データの保存</h1><p>この端末に必要なデータがありません。出動前に通信可能な場所で保存してください。飛行中は端末を機内モードにしてください。</p><button id="sync" style="font:inherit;padding:12px">データを保存・更新</button><p id="status" role="status"></p><p><a id="login" href="?connect=1">ログインし直す</a></p><script>document.getElementById('login').onclick=e=>{if(!confirm('飛行中ではなく、通信を行ってよい状態ですか？'))e.preventDefault()};document.getElementById('sync').onclick=async()=>{if(!confirm('飛行中ではなく、通信を行ってよい状態ですか？'))return;const s=document.getElementById('status');s.textContent='保存中…';try{const reg=await navigator.serviceWorker.ready;const channel=new MessageChannel();const timer=setTimeout(()=>{s.textContent='保存が完了しませんでした。接続を確認して再試行してください。'},60000);channel.port1.onmessage=e=>{clearTimeout(timer);s.textContent=e.data.ok?'保存しました。アプリを開きます。':'一部のデータを取得できませんでした。ログイン状態と接続を確認してください。';if(e.data.ok)location.replace('./')};reg.active.postMessage({type:'SYNC_REQUESTED'},[channel.port2])}catch(e){s.textContent='保存できませんでした。ページを再読み込みしてください。'}}</script></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
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
    /* モード・データ・画像は保存済みなら通信しない。未保存時だけ取得する。 */
    e.respondWith((async () => {
      const hit = await cached(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        await putIfUsable(req, res);
        return res;
      } catch (_) { return Response.error(); }
    })());
  } else if (TILE_HOSTS.includes(url.hostname)) {
    /* 地図タイル: 専用キャッシュにキャッシュ優先 */
    e.respondWith(tileFirst(req));
  } else {
    /* Google CSV等は通常キャッシュ優先。明示的な更新(cache:reload)だけ再取得。 */
    e.respondWith((async () => {
      const hit = await cached(req);
      if (hit && req.cache !== 'reload') return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) {
          const cache = await caches.open(CACHE);
          await cache.put(req, res.clone());
        }
        return res;
      } catch (_) { return hit || Response.error(); }
    })());
  }
});
