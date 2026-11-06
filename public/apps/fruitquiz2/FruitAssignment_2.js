/* ============================================================
   Fruity Market Quiz
   An assignment / exercise app built on the Fruity Market
   Match learning set. Three question types:
     - Picture -> Word   (multiple choice)
     - Word -> Picture   (multiple choice, word is read aloud)
     - Spelling          (tap letters to spell the pictured word)
   p5.js global mode — canvas renders the ambient market scene
   and celebration effects; the quiz itself lives in the DOM.
   ============================================================ */

/* ---------- palette (matches Fruity Market Match) ---------- */
const PAL = {
  skyTop:    '#FFE9B8',
  skyBottom: '#FFD27A',
  crate:     '#8B5A2B',
  crateLite: '#C68642',
  crateDark: '#5C3A1A',
  leaf:      '#5B8C3A',
  leafBright:'#8FC75A',
  tomato:    '#E63946',
  citrus:    '#FF9F1C',
  grape:     '#7B4397',
  cream:     '#FFFBF0'
};
const CONFETTI_COLORS = [PAL.tomato, PAL.citrus, PAL.grape, PAL.leafBright, '#3D8BFD'];
const QUESTION_TYPES = ['pic2word', 'word2pic', 'spell'];

/* ---------- background ---------- */
let bgBuffer;
let confetti = [];
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
  img.src = 'assets/photos/' + item.photo;
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
    img.src = 'assets/photos/' + ITEMS[idx].photo;
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
   BACKGROUND  (sunny market scene, same look as the learning app)
   ============================================================ */
function rebuildBackground(){
  const g = createGraphics(width, height);
  g.noStroke();

  for (let y = 0; y < height; y++){
    const t = y / height;
    const c = lerpColor(g.color(PAL.skyTop), g.color(PAL.skyBottom), t);
    g.stroke(c);
    g.line(0, y, width, y);
  }
  g.noStroke();

  g.push();
  for (let r = 300; r > 0; r -= 16){
    g.fill(255, 245, 200, 5);
    g.ellipse(width*0.12, height*0.08, r, r);
  }
  g.pop();

  drawBlob(g, width*0.95, height*0.06, 240, PAL.citrus, 0.28);
  drawBlob(g, width*0.02, height*0.78, 280, PAL.grape, 0.22);
  drawBlob(g, width*0.85, height*0.9, 260, PAL.leaf, 0.25);

  const stripeH = max(20, height*0.03);
  const stripeW = max(46, width*0.05);
  g.push();
  for (let x = -stripeW; x < width + stripeW; x += stripeW*2){
    g.fill(PAL.tomato);
    g.rect(x, 0, stripeW, stripeH);
    g.fill(PAL.cream);
    g.rect(x + stripeW, 0, stripeW, stripeH);
  }
  g.fill(PAL.cream);
  for (let x = 0; x < width; x += stripeW){
    g.arc(x + stripeW/2, stripeH, stripeW, stripeH*0.8, 0, PI);
  }
  g.pop();

  const groundY = height - max(34, height*0.04);
  g.fill(PAL.crate);
  g.rect(0, groundY, width, height - groundY);
  g.stroke(PAL.crateDark);
  g.strokeWeight(3);
  for (let x = 0; x < width; x += 34){
    g.line(x, groundY, x + 18, height);
  }
  g.noStroke();
  g.fill(PAL.crateLite);
  g.rect(0, groundY, width, 6);

  bgBuffer = g;
}

function drawBlob(g, cx, cy, size, col, alpha){
  g.push();
  g.translate(cx, cy);
  const c = g.color(col);
  g.fill(red(c), green(c), blue(c), alpha*255);
  g.ellipse(0, 0, size, size*0.9);
  g.pop();
}

/* ============================================================
   DECORATIONS (confetti + hanging vines)
   ============================================================ */
function initDecorations(){
  confetti = [];
  const count = floor(constrain(width/80, 10, 20));
  for (let i = 0; i < count; i++){
    confetti.push({
      x: random(width),
      y: random(height*0.15, height*0.9),
      phase: random(TWO_PI),
      speed: random(0.005, 0.014),
      r: random(3, 6),
      col: random(CONFETTI_COLORS)
    });
  }

  vines = [];
  const vineXs = [width*0.06, width*0.94];
  vineXs.forEach((x, i) => {
    vines.push({
      baseX: x,
      len: random(70, 120) + height*0.04,
      phase: random(TWO_PI),
      speed: 0.012 + i*0.003,
      amp: random(8, 14),
      fruitCol: i === 0 ? PAL.tomato : PAL.grape
    });
  });
}

function drawConfetti(){
  push();
  noStroke();
  for (const f of confetti){
    const fy = f.y + sin(frameCount*f.speed + f.phase) * 12;
    const fx = f.x + cos(frameCount*f.speed*0.6 + f.phase) * 8;
    const c = color(f.col);
    fill(red(c), green(c), blue(c), 200);
    ellipse(fx, fy, f.r*2);
  }
  pop();
}

function drawVines(){
  push();
  noFill();
  strokeWeight(5);
  for (const v of vines){
    const sway = sin(frameCount*v.speed + v.phase) * v.amp;
    stroke(91, 140, 58, 220);
    const segs = 5;
    let prevX = v.baseX, prevY = 0;
    for (let s = 1; s <= segs; s++){
      const t = s/segs;
      const y = v.len * t;
      const x = v.baseX + sway * t * t;
      line(prevX, prevY, x, y);
      if (s % 2 === 0){
        push();
        translate(x, y);
        noStroke();
        fill(v.fruitCol);
        ellipse(-6, 4, 14, 14);
        ellipse(6, 6, 14, 14);
        fill(PAL.leafBright);
        ellipse(0, -6, 12, 7);
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
      col: random(CONFETTI_COLORS)
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
  drawConfetti();
  drawVines();
  updateAndDrawSparkles();
}
