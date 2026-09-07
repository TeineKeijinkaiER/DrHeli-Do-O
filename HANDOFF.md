# 道央ドクターヘリ 判断支援アプリ — 引き継ぎ書（AI/人 共通）

最終更新: 2026-09-07 / 対象: 次セッションの作業者（どのAIでも可）

---

## 0. 最重要・先に読むこと
1. **2つのリポジトリがある。両方を必ず同期する。**
   - `DO-O`（**非公開・正本**）: 全モード・全データ・分析資料・運航DBを含む。機密(患者/運航)情報あり。
   - `DrHeli-Do-O`（**公開・GitHub Pages**, https://github.com/TeineKeijinkaiER/DrHeli-Do-O）: 機密を含まない安全版。**地図(時間のみ)/ビギナー/インベントリー/クイズ の4モードのみ**。**エキスパート/統計/admin は含めない**（`data/expert-lessons.json` も置かない）。`DO-O/DrHeli-Do-O/` 配下にサブ作業ツリーとして存在（別 .git）。
2. **公開反映には GitHub への `git push` が必要**（このセッション群はローカルコミットのみ。push はユーザーが実施）。コミットしたら「push が必要」と必ず伝える。
3. **複数AIを同一リポジトリで同時に走らせない**（過去にファイル途中切れ・git index 破損が多発）。
4. **DrHeli-Do-O の git は index 破損が起きやすい**。コミットは必ず次の方式で：
   ```
   cd DrHeli-Do-O
   export GIT_INDEX_FILE=/tmp/idxXX; rm -f /tmp/idxXX; git read-tree HEAD
   git add <files>; git commit -m "..."
   ```
   破損時は `rm -f .git/index .git/index.lock; git reset --mixed <good-commit>` で復旧。
5. **DO-O の GitHub Pages 自動デプロイは無効化してある**(`.github/workflows/deploy.yml` は `workflow_dispatch` のみ)。DO-O の `pwa/` には `expert-lessons.json` / `stats.json` / `admin.html` が入っているため、**Pages を有効化すると機密が全世界公開になる**。戻さないこと。
6. **bashマウントとファイルツール(Read/Write/Edit)で内容がずれる/反映が遅延することがある**。データ/コードの確定編集は **bash(python heredoc)** で行うと mount と git が一致して安全。

---

## 1. アプリ概要
- 札幌・道央ドクターヘリ(基地: 手稲渓仁会病院 43.1123,141.2494)のクルー向け判断支援 PWA。
- 純HTML/CSS/Vanilla JS、ビルド不要。**オフライン最優先**（現場・機内は通信不可前提）。
- Service Worker でキャッシュ。`起動.cmd`(http://127.0.0.1:8080) でローカル起動。スマホは GitHub Pages + QR。

### モード構成（`pwa/js/app.js` の MODES）
map(地図) / beginner(ビギナー) / expert(**エキスパート**・**公開版なし**) / inventory(インベントリー) / quiz(クイズ) / stats(統計・**公開版なし**)。
エキスパートは `pwa/js/expert.js` が担当（`modes.js` から独立）。データは `data/expert-lessons.json`。
※「試作」バッジは撤去済み。

---

## 2. ファイル構成
```
DO-O/
  pwa/                     ← アプリ本体(正本)
    index.html  js/{app,map,modes}.js  css/style.css  sw.js  manifest.json
    js/expert.js               ← エキスパートモード(議事録由来の反省・注意事項)
    vendor/leaflet/            ← Leaflet 1.9.4 自前ホスト(CDN依存を排除・オフライン用)
    _headers                   ← Cloudflare Pages 用ヘッダ(GitHub Pages では無視される)
    admin.html  js/admin.js            ← コンテンツ編集ツール(非公開)
    data/{regions,inventory,beginner,quiz,expert-lessons,stats,operating-hours}.json
    物品マスター_テンプレート.csv         ← インベントリーをスプレッドシート化する雛形(91品目)
    物品モード_Google連携手順.md          ← Apps Script & 物品マスター運用手順
    起動.cmd
  myapp/data/
    combined_2020_2025/    ← 運航DB(2020-2025) ※後述の注意
    RP搬送時間入力.csv       ← 【正本】RP正確座標 + 救急車時間 + 近隣病院時間(管理者手入力)
  knowledge/lessons/       ← 【正本】反省・注意事項 1件1MD(80件・議事録由来)
  knowledge/analysis/      ← 分析資料(搬送時間の算出方法.md ほか)
  functions/_middleware.js ← 機密版の合言葉ログイン(Cloudflare Pages Functions)
                             ※リポジトリ直下。pwa/ の中ではない(Pages はルートで探すため)
  scripts/build-expert-data.mjs ← knowledge/lessons/*.md → pwa/data/expert-lessons.json
  scripts/lessons-lib.mjs       ← frontmatter 解析・個人名検出(純関数)
  scripts/migrate-lessons.mjs   ← 旧JSON→MD の移行記録(再実行不可)
  scripts/check.sh         ← sw.js / functions/ / lessons の健全性チェック(編集したら必ず実行)
  Cloudflare移行手順.md     ← Cloudflare Pages + Access 移行手順(非公開リポジトリのみ)
  DrHeli-Do-O/             ← 公開安全版(別 .git)
```

---

## 3. 地図モード（最重要機能）

### 3.0 ベースマップ（2026-09-07 変更）
- **地理院タイル淡色** `https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png` を既定。出典表記「国土地理院」必須。
- タイル取得失敗が4回続くと **OSM標準へ自動フォールバック**（`BASEMAPS` 配列＋`setBaseLayer()`。`map.js` 冒頭）。
- **CARTO は使用しない**。2025年にAPIキー必須化され、キー無しだとタイル画像に「API KEY REQUIRED」の透かしが焼き込まれて返るため。
- **Leaflet は `vendor/leaflet/` に自前ホスト**。unpkg CDN 依存を排除済み（オフライン最優先の方針）。CDNに戻さないこと。

`pwa/js/map.js`。`data/regions.json` を読む(SWは**ネットワーク優先**=オンラインなら常に最新)。
- ピン=市町村名、タップで詳細(RP名・搬送時間・近隣病院)。
- ⚠**反省・事例の表示は 2026-09-07 に削除した**。地域に関係のない内容が多く地図の文脈に合わないため、エキスパートモードへ集約した(下記 §4.5)。`case-lessons.json` も廃止。
- **現場滞在**は 10/15/20/25分から選択、**既定20分**。地域を切替えるたび20分に戻る(`openDetail`で`scene=20`)。
- ヘリ搬送(手稲渓仁会のみ) = 現場滞在 + 飛行 + 病院6分。

### 3.1 ヘリ飛行時間の推定（確定仕様）
- **採用ルール**: 実績のあるRPは **実績飛行時間の中央値** を採用（n・IQRを併記）。実績の無いRPは**回帰**を採用。**回帰値は全RPで参考値として併記**。
- **安全策**: `n<8 かつ |実績中央値−回帰| > 7分` のRPは回帰を採用（少数・距離不整合の外れ値対策。実績中央値は `heliFlightObsMed` に参考保持）。例: 石狩湾新港支署(8km・中央値17/n5→回帰7)。
- **回帰式(正確座標・RP集計)**: `飛行(分) = 4.66 + 0.262 × 距離km`（57RP, 寄与727症例, R²=0.722, p<0.001）。距離は基地病院への大圏距離(haversine)。
- **重要**: 運航DBのRP座標・現場座標は**不正確なので距離計算に使わない**。距離は `RP搬送時間入力.csv`(正確座標)＝regions.jsonの lat/lng から算出。
- regions.json の点フィールド: `heliFlightMin`(採用) / `heliFlightSource`("実績中央値"|"回帰推定") / `heliFlightN` / `heliFlightIqr`[q1,q3] / `heliFlightReg`(回帰参考) / `heliFlightObsMed`(回帰採用時の実績中央値) / `heliDistanceKm` / `heliHelipadMin`(=6)。
- 詳細画面は「採用＝**実績中央値 X分**(n=, IQR)｜回帰参考 Y分」または「採用＝**回帰推定 Y分**｜実績中央値(参考)…」と**どちらを採用したか明示+両値併記**。

### 3.2 救急車時間・近隣病院時間
- DBに救急車記録は無い。`RP搬送時間入力.csv` に管理者が Google Maps 走行時間を手入力(救急車→手稲渓仁会、病院1〜3)。
- regions.json の `groundToBaseMin` / `hospitalTimes[{name,min}]` は **CSVの手入力値**。
- ⚠**CSVを編集してもregions.jsonへ自動同期されない**。CSV更新時は手動同期が必要（直近: 恵庭を同期済み）。他市町村も編集された場合は要一括同期。

### 3.3 RP実績の突合方法（取りこぼし対策・確定仕様）
運航DBの市町村列は不正確座標由来で誤りを含む(例: 京極リフレッシュパークがDB上は蘭越タグ)。→ **RP名で全DB横断照合**。
- 正規化: NFKC(全角化)・記号/空白除去・**括弧内注記除去**・**末尾枝番除去**(河川敷1/2/3, キロロ9/10 等を統合)。
- **エイリアス**(同一地点の表記揺れ・確認済み): 望来コミュ(ティー)センターみなくる＋交流センターみなくる / 望羊台広場=望洋台広場 / 中山峠(喜茂別)=中山峠除雪ステーション / 北海道せき損センター各表記 / 千歳市民病院=市立千歳市民病院。
- **別地点は併合しない**(北恵庭/南恵庭、美国中学校/小学校 等)ため完全一致を基本に。
- 飛行時間 = `timtkfrz`(RP離陸)→`timarh`(病院到着)、妥当域 1–90分。

### 3.4 CSV変更時の再計算手順(最小)
1. `RP搬送時間入力.csv` を BOM付きUTF-8で読む(pandasが詰まるなら `open('...','rb').read().decode('utf-8','replace').lstrip('﻿')` + csvモジュール)。
2. 座標変更時: regions.json の該当点 lat/lng を更新 → 距離再計算 → **回帰再推定**(全実績RPで再fit) → `heliFlightReg`全更新 → 採用ルール再適用。
3. 救急車/病院時間変更時: 該当市町村の `groundToBaseMin`/`hospitalTimes` を CSV値で更新（自動化されていない）。
4. 実績中央値(時間)は座標非依存なので座標変更だけなら不変。
5. 変更後 `knowledge/analysis/搬送時間の算出方法.md` を更新、SWキャッシュ版を上げ、**両リポジトリ**コミット。

---

## 4. エキスパートモード（議事録由来の反省・注意事項）
`pwa/js/expert.js`。データ `data/expert-lessons.json`（80件）。**公開版には無い。**

### 4.1 正本は MD ファイル
- **`knowledge/lessons/<会議回>-<連番>_<短い題>.md` が正本**。1件1ファイル。
- frontmatter: `id` / `meeting` / `date` / `ref`(任意) / `title` / `genres` / `subpref` /
  `municipality` / `hospitals` / `publish`。本文は Markdown。
- `publish: false` はアプリに出ない。**新規は false で作り、精査してから true にする。**
- `date` は `YYYY-MM`。議事録の出典に月が無いものは `YYYY`。**常に文字列**（数値化すると型が混在する）。
- 旧 `expert.json` / `case-lessons.json` は廃止。Notion リンクも全廃。

### 4.2 ジャンル（11種・複数付与可）
安全管理・機体 / RP・離着陸 / 消防連携・要請 / 搬送先選定・病院連携 / 患者管理・医学的判断 /
機内手技・医療資機材 / 無線・通信・指令 / 同乗者 / RRC・陸送・後追い / 天候・運航判断 / 人員体制・教育・記録

定義は `scripts/lessons-lib.mjs` の `GENRES`。**ここ以外に増やさない**（ビルドが落ちる）。

### 4.3 更新手順
```
knowledge/lessons/*.md を編集
  → node scripts/build-expert-data.mjs
  → pwa/sw.js の CACHE 版を上げる
  → bash scripts/check.sh
```
ビルドは次のいずれかで**失敗する**: 許可外のジャンル / `publish:true` でジャンルが空 /
個人名らしき表現が残っている。誤って公開しないための仕掛けなので外さないこと。

### 4.4 絞り込みの仕様
- 時期・ジャンル・圏域・市町村・病院の5軸。**同じ軸の中は OR、軸をまたぐと AND**。
- 該当0件の選択肢は表示しない。
- **地域なしが37件ある**（議事録の地域非依存の注意事項）。地域で絞ると消えてしまうため、
  「地域を問わない注意事項も含める」を既定 ON にしている。
- 地域チップの件数だけは地域なしを含めずに数える（含めると全地域が+37されて実態と合わない）。

### 4.5 データの由来
第186〜246回の運営部会議事録から抽出したもの。地域あり43件（うち圏域のみ3件）・地域なし37件。
今後の議事録は `knowledge/minutes/` に置き、そこから `knowledge/lessons/` に起こす。

### 4.6 admin での精査・編集
- Chrome / Edge で `pwa/admin.html` を開き、「反省・注意事項」→「事例フォルダを開く」から
  `knowledge/lessons/` を選ぶ（File System Access API を使うため、Firefox / Safari は非対応）。
- 題名・本文・ジャンル・圏域・市町村・病院・公開可否を編集し、個別または一括保存する。
- `publish:true` でジャンルが空、未知のジャンル、個人名の疑いがある場合は保存を拒否する。
- 保存後は `node scripts/build-expert-data.mjs` → `pwa/sw.js` の CACHE 版上げ → `scripts/check.sh`。

### 4.7 統計モード（エキスパートとは独立）
- `pwa/js/stats.js`。生成データは `pwa/data/stats.json`、正本は保護対象のフライトDB。
- `node scripts/build-stats-data.mjs` で missions 3,164件／実患者1,545件を非識別化して生成する。
- ID・氏名・自由記述・座標・日／時刻は出力しない。許可列は固定し、`scripts/check-stats.mjs` で漏出を検査する。
- missions（要請・応需・中止）と patients（患者・重症度・時間）は別々に絞り込み、分母を混ぜない。各指標に n と欠損数を表示する。
- RP名の表記揺れにより未突合342種が残る。市町村はDB補正列で補完し、圏域は未突合時「不明」。今後正規化辞書を育てる。

---

## 5. インベントリーモード（旧ロジスティック）
`pwa/js/modes.js` の `rInventory`、データ `data/inventory.json`(bags→sections→items{n:品名, y:よみがな})。
- セクションごと**折り畳み**、各セクション**「全✓」一括チェック/解除**。
- **物品ごとの音声読み上げは廃止**(セクション/バッグ単位の▶のみ)。音声**一時停止/再開/停止**バー。読み上げ速度3段階。
- **日付**はカレンダー(type=date)・既定で当日。
- **前日担当者からの申し送りメモ欄**＋直下に**「前日のチェックを全削除」**。
- 点検結果はlocalStorage自動保存。CSVダウンロード可。
- 青バッグ構成: 内側上/気道管理ポーチ/赤/黄/黒/外科処置ポーチ/その他。引き出し: 上段/下段/上部(グローブS,M)。

### 5.1 物品マスターのスプレッドシート連携（編集→アプリ反映）
- tkhdh2005@gmail.com の Google スプレッドシートをマスターに。列 = バッグ/セクション/品名/よみがな。
- 「ファイル→共有→ウェブに公開→CSV」のURLを、アプリの **📋 物品マスターURL** に設定。
- `refreshMaster_()` がオンライン時に公開CSVを取得→キャッシュ(`doo-inventory-master-cache`)。オフラインはキャッシュ→同梱inventory.json。
- localStorageキー: `doo-inventory-master-url` / `-cache` / `-state-v1` / `-endpoint` / `-speed`。

### 5.2 点検ログ送信（Apps Script）
- `pwa/物品モード_Google連携手順.md` に最新の `doPost` 一式。**列名マッピングはしない**(アプリが整列済みheader+rowを送る、チェック済み="OK")。
- **物品構成(列)が変わると自動で別シート `点検ログ_<署名>`** に記録(`shortSig_`でヘッダMD5署名)。過去ログ保持。
- 送信は no-cors(投げっぱなし)。⚙送信先設定に `…/exec` URL。スプレッドシートURLは不可(ガードあり)。

---

## 6. PWA / Service Worker
- `sw.js`: CACHE名は版数管理(現在 **doo-heli-v23**)。**データJSON(/data/*.json)はネットワーク優先**、アプリ本体(html/js/css/img/vendor)はキャッシュ優先+背景更新。activateで `KEEP` 以外の旧キャッシュ削除。
- **地図タイルは専用キャッシュ `doo-heli-tiles-v1`**（キャッシュ優先・上限800件・超過分は古い順に削除）。タイル配信元は `TILE_HOSTS` で判定。
- **ログイン画面の取り込み防止(`unusable()`)**: Cloudflare Access の認証切れや病院/公衆無線LANのキャプティブポータルでは、`data/regions.json` へのリクエストに**ログインHTMLが 200 で返る**。`res.ok` だけで判定すると JSON の代わりに HTML をキャッシュしてアプリが壊れるため、`res.redirected`・Content-Type・**`x-auth-required` ヘッダ**も検査してからキャッシュする。**この判定を外さないこと。** `x-auth-required` は `functions/_middleware.js` が未認証応答に必ず付ける目印。
- **画面遷移(`req.mode==='navigate'`)はネット優先**。認証切れ時にログイン画面へ到達できるようにするため。ただしキャッシュがあれば 2.5秒で打ち切ってキャッシュを返す(電波が弱い現場対策)。
- ⚠**過去に sw.js がファイル途中切れでコミットされ、構文エラーで公開版のSWが一切登録できていなかった**(2026-09-07に修復)。**sw.js または functions/ を書き換えたら必ず `bash scripts/check.sh` を通すこと**(SW構文＋ルーティング5経路＋ログイン画面ガード8項目＋認証ミドルウェア14項目を検証)。
- データ/コード変更時は **CACHE版を必ず上げる**(v18→v19…)。反映は Ctrl+F5 もしくはPWA再起動。

---

## 7. コミット運用
- `git config user.name "Shinsuke"` / `user.email "shin0428@gmail.com"`。
- `.git/index.lock` 残存時は `rm -f .git/index.lock`。
- DO-O: 通常の `git add/commit`。DrHeli-Do-O: §0-4 の `GIT_INDEX_FILE=/tmp/...` 方式必須。
- 変更は**必ず両リポジトリ**へ（公開版に存在するファイルのみ同期: js/{app,map,modes}.js, css/style.css, index.html, sw.js, data/{regions,inventory,beginner,quiz}.json 等。**`js/expert.js` / `data/expert-lessons.json` / `stats.json` / `admin.*` は同期しない**）。

---

## 8. 既知の課題・次の作業候補
- [ ] 全コミットを GitHub へ **push**（ユーザー作業）。
- [ ] `RP搬送時間入力.csv` で恵庭以外の救急車/病院時間も編集されていれば**全市町村を一括同期**。
- [ ] 物品マスターのGoogleスプレッドシート作成→公開→📋URL設定、点検ログ Apps Script デプロイ（ユーザー作業、手順書あり）。
- [ ] 登別市街は全DBで実績なし(回帰採用)。リフレッシュパーク等はDB市町村タグ誤りを名称照合で吸収済み。
- [ ] 公開URL/QR(`qr-drheli.png`)の確認。
- [x] 2026-09-07: 地図から反省事例を削除し、議事録由来80件をエキスパートモードへ集約(SW v23)。
      正本は `knowledge/lessons/*.md`。Notion リンク全廃。設計書 `docs/superpowers/specs/2026-09-07-expert-mode-design.md`。
- [x] **エキスパート 段階C(2026-09-07完了)**: `admin.html` に事例タブ（精査・個人名ハイライト・MD直接保存）。
- [x] **統計モード 段階E(2026-09-07完了)**: レジストリから非識別化テーブルを生成し、独立した統計モード内で集計（エキスパートには載せない）。
      計画 `docs/superpowers/plans/2026-09-07-expert-lessons.md` の末尾を参照。
- [ ] **Phase 2(未着手)**: 公開版の手作業フォークを廃止し、`pwa/` を唯一の正本として `scripts/build-public.mjs` で公開版ツリーを自動生成する。データJSONは allowlist 方式＋禁止ファイル混入でCIを落とすガードを付ける。
- [ ] **Phase 3(準備完了・ユーザー作業待ち)**: **`Cloudflare移行手順.md` の手順を実施**。①機密版(DO-O/pwa・全6モード)を Cloudflare Pages へ。認証は `functions/_middleware.js` の**合言葉ログイン**(環境変数 `DOO_PASSWORD` / `DOO_AUTH_SECRET` を Secret で登録し再デプロイ)。②公開版(DrHeli-Do-O・4モード)も Cloudflare Pages へ移し、**GitHub Pages は両方とも停止**する。
  - **Cloudflare Access(Zero Trust)は採用しない**。無料プランでもクレジットカード登録が必須で、ユーザーが「いつの間にか課金される」ことを懸念したため。Pages/Workers 無料枠はカード不要・10万req/日・超過時は課金ではなくエラー。
  - 引き換えに監査ログとセルフサービスのパスワード再発行は無い。失効は合言葉変更＋周知、全端末強制ログアウトは `DOO_AUTH_SECRET` 変更。
- [x] 2026-09-07: 地図タイルをCARTO(APIキー必須化・透かし)から地理院タイルへ変更。Leaflet を自前ホスト化。
- [x] 2026-09-07: 公開版 sw.js のファイル途中切れ(構文エラーでSW登録不能)を修復。SW v19。
- [x] 2026-09-07: `inventory.json` の両リポジトリ乖離を解消（masterCsvUrl と オフライン用 bags を両方保持）。
- [x] 2026-09-07: SW にログイン画面ガードを追加(SW v20→v21)。`scripts/check.sh` で自動検証。
- [x] 2026-09-07: Cloudflare Pages 用の `_headers` を追加(sw.js/index.html/data は no-cache)。
- [x] 2026-09-07: `functions/_middleware.js`(合言葉ログイン)を実装。SW v21 で `x-auth-required` を検査。
- [x] 2026-09-07: ホーム画面にログアウトボタンを追加。ログイン時に権限を持たない目印 Cookie `doo_session`(HttpOnlyでない)を付け、`app.js` の `renderLogout()` がそれを見て出し分ける。公開版にはこの Cookie が無いのでボタンも出ない。

## 9. 主要定数
- 基地病院 手稲渓仁会: 43.1123, 141.2494。
- ヘリ飛行回帰: 4.66 + 0.262 × 距離km (R²0.722, 57RP/727例)。病院内固定 6分。現場滞在既定 20分。
- 安全策しきい値: n<8 かつ |中央値−回帰|>7分 → 回帰採用。
- regions.json: 52市町村 / 58RP（実績中央値52・回帰6）。SW: doo-heli-v23 / タイル: doo-heli-tiles-v1。
- ベースマップ: 地理院タイル淡色 → 失敗時 OSM。Leaflet 1.9.4 は `vendor/leaflet/` に自前ホスト。
