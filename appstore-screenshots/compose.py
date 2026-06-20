#!/usr/bin/env python3
"""BolTools-exact layout. Screens 1+2 = ONE phone spanning a 2-wide composite
that's sliced in half (screen 1: logo+headline + sliver of phone; screen 2: the
rest). Screens 3-9 = zig-zag full phones (bottom/top/bottom...). 1320x2868 each."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1320, 2868
BG_STOPS = [(196, 40, 82), (128, 50, 120), (78, 58, 142)]  # icon gradient: rose → purple → violet
DST = "/Users/mhsu/Desktop/bavarian-translator/appstore-screenshots"
ZW = 1346  # +30% again (bleeds off edges)

def font(sz, bold=True):
    for p in (["/System/Library/Fonts/Supplemental/Arial Bold.ttf"] if bold
              else ["/System/Library/Fonts/Supplemental/Arial.ttf"]) + ["/System/Library/Fonts/Helvetica.ttc"]:
        try: return ImageFont.truetype(p, sz)
        except Exception: pass
    return ImageFont.load_default()

def background(width=W):
    g = 96; b = Image.new("RGB", (1, g)); px = b.load()
    for y in range(g):
        t = y / (g - 1)
        (a, bb, tt) = (BG_STOPS[0], BG_STOPS[1], t / 0.5) if t < 0.5 else (BG_STOPS[1], BG_STOPS[2], (t - 0.5) / 0.5)
        px[0, y] = tuple(int(a[i] + (bb[i] - a[i]) * tt) for i in range(3))
    bg = b.resize((width, H), Image.LANCZOS).convert("RGBA")
    wm = Image.new("RGBA", (width, H), (0, 0, 0, 0)); d = ImageDraw.Draw(wm)
    # bold BolTools-style white swirl circles (low opacity)
    cx = width // 2
    d.ellipse([cx - 720, H - 1180, cx + 360, H - 100], fill=(255, 255, 255, 20))
    d.ellipse([cx - 470, H - 930, cx + 110, H - 350], fill=(255, 255, 255, 26))
    d.ellipse([width - 360, 180, width + 520, 1060], outline=(255, 255, 255, 30), width=78)
    bg.alpha_composite(wm); return bg

def rounded(img, rad):
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.size[0]-1, img.size[1]-1], radius=rad, fill=255)
    o = img.convert("RGBA"); o.putalpha(m); return o

def device(shot, sw):
    sh = int(shot.size[1] * sw / shot.size[0])
    screen = rounded(shot.resize((sw, sh), Image.LANCZOS), int(sw*0.115))
    bez = max(16, sw // 36); bw, bh = sw + bez * 2, sh + bez * 2
    body = rounded(Image.new("RGBA", (bw, bh), (206, 208, 214, 255)), int(sw*0.115) + bez)
    ImageDraw.Draw(body).rounded_rectangle([3, 3, bw-4, bh-4], radius=int(sw*0.115)+bez-3, outline=(150, 152, 160, 255), width=2)
    body.alpha_composite(screen, (bez, bez)); return body

def shadow(canvas, img, x, y, op=0.40, blur=36, dy=24):
    a = img.split()[3].point(lambda v: int(v * op)); s = Image.new("RGBA", img.size, (0,0,0,0)); s.putalpha(a)
    layer = Image.new("RGBA", canvas.size, (0,0,0,0)); layer.alpha_composite(s, (x, y + dy))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))

def seg(t): return [(w.strip("*"), w.startswith("*") and w.endswith("*")) for w in t.split()]

def wrap_lines(d, segments, maxw, regf, boldf):
    sp = d.textlength(" ", font=regf); lines = 1; curw = 0
    for word, bold in segments:
        f = boldf if bold else regf; ww = d.textlength(word, font=f); add = ww + (sp if curw else 0)
        if curw + add <= maxw: curw += add
        else: lines += 1; curw = ww
    return lines

def rich(d, segments, y, maxw, regf, boldf, fill=(255,255,255,255), lh=92, left=None):
    sp = d.textlength(" ", font=regf); lines, cur, curw = [], [], 0
    for word, bold in segments:
        f = boldf if bold else regf; ww = d.textlength(word, font=f); add = ww + (sp if cur else 0)
        if curw + add <= maxw: cur.append((word, bold, ww)); curw += add
        else: lines.append((cur, curw)); cur, curw = [(word, bold, ww)], ww
    if cur: lines.append((cur, curw))
    cw = W if left is None else None
    for ln, lw in lines:
        x = (cw - lw) / 2 if left is None else left
        for word, bold, ww in ln:
            d.text((x, y), word, font=(boldf if bold else regf), fill=fill); x += ww + sp
        y += lh
    return y

# ── Screens 1 + 2: one phone spanning a 2-wide composite, then sliced ─────────
def hero_pair(shot):
    CW = 2 * W
    c = background(CW); d = ImageDraw.Draw(c)
    def ctext(t, y, f, fill):
        w = d.textlength(t, font=f); d.text(((W - w) / 2, y), t, font=f, fill=fill)
    # BIG app icon — centered horizontally, sitting toward the middle
    icx = (W - 480) // 2
    ic = rounded(Image.open(f"{DST}/../assets/icon.png").convert("RGB").resize((480, 480), Image.LANCZOS), 104)
    sa = ic.split()[3].point(lambda v: int(v * 0.42)); sh = Image.new("RGBA", ic.size, (0,0,0,0)); sh.putalpha(sa)
    bl = Image.new("RGBA", (CW, H), (0,0,0,0)); bl.alpha_composite(sh, (icx, 560 + 20))
    c.alpha_composite(bl.filter(ImageFilter.GaussianBlur(36))); c.alpha_composite(ic, (icx, 560))
    # title + tagline — centered, moved down toward the vertical center
    ctext("BavarianTranslator", 1150, font(110), (255, 255, 255, 255))
    ctext("Real-time German ↔ English", 1305, font(58, bold=False), (255, 255, 255, 235))
    # value-prop bullets, centered as a block (hand-drawn green check — Arial has no ✓)
    def draw_check(x, y, s=44, color=(120, 228, 158, 255)):
        d.line([(x, y + s*0.55), (x + s*0.40, y + s*0.95), (x + s*1.05, y + s*0.06)],
               fill=color, width=11, joint="curve")
    bullets = ["Two-way translation, spoken aloud", "Understands real Bavarian dialect",
               "Slow, clear voice for Oma & Opa", "Free · no account · no ads"]
    bfont = font(52, bold=False)
    bw = 92 + max(d.textlength(b, font=bfont) for b in bullets)
    bx = int((W - bw) / 2); by = 1500
    for b in bullets:
        draw_check(bx + 4, by + 4)
        d.text((bx + 92, by), b, font=bfont, fill=(255, 255, 255, 242))
        by += 104
    # phone bridging the seam — MORE tilted so screen 1 shows more phone edge
    ph = device(Image.open(shot).convert("RGB"), sw=1125).rotate(-20, expand=True, resample=Image.BICUBIC)
    px = 1050; py = (H - ph.size[1]) // 2
    shadow(c, ph, px, py, blur=42)
    c.alpha_composite(ph, (px, py))
    c.crop((0, 0, W, H)).convert("RGB").save(f"{DST}/z-1-hero.png")
    c.crop((W, 0, CW, H)).convert("RGB").save(f"{DST}/z-2-hero.png")
    print("wrote z-1-hero, z-2-hero (spanning pair)")

# ── Screens 3-9: zig-zag full phones ──────────────────────────────────────────
def panel(out, headline, shot, vpos, sub="", sw=ZW, tilt=0):
    c = background(); d = ImageDraw.Draw(c)
    hf, bf = font(78, bold=False), font(78, bold=True)
    sf, sbf = font(48, bold=False), font(48, bold=True)
    ph = device(Image.open(shot).convert("RGB"), sw=sw)
    if tilt:
        ph = ph.rotate(tilt, expand=True, resample=Image.BICUBIC)
    x = (W - ph.size[0]) // 2
    # measure the headline + subtitle block, then center it in the open space
    hlines = wrap_lines(d, seg(headline), W - 130, hf, bf)
    slines = wrap_lines(d, seg(sub), W - 150, sf, sbf) if sub else 0
    block = hlines * 98 + (14 + slines * 60 if sub else 0)
    if vpos == "low":      # phone bleeds off the bottom; text centered in the top gap
        py = 520
        ty = max(120, (py - block) // 2)
    else:                   # phone bleeds off the top; text centered in the bottom gap
        py = (H - 440) - ph.size[1]
        pb = py + ph.size[1]
        ty = pb + (H - pb - block) // 2
    ey = rich(d, seg(headline), ty, W - 130, hf, bf, lh=98)
    if sub: rich(d, seg(sub), ey + 14, W - 150, sf, sbf, fill=(228, 236, 255, 235), lh=60)
    shadow(c, ph, x, py); c.alpha_composite(ph, (x, py))
    c.convert("RGB").save(f"{DST}/{out}"); print("wrote", out)

hero_pair(f"{DST}/01-conversation.png")
panel("z-3-dialect.png",   "Understands *Bavarian* *dialect*",    f"{DST}/01-conversation.png", "low",
      sub="Boarisch — not just standard German", sw=1150)
panel("z-4-facetoface.png","*Face-to-face* mode for Oma",         f"{DST}/02-facetoface.png",   "high",
      sub="One phone, both sides of the table", sw=1150)
panel("z-5-live.png",      "*Live* — translates as you speak",    f"{DST}/03-live.png",         "low",
      sub="Real-time captions, nothing to tap", sw=1150)
panel("z-6-handsfree.png", "Completely *hands-free*",             f"{DST}/04-auto.png",         "high",
      sub="Auto mode listens and replies on its own", sw=1150)
panel("z-7-engines.png",   "Powered by *top* *AI* — 100% *free*", f"{DST}/05-engines.png",      "low",
      sub="Gemini, Llama & Voxtral — built right in", sw=1150)
panel("z-8-failover.png",  "*Never* *gets* *stuck*",              f"{DST}/06-failover.png",     "high",
      sub="Auto-switches engines the instant one is busy", sw=1150)
panel("z-9-free.png",      "*Free.* No account. Just talk.",      f"{DST}/04-auto.png",         "low",
      sub="No sign-up · no ads · no paywall", sw=1150)
print("done")
