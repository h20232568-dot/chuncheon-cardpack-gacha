/* =========================================================
   막 넘고 닭 넘어 — 춘천 닭갈비 막국수 축제 미니게임 1
   철판대장 닭갈비 + 메밀 막국수가 면발 줄을 돌리고
   축제 사장님이 넘는다.
   ========================================================= */
(() => {
'use strict';

/* ---------- 설정 ---------- */
const W = 400, H = 720, GROUND = 600, CX = 200;
const PI = Math.PI, TAU = PI * 2;
const CFG = {
  period0: 1.15,     // 첫 속도: 줄 한 바퀴(초)
  speedUp: 1.08,     // 10회마다 8% 빨라짐
  stepEvery: 10,
  minPeriod: 0.45,
  perfectMs: 80,     // ±80ms 이내 Perfect
  wobbleFrom: 30,    // 30회부터 박자 흔들기
  doubleFrom: 50,    // 50회부터 2단 뛰기
  doubleSpeed: 3,    // 2단 뛰기 구간 줄 속도 (일반 점프 두 번으론 못 넘게)
  holdMs: 90,        // 이만큼 누르고 있으면 높이 점프
  recover: 0.08,     // 착지 후 다시 뛸 수 있을 때까지(초)
  stars: [10, 30, 60],
};
const SAVE_KEY = 'chuncheon.minigame.jumprope';

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const wrap = $('wrap'), canvas = $('game'), ctx = canvas.getContext('2d');
const ui = {
  title: $('title'), pause: $('pause'), result: $('result'),
  startBtn: $('startBtn'), resumeBtn: $('resumeBtn'), quitBtn: $('quitBtn'),
  retryBtn: $('retryBtn'), homeBtn: $('homeBtn'),
  muteBtn: $('muteBtn'), pauseBtn: $('pauseBtn'),
  bestTitle: $('bestTitle'), starsTitle: $('starsTitle'),
  resJumps: $('resJumps'), resStars: $('resStars'), newBest: $('newBest'),
  resScore: $('resScore'), resPerfect: $('resPerfect'), resStreak: $('resStreak'),
  resBest: $('resBest'), resLine: $('resLine'),
};

/* ---------- 저장 ---------- */
function loadSave() {
  try { return Object.assign({ best: 0, bestScore: 0, stars: 0 }, JSON.parse(localStorage.getItem(SAVE_KEY))); }
  catch { return { best: 0, bestScore: 0, stars: 0 }; }
}
let save = loadSave();
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} }
const starCount = (n) => CFG.stars.filter((s) => n >= s).length;

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
addEventListener('resize', resize);
resize();

/* ---------- 소리 (WebAudio로 직접 합성) ---------- */
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
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, gain, freq) {
    if (!this.on || !this.ac) return;
    const c = this.ac, t = c.currentTime;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = gain;
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
  },
  tick()    { this.noise(0.05, 0.35, 1400); this.tone(110, 0.07, 'sine', 0.22); },
  jump()    { this.tone(320, 0.12, 'sine', 0.08, 640); },
  high()    { this.tone(300, 0.25, 'triangle', 0.1, 900); },
  perfect() { this.tone(988, 0.09, 'triangle', 0.1); this.tone(1318, 0.14, 'triangle', 0.1, 0, 0.06); },
  good()    { this.tone(660, 0.09, 'triangle', 0.08); },
  fail()    { this.tone(420, 0.5, 'sawtooth', 0.12, 90); this.noise(0.25, 0.3, 600); },
  levelUp() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.15, 'square', 0.05, 0, i * 0.07)); },
  count(n)  { this.tone(n ? 600 : 900, n ? 0.12 : 0.3, 'square', 0.06); },
  boom()    { this.noise(0.4, 0.18, 500); },
  whistle() { this.tone(500, 0.55, 'sine', 0.025, 1500); },
};
function updateMuteBtn() { ui.muteBtn.textContent = Snd.on ? '🔊' : '🔇'; }
updateMuteBtn();

/* ---------- 상태 ---------- */
let S;
function freshState(mode) {
  return {
    mode,                 // demo | countdown | play | paused | fail | result
    time: 0,
    theta: PI,            // 줄 각도. 2πk 일 때 바닥(발밑)
    period: mode === 'demo' ? 1.0 : CFG.period0,
    level: 1,
    revFactor: new Map([[0, 0.7]]), // 회차별 속도 배율 (첫 반 바퀴는 천천히)
    warn: new Set(),      // 빨간 면발(2단 뛰기 예고) 회차
    doubleAt: -1,         // 2단 뛰기 첫 바닥 번호
    lastScheduled: 1,
    jumps: 0, score: 0, streak: 0, maxStreak: 0, perfects: 0,
    p: { t0: -99, air: 0, baseAir: 0, y: 0, vy: 0, g: 0, extended: false, landT: -99 },
    pressed: false, holdStart: 0,
    cd: null, failT: 0, flash: 0,
    mood: null, moodT: -9,   // 캐릭터 표정 연출 (cheer / shock)
    freeze: 0, shake: 0,     // 실패 순간 멈칫 + 화면 흔들림
    beatV: -9,               // 마지막으로 줄이 바닥을 친 시각 (관중 들썩임)
  };
}
S = freshState('demo');

const fx = { parts: [], pops: [] };

/* ---------- 줄 관련 계산 ---------- */
const revOf = (theta) => Math.floor(theta / TAU);
const factor = (rev) => S.revFactor.get(rev) || 1;
const omega = () => (TAU / S.period) * factor(revOf(S.theta));
const airtimeFor = (period) => Math.min(0.5, Math.max(0.3, period * 0.5));
const isGrounded = (t) => t >= S.p.t0 + S.p.air;

/* ---------- 입력 ---------- */
let lastFrameReal = performance.now();
const inputTime = () => S.time + Math.min(0.05, Math.max(0, (performance.now() - lastFrameReal) / 1000));

function press() {
  if (S.mode !== 'play') return;
  S.pressed = true;
  const t = inputTime();
  S.holdStart = t;
  if (t - (S.p.t0 + S.p.air) >= CFG.recover) startJump(t);
}
function release() { S.pressed = false; }

function startJump(t) {
  const p = S.p, air = airtimeFor(S.period), h = 62;
  p.t0 = t; p.air = air; p.baseAir = air; p.extended = false;
  p.g = 8 * h / (air * air);
  p.vy = 4 * h / air;
  p.y = 0;
  if (S.mode === 'play') Snd.jump();
}

// 길게 누르면 공중에서 체공시간을 늘려 2단 뛰기
function tryExtend() {
  const p = S.p;
  if (!S.pressed || p.extended || isGrounded(S.time)) return;
  if (S.time - S.holdStart < CFG.holdMs / 1000) return;
  const next = revOf(S.theta) + 1;
  if (next !== S.doubleAt && next !== S.doubleAt + 1) return;
  p.extended = true;
  p.air += S.period / CFG.doubleSpeed + 0.04;
  const Tr = p.t0 + p.air - S.time;
  p.g = 2 * (p.y + p.vy * Tr) / (Tr * Tr);
  Snd.high();
}

wrap.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button') || e.target.closest('.overlay.show')) return;
  e.preventDefault();
  Snd.ensure();
  press();
});
addEventListener('pointerup', release);
addEventListener('pointercancel', release);
addEventListener('keydown', (e) => {
  if (e.code !== 'Space' && e.code !== 'ArrowUp' && e.code !== 'Enter') return;
  e.preventDefault();
  if (e.repeat) return;
  Snd.ensure();
  if (S.mode === 'play') press();
  else if (ui.title.classList.contains('show')) startGame();
  else if (ui.result.classList.contains('show')) startGame();
});
addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') release(); });

/* ---------- 화면 전환 ---------- */
function show(el) { [ui.title, ui.pause, ui.result].forEach((o) => o.classList.toggle('show', o === el)); }

function goTitle() {
  S = freshState('demo');
  ui.bestTitle.textContent = save.best;
  ui.starsTitle.textContent = '★'.repeat(save.stars) + '☆'.repeat(3 - save.stars);
  ui.pauseBtn.classList.add('hidden');
  show(ui.title);
}

function startGame() {
  Snd.ensure();
  S = freshState('countdown');
  fx.pops.length = 0;
  show(null);
  ui.pauseBtn.classList.remove('hidden');
  startCountdown(() => { S.mode = 'play'; });
}

function startCountdown(done) {
  const prev = S.mode === 'paused' ? 'paused' : 'countdown';
  S.mode = 'countdown';
  S.cd = { t: 0, n: 3, done, prev };
  Snd.count(3);
}

function pauseGame() {
  if (S.mode !== 'play' && S.mode !== 'countdown') return;
  S.mode = 'paused';
  S.pressed = false;
  S.cd = null;
  show(ui.pause);
}

ui.startBtn.addEventListener('click', startGame);
ui.retryBtn.addEventListener('click', startGame);
ui.homeBtn.addEventListener('click', goTitle);
ui.quitBtn.addEventListener('click', goTitle);
ui.pauseBtn.addEventListener('click', pauseGame);
ui.resumeBtn.addEventListener('click', () => { show(null); Snd.ensure(); startCountdown(() => { S.mode = 'play'; }); });
ui.muteBtn.addEventListener('click', () => {
  Snd.on = !Snd.on; Snd.ensure();
  localStorage.setItem(SAVE_KEY + '.mute', Snd.on ? '0' : '1');
  updateMuteBtn();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

/* ---------- 판정 ---------- */
function onBottom(k, tb) {
  const p = S.p;
  const airborne = tb >= p.t0 && tb <= p.t0 + p.air;
  dust(CX, GROUND + 4, airborne ? 5 : 10);
  S.beatV = vt;

  if (S.mode === 'demo') return;
  Snd.tick();

  if (!airborne) return fail();

  const isDouble = k === S.doubleAt || k === S.doubleAt + 1;
  S.jumps++;
  if (isDouble) {
    if (k === S.doubleAt) pop('하나!', '#ffb0a0', 26);
    else {
      S.score += 50;
      pop('2단 뛰기 성공!', '#ff6a4a', 30);
      setMood('cheer');
      Snd.levelUp();
      firework(); firework();
    }
  } else {
    const center = p.t0 + p.baseAir / 2;
    const off = Math.abs(tb - center) * 1000;
    if (off <= CFG.perfectMs) {
      S.streak++; S.perfects++;
      S.maxStreak = Math.max(S.maxStreak, S.streak);
      S.score += 10 + Math.min(S.streak, 10) * 2;
      pop('Perfect!', '#ffe066', 28);
      Snd.perfect();
      perfectFx();
      if (S.streak % 10 === 0) { setMood('cheer'); pop(S.streak + '연속 Perfect!', '#ffcf4a', 22, 360); firework(); }
    } else {
      S.streak = 0;
      S.score += 5;
      pop('Good', '#bfe6ff', 22);
      Snd.good();
    }
  }

  if (S.jumps % CFG.stepEvery === 0) {
    const before = S.period;
    S.period = Math.max(CFG.minPeriod, S.period / CFG.speedUp);
    if (S.period < before) {
      S.level++;
      pop(`속도 UP!  Lv.${S.level}`, '#ffffff', 24, 250);
      setMood('cheer');
      Snd.levelUp();
    } else {
      pop(`${S.jumps}회 돌파!`, '#ffffff', 24, 250);
    }
    firework();
  }
  schedule(k);
}

// 두 바퀴 앞의 회차에 이벤트(박자 흔들기 / 2단 뛰기) 예약
function schedule(k) {
  const r = k + 2;
  if (r <= S.lastScheduled) return;
  S.lastScheduled = r;
  const busy = (n) => S.revFactor.has(n) || S.warn.has(n);
  if (S.jumps >= CFG.doubleFrom && S.doubleAt < k - 2 && !busy(r - 1) && !busy(r) && Math.random() < 0.22) {
    S.doubleAt = r;
    S.revFactor.set(r, CFG.doubleSpeed);
    S.warn.add(r - 1); S.warn.add(r);
    return;
  }
  if (S.jumps >= CFG.wobbleFrom && !busy(r) && r !== S.doubleAt + 1 && Math.random() < 0.2) {
    S.revFactor.set(r, Math.random() < 0.5 ? 0.8 : 1.2);
  }
}

function fail() {
  S.mode = 'fail';
  S.failT = S.time;
  S.streak = 0;
  S.flash = 1;
  S.pressed = false;
  S.freeze = 0.18;
  S.shake = 1;
  setMood('shock');
  Snd.fail();
  if (navigator.vibrate) navigator.vibrate(200);
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
  const n = S.jumps, stars = starCount(n);
  const isNew = n > save.best;
  if (isNew) save.best = n;
  save.bestScore = Math.max(save.bestScore, S.score);
  save.stars = Math.max(save.stars, stars);
  writeSave();
  // 축제 코인 지급 (넘은 횟수 × 2 + 별 보너스) → 카드팩에서 사용
  showReward(n * 2, stars);

  ui.resJumps.textContent = n;
  [...ui.resStars.children].forEach((el, i) => {
    el.classList.remove('on'); void el.offsetWidth;
    el.classList.toggle('on', i < stars);
  });
  ui.newBest.classList.toggle('hidden', !isNew || n === 0);
  ui.resScore.textContent = S.score;
  ui.resPerfect.textContent = S.perfects;
  ui.resStreak.textContent = S.maxStreak;
  ui.resBest.textContent = save.best;
  ui.resLine.textContent =
    n < 10 ? '아이고, 면발이 발에 걸렸네요! 한 번 더 해볼까요?' :
    n < 30 ? '오~ 제법인데요? 닭갈비 1인분 서비스!' :
    n < 60 ? '대단해요! 막국수 사리 추가요~' :
             '줄넘기 왕 등극! 오늘은 사장님이 쏜다!';
  show(ui.result);
}

/* ---------- 업데이트 ---------- */
let vt = 0; // 화면 연출용 시계 (항상 흐름)
function update(dt) {
  vt += dt;
  // 게임 시계는 일시정지·카운트다운 중엔 멈춤 (공중에 뜬 채 멈췄다가 이어서 진행)
  if (S.freeze > 0) S.freeze -= dt;
  else if (S.mode !== 'paused' && S.mode !== 'countdown') S.time += dt;
  S.shake = Math.max(0, S.shake - dt * 2.5);
  S.flash = Math.max(0, S.flash - dt * 2.5);

  if (S.mode === 'countdown') {
    S.cd.t += dt;
    if (S.cd.t >= 1) {
      S.cd.t -= 1; S.cd.n--;
      Snd.count(S.cd.n);
      if (S.cd.n === 0) pop('시작!', '#ffe066', 44, 330);
      if (S.cd.n < 0) { const d = S.cd.done; S.cd = null; d(); }
    }
  }

  if (S.mode === 'play' || S.mode === 'demo') {
    // 데모: 사장님이 알아서 뛴다
    if (S.mode === 'demo' && isGrounded(S.time)) {
      const w = omega();
      const tn = (TAU * (revOf(S.theta) + 1) - S.theta) / w;
      if (tn <= airtimeFor(S.period) / 2 && tn > 0) startJump(S.time);
    }

    const rev = revOf(S.theta), w = omega();
    S.theta += w * dt;
    const nrev = revOf(S.theta);
    if (nrev > rev) {
      const tb = S.time - (S.theta - TAU * nrev) / w;
      onBottom(nrev, tb);
    }
    if (S.mode === 'play') tryExtend();
  }

  // 사장님 점프 물리
  const p = S.p;
  if (S.mode !== 'paused' && S.mode !== 'countdown') {
    if (!isGrounded(S.time)) {
      p.vy -= p.g * dt;
      p.y = Math.max(0, p.y + p.vy * dt);
    } else if (p.y > 0 || p.vy !== 0) {
      p.y = 0; p.vy = 0; p.landT = S.time;
    }
  }

  if (S.mode === 'fail' && S.time - S.failT > 1.5) showResult();

  // 이펙트
  const born = [];
  for (const q of fx.parts) {
    q.life -= dt;
    q.vy += (q.g || 0) * dt;
    q.vx *= q.drag || 1; q.vy *= q.drag || 1;
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.kind === 'rocket') {
      born.push({ kind: 'spark', x: q.x, y: q.y, vx: (Math.random() - 0.5) * 16, vy: 25, g: 0, life: 0.35, max: 0.35, r: 1.4, color: '#ffd9a0' });
      if (q.life <= 0) burst(q.x, q.y, q.color, born);
    }
  }
  fx.parts = fx.parts.filter((q) => q.life > 0).concat(born);
  for (const q of fx.pops) { q.t += dt; }
  fx.pops = fx.pops.filter((q) => q.t < q.life);
}

/* ---------- 이펙트 ---------- */
function pop(text, color, size, y = 300) {
  fx.pops.push({ text, color, size, x: CX, y, t: 0, life: 0.9 });
}
function dust(x, y, n) {
  for (let i = 0; i < n; i++) {
    fx.parts.push({ kind: 'dust', x: x + (Math.random() - 0.5) * 120, y, vx: (Math.random() - 0.5) * 60,
      vy: -20 - Math.random() * 40, g: 60, life: 0.4 + Math.random() * 0.3, max: 0.7, r: 3 + Math.random() * 4 });
  }
}
const FW_COLORS = ['#ffcf4a', '#ff6a8a', '#7ad8ff', '#b4ff7a', '#ffffff', '#ff9a3a'];
// 불꽃놀이: 호수 쪽에서 쏘아 올려 하늘에서 터짐
function firework(x = 60 + Math.random() * 280, y = 60 + Math.random() * 170) {
  const c = FW_COLORS[(Math.random() * FW_COLORS.length) | 0];
  const T = 0.7;
  fx.parts.push({ kind: 'rocket', x, y: 430, vx: 0, vy: -(430 - y) / T, life: T, max: T, r: 2, color: c });
  if (S.mode !== 'demo') Snd.whistle();
}
function burst(x, y, c, out) {
  const n = 40, c2 = FW_COLORS[(Math.random() * FW_COLORS.length) | 0];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, sp = 80 + Math.random() * 70;
    out.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 50, drag: 0.985,
      life: 1 + Math.random() * 0.5, max: 1.5, r: 2.2, color: i % 3 ? c : c2 });
  }
  out.push({ kind: 'spark', x, y, vx: 0, vy: 0, g: 0, life: 0.15, max: 0.15, r: 18, color: '#ffffff' }); // 섬광
  if (S.mode !== 'demo') Snd.boom();
}
// Perfect: 발밑에 퍼지는 금빛 고리 + 반짝이
function perfectFx() {
  fx.parts.push({ kind: 'ring', x: CX, y: GROUND + 2, vx: 0, vy: 0, life: 0.45, max: 0.45 });
  for (let i = 0; i < 5; i++) {
    const a = -PI / 2 + (i - 2) * 0.55;
    fx.parts.push({ kind: 'twinkle', x: CX + Math.cos(a) * 30, y: GROUND - 10, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90 - 20,
      g: 120, drag: 0.97, life: 0.55, max: 0.55, r: 5 });
  }
}
function setMood(m) { S.mood = m; S.moodT = vt; }
const moodNow = () => (vt - S.moodT < (S.mood === 'shock' ? 1.6 : 0.9) ? S.mood : null);

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

/* ---- 배경 (한 번 그려서 캐시) ---- */
function buildBackground() {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const g = c.getContext('2d');
  g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);

  // 밤하늘
  let gr = g.createLinearGradient(0, 0, 0, 440);
  gr.addColorStop(0, '#151238'); gr.addColorStop(0.5, '#3b1f55'); gr.addColorStop(0.86, '#a8475a'); gr.addColorStop(1, '#e07a4a');
  g.fillStyle = gr; g.fillRect(0, 0, W, 440);
  const rnd = seeded(7);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`;
    g.beginPath(); g.arc(rnd() * W, rnd() * 300, rnd() * 1.3 + 0.3, 0, TAU); g.fill();
  }

  // 먼 산과 호수 (호반의 도시 춘천)
  g.fillStyle = '#3a2758';
  g.beginPath(); g.moveTo(0, 400);
  [[40, 360], [95, 380], [150, 335], [210, 372], [260, 345], [320, 380], [370, 350], [400, 365]].forEach(([x, y]) => g.lineTo(x, y));
  g.lineTo(W, 420); g.lineTo(0, 420); g.fill();
  g.fillStyle = '#2a1d45';
  g.beginPath(); g.moveTo(0, 405);
  [[60, 385], [120, 402], [190, 380], [250, 400], [310, 386], [400, 398]].forEach(([x, y]) => g.lineTo(x, y));
  g.lineTo(W, 425); g.lineTo(0, 425); g.fill();
  gr = g.createLinearGradient(0, 412, 0, 445);
  gr.addColorStop(0, '#5a3a78'); gr.addColorStop(1, '#2a2050');
  g.fillStyle = gr; g.fillRect(0, 412, W, 34);
  g.strokeStyle = 'rgba(255,190,140,.35)'; g.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) {
    const y = 418 + i * 3.2, x = 30 + rnd() * 340;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 12 + rnd() * 20, y); g.stroke();
  }

  // 축제 천막 부스
  const booths = [['닭갈비', '#d8432a'], ['막국수', '#2f7fc4'], ['사리추가', '#d8432a'], ['동치미', '#2f7fc4'], ['기념품', '#c8900f']];
  booths.forEach(([name, col], i) => {
    const x = -14 + i * 86, y = 440, w = 92;
    // 몸체
    g.fillStyle = '#2b1d22'; g.fillRect(x + 6, y + 28, w - 12, 70);
    gr = g.createLinearGradient(0, y + 40, 0, y + 98);
    gr.addColorStop(0, '#ffcf7a'); gr.addColorStop(1, '#e08a3a');
    g.fillStyle = gr; g.fillRect(x + 14, y + 44, w - 28, 40);
    // 손님 실루엣
    g.fillStyle = 'rgba(60,30,30,.85)';
    for (let k = 0; k < 3; k++) { const hx = x + 24 + k * 22 + rnd() * 6; g.beginPath(); g.arc(hx, y + 76, 7, 0, TAU); g.fill(); g.fillRect(hx - 8, y + 82, 16, 16); }
    // 지붕 (줄무늬 천막)
    g.save();
    g.beginPath(); g.moveTo(x, y + 30); g.lineTo(x + w / 2, y); g.lineTo(x + w, y + 30); g.closePath(); g.clip();
    for (let s = 0; s < 8; s++) { g.fillStyle = s % 2 ? '#fff3e2' : col; g.fillRect(x + s * (w / 8), y - 2, w / 8 + 1, 34); }
    g.restore();
    g.fillStyle = col;
    for (let s = 0; s < 6; s++) { g.beginPath(); g.arc(x + 8 + s * 15.2, y + 30, 7.6, 0, PI); g.fill(); }
    // 간판
    g.fillStyle = '#fff3e2'; g.fillRect(x + 22, y + 32, w - 44, 11);
    g.fillStyle = '#2b1d22'; g.font = '800 8px ' + getComputedStyle(document.body).fontFamily;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, x + w / 2, y + 38);
  });

  // 광장 바닥
  gr = g.createLinearGradient(0, 535, 0, H);
  gr.addColorStop(0, '#6a4434'); gr.addColorStop(1, '#2e1c16');
  g.fillStyle = gr; g.fillRect(0, 535, W, H - 535);
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1;
  for (let i = 0; i < 7; i++) { const y = 545 + i * i * 4.2; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  for (let i = -8; i <= 8; i++) { g.beginPath(); g.moveTo(CX + i * 30, 535); g.lineTo(CX + i * 90, H); g.stroke(); }
  // 줄넘기 매트
  g.fillStyle = '#8a5a44'; g.beginPath(); g.ellipse(CX, 606, 150, 26, 0, 0, TAU); g.fill();
  g.strokeStyle = '#c08058'; g.lineWidth = 3; g.stroke();
  g.strokeStyle = 'rgba(255,220,170,.25)'; g.lineWidth = 1.5; g.setLineDash([6, 6]);
  g.beginPath(); g.ellipse(CX, 606, 132, 19, 0, 0, TAU); g.stroke(); g.setLineDash([]);
  return c;
}

// 줄 조명 (반짝임은 매 프레임)
const LIGHT_COLORS = ['#ffcf4a', '#ff7a4a', '#7ad0ff', '#ff9ad0', '#a8ff7a'];
function drawLights(t) {
  [[-10, 112, 410, 132, 36], [-10, 190, 410, 172, 28]].forEach(([x0, y0, x1, y1, sag], row) => {
    ctx.strokeStyle = 'rgba(20,10,20,.8)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let u = 0; u <= 1.0001; u += 0.05) {
      const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u + sag * (1 - (2 * u - 1) ** 2);
      u === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let i = 0; i < 16; i++) {
      const u = (i + 0.5) / 16;
      const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u + sag * (1 - (2 * u - 1) ** 2) + 4;
      const a = 0.65 + 0.35 * Math.sin(t * (3 + S.level * 0.5) + i * 1.7 + row);
      ctx.globalAlpha = a * 0.35; ctx.fillStyle = LIGHT_COLORS[(i + row) % 5];
      circle(x, y, 7); ctx.fill();
      ctx.globalAlpha = a; circle(x, y, 2.8); ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

/* ---- 캐릭터 공통 ---- */
const OUT = '#3a1a10';
function face(x, y, gap, opts = {}) {
  const { eyeR = 4.6, mouth = 9, angry = false, ko = false, blink = false, happy = false, shock = false } = opts;
  // 볼터치
  ctx.fillStyle = 'rgba(255,120,130,.55)';
  ellipse(x - gap - 10, y + 10, 7.5, 4.5); ctx.fill();
  ellipse(x + gap + 10, y + 10, 7.5, 4.5); ctx.fill();
  if (ko) {
    ctx.strokeStyle = '#1a0a08'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    [-1, 1].forEach((s) => {
      const ex = x + s * gap;
      ctx.beginPath(); ctx.moveTo(ex - 4, y - 4); ctx.lineTo(ex + 4, y + 4); ctx.moveTo(ex + 4, y - 4); ctx.lineTo(ex - 4, y + 4); ctx.stroke();
    });
    ctx.fillStyle = '#7a1818'; ellipse(x, y + 13, 5, 6); ctx.fill();
    return;
  }
  if (shock) {
    [-1, 1].forEach((s) => {
      const ex = x + s * gap;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1a0a08'; ctx.lineWidth = 2;
      circle(ex, y - 1, eyeR * 1.35); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1a0a08'; circle(ex, y - 1, eyeR * 0.5); ctx.fill();
    });
    ctx.fillStyle = '#7a1818'; ellipse(x, y + 11, mouth * 0.45, mouth * 0.6); ctx.fill();
    return;
  }
  [-1, 1].forEach((s) => {
    const ex = x + s * gap;
    if (happy || blink) {
      ctx.strokeStyle = '#1a0a08'; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
      ctx.beginPath();
      if (happy) ctx.arc(ex, y + 2, eyeR * 1.1, PI * 1.15, PI * 1.85);
      else { ctx.moveTo(ex - eyeR, y + 1); ctx.lineTo(ex + eyeR, y + 1); }
      ctx.stroke();
    } else {
      ctx.fillStyle = '#1a0a08'; ellipse(ex, y, eyeR, eyeR * 1.3); ctx.fill();
      ctx.fillStyle = '#fff'; circle(ex + 1.4, y - 2, eyeR * 0.38); ctx.fill();
    }
    if (angry) {
      ctx.strokeStyle = '#3a0a04'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ex - s * 7, y - 12); ctx.lineTo(ex + s * 4, y - 8); ctx.stroke();
    }
  });
  ctx.fillStyle = '#7a1818';
  ctx.beginPath(); ctx.arc(x, y + 7, mouth, 0.05, PI - 0.05); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ff8a8a'; ellipse(x, y + 7 + mouth * 0.62, mouth * 0.5, mouth * 0.3); ctx.fill();
}
const blinking = (t, phase) => ((t + phase) % 3.4) < 0.13;
function sweat(x, y, t) {
  const k = (t * 1.6) % 1, yy = y + k * 14;
  ctx.globalAlpha = 1 - k;
  ctx.fillStyle = '#9ad8ff'; ctx.strokeStyle = '#3a7ab0'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, yy - 7); ctx.quadraticCurveTo(x + 5, yy + 2, x, yy + 4);
  ctx.quadraticCurveTo(x - 5, yy + 2, x, yy - 7); ctx.fill(); ctx.stroke();
  ctx.globalAlpha = 1;
}
function limb(x0, y0, x1, y1, w, fill) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUT; ctx.lineWidth = w + 4;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = fill; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}
function fist(x, y, r, fill) { ctx.fillStyle = fill; ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; circle(x, y, r); ctx.fill(); ctx.stroke(); }

/* ---- 철판대장 닭갈비 (왼쪽) ---- */
function drawDakgalbi(x, fy, t, hand) {
  const m = moodNow();
  const hop = m === 'cheer' ? Math.abs(Math.sin(t * 14)) * 9 : 0;
  const bob = Math.sin(t * 7) * 1.5 - hop;
  const cy = fy - 52 + bob;
  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ellipse(x, fy + 2, 40, 8); ctx.fill();
  // 다리
  ctx.fillStyle = '#d0401e'; ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
  rrect(x - 21, cy + 26, 13, fy - cy - 28, 5); ctx.fill(); ctx.stroke();
  rrect(x + 8, cy + 26, 13, fy - cy - 28, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#7a2010'; ellipse(x - 16, fy - 2, 11, 5); ctx.fill(); ellipse(x + 16, fy - 2, 11, 5); ctx.fill();

  // 뒤집개 든 팔 (바깥쪽, 흔들흔들)
  const sw = Math.sin(t * 5);
  const hx = x - 46, hy = cy - 30 + sw * 6;
  limb(x - 30, cy - 2, hx, hy, 9, '#e8552a');
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(-0.35 + sw * 0.2);
  ctx.fillStyle = '#c98a4a'; ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
  rrect(-3, -30, 6, 34, 3); ctx.fill(); ctx.stroke();
  rrect(-11, -60, 22, 32, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d8321a';
  ellipse(-2, -52, 8, 6); ctx.fill(); ellipse(4, -40, 4, 6); ctx.fill(); ellipse(-6, -34, 3, 5); ctx.fill();
  ctx.restore();
  fist(hx, hy, 7, '#e8552a');

  // 몸통 (울퉁불퉁 닭갈비 덩어리)
  const blobs = [[0, 0, 40], [-22, -27, 15], [-3, -37, 17], [19, -30, 15], [32, -10, 12], [-33, -8, 12]];
  ctx.beginPath();
  blobs.forEach(([bx, by, r]) => { ctx.moveTo(x + bx + r, cy + by); ctx.arc(x + bx, cy + by, r, 0, TAU); });
  ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.stroke();
  const gr = ctx.createRadialGradient(x - 12, cy - 22, 6, x, cy, 52);
  gr.addColorStop(0, '#ff8a3a'); gr.addColorStop(0.6, '#f0522a'); gr.addColorStop(1, '#c8341a');
  ctx.fillStyle = gr; ctx.fill();
  // 양념 윤기
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ellipse(x - 26, cy - 33, 5, 3, -0.5); ctx.fill(); ellipse(x - 6, cy - 46, 6, 3, -0.2); ctx.fill(); ellipse(x - 20, cy - 8, 4, 2.4, -0.6); ctx.fill();
  // 양배추 잎
  ctx.save(); ctx.translate(x + 18, cy - 44); ctx.rotate(0.5);
  ctx.fillStyle = '#eef4b8'; ctx.strokeStyle = '#8ea048'; ctx.lineWidth = 2;
  ellipse(0, 0, 15, 9); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.moveTo(-3, 0); ctx.lineTo(3, -6); ctx.moveTo(4, 0); ctx.lineTo(9, 5); ctx.stroke();
  ctx.restore();
  // 파
  ctx.save(); ctx.translate(x + 22, cy + 14); ctx.rotate(-0.7);
  ctx.fillStyle = '#4aa03a'; ctx.strokeStyle = '#2a5a1a'; ctx.lineWidth = 1.5; rrect(-9, -3, 18, 6, 3); ctx.fill(); ctx.stroke();
  ctx.restore();

  face(x, cy - 4, 12, { angry: m !== 'shock', mouth: m === 'cheer' ? 11 : 9, happy: m === 'cheer', shock: m === 'shock', blink: blinking(t, 0.7) });
  if (m === 'shock') sweat(x + 34, cy - 30, t);

  // 줄 돌리는 팔
  limb(x + 30, cy + 4, hand.x, hand.y, 9, '#e8552a');
  fist(hand.x, hand.y, 7.5, '#e8552a');
}

/* ---- 메밀 막국수 (오른쪽) ----
   놋그릇 + 시원한 육수 위에 메밀면이 봉긋하게 쌓인 모양.
   얼굴은 면발 위에, 줄은 면발 한 가닥이 붙잡고 돌린다. */
const NOODLE = '#93725c', NOODLE_D = '#5e4436', NOODLE_L = '#b8977c';
function drawMakguksu(x, fy, t, hand) {
  const m = moodNow();
  const hop = m === 'cheer' ? Math.abs(Math.sin(t * 14 + 1)) * 8 : 0;
  const bob = Math.sin(t * 7 + 1.3) * 1.2;
  const by = fy;                    // 그릇은 바닥에 고정
  const rimY = by - 56;             // 그릇 테두리 높이
  const base = rimY + 4 + bob - hop; // 면 더미 밑동 (육수 속)
  const top = base - 62;

  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ellipse(x, fy + 2, 50, 8); ctx.fill();

  // ── 그릇 굽 + 몸통 (놋그릇)
  ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
  ctx.fillStyle = '#a87428'; ellipse(x, by - 5, 25, 6); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 60, rimY);
  ctx.bezierCurveTo(x - 58, by - 26, x - 42, by - 12, x - 24, by - 11);
  ctx.lineTo(x + 24, by - 11);
  ctx.bezierCurveTo(x + 42, by - 12, x + 58, by - 26, x + 60, rimY);
  ctx.closePath();
  let gr = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
  gr.addColorStop(0, '#a8701e'); gr.addColorStop(0.28, '#f4d07e'); gr.addColorStop(0.42, '#fbe3a6');
  gr.addColorStop(0.6, '#d9a045'); gr.addColorStop(1, '#9a6418');
  ctx.fillStyle = gr; ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(120,70,10,.35)'; ctx.lineWidth = 1.5; // 놋그릇 결
  ctx.beginPath(); ctx.moveTo(x - 52, by - 36); ctx.quadraticCurveTo(x, by - 26, x + 52, by - 36); ctx.stroke();

  // ── 테두리 윗면 + 육수 (그릇 안쪽)
  ctx.fillStyle = '#f0c46a'; ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
  ellipse(x, rimY, 60, 13); ctx.fill(); ctx.stroke();
  gr = ctx.createLinearGradient(0, rimY - 10, 0, rimY + 10);
  gr.addColorStop(0, '#e9dcbc'); gr.addColorStop(1, '#f8f0dc');
  ctx.fillStyle = gr; ellipse(x, rimY + 1, 53, 9.5); ctx.fill();

  // ── 줄 잡는 면발 한 가닥 (면 더미 왼쪽에서 뻗어 나옴)
  const ax = x - 38, ay = base - 22;
  const w1 = Math.sin(t * 9) * 5, w2 = Math.cos(t * 7) * 4;
  const strand = () => {
    ctx.beginPath(); ctx.moveTo(ax, ay);
    ctx.bezierCurveTo(ax - 14, ay - 8 + w1, hand.x + 16, hand.y + 10 + w2, hand.x, hand.y);
  };
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUT; ctx.lineWidth = 8; strand(); ctx.stroke();
  ctx.strokeStyle = NOODLE; ctx.lineWidth = 4.5; strand(); ctx.stroke();
  ctx.strokeStyle = NOODLE_L; ctx.lineWidth = 1.4; strand(); ctx.stroke();

  // ── 면 더미 (봉긋한 돔)
  const dome = () => {
    ctx.beginPath();
    ctx.moveTo(x - 46, base + 4);
    ctx.bezierCurveTo(x - 50, base - 34, x - 30, top, x, top);
    ctx.bezierCurveTo(x + 30, top, x + 50, base - 34, x + 46, base + 4);
    ctx.quadraticCurveTo(x, base + 12, x - 46, base + 4);
    ctx.closePath();
  };
  ctx.save();
  dome();
  ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.stroke();
  gr = ctx.createRadialGradient(x - 14, top + 18, 4, x, base - 26, 58);
  gr.addColorStop(0, '#a88a72'); gr.addColorStop(0.6, NOODLE); gr.addColorStop(1, '#5e4436');
  ctx.fillStyle = gr; ctx.fill();
  ctx.clip();
  // 정수리에서 흘러내리는 면발
  // 구불구불한 메밀면 가닥
  ctx.lineJoin = 'round';
  for (let i = -9; i <= 9; i++) {
    ctx.strokeStyle = i % 2 ? 'rgba(84,60,46,.6)' : 'rgba(200,172,146,.55)';
    ctx.lineWidth = i % 2 ? 1.5 : 1.1;
    ctx.beginPath();
    for (let k = 0; k <= 14; k++) {
      const u = k / 14;
      const spread = Math.sin(u * PI * 0.5);
      const px = x + i * (1.2 + 5.2 * spread) + Math.sin(u * 10 + i * 1.7 + t * 1.5) * 1.8 * u;
      const py = top + 2 + (base + 10 - top) * u;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  // 얼굴 쪽은 은은하게 밝혀 표정이 잘 보이게
  gr = ctx.createRadialGradient(x, base - 28, 2, x, base - 28, 26);
  gr.addColorStop(0, 'rgba(172,140,114,.85)'); gr.addColorStop(1, 'rgba(172,140,114,0)');
  ctx.fillStyle = gr; ctx.fillRect(x - 30, base - 56, 60, 56);
  ctx.restore();

  face(x, base - 31, 11, { eyeR: 4.2, mouth: m === 'cheer' ? 7.5 : 5.5, happy: m === 'cheer', shock: m === 'shock', blink: blinking(t, 2.1) });
  if (m === 'shock') sweat(x + 36, top + 14, t + 0.3);

  // ── 육수에 뜬 얼음
  [[x - 38, rimY + 1, -0.25, 15], [x + 33, rimY, 0.2, 13], [x + 12, rimY + 4, -0.1, 10]].forEach(([ix, iy, rot, sz]) => {
    ctx.save(); ctx.translate(ix, iy); ctx.rotate(rot);
    ctx.fillStyle = 'rgba(228,244,255,.92)'; ctx.strokeStyle = '#7fa8c8'; ctx.lineWidth = 1.5;
    rrect(-sz / 2, -sz / 2, sz, sz * 0.85, 3); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-sz / 2 + 3, -sz / 2 + 3); ctx.lineTo(sz / 2 - 4, -sz / 2 + 3); ctx.stroke();
    ctx.restore();
  });

  // ── 그릇 앞쪽 테두리 (면 밑동과 얼음 아래를 가림)
  ctx.beginPath();
  ctx.ellipse(x, rimY, 60, 13, 0, 0, PI);
  ctx.ellipse(x, rimY + 1, 53, 9.5, 0, PI, 0, true);
  ctx.closePath();
  gr = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
  gr.addColorStop(0, '#c08a30'); gr.addColorStop(0.35, '#fbe0a0'); gr.addColorStop(1, '#b07a24');
  ctx.fillStyle = gr; ctx.fill();
  ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(x, rimY, 60, 13, 0, 0, PI); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,250,220,.8)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(x, rimY + 3, 56, 10, 0, 0.35, 1.2); ctx.stroke();

  // ── 오이채 (정수리에 왕관처럼)
  ctx.lineCap = 'round';
  for (let i = 0; i < 11; i++) {
    const a = -PI + 0.25 + (i / 10) * (PI - 0.5);
    const droop = 1 - Math.abs(Math.sin(a));
    const sx = x + Math.cos(a) * 7, sy = top + 4 + Math.sin(a) * 2;
    const ex = x + Math.cos(a) * 36, ey = top + 6 + Math.sin(a) * 8 + droop * 16;
    ctx.strokeStyle = '#2f6a1c'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = i % 2 ? '#9fd468' : '#c4ea8a'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
  }
  // ── 삶은 달걀 반쪽
  ctx.save(); ctx.translate(x + 2, top - 6); ctx.rotate(-0.08);
  ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
  ellipse(0, 0, 18, 9.5); ctx.fill(); ctx.stroke();
  const yg = ctx.createRadialGradient(-3, -3, 1, 0, 0, 11);
  yg.addColorStop(0, '#ffe07a'); yg.addColorStop(1, '#f39a10');
  ctx.fillStyle = yg; ellipse(1, -1, 9.5, 5.5); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.8)'; ellipse(-3, -3, 3, 1.6); ctx.fill();
  ctx.restore();
  // ── 깨
  ctx.fillStyle = '#fff3d0';
  [[-16, 14], [15, 10], [-24, 30], [26, 26], [-4, 18], [8, 42]].forEach(([dx, dy]) => { ellipse(x + dx, top + dy, 1.3, 0.8, dx * 0.1); ctx.fill(); });
}

/* ---- 축제 사장님 (점프하는 플레이어) ---- */
function drawBoss(t) {
  const p = S.p;
  const failing = S.mode === 'fail' || S.mode === 'result';
  const ft = failing ? Math.min(1, (S.time - S.failT) / 0.45) : 0;
  const air = !isGrounded(S.time) && !failing;
  const sinceLand = S.time - p.landT;
  let sx = 1, sy = 1;
  if (air) { sx = 0.95; sy = 1.06; }
  else if (sinceLand < 0.12) { const k = 1 - sinceLand / 0.12; sx = 1 + 0.12 * k; sy = 1 - 0.14 * k; }
  else if (S.mode === 'demo' || S.mode === 'countdown') { sy = 1 + Math.sin(t * 4) * 0.015; }

  const y = failing ? 0 : p.y;
  const armsUp = air ? Math.min(1, (S.time - p.t0) / 0.1) : 0;

  // 그림자
  const sh = Math.max(0.35, 1 - y / 160);
  ctx.fillStyle = `rgba(0,0,0,${0.3 * sh})`; ellipse(CX, GROUND + 2, 34 * sh, 7 * sh); ctx.fill();

  ctx.save();
  ctx.translate(CX + ft * 20, GROUND - y);
  ctx.rotate(-ft * 1.35);
  ctx.scale(sx, sy);

  // 다리
  const tuck = air ? 6 : 0;
  ctx.fillStyle = '#4a3226'; ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
  rrect(-14, -24, 10, 20 - tuck, 4); ctx.fill(); ctx.stroke();
  rrect(4, -24, 10, 20 - tuck, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2a1a12';
  ellipse(-9, -3 - tuck, 9, 5); ctx.fill(); ellipse(9, -3 - tuck, 9, 5); ctx.fill();

  // 팔 (점프하면 만세)
  const ax = 30 + armsUp * 4, ay = -32 - armsUp * 54;
  limb(-20, -56, -ax, ay, 9, '#3d4a6a'); fist(-ax, ay, 6.5, '#ffd8b0');
  limb(20, -56, ax, ay, 9, '#3d4a6a'); fist(ax, ay, 6.5, '#ffd8b0');

  // 몸통 + 앞치마
  ctx.fillStyle = '#3d4a6a'; ctx.strokeStyle = OUT; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-22, -62); ctx.lineTo(22, -62); ctx.quadraticCurveTo(28, -40, 26, -20); ctx.lineTo(-26, -20); ctx.quadraticCurveTo(-28, -40, -22, -62);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fffaf2'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-11, -62); ctx.lineTo(11, -62); ctx.lineTo(12, -48); ctx.lineTo(20, -46); ctx.lineTo(21, -16);
  ctx.lineTo(-21, -16); ctx.lineTo(-20, -46); ctx.lineTo(-12, -48); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#d8c8b8'; ctx.lineWidth = 1.5;
  rrect(-8, -38, 16, 11, 2); ctx.stroke();

  // 머리
  const hy = -100;
  const hg = ctx.createRadialGradient(-10, hy - 14, 6, 0, hy, 42);
  hg.addColorStop(0, '#ffe8cc'); hg.addColorStop(1, '#f4c494');
  ctx.fillStyle = hg; ctx.strokeStyle = OUT; ctx.lineWidth = 3;
  circle(0, hy, 39); ctx.fill(); ctx.stroke();
  // 머리카락
  ctx.save(); circle(0, hy, 39); ctx.clip();
  ctx.fillStyle = '#7a4a28';
  ctx.beginPath(); ctx.moveTo(-42, hy - 4);
  ctx.quadraticCurveTo(-40, hy - 46, 0, hy - 44); ctx.quadraticCurveTo(40, hy - 46, 42, hy - 4);
  ctx.lineTo(42, hy - 22); ctx.quadraticCurveTo(20, hy - 30, 6, hy - 22); ctx.quadraticCurveTo(-14, hy - 32, -42, hy - 18);
  ctx.closePath(); ctx.fill();
  // 머리띠
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-45, hy - 30, 90, 12);
  ctx.strokeStyle = '#d0c8c0'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-45, hy - 24); ctx.lineTo(45, hy - 24); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = OUT; ctx.lineWidth = 3; circle(0, hy, 39); ctx.stroke();
  // 머리띠 매듭 (펄럭)
  const fl = Math.sin(t * 10) * 3 + (air ? 5 : 0);
  ctx.strokeStyle = OUT; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(36, hy - 26); ctx.quadraticCurveTo(50, hy - 30 - fl, 60, hy - 22 + fl); ctx.moveTo(36, hy - 24); ctx.quadraticCurveTo(48, hy - 14, 54, hy - 6 + fl); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5.5;
  ctx.beginPath(); ctx.moveTo(36, hy - 26); ctx.quadraticCurveTo(50, hy - 30 - fl, 60, hy - 22 + fl); ctx.moveTo(36, hy - 24); ctx.quadraticCurveTo(48, hy - 14, 54, hy - 6 + fl); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = OUT; ctx.lineWidth = 2; circle(37, hy - 25, 5.5); ctx.fill(); ctx.stroke();

  face(0, hy + 4, 14, { eyeR: 5, mouth: air ? 11 : 9, ko: failing, happy: moodNow() === 'cheer', blink: !air && blinking(t, 1.4) });
  if (!failing && S.level >= 6 && S.mode === 'play') sweat(-40, hy - 14, t);
  ctx.restore();

  // 어질어질 별
  if (failing && ft >= 1) {
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + (i * TAU) / 3;
      star(CX + 70 + Math.cos(a) * 26, GROUND - 40 + Math.sin(a) * 8, 6, '#ffe066');
    }
  }
}
function star(x, y, r, c) {
  ctx.fillStyle = c; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -PI / 2 + (i * PI) / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}

/* ---- 면발 줄 ---- */
function handPos(theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return {
    L: { x: 124 + s * 9, y: 518 + c * 15 },
    R: { x: 276 - s * 9, y: 518 + c * 15 },
  };
}
function ropeCurve(theta, hands) {
  let midY = 456 + 150 * Math.cos(theta);
  if (S.mode === 'fail' || S.mode === 'result') midY = 606 + Math.min(1, (S.time - S.failT) * 3) * 4;
  const { L, R } = hands;
  return { L, R, cx: 2 * CX - (L.x + R.x) / 2, cy: 2 * midY - (L.y + R.y) / 2 };
}
function drawRope(curve, front, t) {
  const rev = revOf(S.theta);
  const warn = S.warn.has(rev) && S.mode !== 'demo';
  const w = front ? 7 : 4.5;
  ctx.save();
  ctx.lineCap = 'round';
  const path = (dy = 0) => { ctx.beginPath(); ctx.moveTo(curve.L.x, curve.L.y + dy); ctx.quadraticCurveTo(curve.cx, curve.cy + dy, curve.R.x, curve.R.y + dy); };
  if (warn) {
    ctx.shadowColor = '#ff3a1a'; ctx.shadowBlur = 14 + Math.sin(t * 20) * 6;
    ctx.strokeStyle = front ? '#ff5a3a' : '#b83020';
  } else {
    ctx.strokeStyle = front ? '#8f6f55' : '#5e4636';
  }
  ctx.lineWidth = w; path(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = warn ? 'rgba(255,220,200,.7)' : (front ? '#c9a68a' : '#7d6250');
  ctx.lineWidth = w * 0.3; path(-w * 0.18); ctx.stroke();
  ctx.restore();
}

/* ---- HUD ---- */
const FONT = () => getComputedStyle(document.body).fontFamily;
function drawHUD(t) {
  const playing = S.mode === 'play' || S.mode === 'fail' || S.mode === 'countdown' || S.mode === 'paused';
  if (!playing) return;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  // 횟수
  ctx.font = `900 76px ${FONT()}`;
  ctx.lineJoin = 'round'; ctx.lineWidth = 10; ctx.strokeStyle = '#2a1030';
  ctx.strokeText(S.jumps, CX, 118); ctx.fillStyle = '#fff'; ctx.fillText(S.jumps, CX, 118);
  ctx.font = `800 14px ${FONT()}`; ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.fillText('회', CX, 140);
  if (S.streak >= 2) {
    ctx.font = `900 18px ${FONT()}`; ctx.fillStyle = '#ffe066';
    ctx.fillText(`Perfect ×${S.streak}`, CX, 166);
  }
  // 왼쪽 위: 최고 기록, 속도
  ctx.textAlign = 'left'; ctx.font = `700 13px ${FONT()}`;
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillText(`최고 ${Math.max(save.best, S.jumps)}회`, 16, 30);
  ctx.fillText(`속도 Lv.${S.level}`, 16, 50);
  ctx.fillText(`점수 ${S.score}`, 16, 70);

  // 2단 뛰기 예고
  if (S.mode === 'play' && S.warn.has(revOf(S.theta))) {
    const a = 0.75 + Math.sin(t * 14) * 0.25;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#e2381a'; rrect(CX - 120, 196, 240, 40, 20); ctx.fill();
    ctx.textAlign = 'center'; ctx.font = `900 19px ${FONT()}`; ctx.fillStyle = '#fff';
    ctx.fillText('꾹! 길게 눌러 2단 뛰기', CX, 223);
    ctx.globalAlpha = 1;
  }

  // 카운트다운
  if (S.mode === 'countdown' && S.cd && S.cd.n > 0) {
    const k = S.cd.t;
    ctx.save(); ctx.translate(CX, 330); ctx.scale(1.4 - k * 0.4, 1.4 - k * 0.4);
    ctx.globalAlpha = 1 - k * 0.6;
    ctx.textAlign = 'center'; ctx.font = `900 110px ${FONT()}`;
    ctx.lineWidth = 12; ctx.strokeStyle = '#2a1030'; ctx.strokeText(S.cd.n, 0, 36);
    ctx.fillStyle = '#ffcf4a'; ctx.fillText(S.cd.n, 0, 36);
    ctx.restore();
  }
}

function drawPops() {
  ctx.textAlign = 'center';
  for (const q of fx.pops) {
    const k = q.t / q.life;
    const s = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15));
    ctx.save();
    ctx.translate(q.x, q.y - k * 40);
    ctx.scale(s, s);
    ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    ctx.font = `900 ${q.size}px ${FONT()}`;
    ctx.lineJoin = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = '#2a1030'; ctx.strokeText(q.text, 0, 0);
    ctx.fillStyle = q.color; ctx.fillText(q.text, 0, 0);
    ctx.restore();
  }
}

function drawParts(sparksOnly) {
  for (const q of fx.parts) {
    const sky = q.kind === 'spark' || q.kind === 'rocket';
    if (sky !== sparksOnly) continue;
    const a = Math.max(0, q.life / q.max);
    if (q.kind === 'ring') {
      const k = 1 - a;
      ctx.globalAlpha = a; ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 4 * a + 1;
      ellipse(q.x, q.y, 30 + k * 70, 6 + k * 14); ctx.stroke();
    } else if (q.kind === 'twinkle') {
      ctx.globalAlpha = a; star(q.x, q.y, q.r * (0.6 + a * 0.6), '#fff1a0');
    } else if (sky) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a; ctx.fillStyle = q.color; circle(q.x, q.y, q.r); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#c8a080'; circle(q.x, q.y, q.r * (1.5 - a * 0.5)); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/* ---- 줄 잔상 (빠르게 돌수록 또렷) ---- */
function drawGhosts(frontLayer) {
  if (S.mode !== 'play' && S.mode !== 'demo') return;
  const w = omega();
  const warn = S.warn.has(revOf(S.theta)) && S.mode !== 'demo';
  ctx.lineCap = 'round';
  for (let i = 3; i >= 1; i--) {
    const th = S.theta - w * 0.014 * i;
    if ((Math.sin(th) > 0) !== frontLayer) continue;
    const cv = ropeCurve(th, handPos(th));
    ctx.globalAlpha = 0.22 * ((4 - i) / 3) * Math.min(1, w / 9);
    ctx.strokeStyle = warn ? '#ff7a5a' : '#d8b89a';
    ctx.lineWidth = frontLayer ? 6 : 4;
    ctx.beginPath(); ctx.moveTo(cv.L.x, cv.L.y); ctx.quadraticCurveTo(cv.cx, cv.cy, cv.R.x, cv.R.y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* ---- 10연속 Perfect부터 사장님 뒤 금빛 기운 ---- */
function drawAura(t) {
  if (S.streak < 10 || S.mode !== 'play') return;
  const k = Math.min(1, (S.streak - 9) / 20);
  const r = 70 + Math.sin(t * 8) * 6;
  const yy = GROUND - S.p.y - 80;
  const g = ctx.createRadialGradient(CX, yy, 10, CX, yy, r);
  g.addColorStop(0, 'rgba(255,220,90,' + (0.35 * k + 0.15) + ')');
  g.addColorStop(1, 'rgba(255,180,40,0)');
  ctx.fillStyle = g; circle(CX, yy, r); ctx.fill();
}

/* ---- 닭갈비 부스 철판에서 오르는 김 ---- */
function drawSteam(t) {
  for (let i = 0; i < 6; i++) {
    const k = (t * 0.45 + i / 6) % 1;
    const x = 30 + Math.sin(t * 1.3 + i * 2) * 6 + k * 8, y = 484 - k * 70;
    ctx.fillStyle = 'rgba(255,240,230,' + (0.16 * (1 - k)) + ')';
    circle(x, y, 5 + k * 12); ctx.fill();
  }
}

/* ---- 관중: 줄이 바닥을 칠 때마다 들썩, 빨라질수록 신남 ---- */
const CROWD = (() => {
  const r = seeded(42), cols = ['#7a3a4a', '#3a4a7a', '#5a6a3a', '#8a5a2a', '#4a3a6a', '#2a5a5a'];
  return Array.from({ length: 17 }, (_, i) => ({
    x: 4 + i * 24 + r() * 8, y: 556 + (i % 2) * 7, s: 0.85 + r() * 0.3,
    c: cols[(r() * cols.length) | 0], stick: r() < 0.35, ph: r() * TAU, hair: r() < 0.5,
  }));
})();
function drawCrowd(t) {
  const beat = Math.max(0, 1 - (vt - S.beatV) / 0.22);
  const hype = S.mode === 'play' ? Math.min(1, 0.25 + S.level * 0.1) : 0.3;
  const cheer = moodNow() === 'cheer';
  for (const p of CROWD) {
    if (p.x > 105 && p.x < 295) continue; // 가운데(줄넘기 자리)는 비워 둠
    const up = (beat * 6 * hype + (cheer ? Math.abs(Math.sin(t * 12 + p.ph)) * 6 : 0)) * p.s;
    ctx.save(); ctx.translate(p.x, p.y - up); ctx.scale(p.s, p.s);
    const armUp = cheer || (p.stick && hype > 0.5);
    const wv = Math.sin(t * 9 + p.ph) * 4;
    ctx.strokeStyle = '#2a1a1a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    if (armUp) { ctx.moveTo(-7, -16); ctx.lineTo(-11 + wv, -34); ctx.moveTo(7, -16); ctx.lineTo(11 + wv, -34); }
    else { ctx.moveTo(-8, -14); ctx.lineTo(-11, -2); ctx.moveTo(8, -14); ctx.lineTo(11, -2); }
    ctx.stroke();
    if (p.stick) { // 응원봉
      const sx = armUp ? 11 + wv : 11, sy = armUp ? -34 : -2;
      ctx.strokeStyle = 'rgba(255,220,100,.95)'; ctx.lineWidth = 3.5;
      ctx.shadowColor = '#ffcf4a'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 2, sy - 12); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = p.c; rrect(-10, -20, 20, 24, 7); ctx.fill();
    ctx.fillStyle = '#3a2620'; circle(0, -27, 8.5); ctx.fill();
    ctx.fillStyle = p.hair ? '#1a1010' : '#2a1a14';
    ctx.beginPath(); ctx.arc(0, -28, 8.6, PI, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,140,.25)'; circle(-3, -29, 3); ctx.fill();
    ctx.restore();
  }
}

/* ---- 전체 렌더 ---- */
function render() {
  const t = vt;
  if (!bgCache) bgCache = buildBackground();
  const sk = S.shake * S.shake * 9;
  const ox = (Math.random() - 0.5) * sk, oy = (Math.random() - 0.5) * sk;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bgCache, ox * scale * dpr, oy * scale * dpr);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox * scale * dpr, oy * scale * dpr);

  drawLights(t);
  drawParts(true); // 불꽃놀이 (하늘)
  drawSteam(t);
  drawCrowd(t);

  // 면발이 다가올수록 진해지는 바닥 그림자 = 박자 힌트
  const c = Math.cos(S.theta);
  const near = S.mode === 'fail' || S.mode === 'result' ? 0 : Math.max(0, c) ** 3;
  ctx.fillStyle = `rgba(20,5,0,${0.12 + near * 0.45})`;
  ellipse(CX, GROUND + 6, 70 + near * 60, 6 + near * 5); ctx.fill();

  const hands = handPos(S.theta);
  const curve = ropeCurve(S.theta, hands);
  const front = Math.sin(S.theta) > 0;

  drawDakgalbi(70, GROUND, t, hands.L);
  drawMakguksu(338, GROUND, t, hands.R);
  drawGhosts(false);
  if (!front) drawRope(curve, false, t);
  drawAura(t);
  drawBoss(t);
  drawGhosts(true);
  if (front) drawRope(curve, true, t);
  // 주먹을 줄 위에 다시 그려 줄 끝을 숨김
  fist(hands.L.x, hands.L.y, 7.5, '#e8552a');
  fist(hands.R.x, hands.R.y, 5.5, NOODLE); // 막국수 면발 끝 매듭

  drawParts(false);
  drawHUD(t);
  drawPops();

  if (S.flash > 0) { ctx.fillStyle = `rgba(255,60,30,${S.flash * 0.35})`; ctx.fillRect(0, 0, W, H); }
}

/* ---------- 메인 루프 ---------- */
function frame(now) {
  const dt = Math.min(0.05, (now - lastFrameReal) / 1000);
  lastFrameReal = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

// 시작 화면에서도 가끔 불꽃놀이
setInterval(() => { if (S.mode === 'demo' && !document.hidden) firework(); }, 2200);

goTitle();
requestAnimationFrame((t) => { lastFrameReal = t; frame(t); });

// 디버그/테스트용
window.__jr = {
  get state() { return S; }, CFG,
  step(dt) { update(dt); lastFrameReal = performance.now(); },
  press, release, startGame,
};
})();
