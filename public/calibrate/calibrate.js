// Full-screen wall calibration, run by the launcher OUTSIDE every app.
// When finished it tells the launcher (parent window) so it can open the app;
// opened on its own, it goes back to the launcher.
import { runCalibrationScreen } from "/shared/calibrationBootstrap.js";

const canvas = document.getElementById("stage");
const msg = document.getElementById("msg");
const status = document.getElementById("status");
const retry = document.getElementById("retry");

const AUTO_PREVIEW_MS = 3000; // pen unseen this long → show the camera view automatically

function done() {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "wall-calibrated" }, location.origin);
  } else {
    location.href = "/";
  }
}

async function start() {
  retry.style.display = "none";
  msg.style.display = "flex";
  status.textContent = "Starting the camera…";
  try {
    await runCalibrationScreen({
      canvas,
      statusEl: status,
      onTracker(hand) {
        msg.style.display = "none";
        window.focus();
        // If the pen is never seen, open the live camera view so the problem is visible.
        let unseenSince = performance.now();
        const timer = setInterval(() => {
          if (!hand.ready) { clearInterval(timer); return; }
          if (hand.finger_x >= 0) { unseenSince = performance.now(); return; }
          if (performance.now() - unseenSince > AUTO_PREVIEW_MS && hand._showDebug && !hand._dbg) {
            hand._showDebug(true);
            clearInterval(timer);
          }
        }, 250);
      },
    });
    done();
  } catch (e) {
    msg.style.display = "flex";
    status.textContent = "⚠️ Could not start the camera: " + (e && e.message ? e.message : e) +
      " — allow camera access for this site, then try again.";
    retry.style.display = "inline-block";
  }
}

retry.addEventListener("click", start);
start();
