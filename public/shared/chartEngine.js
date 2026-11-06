/* ============================================================
   chartEngine.js — shared, reusable "explore chart" engine.

   Same interaction as the ABC Alphabet Chart: a grid of cards on
   the left, click one and it animates in big on the right with a
   glow, particle burst, word label, and spoken-aloud audio.

   Each app just needs an index.html (see any *chart app for the
   template) plus a data.js defining:

     const CHART_TITLE = "Animals Chart";
     const CHART_ICON  = "🐘";
     const CHART_THEME = "grass";          // see THEMES below
     const ITEMS = [
       { glyph: "A", emoji: "🐘", word: "Elephant" },   // emoji mode
       { swatch: "#E63946", word: "Red" },              // colour swatch mode
       { shape: "circle", color: "#4FA6E8", word: "Circle" }, // shape mode
     ];

   glyph is optional (a big letter/number shown above the picture,
   like the Alphabet Chart's letter). Omit it for charts that don't
   need one (animals, vehicles, birds, flowers).
   ============================================================ */

const BG_PLAYROOM = "url('/shared/backgrounds/playroom.jpg')";
const BG_FOREST = "url('/shared/backgrounds/forest.jpg')";

const THEMES = {
  sky:    { accent: "#1c7ed6", bg: BG_PLAYROOM },
  grass:  { accent: "#2e9e4f", bg: BG_FOREST },
  candy:  { accent: "#d6367d", bg: BG_PLAYROOM },
  sun:    { accent: "#e87d17", bg: BG_PLAYROOM },
  night:  { accent: "#7048e8", bg: BG_FOREST },
  ocean:  { accent: "#1c7ed6", bg: BG_FOREST },
  fire:   { accent: "#e8333a", bg: BG_PLAYROOM },
};

const PALETTE = ["#e8333a", "#e87d17", "#c9a800", "#2e9e4f", "#1c7ed6", "#7048e8", "#d6367d"];

function speak(word) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.rate = 0.82;
    u.pitch = 1.15;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

function countGraphemes(str) {
  return Array.from(str || "").length;
}

function cardVisualHtml(item) {
  if (item.swatch) {
    return `<span class="ch-swatch" style="background:${item.swatch}"></span>`;
  }
  if (item.shape) {
    return `<span class="ch-shape ch-shape-${item.shape}" style="--shape-color:${item.color || "#4FA6E8"}"></span>`;
  }
  const n = countGraphemes(item.emoji);
  if (n > 1) {
    const size = Math.max(15, 34 / Math.sqrt(n));
    return `<span class="ch-emoji-count" style="font-size:${size}px">${item.emoji || ""}</span>`;
  }
  return `<span class="ch-emoji">${item.emoji || ""}</span>`;
}

function bigVisualHtml(item) {
  if (item.swatch) {
    return `<span class="ch-swatch ch-swatch-big" style="background:${item.swatch}"></span>`;
  }
  if (item.shape) {
    return `<span class="ch-shape ch-shape-big ch-shape-${item.shape}" style="--shape-color:${item.color || "#4FA6E8"}"></span>`;
  }
  const n = countGraphemes(item.emoji);
  if (n > 1) {
    const size = Math.max(26, 60 / Math.sqrt(n));
    return `<span class="ch-emoji-count ch-emoji-count-big" style="font-size:${size}px">${item.emoji || ""}</span>`;
  }
  return `<span class="ch-emoji ch-emoji-big">${item.emoji || ""}</span>`;
}

class ChartApp {
  constructor(root, items, title, icon) {
    this.root = root;
    this.items = items;
    this.title = title;
    this.icon = icon;
    this.selectedIdx = -1;
    this.render();
  }

  render() {
    this.root.innerHTML = `
      <div class="ch-hud">
        <div class="ch-brand"><span class="ch-brand-icon">${this.icon}</span><span class="ch-brand-text">${this.title}</span></div>
      </div>
      <div class="ch-body">
        <div class="ch-panel-left">
          <div class="ch-grid" id="chGrid"></div>
        </div>
        <div class="ch-divider"></div>
        <div class="ch-panel-right" id="chDisplay">
          <div class="ch-placeholder">Click a card!</div>
        </div>
      </div>
    `;
    this.el = {
      grid: this.root.querySelector("#chGrid"),
      display: this.root.querySelector("#chDisplay"),
    };
    this.buildGrid();
  }

  buildGrid() {
    this.el.grid.innerHTML = "";
    this.items.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "ch-card";
      card.id = "chCard" + idx;
      card.style.color = PALETTE[idx % PALETTE.length];
      card.innerHTML = `
        ${cardVisualHtml(item)}
        ${item.glyph ? `<span class="ch-glyph">${item.glyph}</span>` : ""}
        <span class="ch-word">${item.word}</span>
      `;
      card.addEventListener("click", () => this.select(idx));
      this.el.grid.appendChild(card);
    });
  }

  select(idx) {
    this.selectedIdx = idx;
    const item = this.items[idx];
    const color = PALETTE[idx % PALETTE.length];

    this.root.querySelectorAll(".ch-card").forEach(c => c.classList.remove("ch-card-active"));
    this.root.querySelector("#chCard" + idx)?.classList.add("ch-card-active");

    this.el.display.innerHTML = `
      <div class="ch-burst" style="--c: ${color}">
        <div class="ch-rings" style="--c: ${color}"></div>
        ${bigVisualHtml(item)}
        ${item.glyph ? `<div class="ch-glyph-big" style="color:${color}">${item.glyph}</div>` : ""}
        <div class="ch-word-big" style="color:${color}">${item.word.toUpperCase()}</div>
        <div class="ch-replay-hint" style="color:${color}">🔊 click again to replay</div>
      </div>
    `;
    this.spawnParticles(color);
    speak(item.word);
  }

  spawnParticles(color) {
    const layer = document.createElement("div");
    layer.className = "ch-particle-layer";
    for (let i = 0; i < 20; i++) {
      const bit = document.createElement("span");
      bit.className = "ch-particle";
      const angle = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 90;
      bit.style.setProperty("--dx", Math.cos(angle) * dist + "px");
      bit.style.setProperty("--dy", Math.sin(angle) * dist + "px");
      bit.style.background = color;
      bit.style.animationDelay = Math.random() * 0.1 + "s";
      layer.appendChild(bit);
    }
    this.el.display.appendChild(layer);
    setTimeout(() => layer.remove(), 1200);
  }
}

function applyTheme() {
  const theme = THEMES[typeof CHART_THEME !== "undefined" ? CHART_THEME : "sky"] || THEMES.sky;
  document.documentElement.style.setProperty("--ch-accent", theme.accent);
  document.documentElement.style.setProperty("--ch-bg-image", theme.bg);
}

function boot() {
  applyTheme();
  const root = document.getElementById("chartApp");
  new ChartApp(root, ITEMS, CHART_TITLE, CHART_ICON);
  initWallFingerPointing();
}

async function initWallFingerPointing() {
  try {
    const mod = await import("/shared/wallFingerPointing.js");
    mod.initWallFingerPointing({ clickableSelector: ".ch-card" });
  } catch (e) {}
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
