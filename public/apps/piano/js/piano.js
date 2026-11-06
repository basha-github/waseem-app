// ═══════════════════════════════════════════════════════════════
//  piano.js — layout, audio, animation, drawing.
//  Browser (Canvas2D) port of Piano.js.
//  Top half  : colourful title banner
//  Bottom half: piano keys in vibrant per-key colours
//  Input     : mouse/touch click-and-hold, or fingertip(s) via canvas coords
// ═══════════════════════════════════════════════════════════════

// ─── Note / scale constants ──────────────────────────────────────────────
export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const WHITE_SEQ = ["C", "D", "E", "F", "G", "A", "B"];
const BLACK_MAP = { 0: "C#", 1: "D#", 3: "F#", 4: "G#", 5: "A#" };
const N_OCTAVES = 2;
const GAP = 6;
const BLACK_GAP = 4;
const CORNER_R = 10;
const MUSIC_ICONS = ["♩", "♪", "♫", "♬", "𝄞", "𝄢"];

// ─── Funky key colours (one per white-key step C D E F G A B) ────────────
const FUNKY_WHITE = [
  [255, 55, 120],   // C — hot pink
  [255, 130, 25],   // D — neon orange
  [230, 220, 0],    // E — electric yellow
  [30, 215, 90],    // F — lime green
  [0, 190, 255],    // G — sky cyan
  [140, 70, 255],   // A — vivid violet
  [255, 40, 210],   // B — magenta
];
const FUNKY_BLACK = [
  [255, 120, 180],  // C# — light pink
  [255, 180, 80],   // D# — peach
  [80, 255, 160],   // F# — mint
  [80, 220, 255],   // G# — aqua
  [200, 140, 255],  // A# — lavender
];

const TITLE_TEXT = "WISDOM PLAY SCHOOL PIANO";
const TITLE_COLORS = [
  [255, 55, 120], [255, 130, 25], [230, 200, 0], [30, 190, 90],
  [0, 170, 255], [140, 70, 255], [255, 40, 150],
];

const HINT_MS = 5000;      // hint text visible/fading window (was frameCount < 300 @60fps)
const HINT_FADE_START_MS = 4000;

const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function roundRect(ctx, x, y, w, h, tl, tr, br, bl) {
  if (tr === undefined) tr = tl;
  if (br === undefined) br = tl;
  if (bl === undefined) bl = tr;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

function ellipsePath(ctx, cx, cy, w, h) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0, w / 2), Math.max(0, h / 2), 0, 0, Math.PI * 2);
}

export class Piano {
  constructor() {
    this.audioCtx = null;
    this.activeOsc = {};
    this.activeKeys = new Set();
    this.hovered = new Set();

    this.octave = 4;
    this.whites = [];
    this.blacks = [];
    this.wW = this.wH = this.bW = this.bH = 0;

    this.particles = [];
    this.ripples = [];
    this._lastSpawnAt = {};

    this.startedAt = performance.now();
  }

  // ── Web Audio ────────────────────────────────────────────────────────
  getCtx() {
    if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return this.audioCtx;
  }

  unlockAudio() {
    const ctx = this.getCtx();
    if (ctx.state !== "running") ctx.resume().catch(() => {});
  }

  noteFreq(name, oct) {
    const n = NOTE_NAMES.indexOf(name);
    return 440 * Math.pow(2, ((oct - 4) * 12 + n - 9) / 12);
  }

  playNote(name, oct, id) {
    if (this.activeOsc[id]) return;
    const ctx = this.getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(this.noteFreq(name, oct), ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.012);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    this.activeOsc[id] = { osc, gain };
  }

  stopNote(id) {
    if (!this.activeOsc[id]) return;
    const { osc, gain } = this.activeOsc[id];
    const ctx = this.getCtx();
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.18);
    osc.stop(ctx.currentTime + 0.2);
    delete this.activeOsc[id];
  }

  stopAllNotes() {
    for (const id of this.activeKeys) this.stopNote(id);
    this.activeKeys.clear();
  }

  // ── Layout ───────────────────────────────────────────────────────────
  buildLayout(canvasW, canvasH) {
    const pianoH = canvasH * 0.5;
    const totalGaps = (WHITE_SEQ.length * N_OCTAVES + 1 + 1) * GAP;
    this.wW = Math.floor((canvasW - totalGaps) / (WHITE_SEQ.length * N_OCTAVES + 1));
    this.wH = Math.min(Math.round(pianoH * 0.88), Math.round(this.wW * 5.5));
    this.bW = Math.round(this.wW * 0.55);
    this.bH = Math.round(this.wH * 0.6);

    this.whites = [];
    this.blacks = [];
    let bi = 0, wi = 0;
    for (let o = 0; o < N_OCTAVES; o++) {
      for (let i = 0; i < WHITE_SEQ.length; i++) {
        const x = GAP + wi * (this.wW + GAP);
        this.whites.push({ note: WHITE_SEQ[i], oct: this.octave + o, x, wi: wi % 7 });
        if (BLACK_MAP[i] !== undefined) {
          const bx = x + this.wW - Math.round(this.bW * 0.42);
          this.blacks.push({ note: BLACK_MAP[i], oct: this.octave + o, x: bx + BLACK_GAP / 2, bi });
          bi++;
        }
        wi++;
      }
    }
    this.whites.push({ note: "C", oct: this.octave + N_OCTAVES, x: GAP + wi * (this.wW + GAP), wi: 0 });
  }

  keyboardY(canvasH) {
    return Math.round(canvasH * 0.52);
  }

  keyAt(mx, my) {
    for (const k of this.blacks) {
      if (mx >= k.x && mx <= k.x + this.bW - BLACK_GAP && my >= 0 && my <= this.bH) return k;
    }
    for (const k of this.whites) {
      if (mx >= k.x && mx <= k.x + this.wW && my >= 0 && my <= this.wH) return k;
    }
    return null;
  }

  keyColour(k) {
    if (k.note.includes("#")) return FUNKY_BLACK[k.bi % FUNKY_BLACK.length];
    return FUNKY_WHITE[k.wi % 7];
  }

  spawnParticles(x, y, col) {
    const count = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 30,
        y,
        icon: MUSIC_ICONS[Math.floor(Math.random() * MUSIC_ICONS.length)],
        vx: (Math.random() - 0.5) * 2.5,
        vy: -(2.2 + Math.random() * 3.0),
        life: 1.0,
        decay: 0.01 + Math.random() * 0.01,
        size: 20 + Math.floor(Math.random() * 24),
        rot: (Math.random() - 0.5) * 0.08,
        angle: (Math.random() - 0.5) * 0.3,
        r: col[0], g: col[1], b: col[2],
      });
    }
    this.ripples.push({
      x, y: y + this.wH * 0.3,
      r: 0, maxR: this.wW * 3,
      life: 1.0,
      r2: col[0], g2: col[1], b2: col[2],
    });

    if (this.particles.length > 220) this.particles.splice(0, this.particles.length - 220);
    if (this.ripples.length > 24) this.ripples.splice(0, this.ripples.length - 24);
  }

  // ── Top-half title banner ───────────────────────────────────────────
  drawFunkyTop(ctx, width, height) {
    const topH = height * 0.5;
    const beat = this.activeKeys.size > 0 ? 1.08 : 1.0;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fs = Math.min(width * 0.052, topH * 0.22);
    ctx.font = `bold ${fs}px serif`;

    const letters = TITLE_TEXT.split("");
    const widths = letters.map(ch => ctx.measureText(ch).width);
    const totalW = widths.reduce((a, b) => a + b, 0);
    const cy = topH / 2;
    let x = width / 2 - totalW / 2;

    for (let i = 0; i < letters.length; i++) {
      const col = TITLE_COLORS[i % TITLE_COLORS.length];
      ctx.save();
      ctx.translate(x + widths[i] / 2, cy);
      ctx.scale(beat, beat);
      ctx.fillStyle = rgb(col);
      ctx.fillText(letters[i], 0, 0);
      ctx.restore();
      x += widths[i];
    }
    ctx.restore();

    // Divider glow line
    for (let i = 0; i < 3; i++) {
      const alpha = (beat > 1 ? 120 - i * 30 : 60 - i * 15) / 255;
      ctx.save();
      ctx.strokeStyle = `rgba(180,100,255,${alpha})`;
      ctx.lineWidth = 1.5 - i * 0.4;
      ctx.beginPath();
      ctx.moveTo(0, topH + i * 2);
      ctx.lineTo(width, topH + i * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Input reticle — drawn once per touch point (mouse/touch + each hand) ──
  drawReticle(ctx, width, height, x, y, active) {
    const overKey = this.keyAt(x, y - this.keyboardY(height));
    const col = overKey ? this.keyColour(overKey) : [0, 229, 255];

    ctx.save();
    ctx.fillStyle = rgb(col, active ? 60 / 255 : 28 / 255);
    ellipsePath(ctx, x, y, active ? 58 : 44, active ? 58 : 44);
    ctx.fill();

    ctx.strokeStyle = rgb(col, active ? 230 / 255 : 140 / 255);
    ctx.lineWidth = active ? 2.5 : 1.5;
    ellipsePath(ctx, x, y, active ? 32 : 24, active ? 32 : 24);
    ctx.stroke();

    ctx.fillStyle = rgb(col, active ? 1 : 180 / 255);
    ellipsePath(ctx, x, y, active ? 12 : 8, active ? 12 : 8);
    ctx.fill();

    ctx.strokeStyle = rgb(col, active ? 160 / 255 : 90 / 255);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 20, y); ctx.lineTo(x - 14, y);
    ctx.moveTo(x + 14, y); ctx.lineTo(x + 20, y);
    ctx.moveTo(x, y - 20); ctx.lineTo(x, y - 14);
    ctx.moveTo(x, y + 14); ctx.lineTo(x, y + 20);
    ctx.stroke();
    ctx.restore();
  }

  // ── Main draw ─────────────────────────────────────────────────────────
  // touchPoints: [{x, y}, ...] in canvas coords — mouse/touch point (if
  // currently down) plus every tracked hand's fingertip.
  draw(ctx, width, height, touchPoints) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);

    this.drawFunkyTop(ctx, width, height);

    const ky = this.keyboardY(height);
    const touchedIds = new Set();

    for (const pt of touchPoints) {
      const localY = pt.y - ky;
      const touched = this.keyAt(pt.x, localY);
      if (touched) touchedIds.add(touched.note + touched.oct);
    }

    for (const id of touchedIds) {
      if (!this.activeKeys.has(id)) {
        const touched = this.whites.find(k => k.note + k.oct === id) ||
                         this.blacks.find(k => k.note + k.oct === id);
        if (touched) {
          this.activeKeys.add(id);
          this.playNote(touched.note, touched.oct, id);
          const last = this._lastSpawnAt[id] ?? -Infinity;
          const nowMs = performance.now();
          if (nowMs - last > 90) {
            this._lastSpawnAt[id] = nowMs;
            const col = this.keyColour(touched);
            const cx = touched.x + (touched.note.includes("#") ? this.bW / 2 : this.wW / 2);
            this.spawnParticles(cx, ky, col);
          }
        }
      }
    }
    for (const id of Array.from(this.activeKeys)) {
      if (!touchedIds.has(id)) { this.stopNote(id); this.activeKeys.delete(id); }
    }
    this.hovered = touchedIds;

    // Ambient glow behind keys
    ctx.save();
    ctx.fillStyle = "rgba(60,20,120,0.07)";
    ellipsePath(ctx, width / 2, ky + this.wH / 2, width * 1.1, this.wH * 1.6);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(0, ky);

    // Ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rp = this.ripples[i];
      rp.r += (rp.maxR - rp.r) * 0.09;
      rp.life -= 0.03;
      if (rp.life <= 0) { this.ripples.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(${rp.r2},${rp.g2},${rp.b2},${rp.life * 100 / 255})`;
      ctx.lineWidth = 2.5 * rp.life;
      ellipsePath(ctx, rp.x, rp.y, rp.r * 2, rp.r * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${rp.r2},${rp.g2},${rp.b2},${rp.life * 40 / 255})`;
      ctx.lineWidth = 5 * rp.life;
      ellipsePath(ctx, rp.x, rp.y, rp.r * 1.4, rp.r * 1.4);
      ctx.stroke();
    }

    // White keys
    for (const k of this.whites) {
      const id = k.note + k.oct;
      const on = this.activeKeys.has(id);
      const hov = this.hovered.has(id);
      const [fr, fg, fb] = FUNKY_WHITE[k.wi % 7];

      ctx.fillStyle = "rgba(0,0,0,0.196)";
      roundRect(ctx, k.x + 3, 4, this.wW, this.wH, CORNER_R); ctx.fill();

      ctx.fillStyle = on
        ? `rgb(${Math.min(fr + 80, 255)},${Math.min(fg + 80, 255)},${Math.min(fb + 80, 255)})`
        : "#fff";
      roundRect(ctx, k.x, 0, this.wW, this.wH, CORNER_R); ctx.fill();

      ctx.strokeStyle = rgb([fr, fg, fb], (on ? 255 : hov ? 220 : 160) / 255);
      ctx.lineWidth = on ? 3 : hov ? 2.5 : 1.8;
      roundRect(ctx, k.x, 0, this.wW, this.wH, CORNER_R); ctx.stroke();

      if (on) {
        ctx.fillStyle = "rgba(255,255,255,0.235)";
        roundRect(ctx, k.x + 4, 4, this.wW - 8, this.wH * 0.32, CORNER_R - 2, CORNER_R - 2, 0, 0);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(255,255,255,${(on ? 90 : 40) / 255})`;
      roundRect(ctx, k.x + 2, 0, this.wW - 4, 4, CORNER_R, CORNER_R, 0, 0); ctx.fill();

      if (on) {
        ctx.strokeStyle = rgb([fr, fg, fb], 120 / 255);
        ctx.lineWidth = 2.5;
        roundRect(ctx, k.x - 2, -2, this.wW + 4, this.wH + 4, CORNER_R + 2);
        ctx.stroke();
      }

      ctx.font = `${Math.max(9, this.wW * 0.27)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = on
        ? "rgba(255,255,255,1)"
        : rgb([fr * 0.7, fg * 0.7, fb * 0.7], (hov ? 230 : 200) / 255);
      ctx.fillText(k.note + k.oct, k.x + this.wW / 2, this.wH - 6);
    }

    // Black keys
    for (const k of this.blacks) {
      const id = k.note + k.oct;
      const on = this.activeKeys.has(id);
      const hov = this.hovered.has(id);
      const [fr, fg, fb] = FUNKY_BLACK[k.bi % FUNKY_BLACK.length];

      ctx.fillStyle = "rgba(0,0,0,0.353)";
      roundRect(ctx, k.x + BLACK_GAP / 2 + 2, 3, this.bW - BLACK_GAP, this.bH, 0, 0, CORNER_R - 2, CORNER_R - 2);
      ctx.fill();

      ctx.fillStyle = on ? rgb([fr, fg, fb], 240 / 255) : "#fff";
      roundRect(ctx, k.x + BLACK_GAP / 2, 0, this.bW - BLACK_GAP, this.bH, 0, 0, CORNER_R - 2, CORNER_R - 2);
      ctx.fill();

      ctx.strokeStyle = rgb([fr, fg, fb], (on ? 255 : hov ? 220 : 160) / 255);
      ctx.lineWidth = on ? 2.5 : hov ? 2 : 1.5;
      roundRect(ctx, k.x + BLACK_GAP / 2, 0, this.bW - BLACK_GAP, this.bH, 0, 0, CORNER_R - 2, CORNER_R - 2);
      ctx.stroke();

      ctx.fillStyle = `rgba(255,255,255,${(on ? 50 : 20) / 255})`;
      roundRect(ctx, k.x + BLACK_GAP / 2 + 3, 0, this.bW - BLACK_GAP - 6, 5, 0, 0, 2, 2);
      ctx.fill();

      if (on) {
        ctx.strokeStyle = rgb([fr, fg, fb], 130 / 255);
        ctx.lineWidth = 2.5;
        roundRect(ctx, k.x + BLACK_GAP / 2 - 3, -3, this.bW - BLACK_GAP + 6, this.bH + 6, CORNER_R);
        ctx.stroke();
      }

      ctx.font = `${Math.max(8, this.bW * 0.22)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = on
        ? "rgba(255,255,255,1)"
        : rgb([fr * 0.75, fg * 0.75, fb * 0.75], (hov ? 220 : 180) / 255);
      ctx.fillText(k.note.replace("#", "♯"), k.x + this.bW / 2, this.bH - 5);
    }

    ctx.restore(); // end keyboard translate

    // Input reticle(s)
    for (const pt of touchPoints) {
      const onKey = this.keyAt(pt.x, pt.y - ky) !== null;
      this.drawReticle(ctx, width, height, pt.x, pt.y, onKey);
    }

    // Floating music note particles
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vy *= 0.97;
      pt.vx *= 0.98;
      pt.angle += pt.rot;
      pt.life -= pt.decay;
      if (pt.life <= 0) { this.particles.splice(i, 1); continue; }
      const sc = 0.6 + pt.life * 0.7;
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.angle);

      ctx.fillStyle = `rgba(${pt.r},${pt.g},${pt.b},${pt.life * 0.18})`;
      ellipsePath(ctx, 0, 0, pt.size * sc * 2.2, pt.size * sc * 2.2);
      ctx.fill();

      ctx.font = `${pt.size * sc}px serif`;
      ctx.lineWidth = Math.max(1, pt.size * sc * 0.06);
      ctx.strokeStyle = `rgba(${pt.r},${pt.g},${pt.b},${pt.life})`;
      ctx.strokeText(pt.icon, 0, 0);
      ctx.fillStyle = `rgba(255,255,255,${pt.life})`;
      ctx.fillText(pt.icon, 0, 0);
      ctx.restore();
    }

    // Hint (first ~5 seconds)
    const elapsed = performance.now() - this.startedAt;
    if (elapsed < HINT_MS) {
      const a = elapsed < HINT_FADE_START_MS
        ? 180
        : Math.max(0, 180 * (1 - (elapsed - HINT_FADE_START_MS) / (HINT_MS - HINT_FADE_START_MS)));
      ctx.save();
      ctx.fillStyle = `rgba(200,180,255,${a / 255})`;
      ctx.font = "13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Click and hold, or point at, a key to play", width / 2, height * 0.51 - 18);
      ctx.restore();
    }

    // Audio-locked banner
    if (!this.audioCtx || this.audioCtx.state !== "running") {
      ctx.save();
      ctx.fillStyle = "rgba(255,60,90,0.902)";
      roundRect(ctx, width / 2 - 190, 10, 380, 34, 10);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🔇 Click anywhere, tap, or press any key once to enable sound", width / 2, 27);
      ctx.restore();
    }
  }
}
