# Wall Alphabets — Finger Pointer (browser version)

This is a pure browser port of the Python app (which was itself a port of
your original p5.js/ml5 project) — no install, no Python, just a page you
open in Chrome, Edge, or Firefox.

| Python version | Browser version |
|---|---|
| `pygame` (window/canvas) | HTML `<canvas>` |
| `mediapipe` HandLandmarker | `@mediapipe/tasks-vision` (same model, runs in-browser via WASM/WebGL) |
| `cv2.findHomography` | hand-written normalized DLT solver (`js/homography.js`) |
| `pygame.mixer` | HTML `<audio>` elements |
| `calibration_data.json` file | browser `localStorage` |
| `AnimatedImage` (GIF frame stepping) | plain `<img>` — the browser animates GIFs itself |

Behavior is the same as the Python/p5.js versions:

- **Calibration**: a 3×3 grid of dots appears. Point your index finger at
  the pulsing dot and hold it still for 2 seconds to capture it (or click
  with the mouse as a fallback). After 9 points, it computes a homography
  and saves it to your browser's local storage.
- **Main app**: point at the big letter to hear its sound and reveal the
  real-world picture + a typewriter-style caption. Hold over the **Next** /
  **Previous** arrows for ~0.6s to change letters.
- Press **R** any time to wipe the calibration and redo it.
- Press **Esc** to pause tracking (press again to resume).

## 1. Put the files in the right place

Copy this whole folder's contents into the **same folder** as your existing
WallAlphabets assets (`Apple.png`, `Ball.gif`, `Ball.mp3`, `Next.png`,
etc.):

```
WallAlphabets/
├── index.html      ← new
├── style.css       ← new
├── js/             ← new
│   ├── main.js
│   ├── handTracker.js
│   ├── homography.js
│   └── assets.js
├── Apple.png
├── Apple.mp3
├── B.png
├── Ball.gif
├── Ball.mp3
├── ... (all your other images / gifs / mp3s)
```

The page loads assets by filename from its own folder (see `LETTER_DATA` in
`js/assets.js`), so nothing else needs to change. If an image or sound file
is missing, that letter just shows a dashed placeholder box instead of
crashing.

## 2. Serve it over local HTTP (required)

Browsers block camera access and ES module imports on plain
`file://` pages, so you need a tiny local server. From inside the folder:

```bash
# Python 3 (already installed on most systems)
python3 -m http.server 8000

# or, if you have Node:
npx serve .
```

Then open **http://localhost:8000** in Chrome, Edge, or Firefox.

## 3. Use it

Click **"Start camera & begin"**, allow camera access, and follow the
on-screen calibration steps. The first run downloads MediaPipe's
hand-landmark model (~10 MB) from Google's CDN — that's cached by the
browser afterward.

## Notes / things that differ slightly from the Python version

- **No native window** — this runs in a browser tab, sized to 72%×70% of
  your browser window (same proportions as the original `CANVAS_SCALE_W/H`),
  and resizes live if you resize the window.
- **Homography math** is a hand-written normalized DLT + Jacobi
  eigen-solver (`js/homography.js`) instead of `cv2.findHomography` — same
  math (regular least squares, not RANSAC), no native dependency needed.
- **Calibration storage**: saved to your browser's `localStorage` (per
  origin), instead of a `calibration_data.json` file. Use the **"Save
  Calibration Copy"** button on the results screen to download a
  timestamped JSON backup, same as the Python version's auto-export.
- **Camera**: uses whatever camera the browser's camera picker defaults to.
  If you have multiple webcams, use your OS/browser camera settings to pick
  which one `getUserMedia` selects.
- **Sound formats**: MP3 plays natively in all modern browsers, so no
  format conversion should be needed.
- Requires a reasonably modern browser with WebGL/WASM support (any recent
  Chrome, Edge, or Firefox works well). Safari should also work but hasn't
  been extensively tested.

## Extending it

To add more letters, edit `LETTER_DATA` in `js/assets.js` — same shape as
`LETTER_DATA` in `assets.py` / the `LETTERS` array in `WallAlphabets.js`
(`name`, `word`, `img`, `reveal`, `sound`).
