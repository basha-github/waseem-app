/* =========================================================
   CONDUCTOR WALL \u{1F3BC} — hand height/position controls
   tempo or volume of a looping tune; kids "conduct" an
   orchestra.

   p5.js, GLOBAL MODE for rendering. Hand tracking is provided
   by js/tracking-bridge.js (MediaPipe-based, same engine used by
   the touch-wall's other apps) via window.__conductorTracking;
   this file only owns the game logic and reads the fingertip
   position off that bridge each frame.

   INTERACTION MODEL
   A short tune loops continuously — no "correct answer" here,
   it's a sandbox instrument like MyPiano/MyMusic. Two
   independent mappings, both live and continuous:
     • hand HEIGHT on screen → TEMPO (raise your hand, the
       music speeds up; lower it, the music slows down)
     • how much the hand is MOVING → VOLUME (hold still and
       the orchestra plays softly; wave with energy and it
       swells) — this is the closest analogue to a real
       conductor's gesture size controlling dynamics
   A row of instrument emoji bounce in time with the beat as
   a visual metronome, and a baton trail follows the fingertip.
   ========================================================= */

// ---------- CANVAS ----------
function _canvasW() { return windowWidth; }
function _canvasH() { return windowHeight; }

// ── Finger position in canvas coords (-1 = not currently pointing at canvas) ─
let fingerScreenX = -1;
let fingerScreenY = -1;
let baton = [];   // trailing history of recent fingertip positions

// ---------- MUSIC ----------
const SCALE = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25]; // C D E F G A B C
const MELODY_STEPS = [0, 2, 4, 2, 0, 4, 7, 4];
const KICK_STEPS = [0, 4];
const STEPS_PER_LOOP = 8;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.15;

const BPM_MIN = 55, BPM_MAX = 170;
const VOL_MIN = 0.12, VOL_MAX = 0.9;

let audioCtx = null, masterGain = null, audioStarted = false;
let schedulerTimer = null;
let nextNoteTime = 0;
let stepIndex = 0;

let currentBPM = 96, targetBPM = 96;
let currentVolume = VOL_MIN, targetVolume = VOL_MIN;
let _speedEMA = 0;
let _prevFX = -1, _prevFY = -1, _fingerWasVisible = false;

let lastBeatAt = -9999, lastBeatWasKick = false;

// ---------- ORCHESTRA VISUAL ----------
const INSTRUMENTS = ['🎻', '🎺', '🥁', '🎷', '🪕', '🎹'];

function setup() {
  createCanvas(_canvasW(), _canvasH());
  textFont('Baloo 2, Quicksand, sans-serif');
}

function windowResized() {
  resizeCanvas(_canvasW(), _canvasH());
}

// =========================================================
// MAIN DRAW LOOP
// =========================================================
function draw() {
  drawStage();
  updateFingerScreenPos();
  updateConductorMapping();
  startAudioIfNeeded();

  drawOrchestra();
  drawBatonTrail();
  drawReadout();
  drawFingerDot();
}

// ── Map fingertip (camera space) → canvas coords using the saved homography ──
function updateFingerScreenPos() {
  const bridge = window.__conductorTracking;
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
// CONDUCTING MAPPING  (height → tempo, movement → volume)
// =========================================================
function updateConductorMapping() {
  if (fingerScreenY >= 0) {
    targetBPM = constrain(map(fingerScreenY, 0, height, BPM_MAX, BPM_MIN), BPM_MIN, BPM_MAX);
  }
  currentBPM = lerp(currentBPM, targetBPM, 0.05);

  const visible = fingerScreenX >= 0;
  let speed = 0;
  if (visible && _fingerWasVisible) {
    speed = dist(_prevFX, _prevFY, fingerScreenX, fingerScreenY);
  }
  if (visible) { _prevFX = fingerScreenX; _prevFY = fingerScreenY; }
  _fingerWasVisible = visible;

  _speedEMA = lerp(_speedEMA, speed, 0.15);
  targetVolume = constrain(map(_speedEMA, 0, 30, VOL_MIN, VOL_MAX), VOL_MIN, VOL_MAX);
  currentVolume = lerp(currentVolume, targetVolume, 0.08);

  if (masterGain && audioCtx) {
    masterGain.gain.setTargetAtTime(currentVolume, audioCtx.currentTime, 0.06);
  }

  // baton trail
  if (visible) {
    baton.push({ x: fingerScreenX, y: fingerScreenY });
    if (baton.length > 16) baton.shift();
  } else if (baton.length) {
    baton.shift();
  }
}

// =========================================================
// AUDIO ENGINE  (lookahead scheduler — standard Web Audio pattern)
// =========================================================
function _ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function startAudioIfNeeded() {
  if (audioStarted) return;
  const ctx = _ensureAudio();
  masterGain = ctx.createGain();
  masterGain.gain.value = currentVolume;
  masterGain.connect(ctx.destination);
  startPad(ctx);
  nextNoteTime = ctx.currentTime + 0.1;
  schedulerTimer = setInterval(scheduler, LOOKAHEAD_MS);
  audioStarted = true;
}

function startPad(ctx) {
  const padGain = ctx.createGain();
  padGain.gain.value = 0.16;
  padGain.connect(masterGain);
  [130.81, 164.81, 196.00].forEach((freq) => { // C3 E3 G3 sustained chord
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(padGain);
    osc.start();
  });
}

function scheduler() {
  if (!audioCtx) return;
  while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD_SEC) {
    scheduleStep(stepIndex, nextNoteTime);
    const secondsPerStep = (60 / currentBPM) / 2; // eighth notes
    nextNoteTime += secondsPerStep;
    stepIndex = (stepIndex + 1) % STEPS_PER_LOOP;
  }
}

function scheduleStep(step, time) {
  playMelodyNote(SCALE[MELODY_STEPS[step]], time);
  const isKick = KICK_STEPS.includes(step);
  if (isKick) playKick(time);
  playHat(time, step % 2 === 0 ? 0.12 : 0.05);

  const delayMs = max(0, (time - audioCtx.currentTime) * 1000);
  setTimeout(() => { lastBeatAt = millis(); lastBeatWasKick = isKick; }, delayMs);
}

function playMelodyNote(freq, time) {
  const ctx = audioCtx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(0.5, time + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
  osc.connect(gain).connect(masterGain);
  osc.start(time);
  osc.stop(time + 0.3);
}

function playKick(time) {
  const ctx = audioCtx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(42, time + 0.13);
  gain.gain.setValueAtTime(0.9, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
  osc.connect(gain).connect(masterGain);
  osc.start(time);
  osc.stop(time + 0.18);
}

function playHat(time, level) {
  const ctx = audioCtx;
  const bufSize = Math.floor(ctx.sampleRate * 0.05);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 6000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  src.connect(hp).connect(gain).connect(masterGain);
  src.start(time);
  src.stop(time + 0.05);
}

// =========================================================
// DRAWING
// =========================================================
function drawStage() {
  background(24, 16, 46);
  noStroke();
  fill(40, 28, 70);
  rect(0, height * 0.78, width, height * 0.22);
  for (let i = 0; i < 24; i++) {
    fill(255, 255, 255, 18 + (i % 4) * 8);
    circle((i * 157) % width, (i * 91) % (height * 0.6), 2 + (i % 3));
  }
}

function drawOrchestra() {
  const n = INSTRUMENTS.length;
  const spacing = width / (n + 1);
  const baseY = height * 0.78;
  const sinceBeat = millis() - lastBeatAt;

  for (let i = 0; i < n; i++) {
    const stagger = i * 45;
    const t = sinceBeat - stagger;
    let bounce = 0, glow = 0;
    if (t >= 0 && t < 260) {
      const k = t / 260;
      const amp = lastBeatWasKick ? 22 : 13;
      bounce = -sin(k * PI) * amp;
      glow = (1 - k) * (lastBeatWasKick ? 70 : 40);
    }
    const x = spacing * (i + 1);
    push();
    translate(x, baseY + bounce);
    if (glow > 0) {
      noStroke();
      fill(255, 220, 140, glow);
      circle(0, 10, 70 + glow * 0.4);
    }
    textAlign(CENTER, CENTER);
    textSize(min(56, spacing * 0.7));
    text(INSTRUMENTS[i], 0, 0);
    pop();
  }
}

function drawBatonTrail() {
  if (baton.length < 2) return;
  noFill();
  for (let i = 1; i < baton.length; i++) {
    const t = i / baton.length;
    stroke(255, 210, 120, t * 200);
    strokeWeight(t * 8);
    line(baton[i - 1].x, baton[i - 1].y, baton[i].x, baton[i].y);
  }
  noStroke();
}

function drawReadout() {
  noStroke();
  fill(255, 255, 255, 235);
  rectMode(CENTER);
  rect(width / 2, 46, min(360, width * 0.42), 62, 20);
  rectMode(CORNER);

  fill(40, 30, 70);
  textAlign(CENTER, CENTER);
  textSize(20);
  text('\u{1F3B5} ' + round(currentBPM) + ' BPM', width / 2, 30);

  const barW = min(260, width * 0.3);
  const barX = width / 2 - barW / 2;
  const barY = 54;
  noStroke();
  fill(220, 216, 235);
  rect(barX, barY, barW, 8, 4);
  fill(255, 160, 90);
  rect(barX, barY, barW * ((currentVolume - VOL_MIN) / (VOL_MAX - VOL_MIN)), 8, 4);

  fill(255, 255, 255, 200);
  textAlign(CENTER, TOP);
  textSize(14);
  text('height = tempo \u00B7 movement = volume', width / 2, 82);
}

function drawFingerDot() {
  if (fingerScreenX < 0) return;
  noStroke();
  fill(255, 210, 120, 90);
  ellipse(fingerScreenX, fingerScreenY, 60, 60);
  fill(255, 210, 120, 255);
  ellipse(fingerScreenX, fingerScreenY, 26, 26);
  fill(255);
  ellipse(fingerScreenX, fingerScreenY, 8, 8);
}

// =========================================================
// MOUSE FALLBACK  (useful for testing without a webcam)
// =========================================================
