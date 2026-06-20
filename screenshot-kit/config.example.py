# TEMPLATE — copy to config.py and fill in for THIS app, then run: python3 compose.py
# (compose.py imports config.py, never this file.)

APP_NAME    = "Your App Name"
TAGLINE     = "Short one-line pitch"
TITLE_SIZE  = 104                       # 96–110; smaller for longer names
ICON        = "../assets/icon.png"      # path to the 1024px icon (relative to this folder)

RAW_DIR     = "raw"
OUT_DIR     = "../app-store-screenshots"

# Brand — SAMPLE these from the app icon (a few representative pixels) so the
# frames match it. BG_STOPS is the background gradient, top -> bottom (2 or 3).
BG_STOPS      = [(40, 40, 50), (12, 12, 18)]   # e.g. dark; or 3 stops for a richer ramp
ACCENT        = (255, 200, 60)          # icon's signature color (bullet checks)
HEADLINE_BOLD = None                    # None = white *bold* keywords; or (r,g,b) to tint
SUBTITLE      = (220, 226, 236)         # panel subtitle color
WATERMARK     = (255, 255, 255)         # faint background swirl color

# Hero (screens 1+2). Defaults below are tuned — usually leave the sizes alone.
HERO_SHOT = "main.png"                  # which raw to feature in the spanning hero
HERO_SW   = 1125
HERO_TILT = -20
HERO_PX   = 1050
BULLETS = [                             # exactly 4 short value props
    "Value prop one",
    "Value prop two",
    "Value prop three",
    "Free forever — no catch",
]

PANEL_SW = 1150

# Feature panels (screens 3+):  (label, headline, raw_filename, "low"|"high", subtitle)
#   *asterisks* emphasize a word; "low" = headline top, "high" = headline bottom.
PANELS = [
    ("feature1", "Headline with a *keyword*",  "main.png",   "low",  "Supporting subtitle line"),
    ("feature2", "Another *strong* headline",  "second.png", "high", "Supporting subtitle line"),
    # ...add up to 8 panels (10 screens total incl. the 2 hero screens)
]
