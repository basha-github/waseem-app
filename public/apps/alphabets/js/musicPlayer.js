// ═══════════════════════════════════════════════════════════════
//  musicPlayer.js — background music for the wall, backed by the
//  provided Spring.mp3 file (looped, at a soft background volume).
//  Must be started from a user gesture (the "Start camera & begin"
//  click satisfies browser autoplay rules).
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = "wallAlphabetsMusicOn";
const TRACK_URL = "Spring.mp3";
const VOLUME = 0.35;

export class MusicPlayer {
  constructor() {
    this.audio = null;
    this.playing = false;
  }

  _ensureAudio() {
    if (this.audio) return;
    this.audio = new Audio(TRACK_URL);
    this.audio.loop = true;
    this.audio.preload = "auto";
    this.audio.volume = VOLUME;
    this.audio.onerror = () => console.warn("[warn] background music failed to load:", TRACK_URL);
  }

  async play() {
    this._ensureAudio();
    if (this.playing) return;
    try {
      await this.audio.play();
      this.playing = true;
      try { localStorage.setItem(STORAGE_KEY, "1"); } catch (e) {}
    } catch (e) {
      // Autoplay blocked or file missing — stay muted, no crash.
      console.warn("[warn] could not start background music:", e);
    }
  }

  pause() {
    this.playing = false;
    if (this.audio) this.audio.pause();
    try { localStorage.setItem(STORAGE_KEY, "0"); } catch (e) {}
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
    return this.playing;
  }

  static wantsMusic() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === null ? true : v === "1"; // default ON
    } catch (e) {
      return true;
    }
  }
}
