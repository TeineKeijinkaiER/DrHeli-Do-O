/* ===== 地図モード（市町村別RP・現場滞在可変・搬送時間比較） ===== */
const MapMode = (() => {
  const BASE = { name:'手稲渓仁会病院', lat:43.1123, lng:141.2494 };
  const REGIONS = {
    ishikari:{label:'石狩',color:'#1f9e54'}, shiribeshi:{label:'後志',color:'#7b54e0'},
    sorachi:{label:'空知',color:'#d39200'}, iburi:{label:'胆振',color:'#e2622a'},
    hidaka:{label:'日高',color:'#d63a52'}, rumoi:{label:'留萌',color:'#2f7fe0'},
  };
  const SCENES=[10,15,20,25]; let scene=20;
  let map, regions=[], lessons=[], ready=false, curR=null, curP=null;
  const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const regionOf=r=>REGIONS[r.subpref]||REGIONS[(r.id||'').split('-')[1]]||{label:'—',color:'#5a6b86'};

  async function ensure(){
    if(ready){ setTimeout(()=>map.invalidateSize(),120); return; }
    ready=true;
    regions=await fetch('data/regions.json',{cache:'no-cache'}).then(r=>r.json());
    lessons=await fetch('data/case-lessons.json').then(r=>r.ok?r.json():[]).catch(()=>[]);
    initMap(); renderLegend();
  }
  function initMap(){
    map=L.map('map',{zoomControl:true,attributionControl:false}).setView([43.0,141.4],8);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:18,subdomains:'abcd'}).addTo(map);
    L.control.attribution({prefix:false}).addAttribution('© OpenStreetMap, © CARTO').addTo(map);
    L.marker([BASE.lat,BASE.lng],{zIndexOffset:1000,icon:L.divIcon({className:'',iconSize:[0,0],
      html:`<div class="pin pin--base"><div class="base-ring"><div class="pin__dot" style="background:#0d9488"></div></div><div class="pin__label">基地病院</div></div>`})})
      .addTo(map).on('click',()=>map.flyTo([BASE.lat,BASE.lng],9));
    L.circle([BASE.lat,BASE.lng],{radius:100000,color:'#2f6df6',weight:1.2,opacity:.5,fillColor:'#2f6df6',fillOpacity:.05,dashArray:'4 6'}).addTo(map);
    const pts=[[BASE.lat,BASE.lng]];
    regions.forEach(r=>{
      const reg=regionOf(r);
      (r.points||[]).forEach(p=>{
        if(p.lat==null||p.lng==null) return;
        const icon=L.divIcon({className:'',iconSize:[0,0],html:
          `<div class="pin"><div class="pin__dot" style="background:${reg.color}"></div><div class="pin__label">${esc(r.municipality)}</div></div>`});
        L.marker([p.lat,p.lng],{icon}).addTo(map).on('click',()=>openDetail(r,p));
        pts.push([p.lat,p.lng]);
      });
    });
    map.fitBounds(pts,{padding:[50,50]});
    setTimeout(()=>map.invalidateSize(),200);
  }
  function renderLegend(){
    document.getElementById('mapLegend').innerHTML=
      Object.values(REGIONS).map(r=>`<span class="legend__item"><span class="legend__dot" style="background:${r.color}"></span>${r.label}</span>`).join('')
      +`<span class="legend__item"><span class="legend__dot" style="background:#0d9488"></span>基地病院</span>`;
  }
  const sheet=document.getElementById('sheet'), sheetBody=document.getElementById('sheetBody');
  function setScene(v){ scene=v; renderDetail(); }
  function openDetail(r,p){ curR=r; curP=p; scene=20; renderDetail();
    sheet.classList.add('is-open'); sheet.setAttribute('aria-hidden','false');
    if(map&&p.lat!=null) map.flyTo([p.lat,p.lng],Math.max(map.getZoom(),10),{duration:.6}); }
  function fmtYM(ym){const m=/^(\d{4})-(\d{1,2})$/.exec(ym||'');return m?`${m[1]}年${Number(m[2])}月`:'';}

  function renderDetail(){
    const r=curR,p=curP; if(!r) return; const reg=regionOf(r);
    const flight=p.heliFlightMin, helipad=p.heliHelipadMin??6;
    const heli=(flight!=null)?scene+flight+helipad:null;
    const ground=(p.groundToBaseMin!=null)?p.groundToBaseMin:null;
    const save=(heli!=null&&ground!=null)?ground-heli:null;
    const hosp=(p.hospitalTimes||[]).filter(h=>h&&h.name);
    const hidden=new Set(Array.isArray(r.hiddenSections)?r.hiddenSections:[]);
    const rel=lessons.filter(l=>(l.relatedMunicipality===r.municipality||l.relatedMunicipality===reg.label)&&!hidden.has('lessons'));

    let html=`<div class="det__head"><div>
        <div class="det__name">${esc(r.municipality)}</div>
        <div class="det__sub">ランデブーポイント：${esc(p.rp||r.municipality)}${p.rpCount?`（RP実績${p.rpCount}件）`:''}</div>
        <div class="chips"><span class="chip chip--reg" style="border-color:${reg.color}66;color:${reg.color}">${reg.label}圏</span>
          ${r.fireDepartment?`<span class="chip">${esc(r.fireDepartment)}</span>`:''}</div>
      </div><button class="det__close" id="detClose" aria-label="閉じる">✕</button></div>

      <div class="scene"><span class="scene__lbl">現場滞在</span>
        <div class="scene__b">${SCENES.map(s=>`<button data-s="${s}" class="${s===scene?'on':''}">${s}分</button>`).join('')}</div></div>
      <div class="tx">
        <div class="tx__card tx__card--heli"><div class="tx__lbl">🚁 ヘリ搬送（手稲渓仁会）</div><div class="tx__val">${heli??'—'}<small>分</small></div>
          ${flight!=null?`<div class="tx__bd">現場滞在 ${scene} ＋ 飛行 ${flight} ＋ 病院 ${helipad}</div>`:''}
          ${flight!=null?`<div class="tx__src">${p.heliFlightSource==='実績中央値'
              ? `飛行は実績中央値（n=${p.heliFlightN}${p.heliFlightIqr?`, レンジ ${p.heliFlightIqr[0]}–${p.heliFlightIqr[1]}分`:''}）／回帰参考 ${p.heliFlightReg}分`
              : (p.heliFlightN>0
                  ? `飛行は回帰推定（実績 n=${p.heliFlightN}, 中央値 ${p.heliFlightObsMed}分は少数/外れのため参考）`
                  : `飛行は回帰推定（参考・実績なし）`)}</div>`:''}</div>
        <div class="tx__card tx__card--ground"><div class="tx__lbl">🚑 救急車（手稲渓仁会）</div><div class="tx__val">${ground??'—'}<small>分</small></div>
          ${ground==null?'<div class="tx__bd">admin入力待ち</div>':''}</div>
      </div>
      ${save!=null?`<div class="tx__save">ヘリで概ね <b>${save}分</b> の差（現場滞在${scene}分込み）</div>`:''}`;

    if(hosp.length) html+=`<div class="sec"><h3 class="sec__t">近隣病院への救急車搬送</h3>
      ${hosp.map(h=>`<div class="hrow"><span>${esc(h.name)}</span><b>${h.min!=null?h.min+'分':'—'}</b></div>`).join('')}</div>`;
    if(r.nearbyHospitals&&r.nearbyHospitals.length) html+=`<div class="sec"><h3 class="sec__t">近隣医療機関</h3>
      <div class="hosp">${r.nearbyHospitals.map(h=>`<span class="hosp__item">${esc(h)}</span>`).join('')}</div></div>`;
    if(r.bestPractice&&!hidden.has('bestPractice')) html+=`<div class="sec"><div class="note note--best"><span class="note__k">ベスト判断</span>${esc(r.bestPractice)}</div></div>`;
    if(r.notes&&!hidden.has('notes')) html+=`<div class="sec"><div class="note note--warn"><span class="note__k">注意</span>${esc(r.notes)}</div></div>`;
    if(rel.length) html+=`<div class="sec"><h3 class="sec__t">過去の反省・事例 <span style="opacity:.6;font-weight:600">(${rel.length})</span></h3>
      ${rel.map(l=>`<div class="lesson">${l.date?`<div class="lesson__date">${esc(fmtYM(l.date))}</div>`:''}<div class="lesson__t">${esc(l.title)}</div><div class="lesson__s">${esc(l.summary)}</div>${l.sourceUrl?`<a class="src" href="${l.sourceUrl}" target="_blank" rel="noopener">出典 ›</a>`:''}</div>`).join('')}</div>`;

    sheetBody.innerHTML=html;
    document.getElementById('detClose').addEventListener('click',closeSheet);
    sheetBody.querySelectorAll('.scene__b button').forEach(b=>b.addEventListener('click',()=>setScene(+b.dataset.s)));
  }
  function closeSheet(){ sheet.classList.remove('is-open'); sheet.setAttribute('aria-hidden','true'); }
  function sheetOpen(){ return sheet.classList.contains('is-open'); }
  return { ensure, closeSheet, sheetOpen };
})();
