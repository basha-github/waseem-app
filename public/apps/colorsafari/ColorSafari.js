/* ============================================================
   Cosmic Color Quest
   A two-panel color recognition game for little astronauts.
   Left card  -> ghost outline of a colour orb (always visible)
   Right card -> tap the left orb to reveal its true colour,
                 then spell the word and hear it said aloud
   p5.js global mode — fully procedural, no image assets.
   ============================================================ */

/* ---------- palette (UI chrome) ---------- */
const PAL = {
  spaceDark: '#0B1026',
  spaceMid:  '#1B2350',
  spaceMid2: '#2E1A47',
  nebula:    '#6C3FAE',
  star:      '#FFD23F',
  rocket:    '#FF6B5B',
  planet:    '#2EC4B6',
  cream:     '#F5F2FF',
  ink:       '#1A1430'
};

/* ---------- the actual colours being taught ---------- */
const COLOR_VALUES = {
  red:       '#FF3B30',
  orange:    '#FF9500',
  yellow:    '#FFD60A',
  green:     '#34C759',
  blue:      '#0A84FF',
  purple:    '#AF52DE',
  pink:      '#FF2D78',
  brown:     '#8B5E3C',
  black:     '#1C1C1E',
  white:     '#FFFFFF',
  gray:      '#8E8E93',
  turquoise: '#2EC4B6'
};

/* ---------- state ---------- */
let currentIndex = 0;
let revealed = false;
let revealStartFrame = -999;

/* ---------- layout ---------- */
let leftRect = {x:0,y:0,w:0,h:0};
let rightRect = {x:0,y:0,w:0,h:0};
let topInset = 110;
let bottomInset = 100;

/* ---------- background ---------- */
let bgBuffer;
let twinkles = [];
let planetsDeco = [];
let comet;
let sparkles = [];

/* ---------- DOM refs ---------- */
let tileEls = [];

/* ---------- speech ---------- */
let speechQueue = [];
let speechIndex = 0;

function setup(){
  const cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent(document.body);
  cnv.style('display','block');
  imageMode(CENTER);
  rectMode(CENTER);
  textAlign(CENTER, CENTER);

  buildWordBanner(ITEMS[currentIndex].word);
  computeLayout();
  rebuildBackground();
  initDecorations();
  updateCounter();

  safeOn('prevBtn', () => goTo(currentIndex - 1));
  safeOn('nextBtn', () => goTo(currentIndex + 1));
  safeOn('replayBtn', () => {
    const c = rightRect;
    revealCurrent(c.x + c.w/2, c.y + c.h/2);
  });
}

function safeOn(id, handler){
  const el = document.getElementById(id);
  if (el){
    el.addEventListener('click', handler);
  } else {
    console.warn('Cosmic Color Quest: no element with id="' + id + '" was found in the page.');
  }
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
  computeLayout();
  rebuildBackground();
}

/* ============================================================
   LAYOUT
   ============================================================ */
function computeLayout(){
  measureChrome();
  const gap = constrain(width * 0.025, 14, 36);
  const landscape = width >= height * 0.95;

  if (landscape){
    const panelW = (width - gap * 3) / 2;
    const panelH = height - topInset - bottomInset;
    leftRect  = {x: gap,               y: topInset, w: panelW, h: panelH};
    rightRect = {x: gap*2 + panelW,    y: topInset, w: panelW, h: panelH};
  } else {
    const panelW = width - gap * 2;
    const panelH = (height - topInset - bottomInset - gap) / 2;
    leftRect  = {x: gap, y: topInset,                 w: panelW, h: panelH};
    rightRect = {x: gap, y: topInset + panelH + gap,  w: panelW, h: panelH};
  }
}

function measureChrome(){
  const headerEl = document.querySelector('.header-area');
  const controlsEl = document.querySelector('.controls');
  const headerH = headerEl ? headerEl.getBoundingClientRect().height : 0;
  const controlsH = controlsEl ? controlsEl.getBoundingClientRect().height : 0;
  topInset = max(96, height * 0.14, headerH + 28);
  bottomInset = max(86, height * 0.13, controlsH + 24);
}

/* ============================================================
   BACKGROUND  (deep space scene baked into a buffer)
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
   DECORATIONS  (twinkling stars, drifting planets, a comet)
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

/* ============================================================
   SPARKLES (click celebration)
   ============================================================ */
function spawnSparkles(x, y){
  const colors = [PAL.star, PAL.rocket, PAL.planet, PAL.cream];
  for (let i = 0; i < 22; i++){
    const a = random(TWO_PI);
    const sp = random(1.5, 5);
    sparkles.push({
      x, y,
      vx: cos(a)*sp,
      vy: sin(a)*sp - 1.5,
      life: 36,
      maxLife: 36,
      size: random(4, 9),
      col: random(colors)
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
    const alpha = map(p.life, 0, p.maxLife, 0, 255);
    fill(red(color(p.col)), green(color(p.col)), blue(color(p.col)), alpha);
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
  drawTwinkles();
  drawPlanets();
  drawComet();

  drawLeftPanel();
  drawRightPanel();

  updateAndDrawSparkles();

  if (pointInRect(mouseX, mouseY, leftRect) || (!revealed && pointInRect(mouseX, mouseY, rightRect))){
    cursor(HAND);
  } else {
    cursor(ARROW);
  }
}

/* ---------- card chrome ---------- */
function drawCard(box, borderCol){
  push();
  rectMode(CORNER);
  noStroke();
  fill(0, 0, 0, 55);
  rect(box.x + 5, box.y + 9, box.w, box.h, 26);

  fill(PAL.cream);
  stroke(borderCol);
  strokeWeight(6);
  rect(box.x, box.y, box.w, box.h, 26);
  pop();
}

function drawRibbon(box, label, bgCol){
  push();
  rectMode(CORNER);
  noStroke();
  const padX = 16;
  textSize(constrain(box.w*0.045, 13, 20));
  textFont("'Baloo 2', sans-serif");
  const tw = textWidth(label) + padX*2;
  fill(bgCol);
  rect(box.x + 18, box.y - 16, tw, 34, 16);
  fill(PAL.cream);
  textAlign(CENTER, CENTER);
  text(label, box.x + 18 + tw/2, box.y + 1);
  pop();
}

/* ---------- left panel: ghost outline orb ---------- */
function drawLeftPanel(){
  drawCard(leftRect, PAL.nebula);
  drawRibbon(leftRect, '🔍 Spot it!', PAL.spaceMid2);

  const pulse = revealed ? 1 : 1 + sin(frameCount*0.06)*0.025;

  const cx = leftRect.x + leftRect.w/2;
  const cy = leftRect.y + leftRect.h/2 - (revealed ? 0 : leftRect.h*0.04);
  const size = min(leftRect.w, leftRect.h) * 0.5 * pulse;

  push();
  translate(cx, cy);
  noFill();
  stroke(PAL.nebula);
  strokeWeight(max(3, size*0.045));
  ellipse(0, 0, size, size);
  pop();

  if (!revealed){
    push();
    fill(PAL.spaceMid2);
    textFont("'Baloo 2', sans-serif");
    textSize(constrain(leftRect.w*0.05, 14, 22));
    const bob = sin(frameCount*0.09) * 4;
    text('👉 Tap me to launch into space!', leftRect.x + leftRect.w/2, leftRect.y + leftRect.h - 26 + bob);
    pop();
  }
}

/* ---------- right panel: revealed colour orb ---------- */
function drawRightPanel(){
  drawCard(rightRect, PAL.rocket);

  const item = ITEMS[currentIndex];

  if (!revealed){
    drawRibbon(rightRect, '🙈 Hidden!', PAL.nebula);
    push();
    rectMode(CORNER);
    noFill();
    stroke(PAL.cream);
    strokeWeight(4);
    drawingContext.setLineDash([12, 10]);
    rect(rightRect.x + rightRect.w*0.12, rightRect.y + rightRect.h*0.14,
         rightRect.w*0.76, rightRect.h*0.6, 20);
    drawingContext.setLineDash([]);

    noStroke();
    fill(PAL.nebula);
    textFont("'Baloo 2', sans-serif");
    textSize(constrain(rightRect.h*0.16, 30, 60));
    text('?', rightRect.x + rightRect.w/2, rightRect.y + rightRect.h*0.42);

    textSize(constrain(rightRect.w*0.045, 13, 20));
    fill(PAL.spaceMid2);
    text('Tap the orb on the left!', rightRect.x + rightRect.w/2, rightRect.y + rightRect.h*0.8);
    pop();
    return;
  }

  drawRibbon(rightRect, '🚀 Watch it!', PAL.rocket);

  const sinceReveal = frameCount - revealStartFrame;
  const introT = constrain(sinceReveal / 16, 0, 1);
  const introEase = 1 - pow(1 - introT, 3);
  const pop_ = 1 + sin(introEase * PI) * 0.12;

  const cx = rightRect.x + rightRect.w/2;
  const cy = rightRect.y + rightRect.h/2;
  const size = min(rightRect.w, rightRect.h) * 0.52 * (introEase * pop_ + (1-introEase)*0.5);

  drawColorOrb(cx, cy, size, item.color);
}

/* ---------- the colour orb itself (filled circle + glossy highlight) ---------- */
function drawColorOrb(cx, cy, size, colorKey){
  const hex = COLOR_VALUES[colorKey] || PAL.rocket;
  push();
  translate(cx, cy);

  noStroke();
  // very light colours need a visible border so they don't vanish on the cream card
  const c = color(hex);
  const brightness = (red(c) + green(c) + blue(c)) / 3;
  if (brightness > 235){
    stroke(PAL.spaceMid2);
    strokeWeight(max(3, size*0.035));
  }
  fill(hex);
  ellipse(0, 0, size, size);

  // glossy highlight
  noStroke();
  fill(255, 255, 255, 70);
  ellipse(-size*0.18, -size*0.2, size*0.5, size*0.36);
  fill(255, 255, 255, 30);
  ellipse(size*0.05, size*0.1, size*0.7, size*0.55);

  pop();
}

/* ============================================================
   INTERACTION
   ============================================================ */
function pointInRect(px, py, r){
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function mousePressed(){
  if (pointInRect(mouseX, mouseY, leftRect)){
    revealCurrent(mouseX, mouseY);
  } else if (!revealed && pointInRect(mouseX, mouseY, rightRect)){
    revealCurrent(mouseX, mouseY);
  }
}

function keyPressed(){
  if (keyCode === LEFT_ARROW) goTo(currentIndex - 1);
  else if (keyCode === RIGHT_ARROW) goTo(currentIndex + 1);
  else if (key === ' '){
    const c = leftRect;
    revealCurrent(c.x + c.w/2, c.y + c.h/2);
  }
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function goTo(index){
  currentIndex = ((index % ITEMS.length) + ITEMS.length) % ITEMS.length;
  revealed = false;

  if (window.speechSynthesis) window.speechSynthesis.cancel();
  clearTileHighlights();
  buildWordBanner(ITEMS[currentIndex].word);
  computeLayout();
  updateCounter();
}

function updateCounter(){
  const el = document.getElementById('counter');
  if (el) el.textContent = (currentIndex + 1) + ' / ' + ITEMS.length;
}

function revealCurrent(x, y){
  revealed = true;
  revealStartFrame = frameCount;
  spawnSparkles(x, y);
  speakCurrentWord();
}

/* ============================================================
   WORD BANNER (DOM letter tiles)
   ============================================================ */
function buildWordBanner(word){
  const container = document.getElementById('wordBanner');
  if (!container) return;
  container.innerHTML = '';
  tileEls = [];

  word.split(' ').forEach(part => {
    const partDiv = document.createElement('div');
    partDiv.className = 'word-part';
    part.split('').forEach(ch => {
      const tile = document.createElement('div');
      tile.className = 'letter-tile';
      tile.textContent = ch.toUpperCase();
      partDiv.appendChild(tile);
      tileEls.push(tile);
    });
    container.appendChild(partDiv);
  });
}

function clearTileHighlights(){
  tileEls.forEach(t => t.classList.remove('active', 'active-word'));
}

/* ============================================================
   SPEECH  (spell the letters, then say the word)
   ============================================================ */
function speakCurrentWord(){
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  clearTileHighlights();

  const word = ITEMS[currentIndex].word;
  const queue = [];
  let tileIndex = 0;
  for (const ch of word){
    if (ch === ' ') continue;
    queue.push({type: 'letter', text: ch, tileIndex});
    tileIndex++;
  }
  queue.push({type: 'word', text: word});

  speechQueue = queue;
  speechIndex = 0;
  playNextInQueue();
}

function playNextInQueue(){
  if (speechIndex >= speechQueue.length){
    clearTileHighlights();
    return;
  }
  const item = speechQueue[speechIndex];
  const utter = new SpeechSynthesisUtterance(item.text);

  if (item.type === 'letter'){
    utter.rate = 0.7;
    utter.pitch = 1.25;
  } else {
    utter.rate = 0.85;
    utter.pitch = 1.05;
  }

  utter.onstart = () => {
    clearTileHighlights();
    if (item.type === 'letter' && tileEls[item.tileIndex]){
      tileEls[item.tileIndex].classList.add('active');
    } else if (item.type === 'word'){
      tileEls.forEach(t => t.classList.add('active-word'));
    }
  };
  utter.onend = () => { speechIndex++; playNextInQueue(); };
  utter.onerror = () => { speechIndex++; playNextInQueue(); };

  window.speechSynthesis.speak(utter);
}
