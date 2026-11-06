// ═══════════════════════════════════════════════════════════════
//  langApp.js — the "app" screen: hub-and-spoke language diagram,
//  speech (Web Speech API for English, bundled mp3s for Hindi/Telugu),
//  Next/Prev navigation, and finger/click interaction.
//  Browser (Canvas2D) port of the app-specific half of AnimalLangauges.js
//  (everything except calibration, which lives in main.js like the
//  other two ports).
// ═══════════════════════════════════════════════════════════════
import { ANIMALS, createAnimalImages, updateAnimalImagePosition, hideAllAnimalImages } from "./animals.js";

const NAV_DWELL_MS = 600;
const NAV_JITTER_GRACE_MS = 200;

const newNavState = () => ({ armed: true, holdStart: null, lastInside: -Infinity });
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const now = () => performance.now();

function rgba(r, g, b, a = 1) { return `rgba(${r},${g},${b},${a})`; }

function ellipsePath(ctx, cx, cy, w, h) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0, w / 2), Math.max(0, h / 2), 0, 0, Math.PI * 2);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class LangApp {
  constructor(imageContainer) {
    this.imageContainer = imageContainer;
    createAnimalImages(imageContainer);

    this.currentAnimal = 0;
    this.nodeRadius = 80;
    this.centerRadius = 135;
    this.spread = 280;
    this.drop = 230;
    this.dropMid = 260;

    this.speakingIndex = -1;
    this.speakPulse = 0;
    this._frame = 0;

    this.availableVoices = [];
    this.refreshVoices();

    this.fingerWasNearNode = [false, false, false];
    this.nextState = newNavState();
    this.prevState = newNavState();

    this.localAudio = null;

    this.centerX = 0;
    this.centerY = 0;
  }

  refreshVoices() {
    if (!("speechSynthesis" in window)) return;
    this.availableVoices = window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      this.availableVoices = window.speechSynthesis.getVoices();
    };
  }

  recalcLayout(width, height) {
    this.centerX = width / 2;
    const scaleFactor = clamp(Math.min(width / 700, height / 760), 0.6, 1.5);
    this.spread = 290 * scaleFactor;
    this.drop = 240 * scaleFactor;
    this.dropMid = 270 * scaleFactor;
    this.nodeRadius = 95 * scaleFactor;
    this.centerRadius = 160 * scaleFactor;

    const topOfDiagram = this.centerRadius + 35 + 35;
    const bottomOfDiagram = this.drop + this.nodeRadius + 55;
    const totalDiagramHeight = topOfDiagram + bottomOfDiagram;
    const topPadding = Math.max(20, (height - 60 - totalDiagramHeight) / 2);
    this.centerY = topPadding + topOfDiagram;
  }

  nodePositions() {
    return [
      { x: this.centerX - this.spread, y: this.centerY + this.drop },
      { x: this.centerX, y: this.centerY + this.dropMid },
      { x: this.centerX + this.spread, y: this.centerY + this.drop },
    ];
  }

  nextButtonRect(width, height) {
    const bw = 140, bh = 56;
    return { x: width - bw - 30, y: height / 2 - bh / 2, w: bw, h: bh };
  }

  prevButtonRect(width, height) {
    const bw = 140, bh = 56;
    return { x: 30, y: height / 2 - bh / 2, w: bw, h: bh };
  }

  // ── speech ───────────────────────────────────────────────────────────
  speak(text, langCode, idx, animal) {
    this.speakingIndex = idx;
    this.speakPulse = 0;

    if (langCode === "en-US") {
      this.speakEnglish(text);
      return;
    }
    const langSuffix = langCode === "hi-IN" ? "hi" : "te";
    this.playLocalAudio(animal.audioKey, langSuffix);
  }

  speakEnglish(text) {
    if (!("speechSynthesis" in window)) { this.speakingIndex = -1; return; }
    if (this.availableVoices.length === 0) this.availableVoices = window.speechSynthesis.getVoices();

    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const match = this.availableVoices.find(v => v.lang === "en-US") ||
                  this.availableVoices.find(v => v.lang && v.lang.toLowerCase().startsWith("en"));
    if (match) utter.voice = match;
    utter.lang = "en-US";
    utter.rate = 0.9;
    utter.onend = () => { this.speakingIndex = -1; };
    utter.onerror = () => { this.speakingIndex = -1; };
    window.speechSynthesis.speak(utter);
  }

  playLocalAudio(audioKey, langSuffix) {
    if (this.localAudio) {
      this.localAudio.pause();
      this.localAudio = null;
    }
    this.localAudio = new Audio(`audio/${audioKey}_${langSuffix}.mp3`);
    this.localAudio.onended = () => { this.speakingIndex = -1; };
    this.localAudio.onerror = () => { this.speakingIndex = -1; };
    this.localAudio.play().catch(() => { this.speakingIndex = -1; });
  }

  // ── click / tap hit-testing (mirrors the original's mousePressed) ─────
  handleClick(mx, my, width, height) {
    const animal = ANIMALS[this.currentAnimal];
    const positions = this.nodePositions();

    for (let i = 0; i < positions.length; i++) {
      if (dist(mx, my, positions[i].x, positions[i].y) < this.nodeRadius) {
        this.speak(animal.data[i].text, animal.data[i].code, i, animal);
        return;
      }
    }

    const nb = this.nextButtonRect(width, height);
    if (mx > nb.x && mx < nb.x + nb.w && my > nb.y && my < nb.y + nb.h) {
      this.currentAnimal = (this.currentAnimal + 1) % ANIMALS.length;
      this.speakingIndex = -1;
      return;
    }
    const pb = this.prevButtonRect(width, height);
    if (mx > pb.x && mx < pb.x + pb.w && my > pb.y && my < pb.y + pb.h) {
      this.currentAnimal = (this.currentAnimal - 1 + ANIMALS.length) % ANIMALS.length;
      this.speakingIndex = -1;
    }
  }

  // ── nav-button dwell hold (identical timing to the letter apps) ───────
  checkNavHold(cx, cy, radius, fingerScreenX, fingerScreenY, state) {
    let d = Infinity;
    if (fingerScreenX >= 0) d = dist(fingerScreenX, fingerScreenY, cx, cy);
    const insideNow = d < radius;
    const t = now();
    if (insideNow) state.lastInside = t;
    const consideredInside = t - state.lastInside < NAV_JITTER_GRACE_MS;

    if (!consideredInside) {
      state.armed = true;
      state.holdStart = null;
      return false;
    }
    if (state.armed) {
      if (state.holdStart === null) state.holdStart = t;
      if (t - state.holdStart >= NAV_DWELL_MS) {
        state.armed = false;
        state.holdStart = null;
        return true;
      }
    }
    return false;
  }

  handleFingerInteractions(fingerScreenX, fingerScreenY, width, height) {
    const animal = ANIMALS[this.currentAnimal];
    const positions = this.nodePositions();

    for (let i = 0; i < positions.length; i++) {
      const isNear = fingerScreenX >= 0 &&
        dist(fingerScreenX, fingerScreenY, positions[i].x, positions[i].y) < this.nodeRadius;
      if (isNear && !this.fingerWasNearNode[i]) {
        this.speak(animal.data[i].text, animal.data[i].code, i, animal);
      }
      this.fingerWasNearNode[i] = isNear;
    }

    const nb = this.nextButtonRect(width, height);
    if (this.checkNavHold(nb.x + nb.w / 2, nb.y + nb.h / 2, Math.max(nb.w, nb.h) / 2 + 10,
        fingerScreenX, fingerScreenY, this.nextState)) {
      this.currentAnimal = (this.currentAnimal + 1) % ANIMALS.length;
      this.speakingIndex = -1;
      this.fingerWasNearNode = [false, false, false];
    }

    const pb = this.prevButtonRect(width, height);
    if (this.checkNavHold(pb.x + pb.w / 2, pb.y + pb.h / 2, Math.max(pb.w, pb.h) / 2 + 10,
        fingerScreenX, fingerScreenY, this.prevState)) {
      this.currentAnimal = (this.currentAnimal - 1 + ANIMALS.length) % ANIMALS.length;
      this.speakingIndex = -1;
      this.fingerWasNearNode = [false, false, false];
    }
  }

  reset() {
    this.fingerWasNearNode = [false, false, false];
    this.nextState = newNavState();
    this.prevState = newNavState();
  }

  // ── drawing ──────────────────────────────────────────────────────────
  drawBackground(ctx, width, height) {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, "rgb(20,10,60)");
    grad.addColorStop(1, "rgb(60,10,100)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  drawConnections(ctx) {
    const positions = this.nodePositions();
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);

    ctx.strokeStyle = "rgb(0,200,255)";
    ctx.beginPath(); ctx.moveTo(this.centerX, this.centerY); ctx.lineTo(positions[0].x, positions[0].y); ctx.stroke();

    ctx.strokeStyle = "rgb(255,200,0)";
    ctx.beginPath(); ctx.moveTo(this.centerX, this.centerY); ctx.lineTo(positions[1].x, positions[1].y); ctx.stroke();

    ctx.strokeStyle = "rgb(0,255,120)";
    ctx.beginPath(); ctx.moveTo(this.centerX, this.centerY); ctx.lineTo(positions[2].x, positions[2].y); ctx.stroke();

    ctx.restore();
  }

  drawCenterNode(ctx) {
    const animal = ANIMALS[this.currentAnimal];
    const cx = this.centerX, cy = this.centerY;
    const pulse = Math.sin(this._frame * 0.05) * 6;

    ctx.save();
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = rgba(255, 50, 150, (150 - i * 40) / 255);
      ctx.lineWidth = 4;
      ellipsePath(ctx, cx, cy, this.centerRadius * 2 + i * 30 + pulse, this.centerRadius * 2 + i * 30 + pulse);
      ctx.stroke();
    }

    ctx.fillStyle = "rgb(40,0,80)";
    ctx.strokeStyle = "rgb(255,50,150)";
    ctx.lineWidth = 3;
    ellipsePath(ctx, cx, cy, this.centerRadius * 2, this.centerRadius * 2);
    ctx.fill();
    ctx.stroke();

    updateAnimalImagePosition(this.currentAnimal, cx, cy, this.centerRadius);

    ctx.fillStyle = "rgb(255,50,150)";
    ctx.font = "26px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(animal.name, cx, cy - this.centerRadius - 35);
    ctx.restore();
  }

  drawNode(ctx, x, y, obj, glowColor, idx) {
    const isSpeaking = this.speakingIndex === idx;
    const pulseExtra = isSpeaking ? Math.sin(this.speakPulse) * 8 : 0;
    const [gr, gg, gb] = glowColor;

    ctx.save();
    for (let i = 0; i < 3; i++) {
      const d = this.nodeRadius * 2 + i * 15 + Math.sin(this._frame * 0.05) * 4 + pulseExtra;
      ctx.strokeStyle = rgba(gr, gg, gb, (150 - i * 40) / 255);
      ctx.lineWidth = 1;
      ellipsePath(ctx, x, y, d, d);
      ctx.stroke();
    }

    ctx.fillStyle = "rgb(10,20,40)";
    ctx.strokeStyle = `rgb(${gr},${gg},${gb})`;
    ctx.lineWidth = isSpeaking ? 4 : 2;
    ellipsePath(ctx, x, y, this.nodeRadius * 2, this.nodeRadius * 2);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = `rgb(${gr},${gg},${gb})`;
    ctx.font = `${this.nodeRadius * 0.27}px Arial`;
    ctx.fillText(obj.lang, x, y - this.nodeRadius * 0.2);

    ctx.fillStyle = "#fff";
    ctx.font = `${this.nodeRadius * 0.24}px Arial`;
    ctx.fillText(obj.text, x, y + this.nodeRadius * 0.3);

    if (isSpeaking) {
      ctx.fillStyle = "#fff";
      ctx.font = `${this.nodeRadius * 0.3}px Arial`;
      ctx.fillText("🔊", x, y - this.nodeRadius * 0.65);
    }
    ctx.restore();
  }

  drawLanguageNodes(ctx) {
    const animal = ANIMALS[this.currentAnimal];
    const p = this.nodePositions();
    this.drawNode(ctx, p[0].x, p[0].y, animal.data[0], [0, 200, 255], 0);
    this.drawNode(ctx, p[1].x, p[1].y, animal.data[1], [255, 200, 0], 1);
    this.drawNode(ctx, p[2].x, p[2].y, animal.data[2], [0, 255, 120], 2);
  }

  drawHint(ctx, width, height) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = "15px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🔊 Tap a language circle to hear it spoken", width / 2, height - 30);
    ctx.restore();
  }

  drawNavButton(ctx, rect, label, mouseX, mouseY, colOn, colOff) {
    const hover = mouseX > rect.x && mouseX < rect.x + rect.w && mouseY > rect.y && mouseY < rect.y + rect.h;
    ctx.save();
    ctx.fillStyle = hover ? colOn : colOff;
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 15);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "18px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.restore();
  }

  drawFingerDot(ctx, fingerScreenX, fingerScreenY) {
    if (fingerScreenX < 0) return;
    ctx.save();
    ctx.fillStyle = "rgba(255,105,180,0.353)";
    ellipsePath(ctx, fingerScreenX, fingerScreenY, 80, 80); ctx.fill();
    ctx.fillStyle = "rgba(255,105,180,1)";
    ellipsePath(ctx, fingerScreenX, fingerScreenY, 44, 44); ctx.fill();
    ctx.fillStyle = "#fff";
    ellipsePath(ctx, fingerScreenX, fingerScreenY, 12, 12); ctx.fill();
    ctx.restore();
  }

  // ── main draw ────────────────────────────────────────────────────────
  draw(ctx, width, height, mouseX, mouseY, fingerScreenX, fingerScreenY) {
    this._frame++;
    this.drawBackground(ctx, width, height);
    this.drawConnections(ctx);
    this.drawCenterNode(ctx);
    this.drawLanguageNodes(ctx);

    const nb = this.nextButtonRect(width, height);
    const pb = this.prevButtonRect(width, height);
    this.drawNavButton(ctx, nb, "NEXT ➜", mouseX, mouseY, "rgb(255,90,150)", "rgb(255,50,120)");
    this.drawNavButton(ctx, pb, "⟜ PREV", mouseX, mouseY, "rgb(90,150,255)", "rgb(50,120,255)");

    this.drawHint(ctx, width, height);

    if (this.speakingIndex >= 0) this.speakPulse += 0.15;

    this.handleFingerInteractions(fingerScreenX, fingerScreenY, width, height);
    this.drawFingerDot(ctx, fingerScreenX, fingerScreenY);
  }

  hideImages() {
    hideAllAnimalImages();
  }
}
