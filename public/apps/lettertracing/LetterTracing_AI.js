// Magic Alphabet Tracing App
// Interactive letter tracing using hand gestures

let handpose;
let video;
let predictions = [];
let currentLetter = 'A';
let letterPath = [];
let userPath = [];
let tracingProgress = 0;
let score = 0;
let isTracing = false;
let lastPoint = null;
let trailPoints = [];
let particles = [];
let stars = [];
let celebrationActive = false;
let celebrationTimer = 0;
let feedbackMessage = "";
let feedbackTimer = 0;
let showGuide = true;
let filledDots = new Set(); // indices into letterPath the fingertip has "painted"
let letterGfx; // off-screen buffer for the bold hollow letter (see renderLetterGraphics)

// How closely the fingertip must be to the guide path to count as
// "on the letter" — used both to gate painting (so the trail only marks
// the letter's outline, not wherever the finger wanders) and to advance
// tracing progress.
const TRACE_THRESHOLD = 40;
// Every letter — the bold hollow body AND its dashed center-trace guide —
// is uniformly scaled (same factor in x and y, so proportions aren't
// distorted) so its height is this fraction of the shorter canvas
// dimension. Both are built from the same stroke skeleton (see
// renderLetterGraphics), so they always line up exactly.
const LETTER_TARGET_HEIGHT_FRACTION = 0.6;
// Normalized spacing between guide dots along a stroke — small enough that
// dots sit close together all the way around each stroke (no big gaps),
// but not so small that the path gets cluttered.
const DOT_SPACING = 0.045;
const ARROW_STRIDE = 6; // draw one direction arrow every N guide dots

// ---------------------------------------------------------------------------
// Letter stroke geometry
//
// Every letter is described as a small ordered list of pen strokes (a
// straight/multi-point line, or an elliptical arc) in normalized 0..1
// coordinates, matching how you'd actually write the letter by hand — e.g.
// "A" is a left leg, a right leg, then a crossbar; never one continuous path
// that has to jump/retrace across the letter. Each stroke is walked and
// filled with evenly-spaced guide dots (see DOT_SPACING) so the dots trace
// tightly around the real shape instead of a few sparse points connected by
// straight "shortcut" lines. Every dot remembers which stroke it belongs to
// (strokeId) so the dashed guide, the numbered start badges, and the
// direction arrows are only ever drawn *within* a single stroke — never as
// a phantom line jumping from one part of the letter to another.
// ---------------------------------------------------------------------------

function lerpPt(p1, p2, t) {
    return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
}

// Dense points along a straight segment / multi-point polyline (no pen lift).
function linePts(pts) {
    let out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
        let p1 = pts[i], p2 = pts[i + 1];
        let d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        let steps = Math.max(2, Math.round(d / DOT_SPACING));
        for (let s = 1; s <= steps; s++) out.push(lerpPt(p1, p2, s / steps));
    }
    return out;
}

// Dense points along an elliptical arc; 0deg = right, 90deg = down (screen
// orientation), sweeping from startDeg to endDeg.
function arcPts(cx, cy, rx, ry, startDeg, endDeg) {
    let avgR = (rx + ry) / 2;
    let arcLen = avgR * (Math.abs(endDeg - startDeg) * Math.PI / 180);
    let steps = Math.max(4, Math.round(arcLen / DOT_SPACING));
    let out = [];
    for (let s = 0; s <= steps; s++) {
        let t = s / steps;
        let ang = (startDeg + (endDeg - startDeg) * t) * Math.PI / 180;
        out.push({ x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang) });
    }
    return out;
}

// A near-full ellipse with a small gap centered on gapCenterDeg (C/G/S).
function openArcPts(cx, cy, rx, ry, gapCenterDeg, gapWidthDeg) {
    return arcPts(cx, cy, rx, ry, gapCenterDeg + gapWidthDeg / 2, gapCenterDeg + 360 - gapWidthDeg / 2);
}

const pt = (x, y) => ({ x, y });

// Each entry: one letter -> array of stroke-generator functions, in the
// order a hand would draw them.
const letterShapeSpecs = {
    'A': [
        () => linePts([pt(0.5, 0.06), pt(0.20, 0.94)]),
        () => linePts([pt(0.5, 0.06), pt(0.80, 0.94)]),
        () => linePts([pt(0.32, 0.62), pt(0.68, 0.62)])
    ],
    'B': [
        () => linePts([pt(0.28, 0.08), pt(0.28, 0.92)]),
        () => arcPts(0.28, 0.29, 0.24, 0.21, -90, 90),
        () => arcPts(0.28, 0.71, 0.26, 0.21, -90, 90)
    ],
    'C': [() => openArcPts(0.5, 0.5, 0.28, 0.40, 0, 90)],
    'D': [
        () => linePts([pt(0.28, 0.08), pt(0.28, 0.92)]),
        () => arcPts(0.28, 0.5, 0.36, 0.42, -90, 90)
    ],
    'E': [
        () => linePts([pt(0.28, 0.08), pt(0.28, 0.92)]),
        () => linePts([pt(0.28, 0.08), pt(0.74, 0.08)]),
        () => linePts([pt(0.28, 0.5), pt(0.62, 0.5)]),
        () => linePts([pt(0.28, 0.92), pt(0.74, 0.92)])
    ],
    'F': [
        () => linePts([pt(0.28, 0.08), pt(0.28, 0.92)]),
        () => linePts([pt(0.28, 0.08), pt(0.74, 0.08)]),
        () => linePts([pt(0.28, 0.5), pt(0.62, 0.5)])
    ],
    'G': [
        () => openArcPts(0.5, 0.5, 0.28, 0.40, 10, 90),
        () => linePts([pt(0.78, 0.52), pt(0.52, 0.52), pt(0.52, 0.70)])
    ],
    'H': [
        () => linePts([pt(0.26, 0.08), pt(0.26, 0.92)]),
        () => linePts([pt(0.74, 0.08), pt(0.74, 0.92)]),
        () => linePts([pt(0.26, 0.5), pt(0.74, 0.5)])
    ],
    'I': [
        () => linePts([pt(0.5, 0.08), pt(0.5, 0.92)]),
        () => linePts([pt(0.35, 0.08), pt(0.65, 0.08)]),
        () => linePts([pt(0.35, 0.92), pt(0.65, 0.92)])
    ],
    'J': [
        () => linePts([pt(0.62, 0.08), pt(0.62, 0.66)]).concat(arcPts(0.46, 0.66, 0.16, 0.16, 0, 140).slice(1))
    ],
    'K': [
        () => linePts([pt(0.28, 0.08), pt(0.28, 0.92)]),
        () => linePts([pt(0.28, 0.52), pt(0.76, 0.08)]),
        () => linePts([pt(0.28, 0.52), pt(0.76, 0.92)])
    ],
    'L': [
        () => linePts([pt(0.28, 0.08), pt(0.28, 0.92)]),
        () => linePts([pt(0.28, 0.92), pt(0.74, 0.92)])
    ],
    'M': [() => linePts([pt(0.20, 0.92), pt(0.20, 0.08), pt(0.5, 0.55), pt(0.80, 0.08), pt(0.80, 0.92)])],
    'N': [() => linePts([pt(0.26, 0.92), pt(0.26, 0.08), pt(0.74, 0.92), pt(0.74, 0.08)])],
    'O': [() => arcPts(0.5, 0.5, 0.28, 0.42, -90, 270)],
    'P': [
        () => linePts([pt(0.28, 0.08), pt(0.28, 0.92)]),
        () => arcPts(0.28, 0.29, 0.26, 0.21, -90, 90)
    ],
    'Q': [
        () => arcPts(0.5, 0.48, 0.28, 0.40, -90, 270),
        () => linePts([pt(0.54, 0.66), pt(0.80, 0.94)])
    ],
    'R': [
        () => linePts([pt(0.28, 0.08), pt(0.28, 0.92)]),
        () => arcPts(0.28, 0.29, 0.26, 0.21, -90, 90),
        () => linePts([pt(0.30, 0.5), pt(0.76, 0.92)])
    ],
    'S': [
        () => openArcPts(0.5, 0.29, 0.20, 0.19, 45, 100),
        () => openArcPts(0.5, 0.71, 0.20, 0.19, 225, 100)
    ],
    'T': [
        () => linePts([pt(0.20, 0.08), pt(0.80, 0.08)]),
        () => linePts([pt(0.5, 0.08), pt(0.5, 0.92)])
    ],
    'U': [
        () => linePts([pt(0.26, 0.08), pt(0.26, 0.62)])
            .concat(arcPts(0.5, 0.62, 0.24, 0.28, 180, 360).slice(1))
            .concat(linePts([pt(0.74, 0.62), pt(0.74, 0.08)]).slice(1))
    ],
    'V': [() => linePts([pt(0.20, 0.08), pt(0.5, 0.92), pt(0.80, 0.08)])],
    'W': [() => linePts([pt(0.14, 0.92), pt(0.32, 0.08), pt(0.5, 0.62), pt(0.68, 0.08), pt(0.86, 0.92)])],
    'X': [
        () => linePts([pt(0.22, 0.08), pt(0.78, 0.92)]),
        () => linePts([pt(0.78, 0.08), pt(0.22, 0.92)])
    ],
    'Y': [
        () => linePts([pt(0.20, 0.08), pt(0.5, 0.48)]),
        () => linePts([pt(0.80, 0.08), pt(0.5, 0.48)]),
        () => linePts([pt(0.5, 0.48), pt(0.5, 0.92)])
    ],
    'Z': [() => linePts([pt(0.20, 0.08), pt(0.80, 0.08), pt(0.20, 0.92), pt(0.80, 0.92)])]
};

// Build letterPaths: { LETTER: [{x, y, strokeId}, ...] } in normalized coords,
// one entry per letter, dots tagged with which stroke (0-based) they belong to.
const letterPaths = {};
Object.keys(letterShapeSpecs).forEach(letter => {
    let dots = [];
    letterShapeSpecs[letter].forEach((strokeFn, strokeId) => {
        strokeFn().forEach(p => dots.push({ x: p.x, y: p.y, strokeId }));
    });
    letterPaths[letter] = dots;
});

// Particle class for magical effects
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = random(-2, 2);
        this.vy = random(-2, 2);
        this.life = 1;
        this.color = color;
        this.size = random(3, 8);
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.02;
        this.size *= 0.98;
    }
    
    display() {
        noStroke();
        fill(this.color[0], this.color[1], this.color[2], this.life * 255);
        circle(this.x, this.y, this.size);
    }
    
    isDead() {
        return this.life <= 0;
    }
}

class Star {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = random(10, 20);
        this.life = 1;
        this.rotation = random(TWO_PI);
    }
    
    update() {
        this.life -= 0.02;
        this.size *= 0.98;
        this.rotation += 0.1;
    }
    
    display() {
        push();
        translate(this.x, this.y);
        rotate(this.rotation);
        fill(255, 215, 0, this.life * 255);
        noStroke();
        beginShape();
        for (let i = 0; i < 5; i++) {
            let angle = (TWO_PI / 5) * i;
            let x1 = cos(angle) * this.size;
            let y1 = sin(angle) * this.size;
            vertex(x1, y1);
            let angle2 = angle + PI / 5;
            let x2 = cos(angle2) * this.size * 0.4;
            let y2 = sin(angle2) * this.size * 0.4;
            vertex(x2, y2);
        }
        endShape(CLOSE);
        pop();
    }
    
    isDead() {
        return this.life <= 0;
    }
}

function preload() {
  // Initialize HandPose model with flipped video input
  handPose = ml5.handPose({ flipped: true });
}

function gotHands(results) {
  predictions = results;
}



function setup() {
    let canvas = createCanvas(windowWidth, windowHeight);
    canvas.style('cursor', 'none');
    
    // Setup video
    video = createCapture(VIDEO);
    video.size(width, height);
    video.hide();
    
    // Initialize handpose
    const statusDiv = document.getElementById('status');
    statusDiv.innerHTML = '🖐️ Loading Magic Tracing...';
    
    handPose.detectStart(video, gotHands);
    
    // Setup UI elements
    setupUI();

    // Off-screen buffer the bold hollow letter is drawn into (see
    // renderLetterGraphics) — kept separate from the main canvas so
    // punching the hollow interior out of it can never erase the sky/video
    // already drawn behind it.
    letterGfx = createGraphics(windowWidth, windowHeight);
    
    // Initialize letter path
    updateLetterPath();
    
    // Create some initial stars
    for (let i = 0; i < 20; i++) {
        stars.push(new Star(random(width), random(height)));
    }
}

function modelReady() {
    const statusDiv = document.getElementById('status');
    statusDiv.innerHTML = '✅ Ready! Point your finger to trace! ☝️';
    setTimeout(() => {
        statusDiv.style.opacity = '0.7';
    }, 3000);
}

function setupUI() {
    // Next button
    const nextBtn = document.getElementById('nextBtn');
    nextBtn.addEventListener('click', () => {
        nextLetter();
    });
    
    // Reset button
    const resetBtn = document.getElementById('resetBtn');
    resetBtn.addEventListener('click', () => {
        resetTracing();
    });
    
    // Create letter selector buttons
    const letterSelector = document.getElementById('letterSelector');
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    
    letters.forEach(letter => {
        const btn = document.createElement('button');
        btn.textContent = letter;
        btn.className = 'letter-btn';
        btn.onclick = () => {
            setLetter(letter);
        };
        letterSelector.appendChild(btn);
    });
    
    updateActiveLetterButton();
}

function updateLetterPath() {
    let rawPath = letterPaths[currentLetter] || letterPaths['A'];

    // Uniform scale (same factor for x and y, so the letter's authored
    // proportions aren't stretched) sized so the path's own height
    // matches LETTER_TARGET_HEIGHT_FRACTION of the canvas — lining it up
    // with the bold outline letter, which is sized the same way.
    let xs = rawPath.map(p => p.x);
    let ys = rawPath.map(p => p.y);
    let minX = Math.min(...xs), maxX = Math.max(...xs);
    let minY = Math.min(...ys), maxY = Math.max(...ys);
    let midX = (minX + maxX) / 2;
    let midY = (minY + maxY) / 2;
    let spanY = Math.max(maxY - minY, 0.0001);

    let targetPxHeight = LETTER_TARGET_HEIGHT_FRACTION * Math.min(width, height);
    let pxPerUnit = targetPxHeight / spanY;

    // Scale points to screen coordinates, keeping each dot's strokeId so
    // the guide/markers/arrows/hit-test all still know which stroke it
    // belongs to.
    letterPath = rawPath.map(point => ({
        x: width / 2 + (point.x - midX) * pxPerUnit,
        y: height / 2 + (point.y - midY) * pxPerUnit,
        strokeId: point.strokeId
    }));

    // Which dots have been "painted" by the fingertip so far, keyed by
    // index into letterPath — reset whenever the letter/path changes.
    filledDots = new Set();
}

function setLetter(letter) {
    currentLetter = letter;
    updateLetterPath();
    resetTracing(false);
    updateActiveLetterButton();
}

function nextLetter() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    let currentIndex = letters.indexOf(currentLetter);
    let nextIndex = (currentIndex + 1) % letters.length;
    setLetter(letters[nextIndex]);
}

function resetTracing(announce = true) {
    userPath = [];
    filledDots = new Set();
    tracingProgress = 0;
    lastPoint = null;
    trailPoints = [];
    updateProgressBar();

    if (announce) {
        showFeedbackMessage('🔄 Tracing reset! Try again! 🔄', '#f97316');

        // Add reset particles
        for (let i = 0; i < 30; i++) {
            particles.push(new Particle(random(width), random(height), [100, 150, 255]));
        }
    }
}

function updateProgressBar() {
    const progressFill = document.getElementById('progressFill');
    progressFill.style.width = `${tracingProgress}%`;
    
    // Update score display
    const scoreElement = document.getElementById('score');
    scoreElement.textContent = `⭐ Score: ${score}`;
}

function showFeedbackMessage(message, color) {
    const feedback = document.getElementById('feedback');
    feedback.textContent = message;
    feedback.style.color = color;
    feedbackTimer = 60;
}

function updateActiveLetterButton() {
    const buttons = document.querySelectorAll('.letter-btn');
    buttons.forEach(btn => {
        if (btn.textContent === currentLetter) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function draw() {
    // Draw beautiful gradient background
    drawGradientBackground();
    
    // Draw video with low opacity
    drawVideoBackground();
    
    // Draw the letter template (includes the painted/filled dots)
    drawLetterTemplate();
    
    // Draw trail effect
    drawTrailEffect();
    
    // Draw particles
    updateParticles();
    
    // Draw stars
    updateStars();
    
    // Process hand gestures
    if (predictions.length > 0) {
        processHandTracking(predictions[0]);
    } else {
        drawWaitingCursor();
    }
    
    // Draw celebration effect
    if (celebrationActive) {
        drawCelebration();
    }
    
    // Update feedback timer
    if (feedbackTimer > 0) {
        feedbackTimer--;
        if (feedbackTimer === 0) {
            document.getElementById('feedback').style.opacity = '0.7';
        }
    }
}

function drawGradientBackground() {
    for (let i = 0; i <= height; i++) {
        let inter = map(i, 0, height, 0, 1);
        let c = lerpColor(color(135, 206, 235), color(147, 197, 253), inter);
        stroke(c);
        line(0, i, width, i);
    }
    
    // Draw clouds
    fill(255, 255, 255, 100);
    noStroke();
    for (let i = 0; i < 5; i++) {
        let x = (frameCount * 0.2 + i * 200) % (width + 200) - 100;
        let y = 50 + sin(frameCount * 0.01 + i) * 20;
        ellipse(x, y, 80, 60);
        ellipse(x + 30, y - 10, 70, 55);
        ellipse(x - 20, y - 5, 65, 50);
    }
}

function drawVideoBackground() {
    if (video) {
        push();
        tint(255, 20);
        image(video, 0, 0, width, height);
        pop();
    }
}

// Groups the flat letterPath array into per-stroke arrays (each an array of
// {x,y} in original order), so every guide element below can walk one
// stroke at a time and never draw anything connecting two different strokes.
function getStrokeGroups() {
    let groups = [];
    for (let p of letterPath) {
        if (!groups[p.strokeId]) groups[p.strokeId] = [];
        groups[p.strokeId].push(p);
    }
    return groups.filter(g => g && g.length > 0);
}

function drawLetterTemplate() {
    let strokes = getStrokeGroups();
    renderLetterGraphics(strokes);
    image(letterGfx, 0, 0);
    drawDashedCenterGuide(strokes);
    drawFilledDots();
    drawDirectionArrows(strokes);
    drawStrokeStartMarkers(strokes);
}

// The big bold hollow letter, built from the exact same stroke skeleton as
// the dashed guide — not a separately-authored font glyph. Because both are
// generated from one shared path, the dashed center-line is geometrically
// guaranteed to run right down the middle of the hollow band, never
// poking outside it.
//
// Technique: draw each stroke twice into an off-screen buffer — once as a
// thick solid band (the letter's outer silhouette), then again slightly
// thinner using "destination-out" compositing to punch the hollow interior
// out of it, leaving a rounded colored ring/band, like a stencil cutout.
function renderLetterGraphics(strokes) {
    let letterH = LETTER_TARGET_HEIGHT_FRACTION * Math.min(width, height);
    let outerWeight = letterH * 0.16;          // total thickness of the letter's body
    let ringThickness = outerWeight * 0.32;    // how thick the visible colored wall looks
    let innerWeight = Math.max(2, outerWeight - ringThickness * 2);

    letterGfx.clear();
    letterGfx.push();
    letterGfx.noFill();
    letterGfx.strokeCap(ROUND);
    letterGfx.strokeJoin(ROUND);

    letterGfx.stroke(34, 150, 90, 255);
    letterGfx.strokeWeight(outerWeight);
    strokes.forEach(s => drawSmoothStroke(letterGfx, s));

    letterGfx.drawingContext.globalCompositeOperation = 'destination-out';
    letterGfx.stroke(255, 255, 255, 255);
    letterGfx.strokeWeight(innerWeight);
    strokes.forEach(s => drawSmoothStroke(letterGfx, s));
    letterGfx.drawingContext.globalCompositeOperation = 'source-over';

    letterGfx.pop();
}

function drawSmoothStroke(g, s) {
    if (s.length < 2) return;
    g.beginShape();
    for (let p of s) g.vertex(p.x, p.y);
    g.endShape();
}

// The dashed line down the middle of each stroke that the child actually
// follows. Drawn one stroke at a time so it never jumps across the letter
// (e.g. from the bottom of "A"'s left leg back up to the apex).
function drawDashedCenterGuide(strokes) {
    push();
    stroke(20, 110, 65, 210);
    strokeWeight(7);
    strokeCap(ROUND);
    for (let s of strokes) {
        for (let i = 0; i < s.length - 1; i++) {
            if (i % 2 === 0) line(s[i].x, s[i].y, s[i + 1].x, s[i + 1].y);
        }
    }
    pop();
}

// Renders every dot the fingertip has actually touched as a solid green
// mark — this, and only this, is what shows the child's progress, so a
// mark only ever appears exactly on the letter dot it belongs to.
function drawFilledDots() {
    push();
    noStroke();
    fill(74, 222, 128, 235);
    filledDots.forEach(i => {
        let p = letterPath[i];
        if (p) circle(p.x, p.y, 15);
    });
    pop();
}

// A numbered circle at the start of EACH stroke (1, 2, 3…) — matching a
// printed tracing worksheet, where multi-stroke letters like "A" or "E"
// show a separate numbered start/arrow for every pen stroke.
function drawStrokeStartMarkers(strokes) {
    push();
    strokes.forEach((s, idx) => {
        if (s.length === 0) return;
        let p = s[0];
        noStroke();
        fill(20, 120, 65);
        circle(p.x, p.y, 32);
        fill(255);
        textFont('Baloo 2');
        textStyle(BOLD);
        textAlign(CENTER, CENTER);
        textSize(17);
        text(String(idx + 1), p.x, p.y + 1);
    });
    pop();
}

// Small triangular arrows placed along each stroke, rotated to point the
// way the child should trace next. Never crosses a stroke boundary.
function drawDirectionArrows(strokes) {
    push();
    noStroke();
    fill(20, 110, 65, 230);
    strokes.forEach(s => {
        for (let i = ARROW_STRIDE; i < s.length; i += ARROW_STRIDE) {
            let p = s[i];
            let prev = s[Math.max(0, i - 1)];
            let angle = atan2(p.y - prev.y, p.x - prev.x);
            push();
            translate(p.x, p.y);
            rotate(angle);
            triangle(-9, -8, -9, 8, 11, 0);
            pop();
        }
    });
    pop();
}

function drawTrailEffect() {
    for (let i = trailPoints.length - 1; i >= 0; i--) {
        let point = trailPoints[i];
        let alpha = map(i, 0, trailPoints.length, 0, 200);
        fill(255, 200, 100, alpha);
        noStroke();
        circle(point.x, point.y, 8);
    }
}

function processHandTracking(hand) {
    let landmarks = hand.keypoints;
    let indexTip = landmarks[8];
    let indexBase = landmarks[5];
    
    // Check if finger is extended
    let fingerExtended = indexTip.y < indexBase.y - 20;
    
    // Get finger position (scaled to canvas)
    let fingerX = map(indexTip.x, 0, video.width, width, 0);
    let fingerY = map(indexTip.y, 0, video.height, 0, height);
    
    // Draw finger cursor — always shown, so the child can see where their
    // finger is even while it's not over the letter yet.
    drawFingerCursor(fingerX, fingerY);
    
    if (!fingerExtended) {
        isTracing = false;
        lastPoint = null;
        return;
    }

    if (!isTracing) {
        isTracing = true;
        showFeedbackMessage('✨ Start tracing! Follow the dotted line! ✨', '#4ade80');
    }

    // Only paint/mark while the fingertip is actually over the letter's
    // guide path — not anywhere else on screen.
    const nearest = nearestPathPoint(fingerX, fingerY);
    const onPath = nearest.minDistance < TRACE_THRESHOLD;

    if (onPath) {
        // Add trail point (purely cosmetic — fades out, never itself a
        // "mark", so it never misrepresents progress).
        trailPoints.push({x: fingerX, y: fingerY});
        if (trailPoints.length > 20) {
            trailPoints.shift();
        }

        if (random() < 0.3) {
            particles.push(new Particle(fingerX, fingerY, [74, 222, 128]));
        }
        lastPoint = {x: fingerX, y: fingerY};

        registerTracingProgress(nearest, fingerX, fingerY);
    } else {
        // Off the letter entirely — don't paint, and break the current
        // stroke so we don't draw a straight line jump once the finger
        // lands back on the path somewhere else.
        lastPoint = null;
    }
}

// Finds the closest point on the (dense, evenly-spaced) guide path to
// (x, y). Shared by the paint gate and the progress check so they always
// agree on "how close is close enough".
function nearestPathPoint(x, y) {
    let minDistance = Infinity;
    let closestIndex = -1;

    for (let i = 0; i < letterPath.length; i++) {
        let d = dist(x, y, letterPath[i].x, letterPath[i].y);
        if (d < minDistance) {
            minDistance = d;
            closestIndex = i;
        }
    }

    return { minDistance, closestIndex };
}

function registerTracingProgress(nearest, x, y) {
    // nearest.minDistance is already known to be < TRACE_THRESHOLD (that's
    // why we're painting at all). Mark *only* that specific dot as filled —
    // this is what actually gets rendered (drawFilledDots), so the paint
    // only ever appears exactly where the fingertip is over the letter,
    // never anywhere else.
    if (filledDots.has(nearest.closestIndex)) return; // already painted

    filledDots.add(nearest.closestIndex);
    tracingProgress = (filledDots.size / letterPath.length) * 100;
    updateProgressBar();

    // Add success particle, anchored to the dot itself (not the raw
    // fingertip position) so the sparkle stays glued to the letter too.
    let dot = letterPath[nearest.closestIndex];
    for (let i = 0; i < 3; i++) {
        particles.push(new Particle(dot.x, dot.y, [255, 215, 0]));
    }

    if (tracingProgress >= 95) {
        completeLetter();
    }
}

function completeLetter() {
    if (celebrationActive) return;
    
    // Add points
    score += 10;
    updateProgressBar();
    
    // Show celebration
    celebrationActive = true;
    celebrationTimer = 60;
    
    // Add lots of particles
    for (let i = 0; i < 100; i++) {
        particles.push(new Particle(random(width), random(height), [255, 215, 0]));
    }
    
    // Add stars
    for (let i = 0; i < 20; i++) {
        stars.push(new Star(random(width), random(height)));
    }
    
    showFeedbackMessage(`🎉 Amazing! You traced ${currentLetter}! +10 points! 🎉`, '#ffd700');
    
    // Auto advance to next letter after delay
    setTimeout(() => {
        if (celebrationActive) {
            nextLetter();
            celebrationActive = false;
        }
    }, 2000);
}

function drawFingerCursor(x, y) {
    push();
    noFill();
    stroke(255, 200, 100);
    strokeWeight(3);
    circle(x, y, 30);
    
    stroke(255, 100, 100);
    strokeWeight(2);
    circle(x, y, 45);
    
    // Draw sparkle effect
    for (let i = 0; i < 4; i++) {
        let angle = frameCount * 0.1 + i * PI / 2;
        let offset = sin(frameCount * 0.2) * 5;
        let xOff = cos(angle) * (20 + offset);
        let yOff = sin(angle) * (20 + offset);
        stroke(255, 200, 100, 150);
        line(x, y, x + xOff, y + yOff);
    }
    pop();
}

function drawWaitingCursor() {
    push();
    let x = mouseX;
    let y = mouseY;
    noFill();
    stroke(255, 255, 200, 150);
    strokeWeight(2);
    circle(x, y, 40);
    
    let pulse = sin(frameCount * 0.1) * 10;
    stroke(255, 200, 100, 100);
    circle(x, y, 60 + pulse);
    
    // Draw hand icon
    textAlign(CENTER, CENTER);
    textSize(20);
    fill(255, 255, 200, 150);
    noStroke();
    text("🖐️", x, y);
    pop();
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].display();
        if (particles[i].isDead()) {
            particles.splice(i, 1);
        }
    }
}

function updateStars() {
    for (let i = stars.length - 1; i >= 0; i--) {
        stars[i].update();
        stars[i].display();
        if (stars[i].isDead()) {
            stars.splice(i, 1);
        }
    }
}

function drawCelebration() {
    if (celebrationTimer > 0) {
        celebrationTimer--;
        
        // Draw celebration text
        push();
        textAlign(CENTER, CENTER);
        textSize(40);
        fill(255, 215, 0);
        stroke(255, 100, 100);
        strokeWeight(3);
        text(`🎉 ${currentLetter} Completed! 🎉`, width/2, height/2);
        pop();
        
        if (celebrationTimer <= 0) {
            celebrationActive = false;
        }
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    letterGfx = createGraphics(windowWidth, windowHeight);
    updateLetterPath();
}

// Add some random sparkles continuously
setInterval(() => {
    if (stars.length < 50 && random() < 0.3) {
        stars.push(new Star(random(width), random(height)));
    }
}, 1000);
