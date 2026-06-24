/* ===== 試作モード群（地図以外）: データは data/*.json から読み込み ===== */
const Modes = (() => {
  const root = id => document.getElementById(id+'-root');
  const esc = s => String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  function speak(t){ try{ if(!('speechSynthesis' in window)) return; speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(t); u.lang='ja-JP'; u.rate=1.0; speechSynthesis.speak(u);}catch(e){} }
  const banner = txt => `<div class="proto-note">${txt}</div>`;

  /* 各モードの編集対象データファイル */
  const FILES = { beginner:'beginner', logi:'logistics', quiz:'quiz' };
  const DATA = {};
  async function load(){
    const need = Object.values(FILES).filter(f=>!(f in DATA));
    await Promise.all(need.map(f=>fetch('data/'+f+'.json').then(r=>r.json()).then(j=>DATA[f]=j).catch(()=>DATA[f]=null)));
  }

  /* ---------- エキスパート ---------- */
  function rExpert(){
    const d=DATA.expert||{themes:[]};
    root('expert').innerHTML = `<div class="mode-hd"><h2>エクスパート</h2><p>議事録由来・地域によらない注意事項（テーマ別）</p></div>
      ${banner('編集: data/expert.json')}
      <div class="acc">${d.themes.map((e,i)=>`
        <div class="acc__item"><button class="acc__h" data-i="${i}">${esc(e.t)}<span>＋</span></button>
        <div class="acc__b" id="exb${i}">${(e.items||[]).map(x=>{const t=(x&&x.text)||x;const r=(x&&x.ref)?`<span class="ref">${esc(x.ref)}</span>`:'';return `<div class="li">${r}${esc(t)}</div>`;}).join('')}</div></div>`).join('')}</div>`;
    root('expert').querySelectorAll('.acc__h').forEach(b=>b.addEventListener('click',()=>{
      const el=document.getElementById('exb'+b.dataset.i); el.classList.toggle('open');
      b.querySelector('span').textContent=el.classList.contains('open')?'−':'＋';}));
  }

  /* ---------- クイズ ---------- */
  let qstate=null;
  function rQuiz(){
    const d=DATA.quiz||{levels:[],themes:[],questions:[],passRate:0.8};
    root('quiz').innerHTML=`<div class="mode-hd"><h2>クイズ</h2><p>レベル・テーマを選んで検定。ランダムも可</p></div>
      ${banner('編集: data/quiz.json ／ TKH-ER-QUIZの仕組みを流用予定')}
      <div class="seg"><label>レベル</label><div class="seg__b" id="qlv">${d.levels.map((l,i)=>`<button data-v="${i}" class="${i===0?'on':''}">${esc(l)}</button>`).join('')}</div></div>
      <div class="seg"><label>テーマ</label><div class="seg__b" id="qth">
        ${d.themes.map((t,i)=>`<button data-v="${i}">${esc(t)}</button>`).join('')}<button data-v="rand" class="on">ランダム</button></div></div>
      <button class="bigbtn" id="qstart">検定をはじめる</button>
      <div id="qrun"></div>`;
    let lv=0, th='rand';
    const bind=(wrap,set)=>root('quiz').querySelector(wrap).querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
      root('quiz').querySelector(wrap).querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');set(b.dataset.v);}));
    bind('#qlv',v=>lv=+v); bind('#qth',v=>th=v);
    root('quiz').querySelector('#qstart').addEventListener('click',()=>startQuiz(lv,th));
  }
  function startQuiz(lv,th){
    const d=DATA.quiz; let pool=d.questions.filter(x=>x.lv===lv && (th==='rand'||x.th===+th));
    if(!pool.length) pool=d.questions.filter(x=>x.lv===lv);
    pool=pool.slice().sort(()=>Math.random()-0.5);
    qstate={pool,i:0,score:0,pass:d.passRate||0.8}; renderQ();
  }
  function renderQ(){
    const {pool,i}=qstate; const run=root('quiz').querySelector('#qrun');
    if(i>=pool.length){ const ok=pool.length&&qstate.score/pool.length>=qstate.pass;
      run.innerHTML=`<div class="qcard"><div class="qresult ${ok?'pass':'fail'}">${qstate.score} / ${pool.length} 正解</div>
        <div class="qjudge">${ok?'合格（検定クリア）':'再挑戦してください（合格'+Math.round(qstate.pass*100)+'%）'}</div>
        <button class="bigbtn" id="qre">もう一度</button></div>`;
      run.querySelector('#qre').addEventListener('click',()=>rQuiz()); return; }
    const it=pool[i];
    run.innerHTML=`<div class="qcard"><div class="qnum">第${i+1}問 / ${pool.length}</div>
      <div class="qq">${esc(it.q)}</div>
      <div class="qopts">${it.c.map((c,ci)=>`<button class="qopt" data-ci="${ci}">${esc(c)}</button>`).join('')}</div></div>`;
    run.querySelectorAll('.qopt').forEach(b=>b.addEventListener('click',()=>{
      const ci=+b.dataset.ci; const good=ci===it.a;
      run.querySelectorAll('.qopt').forEach((x,xi)=>{x.disabled=true; if(xi===it.a)x.classList.add('ok'); if(xi===ci&&!good)x.classList.add('ng');});
      if(good)qstate.score++;
      setTimeout(()=>{qstate.i++;renderQ();},850);
    }));
  }

  /* ---------- ロジスティック ---------- */
  function rLogi(){
    const d=DATA.logi||{bags:[]};
    const meta=(d.meta||[]).map(m=>`<label class="lmeta"><span>${esc(m)}</span><input type="text"></label>`).join('');
    root('logi').innerHTML=`<div class="mode-hd"><h2>ロジスティック</h2><p>${esc(d.title||'バッグ別の物品。階層ごとに読み上げできます')}</p></div>
      ${banner('編集: data/logistics.json（表示用フロント。構造化バックエンドは別途）')}
      ${meta?`<div class="lmetarow">${meta}</div>`:''}
      ${d.bags.map(b=>`<div class="bag">
        <div class="bag__h"><span>${esc(b.bag)}</span><button class="say" data-say="${esc(b.bag+'。'+b.sections.map(s=>s.s+'、'+s.items.join('、')).join('。'))}">▶ 全体読み上げ</button></div>
        ${b.sections.map(s=>`<div class="sect"><div class="sect__h">${esc(s.s)}<button class="say" data-say="${esc(s.s+'。'+s.items.join('、'))}">▶ 読み上げ</button></div>
          <div class="sect__items">${s.items.map(it=>`<label class="chk"><input type="checkbox"> ${esc(it)}</label>`).join('')}</div></div>`).join('')}
      </div>`).join('')}`;
    root('logi').querySelectorAll('.say').forEach(b=>b.addEventListener('click',()=>speak(b.dataset.say)));
  }

  /* ---------- ビギナー ---------- */
  function rBeginner(){
    const d=DATA.beginner||{sections:[],top10:[]};
    root('beginner').innerHTML=`<div class="mode-hd"><h2>ビギナー</h2><p>OJT医療スタッフ向け 運用マニュアル</p></div>
      ${banner('編集: data/beginner.json ／ 出典: '+esc(d.source||''))}
      ${d.intro?`<div class="li">${esc(d.intro)}</div>`:''}
      ${(d.top10&&d.top10.length)?`<div class="top10"><div class="top10__h">最初に覚える10項目</div><ol>${d.top10.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div>`:''}
      <div class="acc">${(d.sections||[]).map((e,i)=>`
        <div class="acc__item"><button class="acc__h" data-i="${i}">${esc(e.t)}<span>＋</span></button>
        <div class="acc__b" id="bgb${i}">${(e.items||[]).map(x=>`<div class="li">${esc(x)}</div>`).join('')}</div></div>`).join('')}</div>`;
    root('beginner').querySelectorAll('.acc__h').forEach(b=>b.addEventListener('click',()=>{
      const el=document.getElementById('bgb'+b.dataset.i); el.classList.toggle('open');
      b.querySelector('span').textContent=el.classList.contains('open')?'−':'＋';}));
  }

  /* ---------- 統計 ---------- */
  function rStats(){
    const d=DATA.stats||{cards:[],note:''};
    root('stats').innerHTML=`<div class="mode-hd"><h2>統計</h2><p>運航データベースの統計</p></div>
      ${banner('編集: data/stats.json ／ '+esc(d.note||''))}
      <div class="statgrid">${d.cards.map(c=>`<div class="statc"><div class="statc__v">${esc(c.v)}</div><div class="statc__k">${esc(c.k)}</div></div>`).join('')}</div>`;
  }

  async function open(id){ await load(); ({beginner:rBeginner,logi:rLogi,quiz:rQuiz}[id]||(()=>{}))(); }
  return { open };
})();
