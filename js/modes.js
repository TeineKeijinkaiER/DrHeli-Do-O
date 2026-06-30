/* ===== 試作モード群（地図以外）: データは data/*.json から読み込み ===== */
const Modes = (() => {
  const root = id => document.getElementById(id+'-root');
  const esc = s => String(s ?? '').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const escAttr = s => esc(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  function speak(t,rate){ try{ if(!('speechSynthesis' in window)) return; speechSynthesis.cancel();
    const pauseBtn = document.getElementById('btnSpeakPause');
    const resumeBtn = document.getElementById('btnSpeakResume');
    if (pauseBtn && resumeBtn) {
      pauseBtn.style.display = 'inline-block';
      resumeBtn.style.display = 'none';
    }
    const u=new SpeechSynthesisUtterance(t); u.lang='ja-JP'; u.rate=rate||1.0; speechSynthesis.speak(u);}catch(e){} }
  const INVENTORY_STATE='doo-inventory-state-v1',INVENTORY_EP='doo-inventory-endpoint',INVENTORY_SPD='doo-inventory-speed';
  const INVENTORY_MASTER_URL='doo-inventory-master-url',INVENTORY_MASTER_CACHE='doo-inventory-master-cache';
  let invMasterDone=false;
  const banner = txt => `<div class="proto-note">${txt}</div>`;

  /* 各モードの編集対象データファイル */
  const FILES = { beginner:'beginner', expert:'expert', inventory:'inventory', quiz:'quiz', stats:'stats' };
  const DATA = {};
  async function load(id){
    const targets = id ? [FILES[id]].filter(Boolean) : Object.values(FILES).filter((f,i,a)=>a.indexOf(f)===i);
    const need = targets.filter(f=>!DATA[f]); // 失敗(null/未設定)は次回再試行
    await Promise.all(need.map(f=>fetch('data/'+f+'.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw 0;return r.json();}).then(j=>DATA[f]=j).catch(()=>{})));
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

  /* ---------- インベントリー ---------- */
  /* 物品マスター(スプレッドシート公開CSV)→bags配列 */
  function parseCSV_(text){
    text=String(text||'').replace(/^\uFEFF/,'');
    const rows=[]; let row=[],cur='',q=false;
    for(let i=0;i<text.length;i++){const ch=text[i];
      if(q){ if(ch==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=ch; }
      else { if(ch==='"')q=true; else if(ch===','){row.push(cur);cur='';} else if(ch==='\n'){row.push(cur);rows.push(row);row=[];cur='';} else if(ch==='\r'){} else cur+=ch; } }
    if(cur!==''||row.length){row.push(cur);rows.push(row);}
    return rows;
  }
  function csvToBags_(text){
    const rows=parseCSV_(text).filter(r=>r.some(c=>String(c).trim()!==''));
    if(!rows.length) return [];
    let start=0; if(rows[0] && /バッグ|bag/i.test(rows[0][0]||'')) start=1;
    const bagMap=new Map();
    for(let i=start;i<rows.length;i++){
      const c=rows[i].map(x=>(x||'').trim());
      const bag=c[0],sec=c[1]||'',name=c[2],yomi=c[3]||'';
      if(!bag||!name) continue;
      if(!bagMap.has(bag)) bagMap.set(bag,new Map());
      const sm=bagMap.get(bag);
      if(!sm.has(sec)) sm.set(sec,[]);
      const items=sm.get(sec);
      if(items.some(it=>it.n===name)) continue; // 同一バッグ・セクション内の重複行はスキップ（重複列によるOK上書きを防止）
      items.push({n:name,y:yomi});
    }
    const bags=[];
    for(const [bag,sm] of bagMap){ const sections=[]; for(const [sname,items] of sm) sections.push({s:sname,items}); bags.push({bag,sections}); }
    return bags;
  }
  function masterUrl_(d){ const u=localStorage.getItem(INVENTORY_MASTER_URL); return (u!==null&&u!=='')?u:((d.config&&d.config.masterCsvUrl)||''); }
  async function refreshMaster_(d){
    const url=masterUrl_(d); if(!url) return false;
    try{
      const bust=url+(url.includes('?')?'&':'?')+'_ts='+Date.now(); // Google側CDNキャッシュ回避
      const t=await fetch(bust,{cache:'no-store'}).then(r=>{if(!r.ok)throw 0;return r.text();});
      const bags=csvToBags_(t);
      if(bags&&bags.length){
        const changed=JSON.stringify(d.bags||[])!==JSON.stringify(bags);
        d.bags=bags; try{localStorage.setItem(INVENTORY_MASTER_CACHE,JSON.stringify(bags));}catch(e){}
        return changed;
      }
    }catch(e){}
    return false;
  }
  function loadInvState(){
    try{
      const raw = JSON.parse(localStorage.getItem(INVENTORY_STATE)||'{}');
      return raw && typeof raw === 'object' ? raw : {};
    }catch(e){
      localStorage.removeItem(INVENTORY_STATE);
      return {};
    }
  }
  function rInventory(){
    const d=DATA.inventory||{bags:[],speeds:[],meta:[]};
    try{const c=localStorage.getItem(INVENTORY_MASTER_CACHE); if(c){const cb=JSON.parse(c); if(Array.isArray(cb)&&cb.length) d.bags=cb;}}catch(e){}
    const speeds=(d.speeds&&d.speeds.length)?d.speeds:[["ゆっくり",0.7],["標準",1.0],["速い",1.4]];
    let spd=parseFloat(localStorage.getItem(INVENTORY_SPD)||'1.0');
    if(!Number.isFinite(spd)) spd=1.0;
    const st=loadInvState();st.checks=st.checks||{};st.notes=st.notes||{};st.meta=st.meta||{};st.collapsed=st.collapsed||{};
    if(typeof st.handover!=='string') st.handover='';
    const today=new Date().toLocaleDateString('sv-SE');
    (d.meta||[]).forEach((m,i)=>{ if(/日付|date/i.test(m) && !st.meta[i]) st.meta[i]=today; });
    const save=()=>{try{localStorage.setItem(INVENTORY_STATE,JSON.stringify(st));}catch(e){}};
    const key=(b,s,n)=>b+'|'+s+'|'+n;
    const sk=(b,s)=>b+'|'+s;
    const endpoint=()=>{const stored=localStorage.getItem(INVENTORY_EP);return stored!==null?stored:((d.config&&d.config.submitUrl)||'');};
    const R=root('inventory');
    R.innerHTML=`
      <div class="mode-hd"><h2>インベントリー</h2><p>${esc(d.title||'')}</p></div>
      <div class="lmetarow">${(d.meta||[]).map((m,i)=>{const dt=/日付|date/i.test(m);return `<label class="lmeta"><span>${esc(m)}</span><input type="${dt?'date':'text'}" data-meta="${i}" value="${escAttr(st.meta[i]||'')}"></label>`;}).join('')}</div>
      <div class="audiobar">
        <div class="scene"><span class="scene__lbl">読み上げ速度</span><div class="scene__b" id="invSpd">${speeds.map(([nm,r])=>`<button type="button" data-r="${r}" class="${r==spd?'on':''}">${esc(nm)}</button>`).join('')}</div></div>
        <div class="audioctl">
          <button type="button" class="actl" id="btnSpeakPause">⏸ 一時停止</button>
          <button type="button" class="actl" id="btnSpeakResume" style="display:none">▶ 再開</button>
          <button type="button" class="actl actl--stop" id="btnSpeakStop">⏹ 停止</button>
        </div>
      </div>
      <div class="handover">
        <label class="handover__lbl">前日担当者からの申し送り（物品）</label>
        <textarea id="invHandover" placeholder="">${esc(st.handover)}</textarea>
        <button type="button" class="dangerbtn" id="invClear">前日のチェックを全削除</button>
      </div>
      ${(!d.bags||!d.bags.length)?'<div class="proto-note warn">物品データを読み込めませんでした。ページを再読込してください（Ctrl+F5）。</div>':''}
      ${(d.bags||[]).map(b=>{const sections=b.sections||[];return `<div class="bag">
        <div class="bag__h"><span>${esc(b.bag)}</span><button type="button" class="say" data-say="${escAttr(b.bag+'。'+sections.map(s=>s.s+'、'+(s.items||[]).map(it=>it.y||it.n).join('、')).join('。'))}">▶ 全体読み上げ</button></div>
        ${sections.map(s=>{const items=s.items||[];const folded=!!st.collapsed[sk(b.bag,s.s)];return `<div class="sect ${folded?'sect--folded':''}" data-sk="${escAttr(sk(b.bag,s.s))}">
          <div class="sect__h"><button type="button" class="sect__toggle" data-sk="${escAttr(sk(b.bag,s.s))}"><span class="sect__chev">${folded?'＋':'−'}</span>${esc(s.s)}</button><button type="button" class="sectall" data-sk="${escAttr(sk(b.bag,s.s))}">全✓</button><button type="button" class="say" data-say="${escAttr(s.s+'。'+items.map(it=>it.y||it.n).join('、'))}">▶</button></div>
          <div class="sect__items">${items.map(it=>{const k=key(b.bag,s.s,it.n);return `<label class="chk"><input type="checkbox" data-k="${escAttr(k)}" ${st.checks[k]?'checked':''}><span class="chk__n">${esc(it.n)}</span></label>`;}).join('')}</div></div>`;}).join('')}
        <div class="bagnote"><label>Note（不足・交換など）</label><textarea data-note="${escAttr(b.bag)}" placeholder="">${esc(st.notes[b.bag]||'')}</textarea></div>
      </div>`;}).join('')}
      <div class="logibtns"><button type="button" class="bigbtn" id="invSend">スプレッドシートに送信</button>
        <button type="button" class="logisub" id="invCsv">CSVダウンロード</button><button type="button" class="logisub" id="invCfg">⚙ 送信先設定</button><button type="button" class="logisub" id="invMaster">📋 物品マスターURL</button></div>
      <div id="invMsg" class="logimsg"></div>`;
    const msg=(t,c)=>{const m=R.querySelector('#invMsg');m.textContent=t;m.className='logimsg'+(c?' '+c:'');};
    /* 速度 */
    R.querySelector('#invSpd').querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{
      spd=parseFloat(btn.dataset.r);localStorage.setItem(INVENTORY_SPD,spd);
      R.querySelector('#invSpd').querySelectorAll('button').forEach(x=>x.classList.remove('on'));btn.classList.add('on');speak('速度'+(btn.textContent),spd);}));
    /* 音声 一時停止 / 再開 / 停止 */
    const bPause=R.querySelector('#btnSpeakPause'),bResume=R.querySelector('#btnSpeakResume'),bStop=R.querySelector('#btnSpeakStop');
    bPause.addEventListener('click',()=>{try{speechSynthesis.pause();}catch(e){} bPause.style.display='none';bResume.style.display='inline-block';});
    bResume.addEventListener('click',()=>{try{speechSynthesis.resume();}catch(e){} bResume.style.display='none';bPause.style.display='inline-block';});
    bStop.addEventListener('click',()=>{try{speechSynthesis.cancel();}catch(e){} bResume.style.display='none';bPause.style.display='inline-block';});
    /* セクション読み上げ・全体読み上げ */
    R.querySelectorAll('.say').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();speak(b.dataset.say,spd);}));
    /* セクション折り畳み */
    R.querySelectorAll('.sect__toggle').forEach(btn=>btn.addEventListener('click',()=>{
      const id=btn.dataset.sk;const sect=R.querySelector('.sect[data-sk="'+CSS.escape(id)+'"]');
      const now=sect.classList.toggle('sect--folded');st.collapsed[id]=now;save();
      btn.querySelector('.sect__chev').textContent=now?'＋':'−';}));
    /* チェック・メタ・Note・申し送り */
    R.querySelectorAll('input[data-k]').forEach(c=>c.addEventListener('change',()=>{st.checks[c.dataset.k]=c.checked;save();}));
    /* セクション一括チェック/解除（トグル） */
    R.querySelectorAll('.sectall').forEach(btn=>btn.addEventListener('click',()=>{
      const sect=R.querySelector('.sect[data-sk="'+CSS.escape(btn.dataset.sk)+'"]');
      const boxes=sect.querySelectorAll('input[data-k]');
      const allOn=Array.from(boxes).every(c=>c.checked);
      boxes.forEach(c=>{c.checked=!allOn;st.checks[c.dataset.k]=!allOn;});
      save();}));
    R.querySelectorAll('input[data-meta]').forEach(i=>['input','change'].forEach(ev=>i.addEventListener(ev,()=>{st.meta[i.dataset.meta]=i.value;save();})));
    R.querySelectorAll('textarea[data-note]').forEach(t=>t.addEventListener('input',()=>{st.notes[t.dataset.note]=t.value;save();}));
    R.querySelector('#invHandover').addEventListener('input',e=>{st.handover=e.target.value;save();});
    /* 前日チェック全削除 */
    R.querySelector('#invClear').addEventListener('click',()=>{
      if(!confirm('前日のチェック（全項目のチェック）を全て外します。よろしいですか？\n※申し送りメモ・バッグNoteは保持されます。')) return;
      st.checks={};save();
      R.querySelectorAll('input[data-k]').forEach(c=>{c.checked=false;});
      msg('前日のチェックを全削除しました');});
    /* CSV/送信 ヘッダ・行 */
    const HEAD = ['日時', ...(d.meta || []), '申し送り'];
    (d.bags || []).forEach(b => { HEAD.push(`Note: ${b.bag}`); });
    (d.bags || []).forEach(b => {
      (b.sections || []).forEach(s => {
        (s.items || []).forEach(it => {
          HEAD.push(`[${b.bag}] ${s.s} > ${it.n}`);
        });
      });
    });
    const rows = () => {
      const ts = new Date().toLocaleString('ja-JP');
      const meta = (d.meta || []).map((m, i) => st.meta[i] || '');
      const row = [ts, ...meta, st.handover || ''];
      (d.bags || []).forEach(b => { row.push(st.notes[b.bag] || ''); });
      (d.bags || []).forEach(b => {
        (b.sections || []).forEach(s => {
          (s.items || []).forEach(it => {
            const k = key(b.bag, s.s, it.n);
            row.push(st.checks[k] ? 'OK' : '');
          });
        });
      });
      return [row];
    };
    R.querySelector('#invCsv').addEventListener('click', () => {
      const csv = [HEAD, ...rows()].map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
      const a = document.createElement('a'); a.href = url; a.download = '物品点検.csv'; a.click(); URL.revokeObjectURL(url); msg('CSVを保存しました');
    });
    const appName = location.pathname.includes('DrHeli-Do-O') || location.hostname.includes('teinekeijinkaier.github.io') ? 'DrHeli-Do-O' : 'DO-O';
    const payload = () => ({ app: appName, sentAt: new Date().toISOString(), header: HEAD, rows: rows() });
    const sendFetch = (ep, data) => fetch(ep, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'payload=' + encodeURIComponent(JSON.stringify(data))
    });
    R.querySelector('#invCfg').addEventListener('click', () => {
      const cur = endpoint();
      const v = prompt('Apps Script ウェブアプリ URL（script.google.com/macros/s/…/exec）を入力。スプレッドシートのURLは不可', cur);
      if (v === null) return;
      const u = v.trim();
      if (u && !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(u)) {
        msg('そのURLは受け口ではありません。Apps Scriptを「ウェブアプリ」公開して得た script.google.com/macros/s/…/exec を入れてください（スプレッドシートのURLは不可）', 'warn'); return;
      }
      localStorage.setItem(INVENTORY_EP, u); msg('送信先URLを保存しました');
    });
    R.querySelector('#invSend').addEventListener('click', () => {
      const ep = endpoint();
      if (!ep) { msg('先に「⚙ 送信先設定」でURLを設定してください（CSVダウンロードも可）', 'warn'); return; }
      if (/docs\.google\.com\/spreadsheets/.test(ep)) { msg('送信先がスプレッドシートのURLになっています。Apps Scriptの …/exec URL に設定し直してください', 'warn'); return; }
      msg('送信中...');
      sendFetch(ep, payload())
        .then(() => msg('スプレッドシートに送信しました。シートをご確認ください'))
        .catch(e => { console.error(e); msg('送信に失敗しました。通信とURLをご確認ください', 'warn'); });
    });
    /* 物品マスターURL設定 */
    R.querySelector('#invMaster').addEventListener('click', () => {
      const cur = masterUrl_(d);
      const v = prompt('物品マスターのCSV公開URL\n（Googleスプレッドシート→ファイル→共有→ウェブに公開→CSV、または .../gviz/tq?tqx=out:csv&sheet=シート名）\n空欄で解除（同梱データに戻す）', cur);
      if (v === null) return;
      localStorage.setItem(INVENTORY_MASTER_URL, v.trim());
      invMasterDone = false;
      msg(v.trim() ? '物品マスターURLを保存しました。最新を取得します…' : '物品マスターURLを解除しました（次回は同梱データ）');
      rInventory();
    });
    /* オンライン時にマスターを取得して最新化（変われば再描画） */
    if (!invMasterDone && masterUrl_(d)) {
      invMasterDone = true;
      refreshMaster_(d).then(changed => { if (changed) rInventory(); });
    }
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

  async function open(id){
    if(!root(id)) return;
    await load(id);
    ({beginner:rBeginner,expert:rExpert,inventory:rInventory,quiz:rQuiz,stats:rStats}[id]||(()=>{}))();
  }
  return { open };
})();
