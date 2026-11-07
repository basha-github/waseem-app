// controls.js — four controls total:
//   • Previous (left)  — press/hold or finger-hold to walk the current
//     animal left. Same behavior as the original elephant app.
//   • Next (right)     — press/hold or finger-hold to walk the current
//     animal right. Same behavior as the original elephant app.
//   • 360° (bottom-center) — one click/tap, or a ~0.7s finger-dwell,
//     triggers one slow full turn in place. Same as the elephant app.
//   • Next Animal (right side, above the walk arrow) — one click/tap, or
//     a ~0.7s finger-dwell, swaps in the next animal in the lineup
//     (elephant → bear → lion → fox → rhino → zebra → elephant …).
//
// All four work with mouse/touch AND with a pointing index finger, using
// the same shared camera calibration as the rest of the wall.

function waitForAnimals(cb) {
  if (typeof animals !== "undefined" && animals && animals.current) return cb();
  requestAnimationFrame(() => waitForAnimals(cb));
}

function buildButtons() {
  const wrap = document.createElement("div");
  wrap.className = "walk-btns";
  wrap.dataset.penOwn = "1"; // these buttons have their own pen dwell (see pump below)
  wrap.innerHTML = `
    <div class="species-label" id="speciesLabel">🐘 Elephant</div>

    <button id="btnPrev" class="walk-btn walk-btn-left" aria-label="Previous — walk left">
      <span class="walk-btn-arrow">◀</span>
      <span class="walk-btn-label">Previous</span>
    </button>
    <button id="btnNext" class="walk-btn walk-btn-right" aria-label="Next — walk right">
      <span class="walk-btn-arrow">▶</span>
      <span class="walk-btn-label">Next</span>
    </button>

    <button id="btnNextAnimal" class="next-animal-btn" aria-label="Show the next animal">
      <span class="next-animal-icon">🐾</span>
      <span class="next-animal-label">Next Animal</span>
    </button>

    <button id="btnSpin" class="spin-btn" aria-label="Turn the animal around 360 degrees">
      <span class="spin-btn-icon">↻</span>
      <span class="spin-btn-label">360°</span>
    </button>
  `;
  document.body.appendChild(wrap);
  return {
    prev: wrap.querySelector("#btnPrev"),
    next: wrap.querySelector("#btnNext"),
    nextAnimal: wrap.querySelector("#btnNextAnimal"),
    spin: wrap.querySelector("#btnSpin"),
    label: wrap.querySelector("#speciesLabel"),
  };
}

function wirePressAndHold(btn, direction, setDir, activeSet) {
  const start = e => { e.preventDefault(); activeSet.mouse = direction; setDir(activeSet); btn.classList.add("walk-btn-active"); };
  const stop = () => { if (activeSet.mouse === direction) activeSet.mouse = 0; setDir(activeSet); btn.classList.remove("walk-btn-active"); };
  btn.addEventListener("mousedown", start);
  btn.addEventListener("touchstart", start, { passive: false });
  ["mouseup", "mouseleave", "touchend", "touchcancel"].forEach(evt => btn.addEventListener(evt, stop));
}

const SPECIES_ICON = { elephant: "🐘", bear: "🐻", lion: "🦁", fox: "🦊", rhino: "🦏", zebra: "🦓" };

async function initControls() {
  const { prev, next, nextAnimal, spin, label } = buildButtons();

  animals.onSpeciesChange = (key, name) => {
    label.textContent = `${SPECIES_ICON[key] || "🐾"} ${name}`;
  };
  // fire once for the species already loaded before this callback was attached
  label.textContent = `${SPECIES_ICON[animals.speciesKey] || "🐾"} ${animals.current.config.label}`;

  const active = { mouse: 0, finger: 0 };
  function applyDirection() {
    const dir = active.mouse !== 0 ? active.mouse : active.finger;
    animals.setDirection(dir);
  }
  wirePressAndHold(prev, -1, applyDirection, active);
  wirePressAndHold(next, 1, applyDirection, active);

  // Discrete one-shot actions (unlike the continuous press-and-hold walk
  // buttons) — each click/tap/dwell fires exactly one action.
  function triggerSpin() {
    const started = animals.spin360();
    if (started) {
      spin.classList.add("spin-btn-active");
      const check = () => {
        if (animals.current && animals.current.spinning) requestAnimationFrame(check);
        else spin.classList.remove("spin-btn-active");
      };
      requestAnimationFrame(check);
    }
  }
  function triggerNextAnimal() {
    active.mouse = 0; active.finger = 0; // stop any in-progress walking before swapping
    nextAnimal.classList.add("next-animal-active");
    animals.next();
    setTimeout(() => nextAnimal.classList.remove("next-animal-active"), 350);
  }
  spin.addEventListener("click", triggerSpin);
  nextAnimal.addEventListener("click", triggerNextAnimal);

  // ── optional finger-pointing layer (same calibration as the rest of the wall) ──
  injectWallStyles();
  const { calStage, cursor, overlay, startBtn, statusEl } = buildWallDom();

  let mod;
  try {
    mod = await import("/shared/calibrationBootstrap.js");
  } catch (e) {
    overlay.remove();
    calStage.remove();
    cursor.remove();
    return; // hand-tracking unavailable — buttons still work fine by touch/click
  }
  const { applyHomography } = await import("/shared/homography.js");
  const { runWallBootstrap, clearCalibration } = mod;

  runWallBootstrap({
    startBtn, statusEl, overlayEl: overlay, calStageEl: calStage,
    onReady(hand, calH) {
      cursor.style.visibility = "visible";

      const DWELL_MS = 700;
      const dwell = { spin: 0, nextAnimal: 0 };
      const armed = { spin: true, nextAnimal: true };

      function handleDwellButton(key, el, isOver, triggerFn) {
        if (isOver) {
          if (dwell[key] === 0) dwell[key] = performance.now();
          const progress = armed[key] ? (performance.now() - dwell[key]) / DWELL_MS : 1;
          el.style.setProperty("--dwell", String(Math.min(1, progress)));
          el.classList.toggle(key === "spin" ? "spin-btn-dwelling" : "next-animal-dwelling", armed[key]);
          if (armed[key] && progress >= 1) {
            triggerFn();
            armed[key] = false;
          }
        } else {
          dwell[key] = 0;
          armed[key] = true;
          el.classList.remove(key === "spin" ? "spin-btn-dwelling" : "next-animal-dwelling");
          el.style.setProperty("--dwell", "0");
        }
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
            const overPrev = !!(under && under.closest("#btnPrev"));
            const overNext = !!(under && under.closest("#btnNext"));
            const overSpin = !!(under && under.closest("#btnSpin"));
            const overNextAnimal = !!(under && under.closest("#btnNextAnimal"));

            prev.classList.toggle("walk-btn-active", overPrev);
            next.classList.toggle("walk-btn-active", overNext);
            active.finger = overPrev ? -1 : overNext ? 1 : 0;
            applyDirection();

            handleDwellButton("spin", spin, overSpin, triggerSpin);
            handleDwellButton("nextAnimal", nextAnimal, overNextAnimal, triggerNextAnimal);
          } else {
            cursor.style.visibility = "hidden";
            active.finger = 0;
            prev.classList.remove("walk-btn-active");
            next.classList.remove("walk-btn-active");
            applyDirection();
            handleDwellButton("spin", spin, false, triggerSpin);
            handleDwellButton("nextAnimal", nextAnimal, false, triggerNextAnimal);
          }
        } else {
          cursor.style.visibility = "hidden";
          active.finger = 0;
          prev.classList.remove("walk-btn-active");
          next.classList.remove("walk-btn-active");
          applyDirection();
          handleDwellButton("spin", spin, false, triggerSpin);
          handleDwellButton("nextAnimal", nextAnimal, false, triggerNextAnimal);
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

function injectWallStyles() {
  if (document.getElementById("__wallFingerStyles")) return;
  const style = document.createElement("style");
  style.id = "__wallFingerStyles";
  style.textContent = `
    .wall-cal-stage { position: fixed; inset: 0; z-index: 999940; display: none; }
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
      font-family: 'Nunito', system-ui, sans-serif;
      text-align: left;
    }
    .wall-finger-overlay-card h1 { margin: 0 0 10px; font-size: 20px; }
    .wall-finger-overlay-card p { color: #c9c4e8; line-height: 1.5; font-size: 13.5px; }
    .wall-finger-steps { margin: 12px 0 20px; padding-left: 20px; font-size: 13px; line-height: 1.6; color: #e4e1f7; }
    .wall-finger-steps kbd { background: rgba(255,255,255,0.12); border-radius: 4px; padding: 1px 6px; border: 1px solid rgba(255,255,255,0.2); font-family: monospace; }
    #__wallFingerStartBtn {
      width: 100%; padding: 13px 18px; border: none; border-radius: 10px;
      background: linear-gradient(135deg, #7C3CDC, #FF69B4);
      color: #fff; font-size: 15px; font-weight: bold; cursor: pointer;
    }
    #__wallFingerStartBtn:disabled { opacity: 0.7; cursor: default; }
    .wall-finger-status { margin-top: 12px; min-height: 16px; font-size: 12.5px; color: #2EC4B6; text-align: center; }
    .wall-skip-link {
      display: block; width: 100%; margin-top: 10px; padding: 8px 12px;
      background: transparent; border: none; color: #9d97c9;
      font-family: 'Nunito', system-ui, sans-serif; font-size: 12.5px;
      text-decoration: underline; cursor: pointer;
    }
    .wall-skip-link:hover { color: #c9c4e8; }
    .wall-finger-cursor {
      position: fixed; z-index: 999960;
      width: 56px; height: 56px; margin-left: -28px; margin-top: -28px;
      pointer-events: none; visibility: hidden;
      filter: drop-shadow(0 0 4px rgba(0,0,0,0.5));
    }

    .walk-btns { position: fixed; inset: 0; z-index: 500; pointer-events: none; }

    .species-label {
      position: fixed; top: 18px; left: 50%; transform: translateX(-50%);
      pointer-events: none;
      background: rgba(20, 20, 40, 0.55);
      color: #fff; font-family: 'Nunito', system-ui, sans-serif; font-weight: 800;
      font-size: 18px; padding: 8px 22px; border-radius: 999px;
      border: 2px solid rgba(255,255,255,0.35);
      backdrop-filter: blur(3px);
    }

    .walk-btn {
      position: fixed; top: 50%; transform: translateY(-50%);
      pointer-events: auto;
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      width: 92px; height: 92px;
      border-radius: 50%;
      border: 4px solid rgba(255,255,255,0.85);
      background: rgba(255, 140, 60, 0.88);
      color: #fff;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(0,0,0,0.25);
      transition: transform 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
      font-family: 'Nunito', system-ui, sans-serif;
      justify-content: center;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    .walk-btn-left { left: 150px; }
    .walk-btn-right { right: 150px; }
    .walk-btn-arrow { font-size: 30px; line-height: 1; }
    .walk-btn-label { font-size: 12px; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase; }
    .walk-btn:hover { transform: translateY(-50%) scale(1.05); }
    .walk-btn-active {
      background: rgba(255, 90, 30, 1);
      transform: translateY(-50%) scale(1.12);
      box-shadow: 0 0 0 8px rgba(255,140,60,0.28), 0 10px 26px rgba(0,0,0,0.32);
    }

    .next-animal-btn {
      position: fixed; top: calc(50% - 170px); right: 150px;
      pointer-events: auto;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      width: 96px; height: 96px;
      border-radius: 50%;
      border: 4px solid rgba(255,255,255,0.9);
      background: rgba(46, 160, 130, 0.92);
      color: #fff;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(0,0,0,0.28);
      transition: transform 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
      font-family: 'Nunito', system-ui, sans-serif;
      justify-content: center;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      --dwell: 0;
    }
    .next-animal-icon { font-size: 30px; line-height: 1; }
    .next-animal-label { font-size: 11px; font-weight: 800; letter-spacing: 0.02em; text-transform: uppercase; text-align: center; }
    .next-animal-btn:hover { transform: scale(1.05); }
    .next-animal-active {
      background: rgba(20, 130, 100, 1);
      animation: nextAnimalPulse 0.35s ease;
    }
    @keyframes nextAnimalPulse {
      0% { transform: scale(1); }
      40% { transform: scale(1.18); }
      100% { transform: scale(1); }
    }
    .next-animal-dwelling {
      box-shadow: 0 0 0 8px rgba(46,160,130,0.3), 0 10px 26px rgba(0,0,0,0.32);
      background: conic-gradient(#1f8a6c calc(var(--dwell) * 360deg), rgba(46,160,130,0.92) 0deg);
    }

    .spin-btn {
      position: fixed;
      left: 50%; bottom: 150px;
      transform: translateX(-50%);
      pointer-events: auto;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      width: 84px; height: 84px;
      border-radius: 50%;
      border: 4px solid rgba(255,255,255,0.9);
      background: rgba(60, 130, 220, 0.9);
      color: #fff;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(0,0,0,0.28);
      transition: transform 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
      font-family: 'Nunito', system-ui, sans-serif;
      justify-content: center;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      --dwell: 0;
    }
    .spin-btn-icon { font-size: 30px; line-height: 1; }
    .spin-btn-label { font-size: 12px; font-weight: 800; letter-spacing: 0.03em; }
    .spin-btn:hover { transform: translateX(-50%) scale(1.06); }
    .spin-btn-active {
      background: rgba(30, 100, 200, 1);
      animation: spinBtnPulse 0.4s ease;
    }
    @keyframes spinBtnPulse {
      0% { transform: translateX(-50%) scale(1); }
      40% { transform: translateX(-50%) scale(1.22); }
      100% { transform: translateX(-50%) scale(1); }
    }
    .spin-btn-dwelling {
      box-shadow: 0 0 0 8px rgba(60,130,220,0.3), 0 10px 26px rgba(0,0,0,0.32);
      background: conic-gradient(#1e64c8 calc(var(--dwell) * 360deg), rgba(60,130,220,0.9) 0deg);
    }

    @media (max-width: 700px) {
      .walk-btn { width: 68px; height: 68px; }
      .walk-btn-arrow { font-size: 22px; }
      .walk-btn-label { font-size: 9px; }
      .walk-btn-left { left: 70px; }
      .walk-btn-right { right: 70px; }
      .spin-btn { width: 64px; height: 64px; bottom: 90px; }
      .spin-btn-icon { font-size: 22px; }
      .spin-btn-label { font-size: 9px; }
      .next-animal-btn { width: 72px; height: 72px; top: calc(50% - 130px); right: 70px; }
      .next-animal-icon { font-size: 22px; }
      .next-animal-label { font-size: 8px; }
      .species-label { font-size: 14px; padding: 6px 16px; }
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
      <circle cx="30" cy="30" r="24" fill="none" stroke="#ff69b4" stroke-width="4" />
      <circle cx="30" cy="30" r="6" fill="#ff69b4" />
    </svg>`;
  document.body.appendChild(cursor);

  const overlay = document.createElement("div");
  overlay.className = "wall-finger-overlay";
  overlay.innerHTML = `
    <div class="wall-finger-overlay-card wall-overlay-card">
      <h1>🦁 Wild Animals 3D</h1>
      <p>You can already use the buttons with your mouse or finger on a
      touchscreen. Turn on the camera to control them by pointing instead.</p>
      <ul class="wall-finger-steps">
        <li>Allow camera access when prompted.</li>
        <li>Hold your fingertip still over each of the 9 dots for 2 seconds to calibrate (skipped automatically if you've already calibrated another app on this wall).</li>
        <li>Point at the left/right arrows to walk that way, the 🐾 button to see the next animal, or the 360° button to spin.</li>
        <li>Press <kbd>R</kbd> any time to recalibrate.</li>
      </ul>
      <button id="__wallFingerStartBtn">Turn on finger pointing</button>
      <p id="__wallFingerStatus" class="wall-finger-status"></p>
    </div>
  `;
  document.body.appendChild(overlay);

  return { calStage, cursor, overlay, startBtn: overlay.querySelector("#__wallFingerStartBtn"), statusEl: overlay.querySelector("#__wallFingerStatus") };
}

waitForAnimals(() => initControls());
