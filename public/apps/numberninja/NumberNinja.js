/* =========================================================
   NUMBER NINJA 🔢 — like Fruit Slash, but slice only the
   numbers that match a rule (even, greater than 5, etc.).

   p5.js, GLOBAL MODE for rendering. Hand tracking is provided
   by js/tracking-bridge.js (MediaPipe-based, same engine used by
   the touch-wall's other apps, e.g. Counting Orchard) via
   window.__ninjaTracking; this file only owns the game logic and
   reads the fingertip position off that bridge each frame. The
   falling-fruit physics and fingertip swipe/trail slicing follow
   the same pattern as the original FruitNinja app in this project.

   INTERACTION MODEL
   A rule banner up top calls out the target ("Slice the EVEN
   numbers!"). Numbered orbs fall from the top of the screen;
   swipe your fingertip through one to slice it:
     • matches the rule → gold burst, a satisfying slice
       sound, the number is spoken, score goes up
     • doesn't match    → red burst, a soft buzz instead —
       no penalty, just doesn't score, keep going
   After a handful of correct slices the rule rotates to a
   new one, announced the same way.
   ========================================================= */

// ---------- CANVAS ----------
function _canvasW() { return windowWidth; }
function _canvasH() { return windowHeight; }

// ── Finger position in canvas coords (-1 = not currently pointing at canvas) ─
let fingerScreenX = -1;
let fingerScreenY = -1;
let prevFX = 0, prevFY = 0;
let fingerHasPos = false;
let trail = [];

// ---------- RULES ----------
const NUMBER_POOL = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const RULES = [
  { id: 'even',  test: (n) => n % 2 === 0, prompt: 'Slice the EVEN numbers!',           speak: 'Slice the even numbers!' },
  { id: 'odd',   test: (n) => n % 2 === 1, prompt: 'Slice the ODD numbers!',            speak: 'Slice the odd numbers!' },
  { id: 'gt5',   test: (n) => n > 5,       prompt: 'Slice numbers GREATER than 5!',     speak: 'Slice numbers greater than five!' },
  { id: 'lt5',   test: (n) => n < 5,       prompt: 'Slice numbers LESS than 5!',        speak: 'Slice numbers less than five!' },
  { id: 'mult3', test: (n) => n % 3 === 0, prompt: 'Slice MULTIPLES of 3!',             speak: 'Slice multiples of three!' },
];
const RULE_SWITCH_AT = 8; // correct slices before the rule rotates

const GRAVITY = 0.05;
const SPAWN_RATE_FRAMES = 62;

// ---------- GAME STATE ----------
let orbs        = [];
let particles    = [];
let score        = 0;
let ruleIndex    = 0;
let ruleHits     = 0;
let spawnTimer   = 0;
let bannerFlash  = 0;   // frames remaining for the "rule changed" pulse

function currentRule() { return RULES[ruleIndex]; }

function setup() {
  createCanvas(_canvasW(), _canvasH());
  textFont('Baloo 2, Quicksand, sans-serif');
  announceRule(700);
}

function windowResized() {
  resizeCanvas(_canvasW(), _canvasH());
}

// =========================================================
// MAIN DRAW LOOP
// =========================================================
function draw() {
  drawSky();
  updateFingerScreenPos();

  spawnTimer++;
  if (spawnTimer >= SPAWN_RATE_FRAMES) {
    spawnTimer = 0;
    orbs.push(makeOrb());
  }

  drawTrail();

  for (const o of orbs) updateOrb(o);
  orbs = orbs.filter((o) => !o.dead);
  for (const o of orbs) drawOrb(o);

  updateAndDrawParticles();
  drawBanner();
  drawScore();

  handleFingerSwipe();
  drawFingerDot();
}

// ── Map fingertip (camera space) → canvas coords using the saved homography ──
function updateFingerScreenPos() {
  const bridge = window.__ninjaTracking;
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

// =========================================================
// ORBS  (falling numbers — same physics shape as FruitNinja's Fruit)
// =========================================================
function makeOrb() {
  const value = random(NUMBER_POOL);
  const r = random(46, 58);
  return {
    value,
    r,
    x: random(r + 40, max(r + 41, width - r - 40)),
    y: -r - 20,
    vx: random(-0.4, 0.4),
    vy: random(1.1, 2.0),
    angle: random(TWO_PI),
    spin: random(-0.02, 0.02),
    wobble: random(TWO_PI),
    hue: floor(random(6)),
    dead: false,
    sliced: false,
  };
}

function updateOrb(o) {
  if (o.sliced) return;
  o.vy += GRAVITY;
  o.x += o.vx;
  o.y += o.vy;
  o.angle += o.spin;
  o.wobble += 0.07;
  if (o.y > height + 100) o.dead = true;
}

const ORB_PALETTE = [
  [255, 138, 61], [61, 168, 255], [255, 92, 141],
  [122, 214, 108], [186, 120, 255], [255, 205, 60],
];

function drawOrb(o) {
  if (o.sliced) return;
  const wob = 1 + sin(o.wobble) * 0.04;
  push();
  translate(o.x, o.y);
  rotate(o.angle);
  scale(wob, 1 / wob);
  const c = ORB_PALETTE[o.hue];
  noStroke();
  fill(c[0], c[1], c[2]);
  circle(0, 0, o.r * 2);
  fill(255, 255, 255, 70);
  circle(-o.r * 0.3, -o.r * 0.3, o.r * 0.7);
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(o.r * 1.1);
  textStyle(BOLD);
  text(o.value, 0, 2);
  textStyle(NORMAL);
  pop();
}

// =========================================================
// SLICING  (fingertip trail, mouse drag as fallback)
// =========================================================
function lineHitsCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1, fx = x1 - cx, fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (!a) return false;
  const b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
  let d = b * b - 4 * a * c;
  if (d < 0) return false;
  d = sqrt(d);
  const t1 = (-b - d) / (2 * a), t2 = (-b + d) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

function handleFingerSwipe() {
  if (fingerScreenX < 0) { fingerHasPos = false; return; }

  if (!fingerHasPos) {
    prevFX = fingerScreenX; prevFY = fingerScreenY;
    fingerHasPos = true;
    return;
  }

  trail.push({ x: fingerScreenX, y: fingerScreenY });
  if (trail.length > 18) trail.shift();

  const moved = dist(prevFX, prevFY, fingerScreenX, fingerScreenY);
  if (moved > 2) {
    for (const o of orbs) {
      if (!o.dead && !o.sliced) {
        if (lineHitsCircle(prevFX, prevFY, fingerScreenX, fingerScreenY, o.x, o.y, o.r * 1.5)) sliceOrb(o);
      }
    }
  }
  prevFX = fingerScreenX; prevFY = fingerScreenY;
}

function sliceOrb(o) {
  o.sliced = true;
  o.dead = true;
  const correct = currentRule().test(o.value);

  if (correct) {
    score++;
    ruleHits++;
    playSliceSound();
    speak(String(o.value));
    spawnBurst(o.x, o.y, [255, 210, 70], [122, 214, 108]);
    if (ruleHits >= RULE_SWITCH_AT) {
      ruleHits = 0;
      ruleIndex = (ruleIndex + 1 + floor(random(RULES.length - 1))) % RULES.length;
      announceRule(400);
    }
  } else {
    playWrongBuzz();
    speak(String(o.value));
    spawnBurst(o.x, o.y, [235, 90, 90], [200, 60, 60]);
  }
}

function announceRule(delayMs) {
  bannerFlash = 40;
  setTimeout(() => speak(currentRule().speak), delayMs);
}

// =========================================================
// AUDIO  (native WebAudio + browser speech synthesis)
// =========================================================
let _audioCtx = null;
function _ensureAudio() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}
function playTone(freq, dur = 0.16, type = 'sine', gainVal = 0.18) {
  try {
    const ctx = _ensureAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch (e) { /* audio not available yet — ignore */ }
}
function playWrongBuzz() {
  playTone(150, 0.2, 'sawtooth', 0.12);
}
function playSliceSound() {
  try {
    const ctx = _ensureAudio();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -6;
    compressor.knee.value = 3;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.001;
    compressor.release.value = 0.1;
    compressor.connect(ctx.destination);

    const bufSize = ctx.sampleRate * 0.12;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3200, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.12);
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    src.connect(filter); filter.connect(gain); gain.connect(compressor);
    src.start(); src.stop(ctx.currentTime + 0.15);
  } catch (e) { /* audio not available yet — ignore */ }
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  u.pitch = 1.05;
  window.speechSynthesis.speak(u);
}

// =========================================================
// DRAWING
// =========================================================
let _stars = null;
function drawSky() {
  background(20, 16, 46);
  if (!_stars) {
    _stars = [];
    for (let i = 0; i < 60; i++) _stars.push({ x: random(width), y: random(height * 0.85), s: random(1, 3) });
  }
  noStroke();
  for (const s of _stars) {
    fill(255, 255, 255, 60 + sin(millis() * 0.001 + s.x) * 40);
    circle(s.x, s.y, s.s);
  }
}

function drawTrail() {
  if (trail.length < 2) return;
  noFill();
  for (let i = 1; i < trail.length; i++) {
    const t = i / trail.length;
    stroke(255, 240, 80, t * 90);
    strokeWeight(t * 20);
    line(trail[i - 1].x, trail[i - 1].y, trail[i].x, trail[i].y);
    stroke(255, 255, 255, t * 240);
    strokeWeight(t * 4);
    line(trail[i - 1].x, trail[i - 1].y, trail[i].x, trail[i].y);
  }
  noStroke();
}

function drawBanner() {
  const pulseScale = bannerFlash > 0 ? map(bannerFlash, 40, 0, 1.12, 1) : 1;
  if (bannerFlash > 0) bannerFlash--;

  push();
  translate(width / 2, 50);
  scale(pulseScale);
  noStroke();
  fill(255, 255, 255, 235);
  const w = min(520, width * 0.6);
  rectMode(CENTER);
  rect(0, 0, w, 62, 22);
  rectMode(CORNER);
  fill(40, 30, 70);
  textAlign(CENTER, CENTER);
  textSize(22);
  text('\u2702\uFE0F ' + currentRule().prompt, 0, 0);
  pop();

  // progress toward the next rule switch
  const barW = 160;
  const barX = width / 2 - barW / 2;
  const barY = 90;
  noStroke();
  fill(255, 255, 255, 60);
  rect(barX, barY, barW, 8, 4);
  fill(255, 210, 70);
  rect(barX, barY, barW * (ruleHits / RULE_SWITCH_AT), 8, 4);
}

function drawScore() {
  noStroke();
  fill(255, 255, 255, 230);
  textAlign(LEFT, TOP);
  textSize(18);
  text('Score: ' + score, 20, 16);
}

function drawFingerDot() {
  if (fingerScreenX < 0) return;
  noStroke();
  fill(255, 105, 180, 90);
  ellipse(fingerScreenX, fingerScreenY, 80, 80);
  fill(255, 105, 180, 255);
  ellipse(fingerScreenX, fingerScreenY, 40, 40);
  fill(255);
  ellipse(fingerScreenX, fingerScreenY, 10, 10);
}

// ── Particle burst on every slice, colored by correct/incorrect ──
function spawnBurst(x, y, colorA, colorB) {
  for (let i = 0; i < 22; i++) {
    const a = random(TWO_PI);
    const speed = random(2, 6);
    particles.push({
      x, y,
      vx: cos(a) * speed,
      vy: sin(a) * speed,
      c: random([colorA, colorB]),
      life: 26,
      s: random(4, 8),
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
    circle(p.x, p.y, p.s);
  }
}

// =========================================================
// MOUSE FALLBACK  (useful for testing without a webcam)
// =========================================================
let prevMX = 0, prevMY = 0;
function mousePressed() {
  prevMX = mouseX; prevMY = mouseY;
}
function mouseDragged() {
  const speed = dist(prevMX, prevMY, mouseX, mouseY);
  if (speed > 20) {
    for (const o of orbs) {
      if (!o.dead && !o.sliced) {
        if (lineHitsCircle(prevMX, prevMY, mouseX, mouseY, o.x, o.y, o.r * 1.5)) sliceOrb(o);
      }
    }
  }
  prevMX = mouseX; prevMY = mouseY;
}
function mouseClicked() {
  for (const o of orbs) {
    if (!o.dead && !o.sliced && dist(mouseX, mouseY, o.x, o.y) < o.r * 1.5) sliceOrb(o);
  }
}

function touchStarted() { return false; } // prevent page scroll on touch
