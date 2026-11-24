"""
Builds apps/gridrinse/src/content/templates.data.json from the digital-products folders (listing.json +
_build.json): name, price, feature bullets, the sheets inside, quick-start steps, tips and screenshot captions.
Only public marketing facts are copied; never the paid files.

    python -I scripts/templates/extract-template-data.py <products-dir> [slug ...]

Existing entries for other slugs are kept, so a new template can be added on its own.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps" / "gridrinse" / "src" / "content" / "templates.data.json"


def bullets(description: str, heading: str) -> list[str]:
    lines = description.splitlines()
    out, on = [], False
    for line in lines:
        t = line.strip()
        if t.upper() == heading:
            on = True
            continue
        if on:
            if t.startswith("•"):
                out.append(t.lstrip("•").strip())
            elif t == "" and out:
                break
            elif t and not t.startswith("•") and out:
                break
    return out


def main() -> None:
    products = Path(sys.argv[1])
    slugs = sys.argv[2:] or sorted(p.name for p in products.iterdir() if (p / "_build.json").exists())
    data = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    for slug in slugs:
        build = json.loads((products / slug / "_build.json").read_text(encoding="utf-8"))
        listing = json.loads((products / slug / "listing.json").read_text(encoding="utf-8"))
        price = listing.get("price_usd") or 9.99
        features = bullets(listing["description"], "FEATURES")
        if len(features) < 3:
            raise SystemExit(f"{slug}: could not read the FEATURES bullets")
        shots = build["shots"][:3]
        data[slug] = {
            "name": build["name"],
            "priceCents": int(round(float(price) * 100)),
            "etsyTitle": listing["title"],
            "intro": listing["description"].split("\n\n")[0].strip(),
            "features": features,
            "sheets": [{"name": n, "what": w} for n, w in build["guide"]["sheets"]],
            "steps": build["guide"]["steps"],
            "tips": build["guide"]["tips"],
            "shots": shots,
            "tags": listing.get("tags", []),
        }
    OUT.write_text(json.dumps(dict(sorted(data.items())), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(data)} templates")


if __name__ == "__main__":
    main()
