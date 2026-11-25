/* =========================================================
   하늘에서 막국수가 내린다면 — 춘천 닭갈비 막국수 축제 미니게임 4
   메밀 막국수 그릇을 좌우로 옮겨 떨어지는 재료를 받는다.
   - 면 +10 / 황금 메밀 +50 (면으로도 셈) / 양념장 +10 / 오이 +10
   - 면 5 + 양념장 + 오이 = 막국수 한 그릇 완성 +100
   - 고춧가루 폭탄 −30, 잠깐 눈이 매움 / 막국수 가위: 모은 재료 싹둑
   - 젓가락: 6초간 그릇이 넓어짐
   ========================================================= */
(() => {
'use strict';

/* ---------- 설정 ---------- */
const W = 400, H = 720, GROUND = 650;
const PI = Math.PI, TAU = PI * 2;
const CFG = {
  duration: 45,
  fallStart: 170, fallEnd: 330,       // 떨어지는 속도 (px/s)
  spawnStart: 0.7, spawnEnd: 0.36,    // 등장 간격 (초)
  pts: { noodle: 10, gold: 50, sauce: 10, cuc: 10, pepper: -30, bowl: 100 },
  need: 5,                            // 한 그릇에 필요한 면
  spicyTime: 1.5, wideTime: 6, wideMul: 1.5,
  stars: [400, 800, 1200],
};
const SAVE_KEY = 'chuncheon.minigame.catch';
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const wrap = $('wrap'), canvas = $('game');
let ctx = canvas.getContext('2d'); // 타이틀 그림을 그릴 때 잠깐 바꿔 씀
const ui = {
  title: $('title'), pause: $('pause'), result: $('result'),
  startBtn: $('startBtn'), resumeBtn: $('resumeBtn'), quitBtn: $('quitBtn'),
  retryBtn: $('retryBtn'), homeBtn: $('homeBtn'), muteBtn: $('muteBtn'), pauseBtn: $('pauseBtn'),
  bestTitle: $('bestTitle'), starsTitle: $('starsTitle'),
  resScore: $('resScore'), resStars: $('resStars'), goalText: $('goalText'), newBest: $('newBest'),
  resBowls: $('resBowls'), resNoodles: $('resNoodles'), resPepper: $('resPepper'), resBest: $('resBest'), resLine: $('resLine'),
};
ui.goalText.textContent = `★ ${CFG.stars[0]}점 · ★★ ${CFG.stars[1]}점 · ★★★ ${CFG.stars[2]}점`;

/* ---------- 저장 ---------- */
function loadSave() {
  try { return Object.assign({ best: 0, stars: 0 }, JSON.parse(localStorage.getItem(SAVE_KEY))); }
  catch { return { best: 0, stars: 0 }; }
}
let save = loadSave();
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} }
const starCount = (n) => CFG.stars.filter((s) => n >= s).length;
save.stars = starCount(save.best);

/* ---------- 화면 크기 ---------- */
let scale = 1, dpr = 1, bgCache = null;
function resize() {
  scale = Math.min(innerWidth / W, innerHeight / H);
  wrap.style.width = W * scale + 'px';
  wrap.style.height = H * scale + 'px';
  wrap.style.setProperty('--u', scale + 'px');
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(W * scale * dpr);
  canvas.height = Math.round(H * scale * dpr);
  bgCache = null;
}
addEventListener('resize', () => { resize(); drawPortraits(); });
resize();

/* ---------- 소리 ---------- */
const Snd = {
  ac: null,
  on: localStorage.getItem(SAVE_KEY + '.mute') !== '1',
  ensure() {
    if (!this.ac) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ac = new AC(); }
    if (this.ac && this.ac.state === 'suspended') this.ac.resume();
  },
  tone(freq, dur, type = 'sine', gain = 0.15, slideTo = 0, delay = 0) {
    if (!this.on || !this.ac) return;
    const c = this.ac, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, gain, freq, type = 'lowpass') {
    if (!this.on || !this.ac) return;
    const c = this.ac, t = c.currentTime;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = type; f.frequency.value = freq; g.gain.value = gain;
    src.connect(f).connect(g).connect(c.destination); src.start(t);
  },
  catch_() { this.tone(520, 0.08, 'sine', 0.1, 880); this.noise(0.06, 0.15, 2000); },   // 퐁
  gold()   { [880, 1175, 1568].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.09, 0, i * 0.05)); },
  bowl()   { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.2, 'square', 0.06, 0, i * 0.08)); },
  pepper() { this.noise(0.4, 0.4, 900); this.tone(300, 0.4, 'sawtooth', 0.07, 120); },
  snip()   { this.noise(0.05, 0.5, 5000, 'highpass'); this.noise(0.05, 0.5, 5000, 'highpass'); this.tone(1800, 0.06, 'square', 0.04, 0, 0.08); },
  wide()   { this.tone(400, 0.25, 'triangle', 0.08, 1000); },
  tick()   { this.tone(1050, 0.04, 'square', 0.04); },
  count(n) { this.tone(n ? 600 : 900, n ? 0.12 : 0.3, 'square', 0.06); },
  end()    { this.tone(1400, 0.5, 'square', 0.05, 1200); },
};
function updateMuteBtn() { ui.muteBtn.textContent = Snd.on ? '🔊' : '🔇'; }
updateMuteBtn();

/* ---------- 상태 ---------- */
let S;
function freshState(mode) {
  return {
    mode,                // demo | countdown | play | paused | end | result
    time: 0,
    bx: 200, tx: 200,    // 그릇 위치 / 목표 위치
    items: [], spawnT: 0.5,
    score: 0, bowls: 0, noodles: 0, peppers: 0,
    rec: { n: 0, sauce: false, cuc: false }, // 지금 그릇에 모은 재료
    spicyT: -9, wideT: -9, snipT: -9, happyT: -9, bowlT: -9,
    keys: { l: false, r: false },
    lastTick: 99, cd: null, endT: 0, flash: 0, flashC: '255,60,30', shake: 0,
  };
}
S = freshState('demo');
const fx = { parts: [], pops: [] };
const prog = () => clamp(S.time / CFG.duration, 0, 1);
const spicy = () => S.time - S.spicyT < CFG.spicyTime;
const wide = () => S.time - S.wideT < CFG.wideTime;
const bowlHalf = () => 54 * (wide() ? CFG.wideMul : 1);

/* ---------- 떨어지는 재료 ---------- */
const KINDS = ['noodle', 'gold', 'sauce', 'cuc', 'pepper', 'scissors', 'chop'];
function pickKind() {
  const p = prog();
  const w = { noodle: 44, gold: 5, sauce: 11, cuc: 11, pepper: 10 + p * 8, scissors: 6 + p * 5, chop: 4 };
  // 이번 그릇에 아직 없는 양념·오이는 조금 더 자주
  if (!S.rec.sauce) w.sauce += 4;
  if (!S.rec.cuc) w.cuc += 4;
  let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const k of KINDS) { r -= w[k]; if (r <= 0) return k; }
  return 'noodle';
}
function spawn() {
  const kind = S.mode === 'demo' ? KINDS[(Math.random() * 5) | 0] : pickKind();
  const v = lerp(CFG.fallStart, CFG.fallEnd, prog()) * (0.9 + Math.random() * 0.25) * (kind === 'gold' ? 1.25 : 1);
  S.items.push({ kind, x: 30 + Math.random() * 340, y: -30, vy: v, ph: Math.random() * TAU, sway: kind === 'pepper' || kind === 'scissors' ? 26 : 10, rot: (Math.random() - 0.5) * 0.6 });
}

/* ---------- 입력: 화면 어디든 끌면 그릇이 따라옴 ---------- */
let dragging = false;
function toLocalX(e) { const r = wrap.getBoundingClientRect(); return (e.clientX - r.left) / scale; }
wrap.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.overlay.show')) return;
  e.preventDefault(); Snd.ensure();
  dragging = true; S.tx = toLocalX(e);
});
wrap.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' && S.mode === 'play') S.tx = toLocalX(e);
  else if (dragging) S.tx = toLocalX(e);
});
addEventListener('pointerup', () => { dragging = false; });
addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'KeyA'].includes(e.code)) { S.keys.l = true; e.preventDefault(); }
  else if (['ArrowRight', 'KeyD'].includes(e.code)) { S.keys.r = true; e.preventDefault(); }
  else if ((e.code === 'Enter' || e.code === 'Space') && (ui.title.classList.contains('show') || ui.result.classList.contains('show'))) { e.preventDefault(); startGame(); }
});
addEventListener('keyup', (e) => {
  if (['ArrowLeft', 'KeyA'].includes(e.code)) S.keys.l = false;
  else if (['ArrowRight', 'KeyD'].includes(e.code)) S.keys.r = false;
});

/* ---------- 받기 ---------- */
function onCatch(it) {
  const x = S.bx, y = GROUND - 70;
  if (S.mode === 'demo') { S.happyT = S.time; splash(x, y, 4, '#f4e6c8'); return; }
  const P = CFG.pts;
  switch (it.kind) {
    case 'noodle': case 'gold': {
      const gold = it.kind === 'gold';
      S.noodles++; S.rec.n = Math.min(CFG.need, S.rec.n + 1);
      addScore(gold ? P.gold : P.noodle, gold ? '#ffe066' : '#fff');
      if (gold) { Snd.gold(); sparkle(x, y, 12); } else Snd.catch_();
      S.happyT = S.time; splash(x, y, 6, '#f4e6c8');
      break;
    }
    case 'sauce':
      addScore(P.sauce, '#ff8a6a'); S.rec.sauce = true; Snd.catch_(); S.happyT = S.time; splash(x, y, 6, '#e8401a'); break;
    case 'cuc':
      addScore(P.cuc, '#b6e07a'); S.rec.cuc = true; Snd.catch_(); S.happyT = S.time; splash(x, y, 6, '#7ab83a'); break;
    case 'pepper':
      S.score = Math.max(0, S.score + P.pepper); S.peppers++;
      S.spicyT = S.time; S.shake = 0.7; S.flash = 0.7; S.flashC = '255,40,20';
      pop(String(P.pepper), '#ff6a4a', 26, x, y - 20); pop('으악 매워!', '#ff8a6a', 22, x, y - 50);
      Snd.pepper(); if (navigator.vibrate) navigator.vibrate(120);
      powder(x, y);
      break;
    case 'scissors': {
      const had = S.rec.n > 0 || S.rec.sauce || S.rec.cuc;
      S.rec = { n: 0, sauce: false, cuc: false }; S.snipT = S.time;
      pop(had ? '싹둑! 재료가 잘렸다' : '싹둑! (잘릴 게 없었다)', '#d8dce6', 19, x, y - 40);
      Snd.snip(); S.shake = 0.4;
      if (had) for (let i = 0; i < 10; i++) fx.parts.push({ kind: 'strand', x: x + (Math.random() - 0.5) * 50, y: y - 10, vx: (Math.random() - 0.5) * 220, vy: -160 - Math.random() * 160, g: 700, life: 0.9, max: 0.9, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 18 });
      break;
    }
    case 'chop':
      S.wideT = S.time; pop('젓가락 찬스! 그릇이 넓어졌다', '#ffe066', 18, x, y - 40); Snd.wide(); sparkle(x, y, 10);
      break;
  }
  // 한 그릇 완성
  if (S.rec.n >= CFG.need && S.rec.sauce && S.rec.cuc) {
    S.bowls++; S.score += P.bowl; S.bowlT = S.time;
    S.rec = { n: 0, sauce: false, cuc: false };
    pop(`막국수 한 그릇 완성! +${P.bowl}`, '#ffcf4a', 24, 200, 330, 1.3);
    Snd.bowl(); confetti(x, y - 30, 40); S.flash = 0.5; S.flashC = '255,230,120';
  }
}
function addScore(n, color) {
  S.score += n;
  pop('+' + n, color, 20, S.bx + (Math.random() - 0.5) * 30, GROUND - 110, 0.6);
}

/* ---------- 화면 전환 ---------- */
function show(el) { [ui.title, ui.pause, ui.result].forEach((o) => o.classList.toggle('show', o === el)); }
function goTitle() {
  S = freshState('demo');
  ui.bestTitle.textContent = save.best;
  ui.starsTitle.textContent = '★'.repeat(save.stars) + '☆'.repeat(3 - save.stars);
  ui.pauseBtn.classList.add('hidden');
  show(ui.title);
  requestAnimationFrame(drawPortraits);
}
function startGame() {
  Snd.ensure();
  S = freshState('countdown');
  fx.pops.length = 0; fx.parts.length = 0;
  show(null);
  ui.pauseBtn.classList.remove('hidden');
  startCountdown();
}
function startCountdown() { S.mode = 'countdown'; S.cd = { t: 0, n: 3 }; Snd.count(3); }
function pauseGame() {
  if (S.mode !== 'play' && S.mode !== 'countdown') return;
  S.mode = 'paused'; S.cd = null; dragging = false; show(ui.pause);
}
ui.startBtn.addEventListener('click', startGame);
ui.retryBtn.addEventListener('click', startGame);
ui.homeBtn.addEventListener('click', goTitle);
ui.quitBtn.addEventListener('click', goTitle);
ui.pauseBtn.addEventListener('click', pauseGame);
ui.resumeBtn.addEventListener('click', () => { show(null); Snd.ensure(); startCountdown(); });
ui.muteBtn.addEventListener('click', () => {
  Snd.on = !Snd.on; Snd.ensure();
  localStorage.setItem(SAVE_KEY + '.mute', Snd.on ? '0' : '1');
  updateMuteBtn();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

function endGame() {
  S.mode = 'end'; S.endT = vt;
  pop('끝!', '#ffcf4a', 54, 200, 300, 1.2);
  Snd.end();
  ui.pauseBtn.classList.add('hidden');
}
function showReward(base, stars) {
  const el = document.getElementById('resReward');
  const Wl = window.MakdakWallet;
  if (!el || !Wl) return;
  const earned = Wl.reward(base, stars);
  const total = Wl.add(earned);
  el.innerHTML = `<span class="coin">₩</span> <b>+${earned}</b> 축제 코인 획득 <small>(보유 ${Wl.isInfinite() ? '∞' : total.toLocaleString()})</small><a href="../../gacha.html">카드팩 열기 ▶</a>`;
}
function showResult() {
  S.mode = 'result';
  const sc = S.score, stars = starCount(sc);
  const isNew = sc > save.best;
  if (isNew) save.best = sc;
  save.stars = Math.max(save.stars, stars);
  writeSave();
  // 축제 코인 지급 (점수 ÷ 12 + 별 보너스) → 카드팩에서 사용
  showReward(sc / 12, stars);
  ui.resScore.textContent = sc;
  [...ui.resStars.children].forEach((el, i) => { el.classList.remove('on'); void el.offsetWidth; el.classList.toggle('on', i < stars); });
  ui.newBest.classList.toggle('hidden', !isNew || sc === 0);
  ui.resBowls.textContent = S.bowls;
  ui.resNoodles.textContent = S.noodles;
  ui.resPepper.textContent = S.peppers;
  ui.resBest.textContent = save.best;
  ui.resLine.textContent =
    S.bowls === 0 ? '하늘 막국수는 처음이죠? 양념장이랑 오이도 꼭 챙겨요!' :
    stars < 2 ? `막국수 ${S.bowls}그릇 완성! 사리 추가 해 드릴게요~` :
    stars < 3 ? `${S.bowls}그릇이나! 막국수 장인 소리 들어도 되겠어요` :
                '하늘이 내린 막국수 달인! 오늘 국수는 사장님이 쏜다!';
  show(ui.result);
}

/* ---------- 업데이트 ---------- */
let vt = 0;
function update(dt) {
  vt += dt;
  S.flash = Math.max(0, S.flash - dt * 2.5);
  S.shake = Math.max(0, S.shake - dt * 3);

  if (S.mode === 'countdown') {
    S.cd.t += dt;
    if (S.cd.t >= 1) {
      S.cd.t -= 1; S.cd.n--;
      Snd.count(S.cd.n);
      if (S.cd.n === 0) pop('시작!', '#ffe066', 44, 200, 300);
      if (S.cd.n < 0) { S.cd = null; S.mode = 'play'; }
    }
  }

  const live = S.mode === 'play' || S.mode === 'demo' || S.mode === 'end';
  if (S.mode === 'play' || S.mode === 'demo') {
    S.time += dt;
    if (S.mode === 'demo') { S.time = 8 + (vt % 10); demoAI(); }
    S.spawnT -= dt;
    if (S.spawnT <= 0) { spawn(); S.spawnT = lerp(CFG.spawnStart, CFG.spawnEnd, prog()) * (0.75 + Math.random() * 0.5); }
    if (S.mode === 'play') {
      const left = CFG.duration - S.time;
      if (left <= 5 && Math.ceil(left) !== S.lastTick) { S.lastTick = Math.ceil(left); if (S.lastTick > 0) Snd.tick(); }
      if (left <= 0) endGame();
    }
  }

  if (live) {
    // 그릇 이동 (매우면 살짝 굼뜸)
    if (S.keys.l) S.tx -= 420 * dt;
    if (S.keys.r) S.tx += 420 * dt;
    const half = bowlHalf();
    S.tx = clamp(S.tx, half - 10, W - half + 10);
    const follow = spicy() ? 6 : 16;
    S.bx += (S.tx - S.bx) * Math.min(1, dt * follow);

    // 재료 떨어뜨리기 + 받기
    const rimY = GROUND - 56;
    for (const it of S.items) {
      const py = it.y;
      it.y += it.vy * dt;
      it.x += Math.sin(vt * 2.2 + it.ph) * it.sway * dt;
      if (!it.done && py < rimY - 4 && it.y >= rimY - 4 && Math.abs(it.x - S.bx) < half + 8 && S.mode !== 'end') {
        it.done = true; onCatch(it);
      }
    }
    S.items = S.items.filter((it) => !it.done && it.y < H + 40);
  }

  if (S.mode === 'end' && vt - S.endT > 1.4) showResult();

  for (const q of fx.parts) {
    q.life -= dt; q.vy += (q.g || 0) * dt;
    if (q.drag) { q.vx *= q.drag; q.vy *= q.drag; }
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.spin) q.rot += q.spin * dt;
  }
  fx.parts = fx.parts.filter((q) => q.life > 0);
  for (const q of fx.pops) q.t += dt;
  fx.pops = fx.pops.filter((q) => q.t < q.life);
}

// 시작 화면 데모: 좋은 재료 쪽으로 그릇이 알아서 움직임
function demoAI() {
  const good = S.items.filter((it) => !['pepper', 'scissors'].includes(it.kind) && it.y < GROUND - 60).sort((a, b) => b.y - a.y)[0];
  if (good) S.tx = good.x;
}

/* ---------- 이펙트 ---------- */
function pop(text, color, size, x = 200, y = 300, life = 0.9) { fx.pops.push({ text, color, size, x: clamp(x, 80, 320), y, t: 0, life }); }
function splash(x, y, n, color) {
  for (let i = 0; i < n; i++) { const a = -PI / 2 + (Math.random() - 0.5) * 2, sp = 80 + Math.random() * 120; fx.parts.push({ kind: 'drop', x: x + (Math.random() - 0.5) * 40, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 600, life: 0.5, max: 0.5, r: 2.5 + Math.random() * 2.5, color }); }
}
function sparkle(x, y, n) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 80 + Math.random() * 140; fx.parts.push({ kind: 'star', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 200, drag: 0.97, life: 0.6, max: 0.6, r: 4 + Math.random() * 3, color: '#ffe066' }); }
}
function powder(x, y) {
  for (let i = 0; i < 26; i++) { const a = Math.random() * TAU, sp = 40 + Math.random() * 160; fx.parts.push({ kind: 'drop', x, y: y - 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 60, drag: 0.96, life: 0.9, max: 0.9, r: 3 + Math.random() * 5, color: Math.random() < 0.5 ? '#d8281a' : '#ff6a3a' }); }
}
const CONF = ['#ffcf4a', '#ff6a8a', '#7ad8ff', '#b4ff7a', '#ffffff', '#ff9a3a'];
function confetti(x, y, n) {
  for (let i = 0; i < n; i++) { const a = -PI / 2 + (Math.random() - 0.5) * 2.4, sp = 200 + Math.random() * 260; fx.parts.push({ kind: 'conf', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 380, drag: 0.98, life: 1.4, max: 1.4, r: 4, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 16, color: CONF[i % CONF.length] }); }
}

/* =========================================================
   그리기
   ========================================================= */
function ellipse(x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); }
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); }
function rrect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function star(x, y, r, c) {
  ctx.fillStyle = c; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -PI / 2 + (i * PI) / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}
const FONT = () => getComputedStyle(document.body).fontFamily;
const OUT = '#3a1a10';

/* ---- 배경: 호반 축제 밤하늘 ---- */
function buildBackground() {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const g = c.getContext('2d');
  g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  let gr = g.createLinearGradient(0, 0, 0, 520);
  gr.addColorStop(0, '#151238'); gr.addColorStop(0.55, '#3b1f55'); gr.addColorStop(1, '#a8475a');
  g.fillStyle = gr; g.fillRect(0, 0, W, 520);
  const r = seeded(31);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`; g.beginPath(); g.arc(r() * W, r() * 420, r() * 1.3 + 0.3, 0, TAU); g.fill(); }
  // 산과 호수
  g.fillStyle = '#3a2758';
  g.beginPath(); g.moveTo(0, 500);
  [[50, 460], [110, 482], [170, 448], [240, 478], [300, 452], [360, 480], [400, 466]].forEach(([x, y]) => g.lineTo(x, y));
  g.lineTo(W, 520); g.lineTo(0, 520); g.fill();
  gr = g.createLinearGradient(0, 510, 0, 560);
  gr.addColorStop(0, '#5a3a78'); gr.addColorStop(1, '#2a2050');
  g.fillStyle = gr; g.fillRect(0, 508, W, 52);
  g.strokeStyle = 'rgba(255,190,140,.35)'; g.lineWidth = 1.2;
  for (let i = 0; i < 10; i++) { const y = 516 + i * 4, x = 20 + r() * 340; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14 + r() * 24, y); g.stroke(); }
  // 나무 평상
  gr = g.createLinearGradient(0, 556, 0, H);
  gr.addColorStop(0, '#7a4a30'); gr.addColorStop(1, '#4a2c1c');
  g.fillStyle = gr; g.fillRect(0, 556, W, H - 556);
  g.strokeStyle = 'rgba(30,15,8,.35)'; g.lineWidth = 1.5;
  for (let y = 556, i = 0; y < H; i++) { y += 16 + i * 4; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  return c;
}
const LIGHT_COLORS = ['#ffcf4a', '#ff7a4a', '#7ad0ff', '#ff9ad0', '#a8ff7a'];
function drawLights(t) {
  const [x0, y0, x1, y1, sag] = [-10, 236, 410, 226, 30];
  ctx.strokeStyle = 'rgba(20,10,20,.8)'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let u = 0; u <= 1.0001; u += 0.05) { const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u + sag * (1 - (2 * u - 1) ** 2); u === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.stroke();
  for (let i = 0; i < 15; i++) {
    const u = (i + 0.5) / 15, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u + sag * (1 - (2 * u - 1) ** 2) + 4;
    const a = 0.65 + 0.35 * Math.sin(t * 3 + i * 1.7);
    ctx.globalAlpha = a * 0.35; ctx.fillStyle = LIGHT_COLORS[i % 5]; circle(x, y, 7); ctx.fill();
    ctx.globalAlpha = a; circle(x, y, 2.8); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---- 떨어지는 재료 그림 ---- */
function drawItem(kind, x, y, t, s = 1, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (kind === 'noodle' || kind === 'gold') {
    const gold = kind === 'gold';
    if (gold) { const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 30); g.addColorStop(0, 'rgba(255,220,90,.7)'); g.addColorStop(1, 'rgba(255,200,60,0)'); ctx.fillStyle = g; circle(0, 0, 30); ctx.fill(); }
    ctx.fillStyle = gold ? '#f2b21c' : '#a8876e'; ellipse(0, 0, 18, 15); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = gold ? '#9a6006' : '#6e5242'; ctx.lineWidth = 1.6;
    for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.ellipse(0, 0, 5 * k, 4 * k, 0, 0.3 + k, 0.3 + k + 4.8); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ellipse(-7, -7, 4, 2, -0.5); ctx.fill();
    if (gold) { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 9); star(14, -12, 6, '#fff6b0'); ctx.globalAlpha = 1; }
  } else if (kind === 'sauce') { // 양념장 종지
    ctx.fillStyle = '#fffaf0'; ellipse(0, 6, 19, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d8281a'; ctx.beginPath(); ctx.moveTo(-14, 4); ctx.quadraticCurveTo(-12, -14, 0, -16); ctx.quadraticCurveTo(12, -14, 14, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ellipse(-5, -8, 3, 2, -0.5); ctx.fill();
    ctx.fillStyle = '#fff3d0'; [[-4, -2], [5, -6], [2, 2]].forEach(([a, b]) => { ellipse(a, b, 1.3, 0.8); ctx.fill(); });
  } else if (kind === 'cuc') { // 오이채 묶음
    [-0.5, -0.2, 0.1, 0.4].forEach((a, i) => {
      ctx.save(); ctx.rotate(a);
      ctx.fillStyle = '#3f7a24'; rrect(-3.5, -18, 7, 36, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c4ea8a'; rrect(-1.5, -16, 3, 32, 1.5); ctx.fill();
      ctx.restore();
    });
  } else if (kind === 'pepper') { // 고춧가루 폭탄 (봉지)
    ctx.fillStyle = '#d8281a';
    ctx.beginPath(); ctx.moveTo(-14, -10); ctx.quadraticCurveTo(-20, 16, 0, 18); ctx.quadraticCurveTo(20, 16, 14, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffcf4a'; rrect(-10, -16, 20, 7, 3); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#3a1a10'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -16); ctx.quadraticCurveTo(6, -26, 2, -30); ctx.stroke();
    ctx.fillStyle = Math.sin(t * 25) > 0 ? '#ffe066' : '#ff8a2a'; circle(2, -31, 3); ctx.fill(); // 불꽃 심지
    // 화난 얼굴
    ctx.fillStyle = '#1a0a08'; ellipse(-5, 3, 2.2, 2.8); ctx.fill(); ellipse(5, 3, 2.2, 2.8); ctx.fill();
    ctx.strokeStyle = '#1a0a08'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-9, -3); ctx.lineTo(-3, 0); ctx.moveTo(9, -3); ctx.lineTo(3, 0); ctx.moveTo(-3, 10); ctx.quadraticCurveTo(0, 7, 3, 10); ctx.stroke();
  } else if (kind === 'scissors') { // 막국수 가위 (카드 08)
    const open = 0.35 + Math.sin(t * 10) * 0.25;
    [-1, 1].forEach((sd) => {
      ctx.save(); ctx.rotate(sd * open);
      ctx.fillStyle = '#c8ccd6'; ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(0, 26); ctx.lineTo(4, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#1e1e24'; ctx.lineWidth = 6; circle(sd * 2, -16, 8); ctx.stroke();
      ctx.restore();
    });
    ctx.fillStyle = '#d8dce6'; ctx.strokeStyle = OUT; ctx.lineWidth = 2; circle(0, -2, 9); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a0a08'; circle(-3, -3, 1.6); ctx.fill(); circle(3, -3, 1.6); ctx.fill();
    ctx.strokeStyle = '#1a0a08'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-6, -7); ctx.lineTo(-1, -5); ctx.moveTo(6, -7); ctx.lineTo(1, -5); ctx.stroke();
  } else if (kind === 'chop') { // 젓가락
    const g = ctx.createRadialGradient(0, 0, 3, 0, 0, 28); g.addColorStop(0, 'rgba(255,230,140,.5)'); g.addColorStop(1, 'rgba(255,230,140,0)'); ctx.fillStyle = g; circle(0, 0, 28); ctx.fill();
    [-0.25, 0.25].forEach((a) => { ctx.save(); ctx.rotate(a); ctx.fillStyle = '#c98a4a'; ctx.strokeStyle = OUT; ctx.lineWidth = 2; rrect(-2.5, -24, 5, 48, 2.5); ctx.fill(); ctx.stroke(); ctx.restore(); });
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 8); star(12, -16, 5, '#fff6b0'); ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ---- 내 그릇: 메밀 막국수 (모은 재료에 따라 면이 쌓임) ---- */
function face(x, y, gap, o = {}) {
  const { eyeR = 4, mouth = 5.5, happy = false, shock = false, hot = false } = o;
  ctx.fillStyle = hot ? 'rgba(255,60,40,.75)' : 'rgba(255,120,130,.55)';
  ellipse(x - gap - 8, y + 8, 6.5, 4); ctx.fill(); ellipse(x + gap + 8, y + 8, 6.5, 4); ctx.fill();
  ctx.strokeStyle = '#1a0a08'; ctx.lineCap = 'round'; ctx.lineWidth = 2.4;
  [-1, 1].forEach((sd) => {
    const ex = x + sd * gap;
    if (hot) { ctx.beginPath(); ctx.moveTo(ex - 4 * sd, y - 3); ctx.lineTo(ex + 3 * sd, y); ctx.lineTo(ex - 4 * sd, y + 3); ctx.stroke(); }
    else if (happy) { ctx.beginPath(); ctx.arc(ex, y + 2, eyeR * 1.1, PI * 1.15, PI * 1.85); ctx.stroke(); }
    else if (shock) { ctx.fillStyle = '#fff'; circle(ex, y, eyeR * 1.3); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#1a0a08'; circle(ex, y, eyeR * 0.5); ctx.fill(); }
    else { ctx.fillStyle = '#1a0a08'; ellipse(ex, y, eyeR, eyeR * 1.3); ctx.fill(); ctx.fillStyle = '#fff'; circle(ex + 1.2, y - 1.8, eyeR * 0.4); ctx.fill(); }
  });
  ctx.fillStyle = '#7a1818';
  if (shock || hot) { ellipse(x, y + 10, 4, 5); ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(x, y + 6, happy ? mouth * 1.3 : mouth, 0.05, PI - 0.05); ctx.closePath(); ctx.fill(); }
}
function drawBowl(x, fy, t) {
  const wm = wide() ? CFG.wideMul : 1;
  const rimY = fy - 56;
  const k = S.rec.n / CFG.need;                 // 면 쌓인 정도 0~1
  const happy = S.time - S.happyT < 0.35 || S.time - S.bowlT < 1;
  const hot = spicy();
  const shock = S.time - S.snipT < 0.8;
  const hop = S.time - S.bowlT < 1 ? Math.abs(Math.sin(t * 14)) * 8 : 0;

  ctx.fillStyle = 'rgba(0,0,0,.3)'; ellipse(x, fy + 2, 58 * wm, 9); ctx.fill();
  ctx.save(); ctx.translate(x, 0); ctx.scale(wm, 1); ctx.translate(-x, 0);
  // 그릇 몸통
  ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
  ctx.fillStyle = '#a87428'; ellipse(x, fy - 5, 25, 6); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 60, rimY); ctx.bezierCurveTo(x - 58, fy - 26, x - 42, fy - 12, x - 24, fy - 11);
  ctx.lineTo(x + 24, fy - 11); ctx.bezierCurveTo(x + 42, fy - 12, x + 58, fy - 26, x + 60, rimY); ctx.closePath();
  let gr = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
  gr.addColorStop(0, '#a8701e'); gr.addColorStop(0.28, '#f4d07e'); gr.addColorStop(0.42, '#fbe3a6'); gr.addColorStop(0.6, '#d9a045'); gr.addColorStop(1, '#9a6418');
  ctx.fillStyle = gr; ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f0c46a'; ellipse(x, rimY, 60, 13); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f4ead0'; ellipse(x, rimY + 1, 53, 9.5); ctx.fill();
  ctx.restore();

  // 면 더미 (돔) — 재료가 모일수록 봉긋
  const base = rimY + 4 - hop;
  const domeH = 30 + k * 34, domeW = 34 + k * 10;
  const top = base - domeH;
  ctx.beginPath();
  ctx.moveTo(x - domeW, base + 4);
  ctx.bezierCurveTo(x - domeW - 4, base - domeH * 0.55, x - domeW * 0.6, top, x, top);
  ctx.bezierCurveTo(x + domeW * 0.6, top, x + domeW + 4, base - domeH * 0.55, x + domeW, base + 4);
  ctx.closePath();
  ctx.save();
  ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.stroke();
  gr = ctx.createRadialGradient(x - 10, top + 12, 3, x, base - domeH * 0.4, domeW * 1.4);
  gr.addColorStop(0, hot ? '#e8806a' : '#a88a72'); gr.addColorStop(0.6, hot ? '#c8503a' : '#93725c'); gr.addColorStop(1, '#5e4436');
  ctx.fillStyle = gr; ctx.fill(); ctx.clip();
  ctx.lineJoin = 'round';
  for (let i = -7; i <= 7; i++) {
    ctx.strokeStyle = i % 2 ? 'rgba(84,60,46,.6)' : 'rgba(200,172,146,.5)'; ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let j = 0; j <= 10; j++) { const u = j / 10, sp = Math.sin(u * PI * 0.5); const px = x + i * (1 + (domeW / 8) * sp) + Math.sin(u * 9 + i + t * 1.5) * 1.5 * u, py = top + 2 + (base + 8 - top) * u; j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
  }
  ctx.restore();
  face(x, base - Math.min(28, domeH * 0.5), 10, { happy, shock, hot });
  if (hot) for (let i = 0; i < 3; i++) { const p = (t * 1.5 + i / 3) % 1; ctx.fillStyle = `rgba(255,240,230,${0.5 * (1 - p)})`; circle(x - 20 + i * 20, top - 6 - p * 30, 5 + p * 6); ctx.fill(); }

  // 얼음 + 앞 테두리
  ctx.save(); ctx.translate(x, 0); ctx.scale(wm, 1); ctx.translate(-x, 0);
  [[x - 40, rimY + 1, -0.25, 13], [x + 35, rimY, 0.2, 12]].forEach(([ix, iy, r, sz]) => {
    ctx.save(); ctx.translate(ix, iy); ctx.rotate(r);
    ctx.fillStyle = 'rgba(228,244,255,.92)'; ctx.strokeStyle = '#7fa8c8'; ctx.lineWidth = 1.5; rrect(-sz / 2, -sz / 2, sz, sz * 0.85, 3); ctx.fill(); ctx.stroke();
    ctx.restore();
  });
  ctx.beginPath(); ctx.ellipse(x, rimY, 60, 13, 0, 0, PI); ctx.ellipse(x, rimY + 1, 53, 9.5, 0, PI, 0, true); ctx.closePath();
  gr = ctx.createLinearGradient(x - 60, 0, x + 60, 0); gr.addColorStop(0, '#c08a30'); gr.addColorStop(0.35, '#fbe0a0'); gr.addColorStop(1, '#b07a24');
  ctx.fillStyle = gr; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(x, rimY, 60, 13, 0, 0, PI); ctx.stroke();
  ctx.restore();

  // 고명: 모은 오이·양념장이 정수리에 올라감, 달걀은 늘
  if (S.rec.cuc) for (let i = 0; i < 9; i++) {
    const a = -PI + 0.3 + (i / 8) * (PI - 0.6), dr = 1 - Math.abs(Math.sin(a));
    ctx.strokeStyle = '#2f6a1c'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 6, top + 4); ctx.lineTo(x + Math.cos(a) * 28, top + 6 + Math.sin(a) * 6 + dr * 12); ctx.stroke();
    ctx.strokeStyle = '#b6e07a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 6, top + 4); ctx.lineTo(x + Math.cos(a) * 28, top + 6 + Math.sin(a) * 6 + dr * 12); ctx.stroke();
  }
  if (S.rec.sauce) { ctx.fillStyle = '#d8281a'; ctx.strokeStyle = OUT; ctx.lineWidth = 2; ellipse(x - 14, top + 4, 11, 6); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ellipse(x + 3, top - 4, 17, 9); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f5a818'; ellipse(x + 4, top - 5, 8.5, 5); ctx.fill();
}

/* ---- HUD ---- */
function drawHUD(t) {
  if (!['play', 'countdown', 'paused', 'end'].includes(S.mode)) return;
  ctx.textBaseline = 'alphabetic';
  const left = Math.max(0, CFG.duration - S.time), k = left / CFG.duration;
  ctx.fillStyle = 'rgba(0,0,0,.4)'; rrect(16, 78, 368, 16, 8); ctx.fill();
  ctx.fillStyle = left <= 5 ? (Math.sin(t * 12) > 0 ? '#ff5a3a' : '#ff8a5a') : '#ffcf4a';
  if (k > 0) { rrect(18, 80, Math.max(12, 364 * k), 12, 6); ctx.fill(); }
  ctx.textAlign = 'right'; ctx.font = `800 13px ${FONT()}`; ctx.fillStyle = '#fff'; ctx.fillText(Math.ceil(left) + '초', 380, 70);
  ctx.textAlign = 'left'; ctx.font = `700 13px ${FONT()}`; ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillText(`최고 ${Math.max(save.best, S.score)}점`, 16, 30);
  ctx.fillText(`완성 ${S.bowls}그릇`, 16, 50);
  ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.font = `900 50px ${FONT()}`; ctx.lineWidth = 9; ctx.strokeStyle = '#2a1030';
  ctx.strokeText(S.score, 200, 148); ctx.fillStyle = '#fff'; ctx.fillText(S.score, 200, 148);

  // 레시피 칸: 면 5 + 양념장 + 오이
  const slots = [...Array(CFG.need).fill('noodle'), 'sauce', 'cuc'];
  const x0 = 200 - (slots.length * 34) / 2 + 17;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; rrect(x0 - 26, 162, slots.length * 34 + 18, 40, 20); ctx.fill();
  slots.forEach((kd, i) => {
    const got = kd === 'noodle' ? i < S.rec.n : kd === 'sauce' ? S.rec.sauce : S.rec.cuc;
    ctx.globalAlpha = got ? 1 : 0.28;
    drawItem(kd, x0 + i * 34, 182, t, 0.62);
    ctx.globalAlpha = 1;
    if (i === CFG.need - 1) { ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(x0 + i * 34 + 16, 168, 1.5, 28); }
  });
  if (wide()) { ctx.font = `900 13px ${FONT()}`; ctx.fillStyle = '#ffe066'; ctx.fillText(`🥢 넓은 그릇 ${Math.ceil(CFG.wideTime - (S.time - S.wideT))}초`, 200, 222); }

  if (S.mode === 'countdown' && S.cd && S.cd.n > 0) {
    const kk = S.cd.t;
    ctx.save(); ctx.translate(200, 360); ctx.scale(1.4 - kk * 0.4, 1.4 - kk * 0.4); ctx.globalAlpha = 1 - kk * 0.6;
    ctx.font = `900 110px ${FONT()}`; ctx.lineWidth = 12; ctx.strokeStyle = '#2a1030'; ctx.strokeText(S.cd.n, 0, 36);
    ctx.fillStyle = '#ffcf4a'; ctx.fillText(S.cd.n, 0, 36);
    ctx.restore();
  }
}
function drawPops() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (const q of fx.pops) {
    const k = q.t / q.life, s = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, k - 0.15);
    ctx.save(); ctx.translate(q.x, q.y - k * 36); ctx.scale(s, s);
    ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    ctx.font = `900 ${q.size}px ${FONT()}`; ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = '#2a1030';
    ctx.strokeText(q.text, 0, 0); ctx.fillStyle = q.color; ctx.fillText(q.text, 0, 0);
    ctx.restore();
  }
}
function drawParts() {
  for (const q of fx.parts) {
    const a = Math.max(0, q.life / q.max);
    ctx.globalAlpha = Math.min(1, a * 1.5);
    if (q.kind === 'star') star(q.x, q.y, q.r, q.color);
    else if (q.kind === 'drop') { ctx.fillStyle = q.color; circle(q.x, q.y, q.r); ctx.fill(); }
    else if (q.kind === 'conf') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = q.color; ctx.fillRect(-q.r, -q.r * 0.5, q.r * 2, q.r); ctx.restore(); }
    else if (q.kind === 'strand') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.strokeStyle = '#8a6a55'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(0, -6, 10, 0); ctx.stroke(); ctx.restore(); }
  }
  ctx.globalAlpha = 1;
}

function render() {
  const t = vt;
  if (!bgCache) bgCache = buildBackground();
  const sk = S.shake * S.shake * 8;
  const ox = (Math.random() - 0.5) * sk, oy = (Math.random() - 0.5) * sk;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bgCache, 0, 0);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox * scale * dpr, oy * scale * dpr);
  // 고춧가루: 눈이 매워 화면이 번짐
  const hot = (S.mode === 'play' || S.mode === 'end') && spicy();
  if (hot && 'filter' in ctx) ctx.filter = `blur(${(2.5 * (1 - (S.time - S.spicyT) / CFG.spicyTime)).toFixed(2)}px)`;

  drawLights(t);
  for (const it of S.items) drawItem(it.kind, it.x, it.y, t, 1, it.rot + Math.sin(t * 3 + it.ph) * 0.15);
  drawBowl(S.bx, GROUND, t);
  drawParts();
  if ('filter' in ctx) ctx.filter = 'none';
  if (hot) { ctx.fillStyle = `rgba(255,40,20,${0.22 * (1 - (S.time - S.spicyT) / CFG.spicyTime)})`; ctx.fillRect(0, 0, W, H); }

  drawHUD(t);
  drawPops();
  if (S.flash > 0) { ctx.fillStyle = `rgba(${S.flashC},${S.flash * 0.3})`; ctx.fillRect(0, 0, W, H); }
}

/* ---- 타이틀 소개 그림 (게임과 같은 그림 함수) ---- */
function drawPortraits() {
  document.querySelectorAll('canvas.portrait').forEach((cv) => {
    const w = cv.clientWidth, hh = cv.clientHeight;
    if (!w || !hh) return;
    const d = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = Math.round(w * d); cv.height = Math.round(hh * d);
    const pc = cv.getContext('2d');
    pc.setTransform(d, 0, 0, d, 0, 0);
    const g = pc.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, '#3b1f55'); g.addColorStop(1, '#c0584a');
    pc.fillStyle = g; pc.fillRect(0, 0, w, hh);
    const prev = ctx; ctx = pc;
    const s = hh / 60;
    if (cv.dataset.kind === 'recipe') {
      drawItem('noodle', w * 0.26, hh * 0.38, 0, s * 0.75); drawItem('noodle', w * 0.42, hh * 0.62, 0, s * 0.75);
      drawItem('sauce', w * 0.62, hh * 0.4, 0, s * 0.7); drawItem('cuc', w * 0.8, hh * 0.58, 0, s * 0.6, 0.3);
    } else drawItem(cv.dataset.kind, w / 2, hh * 0.55, 0.2, s * 1.05);
    ctx = prev;
  });
}

/* ---------- 메인 루프 ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
goTitle();
requestAnimationFrame((t) => { last = t; frame(t); });

// 테스트용 연결 (배포 시 지워도 됨)
window.__catch = { get state() { return S; }, CFG, step: update, startGame };
})();
