// 막닭.ZIP — 각 게임이 저장해 둔 기록을 읽어 목록에 보여 준다.
(() => {
  const read = (key) => { try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; } };
  const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
  const setRec = (game, html) => {
    const el = document.querySelector(`.file[data-game="${game}"] [data-rec]`);
    if (el) el.innerHTML = html;
  };

  // 게임별 기록 (각 게임의 저장 키와 별 기준을 그대로 따름)
  const jr = read('chuncheon.minigame.jumprope');
  const wm = read('chuncheon.minigame.whack');
  const jrStars = jr ? [10, 30, 60].filter((s) => jr.best >= s).length : 0;
  const wmStars = wm ? [500, 1000, 1500].filter((s) => wm.best >= s).length : 0;
  const rn = read('chuncheon.minigame.run');
  const rnStars = rn && rn.best != null ? [36, 27, 21].filter((s) => rn.best <= s).length : 0;
  const ct = read('chuncheon.minigame.catch');
  const ctStars = ct ? [400, 800, 1200].filter((s) => ct.best >= s).length : 0;

  setRec('jumprope', jr && jr.best
    ? `최고 ${jr.best}회 <span class="stars">${starText(jrStars)}</span>`
    : '<span class="tag">첫 도전을 기다려요</span>');
  setRec('whack', wm && wm.best
    ? `최고 ${wm.best}점 <span class="stars">${starText(wmStars)}</span>`
    : '<span class="tag">첫 도전을 기다려요</span>');

  setRec('run', rn && rn.best != null
    ? `최고 ${rn.best.toFixed(2)}초 <span class="stars">${starText(rnStars)}</span>`
    : '<span class="tag">첫 도전을 기다려요</span>');

  setRec('catch', ct && ct.best
    ? `최고 ${ct.best}점 <span class="stars">${starText(ctStars)}</span>`
    : '<span class="tag">첫 도전을 기다려요</span>');

  // 카드팩 가챠
  const gc = read('chuncheon-cardpack-v1');
  const owned = gc && gc.owned ? Object.values(gc.owned).filter((o) => o && o.n > 0).length : 0;
  setRec('gacha', gc
    ? `도감 ${owned} / 8 · 코인 ${gc.coins.toLocaleString()}`
    : '<span class="tag">아직 개봉 전</span>');

  document.getElementById('sumStars').textContent = `${jrStars + wmStars + rnStars + ctStars} / 12`;
  document.getElementById('sumCards').textContent = `${owned} / 8`;
  // 축제 코인 (미니게임으로 벌고 카드팩에서 씀)
  const W = window.MakdakWallet;
  const coinEl = document.getElementById('sumCoins');
  const showCoins = () => {
    const inf = W && W.isInfinite();
    coinEl.textContent = inf ? '∞' : (W ? W.coins() : 0).toLocaleString();
    document.getElementById('coinBox').classList.toggle('inf', !!inf);
    document.querySelector('.logo').classList.toggle('inf', !!inf);
  };
  showCoins();
  addEventListener('pageshow', showCoins);

  // 토스트
  const toastEl = document.getElementById('toast');
  let toastT = 0;
  const toast = (msg) => { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2400); };

  // 🥚 이스터에그: 막닭 로고를 빠르게 7번 누르면 무한 코인 켜기/끄기
  const logo = document.querySelector('.logo');
  const TAPS = 7, WINDOW = 2500;
  let taps = [];
  logo.addEventListener('click', () => {
    const now = Date.now();
    taps = taps.filter((t) => now - t < WINDOW); taps.push(now);
    logo.classList.remove('tap'); void logo.offsetWidth; logo.classList.add('tap');
    const left = TAPS - taps.length;
    if (left > 0 && left <= 3) toast(left + '번 더…?');
    if (taps.length >= TAPS && W) {
      taps = [];
      const on = !W.isInfinite();
      W.setInfinite(on);
      showCoins();
      toast(on ? '🥚 이스터에그! 무한 코인 ON — 카드팩을 마음껏 열어 보세요' : '무한 코인 OFF — 원래 코인으로 돌아왔어요');
    }
  });
})();
