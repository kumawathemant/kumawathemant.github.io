#!/usr/bin/env python3
"""Generate the social preview card (static/assets/img/og.png) and apple-touch-icon.png (dev-only, needs Pillow).

    python scripts/make_social_card.py

Re-run after changing your title in content/site.yml or your portrait. Fonts are downloaded once
from the Google Fonts repository into .cache/fonts/ (not committed).
"""
from __future__ import annotations

import math
import random
import urllib.request
from pathlib import Path

import yaml
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "fonts"
FONTS = {
    "serif": "https://github.com/google/fonts/raw/main/ofl/instrumentserif/InstrumentSerif-Regular.ttf",
    "serif-italic": "https://github.com/google/fonts/raw/main/ofl/instrumentserif/InstrumentSerif-Italic.ttf",
    "sans": "https://github.com/google/fonts/raw/main/ofl/geist/Geist%5Bwght%5D.ttf",
    "mono": "https://github.com/google/fonts/raw/main/ofl/geistmono/GeistMono%5Bwght%5D.ttf",
}
BG = (7, 9, 13)
MINT, SKY, INDIGO, ROSE, AMBER = (110, 231, 200), (125, 211, 252), (165, 180, 252), (249, 168, 212), (251, 191, 119)


def font(name: str, size: int, weight: int | None = None) -> ImageFont.FreeTypeFont:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{name}.ttf"
    if not path.exists():
        print(f"downloading {name} font…")
        urllib.request.urlretrieve(FONTS[name], path)
    f = ImageFont.truetype(str(path), size)
    if weight:
        try:
            f.set_variation_by_axes([weight])
        except Exception:
            pass
    return f


def gradient(size, stops) -> Image.Image:
    w, h = size
    g = Image.new("RGB", (w, 1))
    px = g.load()
    for x in range(w):
        t = x / max(1, w - 1) * (len(stops) - 1)
        i = min(int(t), len(stops) - 2)
        f = t - i
        a, b = stops[i], stops[i + 1]
        px[x, 0] = tuple(round(a[k] + (b[k] - a[k]) * f) for k in range(3))
    return g.resize((w, h))


def flow_layer(w: int, h: int) -> Image.Image:
    """Streamlines of a smooth, swirling vector field — echoes the site's hero animation."""
    rnd = random.Random(7)
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    def field(x, y):
        a = math.sin(x * 0.0062 + math.cos(y * 0.0041) * 1.7) + math.cos(y * 0.0049 - 0.6)
        b = math.cos(x * 0.0047 - 1.1) - math.sin(y * 0.0071 + math.sin(x * 0.0033) * 1.4)
        return a, b

    for _ in range(900):
        x, y = rnd.uniform(w * 0.25, w), rnd.uniform(0, h)
        col = (MINT, INDIGO, ROSE)[0 if y < h * 0.36 else 1 if y < h * 0.7 else 2]
        pts = []
        for _ in range(26):
            a, b = field(x, y)
            m = math.hypot(a, b) + 1e-6
            x, y = x + a / m * 4.2, y + b / m * 4.2
            pts.append((x, y))
        for k in range(1, len(pts)):
            alpha = int(10 + 75 * (k / len(pts)) ** 2)
            d.line([pts[k - 1], pts[k]], fill=col + (alpha,), width=1)
    return layer


def rounded(im: Image.Image, r: int) -> Image.Image:
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.width - 1, im.height - 1], r, fill=255)
    out = im.convert("RGBA")
    out.putalpha(mask)
    return out


def make_og(site: dict) -> None:
    W, H = 1200, 630
    card = Image.new("RGB", (W, H), BG)
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([620, -260, 1420, 540], fill=MINT + (34,))
    gd.ellipse([760, 160, 1500, 900], fill=INDIGO + (30,))
    card.paste(glow.filter(ImageFilter.GaussianBlur(120)), (0, 0), glow.filter(ImageFilter.GaussianBlur(120)))
    fl = flow_layer(W, H)
    card.paste(fl, (0, 0), fl)

    # portrait card on the right
    portrait = Image.open(ROOT / "static/assets/img/portrait.jpg").convert("RGB").resize((340, 425), Image.LANCZOS)
    frame = Image.new("RGBA", (344, 429), (0, 0, 0, 0))
    border = rounded(gradient((344, 429), [MINT, (40, 46, 58), INDIGO]), 30)
    frame.paste(border, (0, 0), border)
    pr = rounded(portrait, 28)
    frame.paste(pr, (2, 2), pr)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([800, 140, 1144, 569], 30, fill=(0, 0, 0, 170))
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    card.paste(shadow, (0, 0), shadow)
    card.paste(frame, (790, 100), frame)

    d = ImageDraw.Draw(card)
    d.rounded_rectangle([72, 74, 72 + 420, 74 + 40], 20, outline=(60, 66, 78), width=1, fill=(16, 20, 27))
    d.ellipse([88, 89, 98, 99], fill=MINT)
    d.text((108, 94), f"Now · {site['now']['role']} @ {site['now']['org']}", font=font("sans", 18, 500), fill=(190, 198, 210), anchor="lm")

    first, last = site["name"].split()[0], " ".join(site["name"].split()[1:])
    d.text((66, 150), first, font=font("serif", 128), fill=(238, 241, 246))
    italic = font("serif-italic", 128)
    box = d.textbbox((0, 0), last, font=italic)
    tw, th = box[2] + 12, box[3] + 30
    mask = Image.new("L", (tw, th), 0)
    ImageDraw.Draw(mask).text((0, 0), last, font=italic, fill=255)
    card.paste(gradient((tw, th), [MINT, SKY, INDIGO, ROSE]), (66, 262), mask)

    d.text((72, 440), "Robot learning · multi-agent forecasting · efficient perception", font=font("sans", 25, 400), fill=(182, 191, 203))
    d.text((72, 478), "Ph.D., Georgia Tech  ·  CoRL · RA-L · AAMAS · L4DC", font=font("mono", 19, 450), fill=(125, 134, 150))
    d.text((72, 556), site["url"].replace("https://", "").replace("www.", ""), font=font("mono", 20, 500), fill=(238, 241, 246))
    out = ROOT / "static/assets/img/og.png"
    card.save(out, optimize=True)
    print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")


def make_touch_icon() -> None:
    S = 180
    im = Image.new("RGB", (S, S), (11, 15, 21))
    k = S / 64
    big = Image.new("RGBA", (S * 4, S * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    K = k * 4
    ring = Image.new("RGBA", big.size, (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.ellipse([(32 - 22) * K, (32 - 9.5) * K, (32 + 22) * K, (32 + 9.5) * K], outline=(255, 255, 255, 255), width=int(3.4 * K))
    ring = ring.rotate(32, center=(32 * K, 32 * K), resample=Image.BICUBIC)
    grad = gradient(big.size, [MINT, INDIGO]).convert("RGBA")
    big.paste(grad, (0, 0), ring)
    d.ellipse([(32 - 6) * K, (32 - 6) * K, (32 + 6) * K, (32 + 6) * K], fill=MINT + (255,))
    d.ellipse([(50.5 - 4) * K, (20.5 - 4) * K, (50.5 + 4) * K, (20.5 + 4) * K], fill=AMBER + (255,))
    small = big.resize((S, S), Image.LANCZOS)
    im.paste(small, (0, 0), small)
    out = ROOT / "static/apple-touch-icon.png"
    im.save(out, optimize=True)
    print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    with open(ROOT / "content/site.yml", encoding="utf-8") as f:
        make_og(yaml.safe_load(f))
    make_touch_icon()
