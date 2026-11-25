'use strict';
(() => {
const $ = (s) => document.querySelector(s);

/* =========================================================
 * 데이터
 * ======================================================= */
const CARDS = [
  { id: 1, no: '01', name: '철판대장 닭갈비', type: '불',  tier: 'R'  },
  { id: 2, no: '02', name: '메밀 막국수',     type: '물',  tier: 'U'  },
  { id: 3, no: '03', name: '숯불 닭갈비',     type: '불',  tier: 'U'  },
  { id: 4, no: '04', name: '탄수화물 삼총사', type: '노말', tier: 'C'  },
  { id: 5, no: '05', name: '볶음밥 꼬마',     type: '노말', tier: 'C'  },
  { id: 6, no: '06', name: '양배추 수호자',   type: '풀',  tier: 'U'  },
  { id: 7, no: '07', name: '축제 사장님',     type: '특별', tier: 'SP' },
  { id: 8, no: '08', name: '막국수 가위',     type: '강철', tier: 'C'  },
];
const imgOf = (c) => `cards/${c.no}.png`;

const TIER = {
  C:  { label: '커먼',   mark: '◆',   dup: 5 },
  U:  { label: '언커먼', mark: '◆◆',  dup: 10 },
  R:  { label: '레어',   mark: '◆◆◆', dup: 30 },
  SP: { label: '특별',   mark: '♛',   dup: 200 },
};
const HOLO_DUP = 50;
const PACK_COST = 100;
const PITY_MAX = 40;        // 40팩 안에 특별 카드 확정
const GOD_RATE = 0.005;     // 갓팩(전부 홀로 + 특별) 0.5%
const START_COINS = (window.MakdakWallet && MakdakWallet.START) || 2000; // 처음엔 카드팩 20번 무료
// 코인이 모자라면 막닭.ZIP 미니게임으로 벌어 온다 (wallet.js)
const infinite = () => !!(window.MakdakWallet && MakdakWallet.isInfinite()); // 이스터에그: 무한 코인

const PACKS = [
  { id: 'dak', name: '닭갈비 팩', sub: '불꽃 철판 에디션', art: 1, c1: '#e2462b', c2: '#ff9a3c', c3: '#7a1308',
    boost: [1, 3, 4, 5], desc: '철판대장·숯불 닭갈비, 볶음밥 꼬마, 탄수화물 삼총사가 잘 나와요' },
  { id: 'mak', name: '막국수 팩', sub: '시원한 호수 에디션', art: 2, c1: '#2a7fd4', c2: '#7fd0ff', c3: '#0b2f5c',
    boost: [2, 6, 8], desc: '메밀 막국수, 양배추 수호자, 막국수 가위가 잘 나와요' },
];

// 슬롯별 등급 확률 (%). '*' = 홀로 버전
const SLOT = {
  normal: [['C', 80], ['U', 20]],                               // 1~3번
  fourth: [['C', 30], ['U', 60], ['R', 10]],                    // 4번
  rare:   [['U', 40], ['R', 32], ['U*', 14], ['R*', 8], ['SP', 6]], // 5번 (레어 슬롯)
};

/* =========================================================
 * 저장
 * ======================================================= */
const SAVE_KEY = 'chuncheon-cardpack-v1';
const defaultState = () => ({ coins: START_COINS, owned: {}, packs: 0, pity: 0, spPulls: 0, godPacks: 0, sound: true, packSel: 0 });
let firstVisit = false;
let state = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s.coins === 'number') return Object.assign(defaultState(), s);
  } catch (e) { /* 무시 */ }
  firstVisit = true;
  return defaultState();
})();
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ } };
const own = (id) => state.owned[id] || (state.owned[id] = { n: 0, h: 0 });

/* =========================================================
 * 사운드 (Web Audio 합성 — 외부 파일 없음)
 * ======================================================= */
const Sound = {
  ctx: null, master: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  },
  ok() { return state.sound && this.ctx; },
  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, to = null, attack = 0.01 } = {}) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, { vol = 0.2, at = 0, freq = 2000, to = null, q = 1 } = {}) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + at;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  },
  click()   { this.tone(900, 0.06, { type: 'triangle', vol: 0.12 }); },
  scratch() { this.noise(0.06, { vol: 0.08, freq: 3000 + Math.random() * 2500, q: 2 }); },
  tear()    { this.noise(0.45, { vol: 0.35, freq: 1200, to: 6000, q: 0.8 }); this.tone(300, 0.3, { type: 'triangle', vol: 0.06, to: 900 }); },
  whoosh()  { this.noise(0.3, { vol: 0.16, freq: 600, to: 2500, q: 0.6 }); },
  flip()    { this.noise(0.12, { vol: 0.15, freq: 2500, q: 1.5 }); this.tone(520, 0.12, { type: 'triangle', vol: 0.08, at: 0.05 }); },
  rare()    { this.flip(); [784, 988, 1319].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.14, at: 0.05 + i * 0.07 })); },
  holo() {
    this.flip();
    [1047, 1319, 1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.5, { vol: 0.12, at: 0.05 + i * 0.06 }));
    this.noise(0.8, { vol: 0.05, freq: 8000, q: 0.5, at: 0.1 });
  },
  charge(d = 1.4) {
    this.tone(110, d, { type: 'sawtooth', vol: 0.05, to: 880, attack: d * 0.8 });
    this.tone(220, d, { vol: 0.1, to: 1760, attack: d * 0.8 });
    this.noise(d, { vol: 0.06, freq: 300, to: 5000, q: 0.7 });
  },
  boom() { this.tone(90, 0.8, { vol: 0.5, to: 40 }); this.noise(0.6, { vol: 0.3, freq: 400, to: 100, q: 0.5 }); },
  special() {
    this.boom();
    [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.25, { type: 'square', vol: 0.05, at: 0.1 + i * 0.11 }));
    [523, 659, 784, 1047].forEach((f) => {
      this.tone(f, 1.8, { type: 'triangle', vol: 0.1, at: 0.56, attack: 0.03 });
      this.tone(f * 2, 1.4, { type: 'sine', vol: 0.03, at: 0.56 });
    });
    for (let i = 0; i < 10; i++) this.tone(1500 + Math.random() * 2500, 0.25, { vol: 0.04, at: 0.7 + i * 0.12 });
  },
  coin() { this.tone(1568, 0.08, { type: 'square', vol: 0.05 }); this.tone(2093, 0.25, { type: 'square', vol: 0.05, at: 0.07 }); },
  fireworkPop() { this.noise(0.4, { vol: 0.12, freq: 900 + Math.random() * 600, to: 200, q: 0.6 }); },
};

/* =========================================================
 * 파티클 효과 (canvas)
 * ======================================================= */
const FX = (() => {
  const cv = $('#fx'), cx = cv.getContext('2d');
  let W = 0, H = 0, running = false, last = 0;
  const ps = [];
  let timers = [];
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize); resize();

  function add(p) {
    ps.push(p);
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
  }
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    cx.clearRect(0, 0, W, H);
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      const a = Math.min(1, p.life / p.fade);
      if (p.kind === 'confetti') {
        cx.save();
        cx.translate(p.x, p.y); cx.rotate(p.rot); cx.scale(1, Math.cos(p.rot * 2.3));
        cx.globalAlpha = a; cx.fillStyle = p.color;
        cx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        cx.restore();
      } else {
        cx.globalCompositeOperation = 'lighter';
        cx.fillStyle = p.color;
        cx.globalAlpha = a * 0.25;
        cx.beginPath(); cx.arc(p.x, p.y, p.size * 2.6, 0, 7); cx.fill();
        cx.globalAlpha = a;
        cx.beginPath(); cx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, 7); cx.fill();
        if (p.trail) {
          cx.strokeStyle = p.color; cx.lineWidth = p.size * 0.7;
          cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045); cx.stroke();
        }
        cx.globalCompositeOperation = 'source-over';
      }
    }
    cx.globalAlpha = 1;
    if (ps.length) requestAnimationFrame(loop);
    else { running = false; cx.clearRect(0, 0, W, H); }
  }
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  function burst(x, y, { n = 40, colors = ['#fff'], speed = 300, size = 3, g = 200, life = 1.2, drag = 0.97, trail = true, spread = Math.PI * 2, dir = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      const ang = dir + (Math.random() - 0.5) * spread;
      const sp = speed * (0.35 + Math.random() * 0.75);
      add({ kind: 'spark', x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g, drag,
        size: size * (0.6 + Math.random() * 0.8), color: pick(colors), life: life * (0.6 + Math.random() * 0.6),
        fade: 0.5, rot: 0, vr: 0, trail });
    }
  }
  function confetti(n = 120, colors = ['#ffcf4a', '#ff5d7a', '#6be0ff', '#7dff9a', '#ffffff', '#ff9a3c']) {
    for (let i = 0; i < n; i++) {
      add({ kind: 'confetti', x: Math.random() * W, y: -20 - Math.random() * H * 0.5,
        vx: (Math.random() - 0.5) * 120, vy: 80 + Math.random() * 160, g: 60, drag: 0.995,
        size: 8 + Math.random() * 8, color: pick(colors), life: 5 + Math.random() * 2, fade: 1,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10 });
    }
  }
  const FW_COLORS = [['#ffcf4a', '#fff1b8'], ['#ff5d7a', '#ffc2cf'], ['#6be0ff', '#e0f8ff'], ['#7dff9a', '#eaffef'], ['#c58bff', '#f0e0ff']];
  function firework(x, y) {
    burst(x, y, { n: 70, colors: pick(FW_COLORS), speed: 320, size: 2.6, g: 120, life: 1.5, drag: 0.96 });
    Sound.fireworkPop();
  }
  function fireworksShow(ms = 4000, every = 320) {
    const end = performance.now() + ms;
    const tick = () => {
      if (performance.now() > end) return;
      firework(W * (0.12 + Math.random() * 0.76), H * (0.1 + Math.random() * 0.35));
      timers.push(setTimeout(tick, every * (0.6 + Math.random() * 0.8)));
    };
    tick();
  }
  function clear() { timers.forEach(clearTimeout); timers = []; ps.length = 0; }
  return { burst, confetti, firework, fireworksShow, clear };
})();

/* =========================================================
 * 공통 UI
 * ======================================================= */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
function flash(gold = false) {
  const f = $('#flash');
  f.classList.remove('go', 'gold'); void f.offsetWidth;
  f.classList.add('go'); if (gold) f.classList.add('gold');
}
const vibrate = (p) => { if (navigator.vibrate) try { navigator.vibrate(p); } catch (e) { /* 무시 */ } };
function updateCoins(bump) {
  $('#coins').textContent = infinite() ? '∞' : state.coins.toLocaleString();
  $('.wallet').classList.toggle('inf', infinite());
  if (bump) { const w = $('.wallet'); w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump'); }
}
const rarityTag = (card, holo) => {
  if (card.tier === 'SP') return `<span class="rarity-tag t-SP">♛ 특별</span>`;
  if (holo) return `<span class="rarity-tag t-H">★ 홀로 ${TIER[card.tier].label}</span>`;
  return `<span class="rarity-tag t-${card.tier}">${TIER[card.tier].mark} ${TIER[card.tier].label}</span>`;
};

/* 카드 DOM
 * mode: 'back' = 뒤집기 전, 'front' = 앞면만, 'locked' = 뒷면만 */
function makeCard(card, holo, mode = 'back') {
  const el = document.createElement('div');
  el.className = `card3d r-${card.tier}` + (holo && card.tier !== 'SP' ? ' holo' : '') + (mode !== 'back' ? ' noflip' : '');
  const back = `<div class="face back"></div>`;
  const front = `<div class="face front"><img src="${imgOf(card)}" alt="${card.name}" draggable="false">
    <div class="shine"></div><div class="sparkle"></div><div class="glare"></div></div>`;
  const faces = mode === 'back' ? back + front : mode === 'locked' ? back : front;
  el.innerHTML = `<div class="tilt"><div class="card-inner">${faces}</div></div>`;
  return el;
}
function bindTilt(el, strength = 1) {
  const tilt = el.querySelector('.tilt');
  const move = (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    tilt.style.setProperty('--rx', ((0.5 - y) * 18 * strength) + 'deg');
    tilt.style.setProperty('--ry', ((x - 0.5) * 22 * strength) + 'deg');
    el.style.setProperty('--gx', (x * 100) + '%');
    el.style.setProperty('--gy', (y * 100) + '%');
    el.classList.add('touching');
  };
  const leave = () => {
    tilt.style.setProperty('--rx', '0deg'); tilt.style.setProperty('--ry', '0deg');
    el.classList.remove('touching');
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
  el.addEventListener('pointercancel', leave);
}
function makePack(p) {
  const el = document.createElement('div');
  el.className = 'pack';
  el.style.cssText = `--c1:${p.c1};--c2:${p.c2};--c3:${p.c3}`;
  el.innerHTML = `
    <div class="pack-top"><div class="zig top"></div><div class="tear-label">◀ TEAR HERE ▶</div></div>
    <div class="pack-body">
      <div class="pack-art" style="background-image:url(${imgOf(CARDS[p.art - 1])})"></div>
      <div class="pack-title">${p.name}</div>
      <div class="pack-sub">${p.sub}</div>
      <div class="pack-logo">CHUNCHEON · 5 CARDS</div>
      <div class="pack-foil"></div>
    </div>
    <div class="zig bottom"></div>`;
  return el;
}

/* =========================================================
 * 뽑기 로직
 * ======================================================= */
function pickWeighted(list) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of list) if ((r -= w) < 0) return k;
  return list[list.length - 1][0];
}
const cardWeight = (c, pack) => (pack.boost.includes(c.id) ? 2 : 1);
function pickCard(tier, pack) {
  return pickWeighted(CARDS.filter((c) => c.tier === tier).map((c) => [c, cardWeight(c, pack)]));
}
function rollPack(pack) {
  const god = Math.random() < GOD_RATE;
  const slots = [];
  if (god) {
    ['C', 'U', 'U', 'R'].forEach((t) => slots.push({ card: pickCard(t, pack), holo: true }));
    slots.push({ card: CARDS[6], holo: true });
  } else {
    for (let i = 0; i < 3; i++) slots.push({ card: pickCard(pickWeighted(SLOT.normal), pack), holo: false });
    slots.push({ card: pickCard(pickWeighted(SLOT.fourth), pack), holo: false });
    const pityHit = state.pity + 1 >= PITY_MAX;
    const k = pityHit ? 'SP' : pickWeighted(SLOT.rare);
    const t = k.replace('*', '');
    slots.push({ card: pickCard(t, pack), holo: k.endsWith('*') || t === 'SP', pity: pityHit && !god });
  }

  // 도감 반영
  let gotSP = false;
  for (const s of slots) {
    const o = own(s.card.id);
    s.isNew = s.holo && s.card.tier !== 'SP' ? o.h === 0 : o.n === 0;
    s.firstEver = o.n === 0;
    o.n++;
    if (s.holo && s.card.tier !== 'SP') o.h++;
    s.dupCoins = s.isNew ? 0 : (s.holo && s.card.tier !== 'SP' ? HOLO_DUP : TIER[s.card.tier].dup);
    state.coins += s.dupCoins;
    s.rank = s.card.tier === 'SP' ? 3 : s.holo ? 2 : s.card.tier === 'R' ? 1 : 0;
    if (s.card.tier === 'SP') { gotSP = true; state.spPulls++; }
  }
  state.pity = gotSP ? 0 : state.pity + 1;
  state.packs++;
  if (god) state.godPacks++;
  return { slots, god };
}

/* =========================================================
 * 상점 화면
 * ======================================================= */
function renderShop() {
  const sel = $('#packSelect');
  sel.innerHTML = '';
  PACKS.forEach((p, i) => {
    const w = document.createElement('div');
    w.className = 'pack-option' + (i === state.packSel ? ' selected' : '');
    w.appendChild(makePack(p));
    w.onclick = () => {
      Sound.init();
      if (state.packSel === i) { openPack(); return; }
      state.packSel = i; save(); Sound.click(); renderShop();
    };
    sel.appendChild(w);
  });
  const p = PACKS[state.packSel];
  $('#packInfo').innerHTML = `<h3>${p.name}</h3><p>${p.desc}</p>`;
  $('#costLabel').textContent = `₩ ${PACK_COST}`;
  $('#openBtn').disabled = !infinite() && state.coins < PACK_COST;
  $('#earnLink').classList.toggle('hidden', infinite() || state.coins >= PACK_COST);
  $('#pityText').textContent = `${state.pity} / ${PITY_MAX}팩`;
  $('#pityFill').style.width = (state.pity / PITY_MAX * 100) + '%';
  const owned = CARDS.filter((c) => own(c.id).n > 0).length;
  $('#stats').innerHTML = `
    <div><b>${state.packs}</b>개봉한 팩</div>
    <div><b>${state.spPulls}</b>특별 카드</div>
    <div><b>${Math.round(owned / CARDS.length * 100)}%</b>도감 완성</div>`;
  updateCoins();
}

/* =========================================================
 * 도감 화면
 * ======================================================= */
function renderCollection() {
  const grid = $('#colGrid');
  grid.innerHTML = '';
  let ownedCount = 0, holoCount = 0;
  CARDS.forEach((c) => {
    const o = own(c.id);
    const item = document.createElement('div');
    item.className = 'col-item';
    const t = TIER[c.tier];
    if (o.n > 0) {
      ownedCount++; if (o.h > 0) holoCount++;
      const el = makeCard(c, o.h > 0, 'front');
      bindTilt(el, 0.7);
      el.onclick = () => openViewer(c, o.h > 0);
      item.appendChild(el);
      item.insertAdjacentHTML('beforeend', `<div class="meta"><b>${c.no}. ${c.name}</b><br>${t.mark} ${t.label} · ${o.n}장${o.h ? `<span class="holo-chip">홀로 ${o.h}</span>` : ''}</div>`);
    } else {
      item.classList.add('locked');
      const el = makeCard(c, false, 'locked');
      el.insertAdjacentHTML('beforeend', `<div class="locked-no">${c.no}</div>`);
      item.appendChild(el);
      item.insertAdjacentHTML('beforeend', `<div class="meta"><b>${c.no}. ???</b><br>${t.mark} ${t.label}</div>`);
    }
    grid.appendChild(item);
  });
  const holoable = CARDS.filter((c) => c.tier !== 'SP').length;
  $('#colProgress').textContent = `${ownedCount} / ${CARDS.length} 수집 · 홀로 ${holoCount} / ${holoable}`;
  $('#colFill').style.width = (ownedCount / CARDS.length * 100) + '%';
}

/* =========================================================
 * 모달: 카드 크게 보기 / 확률 정보
 * ======================================================= */
function openModal(html, onBuild) {
  const m = $('#modal');
  m.innerHTML = html;
  m.classList.remove('hidden');
  m.onclick = (e) => { if (e.target === m || e.target.closest('.modal-close')) closeModal(); };
  if (onBuild) onBuild(m);
}
function closeModal() { const m = $('#modal'); m.classList.add('hidden'); m.innerHTML = ''; }

function openViewer(card, holo) {
  Sound.init(); Sound.click();
  const o = own(card.id);
  const canToggle = o.h > 0 && card.tier !== 'SP';
  openModal(`<div class="viewer"><div class="v-card"></div>
    <div class="viewer-info">${rarityTag(card, holo)}<div class="nm">${card.no}. ${card.name}</div>
    <div class="sub">${card.type} 타입 · 보유 ${o.n}장${o.h ? ` (홀로 ${o.h})` : ''}</div></div>
    ${canToggle ? `<div class="viewer-toggle"><button data-h="0">일반</button><button data-h="1">홀로</button></div>` : ''}
    <button class="btn light modal-close-btn">닫기</button></div>`, (m) => {
    const slot = m.querySelector('.v-card');
    const render = (h) => {
      slot.innerHTML = '';
      const el = makeCard(card, h, 'front');
      bindTilt(el, 1.2);
      slot.appendChild(el);
      m.querySelectorAll('.viewer-toggle button').forEach((b) => b.classList.toggle('on', (b.dataset.h === '1') === h));
      m.querySelector('.viewer-info').firstElementChild.outerHTML = rarityTag(card, h);
    };
    render(holo);
    m.querySelectorAll('.viewer-toggle button').forEach((b) => { b.onclick = () => { Sound.click(); render(b.dataset.h === '1'); }; });
    m.querySelector('.modal-close-btn').onclick = closeModal;
  });
}

function openRates() {
  Sound.init(); Sound.click();
  const pack = PACKS[state.packSel];
  const pct = (v) => (v * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
  const slotRow = (name, table) => {
    const total = table.reduce((s, [, w]) => s + w, 0);
    const label = { C: '커먼', U: '언커먼', R: '레어', 'U*': '홀로 언커먼', 'R*': '홀로 레어', SP: '특별' };
    return `<tr><td>${name}</td><td>${table.map(([k, w]) => `${label[k]} ${pct(w / total)}`).join(' · ')}</td></tr>`;
  };
  // 레어 슬롯(5번) 카드별 확률
  const rareTotal = SLOT.rare.reduce((s, [, w]) => s + w, 0);
  const rows = [];
  for (const [k, w] of SLOT.rare) {
    const t = k.replace('*', '');
    const pool = CARDS.filter((c) => c.tier === t);
    const sumW = pool.reduce((s, c) => s + cardWeight(c, pack), 0);
    pool.forEach((c) => rows.push({ c, holo: k.endsWith('*'), p: (w / rareTotal) * (cardWeight(c, pack) / sumW) }));
  }
  rows.sort((a, b) => a.p - b.p);
  openModal(`<div class="modal-box rates"><button class="modal-close">✕</button>
    <h3>📊 확률 정보</h3>
    <p>한 팩에 카드 5장이 들어 있어요. 마지막 5번째 카드는 레어 이상이 잘 나오는 <b>레어 슬롯</b>이에요.</p>
    <table><tr><th>슬롯</th><th>등급 확률</th></tr>
      ${slotRow('1~3번', SLOT.normal)}${slotRow('4번', SLOT.fourth)}${slotRow('5번', SLOT.rare)}
    </table>
    <h4>${pack.name} · 5번 슬롯 카드별 확률</h4>
    <table><tr><th>카드</th><th>확률</th></tr>
      ${rows.map((r) => `<tr><td>${r.c.tier === 'SP' ? '♛ ' : r.holo ? '★ ' : ''}${r.c.name}${r.holo ? ' (홀로)' : ''}</td><td>${pct(r.p)}</td></tr>`).join('')}
    </table>
    <h4>특별 규칙</h4>
    <p>✦ <b>천장</b>: 특별 카드 없이 ${PITY_MAX - 1}팩을 열면, ${PITY_MAX}번째 팩의 레어 슬롯은 <b>축제 사장님</b> 확정!</p>
    <p>✦ <b>갓팩</b>: ${pct(GOD_RATE)} 확률로 5장 전부 홀로 + 축제 사장님이 들어 있는 팩이 나와요.</p>
    <p>✦ 같은 팩 안에서 강조된 카드는 같은 등급 안에서 2배 더 잘 나와요.</p>
    <p>✦ 중복 카드는 축제 코인으로 바뀌어요: 커먼 ${TIER.C.dup} · 언커먼 ${TIER.U.dup} · 레어 ${TIER.R.dup} · 홀로 ${HOLO_DUP} · 특별 ${TIER.SP.dup}</p>
  </div>`);
}

/* =========================================================
 * 팩 개봉 연출
 * ======================================================= */
const stage = $('#stage');
let session = null;
let nameEl = null;

function openPack() {
  if (session) return;
  Sound.init();
  if (!infinite() && state.coins < PACK_COST) { toast('코인이 부족해요. 미니게임을 하고 코인을 벌어 오세요!'); return; }
  if (!infinite()) state.coins -= PACK_COST;
  const pack = PACKS[state.packSel];
  const { slots, god } = rollPack(pack);
  save();
  updateCoins();
  session = { pack, slots, god, items: [], cur: 0, phase: 'pack', busy: false };
  buildStage();
}

function buildStage() {
  const { pack, slots, god } = session;
  stage.className = 'stage';
  $('#summary').classList.add('hidden');
  $('#summary').innerHTML = '';
  $('#cardStack').innerHTML = '';
  $('#banner').className = 'banner';
  $('#counter').textContent = '';
  $('#skipBtn').classList.add('hidden');
  if (!nameEl) { nameEl = document.createElement('div'); nameEl.className = 'reveal-name'; stage.appendChild(nameEl); }
  nameEl.className = 'reveal-name';

  const sp = $('#stagePack');
  sp.className = 'stage-pack';
  sp.innerHTML = '';
  const pk = makePack(pack);
  const line = document.createElement('div'); line.className = 'cut-line';
  const arrow = document.createElement('div'); arrow.className = 'cut-arrow'; arrow.textContent = '여기를 옆으로 쓸어 개봉 ▶';
  const zone = document.createElement('div'); zone.className = 'cut-zone';
  pk.append(line, arrow, zone);
  sp.appendChild(pk);

  // 좋은 카드가 들어 있으면 가끔 팩이 빛나는 예고 연출
  const hasSP = slots.some((s) => s.card.tier === 'SP');
  if (god) sp.classList.add('aura-rainbow');
  else if (hasSP && Math.random() < 0.6) sp.classList.add('aura-gold');

  $('#stageHint').textContent = '팩 윗부분을 옆으로 쓸어서 개봉하세요 · 더블클릭도 가능';
  Sound.whoosh();
  setupCut(pk, zone, line);
}

function setupCut(pk, zone, line) {
  let down = false, minX = 1, maxX = 0, lastFx = 0;
  const relX = (e) => {
    const r = pk.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  zone.addEventListener('pointerdown', (e) => {
    if (!session || session.phase !== 'pack') return;
    Sound.init();
    down = true; zone.setPointerCapture(e.pointerId);
    minX = maxX = relX(e);
  });
  zone.addEventListener('pointermove', (e) => {
    if (!down || !session || session.phase !== 'pack') return;
    const x = relX(e);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    line.style.left = (minX * 100) + '%';
    line.style.width = ((maxX - minX) * 100) + '%';
    const now = performance.now();
    if (now - lastFx > 45) {
      lastFx = now;
      Sound.scratch();
      FX.burst(e.clientX, pk.getBoundingClientRect().top + pk.getBoundingClientRect().height * 0.15,
        { n: 5, colors: ['#fff', '#ffe9a8'], speed: 160, size: 2, g: 500, life: 0.5 });
    }
    if (maxX - minX > 0.8) { down = false; tear(); }
  });
  const up = () => {
    if (!down) return;
    down = false;
    if (session && session.phase === 'pack') {
      line.style.width = '0';
      minX = 1; maxX = 0;
    }
  };
  zone.addEventListener('pointerup', up);
  zone.addEventListener('pointercancel', up);
  pk.addEventListener('dblclick', () => tear());
}

function tear() {
  if (!session || session.phase !== 'pack') return;
  session.phase = 'tearing';
  const sp = $('#stagePack');
  const r = sp.querySelector('.pack').getBoundingClientRect();
  Sound.tear();
  vibrate(30);
  sp.classList.add('torn');
  FX.burst(r.left + r.width / 2, r.top + r.height * 0.15, { n: 34, colors: ['#fff', '#ffe9a8', '#ffd36b'], speed: 380, g: 420, life: 0.9 });
  $('#stageHint').textContent = '';
  if (session.god) {
    flash(true);
    FX.burst(r.left + r.width / 2, r.top + r.height * 0.2, { n: 120, colors: ['#ff7aa2', '#ffe46b', '#6be0ff', '#c58bff', '#fff'], speed: 650, size: 3.5, g: 200, life: 1.8 });
  }
  setTimeout(() => { sp.classList.add('drop'); dealCards(); }, 520);
  setTimeout(() => { if (session) { sp.innerHTML = ''; sp.className = 'stage-pack'; } }, 1400);
}

function dealCards() {
  if (!session) return;
  const stack = $('#cardStack');
  stack.innerHTML = '';
  stack.classList.add('rising');
  session.items = session.slots.map((pull, i) => {
    const el = makeCard(pull.card, pull.holo, 'back');
    el.style.zIndex = String(10 - i);
    el.style.setProperty('--off', `${-i * 5}px`);
    el.style.setProperty('--rot', i === 0 ? '0deg' : `${(Math.random() - 0.5) * 5}deg`);
    bindTilt(el, 0.8);
    stack.appendChild(el);
    return { el, pull, revealed: false };
  });
  void stack.offsetWidth;
  session.items.forEach((it, i) => { it.el.style.transitionDelay = `${(session.items.length - 1 - i) * 60}ms`; });
  stack.classList.remove('rising');
  Sound.whoosh();
  setTimeout(() => {
    if (!session) return;
    session.items.forEach((it) => { it.el.style.transitionDelay = ''; });
    session.phase = 'cards';
    $('#skipBtn').classList.remove('hidden');
    if (session.god) showBanner('✦ GOD PACK ✦', '전부 홀로!', 'rainbow');
    setTop(0);
  }, 800);
}

function setTop(i) {
  const it = session.items[i];
  $('#counter').textContent = `${i + 1} / ${session.items.length}`;
  $('#stageHint').textContent = '탭해서 카드를 뒤집어요';
  const r = it.pull.rank;
  if (r === 3) it.el.classList.add('hint-gold');
  else if (r === 2) it.el.classList.add('hint-holo');
  else if (r === 1) it.el.classList.add('hint-rare');
}

function cardCenter(el) {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2, r];
}

function showName(it) {
  const { card, holo, isNew, dupCoins, pity } = it.pull;
  nameEl.innerHTML = `${rarityTag(card, holo)}<div class="nm">${card.name}</div>
    <div class="dup">${isNew ? '✨ NEW! 도감에 등록됐어요' : `중복 → 코인 +${dupCoins}`}${pity ? ' · 천장 달성!' : ''}</div>`;
  nameEl.classList.add('show');
}
function hideName() { if (nameEl) nameEl.classList.remove('show'); }

function showBanner(small, big, kind = '') {
  const b = $('#banner');
  b.className = 'banner';
  b.innerHTML = `<div class="b-small">${small}</div><div class="b-big">${big}</div>`;
  void b.offsetWidth;
  b.className = `banner show ${kind}`;
}

function flipCard(it) {
  it.el.classList.remove('hint-gold', 'hint-holo', 'hint-rare');
  it.el.classList.add('flipped', 'pop');
  showName(it);
  $('#stageHint').textContent = '한 번 더 탭하면 다음 카드';
}

function reveal(it) {
  session.busy = true;
  it.revealed = true;
  const el = it.el;
  const rank = it.pull.rank;
  const release = (ms) => setTimeout(() => { if (session) session.busy = false; }, ms);

  if (rank === 3) {
    // ===== 특별 카드: 암전 → 진동 충전 → 섬광 → 회전 광선 + 불꽃놀이 + 꽃가루 =====
    stage.classList.add('dim');
    $('#stageHint').textContent = '';
    el.classList.add('charging');
    Sound.charge(1.4);
    vibrate([20, 60, 20, 60, 20]);
    const sparkTimer = setInterval(() => {
      const [, , r] = cardCenter(el);
      const side = Math.random();
      const x = side < 0.5 ? r.left + Math.random() * r.width : (side < 0.75 ? r.left : r.right);
      const y = side < 0.5 ? (Math.random() < 0.5 ? r.top : r.bottom) : r.top + Math.random() * r.height;
      FX.burst(x, y, { n: 4, colors: ['#ffcf4a', '#fff1b8'], speed: 90, size: 2.4, g: -140, life: 0.9, trail: false });
    }, 70);
    setTimeout(() => {
      clearInterval(sparkTimer);
      if (!session) return;
      el.classList.remove('charging');
      flash(true);
      flipCard(it);
      Sound.special();
      vibrate([80, 40, 160]);
      stage.classList.add('rays-on');
      stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
      const [x, y] = cardCenter(el);
      FX.burst(x, y, { n: 160, colors: ['#ffcf4a', '#fff1b8', '#ffffff', '#ff9a3c'], speed: 780, size: 3.6, g: 260, life: 1.9 });
      FX.confetti(170);
      FX.fireworksShow(4800);
      showBanner('✦ 특별 카드 ✦', `${it.pull.card.name} 등장!`);
      release(1500);
    }, 1450);
  } else if (rank === 2) {
    // ===== 홀로: 짧은 떨림 → 무지개 광선 =====
    el.classList.add('charging-short');
    Sound.charge(0.6);
    setTimeout(() => {
      if (!session) return;
      el.classList.remove('charging-short');
      flash();
      flipCard(it);
      Sound.holo();
      stage.classList.add('rays-on', 'rays-rainbow');
      const [x, y] = cardCenter(el);
      FX.burst(x, y, { n: 80, colors: ['#ff7aa2', '#ffe46b', '#6be0ff', '#7dff9a', '#c58bff', '#fff'], speed: 520, size: 3, g: 220, life: 1.4 });
      release(600);
    }, 650);
  } else if (rank === 1) {
    // ===== 레어: 빛 스윕 =====
    flipCard(it);
    el.classList.add('glint');
    Sound.rare();
    const [x, y] = cardCenter(el);
    FX.burst(x, y, { n: 30, colors: ['#ffffff', '#fff1b8'], speed: 380, size: 2.6, g: 300, life: 1 });
    release(450);
  } else {
    flipCard(it);
    Sound.flip();
    release(350);
  }
}

function dismiss(it) {
  session.busy = true;
  hideName();
  it.el.classList.add('away');
  Sound.whoosh();
  stage.classList.remove('rays-on', 'rays-rainbow', 'dim', 'shake');
  session.cur++;
  setTimeout(() => {
    if (!session) return;
    it.el.remove();
    if (session.cur >= session.items.length) showSummary(false);
    else setTop(session.cur);
    session.busy = false;
  }, 330);
}

function advance() {
  if (!session || session.busy) return;
  if (session.phase === 'pack') return;
  if (session.phase !== 'cards') return;
  const it = session.items[session.cur];
  if (!it) return;
  if (!it.revealed) reveal(it); else dismiss(it);
}

function skipAll() {
  if (!session || session.phase !== 'cards' || session.busy) return;
  const hiddenSP = session.items.slice(session.cur).some((it) => !it.revealed && it.pull.rank === 3);
  session.items.forEach((it) => it.el.remove());
  hideName();
  stage.classList.remove('rays-on', 'rays-rainbow', 'dim', 'shake');
  showSummary(hiddenSP);
}

function showSummary(celebrate) {
  session.phase = 'summary';
  $('#skipBtn').classList.add('hidden');
  $('#counter').textContent = '';
  $('#stageHint').textContent = '';
  const { slots } = session;
  const newCount = slots.filter((s) => s.isNew).length;
  const gained = slots.reduce((s, x) => s + x.dupCoins, 0);
  const sum = $('#summary');
  sum.innerHTML = `
    <h2>${session.god ? '🌈 갓팩 개봉 결과' : '개봉 결과'}</h2>
    <p class="sum-sub">새 카드 ${newCount}장 · 중복 보상 코인 +${gained}</p>
    <div class="sum-grid"></div>
    <div class="sum-actions">
      <button class="btn primary" id="againBtn">한 팩 더 <small>₩ ${PACK_COST}</small></button>
      <button class="btn light" id="closeStageBtn">닫기</button>
    </div>`;
  const grid = sum.querySelector('.sum-grid');
  slots.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'sum-item';
    item.style.animationDelay = `${i * 90}ms`;
    const c = makeCard(p.card, p.holo, 'front');
    bindTilt(c, 1);
    c.onclick = () => openViewer(p.card, p.holo);
    if (p.isNew) c.insertAdjacentHTML('beforeend', '<div class="badge-new">NEW</div>');
    item.appendChild(c);
    item.insertAdjacentHTML('beforeend', rarityTag(p.card, p.holo));
    grid.appendChild(item);
  });
  sum.classList.remove('hidden');
  const again = $('#againBtn');
  again.disabled = !infinite() && state.coins < PACK_COST;
  again.onclick = (e) => { e.stopPropagation(); closeStage(); openPack(); };
  $('#closeStageBtn').onclick = (e) => { e.stopPropagation(); closeStage(); };
  if (celebrate) {
    flash(true);
    Sound.special();
    FX.confetti(160);
    FX.fireworksShow(3500);
    showBanner('✦ 특별 카드 ✦', '축제 사장님 등장!');
  }
  if (gained > 0) Sound.coin();
}

function closeStage() {
  FX.clear();
  stage.className = 'stage hidden';
  $('#stagePack').innerHTML = '';
  $('#cardStack').innerHTML = '';
  $('#summary').classList.add('hidden');
  hideName();
  session = null;
  renderShop();
  renderCollection();
}

/* =========================================================
 * 이벤트 연결
 * ======================================================= */
stage.addEventListener('click', (e) => {
  if (e.target.closest('button, .summary')) return;
  advance();
});
$('#skipBtn').addEventListener('click', (e) => { e.stopPropagation(); skipAll(); });
$('#openBtn').addEventListener('click', () => openPack());
// 다른 페이지(미니게임)에서 번 코인 · 무한 코인 모드를 돌아왔을 때 바로 반영
function syncWallet() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s.coins === 'number' && s.coins !== state.coins) { state.coins = s.coins; updateCoins(true); }
  } catch (e) { /* 무시 */ }
  updateCoins(); renderShop();
}
addEventListener('pageshow', syncWallet);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !session) syncWallet(); });
$('#ratesBtn').addEventListener('click', openRates);
$('#soundBtn').addEventListener('click', () => {
  state.sound = !state.sound; save();
  $('#soundBtn').textContent = state.sound ? '🔊' : '🔇';
  Sound.init(); Sound.click();
});
$('#resetBtn').addEventListener('click', () => {
  if (!confirm('모든 카드와 코인 기록을 지울까요? 되돌릴 수 없어요.')) return;
  const sound = state.sound;
  state = defaultState(); state.sound = sound; save();
  renderShop(); renderCollection();
  toast('기록을 초기화했어요');
});
document.querySelectorAll('.tabbar [data-tab]').forEach((b) => {
  b.addEventListener('click', () => {
    Sound.init(); Sound.click();
    document.querySelectorAll('.tabbar [data-tab]').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === b.dataset.tab));
    if (b.dataset.tab === 'collection') renderCollection();
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) { closeModal(); return; }
  if (!session) return;
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (session.phase === 'pack') tear();
    else advance();
  }
});

/* 시작 */
$('#soundBtn').textContent = state.sound ? '🔊' : '🔇';
renderShop();
renderCollection();
if (firstVisit) { save(); setTimeout(() => toast(`축제에 오신 걸 환영해요! 카드팩 ${Math.floor(START_COINS / PACK_COST)}번 무료 (코인 ${START_COINS})`), 400); }
})();
