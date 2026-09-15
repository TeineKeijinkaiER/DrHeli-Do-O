/* ===== 道央ドクターヘリ 判断支援アプリ : メイン ===== */
const App = (() => {
  const IS_PUBLIC_BUILD = true;
  const screens = { home: document.getElementById('screen-home'), map: document.getElementById('screen-map') };
  const btnBack = document.getElementById('btnBack');
  const appbarSub = document.getElementById('appbarSub');
  let current = 'home';

  /* --- モード定義 --- */
  const MODES = [
    { id:'map',        name:'地図モード',           primary:true, public:true },
    { id:'beginner',   name:'ベーシックモード',                  public:true },
    { id:'reflection', name:'ケースレビューモード',               public:false },
    { id:'inventory',  name:'器材モード',                         public:true },
    { id:'drugs',      name:'薬剤モード',                         public:true },
    { id:'stats',      name:'統計モード',                         public:false },
    { id:'quiz',       name:'クイズモード',                       public:true },
  ].filter(m=>!IS_PUBLIC_BUILD||m.public);

  function renderModes(){
    const grid = document.getElementById('modeGrid');
    grid.innerHTML = MODES.map(m => `
      <button class="mode ${m.primary?'mode--primary':''} ${m.soon?'is-soon':''}" data-mode="${m.id}">
        <span class="mode__name">${m.name}</span>
        <span class="mode__glow"></span>
      </button>`).join('');
    grid.querySelectorAll('.mode').forEach(b=>{
      b.addEventListener('click',()=>{ open(b.dataset.mode); });
    });
  }

  const TITLES={map:'地図モード',beginner:'ベーシックモード',reflection:'ケースレビューモード',inventory:'器材モード',quiz:'クイズモード',stats:'統計モード',drugs:'薬剤モード'};
  function open(id){
    appbarSub.textContent=TITLES[id]||'';
    show(id);
    if(typeof Usage!=='undefined') Usage.log('mode',{mode:id});
    if(id==='map'){ if(typeof MapMode!=='undefined') MapMode.ensure(); return; }
    if(id==='reflection'){ if(typeof ReflectionMode!=='undefined') ReflectionMode.open(); return; }
    if(id==='stats'){ if(typeof StatsMode!=='undefined') StatsMode.open(); return; }
    if(id==='drugs'){ if(typeof DrugsMode!=='undefined') DrugsMode.open(); return; }
    if(typeof Modes!=='undefined') Modes.open(id);
  }

  function show(name){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('is-active'));
    const el=document.getElementById('screen-'+name);
    if(el) el.classList.add('is-active');
    current=name;
    btnBack.hidden = (name==='home');
    if(name==='home'){ appbarSub.textContent='判断支援アプリ'; if(typeof MapMode!=='undefined') MapMode.closeSheet(); }
    window.scrollTo(0,0);
  }

  btnBack.addEventListener('click',()=>{
    if(typeof MapMode!=='undefined' && MapMode.sheetOpen()){ MapMode.closeSheet(); return; }
    /* 薬剤モードの中では1段階だけ戻す。誤ってホームへ戻り、体重を入れ直す事故を防ぐ。 */
    if(current==='drugs' && typeof DrugsMode!=='undefined' && DrugsMode.back()) return;
    show('home');
  });

  /* --- 運航時間ステータス --- */
  async function loadOpStatus(){
    try{
      const hours = await fetch('data/operating-hours.json').then(r=>r.json());
      const now=new Date();
      const md=(now.getMonth()+1)*100+now.getDate();
      const cur=hours.find(h=>inRange(md, h.startDate, h.endDate));
      const el=document.getElementById('opStatus');
      if(!cur){ el.textContent='—'; return; }
      const [sh,sm]=cur.startTime.split(':').map(Number);
      const [eh,em]=cur.endTime.split(':').map(Number);
      const mins=now.getHours()*60+now.getMinutes();
      const open = mins>=sh*60+sm && mins<=eh*60+em;
      el.textContent = `${open?'運航中':'時間外'} ${cur.startTime}–${cur.endTime}`;
      el.classList.add(open?'is-open':'is-closed');
    }catch(e){ /* オフラインでも黙って続行 */ }
  }
  function inRange(md,sd,ed){
    const s=toMd(sd), e=toMd(ed);
    return s<=e ? (md>=s && md<=e) : (md>=s || md<=e);
  }
  function toMd(s){ const [m,d]=s.split('-').map(Number); return m*100+d; }

  /* --- 簡易トースト --- */
  let tt;
  function toast(msg){
    let el=document.getElementById('toast');
    if(!el){ el=document.createElement('div'); el.id='toast'; document.body.appendChild(el);
      el.style.cssText='position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 26px);transform:translateX(-50%);z-index:900;background:rgba(13,26,53,.95);color:#eaf1ff;border:1px solid rgba(255,255,255,.14);padding:11px 18px;border-radius:999px;font-size:13px;font-weight:600;box-shadow:0 12px 30px rgba(0,0,0,.5);opacity:0;transition:opacity .2s';
    }
    el.textContent=msg; el.style.opacity='1'; clearTimeout(tt);
    tt=setTimeout(()=>el.style.opacity='0',1800);
  }

  function readCookie(name){
    const m=document.cookie.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]*)'));
    if(!m) return null;
    try{ return decodeURIComponent(m[1]); }catch(e){ return null; }
  }

  /* 合言葉ログインがある版でだけログアウトと職種を出す。
     doo_session / doo_role_label は functions/_middleware.js が付ける表示用の目印で、
     権限は持たない（書き換えても記録される職種は変わらない）。
     公開版にはこの Cookie が存在しないため、同じ app.js でも何も出ない。 */
  function renderFoot(){
    if(!/(?:^|;\s*)doo_session=1(?:\s*;|$)/.test(document.cookie)) return;
    const foot=document.querySelector('.home__foot'); if(!foot) return;

    /* 押し間違えたその日のうちに直せるようにする。1日1回の手軽さは保つ。 */
    const role=readCookie('doo_role_label');
    if(role){
      const p=document.createElement('span');
      p.className='home__role';
      p.textContent='現在：'+role+'　';
      const change=document.createElement('a');
      change.href='/__role'; change.textContent='変更';
      p.appendChild(change);
      foot.appendChild(document.createElement('br'));
      foot.appendChild(p);
    }

    const a=document.createElement('a');
    a.className='home__logout'; a.href='/__logout';
    a.textContent='ログアウト（この端末の保存データも消去）';
    foot.appendChild(document.createElement('br'));
    foot.appendChild(a);
  }

  function renderUsageLink(){
    if(IS_PUBLIC_BUILD) return;
    const links=document.getElementById('privateLinks'); if(!links) return;
    const a=document.createElement('a');
    a.className='home__usage'; a.href='admin.html'; a.textContent='使用履歴';
    links.appendChild(a);
  }

  function init(){
    renderModes(); loadOpStatus(); renderUsageLink(); renderFoot();
    if(typeof Usage!=='undefined') Usage.session();
  }
  document.addEventListener('DOMContentLoaded',init);

  return { show, open, toast };
})();
