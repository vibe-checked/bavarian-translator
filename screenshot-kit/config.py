# Per-app settings for the App Store screenshot kit. Edit this file only.
# Run from this folder:  python3 compose.py

APP_NAME    = "BavarianTranslator"
TAGLINE     = "Real-time German ↔ English"
TITLE_SIZE  = 110                       # shrink if the name is long (e.g. 96)
ICON        = "../assets/icon.png"      # path to the 1024px app icon (relative to this folder)

RAW_DIR     = "raw"                     # where your raw simulator screenshots live
OUT_DIR     = "../app-store-screenshots"  # final 01..0N land here (upload to App Store Connect)

# Brand — sample these from the app icon so the frames match it.
BG_STOPS      = [(196, 40, 82), (128, 50, 120), (78, 58, 142)]  # gradient top->bottom (2 or 3 stops)
ACCENT        = (120, 228, 158)         # bullet check-mark color
HEADLINE_BOLD = None                    # None = white *bold* keywords; or an (r,g,b) to tint them
SUBTITLE      = (228, 236, 255)         # panel subtitle color
WATERMARK     = (255, 255, 255)         # faint background swirl color

# Hero (screens 1+2)
HERO_SHOT = "conversation.png"          # which raw to feature in the spanning hero phone
HERO_SW   = 1125                        # hero phone width   | HERO_TILT angle | HERO_PX seam x
HERO_TILT = -20
HERO_PX   = 1050
BULLETS = [                             # 4 value props (hero, left of phone)
    "Two-way translation, spoken aloud",
    "Understands real Bavarian dialect",
    "Slow, clear voice for Oma & Opa",
    "Free forever — no catch",
]

PANEL_SW = 1150                         # feature-panel phone width

# Feature panels (screens 3+). One tuple each:
#   (label, headline, raw_filename, "low"|"high", subtitle)
#   *asterisks* emphasize a word; "low" = headline top, "high" = headline bottom
PANELS = [
    ("dialect",    "Understands *Bavarian* *dialect*",    "conversation.png", "low",  "Boarisch — not just standard German"),
    ("facetoface", "*Face-to-face* mode for Oma",         "facetoface.png",   "high", "One phone, both sides of the table"),
    ("live",       "*Live* — translates as you speak", "live.png",       "low",  "Real-time captions, nothing to tap"),
    ("handsfree",  "Completely *hands-free*",             "auto.png",         "high", "Auto mode listens and replies on its own"),
    ("engines",    "Powered by *top* *AI* — 100% *free*", "engines.png",  "low",  "Gemini, Llama & Voxtral — built right in"),
    ("failover",   "*Never* *gets* *stuck*",              "failover.png",     "high", "Auto-switches engines the instant one is busy"),
    ("free",       "*Free* forever — no catch",       "auto.png",        "low",  "No ads · no in-app purchases · no paywall"),
]
