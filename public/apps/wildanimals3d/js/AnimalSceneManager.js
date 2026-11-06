// AnimalSceneManager.js
// Owns the shared three.js scene/camera/renderer (transparent overlay on
// top of the p5 canvas) and the currently-shown AnimalModel. Switching to
// the next animal disposes the old model and loads the new one into the
// same scene, so there's only ever one set of GPU resources live at a time.

const ANIMAL_ORDER = ["elephant", "bear", "lion", "fox", "rhino", "zebra"];

class AnimalSceneManager {
  constructor() {
    this.index = 0;
    this.current = null;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.domElement.id = "three-canvas";
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 5.5, 29);
    this.camera.lookAt(0, 3.2, 0);

    this.scene.add(new THREE.HemisphereLight(0xfff2d9, 0x8a7a4a, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(5, 8, 4);
    this.scene.add(sun);

    this._loadSpecies(ANIMAL_ORDER[this.index]);
  }

  _loadSpecies(key) {
    if (this.current) this.current.dispose();
    const config = ANIMAL_CONFIGS[key];
    this.current = new AnimalModel(this.scene, config);
    this.speciesKey = key;
    if (this.onSpeciesChange) this.onSpeciesChange(key, config.label);
  }

  next() {
    this.index = (this.index + 1) % ANIMAL_ORDER.length;
    this._loadSpecies(ANIMAL_ORDER[this.index]);
  }

  previous() {
    this.index = (this.index - 1 + ANIMAL_ORDER.length) % ANIMAL_ORDER.length;
    this._loadSpecies(ANIMAL_ORDER[this.index]);
  }

  setDirection(dir) {
    if (this.current) this.current.setDirection(dir);
  }

  spin360() {
    return this.current ? this.current.spin360() : false;
  }

  update() {
    if (this.current) this.current.update();
  }

  display() {
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
