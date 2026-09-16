/* 薬剤モード: 対象 → 成人（性別・推定体重）／小児（年齢・体重）→ 薬剤選択 → 薬剤画面 → 添付文書詳細。
   投与量の計算は drug-calc.js（文書生成と共通）。2026-09-15 医師監修済み。
   患者情報（性別・体重・年齢）はメモリ上だけに持ち、保存・送信しない。 */
const DrugsMode = (() => {
  const root = () => document.getElementById('drugs-root');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const li = items => items.map(x => `<li>${esc(x)}</li>`).join('');
  const C = DrugCalc;

  let data = null;
  let input = null;       // 確定した入力（「変更」で入力画面に戻したときの初期値）
  let patient = null;     // DrugCalc.resolvePatient の結果
  let form = null;        // 入力画面で編集中の値
  let selectedId = '';
  let query = '';
  let scene = '';
  let checkOpen = false;  // 投与前確認を開いているか（薬剤を選び直すと閉じる）
  let stack = ['start'];  // 画面の履歴。ヘッダーの←で1段階ずつ戻す

  async function load() {
    if (data) return true;
    try {
      const r = await fetch('data/drugs.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(String(r.status));
      data = await r.json();
      return true;
    } catch { return false; }
  }

  // ---------- 画面の切り替え ----------

  const SCREENS = { start: startScreen, adult: adultForm, peds: pedsForm, list: listScreen, drug: drugScreen, detail: detailScreen };

  function render(scroll = true) {
    SCREENS[stack[stack.length - 1]]();
    if (scroll) window.scrollTo(0, 0);
  }
  function go(name) { stack.push(name); render(); }
  function back() {
    if (stack.length <= 1) return false;
    stack.pop();
    render();
    return true;
  }
  function toList() {
    while (stack.length > 1 && stack[stack.length - 1] !== 'list') stack.pop();
    render();
  }

  function shell(html) { root().innerHTML = `<div class="drug-app">${html}</div>`; }
  const $ = sel => root().querySelector(sel);
  const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };
  const onAll = (sel, fn) => root().querySelectorAll(sel).forEach(el => el.addEventListener('click', () => fn(el)));

  const head = (kicker, title, sub) =>
    `<header class="drug-title drug-title--compact"><p>${esc(kicker)}</p><h2>${esc(title)}</h2>${sub ? `<span>${esc(sub)}</span>` : ''}</header>`;

  function draft() {
    const m = data.meta;
    return `<div class="drug-draft-light"><b>${esc(m.status)}</b><span>更新 ${esc(m.updated)} ／ 添付文書確認 ${esc(m.insertCheckedOn)}</span><small>現場使用前に必ず医師が確認してください</small></div>`;
  }

  function patientBar() {
    return `<div class="drug-patient"><div><b>${esc(patient.title)}</b><span>${esc(patient.label)}</span></div><button type="button" data-change>変更</button></div>`;
  }
  function bindPatientBar() {
    on('[data-change]', 'click', () => { form = { ...input }; stack = ['start', input.kind]; render(); });
  }

  const selectButton = extra => `<button type="button" class="drug-select ${extra || ''}" data-select>‹ 薬剤選択</button>`;
  const selectBar = () => `<div class="drug-select-bar">${selectButton()}</div>`;
  function bindSelect() { onAll('[data-select]', toList); }

  // ---------- ① 対象 ----------

  function startScreen() {
    const kept = patient
      ? `<div class="drug-kept"><p>前回の設定</p><strong>${esc(patient.title)}</strong><span>${esc(patient.label)}</span><button type="button" class="drug-primary" data-continue>この設定で薬剤選択へ</button></div>`
      : '';
    shell(`<header class="drug-title"><p>EMERGENCY DRUG GUIDE</p><h2>薬剤モード</h2><span>対象を選択してください</span></header>${draft()}${kept}
      <div class="patient-choices">
        <button type="button" data-kind="adult"><strong>成人</strong><span>性別と推定体重を入力</span></button>
        <button type="button" data-kind="peds"><strong>小児</strong><span>年齢または体重を入力</span></button>
      </div>`);
    on('[data-continue]', 'click', () => { stack = ['start', 'list']; render(); });
    onAll('[data-kind]', b => {
      const kind = b.dataset.kind;
      form = input && input.kind === kind ? { ...input } : { kind };
      go(kind);
    });
  }

  // ---------- ②a 成人：性別・推定体重 ----------

  function adultForm() {
    const m = data.meta;
    const f = form && form.kind === 'adult' ? form : (form = { kind: 'adult' });
    const [min, max] = m.adultWeightRange;
    shell(`${head('ADULT', '成人', '性別を選び、分かれば推定体重を入力してください')}
      <form class="patient-form" id="patient-form" novalidate>
        <fieldset><legend>性別</legend>
          <div class="sex-choices">${['male', 'female'].map(s => `<button type="button" data-sex="${s}" aria-pressed="${f.sex === s}" class="${f.sex === s ? 'on' : ''}"><strong>${C.SEX[s]}</strong><span>未入力なら${m.adultDefaults[s]}kgで計算</span></button>`).join('')}</div>
        </fieldset>
        <label class="weight-field">推定体重（任意）
          <div><input id="weight" type="number" inputmode="decimal" min="${min}" max="${max}" step="1" value="${esc(f.weight ?? '')}" placeholder="未入力"><b>kg</b></div>
        </label>
        <p class="form-hint">${min}〜${max}kg。未入力なら男性${m.adultDefaults.male}kg・女性${m.adultDefaults.female}kgで計算します。体重によらない薬は、そのままの量を表示します。</p>
        <p class="form-error" id="form-error" role="alert"></p>
        <button type="submit" class="drug-primary drug-primary--wide">薬剤選択へ</button>
      </form>`);
    onAll('[data-sex]', b => { f.sex = b.dataset.sex; f.weight = $('#weight').value; render(false); });
    on('#patient-form', 'submit', e => {
      e.preventDefault();
      f.weight = $('#weight').value.trim();
      submitPatient({ kind: 'adult', sex: f.sex, weight: f.weight || null });
    });
  }

  // ---------- ②b 小児：年齢・体重 ----------

  function pedsForm() {
    const m = data.meta;
    const f = form && form.kind === 'peds' ? form : (form = { kind: 'peds' });
    const [min, max] = m.pedsWeightRange;
    const ages = m.pedsAgeWeights;
    const [minAge, maxAge] = [ages[0].ageYears, ages[ages.length - 1].ageYears];
    shell(`${head('PEDIATRIC', '小児', '年齢を選ぶか、体重を入力してください')}
      <form class="patient-form" id="patient-form" novalidate>
        <div class="weight-field"><span id="age-label">年齢</span>
          <div class="age-dial">
            <button type="button" class="age-dial__step" data-age-step="-1" aria-label="年齢を1歳下げる">−</button>
            <div class="age-dial__window" id="age-dial" role="spinbutton" tabindex="0" aria-labelledby="age-label" aria-describedby="age-weight" aria-valuemin="${minAge}" aria-valuemax="${maxAge}">
              <div class="age-dial__track" id="age-track">
                <div class="age-dial__item age-dial__item--none" data-age="">未選択</div>
                ${ages.map(a => `<div class="age-dial__item" data-age="${esc(a.ageYears)}">${esc(a.ageYears)}<small>歳</small></div>`).join('')}
              </div>
            </div>
            <button type="button" class="age-dial__step" data-age-step="1" aria-label="年齢を1歳上げる">＋</button>
          </div>
          <input type="hidden" id="age" value="${esc(f.age ?? '')}">
        </div>
        <p class="age-weight" id="age-weight" aria-live="polite"></p>
        <label class="weight-field">体重
          <div><input id="weight" type="number" inputmode="decimal" min="${min}" max="${max}" step="0.1" value="${esc(f.weight ?? '')}" placeholder="未入力"><b>kg</b></div>
        </label>
        <p class="form-hint">年齢はダイヤルを回すか −／＋ で選びます。体重を入力すれば体重で計算します。年齢だけのときは、1・3・6・9歳はキリのいい目安体重（10・15・20・30kg）、ほかの年齢は日本人の平均体重（四捨五入）で計算します。${minAge}歳未満と${maxAge + 1}歳以上は体重を入力してください。</p>
        <p class="form-error" id="form-error" role="alert"></p>
        <button type="submit" class="drug-primary drug-primary--wide">薬剤選択へ</button>
      </form>`);
    const showAgeWeight = () => {
      const age = $('#age').value.trim();
      const weight = $('#weight').value.trim();
      const el = $('#age-weight');
      const aw = age === '' ? null : C.ageWeight(Number(age), m);
      el.classList.toggle('is-muted', !!(aw && weight));
      el.classList.toggle('is-error', age !== '' && !aw);
      el.textContent = age === '' ? ''
        : !aw ? `${minAge}〜${maxAge}歳から選んでください`
        : weight ? `${age}歳の${C.ageWeightName(aw)}は${C.fmtDose(aw.kg)}kg（入力した体重を優先します）`
        : `${age}歳 → ${C.ageWeightName(aw)} ${C.fmtDose(aw.kg)}kg で計算します`;
    };

    /* 年齢ダイヤル：縦にスクロールして止まった位置の年齢を選ぶ。−／＋・タップ・矢印キーでも変更できる */
    const track = $('#age-track');
    const dial = $('#age-dial');
    const items = [...track.querySelectorAll('.age-dial__item')];
    const values = items.map(el => el.dataset.age);
    let idx = Math.max(0, values.indexOf(String(f.age ?? '')));
    const itemHeight = () => items[0].offsetHeight || 52;
    const setAge = (i, scroll) => {
      idx = Math.min(values.length - 1, Math.max(0, i));
      $('#age').value = values[idx];
      items.forEach((el, k) => el.classList.toggle('on', k === idx));
      dial.setAttribute('aria-valuetext', values[idx] ? `${values[idx]}歳` : '未選択');
      if (values[idx]) dial.setAttribute('aria-valuenow', values[idx]); else dial.removeAttribute('aria-valuenow');
      if (scroll) track.scrollTo({ top: idx * itemHeight(), behavior: scroll });
      showAgeWeight();
    };
    let settle;
    track.addEventListener('scroll', () => {
      clearTimeout(settle);
      settle = setTimeout(() => {
        const i = Math.round(track.scrollTop / itemHeight());
        if (i !== idx) setAge(i, null);
      }, 80);
    });
    items.forEach((el, k) => el.addEventListener('click', () => setAge(k, 'smooth')));
    onAll('[data-age-step]', b => setAge(idx + Number(b.dataset.ageStep), 'smooth'));
    dial.addEventListener('keydown', e => {
      const step = { ArrowUp: -1, ArrowDown: 1 }[e.key];
      if (!step) return;
      e.preventDefault();
      setAge(idx + step, 'smooth');
    });
    setAge(idx, 'auto');
    on('#weight', 'input', showAgeWeight);
    showAgeWeight();
    on('#patient-form', 'submit', e => {
      e.preventDefault();
      f.age = $('#age').value.trim();
      f.weight = $('#weight').value.trim();
      submitPatient({ kind: 'peds', weight: f.weight || null, age: f.age === '' ? null : f.age });
    });
  }

  function submitPatient(candidate) {
    const r = C.resolvePatient(candidate, data.meta);
    if (r.error) { $('#form-error').textContent = r.error; return; }
    input = { ...form };
    patient = r;
    stack = ['start', candidate.kind, 'list'];
    render();
  }

  // ---------- ③ 薬剤選択 ----------

  const usesOf = d => patient.kind === 'adult' ? d.adult : d.peds.uses;
  const pedsUnavailable = d => patient.kind === 'peds' && d.peds.status !== 'use';
  const hiddenForPatient = d => patient.kind === 'peds' && d.peds.hidden;
  const currentDrug = () => data.drugs.find(d => d.id === selectedId);

  function listScreen() {
    const scenes = data.meta.sceneOrder.filter(s => data.drugs.some(d => !pedsUnavailable(d) && usesOf(d).some(u => C.sceneMatches(u, s))));
    if (scene && !scenes.includes(scene)) scene = '';
    shell(`${patientBar()}${head(patient.kind === 'adult' ? 'ADULT' : 'PEDIATRIC', '薬剤選択', '')}
      <div class="drug-search">
        <input id="drug-search" type="search" value="${esc(query)}" placeholder="薬剤名・搭載名で探す" aria-label="薬剤名で探す">
        <select id="drug-scene" aria-label="使う場面"><option value="">すべての場面</option>${scenes.map(s => `<option ${s === scene ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      </div>
      <div id="drug-results"></div>`);
    bindPatientBar();
    fillList();
    on('#drug-search', 'input', e => { query = e.target.value; fillList(); });
    on('#drug-scene', 'change', e => { scene = e.target.value; fillList(); });
  }

  function fillList() {
    const q = query.trim().toLocaleLowerCase('ja');
    const match = d => (!q || [d.name, d.generic, ...d.onboard].join(' ').toLocaleLowerCase('ja').includes(q));
    const usable = data.drugs.filter(d => !hiddenForPatient(d) && !pedsUnavailable(d) && match(d) && (!scene || usesOf(d).some(u => C.sceneMatches(u, scene))));
    const off = scene ? [] : data.drugs.filter(d => !hiddenForPatient(d) && pedsUnavailable(d) && match(d));
    const item = (d, extra) => `<button type="button" data-drug="${esc(d.id)}" class="${extra ? 'off' : ''}"><span>${esc(d.category)}</span><strong>${esc(d.name)}</strong><small>${esc(extra || d.onboard.join('、'))}</small><i aria-hidden="true">›</i></button>`;
    $('#drug-results').innerHTML = `<p class="drug-list-count">${usable.length}種類</p>
      <div class="drug-name-list">${usable.map(d => item(d)).join('') || '<p class="drug-none">該当する薬剤がありません</p>'}</div>
      ${off.length ? `<p class="drug-group-label">小児では使わない・対象外</p><div class="drug-name-list">${off.map(d => item(d, '小児では使わない')).join('')}</div>` : ''}`;
    onAll('[data-drug]', b => { selectedId = b.dataset.drug; checkOpen = false; go('drug'); });
  }

  // ---------- ④ 薬剤画面 ----------

  function checkBlock(d) {
    const w = d.warnings, c = d.contraindications;
    return `<section class="drug-check ${checkOpen ? 'is-open' : ''}">
      <button type="button" class="drug-check__toggle" data-check aria-expanded="${checkOpen}" aria-controls="drug-check-body">
        <span class="drug-check__title">投与前確認</span>
        <span class="drug-check__count">禁忌 ${c.length}件${w.length ? `・警告 ${w.length}件` : ''}</span>
        <i aria-hidden="true">${checkOpen ? '閉じる ▲' : '開く ▼'}</i>
      </button>
      ${!checkOpen && w.length ? `<p class="drug-check__peek">⚠ ${esc(w[0])}</p>` : ''}
      <div id="drug-check-body" class="drug-check__body"${checkOpen ? '' : ' hidden'}>
        ${w.length ? `<h3>警告</h3><ul>${li(w)}</ul>` : ''}
        <h3>禁忌</h3>${c.length ? `<ul>${li(c)}</ul>` : '<p>添付文書に禁忌の記載なし</p>'}
        ${patient.kind === 'peds' && d.peds.cautions.length ? `<h3>小児での注意</h3><ul>${li(d.peds.cautions)}</ul>` : ''}
        <button type="button" class="drug-link" data-detail>相互作用・副作用・過量投与など全文を見る ›</button>
      </div>
    </section>`;
  }

  const step = (label, text) => `<div class="give-step"><span>${esc(label)}</span><b>${esc(text)}</b></div>`;

  function useCard(d, u, label) {
    const r = C.calcUse(d, u, patient);
    let main;
    if (r.status === 'minAge') {
      main = `<div class="drug-stop">${esc(r.message)}</div>`;
    } else if (r.status === 'text') {
      main = `<div class="give-box">${r.prepLine ? step('調製', r.prepLine) : ''}<p class="give-text">${esc(u.rule || '')}</p></div>`;
    } else if (r.timed) {
      main = `<div class="give-box">${step('① 調製', r.prepLine)}<div class="give-main"><span>② 全量を点滴</span></div>
        <div class="rate-grid">${r.timed.map(x => `<div><span>${esc(x.min)}分で点滴</span><b>${C.fmtVol(x.rate)} mL/時</b><small>${esc(C.fmtDose(x.perKgMin))} ${esc(r.rateUnit)}</small></div>`).join('')}</div></div>`;
    } else if (r.rates) {
      main = `<div class="give-box">${step('① 調製', r.prepLine)}<div class="give-main"><span>② シリンジポンプの流量</span></div>
        <div class="rate-grid">${r.rates.map(x => `<div><span>${esc(x.level)} ${esc(r.rateUnit)}</span><b>${C.fmtVol(x.rate)} mL/時</b></div>`).join('')}</div></div>`;
    } else {
      main = `<div class="give-box">${step('① 調製', r.prepLine)}<div class="give-main"><span>② 投与</span><strong>${esc(r.giveLine)}</strong>${r.vials ? `<em>${esc(r.vialDose)}${esc(r.unit)}製剤 ${esc(r.vials)}</em>` : ''}</div></div>`;
    }
    const warns = r.status === 'minAge' ? [] : [
      r.ageCheck,
      r.tooSmall ? `液量が${C.MIN_VOLUME_ML}mL未満です。さらに希釈してください` : '',
      r.batches > 1 ? `必要量が調製した量を超えます。この調製を${r.batches}回分用意してください` : '',
    ].filter(Boolean);
    const weightNote = r.status !== 'ok' ? '' : r.weightBased ? patient.label : '体重によらない量';
    const small = [
      r.concText || '',
      r.formula ? `計算：${r.formula}` : '',
      r.status === 'ok' && u.rule ? `用法の目安：${u.rule}` : '',
      u.repeat ? `反復・投与法：${u.repeat}` : '',
      u.insertNote ? `付記（添付文書）：${u.insertNote}` : label ? `添付文書上の用法・用量：${label}` : '',
      u.notes ? `補足：${u.notes}` : '',
      `出典：${u.source}`,
    ].filter(Boolean);
    return `<section class="emergency-use">
      <div class="use-head"><span>${esc(C.scenesOf(u).join('／'))}</span><b>${esc(data.meta.basisLabels[u.basis] || u.basis)}</b></div>
      <h3>${esc(u.title)}</h3>
      <p class="route">${esc(u.route)}</p>${weightNote ? `<p class="weight-note">${esc(weightNote)}</p>` : ''}
      ${main}
      ${warns.map(x => `<p class="drug-warn">⚠ ${esc(x)}</p>`).join('')}
      ${u.keyNote ? `<p class="drug-keynote">⚠ ${esc(u.keyNote)}</p>` : ''}
      ${u.tkhMemo ? `<div class="drug-tkh"><b>TKH救急メモ</b><p>${esc(u.tkhMemo)}</p></div>` : ''}
      <ul class="use-small">${li(small)}</ul>
    </section>`;
  }

  function drugScreen() {
    const d = currentDrug();
    let body;
    if (pedsUnavailable(d)) {
      body = `<div class="drug-stop">${esc(d.peds.note)}</div>`;
    } else {
      const uses = usesOf(d);
      const ordered = scene ? [...uses.filter(u => C.sceneMatches(u, scene)), ...uses.filter(u => !C.sceneMatches(u, scene))] : uses;
      const label = patient.kind === 'adult' ? d.label.adult : d.label.peds;
      body = ordered.map(u => useCard(d, u, label)).join('') || '<p class="drug-none">この対象に表示できる緊急用法がありません</p>';
    }
    shell(`${selectButton('drug-select--top')}${patientBar()}
      ${head(d.category, d.name, `${d.spec.text} ／ 搭載名 ${d.onboard.join('、')}`)}
      ${checkBlock(d)}${body}${selectBar()}`);
    bindPatientBar();
    bindSelect();
    on('[data-check]', 'click', () => { checkOpen = !checkOpen; render(false); });
    on('[data-detail]', 'click', () => go('detail'));
  }

  // ---------- 添付文書の詳細 ----------

  function detailScreen() {
    const d = currentDrug();
    const sec = (t, a, cls = '') => a && a.length ? `<section class="detail-sec ${cls}"><h3>${esc(t)}</h3><ul>${li(a)}</ul></section>` : '';
    shell(`${selectButton('drug-select--top')}${head('PACKAGE INSERT', d.name, '添付文書などの詳細')}
      ${sec('警告', d.warnings, 'warn')}${sec('禁忌', d.contraindications, 'stop')}
      ${sec('添付文書上の用法・用量', [d.label.adult, patient.kind === 'peds' ? `小児：${d.label.peds || '記載なし'}` : ''].filter(Boolean))}
      ${sec('効能・効果', d.indications)}${sec('相互作用', d.interactions)}${sec('重要な注意', d.cautions)}
      ${sec('重大な副作用など', d.adverse)}${sec('取扱い・投与時の注意', d.handling)}
      ${d.overdose ? `<section class="detail-sec"><h3>過量投与</h3><p>${esc(d.overdose)}</p></section>` : ''}
      <section class="detail-sec"><h3>添付文書（オンライン時のみ）</h3>${d.insert.map(i => `<a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${esc(i.name)} ↗</a>`).join('')}</section>
      <button type="button" class="drug-link drug-link--center" data-back-drug>‹ 投与量の画面に戻る</button>
      ${selectBar()}`);
    bindSelect();
    on('[data-back-drug]', 'click', back);
  }

  // ---------- 入口 ----------

  async function open() {
    root().innerHTML = '<div class="drug-loading">薬剤データを読み込み中…</div>';
    if (!(await load())) { root().innerHTML = '<div class="drug-loading">薬剤データを読み込めません</div>'; return; }
    stack = ['start'];
    render();
  }

  return { open, back };
})();
