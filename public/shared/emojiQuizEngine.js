/* ============================================================
   emojiQuizEngine.js — shared, reusable quiz engine for the new
   batch of playschool apps.

   Each app just needs:
     1. An index.html that includes this engine + a data.js
     2. A data.js defining:
          const TOPIC_TITLE = "Vehicles";
          const TOPIC_EMOJI = "🚗";
          const TOPIC_THEME = "sky";           // see THEMES below
          const ITEMS = [{ emoji: "🚗", word: "Car" }, ...];

   No external libraries, no image/audio assets to source — art is
   drawn with big colorful emoji (crisp on every screen, instantly
   recognizable to young kids) and words are read aloud with the
   browser's built-in speech synthesis. Auto-starts immediately
   (no "Let's Go" button — matches the rest of the wall).
   ============================================================ */

const BG_PLAYROOM = "url('/shared/backgrounds/playroom.jpg')";
const BG_FOREST = "url('/shared/backgrounds/forest.jpg')";

const THEMES = {
  sky:    { a: "#8ED1FF", b: "#4FA6E8", accent: "#FF6B6B", bg: BG_PLAYROOM },
  grass:  { a: "#B7F0A0", b: "#5FBE5A", accent: "#FF9F1C", bg: BG_FOREST },
  candy:  { a: "#FFC1E3", b: "#FF6FB5", accent: "#7B4397", bg: BG_PLAYROOM },
  sun:    { a: "#FFE9A8", b: "#FFB84D", accent: "#3D8BFD", bg: BG_PLAYROOM },
  night:  { a: "#B9A8FF", b: "#6C5CE7", accent: "#FFD400", bg: BG_FOREST },
  ocean:  { a: "#9AE6E0", b: "#20B2AA", accent: "#FF6B6B", bg: BG_FOREST },
};

const QUESTIONS_PER_ROUND = 8;
const CHOICES_PER_QUESTION = 4;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function speak(word) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.rate = 0.85;
    u.pitch = 1.1;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

function applyTheme() {
  const theme = THEMES[typeof TOPIC_THEME !== "undefined" ? TOPIC_THEME : "sky"] || THEMES.sky;
  document.documentElement.style.setProperty("--eq-bg-a", theme.a);
  document.documentElement.style.setProperty("--eq-bg-b", theme.b);
  document.documentElement.style.setProperty("--eq-accent", theme.accent);
  document.documentElement.style.setProperty("--eq-bg-image", theme.bg);
}

function buildRound(items) {
  const n = Math.min(QUESTIONS_PER_ROUND, items.length);
  return shuffle(items).slice(0, n);
}

function choicesFor(correct, allItems) {
  const distractors = shuffle(allItems.filter(i => i.word !== correct.word)).slice(
    0, CHOICES_PER_QUESTION - 1
  );
  return shuffle([correct, ...distractors]);
}

class EmojiQuiz {
  constructor(root, items, title, emoji) {
    this.root = root;
    this.items = items;
    this.title = title;
    this.emoji = emoji;
    this.round = [];
    this.idx = 0;
    this.score = 0;
    this.locked = false;
    this.render();
    this.start();
  }

  render() {
    this.root.innerHTML = `
      <div class="eq-hud">
        <div class="eq-brand">
          <span class="eq-brand-icon">${this.emoji}</span>
          <span class="eq-brand-text">${this.title}</span>
        </div>
        <div class="eq-pills">
          <div class="eq-pill" id="eqProgress">Question 1 / ${QUESTIONS_PER_ROUND}</div>
          <div class="eq-pill eq-score" id="eqScore">⭐ 0</div>
        </div>
      </div>
      <div class="eq-stage">
        <div class="eq-panel">
          <div class="eq-prompt-row">
            <div class="eq-prompt" id="eqPrompt"></div>
            <button class="eq-hint" id="eqHint">🔊 Hear it again</button>
          </div>
          <div class="eq-choices" id="eqChoices"></div>
          <div class="eq-feedback" id="eqFeedback"></div>
        </div>
      </div>
      <div class="eq-result" id="eqResult" hidden>
        <div class="eq-result-card">
          <div class="eq-result-emoji" id="eqResultEmoji">🏆</div>
          <h1 id="eqResultTitle">Great job!</h1>
          <p id="eqResultScore"></p>
          <div class="eq-stars" id="eqResultStars"></div>
          <button class="eq-btn" id="eqPlayAgain">Play Again</button>
        </div>
      </div>
    `;
    this.el = {
      progress: this.root.querySelector("#eqProgress"),
      score: this.root.querySelector("#eqScore"),
      prompt: this.root.querySelector("#eqPrompt"),
      hint: this.root.querySelector("#eqHint"),
      choices: this.root.querySelector("#eqChoices"),
      feedback: this.root.querySelector("#eqFeedback"),
      stage: this.root.querySelector(".eq-stage"),
      result: this.root.querySelector("#eqResult"),
      resultScore: this.root.querySelector("#eqResultScore"),
      resultStars: this.root.querySelector("#eqResultStars"),
      playAgain: this.root.querySelector("#eqPlayAgain"),
    };
    this.el.playAgain.addEventListener("click", () => this.start());
    this.el.hint.addEventListener("click", () => {
      const q = this.round[this.idx];
      if (q) speak(q.word);
    });
  }

  start() {
    this.round = buildRound(this.items);
    this.idx = 0;
    this.score = 0;
    this.el.result.hidden = true;
    this.el.stage.hidden = false;
    this.next();
  }

  next() {
    this.locked = false;
    this.el.feedback.textContent = "";
    this.el.feedback.className = "eq-feedback";
    if (this.idx >= this.round.length) {
      this.finish();
      return;
    }
    const q = this.round[this.idx];
    this.el.progress.textContent = `Question ${this.idx + 1} / ${this.round.length}`;
    this.el.prompt.innerHTML = `<span class="eq-prompt-label">Find:</span> <span class="eq-prompt-word">${q.word}</span>`;
    speak(q.word);

    const choices = choicesFor(q, this.items);
    this.el.choices.innerHTML = "";
    choices.forEach(choice => {
      const btn = document.createElement("button");
      btn.className = "eq-choice";
      btn.dataset.word = choice.word;
      btn.innerHTML = `<span class="eq-emoji">${choice.emoji}</span>`;
      btn.addEventListener("click", () => this.answer(choice, q, btn));
      this.el.choices.appendChild(btn);
    });
  }

  answer(chosen, correct, btn) {
    if (this.locked) return;
    this.locked = true;
    const isRight = chosen.word === correct.word;

    // Lock every choice immediately — stops a lingering finger-point
    // (or an extra tap) from firing again while feedback is showing.
    const allBtns = Array.from(this.el.choices.children);
    allBtns.forEach(b => { b.disabled = true; });

    if (isRight) {
      this.score++;
      btn.classList.add("eq-correct");
      this.el.feedback.textContent = "🎉 Yes! Well done!";
      this.el.feedback.className = "eq-feedback eq-feedback-good";
      this.confetti();
    } else {
      btn.classList.add("eq-wrong");
      // Always reveal which one WAS correct, highlighted in green,
      // alongside the person's own wrong pick highlighted in red.
      const correctBtn = allBtns.find(b => b.dataset.word === correct.word);
      if (correctBtn) correctBtn.classList.add("eq-correct");
      this.el.feedback.textContent = `Not quite — that's the ${chosen.word}. The correct answer is ${correct.word}.`;
      this.el.feedback.className = "eq-feedback eq-feedback-bad";
    }
    this.el.score.textContent = `⭐ ${this.score}`;
    setTimeout(() => {
      this.idx++;
      this.next();
    }, 7000);
  }

  finish() {
    this.el.stage.hidden = true;
    this.el.result.hidden = false;
    const pct = this.round.length ? this.score / this.round.length : 0;
    const stars = pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : 1;
    this.el.resultScore.textContent = `You scored ${this.score} out of ${this.round.length}`;
    this.el.resultStars.textContent = "⭐".repeat(stars) + "☆".repeat(3 - stars);
  }

  confetti() {
    const layer = document.createElement("div");
    layer.className = "eq-confetti-layer";
    for (let i = 0; i < 18; i++) {
      const bit = document.createElement("span");
      bit.className = "eq-confetti-bit";
      bit.style.left = Math.random() * 100 + "%";
      bit.style.background = ["#FF6B6B", "#FFD400", "#4FA6E8", "#5FBE5A", "#FF9F1C", "#7B4397"][i % 6];
      bit.style.animationDelay = Math.random() * 0.3 + "s";
      layer.appendChild(bit);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 1600);
  }
}

function buildAmbientBackground() {
  if (document.querySelector(".eq-bg-fx")) return;
  const layer = document.createElement("div");
  layer.className = "eq-bg-fx";
  const specs = [
    { w: 220, h: 220, top: "-60px", left: "-60px", dur: "16s", delay: "0s" },
    { w: 160, h: 160, top: "60%", left: "-40px", dur: "13s", delay: "-4s" },
    { w: 180, h: 180, top: "-40px", right: "8%", dur: "15s", delay: "-2s" },
    { w: 140, h: 140, bottom: "-30px", right: "-30px", dur: "12s", delay: "-6s" },
    { w: 110, h: 110, bottom: "10%", left: "20%", dur: "11s", delay: "-3s" },
  ];
  specs.forEach(s => {
    const blob = document.createElement("span");
    blob.className = "eq-bg-blob";
    blob.style.width = s.w + "px";
    blob.style.height = s.h + "px";
    if (s.top) blob.style.top = s.top;
    if (s.bottom) blob.style.bottom = s.bottom;
    if (s.left) blob.style.left = s.left;
    if (s.right) blob.style.right = s.right;
    blob.style.animationDuration = s.dur;
    blob.style.animationDelay = s.delay;
    layer.appendChild(blob);
  });
  document.body.appendChild(layer);
}

function boot() {
  applyTheme();
  buildAmbientBackground();
  const root = document.getElementById("app");
  new EmojiQuiz(root, ITEMS, TOPIC_TITLE, TOPIC_EMOJI);
  initWallFingerPointing();
}

// ═══════════════════════════════════════════════════════════════
//  Wall finger-pointing support — lets kids point at an answer with
//  their fingertip and hold it there instead of tapping/clicking.
//  Uses the same shared camera calibration and dwell-click pattern
//  as the rest of the wall (see apps/colorquiz/js/main.js), just
//  self-contained here so every quiz app gets it for free with zero
//  per-app HTML. The quiz itself already works fine by touch/click
//  the instant the page loads — this only adds an optional layer on
//  top once the person opts in via the camera-start button.
// ═══════════════════════════════════════════════════════════════
const WALL_DWELL_MS = 700;
const WALL_CLICKABLE_SELECTOR = ".eq-choice:not(:disabled), .eq-btn, .eq-hint";

function injectWallStyles() {
  if (document.getElementById("__wallFingerStyles")) return;
  const style = document.createElement("style");
  style.id = "__wallFingerStyles";
  style.textContent = `
    .wall-cal-stage {
      position: fixed; inset: 0; z-index: 999940; display: none;
    }
    .wall-finger-overlay {
      position: fixed; inset: 0; z-index: 999950;
      background: rgba(11, 16, 38, 0.82);
      display: flex; align-items: center; justify-content: center;
      pointer-events: none;
    }
    .wall-finger-overlay-card {
      pointer-events: auto;
      background: #14193a;
      border: 2px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      padding: 28px 32px;
      max-width: 440px;
      width: calc(100% - 48px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      color: #F5F2FF;
      font-family: 'Fredoka', system-ui, sans-serif;
      text-align: left;
    }
    .wall-finger-overlay-card h1 {
      margin: 0 0 10px;
      font-family: 'Baloo 2', system-ui, sans-serif;
      font-size: 20px;
    }
    .wall-finger-overlay-card p { color: #c9c4e8; line-height: 1.5; font-size: 13.5px; }
    .wall-finger-steps { margin: 12px 0 20px; padding-left: 20px; font-size: 13px; line-height: 1.6; color: #e4e1f7; }
    .wall-finger-steps kbd { background: rgba(255,255,255,0.12); border-radius: 4px; padding: 1px 6px; border: 1px solid rgba(255,255,255,0.2); font-family: monospace; }
    #__wallFingerStartBtn {
      width: 100%; padding: 13px 18px; border: none; border-radius: 10px;
      background: linear-gradient(135deg, #7C3CDC, #FF69B4);
      color: #fff; font-size: 15px; font-weight: bold; cursor: pointer;
      font-family: 'Baloo 2', system-ui, sans-serif;
    }
    #__wallFingerStartBtn:disabled { opacity: 0.7; cursor: default; }
    .wall-finger-status { margin-top: 12px; min-height: 16px; font-size: 12.5px; color: #2EC4B6; text-align: center; }
    .wall-finger-skip {
      display: block; width: 100%; margin-top: 10px; padding: 8px 12px;
      background: transparent; border: none; color: #9d97c9;
      font-family: 'Fredoka', system-ui, sans-serif; font-size: 12.5px;
      text-decoration: underline; cursor: pointer;
    }
    .wall-finger-skip:hover { color: #c9c4e8; }
    .wall-skip-link {
      display: block; width: 100%; margin-top: 10px; padding: 8px 12px;
      background: transparent; border: none; color: #9d97c9;
      font-family: 'Fredoka', system-ui, sans-serif; font-size: 12.5px;
      text-decoration: underline; cursor: pointer;
    }
    .wall-skip-link:hover { color: #c9c4e8; }
    .wall-finger-cursor {
      position: fixed; z-index: 999960;
      width: 56px; height: 56px; margin-left: -28px; margin-top: -28px;
      pointer-events: none; visibility: hidden;
      filter: drop-shadow(0 0 4px rgba(0,0,0,0.5));
    }
    .eq-choice.wall-dwell-hover, .eq-btn.wall-dwell-hover {
      outline: 4px solid #ff69b4 !important;
      outline-offset: 2px;
      filter: brightness(1.1);
    }
  `;
  document.head.appendChild(style);
}

function buildWallDom() {
  const calStage = document.createElement("canvas");
  calStage.className = "wall-cal-stage";
  document.body.appendChild(calStage);

  const cursor = document.createElement("div");
  cursor.className = "wall-finger-cursor";
  cursor.innerHTML = `
    <svg viewBox="0 0 60 60" width="56" height="56">
      <circle class="__wallCursorRing" cx="30" cy="30" r="24" fill="none" stroke="#ff69b4" stroke-width="4"
              stroke-dasharray="151" stroke-dashoffset="151" transform="rotate(-90 30 30)" />
      <circle cx="30" cy="30" r="6" fill="#ff69b4" />
    </svg>`;
  document.body.appendChild(cursor);
  const ring = cursor.querySelector(".__wallCursorRing");

  const overlay = document.createElement("div");
  overlay.className = "wall-finger-overlay";
  overlay.innerHTML = `
    <div class="wall-finger-overlay-card wall-overlay-card">
      <h1>👆 Point &amp; Play</h1>
      <p>You can already tap answers with your finger or mouse. Turn on the
      camera to point from across the room instead — hold your fingertip
      over an answer for a moment to pick it.</p>
      <ul class="wall-finger-steps">
        <li>Allow camera access when prompted.</li>
        <li>Hold your fingertip still over each of the 9 dots for 2 seconds to calibrate (skipped automatically if you've already calibrated another app on this wall).</li>
        <li>Point at an answer and hold to select it.</li>
        <li>Press <kbd>R</kbd> any time to recalibrate.</li>
      </ul>
      <button id="__wallFingerStartBtn">Turn on finger pointing</button>
      <p id="__wallFingerStatus" class="wall-finger-status"></p>
    </div>
  `;
  document.body.appendChild(overlay);

  return { calStage, cursor, ring, overlay, startBtn: overlay.querySelector("#__wallFingerStartBtn"), statusEl: overlay.querySelector("#__wallFingerStatus") };
}

async function initWallFingerPointing() {
  injectWallStyles();
  const { calStage, cursor, ring, overlay, startBtn, statusEl } = buildWallDom();

  // The overlay is opt-in and never blocks the quiz underneath: the person
  // can simply tap/click through it (it starts dismissed-looking via
  // pointer-events:none on the backdrop) or use the explicit skip link.
  let mod;
  try {
    mod = await import("/shared/calibrationBootstrap.js");
  } catch (e) {
    overlay.remove();
    calStage.remove();
    cursor.remove();
    return; // hand-tracking unavailable — quiz still works fine by touch/click
  }
  const { applyHomography } = await import("/shared/homography.js");
  const { runWallBootstrap, clearCalibration } = mod;

  const RING_CIRCUMFERENCE = 2 * Math.PI * 24;
  function setRingProgress(p) {
    const offset = RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, p)));
    ring.style.strokeDashoffset = String(offset);
  }

  runWallBootstrap({
    startBtn, statusEl, overlayEl: overlay, calStageEl: calStage,
    onReady(hand, calH) {
      cursor.style.visibility = "visible";
      let hoverEl = null;
      let hoverStart = 0;

      function clearHover() {
        if (hoverEl) hoverEl.classList.remove("wall-dwell-hover");
        hoverEl = null;
        setRingProgress(0);
      }

      function pump() {
        hand.update();
        if (calH && hand.finger_x >= 0 && hand.finger_y >= 0) {
          const n = applyHomography(calH, [hand.finger_x, hand.finger_y]);
          if (n) {
            const x = n[0] * window.innerWidth;
            const y = n[1] * window.innerHeight;
            cursor.style.left = x + "px";
            cursor.style.top = y + "px";
            cursor.style.visibility = "visible";

            const under = document.elementFromPoint(x, y);
            const target = under ? under.closest(WALL_CLICKABLE_SELECTOR) : null;

            if (target !== hoverEl) {
              clearHover();
              hoverEl = target;
              hoverStart = performance.now();
              if (hoverEl) hoverEl.classList.add("wall-dwell-hover");
            }
            if (hoverEl) {
              const progress = (performance.now() - hoverStart) / WALL_DWELL_MS;
              setRingProgress(progress);
              if (progress >= 1) {
                const clicked = hoverEl;
                clearHover();
                clicked.click();
              }
            }
          } else {
            cursor.style.visibility = "hidden";
            clearHover();
          }
        } else {
          cursor.style.visibility = "hidden";
          clearHover();
        }
        requestAnimationFrame(pump);
      }
      pump();
    },
  });

  window.addEventListener("keydown", e => {
    if (e.key === "r" || e.key === "R") {
      clearCalibration();
      location.reload();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
