/* =========================================================
   COLOR QUEST! 🎨 — hand-drawn / crayon edition
   p5.js, GLOBAL MODE (setup, draw, mousePressed as plain
   global functions — no class/instance mode).

   This version is COLOR-ONLY: every shape on screen is just
   a hand-sketched color blob (no balloons/flowers/objects) so
   kids focus purely on matching colors, not recognizing shapes.

   STYLE NOTES
   Each blob is drawn with a wobbly hand-sketched outline and
   a thick charcoal ink border, like a kid's coloring book —
   no gradients or glossy highlights. The background is a
   doodled scene (sun, clouds, grass) instead of a flat card.
   ========================================================= */

// ---------- CONFIG ----------
// Canvas now fills the browser window (touch-wall / kiosk style) instead of
// a fixed 800x600 box, so the shared calibration — which maps camera space
// to a FRACTION of whatever canvas it was calibrated against — lines up
// correctly no matter which app in the suite was calibrated last.
let CANVAS_W = window.innerWidth;
let CANVAS_H = window.innerHeight;
let TOP_ZONE_H = 130;      // reserved area for the question banner
let MIN_SHAPES = 6;
let MAX_SHAPES = 8;
let MIN_SIZE = 75;
let MAX_SIZE = 110;
let INK = [40, 35, 30];    // charcoal/crayon outline color

// Fingertip "virtual pointer" fed in by js/main.js after mapping the
// tracked hand through the shared calibration. { x, y, active }
window.WallPointer = { x: -1, y: -1, active: false };
const DWELL_MS = 750; // how long to hold the finger over a shape to pick it
let hoverShape = null;
let hoverStartMs = 0;

let PALETTE = [
  { name: "Red",    rgb: [231, 76, 60] },
  { name: "Blue",   rgb: [52, 120, 246] },
  { name: "Yellow", rgb: [255, 200, 25] },
  { name: "Green",  rgb: [70, 180, 95] },
  { name: "Purple", rgb: [150, 85, 180] },
  { name: "Orange", rgb: [250, 140, 35] },
  { name: "Pink",   rgb: [255, 105, 175] }
];

// Shapes are now plain hand-drawn color splotches — no balloons,
// flowers, or other object theming. Just color, color, color.

// ---------- GAME STATE ----------
let shapes = [];
let targetColor;
let score = 0;
let round = 1;

let feedbackText = "";
let feedbackColor = [0, 0, 0];
let feedbackTimer = 0;
let nextRoundAt = 0;
let waitingForNextRound = false;
let shakeAmount = 0;

let particles = [];        // confetti burst on correct answers
let clouds = [];           // background doodle clouds (fixed positions)

// =========================================================
// SETUP
// =========================================================
function setup() {
  let cnv = createCanvas(CANVAS_W, CANVAS_H);
  cnv.parent("canvasHolder");
  noiseSeed(random(1000));

  // Pre-compute a few cloud positions/sizes so the background
  // doodle stays consistent (not redrawn randomly every frame)
  for (let i = 0; i < 4; i++) {
    clouds.push({
      x: random(60, width - 60),
      y: random(20, TOP_ZONE_H * 0.55),
      s: random(40, 65)
    });
  }

  newRound();
}

function windowResized() {
  CANVAS_W = window.innerWidth;
  CANVAS_H = window.innerHeight;
  resizeCanvas(CANVAS_W, CANVAS_H);
}

// =========================================================
// MAIN DRAW LOOP
// =========================================================
function draw() {
  drawSketchyBackground();

  push();
  if (shakeAmount > 0) {
    translate(random(-shakeAmount, shakeAmount), random(-shakeAmount, shakeAmount));
    shakeAmount *= 0.85;
    if (shakeAmount < 0.5) shakeAmount = 0;
  }

  for (let s of shapes) {
    drawShape(s);
  }

  updateAndDrawParticles();
  pop();

  drawQuestionBanner();
  drawFeedback();
  updateFingerDwell();
  drawFingerCursor();

  if (waitingForNextRound && millis() > nextRoundAt) {
    waitingForNextRound = false;
    newRound();
  }
}

// =========================================================
// FINGERTIP DWELL SELECTION (touch-wall input alongside mouse click)
// =========================================================
function shapeAt(x, y) {
  for (let s of shapes) {
    let bob = sin(frameCount * 0.04 + s.phase) * 6;
    let hitRadius = (s.size / 2) * 1.05;
    if (dist(x, y, s.x, s.y + bob) < hitRadius) return s;
  }
  return null;
}

function updateFingerDwell() {
  const wp = window.WallPointer;
  if (!wp || !wp.active || waitingForNextRound) {
    hoverShape = null;
    return;
  }

  const hit = shapeAt(wp.x, wp.y);
  if (hit !== hoverShape) {
    hoverShape = hit;
    hoverStartMs = millis();
  }
  if (!hit) return;

  const elapsed = millis() - hoverStartMs;
  const progress = constrain(elapsed / DWELL_MS, 0, 1);

  // progress ring drawn around the hovered shape
  push();
  let bob = sin(frameCount * 0.04 + hit.phase) * 6;
  translate(hit.x, hit.y + bob);
  noFill();
  stroke(255, 255, 255, 230);
  strokeWeight(5);
  const start = -HALF_PI;
  arc(0, 0, hit.size + 26, hit.size + 26, start, start + progress * TWO_PI);
  pop();

  if (progress >= 1) {
    hoverShape = null;
    if (hit.colorObj.name === targetColor.name) handleCorrect(hit);
    else handleWrong(hit);
  }
}

function drawFingerCursor() {
  const wp = window.WallPointer;
  if (!wp || !wp.active) return;
  push();
  noFill();
  stroke(255, 105, 175);
  strokeWeight(2.5);
  circle(wp.x, wp.y, 26);
  noStroke();
  fill(255, 105, 175);
  circle(wp.x, wp.y, 8);
  pop();
}

// =========================================================
// HAND-DOODLED BACKGROUND (sun, clouds, grass — no gradients)
// =========================================================
function drawSketchyBackground() {
  background(255, 253, 246); // warm paper white

  // grass strip with a scalloped (hand-cut) top edge
  noStroke();
  fill(190, 230, 150);
  let grassTop = height - 50;
  beginShape();
  vertex(0, height);
  vertex(0, grassTop + 10);
  for (let x = 0; x <= width; x += 20) {
    let bump = sin(x * 0.15) * 6;
    vertex(x, grassTop + bump);
  }
  vertex(width, height);
  endShape(CLOSE);

  // sun, sketched as a wobbly circle with triangular rays
  push();
  translate(width - 70, 60);
  stroke(INK[0], INK[1], INK[2]);
  strokeWeight(3);
  for (let i = 0; i < 8; i++) {
    let a = (TWO_PI / 8) * i;
    let r1 = 30, r2 = 42;
    line(cos(a) * r1, sin(a) * r1, cos(a) * r2, sin(a) * r2);
  }
  fill(255, 210, 70);
  noStroke();
  circle(0, 0, 50);
  stroke(INK[0], INK[1], INK[2]);
  strokeWeight(2.5);
  noFill();
  circle(0, 0, 50);
  pop();

  // doodle clouds
  noStroke();
  for (let c of clouds) {
    push();
    translate(c.x, c.y);
    fill(255);
    stroke(INK[0], INK[1], INK[2], 160);
    strokeWeight(2);
    ellipse(0, 0, c.s, c.s * 0.6);
    ellipse(c.s * 0.45, c.s * 0.05, c.s * 0.7, c.s * 0.45);
    ellipse(-c.s * 0.45, c.s * 0.1, c.s * 0.6, c.s * 0.4);
    pop();
  }
  noStroke();
}

// =========================================================
// QUESTION BANNER (hand-drawn ribbon instead of a flat card)
// =========================================================
function drawQuestionBanner() {
  push();

  // wobbly banner shape
  stroke(INK[0], INK[1], INK[2]);
  strokeWeight(4);
  fill(255, 250, 225);
  beginShape();
  curveVertex(10, 8);
  curveVertex(width / 2, 2);
  curveVertex(width - 10, 10);
  curveVertex(width - 6, TOP_ZONE_H - 16);
  curveVertex(width / 2, TOP_ZONE_H - 8);
  curveVertex(8, TOP_ZONE_H - 14);
  curveVertex(10, 8);
  endShape();

  // the question, drawn as bold outlined "marker" text
  textAlign(CENTER, CENTER);
  textSize(32);
  textStyle(BOLD);
  let q = "Find the " + targetColor.name + " color!";
  stroke(INK[0], INK[1], INK[2]);
  strokeWeight(4);
  fill(255);
  text(q, width / 2, 48);
  noStroke();
  fill(40);
  text(q, width / 2, 48);

  // color swatch — a little wobbly blob, not a perfect circle
  let swatchX = width / 2 + textWidth(q) / 2 + 38;
  drawInkBlob(swatchX, 48, 34, targetColor.rgb, 4);

  // score + round, hand-lettered in the corners of the banner
  textStyle(NORMAL);
  textSize(20);
  textAlign(LEFT, CENTER);
  fill(80);
  noStroke();
  text("\u2605 Score: " + score, 18, 100);
  textAlign(RIGHT, CENTER);
  text("Round " + round, width - 18, 100);

  pop();
}

// =========================================================
// FEEDBACK MESSAGE
// =========================================================
function drawFeedback() {
  if (feedbackTimer > 0) {
    feedbackTimer--;
    let alpha = constrain(map(feedbackTimer, 0, 60, 0, 255), 0, 255);
    let bounce = sin((60 - feedbackTimer) * 0.3) * 6;

    push();
    textAlign(CENTER, CENTER);
    textSize(46);
    textStyle(BOLD);
    translate(width / 2, height / 2 + bounce);
    rotate(-0.03);
    stroke(255, alpha);
    strokeWeight(7);
    fill(feedbackColor[0], feedbackColor[1], feedbackColor[2], alpha);
    text(feedbackText, 0, 0);
    pop();
  }
}

// =========================================================
// ROUND / SHAPE GENERATION
// =========================================================
function newRound() {
  shapes = [];
  let count = floor(random(MIN_SHAPES, MAX_SHAPES + 1));
  for (let i = 0; i < count; i++) shapes.push(makeRandomShape());

  targetColor = random(PALETTE);
  let alreadyHasTarget = shapes.some(s => s.colorObj.name === targetColor.name);
  if (!alreadyHasTarget) {
    shapes[floor(random(shapes.length))].colorObj = targetColor;
  }
}

function makeRandomShape() {
  let size = random(MIN_SIZE, MAX_SIZE);
  let colorObj = random(PALETTE);

  let x, y, tries = 0, okPosition = false;
  do {
    x = random(size, width - size);
    y = random(TOP_ZONE_H + size * 0.6, height - 60 - size * 0.3);
    okPosition = true;
    for (let s of shapes) {
      if (dist(x, y, s.x, s.y) < (size + s.size) * 0.55) { okPosition = false; break; }
    }
    tries++;
  } while (!okPosition && tries < 40);

  // Precompute a wobble "fingerprint" once per shape so the
  // hand-drawn jitter stays the same shape every frame instead
  // of flickering randomly.
  let wobblePoints = [];
  let n = 14;
  for (let i = 0; i < n; i++) {
    wobblePoints.push(random(-0.07, 0.07));
  }

  return {
    x, y, size, colorObj,
    phase: random(TWO_PI),
    popScale: 1,
    wobble: wobblePoints,
    rot: random(-0.06, 0.06)
  };
}

// =========================================================
// DRAW DISPATCH
// =========================================================
function drawShape(s) {
  let bob = sin(frameCount * 0.04 + s.phase) * 6;
  let sz = s.size * s.popScale;

  if (s.popScale !== 1) {
    s.popScale = lerp(s.popScale, 1, 0.15);
    if (abs(s.popScale - 1) < 0.01) s.popScale = 1;
  }

  push();
  translate(s.x, s.y + bob);
  rotate(s.rot);

  drawCrayonBlob(sz, s.colorObj.rgb, s.wobble);

  pop();
}

// ---- Generic wobbly hand-drawn blob (used as the "circle") ----
function drawInkBlob(cx, cy, sz, c, weight) {
  push();
  translate(cx, cy);
  stroke(INK[0], INK[1], INK[2]);
  strokeWeight(weight);
  fill(c[0], c[1], c[2]);
  beginShape();
  let n = 12;
  for (let i = 0; i <= n; i++) {
    let a = (TWO_PI / n) * i;
    let r = (sz / 2) * (1 + 0.06 * sin(a * 3));
    curveVertex(cos(a) * r, sin(a) * r);
  }
  endShape(CLOSE);
  pop();
}

function drawCrayonBlob(sz, c, wobble) {
  stroke(INK[0], INK[1], INK[2]);
  strokeWeight(4);
  fill(c[0], c[1], c[2]);

  beginShape();
  let n = wobble.length;
  for (let i = 0; i <= n; i++) {
    let a = (TWO_PI / n) * i;
    let wob = wobble[i % n];
    let r = (sz / 2) * (1 + wob);
    curveVertex(cos(a) * r, sin(a) * r);
  }
  endShape(CLOSE);

  drawCrayonHatching(sz * 0.32, c);
}

// ---- A couple of darker crayon hatch-marks for texture ----
function drawCrayonHatching(spread, c) {
  let darker = [max(c[0] - 35, 0), max(c[1] - 35, 0), max(c[2] - 35, 0)];
  stroke(darker[0], darker[1], darker[2], 110);
  strokeWeight(2);
  noFill();
  for (let i = 0; i < 3; i++) {
    let ox = random(-spread, spread);
    let oy = random(-spread, spread);
    let len = random(8, 16);
    let a = random(TWO_PI);
    line(ox, oy, ox + cos(a) * len, oy + sin(a) * len);
  }
}

// =========================================================
// CONFETTI PARTICLES (correct-answer celebration)
// =========================================================
function spawnConfetti(x, y) {
  for (let i = 0; i < 22; i++) {
    let col = random(PALETTE).rgb;
    particles.push({
      x, y,
      vx: random(-3.5, 3.5),
      vy: random(-6, -2),
      size: random(5, 9),
      col,
      life: 255
    });
  }
}

function updateAndDrawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.22; // gravity
    p.life -= 5;

    noStroke();
    fill(p.col[0], p.col[1], p.col[2], max(p.life, 0));
    rectMode(CENTER);
    push();
    translate(p.x, p.y);
    rotate(p.x * 0.05);
    rect(0, 0, p.size, p.size * 0.6, 2);
    pop();

    if (p.life <= 0) particles.splice(i, 1);
  }
}

// =========================================================
// MOUSE CLICK HANDLING
// =========================================================
function mousePressed() {
  if (waitingForNextRound) return;

  for (let s of shapes) {
    let bob = sin(frameCount * 0.04 + s.phase) * 6;
    let sy = s.y + bob;
    let hitRadius = (s.size / 2) * 1.05;

    if (dist(mouseX, mouseY, s.x, sy) < hitRadius) {
      if (s.colorObj.name === targetColor.name) handleCorrect(s);
      else handleWrong(s);
      return;
    }
  }
}

function handleCorrect(s) {
  score++;
  round++;
  s.popScale = 1.4;
  feedbackText = pickEncouragement();
  feedbackColor = [55, 150, 80];
  feedbackTimer = 60;
  shakeAmount = 0;
  spawnConfetti(s.x, s.y);

  waitingForNextRound = true;
  nextRoundAt = millis() + 1200;
}

function handleWrong(s) {
  s.popScale = 0.85;
  feedbackText = pickTryAgain();
  feedbackColor = [210, 70, 70];
  feedbackTimer = 45;
  shakeAmount = 8;
}

function pickEncouragement() {
  return random(["Great job!", "Awesome!", "You got it!", "Yay!", "Super!"]);
}

function pickTryAgain() {
  return random(["Try again!", "Almost!", "Not quite!"]);
}
