/* 薬剤モードの計算（計算体重・投与量・液量・流量・調製文）と正本の検証。
   ブラウザ(drugs.js)と Node(文書・アプリ用データの生成、検証)の両方から使う単一ソース。
   classic script として読み込むとグローバル DrugCalc を定義する。
   Node からは scripts/drug-calc.mjs が読み込んで再エクスポートする。
   ここに Node 専用 API や DOM 操作を書かないこと(ブラウザで落ちる)。 */

const DrugCalc = (() => {
  const FACTOR = { g: 1e6, mg: 1e3, 'μg': 1 };
  const SEX = { male: '男性', female: '女性' };
  const EPS = 1e-9;
  const MIN_VOLUME_ML = 0.05;

  // ---------- 数値の整形 ----------

  const trim = (n, digits) => String(Number(n.toFixed(digits)));
  const fmtDose = x => x >= 100 ? trim(x, 0) : x >= 10 ? trim(x, 1) : x >= 1 ? trim(x, 2) : trim(x, 3);
  const fmtVol = x => x >= 10 ? trim(x, 1) : trim(x, 2);
  const same = (a, b) => Math.abs(a - b) < EPS;
  const range = (lo, hi, fmt, unit = '') => hi == null || same(lo, hi) ? `${fmt(lo)}${unit}` : `${fmt(lo)}〜${fmt(hi)}${unit}`;
  /* 1000μg以上は mg で表示する（例：1000〜2000μg → 1〜2mg） */
  const amountRange = (lo, hi, unit) => unit === 'μg' && lo >= 1000
    ? range(lo / 1000, hi == null ? null : hi / 1000, fmtDose, 'mg')
    : range(lo, hi, fmtDose, unit);

  // ---------- 調製 ----------

  const convert = (x, from, to) => x * FACTOR[from] / FACTOR[to];

  function pickPrep(prep, kg) {
    if (!prep) return null;
    if (!Array.isArray(prep)) return prep;
    return prep.find(p => p.maxKg == null || kg <= p.maxKg);
  }

  const prepTotal = p => p.stock.ml + (p.diluent ? p.diluent.ml : 0);
  const prepConc = (p, unit) => convert(p.stock.amount, p.stock.unit, unit) / prepTotal(p);
  const stockName = drug => drug.prepName || drug.name.replace(/（.*）$/, '');

  function prepLine(drug, p, unit) {
    const c = prepConc(p, unit);
    const conc = unit === 'μg' && c >= 1000 ? `${fmtDose(c / 1000)}mg/mL` : `${fmtDose(c)}${unit}/mL`;
    const note = p.note ? `。${p.note}` : '';
    if (!p.diluent) return `原液（${conc}）${note}`;
    return `${stockName(drug)}${fmtDose(p.stock.amount)}${p.stock.unit}（${fmtVol(p.stock.ml)}mL）＋${p.diluent.name}${fmtVol(p.diluent.ml)}mL＝${fmtVol(prepTotal(p))}mL（${conc}）${note}`;
  }

  // ---------- 計算体重 ----------

  /* 年齢（整数の歳）から、キリのいい平均的な体重を引く。表にない年齢は null */
  function ageWeight(age, meta) {
    if (!Number.isInteger(age)) return null;
    return meta.pedsAgeWeights.find(x => x.ageYears === age) || null;
  }
  /* 指定したキリのいい値は「目安体重」、統計の平均を四捨五入した値は「平均体重」と呼ぶ */
  const ageWeightName = aw => aw.kind === 'average' ? '平均体重' : '目安体重';

  /* input: 成人 { kind:'adult', sex:'male'|'female', weight?:number }
            小児 { kind:'peds', weight?:number, age?:number }
     体重の入力があれば必ずそれを使う。無ければ成人は性別の既定値、小児は年齢の平均的な体重。 */
  function resolvePatient(input, meta) {
    const has = v => v != null && v !== '';
    if (input.kind === 'adult') {
      const def = meta.adultDefaults[input.sex];
      if (!def) return { error: '性別を選んでください' };
      const [min, max] = meta.adultWeightRange;
      if (has(input.weight)) {
        const kg = Number(input.weight);
        if (!(kg >= min && kg <= max)) return { error: `推定体重は${min}〜${max}kgで入力してください` };
        return { kind: 'adult', sex: input.sex, kg, source: 'input',
          title: `成人・${SEX[input.sex]}`, label: `推定体重${fmtDose(kg)}kgで計算` };
      }
      return { kind: 'adult', sex: input.sex, kg: def, source: 'default',
        title: `成人・${SEX[input.sex]}`, label: `体重${def}kg（${SEX[input.sex]}の既定値）で計算` };
    }
    const ages = meta.pedsAgeWeights;
    const [minAge, maxAge] = [ages[0].ageYears, ages[ages.length - 1].ageYears];
    const age = has(input.age) ? Number(input.age) : null;
    const aw = age == null ? null : ageWeight(age, meta);
    if (age != null && !aw)
      return { error: `年齢は${minAge}〜${maxAge}歳から選んでください（それ以外は体重を入力）` };
    const title = age == null ? '小児' : `小児・${age}歳`;
    if (has(input.weight)) {
      const kg = Number(input.weight);
      const [min, max] = meta.pedsWeightRange;
      if (!(kg >= min && kg <= max)) return { error: `体重は${min}〜${max}kgで入力してください` };
      return { kind: 'peds', kg, ageYears: age, source: 'input', title, label: `体重${fmtDose(kg)}kgで計算` };
    }
    if (aw) return { kind: 'peds', kg: aw.kg, ageYears: age, source: 'age', title,
      label: `${age}歳の${ageWeightName(aw)}${fmtDose(aw.kg)}kgで計算` };
    return { error: '年齢か体重を入力してください' };
  }

  // ---------- 用法ごとの計算 ----------

  function giveLine(use, r, diluted) {
    const how = `${use.over || ''}${use.give}`;
    const amount = `${r.volText}（${r.doseText}）`;
    if (r.isLimit) return `総量の上限 ${amount}`;
    if (r.whole) return `全量 ${amount}を${how}`;
    return `${diluted ? 'このうち ' : ''}${amount}${r.upTo ? '以下' : ''}を${how}`;
  }

  /* 返り値の status: ok（計算できた）| text（計算しない用法）| minAge（年齢で使えない） */
  function calcUse(drug, use, patient) {
    const d = use.dosing;
    const kg = patient.kg;
    const base = { mode: d.mode, weightBased: ['perKg', 'infusion', 'timed'].includes(d.mode) };
    if (use.minAge != null && patient.kind === 'peds' && patient.ageYears != null && patient.ageYears < use.minAge)
      return { ...base, status: 'minAge', message: `${use.minAge}歳未満には使わない` };
    const ageCheck = use.minAge != null && patient.kind === 'peds' && patient.ageYears == null
      ? `${use.minAge}歳未満には使わない。年齢を確認してください` : '';
    const p = pickPrep(use.prep, kg);

    if (d.mode === 'text')
      return { ...base, status: 'text', ageCheck, prepLine: p ? prepLine(drug, p, p.stock.unit) : '' };

    const unit = d.unit;
    const conc = prepConc(p, unit);
    if (d.mode === 'timed') {
      /* 調製した全量を決まった時間で点滴する。流量と、体重あたりの投与速度を出す */
      const total = prepTotal(p);
      const amount = convert(p.stock.amount, p.stock.unit, unit);
      const mgPerMl = convert(p.stock.amount, p.stock.unit, 'mg') / total;
      return { ...base, status: 'ok', ageCheck, prepLine: prepLine(drug, p, unit), rateUnit: d.rateUnit, totalMl: total,
        concText: `濃度 ${fmtDose(conc)}${unit}/mL（${Number((mgPerMl / 10).toPrecision(2))}%）`,
        timed: d.durations.map(min => ({ min, rate: total * 60 / min, perKgMin: amount / min / kg })),
        formula: `全量${fmtVol(total)}mL（${fmtDose(p.stock.amount)}${p.stock.unit}）を投与時間で点滴。${d.rateUnit} ＝ ${fmtDose(amount)}${unit} ÷ 分 ÷ ${fmtDose(kg)}kg` };
    }
    if (d.mode === 'infusion') {
      const perHour = d.perMinute ? 60 : 1;
      return { ...base, status: 'ok', ageCheck, prepLine: prepLine(drug, p, unit), rateUnit: d.rateUnit,
        rates: d.levels.map(level => ({ level, rate: level * kg * perHour / conc })),
        formula: `流量（mL/時）＝ ${d.rateUnit} × ${fmtDose(kg)}kg${perHour === 60 ? ' × 60' : ''} ÷ ${fmtDose(conc)}${unit}/mL` };
    }

    let lo, hi = null, capped = false, formula = '';
    if (d.mode === 'fixed') {
      lo = d.amount;
      hi = d.amountHi ?? null;
    } else {
      const cap = perKg => {
        const raw = perKg * kg;
        if (d.max != null && raw > d.max + EPS) { capped = true; return d.max; }
        return raw;
      };
      lo = cap(d.perKg);
      hi = d.perKgHi != null ? cap(d.perKgHi) : null;
      formula = `${range(d.perKg, d.perKgHi, fmtDose)}${unit}/kg × ${fmtDose(kg)}kg`;
    }
    const total = prepTotal(p);
    const volLo = lo / conc;
    const volHi = hi == null ? null : hi / conc;
    const r = {
      ...base, status: 'ok', ageCheck, unit, capped,
      dose: { lo, hi }, vol: { lo: volLo, hi: volHi },
      doseText: amountRange(lo, hi, unit), volText: `${range(volLo, volHi, fmtVol)}mL`,
      upTo: !!d.upTo, isLimit: !!d.isLimit,
      whole: !!p.diluent && hi == null && Math.abs(volLo - total) <= total * 0.005,
      batches: p.diluent && (volHi ?? volLo) > total + EPS ? Math.ceil((volHi ?? volLo) / total - EPS) : 1,
      tooSmall: volLo < MIN_VOLUME_ML - EPS,
      vials: d.vialDose ? range(Math.ceil(lo / d.vialDose - EPS), hi == null ? null : Math.ceil(hi / d.vialDose - EPS), String, '本') : '',
      vialDose: d.vialDose || null,
      prepLine: prepLine(drug, p, unit),
    };
    if (formula) r.formula = `${formula} ＝ ${r.doseText}${capped ? `（1回上限${fmtDose(d.max)}${unit}で頭打ち）` : ''}`;
    r.giveLine = giveLine(use, r, !!p.diluent);
    return r;
  }

  /* 1つの用法を複数の場面に出す（例：ミダゾラム「気管挿管、痙攣重積」） */
  const scenesOf = use => [use.scene, ...(use.extraScenes || [])];
  const sceneMatches = (use, scene) => scenesOf(use).includes(scene);

  // ---------- 正本の検証 ----------

  const MODES = ['fixed', 'perKg', 'infusion', 'timed', 'text'];
  const PEDS_STATUS = ['use', 'avoid', 'notApplicable'];

  function validate(data) {
    const { meta, drugs } = data;
    const errors = [];
    const push = msg => errors.push(msg);

    if (!meta.adultDefaults || !(meta.adultDefaults.male > 0) || !(meta.adultDefaults.female > 0)) push('meta.adultDefaults に male・female の体重が必要');
    for (const key of ['adultWeightRange', 'pedsWeightRange'])
      if (!Array.isArray(meta[key]) || meta[key].length !== 2 || !(meta[key][0] < meta[key][1])) push(`meta.${key} は [下限, 上限]`);
    const ageWeights = meta.pedsAgeWeights || [];
    if (!ageWeights.length) push('meta.pedsAgeWeights（年齢別の目安体重）が空');
    ageWeights.forEach((a, i) => {
      if (!Number.isInteger(a.ageYears) || a.ageYears < 1 || (i && a.ageYears !== ageWeights[i - 1].ageYears + 1))
        push(`pedsAgeWeights#${i + 1}: 年齢は1歳以上の整数を1歳刻みで並べる`);
      if (!(a.kg > 0)) push(`pedsAgeWeights#${i + 1}: kg が必要`);
      if (!['set', 'average'].includes(a.kind)) push(`pedsAgeWeights#${i + 1}: kind は set（指定値）か average（平均の四捨五入）`);
      if (i && a.kg < ageWeights[i - 1].kg) push(`pedsAgeWeights#${i + 1}: 年齢が上がって体重が減っている`);
    });

    const adultKgs = [...new Set([...meta.adultRefWeights, meta.adultDefaults?.male, meta.adultDefaults?.female, ...(meta.adultWeightRange || [])])].filter(x => x > 0);
    const pedsPatients = [...meta.pedsWeights, ...ageWeights].map(w => ({ kind: 'peds', kg: w.kg, ageYears: w.ageYears }));
    const ids = new Set();

    const checkPrep = (drug, p, where) => {
      if (!p.stock || !(p.stock.amount > 0) || !(p.stock.ml > 0) || !FACTOR[p.stock.unit]) return push(`${where}: prep.stock に amount・unit・ml が必要`);
      if (p.diluent && (!p.diluent.name || !(p.diluent.ml > 0))) push(`${where}: prep.diluent に name・ml が必要`);
      const s = drug.spec;
      if (s && s.amount != null && Math.abs(convert(p.stock.amount, p.stock.unit, s.unit) / p.stock.ml - s.amount / s.ml) > 1e-6)
        push(`${where}: 原液の濃度が規格（${s.text}）と一致しない`);
    };

    const checkUse = (drug, use, where, patients) => {
      const d = use.dosing;
      for (const s of scenesOf(use)) if (!meta.sceneOrder.includes(s)) push(`${where}: 未知のシーン「${s}」`);
      if (!meta.basisLabels[use.basis]) push(`${where}: 未知の根拠「${use.basis}」`);
      if (!use.title || !use.source) push(`${where}: title・source が必要`);
      if (!d || !MODES.includes(d.mode)) return push(`${where}: dosing.mode が不正`);
      const preps = use.prep == null ? [] : Array.isArray(use.prep) ? use.prep : [use.prep];
      if (Array.isArray(use.prep) && use.prep[use.prep.length - 1].maxKg != null) push(`${where}: prep 配列の最後は maxKg なし（全体重をカバー）にする`);
      preps.forEach(p => checkPrep(drug, p, where));
      if (d.mode !== 'text') {
        if (!preps.length) push(`${where}: 計算する用法には prep が必要`);
        if (!FACTOR[d.unit]) push(`${where}: dosing.unit が不正`);
        if (!use.give && !['infusion', 'timed'].includes(d.mode)) push(`${where}: give（投与方法）が必要`);
      }
      if (d.mode === 'fixed' && !(d.amount > 0 && (d.amountHi == null || d.amountHi > d.amount))) push(`${where}: fixed の amount が不正`);
      if (d.mode === 'perKg' && !(d.perKg > 0 && (d.perKgHi == null || d.perKgHi > d.perKg) && (d.max == null || d.max > 0))) push(`${where}: perKg の値が不正`);
      if (d.mode === 'infusion' && !(d.rateUnit && Array.isArray(d.levels) && d.levels.length && typeof d.perMinute === 'boolean')) push(`${where}: infusion に rateUnit・levels・perMinute が必要`);
      if (d.mode === 'timed' && !(d.rateUnit && Array.isArray(d.durations) && d.durations.length && d.durations.every(x => x > 0))) push(`${where}: timed に rateUnit・durations（分）が必要`);
      if (d.mode === 'timed' && preps.some(p => !p.diluent)) push(`${where}: timed は希釈した全量を点滴する用法（diluent が必要）`);
      if (errors.length || d.mode === 'text') return;
      for (const pt of patients) {
        const r = calcUse(drug, use, pt);
        if (r.status !== 'ok') continue;
        const nums = r.rates ? r.rates.map(x => x.rate)
          : r.timed ? r.timed.flatMap(x => [x.rate, x.perKgMin])
          : [r.dose.lo, r.dose.hi, r.vol.lo, r.vol.hi].filter(x => x != null);
        if (nums.some(n => !Number.isFinite(n) || n <= 0)) push(`${where}: ${pt.kg}kg で計算できない`);
      }
    };

    for (const drug of drugs) {
      if (ids.has(drug.id)) push(`${drug.id}: id が重複`);
      ids.add(drug.id);
      if (!Array.isArray(drug.onboard) || !drug.onboard.length) push(`${drug.id}: onboard が空`);
      if (drug.kind === 'fluid') continue;
      for (const key of ['name', 'generic', 'category']) if (!drug[key]) push(`${drug.id}: ${key} がない`);
      for (const key of ['indications', 'contraindications', 'warnings', 'interactions', 'cautions', 'adverse', 'insert'])
        if (!Array.isArray(drug[key])) push(`${drug.id}: ${key} は配列にする`);
      if (!drug.label || !drug.label.adult) push(`${drug.id}: label.adult（添付文書上の用法・用量）がない`);
      if (!drug.adult?.uses?.length) push(`${drug.id}: 成人の用法がない`);
      (drug.adult?.uses || []).forEach((u, i) =>
        checkUse(drug, u, `${drug.id} 成人#${i + 1}`, adultKgs.map(kg => ({ kind: 'adult', kg }))));
      const st = drug.peds?.status;
      if (!PEDS_STATUS.includes(st)) push(`${drug.id}: peds.status が不正`);
      if (st === 'use' && !drug.peds.uses?.length) push(`${drug.id}: 小児 use なのに用法がない`);
      if (st === 'use' && !drug.label?.peds) push(`${drug.id}: label.peds（添付文書上の小児の用法・用量）がない`);
      if (st !== 'use' && !drug.peds?.note) push(`${drug.id}: 小児で使わない理由（note）がない`);
      (drug.peds?.uses || []).forEach((u, i) => {
        const where = `${drug.id} 小児#${i + 1}`;
        if (u.dosing?.mode === 'fixed') push(`${where}: 小児に固定量は使わない（perKg にする）`);
        checkUse(drug, u, where, pedsPatients);
      });
    }
    if (errors.length) throw new Error(`drugs.json に不備があります:\n- ${errors.join('\n- ')}`);
  }

  return { FACTOR, SEX, MIN_VOLUME_ML, fmtDose, fmtVol, pickPrep, prepTotal, prepConc, prepLine, ageWeight, ageWeightName, resolvePatient, calcUse, scenesOf, sceneMatches, validate };
})();
