// sketch.js — p5.js GLOBAL MODE
// The p5 canvas stays fully transparent (the forest mural background
// image is set in index.html's CSS) except for a soft grounding shadow;
// the AnimalSceneManager (three.js) renders the current 3D animal on its
// own transparent canvas above it.

let animals;

function setup() {
  createCanvas(windowWidth, windowHeight);
  animals = new AnimalSceneManager();
  window.animals = animals; // exposed for controls.js
}

function draw() {
  clear();
  drawGroundShadow();
  animals.update();
  animals.display();
}

function drawGroundShadow() {
  noStroke();
  const groundY = height * 0.86;
  let cx = width / 2;
  const m = animals && animals.current;
  if (m && m.model) {
    cx = width / 2 + m.model.position.x * (width * 0.019);
  }
  fill(20, 15, 5, 70);
  ellipse(cx, groundY, width * 0.22, height * 0.05);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  animals.resize();
}
