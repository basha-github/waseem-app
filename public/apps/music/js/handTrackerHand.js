// ═══════════════════════════════════════════════════════════════
//  handTracker.js — webcam capture + MediaPipe HandLandmarker.
//  Browser port of hand_tracking.py's HandTracker class.
//  Tracks INDEX_FINGER_TIP (landmark 8), smooths over a couple of
//  frames, and holds the last known position through brief dropouts
//  (mirrors the Python version's rolling-average + grace-period logic).
// ═══════════════════════════════════════════════════════════════
import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

const INDEX_FINGER_TIP = 8;

export class HandTracker {
  static FINGER_SMOOTH_N = 2;
  static FINGER_GRACE_FRAMES = 3;

  constructor({ camW = 640, camH = 480 } = {}) {
    this.camW = camW;
    this.camH = camH;

    this.finger_x = -1;
    this.finger_y = -1;
    this.finger_conf = 0;

    this._history = [];
    this._lostFrames = 0;
    this._landmarker = null;
    this._video = null;
    this._stream = null;
    this._ready = false;
    this._lastVideoTime = -1;
    this.error = null;
  }

  async init(statusCb = () => {}) {
    try {
      statusCb("Loading hand-tracking model…");
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      this._landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.3,
        minHandPresenceConfidence: 0.3,
        minTrackingConfidence: 0.3,
      });

      statusCb("Requesting webcam access…");
      this._video = document.createElement("video");
      this._video.playsInline = true;
      this._video.muted = true;

      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: this.camW }, height: { ideal: this.camH } },
        audio: false,
      });
      this._video.srcObject = this._stream;
      await this._video.play();

      this._ready = true;
      statusCb("");
    } catch (err) {
      this.error = err;
      statusCb(
        "Could not start camera / model: " + (err && err.message ? err.message : err)
      );
      throw err;
    }
  }

  get ready() {
    return this._ready;
  }

  /** Grabs the latest video frame, runs detection, updates finger_x/y/conf. */
  update() {
    if (!this._ready || !this._video || this._video.readyState < 2) return;
    if (this._video.currentTime === this._lastVideoTime) return; // no new frame yet
    this._lastVideoTime = this._video.currentTime;

    const nowMs = performance.now();
    const result = this._landmarker.detectForVideo(this._video, nowMs);

    let tip = null;
    let conf = 0;
    if (result.landmarks && result.landmarks.length > 0) {
      const lm = result.landmarks[0][INDEX_FINGER_TIP];
      // Mirror horizontally to match a natural "point at the screen" feel
      // (equivalent to cv2.flip(frame, 1) in the Python version).
      const x = (1 - lm.x) * this.camW;
      const y = lm.y * this.camH;
      tip = [x, y];
      if (result.handedness && result.handedness[0] && result.handedness[0][0]) {
        conf = Math.max(result.handedness[0][0].score, 0.01);
      } else {
        conf = 1.0;
      }
    }

    if (tip !== null) {
      this._history.push(tip);
      if (this._history.length > HandTracker.FINGER_SMOOTH_N) this._history.shift();
      let ax = 0, ay = 0;
      for (const p of this._history) { ax += p[0]; ay += p[1]; }
      ax /= this._history.length;
      ay /= this._history.length;
      this.finger_x = ax;
      this.finger_y = ay;
      this.finger_conf = conf;
      this._lostFrames = 0;
      return;
    }

    this._lostFrames += 1;
    if (this._lostFrames <= HandTracker.FINGER_GRACE_FRAMES && this.finger_x >= 0) {
      this.finger_conf *= 0.75;
      return;
    }

    this._history = [];
    this.finger_x = -1;
    this.finger_y = -1;
    this.finger_conf = 0;
  }

  release() {
    if (this._stream) this._stream.getTracks().forEach(t => t.stop());
    if (this._landmarker) this._landmarker.close();
  }
}
