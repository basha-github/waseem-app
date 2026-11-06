// ═══════════════════════════════════════════════════════════════
//  shared/langAppMain.js
//
//  Generic "run a LangApp" driver — resizes the canvas to fill the
//  window, wires mouse clicks as a fallback, and feeds the mapped
//  fingertip position into LangApp.draw() every frame. Used by every
//  Garden Language app (and reusable for any future hub-and-spoke
//  "point at a circle to hear it" app).
// ═══════════════════════════════════════════════════════════════
import { applyHomography } from "./homography.js";
import { LangApp } from "./langAppEngine.js";

/**
 * @param {Object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {HTMLElement} opts.imgLayer
 * @param {import("./handTracker.js").HandTracker} opts.hand  already-initialized
 * @param {number[][]} opts.calH  homography from runWallBootstrap's onReady
 */
export function mountLangApp({ canvas, imgLayer, hand, calH }) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const langApp = new LangApp(imgLayer);

  let width = window.innerWidth, height = window.innerHeight;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    langApp.recalcLayout(width, height);
  }
  window.addEventListener("resize", resize);
  resize();

  let mouseX = -1, mouseY = -1;
  canvas.addEventListener("pointermove", e => {
    const r = canvas.getBoundingClientRect();
    mouseX = e.clientX - r.left;
    mouseY = e.clientY - r.top;
  });
  canvas.addEventListener("pointerdown", e => {
    const r = canvas.getBoundingClientRect();
    langApp.handleClick(e.clientX - r.left, e.clientY - r.top, width, height);
  });

  window.addEventListener("keydown", e => {
    if (e.key === "r" || e.key === "R") {
      // Handled by the page's own keydown listener (clearCalibration + reload);
      // nothing extra needed here.
    }
  });

  function loop() {
    hand.update();
    let fingerScreenX = -1, fingerScreenY = -1;
    if (calH && hand.finger_x >= 0 && hand.finger_y >= 0) {
      const n = applyHomography(calH, [hand.finger_x, hand.finger_y]);
      if (n) {
        fingerScreenX = n[0] * width;
        fingerScreenY = n[1] * height;
      }
    }
    ctx.clearRect(0, 0, width, height);
    langApp.draw(ctx, width, height, mouseX, mouseY, fingerScreenX, fingerScreenY);
    requestAnimationFrame(loop);
  }
  loop();

  return langApp;
}
