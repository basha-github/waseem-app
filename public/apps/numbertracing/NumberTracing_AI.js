// Magic Number Tracing App
// Interactive number tracing using hand gestures

let handpose;
let video;
let predictions = [];
let currentNumber = '0';
let numberPath = [];
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

// Number definitions with paths (simplified tracing points)
const numberPaths = {
    '0': [
        {x: 0.5, y: 0.1}, {x: 0.3, y: 0.2}, {x: 0.2, y: 0.4}, 
        {x: 0.2, y: 0.6}, {x: 0.3, y: 0.8}, {x: 0.5, y: 0.9},
        {x: 0.7, y: 0.8}, {x: 0.8, y: 0.6}, {x: 0.8, y: 0.4},
        {x: 0.7, y: 0.2}, {x: 0.5, y: 0.1}
    ],
    '1': [
        {x: 0.35, y: 0.25}, {x: 0.5, y: 0.1}, {x: 0.5, y: 0.9},
        {x: 0.32, y: 0.9}, {x: 0.68, y: 0.9}
    ],
    '2': [
        {x: 0.25, y: 0.28}, {x: 0.32, y: 0.14}, {x: 0.5, y: 0.1}, 
        {x: 0.68, y: 0.16}, {x: 0.74, y: 0.3}, {x: 0.6, y: 0.5},
        {x: 0.25, y: 0.78}, {x: 0.2, y: 0.9}, {x: 0.8, y: 0.9}
    ],
    '3': [
        {x: 0.25, y: 0.18}, {x: 0.45, y: 0.1}, {x: 0.65, y: 0.16}, 
        {x: 0.7, y: 0.3}, {x: 0.58, y: 0.45}, {x: 0.42, y: 0.5},
        {x: 0.58, y: 0.55}, {x: 0.72, y: 0.7}, {x: 0.65, y: 0.85},
        {x: 0.45, y: 0.9}, {x: 0.25, y: 0.82}
    ],
    '4': [
        {x: 0.6, y: 0.1}, {x: 0.2, y: 0.65}, {x: 0.8, y: 0.65},
        {x: 0.6, y: 0.65}, {x: 0.6, y: 0.9}
    ],
    '5': [
        {x: 0.7, y: 0.1}, {x: 0.3, y: 0.1}, {x: 0.25, y: 0.45}, 
        {x: 0.45, y: 0.4}, {x: 0.65, y: 0.5}, {x: 0.7, y: 0.7},
        {x: 0.6, y: 0.85}, {x: 0.4, y: 0.87}, {x: 0.25, y: 0.75}
    ],
    '6': [
        {x: 0.65, y: 0.15}, {x: 0.4, y: 0.15}, {x: 0.25, y: 0.35}, 
        {x: 0.2, y: 0.6}, {x: 0.25, y: 0.8}, {x: 0.45, y: 0.9},
        {x: 0.65, y: 0.85}, {x: 0.75, y: 0.68}, {x: 0.65, y: 0.52},
        {x: 0.45, y: 0.5}, {x: 0.3, y: 0.58}
    ],
    '7': [
        {x: 0.2, y: 0.1}, {x: 0.8, y: 0.1}, {x: 0.45, y: 0.9},
        {x: 0.3, y: 0.55}, {x: 0.6, y: 0.55}
    ],
    '8': [
        {x: 0.5, y: 0.1}, {x: 0.35, y: 0.15}, {x: 0.3, y: 0.28},
        {x: 0.4, y: 0.38}, {x: 0.5, y: 0.4}, {x: 0.6, y: 0.38},
        {x: 0.7, y: 0.28}, {x: 0.65, y: 0.15}, {x: 0.5, y: 0.1},
        {x: 0.35, y: 0.55}, {x: 0.22, y: 0.68}, {x: 0.25, y: 0.82},
        {x: 0.4, y: 0.9}, {x: 0.6, y: 0.9}, {x: 0.75, y: 0.82},
        {x: 0.78, y: 0.68}, {x: 0.65, y: 0.55}, {x: 0.5, y: 0.4}
    ],
    '9': [
        {x: 0.55, y: 0.5}, {x: 0.35, y: 0.48}, {x: 0.25, y: 0.32}, 
        {x: 0.35, y: 0.15}, {x: 0.55, y: 0.1}, {x: 0.7, y: 0.2},
        {x: 0.75, y: 0.4}, {x: 0.7, y: 0.6}, {x: 0.5, y: 0.85},
        {x: 0.35, y: 0.9}
    ]
};

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
    statusDiv.innerHTML = '🖐️ Loading Magic Number Tracing...';
    
    handPose.detectStart(video, gotHands);
    
    // Setup UI elements
    setupUI();
    
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
        nextNumber();
    });
    
    // Reset button
    const resetBtn = document.getElementById('resetBtn');
    resetBtn.addEventListener('click', () => {
        resetTracing();
    });
    
    // Create letter selector buttons
    const numberSelector = document.getElementById('numberSelector');
    const letters = '0123456789'.split('');
    
    letters.forEach(letter => {
        const btn = document.createElement('button');
        btn.textContent = letter;
        btn.className = 'number-btn';
        btn.onclick = () => {
            setNumber(letter);
        };
        numberSelector.appendChild(btn);
    });
    
    updateActiveNumberButton();
}

function updateLetterPath() {
    numberPath = numberPaths[currentNumber] || numberPaths['A'];
    // Scale points to screen coordinates
    numberPath = numberPath.map(point => ({
        x: point.x * width,
        y: point.y * height
    }));
}

function setNumber(letter) {
    currentNumber = letter;
    updateLetterPath();
    resetTracing();
    document.getElementById('numberDisplay').textContent = currentNumber;
    updateActiveNumberButton();
    showFeedbackMessage(`✨ Let's trace the number ${currentNumber}! ✨`, '#4ade80');
}

function nextNumber() {
    const letters = '0123456789'.split('');
    let currentIndex = letters.indexOf(currentNumber);
    let nextIndex = (currentIndex + 1) % letters.length;
    setNumber(letters[nextIndex]);
}

function resetTracing() {
    userPath = [];
    tracingProgress = 0;
    lastPoint = null;
    trailPoints = [];
    updateProgressBar();
    showFeedbackMessage('🔄 Tracing reset! Try again! 🔄', '#f97316');
    
    // Add reset particles
    for (let i = 0; i < 30; i++) {
        particles.push(new Particle(random(width), random(height), [100, 150, 255]));
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

function updateActiveNumberButton() {
    const buttons = document.querySelectorAll('.number-btn');
    buttons.forEach(btn => {
        if (btn.textContent === currentNumber) {
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
    
    // Draw the letter template
    drawLetterTemplate();
    
    // Draw user tracing path
    drawUserPath();
    
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

function drawLetterTemplate() {
    push();
    stroke(255, 200, 100, 150);
    strokeWeight(8);
    noFill();
    
    // Draw dashed path
    for (let i = 0; i < numberPath.length - 1; i++) {
        let p1 = numberPath[i];
        let p2 = numberPath[i + 1];
        
        // Draw dashed line
        let distance = dist(p1.x, p1.y, p2.x, p2.y);
        let steps = Math.floor(distance / 15);
        
        for (let s = 0; s <= steps; s++) {
            let t = s / steps;
            let x = lerp(p1.x, p2.x, t);
            let y = lerp(p1.y, p2.y, t);
            
            if (s % 2 === 0) {
                stroke(255, 200, 100, 150);
                point(x, y);
            }
        }
    }
    
    // Draw guiding dots
    fill(255, 200, 100, 100);
    noStroke();
    for (let point of numberPath) {
        circle(point.x, point.y, 10);
    }
    
    pop();
}

function drawUserPath() {
    if (userPath.length < 2) return;
    
    push();
    stroke(74, 222, 128);
    strokeWeight(12);
    noFill();
    
    beginShape();
    for (let point of userPath) {
        vertex(point.x, point.y);
    }
    endShape();
    
    // Draw glowing effect
    stroke(74, 222, 128, 100);
    strokeWeight(18);
    beginShape();
    for (let point of userPath) {
        vertex(point.x, point.y);
    }
    endShape();
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
    let thumbTip = landmarks[4];
    
    // Check if finger is extended
    let fingerExtended = indexTip.y < indexBase.y - 20;
    
    // Get finger position (scaled to canvas)
    let fingerX = map(indexTip.x, 0, video.width, width, 0);
    let fingerY = map(indexTip.y, 0, video.height, 0, height);
    
    // Draw finger cursor
    drawFingerCursor(fingerX, fingerY);
    
    if (fingerExtended) {
        // Tracing mode
        if (!isTracing) {
            isTracing = true;
            showFeedbackMessage('✨ Start tracing! Follow the dotted line! ✨', '#4ade80');
        }
        
        // Add trail point
        trailPoints.push({x: fingerX, y: fingerY});
        if (trailPoints.length > 20) {
            trailPoints.shift();
        }
        
        // Check if we're close to the letter path
        checkTracingProgress(fingerX, fingerY);
        
        // Add to user path
        if (lastPoint === null || dist(fingerX, fingerY, lastPoint.x, lastPoint.y) > 5) {
            userPath.push({x: fingerX, y: fingerY});
            
            // Add particle effect
            if (random() < 0.3) {
                particles.push(new Particle(fingerX, fingerY, [74, 222, 128]));
            }
        }
    } else {
        isTracing = false;
        lastPoint = null;
    }
    
    lastPoint = {x: fingerX, y: fingerY};
}

function checkTracingProgress(x, y) {
    // Check distance to each point on the letter path
    let minDistance = Infinity;
    let closestIndex = -1;
    
    for (let i = 0; i < numberPath.length; i++) {
        let point = numberPath[i];
        let d = dist(x, y, point.x, point.y);
        if (d < minDistance) {
            minDistance = d;
            closestIndex = i;
        }
    }
    
    // If within threshold, mark progress
    let threshold = 40;
    if (minDistance < threshold) {
        let expectedProgress = (closestIndex / numberPath.length) * 100;
        
        if (expectedProgress > tracingProgress) {
            tracingProgress = expectedProgress;
            updateProgressBar();
            
            // Add success particle
            for (let i = 0; i < 3; i++) {
                particles.push(new Particle(x, y, [255, 215, 0]));
            }
            
            // Check if completed
            if (tracingProgress >= 99) {
                completeLetter();
            }
        }
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
    
    showFeedbackMessage(`🎉 Amazing! You traced the number ${currentNumber}! +10 points! 🎉`, '#ffd700');
    
    // Auto advance to next letter after delay
    setTimeout(() => {
        if (celebrationActive) {
            nextNumber();
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
        text(`🎉 Number ${currentNumber} Completed! 🎉`, width/2, height/2);
        pop();
        
        if (celebrationTimer <= 0) {
            celebrationActive = false;
        }
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    updateLetterPath();
}

// Add some random sparkles continuously
setInterval(() => {
    if (stars.length < 50 && random() < 0.3) {
        stars.push(new Star(random(width), random(height)));
    }
}, 1000);
