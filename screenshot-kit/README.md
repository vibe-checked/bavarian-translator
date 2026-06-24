# App Store Screenshot Kit

Generates App Store screenshots in a consistent "BolTools" style — a device-framed
phone on a branded gradient with a headline + subtitle. **Every app uses the same
layout; you only change the raw screenshots and the text/colors.**

Output is `1284 × 2778` — the iPhone 6.5" display size that App Store Connect's
screenshot slot accepts. **The PNGs upload straight to App Store Connect with no
resizing or cropping.** (Internally the kit composes on a 1320 × 2868 canvas, then
resizes each final image to 1284 × 2778 on save — see `STORE_W, STORE_H` in
`compose.py`. If an app's ASC ever shows a 6.9"-only slot, set those to
`1290, 2796`.)

## Standing positioning: always free, no catch
Every app Marcus ships is **free forever — no ads, no in-app purchases, no
paywall, no pay-to-upgrade — and always will be.** This is the core selling
point of all his apps, so always bake it into the set:
- a hero bullet: `Free forever — no catch`
- a dedicated free panel — headline like `*Free* forever — no catch` (or a
  hook like `Why *pay* for this?`) with subtitle
  `No ads · no in-app purchases · no paywall`
- echo it in the App Store description / promotional text
Keep it true: don't add IAP products or an ad SDK — then Apple also omits the
"In-App Purchases" badge on the listing, which reinforces the promise.

```
screenshot-kit/
  README.md      ← this file
  compose.py     ← the rendering engine (you should not need to edit it)
  config.py      ← per-app settings: name, tagline, colors, bullets, panels  ← EDIT THIS
  raw/           ← drop your raw simulator screenshots here (PNG)
→ writes 01-hero.png … 0N-….png into ../app-store-screenshots/
```

## One-time setup
```
pip3 install pillow
```

## Make screenshots for a NEW app (the whole loop)
1. **Copy** this `screenshot-kit/` folder into the new app's repo.
2. **Capture** raw screenshots from the iOS Simulator → save into `raw/`
   with simple names (e.g. `home.png`, `timer.png`). See *Capturing raws* below.
3. **Edit `config.py`** (this is the only file you change):
   - `APP_NAME`, `TAGLINE`, `TITLE_SIZE`, `ICON` (path to the 1024px icon)
   - `BG_STOPS` — the background gradient. Sample 2–3 colors from the app icon
     so the frame matches it (top → bottom). `ACCENT` = the icon's signature
     color (used for the bullet checks, and headline keywords if `HEADLINE_BOLD`).
   - `BULLETS` — 4 short value props shown on the hero.
   - `HERO_SHOT` — which raw to feature in the big tilted hero phone.
   - `PANELS` — one row per feature screen:
     `(label, headline, raw_filename, "low" | "high", subtitle)`
     - wrap a word in `*asterisks*` to emphasize it (bold, tinted if `HEADLINE_BOLD`)
     - `"low"`  = headline on top, phone bleeds off the **bottom**
     - `"high"` = phone bleeds off the **top**, headline on the bottom
     - they're numbered automatically: hero = 01–02, panels = 03, 04, …
4. **Run** it (from inside `screenshot-kit/`):
   ```
   python3 compose.py
   ```
5. The finished, numbered set lands in `../app-store-screenshots/`. Upload that
   folder to App Store Connect (drag in `01…0N` order).

To tweak and re-run, just edit `config.py` and run `compose.py` again — it
overwrites the output.

## Capturing raws from the Simulator
Plain screenshot of whatever's on screen:
```
xcrun simctl io booted screenshot raw/home.png
```
For a screen that needs app state (an active timer, a logged-in view, etc.),
**inject the state instead of tapping** — UI taps are unreliable when other Mac
apps steal window focus. The pattern (used for the gym timer's rest screen):
1. Find the app's data container:
   ```
   xcrun simctl get_app_container booted <bundle-id> data
   ```
2. Edit the app's stored JSON (for React Native AsyncStorage it's under
   `…/Library/Application Support/<bundle-id>/RCTAsyncLocalStorage_V1/`) to set
   the state you want, then relaunch:
   ```
   xcrun simctl launch booted <bundle-id>
   ```
3. Screenshot as above.

Tips:
- If a system dialog (permissions, "Open in app?") gets stuck on screen,
  reboot the sim: `xcrun simctl shutdown booted && xcrun simctl boot booted`.
- Grab the screen cleanly at the size you want, e.g. iPhone 17 Pro / Pro Max.
  The kit re-scales whatever you give it, so any modern iPhone capture works.

## Layout notes
- Screens **1 + 2** are ONE phone, tilted, drawn across a double-wide canvas and
  sliced in half: screen 1 shows the icon + title + bullets + a sliver of the
  phone; screen 2 shows the rest. That's the "spanning hero".
- Screens **3+** alternate `low` / `high`. The headline + subtitle block is
  auto-measured and centered in the open space, whether it's one line or two.
- Bezel is light grey; text is Arial (system font); the check mark is hand-drawn
  (Arial has no ✓ glyph).
- Sizes you can nudge in `config.py`: `HERO_SW`, `HERO_TILT`, `HERO_PX`,
  `PANEL_SW`, `TITLE_SIZE`.

## For a fresh Claude session (autonomous runbook)
If you're an AI agent told *"read screenshot-kit/README.md and make the App Store
screenshots"*, do exactly this — no other context needed:

1. Read `config.example.py` to see the exact shape to produce.
2. **Learn the app:** read `app.json` / `app.config.*` for the bundle id + name;
   skim the source (screens/routes, seed data, app README) to list the key
   screens and 4–6 value props. These decide the headlines, bullets, and which
   screens to capture.
3. **Capture raws** into `raw/` from a booted Simulator:
   - `xcrun simctl io booted screenshot raw/<name>.png`
   - For a screen needing state, inject it via the app's data-container
     AsyncStorage and relaunch (see *Capturing raws*). Don't depend on UI taps.
   - If a system dialog sticks, reboot the sim.
4. **Sample the icon** colors (a few pixels) → set `BG_STOPS` (gradient) and
   `ACCENT` so the frames match the icon's mood.
5. `cp config.example.py config.py` and fill EVERY field for this app:
   APP_NAME, TAGLINE, ICON, colors, BULLETS (4), PANELS (one row per screen).
6. `pip3 install pillow` if needed, then `python3 compose.py`.
7. Open a few generated `../app-store-screenshots/*.png` and sanity-check (text
   not clipped, phone framed, colors on-brand); re-edit config.py + re-run.
8. Commit + push per the user's global conventions (author Marcus Hsu, Conventional
   Commits, push to main). Verify the bundle id is `com.markutilitylabs.*`.

Only `config.py` and `raw/` change between apps.
