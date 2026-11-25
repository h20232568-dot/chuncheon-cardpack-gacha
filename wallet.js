/* =========================================================
   막닭.ZIP 공용 지갑 (축제 코인)
   - 코인은 카드팩 저장 데이터(chuncheon-cardpack-v1)의 coins에 함께 보관한다.
   - 미니게임은 MakdakWallet.add(n)으로 코인을 벌고, 카드팩에서 쓴다.
   - 이스터에그: 무한 코인 모드 (막닭 로고 연타로 켜고 끔)
   ========================================================= */
(() => {
  const SAVE_KEY = 'chuncheon-cardpack-v1';
  const INF_KEY = 'makdak.infinite';
  const PACK_COST = 100;
  const FREE_PULLS = 20;                 // 처음 오면 카드팩 20번 무료
  const START = PACK_COST * FREE_PULLS;  // = 2000 코인
  const STAR_BONUS = [0, 20, 40, 80];    // 결과 별 개수에 따른 보너스 코인

  const read = () => {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && typeof s.coins === 'number' ? s : null; }
    catch { return null; }
  };
  const write = (s) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch {} };

  window.MakdakWallet = {
    START, PACK_COST, FREE_PULLS, STAR_BONUS,
    /** 지금 코인 (카드팩을 한 번도 안 열었으면 시작 코인) */
    coins() { const s = read(); return s ? s.coins : START; },
    /** 코인 벌기. 카드팩 저장이 없으면 시작 코인에 더해서 만든다. 더한 뒤 코인을 돌려준다. */
    add(n) {
      n = Math.max(0, Math.round(n || 0));
      const s = read() || { coins: START, owned: {}, packs: 0, pity: 0, spPulls: 0, godPacks: 0, sound: true, packSel: 0 };
      s.coins += n;
      write(s);
      return s.coins;
    },
    /** 게임 결과 → 코인 (기본 점수 코인 + 별 보너스) */
    reward(base, stars) { return Math.max(0, Math.round(base)) + (STAR_BONUS[stars] || 0); },
    isInfinite() { try { return localStorage.getItem(INF_KEY) === '1'; } catch { return false; } },
    setInfinite(on) { try { on ? localStorage.setItem(INF_KEY, '1') : localStorage.removeItem(INF_KEY); } catch {} },
  };
})();
