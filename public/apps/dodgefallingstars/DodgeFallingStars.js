/* =========================================================
   DODGE THE FALLING STARS \u2B50 — move a hand-tracked
   shield left-right to block falling objects.

   p5.js, GLOBAL MODE for rendering. Hand tracking is provided
   by js/tracking-bridge.js (MediaPipe-based, same engine used by
   the touch-wall's other apps) via window.__dodgeTracking; this
   file only owns the game logic and reads the fingertip position
   off that bridge each frame.

   INTERACTION MODEL
   A glowing shield sits near the bottom of the screen and
   follows your fingertip's X position — move your hand left
   and right to slide it into position. Stars fall from the
   top; get the shield under one as it arrives and it's
   blocked (burst + chime + point). Miss one and it just
   keeps falling past, off the bottom of the screen — no
   penalty, no "game over," just keep blocking as many as
   you can.
   ========================================================= */

// ---------- CANVAS ----------
function _canvasW() { return windowWidth; }
function _canvasH() { return windowHeight; }

// ── Finger position in canvas coords (-1 = not currently pointing at canvas) ─
let fingerScreenX = -1;
let fingerScreenY = -1;

// ---------- SHIELD ----------
let shieldX;
let shieldY;
const SHIELD_W = 210;
const SHIELD_H = 26;
let shieldFlashAt = -9999;

// ---------- STARS ----------
let stars = [];
let particles = [];
let score = 0;
let streak = 0;
let lastBlockAt = -9999;
const STREAK_TIMEOUT_MS = 2200;

let spawnTimer = 0;
const BASE_SPAWN_FRAMES = 55;

const STAR_COLORS = [
  [255, 221, 87], [255, 150, 200], [140, 210, 255],
  [180, 255, 170], [255, 180, 110], [210, 160, 255],
];

function setup() {
  createCanvas(_canvasW(), _canvasH());
  textFont('Baloo 2, Quicksand, sans-serif');
  shieldX = width / 2;
  shieldY = height * 0.86;
}

function windowResized() {
  resizeCanvas(_canvasW(), _canvasH());
  shieldY = height * 0.86;
  shieldX = constrain(shieldX, SHIELD_W / 2, width - SHIELD_W / 2);
}

// =========================================================
// MAIN DRAW LOOP
// =========================================================
function draw() {
  drawNightSky();
  updateFingerScreenPos();
  updateShield();

  spawnStars();
  updateAndDrawStars();
  updateAndDrawParticles();
  drawShield();
  drawHud();
  drawFingerDot();
}

// ── Map fingertip (camera space) → canvas coords using the saved homography ──
function updateFingerScreenPos() {
  const bridge = window.__dodgeTracking;
  if (!bridge || !bridge.ready || !bridge.hand) { fingerScreenX = -1; fingerScreenY = -1; return; }

  bridge.hand.update();
  const hand = bridge.hand;
  const fingerOK = hand.finger_x >= 0 && hand.finger_conf > 0.01;
  if (!fingerOK) { fingerScreenX = -1; fingerScreenY = -1; return; }

  const n = bridge.applyHomography(bridge.calH, [hand.finger_x, hand.finger_y]);
  if (!n) { fingerScreenX = -1; fingerScreenY = -1; return; }
  const mx = n[0] * width;
  const my = n[1] * height;

  const OFF = 40;
  if (mx < -OFF || my < -OFF || mx > width + OFF || my > height + OFF) {
    fingerScreenX = -1; fingerScreenY = -1;
  } else {
    fingerScreenX = constrain(mx, 0, width);
    fingerScreenY = constrain(my, 0, height);
  }
}

function updateShield() {
  if (fingerScreenX >= 0) {
    const target = constrain(fingerScreenX, SHIELD_W / 2, width - SHIELD_W / 2);
    shieldX = lerp(shieldX, target, 0.28);
  }
}

// =========================================================
// SPAWNING
// =========================================================
function spawnRateFrames() {
  return constrain(BASE_SPAWN_FRAMES - floor(score / 6), 24, BASE_SPAWN_FRAMES);
}

function fallSpeedRange() {
  const boost = min(2.4, score / 25);
  return { min: 2.2 + boost, max: 3.8 + boost };
}

function spawnStars() {
  spawnTimer++;
  if (spawnTimer < spawnRateFrames()) return;
  spawnTimer = 0;
  makeStar();
}

function makeStar() {
  const r = random(22, 34);
  const speed = fallSpeedRange();
  stars.push({
    x: random(r + 10, max(r + 11, width - r - 10)),
    y: -r - 10,
    r,
    vy: random(speed.min, speed.max),
    rot: random(TWO_PI),
    spin: random(-0.04, 0.04),
    col: random(STAR_COLORS),
    resolved: false,
  });
}

// =========================================================
// UPDATE + COLLISION  (one-shot check the moment a star crosses the shield line)
// =========================================================
function updateAndDrawStars() {
  for (let i = stars.length - 1; i >= 0; i--) {
    const s = stars[i];
    s.y += s.vy;
    s.rot += s.spin;

    if (!s.resolved && s.y + s.r >= shieldY - SHIELD_H / 2) {
      s.resolved = true;
      const withinX = s.x > shieldX - SHIELD_W / 2 - s.r && s.x < shieldX + SHIELD_W / 2 + s.r;
      if (withinX) { blockStar(s); stars.splice(i, 1); continue; }
    }

    if (s.y - s.r > height + 20) { stars.splice(i, 1); continue; }
    drawStar(s);
  }
}

function blockStar(s) {
  score++;
  const now = millis();
  streak = (now - lastBlockAt < STREAK_TIMEOUT_MS) ? streak + 1 : 1;
  lastBlockAt = now;
  shieldFlashAt = now;
  playBlock(streak);
  spawnBurst(s.x, shieldY - SHIELD_H / 2 - 4, s.col);
}

function drawStar(s) {
  push();
  translate(s.x, s.y);
  rotate(s.rot);
  noStroke();
  fill(s.col[0], s.col[1], s.col[2], 55);
  circle(0, 0, s.r * 2.6);
  fill(s.col[0], s.col[1], s.col[2]);
  drawStarShape(s.r * 0.42, s.r);
  pop();
}

function drawStarShape(r1, r2) {
  beginShape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? r2 : r1;
    const a = -HALF_PI + (i * PI) / 5;
    vertex(cos(a) * r, sin(a) * r);
  }
  endShape(CLOSE);
}

// =========================================================
// AUDIO  (native WebAudio — soft shield "bloop")
// =========================================================
let _audioCtx = null;
function _ensureAudio() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}
function playBlock(streakLevel) {
  try {
    const ctx = _ensureAudio();
    const now = ctx.currentTime;
    const pitch = 340 + min(streakLevel, 12) * 26;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.5, now + 0.09);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  } catch (e) { /* audio not available yet — ignore */ }
}

// =========================================================
// DRAWING
// =========================================================
let _bgStars = null;
function drawNightSky() {
  background(12, 15, 43);
  if (!_bgStars) {
    _bgStars = [];
    for (let i = 0; i < 70; i++) _bgStars.push({ x: random(width), y: random(height), s: random(1, 2.6), phase: random(TWO_PI) });
  }
  noStroke();
  for (const b of _bgStars) {
    fill(255, 255, 255, 90 + sin(millis() * 0.0015 + b.phase) * 60);
    circle(b.x, b.y, b.s);
  }
}

function drawShield() {
  const flashT = constrain((millis() - shieldFlashAt) / 220, 0, 1);
  const glow = flashT < 1 ? (1 - flashT) : 0;

  push();
  translate(shieldX, shieldY);

  noStroke();
  fill(120, 200, 255, 50 + glow * 120);
  rectMode(CENTER);
  rect(0, 0, SHIELD_W + glow * 40, SHIELD_H + 26 + glow * 20, 20);

  fill(lerpColor(color(110, 190, 255), color(255, 255, 255), glow));
  rect(0, 0, SHIELD_W, SHIELD_H, 13);

  fill(255, 255, 255, 160);
  rect(0, -SHIELD_H * 0.22, SHIELD_W * 0.9, SHIELD_H * 0.28, 8);

  fill(30, 60, 100);
  circle(-SHIELD_W / 2 + 4, 0, 10);
  circle(SHIELD_W / 2 - 4, 0, 10);

  rectMode(CORNER);
  pop();
}

function drawHud() {
  noStroke();
  fill(255, 255, 255, 230);
  textAlign(LEFT, TOP);
  textSize(20);
  text('\u2B50 ' + score, 20, 16);

  if (streak >= 3 && millis() - lastBlockAt < STREAK_TIMEOUT_MS) {
    fill(255, 210, 90, 230);
    textAlign(RIGHT, TOP);
    textSize(18);
    text(streak + '\u00D7 streak!', width - 20, 16);
  }
}

function drawFingerDot() {
  if (fingerScreenX < 0) return;
  noStroke();
  fill(255, 105, 180, 90);
  ellipse(fingerScreenX, fingerScreenY, 60, 60);
  fill(255, 105, 180, 255);
  ellipse(fingerScreenX, fingerScreenY, 26, 26);
  fill(255);
  ellipse(fingerScreenX, fingerScreenY, 8, 8);
}

// ── Sparkle burst on a successful block ──
function spawnBurst(x, y, col) {
  for (let i = 0; i < 20; i++) {
    const a = random(PI, TWO_PI); // burst mostly upward/outward off the shield
    const speed = random(2, 5.5);
    particles.push({
      x, y,
      vx: cos(a) * speed,
      vy: sin(a) * speed,
      c: col,
      life: 26,
    });
  }
}
function updateAndDrawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vy += 0.12;
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    noStroke();
    fill(p.c[0], p.c[1], p.c[2], (p.life / 26) * 255);
    circle(p.x, p.y, 6);
  }
}

// =========================================================
// MOUSE FALLBACK  (useful for testing without a webcam)
// =========================================================
function mousePressed() {}
function mouseMoved() {
  shieldX = constrain(mouseX, SHIELD_W / 2, width - SHIELD_W / 2);
}
