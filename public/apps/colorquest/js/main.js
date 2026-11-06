// ═══════════════════════════════════════════════════════════════
//  main.js — Color Quest wall bootstrap.
//
//  Color Quest itself (ColorQuest.js) is an ordinary p5.js sketch that
//  already runs mouse-clicks. This file bolts on the same webcam +
//  fingertip-tracking + shared-calibration flow used by the rest of the
//  suite (via /shared/calibrationBootstrap.js), so a finger held over a
//  shape selects it just like clicking would. It shares the SAME
//  calibration as every other app: if you've already calibrated in
//  Alphabets, Animals, etc., Color Quest picks it up immediately with
//  no extra steps.
// ═══════════════════════════════════════════════════════════════
import { applyHomography } from "/shared/homography.js";
import { runWallBootstrap, clearCalibration } from "/shared/calibrationBootstrap.js";

const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const statusEl = document.getElementById("status");
const calStage = document.getElementById("calStage");

runWallBootstrap({
  startBtn, statusEl, overlayEl: overlay, calStageEl: calStage,
  onReady(hand, calH) {
    function pump() {
      hand.update();
      if (calH && hand.finger_x >= 0 && hand.finger_y >= 0) {
        const n = applyHomography(calH, [hand.finger_x, hand.finger_y]);
        if (n) {
          window.WallPointer.x = n[0] * window.innerWidth;
          window.WallPointer.y = n[1] * window.innerHeight;
          window.WallPointer.active = true;
        } else {
          window.WallPointer.active = false;
        }
      } else {
        window.WallPointer.active = false;
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
