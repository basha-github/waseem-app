// ═══════════════════════════════════════════════════════════════
//  fruitGame.js — the game itself: falling fruit, swipe-to-slice,
//  juice sparks, star pops, sunny background, and the synthesized
//  slice sound. Browser (Canvas2D) port of the game half of
//  FruitNinja.js (everything except calibration, which lives in
//  main.js like the other ports).
// ═══════════════════════════════════════════════════════════════

const GRAVITY = 0.0045;
const TWO_PI = Math.PI * 2;

const FRUIT_DEFS = [
  { name: "watermelon", emoji: "🍉", col: [50, 200, 80], url: "watermelon.png" },
  { name: "mango", emoji: "🥭", col: [255, 130, 0], url: "mango.png" },
  { name: "banana", emoji: "🍌", col: [25, 100, 0], url: "banana.png" },
  { name: "kiwi", emoji: "🥝", col: [155, 100, 0], url: "kiwi.png" },
  { name: "coconut", emoji: "🥥", col: [45, 80, 20], url: "coconut.png" },
  { name: "icecream", emoji: "🍨", col: [255, 60, 100], url: "icecream.png" },
  { name: "grape", emoji: "🍇", col: [80, 80, 80], url: "grape.png" },
];

const rand = (a, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randPick = arr => arr[Math.floor(Math.random() * arr.length)];
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

// Cheap smoothed value-noise (stand-in for p5's Perlin noise() — only
// used for a gentle hill-line wobble, so exact match isn't needed).
function smoothNoise(x) {
  const i = Math.floor(x);
  const f = x - i;
  const a = Math.sin(i * 12.9898) * 43758.5453 % 1;
  const b = Math.sin((i + 1) * 12.9898) * 43758.5453 % 1;
  const fa = Math.abs(a), fb = Math.abs(b);
  const t = f * f * (3 - 2 * f); // smoothstep
  return fa + (fb - fa) * t;
}

function lineHitsCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1, fx = x1 - cx, fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (!a) return false;
  const b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
  let d = b * b - 4 * a * c;
  if (d < 0) return false;
  d = Math.sqrt(d);
  const t1 = (-b - d) / (2 * a), t2 = (-b + d) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

// ── Slice sound (Web Audio synth — noise burst + falling triangle tone) ──
function playSliceSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -6;
    compressor.knee.value = 3;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.001;
    compressor.release.value = 0.1;
    compressor.connect(ctx.destination);

    const bufSize = Math.floor(ctx.sampleRate * 0.18);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(3200, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.15);
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    src.connect(filter); filter.connect(gain); gain.connect(compressor);
    src.start(); src.stop(ctx.currentTime + 0.2);

    const osc = ctx.createOscillator(), og = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(500, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.12);
    og.gain.setValueAtTime(12, ctx.currentTime);
    og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    osc.connect(og); og.connect(compressor);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
  } catch (e) { /* ignore — sound is best-effort */ }
}

// ── Cartoon fruit sprite (image if loaded, else a colourful emoji circle) ──
const nativeImgs = {};
FRUIT_DEFS.forEach(d => {
  const img = new Image();
  img.onload = () => { nativeImgs[d.name] = img; };
  img.onerror = () => { nativeImgs[d.name] = null; };
  img.src = d.url;
});

function drawCartoonFruit(ctx, def, r, alpha = 255, half = 0) {
  const img = nativeImgs[def.name];
  const hasImg = img && img.complete && img.naturalWidth > 0;

  ctx.save();
  ctx.globalAlpha = alpha / 255;

  if (half !== 0) {
    ctx.beginPath();
    const startA = half === -1 ? Math.PI / 2 : -Math.PI / 2;
    const endA = half === -1 ? (3 * Math.PI) / 2 : Math.PI / 2;
    ctx.arc(0, 0, r, startA, endA);
    ctx.closePath();
    ctx.clip();
  }

  let drewImg = hasImg;
  if (hasImg) {
    try {
      ctx.drawImage(img, -r * 1.5, -r * 1.5, r * 3, r * 3);
    } catch (e) { drewImg = false; }
  }

  if (!drewImg) {
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha / 255;

    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 10;

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    const c = def.col;
    grad.addColorStop(0, `rgb(${Math.min(c[0] + 80, 255)},${Math.min(c[1] + 80, 255)},${Math.min(c[2] + 80, 255)})`);
    grad.addColorStop(1, `rgb(${c[0]},${c[1]},${c[2]})`);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.3, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.font = `${r * 1.1}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(def.emoji, 0, 4);
  }

  ctx.restore();
}

// ── Fruit ────────────────────────────────────────────────────────────
class Fruit {
  constructor(width, height) {
    this.def = randPick(FRUIT_DEFS);
    this.r = rand(30, 44);
    this.x = rand(this.r + 40, width - this.r - 40);
    this.y = -this.r - 20;
    this.vx = rand(-0.25, 0.25);
    this.vy = rand(0.75, 1.75);
    this.angle = rand(TWO_PI);
    this.spin = rand(-0.05, 0.05);
    this.dead = false;
    this.sliced = false;
    this.wobble = rand(TWO_PI);
    this.wobbleSpeed = rand(0.06, 0.12);
  }

  update(height) {
    this.vy += GRAVITY;
    this.x += this.vx;
    this.y += this.vy;
    this.angle += this.spin;
    this.wobble += this.wobbleSpeed;
    if (this.y > height + 120) this.dead = true;
  }

  draw(ctx) {
    const wobbleScale = 1 + Math.sin(this.wobble) * 0.04;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.scale(wobbleScale, 1 / wobbleScale);
    drawCartoonFruit(ctx, this.def, this.r);
    ctx.restore();
  }

  slice(game) {
    if (this.sliced) return;
    this.sliced = true;
    this.dead = true;
    playSliceSound();
    game.score++;
    game.comboCount++;
    game.comboTimer = 55;
    for (let i = 0; i < 28; i++) game.sparks.push(new Spark(this.x, this.y, this.def.col));
    for (let i = 0; i < 8; i++) game.stars.push(new StarPop(this.x, this.y));
    game.pieces.push(new HalfFruit(this.x, this.y, this.def, this.r, -1));
    game.pieces.push(new HalfFruit(this.x, this.y, this.def, this.r, 1));
  }
}

// ── HalfFruit ────────────────────────────────────────────────────────
class HalfFruit {
  constructor(x, y, def, r, dir) {
    this.x = x; this.y = y; this.def = def; this.r = r; this.dir = dir;
    this.vx = dir * rand(4, 9); this.vy = rand(2, 5);
    this.angle = rand(TWO_PI); this.spin = dir * rand(0.06, 0.15);
    this.alpha = 255; this.dead = false;
  }
  update(height) {
    this.vy += GRAVITY * 1.2; this.x += this.vx; this.y += this.vy;
    this.angle += this.spin; this.alpha -= 4;
    if (this.alpha <= 0 || this.y > height + 80) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    drawCartoonFruit(ctx, this.def, this.r, this.alpha, this.dir);
    ctx.restore();
  }
}

// ── Spark (juice drop) ──────────────────────────────────────────────
class Spark {
  constructor(x, y, col) {
    this.x = x; this.y = y; this.col = col;
    this.vx = rand(-10, 10); this.vy = rand(-6, 8);
    this.a = 255; this.r = rand(5, 15); this.dead = false;
  }
  update() {
    this.vy += 0.5; this.x += this.vx; this.y += this.vy;
    this.a -= 9; this.r *= 0.94;
    if (this.a <= 0) this.dead = true;
  }
  draw(ctx) {
    const c = this.col;
    ctx.save();
    ctx.fillStyle = `rgba(${Math.min(c[0] + 80, 255)},${Math.min(c[1] + 80, 255)},${Math.min(c[2] + 80, 255)},${Math.max(0, this.a * 0.5) / 255})`;
    ctx.beginPath();
    ctx.ellipse(this.x - this.r * 0.2, this.y - this.r * 0.2, Math.max(0, this.r * 0.3), Math.max(0, this.r * 0.3), 0, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, this.a) / 255})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(0, this.r / 2), 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }
}

// ── StarPop (fun star burst) ────────────────────────────────────────
class StarPop {
  constructor(x, y) {
    this.x = x; this.y = y;
    const a = rand(TWO_PI), s = rand(5, 14);
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s - 3;
    this.a = 255; this.r = rand(10, 20); this.rot = rand(TWO_PI);
    this.rotSpeed = rand(-0.15, 0.15); this.dead = false;
  }
  update() {
    this.vy += 0.4; this.x += this.vx; this.y += this.vy;
    this.vx *= 0.95; this.rot += this.rotSpeed; this.a -= 7;
    if (this.a <= 0) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.fillStyle = `rgba(255,230,0,${Math.max(0, this.a) / 255})`;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const r = i % 2 === 0 ? this.r : this.r * 0.45;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// ── Background — sunny golden sky + hills + clouds (pre-rendered once) ──
function buildBackground(width, height) {
  const c = document.createElement("canvas");
  c.width = width; c.height = height;
  const g = c.getContext("2d");

  const skyGrad = g.createLinearGradient(0, 0, 0, height);
  skyGrad.addColorStop(0, "rgb(255,220,30)");
  skyGrad.addColorStop(1, "rgb(255,140,0)");
  g.fillStyle = skyGrad;
  g.fillRect(0, 0, width, height);

  const sx = width * 0.15, sy = height * 0.12;
  for (let i = 0; i < 16; i++) {
    const a = (TWO_PI / 16) * i;
    const x1 = sx + Math.cos(a) * 70, y1 = sy + Math.sin(a) * 70;
    const x2 = sx + Math.cos(a) * 110, y2 = sy + Math.sin(a) * 110;
    g.strokeStyle = "rgba(255,240,80,0.706)";
    g.lineWidth = 6;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
  g.fillStyle = "rgb(255,250,100)";
  g.beginPath(); g.arc(sx, sy, 60, 0, TWO_PI); g.fill();
  g.fillStyle = "rgb(255,255,200)";
  g.beginPath(); g.arc(sx, sy, 40, 0, TWO_PI); g.fill();

  function puffCloud(cx, cy, scale) {
    g.fillStyle = "rgba(255,255,255,0.902)";
    const ell = (ex, ey, ew, eh) => { g.beginPath(); g.ellipse(ex, ey, ew / 2, eh / 2, 0, 0, TWO_PI); g.fill(); };
    ell(cx, cy, scale * 140, scale * 70);
    ell(cx - scale * 50, cy + scale * 10, scale * 100, scale * 60);
    ell(cx + scale * 55, cy + scale * 15, scale * 110, scale * 55);
    ell(cx - scale * 10, cy - scale * 25, scale * 80, scale * 60);
    ell(cx + scale * 20, cy - scale * 20, scale * 70, scale * 55);
    g.strokeStyle = "rgba(220,220,220,0.314)";
    g.lineWidth = 2;
    g.beginPath(); g.ellipse(cx, cy, scale * 70, scale * 35, 0, 0, TWO_PI); g.stroke();
  }
  puffCloud(width * 0.35, height * 0.1, 1.0);
  puffCloud(width * 0.65, height * 0.06, 0.75);
  puffCloud(width * 0.8, height * 0.18, 0.85);

  g.fillStyle = "rgb(120,200,60)";
  g.beginPath();
  g.moveTo(0, height);
  for (let x = 0; x <= width; x += 20) {
    const y = height * 0.72 + Math.sin(x * 0.008) * 60 + smoothNoise(x * 0.03) * 80;
    g.lineTo(x, y);
  }
  g.lineTo(width, height);
  g.closePath();
  g.fill();

  g.fillStyle = "rgb(80,170,40)";
  g.beginPath();
  g.moveTo(0, height);
  for (let x = 0; x <= width; x += 20) {
    const y = height * 0.85 + Math.sin(x * 0.012 + 1) * 40 + smoothNoise(x * 0.05 + 10) * 50;
    g.lineTo(x, y);
  }
  g.lineTo(width, height);
  g.closePath();
  g.fill();

  function drawFlower(fx, fy, col) {
    g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},0.863)`;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      g.beginPath();
      g.ellipse(fx + Math.cos(a) * 9, fy + Math.sin(a) * 9, 5, 7, 0, 0, TWO_PI);
      g.fill();
    }
    g.fillStyle = "rgb(255,230,0)";
    g.beginPath(); g.arc(fx, fy, 7, 0, TWO_PI); g.fill();
  }
  const flowerColors = [[255, 80, 120], [220, 60, 255], [255, 160, 0], [60, 200, 255]];
  for (let i = 0; i < 30; i++) {
    drawFlower(rand(width), height * 0.8 + rand(height * 0.2), randPick(flowerColors));
  }

  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(255,255,180,${rand(80, 180) / 255})`;
    const r = rand(1.5, 4);
    g.beginPath(); g.arc(rand(width), rand(height * 0.7), r, 0, TWO_PI); g.fill();
  }

  return c;
}

// ── The game ─────────────────────────────────────────────────────────
export class FruitGame {
  constructor() {
    this.fruits = [];
    this.pieces = [];
    this.sparks = [];
    this.stars = [];
    this.trail = [];
    this.prevMX = 0; this.prevMY = 0;
    this.spawnTimer = 0; this.spawnRate = 65;
    this.score = 0;
    this.comboCount = 0; this.comboTimer = 0;
    this.bg = null;
  }

  resize(width, height) {
    this.bg = buildBackground(width, height);
  }

  reset() {
    this.trail = [];
  }

  // ── mouse/touch drag slicing (speed-gated, like the original's hammerDragged) ──
  hammerDragged(hx, hy) {
    this.trail.push({ x: hx, y: hy });
    if (this.trail.length > 20) this.trail.shift();
    const speed = dist(this.prevMX, this.prevMY, hx, hy);
    if (speed > 28) {
      for (const f of this.fruits) {
        if (!f.dead && !f.sliced && lineHitsCircle(this.prevMX, this.prevMY, hx, hy, f.x, f.y, f.r * 1.8)) {
          f.slice(this);
        }
      }
    }
    this.prevMX = hx; this.prevMY = hy;
  }

  onPointerDown(x, y) {
    this.trail = [];
    this.prevMX = x; this.prevMY = y;
  }

  onPointerUp() {
    this.trail = [];
  }

  // Plain click/tap (no real drag) — slice whatever's directly under it.
  clickSlice(x, y) {
    for (const f of this.fruits) {
      if (!f.dead && !f.sliced && dist(x, y, f.x, f.y) < f.r * 1.8) f.slice(this);
    }
  }

  // ── fingertip swipe (independent trail/threshold, same as the original) ──
  handleFingerSwipe(fingerScreenX, fingerScreenY) {
    if (fingerScreenX < 0) { this._fingerHasPos = false; return; }
    if (!this._fingerHasPos) {
      this._prevFX = fingerScreenX; this._prevFY = fingerScreenY;
      this._fingerHasPos = true;
      return;
    }
    this.trail.push({ x: fingerScreenX, y: fingerScreenY });
    if (this.trail.length > 20) this.trail.shift();

    const moved = dist(this._prevFX, this._prevFY, fingerScreenX, fingerScreenY);
    if (moved > 2) {
      for (const f of this.fruits) {
        if (!f.dead && !f.sliced && lineHitsCircle(this._prevFX, this._prevFY, fingerScreenX, fingerScreenY, f.x, f.y, f.r * 1.8)) {
          f.slice(this);
        }
      }
    }
    this._prevFX = fingerScreenX; this._prevFY = fingerScreenY;
  }

  drawTrail(ctx) {
    if (this.trail.length < 2) return;
    for (let i = 1; i < this.trail.length; i++) {
      const t = i / this.trail.length;
      ctx.strokeStyle = `rgba(255,240,80,${(t * 90) / 255})`;
      ctx.lineWidth = t * 22;
      ctx.beginPath();
      ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
      ctx.lineTo(this.trail[i].x, this.trail[i].y);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${(t * 250) / 255})`;
      ctx.lineWidth = t * 4;
      ctx.beginPath();
      ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
      ctx.lineTo(this.trail[i].x, this.trail[i].y);
      ctx.stroke();
    }
  }

  drawFingerDot(ctx, fx, fy) {
    if (fx < 0) return;
    const ell = (r, style) => {
      ctx.fillStyle = style;
      ctx.beginPath(); ctx.arc(fx, fy, r, 0, TWO_PI); ctx.fill();
    };
    ell(40, "rgba(255,105,180,0.353)");
    ell(22, "rgba(255,105,180,1)");
    ell(6, "#fff");
  }

  update(width, height) {
    this.spawnTimer++;
    if (this.spawnTimer >= this.spawnRate) {
      this.spawnTimer = 0;
      const count = Math.floor(rand(1, 4));
      for (let i = 0; i < count; i++) this.fruits.push(new Fruit(width, height));
    }

    if (this.comboTimer > 0) this.comboTimer--;
    else this.comboCount = 0;

    for (const p of this.pieces) p.update(height);
    this.pieces = this.pieces.filter(p => !p.dead);

    for (const s of this.sparks) s.update();
    this.sparks = this.sparks.filter(s => !s.dead);

    for (const st of this.stars) st.update();
    this.stars = this.stars.filter(s => !s.dead);

    for (const f of this.fruits) f.update(height);
    this.fruits = this.fruits.filter(f => !f.dead);
  }

  draw(ctx, width, height, fingerScreenX, fingerScreenY) {
    this.update(width, height);

    if (this.bg) ctx.drawImage(this.bg, 0, 0);

    this.drawTrail(ctx);
    for (const p of this.pieces) p.draw(ctx);
    for (const s of this.sparks) s.draw(ctx);
    for (const st of this.stars) st.draw(ctx);
    for (const f of this.fruits) f.draw(ctx);

    this.handleFingerSwipe(fingerScreenX, fingerScreenY);
    this.drawFingerDot(ctx, fingerScreenX, fingerScreenY);
  }
}
