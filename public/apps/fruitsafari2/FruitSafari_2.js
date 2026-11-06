/* ============================================================
   Fruity Market Match
   A two-panel picture & pronunciation game for little explorers.
   Left card  -> black & white photo (always visible)
   Right card -> tap the left photo to reveal the colour photo
                 and hear the word spelled out, letter by letter
   p5.js global mode
   ============================================================ */

/* ---------- palette ---------- */
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

/* ---------- assets (small total size -> fully preloaded) ---------- */
let bwImages = {};     // bw filename -> p5.Image
let photoImages = {};  // photo filename -> p5.Image

/* ---------- state ---------- */
let currentIndex = 0;
let revealed = false;
let revealStartFrame = -999;

/* ---------- layout ---------- */
let leftRect = {x:0,y:0,w:0,h:0};
let rightRect = {x:0,y:0,w:0,h:0};
let topInset = 110;
let bottomInset = 100;

/* ---------- background buffer ---------- */
let bgBuffer;

/* ---------- decorative animation state ---------- */
let confetti = [];
let vines = [];
let sparkles = [];

/* ---------- DOM refs ---------- */
let tileEls = [];

/* ---------- speech ---------- */
let speechQueue = [];
let speechIndex = 0;


function preload(){
  for (const item of ITEMS){
    bwImages[item.bw] = loadImage('assets/bw/' + item.bw);
    photoImages[item.photo] = loadImage('assets/photos/' + item.photo);
  }
}

function setup(){
  const cnv = createCanvas(windowWidth, windowHeight);
  cnv.style('display','block');
  imageMode(CENTER);
  rectMode(CORNER);
  textAlign(CENTER, CENTER);

  buildWordBanner(ITEMS[currentIndex].word);
  computeLayout();
  rebuildBackground();
  initDecorations();
  updateCounter();

  document.getElementById('prevBtn').addEventListener('click', () => goTo(currentIndex - 1));
  document.getElementById('nextBtn').addEventListener('click', () => goTo(currentIndex + 1));
  document.getElementById('replayBtn').addEventListener('click', () => {
    const c = rightRect;
    revealCurrent(c.x + c.w/2, c.y + c.h/2);
  });
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
   BACKGROUND  (sunny market / orchard scene baked into a buffer)
   ============================================================ */
function rebuildBackground(){
  const g = createGraphics(width, height);
  g.noStroke();

  // warm sky gradient
  for (let y = 0; y < height; y++){
    const t = y / height;
    const c = lerpColor(g.color(PAL.skyTop), g.color(PAL.skyBottom), t);
    g.stroke(c);
    g.line(0, y, width, y);
  }
  g.noStroke();

  // soft sun glow, top corner
  g.push();
  for (let r = 300; r > 0; r -= 16){
    g.fill(255, 245, 200, 5);
    g.ellipse(width*0.12, height*0.08, r, r);
  }
  g.pop();

  // soft colour blobs for depth (citrus / grape / leaf)
  drawBlob(g, width*0.95, height*0.06, 240, PAL.citrus, 0.28);
  drawBlob(g, width*0.02, height*0.78, 280, PAL.grape, 0.22);
  drawBlob(g, width*0.85, height*0.9, 260, PAL.leaf, 0.25);

  // striped market awning along the very top
  const stripeH = max(26, height*0.035);
  const stripeW = max(46, width*0.05);
  g.push();
  for (let x = -stripeW; x < width + stripeW; x += stripeW*2){
    g.fill(PAL.tomato);
    g.rect(x, 0, stripeW, stripeH);
    g.fill(PAL.cream);
    g.rect(x + stripeW, 0, stripeW, stripeH);
  }
  // scalloped bottom edge of awning
  g.fill(PAL.cream);
  for (let x = 0; x < width; x += stripeW){
    g.arc(x + stripeW/2, stripeH, stripeW, stripeH*0.8, 0, PI);
  }
  g.pop();

  // wooden crate ground strip
  const groundY = height - max(40, height*0.05);
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
   DECORATIONS  (hanging vines with fruit + floating confetti)
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

/* ============================================================
   SPARKLES (click celebration)
   ============================================================ */
function spawnSparkles(x, y){
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
    const alpha = map(p.life, 0, p.maxLife, 0, 255);
    const c = color(p.col);
    fill(red(c), green(c), blue(c), alpha);
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
  noStroke();
  fill(0, 0, 0, 45);
  rect(box.x + 5, box.y + 9, box.w, box.h, 26);

  fill(PAL.cream);
  stroke(borderCol);
  strokeWeight(6);
  rect(box.x, box.y, box.w, box.h, 26);
  pop();
}

function drawRibbon(box, label, bgCol){
  push();
  noStroke();
  const padX = 16;
  textSize(constrain(box.w*0.045, 13, 20));
  textFont("'Fredoka', sans-serif");
  const tw = textWidth(label) + padX*2;
  fill(bgCol);
  rect(box.x + 18, box.y - 16, tw, 34, 16);
  fill(PAL.cream);
  textAlign(CENTER, CENTER);
  text(label, box.x + 18 + tw/2, box.y + 1);
  pop();
}

function drawContainImage(img, box, padding, scaleMul){
  if (!img) return;
  scaleMul = scaleMul || 1;
  const availW = box.w - padding*2;
  const availH = box.h - padding*2;
  const s = min(availW/img.width, availH/img.height) * scaleMul;
  const w = img.width * s;
  const h = img.height * s;
  push();
  imageMode(CENTER);
  image(img, box.x + box.w/2, box.y + box.h/2, w, h);
  pop();
}

/* ---------- left panel: always the B&W photo ---------- */
function drawLeftPanel(){
  drawCard(leftRect, PAL.crate);
  drawRibbon(leftRect, '🔍 Spot it!', PAL.leaf);

  const item = ITEMS[currentIndex];
  const img = bwImages[item.bw];

  const pulse = revealed ? 1 : 1 + sin(frameCount*0.06)*0.025;
  drawContainImage(img, leftRect, max(28, leftRect.h*0.12), pulse);

  if (!revealed){
    push();
    fill(PAL.crateDark);
    textFont("'Fredoka', sans-serif");
    textSize(constrain(leftRect.w*0.05, 14, 22));
    const bob = sin(frameCount*0.09) * 4;
    text('👉 Tap me to bring me to life!', leftRect.x + leftRect.w/2, leftRect.y + leftRect.h - 26 + bob);
    pop();
  }
}

/* ---------- right panel: colour photo + word ---------- */
function drawRightPanel(){
  drawCard(rightRect, PAL.tomato);

  const item = ITEMS[currentIndex];

  if (!revealed){
    drawRibbon(rightRect, '🙈 Hidden!', PAL.crate);
    push();
    noFill();
    stroke(PAL.crateLite);
    strokeWeight(4);
    drawingContext.setLineDash([12, 10]);
    rect(rightRect.x + rightRect.w*0.12, rightRect.y + rightRect.h*0.14,
         rightRect.w*0.76, rightRect.h*0.6, 20);
    drawingContext.setLineDash([]);

    noStroke();
    fill(PAL.crate);
    textFont("'Fredoka', sans-serif");
    textSize(constrain(rightRect.h*0.16, 30, 60));
    text('?', rightRect.x + rightRect.w/2, rightRect.y + rightRect.h*0.42);

    textSize(constrain(rightRect.w*0.045, 13, 20));
    fill(PAL.crateDark);
    text('Tap the photo on the left!', rightRect.x + rightRect.w/2, rightRect.y + rightRect.h*0.8);
    pop();
    return;
  }

  drawRibbon(rightRect, '🍎 Yum, see it!', PAL.tomato);

  const img = photoImages[item.photo];
  const sinceReveal = frameCount - revealStartFrame;
  const t = constrain(sinceReveal / 14, 0, 1);
  const eased = 1 - pow(1 - t, 3);
  const pop_ = 1 + sin(eased * PI) * 0.12; // slight overshoot pop
  drawContainImage(img, rightRect, max(24, rightRect.h*0.1), eased * pop_ + (1-eased)*0.6);
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
