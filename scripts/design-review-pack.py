"""Make review-sized copies of design screenshots: the first screen at full size and the whole page scaled down.

Usage: python -I scripts/design-review-pack.py <shots_dir> <out_dir> <name> [<name> ...]
For each name it reads <name>-desktop.png and <name>-phone.png and writes:
  <name>-desktop-fold.png (1440x900), <name>-desktop-full.jpg (900 px wide),
  <name>-phone-fold.png (first 844 css px), <name>-phone-full.jpg (520 px wide).
"""
import os
import sys

from PIL import Image

src, out, *names = sys.argv[1:]
os.makedirs(out, exist_ok=True)
for n in names:
    d = Image.open(os.path.join(src, f"{n}-desktop.png")).convert("RGB")
    d.crop((0, 0, d.width, min(d.height, 900))).save(os.path.join(out, f"{n}-desktop-fold.png"))
    s = 900 / d.width
    d.resize((900, int(d.height * s)), Image.LANCZOS).save(os.path.join(out, f"{n}-desktop-full.jpg"), quality=82)
    p = Image.open(os.path.join(src, f"{n}-phone.png")).convert("RGB")
    p.crop((0, 0, p.width, min(p.height, 844 * 2))).save(os.path.join(out, f"{n}-phone-fold.png"))
    s = 520 / p.width
    p.resize((520, int(p.height * s)), Image.LANCZOS).save(os.path.join(out, f"{n}-phone-full.jpg"), quality=82)
    print(n, d.size, p.size)
