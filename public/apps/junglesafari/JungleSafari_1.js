/* ============================================================
   Jungle Word Safari
   A two-panel picture & pronunciation game for little explorers.
   Left card  -> black & white photo (always visible)
   Right card -> tap the left photo to reveal the colour GIF
                 and hear the word spelled out, letter by letter
   p5.js global mode
   ============================================================ */

/* ---------- palette ---------- */
const PAL = {
  canopyDark:  '#0B3D2E',
  canopyMid:   '#15573C',
  canopyMid2:  '#1E6B49',
  leaf:        '#4CAF6D',
  leafBright:  '#8FD96B',
  sun:         '#FFD23F',
  bark:        '#6B4423',
  barkLight:   '#9C6B3E',
  coral:       '#FF6B5B',
  cream:       '#FFF8E7'
};

/* ---------- assets ---------- */
let bwImages = {};        // bw filename -> p5.Image (all preloaded, small)
let gifCache = {};        // gif filename -> p5.Image (lazy loaded)

/* ---------- state ---------- */
let currentIndex = 0;
let revealed = false;
let rightImg = null;
let rightLoading = false;
let rightError = false;

/* ---------- layout ---------- */
let leftRect = {x:0,y:0,w:0,h:0};
let rightRect = {x:0,y:0,w:0,h:0};
let topInset = 110;
let bottomInset = 100;

/* ---------- background buffer ---------- */
let bgBuffer;

/* ---------- decorative animation state ---------- */
let fireflies = [];
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
  ensureGifLoaded(currentIndex);

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
   BACKGROUND  (static-ish jungle scene baked into a buffer)
   ============================================================ */
function rebuildBackground(){
  bgBuffer = createGraphics(width, height);
  const g = bgBuffer;
  g.noStroke();

  // sky / canopy vertical gradient
  for (let y = 0; y < height; y++){
    const t = y / height;
    const c = lerpColor(g.color(PAL.canopyDark), g.color(PAL.canopyMid2), t);
    g.stroke(c);
    g.line(0, y, width, y);
  }
  g.noStroke();

  // soft sun glow, top corner
  g.push();
  for (let r = 320; r > 0; r -= 16){
    g.fill(255, 210, 90, 4);
    g.ellipse(width*0.86, height*0.06, r, r);
  }
  g.pop();

  // big soft leaf clusters in the corners (depth layer)
  drawLeafCluster(g, width*0.04, height*0.05, 230, PAL.canopyMid, 0.55);
  drawLeafCluster(g, width*0.98, height*0.02, 260, PAL.leaf, 0.35);
  drawLeafCluster(g, -20, height*0.85, 300, PAL.canopyMid, 0.5);
  drawLeafCluster(g, width*1.0, height*0.92, 280, PAL.leaf, 0.3);

  // ground strip with little grass tufts
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
  // simple deterministic pseudo-random in [0,1] for grass height variation
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
   DECORATIONS  (animated vines + fireflies)
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
    const glow = (sin(frameCount*0.05 + f.phase) + 1) / 2; // 0..1 twinkle
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
      // little leaf at alternating segments
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

/* ============================================================
   SPARKLES (click celebration)
   ============================================================ */
function spawnSparkles(x, y){
  const colors = [PAL.sun, PAL.coral, PAL.leafBright, PAL.cream];
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
  drawFireflies();
  drawVines();

  drawLeftPanel();
  drawRightPanel();

  updateAndDrawSparkles();

  // pointer cursor feedback
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
  fill(0, 0, 0, 50);
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
  textFont("'Baloo 2', sans-serif");
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
  drawCard(leftRect, PAL.bark);
  drawRibbon(leftRect, '🔍 Spot it!', PAL.canopyMid);

  const item = ITEMS[currentIndex];
  const img = bwImages[item.bw];

  const pulse = revealed ? 1 : 1 + sin(frameCount*0.06)*0.025;
  drawContainImage(img, leftRect, max(28, leftRect.h*0.12), pulse);

  if (!revealed){
    push();
    fill(PAL.canopyDark);
    textFont("'Baloo 2', sans-serif");
    textSize(constrain(leftRect.w*0.05, 14, 22));
    const bob = sin(frameCount*0.09) * 4;
    text('👉 Tap me to bring me to life!', leftRect.x + leftRect.w/2, leftRect.y + leftRect.h - 26 + bob);
    pop();
  }
}

/* ---------- right panel: colour GIF + word ---------- */
function drawRightPanel(){
  drawCard(rightRect, PAL.coral);

  const item = ITEMS[currentIndex];

  if (!revealed){
    drawRibbon(rightRect, '🙈 Hidden!', PAL.bark);
    push();
    textFont("'Baloo 2', sans-serif");
    fill(PAL.bark);
    noFill();
    stroke(PAL.barkLight);
    strokeWeight(4);
    drawingContext.setLineDash([12, 10]);
    rect(rightRect.x + rightRect.w*0.12, rightRect.y + rightRect.h*0.14,
         rightRect.w*0.76, rightRect.h*0.6, 20);
    drawingContext.setLineDash([]);

    noStroke();
    fill(PAL.bark);
    textSize(constrain(rightRect.h*0.16, 30, 60));
    text('?', rightRect.x + rightRect.w/2, rightRect.y + rightRect.h*0.42);

    textSize(constrain(rightRect.w*0.045, 13, 20));
    fill(PAL.canopyDark);
    text('Tap the photo on the left!', rightRect.x + rightRect.w/2, rightRect.y + rightRect.h*0.8);
    pop();
    return;
  }

  drawRibbon(rightRect, '🎬 Watch it!', PAL.coral);

  if (rightLoading){
    push();
    noFill();
    stroke(PAL.sun);
    strokeWeight(7);
    const cx = rightRect.x + rightRect.w/2;
    const cy = rightRect.y + rightRect.h/2;
    arc(cx, cy, 56, 56, frameCount*8, frameCount*8 + 260);
    noStroke();
    fill(PAL.canopyDark);
    textFont("'Baloo 2', sans-serif");
    textSize(constrain(rightRect.w*0.045, 13, 18));
    text('Fetching the animal...', cx, cy + 50);
    pop();
    return;
  }

  if (rightError || !rightImg){
    push();
    fill(PAL.bark);
    textFont("'Baloo 2', sans-serif");
    textSize(16);
    text('Oops! Could not load this one.', rightRect.x + rightRect.w/2, rightRect.y + rightRect.h/2);
    pop();
    return;
  }

  drawContainImage(rightImg, rightRect, max(24, rightRect.h*0.1));
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
  rightImg = null;
  rightLoading = false;
  rightError = false;

  if (window.speechSynthesis) window.speechSynthesis.cancel();
  clearTileHighlights();
  buildWordBanner(ITEMS[currentIndex].word);
  computeLayout();
  updateCounter();
  ensureGifLoaded(currentIndex);
}

function updateCounter(){
  const el = document.getElementById('counter');
  if (el) el.textContent = (currentIndex + 1) + ' / ' + ITEMS.length;
}

function revealCurrent(x, y){
  revealed = true;
  spawnSparkles(x, y);
  ensureGifLoaded(currentIndex, () => {
    const nextIdx = (currentIndex + 1) % ITEMS.length;
    ensureGifLoaded(nextIdx); // quiet prefetch of the next card
  });
  speakCurrentWord();
}

function ensureGifLoaded(index, cb){
  const item = ITEMS[index];
  if (gifCache[item.gif]){
    if (index === currentIndex){
      rightImg = gifCache[item.gif];
      rightLoading = false;
    }
    if (cb) cb();
    return;
  }
  if (index === currentIndex){
    rightLoading = true;
    rightError = false;
  }
  loadImage(
    'assets/gifs/' + item.gif,
    (img) => {
      gifCache[item.gif] = img;
      if (index === currentIndex){
        rightImg = img;
        rightLoading = false;
      }
      if (cb) cb();
    },
    () => {
      if (index === currentIndex){
        rightLoading = false;
        rightError = true;
      }
    }
  );
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
