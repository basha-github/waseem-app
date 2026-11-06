// ═══════════════════════════════════════════════════════════════
//  handTracker.js — mode-aware entry point (IR pen by default).
//
//  Exports the same `HandTracker` name main.js already uses, but resolves
//  to the IR pen tracker unless the wall is switched to ?input=hand, in
//  which case the original MediaPipe tracker (handTrackerHand.js, the
//  untouched previous file) is loaded instead.
// ═══════════════════════════════════════════════════════════════
import { getInputMode } from "/shared/inputConfig.js";
import { IRPenTracker } from "/shared/irPenTracker.js";

export const HandTracker =
  getInputMode() === "hand"
    ? (await import("./handTrackerHand.js")).HandTracker
    : IRPenTracker;
