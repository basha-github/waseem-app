// ═══════════════════════════════════════════════════════════════
//  main.js — My Music: Finger/Touch Instrument Poster (browser port)
//
//  Browser port of HandCaliManager.js + MyMusic.js (p5.js + ml5
//  handPose), now vanilla JS + Canvas2D + MediaPipe tasks-vision.
//  Same behaviour as the original:
//    • 9-dot auto calibration — hold your index fingertip still over
//      each pulsing dot for 2 seconds (mouse/touch click also works).
//    • Point at (or hover the mouse over, or touch) an instrument on
//      the poster to play it — no click needed, just proximity, exactly
//      like the original (mouse position is hit-tested every frame).
//    • Press R any time to recalibrate.
// ═══════════════════════════════════════════════════════════════
import { HandTracker } from "./handTracker.js";
import { calStorageKey, getInputMode } from "/shared/inputConfig.js";

// ── IR pen vs. hand wording ────────────────────────────────────────
// Calibration works the same for both; only the on-screen copy differs.
const PEN = getInputMode() !== "hand";
const T = (pen, hand) => (PEN ? pen : hand);
function penifyOverlay() {
  if (!PEN) return;
  const root = document.getElementById("overlay");
  if (!root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes) {
    n.nodeValue = n.nodeValue
      .replace(/on-device hand tracking/gi, "IR-webcam pen tracking")
      .replace(/Hold your fingertip still over/gi, "Touch the IR pen tip to the wall and hold it still over")
      .replace(/Point at \(or click\/tap\)/gi, "Point the IR pen at (or click/tap)")
      .replace(/\bPoint at\b/g, "Point the IR pen at")
      .replace(/\bindex finger\b/gi, "IR pen")
      .replace(/\bfingertip\b/gi, "pen tip")
      .replace(/\bfinger\b/gi, "IR pen");
  }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", penifyOverlay);
else penifyOverlay();
import { computeHomography, applyHomography } from "./homography.js";
import { MusicPoster, BASE_W, BASE_H } from "./musicPoster.js";

// ── Calibration constants (identical values to HandCaliManager.js) ──
const GRID_COLS = 3, GRID_ROWS = 3;
const DOT_R = 22;
const CAM_W = 640, CAM_H = 480;

const CAL_DWELL_MS = 2000;
const CAL_STILL_CAM = 40;
const CAL_RELEASE_CAM = 20;

const CAL_STORAGE_KEY = calStorageKey(); // separate calibration for IR pen vs. hand

const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const now = () => performance.now();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function saveCalibration(H, pairs) {
  try {
    localStorage.setItem(CAL_STORAGE_KEY, JSON.stringify({ homography: H, pairs }));
  } catch (e) {
    console.warn("[warn] could not save calibration:", e);
  }
}

function loadCalibration() {
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

function clearCalibration() {
  localStorage.removeItem(CAL_STORAGE_KEY);
}

function exportCalibrationJson(H, pairs) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const blob = new Blob(
    [JSON.stringify({ timestamp: ts, homography: H, pairs }, null, 2)],
    { type: "application/json" }
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `finger_calibration_${ts}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

class App {
  constructor(canvas, statusEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.statusEl = statusEl;
    this.dpr = window.devicePixelRatio || 1;

    this.poster = new MusicPoster();

    this.resize();
    window.addEventListener("resize", () => this.resize());

    // Continuous pointer tracking — the original hit-tests mouseX/mouseY
    // every single frame regardless of button state, so hovering (no
    // click needed) is enough to trigger an instrument. We track pointer
    // position the same way; it only moves for touch while the finger is
    // actually down (an inherent touchscreen limitation vs. a mouse).
    this.mouseX = -1;
    this.mouseY = -1;

    const posFromEvent = e => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };

    canvas.addEventListener("pointermove", e => {
      [this.mouseX, this.mouseY] = posFromEvent(e);
    });
    canvas.addEventListener("pointerdown", e => {
      [this.mouseX, this.mouseY] = posFromEvent(e);
      if (this.appMode === "calibration") this.onClick(this.mouseX, this.mouseY);
      e.preventDefault();
    });
    canvas.addEventListener("pointerleave", () => {
      this.mouseX = -1; this.mouseY = -1;
    });
    canvas.style.touchAction = "none";

    // Calibration helpers: Space/Enter = capture now, N = skip dot, B = back one dot
    window.addEventListener("keydown", e => {
      if (this.appMode !== "calibration" || this.calDone || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (this.hand.finger_x >= 0 && this.hand.finger_y >= 0) this.recordPoint();
      } else if (e.key === "n" || e.key === "N") {
        this.dotStatus[this.activeIdx] = "skipped";
        this.calDwellStart = 0; this.calDwellProg = 0; this.calLastCapX = -1; this.calLastCapY = -1;
        this.activeIdx += 1;
        if (this.activeIdx >= this.calGrid.length) this.finishCal(); else this.dotStatus[this.activeIdx] = "active";
      } else if ((e.key === "b" || e.key === "B") && this.activeIdx > 0) {
        this.dotStatus[this.activeIdx] = "pending";
        this.activeIdx -= 1;
        if (this.dotStatus[this.activeIdx] === "confirmed") this.pairs.pop();
        this.dotStatus[this.activeIdx] = "active";
        this.calDwellStart = 0; this.calDwellProg = 0; this.calLastCapX = -1; this.calLastCapY = -1;
      }
    });
    window.addEventListener("keydown", e => {
      if ((e.key === "r" || e.key === "R") && this.appMode === "app") {
        clearCalibration();
        this.appMode = "calibration";
        this.buildGrid();
      }
      if (e.key === "Escape") this.paused = !this.paused;
    });

    this.fingerScreenX = -1;
    this.fingerScreenY = -1;

    this.pulse = 0;
    this.flashRings = [];
    this.noFingerWarning = 0;
    this.paused = false;

    this.calGrid = [];
    this.dotStatus = [];
    this.activeIdx = 0;
    this.pairs = [];
    this.calDone = false;
    this.calH = null;
    this.calDwellStart = 0;
    this.calDwellProg = 0;
    this.calAnchorX = -1;
    this.calAnchorY = -1;
    this.calLastCapX = -1;
    this.calLastCapY = -1;
    this.calLostSince = 0;
    this.autoStartAt = 0;

    // (was reset to 1 here, AFTER resize() had computed it — the poster never scaled to the screen)
    this.layoutPoster();

    this.appMode = "loading";
    this.hand = new HandTracker({ camW: CAM_W, camH: CAM_H });
  }

  async start() {
    try {
      await this.hand.init(msg => this.setStatus(msg));
    } catch (e) {
      this.setStatus(
        "⚠️ " + (e && e.message ? e.message : "Camera/model failed to start") +
        " — check camera permission and reload."
      );
      return;
    }
    this.setStatus("");

    const { H, pairs } = loadCalibration();
    if (H) {
      this.calH = H;
      this.pairs = pairs || [];
      this.appMode = "app";
    } else {
      this.appMode = "calibration";
      this.buildGrid();
    }

    requestAnimationFrame(() => this.loop());
  }

  setStatus(msg) {
    if (this.statusEl) this.statusEl.textContent = msg;
  }

  resize() {
    // Fill the whole wall: the poster is scaled to fit (layoutPoster), so
    // every instrument stays visible and as big as the screen allows.
    this.width = Math.floor(window.innerWidth);
    this.height = Math.floor(window.innerHeight);
    this.canvas.style.width = this.width + "px";
    this.canvas.style.height = this.height + "px";
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.layoutPoster();
    if (this.appMode === "calibration" && this.calGrid.length) this.buildGrid();
  }

  // The poster + hotspots are hand-authored at a fixed 1400x700, so
  // instead of stretching the canvas, draw the whole scene as one
  // uniformly-scaled, letterboxed block and convert click/finger
  // positions back into 1400x700 "poster space" before hit-testing.
  layoutPoster() {
    this.posterScale = Math.min(this.width / BASE_W, this.height / BASE_H);
    this.padX = (this.width - BASE_W * this.posterScale) / 2;
    this.padY = (this.height - BASE_H * this.posterScale) / 2;
  }

  // Resolution-independent calibration: calH maps camera-pixel -> normalized (0-1)
  // screen space, so mapPoint() rescales to THIS device/app's current canvas size.
  mapPoint(camPt) {
    if (!this.calH) return null;
    const n = applyHomography(this.calH, camPt);
    if (!n) return [-99999, -99999]; // unmappable point → off-screen (never crash the draw loop)
    // Calibration is stored as 0-1 of the WHOLE window (see /calibrate/);
    // shift it onto this canvas, which sits inside the page layout.
    const r = this.canvas.getBoundingClientRect();
    return [n[0] * window.innerWidth - r.left, n[1] * window.innerHeight - r.top];
  }

  // canvas px -> 0-1 of the whole window (how calibrations are stored)
  toWindowNorm([x, y]) {
    const r = this.canvas.getBoundingClientRect();
    return [(x + r.left) / window.innerWidth, (y + r.top) / window.innerHeight];
  }

  buildGrid() {
    this.calGrid = [];
    this.dotStatus = [];
    const PAD = 150;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const extraX = c === 0 ? 100 : 0;
        const x = PAD + (this.width - 2 * PAD) * (c / (GRID_COLS - 1)) + extraX;
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
    this.flashRings = [];
    this.calDwellStart = 0;
    this.calDwellProg = 0;
    this.autoStartAt = 0;
    this.calAnchorX = -1;
    this.calAnchorY = -1;
    this.calLastCapX = -1;
    this.calLastCapY = -1;
  }

  // ── calibration dwell-capture ─────────────────────────────────────────
  updateDwell() {
    if (this.calDone) return;
    const fx = this.hand.finger_x, fy = this.hand.finger_y;
    if (fx < 0 || fy < 0) {
      if (!this.calLostSince) this.calLostSince = now();
      const lostFor = now() - this.calLostSince;
      // pen off the wall for a moment -> the last capture is released
      if (lostFor > 250) { this.calLastCapX = -1; this.calLastCapY = -1; }
      // brief dropout while holding: keep the hold alive (progress frozen)
      if (this.calDwellStart !== 0 && lostFor <= 600) return;
      this.calDwellStart = 0;
      this.calDwellProg = 0;
      return;
    }
    if (this.calLostSince && this.calDwellStart !== 0) this.calDwellStart += now() - this.calLostSince;
    this.calLostSince = 0;
    if (this.calLastCapX >= 0 && dist(fx, fy, this.calLastCapX, this.calLastCapY) < CAL_RELEASE_CAM) {
      this.calDwellStart = 0;
      this.calDwellProg = 0;
      return;
    }
    if (this.calDwellStart === 0) {
      this.calAnchorX = fx; this.calAnchorY = fy;
      this.calDwellStart = now();
      this.calDwellProg = 0;
      return;
    }
    if (dist(fx, fy, this.calAnchorX, this.calAnchorY) <= CAL_STILL_CAM) {
      this.calDwellProg = clamp((now() - this.calDwellStart) / CAL_DWELL_MS, 0, 1);
      if (this.calDwellProg >= 1) {
        this.calLastCapX = fx; this.calLastCapY = fy;
        this.recordPoint();
      }
    } else {
      this.calAnchorX = fx; this.calAnchorY = fy;
      this.calDwellStart = now();
      this.calDwellProg = 0;
    }
  }

  recordPoint() {
    const dot = this.calGrid[this.activeIdx];
    this.pairs.push({ proj: [dot.x, dot.y], cam: [this.hand.finger_x, this.hand.finger_y] });
    this.dotStatus[this.activeIdx] = "confirmed";
    this.flashRings.push({ x: dot.x, y: dot.y, r: DOT_R, alpha: 255 });
    this.calDwellStart = 0;
    this.calDwellProg = 0;
    this.activeIdx += 1;
    if (this.activeIdx >= this.calGrid.length) {
      this.finishCal();
    } else {
      this.dotStatus[this.activeIdx] = "active";
    }
  }

  finishCal() {
    this.calDone = true;
    this.calDwellStart = 0;
    this.calDwellProg = 0;
    if (this.pairs.length < 4) {
      this.calH = null;
      return;
    }
    this.calH = computeHomography(
      this.pairs.map(p => ({ cam: p.cam, proj: this.toWindowNorm(p.proj) }))
    );
    if (this.calH) {
      saveCalibration(this.calH, this.pairs);
      this.autoStartAt = now() + 1500;
    }
  }

  overBtn(mx, my, cx, cy, w, h) {
    return cx - w / 2 <= mx && mx <= cx + w / 2 && cy - h / 2 <= my && my <= cy + h / 2;
  }

  onClick(mx, my) {
    if (this.appMode !== "calibration") return;
    if (this.calDone) {
      if (this.calH && this.overBtn(mx, my, this.width / 2, this.height / 2 + 120, 220, 48)) {
        this.appMode = "app";
        return;
      }
      if (this.calH && this.overBtn(mx, my, this.width / 2, this.height / 2 + 178, 220, 48)) {
        exportCalibrationJson(this.calH, this.pairs);
        return;
      }
      if (this.overBtn(mx, my, this.width / 2, this.height / 2 + 236, 220, 48)) {
        clearCalibration();
        this.buildGrid();
        return;
      }
      return;
    }
    if (this.hand.finger_x < 0 || this.hand.finger_y < 0) {
      this.noFingerWarning = 90;
      return;
    }
    this.recordPoint();
  }

  // ── drawing helpers ────────────────────────────────────────────────
  text(s, x, y, font, color, align = "center", baseline = "middle") {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  alphaCircle(rgba, cx, cy, r) {
    if (r <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = rgba;
    ctx.fill();
    ctx.restore();
  }

  alphaRing(rgba, cx, cy, r, width) {
    if (r <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = rgba;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
  }

  drawButton(cx, cy, w, h, label, col, hov) {
    const isHover = this.overBtn(this.mouseX, this.mouseY, cx, cy, w, h);
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = isHover ? hov : col;
    const r = 10;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 + r, cy - h / 2);
    ctx.arcTo(cx + w / 2, cy - h / 2, cx + w / 2, cy + h / 2, r);
    ctx.arcTo(cx + w / 2, cy + h / 2, cx - w / 2, cy + h / 2, r);
    ctx.arcTo(cx - w / 2, cy + h / 2, cx - w / 2, cy - h / 2, r);
    ctx.arcTo(cx - w / 2, cy - h / 2, cx + w / 2, cy - h / 2, r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    this.text(label, cx, cy, "16px Arial", "#fff");
  }

  drawDot(pt, status, idx) {
    const { x, y } = pt;
    if (status === "active") {
      const p2 = Math.sin(this.pulse) * 0.5 + 0.5;
      this.alphaCircle(`rgba(255,80,140,${(18 + p2 * 22) / 255})`, x, y, DOT_R * 2.75);
      this.alphaRing(`rgba(255,80,140,${(100 + p2 * 120) / 255})`, x, y, DOT_R + 5 + p2 * 6, 2);
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
      ctx.fillStyle = "rgb(255,80,140)"; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#fff"; ctx.fill();
      ctx.restore();
      this.text("HOLD", x, y + DOT_R + 15, "13px Arial", "rgb(255,200,220)");
      this.text(`${idx + 1} / ${this.calGrid.length}`, x, y - DOT_R - 15, "11px Arial", "rgb(160,140,160)");
    } else if (status === "confirmed") {
      this.alphaCircle("rgba(62,207,140,0.12)", x, y, DOT_R * 1.75);
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgb(62,207,140)"; ctx.lineWidth = 2; ctx.stroke();
      const s = DOT_R * 0.45;
      ctx.beginPath();
      ctx.moveTo(x - s, y);
      ctx.lineTo(x - s * 0.2, y + s);
      ctx.lineTo(x + s, y - s * 0.75);
      ctx.strokeStyle = "rgb(62,220,140)"; ctx.lineWidth = 3;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
      this.text(String(idx + 1), x, y + DOT_R + 12, "11px Arial", "rgb(62,200,140)");
    } else {
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgb(80,80,100)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgb(100,100,120)"; ctx.fill();
      ctx.restore();
      this.text(String(idx + 1), x, y + DOT_R + 12, "11px Arial", "rgb(120,120,140)");
    }
  }

  // ── calibration screen ───────────────────────────────────────────────
  drawCalibration() {
    const ctx = this.ctx;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, this.width, this.height);
    this.pulse += 0.06;
    if (this.noFingerWarning > 0) this.noFingerWarning -= 1;

    for (let i = this.flashRings.length - 1; i >= 0; i--) {
      const f = this.flashRings[i];
      this.alphaRing(`rgba(62,207,140,${Math.max(0, f.alpha) / 255})`, f.x, f.y, f.r, 2);
      f.r += 4;
      f.alpha -= 12;
      if (f.alpha <= 0) this.flashRings.splice(i, 1);
    }

    if (!this.calDone) {
      this.updateDwell();
      this.calGrid.forEach((pt, i) => this.drawDot(pt, this.dotStatus[i], i));

      if (this.calDwellProg > 0 && this.activeIdx < this.calGrid.length) {
        const ad = this.calGrid[this.activeIdx];
        const radius = DOT_R + 15;
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + this.calDwellProg * 2 * Math.PI;
        if (endAngle - startAngle > 0.01) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(ad.x, ad.y, radius, startAngle, endAngle);
          ctx.strokeStyle = "rgb(62,207,140)";
          ctx.lineWidth = 6;
          ctx.stroke();
          ctx.restore();
        }
        const secs = Math.ceil((1 - this.calDwellProg) * (CAL_DWELL_MS / 1000));
        this.text(`${secs}s`, ad.x, ad.y - DOT_R - 26, "13px Arial", "rgb(62,207,140)");
      }

      const fx = this.hand.finger_x, fy = this.hand.finger_y;
      if (fx >= 0) {
        const sx = fx * (this.width / CAM_W);
        const sy = fy * (this.height / CAM_H);
        ctx.save();
        ctx.strokeStyle = "rgb(255,80,140)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx - 22, sy); ctx.lineTo(sx + 22, sy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx, sy - 22); ctx.lineTo(sx, sy + 22); ctx.stroke();
        const t = now() / 1000;
        const p2 = 0.7 + (Math.sin(t * 4) * 0.5 + 0.5) * 0.6;
        ctx.beginPath(); ctx.arc(sx, sy, 23 * p2, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        ctx.fillStyle = "rgb(255,80,140)"; ctx.fill();
        ctx.restore();
        this.text(T("IR PEN", "INDEX FINGER"), sx, sy - 28, "11px Arial", "#fff");
      }

      ctx.save();
      ctx.fillStyle = "rgba(24,24,32,0.9)";
      ctx.fillRect(0, 0, this.width, 76);
      ctx.strokeStyle = "rgb(60,60,80)";
      ctx.beginPath(); ctx.moveTo(0, 76); ctx.lineTo(this.width, 76); ctx.stroke();
      ctx.restore();

      this.text(
        T("AUTO CALIBRATION — touch the IR pen to the pulsing dot and hold it STILL for 2 seconds", "AUTO CALIBRATION — point at the pulsing dot and hold your finger STILL for 2 seconds"),
        this.width / 2, 22, "15px Arial", "rgb(200,200,220)"
      );

      if (this.noFingerWarning > 0) {
        this.text(T("IR pen not detected — press the pen tip on the wall (Shift+D shows the camera view)", "Index finger not detected — hold your hand up so it is fully in frame"),
          this.width / 2, 52, "13px Arial", "rgb(220,60,60)");
      } else if (fx >= 0) {
        let msg;
        if (this.calDwellProg > 0) {
          msg = `holding…  ${Math.round(this.calDwellProg * 100)}%  —  keep ${T("the pen", "your finger")} still`;
        } else if (this.calLastCapX >= 0 && dist(fx, fy, this.calLastCapX, this.calLastCapY) < CAL_RELEASE_CAM) {
          msg = "captured — now move to the next pulsing dot";
        } else {
          msg = T("IR pen detected — touch the pulsing dot and hold still to capture", "finger detected — point at the pulsing dot and hold still to capture");
        }
        this.text(msg, this.width / 2, 52, "13px Arial", "rgb(62,207,140)");
      } else {
        this.text(T("IR pen not detected — press the pen tip on the wall (Shift+D shows the camera view)", "finger not detected — raise your hand so your index finger is in frame"),
          this.width / 2, 52, "13px Arial", "rgb(220,160,30)");
      }

      const countText = `dot ${Math.min(this.activeIdx + 1, this.calGrid.length)} / ${this.calGrid.length}   recorded: ${this.pairs.length}`;
      this.text(countText, this.width - 16, 52, "11px Arial", "rgb(120,120,150)", "right");
    } else {
      this.drawResults();
    }
  }

  drawResults() {
    const ok = this.calH !== null;
    if (ok && this.autoStartAt && now() >= this.autoStartAt) {
      this.autoStartAt = 0;
      this.appMode = "app";
      return;
    }

    const titleColor = ok ? "rgb(62,207,140)" : "rgb(220,60,60)";
    const title = ok ? "Calibration Complete" : "Calibration Failed";
    this.text(title, this.width / 2, this.height / 2 - 110, "bold 30px Arial", titleColor);
    this.text(`${this.pairs.length} points recorded   (minimum 4 needed)`,
      this.width / 2, this.height / 2 - 65, "13px Arial", "rgb(150,150,180)");

    if (ok) {
      const errs = this.pairs.map(p => {
        const [mx, my] = this.mapPoint(p.cam);
        return dist(mx, my, p.proj[0], p.proj[1]);
      });
      const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
      let q;
      if (mean < 2) q = "EXCELLENT";
      else if (mean < 5) q = "GOOD";
      else if (mean < 10) q = "ACCEPTABLE";
      else q = "POOR — recalibrate";
      const col = mean < 10 ? "rgb(62,207,140)" : "rgb(220,60,60)";
      this.text(`Mean error: ${mean.toFixed(2)} px  —  ${q}`,
        this.width / 2, this.height / 2 - 25, "15px Arial", col);

      const ctx = this.ctx;
      for (const p of this.pairs) {
        const [mx, my] = this.mapPoint(p.cam);
        ctx.save();
        ctx.beginPath(); ctx.arc(p.proj[0], p.proj[1], 10, 0, Math.PI * 2);
        ctx.strokeStyle = "rgb(80,140,255)"; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2);
        ctx.fillStyle = "rgb(255,80,80)"; ctx.fill();
        ctx.beginPath(); ctx.moveTo(p.proj[0], p.proj[1]); ctx.lineTo(mx, my);
        ctx.strokeStyle = "rgb(200,60,60)"; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
      }

      const secsLeft = this.autoStartAt ? Math.max(0, Math.ceil((this.autoStartAt - now()) / 1000)) : 0;
      const msg = this.autoStartAt
        ? `Calibration saved — starting app in ${secsLeft}s...`
        : "Calibration saved — will reload automatically next session";
      this.text(msg, this.width / 2, this.height / 2 + 68, "11px Arial", "rgb(100,100,130)");

      this.drawButton(this.width / 2, this.height / 2 + 120, 220, 48, "Start App", "rgb(124,60,220)", "rgb(150,80,255)");
      this.drawButton(this.width / 2, this.height / 2 + 178, 220, 48, "Save Calibration Copy", "rgb(30,100,180)", "rgb(40,130,220)");
    }
    this.drawButton(this.width / 2, this.height / 2 + 236, 220, 48, "Recalibrate", "rgb(180,40,40)", "rgb(220,60,60)");
  }

  // ── map fingertip (camera space) -> canvas space ───────────────────────
  updateFingerScreenPos() {
    const fingerOk = this.hand.finger_x >= 0 && this.hand.finger_conf > 0.01;
    if (!fingerOk) { this.fingerScreenX = -1; this.fingerScreenY = -1; return; }

    let mx, my;
    if (this.calH) {
      [mx, my] = this.mapPoint([this.hand.finger_x, this.hand.finger_y]);
    } else {
      mx = this.hand.finger_x * (this.width / CAM_W);
      my = this.hand.finger_y * (this.height / CAM_H);
    }
    const OFF = 40;
    if (mx < -OFF || my < -OFF || mx > this.width + OFF || my > this.height + OFF) {
      this.fingerScreenX = -1;
      this.fingerScreenY = -1;
    } else {
      this.fingerScreenX = clamp(mx, 0, this.width);
      this.fingerScreenY = clamp(my, 0, this.height);
    }
  }

  // ── main app screen ───────────────────────────────────────────────────
  drawApp() {
    const ctx = this.ctx;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.translate(this.padX, this.padY);
    ctx.scale(this.posterScale, this.posterScale);
    this.poster.draw(ctx);
    ctx.restore();

    // Hover-to-play: hit-test the mouse position every frame (no click
    // needed), and the fingertip too, exactly like the original.
    if (this.mouseX >= 0) {
      this.poster.handlePress((this.mouseX - this.padX) / this.posterScale, (this.mouseY - this.padY) / this.posterScale);
    }

    this.updateFingerScreenPos();
    if (this.fingerScreenX >= 0) {
      this.poster.handlePress((this.fingerScreenX - this.padX) / this.posterScale, (this.fingerScreenY - this.padY) / this.posterScale);
    }

    if (this.fingerScreenX >= 0) {
      this.alphaCircle("rgba(255,105,180,0.353)", this.fingerScreenX, this.fingerScreenY, 40);
      this.alphaCircle("rgba(255,105,180,1)", this.fingerScreenX, this.fingerScreenY, 22);
      this.alphaCircle("rgba(255,255,255,1)", this.fingerScreenX, this.fingerScreenY, 6);
    }

    this.text("Press R to recalibrate", this.width - 12, this.height - 12,
      "11px Arial", "rgba(255,255,255,0.6)", "right", "bottom");
  }

  drawPaused() {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(20,20,30,0.85)";
    ctx.fillRect(0, 0, this.width, this.height);
    this.text("Paused", this.width / 2, this.height / 2 - 16, "bold 28px Arial", "#fff");
    this.text("Press Esc to resume", this.width / 2, this.height / 2 + 20, "14px Arial", "#ccc");
  }

  loop() {
    if (!this.paused) {
      this.hand.update();
      if (this.appMode === "calibration") this.drawCalibration();
      else if (this.appMode === "app") this.drawApp();
    } else {
      this.drawPaused();
    }
    requestAnimationFrame(() => this.loop());
  }
}

async function main() {
  const canvas = document.getElementById("stage");
  const statusEl = document.getElementById("status");
  const startBtn = document.getElementById("startBtn");
  const overlay = document.getElementById("overlay");

  async function boot() {
    startBtn.disabled = true;
    startBtn.textContent = "Starting…";
    const app = new App(canvas, statusEl);
    await app.start();
    if (!app.hand.error) {
      overlay.style.display = "none";
    } else {
      startBtn.disabled = false;
      startBtn.textContent = "Try again";
    }
  }

  startBtn.addEventListener("click", boot);
  // Auto-start as soon as the page loads — once calibrated, switching
  // between wall apps should never require an extra click.
  boot();
}

main();
