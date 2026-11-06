// ═══════════════════════════════════════════════════════════════
//  tracking-bridge.js — wires Bubble Pop Storm's p5 sketch (a
//  classic, non-module script) up to the SAME proven MediaPipe
//  hand-tracking pipeline used by the touch-wall's newer apps,
//  instead of the old ml5.handPose-based HandCaliManager.js this
//  app used before — but with a TWO-HAND tracker (shared/
//  handTrackerMulti.js) passed into the shared calibration flow,
//  since this is the one wall app that needs both hands live
//  during gameplay (the calibration dots themselves are still
//  captured with a single fingertip, same as every other app).
//
//  Exposes window.__bubbleTracking = { ready, hand, calH, applyHomography }
//  for BubblePopStorm.js to read every frame — hand.fingers is the
//  per-hand array ([{x,y,conf}, ...], 0-2 entries) gameplay uses.
// ═══════════════════════════════════════════════════════════════
import { applyHomography } from "/shared/homography.js";
import { runWallBootstrap, clearCalibration } from "/shared/calibrationBootstrap.js";

window.__bubbleTracking = {
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
  maxHands: 2, // two hands (hand mode) or two IR pens (IR mode)
  onReady(hand, calH) {
    window.__bubbleTracking.hand = hand;
    window.__bubbleTracking.calH = calH;
    window.__bubbleTracking.ready = true;
  },
});

window.addEventListener("keydown", (e) => {
  if (e.key === "r" || e.key === "R") {
    clearCalibration();
    location.reload();
  }
});
