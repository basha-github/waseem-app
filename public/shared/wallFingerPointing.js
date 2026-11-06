// ═══════════════════════════════════════════════════════════════
//  shared/wallFingerPointing.js — drop-in finger-pointing support
//  for any app whose interaction is plain DOM clicks. Self-injects
//  its own overlay/cursor DOM + CSS, reuses the same shared camera
//  calibration as the rest of the wall (calibrationBootstrap.js),
//  and fires a real .click() on whatever clickable element the
//  fingertip dwells over — same pattern as apps/colorquiz/js/main.js
//  and shared/emojiQuizEngine.js, just packaged for reuse anywhere.
//
//  Usage from an app's own script:
//    import { initWallFingerPointing } from "/shared/wallFingerPointing.js";
//    initWallFingerPointing({ clickableSelector: ".card" });
// ═══════════════════════════════════════════════════════════════

const DEFAULT_DWELL_MS = 700;

function injectStyles() {
  if (document.getElementById("__wallFingerStyles")) return;
  const style = document.createElement("style");
  style.id = "__wallFingerStyles";
  style.textContent = `
    .wall-cal-stage {
      position: fixed; inset: 0; z-index: 999940; display: none;
    }
    .wall-finger-overlay {
      position: fixed; inset: 0; z-index: 999950;
      background: rgba(11, 16, 38, 0.82);
      display: flex; align-items: center; justify-content: center;
      pointer-events: none;
    }
    .wall-finger-overlay-card {
      pointer-events: auto;
      background: #14193a;
      border: 2px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      padding: 28px 32px;
      max-width: 440px;
      width: calc(100% - 48px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      color: #F5F2FF;
      font-family: 'Fredoka', 'Nunito', system-ui, sans-serif;
      text-align: left;
    }
    .wall-finger-overlay-card h1 {
      margin: 0 0 10px;
      font-family: 'Fredoka One', 'Baloo 2', system-ui, sans-serif;
      font-size: 20px;
    }
    .wall-finger-overlay-card p { color: #c9c4e8; line-height: 1.5; font-size: 13.5px; }
    .wall-finger-steps { margin: 12px 0 20px; padding-left: 20px; font-size: 13px; line-height: 1.6; color: #e4e1f7; }
    .wall-finger-steps kbd { background: rgba(255,255,255,0.12); border-radius: 4px; padding: 1px 6px; border: 1px solid rgba(255,255,255,0.2); font-family: monospace; }
    #__wallFingerStartBtn {
      width: 100%; padding: 13px 18px; border: none; border-radius: 10px;
      background: linear-gradient(135deg, #7C3CDC, #FF69B4);
      color: #fff; font-size: 15px; font-weight: bold; cursor: pointer;
      font-family: 'Fredoka One', 'Baloo 2', system-ui, sans-serif;
    }
    #__wallFingerStartBtn:disabled { opacity: 0.7; cursor: default; }
    .wall-finger-status { margin-top: 12px; min-height: 16px; font-size: 12.5px; color: #2EC4B6; text-align: center; }
    .wall-skip-link {
      display: block; width: 100%; margin-top: 10px; padding: 8px 12px;
      background: transparent; border: none; color: #9d97c9;
      font-family: 'Fredoka', system-ui, sans-serif; font-size: 12.5px;
      text-decoration: underline; cursor: pointer;
    }
    .wall-skip-link:hover { color: #c9c4e8; }
    .wall-finger-cursor {
      position: fixed; z-index: 999960;
      width: 56px; height: 56px; margin-left: -28px; margin-top: -28px;
      pointer-events: none; visibility: hidden;
      filter: drop-shadow(0 0 4px rgba(0,0,0,0.5));
    }
    .wall-dwell-hover {
      outline: 4px solid #ff69b4 !important;
      outline-offset: 2px;
      filter: brightness(1.1);
    }
  `;
  document.head.appendChild(style);
}

function buildWallDom() {
  const calStage = document.createElement("canvas");
  calStage.className = "wall-cal-stage";
  document.body.appendChild(calStage);

  const cursor = document.createElement("div");
  cursor.className = "wall-finger-cursor";
  cursor.innerHTML = `
    <svg viewBox="0 0 60 60" width="56" height="56">
      <circle class="__wallCursorRing" cx="30" cy="30" r="24" fill="none" stroke="#ff69b4" stroke-width="4"
              stroke-dasharray="151" stroke-dashoffset="151" transform="rotate(-90 30 30)" />
      <circle cx="30" cy="30" r="6" fill="#ff69b4" />
    </svg>`;
  document.body.appendChild(cursor);
  const ring = cursor.querySelector(".__wallCursorRing");

  const overlay = document.createElement("div");
  overlay.className = "wall-finger-overlay";
  overlay.innerHTML = `
    <div class="wall-finger-overlay-card wall-overlay-card">
      <h1>👆 Point &amp; Play</h1>
      <p>You can already tap with your finger or mouse. Turn on the
      camera to point from across the room instead — hold your fingertip
      over something for a moment to select it.</p>
      <ul class="wall-finger-steps">
        <li>Allow camera access when prompted.</li>
        <li>Hold your fingertip still over each of the 9 dots for 2 seconds to calibrate (skipped automatically if you've already calibrated another app on this wall).</li>
        <li>Point and hold to select.</li>
        <li>Press <kbd>R</kbd> any time to recalibrate.</li>
      </ul>
      <button id="__wallFingerStartBtn">Turn on finger pointing</button>
      <p id="__wallFingerStatus" class="wall-finger-status"></p>
    </div>
  `;
  document.body.appendChild(overlay);

  return { calStage, cursor, ring, overlay, startBtn: overlay.querySelector("#__wallFingerStartBtn"), statusEl: overlay.querySelector("#__wallFingerStatus") };
}

/**
 * @param {Object} opts
 * @param {string} [opts.clickableSelector] CSS selector for anything a
 *   dwelling fingertip should be able to "click". Defaults to common
 *   interactive elements.
 * @param {number} [opts.dwellMs] how long to hold before firing .click().
 */
export async function initWallFingerPointing(opts = {}) {
  const clickableSelector = opts.clickableSelector || "button:not(:disabled), .card, a, [role='button']";
  const dwellMs = opts.dwellMs || DEFAULT_DWELL_MS;

  injectStyles();
  const { calStage, cursor, ring, overlay, startBtn, statusEl } = buildWallDom();

  let mod;
  try {
    mod = await import("/shared/calibrationBootstrap.js");
  } catch (e) {
    overlay.remove();
    calStage.remove();
    cursor.remove();
    return; // hand-tracking unavailable — app still works fine by touch/click
  }
  const { applyHomography } = await import("/shared/homography.js");
  const { runWallBootstrap, clearCalibration } = mod;

  const RING_CIRCUMFERENCE = 2 * Math.PI * 24;
  function setRingProgress(p) {
    const offset = RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, p)));
    ring.style.strokeDashoffset = String(offset);
  }

  runWallBootstrap({
    startBtn, statusEl, overlayEl: overlay, calStageEl: calStage,
    onReady(hand, calH) {
      cursor.style.visibility = "visible";
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
            cursor.style.left = x + "px";
            cursor.style.top = y + "px";
            cursor.style.visibility = "visible";

            const under = document.elementFromPoint(x, y);
            const target = under ? under.closest(clickableSelector) : null;

            if (target !== hoverEl) {
              clearHover();
              hoverEl = target;
              hoverStart = performance.now();
              if (hoverEl) hoverEl.classList.add("wall-dwell-hover");
            }
            if (hoverEl) {
              const progress = (performance.now() - hoverStart) / dwellMs;
              setRingProgress(progress);
              if (progress >= 1) {
                const clicked = hoverEl;
                clearHover();
                clicked.click();
              }
            }
          } else {
            cursor.style.visibility = "hidden";
            clearHover();
          }
        } else {
          cursor.style.visibility = "hidden";
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
}
