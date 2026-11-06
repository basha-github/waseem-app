/* =========================================================
   BUBBLE POP STORM \u{1F32A}\uFE0F — bubbles rise fast, pop
   with either hand. A pure sensory/reflex romp, and the best
   use in this project of the two-hand tracking (fingers[])
   originally added for MyPiano.

   p5.js, GLOBAL MODE for rendering. Hand tracking is provided
   by js/tracking-bridge.js (MediaPipe-based, same engine used by
   the touch-wall's other apps) via window.__bubbleTracking; this
   file only owns the game logic and reads both hands' fingertip
   positions off that bridge each frame.

   INTERACTION MODEL
   No dwell, no "hold still" — this one is instant. Bubbles
   stream up fast; touch one with either hand's fingertip and
   it pops immediately with a burst and a satisfying pop tone.
   Both hands work independently and simultaneously, so two
   hands can genuinely clear more bubbles than one. Nothing to
   get "wrong" here — it's free play, with a light streak
   counter just for fun.
   ========================================================= */

// ---------- CANVAS ----------
function _canvasW() { return windowWidth; }
function _canvasH() { return windowHeight; }

// ── Both hands' fingertip positions in canvas coords (screen space) ──
let handScreens = []; // [{x,y}, ...] — 0, 1, or 2 entries this frame

// ---------- BUBBLES ----------
let bubbles = [];
let particles = [];
let score = 0;
let streak = 0;
let lastPopAt = -9999;
const STREAK_TIMEOUT_MS = 1400;

let spawnTimer = 0;
const BASE_SPAWN_FRAMES = 26;

const BUBBLE_HUES = [
  [255, 99, 132], [99, 179, 255], [255, 206, 84],
  [110, 222, 150], [186, 120, 255], [255, 150, 90],
  [110, 235, 235],
];

let lightningAt = -9999;

function setup() {
  createCanvas(_canvasW(), _canvasH());
  textFont('Baloo 2, Quicksand, sans-serif');
  scheduleLightning();
}

function windowResized() {
  resizeCanvas(_canvasW(), _canvasH());
}

// =========================================================
// MAIN DRAW LOOP
// =========================================================
function draw() {
  drawStormSky();
  updateHandScreenPositions();

  spawnBubbles();
  updateAndDrawBubbles();
  updateAndDrawParticles();
  drawHud();

  handlePops();
  drawHandCursors();
}

// ── Map every detected hand (camera space) → canvas coords ──
function updateHandScreenPositions() {
  handScreens = [];
  const bridge = window.__bubbleTracking;
  if (!bridge || !bridge.ready || !bridge.hand) return;

  bridge.hand.update();
  for (const f of bridge.hand.fingers) {
    if (f.conf <= 0.01) continue;
    const n = bridge.applyHomography(bridge.calH, [f.x, f.y]);
    if (!n) continue;
    const mx = n[0] * width;
    const my = n[1] * height;
    const OFF = 40;
    if (mx < -OFF || my < -OFF || mx > width + OFF || my > height + OFF) continue;
    handScreens.push({ x: constrain(mx, 0, width), y: constrain(my, 0, height) });
  }
}

// =========================================================
// SPAWNING
// =========================================================
function spawnRateFrames() {
  return constrain(BASE_SPAWN_FRAMES - floor(score / 12), 9, BASE_SPAWN_FRAMES);
}

function spawnBubbles() {
  spawnTimer++;
  if (spawnTimer < spawnRateFrames()) return;
  spawnTimer = 0;

  const count = random() < 0.22 ? 2 : 1; // occasional double-spawn for chaos
  for (let i = 0; i < count; i++) makeBubble();
}

function makeBubble() {
  const r = random(26, 52);
  bubbles.push({
    x: random(r + 20, max(r + 21, width - r - 20)),
    y: height + r + random(0, 80),
    r,
    vy: random(3.2, 5.6) * (1 + min(0.5, score / 100)),
    swayAmp: random(10, 30),
    swaySpeed: random(0.02, 0.045),
    phase: random(TWO_PI),
    hue: random(BUBBLE_HUES),
    popped: false,
  });
}

// =========================================================
// POPPING  (instant on contact — either hand, no dwell)
// =========================================================
function handlePops() {
  if (handScreens.length === 0) return;
  for (const b of bubbles) {
    if (b.popped) continue;
    for (const h of handScreens) {
      if (dist(h.x, h.y, b.x, b.y) < b.r * 1.05) { popBubble(b); break; }
    }
  }
}

function popBubble(b) {
  b.popped = true;
  score++;
  const now = millis();
  streak = (now - lastPopAt < STREAK_TIMEOUT_MS) ? streak + 1 : 1;
  lastPopAt = now;
  playPop(b.r, streak);
  spawnBurst(b.x, b.y, b.hue);
}

function updateAndDrawBubbles() {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    if (b.popped) { bubbles.splice(i, 1); continue; }

    b.y -= b.vy;
    const dx = sin(millis() * b.swaySpeed + b.phase) * b.swayAmp * 0.02;
    b.x += dx;
    if (b.y < -b.r - 30) { bubbles.splice(i, 1); continue; }

    drawBubble(b);
  }
}

function drawBubble(b) {
  const c = b.hue;
  push();
  translate(b.x, b.y);
  noStroke();
  fill(c[0], c[1], c[2], 60);
  circle(0, 0, b.r * 2.15);
  noFill();
  stroke(c[0], c[1], c[2], 210);
  strokeWeight(2.5);
  circle(0, 0, b.r * 2);
  noStroke();
  fill(255, 255, 255, 150);
  ellipse(-b.r * 0.32, -b.r * 0.38, b.r * 0.55, b.r * 0.32);
  pop();
}

// =========================================================
// AUDIO  (native WebAudio — bright pop, pitch varies with streak)
// =========================================================
let _audioCtx = null;
function _ensureAudio() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}
function playPop(radius, streakLevel) {
  try {
    const ctx = _ensureAudio();
    const now = ctx.currentTime;
    const base = map(radius, 24, 54, 900, 500);
    const pitch = base + min(streakLevel, 10) * 22;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.7, now + 0.07);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  } catch (e) { /* audio not available yet — ignore */ }
}

// =========================================================
// DRAWING
// =========================================================
function drawStormSky() {
  const flash = millis() - lightningAt;
  const flashAmt = flash < 140 ? map(flash, 0, 140, 60, 0) : 0;
  background(23 + flashAmt, 20 + flashAmt, 46 + flashAmt);

  noStroke();
  for (let i = 0; i < 34; i++) {
    fill(255, 255, 255, 14 + (i % 5) * 6);
    circle((i * 163) % width, (i * 119) % height, 2 + (i % 3));
  }

  if (millis() > lightningAt + random(3500, 7000)) scheduleLightning();
}

function scheduleLightning() {
  lightningAt = millis() + random(2500, 6000);
}

function drawHud() {
  noStroke();
  fill(255, 255, 255, 230);
  textAlign(LEFT, TOP);
  textSize(20);
  text('\u{1FAE7} ' + score, 20, 16);

  if (streak >= 3 && millis() - lastPopAt < STREAK_TIMEOUT_MS) {
    fill(255, 210, 90, 230);
    textAlign(RIGHT, TOP);
    textSize(18);
    text(streak + '\u00D7 streak!', width - 20, 16);
  }
}

function drawHandCursors() {
  const cols = [[255, 110, 180], [110, 220, 255]];
  handScreens.forEach((h, i) => {
    const c = cols[i % cols.length];
    noStroke();
    fill(c[0], c[1], c[2], 80);
    ellipse(h.x, h.y, 70, 70);
    fill(c[0], c[1], c[2], 255);
    ellipse(h.x, h.y, 34, 34);
    fill(255);
    ellipse(h.x, h.y, 9, 9);
  });
}

// ── Sparkle burst on pop ──
function spawnBurst(x, y, col) {
  for (let i = 0; i < 18; i++) {
    const a = random(TWO_PI);
    const speed = random(1.5, 5);
    particles.push({
      x, y,
      vx: cos(a) * speed,
      vy: sin(a) * speed,
      c: col,
      life: 22,
    });
  }
}
function updateAndDrawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vy += 0.1;
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    noStroke();
    fill(p.c[0], p.c[1], p.c[2], (p.life / 22) * 255);
    circle(p.x, p.y, 6);
  }
}

// =========================================================
// MOUSE FALLBACK  (useful for testing without a webcam)
// =========================================================
function mousePressed() {}
function mouseDragged() {
  for (const b of bubbles) {
    if (!b.popped && dist(mouseX, mouseY, b.x, b.y) < b.r * 1.05) { popBubble(b); break; }
  }
}
