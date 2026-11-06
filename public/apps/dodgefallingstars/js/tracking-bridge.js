// ═══════════════════════════════════════════════════════════════
//  tracking-bridge.js — wires Dodge the Falling Stars's p5 sketch (a classic,
//  non-module script) up to the SAME proven MediaPipe hand-tracking
//  pipeline used by the touch-wall's newer apps (Counting Orchard,
//  Number Ninja, etc.), instead of the old ml5.handPose-based
//  HandCaliManager.js this app used before.
//
//  Exposes window.__dodgeTracking = { ready, hand, calH, applyHomography }
//  for Dodge the Falling Stars's sketch file to read every frame.
// ═══════════════════════════════════════════════════════════════
import { applyHomography } from "/shared/homography.js";
import { runWallBootstrap, clearCalibration } from "/shared/calibrationBootstrap.js";

window.__dodgeTracking = {
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
    window.__dodgeTracking.hand = hand;
    window.__dodgeTracking.calH = calH;
    window.__dodgeTracking.ready = true;
  },
});

window.addEventListener("keydown", (e) => {
  if (e.key === "r" || e.key === "R") {
    clearCalibration();
    location.reload();
  }
});
