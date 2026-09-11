/* ===== ホーム画面追加の案内（スマホのブラウザで開いたときだけ） =====
   Vertigo / 抗菌薬ナビと同じ仕様。
   - iPhone/iPad・Android のブラウザ表示でだけ出す。ホーム画面から起動
     (display-mode: standalone / iOS の navigator.standalone) した時とPCでは出さない。
   - ×で閉じたときは、そのブラウザセッションの間だけ出さない（次に開いたらまた出る）。
   - Android の「インストール」完了(appinstalled)を受けたら以後は出さない。
     iOS には完了を知らせるイベントが無いので、ホーム画面起動の判定に任せる。
     案内の中に「追加できた」ボタンは置かない（案内の中で追加が済むと誤解させないため）。 */
const InstallGuide = (() => {
  const COMPLETE_KEY = 'doo-heli/install-guide-completed/v1';
  const POSTPONED_KEY = 'doo-heli/install-guide-postponed/v1';
  const LEAD = '携帯電話のホーム画面に登録すると、通常のアプリと同じように繰り返して使用できます。 ';
  const SHARE_ICON = `<svg viewBox="0 0 24 24" role="img" aria-label="四角から上向き矢印が出ている共有マーク" data-install-icon="safari-share"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg>`;

  let deferredPrompt = null;
  let root = null;

  /* Chrome はページ読込直後に beforeinstallprompt を1回だけ出す。
     案内を描く前に来ることがあるので、スクリプト読込時点で捕まえておく。 */
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    if (root) render();
  });
  window.addEventListener('appinstalled', () => {
    markComplete();
    deferredPrompt = null;
    close();
  });

  function platform(){
    const ua = navigator.userAgent;
    const isiPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    if (/iPhone|iPad|iPod/i.test(ua) || isiPadOS) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'other';
  }

  function standalone(){
    return Boolean(navigator.standalone) || window.matchMedia('(display-mode: standalone)').matches;
  }

  function shouldShow(){
    if (platform() === 'other' || standalone()) return false;
    try {
      return localStorage.getItem(COMPLETE_KEY) !== '1' && sessionStorage.getItem(POSTPONED_KEY) !== '1';
    } catch (e) {
      return true;
    }
  }

  function postpone(){
    try { sessionStorage.setItem(POSTPONED_KEY, '1'); } catch (e) { /* 保存できなくても今の案内は閉じる */ }
  }

  function markComplete(){
    try {
      localStorage.setItem(COMPLETE_KEY, '1');
      sessionStorage.removeItem(POSTPONED_KEY);
    } catch (e) { /* ホーム画面起動では表示条件そのもので抑止できる */ }
  }

  /* 合言葉ログインがある版(doo_session は _middleware.js が付ける目印)かどうか。
     iOS のホーム画面アプリは Safari と Cookie を共有しないため、
     ホーム画面から初めて開くときに合言葉をもう一度求められる。 */
  function hasLogin(){
    return /(?:^|;\s*)doo_session=1(?:\s*;|$)/.test(document.cookie);
  }

  const step = (icon, html) => `<li><span class="install-step-icon">${icon}</span><span>${html}</span></li>`;

  function markup(p, hasPrompt, login){
    const lead = p === 'ios'
      ? LEAD + 'Safariの画面で以下のように登録してください'
      : hasPrompt
        ? LEAD + '下のボタンから登録してください'
        : LEAD + 'Chromeの画面で以下のように登録してください';
    const body = p === 'ios'
      ? `<ol class="install-steps">
          ${step(SHARE_ICON, '<b>Safariの「共有」</b>（左のマーク）をタップ')}
          ${step('＋', '<b>「ホーム画面に追加」</b>を選択')}
          ${step('✓', '右上の<b>「追加」</b>をタップ')}
        </ol>`
      : hasPrompt
        ? `<button type="button" class="install-primary" data-install-action="prompt">この端末にアプリをインストール</button>`
        : `<ol class="install-steps">
            ${step('⋮', 'Chrome右上の<b>メニュー</b>をタップ')}
            ${step('＋', '<b>「アプリをインストール」</b>または<b>「ホーム画面に追加」</b>を選択')}
            ${step('✓', '確認画面で<b>「インストール」</b>をタップ')}
          </ol>`;
    const notes = p === 'ios'
      ? `<p class="install-guide-note">共有ボタンが見つからない場合は、Safariでこのページを開いてください。</p>`
        + (login ? `<p class="install-guide-note">ホーム画面のアイコンから初めて開くときは、合言葉の入力がもう一度必要です。</p>` : '')
      : '';
    return `<section class="install-guide" role="dialog" aria-modal="true" aria-labelledby="install-guide-title">
      <div class="install-guide-head">
        <div>
          <p class="install-guide-kicker">スマホでもっと便利に</p>
          <h2 id="install-guide-title">このアプリを追加</h2>
        </div>
        <button type="button" class="install-guide-close" data-install-action="close" aria-label="案内を閉じる">×</button>
      </div>
      <p class="install-guide-lead">${lead}</p>
      ${body}
      ${notes}
    </section>`;
  }

  async function installAndroid(){
    if (!deferredPrompt) return;
    const promptEvent = deferredPrompt;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === 'accepted') { markComplete(); close(); }
  }

  function render(){
    root.innerHTML = markup(platform(), Boolean(deferredPrompt), hasLogin());
    root.querySelector('[data-install-action="close"]').addEventListener('click', () => { postpone(); close(); });
    const install = root.querySelector('[data-install-action="prompt"]');
    if (install) install.addEventListener('click', () => { installAndroid(); });
    root.querySelector('.install-guide-close').focus({ preventScroll: true });
  }

  function close(){
    if (!root) return;
    root.remove();
    root = null;
  }

  function init(){
    if (root || !shouldShow()) return;
    root = document.createElement('div');
    root.className = 'install-guide-backdrop';
    root.setAttribute('role', 'presentation');
    document.body.appendChild(root);
    render();
  }
  document.addEventListener('DOMContentLoaded', init);

  return { platform, standalone, shouldShow, markComplete, markup };
})();
