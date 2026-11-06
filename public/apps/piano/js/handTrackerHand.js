// ═══════════════════════════════════════════════════════════════
//  handTracker.js — webcam capture + MediaPipe HandLandmarker.
//  Browser port of the ml5 handPose tracking half of
//  HandCaliManager.js (MyPiano's shared calibration/tracking file).
//  Tracks the INDEX_FINGER_TIP of up to two hands at once, so a
//  two-handed piano player can use both.
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
const MIDDLE_FINGER_TIP = 12;

export class HandTracker {
  static FINGER_SMOOTH_N = 2;
  static FINGER_GRACE_FRAMES = 3;

  constructor({ camW = 640, camH = 480, maxHands = 2 } = {}) {
    this.camW = camW;
    this.camH = camH;
    this.maxHands = maxHands;

    // Legacy single-hand fields (primary hand), used by calibration —
    // these get a brief "grace period" hold on dropped frames.
    this.finger_x = -1;
    this.finger_y = -1;
    this.finger_conf = 0;

    // Every detected hand's fingertip this frame: [{x, y, conf}, ...]
    // (no grace period — a hand that drops out this frame just isn't here).
    this.fingers = [];

    this._histories = Array.from({ length: maxHands }, () => []);
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
        numHands: this.maxHands,
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

  /** Grabs the latest video frame, runs detection, updates fingers[] + legacy finger_x/y/conf. */
  update() {
    if (!this._ready || !this._video || this._video.readyState < 2) return;
    if (this._video.currentTime === this._lastVideoTime) return; // no new frame yet
    this._lastVideoTime = this._video.currentTime;

    const nowMs = performance.now();
    const result = this._landmarker.detectForVideo(this._video, nowMs);

    this.fingers = [];
    const handLandmarks = result.landmarks || [];

    for (let i = 0; i < handLandmarks.length && i < this.maxHands; i++) {
      // Track the index fingertip; fall back to the middle fingertip if the
      // model didn't return that landmark for some reason (both are always
      // present in MediaPipe's 21-point hand model, so this is defensive).
      let lm = handLandmarks[i][INDEX_FINGER_TIP] || handLandmarks[i][MIDDLE_FINGER_TIP];
      if (!lm) continue;

      let conf = 1.0;
      if (result.handednesses && result.handednesses[i] && result.handednesses[i][0]) {
        conf = Math.max(result.handednesses[i][0].score, 0.01);
      }

      // Mirror horizontally (equivalent to ml5's { flipped: true }).
      const x = (1 - lm.x) * this.camW;
      const y = lm.y * this.camH;

      if (!this._histories[i]) this._histories[i] = [];
      this._histories[i].push([x, y]);
      if (this._histories[i].length > HandTracker.FINGER_SMOOTH_N) this._histories[i].shift();

      let ax = 0, ay = 0;
      for (const p of this._histories[i]) { ax += p[0]; ay += p[1]; }
      ax /= this._histories[i].length;
      ay /= this._histories[i].length;

      this.fingers.push({ x: ax, y: ay, conf });
    }

    if (this.fingers.length > 0) {
      this.finger_x = this.fingers[0].x;
      this.finger_y = this.fingers[0].y;
      this.finger_conf = this.fingers[0].conf;
      this._lostFrames = 0;
      return;
    }

    // Grace period: briefly hold the last known primary-hand position
    // through dropped frames (only affects the legacy single-hand fields,
    // used by calibration — `fingers[]` stays empty this frame).
    this._lostFrames += 1;
    if (this._lostFrames <= HandTracker.FINGER_GRACE_FRAMES && this.finger_x >= 0) {
      this.finger_conf *= 0.75;
      return;
    }

    this._histories = Array.from({ length: this.maxHands }, () => []);
    this.finger_x = -1;
    this.finger_y = -1;
    this.finger_conf = 0;
  }

  release() {
    if (this._stream) this._stream.getTracks().forEach(t => t.stop());
    if (this._landmarker) this._landmarker.close();
  }
}
