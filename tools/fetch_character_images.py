"""Fetch local character portraits for the selector from the credited reference pages."""

import json
from pathlib import Path

import requests


PATCHWIKI = "https://patchwiki.biligame.com/images/nightreign/"
IMAGES = {
    "追跡者": ("追踪者", "wylder", PATCHWIKI + "0/09/fuj0p06du3ky98gzs1eaxwkeaihd8xv.png"),
    "守護者": ("守护者", "guardian", PATCHWIKI + "f/fc/fm3t244wq33xo3seefyeedi454u2qvh.png"),
    "鉄の目": ("铁之眼", "iron-eye", PATCHWIKI + "4/47/bqrrwy8y24t895ykql09dw1xk5i5gxs.png"),
    "レディ": ("女爵", "duchess", PATCHWIKI + "b/b8/083qtfc848k4kgzx98jkdkprc9t9isx.png"),
    "無頼漢": ("无赖", "raider", PATCHWIKI + "d/d4/cc23ob3fo8p7ai2ig2ric9mf5xl4yu8.png"),
    "復讐者": ("复仇者", "revenant", PATCHWIKI + "c/c6/i0u10xs3jp5hsw21bajcjrc1fasveib.png"),
    "隠者": ("隐士", "recluse", "https://p325k7wa.twic.pics/high/elden-ring/elden-ring-nightreign/04-character-gallery/01-thumbnail/V2/thumbnail-RECLUSE-v2.png?twic=v1%2Fresize%3D-x560%2Fstep%3D10%2Fquality%3D80"),
    "執行者": ("执行者", "executor", PATCHWIKI + "a/ae/2ddfcs7rkv9m9ti86wzdki2yem2lth0.png"),
    "学者": ("学者", "scholar", PATCHWIKI + "4/4a/lj334op296pmj0gut5vtrdew07mquif.png"),
    "葬儀屋": ("送葬者", "undertaker", PATCHWIKI + "2/24/cxcg7wv2tgkt5lp0gesim49r04kvrs5.png"),
}

OUTPUT = Path(__file__).resolve().parents[1] / "dist" / "character-images"
OUTPUT.mkdir(parents=True, exist_ok=True)
session = requests.Session()
session.headers["User-Agent"] = "Mozilla/5.0 (compatible; NightreignAtlas/1.0)"
catalog = {}

for key, (name, slug, url) in IMAGES.items():
    image = session.get(url, timeout=30)
    image.raise_for_status()
    path = OUTPUT / f"{slug}.png"
    path.write_bytes(image.content)
    catalog[key] = {"name": name, "image": f"./character-images/{slug}.png", "source": url}

(OUTPUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Downloaded {len(catalog)} portraits")
