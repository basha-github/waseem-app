// ════════════════════════════════════════════════════════════════
//  ABC Chart · WallAlphabetChart.js   (p5 GLOBAL MODE)
//
//  MOUSE-CLICK VERSION
//  ────────────────────
//  This is the same ABC Chart app, but the webcam / handPose /
//  index-finger dwell-selection has been removed and replaced with
//  plain mouse clicks. Click any letter card to select it. Everything
//  else (layout, colours, animations, sounds, particles) is unchanged.
// ════════════════════════════════════════════════════════════════


// ── Alphabet data ────────────────────────────────────────────────
const ALPHABET = [
  { letter: 'A', emoji: '🍎', word: 'Apple'     },
  { letter: 'B', emoji: '🦋', word: 'Butterfly' },
  { letter: 'C', emoji: '🐱', word: 'Cat'       },
  { letter: 'D', emoji: '🐶', word: 'Dog'       },
  { letter: 'E', emoji: '🐘', word: 'Elephant'  },
  { letter: 'F', emoji: '🐸', word: 'Frog'      },
  { letter: 'G', emoji: '🍇', word: 'Grapes'    },
  { letter: 'H', emoji: '🦛', word: 'Hippo'     },
  { letter: 'I', emoji: '🍦', word: 'Ice cream' },
  { letter: 'J', emoji: '🪼', word: 'Jellyfish' },
  { letter: 'K', emoji: '🦘', word: 'Kangaroo'  },
  { letter: 'L', emoji: '🦁', word: 'Lion'      },
  { letter: 'M', emoji: '🐒', word: 'Monkey'    },
  { letter: 'N', emoji: '🪺', word: 'Nest'      },
  { letter: 'O', emoji: '🦉', word: 'Owl'       },
  { letter: 'P', emoji: '🐧', word: 'Penguin'   },
  { letter: 'Q', emoji: '👸', word: 'Queen'     },
  { letter: 'R', emoji: '🐇', word: 'Rabbit'    },
  { letter: 'S', emoji: '🌻', word: 'Sunflower' },
  { letter: 'T', emoji: '🐯', word: 'Tiger'     },
  { letter: 'U', emoji: '🦄', word: 'Unicorn'   },
  { letter: 'V', emoji: '🌋', word: 'Volcano'   },
  { letter: 'W', emoji: '🐋', word: 'Whale'     },
  { letter: 'X', emoji: '🎸', word: 'Xylophone' },
  { letter: 'Y', emoji: '🧶', word: 'Yarn'      },
  { letter: 'Z', emoji: '🦓', word: 'Zebra'     },
];

const PALETTE = [
  '#e8333a', '#e87d17', '#c9a800',
  '#2e9e4f', '#1c7ed6', '#7048e8', '#d6367d',
];

// ── Emoji artwork (Twemoji) ──────────────────────────────────────
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets';
function _emojiCode(emoji) {
  return Array.from(emoji)
    .map(ch => ch.codePointAt(0))
    .filter(cp => cp !== 0xFE0F)
    .map(cp => cp.toString(16))
    .join('-');
}
function _emojiSvg(emoji) { return TWEMOJI_BASE + '/svg/'    + _emojiCode(emoji) + '.svg'; }
function _emojiPng(emoji) { return TWEMOJI_BASE + '/72x72/'  + _emojiCode(emoji) + '.png'; }

let emojiImg = {};   // idx → p5.Image (canvas display), loaded in the background

function _preloadEmojiImages() {
  ALPHABET.forEach((item, idx) => {
    loadImage(_emojiPng(item.emoji),
      img => { emojiImg[idx] = img; },     // ready
      ()  => { emojiImg[idx] = null; });   // failed → text fallback
  });
}

// Layout split: fraction of the canvas width used by the LEFT chart
// panel (cards). The RIGHT letter-display section gets the remainder.
// This only applies in "side-by-side" mode (wide screens). On narrow
// screens (most phones in portrait) we stack instead: chart grid on
// top, letter display below — see STACK_BREAKPOINT/_isStacked().
const SPLIT = 0.62;
const STACK_SPLIT = 0.56;       // stacked mode: chart panel gets the top 56% of height
const STACK_BREAKPOINT = 700;   // below this width, switch to stacked mode

function _isStacked() { return _canvasW() < STACK_BREAKPOINT; }

// Returns the rectangle the letter-display section should draw in:
// the right-hand panel in side-by-side mode, or the bottom panel in
// stacked mode.
function _displayRect() {
  if (_isStacked()) {
    const dy = height * STACK_SPLIT;
    return { x: 0, y: dy, w: width, h: height - dy };
  }
  const dx = width * SPLIT;
  return { x: dx, y: 0, w: width - dx, h: height };
}

// Keeps the DOM #abc-ui (and the CSS that positions #chart-panel /
// #divider) in sync with whichever layout mode applies right now.
function _applyLayoutMode() {
  const ui = document.getElementById('abc-ui');
  if (!ui) return;
  ui.classList.toggle('stacked', _isStacked());
}

// ── Canvas sizing — full window. The DOM ABC overlay is synced to
//    this same rectangle (see _syncUIToCanvas) so cards line up with it.
function _canvasW()    { return windowWidth; }
function _canvasH()    { return windowHeight; }

// ── ABC sub-state ────────────────────────────────────────────────
let selected      = null;
let letterScale   = 0, letterAlpha = 0, bgSplash = 0, emojiY = 0;
let particles     = [], stars = [];


// ════════════════════════════════════════════════════════════════
//  p5 LIFECYCLE
// ════════════════════════════════════════════════════════════════

function preload() {
  // (nothing handpose-related any more)
}

function setup() {
  const cnv = createCanvas(_canvasW(), _canvasH());
  cnv.style('z-index', '5');
  _applyLayoutMode();        // pick side-by-side vs stacked before syncing
  _syncUIToCanvas();          // align the DOM ABC overlay to the canvas
  textFont('Fredoka One');

  _preloadEmojiImages();      // fetch Twemoji artwork in the background
  _initApp();                 // mouse needs no calibration — start right away
}

function draw() {
  _drawABC();
}

function windowResized() {
  resizeCanvas(_canvasW(), _canvasH());
  _applyLayoutMode();
  _syncUIToCanvas();
  const d = _displayRect();
  for (const s of stars) { s.x = random(d.x, d.x + d.w); s.y = random(d.y, d.y + d.h); }
}

// ── Make the DOM ABC overlay cover exactly the same rectangle as ──
//    the canvas, so the header/divider/cards line up with what p5 draws.
function _syncUIToCanvas() {
  const ui = document.getElementById('abc-ui');
  if (!ui) return;
  ui.style.left   = '0px';
  ui.style.top    = '0px';
  ui.style.width  = _canvasW() + 'px';
  ui.style.height = _canvasH() + 'px';
}


// ════════════════════════════════════════════════════════════════
//  APP INIT
// ════════════════════════════════════════════════════════════════

function _initApp() {
  document.getElementById('abc-ui').classList.add('visible');
  _applyLayoutMode();
  _syncUIToCanvas();
  _buildCardGrid();

  const d = _displayRect();
  stars = [];
  for (let i = 0; i < 40; i++) {
    stars.push({
      x: random(d.x, d.x + d.w), y: random(d.y, d.y + d.h),
      r: random(2, 5), phase: random(TWO_PI), col: random(PALETTE),
    });
  }

  selected = null; letterScale = 0; letterAlpha = 0; bgSplash = 0;
}

// Builds the 26 DOM letter cards. Each card is a normal clickable
// element — click it (or tap it) to select that letter.
function _buildCardGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  ALPHABET.forEach((item, idx) => {
    const card          = document.createElement('div');
    card.className      = 'card';
    card.id             = 'card-' + idx;
    card.style.position = 'relative';

    // Crisp Twemoji SVG; if it fails, fall back to the unicode character.
    const img    = document.createElement('img');
    img.className = 'emoji';
    img.src       = _emojiSvg(item.emoji);
    img.alt       = item.word;
    img.draggable = false;
    img.onerror   = () => {
      const span = document.createElement('span');
      span.className   = 'emoji';
      span.textContent = item.emoji;
      img.replaceWith(span);
    };

    const letter = document.createElement('span');
    letter.className = 'letter'; letter.textContent = item.letter;

    const word = document.createElement('span');
    word.className = 'word'; word.textContent = item.word;

    card.append(img, letter, word);
    card.addEventListener('click', () => _selectLetter(idx));
    grid.appendChild(card);
  });
}


// ════════════════════════════════════════════════════════════════
//  ABC CHART — DRAW
// ════════════════════════════════════════════════════════════════

function _drawABC() {
  clear();

  // Display section: right-hand panel in side-by-side mode, or the
  // bottom panel in stacked (mobile) mode. d.{x,y,w,h} is its rect;
  // cx/cy its centre; S its sizing base for text/image scale.
  const d  = _displayRect();
  const cx = d.x + d.w / 2;
  const cy = d.y + d.h / 2;
  const S  = min(d.w, d.h);

  // Display panel base fill
  noStroke(); fill(255);
  rect(d.x, d.y, d.w, d.h);

  // Colour splash on selection
  if (selected && bgSplash < 1) bgSplash = min(1, bgSplash + 0.045);
  if (selected) {
    const col  = color(PALETTE[ALPHABET.indexOf(selected) % PALETTE.length]);
    const maxR = dist(d.x, d.y, d.x + d.w, d.y + d.h) * 1.3; // rect diagonal, with a little bleed
    const r    = _easeOutQuart(bgSplash) * maxR;
    noStroke();
    fill(red(col), green(col), blue(col), 22); circle(cx, cy, r * 2);
    fill(red(col), green(col), blue(col), 10); circle(cx, cy, r * 1.5);
  }

  // Floating stars
  for (const s of stars) {
    s.phase += 0.025;
    const pulse2 = 0.6 + 0.4 * sin(s.phase);
    const c = color(s.col);
    noStroke(); fill(red(c), green(c), blue(c), 60 * pulse2);
    _drawStar(s.x, s.y, s.r * pulse2 * 0.5, s.r * pulse2, 5);
  }

  if (!selected) {
    noStroke(); fill(180, 200, 230, 160);
    textSize(min(S * 0.10, 32)); textAlign(CENTER, CENTER);
    text('Click a letter!', cx, cy);
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.25;
    p.life -= 0.028; p.alpha = p.life * 255;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    noStroke(); fill(red(p.col), green(p.col), blue(p.col), p.alpha);
    circle(p.x, p.y, p.size * p.life);
  }

  if (!selected) return;

  const colStr = PALETTE[ALPHABET.indexOf(selected) % PALETTE.length];
  const col    = color(colStr);

  // Animate letter in
  if (letterScale < 1)   letterScale = min(1, letterScale + 0.07);
  if (letterAlpha < 255) letterAlpha = min(255, letterAlpha + 18);
  const tScale = _easeOutBack(letterScale);

  // Glow layers
  for (let blur = 30; blur > 0; blur -= 6) {
    fill(red(col), green(col), blue(col), map(blur, 0, 30, 0, 18));
    noStroke(); textSize(S * 0.34 * tScale); textAlign(CENTER, CENTER);
    text(selected.letter, cx, cy);
  }

  // Main letter
  fill(red(col), green(col), blue(col), letterAlpha); noStroke();
  textSize(S * 0.34 * tScale); textAlign(CENTER, CENTER);
  text(selected.letter, cx, cy);

  // Lowercase letter
  fill(red(col), green(col), blue(col), letterAlpha * 0.55);
  textSize(S * 0.14 * tScale);
  text(selected.letter.toLowerCase(), cx, cy + S * 0.22 * tScale);

  // Floating picture — HD Twemoji image (falls back to the emoji glyph)
  emojiY = sin(frameCount * 0.04) * 10;
  const eY    = cy - S * 0.27 * tScale + emojiY;
  const eImg  = emojiImg[ALPHABET.indexOf(selected)];
  if (eImg) {
    const eSize = S * 0.22 * tScale;
    push();
    imageMode(CENTER);
    tint(255, letterAlpha);
    image(eImg, cx, eY, eSize, eSize);
    pop();
  } else {
    textSize(S * 0.14 * tScale);
    textAlign(CENTER, CENTER);
    text(selected.emoji, cx, eY);
  }

  // Word label
  textFont('Nunito');
  fill(red(col), green(col), blue(col), letterAlpha * 0.75);
  textSize(S * 0.052 * tScale); textStyle(BOLD); textAlign(CENTER, CENTER);
  text(selected.word.toUpperCase(), cx, cy + S * 0.33 * tScale);
  textStyle(NORMAL); textFont('Fredoka One');

  // Sound replay hint
  if (letterAlpha > 180) {
    fill(red(col), green(col), blue(col), map(letterAlpha, 180, 255, 0, 160));
    textSize(S * 0.034); textAlign(CENTER, CENTER);
    text('🔊 click the letter again to replay', cx, cy + S * 0.40 * tScale);
  }

  // Decorative arcs
  if (letterScale > 0.8) {
    const arcAlpha = map(letterScale, 0.8, 1, 0, 60);
    noFill(); stroke(red(col), green(col), blue(col), arcAlpha); strokeWeight(2);
    for (let r = S * 0.22; r < S * 0.34; r += S * 0.038) {
      arc(cx, cy, r * 2, r * 2, -PI * 0.3,  PI * 0.3);
      arc(cx, cy, r * 2, r * 2,  PI * 0.7,  PI * 1.3);
    }
    noStroke();
  }
}


// ════════════════════════════════════════════════════════════════
//  LETTER SELECTION  (mouse click)
// ════════════════════════════════════════════════════════════════

function _selectLetter(idx) {
  document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
  document.getElementById('card-' + idx)?.classList.add('active');

  selected    = ALPHABET[idx];
  letterScale = 0; letterAlpha = 0; bgSplash = 0;
  _spawnParticles(idx);
  _speakLetter(selected);
}

function _spawnParticles(idx) {
  particles = [];
  const col = color(PALETTE[idx % PALETTE.length]);
  const d = _displayRect();
  const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
  for (let i = 0; i < 28; i++) {
    const angle = random(TWO_PI), speed = random(3, 9);
    particles.push({
      x: cx, y: cy,
      vx: cos(angle) * speed, vy: sin(angle) * speed,
      size: random(8, 20), col, alpha: 255, life: 1,
    });
  }
}

function _speakLetter(item) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt  = new SpeechSynthesisUtterance(`${item.letter} for ${item.word}`);
  utt.rate   = 0.82;
  utt.pitch  = 1.25;
  utt.volume = 1;
  const voices = window.speechSynthesis.getVoices();
  const pref   = voices.find(v => /Samantha|Karen|Moira|Google US|Zira|Jenny/i.test(v.name))
              || voices.find(v => v.lang.startsWith('en'));
  if (pref) utt.voice = pref;
  window.speechSynthesis.speak(utt);
}


// ════════════════════════════════════════════════════════════════
//  ABC-ONLY VISUAL HELPERS
// ════════════════════════════════════════════════════════════════

function _easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function _easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

function _drawStar(x, y, r1, r2, npts) {
  const angle = TWO_PI / npts;
  const half  = angle / 2;
  beginShape();
  for (let a = -HALF_PI; a < TWO_PI - HALF_PI; a += angle) {
    vertex(x + cos(a)        * r2, y + sin(a)        * r2);
    vertex(x + cos(a + half) * r1, y + sin(a + half) * r1);
  }
  endShape(CLOSE);
}
