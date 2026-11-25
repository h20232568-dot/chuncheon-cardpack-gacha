/* =========================================================
   100m 달리기 — 춘천 닭갈비 막국수 축제 미니게임 3
   축제 사장님이 닭발 신발을 신고 3레인 축제 거리를 달린다.
   - 좌우 밀기: 레인 이동 / 위로 밀기: 점프
   - 닭발 ①: 레인을 바꾸면 미끄러져 잠깐 휘청 (그동안 다시 못 바꿈)
   - 닭발 ②: "꼬꼬!" 경고 뒤 2초간 좌우 조작이 뒤바뀜
   - 양배추 수호자: 키가 커서 피해야 함 / 뜨거운 철판: 점프로 넘기
   - 막국수 사리: 먹으면 잠깐 가속
   - 35초 안에 100m 결승선 통과
   ========================================================= */
(() => {
'use strict';

/* ---------- 설정 ---------- */
const W = 400, H = 720;
const PI = Math.PI, TAU = PI * 2;
const CFG = {
  goal: 100, limit: 35,
  vRun: 5.2, vBoost: 7.6, accel: 2.4,  // m/s
  boostTime: 2.5,
  jumpAir: 0.62, jumpG: 26,
  slipLock: 0.3,                       // 레인 바꾼 뒤 휘청 (조작 불가)
  fallTime: 1.6, invuln: 0.7,
  warnTime: 0.9, reverseTime: 2.2,     // 꼬꼬! 경고 → 좌우 반전
  stars: [35, 28, 22],                 // ★ 완주 / ★★ 28초 이내 / ★★★ 22초 이내
};
const SAVE_KEY = 'chuncheon.minigame.run';
const HZ = 262, F = 400, CAMH = 3, PZ = 3; // 원근: 지평선, 초점, 카메라 높이, 카메라~선수 거리(m)
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const wrap = $('wrap'), canvas = $('game'), ctx = canvas.getContext('2d');
const ui = {
  title: $('title'), pause: $('pause'), result: $('result'),
  startBtn: $('startBtn'), resumeBtn: $('resumeBtn'), quitBtn: $('quitBtn'),
  retryBtn: $('retryBtn'), homeBtn: $('homeBtn'), muteBtn: $('muteBtn'), pauseBtn: $('pauseBtn'),
  bestTitle: $('bestTitle'), starsTitle: $('starsTitle'),
  resEyebrow: $('resEyebrow'), resMain: $('resMain'), resUnit: $('resUnit'), resStars: $('resStars'),
  goalText: $('goalText'), newBest: $('newBest'),
  resDist: $('resDist'), resFalls: $('resFalls'), resSari: $('resSari'), resBest: $('resBest'), resLine: $('resLine'),
};
ui.goalText.textContent = `★ 완주 · ★★ ${CFG.stars[1]}초 · ★★★ ${CFG.stars[2]}초 이내`;

/* ---------- 저장 (best: 가장 빠른 완주 시간, 초) ---------- */
function loadSave() {
  try { return Object.assign({ best: null, stars: 0 }, JSON.parse(localStorage.getItem(SAVE_KEY))); }
  catch { return { best: null, stars: 0 }; }
}
let save = loadSave();
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} }
const starCount = (t) => (t == null ? 0 : CFG.stars.filter((s) => t <= s).length);
const fmt = (t) => t.toFixed(2);

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
  step(alt) { this.tone(alt ? 520 : 440, 0.04, 'triangle', 0.035); },            // 닭발 찰박찰박
  jump()    { this.tone(300, 0.16, 'sine', 0.09, 700); },
  slip()    { this.tone(1400, 0.12, 'sine', 0.04, 800); this.noise(0.08, 0.12, 3000, 'bandpass'); },
  hit()     { this.noise(0.2, 0.45, 600); this.tone(160, 0.25, 'square', 0.08, 60); },
  sizzle()  { this.noise(0.35, 0.25, 4000, 'highpass'); },
  sari()    { [784, 988, 1318].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.08, 0, i * 0.05)); this.noise(0.3, 0.12, 1500, 'bandpass'); },
  kkokko()  { this.tone(700, 0.08, 'square', 0.05, 1100); this.tone(700, 0.1, 'square', 0.05, 1200, 0.13); },
  finish()  { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.22, 'square', 0.06, 0, i * 0.09)); },
  timeout() { this.tone(300, 0.6, 'sawtooth', 0.08, 120); },
  tick()    { this.tone(1050, 0.04, 'square', 0.04); },
  count(n)  { this.tone(n ? 600 : 900, n ? 0.12 : 0.3, 'square', 0.06); },
};
function updateMuteBtn() { ui.muteBtn.textContent = Snd.on ? '🔊' : '🔇'; }
updateMuteBtn();

/* ---------- 코스 만들기 ---------- */
function buildCourse() {
  const obs = [], items = [];
  let d = 14;
  while (d < 95) {
    const k = d / 100;
    const lanes = [-1, 0, 1].sort(() => Math.random() - 0.5);
    if (Math.random() < 0.45) lanes.unshift(...lanes.splice(lanes.indexOf(0), 1)); // 가운데 레인에 더 자주 (가만히 있으면 못 버팀)
    const nBlock = d > 25 && Math.random() < 0.55 ? 2 : 1;
    for (let i = 0; i < nBlock; i++) obs.push({ d, lane: lanes[i], type: Math.random() < 0.5 ? 'plate' : 'cabbage', done: false, hit: false });
    if (Math.random() < 0.28) items.push({ d: d + 0.01, lane: lanes[2], got: false });
    d += lerp(7, 4.4, k) * (0.85 + Math.random() * 0.3);
  }
  return { obs, items };
}

/* ---------- 상태 ---------- */
let S;
function freshState(mode) {
  const course = buildCourse();
  return {
    mode,                 // demo | countdown | play | paused | finish | timeout | result
    time: 0, dist: 0, v: 0,
    lane: 0, x: 0, vx: 0, laneT: -9,
    y: 0, vy: 0, air: false,
    fallT: -9, invulnT: -9, falls: 0,
    boostT: -9, saris: 0,
    warnAt: 6 + Math.random() * 3, revUntil: -9,
    obs: course.obs, items: course.items,
    runPh: 0, lastStep: 0,
    cd: null, endT: 0, flash: 0, flashC: '255,60,30', shake: 0, lastTick: 99,
  };
}
S = freshState('demo');
const fx = { parts: [], pops: [] };

/* ---------- 조작 ---------- */
const inPlay = () => S.mode === 'play' || S.mode === 'demo';
const fallen = () => S.time - S.fallT < CFG.fallTime;
const reversed = () => S.time < S.revUntil;
function steer(dir) {
  if (!inPlay() || fallen()) return;
  if (S.mode === 'play' && reversed()) dir = -dir;
  if (S.time - S.laneT < CFG.slipLock) return; // 휘청이는 중
  const nl = clamp(S.lane + dir, -1, 1);
  if (nl === S.lane) return;
  S.lane = nl; S.laneT = S.time;
  if (S.mode === 'play') Snd.slip();
}
function jump() {
  if (!inPlay() || fallen() || S.air) return;
  S.air = true; S.vy = CFG.jumpG * CFG.jumpAir / 2;
  if (S.mode === 'play') Snd.jump();
}

let ptr = null;
function toLocal(e) { const r = wrap.getBoundingClientRect(); return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }; }
wrap.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.overlay.show')) return;
  e.preventDefault(); Snd.ensure();
  ptr = { ...toLocal(e), done: false, id: e.pointerId };
});
wrap.addEventListener('pointermove', (e) => {
  if (!ptr || ptr.done || e.pointerId !== ptr.id) return;
  const p = toLocal(e), dx = p.x - ptr.x, dy = p.y - ptr.y;
  if (Math.hypot(dx, dy) < 28) return;
  ptr.done = true;
  if (-dy > Math.abs(dx)) jump(); else if (Math.abs(dx) > Math.abs(dy)) steer(Math.sign(dx));
});
addEventListener('pointerup', (e) => {
  if (!ptr || e.pointerId !== ptr.id) return;
  if (!ptr.done) { // 그냥 탭: 왼쪽·가운데·오른쪽
    if (ptr.x < W / 3) steer(-1); else if (ptr.x > (W * 2) / 3) steer(1); else jump();
  }
  ptr = null;
});
addEventListener('keydown', (e) => {
  const k = e.code;
  if (['ArrowLeft', 'KeyA'].includes(k)) { e.preventDefault(); if (!e.repeat) steer(-1); }
  else if (['ArrowRight', 'KeyD'].includes(k)) { e.preventDefault(); if (!e.repeat) steer(1); }
  else if (['ArrowUp', 'KeyW', 'Space'].includes(k)) {
    e.preventDefault(); Snd.ensure();
    if (ui.title.classList.contains('show') || ui.result.classList.contains('show')) startGame();
    else if (!e.repeat) jump();
  } else if (k === 'Enter' && (ui.title.classList.contains('show') || ui.result.classList.contains('show'))) startGame();
});

/* ---------- 화면 전환 ---------- */
function show(el) { [ui.title, ui.pause, ui.result].forEach((o) => o.classList.toggle('show', o === el)); }
function goTitle() {
  S = freshState('demo');
  ui.bestTitle.textContent = save.best != null ? fmt(save.best) + '초' : '-';
  ui.starsTitle.textContent = '★'.repeat(save.stars) + '☆'.repeat(3 - save.stars);
  ui.pauseBtn.classList.add('hidden');
  show(ui.title);
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
  S.mode = 'paused'; S.cd = null; show(ui.pause);
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

function finish() {
  S.mode = 'finish'; S.endT = vt;
  pop('결승선 통과!', '#ffe066', 34, 200, 300, 1.4);
  Snd.finish();
  for (let i = 0; i < 4; i++) setTimeout(() => confetti(200, 330, 40), i * 180);
  ui.pauseBtn.classList.add('hidden');
}
function timeout() {
  S.mode = 'timeout'; S.endT = vt;
  pop('시간 초과!', '#ff8a6a', 36, 200, 300, 1.4);
  Snd.timeout();
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
  const done = S.mode === 'finish';
  S.mode = 'result';
  const t = done ? S.time : null;
  const stars = starCount(t);
  const isNew = done && (save.best == null || t < save.best);
  if (isNew) save.best = t;
  save.stars = Math.max(save.stars, stars);
  writeSave();
  // 축제 코인 지급 (완주 60 / 실패 시 거리 ÷ 2 + 별 보너스) → 카드팩에서 사용
  showReward(done ? 60 : S.dist / 2, stars);
  ui.resEyebrow.textContent = done ? '완주 기록' : '아쉬워요, 시간 초과';
  ui.resMain.textContent = done ? fmt(t) : Math.floor(S.dist);
  ui.resUnit.textContent = done ? '초' : 'm';
  [...ui.resStars.children].forEach((el, i) => { el.classList.remove('on'); void el.offsetWidth; el.classList.toggle('on', i < stars); });
  ui.newBest.classList.toggle('hidden', !isNew);
  ui.resDist.textContent = Math.min(CFG.goal, Math.floor(S.dist)) + 'm';
  ui.resFalls.textContent = S.falls;
  ui.resSari.textContent = S.saris;
  ui.resBest.textContent = save.best != null ? fmt(save.best) : '-';
  ui.resLine.textContent =
    !done ? '닭발 신발이 원래 좀 미끄러워요. 한 번만 더 달려 봐요!' :
    stars < 2 ? '완주 축하해요! 닭발로 100m라니 대단한데요?' :
    stars < 3 ? '빠르다! 닭갈비 배달도 맡겨도 되겠어요~' :
                '닭발의 전설! 올해 축제 마스코트 계주 대표로 임명!';
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
      if (S.cd.n === 0) pop('출발!', '#ffe066', 46, 200, 300);
      if (S.cd.n < 0) { S.cd = null; S.mode = 'play'; }
    }
  }

  if (inPlay()) {
    S.time += dt;
    if (S.mode === 'demo') demoAI();

    // 속도: 넘어지면 멈췄다가 다시 가속
    const boosting = S.time - S.boostT < CFG.boostTime;
    const target = fallen() ? 0 : boosting ? CFG.vBoost : CFG.vRun;
    S.v = target < S.v ? Math.max(target, S.v - 14 * dt) : Math.min(target, S.v + CFG.accel * dt * (boosting ? 2.5 : 1));
    S.dist += S.v * dt;

    // 레인: 스프링으로 미끄러지듯 (살짝 지나쳤다 돌아옴 = 닭발 휘청)
    S.vx += ((S.lane - S.x) * 240 - S.vx * 15) * dt;
    S.x += S.vx * dt;

    // 점프
    if (S.air) {
      S.vy -= CFG.jumpG * dt; S.y += S.vy * dt;
      if (S.y <= 0) { S.y = 0; S.vy = 0; S.air = false; dust(3); }
    }

    // 발소리
    S.runPh += S.v * dt * 1.7;
    if (!S.air && Math.floor(S.runPh / PI) !== S.lastStep) { S.lastStep = Math.floor(S.runPh / PI); if (S.mode === 'play' && S.v > 1) Snd.step(S.lastStep % 2); }

    // 꼬꼬! 좌우 반전 (플레이 중에만)
    if (S.mode === 'play') {
      if (S.time >= S.warnAt && S.time < S.warnAt + dt + 0.0001) { Snd.kkokko(); pop('꼬꼬! 닭발이 꼬인다!', '#ffcf4a', 22, 200, 230, 1.0); }
      if (S.time >= S.warnAt + CFG.warnTime && S.revUntil < S.warnAt) {
        S.revUntil = S.time + CFG.reverseTime;
        S.warnAt = S.revUntil + 6 + Math.random() * 4;
      }
    }

    collide();

    if (S.mode === 'play') {
      if (S.dist >= CFG.goal) finish();
      else {
        const left = CFG.limit - S.time;
        if (left <= 5 && Math.ceil(left) !== S.lastTick) { S.lastTick = Math.ceil(left); if (S.lastTick > 0) Snd.tick(); }
        if (left <= 0) timeout();
      }
    }
    if (S.mode === 'demo' && S.dist > 110) { const keep = S.time; S = freshState('demo'); S.time = keep; }
  }

  if (S.mode === 'finish') { S.dist += S.v * dt; S.v = Math.max(0, S.v - 4 * dt); S.runPh += S.v * dt * 1.7; }
  if ((S.mode === 'finish' || S.mode === 'timeout') && vt - S.endT > 1.8) showResult();

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

function collide() {
  const near = (lane) => Math.abs(S.x - lane) < 0.55;
  for (const o of S.obs) {
    if (o.done) continue;
    if (o.d < S.dist - 0.4) { o.done = true; continue; }
    if (o.d > S.dist + 0.35) continue;
    if (!near(o.lane)) continue;
    if (o.type === 'plate' && S.y > 0.3) continue;       // 점프로 넘김
    if (S.time - S.invulnT < CFG.invuln) continue;
    o.done = true; o.hit = true;
    stumble(o);
  }
  for (const it of S.items) {
    if (it.got || Math.abs(it.d - S.dist) > 0.5 || !near(it.lane)) continue;
    it.got = true; S.saris++; S.boostT = S.time;
    if (S.mode === 'play') { Snd.sari(); pop('사리 추가요~! 가속!', '#ffe066', 22, 200, 420); }
    sparkle(200 + S.x * 133, 560, 14);
  }
}
function stumble(o) {
  S.fallT = S.time; S.invulnT = S.time; S.falls++;
  S.air = false; S.y = 0; S.vy = 0;
  if (S.mode !== 'play') return;
  S.shake = 0.8; S.flash = 0.6; S.flashC = o.type === 'plate' ? '255,90,30' : '120,200,80';
  if (o.type === 'plate') { Snd.sizzle(); pop('앗 뜨거!', '#ff8a5a', 26, 200, 430); }
  else pop('양배추 수호자: 지나갈 수 없다!', '#b8f08a', 18, 200, 430);
  Snd.hit();
  if (navigator.vibrate) navigator.vibrate(150);
  dust(10);
}

// 시작 화면 데모: 알아서 피하고 넘는 선수
function demoAI() {
  const ahead = S.obs.filter((o) => !o.done && o.d > S.dist && o.d - S.dist < 4.5);
  const cur = ahead.find((o) => Math.abs(o.lane - S.lane) < 0.1);
  if (cur) {
    const gap = cur.d - S.dist;
    if (cur.type === 'plate' && gap < 1.3) jump();
    else if (cur.type === 'cabbage' && gap < 3.5) {
      const free = [-1, 0, 1].filter((l) => !ahead.some((o) => o.lane === l && o.type === 'cabbage' && o.d - S.dist < 4.5));
      if (free.length) steer(Math.sign(free.sort((a, b) => Math.abs(a - S.lane) - Math.abs(b - S.lane))[0] - S.lane));
    }
  }
}

/* ---------- 이펙트 ---------- */
function pop(text, color, size, x = 200, y = 300, life = 0.9) { fx.pops.push({ text, color, size, x, y, t: 0, life }); }
function dust(n) {
  const px = 200 + S.x * 133;
  for (let i = 0; i < n; i++) fx.parts.push({ kind: 'dust', x: px + (Math.random() - 0.5) * 50, y: 660, vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 60, g: 160, life: 0.5, max: 0.5, r: 4 + Math.random() * 4 });
}
function sparkle(x, y, n) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 80 + Math.random() * 120; fx.parts.push({ kind: 'star', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 200, drag: 0.97, life: 0.6, max: 0.6, r: 4 + Math.random() * 3, color: '#ffe066' }); }
}
const CONF = ['#ffcf4a', '#ff6a8a', '#7ad8ff', '#b4ff7a', '#ffffff', '#ff9a3a'];
function confetti(x, y, n) {
  for (let i = 0; i < n; i++) { const a = -PI / 2 + (Math.random() - 0.5) * 2.4, sp = 200 + Math.random() * 260; fx.parts.push({ kind: 'conf', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 380, drag: 0.98, life: 1.6, max: 1.6, r: 4, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 16, color: CONF[i % CONF.length] }); }
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

// 월드 좌표(거리 d, 좌우 xm, 높이 ym; 단위 m) → 화면
function proj(d, xm, ym = 0) {
  const z = d - S.dist + PZ;
  if (z < 0.7) return null;
  const sc = F / z;
  return { x: 200 + xm * sc, y: HZ + (CAMH - ym) * sc, sc, z };
}

/* ---- 하늘 (캐시) ---- */
function buildBackground() {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const g = c.getContext('2d');
  g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  let gr = g.createLinearGradient(0, 0, 0, HZ);
  gr.addColorStop(0, '#151238'); gr.addColorStop(0.6, '#4a2258'); gr.addColorStop(1, '#d0644a');
  g.fillStyle = gr; g.fillRect(0, 0, W, HZ + 2);
  const r = seeded(21);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`; g.beginPath(); g.arc(r() * W, r() * 180, r() * 1.2 + 0.3, 0, TAU); g.fill(); }
  g.fillStyle = '#3a2758';
  g.beginPath(); g.moveTo(0, HZ);
  [[40, 226], [100, 244], [160, 214], [230, 240], [290, 220], [350, 242], [400, 228]].forEach(([x, y]) => g.lineTo(x, y));
  g.lineTo(W, HZ); g.fill();
  // 바닥 기본색 (길 바깥 광장)
  gr = g.createLinearGradient(0, HZ, 0, H);
  gr.addColorStop(0, '#3a2620'); gr.addColorStop(1, '#5a3a2a');
  g.fillStyle = gr; g.fillRect(0, HZ, W, H - HZ);
  return c;
}

/* ---- 길 ---- */
const ROAD = 1.8; // 길 반폭(m)
function drawRoad() {
  const near = S.dist - PZ + 0.75, far = S.dist + 75;
  // 2m마다 번갈아 칠한 돌바닥 = 달리는 느낌
  const step = 2;
  for (let d = Math.floor(far / step) * step; d >= Math.floor(near / step) * step; d -= step) {
    const a = proj(Math.max(d, near), 0), b = proj(Math.min(d + step, far), 0);
    if (!a || !b) continue;
    const k = Math.floor(d / step) % 2;
    ctx.fillStyle = k ? '#7a5e4c' : '#6e5444';
    ctx.beginPath();
    ctx.moveTo(200 - ROAD * a.sc, a.y); ctx.lineTo(200 + ROAD * a.sc, a.y);
    ctx.lineTo(200 + ROAD * b.sc, b.y); ctx.lineTo(200 - ROAD * b.sc, b.y); ctx.closePath(); ctx.fill();
    // 연석
    ctx.fillStyle = k ? '#e8d6b8' : '#d84a2a';
    [-1, 1].forEach((sd) => {
      ctx.beginPath();
      ctx.moveTo(200 + sd * ROAD * a.sc, a.y); ctx.lineTo(200 + sd * (ROAD + 0.14) * a.sc, a.y);
      ctx.lineTo(200 + sd * (ROAD + 0.14) * b.sc, b.y); ctx.lineTo(200 + sd * ROAD * b.sc, b.y); ctx.closePath(); ctx.fill();
    });
  }
  // 레인 점선
  ctx.strokeStyle = 'rgba(255,240,210,.55)';
  for (let d = Math.floor(near / 3) * 3; d < far; d += 3) {
    const a = proj(Math.max(d, near), 0), b = proj(d + 1.4, 0);
    if (!a || !b) continue;
    [-0.5, 0.5].forEach((lx) => {
      ctx.lineWidth = Math.max(1, 0.06 * a.sc);
      ctx.beginPath(); ctx.moveTo(200 + lx * a.sc, a.y); ctx.lineTo(200 + lx * b.sc, b.y); ctx.stroke();
    });
  }
  // 출발선 · 결승선
  [[0, false], [CFG.goal, true]].forEach(([d, fin]) => {
    const a = proj(d, 0), b = proj(d + 0.6, 0);
    if (!a || !b) return;
    const n = 12;
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
      const x0 = -ROAD + (2 * ROAD * i) / n, x1 = x0 + (2 * ROAD) / n;
      const y0 = lerp(a.y, b.y, j / 2), y1 = lerp(a.y, b.y, (j + 1) / 2), s0 = lerp(a.sc, b.sc, j / 2), s1 = lerp(a.sc, b.sc, (j + 1) / 2);
      ctx.fillStyle = (i + j) % 2 ? (fin ? '#1a1a1a' : '#ffffff') : '#ffffff';
      if (!fin && (i + j) % 2) continue;
      ctx.beginPath(); ctx.moveTo(200 + x0 * s0, y0); ctx.lineTo(200 + x1 * s0, y0); ctx.lineTo(200 + x1 * s1, y1); ctx.lineTo(200 + x0 * s1, y1); ctx.closePath(); ctx.fill();
    }
  });
}

/* ---- 거리 풍경: 부스, 아치 ---- */
const BOOTHS = (() => { const r = seeded(77), names = ['닭갈비', '막국수', '사리추가', '동치미', '기념품', '감자전', '음료']; const out = []; for (let d = 4; d < 140; d += 7) [-1, 1].forEach((sd) => out.push({ d: d + r() * 2, side: sd, name: names[(r() * names.length) | 0], col: r() < 0.5 ? '#d8432a' : '#2f7fc4' })); return out; })();
function drawBooth(b) {
  const p = proj(b.d, b.side * 3.6);
  if (!p || p.sc < 6) return;
  const s = p.sc, w = 2.2 * s, h = 2.6 * s, x = p.x - w / 2, y = p.y;
  ctx.fillStyle = '#2b1d22'; ctx.fillRect(x + 0.1 * s, y - h * 0.62, w - 0.2 * s, h * 0.62);
  ctx.fillStyle = '#ffb860'; ctx.fillRect(x + 0.25 * s, y - h * 0.5, w - 0.5 * s, h * 0.3);
  ctx.fillStyle = 'rgba(60,30,30,.8)';
  for (let k = 0; k < 3; k++) { circle(x + (0.55 + k * 0.55) * s, y - h * 0.3, 0.16 * s); ctx.fill(); }
  ctx.save(); ctx.beginPath(); ctx.moveTo(x - 0.1 * s, y - h * 0.6); ctx.lineTo(x + w / 2, y - h); ctx.lineTo(x + w + 0.1 * s, y - h * 0.6); ctx.closePath(); ctx.clip();
  for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#fff3e2' : b.col; ctx.fillRect(x - 0.1 * s + i * (w + 0.2 * s) / 8, y - h, (w + 0.2 * s) / 8 + 1, h * 0.42); }
  ctx.restore();
  if (s > 14) {
    ctx.fillStyle = '#fff3e2'; ctx.fillRect(x + 0.4 * s, y - h * 0.6, w - 0.8 * s, 0.28 * s);
    ctx.fillStyle = '#2b1d22'; ctx.font = `800 ${Math.round(0.2 * s)}px ${FONT()}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.name, p.x, y - h * 0.6 + 0.14 * s);
  }
  // 줄 조명
  ctx.fillStyle = 'rgba(255,207,74,.9)';
  for (let k = 0; k < 5; k++) { circle(x + (k + 0.5) * w / 5, y - h * 0.6 + Math.sin(k) * 0.05 * s, Math.max(1, 0.05 * s)); ctx.fill(); }
}
function drawArch(d, label, fin) {
  const L = proj(d, -ROAD - 0.25), R = proj(d, ROAD + 0.25), T = proj(d, 0, 3.3);
  if (!L || !R || !T) return;
  const s = L.sc;
  ctx.fillStyle = fin ? '#ffcf4a' : '#e8d6b8'; ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(1, 0.04 * s);
  [L, R].forEach((p) => { ctx.fillRect(p.x - 0.08 * s, T.y, 0.16 * s, p.y - T.y); ctx.strokeRect(p.x - 0.08 * s, T.y, 0.16 * s, p.y - T.y); });
  const bh = 0.6 * s;
  ctx.fillStyle = fin ? '#e2502a' : '#3b6ab8';
  rrect(L.x - 0.1 * s, T.y - bh * 0.2, R.x - L.x + 0.2 * s, bh, 0.1 * s); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(0.36 * s)}px ${FONT()}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, 200, T.y + bh * 0.3);
  if (fin) { // 깃발
    for (let k = 0; k < 9; k++) { ctx.fillStyle = CONF[k % CONF.length]; const fx0 = lerp(L.x, R.x, (k + 0.5) / 9); ctx.beginPath(); ctx.moveTo(fx0 - 0.1 * s, T.y + bh * 0.8); ctx.lineTo(fx0 + 0.1 * s, T.y + bh * 0.8); ctx.lineTo(fx0, T.y + bh * 1.15); ctx.closePath(); ctx.fill(); }
  }
}

/* ---- 장애물 / 아이템 ---- */
function drawPlate(o, t) {
  const p = proj(o.d, o.lane);
  if (!p) return;
  const s = p.sc;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ellipse(p.x, p.y, 0.5 * s, 0.1 * s); ctx.fill();
  // 다리
  ctx.fillStyle = '#2a2a30'; ctx.fillRect(p.x - 0.36 * s, p.y - 0.18 * s, 0.06 * s, 0.18 * s); ctx.fillRect(p.x + 0.3 * s, p.y - 0.18 * s, 0.06 * s, 0.18 * s);
  // 철판
  const cy = p.y - 0.24 * s;
  ctx.fillStyle = '#26242a'; ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(1, 0.03 * s);
  ellipse(p.x, cy, 0.48 * s, 0.13 * s); ctx.fill(); ctx.stroke();
  const gr = ctx.createRadialGradient(p.x, cy, 1, p.x, cy, 0.45 * s);
  gr.addColorStop(0, '#ff7a2a'); gr.addColorStop(0.6, '#c83a14'); gr.addColorStop(1, '#3a1208');
  ctx.fillStyle = gr; ellipse(p.x, cy - 0.01 * s, 0.4 * s, 0.1 * s); ctx.fill();
  // 지글지글 닭갈비 조각
  ctx.fillStyle = '#e8401a';
  [[-0.2, 0], [0.05, -0.03], [0.22, 0.01], [-0.05, 0.03]].forEach(([dx, dy]) => { ellipse(p.x + dx * s, cy + dy * s - 0.03 * s, 0.07 * s, 0.035 * s); ctx.fill(); });
  // 김 + 불꽃
  if (s > 10) for (let k = 0; k < 3; k++) {
    const ph = (t * 1.2 + k / 3 + o.d) % 1;
    ctx.fillStyle = `rgba(255,240,230,${0.25 * (1 - ph)})`;
    circle(p.x + (k - 1) * 0.18 * s + Math.sin(t * 3 + k) * 0.05 * s, cy - ph * 0.7 * s, (0.06 + ph * 0.1) * s); ctx.fill();
  }
  if (o.hit) { ctx.fillStyle = 'rgba(255,200,80,.5)'; ellipse(p.x, cy, 0.5 * s, 0.15 * s); ctx.fill(); }
}
function drawCabbage(o, t) {
  const p = proj(o.d, o.lane);
  if (!p) return;
  const s = p.sc, x = p.x, y = p.y;
  const bob = Math.sin(t * 5 + o.d) * 0.02 * s;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ellipse(x, y, 0.45 * s, 0.09 * s); ctx.fill();
  ctx.save(); ctx.translate(x, y + bob); ctx.scale(s / 100, s / 100); // 100 단위 = 1m
  ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.lineJoin = 'round';
  // 다리
  ctx.fillStyle = '#7ab83a';
  rrect(-24, -26, 18, 26, 8); ctx.fill(); ctx.stroke(); rrect(6, -26, 18, 26, 8); ctx.fill(); ctx.stroke();
  // 몸 (겹겹이 잎)
  const leaf = (lx, ly, rx, ry, c) => { ctx.fillStyle = c; ellipse(lx, ly, rx, ry); ctx.fill(); ctx.stroke(); };
  leaf(0, -80, 44, 56, '#9ad04a');
  leaf(-26, -62, 22, 34, '#b6e070'); leaf(26, -62, 22, 34, '#b6e070');
  // 얼굴
  ctx.fillStyle = '#c8ea8a'; ellipse(0, -96, 30, 26); ctx.fill();
  // 머리 잎 투구
  ctx.fillStyle = '#7ab83a';
  ctx.beginPath(); ctx.moveTo(-36, -100); ctx.quadraticCurveTo(-30, -150, 0, -146); ctx.quadraticCurveTo(30, -150, 36, -100); ctx.quadraticCurveTo(0, -118, -36, -100); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(240,255,200,.7)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -144); ctx.lineTo(0, -114); ctx.moveTo(-18, -136); ctx.lineTo(-10, -114); ctx.moveTo(18, -136); ctx.lineTo(10, -114); ctx.stroke();
  // 표정 (단호)
  ctx.fillStyle = '#1a0a08';
  ellipse(-11, -94, 4, 5); ctx.fill(); ellipse(11, -94, 4, 5); ctx.fill();
  ctx.strokeStyle = '#1a0a08'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-18, -106); ctx.lineTo(-5, -101); ctx.moveTo(18, -106); ctx.lineTo(5, -101); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-5, -82); ctx.quadraticCurveTo(0, -85, 5, -82); ctx.stroke();
  ctx.fillStyle = 'rgba(255,120,130,.5)'; ellipse(-20, -86, 6, 3.5); ctx.fill(); ellipse(20, -86, 6, 3.5); ctx.fill();
  // 잎 방패 + 잎 칼
  ctx.strokeStyle = OUT; ctx.lineWidth = 4;
  ctx.fillStyle = '#8ac83e';
  ctx.beginPath(); ctx.moveTo(30, -84); ctx.quadraticCurveTo(62, -84, 58, -50); ctx.quadraticCurveTo(52, -26, 34, -20); ctx.quadraticCurveTo(22, -40, 30, -84); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(240,255,200,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(44, -78); ctx.lineTo(42, -30); ctx.stroke();
  ctx.save(); ctx.translate(-44, -60); ctx.rotate(-0.35 + Math.sin(t * 4 + o.d) * 0.1);
  ctx.fillStyle = '#6ab02e'; ctx.strokeStyle = OUT; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-14, -40, 0, -84); ctx.quadraticCurveTo(14, -40, 0, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.restore();
}
function drawSari(it, t) {
  const p = proj(it.d, it.lane, 0.55 + Math.sin(t * 4 + it.d) * 0.06);
  if (!p) return;
  const s = p.sc, g = proj(it.d, it.lane);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ellipse(g.x, g.y, 0.25 * s, 0.05 * s); ctx.fill();
  const gr = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 0.45 * s);
  gr.addColorStop(0, 'rgba(255,230,120,.7)'); gr.addColorStop(1, 'rgba(255,200,60,0)');
  ctx.fillStyle = gr; circle(p.x, p.y, 0.45 * s); ctx.fill();
  // 동그랗게 만 메밀면 사리
  ctx.fillStyle = '#a8876e'; ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(1, 0.025 * s);
  ellipse(p.x, p.y, 0.24 * s, 0.17 * s); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#6e5242'; ctx.lineWidth = Math.max(1, 0.015 * s);
  for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.ellipse(p.x, p.y, 0.07 * k * s, 0.05 * k * s, 0, 0.3 + k, 0.3 + k + 4.6); ctx.stroke(); }
  if (s > 20) { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 9); star(p.x + 0.22 * s, p.y - 0.15 * s, 0.07 * s, '#fff6b0'); ctx.globalAlpha = 1; }
}

/* ---- 축제 사장님 (뒷모습) + 닭발 신발 ---- */
function chickenFoot(x, y, sc, flip) {
  ctx.save(); ctx.translate(x, y); ctx.scale(sc * (flip ? -1 : 1), sc);
  ctx.strokeStyle = OUT; ctx.lineWidth = 7; ctx.lineCap = 'round';
  const toes = () => { ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-12, 6); ctx.moveTo(0, -6); ctx.lineTo(0, 9); ctx.moveTo(0, -6); ctx.lineTo(12, 6); ctx.moveTo(0, -8); ctx.lineTo(0, -18); };
  toes(); ctx.stroke();
  ctx.strokeStyle = '#ffa43a'; ctx.lineWidth = 4; toes(); ctx.stroke();
  ctx.fillStyle = '#fff'; [[-12, 6], [0, 9], [12, 6]].forEach(([a, b]) => { circle(a, b, 1.6); ctx.fill(); }); // 발톱
  ctx.restore();
}
function drawRunner(t) {
  const p = proj(S.dist, S.x, S.y);
  if (!p) return;
  const g = proj(S.dist, S.x);
  const s = p.sc / 133; // 기준 크기
  const fall = clamp((S.time - S.fallT) / 0.25, 0, 1) * (fallen() && inPlay() ? 1 : 0);
  const blink = S.time - S.invulnT < CFG.invuln && !fallen() && Math.floor(t * 14) % 2 === 0;
  // 그림자
  ctx.fillStyle = `rgba(0,0,0,${0.3 - Math.min(0.2, S.y * 0.15)})`; ellipse(g.x, g.y, 34 * s, 8 * s); ctx.fill();
  if (blink) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  const slipping = S.time - S.laneT < CFG.slipLock;
  const tilt = (S.x - S.lane) * 0.9 + (slipping ? Math.sin(t * 40) * 0.06 : 0);
  ctx.rotate(tilt);
  if (fall > 0) { ctx.translate(0, -10 * s); ctx.scale(1, 1 - fall * 0.55); }
  ctx.scale(s, s);

  const ph = S.runPh, run = S.v > 0.3 && !S.air && fall === 0;
  const legA = run ? Math.sin(ph) : 0.4, legB = run ? Math.sin(ph + PI) : -0.4;
  const rev = S.mode === 'play' && reversed();
  // 다리 + 닭발 신발 (꼬였을 땐 X자로 꼬임)
  [[-1, legA], [1, legB]].forEach(([sd, k]) => {
    const fx0 = (rev ? -sd : sd) * 11, lift = Math.max(0, k) * 16;
    ctx.strokeStyle = OUT; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sd * 9, -34); ctx.lineTo(fx0, -8 - lift); ctx.stroke();
    ctx.strokeStyle = '#4a3226'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(sd * 9, -34); ctx.lineTo(fx0, -8 - lift); ctx.stroke();
    chickenFoot(fx0, -2 - lift, 1.15, sd > 0);
  });
  // 몸통 (네이비 셔츠, 뒤로 묶은 앞치마 끈)
  ctx.fillStyle = '#3d4a6a'; ctx.strokeStyle = OUT; ctx.lineWidth = 3;
  rrect(-24, -84, 48, 54, 14); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#fffaf2'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-24, -50); ctx.lineTo(24, -50); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-6, -82); ctx.lineTo(-14, -52); ctx.moveTo(6, -82); ctx.lineTo(14, -52); ctx.stroke();
  // 리본
  ctx.fillStyle = '#fffaf2'; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  ellipse(-7, -50, 7, 4.5, 0.3); ctx.fill(); ctx.stroke(); ellipse(7, -50, 7, 4.5, -0.3); ctx.fill(); ctx.stroke();
  // 팔 흔들기
  const arm = run ? Math.sin(ph + PI) : 0;
  [[-1, arm], [1, -arm]].forEach(([sd, k]) => {
    const ex = sd * (32 + Math.abs(k) * 2), ey = -58 + k * 16 - (S.air ? 30 : 0);
    ctx.strokeStyle = OUT; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sd * 20, -78); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = '#3d4a6a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(sd * 20, -78); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = '#ffd8b0'; ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; circle(ex, ey, 6.5); ctx.fill(); ctx.stroke();
  });
  // 머리 (뒷통수)
  const hy = -116;
  ctx.fillStyle = '#ffd8b0'; ctx.strokeStyle = OUT; ctx.lineWidth = 3;
  ellipse(-34, hy + 4, 6, 9); ctx.fill(); ctx.stroke(); ellipse(34, hy + 4, 6, 9); ctx.fill(); ctx.stroke(); // 귀
  const hg = ctx.createRadialGradient(-8, hy - 14, 4, 0, hy, 38);
  hg.addColorStop(0, '#8a5a32'); hg.addColorStop(1, '#5e3a1e');
  ctx.fillStyle = hg; circle(0, hy, 34); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(30,15,5,.35)'; ctx.lineWidth = 2;
  for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 9, hy - 30); ctx.quadraticCurveTo(k * 11, hy, k * 8, hy + 28); ctx.stroke(); }
  // 머리띠 + 뒤 매듭 (휘날림)
  ctx.save(); circle(0, hy, 34); ctx.clip();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-40, hy - 14, 80, 11); ctx.restore();
  ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-34, hy - 14); ctx.lineTo(34, hy - 14); ctx.moveTo(-34, hy - 3); ctx.lineTo(34, hy - 3); ctx.stroke();
  const fl = Math.sin(t * 14) * 4 + S.v * 1.2;
  ctx.strokeStyle = OUT; ctx.lineWidth = 8; ctx.lineCap = 'round';
  const tails = () => { ctx.beginPath(); ctx.moveTo(2, hy - 8); ctx.quadraticCurveTo(14, hy + 6 + fl * 0.3, 18 + fl, hy + 20); ctx.moveTo(-2, hy - 8); ctx.quadraticCurveTo(-12, hy + 8, -10 - fl * 0.6, hy + 24); };
  tails(); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; tails(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = OUT; ctx.lineWidth = 2; circle(0, hy - 8, 6); ctx.fill(); ctx.stroke();
  ctx.restore();
  // 넘어졌을 때 어질어질
  if (fallen() && inPlay()) for (let i = 0; i < 3; i++) { const a = t * 5 + (i * TAU) / 3; star(p.x + Math.cos(a) * 30 * s, p.y - 120 * s + Math.sin(a) * 8 * s, 7 * s, '#ffe066'); }
  // 가속 중: 속도선
  if (S.time - S.boostT < CFG.boostTime && inPlay()) {
    ctx.strokeStyle = 'rgba(255,230,140,.6)'; ctx.lineWidth = 3;
    for (let k = 0; k < 8; k++) { const yy = 300 + ((k * 53 + t * 900) % 380), xx = k % 2 ? 30 + k * 6 : 370 - k * 6; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + (xx < 200 ? -20 : 20), yy + 40); ctx.stroke(); }
  }
}

/* ---- HUD ---- */
function drawHUD(t) {
  if (!['play', 'countdown', 'paused', 'finish', 'timeout'].includes(S.mode)) return;
  const left = Math.max(0, CFG.limit - S.time);
  // 남은 시간
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  ctx.font = `900 42px ${FONT()}`; ctx.lineWidth = 8; ctx.strokeStyle = '#2a1030';
  const warn = left <= 5 && S.mode === 'play';
  const txt = S.mode === 'finish' ? fmt(S.time) : left.toFixed(1);
  ctx.strokeText(txt, 200, 58); ctx.fillStyle = warn ? (Math.sin(t * 12) > 0 ? '#ff5a3a' : '#fff') : '#fff'; ctx.fillText(txt, 200, 58);
  ctx.font = `800 12px ${FONT()}`; ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.fillText(S.mode === 'finish' ? '기록(초)' : '남은 시간', 200, 76);
  // 거리 막대
  const k = clamp(S.dist / CFG.goal, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,.4)'; rrect(20, 96, 360, 12, 6); ctx.fill();
  ctx.fillStyle = '#ffcf4a'; if (k > 0) { rrect(22, 98, Math.max(8, 356 * k), 8, 4); ctx.fill(); }
  [25, 50, 75].forEach((m) => { ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(22 + 356 * m / 100, 96, 1.5, 12); });
  chickenFoot(22 + 356 * k, 96, 0.55, false);
  ctx.textAlign = 'left'; ctx.font = `800 13px ${FONT()}`; ctx.fillStyle = '#fff';
  ctx.fillText(`${Math.min(CFG.goal, Math.floor(S.dist))}m`, 20, 128);
  ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.fillText(`넘어짐 ${S.falls}`, 380, 128);
  ctx.textAlign = 'left'; ctx.font = `700 12px ${FONT()}`; ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.fillText(`최고 ${save.best != null ? fmt(save.best) + '초' : '-'}`, 16, 26);
  // 좌우 반전 안내
  if (S.mode === 'play' && (reversed() || (S.time >= S.warnAt && S.time < S.warnAt + CFG.warnTime))) {
    const now = reversed();
    ctx.globalAlpha = now ? 1 : 0.6 + Math.sin(t * 20) * 0.4;
    ctx.fillStyle = now ? '#e2381a' : '#c88a10'; rrect(70, 150, 260, 38, 19); ctx.fill();
    ctx.textAlign = 'center'; ctx.font = `900 18px ${FONT()}`; ctx.fillStyle = '#fff';
    ctx.fillText(now ? '⇄ 닭발 꼬임! 좌우 반대' : '꼬꼬! 곧 닭발이 꼬여요', 200, 175);
    ctx.globalAlpha = 1;
  }
  if (S.mode === 'countdown' && S.cd && S.cd.n > 0) {
    const kk = S.cd.t;
    ctx.save(); ctx.translate(200, 330); ctx.scale(1.4 - kk * 0.4, 1.4 - kk * 0.4); ctx.globalAlpha = 1 - kk * 0.6;
    ctx.textAlign = 'center'; ctx.font = `900 110px ${FONT()}`; ctx.lineWidth = 12; ctx.strokeStyle = '#2a1030'; ctx.strokeText(S.cd.n, 0, 36);
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
    else if (q.kind === 'dust') { ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#c8a888'; circle(q.x, q.y, q.r * (1.6 - a * 0.6)); ctx.fill(); }
    else if (q.kind === 'conf') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = q.color; ctx.fillRect(-q.r, -q.r * 0.5, q.r * 2, q.r); ctx.restore(); }
  }
  ctx.globalAlpha = 1;
}

function render() {
  const t = vt;
  if (!bgCache) bgCache = buildBackground();
  const sk = S.shake * S.shake * 9;
  const ox = (Math.random() - 0.5) * sk, oy = (Math.random() - 0.5) * sk;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bgCache, 0, 0);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox * scale * dpr, oy * scale * dpr);

  drawRoad();
  // 먼 것부터 차례로 (원근 겹침)
  const list = [];
  BOOTHS.forEach((b) => { const z = b.d - S.dist + PZ; if (z > 0.7 && z < 75) list.push([z, () => drawBooth(b)]); });
  [[25, '25m'], [50, '50m · 절반!'], [75, '75m'], [CFG.goal, '결승선 FINISH']].forEach(([d, label]) => {
    const z = d - S.dist + PZ; if (z > 0.7 && z < 75) list.push([z, () => drawArch(d, label, d === CFG.goal)]);
  });
  S.obs.forEach((o) => { const z = o.d - S.dist + PZ; if (z > 0.7 && z < 60) list.push([z + 0.01, () => (o.type === 'plate' ? drawPlate(o, t) : drawCabbage(o, t))]); });
  S.items.forEach((it) => { if (it.got) return; const z = it.d - S.dist + PZ; if (z > 0.7 && z < 60) list.push([z, () => drawSari(it, t)]); });
  list.push([PZ, () => drawRunner(t)]);
  list.sort((a, b) => b[0] - a[0]).forEach(([, f]) => f());

  drawParts();
  drawHUD(t);
  drawPops();
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
window.__run = { get state() { return S; }, CFG, step: update, steer, jump, startGame };
})();
