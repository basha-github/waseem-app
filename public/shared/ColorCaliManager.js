/* =========================================================
   ColorCaliManager.js — shared colored-prop tracking + 9-point
   calibration for p5.js GLOBAL MODE wall apps that follow a
   colored physical object (a hammer, a wand, a bright block)
   instead of a fingertip.

   CONTRACT:
   - Declare its own `let appMode = 'colorpick';` and
     `let calH = null;` before calling any colorCali* function.
   - Call `colorCaliPreload()` from `preload()`.
   - Call `colorCaliSetup()` then `colorCaliAutoLoad()` from
     `setup()`, after creating the canvas.
   - Call `_updateHammer()` as the first line of `draw()`.
   - When appMode === 'colorpick', call `_drawColorPick()` and
     return — lets the person click their prop on the video
     preview to sample its color.
   - When appMode === 'calibration', call `_drawCal()` and
     return — this file owns the 9-dot grid UI.
   - On resize, call `_buildGrid()` if still calibrating.
   - Route `mousePressed()` to `_calClick()` while calibrating.
   - Optionally define its own `function _initApp(){...}`.

   Exposes: CAM_W, CAM_H, calDone, hammerX, hammerY, hammerFound,
   targetHue, targetSat, targetVal, applyHomography(H,{x,y}),
   _hsvToColor(h,s,v), plus the functions above.

   Deliberately NOT shared with HandCaliManager's calibration —
   a colored prop's camera-space position has nothing to do with
   a fingertip's, so this keeps its own localStorage key.
   ========================================================= */

const CAM_W = 640, CAM_H = 480;
const CAL_STORAGE_KEY = "colorCaliManager_v1";
const GRID_ROWS = 3, GRID_COLS = 3;
const DWELL_MS = 1400;
const HUE_TOLERANCE = 18;     // degrees, out of 360
const MIN_SAT = 0.35, MIN_VAL = 0.30;
const MIN_BLOB_PIXELS = 40;
const PIXEL_STRIDE = 4;       // sample every 4th pixel both axes, for speed

let calDone = false;
let hammerX = -1, hammerY = -1, hammerFound = false;
let targetHue = null, targetSat = 0, targetVal = 0;

let _video = null;
let _camReady = false;
let _camError = null;

let _calGrid = [], _dotStatus = [], _activeIdx = 0, _pairs = [];
let _dwellStart = 0, _dwellProg = 0;
let _flashRings = [];

// ── Public lifecycle ────────────────────────────────────────────
function colorCaliPreload() { /* nothing to preload — no ML model */ }

function colorCaliSetup() {
  _video = createCapture(VIDEO, () => { _camReady = true; });
  _video.size(CAM_W, CAM_H);
  _video.hide();
  _buildGrid();
  setTimeout(() => {
    if (!_camReady) _camError = 'Camera unavailable — pick a color and calibrate with a mouse.';
  }, 6000);

  // The app's own mousePressed() only forwards clicks to _calClick()
  // while appMode === 'calibration' (see e.g. ColorXylophone.js) — it
  // has no idea about the 'colorpick' step, since that's entirely
  // owned by this file. Listen independently so a click during
  // color-picking doesn't depend on the app routing it for us, and
  // so it can never double-fire with the app's own calibration click.
  window.addEventListener('pointerdown', () => {
    if (appMode === 'colorpick') _pickColorAt(mouseX, mouseY);
  });
}

function colorCaliAutoLoad() {
  try {
    const raw = localStorage.getItem(CAL_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved && saved.homography && saved.targetHue != null) {
      calH = saved.homography;
      targetHue = saved.targetHue;
      targetSat = saved.targetSat;
      targetVal = saved.targetVal;
      calDone = true;
      appMode = 'app';
      if (typeof _initApp === 'function') _initApp();
    }
  } catch (e) { /* ignore corrupt/missing calibration */ }
}

// ── Per-frame colored-blob centroid tracking ─────────────────────
function _updateHammer() {
  if (targetHue === null || !_camReady) { hammerFound = false; return; }

  _video.loadPixels();
  const px = _video.pixels;
  if (!px || px.length === 0) { hammerFound = false; return; }

  const w = _video.width, h = _video.height;
  let sumX = 0, sumY = 0, count = 0;

  for (let y = 0; y < h; y += PIXEL_STRIDE) {
    for (let x = 0; x < w; x += PIXEL_STRIDE) {
      const i = (y * w + x) * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const hsv = _rgbToHsv(r, g, b);
      if (hsv.s < MIN_SAT || hsv.v < MIN_VAL) continue;
      let dh = Math.abs(hsv.h - targetHue);
      if (dh > 180) dh = 360 - dh;
      if (dh > HUE_TOLERANCE) continue;
      sumX += x; sumY += y; count++;
    }
  }

  if (count >= MIN_BLOB_PIXELS) {
    hammerX = (sumX / count) * (CAM_W / w);
    hammerY = (sumY / count) * (CAM_H / h);
    hammerFound = true;
  } else {
    hammerFound = false;
  }
}

function _rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let hh = 0;
  if (d !== 0) {
    if (max === r) hh = ((g - b) / d) % 6;
    else if (max === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
    hh *= 60;
    if (hh < 0) hh += 360;
  }
  return { h: hh, s: max === 0 ? 0 : d / max, v: max };
}

function _hsvToColor(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return color((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

// ── Color-pick screen: show the live feed, click the prop to sample it ──
function _drawColorPick() {
  background(18, 14, 38);

  if (_camError) {
    _drawCenterMessage('⚠️ ' + _camError, '#ff8080', 'Click anywhere below to use a default color.');
  }

  if (_camReady) {
    push();
    imageMode(CENTER);
    const vw = Math.min(width * 0.8, 640), vh = vw * (CAM_H / CAM_W);
    image(_video, width / 2, height / 2, vw, vh);
    pop();
  }

  noStroke();
  fill(255, 255, 255, 235);
  textAlign(CENTER, TOP);
  textSize(20);
  text('Hold up your colored prop and click/tap it on the video', width / 2, 24);
  textSize(14);
  fill(255, 255, 255, 160);
  text('Pick a bright, solid color — not skin tone or white/black', width / 2, 52);
}

function _pickColorAt(mx, my) {
  if (!_camReady) { _setDefaultTargetColor(); return; }
  const vw = Math.min(width * 0.8, 640), vh = vw * (CAM_H / CAM_W);
  const vx0 = width / 2 - vw / 2, vy0 = height / 2 - vh / 2;
  if (mx < vx0 || mx > vx0 + vw || my < vy0 || my > vy0 + vh) return; // clicked outside the preview

  _video.loadPixels();
  const px = _video.pixels;
  const w = _video.width, h = _video.height;
  const sx = Math.floor(((mx - vx0) / vw) * w);
  const sy = Math.floor(((my - vy0) / vh) * h);
  const i = (constrain(sy, 0, h - 1) * w + constrain(sx, 0, w - 1)) * 4;
  const hsv = _rgbToHsv(px[i], px[i + 1], px[i + 2]);

  if (hsv.s < 0.25 || hsv.v < 0.25) return; // too washed-out/dark to be a reliable target — ignore the click

  targetHue = hsv.h; targetSat = Math.max(hsv.s, MIN_SAT); targetVal = Math.max(hsv.v, MIN_VAL);
  appMode = 'calibration';
  _buildGrid();
}

function _setDefaultTargetColor() {
  // No camera at all — fall back to a mid-saturation pink so the rest
  // of the flow (mouse-only calibration) still has a defined target.
  targetHue = 330; targetSat = 0.7; targetVal = 0.8;
  appMode = 'calibration';
  _buildGrid();
}

// ── Calibration grid (screen space) — identical UI to HandCaliManager ──
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

function _drawCal() {
  background(18, 14, 38);

  noStroke();
  fill(255, 255, 255, 235);
  textAlign(CENTER, TOP);
  textSize(20);
  text('Swing your colored prop to the glowing dot and hold still', width / 2, 24);
  textSize(14);
  fill(255, 255, 255, 160);
  text('(or click each dot with a mouse)  ·  dot ' + Math.min(_activeIdx + 1, _calGrid.length) + ' / ' + _calGrid.length,
    width / 2, 52);

  for (let i = _flashRings.length - 1; i >= 0; i--) {
    const fr = _flashRings[i];
    fr.life -= 1;
    if (fr.life <= 0) { _flashRings.splice(i, 1); continue; }
    noFill();
    stroke(120, 255, 160, (fr.life / 30) * 255);
    strokeWeight(3);
    circle(fr.x, fr.y, 40 + (30 - fr.life) * 2);
  }

  for (let i = 0; i < _calGrid.length; i++) {
    const g = _calGrid[i];
    const st = _dotStatus[i];
    noStroke();
    if (st === 'done') { fill(120, 230, 150, 220); circle(g.x, g.y, 22); }
    else if (st === 'active') {
      const pulse = 6 * Math.sin(millis() * 0.006);
      fill(255, 210, 90, 100); circle(g.x, g.y, 46 + pulse);
      fill(255, 210, 90, 235); circle(g.x, g.y, 24);
    } else { fill(255, 255, 255, 70); circle(g.x, g.y, 16); }
  }

  _driveDwell();
}

function _driveDwell() {
  if (calDone || _activeIdx >= _calGrid.length) return;
  if (!hammerFound || hammerX < 0) { _dwellStart = 0; _dwellProg = 0; return; }

  const dot = _calGrid[_activeIdx];
  const sx = hammerX * (width / CAM_W);
  const sy = hammerY * (height / CAM_H);
  const d = dist(sx, sy, dot.x, dot.y);

  if (d < 55) {
    if (_dwellStart === 0) _dwellStart = millis();
    _dwellProg = constrain((millis() - _dwellStart) / DWELL_MS, 0, 1);
    noFill();
    stroke(255, 255, 255, 230);
    strokeWeight(4);
    const a0 = -HALF_PI;
    arc(dot.x, dot.y, 60, 60, a0, a0 + _dwellProg * TWO_PI);
    if (_dwellProg >= 1) _captureActivePoint(hammerX, hammerY);
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
  if (_activeIdx >= _calGrid.length) _finishCalibration();
  else _dotStatus[_activeIdx] = 'active';
}

// ── Mouse fallback — used both for the color-pick step and calibration ──
function _calClick() {
  if (appMode === 'colorpick') { _pickColorAt(mouseX, mouseY); return; }
  if (calDone || _activeIdx >= _calGrid.length) return;
  if (hammerFound && hammerX >= 0) {
    _captureActivePoint(hammerX, hammerY);
  } else {
    const camX = (mouseX / Math.max(1, width)) * CAM_W;
    const camY = (mouseY / Math.max(1, height)) * CAM_H;
    _captureActivePoint(camX, camY);
  }
}

function _finishCalibration() {
  const H = _computeHomography(_pairs);
  if (!H) { _buildGrid(); return; }
  calH = H;
  calDone = true;
  appMode = 'app';
  try {
    localStorage.setItem(CAL_STORAGE_KEY, JSON.stringify({
      homography: H, pairs: _pairs, targetHue, targetSat, targetVal,
    }));
  } catch (e) { /* storage unavailable — calibration still works this session */ }
  if (typeof _initApp === 'function') _initApp();
}

function _drawCenterMessage(msg, col, sub) {
  push();
  textAlign(CENTER, CENTER);
  fill(col);
  textSize(22);
  text(msg, width / 2, height / 2 - 12);
  if (sub) { fill(255, 255, 255, 180); textSize(14); text(sub, width / 2, height / 2 + 16); }
  pop();
}

// ── applyHomography(H, {x,y}) -> {x,y} ──
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

// ── Same compact normalized-DLT solver as HandCaliManager.js ──
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
