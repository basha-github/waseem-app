// AnimalModel.js
// One reusable three.js-backed 3D animal, driven by a small config object
// so the same walking/turning/spinning logic works for every species —
// "do it the same as the elephant" for each new animal.
//
// Three loading patterns are supported, because the provided assets come
// in three different shapes:
//
//   "subclip"    — one GLB with a single long animation take that packs
//                  several actions back to back (frame-range known).
//                  Used for: elephant.
//   "continuous" — one GLB with a single long take of unknown internal
//                  structure — played back in full, on loop, always.
//                  Used for: fox, lion.
//   "meshWalk"   — a mesh-only GLB (no animation) plus a second,
//                  animation-only GLB holding just a walk cycle for the
//                  same skeleton. No idle clip is provided, so it simply
//                  stands still (holds the bind pose) until it walks.
//                  Used for: bear, rhino, zebra.
//
// Usage (same shape as the original Elephant class):
//   const animal = new AnimalModel(scene, camera, ANIMAL_CONFIGS.elephant);
//   animal.setDirection(-1 | 0 | 1);
//   animal.spin360();
//   animal.update(dt); animal.display();
//   animal.dispose();  // free GPU resources before switching species

const ANIMAL_CONFIGS = {
  elephant: {
    label: "Elephant",
    dir: "models/elephant/",
    walkFile: null,
    normalFile: "normal.jpg",
    kind: "subclip",
    idleRange: [190, 319, 30],
    walkRange: [325, 384, 30],
    targetSize: 13.8,
  },
  bear: {
    label: "Bear",
    dir: "models/bear/",
    walkFile: "walk.glb",
    kind: "meshWalk",
    targetSize: 14.7,
  },
  lion: {
    label: "Lion",
    dir: "models/lion/",
    walkFile: null,
    kind: "continuous",
    targetSize: 18.0,
  },
  fox: {
    label: "Fox",
    dir: "models/fox/",
    walkFile: null,
    kind: "continuous",
    targetSize: 22.2,
  },
  rhino: {
    label: "Rhino",
    dir: "models/rhino/",
    walkFile: "walk.glb",
    kind: "meshWalk",
    targetSize: 12.9,
  },
  zebra: {
    label: "Zebra",
    dir: "models/zebra/",
    walkFile: "walk.glb",
    kind: "meshWalk",
    targetSize: 11.7,
  },
};

class AnimalModel {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;

    this.walkSpeed = 1.35;
    this.turnLerpSpeed = 6;
    this.bounds = 3.6;
    this.direction = 0;
    // Faces the camera at rest (0), not a profile angle — this guarantees
    // that turning to walk left OR right always requires an actual ±90°
    // rotation. Starting at a profile angle risked exactly matching one
    // direction's target angle, silently skipping the turn-to-face step
    // and sliding sideways while still in the resting pose — which looked
    // exactly like the animal walking backward.
    this.facingAngle = 0;

    this.spinning = false;
    this.spinStartAngle = 0;
    this.spinElapsed = 0;
    this.spinDuration = 5;

    this.model = null;
    this.mixer = null;
    this.idleAction = null;
    this.walkAction = null;
    this.activeState = "idle";
    this.loaded = false;
    this.clock = new THREE.Clock();
    this._disposed = false;

    this._load();
  }

  _load() {
    const { dir, walkFile, normalFile, kind, targetSize } = this.config;
    const texLoader = new THREE.TextureLoader();

    const diffuse = texLoader.load(dir + "diffuse.jpg");
    diffuse.encoding = THREE.sRGBEncoding;
    diffuse.flipY = false;

    let normal = null;
    if (normalFile) {
      normal = texLoader.load(dir + normalFile);
      normal.flipY = false;
    }

    const applyMaterial = (root) => {
      root.traverse((o) => {
        if (o.isMesh || o.isSkinnedMesh) {
          o.material = new THREE.MeshStandardMaterial({
            map: diffuse,
            normalMap: normal || undefined,
            roughness: 0.88,
            metalness: 0.0,
          });
          o.frustumCulled = false;
        }
      });
    };

    const finishSetup = (root, clipForIdle, clipForWalk) => {
      if (this._disposed) return;
      applyMaterial(root);

      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      root.scale.setScalar(targetSize / Math.max(size.x, size.y, size.z, 0.0001));
      box.setFromObject(root);
      root.position.y = -box.min.y;
      root.position.x = 0;
      root.rotation.y = this.facingAngle;

      this.model = root;
      this.mixer = new THREE.AnimationMixer(root);

      if (clipForIdle) {
        this.idleAction = this.mixer.clipAction(clipForIdle);
        this.idleAction.setLoop(THREE.LoopRepeat).play();
      }
      if (clipForWalk) {
        this.walkAction = this.mixer.clipAction(clipForWalk);
        this.walkAction.setLoop(THREE.LoopRepeat).play();
        this.walkAction.setEffectiveWeight(clipForIdle ? 0 : 1);
      }
      this.activeState = clipForIdle ? "idle" : (clipForWalk ? "walk" : "idle");

      this.scene.add(root);
      this.loaded = true;
    };

    const gltfLoader = new THREE.GLTFLoader();

    if (kind === "subclip") {
      gltfLoader.load(dir + "model.glb", (gltf) => {
        const fullTake = gltf.animations[0];
        const [is, ie, ifps] = this.config.idleRange;
        const [ws, we, wfps] = this.config.walkRange;
        const idleClip = THREE.AnimationUtils.subclip(fullTake, "idle", is, ie, ifps);
        const walkClip = THREE.AnimationUtils.subclip(fullTake, "walk", ws, we, wfps);
        finishSetup(gltf.scene, idleClip, walkClip);
      });
    } else if (kind === "continuous") {
      gltfLoader.load(dir + "model.glb", (gltf) => {
        const clip = gltf.animations[0] || null;
        // Same clip drives both "idle" and "walk" — internal structure of
        // the take is unknown, so it just plays continuously on loop.
        finishSetup(gltf.scene, clip, null);
      });
    } else if (kind === "meshWalk") {
      gltfLoader.load(dir + "model.glb", (meshGltf) => {
        if (walkFile) {
          gltfLoader.load(dir + walkFile, (walkGltf) => {
            const clip = walkGltf.animations[0] || null;
            finishSetup(meshGltf.scene, null, clip);
          });
        } else {
          finishSetup(meshGltf.scene, null, null);
        }
      });
    }
  }

  setDirection(dir) {
    this.direction = dir < 0 ? -1 : dir > 0 ? 1 : 0;
  }

  spin360() {
    if (this.spinning || !this.model) return false;
    this.spinning = true;
    this.spinStartAngle = this.facingAngle;
    this.spinElapsed = 0;
    return true;
  }

  _setState(state) {
    if (this.activeState === state || !this.mixer) return;
    // Some species only have one of the two clips (e.g. no idle clip for
    // mesh+walk species) — guard every transition accordingly.
    if (state === "walk" && !this.walkAction) return;
    if (state === "idle" && !this.idleAction) {
      // no idle clip available — just stop the walk clip in place
      if (this.walkAction) this.walkAction.setEffectiveWeight(0);
      this.activeState = state;
      return;
    }
    this.activeState = state;
    const toWalk = state === "walk";
    if (this.idleAction && this.walkAction) {
      this.idleAction.crossFadeTo(this.walkAction, 0.35, false);
      this.walkAction.crossFadeTo(this.idleAction, 0.35, false);
    }
    if (toWalk && this.walkAction) {
      this.walkAction.reset().play();
      this.walkAction.setEffectiveWeight(1);
      if (this.idleAction) this.idleAction.setEffectiveWeight(0);
    } else if (!toWalk && this.idleAction) {
      this.idleAction.reset().play();
      this.idleAction.setEffectiveWeight(1);
      if (this.walkAction) this.walkAction.setEffectiveWeight(0);
    }
  }

  update() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.mixer) this.mixer.update(dt);
    if (!this.model) return;

    if (this.spinning) {
      this._setState("idle");
      this.spinElapsed += dt;
      const t = Math.min(1, this.spinElapsed / this.spinDuration);
      const eased = t * t * (3 - 2 * t);
      this.facingAngle = this.spinStartAngle + eased * Math.PI * 2;
      this.model.rotation.y = this.facingAngle;
      if (t >= 1) {
        this.spinning = false;
        this.facingAngle = this.spinStartAngle;
        this.model.rotation.y = this.facingAngle;
      }
      return;
    }

    if (this.config.kind === "continuous") {
      // Always animating regardless of direction — only the walk/turn
      // logic (facing + translation) responds to direction here.
      if (this.direction !== 0) {
        const targetAngle = this.direction < 0 ? -Math.PI / 2 : Math.PI / 2;
        this.facingAngle += (targetAngle - this.facingAngle) * Math.min(1, this.turnLerpSpeed * dt);
        this.model.rotation.y = this.facingAngle;
        const angleDiff = Math.abs(targetAngle - this.facingAngle);
        if (angleDiff < 0.35) {
          this.model.position.x += this.direction * this.walkSpeed * dt;
          this.model.position.x = Math.max(-this.bounds, Math.min(this.bounds, this.model.position.x));
        }
      }
      return;
    }

    if (this.direction !== 0) {
      this._setState("walk");
      const targetAngle = this.direction < 0 ? -Math.PI / 2 : Math.PI / 2;
      this.facingAngle += (targetAngle - this.facingAngle) * Math.min(1, this.turnLerpSpeed * dt);
      this.model.rotation.y = this.facingAngle;
      const angleDiff = Math.abs(targetAngle - this.facingAngle);
      if (angleDiff < 0.35) {
        this.model.position.x += this.direction * this.walkSpeed * dt;
        this.model.position.x = Math.max(-this.bounds, Math.min(this.bounds, this.model.position.x));
      }
    } else {
      this._setState("idle");
    }
  }

  display() {
    // rendering itself is done once per frame by the shared renderer/camera
    // in the sketch file — nothing per-model to do here.
  }

  dispose() {
    this._disposed = true;
    if (this.model) {
      this.scene.remove(this.model);
      this.model.traverse((o) => {
        if (o.isMesh || o.isSkinnedMesh) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (o.material.map) o.material.map.dispose();
            if (o.material.normalMap) o.material.normalMap.dispose();
            o.material.dispose();
          }
        }
      });
    }
    if (this.mixer) this.mixer.stopAllAction();
  }
}
