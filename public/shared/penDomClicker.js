// ═══════════════════════════════════════════════════════════════
//  shared/penDomClicker.js — makes EVERY ordinary page button, link
//  and clickable card work with the IR pen, in every app.
//
//  Called by irPenTracker.js on each camera frame. It maps the pen
//  through the wall calibration (stored as 0-1 of the whole window,
//  see /calibrate/), finds the clickable element under the pen, and
//  after a short hold fires a real .click() on it — with a progress
//  ring so you can see it filling.
//
//  Apps that already have their own pen-dwell clicking keep working:
//  if anything else clicks the element while the pen is on it, this
//  clicker stands down for that element until the pen leaves it, so
//  nothing is ever clicked twice. Canvas games are left alone (they
//  do their own hit-testing).
// ═══════════════════════════════════════════════════════════════
import { applyHomography } from "./homography.js";
import { calStorageKey } from "./inputConfig.js";

const DWELL_MS = 900;        // a bit longer than the apps' own bridges (700 ms) so they win
const LOST_GRACE_MS = 300;   // pen dropouts shorter than this keep the hold
const AWAY_GRACE_MS = 250;   // pen briefly elsewhere (flicker/reflection) keeps the hold
const RING_R = 26;

const CLICKABLE =
  "button, a[href], [onclick], [role=button], [role=tab], [role=link], " +
  "input[type=button], input[type=submit], input[type=checkbox], input[type=radio], label[for], summary";

let calH = null, calRaw = null;
let target = null, start = 0, lostSince = 0, awaySince = 0;
let blocked = null;          // element some other code clicked while we hovered it
let ringEl = null, ringArc = null;
let listening = false;

function loadCal() {
  let raw = null;
  try { raw = localStorage.getItem(calStorageKey()); } catch (e) { /* ignore */ }
  if (raw === calRaw) return calH;
  calRaw = raw;
  calH = null;
  try { const d = JSON.parse(raw || "null"); if (d && d.homography) calH = d.homography; } catch (e) { /* ignore */ }
  return calH;
}

// Apps draw their own pen cursor; if it doesn't let clicks through, look underneath it.
function isCursorLayer(n) {
  for (; n && n !== document.body; n = n.parentElement) {
    if (ringEl && n === ringEl) return true;
    const tag = (n.id || "") + " " + (typeof n.className === "string" ? n.className : (n.getAttribute && n.getAttribute("class")) || "");
    if (/cursor/i.test(tag)) return true;
  }
  return false;
}

function clickableAt(x, y) {
  const stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)];
  const el = stack.find(n => n && !isCursorLayer(n));
  if (!el || el.tagName === "CANVAS" || el.tagName === "HTML" || el.tagName === "BODY") return null;
  let c = el.closest(CLICKABLE);
  if (!c) {
    // cards / tiles wired up with addEventListener: they show a hand cursor
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.tagName === "CANVAS") return null;
      try { if (getComputedStyle(n).cursor === "pointer") { c = n; break; } } catch (e) { break; }
    }
  }
  if (!c || c.disabled || c.getAttribute("aria-disabled") === "true") return null;
  if (c.closest(".wall-cal-stage")) return null;
  if (c.closest("[data-pen-own]")) return null; // the app handles the pen on these itself
  return c;
}

function ensureRing() {
  if (ringEl) return;
  const NS = "http://www.w3.org/2000/svg";
  ringEl = document.createElementNS(NS, "svg");
  const s = RING_R * 2 + 8;
  ringEl.setAttribute("width", s); ringEl.setAttribute("height", s);
  ringEl.style.cssText = `position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;display:none;` +
    `margin:-${s / 2}px 0 0 -${s / 2}px;filter:drop-shadow(0 0 4px rgba(0,0,0,.6))`;
  const bg = document.createElementNS(NS, "circle");
  bg.setAttribute("cx", s / 2); bg.setAttribute("cy", s / 2); bg.setAttribute("r", RING_R);
  bg.setAttribute("fill", "rgba(255,255,255,0.18)"); bg.setAttribute("stroke", "rgba(255,255,255,0.7)"); bg.setAttribute("stroke-width", "3");
  ringArc = document.createElementNS(NS, "circle");
  ringArc.setAttribute("cx", s / 2); ringArc.setAttribute("cy", s / 2); ringArc.setAttribute("r", RING_R);
  ringArc.setAttribute("fill", "none"); ringArc.setAttribute("stroke", "#3ecf8c"); ringArc.setAttribute("stroke-width", "6");
  ringArc.setAttribute("stroke-linecap", "round");
  ringArc.setAttribute("transform", `rotate(-90 ${s / 2} ${s / 2})`);
  const C = 2 * Math.PI * RING_R;
  ringArc.setAttribute("stroke-dasharray", C);
  ringArc.setAttribute("stroke-dashoffset", C);
  ringEl.appendChild(bg); ringEl.appendChild(ringArc);
  (document.body || document.documentElement).appendChild(ringEl);
}

function showRing(x, y, p) {
  ensureRing();
  ringEl.style.display = "block";
  ringEl.style.transform = `translate(${x}px, ${y}px)`;
  const C = 2 * Math.PI * RING_R;
  ringArc.setAttribute("stroke-dashoffset", String(C * (1 - Math.max(0, Math.min(1, p)))));
}
function hideRing() { if (ringEl) ringEl.style.display = "none"; }

// A full press at the pen position, so apps listening for pointer/mouse events
// (or reading clientX/clientY) react exactly as they do to a real tap.
function fireClick(el, x, y) {
  const o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0 };
  const P = window.PointerEvent || MouseEvent;
  try {
    el.dispatchEvent(new P("pointerdown", { ...o, pointerId: 1, pointerType: "pen", isPrimary: true, buttons: 1 }));
    el.dispatchEvent(new MouseEvent("mousedown", { ...o, buttons: 1 }));
    el.dispatchEvent(new P("pointerup", { ...o, pointerId: 1, pointerType: "pen", isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mouseup", o));
  } catch (e) { /* ignore */ }
  el.click(); // real activation: links navigate, checkboxes toggle, forms submit
}

function reset() { target = null; start = 0; awaySince = 0; hideRing(); }

/** @param {number} camX @param {number} camY  pen in camera px, or < 0 when not seen */
export function penDomClickerUpdate(camX, camY) {
  if (!listening) {
    listening = true;
    // Someone else (the app's own bridge, a mouse) clicked what we're on → stand down for it.
    document.addEventListener("click", e => {
      if (target && e.target instanceof Node && (target === e.target || target.contains(e.target) || e.target.contains(target))) {
        blocked = target; reset();
      }
    }, true);
  }
  const t = performance.now();
  if (!document.body || !loadCal()) { reset(); return; }

  if (camX < 0 || camY < 0) {
    if (!lostSince) lostSince = t;
    if (t - lostSince > LOST_GRACE_MS) { reset(); blocked = null; }
    return;
  }
  if (lostSince && target) start += t - lostSince; // don't count the dropout
  lostSince = 0;

  const n = applyHomography(calH, [camX, camY]);
  if (!n) { reset(); return; }
  const x = n[0] * window.innerWidth, y = n[1] * window.innerHeight;
  const el = clickableAt(x, y);

  if (blocked && el !== blocked) blocked = null; // pen left the element the app clicked
  if (el && el === blocked) { hideRing(); return; }

  if (el !== target) {
    if (target && !el) {
      // pen briefly off the element: keep the hold for a moment
      if (!awaySince) awaySince = t;
      if (t - awaySince < AWAY_GRACE_MS) return;
    }
    reset();
    if (!el) return;
    target = el; start = t;
  }
  if (!target) return; // pen is over nothing clickable
  awaySince = 0;

  const p = (t - start) / DWELL_MS;
  showRing(x, y, p);
  if (p >= 1) {
    const el2 = target;
    reset();
    blocked = el2; // one click per visit: move off and back on to click again
    try { el2.focus && el2.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    fireClick(el2, x, y);
  }
}
