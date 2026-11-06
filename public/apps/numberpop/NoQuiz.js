// ════════════════════════════════════════════════════════════════
//  Number Quiz · quiz.js
//  Random addition questions, balloon answers, confetti, applause
// ════════════════════════════════════════════════════════════════

// ── Config ────────────────────────────────────────────────────────
const MAX_NUM   = 9;   // operands 1–9
const N_CHOICES = 4;   // number of answer balloons

// Balloon colours (rich, kid-friendly)
const BALLOON_COLORS = [
  '#FF4757','#FF6B35','#FFD700','#2ed573',
  '#1e90ff','#a29bfe','#fd79a8','#00cec9',
  '#e17055','#6c5ce7','#00b894','#fdcb6e',
];

// ── State ─────────────────────────────────────────────────────────
let correctAnswer  = 0;
let answered       = false;   // true only after CORRECT answer
let score          = 0;
let balloonTimers  = [];
let currentChoices = [];      // keep choices for respawn after drift

// ── Audio (Web Audio API) ─────────────────────────────────────────
let audioCtx = null;
function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playPop(correct) {
  const ctx = getCtx();
  const t   = ctx.currentTime;
  if (correct) {
    // Cheerful ascending ding-ding-ding
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i*0.12);
      g.gain.linearRampToValueAtTime(0.35, t + i*0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i*0.12 + 0.25);
      o.connect(g); g.connect(ctx.destination);
      o.start(t + i*0.12); o.stop(t + i*0.12 + 0.28);
    });
  } else {
    // Dull thud
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.18);
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.25);
  }
}

function playApplause() {
  const ctx = getCtx();
  const t   = ctx.currentTime;
  // Noise burst × 3 swells = crowd applause
  for (let burst = 0; burst < 3; burst++) {
    const off = burst * 0.38;
    const dur = 0.32;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
    const src  = ctx.createBufferSource();
    const filt = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = buf;
    filt.type = 'bandpass'; filt.frequency.value = 2200; filt.Q.value = 0.8;
    gain.gain.setValueAtTime(0, t + off);
    gain.gain.linearRampToValueAtTime(0.55, t + off + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, t + off + dur);
    src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
    src.start(t + off); src.stop(t + off + dur + 0.05);
  }
  // Cheerful melody on top
  [523,659,784,1047,1319].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.18, t + i*0.09);
    g.gain.exponentialRampToValueAtTime(0.001, t + i*0.09 + 0.3);
    o.connect(g); g.connect(ctx.destination);
    o.start(t + i*0.09); o.stop(t + i*0.09 + 0.32);
  });
}

function playWrong() {
  const ctx = getCtx();
  const t   = ctx.currentTime;
  [330, 277].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square'; o.frequency.value = f;
    g.gain.setValueAtTime(0.28, t + i*0.18);
    g.gain.exponentialRampToValueAtTime(0.001, t + i*0.18 + 0.22);
    o.connect(g); g.connect(ctx.destination);
    o.start(t + i*0.18); o.stop(t + i*0.18 + 0.25);
  });
}

// ── Confetti ──────────────────────────────────────────────────────
const canvas = document.getElementById('confetti-canvas');
const cctx   = canvas.getContext('2d');
let confettiPieces = [];

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function launchConfetti() {
  confettiPieces = [];
  const colors = ['#FF4757','#FFD700','#2ed573','#1e90ff','#fd79a8','#a29bfe','#FF6B35'];
  for (let i = 0; i < 110; i++) {
    confettiPieces.push({
      x:    Math.random() * canvas.width,
      y:    -10 - Math.random() * 80,
      w:    8 + Math.random() * 10,
      h:    5 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.2,
      vx:   (Math.random() - 0.5) * 4,
      vy:   2.5 + Math.random() * 3.5,
      alpha: 1,
    });
  }
  animateConfetti();
}

function animateConfetti() {
  cctx.clearRect(0, 0, canvas.width, canvas.height);
  confettiPieces.forEach((p, i) => {
    p.x += p.vx; p.y += p.vy;
    p.rotation += p.rotSpeed;
    if (p.y > canvas.height + 20) p.alpha -= 0.04;
    cctx.save();
    cctx.globalAlpha = Math.max(0, p.alpha);
    cctx.translate(p.x, p.y);
    cctx.rotate(p.rotation);
    cctx.fillStyle = p.color;
    cctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
    cctx.restore();
  });
  confettiPieces = confettiPieces.filter(p => p.alpha > 0);
  if (confettiPieces.length > 0) requestAnimationFrame(animateConfetti);
  else cctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ── Generate question ─────────────────────────────────────────────
function randomQuestion() {
  const a = 1 + Math.floor(Math.random() * MAX_NUM);
  const b = 1 + Math.floor(Math.random() * MAX_NUM);
  return { a, b, answer: a + b };
}

function uniqueChoices(correct) {
  const set = new Set([correct]);
  while (set.size < N_CHOICES) {
    const delta = Math.floor(Math.random() * 5) + 1;
    const val   = correct + (Math.random() < 0.5 ? delta : -delta);
    if (val > 0 && val <= MAX_NUM * 2) set.add(val);
  }
  return shuffle([...set]);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Render question ───────────────────────────────────────────────
function renderQuestion(q) {
  document.getElementById('question-text').innerHTML =
    `<span class="num">${q.a}</span> `  +
    `<span class="op">+</span> `        +
    `<span class="num">${q.b}</span> `  +
    `<span class="eq">=</span> `        +
    `<span class="q">?</span>`;
}

// ── Spawn balloons ────────────────────────────────────────────────
const COLORS_SHUFFLED = shuffle([...BALLOON_COLORS]);

function spawnBalloons(choices) {
  currentChoices = choices;          // remember for respawn
  const field   = document.getElementById('balloon-field');
  field.innerHTML = '';
  balloonTimers.forEach(clearTimeout);
  balloonTimers = [];

  choices.forEach((val, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'balloon-wrap';

    // Gentle staggered pop-in, then balloons just sit and bob in place
    wrap.style.animationDelay = (i * 0.12) + 's';

    const color = BALLOON_COLORS[(i * 3) % BALLOON_COLORS.length];

    const body = document.createElement('div');
    body.className = 'balloon-body';
    body.style.background = color;
    body.style.color       = color; // for ::after triangle
    // Stagger the idle bob so balloons don't all bounce in sync
    body.style.animationDelay = (Math.random() * 1.5) + 's';

    const num = document.createElement('div');
    num.className = 'balloon-number';
    num.textContent = val;

    const string = document.createElement('div');
    string.className = 'balloon-string';

    body.appendChild(num);
    wrap.appendChild(body);
    wrap.appendChild(string);
    wrap.dataset.value = val;

    wrap.addEventListener('click', () => onBalloonClick(wrap, val));
    field.appendChild(wrap);
  });
}

// ── Balloon click ─────────────────────────────────────────────────
function onBalloonClick(wrap, val) {
  if (answered) return;
  // Prevent double-click on the same balloon
  if (wrap.dataset.clicked) return;
  wrap.dataset.clicked = '1';

  if (val === correctAnswer) {
    // ✅ Correct! Lock the game.
    answered = true;
    balloonTimers.forEach(clearTimeout);

    wrap.classList.add('popping');
    playPop(true);
    setTimeout(() => {
      playApplause();
      launchConfetti();
      showResult(true);
      score++;
      document.getElementById('score-val').textContent = score;
      updateStars();
      popRemainingBalloons(wrap, false);
      // Auto-advance to next question after a short celebration pause
      setTimeout(() => nextQuestion(), 2200);
    }, 250);

  } else {
    // ❌ Wrong — pop just this balloon, keep others alive for retry
    wrap.classList.add('wrong-pop');
    playPop(false);
    playWrong();
    showResult(false);

    // Remove the wrong balloon after its pop animation
    setTimeout(() => {
      if (wrap.parentNode) wrap.remove();
      // If no balloons left, respawn the full set so kid can keep trying
      const field = document.getElementById('balloon-field');
      if (field.children.length === 0 && !answered) {
        spawnBalloons(currentChoices);
      }
    }, 400);
  }
}

function popRemainingBalloons(except, withSound) {
  const field = document.getElementById('balloon-field');
  [...field.children].forEach((w, i) => {
    if (w === except) return;
    setTimeout(() => {
      w.classList.add('popping');
      if (withSound) playPop(false);
    }, i * 120);
  });
}

function highlightCorrect() {
  const field = document.getElementById('balloon-field');
  [...field.children].forEach(w => {
    if (parseInt(w.dataset.value) === correctAnswer) {
      const body = w.querySelector('.balloon-body');
      body.style.outline = '4px solid #FFD700';
      body.style.boxShadow = '0 0 20px 6px rgba(255,215,0,0.6)';
      body.style.animation = 'none';
      body.style.transform = 'scale(1.15)';
    } else {
      w.style.opacity = '0.35';
    }
  });
}

// ── Result overlay ────────────────────────────────────────────────
function showResult(correct) {
  const overlay = document.getElementById('result-overlay');
  const emoji   = document.getElementById('result-emoji');
  const msg     = document.getElementById('result-msg');

  if (correct) {
    const celebrations = ['🎉','🌟','🏆','🎊','🥳','✨','🎈'];
    emoji.textContent = celebrations[Math.floor(Math.random() * celebrations.length)];
    const phrases = ['Amazing!','Brilliant!','You got it!','Superstar!','Correct! 🎉','Nailed it!'];
    msg.textContent = phrases[Math.floor(Math.random() * phrases.length)];
    msg.className   = '';
  } else {
    emoji.textContent = '🤔';
    msg.textContent   = `Answer is ${correctAnswer}!`;
    msg.className     = 'wrong';
  }

  overlay.classList.add('show');
  setTimeout(() => overlay.classList.remove('show'), 2000);
}

// ── Stars ─────────────────────────────────────────────────────────
function updateStars() {
  const row = document.getElementById('stars-row');
  row.textContent = '⭐'.repeat(Math.min(score, 8));
}

// ── Next question ─────────────────────────────────────────────────
function nextQuestion() {
  document.getElementById('next-btn').classList.remove('show');
  document.getElementById('balloon-field').innerHTML = '';
  balloonTimers.forEach(clearTimeout);
  answered = false;
  startQuestion();
}

function startQuestion() {
  const q = randomQuestion();
  correctAnswer = q.answer;
  const choices = uniqueChoices(correctAnswer);

  renderQuestion(q);

  // Small delay before balloons appear
  setTimeout(() => spawnBalloons(choices), 400);
}

// ── Boot ──────────────────────────────────────────────────────────
window.addEventListener('load', () => startQuestion());
