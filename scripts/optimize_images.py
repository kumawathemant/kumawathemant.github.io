#!/usr/bin/env python3
"""Turn raw figures / photos into web-ready WebP variants (dev-only, needs Pillow).

Examples
--------
Paper figure  -> static/assets/fig/<name>-640.webp and <name>-1600.webp
    python scripts/optimize_images.py figure ~/Desktop/teaser.png robokoop

Portrait      -> static/assets/img/portrait-{480,800}.webp (+ portrait.jpg for social cards)
    python scripts/optimize_images.py portrait photo.png --box 260 350 1540 1950

Then reference the figure in content/publications.yml with `figure: <name>`.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FIG_DIR = ROOT / "static" / "assets" / "fig"
IMG_DIR = ROOT / "static" / "assets" / "img"


def flatten(im: Image.Image, bg=(255, 255, 255)) -> Image.Image:
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        base = Image.new("RGB", im.size, bg)
        base.paste(im, mask=im.split()[-1])
        return base
    return im.convert("RGB")


def save_width(im: Image.Image, width: int, path: Path, quality: int = 84) -> None:
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=quality, method=6)
    print(f"  {path.relative_to(ROOT)}  {im.width}x{im.height}  {path.stat().st_size // 1024} KB")


def cmd_figure(src: Path, name: str) -> None:
    im = flatten(Image.open(src))
    print(f"{src.name}: {im.width}x{im.height}")
    save_width(im, 640, FIG_DIR / f"{name}-640.webp")
    save_width(im, 1600, FIG_DIR / f"{name}-1600.webp", quality=86)


def cmd_portrait(src: Path, box: list[int] | None) -> None:
    im = flatten(Image.open(src))
    if box:
        im = im.crop(tuple(box))
    print(f"{src.name}: cropped to {im.width}x{im.height}")
    save_width(im, 480, IMG_DIR / "portrait-480.webp", quality=82)
    save_width(im, 800, IMG_DIR / "portrait-800.webp", quality=84)
    jpg = im.resize((800, round(im.height * 800 / im.width)), Image.LANCZOS)
    jpg.save(IMG_DIR / "portrait.jpg", "JPEG", quality=86, optimize=True, progressive=True)
    print(f"  static/assets/img/portrait.jpg  {jpg.width}x{jpg.height}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("figure", help="paper figure -> 640w + 1600w WebP")
    f.add_argument("src", type=Path)
    f.add_argument("name")
    p = sub.add_parser("portrait", help="profile photo -> portrait WebP/JPEG")
    p.add_argument("src", type=Path)
    p.add_argument("--box", type=int, nargs=4, metavar=("X0", "Y0", "X1", "Y1"))
    args = ap.parse_args()
    if args.cmd == "figure":
        cmd_figure(args.src.expanduser(), args.name)
    else:
        cmd_portrait(args.src.expanduser(), args.box)


if __name__ == "__main__":
    main()
