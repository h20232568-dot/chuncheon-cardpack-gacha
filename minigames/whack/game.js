/* =========================================================
   닭치고 닭잡고 — 춘천 닭갈비 막국수 축제 미니게임 2
   3×3 짚 둥지에서 튀어나오는 닭을 (철판대장의) 뒤집개로 잡는다.
   - 축제 꼬꼬 +10
   - 황금 꼬꼬 +50 (빨리 들어감)
   - 숯불파 수탉 (선글라스) 두 번 때려야 +30
   - 병아리: 때리면 −20, 뒤집개에 털이 붙어 3초간 못 씀
   ========================================================= */
(() => {
'use strict';

/* ---------- 설정 ---------- */
const W = 400, H = 720;
const PI = Math.PI, TAU = PI * 2;
const CFG = {
  duration: 60,
  stayStart: 1.2, stayEnd: 0.5,      // 떠 있는 시간: 1.2초 → 0.5초
  spawnStart: 0.75, spawnEnd: 0.32,  // 다음 등장까지 간격
  rise: 0.14, sink: 0.16,
  comboAt: 5, comboMul: 1.5,
  stickTime: 3,
  pts: { basic: 10, gold: 50, tough: 30, chick: -20 },
  stars: [500, 1000, 1500],
};
const SAVE_KEY = 'chuncheon.minigame.whack';
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const wrap = $('wrap'), canvas = $('game');
let ctx = canvas.getContext('2d'); // 타이틀 초상화를 그릴 때 잠깐 바꿔 씀
const ui = {
  title: $('title'), pause: $('pause'), result: $('result'),
  startBtn: $('startBtn'), resumeBtn: $('resumeBtn'), quitBtn: $('quitBtn'),
  retryBtn: $('retryBtn'), homeBtn: $('homeBtn'), muteBtn: $('muteBtn'), pauseBtn: $('pauseBtn'),
  bestTitle: $('bestTitle'), starsTitle: $('starsTitle'),
  resScore: $('resScore'), resStars: $('resStars'), goalText: $('goalText'), newBest: $('newBest'),
  resCaught: $('resCaught'), resGold: $('resGold'), resCombo: $('resCombo'), resBest: $('resBest'), resLine: $('resLine'),
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
save.stars = starCount(save.best); // 별 기준이 바뀌어도 최고 점수 기준으로 다시 계산

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
addEventListener('resize', () => { resize(); if (typeof drawPortraits === 'function') drawPortraits(); });
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
  hit()    { this.noise(0.08, 0.45, 1800); this.tone(200, 0.09, 'square', 0.08, 90); },
  gold()   { [880, 1175, 1568].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.09, 0, i * 0.05)); this.noise(0.06, 0.3, 2500); },
  clang()  { this.tone(1250, 0.18, 'square', 0.05); this.tone(1870, 0.14, 'square', 0.03); this.noise(0.05, 0.3, 4000, 'highpass'); },
  squawk() { this.tone(650, 0.07, 'square', 0.05, 1050); this.tone(1000, 0.14, 'square', 0.045, 480, 0.07); }, // 꼬꼬댁
  chick()  { this.tone(2300, 0.07, 'sine', 0.1, 2900); this.tone(2300, 0.09, 'sine', 0.1, 3000, 0.1); this.tone(500, 0.3, 'triangle', 0.06, 200, 0.2); }, // 삐약삐약…
  sticky() { this.tone(180, 0.18, 'sawtooth', 0.05, 120); },
  whiff()  { this.noise(0.12, 0.18, 2600, 'bandpass'); },
  popup()  { this.tone(480, 0.06, 'sine', 0.035, 820); },
  tick()   { this.tone(1050, 0.04, 'square', 0.04); },
  combo()  { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.13, 'square', 0.05, 0, i * 0.06)); },
  count(n) { this.tone(n ? 600 : 900, n ? 0.12 : 0.3, 'square', 0.06); },
  end()    { this.tone(1400, 0.5, 'square', 0.05, 1200); this.tone(1700, 0.5, 'square', 0.03, 1500); },
};
function updateMuteBtn() { ui.muteBtn.textContent = Snd.on ? '🔊' : '🔇'; }
updateMuteBtn();

/* ---------- 숯불 구멍 (3×3, 앞줄일수록 크게) ---------- */
const ROWS = [{ y: 372, s: 0.84 }, { y: 486, s: 0.95 }, { y: 610, s: 1.06 }];
const HOLES = [];
ROWS.forEach((r, ri) => { for (let c = 0; c < 3; c++) HOLES.push({ i: ri * 3 + c, row: ri, x: 200 + (c - 1) * 124 * r.s, y: r.y, s: r.s }); });

/* ---------- 상태 ---------- */
let S;
function freshHole() { return { kind: null, st: 'empty', t: 0, k: 0, stay: 1, hp: 1, hitT: -9, vacT: -9, escaped: false }; }
function freshState(mode) {
  return {
    mode,               // demo | countdown | play | paused | end | result
    time: 0,            // 게임 경과 (초)
    holes: HOLES.map(freshHole),
    spawnT: 0.4,
    score: 0, combo: 0, maxCombo: 0, caught: 0, golds: 0, chicks: 0,
    stuck: 0,           // 뒤집개에 병아리 털이 붙어 못 쓰는 남은 시간
    lastTick: 99,
    cd: null, endT: 0, flash: 0, flashC: '255,60,30', shake: 0,
  };
}
S = freshState('demo');
const fx = { parts: [], pops: [] };
const spat = { x: 300, y: 560, swingT: -9, shownT: -9, mouse: false };

/* ---------- 진행도에 따른 난이도 ---------- */
const prog = () => clamp01(S.time / CFG.duration);
function maxActive() { const t = S.time; return t < 15 ? 1 : t < 38 ? 2 : 3; }
function pickKind() {
  const t = S.time, r = Math.random();
  if (S.mode === 'demo') return ['basic', 'basic', 'tough', 'gold', 'chick'][(Math.random() * 5) | 0];
  const chickP = t < 5 ? 0 : 0.17, toughP = t < 10 ? 0 : 0.15, goldP = t < 3 ? 0 : 0.08;
  if (r < chickP) return 'chick';
  if (r < chickP + toughP) return 'tough';
  if (r < chickP + toughP + goldP) return 'gold';
  return 'basic';
}

function spawn() {
  const now = S.time;
  const free = S.holes.map((h, i) => [h, i]).filter(([h]) => h.st === 'empty' && now - h.vacT > 0.25);
  if (!free.length) return;
  const [h] = free[(Math.random() * free.length) | 0];
  h.kind = pickKind();
  h.st = 'up'; h.t = 0; h.k = 0; h.escaped = false;
  h.hp = h.kind === 'tough' ? 2 : 1;
  const base = lerp(CFG.stayStart, CFG.stayEnd, prog());
  h.stay = base * (h.kind === 'gold' ? 0.6 : h.kind === 'tough' ? 1.35 : 1) * (0.85 + Math.random() * 0.3);
  if (S.mode === 'play') Snd.popup();
}

/* ---------- 입력 ---------- */
function toLocal(e) {
  const r = wrap.getBoundingClientRect();
  return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
}
wrap.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  const p = toLocal(e); spat.x = p.x; spat.y = p.y; spat.mouse = true;
});
wrap.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button') || e.target.closest('.overlay.show')) return;
  e.preventDefault();
  Snd.ensure();
  const p = toLocal(e);
  tap(p.x, p.y);
});

// 화면 좌표 → 가장 그럴듯한 구멍
function holeAt(x, y) {
  let best = null, bd = Infinity;
  HOLES.forEach((g, i) => {
    const s = g.s;
    if (Math.abs(x - g.x) > 60 * s || y < g.y - 120 * s || y > g.y + 26 * s) return;
    const h = S.holes[i];
    const cy = g.y - (h.st === 'empty' ? 10 : 55 * h.k) * s;
    const d = Math.hypot(x - g.x, (y - cy) * 0.8);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

function tap(x, y) {
  spat.x = x; spat.y = y; spat.swingT = vt; spat.shownT = vt;
  if (S.mode !== 'play') return;
  if (S.stuck > 0) {
    Snd.sticky();
    pop('털이 붙어서 못 쳐요!', '#fff0a0', 15, x, y - 30);
    return;
  }
  const i = holeAt(x, y);
  const h = i == null ? null : S.holes[i];
  if (!h || !(h.st === 'up' || h.st === 'stay') || h.k < 0.35) return whiff(x, y);
  hit(i, x, y);
}

function whiff(x, y) {
  Snd.whiff();
  if (S.combo >= CFG.comboAt) pop('콤보 끊김', '#c8c0d8', 15, x, y - 20);
  S.combo = 0;
  for (let n = 0; n < 4; n++) fx.parts.push({ kind: 'dust', x, y: y + 10, vx: (Math.random() - 0.5) * 80, vy: -30 - Math.random() * 40, g: 120, life: 0.35, max: 0.35, r: 3 });
}

function addScore(base, x, y, color) {
  S.combo++;
  S.maxCombo = Math.max(S.maxCombo, S.combo);
  const mul = S.combo >= CFG.comboAt ? CFG.comboMul : 1;
  const pts = Math.round(base * mul);
  S.score += pts;
  pop('+' + pts, color, 24, x, y - 50);
  if (S.combo === CFG.comboAt) { pop('콤보! 점수 ×1.5', '#ffcf4a', 22, 200, 250); Snd.combo(); }
  else if (S.combo > CFG.comboAt && S.combo % 10 === 0) { pop(S.combo + ' 콤보!', '#ffcf4a', 22, 200, 250); Snd.combo(); }
}

function hit(i, x, y) {
  const h = S.holes[i], g = HOLES[i];
  const hx = g.x, hy = g.y - 60 * g.s;
  if (h.kind === 'chick') {
    // 때리면 안 되는 병아리
    S.score = Math.max(0, S.score + CFG.pts.chick);
    S.combo = 0; S.chicks++;
    S.stuck = CFG.stickTime;
    S.flash = 0.8; S.flashC = '255,170,60'; S.shake = 0.6;
    pop(String(CFG.pts.chick), '#ff6a4a', 26, hx, hy - 20);
    pop('삐약! 병아리 털이 붙었다!', '#fff0a0', 17, hx, hy - 50);
    Snd.chick();
    if (navigator.vibrate) navigator.vibrate(120);
    feathers(hx, hy, 18, '#ffe04a', true);
    h.st = 'hit'; h.t = 0; h.hitT = vt;
    return;
  }
  if (h.kind === 'tough' && h.hp > 1) {
    // 첫 방: 선글라스만 날아감
    h.hp--; h.hitT = vt;
    h.t = Math.min(h.t, h.stay * 0.4); // 조금 더 버팀
    Snd.clang();
    pop('한 번 더!', '#ffffff', 20, hx, hy - 40);
    fx.parts.push({ kind: 'shades', x: hx, y: hy - 10, vx: (Math.random() < 0.5 ? -1 : 1) * 120, vy: -220, g: 700, spin: 14, rot: 0, life: 0.9, max: 0.9, s: g.s });
    stars(hx, hy, 5, '#ffffff');
    return;
  }
  S.caught++;
  if (h.kind === 'gold') {
    S.golds++;
    addScore(CFG.pts.gold, hx, hy, '#ffe066');
    Snd.gold(); Snd.squawk();
    stars(hx, hy, 14, '#ffe066');
    feathers(hx, hy, 8, '#ffd84a');
    S.flash = 0.5; S.flashC = '255,230,120';
  } else {
    addScore(h.kind === 'tough' ? CFG.pts.tough : CFG.pts.basic, hx, hy, '#ffffff');
    Snd.hit(); Snd.squawk();
    feathers(hx, hy, 10, h.kind === 'tough' ? '#c8682a' : '#ffffff');
    stars(hx, hy, 5, '#fff4c0');
  }
  pop('꼬꼬댁!', '#ffcf4a', 18, x + 22, y - 16, 0.45);
  h.st = 'hit'; h.t = 0; h.hitT = vt;
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
  fx.pops.length = 0;
  show(null);
  ui.pauseBtn.classList.remove('hidden');
  startCountdown();
}
function startCountdown() { S.mode = 'countdown'; S.cd = { t: 0, n: 3 }; Snd.count(3); }
function pauseGame() {
  if (S.mode !== 'play' && S.mode !== 'countdown') return;
  S.mode = 'paused'; S.cd = null;
  show(ui.pause);
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
addEventListener('keydown', (e) => {
  if (e.code !== 'Enter' && e.code !== 'Space') return;
  if (ui.title.classList.contains('show') || ui.result.classList.contains('show')) { e.preventDefault(); startGame(); }
});

function endGame() {
  S.mode = 'end'; S.endT = vt;
  S.holes.forEach((h) => { if (h.st === 'up' || h.st === 'stay') { h.st = 'down'; h.t = 0; h.escaped = false; } });
  pop('끝!', '#ffcf4a', 54, 200, 300, 1.2);
  Snd.end();
  ui.pauseBtn.classList.add('hidden');
}

function showReward(base, stars) {
  const el = document.getElementById('resReward');
  const W = window.MakdakWallet;
  if (!el || !W) return;
  const earned = W.reward(base, stars);
  const total = W.add(earned);
  el.innerHTML = `<span class="coin">₩</span> <b>+${earned}</b> 축제 코인 획득 <small>(보유 ${W.isInfinite() ? '∞' : total.toLocaleString()})</small><a href="../../gacha.html">카드팩 열기 ▶</a>`;
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
  ui.resCaught.textContent = S.caught;
  ui.resGold.textContent = S.golds;
  ui.resCombo.textContent = S.maxCombo;
  ui.resBest.textContent = save.best;
  ui.resLine.textContent =
    sc < CFG.stars[0] ? '닭들이 너무 빨랐죠? 한 번 더 잡아 볼까요!' :
    sc < CFG.stars[1] ? '오, 뒤집개 솜씨가 좋은데요?' :
    sc < CFG.stars[2] ? '닭 잡기 달인! 닭갈비 2인분 서비스요~' :
                        '전설의 닭잡이! 축제 명예 요리사로 임명합니다!';
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
    if (S.mode === 'demo' && S.time > 30) S.time = 10; // 데모는 적당한 속도로 계속
    S.stuck = Math.max(0, S.stuck - dt);
    S.spawnT -= dt;
    const active = S.holes.filter((h) => h.st !== 'empty').length;
    if (S.spawnT <= 0) {
      if (active < (S.mode === 'demo' ? 2 : maxActive())) spawn();
      S.spawnT = lerp(CFG.spawnStart, CFG.spawnEnd, prog()) * (0.75 + Math.random() * 0.5);
    }
    if (S.mode === 'play') {
      const left = CFG.duration - S.time;
      if (left <= 10 && Math.ceil(left) !== S.lastTick) {
        S.lastTick = Math.ceil(left);
        if (S.lastTick === 10) pop('마지막 10초!', '#ff8a6a', 26, 200, 250);
        if (S.lastTick > 0) Snd.tick();
      }
      if (left <= 0) endGame();
    }
    // 데모: 사장님 대신 보이지 않는 손이 가끔 잡음
    if (S.mode === 'demo') {
      S.holes.forEach((h, i) => {
        if (h.st === 'stay' && h.kind !== 'chick' && h.t > 0.35 && Math.random() < 0.02) {
          const g = HOLES[i];
          spat.x = g.x + 10; spat.y = g.y - 50 * g.s; spat.swingT = vt; spat.shownT = vt;
          if (h.kind === 'tough' && h.hp > 1) { h.hp--; h.hitT = vt; fx.parts.push({ kind: 'shades', x: g.x, y: g.y - 70 * g.s, vx: 120, vy: -220, g: 700, spin: 14, rot: 0, life: 0.9, max: 0.9, s: g.s }); }
          else { h.st = 'hit'; h.t = 0; h.hitT = vt; stars(g.x, g.y - 60 * g.s, 5, '#fff4c0'); }
        }
      });
    }
  }

  if (live) {
    for (const h of S.holes) {
      if (h.st === 'empty') continue;
      h.t += dt;
      if (h.st === 'up') {
        h.k = clamp01(h.t / CFG.rise);
        if (h.t >= CFG.rise) { h.st = 'stay'; h.t = 0; }
      } else if (h.st === 'stay') {
        h.k = 1;
        if (h.t >= h.stay) { h.st = 'down'; h.t = 0; h.escaped = true; }
      } else if (h.st === 'hit') {
        if (h.t >= 0.28) { h.st = 'down'; h.t = 0; }
      } else if (h.st === 'down') {
        h.k = 1 - clamp01(h.t / CFG.sink);
        if (h.t >= CFG.sink) {
          if (h.escaped && h.kind !== 'chick' && S.mode === 'play') onEscape(h);
          Object.assign(h, freshHole(), { vacT: S.time });
        }
      }
    }
  }

  if (S.mode === 'end' && vt - S.endT > 1.4) showResult();

  // 이펙트
  for (const q of fx.parts) {
    q.life -= dt;
    q.vy += (q.g || 0) * dt;
    if (q.drag) { q.vx *= q.drag; q.vy *= q.drag; }
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.spin) q.rot += q.spin * dt;
  }
  fx.parts = fx.parts.filter((q) => q.life > 0);
  for (const q of fx.pops) q.t += dt;
  fx.pops = fx.pops.filter((q) => q.t < q.life);
}

function onEscape(h) {
  if (S.combo >= CFG.comboAt) pop('콤보 끊김', '#c8c0d8', 15, 200, 280);
  S.combo = 0;
}

/* ---------- 이펙트 ---------- */
function pop(text, color, size, x = 200, y = 300, life = 0.8) { fx.pops.push({ text, color, size, x, y, t: 0, life }); }
function stars(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, sp = 90 + Math.random() * 120;
    fx.parts.push({ kind: 'star', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 300, drag: 0.97, life: 0.55, max: 0.55, r: 4 + Math.random() * 3, color });
  }
}
// 맞으면 깃털이 흩날림 (병아리는 보송한 솜털)
function feathers(x, y, n, color, fluff = false) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, sp = 60 + Math.random() * 140;
    fx.parts.push({ kind: fluff ? 'fluff' : 'feather', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 90, drag: 0.94,
      life: 0.9 + Math.random() * 0.5, max: 1.4, r: fluff ? 3 + Math.random() * 3 : 5 + Math.random() * 3,
      rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 8, color, ph: Math.random() * TAU });
  }
}

/* =========================================================
   그리기
   ========================================================= */
function ellipse(x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); }
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
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

/* ---- 배경: 축제 밤하늘 + 나무 평상 ---- */
function buildBackground() {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const g = c.getContext('2d');
  g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);

  let gr = g.createLinearGradient(0, 0, 0, 270);
  gr.addColorStop(0, '#151238'); gr.addColorStop(0.55, '#4a2258'); gr.addColorStop(1, '#c0584a');
  g.fillStyle = gr; g.fillRect(0, 0, W, 270);
  const rnd = seeded(11);
  for (let i = 0; i < 55; i++) {
    g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`;
    g.beginPath(); g.arc(rnd() * W, rnd() * 190, rnd() * 1.2 + 0.3, 0, TAU); g.fill();
  }
  // 먼 산
  g.fillStyle = '#3a2758';
  g.beginPath(); g.moveTo(0, 240);
  [[50, 205], [110, 228], [170, 198], [240, 226], [300, 202], [360, 225], [400, 210]].forEach(([x, y]) => g.lineTo(x, y));
  g.lineTo(W, 270); g.lineTo(0, 270); g.fill();
  // 부스 지붕 줄
  for (let i = 0; i < 6; i++) {
    const x = -20 + i * 76, y = 232, w = 80;
    g.fillStyle = '#2b1d22'; g.fillRect(x + 6, y + 18, w - 12, 30);
    g.fillStyle = '#ffb860'; g.fillRect(x + 14, y + 26, w - 28, 16);
    g.save(); g.beginPath(); g.moveTo(x, y + 20); g.lineTo(x + w / 2, y); g.lineTo(x + w, y + 20); g.closePath(); g.clip();
    for (let s = 0; s < 8; s++) { g.fillStyle = s % 2 ? '#fff3e2' : (i % 2 ? '#2f7fc4' : '#d8432a'); g.fillRect(x + s * (w / 8), y - 2, w / 8 + 1, 24); }
    g.restore();
  }
  // 나무 평상 (원근)
  gr = g.createLinearGradient(0, 262, 0, H);
  gr.addColorStop(0, '#6a4230'); gr.addColorStop(1, '#a0683e');
  g.fillStyle = gr; g.fillRect(0, 262, W, H - 262);
  let y = 262;
  for (let i = 0; y < H; i++) {
    const hgt = 14 + i * 3.2;
    g.fillStyle = i % 2 ? 'rgba(255,220,170,.05)' : 'rgba(0,0,0,.05)';
    g.fillRect(0, y, W, hgt);
    g.strokeStyle = 'rgba(40,20,10,.45)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    // 나뭇결
    g.strokeStyle = 'rgba(60,30,15,.18)'; g.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const yy = y + hgt * (0.3 + k * 0.22), x0 = rnd() * W;
      g.beginPath(); g.moveTo(x0, yy); g.quadraticCurveTo(x0 + 40, yy + 2, x0 + 90 + rnd() * 60, yy); g.stroke();
    }
    y += hgt;
  }
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 262, W, 6);
  return c;
}

const LIGHT_COLORS = ['#ffcf4a', '#ff7a4a', '#7ad0ff', '#ff9ad0', '#a8ff7a'];
function drawLights(t) {
  const [x0, y0, x1, y1, sag] = [-10, 190, 410, 182, 26];
  ctx.strokeStyle = 'rgba(20,10,20,.8)'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let u = 0; u <= 1.0001; u += 0.05) {
    const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u + sag * (1 - (2 * u - 1) ** 2);
    u === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  for (let i = 0; i < 15; i++) {
    const u = (i + 0.5) / 15;
    const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u + sag * (1 - (2 * u - 1) ** 2) + 4;
    const a = 0.65 + 0.35 * Math.sin(t * 3 + i * 1.7);
    ctx.globalAlpha = a * 0.35; ctx.fillStyle = LIGHT_COLORS[i % 5]; circle(x, y, 7); ctx.fill();
    ctx.globalAlpha = a; circle(x, y, 2.8); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---- 짚 둥지 구멍 ---- */
const STRAW = HOLES.map((g) => {
  const r = seeded(100 + g.i * 7);
  const cols = ['#e8c060', '#c89a40', '#f4d88a', '#b8862e'];
  return Array.from({ length: 54 }, () => ({ a: r() * TAU, len: 9 + r() * 11, tilt: (r() - 0.5) * 1.4, c: cols[(r() * 4) | 0], rr: 0.93 + r() * 0.16 }));
});
function strands(g, front) {
  const { x, y, s } = g;
  ctx.lineCap = 'round'; ctx.lineWidth = 2.2 * s;
  for (const st of STRAW[g.i]) {
    if ((Math.sin(st.a) >= 0) !== front) continue;
    const px = x + Math.cos(st.a) * 54 * s * st.rr, py = y + Math.sin(st.a) * 20.5 * s * st.rr;
    const dir = st.a + PI / 2 + st.tilt;
    const dx = Math.cos(dir) * st.len * s * 0.5, dy = Math.sin(dir) * st.len * s * 0.3;
    ctx.strokeStyle = st.c;
    ctx.beginPath(); ctx.moveTo(px - dx, py - dy); ctx.lineTo(px + dx, py + dy); ctx.stroke();
  }
}
function nestBack(g) {
  const { x, y, s } = g;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ellipse(x, y + 9 * s, 66 * s, 25 * s); ctx.fill();
  // 짚 고리 (뒤쪽)
  ctx.strokeStyle = OUT; ctx.lineWidth = 14 * s; ellipse(x, y, 54 * s, 20.5 * s); ctx.stroke();
  ctx.strokeStyle = '#c8963a'; ctx.lineWidth = 10 * s; ellipse(x, y, 54 * s, 20.5 * s); ctx.stroke();
  // 구멍 속
  const gr = ctx.createRadialGradient(x, y + 4 * s, 2, x, y, 48 * s);
  gr.addColorStop(0, '#120a06'); gr.addColorStop(0.7, '#2a1a0e'); gr.addColorStop(1, '#5a3a1c');
  ctx.fillStyle = gr; ellipse(x, y, 47 * s, 16.5 * s); ctx.fill();
  strands(g, false);
}
function nestFront(g) {
  const { x, y, s } = g;
  // 짚 고리 앞쪽 (캐릭터 아랫부분을 가림)
  ctx.lineCap = 'butt';
  ctx.strokeStyle = OUT; ctx.lineWidth = 14 * s;
  ctx.beginPath(); ctx.ellipse(x, y, 54 * s, 20.5 * s, 0, -0.05, PI + 0.05); ctx.stroke();
  ctx.strokeStyle = '#d8a848'; ctx.lineWidth = 10 * s;
  ctx.beginPath(); ctx.ellipse(x, y, 54 * s, 20.5 * s, 0, -0.08, PI + 0.08); ctx.stroke();
  strands(g, true);
}

/* ---- 닭 얼굴 (입 대신 부리) ---- */
function beak(y, sc, open) {
  ctx.fillStyle = '#ffa820'; ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  const w = 7.5 * sc, hh = 9 * sc;
  if (open) {
    ctx.fillStyle = '#7a1818'; ellipse(0, y + hh * 0.55, w * 0.7, hh * 0.45); ctx.fill();
    ctx.fillStyle = '#ffa820';
    ctx.beginPath(); ctx.moveTo(-w, y - 1); ctx.lineTo(w, y - 1); ctx.lineTo(0, y + hh * 0.45); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w * 0.75, y + hh * 0.75); ctx.lineTo(w * 0.75, y + hh * 0.75); ctx.lineTo(0, y + hh * 1.3); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(w, y); ctx.lineTo(0, y + hh); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ellipse(-w * 0.3, y + 2.5 * sc, w * 0.3, 1.5 * sc); ctx.fill();
  }
}
function chickenFace(y, o = {}) {
  const { gap = 12, eyeR = 4.6, ko = false, cry = false, angry = false, blink = false, big = false, open = false, beakSc = 1 } = o;
  ctx.fillStyle = 'rgba(255,120,130,.55)';
  ellipse(-gap - 9, y + 8, 7, 4.2); ctx.fill(); ellipse(gap + 9, y + 8, 7, 4.2); ctx.fill();
  ctx.strokeStyle = '#1a0a08'; ctx.lineCap = 'round'; ctx.lineWidth = 2.6;
  [-1, 1].forEach((sd) => {
    const ex = sd * gap;
    if (ko) { ctx.beginPath(); ctx.moveTo(ex - 4, y - 4); ctx.lineTo(ex + 4, y + 4); ctx.moveTo(ex + 4, y - 4); ctx.lineTo(ex - 4, y + 4); ctx.stroke(); }
    else if (cry) { ctx.beginPath(); ctx.moveTo(ex - 5 * sd, y - 4); ctx.lineTo(ex + 3 * sd, y); ctx.lineTo(ex - 5 * sd, y + 4); ctx.stroke(); }
    else if (blink) { ctx.beginPath(); ctx.moveTo(ex - eyeR, y + 1); ctx.lineTo(ex + eyeR, y + 1); ctx.stroke(); }
    else {
      ctx.fillStyle = '#1a0a08'; ellipse(ex, y, eyeR, eyeR * 1.3); ctx.fill();
      ctx.fillStyle = '#fff'; circle(ex + 1.4, y - 2, eyeR * 0.4); ctx.fill();
      if (big) { circle(ex - 1.5, y + 2.2, eyeR * 0.22); ctx.fill(); }
    }
    if (angry && !ko) { ctx.strokeStyle = '#3a0a04'; ctx.beginPath(); ctx.moveTo(ex + sd * 8, y - 12); ctx.lineTo(ex - sd * 3, y - 7); ctx.stroke(); ctx.strokeStyle = '#1a0a08'; }
  });
  if (cry) {
    ctx.fillStyle = 'rgba(120,200,255,.9)';
    ellipse(-gap - 3, y + 10, 2.5, 5); ctx.fill(); ellipse(gap + 3, y + 10, 2.5, 5); ctx.fill();
  }
  beak(y + 4, beakSc, open || ko || cry);
}
const blinking = (t, ph) => ((t + ph) % 3.1) < 0.13;

/* ---- 둥지에서 튀어나오는 닭들 ---- */
const COLORS = {
  basic: { body: ['#ffffff', '#f6f1e8', '#d6cbb8'], wing: '#efe8dc', comb: '#e8302a' },
  gold:  { body: ['#fff0a0', '#f2b21c', '#9a6006'], wing: '#e8a418', comb: '#e8302a' },
  tough: { body: ['#f6b066', '#c8682a', '#6e3412'], wing: '#9a4a1a', comb: '#c81a14' },
  chick: { body: ['#fffef0', '#fff38a', '#f0cc40'], wing: '#ffe866', comb: null },
};

function drawChar(h, g, t) {
  const { x, s } = g;
  const kind = h.kind, C = COLORS[kind];
  const small = kind === 'chick';
  const hitAge = vt - h.hitT;
  const isHit = h.st === 'hit' || (h.st === 'down' && !h.escaped && hitAge < 0.6);
  const squash = isHit ? Math.max(0, 1 - hitAge / 0.25) : 0;
  const base = g.y + 70 * s - h.k * (small ? 78 : 90) * s;
  const R = small ? 30 : 36;          // 머리·몸 반지름
  const cy = small ? -30 : -44;       // 머리·몸 중심

  ctx.save();
  ctx.beginPath(); ctx.rect(x - 90 * s, 0, 180 * s, g.y + 1); ctx.clip();
  ctx.translate(x, base);
  ctx.scale(s * (1 + squash * 0.18), s * (1 - squash * 0.22));
  if (!isHit) ctx.rotate(Math.sin(t * 6 + g.i) * (small ? 0.09 : 0.06));

  if (kind === 'gold') {
    const hr = R * 1.9 + Math.sin(t * 6) * 4;
    const hg = ctx.createRadialGradient(0, cy, R * 0.6, 0, cy, hr);
    hg.addColorStop(0, 'rgba(255,215,80,.75)'); hg.addColorStop(1, 'rgba(255,180,30,0)');
    ctx.fillStyle = hg; circle(0, cy, hr); ctx.fill();
    ctx.save(); ctx.translate(0, cy); ctx.rotate(t * 0.8);
    ctx.strokeStyle = 'rgba(255,230,140,.45)'; ctx.lineWidth = 3;
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 1.15, Math.sin(a) * R * 1.15); ctx.lineTo(Math.cos(a) * R * 1.75, Math.sin(a) * R * 1.75); ctx.stroke(); }
    ctx.restore();
  }
  // 볏 (머리 뒤로 살짝 겹치게 먼저)
  if (C.comb) {
    const bumps = kind === 'tough'
      ? [[-16, -2, 8], [-8, -9, 10], [2, -12, 11], [12, -8, 10], [20, -1, 8]]
      : [[-9, -3, 8], [0, -9, 9.5], [10, -3, 8]];
    const topY = cy - R + 2;
    ctx.beginPath();
    bumps.forEach(([bx, by, r]) => { ctx.moveTo(bx + r, topY + by); ctx.arc(bx, topY + by, r, 0, TAU); });
    ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = C.comb; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ellipse(-4, topY - 10, 3, 2); ctx.fill();
  } else {
    // 병아리 정수리 깃털 세 가닥
    ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.lineCap = 'round';
    const tuft = () => { ctx.beginPath(); [-5, 0, 5].forEach((dx) => { ctx.moveTo(dx * 0.6, cy - R + 3); ctx.quadraticCurveTo(dx * 1.6, cy - R - 8, dx * 2.2 + 2, cy - R - 12); }); };
    tuft(); ctx.stroke(); ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 2.6; tuft(); ctx.stroke();
  }

  // 몸 (머리와 몸이 하나인 동글동글한 마스코트 체형, 아래는 둥지 속으로)
  ctx.beginPath();
  ctx.moveTo(R, cy); ctx.arc(0, cy, R, 0, TAU);
  ctx.moveTo(R * 1.02, cy + R * 0.9); ctx.ellipse(0, cy + R * 0.9, R * 1.02, R * 0.95, 0, 0, TAU);
  ctx.strokeStyle = OUT; ctx.lineWidth = 5.5; ctx.stroke();
  const gr = ctx.createRadialGradient(-R * 0.35, cy - R * 0.45, 4, 0, cy + R * 0.2, R * 1.8);
  gr.addColorStop(0, C.body[0]); gr.addColorStop(0.55, C.body[1]); gr.addColorStop(1, C.body[2]);
  ctx.fillStyle = gr; ctx.fill();
  // 가슴 깃털 결
  ctx.save(); ctx.clip();
  if (kind === 'tough') { ctx.fillStyle = 'rgba(255,220,160,.45)'; ellipse(0, cy + R * 1.1, R * 0.55, R * 0.6); ctx.fill(); }
  ctx.strokeStyle = small ? 'rgba(220,160,20,.45)' : 'rgba(120,90,60,.22)'; ctx.lineWidth = 1.6;
  for (let row = 0; row < 3; row++) for (let k = -2; k <= 2; k++) {
    const fx0 = k * 11 + (row % 2) * 5.5, fy0 = cy + R * 0.75 + row * 9;
    ctx.beginPath(); ctx.arc(fx0, fy0, 5, 0.15 * PI, 0.85 * PI); ctx.stroke();
  }
  ctx.restore();
  // 윤기
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ellipse(-R * 0.45, cy - R * 0.55, R * 0.18, R * 0.1, -0.6); ctx.fill();

  // 날개 (퍼덕퍼덕, 맞으면 허둥지둥)
  const flap = isHit ? Math.sin(t * 42) * 0.7 : Math.sin(t * 8 + g.i * 2) * 0.28;
  [-1, 1].forEach((sd) => {
    ctx.save();
    ctx.translate(sd * (R * 0.92), cy + R * 0.55);
    ctx.rotate(sd * (0.45 + flap * (sd > 0 ? 1 : -1)));
    ctx.fillStyle = C.wing; ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, -R * 0.28, R * 0.3, R * 0.55, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(58,26,16,.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-R * 0.12, -R * 0.62); ctx.lineTo(-R * 0.08, -R * 0.2); ctx.moveTo(R * 0.1, -R * 0.6); ctx.lineTo(R * 0.12, -R * 0.15); ctx.stroke();
    ctx.restore();
  });

  // 턱볏 (빨간 육수)
  const fy = cy - 4;
  if (C.comb) {
    ctx.fillStyle = C.comb; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, fy + 21, 5, 7, 0, 0, TAU); ctx.fill(); ctx.stroke();
  }

  // 얼굴
  if (isHit) chickenFace(fy, small ? { cry: true, gap: 11 } : { ko: true });
  else if (small) chickenFace(fy, { gap: 11, eyeR: 5.2, big: true, beakSc: 0.75, blink: blinking(t, g.i) });
  else if (kind === 'tough' && h.hp > 1) {
    chickenFace(fy, {});
    // 숯불 닭갈비 카드의 그 선글라스
    ctx.fillStyle = '#16161c'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    rrect(-25, fy - 8, 21, 14, 5); ctx.fill(); rrect(4, fy - 8, 21, 14, 5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-5, fy - 4); ctx.lineTo(5, fy - 4); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-21, fy - 5, 6, 2.5); ctx.fillRect(8, fy - 5, 6, 2.5);
  } else chickenFace(fy, { angry: kind === 'tough', blink: blinking(t, g.i * 0.7) });

  if (kind === 'gold') { // 왕관 + 반짝이
    ctx.save(); ctx.translate(20, cy - R - 2); ctx.rotate(0.35);
    ctx.fillStyle = '#ffe066'; ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-11, 6); ctx.lineTo(-11, -8); ctx.lineTo(-5, -1); ctx.lineTo(0, -11); ctx.lineTo(5, -1); ctx.lineTo(11, -8); ctx.lineTo(11, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff5a7a'; circle(0, 1, 2.3); ctx.fill();
    ctx.restore();
    for (let k = 0; k < 3; k++) {
      const a = t * 3 + k * 2.1, r = 50 + Math.sin(t * 5 + k) * 6;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 9 + k * 2);
      star(Math.cos(a) * r, cy + Math.sin(a) * r * 0.7, 5, '#fff6b0');
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ---- 타이틀 화면의 닭 소개 그림 (게임과 같은 그림 함수로 그림) ---- */
function drawPortraits() {
  document.querySelectorAll('canvas.portrait').forEach((cv) => {
    const w = cv.clientWidth, hh = cv.clientHeight;
    if (!w || !hh) return;
    const d = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = Math.round(w * d); cv.height = Math.round(hh * d);
    const pc = cv.getContext('2d');
    pc.setTransform(d, 0, 0, d, 0, 0);
    const bgr = pc.createLinearGradient(0, 0, 0, hh);
    bgr.addColorStop(0, '#3b1f55'); bgr.addColorStop(1, '#c0584a');
    pc.fillStyle = bgr; pc.fillRect(0, 0, w, hh);
    const prev = ctx; ctx = pc;
    const sc = hh / 118;
    drawChar({ kind: cv.dataset.kind, st: 'stay', k: 1, hp: 2, hitT: -9, escaped: false }, { x: w / 2, y: hh * 1.02, s: sc, i: 2 }, 0.4);
    ctx = prev;
  });
}

/* ---- 뒤집개 ---- */
function drawSpatula(t) {
  const touchShow = vt - spat.shownT < 0.5;
  if (!spat.mouse && !touchShow) return;
  if (S.mode === 'result') return;
  const age = vt - spat.swingT;
  // 내려치기: 들고 있다가(−0.7) → 쾅(0.15) → 복귀(−0.35)
  let ang = -0.35;
  if (age < 0.06) ang = lerp(-0.75, 0.15, age / 0.06);
  else if (age < 0.2) ang = lerp(0.15, -0.35, (age - 0.06) / 0.14);
  const stuck = S.stuck > 0;
  const fever = S.combo >= CFG.comboAt;
  if (!spat.mouse) ctx.globalAlpha = Math.min(1, (0.5 - (vt - spat.shownT)) * 4);
  ctx.save();
  ctx.translate(spat.x + 38, spat.y + 62);
  ctx.rotate(ang + (stuck ? Math.sin(t * 30) * 0.05 : 0));
  // 손잡이
  ctx.fillStyle = '#8a5a2a'; ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
  rrect(-5, -6, 10, 48, 4); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.rotate(-0.55);
  // 자루
  ctx.fillStyle = '#c98a4a'; rrect(-4, -58, 8, 56, 3); ctx.fill(); ctx.stroke();
  // 날
  if (fever) { ctx.shadowColor = '#ff8a2a'; ctx.shadowBlur = 16 + Math.sin(t * 20) * 6; }
  ctx.fillStyle = fever ? '#ffb24a' : '#d89a5a';
  rrect(-17, -96, 34, 42, 8); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#d8321a'; ellipse(-5, -86, 8, 5); ctx.fill(); ellipse(6, -70, 4, 6); ctx.fill();
  if (stuck) {
    const r = seeded(3);
    for (let k = 0; k < 22; k++) { ctx.fillStyle = k % 3 ? '#ffe04a' : '#fff6b0'; circle(-14 + r() * 28, -92 + r() * 34, 2.5 + r() * 2.5); ctx.fill(); }
  }
  ctx.restore();
  ctx.restore();
  ctx.globalAlpha = 1;
  if (stuck) { // 남은 시간 고리
    const k = S.stuck / CFG.stickTime;
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 6; circle(spat.x, spat.y - 10, 22); ctx.stroke();
    ctx.strokeStyle = '#ffe04a'; ctx.beginPath(); ctx.arc(spat.x, spat.y - 10, 22, -PI / 2, -PI / 2 + TAU * k); ctx.stroke();
  }
}

/* ---- HUD ---- */
function drawHUD(t) {
  if (!['play', 'countdown', 'paused', 'end'].includes(S.mode)) return;
  // 남은 시간 막대
  const left = Math.max(0, CFG.duration - S.time), k = left / CFG.duration;
  const warn = left <= 10;
  ctx.fillStyle = 'rgba(0,0,0,.4)'; rrect(16, 78, 368, 16, 8); ctx.fill();
  ctx.fillStyle = warn ? (Math.sin(t * 12) > 0 ? '#ff5a3a' : '#ff8a5a') : '#ffcf4a';
  if (k > 0) { rrect(18, 80, Math.max(12, 364 * k), 12, 6); ctx.fill(); }
  ctx.textAlign = 'right'; ctx.font = `800 13px ${FONT()}`; ctx.fillStyle = '#fff';
  ctx.fillText(Math.ceil(left) + '초', 380, 70);

  ctx.textAlign = 'left'; ctx.font = `700 13px ${FONT()}`; ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillText(`최고 ${Math.max(save.best, S.score)}점`, 16, 30);
  ctx.fillText(`잡은 닭 ${S.caught}`, 16, 50);

  ctx.textAlign = 'center';
  ctx.font = `900 54px ${FONT()}`; ctx.lineJoin = 'round'; ctx.lineWidth = 9; ctx.strokeStyle = '#2a1030';
  ctx.strokeText(S.score, 200, 150); ctx.fillStyle = '#fff'; ctx.fillText(S.score, 200, 150);
  if (S.combo >= 2) {
    const fever = S.combo >= CFG.comboAt;
    ctx.font = `900 17px ${FONT()}`;
    ctx.fillStyle = fever ? '#ffcf4a' : '#ffe9c0';
    ctx.fillText(fever ? `🔥 ${S.combo} 콤보 ×1.5` : `${S.combo} 콤보`, 200, 176);
  }
  if (S.mode === 'countdown' && S.cd && S.cd.n > 0) {
    const kk = S.cd.t;
    ctx.save(); ctx.translate(200, 330); ctx.scale(1.4 - kk * 0.4, 1.4 - kk * 0.4); ctx.globalAlpha = 1 - kk * 0.6;
    ctx.font = `900 110px ${FONT()}`; ctx.lineWidth = 12; ctx.strokeStyle = '#2a1030'; ctx.strokeText(S.cd.n, 0, 36);
    ctx.fillStyle = '#ffcf4a'; ctx.fillText(S.cd.n, 0, 36);
    ctx.restore();
  }
}

function drawPops() {
  ctx.textAlign = 'center';
  for (const q of fx.pops) {
    const k = q.t / q.life;
    const s = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, k - 0.15);
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
    else if (q.kind === 'feather') {
      const sway = Math.sin(vt * 9 + q.ph) * 6;
      ctx.save(); ctx.translate(q.x + sway, q.y); ctx.rotate(q.rot);
      ctx.fillStyle = q.color; ctx.strokeStyle = 'rgba(58,26,16,.6)'; ctx.lineWidth = 1;
      ellipse(0, 0, q.r * 1.6, q.r * 0.6); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-q.r * 1.6, 0); ctx.lineTo(q.r * 1.9, 0); ctx.stroke();
      ctx.restore();
    } else if (q.kind === 'fluff') {
      ctx.fillStyle = q.color; circle(q.x + Math.sin(vt * 8 + q.ph) * 4, q.y, q.r); ctx.fill();
    }
    else if (q.kind === 'dust') { ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#d8b08a'; circle(q.x, q.y, q.r); ctx.fill(); }
    else if (q.kind === 'shades') {
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.scale(q.s, q.s);
      ctx.fillStyle = '#16161c'; rrect(-25, -7, 21, 14, 5); ctx.fill(); rrect(4, -7, 21, 14, 5); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-5, -3); ctx.lineTo(5, -3); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

function render() {
  const t = vt;
  if (!bgCache) bgCache = buildBackground();
  const sk = S.shake * S.shake * 8;
  const ox = (Math.random() - 0.5) * sk, oy = (Math.random() - 0.5) * sk;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bgCache, ox * scale * dpr, oy * scale * dpr);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox * scale * dpr, oy * scale * dpr);

  drawLights(t);
  // 뒷줄부터 그려야 앞줄 캐릭터가 위에 겹침
  HOLES.forEach((g, i) => {
    const h = S.holes[i];
    nestBack(g);
    if (h.st !== 'empty') drawChar(h, g, t);
    nestFront(g);
  });
  drawParts();
  drawHUD(t);
  drawPops();
  drawSpatula(t);
  if (S.flash > 0) { ctx.fillStyle = `rgba(${S.flashC},${S.flash * 0.3})`; ctx.fillRect(0, 0, W, H); }
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
window.__wm = { get state() { return S; }, CFG, HOLES, step: update, tap, startGame };
})();
