"""
Marketing images for /templates pages: converts a template's listing images (digital-products layout,
<products-dir>/<slug>/images/0N-*.jpg) to WebP under apps/gridrinse/public/templates/<slug>/.
Only marketing images are copied; never the paid .xlsx/.pdf files.

    python -I scripts/templates/make-template-images.py <products-dir> [slug ...]

Writes, per template:
  hero.webp (1200x900) and card.webp (600x450)     from 01-hero.jpg      (AI background, real screenshot on screen)
  shot-1..3.webp (1200x900)                          from 02/03/04-*.jpg   (real screenshots of the file)
  lifestyle.webp (1200x900)                          from 07-lifestyle.jpg (AI background, real screenshot on screen)
"""
import json
import os
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps" / "gridrinse" / "public" / "templates"


def save(src: Path, dst: Path, size: tuple[int, int], quality: int = 80) -> None:
    im = Image.open(src).convert("RGB")
    im = im.resize(size, Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "WEBP", quality=quality, method=6)


def main() -> None:
    products = Path(sys.argv[1])
    slugs = sys.argv[2:] or sorted(p.name for p in products.iterdir() if (p / "_build.json").exists())
    for slug in slugs:
        imgs = sorted((products / slug / "images").glob("0*.jpg"))
        by_n = {p.name[:2]: p for p in imgs}
        # 06-whats-inside is skipped on purpose: it describes the Etsy delivery ("download from your Etsy purchases").
        need = ["01", "02", "03", "04", "07"]
        missing = [n for n in need if n not in by_n]
        if missing:
            raise SystemExit(f"{slug}: missing images {missing}")
        out = OUT / slug
        save(by_n["01"], out / "hero.webp", (1200, 900))
        save(by_n["01"], out / "card.webp", (600, 450), 78)
        for i, n in enumerate(["02", "03", "04"], 1):
            save(by_n[n], out / f"shot-{i}.webp", (1200, 900))
        save(by_n["07"], out / "lifestyle.webp", (1200, 900))
        total = sum(f.stat().st_size for f in out.glob("*.webp"))
        print(f"{slug}: {len(list(out.glob('*.webp')))} images, {total // 1024} KB")


if __name__ == "__main__":
    main()
