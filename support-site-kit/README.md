# App Support &amp; Privacy Site Kit

You are an AI coding agent. Your job: from this kit alone, generate a polished,
professional **single-page App Store Support + Privacy website** for the app in
the **current repository**, deployed via GitHub Pages from `docs/`.

Follow this README exactly. Do not improvise the structure, the layout, or the
contact details. Assume **no prior context** — everything you need is here or
discoverable in the repo.

The site is required by Apple: every App Store listing needs a **Support URL**
and a **Privacy Policy URL**. This kit produces both from one page using
`#support` and `#privacy` anchors.

---

## 0. What you will produce

Write these into the repo's **`docs/`** folder (create it if missing):

```
docs/
├── index.html        ← the site (from template.html, all {{TOKENS}} filled)
├── support.html      ← redirect stub → index.html#support
├── privacy.html      ← redirect stub → index.html#privacy
├── icon.png          ← the app icon (square, ≤512px)
├── favicon.png       ← the app's favicon (or a copy of the icon)
└── gallery/          ← every App Store screenshot, web-optimised to .jpg
    ├── 01-….jpg
    └── …
```

The page sections, in this exact order (never reorder):
**nav → hero → gallery → features → support → privacy → footer.**

---

## 1. NON-NEGOTIABLE RULES

These never change, regardless of the app:

1. **Contact email is always `monkeytree2019@gmail.com`.** Never invent another
   address (no `support@…` custom domains — they bounce). It is already baked
   into `template.html`; do not change it.
2. **Publisher / company name is `Mark Utility Labs`.** Already in the template.
3. **Bundle ID must start with `com.markutilitylabs.`** Check the repo's
   `app.json` (`ios.bundleIdentifier` and `android.package`). If it uses a
   different prefix (e.g. `com.someoneelse.*`), **stop and warn the user** —
   do not silently proceed.
4. **One page only.** All content lives in `index.html`. `support.html` and
   `privacy.html` are redirect stubs (use `redirect-support.html` /
   `redirect-privacy.html` from this kit, replacing `{{APP_NAME}}`).
5. **Every claim must be TRUE for this app.** Read the real source/docs before
   writing the privacy policy. Never state a data practice you haven't verified.
6. **Git:** author is `Marcus Hsu <mh3346@columbia.edu>`. Conventional Commits.
   **No `Co-Authored-By` / AI attribution.** Push to the repo's **default
   branch** (it may be `main` OR `master` — check).

---

## 2. STEP-BY-STEP

### Step 1 — Gather facts about the app

Run/read these to learn the app. Do not guess any of them:

- **`app.json`** (or `app.config.js`): app `name`, `slug`, `bundleIdentifier`,
  and the `icon` path.
- **Screenshots:** look for an **`app-store-screenshots/`** folder in the repo
  root. These are the marketing screenshots you'll showcase. Note their order
  by filename (e.g. `01-…`, `02-…`).
- **Existing `docs/`, `README.md`, and the app source** (`App.tsx`, `app/`,
  `src/`): mine these for the **real** feature list, the **real** support FAQ,
  and the **real** privacy/data behaviour (what's stored, what permissions are
  used, whether anything is sent off-device).
- **Git remote:** `git remote get-url origin` → derive `OWNER` and `REPO`.
  - `SITE_URL`  = `https://OWNER.github.io/REPO/`
  - `GITHUB_URL` = `https://github.com/OWNER/REPO`
- **Default branch:** `git symbolic-ref --short HEAD` (or check the remote).
- **GitHub Pages:** confirm it serves from `/docs`:
  `gh api repos/OWNER/REPO/pages` → look for `"path":"/docs"`. If Pages isn't
  enabled, tell the user to enable it (Settings → Pages → Branch: default,
  Folder: `/docs`).

**Look at the pixels.** Open the app **icon** and **1–2 screenshots** (read them
as images). You need to SEE the brand colours to theme the site (Step 3).

### Step 2 — Prepare the image assets

From the repo root (adjust the icon path to match `app.json`):

```sh
mkdir -p docs/gallery

# Optimise every screenshot → web JPEG (width 660, quality 82)
for f in app-store-screenshots/*.png; do
  b=$(basename "${f%.png}")
  sips --resampleWidth 660 "$f" --out "/tmp/_k_$b.png" >/dev/null
  sips -s format jpeg -s formatOptions 82 "/tmp/_k_$b.png" --out "docs/gallery/$b.jpg" >/dev/null
  rm -f "/tmp/_k_$b.png"
done

# App icon → docs/ (shrink to 512 if it's large), plus a favicon
cp <ICON_PATH_FROM_APP_JSON> docs/icon.png
sips --resampleWidth 512 docs/icon.png --out docs/icon.png >/dev/null   # only if >512px
cp <FAVICON_PATH> docs/favicon.png 2>/dev/null || cp docs/icon.png docs/favicon.png
```

Target: each gallery JPG ≈ 100–250 KB. If the icon is a huge PNG, the 512 resize
keeps `docs/` light.

### Step 3 — Choose the theme (the ONLY visual decision)

The template is themed entirely through the `:root` block in `template.html`.
**Every colour is a variable** — fill them to match the app's brand. Pick the
accent from the app's icon/screenshots.

Two structural cases:

- **App has LIGHT screenshots** (light app UI): set `--card-bg: #ffffff`.
- **App has DARK screenshots** (dark app UI): set `--card-bg` to a dark colour
  (e.g. `#14171e`) so the cards frame the dark shots cleanly.

The **hero and footer are always dark** (so the colourful gallery pops against
them). Use a **navy** dark base for cool/blue/red themes, or a **charcoal** dark
base for warm/amber/green/dark-app themes.

**Accent readability:** `--accent` is used for small text on white (section
labels, links). It MUST hit ~4.5:1 contrast on white. If the brand colour is
light (bright yellow, lime, cyan, pastel), use a **darker shade** for `--accent`
and keep the bright shade only for `--glow-1/2`, `--em-1/2`, and `--brand-span`.

**Worked palettes (already shipped — copy and adapt):**

| Variable        | Blue app (Copy History) | Red/Blue app (Bavarian) | Dark + amber app (Gym Timer) |
|-----------------|-------------------------|-------------------------|------------------------------|
| `--bg`          | `#f4f7fc`               | `#f5f7fb`               | `#f6f6f4`                    |
| `--ink`         | `#131722`               | `#16181d`               | `#15171c`                    |
| `--muted`       | `#586074`               | `#5b6472`               | `#5c6270`                    |
| `--subtle`      | `#97a0b4`               | `#97a0b0`               | `#9aa0ad`                    |
| `--rule`        | `#e6e9f0`               | `#e7e9ef`               | `#e7e8ec`                    |
| `--accent`      | `#2563eb`               | `#c8102e`               | `#b45309`                    |
| `--deep`        | `#1d4ed8`               | `#a50d24`               | `#92400e`                    |
| `--soft`        | `#e7f0ff`               | `#fde8ea`               | `#fdecd2`                    |
| `--soft-border` | `#c2d8f7`               | `#f3c9cf`               | `#f3d9a8`                    |
| `--soft-ink`    | `#1c3a6b`               | `#7a1623`               | `#7a4a12`                    |
| `--hero-1`      | `#1a3a78`               | `#1a3a72`               | `#232733`                    |
| `--hero-2`      | `#0e2150`               | `#0e2348`               | `#14171e`                    |
| `--hero-3`      | `#091327`               | `#0a1730`               | `#0b0d12`                    |
| `--glow-1`      | `#2563eb`               | `#c8102e`               | `#f59e0b`                    |
| `--glow-2`      | `#38bdf8`               | `#1d5fb8`               | `#a3e635`                    |
| `--em-1`        | `#93c5fd`               | `#ff9aa8`               | `#fcd34d`                    |
| `--em-2`        | `#7dd3fc`               | `#bcd7ff`               | `#bef264`                    |
| `--brand-span`  | `#93c5fd`               | `#ff8a9b`               | `#fcd34d`                    |
| `--chk`         | `#6fe09a`               | `#6fe09a`               | `#bef264`                    |
| `--pill-bg`     | `#2563eb`               | `#c8102e`               | `#f59e0b`                    |
| `--pill-text`   | `#ffffff`               | `#ffffff`               | `#1a1205` (dark on bright)   |
| `--pill-shadow` | `rgba(37,99,235,.45)`   | `rgba(200,16,46,.42)`   | `rgba(245,158,11,.4)`        |
| `--card-bg`     | `#ffffff`               | `#ffffff`               | `#14171e` (dark screenshots) |
| `--em` note     | cool duotone            | two brand colours       | amber→lime                   |

`--glow-1` / `--glow-2` are the two glows that bookend the page (hero top + footer
bottom). Use the app's **two** brand colours if it has them; if it's a single-
colour brand, use the accent plus a lighter/complementary tint of it.

Set `--theme-color` meta (in the template head, `{{THEME_COLOR}}`) to `--hero-2`.

### Step 4 — Fill the template

Copy `template.html` → `docs/index.html`, then replace **every `{{TOKEN}}`**.
See §4 for the full token table. Key content rules:

- **Hero showcase shot** (`{{HERO_SHOT}}`): pick the cleanest single screenshot
  that looks like an angled/standalone phone — usually `02-hero.jpg`. Put its
  filename here.
- **Gallery:** add one `.gallery-card` per screenshot **EXCEPT** the hero shot
  (so every screenshot appears exactly once across the page). Keep filename
  order. Write a short, specific `alt` for each.
- **Features:** 6 cards, each a real, distinct feature (emoji icon + 2–4 word
  title + one sentence). Pull these from the app's real capabilities.
- **Support FAQ:** 5–8 real questions with honest answers (reuse the app's
  existing support content if any). Then the contact card (email is fixed).
- **Privacy:** write only what's TRUE (see §6). Keep the "short version"
  highlight, then numbered `<h3>` sections, ending with "Contact us".

### Step 5 — Redirect stubs

```sh
# replace {{APP_NAME}} in both, then place in docs/
sed 's/{{APP_NAME}}/<App Name>/g' redirect-support.html > docs/support.html
sed 's/{{APP_NAME}}/<App Name>/g' redirect-privacy.html > docs/privacy.html
```

Delete any leftover old site files in `docs/` (old `app.css` / `styles.css`,
stale `screenshots/` folders, etc.) so nothing dangles.

### Step 6 — Verify, then ship

- **Preview** the page (serve `docs/` and open it, or open `docs/index.html`).
  Confirm: hero renders with the device shot, the gallery scrolls and the
  arrows work, `#support`/`#privacy` anchors jump correctly, mobile layout
  stacks cleanly, and there are **no console errors**.
- **Sanity-grep:** the page contains `monkeytree2019@gmail.com`, has
  `id="support"` and `id="privacy"`, and contains **no leftover `{{`**.
- **Commit & push** (Conventional Commits, author Marcus Hsu, no co-author) to
  the **default branch**. Confirm GitHub Pages rebuilds and the URL returns 200.

**The App Store URLs to hand back to the user:**

- Support URL:  `https://OWNER.github.io/REPO/#support`
- Privacy URL:  `https://OWNER.github.io/REPO/#privacy`

---

## 3. Theming quick-reference

```
hero/footer = always dark (navy for cool themes, charcoal for warm/dark apps)
gallery/features/support/privacy = always light
accent = brand colour, readable on white (>=4.5:1) — darken if the brand is light
glow-1 + glow-2 = the two brand colours that bookend the page
card-bg = #fff for light-app screenshots, dark for dark-app screenshots
```

---

## 4. Token reference (everything in `template.html`)

**Identity / meta**
- `{{APP_NAME}}` — full display name, e.g. `Copy History`
- `{{BRAND_MAIN}}` / `{{BRAND_ACCENT}}` — brand split for nav & footer; the
  accent part is coloured. e.g. `Copy` + `History` → renders "Copy **History**".
  (If the name is one word, put it all in `{{BRAND_MAIN}}` and leave
  `{{BRAND_ACCENT}}` empty.)
- `{{META_DESCRIPTION}}` — one sentence describing the app + that this is its
  support/privacy page.
- `{{THEME_COLOR}}` — hex of `--hero-2` (dark).
- `{{SITE_URL}}` — `https://OWNER.github.io/REPO/` (trailing slash).
- `{{GITHUB_URL}}` — `https://github.com/OWNER/REPO`.

**Hero**
- `{{HERO_BADGE}}` — short label, e.g. `Private Clipboard · iPhone`.
- `{{HERO_H1_PRE}}` — start of headline (plain).
- `{{HERO_H1_EM}}` — the emphasised, gradient part of the headline.
- `{{HERO_SUB}}` — 1–2 sentence subtitle (may include `<strong>…</strong>`).
- `{{TRUST_1/2/3}}` — three short trust chips, e.g. `No account`, `On-device only`,
  `No tracking`.
- `{{HERO_SHOT}}` — gallery filename for the showcase phone, e.g. `02-hero.jpg`.
- `{{HERO_SHOT_ALT}}` — alt text for it.

**Gallery** (repeat the card line per screenshot, excluding the hero shot)
- `{{GALLERY_SUB}}` — one sentence framing the screenshots.
- `{{SHOT_FILE}}` / `{{SHOT_ALT}}` — per card.

**Features** (6 cards)
- `{{FEATURES_TITLE}}` / `{{FEATURES_SUB}}`
- `{{FEATURE_ICON}}` (emoji) / `{{FEATURE_TITLE}}` / `{{FEATURE_BODY}}`

**Support**
- `{{SUPPORT_LEAD}}` — intro paragraph.
- `{{FAQ_Q}}` / `{{FAQ_A}}` — per FAQ item (5–8).
- `{{CONTACT_BODY}}` — one line inviting contact (ask users to include device
  model + iOS version).

**Privacy**
- `{{LAST_UPDATED}}` — e.g. `May 29, 2026` (use the repo's real date if known).
- `{{PRIVACY_SHORT}}` — the "short version" one-liner.
- `{{PRIVACY_SECTION_TITLE}}` / `{{PRIVACY_SECTION_BODY}}` / `{{N}}` — numbered
  sections (see §6).

**Footer**
- `{{FOOTER_TAGLINE}}` — short tagline, e.g. `Less setup. More sets.`

---

## 5. Features section — how to choose the 6

Each card = one real, user-visible benefit. Good pattern: an emoji that fits the
app, a punchy 2–4 word title, one plain sentence of what it does for the user.
The **last** card is almost always the privacy/"no account, no tracking" angle,
because these apps are local-first. Don't pad with fake features — if the app
genuinely has fewer than 6 strong ones, it's fine to ship 4–6.

---

## 6. Privacy policy — the standard sections

Write a "short version" highlight, then numbered `<h3>` sections. Include only
what's **true**. The usual set for a Mark Utility Labs local-first utility:

1. **What data the app handles / Overview** — the on-device data it creates.
2. **How it's stored** — local storage (e.g. AsyncStorage); deleting in-app and
   uninstalling removes it.
3. **What is NOT collected** — no analytics, no ad IDs, no third-party data
   SDKs, no account, no network requests for user data. (List the absences.)
4. **Permissions** — name each system permission the app requests (microphone,
   notifications, etc.) and why; or state it requests none.
5. **Third-party services** — only if the app actually talks to any external
   service (e.g. an AI API). If so, list each and link its policy. Omit this
   section entirely if nothing leaves the device.
6. **Children's privacy** — not directed at under-13s; collects no personal data.
7. **Changes to this policy** — "Last updated" date governs.
8. **Contact us** — Mark Utility Labs + `monkeytree2019@gmail.com`.

Renumber so "Contact us" is last. Match the policy to the app: a fully offline
app has no "third-party services" section; an app that calls an API must
disclose it honestly.

---

## 7. Final checklist

- [ ] `app.json` bundle ID starts with `com.markutilitylabs.` (else warned user)
- [ ] `docs/index.html` written from the template; **no `{{` left**
- [ ] Theme `:root` fully filled; accent readable on white
- [ ] `docs/gallery/` has every screenshot (optimised .jpg); hero shot excluded
      from the gallery loop
- [ ] `docs/icon.png` (≤512px) + `docs/favicon.png` present
- [ ] `docs/support.html` + `docs/privacy.html` are redirect stubs
- [ ] Old site files removed from `docs/`
- [ ] Contact email is `monkeytree2019@gmail.com` everywhere; publisher is
      `Mark Utility Labs`
- [ ] Previewed: hero, gallery scroll + arrows, anchors, mobile, no console errors
- [ ] Committed (Conventional Commits, author Marcus Hsu, no co-author) and
      pushed to the default branch; Pages live (HTTP 200)
- [ ] Reported the `#support` and `#privacy` URLs to the user
