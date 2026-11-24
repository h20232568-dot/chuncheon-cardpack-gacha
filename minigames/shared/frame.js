// 게임 화면(400×720)을 창 크기에 맞춰 늘리고 --u 배율을 설정한다. (준비 중 페이지용)
(() => {
  const wrap = document.getElementById('wrap');
  const fit = () => {
    const s = Math.min(innerWidth / 400, innerHeight / 720);
    wrap.style.width = 400 * s + 'px';
    wrap.style.height = 720 * s + 'px';
    wrap.style.setProperty('--u', s + 'px');
  };
  addEventListener('resize', fit);
  fit();
})();
