#!/usr/bin/env python3
"""App Store screenshot composer (BolTools-style frames).

You should not need to edit this file. Put your settings in config.py and your
raw simulator screenshots in raw/, then run:  python3 compose.py
Output: 01-hero.png, 02-hero.png, 03-…, … into config.OUT_DIR, each sized
1284x2778 — ready to upload straight to App Store Connect with no resizing.

Layout (1320x2868, the 6.9" / iPhone 17 Pro Max canvas):
  - Screens 1+2 are ONE tilted phone spanning a 2-wide composite, then sliced
    in half — screen 1 = icon + title + bullets + a sliver of the phone,
    screen 2 = the rest of the phone.
  - Screens 3+ alternate "low" (headline on top, phone bleeds off the bottom)
    and "high" (phone bleeds off the top, headline on the bottom). The headline
    + subtitle block is auto-centered in the open space.
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import config as C

W, H = 1320, 2868                         # design canvas (6.9" aspect)

# App Store Connect's iPhone screenshot slot accepts the 6.5" display size.
# We compose on the canvas above, then resize every output to exactly this so
# the PNGs upload STRAIGHT to App Store Connect — no cropping/resizing needed.
# (1320x2868 -> 1284x2778 is a ~0.4% squish, visually imperceptible.)
# If a future app's ASC shows a 6.9"-only slot instead, set this to 1290, 2796.
STORE_W, STORE_H = 1284, 2778

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, C.RAW_DIR)
OUT = os.path.join(HERE, C.OUT_DIR)
os.makedirs(OUT, exist_ok=True)

def save_store(img, path):                # resize to the App-Store-ready size, then save
    img.convert("RGB").resize((STORE_W, STORE_H), Image.LANCZOS).save(path)

def font(sz, bold=True):
    paths = (["/System/Library/Fonts/Supplemental/Arial Bold.ttf"] if bold
             else ["/System/Library/Fonts/Supplemental/Arial.ttf"]) + ["/System/Library/Fonts/Helvetica.ttc"]
    for path in paths:
        try: return ImageFont.truetype(path, sz)
        except Exception: pass
    return ImageFont.load_default()

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
def grad(stops, t):                       # interpolate across 1..N gradient stops
    if len(stops) == 1: return stops[0]
    s = t * (len(stops) - 1); i = min(int(s), len(stops) - 2)
    return lerp(stops[i], stops[i + 1], s - i)

def background(width=W):
    col = Image.new("RGB", (1, 96))
    for y in range(96): col.putpixel((0, y), grad(C.BG_STOPS, y / 95))
    bg = col.resize((width, H), Image.LANCZOS).convert("RGBA")
    wm = Image.new("RGBA", (width, H), (0, 0, 0, 0)); d = ImageDraw.Draw(wm)
    cx = width // 2; wmc = C.WATERMARK
    d.ellipse([cx - 720, H - 1180, cx + 360, H - 100], fill=(*wmc, 14))
    d.ellipse([cx - 470, H - 930, cx + 110, H - 350], fill=(255, 255, 255, 10))
    d.ellipse([width - 360, 180, width + 520, 1060], outline=(*wmc, 28), width=78)
    bg.alpha_composite(wm); return bg

def rounded(img, rad):
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius=rad, fill=255)
    o = img.convert("RGBA"); o.putalpha(m); return o

def device(shot, sw):                     # wrap a screenshot in a grey iPhone bezel
    sh = int(shot.size[1] * sw / shot.size[0])
    screen = rounded(shot.resize((sw, sh), Image.LANCZOS), int(sw * 0.115))
    bez = max(16, sw // 36); bw, bh = sw + bez * 2, sh + bez * 2
    body = rounded(Image.new("RGBA", (bw, bh), (206, 208, 214, 255)), int(sw * 0.115) + bez)
    ImageDraw.Draw(body).rounded_rectangle([3, 3, bw - 4, bh - 4],
        radius=int(sw * 0.115) + bez - 3, outline=(150, 152, 160, 255), width=2)
    body.alpha_composite(screen, (bez, bez)); return body

def shadow(canvas, img, x, y, op=0.42, blur=38, dy=24):
    a = img.split()[3].point(lambda v: int(v * op)); s = Image.new("RGBA", img.size, (0, 0, 0, 0)); s.putalpha(a)
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0)); layer.alpha_composite(s, (x, y + dy))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))

def seg(t):                               # "*word*" → bold/accent; rest = regular
    return [(w.strip("*"), w.startswith("*") and w.endswith("*")) for w in t.split()]

def wrap_lines(d, segs, maxw, rf, bf):
    sp = d.textlength(" ", font=rf); lines, cw = 1, 0
    for word, b in segs:
        ww = d.textlength(word, font=(bf if b else rf)); add = ww + (sp if cw else 0)
        if cw + add <= maxw: cw += add
        else: lines += 1; cw = ww
    return lines

def rich(d, segs, y, maxw, rf, bf, fill=(255, 255, 255, 255), lh=92, bold_fill=None):
    sp = d.textlength(" ", font=rf); lines, cur, cw = [], [], 0
    for word, b in segs:
        ww = d.textlength(word, font=(bf if b else rf)); add = ww + (sp if cur else 0)
        if cw + add <= maxw: cur.append((word, b, ww)); cw += add
        else: lines.append((cur, cw)); cur, cw = [(word, b, ww)], ww
    if cur: lines.append((cur, cw))
    for ln, lw in lines:
        x = (W - lw) / 2
        for word, b, ww in ln:
            d.text((x, y), word, font=(bf if b else rf), fill=(bold_fill if (b and bold_fill) else fill)); x += ww + sp
        y += lh
    return y

def hero(shot_path):
    CW = 2 * W; c = background(CW); d = ImageDraw.Draw(c)
    def ctext(t, y, f, fill):
        w = d.textlength(t, font=f); d.text(((W - w) / 2, y), t, font=f, fill=fill)
    icx = (W - 480) // 2
    ic = rounded(Image.open(os.path.join(HERE, C.ICON)).convert("RGB").resize((480, 480), Image.LANCZOS), 104)
    sa = ic.split()[3].point(lambda v: int(v * 0.5)); sh = Image.new("RGBA", ic.size, (0, 0, 0, 0)); sh.putalpha(sa)
    bl = Image.new("RGBA", (CW, H), (0, 0, 0, 0)); bl.alpha_composite(sh, (icx, 580))
    c.alpha_composite(bl.filter(ImageFilter.GaussianBlur(36))); c.alpha_composite(ic, (icx, 560))
    ctext(C.APP_NAME, 1150, font(C.TITLE_SIZE), (255, 255, 255, 255))
    ctext(C.TAGLINE, 1300, font(56, bold=False), (216, 222, 232, 255))
    def chk(x, y, s=44):
        d.line([(x, y + s * 0.55), (x + s * 0.40, y + s * 0.95), (x + s * 1.05, y + s * 0.06)],
               fill=(*C.ACCENT, 255), width=12, joint="curve")
    bf = font(52, bold=False)
    bw = 92 + max(d.textlength(b, font=bf) for b in C.BULLETS)
    bx = int((W - bw) / 2); by = 1500
    for b in C.BULLETS:
        chk(bx + 4, by + 4); d.text((bx + 92, by), b, font=bf, fill=(238, 242, 248, 255)); by += 104
    ph = device(Image.open(shot_path).convert("RGB"), sw=C.HERO_SW).rotate(C.HERO_TILT, expand=True, resample=Image.BICUBIC)
    px = C.HERO_PX; py = (H - ph.size[1]) // 2
    shadow(c, ph, px, py, blur=42); c.alpha_composite(ph, (px, py))
    save_store(c.crop((0, 0, W, H)), os.path.join(OUT, "01-hero.png"))
    save_store(c.crop((W, 0, CW, H)), os.path.join(OUT, "02-hero.png"))
    print("wrote 01-hero, 02-hero")

def panel(idx, label, headline, shot_path, vpos, sub):
    c = background(); d = ImageDraw.Draw(c)
    hf, bf = font(78, bold=False), font(78, bold=True)
    sf, sbf = font(48, bold=False), font(48, bold=True)
    ph = device(Image.open(shot_path).convert("RGB"), sw=C.PANEL_SW)
    x = (W - ph.size[0]) // 2
    block = wrap_lines(d, seg(headline), W - 130, hf, bf) * 98 + (14 + wrap_lines(d, seg(sub), W - 150, sf, sbf) * 60 if sub else 0)
    if vpos == "low":                     # phone bleeds off the bottom; text centered in top gap
        py = 520; ty = max(120, (py - block) // 2)
    else:                                 # phone bleeds off the top; text centered in bottom gap
        py = (H - 440) - ph.size[1]; pb = py + ph.size[1]; ty = pb + (H - pb - block) // 2
    bold_fill = (*C.HEADLINE_BOLD, 255) if C.HEADLINE_BOLD else None
    ey = rich(d, seg(headline), ty, W - 130, hf, bf, lh=98, bold_fill=bold_fill)
    if sub: rich(d, seg(sub), ey + 14, W - 150, sf, sbf, fill=(*C.SUBTITLE, 255), lh=60)
    shadow(c, ph, x, py); c.alpha_composite(ph, (x, py))
    out = f"{idx:02d}-{label}.png"; save_store(c, os.path.join(OUT, out)); print("wrote", out)

if __name__ == "__main__":
    hero(os.path.join(RAW, C.HERO_SHOT))
    for i, (label, headline, shot, vpos, sub) in enumerate(C.PANELS, start=3):
        panel(i, label, headline, os.path.join(RAW, shot), vpos, sub)
    print("done →", os.path.relpath(OUT, HERE))
