// ═══════════════════════════════════════════════════════════════
//  tracking-bridge.js — wires Counting Orchard's p5 sketch (a
//  classic, non-module script) up to the SAME proven MediaPipe
//  hand-tracking pipeline used by the touch-wall's newer apps
//  (Balloon Number Quiz, Color Quiz, etc.), instead of the old
//  ml5.handPose-based HandCaliManager.js this app used before.
//
//  Exposes window.__orchardTracking = { ready, hand, calH, applyHomography }
//  for CountingOrchard.js to read every frame.
// ═══════════════════════════════════════════════════════════════
import { applyHomography } from "/shared/homography.js";
import { runWallBootstrap, clearCalibration } from "/shared/calibrationBootstrap.js";

window.__orchardTracking = {
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
    window.__orchardTracking.hand = hand;
    window.__orchardTracking.calH = calH;
    window.__orchardTracking.ready = true;
  },
});

window.addEventListener("keydown", (e) => {
  if (e.key === "r" || e.key === "R") {
    clearCalibration();
    location.reload();
  }
});
