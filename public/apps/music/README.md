# My Music — Finger &amp; Touch Instrument Poster (browser version)

A pure browser port of your `MyMusic` p5.js/ml5 project — same
interactive instrument poster, same overlays and sound effects, same
particle animations — rebuilt in vanilla JS + Canvas2D. MediaPipe's
`HandLandmarker` (via `@mediapipe/tasks-vision`, WASM, runs entirely
in-browser) stands in for `ml5.handPose`. No p5.js/ml5 libraries needed.

| p5.js/ml5 version | Browser (vanilla) version |
|---|---|
| `p5.js` canvas + `draw()` loop | HTML `<canvas>` + `requestAnimationFrame` |
| `ml5.handPose({ maxHands: 1 })` | `HandLandmarker` (`numHands: 1`) via `@mediapipe/tasks-vision` |
| hand-rolled DLT + power-iteration SVD | normalized DLT + Jacobi eigen-solver (`js/homography.js`) — same math |
| `localStorage` | same, one `myMusicCalibration` key |
| `p5.sound` `loadSound()`/`.isPlaying()` | HTML `<audio>` elements |
| `push()/translate()/scale()` letterbox | `ctx.save()/translate()/scale()`, same math |

Behavior is the same as the original:

- **Calibration**: a 3×3 grid of dots appears. Point your index finger at
  the pulsing dot and hold it still for 2 seconds to capture it (click/tap
  also works as a fallback). After 9 points, it computes a homography and
  saves it to your browser's local storage.
- **Poster**: point at — or just hover the mouse over, or touch — an
  instrument (drum, keyboard, saxophone, maracas, guitar, trumpet) to play
  it. No click needed: like the original, the pointer/finger position is
  hit-tested every single frame, so proximity alone triggers it.
- Only one instrument animates/plays at a time — touching a new one cancels
  whichever was active, exactly like the original's state machine.
- Each instrument has its own particle effect: drum shockwave ovals,
  guitar string sine-waves, keyboard rising colour bars, saxophone smoke
  swirls, maracas scatter-dot burst, trumpet wavy sound blasts — plus a
  shared ripple ring and floating music-note particles.
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
afterward. The poster image, the 6 instrument overlay images, and the 6
sound files the game actually uses are bundled in this folder already.

## Notes / things that differ slightly from the p5.js/ml5 version

- **No native window** — runs in a browser tab, sized to 80%×80% of your
  browser window, and resizes live if you resize the window. The
  1400×700 poster is letterboxed/scaled uniformly to fit, exactly like
  the original (so hit-zones and artwork never distort).
- **Homography math**: normalized DLT + a hand-written Jacobi eigen-solver
  (`js/homography.js`) instead of the original's power-iteration SVD —
  same underlying math, verified against known affine and perspective
  transforms with near-zero reprojection error.
- **State machine verified**: an automated test confirms hotspot
  hit-testing, the "only one instrument active at a time" exclusivity,
  the fresh-press gate (holding over an instrument doesn't re-spawn
  effects every frame), and the sound-retrigger timing all match the
  original — including each instrument's slightly different per-frame
  "time" increment, which controls how soon a held instrument can replay
  its sound (this is a real quirk of the original code, kept as-is).
- Only the 7 images and 6 sounds actually referenced by the poster's setup
  code were bundled — the original zip had several unused leftover assets
  (old `drum.wav`/`guitar.mp3`/`saxophone.wav` variants, `poster1.png`,
  the "Single key" PNGs, `bongos.wav`, `taste-of-saxophone-*.mp3`) that no
  code path ever touches.
- Requires a reasonably modern browser with WebGL/WASM + Web Audio support
  (any recent Chrome, Edge, or Firefox works well; Safari should work too).

## File layout

```
MyMusic-web/
├── index.html
├── style.css
├── js/
│   ├── main.js         ← calibration flow + poster letterboxing/orchestration (HandCaliManager.js + MyMusic.js)
│   ├── musicPoster.js   ← hotspots, per-instrument state machine, all particle animations (AllPlayers.js)
│   ├── handTracker.js   ← webcam + MediaPipe HandLandmarker (single hand)
│   └── homography.js    ← DLT homography solver
├── poster.jpg
├── drum.png, guitar.png, keyboard.png, maracas.png, sexaphone.png, trumpet.png
└── drum.wav, newkeyboard.wav, newsexa.wav, newMaracus.wav, newguitar.wav, newtrumpet.wav
```
