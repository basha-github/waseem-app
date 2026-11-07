(() => {
  const APPS = window.WALL_APPS;
  const APPS_BY_ID = Object.fromEntries(APPS.map(a => [a.id, a]));
  const POLL_MS = 1500;
  const TOKEN_KEY = "wallAuthToken";
  const USERNAME_KEY = "wallAuthUsername";

  // ── auth helpers ──────────────────────────────────────────────────────
  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setSession(token, username) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USERNAME_KEY, username);
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
  }
  function authHeaders() {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  async function apiPost(path, payload) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload || {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Request failed");
    return data;
  }
  async function apiGet(path) {
    const r = await fetch(path, { headers: authHeaders(), cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function getState() { return apiGet("/api/state"); }
  async function setState(appId) { return apiPost("/api/state", { app: appId }); }

  // ── decide: wall (desktop / touch-wall PC) or remote (phone) ──────────
  function detectMode() {
    const forced = new URLSearchParams(location.search).get("mode");
    if (forced === "wall" || forced === "remote") return forced;
    const saved = localStorage.getItem("wallModeOverride");
    if (saved === "wall" || saved === "remote") return saved;
    const coarse = matchMedia("(pointer: coarse)").matches;
    const narrow = window.innerWidth <= 820;
    return coarse && narrow ? "remote" : "wall";
  }

  const mode = detectMode();

  function showView(id) {
    ["authView", "wallView", "remoteView"].forEach(v =>
      document.getElementById(v).classList.toggle("hidden", v !== id)
    );
  }

  function makeTile(app, onPick) {
    const el = document.createElement("button");
    el.className = "tile";
    el.style.setProperty("--tile-color", app.color);
    el.innerHTML = `
      <span class="tile-icon">${app.icon}</span>
      <span class="tile-title">${app.title}</span>
      <span class="tile-sub">${app.subtitle}</span>
    `;
    el.addEventListener("click", () => onPick(app.id));
    return el;
  }

  // Preserve each category's first-seen order from apps.js rather than
  // sorting alphabetically, so related sets (e.g. Fruit Safari 1-6) stay
  // in their intended sequence.
  function groupByCategory(apps) {
    const order = [];
    const map = new Map();
    apps.forEach(app => {
      const cat = app.category || "More";
      if (!map.has(cat)) { map.set(cat, []); order.push(cat); }
      map.get(cat).push(app);
    });
    return order.map(cat => ({ category: cat, apps: map.get(cat) }));
  }

  // Renders the "choose an app" UI into `container`: a row of category
  // filter chips plus a grid for the selected category. `onPick(id)` fires
  // when a tile is clicked. Returns nothing — it's fire-and-forget DOM setup.
  function renderCategorizedGrid(container, apps, onPick) {
    const groups = groupByCategory(apps);
    container.innerHTML = "";

    const chipRow = document.createElement("div");
    chipRow.className = "category-chips";
    const grid = document.createElement("div");
    grid.className = "tile-grid";

    let activeCat = groups[0] ? groups[0].category : null;

    function renderChips() {
      chipRow.innerHTML = "";
      const allChip = document.createElement("button");
      allChip.type = "button";
      allChip.className = "chip" + (activeCat === "__all__" ? " active" : "");
      allChip.textContent = `All (${apps.length})`;
      allChip.addEventListener("click", () => { activeCat = "__all__"; renderChips(); renderGrid(); });
      chipRow.appendChild(allChip);

      groups.forEach(g => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip" + (activeCat === g.category ? " active" : "");
        chip.textContent = `${g.category} (${g.apps.length})`;
        chip.addEventListener("click", () => { activeCat = g.category; renderChips(); renderGrid(); });
        chipRow.appendChild(chip);
      });
    }

    function renderGrid() {
      grid.innerHTML = "";
      if (activeCat === "__all__") {
        groups.forEach(g => {
          const header = document.createElement("h2");
          header.className = "category-header";
          header.textContent = g.category;
          grid.appendChild(header);
          const sub = document.createElement("div");
          sub.className = "tile-grid tile-grid-nested";
          g.apps.forEach(app => sub.appendChild(makeTile(app, onPick)));
          grid.appendChild(sub);
        });
      } else {
        const g = groups.find(g => g.category === activeCat);
        (g ? g.apps : []).forEach(app => grid.appendChild(makeTile(app, onPick)));
      }
      grid.scrollTop = 0;
    }

    renderChips();
    renderGrid();
    container.appendChild(chipRow);
    container.appendChild(grid);
  }

  // ══════════════════════════════ AUTH SCREEN ══════════════════════════
  let isSignup = false;
  const authForm = document.getElementById("authForm");
  const authUsername = document.getElementById("authUsername");
  const authPassword = document.getElementById("authPassword");
  const authSubmit = document.getElementById("authSubmit");
  const authToggleText = document.getElementById("authToggleText");
  const authToggleBtn = document.getElementById("authToggleBtn");
  const authError = document.getElementById("authError");

  authToggleBtn.addEventListener("click", () => {
    isSignup = !isSignup;
    authSubmit.textContent = isSignup ? "Create account" : "Log in";
    authToggleText.textContent = isSignup ? "Already have an account?" : "New here?";
    authToggleBtn.textContent = isSignup ? "Log in instead" : "Create an account";
    authError.textContent = "";
  });

  authForm.addEventListener("submit", async e => {
    e.preventDefault();
    authError.textContent = "";
    authSubmit.disabled = true;
    try {
      const data = await apiPost(isSignup ? "/api/auth/signup" : "/api/auth/login", {
        username: authUsername.value.trim(),
        password: authPassword.value,
      });
      setSession(data.token, data.username);
      startApp();
    } catch (err) {
      authError.textContent = err.message;
    } finally {
      authSubmit.disabled = false;
    }
  });

  function logout() {
    apiPost("/api/auth/logout", {}).catch(() => {});
    clearSession();
    location.reload();
  }

  // ══════════════════════════════ WALL ═════════════════════════════════
  function startWall() {
    document.getElementById("wallUsername").textContent = localStorage.getItem(USERNAME_KEY) || "";
    document.getElementById("wallLogoutBtn").addEventListener("click", logout);

    const frame = document.getElementById("appFrame");
    const homeBtn = document.getElementById("homeBtn");
    const overlay = document.getElementById("menuOverlay");
    const gridHost = document.getElementById("tileGridHost");

    let lastTs = 0;
    let currentApp = "menu";
    let calibrating = false;

    // ── one full-screen calibration, outside every app ──────────────────
    // Same key logic as shared/inputConfig.js calStorageKey().
    function calKey() {
      const p = (new URLSearchParams(location.search).get("input") || "").toLowerCase();
      let m = p === "hand" || p === "irpen" ? p : localStorage.getItem("wallInputMode");
      return m === "hand" ? "wallSharedCalibration" : "wallSharedCalibrationIR";
    }
    function isCalibrated() {
      try {
        const d = JSON.parse(localStorage.getItem(calKey()) || "null");
        return !!(d && d.homography && d.screen); // older in-app calibrations are redone once
      } catch (e) { return false; }
    }
    function startCalibration() {
      calibrating = true;
      overlay.classList.add("hidden");
      frame.src = "/calibrate/index.html";
      frame.addEventListener("load", () => frame.focus(), { once: true });
    }
    window.addEventListener("message", e => {
      if (e.origin !== location.origin || !e.data || e.data.type !== "wall-calibrated") return;
      calibrating = false;
      showApp(currentApp);
    });
    // An app cleared the calibration (R key) → recalibrate here, full screen.
    window.addEventListener("storage", e => {
      if (e.key === calKey() && !e.newValue && !calibrating) startCalibration();
    });

    function showApp(id) {
      currentApp = id;
      if (id === "menu" || !APPS_BY_ID[id]) {
        if (calibrating) return;
        frame.removeAttribute("src");
        overlay.classList.remove("hidden");
      } else if (!isCalibrated()) {
        if (!calibrating) startCalibration(); // opens the app afterwards
      } else {
        calibrating = false;
        frame.src = APPS_BY_ID[id].path;
        overlay.classList.add("hidden");
        frame.addEventListener("load", () => frame.focus(), { once: true });
      }
    }

    document.getElementById("calibrateBtn").addEventListener("click", () => {
      try { localStorage.removeItem(calKey()); } catch (e) { /* ignore */ }
      startCalibration();
    });

    renderCategorizedGrid(gridHost, APPS, async id => {
      showApp(id);
      try {
        const s = await setState(id);
        lastTs = s.ts;
      } catch (e) { /* will retry / reconcile on next poll */ }
    });

    homeBtn.addEventListener("click", () => overlay.classList.toggle("hidden"));

    getState().then(s => {
      lastTs = s.ts || 0;
      showApp(s.app || "menu");
      if (!isCalibrated() && !calibrating) startCalibration();
    }).catch(() => { showApp("menu"); if (!isCalibrated() && !calibrating) startCalibration(); });

    setInterval(async () => {
      try {
        const s = await getState();
        if (s.ts > lastTs && s.app !== currentApp) {
          lastTs = s.ts;
          showApp(s.app);
        }
      } catch (e) { /* transient network hiccup — ignore */ }
    }, POLL_MS);
  }

  // ══════════════════════════════ REMOTE ═══════════════════════════════
  const PLAY_MODE_KEY = "wallRemotePlayMode"; // "here" | "wall"

  function startRemote() {
    document.getElementById("remoteUsername").textContent = localStorage.getItem(USERNAME_KEY) || "";
    document.getElementById("remoteLogoutBtn").addEventListener("click", logout);

    const gridHost = document.getElementById("remoteGridHost");
    const nowPlaying = document.getElementById("nowPlaying");
    const status = document.getElementById("remoteStatus");
    const menu = document.getElementById("remoteMenu");
    const appFrame = document.getElementById("remoteAppFrame");
    const homeBtn = document.getElementById("remoteHomeBtn");
    const modePlayHere = document.getElementById("modePlayHere");
    const modeSendWall = document.getElementById("modeSendWall");

    function label(id) {
      return id === "menu" || !APPS_BY_ID[id] ? "Menu" : APPS_BY_ID[id].title;
    }

    // "here"  -> tapping a tile opens the app full-screen on this phone
    // "wall"  -> tapping a tile only switches the big wall (old behavior)
    let playMode = localStorage.getItem(PLAY_MODE_KEY) === "wall" ? "wall" : "here";

    function renderModeChips() {
      modePlayHere.classList.toggle("active", playMode === "here");
      modeSendWall.classList.toggle("active", playMode === "wall");
    }
    modePlayHere.addEventListener("click", () => {
      playMode = "here";
      localStorage.setItem(PLAY_MODE_KEY, playMode);
      renderModeChips();
    });
    modeSendWall.addEventListener("click", () => {
      playMode = "wall";
      localStorage.setItem(PLAY_MODE_KEY, playMode);
      renderModeChips();
    });
    renderModeChips();

    // show/hide the local, full-screen app player on the phone itself
    function showLocalApp(id) {
      if (!id || id === "menu" || !APPS_BY_ID[id]) {
        appFrame.removeAttribute("src");
        appFrame.classList.add("hidden");
        homeBtn.classList.add("hidden");
        menu.classList.remove("hidden");
      } else {
        appFrame.src = APPS_BY_ID[id].path;
        appFrame.classList.remove("hidden");
        homeBtn.classList.remove("hidden");
        menu.classList.add("hidden");
      }
    }
    homeBtn.addEventListener("click", () => showLocalApp(null));

    renderCategorizedGrid(gridHost, APPS, async id => {
      // Play locally right away — this doesn't need the network.
      if (playMode === "here") showLocalApp(id);

      status.textContent = "Sending to wall…";
      try {
        const s = await setState(id);
        nowPlaying.textContent = label(s.app);
        status.textContent = playMode === "here"
          ? "Also switched the wall to " + label(s.app) + "."
          : "Switched the wall to " + label(s.app) + ".";
      } catch (e) {
        status.textContent = "Couldn't reach the wall — " + e.message;
      }
    });

    async function refresh() {
      try {
        const s = await getState();
        nowPlaying.textContent = label(s.app);
      } catch (e) { /* ignore */ }
    }
    refresh();
    setInterval(refresh, POLL_MS);
  }

  // ══════════════════════════════ BOOT ═════════════════════════════════
  function startApp() {
    showView(mode === "wall" ? "wallView" : "remoteView");
    if (mode === "wall") startWall(); else startRemote();
  }

  async function boot() {
    if (!getToken()) { showView("authView"); return; }
    try {
      await apiGet("/api/auth/me"); // validates the stored token
      startApp();
    } catch (e) {
      clearSession();
      showView("authView");
    }
  }

  boot();
})();
