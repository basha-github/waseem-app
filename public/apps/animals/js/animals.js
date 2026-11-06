// ═══════════════════════════════════════════════════════════════
//  animals.js — animal data table + the center-node picture overlay.
//  Browser port of the `animals` array and createAnimalImages() /
//  updateAnimalImagePosition() in AnimalLangauges.js.
//
//  Like the original, this uses a real DOM <img> element (not a
//  canvas drawImage) for the animal GIF — browsers animate and scale
//  GIFs correctly on their own, which sidesteps decoding quirks some
//  GIFs hit inside canvas-based renderers.
// ═══════════════════════════════════════════════════════════════

export const ANIMALS = [
  { file: "Elephant.gif", name: "ELEPHANT", audioKey: "elephant", data: [
    { lang: "ENGLISH", text: "elephant", code: "en-US" },
    { lang: "HINDI", text: "हाथी", code: "hi-IN" },
    { lang: "TELUGU", text: "ఏనుగు", code: "te-IN" } ] },
  { file: "Tiger.gif", name: "TIGER", audioKey: "tiger", data: [
    { lang: "ENGLISH", text: "tiger", code: "en-US" },
    { lang: "HINDI", text: "बाघ", code: "hi-IN" },
    { lang: "TELUGU", text: "పులి", code: "te-IN" } ] },
  { file: "Lion.gif", name: "LION", audioKey: "lion", data: [
    { lang: "ENGLISH", text: "lion", code: "en-US" },
    { lang: "HINDI", text: "शेर", code: "hi-IN" },
    { lang: "TELUGU", text: "సింహం", code: "te-IN" } ] },
  { file: "BlackTiger.gif", name: "BLACK TIGER", audioKey: "black_tiger", data: [
    { lang: "ENGLISH", text: "black tiger", code: "en-US" },
    { lang: "HINDI", text: "काला बाघ", code: "hi-IN" },
    { lang: "TELUGU", text: "నల్ల పులి", code: "te-IN" } ] },
  { file: "Cat.gif", name: "CAT", audioKey: "cat", data: [
    { lang: "ENGLISH", text: "cat", code: "en-US" },
    { lang: "HINDI", text: "बिल्ली", code: "hi-IN" },
    { lang: "TELUGU", text: "పిల్లి", code: "te-IN" } ] },
  { file: "Dog.gif", name: "DOG", audioKey: "dog", data: [
    { lang: "ENGLISH", text: "dog", code: "en-US" },
    { lang: "HINDI", text: "कुत्ता", code: "hi-IN" },
    { lang: "TELUGU", text: "కుక్క", code: "te-IN" } ] },
  { file: "Horse.gif", name: "HORSE", audioKey: "horse", data: [
    { lang: "ENGLISH", text: "horse", code: "en-US" },
    { lang: "HINDI", text: "घोड़ा", code: "hi-IN" },
    { lang: "TELUGU", text: "గుర్రం", code: "te-IN" } ] },
  { file: "Goat.gif", name: "GOAT", audioKey: "goat", data: [
    { lang: "ENGLISH", text: "goat", code: "en-US" },
    { lang: "HINDI", text: "बकरी", code: "hi-IN" },
    { lang: "TELUGU", text: "మేక", code: "te-IN" } ] },
  { file: "Sheep.gif", name: "SHEEP", audioKey: "sheep", data: [
    { lang: "ENGLISH", text: "sheep", code: "en-US" },
    { lang: "HINDI", text: "भेड़", code: "hi-IN" },
    { lang: "TELUGU", text: "గొర్రె", code: "te-IN" } ] },
  { file: "Rabbit.gif", name: "RABBIT", audioKey: "rabbit", data: [
    { lang: "ENGLISH", text: "rabbit", code: "en-US" },
    { lang: "HINDI", text: "खरगोश", code: "hi-IN" },
    { lang: "TELUGU", text: "కుందేలు", code: "te-IN" } ] },
  { file: "Monkey.gif", name: "MONKEY", audioKey: "monkey", data: [
    { lang: "ENGLISH", text: "monkey", code: "en-US" },
    { lang: "HINDI", text: "बंदर", code: "hi-IN" },
    { lang: "TELUGU", text: "కోతి", code: "te-IN" } ] },
  { file: "Girafee.gif", name: "GIRAFFE", audioKey: "giraffe", data: [
    { lang: "ENGLISH", text: "giraffe", code: "en-US" },
    { lang: "HINDI", text: "जिराफ़", code: "hi-IN" },
    { lang: "TELUGU", text: "జిరాఫీ", code: "te-IN" } ] },
  { file: "Zeebra.gif", name: "ZEBRA", audioKey: "zebra", data: [
    { lang: "ENGLISH", text: "zebra", code: "en-US" },
    { lang: "HINDI", text: "ज़ेबरा", code: "hi-IN" },
    { lang: "TELUGU", text: "జీబ్రా", code: "te-IN" } ] },
  { file: "Hippo.gif", name: "HIPPO", audioKey: "hippo", data: [
    { lang: "ENGLISH", text: "hippo", code: "en-US" },
    { lang: "HINDI", text: "दरियाई घोड़ा", code: "hi-IN" },
    { lang: "TELUGU", text: "హిప్పో", code: "te-IN" } ] },
  { file: "Tortoise.gif", name: "TORTOISE", audioKey: "tortoise", data: [
    { lang: "ENGLISH", text: "tortoise", code: "en-US" },
    { lang: "HINDI", text: "कछुआ", code: "hi-IN" },
    { lang: "TELUGU", text: "తాబేలు", code: "te-IN" } ] },
  { file: "Fish.gif", name: "FISH", audioKey: "fish", data: [
    { lang: "ENGLISH", text: "fish", code: "en-US" },
    { lang: "HINDI", text: "मछली", code: "hi-IN" },
    { lang: "TELUGU", text: "చేప", code: "te-IN" } ] },
  { file: "Crow.gif", name: "CROW", audioKey: "crow", data: [
    { lang: "ENGLISH", text: "crow", code: "en-US" },
    { lang: "HINDI", text: "कौआ", code: "hi-IN" },
    { lang: "TELUGU", text: "కాకి", code: "te-IN" } ] },
  { file: "Parrot.gif", name: "PARROT", audioKey: "parrot", data: [
    { lang: "ENGLISH", text: "parrot", code: "en-US" },
    { lang: "HINDI", text: "तोता", code: "hi-IN" },
    { lang: "TELUGU", text: "చిలుక", code: "te-IN" } ] },
  { file: "WhiteParrot.gif", name: "WHITE PARROT", audioKey: "white_parrot", data: [
    { lang: "ENGLISH", text: "white parrot", code: "en-US" },
    { lang: "HINDI", text: "सफ़ेद तोता", code: "hi-IN" },
    { lang: "TELUGU", text: "తెలుపు చిలుక", code: "te-IN" } ] },
  { file: "Ostrich.gif", name: "OSTRICH", audioKey: "ostrich", data: [
    { lang: "ENGLISH", text: "ostrich", code: "en-US" },
    { lang: "HINDI", text: "शुतुरमुर्ग", code: "hi-IN" },
    { lang: "TELUGU", text: "ఉష్ట్రపక్షి", code: "te-IN" } ] },
  { file: "Dinosaur.gif", name: "DINOSAUR", audioKey: "dinosaur", data: [
    { lang: "ENGLISH", text: "dinosaur", code: "en-US" },
    { lang: "HINDI", text: "डायनासोर", code: "hi-IN" },
    { lang: "TELUGU", text: "డైనోసార్", code: "te-IN" } ] },
];

/**
 * Creates one absolutely-positioned <img> per animal inside `container`
 * (which must be position:relative and the same size/position as the
 * canvas). Returns the list of created elements, also stashed onto each
 * animal object as `imgEl`.
 */
export function createAnimalImages(container) {
  for (const a of ANIMALS) {
    const el = document.createElement("img");
    el.src = "AnimalsGif/" + a.file;
    el.alt = a.name;
    el.style.position = "absolute";
    el.style.display = "none";
    el.style.borderRadius = "50%";
    el.style.objectFit = "contain";
    el.style.backgroundColor = "#280050";
    el.style.zIndex = "5";
    el.style.pointerEvents = "none"; // clicks/taps pass straight through to the canvas
    container.appendChild(el);
    a.imgEl = el;
  }
}

/**
 * Shows only the current animal's image, sized/positioned to sit exactly
 * inside the center circle. centerX/centerY/centerRadius are in the same
 * canvas-local coordinate space the container is positioned in.
 */
export function updateAnimalImagePosition(currentIdx, centerX, centerY, centerRadius) {
  const size = (centerRadius - 6) * 2;
  for (let i = 0; i < ANIMALS.length; i++) {
    const el = ANIMALS[i].imgEl;
    if (!el) continue;
    if (i === currentIdx) {
      el.style.display = "block";
      el.style.width = size + "px";
      el.style.height = size + "px";
      el.style.left = (centerX - size / 2) + "px";
      el.style.top = (centerY - size / 2) + "px";
    } else {
      el.style.display = "none";
    }
  }
}

export function hideAllAnimalImages() {
  for (const a of ANIMALS) if (a.imgEl) a.imgEl.style.display = "none";
}
