# Animal Languages — Finger &amp; Touch Pointer (browser version)

A pure browser port of your `AnimalLangauges` p5.js/ml5 project — same
hub-and-spoke language diagram, same calibration flow, same animal
pictures and audio — rebuilt in vanilla JS + Canvas2D. MediaPipe's
`HandLandmarker` (via `@mediapipe/tasks-vision`, WASM, runs entirely
in-browser) stands in for `ml5.handPose`. No p5.js/ml5 libraries needed.

| p5.js/ml5 version | Browser (vanilla) version |
|---|---|
| `p5.js` canvas + `draw()` loop | HTML `<canvas>` + `requestAnimationFrame` |
| `ml5.handPose({ maxHands: 1 })` | `HandLandmarker` (`numHands: 1`) via `@mediapipe/tasks-vision` |
| hand-rolled DLT + power-iteration SVD | normalized DLT + Jacobi eigen-solver (`js/homography.js`) — same math |
| `localStorage` | same, one `animalLanguagesCalibration` key |
| real DOM `<img>` for the center GIF | same approach, kept as-is (`js/animals.js`) |
| `window.speechSynthesis` (English) | same, unchanged |
| bundled `audio/*.mp3` (Hindi/Telugu) | same, unchanged |

Behavior is the same as the original:

- **Calibration**: a 3×3 grid of dots appears. Point your index finger at
  the pulsing dot and hold it still for 2 seconds to capture it (click/tap
  also works as a fallback). After 9 points, it computes a homography and
  saves it to your browser's local storage.
- **App**: point at, click, or tap a language circle (English / Hindi /
  Telugu) to hear the animal's name spoken. English uses the browser's
  built-in text-to-speech; Hindi and Telugu play the bundled local audio
  files (most browsers/OSes have no installed Telugu voice at all, so a
  bundled recording is what actually makes Telugu work reliably).
- Hold over — or click/tap — **Next**/**Prev** to change animals.
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
afterward. All animal pictures (`AnimalsGif/`) and Hindi/Telugu audio
(`audio/`) are bundled in this folder already, exactly as in the original.

## Notes / things that differ slightly from the p5.js/ml5 version

- **No native window** — runs in a browser tab, sized to 80%×80% of your
  browser window (same proportions as the original `CANVAS_SCALE_W/H`),
  and resizes live if you resize the window.
- **Homography math**: normalized DLT + a hand-written Jacobi eigen-solver
  (`js/homography.js`) instead of the original's power-iteration SVD —
  same underlying math, verified against known affine and perspective
  transforms with near-zero reprojection error.
- **Calibration storage**: one JSON blob in `localStorage` instead of the
  original's format — functionally identical. Use "Save Calibration Copy"
  on the results screen to download a timestamped JSON backup.
- Requires a reasonably modern browser with WebGL/WASM support (any recent
  Chrome, Edge, or Firefox works well; Safari should work too — the English
  voice list and available system voices can vary by OS/browser either way).

## File layout

```
AnimalLanguages-web/
├── index.html
├── style.css
├── js/
│   ├── main.js         ← calibration flow + app orchestration (HandCaliManager.js + parts of AnimalLangauges.js)
│   ├── langApp.js       ← language-diagram drawing, speech, navigation (rest of AnimalLangauges.js)
│   ├── animals.js       ← animal data table + center-image overlay
│   ├── handTracker.js   ← webcam + MediaPipe HandLandmarker (single hand)
│   └── homography.js    ← DLT homography solver
├── AnimalsGif/           ← animal picture GIFs (bundled, unchanged)
└── audio/                ← Hindi/Telugu mp3s (bundled, unchanged)
```
