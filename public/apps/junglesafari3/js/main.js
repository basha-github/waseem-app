// ═══════════════════════════════════════════════════════════════
//  main.js — Cosmic Color Quest ("Color Safari") wall bootstrap.
//
//  This app is a hybrid: three ordinary DOM buttons (Back / Say it
//  again / Next) PLUS a tap-anywhere-on-the-canvas interaction (the left
//  "spot it" orb, and the right card before it's revealed) that
//  ColorSafari.js handles itself inside mousePressed() by checking
//  whether mouseX/mouseY fall inside its own leftRect/rightRect.
//
//  So the fingertip bridge here does two things every frame:
//   1. If the fingertip is dwelling over a real DOM button, click it
//      (same generic approach as Cosmic Color Quiz).
//   2. Otherwise, if it's dwelling over the canvas itself, dispatch a
//      synthetic mouse click at that point — p5.js's own mousedown
//      listener on the canvas picks it up, sets mouseX/mouseY, and
//      calls the sketch's existing mousePressed() exactly as if it
//      were a real click. No changes to ColorSafari.js were needed.
//
//  Shares the same wallSharedCalibration as every other app.
// ═══════════════════════════════════════════════════════════════
import { applyHomography } from "/shared/homography.js";
import { runWallBootstrap, clearCalibration } from "/shared/calibrationBootstrap.js";

const DWELL_MS = 700;          // hold time over a DOM button
const CANVAS_DWELL_MS = 900;   // hold time over a bare canvas region (a touch longer — avoids accidental re-reveals while passing a finger through)
const STILL_PX = 45;           // how far the fingertip may drift and still count as "the same spot" on canvas
const RELEASE_PX = 70;         // how far it must move away after a trigger before another canvas-tap can fire
const CLICKABLE_SELECTOR = "button:not(:disabled)";

const wallOverlay = document.getElementById("wallOverlay");
const wallStartBtn = document.getElementById("wallStartBtn");
const wallStatus = document.getElementById("wallStatus");
const calStage = document.getElementById("calStage");
const cursorEl = document.getElementById("wallCursor");
const ringEl = document.getElementById("wallCursorRing");

const RING_CIRCUMFERENCE = 2 * Math.PI * 24;

function setRingProgress(p) {
  const offset = RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, p)));
  ringEl.style.strokeDashoffset = String(offset);
}

function dispatchCanvasClick(x, y) {
  const canvas = document.querySelector("canvas");
  if (!canvas) return;
  const opts = { clientX: x, clientY: y, bubbles: true, cancelable: true, view: window, button: 0 };
  canvas.dispatchEvent(new MouseEvent("mousedown", opts));
  canvas.dispatchEvent(new MouseEvent("mouseup", opts));
  canvas.dispatchEvent(new MouseEvent("click", opts));
}

runWallBootstrap({
  startBtn: wallStartBtn,
  statusEl: wallStatus,
  overlayEl: wallOverlay,
  calStageEl: calStage,
  onReady(hand, calH) {
    cursorEl.hidden = false;

    // dwell state for real DOM buttons
    let hoverBtn = null;
    let hoverStart = 0;

    // dwell state for bare canvas taps
    let canvasAnchor = null;   // {x,y} of where the current dwell started
    let canvasStart = 0;
    let lastTrigger = null;    // {x,y} of the last successful canvas tap (release-radius gate)

    function clearBtnHover() {
      if (hoverBtn) hoverBtn.classList.remove("wall-dwell-hover");
      hoverBtn = null;
    }

    function pump() {
      hand.update();

      if (!(calH && hand.finger_x >= 0 && hand.finger_y >= 0)) {
        cursorEl.style.visibility = "hidden";
        clearBtnHover();
        setRingProgress(0);
        canvasAnchor = null;
        requestAnimationFrame(pump);
        return;
      }

      const n = applyHomography(calH, [hand.finger_x, hand.finger_y]);
      if (!n) {
        cursorEl.style.visibility = "hidden";
        clearBtnHover();
        setRingProgress(0);
        canvasAnchor = null;
        requestAnimationFrame(pump);
        return;
      }

      const x = n[0] * window.innerWidth;
      const y = n[1] * window.innerHeight;
      cursorEl.style.left = x + "px";
      cursorEl.style.top = y + "px";
      cursorEl.style.visibility = "visible";

      const under = document.elementFromPoint(x, y);
      const btnTarget = under ? under.closest(CLICKABLE_SELECTOR) : null;

      if (btnTarget) {
        // ── dwelling over a real nav button ──────────────────────
        canvasAnchor = null; lastTrigger = null;
        if (btnTarget !== hoverBtn) {
          clearBtnHover();
          hoverBtn = btnTarget;
          hoverStart = performance.now();
          hoverBtn.classList.add("wall-dwell-hover");
        }
        const progress = (performance.now() - hoverStart) / DWELL_MS;
        setRingProgress(progress);
        if (progress >= 1) {
          const clicked = hoverBtn;
          clearBtnHover();
          setRingProgress(0);
          // one click per visit: stay on this button without re-clicking until the pen leaves it
          hoverBtn = clicked; hoverStart = Infinity;
          clicked.click();
        }
      } else {
        // ── dwelling over the canvas (orb / card regions) ────────
        clearBtnHover();

        if (lastTrigger && Math.hypot(x - lastTrigger.x, y - lastTrigger.y) < RELEASE_PX) {
          // still too close to where we last tapped — wait for the
          // finger to move away before allowing another tap there
          setRingProgress(0);
          canvasAnchor = { x, y };
          canvasStart = performance.now();
        } else {
          lastTrigger = null;
          if (canvasAnchor && Math.hypot(x - canvasAnchor.x, y - canvasAnchor.y) < STILL_PX) {
            const progress = (performance.now() - canvasStart) / CANVAS_DWELL_MS;
            setRingProgress(progress);
            if (progress >= 1) {
              dispatchCanvasClick(x, y);
              lastTrigger = { x, y };
              canvasAnchor = null;
              setRingProgress(0);
            }
          } else {
            canvasAnchor = { x, y };
            canvasStart = performance.now();
            setRingProgress(0);
          }
        }
      }

      requestAnimationFrame(pump);
    }
    pump();
  },
});

window.addEventListener("keydown", e => {
  if (e.key === "r" || e.key === "R") {
    clearCalibration();
    location.reload();
  }
});
