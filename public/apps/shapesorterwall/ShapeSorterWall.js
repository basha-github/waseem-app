/* =========================================================
   SHAPE SORTER WALL 🔺 — drag shapes (point-drag) into
   matching cutouts, like a wooden shape-sorter toy.

   p5.js, GLOBAL MODE for rendering. Hand tracking is provided
   by js/tracking-bridge.js (MediaPipe-based, same engine used by
   the touch-wall's other apps) via window.__sorterTracking; this
   file only owns the game logic. Pick-up / drag / drop mechanics
   follow the same pattern as WordBuilder.js.

   INTERACTION MODEL
   Shape cutouts sit in a board at the top; colorful shape
   pieces drift in a tray below. Point at a piece and hold
   still to pick it up — it then follows your fingertip 1:1
   until you carry it up to the board. Drop it there:
     • matching cutout → it snaps in with a chime, the shape
       name is spoken
     • wrong cutout     → bounces back to the tray with a
       soft buzz — no penalty, try again
   Fill every cutout and the board celebrates, then a new
   set of shapes loads.
   ========================================================= */

// ---------- CANVAS ----------
function _canvasW() { return windowWidth; }
function _canvasH() { return windowHeight; }

// ── Finger position in canvas coords (-1 = not currently pointing at canvas) ─
let fingerScreenX = -1;
let fingerScreenY = -1;
let _fingerLostAt = 0;
const FINGER_DROP_GRACE_MS = 500;

const PICK_DWELL_MS = 450;
const PICK_JITTER_GRACE_MS = 200;

// ---------- SHAPE BANK ----------
const SHAPE_DEFS = [
  { id: 'circle',   name: 'circle',   color: [231, 76, 60] },
  { id: 'square',   name: 'square',   color: [52, 120, 246] },
  { id: 'triangle', name: 'triangle', color: [240, 180, 20] },
  { id: 'star',     name: 'star',     color: [150, 85, 180] },
  { id: 'heart',    name: 'heart',    color: [255, 105, 175] },
  { id: 'diamond',  name: 'diamond',  color: [40, 190, 190] },
  { id: 'pentagon', name: 'pentagon', color: [250, 140, 35] },
  { id: 'hexagon',  name: 'hexagon',  color: [70, 180, 95] },
];
const SHAPES_PER_ROUND = 5;

// ---------- GAME STATE ----------
let roundShapes = [];   // SHAPE_DEFS subset for this round
let cutouts     = [];   // [{ shape, x, y, size, filled }]
let pieces      = [];   // draggable tray pieces
let heldPieceId = null;
let nextPieceId = 1;
let score       = 0;
let roundReady  = true;
let successAt   = 0;
let shakeAmount = 0;
let confetti    = [];
let lastSetIds  = '';

// Layout (recomputed on resize)
let BOARD_Y, TRAY_TOP, TRAY_BOTTOM;

function setup() {
  createCanvas(_canvasW(), _canvasH());
  textFont('Baloo 2, Quicksand, sans-serif');
  computeLayout();
  newRound();
}

function windowResized() {
  resizeCanvas(_canvasW(), _canvasH());
  computeLayout();
  layoutBoard();
  clampTraysToBounds();
}

function computeLayout() {
  BOARD_Y     = height * 0.22;
  TRAY_TOP    = height * 0.40;
  TRAY_BOTTOM = height * 0.94;
}

// =========================================================
// MAIN DRAW LOOP
// =========================================================
function draw() {
  drawBackground();
  updateFingerScreenPos();

  drawBoard();
  updateAndDrawPieces();
  updateAndDrawConfetti();
  drawScore();

  handleDragAndDrop();
  drawFingerDot();

  if (!roundReady && millis() > successAt) {
    roundReady = true;
    newRound();
  }
}

// ── Map fingertip (camera space) → canvas coords using the saved homography ──
function updateFingerScreenPos() {
  const bridge = window.__sorterTracking;
  if (!bridge || !bridge.ready || !bridge.hand) {
    if (fingerScreenX >= 0 && _fingerLostAt === 0) _fingerLostAt = millis();
    if (heldPieceId !== null && millis() - _fingerLostAt > FINGER_DROP_GRACE_MS) {
      releaseHeldPiece();
    }
    if (millis() - _fingerLostAt > 120) { fingerScreenX = -1; fingerScreenY = -1; }
    return;
  }

  bridge.hand.update();
  const hand = bridge.hand;
  const fingerOK = hand.finger_x >= 0 && hand.finger_conf > 0.01;
  if (!fingerOK) {
    if (fingerScreenX >= 0 && _fingerLostAt === 0) _fingerLostAt = millis();
    if (heldPieceId !== null && millis() - _fingerLostAt > FINGER_DROP_GRACE_MS) {
      releaseHeldPiece();
    }
    if (millis() - _fingerLostAt > 120) { fingerScreenX = -1; fingerScreenY = -1; }
    return;
  }
  _fingerLostAt = 0;

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
function newRound() {
  let picked;
  do {
    picked = shuffleArray(SHAPE_DEFS).slice(0, SHAPES_PER_ROUND);
  } while (SHAPE_DEFS.length > SHAPES_PER_ROUND && idsKey(picked) === lastSetIds);
  roundShapes = picked;
  lastSetIds = idsKey(picked);

  cutouts = roundShapes.map((s) => ({ shape: s, filled: false, x: 0, y: 0, size: 0 }));
  layoutBoard();

  _roundTrayPositions = scatterTrayPositions(SHAPES_PER_ROUND);
  pieces = shuffleArray(roundShapes).map((s, i) => makePiece(s, i));
  heldPieceId = null;
  shakeAmount = 0;
  roundReady = true;

  setTimeout(() => speak('Sort the shapes!'), 500);
}

function idsKey(list) { return list.map((s) => s.id).sort().join(','); }

function layoutBoard() {
  const n = cutouts.length;
  const size = min(120, width / (n + 2));
  const gap = size * 0.35;
  const totalW = n * size + (n - 1) * gap;
  const startX = width / 2 - totalW / 2;
  cutouts.forEach((c, i) => {
    c.x = startX + i * (size + gap) + size / 2;
    c.y = BOARD_Y;
    c.size = size;
  });
}

// Pre-compute well-spaced tray positions for a fresh round (rejection
// sampling against each OTHER new position — not the stale `pieces`
// array, which at this point still holds last round's already-placed
// pieces and would silently skip every collision check).
function scatterTrayPositions(n) {
  const pts = [];
  const minDist = 120;
  let attempts = 0;
  while (pts.length < n && attempts < n * 80) {
    attempts++;
    const x = random(70, max(71, width - 70));
    const y = random(TRAY_TOP + 50, TRAY_BOTTOM - 50);
    if (pts.every((p) => dist(p.x, p.y, x, y) > minDist)) pts.push({ x, y });
  }
  while (pts.length < n) {
    pts.push({ x: random(70, max(71, width - 70)), y: random(TRAY_TOP + 50, TRAY_BOTTOM - 50) });
  }
  return pts;
}

let _roundTrayPositions = [];

function makePiece(shapeDef, indexInRound) {
  const pos = _roundTrayPositions[indexInRound] || { x: width / 2, y: (TRAY_TOP + TRAY_BOTTOM) / 2 };
  const p = {
    id: nextPieceId++,
    shape: shapeDef,
    held: false,
    placed: false,
    r: 44,
    phase: random(TWO_PI),
    bobSpeed: random(0.9, 1.4),
    homeX: pos.x,
    homeY: pos.y,
  };
  p.x = p.homeX;
  p.y = p.homeY;
  return p;
}

function randomizeTrayHome(p) {
  const pad = 70;
  let tries = 0;
  let x, y;
  do {
    x = random(pad, max(pad + 1, width - pad));
    y = random(TRAY_TOP + pad * 0.6, TRAY_BOTTOM - pad * 0.6);
    tries++;
  } while (tries < 40 && pieces.some((q) => q !== p && !q.placed && dist(x, y, q.homeX || x, q.homeY || y) < 110));
  p.homeX = x;
  p.homeY = y;
}

function clampTraysToBounds() {
  for (const p of pieces) {
    if (p.placed) continue;
    if (!p.held) randomizeTrayHome(p);
    p.x = constrain(p.x, 50, width - 50);
    p.y = constrain(p.y, TRAY_TOP + 30, TRAY_BOTTOM - 30);
  }
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = floor(random(i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// =========================================================
// DRAG + DROP  (fingertip-driven, mouse as fallback)
// =========================================================
function handleDragAndDrop() {
  if (!roundReady || fingerScreenX < 0) return;

  if (heldPieceId === null) {
    tryPickUpPiece(fingerScreenX, fingerScreenY);
  } else {
    const p = pieces.find((pp) => pp.id === heldPieceId);
    if (!p) { heldPieceId = null; return; }
    if (fingerScreenX >= 0) {
      p.x = fingerScreenX;
      p.y = fingerScreenY;
      if (fingerScreenY < BOARD_Y + 90) tryDropPiece(p);
    }
  }
}

function tryPickUpPiece(px, py) {
  for (const p of pieces) {
    if (p.placed || p.held) continue;
    if (!p._dwell) p._dwell = { armed: true, holdStart: null, lastInside: -Infinity };
    if (_checkDwell(p.x, p.y, p.r * 1.15, p._dwell, px, py)) {
      p.held = true;
      heldPieceId = p.id;
      speak(p.shape.name);
      return;
    }
  }
}

function tryDropPiece(p) {
  let nearest = cutouts[0];
  let bestD = Infinity;
  for (const c of cutouts) {
    const d = abs(c.x - p.x);
    if (d < bestD) { bestD = d; nearest = c; }
  }

  if (!nearest.filled && nearest.shape.id === p.shape.id) {
    nearest.filled = true;
    p.placed = true;
    p.held = false;
    heldPieceId = null;
    playSuccessChime();
    speak(p.shape.name);

    if (cutouts.every((c) => c.filled)) onBoardComplete();
  } else {
    shakeAmount = 10;
    playWrongBuzz();
    p.held = false;
    heldPieceId = null;
    randomizeTrayHome(p);
  }
}

function releaseHeldPiece() {
  const p = pieces.find((pp) => pp.id === heldPieceId);
  if (p) {
    p.held = false;
    randomizeTrayHome(p);
  }
  heldPieceId = null;
}

function onBoardComplete() {
  score++;
  roundReady = false;
  successAt = millis() + 2600;
  playFanfare();
  speak('You sorted all the shapes!');
  spawnConfetti();
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
function playTone(freq, dur = 0.18, type = 'sine', gainVal = 0.18) {
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
function playSuccessChime() {
  playTone(660, 0.12);
  setTimeout(() => playTone(880, 0.16), 90);
}
function playWrongBuzz() {
  playTone(160, 0.22, 'sawtooth', 0.12);
}
function playFanfare() {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => playTone(f, 0.22), i * 110));
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.88;
  u.pitch = 1.1;
  window.speechSynthesis.speak(u);
}

// =========================================================
// SHAPE GLYPHS  (drawn centered at the current origin)
// =========================================================
function drawShapeGlyph(id, size) {
  switch (id) {
    case 'circle':
      circle(0, 0, size);
      break;
    case 'square':
      rectMode(CENTER);
      rect(0, 0, size * 0.86, size * 0.86, size * 0.12);
      rectMode(CORNER);
      break;
    case 'triangle': {
      const h = size * 0.52;
      triangle(0, -h, -h * 0.95, h * 0.7, h * 0.95, h * 0.7);
      break;
    }
    case 'star':
      drawPolyStar(size * 0.22, size * 0.5, 5);
      break;
    case 'heart':
      drawHeartGlyph(size * 0.46);
      break;
    case 'diamond':
      quad(0, -size * 0.52, size * 0.4, 0, 0, size * 0.52, -size * 0.4, 0);
      break;
    case 'pentagon':
      drawPolygon(size * 0.5, 5, -HALF_PI);
      break;
    case 'hexagon':
      drawPolygon(size * 0.5, 6, 0);
      break;
  }
}

function drawPolygon(r, n, rotOffset) {
  beginShape();
  for (let i = 0; i < n; i++) {
    const a = rotOffset + (i * TWO_PI) / n;
    vertex(cos(a) * r, sin(a) * r);
  }
  endShape(CLOSE);
}

function drawPolyStar(r1, r2, n) {
  beginShape();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? r2 : r1;
    const a = -HALF_PI + (i * PI) / n;
    vertex(cos(a) * r, sin(a) * r);
  }
  endShape(CLOSE);
}

function drawHeartGlyph(s) {
  beginShape();
  vertex(0, s * 0.4);
  bezierVertex(-s, -s * 0.35, -s * 0.5, -s * 0.95, 0, -s * 0.2);
  bezierVertex(s * 0.5, -s * 0.95, s, -s * 0.35, 0, s * 0.4);
  endShape(CLOSE);
}

// =========================================================
// DRAWING
// =========================================================
function drawBackground() {
  background(254, 248, 231);
  noStroke();
  fill(255, 244, 214);
  rect(0, 0, width, BOARD_Y + 90, 0, 0, 40, 40);
}

function drawBoard() {
  push();
  if (shakeAmount > 0) {
    translate(random(-shakeAmount, shakeAmount), 0);
    shakeAmount *= 0.85;
    if (shakeAmount < 0.5) shakeAmount = 0;
  }
  for (const c of cutouts) {
    push();
    translate(c.x, c.y);

    noStroke();
    fill(c.filled ? color(62, 207, 140, 40) : color(43, 43, 43, 16));
    rectMode(CENTER);
    rect(0, 0, c.size, c.size, 16);
    rectMode(CORNER);

    if (c.filled) {
      fill(c.shape.color[0], c.shape.color[1], c.shape.color[2]);
      stroke(255);
      strokeWeight(2);
    } else {
      fill(210, 202, 178);
      stroke(150, 140, 110);
      strokeWeight(2);
      drawingContext.setLineDash([6, 5]);
    }
    drawShapeGlyph(c.shape.id, c.size * 0.62);
    drawingContext.setLineDash([]);
    pop();
  }
  pop();
}

function updateAndDrawPieces() {
  for (const p of pieces) {
    if (p.placed) continue;

    if (!p.held) {
      p.x = p.homeX + sin(millis() * 0.001 * p.bobSpeed + p.phase) * 14;
      p.y = p.homeY + cos(millis() * 0.0013 * p.bobSpeed + p.phase) * 10;
    }

    push();
    translate(p.x, p.y);
    if (p.held) {
      noStroke();
      fill(255, 255, 255, 60);
      circle(0, 0, p.r * 2.6);
    }
    const c = p.shape.color;
    noStroke();
    fill(c[0], c[1], c[2]);
    drawShapeGlyph(p.shape.id, p.r * 1.6);
    pop();
  }
}

function drawScore() {
  noStroke();
  fill(90, 78, 60);
  textAlign(LEFT, TOP);
  textSize(18);
  text('Boards sorted: ' + score, 20, 16);
}

function drawFingerDot() {
  if (fingerScreenX < 0) return;
  noStroke();
  const heldColor = heldPieceId !== null ? color(255, 180, 60) : color(255, 105, 180);
  fill(red(heldColor), green(heldColor), blue(heldColor), 90);
  ellipse(fingerScreenX, fingerScreenY, 80, 80);
  fill(heldColor);
  ellipse(fingerScreenX, fingerScreenY, 40, 40);
  fill(255);
  ellipse(fingerScreenX, fingerScreenY, 10, 10);
}

// ── Confetti burst on a completed board ──
function spawnConfetti() {
  confetti = [];
  const colors = [[231, 76, 60], [52, 120, 246], [255, 200, 25], [70, 180, 95], [150, 85, 180], [255, 105, 175]];
  for (let i = 0; i < 90; i++) {
    confetti.push({
      x: width / 2 + random(-40, 40),
      y: BOARD_Y,
      vx: random(-3.5, 3.5),
      vy: random(-6, -2),
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
    p.vy += 0.18;
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
  if (!roundReady || heldPieceId !== null) return;

  for (const p of pieces) {
    if (p.placed || p.held) continue;
    if (dist(mouseX, mouseY, p.x, p.y) < p.r * 1.15) {
      p.held = true;
      heldPieceId = p.id;
      speak(p.shape.name);
      return;
    }
  }
}

function mouseDragged() {
  if (heldPieceId === null) return;
  const p = pieces.find((pp) => pp.id === heldPieceId);
  if (p) { p.x = mouseX; p.y = mouseY; }
}

function mouseReleased() {
  if (heldPieceId === null) return;
  const p = pieces.find((pp) => pp.id === heldPieceId);
  if (p && mouseY < BOARD_Y + 90) tryDropPiece(p);
  else releaseHeldPiece();
}
