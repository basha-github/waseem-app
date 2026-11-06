// ═══════════════════════════════════════════════════════════════
//  main.js — Garden Language app bootstrap.
//  Thin glue: shared camera/calibration bootstrap + the shared
//  hub-and-spoke language engine, fed with this app's own ITEMS
//  (defined in items.js, loaded before this module).
// ═══════════════════════════════════════════════════════════════
import { runWallBootstrap, clearCalibration } from "/shared/calibrationBootstrap.js";
import { setItems } from "/shared/langAppEngine.js";
import { mountLangApp } from "/shared/langAppMain.js";

setItems(ITEMS); // ITEMS comes from this app's own items.js, loaded first

const canvas = document.getElementById("stage");
const imgLayer = document.getElementById("imgLayer");
const wallStartBtn = document.getElementById("wallStartBtn");
const wallStatus = document.getElementById("wallStatus");
const wallOverlay = document.getElementById("wallOverlay");
const calStage = document.getElementById("calStage");

runWallBootstrap({
  startBtn: wallStartBtn,
  statusEl: wallStatus,
  overlayEl: wallOverlay,
  calStageEl: calStage,
  onReady(hand, calH) {
    mountLangApp({ canvas, imgLayer, hand, calH });
  },
});

window.addEventListener("keydown", e => {
  if (e.key === "r" || e.key === "R") {
    clearCalibration();
    location.reload();
  }
});
