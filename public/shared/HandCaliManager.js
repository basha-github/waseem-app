/* =========================================================
   HandCaliManager.js — shared fingertip tracking + 9-point
   calibration for p5.js GLOBAL MODE wall apps.

   CONTRACT (what an app using this file must / may do):
   - Declare its own `let appMode = 'calibration';` and
     `let calH = null;` before calling any cali* function
     (this file assigns to them, it does not declare them,
     so two <script> tags can share the same globals).
   - Call `caliPreload()` from its own `preload()`.
   - Call `caliSetup()` and then `caliAutoLoad()` from its own
     `setup()`, after creating its canvas.
   - Call `_updateFinger()` as the first line of `draw()`.
   - When `appMode === 'calibration'`, call `_drawCal()` and
     return early — this file owns the grid UI.
   - On resize, call `_buildGrid()` if still calibrating.
   - Route `mousePressed()` to `_calClick()` while calibrating,
     for a no-camera / testing fallback.
   - Optionally define its own `function _initApp(){...}` —
     called once when calibration finishes or auto-loads.

   This file exposes: CAM_W, CAM_H, calDone, fingerX, fingerY,
   fingerConf, fingers[] (up to 2 hands, camera-pixel space),
   applyHomography(H, {x,y}), plus the functions above.

   Calibration is stored under the SAME localStorage key used
   by the rest of the wall (`wallSharedCalibration`), so a
   person who already calibrated any other wall app doesn't
   need to do it again here — and vice versa.
   ========================================================= */

const CAM_W = 640, CAM_H = 480;
const CAL_STORAGE_KEY = "wallSharedCalibration";
const GRID_ROWS = 3, GRID_COLS = 3;
const DWELL_MS = 1400;

let calDone = false;

let fingerX = -1, fingerY = -1, fingerConf = 0;
let fingers = []; // [{x,y,conf}, ...] up to 2 hands, camera-pixel space

let _handPose = null;
let _video = null;
let _predictions = [];
let _camReady = false;
let _camError = null;

let _calGrid = [], _dotStatus = [], _activeIdx = 0, _pairs = [];
let _dwellStart = 0, _dwellProg = 0;
let _flashRings = [];

// ── Public lifecycle ────────────────────────────────────────────
function caliPreload() {
  _handPose = ml5.handPose({ flipped: true, maxHands: 2 });
}

function caliSetup() {
  _video = createCapture(VIDEO, () => {
    _camReady = true;
    _handPose.detectStart(_video, results => { _predictions = results; });
  });
  _video.size(CAM_W, CAM_H);
  _video.hide();
  _buildGrid();

  // p5's createCapture doesn't expose a clean error callback across
  // versions — if the camera hasn't come up after a few seconds
  // (denied permission, no device, etc.), fall back to a mouse-only
  // calibration message rather than leaving the screen stuck on
  // "Starting camera…" forever.
  setTimeout(() => {
    if (!_camReady) _camError = 'Camera unavailable — you can still calibrate with a mouse.';
  }, 6000);
}

function caliAutoLoad() {
  try {
    const raw = localStorage.getItem(CAL_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved && saved.homography) {
      calH = saved.homography;
      calDone = true;
      appMode = 'app';
      if (typeof _initApp === 'function') _initApp();
    }
  } catch (e) { /* ignore corrupt/missing calibration */ }
}

// ── Per-frame fingertip update (call at top of draw()) ──────────
function _updateFinger() {
  fingers = [];
  for (const hand of _predictions) {
    const tip = hand.keypoints && hand.keypoints[8];
    if (!tip) continue;
    const conf = hand.confidence != null ? hand.confidence : 1.0;
    fingers.push({ x: tip.x, y: tip.y, conf });
  }
  if (fingers.length > 0) {
    fingerX = fingers[0].x;
    fingerY = fingers[0].y;
    fingerConf = fingers[0].conf;
  } else {
    fingerX = -1; fingerY = -1; fingerConf = 0;
  }
}

// ── Calibration grid (screen space) ──────────────────────────────
function _buildGrid() {
  _calGrid = []; _dotStatus = [];
  const PAD = Math.min(150, width * 0.15, height * 0.15);
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const x = PAD + (width - 2 * PAD) * (c / (GRID_COLS - 1));
      const y = PAD + (height - 2 * PAD) * (r / (GRID_ROWS - 1));
      _calGrid.push({ x, y });
      _dotStatus.push('pending');
    }
  }
  _activeIdx = 0;
  if (_dotStatus.length) _dotStatus[0] = 'active';
  _pairs = [];
  calH = null;
  calDone = false;
  _dwellStart = 0; _dwellProg = 0;
}

// ── Draw the calibration screen (call while appMode==='calibration') ──
function _drawCal() {
  background(18, 14, 38);

  if (_camError) {
    _drawCenterMessage('⚠️ ' + _camError, '#ff8080',
      'Click each dot below with a mouse to calibrate without a camera.');
  } else if (!_camReady) {
    _drawCenterMessage('🖐️ Starting camera…', '#ffd966', '');
  }

  noStroke();
  fill(255, 255, 255, 235);
  textAlign(CENTER, TOP);
  textSize(20);
  text('Point your finger at the glowing dot and hold still', width / 2, 24);
  textSize(14);
  fill(255, 255, 255, 160);
  text('(or click each dot with a mouse)  ·  dot ' + Math.min(_activeIdx + 1, _calGrid.length) + ' / ' + _calGrid.length,
    width / 2, 52);

  // Update flash rings (captured-point feedback)
  for (let i = _flashRings.length - 1; i >= 0; i--) {
    const fr = _flashRings[i];
    fr.life -= 1;
    if (fr.life <= 0) { _flashRings.splice(i, 1); continue; }
    noFill();
    stroke(120, 255, 160, (fr.life / 30) * 255);
    strokeWeight(3);
    circle(fr.x, fr.y, 40 + (30 - fr.life) * 2);
  }

  // Draw dots
  for (let i = 0; i < _calGrid.length; i++) {
    const g = _calGrid[i];
    const st = _dotStatus[i];
    noStroke();
    if (st === 'done') {
      fill(120, 230, 150, 220);
      circle(g.x, g.y, 22);
    } else if (st === 'active') {
      const pulse = 6 * Math.sin(millis() * 0.006);
      fill(255, 210, 90, 100);
      circle(g.x, g.y, 46 + pulse);
      fill(255, 210, 90, 235);
      circle(g.x, g.y, 24);
    } else {
      fill(255, 255, 255, 70);
      circle(g.x, g.y, 16);
    }
  }

  _driveDwell();
}

// ── Dwell logic: hold fingertip over the active dot to capture it ──
function _driveDwell() {
  if (calDone || _activeIdx >= _calGrid.length) return;
  if (fingerX < 0 || fingerConf <= 0.01) { _dwellStart = 0; _dwellProg = 0; return; }

  const dot = _calGrid[_activeIdx];
  const sx = fingerX * (width / CAM_W);
  const sy = fingerY * (height / CAM_H);
  const d = dist(sx, sy, dot.x, dot.y);

  if (d < 55) {
    if (_dwellStart === 0) _dwellStart = millis();
    _dwellProg = constrain((millis() - _dwellStart) / DWELL_MS, 0, 1);
    // Progress ring around the active dot
    noFill();
    stroke(255, 255, 255, 230);
    strokeWeight(4);
    const a0 = -HALF_PI;
    arc(dot.x, dot.y, 60, 60, a0, a0 + _dwellProg * TWO_PI);
    if (_dwellProg >= 1) _captureActivePoint(fingerX, fingerY);
  } else {
    _dwellStart = 0; _dwellProg = 0;
  }
}

function _captureActivePoint(camX, camY) {
  const dot = _calGrid[_activeIdx];
  _pairs.push({ cam: [camX, camY], proj: [dot.x, dot.y] });
  _dotStatus[_activeIdx] = 'done';
  _flashRings.push({ x: dot.x, y: dot.y, life: 30 });
  _activeIdx++;
  _dwellStart = 0; _dwellProg = 0;

  if (_activeIdx >= _calGrid.length) {
    _finishCalibration();
  } else {
    _dotStatus[_activeIdx] = 'active';
  }
}

// ── Mouse-click fallback: capture the active dot with the mouse ──
function _calClick() {
  if (calDone || _activeIdx >= _calGrid.length) return;
  if (fingerX >= 0 && fingerConf > 0.01) {
    _captureActivePoint(fingerX, fingerY);
  } else {
    // Synthesize a camera-space point from the mouse position so
    // calibration can be completed with no webcam at all.
    const camX = (mouseX / Math.max(1, width)) * CAM_W;
    const camY = (mouseY / Math.max(1, height)) * CAM_H;
    _captureActivePoint(camX, camY);
  }
}

function _finishCalibration() {
  const H = _computeHomography(_pairs);
  if (!H) { _buildGrid(); return; } // degenerate points — restart
  calH = H;
  calDone = true;
  appMode = 'app';
  try {
    localStorage.setItem(CAL_STORAGE_KEY, JSON.stringify({ homography: H, pairs: _pairs }));
  } catch (e) { /* storage unavailable — calibration still works this session */ }
  if (typeof _initApp === 'function') _initApp();
}

function _drawCenterMessage(msg, col, sub) {
  push();
  textAlign(CENTER, CENTER);
  fill(col);
  textSize(22);
  text(msg, width / 2, height / 2 - 12);
  if (sub) {
    fill(255, 255, 255, 180);
    textSize(14);
    text(sub, width / 2, height / 2 + 16);
  }
  pop();
}

// ── applyHomography(H, {x,y}) -> {x,y}  (object-based, for game code) ──
function applyHomography(H, pt) {
  if (!H) return null;
  const x = pt.x, y = pt.y;
  const w = H[2][0] * x + H[2][1] * y + H[2][2];
  if (Math.abs(w) < 1e-12) return { x, y };
  return {
    x: (H[0][0] * x + H[0][1] * y + H[0][2]) / w,
    y: (H[1][0] * x + H[1][1] * y + H[1][2]) / w,
  };
}

// ── Compact normalized-DLT homography solver (same algorithm as
//    shared/homography.js, inlined here since this file loads as a
//    classic script, not an ES module) ──
function _matMul3(A, B) {
  const R = [[0,0,0],[0,0,0],[0,0,0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) R[i][j] += A[i][k]*B[k][j];
  return R;
}
function _matInv3(A) {
  const [a,b,c]=A[0], [d,e,f]=A[1], [g,h,i]=A[2];
  const det = a*(e*i-f*h) - b*(d*i-f*g) + c*(d*h-e*g);
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1/det;
  return [
    [(e*i-f*h)*inv, (c*h-b*i)*inv, (b*f-c*e)*inv],
    [(f*g-d*i)*inv, (a*i-c*g)*inv, (c*d-a*f)*inv],
    [(d*h-e*g)*inv, (b*g-a*h)*inv, (a*e-b*d)*inv],
  ];
}
function _jacobiEigen(matrixIn, n, maxSweeps = 100) {
  const A = matrixIn.map(row => row.slice());
  let V = Array.from({length:n}, (_, i) => Array.from({length:n}, (_, j) => (i===j?1:0)));
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i+1; j < n; j++) off += A[i][j]*A[i][j];
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) {
      for (let q = p+1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-15) continue;
        const theta = (A[q][q]-A[p][p]) / (2*A[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta*theta+1));
        const c = 1/Math.sqrt(t*t+1), s = t*c;
        const App=A[p][p], Aqq=A[q][q], Apq=A[p][q];
        A[p][p]=App-t*Apq; A[q][q]=Aqq+t*Apq; A[p][q]=0; A[q][p]=0;
        for (let k = 0; k < n; k++) {
          if (k!==p && k!==q) {
            const Akp=A[k][p], Akq=A[k][q];
            A[k][p]=c*Akp-s*Akq; A[p][k]=A[k][p];
            A[k][q]=s*Akp+c*Akq; A[q][k]=A[k][q];
          }
        }
        for (let k = 0; k < n; k++) {
          const Vkp=V[k][p], Vkq=V[k][q];
          V[k][p]=c*Vkp-s*Vkq; V[k][q]=s*Vkp+c*Vkq;
        }
      }
    }
  }
  const values = Array.from({length:n}, (_, i) => A[i][i]);
  const vectors = Array.from({length:n}, (_, k) => V.map(row => row[k]));
  return { values, vectors };
}
function _normalizePoints(pts) {
  const n = pts.length;
  let cx=0, cy=0;
  for (const [x,y] of pts) { cx+=x; cy+=y; }
  cx/=n; cy/=n;
  let meanDist=0;
  for (const [x,y] of pts) meanDist += Math.hypot(x-cx, y-cy);
  meanDist/=n;
  const scale = meanDist > 1e-8 ? Math.sqrt(2)/meanDist : 1;
  const T = [[scale,0,-scale*cx],[0,scale,-scale*cy],[0,0,1]];
  const normPts = pts.map(([x,y]) => [scale*(x-cx), scale*(y-cy)]);
  return { T, normPts };
}
function _computeHomography(pairs) {
  if (!pairs || pairs.length < 4) return null;
  const srcPts = pairs.map(p => p.cam);
  const dstPts = pairs.map(p => p.proj);
  const { T: Tsrc, normPts: nSrc } = _normalizePoints(srcPts);
  const { T: Tdst, normPts: nDst } = _normalizePoints(dstPts);
  const n = pairs.length;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const [x,y]=nSrc[i], [u,v]=nDst[i];
    rows.push([-x,-y,-1, 0,0,0, u*x,u*y,u]);
    rows.push([0,0,0, -x,-y,-1, v*x,v*y,v]);
  }
  const AtA = Array.from({length:9}, () => new Array(9).fill(0));
  for (const row of rows) for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) AtA[i][j] += row[i]*row[j];
  const { values, vectors } = _jacobiEigen(AtA, 9);
  let minIdx = 0;
  for (let i = 1; i < 9; i++) if (values[i] < values[minIdx]) minIdx = i;
  const h = vectors[minIdx];
  const Hn = [[h[0],h[1],h[2]],[h[3],h[4],h[5]],[h[6],h[7],h[8]]];
  const TdstInv = _matInv3(Tdst);
  if (!TdstInv) return null;
  let H = _matMul3(_matMul3(TdstInv, Hn), Tsrc);
  const s = H[2][2];
  if (Math.abs(s) > 1e-12) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) H[i][j] /= s;
  return H;
}
