// ═══════════════════════════════════════════════════════════════
//  shared/calibrationBootstrap.js
//
//  One reusable "get the webcam running and the wall calibrated" flow.
//  wall-alphabets / animals / fruit-slash / music / piano each keep
//  their own original, self-contained copy of this same logic (so as
//  not to touch working code) — newer apps (colorquest, colorquiz, and
//  anything added after them) use this shared version instead.
//
//  Usage from an app's own js/main.js:
//
//    import { HandTracker } from "/shared/handTracker.js";
//    import { applyHomography } from "/shared/homography.js";
//    import { runWallBootstrap, clearCalibration } from "/shared/calibrationBootstrap.js";
//
//    runWallBootstrap({
//      startBtn, statusEl, overlayEl, calStageEl,
//      onReady(hand, calH) { ...start your game loop, using
//        applyHomography(calH, [hand.finger_x, hand.finger_y])
//        each frame to get a normalized (0-1) screen point... },
//    });
//
//    window.addEventListener("keydown", e => {
//      if (e.key === "r" || e.key === "R") { clearCalibration(); location.reload(); }
//    });
//
//  All apps share the SAME localStorage key, so calibrating in any one
//  of them makes every other app skip straight to onReady().
// ═══════════════════════════════════════════════════════════════
import { computeHomography } from "./homography.js";
import { calStorageKey, createTracker, getInputMode } from "./inputConfig.js";

const CAM_W = 640, CAM_H = 480;
const GRID_COLS = 3, GRID_ROWS = 3;
const DOT_R = 22;

const CAL_DWELL_MS = 2000;
const CAL_STILL_CAM = 40;     // px the pen may wobble (camera px) and still count as "holding still"
const CAL_RELEASE_CAM = 65;   // px the pen must travel from the last capture... unless it was lifted
const CAL_DROP_MS = 600;      // a dropout shorter than this does NOT restart the 2 s hold
const CAL_LIFT_MS = 250;      // ...lifting the pen off the wall this long also releases it

// "wallSharedCalibration" in hand mode, "wallSharedCalibrationIR" in IR-pen mode
// (see shared/inputConfig.js) — a calibration only fits the device it was captured with.
export const CAL_STORAGE_KEY = calStorageKey();

const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const now = () => performance.now();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Phones/tablets have no wall-mounted camera to calibrate a fingertip
// against — every app that uses this bootstrap already has a native
// mouse/touch/click fallback underneath the hand-tracking layer (that's
// what the "Continue without a camera" link exercises), so on a
// touch+narrow device we skip straight to that instead of ever showing
// the camera prompt or the 9-dot calibration screen.
function isMobileDevice() {
  try {
    return matchMedia("(pointer: coarse)").matches && window.innerWidth <= 820;
  } catch (e) {
    return false;
  }
}

export function saveCalibration(H, pairs) {
  try {
    localStorage.setItem(CAL_STORAGE_KEY, JSON.stringify({ homography: H, pairs }));
  } catch (e) {
    console.warn("[warn] could not save calibration:", e);
  }
}

export function loadCalibration() {
  try {
    const raw = localStorage.getItem(CAL_STORAGE_KEY);
    if (!raw) return { H: null, pairs: null };
    const data = JSON.parse(raw);
    if (!data.homography) return { H: null, pairs: null };
    return { H: data.homography, pairs: data.pairs || [] };
  } catch (e) {
    return { H: null, pairs: null };
  }
}

export function clearCalibration() {
  try {
    localStorage.removeItem(CAL_STORAGE_KEY);
  } catch (e) { /* ignore */ }
}

// In IR-pen mode the start-overlay copy ("point your finger…") is reworded on the
// fly, so none of the ~60 app pages need their instructions edited by hand.
function penifyOverlayText(root) {
  if (!root || getInputMode() !== "irpen") return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const t = n.nodeValue;
    if (!/finger/i.test(t)) continue;
    n.nodeValue = t
      .replace(/\bindex finger\b/gi, "IR pen")
      .replace(/\bfingertip\b/gi, "pen tip")
      .replace(/\bfinger\b/gi, "IR pen")
      .replace(/\bhand\b/gi, "pen");
  }
}

// ── tiny canvas drawing helpers ─────────────────────────────────────
function text(ctx, s, x, y, font, color, align = "center", baseline = "middle") {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(s, x, y);
  ctx.restore();
}
function alphaCircle(ctx, rgba, cx, cy, r) {
  if (r <= 0) return;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = rgba; ctx.fill();
  ctx.restore();
}
function alphaRing(ctx, rgba, cx, cy, r, width) {
  if (r <= 0) return;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = rgba; ctx.lineWidth = width; ctx.stroke();
  ctx.restore();
}

class Calibrator {
  constructor(canvas, statusEl, hand, onDone) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.statusEl = statusEl;
    this.onDone = onDone;
    this.dpr = window.devicePixelRatio || 1;

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.resize();
    window.addEventListener("resize", () => this.resize());

    canvas.addEventListener("click", () => {
      if (this.calDone) return;
      this.recordPoint();
    });

    // Manual helpers for a dot that won't auto-capture:
    //   Space / Enter = capture the dot NOW at the pen's current position
    //   N             = skip this dot (need at least 4 captured dots overall)
    //   B             = go back one dot and redo it
    window.addEventListener("keydown", e => {
      if (this.calDone || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); this.recordPoint(); }
      else if (e.key === "n" || e.key === "N") this.skipPoint();
      else if (e.key === "b" || e.key === "B") this.backPoint();
    });

    this.hand = hand; // shared, already-initialized tracker (HandTracker or IRPenTracker)
    this.isPen = hand.inputName === "pen";

    this.calGrid = []; this.dotStatus = []; this.activeIdx = 0; this.pairs = [];
    this.calH = null; this.calDone = false;
    this.calDwellStart = 0; this.calDwellProg = 0;
    this.calAnchorX = -1; this.calAnchorY = -1;
    this.calLastCapX = -1; this.calLastCapY = -1;
    this.flashRings = [];
    this.pulse = 0;
    this.dbgCount = { lost: 0, moved: 0 };
    this.calWhy = "-";
    this.calLostSince = 0;
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.style.width = this.width + "px";
    this.canvas.style.height = this.height + "px";
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  setStatus(msg) {
    if (this.statusEl) this.statusEl.textContent = msg;
  }

  buildGrid() {
    this.calGrid = []; this.dotStatus = [];
    const PAD = 150;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const x = PAD + (this.width - 2 * PAD) * (c / (GRID_COLS - 1));
        const y = PAD + (this.height - 2 * PAD) * (r / (GRID_ROWS - 1));
        this.calGrid.push({ x, y });
        this.dotStatus.push("pending");
      }
    }
    this.activeIdx = 0;
    this.dotStatus[0] = "active";
    this.pairs = [];
    this.calH = null;
    this.calDone = false;
  }

  start() {
    this.buildGrid();
    this.loop();
  }

  updateDwell() {
    if (this.calDone) return;
    const fx = this.hand.finger_x, fy = this.hand.finger_y;
    if (fx < 0 || fy < 0) {
      if (!this.calLostSince) this.calLostSince = now();
      const lostFor = now() - this.calLostSince;
      // pen off the wall for a moment → the last capture is "released"
      if (lostFor > CAL_LIFT_MS) { this.calLastCapX = -1; this.calLastCapY = -1; }
      // brief dropout while holding: keep the hold alive (progress frozen), only restart if it lasts
      if (this.calDwellStart !== 0 && lostFor <= CAL_DROP_MS) return;
      if (this.calDwellStart !== 0) { this.dbgCount.lost++; this.calWhy = "pen lost " + Math.round(lostFor) + "ms"; }
      this.calDwellStart = 0; this.calDwellProg = 0; return;
    }
    if (this.calLostSince && this.calDwellStart !== 0) {
      // pen came back mid-hold: shift the timer so the dropout time isn't counted
      this.calDwellStart += now() - this.calLostSince;
    }
    this.calLostSince = 0;
    // Still resting on the dot that was just captured (never lifted, barely moved)? wait for it to leave.
    if (this.calLastCapX >= 0 && dist(fx, fy, this.calLastCapX, this.calLastCapY) < CAL_RELEASE_CAM) {
      this.calDwellStart = 0; this.calDwellProg = 0; return;
    }
    if (this.calDwellStart === 0) {
      this.calAnchorX = fx; this.calAnchorY = fy;
      this.calDwellStart = now(); this.calDwellProg = 0;
      return;
    }
    if (dist(fx, fy, this.calAnchorX, this.calAnchorY) <= CAL_STILL_CAM) {
      this.calDwellProg = clamp((now() - this.calDwellStart) / CAL_DWELL_MS, 0, 1);
      if (this.calDwellProg >= 1) {
        this.calLastCapX = fx; this.calLastCapY = fy;
        this.recordPoint();
      }
    } else {
      this.dbgCount.moved++;
      this.calWhy = "pen jumped " + Math.round(dist(fx, fy, this.calAnchorX, this.calAnchorY)) + "px";
      this.calAnchorX = fx; this.calAnchorY = fy;
      this.calDwellStart = now(); this.calDwellProg = 0;
    }
  }

  skipPoint() {
    if (this.calDone || this.activeIdx >= this.calGrid.length) return;
    this.dotStatus[this.activeIdx] = "skipped";
    this.calDwellStart = 0; this.calDwellProg = 0;
    this.calLastCapX = -1; this.calLastCapY = -1;
    this.activeIdx += 1;
    if (this.activeIdx >= this.calGrid.length) this.finishCal();
    else this.dotStatus[this.activeIdx] = "active";
  }

  backPoint() {
    if (this.calDone || this.activeIdx <= 0) return;
    this.dotStatus[this.activeIdx] = "pending";
    this.activeIdx -= 1;
    if (this.dotStatus[this.activeIdx] === "confirmed") this.pairs.pop();
    this.dotStatus[this.activeIdx] = "active";
    this.calDwellStart = 0; this.calDwellProg = 0;
    this.calLastCapX = -1; this.calLastCapY = -1;
  }

  recordPoint() {
    if (this.hand.finger_x < 0 || this.hand.finger_y < 0) return; // nothing detected — never record a fake point
    const dot = this.calGrid[this.activeIdx];
    const fx = this.hand.finger_x;
    const fy = this.hand.finger_y;
    this.pairs.push({ proj: [dot.x, dot.y], cam: [fx, fy] });
    this.dotStatus[this.activeIdx] = "confirmed";
    this.flashRings.push({ x: dot.x, y: dot.y, r: DOT_R, alpha: 255 });
    this.calDwellStart = 0; this.calDwellProg = 0;
    this.activeIdx += 1;
    if (this.activeIdx >= this.calGrid.length) this.finishCal();
    else this.dotStatus[this.activeIdx] = "active";
  }

  finishCal() {
    this.calDone = true;
    if (this.pairs.length < 4) { this.calH = null; return; }
    this.calH = computeHomography(
      this.pairs.map(p => ({ cam: p.cam, proj: [p.proj[0] / this.width, p.proj[1] / this.height] }))
    );
    if (this.calH) {
      saveCalibration(this.calH, this.pairs);
      setTimeout(() => this.onDone(this.calH), 900);
    } else {
      setTimeout(() => this.buildGrid(), 1200); // not enough points — retry
    }
  }

  drawDot(pt, status, idx) {
    const { x, y } = pt;
    const ctx = this.ctx;
    if (status === "active") {
      const p2 = Math.sin(this.pulse) * 0.5 + 0.5;
      alphaCircle(ctx, `rgba(255,80,140,${(18 + p2 * 22) / 255})`, x, y, DOT_R * 2.75);
      alphaRing(ctx, `rgba(255,80,140,${(100 + p2 * 120) / 255})`, x, y, DOT_R + 5 + p2 * 6, 2);
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
      ctx.fillStyle = "rgb(255,80,140)"; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#fff"; ctx.fill();
      ctx.restore();
      text(ctx, "HOLD", x, y + DOT_R + 15, "13px Arial", "rgb(255,200,220)");
      text(ctx, `${idx + 1} / ${this.calGrid.length}`, x, y - DOT_R - 15, "11px Arial", "rgb(160,140,160)");
    } else if (status === "confirmed") {
      alphaCircle(ctx, "rgba(62,207,140,0.12)", x, y, DOT_R * 1.75);
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgb(62,207,140)"; ctx.lineWidth = 2; ctx.stroke();
      const s = DOT_R * 0.45;
      ctx.beginPath();
      ctx.moveTo(x - s, y); ctx.lineTo(x - s * 0.2, y + s); ctx.lineTo(x + s, y - s * 0.75);
      ctx.strokeStyle = "rgb(62,220,140)"; ctx.lineWidth = 3;
      ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
      ctx.restore();
    } else if (status === "skipped") {
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgb(220,160,30)"; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgb(80,80,100)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgb(100,100,120)"; ctx.fill();
      ctx.restore();
    }
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, this.width, this.height);
    this.pulse += 0.06;

    for (let i = this.flashRings.length - 1; i >= 0; i--) {
      const f = this.flashRings[i];
      alphaRing(ctx, `rgba(62,207,140,${Math.max(0, f.alpha) / 255})`, f.x, f.y, f.r, 2);
      f.r += 4; f.alpha -= 12;
      if (f.alpha <= 0) this.flashRings.splice(i, 1);
    }

    if (!this.calDone) {
      this.updateDwell();
      this.calGrid.forEach((pt, i) => this.drawDot(pt, this.dotStatus[i], i));

      if (this.calDwellProg > 0 && this.activeIdx < this.calGrid.length) {
        const ad = this.calGrid[this.activeIdx];
        const radius = DOT_R + 15;
        const start = -Math.PI / 2;
        const end = start + this.calDwellProg * 2 * Math.PI;
        ctx.save();
        ctx.beginPath(); ctx.arc(ad.x, ad.y, radius, start, end);
        ctx.strokeStyle = "rgb(62,207,140)"; ctx.lineWidth = 6; ctx.stroke();
        ctx.restore();
      }

      const fx = this.hand.finger_x, fy = this.hand.finger_y;
      if (fx >= 0) {
        const sx = fx * (this.width / CAM_W);
        const sy = fy * (this.height / CAM_H);
        ctx.save();
        ctx.strokeStyle = "rgb(255,80,140)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx - 22, sy); ctx.lineTo(sx + 22, sy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx, sy - 22); ctx.lineTo(sx, sy + 22); ctx.stroke();
        ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        ctx.fillStyle = "rgb(255,80,140)"; ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.fillStyle = "rgba(24,24,32,0.9)";
      ctx.fillRect(0, 0, this.width, 76);
      ctx.restore();
      const pen = this.isPen;
      text(ctx, pen
          ? "AUTO CALIBRATION — touch the IR pen to the pulsing dot and hold it STILL for 2 seconds"
          : "AUTO CALIBRATION — point at the pulsing dot and hold your finger STILL for 2 seconds",
        this.width / 2, 22, "15px Arial", "rgb(200,200,220)");
      if (fx >= 0) {
        const msg = this.calDwellProg > 0
          ? `holding…  ${Math.round(this.calDwellProg * 100)}%  —  keep ${pen ? "the pen" : "your finger"} still`
          : (pen ? "IR pen detected — touch the pulsing dot and hold still to capture"
                 : "finger detected — point at the pulsing dot and hold still to capture");
        text(ctx, msg, this.width / 2, 52, "13px Arial", "rgb(62,207,140)");
      } else {
        text(ctx, pen
            ? "IR pen not detected — press the pen tip on the wall (Shift+D shows the camera view)"
            : "finger not detected — raise your hand so your index finger is in frame",
          this.width / 2, 52, "13px Arial", "rgb(220,160,30)");
      }
      // live readout so a stuck dot can be diagnosed
      const dl = this.calLastCapX >= 0 && fx >= 0 ? Math.round(dist(fx, fy, this.calLastCapX, this.calLastCapY)) : "-";
      text(ctx,
        `pen cam x:${fx >= 0 ? Math.round(fx) : "-"} y:${fy >= 0 ? Math.round(fy) : "-"}   moved from last dot: ${dl}px (or lift the pen; need >${CAL_RELEASE_CAM})   hold restarts: lost ${this.dbgCount.lost} / jumped ${this.dbgCount.moved} (last: ${this.calWhy})   |   Space = capture now · N = skip dot · B = back`,
        this.width / 2, this.height - 18, "12px Arial", "rgb(120,120,140)");
    } else {
      const ok = this.calH !== null;
      text(ctx, ok ? "Calibration complete — starting…" : "Calibration failed — retrying…",
        this.width / 2, this.height / 2, "bold 26px Arial", ok ? "rgb(62,207,140)" : "rgb(220,60,60)");
    }
  }

  loop() {
    this.hand.update();
    this.draw();
    if (!this.calDone || this.calH === null) requestAnimationFrame(() => this.loop());
  }
}

/**
 * Wires up a "Start camera & begin" button: inits the webcam + hand model,
 * reuses the shared calibration if one already exists, otherwise runs the
 * 9-dot calibration screen — then calls onReady(hand, calH).
 *
 * @param {Object} opts
 * @param {HTMLButtonElement} opts.startBtn
 * @param {HTMLElement} opts.statusEl
 * @param {HTMLElement} opts.overlayEl   hidden once camera/calibration is ready
 * @param {HTMLCanvasElement} opts.calStageEl  shown only while calibrating
 * @param {(hand: HandTracker, calH: number[][]) => void} opts.onReady
 * @param {object} [opts.handTracker]  optional pre-built tracker (anything exposing
 *   init/update/finger_x/finger_y/finger_conf). Normally leave this out: the tracker
 *   is created for you — IR pen by default, MediaPipe hand with ?input=hand.
 * @param {number} [opts.maxHands=1]  how many pointers the app needs at once
 *   (2 = two hands, or two IR pens).
 */
export function runWallBootstrap({ startBtn, statusEl, overlayEl, calStageEl, onReady, handTracker, maxHands = 1 }) {
  let starting = false;
  let skipped = false; // true once the person chose to continue without a camera

  // On a phone/tablet, skip the camera + calibration flow entirely and
  // drop straight into touch/click mode.
  if (isMobileDevice()) {
    skipped = true;
    if (overlayEl) overlayEl.style.display = "none";
    if (calStageEl) calStageEl.style.display = "none";
    return;
  }

  penifyOverlayText(overlayEl);

  // Let people dismiss the overlay and use the app with a plain mouse or
  // touchscreen when there's no camera available (or they just don't want
  // to use one) — every app's own buttons/clicks already work natively,
  // hand-tracking only adds the fingertip-dwell layer on top of them.
  injectSkipLink(overlayEl, () => {
    skipped = true;
    overlayEl.style.display = "none";
    calStageEl.style.display = "none";
  });

  async function boot() {
    if (starting || skipped) return;
    starting = true;
    startBtn.disabled = true;
    startBtn.textContent = "Starting…";

    const { H } = loadCalibration();
    let hand;
    try {
      // IR pen (default) or hand tracking, per shared/inputConfig.js
      hand = handTracker || await createTracker({ camW: CAM_W, camH: CAM_H, maxHands });
      await hand.init(msg => { statusEl.textContent = msg; });
    } catch (e) {
      if (skipped) return; // person already moved on without a camera
      statusEl.textContent = "⚠️ " + (e && e.message ? e.message : "Camera/model failed to start");
      startBtn.disabled = false;
      startBtn.textContent = "Try again";
      starting = false;
      return;
    }
    if (skipped) return; // camera resolved after the person chose to skip — do nothing further

    statusEl.textContent = "";
    overlayEl.style.display = "none"; // reveal the calibration dots / game immediately — don't sit on top of them

    function finish(calH) {
      if (skipped) return;
      calStageEl.style.display = "none";
      onReady(hand, calH);
    }

    if (H) {
      finish(H); // already calibrated elsewhere on this device
    } else {
      calStageEl.style.display = "block";
      const calibrator = new Calibrator(calStageEl, statusEl, hand, calH => finish(calH));
      calibrator.start();
    }
  }

  startBtn.addEventListener("click", () => {
    starting = false; // allow a manual retry even if an auto-start attempt is stuck
    boot();
  });
  // Auto-start as soon as the page loads — once calibrated, switching
  // between wall apps should never require an extra click.
  boot();
}

/**
 * Adds a "Continue without a camera" link to the wall overlay card (once
 * per page) so the app can be dismissed and used with a plain mouse or
 * touchscreen — e.g. when testing on a machine with no webcam, or the
 * person just doesn't want to grant camera access.
 */
function injectSkipLink(overlayEl, onSkip) {
  const card = overlayEl.querySelector(".wall-overlay-card") || overlayEl;
  if (card.querySelector(".wall-skip-link")) return; // already added
  const link = document.createElement("button");
  link.type = "button";
  link.className = "wall-skip-link";
  link.textContent = "Continue without a camera (use mouse / touch)";
  link.addEventListener("click", onSkip);
  card.appendChild(link);
}
