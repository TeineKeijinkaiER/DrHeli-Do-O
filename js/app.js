/* ===== 道央ドクターヘリ 判断支援アプリ : メイン ===== */
const App = (() => {
  const IS_PUBLIC_BUILD = true;
  const screens = { home: document.getElementById('screen-home'), map: document.getElementById('screen-map') };
  const btnBack = document.getElementById('btnBack');
  const appbarSub = document.getElementById('appbarSub');
  let current = 'home';

  /* --- アイコン (inline SVG) --- */
  const I = {
    map:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>`,
    beginner:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h10a2 2 0 0 1 2 2v15l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2Z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>`,
    reflection:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4.6 3 7.6 7 9 4-1.4 7-4.4 7-9V6l-7-3Z"/><path d="M8.3 12h2l1-2 1.6 4 1-2h1.8"/></svg>`,
    inventory:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/><path d="M12 12.5v3.5M10.25 14.25h3.5"/></svg>`,
    quiz:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.2 9.3a2.8 2.8 0 0 1 5.3 1c0 1.8-2.6 2.3-2.6 4"/><path d="M12 17.5h.01"/></svg>`,
    stats:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
  };

  /* --- モード定義 --- */
  const MODES = [
    { id:'map',      name:'地図モード',         tag:'市町村別の注意事項',   icon:I.map,      accent:'accent-blue',   primary:true, public:true },
    { id:'beginner', name:'ビギナーモード',     tag:'OJT医療スタッフの覚書', icon:I.beginner, accent:'accent-green', public:true },
    { id:'reflection', name:'リフレクションモード', tag:'議事録由来の反省・注意事項', icon:I.reflection, accent:'accent-red', public:false },
    { id:'inventory', name:'インベントリーモード', tag:'バッグ物品管理',      icon:I.inventory, accent:'accent-amber', public:true },
    { id:'quiz',     name:'クイズモード',       tag:'',                     icon:I.quiz,     accent:'accent-cyan', public:true },
    { id:'stats',    name:'統計モード',         tag:'',                     icon:I.stats,    accent:'accent-purple', public:false },
  ].filter(m=>!IS_PUBLIC_BUILD||m.public);

  function renderModes(){
    const grid = document.getElementById('modeGrid');
    grid.innerHTML = MODES.map(m => `
      <button class="mode ${m.primary?'mode--primary':''} ${m.soon?'is-soon':''}" data-mode="${m.id}">
        ${m.proto?'<span class="badge-soon badge-proto">試作</span>':''}
        <span class="mode__ic ${m.accent}">${m.icon}</span>
        <span class="mode__body">
          <span class="mode__name">${m.name}</span>
          ${m.tag?`<span class="mode__desc">${m.tag}</span>`:''}
        </span>
        ${m.primary?'<span class="mode__arrow">›</span>':''}
        <span class="mode__glow"></span>
      </button>`).join('');
    grid.querySelectorAll('.mode').forEach(b=>{
      b.addEventListener('click',()=>{ open(b.dataset.mode); });
    });
  }

  const TITLES={map:'地図モード',beginner:'ビギナーモード',reflection:'リフレクションモード',inventory:'インベントリーモード',quiz:'クイズモード',stats:'統計モード'};
  function open(id){
    appbarSub.textContent=TITLES[id]||'';
    show(id);
    if(typeof Usage!=='undefined') Usage.log('mode',{mode:id});
    if(id==='map'){ if(typeof MapMode!=='undefined') MapMode.ensure(); return; }
    if(id==='reflection'){ if(typeof ReflectionMode!=='undefined') ReflectionMode.open(); return; }
    if(id==='stats'){ if(typeof StatsMode!=='undefined') StatsMode.open(); return; }
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
