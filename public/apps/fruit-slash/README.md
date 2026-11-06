# Fruit Slash — Finger &amp; Touch Swipe (browser version)

A pure browser port of your `FruitNinja` p5.js/ml5 project — same falling
fruit, same swipe-to-slice physics, same sunny background — rebuilt in
vanilla JS + Canvas2D. MediaPipe's `HandLandmarker` (via
`@mediapipe/tasks-vision`, WASM, runs entirely in-browser) stands in for
`ml5.handPose`. No p5.js/ml5 libraries needed.

| p5.js/ml5 version | Browser (vanilla) version |
|---|---|
| `p5.js` canvas + `draw()` loop | HTML `<canvas>` + `requestAnimationFrame` |
| `ml5.handPose({ maxHands: 1 })` | `HandLandmarker` (`numHands: 1`) via `@mediapipe/tasks-vision` |
| hand-rolled DLT + power-iteration SVD | normalized DLT + Jacobi eigen-solver (`js/homography.js`) — same math |
| `localStorage` | same, one `fruitSlashCalibration` key |
| `createGraphics()` pre-rendered background | offscreen `<canvas>`, same drawing, built once per resize |
| `noise()` (Perlin) for the hill wobble | a small smoothed value-noise stand-in — visual only, no game effect |
| `mouseDragged`/`mouseClicked`/`touchStarted` | Pointer Events (`pointerdown/move/up`), unifies mouse + touch |
| raw Web Audio slice sound | same, ported almost line-for-line |

Behavior is the same as the original:

- **Calibration**: a 3×3 grid of dots appears. Point your index finger at
  the pulsing dot and hold it still for 2 seconds to capture it (click/tap
  also works as a fallback). After 9 points, it computes a homography and
  saves it to your browser's local storage.
- **Game**: fruit falls from the top of the screen. Swipe through it —
  with your mouse, a finger on a touchscreen, or by pointing at the screen
  after calibrating — to slice it into two halves with juice sparks and a
  star burst. A plain click/tap (no real drag) slices whatever's directly
  underneath it.
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
afterward. The 7 fruit images referenced by the game (watermelon, mango,
banana, kiwi, coconut, icecream, grape) are bundled in this folder
already; a fruit falls back to a colourful emoji circle if its image is
ever missing.

## Notes / things that differ slightly from the p5.js/ml5 version

- **No native window** — runs in a browser tab, sized to 80%×80% of your
  browser window plus the same +200px off-screen buffer the original
  added, and resizes live if you resize the window.
- **Homography math**: normalized DLT + a hand-written Jacobi eigen-solver
  (`js/homography.js`) instead of the original's power-iteration SVD —
  same underlying math, verified against known affine and perspective
  transforms with near-zero reprojection error.
- **Slice mechanics verified**: a fast swipe through a fruit slices it
  (score++, 2 half-pieces, 28 juice sparks, 8 star-pops — matching the
  original's exact counts); a slow drag under the 28px/event speed
  threshold does not; a plain click/tap slices whatever's directly under
  it. All confirmed with an automated test before shipping.
- The commented-out score/combo HUD in the original stays commented out
  here too (score is still tracked internally, just not drawn), and the
  unused `apple.png`/`donut.png`/etc. leftover assets in the original
  project weren't bundled since `FRUIT_DEFS` never references them.
- Requires a reasonably modern browser with WebGL/WASM + Web Audio support
  (any recent Chrome, Edge, or Firefox works well; Safari should work too).

## File layout

```
FruitSlash-web/
├── index.html
├── style.css
├── js/
│   ├── main.js         ← calibration flow + app orchestration (HandCaliManager.js + calibration half of FruitNinja.js)
│   ├── fruitGame.js     ← fruit/pieces/sparks/stars, background, slicing, sound (game half of FruitNinja.js)
│   ├── handTracker.js   ← webcam + MediaPipe HandLandmarker (single hand)
│   └── homography.js    ← DLT homography solver
├── watermelon.png, mango.png, banana.png, kiwi.png,
├── coconut.png, icecream.png, grape.png   ← bundled fruit sprites (unchanged)
```
