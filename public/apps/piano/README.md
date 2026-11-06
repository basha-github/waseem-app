# MyPiano — Finger &amp; Touch Piano (browser version)

A pure browser port of your `MyPiano` p5.js/ml5 project — same visuals,
same calibration flow, same piano — rebuilt in vanilla JS + Canvas2D, with
MediaPipe's `HandLandmarker` (via `@mediapipe/tasks-vision`, WASM, runs
entirely in-browser) standing in for `ml5.handPose`. No p5.js/ml5 libraries
needed any more.

| p5.js/ml5 version | Browser (vanilla) version |
|---|---|
| `p5.js` canvas + `draw()` loop | HTML `<canvas>` + `requestAnimationFrame` |
| `ml5.handPose({ maxHands: 2 })` | `HandLandmarker` (`numHands: 2`) via `@mediapipe/tasks-vision` |
| hand-rolled DLT + power-iteration SVD (`HandCaliManager.js`) | normalized DLT + Jacobi eigen-solver (`js/homography.js`) — same math, numerically verified |
| `localStorage` (`fingerHomography` / `fingerPairs` keys) | `localStorage` (single `myPianoCalibration` key) |
| Web Audio oscillators (`Piano.js`) | same — ported almost line-for-line |
| `mousePressed`/`touchStarted` | Pointer Events (`pointerdown/move/up`), unifies mouse + touch |

Behavior is the same as the original:

- **Calibration**: a 3×3 grid of dots appears. Point your index finger at
  the pulsing dot and hold it still for 2 seconds to capture it (click/tap
  also works as a fallback). After 9 points, it computes a homography and
  saves it to your browser's local storage.
- **Piano**: point at, click, or tap a key to play it. Multiple keys can
  ring at once — chords, and both hands (up to 2 tracked) work
  simultaneously, alongside mouse/touch.
- Colourful particle bursts + ripples on every key press, a title banner,
  and an "enable sound" banner until a real click/tap/keypress unlocks the
  Web Audio context (this is a browser autoplay-policy requirement — no
  code can bypass it, which is why pointing alone can't unlock audio).
- Press **R** any time to wipe the calibration and redo it.
- Press **Esc** to pause tracking (press again to resume).

## 1. Serve it over local HTTP (required)

Browsers block camera access and ES module imports on plain `file://`
pages, so you need a tiny local server. From inside this folder:

```bash
# Python 3 (already installed on most systems)
python3 -m http.server 8000

# or, if you have Node:
npx serve .
```

Then open **http://localhost:8000** in Chrome, Edge, or Firefox.

## 2. Use it

Click **"Start camera & begin"**, allow camera access, and follow the
on-screen calibration steps. The first run downloads MediaPipe's
hand-landmark model (~10 MB) from Google's CDN — cached by the browser
afterward. No other assets are needed; the piano is fully self-contained
(synthesized Web Audio tones, no sound files).

## Notes / things that differ slightly from the p5.js/ml5 version

- **No native window** — runs in a browser tab, sized to 80%×80% of your
  browser window (same proportions as the original `CANVAS_SCALE_W/H`),
  and resizes live if you resize the window.
- **Homography math**: normalized DLT + a hand-written Jacobi eigen-solver
  (`js/homography.js`) instead of the original's power-iteration SVD —
  same underlying math (regular least squares), verified against known
  affine and perspective transforms with near-zero reprojection error.
- **Two-hand tracking**: `handTracker.js` tracks up to 2 hands per frame,
  each independently smoothed — mirrors the original's `fingers[]` array.
  The single "primary hand" used for calibration (`finger_x/y`) gets a
  short grace period on dropped frames, exactly like the original.
- **Calibration storage**: one JSON blob in `localStorage` instead of two
  separate keys — functionally identical. Use "Save Calibration Copy" on
  the results screen to download a timestamped JSON backup.
- Requires a reasonably modern browser with WebGL/WASM + Web Audio support
  (any recent Chrome, Edge, or Firefox works well; Safari should work too).

## File layout

```
MyPiano-web/
├── index.html
├── style.css
├── js/
│   ├── main.js         ← calibration flow + app orchestration (HandCaliManager.js + MyPiano.js)
│   ├── piano.js         ← layout, Web Audio synth, particles, drawing (Piano.js)
│   ├── handTracker.js   ← webcam + MediaPipe HandLandmarker (multi-hand)
│   └── homography.js    ← DLT homography solver
```
