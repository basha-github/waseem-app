// ═══════════════════════════════════════════════════════════════
//  tracking-bridge.js — wires Number Ninja's p5 sketch (a classic,
//  non-module script) up to the SAME proven MediaPipe hand-tracking
//  pipeline used by the touch-wall's newer apps (Counting Orchard,
//  Balloon Number Quiz, Color Quiz, etc.), instead of the old
//  ml5.handPose-based HandCaliManager.js this app used before.
//
//  Exposes window.__ninjaTracking = { ready, hand, calH, applyHomography }
//  for NumberNinja.js to read every frame.
// ═══════════════════════════════════════════════════════════════
import { applyHomography } from "/shared/homography.js";
import { runWallBootstrap, clearCalibration } from "/shared/calibrationBootstrap.js";

window.__ninjaTracking = {
  ready: false,
  hand: null,
  calH: null,
  applyHomography,
};

runWallBootstrap({
  startBtn: document.getElementById("wallStartBtn"),
  statusEl: document.getElementById("wallStatus"),
  overlayEl: document.getElementById("wallOverlay"),
  calStageEl: document.getElementById("calStage"),
  onReady(hand, calH) {
    window.__ninjaTracking.hand = hand;
    window.__ninjaTracking.calH = calH;
    window.__ninjaTracking.ready = true;
  },
});

window.addEventListener("keydown", (e) => {
  if (e.key === "r" || e.key === "R") {
    clearCalibration();
    location.reload();
  }
});
