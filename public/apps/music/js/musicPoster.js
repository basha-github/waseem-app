// ═══════════════════════════════════════════════════════════════
//  musicPoster.js — the interactive instrument poster: hotspot
//  hit-testing, per-instrument overlay/sound state machine, and all
//  the particle animations (ripples, drum shockwaves, guitar string
//  waves, keyboard bars, sax smoke, maracas scatter, trumpet blasts,
//  floating music notes). Browser (Canvas2D) port of AllPlayers.js.
//
//  The poster and every hotspot rectangle are authored in a fixed
//  1400×700 "poster space" — main.js letterboxes/scales the canvas
//  to fit that before calling into this module, exactly like the
//  original's push()/translate()/scale() wrapper around musicDraw().
// ═══════════════════════════════════════════════════════════════

export const BASE_W = 1400, BASE_H = 700;

const TWO_PI = Math.PI * 2;
const rand = (a, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randPick = arr => arr[Math.floor(Math.random() * arr.length)];

const MUSIC_NOTES = ["♩", "♪", "♫", "♬", "𝄞"];

const INST_COLORS = {
  drum: [255, 80, 60],
  guitar: [255, 200, 50],
  keyboard: [100, 200, 255],
  sexa: [180, 100, 255],
  maracas: [60, 230, 120],
  trumpt: [255, 160, 40],
};

const INST_CENTRE = {
  drum: [270, 475],
  guitar: [1080, 375],
  keyboard: [220, 287],
  sexa: [660, 472],
  maracas: [1215, 515],
  trumpt: [865, 297],
};

// Hotspot rectangles in poster space: [x1, x2, y1, y2]. Order matters —
// it's the same if/else-if priority order as the original, for spots
// that might ever overlap.
const HOTSPOTS = [
  { name: "drum", x1: 180, x2: 360, y1: 375, y2: 574 },
  { name: "keyboard", x1: 100, x2: 340, y1: 250, y2: 325 },
  { name: "sexa", x1: 610, x2: 710, y1: 370, y2: 575 },
  { name: "maracas", x1: 1140, x2: 1290, y1: 460, y2: 570 },
  { name: "guitar", x1: 1032, x2: 1125, y1: 300, y2: 450 },
  { name: "trumpt", x1: 780, x2: 950, y1: 245, y2: 350 },
];

// img key, sound key, and per-frame "time" increment (0 = never
// increments, so it only replays once the sound finishes and dwell
// continues — matches the original's per-instrument quirks exactly).
const INSTRUMENTS = {
  drum: { img: "drum", sound: "drum", timeStep: 0 },
  keyboard: { img: "keyboard", sound: "keyboard", timeStep: 0.01 },
  sexa: { img: "sexaphone", sound: "sexa", timeStep: 0.1 },
  maracas: { img: "maracas", sound: "maracas", timeStep: 0.1 },
  guitar: { img: "guitar", sound: "guitar", timeStep: 0.01 },
  trumpt: { img: "trumpet", sound: "trumpet", timeStep: 0.1 },
};

function loadImg(filename) {
  const img = new Image();
  img.src = filename;
  return img;
}

function loadSnd(filename) {
  const a = new Audio(filename);
  a.preload = "auto";
  return a;
}

function isPlaying(audio) {
  return audio && !audio.paused && !audio.ended;
}

export class MusicPoster {
  constructor() {
    this.images = {
      poster: loadImg("poster.jpg"),
      drum: loadImg("drum.png"),
      guitar: loadImg("guitar.png"),
      keyboard: loadImg("keyboard.png"),
      maracas: loadImg("maracas.png"),
      sexaphone: loadImg("sexaphone.png"),
      trumpet: loadImg("trumpet.png"),
    };
    this.sounds = {
      drum: loadSnd("drum.wav"),
      keyboard: loadSnd("newkeyboard.wav"),
      sexa: loadSnd("newsexa.wav"),
      maracas: loadSnd("newMaracus.wav"),
      guitar: loadSnd("newguitar.wav"),
      trumpet: loadSnd("newtrumpet.wav"),
    };

    this.state = {};
    for (const name of Object.keys(INSTRUMENTS)) {
      this.state[name] = { pressed: 0, onOff: 0, time: 0 };
    }

    this.ripples = [];
    this.particles = [];
    this.stringSparks = [];
    this.barsAnim = [];
    this.smokeSwirls = [];
    this.waveBlasts = [];
    this.scatterDots = [];
    this.drumShocks = [];
  }

  // ── spawn helpers ─────────────────────────────────────────────────
  spawnRipple(x, y, col, maxR = 200) {
    this.ripples.push({ x, y, r: 10, maxR, life: 1.0, col });
  }

  spawnNotes(x, y, col, count = 6) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + rand(-40, 40),
        y: y + rand(-20, 10),
        icon: randPick(MUSIC_NOTES),
        vx: rand(-1.8, 1.8),
        vy: rand(-3.5, -1.2),
        life: 1.0,
        decay: rand(0.01, 0.018),
        size: rand(20, 38),
        angle: rand(-0.3, 0.3),
        rot: rand(-0.04, 0.04),
        col,
      });
    }
  }

  spawnInstrumentRipple(name) {
    const [x, y] = INST_CENTRE[name];
    this.spawnRipple(x, y, INST_COLORS[name], 220);
  }

  spawnDrumEffect(x, y) {
    const col = INST_COLORS.drum;
    for (let i = 0; i < 4; i++) {
      this.drumShocks.push({ x, y, r: 10 + i * 20, maxR: 260 + i * 30, life: 1.0, delay: i * 4, col });
    }
    this.spawnNotes(x, y - 60, col, 5);
  }

  spawnGuitarEffect(x, y) {
    const col = INST_COLORS.guitar;
    for (let s = 0; s < 6; s++) {
      this.stringSparks.push({ y: y - 80 + s * 20, phase: rand(TWO_PI), amp: rand(8, 18), life: 1.0, decay: rand(0.008, 0.014), col });
    }
    this.spawnNotes(x, y - 80, col, 5);
  }

  spawnKeyboardEffect(x, y) {
    const col = INST_COLORS.keyboard;
    for (let i = 0; i < 10; i++) {
      this.barsAnim.push({
        x: x - 120 + i * 28, baseY: y, h: rand(30, 120), life: 1.0, decay: rand(0.01, 0.018),
        col: [rand(60, 160), rand(160, 255), 255],
      });
    }
    this.spawnNotes(x, y - 80, col, 4);
  }

  spawnSaxaEffect(x, y) {
    const col = INST_COLORS.sexa;
    for (let i = 0; i < 14; i++) {
      this.smokeSwirls.push({
        x: x + rand(-20, 20), y: y + rand(-10, 10), r: rand(10, 25),
        vx: rand(-0.8, 0.8), vy: rand(-2.5, -0.8), grow: rand(0.3, 0.9),
        life: 1.0, decay: rand(0.007, 0.013), col,
      });
    }
    this.spawnNotes(x, y - 60, col, 5);
  }

  spawnMaracasEffect(x, y) {
    const col = INST_COLORS.maracas;
    for (let i = 0; i < 30; i++) {
      const angle = rand(TWO_PI), speed = rand(2.5, 7);
      this.scatterDots.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        r: rand(4, 10), life: 1.0, decay: rand(0.02, 0.035), col,
      });
    }
    this.spawnNotes(x, y - 50, col, 4);
  }

  spawnTrumpetEffect(x, y) {
    const col = INST_COLORS.trumpt;
    for (let i = 0; i < 5; i++) {
      this.waveBlasts.push({ x, y: y + (i - 2) * 18, len: 0, maxLen: rand(200, 380), life: 1.0, decay: rand(0.008, 0.015), thick: rand(2, 5), col });
    }
    this.spawnRipple(x, y, col, 180);
    this.spawnNotes(x + 60, y - 40, col, 5);
  }

  // ── hit-testing (poster-space coords) ───────────────────────────────
  handlePress(x, y) {
    const spawners = {
      drum: (cx, cy) => this.spawnDrumEffect(cx, cy),
      keyboard: (cx, cy) => this.spawnKeyboardEffect(cx, cy),
      sexa: (cx, cy) => this.spawnSaxaEffect(cx, cy),
      maracas: (cx, cy) => this.spawnMaracasEffect(cx, cy),
      guitar: (cx, cy) => this.spawnGuitarEffect(cx, cy),
      trumpt: (cx, cy) => this.spawnTrumpetEffect(cx, cy),
    };

    for (const h of HOTSPOTS) {
      if (x > h.x1 && x < h.x2 && y > h.y1 && y < h.y2) {
        const st = this.state[h.name];
        if (st.pressed === 0) {
          st.pressed = 1;
          st.time = 1;
          for (const other of Object.keys(this.state)) {
            if (other !== h.name) this.state[other].pressed = 0;
          }
          const [cx, cy] = INST_CENTRE[h.name];
          spawners[h.name](cx, cy);
          this.spawnInstrumentRipple(h.name);
        }
        return; // first (highest-priority) hotspot wins, like the original's if/else-if chain
      }
    }
  }

  // ── per-instrument overlay + sound state machine ────────────────────
  updateAndDrawActive(ctx) {
    for (const name of Object.keys(INSTRUMENTS)) {
      const st = this.state[name];
      if (st.pressed !== 1) continue;

      const cfg = INSTRUMENTS[name];
      st.onOff += 0.1;
      if (st.onOff < 20) {
        const img = this.images[cfg.img];
        if (img && img.complete && img.naturalWidth > 0) ctx.drawImage(img, 0, 0, BASE_W, BASE_H);
      }
      if (st.time === 1) {
        const snd = this.sounds[cfg.sound];
        if (snd && !isPlaying(snd)) {
          snd.currentTime = 0;
          snd.play().catch(() => {});
        }
      }
      if (cfg.timeStep > 0) {
        st.time += cfg.timeStep;
        if (st.time > 2) st.time = 1;
      }
      if (st.onOff > 20) { st.pressed = 0; st.onOff = 0; }

      break; // only one instrument is ever "active" at a time (else-if chain)
    }
  }

  // ── animation drawing ────────────────────────────────────────────────
  drawAnimations(ctx) {
    // Ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rp = this.ripples[i];
      rp.r += (rp.maxR - rp.r) * 0.08;
      rp.life -= 0.025;
      if (rp.life <= 0) { this.ripples.splice(i, 1); continue; }
      const [r, g, b] = rp.col;
      ctx.strokeStyle = `rgba(${r},${g},${b},${(rp.life * 180) / 255})`;
      ctx.lineWidth = 3 * rp.life;
      ctx.beginPath(); ctx.ellipse(rp.x, rp.y, rp.r, rp.r, 0, 0, TWO_PI); ctx.stroke();
      ctx.strokeStyle = `rgba(${r},${g},${b},${(rp.life * 60) / 255})`;
      ctx.lineWidth = 6 * rp.life;
      ctx.beginPath(); ctx.ellipse(rp.x, rp.y, rp.r * 0.75, rp.r * 0.75, 0, 0, TWO_PI); ctx.stroke();
    }

    // Drum shockwaves (flat ovals)
    for (let i = this.drumShocks.length - 1; i >= 0; i--) {
      const ds = this.drumShocks[i];
      if (ds.delay > 0) { ds.delay--; continue; }
      ds.r += (ds.maxR - ds.r) * 0.07;
      ds.life -= 0.022;
      if (ds.life <= 0) { this.drumShocks.splice(i, 1); continue; }
      const [r, g, b] = ds.col;
      ctx.strokeStyle = `rgba(${r},${g},${b},${(ds.life * 200) / 255})`;
      ctx.lineWidth = 4 * ds.life;
      ctx.beginPath(); ctx.ellipse(ds.x, ds.y, ds.r, ds.r * 0.275, 0, 0, TWO_PI); ctx.stroke();
      ctx.strokeStyle = `rgba(${r},${g},${b},${(ds.life * 90) / 255})`;
      ctx.lineWidth = 8 * ds.life;
      ctx.beginPath(); ctx.ellipse(ds.x, ds.y, ds.r * 0.8, ds.r * 0.2, 0, 0, TWO_PI); ctx.stroke();
    }

    // Guitar string waves
    for (let i = this.stringSparks.length - 1; i >= 0; i--) {
      const ss = this.stringSparks[i];
      ss.phase += 0.18;
      ss.life -= ss.decay;
      if (ss.life <= 0) { this.stringSparks.splice(i, 1); continue; }
      const [r, g, b] = ss.col;
      const [cx] = INST_CENTRE.guitar;
      ctx.strokeStyle = `rgba(${r},${g},${b},${(ss.life * 220) / 255})`;
      ctx.lineWidth = 1.5 * ss.life + 0.5;
      ctx.beginPath();
      let first = true;
      for (let px = cx - 130; px <= cx + 130; px += 4) {
        const wave = Math.sin((px - cx) * 0.06 + ss.phase) * ss.amp * ss.life;
        if (first) { ctx.moveTo(px, ss.y + wave); first = false; } else ctx.lineTo(px, ss.y + wave);
      }
      ctx.stroke();
    }

    // Keyboard rising bars
    for (let i = this.barsAnim.length - 1; i >= 0; i--) {
      const b = this.barsAnim[i];
      b.life -= b.decay;
      if (b.life <= 0) { this.barsAnim.splice(i, 1); continue; }
      const [r, g, bl] = b.col;
      const h = b.h * b.life;
      ctx.fillStyle = `rgba(${r},${g},${bl},${(b.life * 200) / 255})`;
      roundRect(ctx, b.x - 10, b.baseY - h, 20, h, 4); ctx.fill();
      ctx.fillStyle = `rgba(${r},${g},${bl},${(b.life * 80) / 255})`;
      roundRect(ctx, b.x - 12, b.baseY - h - 6, 24, 8, 4); ctx.fill();
    }

    // Saxophone smoke swirls
    for (let i = this.smokeSwirls.length - 1; i >= 0; i--) {
      const sw = this.smokeSwirls[i];
      sw.x += sw.vx; sw.y += sw.vy; sw.r += sw.grow; sw.life -= sw.decay;
      if (sw.life <= 0) { this.smokeSwirls.splice(i, 1); continue; }
      const [r, g, b] = sw.col;
      ctx.fillStyle = `rgba(${r},${g},${b},${(sw.life * 55) / 255})`;
      ctx.beginPath(); ctx.ellipse(sw.x, sw.y, sw.r, sw.r, 0, 0, TWO_PI); ctx.fill();
      ctx.fillStyle = `rgba(${r},${g},${b},${(sw.life * 25) / 255})`;
      ctx.beginPath(); ctx.ellipse(sw.x + 5, sw.y - 4, sw.r * 0.7, sw.r * 0.7, 0, 0, TWO_PI); ctx.fill();
    }

    // Maracas scatter dots
    for (let i = this.scatterDots.length - 1; i >= 0; i--) {
      const sd = this.scatterDots[i];
      sd.x += sd.vx; sd.y += sd.vy; sd.vy += 0.15; sd.life -= sd.decay;
      if (sd.life <= 0) { this.scatterDots.splice(i, 1); continue; }
      const [r, g, b] = sd.col;
      ctx.fillStyle = `rgba(${r},${g},${b},${(sd.life * 230) / 255})`;
      const rr = Math.max(0, sd.r * sd.life);
      ctx.beginPath(); ctx.arc(sd.x, sd.y, rr, 0, TWO_PI); ctx.fill();
    }

    // Trumpet wave blasts
    for (let i = this.waveBlasts.length - 1; i >= 0; i--) {
      const wb = this.waveBlasts[i];
      wb.len += (wb.maxLen - wb.len) * 0.12;
      wb.life -= wb.decay;
      if (wb.life <= 0) { this.waveBlasts.splice(i, 1); continue; }
      const [r, g, b] = wb.col;
      ctx.strokeStyle = `rgba(${r},${g},${b},${(wb.life * 200) / 255})`;
      ctx.lineWidth = wb.thick * wb.life;
      ctx.beginPath();
      let first = true;
      for (let px = wb.x; px <= wb.x + wb.len; px += 5) {
        const wave = Math.sin((px - wb.x) * 0.06) * 6 * wb.life;
        if (first) { ctx.moveTo(px, wb.y + wave); first = false; } else ctx.lineTo(px, wb.y + wave);
      }
      ctx.stroke();
    }

    // Floating music note particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx; pt.y += pt.vy; pt.vy *= 0.97; pt.angle += pt.rot; pt.life -= pt.decay;
      if (pt.life <= 0) { this.particles.splice(i, 1); continue; }
      const [r, g, b] = pt.col;
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.angle);
      ctx.fillStyle = `rgba(${r},${g},${b},${(pt.life * 50) / 255})`;
      ctx.beginPath(); ctx.ellipse(0, 0, pt.size * 1.1, pt.size * 1.1, 0, 0, TWO_PI); ctx.fill();
      ctx.fillStyle = `rgba(${r},${g},${b},${pt.life})`;
      ctx.font = `${pt.size * (0.5 + pt.life * 0.6)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pt.icon, 0, 0);
      ctx.restore();
    }
  }

  // ── main draw (poster-space; caller applies the letterbox transform) ──
  draw(ctx) {
    if (this.images.poster.complete && this.images.poster.naturalWidth > 0) {
      ctx.drawImage(this.images.poster, 0, 0, BASE_W, BASE_H);
    } else {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, BASE_W, BASE_H);
    }
    this.updateAndDrawActive(ctx);
    this.drawAnimations(ctx);
  }
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
