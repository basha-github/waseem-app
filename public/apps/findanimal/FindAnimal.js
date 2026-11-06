// ════════════════════════════════════════════════════════════════
//  Animal Spotter · game.js
//  A grid of animal GIFs; pick the one matching the random question
// ════════════════════════════════════════════════════════════════

const N_CHOICES = 6; // animals shown per round

const ANIMALS = [
  { name: 'Black Tiger', file: 'images/BlackTiger.gif' },
  { name: 'Cat',         file: 'images/Cat.gif' },
  { name: 'Crow',        file: 'images/Crow.gif' },
  { name: 'Dinosaur',    file: 'images/Dinosaur.gif' },
  { name: 'Dog',         file: 'images/Dog.gif' },
  { name: 'Elephant',    file: 'images/Elephant.gif' },
  { name: 'Fish',        file: 'images/Fish.gif' },
  { name: 'Giraffe',     file: 'images/Girafee.gif' },
  { name: 'Goat',        file: 'images/Goat.gif' },
  { name: 'Hippo',       file: 'images/Hippo.gif' },
  { name: 'Horse',       file: 'images/Horse.gif' },
  { name: 'Lion',        file: 'images/Lion.gif' },
  { name: 'Monkey',      file: 'images/Monkey.gif' },
  { name: 'Ostrich',     file: 'images/Ostrich.gif' },
  { name: 'Parrot',      file: 'images/Parrot.gif' },
  { name: 'Rabbit',      file: 'images/Rabbit.gif' },
  { name: 'Sheep',       file: 'images/Sheep.gif' },
  { name: 'Tiger',       file: 'images/Tiger.gif' },
  { name: 'Tortoise',    file: 'images/Tortoise.gif' },
  { name: 'White Parrot',file: 'images/WhiteParrot.gif' },
  { name: 'Zebra',       file: 'images/Zeebra.gif' },
];

// Random question phrasings for variety
const QUESTION_TEMPLATES = [
  n => `Where is the <span class="target">${n}</span>?`,
  n => `Find the <span class="target">${n}</span>!`,
  n => `Can you spot the <span class="target">${n}</span>?`,
  n => `Tap the <span class="target">${n}</span>!`,
  n => `Which one is the <span class="target">${n}</span>?`,
  n => `Point to the <span class="target">${n}</span>!`,
];

let targetAnimal = null, score = 0, answered = false, currentChoices = [], autoTimer = null;

// ── Audio ──────────────────────────────────────────────────────────
let audioCtx = null;
function getCtx(){
  if(!audioCtx) audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended') audioCtx.resume();
  return audioCtx;
}
function playCorrect(){
  const ctx=getCtx(),t=ctx.currentTime;
  [523,659,784,1047].forEach((f,i)=>{
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type='sine';o.frequency.value=f;
    g.gain.setValueAtTime(0,t+i*.11);g.gain.linearRampToValueAtTime(.32,t+i*.11+.02);
    g.gain.exponentialRampToValueAtTime(.001,t+i*.11+.26);
    o.connect(g);g.connect(ctx.destination);o.start(t+i*.11);o.stop(t+i*.11+.28);
  });
}
function playApplause(){
  const ctx=getCtx(),t=ctx.currentTime;
  for(let b=0;b<3;b++){
    const off=b*.36,dur=.3;
    const buf=ctx.createBuffer(1,Math.floor(ctx.sampleRate*dur),ctx.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    const src=ctx.createBufferSource(),filt=ctx.createBiquadFilter(),gain=ctx.createGain();
    src.buffer=buf;filt.type='bandpass';filt.frequency.value=2200;filt.Q.value=.8;
    gain.gain.setValueAtTime(0,t+off);gain.gain.linearRampToValueAtTime(.5,t+off+.05);
    gain.gain.exponentialRampToValueAtTime(.001,t+off+dur);
    src.connect(filt);filt.connect(gain);gain.connect(ctx.destination);
    src.start(t+off);src.stop(t+off+dur+.05);
  }
  [523,659,784,1047,1319].forEach((f,i)=>{
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type='triangle';o.frequency.value=f;
    g.gain.setValueAtTime(.15,t+i*.09);g.gain.exponentialRampToValueAtTime(.001,t+i*.09+.28);
    o.connect(g);g.connect(ctx.destination);o.start(t+i*.09);o.stop(t+i*.09+.3);
  });
}
function playWrong(){
  const ctx=getCtx(),t=ctx.currentTime;
  [330,277].forEach((f,i)=>{
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type='square';o.frequency.value=f;
    g.gain.setValueAtTime(.25,t+i*.17);g.gain.exponentialRampToValueAtTime(.001,t+i*.17+.2);
    o.connect(g);g.connect(ctx.destination);o.start(t+i*.17);o.stop(t+i*.17+.22);
  });
}

// ── Confetti ───────────────────────────────────────────────────────
const cvs=document.getElementById('confetti-canvas');
const cctx=cvs.getContext('2d');
let pieces=[];
function resizeCvs(){cvs.width=innerWidth;cvs.height=innerHeight;}
resizeCvs();window.addEventListener('resize',resizeCvs);
function launchConfetti(){
  pieces=[];
  const cols=['#FF4757','#FFD700','#2ed573','#1e90ff','#fd79a8','#a29bfe','#FF6B35'];
  for(let i=0;i<130;i++) pieces.push({
    x:Math.random()*cvs.width,y:-10-Math.random()*60,
    w:8+Math.random()*10,h:5+Math.random()*6,
    col:cols[Math.floor(Math.random()*cols.length)],
    rot:Math.random()*Math.PI*2,rs:(Math.random()-.5)*.18,
    vx:(Math.random()-.5)*4,vy:2.5+Math.random()*3.5,alpha:1
  });
  animCvs();
}
function animCvs(){
  cctx.clearRect(0,0,cvs.width,cvs.height);
  pieces.forEach(p=>{
    p.x+=p.vx;p.y+=p.vy;p.rot+=p.rs;
    if(p.y>cvs.height+20)p.alpha-=.05;
    cctx.save();cctx.globalAlpha=Math.max(0,p.alpha);
    cctx.translate(p.x,p.y);cctx.rotate(p.rot);
    cctx.fillStyle=p.col;cctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);
    cctx.restore();
  });
  pieces=pieces.filter(p=>p.alpha>0);
  if(pieces.length>0)requestAnimationFrame(animCvs);
  else cctx.clearRect(0,0,cvs.width,cvs.height);
}

// ── Pick choices ─────────────────────────────────────────────────
function pickChoices(target, n) {
  const pool = ANIMALS.filter(a => a.name !== target.name);
  shuffle(pool);
  const choices = [target, ...pool.slice(0, n - 1)];
  return shuffle(choices);
}

function shuffle(arr) {
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

// ── Render question ───────────────────────────────────────────────
function renderQuestion(animal) {
  const tmpl = QUESTION_TEMPLATES[Math.floor(Math.random() * QUESTION_TEMPLATES.length)];
  document.getElementById('question-text').innerHTML = tmpl(animal.name);
}

// ── Build animal field — posters scattered like sticky notes, never overlapping ──
function buildField(choices) {
  const field = document.getElementById('animal-field');
  field.innerHTML = '';

  const n = choices.length;
  const fieldRect = field.getBoundingClientRect();
  const fieldW = fieldRect.width  || 800;
  const fieldH = fieldRect.height || 500;

  // Pick a column count that keeps each cell wide enough for the biggest poster
  const cols = Math.max(2, Math.min(4, Math.floor(fieldW / 210)));
  const rows = Math.ceil(n / cols);
  const cellW = fieldW / cols;
  const cellH = fieldH / rows;

  // Shuffle which grid cell each animal lands in, for variety between rounds
  const cellIndices = shuffle([...Array(cols * rows).keys()]).slice(0, n);

  choices.forEach((animal, i) => {
    const card = document.createElement('div');
    card.className = 'animal-card';
    card.dataset.name = animal.name;

    // Random tilt so each poster looks pinned at its own angle
    const sign = Math.random() < 0.5 ? -1 : 1;
    const rot  = sign * (5 + Math.random() * 9);        // ±5–14deg
    const size = 159 + Math.random() * 29;               // 159–188px (30% bigger)
    const cardH = size + 24;
    const tapeRot = -rot * 0.4 + (Math.random() - 0.5) * 6;

    // Center of this card's grid cell, in pixels
    const cellIdx = cellIndices[i];
    const row = Math.floor(cellIdx / cols);
    const col = cellIdx % cols;
    const cx  = cellW * (col + 0.5);
    const cy  = cellH * (row + 0.5);

    // Jitter, but never enough to spill into a neighboring cell
    const maxJX = Math.max(0, (cellW - size)  / 2 - 10) * 0.6;
    const maxJY = Math.max(0, (cellH - cardH) / 2 - 10) * 0.6;
    const px = cx + (Math.random() * 2 - 1) * maxJX;
    const py = cy + (Math.random() * 2 - 1) * maxJY;

    card.style.left   = px + 'px';
    card.style.top    = py + 'px';
    card.style.width  = size + 'px';
    card.style.height = cardH + 'px';
    card.style.setProperty('--rot', rot.toFixed(1) + 'deg');
    card.style.setProperty('--tape-rot', tapeRot.toFixed(1) + 'deg');
    card.style.zIndex = i + 1;

    card.innerHTML = `
      <div class="poster-inner" style="animation-delay:${i * 0.08}s">
        <div class="poster-tape"></div>
        <div class="animal-frame">
          <img src="${animal.file}" alt="${animal.name}" draggable="false">
        </div>
      </div>
    `;
    card.addEventListener('click', () => onAnimalClick(card, animal));
    field.appendChild(card);
  });
}

// ── Click handling ────────────────────────────────────────────────
function onAnimalClick(card, animal) {
  if (answered) return;
  if (card.dataset.clicked) return;
  card.dataset.clicked = '1';

  if (animal.name === targetAnimal.name) {
    answered = true;
    card.classList.add('correct-flash');
    playCorrect();
    setTimeout(() => {
      playApplause();
      launchConfetti();
      score++;
      document.getElementById('score-val').textContent = score;
      updateStars();
      showResult(true);
      clearTimeout(autoTimer);
      autoTimer = setTimeout(() => nextRound(), 2300);
    }, 300);
  } else {
    card.classList.add('wrong-shake');
    playWrong();
    showResult(false);
    setTimeout(() => {
      card.classList.remove('wrong-shake');
      delete card.dataset.clicked;
    }, 550);
  }
}

function showResult(correct) {
  const overlay = document.getElementById('result-overlay');
  const emoji   = document.getElementById('result-emoji');
  const msg     = document.getElementById('result-msg');
  if (correct) {
    emoji.textContent = ['🎉','🌟','🏆','🥳','✨','🎊'][Math.floor(Math.random()*6)];
    msg.textContent   = ['Amazing!','Brilliant!','You got it!','Superstar!','Correct! 🎉','Well done!'][Math.floor(Math.random()*6)];
    msg.className = '';
  } else {
    emoji.textContent = '🤔';
    msg.textContent   = `That's not the ${targetAnimal.name}. Try again!`;
    msg.className = 'wrong';
  }
  overlay.classList.add('show');
  setTimeout(() => overlay.classList.remove('show'), correct ? 2000 : 1400);
}

function updateStars() {
  document.getElementById('stars-row').textContent = '⭐'.repeat(Math.min(score,8));
}

// ── Next round ─────────────────────────────────────────────────────
function nextRound() {
  answered = false;
  clearTimeout(autoTimer);
  targetAnimal   = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  currentChoices = pickChoices(targetAnimal, N_CHOICES);
  renderQuestion(targetAnimal);
  buildField(currentChoices);
}

window.addEventListener('load', () => { nextRound(); });
window.addEventListener('resize', () => { if (!answered && currentChoices.length) buildField(currentChoices); });
