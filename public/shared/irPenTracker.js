// ═══════════════════════════════════════════════════════════════
//  shared/irPenTracker.js — IR pen tracking from an IR webcam.
//
//  Drop-in replacement for handTracker.js / handTrackerMulti.js: it
//  exposes the SAME contract the wall's calibration + apps already use
//
//     await tracker.init(statusCb)   tracker.update()   tracker.release()
//     tracker.finger_x / finger_y / finger_conf   (camera pixels, camW x camH)
//     tracker.fingers = [{x, y, conf}, ...]       (one entry per pen in view)
//
//  so the 9-dot calibration, the homography and every app keep working
//  unchanged — the only difference is that the "fingertip" is now the
//  brightest small blob in the IR camera image (the lit pen tip).
//
//  Tuning (all remembered in localStorage, all apps share them):
//    Shift+D        live camera preview with the detected dot
//    Shift+↑ / ↓    raise / lower the brightness threshold (±5)
//    Shift+C        switch to the next camera, then reload
//
//  The pure detection code (detectBlobs) has no browser dependencies,
//  so it can be unit-tested in Node.
// ═══════════════════════════════════════════════════════════════
import { getIrSettings, saveIrSettings } from "./inputConfig.js";
import { penDomClickerUpdate } from "./penDomClicker.js";

const SMOOTH_N = 2;        // average over the last N frames (same as the hand tracker)
const GRACE_FRAMES = 10;   // hold position through brief dropouts (~0.33 s at 30 fps)
const MATCH_RADIUS = 160;  // px a pen may move between frames and stay "the same pen"

// ── pure detection ──────────────────────────────────────────────
/**
 * Finds bright blobs in an RGBA frame.
 * @returns {{blobs: {x,y,area,power}[], peak: number, threshold: number|null}}
 *   blobs are sorted strongest-first; x/y are sub-pixel centroids.
 */
export function detectBlobs(data, w, h, opts = {}, scratch = {}) {
  const {
    threshold = 220, minThreshold = 150, minArea = 3, maxArea = 2500, maxBlobs = 1,
  } = opts;
  const n = w * h;

  const gray = scratch.gray && scratch.gray.length === n ? scratch.gray : (scratch.gray = new Uint8Array(n));
  let peak = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const v = r > g ? (r > b ? r : b) : (g > b ? g : b);
    gray[i] = v;
    if (v > peak) peak = v;
  }
  if (peak < minThreshold) return { blobs: [], peak, threshold: null };

  // A dim pen still counts: never demand more than (peak - 15).
  const t = Math.max(minThreshold, Math.min(threshold, peak - 15));
  // The bright core (>= t) seeds a blob; it then grows out to the dimmer halo
  // (>= tLow) so the centroid is sub-pixel accurate and a lone hot pixel
  // (no halo) is still rejected by minArea.
  // Grow only a little below the core so a blooming/glowing pen is not counted as a huge blob.
  const tLow = Math.max(t - 35, 110);

  const visited = scratch.visited && scratch.visited.length === n ? scratch.visited : (scratch.visited = new Uint8Array(n));
  visited.fill(0);
  const stack = scratch.stack && scratch.stack.length === n ? scratch.stack : (scratch.stack = new Int32Array(n));

  const blobs = [];
  const rejected = [];
  for (let i = 0; i < n; i++) {
    if (gray[i] < t || visited[i]) continue;

    let sp = 0;
    stack[sp++] = i; visited[i] = 1;
    let area = 0, sw = 0, sx = 0, sy = 0;
    while (sp > 0) {
      const idx = stack[--sp];
      const y = (idx / w) | 0, x = idx - y * w;
      const wgt = gray[idx] - tLow + 1;
      area++; sw += wgt; sx += x * wgt; sy += y * wgt;
      if (x > 0     && !visited[idx - 1] && gray[idx - 1] >= tLow) { visited[idx - 1] = 1; stack[sp++] = idx - 1; }
      if (x < w - 1 && !visited[idx + 1] && gray[idx + 1] >= tLow) { visited[idx + 1] = 1; stack[sp++] = idx + 1; }
      if (y > 0     && !visited[idx - w] && gray[idx - w] >= tLow) { visited[idx - w] = 1; stack[sp++] = idx - w; }
      if (y < h - 1 && !visited[idx + w] && gray[idx + w] >= tLow) { visited[idx + w] = 1; stack[sp++] = idx + w; }
    }
    if (area < minArea || area > maxArea) { rejected.push(area); continue; } // noise, or a lamp / window
    blobs.push({ x: sx / sw + 0.5, y: sy / sw + 0.5, area, power: sw });
  }

  blobs.sort((a, b) => b.power - a.power);
  return { blobs: blobs.slice(0, maxBlobs), peak, threshold: t, rejected };
}

// ── tracker ─────────────────────────────────────────────────────
export class IRPenTracker {
  constructor({ camW = 640, camH = 480, maxHands = 1 } = {}) {
    this.camW = camW;
    this.camH = camH;
    this.maxPoints = Math.max(1, maxHands | 0);
    this.inputName = "pen";          // lets the UI say "IR pen" instead of "finger"

    this.finger_x = -1;
    this.finger_y = -1;
    this.finger_conf = 0;
    this.fingers = [];

    this.settings = getIrSettings();
    this.cameraLabel = "";

    this._slots = Array.from({ length: this.maxPoints }, () => null);
    this._video = null;
    this._stream = null;
    this._canvas = null;
    this._ctx = null;
    this._scratch = {};
    this._ready = false;
    this._lastVideoTime = -1;
    this._lastResult = null;
    this._keyHandler = null;
    this._dbg = null;
    this.error = null;
  }

  get ready() { return this._ready; }

  async _openStream() {
    const base = { width: { ideal: this.camW }, height: { ideal: this.camH } };
    const open = extra => navigator.mediaDevices.getUserMedia({ video: { ...base, ...extra }, audio: false });
    const curId = s => (s.getVideoTracks()[0].getSettings() || {}).deviceId;

    let stream = null;
    const saved = this.settings.cameraId;
    if (saved) {
      try { stream = await open({ deviceId: { exact: saved } }); } catch (e) { stream = null; }
    }
    if (!stream) stream = await open({});

    // No camera chosen yet: if one is labelled "IR"/"infrared" and we didn't get it, switch.
    if (!saved) {
      try {
        const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
        const ir = devs.find(d => /\b(ir|nir|infra[\s-]?red)\b/i.test(d.label));
        if (ir && ir.deviceId !== curId(stream)) {
          const alt = await open({ deviceId: { exact: ir.deviceId } }).catch(() => null);
          if (alt) { stream.getTracks().forEach(t => t.stop()); stream = alt; }
        }
      } catch (e) { /* keep the default camera */ }
    }
    return stream;
  }

  async init(statusCb = () => {}) {
    try {
      statusCb("Requesting IR webcam access…");
      this._stream = await this._openStream();
      this.cameraLabel = this._stream.getVideoTracks()[0].label || "camera";

      this._video = document.createElement("video");
      this._video.playsInline = true;
      this._video.muted = true;
      this._video.srcObject = this._stream;
      await this._video.play();

      this._canvas = document.createElement("canvas");
      this._canvas.width = this.camW;
      this._canvas.height = this.camH;
      this._ctx = this._canvas.getContext("2d", { willReadFrequently: true });

      this._installKeys();
      if (this.settings.debug) this._showDebug(true);

      this._ready = true;
      statusCb("");
    } catch (err) {
      this.error = err;
      statusCb("Could not start the IR camera: " + (err && err.message ? err.message : err));
      throw err;
    }
  }

  /** Grabs the latest frame, finds the pen dot(s), updates finger_x/y/conf + fingers[]. */
  update() {
    if (!this._ready || !this._video || this._video.readyState < 2) return;
    if (this._video.currentTime === this._lastVideoTime) return; // no new frame yet
    this._lastVideoTime = this._video.currentTime;

    this._ctx.drawImage(this._video, 0, 0, this.camW, this.camH);
    const img = this._ctx.getImageData(0, 0, this.camW, this.camH);
    const res = detectBlobs(
      img.data, this.camW, this.camH,
      { ...this.settings, maxBlobs: this.maxPoints + 2 },
      this._scratch
    );
    this._lastResult = res;

    const blobs = res.blobs.map(b => ({ ...b, x: this.settings.mirror ? this.camW - b.x : b.x }));
    const assigned = this._assign(blobs);

    this.fingers = [];
    for (let s = 0; s < this.maxPoints; s++) {
      const b = assigned[s];
      let slot = this._slots[s];
      if (b) {
        if (!slot) slot = this._slots[s] = { hist: [], x: 0, y: 0, conf: 0, lost: 0 };
        slot.hist.push([b.x, b.y]);
        if (slot.hist.length > SMOOTH_N) slot.hist.shift();
        let ax = 0, ay = 0;
        for (const p of slot.hist) { ax += p[0]; ay += p[1]; }
        slot.x = ax / slot.hist.length;
        slot.y = ay / slot.hist.length;
        slot.conf = 1;
        slot.lost = 0;
        this.fingers.push({ x: slot.x, y: slot.y, conf: 1 });
      } else if (slot) {
        slot.lost += 1;
        if (slot.lost > GRACE_FRAMES) this._slots[s] = null;
        else slot.conf *= 0.75;
      }
    }

    // Legacy single-point fields (used by calibration): primary = first pen
    // seen this frame, else the first one still inside its grace period.
    const primary = this._slots.find(s => s && s.lost === 0) || this._slots.find(s => s);
    if (primary) {
      this.finger_x = primary.x;
      this.finger_y = primary.y;
      this.finger_conf = primary.conf;
    } else {
      this.finger_x = -1;
      this.finger_y = -1;
      this.finger_conf = 0;
    }

    if (this._dbg) this._drawDebug();

    // Pen-dwell clicking for ordinary page buttons/links/cards, in every app.
    try { penDomClickerUpdate(this.finger_x, this.finger_y); } catch (e) { /* never break tracking */ }
  }

  // Keep each pen in its own slot across frames; new blobs fill free slots.
  _assign(blobs) {
    const out = new Array(this.maxPoints).fill(null);
    const used = new Set();
    for (let s = 0; s < this.maxPoints; s++) {
      const prev = this._slots[s];
      if (!prev) continue;
      let best = -1, bd = MATCH_RADIUS;
      blobs.forEach((b, i) => {
        if (used.has(i)) return;
        const d = Math.hypot(b.x - prev.x, b.y - prev.y);
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0) { out[s] = blobs[best]; used.add(best); }
    }
    for (let s = 0; s < this.maxPoints; s++) {
      // A pen that is only briefly missing keeps its slot: a bright spot far away
      // (reflection, flicker) must not take over and make the pointer jump.
      // A real move elsewhere is picked up once the grace period has run out.
      if (out[s] || this._slots[s]) continue;
      const i = blobs.findIndex((_, k) => !used.has(k));
      if (i >= 0) { out[s] = blobs[i]; used.add(i); }
    }
    return out;
  }

  release() {
    if (this._stream) this._stream.getTracks().forEach(t => t.stop());
    if (this._keyHandler) window.removeEventListener("keydown", this._keyHandler);
    this._showDebug(false);
    this._ready = false;
  }

  // ── tuning keys + preview ─────────────────────────────────────
  _installKeys() {
    if (this._keyHandler) return;
    this._keyHandler = e => {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "D") {
        const on = !this._dbg;
        this.settings.debug = on;
        saveIrSettings({ debug: on });
        this._showDebug(on);
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const d = e.key === "ArrowUp" ? 5 : -5;
        const t = Math.max(this.settings.minThreshold, Math.min(254, this.settings.threshold + d));
        this.settings.threshold = t;
        saveIrSettings({ threshold: t });
        this._toast("IR threshold " + t + (d > 0 ? "  (less sensitive)" : "  (more sensitive)"));
      } else if (e.key === "C") {
        this._cycleCamera();
      }
    };
    window.addEventListener("keydown", this._keyHandler);
  }

  async _cycleCamera() {
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
      if (devs.length < 2) { this._toast("Only one camera found"); return; }
      const cur = (this._stream.getVideoTracks()[0].getSettings() || {}).deviceId;
      const i = devs.findIndex(d => d.deviceId === cur);
      const next = devs[(i + 1) % devs.length];
      saveIrSettings({ cameraId: next.deviceId });
      this._toast("Switching to: " + (next.label || "next camera"));
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      this._toast("Could not switch camera");
    }
  }

  _toast(msg) {
    let el = document.getElementById("__irPenToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "__irPenToast";
      el.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:1000000;" +
        "background:rgba(20,25,58,.92);color:#fff;font:600 14px system-ui,sans-serif;padding:10px 16px;" +
        "border-radius:10px;pointer-events:none;box-shadow:0 6px 24px rgba(0,0,0,.4)";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.style.display = "none"; }, 1800);
  }

  _showDebug(on) {
    if (!on) {
      if (this._dbg) { this._dbg.wrap.remove(); this._dbg = null; }
      return;
    }
    if (this._dbg) return;
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:1000000;background:rgba(10,12,30,.9);" +
      "border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:6px;pointer-events:none;" +
      "font:12px/1.4 monospace;color:#cfe;";
    const cv = document.createElement("canvas");
    cv.width = 320; cv.height = 240;
    cv.style.cssText = "display:block;width:320px;height:240px;border-radius:6px;";
    const txt = document.createElement("div");
    wrap.appendChild(cv); wrap.appendChild(txt);
    document.body.appendChild(wrap);
    this._dbg = { wrap, cv, ctx: cv.getContext("2d"), txt };
  }

  _drawDebug() {
    const { ctx, txt } = this._dbg;
    ctx.drawImage(this._canvas, 0, 0, 320, 240);
    const sx = 320 / this.camW, sy = 240 / this.camH;
    ctx.lineWidth = 2;
    this.fingers.forEach(f => {
      ctx.strokeStyle = "#ff3b8d";
      ctx.beginPath(); ctx.arc(f.x * sx, f.y * sy, 12, 0, Math.PI * 2); ctx.stroke();
    });
    const r = this._lastResult || {};
    txt.textContent =
      this.cameraLabel.slice(0, 40) + "\n" +
      "peak " + (r.peak ?? "-") + "  thr " + (this.settings.threshold) +
      "  pens " + this.fingers.length +
      (r.rejected && r.rejected.length ? "\nrejected blob area(s): " + r.rejected.slice(0, 4).join(", ") : "") +
      "\nShift+D hide · Shift+↑↓ sensitivity · Shift+C camera";
    txt.style.whiteSpace = "pre";
  }
}
