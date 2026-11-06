/* ============================================================
   Cosmic Color Quiz
   An assignment / exercise app built on the Cosmic Color Quest
   learning set. Three question types:
     - Color -> Word   (multiple choice)
     - Word  -> Color  (multiple choice, word is read aloud)
     - Spelling        (tap letters to spell the colour's name)
   p5.js global mode — canvas renders the ambient space scene
   and celebration effects; the quiz itself lives in the DOM.
   ============================================================ */

/* ---------- palette (matches Cosmic Color Quest) ---------- */
const PAL = {
  spaceDark: '#0B1026',
  spaceMid:  '#1B2350',
  spaceMid2: '#2E1A47',
  nebula:    '#6C3FAE',
  star:      '#FFD23F',
  rocket:    '#FF6B5B',
  planet:    '#2EC4B6',
  cream:     '#F5F2FF'
};
const SPARKLE_COLORS = [PAL.star, PAL.rocket, PAL.planet, PAL.cream];
const QUESTION_TYPES = ['color2word', 'word2color', 'spell'];

/* ---------- background ---------- */
let bgBuffer;
let twinkles = [];
let planetsDeco = [];
let comet;
let sparkles = [];

/* ---------- quiz state ---------- */
let quizQuestions = [];
let currentQ = 0;
let score = 0;
let answered = false;
let spellModel = null;

/* ---------- DOM refs ---------- */
let el = {};
let domError = false;

function setup(){
  const cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent(document.body);
  cnv.style('display', 'block');
  imageMode(CENTER);
  rectMode(CORNER);
  noStroke();

  cacheDom();

  const missing = findMissingDomIds();
  if (missing.length){
    domError = true;
    showDomError(missing);
    noLoop();
    return;
  }

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

/* Maps each el.* key to the actual HTML id it should match, so a
   missing element can be reported by its real id in the HTML. */
const REQUIRED_DOM_IDS = {
  startScreen: 'startScreen', quizScreen: 'quizScreen', resultScreen: 'resultScreen',
  startBtn: 'startBtn', playAgainBtn: 'playAgainBtn', checkBtn: 'checkBtn',
  nextBtn: 'nextBtn', hintBtn: 'hintBtn',
  promptArea: 'promptArea', answerArea: 'answerArea', feedback: 'feedbackBanner',
  progressPill: 'progressPill', scorePill: 'scorePill',
  resultEmoji: 'resultEmoji', resultTitle: 'resultTitle',
  resultScore: 'resultScoreText', resultStars: 'resultStars'
};

function findMissingDomIds(){
  const missing = [];
  for (const key in REQUIRED_DOM_IDS){
    if (!el[key]) missing.push(REQUIRED_DOM_IDS[key]);
  }
  return missing;
}

/* Shown when this script is loaded into a page that doesn't have the
   matching HTML structure — fails loudly and visibly instead of
   crashing deep inside some later function with a cryptic error. */
function showDomError(missingIds){
  console.error('Cosmic Color Quiz: missing required HTML element(s): ' + missingIds.join(', '));

  const box = document.createElement('div');
  box.style.cssText = `
    position:fixed; inset:0; z-index:9999;
    background:#0B1026; color:#F5F2FF;
    font-family:system-ui,sans-serif;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:28px; text-align:center;
  `;
  box.innerHTML = `
    <div style="font-size:42px;margin-bottom:10px;">⚠️</div>
    <div style="font-size:20px;font-weight:700;margin-bottom:10px;">
      This script can't find its matching page
    </div>
    <div style="max-width:480px;font-size:15px;line-height:1.6;opacity:0.9;">
      index.html is missing ${missingIds.length === 1 ? 'this element' : 'these elements'}:
      <br><b>${missingIds.join(', ')}</b>
      <br><br>
      Make sure ColorQuiz.js is paired with the exact index.html and
      style.css it came with — this usually happens when a script gets
      separated from its original HTML file.
    </div>
  `;
  document.body.appendChild(box);
}

function wireButtons(){
  safeOn('startBtn', startQuiz);
  safeOn('playAgainBtn', startQuiz);
  safeOn('checkBtn', checkSpelling);
  safeOn('nextBtn', goNextQuestion);
  safeOn('hintBtn', () => speak(ITEMS[quizQuestions[currentQ].itemIdx].word));
}

function safeOn(id, handler){
  const elRef = document.getElementById(id);
  if (elRef){
    elRef.addEventListener('click', handler);
  } else {
    console.warn('Cosmic Color Quiz: no element with id="' + id + '" was found in the page.');
  }
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

  if (q.type === 'color2word'){
    renderColorPrompt(item, 'What color is this?');
    renderWordOptions(q);
  } else if (q.type === 'word2color'){
    renderWordPrompt(item, 'Find the matching color');
    renderColorOptions(q);
    el.hintBtn.hidden = false;
    speak(item.word);
  } else {
    renderColorPrompt(item, 'Spell the color!');
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
function renderColorPrompt(item, label){
  const wrap = document.createElement('div');
  wrap.className = 'prompt-label';
  wrap.textContent = label;
  el.promptArea.appendChild(wrap);

  const swatchWrap = document.createElement('div');
  swatchWrap.className = 'prompt-color';
  swatchWrap.innerHTML = colorSwatchSVG(item.color);
  el.promptArea.appendChild(swatchWrap);
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

function renderColorOptions(q){
  const grid = document.createElement('div');
  grid.className = 'options-grid';

  q.optionIdxs.forEach(idx => {
    const btn = document.createElement('button');
    btn.className = 'option-btn opt-color';
    btn.dataset.idx = idx;
    const colorKey = ITEMS[idx].color;
    btn.innerHTML = colorSwatchSVG(colorKey);
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
   BACKGROUND  (deep space scene, same look as the learning app)
   ============================================================ */
function rebuildBackground(){
  const g = createGraphics(width, height);
  g.noStroke();

  for (let y = 0; y < height; y++){
    const t = y / height;
    const c = lerpColor(g.color(PAL.spaceDark), g.color(PAL.spaceMid2), t);
    g.stroke(c);
    g.line(0, y, width, y);
  }
  g.noStroke();

  drawNebulaCloud(g, width*0.1, height*0.12, 280, PAL.nebula, 0.25);
  drawNebulaCloud(g, width*0.92, height*0.85, 320, PAL.nebula, 0.2);
  drawNebulaCloud(g, width*0.85, height*0.1, 200, PAL.planet, 0.15);

  randomSeed(11);
  for (let i = 0; i < 120; i++){
    const x = random(width), y = random(height);
    const r = random(0.6, 1.8);
    g.fill(255, 255, 255, random(60, 160));
    g.ellipse(x, y, r);
  }

  bgBuffer = g;
}

function drawNebulaCloud(g, cx, cy, size, col, alpha){
  g.push();
  g.translate(cx, cy);
  const c = g.color(col);
  for (let r = size; r > 0; r -= 18){
    g.fill(red(c), green(c), blue(c), alpha*255*0.18);
    g.ellipse(0, 0, r, r*0.85);
  }
  g.pop();
}

/* ============================================================
   DECORATIONS (twinkling stars, drifting planets, a comet)
   ============================================================ */
function initDecorations(){
  twinkles = [];
  const count = floor(constrain(width/55, 18, 40));
  for (let i = 0; i < count; i++){
    twinkles.push({
      x: random(width),
      y: random(height*0.08, height*0.92),
      phase: random(TWO_PI),
      speed: random(0.02, 0.05),
      r: random(1.5, 3.2)
    });
  }

  planetsDeco = [
    { x: width*0.07, y: height*0.82, r: random(46, 64), col: PAL.planet, ring:true,  phase: random(TWO_PI) },
    { x: width*0.95, y: height*0.18, r: random(30, 44), col: PAL.rocket, ring:false, phase: random(TWO_PI) }
  ];

  comet = {
    t: random(1),
    speed: 0.0016,
    y: random(height*0.1, height*0.4)
  };
}

function drawTwinkles(){
  push();
  noStroke();
  for (const s of twinkles){
    const glow = (sin(frameCount*s.speed + s.phase) + 1) / 2;
    const alpha = 80 + glow*175;
    fill(255, 255, 255, alpha);
    ellipse(s.x, s.y, s.r * (0.7 + glow*0.6));
  }
  pop();
}

function drawPlanets(){
  push();
  noStroke();
  for (const p of planetsDeco){
    const bob = sin(frameCount*0.01 + p.phase) * 4;
    push();
    translate(p.x, p.y + bob);
    if (p.ring){
      push();
      rotate(-0.35);
      noFill();
      stroke(255, 255, 255, 120);
      strokeWeight(4);
      ellipse(0, 0, p.r*2.3, p.r*0.7);
      pop();
    }
    fill(p.col);
    ellipse(0, 0, p.r*2, p.r*2);
    fill(255, 255, 255, 40);
    ellipse(-p.r*0.3, -p.r*0.3, p.r*1.1, p.r*1.1);
    pop();
  }
  pop();
}

function drawComet(){
  comet.t += comet.speed;
  if (comet.t > 1.2) {
    comet.t = -0.2;
    comet.y = random(height*0.08, height*0.45);
  }
  const x = comet.t * (width + 200) - 100;
  const y = comet.y + sin(comet.t * PI) * 30;
  push();
  noStroke();
  for (let i = 0; i < 14; i++){
    const tt = i / 14;
    const px = x - tt * 60;
    const py = y - tt * 26;
    fill(255, 255, 255, 200 * (1 - tt));
    ellipse(px, py, 6 * (1 - tt) + 1.5);
  }
  fill(255, 250, 220);
  ellipse(x, y, 7);
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
  if (domError) return;
  image(bgBuffer, width/2, height/2, width, height);
  drawTwinkles();
  drawPlanets();
  drawComet();
  updateAndDrawSparkles();
}
