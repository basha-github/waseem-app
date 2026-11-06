// ═══════════════════════════════════════════════════════════════
//  bgMusic.js — shared background music for every wall app.
//  Drop `<script type="module" src="../../shared/bgMusic.js"></script>`
//  near the end of an app's <body> and it adds a small floating
//  music toggle button plus a looping background track (Spring.mp3),
//  matching the music feature in the Wall Alphabets app. No changes
//  to the app's own code are required.
// ═══════════════════════════════════════════════════════════════

const TRACK_URL = new URL("./audio/Spring.mp3", import.meta.url).href;
const STORAGE_KEY = "wallBgMusicOn"; // shared across all apps on this wall
const VOLUME = 0.3;

function wantsMusic() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === null ? true : v === "1"; // default ON
  } catch (e) {
    return true;
  }
}

function setWantsMusic(on) {
  try { localStorage.setItem(STORAGE_KEY, on ? "1" : "0"); } catch (e) {}
}

function injectStyles() {
  if (document.getElementById("__bgMusicStyles")) return;
  const style = document.createElement("style");
  style.id = "__bgMusicStyles";
  style.textContent = `
    #__bgMusicBtn {
      position: fixed;
      top: 14px;
      right: 14px;
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 7px;
      border: none;
      cursor: pointer;
      padding: 9px 14px;
      border-radius: 999px;
      background: linear-gradient(135deg, #3ecf8c, #3ec6ff);
      color: #fff;
      font-family: 'Fredoka', Arial, Helvetica, sans-serif;
      font-weight: 700;
      font-size: 12.5px;
      box-shadow: 0 6px 14px rgba(30, 160, 150, 0.35);
      transition: transform 0.15s ease;
    }
    #__bgMusicBtn:hover { transform: translateY(-1px) scale(1.03); }
    #__bgMusicBtn:active { transform: translateY(0) scale(0.98); }
    #__bgMusicBtn.is-muted { background: linear-gradient(135deg, #b9b9c9, #8f8fa6); }
    #__bgMusicBtn .icon { font-size: 15px; display: inline-block; }
    #__bgMusicBtn:not(.is-muted) .icon { animation: __bgMusicPulse 2.4s ease-in-out infinite; }
    @keyframes __bgMusicPulse {
      0%, 100% { transform: scale(1); opacity: 0.9; }
      50% { transform: scale(1.12); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

function createButton() {
  if (document.getElementById("__bgMusicBtn")) return document.getElementById("__bgMusicBtn");
  const btn = document.createElement("button");
  btn.id = "__bgMusicBtn";
  btn.type = "button";
  btn.title = "Toggle background music";
  btn.innerHTML = `<span class="icon">🎵</span><span class="label">Music</span>`;
  document.body.appendChild(btn);
  return btn;
}

function initBgMusic() {
  injectStyles();
  const btn = createButton();

  const audio = new Audio(TRACK_URL);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = VOLUME;
  audio.onerror = () => console.warn("[warn] background music failed to load:", TRACK_URL);

  let playing = false;
  let userMuted = !wantsMusic();

  const sync = () => {
    const audibleNow = playing && !audio.muted;
    btn.classList.toggle("is-muted", !audibleNow);
    btn.querySelector(".label").textContent = audibleNow ? "Music" : "Muted";
  };

  // Browsers always allow autoplay if the element starts muted, so we
  // start playback immediately (silently) and simply unmute it on the
  // very first interaction. This works even in apps whose own canvas/
  // hand-tracking overlay calls stopPropagation() on clicks, because we
  // never depend on an event bubbling up — we just try on every event,
  // in the capture phase, which fires before any stopPropagation().
  const tryStart = async () => {
    if (playing) return;
    try {
      await audio.play();
      playing = true;
    } catch (e) {
      // Will retry on the next interaction.
    }
    sync();
  };

  const unmute = () => {
    if (userMuted) return;
    audio.muted = false;
    if (!playing) tryStart();
    sync();
  };

  audio.muted = true;
  tryStart();

  const INTERACTION_EVENTS = ["pointerdown", "mousedown", "mousemove", "touchstart", "touchmove", "keydown", "click"];
  const onInteract = () => {
    unmute();
    if (!userMuted && !audio.muted) {
      INTERACTION_EVENTS.forEach(evt => document.removeEventListener(evt, onInteract, true));
    }
  };
  INTERACTION_EVENTS.forEach(evt => document.addEventListener(evt, onInteract, true));

  btn.addEventListener("click", () => {
    if (audio.muted || !playing) {
      userMuted = false;
      audio.muted = false;
      tryStart();
      setWantsMusic(true);
    } else {
      audio.muted = true;
      userMuted = true;
      setWantsMusic(false);
    }
    sync();
  }, true);

  sync();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initBgMusic);
} else {
  initBgMusic();
}
