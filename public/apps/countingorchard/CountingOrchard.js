/* =========================================================
   COUNTING ORCHARD 🍎 — point to pick fruit off a tree one
   at a time; a big number counter updates live.

   p5.js, GLOBAL MODE for rendering. Hand tracking is provided
   by js/tracking-bridge.js (MediaPipe-based, same engine used by
   the touch-wall's other apps) via window.__orchardTracking; this
   file only owns the game logic and reads the fingertip position
   off that bridge each frame.

   INTERACTION MODEL
   A tree full of one kind of fruit waits to be picked. Point
   at a piece of fruit and hold still to pick it — it flies
   into the basket, the big counter ticks up, and the new
   number is spoken aloud. Once every piece is picked the
   total is read back ("You picked eight apples!"), a little
   confetti falls, and a new tree grows with a different
   fruit and a new count.
   ========================================================= */

// ---------- CANVAS ----------
function _canvasW() { return windowWidth; }
function _canvasH() { return windowHeight; }

// ── Finger position in canvas coords (-1 = not currently pointing at canvas) ─
let fingerScreenX = -1;
let fingerScreenY = -1;

// Point-and-hold dwell timing — same idea as ColorQuest's shape picking.
const PICK_DWELL_MS = 500;
const PICK_JITTER_GRACE_MS = 200;
const FLY_DURATION_MS = 550;

// ---------- FRUIT BANK ----------
const FRUITS = [
  { singular: 'apple',      plural: 'apples',      emoji: '🍎' },
  { singular: 'orange',     plural: 'oranges',     emoji: '🍊' },
  { singular: 'lemon',      plural: 'lemons',      emoji: '🍋' },
  { singular: 'peach',      plural: 'peaches',     emoji: '🍑' },
  { singular: 'pear',       plural: 'pears',       emoji: '🍐' },
  { singular: 'cherry',     plural: 'cherries',    emoji: '🍒' },
  { singular: 'banana',     plural: 'bananas',     emoji: '🍌' },
  { singular: 'strawberry', plural: 'strawberries', emoji: '🍓' },
];

// ---------- GAME STATE ----------
let currentFruit  = null;
let totalCount    = 0;
let pickedCount   = 0;
let fruits        = [];      // fruit hanging on the tree this round
let basketX, basketY;
let roundReady    = true;
let completeAt    = 0;
let confetti      = [];
let lastFruitName = null;
let bounceUntil   = 0;       // brief scale-pop on the counter after each pick

// Layout (recomputed on resize)
let CANOPY_X, CANOPY_Y, CANOPY_RX, CANOPY_RY, TRUNK_TOP, TRUNK_BOTTOM, GROUND_Y;

function setup() {
  createCanvas(_canvasW(), _canvasH());
  textFont('Baloo 2, Quicksand, sans-serif');
  computeLayout();
  newRound(600);
}

function windowResized() {
  resizeCanvas(_canvasW(), _canvasH());
  computeLayout();
  if (pickedCount === 0) layoutFruit();
}

function computeLayout() {
  CANOPY_X = width / 2;
  CANOPY_Y = height * 0.36;
  CANOPY_RX = min(340, width * 0.30);
  CANOPY_RY = height * 0.20;
  TRUNK_TOP = CANOPY_Y + CANOPY_RY * 0.55;
  TRUNK_BOTTOM = height * 0.78;
  GROUND_Y = height * 0.80;
  basketX = width / 2;
  basketY = height * 0.90;
}

// =========================================================
// MAIN DRAW LOOP
// =========================================================
function draw() {
  drawOrchardBackground();
  updateFingerScreenPos();

  drawTree();
  drawBasket();
  updateAndDrawFruit();
  updateAndDrawConfetti();
  drawCounter();

  handleSelection();
  drawFingerDot();

  if (!roundReady && millis() > completeAt) {
    roundReady = true;
    newRound(500);
  }
}

// ── Map fingertip (camera space) → canvas coords using the saved homography ──
function updateFingerScreenPos() {
  const bridge = window.__orchardTracking;
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
// ROUND SETUP
// =========================================================
function newRound(promptDelayMs) {
  const candidates = FRUITS.filter((f) => f.singular !== lastFruitName);
  currentFruit = random(candidates.length ? candidates : FRUITS);
  lastFruitName = currentFruit.singular;

  totalCount = floor(random(6, 11)); // 6..10 inclusive
  pickedCount = 0;
  roundReady = true;

  layoutFruit();

  setTimeout(() => {
    if (currentFruit) speak(`Let's count the ${currentFruit.plural}!`);
  }, promptDelayMs);
}

function layoutFruit() {
  const positions = scatterInCanopy(totalCount);
  fruits = positions.map((p) => ({
    x: p.x, y: p.y, r: min(46, CANOPY_RX * 0.16),
    picked: false,
    flyStart: 0,
    origX: p.x, origY: p.y,
    _dwell: { armed: true, holdStart: null, lastInside: -Infinity },
  }));
}

// Rejection-sample N points inside the canopy ellipse, spaced apart.
function scatterInCanopy(n) {
  const pts = [];
  const minDist = min(70, (CANOPY_RX * 1.6) / max(3, sqrt(n)));
  let attempts = 0;
  while (pts.length < n && attempts < n * 60) {
    attempts++;
    const a = random(TWO_PI);
    const rad = sqrt(random(0.15, 1));
    const x = CANOPY_X + cos(a) * CANOPY_RX * 0.82 * rad;
    const y = CANOPY_Y + sin(a) * CANOPY_RY * 0.82 * rad;
    if (pts.every((p) => dist(p.x, p.y, x, y) > minDist)) pts.push({ x, y });
  }
  while (pts.length < n) {
    pts.push({ x: CANOPY_X + random(-CANOPY_RX * 0.6, CANOPY_RX * 0.6), y: CANOPY_Y + random(-CANOPY_RY * 0.6, CANOPY_RY * 0.6) });
  }
  return pts;
}

// =========================================================
// SELECTION  (fingertip dwell, mouse click as fallback)
// =========================================================
function handleSelection() {
  if (!roundReady || fingerScreenX < 0) return;
  for (const f of fruits) {
    if (f.picked) continue;
    if (_checkDwell(f.x, f.y, f.r * 1.3, f._dwell, fingerScreenX, fingerScreenY)) {
      pickFruit(f);
      return;
    }
  }
}

function pickFruit(f) {
  f.picked = true;
  f.flyStart = millis();
  pickedCount++;
  bounceUntil = millis() + 260;
  playPickChime();
  speak(String(pickedCount));

  if (pickedCount >= totalCount) {
    roundReady = false;
    completeAt = millis() + 2800;
    spawnConfetti();
    setTimeout(() => {
      speak(`Great job! You picked ${totalCount} ${currentFruit.plural}!`);
    }, FLY_DURATION_MS + 300);
  }
}

// =========================================================
// DWELL HELPER  (same pattern as ColorQuest's _checkNavHold)
// =========================================================
function _checkDwell(cx, cy, radius, state, px, py) {
  const d = dist(px, py, cx, cy);
  const insideNow = d < radius;
  if (insideNow) state.lastInside = millis();
  const consideredInside = (millis() - state.lastInside) < PICK_JITTER_GRACE_MS;

  if (!consideredInside) {
    state.armed = true;
    state.holdStart = null;
    return false;
  }
  if (state.armed) {
    if (state.holdStart === null) state.holdStart = millis();
    if (millis() - state.holdStart >= PICK_DWELL_MS) {
      state.armed = false;
      state.holdStart = null;
      return true;
    }
  }
  return false;
}

// =========================================================
// AUDIO  (native WebAudio tones + browser speech synthesis)
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
function playPickChime() {
  playTone(520 + pickedCount * 18, 0.14);
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.9;
  u.pitch = 1.1;
  window.speechSynthesis.speak(u);
}

// =========================================================
// DRAWING
// =========================================================
function drawOrchardBackground() {
  background(224, 242, 227);
  noStroke();
  fill(196, 230, 150);
  rect(0, GROUND_Y, width, height - GROUND_Y);
  fill(255, 255, 255, 200);
  circle(width * 0.85, height * 0.12, 60);
  circle(width * 0.12, height * 0.10, 44);
}

function drawTree() {
  noStroke();
  fill(120, 78, 48);
  rectMode(CENTER);
  rect(CANOPY_X, (TRUNK_TOP + TRUNK_BOTTOM) / 2, min(60, CANOPY_RX * 0.22), TRUNK_BOTTOM - TRUNK_TOP, 10);
  rectMode(CORNER);

  fill(86, 168, 96);
  for (const c of canopyBlobs()) {
    ellipse(c.x, c.y, c.s, c.s * 0.85);
  }
  fill(104, 190, 112);
  ellipse(CANOPY_X, CANOPY_Y - CANOPY_RY * 0.15, CANOPY_RX * 1.5, CANOPY_RY * 1.5);
}

let _canopyBlobs = null;
let _canopyKey = '';
function canopyBlobs() {
  const key = `${CANOPY_X}-${CANOPY_Y}-${CANOPY_RX}`;
  if (_canopyBlobs && _canopyKey === key) return _canopyBlobs;
  _canopyKey = key;
  _canopyBlobs = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (TWO_PI / n) * i;
    _canopyBlobs.push({
      x: CANOPY_X + cos(a) * CANOPY_RX * 0.55,
      y: CANOPY_Y + sin(a) * CANOPY_RY * 0.55,
      s: CANOPY_RX * 0.62,
    });
  }
  return _canopyBlobs;
}

function drawBasket() {
  push();
  translate(basketX, basketY);
  noStroke();
  fill(180, 128, 74);
  arc(0, 0, 130, 90, 0, PI, CHORD);
  stroke(140, 96, 52);
  strokeWeight(3);
  for (let i = -1; i <= 1; i++) line(i * 40, 2, i * 40, 40);
  noFill();
  strokeWeight(4);
  stroke(150, 104, 58);
  arc(0, -6, 132, 40, PI, TWO_PI);
  pop();

  noStroke();
  fill(70, 90, 70);
  textAlign(CENTER, TOP);
  textSize(15);
  text('basket', basketX, basketY + 42);
}

function updateAndDrawFruit() {
  for (const f of fruits) {
    if (f.picked) {
      const t = constrain((millis() - f.flyStart) / FLY_DURATION_MS, 0, 1);
      if (t >= 1) continue; // fully in the basket — stop drawing
      const x = lerp(f.origX, basketX, t);
      const y = lerp(f.origY, basketY, t) - sin(t * PI) * 70;
      const s = lerp(1, 0.35, t);
      push();
      translate(x, y);
      scale(s);
      textAlign(CENTER, CENTER);
      textSize(f.r * 1.8);
      text(currentFruit.emoji, 0, 0);
      pop();
      continue;
    }

    const bob = sin(millis() * 0.0015 + f.x) * 3;
    push();
    translate(f.x, f.y + bob);
    textAlign(CENTER, CENTER);
    textSize(f.r * 1.8);
    text(currentFruit.emoji, 0, 0);
    pop();
  }
}

function drawCounter() {
  const popScale = millis() < bounceUntil ? map(bounceUntil - millis(), 0, 260, 1, 1.35) : 1;
  push();
  translate(width / 2, 60);
  noStroke();
  fill(255, 255, 255, 235);
  rectMode(CENTER);
  rect(0, 0, min(340, width * 0.4), 84, 26);
  rectMode(CORNER);

  fill(50, 46, 40);
  textAlign(CENTER, CENTER);
  textSize(20);
  text(currentFruit ? currentFruit.emoji + '  ' + capitalize(currentFruit.plural) : '', 0, -22);

  push();
  scale(popScale);
  fill(70, 150, 90);
  textSize(46);
  text(pickedCount + ' / ' + totalCount, 0, 14);
  pop();
  pop();
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
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

// ── Confetti burst when the tree is fully picked ──
function spawnConfetti() {
  confetti = [];
  const colors = [[231, 76, 60], [52, 120, 246], [255, 200, 25], [70, 180, 95], [150, 85, 180], [255, 105, 175]];
  for (let i = 0; i < 90; i++) {
    confetti.push({
      x: width / 2 + random(-60, 60),
      y: 60,
      vx: random(-3.5, 3.5),
      vy: random(-5, -1.5),
      c: random(colors),
      s: random(5, 10),
      rot: random(TWO_PI),
      vr: random(-0.2, 0.2),
    });
  }
}
function updateAndDrawConfetti() {
  for (let i = confetti.length - 1; i >= 0; i--) {
    const p = confetti[i];
    p.vy += 0.16;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    if (p.y > height + 20) { confetti.splice(i, 1); continue; }
    push();
    translate(p.x, p.y);
    rotate(p.rot);
    noStroke();
    fill(p.c[0], p.c[1], p.c[2]);
    rectMode(CENTER);
    rect(0, 0, p.s, p.s * 0.6);
    pop();
  }
}

// =========================================================
// MOUSE FALLBACK  (useful for testing without a webcam)
// =========================================================
function mousePressed() {
  if (!roundReady) return;
  for (const f of fruits) {
    if (f.picked) continue;
    if (dist(mouseX, mouseY, f.x, f.y) < f.r * 1.3) {
      pickFruit(f);
      return;
    }
  }
}
