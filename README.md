# Interactive Wall — unified launcher

One Vercel deployment that bundles all five touch-wall apps behind a single
menu, shares one calibration across all of them, and lets a phone remotely
switch which app is showing on the wall.

## What's in here

```
public/
  index.html        the one page every device loads
  apps.js            registry of the 5 apps (id, title, icon, path)
  launcher.js        wall-menu logic + mobile-remote logic + sync polling
  launcher.css
  apps/
    alphabets/       (from wall-alphabets-web)
    animals/         (from animal-languages-web)
    fruit-slash/
    music/           (from my-music-web)
    piano/           (from mypiano-web)
    colorquest/      (from ColorQuest, ported to the wall's camera+calibration style)
    colorquiz/       (from ColorQuiz, ported the same way — DOM buttons instead of canvas shapes)
    colorsafari/     (from ColorSafari — hybrid: DOM nav buttons + tap-anywhere-on-canvas)
    findanimal/      (from FindAnimal — plain DOM click cards, same pattern as colorquiz)
    gardenspotter1/  (fruits & vegetables — set 1 of 4, built on shared/spotterEngine.js)
    gardenspotter2/  (fruits & vegetables — set 2 of 4)
    gardenspotter3/  (fruits & vegetables — set 3 of 4)
    gardenspotter4/  (fruits & vegetables — set 4 of 4)
    gardenlang1/     (fruits & vegetables — "language wheel" — set 1 of 4)
    gardenlang2/     (fruits & vegetables — "language wheel" — set 2 of 4)
    gardenlang3/     (fruits & vegetables — "language wheel" — set 3 of 4)
    gardenlang4/     (fruits & vegetables — "language wheel" — set 4 of 4)
  shared/
    calibrationBootstrap.js   reusable camera+9-dot-calibration flow
                              (used by colorquest/colorquiz/colorsafari/findanimal/gardenspotter*)
    homography.js / handTracker.js   canonical copies used via the bootstrap above
    spotterEngine.js  generic "pick the picture that matches" game engine
                       (extracted from Animal Spotter — each Garden Spotter
                       app supplies only its own items.js and images/)
    langAppEngine.js / langAppMain.js  generic "hub-and-spoke language
                       wheel" engine (extracted from Animal Languages —
                       each Garden Languages app supplies only its own
                       items.js with English/Hindi/Telugu text + images/)
api/
  state.js           reads/writes the logged-in user's "active app"
  auth/
    signup.js         create account -> returns a session token
    login.js          verify credentials -> returns a new session token
    logout.js          invalidates just this device's token
    me.js             checks whether a stored token is still valid
  _lib/
    db.js             Neon connection + one-time schema creation
    auth.js           password hashing (scrypt), token helpers
vercel.json
package.json
```

Passwords are never stored in plain text — each one is hashed with Node's
built-in `scrypt` (a random salt per user, timing-safe comparison on login).

Each `apps/<name>/` folder is your original app, unchanged except for one
thing: **calibration is now shared**. All five now save to the same
`localStorage` key (`wallSharedCalibration`) and — more importantly — the
calibration math (`this.calH`) is stored in **resolution-independent
(0–1 normalized) form**, so it doesn't matter that each app builds its 9-dot
grid slightly differently or that the browser window is a different size.
**Calibrate once, in any one app, and all five apps pick it up immediately**
(same origin → shared `localStorage`).

## Accounts & how the menu / remote sync works

- The first thing any device sees is a **login / create account** screen.
  Create one username + password (on whichever device is handiest), then
  log in with those *same* credentials on every other device you want kept
  in sync.
- `index.html` + `launcher.js` then run in **two modes**:
  - **Wall mode** (auto-detected on desktops / touch-wall PCs): shows a
    full-screen `<iframe>` running whichever app is active, plus a small
    `⌂` home button that opens the menu to switch apps by touch.
  - **Remote mode** (auto-detected on phones): shows just the menu, as a
    remote control, with a "Now playing on the wall" indicator.
- Both modes read/write one row in Neon — `users.active_app` for your
  account — through `/api/state`, polled every 1.5s. Tap an app on your
  phone → it POSTs the choice under your account → the wall's next poll
  (same account) picks it up and switches.
- Each device gets its **own session token** on login, so the wall and your
  phone can be logged in on the same account *simultaneously* — logging in
  on your phone does not log the wall out, and vice versa. "Log out" only
  ends that one device's session.
- You can force a mode with `?mode=wall` or `?mode=remote` in the URL if
  auto-detection ever guesses wrong (e.g. testing the wall view on a
  tablet). The choice is remembered per-device after that.
- Multiple independent walls just need **different accounts** — e.g. one
  username per classroom/room. Everyone logged into `room1` syncs with
  each other; `room2` is completely separate.

## Adding a mouse/click-only app to the wall

Two apps so far started life as ordinary mouse/click web games with no
camera or calibration, and got ported in using **`/public/shared/calibrationBootstrap.js`**
— one reusable "boot the webcam, reuse or run the 9-dot calibration, then
tell me when you're ready" module, so neither app had to reimplement that
flow from scratch:

- **`colorquest`** (canvas shapes, p5.js): the sketch's canvas was switched
  from a fixed 800×600 box to filling the whole window (the shared
  calibration is stored as a fraction of "whatever canvas was calibrated,"
  so every app needs to fill the same screen area for it to line up). A
  `window.WallPointer = {x, y, active}` is updated every frame from the
  mapped fingertip; the draw loop treats **holding** the pointer over a
  shape for ~0.75s the same way the original `mousePressed()` treated a
  click. Mouse clicks still work too, untouched.

- **`colorquiz`** (plain DOM buttons/tiles, no canvas hit-testing): instead
  of per-shape logic, it uses a fully generic bridge — each frame, map the
  fingertip to a screen point, find whatever clickable element is under it
  with `document.elementFromPoint()`, and after ~0.7s of dwelling there,
  fire a real `.click()` on it. Any future app whose answers are ordinary
  `<button>`s can reuse this exact approach with zero new hit-testing code.

- **`colorsafari`** (hybrid): three real DOM buttons (Back / Say it again /
  Next) use the same dwell-to-`.click()` bridge as `colorquiz`, but the
  main interaction — tapping the glowing orb — is a canvas-region check
  the original script does itself inside `mousePressed()` using
  `mouseX`/`mouseY`. Rather than duplicate that region logic, the bridge
  dwell-detects a *position* on the bare canvas (not a DOM element) and
  then dispatches a synthetic `mousedown`/`mouseup`/`click` at that point —
  p5.js's own canvas listener picks it up and calls `mousePressed()`
  exactly as a real click would. Zero changes to the original game script.

If you add another app, pick whichever pattern matches how it detects
input and follow the corresponding one above.

## Garden Spotter (4 apps from your 45 photos)

Built the same way as Animal Spotter, using the new shared
`spotterEngine.js` — each app only needed its own `items.js` (list of
`{name, file}`) and an `images/` folder:

- **Garden Spotter 1** — 11 items: Ginger, Potato, Fig, Cauliflower, Carrot,
  Cherry, Coconut, Coriander, Cucumber, Custard Apple, Date
- **Garden Spotter 2** — 11 items: Dragon Fruit, *Fruit (F1)*, Garlic,
  Grapes, Green Chili, Peanut, Guava, Ice Apple, Jackfruit, Jamun, Kiwi
- **Garden Spotter 3** — 11 items: Lettuce, Lemon, Mango, Muskmelon, Onion,
  Orange, Papaya, Peas, Black Pepper, Pineapple, Pistachio
- **Garden Spotter 4** — 12 items: Plum, Pomegranate, Star Fruit,
  Strawberry, Sweet Corn, Tamarind, Tomato, *Vegetable (V2)*,
  *Vegetable (V3)*, *Vegetable (V4)*, Watermelon, White Carrot

45 photos doesn't divide evenly into groups of 11 (45 = 11×4 + 1), so the
last app has 12 instead of a lonely 5th app with one item.

**Please double-check the italicized names above** — `F1.jpg`, `V2.jpg`,
`V3.jpg`, and `V4.jpg` had no descriptive filename, so placeholder labels
were used rather than guessing at something specific that couldn't be
confirmed. `Ice.jpg` and `Pepper.jpg` were named from best guesses too
(Ice Apple / Black Pepper) — worth a quick look. To fix a name, open the
relevant `public/apps/gardenspotter*/items.js` and edit the `"name"`
field — no other code needs to change.

## Garden Languages (4 more apps, same 45 photos, Animal-Languages style)

Same photo groupings as Garden Spotter (11, 11, 11, 12), but built as a
"language wheel" like **Animal Languages**: one item shown at a time, with
three circles around it — English, Hindi, Telugu — that speak the name
when pointed at, plus Next/Prev to cycle through items. Extracted into
`shared/langAppEngine.js` + `shared/langAppMain.js` the same way Garden
Spotter used `spotterEngine.js` — each app supplies only its own
`items.js` and `images/`.

**Important difference from Animal Languages:** the original app plays
real recorded mp3s for Hindi and Telugu (only English uses the browser's
text-to-speech). There are no recordings for these fruit/vegetable photos,
so **all three languages here use the browser's built-in Web Speech API**
instead. English almost always sounds fine. Hindi and Telugu will only
work if the browser/OS has those voices installed — Chrome on Android and
Windows usually does; on other setups it may stay silent for those two
circles. If natural-sounding Hindi/Telugu audio matters, real recordings
(one mp3 per item, per language) would need to be added and `speak()` in
`langAppEngine.js` pointed back at them — happy to wire that up if you can
provide the recordings.

Translations were filled in from common produce vocabulary and are
generally reliable, but same caveat as before: **please double check the
placeholder items** — `F1.jpg` and `V2/V3/V4.jpg` have no real name to
translate, so they're labeled generically ("Fruit" / "Vegetable" in all
three languages). To fix any name or translation, edit the relevant
`public/apps/gardenlang*/items.js` — each item's `data` array holds the
English/Hindi/Telugu text shown and spoken.

## Jungle Word Safari (5 sets)

Same hybrid pattern as Color Safari (DOM Back/Say it again/Next buttons +
tap-anywhere-on-canvas to reveal a black & white picture in full color).
The game logic (`JungleSafari_N.js`) is identical across all 5 sets —
only the word list and images differ:

- **Set 1** — Airplane, Ambulance, Ball, Balloon, Bear, Bee, Bicycle,
  Bird, Boat, Buffalo
- **Set 2** — Butterfly, Cake, Car, Cockatoo, Cockroach, Cow, Crow, Deer,
  Dinosaur, Dog
- **Set 3** — Donkey, Drum, Duck, Earth, Elephant, Fish, Giraffe, Goat,
  Helicopter, Horse
- **Set 4** — Hot Air Balloon, Hummingbird, Iguana, Kangaroo, Lion,
  Monkey, Ostrich, Owl, Palm Tree, Panther
- **Set 5** — Parrot, Pigeon, Puppy, Rabbit, Raven, Rhino, Rooster,
  Scooter, Scorpion, Shark

The title said "Set 1 of 6" on every set as shipped (sets 2-5 all
incorrectly said "Set 1" too — a copy-paste leftover in the source), so
each app's title/brand text was corrected to its real set number when it
was added here. The filenames also imply a 6th set that was never
provided — if you have it, send it over and I'll add it the same way.
Each set also shipped with an unused `assets/photos/` folder (the 45
fruit/vegetable photos) that the game code never references, so it was
left out of each app to keep things lean.

## Deploy to Vercel

### 1. Push this folder to GitHub (or use the Vercel CLI directly)

```bash
cd interactive-wall
git init && git add -A && git commit -m "Unified touch-wall launcher"
git remote add origin <your-empty-github-repo-url>
git push -u origin main
```

Then in the [Vercel dashboard](https://vercel.com/new), **Import** that repo.
Framework preset: "Other" (it's static + serverless functions — no build
step needed).

Or skip GitHub entirely with the CLI:

```bash
npm i -g vercel
cd interactive-wall
vercel        # first deploy, follow the prompts
vercel --prod # promote to production
```

### 2. Add the Neon database (one-time, ~2 minutes)

Accounts, sessions, and the shared "active app" state all live in one
Postgres database on **Neon** (has a generous free tier and installs
straight from Vercel):

1. In your Vercel project → **Storage** tab → **Create Database** →
   **Neon** (or **Marketplace → Neon**, or create the project directly at
   [neon.tech](https://neon.tech) and just paste in the connection string).
2. Connect it to this project. Vercel adds the env var **`DATABASE_URL`**
   automatically — that's the only thing `api/_lib/db.js` needs.
3. Redeploy (Vercel usually prompts you to after adding the integration).

No manual migration step needed — the app creates its two tables (`users`,
`sessions`) itself the first time any `/api` route runs.

Without this step you'll see a "DATABASE_URL is not set" error on the login
screen — the whole app (including per-device login) depends on Neon now, so
this step isn't optional the way the old Redis step was.

### 3. Open it

- On the touch-wall PC / the display driving the projector or touchscreen:
  open `https://your-app.vercel.app/` in a full-screen browser (kiosk mode
  recommended: `chrome --kiosk https://your-app.vercel.app/`), and create
  or log into an account.
- On your phone: open the exact same URL and log in with the **same
  username and password**. It'll show the remote control automatically,
  and switching apps there will switch the wall.

## Notes / things worth knowing

- **Camera permission** is granted per browser origin. Since every app now
  lives under the same domain, the wall only has to grant camera access
  once — the first app you open will prompt for it, the rest won't ask
  again.
- **Apps auto-start — no click needed after the first calibration.** Every
  app boots its camera automatically the moment its page loads (no need to
  press "Start camera & begin"); that button is still there, but only as a
  manual fallback if auto-start fails (e.g. camera permission was somehow
  revoked). If a wall is already calibrated, switching apps from the menu
  or from the phone now goes straight into the new app with no extra tap.
  If it *isn't* calibrated yet, the 9-dot calibration screen still appears
  automatically — just without needing a click to kick it off.
  - One caveat: **My Piano**'s sound uses the Web Audio API, which some
    browsers only allow to play after a genuine user gesture. Auto-start
    still attempts to unlock it immediately (this usually works, since
    switching to Piano from the wall menu or phone is itself a real click
    that Chromium-based browsers carry into the newly loaded page) — but
    if a browser blocks it, the "Start camera & begin" button is still
    there as a one-tap fallback to unlock sound.
- The `mypiano` app supports two simultaneous hands; the others track one.
  That was already true before unification and hasn't changed.
- If you ever want to add another app, add its folder under
  `public/apps/<id>/` and one entry to `public/apps.js` — nothing else
  needs to change.
