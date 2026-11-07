// ═══════════════════════════════════════════════════════════════
//  main.js — Cosmic Color Quiz wall bootstrap.
//
//  Unlike Color Quest (canvas shapes), this quiz's answers are plain
//  DOM buttons/tiles (multiple choice buttons, letter-bank buttons,
//  letter slots) with ordinary click handlers already wired up in
//  ColorQuiz.js. So instead of hit-testing shapes, we do something more
//  generic: map the tracked fingertip to a screen point, find whatever
//  clickable element is currently under it via elementFromPoint(), and
//  after the finger dwells there for a moment, fire a real .click() on
//  it. That means ANY future DOM-button-driven app can reuse this same
//  approach with no per-app hit-testing code at all.
//
//  Shares the same wallSharedCalibration as every other app.
// ═══════════════════════════════════════════════════════════════
import { applyHomography } from "/shared/homography.js";
import { runWallBootstrap, clearCalibration } from "/shared/calibrationBootstrap.js";

const DWELL_MS = 700;
const CLICKABLE_SELECTOR = "button:not(:disabled), .letter-slot, .balloon-wrap";

const wallOverlay = document.getElementById("wallOverlay");
const wallStartBtn = document.getElementById("wallStartBtn");
const wallStatus = document.getElementById("wallStatus");
const calStage = document.getElementById("calStage");
const cursorEl = document.getElementById("wallCursor");
const ringEl = document.getElementById("wallCursorRing");

const RING_CIRCUMFERENCE = 2 * Math.PI * 24; // matches the r=24 circle in index.html

function setRingProgress(p) {
  const offset = RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, p)));
  ringEl.style.strokeDashoffset = String(offset);
}

runWallBootstrap({
  startBtn: wallStartBtn,
  statusEl: wallStatus,
  overlayEl: wallOverlay,
  calStageEl: calStage,
  onReady(hand, calH) {
    cursorEl.hidden = false;

    let hoverEl = null;
    let hoverStart = 0;

    function clearHover() {
      if (hoverEl) hoverEl.classList.remove("wall-dwell-hover");
      hoverEl = null;
      setRingProgress(0);
    }

    function pump() {
      hand.update();

      if (calH && hand.finger_x >= 0 && hand.finger_y >= 0) {
        const n = applyHomography(calH, [hand.finger_x, hand.finger_y]);
        if (n) {
          const x = n[0] * window.innerWidth;
          const y = n[1] * window.innerHeight;
          cursorEl.style.left = x + "px";
          cursorEl.style.top = y + "px";
          cursorEl.style.visibility = "visible";

          const under = document.elementFromPoint(x, y);
          const target = under ? under.closest(CLICKABLE_SELECTOR) : null;

          if (target !== hoverEl) {
            clearHover();
            hoverEl = target;
            hoverStart = performance.now();
            if (hoverEl) hoverEl.classList.add("wall-dwell-hover");
          }

          if (hoverEl) {
            const progress = (performance.now() - hoverStart) / DWELL_MS;
            setRingProgress(progress);
            if (progress >= 1) {
              const clicked = hoverEl;
              clearHover();
              // one click per visit: stay on this element without re-clicking until the pen leaves it
              hoverEl = clicked; hoverStart = Infinity;
              clicked.click();
            }
          }
        } else {
          cursorEl.style.visibility = "hidden";
          clearHover();
        }
      } else {
        cursorEl.style.visibility = "hidden";
        clearHover();
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
