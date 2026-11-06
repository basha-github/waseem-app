/* ============================================================
   Jungle Word Quiz
   An assignment / exercise app built on the Jungle Word Safari
   learning set. Three question types:
     - Picture -> Word   (multiple choice)
     - Word -> Picture   (multiple choice, word is read aloud)
     - Spelling          (tap letters to spell the pictured word)
   p5.js global mode — canvas renders the ambient jungle scene
   and celebration effects; the quiz itself lives in the DOM.
   ============================================================ */

/* ---------- palette (matches Jungle Word Safari) ---------- */
const PAL = {
  canopyDark: '#0B3D2E',
  canopyMid:  '#15573C',
  canopyMid2: '#1E6B49',
  leaf:       '#4CAF6D',
  leafBright: '#8FD96B',
  sun:        '#FFD23F',
  bark:       '#6B4423',
  barkLight:  '#9C6B3E',
  coral:      '#FF6B5B',
  cream:      '#FFF8E7'
};
const SPARKLE_COLORS = [PAL.sun, PAL.coral, PAL.leafBright, PAL.cream];
const QUESTION_TYPES = ['pic2word', 'word2pic', 'spell'];

/* ---------- background ---------- */
let bgBuffer;
let fireflies = [];
let vines = [];
let sparkles = [];

/* ---------- quiz state ---------- */
let quizQuestions = [];
let currentQ = 0;
let score = 0;
let answered = false;
let spellModel = null; // {slotEls, slotChars, bankBtns}

/* ---------- DOM refs ---------- */
let el = {};

function setup(){
  const cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent(document.body);
  cnv.style('display', 'block');
  imageMode(CENTER);
  rectMode(CORNER);
  noStroke();

  cacheDom();
  rebuildBackground();
  initDecorations();
  wireButtons();
  startQuiz();
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
  rebuildBackground();
}

function cacheDom(){
  el.startScreen   = document.getElementById('startScreen');
  el.quizScreen    = document.getElementById('quizScreen');
  el.resultScreen  = document.getElementById('resultScreen');

  el.startBtn      = document.getElementById('startBtn');
  el.playAgainBtn  = document.getElementById('playAgainBtn');
  el.checkBtn      = document.getElementById('checkBtn');
  el.nextBtn       = document.getElementById('nextBtn');
  el.hintBtn       = document.getElementById('hintBtn');

  el.promptArea    = document.getElementById('promptArea');
  el.answerArea    = document.getElementById('answerArea');
  el.feedback      = document.getElementById('feedbackBanner');

  el.progressPill  = document.getElementById('progressPill');
  el.scorePill     = document.getElementById('scorePill');

  el.resultEmoji   = document.getElementById('resultEmoji');
  el.resultTitle   = document.getElementById('resultTitle');
  el.resultScore   = document.getElementById('resultScoreText');
  el.resultStars   = document.getElementById('resultStars');
}

function wireButtons(){
  el.startBtn.addEventListener('click', startQuiz);
  el.playAgainBtn.addEventListener('click', startQuiz);
  el.checkBtn.addEventListener('click', checkSpelling);
  el.nextBtn.addEventListener('click', goNextQuestion);
  el.hintBtn.addEventListener('click', () => speak(ITEMS[quizQuestions[currentQ].itemIdx].word));
}

function keyPressed(){
  if (key === 'Enter'){
    if (!el.nextBtn.hidden) goNextQuestion();
    else if (!el.checkBtn.hidden && !el.checkBtn.disabled) checkSpelling();
  }
}

/* ============================================================
   SCREEN MANAGEMENT
   ============================================================ */
function showScreen(name){
  el.startScreen.hidden  = name !== 'start';
  el.quizScreen.hidden   = name !== 'quiz';
  el.resultScreen.hidden = name !== 'result';

  el.checkBtn.hidden = true;
  el.nextBtn.hidden = true;
  el.hintBtn.hidden = true;
}

/* ============================================================
   QUIZ FLOW
   ============================================================ */
function startQuiz(){
  score = 0;
  currentQ = 0;
  quizQuestions = buildQuiz();
  showScreen('quiz');
  loadQuestion();
}

function buildQuiz(){
  const order = shuffle([...Array(ITEMS.length).keys()]);
  let lastType = null;

  return order.map((itemIdx) => {
    let type = random(QUESTION_TYPES);
    let guard = 0;
    while (type === lastType && random() < 0.6 && guard < 5){
      type = random(QUESTION_TYPES);
      guard++;
    }
    lastType = type;

    const q = { type, itemIdx };
    if (type !== 'spell'){
      const pool = order.filter(j => j !== itemIdx);
      const distractors = shuffle(pool).slice(0, 3);
      q.optionIdxs = shuffle([itemIdx, ...distractors]);
    }
    return q;
  });
}

function loadQuestion(){
  answered = false;
  updateHud();
  clearFeedback();
  el.checkBtn.hidden = true;
  el.nextBtn.hidden = true;
  el.hintBtn.hidden = true;
  el.promptArea.innerHTML = '';
  el.answerArea.innerHTML = '';

  const q = quizQuestions[currentQ];
  const item = ITEMS[q.itemIdx];

  if (q.type === 'pic2word'){
    renderImagePrompt(item, 'What is this?');
    renderWordOptions(q);
  } else if (q.type === 'word2pic'){
    renderWordPrompt(item, 'Find the matching picture');
    renderImageOptions(q);
    el.hintBtn.hidden = false;
    speak(item.word);
  } else {
    renderImagePrompt(item, 'Spell what you see!');
    renderSpellUI(item.word);
    el.hintBtn.hidden = false;
    speak(item.word);
  }
}

function goNextQuestion(){
  currentQ++;
  if (currentQ >= quizQuestions.length) showResult();
  else loadQuestion();
}

/* ============================================================
   PROMPT RENDERERS
   ============================================================ */
function renderImagePrompt(item, label){
  const wrap = document.createElement('div');
  wrap.className = 'prompt-label';
  wrap.textContent = label;
  el.promptArea.appendChild(wrap);

  const img = document.createElement('img');
  img.className = 'prompt-image';
  img.src = 'assets/gifs/' + item.gif;
  img.alt = item.word;
  el.promptArea.appendChild(img);
}

function renderWordPrompt(item, label){
  const wrap = document.createElement('div');
  wrap.className = 'prompt-label';
  wrap.textContent = label;
  el.promptArea.appendChild(wrap);

  const wordWrap = document.createElement('div');
  wordWrap.className = 'prompt-word';
  item.word.split(' ').forEach(part => {
    part.split('').forEach(ch => {
      const tile = document.createElement('div');
      tile.className = 'letter-tile';
      tile.textContent = ch.toUpperCase();
      wordWrap.appendChild(tile);
    });
  });
  el.promptArea.appendChild(wordWrap);
}

/* ============================================================
   MULTIPLE CHOICE RENDERERS
   ============================================================ */
function renderWordOptions(q){
  const grid = document.createElement('div');
  grid.className = 'options-grid';

  q.optionIdxs.forEach(idx => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = ITEMS[idx].word;
    btn.dataset.idx = idx;
    btn.addEventListener('click', () => handleMCQAnswer(btn, idx === q.itemIdx, q));
    grid.appendChild(btn);
  });

  el.answerArea.appendChild(grid);
}

function renderImageOptions(q){
  const grid = document.createElement('div');
  grid.className = 'options-grid';

  q.optionIdxs.forEach(idx => {
    const btn = document.createElement('button');
    btn.className = 'option-btn opt-image';
    btn.dataset.idx = idx;
    const img = document.createElement('img');
    img.src = 'assets/gifs/' + ITEMS[idx].gif;
    img.alt = ITEMS[idx].word;
    btn.appendChild(img);
    btn.addEventListener('click', () => handleMCQAnswer(btn, idx === q.itemIdx, q));
    grid.appendChild(btn);
  });

  el.answerArea.appendChild(grid);
}

function handleMCQAnswer(btnEl, isCorrect, q){
  if (answered) return;
  answered = true;
  if (isCorrect) score++;

  const buttons = [...el.answerArea.querySelectorAll('.option-btn')];
  buttons.forEach(b => {
    b.disabled = true;
    if (parseInt(b.dataset.idx, 10) === q.itemIdx) b.classList.add('correct');
  });
  if (!isCorrect) btnEl.classList.add('wrong');

  const item = ITEMS[q.itemIdx];
  showFeedback(isCorrect, item.word);
  speak(item.word);

  if (isCorrect){
    const r = btnEl.getBoundingClientRect();
    spawnSparkles(r.left + r.width/2, r.top + r.height/2);
  }

  updateHud();
  el.nextBtn.hidden = false;
  el.hintBtn.hidden = true;
}

/* ============================================================
   SPELLING EXERCISE
   ============================================================ */
function renderSpellUI(word){
  const slotsWrap = document.createElement('div');
  slotsWrap.className = 'spell-slots';

  const slotEls = [];
  const slotChars = [];

  word.split(' ').forEach(part => {
    const partWrap = document.createElement('div');
    partWrap.className = 'slot-word-part';
    part.split('').forEach(ch => {
      const slot = document.createElement('div');
      slot.className = 'letter-slot';
      slot.dataset.filled = 'false';
      slot.addEventListener('click', () => removeLetter(slotEls.indexOf(slot)));
      partWrap.appendChild(slot);
      slotEls.push(slot);
      slotChars.push(ch.toUpperCase());
    });
    slotsWrap.appendChild(partWrap);
  });

  const bankWrap = document.createElement('div');
  bankWrap.className = 'letter-bank';
  const shuffledChars = shuffle(slotChars.map((ch, i) => ({ ch, id: i })));
  const bankBtns = [];

  shuffledChars.forEach(entry => {
    const btn = document.createElement('button');
    btn.className = 'bank-letter';
    btn.textContent = entry.ch;
    btn.dataset.bankId = entry.id;
    btn.addEventListener('click', () => placeLetter(btn, entry.ch));
    bankWrap.appendChild(btn);
    bankBtns.push(btn);
  });

  el.answerArea.appendChild(slotsWrap);
  el.answerArea.appendChild(bankWrap);

  spellModel = { slotEls, slotChars, bankBtns };
  el.checkBtn.hidden = false;
  el.checkBtn.disabled = true;
}

function placeLetter(bankBtn, ch){
  if (answered || bankBtn.classList.contains('used')) return;
  const emptySlot = spellModel.slotEls.find(s => s.dataset.filled === 'false');
  if (!emptySlot) return;

  emptySlot.textContent = ch;
  emptySlot.dataset.filled = 'true';
  emptySlot.dataset.bankId = bankBtn.dataset.bankId;
  emptySlot.classList.add('filled');
  bankBtn.classList.add('used');

  const allFilled = spellModel.slotEls.every(s => s.dataset.filled === 'true');
  el.checkBtn.disabled = !allFilled;
}

function removeLetter(slotIndex){
  if (answered || slotIndex < 0) return;
  const slot = spellModel.slotEls[slotIndex];
  if (slot.dataset.filled !== 'true') return;

  const bankBtn = spellModel.bankBtns.find(b => b.dataset.bankId === slot.dataset.bankId);
  if (bankBtn) bankBtn.classList.remove('used');

  slot.textContent = '';
  slot.dataset.filled = 'false';
  slot.classList.remove('filled');
  delete slot.dataset.bankId;

  el.checkBtn.disabled = true;
}

function checkSpelling(){
  if (answered || el.checkBtn.disabled) return;
  answered = true;

  const item = ITEMS[quizQuestions[currentQ].itemIdx];
  let allCorrect = true;
  spellModel.slotEls.forEach((slot, i) => {
    const ok = slot.textContent === spellModel.slotChars[i];
    slot.classList.add(ok ? 'correct' : 'wrong');
    if (!ok) allCorrect = false;
  });

  if (allCorrect) score++;
  spellModel.bankBtns.forEach(b => b.disabled = true);

  showFeedback(allCorrect, item.word);
  speak(item.word);

  if (allCorrect){
    const r = el.answerArea.getBoundingClientRect();
    spawnSparkles(r.left + r.width/2, r.top + r.height/2);
  }

  updateHud();
  el.checkBtn.hidden = true;
  el.hintBtn.hidden = true;
  el.nextBtn.hidden = false;
}

/* ============================================================
   FEEDBACK / HUD
   ============================================================ */
function showFeedback(correct, word){
  el.feedback.textContent = correct
    ? '🎉 Correct! It\u2019s a ' + word + '!'
    : '🤔 Not quite — it\u2019s a ' + word + '.';
  el.feedback.className = 'feedback-banner show ' + (correct ? 'ok' : 'bad');
}

function clearFeedback(){
  el.feedback.textContent = '';
  el.feedback.className = 'feedback-banner';
}

function updateHud(){
  el.progressPill.textContent = 'Question ' + (currentQ + 1) + ' / ' + quizQuestions.length;
  el.scorePill.textContent = '⭐ ' + score;
}

/* ============================================================
   RESULTS
   ============================================================ */
function showResult(){
  const total = quizQuestions.length;
  const pct = score / total;
  const stars = Math.max(0, Math.min(5, Math.round(pct * 5)));

  let tier;
  if (pct >= 0.9)      tier = { emoji: '🏆', title: 'Amazing job!' };
  else if (pct >= 0.7)  tier = { emoji: '🎉', title: 'Great work!' };
  else if (pct >= 0.5)  tier = { emoji: '🙂', title: 'Good try!' };
  else                  tier = { emoji: '🌱', title: 'Keep practicing!' };

  el.resultEmoji.textContent = tier.emoji;
  el.resultTitle.textContent = tier.title;
  el.resultScore.textContent = 'You scored ' + score + ' out of ' + total;
  el.resultStars.textContent = '⭐'.repeat(stars) + '☆'.repeat(5 - stars);

  showScreen('result');

  if (pct >= 0.7){
    const cx = windowWidth / 2, cy = windowHeight * 0.35;
    spawnSparkles(cx, cy);
    setTimeout(() => spawnSparkles(cx - 80, cy + 20), 150);
    setTimeout(() => spawnSparkles(cx + 80, cy + 20), 300);
  }
}

/* ============================================================
   SPEECH
   ============================================================ */
function speak(text){
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.85;
  utter.pitch = 1.05;
  window.speechSynthesis.speak(utter);
}

/* ============================================================
   BACKGROUND  (jungle scene, same look as the learning app)
   ============================================================ */
function rebuildBackground(){
  const g = createGraphics(width, height);
  g.noStroke();

  for (let y = 0; y < height; y++){
    const t = y / height;
    const c = lerpColor(g.color(PAL.canopyDark), g.color(PAL.canopyMid2), t);
    g.stroke(c);
    g.line(0, y, width, y);
  }
  g.noStroke();

  g.push();
  for (let r = 320; r > 0; r -= 16){
    g.fill(255, 210, 90, 4);
    g.ellipse(width*0.86, height*0.06, r, r);
  }
  g.pop();

  drawLeafCluster(g, width*0.04, height*0.05, 230, PAL.canopyMid, 0.55);
  drawLeafCluster(g, width*0.98, height*0.02, 260, PAL.leaf, 0.35);
  drawLeafCluster(g, -20, height*0.85, 300, PAL.canopyMid, 0.5);
  drawLeafCluster(g, width*1.0, height*0.92, 280, PAL.leaf, 0.3);

  const groundY = height - max(36, height*0.045);
  g.fill(60, 40, 26);
  g.rect(0, groundY, width, height - groundY);
  g.fill(PAL.leaf);
  for (let x = -10; x < width + 20; x += 22){
    const th = 14 + (noiseLikeRand(x) * 14);
    g.triangle(x, groundY + 4, x + 11, groundY - th, x + 22, groundY + 4);
  }

  bgBuffer = g;
}

function noiseLikeRand(seedVal){
  const s = Math.sin(seedVal * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function drawLeafCluster(g, cx, cy, size, col, alpha){
  g.push();
  g.translate(cx, cy);
  const n = 7;
  for (let i = 0; i < n; i++){
    const a = (TWO_PI / n) * i;
    const r = size * 0.42;
    const lx = cos(a) * r * 0.5;
    const ly = sin(a) * r * 0.5;
    g.push();
    g.translate(lx, ly);
    g.rotate(a);
    g.fill(red(g.color(col)), green(g.color(col)), blue(g.color(col)), alpha*255*0.5);
    g.ellipse(0, 0, size*0.62, size*0.32);
    g.pop();
  }
  g.fill(red(g.color(col)), green(g.color(col)), blue(g.color(col)), alpha*255*0.6);
  g.ellipse(0, 0, size*0.5, size*0.5);
  g.pop();
}

/* ============================================================
   DECORATIONS (fireflies + hanging vines)
   ============================================================ */
function initDecorations(){
  fireflies = [];
  const count = floor(constrain(width/90, 8, 16));
  for (let i = 0; i < count; i++){
    fireflies.push({
      x: random(width),
      y: random(height*0.15, height*0.92),
      phase: random(TWO_PI),
      speed: random(0.006, 0.016),
      r: random(2.4, 4.2)
    });
  }

  vines = [];
  const vineXs = [width*0.0, width*0.5, width*1.0];
  vineXs.forEach((x, i) => {
    vines.push({
      baseX: x,
      len: random(80, 150) + height*0.05,
      phase: random(TWO_PI),
      speed: 0.012 + i*0.002,
      amp: random(10, 18)
    });
  });
}

function drawFireflies(){
  push();
  noStroke();
  for (const f of fireflies){
    const fy = f.y + sin(frameCount*f.speed + f.phase) * 10;
    const fx = f.x + cos(frameCount*f.speed*0.7 + f.phase) * 8;
    const glow = (sin(frameCount*0.05 + f.phase) + 1) / 2;
    const alpha = 90 + glow*140;
    drawingContext.shadowBlur = 10;
    drawingContext.shadowColor = 'rgba(255,210,90,0.9)';
    fill(255, 220, 120, alpha);
    ellipse(fx, fy, f.r);
    drawingContext.shadowBlur = 0;
  }
  pop();
}

function drawVines(){
  push();
  noFill();
  strokeWeight(5);
  for (const v of vines){
    const sway = sin(frameCount*v.speed + v.phase) * v.amp;
    stroke(70, 110, 70, 200);
    const segs = 6;
    let prevX = v.baseX, prevY = 0;
    for (let s = 1; s <= segs; s++){
      const t = s/segs;
      const y = v.len * t;
      const x = v.baseX + sway * t * t;
      line(prevX, prevY, x, y);
      if (s % 2 === 0){
        push();
        translate(x, y);
        rotate(sway*0.02);
        noStroke();
        fill(PAL.leaf);
        ellipse(0, 0, 22, 11);
        fill(PAL.leafBright);
        ellipse(-3, -1, 10, 6);
        pop();
      }
      prevX = x; prevY = y;
    }
  }
  pop();
}

/* ---------- celebration sparkles ---------- */
function spawnSparkles(x, y){
  for (let i = 0; i < 22; i++){
    const a = random(TWO_PI);
    const sp = random(1.5, 5);
    sparkles.push({
      x, y,
      vx: cos(a)*sp,
      vy: sin(a)*sp - 1.5,
      life: 40,
      maxLife: 40,
      size: random(4, 9),
      col: random(SPARKLE_COLORS)
    });
  }
}

function updateAndDrawSparkles(){
  push();
  noStroke();
  for (let i = sparkles.length - 1; i >= 0; i--){
    const p = sparkles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.12;
    p.life--;
    const a = map(p.life, 0, p.maxLife, 0, 255);
    const c = color(p.col);
    fill(red(c), green(c), blue(c), a);
    ellipse(p.x, p.y, p.size * (p.life/p.maxLife));
    if (p.life <= 0) sparkles.splice(i, 1);
  }
  pop();
}

/* ============================================================
   MAIN DRAW
   ============================================================ */
function draw(){
  image(bgBuffer, width/2, height/2, width, height);
  drawFireflies();
  drawVines();
  updateAndDrawSparkles();
}
