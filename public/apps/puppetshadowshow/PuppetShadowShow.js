/* =========================================================
   PUPPET SHADOW SHOW \u{1F407} — hand position moves a
   shadow-puppet animal silhouette across a jungle/night
   backdrop.

   p5.js, GLOBAL MODE for rendering. Hand tracking is provided
   by js/tracking-bridge.js (MediaPipe-based, same engine used by
   the touch-wall's other apps) via window.__puppetTracking; this
   file only owns the game logic and reads the fingertip position
   off that bridge each frame.

   INTERACTION MODEL
   A glowing "paper screen" sits against a moonlit jungle
   night. Move your hand and the silhouette glides across the
   screen with it (smoothed, not jittery), gently scaling with
   height for a little depth illusion and facing the direction
   it's moving — the way a real shadow puppet would. A shelf
   of puppet choices sits below the stage; touch one (instant,
   no dwell) to switch which animal you're puppeteering. Each
   puppet has its own small idle animation (ears, wings, tail)
   so it feels alive even standing still. Pure imaginative
   play — no scoring, nothing to get wrong.
   ========================================================= */

// ---------- CANVAS ----------
function _canvasW() { return windowWidth; }
function _canvasH() { return windowHeight; }

// ── Finger position in canvas coords (-1 = not currently pointing at canvas) ─
let fingerScreenX = -1;
let fingerScreenY = -1;

// ---------- PUPPETS ----------
const PUPPETS = [
  { id: 'rabbit', name: 'Rabbit', draw: drawRabbitPuppet, chirp: [900, 1200] },
  { id: 'dog',    name: 'Dog',    draw: drawDogPuppet,    chirp: [260, 160] },
  { id: 'bird',   name: 'Bird',   draw: drawBirdPuppet,   chirp: [700, 1100, 1500] },
  { id: 'deer',   name: 'Deer',   draw: drawDeerPuppet,   chirp: [220, 260] },
  { id: 'butterfly', name: 'Butterfly', draw: drawButterflyPuppet, chirp: [1200, 1600, 2000] },
];

let selectedPuppet = 0;
let puppetX, puppetY;
let facingDir = 1;
let _lastPuppetX = null;

const SHELF_H = 100;
let stage = { x: 0, y: 0, w: 0, h: 0 };
let shelfSlots = [];

function setup() {
  createCanvas(_canvasW(), _canvasH());
  textFont('Baloo 2, Quicksand, sans-serif');
  layoutStage();
  puppetX = stage.x + stage.w / 2;
  puppetY = stage.y + stage.h / 2;
}

function windowResized() {
  resizeCanvas(_canvasW(), _canvasH());
  layoutStage();
  puppetX = constrain(puppetX, stage.x + 60, stage.x + stage.w - 60);
  puppetY = constrain(puppetY, stage.y + 60, stage.y + stage.h - 40);
}

function layoutStage() {
  stage = { x: width * 0.08, y: height * 0.08, w: width * 0.84, h: height - SHELF_H - height * 0.08 - 20 };

  const n = PUPPETS.length;
  const pad = width * 0.12;
  const usable = width - pad * 2;
  shelfSlots = [];
  for (let i = 0; i < n; i++) {
    shelfSlots.push({
      x: pad + (usable / n) * (i + 0.5),
      y: height - SHELF_H / 2,
      r: min(38, usable / n * 0.36),
    });
  }
}

// =========================================================
// MAIN DRAW LOOP
// =========================================================
function draw() {
  drawNightBackdrop();
  updateFingerScreenPos();
  updatePuppetPosition();

  drawStageScreen();
  drawPuppet();
  drawShelf();
  drawFingerDot();
}

// ── Map fingertip (camera space) → canvas coords using the saved homography ──
function updateFingerScreenPos() {
  const bridge = window.__puppetTracking;
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
// PUPPET MOVEMENT + SELECTION
// =========================================================
function updatePuppetPosition() {
  if (fingerScreenX < 0) return;

  if (fingerScreenY > height - SHELF_H) {
    trySelectPuppet(fingerScreenX, fingerScreenY);
    return;
  }

  const targetX = constrain(fingerScreenX, stage.x + 55, stage.x + stage.w - 55);
  const targetY = constrain(fingerScreenY, stage.y + 55, stage.y + stage.h - 30);
  puppetX = lerp(puppetX, targetX, 0.16);
  puppetY = lerp(puppetY, targetY, 0.16);

  if (_lastPuppetX !== null) {
    const dx = puppetX - _lastPuppetX;
    if (abs(dx) > 0.6) facingDir = dx > 0 ? 1 : -1;
  }
  _lastPuppetX = puppetX;
}

function trySelectPuppet(px, py) {
  for (let i = 0; i < shelfSlots.length; i++) {
    const s = shelfSlots[i];
    if (dist(px, py, s.x, s.y) < s.r * 1.35 && i !== selectedPuppet) {
      selectedPuppet = i;
      speak(PUPPETS[i].name);
      playChirp(PUPPETS[i].chirp);
      return;
    }
  }
}

// =========================================================
// AUDIO  (native WebAudio + speech synthesis for puppet names)
// =========================================================
let _audioCtx = null;
function _ensureAudio() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}
function playTone(freq, dur = 0.15, type = 'sine', gainVal = 0.16) {
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
function playChirp(freqs) {
  freqs.forEach((f, i) => setTimeout(() => playTone(f, 0.16, 'triangle', 0.14), i * 90));
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
// BACKDROP
// =========================================================
let _bgStars = null;
function drawNightBackdrop() {
  background(14, 18, 46);
  noStroke();
  fill(250, 245, 210);
  circle(width * 0.85, height * 0.16, min(90, width * 0.08));
  fill(250, 245, 210, 40);
  circle(width * 0.85, height * 0.16, min(90, width * 0.08) * 1.7);

  if (!_bgStars) {
    _bgStars = [];
    for (let i = 0; i < 50; i++) _bgStars.push({ x: random(width), y: random(height * 0.5), s: random(1, 2.4), phase: random(TWO_PI) });
  }
  for (const s of _bgStars) {
    fill(255, 255, 255, 70 + sin(millis() * 0.0012 + s.phase) * 50);
    circle(s.x, s.y, s.s);
  }

  fill(8, 22, 20);
  for (let i = 0; i < 7; i++) {
    const tx = width * (i / 6);
    const th = height * (0.16 + (i % 3) * 0.05);
    triangle(tx - th * 0.5, height, tx + th * 0.5, height, tx, height - th);
  }
}

function drawStageScreen() {
  noStroke();
  fill(255, 248, 222, 235);
  rect(stage.x, stage.y, stage.w, stage.h, 18);
  stroke(150, 110, 60); strokeWeight(6); noFill();
  rect(stage.x, stage.y, stage.w, stage.h, 18);
  noStroke();
}

// =========================================================
// PUPPET RENDERING
// =========================================================
function drawPuppet() {
  const depth = constrain(map(puppetY, stage.y, stage.y + stage.h, 0.8, 1.25), 0.8, 1.25);
  push();
  translate(puppetX, puppetY);
  scale(depth * facingDir, depth);
  fill(35, 28, 20);
  noStroke();
  PUPPETS[selectedPuppet].draw(millis() * 0.001);
  pop();
}

// ── Each puppet is drawn centered at the origin, facing right, roughly
//    within a 160x160 box, using the given time `t` (seconds) for idle motion. ──

function drawRabbitPuppet(t) {
  const earWiggle = sin(t * 2.4) * 0.12;
  ellipse(0, 25, 95, 70);                        // body
  circle(38, -5, 55);                            // head
  push();
  translate(50, -35); rotate(-0.35 + earWiggle);
  ellipse(0, -28, 16, 62);                        // ear 1
  pop();
  push();
  translate(30, -38); rotate(-0.1 - earWiggle);
  ellipse(0, -30, 16, 62);                        // ear 2
  pop();
  circle(-35, 30, 24);                            // tail
}

function drawDogPuppet(t) {
  const tailWag = sin(t * 5) * 0.5;
  ellipse(0, 20, 100, 55);                        // body
  circle(48, -8, 46);                             // head
  push(); translate(64, -14); rotate(0.5); ellipse(0, 10, 20, 34); pop(); // ear
  triangle(66, 4, 92, 0, 68, 18);                 // snout
  push();
  translate(-45, 22); rotate(-0.6 + tailWag);
  ellipse(0, -18, 14, 40);                        // wagging tail
  pop();
}

function drawBirdPuppet(t) {
  const wing = sin(t * 6) * 0.55;
  ellipse(0, 10, 80, 46);                         // body
  circle(40, -14, 34);                            // head
  triangle(58, -16, 82, -10, 58, -6);             // beak
  push();
  translate(-6, 6); rotate(-0.2 + wing);
  ellipse(-8, 0, 70, 26);                         // wing
  pop();
  triangle(-40, 18, -62, 6, -58, 26);             // tail feathers
}

function drawDeerPuppet(t) {
  const bob = sin(t * 1.6) * 4;
  ellipse(0, 30, 92, 50);                         // body
  push();
  translate(46, -10 + bob); rotate(0.15);
  ellipse(0, 0, 40, 34);                          // head
  // antlers
  stroke(35, 28, 20); strokeWeight(5); noFill();
  line(10, -16, 4, -46); line(4, -46, -10, -58); line(4, -46, 16, -54);
  line(20, -18, 26, -48); line(26, -48, 14, -60); line(26, -48, 38, -54);
  noStroke(); fill(35, 28, 20);
  pop();
  rect(-30, 44, 10, 26, 4); rect(-4, 46, 10, 28, 4); rect(20, 46, 10, 28, 4); // legs
}

function drawButterflyPuppet(t) {
  const flap = 0.55 + sin(t * 7) * 0.35;
  push(); scale(flap, 1);
  ellipse(-30, -22, 70, 52);                      // upper-left wing
  ellipse(-24, 24, 56, 44);                       // lower-left wing
  pop();
  push(); scale(flap, 1);
  ellipse(30, -22, 70, 52);                       // upper-right wing
  ellipse(24, 24, 56, 44);                        // lower-right wing
  pop();
  rectMode(CENTER);
  rect(0, 0, 8, 60, 4);                           // body
  rectMode(CORNER);
  stroke(35, 28, 20); strokeWeight(3); noFill();
  line(0, -30, -14, -46); line(0, -30, 14, -46);
  noStroke(); fill(35, 28, 20);
}

// =========================================================
// SHELF UI
// =========================================================
function drawShelf() {
  noStroke();
  fill(30, 22, 46, 235);
  rect(0, height - SHELF_H, width, SHELF_H);
  stroke(70, 55, 100); strokeWeight(1.5);
  line(0, height - SHELF_H, width, height - SHELF_H);
  noStroke();

  for (let i = 0; i < shelfSlots.length; i++) {
    const s = shelfSlots[i];
    const active = i === selectedPuppet;
    if (active) {
      noFill(); stroke(255, 220, 140); strokeWeight(3);
      circle(s.x, s.y, s.r * 2 + 16);
      noStroke();
    }
    fill(255, 255, 255, active ? 235 : 160);
    circle(s.x, s.y, s.r * 2);
    push();
    translate(s.x, s.y);
    scale(0.62 * (s.r / 55));
    fill(35, 28, 20);
    PUPPETS[i].draw(millis() * 0.001 + i);
    pop();
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

// =========================================================
// MOUSE FALLBACK  (useful for testing without a webcam)
// =========================================================
function mousePressed() {
  if (mouseY > height - SHELF_H) trySelectPuppet(mouseX, mouseY);
}
