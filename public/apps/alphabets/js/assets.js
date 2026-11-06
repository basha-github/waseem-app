// ═══════════════════════════════════════════════════════════════
//  assets.js — image/GIF/sound loading + the letter data table.
//  Browser port of assets.py. Same filenames as the original
//  WallAlphabets project, loaded relative to this page — drop this
//  whole folder into the same directory as your Apple.png, Ball.gif,
//  Ball.mp3, Next.png, etc.
// ═══════════════════════════════════════════════════════════════

// Same data as LETTER_DATA in assets.py / the LETTERS array in
// WallAlphabets.js. Add more rows here to extend the alphabet.
export const LETTER_DATA = [
  { name: "A", word: "Apple",      img: "Apple.png", reveal: "NaturalApple-r.png", sound: "Apple.mp3" },
  { name: "B", word: "Ball",       img: "B.png",     reveal: "Ball.gif",           sound: "Ball.mp3" },
  { name: "C", word: "Cat",        img: "C.png",     reveal: "Cat.gif",            sound: "Cat.mp3" },
  { name: "D", word: "Dog",        img: "D.png",     reveal: "Dog.gif",            sound: "Dog.mp3" },
  { name: "E", word: "Elephant",   img: "E.png",     reveal: "Elephant.gif",       sound: "Elephant.mp3" },
  { name: "F", word: "Fish",       img: "F.png",     reveal: "Fish.gif",           sound: "fish.mp3" },
  { name: "G", word: "Giraffe",    img: "G.png",     reveal: "Girafee.gif",        sound: "girafee.mp3" },
  { name: "H", word: "Horse",      img: "H.png",     reveal: "Horse.gif",          sound: "horse.mp3" },
  { name: "I", word: "Ice Cream",  img: "I.png",     reveal: "Icecream.gif",       sound: "icecream.mp3" },
  { name: "J", word: "Jug",        img: "J.png",     reveal: "Jug.jpg",            sound: "jug.mp3" },
  { name: "K", word: "Kite",       img: "K.png",     reveal: "Kite.gif",           sound: "kite.mp3" },
  { name: "L", word: "Lion",       img: "L.png",     reveal: "Lion.gif",           sound: "lion.mp3" },
  { name: "M", word: "Monkey",     img: "M.png",     reveal: "Monkey.gif",         sound: "monkey.mp3" },
  { name: "N", word: "Nest",       img: "N.png",     reveal: "Nest.jpg",           sound: "nest.mp3" },
  { name: "O", word: "Owl",        img: "O.png",     reveal: "Owl.gif",            sound: "owl.mp3" },
  { name: "P", word: "Parrot",     img: "P.png",     reveal: "Parrot.gif",         sound: "parrot.mp3" },
  { name: "Q", word: "Queen",      img: "Q.png",     reveal: "Queen.gif",          sound: "queen.mp3" },
  { name: "R", word: "Rabbit",     img: "R.png",     reveal: "Rabbit.gif",         sound: "rabbit.mp3" },
  { name: "S", word: "Sheep",      img: "S.png",     reveal: "Sheep.gif",          sound: "sheep.mp3" },
  // NOTE: asset pack still pairs Tree.gif-style art with Tiger.mp3 for T —
  // kept as-is to match the original p5.js version.
  { name: "T", word: "Tiger",      img: "T.png",     reveal: "tiger.gif",          sound: "Tiger.mp3" },
  { name: "U", word: "Umbrella",   img: "U.png",     reveal: "Umbrella.gif",       sound: "umbrella.mp3" },
  { name: "V", word: "Van",        img: "V.png",     reveal: "Van.gif",            sound: "van.mp3" },
  { name: "W", word: "Watermelon", img: "W.png",     reveal: "Watermelon.gif",     sound: "watermelon.mp3" },
  { name: "X", word: "Xmas Tree",  img: "X.png",     reveal: "X-tree.gif",         sound: "christmass_tree.mp3" },
  { name: "Y", word: "Yacht",      img: "Y.png",     reveal: "Yacht.gif",          sound: "yacht.mp3" },
  { name: "Z", word: "Zebra",      img: "Z.png",     reveal: "Zeebra.gif",         sound: "zebra.mp3" },
];

// GIFs are decoded ourselves (js/gifDecoder.js) rather than relying on a
// hidden <img> element to keep "auto-animating" in the background — that
// approach depends on browser-specific, undocumented behavior for how (and
// whether) an off-screen/invisible <img> keeps advancing GIF frames, and in
// practice it silently freezes on frame 1 in common cases (e.g. as soon as
// the hidden container clips the image to ~0 rendered area). Decoding the
// GIF bytes ourselves and drawing frames to an offscreen <canvas> on a timer
// works the same way in every browser, independent of layout/visibility.
import { parseGIF } from "./gifDecoder.js";

class GifAnimation {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.frames = [];       // [{ imageData, delay }]
    this.totalDuration = 0;
    this.ready = false;
    this.failed = false;
    this.startTime = null;
    this._drawnIndex = -1;
    // Mimic the bits of the <img> API that drawAssetOrPlaceholder checks.
    this.complete = false;
    this.naturalWidth = 0;
  }

  async load(filename) {
    try {
      const res = await fetch(filename);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const { width, height, frames } = parseGIF(buf);
      if (frames.length === 0) throw new Error("no frames decoded");

      this.canvas.width = width;
      this.canvas.height = height;
      this.frames = frames.map(f => ({
        imageData: new ImageData(f.rgba, width, height),
        delay: f.delay,
      }));
      this.totalDuration = this.frames.reduce((sum, f) => sum + f.delay, 0);

      this.ctx.putImageData(this.frames[0].imageData, 0, 0);
      this._drawnIndex = 0;
      this.ready = true;
      this.complete = true;
      this.naturalWidth = width;
    } catch (err) {
      this.failed = true;
      console.warn(`[warn] GIF missing or failed to decode: ${filename}`, err);
    }
  }

  /** Advances (if needed) and returns the canvas holding the current frame. */
  getFrame(nowMs) {
    if (!this.ready || this.totalDuration <= 0) return this.canvas;
    if (this.startTime === null) this.startTime = nowMs;
    const elapsed = (nowMs - this.startTime) % this.totalDuration;
    let acc = 0, idx = 0;
    for (; idx < this.frames.length; idx++) {
      acc += this.frames[idx].delay;
      if (elapsed < acc) break;
    }
    idx = Math.min(idx, this.frames.length - 1);
    if (idx !== this._drawnIndex) {
      this.ctx.putImageData(this.frames[idx].imageData, 0, 0);
      this._drawnIndex = idx;
    }
    return this.canvas;
  }
}

/** Loads an image asset. Animated GIFs get decoded/played manually (see
 *  GifAnimation above); everything else uses a plain <img>. */
function loadImageAsset(filename) {
  if (/\.gif($|\?)/i.test(filename)) {
    const gif = new GifAnimation();
    gif.load(filename);
    return gif;
  }

  const img = new Image();
  img.src = filename;
  img.decoding = "async";
  img.dataset.missing = "0";
  img.onerror = () => {
    img.dataset.missing = "1";
    console.warn(`[warn] image missing or failed to load: ${filename}`);
  };
  return img;
}

/** Loads a sound; returns an <audio> element (or null if filename is empty). */
function loadSoundAsset(filename) {
  if (!filename) return null;
  const audio = new Audio(filename);
  audio.preload = "auto";
  audio.onerror = () => console.warn(`[warn] sound missing or failed to load: ${filename}`);
  return audio;
}

/** Returns a list like LETTER_DATA but with loaded imgAsset/revealAsset/sound attached. */
export function loadLetters() {
  return LETTER_DATA.map(entry => ({
    name: entry.name,
    word: entry.word,
    imgAsset: loadImageAsset(entry.img),
    revealAsset: loadImageAsset(entry.reveal),
    sound: loadSoundAsset(entry.sound),
  }));
}

export function loadNextArrowAsset(filename = "Next.png") {
  return loadImageAsset(filename);
}

/** Draws an image asset into a canvas rect, or a placeholder box if it failed to load. */
export function drawAssetOrPlaceholder(ctx, imgEl, x, y, w, h, label) {
  if (imgEl instanceof GifAnimation) {
    if (imgEl.ready && !imgEl.failed) {
      ctx.drawImage(imgEl.getFrame(performance.now()), x, y, w, h);
      return;
    }
  } else if (imgEl && imgEl.complete && imgEl.naturalWidth > 0 && imgEl.dataset.missing !== "1") {
    ctx.drawImage(imgEl, x, y, w, h);
    return;
  }
  ctx.save();
  ctx.strokeStyle = "#c7c7d6";
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.setLineDash([]);
  ctx.fillStyle = "#9797ad";
  ctx.font = "13px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label || "(missing)", x + w / 2, y + h / 2);
  ctx.restore();
}
